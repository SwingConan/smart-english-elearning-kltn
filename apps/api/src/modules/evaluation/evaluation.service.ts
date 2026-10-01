import { Injectable } from '@nestjs/common';
import {
  AttemptEvaluationStatus,
  EvaluationMetric,
  PlacementMode,
  Prisma,
  TestAttemptStatus,
  TestPurpose,
} from '../../generated/prisma/client';
import { evaluatePlacement, requireSinglePolicy } from './evaluation.engine';
import { M04DomainError } from './m04-domain.error';

@Injectable()
export class EvaluationService {
  async ensure(transaction: Prisma.TransactionClient, attemptId: string) {
    const attempt = await transaction.testAttempt.findFirst({
      where: {
        id: attemptId,
        status: TestAttemptStatus.SUBMITTED,
        enrollmentId: null,
        classAssessmentId: null,
        test: { purpose: TestPurpose.PLACEMENT, placementMode: PlacementMode.LR },
      },
      select: {
        id: true,
        score: true,
        maxScore: true,
        evaluation: true,
        skillScores: {
          select: {
            skill: true,
            normalizedScore: true,
            rawScore: true,
            maxRawScore: true,
            status: true,
          },
        },
      },
    });
    if (!attempt) {
      throw new M04DomainError('EVALUATION_INPUT_INVALID', 'Bài kiểm tra chưa sẵn sàng để đánh giá.');
    }

    const commonInput = {
      score: attempt.score,
      maxScore: attempt.maxScore,
      skillScores: attempt.skillScores.map((skillScore) => ({
        ...skillScore,
        normalizedScore: Number(skillScore.normalizedScore),
        rawScore: skillScore.rawScore === null ? null : Number(skillScore.rawScore),
        maxRawScore: skillScore.maxRawScore === null ? null : Number(skillScore.maxRawScore),
      })),
    };

    if (attempt.evaluation) {
      const overallNormalizedScore = this.overall(attempt.score, attempt.maxScore);
      return this.project(attempt.evaluation, overallNormalizedScore);
    }

    const policy = requireSinglePolicy(
      await transaction.evaluationPolicy.findMany({
        where: { placementMode: PlacementMode.LR, isActive: true },
        include: { bands: { orderBy: [{ orderIndex: 'asc' }, { code: 'asc' }] } },
      }),
    );
    const bands = policy.bands
      .filter(({ metric }) => metric === EvaluationMetric.LR_NORMALIZED)
      .map((band) => ({
        ...band,
        minValue: Number(band.minValue),
        maxValue: Number(band.maxValue),
      }));
    const evaluated = evaluatePlacement({ ...commonInput, bands });
    const created = await transaction.attemptEvaluation.create({
      data: {
        attemptId,
        evaluationPolicyId: policy.id,
        status: AttemptEvaluationStatus.FINAL,
        placementLevelCode: evaluated.band.code,
        placementLevelLabel: evaluated.band.label,
        strongestSkill: evaluated.strongestSkill,
        weakestSkill: evaluated.weakestSkill,
        lrTotalScore: null,
        summary: evaluated.summary,
        aiExplanation: null,
      },
    });
    return this.project(created, evaluated.overallNormalizedScore);
  }

  private project(
    evaluation: {
      status: AttemptEvaluationStatus;
      evaluationPolicyId: string | null;
      placementLevelCode: string | null;
      placementLevelLabel: string | null;
      strongestSkill: string | null;
      weakestSkill: string | null;
      lrTotalScore: number | null;
      summary: string | null;
      aiExplanation: string | null;
    },
    overallNormalizedScore: number,
  ) {
    return {
      status: evaluation.status,
      levelCode: evaluation.placementLevelCode,
      levelLabel: evaluation.placementLevelLabel,
      overallNormalizedScore,
      strongestSkill: evaluation.strongestSkill,
      weakestSkill: evaluation.weakestSkill,
      balanceState:
        evaluation.strongestSkill === null && evaluation.weakestSkill === null
          ? ('BALANCED' as const)
          : ('IMBALANCED' as const),
      summary: evaluation.summary,
      lrTotalScore: evaluation.lrTotalScore,
      aiExplanation: evaluation.aiExplanation,
      evaluationPolicyId: evaluation.evaluationPolicyId,
    };
  }

  private overall(score: number | null, maxScore: number | null): number {
    if (score === null || maxScore === null || maxScore <= 0) {
      throw new M04DomainError('EVALUATION_INPUT_INVALID', 'Kết quả bài kiểm tra không đủ dữ liệu để đánh giá.');
    }
    return Math.round((score / maxScore) * 10_000) / 100;
  }
}
