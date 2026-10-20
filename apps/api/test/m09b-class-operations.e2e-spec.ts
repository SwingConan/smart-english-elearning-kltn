import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as argon2 from 'argon2';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import {
  ClassModality,
  ClassOfferingStatus,
  EnrollmentStatus,
  PricingType,
  UserRole,
  UserStatus,
} from '../src/generated/prisma/client';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';
import { loginAgent } from './assessment-e2e-helpers';

describe('M09-B admin class operations (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: ReturnType<typeof request.agent>;
  let student: ReturnType<typeof request.agent>;
  let instructorOne: ReturnType<typeof request.agent>;
  let instructorTwo: ReturnType<typeof request.agent>;
  let courseId: string;
  let classOfferingId: string;
  let otherClassOfferingId: string;
  let instructorOneId: string;
  let instructorTwoId: string;
  let activeEnrollmentId: string;
  let pendingEnrollmentId: string;
  let crossClassEnrollmentId: string;
  const userIds: string[] = [];
  const sessionIds = new Set<string>();
  const unique = `${Date.now()}-${process.pid}`;
  const password = 'M09bOperations!2026';
  const emails = {
    admin: `m09b-admin-${unique}@example.com`,
    student: `m09b-student-${unique}@example.com`,
    pending: `m09b-pending-${unique}@example.com`,
    instructorOne: `m09b-instructor-one-${unique}@example.com`,
    instructorTwo: `m09b-instructor-two-${unique}@example.com`,
    inactive: `m09b-inactive-${unique}@example.com`,
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
      [emails.admin, 'M09B Admin', UserRole.ADMIN_COORDINATOR, UserStatus.ACTIVE],
      [emails.student, 'M09B Active Learner', UserRole.STUDENT, UserStatus.ACTIVE],
      [emails.pending, 'M09B Pending Learner', UserRole.STUDENT, UserStatus.ACTIVE],
      [emails.instructorOne, 'M09B Instructor One', UserRole.INSTRUCTOR, UserStatus.ACTIVE],
      [emails.instructorTwo, 'M09B Instructor Two', UserRole.INSTRUCTOR, UserStatus.ACTIVE],
      [emails.inactive, 'M09B Inactive Instructor', UserRole.INSTRUCTOR, UserStatus.INACTIVE],
    ] as const;
    const users = [];
    for (const [email, fullName, role, status] of definitions) {
      const user = await prisma.user.create({
        data: { email, fullName, role, status, passwordHash },
      });
      users.push(user);
      userIds.push(user.id);
    }
    instructorOneId = users[3].id;
    instructorTwoId = users[4].id;
    const course = await prisma.course.create({
      data: {
        title: `M09B Course ${unique}`,
        slug: `m09b-course-${unique}`,
        description: 'Disposable M09-B operations fixture',
        level: 'FOUNDATION',
        skillScope: 'LR',
        isPublished: false,
        createdById: users[0].id,
      },
    });
    courseId = course.id;
    const offering = await prisma.classOffering.create({
      data: {
        courseId,
        code: `M09B-${unique}`,
        name: 'M09-B Operations Class',
        status: ClassOfferingStatus.DRAFT,
        modality: ClassModality.HYBRID,
        pricingType: PricingType.FREE,
        tuitionFeeVnd: 0,
        maxStudents: 1,
        classStart: new Date('2026-11-01T00:00:00Z'),
        classEnd: new Date('2026-12-01T00:00:00Z'),
      },
    });
    classOfferingId = offering.id;
    const other = await prisma.classOffering.create({
      data: {
        courseId,
        code: `M09B-OTHER-${unique}`,
        name: 'M09-B Other Class',
        status: ClassOfferingStatus.DRAFT,
        pricingType: PricingType.FREE,
      },
    });
    otherClassOfferingId = other.id;
    const active = await prisma.enrollment.create({
      data: {
        learnerId: users[1].id,
        classOfferingId,
        status: EnrollmentStatus.ACTIVE,
      },
    });
    activeEnrollmentId = active.id;
    const pending = await prisma.enrollment.create({
      data: {
        learnerId: users[2].id,
        classOfferingId,
        status: EnrollmentStatus.PENDING_PAYMENT,
      },
    });
    pendingEnrollmentId = pending.id;
    const cross = await prisma.enrollment.create({
      data: {
        learnerId: users[1].id,
        classOfferingId: otherClassOfferingId,
        status: EnrollmentStatus.ACTIVE,
      },
    });
    crossClassEnrollmentId = cross.id;

    admin = request.agent(app.getHttpServer());
    student = request.agent(app.getHttpServer());
    instructorOne = request.agent(app.getHttpServer());
    instructorTwo = request.agent(app.getHttpServer());
    await loginAgent(admin, emails.admin, password, sessionIds);
    await loginAgent(student, emails.student, password, sessionIds);
    await loginAgent(instructorOne, emails.instructorOne, password, sessionIds);
    await loginAgent(instructorTwo, emails.instructorTwo, password, sessionIds);
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.userSession.deleteMany({ where: { sid: { in: [...sessionIds] } } });
      await prisma.enrollment.deleteMany({
        where: { classOfferingId: { in: [classOfferingId, otherClassOfferingId] } },
      });
      await prisma.classScheduleSlot.deleteMany({ where: { classOfferingId } });
      await prisma.classOffering.deleteMany({
        where: { id: { in: [classOfferingId, otherClassOfferingId] } },
      });
      await prisma.course.deleteMany({ where: { id: courseId } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    if (app) await app.close();
  });

  it('enforces ADMIN_COORDINATOR RBAC and returns only active instructor options', async () => {
    const optionsPath = '/api/admin/class-offerings/instructor-options?search=M09B&limit=50';
    await request(app.getHttpServer()).get(optionsPath).expect(401);
    await student.get(optionsPath).expect(403);
    await instructorOne.get(optionsPath).expect(403);
    const options = await admin.get(optionsPath).expect(200);
    expect(options.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: instructorOneId, email: emails.instructorOne }),
        expect.objectContaining({ id: instructorTwoId, email: emails.instructorTwo }),
      ]),
    );
    expect(JSON.stringify(options.body)).not.toContain(emails.inactive);

    const assignmentPath = `/api/admin/class-offerings/${classOfferingId}/instructor`;
    await request(app.getHttpServer())
      .put(assignmentPath)
      .send({ instructorId: instructorOneId })
      .expect(401);
    await student.put(assignmentPath).send({ instructorId: instructorOneId }).expect(403);
    await instructorOne.put(assignmentPath).send({ instructorId: instructorOneId }).expect(403);
  });

  it('guards readiness, supports Sunday schedule CRUD, and preserves instructor/public truth', async () => {
    const detailPath = `/api/admin/class-offerings/${classOfferingId}`;
    const initial = await admin.get(detailPath).expect(200);
    expect(initial.body.operationalReadiness).toEqual({
      isReady: false,
      missing: ['COURSE_UNPUBLISHED', 'INSTRUCTOR_MISSING', 'SCHEDULE_MISSING'],
    });
    await admin
      .patch(detailPath)
      .send({ status: ClassOfferingStatus.OPEN })
      .expect(400)
      .expect((response) => {
        expect(response.body).toMatchObject({ code: 'CLASS_NOT_READY' });
        expect(response.body.missing).toEqual(expect.arrayContaining(['INSTRUCTOR_MISSING']));
      });

    await admin.put(`${detailPath}/instructor`).send({ instructorId: instructorOneId }).expect(200);
    const slotsPath = `${detailPath}/schedule-slots`;
    const sunday = await admin
      .post(slotsPath)
      .send({
        dayOfWeek: 7,
        startTime: '08:15',
        endTime: '10:00',
        locationText: 'Phòng Chủ nhật',
      })
      .expect(201);
    expect(sunday.body).toMatchObject({ dayOfWeek: 7, startTime: '08:15', endTime: '10:00' });

    const adjacent = await admin
      .post(slotsPath)
      .send({
        dayOfWeek: 7,
        startTime: '10:00',
        endTime: '11:00',
        meetingUrl: 'https://meet.example.com/m09b',
      })
      .expect(201);
    await admin
      .post(slotsPath)
      .send({
        dayOfWeek: 7,
        startTime: '09:30',
        endTime: '10:30',
        locationText: 'Overlap',
      })
      .expect(400);
    await admin
      .patch(`${slotsPath}/${adjacent.body.id}`)
      .send({ startTime: '10:15', endTime: '11:15' })
      .expect(200)
      .expect((response) => expect(response.body.startTime).toBe('10:15'));
    await admin.delete(`${slotsPath}/${adjacent.body.id}`).expect(200);

    await admin.patch(`/api/admin/courses/${courseId}`).send({ isPublished: true }).expect(200);
    const opened = await admin
      .patch(detailPath)
      .send({ status: ClassOfferingStatus.OPEN })
      .expect(200);
    expect(opened.body.operationalReadiness).toEqual({ isReady: true, missing: [] });

    const firstClasses = await instructorOne.get('/api/instructor/classes').expect(200);
    expect(firstClasses.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: classOfferingId,
          activeLearnerCount: 1,
          scheduleSlots: [
            expect.objectContaining({ dayOfWeek: 7, startTime: '08:15', endTime: '10:00' }),
          ],
        }),
      ]),
    );
    const publicDetail = await request(app.getHttpServer())
      .get(`/api/class-offerings/${classOfferingId}`)
      .expect(200);
    expect(publicDetail.body.scheduleSlots).toEqual([
      expect.objectContaining({ id: sunday.body.id, dayOfWeek: 7 }),
    ]);

    await admin.put(`${detailPath}/instructor`).send({ instructorId: instructorTwoId }).expect(200);
    const oldOwner = await instructorOne.get('/api/instructor/classes').expect(200);
    expect(oldOwner.body.some((item: { id: string }) => item.id === classOfferingId)).toBe(false);
    const newOwner = await instructorTwo.get('/api/instructor/classes').expect(200);
    expect(newOwner.body.some((item: { id: string }) => item.id === classOfferingId)).toBe(true);
  });

  it('filters the real roster and permits only safe capacity-affecting transitions', async () => {
    const rosterPath = `/api/admin/class-offerings/${classOfferingId}/roster`;
    const active = await admin
      .get(`${rosterPath}?search=Active&status=ACTIVE&page=1&limit=20`)
      .expect(200);
    expect(active.body).toMatchObject({
      summary: { total: 2, active: 1, pendingPayment: 1, maxStudents: 1 },
      meta: { total: 1, page: 1 },
    });
    expect(active.body.data[0]).toMatchObject({
      id: activeEnrollmentId,
      learner: { email: emails.student },
    });

    await admin
      .patch(`${rosterPath}/${pendingEnrollmentId}/status`)
      .send({ status: EnrollmentStatus.ACTIVE })
      .expect(400);
    await admin
      .patch(`${rosterPath}/${crossClassEnrollmentId}/status`)
      .send({ status: EnrollmentStatus.CANCELLED })
      .expect(404);
    const dropped = await admin
      .patch(`${rosterPath}/${activeEnrollmentId}/status`)
      .send({ status: EnrollmentStatus.DROPPED })
      .expect(200);
    expect(dropped.body).toMatchObject({
      enrollment: { id: activeEnrollmentId, status: EnrollmentStatus.DROPPED },
      classOffering: { registeredCount: 0, remainingSeats: 1, isFull: false },
    });
    await admin
      .patch(`${rosterPath}/${pendingEnrollmentId}/status`)
      .send({ status: EnrollmentStatus.CANCELLED })
      .expect(200);
  });
});
