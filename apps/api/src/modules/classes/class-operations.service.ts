import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ClassOfferingStatus,
  EnrollmentStatus,
  Prisma,
  UserRole,
  UserStatus,
} from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import {
  hasScheduleDestination,
  parseWallClockTime,
  projectScheduleSlot,
  scheduleRangesOverlap,
  wallClockMinutes,
} from './class-operations';
import { ClassOfferingsService } from './class-offerings.service';
import {
  AdminRosterQueryDto,
  CreateScheduleSlotDto,
  InstructorOptionQueryDto,
  UpdateRosterStatusDto,
  UpdateScheduleSlotDto,
} from './dto/class-operations.dto';

const mutableScheduleStatuses: ClassOfferingStatus[] = [
  ClassOfferingStatus.DRAFT,
  ClassOfferingStatus.OPEN,
  ClassOfferingStatus.IN_PROGRESS,
];

@Injectable()
export class ClassOperationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly classOfferings: ClassOfferingsService,
  ) {}

  async listInstructorOptions(query: InstructorOptionQueryDto) {
    const where: Prisma.UserWhereInput = {
      role: UserRole.INSTRUCTOR,
      status: UserStatus.ACTIVE,
      ...(query.search
        ? {
            OR: [
              { fullName: { contains: query.search, mode: 'insensitive' } },
              { email: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: { id: true, fullName: true, email: true },
        orderBy: [{ fullName: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.user.count({ where }),
    ]);
    return {
      data,
      meta: {
        total,
        page: query.page,
        limit: query.limit,
        totalPages: total === 0 ? 0 : Math.ceil(total / query.limit),
      },
    };
  }

  async assignInstructor(classOfferingId: string, instructorId: string | null) {
    const offering = await this.requireOffering(classOfferingId);
    if (
      offering.status === ClassOfferingStatus.COMPLETED ||
      offering.status === ClassOfferingStatus.CANCELLED
    ) {
      throw new BadRequestException('Instructor assignment is locked for this class status');
    }
    if (instructorId === null && offering.status === ClassOfferingStatus.IN_PROGRESS) {
      throw new BadRequestException('An in-progress class cannot be left without an instructor');
    }
    if (instructorId) await this.requireActiveInstructor(instructorId);

    await this.prisma.classOffering.update({
      where: { id: classOfferingId },
      data: { instructorId },
    });
    return this.classOfferings.getAdminById(classOfferingId);
  }

  async listScheduleSlots(classOfferingId: string) {
    await this.requireOffering(classOfferingId);
    const rows = await this.prisma.classScheduleSlot.findMany({
      where: { classOfferingId },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }, { id: 'asc' }],
    });
    return rows.map(projectScheduleSlot);
  }

  async createScheduleSlot(classOfferingId: string, input: CreateScheduleSlotDto) {
    const offering = await this.requireOffering(classOfferingId);
    this.assertScheduleMutable(offering.status);
    const normalized = this.normalizeScheduleInput(input);
    await this.assertNoScheduleOverlap(classOfferingId, normalized);
    const created = await this.prisma.classScheduleSlot.create({
      data: { classOfferingId, ...normalized },
    });
    return projectScheduleSlot(created);
  }

  async updateScheduleSlot(classOfferingId: string, slotId: string, input: UpdateScheduleSlotDto) {
    const offering = await this.requireOffering(classOfferingId);
    this.assertScheduleMutable(offering.status);
    const current = await this.prisma.classScheduleSlot.findFirst({
      where: { id: slotId, classOfferingId },
    });
    if (!current) throw new NotFoundException('Schedule slot not found');
    const normalized = this.normalizeScheduleInput({
      dayOfWeek: input.dayOfWeek ?? current.dayOfWeek,
      startTime: input.startTime ?? projectScheduleSlot(current).startTime,
      endTime: input.endTime ?? projectScheduleSlot(current).endTime,
      locationText: input.locationText !== undefined ? input.locationText : current.locationText,
      meetingUrl: input.meetingUrl !== undefined ? input.meetingUrl : current.meetingUrl,
    });
    await this.assertNoScheduleOverlap(classOfferingId, normalized, slotId);
    const updated = await this.prisma.classScheduleSlot.update({
      where: { id: slotId },
      data: normalized,
    });
    return projectScheduleSlot(updated);
  }

  async deleteScheduleSlot(classOfferingId: string, slotId: string) {
    const offering = await this.requireOffering(classOfferingId);
    this.assertScheduleMutable(offering.status);
    const slot = await this.prisma.classScheduleSlot.findFirst({
      where: { id: slotId, classOfferingId },
      select: { id: true },
    });
    if (!slot) throw new NotFoundException('Schedule slot not found');
    await this.prisma.classScheduleSlot.delete({ where: { id: slotId } });
    return { deleted: true, id: slotId };
  }

  async listRoster(classOfferingId: string, query: AdminRosterQueryDto) {
    const classOffering = await this.classOfferings.getAdminById(classOfferingId);
    const where: Prisma.EnrollmentWhereInput = {
      classOfferingId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            learner: {
              OR: [
                { fullName: { contains: query.search, mode: 'insensitive' } },
                { email: { contains: query.search, mode: 'insensitive' } },
              ],
            },
          }
        : {}),
    };
    const summaryWhere: Prisma.EnrollmentWhereInput = { classOfferingId };
    const [data, total, counts] = await this.prisma.$transaction([
      this.prisma.enrollment.findMany({
        where,
        select: {
          id: true,
          status: true,
          enrolledAt: true,
          learner: { select: { id: true, fullName: true, email: true } },
        },
        orderBy: [{ learner: { fullName: 'asc' } }, { id: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.enrollment.count({ where }),
      this.prisma.enrollment.groupBy({
        by: ['status'],
        where: summaryWhere,
        orderBy: { status: 'asc' },
        _count: { id: true },
      }),
    ]);
    const byStatus = Object.fromEntries(
      Object.values(EnrollmentStatus).map((status) => [status, 0]),
    ) as Record<EnrollmentStatus, number>;
    const statusCounts = counts as Array<{ status: EnrollmentStatus; _count: { id: number } }>;
    for (const count of statusCounts) byStatus[count.status] = count._count.id;
    const enrollmentTotal = Object.values(byStatus).reduce((sum, value) => sum + value, 0);
    return {
      classOffering,
      summary: {
        total: enrollmentTotal,
        active: byStatus.ACTIVE,
        pendingPayment: byStatus.PENDING_PAYMENT,
        completed: byStatus.COMPLETED,
        droppedOrCancelled: byStatus.DROPPED + byStatus.CANCELLED,
        maxStudents: classOffering.maxStudents,
      },
      data,
      meta: {
        total,
        page: query.page,
        limit: query.limit,
        totalPages: total === 0 ? 0 : Math.ceil(total / query.limit),
      },
    };
  }

  async updateRosterStatus(
    classOfferingId: string,
    enrollmentId: string,
    input: UpdateRosterStatusDto,
  ) {
    await this.requireOffering(classOfferingId);
    const enrollment = await this.prisma.enrollment.findFirst({
      where: { id: enrollmentId, classOfferingId },
      select: { id: true, status: true },
    });
    if (!enrollment) throw new NotFoundException('Enrollment not found in this class');
    const allowed =
      (enrollment.status === EnrollmentStatus.ACTIVE &&
        [EnrollmentStatus.DROPPED, EnrollmentStatus.CANCELLED].includes(input.status)) ||
      (enrollment.status === EnrollmentStatus.PENDING_PAYMENT &&
        input.status === EnrollmentStatus.CANCELLED);
    if (!allowed) throw new BadRequestException('Unsupported enrollment status transition');

    const changed = await this.prisma.enrollment.updateMany({
      where: { id: enrollmentId, classOfferingId, status: enrollment.status },
      data: { status: input.status },
    });
    if (changed.count !== 1) throw new ConflictException('Enrollment changed; reload and retry');
    const updated = await this.prisma.enrollment.findUnique({
      where: { id: enrollmentId },
      select: {
        id: true,
        status: true,
        enrolledAt: true,
        learner: { select: { id: true, fullName: true, email: true } },
      },
    });
    return {
      enrollment: updated,
      classOffering: await this.classOfferings.getAdminById(classOfferingId),
    };
  }

  private async requireOffering(id: string) {
    const offering = await this.prisma.classOffering.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!offering) throw new NotFoundException('Class offering not found');
    return offering;
  }

  private async requireActiveInstructor(id: string): Promise<void> {
    const instructor = await this.prisma.user.findUnique({
      where: { id },
      select: { role: true, status: true },
    });
    if (
      !instructor ||
      instructor.role !== UserRole.INSTRUCTOR ||
      instructor.status !== UserStatus.ACTIVE
    ) {
      throw new BadRequestException('Assigned user must be an active instructor');
    }
  }

  private assertScheduleMutable(status: ClassOfferingStatus): void {
    if (!mutableScheduleStatuses.includes(status)) {
      throw new BadRequestException('Schedule is locked for this class status');
    }
  }

  private normalizeScheduleInput(input: CreateScheduleSlotDto) {
    const startTime = parseWallClockTime(input.startTime);
    const endTime = parseWallClockTime(input.endTime);
    if (!startTime || !endTime || wallClockMinutes(startTime) >= wallClockMinutes(endTime)) {
      throw new BadRequestException('Schedule start time must be before end time');
    }
    const locationText = input.locationText?.trim() || null;
    const meetingUrl = input.meetingUrl?.trim() || null;
    if (!hasScheduleDestination({ locationText, meetingUrl })) {
      throw new BadRequestException('A schedule slot requires a location or meeting link');
    }
    if (meetingUrl) {
      let parsed: URL;
      try {
        parsed = new URL(meetingUrl);
      } catch {
        throw new BadRequestException('Meeting link must be a valid HTTP(S) URL');
      }
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new BadRequestException('Meeting link must be a valid HTTP(S) URL');
      }
    }
    return { dayOfWeek: input.dayOfWeek, startTime, endTime, locationText, meetingUrl };
  }

  private async assertNoScheduleOverlap(
    classOfferingId: string,
    candidate: { dayOfWeek: number; startTime: Date; endTime: Date },
    ignoredId?: string,
  ): Promise<void> {
    const rows = await this.prisma.classScheduleSlot.findMany({
      where: {
        classOfferingId,
        dayOfWeek: candidate.dayOfWeek,
        ...(ignoredId ? { id: { not: ignoredId } } : {}),
      },
      select: { startTime: true, endTime: true },
    });
    if (
      rows.some((row) =>
        scheduleRangesOverlap(candidate.startTime, candidate.endTime, row.startTime, row.endTime),
      )
    ) {
      throw new BadRequestException('Schedule slot overlaps another slot on the same day');
    }
  }
}
