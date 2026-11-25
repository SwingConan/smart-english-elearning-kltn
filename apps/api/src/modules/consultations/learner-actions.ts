export function learnerConsultationActions(
  booking: {
    state: string;
    startsAt: string | Date;
    endsAt: string | Date;
    expiresAt?: string | Date | null;
    changes?: { state: string }[] | null;
    reports?: { id: string; kind: string; makerId: string; parentId?: string | null }[] | null;
  },
  actorId: string,
  now: Date,
) {
  const start = new Date(booking.startsAt).getTime(),
    end = new Date(booking.endsAt).getTime();
  const alive = !booking.expiresAt || new Date(booking.expiresAt).getTime() > now.getTime();
  const active = alive && ['HOLD', 'PENDING_GV', 'CONFIRMED'].includes(booking.state);
  const submitted = active && ['PENDING_GV', 'CONFIRMED'].includes(booking.state);
  const early = start >= now.getTime() + 12 * 3600000;
  const pendingChange = booking.changes?.some((c) => c.state === 'PENDING') ?? false;
  return {
    submit: alive && booking.state === 'HOLD',
    cancel: active && early,
    reschedule: submitted && early && !pendingChange,
    requestCancel: submitted && start > now.getTime() && !early && !pendingChange,
    requestReschedule: submitted && start > now.getTime() && !early && !pendingChange,
    reportAbsence:
      booking.state === 'CONFIRMED' &&
      end <= now.getTime() &&
      !booking.reports?.some((r) => r.kind === 'NO_SHOW' && r.makerId === actorId),
    disputableReportIds:
      booking.state === 'CONFIRMED' && end <= now.getTime()
        ? (booking.reports ?? [])
            .filter(
              (r) =>
                r.kind === 'NO_SHOW' &&
                r.makerId !== actorId &&
                !booking.reports?.some(
                  (d) => d.kind === 'DISPUTE' && d.parentId === r.id && d.makerId === actorId,
                ),
            )
            .map((r) => r.id)
        : [],
  };
}
