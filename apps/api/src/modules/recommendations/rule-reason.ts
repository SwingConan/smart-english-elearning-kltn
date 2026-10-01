import { CriterionRuleMode, ToeicSkill } from '../../generated/prisma/client';

export interface CourseRecommendationRuleReasonV1 {
  schemaVersion: 1;
  evaluationPolicyCode: string;
  evaluationLevel: string;
  profile: {
    ruleMode: CriterionRuleMode;
    priority: number;
  };
  criteria: Array<{
    skill: ToeicSkill;
    value: number | null;
    min: number | null;
    max: number | null;
    matched: boolean;
  }>;
}

export function parseRuleReason(value: unknown): CourseRecommendationRuleReasonV1 | null {
  if (!isRecord(value) || value.schemaVersion !== 1) return null;
  if (
    typeof value.evaluationPolicyCode !== 'string' ||
    typeof value.evaluationLevel !== 'string' ||
    !isRecord(value.profile) ||
    !['ALL', 'ANY'].includes(String(value.profile.ruleMode)) ||
    !Number.isInteger(value.profile.priority) ||
    !Array.isArray(value.criteria)
  ) {
    return null;
  }
  const criteria = value.criteria.map((criterion) => parseCriterion(criterion));
  if (criteria.some((criterion) => criterion === null)) return null;
  return value as unknown as CourseRecommendationRuleReasonV1;
}

function parseCriterion(value: unknown) {
  if (!isRecord(value) || !Object.values(ToeicSkill).includes(value.skill as ToeicSkill)) return null;
  if (
    !nullableNumber(value.value) ||
    !nullableNumber(value.min) ||
    !nullableNumber(value.max) ||
    typeof value.matched !== 'boolean'
  ) {
    return null;
  }
  return value;
}

function nullableNumber(value: unknown): boolean {
  return value === null || (typeof value === 'number' && Number.isFinite(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
