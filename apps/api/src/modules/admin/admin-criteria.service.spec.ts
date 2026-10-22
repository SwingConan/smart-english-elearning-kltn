import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import {
  CriterionRuleMode,
  PlacementMode,
  Prisma,
  ToeicSkill,
} from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AdminCriteriaService } from './admin-criteria.service';
import {
  CourseRecommendationProfileState,
  UpdateCourseRecommendationProfileDto,
} from './dto/admin-criteria.dto';

describe('AdminCriteriaService', () => {
  const now = new Date('2026-10-22T00:00:00.000Z');
  const band = (code: string, orderIndex: number, minValue: number, maxValue: number) => ({
    id: `band-${code}`,
    code,
    label: code,
    orderIndex,
    minValue: new Prisma.Decimal(minValue),
    maxValue: new Prisma.Decimal(maxValue),
    metric: 'LR_NORMALIZED',
    skill: null,
  });
  const policy = () => ({
    id: 'policy-id',
    code: 'M04_PLACEMENT_LR_NORMALIZED_V1',
    name: 'Placement L&R',
    placementMode: PlacementMode.LR,
    isActive: true,
    updatedAt: now,
    bands: [
      band('FOUNDATION', 0, 0, 45),
      band('DEVELOPING', 1, 45, 70),
      band('ADVANCING', 2, 70, 100),
    ],
  });
  const course = {
    id: 'course-id',
    title: 'TOEIC L&R',
    slug: 'toeic-lr',
    level: 'FOUNDATION',
    skillScope: 'LR',
    isPublished: true,
  };
  const profile = (overrides: Record<string, unknown> = {}) => ({
    id: 'profile-id',
    ruleMode: CriterionRuleMode.ALL,
    priority: 100,
    isActive: true,
    updatedAt: now,
    criteria: [
      {
        skill: ToeicSkill.LISTENING,
        minNormalizedScore: new Prisma.Decimal(0),
        maxNormalizedScore: new Prisma.Decimal(65),
      },
    ],
    ...overrides,
  });
  const prisma = {
    evaluationPolicy: { findMany: jest.fn() },
    evaluationBand: { update: jest.fn() },
    course: { findMany: jest.fn(), count: jest.fn(), findUnique: jest.fn() },
    courseRecommendationProfile: {
      upsert: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    courseSkillCriterion: { deleteMany: jest.fn(), upsert: jest.fn() },
    $transaction: jest.fn(),
  };
  const service = new AdminCriteriaService(prisma as unknown as PrismaService);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.evaluationPolicy.findMany.mockResolvedValue([policy()]);
    prisma.evaluationBand.update.mockResolvedValue({});
    prisma.course.findUnique.mockResolvedValue(course);
    prisma.courseRecommendationProfile.upsert.mockResolvedValue({ id: 'profile-id' });
    prisma.courseRecommendationProfile.findUniqueOrThrow.mockResolvedValue(profile());
    prisma.courseSkillCriterion.deleteMany.mockResolvedValue({ count: 0 });
    prisma.courseSkillCriterion.upsert.mockResolvedValue({});
    prisma.$transaction.mockImplementation(async (work: unknown) => {
      if (typeof work === 'function') return work(prisma);
      return Promise.all(work as Promise<unknown>[]);
    });
  });

  it('resolves and projects exactly one active normalized LR policy', async () => {
    await expect(service.getPlacementEvaluation()).resolves.toMatchObject({
      policy: { code: 'M04_PLACEMENT_LR_NORMALIZED_V1' },
      bands: [
        { code: 'FOUNDATION', minValue: 0, maxValue: 45 },
        { code: 'DEVELOPING', minValue: 45, maxValue: 70 },
        { code: 'ADVANCING', minValue: 70, maxValue: 100 },
      ],
    });
    expect(prisma.evaluationPolicy.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { placementMode: PlacementMode.LR, isActive: true } }),
    );
  });

  it('rejects zero or multiple active LR policies as controlled configuration conflicts', async () => {
    prisma.evaluationPolicy.findMany.mockResolvedValueOnce([]);
    await expect(service.getPlacementEvaluation()).rejects.toBeInstanceOf(ConflictException);
    prisma.evaluationPolicy.findMany.mockResolvedValueOnce([policy(), policy()]);
    await expect(service.getPlacementEvaluation()).rejects.toBeInstanceOf(ConflictException);
  });

  it('updates the three shared ranges atomically without touching historical models', async () => {
    const result = await service.updatePlacementEvaluation({
      foundationUpperBoundary: 42.5,
      advancingLowerBoundary: 72.25,
    });
    expect(result.policy.code).toBe('M04_PLACEMENT_LR_NORMALIZED_V1');
    expect(prisma.evaluationBand.update.mock.calls.map(([call]) => call.data)).toEqual([
      { minValue: 0, maxValue: 42.5 },
      { minValue: 42.5, maxValue: 72.25 },
      { minValue: 72.25, maxValue: 100 },
    ]);
    expect(prisma).not.toHaveProperty('attemptEvaluation');
  });

  it.each([
    [0, 70],
    [45, 45],
    [70, 45],
    [45, 100],
    [45.123, 70],
  ])('rejects invalid placement boundaries %s/%s', async (foundation, advancing) => {
    await expect(
      service.updatePlacementEvaluation({
        foundationUpperBoundary: foundation,
        advancingLowerBoundary: advancing,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.evaluationBand.update).not.toHaveBeenCalled();
  });

  it('rejects malformed persisted band identity or ranges instead of repairing them', async () => {
    const malformed = policy();
    malformed.bands[1].minValue = new Prisma.Decimal(44);
    prisma.evaluationPolicy.findMany.mockResolvedValueOnce([malformed]);
    await expect(service.getPlacementEvaluation()).rejects.toBeInstanceOf(ConflictException);
  });

  it('lists courses first and supports unconfigured profile filtering', async () => {
    prisma.course.findMany.mockResolvedValue([{ ...course, recommendationProfile: null }]);
    prisma.course.count.mockResolvedValue(1);
    const result = await service.listCourseRecommendations({
      profileState: CourseRecommendationProfileState.UNCONFIGURED,
      page: 1,
      limit: 20,
    });
    expect(result.data).toEqual([{ course, profile: null }]);
    expect(prisma.course.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { recommendationProfile: { is: null } },
        orderBy: [{ title: 'asc' }, { id: 'asc' }],
      }),
    );
  });

  it('returns a course with null profile and maps a missing course to 404', async () => {
    prisma.course.findUnique.mockResolvedValueOnce({ ...course, recommendationProfile: null });
    await expect(service.getCourseRecommendation(course.id)).resolves.toEqual({
      course,
      profile: null,
    });
    prisma.course.findUnique.mockResolvedValueOnce(null);
    await expect(service.getCourseRecommendation('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('upserts a complete course profile and removes only omitted configuration criteria', async () => {
    const input: UpdateCourseRecommendationProfileDto = {
      isActive: true,
      ruleMode: CriterionRuleMode.ANY,
      priority: 12,
      criteria: [
        {
          skill: ToeicSkill.READING,
          minNormalizedScore: 10,
          maxNormalizedScore: 80,
        },
      ],
    };
    const result = await service.updateCourseRecommendation(course.id, input);
    expect(result.course).toEqual(course);
    expect(prisma.courseRecommendationProfile.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { courseId: course.id },
        update: { isActive: true, ruleMode: CriterionRuleMode.ANY, priority: 12 },
      }),
    );
    expect(prisma.courseSkillCriterion.deleteMany).toHaveBeenCalledWith({
      where: { profileId: 'profile-id', skill: { notIn: [ToeicSkill.READING] } },
    });
    expect(prisma.courseSkillCriterion.upsert).toHaveBeenCalledTimes(1);
    expect(prisma).not.toHaveProperty('courseRecommendation');
  });

  it('allows an inactive empty profile while preserving the profile row', async () => {
    await expect(
      service.updateCourseRecommendation(course.id, {
        isActive: false,
        ruleMode: CriterionRuleMode.ALL,
        priority: 100,
        criteria: [],
      }),
    ).resolves.toBeDefined();
    expect(prisma.courseRecommendationProfile.upsert).toHaveBeenCalled();
    expect(prisma.courseSkillCriterion.deleteMany).toHaveBeenCalledWith({
      where: { profileId: 'profile-id' },
    });
  });

  it.each([
    [
      'active empty',
      { isActive: true, ruleMode: CriterionRuleMode.ALL, priority: 1, criteria: [] },
    ],
    [
      'duplicate skill',
      {
        isActive: true,
        ruleMode: CriterionRuleMode.ALL,
        priority: 1,
        criteria: [
          { skill: ToeicSkill.READING, minNormalizedScore: 0, maxNormalizedScore: 50 },
          { skill: ToeicSkill.READING, minNormalizedScore: 50, maxNormalizedScore: 100 },
        ],
      },
    ],
    [
      'empty range',
      {
        isActive: true,
        ruleMode: CriterionRuleMode.ALL,
        priority: 1,
        criteria: [
          { skill: ToeicSkill.READING, minNormalizedScore: null, maxNormalizedScore: null },
        ],
      },
    ],
    [
      'descending range',
      {
        isActive: true,
        ruleMode: CriterionRuleMode.ALL,
        priority: 1,
        criteria: [{ skill: ToeicSkill.READING, minNormalizedScore: 80, maxNormalizedScore: 20 }],
      },
    ],
    [
      'out-of-range score',
      {
        isActive: true,
        ruleMode: CriterionRuleMode.ALL,
        priority: 1,
        criteria: [{ skill: ToeicSkill.READING, minNormalizedScore: -1, maxNormalizedScore: 101 }],
      },
    ],
    [
      'unsupported skill',
      {
        isActive: true,
        ruleMode: CriterionRuleMode.ALL,
        priority: 1,
        criteria: [{ skill: ToeicSkill.SPEAKING, minNormalizedScore: 0, maxNormalizedScore: 100 }],
      },
    ],
    [
      'invalid priority',
      {
        isActive: true,
        ruleMode: CriterionRuleMode.ALL,
        priority: 10_001,
        criteria: [{ skill: ToeicSkill.READING, minNormalizedScore: 0, maxNormalizedScore: 100 }],
      },
    ],
  ])('rejects invalid profile configuration: %s', async (_name, input) => {
    await expect(
      service.updateCourseRecommendation(course.id, input as UpdateCourseRecommendationProfileDto),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.courseRecommendationProfile.upsert).not.toHaveBeenCalled();
  });
});
