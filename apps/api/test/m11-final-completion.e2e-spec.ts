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

describe('M11 final use-case completion (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const unique = `${Date.now()}-${process.pid}`;
  const password = 'M11-E2e!2026';
  const ids: Record<string, string> = {};
  let student: ReturnType<typeof request.agent>;
  let otherStudent: ReturnType<typeof request.agent>;
  let instructor: ReturnType<typeof request.agent>;
  let admin: ReturnType<typeof request.agent>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
    prisma = app.get(PrismaService);
    const passwordHash = await argon2.hash(password);
    const users = await Promise.all(
      [
        ['student', UserRole.STUDENT],
        ['other', UserRole.STUDENT],
        ['instructor', UserRole.INSTRUCTOR],
        ['admin', UserRole.ADMIN_COORDINATOR],
      ].map(([name, role]) =>
        prisma.user.create({
          data: {
            email: `m11-${name}-${unique}@example.com`,
            fullName: `M11 ${name}`,
            passwordHash,
            role: role as UserRole,
            status: UserStatus.ACTIVE,
          },
        }),
      ),
    );
    [ids.student, ids.other, ids.instructor, ids.admin] = users.map((user) => user.id);
    const course = await prisma.course.create({
      data: {
        title: `M11 Course ${unique}`,
        slug: `m11-course-${unique}`,
        description: 'M11 E2E',
        level: 'E2E',
        isPublished: true,
        createdById: ids.admin,
      },
    });
    ids.course = course.id;
    const [freeClass, paidClass] = await Promise.all([
      prisma.classOffering.create({
        data: {
          courseId: course.id,
          instructorId: ids.instructor,
          name: 'M11 Online',
          code: `M11-FREE-${unique}`,
          status: ClassOfferingStatus.OPEN,
          modality: ClassModality.ONLINE,
          pricingType: PricingType.FREE,
          maxStudents: 10,
        },
      }),
      prisma.classOffering.create({
        data: {
          courseId: course.id,
          instructorId: ids.instructor,
          name: 'M11 Paid',
          code: `M11-PAID-${unique}`,
          status: ClassOfferingStatus.OPEN,
          modality: ClassModality.ONLINE,
          pricingType: PricingType.PAID,
          tuitionFeeVnd: 900_000,
          maxStudents: 10,
        },
      }),
    ]);
    ids.freeClass = freeClass.id;
    ids.paidClass = paidClass.id;
    ids.slot = (
      await prisma.classScheduleSlot.create({
        data: {
          classOfferingId: freeClass.id,
          dayOfWeek: 2,
          startTime: new Date('1970-01-01T12:00:00Z'),
          endTime: new Date('1970-01-01T14:00:00Z'),
          meetingUrl: 'https://meet.example.com/m11',
        },
      })
    ).id;
    ids.freeEnrollment = (
      await prisma.enrollment.create({
        data: {
          learnerId: ids.student,
          classOfferingId: freeClass.id,
          status: EnrollmentStatus.ACTIVE,
          pricingTypeSnapshot: PricingType.FREE,
        },
      })
    ).id;
    ids.otherEnrollment = (
      await prisma.enrollment.create({
        data: {
          learnerId: ids.other,
          classOfferingId: freeClass.id,
          status: EnrollmentStatus.ACTIVE,
          pricingTypeSnapshot: PricingType.FREE,
        },
      })
    ).id;
    ids.paidEnrollment = (
      await prisma.enrollment.create({
        data: {
          learnerId: ids.student,
          classOfferingId: paidClass.id,
          status: EnrollmentStatus.PENDING_PAYMENT,
          pricingTypeSnapshot: PricingType.PAID,
          tuitionFeeVndSnapshot: 900_000,
        },
      })
    ).id;
    student = request.agent(app.getHttpServer());
    otherStudent = request.agent(app.getHttpServer());
    instructor = request.agent(app.getHttpServer());
    admin = request.agent(app.getHttpServer());
    await Promise.all([
      login(student, users[0].email),
      login(otherStudent, users[1].email),
      login(instructor, users[2].email),
      login(admin, users[3].email),
    ]);
  });

  afterAll(async () => {
    await prisma.certificate.deleteMany({
      where: {
        completion: { enrollment: { classOfferingId: { in: [ids.freeClass, ids.paidClass] } } },
      },
    });
    await prisma.courseCompletion.deleteMany({
      where: { enrollment: { classOfferingId: { in: [ids.freeClass, ids.paidClass] } } },
    });
    await prisma.completionPolicy.deleteMany({
      where: { classOfferingId: { in: [ids.freeClass, ids.paidClass] } },
    });
    await prisma.attendanceRecord.deleteMany({
      where: { attendanceSession: { classOfferingId: ids.freeClass } },
    });
    await prisma.attendanceSession.deleteMany({ where: { classOfferingId: ids.freeClass } });
    await prisma.consultationRequest.deleteMany({
      where: { enrollment: { classOfferingId: ids.freeClass } },
    });
    await prisma.tuitionPayment.deleteMany({ where: { enrollmentId: ids.paidEnrollment } });
    await prisma.enrollment.deleteMany({
      where: { classOfferingId: { in: [ids.freeClass, ids.paidClass] } },
    });
    await prisma.classScheduleSlot.deleteMany({ where: { classOfferingId: ids.freeClass } });
    await prisma.classOffering.deleteMany({
      where: { id: { in: [ids.freeClass, ids.paidClass] } },
    });
    await prisma.publicContent.deleteMany({ where: { slug: `m11-public-${unique}` } });
    await prisma.rubricCriterion.deleteMany({
      where: { rubric: { name: { startsWith: `M11 ${unique}` } } },
    });
    await prisma.rubric.deleteMany({ where: { name: { startsWith: `M11 ${unique}` } } });
    await prisma.course.delete({ where: { id: ids.course } });
    await prisma.user.deleteMany({
      where: { id: { in: [ids.student, ids.other, ids.instructor, ids.admin] } },
    });
    await app.close();
  });

  it('executes profile, payments, engagement, completion, certificates, rubrics and public content securely', async () => {
    const profile = await student
      .patch('/api/users/me/profile')
      .send({ fullName: 'M11 Student Updated', phoneNumber: '+84 912 345 678' })
      .expect(200);
    expect(profile.body).toMatchObject({
      fullName: 'M11 Student Updated',
      phoneNumber: '+84 912 345 678',
    });
    expect(
      await prisma.user.findUnique({ where: { id: ids.student }, select: { email: true } }),
    ).toEqual({ email: expect.stringContaining('m11-student-') });

    const createdPayment = await student
      .post(`/api/enrollments/${ids.paidEnrollment}/payments`)
      .expect(201);
    expect(createdPayment.body).toMatchObject({ amountVnd: 900_000, status: 'PENDING' });
    ids.payment = createdPayment.body.id;
    await student
      .patch(`/api/enrollments/${ids.paidEnrollment}/payments/${ids.payment}/submitted`)
      .send({ payerReference: 'BANK-M11' })
      .expect(200);
    expect(
      (await prisma.enrollment.findUniqueOrThrow({ where: { id: ids.paidEnrollment } })).status,
    ).toBe(EnrollmentStatus.PENDING_PAYMENT);
    await otherStudent.get(`/api/enrollments/${ids.paidEnrollment}/payments`).expect(404);
    await Promise.all([
      admin.post(`/api/admin/payments/${ids.payment}/verify`).send({}),
      admin.post(`/api/admin/payments/${ids.payment}/verify`).send({}),
    ]);
    expect(
      (await prisma.enrollment.findUniqueOrThrow({ where: { id: ids.paidEnrollment } })).status,
    ).toBe(EnrollmentStatus.ACTIVE);

    const consultation = await student
      .post(`/api/enrollments/${ids.freeEnrollment}/consultations`)
      .send({
        topic: 'M11 planning',
        requestedStartAt: '2026-12-01T10:00:00.000Z',
        durationMinutes: 30,
      })
      .expect(201);
    ids.consultation = consultation.body.id;
    await otherStudent.get(`/api/enrollments/${ids.freeEnrollment}/consultations`).expect(404);
    await instructor
      .patch(`/api/instructor/classes/${ids.freeClass}/consultations/${ids.consultation}`)
      .send({
        status: 'CONFIRMED',
        confirmedStartAt: '2026-12-01T10:00:00.000Z',
        meetingUrl: 'https://meet.example.com/consultation',
      })
      .expect(200);
    const live = await student
      .get(`/api/virtual-classroom/enrollments/${ids.freeEnrollment}`)
      .expect(200);
    expect(live.body.classOffering.scheduleSlots[0].meetingUrl).toBe(
      'https://meet.example.com/m11',
    );

    const session = await instructor
      .post(`/api/instructor/classes/${ids.freeClass}/attendance/sessions`)
      .send({ sessionDate: '2026-10-24', title: 'M11 attendance' })
      .expect(201);
    ids.session = session.body.id;
    await instructor
      .put(`/api/instructor/classes/${ids.freeClass}/attendance/sessions/${ids.session}/records`)
      .send({ records: [{ enrollmentId: ids.freeEnrollment, status: 'PRESENT' }] })
      .expect(200);
    expect(
      await prisma.attendanceRecord.count({ where: { attendanceSessionId: ids.session } }),
    ).toBe(1);
    expect(
      await prisma.attendanceRecord.findUnique({
        where: {
          attendanceSessionId_enrollmentId: {
            attendanceSessionId: ids.session,
            enrollmentId: ids.otherEnrollment,
          },
        },
      }),
    ).toBeNull();

    const rubric = await instructor
      .post('/api/instructor/rubrics')
      .send({
        name: `M11 ${unique} owned`,
        criteria: [{ code: 'CLARITY', name: 'Clarity', maxScore: 10, weight: 1 }],
      })
      .expect(201);
    ids.rubric = rubric.body.id;
    const legacy = await prisma.rubric.create({ data: { name: `M11 ${unique} legacy` } });
    ids.legacyRubric = legacy.id;
    await instructor
      .patch(`/api/instructor/rubrics/${legacy.id}`)
      .send({ name: 'Forbidden', criteria: [{ code: 'A', name: 'A', maxScore: 1, weight: 1 }] })
      .expect(403);
    await instructor.post(`/api/instructor/rubrics/${ids.rubric}/deactivate`).expect(201);

    const draft = await admin
      .post('/api/admin/public-content')
      .send({
        slug: `m11-public-${unique}`,
        category: 'Cập nhật chương trình',
        title: 'M11 public article',
        excerpt: 'This draft must remain private until published.',
        bodyMarkdown: '# Safe heading\n\n<script>alert(1)</script>',
      })
      .expect(201);
    ids.content = draft.body.id;
    await request(app.getHttpServer()).get(`/api/public-content/m11-public-${unique}`).expect(404);
    const editedDraft = await admin
      .patch(`/api/admin/public-content/${ids.content}`)
      .send({ title: 'M11 public article updated' })
      .expect(200);
    expect(editedDraft.body).toMatchObject({
      slug: `m11-public-${unique}`,
      title: 'M11 public article updated',
    });
    await admin.post(`/api/admin/public-content/${ids.content}/publish`).expect(201);
    const publicItem = await request(app.getHttpServer())
      .get(`/api/public-content/m11-public-${unique}`)
      .expect(200);
    expect(publicItem.body.bodyMarkdown).toContain('<script>');

    await admin
      .put(`/api/admin/class-offerings/${ids.freeClass}/completion-policy`)
      .send({
        minLessonCompletionPercent: 100,
        minAttendancePercent: null,
        requireFinalAssessment: false,
      })
      .expect(200);
    await prisma.classOffering.update({
      where: { id: ids.freeClass },
      data: { status: ClassOfferingStatus.COMPLETED },
    });
    const report = await student
      .get(`/api/learning/enrollments/${ids.freeEnrollment}/report`)
      .expect(200);
    expect(report.body.attendance).toMatchObject({ markedSessions: 1, percent: 100 });
    const [evaluationA, evaluationB] = await Promise.all([
      student.post(`/api/certificates/enrollments/${ids.freeEnrollment}/evaluate`),
      student.post(`/api/certificates/enrollments/${ids.freeEnrollment}/evaluate`),
    ]);
    expect([evaluationA.status, evaluationB.status].every((status) => status === 201)).toBe(true);
    expect(
      await prisma.courseCompletion.count({ where: { enrollmentId: ids.freeEnrollment } }),
    ).toBe(1);
    expect(
      await prisma.certificate.count({
        where: { completion: { enrollmentId: ids.freeEnrollment } },
      }),
    ).toBe(1);
    const certificates = await student.get('/api/certificates/my').expect(200);
    expect(certificates.body).toHaveLength(1);
    await otherStudent.get(`/api/certificates/${certificates.body[0].id}`).expect(404);
    await student
      .get(`/api/certificates/${certificates.body[0].id}/download`)
      .expect('Content-Type', /text\/html/)
      .expect(200);
    const issuedDate = certificates.body[0].issuedAt.slice(0, 10);
    const registry = await admin
      .get('/api/admin/certificates')
      .query({
        search: `m11-student-${unique}@example.com`,
        status: 'VALID',
        issuedFrom: issuedDate,
        issuedTo: issuedDate,
      })
      .expect(200);
    expect(registry.body.data).toHaveLength(1);
    await admin
      .post(`/api/admin/certificates/${certificates.body[0].id}/revoke`)
      .send({ reason: 'E2E revocation verification' })
      .expect(201);
    await student.get(`/api/certificates/${certificates.body[0].id}/download`).expect(409);
  });

  async function login(agent: ReturnType<typeof request.agent>, email: string) {
    await agent.post('/api/auth/login').send({ email, password }).expect(200);
  }
});
