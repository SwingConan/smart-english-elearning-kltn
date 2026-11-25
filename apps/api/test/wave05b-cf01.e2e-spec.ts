import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { setupW05B } from './wave05b.fixture';
const load = createRequire(__filename),
  base = '/api/v2/consultations/';
describe('DEC061 CF01 exact state contract and independent review outbox', () => {
  let x: Awaited<ReturnType<typeof setupW05B>>,
    book: string,
    profile: string,
    secondary: Awaited<ReturnType<typeof x.login>>,
    unrelated: typeof secondary,
    profileGrant: string;
  const reason = 'Independent synthetic CF01 decision with evidence';
  const record = (kind: string, data: unknown) =>
    appendFileSync(
      join(process.env.W05B_CF_EVIDENCE_ROOT!, 'cf-business.jsonl'),
      JSON.stringify({ kind, data, utc: new Date().toISOString() }) + '\n',
    );
  const notices = async (a: typeof secondary) =>
    (await a.get(base + 'notifications').expect(200)).body as {
      id: string;
      objectId: string;
      kind: string;
      reason: string;
    }[];
  const row = (id = book) => x.d.prisma.w05BBooking.findUniqueOrThrow({ where: { id } });
  const slots = async (a = x.hv) =>
    (
      await a
        .get(base + 'slots')
        .query({ teacherId: x.f.teacher.id })
        .expect(200)
    ).body as { startsAt: string }[];
  beforeAll(async () => {
    x = await setupW05B();
    const hash = (await x.d.prisma.user.findUniqueOrThrow({ where: { id: x.f.academic.id } }))
      .passwordHash;
    const reviewer = await x.d.prisma.user.create({
        data: {
          email: randomUUID() + '@example.invalid',
          fullName: 'CF01 scoped second reviewer',
          role: 'ACADEMIC_MANAGER',
          passwordHash: hash,
        },
      }),
      outsider = await x.d.prisma.user.create({
        data: {
          email: randomUUID() + '@example.invalid',
          fullName: 'CF01 unrelated reviewer',
          role: 'ACADEMIC_MANAGER',
          passwordHash: hash,
        },
      });
    for (const capability of [
      'consultation.profile.approve',
      'consultation.link.approve',
      'consultation.booking.review',
    ]) {
      const g = await x.qt
        .post('/api/authority/grants')
        .send({
          userId: reviewer.id,
          capability,
          scopeType: 'TEACHER',
          scopeId: x.f.teacher.id,
          effectiveAt: new Date(Date.now() - 1000).toISOString(),
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
          reason,
        })
        .expect(201);
      await x.checker
        .post('/api/authority/grants/' + g.body.id + '/approve')
        .send()
        .expect(201);
      if (capability === 'consultation.profile.approve') profileGrant = g.body.id;
    }
    secondary = await x.login(reviewer);
    unrelated = await x.login(outsider);
    for (let weekday = 0; weekday < 7; weekday++)
      await x.command(x.gv, 'AVAILABILITY_ADD', {
        kind: 'WEEKLY',
        weekday,
        startMinute: 0,
        endMinute: 1440,
        reason,
      });
  }, 60000);
  afterAll(async () => {
    if (x) await x.d.app.close();
  });
  test('pending profile routes versioned generic notices exactly once to both scoped independent HVU', async () => {
    const key = randomUUID(),
      payload = {
        key,
        op: 'PROFILE_SAVE',
        displayName: 'CF01 giáo viên tư vấn',
        bio: 'PRIVATE_DRAFT_BIO_Only_author_and_scoped_reviewer',
        specialties: 'TOEIC',
      };
    const a = await x.gv
      .post(base + 'commands')
      .send(payload)
      .expect(201);
    profile = a.body.id;
    await x.gv
      .post(base + 'commands')
      .send(payload)
      .expect(201);
    await x.d.prisma.$queryRaw`SELECT w05b_sweep()`;
    await x.d.prisma.$queryRaw`SELECT w05b_sweep()`;
    for (const agent of [x.hvu, secondary]) {
      const n = (await notices(agent)).filter(
        (n) => n.objectId === profile && n.kind === 'REVIEW_PROFILE_V1',
      );
      expect(n).toHaveLength(1);
      expect(JSON.stringify(n)).not.toContain('PRIVATE_DRAFT_BIO');
    }
    for (const agent of [unrelated, x.hv, x.other, x.gv])
      expect((await notices(agent)).some((n) => n.kind === 'REVIEW_PROFILE_V1')).toBe(false);
    const events = await x.d.prisma.w05BEvent.findMany({
      where: { objectId: profile, kind: 'REVIEW_PROFILE_V1' },
    });
    expect(events).toHaveLength(1);
    expect(await x.d.prisma.w05BOutbox.count({ where: { eventId: events[0].id } })).toBe(2);
    record('profile-recipient-dedup', events);
  });
  test('revocation and superseded profile hide old notices without rewriting outbox/audit', async () => {
    const before = await x.d.prisma.w05BOutbox.count();
    const revoked = await x.qt
      .post('/api/authority/grants/' + profileGrant + '/revoke')
      .send({ reason })
      .expect(201);
    expect(revoked.body.revokedAt).toBeTruthy();
    const grant = await x.d.prisma.permissionGrant.findUniqueOrThrow({
      where: { id: profileGrant },
    });
    secondary = await x.login(
      await x.d.prisma.user.findUniqueOrThrow({ where: { id: grant.userId } }),
    );
    expect((await notices(secondary)).some((n) => n.objectId === profile)).toBe(false);
    expect(await x.d.prisma.w05BOutbox.count()).toBe(before);
    const fresh = await x.command(x.gv, 'PROFILE_SAVE', {
      displayName: 'CF01 giáo viên đã duyệt',
      bio: 'Approved version must remain an immutable booking snapshot.',
      specialties: 'TOEIC',
    });
    expect((await notices(x.hvu)).some((n) => n.objectId === profile)).toBe(false);
    profile = fresh.id;
    await x.command(x.hvu, 'PROFILE_APPROVE', { id: profile, reason });
    expect((await notices(x.hvu)).some((n) => n.objectId === profile)).toBe(false);
  });
  test('exact HOLD RESCHEDULE denial preserves original hold, creates no pending/receipt/event', async () => {
    const s = await slots(),
      h = await x.command(x.hv, 'HOLD', { teacherId: x.f.teacher.id, startsAt: s[10].startsAt }),
      before = await row(h.id),
      key = randomUUID(),
      eventCount = await x.d.prisma.w05BEvent.count();
    book = h.id;
    await x.hv
      .post(base + 'commands')
      .send({ key, op: 'RESCHEDULE', id: h.id, version: 0, startsAt: s[20].startsAt, reason })
      .expect(409);
    expect(await row()).toEqual(before);
    expect(await x.d.prisma.w05BBooking.count({ where: { replacesId: h.id } })).toBe(0);
    expect(
      await x.d.prisma.w05BBooking.count({
        where: { learnerId: x.free[0].id, state: 'PENDING_GV' },
      }),
    ).toBe(0);
    expect(await x.d.prisma.w05BCommand.count({ where: { actorId: x.free[0].id, key } })).toBe(0);
    expect(await x.d.prisma.w05BEvent.count()).toBe(eventCount);
    record('exact-illegal-transition-denied', { hold: h.id, before, after: await row() });
  });
  test('table guard also rejects direct HOLD supersession and missing SUBMIT provenance', async () => {
    await expect(
      x.d.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT set_config('app.w05b_command','DEC060',true)`;
        await tx.$executeRaw`UPDATE w05b_bookings SET state='SUPERSEDED',"expiresAt"=NULL,version=version+1 WHERE id=${book}::uuid`;
      }),
    ).rejects.toThrow(/W05B_HOLD_TRANSITION_DENIED/);
    await expect(
      x.d.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT set_config('app.w05b_command','DEC060',true),set_config('app.w05b_op','',true)`;
        await tx.$executeRaw`UPDATE w05b_bookings SET state='PENDING_GV',topic='Valid-looking text cannot bypass SUBMIT',"expiresAt"=clock_timestamp()+interval '12 hours',version=version+1 WHERE id=${book}::uuid`;
      }),
    ).rejects.toThrow(/W05B_VALID_SUBMISSION_REQUIRED/);
    expect((await row()).state).toBe('HOLD');
  });
  test('valid SUBMIT required topic, idempotent receipt and genuine server12h deadline', async () => {
    for (const topic of ['', 'short', 'x'.repeat(1001)])
      await x.command(x.hv, 'SUBMIT', { id: book, topic }, topic.length > 1000 ? 400 : 409);
    const key = randomUUID(),
      p = {
        key,
        op: 'SUBMIT',
        id: book,
        topic: 'Valid submitted consultation topic for real pending lifecycle',
      };
    await x.hv
      .post(base + 'commands')
      .send(p)
      .expect(201);
    await x.hv
      .post(base + 'commands')
      .send(p)
      .expect(201);
    const r = await row();
    expect(r.state).toBe('PENDING_GV');
    expect(r.topic.length).toBeGreaterThanOrEqual(10);
    expect(await x.d.prisma.w05BCommand.count({ where: { actorId: x.free[0].id, key } })).toBe(1);
    const [clock] = await x.d.prisma.$queryRaw<
      { now: string }[]
    >`SELECT clock_timestamp()::text AS now`;
    record('one-real-clock-soak-plan', {
      booking: book,
      serverObserved: clock.now,
      pendingExpiresAt: r.expiresAt,
      joinStartsAt: r.startsAt,
      joinEndsAt: r.endsAt,
      recordingDurationMs: r.endsAt.getTime() - r.startsAt.getTime(),
      pending12hExpiry: 'NOT REACHED',
      lateChangeBoundary: 'NOT REACHED',
      positiveJoin: 'NOT REACHED',
      expiredJoin: 'NOT REACHED',
      noShow: 'NOT REACHED',
      dispute: 'NOT REACHED',
      futureGate:
        'One separately authorized real-clock observation after these recorded deadlines; do not reuse target as NEW',
    });
    await x.command(x.gv, 'CONFIRM', { id: book });
  });
  test('two independent clients race valid submitted reschedules; one pending successor and stale CAS denied', async () => {
    const before = await row(),
      s = await slots();
    const safe = load(process.env.W05B_TARGET_MODULE!),
      receipt = JSON.parse(readFileSync(process.env.W07_RECEIPT_PATH!, 'utf8')),
      target = safe.stageA(process.env, receipt),
      { Client } = load('pg'),
      a = new Client(target.config),
      b = new Client(target.config);
    await a.connect();
    await b.connect();
    try {
      await safe.stageB(a, target, 34);
      await safe.stageB(b, target, 34);
      const sid = (
        await a.query(
          "SELECT sid FROM user_sessions WHERE sess->>'userId'=$1 ORDER BY expire DESC LIMIT 1",
          [x.free[0].id],
        )
      ).rows[0].sid;
      const pids = await Promise.all([a, b].map((c) => c.query('SELECT pg_backend_pid() AS pid')));
      expect(pids[0].rows[0].pid).not.toBe(pids[1].rows[0].pid);
      const outcome = await Promise.allSettled(
        [a, b].map((c, i) =>
          c.query('SELECT w05b_command($1::uuid,$2,$3::uuid,$4::jsonb)', [
            x.free[0].id,
            sid,
            randomUUID(),
            JSON.stringify({
              op: 'RESCHEDULE',
              id: book,
              version: before.version,
              startsAt: s[40 + i * 5].startsAt,
              reason,
            }),
          ]),
        ),
      );
      expect(outcome.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
      const successors = await x.d.prisma.w05BBooking.findMany({ where: { replacesId: book } });
      expect(successors).toHaveLength(1);
      expect(successors[0].state).toBe('PENDING_GV');
      expect(successors[0].topic).toBe(before.topic);
      expect((await row()).state).toBe('SUPERSEDED');
      record('reschedule-two-client', {
        pids: pids.map((p) => p.rows[0].pid),
        outcome: outcome.map((x) => x.status),
      });
      book = successors[0].id;
      await x.command(x.gv, 'CONFIRM', { id: book });
    } finally {
      await a.end();
      await b.end();
    }
  });
  test('link review notices are generic, scoped and deduplicated; future URLs remain hidden', async () => {
    const l = await x.command(x.gv, 'LINK_PROPOSE', {
      id: book,
      url: 'https://meet.google.com/cfb-bcde-fgh',
      reason,
    });
    for (const agent of [x.hvu, secondary]) {
      const n = (await notices(agent)).filter(
        (n) => n.kind === 'REVIEW_LINK_V1' && n.objectId === l.id,
      );
      expect(n).toHaveLength(1);
      expect(JSON.stringify(n)).not.toContain('meet.google.com');
    }
    expect((await notices(unrelated)).some((n) => n.objectId === l.id)).toBe(false);
    expect(JSON.stringify((await x.hv.get(base + 'bookings').expect(200)).body)).not.toContain(
      'meet.google.com',
    );
    await x.command(x.hvu, 'LINK_APPROVE', { id: l.id, reason });
    expect((await notices(secondary)).some((n) => n.objectId === l.id)).toBe(false);
  });
  test('change review routing becomes stale after cancellation, preserving historical records', async () => {
    const b = await row(),
      c = await x.command(x.gv, 'CHANGE_REQUEST', {
        id: book,
        kind: 'CANCEL',
        version: b.version,
        reason,
      });
    for (const agent of [x.hvu, secondary])
      expect(
        (await notices(agent)).some((n) => n.objectId === c.id && n.kind === 'REVIEW_CHANGE_V1'),
      ).toBe(true);
    await x.command(x.hv, 'CANCEL', { id: book, version: b.version, reason });
    for (const agent of [x.hvu, secondary]) {
      expect((await notices(agent)).some((n) => n.objectId === c.id)).toBe(false);
      const w = await agent.get(base + 'workspace').expect(200);
      expect(w.body.changes.some((v: { id: string }) => v.id === c.id)).toBe(false);
    }
    expect((await x.d.prisma.w05BChange.findUniqueOrThrow({ where: { id: c.id } })).state).toBe(
      'PENDING',
    );
    await x.command(x.hvu, 'CHANGE_APPROVE', { id: c.id, reason }, 409);
  });
  test('scope/IDOR and existing quota/no financial entitlement contract remain effective', async () => {
    const s = await slots(x.other),
      pending: string[] = [];
    for (const i of [80, 85]) {
      const h = await x.command(x.other, 'HOLD', {
        teacherId: x.f.teacher.id,
        startsAt: s[i].startsAt,
      });
      await x.command(x.other, 'SUBMIT', { id: h.id, topic: reason });
      pending.push(h.id);
    }
    await x.command(x.other, 'HOLD', { teacherId: x.f.teacher.id, startsAt: s[90].startsAt }, 409);
    await x.command(x.hv, 'CANCEL', { id: pending[0], version: 1, reason }, 404);
    expect(
      await x.d.prisma.enrollment.count({ where: { learnerId: { in: x.free.map((u) => u.id) } } }),
    ).toBe(0);
    expect(await x.d.prisma.w07PaymentEvent.count()).toBe(0);
    expect(await x.d.prisma.w07Entitlement.count()).toBe(0);
  });
});
