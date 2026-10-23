import { Injectable } from '@nestjs/common';
import {
  ClassOfferingStatus,
  EnrollmentStatus,
  LessonProgressStatus,
  TestAttemptStatus,
  UserRole,
  UserStatus,
} from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { computeOperationalReadiness } from '../classes/class-operations';
import { computeRegistrationState } from '../classes/registration-state';
import { enumerateCalendarDays, resolveReportPeriod, vietnamDate } from './admin-reporting-period';
import { AdminSystemReportQueryDto } from './dto/admin-system-report-query.dto';

const accountRoles = Object.values(UserRole);
const accountStatuses = Object.values(UserStatus);
const classStatuses = Object.values(ClassOfferingStatus);
const enrollmentStatuses = Object.values(EnrollmentStatus);

@Injectable()
export class AdminReportingService {
  constructor(private readonly prisma: PrismaService) {}

  async getSystemReport(query: AdminSystemReportQueryDto, now = new Date()) {
    const period = resolveReportPeriod(query, now);
    const [
      roles,
      userStatuses,
      coursePublication,
      classesByStatus,
      operationalClasses,
      enrollmentsByStatus,
      enrollmentActivity,
      submittedAttempts,
      completedLessons,
    ] = await Promise.all([
      this.prisma.user.groupBy({ by: ['role'], _count: { _all: true } }),
      this.prisma.user.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.course.groupBy({ by: ['isPublished'], _count: { _all: true } }),
      this.prisma.classOffering.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.classOffering.findMany({
        where: { status: { in: [ClassOfferingStatus.DRAFT, ClassOfferingStatus.OPEN] } },
        select: {
          status: true,
          enrollmentStart: true,
          enrollmentEnd: true,
          classStart: true,
          classEnd: true,
          maxStudents: true,
          course: { select: { isPublished: true } },
          instructor: { select: { role: true, status: true } },
          scheduleSlots: { select: { locationText: true, meetingUrl: true } },
          _count: { select: { enrollments: { where: { status: EnrollmentStatus.ACTIVE } } } },
        },
      }),
      this.prisma.enrollment.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.enrollment.findMany({
        where: { enrolledAt: { gte: period.start, lt: period.endExclusive } },
        select: { enrolledAt: true },
      }),
      this.prisma.testAttempt.findMany({
        where: {
          status: TestAttemptStatus.SUBMITTED,
          submittedAt: { gte: period.start, lt: period.endExclusive },
        },
        select: { submittedAt: true },
      }),
      this.prisma.lessonProgress.findMany({
        where: {
          status: LessonProgressStatus.COMPLETED,
          completedAt: { gte: period.start, lt: period.endExclusive },
        },
        select: { completedAt: true },
      }),
    ]);

    const roleCounts = enumCounts(accountRoles, roles, 'role');
    const userStatusCounts = enumCounts(accountStatuses, userStatuses, 'status');
    const classCounts = enumCounts(classStatuses, classesByStatus, 'status');
    const enrollmentCounts = enumCounts(enrollmentStatuses, enrollmentsByStatus, 'status');
    const draftNotReady = operationalClasses.filter(
      (offering) =>
        offering.status === ClassOfferingStatus.DRAFT &&
        !computeOperationalReadiness({
          courseIsPublished: offering.course.isPublished,
          instructor: offering.instructor,
          classStart: offering.classStart,
          classEnd: offering.classEnd,
          scheduleSlots: offering.scheduleSlots,
        }).isReady,
    ).length;
    const openRegistration = {
      AVAILABLE: 0,
      FULL: 0,
      UPCOMING: 0,
      CLOSED: 0,
    };
    for (const offering of operationalClasses) {
      if (offering.status !== ClassOfferingStatus.OPEN) continue;
      const state = computeRegistrationState({
        status: offering.status,
        courseIsPublished: offering.course.isPublished,
        enrollmentStart: offering.enrollmentStart,
        enrollmentEnd: offering.enrollmentEnd,
        maxStudents: offering.maxStudents,
        registeredCount: offering._count.enrollments,
        now,
      }).registrationState;
      openRegistration[state] += 1;
    }

    const activity = new Map(
      enumerateCalendarDays(period.from, period.to).map((date) => [
        date,
        { date, newEnrollments: 0, submittedAssessments: 0, lessonCompletions: 0 },
      ]),
    );
    incrementDaily(activity, enrollmentActivity, 'enrolledAt', 'newEnrollments');
    incrementDaily(activity, submittedAttempts, 'submittedAt', 'submittedAssessments');
    incrementDaily(activity, completedLessons, 'completedAt', 'lessonCompletions');

    const published = coursePublication.find((row) => row.isPublished)?._count._all ?? 0;
    const draft = coursePublication.find((row) => !row.isPublished)?._count._all ?? 0;

    return {
      generatedAt: now.toISOString(),
      snapshot: {
        accounts: { total: sum(roleCounts), byRole: roleCounts, byStatus: userStatusCounts },
        courses: { total: published + draft, published, draft },
        classes: {
          total: sum(classCounts),
          byStatus: classCounts,
          draftReadiness: {
            ready: classCounts.DRAFT - draftNotReady,
            notReady: draftNotReady,
          },
          openRegistration,
        },
        enrollments: { total: sum(enrollmentCounts), byStatus: enrollmentCounts },
      },
      attention: {
        draftNotReady,
        openFull: openRegistration.FULL,
        pendingPayment: enrollmentCounts.PENDING_PAYMENT,
      },
      activity: {
        period: {
          from: period.from,
          to: period.to,
          days: period.days,
          timeZone: period.timeZone,
        },
        totals: Array.from(activity.values()).reduce(
          (totals, row) => ({
            newEnrollments: totals.newEnrollments + row.newEnrollments,
            submittedAssessments: totals.submittedAssessments + row.submittedAssessments,
            lessonCompletions: totals.lessonCompletions + row.lessonCompletions,
          }),
          { newEnrollments: 0, submittedAssessments: 0, lessonCompletions: 0 },
        ),
        daily: Array.from(activity.values()),
      },
    };
  }
}

function enumCounts<T extends string, K extends string>(
  values: readonly T[],
  rows: Array<Record<K, T> & { _count: { _all: number } }>,
  key: K,
): Record<T, number> {
  return Object.fromEntries(
    values.map((value) => [value, rows.find((row) => row[key] === value)?._count._all ?? 0]),
  ) as Record<T, number>;
}

function sum(input: Record<string, number>): number {
  return Object.values(input).reduce((total, value) => total + value, 0);
}

function incrementDaily<
  K extends 'enrolledAt' | 'submittedAt' | 'completedAt',
  C extends 'newEnrollments' | 'submittedAssessments' | 'lessonCompletions',
>(
  daily: Map<
    string,
    {
      date: string;
      newEnrollments: number;
      submittedAssessments: number;
      lessonCompletions: number;
    }
  >,
  rows: Array<Record<K, Date | null>>,
  dateKey: K,
  countKey: C,
) {
  for (const row of rows) {
    const value = row[dateKey];
    if (!value) continue;
    const bucket = daily.get(vietnamDate(value));
    if (bucket) bucket[countKey] += 1;
  }
}
