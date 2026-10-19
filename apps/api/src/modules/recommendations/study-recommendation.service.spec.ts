import { ConflictException, NotFoundException } from '@nestjs/common';
import {
  AssessmentStage,
  CourseSkillScope,
  Prisma,
  SkillScoreStatus,
  ToeicSkill,
} from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { StudyRecommendationService } from './study-recommendation.service';

type TransactionMock = ReturnType<typeof createTransactionMock>;

describe('StudyRecommendationService source eligibility', () => {
  let transaction: TransactionMock;
  let prisma: PrismaService;
  let service: StudyRecommendationService;
  let projectedState: jest.Mock;

  beforeEach(() => {
    transaction = createTransactionMock();
    prisma = {
      $transaction: jest.fn(async (callback: (tx: TransactionMock) => unknown) =>
        callback(transaction),
      ),
      studyRecommendationPolicy: transaction.studyRecommendationPolicy,
    } as unknown as PrismaService;
    service = new StudyRecommendationService(prisma);
    projectedState = jest.fn(async (_learnerId, _enrollmentId, state) => state);
    jest
      .spyOn(
        service as unknown as {
          projectState: (
            learnerId: string,
            enrollmentId: string,
            state: unknown,
          ) => Promise<unknown>;
        },
        'projectState',
      )
      .mockImplementation(projectedState);
  });

  it('requires learner ownership of an ACTIVE enrollment', async () => {
    transaction.enrollment.findFirst.mockResolvedValue(null);

    await expect(service.getForLearner('learner-a', 'enrollment-b')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(transaction.enrollment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'enrollment-b', learnerId: 'learner-a', status: 'ACTIVE' },
      }),
    );
  });

  it('only queries submitted IN_CLASS attempts, excluding Placement and Practice sources', async () => {
    transaction.testAttempt.findMany.mockResolvedValue([]);

    await service.getForLearner('learner-a', 'enrollment-a');

    expect(transaction.testAttempt.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          learnerId: 'learner-a',
          enrollmentId: 'enrollment-a',
          status: 'SUBMITTED',
          test: { purpose: 'IN_CLASS', courseId: 'course-a' },
          classAssessment: { classOfferingId: 'class-a' },
        }),
      }),
    );
  });

  it('selects the newest fully FINAL source and does not project an older pending attempt', async () => {
    transaction.testAttempt.findMany.mockResolvedValue([
      attempt('new-final', '2026-10-04T12:30:00Z', finalScores()),
      attempt('old-pending', '2026-10-02T12:55:00Z', lrScores()),
      attempt('old-final', '2026-09-18T12:30:00Z', finalScores()),
    ]);
    transaction.studyRecommendation.count.mockResolvedValue(1);

    await service.getForLearner('learner-a', 'enrollment-a');

    expect(projectedState).toHaveBeenCalledWith(
      'learner-a',
      'enrollment-a',
      expect.objectContaining({
        state: 'READY',
        sourceAttemptId: 'new-final',
        pendingNewerAttemptId: null,
      }),
    );
  });

  it('keeps the prior FINAL source when a newer attempt is only PARTIAL', async () => {
    transaction.testAttempt.findMany.mockResolvedValue([
      attempt('new-partial', '2026-10-09T12:30:00Z', [
        ...lrScores(),
        skillScore(ToeicSkill.SPEAKING),
      ]),
      attempt('old-final', '2026-09-23T12:30:00Z', finalScores()),
    ]);
    transaction.studyRecommendation.count.mockResolvedValue(1);

    await service.getForLearner('learner-a', 'enrollment-a');

    expect(projectedState).toHaveBeenCalledWith(
      'learner-a',
      'enrollment-a',
      expect.objectContaining({
        state: 'READY',
        sourceAttemptId: 'old-final',
        pendingNewerAttemptId: 'new-partial',
      }),
    );
  });

  it('returns PENDING_REVIEW when no attempt has every represented skill FINAL', async () => {
    transaction.testAttempt.findMany.mockResolvedValue([
      attempt('new-waiting', '2026-10-10T12:30:00Z', lrScores()),
      attempt('old-partial', '2026-09-24T12:30:00Z', [
        ...lrScores(),
        skillScore(ToeicSkill.SPEAKING),
      ]),
    ]);

    await service.getForLearner('learner-a', 'enrollment-a');

    expect(transaction.studyRecommendation.count).not.toHaveBeenCalled();
    expect(projectedState).toHaveBeenCalledWith(
      'learner-a',
      'enrollment-a',
      expect.objectContaining({
        state: 'PENDING_REVIEW',
        sourceAttemptId: null,
        pendingNewerAttemptId: 'new-waiting',
      }),
    );
  });

  it.each([
    { policies: [] },
    { policies: [activePolicy(), { ...activePolicy(), id: 'policy-2', code: 'OTHER' }] },
  ])(
    'fails safely unless exactly one active policy exists',
    async ({ policies }) => {
      transaction.studyRecommendationPolicy.findMany.mockResolvedValue(policies);

      await expect(service.getActivePolicy()).rejects.toBeInstanceOf(ConflictException);
    },
  );
});

