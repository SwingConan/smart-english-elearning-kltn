import { ClassOfferingStatus, EnrollmentStatus } from '../../generated/prisma/client';
import { computeRegistrationState } from './registration-state';

describe('computeRegistrationState', () => {
  const now = new Date('2026-10-01T00:00:00Z');
  const base = {
    status: ClassOfferingStatus.OPEN,
    courseIsPublished: true,
    enrollmentStart: null,
    enrollmentEnd: null,
    maxStudents: 10,
    registeredCount: 4,
    now,
  };

  it('returns AVAILABLE with live capacity', () => {
    expect(computeRegistrationState(base)).toEqual({
      registrationState: 'AVAILABLE',
      registeredCount: 4,
      remainingSeats: 6,
      isFull: false,
      actionable: true,
    });
  });

  it.each([
    [{ enrollmentStart: new Date('2026-10-02T00:00:00Z') }, 'UPCOMING'],
    [{ enrollmentEnd: new Date('2026-09-30T23:59:59Z') }, 'CLOSED'],
    [{ status: ClassOfferingStatus.IN_PROGRESS }, 'CLOSED'],
    [{ courseIsPublished: false }, 'CLOSED'],
    [{ registeredCount: 10 }, 'FULL'],
  ] as const)('maps availability inputs %o to %s', (override, expected) => {
    expect(computeRegistrationState({ ...base, ...override }).registrationState).toBe(expected);
  });

  it('supports unlimited capacity and preserves current enrollment action blocking', () => {
    expect(
      computeRegistrationState({
        ...base,
        maxStudents: null,
        registeredCount: 99,
        currentEnrollmentStatus: EnrollmentStatus.PENDING_PAYMENT,
      }),
    ).toMatchObject({ remainingSeats: null, isFull: false, actionable: false });
  });

  it('uses inclusive enrollment window boundaries', () => {
    expect(
      computeRegistrationState({ ...base, enrollmentStart: now, enrollmentEnd: now })
        .registrationState,
    ).toBe('AVAILABLE');
  });
});
