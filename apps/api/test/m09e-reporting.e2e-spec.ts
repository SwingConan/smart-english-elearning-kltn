import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as argon2 from 'argon2';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import {
  AnswerEvaluationSource,
  AnswerEvaluationStatus,
  AssessmentStage,
  ClassOfferingStatus,
  EnrollmentStatus,
  PricingType,
  QuestionDifficulty,
  QuestionResponseType,
  TestAttemptStatus,
  TestPurpose,
  TestStatus,
  ToeicSkill,
  UserRole,
  UserStatus,
} from '../src/generated/prisma/client';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';
import { loginAgent } from './assessment-e2e-helpers';

describe('M09-E rebaselined Admin decision reporting (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: ReturnType<typeof request.agent>;
  let student: ReturnType<typeof request.agent>;
  let instructor: ReturnType<typeof request.agent>;
  const sessionIds = new Set<string>();
  const courseIds: string[] = [];
  const classIds: string[] = [];
  const enrollmentIds: string[] = [];
  const userIds: string[] = [];
  const attemptIds: string[] = [];
  const answerIds: string[] = [];
  const assessmentIds: string[] = [];
  const testQuestionIds: string[] = [];
  const questionIds: string[] = [];
  const testIds: string[] = [];
  const unique = `${Date.now()}-${process.pid}`;
  const password = 'M09eDecisionReporting!2026';
  const emails = {
    admin: `m09e-admin-${unique}@example.com`,
    student: `m09e-student-${unique}@example.com`,
    pending: `m09e-pending-${unique}@example.com`,
    instructor: `m09e-instructor-${unique}@example.com`,
  };
  let draftClassId: string;
  let fullClassId: string;
  let pendingEnrollmentId: string;
  let pendingAttemptId: string;
  let finalAttemptId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
    prisma = app.get(PrismaService);

    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const definitions = [
      [emails.admin, 'M09E Admin', UserRole.ADMIN_COORDINATOR],
      [emails.student, 'M09E Student', UserRole.STUDENT],
      [emails.pending, 'M09E Pending Student', UserRole.STUDENT],
      [emails.instructor, 'M09E Instructor', UserRole.INSTRUCTOR],
    ] as const;
    for (const [email, fullName, role] of definitions) {
      const user = await prisma.user.create({
        data: { email, fullName, role, status: UserStatus.ACTIVE, passwordHash },
      });
      userIds.push(user.id);
    }

    admin = request.agent(app.getHttpServer());
    student = request.agent(app.getHttpServer());
    instructor = request.agent(app.getHttpServer());
    await loginAgent(admin, emails.admin, password, sessionIds);
    await loginAgent(student, emails.student, password, sessionIds);
    await loginAgent(instructor, emails.instructor, password, sessionIds);

    const adminUser = { id: userIds[0] };
    const learners = [{ id: userIds[1] }, { id: userIds[2] }];
    const instructorUser = { id: userIds[3] };

    const course = await prisma.course.create({
      data: {
        title: `M09E Decision ${unique}`,
        slug: `m09e-decision-${unique}`,
        description: 'M09-E shadow fixture',
        level: 'FOUNDATION',
        isPublished: true,
        createdById: adminUser.id,
      },
    });
    courseIds.push(course.id);
    const draft = await prisma.classOffering.create({
      data: {
        courseId: course.id,
        code: `M09E-DRAFT-${unique}`,
        name: 'M09E exact draft not ready',
        status: ClassOfferingStatus.DRAFT,
        pricingType: PricingType.FREE,
      },
    });
    const full = await prisma.classOffering.create({
      data: {
        courseId: course.id,
        instructorId: instructorUser.id,
        code: `M09E-FULL-${unique}`,
        name: 'M09E exact open full',
        status: ClassOfferingStatus.OPEN,
        pricingType: PricingType.FREE,
        maxStudents: 1,
        classStart: new Date('2026-11-01T00:00:00.000Z'),
        classEnd: new Date('2026-12-01T00:00:00.000Z'),
      },
    });
    const pendingClass = await prisma.classOffering.create({
      data: {
        courseId: course.id,
        code: `M09E-PENDING-${unique}`,
        name: 'M09E pending payment class',
        status: ClassOfferingStatus.COMPLETED,
        pricingType: PricingType.PAID,
        tuitionFeeVnd: 500000,
      },
    });
    classIds.push(draft.id, full.id, pendingClass.id);
    draftClassId = draft.id;
    fullClassId = full.id;
    await prisma.classScheduleSlot.create({
      data: {
        classOfferingId: full.id,
        dayOfWeek: 2,
        startTime: new Date('1970-01-01T08:00:00.000Z'),
        endTime: new Date('1970-01-01T10:00:00.000Z'),
        meetingUrl: 'https://private.example.test/m09e',
      },
    });
    const active = await prisma.enrollment.create({
      data: {
        learnerId: learners[0].id,
        classOfferingId: full.id,
        status: EnrollmentStatus.ACTIVE,
        enrolledAt: new Date('2026-10-21T05:00:00.000Z'),
      },
    });
    const pending = await prisma.enrollment.create({
      data: {
        learnerId: learners[1].id,
        classOfferingId: pendingClass.id,
        status: EnrollmentStatus.PENDING_PAYMENT,
        enrolledAt: new Date('2026-10-01T05:00:00.000Z'),
      },
    });
    enrollmentIds.push(active.id, pending.id);
    pendingEnrollmentId = pending.id;

    const test = await prisma.test.create({
      data: {
        courseId: course.id,
        purpose: TestPurpose.IN_CLASS,
        title: `M09E Speaking/Writing ${unique}`,
        status: TestStatus.PUBLISHED,
      },
    });
    testIds.push(test.id);
    const question = await prisma.question.create({
      data: {
        courseId: course.id,
        responseType: QuestionResponseType.TEXT_RESPONSE,
        difficulty: QuestionDifficulty.EASY,
        toeicSkill: ToeicSkill.WRITING,
        content: 'M09-E protected productive response fixture',
      },
    });
    questionIds.push(question.id);
    const testQuestion = await prisma.testQuestion.create({
      data: { testId: test.id, questionId: question.id, orderIndex: 1, points: 10 },
    });
    testQuestionIds.push(testQuestion.id);
    const assessment = await prisma.classAssessment.create({
      data: {
        classOfferingId: full.id,
        testId: test.id,
        stage: AssessmentStage.MIDTERM,
      },
    });
    assessmentIds.push(assessment.id);
    const pendingAttempt = await prisma.testAttempt.create({
      data: {
        testId: test.id,
        learnerId: learners[0].id,
        enrollmentId: active.id,
        classAssessmentId: assessment.id,
        attemptNumber: 1,
        status: TestAttemptStatus.SUBMITTED,
        submittedAt: new Date('2026-10-20T05:00:00.000Z'),
      },
    });
    const finalAttempt = await prisma.testAttempt.create({
      data: {
        testId: test.id,
        learnerId: learners[0].id,
        enrollmentId: active.id,
        classAssessmentId: assessment.id,
        attemptNumber: 2,
        status: TestAttemptStatus.SUBMITTED,
        submittedAt: new Date('2026-10-21T05:00:00.000Z'),
      },
    });
    attemptIds.push(pendingAttempt.id, finalAttempt.id);
    pendingAttemptId = pendingAttempt.id;
    finalAttemptId = finalAttempt.id;
    const pendingAnswer = await prisma.testAnswer.create({
      data: {
        attemptId: pendingAttempt.id,
        testQuestionId: testQuestion.id,
        textResponse: 'Protected pending answer must never leave the grading service',
      },
    });
    const finalAnswer = await prisma.testAnswer.create({
      data: {
        attemptId: finalAttempt.id,
        testQuestionId: testQuestion.id,
        textResponse: 'Protected final answer must never leave the grading service',
      },
    });
    answerIds.push(pendingAnswer.id, finalAnswer.id);
    await prisma.answerEvaluation.create({
      data: {
        testAnswerId: finalAnswer.id,
        source: AnswerEvaluationSource.INSTRUCTOR,
        status: AnswerEvaluationStatus.REVIEWED_FINAL,
        evaluatorId: instructorUser.id,
        totalScore: 8,
      },
    });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.userSession.deleteMany({ where: { sid: { in: [...sessionIds] } } });
      await prisma.answerEvaluation.deleteMany({ where: { testAnswerId: { in: answerIds } } });
      await prisma.testAnswer.deleteMany({ where: { id: { in: answerIds } } });
      await prisma.testAttempt.deleteMany({ where: { id: { in: attemptIds } } });
      await prisma.classAssessment.deleteMany({ where: { id: { in: assessmentIds } } });
      await prisma.testQuestion.deleteMany({ where: { id: { in: testQuestionIds } } });
      await prisma.question.deleteMany({ where: { id: { in: questionIds } } });
      await prisma.test.deleteMany({ where: { id: { in: testIds } } });
      await prisma.enrollment.deleteMany({ where: { id: { in: enrollmentIds } } });
      await prisma.classScheduleSlot.deleteMany({ where: { classOfferingId: { in: classIds } } });
      await prisma.classOffering.deleteMany({ where: { id: { in: classIds } } });
      await prisma.course.deleteMany({ where: { id: { in: courseIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    if (app) await app.close();
  });

  it.each([
    '/api/admin/reports/system?from=2026-10-20&to=2026-10-23',
    '/api/admin/reports/classes',
    '/api/admin/reports/enrollments',
    '/api/admin/reports/grading-backlog',
  ])('enforces ADMIN_COORDINATOR RBAC for %s', async (path) => {
    await request(app.getHttpServer()).get(path).expect(401);
    await student.get(path).expect(403);
    await instructor.get(path).expect(403);
    await admin.get(path).expect(200);
  });

  it('returns actionable queues, class capacity, enrollment demand, and a private aggregate', async () => {
    const response = await admin
      .get('/api/admin/reports/system?from=2026-10-20&to=2026-10-23')
      .expect(200);
    expect(response.body.period).toMatchObject({
      from: '2026-10-20',
      to: '2026-10-23',
      days: 4,
      timeZone: 'Asia/Ho_Chi_Minh',
    });
    expect(response.body.actionQueues.draftNotReady).toBeGreaterThanOrEqual(1);
    expect(response.body.actionQueues.openFull).toBeGreaterThanOrEqual(1);
    expect(response.body.actionQueues.pendingPayment).toBeGreaterThanOrEqual(1);
    expect(response.body.actionQueues.gradingBacklog).toBeGreaterThanOrEqual(1);
    expect(response.body.classes.capacity.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: fullClassId,
          activeEnrollments: 1,
          maxStudents: 1,
          remainingSeats: 0,
          registrationState: 'FULL',
        }),
      ]),
    );
    expect(response.body.enrollmentDemand.byClass).toEqual(
      expect.arrayContaining([expect.objectContaining({ classOfferingId: fullClassId, count: 1 })]),
    );
    expect(response.body.enrollmentDemand.daily).toHaveLength(4);
    expect(
      response.body.enrollmentDemand.daily.some((row: { count: number }) => row.count === 0),
    ).toBe(true);
    const serialized = JSON.stringify(response.body);
    for (const forbidden of [
      'meetingUrl',
      'private.example.test',
      'passwordHash',
      'textResponse',
      'audioStorageKey',
      'submittedAssessments',
      'lessonCompletions',
    ])
      expect(serialized).not.toContain(forbidden);
  });

  it('drills into exact DRAFT NOT_READY and OPEN FULL classes with strict filters', async () => {
    const draft = await admin
      .get('/api/admin/reports/classes?status=DRAFT&readiness=NOT_READY')
      .expect(200);
    expect(draft.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: draftClassId,
          operationalReadiness: expect.objectContaining({ isReady: false }),
        }),
      ]),
    );
    const full = await admin
      .get('/api/admin/reports/classes?status=OPEN&registrationState=FULL')
      .expect(200);
    expect(full.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: fullClassId, registrationState: 'FULL' }),
      ]),
    );
    await admin.get('/api/admin/reports/classes?readiness=NOT_READY').expect(400);
    await admin.get('/api/admin/reports/classes?status=DRAFT&registrationState=FULL').expect(400);
    await admin.get('/api/admin/reports/classes?status=OPEN&readiness=NOT_READY').expect(400);
  });

  it('drills into pending and period/class/date enrollments with pagination and no payment inference', async () => {
    const pending = await admin
      .get(
        `/api/admin/reports/enrollments?status=PENDING_PAYMENT&search=${encodeURIComponent(emails.pending)}&limit=1`,
      )
      .expect(200);
    expect(pending.body.meta.limit).toBe(1);
    expect(pending.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: pendingEnrollmentId, status: 'PENDING_PAYMENT' }),
      ]),
    );
    const classPeriod = await admin
      .get(
        `/api/admin/reports/enrollments?from=2026-10-20&to=2026-10-23&classOfferingId=${fullClassId}`,
      )
      .expect(200);
    expect(classPeriod.body.data).toHaveLength(1);
    const sameDate = await admin
      .get(
        '/api/admin/reports/enrollments?from=2026-10-21&to=2026-10-21&search=M09E%20exact%20open',
      )
      .expect(200);
    expect(sameDate.body.data[0].classOffering.id).toBe(fullClassId);
    expect(JSON.stringify(pending.body)).not.toContain('paymentSuccess');
  });

  it('returns productive grading backlog oldest-first without protected answer fields', async () => {
    const response = await admin.get('/api/admin/reports/grading-backlog?limit=50').expect(200);
    const pending = response.body.data.find(
      (row: { attemptId: string }) => row.attemptId === pendingAttemptId,
    );
    expect(pending).toMatchObject({
      gradingState: expect.stringMatching(/SUBMITTED_PENDING_REVIEW|PARTIALLY_REVIEWED/),
      pendingProductiveAnswers: expect.any(Number),
    });
    expect(
      response.body.data.some((row: { attemptId: string }) => row.attemptId === finalAttemptId),
    ).toBe(false);
    const submitted = response.body.data.map((row: { submittedAt: string }) => row.submittedAt);
    expect(submitted).toEqual([...submitted].sort());
    const serialized = JSON.stringify(response.body);
    for (const forbidden of ['textResponse', 'audioStorageKey', 'criterionScores', 'feedback'])
      expect(serialized).not.toContain(forbidden);
  });
});