describe('StudyRecommendationService projection', () => {
  it('uses all FINAL LR source scores for current and frozen historical summaries', async () => {
    const currentSource = projectionSource('source-current', '2026-10-04T12:30:00Z', 40, 90);
    const historicalSource = projectionSource(
      'source-history',
      '2026-09-18T12:30:00Z',
      70,
      75,
    );
    const rows = [
      recommendationRow(
        currentSource,
        { weakThreshold: 60, strongThreshold: 80 },
        ToeicSkill.LISTENING,
        true,
      ),
      recommendationRow(
        historicalSource,
        { weakThreshold: 72, strongThreshold: 74 },
        ToeicSkill.LISTENING,
        false,
      ),
    ];
    const projectionService = createProjectionService(rows, [currentSource, historicalSource]);

    const result = await projectionService.projectState('learner-a', 'enrollment-a', {
      state: 'READY',
      sourceAttemptId: currentSource.id,
      pendingNewerAttemptId: null,
    });

    expect(result.strengths).toEqual([
      expect.objectContaining({ skill: ToeicSkill.READING, normalizedScore: 90 }),
    ]);
    expect(result.focus).toMatchObject({
      skill: ToeicSkill.LISTENING,
      normalizedScore: 40,
    });
    const historical = result.history.find(
      ({ sourceAttemptId }) => sourceAttemptId === historicalSource.id,
    );
    expect(historical).toMatchObject({
      strengths: [expect.objectContaining({ skill: ToeicSkill.READING, normalizedScore: 75 })],
      focus: expect.objectContaining({
        skill: ToeicSkill.LISTENING,
        normalizedScore: 70,
      }),
    });
  });

  it('projects the eligible source for NO_MATCHING_CONTENT without recommendation rows', async () => {
    const source = projectionSource('source-no-target', '2026-10-11T12:30:00Z', 45, 55);
    const projectionService = createProjectionService([], [source]);

    const result = await projectionService.projectState('learner-a', 'enrollment-a', {
      state: 'NO_MATCHING_CONTENT',
      sourceAttemptId: source.id,
      pendingNewerAttemptId: null,
    });

    expect(result).toMatchObject({
      state: 'NO_MATCHING_CONTENT',
      source: {
        attemptId: source.id,
        testId: source.testId,
        testTitle: source.test.title,
        stage: AssessmentStage.MIDTERM,
        submittedAt: source.submittedAt,
        resultPath: `/student/enrollments/enrollment-a/attempts/${source.id}/result`,
      },
      recommendations: [],
      history: [],
    });
  });
});

type ProjectionState = {
  state: 'READY' | 'NO_MATCHING_CONTENT';
  sourceAttemptId: string;
  pendingNewerAttemptId: null;
};

type ProjectionResult = {
  state: string;
  source: Record<string, unknown> | null;
  strengths: Array<{ skill: ToeicSkill; normalizedScore: number }>;
  focus: { skill: ToeicSkill; normalizedScore: number } | null;
  recommendations: unknown[];
  history: Array<{
    sourceAttemptId: string;
    strengths: Array<{ skill: ToeicSkill; normalizedScore: number }>;
    focus: { skill: ToeicSkill; normalizedScore: number } | null;
  }>;
};

function createProjectionService(
  rows: Array<ReturnType<typeof recommendationRow>>,
  sources: Array<ReturnType<typeof projectionSource>>,
) {
  const prisma = {
    enrollment: {
      findFirstOrThrow: jest.fn().mockResolvedValue({
        classOfferingId: 'class-a',
        classOffering: { course: { skillScope: CourseSkillScope.LR } },
      }),
    },
    studyRecommendation: { findMany: jest.fn().mockResolvedValue(rows) },
    testAttempt: { findMany: jest.fn().mockResolvedValue(sources) },
  } as unknown as PrismaService;
  return new StudyRecommendationService(prisma) as unknown as {
    projectState: (
      learnerId: string,
      enrollmentId: string,
      state: ProjectionState,
    ) => Promise<ProjectionResult>;
  };
}

function projectionSource(
  id: string,
  submittedAt: string,
  listeningScore: number,
  readingScore: number,
) {
  return {
    id,
    testId: `test-${id}`,
    submittedAt: new Date(submittedAt),
    test: { title: `Assessment ${id}` },
    classAssessment: { stage: AssessmentStage.MIDTERM },
    skillScores: [
      projectionSkillScore(ToeicSkill.LISTENING, listeningScore),
      projectionSkillScore(ToeicSkill.READING, readingScore),
      projectionSkillScore(ToeicSkill.SPEAKING, 99),
    ],
  };
}

