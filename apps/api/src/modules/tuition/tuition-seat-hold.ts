import { Prisma } from '../../generated/prisma/client';

export const SEAT_HOLD_MINUTES = 15;
export const SEAT_HOLD_MS = SEAT_HOLD_MINUTES * 60 * 1000;

export const TUITION_PAYMENT_CODE_REGEX = /\b(SETU[A-Z0-9]{10,24})\b/i;

export async function enableUnifiedEnrollmentTriggerBypass(
  tx: Prisma.TransactionClient,
): Promise<void> {
  await tx.$executeRaw`SELECT set_config('app.unified_enrollment_v2', 'on', true)`;
}

/**
 * Releases any expired 15-minute seat holds in a consistent transaction.
 * Expired PENDING_PAYMENT enrollments become CANCELLED (releaseReason = 'HOLD_EXPIRED'),
 * active hold payment orders become EXPIRED, and untouched unpaid receivables become EXPIRED
 * so the seat immediately returns to available pool.
 */
export async function releaseExpiredSeatHolds(
  tx: Prisma.TransactionClient,
  classOfferingId?: string,
  now: Date = new Date(),
): Promise<number> {
  const expiredEnrollments = await tx.enrollment.findMany({
    where: {
      ...(classOfferingId ? { classOfferingId } : {}),
      status: 'PENDING_PAYMENT',
      reservedUntil: { not: null, lte: now },
    },
    select: {
      id: true,
      classOfferingId: true,
      reservedUntil: true,
      receivable: { select: { id: true, status: true, paidAmountVnd: true } },
    },
  });

  if (expiredEnrollments.length === 0) {
    return 0;
  }

  await enableUnifiedEnrollmentTriggerBypass(tx);

  const expiredIds = expiredEnrollments.map((item) => item.id);

  await tx.enrollment.updateMany({
    where: {
      id: { in: expiredIds },
      status: 'PENDING_PAYMENT',
      reservedUntil: { not: null, lte: now },
    },
    data: {
      status: 'CANCELLED',
      seatReleasedAt: now,
      releaseReason: 'HOLD_EXPIRED',
    },
  });

  await tx.tuitionPaymentOrder.updateMany({
    where: {
      enrollmentId: { in: expiredIds },
      status: 'ACTIVE_HOLD',
    },
    data: {
      status: 'EXPIRED',
      releasedAt: now,
    },
  });

  const untouchedReceivableIds = expiredEnrollments
    .map((item) => item.receivable)
    .filter((rec): rec is NonNullable<typeof rec> => Boolean(rec))
    .filter((rec) => rec.status === 'UNPAID' && rec.paidAmountVnd === 0)
    .map((rec) => rec.id);

  if (untouchedReceivableIds.length > 0) {
    await tx.tuitionReceivable.updateMany({
      where: { id: { in: untouchedReceivableIds }, status: 'UNPAID', paidAmountVnd: 0 },
      data: { status: 'EXPIRED' },
    });
  }

  await tx.tuitionReconciliationAction.createMany({
    data: expiredEnrollments.map((item) => ({
      receivableId: item.receivable?.id ?? null,
      action: 'HOLD_EXPIRED_RELEASED',
      previousState: 'PENDING_PAYMENT',
      nextState: 'CANCELLED',
      note: '15-minute payment hold expired without verified settlement; seat returned to pool.',
      metadata: {
        enrollmentId: item.id,
        classOfferingId: item.classOfferingId,
        reservedUntil: item.reservedUntil?.toISOString() ?? null,
      },
    })),
  });

  return expiredEnrollments.length;
}

export async function countOccupiedSeats(
  tx: Prisma.TransactionClient,
  classOfferingId: string,
  now: Date = new Date(),
  excludeEnrollmentId?: string,
): Promise<{
  activeCount: number;
  activeHoldCount: number;
  occupiedCount: number;
}> {
  const [activeCount, activeHoldCount] = await Promise.all([
    tx.enrollment.count({
      where: {
        classOfferingId,
        status: 'ACTIVE',
        ...(excludeEnrollmentId ? { id: { not: excludeEnrollmentId } } : {}),
      },
    }),
    tx.enrollment.count({
      where: {
        classOfferingId,
        status: 'PENDING_PAYMENT',
        ...(excludeEnrollmentId ? { id: { not: excludeEnrollmentId } } : {}),
        OR: [{ reservedUntil: null }, { reservedUntil: { gt: now } }],
      },
    }),
  ]);

  return {
    activeCount,
    activeHoldCount,
    occupiedCount: activeCount + activeHoldCount,
  };
}

export async function getOccupiedSeatMap(
  tx: Prisma.TransactionClient,
  classOfferingIds: string[],
  now: Date = new Date(),
): Promise<Map<string, { activeCount: number; activeHoldCount: number; occupiedCount: number }>> {
  const result = new Map<
    string,
    { activeCount: number; activeHoldCount: number; occupiedCount: number }
  >();
  if (classOfferingIds.length === 0) return result;

  for (const id of classOfferingIds) {
    result.set(id, { activeCount: 0, activeHoldCount: 0, occupiedCount: 0 });
  }

  const rows = await tx.enrollment.findMany({
    where: {
      classOfferingId: { in: classOfferingIds },
      OR: [
        { status: 'ACTIVE' },
        {
          status: 'PENDING_PAYMENT',
          OR: [{ reservedUntil: null }, { reservedUntil: { gt: now } }],
        },
      ],
    },
    select: {
      classOfferingId: true,
      status: true,
    },
  });

  for (const row of rows) {
    const entry = result.get(row.classOfferingId);
    if (!entry) continue;
    if (row.status === 'ACTIVE') {
      entry.activeCount += 1;
    } else {
      entry.activeHoldCount += 1;
    }
    entry.occupiedCount += 1;
  }

  return result;
}
