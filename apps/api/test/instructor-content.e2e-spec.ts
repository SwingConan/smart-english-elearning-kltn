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

describe('Instructor content APIs (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let instructorAgent: ReturnType<typeof request.agent>;
  let studentAgent: ReturnType<typeof request.agent>;
  let adminAgent: ReturnType<typeof request.agent>;
  const unique = `${Date.now()}-${process.pid}`;
  const password = 'Vs02Instructor!2026';
  const sessionIds = new Set<string>();
  const userIds: string[] = [];
  const courseIds: string[] = [];
  let assignedCourseId: string;
  let foreignCourseId: string;
  let enrollmentId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);

    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const [admin, instructor, otherInstructor, student] = await Promise.all([
      createUser('admin', UserRole.ADMIN_COORDINATOR, passwordHash),
      createUser('instructor', UserRole.INSTRUCTOR, passwordHash),
      createUser('other-instructor', UserRole.INSTRUCTOR, passwordHash),
      createUser('student', UserRole.STUDENT, passwordHash),
    ]);
    userIds.push(admin.id, instructor.id, otherInstructor.id, student.id);
    const [assignedCourse, foreignCourse] = await Promise.all([
      createCourse('assigned', admin.id),
      createCourse('foreign', admin.id),
    ]);
    courseIds.push(assignedCourse.id, foreignCourse.id);
    assignedCourseId = assignedCourse.id;
    foreignCourseId = foreignCourse.id;

    const [assignedOffering] = await Promise.all([
      prisma.classOffering.create({ data: { courseId: assignedCourse.id, instructorId: instructor.id, name: 'Assigned class', status: ClassOfferingStatus.OPEN, pricingType: PricingType.FREE } }),
      prisma.classOffering.create({ data: { courseId: foreignCourse.id, instructorId: otherInstructor.id, name: 'Foreign class', status: ClassOfferingStatus.OPEN, pricingType: PricingType.FREE } }),
    ]);
    const enrollment = await prisma.enrollment.create({ data: { learnerId: student.id, classOfferingId: assignedOffering.id, status: EnrollmentStatus.ACTIVE } });
    enrollmentId = enrollment.id;

    instructorAgent = request.agent(app.getHttpServer());
    studentAgent = request.agent(app.getHttpServer());
    adminAgent = request.agent(app.getHttpServer());
    await login(instructorAgent, `vs02-instructor-${unique}@example.test`);
    await login(studentAgent, `vs02-student-${unique}@example.test`);
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

  it('enforces authentication, role and nested course ownership', async () => {
    await request(app.getHttpServer()).get(`/api/instructor/courses/${assignedCourseId}/modules`).expect(401);
    await studentAgent.get(`/api/instructor/courses/${assignedCourseId}/modules`).expect(403);
    await adminAgent.get(`/api/instructor/courses/${assignedCourseId}/modules`).expect(403);
    await instructorAgent.get(`/api/instructor/courses/${assignedCourseId}/modules`).expect(200);
    await instructorAgent.get(`/api/instructor/courses/${foreignCourseId}/modules`).expect(403);

    const foreignModule = await prisma.module.create({ data: { courseId: foreignCourseId, title: 'Foreign module', orderIndex: 0 } });
    const foreignLesson = await prisma.lesson.create({ data: { moduleId: foreignModule.id, title: 'Foreign lesson', orderIndex: 0 } });
    const foreignResource = await prisma.learningResource.create({ data: { lessonId: foreignLesson.id, title: 'Foreign link', type: ResourceType.LINK, url: 'https://example.test/foreign', orderIndex: 0 } });
    await instructorAgent.patch(`/api/instructor/lessons/${foreignLesson.id}`).send({ title: 'Denied' }).expect(403);
    await instructorAgent.patch(`/api/instructor/resources/${foreignResource.id}`).send({ title: 'Denied' }).expect(403);
  });

  it('supports CRUD, contiguous ordering, persistent reorder and delete guards', async () => {
    const moduleA = await createModule(assignedCourseId, 'Module A', 201);
    const moduleB = await createModule(assignedCourseId, 'Module B', 201);
    expect([moduleA.orderIndex, moduleB.orderIndex]).toEqual([0, 1]);
    await instructorAgent.patch(`/api/instructor/courses/${assignedCourseId}/modules/reorder`).send({ orderedIds: [moduleB.id, moduleA.id] }).expect(200);
    expect(await moduleOrder(assignedCourseId)).toEqual([moduleB.id, moduleA.id]);
    await instructorAgent.patch(`/api/instructor/modules/${moduleA.id}`).send({ title: 'Module A updated' }).expect(200);

    const lessonA = await createLesson(moduleA.id, 'Lesson A', 201);
    const lessonB = await createLesson(moduleA.id, 'Lesson B', 201);
    expect([lessonA.orderIndex, lessonB.orderIndex]).toEqual([0, 1]);
    await instructorAgent.patch(`/api/instructor/modules/${moduleA.id}/lessons/reorder`).send({ orderedIds: [lessonB.id, lessonA.id] }).expect(200);
    expect(await lessonOrder(moduleA.id)).toEqual([lessonB.id, lessonA.id]);
    await instructorAgent.patch(`/api/instructor/lessons/${lessonA.id}`).send({ title: 'Lesson A updated' }).expect(200);

    const resourceA = await createResource(lessonA.id, 'Resource A', 201);
    const resourceB = await createResource(lessonA.id, 'Resource B', 201);
    expect([resourceA.orderIndex, resourceB.orderIndex]).toEqual([0, 1]);
    await instructorAgent.patch(`/api/instructor/lessons/${lessonA.id}/resources/reorder`).send({ orderedIds: [resourceB.id, resourceA.id] }).expect(200);
    expect(await resourceOrder(lessonA.id)).toEqual([resourceB.id, resourceA.id]);
    await instructorAgent.patch(`/api/instructor/resources/${resourceA.id}`).send({ title: 'Resource A updated' }).expect(200);

    await prisma.lessonProgress.create({ data: { enrollmentId, lessonId: lessonA.id, status: LessonProgressStatus.IN_PROGRESS } });
    await instructorAgent.delete(`/api/instructor/lessons/${lessonA.id}`).expect(409);
    await instructorAgent.delete(`/api/instructor/modules/${moduleA.id}`).expect(409);
    await expect(prisma.lessonProgress.count({ where: { enrollmentId, lessonId: lessonA.id } })).resolves.toBe(1);

    await instructorAgent.delete(`/api/instructor/resources/${resourceA.id}`).expect(200);
    await instructorAgent.delete(`/api/instructor/lessons/${lessonB.id}`).expect(200);
    await instructorAgent.delete(`/api/instructor/modules/${moduleB.id}`).expect(200);
  });

  it('preserves unique contiguous order under concurrent creates', async () => {
    const moduleParent = await prisma.module.create({ data: { courseId: assignedCourseId, title: 'Race parent', orderIndex: await nextModuleOrder() } });
    const lessonParent = await prisma.lesson.create({ data: { moduleId: moduleParent.id, title: 'Race lesson parent', orderIndex: 0 } });

    const moduleResponses = await Promise.all([
      instructorAgent.post(`/api/instructor/courses/${assignedCourseId}/modules`).send({ title: 'Race module 1' }),
      instructorAgent.post(`/api/instructor/courses/${assignedCourseId}/modules`).send({ title: 'Race module 2' }),
    ]);
    expect(moduleResponses.map(({ status }) => status)).toEqual([201, 201]);
    expectContiguous((await prisma.module.findMany({ where: { id: { in: moduleResponses.map(({ body }) => body.id) } }, select: { orderIndex: true } })).map(({ orderIndex }) => orderIndex));

    const lessonResponses = await Promise.all([
      instructorAgent.post(`/api/instructor/modules/${moduleParent.id}/lessons`).send({ title: 'Race lesson 1' }),
      instructorAgent.post(`/api/instructor/modules/${moduleParent.id}/lessons`).send({ title: 'Race lesson 2' }),
    ]);
    expect(lessonResponses.map(({ status }) => status)).toEqual([201, 201]);
    expectContiguous(lessonResponses.map(({ body }) => body.orderIndex));

    const resourceResponses = await Promise.all([
      instructorAgent.post(`/api/instructor/lessons/${lessonParent.id}/resources`).send({ title: 'Race resource 1', type: 'LINK', url: 'https://example.test/1' }),
      instructorAgent.post(`/api/instructor/lessons/${lessonParent.id}/resources`).send({ title: 'Race resource 2', type: 'LINK', url: 'https://example.test/2' }),
    ]);
    expect(resourceResponses.map(({ status }) => status)).toEqual([201, 201]);
    expectContiguous(resourceResponses.map(({ body }) => body.orderIndex));
  });

  async function createUser(label: string, role: UserRole, passwordHash: string) {
    return prisma.user.create({ data: { email: `vs02-${label}-${unique}@example.test`, fullName: label, role, status: UserStatus.ACTIVE, passwordHash } });
  }
  async function createCourse(label: string, createdById: string) {
    return prisma.course.create({ data: { title: `VS02 ${label} ${unique}`, slug: `vs02-${label}-${unique}`, description: 'E2E', level: 'E2E', isPublished: true, createdById } });
  }
  async function login(agent: ReturnType<typeof request.agent>, email: string) {
    const response = await agent.post('/api/auth/login').send({ email, password }).expect(200);
    sessionIds.add(extractSessionId(cookie(response.headers['set-cookie'])));
  }
  async function createModule(course: string, title: string, status: number) {
    return (await instructorAgent.post(`/api/instructor/courses/${course}/modules`).send({ title }).expect(status)).body;
  }
  async function createLesson(module: string, title: string, status: number) {
    return (await instructorAgent.post(`/api/instructor/modules/${module}/lessons`).send({ title }).expect(status)).body;
  }
  async function createResource(lesson: string, title: string, status: number) {
    return (await instructorAgent.post(`/api/instructor/lessons/${lesson}/resources`).send({ title, type: 'DOCUMENT', url: 'https://example.test/doc', isDownloadable: true }).expect(status)).body;
  }
  async function moduleOrder(course: string) { return (await prisma.module.findMany({ where: { courseId: course }, orderBy: { orderIndex: 'asc' }, select: { id: true } })).map(({ id }) => id); }
  async function lessonOrder(module: string) { return (await prisma.lesson.findMany({ where: { moduleId: module }, orderBy: { orderIndex: 'asc' }, select: { id: true } })).map(({ id }) => id); }
  async function resourceOrder(lesson: string) { return (await prisma.learningResource.findMany({ where: { lessonId: lesson }, orderBy: { orderIndex: 'asc' }, select: { id: true } })).map(({ id }) => id); }
  async function nextModuleOrder() { return prisma.module.count({ where: { courseId: assignedCourseId } }); }
});

function expectContiguous(values: number[]): void {
  const sorted = [...values].sort((a, b) => a - b);
  expect(new Set(sorted).size).toBe(values.length);
  expect(sorted[sorted.length - 1] - sorted[0]).toBe(values.length - 1);
}
function cookie(value: string[] | string | undefined): string {
  const result = Array.isArray(value) ? value[0] : value;
  if (!result) throw new Error('Expected session cookie');
  return result;
}
function extractSessionId(value: string): string {
  const signed = decodeURIComponent(value.split(';', 1)[0].split('=', 2)[1]);
  const unsigned = signed.startsWith('s:') ? signed.slice(2) : signed;
  return unsigned.slice(0, unsigned.lastIndexOf('.'));
}
