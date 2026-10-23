import { BadRequestException } from '@nestjs/common';
import {
  AnswerEvaluationStatus,
  ClassOfferingStatus,
  EnrollmentStatus,
  UserRole,
  UserStatus,
} from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AdminReportingService } from './admin-reporting.service';

const group = <T extends string | boolean>(key: string, value: T, count: number) => ({
  [key]: value,
  _count: { _all: count },
});

function createHarness() {
  const prisma = {
    user: { groupBy: jest.fn() },
    course: { groupBy: jest.fn() },
    classOffering: { groupBy: jest.fn(), findMany: jest.fn() },
    enrollment: { count: jest.fn(), findMany: jest.fn() },
    testAttempt: { findMany: jest.fn(), count: jest.fn() },
    $transaction: jest.fn(),
    $queryRaw: jest.fn(),
  };
  prisma.user.groupBy
    .mockResolvedValueOnce([group('role', UserRole.STUDENT, 4)])
    .mockResolvedValueOnce([group('status', UserStatus.ACTIVE, 3)]);
  prisma.course.groupBy.mockResolvedValue([
    group('isPublished', true, 2),
    group('isPublished', false, 1),
  ]);
  prisma.classOffering.groupBy.mockResolvedValue([
    group('status', ClassOfferingStatus.DRAFT, 2),
    group('status', ClassOfferingStatus.OPEN, 2),
    group('status', ClassOfferingStatus.IN_PROGRESS, 1),
  ]);
  prisma.classOffering.findMany.mockResolvedValue([
    offering('draft-not-ready', ClassOfferingStatus.DRAFT, { published: false }),
    offering('open-full', ClassOfferingStatus.OPEN, { maxStudents: 2, registered: 2 }),
    offering('open-unlimited', ClassOfferingStatus.OPEN, { maxStudents: null, registered: 3 }),
    offering('in-progress', ClassOfferingStatus.IN_PROGRESS, { registered: 1 }),
  ]);
  prisma.$queryRaw.mockResolvedValue([
    {
      draftNotReady: 1,
      openFull: 1,
      totalOperationalClasses: 3,
      capacityIds: ['open-full', 'open-unlimited', 'in-progress'],
    },
  ]);
  prisma.enrollment.count.mockResolvedValue(2);
  prisma.enrollment.findMany.mockResolvedValue([
    demandEnrollment('2026-10-01T05:00:00.000Z', 'open-full'),
    demandEnrollment('2026-10-02T05:00:00.000Z', 'open-full'),
  ]);
  prisma.testAttempt.findMany.mockResolvedValue([
    backlogAttempt('pending', [answer([]), answer([])]),
    backlogAttempt('final', [answer([AnswerEvaluationStatus.REVIEWED_FINAL])]),
  ]);
  prisma.testAttempt.count.mockResolvedValue(1);
  prisma.$transaction.mockImplementation((operations: Array<Promise<unknown>>) =>
    Promise.all(operations),
  );
  return { prisma, service: new AdminReportingService(prisma as unknown as PrismaService) };
}

