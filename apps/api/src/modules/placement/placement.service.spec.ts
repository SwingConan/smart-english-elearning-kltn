import { BadRequestException, ConflictException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  PlacementMode,
  PlacementSelfLevel,
  Prisma,
  QuestionResponseType,
  SkillScoreSource,
  SkillScoreStatus,
  TestAttemptStatus,
  ToeicSkill,
} from '../../generated/prisma/client';
import { StartPlacementAttemptDto } from './dto/start-placement-attempt.dto';
import { PlacementSubmitReason } from './dto/submit-placement-attempt.dto';
import { PlacementService } from './placement.service';

const ATTEMPT_ID = '10000000-0000-4000-8000-000000000001';
const QUESTION_ID = '20000000-0000-4000-8000-000000000001';
const TEST_QUESTION_ID = '30000000-0000-4000-8000-000000000001';
const CORRECT_OPTION_ID = '40000000-0000-4000-8000-000000000001';
const WRONG_OPTION_ID = '40000000-0000-4000-8000-000000000002';

function question() {
  return {
    id: TEST_QUESTION_ID,
    orderIndex: 1,
    points: 2,
    question: {
      id: QUESTION_ID,
      content: 'Choose the best answer.',
      responseType: QuestionResponseType.SINGLE_CHOICE,
      toeicSkill: ToeicSkill.LISTENING,
      explanation: 'Answer-key explanation must stay server-side.',
      options: [
        { id: CORRECT_OPTION_ID, content: 'Correct', orderIndex: 1, isCorrect: true },
        { id: WRONG_OPTION_ID, content: 'Wrong', orderIndex: 2, isCorrect: false },
      ],
    },
  };
}

function attempt(overrides: Record<string, unknown> = {}) {
  const testQuestion = question();
  return {
    id: ATTEMPT_ID,
    learnerId: 'learner-1',
    status: TestAttemptStatus.IN_PROGRESS,
    startedAt: new Date(),
    submittedAt: null,
    score: null,
    maxScore: null,
    placementGoalScore: 550,
    placementSelfLevel: PlacementSelfLevel.UNKNOWN,
    answers: [],
    skillScores: [],
    test: {
      id: '80000000-0000-4000-8000-000000000011',
      title: 'Placement L&R Core',
      description: 'Internal placement form',
      placementMode: PlacementMode.LR,
      timeLimitMinutes: 25,
      testQuestions: [testQuestion],
      questionGroups: [
        {
          id: '50000000-0000-4000-8000-000000000001',
          skill: ToeicSkill.LISTENING,
          orderIndex: 1,
          title: 'Listening group',
          instructions: 'Listen and answer.',
          stimulusText: 'This transcript is server-only.',
          audioUrl: 'tts:Owned audio script',
          stimuli: [],
          testQuestions: [testQuestion],
        },
      ],
    },
    ...overrides,
  };
}

function harness() {
  const sideEffectCreate = jest.fn();
  const transaction = {
    testAttempt: {
      findFirst: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
    },
    test: { findFirst: jest.fn() },
    testAnswer: { upsert: jest.fn() },
    attemptSkillScore: { upsert: jest.fn() },
    learnerSkillState: { create: sideEffectCreate },
    masteryHistory: { create: sideEffectCreate },
    attemptEvaluation: { create: sideEffectCreate },
    courseRecommendation: { create: sideEffectCreate },
  };
  const prisma = {
    $transaction: jest.fn(async (operation: (tx: unknown) => unknown) => operation(transaction)),
    testAttempt: { findMany: jest.fn() },
    test: { findMany: jest.fn() },
  };
  const recommendationService = {
    ensureAndProject: jest.fn().mockResolvedValue({
      evaluation: {
        evaluationPolicyId: 'evaluation-policy-1',
        levelCode: 'FOUNDATION',
        levelLabel: 'Nền tảng',
        strongestSkill: ToeicSkill.LISTENING,
        weakestSkill: ToeicSkill.READING,
        summary: 'Kết quả đánh giá nội bộ.',
      },
      recommendations: [],
    }),
  };
  const responseStorage = {
    put: jest.fn(),
    read: jest.fn(),
    open: jest.fn(),
    delete: jest.fn().mockResolvedValue(undefined),
  };
  const stimulusMediaStorage = { read: jest.fn() };
  return {
    service: new PlacementService(
      prisma as never,
      recommendationService as never,
      responseStorage as never,
      stimulusMediaStorage as never,
    ),
    prisma,
    transaction,
    sideEffectCreate,
    recommendationService,
    responseStorage,
    stimulusMediaStorage,
  };
}

