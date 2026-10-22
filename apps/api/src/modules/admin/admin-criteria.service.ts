import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CriterionRuleMode,
  EvaluationMetric,
  PlacementMode,
  Prisma,
  ToeicSkill,
} from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { selectNormalizedBand } from '../evaluation/evaluation.engine';
import {
  AdminCourseRecommendationQueryDto,
  CourseRecommendationProfileState,
  UpdateCourseRecommendationProfileDto,
  UpdatePlacementEvaluationCriteriaDto,
} from './dto/admin-criteria.dto';

const EXPECTED_BANDS = [
  { code: 'FOUNDATION', orderIndex: 0 },
  { code: 'DEVELOPING', orderIndex: 1 },
  { code: 'ADVANCING', orderIndex: 2 },
] as const;

const courseSelect = {
  id: true,
  title: true,
  slug: true,
  level: true,
  skillScope: true,
  isPublished: true,
} satisfies Prisma.CourseSelect;

const profileSelect = {
  id: true,
  ruleMode: true,
  priority: true,
  isActive: true,
  updatedAt: true,
  criteria: {
    orderBy: { skill: 'asc' as const },
    select: {
      skill: true,
      minNormalizedScore: true,
      maxNormalizedScore: true,
    },
  },
} satisfies Prisma.CourseRecommendationProfileSelect;

type CriteriaClient = Pick<PrismaService, 'evaluationPolicy'> | Prisma.TransactionClient;

@Injectable()
export class AdminCriteriaService {
  constructor(private readonly prisma: PrismaService) {}

  async getPlacementEvaluation() {
    const policy = await this.requireValidPlacementPolicy(this.prisma);
    return this.projectPlacementPolicy(policy);
  }

  async updatePlacementEvaluation(input: UpdatePlacementEvaluationCriteriaDto) {
    this.validatePlacementBoundaries(input);
    return this.prisma.$transaction(async (transaction) => {
      const policy = await this.requireValidPlacementPolicy(transaction);
      const bandsByCode = new Map(policy.bands.map((band) => [band.code, band]));
      const ranges = {
        FOUNDATION: [0, input.foundationUpperBoundary],
        DEVELOPING: [input.foundationUpperBoundary, input.advancingLowerBoundary],
        ADVANCING: [input.advancingLowerBoundary, 100],
      } as const;

      await Promise.all(
        EXPECTED_BANDS.map(({ code }) => {
          const band = bandsByCode.get(code)!;
          return transaction.evaluationBand.update({
            where: { id: band.id },
            data: { minValue: ranges[code][0], maxValue: ranges[code][1] },
          });
        }),
      );

      return this.projectPlacementPolicy(await this.requireValidPlacementPolicy(transaction));
    });
  }

