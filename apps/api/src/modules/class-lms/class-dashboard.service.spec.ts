import { ClassDashboardService } from './class-dashboard.service';
import { ClassLmsService } from './class-lms.service';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

describe('Learner calendar publications and ownership', () => {
  const now = new Date('2026-11-13T00:00:00Z');
  const c = { id: 'class', code: 'C', name: 'English', course: { title: 'English' } };
  function setup() {
    const activity = (id: string, extra = {}) => ({
      id,
      assignmentSubmissions: [],
      publishedRevision: {
        id: 'r-' + id,
        type: 'ASSIGNMENT',
        title: id,
        number: 1,
        availableFrom: null,
        availableUntil: new Date('2026-11-12T10:00:00Z'),
        classOffering: c,
        progress: [],
        quizTest: null,
        ...extra,
      },
    });
    const submitted = {
      ...activity('submitted'),
      assignmentSubmissions: [
        { state: 'SUBMITTED', submittedAt: new Date('2026-11-11T10:00:00Z') },
      ],
    };
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      teachingSession: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn() },
      classActivity: {
        findMany: jest.fn().mockResolvedValue([
          submitted,
          activity('overdue'),
          activity('undated', { availableUntil: null }),
          activity('completed', { type: 'LESSON', progress: [{ status: 'COMPLETED' }] }),
          activity('quiz', {
            type: 'QUIZ',
            quizTest: {
              quizState: 'APPROVED',
              classAssessments: [
                {
                  openAt: new Date('2026-11-13T01:00:00Z'),
                  closeAt: new Date('2026-11-13T03:00:00Z'),
                },
              ],
              attempts: [],
            },
            availableUntil: null,
          }),
        ]),
      },
      classAssessment: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'exam',
            openAt: new Date('2026-11-13T04:00:00Z'),
            closeAt: new Date('2026-11-13T06:00:00Z'),
            classOffering: { ...c, enrollments: [{ id: 'own-enrollment' }] },
            test: {
              id: 'test',
              title: 'Speaking/Writing',
              questionGroups: [{ skill: 'SPEAKING' }, { skill: 'WRITING' }],
            },
            attempts: [],
          },
        ]),
      },
    };
    const db = {
      $transaction: jest.fn().mockImplementation((fn: (t: unknown) => unknown) => fn(tx)),
    };
    const lms = {
      context: jest.fn().mockResolvedValue({ id: 'owner', role: 'STUDENT' }),
      now: jest.fn().mockResolvedValue(now),
    };
    return {
      tx,
      lms,
      service: new ClassDashboardService(
        db as unknown as PrismaService,
        lms as unknown as ClassLmsService,
      ),
    };
  }
  it('uses real deadlines, preserves submitted/completed over overdue and links productive assessments', async () => {
    const e = setup();
    const r = await e.service.month({ id: 'owner', sessionId: 'sid' }, '2026-11', 'class');
    const learning = r.data.filter((x) => x.source !== 'TEACHING_SESSION');
    expect(learning).toHaveLength(7);
    expect(learning.find((x) => x.id.includes('submitted'))).toMatchObject({
      status: 'SUBMITTED',
      deadline: new Date('2026-11-12T10:00:00Z'),
    });
    expect(learning.find((x) => x.id.includes('overdue'))).toMatchObject({ status: 'OVERDUE' });
    expect(learning.find((x) => x.id.includes('completed'))).toMatchObject({ status: 'COMPLETED' });
    expect(learning.some((x) => x.id.includes('undated'))).toBe(false);
    expect(r).not.toHaveProperty('undated');
    expect(learning.find((x) => x.id === 'ASSESSMENT:exam:DUE')).toMatchObject({
      actionUrl: '/student/enrollments/own-enrollment/tests?focus=test',
      deadline: new Date('2026-11-13T06:00:00Z'),
    });
    expect(r.truncated).toBe(false);
  });
  it('scopes published sources, progress and submissions to active enrollments of the current learner', async () => {
    const e = setup();
    await e.service.month({ id: 'owner', sessionId: 'sid' }, '2026-11', 'class');
    const query = e.tx.classActivity.findMany.mock.calls[0][0];
    expect(query.where).toMatchObject({
      state: 'PUBLISHED',
      publishedRevisionId: { not: null },
      section: {
        publishedRevisionId: { not: null },
        classOffering: {
          AND: [
            { enrollments: { some: { learnerId: 'owner', status: 'ACTIVE' } } },
            { id: 'class' },
          ],
        },
      },
    });
    expect(query.select.assignmentSubmissions.where).toEqual({
      learnerId: 'owner',
      enrollment: { status: 'ACTIVE' },
    });
    expect(query.select.publishedRevision.select.progress.where).toEqual({
      enrollment: { learnerId: 'owner', status: 'ACTIVE' },
    });
    expect(e.tx.classAssessment.findMany.mock.calls[0][0].where.test).toMatchObject({
      status: 'PUBLISHED',
      quizActivityId: null,
    });
  });
  it('does not expose learner work to other roles or invent dates outside the requested month', async () => {
    const e = setup();
    expect((await e.service.month({ id: 'owner', sessionId: 'sid' }, '2026-12')).data).toEqual([]);
    e.lms.context.mockResolvedValue({ id: 'owner', role: 'SYSTEM_ADMIN' });
    e.tx.classActivity.findMany.mockClear();
    await e.service.month({ id: 'owner', sessionId: 'sid' }, '2026-11');
    expect(e.tx.classActivity.findMany).not.toHaveBeenCalled();
  });

  it('links an authorised published session only to readable lesson publications in its own class', async () => {
    const e = setup();
    e.tx.teachingSession.findFirst.mockResolvedValue({ id: 'session', startsAt: now, endsAt: new Date(now.getTime()+3600000), timezone:'Asia/Ho_Chi_Minh', modality:'ONLINE', revision:1, classOffering:c, room:null, instructor:null });
    e.tx.classActivity.findMany.mockResolvedValue([{ id:'lesson', publishedRevision:{ title:'Workplace introductions', availableFrom:now } }] as never);
    const result = await e.service.detail({id:'owner',sessionId:'sid'}, 'session');
    expect(result.relatedActivities).toEqual([{ id:'lesson',title:'Workplace introductions',availableFrom:now,actionUrl:'/classroom/class/activities/lesson' }]);
    expect(e.tx.teachingSession.findFirst).toHaveBeenCalledWith(expect.objectContaining({where:{id:'session',state:'PUBLISHED',classOffering:{enrollments:{some:{learnerId:'owner',status:'ACTIVE'}}}}}));
    expect(e.tx.classActivity.findMany).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({state:'PUBLISHED',section:{classOfferingId:'class',publishedRevisionId:{not:null}},publishedRevision:{is:expect.objectContaining({type:'LESSON',contentMarkdown:{contains:'](/my/events/session)'},AND:expect.any(Array)})}})}));
  });
});
