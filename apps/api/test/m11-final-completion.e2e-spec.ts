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
          classStart: new Date('2026-10-01T00:00:00.000Z'),
          classEnd: new Date('2026-12-31T23:59:59.000Z'),
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
    await prisma.consultationMessage.deleteMany({
      where: { thread: { enrollment: { classOfferingId: ids.freeClass } } },
    });
    await prisma.consultationThread.deleteMany({
      where: { enrollment: { classOfferingId: ids.freeClass } },
    });
    await prisma.tuitionPayment.deleteMany({
      where: { enrollment: { classOfferingId: { in: [ids.freeClass, ids.paidClass] } } },
    });
    await prisma.enrollment.deleteMany({
      where: { classOfferingId: { in: [ids.freeClass, ids.paidClass] } },
    });
    await prisma.classScheduleSlot.deleteMany({ where: { classOfferingId: ids.freeClass } });
    await prisma.classOffering.deleteMany({
      where: { id: { in: [ids.freeClass, ids.paidClass] } },
    });
    await prisma.publicContent.deleteMany({
      where: { slug: { startsWith: `m11-public-${unique}` } },
    });
    if (ids.asset) await prisma.publicContentAsset.delete({ where: { id: ids.asset } });
    await prisma.publicContentCategory.deleteMany({
      where: { slug: `m11-category-${unique}` },
    });
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

    const emptyPaymentHistory = await student
      .get(`/api/enrollments/${ids.paidEnrollment}/payments`)
      .expect(200);
    expect(emptyPaymentHistory.body).toMatchObject({
      data: [],
      enrollment: {
        id: ids.paidEnrollment,
        tuitionFeeVndSnapshot: 900_000,
        classOffering: { id: ids.paidClass },
      },
    });
    const createdPayment = await student
      .post(`/api/enrollments/${ids.paidEnrollment}/payments`)
      .expect(201);
    expect(createdPayment.body).toMatchObject({ amountVnd: 900_000, status: 'PENDING' });
    ids.payment = createdPayment.body.id;
    const paymentClassOptions = await admin.get('/api/admin/payments/filter-options').expect(200);
    expect(paymentClassOptions.body).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: ids.paidClass })]),
    );
    const filteredPayments = await admin
      .get('/api/admin/payments')
      .query({ classOfferingId: ids.paidClass })
      .expect(200);
    expect(filteredPayments.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: ids.payment,
          enrollment: expect.objectContaining({
            classOffering: expect.objectContaining({ id: ids.paidClass }),
          }),
        }),
      ]),
    );
    const trimmedPaymentSearch = await admin
      .get('/api/admin/payments')
      .query({ search: `  ${createdPayment.body.referenceCode}  ` })
      .expect(200);
    expect(trimmedPaymentSearch.body.data).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: ids.payment })]),
    );
    const unknownPaymentQuery = await admin
      .get('/api/admin/payments')
      .query({ unknownQueryKey: 'must-still-be-rejected' })
      .expect(400);
    expect(unknownPaymentQuery.body.message).toEqual(
      expect.arrayContaining(['property unknownQueryKey should not exist']),
    );
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
    const rejectedEnrollment = await prisma.enrollment.create({
      data: {
        learnerId: ids.other,
        classOfferingId: ids.paidClass,
        status: EnrollmentStatus.PENDING_PAYMENT,
        pricingTypeSnapshot: PricingType.PAID,
        tuitionFeeVndSnapshot: 900_000,
      },
    });
    const rejectedPayment = await prisma.tuitionPayment.create({
      data: {
        enrollmentId: rejectedEnrollment.id,
        amountVnd: 900_000,
        referenceCode: `REJECT-${unique}`,
        status: 'SUBMITTED',
        submittedAt: new Date(),
      },
    });
    await admin.post(`/api/admin/payments/${rejectedPayment.id}/reject`).send({}).expect(400);
    const rejectionReason = 'Không tìm thấy giao dịch đối ứng';
    const rejected = await admin
      .post(`/api/admin/payments/${rejectedPayment.id}/reject`)
      .send({ reason: rejectionReason })
      .expect(201);
    expect(rejected.body.adminNote).toBe(rejectionReason);
    expect(
      (await prisma.enrollment.findUniqueOrThrow({ where: { id: rejectedEnrollment.id } })).status,
    ).toBe(EnrollmentStatus.PENDING_PAYMENT);

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
        instructorNote: 'Private instructor preparation',
      })
      .expect(200);
    const studentConsultations = await student
      .get(`/api/enrollments/${ids.freeEnrollment}/consultations`)
      .expect(200);
    expect(studentConsultations.body[0]).not.toHaveProperty('instructorNote');
    const instructorConsultations = await instructor
      .get(`/api/instructor/classes/${ids.freeClass}/consultations`)
      .expect(200);
    expect(instructorConsultations.body[0].instructorNote).toBe('Private instructor preparation');

    const studentMessage = await student
      .post(`/api/enrollments/${ids.freeEnrollment}/consultation-thread/messages`)
      .send({ body: '  Em cần hỗ trợ lộ trình học.  ' })
      .expect(201);
    expect(studentMessage.body.body).toBe('Em cần hỗ trợ lộ trình học.');
    await otherStudent
      .get(`/api/enrollments/${ids.freeEnrollment}/consultation-thread`)
      .expect(404);
    const inbox = await instructor
      .get(`/api/instructor/classes/${ids.freeClass}/consultation-inbox`)
      .expect(200);
    expect(inbox.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ enrollmentId: ids.freeEnrollment, unreadCount: 1 }),
      ]),
    );
    await instructor
      .post(
        `/api/instructor/classes/${ids.freeClass}/consultation-inbox/${ids.freeEnrollment}/messages`,
      )
      .send({ body: 'Thầy đã nhận được câu hỏi.' })
      .expect(201);
    const studentThread = await student
      .get(`/api/enrollments/${ids.freeEnrollment}/consultation-thread`)
      .expect(200);
    expect(studentThread.body.messages.map((message: { body: string }) => message.body)).toEqual([
      'Em cần hỗ trợ lộ trình học.',
      'Thầy đã nhận được câu hỏi.',
    ]);
    expect(studentThread.body.unreadCount).toBe(1);
    expect(studentThread.body.appointments[0]).not.toHaveProperty('instructorNote');
    await student
      .post(`/api/enrollments/${ids.freeEnrollment}/consultation-thread/read`)
      .expect(201);

    const live = await student
      .get(`/api/virtual-classroom/enrollments/${ids.freeEnrollment}`)
      .expect(200);
    expect(live.body.classOffering.scheduleSlots[0]).toMatchObject({ meetingAvailable: true });
    expect(live.body.classOffering.scheduleSlots[0]).not.toHaveProperty('meetingUrl');
    expect(
      live.body.occurrences
        .filter((occurrence: { status: string }) => occurrence.status !== 'LIVE')
        .every((occurrence: { joinUrl: string | null }) => occurrence.joinUrl === null),
    ).toBe(true);

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
    await instructor
      .put(`/api/instructor/classes/${ids.freeClass}/attendance/sessions/${ids.session}/records`)
      .send({ records: [], clearEnrollmentIds: [ids.freeEnrollment] })
      .expect(200);
    expect(
      await prisma.attendanceRecord.findUnique({
        where: {
          attendanceSessionId_enrollmentId: {
            attendanceSessionId: ids.session,
            enrollmentId: ids.freeEnrollment,
          },
        },
      }),
    ).toBeNull();
    await instructor
      .put(`/api/instructor/classes/${ids.freeClass}/attendance/sessions/${ids.session}/records`)
      .send({
        records: [
          { enrollmentId: ids.freeEnrollment, status: 'PRESENT', note: 'Restored after clear' },
        ],
        clearEnrollmentIds: [],
      })
      .expect(200);
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

    const selfCheckNow = Date.now();
    const selfCheckSession = await instructor
      .post(`/api/instructor/classes/${ids.freeClass}/attendance/sessions`)
      .send({
        sessionDate: new Date(selfCheckNow).toISOString().slice(0, 10),
        scheduleSlotId: ids.slot,
        title: 'M11 learner self check-in',
        selfCheckInEnabled: true,
        opensAt: new Date(selfCheckNow - 60_000).toISOString(),
        closesAt: new Date(selfCheckNow + 5 * 60_000).toISOString(),
        accessCode: '246810',
      })
      .expect(201);
    expect(selfCheckSession.body).not.toHaveProperty('accessCodeHash');
    expect(selfCheckSession.body.accessCodeEnabled).toBe(true);
    await student
      .post(
        `/api/enrollments/${ids.freeEnrollment}/attendance/${selfCheckSession.body.id}/check-in`,
      )
      .send({ accessCode: '000000' })
      .expect(400);
    const checkedIn = await student
      .post(
        `/api/enrollments/${ids.freeEnrollment}/attendance/${selfCheckSession.body.id}/check-in`,
      )
      .send({ accessCode: ' 246810 ' })
      .expect(201);
    expect(checkedIn.body).toMatchObject({
      idempotent: false,
      record: { status: 'PRESENT', source: 'SELF_CHECK_IN' },
    });
    const repeatedCheckIn = await student
      .post(
        `/api/enrollments/${ids.freeEnrollment}/attendance/${selfCheckSession.body.id}/check-in`,
      )
      .send({ accessCode: '246810' })
      .expect(201);
    expect(repeatedCheckIn.body.idempotent).toBe(true);
    await otherStudent
      .post(
        `/api/enrollments/${ids.freeEnrollment}/attendance/${selfCheckSession.body.id}/check-in`,
      )
      .send({ accessCode: '246810' })
      .expect(404);
    const studentAttendance = await student
      .get(`/api/enrollments/${ids.freeEnrollment}/attendance`)
      .expect(200);
    expect(studentAttendance.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: selfCheckSession.body.id,
          state: 'CHECKED_IN',
          record: expect.objectContaining({ source: 'SELF_CHECK_IN' }),
        }),
      ]),
    );

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

    const category = await admin
      .post('/api/admin/public-content/categories')
      .send({
        name: 'M11 updates',
        slug: `m11-category-${unique}`,
        description: 'Managed E2E category',
      })
      .expect(201);
    ids.category = category.body.id;
    await admin
      .post('/api/admin/public-content')
      .send({
        slug: `m11-public-${unique}-xss`,
        categoryId: ids.category,
        title: 'M11 unsafe rich content',
        excerpt: 'This draft must reject executable rich content.',
        contentFormat: 'RICH_HTML',
        bodyHtml: '<script>alert(1)</script><p>Safe-looking content</p>',
      })
      .expect(400);
    await admin
      .post('/api/admin/public-content/assets')
      .attach('file', Buffer.from('not-a-real-png'), {
        filename: 'spoofed.png',
        contentType: 'image/png',
      })
      .expect(400);
    const managedAsset = await admin
      .post('/api/admin/public-content/assets')
      .attach('file', Buffer.from('89504e470d0a1a0a00000000', 'hex'), {
        filename: 'managed.png',
        contentType: 'image/png',
      })
      .expect(201);
    ids.asset = managedAsset.body.id;
    expect(managedAsset.body.url).toContain('/api/public-content-assets/');
    await admin.delete(`/api/admin/public-content/assets/${managedAsset.body.id}`).expect(200);

    await admin
      .post('/api/admin/public-content')
      .send({
        slug: `m11-public-${unique}-bad-cover`,
        categoryId: ids.category,
        title: 'M11 invalid cover',
        excerpt: 'This draft must reject an uncontrolled cover key.',
        contentFormat: 'MARKDOWN',
        bodyMarkdown: '# Invalid cover\n\nThis body is sufficiently long.',
        coverKey: 'UNKNOWN',
      })
      .expect(400);
    const draft = await admin
      .post('/api/admin/public-content')
      .send({
        slug: `m11-public-${unique}`,
        categoryId: ids.category,
        title: 'M11 public article',
        excerpt: 'This draft must remain private until published.',
        contentFormat: 'RICH_HTML',
        bodyHtml: '<h2>Safe heading</h2><p><strong>Managed</strong> rich article.</p>',
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
    expect(publicItem.body.bodyHtml).toContain('<strong>Managed</strong>');
    expect(publicItem.body.bodyHtml).not.toContain('<script>');

    const legacyMarkdown = await admin
      .post('/api/admin/public-content')
      .send({
        slug: `m11-public-${unique}-legacy`,
        categoryId: ids.category,
        title: 'M11 legacy Markdown article',
        excerpt: 'Legacy Markdown remains supported alongside rich HTML.',
        contentFormat: 'MARKDOWN',
        bodyMarkdown: '# Legacy heading\n\nMarkdown content remains renderable.',
      })
      .expect(201);
    await admin.post(`/api/admin/public-content/${legacyMarkdown.body.id}/publish`).expect(201);
    const legacyPublic = await request(app.getHttpServer())
      .get(`/api/public-content/m11-public-${unique}-legacy`)
      .expect(200);
    expect(legacyPublic.body).toMatchObject({
      contentFormat: 'MARKDOWN',
      bodyMarkdown: expect.stringContaining('Legacy heading'),
    });

    const scheduledSlug = `m11-public-${unique}-scheduled`;
    const scheduled = await admin
      .post('/api/admin/public-content')
      .send({
        slug: scheduledSlug,
        categoryId: ids.category,
        title: 'M11 scheduled article',
        excerpt: 'This article must remain hidden until its scheduled time.',
        contentFormat: 'RICH_HTML',
        bodyHtml: '<h2>Scheduled content</h2><p>This content is scheduled for the future.</p>',
        publishedAt: '2099-12-01T10:00:00.000Z',
      })
      .expect(201);
    await admin.post(`/api/admin/public-content/${scheduled.body.id}/publish`).expect(201);
    await request(app.getHttpServer()).get(`/api/public-content/${scheduledSlug}`).expect(404);
    await admin
      .patch(`/api/admin/public-content/${scheduled.body.id}`)
      .send({ publishedAt: '2026-01-01T00:00:00.000Z' })
      .expect(200);
    await request(app.getHttpServer()).get(`/api/public-content/${scheduledSlug}`).expect(200);
    await admin.post(`/api/admin/public-content/${ids.content}/archive`).expect(201);
    await request(app.getHttpServer()).get(`/api/public-content/m11-public-${unique}`).expect(404);
    const deactivatedCategory = await admin
      .delete(`/api/admin/public-content/categories/${ids.category}`)
      .expect(200);
    expect(deactivatedCategory.body.isActive).toBe(false);

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
    expect(report.body.attendance).toMatchObject({ markedSessions: 2, percent: 100 });
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
