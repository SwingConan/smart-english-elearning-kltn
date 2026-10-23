import {
  ClassOfferingStatus,
  EnrollmentStatus,
  LessonProgressStatus,
  TestAttemptStatus,
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
    enrollment: { groupBy: jest.fn(), findMany: jest.fn() },
    testAttempt: { findMany: jest.fn() },
    lessonProgress: { findMany: jest.fn() },
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
    group('status', ClassOfferingStatus.OPEN, 4),
  ]);
  prisma.classOffering.findMany.mockResolvedValue([
    offering(ClassOfferingStatus.DRAFT, { published: true }),
    offering(ClassOfferingStatus.DRAFT, { published: false }),
    offering(ClassOfferingStatus.OPEN, { maxStudents: 2, registered: 2 }),
    offering(ClassOfferingStatus.OPEN, { maxStudents: 5, registered: 1 }),
    offering(ClassOfferingStatus.OPEN, { enrollmentStart: new Date('2026-10-03T00:00:00.000Z') }),
    offering(ClassOfferingStatus.OPEN, { published: false }),
  ]);
  prisma.enrollment.groupBy.mockResolvedValue([
    group('status', EnrollmentStatus.ACTIVE, 3),
    group('status', EnrollmentStatus.PENDING_PAYMENT, 2),
  ]);
  prisma.enrollment.findMany.mockResolvedValue([
    { enrolledAt: new Date('2026-10-01T16:59:59.999Z') },
    { enrolledAt: new Date('2026-10-01T17:00:00.000Z') },
  ]);
  prisma.testAttempt.findMany.mockResolvedValue([
    { submittedAt: new Date('2026-10-02T05:00:00.000Z') },
  ]);
  prisma.lessonProgress.findMany.mockResolvedValue([
    { completedAt: new Date('2026-10-03T05:00:00.000Z') },
  ]);
  return {
    prisma,
    service: new AdminReportingService(prisma as unknown as PrismaService),
  };
}

describe('AdminReportingService', () => {
  it('returns complete enum buckets, shared class semantics, aliases, and zero-filled activity', async () => {
    const { service } = createHarness();
    const result = await service.getSystemReport(
      { from: '2026-10-01', to: '2026-10-03' },
      new Date('2026-10-02T05:00:00.000Z'),
    );

    expect(result).toMatchObject({
      generatedAt: '2026-10-02T05:00:00.000Z',
      snapshot: {
        accounts: {
          total: 4,
          byRole: { STUDENT: 4, INSTRUCTOR: 0, ADMIN_COORDINATOR: 0 },
          byStatus: { ACTIVE: 3, INACTIVE: 0, LOCKED: 0 },
        },
        courses: { total: 3, published: 2, draft: 1 },
        classes: {
          total: 6,
          draftReadiness: { ready: 1, notReady: 1 },
          openRegistration: { AVAILABLE: 1, FULL: 1, UPCOMING: 1, CLOSED: 1 },
        },
        enrollments: { total: 5 },
      },
      attention: { draftNotReady: 1, openFull: 1, pendingPayment: 2 },
      activity: {
        period: { from: '2026-10-01', to: '2026-10-03', days: 3, timeZone: 'Asia/Ho_Chi_Minh' },
        totals: { newEnrollments: 2, submittedAssessments: 1, lessonCompletions: 1 },
        daily: [
          { date: '2026-10-01', newEnrollments: 1, submittedAssessments: 0, lessonCompletions: 0 },
          { date: '2026-10-02', newEnrollments: 1, submittedAssessments: 1, lessonCompletions: 0 },
          { date: '2026-10-03', newEnrollments: 0, submittedAssessments: 0, lessonCompletions: 1 },
        ],
      },
    });
    expect(result.snapshot.classes.byStatus).toEqual({
      DRAFT: 2,
      OPEN: 4,
      IN_PROGRESS: 0,
      COMPLETED: 0,
      CANCELLED: 0,
    });
    expect(result.snapshot.enrollments.byStatus).toEqual({
      ACTIVE: 3,
      PENDING_PAYMENT: 2,
      COMPLETED: 0,
      DROPPED: 0,
      CANCELLED: 0,
    });
  });

  it('uses the public interval for activity queries but not snapshot queries', async () => {
    const { prisma, service } = createHarness();
    await service.getSystemReport({ from: '2026-10-01', to: '2026-10-03' });

    expect(prisma.enrollment.findMany).toHaveBeenCalledWith({
      where: {
        enrolledAt: {
          gte: new Date('2026-09-30T17:00:00.000Z'),
          lt: new Date('2026-10-03T17:00:00.000Z'),
        },
      },
      select: { enrolledAt: true },
    });
    expect(prisma.testAttempt.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: TestAttemptStatus.SUBMITTED }),
        select: { submittedAt: true },
      }),
    );
    expect(prisma.lessonProgress.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: LessonProgressStatus.COMPLETED }),
        select: { completedAt: true },
      }),
    );
    expect(prisma.user.groupBy).toHaveBeenCalledWith({
      by: ['role'],
      _count: { _all: true },
    });
    expect(prisma.classOffering.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          _count: { select: { enrollments: { where: { status: EnrollmentStatus.ACTIVE } } } },
        }),
      }),
    );
  });
});

function offering(
  status: ClassOfferingStatus,
  options: {
    published?: boolean;
    maxStudents?: number | null;
    registered?: number;
    enrollmentStart?: Date;
  } = {},
) {
  return {
    status,
    enrollmentStart: 'enrollmentStart' in options ? options.enrollmentStart : null,
    enrollmentEnd: null,
    classStart: new Date('2026-10-01T00:00:00.000Z'),
    classEnd: new Date('2026-11-01T00:00:00.000Z'),
    maxStudents: options.maxStudents ?? 10,
    course: { isPublished: options.published ?? true },
    instructor: { role: UserRole.INSTRUCTOR, status: UserStatus.ACTIVE },
    scheduleSlots: [{ locationText: 'Room 1', meetingUrl: null }],
    _count: { enrollments: options.registered ?? 0 },
  };
}
