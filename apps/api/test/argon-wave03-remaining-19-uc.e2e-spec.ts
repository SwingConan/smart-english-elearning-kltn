import * as request from 'supertest';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { resolve } from 'node:path';
import { startWave01App } from './wave01-postgres.fixture';
import { seedWave03A } from './wave03a.fixture';
import { grantAcademic } from './wave02b.fixture';
import { localMinute } from '../src/modules/academic/academic-time';
import { EmailSender } from '../src/infrastructure/email/email-sender';
import { PasswordResetService } from '../src/modules/auth/password-reset.service';
import {
  classifySePayTransfer,
  parseSePayTransfer,
  verifySePayHmac,
} from '../src/modules/admissions-finance/sepay.policy';
import { encodeSafeCsvCell } from '../src/modules/operations/operations-foundation';
import { runArgonWave03BrowserVerification } from './argon-wave03-browser-capture';

const pngBase = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7z8AAAAASUVORK5CYII=',
  'base64',
);

function buildValidReceiptPng(tag: string): Buffer {
  const body = Buffer.from('TEST\0' + tag);
  const type = Buffer.from('tEXt');
  const input = Buffer.concat([type, body]);
  let crc = 0xffffffff;
  for (const byte of input) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  const head = Buffer.alloc(4);
  const tail = Buffer.alloc(4);
  head.writeUInt32BE(body.length);
  tail.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([pngBase.subarray(0, -12), head, type, body, tail, pngBase.subarray(-12)]);
}

