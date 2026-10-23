import { BadRequestException, Injectable } from '@nestjs/common';
import {
  AnswerEvaluationSource,
  ClassOfferingStatus,
  EnrollmentStatus,
  Prisma,
  QuestionResponseType,
  TestAttemptStatus,
  UserRole,
  UserStatus,
} from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { computeProductiveGradingState } from '../assessments/grading-state';
import { computeOperationalReadiness } from '../classes/class-operations';
import { computeRegistrationState } from '../classes/registration-state';
import { enumerateCalendarDays, resolveReportPeriod, vietnamDate } from './admin-reporting-period';
import {
  AdminReportClassesQueryDto,
  AdminReportEnrollmentsQueryDto,
  AdminReportGradingBacklogQueryDto,
  AdminSystemReportQueryDto,
} from './dto/admin-system-report-query.dto';

const accountRoles = Object.values(UserRole);
const accountStatuses = Object.values(UserStatus);
const classStatuses = Object.values(ClassOfferingStatus);
const productiveResponseTypes = [
  QuestionResponseType.TEXT_RESPONSE,
  QuestionResponseType.AUDIO_RESPONSE,
] as const;
const capacityLimit = 12;

const reportingClassSelect = {
  id: true,
  code: true,
  name: true,
  status: true,
  enrollmentStart: true,
  enrollmentEnd: true,
  classStart: true,
  classEnd: true,
  maxStudents: true,
  course: { select: { id: true, title: true, isPublished: true } },
  instructor: { select: { id: true, fullName: true, role: true, status: true } },
  scheduleSlots: { select: { locationText: true, meetingUrl: true } },
  _count: { select: { enrollments: { where: { status: EnrollmentStatus.ACTIVE } } } },
} satisfies Prisma.ClassOfferingSelect;

type ReportingClass = Prisma.ClassOfferingGetPayload<{ select: typeof reportingClassSelect }>;

