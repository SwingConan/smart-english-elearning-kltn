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

  async studentThread(learnerId: string, enrollmentId: string) {
    const enrollment = await this.requireOwnedEnrollmentDetail(learnerId, enrollmentId);
    const thread = await this.ensureThread(enrollmentId);
    const [messages, appointments] = await Promise.all([
      this.threadMessages(thread.id),
      this.prisma.consultationRequest.findMany({
        where: { enrollmentId },
        select: studentConsultationSelect,
        orderBy: { createdAt: 'asc' },
      }),
    ]);
    const unreadCount = messages.filter(
      (message) =>
        message.senderId !== learnerId &&
        (!thread.learnerLastReadAt || message.createdAt > thread.learnerLastReadAt),
    ).length;
    return {
      id: thread.id,
      enrollment: {
        id: enrollment.id,
        status: enrollment.status,
        classOffering: enrollment.classOffering,
      },
      messages,
      appointments: appointments.map((row) => this.studentView(row)),
      unreadCount,
    };
  }

  async sendStudentMessage(learnerId: string, enrollmentId: string, body: string) {
    const enrollment = await this.requireOwnedEnrollment(learnerId, enrollmentId);
    if (enrollment.status !== EnrollmentStatus.ACTIVE) {
      throw new BadRequestException('Chỉ ghi danh đang hoạt động mới có thể gửi tin nhắn.');
    }
    return this.createMessage(await this.ensureThread(enrollmentId), learnerId, body);
  }

  async markStudentRead(learnerId: string, enrollmentId: string) {
    await this.requireOwnedEnrollment(learnerId, enrollmentId);
    const thread = await this.ensureThread(enrollmentId);
    await this.prisma.consultationThread.update({
      where: { id: thread.id },
      data: { learnerLastReadAt: new Date() },
    });
    return { read: true };
  }

  async instructorInbox(instructorId: string, classOfferingId: string) {
    await this.requireAssignedInstructor(instructorId, classOfferingId);
    const enrollments = await this.prisma.enrollment.findMany({
      where: {
        classOfferingId,
        status: { in: [EnrollmentStatus.ACTIVE, EnrollmentStatus.COMPLETED] },
      },
      select: {
        id: true,
        status: true,
        learner: { select: { id: true, fullName: true, email: true, avatarKey: true } },
        consultationThread: {
          select: {
            id: true,
            instructorLastReadAt: true,
            messages: {
              orderBy: { createdAt: 'desc' },
              take: 1,
              select: { body: true, createdAt: true, senderId: true },
            },
          },
        },
        consultationRequests: {
          where: { status: { in: [ConsultationStatus.REQUESTED, ConsultationStatus.CONFIRMED] } },
          orderBy: { requestedStartAt: 'asc' },
          take: 1,
          select: { id: true, status: true, requestedStartAt: true, confirmedStartAt: true },
        },
      },
      orderBy: { learner: { fullName: 'asc' } },
    });
    return Promise.all(
      enrollments.map(async (enrollment) => {
        const thread = enrollment.consultationThread;
        const unreadCount = thread
          ? await this.prisma.consultationMessage.count({
              where: {
                threadId: thread.id,
                senderId: enrollment.learner.id,
                ...(thread.instructorLastReadAt
                  ? { createdAt: { gt: thread.instructorLastReadAt } }
                  : {}),
              },
            })
          : 0;
        return {
          enrollmentId: enrollment.id,
          status: enrollment.status,
          learner: enrollment.learner,
          lastMessage: thread?.messages[0] ?? null,
          unreadCount,
          appointment: enrollment.consultationRequests[0] ?? null,
        };
      }),
    );
  }

  async instructorThread(instructorId: string, classOfferingId: string, enrollmentId: string) {
    const enrollment = await this.requireInstructorEnrollment(
      instructorId,
      classOfferingId,
      enrollmentId,
    );
    const thread = await this.ensureThread(enrollmentId);
    const [messages, appointments] = await Promise.all([
      this.threadMessages(thread.id),
      this.prisma.consultationRequest.findMany({
        where: { enrollmentId, instructorId },
        orderBy: { createdAt: 'asc' },
      }),
    ]);
    return { id: thread.id, enrollment, messages, appointments };
  }

  async sendInstructorMessage(
    instructorId: string,
    classOfferingId: string,
    enrollmentId: string,
    body: string,
  ) {
    await this.requireInstructorEnrollment(instructorId, classOfferingId, enrollmentId);
    return this.createMessage(await this.ensureThread(enrollmentId), instructorId, body);
  }

  async markInstructorRead(instructorId: string, classOfferingId: string, enrollmentId: string) {
    await this.requireInstructorEnrollment(instructorId, classOfferingId, enrollmentId);
    const thread = await this.ensureThread(enrollmentId);
    await this.prisma.consultationThread.update({
      where: { id: thread.id },
      data: { instructorLastReadAt: new Date() },
    });
    return { read: true };
  }

  private ensureThread(enrollmentId: string) {
    return this.prisma.consultationThread.upsert({
      where: { enrollmentId },
      create: { enrollmentId },
      update: {},
    });
  }

  private threadMessages(threadId: string) {
    return this.prisma.consultationMessage.findMany({
      where: { threadId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        senderId: true,
        body: true,
        createdAt: true,
        sender: { select: { id: true, fullName: true, role: true, avatarKey: true } },
      },
    });
  }

  private createMessage(thread: { id: string }, senderId: string, rawBody: string) {
    const body = rawBody.trim();
    if (!body) throw new BadRequestException('Tin nhắn không được để trống.');
    return this.prisma.consultationMessage.create({
      data: { threadId: thread.id, senderId, body },
      select: {
        id: true,
        senderId: true,
        body: true,
        createdAt: true,
        sender: { select: { id: true, fullName: true, role: true, avatarKey: true } },
      },
    });
  }

  private requireOwnedEnrollmentDetail(learnerId: string, id: string) {
    return this.prisma.enrollment
      .findFirst({
        where: { id, learnerId },
        select: {
          id: true,
          status: true,
          classOffering: {
            select: {
              id: true,
              name: true,
              code: true,
              instructorId: true,
              instructor: { select: { id: true, fullName: true, avatarKey: true } },
            },
          },
        },
      })
      .then((row) => {
        if (!row) throw new NotFoundException('Enrollment not found');
        return row;
      });
  }

  private async requireInstructorEnrollment(
    instructorId: string,
    classOfferingId: string,
    enrollmentId: string,
  ) {
    await this.requireAssignedInstructor(instructorId, classOfferingId);
    const enrollment = await this.prisma.enrollment.findFirst({
      where: { id: enrollmentId, classOfferingId },
      select: {
        id: true,
        status: true,
        learner: { select: { id: true, fullName: true, email: true, avatarKey: true } },
      },
    });
    if (!enrollment) throw new NotFoundException('Enrollment not found');
    return enrollment;
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