describe('AdminReportingService', () => {
  it('returns decision-oriented queues, truthful capacity, and zero-filled enrollment demand', async () => {
    const { prisma, service } = createHarness();
    const result = await service.getSystemReport(
      { from: '2026-10-01', to: '2026-10-03' },
      new Date('2026-10-02T05:00:00.000Z'),
    );

    expect(result).toMatchObject({
      generatedAt: '2026-10-02T05:00:00.000Z',
      period: { from: '2026-10-01', to: '2026-10-03', days: 3, timeZone: 'Asia/Ho_Chi_Minh' },
      actionQueues: { draftNotReady: 1, openFull: 1, pendingPayment: 2, gradingBacklog: 1 },
      accounts: {
        total: 4,
        byRole: { STUDENT: 4, INSTRUCTOR: 0, ADMIN_COORDINATOR: 0 },
        byStatus: { ACTIVE: 3, INACTIVE: 0, LOCKED: 0 },
      },
      courses: { total: 3, published: 2, draft: 1 },
      classes: {
        total: 5,
        byStatus: { DRAFT: 2, OPEN: 2, IN_PROGRESS: 1, COMPLETED: 0, CANCELLED: 0 },
        capacity: { totalOperationalClasses: 3, truncated: false },
      },
      enrollmentDemand: {
        totalNewEnrollments: 2,
        byClass: [{ classOfferingId: 'open-full', count: 2 }],
        daily: [
          { date: '2026-10-01', count: 1 },
          { date: '2026-10-02', count: 1 },
          { date: '2026-10-03', count: 0 },
        ],
      },
    });
    const unlimited = result.classes.capacity.items.find((row) => row.id === 'open-unlimited');
    expect(unlimited).toMatchObject({ maxStudents: null, remainingSeats: null });
    expect(prisma.classOffering.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ['open-full', 'open-unlimited', 'in-progress'] } },
        take: 12,
      }),
    );
    expect(JSON.stringify(result)).not.toContain('meetingUrl');
    expect(JSON.stringify(result)).not.toContain('submittedAssessments');
    expect(JSON.stringify(result)).not.toContain('lessonCompletions');
  });

  it('validates computed class-filter combinations and paginates exact rows', async () => {
    const { prisma, service } = createHarness();
    await expect(
      service.listClasses({ readiness: 'NOT_READY', page: 1, limit: 10 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.listClasses({
        status: ClassOfferingStatus.DRAFT,
        registrationState: 'FULL',
        page: 1,
        limit: 10,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.listClasses({
        scope: 'OPERATIONAL',
        status: ClassOfferingStatus.OPEN,
        page: 1,
        limit: 10,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    prisma.$queryRaw.mockResolvedValueOnce([{ ids: ['draft-not-ready'], total: 1 }]);
    const result = await service.listClasses({
      status: ClassOfferingStatus.DRAFT,
      readiness: 'NOT_READY',
      page: 1,
      limit: 10,
    });
    expect(result.meta).toMatchObject({ total: 1, totalPages: 1 });
    expect(result.data[0]).toMatchObject({
      id: 'draft-not-ready',
      operationalReadiness: { isReady: false },
    });
    expect(JSON.stringify(result)).not.toContain('meetingUrl');
  });

  it('hydrates only the DB-authoritative class page and keeps exact page metadata', async () => {
    const { prisma, service } = createHarness();
    prisma.$queryRaw.mockResolvedValueOnce([{ ids: ['open-full', 'open-unlimited'], total: 12 }]);

    const result = await service.listClasses({
      scope: 'OPERATIONAL',
      page: 2,
      limit: 2,
    });

    expect(result.meta).toEqual({ page: 2, limit: 2, total: 12, totalPages: 6 });
    expect(result.data.map((row) => row.id)).toEqual(['open-full', 'open-unlimited']);
    expect(prisma.classOffering.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ['open-full', 'open-unlimited'] } },
        take: 2,
      }),
    );
    expect(prisma.classOffering.findMany).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: undefined }),
    );
  });

  it('uses backend pagination and a private enrollment projection', async () => {
    const { prisma, service } = createHarness();
    prisma.$transaction.mockResolvedValueOnce([
      [
        {
          id: 'enrollment-1',
          status: EnrollmentStatus.PENDING_PAYMENT,
          enrolledAt: new Date('2026-10-02T05:00:00.000Z'),
          learner: { id: 'learner-1', fullName: 'Learner', email: 'learner@example.com' },
          classOffering: {
            id: 'class-1',
            code: 'C1',
            name: 'Class 1',
            course: { id: 'course-1', title: 'Course 1' },
          },
        },
      ],
      1,
    ]);
    const result = await service.listEnrollments({
      status: EnrollmentStatus.PENDING_PAYMENT,
      page: 1,
      limit: 10,
    });
    expect(result.data[0]).toMatchObject({
      id: 'enrollment-1',
      classOffering: { id: 'class-1' },
      course: { id: 'course-1' },
    });
    expect(JSON.stringify(result)).not.toContain('paymentSuccess');
  });

  it('excludes fully reviewed attempts and never projects productive answer bodies', async () => {
    const { service } = createHarness();
    const result = await service.listGradingBacklog({ page: 1, limit: 10 });
    expect(result.meta.total).toBe(1);
    expect(result.data[0]).toMatchObject({
      attemptId: 'pending',
      gradingState: 'SUBMITTED_PENDING_REVIEW',
      pendingProductiveAnswers: 2,
      totalProductiveAnswers: 2,
    });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('textResponse');
    expect(serialized).not.toContain('audioStorageKey');
    expect(serialized).not.toContain('evaluations');
  });
});

function offering(
  id: string,
  status: ClassOfferingStatus,
  options: { published?: boolean; maxStudents?: number | null; registered?: number } = {},
) {
  return {
    id,
    code: id.toUpperCase(),
    name: id,
    status,
    enrollmentStart: null,
    enrollmentEnd: null,
    classStart: new Date('2026-10-10T00:00:00.000Z'),
    classEnd: new Date('2026-11-01T00:00:00.000Z'),
    maxStudents: options.maxStudents === undefined ? 10 : options.maxStudents,
    course: { id: 'course-1', title: 'Course 1', isPublished: options.published ?? true },
    instructor: {
      id: 'instructor-1',
      fullName: 'Instructor',
      role: UserRole.INSTRUCTOR,
      status: UserStatus.ACTIVE,
    },
    scheduleSlots: [{ locationText: 'Room 1', meetingUrl: 'https://private.example.test' }],
    _count: { enrollments: options.registered ?? 0 },
  };
}

function demandEnrollment(enrolledAt: string, classOfferingId: string) {
  return {
    enrolledAt: new Date(enrolledAt),
    classOffering: {
      id: classOfferingId,
      code: 'OPEN-FULL',
      name: 'Open full',
      course: { id: 'course-1', title: 'Course 1' },
    },
  };
}

function answer(statuses: AnswerEvaluationStatus[]) {
  return { evaluations: statuses.map((status) => ({ status })) };
}

function backlogAttempt(id: string, answers: ReturnType<typeof answer>[]) {
  return {
    id,
    submittedAt: new Date('2026-10-02T05:00:00.000Z'),
    learner: { id: 'learner-1', fullName: 'Learner', email: 'learner@example.com' },
    answers,
    classAssessment: {
      id: 'assessment-1',
      stage: 'MIDTERM',
      test: { id: 'test-1', title: 'Speaking test' },
      classOffering: {
        id: 'class-1',
        code: 'C1',
        name: 'Class 1',
        course: { id: 'course-1', title: 'Course 1' },
        instructor: { id: 'instructor-1', fullName: 'Instructor' },
      },
    },
  };
}