const backlogAttemptSelect = {
  id: true,
  submittedAt: true,
  learner: { select: { id: true, fullName: true, email: true } },
  answers: {
    where: {
      testQuestion: { question: { responseType: { in: [...productiveResponseTypes] } } },
    },
    select: {
      evaluations: {
        where: { source: AnswerEvaluationSource.INSTRUCTOR },
        select: { status: true },
      },
    },
  },
  classAssessment: {
    select: {
      id: true,
      stage: true,
      test: { select: { id: true, title: true } },
      classOffering: {
        select: {
          id: true,
          code: true,
          name: true,
          course: { select: { id: true, title: true } },
          instructor: { select: { id: true, fullName: true } },
        },
      },
    },
  },
} satisfies Prisma.TestAttemptSelect;

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
      pendingPayment,
      enrollmentActivity,
      gradingBacklog,
    ] = await Promise.all([
      this.prisma.user.groupBy({ by: ['role'], _count: { _all: true } }),
      this.prisma.user.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.course.groupBy({ by: ['isPublished'], _count: { _all: true } }),
      this.prisma.classOffering.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.classOffering.findMany({
        where: {
          status: {
            in: [
              ClassOfferingStatus.DRAFT,
              ClassOfferingStatus.OPEN,
              ClassOfferingStatus.IN_PROGRESS,
            ],
          },
        },
        select: reportingClassSelect,
      }),
      this.prisma.enrollment.count({ where: { status: EnrollmentStatus.PENDING_PAYMENT } }),
      this.prisma.enrollment.findMany({
        where: { enrolledAt: { gte: period.start, lt: period.endExclusive } },
        select: {
          enrolledAt: true,
          classOffering: {
            select: {
              id: true,
              code: true,
              name: true,
              course: { select: { id: true, title: true } },
            },
          },
        },
      }),
      this.prisma.testAttempt.count({ where: this.backlogWhere() }),
    ]);

    const roleCounts = enumCounts(accountRoles, roles, 'role');
    const userStatusCounts = enumCounts(accountStatuses, userStatuses, 'status');
    const classCounts = enumCounts(classStatuses, classesByStatus, 'status');
    const published = coursePublication.find((row) => row.isPublished)?._count._all ?? 0;
    const draft = coursePublication.find((row) => !row.isPublished)?._count._all ?? 0;
    const projected = operationalClasses.map((offering) => this.projectClass(offering, now));
    const draftNotReady = projected.filter(
      (offering) =>
        offering.status === ClassOfferingStatus.DRAFT && !offering.operationalReadiness.isReady,
    ).length;
    const openFull = projected.filter(
      (offering) =>
        offering.status === ClassOfferingStatus.OPEN && offering.registrationState === 'FULL',
    ).length;
    const capacity = projected
      .filter(
        (offering) =>
          offering.status === ClassOfferingStatus.OPEN ||
          offering.status === ClassOfferingStatus.IN_PROGRESS,
      )
      .sort(compareCapacityRows);
    const daily = new Map(
      enumerateCalendarDays(period.from, period.to).map((date) => [date, { date, count: 0 }]),
    );
    const byClass = new Map<
      string,
      {
        classOfferingId: string;
        classCode: string;
        className: string;
        courseId: string;
        courseTitle: string;
        count: number;
      }
    >();
    for (const enrollment of enrollmentActivity) {
      const bucket = daily.get(vietnamDate(enrollment.enrolledAt));
      if (bucket) bucket.count += 1;
      const offering = enrollment.classOffering;
      const current = byClass.get(offering.id);
      if (current) current.count += 1;
      else
        byClass.set(offering.id, {
          classOfferingId: offering.id,
          classCode: offering.code,
          className: offering.name,
          courseId: offering.course.id,
          courseTitle: offering.course.title,
          count: 1,
        });
    }

    return {
      generatedAt: now.toISOString(),
      period: { from: period.from, to: period.to, days: period.days, timeZone: period.timeZone },
      actionQueues: { draftNotReady, openFull, pendingPayment, gradingBacklog },
      accounts: { total: sum(roleCounts), byRole: roleCounts, byStatus: userStatusCounts },
      courses: { total: published + draft, published, draft },
      classes: {
        total: sum(classCounts),
        byStatus: classCounts,
        capacity: {
          totalOperationalClasses: capacity.length,
          items: capacity.slice(0, capacityLimit).map(stripInternalClassFields),
          truncated: capacity.length > capacityLimit,
        },
      },
      enrollmentDemand: {
        totalNewEnrollments: enrollmentActivity.length,
        byClass: [...byClass.values()].sort(
          (left, right) =>
            right.count - left.count || left.classOfferingId.localeCompare(right.classOfferingId),
        ),
        daily: [...daily.values()],
      },
    };
  }

  async listClasses(query: AdminReportClassesQueryDto, now = new Date()) {
    if (query.readiness && query.status !== ClassOfferingStatus.DRAFT) {
      throw invalidFilter('readiness requires status=DRAFT');
    }
    if (query.registrationState && query.status !== ClassOfferingStatus.OPEN) {
      throw invalidFilter('registrationState requires status=OPEN');
    }
    const where: Prisma.ClassOfferingWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { code: { contains: query.search, mode: 'insensitive' } },
              { name: { contains: query.search, mode: 'insensitive' } },
              { course: { title: { contains: query.search, mode: 'insensitive' } } },
              { instructor: { fullName: { contains: query.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const candidates = await this.prisma.classOffering.findMany({
      where,
      select: reportingClassSelect,
      orderBy: [{ classStart: 'asc' }, { id: 'asc' }],
    });
    const filtered = candidates
      .map((offering) => this.projectClass(offering, now))
      .filter((offering) =>
        query.readiness
          ? offering.operationalReadiness.isReady === (query.readiness === 'READY')
          : true,
      )
      .filter((offering) =>
        query.registrationState ? offering.registrationState === query.registrationState : true,
      );
    return paginate(filtered.map(stripInternalClassFields), query.page, query.limit);
  }

  async listEnrollments(query: AdminReportEnrollmentsQueryDto) {
    const period = query.from || query.to ? resolveReportPeriod(query) : null;
    const where: Prisma.EnrollmentWhereInput = {
      ...(period ? { enrolledAt: { gte: period.start, lt: period.endExclusive } } : {}),
      ...(query.classOfferingId ? { classOfferingId: query.classOfferingId } : {}),
      ...(query.courseId ? { classOffering: { courseId: query.courseId } } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { learner: { fullName: { contains: query.search, mode: 'insensitive' } } },
              { learner: { email: { contains: query.search, mode: 'insensitive' } } },
              { classOffering: { code: { contains: query.search, mode: 'insensitive' } } },
              { classOffering: { name: { contains: query.search, mode: 'insensitive' } } },
              {
                classOffering: {
                  course: { title: { contains: query.search, mode: 'insensitive' } },
                },
              },
            ],
          }
        : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.enrollment.findMany({
        where,
        orderBy: [{ enrolledAt: 'desc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: {
          id: true,
          status: true,
          enrolledAt: true,
          learner: { select: { id: true, fullName: true, email: true } },
          classOffering: {
            select: {
              id: true,
              code: true,
              name: true,
              course: { select: { id: true, title: true } },
            },
          },
        },
      }),
      this.prisma.enrollment.count({ where }),
    ]);
    return {
      data: data.map(({ classOffering, ...row }) => ({
        ...row,
        classOffering: { id: classOffering.id, code: classOffering.code, name: classOffering.name },
        course: classOffering.course,
      })),
      meta: pageMeta(query.page, query.limit, total),
    };
  }

  async listGradingBacklog(query: AdminReportGradingBacklogQueryDto) {
    const where = this.backlogWhere({
      ...(query.classOfferingId
        ? { classAssessment: { classOfferingId: query.classOfferingId } }
        : {}),
      ...(query.classAssessmentId ? { classAssessmentId: query.classAssessmentId } : {}),
      ...(query.search
        ? {
            OR: [
              { learner: { fullName: { contains: query.search, mode: 'insensitive' } } },
              { learner: { email: { contains: query.search, mode: 'insensitive' } } },
              {
                classAssessment: {
                  classOffering: { code: { contains: query.search, mode: 'insensitive' } },
                },
              },
              {
                classAssessment: {
                  test: { title: { contains: query.search, mode: 'insensitive' } },
                },
              },
            ],
          }
        : {}),
    });
    const [candidates, total] = await this.prisma.$transaction([
      this.prisma.testAttempt.findMany({
        where,
        orderBy: [{ submittedAt: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: backlogAttemptSelect,
      }),
      this.prisma.testAttempt.count({ where }),
    ]);
    const rows = candidates.flatMap((attempt) => {
      const state = computeProductiveGradingState(attempt.answers);
      if (
        state.totalProductiveAnswers === 0 ||
        state.gradingState === 'REVIEWED_FINAL' ||
        !attempt.classAssessment
      )
        return [];
      const assessment = attempt.classAssessment;
      return [
        {
          attemptId: attempt.id,
          submittedAt: attempt.submittedAt,
          gradingState: state.gradingState,
          pendingProductiveAnswers: state.pendingProductiveAnswers,
          totalProductiveAnswers: state.totalProductiveAnswers,
          learner: attempt.learner,
          classOffering: {
            id: assessment.classOffering.id,
            code: assessment.classOffering.code,
            name: assessment.classOffering.name,
          },
          course: assessment.classOffering.course,
          instructor: assessment.classOffering.instructor,
          assessment: { id: assessment.id, title: assessment.test.title, stage: assessment.stage },
        },
      ];
    });
    return { data: rows, meta: pageMeta(query.page, query.limit, total) };
  }

  private projectClass(offering: ReportingClass, now: Date) {
    const registration = computeRegistrationState({
      status: offering.status,
      courseIsPublished: offering.course.isPublished,
      enrollmentStart: offering.enrollmentStart,
      enrollmentEnd: offering.enrollmentEnd,
      maxStudents: offering.maxStudents,
      registeredCount: offering._count.enrollments,
      now,
    });
    return {
      ...offering,
      activeEnrollments: offering._count.enrollments,
      remainingSeats: registration.remainingSeats,
      registrationState: registration.registrationState,
      operationalReadiness: computeOperationalReadiness({
        courseIsPublished: offering.course.isPublished,
        instructor: offering.instructor,
        classStart: offering.classStart,
        classEnd: offering.classEnd,
        scheduleSlots: offering.scheduleSlots,
      }),
    };
  }

  private backlogWhere(
    extraWhere: Prisma.TestAttemptWhereInput = {},
  ): Prisma.TestAttemptWhereInput {
    const productive = {
      testQuestion: { question: { responseType: { in: [...productiveResponseTypes] } } },
    } satisfies Prisma.TestAnswerWhereInput;
    return {
      status: TestAttemptStatus.SUBMITTED,
      classAssessmentId: { not: null },
      AND: [
        { answers: { some: productive } },
        {
          answers: {
            some: {
              ...productive,
              evaluations: {
                none: {
                  source: AnswerEvaluationSource.INSTRUCTOR,
                  status: 'REVIEWED_FINAL',
                },
              },
            },
          },
        },
      ],
      ...extraWhere,
    };
  }
}

type ProjectedClass = ReportingClass & {
  activeEnrollments: number;
  remainingSeats: number | null;
  registrationState: 'AVAILABLE' | 'FULL' | 'UPCOMING' | 'CLOSED';
  operationalReadiness: ReturnType<typeof computeOperationalReadiness>;
};

function stripInternalClassFields(offering: ProjectedClass) {
  return {
    id: offering.id,
    code: offering.code,
    name: offering.name,
    status: offering.status,
    course: { id: offering.course.id, title: offering.course.title },
    instructor: offering.instructor
      ? { id: offering.instructor.id, fullName: offering.instructor.fullName }
      : null,
    activeEnrollments: offering.activeEnrollments,
    maxStudents: offering.maxStudents,
    remainingSeats: offering.remainingSeats,
    registrationState: offering.registrationState,
    operationalReadiness: offering.operationalReadiness,
    classStart: offering.classStart,
  };
}

function compareCapacityRows(left: ProjectedClass, right: ProjectedClass) {
  const full =
    Number(right.registrationState === 'FULL') - Number(left.registrationState === 'FULL');
  if (full) return full;
  const leftStart = left.classStart?.getTime() ?? Number.MAX_SAFE_INTEGER;
  const rightStart = right.classStart?.getTime() ?? Number.MAX_SAFE_INTEGER;
  return (
    leftStart - rightStart ||
    right.activeEnrollments - left.activeEnrollments ||
    left.id.localeCompare(right.id)
  );
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

function pageMeta(page: number, limit: number, total: number) {
  return { page, limit, total, totalPages: total === 0 ? 0 : Math.ceil(total / limit) };
}

function paginate<T>(data: T[], page: number, limit: number) {
  const start = (page - 1) * limit;
  return { data: data.slice(start, start + limit), meta: pageMeta(page, limit, data.length) };
}

function invalidFilter(message: string) {
  return new BadRequestException({ code: 'REPORT_FILTER_INVALID', message });
}
