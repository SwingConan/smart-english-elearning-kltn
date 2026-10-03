import { ConflictException } from '@nestjs/common';
import {
  Prisma,
  QuestionDifficulty,
  QuestionResponseType,
  TestAttemptStatus,
  TestPurpose,
  ToeicSkill,
} from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AssessmentStudentService } from './assessment-student.service';

describe('AssessmentStudentService', () => {
  const learnerId = 'learner-id';
  const enrollmentId = 'enrollment-id';
  const attemptId = 'attempt-id';
  const courseId = 'course-id';
  const enrollment = { id: enrollmentId, classOffering: { id: 'offering-id', courseId } };
  const questions = [
    testQuestion('tq-sc', QuestionResponseType.SINGLE_CHOICE, 2, [
      ['sc-correct', true],
      ['sc-wrong', false],
    ]),
    testQuestion('tq-mc', QuestionResponseType.MULTIPLE_CHOICE, 3, [
      ['mc-a', true],
      ['mc-b', true],
      ['mc-c', false],
    ]),
  ];
  const transaction = {
    enrollment: { findFirst: jest.fn() },
    testAttempt: { findFirst: jest.fn(), count: jest.fn(), create: jest.fn(), update: jest.fn() },
    testAnswer: { upsert: jest.fn() },
    attemptSkillScore: { upsert: jest.fn() },
    learnerSkillState: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    masteryHistory: { create: jest.fn() },
    test: { findFirst: jest.fn() },
  };
  const prisma = {
    enrollment: { findFirst: jest.fn() },
    classAssessment: { findMany: jest.fn() },
    test: { findMany: jest.fn() },
    testAttempt: { findFirst: jest.fn() },
    $transaction: jest.fn(),
  };
  const service = new AssessmentStudentService(prisma as unknown as PrismaService);
  const attemptRecord = (answers: Array<{ testQuestionId: string; selectedOptionIds: string[]; textResponse: string | null; audioStorageKey: string | null }>) => ({
    id: attemptId,
    attemptNumber: 1,
    status: TestAttemptStatus.IN_PROGRESS,
    score: null,
    maxScore: null,
    startedAt: new Date('2026-09-21T00:00:00Z'),
    submittedAt: null,
    classAssessment: null,
    answers,
    skillScores: [],
    test: {
      id: 'test-id',
      title: 'Scoring',
      description: null,
      purpose: TestPurpose.IN_CLASS,
      timeLimitMinutes: null,
      showResultAfterSubmit: true,
      testQuestions: questions,
      questionGroups: [],
    },
  });

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.enrollment.findFirst.mockResolvedValue(enrollment);
    transaction.enrollment.findFirst.mockResolvedValue(enrollment);
    prisma.$transaction.mockImplementation(
      (operation: (client: typeof transaction) => Promise<unknown>) => operation(transaction),
    );
    transaction.testAnswer.upsert.mockImplementation(({ where }) =>
      Promise.resolve({
        id: `answer-${where.attemptId_testQuestionId.testQuestionId}`,
      }),
    );
    transaction.testAttempt.update.mockImplementation(({ data }) =>
      Promise.resolve({
        id: attemptId,
        attemptNumber: 1,
        status: data.status,
        score: data.score,
        maxScore: data.maxScore,
        startedAt: new Date('2026-09-21T00:00:00Z'),
        submittedAt: data.submittedAt,
      }),
    );
  });

  it('shapes the published Test list without question or answer data', async () => {
    prisma.classAssessment.findMany.mockResolvedValue([
      {
        id: 'assignment-id',
        stage: 'PERIODIC',
        openAt: new Date('2026-09-01T00:00:00Z'),
        closeAt: new Date('2026-10-01T00:00:00Z'),
        maxAttemptsOverride: 2,
        test: {
          id: 'test-id', purpose: TestPurpose.IN_CLASS, title: 'Quiz', description: null,
          lessonId: 'lesson-id', maxAttempts: 2, timeLimitMinutes: 15,
          showResultAfterSubmit: true, questionGroups: [{ skill: ToeicSkill.LISTENING }],
          _count: { testQuestions: 3 },
        },
        attempts: [
          { id: 'submitted', attemptNumber: 1, status: TestAttemptStatus.SUBMITTED, submittedAt: new Date() },
          { id: 'active', attemptNumber: 2, status: TestAttemptStatus.IN_PROGRESS, submittedAt: null },
        ],
      },
    ]);
    prisma.test.findMany.mockResolvedValue([]);

    const result = await service.listTests(learnerId, enrollmentId);
    expect(result).toEqual([
      expect.objectContaining({
        questionCount: 3,
        attemptsUsed: 2,
        hasInProgressAttempt: true,
        inProgressAttemptId: 'active',
        latestSubmittedAttemptId: 'submitted',
        purpose: TestPurpose.IN_CLASS,
        stage: 'PERIODIC',
        timeLimitMinutes: 15,
      }),
    ]);
    expect(JSON.stringify(result)).not.toMatch(
      /questions|options|isCorrect|explanation|selectedOptionIds/,
    );
    expect(prisma.classAssessment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ classOfferingId: enrollment.classOffering.id }),
      }),
    );
  });

  it('scores the authoritative final payload with exact-set matching', async () => {
    const initial = attemptRecord([]);
    const persisted = attemptRecord([
      { testQuestionId: 'tq-sc', selectedOptionIds: ['sc-correct'], textResponse: null, audioStorageKey: null },
      { testQuestionId: 'tq-mc', selectedOptionIds: ['mc-a', 'mc-b'], textResponse: null, audioStorageKey: null },
    ]);
    const submitted = { ...persisted, status: TestAttemptStatus.SUBMITTED, score: 5, maxScore: 5, submittedAt: new Date() };
    transaction.testAttempt.findFirst
      .mockResolvedValueOnce(initial)
      .mockResolvedValueOnce(persisted)
      .mockResolvedValueOnce(persisted)
      .mockResolvedValueOnce(submitted);

    const result = await service.submitAttempt(learnerId, enrollmentId, attemptId, {
      answers: [
        { testQuestionId: 'tq-sc', selectedOptionIds: ['sc-correct'] },
        { testQuestionId: 'tq-mc', selectedOptionIds: ['mc-b', 'mc-a'] },
      ],
    });

    expect(transaction.testAnswer.upsert).toHaveBeenCalledTimes(4);
    expect(transaction.testAnswer.upsert).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        update: { selectedOptionIds: ['sc-correct'], isCorrect: true, pointsAwarded: expect.any(Prisma.Decimal) },
      }),
    );
    expect(transaction.testAnswer.upsert).toHaveBeenNthCalledWith(
      4,
      expect.objectContaining({
        update: { selectedOptionIds: ['mc-a', 'mc-b'], isCorrect: true, pointsAwarded: expect.any(Prisma.Decimal) },
      }),
    );
    expect(transaction.testAttempt.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          score: 5,
          maxScore: 5,
          status: TestAttemptStatus.SUBMITTED,
        }),
      }),
    );
    expect(result.attempt).toMatchObject({ score: 5, maxScore: 5, percentage: 100 });
  });

  it('treats omitted and partial answers as zero without partial credit', async () => {
    const initial = attemptRecord([]);
    const persisted = attemptRecord([
      { testQuestionId: 'tq-mc', selectedOptionIds: ['mc-a'], textResponse: null, audioStorageKey: null },
    ]);
    transaction.testAttempt.findFirst
      .mockResolvedValueOnce(initial)
      .mockResolvedValueOnce(persisted)
      .mockResolvedValueOnce(persisted)
      .mockResolvedValueOnce({ ...persisted, status: TestAttemptStatus.SUBMITTED, score: 0, maxScore: 5, submittedAt: new Date() });

    await service.submitAttempt(learnerId, enrollmentId, attemptId, {
      answers: [{ testQuestionId: 'tq-mc', selectedOptionIds: ['mc-a'] }],
    });
    expect(transaction.testAnswer.upsert).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        update: { selectedOptionIds: [], isCorrect: false, pointsAwarded: expect.any(Prisma.Decimal) },
      }),
    );
    expect(transaction.testAnswer.upsert).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        update: { selectedOptionIds: ['mc-a'], isCorrect: false, pointsAwarded: expect.any(Prisma.Decimal) },
      }),
    );
  });

  it('returns an already submitted attempt without rescoring', async () => {
    const submittedAt = new Date('2026-09-21T01:00:00Z');
    transaction.testAttempt.findFirst.mockResolvedValue({
      id: attemptId,
      attemptNumber: 1,
      status: TestAttemptStatus.SUBMITTED,
      score: 2,
      maxScore: 5,
      startedAt: new Date(),
      submittedAt,
      test: {
        id: 'test-id',
        title: 'Done',
        purpose: TestPurpose.IN_CLASS,
        timeLimitMinutes: null,
        showResultAfterSubmit: true,
        testQuestions: questions,
        questionGroups: [],
      },
      answers: [],
      classAssessment: null,
      skillScores: [],
    });
    await expect(
      service.submitAttempt(learnerId, enrollmentId, attemptId, { answers: [] }),
    ).resolves.toMatchObject({ attempt: { score: 2, maxScore: 5, submittedAt } });
    expect(transaction.testAnswer.upsert).not.toHaveBeenCalled();
    expect(transaction.testAttempt.update).not.toHaveBeenCalled();
  });

  it('bounds retryable transaction conflicts', async () => {
    prisma.$transaction.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Conflict', {
        code: 'P2034',
        clientVersion: '7.10.0',
      }),
    );
    await expect(
      service.startOrResumeAttempt(learnerId, enrollmentId, 'test-id'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.$transaction).toHaveBeenCalledTimes(3);
  });
});

function testQuestion(
  id: string,
  type: QuestionResponseType,
  points: number,
  options: Array<[string, boolean]>,
) {
  return {
    id,
    orderIndex: 0,
    points,
    question: {
      id: `q-${id}`,
      type,
      responseType: type,
      toeicSkill: type === QuestionResponseType.AUDIO_RESPONSE ? ToeicSkill.SPEAKING : ToeicSkill.LISTENING,
      difficulty: QuestionDifficulty.EASY,
      content: id,
      explanation: 'Explanation',
      skills: [],
      options: options.map(([optionId, isCorrect], orderIndex) => ({
        id: optionId,
        content: optionId,
        orderIndex,
        isCorrect,
      })),
    },
  };
}
