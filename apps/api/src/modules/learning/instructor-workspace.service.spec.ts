import { ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  AnswerEvaluationStatus,
  SkillScoreStatus,
  TestAttemptStatus,
  ToeicSkill,
} from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { InstructorWorkspaceService } from './instructor-workspace.service';

describe('InstructorWorkspaceService', () => {
  const classroom = {
    id: 'class-a',
    code: 'A01',
    name: 'Class A',
    status: 'IN_PROGRESS',
    modality: 'ONLINE',
    classStart: new Date(),
    classEnd: new Date(),
    course: { id: 'course-a', title: 'Course A', level: 'FOUNDATION' },
    scheduleSlots: [],
  };
  const prisma = {
    classOffering: { findFirst: jest.fn(), findMany: jest.fn() },
    enrollment: { count: jest.fn(), findMany: jest.fn(), findFirst: jest.fn() },
    lesson: { count: jest.fn() },
    module: { findMany: jest.fn() },
    lessonProgress: { count: jest.fn() },
    classAssessment: { findMany: jest.fn() },
    testAttempt: { findMany: jest.fn() },
  };
  const service = new InstructorWorkspaceService(prisma as unknown as PrismaService);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.classOffering.findFirst.mockResolvedValue(classroom);
  });

  it('rejects a class not assigned to the current instructor without querying child data', async () => {
    prisma.classOffering.findFirst.mockResolvedValue(null);
    await expect(service.overview('instructor-a', 'class-b')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.enrollment.count).not.toHaveBeenCalled();
  });

  it('aggregates the overview with bounded aggregate queries and pending productive grading', async () => {
    prisma.enrollment.count.mockResolvedValue(3);
    prisma.lesson.count.mockResolvedValue(4);
    prisma.lessonProgress.count.mockResolvedValue(7);
    prisma.enrollment.findMany.mockResolvedValue([
      { id: 'enrollment-a', learnerId: 'learner-a', enrolledAt: new Date(), lessonProgress: [] },
    ]);
    prisma.classAssessment.findMany.mockResolvedValue([
      {
        id: 'assessment-a',
        stage: 'MIDTERM',
        openAt: null,
        closeAt: null,
        createdAt: new Date(),
        test: { id: 'test-a', title: 'Midterm' },
      },
    ]);
    prisma.testAttempt.findMany.mockResolvedValue([
      {
        learnerId: 'learner-a',
        classAssessmentId: 'assessment-a',
        status: TestAttemptStatus.SUBMITTED,
        answers: [
          { evaluations: [], testQuestion: { question: { toeicSkill: ToeicSkill.WRITING } } },
        ],
      },
    ]);
    const result = await service.overview('instructor-a', 'class-a');
    expect(result).toMatchObject({
      activeLearnerCount: 3,
      lessonProgress: { completed: 7, total: 12, percentage: 58 },
      pendingGradingCount: 1,
    });
    expect(prisma.lessonProgress.count).toHaveBeenCalledTimes(1);
    expect(prisma.testAttempt.findMany).toHaveBeenCalledTimes(1);
  });

  it('projects database time-only values without leaking the 1970 transport date', async () => {
    prisma.classOffering.findMany.mockResolvedValue([
      {
        ...classroom,
        scheduleSlots: [
          {
            dayOfWeek: 2,
            startTime: new Date('1970-01-01T18:00:00.000Z'),
            endTime: new Date('1970-01-01T20:00:00.000Z'),
            locationText: null,
          },
        ],
        _count: { enrollments: 12 },
      },
    ]);
    const result = await service.listClasses('instructor-a');
    expect(result[0].scheduleSlots).toEqual([
      { dayOfWeek: 2, startTime: '18:00', endTime: '20:00', locationText: null },
    ]);
    expect(JSON.stringify(result)).not.toContain('1970');
  });

  it('presents a cancelled offering with its persisted cancellation state', async () => {
    prisma.classOffering.findMany.mockResolvedValue([
      { ...classroom, status: 'CANCELLED', _count: { enrollments: 0 } },
    ]);
    const result = await service.listClasses('instructor-a');
    expect(result[0].status).toBe('CANCELLED');
  });

  it('keeps learner IDs scoped to the owned class', async () => {
    prisma.enrollment.findFirst.mockResolvedValue(null);
    prisma.module.findMany.mockResolvedValue([]);
    await expect(
      service.learnerDetail('instructor-a', 'class-a', 'enrollment-from-class-b'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.enrollment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'enrollment-from-class-b', classOfferingId: 'class-a' },
      }),
    );
  });

  it('keeps the deterministic learner story while missing required FINAL skills stay pending', async () => {
    const score = (skill: ToeicSkill, status: SkillScoreStatus, normalizedScore: number) => ({
      skill,
      status,
      normalizedScore,
    });
    const allFinal = (base: number) => [
      score(ToeicSkill.LISTENING, SkillScoreStatus.FINAL, base),
      score(ToeicSkill.READING, SkillScoreStatus.FINAL, base + 1),
      score(ToeicSkill.SPEAKING, SkillScoreStatus.FINAL, base + 2),
      score(ToeicSkill.WRITING, SkillScoreStatus.FINAL, base + 3),
    ];
    prisma.module.findMany.mockResolvedValue([]);
    prisma.enrollment.findFirst.mockResolvedValue({
      id: 'enrollment-a',
      status: 'ACTIVE',
      enrolledAt: new Date('2026-01-01T00:00:00Z'),
      learner: { id: 'learner-a', fullName: 'Learner A', email: 'a@test' },
      lessonProgress: [],
      testAttempts: [
        {
          id: 'midterm-final', attemptNumber: 2, submittedAt: new Date('2026-03-03T00:00:00Z'),
          classAssessment: { id: 'midterm', stage: 'MIDTERM', test: { title: 'Midterm', purpose: 'IN_CLASS' } },
          skillScores: allFinal(80), answers: [],
        },
        {
          id: 'midterm-pending', attemptNumber: 1, submittedAt: new Date('2026-03-02T00:00:00Z'),
          classAssessment: { id: 'midterm', stage: 'MIDTERM', test: { title: 'Midterm', purpose: 'IN_CLASS' } },
          skillScores: [
            score(ToeicSkill.LISTENING, SkillScoreStatus.FINAL, 70),
            score(ToeicSkill.READING, SkillScoreStatus.FINAL, 71),
          ], answers: [],
        },
        {
          id: 'practice-partial', attemptNumber: 1, submittedAt: new Date('2026-02-15T00:00:00Z'),
          classAssessment: { id: 'practice', stage: 'PERIODIC', test: { title: 'Practice', purpose: 'IN_CLASS' } },
          skillScores: [
            score(ToeicSkill.LISTENING, SkillScoreStatus.FINAL, 65),
            score(ToeicSkill.READING, SkillScoreStatus.FINAL, 66),
            score(ToeicSkill.SPEAKING, SkillScoreStatus.FINAL, 67),
          ], answers: [],
        },
        {
          id: 'periodic-final', attemptNumber: 1, submittedAt: new Date('2026-02-01T00:00:00Z'),
          classAssessment: { id: 'periodic', stage: 'PERIODIC', test: { title: 'Periodic', purpose: 'IN_CLASS' } },
          skillScores: allFinal(60), answers: [{ evaluations: [
            { id: 'evaluation-a', updatedAt: new Date('2026-02-02T00:00:00Z') },
            { id: 'evaluation-b', updatedAt: new Date('2026-02-02T01:00:00Z') },
          ] }],
        },
      ],
    });

    const result = await service.learnerDetail('instructor-a', 'class-a', 'enrollment-a');

    expect(result.attempts).toHaveLength(4);
    expect(result.summary.pendingGradingCount).toBe(2);
    expect(result.latestFourSkillSnapshot?.attemptId).toBe('midterm-final');
    expect(result.attempts.find((attempt) => attempt.id === 'midterm-pending')?.skillScores).toHaveLength(2);
    expect(result.attempts.find((attempt) => attempt.id === 'practice-partial')?.skillScores).toHaveLength(3);
    expect(result.attempts.find((attempt) => attempt.id === 'midterm-final')?.skillScores).toHaveLength(4);
    expect(result.skillTrend.map((point) => [point.assessmentTitle, point.attemptId])).toEqual([
      ['Periodic', 'periodic-final'],
      ['Midterm', 'midterm-final'],
    ]);
    expect(result.recentActivity.find((item) => item.type === 'GRADING_FINAL')?.label).toContain('2 câu tự luận đã có kết quả chấm');
    expect(result.recentActivity.map((item) => item.label).join(' ')).not.toContain('tiêu chí');
  });

  it('does not count non-IN_CLASS attempts as four-skill grading work', async () => {
    prisma.module.findMany.mockResolvedValue([]);
    prisma.enrollment.findFirst.mockResolvedValue({
      id: 'enrollment-a',
      status: 'ACTIVE',
      enrolledAt: new Date('2026-01-01T00:00:00Z'),
      learner: { id: 'learner-a', fullName: 'Learner A', email: 'a@test' },
      lessonProgress: [],
      testAttempts: [{
        id: 'practice-mock',
        attemptNumber: 1,
        submittedAt: new Date('2026-02-01T00:00:00Z'),
        classAssessment: { id: 'mock', stage: 'FINAL', test: { title: 'Mock', purpose: 'PRACTICE_MOCK' } },
        skillScores: [],
        answers: [],
      }],
    });

    const result = await service.learnerDetail('instructor-a', 'class-a', 'enrollment-a');

    expect(result.summary.pendingGradingCount).toBe(0);
  });

  it('uses latest submitted attempts and FINAL-only scores for class averages', async () => {
    prisma.enrollment.findMany.mockResolvedValue([
      { id: 'enrollment-a', learnerId: 'learner-a', learner: { fullName: 'A', email: 'a@test' } },
      { id: 'enrollment-b', learnerId: 'learner-b', learner: { fullName: 'B', email: 'b@test' } },
    ]);
    prisma.classAssessment.findMany.mockResolvedValue([
      {
        id: 'assessment-a',
        stage: 'MIDTERM',
        createdAt: new Date(),
        openAt: null,
        closeAt: null,
        test: { id: 'test-a', title: 'Midterm', purpose: 'IN_CLASS' },
        attempts: [
          {
            id: 'new-a',
            learnerId: 'learner-a',
            attemptNumber: 2,
            submittedAt: new Date(),
            learner: { fullName: 'A', email: 'a@test' },
            skillScores: [
              {
                skill: ToeicSkill.LISTENING,
                status: SkillScoreStatus.FINAL,
                normalizedScore: { toString: () => '80' },
              },
              {
                skill: ToeicSkill.READING,
                status: SkillScoreStatus.PROVISIONAL,
                normalizedScore: { toString: () => '99' },
              },
              {
                skill: ToeicSkill.SPEAKING,
                status: SkillScoreStatus.FINAL,
                normalizedScore: { toString: () => '70' },
              },
              {
                skill: ToeicSkill.WRITING,
                status: SkillScoreStatus.FINAL,
                normalizedScore: { toString: () => '60' },
              },
            ],
          },
          {
            id: 'old-a',
            learnerId: 'learner-a',
            attemptNumber: 1,
            submittedAt: new Date(),
            learner: { fullName: 'A', email: 'a@test' },
            skillScores: [
              {
                skill: ToeicSkill.READING,
                status: SkillScoreStatus.FINAL,
                normalizedScore: { toString: () => '100' },
              },
            ],
          },
          {
            id: 'only-b',
            learnerId: 'learner-b',
            attemptNumber: 1,
            submittedAt: new Date(),
            learner: { fullName: 'B', email: 'b@test' },
            skillScores: [
              {
                skill: ToeicSkill.LISTENING,
                status: SkillScoreStatus.FINAL,
                normalizedScore: { toString: () => '60' },
              },
            ],
          },
        ],
      },
    ]);
    const result = await service.results('instructor-a', 'class-a');
    const assessment = result.assessments[0];
    expect(assessment.learners.map((item) => item.id)).toEqual(['new-a', 'only-b']);
    expect(assessment.skillAverages.find((item) => item.skill === ToeicSkill.LISTENING)).toEqual(expect.objectContaining({
      skill: ToeicSkill.LISTENING,
      average: 70,
      sampleCount: 2,
      excludedCount: 0,
      distribution: { below50: 0, from50To69: 1, from70To84: 1, from85To100: 0 },
    }));
    expect(assessment.skillAverages.find((item) => item.skill === ToeicSkill.READING)).toEqual(expect.objectContaining({
      skill: ToeicSkill.READING,
      average: null,
      sampleCount: 0,
      excludedCount: 2,
      distribution: { below50: 0, from50To69: 0, from70To84: 0, from85To100: 0 },
    }));
    expect(
      assessment.skillAverages.find((item) => item.skill === ToeicSkill.LISTENING)
        ?.distributionLearners.from70To84,
    ).toEqual([
      expect.objectContaining({ id: 'new-a', learner: { fullName: 'A', email: 'a@test' } }),
    ]);
    expect(assessment).toMatchObject({
      submittedCount: 3,
      latestAttemptCount: 2,
      fullyGradedCount: 0,
      pendingGradingCount: 2,
    });
  });

  it('returns scored class trend points in chronological event-date order without zero samples', async () => {
    prisma.enrollment.findMany.mockResolvedValue([
      { id: 'enrollment-a', learnerId: 'learner-a', learner: { fullName: 'A', email: 'a@test' } },
    ]);
    const finalScore = (skill: ToeicSkill, normalizedScore: number) => ({
      skill,
      status: SkillScoreStatus.FINAL,
      normalizedScore,
    });
    const assessment = (
      id: string,
      title: string,
      dates: { createdAt: Date; openAt: Date | null; closeAt: Date | null },
      skillScores: Array<ReturnType<typeof finalScore>>,
    ) => ({
      id,
      stage: 'PERIODIC',
      ...dates,
      test: { id: `test-${id}`, title, purpose: 'IN_CLASS' },
      attempts: skillScores.length ? [{
        id: `attempt-${id}`,
        learnerId: 'learner-a',
        attemptNumber: 1,
        submittedAt: dates.createdAt,
        learner: { fullName: 'A', email: 'a@test' },
        skillScores,
      }] : [],
    });
    prisma.classAssessment.findMany.mockResolvedValue([
      assessment(
        'final-empty',
        'Final',
        { createdAt: new Date('2026-04-01T00:00:00Z'), openAt: new Date('2026-04-02T00:00:00Z'), closeAt: null },
        [],
      ),
      assessment(
        'midterm',
        'Midterm',
        { createdAt: new Date('2026-03-01T00:00:00Z'), openAt: new Date('2026-03-02T00:00:00Z'), closeAt: new Date('2026-03-03T00:00:00Z') },
        [finalScore(ToeicSkill.LISTENING, 80)],
      ),
      assessment(
        'periodic',
        'Periodic',
        { createdAt: new Date('2026-02-01T00:00:00Z'), openAt: new Date('2026-02-02T00:00:00Z'), closeAt: null },
        [finalScore(ToeicSkill.READING, 70)],
      ),
    ]);

    const result = await service.results('instructor-a', 'class-a');

    expect(result.assessments.map((item) => item.test.title)).toEqual(['Final', 'Midterm', 'Periodic']);
    expect(result.trend.map((point) => point.title)).toEqual(['Periodic', 'Midterm']);
    expect(result.trend.map((point) => point.date.getTime())).toEqual([
      new Date('2026-02-02T00:00:00Z').getTime(),
      new Date('2026-03-03T00:00:00Z').getTime(),
    ]);
    expect(result.trend.every((point) => point.skills.every((skill) => skill.sampleCount > 0))).toBe(true);
  });

  it('requests the class grading queue in deterministic oldest-first order', async () => {
    prisma.testAttempt.findMany.mockResolvedValue([]);
    await service.gradingInbox('instructor-a', 'class-a');
    expect(prisma.testAttempt.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          classAssessment: { classOfferingId: 'class-a' },
          status: TestAttemptStatus.SUBMITTED,
        },
        orderBy: [{ submittedAt: 'asc' }, { id: 'asc' }],
      }),
    );
  });

  it('classifies productive grading truthfully and excludes objective-only attempts', async () => {
    const base = {
      attemptNumber: 1,
      submittedAt: new Date(),
      learner: { id: 'learner', fullName: 'Learner', email: 'learner@test' },
      classAssessment: { id: 'assessment', stage: 'MIDTERM', test: { id: 'test', title: 'Test' } },
      skillScores: [],
    };
    prisma.testAttempt.findMany.mockResolvedValue([
      { ...base, id: 'objective-only', answers: [] },
      { ...base, id: 'waiting', answers: [{ evaluations: [] }] },
      {
        ...base,
        id: 'partial',
        answers: [
          { evaluations: [{ id: 'draft', status: AnswerEvaluationStatus.PENDING_REVIEW }] },
          { evaluations: [] },
        ],
      },
      {
        ...base,
        id: 'final',
        answers: [
          { evaluations: [{ id: 'final-a', status: AnswerEvaluationStatus.REVIEWED_FINAL }] },
          { evaluations: [{ id: 'final-b', status: AnswerEvaluationStatus.REVIEWED_FINAL }] },
        ],
      },
    ]);
    const result = await service.gradingInbox('instructor-a', 'class-a');
    expect(result.submissions.map(({ id, gradingState }) => [id, gradingState])).toEqual([
      ['waiting', 'WAITING'],
      ['partial', 'PARTIAL'],
      ['final', 'FINAL'],
    ]);
    expect(result.summary).toEqual({ waiting: 1, partial: 1, final: 1 });
  });
});
