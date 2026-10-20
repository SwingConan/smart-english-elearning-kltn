import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  ClassModality,
  ClassOfferingStatus,
  EnrollmentStatus,
  Prisma,
  PricingType,
} from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { CreateClassOfferingDto } from './dto/create-class-offering.dto';
import { AdminClassOfferingQueryDto } from './dto/admin-class-offering-query.dto';
import { UpdateClassOfferingDto } from './dto/update-class-offering.dto';
import { computeRegistrationState } from './registration-state';
import { computeOperationalReadiness, projectScheduleSlot } from './class-operations';

interface OfferingRules {
  pricingType: PricingType;
  tuitionFeeVnd?: number | null;
  maxStudents?: number | null;
  enrollmentStart?: Date | null;
  enrollmentEnd?: Date | null;
  classStart?: Date | null;
  classEnd?: Date | null;
}

const adminOfferingInclude = {
  course: { select: { id: true, title: true, slug: true, isPublished: true } },
  instructor: {
    select: { id: true, fullName: true, email: true, role: true, status: true },
  },
  scheduleSlots: {
    orderBy: [{ dayOfWeek: 'asc' as const }, { startTime: 'asc' as const }],
    select: {
      id: true,
      dayOfWeek: true,
      startTime: true,
      endTime: true,
      locationText: true,
      meetingUrl: true,
    },
  },
  _count: {
    select: { enrollments: { where: { status: EnrollmentStatus.ACTIVE } } },
  },
} satisfies Prisma.ClassOfferingInclude;

type AdminOfferingRow = Prisma.ClassOfferingGetPayload<{ include: typeof adminOfferingInclude }>;

const publicOfferingDetailSelect = {
  id: true,
  code: true,
  name: true,
  status: true,
  modality: true,
  pricingType: true,
  tuitionFeeVnd: true,
  maxStudents: true,
  totalSessions: true,
  totalPeriods: true,
  enrollmentStart: true,
  enrollmentEnd: true,
  classStart: true,
  classEnd: true,
  course: {
    select: {
      id: true,
      title: true,
      slug: true,
      description: true,
      level: true,
      skillScope: true,
      modules: {
        orderBy: { orderIndex: 'asc' as const },
        select: {
          id: true,
          title: true,
          orderIndex: true,
          _count: { select: { lessons: true } },
        },
      },
    },
  },
  instructor: { select: { id: true, fullName: true } },
  scheduleSlots: {
    orderBy: [{ dayOfWeek: 'asc' as const }, { startTime: 'asc' as const }],
    select: {
      id: true,
      dayOfWeek: true,
      startTime: true,
      endTime: true,
      locationText: true,
    },
  },
  _count: {
    select: {
      enrollments: { where: { status: EnrollmentStatus.ACTIVE } },
    },
  },
} satisfies Prisma.ClassOfferingSelect;

const allowedStatusTransitions: Record<ClassOfferingStatus, readonly ClassOfferingStatus[]> = {
  [ClassOfferingStatus.DRAFT]: [
    ClassOfferingStatus.DRAFT,
    ClassOfferingStatus.OPEN,
    ClassOfferingStatus.CANCELLED,
  ],
  [ClassOfferingStatus.OPEN]: [
    ClassOfferingStatus.OPEN,
    ClassOfferingStatus.IN_PROGRESS,
    ClassOfferingStatus.CANCELLED,
  ],
  [ClassOfferingStatus.IN_PROGRESS]: [
    ClassOfferingStatus.IN_PROGRESS,
    ClassOfferingStatus.COMPLETED,
    ClassOfferingStatus.CANCELLED,
  ],
  [ClassOfferingStatus.COMPLETED]: [ClassOfferingStatus.COMPLETED],
  [ClassOfferingStatus.CANCELLED]: [ClassOfferingStatus.CANCELLED],
};

@Injectable()
export class ClassOfferingsService {
  constructor(private readonly prisma: PrismaService) {}

