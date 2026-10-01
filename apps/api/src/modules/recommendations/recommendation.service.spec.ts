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

const reason = (priority: number) => ({
  schemaVersion: 1,
  evaluationPolicyCode: 'M04_PLACEMENT_LR_NORMALIZED_V1',
  evaluationLevel: 'FOUNDATION',
  profile: { ruleMode: 'ALL', priority },
  criteria: [],
});

const course = (id: string, classOfferings: unknown[] = []) => ({
  id,
  slug: id,
  title: id,
  description: 'Course description',
  level: 'FOUNDATION',
  skillScope: 'LR',
  thumbnailUrl: null,
  isPublished: true,
  classOfferings,
});

const offering = (override: Record<string, unknown>) => ({
  id: 'offering-default',
  code: 'CLASS-DEFAULT',
  name: 'Default class',
  status: 'OPEN',
  instructor: null,
  modality: 'ONLINE',
  pricingType: 'FREE',
  tuitionFeeVnd: 0,
  totalSessions: 10,
  totalPeriods: 20,
  enrollmentStart: null,
  enrollmentEnd: null,
  classStart: new Date('2026-12-01T00:00:00Z'),
  classEnd: new Date('2027-01-01T00:00:00Z'),
  scheduleSlots: [],
  maxStudents: 20,
  enrollments: [],
  _count: { enrollments: 0 },
  ...override,
});

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

  it('projects persisted recommendations by kind, saved priority, then Course ID', async () => {
    const rows = [
      { kind: 'SUPPLEMENTARY', courseId: 'course-a', ruleReason: reason(200), course: course('course-a') },
      { kind: 'PRIMARY', courseId: 'course-primary', ruleReason: reason(50), course: course('course-primary') },
      { kind: 'SUPPLEMENTARY', courseId: 'course-z', ruleReason: reason(100), course: course('course-z') },
    ];
    const prisma = {
      $transaction: jest.fn().mockResolvedValue(evaluation),
      courseRecommendation: { findMany: jest.fn().mockResolvedValue(rows) },
    };
    const service = new RecommendationService(prisma as never, {} as never);

    const projected = await service.ensureAndProject('attempt-1', 'learner-1');

    expect(projected.recommendations.map(({ course: item }) => item.id)).toEqual([
      'course-primary',
      'course-z',
      'course-a',
    ]);
  });

  it('projects an actionable AVAILABLE class before an earlier non-actionable class', async () => {
    const rows = [{
      kind: 'PRIMARY',
      courseId: 'course-1',
      ruleReason: reason(50),
      course: course('course-1', [
        offering({
          id: 'closed-earlier',
          code: 'CLOSED',
          name: 'Closed earlier class',
          status: 'IN_PROGRESS',
          classStart: new Date('2026-01-01T00:00:00Z'),
        }),
        offering({
          id: 'available-later',
          code: 'AVAILABLE',
          name: 'Available later class',
          classStart: new Date('2026-12-01T00:00:00Z'),
        }),
      ]),
    }];
    const prisma = {
      $transaction: jest.fn().mockResolvedValue(evaluation),
      courseRecommendation: { findMany: jest.fn().mockResolvedValue(rows) },
    };
    const service = new RecommendationService(prisma as never, {} as never);

    const projected = await service.ensureAndProject('attempt-1', 'learner-1');

    expect(projected.recommendations[0].classOfferings.map(({ id }) => id)).toEqual([
      'available-later',
      'closed-earlier',
    ]);
    expect(projected.recommendations[0].classOfferings[0]).toMatchObject({
      registrationState: 'AVAILABLE',
      actionable: true,
    });
  });
});
