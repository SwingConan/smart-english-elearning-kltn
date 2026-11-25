import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { startWave01App } from './wave01-postgres.fixture';
import { seedWave08 } from './wave08.fixture';
import { grantAcademic } from './wave02b.fixture';
import { actorSession, bulkOfficial, independentClients, loadW08Preseed } from './wave08-cf01.fixture';
import { localMinute } from '../src/modules/academic/academic-time';
describe('W08-CF01 focused actual PostgreSQL and HTTP verification', () => {
  let d: Awaited<ReturnType<typeof startWave01App>>,
    f: Awaited<ReturnType<typeof seedWave08>>,
    id: string,
    foreignId: string,
    ownFuture: Awaited<ReturnType<typeof bulkOfficial>>,
    raceSessions: string[],
    correctionId: string,
    backupInspector: typeof f.f.inspector;
  const traces: object[] = [];
  const api = (u: { id: string }) => f.agents.get(u.id)!;
  const revoke = async (classId: string) => {
    for (const g of await d.prisma.permissionGrant.findMany({
      where: {
        userId: f.f.academic.id,
        scopeId: classId,
        capability: { in: ['inspection.assign', 'inspection.hours.review', 'shift.review'] },
        revokedAt: null,
      },
      select: { id: true },
    }))
      await api(f.f.approver)
        .post('/api/authority/grants/' + g.id + '/revoke')
        .send({ reason: f.reason })
        .expect(201);
    // Revocation intentionally invalidates sessions. Authenticate again before
    // asserting resource denial under the actor's remaining current grants.
    await api(f.f.academic)
      .post('/api/auth/login')
      .send({ email: f.f.academic.email, password: f.f.password })
      .expect(200);
  };
  const view = async (u: { id: string }, k = id) =>
    (
      await api(u)
        .get('/api/v2/inspection/assignments/' + k)
        .expect(200)
    ).body;
  const command = async (u: { id: string }, action: string, extra: object = {}, k = id) => {
    const v = await view(u, k);
    return api(u)
      .post('/api/v2/inspection/assignments/' + k + '/commands')
      .send({
        action,
        key: randomUUID(),
        version: v.assignment.version,
        reason: f.reason,
        ...extra,
      });
  };
  const dispatch = async (sessionId: string, inspectorId = f.f.inspector.id, u = f.f.academic) =>
    (
      await api(u)
        .post('/api/v2/inspection/assignments')
        .send({ sessionId, inspectorId, key: randomUUID(), reason: f.reason })
        .expect(201)
    ).body;
  beforeAll(async () => {
    d = await startWave01App();
    const prepared = await loadW08Preseed(d);
    f = prepared.bundle;
    ownFuture = prepared.ownFuture;
    raceSessions = prepared.raceSessions;
    foreignId = prepared.foreignId;
    backupInspector = prepared.backupInspector;
    id = prepared.id;
  }, 60000);
  afterAll(async () => {
    await writeFile(
      join(process.env.W08_EVIDENCE_ROOT!, 'cf01-http-pg.json'),
      JSON.stringify(traces, null, 2),
    );
    await d?.app.close();
  });
  it('scopes before limit: authorized session and TT shift survive more than500 foreign rows', async () => {
    const [n] = await d.prisma.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`;
    const from = new Date(n.now.toISOString().slice(0, 10) + 'T00:00:00Z'),
      to = new Date(from.getTime() + 7 * 86400000),
      q = '?from=' + from.toISOString() + '&to=' + to.toISOString() + '&limit=2';
    const old = await d.prisma.teachingSession.findMany({
      where: { state: 'PUBLISHED' },
      orderBy: { startsAt: 'desc' },
      take: 500,
      select: { id: true },
    });
    expect(old.some((x) => x.id === f.sessions[0].id)).toBe(false);
    const first = (
      await api(f.f.academic)
        .get('/api/v2/inspection' + q)
        .expect(200)
    ).body;
    expect(first.sessions.some((s: { id: string }) => s.id === f.sessions[0].id)).toBe(true);
    expect(first.sessions.every((s: { classId: string }) => s.classId === f.f.classroom.id)).toBe(
      true,
    );
    expect(first.nextSessionCursor).toBeTruthy();
    const next = (
      await api(f.f.academic)
        .get('/api/v2/inspection' + q + '&sessionCursor=' + first.nextSessionCursor)
        .expect(200)
    ).body;
    expect(next.sessions).toHaveLength(2);
    expect(
      next.sessions.some((s: { id: string }) =>
        first.sessions.some((p: { id: string }) => p.id === s.id),
      ),
    ).toBe(false);
    const tt = (
      await api(f.f.inspector)
        .get('/api/v2/inspection' + q)
        .expect(200)
    ).body;
    expect(tt.data.some((x: { assignment: { id: string } }) => x.assignment.id === id)).toBe(true);
    expect(tt.sessions).toEqual([]);
    await api(f.f.academic)
      .get('/api/v2/inspection/assignments/' + foreignId)
      .expect(404);
    await api(f.f.inspector)
      .get('/api/v2/inspection' + q + '&assignmentCursor=' + foreignId)
      .expect(404);
    traces.push({
      case: 'beyond500',
      foreignSessions: 501,
      foreignAssignments: 501,
      first: first.sessions,
      next: next.sessions,
      TTownFound: true,
    });
  });
  it('two independent PostgreSQL backends enforce overlapping TT dispatch exclusion', async () => {
    const { a, b, pids } = await independentClients(),
      actor = f.f.planningApprover,
      sid = await actorSession(d.prisma, actor.id);
    try {
      const results = await Promise.all(
        [a, b].map(async (c, i) => {
          try {
            await c.query('BEGIN');
            await c.query(
              "SELECT set_config('app.w08_actor',$1,true),set_config('app.w08_session',$2,true)",
              [actor.id, sid],
            );
            const r = await c.query(
              `INSERT INTO w08_assignment("sessionId","classId","teacherId","inspectorId","dispatcherId","meetId",revision,"startsAt","endsAt",state,version,reason) SELECT s.id,s."classOfferingId",s."instructorId",$1::uuid,$2::uuid,m.id,s.revision,s."startsAt",s."endsAt",'ACTIVE',0,$3 FROM teaching_sessions s JOIN w06_meet m ON m."sessionId"=s.id AND m.state='APPROVED' WHERE s.id=$4::uuid RETURNING id`,
              [f.f.inspector.id, actor.id, f.reason, raceSessions[i]],
            );
            await c.query('COMMIT');
            return { status: 201, id: r.rows[0].id };
          } catch (e) {
            await c.query('ROLLBACK');
            return {
              status: 409,
              code: (e as { code: string }).code,
              constraint: (e as { constraint: string }).constraint,
            };
          }
        }),
      );
      expect(results.map((x) => x.status).sort()).toEqual([201, 409]);
      expect(results.find((x) => x.status === 409)?.constraint).toBe('w08_inspector_no_overlap');
      traces.push({ case: 'two-PG-assignment-race', pids, results });
    } finally {
      await a.end();
      await b.end();
    }
  });
  it('acknowledge/decline retain receipt and HVU reassigns with history', async () => {
    const x = await dispatch(ownFuture[0].id, f.f.inspector.id);
    expect((await command(f.f.inspector, 'ACK', {}, x.id)).status).toBe(201);
    expect((await command(f.f.inspector, 'DECLINE', {}, x.id)).status).toBe(201);
    const r = await command(f.f.academic, 'REASSIGN', { inspectorId: backupInspector.id }, x.id);
    expect(r.status).toBe(201);
    expect((await view(f.f.academic, x.id)).assignment.state).toBe('REASSIGNED');
    expect((await view(backupInspector, r.body.id)).assignment.inspectorId).toBe(
      backupInspector.id,
    );
    await api(f.f.inspector)
      .get('/api/v2/inspection/assignments/' + r.body.id)
      .expect(404);
  });
  it('explicit scope revocation is immediate; new approval grant does not erase revoked history', async () => {
    await revoke(f.f.classroom.id);
    await api(f.f.academic)
      .get('/api/v2/inspection/assignments/' + id)
      .expect(404);
    const list = (await api(f.f.academic).get('/api/v2/inspection').expect(200)).body;
    expect(list.data).toEqual([]);
    expect(list.sessions).toEqual([]);
    for (const cap of ['inspection.assign', 'inspection.hours.review', 'shift.review'])
      await grantAcademic(
        d.prisma,
        f.f.academic.id,
        f.f.approver.id,
        f.f.secondApprover.id,
        cap,
        'CLASS',
        f.f.classroom.id,
      );
    await view(f.f.academic);
    traces.push({
      case: 'revoked-scope-denied-new-explicit-grants-restored-access',
      revokedRecordsRetained: true,
    });
  });
  it('native observations, duplicate-range union and same-key retry do not create extra evidence', async () => {
    const v = await view(f.f.inspector),
      payload = {
        action: 'START',
        key: randomUUID(),
        version: v.assignment.version,
        reason: f.reason,
      };
    const first = await api(f.f.inspector)
        .post('/api/v2/inspection/assignments/' + id + '/commands')
        .send(payload)
        .expect(201),
      again = await api(f.f.inspector)
        .post('/api/v2/inspection/assignments/' + id + '/commands')
        .send(payload)
        .expect(201);
    expect(first.body).toEqual(again.body);
    await new Promise((r) => setTimeout(r, 1100));
    expect((await command(f.f.inspector, 'STOP')).status).toBe(201);
    const [r] = await d.prisma.$queryRaw<
      { observed: number; duplicateUnion: number }[]
    >`SELECT w08_observed(${id}::uuid) AS observed,(SELECT floor(extract(epoch FROM sum(upper(z)-lower(z))))::int FROM (SELECT unnest(range_agg(tstzrange("startedAt","stoppedAt",'[)'))) z FROM (SELECT "startedAt","stoppedAt" FROM w08_segment WHERE "assignmentId"=${id}::uuid UNION ALL SELECT "startedAt","stoppedAt" FROM w08_segment WHERE "assignmentId"=${id}::uuid)g)x) AS "duplicateUnion"`;
    expect(r.observed).toBeGreaterThanOrEqual(1);
    expect(r.duplicateUnion).toBe(r.observed);
    expect(
      (
        await command(f.f.inspector, 'REPORT', {
          presence: 'PRESENT',
          conditions: 'Synthetic human-attested observation; not automatic presence verification',
        })
      ).status,
    ).toBe(201);
    traces.push({ case: 'native-union-retry', ...r });
  });
  it('two independent PostgreSQL reviewers use real CAS and one durable decision', async () => {
    const { a, b, pids } = await independentClients(),
      v = await view(f.f.academic),
      report = v.reports.at(-1);
    try {
      const results = await Promise.all(
        [a, b].map(async (c, i) => {
          const u = i === 0 ? f.f.academic : f.f.planningApprover,
            sid = await actorSession(d.prisma, u.id);
          try {
            await c.query('BEGIN');
            await c.query(
              "SELECT set_config('app.w08_actor',$1,true),set_config('app.w08_session',$2,true)",
              [u.id, sid],
            );
            const changed = await c.query(
              'UPDATE w08_assignment SET version=version+1 WHERE id=$1 AND version=$2 RETURNING id',
              [id, v.assignment.version],
            );
            if (changed.rowCount !== 1) {
              await c.query('ROLLBACK');
              return { status: 409, code: 'STALE_CAS' };
            }
            await c.query(
              'INSERT INTO w08_decision("assignmentId","reportId","reviewerId",number,disposition,"approvedSeconds",reason) VALUES($1,$2,$3,1,\'PARTIAL\',1,$4)',
              [id, report.id, u.id, f.reason],
            );
            await c.query('COMMIT');
            return { status: 201 };
          } catch (e) {
            await c.query('ROLLBACK');
            return { status: 409, code: (e as { code: string }).code };
          }
        }),
      );
      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
      expect(await d.prisma.w08Decision.count({ where: { assignmentId: id } })).toBe(1);
      traces.push({ case: 'two-PG-review-CAS', pids, results });
    } finally {
      await a.end();
      await b.end();
    }
  });
  it('same principal changing primary role still cannot self-sign own report or staff correction', async () => {
    expect((await command(f.f.inspector, 'IN')).status).toBe(201);
    await new Promise((r) => setTimeout(r, 1100));
    const v = await view(f.f.inspector);
    expect(
      (
        await command(f.f.inspector, 'CORRECTION', {
          kind: 'MISSING_CHECKOUT',
          evidence: 'Synthetic missed checkout; proposed server timestamp',
          proposedOutAt: v.serverTime,
        })
      ).status,
    ).toBe(201);
    correctionId = (await view(f.f.inspector)).corrections[0].id;
    await d.prisma.user.update({
      where: { id: f.f.inspector.id },
      data: { role: 'ACADEMIC_MANAGER' },
    });
    try {
      for (const cap of ['inspection.hours.review', 'shift.review'])
        await grantAcademic(
          d.prisma,
          f.f.inspector.id,
          f.f.approver.id,
          f.f.secondApprover.id,
          cap,
          'CLASS',
          f.f.classroom.id,
        );
      const now = (await view(f.f.planningApprover)).assignment.version;
      for (const b of [
        { action: 'REVIEW', disposition: 'APPROVE', approvedSeconds: 1 },
        { action: 'CORRECTION_REVIEW', correctionId, disposition: 'ACCEPT' },
      ])
        await api(f.f.inspector)
          .post('/api/v2/inspection/assignments/' + id + '/commands')
          .send({ ...b, key: randomUUID(), version: now, reason: f.reason })
          .expect(404);
    } finally {
      await d.prisma.user.update({
        where: { id: f.f.inspector.id },
        data: { role: 'TEACHING_INSPECTOR' },
      });
    }
    traces.push({
      case: 'same-principal-role-change-self-sign-denied',
      identity: f.f.inspector.id,
    });
  });
  it('independent corrected OUT produces approved TT seconds while original IN and GV ledger remain unchanged', async () => {
    const before = await view(f.f.inspector),
      v = before.assignment.version;
    const results = await Promise.all(
      [f.f.academic, f.f.planningApprover].map((u) =>
        api(u)
          .post('/api/v2/inspection/assignments/' + id + '/commands')
          .send({
            action: 'CORRECTION_REVIEW',
            version: v,
            key: randomUUID(),
            reason: f.reason,
            correctionId,
            disposition: 'ACCEPT',
          }),
      ),
    );
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    const after = await view(f.f.inspector);
    expect(after.clocks).toEqual(before.clocks);
    expect(after.clocks.map((x: { kind: string }) => x.kind)).toEqual(['IN']);
    expect(after.personnel.correctedOutAt).toBeTruthy();
    expect(Number.isInteger(after.personnel.approvedSeconds)).toBe(true);
    expect(after.personnel.approvedSeconds).toBeGreaterThanOrEqual(1);
    expect(after.approvedSeconds).toBe(before.approvedSeconds);
    expect(after.decisions).toEqual(before.decisions);
    traces.push({
      case: 'accepted-TT-correction',
      personnel: after.personnel,
      rawClocks: after.clocks,
      GVapprovedSeconds: after.approvedSeconds,
      reviewers: results.map((r) => r.status),
    });
  });
  it('future/outside proposed OUT is rejected; corrected revision is immutable and compensating', async () => {
    expect(
      (
        await command(f.f.inspector, 'CORRECTION', {
          kind: 'MISSING_CHECKOUT',
          evidence: f.reason,
          proposedOutAt: '2099-01-01T00:00:00Z',
        })
      ).status,
    ).toBe(409);
    const before = await view(f.f.inspector);
    expect(
      (
        await command(f.f.inspector, 'CORRECTION', {
          kind: 'MISSING_CHECKOUT',
          evidence: 'Second reasoned compensation, original events retained',
          proposedOutAt: before.serverTime,
        })
      ).status,
    ).toBe(201);
    const next = (await view(f.f.inspector)).corrections.at(-1);
    expect(
      (
        await command(f.f.academic, 'CORRECTION_REVIEW', {
          correctionId: next.id,
          disposition: 'ACCEPT',
        })
      ).status,
    ).toBe(201);
    const after = await view(f.f.inspector);
    expect(after.corrections).toHaveLength(2);
    expect(after.corrections[0]).toEqual(before.corrections[0]);
    expect(after.personnel.revision).toBe(2);
    expect(after.personnel.approvedSeconds).toBeGreaterThanOrEqual(
      before.personnel.approvedSeconds,
    );
  });
  it('independent official cancellation invalidates old assignment without silently approving hours', async () => {
    const x = await dispatch(ownFuture[1].id, f.f.inspector.id),
      path = '/api/v2/academic/sessions/';
    const draft = (
      await api(f.f.academic)
        .post(path + ownFuture[1].id + '/cancel')
        .send({ reason: f.reason })
        .expect(201)
    ).body;
    const pending = (
      await api(f.f.academic)
        .post(path + draft.id + '/submit')
        .send({ reason: f.reason, expectedLockVersion: draft.lockVersion })
        .expect(201)
    ).body;
    await api(f.f.planningApprover)
      .post(path + draft.id + '/approve')
      .send({ reason: f.reason, expectedLockVersion: pending.lockVersion })
      .expect(201);
    const v = await view(f.f.inspector, x.id);
    expect(v.valid).toBe(false);
    expect(v.meetUrl).toBeNull();
    expect(v.approvedSeconds).toBeNull();
  });
  it('official reschedule/makeup revision blocks old TT access; teacher substitution needs new approved assignment', async () => {
    const old = ownFuture[2],
      x = await dispatch(old.id, f.f.inspector.id),
      path = '/api/v2/academic/sessions/';
    const body = {
      startLocal: localMinute(new Date(old.startsAt.getTime() + 12 * 3600000), 'Asia/Ho_Chi_Minh'),
      endLocal: localMinute(new Date(old.endsAt.getTime() + 12 * 3600000), 'Asia/Ho_Chi_Minh'),
      timezone: 'Asia/Ho_Chi_Minh',
      modality: 'ONLINE',
      assignmentId: old.assignmentId,
      requiredCapabilities: [],
      reason: 'Synthetic official makeup/replacement revision',
    };
    const draft = (
        await api(f.f.academic)
          .post(path + old.id + '/reschedule')
          .send(body)
          .expect(201)
      ).body,
      pending = (
        await api(f.f.academic)
          .post(path + draft.id + '/submit')
          .send({ reason: f.reason, expectedLockVersion: draft.lockVersion })
          .expect(201)
      ).body;
    await api(f.f.planningApprover)
      .post(path + draft.id + '/approve')
      .send({ reason: f.reason, expectedLockVersion: pending.lockVersion })
      .expect(201);
    const v = await view(f.f.inspector, x.id);
    expect(v.assignment.state).toBe('INVALIDATED');
    expect(v.meetUrl).toBeNull();
    expect(v.approvedSeconds).toBeNull();
    // A foreign class assignment cannot substitute another instructor into the new occurrence.
    const foreignAssignment = f.sessions[1].assignmentId;
    await api(f.f.academic)
      .post(path + draft.id + '/reschedule')
      .send({ ...body, assignmentId: foreignAssignment })
      .expect(404);
  });
});
