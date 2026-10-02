import { ClassOfferingStatus, EnrollmentStatus } from '../../generated/prisma/client';

export type RegistrationState = 'AVAILABLE' | 'FULL' | 'UPCOMING' | 'CLOSED';

export interface RegistrationStateInput {
  status: ClassOfferingStatus;
  courseIsPublished: boolean;
  enrollmentStart: Date | null;
  enrollmentEnd: Date | null;
  maxStudents: number | null;
  registeredCount: number;
  currentEnrollmentStatus?: EnrollmentStatus | null;
  now: Date;
}

export interface RegistrationStateProjection {
  registrationState: RegistrationState;
  registeredCount: number;
  remainingSeats: number | null;
  isFull: boolean;
  actionable: boolean;
}

export function computeRegistrationState(
  input: RegistrationStateInput,
): RegistrationStateProjection {
  const remainingSeats =
    input.maxStudents === null
      ? null
      : Math.max(0, input.maxStudents - input.registeredCount);
  const isFull = remainingSeats === 0;
  const registrationState: RegistrationState =
    !input.courseIsPublished || input.status !== ClassOfferingStatus.OPEN
      ? 'CLOSED'
      : input.enrollmentStart && input.now < input.enrollmentStart
        ? 'UPCOMING'
        : input.enrollmentEnd && input.now > input.enrollmentEnd
          ? 'CLOSED'
          : isFull
            ? 'FULL'
            : 'AVAILABLE';

  return {
    registrationState,
    registeredCount: input.registeredCount,
    remainingSeats,
    isFull,
    actionable: registrationState === 'AVAILABLE' && !input.currentEnrollmentStatus,
  };
}
