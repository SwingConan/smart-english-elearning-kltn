import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as argon2 from 'argon2';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import {
  ClassOfferingStatus,
  EnrollmentStatus,
  LessonProgressStatus,
  PricingType,
  TestAttemptStatus,
  TestPurpose,
  TestStatus,
  UserRole,
  UserStatus,
} from '../src/generated/prisma/client';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';
import { loginAgent } from './assessment-e2e-helpers';

describe('M09-E UC43 system reporting (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: ReturnType<typeof request.agent>;
  let student: ReturnType<typeof request.agent>;
  let instructor: ReturnType<typeof request.agent>;
  const userIds: string[] = [];
  const courseIds: string[] = [];
  const classIds: string[] = [];
  const enrollmentIds: string[] = [];
  const moduleIds: string[] = [];
  const lessonIds: string[] = [];
  const testIds: string[] = [];
  const sessionIds = new Set<string>();
  const unique = `${Date.now()}-${process.pid}`;
  const password = 'M09eReporting!2026';
  const emails = {
    admin: `m09e-admin-${unique}@example.com`,
    student: `m09e-student-${unique}@example.com`,
    pending: `m09e-pending-${unique}@example.com`,
    instructor: `m09e-instructor-${unique}@example.com`,
  };

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
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.userSession.deleteMany({ where: { sid: { in: [...sessionIds] } } });
      await prisma.testAttempt.deleteMany({ where: { testId: { in: testIds } } });
      await prisma.lessonProgress.deleteMany({ where: { lessonId: { in: lessonIds } } });
      await prisma.test.deleteMany({ where: { id: { in: testIds } } });
      await prisma.lesson.deleteMany({ where: { id: { in: lessonIds } } });
      await prisma.module.deleteMany({ where: { id: { in: moduleIds } } });
      await prisma.enrollment.deleteMany({ where: { id: { in: enrollmentIds } } });
      await prisma.classScheduleSlot.deleteMany({ where: { classOfferingId: { in: classIds } } });
      await prisma.classOffering.deleteMany({ where: { id: { in: classIds } } });
      await prisma.course.deleteMany({ where: { id: { in: courseIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    if (app) await app.close();
  });

  it('enforces authentication, the admin role, and strict public periods', async () => {
    await request(app.getHttpServer()).get('/api/admin/reports/system').expect(401);
    await student.get('/api/admin/reports/system').expect(403);
    await instructor.get('/api/admin/reports/system').expect(403);
    await admin.get('/api/admin/reports/system').expect(200);
    await admin.get('/api/admin/reports/system?from=2026-10-01').expect(400);
    await admin.get('/api/admin/reports/system?from=2026-02-30&to=2026-03-01').expect(400);
    await admin.get('/api/admin/reports/system?from=2026-01-01&to=2026-04-01').expect(400);
    await admin.get('/api/admin/reports/system?from=2026-03-31&to=2026-01-01').expect(400);
  });

  it('proves snapshot semantics, private projection, and all three activity sources', async () => {
    const path = '/api/admin/reports/system?from=2026-10-20&to=2026-10-22';
    const before = await admin.get(path).expect(200);
    const adminId = userIds[0];
    const studentId = userIds[1];
    const pendingId = userIds[2];
    const instructorId = userIds[3];
    const extraAccount = await prisma.user.create({
      data: {
        email: `m09e-locked-${unique}@example.com`,
        fullName: 'M09E Locked Account',
        role: UserRole.STUDENT,
        status: UserStatus.LOCKED,
        passwordHash: await argon2.hash(`${password}-locked`, { type: argon2.argon2id }),
      },
    });
    userIds.push(extraAccount.id);
    const published = await prisma.course.create({
      data: {
        title: `M09E Published ${unique}`,
        slug: `m09e-published-${unique}`,
        description: 'Disposable M09-E reporting fixture',
        level: 'FOUNDATION',
        isPublished: true,
        createdById: adminId,
      },
    });
    const draft = await prisma.course.create({
      data: {
        title: `M09E Draft ${unique}`,
        slug: `m09e-draft-${unique}`,
        description: 'Disposable M09-E reporting fixture',
        level: 'FOUNDATION',
        isPublished: false,
        createdById: adminId,
      },
    });
    courseIds.push(published.id, draft.id);
    const open = await prisma.classOffering.create({
      data: {
        courseId: published.id,
        instructorId,
        code: `M09E-OPEN-${unique}`,
        name: 'M09-E Full Open Class',
        status: ClassOfferingStatus.OPEN,
        pricingType: PricingType.FREE,
        maxStudents: 1,
      },
    });
    const notReady = await prisma.classOffering.create({
      data: {
        courseId: draft.id,
        code: `M09E-DRAFT-${unique}`,
        name: 'M09-E Not Ready Draft',
        status: ClassOfferingStatus.DRAFT,
        pricingType: PricingType.FREE,
      },
    });
    const ready = await prisma.classOffering.create({
      data: {
        courseId: published.id,
        instructorId,
        code: `M09E-READY-${unique}`,
        name: 'M09-E Ready Draft',
        status: ClassOfferingStatus.DRAFT,
        pricingType: PricingType.FREE,
        classStart: new Date('2026-11-01T00:00:00.000Z'),
        classEnd: new Date('2026-12-01T00:00:00.000Z'),
      },
    });
    classIds.push(open.id, notReady.id, ready.id);
    await prisma.classScheduleSlot.create({
      data: {
        classOfferingId: open.id,
        dayOfWeek: 2,
        startTime: new Date('1970-01-01T08:00:00.000Z'),
        endTime: new Date('1970-01-01T10:00:00.000Z'),
        meetingUrl: 'https://meet.example.test/m09e-private',
      },
    });
    await prisma.classScheduleSlot.create({
      data: {
        classOfferingId: ready.id,
        dayOfWeek: 3,
        startTime: new Date('1970-01-01T08:00:00.000Z'),
        endTime: new Date('1970-01-01T10:00:00.000Z'),
        locationText: 'M09-E Room',
      },
    });
    const active = await prisma.enrollment.create({
      data: {
        learnerId: studentId,
        classOfferingId: open.id,
        status: EnrollmentStatus.ACTIVE,
        enrolledAt: new Date('2026-10-20T17:00:00.000Z'),
      },
    });
    const pendingClass = await prisma.classOffering.create({
      data: {
        courseId: published.id,
        code: `M09E-PENDING-${unique}`,
        name: 'M09-E Pending Class',
        status: ClassOfferingStatus.COMPLETED,
        pricingType: PricingType.FREE,
      },
    });
    classIds.push(pendingClass.id);
    const pending = await prisma.enrollment.create({
      data: {
        learnerId: pendingId,
        classOfferingId: pendingClass.id,
        status: EnrollmentStatus.PENDING_PAYMENT,
        enrolledAt: new Date('2026-10-01T00:00:00.000Z'),
      },
    });
    enrollmentIds.push(active.id, pending.id);
    const courseModule = await prisma.module.create({
      data: { courseId: published.id, title: 'M09-E module', orderIndex: 1 },
    });
    moduleIds.push(courseModule.id);
    const lessons = await Promise.all(
      [1, 2].map((orderIndex) =>
        prisma.lesson.create({
          data: { moduleId: courseModule.id, title: `M09-E lesson ${orderIndex}`, orderIndex },
        }),
      ),
    );
    lessonIds.push(...lessons.map((lesson) => lesson.id));
    await prisma.lessonProgress.createMany({
      data: [
        {
          enrollmentId: active.id,
          lessonId: lessons[0].id,
          status: LessonProgressStatus.COMPLETED,
          completedAt: new Date('2026-10-21T05:00:00.000Z'),
        },
        {
          enrollmentId: active.id,
          lessonId: lessons[1].id,
          status: LessonProgressStatus.NOT_STARTED,
          completedAt: null,
        },
      ],
    });
    const test = await prisma.test.create({
      data: {
        courseId: published.id,
        title: 'M09-E reporting test',
        purpose: TestPurpose.PRACTICE_MOCK,
        status: TestStatus.PUBLISHED,
      },
    });
    testIds.push(test.id);
    await prisma.testAttempt.createMany({
      data: [
        {
          testId: test.id,
          learnerId: studentId,
          enrollmentId: active.id,
          attemptNumber: 1,
          status: TestAttemptStatus.SUBMITTED,
          submittedAt: new Date('2026-10-21T06:00:00.000Z'),
        },
        {
          testId: test.id,
          learnerId: studentId,
          enrollmentId: active.id,
          attemptNumber: 2,
          status: TestAttemptStatus.IN_PROGRESS,
          submittedAt: null,
        },
        {
          testId: test.id,
          learnerId: studentId,
          enrollmentId: active.id,
          attemptNumber: 3,
          status: TestAttemptStatus.SUBMITTED,
          submittedAt: new Date('2026-10-23T17:00:00.000Z'),
        },
      ],
    });

    const after = await admin.get(path).expect(200);
    expect(after.body).toMatchObject({
      activity: {
        period: {
          from: '2026-10-20',
          to: '2026-10-22',
          days: 3,
          timeZone: 'Asia/Ho_Chi_Minh',
        },
      },
    });
    expect(after.body.snapshot.courses.total - before.body.snapshot.courses.total).toBe(2);
    expect(after.body.snapshot.courses.published - before.body.snapshot.courses.published).toBe(1);
    expect(after.body.snapshot.courses.draft - before.body.snapshot.courses.draft).toBe(1);
    expect(after.body.snapshot.accounts.total - before.body.snapshot.accounts.total).toBe(1);
    expect(
      after.body.snapshot.accounts.byStatus.LOCKED - before.body.snapshot.accounts.byStatus.LOCKED,
    ).toBe(1);
    expect(after.body.snapshot.classes.total - before.body.snapshot.classes.total).toBe(4);
    expect(
      after.body.snapshot.classes.draftReadiness.ready -
        before.body.snapshot.classes.draftReadiness.ready,
    ).toBe(1);
    expect(
      after.body.snapshot.classes.draftReadiness.notReady -
        before.body.snapshot.classes.draftReadiness.notReady,
    ).toBe(1);
    expect(
      after.body.snapshot.classes.openRegistration.FULL -
        before.body.snapshot.classes.openRegistration.FULL,
    ).toBe(1);
    expect(
      after.body.snapshot.enrollments.byStatus.ACTIVE -
        before.body.snapshot.enrollments.byStatus.ACTIVE,
    ).toBe(1);
    expect(
      after.body.snapshot.enrollments.byStatus.PENDING_PAYMENT -
        before.body.snapshot.enrollments.byStatus.PENDING_PAYMENT,
    ).toBe(1);
    expect(after.body.attention.draftNotReady - before.body.attention.draftNotReady).toBe(1);
    expect(after.body.attention.openFull - before.body.attention.openFull).toBe(1);
    expect(after.body.attention.pendingPayment - before.body.attention.pendingPayment).toBe(1);
    const beforeDay = before.body.activity.daily.find(
      (row: { date: string }) => row.date === '2026-10-21',
    );
    const afterDay = after.body.activity.daily.find(
      (row: { date: string }) => row.date === '2026-10-21',
    );
    expect(afterDay.newEnrollments - beforeDay.newEnrollments).toBe(1);
    expect(afterDay.submittedAssessments - beforeDay.submittedAssessments).toBe(1);
    expect(afterDay.lessonCompletions - beforeDay.lessonCompletions).toBe(1);
    expect(after.body.activity.daily).toHaveLength(3);
    expect(
      after.body.activity.daily.some(
        (row: {
          newEnrollments: number;
          submittedAssessments: number;
          lessonCompletions: number;
        }) =>
          row.newEnrollments === 0 && row.submittedAssessments === 0 && row.lessonCompletions === 0,
      ),
    ).toBe(true);
    const serialized = JSON.stringify(after.body);
    expect(serialized).not.toContain('meetingUrl');
    expect(serialized).not.toContain('m09e-private');
    expect(serialized).not.toContain('passwordHash');
    expect(serialized).not.toContain('storageKey');
    for (const forbidden of [
      'revenue',
      'paymentSuccess',
      'DAU',
      'MAU',
      'engagementScore',
      'toeicAggregate',
      'growth',
      'aiRisk',
      'bktMastery',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }

    const otherPeriod = await admin
      .get('/api/admin/reports/system?from=2026-10-01&to=2026-10-01')
      .expect(200);
    expect(otherPeriod.body.snapshot).toEqual(after.body.snapshot);
    expect(otherPeriod.body.attention).toEqual(after.body.attention);
  });
});
