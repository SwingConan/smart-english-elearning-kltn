import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
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
import { UsersService } from '../src/modules/users/users.service';
import { loginAgent } from './assessment-e2e-helpers';

describe('M09-C admin account operations (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: ReturnType<typeof request.agent>;
  let student: ReturnType<typeof request.agent>;
  let instructor: ReturnType<typeof request.agent>;
  let adminId: string;
  let studentId: string;
  let dependencyInstructorId: string;
  let classId: string;
  let courseId: string;
  const userIds: string[] = [];
  const sessionIds = new Set<string>();
  const unique = `${Date.now()}-${process.pid}`;
  const password = 'M09cAccounts!2026';
  const emails = {
    admin: `m09c-admin-${unique}@example.com`,
    student: `m09c-student-${unique}@example.com`,
    instructor: `m09c-instructor-${unique}@example.com`,
    dependency: `m09c-dependency-${unique}@example.com`,
    created: `m09c-created-${unique}@example.com`,
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
      [emails.admin, 'M09C Admin', UserRole.ADMIN_COORDINATOR],
      [emails.student, 'M09C Student', UserRole.STUDENT],
      [emails.instructor, 'M09C Instructor', UserRole.INSTRUCTOR],
      [emails.dependency, 'M09C Dependency Instructor', UserRole.INSTRUCTOR],
    ] as const;
    const users = [];
    for (const [email, fullName, role] of definitions) {
      const user = await prisma.user.create({
        data: { email, fullName, role, status: UserStatus.ACTIVE, passwordHash },
      });
      users.push(user);
      userIds.push(user.id);
    }
    adminId = users[0].id;
    studentId = users[1].id;
    dependencyInstructorId = users[3].id;
    const course = await prisma.course.create({
      data: {
        title: `M09C ${unique}`,
        slug: `m09c-${unique}`,
        description: 'M09-C dependency fixture',
        level: 'FOUNDATION',
        createdById: adminId,
      },
    });
    courseId = course.id;
    const classOffering = await prisma.classOffering.create({
      data: {
        courseId,
        instructorId: dependencyInstructorId,
        code: `M09C-${unique}`,
        name: 'M09-C Operational Class',
        status: ClassOfferingStatus.DRAFT,
        pricingType: PricingType.FREE,
      },
    });
    classId = classOffering.id;
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
      await prisma.classOffering.deleteMany({ where: { id: classId } });
      await prisma.course.deleteMany({ where: { id: courseId } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    if (app) await app.close();
  });

  it('enforces backend ADMIN_COORDINATOR boundaries for every operation family', async () => {
    await request(app.getHttpServer()).get('/api/admin/accounts').expect(401);
    await student.get('/api/admin/accounts').expect(403);
    await instructor.get('/api/admin/accounts').expect(403);
    await request(app.getHttpServer()).get(`/api/admin/accounts/${studentId}`).expect(401);
    await student
      .post('/api/admin/accounts')
      .send({
        fullName: 'No',
        email: `no-${unique}@example.com`,
        password,
        role: UserRole.INSTRUCTOR,
      })
      .expect(403);
    await instructor
      .patch(`/api/admin/accounts/${studentId}/status`)
      .send({ status: UserStatus.LOCKED })
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/api/admin/accounts/${studentId}/role`)
      .send({ role: UserRole.INSTRUCTOR })
      .expect(401);
  });

  it('lists/searches/filters sanitized accounts with directory-wide summary and detail counts', async () => {
    const list = await admin
      .get(`/api/admin/accounts?search=M09C&role=INSTRUCTOR&status=ACTIVE&page=1&limit=20`)
      .expect(200);
    expect(list.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          email: emails.dependency,
          context: { operationalClassAssignments: 1, totalClassAssignments: 1, enrollmentCount: 0 },
        }),
      ]),
    );
    expect(list.body.summary.total).toBeGreaterThanOrEqual(4);
    expect(JSON.stringify(list.body)).not.toMatch(/passwordHash|"sess"/);
    const detail = await admin.get(`/api/admin/accounts/${dependencyInstructorId}`).expect(200);
    expect(detail.body.context).toEqual({
      operationalClassAssignments: 1,
      totalClassAssignments: 1,
      enrollmentCount: 0,
    });
    expect(detail.body).not.toHaveProperty('passwordHash');
  });

  it('creates an ACTIVE instructor, rejects unsafe input/duplicates, and supports fresh login', async () => {
    const created = await admin
      .post('/api/admin/accounts')
      .send({
        fullName: ' Created Instructor ',
        email: ` ${emails.created.toUpperCase()} `,
        password,
        role: UserRole.INSTRUCTOR,
      })
      .expect(201);
    expect(created.body).toMatchObject({
      email: emails.created,
      fullName: 'Created Instructor',
      role: UserRole.INSTRUCTOR,
      status: UserStatus.ACTIVE,
    });
    expect(JSON.stringify(created.body)).not.toMatch(/password|hash/i);
    userIds.push(created.body.id);
    const target = request.agent(app.getHttpServer());
    await loginAgent(target, emails.created, password, sessionIds);
    await target.get('/api/auth/me').expect(200);
    await admin
      .post('/api/admin/accounts')
      .send({ fullName: 'Duplicate', email: emails.created, password, role: UserRole.INSTRUCTOR })
      .expect(409)
      .expect((response) => expect(response.body.code).toBe('ACCOUNT_EMAIL_EXISTS'));
    await admin
      .post('/api/admin/accounts')
      .send({
        fullName: 'Student',
        email: `student-create-${unique}@example.com`,
        password,
        role: UserRole.STUDENT,
      })
      .expect(400);
    await admin
      .post('/api/admin/accounts')
      .send({
        fullName: 'Extra',
        email: `extra-${unique}@example.com`,
        password,
        role: UserRole.INSTRUCTOR,
        status: UserStatus.LOCKED,
      })
      .expect(400);
  });

  it('locks, revokes the old session, reactivates without restoring it, and requires fresh login', async () => {
    const created = await prisma.user.findUniqueOrThrow({ where: { email: emails.created } });
    const oldSession = request.agent(app.getHttpServer());
    await loginAgent(oldSession, emails.created, password, sessionIds);
    await admin
      .patch(`/api/admin/accounts/${created.id}/status`)
      .send({ status: UserStatus.LOCKED })
      .expect(200);
    await oldSession.get('/api/auth/me').expect(401);
    await admin
      .patch(`/api/admin/accounts/${created.id}/status`)
      .send({ status: UserStatus.ACTIVE })
      .expect(200);
    await oldSession.get('/api/auth/me').expect(401);
    const fresh = request.agent(app.getHttpServer());
    await loginAgent(fresh, emails.created, password, sessionIds);
    await fresh
      .get('/api/auth/me')
      .expect(200)
      .expect((response) => expect(response.body.status).toBe(UserStatus.ACTIVE));
  });

  it('revokes stale role sessions and fresh login returns the new role', async () => {
    const target = await prisma.user.findUniqueOrThrow({ where: { email: emails.created } });
    const oldSession = request.agent(app.getHttpServer());
    await loginAgent(oldSession, emails.created, password, sessionIds);
    await admin
      .patch(`/api/admin/accounts/${target.id}/role`)
      .send({ role: UserRole.ADMIN_COORDINATOR })
      .expect(200);
    await oldSession.get('/api/auth/me').expect(401);
    const fresh = request.agent(app.getHttpServer());
    await loginAgent(fresh, emails.created, password, sessionIds);
    await fresh
      .get('/api/auth/me')
      .expect(200)
      .expect((response) => expect(response.body.role).toBe(UserRole.ADMIN_COORDINATOR));
  });

  it('enforces self/student/dependency protections while allowing emergency lock without rewriting assignment', async () => {
    await admin
      .patch(`/api/admin/accounts/${adminId}/role`)
      .send({ role: UserRole.INSTRUCTOR })
      .expect(409)
      .expect((response) => expect(response.body.code).toBe('ACCOUNT_SELF_ROLE_CHANGE_FORBIDDEN'));
    await admin
      .patch(`/api/admin/accounts/${adminId}/status`)
      .send({ status: UserStatus.LOCKED })
      .expect(409)
      .expect((response) =>
        expect(response.body.code).toBe('ACCOUNT_SELF_STATUS_CHANGE_FORBIDDEN'),
      );
    await admin
      .patch(`/api/admin/accounts/${studentId}/role`)
      .send({ role: UserRole.INSTRUCTOR })
      .expect(409)
      .expect((response) => expect(response.body.code).toBe('STUDENT_ROLE_IMMUTABLE'));
    await admin
      .patch(`/api/admin/accounts/${dependencyInstructorId}/role`)
      .send({ role: UserRole.ADMIN_COORDINATOR })
      .expect(409);
    await admin
      .patch(`/api/admin/accounts/${dependencyInstructorId}/status`)
      .send({ status: UserStatus.INACTIVE })
      .expect(409);
    await admin
      .patch(`/api/admin/accounts/${dependencyInstructorId}/status`)
      .send({ status: UserStatus.LOCKED })
      .expect(200);
    const unchanged = await prisma.classOffering.findUniqueOrThrow({ where: { id: classId } });
    expect(unchanged.instructorId).toBe(dependencyInstructorId);
    const readiness = await admin.get(`/api/admin/class-offerings/${classId}`).expect(200);
    expect(readiness.body.operationalReadiness.missing).toContain('INSTRUCTOR_INACTIVE');
    const options = await admin
      .get(`/api/admin/class-offerings/instructor-options?search=Dependency`)
      .expect(200);
    expect(options.body.data).toEqual([]);
  });

  it('protects the last active administrator from a role change', async () => {
    await withOnlyActiveAdmin('role', async (targetId) => {
      await admin
        .patch(`/api/admin/accounts/${targetId}/role`)
        .send({ role: UserRole.INSTRUCTOR })
        .expect(409)
        .expect((response) => expect(response.body.code).toBe('LAST_ACTIVE_ADMIN_PROTECTED'));

      await expectLastActiveAdminUnchanged(targetId);
    });
  });

  it('protects the last active administrator from a status change', async () => {
    await withOnlyActiveAdmin('status', async (targetId) => {
      await admin
        .patch(`/api/admin/accounts/${targetId}/status`)
        .send({ status: UserStatus.LOCKED })
        .expect(409)
        .expect((response) => expect(response.body.code).toBe('LAST_ACTIVE_ADMIN_PROTECTED'));

      await expectLastActiveAdminUnchanged(targetId);
    });
  });

  it('validates malformed requests and returns 404 for unknown ids', async () => {
    const missing = '00000000-0000-4000-8000-000000000099';
    await admin.get(`/api/admin/accounts/${missing}`).expect(404);
    await admin
      .patch(`/api/admin/accounts/${missing}/status`)
      .send({ status: UserStatus.ACTIVE })
      .expect(404);
    await admin
      .patch(`/api/admin/accounts/${studentId}/status`)
      .send({ status: 'DISABLED' })
      .expect(400);
    await admin
      .patch(`/api/admin/accounts/${studentId}/role`)
      .send({ role: UserRole.STUDENT })
      .expect(400);
    await admin.get('/api/admin/accounts?page=0&limit=101').expect(400);
  });

  async function withOnlyActiveAdmin(
    suffix: string,
    assertion: (targetId: string) => Promise<void>,
  ) {
    const target = await prisma.user.create({
      data: {
        email: `m09c-last-admin-${suffix}-${unique}@example.com`,
        fullName: `M09C Last Admin ${suffix}`,
        passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
        role: UserRole.ADMIN_COORDINATOR,
        status: UserStatus.ACTIVE,
      },
    });
    const administrators = await prisma.user.findMany({
      where: { role: UserRole.ADMIN_COORDINATOR, id: { not: target.id } },
      select: { id: true, status: true },
    });
    await prisma.user.updateMany({
      where: { role: UserRole.ADMIN_COORDINATOR, id: { not: target.id } },
      data: { status: UserStatus.INACTIVE },
    });

    const usersService = app.get(UsersService);
    const findById = usersService.findById.bind(usersService);
    const authIdentity = await findById(adminId);
    if (!authIdentity) throw new Error('M09-C admin actor fixture is missing');
    const authSpy = jest.spyOn(usersService, 'findById').mockImplementation(async (id) =>
      id === adminId
        ? {
            ...authIdentity,
            role: UserRole.ADMIN_COORDINATOR,
            status: UserStatus.ACTIVE,
          }
        : findById(id),
    );

    try {
      await expect(
        prisma.user.count({
          where: { role: UserRole.ADMIN_COORDINATOR, status: UserStatus.ACTIVE },
        }),
      ).resolves.toBe(1);
      await assertion(target.id);
    } finally {
      authSpy.mockRestore();
      await Promise.all(
        administrators.map(({ id, status }) =>
          prisma.user.update({ where: { id }, data: { status } }),
        ),
      );
      await prisma.userSession.deleteMany({
        where: { sess: { path: ['userId'], equals: target.id } },
      });
      await prisma.user.delete({ where: { id: target.id } });
    }
  }

  async function expectLastActiveAdminUnchanged(targetId: string) {
    await expect(prisma.user.findUniqueOrThrow({ where: { id: targetId } })).resolves.toMatchObject(
      {
        role: UserRole.ADMIN_COORDINATOR,
        status: UserStatus.ACTIVE,
      },
    );
  }
});
