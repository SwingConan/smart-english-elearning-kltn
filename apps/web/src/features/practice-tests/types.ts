export type ToeicSkill = 'LISTENING' | 'READING';

export interface PracticeTestLatestHistory {
  attemptId: string;
  submittedAt: string | null;
  score: number;
  maxScore: number;
  listeningScore: number | null;
  readingScore: number | null;
  totalToeicScore: number | null;
}

export interface PracticeTestInProgress {
  attemptId: string;
  startedAt: string;
  phase: 'LISTENING' | 'READING';
  listeningGroupIndex: number;
}

export interface PracticeTestSummaryItem {
  id: string;
  testNumber: number;
  title: string;
  description: string | null;
  timeLimitMinutes: number;
  totalQuestions: number;
  listeningQuestions: number;
  readingQuestions: number;
  latestHistory: PracticeTestLatestHistory | null;
  inProgressAttempt: PracticeTestInProgress | null;
}

export interface PracticeTestListResponse {
  tests: PracticeTestSummaryItem[];
}

export interface PracticeMediaImage {
  id: string;
  url: string;
  altText: string;
}

export interface PracticeAttemptOption {
  id: string;
  label: string;
  content: string;
}

export interface PracticeAttemptQuestion {
  testQuestionId: string;
  questionNumber: number;
  content: string;
  selectedOptionIds: string[];
  options: PracticeAttemptOption[];
}

export interface PracticeAttemptGroup {
  id: string;
  groupIndex: number;
  part: number;
  skill: ToeicSkill;
  taskCode: string | null;
  title: string | null;
  instructions: string | null;
  audioUrl: string | null;
  images: PracticeMediaImage[];
  questions: PracticeAttemptQuestion[];
}

export interface PracticeAttemptResponse {
  attemptId: string;
  testId: string;
  title: string;
  status: 'IN_PROGRESS' | 'SUBMITTED';
  resultPath?: string;
  startedAt?: string;
  listeningGroupsCount?: number;
  state?: {
    phase: 'LISTENING' | 'READING';
    listeningGroupIndex: number;
    readingRemainingSeconds: number;
    markedQuestionIds: string[];
  };
  groups?: PracticeAttemptGroup[];
}

export interface PartBreakdownItem {
  part: number;
  label: string;
  skill: ToeicSkill;
  correctCount: number;
  totalCount: number;
}

export interface PracticeResultSummary {
  correctCount: number;
  totalQuestions: number;
  listeningRaw: number;
  listeningTotal: number;
  listeningScore: number;
  readingRaw: number;
  readingTotal: number;
  readingScore: number;
  totalScore: number;
  partBreakdown: PartBreakdownItem[];
}

export interface PracticeResultOption {
  id: string;
  label: string;
  content: string;
  isCorrect: boolean;
  wasSelected: boolean;
}

export interface PracticeResultQuestion {
  testQuestionId: string;
  questionNumber: number;
  part: number;
  skill: ToeicSkill;
  content: string;
  selectedOptionId: string | null;
  correctOptionId: string | null;
  isCorrect: boolean;
  isSkipped: boolean;
  explanation: string | null;
  options: PracticeResultOption[];
}

export interface PracticeResultGroup {
  id: string;
  groupIndex: number;
  part: number;
  skill: ToeicSkill;
  title: string | null;
  instructions: string | null;
  audioUrl: string | null;
  images: PracticeMediaImage[];
  questions: PracticeResultQuestion[];
}

export interface PracticeResultResponse {
  attemptId: string;
  testId: string;
  title: string;
  startedAt: string;
  submittedAt: string | null;
  summary: PracticeResultSummary;
  groups: PracticeResultGroup[];
}
