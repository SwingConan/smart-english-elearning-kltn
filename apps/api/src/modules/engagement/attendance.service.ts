import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EnrollmentStatus, Prisma } from '../../generated/prisma/client';
import * as argon2 from 'argon2';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { BulkAttendanceDto, CreateAttendanceSessionDto } from './attendance.dto';

@Injectable()
export class AttendanceService {
  constructor(private readonly prisma: PrismaService) {}

  async list(instructorId: string, classOfferingId: string) {
    await this.requireAssigned(instructorId, classOfferingId);
    const sessions = await this.prisma.attendanceSession.findMany({
      where: { classOfferingId },
      include: {
        _count: { select: { records: true } },
        scheduleSlot: true,
      },
      orderBy: [{ sessionDate: 'desc' }, { createdAt: 'desc' }],
    });
    return sessions.map((session) => this.safeSession(session));
  }

  async slots(instructorId: string, classOfferingId: string) {
    await this.requireAssigned(instructorId, classOfferingId);
    return this.prisma.classScheduleSlot.findMany({
      where: { classOfferingId },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    });
  }

  async create(instructorId: string, classOfferingId: string, input: CreateAttendanceSessionDto) {
    await this.requireAssigned(instructorId, classOfferingId);
    const sessionDate = new Date(`${input.sessionDate.slice(0, 10)}T00:00:00.000Z`);
    if (input.scheduleSlotId) {
      const slot = await this.prisma.classScheduleSlot.findFirst({
        where: { id: input.scheduleSlotId, classOfferingId },
        select: { id: true },
      });
      if (!slot) throw new BadRequestException('Schedule slot does not belong to this class');
    }
    const duplicate = await this.prisma.attendanceSession.findFirst({
      where: { classOfferingId, sessionDate, scheduleSlotId: input.scheduleSlotId ?? null },
      select: { id: true },
    });
    if (duplicate)
      throw new ConflictException('An attendance session already exists for this date and slot');
    const opensAt = input.opensAt ? new Date(input.opensAt) : null;
    const closesAt = input.closesAt ? new Date(input.closesAt) : null;
    if (input.selfCheckInEnabled && (!opensAt || !closesAt)) {
      throw new BadRequestException('Phiên tự điểm danh cần thời gian mở và đóng.');
    }
    if (opensAt && closesAt && opensAt >= closesAt) {
      throw new BadRequestException('Thời gian đóng phải sau thời gian mở.');
    }
    const accessCodeHash = input.accessCode?.trim()
      ? await argon2.hash(input.accessCode.trim(), { type: argon2.argon2id })
      : null;
    const created = await this.prisma.attendanceSession.create({
      data: {
        classOfferingId,
        scheduleSlotId: input.scheduleSlotId ?? null,
        sessionDate,
        title: input.title?.trim() || null,
        note: input.note?.trim() || null,
        opensAt,
        closesAt,
        selfCheckInEnabled: input.selfCheckInEnabled ?? false,
        accessCodeHash,
        createdById: instructorId,
      },
    });
    return this.safeSession(created);
  }

  async detail(instructorId: string, classOfferingId: string, id: string) {
    await this.requireAssigned(instructorId, classOfferingId);
    const session = await this.prisma.attendanceSession.findFirst({
      where: { id, classOfferingId },
      include: { records: true, scheduleSlot: true },
    });
    if (!session) throw new NotFoundException('Attendance session not found');
    const roster = await this.prisma.enrollment.findMany({
      where: {
        classOfferingId,
        status: { in: [EnrollmentStatus.ACTIVE, EnrollmentStatus.COMPLETED] },
      },
      select: {
        id: true,
        status: true,
        learner: { select: { id: true, fullName: true, email: true } },
      },
      orderBy: { learner: { fullName: 'asc' } },
    });
    const records = new Map(session.records.map((record) => [record.enrollmentId, record]));
    return {
      ...this.safeSession(session),
      roster: roster.map((enrollment) => ({
        ...enrollment,
        attendance: records.get(enrollment.id) ?? null,
      })),
    };
  }

