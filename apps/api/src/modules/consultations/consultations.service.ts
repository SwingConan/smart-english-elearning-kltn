import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConsultationStatus, EnrollmentStatus } from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { CreateConsultationDto, UpdateConsultationDto } from './consultations.dto';

const studentConsultationSelect = {
  id: true,
  enrollmentId: true,
  topic: true,
  learnerNote: true,
  requestedStartAt: true,
  confirmedStartAt: true,
  durationMinutes: true,
  status: true,
  meetingUrl: true,
  declineReason: true,
  cancelledAt: true,
  completedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class ConsultationsService {
  constructor(private readonly prisma: PrismaService) {}

  async listMine(learnerId: string, enrollmentId: string) {
    await this.requireOwnedEnrollment(learnerId, enrollmentId);
    const rows = await this.prisma.consultationRequest.findMany({
      where: { enrollmentId },
      select: studentConsultationSelect,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => this.studentView(row));
  }

  async create(learnerId: string, enrollmentId: string, input: CreateConsultationDto) {
    const enrollment = await this.requireOwnedEnrollment(learnerId, enrollmentId);
    if (enrollment.status !== EnrollmentStatus.ACTIVE)
      throw new BadRequestException('Only active enrollments may request a consultation');
    if (!enrollment.classOffering.instructorId)
      throw new BadRequestException('This class has no assigned instructor');
    const start = new Date(input.requestedStartAt);
    if (start.getTime() <= Date.now())
      throw new BadRequestException('Consultation time must be in the future');
    const created = await this.prisma.consultationRequest.create({
      data: {
        enrollmentId,
        instructorId: enrollment.classOffering.instructorId,
        topic: input.topic.trim(),
        learnerNote: input.learnerNote?.trim() || null,
        requestedStartAt: start,
        durationMinutes: input.durationMinutes,
      },
      select: studentConsultationSelect,
    });
    return this.studentView(created);
  }

  async cancel(learnerId: string, enrollmentId: string, id: string) {
    await this.requireOwnedEnrollment(learnerId, enrollmentId);
    const changed = await this.prisma.consultationRequest.updateMany({
      where: {
        id,
        enrollmentId,
        status: { in: [ConsultationStatus.REQUESTED, ConsultationStatus.CONFIRMED] },
      },
      data: { status: ConsultationStatus.CANCELLED, cancelledAt: new Date() },
    });
    if (changed.count !== 1) throw new ConflictException('Consultation can no longer be cancelled');
    const cancelled = await this.prisma.consultationRequest.findUniqueOrThrow({
      where: { id },
      select: studentConsultationSelect,
    });
    return this.studentView(cancelled);
  }

  async listForInstructor(instructorId: string, classOfferingId: string) {
    await this.requireAssignedInstructor(instructorId, classOfferingId);
    return this.prisma.consultationRequest.findMany({
      where: { instructorId, enrollment: { classOfferingId } },
      include: {
        enrollment: {
          select: { id: true, learner: { select: { id: true, fullName: true, email: true } } },
        },
      },
      orderBy: { requestedStartAt: 'asc' },
    });
  }

  async update(
    instructorId: string,
    classOfferingId: string,
    id: string,
    input: UpdateConsultationDto,
  ) {
    await this.requireAssignedInstructor(instructorId, classOfferingId);
    const current = await this.prisma.consultationRequest.findFirst({
      where: { id, instructorId, enrollment: { classOfferingId } },
    });
    if (!current) throw new NotFoundException('Consultation not found');
    const allowed =
      (current.status === ConsultationStatus.REQUESTED &&
        (input.status === ConsultationStatus.CONFIRMED ||
          input.status === ConsultationStatus.DECLINED)) ||
      (current.status === ConsultationStatus.CONFIRMED &&
        (input.status === ConsultationStatus.CONFIRMED ||
          input.status === ConsultationStatus.COMPLETED));
    if (!allowed) throw new ConflictException('Unsupported consultation transition');
    if (
      input.status === ConsultationStatus.CONFIRMED &&
      !input.confirmedStartAt &&
      !current.confirmedStartAt
    )
      throw new BadRequestException('confirmedStartAt is required');
    if (input.status === ConsultationStatus.DECLINED && !input.declineReason?.trim())
      throw new BadRequestException('declineReason is required');
    const changed = await this.prisma.consultationRequest.updateMany({
      where: { id, status: current.status, updatedAt: current.updatedAt },
      data: {
        status: input.status,
        confirmedStartAt: input.confirmedStartAt ? new Date(input.confirmedStartAt) : undefined,
        durationMinutes: input.durationMinutes,
        meetingUrl: input.meetingUrl?.trim(),
        instructorNote: input.instructorNote?.trim(),
        declineReason: input.declineReason?.trim(),
        completedAt: input.status === ConsultationStatus.COMPLETED ? new Date() : undefined,
      },
    });
    if (changed.count !== 1) throw new ConflictException('Consultation changed; reload and retry');
    return this.prisma.consultationRequest.findUnique({ where: { id } });
  }

  private requireOwnedEnrollment(learnerId: string, id: string) {
    return this.prisma.enrollment
      .findFirst({
        where: { id, learnerId },
        select: { id: true, status: true, classOffering: { select: { instructorId: true } } },
      })
      .then((row) => {
        if (!row) throw new NotFoundException('Enrollment not found');
        return row;
      });
  }

  private studentView<T extends { status: ConsultationStatus; meetingUrl: string | null }>(row: T) {
    return {
      ...row,
      meetingUrl: row.status === ConsultationStatus.CONFIRMED ? row.meetingUrl : null,
    };
  }

  private async requireAssignedInstructor(instructorId: string, classOfferingId: string) {
    const row = await this.prisma.classOffering.findFirst({
      where: { id: classOfferingId, instructorId },
      select: { id: true },
    });
    if (!row) throw new NotFoundException('Assigned class not found');
  }
}
