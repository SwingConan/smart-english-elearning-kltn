import { ClassLmsService } from './class-lms.service';

describe('ClassLmsService Q02 Meet and reschedule tree visibility', () => {
  const prevW06 = process.env.W06_ENABLED;

  beforeEach(() => {
    process.env.W06_ENABLED = 'DEV_DEC047';
  });

  afterAll(() => {
    process.env.W06_ENABLED = prevW06;
  });

  it('includes PUBLISH and RESCHEDULE sessions and exposes approvedMeetUrl only when latest W06Meet is APPROVED', async () => {
    const now = new Date('2026-11-14T07:00:00Z');
    const findSessions = jest.fn().mockResolvedValue([
      {
        id: 'sess-approved',
        revision: 1,
        startsAt: new Date('2026-11-15T07:00:00Z'),
        endsAt: new Date('2026-11-15T09:00:00Z'),
        timezone: 'Asia/Ho_Chi_Minh',
        modality: 'ONLINE',
        room: null,
        w06MeetSession: [
          {
            id: 'meet-2',
            url: 'https://meet.google.com/abc-defg-hij',
            state: 'APPROVED',
          },
        ],
        w06WindowSession: [],
      },
      {
        id: 'sess-pending-latest',
        revision: 2,
        startsAt: new Date('2026-11-18T14:00:00Z'),
        endsAt: new Date('2026-11-18T16:00:00Z'),
        timezone: 'Asia/Ho_Chi_Minh',
        modality: 'ONLINE',
        room: null,
        w06MeetSession: [
          {
            id: 'meet-3',
            url: 'https://meet.google.com/new-pend-ing',
            state: 'PENDING_APPROVAL',
          },
        ],
        w06WindowSession: [],
      },
      {
        id: 'sess-rejected-latest',
        revision: 1,
        startsAt: new Date('2026-11-19T14:00:00Z'),
        endsAt: new Date('2026-11-19T16:00:00Z'),
        timezone: 'Asia/Ho_Chi_Minh',
        modality: 'ONLINE',
        room: null,
        w06MeetSession: [
          {
            id: 'meet-4',
            url: 'https://meet.google.com/old-reje-ctd',
            state: 'REJECTED',
          },
        ],
        w06WindowSession: [],
      },
    ]);

    const tx = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([{ '?column?': 1 }]) // advisory lock
        .mockResolvedValueOnce([{ ms: now.getTime() }]) // clock_timestamp()
        .mockResolvedValueOnce([{ sid: 'sess-1' }]) // active session
        .mockResolvedValueOnce([]), // set_config
      user: {
        findFirst: jest.fn().mockResolvedValue({ id: 'stu-1', role: 'STUDENT' }),
      },
      enrollment: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'enr-1',
          learnerId: 'stu-1',
          classOfferingId: 'class-1',
          status: 'ACTIVE',
          classOffering: { id: 'class-1', code: 'TOEIC-01', name: 'TOEIC 01', status: 'OPEN' },
        }),
      },
      classSection: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      classActivityProgress: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      classAssignmentSubmission: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      teachingSession: {
        findMany: findSessions,
      },
    };

    const db = {
      $transaction: jest.fn((fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
    };

    const service = new ClassLmsService(db as never, {} as never, {} as never);
    const result = await service.tree(
      { id: 'stu-1', role: 'STUDENT', sessionId: 'sess-1', email: 's@example.com' } as never,
      'class-1',
    );

    expect(findSessions).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          classOfferingId: 'class-1',
          state: 'PUBLISHED',
          intent: { in: ['PUBLISH', 'RESCHEDULE'] },
        },
        include: expect.objectContaining({
          w06MeetSession: {
            orderBy: [{ number: 'desc' }, { createdAt: 'desc' }],
            take: 1,
            select: { id: true, url: true, state: true },
          },
        }),
      }),
    );

    expect(result.officialSessions).toHaveLength(3);
    expect(result.officialSessions[0].approvedMeetUrl).toBe('https://meet.google.com/abc-defg-hij');
    expect(result.officialSessions[1].approvedMeetUrl).toBeNull();
    expect(result.officialSessions[2].approvedMeetUrl).toBeNull();
  });
});
