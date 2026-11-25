import { learnerConsultationActions } from './learner-actions';
describe('Learner consultation time and state actions', () => {
  const now = new Date('2026-11-13T10:00:00Z');
  const booking = {
    state: 'CONFIRMED',
    startsAt: '2026-11-15T03:00:00Z',
    endsAt: '2026-11-15T03:30:00Z',
    reports: [],
  };
  it('allows early direct changes but not a premature absence report', () => {
    expect(learnerConsultationActions(booking, 'owner', now)).toMatchObject({
      cancel: true,
      reschedule: true,
      requestCancel: false,
      reportAbsence: false,
    });
  });
  it('routes late changes to review and removes changes once the meeting starts', () => {
    expect(
      learnerConsultationActions(booking, 'owner', new Date('2026-11-14T23:00:00Z')),
    ).toMatchObject({
      cancel: false,
      reschedule: false,
      requestCancel: true,
      requestReschedule: true,
    });
    expect(learnerConsultationActions(booking, 'owner', new Date(booking.startsAt))).toMatchObject({
      cancel: false,
      requestCancel: false,
      reportAbsence: false,
    });
  });
  it('expires held places and prevents duplicate absence reports and disputes', () => {
    expect(
      learnerConsultationActions(
        { ...booking, state: 'HOLD', expiresAt: '2026-11-13T09:59:00Z' },
        'owner',
        now,
      ),
    ).toMatchObject({ submit: false, cancel: false });
    const ended = new Date('2026-11-15T04:00:00Z');
    expect(learnerConsultationActions(booking, 'owner', ended).reportAbsence).toBe(true);
    expect(
      learnerConsultationActions(
        { ...booking, reports: [{ id: 'r', kind: 'NO_SHOW', makerId: 'owner' }] },
        'owner',
        ended,
      ).reportAbsence,
    ).toBe(false);
    expect(
      learnerConsultationActions(
        {
          ...booking,
          reports: [
            { id: 'r', kind: 'NO_SHOW', makerId: 'teacher' },
            { id: 'd', kind: 'DISPUTE', makerId: 'owner', parentId: 'r' },
          ],
        },
        'owner',
        ended,
      ).disputableReportIds,
    ).toEqual([]);
  });
});
