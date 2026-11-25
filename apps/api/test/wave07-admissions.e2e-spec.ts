import * as request from 'supertest';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { Client } from 'pg';
import { startWave01App } from './wave01-postgres.fixture';
import { seedWave07 } from './wave07.fixture';
import { AdmissionsFinanceService } from '../src/modules/admissions-finance/admissions-finance.service';
const base = '/api/v2/admissions-finance/',
  reason = 'W07 SYNTHETIC TEST review; no real funds';
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7z8AAAAASUVORK5CYII=',
  'base64',
);
// Genuine binary PNG with distinct valid text chunk; no real bank content.
function proof(tag: string) {
  const body = Buffer.from('TEST\0' + tag),
    type = Buffer.from('tEXt'),
    input = Buffer.concat([type, body]);
  let crc = 0xffffffff;
  for (const byte of input) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  const head = Buffer.alloc(4),
    tail = Buffer.alloc(4);
  head.writeUInt32BE(body.length);
  tail.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([png.subarray(0, -12), head, type, body, tail, png.subarray(-12)]);
}
describe('W07 real HTTP/PostgreSQL SYNTHETIC admissions/finance/entitlement', () => {
  let d: Awaited<ReturnType<typeof startWave01App>>,
    f: Awaited<ReturnType<typeof seedWave07>>,
    appId: string,
    feeId: string,
    payment1: string;
  const evidence: object[] = [];
  const api = (u: { id: string }) => f.agents.get(u.id)!,
    fresh = () => ({ key: randomUUID(), reason });
  async function apply(c: { id: string }, u = f.learner) {
    return api(u)
      .post(base + 'applications')
      .send({
        key: randomUUID(),
        classId: c.id,
        consent: true,
        consentVersion: 'W07_SYNTHETIC_ADMISSION_V1',
      })
      .expect(201);
  }
  async function approve(id: string) {
    return api(f.planningApprover)
      .post(base + 'applications/' + id + '/academic-decisions')
      .send({ ...fresh(), decision: 'APPROVE', expectedVersion: 0 })
      .expect(201);
  }
  async function upload(
    fee: string,
    amount: number,
    tag: string,
    u = f.learner,
    key = randomUUID(),
  ) {
    return api(u)
      .post(base + 'obligations/' + fee + '/evidence')
      .field('key', key)
      .field('amountVnd', String(amount))
      .field('sourceRef', 'TEST-' + tag)
      .field('synthetic', 'true')
      .attach('file', proof(tag), { filename: 'SYNTHETIC_TEST.png', contentType: 'image/png' });
  }
  async function full(c: { id: string }, u = f.learner, tag = randomUUID().toUpperCase()) {
    const a = await apply(c, u);
    await approve(a.body.id);
    const v = await api(u)
      .get(base + 'applications/' + a.body.id)
      .expect(200);
    const e = await upload(v.body.obligation.id, 1000000, tag, u);
    expect(e.status).toBe(201);
    await api(f.cashier)
      .post(base + 'evidence/' + e.body.id + '/review')
      .send({ ...fresh(), decision: 'VERIFY' })
      .expect(201);
    return {
      application: a.body.id,
      fee: v.body.obligation.id,
      event: (await api(u).get(base + 'applications/' + a.body.id)).body.events[0].id,
    };
  }
  beforeAll(async () => {
    process.env.W07_ENABLED = 'DEV_DEC049';
    d = await startWave01App();
    f = await seedWave07(d);
    const service = d.app.get(AdmissionsFinanceService),
      original = service.enable.bind(service);
    jest.spyOn(service, 'enable').mockImplementation(async (...args) => {
      try {
        return await original(...args);
      } catch (e) {
        if (!(e instanceof Error) || !('getStatus' in e))
          console.error('W07_ENABLE_DIAGNOSTIC', JSON.stringify(e));
        throw e;
      }
    });
  }, 60000);
  afterAll(async () => {
    await writeFile(
      resolve(process.env.W07_EVIDENCE_ROOT!, 'w07-http-evidence.json'),
      JSON.stringify(evidence, null, 2),
    );
    await d?.app.close();
  });
  it('real scoped class control; guest/QT/TV/GV/TT/role-only cashiers cannot mutate', async () => {
    for (const c of Object.values(f.classes))
      await api(f.academic)
        .post(base + 'classes/' + c.id + '/enable')
        .send(fresh())
        .expect(201);
    await request(d.app.getHttpServer())
      .get(base + 'offers')
      .expect(401);
    for (const u of [f.admin, f.counselor, f.teacher, f.inspector])
      await api(u)
        .post(base + 'classes/' + f.classes.normal.id + '/enable')
        .send(fresh())
        .expect(403);
    for (const u of [f.learner, f.ungrantedAcademic, f.ungrantedCashier, f.cashier])
      await api(u)
        .post(base + 'classes/' + f.classes.normal.id + '/enable')
        .send(fresh())
        .expect(404);
    await api(f.admin).post('/api/admin/class-offerings').send({}).expect(403);
    const publicClass = await request(d.app.getHttpServer())
      .get('/api/class-offerings/' + f.classes.normal.id)
      .expect(200);
    expect(publicClass.body.w07Managed).toBe(true);
    evidence.push({ test: 'public class metadata', status: publicClass.status });
  });
  it('immutable direct application creates no enrollment, no hold, no fee before academic decision', async () => {
    const key = randomUUID(),
      body = {
        key,
        classId: f.classes.normal.id,
        consent: true,
        consentVersion: 'W07_SYNTHETIC_ADMISSION_V1',
      };
    const a = await api(f.learner)
      .post(base + 'applications')
      .send(body)
      .expect(201);
    appId = a.body.id;
    await api(f.learner)
      .post(base + 'applications')
      .send(body)
      .expect(201)
      .then((r) => expect(r.body.id).toBe(appId));
    expect(
      await d.prisma.enrollment.count({
        where: { classOfferingId: f.classes.normal.id, learnerId: f.learner.id },
      }),
    ).toBe(0);
    expect(await d.prisma.w07Obligation.count({ where: { applicationId: appId } })).toBe(0);
    await api(f.learner)
      .get('/api/v2/class-lms/classes/' + f.classes.normal.id)
      .expect(404);
    await api(f.learner)
      .post('/api/enrollments')
      .send({ classOfferingId: f.classes.normal.id })
      .expect(409);
    await api(f.otherLearner)
      .get(base + 'applications/' + appId)
      .expect(404);
    for (const u of [f.learner, f.cashier, f.ungrantedAcademic])
      await api(u)
        .post(base + 'applications/' + appId + '/academic-decisions')
        .send({ ...fresh(), decision: 'APPROVE', expectedVersion: 0 })
        .expect(404);
  });
  it('HVU independent approval creates one immutable obligation, no guessed due/ACTIVE', async () => {
    await approve(appId);
    const v = await api(f.learner)
      .get(base + 'applications/' + appId)
      .expect(200);
    feeId = v.body.obligation.id;
    expect(v.body.obligation.dueVnd).toBe(1000000);
    expect(v.body.obligation.dueAt).toBeNull();
    expect(v.body.obligation.paidVnd).toBe(0);
    expect(v.body.entitlements).toEqual([]);
    await api(f.learner)
      .post(base + 'applications/' + appId + '/activate')
      .send({ key: randomUUID() })
      .expect(201)
      .then((r) => expect(r.body.outcome).toBe('BLOCKED_REVIEW'));
    await expect(
      d.prisma.w07Obligation.update({ where: { id: feeId }, data: { amountVnd: 1 } }),
    ).rejects.toThrow();
  });
  it('private real binary upload/retry, invalid MIME/amount and foreign access never credit funds', async () => {
    const key = randomUUID(),
      tag = randomUUID().toUpperCase(),
      a = await upload(feeId, 400000, tag, f.learner, key);
    expect(a.status).toBe(201);
    const replay = await upload(feeId, 400000, tag, f.learner, key);
    expect(replay.status).toBe(201);
    expect(replay.body.id).toBe(a.body.id);
    await upload(feeId, 400001, tag, f.learner, key).then((r) => expect(r.status).toBe(409));
    await api(f.learner)
      .get(base + 'evidence/' + a.body.id + '/file')
      .expect(200)
      .then((r) => {
        expect(r.body.equals(proof(tag))).toBe(true);
        expect(r.headers['cache-control']).toContain('no-store');
        expect(r.headers['content-disposition']).toContain('attachment');
      });
    for (const u of [f.otherLearner, f.planningApprover, f.ungrantedCashier])
      await api(u)
        .get(base + 'evidence/' + a.body.id + '/file')
        .expect(404);
    await api(f.learner)
      .post(base + 'obligations/' + feeId + '/evidence')
      .field('key', randomUUID())
      .field('amountVnd', '1.5')
      .field('sourceRef', 'TEST-BADFLOAT')
      .field('synthetic', 'true')
      .attach('file', png, { filename: 'TEST.png', contentType: 'image/png' })
      .expect(400);
    await api(f.learner)
      .post(base + 'obligations/' + feeId + '/evidence')
      .field('key', randomUUID())
      .field('amountVnd', '1')
      .field('sourceRef', 'TEST-BADFILE0')
      .field('synthetic', 'true')
      .attach('file', Buffer.from('<svg/>'), { filename: 'TEST.png', contentType: 'image/png' })
      .expect(400);
    const v = await api(f.learner)
      .get(base + 'applications/' + appId)
      .expect(200);
    expect(v.body.obligation.paidVnd).toBe(0);
    expect(v.body.evidence).toHaveLength(1);
    payment1 = a.body.id;
  });
  it('two TN verification requests yield one ledger credit; PARTIAL never opens LMS', async () => {
    const results = await Promise.all([
      api(f.cashier)
        .post(base + 'evidence/' + payment1 + '/review')
        .send({ ...fresh(), decision: 'VERIFY' }),
      api(f.cashier2)
        .post(base + 'evidence/' + payment1 + '/review')
        .send({ ...fresh(), decision: 'VERIFY' }),
    ]);
    expect(results.map((x) => x.status).sort()).toEqual([201, 409]);
    const v = await api(f.learner)
      .get(base + 'applications/' + appId)
      .expect(200);
    expect(v.body.obligation.paidVnd).toBe(400000);
    expect(v.body.obligation.remainingVnd).toBe(600000);
    expect(v.body.obligation.state).toBe('PARTIAL_TEST');
    await api(f.learner)
      .post(base + 'applications/' + appId + '/activate')
      .send({ key: randomUUID() })
      .expect(201)
      .then((r) => expect(r.body.outcome).toBe('BLOCKED_REVIEW'));
    await api(f.learner)
      .get('/api/v2/class-lms/classes/' + f.classes.normal.id)
      .expect(404);
  });
  it('full verified exact TEST obligation then atomic one canonical ACTIVE receipt, refresh/retry', async () => {
    const e = await upload(feeId, 600000, randomUUID().toUpperCase());
    expect(e.status).toBe(201);
    const key = randomUUID(),
      body = { key, reason, decision: 'VERIFY' };
    const a = await api(f.cashier)
      .post(base + 'evidence/' + e.body.id + '/review')
      .send(body)
      .expect(201);
    await api(f.cashier)
      .post(base + 'evidence/' + e.body.id + '/review')
      .send(body)
      .expect(201)
      .then((r) => expect(r.body.id).toBe(a.body.id));
    const activation = { key: randomUUID() },
      out = await Promise.all([
        api(f.learner)
          .post(base + 'applications/' + appId + '/activate')
          .send(activation),
        api(f.learner)
          .post(base + 'applications/' + appId + '/activate')
          .send(activation),
      ]);
    expect(out.map((x) => x.status)).toEqual([201, 201]);
    expect(out[0].body.outcome).toBe('ACTIVE');
    expect(out[0].body.id).toBe(out[1].body.id);
    expect(
      await d.prisma.enrollment.count({
        where: { classOfferingId: f.classes.normal.id, learnerId: f.learner.id, status: 'ACTIVE' },
      }),
    ).toBe(1);
    await api(f.learner)
      .get('/api/v2/class-lms/classes/' + f.classes.normal.id)
      .expect(200);
    await api(f.learner)
      .get('/api/v2/my/classes')
      .expect(200)
      .then((r) =>
        expect(r.body.data.some((c: { id: string }) => c.id === f.classes.normal.id)).toBe(true),
      );
    evidence.push({
      test: 'NORMAL_VERTICAL',
      applicationId: appId,
      obligationId: feeId,
      receiptId: out[0].body.id,
      paid: 1000000,
      syntheticOnly: true,
    });
  });
  it('overpayment is CREDIT_PENDING, never automatic refund or ACTIVE', async () => {
    const a = await apply(f.classes.overpay);
    await approve(a.body.id);
    const v = await api(f.learner)
        .get(base + 'applications/' + a.body.id)
        .expect(200),
      e = await upload(v.body.obligation.id, 1100000, randomUUID().toUpperCase());
    expect(e.status).toBe(201);
    await api(f.cashier)
      .post(base + 'evidence/' + e.body.id + '/review')
      .send({ ...fresh(), decision: 'VERIFY' })
      .expect(201);
    const state = await api(f.learner)
      .get(base + 'applications/' + a.body.id)
      .expect(200);
    expect(state.body.obligation.paidVnd).toBe(1000000);
    expect(state.body.obligation.creditPendingVnd).toBe('100000');
    expect(state.body.obligation.state).toBe('CREDIT_PENDING');
    await api(f.learner)
      .post(base + 'applications/' + a.body.id + '/activate')
      .send({ key: randomUUID() })
      .expect(201)
      .then((r) => expect(r.body.reasonCode).toBe('CREDIT_PENDING'));
  });
  it('two fully paid learners race for last seat: one ACTIVE and one PENDING_CAPACITY', async () => {
    const one = await full(f.classes.raceHttp, f.learner),
      two = await full(f.classes.raceHttp, f.otherLearner),
      out = await Promise.all([
        api(f.learner)
          .post(base + 'applications/' + one.application + '/activate')
          .send({ key: randomUUID() }),
        api(f.otherLearner)
          .post(base + 'applications/' + two.application + '/activate')
          .send({ key: randomUUID() }),
      ]);
    expect(out.map((r) => r.status)).toEqual([201, 201]);
    expect(out.map((r) => r.body.outcome).sort()).toEqual(['ACTIVE', 'PENDING_CAPACITY']);
    expect(
      await d.prisma.enrollment.count({
        where: { classOfferingId: f.classes.raceHttp.id, status: 'ACTIVE' },
      }),
    ).toBe(1);
    evidence.push({
      test: 'HTTP_LAST_SEAT',
      statuses: out.map((r) => r.body.outcome),
      activeRows: 1,
    });
  }, 30000);
  it('refund missing policy blocks approval; independent TEST reversal compensates without deleting money history', async () => {
    const paid = await full(f.classes.reverse),
      refund = await api(f.cashier)
        .post(base + 'events/' + paid.event + '/adjustments')
        .send({
          ...fresh(),
          kind: 'REFUND',
          amountVnd: 1000000,
          evidence: 'Synthetic refund request; no eligibility/payout policy',
        })
        .expect(201);
    expect(refund.body.state).toBe('BLOCKED_REVIEW');
    expect(refund.body.payout).toBe(false);
    await api(f.cashier2)
      .post(base + 'adjustments/' + refund.body.id + '/decision')
      .send({ ...fresh(), decision: 'APPROVE' })
      .expect(409);
    const r = await api(f.cashier)
      .post(base + 'events/' + paid.event + '/adjustments')
      .send({
        ...fresh(),
        kind: 'REVERSAL',
        amountVnd: 1000000,
        evidence: 'Full mistaken TEST verify correction before entitlement',
      })
      .expect(201);
    expect(r.body.state).toBe('PENDING_REVIEW');
    await api(f.cashier)
      .post(base + 'adjustments/' + r.body.id + '/decision')
      .send({ ...fresh(), decision: 'APPROVE' })
      .expect(409);
    await api(f.cashier2)
      .post(base + 'adjustments/' + r.body.id + '/decision')
      .send({ ...fresh(), decision: 'APPROVE' })
      .expect(201)
      .then((x) => expect(x.body.payout).toBe(false));
    const v = await api(f.learner)
      .get(base + 'applications/' + paid.application)
      .expect(200);
    expect(
      v.body.events
        .map((x: { amountVnd: number }) => x.amountVnd)
        .sort((a: number, b: number) => a - b),
    ).toEqual([-1000000, 1000000]);
    expect(v.body.obligation.paidVnd).toBe(0);
    expect(await d.prisma.w07Evidence.count({ where: { obligationId: paid.fee } })).toBe(1);
  }, 30000);
  it('withdrawal before entitlement cancels only academic eligibility; after ACTIVE/transfer remain policy blocked', async () => {
    const p = await full(f.classes.cancel),
      r = await api(f.learner)
        .post(base + 'applications/' + p.application + '/cases')
        .send({ ...fresh(), kind: 'WITHDRAW' })
        .expect(201);
    await api(f.planningApprover)
      .post(base + 'applications/' + p.application + '/academic-decisions')
      .send({ ...fresh(), decision: 'CANCEL', expectedVersion: 1, caseId: r.body.id })
      .expect(201);
    const v = await api(f.learner)
      .get(base + 'applications/' + p.application)
      .expect(200);
    expect(v.body.application.state).toBe('CANCELLED');
    expect(v.body.obligation.paidVnd).toBe(1000000);
    expect(v.body.events).toHaveLength(1);
    await api(f.learner)
      .post(base + 'applications/' + appId + '/cases')
      .send({ ...fresh(), kind: 'WITHDRAW' })
      .expect(201)
      .then((x) => expect(x.body.state).toBe('BLOCKED_REVIEW'));
    await api(f.learner)
      .post(base + 'applications/' + appId + '/cases')
      .send({ ...fresh(), kind: 'TRANSFER', targetClassId: f.classes.overpay.id })
      .expect(201)
      .then((x) => expect(x.body.state).toBe('BLOCKED_REVIEW'));
    await api(f.learner)
      .get('/api/v2/class-lms/classes/' + f.classes.normal.id)
      .expect(200);
  }, 30000);
  it('unknown legacy price and FREE exception fail closed without implicit waiver/repricing', async () => {
    for (const c of [f.classes.unknown, f.classes.free]) {
      const a = await apply(c, f.otherLearner);
      expect(a.body.state).toBe('BLOCKED_REVIEW');
      await api(f.planningApprover)
        .post(base + 'applications/' + a.body.id + '/academic-decisions')
        .send({ ...fresh(), decision: 'APPROVE', expectedVersion: 0 })
        .expect(409);
      expect(await d.prisma.w07Obligation.count({ where: { applicationId: a.body.id } })).toBe(0);
    }
    await expect(
      d.prisma.courseVersion.update({
        where: { id: f.paidVersion },
        data: { standardTuitionFeeVnd: 1 },
      }),
    ).rejects.toThrow();
    expect(
      (await d.prisma.w07Obligation.findUniqueOrThrow({ where: { id: feeId } })).amountVnd,
    ).toBe(1000000);
  });
  it('new approved version cannot reprice historical obligations or class snapshot', async () => {
    const next = await f.version(2000000),
      offer = await f.offering('new-price-vintage', 5, next);
    expect(offer.approvedTuitionFeeVnd).toBe(2000000);
    expect(
      (await d.prisma.w07Obligation.findUniqueOrThrow({ where: { id: feeId } })).amountVnd,
    ).toBe(1000000);
    expect(
      (await d.prisma.w07Application.findUniqueOrThrow({ where: { id: appId } })).courseVersionId,
    ).toBe(f.paidVersion);
    expect(
      (await d.prisma.classOffering.findUniqueOrThrow({ where: { id: f.classes.normal.id } }))
        .approvedTuitionFeeVnd,
    ).toBe(1000000);
  });
  it('revoked finance grant blocks verify/private file; historical role change cannot self-credit academic decision', async () => {
    const app = await d.prisma.w07Application.findFirstOrThrow({
        where: { classId: f.classes.overpay.id, learnerId: f.learner.id },
      }),
      fee = await d.prisma.w07Obligation.findUniqueOrThrow({ where: { applicationId: app.id } }),
      p = await upload(fee.id, 1, randomUUID().toUpperCase());
    expect(p.status).toBe(201);
    const g = f.grants.find(
      (x) =>
        x.userId === f.cashier2.id &&
        x.capability === 'finance.verify' &&
        x.scopeId === f.classes.overpay.id,
    )!;
    await api(f.admin)
      .post('/api/authority/grants/' + g.id + '/revoke')
      .send({ reason })
      .expect(201);
    await api(f.cashier2)
      .get(base + 'evidence/' + p.body.id + '/file')
      .expect(401);
    await api(f.cashier2)
      .post('/api/auth/login')
      .send({ email: f.cashier2.email, password: f.password })
      .expect(200);
    await api(f.cashier2)
      .get(base + 'evidence/' + p.body.id + '/file')
      .expect(404);
    await api(f.cashier2)
      .post(base + 'evidence/' + p.body.id + '/review')
      .send({ ...fresh(), decision: 'VERIFY' })
      .expect(404);
    await d.prisma.user.update({ where: { id: f.planningApprover.id }, data: { role: 'CASHIER' } });
    await d.prisma.permissionGrant.create({
      data: {
        userId: f.planningApprover.id,
        capability: 'finance.verify',
        scopeType: 'CLASS',
        scopeId: app.classId,
        requestedBy: f.approver.id,
        approvedBy: f.secondApprover.id,
        approvedAt: new Date(Date.now() - 1000),
        effectiveAt: new Date(Date.now() - 1000),
        expiresAt: new Date(Date.now() + 3600000),
        reason: 'SYNTHETIC historical role COI negative only',
      },
    });
    try {
      await api(f.planningApprover)
        .post('/api/auth/login')
        .send({ email: f.planningApprover.email, password: f.password })
        .expect(200);
      await api(f.planningApprover)
        .post(base + 'evidence/' + p.body.id + '/review')
        .send({ ...fresh(), decision: 'VERIFY' })
        .expect(409);
    } finally {
      await d.prisma.user.update({
        where: { id: f.planningApprover.id },
        data: { role: 'ACADEMIC_MANAGER' },
      });
      await api(f.planningApprover)
        .post('/api/auth/login')
        .send({ email: f.planningApprover.email, password: f.password })
        .expect(200);
    }
    expect(await d.prisma.w07PaymentEvent.count({ where: { evidenceId: p.body.id } })).toBe(0);
  });
  it('independent PG clients enforce last seat and database uniqueness of money sources', async () => {
    const one = await full(f.classes.racePg, f.learner),
      two = await full(f.classes.racePg, f.otherLearner),
      safe = createRequire(__filename)(
        process.env.W07_CF_RUN_INTENT
          ? '../../../scripts/lib/w07-cf-target.cjs'
          : '../../../scripts/lib/w07-target.cjs',
      ),
      target = safe.stageA(
        process.env,
        JSON.parse(readFileSync(process.env.W07_RECEIPT_PATH!, 'utf8')),
      ),
      a = new Client(target.config),
      b = new Client(target.config);
    try {
      await Promise.all([a.connect(), b.connect()]);
      await safe.stageB(a, target, process.env.W07_CF_RUN_INTENT ? 31 : 30);
      await safe.stageB(b, target, process.env.W07_CF_RUN_INTENT ? 31 : 30);
      const pids = await Promise.all([
        a.query('SELECT pg_backend_pid() AS pid'),
        b.query('SELECT pg_backend_pid() AS pid'),
      ]);
      expect(pids[0].rows[0].pid).not.toBe(pids[1].rows[0].pid);
      const run = async (db: Client, application: string, learner: string, delay: boolean) => {
        await db.query('BEGIN');
        try {
          await db.query('SELECT pg_advisory_xact_lock(842030)');
          const sid = (
              await db.query(
                `SELECT sid FROM user_sessions WHERE sess->>'userId'=$1 AND expire>clock_timestamp() LIMIT 1`,
                [learner],
              )
            ).rows[0].sid,
            key = randomUUID();
          await db.query(
            `SELECT set_config('app.w07_actor',$1,true),set_config('app.w07_session',$2,true),set_config('app.w07_application',$3,true),set_config('app.w07_key',$4,true)`,
            [learner, sid, application, key],
          );
          const gate = (await db.query('SELECT w07_activation($1) AS code', [application])).rows[0]
            .code;
          if (gate === 'READY')
            await db.query(
              `INSERT INTO enrollments(id,"learnerId","classOfferingId",status,"enrolledAt","updatedAt") VALUES($1,$2,$3,'ACTIVE',clock_timestamp(),clock_timestamp())`,
              [randomUUID(), learner, f.classes.racePg.id],
            );
          else
            await db.query(
              `INSERT INTO w07_entitlements("applicationId","learnerId",outcome,"reasonCode",key) VALUES($1,$2,'PENDING_CAPACITY',$3,$4)`,
              [application, learner, gate, key],
            );
          if (delay) await new Promise((r) => setTimeout(r, 200));
          await db.query('COMMIT');
          return gate === 'READY' ? 'ACTIVE' : gate;
        } catch (e) {
          await db.query('ROLLBACK');
          throw e;
        }
      };
      const out = await Promise.all([
        run(a, one.application, f.learner.id, true),
        run(b, two.application, f.otherLearner.id, false),
      ]);
      expect(out.sort()).toEqual(['ACTIVE', 'PENDING_CAPACITY']);
      expect(
        await d.prisma.enrollment.count({
          where: { classOfferingId: f.classes.racePg.id, status: 'ACTIVE' },
        }),
      ).toBe(1);
      evidence.push({
        test: 'TWO_PG_CLIENT_LAST_SEAT',
        backendPids: pids.map((x) => x.rows[0].pid),
        outcomes: out,
        active: 1,
      });
      const indexes = (
        await a.query(
          `SELECT t.relname AS table,array_agg(att.attname::text ORDER BY k.ordinality) AS fields FROM pg_index i JOIN pg_class t ON t.oid=i.indrelid CROSS JOIN LATERAL unnest(i.indkey) WITH ORDINALITY k(attnum,ordinality) JOIN pg_attribute att ON att.attrelid=t.oid AND att.attnum=k.attnum WHERE i.indisunique AND t.relname LIKE 'w07_%' GROUP BY t.relname,i.indexrelid`,
        )
      ).rows;
      for (const [table, col] of [
        ['w07_payment_evidence', 'sourceRef'],
        ['w07_payment_evidence', 'sha256'],
        ['w07_allocations', 'eventId'],
        ['w07_obligations', 'applicationId'],
        ['w07_adjustment_decisions', 'requestId'],
      ])
        expect(
          indexes.some((x) => x.table === table && x.fields.length === 1 && x.fields[0] === col),
        ).toBe(true);
    } finally {
      await Promise.allSettled([a.end(), b.end()]);
    }
  }, 30000);
  it('capability OFF retains DB legacy bypass guard and existing history; logout fails closed', async () => {
    process.env.W07_ENABLED = 'OFF';
    await api(f.learner)
      .get(base + 'applications/' + appId)
      .expect(404);
    await api(f.contenders[0])
      .post('/api/enrollments')
      .send({ classOfferingId: f.classes.normal.id })
      .expect(409);
    process.env.W07_ENABLED = 'DEV_DEC049';
    await api(f.learner)
      .get(base + 'applications/' + appId)
      .expect(200);
    await api(f.learner).post('/api/auth/logout').send({}).expect(204);
    await api(f.learner)
      .get(base + 'applications/' + appId)
      .expect(401);
  });
});