  async listCourseRecommendations(query: AdminCourseRecommendationQueryDto) {
    const profileFilter: Prisma.CourseWhereInput =
      query.profileState === CourseRecommendationProfileState.ACTIVE
        ? { recommendationProfile: { is: { isActive: true } } }
        : query.profileState === CourseRecommendationProfileState.INACTIVE
          ? { recommendationProfile: { is: { isActive: false } } }
          : query.profileState === CourseRecommendationProfileState.UNCONFIGURED
            ? { recommendationProfile: { is: null } }
            : {};
    const where: Prisma.CourseWhereInput = {
      ...profileFilter,
      ...(query.search ? { title: { contains: query.search, mode: 'insensitive' } } : {}),
      ...(query.isPublished !== undefined ? { isPublished: query.isPublished } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.course.findMany({
        where,
        orderBy: [{ title: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: { ...courseSelect, recommendationProfile: { select: profileSelect } },
      }),
      this.prisma.course.count({ where }),
    ]);
    return {
      data: rows.map(({ recommendationProfile, ...course }) => ({
        course,
        profile: recommendationProfile ? this.projectCourseProfile(recommendationProfile) : null,
      })),
      meta: {
        total,
        page: query.page,
        limit: query.limit,
        totalPages: total === 0 ? 0 : Math.ceil(total / query.limit),
      },
    };
  }

  async getCourseRecommendation(courseId: string) {
    const row = await this.prisma.course.findUnique({
      where: { id: courseId },
      select: { ...courseSelect, recommendationProfile: { select: profileSelect } },
    });
    if (!row) {
      throw new NotFoundException({
        code: 'COURSE_NOT_FOUND',
        message: 'Không tìm thấy khóa học.',
      });
    }
    const { recommendationProfile, ...course } = row;
    return {
      course,
      profile: recommendationProfile ? this.projectCourseProfile(recommendationProfile) : null,
    };
  }

  async updateCourseRecommendation(courseId: string, input: UpdateCourseRecommendationProfileDto) {
    this.validateCourseProfile(input);
    return this.prisma.$transaction(async (transaction) => {
      const course = await transaction.course.findUnique({
        where: { id: courseId },
        select: courseSelect,
      });
      if (!course) {
        throw new NotFoundException({
          code: 'COURSE_NOT_FOUND',
          message: 'Không tìm thấy khóa học.',
        });
      }
      const profile = await transaction.courseRecommendationProfile.upsert({
        where: { courseId },
        create: {
          courseId,
          isActive: input.isActive,
          ruleMode: input.ruleMode,
          priority: input.priority,
        },
        update: {
          isActive: input.isActive,
          ruleMode: input.ruleMode,
          priority: input.priority,
        },
        select: { id: true },
      });
      const submittedSkills = input.criteria.map(({ skill }) => skill);
      await transaction.courseSkillCriterion.deleteMany({
        where: {
          profileId: profile.id,
          ...(submittedSkills.length ? { skill: { notIn: submittedSkills } } : {}),
        },
      });
      await Promise.all(
        input.criteria.map((criterion) =>
          transaction.courseSkillCriterion.upsert({
            where: { profileId_skill: { profileId: profile.id, skill: criterion.skill } },
            create: { profileId: profile.id, ...criterion },
            update: {
              minNormalizedScore: criterion.minNormalizedScore,
              maxNormalizedScore: criterion.maxNormalizedScore,
            },
          }),
        ),
      );
      const saved = await transaction.courseRecommendationProfile.findUniqueOrThrow({
        where: { id: profile.id },
        select: profileSelect,
      });
      return { course, profile: this.projectCourseProfile(saved) };
    });
  }

  private async requireValidPlacementPolicy(client: CriteriaClient) {
    const policies = await client.evaluationPolicy.findMany({
      where: { placementMode: PlacementMode.LR, isActive: true },
      select: {
        id: true,
        code: true,
        name: true,
        placementMode: true,
        isActive: true,
        updatedAt: true,
        bands: {
          where: { metric: EvaluationMetric.LR_NORMALIZED },
          orderBy: [{ orderIndex: 'asc' }, { code: 'asc' }],
          select: {
            id: true,
            code: true,
            label: true,
            orderIndex: true,
            minValue: true,
            maxValue: true,
            metric: true,
            skill: true,
          },
        },
      },
    });
    if (policies.length !== 1) this.invalidPlacementConfiguration();
    const policy = policies[0];
    if (
      policy.bands.length !== EXPECTED_BANDS.length ||
      EXPECTED_BANDS.some(
        (expected, index) =>
          policy.bands[index]?.code !== expected.code ||
          policy.bands[index]?.orderIndex !== expected.orderIndex,
      )
    ) {
      this.invalidPlacementConfiguration();
    }
    try {
      selectNormalizedBand(
        0,
        policy.bands.map((band) => ({
          ...band,
          minValue: Number(band.minValue),
          maxValue: Number(band.maxValue),
        })),
      );
    } catch {
      this.invalidPlacementConfiguration();
    }
    return policy;
  }

  private validatePlacementBoundaries(input: UpdatePlacementEvaluationCriteriaDto) {
    const { foundationUpperBoundary: foundation, advancingLowerBoundary: advancing } = input;
    if (
      !Number.isFinite(foundation) ||
      !Number.isFinite(advancing) ||
      foundation <= 0 ||
      advancing >= 100 ||
      foundation >= advancing ||
      !this.hasAtMostTwoDecimals(foundation) ||
      !this.hasAtMostTwoDecimals(advancing)
    ) {
      throw new BadRequestException({
        code: 'PLACEMENT_BOUNDARIES_INVALID',
        message:
          'Ngưỡng Nền tảng phải lớn hơn 0, nhỏ hơn ngưỡng Nâng cao và ngưỡng Nâng cao phải nhỏ hơn 100.',
      });
    }
  }

  private validateCourseProfile(input: UpdateCourseRecommendationProfileDto) {
    if (
      typeof input.isActive !== 'boolean' ||
      ![CriterionRuleMode.ALL, CriterionRuleMode.ANY].includes(input.ruleMode) ||
      !Number.isInteger(input.priority) ||
      input.priority < 0 ||
      input.priority > 10_000 ||
      !Array.isArray(input.criteria) ||
      input.criteria.length > 2
    ) {
      throw new BadRequestException({
        code: 'COURSE_PROFILE_INVALID',
        message: 'Cấu hình hồ sơ gợi ý khóa học không hợp lệ.',
      });
    }
    if (input.isActive && input.criteria.length === 0) {
      throw new BadRequestException({
        code: 'ACTIVE_PROFILE_REQUIRES_CRITERION',
        message: 'Cần ít nhất một điều kiện kỹ năng khi bật gợi ý cho khóa học.',
      });
    }
    const skills = new Set<ToeicSkill>();
    for (const criterion of input.criteria) {
      if (![ToeicSkill.LISTENING, ToeicSkill.READING].includes(criterion.skill)) {
        throw new BadRequestException({
          code: 'COURSE_CRITERION_SKILL_INVALID',
          message: 'Chỉ hỗ trợ điều kiện Listening và Reading.',
        });
      }
      if (skills.has(criterion.skill)) {
        throw new BadRequestException({
          code: 'COURSE_CRITERION_SKILL_DUPLICATED',
          message: 'Mỗi kỹ năng chỉ được cấu hình một lần.',
        });
      }
      skills.add(criterion.skill);
      const min = criterion.minNormalizedScore;
      const max = criterion.maxNormalizedScore;
      if (min === null && max === null) {
        throw new BadRequestException({
          code: 'COURSE_CRITERION_BOUND_REQUIRED',
          message: 'Mỗi điều kiện kỹ năng phải có ít nhất một ngưỡng.',
        });
      }
      if (
        (min !== null &&
          (!Number.isFinite(min) || min < 0 || min > 100 || !this.hasAtMostTwoDecimals(min))) ||
        (max !== null &&
          (!Number.isFinite(max) || max < 0 || max > 100 || !this.hasAtMostTwoDecimals(max))) ||
        (min !== null && max !== null && min > max)
      ) {
        throw new BadRequestException({
          code: 'COURSE_CRITERION_RANGE_INVALID',
          message: 'Khoảng điểm kỹ năng không hợp lệ.',
        });
      }
    }
  }

  private projectPlacementPolicy(
    policy: Awaited<ReturnType<AdminCriteriaService['requireValidPlacementPolicy']>>,
  ) {
    return {
      policy: {
        id: policy.id,
        code: policy.code,
        name: policy.name,
        placementMode: policy.placementMode,
        isActive: policy.isActive,
        updatedAt: policy.updatedAt,
      },
      bands: policy.bands.map((band) => ({
        id: band.id,
        code: band.code,
        label: band.label,
        orderIndex: band.orderIndex,
        minValue: Number(band.minValue),
        maxValue: Number(band.maxValue),
      })),
      intervalConvention: 'MIN_INCLUSIVE_MAX_EXCLUSIVE_TERMINAL_INCLUSIVE' as const,
    };
  }

  private projectCourseProfile(profile: {
    id: string;
    ruleMode: string;
    priority: number;
    isActive: boolean;
    updatedAt: Date;
    criteria: Array<{
      skill: ToeicSkill;
      minNormalizedScore: Prisma.Decimal | null;
      maxNormalizedScore: Prisma.Decimal | null;
    }>;
  }) {
    return {
      ...profile,
      criteria: profile.criteria.map((criterion) => ({
        skill: criterion.skill,
        minNormalizedScore:
          criterion.minNormalizedScore === null ? null : Number(criterion.minNormalizedScore),
        maxNormalizedScore:
          criterion.maxNormalizedScore === null ? null : Number(criterion.maxNormalizedScore),
      })),
    };
  }

  private hasAtMostTwoDecimals(value: number) {
    return Number(value.toFixed(2)) === value;
  }

  private invalidPlacementConfiguration(): never {
    throw new ConflictException({
      code: 'PLACEMENT_EVALUATION_CONFIG_INVALID',
      message: 'Cấu hình đánh giá hiện tại không hợp lệ. Vui lòng kiểm tra lại các khoảng điểm.',
    });
  }
}
