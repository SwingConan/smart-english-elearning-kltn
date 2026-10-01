import { Prisma } from '../../generated/prisma/client';
import { RecommendationService } from './recommendation.service';

const evaluation = {
  status: 'FINAL',
  levelCode: 'FOUNDATION',
  levelLabel: 'Nền tảng',
  overallNormalizedScore: 40,
  strongestSkill: null,
  weakestSkill: null,
  balanceState: 'BALANCED',
  summary: 'Kết quả cân bằng.',
  lrTotalScore: null,
  aiExplanation: null,
  evaluationPolicyId: 'policy-1',
};

describe('RecommendationService concurrency and snapshot behavior', () => {
  it('retries a P2002 race and projects the winning snapshot', async () => {
    const race = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: '7.10.0',
    });
    const prisma = {
      $transaction: jest.fn().mockRejectedValueOnce(race).mockResolvedValueOnce(evaluation),
      courseRecommendation: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new RecommendationService(prisma as never, {} as never);

    await expect(service.ensureAndProject('attempt-1', 'learner-1')).resolves.toEqual({
      evaluation,
      recommendations: [],
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it('does not regenerate a completed historical no-match snapshot', async () => {
    const transaction = {
      attemptEvaluation: { findFirst: jest.fn().mockResolvedValue({ id: 'evaluation-1' }) },
      courseRecommendation: { count: jest.fn().mockResolvedValue(0), createMany: jest.fn() },
    };
    const prisma = {
      $transaction: jest.fn(async (operation: (tx: unknown) => unknown) => operation(transaction)),
      courseRecommendation: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const evaluationService = { ensure: jest.fn().mockResolvedValue(evaluation) };
    const service = new RecommendationService(prisma as never, evaluationService as never);

    await expect(service.ensureAndProject('attempt-1', 'learner-1')).resolves.toEqual({
      evaluation,
      recommendations: [],
    });
    expect(evaluationService.ensure).toHaveBeenCalledTimes(1);
    expect(transaction.courseRecommendation.createMany).not.toHaveBeenCalled();
  });
});
