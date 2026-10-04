import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { AnswerEvaluationStatus, Prisma, QuestionResponseType, ToeicSkill } from '../../generated/prisma/client';
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
    classAssessment: { findFirst: jest.fn() },
    testAnswer: { findFirst: jest.fn(), update: jest.fn() },
    answerEvaluation: { create: jest.fn(), update: jest.fn() },
    rubricCriterionScore: { upsert: jest.fn() },
    testQuestion: { findMany: jest.fn() },
    attemptSkillScore: { deleteMany: jest.fn(), upsert: jest.fn() },
  };
  const prisma = { classAssessment: { findFirst: jest.fn() }, $transaction: jest.fn() };
  const storage = { open: jest.fn() };
  const service = new ClassAssessmentService(prisma as unknown as PrismaService, storage as unknown as AssessmentResponseStorage);

  beforeEach(() => {
    jest.clearAllMocks();
    tx.classAssessment.findFirst.mockResolvedValue(assessment);
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

  it('requires an explicit edit action before changing final instructor judgment', async () => {
    tx.testAnswer.findFirst.mockResolvedValue({ id: 'answer-id', textResponse: null, audioStorageKey: 'responses/a.webm', testQuestion: { points: 10, question: { responseType: QuestionResponseType.AUDIO_RESPONSE, toeicSkill: ToeicSkill.SPEAKING, rubric } }, evaluations: [{ id: 'evaluation-id', status: AnswerEvaluationStatus.REVIEWED_FINAL }] });
    await expect(service.gradeAnswer('instructor-id', 'class-id', 'assessment-id', 'attempt-id', 'test-question-id', { criteria: [], finalize: false }))
      .rejects.toBeInstanceOf(ConflictException);
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