function driverAdapterError(originalCode: string, kind = 'TransactionWriteConflict') {
  return Object.assign(new Error('Driver adapter transaction failure'), {
    name: 'DriverAdapterError',
    cause: {
      kind,
      originalCode,
      originalMessage: 'could not serialize access due to read/write dependencies among transactions',
    },
  });
}

describe('PlacementService', () => {
  it('resolves FOUR_SKILLS through the canonical form policy inside the transaction', async () => {
    const { service, prisma } = harness();

    await expect(
      service.startOrResume('learner-1', {
        mode: PlacementMode.FOUR_SKILLS,
        selfLevel: PlacementSelfLevel.GOOD,
        goalScore: 750,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('validates the start fields at the DTO boundary', async () => {
    const invalid = plainToInstance(StartPlacementAttemptDto, {
      mode: 'INVALID',
      selfLevel: 'INVALID',
      goalScore: 1000,
    });
    const valid = plainToInstance(StartPlacementAttemptDto, {
      mode: PlacementMode.LR,
      selfLevel: PlacementSelfLevel.BASIC,
      goalScore: 550,
    });

    expect(await validate(invalid)).toHaveLength(3);
    expect(await validate(valid)).toHaveLength(0);
  });

  it('retries the existing Prisma P2034 conflict and returns the successful transaction result', async () => {
    const { service, prisma, transaction } = harness();
    const conflict = new Prisma.PrismaClientKnownRequestError('Transaction write conflict', {
      code: 'P2034',
      clientVersion: '7.10.0',
    });
    prisma.$transaction
      .mockRejectedValueOnce(conflict)
      .mockImplementationOnce(async (operation: (tx: unknown) => unknown) => operation(transaction));
    transaction.testAttempt.findFirst.mockResolvedValue(attempt());

    await expect(
      service.startOrResume('learner-1', {
        mode: PlacementMode.LR,
        selfLevel: PlacementSelfLevel.UNKNOWN,
        goalScore: 550,
      }),
    ).resolves.toEqual(expect.objectContaining({ attemptId: ATTEMPT_ID, resumed: true }));
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it.each(['40001', '40P01'])(
    'retries a structured DriverAdapterError transaction conflict with PostgreSQL code %s',
    async (originalCode) => {
      const { service, prisma, transaction } = harness();
      prisma.$transaction
        .mockRejectedValueOnce(driverAdapterError(originalCode))
        .mockImplementationOnce(async (operation: (tx: unknown) => unknown) => operation(transaction));
      transaction.testAttempt.findFirst.mockResolvedValue(attempt());

      await expect(
        service.startOrResume('learner-1', {
          mode: PlacementMode.LR,
          selfLevel: PlacementSelfLevel.UNKNOWN,
          goalScore: 550,
        }),
      ).resolves.toEqual(expect.objectContaining({ attemptId: ATTEMPT_ID, resumed: true }));
      expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    },
  );

  it('does not retry unrelated driver adapter failures', async () => {
    const { service, prisma } = harness();
    const databaseError = driverAdapterError('3D000', 'DatabaseDoesNotExist');
    prisma.$transaction.mockRejectedValue(databaseError);

    await expect(
      service.startOrResume('learner-1', {
        mode: PlacementMode.LR,
        selfLevel: PlacementSelfLevel.UNKNOWN,
        goalScore: 550,
      }),
    ).rejects.toBe(databaseError);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('returns the controlled domain conflict after adapter transaction retries are exhausted', async () => {
    const { service, prisma } = harness();
    prisma.$transaction.mockRejectedValue(driverAdapterError('40001'));

    await expect(
      service.startOrResume('learner-1', {
        mode: PlacementMode.LR,
        selfLevel: PlacementSelfLevel.UNKNOWN,
        goalScore: 550,
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'PLACEMENT_CONCURRENT_CHANGE' }),
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(3);
  });

  it('scopes exam lookup to the owner and strips correctness data', async () => {
    const { service, transaction } = harness();
    transaction.testAttempt.findFirst.mockResolvedValue(attempt());

    const payload = await service.getExam('learner-1', ATTEMPT_ID);
    const serialized = JSON.stringify(payload);

    expect(transaction.testAttempt.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: ATTEMPT_ID, learnerId: 'learner-1' }),
      }),
    );
    expect(serialized).not.toContain('isCorrect');
    expect(serialized).not.toContain('explanation');
    expect(serialized).not.toContain('pointsAwarded');
    expect(serialized).not.toContain('This transcript is server-only.');
  });

  it('never projects a protected stimulus even if an adapter returns one', async () => {
    const { service, transaction } = harness();
    const value = attempt();
    value.test.questionGroups[0].stimuli = [
      { id: 'visible', type: 'AUDIO', orderIndex: 0, textContent: null, mimeType: 'audio/mpeg', altText: null, isProtected: false },
      { id: 'protected', type: 'TEXT', orderIndex: 1, textContent: 'secret transcript', mimeType: null, altText: null, isProtected: true },
    ] as never;
    transaction.testAttempt.findFirst.mockResolvedValue(value);

    const payload = await service.getExam('learner-1', ATTEMPT_ID);

    expect(JSON.stringify(payload)).toContain('visible');
    expect(JSON.stringify(payload)).not.toContain('secret transcript');
    expect(transaction.testAttempt.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          test: expect.objectContaining({
            include: expect.objectContaining({
              questionGroups: expect.objectContaining({
                include: expect.objectContaining({
                  stimuli: expect.objectContaining({ where: { isProtected: false } }),
                }),
              }),
            }),
          }),
        }),
      }),
    );
  });

  it('rejects an option that does not belong to the attempt question', async () => {
    const { service, transaction } = harness();
    transaction.testAttempt.findFirst.mockResolvedValue(attempt());

    await expect(
      service.saveAnswer('learner-1', ATTEMPT_ID, TEST_QUESTION_ID, {
        selectedOptionIds: ['60000000-0000-4000-8000-000000000001'],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(transaction.testAnswer.upsert).not.toHaveBeenCalled();
  });

  it('upserts repeated Writing text saves and rejects text on an objective question', async () => {
    const { service, transaction } = harness();
    const writingQuestion = {
      ...question(),
      question: {
        ...question().question,
        responseType: QuestionResponseType.TEXT_RESPONSE,
        toeicSkill: ToeicSkill.WRITING,
        options: [],
      },
    };
    const value = attempt();
    value.test.testQuestions = [writingQuestion] as never;
    value.test.questionGroups[0].testQuestions = [writingQuestion] as never;
    transaction.testAttempt.findFirst.mockResolvedValue(value);
    transaction.testAnswer.upsert.mockResolvedValue({ updatedAt: new Date() });

    await service.saveAnswer('learner-1', ATTEMPT_ID, TEST_QUESTION_ID, { textResponse: 'First draft' });
    await service.saveAnswer('learner-1', ATTEMPT_ID, TEST_QUESTION_ID, { textResponse: 'Revised draft' });

    expect(transaction.testAnswer.upsert).toHaveBeenCalledTimes(2);
    expect(transaction.testAnswer.upsert).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { attemptId_testQuestionId: { attemptId: ATTEMPT_ID, testQuestionId: TEST_QUESTION_ID } },
        update: expect.objectContaining({ textResponse: 'Revised draft', selectedOptionIds: [] }),
      }),
    );

    transaction.testAttempt.findFirst.mockResolvedValue(attempt());
    await expect(
      service.saveAnswer('learner-1', ATTEMPT_ID, TEST_QUESTION_ID, { textResponse: 'Not allowed' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('commits a Speaking upload before deleting the replaced blob', async () => {
    const { service, transaction, responseStorage } = harness();
    const audioQuestion = {
      ...question(),
      question: {
        ...question().question,
        responseType: QuestionResponseType.AUDIO_RESPONSE,
        toeicSkill: ToeicSkill.SPEAKING,
        options: [],
      },
    };
    const value = attempt({ answers: [{ testQuestionId: TEST_QUESTION_ID, audioStorageKey: 'old.webm', selectedOptionIds: [] }] });
    value.test.placementMode = PlacementMode.FOUR_SKILLS as never;
    value.test.testQuestions = [audioQuestion] as never;
    value.test.questionGroups[0].testQuestions = [audioQuestion] as never;
    transaction.testAttempt.findFirst.mockResolvedValue(value);
    transaction.testAnswer.upsert.mockResolvedValue({ updatedAt: new Date() });
    responseStorage.put.mockResolvedValue({ key: 'new.webm', bytes: 4, mimeType: 'audio/webm' });

    await service.uploadAudio('learner-1', ATTEMPT_ID, TEST_QUESTION_ID, {
      buffer: Buffer.from('webm'), mimetype: 'audio/webm', size: 4,
    });

    expect(transaction.testAnswer.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: expect.objectContaining({ audioStorageKey: 'new.webm' }) }),
    );
    expect(responseStorage.delete).toHaveBeenCalledWith('old.webm');
    expect(responseStorage.delete.mock.invocationCallOrder[0]).toBeGreaterThan(
      transaction.testAnswer.upsert.mock.invocationCallOrder[0],
    );
  });

  it('deletes a late Speaking blob and leaves a submitted attempt unchanged', async () => {
    const { service, transaction, responseStorage } = harness();
    transaction.testAttempt.findFirst.mockResolvedValue(
      attempt({ status: TestAttemptStatus.SUBMITTED, submittedAt: new Date() }),
    );
    responseStorage.put.mockResolvedValue({ key: 'orphan.webm', bytes: 4, mimeType: 'audio/webm' });

    await expect(
      service.uploadAudio('learner-1', ATTEMPT_ID, TEST_QUESTION_ID, {
        buffer: Buffer.from('webm'), mimetype: 'audio/webm', size: 4,
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(transaction.testAnswer.upsert).not.toHaveBeenCalled();
    expect(responseStorage.delete).toHaveBeenCalledWith('orphan.webm');
  });

  it('scores by skill deterministically, keeps BKT isolated, then enriches the result', async () => {
    const { service, transaction, sideEffectCreate, recommendationService } = harness();
    const inProgress = attempt({
      answers: [{ testQuestionId: TEST_QUESTION_ID, selectedOptionIds: [CORRECT_OPTION_ID] }],
    });
    const submitted = attempt({
      status: TestAttemptStatus.SUBMITTED,
      submittedAt: new Date(),
      score: 2,
      maxScore: 2,
      skillScores: [
        {
          skill: ToeicSkill.LISTENING,
          rawScore: 2,
          maxRawScore: 2,
          normalizedScore: 100,
          estimatedToeicScore: null,
          status: SkillScoreStatus.FINAL,
          source: SkillScoreSource.OBJECTIVE_AUTO,
        },
        {
          skill: ToeicSkill.READING,
          rawScore: 0,
          maxRawScore: 0,
          normalizedScore: 0,
          estimatedToeicScore: null,
          status: SkillScoreStatus.FINAL,
          source: SkillScoreSource.OBJECTIVE_AUTO,
        },
      ],
    });
    transaction.testAttempt.findFirst
      .mockResolvedValueOnce(inProgress)
      .mockResolvedValueOnce(inProgress)
      .mockResolvedValueOnce(submitted);

    const result = await service.submit('learner-1', ATTEMPT_ID, {
      reason: PlacementSubmitReason.MANUAL,
    });

    expect(result).toEqual(expect.objectContaining({ status: TestAttemptStatus.SUBMITTED }));
    expect(transaction.testAttempt.findFirst).toHaveBeenCalledTimes(3);
    expect(transaction.attemptSkillScore.upsert).toHaveBeenCalledTimes(2);
    expect(transaction.attemptSkillScore.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          skill: ToeicSkill.LISTENING,
          rawScore: 2,
          maxRawScore: 2,
          normalizedScore: 100,
          status: SkillScoreStatus.FINAL,
          source: SkillScoreSource.OBJECTIVE_AUTO,
        }),
      }),
    );
    expect(result).toEqual(expect.objectContaining({ score: 2, maxScore: 2 }));
    expect(sideEffectCreate).not.toHaveBeenCalled();
    expect(recommendationService.ensureAndProject).toHaveBeenCalledWith(
      ATTEMPT_ID,
      'learner-1',
    );
    expect(result).toEqual(
      expect.objectContaining({ enhancement: { status: 'READY', error: null } }),
    );
  });

  it('preserves the submitted objective result when M04 enrichment is unavailable', async () => {
    const { service, transaction, recommendationService } = harness();
    transaction.testAttempt.findFirst.mockResolvedValue(
      attempt({ status: TestAttemptStatus.SUBMITTED, submittedAt: new Date() }),
    );
    recommendationService.ensureAndProject.mockRejectedValue(new Error('configuration unavailable'));

    const result = await service.getResult('learner-1', ATTEMPT_ID);

    expect(result).toEqual(
      expect.objectContaining({
        status: TestAttemptStatus.SUBMITTED,
        evaluation: null,
        recommendations: [],
        enhancement: expect.objectContaining({ status: 'ERROR' }),
      }),
    );
  });

  it('returns an already-submitted result without writing again', async () => {
    const { service, transaction } = harness();
    transaction.testAttempt.findFirst.mockResolvedValue(
      attempt({ status: TestAttemptStatus.SUBMITTED, submittedAt: new Date() }),
    );

    await service.submit('learner-1', ATTEMPT_ID, { reason: PlacementSubmitReason.MANUAL });

    expect(transaction.testAnswer.upsert).not.toHaveBeenCalled();
    expect(transaction.attemptSkillScore.upsert).not.toHaveBeenCalled();
    expect(transaction.testAttempt.update).not.toHaveBeenCalled();
  });

  it('lazily finalizes an expired attempt when the result is requested', async () => {
    const { service, transaction } = harness();
    const expired = attempt({ startedAt: new Date(Date.now() - 60 * 60_000) });
    const submitted = attempt({
      status: TestAttemptStatus.SUBMITTED,
      startedAt: expired.startedAt,
      submittedAt: new Date(),
    });
    transaction.testAttempt.findFirst
      .mockResolvedValueOnce(expired)
      .mockResolvedValueOnce(expired)
      .mockResolvedValueOnce(submitted)
      .mockResolvedValueOnce(submitted);

    const result = await service.getResult('learner-1', ATTEMPT_ID);

    expect(transaction.testAttempt.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: ATTEMPT_ID },
        data: expect.objectContaining({ status: TestAttemptStatus.SUBMITTED }),
      }),
    );
    expect(result).toEqual(expect.objectContaining({ status: TestAttemptStatus.SUBMITTED }));
  });

  it('filters history by learner and completed pre-enrollment Placement context', async () => {
    const { service, prisma } = harness();
    prisma.testAttempt.findMany.mockResolvedValue([]);

    await service.getHistory('learner-1');

    expect(prisma.testAttempt.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          learnerId: 'learner-1',
          status: TestAttemptStatus.SUBMITTED,
          enrollmentId: null,
          classAssessmentId: null,
          test: { purpose: 'PLACEMENT' },
        },
      }),
    );
  });
});
