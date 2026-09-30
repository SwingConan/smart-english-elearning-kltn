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
  mode: 'LR';
  goalScore: number | null;
  selfLevel: PlacementSelfLevel | null;
  step: 1 | 2 | 3;
}

export interface PlacementStartResponse {
  attemptId: string;
  resumed: boolean;
  test: { title: string; mode: 'LR'; durationMinutes: number };
  goalScore: number;
  selfLevel: PlacementSelfLevel;
  startedAt: string;
  expiresAt: string;
}

export interface PlacementExamQuestion {
  testQuestionId: string;
  orderIndex: number;
  content: string;
  responseType: 'SINGLE_CHOICE' | 'TRUE_FALSE' | 'MULTIPLE_CHOICE';
  toeicSkill: 'LISTENING' | 'READING';
  options: Array<{ id: string; content: string; orderIndex: number }>;
  selectedOptionIds: string[];
}

export interface PlacementExamGroup {
  id: string;
  skill: 'LISTENING' | 'READING';
  orderIndex: number;
  title: string | null;
  instructions: string | null;
  stimulusText: string | null;
  audioUrl: string | null;
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
        mode: 'LR';
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
  mode: 'LR';
  goalScore: number;
  selfLevel: PlacementSelfLevel;
  startedAt: string;
  submittedAt: string;
  score: number;
  maxScore: number;
  skillScores: PlacementSkillScore[];
  disclaimer: string;
}

export interface PlacementHistoryItem {
  attemptId: string;
  title: string;
  mode: 'LR';
  goalScore: number;
  startedAt: string;
  submittedAt: string;
  score: number;
  maxScore: number;
  skillScores: PlacementSkillScore[];
  resultPath: string;
}
