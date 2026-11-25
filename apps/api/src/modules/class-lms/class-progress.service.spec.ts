import { ClassProgressService } from './class-progress.service';
import { ClassLmsService } from './class-lms.service';

describe('ClassProgress current-publication read', () => {
  const actor = { id: 'owner', sessionId: 'session' };
  function setup() {
    const published = {
      id: 'r1',
      activityId: 'a1',
      number: 2,
      title: 'Published title',
      type: 'ASSIGNMENT',
    };
    const tx = {
      classSection: {
        findMany: jest.fn().mockResolvedValue([
          {
            publishedRevision: { id: 's1' },
            activities: [
              { state: 'PUBLISHED', publishedRevision: published },
              {
                state: 'DRAFT',
                publishedRevision: { ...published, id: 'secret', title: 'DRAFT SECRET' },
              },
            ],
          },
        ]),
      },
      classActivityProgress: { findMany: jest.fn().mockResolvedValue([]) },
      classAssignmentSubmission: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ revisionId: 'r1', state: 'SUBMITTED', gradeVersions: [] }]),
      },
      testAttempt: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const scope = {
      teacher: false,
      enrollment: { id: 'enrollment' } as { id: string } | null,
      class: { code: 'A', name: 'Class A', versionId: 'v1' },
      now: new Date('2026-11-06T00:00:00Z'),
    };
    const lms = {
      visible: jest.fn().mockReturnValue(true),
      run: jest
        .fn()
        .mockImplementation(async (_a, _c, fn: (t: unknown, s: unknown) => unknown) =>
          fn(tx, scope),
        ),
    };
    return {
      tx,
      scope,
      lms,
      published,
      service: new ClassProgressService(lms as unknown as ClassLmsService),
    };
  }
  it('pins owner enrollment/class/revisions and exposes no draft title, grade or zero', async () => {
    const e = setup(),
      result = await e.service.read(actor, 'class-a');
    expect(e.lms.run).toHaveBeenCalledWith(actor, 'class-a', expect.any(Function));
    expect(e.tx.classSection.findMany.mock.calls[0][0].where).toEqual({
      classOfferingId: 'class-a',
      publishedRevisionId: { not: null },
    });
    expect(e.tx.classAssignmentSubmission.findMany.mock.calls[0][0].where).toEqual({
      learnerId: 'owner',
      enrollmentId: 'enrollment',
      classOfferingId: 'class-a',
      revisionId: { in: ['r1'] },
    });
    expect(result.entries).toEqual([
      {
        activityId: 'a1',
        revisionId: 'r1',
        revisionNumber: 2,
        title: 'Published title',
        type: 'ASSIGNMENT',
        state: 'PENDING_REVIEW',
      },
    ]);
    expect(JSON.stringify(result)).not.toContain('SECRET');
    expect(result.percentage).toBeNull();
    expect(result.completion).toBe('POLICY_NOT_EVALUATED');
    expect(result.certificateIssued).toBe(false);
  });
  it('denies teachers and absent ACTIVE own enrollment before reading content', async () => {
    const e = setup();
    e.scope.enrollment = null;
    await expect(e.service.read(actor, 'foreign')).rejects.toThrow();
    expect(e.tx.classSection.findMany).not.toHaveBeenCalled();
    e.scope.enrollment = { id: 'e' };
    e.scope.teacher = true;
    await expect(e.service.read(actor, 'foreign')).rejects.toThrow();
  });
  it('does not expose an unavailable activity', async () => {
    const e = setup();
    e.lms.visible.mockReturnValue(false);
    expect((await e.service.read(actor, 'class-a')).entries).toEqual([]);
  });
  it.each(['PENDING_RELEASE', 'PUBLISHED'])(
    'separates quiz %s without invoking quiz sweep services',
    async (state) => {
      const e = setup();
      e.published.type = 'QUIZ';
      e.tx.testAttempt.findMany.mockResolvedValue([
        {
          quizRevisionId: 'r1',
          status: 'SUBMITTED',
          quizPublishedAt: state === 'PUBLISHED' ? new Date() : null,
        },
      ]);
      expect((await e.service.read(actor, 'class-a')).entries[0].state).toBe(state);
      expect(e.tx.testAttempt.findMany.mock.calls[0][0].where).toEqual({
        learnerId: 'owner',
        enrollmentId: 'enrollment',
        quizRevisionId: { in: ['r1'] },
      });
    },
  );
  it('only reads PUBLISHED assignment grade revisions', async () => {
    const e = setup();
    e.tx.classAssignmentSubmission.findMany.mockResolvedValue([
      { revisionId: 'r1', state: 'SUBMITTED', gradeVersions: [{ id: 'grade' }] },
    ]);
    expect((await e.service.read(actor, 'class-a')).entries[0].state).toBe('PUBLISHED');
    expect(
      e.tx.classAssignmentSubmission.findMany.mock.calls[0][0].select.gradeVersions.where,
    ).toEqual({ state: 'PUBLISHED' });
  });
});