function projectionSkillScore(skill: ToeicSkill, normalizedScore: number) {
  return {
    skill,
    rawScore: new Prisma.Decimal(normalizedScore),
    maxRawScore: new Prisma.Decimal(100),
    normalizedScore: new Prisma.Decimal(normalizedScore),
  };
}

function recommendationRow(
  source: ReturnType<typeof projectionSource>,
  thresholds: { weakThreshold: number; strongThreshold: number },
  skill: ToeicSkill,
  isActive: boolean,
) {
  return {
    id: `recommendation-${source.id}`,
    sourceAttemptId: source.id,
    priority: 1,
    skill,
    targetType: 'LESSON' as const,
    title: 'Real lesson',
    actionText: 'Study this lesson next.',
    aiExplanation: null,
    isActive,
    ruleReason: {
      schemaVersion: 1,
      policy: {
        code: 'M08_STUDY_REC_V1',
        ...thresholds,
        minimumTaskQuestions: 2,
        maxRecommendations: 3,
      },
      source: {
        attemptId: source.id,
        testId: source.testId,
        stage: AssessmentStage.MIDTERM,
        submittedAt: source.submittedAt.toISOString(),
      },
      skillEvidence: {
        skill,
        rawScore: 40,
        maxRawScore: 100,
        normalizedScore: 40,
      },
      taskEvidence: null,
      selection: {
        basis: 'SKILL_FALLBACK',
        targetLessonId: 'lesson-a',
        targetLessonTitle: 'Real lesson',
        targetPracticeAvailableAtGeneration: false,
        rank: 1,
      },
    },
    sourceAttempt: {
      id: source.id,
      testId: source.testId,
      submittedAt: source.submittedAt,
      test: source.test,
      classAssessment: source.classAssessment,
    },
    lesson: {
      id: 'lesson-a',
      title: 'Real lesson',
      estimatedMinutes: 30,
      module: { title: 'Module' },
      resources: [],
      tests: [],
    },
  };
}

function createTransactionMock() {
  return {
    enrollment: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'enrollment-a',
        learnerId: 'learner-a',
        classOfferingId: 'class-a',
        classOffering: {
          courseId: 'course-a',
          course: { skillScope: CourseSkillScope.LR },
        },
      }),
    },
    studyRecommendationPolicy: {
      findMany: jest.fn().mockResolvedValue([activePolicy()]),
      update: jest.fn(),
    },
    testAttempt: { findMany: jest.fn().mockResolvedValue([]) },
    studyRecommendation: {
      count: jest.fn().mockResolvedValue(0),
      updateMany: jest.fn(),
      createMany: jest.fn(),
    },
    module: { findMany: jest.fn().mockResolvedValue([]) },
  };
}

function activePolicy() {
  return {
    id: 'policy-1',
    code: 'M08_STUDY_REC_V1',
    name: 'M08 deterministic study recommendation policy',
    weakThreshold: new Prisma.Decimal(60),
    strongThreshold: new Prisma.Decimal(80),
    minimumTaskQuestions: 2,
    maxRecommendations: 3,
    isActive: true,
    createdAt: new Date('2026-10-19T00:00:00Z'),
    updatedAt: new Date('2026-10-19T00:00:00Z'),
  };
}

function attempt(id: string, submittedAt: string, skillScores: ReturnType<typeof skillScore>[]) {
  return {
    id,
    submittedAt: new Date(submittedAt),
    testId: 'test-a',
    test: {
      title: 'In-class assessment',
      showResultAfterSubmit: true,
      testQuestions: [
        question('q-l', ToeicSkill.LISTENING),
        question('q-r', ToeicSkill.READING),
        question('q-s', ToeicSkill.SPEAKING),
        question('q-w', ToeicSkill.WRITING),
      ],
    },
    classAssessment: { stage: AssessmentStage.MIDTERM },
    skillScores,
    answers: [],
  };
}

function question(id: string, toeicSkill: ToeicSkill) {
  return {
    id,
    points: 1,
    group: { taskCode: null },
    question: { toeicSkill },
  };
}

function skillScore(skill: ToeicSkill) {
  return {
    skill,
    rawScore: new Prisma.Decimal(8),
    maxRawScore: new Prisma.Decimal(10),
    normalizedScore: new Prisma.Decimal(80),
    status: SkillScoreStatus.FINAL,
  };
}

function lrScores() {
  return [skillScore(ToeicSkill.LISTENING), skillScore(ToeicSkill.READING)];
}

function finalScores() {
  return [
    ...lrScores(),
    skillScore(ToeicSkill.SPEAKING),
    skillScore(ToeicSkill.WRITING),
  ];
}
