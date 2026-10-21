import { UserRole, UserStatus } from '../../generated/prisma/client';
import {
  computeOperationalReadiness,
  type OperationalReadinessInput,
  parseWallClockTime,
  projectWallClockTime,
  scheduleRangesOverlap,
} from './class-operations';

describe('class operations business rules', () => {
  const readyInput = {
    courseIsPublished: true,
    instructor: { role: UserRole.INSTRUCTOR, status: UserStatus.ACTIVE },
    classStart: new Date('2026-11-01T00:00:00Z'),
    classEnd: new Date('2026-12-01T00:00:00Z'),
    scheduleSlots: [{ locationText: 'Phòng A', meetingUrl: null }],
  };

  it('reports every missing readiness condition in stable order', () => {
    expect(
      computeOperationalReadiness({
        courseIsPublished: false,
        instructor: null,
        classStart: null,
        classEnd: null,
        scheduleSlots: [],
      }),
    ).toEqual({
      isReady: false,
      missing: [
        'COURSE_UNPUBLISHED',
        'INSTRUCTOR_MISSING',
        'SCHEDULE_MISSING',
        'CLASS_DATES_MISSING',
      ],
    });
  });

  it('detects inactive instructors and schedule destinations', () => {
    expect(
      computeOperationalReadiness({
        ...readyInput,
        instructor: { role: UserRole.INSTRUCTOR, status: UserStatus.LOCKED },
        scheduleSlots: [{ locationText: ' ', meetingUrl: null }],
      }).missing,
    ).toEqual(['INSTRUCTOR_INACTIVE', 'SCHEDULE_DESTINATION_MISSING']);
  });

  it('marks a fully prepared class ready', () => {
    expect(computeOperationalReadiness(readyInput)).toEqual({ isReady: true, missing: [] });
  });

  it.each([
    ['COURSE_UNPUBLISHED', { courseIsPublished: false }],
    ['INSTRUCTOR_MISSING', { instructor: null }],
    [
      'INSTRUCTOR_INACTIVE',
      { instructor: { role: UserRole.INSTRUCTOR, status: UserStatus.INACTIVE } },
    ],
    ['SCHEDULE_MISSING', { scheduleSlots: [] }],
    [
      'SCHEDULE_DESTINATION_MISSING',
      { scheduleSlots: [{ locationText: null, meetingUrl: ' ' }] },
    ],
    ['CLASS_DATES_MISSING', { classEnd: null }],
  ] as const)('blocks readiness when %s is missing', (reason, override) => {
    expect(
      computeOperationalReadiness({ ...readyInput, ...override } as OperationalReadinessInput)
        .missing,
    ).toContain(reason);
  });

  it.each([
    ['00:00', '00:00'],
    ['08:05', '08:05'],
    ['23:59', '23:59'],
  ])('round-trips %s as a UTC-anchored wall-clock time', (input, expected) => {
    const parsed = parseWallClockTime(input);
    expect(parsed).not.toBeNull();
    expect(projectWallClockTime(parsed!)).toBe(expected);
  });

  it.each(['24:00', '9:00', '12:60', 'invalid'])('rejects invalid wall-clock value %s', (value) => {
    expect(parseWallClockTime(value)).toBeNull();
  });

  it('detects overlap while allowing adjacent slots', () => {
    const time = (value: string) => parseWallClockTime(value)!;
    expect(scheduleRangesOverlap(time('09:00'), time('11:00'), time('10:00'), time('12:00'))).toBe(
      true,
    );
    expect(scheduleRangesOverlap(time('09:00'), time('10:00'), time('10:00'), time('12:00'))).toBe(
      false,
    );
  });
});
