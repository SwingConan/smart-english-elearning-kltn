import { AnswerEvaluationStatus } from '../../generated/prisma/client';
import { computeProductiveGradingState } from './grading-state';

describe('computeProductiveGradingState', () => {
  const answer = (...statuses: AnswerEvaluationStatus[]) => ({
    evaluations: statuses.map((status) => ({ status })),
  });

  it('keeps zero-final and zero-answer submissions out of a false final state', () => {
    expect(computeProductiveGradingState([])).toEqual({
      gradingState: 'SUBMITTED_PENDING_REVIEW',
      totalProductiveAnswers: 0,
      pendingProductiveAnswers: 0,
    });
    expect(computeProductiveGradingState([answer()])).toMatchObject({
      gradingState: 'SUBMITTED_PENDING_REVIEW',
      pendingProductiveAnswers: 1,
    });
  });

  it('keeps partial reviews in backlog and requires every productive answer to be final', () => {
    expect(
      computeProductiveGradingState([answer(AnswerEvaluationStatus.REVIEWED_FINAL), answer()]),
    ).toMatchObject({ gradingState: 'PARTIALLY_REVIEWED', pendingProductiveAnswers: 1 });
    expect(
      computeProductiveGradingState([
        answer(AnswerEvaluationStatus.REVIEWED_FINAL),
        answer(AnswerEvaluationStatus.REVIEWED_FINAL),
      ]),
    ).toMatchObject({ gradingState: 'REVIEWED_FINAL', pendingProductiveAnswers: 0 });
  });

  it('does not treat AI provisional or pending evaluations as Instructor final', () => {
    expect(
      computeProductiveGradingState([
        answer(AnswerEvaluationStatus.AI_PROVISIONAL, AnswerEvaluationStatus.PENDING_REVIEW),
      ]),
    ).toMatchObject({
      gradingState: 'SUBMITTED_PENDING_REVIEW',
      pendingProductiveAnswers: 1,
    });
  });
});