  async listAdmin(query: AdminClassOfferingQueryDto) {
    const where: Prisma.ClassOfferingWhereInput = {
      ...(query.search
        ? {
            OR: [
              { code: { contains: query.search, mode: 'insensitive' } },
              { name: { contains: query.search, mode: 'insensitive' } },
              { course: { title: { contains: query.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
      ...(query.courseId ? { courseId: query.courseId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.modality ? { modality: query.modality } : {}),
      ...(query.pricingType ? { pricingType: query.pricingType } : {}),
    };
    const skip = (query.page - 1) * query.limit;
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.classOffering.findMany({
        where,
        include: adminOfferingInclude,
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        skip,
        take: query.limit,
      }),
      this.prisma.classOffering.count({ where }),
    ]);
    return {
      data: rows.map((row) => this.mapAdminOffering(row)),
      meta: {
        total,
        page: query.page,
        limit: query.limit,
        totalPages: total === 0 ? 0 : Math.ceil(total / query.limit),
      },
    };
  }

  async getAdminById(id: string) {
    const offering = await this.prisma.classOffering.findUnique({
      where: { id },
      include: adminOfferingInclude,
    });
    if (!offering) throw new NotFoundException('Class offering not found');
    return this.mapAdminOffering(offering);
  }

  async getPublicById(id: string) {
    const offering = await this.prisma.classOffering.findFirst({
      where: {
        id,
        status: { in: [ClassOfferingStatus.OPEN, ClassOfferingStatus.IN_PROGRESS] },
        course: { isPublished: true },
      },
      select: publicOfferingDetailSelect,
    });
    if (!offering) {
      throw new NotFoundException('Class offering not found');
    }

    const availability = computeRegistrationState({
      status: offering.status,
      courseIsPublished: true,
      enrollmentStart: offering.enrollmentStart,
      enrollmentEnd: offering.enrollmentEnd,
      maxStudents: offering.maxStudents,
      registeredCount: offering._count.enrollments,
      now: new Date(),
    });

    return {
      ...offering,
      scheduleSlots: offering.scheduleSlots.map((slot) => ({
        id: slot.id,
        dayOfWeek: slot.dayOfWeek,
        startTime: slot.startTime,
        endTime: slot.endTime,
        locationText: slot.locationText,
      })),
      course: {
        ...offering.course,
        modules: offering.course.modules.map((module) => ({
          id: module.id,
          title: module.title,
          orderIndex: module.orderIndex,
          lessonCount: module._count.lessons,
        })),
      },
      registeredCount: availability.registeredCount,
      remainingSeats: availability.remainingSeats,
      isFull: availability.isFull,
      registrationState: availability.registrationState,
      _count: undefined,
    };
  }

  async create(input: CreateClassOfferingDto) {
    await this.validateCourse(input.courseId);

    const pricingType = input.pricingType ?? PricingType.FREE;
    this.validateRules({ ...input, pricingType });

    const created = await this.prisma.classOffering.create({
      data: {
        courseId: input.courseId,
        code: input.code?.trim() || this.createCompatibilityCode(),
        name: input.name.trim(),
        status: ClassOfferingStatus.DRAFT,
        modality: input.modality ?? ClassModality.ONLINE,
        pricingType,
        tuitionFeeVnd: input.tuitionFeeVnd,
        maxStudents: input.maxStudents,
        totalSessions: input.totalSessions,
        totalPeriods: input.totalPeriods,
        enrollmentStart: input.enrollmentStart,
        enrollmentEnd: input.enrollmentEnd,
        classStart: input.classStart,
        classEnd: input.classEnd,
      },
      include: adminOfferingInclude,
    });
    return this.mapAdminOffering(created);
  }

  async update(id: string, input: UpdateClassOfferingDto) {
    const current = await this.prisma.classOffering.findUnique({
      where: { id },
      include: adminOfferingInclude,
    });
    if (!current) {
      throw new NotFoundException('Class offering not found');
    }

    if (input.courseId !== undefined) {
      await this.validateCourse(input.courseId);
    }
    if (input.status !== undefined) this.validateStatusTransition(current.status, input.status);

    if (input.status === ClassOfferingStatus.OPEN && current.status !== ClassOfferingStatus.OPEN) {
      const course =
        input.courseId && input.courseId !== current.courseId
          ? await this.prisma.course.findUnique({
              where: { id: input.courseId },
              select: { isPublished: true },
            })
          : current.course;
      const readiness = computeOperationalReadiness({
        courseIsPublished: Boolean(course?.isPublished),
        instructor: current.instructor,
        classStart: input.classStart !== undefined ? input.classStart : current.classStart,
        classEnd: input.classEnd !== undefined ? input.classEnd : current.classEnd,
        scheduleSlots: current.scheduleSlots,
      });
      if (!readiness.isReady) {
        throw new BadRequestException({
          code: 'CLASS_NOT_READY',
          message: 'Class offering is not ready to open',
          missing: readiness.missing,
        });
      }
    }

    this.validateRules({
      pricingType: input.pricingType ?? current.pricingType,
      tuitionFeeVnd:
        input.tuitionFeeVnd !== undefined ? input.tuitionFeeVnd : current.tuitionFeeVnd,
      maxStudents: input.maxStudents !== undefined ? input.maxStudents : current.maxStudents,
      enrollmentStart:
        input.enrollmentStart !== undefined ? input.enrollmentStart : current.enrollmentStart,
      enrollmentEnd:
        input.enrollmentEnd !== undefined ? input.enrollmentEnd : current.enrollmentEnd,
      classStart: input.classStart !== undefined ? input.classStart : current.classStart,
      classEnd: input.classEnd !== undefined ? input.classEnd : current.classEnd,
    });

    const updated = await this.prisma.classOffering.update({
      where: { id },
      data: {
        ...(input.courseId !== undefined ? { courseId: input.courseId } : {}),
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.code !== undefined ? { code: input.code.trim() } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.modality !== undefined ? { modality: input.modality } : {}),
        ...(input.pricingType !== undefined ? { pricingType: input.pricingType } : {}),
        ...(input.tuitionFeeVnd !== undefined ? { tuitionFeeVnd: input.tuitionFeeVnd } : {}),
        ...(input.maxStudents !== undefined ? { maxStudents: input.maxStudents } : {}),
        ...(input.totalSessions !== undefined ? { totalSessions: input.totalSessions } : {}),
        ...(input.totalPeriods !== undefined ? { totalPeriods: input.totalPeriods } : {}),
        ...(input.enrollmentStart !== undefined ? { enrollmentStart: input.enrollmentStart } : {}),
        ...(input.enrollmentEnd !== undefined ? { enrollmentEnd: input.enrollmentEnd } : {}),
        ...(input.classStart !== undefined ? { classStart: input.classStart } : {}),
        ...(input.classEnd !== undefined ? { classEnd: input.classEnd } : {}),
      },
      include: adminOfferingInclude,
    });
    return this.mapAdminOffering(updated);
  }

  private async validateCourse(courseId: string): Promise<void> {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      select: { id: true },
    });
    if (!course) {
      throw new BadRequestException('Course does not exist');
    }
  }

  private mapAdminOffering(offering: AdminOfferingRow) {
    const { _count, ...publicFields } = offering;
    const availability = computeRegistrationState({
      status: offering.status,
      courseIsPublished: offering.course.isPublished,
      enrollmentStart: offering.enrollmentStart,
      enrollmentEnd: offering.enrollmentEnd,
      maxStudents: offering.maxStudents,
      registeredCount: _count.enrollments,
      now: new Date(),
    });
    const operationalReadiness = computeOperationalReadiness({
      courseIsPublished: offering.course.isPublished,
      instructor: offering.instructor,
      classStart: offering.classStart,
      classEnd: offering.classEnd,
      scheduleSlots: offering.scheduleSlots,
    });
    return {
      ...publicFields,
      scheduleSlots: offering.scheduleSlots.map(projectScheduleSlot),
      registeredCount: availability.registeredCount,
      remainingSeats: availability.remainingSeats,
      isFull: availability.isFull,
      registrationState: availability.registrationState,
      operationalReadiness,
    };
  }

  private validateStatusTransition(
    current: ClassOfferingStatus,
    target: ClassOfferingStatus,
  ): void {
    if (allowedStatusTransitions[current].includes(target)) return;
    throw new BadRequestException({
      code: 'CLASS_STATUS_TRANSITION_NOT_ALLOWED',
      message: `Class status cannot transition from ${current} to ${target}`,
    });
  }

  private validateRules(input: OfferingRules): void {
    if (
      input.pricingType === PricingType.FREE &&
      input.tuitionFeeVnd !== undefined &&
      input.tuitionFeeVnd !== null &&
      input.tuitionFeeVnd !== 0
    ) {
      throw new BadRequestException('A free offering cannot have tuition');
    }

    if (
      input.pricingType === PricingType.PAID &&
      (input.tuitionFeeVnd === undefined ||
        input.tuitionFeeVnd === null ||
        input.tuitionFeeVnd <= 0)
    ) {
      throw new BadRequestException('A paid offering requires positive tuition');
    }

    if (input.maxStudents !== undefined && input.maxStudents !== null) {
      if (!Number.isInteger(input.maxStudents) || input.maxStudents <= 0) {
        throw new BadRequestException('maxStudents must be a positive integer');
      }
    }

    if (
      input.enrollmentStart &&
      input.enrollmentEnd &&
      input.enrollmentStart > input.enrollmentEnd
    ) {
      throw new BadRequestException('enrollmentStart must be before or equal to enrollmentEnd');
    }

    if (input.classStart && input.classEnd && input.classStart >= input.classEnd) {
      throw new BadRequestException('classStart must be before classEnd');
    }
  }

  private createCompatibilityCode(): string {
    return `CLS-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`.toUpperCase();
  }
}
