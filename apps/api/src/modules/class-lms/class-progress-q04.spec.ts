import { ClassProgressService } from './class-progress.service';
import { ClassLmsService } from './class-lms.service';

describe('ClassProgressService Q04 Analytics & Honest Policies', () => {
  const actor = { id: 'student-1', sessionId: 'sess-1' };

  it('computes section progress without counting upcoming activities as missed and builds weakness evidence + real remediation', async () => {
    const now = new Date('2026-11-14T10:00:00Z');
    const future = new Date('2026-11-20T10:00:00Z');

    const tx = {
      classSection: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'sec-1',
            orderIndex: 1,
            publishedRevision: { id: 'sec-rev-1', title: 'Học phần 1 · Grammar Part 5' },
            activities: [
              {
                id: 'act-lesson-grammar',
                orderIndex: 0,
                state: 'PUBLISHED',
                publishedRevision: {
                  id: 'rev-lesson-1',
                  activityId: 'act-lesson-grammar',
                  number: 1,
                  title: 'Ôn tập Từ loại & Mệnh đề Part 5',
                  type: 'LESSON',
                },
              },
              {
                id: 'act-quiz-1',
                orderIndex: 1,
                state: 'PUBLISHED',
                publishedRevision: {
                  id: 'rev-quiz-1',
                  activityId: 'act-quiz-1',
                  number: 1,
                  title: 'Quiz Part 5 kiểm tra 1',
                  type: 'QUIZ',
                },
              },
              {
                id: 'act-upcoming',
                orderIndex: 2,
                state: 'PUBLISHED',
                publishedRevision: {
                  id: 'rev-upcoming',
                  activityId: 'act-upcoming',
                  number: 1,
                  title: 'Bài chưa đến ngày mở',
                  type: 'ASSIGNMENT',
                  availableFrom: future,
                },
              },
              {
                id: 'act-draft',
                orderIndex: 3,
                state: 'DRAFT',
                publishedRevision: {
                  id: 'rev-draft',
                  activityId: 'act-draft',
                  number: 1,
                  title: 'SECRET_DRAFT_DO_NOT_SHOW',
                  type: 'LESSON',
                },
              },
            ],
          },
        ]),
      },
      classActivityProgress: {
        findMany: jest.fn().mockResolvedValue([{ revisionId: 'rev-lesson-1', status: 'COMPLETED' }]),
      },
      classAssignmentSubmission: { findMany: jest.fn().mockResolvedValue([]) },
      testAttempt: { findMany: jest.fn().mockResolvedValue([]) },
      $queryRawUnsafe: jest.fn().mockImplementation((sql: string) => {
        if (sql.includes('att.answers_json')) {
          return Promise.resolve([
            {
              id: 'att-1',
              activity_id: 'act-quiz-1',
              activity_title: 'Quiz Part 5 kiểm tra 1',
              assessment_kind: 'REGULAR',
              total_score: 10,
              max_score: 14,
              evaluated_at: '2026-11-14T08:05:00Z',
              teacher_feedback: 'Cần xem lại thì quá khứ.',
              manual_grades_json: { 'q-essay': { score: 8, comment: 'Good structure' } },
              answers_json: [
                {
                  questionId: 'q1',
                  type: 'MCQ',
                  prompt: 'Midterm grammar check: The manager ___ the report yesterday.',
                  points: 2,
                  isCorrect: false,
                  autoEarned: 0,
                  selectedOptionId: 'opt-wrong',
                  correctOptionId: 'opt-right',
                  explanation: 'Yesterday requires past simple.',
                },
                {
                  questionId: 'q2',
                  type: 'MCQ',
                  prompt: '[SYNTHETIC] When does Anna visit the library?',
                  points: 2,
                  isCorrect: true,
                  autoEarned: 2,
                  selectedOptionId: 'opt-lib',
                  correctOptionId: 'opt-lib',
                },
                {
                  questionId: 'q-essay',
                  type: 'ESSAY',
                  prompt: 'Write a short workplace update email.',
                  points: 10,
                  textAnswer: 'Dear team, the report is attached.',
                },
              ],
            },
          ]);
        }
        if (sql.includes('lms_local_activity_kinds')) {
          return Promise.resolve([{ activity_id: 'act-quiz-1', kind: 'LOCAL_QUIZ' }]);
        }
        if (sql.includes('FROM lms_local_quiz_configs')) {
          return Promise.resolve([
            { activity_id: 'act-quiz-1', assessment_kind: 'REGULAR', pass_score: 5 },
          ]);
        }
        if (sql.includes('FROM lms_local_quiz_attempts') && sql.includes('ORDER BY attempt_number')) {
          return Promise.resolve([
            {
              activity_id: 'act-quiz-1',
              status: 'SUBMITTED',
              grading_status: 'GRADED',
              grade_published: true,
              total_score: 2,
              max_score: 4,
              submitted_at: '2026-11-14T08:00:00Z',
              graded_at: '2026-11-14T08:05:00Z',
              grade_published_at: '2026-11-14T08:05:00Z',
              teacher_feedback: 'Cần xem lại thì quá khứ.',
            },
          ]);
        }
        if (sql.includes('FROM questions')) {
          return Promise.resolve([
            {
              content: 'Midterm grammar check: The manager ___ the report yesterday.',
              toeicSkill: 'READING',
            },
            {
              content: '[SYNTHETIC] When does Anna visit the library?',
              toeicSkill: 'LISTENING',
            },
          ]);
        }
        if (sql.includes('FROM lms_local_quiz_questions')) {
          return Promise.resolve([
            {
              id: 'q1',
              options_json: [
                { id: 'opt-wrong', text: 'signs' },
                { id: 'opt-right', text: 'signed' },
              ],
            },
          ]);
        }
        if (sql.includes('knowledge_entries')) {
          return Promise.resolve([
            {
              id: 'ke-1',
              slug: 'toeic-part5-word-forms-and-clause-structure',
              title: 'Hệ thống Từ loại, Thì động từ & Cấu trúc Mệnh đề TOEIC Part 5–6',
            },
          ]);
        }
        if (sql.includes("t.purpose = 'PLACEMENT'")) {
          return Promise.resolve([
            {
              id: 'place-1',
              title: 'Placement LR Test',
              submittedAt: '2026-11-10T05:00:00Z',
              score: 65,
              maxScore: 100,
            },
          ]);
        }
        return Promise.resolve([]);
      }),
    };

    const scope = {
      teacher: false,
      enrollment: { id: 'enr-1' },
      class: { code: 'C1', name: 'Class 1', versionId: 'v1' },
      now,
    };

    const lms = {
      visible: jest.fn().mockReturnValue(true),
      run: jest
        .fn()
        .mockImplementation(async (_a, _c, fn: (t: unknown, s: unknown) => unknown) =>
          fn(tx, scope),
        ),
    };

    const service = new ClassProgressService(lms as unknown as ClassLmsService);
    const res = await service.read(actor, 'class-1');

    expect(JSON.stringify(res)).not.toContain('SECRET_DRAFT_DO_NOT_SHOW');
    // Upcoming activity excluded from missed open count: 2 open activities, both completed/published => 100%
    expect(res.activityProgress.openActivitiesCount).toBe(2);
    expect(res.activityProgress.upcomingActivitiesCount).toBe(1);
    expect(res.activityProgress.notStartedOpenCount).toBe(0);
    expect(res.activityProgress.completionRatioPercent).toBe(100);
    // Completion policy remains honest
    expect(res.completion).toBe('POLICY_NOT_EVALUATED');
    expect(res.percentage).toBeNull();
    // AI advisory honestly disabled
    expect(res.aiAdvisory.status).toBe('DISABLED');
    expect(res.analysisMeta.mode).toBe('RULE_BASED');
    // Placement strictly separated
    expect(res.placementReference.blendedIntoClassMetrics).toBe(false);
    expect(res.placementReference.latestAttempt?.title).toBe('Placement LR Test');
    // Weakness evidence & Reading < 60% flagged; Writing ESSAY manual_grades_json 8/10 => STRONG (80%)
    const readingSkill = res.competencyAnalysis.skillBreakdown.find((s) => s.skill === 'READING');
    expect(readingSkill?.status).toBe('NEEDS_IMPROVEMENT');
    expect(readingSkill?.percentage).toBe(0);
    const writingSkill = res.competencyAnalysis.skillBreakdown.find((s) => s.skill === 'WRITING');
    expect(writingSkill?.status).toBe('STRONG');
    expect(writingSkill?.percentage).toBe(80);
    expect(res.competencyAnalysis.weaknessEvidence).toHaveLength(1);
    expect(res.competencyAnalysis.weaknessEvidence[0].learnerAnswer).toBe('signs');
    expect(res.competencyAnalysis.weaknessEvidence[0].correctAnswer).toBe('signed');
    // Trend refuses to claim improvement with only 1 timestamped result
    expect(res.competencyAnalysis.trendAnalysis.status).toBe('INSUFFICIENT_DATA');
    // Recommendations link only to real accessible class lesson + published knowledge article
    expect(res.recommendations.some((r) => r.href === '/classroom/class-1/activities/act-lesson-grammar')).toBe(true);
    expect(
      res.recommendations.some(
        (r) => r.href === '/knowledge/articles/toeic-part5-word-forms-and-clause-structure',
      ),
    ).toBe(true);
  });
});
