export type PlacementMode = 'LR' | 'FOUR_SKILLS';
export type PlacementSelfLevel = 'UNKNOWN' | 'BEGINNER' | 'BASIC' | 'INTERMEDIATE' | 'GOOD';

export interface PlacementConfig {
  modes: Array<{ code: PlacementMode; label: string; enabled: boolean; note?: string }>;
  goalPresets: number[];
  customGoalRange: { min: number; max: number };
  selfLevels: Array<{
    code: PlacementSelfLevel;
    label: string;
    durationMinutes: number | null;
  }>;
  instructions: string[];
  disclaimer: string;
}

export interface PlacementDraft {
  version: 1;
  mode: PlacementMode;
  goalScore: number | null;
  selfLevel: PlacementSelfLevel | null;
  step: 1 | 2 | 3;
}

export interface PlacementStartResponse {
  attemptId: string;
  resumed: boolean;
  test: { title: string; mode: PlacementMode; durationMinutes: number };
  goalScore: number;
  selfLevel: PlacementSelfLevel;
  startedAt: string;
  expiresAt: string;
}

export interface PlacementExamQuestion {
  testQuestionId: string;
  orderIndex: number;
  content: string;
  responseType: 'SINGLE_CHOICE' | 'TRUE_FALSE' | 'MULTIPLE_CHOICE' | 'TEXT_RESPONSE' | 'AUDIO_RESPONSE';
  toeicSkill: 'LISTENING' | 'READING' | 'SPEAKING' | 'WRITING';
  options: Array<{ id: string; content: string; orderIndex: number }>;
  selectedOptionIds: string[];
  textResponse?: string | null;
  audioUploaded?: boolean;
  audioUrl?: string | null;
}

export interface PlacementStimulus {
  id: string;
  type: 'TEXT' | 'IMAGE' | 'AUDIO';
  orderIndex: number;
  textContent: string | null;
  mediaUrl: string | null;
  mimeType: string | null;
  altText: string | null;
}

export interface PlacementExamGroup {
  id: string;
  skill: 'LISTENING' | 'READING' | 'SPEAKING' | 'WRITING';
  orderIndex: number;
  title: string | null;
  instructions: string | null;
  stimulusText: string | null;
  audioUrl: string | null;
  taskCode?: string | null;
  preparationSeconds?: number | null;
  responseSeconds?: number | null;
  recommendedSeconds?: number | null;
  maxRecordingSeconds?: number | null;
  stimuli?: PlacementStimulus[];
  questions: PlacementExamQuestion[];
}

export type PlacementExamResponse =
  | {
      state: 'SUBMITTED';
      attemptId: string;
      submittedAt: string;
      resultPath: string;
    }
  | {
      state: 'IN_PROGRESS';
      attempt: {
        id: string;
        startedAt: string;
        expiresAt: string;
        goalScore: number;
        selfLevel: PlacementSelfLevel;
      };
      test: {
        title: string;
        description: string | null;
        mode: PlacementMode;
        durationMinutes: number;
      };
      groups: PlacementExamGroup[];
    };

export interface PlacementSkillScore {
  skill: 'LISTENING' | 'READING';
  rawScore: string | number | null;
  maxRawScore: string | number | null;
  normalizedScore: string | number;
  estimatedToeicScore: number | null;
  status: 'FINAL';
  source: 'OBJECTIVE_AUTO';
}

export interface PlacementResult {
  attemptId: string;
  status: 'SUBMITTED';
  title: string;
  mode: PlacementMode;
  goalScore: number;
  selfLevel: PlacementSelfLevel;
  durationMinutes: number;
  startedAt: string;
  submittedAt: string;
  score: number;
  maxScore: number;
  skillScores: PlacementSkillScore[];
  skillResults?: Array<
    | {
        skill: 'LISTENING' | 'READING';
        status: 'FINAL';
        rawScore: string | number | null;
        maxRawScore: string | number | null;
        normalizedScore: string | number;
      }
    | {
        skill: 'SPEAKING' | 'WRITING';
        status: 'PENDING_EVALUATION';
        submittedResponseCount: number;
        requiredResponseCount: number;
      }
  >;
  disclaimer: string;
  enhancement: {
    status: 'READY' | 'ERROR' | 'PENDING_SKILL_EVALUATION';
    error: { code: string; message: string } | null;
    message?: string;
  };
  evaluation: PlacementEvaluation | null;
  recommendations: PlacementRecommendation[];
}

export interface PlacementEvaluation {
  status: 'FINAL';
  levelCode: string | null;
  levelLabel: string | null;
  overallNormalizedScore: number;
  strongestSkill: 'LISTENING' | 'READING' | null;
  weakestSkill: 'LISTENING' | 'READING' | null;
  balanceState: 'BALANCED' | 'IMBALANCED';
  summary: string | null;
  lrTotalScore: number | null;
  aiExplanation: string | null;
  evaluationPolicyId: string | null;
}

export interface PlacementRecommendationReason {
  schemaVersion: 1;
  evaluationPolicyCode: string;
  evaluationLevel: string;
  profile: { ruleMode: 'ALL' | 'ANY'; priority: number };
  criteria: Array<{
    skill: 'LISTENING' | 'READING' | 'SPEAKING' | 'WRITING';
    value: number | null;
    min: number | null;
    max: number | null;
    matched: boolean;
  }>;
}

export interface PlacementRecommendationOffering {
  id: string;
  code: string;
  name: string;
  instructor: { id: string; fullName: string } | null;
  modality: 'ONLINE' | 'OFFLINE' | 'HYBRID';
  pricingType: 'FREE' | 'PAID';
  tuitionFeeVnd: number | null;
  totalSessions: number | null;
  totalPeriods: number | null;
  enrollmentStart: string | null;
  enrollmentEnd: string | null;
  classStart: string | null;
  classEnd: string | null;
  scheduleSlots: Array<{
    id: string;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    locationText: string | null;
    meetingUrl: string | null;
  }>;
  maxStudents: number | null;
  registeredCount: number;
  remainingSeats: number | null;
  registrationState: 'AVAILABLE' | 'FULL' | 'UPCOMING' | 'CLOSED';
  actionable: boolean;
  currentEnrollmentId: string | null;
  currentEnrollmentStatus: 'ACTIVE' | 'PENDING_PAYMENT' | 'COMPLETED' | 'DROPPED' | 'CANCELLED' | null;
}

export interface PlacementRecommendation {
  kind: 'PRIMARY' | 'SUPPLEMENTARY';
  course: {
    id: string;
    slug: string;
    title: string;
    description: string;
    level: string;
    skillScope: 'LR' | 'FOUR_SKILLS' | 'LISTENING' | 'READING' | 'SPEAKING' | 'WRITING';
    thumbnailUrl: string | null;
  };
  reason: PlacementRecommendationReason | null;
  reasonStatus: 'AVAILABLE' | 'UNAVAILABLE';
  classOfferings: PlacementRecommendationOffering[];
}

export interface PlacementHistoryItem {
  attemptId: string;
  title: string;
  mode: PlacementMode;
  goalScore: number;
  startedAt: string;
  submittedAt: string;
  score: number;
  maxScore: number;
  skillScores: PlacementSkillScore[];
  skillResults?: Array<{
    skill: 'SPEAKING' | 'WRITING';
    status: 'PENDING_EVALUATION';
    submittedResponseCount: number;
    requiredResponseCount: number;
  }>;
  placementLevelCode?: string | null;
  placementLevelLabel?: string | null;
  resultPath: string;
}
