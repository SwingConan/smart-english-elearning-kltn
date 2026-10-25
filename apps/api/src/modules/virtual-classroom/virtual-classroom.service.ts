import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ClassModality, EnrollmentStatus } from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

@Injectable()
export class VirtualClassroomService {
  constructor(private readonly prisma: PrismaService) {}

  async get(learnerId: string, enrollmentId: string) {
    const enrollment = await this.prisma.enrollment.findFirst({
      where: {
        id: enrollmentId,
        learnerId,
        status: { in: [EnrollmentStatus.ACTIVE, EnrollmentStatus.COMPLETED] },
      },
      select: {
        id: true,
        status: true,
        classOffering: {
          select: {
            id: true,
            name: true,
            code: true,
            modality: true,
            classStart: true,
            classEnd: true,
            instructor: { select: { fullName: true } },
            scheduleSlots: {
              select: {
                id: true,
                dayOfWeek: true,
                startTime: true,
                endTime: true,
                meetingUrl: true,
                locationText: true,
              },
              orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
            },
          },
        },
      },
    });
    if (!enrollment) throw new NotFoundException('Accessible enrollment not found');
    if (
      enrollment.classOffering.modality !== ClassModality.ONLINE &&
      enrollment.classOffering.modality !== ClassModality.HYBRID
    )
      throw new BadRequestException('This class has no virtual classroom');
    const now = new Date();
    const occurrences = this.occurrences(
      enrollment.classOffering.classStart,
      enrollment.classOffering.classEnd,
      enrollment.classOffering.scheduleSlots,
      now,
    );
    return {
      ...enrollment,
      serverNow: now,
      classOffering: {
        ...enrollment.classOffering,
        scheduleSlots: enrollment.classOffering.scheduleSlots.map(({ meetingUrl, ...slot }) => ({
          ...slot,
          meetingAvailable: Boolean(meetingUrl),
        })),
      },
      occurrences,
    };
  }

  private occurrences(
    classStart: Date | null,
    classEnd: Date | null,
    slots: Array<{
      id: string;
      dayOfWeek: number;
      startTime: Date;
      endTime: Date;
      meetingUrl: string | null;
      locationText: string | null;
    }>,
    now: Date,
  ) {
    if (!classStart || !classEnd) return [];
    const offsetMs = 7 * 60 * 60 * 1000;
    const localNow = new Date(now.getTime() + offsetMs);
    const windowStart = new Date(
      Math.max(classStart.getTime(), localNow.getTime() - 14 * 86400000),
    );
    const windowEnd = new Date(Math.min(classEnd.getTime(), localNow.getTime() + 60 * 86400000));
    const cursor = new Date(
      Date.UTC(windowStart.getUTCFullYear(), windowStart.getUTCMonth(), windowStart.getUTCDate()),
    );
    const results: Array<Record<string, unknown>> = [];
    while (cursor <= windowEnd) {
      const weekday = cursor.getUTCDay() === 0 ? 7 : cursor.getUTCDay();
      for (const slot of slots.filter((item) => item.dayOfWeek === weekday)) {
        const startAt = new Date(
          Date.UTC(
            cursor.getUTCFullYear(),
            cursor.getUTCMonth(),
            cursor.getUTCDate(),
            slot.startTime.getUTCHours() - 7,
            slot.startTime.getUTCMinutes(),
          ),
        );
        const endAt = new Date(
          Date.UTC(
            cursor.getUTCFullYear(),
            cursor.getUTCMonth(),
            cursor.getUTCDate(),
            slot.endTime.getUTCHours() - 7,
            slot.endTime.getUTCMinutes(),
          ),
        );
        if (endAt < classStart || startAt > classEnd) continue;
        const temporal = now < startAt ? 'UPCOMING' : now <= endAt ? 'LIVE' : 'ENDED';
        const status = temporal !== 'ENDED' && !slot.meetingUrl ? 'NO_LINK' : temporal;
        results.push({
          id: `${slot.id}:${cursor.toISOString().slice(0, 10)}`,
          scheduleSlotId: slot.id,
          date: cursor.toISOString().slice(0, 10),
          dayOfWeek: weekday,
          startAt,
          endAt,
          status,
          modality: slot.locationText ? 'HYBRID' : 'ONLINE',
          locationText: slot.locationText,
          meetingAvailable: Boolean(slot.meetingUrl),
          joinUrl: temporal === 'LIVE' && slot.meetingUrl ? slot.meetingUrl : null,
        });
      }
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    const recent = results
      .filter(
        (item) =>
          (item.endAt as Date) < now &&
          (item.endAt as Date) >= new Date(now.getTime() - 7 * 86400000),
      )
      .slice(-3);
    const currentAndUpcoming = results.filter((item) => (item.endAt as Date) >= now).slice(0, 8);
    return recent
      .concat(currentAndUpcoming)
      .sort((a, b) => (a.startAt as Date).getTime() - (b.startAt as Date).getTime());
  }
}
