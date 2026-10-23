import { AnswerEvaluationStatus } from '../../generated/prisma/client';

export type ProductiveAnswerReview = {
  evaluations: Array<{ status: AnswerEvaluationStatus }>;
};

export type GradingState = 'SUBMITTED_PENDING_REVIEW' | 'PARTIALLY_REVIEWED' | 'REVIEWED_FINAL';

export interface GradingStateProjection {
  gradingState: GradingState;
  totalProductiveAnswers: number;
  pendingProductiveAnswers: number;
}

export function computeProductiveGradingState(
  answers: ProductiveAnswerReview[],
): GradingStateProjection {
  const totalProductiveAnswers = answers.length;
  const reviewedFinal = answers.filter((answer) =>
    answer.evaluations.some(({ status }) => status === AnswerEvaluationStatus.REVIEWED_FINAL),
  ).length;
  const pendingProductiveAnswers = totalProductiveAnswers - reviewedFinal;
  const gradingState: GradingState =
    totalProductiveAnswers > 0 && pendingProductiveAnswers === 0
      ? 'REVIEWED_FINAL'
      : reviewedFinal > 0
        ? 'PARTIALLY_REVIEWED'
        : 'SUBMITTED_PENDING_REVIEW';

  return { gradingState, totalProductiveAnswers, pendingProductiveAnswers };
}
