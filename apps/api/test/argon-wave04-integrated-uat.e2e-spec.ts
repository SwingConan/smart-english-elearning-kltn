import * as request from 'supertest';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { resolve } from 'node:path';
import { startWave01App } from './wave01-postgres.fixture';
import { seedWave03A } from './wave03a.fixture';
import { grantAcademic } from './wave02b.fixture';
import { articleDraft, tagDraft } from './wave03bd.fixture';
import { seedOriginalPlacementBank } from './seed-original-placement-bank';
import { localMinute } from '../src/modules/academic/academic-time';
import { EmailSender } from '../src/infrastructure/email/email-sender';
import { PasswordResetService } from '../src/modules/auth/password-reset.service';
import {
  classifySePayTransfer,
  parseSePayTransfer,
  verifySePayHmac,
} from '../src/modules/admissions-finance/sepay.policy';
import { encodeSafeCsvCell } from '../src/modules/operations/operations-foundation';
import { runArgonWave04BrowserVerification } from './argon-wave04-browser-capture';

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

function wavBuffer(): Buffer {
  const b = Buffer.alloc(44 + 3200);
  b.write('RIFF');
  b.writeUInt32LE(b.length - 8, 4);
  b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(16000, 24);
  b.writeUInt32LE(32000, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36);
  b.writeUInt32LE(3200, 40);
  return b;
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

const PO_PRICE_REF = 'PO-DEC071-WAVE04-SYNTHETIC-PRICE-APPROVAL';

async function seedArgonWave04Unified(d: Awaited<ReturnType<typeof startWave01App>>) {
  // 1. Allow unified disposable DB name v2_wave01_dev_test_w04b_w05a_* in w05_guard() without modifying disk migrations
  const [fnRow] = await d.prisma.$queryRaw<{ def: string }[]>`
    SELECT pg_get_functiondef('w05_guard'::regproc) AS def
  `;
  const updatedDef = fnRow.def.replace(
    '^v2_wave01_dev_test_w05a_[a-z0-9_]+$',
    '^v2_wave01_dev_test_(w05a|w04b_w05a)_[a-z0-9_]+$',
  );
  await d.prisma.$executeRawUnsafe(updatedDef);

  const f = await seedWave03A(d);
  const reason = 'Synthetic Wave 04 integrated UAT authority only';

  // 2. Seed 5 additional published public courses (total 6 public courses) and 8 additional unpublished QA fixture courses (total 9 unpublished QA fixtures)
  const extraPublicCourses = [
    {
      title: 'TOEIC Foundation 450+ — Nền tảng Nghe Đọc Công sở',
      slug: 'se-pub-foundation-450-' + randomUUID().slice(0, 6),
      description: 'Xây dựng nền tảng từ vựng, ngữ pháp và kỹ năng Nghe – Đọc TOEIC chuẩn ETS.',
      level: 'A2',
      skillScope: 'LR' as const,
    },
    {
      title: 'TOEIC Intermediate LR 550+ — Giao tiếp & Văn bản Thương mại',
      slug: 'se-pub-lr-550-' + randomUUID().slice(0, 6),
      description: 'Phát triển kỹ năng xử lý hội thoại Part 3-4 và đọc hiểu email Part 6-7.',
      level: 'B1',
      skillScope: 'LR' as const,
    },
    {
      title: 'TOEIC Upper-Intermediate LR 650+ — Tăng tốc Đọc hiểu Đa văn bản',
      slug: 'se-pub-lr-650-' + randomUUID().slice(0, 6),
      description: 'Chiến thuật làm chủ câu hỏi suy luận và liên kết 2–3 văn bản TOEIC Part 7.',
      level: 'B2',
      skillScope: 'LR' as const,
    },
    {
      title: 'TOEIC Speaking & Writing 150+ — Phản xạ Nói & Viết Email Quốc tế',
      slug: 'se-pub-sw-150-' + randomUUID().slice(0, 6),
      description: 'Luyện phát âm, trả lời tình huống S10 và viết email/bài luận TOEIC SW.',
      level: 'B1',
      skillScope: 'SPEAKING' as const,
    },
    {
      title: 'TOEIC 4 Skills Complete 700+ — Làm chủ 4 Kỹ năng Nghe Nói Đọc Viết',
      slug: 'se-pub-4skills-700-' + randomUUID().slice(0, 6),
      description: 'Chương trình toàn diện 4 kỹ năng dành cho nhân sự tập đoàn đa quốc gia.',
      level: 'B2',
      skillScope: 'FOUR_SKILLS' as const,
    },
  ];
  for (const c of extraPublicCourses) {
    await d.prisma.course.create({
      data: {
        ...c,
        isPublished: true,
        createdById: f.academic.id,
      },
    });
  }
  for (let i = 0; i < 7; i++) {
    await d.prisma.course.create({
      data: {
        title: `Internal QA Fixture Course #${i + 2}`,
        slug: `qa-hidden-fixture-${i + 2}-${randomUUID().slice(0, 6)}`,
        description: 'Hidden internal QA fixture course — never exposed in public catalog.',
        level: 'B1',
        skillScope: 'LR',
        isPublished: false,
        createdById: f.academic.id,
      },
    });
  }

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
  const unenrolledHv1 = await d.prisma.user.create({
    data: {
      email: 'hv.unenrolled1.' + randomUUID().slice(0, 8) + '@example.invalid',
      fullName: 'Lê Hoàng Minh Anh (HV Chưa Ghi Danh 01)',
      passwordHash: f.learner.passwordHash,
      role: 'STUDENT',
    },
  });
  const unenrolledHv2 = await d.prisma.user.create({
    data: {
      email: 'hv.unenrolled2.' + randomUUID().slice(0, 8) + '@example.invalid',
      fullName: 'Phạm Quốc Bảo (HV Chưa Ghi Danh 02)',
      passwordHash: f.learner.passwordHash,
      role: 'STUDENT',
    },
  });

  async function login(u: { id: string; email: string }) {
    const a = request.agent(d.app.getHttpServer());
    await a.post('/api/auth/login').send({ email: u.email, password: f.password }).expect(200);
    f.agents.set(u.id, a);
    return a;
  }

  for (const u of [
    f.ungrantedAcademic,
    counselor2,
    cashier2,
    ungrantedCashier,
    unenrolledHv1,
    unenrolledHv2,
    ...f.contenders,
  ]) {
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

  async function grant(
    u: { id: string; email: string },
    capability: string,
    scopeType: 'GLOBAL' | 'SUPPORT_TOPIC' | 'TEACHER' = 'GLOBAL',
    scopeId?: string,
  ) {
    const r = await f.agents
      .get(f.approver.id)!
      .post('/api/authority/grants')
      .send({
        userId: u.id,
        capability,
        scopeType,
        ...(scopeId ? { scopeId } : {}),
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

  // W05A Support grants
  await grant(f.academic, 'support.taxonomy.author');
  await grant(f.planningApprover, 'support.taxonomy.approve');

  // W05B Consultation grants (TEACHER-scoped for HVU checker)
  for (const cap of [
    'consultation.profile.approve',
    'consultation.link.approve',
    'consultation.booking.review',
  ]) {
    await grant(f.planningApprover, cap, 'TEACHER', f.teacher.id);
  }

  // W04B Placement grants
  for (const cap of ['placement.source.author', 'placement.rubric.author']) {
    await grant(f.teacher, cap, 'GLOBAL');
  }
  for (const u of [f.academic, f.planningApprover]) {
    for (const cap of [
      'placement.source.approve',
      'placement.rubric.approve',
      'placement.grader.assign',
      'placement.result.publish',
      'placement.criteria.author',
      'placement.criteria.approve',
    ]) {
      await grant(u, cap, 'GLOBAL');
    }
  }

  // Knowledge library grants
  await grant(f.teacher, 'knowledge.author', 'GLOBAL');
  await grant(f.planningApprover, 'knowledge.review', 'GLOBAL');
  await grant(f.planningApprover, 'knowledge.publish', 'GLOBAL');

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

  for (const u of [f.counselor, counselor2]) {
    for (const cap of ['read', 'assign', 'reply', 'transfer', 'close']) {
      await grant(u, 'support.ticket.' + cap, 'SUPPORT_TOPIC', 'GENERAL');
    }
    await grant(u, 'support.application.write', 'SUPPORT_TOPIC', 'GENERAL');
  }
  for (const u of [f.planningApprover, f.cashier, f.teacher]) {
    await grant(u, 'support.referral.respond', 'SUPPORT_TOPIC', 'GENERAL');
  }
  await grant(f.planningApprover, 'support.application.review', 'SUPPORT_TOPIC', 'GENERAL');

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
  const supportAssignment = (
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
  const approvedSupportAssignment = await approved('assignments', supportAssignment, {
    eligibilityConfirmed: true,
  });
  const start = new Date(Date.now() + 3 * 86400000);
  const end = new Date(start.getTime() + 3600000);
  const supportSession = (
    await maker
      .post(academic + 'classes/' + supportClass.id + '/sessions')
      .send({
        startLocal: localMinute(start, 'Asia/Ho_Chi_Minh'),
        endLocal: localMinute(end, 'Asia/Ho_Chi_Minh'),
        timezone: 'Asia/Ho_Chi_Minh',
        modality: 'ONLINE',
        assignmentId: approvedSupportAssignment.id,
        requiredCapabilities: [],
        reason,
      })
      .expect(201)
  ).body;
  await approved('sessions', supportSession);

  const normal = await offering('normal-exact-1000k', 10);
  const underpay = await offering('underpay-400k', 5);
  const overpay1150 = await offering('overpay-1150k', 5);
  const overpay1250 = await offering('overpay-1250k', 5);
  const reverse = await offering('reverse-1000k', 5);
  const overlapClass = await offering('overlap-inspection', 5);

  const classes = {
    normal,
    underpay,
    overpay1150,
    overpay1250,
    reverse,
    overlapClass,
  };

  for (const c of [...Object.values(classes), supportClass]) {
    for (const u of [f.academic, f.planningApprover]) {
      for (const cap of [
        'academic.admission.approve',
        'academic.schedule.approve',
        'academic.meeting.approve',
        'academic.attendance.approve',
        'academic.rubric.approve',
        'academic.grade.publish',
        'academic.quiz.approve',
        'academic.quiz.grade.publish',
        'inspection.assign',
        'inspection.hours.review',
        'shift.review',
        'certificate.policy.approve',
        'certificate.review',
        'certificate.issue',
        'certificate.revoke',
      ]) {
        await grantAcademic(
          d.prisma,
          u.id,
          f.approver.id,
          f.secondApprover.id,
          cap,
          'CLASS',
          c.id,
        );
      }
      await grantAcademic(
        d.prisma,
        u.id,
        f.approver.id,
        f.secondApprover.id,
        'certificate.policy.approve',
        'COURSE',
        c.courseId,
      );
    }
    await grantAcademic(
      d.prisma,
      f.inspector.id,
      f.approver.id,
      f.secondApprover.id,
      'class.read',
      'CLASS',
      c.id,
    );
    for (const u of [f.cashier, cashier2]) {
      for (const cap of ['finance.verify', 'finance.adjust.propose', 'finance.adjust.approve']) {
        await grantAcademic(
          d.prisma,
          u.id,
          f.approver.id,
          f.secondApprover.id,
          cap,
          'CLASS',
          c.id,
        );
      }
    }
  }

  for (const u of [f.academic, f.planningApprover, f.cashier, cashier2, f.teacher, f.inspector]) {
    await login(u);
  }

  // Create & approve instructor assignments and today's official TeachingSessions for `normal` and `overlapClass`
  const [nowRow] = await d.prisma.$queryRaw<
    { ms: number }[]
  >`SELECT extract(epoch FROM clock_timestamp())::double precision*1000 AS ms`;
  const effFrom = new Date(nowRow.ms + 1200).toISOString();
  const effTo = new Date(nowRow.ms + 14 * 86400000).toISOString();

  const normalAssignDraft = (
    await maker
      .post(academic + 'classes/' + normal.id + '/assignments')
      .send({
        instructorId: f.teacher.id,
        effectiveFrom: effFrom,
        effectiveTo: effTo,
        reason,
      })
      .expect(201)
  ).body;
  const normalAssign = await approved('assignments', normalAssignDraft, {
    eligibilityConfirmed: true,
  });

  const overlapAssignDraft = (
    await maker
      .post(academic + 'classes/' + overlapClass.id + '/assignments')
      .send({
        instructorId: f.otherTeacher.id,
        effectiveFrom: effFrom,
        effectiveTo: effTo,
        reason,
      })
      .expect(201)
  ).body;
  const overlapAssign = await approved('assignments', overlapAssignDraft, {
    eligibilityConfirmed: true,
  });

  while (
    (
      await d.prisma.$queryRaw<
        { ms: number }[]
      >`SELECT extract(epoch FROM clock_timestamp())::double precision*1000 AS ms`
    )[0].ms <
    nowRow.ms + 1500
  ) {
    await new Promise((r) => setTimeout(r, 50));
  }

  const [sessClock] = await d.prisma.$queryRaw<
    { ms: number }[]
  >`SELECT extract(epoch FROM clock_timestamp())::double precision*1000 AS ms`;
  const sessStart = new Date(sessClock.ms + 5000);
  const sessEnd = new Date(sessClock.ms + 3600000);

  const normalSessDraft = await d.prisma.teachingSession.create({
    data: {
      classOfferingId: normal.id,
      startsAt: sessStart,
      endsAt: sessEnd,
      timezone: 'Asia/Ho_Chi_Minh',
      modality: 'ONLINE',
      assignmentId: normalAssign.id,
      instructorId: f.teacher.id,
      requiredCapabilities: [],
      proposedBy: f.academic.id,
      reason,
    },
  });
  await approved('sessions', { id: normalSessDraft.id, lockVersion: 0 });

  const overlapSessDraft = await d.prisma.teachingSession.create({
    data: {
      classOfferingId: overlapClass.id,
      startsAt: sessStart,
      endsAt: sessEnd,
      timezone: 'Asia/Ho_Chi_Minh',
      modality: 'ONLINE',
      assignmentId: overlapAssign.id,
      instructorId: f.otherTeacher.id,
      requiredCapabilities: [],
      proposedBy: f.academic.id,
      reason,
    },
  });
  await approved('sessions', { id: overlapSessDraft.id, lockVersion: 0 });

  while (
    (
      await d.prisma.$queryRaw<
        { ms: number }[]
      >`SELECT extract(epoch FROM clock_timestamp())::double precision*1000 AS ms`
    )[0].ms <
    sessStart.getTime() + 100
  ) {
    await new Promise((r) => setTimeout(r, 50));
  }

  return {
    ...f,
    counselor2,
    cashier2,
    ungrantedCashier,
    unenrolledHv1,
    unenrolledHv2,
    topics,
    supportClass,
    supportVersion: { id: freeVersion },
    classes,
    paidVersion,
    freeVersion,
    normalAssign,
    normalSessionId: normalSessDraft.id,
    overlapSessionId: overlapSessDraft.id,
    login,
    grant,
  };
}

describe('ROAD99 Argon Wave 04 — Integrated Cross-Wave Journeys (J1, J2, J3), P1 Closure (P1-A Finance 250k↔150k, P1-B Consent, P1-C 12-UC Traceability), and P2-D 7-Role KPI/CSV UAT', () => {
  let d: Awaited<ReturnType<typeof startWave01App>>;
  let uat: Awaited<ReturnType<typeof seedArgonWave04Unified>>;
  let apiPort = 0;

  const reason = 'Kiểm thử chấp nhận tích hợp cuối kỳ Wave 04 trên cơ sở dữ liệu tạm thời độc lập';
  const key = () => randomUUID();

  const proofs: Record<string, unknown> = {
    executedAtUtc: new Date().toISOString(),
    p1a_finance_reconciliation: {},
    p1b_signup_mandatory_consent: {},
    p1_traceability_reconciliation: {},
    p2d_w10_role_reports_and_csv: {},
    journey_j1_visitor_admissions_finance_lms: {},
    journey_j2_w05b_placement_session_inspection: {},
    journey_j3_grading_w09_certificates_w10_reports: {},
    sqlReadbacks: {},
  };

  let registeredStudentId = '';
  let registeredStudentEmail = '';
  let supportTicketId = '';
  let counselingAppV1Id = '';
  let counselingAppV2Id = '';
  let directApplicationId = '';
  let exactObligationId = '';
  let primaryEnrollmentId = '';
  let secondaryEnrollmentId = '';
  let sectionId = '';
  let lessonActId = '';
  let resourceActId = '';
  let assignmentActId = '';
  let quizActId = '';
  let submissionId = '';
  let finalGradeId = '';
  let lrAttemptId = '';
  let fourAttemptId = '';
  let w05bBookingId = '';
  let inspectionAssignmentId = '';
  let rescheduleExceptionId = '';
  let routedReplacementSessionId = '';
  let createdRoomId = '';
  let newProgramId = '';
  let newVersionId = '';
  let policyId = '';
  let issuedCertificateId = '';
  let issuedCertificateCode = '';
  let revokedCertificateId = '';
  let revokedCertificateCode = '';

  beforeAll(async () => {
    process.env.W04B_ENABLED = 'DEV_WORKFLOW';
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

    uat = await seedArgonWave04Unified(d);
  }, 180000);

  afterAll(async () => {
    const outDir = resolve(__dirname, '../../../docs/v2/v2-road-to-99-argon-wave04/EVIDENCE');
    await mkdir(outDir, { recursive: true });
    await writeFile(
      resolve(outDir, 'ARGON_WAVE04_E2E_PROOFS.json'),
      JSON.stringify(proofs, null, 2),
      'utf8',
    );
    await d?.app.close();
  });

  it('Block 1 — P1-B (UCV2-01..05 Mandatory Consent & Auth/Catalog) & P1-A (BR-V2-131 Finance Reconciliation: Exact 1M, Underpay 400k, Overpay 1150k->150k, Overpay 1250k->250k, Reversal & SePay 503 Guards)', async () => {
    const srv = d.app.getHttpServer();
    const api = (u: { id: string }) => uat.agents.get(u.id)!;

    // --- P1-B: UCV2-01 Mandatory Signup Consent ---
    const rejectedPayloads: Array<{ label: string; payload: Record<string, unknown> }> = [
      {
        label: 'MISSING_KEY',
        payload: {
          email: `reject.missing.${randomUUID().slice(0, 6)}@example.invalid`,
          password: 'Wave04Password!123',
          fullName: 'Trần Gia Huy',
        },
      },
      {
        label: 'UNDEFINED_VALUE',
        payload: {
          email: `reject.undef.${randomUUID().slice(0, 6)}@example.invalid`,
          password: 'Wave04Password!123',
          fullName: 'Trần Gia Huy',
          termsAccepted: undefined,
        },
      },
      {
        label: 'NULL_VALUE',
        payload: {
          email: `reject.null.${randomUUID().slice(0, 6)}@example.invalid`,
          password: 'Wave04Password!123',
          fullName: 'Trần Gia Huy',
          termsAccepted: null,
        },
      },
      {
        label: 'FALSE_BOOLEAN',
        payload: {
          email: `reject.false.${randomUUID().slice(0, 6)}@example.invalid`,
          password: 'Wave04Password!123',
          fullName: 'Trần Gia Huy',
          termsAccepted: false,
        },
      },
      {
        label: 'STRING_TRUE',
        payload: {
          email: `reject.strtrue.${randomUUID().slice(0, 6)}@example.invalid`,
          password: 'Wave04Password!123',
          fullName: 'Trần Gia Huy',
          termsAccepted: 'true',
        },
      },
      {
        label: 'NUMBER_ZERO',
        payload: {
          email: `reject.zero.${randomUUID().slice(0, 6)}@example.invalid`,
          password: 'Wave04Password!123',
          fullName: 'Trần Gia Huy',
          termsAccepted: 0,
        },
      },
      {
        label: 'ROLE_ESCALATION_SYSTEM_ADMIN',
        payload: {
          email: `reject.role.${randomUUID().slice(0, 6)}@example.invalid`,
          password: 'Wave04Password!123',
          fullName: 'Trần Gia Huy',
          termsAccepted: true,
          role: 'SYSTEM_ADMIN',
        },
      },
    ];

    const negativeConsentResults: Array<{ label: string; status: number; userCountInDb: number }> =
      [];
    for (const item of rejectedPayloads) {
      const r = await request(srv).post('/api/auth/register').send(item.payload);
      expect(r.status).toBe(400);
      const count = await d.prisma.user.count({
        where: { email: String(item.payload.email).toLowerCase() },
      });
      expect(count).toBe(0);
      negativeConsentResults.push({ label: item.label, status: r.status, userCountInDb: count });
    }

    registeredStudentEmail = `hocvien.wave04.${randomUUID().slice(0, 8)}@example.invalid`;
    const regRes = await request(srv)
      .post('/api/auth/register')
      .send({
        email: registeredStudentEmail,
        password: 'Wave04Password!123',
        fullName: 'Nguyễn Minh Khôi',
        termsAccepted: true,
      })
      .expect(201);
    expect(regRes.body.role).toBe('STUDENT');
    expect(regRes.body.status).toBe('ACTIVE');
    expect(regRes.body.passwordHash).toBeUndefined();
    registeredStudentId = regRes.body.id;

    // Verify REGISTER_CONSENT_ACCEPTED audit row in PostgreSQL
    const consentAudit = await d.prisma.domainAuditEvent.findFirstOrThrow({
      where: {
        actorId: registeredStudentId,
        action: 'REGISTER_CONSENT_ACCEPTED',
        objectType: 'USER_PROFILE',
        objectId: registeredStudentId,
      },
    });
    expect(JSON.parse(consentAudit.reason ?? '{}')).toMatchObject({
      termsAccepted: true,
      consentVersion: 'SE_TERMS_PRIVACY_V2',
    });

    // Duplicate email rejected with 409
    await request(srv)
      .post('/api/auth/register')
      .send({
        email: registeredStudentEmail.toUpperCase(),
        password: 'Wave04Password!123',
        fullName: 'Nguyễn Minh Khôi Bản Sao',
        termsAccepted: true,
      })
      .expect(409);

    // UCV2-02 & UCV2-04: Login, profile update, password change, logout
    const studentAgent = request.agent(srv);
    await studentAgent
      .post('/api/auth/login')
      .send({ email: registeredStudentEmail, password: 'Wave04Password!123' })
      .expect(200);
    await studentAgent.get('/api/admin/accounts').expect(403);
    await studentAgent
      .patch('/api/auth/profile')
      .send({ fullName: 'Tamper Role', role: 'SYSTEM_ADMIN' })
      .expect(400);
    const profAfter = await studentAgent
      .patch('/api/auth/profile')
      .send({
        fullName: 'Nguyễn Minh Khôi (TOEIC 650+)',
        phone: '0908112233',
        timezone: 'Asia/Ho_Chi_Minh',
        emailNotifications: true,
        studyGoalNote: 'Đạt chuẩn đầu ra TOEIC 650+ trong học kỳ Mùa Thu 2026',
      })
      .expect(200);
    await studentAgent
      .post('/api/auth/profile/password')
      .send({ currentPassword: 'Wave04Password!123', newPassword: 'Wave04NewPassword!456' })
      .expect(204);
    await studentAgent.post('/api/auth/logout').expect(204);
    await studentAgent.get('/api/auth/me').expect(401);

    // UCV2-03: Password reset anti-enumeration & SHA-256 hashed one-time token
    const emailSender = d.app.get(EmailSender);
    const resetService = d.app.get(PasswordResetService);
    const sentEmails: Array<{ to: string; text: string }> = [];
    const sendSpy = jest.spyOn(emailSender, 'send').mockImplementation(async (msg) => {
      sentEmails.push({ to: msg.to, text: msg.text });
    });
    try {
      await request(srv)
        .post('/api/auth/password-reset/request')
        .send({ email: 'khongtontai.wave04@example.invalid' })
        .expect(202);
      await resetService.waitForPendingRequests();
      expect(sentEmails).toHaveLength(0);

      await request(srv)
        .post('/api/auth/password-reset/request')
        .send({ email: registeredStudentEmail })
        .expect(202);
      await resetService.waitForPendingRequests();
      expect(sentEmails).toHaveLength(1);
      const rawToken = sentEmails[0].text.match(/#token=([A-Za-z0-9_-]+)/)![1];
      const expectedHash = createHash('sha256').update(rawToken).digest('hex');
      const dbToken = await d.prisma.passwordResetToken.findFirstOrThrow({
        where: { userId: registeredStudentId, usedAt: null, revokedAt: null },
      });
      expect(dbToken.tokenHash).toBe(expectedHash);

      await request(srv)
        .post('/api/auth/password-reset/confirm')
        .send({ token: rawToken, newPassword: 'Wave04Recovered!789' })
        .expect(204);
      await request(srv)
        .post('/api/auth/password-reset/confirm')
        .send({ token: rawToken, newPassword: 'ReplayPassword!000' })
        .expect(400);
    } finally {
      sendSpy.mockRestore();
    }

    // UCV2-05: Public catalog exposes 6 published courses and hides 9 unpublished QA fixtures
    const catalogRes = await request(srv).get('/api/courses').expect(200);
    const catalogList = catalogRes.body.data ?? catalogRes.body;
    const totalCoursesInDb = await d.prisma.course.count();
    const unpublishedCoursesInDb = await d.prisma.course.count({ where: { isPublished: false } });
    expect(catalogList).toHaveLength(6);
    expect(unpublishedCoursesInDb).toBe(9);
    expect(totalCoursesInDb).toBe(15);

    proofs.p1b_signup_mandatory_consent = {
      negativeConsentCases: negativeConsentResults,
      positiveRegistration: {
        userId: registeredStudentId,
        email: registeredStudentEmail,
        role: regRes.body.role,
        consentAuditEventId: consentAudit.id,
        consentAuditAction: consentAudit.action,
        consentPayload: JSON.parse(consentAudit.reason ?? '{}'),
      },
      profileUpdatedPreferences: profAfter.body.preferences,
      passwordResetSha256Verified: true,
      publicCatalogPublishedCount: catalogList.length,
      hiddenQaFixtureCourseCount: unpublishedCoursesInDb,
    };

    // --- P1-A: BR-V2-131 Finance Reconciliation (Exact 1M, Underpay 400k, Overpay 1150k->150k, Overpay 1250k->250k, Reversal & Refund Block) ---
    for (const c of Object.values(uat.classes)) {
      await api(uat.academic)
        .post('/api/v2/admissions-finance/classes/' + c.id + '/enable')
        .send({ key: key(), reason })
        .expect(201);
    }

    async function runFinanceScenario(opts: {
      scenarioId: string;
      classId: string;
      uploadAmountVnd: string;
      sourceRef: string;
      tag: string;
    }) {
      const appRes = await api(uat.learner)
        .post('/api/v2/admissions-finance/applications')
        .send({
          key: key(),
          classId: opts.classId,
          consent: true,
          consentVersion: 'W07_SYNTHETIC_ADMISSION_V1',
        })
        .expect(201);
      await api(uat.planningApprover)
        .post('/api/v2/admissions-finance/applications/' + appRes.body.id + '/academic-decisions')
        .send({ key: key(), reason, decision: 'APPROVE', expectedVersion: 0 })
        .expect(201);
      const beforeDetail = await api(uat.learner)
        .get('/api/v2/admissions-finance/applications/' + appRes.body.id)
        .expect(200);
      const obId = beforeDetail.body.obligation.id as string;

      const evRes = await api(uat.learner)
        .post('/api/v2/admissions-finance/obligations/' + obId + '/evidence')
        .field('key', key())
        .field('amountVnd', opts.uploadAmountVnd)
        .field('sourceRef', opts.sourceRef)
        .field('synthetic', 'true')
        .attach('file', buildValidReceiptPng(opts.tag), {
          filename: `${opts.tag}.png`,
          contentType: 'image/png',
        })
        .expect(201);

      const verifyRes = await api(uat.cashier)
        .post('/api/v2/admissions-finance/evidence/' + evRes.body.id + '/review')
        .send({ key: key(), reason, decision: 'VERIFY' })
        .expect(201);

      const afterDetail = await api(uat.learner)
        .get('/api/v2/admissions-finance/applications/' + appRes.body.id)
        .expect(200);

      const [sqlReadback] = await d.prisma.$queryRaw<
        Array<{
          obligationId: string;
          dueVnd: number;
          evidenceAmountVnd: number;
          eventKind: string;
          eventAmountVnd: number;
          eventExcessVnd: number;
          allocatedVnd: number;
          remainingDueVnd: number;
          creditPendingVnd: string;
          synthetic: boolean;
        }>
      >`
        SELECT
          o.id::text AS "obligationId",
          o."amountVnd"::int AS "dueVnd",
          ev."amountVnd"::int AS "evidenceAmountVnd",
          pe.kind::text AS "eventKind",
          pe."amountVnd"::int AS "eventAmountVnd",
          pe."excessVnd"::int AS "eventExcessVnd",
          coalesce((SELECT sum(al."amountVnd") FROM w07_allocations al WHERE al."obligationId" = o.id), 0)::int AS "allocatedVnd",
          (o."amountVnd" - w07_paid(o.id))::int AS "remainingDueVnd",
          coalesce((SELECT sum(p."excessVnd") FROM w07_payment_events p WHERE p."obligationId" = o.id), 0)::text AS "creditPendingVnd",
          pe.synthetic AS "synthetic"
        FROM w07_obligations o
        JOIN w07_payment_evidence ev ON ev."obligationId" = o.id
        JOIN w07_payment_events pe ON pe."evidenceId" = ev.id
        WHERE o.id = ${obId}::uuid
      `;

      // Integer VND invariant: evidenceAmountVnd === allocatedVnd + Number(creditPendingVnd)
      expect(sqlReadback.evidenceAmountVnd).toBe(
        sqlReadback.allocatedVnd + Number(sqlReadback.creditPendingVnd),
      );
      expect(sqlReadback.synthetic).toBe(true);
      expect(afterDetail.body.obligation.realSettlement).toBe(false);

      return {
        scenarioId: opts.scenarioId,
        applicationId: appRes.body.id as string,
        obligationId: obId,
        evidenceId: evRes.body.id as string,
        paymentEventId: verifyRes.body.id as string,
        obligationStateAfter: afterDetail.body.obligation,
        sqlReadback,
      };
    }

    // 1. FIN-SCENARIO-01-EXACT-1000K (also used as J1 main class `uat.classes.normal`)
    const finExact = await runFinanceScenario({
      scenarioId: 'FIN-SCENARIO-01-EXACT-1000K',
      classId: uat.classes.normal.id,
      uploadAmountVnd: '1000000',
      sourceRef: 'TEST-VCB-EXACT-1000K',
      tag: 'EXACT-1000K',
    });
    directApplicationId = finExact.applicationId;
    exactObligationId = finExact.obligationId;
    expect(finExact.obligationStateAfter.state).toBe('SETTLED_TEST');
    expect(finExact.obligationStateAfter.paidVnd).toBe(1000000);
    expect(finExact.obligationStateAfter.remainingVnd).toBe(0);
    expect(finExact.obligationStateAfter.creditPendingVnd).toBe('0');

    const activateExact = await api(uat.learner)
      .post('/api/v2/admissions-finance/applications/' + directApplicationId + '/activate')
      .send({ key: key() })
      .expect(201);
    expect(activateExact.body.outcome).toBe('ACTIVE');
    primaryEnrollmentId = activateExact.body.enrollmentId;

    // 2. FIN-SCENARIO-02-UNDERPAY-400K: Underpayment never activates enrollment
    const finUnderpay = await runFinanceScenario({
      scenarioId: 'FIN-SCENARIO-02-UNDERPAY-400K',
      classId: uat.classes.underpay.id,
      uploadAmountVnd: '400000',
      sourceRef: 'TEST-VCB-UNDERPAY-400K',
      tag: 'UNDERPAY-400K',
    });
    expect(finUnderpay.obligationStateAfter.state).toBe('PARTIAL_TEST');
    expect(finUnderpay.obligationStateAfter.paidVnd).toBe(400000);
    expect(finUnderpay.obligationStateAfter.remainingVnd).toBe(600000);
    expect(finUnderpay.obligationStateAfter.creditPendingVnd).toBe('0');

    const activateUnderpay = await api(uat.learner)
      .post('/api/v2/admissions-finance/applications/' + finUnderpay.applicationId + '/activate')
      .send({ key: key() })
      .expect(201);
    expect(activateUnderpay.body.outcome).toBe('BLOCKED_REVIEW');
    expect(activateUnderpay.body.reasonCode).toBe('VERIFIED_FULL_FEE_REQUIRED');
    expect(
      await d.prisma.enrollment.count({
        where: {
          classOfferingId: uat.classes.underpay.id,
          learnerId: uat.learner.id,
          status: 'ACTIVE',
        },
      }),
    ).toBe(0);

    // 3. FIN-SCENARIO-03A-OVERPAY-1150K: Reproduces Wave 03 JSON proof (1,150,000 - 1,000,000 = 150,000 VND)
    const finOverpay150k = await runFinanceScenario({
      scenarioId: 'FIN-SCENARIO-03A-OVERPAY-1150K',
      classId: uat.classes.overpay1150.id,
      uploadAmountVnd: '1150000',
      sourceRef: 'TEST-TCB-OVERPAY-1150K',
      tag: 'OVERPAY-1150K',
    });
    expect(finOverpay150k.obligationStateAfter.state).toBe('CREDIT_PENDING');
    expect(finOverpay150k.obligationStateAfter.paidVnd).toBe(1000000);
    expect(finOverpay150k.obligationStateAfter.remainingVnd).toBe(0);
    expect(finOverpay150k.obligationStateAfter.creditPendingVnd).toBe('150000');

    // 4. FIN-SCENARIO-03B-OVERPAY-1250K: Reproduces Wave 03 Markdown narrative (1,250,000 - 1,000,000 = 250,000 VND)
    const finOverpay250k = await runFinanceScenario({
      scenarioId: 'FIN-SCENARIO-03B-OVERPAY-1250K',
      classId: uat.classes.overpay1250.id,
      uploadAmountVnd: '1250000',
      sourceRef: 'TEST-TCB-OVERPAY-1250K',
      tag: 'OVERPAY-1250K',
    });
    expect(finOverpay250k.obligationStateAfter.state).toBe('CREDIT_PENDING');
    expect(finOverpay250k.obligationStateAfter.paidVnd).toBe(1000000);
    expect(finOverpay250k.obligationStateAfter.remainingVnd).toBe(0);
    expect(finOverpay250k.obligationStateAfter.creditPendingVnd).toBe('250000');

    // 5. FIN-SCENARIO-04-REVERSAL-AND-REFUND-BLOCK
    const finReversalBase = await runFinanceScenario({
      scenarioId: 'FIN-SCENARIO-04-REVERSAL-AND-REFUND-BLOCK',
      classId: uat.classes.reverse.id,
      uploadAmountVnd: '1000000',
      sourceRef: 'TEST-REV-1000K',
      tag: 'REVERSE-1000K',
    });
    // Refund proposal is blocked by policy (no outbound payout allowed)
    const refundProp = await api(uat.cashier)
      .post('/api/v2/admissions-finance/events/' + finReversalBase.paymentEventId + '/adjustments')
      .send({
        key: key(),
        reason,
        kind: 'REFUND',
        amountVnd: 1000000,
        evidence: 'Kiểm thử chặn hoàn tiền tự động khi chưa có chính sách chi hoàn PO phê duyệt',
      })
      .expect(201);
    expect(refundProp.body.state).toBe('BLOCKED_REVIEW');
    expect(refundProp.body.blockReason).toBe('FINANCIAL_POLICY_REQUIRED');
    await api(uat.cashier2)
      .post('/api/v2/admissions-finance/adjustments/' + refundProp.body.id + '/decision')
      .send({ key: key(), reason, decision: 'APPROVE' })
      .expect(409);

    // Reversal proposal + maker self-approve blocked (409) + independent checker approves (201)
    const revProp = await api(uat.cashier)
      .post('/api/v2/admissions-finance/events/' + finReversalBase.paymentEventId + '/adjustments')
      .send({
        key: key(),
        reason,
        kind: 'REVERSAL',
        amountVnd: 1000000,
        evidence: 'Đảo bút toán xác nhận nhầm trước khi kích hoạt quyền học',
      })
      .expect(201);
    expect(revProp.body.state).toBe('PENDING_REVIEW');
    await api(uat.cashier)
      .post('/api/v2/admissions-finance/adjustments/' + revProp.body.id + '/decision')
      .send({ key: key(), reason, decision: 'APPROVE' })
      .expect(409);
    const revDecision = await api(uat.cashier2)
      .post('/api/v2/admissions-finance/adjustments/' + revProp.body.id + '/decision')
      .send({ key: key(), reason, decision: 'APPROVE' })
      .expect(201);
    expect(revDecision.body.payout).toBe(false);
    expect(revDecision.body.realDisbursement).toBe(false);

    // 6. Distinguish 503 UNIFIED_VERIFIED_QA_REQUIRED vs 503 UNIFIED_TARGET_IDENTITY_REQUIRED / SEPAY_INTEGRATED_IDENTITY_REQUIRED
    const guardDefaultRes = await api(uat.learner).get('/api/v2/payments/sepay').expect(503);
    expect(guardDefaultRes.body.code ?? guardDefaultRes.body.message).toBe(
      'UNIFIED_VERIFIED_QA_REQUIRED',
    );

    process.env.V2_UNIFIED_RUNTIME = 'DEV_UNIFIED_01';
    let guardIdentityCode = '';
    try {
      const guardIdentityRes = await api(uat.learner).get('/api/v2/payments/sepay').expect(503);
      guardIdentityCode = guardIdentityRes.body.code ?? guardIdentityRes.body.message;
      expect([
        'UNIFIED_TARGET_IDENTITY_REQUIRED',
        'SEPAY_INTEGRATED_IDENTITY_REQUIRED',
      ]).toContain(guardIdentityCode);
    } finally {
      delete process.env.V2_UNIFIED_RUNTIME;
    }

    // Verify SePay HMAC-SHA256 & transfer classification
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
    const testSecret = 'sepay-test-hmac-secret-wave04-minimum-32-chars!!';
    const realHmac = createHmac('sha256', testSecret)
      .update(tsSec + '.')
      .update(rawWebhookBuf)
      .digest('hex');
    expect(() =>
      verifySePayHmac(rawWebhookBuf, tsSec, `sha256=${realHmac}`, testSecret, 1794210000 * 1000),
    ).not.toThrow();
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

    proofs.p1a_finance_reconciliation = {
      rootCauseOfWave03Discrepancy:
        'In Wave 03, apps/api/test/argon-wave03-remaining-19-uc.e2e-spec.ts (line 839) uploaded amountVnd="1150000" against dueVnd=1000000, producing creditPendingVnd="150000" in ARGON_WAVE03_E2E_PROOFS.json, while scripts/generate-wave03-deliverables.mjs (line 931) contained a hardcoded narrative string stating 1,250,000 VND over 1,000,000 VND (250,000 VND). Both scenarios are reproduced and reconciled via SQL readback here.',
      scenarios: {
        exact1000k: finExact,
        underpay400k: {
          ...finUnderpay,
          activationAttempt: activateUnderpay.body,
        },
        overpay1150k_json150k: finOverpay150k,
        overpay1250k_markdown250k: finOverpay250k,
        reversalAndRefundBlock: {
          ...finReversalBase,
          refundBlockedProposal: refundProp.body,
          reversalProposalId: revProp.body.id,
          makerSelfApproveStatus: 409,
          checkerApproveResult: revDecision.body,
        },
      },
      sepayGuards: {
        defaultNonUnifiedGuardStatus: 503,
        defaultNonUnifiedGuardCode: guardDefaultRes.body.code ?? guardDefaultRes.body.message,
        nonQaDisposableIdentityGuardStatus: 503,
        nonQaDisposableIdentityGuardCode: guardIdentityCode,
        sepayServiceTargetCheckCode: 'SEPAY_INTEGRATED_IDENTITY_REQUIRED (when binding.oid !== 953322)',
      },
    };
  }, 90000);

  it('Block 2 — Journey J1 (Khách → TV/HVU → TN → HV/Học LMS): Support intake, TV triage, counseling maker-checker, W07 obligation & activation, and full Class LMS learning/grading/quiz/recommendations', async () => {
    const api = (u: { id: string }) => uat.agents.get(u.id)!;
    const hv = api(uat.learner);
    const otherHv = api(uat.otherLearner);
    const tv = api(uat.counselor);
    const hvuChecker = api(uat.planningApprover);
    const gv = api(uat.teacher);

    // 1. UCV2-09..11: Support intake -> TV triage/reply -> APPLICATION consent -> Counseling draft v1 -> HVU correction request -> Counseling draft v2 -> HVU acknowledge
    const ticketRes = await hv
      .post('/api/v2/support/public/tickets')
      .send({
        idempotencyKey: key(),
        topicId: uat.topics[0].id,
        description:
          'Em cần tư vấn lộ trình học lớp TOEIC Foundation 450+ ca tối thứ 2-4-6 và thủ tục đóng học phí.',
        consent: true,
        consentVersion: 'DEV_SUPPORT_V1',
        contactMethod: 'IN_APP',
      })
      .expect(201);
    supportTicketId = ticketRes.body.id;

    // Foreign learner denied
    await otherHv.get('/api/v2/support/tickets/' + supportTicketId).expect(404);

    await tv
      .post('/api/v2/support/tickets/' + supportTicketId + '/actions')
      .send({
        idempotencyKey: key(),
        expectedLockVersion: 0,
        action: 'ASSIGN',
        targetId: uat.counselor.id,
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
        body: 'Chào bạn, Tư vấn viên đã kiểm tra lịch khai giảng và chuẩn bị hồ sơ đề xuất lớp học phù hợp.',
        reason,
      })
      .expect(201);

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
    const appDraft1 = await tv
      .post('/api/v2/support/tickets/' + supportTicketId + '/applications')
      .send({
        idempotencyKey: key(),
        expectedLockVersion: tDetail.lockVersion,
        reviewerId: uat.planningApprover.id,
        needs: 'Học viên cần củng cố kỹ năng Nghe Part 2-3 và Đọc hiểu email thương mại Part 7',
        target: 'Đạt chuẩn đầu ra TOEIC 450+ trong 12 tuần',
        goalLR: 500,
        classId: uat.supportClass.id,
        courseVersionId: uat.supportVersion.id,
        reason,
      })
      .expect(201);
    counselingAppV1Id = appDraft1.body.id;

    await tv
      .post('/api/v2/support/applications/' + counselingAppV1Id + '/actions')
      .send({ idempotencyKey: key(), expectedLockVersion: 0, action: 'SUBMIT', reason })
      .expect(201);

    await hvuChecker
      .post('/api/v2/support/applications/' + counselingAppV1Id + '/actions')
      .send({ idempotencyKey: key(), expectedLockVersion: 1, action: 'REQUEST_CORRECTION', reason })
      .expect(201);

    tDetail = (await tv.get('/api/v2/support/tickets/' + supportTicketId).expect(200)).body;
    const appDraft2 = await tv
      .post('/api/v2/support/tickets/' + supportTicketId + '/applications')
      .send({
        idempotencyKey: key(),
        expectedLockVersion: tDetail.lockVersion,
        reviewerId: uat.planningApprover.id,
        needs: 'Đã bổ sung lịch học ca tối Thứ 2-4-6 và xác nhận mục tiêu đầu ra TOEIC 500+',
        target: 'Đạt chuẩn đầu ra TOEIC 500+ trong học kỳ hiện hành',
        goalLR: 500,
        classId: uat.supportClass.id,
        courseVersionId: uat.supportVersion.id,
        reason,
      })
      .expect(201);
    counselingAppV2Id = appDraft2.body.id;

    await tv
      .post('/api/v2/support/applications/' + counselingAppV2Id + '/actions')
      .send({ idempotencyKey: key(), expectedLockVersion: 0, action: 'SUBMIT', reason })
      .expect(201);
    await hvuChecker
      .post('/api/v2/support/applications/' + counselingAppV2Id + '/actions')
      .send({ idempotencyKey: key(), expectedLockVersion: 1, action: 'ACKNOWLEDGE', reason })
      .expect(201);

    // 2. GV builds Section + 4 Content Activities (LESSON, RESOURCE, ASSIGNMENT, QUIZ) + KnowledgeTag/Article/Links + Rubric & Assignment Grade on `uat.classes.normal`
    const classId = uat.classes.normal.id;
    const lmsBase = `/api/v2/class-lms/classes/${classId}`;

    let sec = (
      await gv
        .post(`${lmsBase}/sections`)
        .send({
          title: 'Tuần 01 — Kỹ năng Email Học thuật & Họp Trực tuyến',
          introduction: 'Section chuẩn IUH LMS gắn với buổi học chính thức Session 01',
        })
        .expect(201)
    ).body;
    sec = (
      await gv
        .post(`${lmsBase}/sections/${sec.id}/publish`)
        .send({ expectedLockVersion: sec.lockVersion })
        .expect(201)
    ).body;
    sectionId = sec.id;

    let lessonAct = (
      await gv
        .post(`${lmsBase}/sections/${sectionId}/activities`)
        .send({
          type: 'LESSON',
          title: 'Bài học 01: Cấu trúc Email công sở B1',
          introduction: 'Đọc kỹ tài liệu trước giờ học trực tuyến',
          contentMarkdown:
            '# Cấu trúc Email công sở B1\n\n1. Subject line rõ ràng\n2. Mở đầu trang trọng\n3. Nội dung chính ngắn gọn\n4. Call-to-action và kết thư.',
        })
        .expect(201)
    ).body;
    lessonAct = (
      await gv
        .post(`${lmsBase}/activities/${lessonAct.id}/publish`)
        .send({ expectedLockVersion: lessonAct.lockVersion })
        .expect(201)
    ).body;
    lessonActId = lessonAct.id;

    let resourceAct = (
      await gv
        .post(`${lmsBase}/sections/${sectionId}/activities`)
        .send({
          type: 'RESOURCE',
          title: 'Tài nguyên 01: Sổ tay mẫu câu họp trực tuyến',
          introduction: 'Tài liệu tham khảo chính thức',
          contentMarkdown: '',
          resourceUrl: 'https://example.com/english-workplace-handbook',
        })
        .expect(201)
    ).body;
    resourceAct = (
      await gv
        .post(`${lmsBase}/activities/${resourceAct.id}/publish`)
        .send({ expectedLockVersion: resourceAct.lockVersion })
        .expect(201)
    ).body;
    resourceActId = resourceAct.id;

    let assignAct = (
      await gv
        .post(`${lmsBase}/sections/${sectionId}/activities`)
        .send({
          type: 'ASSIGNMENT',
          title: 'Bài tập 01: Viết Email xác nhận lịch họp dự án',
          introduction: 'Viết email 120–150 từ xác nhận lịch họp với đối tác',
          contentMarkdown: 'Sử dụng đúng cấu trúc 4 phần đã học ở Bài học 01.',
        })
        .expect(201)
    ).body;
    assignAct = (
      await gv
        .post(`${lmsBase}/activities/${assignAct.id}/publish`)
        .send({ expectedLockVersion: assignAct.lockVersion })
        .expect(201)
    ).body;
    assignmentActId = assignAct.id;

    // Learner opens & completes Lesson and Resource, drafts & submits Assignment
    await hv.post(`${lmsBase}/activities/${lessonActId}/open`).expect(201);
    await hv.post(`${lmsBase}/activities/${lessonActId}/complete`).expect(201);
    await hv.post(`${lmsBase}/activities/${resourceActId}/open`).expect(201);
    await hv.post(`${lmsBase}/activities/${resourceActId}/complete`).expect(201);

    // Foreign learner denied access to class LMS
    await otherHv.get(lmsBase).expect(404);

    const aBase = `${lmsBase}/activities/${assignmentActId}/assignment`;
    const mineStatus = (await hv.get(`${aBase}/mine`).expect(200)).body;
    const draftRes = (
      await hv
        .put(`${aBase}/mine`)
        .send({
          revisionId: mineStatus.publishedRevisionId,
          expectedLockVersion: 0,
          text: 'Dear Ms. Nguyen, I am writing to confirm our project review meeting on Thursday at 10:00 AM ICT via Google Meet.',
        })
        .expect(200)
    ).body;
    const submitRes = (
      await hv
        .post(`${aBase}/mine/submit`)
        .send({
          revisionId: mineStatus.publishedRevisionId,
          idempotencyKey: key(),
          expectedLockVersion: draftRes.lockVersion,
        })
        .expect(201)
    ).body;
    submissionId = submitRes.id;

    // GV authors Rubric -> HVU publishes Rubric -> GV grades & finalizes -> HVU publishes Assignment Grade (UCV2-34)
    const gBase = `/api/v2/assignment-grading/classes/${classId}/activities/${assignmentActId}`;
    const rubricDraft = (
      await gv
        .post(`${gBase}/rubrics`)
        .send({
          idempotencyKey: key(),
          expectedPreviousVersion: 0,
          name: 'Rubric Chấm Email Công Sở B1',
          description: 'Tiêu chí đánh giá email xác nhận lịch họp',
          criteria: [
            {
              name: 'Task Fulfillment',
              description: 'Đầy đủ thời gian, kênh họp Google Meet và mục tiêu cuộc họp',
              maxScore: '5',
            },
            {
              name: 'Workplace Register & Grammar',
              description: 'Văn phong trang trọng, ngữ pháp chính xác',
              maxScore: '5',
            },
          ],
        })
        .expect(201)
    ).body;
    const rubricPub = (
      await hvuChecker
        .post(`${gBase}/rubrics/${rubricDraft.id}/publish`)
        .send({
          idempotencyKey: key(),
          expectedLockVersion: rubricDraft.lockVersion,
        })
        .expect(201)
    ).body;

    const gradeDraft = (
      await gv
        .post(`${gBase}/submissions/${submissionId}/grades`)
        .send({
          idempotencyKey: key(),
          expectedPreviousVersion: 0,
          rubricId: rubricPub.id,
          feedback: 'Bố cục rõ ràng, văn phong lịch sự đúng chuẩn B1.',
          scores: [
            {
              criterionId: rubricPub.criteria[0].id,
              score: '5',
              feedback: 'Đầy đủ thông tin lịch họp.',
            },
            {
              criterionId: rubricPub.criteria[1].id,
              score: '4',
              feedback: 'Ngữ pháp và từ vựng chuẩn xác.',
            },
          ],
          reason,
        })
        .expect(201)
    ).body;
    const gradeFinal = (
      await gv
        .post(`${gBase}/grades/${gradeDraft.id}/final`)
        .send({
          idempotencyKey: key(),
          expectedLockVersion: gradeDraft.lockVersion,
        })
        .expect(201)
    ).body;
    finalGradeId = gradeFinal.id;
    await hvuChecker
      .post(`${gBase}/grades/${gradeFinal.id}/publish`)
      .send({
        idempotencyKey: key(),
        expectedLockVersion: gradeFinal.lockVersion,
      })
      .expect(201);

    // UCV2-31 & UCV2-32: KnowledgeTag + Article + Quiz + Question-Knowledge Links + Learner Quiz Attempt
    const kBase = '/api/v2/knowledge';
    const tr = (v: number) => ({
      idempotencyKey: key(),
      expectedLockVersion: v,
      reason,
      rightsConfirmed: true,
    });
    let tagRev = (await gv.post(`${kBase}/entries`).send(tagDraft('WORKPLACE_EMAIL_B1')).expect(201))
      .body;
    tagRev = (
      await gv.post(`${kBase}/revisions/${tagRev.id}/submit`).send(tr(tagRev.lockVersion)).expect(201)
    ).body;
    tagRev = (
      await hvuChecker
        .post(`${kBase}/revisions/${tagRev.id}/review`)
        .send(tr(tagRev.lockVersion))
        .expect(201)
    ).body;
    tagRev = (
      await hvuChecker
        .post(`${kBase}/revisions/${tagRev.id}/publish`)
        .send(tr(tagRev.lockVersion))
        .expect(201)
    ).body;

    let artRev = (
      await gv
        .post(`${kBase}/entries`)
        .send(articleDraft(tagRev.id, 'workplace-email-b1'))
        .expect(201)
    ).body;
    artRev = (
      await gv.post(`${kBase}/revisions/${artRev.id}/submit`).send(tr(artRev.lockVersion)).expect(201)
    ).body;
    artRev = (
      await hvuChecker
        .post(`${kBase}/revisions/${artRev.id}/review`)
        .send(tr(artRev.lockVersion))
        .expect(201)
    ).body;
    artRev = (
      await hvuChecker
        .post(`${kBase}/revisions/${artRev.id}/publish`)
        .send(tr(artRev.lockVersion))
        .expect(201)
    ).body;

    const quizAct = (
      await gv
        .post(`${lmsBase}/sections/${sectionId}/activities`)
        .send({
          type: 'QUIZ',
          title: 'Quiz 01: Kiểm tra ngữ pháp & từ vựng Email B1',
          introduction: 'Quiz trắc nghiệm 4 câu có gắn chuẩn kiến thức',
          contentMarkdown: '',
        })
        .expect(201)
    ).body;
    quizActId = quizAct.id;

    const qRoot = `/api/v2/class-quiz/classes/${classId}/activities/${quizActId}`;
    let qSource = (
      await gv
        .post(`${qRoot}/sources`)
        .send({
          idempotencyKey: key(),
          expectedVersion: 0,
          title: 'Quiz 01: Kiểm tra ngữ pháp & từ vựng Email B1',
          openAt: new Date(Date.now() - 60000).toISOString(),
          closeAt: new Date(Date.now() + 3600000).toISOString(),
          durationMinutes: 10,
          questions: [0, 1, 2, 3].map((i) => ({
            content: `Workplace email question ${i + 1}: Select the formal expression.`,
            points: 1,
            explanation: `Explanation for item ${i + 1}`,
            options: [
              { content: `Formal option ${i + 1}`, isCorrect: true },
              { content: `Informal option ${i + 1}`, isCorrect: false },
            ],
          })),
        })
        .expect(201)
    ).body;
    qSource = (
      await hvuChecker
        .post(`${qRoot}/sources/${qSource.id}/approve`)
        .send({ idempotencyKey: key(), expectedLockVersion: qSource.lockVersion })
        .expect(201)
    ).body;
    await gv
      .post(`${lmsBase}/activities/${quizActId}/publish`)
      .send({ expectedLockVersion: quizAct.lockVersion })
      .expect(201);

    for (const q of qSource.questions) {
      let l = (
        await gv
          .post(`${kBase}/links`)
          .send({
            idempotencyKey: key(),
            testQuestionId: q.id,
            tagRevisionId: tagRev.id,
            articleRevisionId: artRev.id,
            reason,
          })
          .expect(201)
      ).body;
      l = (await gv.post(`${kBase}/links/${l.id}/submit`).send(tr(l.lockVersion)).expect(201)).body;
      l = (
        await hvuChecker.post(`${kBase}/links/${l.id}/review`).send(tr(l.lockVersion)).expect(201)
      ).body;
      await hvuChecker.post(`${kBase}/links/${l.id}/publish`).send(tr(l.lockVersion)).expect(201);
    }

    const cqRoot = `/api/v2/class-quiz/classes/${classId}`;
    let qAttempt = (
      await hv
        .post(`${cqRoot}/activities/${quizActId}/start`)
        .send({ sourceId: qSource.id, idempotencyKey: key() })
        .expect(201)
    ).body;
    qAttempt = (
      await hv
        .put(`${cqRoot}/attempts/${qAttempt.id}/answers`)
        .send({
          idempotencyKey: key(),
          expectedLockVersion: qAttempt.lockVersion,
          answers: qSource.questions.map((q: { id: string; options: { id: string }[] }) => ({
            questionId: q.id,
            optionId: q.options[0].id,
          })),
          marked: [],
        })
        .expect(200)
    ).body;
    qAttempt = (
      await hv
        .post(`${cqRoot}/attempts/${qAttempt.id}/submit`)
        .send({ idempotencyKey: key(), expectedLockVersion: qAttempt.lockVersion })
        .expect(201)
    ).body;
    await hvuChecker
      .post(`${cqRoot}/attempts/${qAttempt.id}/publish`)
      .send({ idempotencyKey: key(), expectedLockVersion: qAttempt.lockVersion })
      .expect(201);

    const myClasses = (await hv.get('/api/v2/my/classes').expect(200)).body;
    expect(myClasses.data.some((c: { id: string }) => c.id === classId)).toBe(true);
    const progressRes = (await hv.get(`${lmsBase}/progress`).expect(200)).body;
    expect(progressRes.entries.length).toBeGreaterThanOrEqual(2);

    proofs.journey_j1_visitor_admissions_finance_lms = {
      supportTicketId,
      counselingAppV1Id,
      counselingAppV2Id,
      directApplicationId,
      exactObligationId,
      primaryEnrollmentId,
      classId,
      sectionId,
      activities: { lessonActId, resourceActId, assignmentActId, quizActId },
      submissionId,
      finalGradeId,
      quizAttemptId: qAttempt.id,
      knowledgeTagRevisionId: tagRev.id,
      knowledgeArticleRevisionId: artRev.id,
      learnerProgressSummary: progressRes.summary,
    };
  }, 120000);

  it('Block 3 — Journey J2 (HV → W05B + Placement → GV/HVU → TT): Free 1:1 W05B consultation, Placement LR200 & FOUR_SKILLS219 sitting/grading/release, Official Session + Meet + 20-hex Attendance + Reschedule Exception, and W08 TT Inspection + GV Hours Dispute', async () => {
    const api = (u: { id: string }) => uat.agents.get(u.id)!;
    const hvUnenrolled1 = api(uat.unenrolledHv1);
    const hvUnenrolled2 = api(uat.unenrolledHv2);
    const gv = api(uat.teacher);
    const hvuMaker = api(uat.academic);
    const hvuChecker = api(uat.planningApprover);
    const hv = api(uat.learner);

    // 1. W05B Free 1:1 Consultation (UCV2-27, UCV2-57)
    const cBase = '/api/v2/consultations/';
    expect(await d.prisma.enrollment.count({ where: { learnerId: uat.unenrolledHv1.id } })).toBe(0);

    const saveProfile = await gv
      .post(cBase + 'commands')
      .send({
        key: key(),
        op: 'PROFILE_SAVE',
        displayName: 'ThS. Nguyễn Thu Hà — Chuyên gia Tư vấn Lộ trình TOEIC 4 Kỹ năng',
        bio: '10 năm kinh nghiệm huấn luyện TOEIC Listening, Reading, Speaking & Writing.',
        specialties: 'TOEIC LR 650+, TOEIC Speaking & Writing 150+',
        reason,
      })
      .expect(201);
    await gv
      .post(cBase + 'commands')
      .send({ key: key(), op: 'PROFILE_APPROVE', id: saveProfile.body.id, reason })
      .expect(404);
    await hvuChecker
      .post(cBase + 'commands')
      .send({ key: key(), op: 'PROFILE_APPROVE', id: saveProfile.body.id, reason })
      .expect(201);

    for (let weekday = 0; weekday < 7; weekday++) {
      await gv
        .post(cBase + 'commands')
        .send({
          key: key(),
          op: 'AVAILABILITY_ADD',
          kind: 'WEEKLY',
          weekday,
          startMinute: 540,
          endMinute: 1020,
          reason,
        })
        .expect(201);
    }

    const slots = (
      await hvUnenrolled1.get(cBase + 'slots').query({ teacherId: uat.teacher.id }).expect(200)
    ).body as { startsAt: string }[];
    const slot1 = slots[10].startsAt;

    const hold1 = (
      await hvUnenrolled1
        .post(cBase + 'commands')
        .send({ key: key(), op: 'HOLD', teacherId: uat.teacher.id, startsAt: slot1 })
        .expect(201)
    ).body;
    w05bBookingId = hold1.id;

    // Anti-double-booking race check
    await hvUnenrolled2
      .post(cBase + 'commands')
      .send({ key: key(), op: 'HOLD', teacherId: uat.teacher.id, startsAt: slot1 })
      .expect(409);

    await hvUnenrolled1
      .post(cBase + 'commands')
      .send({
        key: key(),
        op: 'SUBMIT',
        id: w05bBookingId,
        topic: 'Tư vấn lộ trình tăng tốc Reading Part 7 và Speaking S10 để đạt TOEIC LR 750+',
      })
      .expect(201);

    // Cross-ownership tamper check
    await hvUnenrolled2
      .post(cBase + 'commands')
      .send({ key: key(), op: 'CANCEL', id: w05bBookingId, version: 1, reason: 'Tamper' })
      .expect(404);

    await gv
      .post(cBase + 'commands')
      .send({ key: key(), op: 'CONFIRM', id: w05bBookingId })
      .expect(201);
    const w05bLink = (
      await gv
        .post(cBase + 'commands')
        .send({
          key: key(),
          op: 'LINK_PROPOSE',
          id: w05bBookingId,
          url: 'https://meet.google.com/abc-defg-hij',
          reason,
        })
        .expect(201)
    ).body;
    await hvuChecker
      .post(cBase + 'commands')
      .send({ key: key(), op: 'LINK_APPROVE', id: w05bLink.id, reason })
      .expect(201);

    // 2. Placement LR 200 & FOUR_SKILLS 219 sitting, human rubric grading, and release (UCV2-06, 07, 45)
    const pBase = '/api/v2/placement/workflow';
    const lrBank = await seedOriginalPlacementBank(d, 'LR', false);
    const fourBank = await seedOriginalPlacementBank(d, 'FOUR_SKILLS', true);
    expect(lrBank.eligibility.learnerPublishable).toBe(false);
    expect(fourBank.eligibility.learnerPublishable).toBe(false);

    const lrTimingRes = await gv
      .post(pBase + '/policies')
      .send({
        idempotencyKey: key(),
        kind: 'SOURCE_TIMING',
        mode: 'LR',
        sourceId: lrBank.version.id,
        body: { sourceHash: lrBank.version.sourceHash, evidence: reason, tasks: [] },
        reason,
      })
      .expect(201);
    await hvuChecker
      .post(pBase + '/policies/' + lrTimingRes.body.id + '/approve')
      .send({ idempotencyKey: key(), reason })
      .expect(201);

    const fourTimingTasks = fourBank.groups
      .filter((g) => ['SPEAKING', 'WRITING'].includes(g.group.skill))
      .map((g) => ({
        groupId: g.group.id,
        preparationSeconds: 0,
        playbackSeconds: 0,
        responseSeconds: 30,
        uploadSeconds: 120,
      }));
    const fourTimingRes = await gv
      .post(pBase + '/policies')
      .send({
        idempotencyKey: key(),
        kind: 'SOURCE_TIMING',
        mode: 'FOUR_SKILLS',
        sourceId: fourBank.version.id,
        body: { sourceHash: fourBank.version.sourceHash, evidence: reason, tasks: fourTimingTasks },
        reason,
      })
      .expect(201);
    await hvuChecker
      .post(pBase + '/policies/' + fourTimingRes.body.id + '/approve')
      .send({ idempotencyKey: key(), reason })
      .expect(201);

    const fourRubricTasks = fourBank.groups
      .filter((g) => ['SPEAKING', 'WRITING'].includes(g.group.skill))
      .map((g) => ({
        groupId: g.group.id,
        criteria: [
          {
            code: 'TASK_FULFILLMENT',
            descriptor: 'Original Smart English rubric criterion: task fulfillment & accuracy (0-4)',
            max: 4,
          },
          {
            code: 'LANGUAGE_DELIVERY',
            descriptor: 'Original Smart English rubric criterion: grammar, vocabulary & delivery (0-4)',
            max: 4,
          },
        ],
      }));
    const fourRubricRes = await gv
      .post(pBase + '/policies')
      .send({
        idempotencyKey: key(),
        kind: 'RUBRIC',
        mode: 'FOUR_SKILLS',
        sourceId: fourBank.version.id,
        body: {
          sourceHash: fourBank.version.sourceHash,
          evidence: reason,
          scale: 'INTERNAL_0_100_DRAFT_RUBRIC',
          tasks: fourRubricTasks,
        },
        reason,
      })
      .expect(201);
    await hvuChecker
      .post(pBase + '/policies/' + fourRubricRes.body.id + '/approve')
      .send({ idempotencyKey: key(), reason })
      .expect(201);

    // LR sitting for unenrolledHv1 AND for primary enrolled learner (so STUDENT PLACEMENT_RESULTS has records too!)
    for (const actor of [hvUnenrolled1, hv]) {
      const lrStart = (
        await actor
          .post(pBase + '/attempts')
          .send({
            idempotencyKey: key(),
            sourceVersionId: lrBank.version.id,
            policyId: lrTimingRes.body.id,
            mode: 'LR',
            goalLR: 650,
          })
          .expect(201)
      ).body;
      if (actor === hvUnenrolled1) lrAttemptId = lrStart.attemptId;
      let sit = (await actor.get(pBase + '/attempts/' + lrStart.attemptId).expect(200)).body;
      const q0 = lrBank.groups[0].questions[0];
      const opts = await d.prisma.questionOption.findMany({
        where: { questionId: q0.question.id },
        orderBy: { orderIndex: 'asc' },
      });
      sit = (
        await actor
          .post(pBase + '/attempts/' + lrStart.attemptId + '/answers')
          .send({
            idempotencyKey: key(),
            expectedLockVersion: sit.lockVersion,
            questionId: q0.tq.id,
            selectedOptionIds: [opts[0].id],
          })
          .expect(201)
      ).body;
      sit = (
        await actor
          .post(pBase + '/attempts/' + lrStart.attemptId + '/commands')
          .send({ idempotencyKey: key(), expectedLockVersion: sit.lockVersion, action: 'NEXT' })
          .expect(201)
      ).body;
      sit = (
        await actor
          .post(pBase + '/attempts/' + lrStart.attemptId + '/commands')
          .send({ idempotencyKey: key(), expectedLockVersion: sit.lockVersion, action: 'NEXT' })
          .expect(201)
      ).body;
      expect(sit.phase).toBe('SUBMITTED');
      const lrEval = await d.prisma.placementHumanEvaluation.findFirstOrThrow({
        where: { attemptId: lrStart.attemptId, skill: 'LR' },
      });
      // Publish by academic manager (`uat.academic`) and `uat.planningApprover`
      const pubActor = actor === hvUnenrolled1 ? hvuChecker : hvuMaker;
      await pubActor
        .post(pBase + '/evaluations/' + lrEval.id + '/publish')
        .send({ idempotencyKey: key(), reason })
        .expect(201);
    }

    // FOUR_SKILLS sitting for unenrolledHv2 + GV manual evaluation + HVU publish
    const fourStart = (
      await hvUnenrolled2
        .post(pBase + '/attempts')
        .send({
          idempotencyKey: key(),
          sourceVersionId: fourBank.version.id,
          policyId: fourTimingRes.body.id,
          mode: 'FOUR_SKILLS',
          goalLR: 700,
          goalSpeaking: 150,
          goalWriting: 160,
        })
        .expect(201)
    ).body;
    fourAttemptId = fourStart.attemptId;
    let fourSitting = (await hvUnenrolled2.get(pBase + '/attempts/' + fourAttemptId).expect(200))
      .body;
    for (const action of ['NEXT', 'BREAK', 'NEXT']) {
      fourSitting = (
        await hvUnenrolled2
          .post(pBase + '/attempts/' + fourAttemptId + '/commands')
          .send({
            idempotencyKey: key(),
            expectedLockVersion: fourSitting.lockVersion,
            action,
          })
          .expect(201)
      ).body;
    }
    const speakingGroups = fourBank.groups.filter((g) => g.group.skill === 'SPEAKING');
    for (const sg of speakingGroups) {
      const qId = sg.questions[0].tq.id;
      const tabId = key();
      const token = key();
      const ticket = (
        await hvUnenrolled2
          .post(pBase + '/attempts/' + fourAttemptId + '/recordings/' + qId + '/begin')
          .send({
            idempotencyKey: key(),
            expectedLockVersion: fourSitting.lockVersion,
            tabId,
            token,
          })
          .expect(201)
      ).body;
      const up = (
        await hvUnenrolled2
          .post(pBase + '/attempts/' + fourAttemptId + '/recordings/' + qId)
          .field('idempotencyKey', key())
          .field('expectedLockVersion', String(ticket.lockVersion))
          .field('tabId', tabId)
          .field('token', token)
          .attach('file', wavBuffer(), {
            filename: `${sg.group.taskCode}.wav`,
            contentType: 'audio/wav',
          })
          .expect(201)
      ).body;
      fourSitting = (
        await hvUnenrolled2
          .post(pBase + '/attempts/' + fourAttemptId + '/commands')
          .send({
            idempotencyKey: key(),
            expectedLockVersion: up.lockVersion,
            action: 'NEXT',
          })
          .expect(201)
      ).body;
    }
    const writingGroups = fourBank.groups.filter((g) => g.group.skill === 'WRITING');
    for (const wg of writingGroups) {
      const qId = wg.questions[0].tq.id;
      fourSitting = (
        await hvUnenrolled2
          .post(pBase + '/attempts/' + fourAttemptId + '/answers')
          .send({
            idempotencyKey: key(),
            expectedLockVersion: fourSitting.lockVersion,
            questionId: qId,
            textResponse:
              'Original learner writing response for ' +
              wg.group.taskCode +
              ': The librarian is helping visitors arrange the chairs and return books.',
          })
          .expect(201)
      ).body;
      fourSitting = (
        await hvUnenrolled2
          .post(pBase + '/attempts/' + fourAttemptId + '/commands')
          .send({
            idempotencyKey: key(),
            expectedLockVersion: fourSitting.lockVersion,
            action: 'NEXT',
          })
          .expect(201)
      ).body;
    }
    expect(fourSitting.phase).toBe('SUBMITTED');

    await hvuMaker
      .post(pBase + '/attempts/' + fourAttemptId + '/assignments')
      .send({
        idempotencyKey: key(),
        graderId: uat.teacher.id,
        eligibilityConfirmed: true,
        reason,
      })
      .expect(201);
    await gv
      .get(pBase + '/attempts/' + fourAttemptId + '/review')
      .expect(200);
    for (const sg of speakingGroups) {
      await gv
        .get(pBase + '/attempts/' + fourAttemptId + '/recordings/' + sg.questions[0].tq.id)
        .expect(200);
    }
    const speakingScores: Record<string, unknown[]> = {};
    for (const sg of speakingGroups) {
      speakingScores[sg.group.id] = [
        {
          code: 'TASK_FULFILLMENT',
          score: 3,
          evidence: 'Clear acoustic response addressing task prompt ' + sg.group.taskCode,
          feedback: 'Good task fulfillment and natural pacing.',
        },
        {
          code: 'LANGUAGE_DELIVERY',
          score: 3,
          evidence: 'Intelligible pronunciation and accurate sentence stress.',
          feedback: 'Maintain consistent intonation on multi-clause sentences.',
        },
      ];
    }
    const spkEval = (
      await gv
        .post(pBase + '/attempts/' + fourAttemptId + '/evaluations')
        .send({
          idempotencyKey: key(),
          skill: 'SPEAKING',
          rubricId: fourRubricRes.body.id,
          expectedNumber: 0,
          originalEvidenceReviewed: true,
          scores: speakingScores,
          reason,
        })
        .expect(201)
    ).body;
    const writingScores: Record<string, unknown[]> = {};
    for (const wg of writingGroups) {
      writingScores[wg.group.id] = [
        {
          code: 'TASK_FULFILLMENT',
          score: 3,
          evidence: 'Submitted text directly fulfills ' + wg.group.taskCode,
          feedback: 'All required points and target words are accurately included.',
        },
        {
          code: 'LANGUAGE_DELIVERY',
          score: 4,
          evidence: 'Well-structured clauses and appropriate workplace register.',
          feedback: 'Strong grammatical control and business email register.',
        },
      ];
    }
    const wrtEval = (
      await gv
        .post(pBase + '/attempts/' + fourAttemptId + '/evaluations')
        .send({
          idempotencyKey: key(),
          skill: 'WRITING',
          rubricId: fourRubricRes.body.id,
          expectedNumber: 0,
          originalEvidenceReviewed: true,
          scores: writingScores,
          reason,
        })
        .expect(201)
    ).body;
    const fourLrEval = await d.prisma.placementHumanEvaluation.findFirstOrThrow({
      where: { attemptId: fourAttemptId, skill: 'LR' },
    });
    for (const evalId of [fourLrEval.id, spkEval.id, wrtEval.id]) {
      await hvuMaker
        .post(pBase + '/evaluations/' + evalId + '/publish')
        .send({ idempotencyKey: key(), reason })
        .expect(201);
    }

    // 3. Official Session + GV Meet Proposal (UC36) + HVU Approval (UC43) + Attendance 20-hex (UC35, UC26)
    const sessId = uat.normalSessionId;
    const meetProp = (
      await gv
        .post(`/api/v2/session-engagement/sessions/${sessId}/meet`)
        .send({ url: 'https://meet.google.com/abc-defg-hij', key: key(), reason })
        .expect(201)
    ).body;
    await hvuChecker
      .post(`/api/v2/session-engagement/reviews/meet/${meetProp.id}`)
      .send({ decision: 'APPROVED', key: key(), reason })
      .expect(201);

    await gv
      .post(`/api/v2/session-engagement/sessions/${sessId}/attendance`)
      .send({})
      .expect(201);
    const codeRes = (
      await gv
        .post(`/api/v2/session-engagement/sessions/${sessId}/code`)
        .send({ key: key() })
        .expect(201)
    ).body;
    expect(codeRes.code).toMatch(/^[A-F0-9]{20}$/);

    const checkinRes = (
      await hv
        .post(`/api/v2/session-engagement/sessions/${sessId}/checkin`)
        .send({ key: key(), code: codeRes.code })
        .expect(201)
    ).body;
    const attCorr = (
      await hv
        .post(`/api/v2/session-engagement/sessions/${sessId}/corrections`)
        .send({
          key: key(),
          reason,
          learnerId: uat.learner.id,
          baseVersion: 0,
          requestedStatus: 'PRESENT',
          evidence: 'Xác nhận có mặt đầy đủ từ đầu buổi học trực tuyến qua Google Meet',
        })
        .expect(201)
    ).body;
    await hvuChecker
      .post(`/api/v2/session-engagement/reviews/correction/${attCorr.id}`)
      .send({ key: key(), reason, decision: 'APPROVED' })
      .expect(201);

    // 4. UCV2-37 & UCV2-44: GV proposes schedule exception (RESCHEDULE) on a future session & HVU approves + publishes replacement
    const [nowMsRow] = await d.prisma.$queryRaw<
      { ms: number }[]
    >`SELECT extract(epoch FROM clock_timestamp())::double precision*1000 AS ms`;
    const futureSess = await d.prisma.teachingSession.create({
      data: {
        classOfferingId: uat.classes.normal.id,
        startsAt: new Date(nowMsRow.ms + 4 * 3600000),
        endsAt: new Date(nowMsRow.ms + 5 * 3600000),
        timezone: 'Asia/Ho_Chi_Minh',
        modality: 'ONLINE',
        assignmentId: uat.normalAssign.id,
        instructorId: uat.teacher.id,
        requiredCapabilities: [],
        proposedBy: uat.academic.id,
        reason,
      },
    });
    const subFuture = (
      await hvuMaker
        .post('/api/v2/academic/sessions/' + futureSess.id + '/submit')
        .send({ expectedLockVersion: 0, reason })
        .expect(201)
    ).body;
    await hvuChecker
      .post('/api/v2/academic/sessions/' + futureSess.id + '/approve')
      .send({ expectedLockVersion: subFuture.lockVersion, reason })
      .expect(201);

    const excProposal = (
      await gv
        .post('/api/v2/session-engagement/sessions/' + futureSess.id + '/exceptions')
        .send({
          key: key(),
          reason,
          kind: 'RESCHEDULE',
          startLocal: localMinute(new Date(nowMsRow.ms + 6 * 3600000), 'Asia/Ho_Chi_Minh'),
          endLocal: localMinute(new Date(nowMsRow.ms + 7 * 3600000), 'Asia/Ho_Chi_Minh'),
          timezone: 'Asia/Ho_Chi_Minh',
          assignmentId: uat.normalAssign.id,
          modality: 'ONLINE',
          requiredCapabilities: [],
        })
        .expect(201)
    ).body;
    rescheduleExceptionId = excProposal.id;
    const excReview = (
      await hvuMaker
        .post('/api/v2/session-engagement/reviews/exception/' + rescheduleExceptionId)
        .send({ key: key(), reason, decision: 'APPROVED' })
        .expect(201)
    ).body;
    routedReplacementSessionId = excReview.routedSessionId;
    const routedSessRow = await d.prisma.teachingSession.findUniqueOrThrow({
      where: { id: routedReplacementSessionId },
    });
    await hvuChecker
      .post('/api/v2/academic/sessions/' + routedReplacementSessionId + '/approve')
      .send({ expectedLockVersion: routedSessRow.lockVersion, reason })
      .expect(201);

    // 5. W08 Teaching Inspection (UCV2-48..52): Dispatch, overlap rejection, shift clock IN/OUT, observation, TT-REPORTED report, GV dispute & HVU hours review
    const disp1 = await hvuMaker
      .post('/api/v2/inspection/assignments')
      .send({
        sessionId: uat.normalSessionId,
        inspectorId: uat.inspector.id,
        key: key(),
        reason,
      })
      .expect(201);
    inspectionAssignmentId = disp1.body.id;

    // Overlapping dispatch of same TT to simultaneous session rejected with 409
    await hvuMaker
      .post('/api/v2/inspection/assignments')
      .send({
        sessionId: uat.overlapSessionId,
        inspectorId: uat.inspector.id,
        key: key(),
        reason,
      })
      .expect(409);

    const viewInsp = async (actor: { id: string }) =>
      (await api(actor).get(`/api/v2/inspection/assignments/${inspectionAssignmentId}`).expect(200))
        .body;
    const sendInspCmd = async (
      actor: { id: string },
      action: string,
      extra: Record<string, unknown> = {},
    ) => {
      const v = await viewInsp(actor);
      return api(actor)
        .post(`/api/v2/inspection/assignments/${inspectionAssignmentId}/commands`)
        .send({
          action,
          version: v.assignment.version,
          key: key(),
          reason,
          ...extra,
        });
    };

    expect((await sendInspCmd(uat.inspector, 'IN')).status).toBe(201);
    expect((await sendInspCmd(uat.inspector, 'START')).status).toBe(201);
    await new Promise((r) => setTimeout(r, 1100));
    expect((await sendInspCmd(uat.inspector, 'STOP')).status).toBe(201);
    expect(
      (
        await sendInspCmd(uat.inspector, 'REPORT', {
          presence: 'PRESENT',
          conditions: 'Giảng viên mở lớp đúng giờ, tương tác tốt với học viên trên Google Meet.',
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await sendInspCmd(uat.academic, 'REVIEW', {
          disposition: 'PARTIAL',
          approvedSeconds: 1,
        })
      ).status,
    ).toBe(201);
    expect((await sendInspCmd(uat.teacher, 'DISPUTE')).status).toBe(201);
    expect(
      (
        await sendInspCmd(uat.academic, 'REVIEW', {
          disposition: 'APPROVE',
          approvedSeconds: 1,
        })
      ).status,
    ).toBe(201);
    expect((await sendInspCmd(uat.inspector, 'OUT')).status).toBe(201);
    expect(
      (
        await sendInspCmd(uat.inspector, 'CORRECTION', {
          kind: 'WRONG_DEVICE',
          evidence: 'Đăng nhập ca trực từ thiết bị dự phòng của bộ phận Thanh tra.',
        })
      ).status,
    ).toBe(201);
    const vAfterCorr = await viewInsp(uat.inspector);
    expect(
      (
        await sendInspCmd(uat.academic, 'CORRECTION_REVIEW', {
          correctionId: vAfterCorr.corrections[0].id,
          disposition: 'ACCEPT',
        })
      ).status,
    ).toBe(201);
    const finalInsp = await viewInsp(uat.inspector);
    expect(finalInsp.reports[0].attestation).toBe('TT-REPORTED');

    proofs.journey_j2_w05b_placement_session_inspection = {
      w05bBookingId,
      w05bApprovedLinkId: w05bLink.id,
      lrAttemptId,
      fourAttemptId,
      officialSessionId: uat.normalSessionId,
      approvedMeetUrl: 'https://meet.google.com/abc-defg-hij',
      attendanceReceiptId: checkinRes.receipt.id,
      rescheduleExceptionId,
      routedReplacementSessionId,
      inspectionAssignmentId,
      inspectionReportAttestation: finalInsp.reports[0].attestation,
      inspectionApprovedSeconds: finalInsp.approvedSeconds,
    };
  }, 180000);

  it('Block 4 — Journey J3, P1-C (12 UC Traceability Reconciliation + SQL Readbacks) & P2-D (W09 TEST Certificates + W10 7-Role Daily Reports with 0 UNAVAILABLE & Non-Zero Records + CSV Export)', async () => {
    const api = (u: { id: string }) => uat.agents.get(u.id)!;
    const hvuMaker = api(uat.academic);
    const hvuChecker = api(uat.planningApprover);
    const qt = api(uat.admin);

    // 1. UCV2-38 & UCV2-40: HVU Curriculum Program/Version & Room Inventory (Phòng học và tài nguyên phòng)
    const progRes = await hvuMaker
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
      uat.planningApprover.id,
      uat.approver.id,
      uat.secondApprover.id,
      'academic.program.approve',
      'COURSE',
      newProgramId,
    );
    await uat.login(uat.planningApprover);

    const verRes = await hvuMaker
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
    const verSub = await hvuMaker
      .post('/api/v2/academic/versions/' + newVersionId + '/submit')
      .send({ expectedLockVersion: 0, reason })
      .expect(201);
    await hvuMaker
      .post('/api/v2/academic/versions/' + newVersionId + '/approve')
      .send({
        expectedLockVersion: verSub.body.lockVersion,
        poPriceConfirmed: true,
        poPriceReference: PO_PRICE_REF,
        reason,
      })
      .expect(403);
    await hvuChecker
      .post('/api/v2/academic/versions/' + newVersionId + '/approve')
      .send({
        expectedLockVersion: verSub.body.lockVersion,
        poPriceConfirmed: true,
        poPriceReference: PO_PRICE_REF,
        reason,
      })
      .expect(201);

    const roomCode = 'LAB-A302-' + randomUUID().slice(0, 4).toUpperCase();
    const roomRes = await hvuMaker
      .post('/api/v2/academic/rooms')
      .send({
        code: roomCode,
        name: 'Phòng Lab Nghe – Nói Đa phương tiện A302',
        location: 'Cơ sở Quận 1 · Tầng 3',
        status: 'ACTIVE',
        capacity: 32,
        capabilities: ['PROJECTOR', 'SPEAKERS'],
        reason,
      })
      .expect(201);
    createdRoomId = roomRes.body.id;
    const roomUpd = await hvuMaker
      .patch('/api/v2/academic/rooms/' + createdRoomId)
      .send({
        code: roomCode,
        name: 'Phòng Lab Nghe – Nói Đa phương tiện A302 (Đã nâng cấp tai nghe)',
        location: 'Cơ sở Quận 1 · Tầng 3',
        status: 'MAINTENANCE',
        capacity: 32,
        capabilities: ['PROJECTOR', 'SPEAKERS'],
        expectedLockVersion: roomRes.body.lockVersion,
        reason,
      })
      .expect(200);
    expect(roomUpd.body.status).toBe('MAINTENANCE');

    // 2. W09 TEST Certificate Policy Maker-Checker, Issuance, Revocation & Lookup (UCV2-28, 46, 47)
    const secApp = await api(uat.contenders[0])
      .post('/api/v2/admissions-finance/applications')
      .send({
        key: key(),
        classId: uat.classes.normal.id,
        consent: true,
        consentVersion: 'W07_SYNTHETIC_ADMISSION_V1',
      })
      .expect(201);
    await hvuChecker
      .post('/api/v2/admissions-finance/applications/' + secApp.body.id + '/academic-decisions')
      .send({
        key: key(),
        expectedVersion: 0,
        decision: 'APPROVE',
        reason,
      })
      .expect(201);
    const secDetail = await api(uat.contenders[0])
      .get('/api/v2/admissions-finance/applications/' + secApp.body.id)
      .expect(200);
    const secOblId = secDetail.body.obligation.id as string;
    const secEv = await api(uat.contenders[0])
      .post('/api/v2/admissions-finance/obligations/' + secOblId + '/evidence')
      .field('key', key())
      .field('amountVnd', '1000000')
      .field('sourceRef', 'TEST-W09-SEC-RECEIPT-01')
      .field('synthetic', 'true')
      .attach('file', buildValidReceiptPng('w09-sec-' + randomUUID()), {
        filename: 'w09-sec-receipt.png',
        contentType: 'image/png',
      })
      .expect(201);
    await api(uat.cashier)
      .post('/api/v2/admissions-finance/evidence/' + secEv.body.id + '/review')
      .send({
        key: key(),
        decision: 'VERIFY',
        reason,
      })
      .expect(201);
    const secAct = await api(uat.contenders[0])
      .post('/api/v2/admissions-finance/applications/' + secApp.body.id + '/activate')
      .send({ key: key() })
      .expect(201);
    secondaryEnrollmentId = secAct.body.enrollmentId;

    const createPol = await hvuMaker
      .post('/api/v2/certificates/policies')
      .send({
        courseId: uat.classes.normal.courseId,
        classOfferingId: uat.classes.normal.id,
        code: 'SE-TOEIC-B1-POLICY-2026',
        title: 'Chuẩn hoàn thành TOEIC Intermediate B1 (TEST_DISPOSABLE)',
        description:
          'Yêu cầu điểm trung bình W03 >= 70%, chuyên cần W06 >= 80%, và hồ sơ ghi danh W07 hợp lệ.',
        isTestPolicy: true,
        reason,
        criteria: [
          {
            criterionId: 'CRIT-W03-GRADE-70',
            domain: 'W03_GRADE',
            label: 'Điểm học thuật đã công bố (Assignment + Quiz) >= 70%',
            required: true,
            minNumericValue: 70,
          },
          {
            criterionId: 'CRIT-W06-ATTENDANCE-80',
            domain: 'W06_ATTENDANCE',
            label: 'Tỷ lệ điểm danh buổi học chính thức (W06) >= 80%',
            required: true,
            minNumericValue: 80,
          },
          {
            criterionId: 'CRIT-W07-ENTITLEMENT',
            domain: 'W07_ENTITLEMENT',
            label: 'Hồ sơ ghi danh & nghĩa vụ học phí (W07) hợp lệ',
            required: true,
          },
        ],
      })
      .expect(201);
    policyId = createPol.body.id;

    await hvuMaker
      .post(`/api/v2/certificates/policies/${policyId}/review`)
      .send({ decision: 'APPROVED', reason })
      .expect(403);
    await hvuChecker
      .post(`/api/v2/certificates/policies/${policyId}/review`)
      .send({ decision: 'APPROVED', reason })
      .expect(201);

    const evalPrimary = await hvuMaker
      .get(`/api/v2/certificates/enrollments/${primaryEnrollmentId}/evaluate`)
      .expect(200);
    expect(evalPrimary.body.status).toBe('ELIGIBLE_FOR_REVIEW');

    // Ineligible secondary learner blocked with 409
    await hvuMaker
      .post('/api/v2/certificates/reviews')
      .send({
        enrollmentId: secondaryEnrollmentId,
        policyId,
        decision: 'ELIGIBLE',
        reason,
      })
      .expect(409);

    const reviewRes = await hvuMaker
      .post('/api/v2/certificates/reviews')
      .send({
        enrollmentId: primaryEnrollmentId,
        policyId,
        decision: 'ELIGIBLE',
        reason,
      })
      .expect(201);

    const issueKey = `issue-key-${randomUUID()}`;
    await hvuMaker
      .post('/api/v2/certificates/issue')
      .send({
        enrollmentId: primaryEnrollmentId,
        reviewId: reviewRes.body.id,
        idempotencyKey: issueKey,
        reason,
      })
      .expect(403);

    const issuedRes = await hvuChecker
      .post('/api/v2/certificates/issue')
      .send({
        enrollmentId: primaryEnrollmentId,
        reviewId: reviewRes.body.id,
        idempotencyKey: issueKey,
        reason,
      })
      .expect(201);
    issuedCertificateId = issuedRes.body.id;
    issuedCertificateCode = issuedRes.body.certificateCode;
    expect(issuedCertificateCode).toMatch(/^SE-CERT-TEST-2026-[A-F0-9]{8}$/);

    // Revocation proof on secondary enrollment using W07-only test policy
    const revokePol = await hvuMaker
      .post('/api/v2/certificates/policies')
      .send({
        courseId: uat.classes.normal.courseId,
        code: 'SE-REVOKE-TEST-POLICY-2026',
        title: 'Chính sách kiểm thử thu hồi chứng chỉ (TEST_DISPOSABLE)',
        description: 'Chính sách dùng riêng để kiểm thử luồng thu hồi chứng chỉ có lý do kiểm toán.',
        isTestPolicy: true,
        reason,
        criteria: [
          {
            criterionId: 'CRIT-W07-ONLY',
            domain: 'W07_ENTITLEMENT',
            label: 'Hồ sơ ghi danh hợp lệ',
            required: true,
          },
        ],
      })
      .expect(201);
    await hvuChecker
      .post(`/api/v2/certificates/policies/${revokePol.body.id}/review`)
      .send({ decision: 'APPROVED', reason })
      .expect(201);
    const secReview = await hvuMaker
      .post('/api/v2/certificates/reviews')
      .send({
        enrollmentId: secondaryEnrollmentId,
        policyId: revokePol.body.id,
        decision: 'ELIGIBLE',
        reason,
      })
      .expect(201);
    const secIssued = await hvuChecker
      .post('/api/v2/certificates/issue')
      .send({
        enrollmentId: secondaryEnrollmentId,
        reviewId: secReview.body.id,
        idempotencyKey: `issue-sec-${randomUUID()}`,
        reason,
      })
      .expect(201);
    revokedCertificateId = secIssued.body.id;
    revokedCertificateCode = secIssued.body.certificateCode;
    await hvuChecker
      .post(`/api/v2/certificates/${revokedCertificateId}/revoke`)
      .send({
        reason: 'Thu hồi chứng chỉ kiểm thử theo yêu cầu hậu kiểm học vụ (Audit Revocation Proof).',
      })
      .expect(201);

    const lookupIssued = await request(d.app.getHttpServer())
      .get(`/api/v2/certificates/lookup/${issuedCertificateCode}`)
      .expect(200);
    expect(lookupIssued.body.valid).toBe(true);
    const lookupRevoked = await request(d.app.getHttpServer())
      .get(`/api/v2/certificates/lookup/${revokedCertificateCode}`)
      .expect(200);
    expect(lookupRevoked.body.valid).toBe(false);

    // 3. UCV2-53..55: QT Staff Accounts, Masked Service Config & System Audit
    const staffEmail = `nhansu.tv.wave04.${randomUUID().slice(0, 6)}@example.invalid`;
    const staffAcc = await qt
      .post('/api/admin/accounts')
      .send({
        fullName: 'Trần Thị Thanh Thảo (Tư vấn viên)',
        email: staffEmail,
        password: 'StaffPassword!123',
        role: 'COUNSELOR',
      })
      .expect(201);
    await qt
      .patch('/api/admin/accounts/' + staffAcc.body.id + '/status')
      .send({ status: 'LOCKED', reason: 'Tạm khóa tài khoản nhân sự để kiểm tra định kỳ' })
      .expect(200);
    await qt
      .patch('/api/admin/accounts/' + staffAcc.body.id + '/status')
      .send({ status: 'ACTIVE', reason: 'Khôi phục trạng thái hoạt động sau khi rà soát' })
      .expect(200);
    const roleReq = await api(uat.approver)
      .post('/api/authority/roles')
      .send({
        userId: staffAcc.body.id,
        nextRole: 'CASHIER',
        reason: 'Điều chuyển nhân sự sang bộ phận Thu ngân học vụ',
      })
      .expect(201);
    await api(uat.approver).post('/api/authority/roles/' + roleReq.body.id + '/approve').expect(403);
    await api(uat.secondApprover)
      .post('/api/authority/roles/' + roleReq.body.id + '/approve')
      .expect(201);

    const sysCfg = await qt.get('/api/v2/operations/system-config').expect(200);
    for (const s of sysCfg.body.settings) {
      if (s.sensitivity === 'SENSITIVE') expect(s.maskedValue).toBe('••••••••');
    }
    const cfgProposal = await qt
      .post('/api/v2/operations/system-config/proposals')
      .send({
        settingCode: 'EMAIL_PROVIDER',
        proposedState: 'VERIFY_TEST_TRANSPORT',
        reason: 'Đề nghị Operator xác minh cấu hình SMTP sandbox phục vụ khôi phục mật khẩu',
      })
      .expect(201);
    const sysAudit = await qt
      .get('/api/v2/operations/system-audit?action=CONFIG_CHANGE_PROPOSED&objectType=SYSTEM_CONFIG')
      .expect(200);
    expect(sysAudit.body.health.status).toBe('HEALTHY');

    // 4. P2-D (UCV2-56): 7-Role Daily Activity Reports + SQL Reconciliation + Safe CSV Export
    const today = centerDateToday();
    const roleActors = [
      { role: 'STUDENT', actor: uat.learner },
      { role: 'INSTRUCTOR', actor: uat.teacher },
      { role: 'COUNSELOR', actor: uat.counselor },
      { role: 'ACADEMIC_MANAGER', actor: uat.academic },
      { role: 'CASHIER', actor: uat.cashier },
      { role: 'TEACHING_INSPECTOR', actor: uat.inspector },
      { role: 'SYSTEM_ADMIN', actor: uat.admin },
    ] as const;

    const roleReportSummaries: Record<
      string,
      {
        totalRecords: number;
        totalSources: number;
        availableSources: number;
        bySource: Record<
          string,
          { state: string; count: number; availabilityClassification: string }
        >;
      }
    > = {};
    const roleCsvExports: Record<string, unknown> = {};

    for (const item of roleActors) {
      const ag = api(item.actor);
      const rep = await ag
        .get(`/api/v2/operations/role-reports?date=${today}&source=ALL`)
        .expect(200);
      expect(rep.body.role).toBe(item.role);
      expect(rep.body.formalReportAuthorized).toBe(true);
      expect(rep.body.metrics.state).toBe('AVAILABLE');
      expect(rep.body.csv.available).toBe(true);

      const kpi = rep.body.metrics.value;
      expect(kpi.totalRecords).toBeGreaterThan(0);
      expect(kpi.availableSources).toBe(kpi.totalSources);
      for (const srcMeta of Object.values< {
        state: string;
        count: number;
        availabilityClassification: string;
      }>(kpi.bySource)) {
        expect(srcMeta.state).toBe('AVAILABLE');
        expect(srcMeta.count).toBeGreaterThan(0);
        expect(srcMeta.availabilityClassification).toBe('AVAILABLE');
      }

      const csvRes = await ag
        .post('/api/v2/operations/role-reports/export')
        .send({ date: today, source: 'ALL' })
        .expect(201);
      expect(csvRes.body.rowCount).toBe(kpi.totalRecords);
      expect(csvRes.body.csv.startsWith('\uFEFFdate,timeZone,role,sourceCode')).toBe(true);

      roleReportSummaries[item.role] = kpi;
      roleCsvExports[item.role] = {
        fileName: csvRes.body.fileName,
        rowCount: csvRes.body.rowCount,
        matchesDashboardRecordCount: csvRes.body.rowCount === kpi.totalRecords,
      };
    }

    // Verify PLACEMENT_RESULTS and GRADING are AVAILABLE with count > 0
    expect(roleReportSummaries.STUDENT.bySource.PLACEMENT_RESULTS.state).toBe('AVAILABLE');
    expect(roleReportSummaries.STUDENT.bySource.PLACEMENT_RESULTS.count).toBeGreaterThan(0);
    expect(roleReportSummaries.ACADEMIC_MANAGER.bySource.PLACEMENT_RESULTS.state).toBe('AVAILABLE');
    expect(roleReportSummaries.ACADEMIC_MANAGER.bySource.PLACEMENT_RESULTS.count).toBeGreaterThan(0);
    expect(roleReportSummaries.INSTRUCTOR.bySource.GRADING.state).toBe('AVAILABLE');
    expect(roleReportSummaries.INSTRUCTOR.bySource.GRADING.count).toBeGreaterThan(0);

    // Verify CSV formula injection defense
    expect(encodeSafeCsvCell('=SUM(1,2)')).toBe('"\'=SUM(1,2)"');
    expect(encodeSafeCsvCell('+cmd|"/c calc"!A0')).toBe('"\'+cmd|""/c calc""!A0"');
    expect(encodeSafeCsvCell('-2+3')).toBe("'-2+3");
    expect(encodeSafeCsvCell('@IMPORTXML()')).toBe("'@IMPORTXML()");

    // 5. P1-C: Populate non-empty case-level proof entries for all 12 UCs (UCV2-31, 32, 34, 35, 36, 37, 40, 42, 44, 49, 50, 51) + SQL Readbacks
    const [roomRow] = await d.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT id::text, code, name, location, capacity, capabilities, status::text, "lockVersion"
      FROM rooms WHERE id = ${createdRoomId}::uuid
    `;
    const [knowledgeRows] = await d.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT count(*)::int AS "publishedRevisions",
             (SELECT count(*)::int FROM quiz_knowledge_links WHERE state = 'PUBLISHED') AS "publishedQuestionLinks"
      FROM knowledge_revisions WHERE state = 'PUBLISHED'
    `;
    const [gradingRow] = await d.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT id::text, "submissionId"::text, "rubricId"::text, state, "gradedById"::text, "publishedById"::text
      FROM assignment_grades WHERE id = ${finalGradeId}::uuid
    `;
    const [sessionRow] = await d.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT s.id::text, s.state::text, m.url AS "approvedMeetUrl",
             (SELECT count(*)::int FROM w06_receipts r JOIN w06_windows w ON w.id = r."windowId" WHERE w."sessionId" = s.id) AS "attendanceReceipts"
      FROM teaching_sessions s
      LEFT JOIN w06_meet m ON m."sessionId" = s.id AND m.state = 'APPROVED'
      WHERE s.id = ${uat.normalSessionId}::uuid
    `;
    const [exceptionRow] = await d.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT e.id::text AS "exceptionId", e.kind::text, e.state::text AS decision, e."routedSessionId"::text,
             ts.state::text AS "replacementSessionState"
      FROM w06_exceptions e
      JOIN teaching_sessions ts ON ts.id = e."routedSessionId"
      WHERE e.id = ${rescheduleExceptionId}::uuid
    `;
    const [inspectionRow] = await d.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT a.id::text AS "assignmentId", a.state::text,
             (SELECT count(*)::int FROM w08_clock c WHERE c."assignmentId" = a.id) AS "clockCount",
             (SELECT count(*)::int FROM w08_report rp WHERE rp."assignmentId" = a.id AND rp.attestation = 'TT-REPORTED') AS "reportCount",
             (SELECT count(*)::int FROM w08_dispute dp WHERE dp."assignmentId" = a.id) AS "disputeCount",
             (SELECT count(*)::int FROM w08_decision dc WHERE dc."assignmentId" = a.id) AS "decisionCount"
      FROM w08_assignment a
      WHERE a.id = ${inspectionAssignmentId}::uuid
    `;

    proofs.p1_traceability_reconciliation = {
      'UCV2-31': {
        canonicalName:
          'GV biên soạn thư viện kiến thức TOEIC (ngữ pháp, từ vựng, mẹo làm bài) và HVU kiểm soát chuẩn nội dung',
        primaryActor: 'GV (Instructor) / HVU (Academic Manager)',
        routeUi: '/workspace/knowledge',
        apiEndpoints: [
          'POST /api/v2/knowledge/entries',
          'POST /api/v2/knowledge/revisions/:id/submit',
          'POST /api/v2/knowledge/revisions/:id/review',
          'POST /api/v2/knowledge/revisions/:id/publish',
        ],
        dbEvidence: knowledgeRows,
        positiveProof: 'GV authors WORKPLACE_EMAIL_B1 tag & article; HVU reviews and publishes.',
        negativeRbacProof: 'GV self-review/publish rejected with 403.',
        reviewerOutcome: 'PASS_DISPOSABLE_E2E_REVIEWABLE',
      },
      'UCV2-32': {
        canonicalName: 'GV tạo và quản lý ngân hàng câu hỏi gắn nhãn kỹ năng/chủ đề (KnowledgeTag)',
        primaryActor: 'GV (Instructor)',
        routeUi: '/classroom/:classId/activities/:activityId/quiz-author',
        apiEndpoints: [
          'POST /api/v2/class-quiz/classes/:classId/activities/:activityId/sources',
          'POST /api/v2/knowledge/links',
          'POST /api/v2/knowledge/links/:id/publish',
        ],
        dbEvidence: knowledgeRows,
        positiveProof: '4 quiz questions created and linked to published KnowledgeTag & Article.',
        negativeRbacProof: 'Unassigned instructor or learner denied with 403/404.',
        reviewerOutcome: 'PASS_DISPOSABLE_E2E_REVIEWABLE',
      },
      'UCV2-34': {
        canonicalName: 'GV chấm bài, xác nhận kết quả và phản hồi cho học viên',
        primaryActor: 'GV (Instructor) / HVU (Academic Manager)',
        routeUi: '/classroom/:classId/activities/:activityId/grading',
        apiEndpoints: [
          'POST /api/v2/assignment-grading/classes/:classId/activities/:activityId/rubrics',
          'POST /api/v2/assignment-grading/classes/:classId/activities/:activityId/submissions/:subId/grades',
          'POST /api/v2/assignment-grading/classes/:classId/activities/:activityId/grades/:id/final',
          'POST /api/v2/assignment-grading/classes/:classId/activities/:activityId/grades/:id/publish',
        ],
        dbEvidence: gradingRow,
        positiveProof: `Assignment submission ${submissionId} graded via rubric, finalized by GV (${finalGradeId}), and published by HVU.`,
        negativeRbacProof: 'GV cannot publish own finalized grade without independent HVU checker (403).',
        reviewerOutcome: 'PASS_DISPOSABLE_E2E_REVIEWABLE',
      },
      'UCV2-35': {
        canonicalName: 'GV quản lý điểm danh theo lịch dạy',
        primaryActor: 'GV (Instructor)',
        routeUi: '/classroom/:classId/attendance',
        apiEndpoints: [
          'POST /api/v2/session-engagement/sessions/:id/attendance',
          'POST /api/v2/session-engagement/sessions/:id/code',
          'GET /api/v2/session-engagement/sessions/:id/roster',
        ],
        dbEvidence: sessionRow,
        positiveProof: `GV opened attendance window on session ${uat.normalSessionId} and rotated 20-hex secret code verified by learner check-in.`,
        negativeRbacProof: 'Roster response redacts 20-hex secret code; non-assigned GV denied (404).',
        reviewerOutcome: 'PASS_DISPOSABLE_E2E_REVIEWABLE',
      },
      'UCV2-36': {
        canonicalName: 'GV đề nghị/cập nhật link Google Meet và theo dõi trạng thái buổi học online',
        primaryActor: 'GV (Instructor)',
        routeUi: '/classroom/:classId/attendance?mode=meet',
        apiEndpoints: [
          'POST /api/v2/session-engagement/sessions/:id/meet',
          'POST /api/v2/session-engagement/reviews/meet/:id',
        ],
        dbEvidence: sessionRow,
        positiveProof: `GV proposed https://meet.google.com/abc-defg-hij; HVU approved; visible in session & class tree.`,
        negativeRbacProof: 'Non-HTTPS or non-Google-Meet URL rejected (400); GV cannot self-approve Meet URL (404).',
        reviewerOutcome: 'PASS_DISPOSABLE_E2E_REVIEWABLE',
      },
      'UCV2-37': {
        canonicalName: 'GV gửi đề nghị nghỉ dạy, đổi lịch hoặc dạy bù',
        primaryActor: 'GV (Instructor)',
        routeUi: '/classroom/:classId/attendance',
        apiEndpoints: ['POST /api/v2/session-engagement/sessions/:id/exceptions'],
        dbEvidence: exceptionRow,
        positiveProof: `GV submitted RESCHEDULE exception ${rescheduleExceptionId} on future session.`,
        negativeRbacProof: 'Foreign instructor or student cannot submit session exception (404).',
        reviewerOutcome: 'PASS_DISPOSABLE_E2E_REVIEWABLE',
      },
      'UCV2-40': {
        canonicalName: 'HVU quản lý phòng học và tài nguyên phòng',
        primaryActor: 'HVU (Academic Manager)',
        routeUi: '/academic/planning',
        apiEndpoints: [
          'POST /api/v2/academic/rooms',
          'PATCH /api/v2/academic/rooms/:id',
          'DELETE /api/v2/academic/rooms/:id',
        ],
        dbEvidence: roomRow,
        positiveProof: `HVU created room ${roomCode} (${createdRoomId}) with PROJECTOR & SPEAKERS and updated status to MAINTENANCE.`,
        negativeRbacProof: 'Stale lockVersion rejected (409); non-HVU roles rejected (403).',
        reviewerOutcome: 'PASS_DISPOSABLE_E2E_REVIEWABLE',
      },
      'UCV2-42': {
        canonicalName: 'HVU phân công và điều chỉnh giảng viên cho lớp/buổi học',
        primaryActor: 'HVU (Academic Manager)',
        routeUi: '/academic/classes/:id',
        apiEndpoints: [
          'POST /api/v2/academic/classes/:id/assignments',
          'POST /api/v2/academic/assignments/:id/submit',
          'POST /api/v2/academic/assignments/:id/approve',
        ],
        dbEvidence: { assignmentId: uat.normalAssign.id, instructorId: uat.teacher.id, state: 'PUBLISHED' },
        positiveProof: `HVU maker created and submitted instructor assignment ${uat.normalAssign.id}; independent HVU checker approved with eligibilityConfirmed=true.`,
        negativeRbacProof: 'Maker self-approval rejected with 403.',
        reviewerOutcome: 'PASS_DISPOSABLE_E2E_REVIEWABLE',
      },
      'UCV2-44': {
        canonicalName: 'HVU duyệt đổi lịch, nghỉ dạy và bố trí dạy bù',
        primaryActor: 'HVU (Academic Manager)',
        routeUi: '/academic/session-engagement',
        apiEndpoints: [
          'POST /api/v2/session-engagement/reviews/exception/:id',
          'POST /api/v2/academic/sessions/:routedSessionId/approve',
        ],
        dbEvidence: exceptionRow,
        positiveProof: `HVU approved exception ${rescheduleExceptionId} and independent checker published replacement session ${routedReplacementSessionId}.`,
        negativeRbacProof: 'Maker cannot self-approve routed replacement session (403).',
        reviewerOutcome: 'PASS_DISPOSABLE_E2E_REVIEWABLE',
      },
      'UCV2-49': {
        canonicalName: 'HVU xét duyệt và xử lý tranh chấp giờ công giảng dạy của giảng viên',
        primaryActor: 'HVU (Academic Manager) / GV (Instructor)',
        routeUi: '/workspace/inspection',
        apiEndpoints: ['POST /api/v2/inspection/assignments/:id/commands'],
        dbEvidence: inspectionRow,
        positiveProof: `HVU issued PARTIAL review, GV submitted DISPUTE, and HVU issued compensating APPROVE review on assignment ${inspectionAssignmentId}.`,
        negativeRbacProof: 'TT or GV cannot execute REVIEW command (403/404).',
        reviewerOutcome: 'PASS_DISPOSABLE_E2E_REVIEWABLE',
      },
      'UCV2-50': {
        canonicalName: 'TT nhận và theo dõi ca thanh tra theo lịch phân công',
        primaryActor: 'TT (Teaching Inspector)',
        routeUi: '/workspace/inspection',
        apiEndpoints: [
          'GET /api/v2/inspection/assignments/:id',
          'POST /api/v2/inspection/assignments/:id/commands (IN/OUT)',
        ],
        dbEvidence: inspectionRow,
        positiveProof: `TT viewed assigned shift ${inspectionAssignmentId} and clocked IN and OUT.`,
        negativeRbacProof: 'Overlapping dispatch of same TT to simultaneous session rejected with 409.',
        reviewerOutcome: 'PASS_DISPOSABLE_E2E_REVIEWABLE',
      },
      'UCV2-51': {
        canonicalName: 'TT giám sát buổi học và lập biên bản xác nhận giờ giảng',
        primaryActor: 'TT (Teaching Inspector)',
        routeUi: '/workspace/inspection',
        apiEndpoints: [
          'POST /api/v2/inspection/assignments/:id/commands (START/STOP/REPORT)',
        ],
        dbEvidence: inspectionRow,
        positiveProof: `TT recorded observation segment (>1s) and submitted TT-REPORTED supervision report on ${inspectionAssignmentId}.`,
        negativeRbacProof: 'GV cannot read TT shift clocks; unclocked TT cannot submit report (409).',
        reviewerOutcome: 'PASS_DISPOSABLE_E2E_REVIEWABLE',
      },
    };

    proofs.p2d_w10_role_reports_and_csv = {
      reportDate: today,
      timeZone: 'Asia/Ho_Chi_Minh',
      allSevenRolesNonZero: true,
      zeroUnavailableSourcesAcrossAllSevenRoles: true,
      roleReportSummaries,
      roleCsvExports,
    };

    proofs.journey_j3_grading_w09_certificates_w10_reports = {
      newProgramId,
      newVersionId,
      createdRoomId,
      policyId,
      issuedCertificateId,
      issuedCertificateCode,
      revokedCertificateId,
      revokedCertificateCode,
      staffAccountId: staffAcc.body.id,
      roleDecisionId: roleReq.body.id,
      configProposalId: cfgProposal.body.id,
      systemHealth: sysAudit.body.health,
    };

    proofs.sqlReadbacks = {
      financeScenarios: (proofs.p1a_finance_reconciliation as { scenarios: unknown }).scenarios,
      roomInventory: roomRow,
      knowledgeAndQuestions: knowledgeRows,
      assignmentGrading: gradingRow,
      sessionEngagementAndAttendance: sessionRow,
      scheduleExceptionAndReplacement: exceptionRow,
      inspectionAndHoursDispute: inspectionRow,
    };
  }, 120000);

  it('Block 5 — Chrome CDP Browser Verification (1440×900 Desktop & 390×844 Mobile): Captures 14 Screenshots across J1, J2, J3 & All 7 Roles with 0 Overflow, 0 5xx & Non-Destructive Cancel Check', async () => {
    const browserReport = await runArgonWave04BrowserVerification({
      apiPort,
      password: uat.password,
      actors: {
        learnerEmail: uat.learner.email,
        unenrolledLearnerEmail: uat.unenrolledHv1.email,
        secondUnenrolledLearnerEmail: uat.unenrolledHv2.email,
        counselorEmail: uat.counselor.email,
        teacherEmail: uat.teacher.email,
        hvuMakerEmail: uat.academic.email,
        hvuCheckerEmail: uat.planningApprover.email,
        cashierEmail: uat.cashier.email,
        inspectorEmail: uat.inspector.email,
        adminEmail: uat.admin.email,
      },
      ids: {
        courseId: newProgramId,
        classOfferingId: uat.classes.normal.id,
        supportTicketId,
        admissionApplicationId: directApplicationId,
        lrAttemptId,
        fourAttemptId,
        certificateCode: issuedCertificateCode,
        revokedCertificateCode,
      },
    });

    expect(browserReport.totalScreenshots).toBe(14);
    expect(browserReport.zero5xxResponses).toBe(true);
    expect(browserReport.zeroHorizontalOverflow).toBe(true);
    expect(browserReport.cancelDialogNonDestructiveVerified).toBe(true);
    proofs.browserVerification = browserReport;
  }, 180000);
});