function centerDateToday(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

const PO_PRICE_REF = 'PO-DEC071-WAVE03-SYNTHETIC-PRICE-APPROVAL';

async function seedArgonWave03(d: Awaited<ReturnType<typeof startWave01App>>) {
  const f = await seedWave03A(d);
  const reason = 'Synthetic Wave 03 independent authority only';
  const counselor2 = await d.prisma.user.create({
    data: {
      email: 'w05a-' + randomUUID() + '@example.invalid',
      fullName: 'Second synthetic counselor',
      passwordHash: f.counselor.passwordHash,
      role: 'COUNSELOR',
    },
  });
  const cashier2 = await d.prisma.user.create({
    data: {
      email: 'w07-checker-' + randomUUID() + '@example.invalid',
      fullName: 'W07 TEST Finance Checker',
      role: 'CASHIER',
      passwordHash: f.cashier.passwordHash,
    },
  });
  const ungrantedCashier = await d.prisma.user.create({
    data: {
      email: 'w07-no-grant-' + randomUUID() + '@example.invalid',
      fullName: 'W07 TEST Ungranted Cashier',
      role: 'CASHIER',
      passwordHash: f.cashier.passwordHash,
    },
  });

  async function login(u: { id: string; email: string }) {
    const a = request.agent(d.app.getHttpServer());
    await a.post('/api/auth/login').send({ email: u.email, password: f.password }).expect(200);
    f.agents.set(u.id, a);
    return a;
  }

  for (const u of [f.ungrantedAcademic, counselor2, cashier2, ungrantedCashier]) {
    await login(u);
  }

  for (const u of [f.approver, f.secondApprover]) {
    await d.prisma.permissionGrant.create({
      data: {
        userId: u.id,
        requestedBy: f.admin.id,
        approvedBy: u.id === f.approver.id ? f.secondApprover.id : f.approver.id,
        capability: 'authority.approve',
        scopeType: 'GLOBAL',
        reason,
        effectiveAt: new Date(Date.now() - 10000),
        approvedAt: new Date(Date.now() - 10000),
        expiresAt: new Date(Date.now() + 86400000),
      },
    });
  }

  async function grant(u: { id: string; email: string }, capability: string, code?: string) {
    const r = await f.agents
      .get(f.approver.id)!
      .post('/api/authority/grants')
      .send({
        userId: u.id,
        capability,
        scopeType: code ? 'SUPPORT_TOPIC' : 'GLOBAL',
        ...(code ? { scopeId: code } : {}),
        reason,
        effectiveAt: new Date(Date.now() - 1000).toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      })
      .expect(201);
    await f.agents
      .get(f.secondApprover.id)!
      .post('/api/authority/grants/' + r.body.id + '/approve')
      .expect(201);
    await login(u);
    return r.body.id as string;
  }

  await grant(f.academic, 'support.taxonomy.author');
  await grant(f.planningApprover, 'support.taxonomy.approve');

  const topics: { id: string; code: string }[] = [];
  for (const code of ['GENERAL', 'OTHER_SCOPE']) {
    const t = await f.agents
      .get(f.academic.id)!
      .post('/api/v2/support/topics')
      .send({
        idempotencyKey: randomUUID(),
        code,
        title: code === 'GENERAL' ? 'CSKH chung' : 'Phạm vi khác',
        routes: ['ACADEMIC', 'FINANCE', 'LEARNING'],
        reason,
      })
      .expect(201);
    await f.agents
      .get(f.planningApprover.id)!
      .post('/api/v2/support/topics/' + t.body.id + '/approve')
      .send({ idempotencyKey: randomUUID(), expectedLockVersion: 0, reason })
      .expect(201);
    topics.push({ id: t.body.id as string, code });
  }

  const supportGrants: Record<string, string> = {};
  for (const u of [f.counselor, counselor2]) {
    for (const cap of ['read', 'assign', 'reply', 'transfer', 'close']) {
      supportGrants[u.id + cap] = await grant(u, 'support.ticket.' + cap, 'GENERAL');
    }
    supportGrants[u.id + 'app'] = await grant(u, 'support.application.write', 'GENERAL');
  }
  for (const u of [f.planningApprover, f.cashier, f.teacher]) {
    supportGrants[u.id + 'referral'] = await grant(u, 'support.referral.respond', 'GENERAL');
  }
  supportGrants[f.planningApprover.id + 'review'] = await grant(
    f.planningApprover,
    'support.application.review',
    'GENERAL',
  );

  const maker = f.agents.get(f.academic.id)!;
  const checker = f.agents.get(f.planningApprover.id)!;
  const academic = '/api/v2/academic/';
  const [clock] = await d.prisma.$queryRaw<
    { ms: number }[]
  >`SELECT extract(epoch FROM clock_timestamp())::double precision*1000 AS ms`;

  async function approved(
    kind: string,
    row: { id: string; lockVersion: number },
    extra: object = {},
  ) {
    const pending = (
      await maker
        .post(academic + kind + '/' + row.id + '/submit')
        .send({ reason, expectedLockVersion: row.lockVersion })
        .expect(201)
    ).body;
    return (
      await checker
        .post(academic + kind + '/' + row.id + '/approve')
        .send({
          reason,
          expectedLockVersion: pending.lockVersion,
          ...(kind === 'versions'
            ? { poPriceConfirmed: true, poPriceReference: PO_PRICE_REF }
            : {}),
          ...extra,
        })
        .expect(201)
    ).body;
  }

  async function version(amount: number, type: 'PAID' | 'FREE' = 'PAID') {
    const v = (
      await maker
        .post(academic + 'programs/' + f.published.id + '/versions')
        .send({
          title: 'W07 TEST approved program ' + amount,
          description: 'Synthetic class admission price vintage',
          level: 'BASIC',
          skillScope: 'LR',
          standardPricingType: type,
          standardTuitionFeeVnd: amount,
          effectiveFrom: new Date(clock.ms - 1000).toISOString(),
          reason,
        })
        .expect(201)
    ).body;
    const pub = await approved('versions', v);
    return pub.id as string;
  }

  const paidVersion = await version(1000000, 'PAID');
  const freeVersion = await version(0, 'FREE');

  async function offering(name: string, capacity: number, v = paidVersion) {
    const c = await maker
      .post(academic + 'versions/' + v + '/offers')
      .send({
        code: 'W07-' + name + '-' + randomUUID().slice(0, 8),
        name: 'W07 TEST ' + name,
        modality: 'ONLINE',
        maxStudents: capacity,
        enrollmentStart: new Date(clock.ms - 60000).toISOString(),
        enrollmentEnd: new Date(clock.ms + 7 * 86400000).toISOString(),
        classStart: new Date(clock.ms + 8 * 86400000).toISOString(),
        classEnd: new Date(clock.ms + 60 * 86400000).toISOString(),
        reason,
      })
      .expect(201);
    return d.prisma.classOffering.update({
      where: { id: c.body.id },
      data: { status: 'OPEN', instructorId: f.teacher.id },
    });
  }

  const supportClass = await offering('support-counseling', 10, freeVersion);
  await grantAcademic(
    d.prisma,
    f.planningApprover.id,
    f.approver.id,
    f.secondApprover.id,
    'academic.schedule.approve',
    'CLASS',
    supportClass.id,
  );
  const assignment = (
    await maker
      .post(academic + 'classes/' + supportClass.id + '/assignments')
      .send({
        instructorId: f.teacher.id,
        effectiveFrom: new Date(Date.now() + 1000).toISOString(),
        effectiveTo: new Date(Date.now() + 30 * 86400000).toISOString(),
        reason,
      })
      .expect(201)
  ).body;
  const approvedAssignment = await approved('assignments', assignment, {
    eligibilityConfirmed: true,
  });
  const start = new Date(Date.now() + 3 * 86400000);
  const end = new Date(start.getTime() + 3600000);
  const session = (
    await maker
      .post(academic + 'classes/' + supportClass.id + '/sessions')
      .send({
        startLocal: localMinute(start, 'Asia/Ho_Chi_Minh'),
        endLocal: localMinute(end, 'Asia/Ho_Chi_Minh'),
        timezone: 'Asia/Ho_Chi_Minh',
        modality: 'ONLINE',
        assignmentId: approvedAssignment.id,
        requiredCapabilities: [],
        reason,
      })
      .expect(201)
  ).body;
  await approved('sessions', session);

  const normal = await offering('normal', 10);
  const raceHttp = await offering('race-http', 1);
  const racePg = await offering('race-pg', 1);
  const overpay = await offering('overpay', 5);
  const reverse = await offering('reverse', 5);
  const cancel = await offering('cancel', 5);
  const free = await offering('free-policy', 5, freeVersion);
  const unknown = f.classroom;
  const classes = { normal, raceHttp, racePg, overpay, reverse, cancel, free, unknown };
  const grants = [];
  for (const c of [...Object.values(classes), supportClass]) {
    for (const u of [f.academic, f.planningApprover]) {
      grants.push(
        await grantAcademic(
          d.prisma,
          u.id,
          f.approver.id,
          f.secondApprover.id,
          'academic.admission.approve',
          'CLASS',
          c.id,
        ),
      );
    }
    for (const u of [f.cashier, cashier2]) {
      for (const cap of ['finance.verify', 'finance.adjust.propose', 'finance.adjust.approve']) {
        grants.push(
          await grantAcademic(
            d.prisma,
            u.id,
            f.approver.id,
            f.secondApprover.id,
            cap,
            'CLASS',
            c.id,
          ),
        );
      }
    }
  }

  const lesson = await f.agents
    .get(f.teacher.id)!
    .post('/api/v2/class-lms/classes/' + normal.id + '/sections')
    .send({
      title: 'W07 TEST learning section',
      introduction: 'Visible only after canonical ACTIVE entitlement',
    })
    .expect(201);
  await f.agents
    .get(f.teacher.id)!
    .post('/api/v2/class-lms/classes/' + normal.id + '/sections/' + lesson.body.id + '/publish')
    .send({ expectedLockVersion: 0 })
    .expect(201);

  return {
    ...f,
    counselor2,
    cashier2,
    ungrantedCashier,
    topics,
    supportGrants,
    supportClass,
    supportVersion: { id: freeVersion },
    classes,
    paidVersion,
    freeVersion,
    grants,
  };
}

describe('ROAD99 Argon Wave 03 — Remaining 19 UCs (Account, Catalog, CSKH, Admissions, Finance/SePay, Curriculum/Rooms, Admin Authority/Config/Audit, 7-Role Daily Reports)', () => {
  let d: Awaited<ReturnType<typeof startWave01App>>;
  let w05a: Awaited<ReturnType<typeof seedArgonWave03>>;
  let w07: Awaited<ReturnType<typeof seedArgonWave03>>;
  let apiPort = 0;

  const reason = 'Kiểm thử chấp nhận kỹ thuật Wave 03 trên cơ sở dữ liệu tạm thời độc lập';
  const key = () => randomUUID();

  const proofs: Record<string, unknown> = {
    executedAtUtc: new Date().toISOString(),
    groupA_account_recovery_profile_catalog: {},
    groupB_support_counseling_admissions: {},
    groupC_finance_cashier_sepay_adjustments: {},
    groupD_curriculum_rooms_admin_reports: {},
    p1_traceability_reconciliation: {},
    sqlReadbacks: {},
  };

  let registeredStudentId = '';
  let registeredStudentEmail = '';
  let supportTicketId = '';
  let counselingAppId = '';
  let directApplicationId = '';
  let obligationId = '';
  let verifiedEventId = '';
  let newProgramId = '';
  let newVersionId = '';
  let createdRoomId = '';

  beforeAll(async () => {
    process.env.W05A_ENABLED = 'DEV_SUPPORT';
    process.env.W05B_ENABLED = 'DEV_DEC060';
    process.env.W06_ENABLED = 'DEV_DEC047';
    process.env.W07_ENABLED = 'DEV_DEC049';
    process.env.W08_ENABLED = 'DEV_DEC053';
    process.env.W09_ENABLED = 'DEV_W09';
    process.env.W10_REPORT_CSV_ENABLED = 'DEV_W10';
    process.env.REPORT_CENTER_TIME_ZONE = 'Asia/Ho_Chi_Minh';

    d = await startWave01App();
    const [dbId] = await d.prisma.$queryRaw<{ db: string; oid: string }[]>`
      SELECT current_database() AS db, oid::text AS oid
      FROM pg_database
      WHERE datname = current_database()
    `;
    process.env.W07_RUN_INTENT = 'DEC049_DISPOSABLE_ONLY';
    process.env.W07_EXPECTED_DATABASE = dbId.db;
    process.env.W07_VERIFIED_OID = dbId.oid;
    process.env.W07_WORKSPACE_ROOT = resolve(__dirname, '../../..');
    process.env.W07_PROOF_ROOT = resolve(
      process.env.W07_WORKSPACE_ROOT,
      '.local-storage/v2-wave07/proofs',
      dbId.db,
    );

    await d.app.listen(0, '127.0.0.1');
    apiPort = (d.app.getHttpServer().address() as AddressInfo).port;

    w07 = await seedArgonWave03(d);
    w05a = w07;
  }, 180000);

  afterAll(async () => {
    const outDir = resolve(__dirname, '../../../docs/v2/v2-road-to-99-argon-wave03/EVIDENCE');
    await mkdir(outDir, { recursive: true });
    await writeFile(
      resolve(outDir, 'ARGON_WAVE03_E2E_PROOFS.json'),
      JSON.stringify(proofs, null, 2),
      'utf8',
    );
    await d?.app.close();
  });

  it('Group A (UCV2-01..05): Signup with consent & role guard, 7-role login/logout, hashed password reset, profile preferences/password update, and public catalog', async () => {
    const srv = d.app.getHttpServer();

    // UCV2-01: Reject missing consent & reject self-role escalation
    registeredStudentEmail = `hocvien.wave03.${randomUUID().slice(0, 8)}@example.invalid`;
    await request(srv)
      .post('/api/auth/register')
      .send({
        email: registeredStudentEmail,
        password: 'Wave03Password!123',
        fullName: 'Nguyễn Minh Khôi',
        termsAccepted: false,
      })
      .expect(400);

    await request(srv)
      .post('/api/auth/register')
      .send({
        email: registeredStudentEmail,
        password: 'Wave03Password!123',
        fullName: 'Nguyễn Minh Khôi',
        role: 'SYSTEM_ADMIN',
      })
      .expect(400);

    const regRes = await request(srv)
      .post('/api/auth/register')
      .send({
        email: registeredStudentEmail,
        password: 'Wave03Password!123',
        fullName: 'Nguyễn Minh Khôi',
        termsAccepted: true,
      })
      .expect(201);

    expect(regRes.body.role).toBe('STUDENT');
    expect(regRes.body.status).toBe('ACTIVE');
    expect(regRes.body.passwordHash).toBeUndefined();
    registeredStudentId = regRes.body.id;

    // Duplicate email rejected with 409
    await request(srv)
      .post('/api/auth/register')
      .send({
        email: registeredStudentEmail.toUpperCase(),
        password: 'Wave03Password!123',
        fullName: 'Nguyễn Minh Khôi Bản Sao',
        termsAccepted: true,
      })
      .expect(409);

    // UCV2-02: Login, session verification, RBAC guard, and logout
    const studentAgent = request.agent(srv);
    const loginRes = await studentAgent
      .post('/api/auth/login')
      .send({ email: registeredStudentEmail, password: 'Wave03Password!123' })
      .expect(200);
    expect(loginRes.body.id).toBe(registeredStudentId);

    const meRes = await studentAgent.get('/api/auth/me').expect(200);
    expect(meRes.body.email).toBe(registeredStudentEmail);

    // Student cannot access admin accounts or authority
    await studentAgent.get('/api/admin/accounts').expect(403);
    await studentAgent.get('/api/authority').expect(403);

    // UCV2-04: Own profile details & preferences & password change
    const profBefore = await studentAgent.get('/api/auth/profile').expect(200);
    expect(profBefore.body.preferences.timezone).toBe('Asia/Ho_Chi_Minh');

    // Reject privileged field tampering on profile patch
    await studentAgent
      .patch('/api/auth/profile')
      .send({ fullName: 'Hack Role', role: 'SYSTEM_ADMIN' })
      .expect(400);

    const profAfter = await studentAgent
      .patch('/api/auth/profile')
      .send({
        fullName: 'Nguyễn Minh Khôi (TOEIC 650+)',
        phone: '0908112233',
        timezone: 'Asia/Ho_Chi_Minh',
        emailNotifications: true,
        studyGoalNote: 'Đạt TOEIC 650+ trong học kỳ Mùa Thu 2026',
      })
      .expect(200);
    expect(profAfter.body.fullName).toBe('Nguyễn Minh Khôi (TOEIC 650+)');
    expect(profAfter.body.preferences.phone).toBe('0908112233');

    // Change own password & verify wrong current password fails
    await studentAgent
      .post('/api/auth/profile/password')
      .send({ currentPassword: 'WrongPassword!123', newPassword: 'Wave03NewPassword!456' })
      .expect(400);

    await studentAgent
      .post('/api/auth/profile/password')
      .send({ currentPassword: 'Wave03Password!123', newPassword: 'Wave03NewPassword!456' })
      .expect(204);

    // Logout destroys server session
    await studentAgent.post('/api/auth/logout').expect(204);
    await studentAgent.get('/api/auth/me').expect(401);

    // UCV2-03: Password reset request (anti-enumeration + hashed one-time token) & confirm
    const emailSender = d.app.get(EmailSender);
    const resetService = d.app.get(PasswordResetService);
    const sentEmails: Array<{ to: string; text: string }> = [];
    const sendSpy = jest.spyOn(emailSender, 'send').mockImplementation(async (msg) => {
      sentEmails.push({ to: msg.to, text: msg.text });
    });

    try {
      // Unknown email returns 202 without sending email
      await request(srv)
        .post('/api/auth/password-reset/request')
        .send({ email: 'khongtontai.wave03@example.invalid' })
        .expect(202);
      await resetService.waitForPendingRequests();
      expect(sentEmails).toHaveLength(0);

      // Registered active email returns 202 and sends one-time token link
      await request(srv)
        .post('/api/auth/password-reset/request')
        .send({ email: registeredStudentEmail })
        .expect(202);
      await resetService.waitForPendingRequests();
      expect(sentEmails).toHaveLength(1);

      const match = sentEmails[0].text.match(/#token=([A-Za-z0-9_-]+)/);
      expect(match).toBeTruthy();
      const rawToken = match![1];
      const expectedHash = createHash('sha256').update(rawToken).digest('hex');

      const dbToken = await d.prisma.passwordResetToken.findFirstOrThrow({
        where: { userId: registeredStudentId, usedAt: null, revokedAt: null },
      });
      expect(dbToken.tokenHash).toBe(expectedHash);
      expect(dbToken.tokenHash).not.toBe(rawToken);

      await request(srv)
        .post('/api/auth/password-reset/confirm')
        .send({ token: rawToken, newPassword: 'Wave03Recovered!789' })
        .expect(204);

      // Replay of used token must fail with 400
      await request(srv)
        .post('/api/auth/password-reset/confirm')
        .send({ token: rawToken, newPassword: 'AnotherPassword!000' })
        .expect(400);

      // Login with recovered password succeeds
      await request(srv)
        .post('/api/auth/login')
        .send({ email: registeredStudentEmail, password: 'Wave03Recovered!789' })
        .expect(200);
    } finally {
      sendSpy.mockRestore();
    }

    // UCV2-05: Public catalog courses & class offerings
    const catalogRes = await request(srv).get('/api/courses').expect(200);
    expect(Array.isArray(catalogRes.body.data ?? catalogRes.body)).toBe(true);
    const publicClassRes = await request(srv)
      .get('/api/class-offerings/' + w07.classes.normal.id)
      .expect(200);
    expect(publicClassRes.body.id).toBe(w07.classes.normal.id);

    proofs.groupA_account_recovery_profile_catalog = {
      registeredStudentId,
      registeredStudentEmail,
      profilePreferencesSaved: profAfter.body.preferences,
      passwordResetTokenHashedSha256: true,
      publicClassId: publicClassRes.body.id,
    };
  });

  it('Group B (UCV2-09..13): Support intake, TV triage/reply/consent, TV counseling application & HVU correction, and HV admission application + HVU independent approval', async () => {
    const hv = w05a.agents.get(w05a.learner.id)!;
    const otherHv = w05a.agents.get(w05a.otherLearner.id)!;
    const tv = w05a.agents.get(w05a.counselor.id)!;
    const hvu = w05a.agents.get(w05a.planningApprover.id)!;

    // UCV2-09: Learner creates support ticket with explicit consent
    const intakeBody = {
      idempotencyKey: key(),
      topicId: w05a.topics[0].id,
      description:
        'Em cần tư vấn lộ trình học lớp TOEIC Foundation 450+ ca tối thứ 2-4-6 và thủ tục đóng học phí.',
      consent: true,
      consentVersion: 'DEV_SUPPORT_V1',
      contactMethod: 'IN_APP',
    };
    const ticketRes = await hv.post('/api/v2/support/public/tickets').send(intakeBody).expect(201);
    supportTicketId = ticketRes.body.id;
    expect(ticketRes.body.reference).toMatch(/^SE-/);

    // Foreign learner cannot read ticket
    await otherHv.get('/api/v2/support/tickets/' + supportTicketId).expect(404);

    // UCV2-10: TV assigns ticket, posts public reply and internal note
    await tv
      .post('/api/v2/support/tickets/' + supportTicketId + '/actions')
      .send({
        idempotencyKey: key(),
        expectedLockVersion: 0,
        action: 'ASSIGN',
        targetId: w05a.counselor.id,
        reason,
      })
      .expect(201);

    let tDetail = (await tv.get('/api/v2/support/tickets/' + supportTicketId).expect(200)).body;
    await tv
      .post('/api/v2/support/tickets/' + supportTicketId + '/messages')
      .send({
        idempotencyKey: key(),
        expectedLockVersion: tDetail.lockVersion,
        visibility: 'PUBLIC',
        body: 'Chào bạn, Tư vấn viên đã kiểm tra lịch khai giảng lớp TOEIC Foundation 450+ và chuẩn bị hồ sơ đề xuất lớp cho bạn.',
        reason,
      })
      .expect(201);

    // UCV2-11: Learner records APPLICATION consent -> TV drafts counseling application -> submits to HVU -> HVU requests correction -> TV creates v2
    tDetail = (await tv.get('/api/v2/support/tickets/' + supportTicketId).expect(200)).body;
    await hv
      .post('/api/v2/support/tickets/' + supportTicketId + '/consents')
      .send({
        idempotencyKey: key(),
        expectedLockVersion: tDetail.lockVersion,
        purpose: 'APPLICATION',
        granted: true,
        reason,
      })
      .expect(201);

    tDetail = (await tv.get('/api/v2/support/tickets/' + supportTicketId).expect(200)).body;
    const appDraft = await tv
      .post('/api/v2/support/tickets/' + supportTicketId + '/applications')
      .send({
        idempotencyKey: key(),
        expectedLockVersion: tDetail.lockVersion,
        reviewerId: w05a.planningApprover.id,
        needs: 'Học viên cần củng cố kỹ năng Nghe Part 2-3 và Đọc hiểu email thương mại Part 7',
        target: 'Đạt chuẩn đầu ra TOEIC 450+ trong 12 tuần',
        goalLR: 500,
        classId: w05a.supportClass.id,
        courseVersionId: w05a.supportVersion.id,
        reason,
      })
      .expect(201);
    counselingAppId = appDraft.body.id;

    await tv
      .post('/api/v2/support/applications/' + counselingAppId + '/actions')
      .send({ idempotencyKey: key(), expectedLockVersion: 0, action: 'SUBMIT', reason })
      .expect(201);

    await hvu
      .post('/api/v2/support/applications/' + counselingAppId + '/actions')
      .send({ idempotencyKey: key(), expectedLockVersion: 1, action: 'REQUEST_CORRECTION', reason })
      .expect(201);

    tDetail = (await tv.get('/api/v2/support/tickets/' + supportTicketId).expect(200)).body;
    const appV2 = await tv
      .post('/api/v2/support/tickets/' + supportTicketId + '/applications')
      .send({
        idempotencyKey: key(),
        expectedLockVersion: tDetail.lockVersion,
        reviewerId: w05a.planningApprover.id,
        needs: 'Đã bổ sung lịch học ca tối Thứ 2-4-6 và xác nhận mục tiêu đầu ra TOEIC 500+',
        target: 'Đạt chuẩn đầu ra TOEIC 500+ trong học kỳ hiện hành',
        goalLR: 500,
        classId: w05a.supportClass.id,
        courseVersionId: w05a.supportVersion.id,
        reason,
      })
      .expect(201);
    expect(appV2.body.number).toBe(2);

    // UCV2-12 & UCV2-13: Enable W07 classes, learner submits direct admission application, HVU approves -> generates immutable fee obligation
    const w07Api = (u: { id: string }) => w07.agents.get(u.id)!;
    for (const c of Object.values(w07.classes)) {
      await w07Api(w07.academic)
        .post('/api/v2/admissions-finance/classes/' + c.id + '/enable')
        .send({ key: key(), reason })
        .expect(201);
    }

    const admRes = await w07Api(w07.learner)
      .post('/api/v2/admissions-finance/applications')
      .send({
        key: key(),
        classId: w07.classes.normal.id,
        consent: true,
        consentVersion: 'W07_SYNTHETIC_ADMISSION_V1',
      })
      .expect(201);
    directApplicationId = admRes.body.id;

    // Learner cannot access LMS before approval + payment + activation
    await w07Api(w07.learner)
      .get('/api/v2/class-lms/classes/' + w07.classes.normal.id)
      .expect(404);

    // Non-HVU cannot approve admission application
    await w07Api(w07.cashier)
      .post('/api/v2/admissions-finance/applications/' + directApplicationId + '/academic-decisions')
      .send({ key: key(), reason, decision: 'APPROVE', expectedVersion: 0 })
      .expect(404);

    // HVU independent checker approves admission application -> creates obligation
    await w07Api(w07.planningApprover)
      .post('/api/v2/admissions-finance/applications/' + directApplicationId + '/academic-decisions')
      .send({ key: key(), reason, decision: 'APPROVE', expectedVersion: 0 })
      .expect(201);

    const appDetail = await w07Api(w07.learner)
      .get('/api/v2/admissions-finance/applications/' + directApplicationId)
      .expect(200);
    obligationId = appDetail.body.obligation.id;
    expect(appDetail.body.obligation.dueVnd).toBe(1000000);
    expect(appDetail.body.obligation.paidVnd).toBe(0);

    proofs.groupB_support_counseling_admissions = {
      supportTicketId,
      counselingAppV1Id: counselingAppId,
      counselingAppV2Id: appV2.body.id,
      directApplicationId,
      obligationId,
      dueVnd: appDetail.body.obligation.dueVnd,
    };
  });

  it('Group C (UCV2-14..17): Learner evidence upload, TN reconciliation & activation, overpayment CREDIT_PENDING, maker-checker reversal, and SePay HMAC/guard proof', async () => {
    const w07Api = (u: { id: string }) => w07.agents.get(u.id)!;

    // UCV2-14: Learner uploads tuition payment evidence with idempotent retry
    const uploadKey = key();
    const tag = 'WAVE03-EXACT-1M';
    const evRes = await w07Api(w07.learner)
      .post('/api/v2/admissions-finance/obligations/' + obligationId + '/evidence')
      .field('key', uploadKey)
      .field('amountVnd', '1000000')
      .field('sourceRef', 'TEST-VCB-20261109-88241')
      .field('synthetic', 'true')
      .attach('file', buildValidReceiptPng(tag), {
        filename: 'UNC_VCB_1000000.png',
        contentType: 'image/png',
      })
      .expect(201);

    const evReplay = await w07Api(w07.learner)
      .post('/api/v2/admissions-finance/obligations/' + obligationId + '/evidence')
      .field('key', uploadKey)
      .field('amountVnd', '1000000')
      .field('sourceRef', 'TEST-VCB-20261109-88241')
      .field('synthetic', 'true')
      .attach('file', buildValidReceiptPng(tag), {
        filename: 'UNC_VCB_1000000.png',
        contentType: 'image/png',
      })
      .expect(201);
    expect(evReplay.body.id).toBe(evRes.body.id);

    // UCV2-15 & UCV2-16: Cashier (TN) reviews & verifies evidence -> Learner activates enrollment -> LMS unlocked
    const verifyRes = await w07Api(w07.cashier)
      .post('/api/v2/admissions-finance/evidence/' + evRes.body.id + '/review')
      .send({ key: key(), reason, decision: 'VERIFY' })
      .expect(201);
    expect(verifyRes.body.id).toBeDefined();

    const activateRes = await w07Api(w07.learner)
      .post('/api/v2/admissions-finance/applications/' + directApplicationId + '/activate')
      .send({ key: key() })
      .expect(201);
    expect(activateRes.body.outcome).toBe('ACTIVE');

    // Learner now has ACTIVE enrollment and can access class LMS
    await w07Api(w07.learner)
      .get('/api/v2/class-lms/classes/' + w07.classes.normal.id)
      .expect(200);

    // UCV2-17: Overpayment -> CREDIT_PENDING, plus Reversal with independent Maker-Checker
    const overApp = await w07Api(w07.learner)
      .post('/api/v2/admissions-finance/applications')
      .send({
        key: key(),
        classId: w07.classes.overpay.id,
        consent: true,
        consentVersion: 'W07_SYNTHETIC_ADMISSION_V1',
      })
      .expect(201);
    await w07Api(w07.planningApprover)
      .post('/api/v2/admissions-finance/applications/' + overApp.body.id + '/academic-decisions')
      .send({ key: key(), reason, decision: 'APPROVE', expectedVersion: 0 })
      .expect(201);
    const overDetail = await w07Api(w07.learner)
      .get('/api/v2/admissions-finance/applications/' + overApp.body.id)
      .expect(200);
    const overEv = await w07Api(w07.learner)
      .post('/api/v2/admissions-finance/obligations/' + overDetail.body.obligation.id + '/evidence')
      .field('key', key())
      .field('amountVnd', '1150000')
      .field('sourceRef', 'TEST-TCB-OVERPAY-1150K')
      .field('synthetic', 'true')
      .attach('file', buildValidReceiptPng('OVERPAY'), {
        filename: 'OVERPAY.png',
        contentType: 'image/png',
      })
      .expect(201);
    await w07Api(w07.cashier)
      .post('/api/v2/admissions-finance/evidence/' + overEv.body.id + '/review')
      .send({ key: key(), reason, decision: 'VERIFY' })
      .expect(201);
    const overAfter = await w07Api(w07.learner)
      .get('/api/v2/admissions-finance/applications/' + overApp.body.id)
      .expect(200);
    expect(overAfter.body.obligation.state).toBe('CREDIT_PENDING');
    expect(overAfter.body.obligation.creditPendingVnd).toBe('150000');

    // Reversal Maker-Checker on classes.reverse
    const revApp = await w07Api(w07.learner)
      .post('/api/v2/admissions-finance/applications')
      .send({
        key: key(),
        classId: w07.classes.reverse.id,
        consent: true,
        consentVersion: 'W07_SYNTHETIC_ADMISSION_V1',
      })
      .expect(201);
    await w07Api(w07.planningApprover)
      .post('/api/v2/admissions-finance/applications/' + revApp.body.id + '/academic-decisions')
      .send({ key: key(), reason, decision: 'APPROVE', expectedVersion: 0 })
      .expect(201);
    const revDetail = await w07Api(w07.learner)
      .get('/api/v2/admissions-finance/applications/' + revApp.body.id)
      .expect(200);
    const revEv = await w07Api(w07.learner)
      .post('/api/v2/admissions-finance/obligations/' + revDetail.body.obligation.id + '/evidence')
      .field('key', key())
      .field('amountVnd', '1000000')
      .field('sourceRef', 'TEST-REV-1000K-WAVE03')
      .field('synthetic', 'true')
      .attach('file', buildValidReceiptPng('REVERSE'), {
        filename: 'REVERSE.png',
        contentType: 'image/png',
      })
      .expect(201);
    await w07Api(w07.cashier)
      .post('/api/v2/admissions-finance/evidence/' + revEv.body.id + '/review')
      .send({ key: key(), reason, decision: 'VERIFY' })
      .expect(201);
    const revVerified = await w07Api(w07.learner)
      .get('/api/v2/admissions-finance/applications/' + revApp.body.id)
      .expect(200);
    verifiedEventId = revVerified.body.events[0].id;

    const adjProposal = await w07Api(w07.cashier)
      .post('/api/v2/admissions-finance/events/' + verifiedEventId + '/adjustments')
      .send({
        key: key(),
        reason,
        kind: 'REVERSAL',
        amountVnd: 1000000,
        evidence: 'Điều chỉnh đảo bút toán xác nhận nhầm trước khi kích hoạt quyền học',
      })
      .expect(201);
    expect(adjProposal.body.state).toBe('PENDING_REVIEW');

    // Maker cannot self-approve adjustment
    await w07Api(w07.cashier)
      .post('/api/v2/admissions-finance/adjustments/' + adjProposal.body.id + '/decision')
      .send({ key: key(), reason, decision: 'APPROVE' })
      .expect(409);

    // Independent checker (cashier2) approves reversal
    await w07Api(w07.cashier2)
      .post('/api/v2/admissions-finance/adjustments/' + adjProposal.body.id + '/decision')
      .send({ key: key(), reason, decision: 'APPROVE' })
      .expect(201);

    // SePay HMAC-SHA256 & classification contract + 503 non-QA guard verification
    const rawWebhookBuf = Buffer.from(
      JSON.stringify({
        id: 901234,
        gateway: 'MBBank',
        transactionDate: '2026-11-09 14:30:00',
        accountNumber: '0389123456',
        subAccount: 'VA889900',
        code: 'SEV26A12734045E901D06783',
        content: 'Thanh toan hoc phi SEV26A12734045E901D06783',
        transferType: 'in',
        transferAmount: 400000,
        referenceCode: 'FT26313998877',
        description: 'MBVCB.901234.SEV26A12734045E901D06783',
      }),
      'utf8',
    );
    const tsSec = '1794210000';
    const nowMs = 1794210000 * 1000;
    const testSecret = 'sepay-test-hmac-secret-wave03-minimum-32-chars!!';
    const validSig = createHash('sha256').update(testSecret).digest('hex'); // negative check
    const realHmac = require('node:crypto')
      .createHmac('sha256', testSecret)
      .update(tsSec + '.')
      .update(rawWebhookBuf)
      .digest('hex');
    expect(() =>
      verifySePayHmac(rawWebhookBuf, tsSec, `sha256=${realHmac}`, testSecret, nowMs),
    ).not.toThrow();
    expect(() =>
      verifySePayHmac(rawWebhookBuf, tsSec, `sha256=${validSig}`, testSecret, nowMs),
    ).toThrow('SEPAY_SIGNATURE_REQUIRED');

    const parsedTransfer = parseSePayTransfer(rawWebhookBuf);
    const receiverSpec = {
      accountNumber: '0389123456',
      gateway: 'MBBank',
      subAccount: 'VA889900',
    };
    const orderSpec = {
      code: 'SEV26A12734045E901D06783',
      amount: 400000,
      createdAt: new Date('2026-11-09T06:00:00Z'),
    };
    expect(classifySePayTransfer(parsedTransfer, receiverSpec, orderSpec)).toBe(
      'EXACT_MATCH_PENDING_RECONCILIATION',
    );
    expect(
      classifySePayTransfer({ ...parsedTransfer, transferAmount: 350000 }, receiverSpec, orderSpec),
    ).toBe('UNDERPAYMENT');
    expect(
      classifySePayTransfer({ ...parsedTransfer, transferAmount: 450000 }, receiverSpec, orderSpec),
    ).toBe('OVERPAYMENT');

    // Verify 503 non-QA SePay guard is intact on disposable DB
    const sepayGuardRes = await w07Api(w07.learner).get('/api/v2/payments/sepay').expect(503);
    const sepayGuardCode = sepayGuardRes.body.code ?? sepayGuardRes.body.message;
    expect(['UNIFIED_VERIFIED_QA_REQUIRED', 'SEPAY_INTEGRATED_IDENTITY_REQUIRED']).toContain(
      sepayGuardCode,
    );

    proofs.groupC_finance_cashier_sepay_adjustments = {
      evidenceId: evRes.body.id,
      activatedEnrollmentOutcome: activateRes.body.outcome,
      overpaymentState: overAfter.body.obligation.state,
      overpaymentCreditPendingVnd: overAfter.body.obligation.creditPendingVnd,
      reversalAdjustmentId: adjProposal.body.id,
      sepayHmacAndClassificationVerified: true,
      sepay503GuardPreserved: sepayGuardCode,
    };
  });

  it('Group D (UCV2-38, 40, 53..56) & P1 Reconciled UCs: HVU curriculum & rooms, QT authority/masked config/audit, and 7-role daily reports + safe CSV export', async () => {
    const api = (u: { id: string }) => w07.agents.get(u.id)!;

    // UCV2-38: HVU creates a new TOEIC Program, creates a CourseVersion, submits, and independent checker approves
    const progRes = await api(w07.academic)
      .post('/api/v2/academic/programs')
      .send({
        title: 'Chương trình TOEIC Giao tiếp & Đọc hiểu Thương mại Quốc tế 650+',
        description:
          'Chương trình đào tạo chuẩn hóa 4 kỹ năng nghe, nói, đọc, viết trong môi trường doanh nghiệp quốc tế.',
        level: 'INTERMEDIATE',
        skillScope: 'FOUR_SKILLS',
        reason,
      })
      .expect(201);
    newProgramId = progRes.body.id;

    await grantAcademic(
      d.prisma,
      w07.planningApprover.id,
      w07.approver.id,
      w07.secondApprover.id,
      'academic.program.approve',
      'COURSE',
      newProgramId,
    );

    const verRes = await api(w07.academic)
      .post('/api/v2/academic/programs/' + newProgramId + '/versions')
      .send({
        title: 'Phiên bản chuẩn hóa Học kỳ Mùa Thu 2026 (24 buổi)',
        description: 'Bao gồm 6 học phần kỹ năng TOEIC thương mại và 2 bài kiểm tra định kỳ.',
        level: 'INTERMEDIATE',
        skillScope: 'FOUR_SKILLS',
        standardPricingType: 'PAID',
        standardTuitionFeeVnd: 2450000,
        effectiveFrom: new Date(Date.now() - 60000).toISOString(),
        reason,
      })
      .expect(201);
    newVersionId = verRes.body.id;

    const verSub = await api(w07.academic)
      .post('/api/v2/academic/versions/' + newVersionId + '/submit')
      .send({ expectedLockVersion: 0, reason })
      .expect(201);

    // Self-approval by maker must be rejected with 403
    await api(w07.academic)
      .post('/api/v2/academic/versions/' + newVersionId + '/approve')
      .send({
        expectedLockVersion: verSub.body.lockVersion,
        poPriceConfirmed: true,
        poPriceReference: PO_PRICE_REF,
        reason,
      })
      .expect(403);

    const verApp = await api(w07.planningApprover)
      .post('/api/v2/academic/versions/' + newVersionId + '/approve')
      .send({
        expectedLockVersion: verSub.body.lockVersion,
        poPriceConfirmed: true,
        poPriceReference: PO_PRICE_REF,
        reason,
      })
      .expect(201);
    expect(verApp.body.state).toBe('PUBLISHED');

    // UCV2-40: HVU creates & updates classroom/lab room inventory
    const roomCode = 'LAB-A302-' + randomUUID().slice(0, 4).toUpperCase();
    const roomRes = await api(w07.academic)
      .post('/api/v2/academic/rooms')
      .send({
        code: roomCode,
        name: 'Phòng Lab Nghe – Nói Đa phương tiện A302',
        location: 'Cơ sở Quận 1 · Tầng 3',
        status: 'ACTIVE',
        capacity: 32,
        capabilities: ['PROJECTOR'],
        reason,
      })
      .expect(201);
    createdRoomId = roomRes.body.id;

    const roomUpd = await api(w07.academic)
      .patch('/api/v2/academic/rooms/' + createdRoomId)
      .send({
        code: roomCode,
        name: 'Phòng Lab Nghe – Nói Đa phương tiện A302 (Đã nâng cấp tai nghe)',
        location: 'Cơ sở Quận 1 · Tầng 3',
        status: 'MAINTENANCE',
        capacity: 32,
        capabilities: ['PROJECTOR'],
        expectedLockVersion: roomRes.body.lockVersion,
        reason,
      })
      .expect(200);
    expect(roomUpd.body.status).toBe('MAINTENANCE');

    // UCV2-53: QT creates staff account, suspends/restores, proposes & approves role/grant
    const staffEmail = `nhansu.tv.wave03.${randomUUID().slice(0, 6)}@example.invalid`;
    const staffAcc = await api(w07.admin)
      .post('/api/admin/accounts')
      .send({
        fullName: 'Trần Thị Thanh Thảo (Tư vấn viên)',
        email: staffEmail,
        password: 'StaffPassword!123',
        role: 'COUNSELOR',
      })
      .expect(201);

    await api(w07.admin)
      .patch('/api/admin/accounts/' + staffAcc.body.id + '/status')
      .send({ status: 'LOCKED', reason: 'Tạm khóa tài khoản nhân sự để kiểm tra định kỳ' })
      .expect(200);

    await api(w07.admin)
      .patch('/api/admin/accounts/' + staffAcc.body.id + '/status')
      .send({ status: 'ACTIVE', reason: 'Khôi phục trạng thái hoạt động sau khi rà soát' })
      .expect(200);

    const roleReq = await api(w07.approver)
      .post('/api/authority/roles')
      .send({
        userId: staffAcc.body.id,
        nextRole: 'CASHIER',
        reason: 'Điều chuyển nhân sự sang bộ phận Thu ngân học vụ',
      })
      .expect(201);

    // Self-approval of role decision by proposer must fail with 403
    await api(w07.approver)
      .post('/api/authority/roles/' + roleReq.body.id + '/approve')
      .expect(403);

    await api(w07.secondApprover)
      .post('/api/authority/roles/' + roleReq.body.id + '/approve')
      .expect(201);

    // UCV2-54: QT reads masked service configuration & submits config change proposal
    await api(w07.learner).get('/api/v2/operations/system-config').expect(403);
    const sysCfg = await api(w07.admin).get('/api/v2/operations/system-config').expect(200);
    expect(sysCfg.body.settings.some((s: { code: string }) => s.code === 'SEPAY_WEBHOOK_SECRET')).toBe(
      true,
    );
    for (const s of sysCfg.body.settings) {
      if (s.sensitivity === 'SENSITIVE') {
        expect(s.maskedValue).toBe('••••••••');
      }
    }

    // Reject config proposal containing raw secret pattern
    await api(w07.admin)
      .post('/api/v2/operations/system-config/proposals')
      .send({
        settingCode: 'SMTP_CREDENTIALS',
        proposedState: 'REQUEST_OPERATOR_UPDATE',
        reason: 'Cập nhật password=PlaintextSecret123 cho SMTP',
      })
      .expect(400);

    const cfgProposal = await api(w07.admin)
      .post('/api/v2/operations/system-config/proposals')
      .send({
        settingCode: 'EMAIL_PROVIDER',
        proposedState: 'VERIFY_TEST_TRANSPORT',
        reason: 'Đề nghị Operator xác minh cấu hình SMTP sandbox phục vụ khôi phục mật khẩu',
      })
      .expect(201);
    expect(cfgProposal.body.decision).toBe('PENDING_OPERATOR_REVIEW');

    // UCV2-55: QT queries system health and filtered immutable audit log
    await api(w07.learner).get('/api/v2/operations/system-audit').expect(403);
    const sysAudit = await api(w07.admin)
      .get('/api/v2/operations/system-audit?action=CONFIG_CHANGE_PROPOSED&objectType=SYSTEM_CONFIG')
      .expect(200);
    expect(sysAudit.body.health.status).toBe('HEALTHY');
    expect(sysAudit.body.health.database).toBe('CONNECTED');
    expect(sysAudit.body.events.some((e: { id: string }) => e.id === cfgProposal.body.id)).toBe(
      true,
    );

    // UCV2-56: 7-Role Daily Activity Reports + KPI Summary + Safe CSV Export
    const today = centerDateToday();
    const roleActors = [
      { role: 'STUDENT', actor: w07.learner },
      { role: 'INSTRUCTOR', actor: w07.teacher },
      { role: 'COUNSELOR', actor: w05a.counselor },
      { role: 'ACADEMIC_MANAGER', actor: w07.academic },
      { role: 'CASHIER', actor: w07.cashier },
      { role: 'TEACHING_INSPECTOR', actor: w07.inspector },
      { role: 'SYSTEM_ADMIN', actor: w07.admin },
    ];
    const roleReportSummaries: Record<string, unknown> = {};
    for (const item of roleActors) {
      const ag = w07.agents.get(item.actor.id) ?? w05a.agents.get(item.actor.id)!;
      const rep = await ag
        .get(`/api/v2/operations/role-reports?date=${today}&source=ALL`)
        .expect(200);
      expect(rep.body.role).toBe(item.role);
      expect(rep.body.formalReportAuthorized).toBe(true);
      expect(rep.body.metrics.state).toBe('AVAILABLE');
      expect(rep.body.csv.available).toBe(true);
      roleReportSummaries[item.role] = rep.body.metrics.value;
    }

    // Foreign source projection denied with 403
    await api(w07.cashier)
      .get(`/api/v2/operations/role-reports?date=${today}&source=ACCOUNTS`)
      .expect(403);

    // CSV export + CSV formula injection defense verification
    const csvRes = await api(w07.admin)
      .post('/api/v2/operations/role-reports/export')
      .send({ date: today, source: 'ALL' })
      .expect(201);
    expect(csvRes.body.fileName).toContain(today);
    expect(csvRes.body.csv).toContain('date,timeZone,role,sourceCode');
    expect(encodeSafeCsvCell('=SUM(1,2)')).toBe('"\'=SUM(1,2)"');
    expect(encodeSafeCsvCell('+cmd|"/c calc"!A0')).toBe('"\'+cmd|""/c calc""!A0"');
    expect(encodeSafeCsvCell('-2+3')).toBe("'-2+3");
    expect(encodeSafeCsvCell('@IMPORTXML()')).toBe("'@IMPORTXML()");

    proofs.groupD_curriculum_rooms_admin_reports = {
      newProgramId,
      newVersionId,
      createdRoomId,
      staffAccountId: staffAcc.body.id,
      roleDecisionId: roleReq.body.id,
      configProposalId: cfgProposal.body.id,
      systemHealth: sysAudit.body.health,
      roleReportSummaries,
      csvExportFileName: csvRes.body.fileName,
      csvExportRowCount: csvRes.body.rowCount,
    };
  });

  it('Browser CDP E2E Verification: Captures 12 Desktop/Mobile Screenshots across Wave 03 Journeys with 0 Overflow & 0 5xx', async () => {
    const browserReport = await runArgonWave03BrowserVerification({
      apiPort,
      password: w07.password,
      actors: {
        learnerEmail: w07.learner.email,
        counselorEmail: w05a.counselor.email,
        hvuMakerEmail: w07.academic.email,
        hvuCheckerEmail: w07.planningApprover.email,
        cashierEmail: w07.cashier.email,
        adminEmail: w07.admin.email,
      },
      ids: {
        courseId: newProgramId,
        classOfferingId: w07.classes.normal.id,
        supportTicketId,
        admissionApplicationId: directApplicationId,
      },
    });

    expect(browserReport.totalScreenshots).toBe(12);
    expect(browserReport.zero5xxResponses).toBe(true);
    expect(browserReport.zeroHorizontalOverflow).toBe(true);
    proofs.browserVerification = browserReport;
  }, 180000);
});
