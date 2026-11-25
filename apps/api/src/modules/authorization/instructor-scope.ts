import type { Prisma } from '../../generated/prisma/client';

export function currentAssignmentWindow(now: Date): Prisma.ClassInstructorAssignmentWhereInput {
  return {
    state: { in: ['PUBLISHED', 'SUPERSEDED'] },
    effectiveFrom: { lte: now },
    reservedUntil: { gt: now },
  };
}
// Once a class has entered V2 assignment workflow (even a draft), a gap/future/
// expired reservation must never restore authority from its historical FK.
export function effectiveInstructorScope(
  instructorId: string,
  current: Prisma.ClassInstructorAssignmentWhereInput,
): Prisma.ClassOfferingWhereInput {
  return {
    OR: [
      { effectiveAssignments: { some: { ...current, instructorId } } },
      legacyInstructorClassScope(instructorId),
    ],
  };
}
// Existing LMS/assessment ownership is deliberately not transferred by W02B.
// A later W03/W04 contract must authorize those operations explicitly.
export function legacyInstructorClassScope(instructorId: string): Prisma.ClassOfferingWhereInput {
  return { instructorId, effectiveAssignments: { none: {} } };
}
export function legacyInstructorCourseScope(instructorId: string): Prisma.ClassOfferingWhereInput {
  return {
    ...legacyInstructorClassScope(instructorId),
    course: {
      classOfferings: { none: { effectiveAssignments: { some: {} } } },
    },
  };
}
// PO-approved retention contract: assignment workflow never grants a replacement
// instructor the original course-authoring authority. The original instructor
// may retain it only during an independently approved, eligible reservation.
export function retainedInstructorClassScope(
  instructorId: string,
  now = new Date(),
): Prisma.ClassOfferingWhereInput {
  return { OR: [legacyInstructorClassScope(instructorId), {
    instructorId,
    effectiveAssignments: { some: {
      ...currentAssignmentWindow(now), instructorId, eligibilityConfirmed: true,
      approvedBy: { not: null }, approvedAt: { lte: now },
    } },
  }] };
}
export function retainedInstructorCourseScope(
  instructorId: string,
  now = new Date(),
): Prisma.ClassOfferingWhereInput {
  return { OR: [legacyInstructorCourseScope(instructorId), {
    instructorId,
    effectiveAssignments: { some: {
      ...currentAssignmentWindow(now), instructorId, eligibilityConfirmed: true,
      approvedBy: { not: null }, approvedAt: { lte: now },
    } },
  }] };
}
export async function assignmentProjection(
  database: Pick<Prisma.TransactionClient, 'classInstructorAssignment'>,
  ids: string[],
  current: Prisma.ClassInstructorAssignmentWhereInput,
) {
  const rows = await database.classInstructorAssignment.findMany({
    where: { ...current, classOfferingId: { in: ids } },
    select: { classOfferingId: true, instructor: { select: { id: true, fullName: true } } },
  });
  const history = await database.classInstructorAssignment.groupBy({
    by: ['classOfferingId'],
    where: { classOfferingId: { in: ids } },
  });
  return {
    current: new Map(rows.map((r) => [r.classOfferingId, r.instructor])),
    managed: new Set(history.map((r) => r.classOfferingId)),
  };
}
