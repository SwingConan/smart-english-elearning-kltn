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
  let adminId: string;

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
    adminId = admin.id;
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

  it('preserves complete contiguous membership under concurrent reorder', async () => {
    const course = await createCourse('reorder-race', adminId);
    courseIds.push(course.id);
    await prisma.classOffering.create({ data: { courseId: course.id, instructorId: userIds[1], name: 'Reorder race class', status: ClassOfferingStatus.OPEN, pricingType: PricingType.FREE } });
    const modules = [];
    for (let orderIndex = 0; orderIndex < 3; orderIndex += 1) {
      modules.push(await prisma.module.create({ data: { courseId: course.id, title: `Reorder module ${orderIndex}`, orderIndex } }));
    }
    const lessons = [];
    for (let orderIndex = 0; orderIndex < 3; orderIndex += 1) {
      lessons.push(await prisma.lesson.create({ data: { moduleId: modules[0].id, title: `Reorder lesson ${orderIndex}`, orderIndex } }));
    }
    const resources = [];
    for (let orderIndex = 0; orderIndex < 3; orderIndex += 1) {
      resources.push(await prisma.learningResource.create({ data: { lessonId: lessons[0].id, title: `Reorder resource ${orderIndex}`, type: ResourceType.LINK, url: `https://example.test/reorder-${orderIndex}`, orderIndex } }));
    }

    const moduleResponses = await Promise.all([
      instructorAgent.patch(`/api/instructor/courses/${course.id}/modules/reorder`).send({ orderedIds: [modules[2].id, modules[1].id, modules[0].id] }),
      instructorAgent.patch(`/api/instructor/courses/${course.id}/modules/reorder`).send({ orderedIds: [modules[1].id, modules[0].id, modules[2].id] }),
    ]);
    assertConcurrentReorderResponses(moduleResponses);
    assertOrderedRows(await prisma.module.findMany({ where: { courseId: course.id }, orderBy: { orderIndex: 'asc' }, select: { id: true, orderIndex: true } }), modules.map(({ id }) => id));

    const lessonResponses = await Promise.all([
      instructorAgent.patch(`/api/instructor/modules/${modules[0].id}/lessons/reorder`).send({ orderedIds: [lessons[2].id, lessons[1].id, lessons[0].id] }),
      instructorAgent.patch(`/api/instructor/modules/${modules[0].id}/lessons/reorder`).send({ orderedIds: [lessons[1].id, lessons[0].id, lessons[2].id] }),
    ]);
    assertConcurrentReorderResponses(lessonResponses);
    assertOrderedRows(await prisma.lesson.findMany({ where: { moduleId: modules[0].id }, orderBy: { orderIndex: 'asc' }, select: { id: true, orderIndex: true } }), lessons.map(({ id }) => id));

    const resourceResponses = await Promise.all([
      instructorAgent.patch(`/api/instructor/lessons/${lessons[0].id}/resources/reorder`).send({ orderedIds: [resources[2].id, resources[1].id, resources[0].id] }),
      instructorAgent.patch(`/api/instructor/lessons/${lessons[0].id}/resources/reorder`).send({ orderedIds: [resources[1].id, resources[0].id, resources[2].id] }),
    ]);
    assertConcurrentReorderResponses(resourceResponses);
    assertOrderedRows(await prisma.learningResource.findMany({ where: { lessonId: lessons[0].id }, orderBy: { orderIndex: 'asc' }, select: { id: true, orderIndex: true } }), resources.map(({ id }) => id));
  });

  it('keeps COMPLETED learner progress when lesson and module deletion are rejected', async () => {
    const module = await prisma.module.create({ data: { courseId: assignedCourseId, title: 'Completed progress module', orderIndex: await nextModuleOrder() } });
    const lesson = await prisma.lesson.create({ data: { moduleId: module.id, title: 'Completed progress lesson', orderIndex: 0 } });
    await prisma.lessonProgress.create({ data: { enrollmentId, lessonId: lesson.id, status: LessonProgressStatus.COMPLETED, completedAt: new Date() } });

    await instructorAgent.delete(`/api/instructor/lessons/${lesson.id}`).expect(409);
    await instructorAgent.delete(`/api/instructor/modules/${module.id}`).expect(409);
    await expect(prisma.lessonProgress.findUnique({ where: { enrollmentId_lessonId: { enrollmentId, lessonId: lesson.id } }, select: { status: true } })).resolves.toEqual({ status: LessonProgressStatus.COMPLETED });
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
function assertConcurrentReorderResponses(responses: request.Response[]): void {
  expect(responses.every(({ status }) => status === 200 || status === 409)).toBe(true);
  expect(responses.every(({ text }) => !/P2002|P2034/.test(text))).toBe(true);
}
function assertOrderedRows(rows: Array<{ id: string; orderIndex: number }>, expectedIds: string[]): void {
  expect(rows.map(({ orderIndex }) => orderIndex)).toEqual([0, 1, 2]);
  expect(new Set(rows.map(({ id }) => id))).toEqual(new Set(expectedIds));
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
