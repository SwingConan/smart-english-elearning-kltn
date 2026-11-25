import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { appendFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { setupW05B } from './wave05b.fixture';
const load = createRequire(__filename);
type F = Awaited<ReturnType<typeof setupW05B>>;
describe('DEC059/060 W05B free class-independent consultation', () => {
  let x: F,
    profile: string,
    slot: string,
    booking: string,
    link: string,
    baseline: Record<string, number>;
  const reason = 'Synthetic DEV evidence; independent review';
  const record = (label: string, data: unknown) => {
    if (process.env.W05B_EVIDENCE_ROOT)
      appendFileSync(
        join(process.env.W05B_EVIDENCE_ROOT, 'business.jsonl'),
        JSON.stringify({ label, utc: new Date().toISOString(), data }) + '\n',
      );
  };
  const get = () => x.hv.get('/api/v2/consultations/bookings');
  const counts = async () => ({
    enrollments: await x.d.prisma.enrollment.count(),
    payments: await x.d.prisma.w07PaymentEvent.count(),
    proofs: await x.d.prisma.w07Evidence.count(),
  });
  beforeAll(async () => {
    x = await setupW05B();
    baseline = await counts();
    const p = await x.command(x.gv, 'PROFILE_SAVE', {
      displayName: 'GV tư vấn Tiếng Việt',
      bio: 'Tư vấn TOEIC và phương pháp học miễn phí.',
      specialties: 'TOEIC Listening & Speaking',
    });
    profile = p.id;
    await x.command(x.hvu, 'PROFILE_APPROVE', { id: profile, reason });
    for (let weekday = 0; weekday < 7; weekday++)
      await x.command(x.gv, 'AVAILABILITY_ADD', {
        kind: 'WEEKLY',
        weekday,
        startMinute: 0,
        endMinute: 1440,
        reason,
      });
    const r = await x.hv
      .get('/api/v2/consultations/slots')
      .query({ teacherId: x.f.teacher.id })
      .expect(200);
    expect(r.body.length).toBeGreaterThan(10);
    slot = r.body[4].startsAt;
  }, 60000);
  afterAll(async () => {
    if (x) await x.d.app.close();
  });
  test('FREE registered learner has zero enrollment and sees only approved public fields', async () => {
    expect(await x.d.prisma.enrollment.count({ where: { learnerId: x.free[0].id } })).toBe(0);
    const r = await x.hv.get('/api/v2/consultations/profiles').expect(200);
    expect(r.body[0].displayName).toBe('GV tư vấn Tiếng Việt');
    expect(JSON.stringify(r.body)).not.toMatch(/passwordHash|@example|phone|joinUrl/);
  });
  test('all four unrelated roles and guest denied; no administrative implicit access', async () => {
    for (const agent of [x.qt, x.tv, x.tn, x.tt]) {
      await agent.get('/api/v2/consultations/profiles').expect(403);
      await agent.get('/api/v2/consultations/bookings').expect(403);
    }
    const request = load('supertest');
    await request(x.d.app.getHttpServer()).get('/api/v2/consultations/profiles').expect(401);
  });
  test('two independent PG clients compete for same range: one durable hold only', async () => {
    const safe = load(process.env.W05B_TARGET_MODULE!);
    const receipt = JSON.parse(readFileSync(process.env.W07_RECEIPT_PATH!, 'utf8'));
    const target = safe.stageA(process.env, receipt);
    const { Client } = load('pg');
    const a = new Client(target.config),
      b = new Client(target.config);
    await a.connect();
    await b.connect();
    try {
      await safe.stageB(a, target, Number(process.env.CF_EXPECTED_MIGRATIONS ?? 33));
      await safe.stageB(b, target, Number(process.env.CF_EXPECTED_MIGRATIONS ?? 33));
      const sid = async (id: string) =>
        (
          await a.query(
            "SELECT sid FROM user_sessions WHERE sess->>'userId'=$1 ORDER BY expire DESC LIMIT 1",
            [id],
          )
        ).rows[0].sid;
      const sids = [await sid(x.free[0].id), await sid(x.free[1].id)];
      const pids = await Promise.all([a, b].map((c) => c.query('SELECT pg_backend_pid() AS pid')));
      expect(pids[0].rows[0].pid).not.toBe(pids[1].rows[0].pid);
      const keys = [randomUUID(), randomUUID()];
      const outcomes = await Promise.allSettled(
        [a, b].map((c, i) =>
          c.query('SELECT w05b_command($1::uuid,$2,$3::uuid,$4::jsonb) AS result', [
            x.free[i].id,
            sids[i],
            keys[i],
            JSON.stringify({ op: 'HOLD', teacherId: x.f.teacher.id, startsAt: slot }),
          ]),
        ),
      );
      expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1);
      expect(outcomes.filter((o) => o.status === 'rejected')).toHaveLength(1);
      const rows = await x.d.prisma.w05BBooking.findMany({ where: { startsAt: new Date(slot) } });
      expect(rows).toHaveLength(1);
      record('independent-two-client-race', {
        pids: pids.map((r) => r.rows[0].pid),
        outcomes: outcomes.map((o) => o.status),
        bookingId: rows[0].id,
      });
      // Whichever synthetic learner won may release its hold; do not fabricate winner.
      const agent = rows[0].learnerId === x.free[0].id ? x.hv : x.other;
      await x.command(agent, 'CANCEL', { id: rows[0].id, version: rows[0].version, reason });
    } finally {
      await a.end();
      await b.end();
    }
  });
  test('hold, lost ACK replay, idempotency mismatch, buffer and foreign IDOR', async () => {
    const key = randomUUID(),
      payload = { key, op: 'HOLD', teacherId: x.f.teacher.id, startsAt: slot };
    const a = await x.hv.post('/api/v2/consultations/commands').send(payload).expect(201);
    booking = a.body.id;
    const b = await x.hv.post('/api/v2/consultations/commands').send(payload).expect(201);
    expect(b.body).toEqual(a.body);
    await x.hv
      .post('/api/v2/consultations/commands')
      .send({ ...payload, startsAt: new Date(new Date(slot).getTime() + 7200000).toISOString() })
      .expect(409);
    await x.command(
      x.other,
      'HOLD',
      {
        teacherId: x.f.teacher.id,
        startsAt: new Date(new Date(slot).getTime() + 30 * 60000).toISOString(),
      },
      409,
    );
    await x.command(x.other, 'SUBMIT', { id: booking, topic: reason }, 404);
    const r = await x.other.get('/api/v2/consultations/bookings').expect(200);
    expect(r.body.data.map((b: { id: string }) => b.id)).not.toContain(booking);
    expect(
      await x.d.prisma.w05BBooking.count({ where: { learnerId: x.free[0].id, state: 'HOLD' } }),
    ).toBe(1);
  });
  test('submit reserves12h, learner cannot confirm, teacher confirms once and persists receipt', async () => {
    const key = randomUUID(),
      payload = { key, op: 'SUBMIT', id: booking, topic: reason };
    await x.hv.post('/api/v2/consultations/commands').send(payload).expect(201);
    await x.hv.post('/api/v2/consultations/commands').send(payload).expect(201);
    const pending = await x.d.prisma.w05BBooking.findUniqueOrThrow({ where: { id: booking } });
    expect(pending.state).toBe('PENDING_GV');
    expect(pending.expiresAt!.getTime() - Date.now()).toBeGreaterThan(43190000);
    await x.command(x.hv, 'CONFIRM', { id: booking }, 409);
    await x.command(x.gv, 'CONFIRM', { id: booking });
    await x.command(x.gv, 'CONFIRM', { id: booking }, 409);
    expect((await x.d.prisma.w05BBooking.findUniqueOrThrow({ where: { id: booking } })).state).toBe(
      'CONFIRMED',
    );
    expect(await x.d.prisma.w05BCommand.count({ where: { actorId: x.free[0].id, key } })).toBe(1);
  });
  test('separate proposed/approved/current link is never in future learner payload', async () => {
    const r = await x.command(x.gv, 'LINK_PROPOSE', {
      id: booking,
      url: 'https://meet.google.com/abc-defg-hij',
      reason,
    });
    link = r.id;
    await x.command(x.hv, 'LINK_APPROVE', { id: link, reason }, 404);
    await x.command(x.hvu, 'LINK_APPROVE', { id: link, reason });
    expect(JSON.stringify((await get().expect(200)).body)).not.toContain('meet.google.com');
    const next = await x.command(x.gv, 'LINK_PROPOSE', {
      id: booking,
      url: 'https://meet.google.com/klm-nopq-rst',
      reason,
    });
    await x.command(x.hvu, 'LINK_APPROVE', { id: link, reason }, 409);
    await x.command(x.hvu, 'LINK_APPROVE', { id: next.id, reason });
    const view = await get().expect(200);
    expect(view.body.data.find((b: { id: string }) => b.id === booking).joinUrl).toBeNull();
    record('future-confirmed-link-hidden', view.body);
  });
  test('profile material revision hides directory but pinned booking snapshot remains', async () => {
    const p = await x.command(x.gv, 'PROFILE_SAVE', {
      displayName: 'Tên nháp chưa duyệt',
      bio: 'Nội dung sửa đổi không được lộ cho học viên.',
      specialties: 'Nội dung mới',
    });
    expect((await x.hv.get('/api/v2/consultations/profiles').expect(200)).body).toHaveLength(0);
    const view = await get().expect(200);
    expect(view.body.data.find((b: { id: string }) => b.id === booking).displayName).toBe(
      'GV tư vấn Tiếng Việt',
    );
    await x.command(x.hvu, 'PROFILE_APPROVE', { id: p.id, reason });
  });
  test('quota2 pending across teacher requests and rejected booking releases range', async () => {
    const slots = (
      await x.hv.get('/api/v2/consultations/slots').query({ teacherId: x.f.teacher.id }).expect(200)
    ).body;
    const ids: string[] = [];
    for (const index of [20, 24]) {
      const hold = await x.command(x.hv, 'HOLD', {
        teacherId: x.f.teacher.id,
        startsAt: slots[index].startsAt,
      });
      ids.push(hold.id);
      await x.command(x.hv, 'SUBMIT', { id: hold.id, topic: reason });
    }
    await x.command(x.hv, 'HOLD', { teacherId: x.f.teacher.id, startsAt: slots[28].startsAt }, 409);
    await x.command(x.gv, 'REJECT', { id: ids[0] });
    await x.command(x.gv, 'REJECT', { id: ids[1] });
    const next = await x.command(x.other, 'HOLD', {
      teacherId: x.f.teacher.id,
      startsAt: slots[20].startsAt,
    });
    await x.command(x.other, 'CANCEL', { id: next.id, version: 0, reason });
  });
  test('reschedule collision rolls back old booking and stale CAS denied', async () => {
    const r = await get().expect(200),
      old = r.body.data.find((b: { id: string }) => b.id === booking);
    const slots = (
      await x.other
        .get('/api/v2/consultations/slots')
        .query({ teacherId: x.f.teacher.id })
        .expect(200)
    ).body;
    const occupied = await x.command(x.other, 'HOLD', {
      teacherId: x.f.teacher.id,
      startsAt: slots[40].startsAt,
    });
    await x.command(
      x.hv,
      'RESCHEDULE',
      { id: booking, startsAt: slots[40].startsAt, version: old.version, reason },
      409,
    );
    const same = await x.d.prisma.w05BBooking.findUniqueOrThrow({ where: { id: booking } });
    expect(same.state).toBe('CONFIRMED');
    expect(same.version).toBe(old.version);
    await x.command(x.hv, 'CANCEL', { id: booking, version: old.version - 1, reason }, 409);
    await x.command(x.other, 'CANCEL', { id: occupied.id, version: 0, reason });
  });
  test('reviewed change independent, versioned and preserves original on rejection', async () => {
    const b = await x.d.prisma.w05BBooking.findUniqueOrThrow({ where: { id: booking } });
    const c = await x.command(x.gv, 'CHANGE_REQUEST', {
      id: booking,
      kind: 'CANCEL',
      version: b.version,
      reason,
    });
    await x.command(x.gv, 'CHANGE_APPROVE', { id: c.id, reason }, 404);
    await x.command(x.hvu, 'CHANGE_REJECT', { id: c.id, reason });
    expect((await x.d.prisma.w05BBooking.findUniqueOrThrow({ where: { id: booking } })).state).toBe(
      'CONFIRMED',
    );
  });
  test('no-show cannot be asserted early; private notifications durable', async () => {
    await x.command(x.gv, 'NO_SHOW', { id: booking, evidence: reason }, 409);
    const n = await x.hv.get('/api/v2/consultations/notifications').expect(200);
    expect(n.body.length).toBeGreaterThan(3);
    expect(JSON.stringify(n.body)).not.toContain('meet.google.com');
    expect(await x.d.prisma.w05BOutbox.count({ where: { recipientId: x.free[0].id } })).toBe(
      n.body.length,
    );
  });
  test('server UTC lead/horizon deterministic exact boundaries (not precisely timed HTTP)', async () => {
    const rows = await x.d.prisma.$queryRaw<
      { early: boolean; exact: boolean; late: boolean; horizon: boolean; past: boolean }[]
    >`SELECT
   w05b_request_at(clock_timestamp(),clock_timestamp()+interval '24 hours'-interval '1 second') AS early,
   w05b_request_at('2026-01-01T00:00:00Z','2026-01-02T00:00:00Z') AS exact,
   w05b_request_at('2026-01-01T00:00:00Z','2026-01-01T23:59:59.999Z') AS late,
   w05b_request_at('2026-01-01T00:00:00Z','2026-01-15T00:00:00Z') AS horizon,
   w05b_request_at('2026-01-01T00:00:00Z','2026-01-15T00:00:00.001Z') AS past`;
    expect(rows[0]).toEqual({ early: false, exact: true, late: false, horizon: true, past: false });
    record('deterministic-lead-horizon-seams', rows);
    await x.command(
      x.other,
      'HOLD',
      { teacherId: x.f.teacher.id, startsAt: new Date(Date.now() + 3600000).toISOString() },
      409,
    );
  });
  test('withdrawn profile blocks new booking, permission revoke removes review', async () => {
    const ws = await x.gv.get('/api/v2/consultations/workspace').expect(200);
    const p = ws.body.profiles[0];
    await x.command(x.hvu, 'PROFILE_DISABLE', { id: p.id, reason });
    expect((await x.hv.get('/api/v2/consultations/profiles').expect(200)).body).toHaveLength(0);
    await x.command(x.gv, 'PROFILE_ENABLE', { id: p.id, reason }, 404);
    await x.command(x.hvu, 'PROFILE_ENABLE', { id: p.id, reason });
    await x.qt
      .post('/api/authority/grants/' + x.grants['consultation.profile.approve'] + '/revoke')
      .send({ reason })
      .expect(201);
    x.hvu = await x.login(x.f.academic);
    await x.command(x.hvu, 'PROFILE_DISABLE', { id: p.id, reason }, 404);
    const queue = await x.hvu.get('/api/v2/consultations/workspace').expect(200);
    expect(queue.body.profiles).toHaveLength(0);
  });
  test('W05B has no side effects on enrollment/payment/proof; history direct update/delete denied', async () => {
    expect(await counts()).toEqual(baseline);
    await expect(
      x.d.prisma.$executeRaw`DELETE FROM w05b_bookings WHERE id=${booking}::uuid`,
    ).rejects.toThrow();
    await expect(
      x.d.prisma.$executeRaw`UPDATE w05b_bookings SET topic='tampered' WHERE id=${booking}::uuid`,
    ).rejects.toThrow();
    record('no-finance-entitlement-side-effects', { before: baseline, after: await counts() });
  });
});
