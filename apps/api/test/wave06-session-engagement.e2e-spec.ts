import * as request from 'supertest';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { startWave01App } from './wave01-postgres.fixture';
import { seedWave06 } from './wave06.fixture';
import { AcademicPlanningService } from '../src/modules/academic/academic-planning.service';
import { SessionEngagementService } from '../src/modules/session-engagement/session-engagement.service';
import { localMinute } from '../src/modules/academic/academic-time';
const reason = 'Synthetic DEC047 isolated review';
const base = '/api/v2/session-engagement/';
const academic = '/api/v2/academic/';
describe('W06 real HTTP/PostgreSQL, no academic completion claim', () => {
  let dev: Awaited<ReturnType<typeof startWave01App>>,
    f: Awaited<ReturnType<typeof seedWave06>>,
    official: string,
    assignment: string,
    meet: string,
    receipt: string;
  const agents = new Map<string, ReturnType<typeof request.agent>>(),
    traces: object[] = [];
  const api = (id: string) => agents.get(id)!;
  const fresh = () => ({ key: randomUUID(), reason });
  beforeAll(async () => {
    process.env.W06_ENABLED = 'DEV_DEC047';
    dev = await startWave01App();
    dev.app.useLogger(['error']);
    f = await seedWave06(dev.prisma);
    const planning = dev.app.get(AcademicPlanningService),
      original = planning.approve.bind(planning);
    jest.spyOn(planning, 'approve').mockImplementation(async (...args) => {
      try {
        return await original(...args);
      } catch (e) {
        console.error('W06_SETUP_APPROVAL_ERROR', String(e));
        throw e;
      }
    });
    const engagement = dev.app.get(SessionEngagementService),
      rotate = engagement.rotate.bind(engagement);
    jest.spyOn(engagement, 'rotate').mockImplementation(async (...args) => {
      try {
        return await rotate(...args);
      } catch (e) {
        console.error('W06_CODE_ERROR', String(e instanceof Error ? e.cause : e));
        throw e;
      }
    });
    for (const u of [...f.users, f.otherAcademic, f.ungrantedAcademic, ...f.contenders]) {
      const a = request.agent(dev.app.getHttpServer());
      await a.post('/api/auth/login').send({ email: u.email, password: f.password }).expect(200);
      agents.set(u.id, a);
    }
    const [clock] = await dev.prisma.$queryRaw<
      { ms: number }[]
    >`SELECT extract(epoch FROM clock_timestamp())::double precision*1000 AS ms`;
    const a = await api(f.academic.id)
      .post(academic + 'classes/' + f.classroom.id + '/assignments')
      .send({
        instructorId: f.teacher.id,
        effectiveFrom: new Date(clock.ms + 2000).toISOString(),
        effectiveTo: new Date(clock.ms + 86400000).toISOString(),
        reason,
      })
      .expect(201);
    const pending = await api(f.academic.id)
      .post(academic + 'assignments/' + a.body.id + '/submit')
      .send({ expectedLockVersion: a.body.lockVersion, reason })
      .expect(201);
    await api(f.planningApprover.id)
      .post(academic + 'assignments/' + a.body.id + '/approve')
      .send({ expectedLockVersion: pending.body.lockVersion, reason, eligibilityConfirmed: true })
      .expect(201);
    assignment = a.body.id;
    await new Promise((r) => setTimeout(r, 2200));
    const [pg] = await dev.prisma.$queryRaw<
      { ms: number }[]
    >`SELECT extract(epoch FROM clock_timestamp())::double precision*1000 AS ms`;
    const draft = await dev.prisma.teachingSession.create({
      data: {
        classOfferingId: f.classroom.id,
        startsAt: new Date(pg.ms + 18000),
        endsAt: new Date(pg.ms + 3600000),
        timezone: 'Asia/Ho_Chi_Minh',
        modality: 'ONLINE',
        assignmentId: assignment,
        instructorId: f.teacher.id,
        requiredCapabilities: [],
        proposedBy: f.academic.id,
        reason,
      },
    });
    const s = await api(f.academic.id)
      .post(academic + 'sessions/' + draft.id + '/submit')
      .send({ expectedLockVersion: 0, reason })
      .expect(201);
    await api(f.planningApprover.id)
      .post(academic + 'sessions/' + draft.id + '/approve')
      .send({ expectedLockVersion: s.body.lockVersion, reason })
      .expect(201);
    official = draft.id;
  }, 60000);
  afterAll(async () => {
    await writeFile(
      resolve(process.env.W06_EVIDENCE_ROOT!, 'http-traces.json'),
      JSON.stringify(traces, null, 2),
    );
    if (dev) await dev.app.close();
  });
  it('capability OFF fails closed, then explicitly recovers', async () => {
    process.env.W06_ENABLED = 'OFF';
    await api(f.teacher.id)
      .get(base + 'sessions/' + official)
      .expect(404);
    process.env.W06_ENABLED = 'DEV_DEC047';
    await api(f.teacher.id)
      .get(base + 'sessions/' + official)
      .expect(200);
  });
  it('does not mark attendance on activity open or auto-open', async () => {
    await api(f.teacher.id)
      .post(base + 'sessions/' + official + '/attendance')
      .send({})
      .expect(201);
    await api(f.learner.id)
      .get(base + 'sessions/' + official)
      .expect(200)
      .then((r) => expect(r.body.attendance.result.status).toBe('NOT_RECORDED'));
    expect(await dev.prisma.w06Receipt.count({ where: { window: { sessionId: official } } })).toBe(
      0,
    );
  });
  it('rejects foreign/PENDING_PAYMENT/GV/QT/TV and revoked session reads/mutations', async () => {
    for (const u of [f.otherTeacher, f.otherLearner, f.admin, f.counselor, f.ungrantedAcademic]) {
      const r = await api(u.id).get(base + 'sessions/' + official);
      expect([403, 404]).toContain(r.status);
      traces.push({ test: 'deny-read', role: u.role, status: r.status });
    }
    for (const u of [f.learner, f.inspector, f.academic]) {
      await api(u.id)
        .post(base + 'sessions/' + official + '/meet')
        .send({ ...fresh(), url: 'https://meet.google.com/abc-defg-hij' })
        .expect(404);
    }
    await request(dev.app.getHttpServer())
      .get(base + 'sessions/' + official)
      .expect(401);
  });
  it('pending links never appear in learner, calendar, notification or list DTO', async () => {
    const r = await api(f.teacher.id)
      .post(base + 'sessions/' + official + '/meet')
      .send({ ...fresh(), url: 'https://meet.google.com/abc-defg-hij' })
      .expect(201);
    meet = r.body.id;
    for (const path of ['sessions/' + official, 'notifications', 'classes/' + f.classroom.id]) {
      const x = await api(f.learner.id)
        .get(base + path)
        .expect(200);
      expect(JSON.stringify(x.body)).not.toContain('meet.google.com');
    }
    await api(f.learner.id)
      .get(base + 'reviews/meet/' + meet)
      .expect(404);
    const detail = await api(f.planningApprover.id)
      .get(base + 'reviews/meet/' + meet)
      .expect(200);
    expect(detail.body.url).toBe('https://meet.google.com/abc-defg-hij');
  });
  it('approval needs live explicit CLASS grant; two commands yield one approved revision/outbox', async () => {
    const b = { ...fresh(), decision: 'APPROVED' };
    await api(f.ungrantedAcademic.id)
      .post(base + 'reviews/meet/' + meet)
      .send(b)
      .expect(404);
    const results = await Promise.all([
      api(f.planningApprover.id)
        .post(base + 'reviews/meet/' + meet)
        .send(b),
      api(f.planningApprover.id)
        .post(base + 'reviews/meet/' + meet)
        .send(b),
    ]);
    expect(results.map((x) => x.status)).toEqual([201, 201]);
    for (const u of [f.learner, f.teacher, f.inspector])
      await api(u.id)
        .get(base + 'sessions/' + official)
        .expect(200)
        .then((r) => expect(r.body.meetUrl).toBe('https://meet.google.com/abc-defg-hij'));
    const n = await api(f.learner.id)
      .get(base + 'notifications')
      .expect(200);
    expect(JSON.stringify(n.body)).not.toContain('meet.google.com');
    expect(n.body.data.filter((x: { kind: string }) => x.kind === 'MEET_APPROVED')).toHaveLength(1);
  });
  it('new pending/rejected revision invalidates earlier link', async () => {
    const r = await api(f.teacher.id)
      .post(base + 'sessions/' + official + '/meet')
      .send({ ...fresh(), url: 'https://meet.google.com/klm-nopq-rst' })
      .expect(201);
    await api(f.learner.id)
      .get(base + 'sessions/' + official)
      .expect(200)
      .then((x) => expect(x.body.meetUrl).toBeNull());
    await api(f.planningApprover.id)
      .post(base + 'reviews/meet/' + r.body.id)
      .send({ ...fresh(), decision: 'REJECTED' })
      .expect(201);
    await api(f.learner.id)
      .get(base + 'sessions/' + official)
      .expect(200)
      .then((x) => expect(x.body.meetUrl).toBeNull());
  });
  it('PostgreSQL deterministic clock seam start/+10min/end -1/0/+1ms; not real HTTP at exact instants', async () => {
    const cases: [number, string][] = [
      [-1, 'CLOSED'],
      [0, 'PRESENT'],
      [1, 'PRESENT'],
      [599999, 'PRESENT'],
      [600000, 'PRESENT'],
      [600001, 'LATE'],
      [1199999, 'LATE'],
      [1200000, 'CLOSED'],
      [1200001, 'CLOSED'],
    ];
    for (const [ms, status] of cases) {
      const [r] = await dev.prisma.$queryRaw<
        { status: string }[]
      >`SELECT w06_status_at('2030-01-01T00:00Z'::timestamptz+${ms}*interval '1 millisecond','2030-01-01T00:00Z','2030-01-01T00:20Z') AS status`;
      expect(r.status).toBe(status);
      traces.push({ test: 'PG_CLOCK_SEAM_NOT_REAL_HTTP', ms, status });
    }
  });
  it('real wall-clock opens, code rotates, concurrent duplicate check-in keeps one receipt', async () => {
    const s = await dev.prisma.teachingSession.findUniqueOrThrow({ where: { id: official } });
    const [c] = await dev.prisma.$queryRaw<
      { ms: number }[]
    >`SELECT extract(epoch FROM clock_timestamp())::double precision*1000 AS ms`;
    const wait = s.startsAt.getTime() - c.ms + 50;
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    const b = { key: randomUUID() };
    const code = await api(f.teacher.id)
      .post(base + 'sessions/' + official + '/code')
      .send(b)
      .expect(201);
    expect(code.body.code).toMatch(/^[A-F0-9]{20}$/);
    await api(f.teacher.id)
      .post(base + 'sessions/' + official + '/code')
      .send(b)
      .expect(201)
      .then((r) => expect(r.body.code).toBeNull());
    const command = { key: randomUUID(), code: code.body.code };
    const out = await Promise.all([
      api(f.learner.id)
        .post(base + 'sessions/' + official + '/checkin')
        .send(command),
      api(f.learner.id)
        .post(base + 'sessions/' + official + '/checkin')
        .send(command),
    ]);
    expect(out.map((x) => x.status)).toEqual([201, 201]);
    expect(out[0].body.receipt.id).toBe(out[1].body.receipt.id);
    receipt = out[0].body.receipt.id;
    expect(out[0].body.receipt.status).toBe('PRESENT');
    expect(await dev.prisma.w06Receipt.count({ where: { window: { sessionId: official } } })).toBe(
      1,
    );
    traces.push({
      test: 'WALL_CLOCK_CHECKIN',
      receipt,
      acceptedAt: out[0].body.receipt.acceptedAt,
      sessionStart: s.startsAt.toISOString(),
      concurrent: 2,
      rows: 1,
    });
  }, 30000);
  it('real code expiry/rotation and durable five-failure rate limit, no code in roster/audit', async () => {
    const student = f.contenders[0];
    await dev.prisma.enrollment.create({
      data: { learnerId: student.id, classOfferingId: f.classroom.id, status: 'ACTIVE' },
    });
    process.env.W06_CODE_TTL_SECONDS = '1';
    const old = await api(f.teacher.id)
      .post(base + 'sessions/' + official + '/code')
      .send({ key: randomUUID() })
      .expect(201);
    await new Promise((r) => setTimeout(r, 1100));
    await api(student.id)
      .post(base + 'sessions/' + official + '/checkin')
      .send({ key: randomUUID(), code: old.body.code })
      .expect(403);
    delete process.env.W06_CODE_TTL_SECONDS;
    const next = await api(f.teacher.id)
      .post(base + 'sessions/' + official + '/code')
      .send({ key: randomUUID() })
      .expect(201);
    for (let i = 0; i < 4; i++)
      await api(student.id)
        .post(base + 'sessions/' + official + '/checkin')
        .send({ key: randomUUID(), code: old.body.code })
        .expect(403);
    await api(student.id)
      .post(base + 'sessions/' + official + '/checkin')
      .send({ key: randomUUID(), code: next.body.code })
      .expect(403)
      .then((r) => expect(r.body.code).toBe('CODE_RATE_LIMITED'));
    const [limit] = await dev.prisma.w06Rate.findMany({ where: { learnerId: student.id } });
    expect(limit.count).toBe(5);
    const roster = await api(f.teacher.id)
      .get(base + 'sessions/' + official + '/roster')
      .expect(200);
    expect(JSON.stringify(roster.body)).not.toContain(next.body.code);
  });
  it('lost ACK retry/reload persists original receipt and no fake final absence', async () => {
    const r = await api(f.learner.id)
      .post(base + 'sessions/' + official + '/checkin')
      .send({ key: randomUUID(), code: '0'.repeat(20) })
      .expect(201);
    expect(r.body.receipt.id).toBe(receipt);
    const v = await api(f.learner.id)
      .get(base + 'sessions/' + official)
      .expect(200);
    expect(v.body.attendance.result.raw.id).toBe(receipt);
  });
  it('correction is independently reviewed with CAS; original raw receipt immutable', async () => {
    const r = await api(f.learner.id)
      .post(base + 'sessions/' + official + '/corrections')
      .send({
        ...fresh(),
        learnerId: f.learner.id,
        baseVersion: 0,
        requestedStatus: 'LATE',
        evidence: 'Synthetic independent evidence; no grade',
      })
      .expect(201);
    await api(f.learner.id)
      .post(base + 'reviews/correction/' + r.body.id)
      .send({ ...fresh(), decision: 'APPROVED' })
      .expect(404);
    const detail = await api(f.planningApprover.id)
      .get(base + 'reviews/correction/' + r.body.id)
      .expect(200);
    expect(detail.body.learner.fullName).toBe(f.learner.fullName);
    await api(f.planningApprover.id)
      .post(base + 'reviews/correction/' + r.body.id)
      .send({ ...fresh(), decision: 'APPROVED' })
      .expect(201);
    const v = await api(f.learner.id)
      .get(base + 'sessions/' + official)
      .expect(200);
    expect(v.body.attendance.result.status).toBe('LATE');
    expect(v.body.attendance.result.raw.status).toBe('PRESENT');
    expect(v.body.attendance.result.version).toBe(1);
    await api(f.teacher.id)
      .post(base + 'sessions/' + official + '/corrections')
      .send({
        ...fresh(),
        learnerId: f.learner.id,
        baseVersion: 0,
        requestedStatus: 'PRESENT',
        evidence: 'stale',
      })
      .expect(409);
    await expect(
      dev.prisma.w06Receipt.update({ where: { id: receipt }, data: { status: 'LATE' } }),
    ).rejects.toThrow();
  });
  it('revoked TT grant hides previously approved session link and notification', async () => {
    await dev.prisma.permissionGrant.updateMany({
      where: { userId: f.inspector.id, capability: 'class.read' },
      data: { revokedAt: new Date(), revokedBy: f.approver.id },
    });
    await api(f.inspector.id)
      .get(base + 'sessions/' + official)
      .expect(404);
    await api(f.inspector.id)
      .get(base + 'notifications')
      .expect(200)
      .then((r) => expect(r.body.data).toEqual([]));
  });
  it('teacher exception routes to an independent official cancellation; old proof/link never transfers', async () => {
    const [n] = await dev.prisma.$queryRaw<
      { ms: number }[]
    >`SELECT extract(epoch FROM clock_timestamp())::double precision*1000 AS ms`;
    const old = await dev.prisma.teachingSession.create({
      data: {
        classOfferingId: f.classroom.id,
        startsAt: new Date(n.ms + 7200000),
        endsAt: new Date(n.ms + 10800000),
        timezone: 'Asia/Ho_Chi_Minh',
        modality: 'ONLINE',
        assignmentId: assignment,
        instructorId: f.teacher.id,
        requiredCapabilities: [],
        proposedBy: f.academic.id,
        reason,
      },
    });
    const pending = await api(f.academic.id)
      .post(academic + 'sessions/' + old.id + '/submit')
      .send({ expectedLockVersion: 0, reason })
      .expect(201);
    await api(f.planningApprover.id)
      .post(academic + 'sessions/' + old.id + '/approve')
      .send({ expectedLockVersion: pending.body.lockVersion, reason })
      .expect(201);
    await api(f.teacher.id)
      .post(base + 'sessions/' + old.id + '/attendance')
      .send({})
      .expect(201);
    const proposal = await api(f.teacher.id)
      .post(base + 'sessions/' + old.id + '/meet')
      .send({ ...fresh(), url: 'https://meet.google.com/uvw-xyza-bcd' })
      .expect(201);
    await api(f.planningApprover.id)
      .post(base + 'reviews/meet/' + proposal.body.id)
      .send({ ...fresh(), decision: 'APPROVED' })
      .expect(201);
    const e = await api(f.teacher.id)
      .post(base + 'sessions/' + old.id + '/exceptions')
      .send({
        ...fresh(),
        kind: 'LEAVE',
        modality: 'ONLINE',
        requiredCapabilities: [],
        timezone: 'Asia/Ho_Chi_Minh',
      })
      .expect(201);
    const routed = await api(f.academic.id)
      .post(base + 'reviews/exception/' + e.body.id)
      .send({ ...fresh(), decision: 'APPROVED' })
      .expect(201);
    expect(routed.body.requiresIndependentOfficialApproval).toBe(true);
    await api(f.learner.id)
      .get('/api/v2/my/events/' + old.id)
      .expect(200);
    const revision = await dev.prisma.teachingSession.findUniqueOrThrow({
      where: { id: routed.body.routedSessionId },
    });
    expect(revision.state).toBe('PENDING_APPROVAL');
    await api(f.academic.id)
      .post(academic + 'sessions/' + revision.id + '/approve')
      .send({ expectedLockVersion: revision.lockVersion, reason })
      .expect(403);
    await api(f.planningApprover.id)
      .post(academic + 'sessions/' + revision.id + '/approve')
      .send({ expectedLockVersion: revision.lockVersion, reason })
      .expect(201);
    await api(f.learner.id)
      .get(base + 'sessions/' + old.id)
      .expect(404);
    await api(f.learner.id)
      .get(base + 'sessions/' + revision.id)
      .expect(404);
    expect(await dev.prisma.w06Window.count({ where: { sessionId: revision.id } })).toBe(0);
    expect(await dev.prisma.w06Meet.count({ where: { sessionId: old.id } })).toBe(1);
    const outbox = await api(f.learner.id)
      .get(base + 'notifications')
      .expect(200);
    expect(outbox.body.data.some((x: { kind: string }) => x.kind === 'CANCEL')).toBe(true);
    expect(JSON.stringify(outbox.body)).not.toContain('meet.google.com');
  });
  it('reschedule and makeup reuse published reservations, new revision needs fresh Meet/window', async () => {
    const [n] = await dev.prisma.$queryRaw<
      { ms: number }[]
    >`SELECT extract(epoch FROM clock_timestamp())::double precision*1000 AS ms`;
    for (const [kind, hour, nextHour] of [
      ['RESCHEDULE', 4, 5],
      ['MAKEUP', 7, 9],
    ] as const) {
      const old = await dev.prisma.teachingSession.create({
        data: {
          classOfferingId: f.classroom.id,
          startsAt: new Date(n.ms + hour * 3600000),
          endsAt: new Date(n.ms + (hour + 0.5) * 3600000),
          timezone: 'Asia/Ho_Chi_Minh',
          modality: 'ONLINE',
          assignmentId: assignment,
          instructorId: f.teacher.id,
          requiredCapabilities: [],
          proposedBy: f.academic.id,
          reason,
        },
      });
      const p = await api(f.academic.id)
        .post(academic + 'sessions/' + old.id + '/submit')
        .send({ expectedLockVersion: 0, reason })
        .expect(201);
      await api(f.planningApprover.id)
        .post(academic + 'sessions/' + old.id + '/approve')
        .send({ expectedLockVersion: p.body.lockVersion, reason })
        .expect(201);
      const proposal = await api(f.teacher.id)
        .post(base + 'sessions/' + old.id + '/exceptions')
        .send({
          ...fresh(),
          kind,
          startLocal: localMinute(new Date(n.ms + nextHour * 3600000), 'Asia/Ho_Chi_Minh'),
          endLocal: localMinute(new Date(n.ms + (nextHour + 0.5) * 3600000), 'Asia/Ho_Chi_Minh'),
          timezone: 'Asia/Ho_Chi_Minh',
          assignmentId: assignment,
          modality: 'ONLINE',
          requiredCapabilities: [],
        })
        .expect(201);
      const routed = await api(f.academic.id)
        .post(base + 'reviews/exception/' + proposal.body.id)
        .send({ ...fresh(), decision: 'APPROVED' })
        .expect(201);
      const revision = await dev.prisma.teachingSession.findUniqueOrThrow({
        where: { id: routed.body.routedSessionId },
      });
      await api(f.planningApprover.id)
        .post(academic + 'sessions/' + revision.id + '/approve')
        .send({ expectedLockVersion: revision.lockVersion, reason })
        .expect(201);
      expect(revision.occurrenceId === old.occurrenceId).toBe(kind === 'RESCHEDULE');
      expect(
        (await dev.prisma.teachingSession.findUniqueOrThrow({ where: { id: old.id } })).state,
      ).toBe(kind === 'RESCHEDULE' ? 'SUPERSEDED' : 'PUBLISHED');
      const v = await api(f.learner.id)
        .get(base + 'sessions/' + revision.id)
        .expect(200);
      expect(v.body.meetUrl).toBeNull();
      expect(v.body.attendance.configured).toBe(false);
      expect(v.body.attendance.result).toBeNull();
      traces.push({
        test: kind,
        source: old.id,
        target: revision.id,
        newMeetRequired: true,
        proofTransferred: false,
      });
    }
  }, 30000);
  it('W06 commands preserve enrollment, fees, CourseVersion and staff grants', async () => {
    const snapshot = async () => ({
      enrollment: await dev.prisma.enrollment.findMany({ orderBy: { id: 'asc' } }),
      classes: await dev.prisma.classOffering.findMany({
        select: {
          id: true,
          pricingType: true,
          tuitionFeeVnd: true,
          versionId: true,
          maxStudents: true,
        },
        orderBy: { id: 'asc' },
      }),
      versions: await dev.prisma.courseVersion.findMany({ orderBy: { id: 'asc' } }),
      grants: await dev.prisma.permissionGrant.findMany({ orderBy: { id: 'asc' } }),
    });
    const before = await snapshot();
    await api(f.teacher.id)
      .post(base + 'sessions/' + official + '/attendance')
      .send({})
      .expect(201);
    await api(f.teacher.id)
      .post(base + 'sessions/' + official + '/code')
      .send({ key: randomUUID() })
      .expect(201);
    await api(f.learner.id)
      .get(base + 'sessions/' + official)
      .expect(200);
    await api(f.teacher.id)
      .get(base + 'sessions/' + official + '/roster')
      .expect(200);
    expect(await snapshot()).toEqual(before);
    traces.push({ test: 'NO_ENROLLMENT_FEE_VERSION_GRANT_SIDE_EFFECT', equal: true });
  });
});
