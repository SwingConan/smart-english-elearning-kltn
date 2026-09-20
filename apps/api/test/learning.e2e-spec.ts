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
  ResourceType,
  UserRole,
  UserStatus,
} from '../src/generated/prisma/client';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';

describe('Student learning APIs (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let studentAgent: ReturnType<typeof request.agent>;
  let otherStudentAgent: ReturnType<typeof request.agent>;
  let instructorAgent: ReturnType<typeof request.agent>;
  let adminAgent: ReturnType<typeof request.agent>;
  const unique = `${Date.now()}-${process.pid}`;
  const password = 'Vs02Learning!2026';
  const sessionIds = new Set<string>();
  const userIds: string[] = [];
  const courseIds: string[] = [];
  const enrollments = new Map<EnrollmentStatus | string, string>();
  let courseId: string;
  let lessonAId: string;
  let lessonBId: string;
  let foreignLessonId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);

    const hash = await argon2.hash(password, { type: argon2.argon2id });
    const [admin, instructor, student, otherStudent] = await Promise.all([
      createUser('admin', UserRole.ADMIN_COORDINATOR, hash), createUser('instructor', UserRole.INSTRUCTOR, hash),
      createUser('student', UserRole.STUDENT, hash), createUser('other-student', UserRole.STUDENT, hash),
    ]);
    userIds.push(admin.id, instructor.id, student.id, otherStudent.id);
    const [course, foreignCourse, emptyCourse] = await Promise.all([createCourse('course', admin.id), createCourse('foreign', admin.id), createCourse('empty', admin.id)]);
    courseIds.push(course.id, foreignCourse.id, emptyCourse.id);
    courseId = course.id;
    const module = await prisma.module.create({ data: { courseId, title: 'Module', orderIndex: 0 } });
    const foreignModule = await prisma.module.create({ data: { courseId: foreignCourse.id, title: 'Foreign module', orderIndex: 0 } });
    const [lessonA, lessonB, foreignLesson] = await Promise.all([
      prisma.lesson.create({ data: { moduleId: module.id, title: 'Lesson A', orderIndex: 0 } }),
      prisma.lesson.create({ data: { moduleId: module.id, title: 'Lesson B', orderIndex: 1 } }),
      prisma.lesson.create({ data: { moduleId: foreignModule.id, title: 'Foreign lesson', orderIndex: 0 } }),
    ]);
    lessonAId = lessonA.id; lessonBId = lessonB.id; foreignLessonId = foreignLesson.id;
    await prisma.learningResource.createMany({ data: [
      { lessonId: lessonA.id, title: 'Video', type: ResourceType.VIDEO, url: 'https://example.test/video', orderIndex: 0 },
      { lessonId: lessonA.id, title: 'Document', type: ResourceType.DOCUMENT, url: 'https://example.test/doc', orderIndex: 1, isDownloadable: true },
    ] });

    for (const status of Object.values(EnrollmentStatus)) {
      const offering = await prisma.classOffering.create({ data: { courseId, instructorId: instructor.id, name: `${status} class`, status: ClassOfferingStatus.OPEN, pricingType: PricingType.FREE } });
      const enrollment = await prisma.enrollment.create({ data: { learnerId: student.id, classOfferingId: offering.id, status } });
      enrollments.set(status, enrollment.id);
    }
    const otherOffering = await prisma.classOffering.create({ data: { courseId, instructorId: instructor.id, name: 'Other student class', status: ClassOfferingStatus.OPEN, pricingType: PricingType.FREE } });
    const otherEnrollment = await prisma.enrollment.create({ data: { learnerId: otherStudent.id, classOfferingId: otherOffering.id, status: EnrollmentStatus.ACTIVE } });
    enrollments.set('OTHER', otherEnrollment.id);
    const emptyOffering = await prisma.classOffering.create({ data: { courseId: emptyCourse.id, instructorId: instructor.id, name: 'Empty course class', status: ClassOfferingStatus.OPEN, pricingType: PricingType.FREE } });
    const emptyEnrollment = await prisma.enrollment.create({ data: { learnerId: student.id, classOfferingId: emptyOffering.id, status: EnrollmentStatus.ACTIVE } });
    enrollments.set('ZERO', emptyEnrollment.id);

    for (const label of ['OPEN_OPEN', 'COMPLETE_COMPLETE', 'OPEN_COMPLETE']) {
      const offering = await prisma.classOffering.create({ data: { courseId, instructorId: instructor.id, name: `${label} class`, status: ClassOfferingStatus.OPEN, pricingType: PricingType.FREE } });
      const enrollment = await prisma.enrollment.create({ data: { learnerId: student.id, classOfferingId: offering.id, status: EnrollmentStatus.ACTIVE } });
      enrollments.set(label, enrollment.id);
    }

    studentAgent = request.agent(app.getHttpServer()); otherStudentAgent = request.agent(app.getHttpServer());
    instructorAgent = request.agent(app.getHttpServer()); adminAgent = request.agent(app.getHttpServer());
    await login(studentAgent, `vs02-student-${unique}@example.test`);
    await login(otherStudentAgent, `vs02-other-student-${unique}@example.test`);
    await login(instructorAgent, `vs02-instructor-${unique}@example.test`);
    await login(adminAgent, `vs02-admin-${unique}@example.test`);
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.userSession.deleteMany({ where: { sid: { in: [...sessionIds] } } });
      await prisma.lessonProgress.deleteMany({ where: { enrollment: { classOffering: { courseId: { in: courseIds } } } } });
      await prisma.enrollment.deleteMany({ where: { classOffering: { courseId: { in: courseIds } } } });
      await prisma.learningResource.deleteMany({ where: { lesson: { module: { courseId: { in: courseIds } } } } });
      await prisma.lesson.deleteMany({ where: { module: { courseId: { in: courseIds } } } });
      await prisma.module.deleteMany({ where: { courseId: { in: courseIds } } });
      await prisma.classOffering.deleteMany({ where: { courseId: { in: courseIds } } });
      await prisma.course.deleteMany({ where: { id: { in: courseIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    if (app) await app.close();
  });

  it('enforces authentication, STUDENT role, ACTIVE status, IDOR and course integrity', async () => {
    const active = id(EnrollmentStatus.ACTIVE);
    await request(app.getHttpServer()).get(`/api/learning/enrollments/${active}/content`).expect(401);
    await instructorAgent.get(`/api/learning/enrollments/${active}/content`).expect(403);
    await adminAgent.get(`/api/learning/enrollments/${active}/content`).expect(403);
    await studentAgent.get(`/api/learning/enrollments/${active}/content`).expect(200);
    await otherStudentAgent.get(`/api/learning/enrollments/${active}/content`).expect(404);
    await studentAgent.post(`/api/learning/enrollments/${active}/lessons/${foreignLessonId}/open`).expect(404);
    await studentAgent.patch(`/api/learning/enrollments/${active}/lessons/${foreignLessonId}/complete`).expect(404);

    for (const status of [EnrollmentStatus.PENDING_PAYMENT, EnrollmentStatus.COMPLETED, EnrollmentStatus.DROPPED, EnrollmentStatus.CANCELLED]) {
      const enrollmentId = id(status);
      await studentAgent.get(`/api/learning/enrollments/${enrollmentId}/content`).expect(404);
      await studentAgent.post(`/api/learning/enrollments/${enrollmentId}/lessons/${lessonAId}/open`).expect(404);
      await studentAgent.patch(`/api/learning/enrollments/${enrollmentId}/lessons/${lessonAId}/complete`).expect(404);
      await studentAgent.get(`/api/learning/enrollments/${enrollmentId}/progress`).expect(404);
    }
  });

  it('opens, completes idempotently and calculates course-scoped progress', async () => {
    const active = id(EnrollmentStatus.ACTIVE);
    const opened = await studentAgent.post(`/api/learning/enrollments/${active}/lessons/${lessonAId}/open`).expect(201);
    expect(opened.body.progress.status).toBe(LessonProgressStatus.IN_PROGRESS);
    const reopened = await studentAgent.post(`/api/learning/enrollments/${active}/lessons/${lessonAId}/open`).expect(201);
    expect(reopened.body.progress.status).toBe(LessonProgressStatus.IN_PROGRESS);
    const completed = await studentAgent.patch(`/api/learning/enrollments/${active}/lessons/${lessonAId}/complete`).expect(200);
    const completedAt = completed.body.completedAt;
    const repeated = await studentAgent.patch(`/api/learning/enrollments/${active}/lessons/${lessonAId}/complete`).expect(200);
    expect(repeated.body.completedAt).toBe(completedAt);
    const reopenedCompleted = await studentAgent.post(`/api/learning/enrollments/${active}/lessons/${lessonAId}/open`).expect(201);
    expect(reopenedCompleted.body.progress.status).toBe(LessonProgressStatus.COMPLETED);
    expect(reopenedCompleted.body.progress.completedAt).toBe(completedAt);

    await prisma.lessonProgress.create({ data: { enrollmentId: active, lessonId: foreignLessonId, status: LessonProgressStatus.COMPLETED } });
    const progress = await studentAgent.get(`/api/learning/enrollments/${active}/progress`).expect(200);
    expect(progress.body).toMatchObject({ totalLessons: 2, completedLessons: 1, progressPercent: 50 });
    const content = await studentAgent.get(`/api/learning/enrollments/${active}/content`).expect(200);
    expect(content.body.modules[0].lessons).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: lessonAId, progressStatus: LessonProgressStatus.COMPLETED, resourceCount: 2 }),
      expect.objectContaining({ id: lessonBId, progressStatus: 'NOT_STARTED' }),
    ]));
    expect(content.body).not.toHaveProperty('mastery');

    const zero = await studentAgent.get(`/api/learning/enrollments/${id('ZERO')}/progress`).expect(200);
    expect(zero.body).toMatchObject({ totalLessons: 0, completedLessons: 0, progressPercent: 0 });
  });

  it('keeps one IN_PROGRESS row under concurrent open/open', async () => {
    const enrollmentId = id('OPEN_OPEN');
    const responses = await Promise.all([open(enrollmentId), open(enrollmentId)]);
    expect(responses.every(({ status }) => status < 500)).toBe(true);
    await expect(progressRows(enrollmentId)).resolves.toEqual([{ status: LessonProgressStatus.IN_PROGRESS, completedAt: null }]);
  });

  it('keeps one completed row under concurrent complete/complete', async () => {
    const enrollmentId = id('COMPLETE_COMPLETE');
    const responses = await Promise.all([complete(enrollmentId), complete(enrollmentId)]);
    expect(responses.every(({ status }) => status < 500)).toBe(true);
    const rows = await progressRows(enrollmentId);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe(LessonProgressStatus.COMPLETED);
    expect(rows[0].completedAt).toBeInstanceOf(Date);
  });

  it('never downgrades COMPLETED under concurrent open/complete', async () => {
    const enrollmentId = id('OPEN_COMPLETE');
    const responses = await Promise.all([open(enrollmentId), complete(enrollmentId)]);
    expect(responses.every(({ status }) => status < 500)).toBe(true);
    const rows = await progressRows(enrollmentId);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe(LessonProgressStatus.COMPLETED);
    expect(rows[0].completedAt).toBeInstanceOf(Date);
  });

  async function createUser(label: string, role: UserRole, passwordHash: string) { return prisma.user.create({ data: { email: `vs02-${label}-${unique}@example.test`, fullName: label, role, status: UserStatus.ACTIVE, passwordHash } }); }
  async function createCourse(label: string, createdById: string) { return prisma.course.create({ data: { title: `VS02 ${label} ${unique}`, slug: `vs02-learning-${label}-${unique}`, description: 'E2E', level: 'E2E', isPublished: true, createdById } }); }
  async function login(agent: ReturnType<typeof request.agent>, email: string) { const response = await agent.post('/api/auth/login').send({ email, password }).expect(200); sessionIds.add(extractSessionId(cookie(response.headers['set-cookie']))); }
  function id(key: EnrollmentStatus | string): string { const value = enrollments.get(key); if (!value) throw new Error(`Missing enrollment ${key}`); return value; }
  function open(enrollmentId: string) { return studentAgent.post(`/api/learning/enrollments/${enrollmentId}/lessons/${lessonBId}/open`); }
  function complete(enrollmentId: string) { return studentAgent.patch(`/api/learning/enrollments/${enrollmentId}/lessons/${lessonBId}/complete`); }
  function progressRows(enrollmentId: string) { return prisma.lessonProgress.findMany({ where: { enrollmentId, lessonId: lessonBId }, select: { status: true, completedAt: true } }); }
});

function cookie(value: string[] | string | undefined): string { const result = Array.isArray(value) ? value[0] : value; if (!result) throw new Error('Expected session cookie'); return result; }
function extractSessionId(value: string): string { const signed = decodeURIComponent(value.split(';', 1)[0].split('=', 2)[1]); const unsigned = signed.startsWith('s:') ? signed.slice(2) : signed; return unsigned.slice(0, unsigned.lastIndexOf('.')); }
