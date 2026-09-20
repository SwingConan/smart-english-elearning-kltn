import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as argon2 from 'argon2';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import {
  ClassOfferingStatus,
  EnrollmentStatus,
  PricingType,
  UserRole,
  UserStatus,
} from '../src/generated/prisma/client';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';

describe('Enrollment APIs (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let firstStudentAgent: ReturnType<typeof request.agent>;
  let secondStudentAgent: ReturnType<typeof request.agent>;
  let adminAgent: ReturnType<typeof request.agent>;
  const userIds: string[] = [];
  const courseIds: string[] = [];
  const sessionIds = new Set<string>();
  const unique = `${Date.now()}-${process.pid}`;
  const password = 'EnrollmentE2e!2026';
  const firstStudentEmail = `vs01-enroll-1-${unique}@example.com`;
  const secondStudentEmail = `vs01-enroll-2-${unique}@example.com`;
  const pendingStudentEmail = `vs01-enroll-3-${unique}@example.com`;
  const adminEmail = `vs01-enroll-admin-${unique}@example.com`;
  const offeringIds: Record<string, string> = {};

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    prisma = app.get(PrismaService);

    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const testUsers: Array<{
      email: string;
      fullName: string;
      role: UserRole;
    }> = [
      {
        email: firstStudentEmail,
        fullName: 'First Student',
        role: UserRole.STUDENT,
      },
      {
        email: secondStudentEmail,
        fullName: 'Second Student',
        role: UserRole.STUDENT,
      },
      {
        email: pendingStudentEmail,
        fullName: 'Pending Student',
        role: UserRole.STUDENT,
      },
      {
        email: adminEmail,
        fullName: 'Enrollment Admin',
        role: UserRole.ADMIN_COORDINATOR,
      },
    ];
    const users = await Promise.all(
      testUsers.map((user) =>
        prisma.user.create({
          data: {
            ...user,
            status: UserStatus.ACTIVE,
            passwordHash,
          },
        }),
      ),
    );
    userIds.push(...users.map((user) => user.id));

    const publishedCourse = await prisma.course.create({
      data: {
        title: `Enrollment Course ${unique}`,
        slug: `enrollment-course-${unique}`,
        description: 'Enrollment E2E course',
        level: 'E2E',
        isPublished: true,
        createdById: users[3].id,
      },
    });
    const unpublishedCourse = await prisma.course.create({
      data: {
        title: `Hidden Enrollment Course ${unique}`,
        slug: `hidden-enrollment-course-${unique}`,
        description: 'Unpublished enrollment E2E course',
        level: 'E2E',
        isPublished: false,
        createdById: users[3].id,
      },
    });
    courseIds.push(publishedCourse.id, unpublishedCourse.id);

    const future = new Date(Date.now() + 60 * 60 * 1000);
    const offerings = await Promise.all([
      prisma.classOffering.create({
        data: {
          courseId: publishedCourse.id,
          name: 'Unlimited free offering',
          status: ClassOfferingStatus.OPEN,
          pricingType: PricingType.FREE,
        },
      }),
      prisma.classOffering.create({
        data: {
          courseId: publishedCourse.id,
          name: 'Paid offering',
          status: ClassOfferingStatus.OPEN,
          pricingType: PricingType.PAID,
          tuitionFeeVnd: 500_000,
          maxStudents: 1,
        },
      }),
      prisma.classOffering.create({
        data: {
          courseId: publishedCourse.id,
          name: 'Future offering',
          status: ClassOfferingStatus.OPEN,
          pricingType: PricingType.FREE,
          enrollmentStart: future,
        },
      }),
      prisma.classOffering.create({
        data: {
          courseId: publishedCourse.id,
          name: 'Capacity race offering',
          status: ClassOfferingStatus.OPEN,
          pricingType: PricingType.FREE,
          maxStudents: 1,
        },
      }),
      prisma.classOffering.create({
        data: {
          courseId: publishedCourse.id,
          name: 'Draft offering',
          status: ClassOfferingStatus.DRAFT,
          pricingType: PricingType.FREE,
        },
      }),
      prisma.classOffering.create({
        data: {
          courseId: unpublishedCourse.id,
          name: 'Hidden course offering',
          status: ClassOfferingStatus.OPEN,
          pricingType: PricingType.FREE,
        },
      }),
    ]);
    [
      offeringIds.free,
      offeringIds.paid,
      offeringIds.future,
      offeringIds.race,
      offeringIds.draft,
      offeringIds.unpublished,
    ] = offerings.map((offering) => offering.id);

    await prisma.enrollment.create({
      data: {
        learnerId: users[2].id,
        classOfferingId: offeringIds.race,
        status: EnrollmentStatus.PENDING_PAYMENT,
      },
    });

    firstStudentAgent = request.agent(app.getHttpServer());
    secondStudentAgent = request.agent(app.getHttpServer());
    adminAgent = request.agent(app.getHttpServer());
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.userSession.deleteMany({
        where: { sid: { in: [...sessionIds] } },
      });
      await prisma.enrollment.deleteMany({
        where: { classOfferingId: { in: Object.values(offeringIds) } },
      });
      await prisma.classOffering.deleteMany({
        where: { id: { in: Object.values(offeringIds) } },
      });
      await prisma.course.deleteMany({ where: { id: { in: courseIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    if (app) {
      await app.close();
    }
  });

  it('enforces learner rules, ownership, and concurrent capacity', async () => {
    await request(app.getHttpServer())
      .post('/api/enrollments')
      .send({ classOfferingId: offeringIds.free })
      .expect(401);

    await login(adminAgent, adminEmail);
    await adminAgent
      .post('/api/enrollments')
      .send({ classOfferingId: offeringIds.free })
      .expect(403);

    await login(firstStudentAgent, firstStudentEmail);
    await login(secondStudentAgent, secondStudentEmail);

    await firstStudentAgent
      .post('/api/enrollments')
      .send({ classOfferingId: 'not-a-uuid' })
      .expect(400);

    const freeEnrollment = await firstStudentAgent
      .post('/api/enrollments')
      .send({ classOfferingId: offeringIds.free })
      .expect(201);
    expect(freeEnrollment.body.status).toBe(EnrollmentStatus.ACTIVE);
    expect(freeEnrollment.body).not.toHaveProperty('learner');
    expect(freeEnrollment.body).not.toHaveProperty('learnerId');
    expect(freeEnrollment.body.classOffering.course).toMatchObject({
      title: expect.any(String),
      slug: expect.any(String),
      level: 'E2E',
    });

    await firstStudentAgent
      .post('/api/enrollments')
      .send({ classOfferingId: offeringIds.free })
      .expect(409);

    const mine = await firstStudentAgent.get('/api/enrollments/my').expect(200);
    expect(
      mine.body.some(
        (enrollment: { id: string }) =>
          enrollment.id === freeEnrollment.body.id,
      ),
    ).toBe(true);

    const detail = await firstStudentAgent
      .get(`/api/enrollments/${freeEnrollment.body.id}`)
      .expect(200);
    expect(detail.body.id).toBe(freeEnrollment.body.id);
    expect(detail.body).not.toHaveProperty('learner');

    await secondStudentAgent
      .get(`/api/enrollments/${freeEnrollment.body.id}`)
      .expect(404);

    const paidEnrollment = await firstStudentAgent
      .post('/api/enrollments')
      .send({ classOfferingId: offeringIds.paid })
      .expect(201);
    expect(paidEnrollment.body.status).toBe(EnrollmentStatus.PENDING_PAYMENT);

    await firstStudentAgent
      .post('/api/enrollments')
      .send({ classOfferingId: offeringIds.future })
      .expect(400);
    await firstStudentAgent
      .post('/api/enrollments')
      .send({ classOfferingId: offeringIds.draft })
      .expect(400);
    await firstStudentAgent
      .post('/api/enrollments')
      .send({ classOfferingId: offeringIds.unpublished })
      .expect(400);

    const concurrentResponses = await Promise.all([
      firstStudentAgent
        .post('/api/enrollments')
        .send({ classOfferingId: offeringIds.race }),
      secondStudentAgent
        .post('/api/enrollments')
        .send({ classOfferingId: offeringIds.race }),
    ]);
    expect(concurrentResponses.map((response) => response.status).sort()).toEqual([
      201, 409,
    ]);

    await expect(
      prisma.enrollment.count({
        where: {
          classOfferingId: offeringIds.race,
          status: EnrollmentStatus.ACTIVE,
        },
      }),
    ).resolves.toBe(1);
    await expect(
      prisma.enrollment.count({
        where: { classOfferingId: offeringIds.race },
      }),
    ).resolves.toBe(2);
  });

  async function login(
    agent: ReturnType<typeof request.agent>,
    email: string,
  ): Promise<void> {
    const response = await agent
      .post('/api/auth/login')
      .send({ email, password })
      .expect(200);
    sessionIds.add(extractSessionId(getCookie(response.headers['set-cookie'])));
  }
});

function getCookie(setCookieHeader: string[] | string | undefined): string {
  const cookie = Array.isArray(setCookieHeader)
    ? setCookieHeader[0]
    : setCookieHeader;
  if (!cookie) {
    throw new Error('Expected a session cookie');
  }
  return cookie;
}

function extractSessionId(cookie: string): string {
  const encodedValue = cookie.split(';', 1)[0]?.split('=', 2)[1];
  if (!encodedValue) {
    throw new Error('Expected a session cookie value');
  }
  const signedValue = decodeURIComponent(encodedValue);
  const unsignedValue = signedValue.startsWith('s:')
    ? signedValue.slice(2)
    : signedValue;
  const separator = unsignedValue.lastIndexOf('.');
  if (separator < 1) {
    throw new Error('Expected a signed session cookie');
  }
  return unsignedValue.slice(0, separator);
}
