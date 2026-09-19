import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as argon2 from 'argon2';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { UserRole, UserStatus } from '../src/generated/prisma/client';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';

describe('Course catalog and admin APIs (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminAgent: ReturnType<typeof request.agent>;
  let studentAgent: ReturnType<typeof request.agent>;
  let instructorAgent: ReturnType<typeof request.agent>;
  const userIds: string[] = [];
  const courseIds: string[] = [];
  const sessionIds = new Set<string>();
  const unique = `${Date.now()}-${process.pid}`;
  const password = 'CatalogE2e!2026';
  const adminEmail = `vs01-admin-${unique}@example.com`;
  const studentEmail = `vs01-student-${unique}@example.com`;
  const instructorEmail = `vs01-instructor-${unique}@example.com`;
  const originalTitle = `VS01 English ${unique}`;
  const updatedTitle = `VS01 Published ${unique}`;
  const level = `Level-${unique}`;

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
    for (const user of [
      {
        email: adminEmail,
        fullName: 'VS01 Admin',
        role: UserRole.ADMIN_COORDINATOR,
      },
      {
        email: studentEmail,
        fullName: 'VS01 Student',
        role: UserRole.STUDENT,
      },
      {
        email: instructorEmail,
        fullName: 'VS01 Instructor',
        role: UserRole.INSTRUCTOR,
      },
    ]) {
      const created = await prisma.user.create({
        data: {
          ...user,
          passwordHash,
          status: UserStatus.ACTIVE,
        },
      });
      userIds.push(created.id);
    }

    adminAgent = request.agent(app.getHttpServer());
    studentAgent = request.agent(app.getHttpServer());
    instructorAgent = request.agent(app.getHttpServer());
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.userSession.deleteMany({
        where: { sid: { in: [...sessionIds] } },
      });
      await prisma.enrollment.deleteMany({
        where: { classOffering: { courseId: { in: courseIds } } },
      });
      await prisma.classOffering.deleteMany({
        where: { courseId: { in: courseIds } },
      });
      await prisma.course.deleteMany({ where: { id: { in: courseIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    if (app) {
      await app.close();
    }
  });

  it('enforces admin roles and exposes only published catalog data', async () => {
    const isolatedCatalogUrl = `/api/courses?search=${encodeURIComponent(unique)}`;
    const guestCatalog = await request(app.getHttpServer())
      .get(isolatedCatalogUrl)
      .expect(200);
    expect(guestCatalog.body.data).toEqual([]);

    await request(app.getHttpServer()).get('/api/admin/courses').expect(401);

    await login(studentAgent, studentEmail);
    await studentAgent.get('/api/admin/courses').expect(403);

    await login(instructorAgent, instructorEmail);
    await instructorAgent
      .post('/api/admin/courses')
      .send({
        title: 'Forbidden course',
        description: 'Should not be created',
        level,
      })
      .expect(403);

    await login(adminAgent, adminEmail);
    await adminAgent
      .post('/api/admin/courses')
      .send({
        title: 'T'.repeat(301),
        description: 'Valid description',
        level,
      })
      .expect(400);
    await adminAgent
      .post('/api/admin/courses')
      .send({
        title: 'Valid title',
        description: 'D'.repeat(5001),
        level,
      })
      .expect(400);
    await adminAgent
      .post('/api/admin/courses')
      .send({
        title: 'Rejected ownership override',
        description: 'Client must not choose the creator',
        level,
        createdById: userIds[1],
      })
      .expect(400);

    const createdCourse = await adminAgent
      .post('/api/admin/courses')
      .send({
        title: originalTitle,
        description: 'Phase 3 E2E course',
        level,
      })
      .expect(201);
    courseIds.push(createdCourse.body.id);
    const originalSlug = createdCourse.body.slug as string;
    expect(createdCourse.body.isPublished).toBe(false);
    expect(createdCourse.body.createdById).toBe(userIds[0]);
    expect(createdCourse.body).not.toHaveProperty('passwordHash');

    const adminCourses = await adminAgent.get('/api/admin/courses').expect(200);
    expect(
      adminCourses.body.some(
        (course: { id: string }) => course.id === createdCourse.body.id,
      ),
    ).toBe(true);

    await request(app.getHttpServer()).get(isolatedCatalogUrl).expect(200, {
      data: [],
      meta: { total: 0, page: 1, limit: 12, totalPages: 0 },
    });
    await request(app.getHttpServer())
      .get(`/api/courses/${originalSlug}`)
      .expect(404);

    const openCandidate = await adminAgent
      .post('/api/admin/class-offerings')
      .send({
        courseId: createdCourse.body.id,
        instructorId: userIds[2],
        name: 'Open cohort',
        status: 'DRAFT',
        pricingType: 'FREE',
        tuitionFeeVnd: 0,
        maxStudents: 20,
      })
      .expect(201);

    await adminAgent
      .post('/api/admin/class-offerings')
      .send({
        courseId: createdCourse.body.id,
        name: 'N'.repeat(301),
        status: 'DRAFT',
        pricingType: 'FREE',
      })
      .expect(400);

    const draftOffering = await adminAgent
      .post('/api/admin/class-offerings')
      .send({
        courseId: createdCourse.body.id,
        name: 'Draft cohort',
        status: 'DRAFT',
        pricingType: 'PAID',
        tuitionFeeVnd: 500_000,
      })
      .expect(201);

    await adminAgent
      .post('/api/admin/class-offerings')
      .send({
        courseId: createdCourse.body.id,
        name: 'Invalid status',
        status: 'NOT_A_STATUS',
      })
      .expect(400);

    const adminOfferings = await adminAgent
      .get('/api/admin/class-offerings')
      .expect(200);
    expect(
      adminOfferings.body.some(
        (offering: { id: string }) => offering.id === draftOffering.body.id,
      ),
    ).toBe(true);

    const publishedCourse = await adminAgent
      .patch(`/api/admin/courses/${createdCourse.body.id}`)
      .send({ title: updatedTitle, isPublished: true })
      .expect(200);
    expect(publishedCourse.body.slug).toBe(originalSlug);

    await adminAgent
      .patch(`/api/admin/class-offerings/${openCandidate.body.id}`)
      .send({ status: 'OPEN' })
      .expect(200);

    await instructorAgent
      .patch(`/api/admin/courses/${createdCourse.body.id}`)
      .send({ title: 'Forbidden edit' })
      .expect(403);

    await adminAgent.post('/api/auth/logout').expect(204);
    await request(app.getHttpServer()).get('/api/admin/courses').expect(401);

    const publicList = await request(app.getHttpServer())
      .get(`/api/courses?search=${encodeURIComponent('published')}`)
      .query({ level, page: 1, limit: 12 })
      .expect(200);
    const publicCourse = publicList.body.data.find(
      (course: { id: string }) => course.id === createdCourse.body.id,
    );
    expect(publicCourse).toBeDefined();
    expect(publicCourse.classOfferings).toHaveLength(1);
    expect(publicCourse.classOfferings[0].id).toBe(openCandidate.body.id);
    expect(publicCourse.classOfferings[0].instructor).toEqual({
      id: userIds[2],
      fullName: 'VS01 Instructor',
    });
    expect(publicCourse.classOfferings[0].instructor).not.toHaveProperty('email');

    const publicDetail = await request(app.getHttpServer())
      .get(`/api/courses/${originalSlug}`)
      .expect(200);
    expect(publicDetail.body.classOfferings).toHaveLength(1);
    expect(publicDetail.body.classOfferings[0].status).toBe('OPEN');
    expect(publicDetail.body.classOfferings[0].id).not.toBe(
      draftOffering.body.id,
    );

    await request(app.getHttpServer()).get('/api/courses?page=0').expect(400);
    await request(app.getHttpServer()).get('/api/courses?limit=51').expect(400);
  });

  it('creates distinct slugs for concurrent requests with the same title', async () => {
    const firstAgent = request.agent(app.getHttpServer());
    const secondAgent = request.agent(app.getHttpServer());
    await login(firstAgent, adminEmail);
    await login(secondAgent, adminEmail);
    const title = `Concurrent Course ${unique}`;
    const payload = {
      title,
      description: 'Concurrent slug verification',
      level,
    };

    const [first, second] = await Promise.all([
      firstAgent.post('/api/admin/courses').send(payload),
      secondAgent.post('/api/admin/courses').send(payload),
    ]);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(first.body.slug).not.toBe(second.body.slug);
    expect([first.body.slug, second.body.slug].sort()).toEqual(
      [`concurrent-course-${unique}`, `concurrent-course-${unique}-2`].sort(),
    );
    courseIds.push(first.body.id, second.body.id);
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
