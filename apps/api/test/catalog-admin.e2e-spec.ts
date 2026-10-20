import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as argon2 from 'argon2';
import * as request from 'supertest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AppModule } from '../src/app.module';
import { UserRole, UserStatus } from '../src/generated/prisma/client';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';

describe('Course catalog and admin APIs (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminAgent: ReturnType<typeof request.agent>;
  let studentAgent: ReturnType<typeof request.agent>;
  let instructorAgent: ReturnType<typeof request.agent>;
  let thumbnailRoot: string;
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
    thumbnailRoot = await mkdtemp(join(tmpdir(), 'course-thumbnail-e2e-'));
    process.env.COURSE_THUMBNAIL_STORAGE_ROOT = thumbnailRoot;
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
      const fixtureUsers = await prisma.user.findMany({
        where: { email: { in: [adminEmail, studentEmail, instructorEmail] } },
        select: { id: true },
      });
      const fixtureUserIds = [...new Set([...userIds, ...fixtureUsers.map(({ id }) => id)])];
      const fixtureCourses = await prisma.course.findMany({
        where: {
          OR: [
            { id: { in: courseIds } },
            { createdById: { in: fixtureUserIds } },
            { title: { startsWith: `VS01 ` }, description: 'Phase 3 E2E course' },
            {
              title: { startsWith: `Concurrent Course ${unique}` },
              description: 'Concurrent slug verification',
            },
          ],
        },
        select: { id: true },
      });
      const fixtureCourseIds = fixtureCourses.map(({ id }) => id);
      await prisma.userSession.deleteMany({
        where: { sid: { in: [...sessionIds] } },
      });
      await prisma.enrollment.deleteMany({
        where: { classOffering: { courseId: { in: fixtureCourseIds } } },
      });
      await prisma.classScheduleSlot.deleteMany({
        where: { classOffering: { courseId: { in: fixtureCourseIds } } },
      });
      await prisma.classOffering.deleteMany({
        where: { courseId: { in: fixtureCourseIds } },
      });
      await prisma.course.deleteMany({ where: { id: { in: fixtureCourseIds } } });
      await prisma.user.deleteMany({ where: { id: { in: fixtureUserIds } } });
    }
    if (app) {
      await app.close();
    }
    delete process.env.COURSE_THUMBNAIL_STORAGE_ROOT;
    if (thumbnailRoot) await rm(thumbnailRoot, { recursive: true, force: true });
  });

  it('enforces admin roles and exposes only published catalog data', async () => {
    const isolatedCatalogUrl = `/api/courses?search=${encodeURIComponent(unique)}`;
    const guestCatalog = await request(app.getHttpServer()).get(isolatedCatalogUrl).expect(200);
    expect(guestCatalog.body.data).toEqual([]);

    await request(app.getHttpServer()).get('/api/admin/courses').expect(401);

    await login(studentAgent, studentEmail);
    await studentAgent.get('/api/admin/courses').expect(403);
    await studentAgent.get('/api/admin/class-offerings').expect(403);

    await login(instructorAgent, instructorEmail);
    await instructorAgent.get('/api/admin/class-offerings').expect(403);
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

    const adminCourses = await adminAgent
      .get('/api/admin/courses')
      .query({ search: unique, isPublished: false, skillScope: 'LR', level, page: 1, limit: 5 })
      .expect(200);
    expect(
      adminCourses.body.data.some((course: { id: string }) => course.id === createdCourse.body.id),
    ).toBe(true);
    expect(adminCourses.body.meta).toEqual(expect.objectContaining({ page: 1, limit: 5 }));
    await adminAgent.get('/api/admin/courses?limit=51').expect(400);
    await adminAgent.get('/api/admin/courses?isPublished=not-boolean').expect(400);
    const courseDetail = await adminAgent
      .get(`/api/admin/courses/${createdCourse.body.id}`)
      .expect(200);
    expect(courseDetail.body).toMatchObject({
      id: createdCourse.body.id,
      skillScope: 'LR',
      _count: { classOfferings: 0 },
    });

    await request(app.getHttpServer())
      .get(isolatedCatalogUrl)
      .expect(200, {
        data: [],
        meta: { total: 0, page: 1, limit: 12, totalPages: 0 },
      });
    await request(app.getHttpServer()).get(`/api/courses/${originalSlug}`).expect(404);

    const openCandidate = await adminAgent
      .post('/api/admin/class-offerings')
      .send({
        courseId: createdCourse.body.id,
        name: 'Open cohort',
        pricingType: 'FREE',
        tuitionFeeVnd: 0,
        maxStudents: 20,
      })
      .expect(201);
    expect(openCandidate.body).toEqual(
      expect.objectContaining({
        registeredCount: 0,
        remainingSeats: 20,
        isFull: false,
        registrationState: 'CLOSED',
      }),
    );
    expect(openCandidate.body).not.toHaveProperty('_count');
    await adminAgent
      .put(`/api/admin/class-offerings/${openCandidate.body.id}/instructor`)
      .send({ instructorId: userIds[2] })
      .expect(200);

    await adminAgent
      .post('/api/admin/class-offerings')
      .send({
        courseId: createdCourse.body.id,
        name: 'N'.repeat(301),
        pricingType: 'FREE',
      })
      .expect(400);

    const draftOffering = await adminAgent
      .post('/api/admin/class-offerings')
      .send({
        courseId: createdCourse.body.id,
        name: 'Draft cohort',
        pricingType: 'PAID',
        tuitionFeeVnd: 500_000,
      })
      .expect(201);
    expect(draftOffering.body).toEqual(
      expect.objectContaining({
        registeredCount: 0,
        remainingSeats: null,
        isFull: false,
        registrationState: 'CLOSED',
      }),
    );
    expect(draftOffering.body).not.toHaveProperty('_count');

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
      .query({
        search: 'Draft cohort',
        courseId: createdCourse.body.id,
        status: 'DRAFT',
        modality: 'ONLINE',
        pricingType: 'PAID',
        page: 1,
        limit: 5,
      })
      .expect(200);
    expect(
      adminOfferings.body.data.some(
        (offering: { id: string }) => offering.id === draftOffering.body.id,
      ),
    ).toBe(true);
    expect(adminOfferings.body.data[0]).toEqual(
      expect.objectContaining({
        registeredCount: 0,
        remainingSeats: null,
        isFull: false,
        registrationState: 'CLOSED',
      }),
    );
    const offeringDetail = await adminAgent
      .get(`/api/admin/class-offerings/${draftOffering.body.id}`)
      .expect(200);
    expect(offeringDetail.body).toEqual(
      expect.objectContaining({ id: draftOffering.body.id, registeredCount: 0 }),
    );
    await adminAgent.get('/api/admin/class-offerings?status=UNKNOWN').expect(400);
    await adminAgent.get('/api/admin/class-offerings?courseId=not-a-uuid').expect(400);

    const publishedCourse = await adminAgent
      .patch(`/api/admin/courses/${createdCourse.body.id}`)
      .send({ title: updatedTitle, isPublished: true })
      .expect(200);
    expect(publishedCourse.body.slug).toBe(originalSlug);

    const upcomingStart = new Date(Date.now() + 86_400_000).toISOString();
    const upcomingEnd = new Date(Date.now() + 172_800_000).toISOString();
    const classStart = new Date(Date.now() + 259_200_000).toISOString();
    const classEnd = new Date(Date.now() + 2_592_000_000).toISOString();
    await prisma.classScheduleSlot.create({
      data: {
        classOfferingId: openCandidate.body.id,
        dayOfWeek: 2,
        startTime: new Date('1970-01-01T18:00:00.000Z'),
        endTime: new Date('1970-01-01T20:00:00.000Z'),
        locationText: 'Online',
      },
    });
    const upcomingOffering = await adminAgent
      .patch(`/api/admin/class-offerings/${openCandidate.body.id}`)
      .send({
        status: 'OPEN',
        enrollmentStart: upcomingStart,
        enrollmentEnd: upcomingEnd,
        classStart,
        classEnd,
      })
      .expect(200);
    expect(upcomingOffering.body).toEqual(
      expect.objectContaining({
        registeredCount: 0,
        remainingSeats: 20,
        isFull: false,
        registrationState: 'UPCOMING',
      }),
    );
    expect(upcomingOffering.body).not.toHaveProperty('_count');

    const upcomingPublicDetail = await request(app.getHttpServer())
      .get(`/api/courses/${originalSlug}`)
      .expect(200);
    expect(upcomingPublicDetail.body.classOfferings[0].registrationState).toBe('UPCOMING');

    const closedStart = new Date(Date.now() - 172_800_000).toISOString();
    const closedEnd = new Date(Date.now() - 86_400_000).toISOString();
    const closedOffering = await adminAgent
      .patch(`/api/admin/class-offerings/${openCandidate.body.id}`)
      .send({ enrollmentStart: closedStart, enrollmentEnd: closedEnd })
      .expect(200);
    expect(closedOffering.body).toEqual(
      expect.objectContaining({
        registeredCount: 0,
        remainingSeats: 20,
        isFull: false,
        registrationState: 'CLOSED',
      }),
    );
    expect(closedOffering.body).not.toHaveProperty('_count');
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
    expect(publicCourse.classOfferings[0].registrationState).toBe('CLOSED');
    expect(publicCourse.classOfferings[0].instructor).toEqual({
      id: userIds[2],
      fullName: 'VS01 Instructor',
    });
    expect(publicCourse.classOfferings[0].instructor).not.toHaveProperty('email');
    expect(publicCourse.classOfferings[0].scheduleSlots).toEqual([
      expect.objectContaining({ dayOfWeek: 2, locationText: 'Online' }),
    ]);

    const filteredCatalog = await request(app.getHttpServer())
      .get('/api/courses')
      .query({ search: unique, skillScope: 'LR', availability: 'OPEN' })
      .expect(200);
    expect(
      filteredCatalog.body.data.some(
        (course: { id: string }) => course.id === createdCourse.body.id,
      ),
    ).toBe(true);

    const publicOffering = await request(app.getHttpServer())
      .get(`/api/class-offerings/${openCandidate.body.id}`)
      .expect(200);
    expect(publicOffering.body).toMatchObject({
      id: openCandidate.body.id,
      code: expect.any(String),
      registeredCount: 0,
      remainingSeats: 20,
      isFull: false,
      registrationState: 'CLOSED',
      course: { id: createdCourse.body.id, title: updatedTitle },
      scheduleSlots: [expect.objectContaining({ dayOfWeek: 2 })],
    });
    expect(publicOffering.body.instructor).not.toHaveProperty('email');
    await request(app.getHttpServer())
      .get(`/api/class-offerings/${draftOffering.body.id}`)
      .expect(404);

    const publicDetail = await request(app.getHttpServer())
      .get(`/api/courses/${originalSlug}`)
      .expect(200);
    expect(publicDetail.body.classOfferings).toHaveLength(1);
    expect(publicDetail.body.classOfferings[0].status).toBe('OPEN');
    expect(publicDetail.body.classOfferings[0].registrationState).toBe('CLOSED');
    expect(publicDetail.body.classOfferings[0].id).not.toBe(draftOffering.body.id);

    await request(app.getHttpServer()).get('/api/courses?page=0').expect(400);
    await request(app.getHttpServer()).get('/api/courses?limit=51').expect(400);
    await request(app.getHttpServer()).get('/api/courses?skillScope=INVALID').expect(400);
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

  it('secures, validates, replaces, serves, and removes course thumbnails', async () => {
    await login(adminAgent, adminEmail);
    await login(studentAgent, studentEmail);
    await login(instructorAgent, instructorEmail);
    const created = await adminAgent
      .post('/api/admin/courses')
      .send({
        title: `VS01 Thumbnail ${unique}`,
        description: 'Phase 3 E2E course',
        level,
        thumbnailUrl: 'https://images.example.com/legacy.jpg',
      })
      .expect(201);
    courseIds.push(created.body.id);
    const endpoint = `/api/admin/courses/${created.body.id}/thumbnail`;
    const png = Buffer.from('89504e470d0a1a0a', 'hex');

    await request(app.getHttpServer()).post(endpoint).attach('file', png, 'cover.png').expect(401);
    await studentAgent.post(endpoint).attach('file', png, 'cover.png').expect(403);
    await instructorAgent.post(endpoint).attach('file', png, 'cover.png').expect(403);
    await request(app.getHttpServer()).delete(endpoint).expect(401);
    await studentAgent.delete(endpoint).expect(403);
    await instructorAgent.delete(endpoint).expect(403);
    await adminAgent
      .post('/api/admin/courses/not-a-uuid/thumbnail')
      .attach('file', png, 'cover.png')
      .expect(400);
    await adminAgent
      .post('/api/admin/courses/11111111-1111-4111-8111-111111111111/thumbnail')
      .attach('file', png, 'cover.png')
      .expect(404);

    await adminAgent
      .post(endpoint)
      .attach('file', Buffer.from('<svg/>'), {
        filename: 'cover.svg',
        contentType: 'image/svg+xml',
      })
      .expect(400);
    await adminAgent
      .post(endpoint)
      .attach('file', Buffer.from('not a png'), {
        filename: 'cover.png',
        contentType: 'image/png',
      })
      .expect(400);
    await adminAgent
      .post(endpoint)
      .attach('file', png, { filename: 'cover.jpg', contentType: 'image/png' })
      .expect(400);
    await adminAgent.post(endpoint).attach('file', Buffer.alloc(0), 'empty.png').expect(400);
    const oversized = await adminAgent
      .post(endpoint)
      .attach('file', Buffer.alloc(5 * 1024 * 1024 + 1), 'large.png')
      .expect(413);
    expect(oversized.body.message).toBe('Ảnh đại diện không được vượt quá 5 MB.');

    const firstUpload = await adminAgent
      .post(endpoint)
      .attach('file', png, { filename: 'cover.png', contentType: 'image/png' })
      .expect(201);
    expect(firstUpload.body.thumbnailUrl).toMatch(/^\/api\/course-assets\/[\w-]+\.png$/);
    expect(firstUpload.body.thumbnailUrl).not.toContain(thumbnailRoot);
    const firstUrl = firstUpload.body.thumbnailUrl as string;
    await request(app.getHttpServer())
      .get(firstUrl)
      .expect(200)
      .expect('Content-Type', /image\/png/)
      .expect('Cache-Control', /public/)
      .expect(png);

    const webp = Buffer.from('RIFF1234WEBP');
    const replacement = await adminAgent
      .post(endpoint)
      .attach('file', webp, { filename: 'cover.webp', contentType: 'image/webp' })
      .expect(201);
    expect(replacement.body.thumbnailUrl).toMatch(/\.webp$/);
    await request(app.getHttpServer()).get(firstUrl).expect(404);
    await request(app.getHttpServer())
      .get(replacement.body.thumbnailUrl)
      .expect(200)
      .expect('Content-Type', /image\/webp/)
      .expect(webp);
    await request(app.getHttpServer()).get('/api/course-assets/not-a-key.png').expect(400);
    await request(app.getHttpServer())
      .get('/api/course-assets/11111111-1111-4111-8111-111111111111.png')
      .expect(404);

    const removed = await adminAgent.delete(endpoint).expect(200);
    expect(removed.body.thumbnailUrl).toBeNull();
    await request(app.getHttpServer()).get(replacement.body.thumbnailUrl).expect(404);
  });

  async function login(agent: ReturnType<typeof request.agent>, email: string): Promise<void> {
    const response = await agent.post('/api/auth/login').send({ email, password }).expect(200);
    sessionIds.add(extractSessionId(getCookie(response.headers['set-cookie'])));
  }
});

function getCookie(setCookieHeader: string[] | string | undefined): string {
  const cookie = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader;
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
  const unsignedValue = signedValue.startsWith('s:') ? signedValue.slice(2) : signedValue;
  const separator = unsignedValue.lastIndexOf('.');
  if (separator < 1) {
    throw new Error('Expected a signed session cookie');
  }
  return unsignedValue.slice(0, separator);
}
