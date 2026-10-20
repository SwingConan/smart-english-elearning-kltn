import { UserRole, UserStatus } from '../../generated/prisma/client';

export const OPERATIONAL_READINESS_REASONS = [
  'COURSE_UNPUBLISHED',
  'INSTRUCTOR_MISSING',
  'INSTRUCTOR_INACTIVE',
  'SCHEDULE_MISSING',
  'SCHEDULE_DESTINATION_MISSING',
  'CLASS_DATES_MISSING',
] as const;

export type OperationalReadinessReason = (typeof OPERATIONAL_READINESS_REASONS)[number];

export interface OperationalReadinessInput {
  courseIsPublished: boolean;
  instructor: { role: UserRole; status: UserStatus } | null;
  classStart: Date | null;
  classEnd: Date | null;
  scheduleSlots: Array<{ locationText: string | null; meetingUrl: string | null }>;
}

export function computeOperationalReadiness(input: OperationalReadinessInput) {
  const missing: OperationalReadinessReason[] = [];
  if (!input.courseIsPublished) missing.push('COURSE_UNPUBLISHED');
  if (!input.instructor) {
    missing.push('INSTRUCTOR_MISSING');
  } else if (
    input.instructor.role !== UserRole.INSTRUCTOR ||
    input.instructor.status !== UserStatus.ACTIVE
  ) {
    missing.push('INSTRUCTOR_INACTIVE');
  }
  if (input.scheduleSlots.length === 0) missing.push('SCHEDULE_MISSING');
  if (input.scheduleSlots.some((slot) => !hasScheduleDestination(slot))) {
    missing.push('SCHEDULE_DESTINATION_MISSING');
  }
  if (!input.classStart || !input.classEnd || input.classStart >= input.classEnd) {
    missing.push('CLASS_DATES_MISSING');
  }
  return { isReady: missing.length === 0, missing };
}

export function hasScheduleDestination(input: {
  locationText?: string | null;
  meetingUrl?: string | null;
}): boolean {
  return Boolean(input.locationText?.trim() || input.meetingUrl?.trim());
}

const WALL_CLOCK_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export function parseWallClockTime(value: string): Date | null {
  if (!WALL_CLOCK_PATTERN.test(value)) return null;
  const [hour, minute] = value.split(':').map(Number);
  return new Date(Date.UTC(1970, 0, 1, hour, minute, 0, 0));
}

export function projectWallClockTime(value: Date): string {
  return `${String(value.getUTCHours()).padStart(2, '0')}:${String(value.getUTCMinutes()).padStart(2, '0')}`;
}

export function wallClockMinutes(value: Date): number {
  return value.getUTCHours() * 60 + value.getUTCMinutes();
}

export function scheduleRangesOverlap(
  start: Date,
  end: Date,
  existingStart: Date,
  existingEnd: Date,
): boolean {
  return (
    wallClockMinutes(start) < wallClockMinutes(existingEnd) &&
    wallClockMinutes(end) > wallClockMinutes(existingStart)
  );
}

export function projectScheduleSlot<T extends { startTime: Date; endTime: Date }>(slot: T) {
  return {
    ...slot,
    startTime: projectWallClockTime(slot.startTime),
    endTime: projectWallClockTime(slot.endTime),
  };
}
