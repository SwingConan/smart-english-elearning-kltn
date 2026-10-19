import type { AssessmentStage, ToeicSkill } from '@/features/assessments/types';

export type StudyRecommendationState =
  'READY' | 'NO_ELIGIBLE_RESULT' | 'PENDING_REVIEW' | 'NO_MATCHING_CONTENT';

export interface RecommendationSkillEvidence {
  skill: ToeicSkill;
  rawScore: number | null;
  maxRawScore: number | null;
  normalizedScore: number;
  relative?: boolean;
}

export interface RecommendationFocus {
  skill: ToeicSkill;
  normalizedScore: number;
  taskCode?: string;
  taskQuestionCount?: number;
  taskNormalizedScore?: number;
}

export interface RecommendationRuleReason {
  schemaVersion: 1;
  policy: {
    code: string;
    weakThreshold: number;
    strongThreshold: number;
    minimumTaskQuestions: number;
    maxRecommendations: number;
  };
  skillEvidence: RecommendationSkillEvidence;
  taskEvidence: null | {
    taskCode: string;
    questionCount: number;
    awardedPoints: number;
    maxPoints: number;
    normalizedScore: number;
  };
  selection: {
    basis: 'TASK_WEAKNESS' | 'SKILL_FALLBACK' | 'MAINTENANCE';
    targetLessonTitle: string;
    targetPracticeAvailableAtGeneration: boolean;
    rank: number;
  };
}

export interface StudyRecommendationItem {
  id: string;
  priority: number;
  skill: ToeicSkill;
  targetType: 'LESSON';
  title: string;
  actionText: string;
  lesson: {
    id: string;
    title: string;
    estimatedMinutes: number | null;
    moduleTitle: string;
    path: string;
  };
  resources: Array<{
    id: string;
    title: string;
    type: string;
    url: string | null;
    isDownloadable: boolean;
    path: string;
  }>;
  practice: null | {
    assessmentId: string;
    testId: string;
    title: string;
    maxAttempts: number;
    availability: 'AVAILABLE';
    actionable: true;
    startPath: string;
  };
  reason: RecommendationRuleReason | null;
  reasonStatus: 'AVAILABLE' | 'UNAVAILABLE';
  aiExplanation: string | null;
}

export interface StudyRecommendationHistoryItem {
  sourceAttemptId: string;
  sourceTitle: string;
  sourceSubmittedAt: string | null;
  current: boolean;
  mainFocus: ToeicSkill | null;
  itemCount: number;
  strengths: RecommendationSkillEvidence[];
  focus: RecommendationFocus | null;
  sourceResultPath: string;
  recommendations: StudyRecommendationItem[];
}

export interface StudyRecommendationResponse {
  state: StudyRecommendationState;
  source: null | {
    attemptId: string;
    testId: string;
    testTitle: string;
    stage: AssessmentStage | null;
    submittedAt: string | null;
    resultPath: string;
  };
  pendingNewerAttempt: null | {
    attemptId: string;
    title: string;
    submittedAt: string | null;
    pendingSkills: ToeicSkill[];
    resultPath: string;
  };
  strengths: RecommendationSkillEvidence[];
  focus: RecommendationFocus | null;
  recommendations: StudyRecommendationItem[];
  schedule7Days: Array<{ day: number; title: string; path: string | null }>;
  history: StudyRecommendationHistoryItem[];
}
