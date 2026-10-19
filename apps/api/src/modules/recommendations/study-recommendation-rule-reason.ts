import { AssessmentStage, ToeicSkill } from '../../generated/prisma/client';

export const STUDY_RECOMMENDATION_SELECTION_BASES = [
  'TASK_WEAKNESS',
  'SKILL_FALLBACK',
  'MAINTENANCE',
] as const;

export type StudyRecommendationSelectionBasis =
  (typeof STUDY_RECOMMENDATION_SELECTION_BASES)[number];

export interface StudyRecommendationRuleReasonV1 {
  schemaVersion: 1;
  policy: {
    code: string;
    weakThreshold: number;
    strongThreshold: number;
    minimumTaskQuestions: number;
    maxRecommendations: number;
  };
  source: {
    attemptId: string;
    testId: string;
    stage: AssessmentStage;
    submittedAt: string;
  };
  skillEvidence: {
    skill: ToeicSkill;
    rawScore: number | null;
    maxRawScore: number | null;
    normalizedScore: number;
  };
  taskEvidence: null | {
    taskCode: string;
    questionCount: number;
    awardedPoints: number;
    maxPoints: number;
    normalizedScore: number;
  };
  selection: {
    basis: StudyRecommendationSelectionBasis;
    targetLessonId: string;
    targetLessonTitle: string;
    targetPracticeAvailableAtGeneration: boolean;
    rank: number;
  };
}

export function parseStudyRecommendationRuleReason(
  value: unknown,
): StudyRecommendationRuleReasonV1 | null {
  if (!isRecord(value) || value.schemaVersion !== 1) return null;
  if (!isPolicy(value.policy) || !isSource(value.source) || !isSkillEvidence(value.skillEvidence)) {
    return null;
  }
  if (value.taskEvidence !== null && !isTaskEvidence(value.taskEvidence)) return null;
  if (!isSelection(value.selection)) return null;
  return value as unknown as StudyRecommendationRuleReasonV1;
}

function isPolicy(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.code === 'string' &&
    finite(value.weakThreshold) &&
    finite(value.strongThreshold) &&
    integer(value.minimumTaskQuestions) &&
    integer(value.maxRecommendations)
  );
}

function isSource(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.attemptId === 'string' &&
    typeof value.testId === 'string' &&
    Object.values(AssessmentStage).includes(value.stage as AssessmentStage) &&
    typeof value.submittedAt === 'string' &&
    Number.isFinite(Date.parse(value.submittedAt))
  );
}

function isSkillEvidence(value: unknown): boolean {
  return (
    isRecord(value) &&
    Object.values(ToeicSkill).includes(value.skill as ToeicSkill) &&
    nullableFinite(value.rawScore) &&
    nullableFinite(value.maxRawScore) &&
    finite(value.normalizedScore)
  );
}

function isTaskEvidence(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.taskCode === 'string' &&
    integer(value.questionCount) &&
    finite(value.awardedPoints) &&
    finite(value.maxPoints) &&
    finite(value.normalizedScore)
  );
}

function isSelection(value: unknown): boolean {
  return (
    isRecord(value) &&
    STUDY_RECOMMENDATION_SELECTION_BASES.includes(
      value.basis as StudyRecommendationSelectionBasis,
    ) &&
    typeof value.targetLessonId === 'string' &&
    typeof value.targetLessonTitle === 'string' &&
    typeof value.targetPracticeAvailableAtGeneration === 'boolean' &&
    integer(value.rank)
  );
}

function nullableFinite(value: unknown): boolean {
  return value === null || finite(value);
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function integer(value: unknown): value is number {
  return Number.isInteger(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
