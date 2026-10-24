import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EnrollmentStatus, Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { BulkAttendanceDto, CreateAttendanceSessionDto } from './attendance.dto';

@Injectable()
export class AttendanceService {
  constructor(private readonly prisma: PrismaService) {}

  async list(instructorId: string, classOfferingId: string) {
    await this.requireAssigned(instructorId, classOfferingId);
    return this.prisma.attendanceSession.findMany({
      where: { classOfferingId },
      include: {
        _count: { select: { records: true } },
        scheduleSlot: true,
      },
      orderBy: [{ sessionDate: 'desc' }, { createdAt: 'desc' }],
    });
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
    return this.prisma.attendanceSession.create({
      data: {
        classOfferingId,
        scheduleSlotId: input.scheduleSlotId ?? null,
        sessionDate,
        title: input.title?.trim() || null,
        note: input.note?.trim() || null,
        createdById: instructorId,
      },
    });
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
      ...session,
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
    return this.prisma.$transaction(
      async (tx) => {
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
            },
            update: {
              status: record.status,
              note: record.note?.trim() || null,
              recordedById: instructorId,
            },
          });
        }
        if (clearIds.length > 0) {
          await tx.attendanceRecord.deleteMany({
            where: { attendanceSessionId: id, enrollmentId: { in: clearIds } },
          });
        }
        return {
          updated: input.records.length,
          cleared: clearIds.length,
          session: await tx.attendanceSession.findUniqueOrThrow({
            where: { id },
            include: { records: true },
          }),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private async requireAssigned(instructorId: string, id: string) {
    const row = await this.prisma.classOffering.findFirst({
      where: { id, instructorId },
      select: { id: true },
    });
    if (!row) throw new NotFoundException('Assigned class not found');
  }
}
