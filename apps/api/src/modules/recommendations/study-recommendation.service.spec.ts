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