  async putRecords(
    instructorId: string,
    classOfferingId: string,
    id: string,
    input: BulkAttendanceDto,
  ) {
    await this.requireAssigned(instructorId, classOfferingId);
    const recordIds = input.records.map((record) => record.enrollmentId);
    const clearIds = input.clearEnrollmentIds ?? [];
    const uniqueRecordIds = new Set(recordIds);
    const uniqueClearIds = new Set(clearIds);
    if (
      uniqueRecordIds.size !== recordIds.length ||
      uniqueClearIds.size !== clearIds.length ||
      recordIds.some((enrollmentId) => uniqueClearIds.has(enrollmentId))
    )
      throw new BadRequestException('Each enrollment may appear only once');
    const referencedIds = new Set([...recordIds, ...clearIds]);
    return this.runSerializable(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM "attendance_sessions" WHERE id = ${id}::uuid FOR UPDATE`,
      );
      const session = await tx.attendanceSession.findFirst({
        where: { id, classOfferingId },
        select: { id: true },
      });
      if (!session) throw new NotFoundException('Attendance session not found');
      const valid = await tx.enrollment.count({
        where: { id: { in: [...referencedIds] }, classOfferingId },
      });
      if (valid !== referencedIds.size)
        throw new BadRequestException('Every enrollment must belong to the class');
      for (const record of input.records) {
        await tx.attendanceRecord.upsert({
          where: {
            attendanceSessionId_enrollmentId: {
              attendanceSessionId: id,
              enrollmentId: record.enrollmentId,
            },
          },
          create: {
            attendanceSessionId: id,
            enrollmentId: record.enrollmentId,
            status: record.status,
            note: record.note?.trim() || null,
            recordedById: instructorId,
            source: 'INSTRUCTOR',
            checkedInAt: null,
          },
          update: {
            status: record.status,
            note: record.note?.trim() || null,
            recordedById: instructorId,
            source: 'INSTRUCTOR',
            checkedInAt: null,
          },
        });
      }
      if (clearIds.length > 0) {
        await tx.attendanceRecord.deleteMany({
          where: { attendanceSessionId: id, enrollmentId: { in: clearIds } },
        });
      }
      const updatedSession = await tx.attendanceSession.findUniqueOrThrow({
        where: { id },
        include: { records: true },
      });
      return {
        updated: input.records.length,
        cleared: clearIds.length,
        session: this.safeSession(updatedSession),
      };
    });
  }

  async close(instructorId: string, classOfferingId: string, id: string) {
    await this.requireAssigned(instructorId, classOfferingId);
    const changed = await this.prisma.attendanceSession.updateMany({
      where: { id, classOfferingId, closedAt: null },
      data: { closedAt: new Date() },
    });
    if (!changed.count) throw new ConflictException('Phiên điểm danh đã đóng hoặc không tồn tại.');
    const session = await this.prisma.attendanceSession.findUniqueOrThrow({ where: { id } });
    return this.safeSession(session);
  }

  async studentAttendance(learnerId: string, enrollmentId: string) {
    const enrollment = await this.requireOwnedActiveOrCompleted(learnerId, enrollmentId);
    const sessions = await this.prisma.attendanceSession.findMany({
      where: { classOfferingId: enrollment.classOfferingId },
      include: { records: { where: { enrollmentId } }, scheduleSlot: true },
      orderBy: [{ sessionDate: 'desc' }, { createdAt: 'desc' }],
    });
    const now = new Date();
    return sessions.map((session) => ({
      ...this.safeSession(session),
      record: session.records[0] ?? null,
      state: this.sessionState(session, now, Boolean(session.records[0])),
    }));
  }

  async openSession(learnerId: string, enrollmentId: string) {
    const enrollment = await this.requireOwnedActiveOrCompleted(learnerId, enrollmentId);
    const now = new Date();
    const session = await this.prisma.attendanceSession.findFirst({
      where: {
        classOfferingId: enrollment.classOfferingId,
        selfCheckInEnabled: true,
        closedAt: null,
        opensAt: { lte: now },
        closesAt: { gte: now },
      },
      include: { records: { where: { enrollmentId } }, scheduleSlot: true },
      orderBy: { closesAt: 'asc' },
    });
    if (!session) return null;
    return {
      ...this.safeSession(session),
      record: session.records[0] ?? null,
      state: this.sessionState(session, now, Boolean(session.records[0])),
    };
  }

  async checkIn(learnerId: string, enrollmentId: string, sessionId: string, accessCode?: string) {
    const enrollment = await this.requireOwnedActiveOrCompleted(learnerId, enrollmentId);
    if (enrollment.status !== EnrollmentStatus.ACTIVE) {
      throw new BadRequestException('Chỉ học viên đang học mới có thể tự điểm danh.');
    }
    return this.runSerializable(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM "attendance_sessions" WHERE id = ${sessionId}::uuid FOR UPDATE`,
      );
      const session = await tx.attendanceSession.findFirst({
        where: { id: sessionId, classOfferingId: enrollment.classOfferingId },
      });
      if (!session) throw new NotFoundException('Không tìm thấy phiên điểm danh.');

      const now = new Date();
      if (
        !session.selfCheckInEnabled ||
        session.closedAt ||
        !session.opensAt ||
        !session.closesAt ||
        now < session.opensAt ||
        now > session.closesAt
      ) {
        throw new ConflictException('Phiên tự điểm danh chưa mở hoặc đã đóng.');
      }
      const existing = await tx.attendanceRecord.findUnique({
        where: {
          attendanceSessionId_enrollmentId: {
            attendanceSessionId: sessionId,
            enrollmentId,
          },
        },
      });
      if (existing?.source === 'SELF_CHECK_IN' && existing.status === 'PRESENT') {
        return { idempotent: true, record: existing };
      }
      if (existing?.source === 'INSTRUCTOR') {
        throw new ConflictException(
          'Giảng viên đã ghi nhận điểm danh cho buổi học này. Học viên không thể thay đổi kết quả.',
        );
      }
      if (existing) {
        throw new ConflictException(
          'Kết quả điểm danh hiện tại không thể được thay đổi bằng tự điểm danh.',
        );
      }

      if (session.accessCodeHash) {
        const valid = accessCode
          ? await argon2.verify(session.accessCodeHash, accessCode.trim()).catch(() => false)
          : false;
        if (!valid) throw new BadRequestException('Mã điểm danh không đúng.');
      }

      const record = await tx.attendanceRecord.create({
        data: {
          attendanceSessionId: sessionId,
          enrollmentId,
          status: 'PRESENT',
          source: 'SELF_CHECK_IN',
          checkedInAt: now,
          recordedById: learnerId,
        },
      });
      return { idempotent: false, record };
    });
  }

  private async runSerializable<T>(work: (tx: Prisma.TransactionClient) => Promise<T>) {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(work, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        if ((error as { code?: string }).code !== 'P2034' || attempt === 3) throw error;
      }
    }
    throw new Error('Serializable transaction retry limit reached');
  }

  private requireOwnedActiveOrCompleted(learnerId: string, id: string) {
    return this.prisma.enrollment
      .findFirst({
        where: {
          id,
          learnerId,
          status: { in: [EnrollmentStatus.ACTIVE, EnrollmentStatus.COMPLETED] },
        },
        select: { id: true, status: true, classOfferingId: true },
      })
      .then((row) => {
        if (!row) throw new NotFoundException('Không tìm thấy ghi danh.');
        return row;
      });
  }

  private safeSession<T extends { accessCodeHash: string | null }>(session: T) {
    const { accessCodeHash, ...safe } = session;
    return { ...safe, accessCodeEnabled: Boolean(accessCodeHash) };
  }

  private sessionState(
    session: { opensAt: Date | null; closesAt: Date | null; closedAt: Date | null },
    now: Date,
    checkedIn: boolean,
  ) {
    if (checkedIn) return 'CHECKED_IN';
    if (session.closedAt || (session.closesAt && now > session.closesAt)) return 'CLOSED';
    if (session.opensAt && now < session.opensAt) return 'UPCOMING';
    if (session.opensAt && session.closesAt && now >= session.opensAt && now <= session.closesAt)
      return 'OPEN';
    return 'UNAVAILABLE';
  }

  private async requireAssigned(instructorId: string, id: string) {
    const row = await this.prisma.classOffering.findFirst({
      where: { id, instructorId },
      select: { id: true },
    });
    if (!row) throw new NotFoundException('Assigned class not found');
  }
}
