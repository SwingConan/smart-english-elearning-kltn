import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { TestAttemptStatus, ToeicSkill } from '../../generated/prisma/client';
import { estimateToeicSectionScore, PracticeTestsService } from './practice-tests.service';

describe('PracticeTestsService', () => {
  const prismaMock = {
    test: { findMany: jest.fn(), findFirst: jest.fn() },
    testAttempt: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      aggregate: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
    testAnswer: { upsert: jest.fn(), deleteMany: jest.fn() },
    attemptSkillScore: { deleteMany: jest.fn(), createMany: jest.fn() },
    attemptEvaluation: { deleteMany: jest.fn() },
    masteryHistory: { deleteMany: jest.fn() },
    courseRecommendation: { deleteMany: jest.fn() },
    studyRecommendation: { deleteMany: jest.fn() },
    $transaction: jest.fn(),
  };

  let service: PracticeTestsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PracticeTestsService(prismaMock as never);
  });

  it('scales TOEIC section scores between 5 and 495 in steps of 5', () => {
    expect(estimateToeicSectionScore(0, 100)).toBe(5);
    expect(estimateToeicSectionScore(50, 100)).toBeGreaterThanOrEqual(250);
    expect(estimateToeicSectionScore(96, 100)).toBe(495);
    expect(estimateToeicSectionScore(100, 100)).toBe(495);
    expect(estimateToeicSectionScore(60, 100) % 5).toBe(0);
  });

  it('rejects path traversal on resolveMediaFile', () => {
    expect(() => service.resolveMediaFile('test-1', 'images', '../secret.json')).toThrow(
      BadRequestException,
    );
    expect(() => service.resolveMediaFile('test-9', 'images', 'a.webp')).toThrow(
      BadRequestException,
    );
    expect(() => service.resolveMediaFile('test-1', 'scripts', 'a.webp')).toThrow(
      BadRequestException,
    );
  });

  it('never allows rewinding listeningGroupIndex backwards during Listening', async () => {
    const mockTx = {
      testAttempt: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'att-1',
          testId: 'test-1',
          status: TestAttemptStatus.IN_PROGRESS,
          practiceState: {
            phase: 'LISTENING',
            listeningGroupIndex: 10,
            listeningStartedAt: '2026-11-17T00:00:00.000Z',
            readingStartedAt: null,
            readingDurationSeconds: 4500,
            markedQuestionIds: [],
          },
          test: {
            questionGroups: Array.from({ length: 54 }, (_, i) => ({ id: `g-${i}` })),
            testQuestions: [],
          },
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      testAnswer: { upsert: jest.fn() },
    };
    prismaMock.$transaction.mockImplementation((fn: (tx: unknown) => Promise<unknown>) => fn(mockTx));

    const res = await service.saveProgress('learner-1', 'att-1', {
      listeningGroupIndex: 2,
    });
    expect(res.state.listeningGroupIndex).toBe(10);
    expect(res.state.phase).toBe('LISTENING');
  });

  it('grades attempt, computes summary, and deletes prior attempts on submit', async () => {
    const oldAttempts = [{ id: 'old-att-1' }, { id: 'old-att-2' }];
    const mockTx = {
      testAttempt: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'new-att',
          testId: '91000000-0000-4000-8000-000000000001',
          status: TestAttemptStatus.IN_PROGRESS,
          practiceState: { phase: 'READING', listeningGroupIndex: 54 },
          answers: [
            { id: 'a1', testQuestionId: 'tq1', selectedOptionIds: ['opt1-a'] },
            { id: 'a2', testQuestionId: 'tq2', selectedOptionIds: ['opt2-b'] },
          ],
          test: {
            id: '91000000-0000-4000-8000-000000000001',
            questionGroups: [
              {
                orderIndex: 1,
                skill: ToeicSkill.LISTENING,
                taskCode: 'TOEIC_PART_1',
                testQuestions: [
                  {
                    id: 'tq1',
                    points: 1,
                    question: {
                      options: [
                        { id: 'opt1-a', isCorrect: true },
                        { id: 'opt1-b', isCorrect: false },
                      ],
                    },
                  },
                ],
              },
              {
                orderIndex: 45,
                skill: ToeicSkill.READING,
                taskCode: 'TOEIC_PART_5',
                testQuestions: [
                  {
                    id: 'tq2',
                    points: 1,
                    question: {
                      options: [
                        { id: 'opt2-a', isCorrect: true },
                        { id: 'opt2-b', isCorrect: false },
                      ],
                    },
                  },
                ],
              },
            ],
          },
        }),
        update: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue(oldAttempts),
        deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
      testAnswer: { upsert: jest.fn().mockResolvedValue({}), deleteMany: jest.fn() },
      attemptSkillScore: { deleteMany: jest.fn(), createMany: jest.fn() },
      attemptEvaluation: { deleteMany: jest.fn() },
      masteryHistory: { deleteMany: jest.fn() },
      courseRecommendation: { deleteMany: jest.fn() },
      studyRecommendation: { deleteMany: jest.fn() },
    };
    prismaMock.$transaction.mockImplementation((fn: (tx: unknown) => Promise<unknown>) => fn(mockTx));

    const res = await service.submitAttempt('learner-1', 'new-att');
    expect(res.alreadySubmitted).toBeUndefined();
    expect(res.summary?.correctCount).toBe(1);
    expect(res.summary?.listeningRaw).toBe(1);
    expect(res.summary?.readingRaw).toBe(0);
    expect(mockTx.testAnswer.deleteMany).toHaveBeenCalledWith({
      where: { attemptId: { in: ['old-att-1', 'old-att-2'] } },
    });
    expect(mockTx.testAttempt.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['old-att-1', 'old-att-2'] } },
    });
  });

  it('throws NotFoundException when history does not exist yet', async () => {
    prismaMock.test.findFirst.mockResolvedValue({ id: 't1', title: 'Test 1', _count: { testQuestions: 200 } });
    prismaMock.testAttempt.findFirst.mockResolvedValue(null);
    await expect(service.getLatestHistoryByTest('learner-1', 't1')).rejects.toThrow(NotFoundException);
  });

  it('throws ConflictException if reading result requested for unsubmitted attempt', async () => {
    prismaMock.testAttempt.findFirst.mockResolvedValue({
      id: 'att-1',
      status: TestAttemptStatus.IN_PROGRESS,
      startedAt: new Date(),
      submittedAt: null,
      practiceState: null,
      answers: [],
      test: { id: 't1', title: 'Test 1', questionGroups: [] },
    });
    await expect(service.getAttemptResult('learner-1', 'att-1')).rejects.toThrow(ConflictException);
  });
});
