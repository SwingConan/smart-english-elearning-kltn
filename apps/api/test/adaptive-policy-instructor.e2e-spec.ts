import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test as NestTest } from '@nestjs/testing';
import * as argon2 from 'argon2';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import {
  ClassOfferingStatus,
  PricingType,
  UserRole,
  UserStatus,
} from '../src/generated/prisma/client';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';
import { expectSafeError, loginAgent } from './assessment-e2e-helpers';

describe('Instructor adaptive-policy API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let instructorAgent: ReturnType<typeof request.agent>;
  let foreignInstructorAgent: ReturnType<typeof request.agent>;
  let studentAgent: ReturnType<typeof request.agent>;
  const sessionIds = new Set<string>();
  const userIds: string[] = [];
  const courseIds: string[] = [];
  const offeringIds: string[] = [];
  const unique = `${Date.now()}-${process.pid}`;
  const password = 'AdaptivePolicyE2e!2026';
  let courseId: string;

  beforeAll(async () => {
    const moduleRef = await NestTest.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
    prisma = app.get(PrismaService);

    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const [admin, instructor, foreignInstructor, student] = await Promise.all([
      createUser(`vs05-c1-admin-${unique}@example.test`, UserRole.ADMIN_COORDINATOR, passwordHash),
      createUser(`vs05-c1-instructor-${unique}@example.test`, UserRole.INSTRUCTOR, passwordHash),
      createUser(`vs05-c1-foreign-${unique}@example.test`, UserRole.INSTRUCTOR, passwordHash),
      createUser(`vs05-c1-student-${unique}@example.test`, UserRole.STUDENT, passwordHash),
    ]);
    userIds.push(admin.id, instructor.id, foreignInstructor.id, student.id);

    const course = await prisma.course.create({
      data: {
        title: 'VS05 C1 Policy Course',
        slug: `vs05-c1-policy-${unique}`,
        description: 'Adaptive policy E2E fixture',
        level: 'INTERMEDIATE',
        createdById: admin.id,
      },
    });
    courseId = course.id;
    courseIds.push(course.id);

    const offering = await prisma.classOffering.create({
      data: {
        courseId,
        instructorId: instructor.id,
        name: 'VS05 C1 Assigned Offering',
        status: ClassOfferingStatus.OPEN,
        pricingType: PricingType.FREE,
      },
    });
    offeringIds.push(offering.id);

    instructorAgent = request.agent(app.getHttpServer());
    foreignInstructorAgent = request.agent(app.getHttpServer());
    studentAgent = request.agent(app.getHttpServer());
    await loginAgent(instructorAgent, instructor.email, password, sessionIds);
    await loginAgent(foreignInstructorAgent, foreignInstructor.email, password, sessionIds);
    await loginAgent(studentAgent, student.email, password, sessionIds);
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.courseAdaptivePolicy.deleteMany({ where: { courseId: { in: courseIds } } });
      await prisma.classOffering.deleteMany({ where: { id: { in: offeringIds } } });
      await prisma.course.deleteMany({ where: { id: { in: courseIds } } });
      await prisma.userSession.deleteMany({ where: { sid: { in: [...sessionIds] } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    if (app) await app.close();
  });

  it('enforces authentication, Instructor role, and assignment hiding', async () => {
    await request(app.getHttpServer())
      .get(`/api/instructor/courses/${courseId}/adaptive-policy`)
      .expect(401);
    await studentAgent.get(`/api/instructor/courses/${courseId}/adaptive-policy`).expect(403);

    const foreignGet = await foreignInstructorAgent
      .get(`/api/instructor/courses/${courseId}/adaptive-policy`)
      .expect(404);
    expectSafeError(foreignGet);
    const foreignPut = await foreignInstructorAgent
      .put(`/api/instructor/courses/${courseId}/adaptive-policy`)
      .send({ remedialThreshold: 0.3, progressionThreshold: 0.9 })
      .expect(404);
    expectSafeError(foreignPut);
  });

  it('returns DEFAULT repeatedly without creating a policy row', async () => {
    await expect(prisma.courseAdaptivePolicy.count({ where: { courseId } })).resolves.toBe(0);

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await instructorAgent
        .get(`/api/instructor/courses/${courseId}/adaptive-policy`)
        .expect(200);
      expect(response.body).toEqual({
        courseId,
        remedialThreshold: 0.4,
        progressionThreshold: 0.8,
        source: 'DEFAULT',
      });
    }

    await expect(prisma.courseAdaptivePolicy.count({ where: { courseId } })).resolves.toBe(0);
  });

  it('creates a saved policy and returns it on the subsequent GET', async () => {
    const saved = await instructorAgent
      .put(`/api/instructor/courses/${courseId}/adaptive-policy`)
      .send({ remedialThreshold: 0.3, progressionThreshold: 0.85 })
      .expect(200);
    expect(saved.body).toEqual({
      courseId,
      remedialThreshold: 0.3,
      progressionThreshold: 0.85,
      source: 'SAVED',
    });
    expect(saved.body).not.toHaveProperty('id');
    expect(saved.body).not.toHaveProperty('createdAt');
    expect(saved.body).not.toHaveProperty('updatedAt');

    const read = await instructorAgent
      .get(`/api/instructor/courses/${courseId}/adaptive-policy`)
      .expect(200);
    expect(read.body).toEqual(saved.body);
    await expect(prisma.courseAdaptivePolicy.count({ where: { courseId } })).resolves.toBe(1);
  });

  it.each([
    [{ remedialThreshold: -0.01, progressionThreshold: 0.8 }, 'negative'],
    [{ remedialThreshold: 0.4, progressionThreshold: 1.01 }, 'above one'],
    [{ remedialThreshold: 0.4, progressionThreshold: 0.4 }, 'equal'],
    [{ remedialThreshold: 0.8, progressionThreshold: 0.4 }, 'inverted'],
    [{ progressionThreshold: 0.8 }, 'missing remedial'],
    [{ remedialThreshold: 0.4 }, 'missing progression'],
    [{ remedialThreshold: 'NaN', progressionThreshold: 0.8 }, 'NaN'],
    [{ remedialThreshold: 0.4, progressionThreshold: 'Infinity' }, 'Infinity'],
  ])('rejects an invalid full replacement: %s', async (body, _label) => {
    const response = await instructorAgent
      .put(`/api/instructor/courses/${courseId}/adaptive-policy`)
      .send(body)
      .expect(400);
    expectSafeError(response);
  });

  it('updates the single policy row and accepts progressionThreshold 1', async () => {
    const saved = await instructorAgent
      .put(`/api/instructor/courses/${courseId}/adaptive-policy`)
      .send({ remedialThreshold: 0, progressionThreshold: 1 })
      .expect(200);
    expect(saved.body).toEqual({
      courseId,
      remedialThreshold: 0,
      progressionThreshold: 1,
      source: 'SAVED',
    });
    await expect(prisma.courseAdaptivePolicy.count({ where: { courseId } })).resolves.toBe(1);
  });

  async function createUser(email: string, role: UserRole, passwordHash: string) {
    return prisma.user.create({
      data: {
        email,
        passwordHash,
        fullName: `VS05 C1 ${role}`,
        role,
        status: UserStatus.ACTIVE,
      },
    });
  }
});
