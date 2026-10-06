import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { AnswerEvaluationStatus, AssessmentStage, Prisma, QuestionResponseType, ToeicSkill } from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AssessmentResponseStorage } from '../placement/assessment-response.storage';
import { ClassAssessmentService } from './class-assessment.service';

describe('ClassAssessmentService', () => {
  const assessment = { id: 'assessment-id', stage: 'MIDTERM', test: { id: 'test-id', title: 'Midterm' }, classOffering: { id: 'class-id', code: 'C1', name: 'Class', course: { id: 'course-id', title: 'Course' } } };
  const rubric = { id: 'rubric-id', criteria: [
    { id: 'criterion-a', maxScore: new Prisma.Decimal('4'), weight: new Prisma.Decimal('1'), orderIndex: 0 },
    { id: 'criterion-b', maxScore: new Prisma.Decimal('6'), weight: new Prisma.Decimal('2'), orderIndex: 1 },
  ] };
  const tx = {
    classOffering: { findFirst: jest.fn() },
    test: { findFirst: jest.fn() },
    classAssessment: { findFirst: jest.fn(), create: jest.fn() },
    testAnswer: { findFirst: jest.fn(), update: jest.fn() },
    answerEvaluation: { create: jest.fn(), update: jest.fn() },
    rubricCriterionScore: { upsert: jest.fn() },
    testQuestion: { findMany: jest.fn() },
    attemptSkillScore: { deleteMany: jest.fn(), upsert: jest.fn() },
  };
  const prisma = { classAssessment: { findFirst: jest.fn() }, $transaction: jest.fn() };
  const storage = { open: jest.fn() };
  const assessmentInstructorService = { validatePublishableTest: jest.fn() };
  const service = new ClassAssessmentService(prisma as unknown as PrismaService, storage as unknown as AssessmentResponseStorage, assessmentInstructorService as never);

  beforeEach(() => {
    jest.clearAllMocks();
    tx.classAssessment.findFirst.mockResolvedValue(assessment);
    tx.classOffering.findFirst.mockResolvedValue({ id: 'class-id', code: 'C1', name: 'Class', courseId: 'course-id', course: { id: 'course-id', title: 'Course' } });
    tx.test.findFirst.mockResolvedValue({ id: 'test-id' });
    assessmentInstructorService.validatePublishableTest.mockResolvedValue(undefined);
    prisma.$transaction.mockImplementation((operation: (client: typeof tx) => Promise<unknown>) => operation(tx));
    tx.answerEvaluation.create.mockResolvedValue({ id: 'evaluation-id' });
    tx.testQuestion.findMany.mockResolvedValue([]);
    jest.spyOn(service, 'gradingDetail').mockResolvedValue({ id: 'attempt-id' } as never);
  });

  it('rejects grading outside an instructor-owned class assessment', async () => {
    tx.classAssessment.findFirst.mockResolvedValue(null);
    await expect(service.gradeAnswer('other-instructor', 'class-id', 'assessment-id', 'attempt-id', 'test-question-id', { criteria: [], finalize: false }))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.testAnswer.findFirst).not.toHaveBeenCalled();
  });

  it('uses exact Decimal weighted rubric math and HALF_UP persisted points', async () => {
    tx.testAnswer.findFirst.mockResolvedValue({ id: 'answer-id', textResponse: 'A real learner response', audioStorageKey: null, testQuestion: { points: 7, question: { responseType: QuestionResponseType.TEXT_RESPONSE, toeicSkill: ToeicSkill.WRITING, rubric } }, evaluations: [] });
    await service.gradeAnswer('instructor-id', 'class-id', 'assessment-id', 'attempt-id', 'test-question-id', { criteria: [
      { rubricCriterionId: 'criterion-a', score: '3' },
      { rubricCriterionId: 'criterion-b', score: '5' },
    ], feedback: 'Clear response', finalize: true });
    expect(tx.answerEvaluation.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: AnswerEvaluationStatus.REVIEWED_FINAL, totalScore: expect.any(Prisma.Decimal) }) }));
    const total = tx.answerEvaluation.create.mock.calls[0][0].data.totalScore as Prisma.Decimal;
    expect(total.toString()).toBe('80.56');
    const awarded = tx.testAnswer.update.mock.calls[0][0].data.pointsAwarded as Prisma.Decimal;
    expect(awarded.toString()).toBe('5.64');
  });

  it('normalizes a one-point productive question to a finite 80 percent score', async () => {
    tx.testAnswer.findFirst.mockResolvedValue({ id: 'answer-id', textResponse: 'A real learner response', audioStorageKey: null, testQuestion: { points: 1, question: { responseType: QuestionResponseType.TEXT_RESPONSE, toeicSkill: ToeicSkill.WRITING, rubric } }, evaluations: [] });
    tx.testQuestion.findMany.mockResolvedValue([{ id: 'test-question-id', points: 1, answers: [{ textResponse: 'A real learner response', audioStorageKey: null, pointsAwarded: new Prisma.Decimal('0.8'), testQuestion: { question: { responseType: QuestionResponseType.TEXT_RESPONSE } }, evaluations: [{ id: 'evaluation-id' }] }] }]);
    await service.gradeAnswer('instructor-id', 'class-id', 'assessment-id', 'attempt-id', 'test-question-id', { criteria: [
      { rubricCriterionId: 'criterion-a', score: '3.2' },
      { rubricCriterionId: 'criterion-b', score: '4.8' },
    ], finalize: true });
    const persisted = tx.attemptSkillScore.upsert.mock.calls[0][0].create;
    expect(persisted.rawScore.toString()).toBe('0.8');
    expect(persisted.maxRawScore.toString()).toBe('1');
    expect(persisted.normalizedScore.toString()).toBe('80');
  });

  it('rejects zero-point productive configuration before persisting a final skill score', async () => {
    tx.testAnswer.findFirst.mockResolvedValue({ id: 'answer-id', textResponse: 'A real learner response', audioStorageKey: null, testQuestion: { points: 0, question: { responseType: QuestionResponseType.TEXT_RESPONSE, toeicSkill: ToeicSkill.WRITING, rubric } }, evaluations: [] });
    tx.testQuestion.findMany.mockResolvedValue([{ id: 'test-question-id', points: 0, answers: [{ textResponse: 'A real learner response', audioStorageKey: null, pointsAwarded: new Prisma.Decimal(0), testQuestion: { question: { responseType: QuestionResponseType.TEXT_RESPONSE } }, evaluations: [{ id: 'evaluation-id' }] }] }]);
    await expect(service.gradeAnswer('instructor-id', 'class-id', 'assessment-id', 'attempt-id', 'test-question-id', { criteria: [
      { rubricCriterionId: 'criterion-a', score: '4' },
      { rubricCriterionId: 'criterion-b', score: '6' },
    ], finalize: true })).rejects.toMatchObject({ response: expect.objectContaining({ code: 'PRODUCTIVE_POINTS_CONFIGURATION_INVALID' }) });
    expect(tx.attemptSkillScore.upsert).not.toHaveBeenCalled();
  });

  it('requires an explicit edit action before changing final instructor judgment', async () => {
    tx.testAnswer.findFirst.mockResolvedValue({ id: 'answer-id', textResponse: null, audioStorageKey: 'responses/a.webm', testQuestion: { points: 10, question: { responseType: QuestionResponseType.AUDIO_RESPONSE, toeicSkill: ToeicSkill.SPEAKING, rubric } }, evaluations: [{ id: 'evaluation-id', status: AnswerEvaluationStatus.REVIEWED_FINAL }] });
    await expect(service.gradeAnswer('instructor-id', 'class-id', 'assessment-id', 'attempt-id', 'test-question-id', { criteria: [], finalize: false }))
      .rejects.toBeInstanceOf(ConflictException);
  });

  it('defensively validates the published invariant before scheduling', async () => {
    assessmentInstructorService.validatePublishableTest.mockRejectedValueOnce(new BadRequestException('invalid published test'));
    await expect(service.create('instructor-id', 'class-id', { testId: 'test-id', stage: AssessmentStage.MIDTERM }))
      .rejects.toThrow('invalid published test');
    expect(tx.classAssessment.create).not.toHaveBeenCalled();
  });

  it('rejects a stale grading tab before changing rubric or final state', async () => {
    tx.testAnswer.findFirst.mockResolvedValue({
      id: 'answer-id', textResponse: 'A real learner response', audioStorageKey: null,
      testQuestion: { points: 10, question: { responseType: QuestionResponseType.TEXT_RESPONSE, toeicSkill: ToeicSkill.WRITING, rubric } },
      evaluations: [{ id: 'evaluation-id', status: AnswerEvaluationStatus.PENDING_REVIEW, updatedAt: new Date('2026-10-06T00:00:00.000Z') }],
    });
    await expect(service.gradeAnswer('instructor-id', 'class-id', 'assessment-id', 'attempt-id', 'test-question-id', {
      criteria: [], finalize: false, expectedUpdatedAt: '2026-10-05T00:00:00.000Z',
    })).rejects.toMatchObject({ response: expect.objectContaining({ code: 'STALE_GRADING_EVALUATION' }) });
    expect(tx.answerEvaluation.update).not.toHaveBeenCalled();
    expect(tx.rubricCriterionScore.upsert).not.toHaveBeenCalled();
  });

  it('rejects out-of-range rubric scores before persistence', async () => {
    tx.testAnswer.findFirst.mockResolvedValue({ id: 'answer-id', textResponse: 'A real learner response', audioStorageKey: null, testQuestion: { points: 10, question: { responseType: QuestionResponseType.TEXT_RESPONSE, toeicSkill: ToeicSkill.WRITING, rubric } }, evaluations: [] });
    await expect(service.gradeAnswer('instructor-id', 'class-id', 'assessment-id', 'attempt-id', 'test-question-id', { criteria: [{ rubricCriterionId: 'criterion-a', score: '4.01' }], finalize: false }))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(tx.answerEvaluation.create).not.toHaveBeenCalled();
  });

  it.each([
    [QuestionResponseType.TEXT_RESPONSE, '   ', null],
    [QuestionResponseType.AUDIO_RESPONSE, null, null],
  ])('rejects grading a missing productive response (%s)', async (responseType, textResponse, audioStorageKey) => {
    tx.testAnswer.findFirst.mockResolvedValue({ id: 'answer-id', textResponse, audioStorageKey, testQuestion: { points: 10, question: { responseType, toeicSkill: responseType === QuestionResponseType.TEXT_RESPONSE ? ToeicSkill.WRITING : ToeicSkill.SPEAKING, rubric } }, evaluations: [] });
    await expect(service.gradeAnswer('instructor-id', 'class-id', 'assessment-id', 'attempt-id', 'test-question-id', { criteria: [], finalize: false }))
      .rejects.toMatchObject({ response: expect.objectContaining({ code: 'PRODUCTIVE_RESPONSE_MISSING' }) });
    expect(tx.answerEvaluation.create).not.toHaveBeenCalled();
  });
});
