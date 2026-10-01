import {
  CourseRecommendationKind,
  CriterionRuleMode,
  ToeicSkill,
} from '../../generated/prisma/client';
import { M04DomainError } from '../evaluation/m04-domain.error';
import { CourseRecommendationRuleReasonV1 } from './rule-reason';

export interface RecommendationCriterionInput {
  skill: ToeicSkill;
  minNormalizedScore: number | null;
  maxNormalizedScore: number | null;
  minEstimatedToeicScore?: number | null;
  maxEstimatedToeicScore?: number | null;
}

export interface RecommendationProfileInput {
  id: string;
  courseId: string;
  coursePublished: boolean;
  active: boolean;
  ruleMode: CriterionRuleMode;
  priority: number;
  criteria: RecommendationCriterionInput[];
}

export function matchCourseProfiles(input: {
  profiles: RecommendationProfileInput[];
  skillScores: Map<ToeicSkill, number>;
  evaluationPolicyCode: string;
  evaluationLevel: string;
}) {
  const matches = input.profiles
    .filter((profile) => profile.active && profile.coursePublished)
    .map((profile) => matchProfile(profile, input))
    .filter((match): match is NonNullable<typeof match> => match !== null)
    .sort(
      (left, right) =>
        left.priority - right.priority || left.courseId.localeCompare(right.courseId),
    );

  return matches.map((match, index) => ({
    ...match,
    kind:
      index === 0
        ? CourseRecommendationKind.PRIMARY
        : CourseRecommendationKind.SUPPLEMENTARY,
  }));
}

function matchProfile(
  profile: RecommendationProfileInput,
  context: {
    skillScores: Map<ToeicSkill, number>;
    evaluationPolicyCode: string;
    evaluationLevel: string;
  },
) {
  if (profile.criteria.length === 0) return null;
  const criteria = profile.criteria.map((criterion) => {
    const value = context.skillScores.get(criterion.skill) ?? null;
    if (
      (criterion.minNormalizedScore !== null && !Number.isFinite(criterion.minNormalizedScore)) ||
      (criterion.maxNormalizedScore !== null && !Number.isFinite(criterion.maxNormalizedScore)) ||
      (criterion.minNormalizedScore !== null &&
        criterion.maxNormalizedScore !== null &&
        criterion.minNormalizedScore > criterion.maxNormalizedScore)
    ) {
      throw new M04DomainError(
        'RECOMMENDATION_CONFIG_INVALID',
        'Tiêu chí khóa học đang có khoảng điểm không hợp lệ.',
      );
    }
    const hasNormalizedRule =
      criterion.minNormalizedScore !== null || criterion.maxNormalizedScore !== null;
    const matched =
      value !== null &&
      hasNormalizedRule &&
      (criterion.minNormalizedScore === null || value >= criterion.minNormalizedScore) &&
      (criterion.maxNormalizedScore === null || value <= criterion.maxNormalizedScore);
    return {
      skill: criterion.skill,
      value,
      min: criterion.minNormalizedScore,
      max: criterion.maxNormalizedScore,
      matched,
    };
  });
  const eligible =
    profile.ruleMode === CriterionRuleMode.ALL
      ? criteria.every(({ matched }) => matched)
      : criteria.some(({ matched }) => matched);
  if (!eligible) return null;

  const reason: CourseRecommendationRuleReasonV1 = {
    schemaVersion: 1,
    evaluationPolicyCode: context.evaluationPolicyCode,
    evaluationLevel: context.evaluationLevel,
    profile: { ruleMode: profile.ruleMode, priority: profile.priority },
    criteria,
  };
  return { courseId: profile.courseId, priority: profile.priority, reason };
}
