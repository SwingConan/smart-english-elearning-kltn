import { ConflictException } from '@nestjs/common';
import {
  Prisma,
  QuestionDifficulty,
  QuestionType,
  TestAttemptStatus,
  TestStatus,
  TestType,
} from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AssessmentStudentService } from './assessment-student.service';

describe('AssessmentStudentService', () => {
  const learnerId = 'learner-id';
  const enrollmentId = 'enrollment-id';
  const attemptId = 'attempt-id';
  const courseId = 'course-id';
  const enrollment = { id: enrollmentId, classOffering: { courseId } };
  const questions = [
    testQuestion('tq-sc', QuestionType.SINGLE_CHOICE, 2, [['sc-correct', true], ['sc-wrong', false]]),
    testQuestion('tq-mc', QuestionType.MULTIPLE_CHOICE, 3, [['mc-a', true], ['mc-b', true], ['mc-c', false]]),
  ];
  const transaction = {
    enrollment: { findFirst: jest.fn() },
    testAttempt: { findFirst: jest.fn(), count: jest.fn(), create: jest.fn(), update: jest.fn() },
    testAnswer: { upsert: jest.fn() },
    test: { findFirst: jest.fn() },
  };
  const prisma = {
    enrollment: { findFirst: jest.fn() },
    test: { findMany: jest.fn() },
    testAttempt: { findFirst: jest.fn() },
    $transaction: jest.fn(),
  };
  const service = new AssessmentStudentService(prisma as unknown as PrismaService);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.enrollment.findFirst.mockResolvedValue(enrollment);
    transaction.enrollment.findFirst.mockResolvedValue(enrollment);
    prisma.$transaction.mockImplementation((operation: (client: typeof transaction) => Promise<unknown>) => operation(transaction));
    transaction.testAnswer.upsert.mockResolvedValue({});
    transaction.testAttempt.update.mockImplementation(({ data }) => Promise.resolve({
      id: attemptId,
      attemptNumber: 1,
      status: data.status,
      score: data.score,
      maxScore: data.maxScore,
      startedAt: new Date('2026-09-21T00:00:00Z'),
      submittedAt: data.submittedAt,
    }));
  });

  it('shapes the published Test list without question or answer data', async () => {
    prisma.test.findMany.mockResolvedValue([{
      id: 'test-id',
      type: TestType.QUIZ,
      title: 'Quiz',
      description: null,
      lessonId: 'lesson-id',
      maxAttempts: 2,
      showResultAfterSubmit: true,
      _count: { testQuestions: 3 },
      attempts: [
        { id: 'submitted', attemptNumber: 1, status: TestAttemptStatus.SUBMITTED },
        { id: 'active', attemptNumber: 2, status: TestAttemptStatus.IN_PROGRESS },
      ],
    }]);

    const result = await service.listTests(learnerId, enrollmentId);
    expect(result).toEqual([expect.objectContaining({
      questionCount: 3,
      attemptsUsed: 2,
      hasInProgressAttempt: true,
      inProgressAttemptId: 'active',
      latestSubmittedAttemptId: 'submitted',
    })]);
    expect(JSON.stringify(result)).not.toMatch(/questions|options|isCorrect|explanation|selectedOptionIds/);
    expect(prisma.test.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { courseId, status: TestStatus.PUBLISHED },
    }));
  });

  it('scores the authoritative final payload with exact-set matching', async () => {
    transaction.testAttempt.findFirst.mockResolvedValue({
      id: attemptId,
      attemptNumber: 1,
      status: TestAttemptStatus.IN_PROGRESS,
      score: null,
      maxScore: null,
      startedAt: new Date('2026-09-21T00:00:00Z'),
      submittedAt: null,
      test: {
        id: 'test-id',
        title: 'Scoring',
        type: TestType.QUIZ,
        showResultAfterSubmit: true,
        testQuestions: questions,
      },
    });

    const result = await service.submitAttempt(learnerId, enrollmentId, attemptId, {
      answers: [
        { testQuestionId: 'tq-sc', selectedOptionIds: ['sc-correct'] },
        { testQuestionId: 'tq-mc', selectedOptionIds: ['mc-b', 'mc-a'] },
      ],
    });

    expect(transaction.testAnswer.upsert).toHaveBeenCalledTimes(2);
    expect(transaction.testAnswer.upsert).toHaveBeenNthCalledWith(1, expect.objectContaining({
      update: { selectedOptionIds: ['sc-correct'], isCorrect: true, pointsAwarded: 2 },
    }));
    expect(transaction.testAnswer.upsert).toHaveBeenNthCalledWith(2, expect.objectContaining({
      update: { selectedOptionIds: ['mc-a', 'mc-b'], isCorrect: true, pointsAwarded: 3 },
    }));
    expect(transaction.testAttempt.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ score: 5, maxScore: 5, status: TestAttemptStatus.SUBMITTED }),
    }));
    expect(result.attempt).toMatchObject({ score: 5, maxScore: 5, percentage: 100 });
  });

  it('treats omitted and partial answers as zero without partial credit', async () => {
    transaction.testAttempt.findFirst.mockResolvedValue({
      id: attemptId,
      attemptNumber: 1,
      status: TestAttemptStatus.IN_PROGRESS,
      score: null,
      maxScore: null,
      startedAt: new Date(),
      submittedAt: null,
      test: { id: 'test-id', title: 'Scoring', type: TestType.QUIZ, showResultAfterSubmit: true, testQuestions: questions },
    });

    await service.submitAttempt(learnerId, enrollmentId, attemptId, {
      answers: [{ testQuestionId: 'tq-mc', selectedOptionIds: ['mc-a'] }],
    });
    expect(transaction.testAnswer.upsert).toHaveBeenNthCalledWith(1, expect.objectContaining({
      update: { selectedOptionIds: [], isCorrect: false, pointsAwarded: 0 },
    }));
    expect(transaction.testAnswer.upsert).toHaveBeenNthCalledWith(2, expect.objectContaining({
      update: { selectedOptionIds: ['mc-a'], isCorrect: false, pointsAwarded: 0 },
    }));
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
      test: { id: 'test-id', title: 'Done', type: TestType.QUIZ, showResultAfterSubmit: true, testQuestions: questions },
    });
    await expect(service.submitAttempt(learnerId, enrollmentId, attemptId, { answers: [] }))
      .resolves.toMatchObject({ attempt: { score: 2, maxScore: 5, submittedAt } });
    expect(transaction.testAnswer.upsert).not.toHaveBeenCalled();
    expect(transaction.testAttempt.update).not.toHaveBeenCalled();
  });

  it('bounds retryable transaction conflicts', async () => {
    prisma.$transaction.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('Conflict', {
      code: 'P2034',
      clientVersion: '7.10.0',
    }));
    await expect(service.startOrResumeAttempt(learnerId, enrollmentId, 'test-id'))
      .rejects.toBeInstanceOf(ConflictException);
    expect(prisma.$transaction).toHaveBeenCalledTimes(3);
  });
});

function testQuestion(
  id: string,
  type: QuestionType,
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
      difficulty: QuestionDifficulty.EASY,
      content: id,
      explanation: 'Explanation',
      options: options.map(([optionId, isCorrect], orderIndex) => ({
        id: optionId,
        content: optionId,
        orderIndex,
        isCorrect,
      })),
    },
  };
}
