export type QuestionType = 'SINGLE_CHOICE' | 'TRUE_FALSE' | 'MULTIPLE_CHOICE';
export type QuestionDifficulty = 'EASY' | 'MEDIUM' | 'HARD';
export type TestType = 'PLACEMENT' | 'QUIZ';
export type TestStatus = 'DRAFT' | 'PUBLISHED';

export interface QuestionOption {
  id: string;
  content: string;
  isCorrect: boolean;
  orderIndex: number;
}

export interface AssessmentQuestion {
  id: string;
  courseId: string;
  type: QuestionType;
  difficulty: QuestionDifficulty;
  content: string;
  explanation: string | null;
  createdAt: string;
  updatedAt: string;
  options: QuestionOption[];
}

export interface QuestionInput {
  type: QuestionType;
  difficulty: QuestionDifficulty;
  content: string;
  explanation?: string | null;
  options: Array<{ content: string; isCorrect: boolean }>;
}

export interface AssessmentTestSummary {
  id: string;
  courseId: string;
  lessonId: string | null;
  type: TestType;
  title: string;
  description: string | null;
  status: TestStatus;
  maxAttempts: number;
  showResultAfterSubmit: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AssessmentTestQuestion {
  id: string;
  testId: string;
  questionId: string;
  orderIndex: number;
  points: number;
  question: Omit<AssessmentQuestion, 'courseId' | 'createdAt' | 'updatedAt'>;
}

export interface AssessmentTestDetail extends AssessmentTestSummary {
  testQuestions: AssessmentTestQuestion[];
}

export interface TestInput {
  type: TestType;
  title: string;
  description?: string | null;
  lessonId?: string | null;
  maxAttempts: number;
  showResultAfterSubmit: boolean;
}

export type StudentAttemptStatus = 'IN_PROGRESS' | 'SUBMITTED';

export interface StudentTestListItem {
  id: string;
  type: TestType;
  title: string;
  description: string | null;
  lessonId: string | null;
  maxAttempts: number;
  showResultAfterSubmit: boolean;
  questionCount: number;
  attemptsUsed: number;
  hasInProgressAttempt: boolean;
  inProgressAttemptId: string | null;
  latestSubmittedAttemptId: string | null;
}

export interface StudentAttemptStart {
  id: string;
  testId: string;
  enrollmentId: string;
  attemptNumber: number;
  status: StudentAttemptStatus;
  startedAt: string;
}

export interface StudentAttemptOption {
  id: string;
  content: string;
  orderIndex: number;
}

export interface StudentAttemptQuestion {
  testQuestionId: string;
  points: number;
  question: {
    id: string;
    type: QuestionType;
    difficulty: QuestionDifficulty;
    content: string;
    options: StudentAttemptOption[];
  };
  selectedOptionIds: string[];
}

export interface StudentAttemptContent {
  attempt: {
    id: string;
    attemptNumber: number;
    status: StudentAttemptStatus;
    startedAt: string;
    submittedAt: string | null;
  };
  test: { id: string; title: string; type: TestType };
  questions?: StudentAttemptQuestion[];
}

export interface StudentAnswerSelection {
  testQuestionId: string;
  selectedOptionIds: string[];
}

export interface StudentSubmission {
  attempt: {
    id: string;
    attemptNumber: number;
    status: 'SUBMITTED';
    startedAt: string;
    submittedAt: string;
    score?: number;
    maxScore?: number;
    percentage?: number;
  };
  test: { id: string; title: string; type: TestType };
  resultAvailable: boolean;
}

export interface StudentResultOption extends StudentAttemptOption {
  isCorrect: boolean;
  wasSelected: boolean;
}

export interface StudentResultQuestion {
  testQuestionId: string;
  points: number;
  question: {
    id: string;
    type: QuestionType;
    difficulty: QuestionDifficulty;
    content: string;
    explanation: string | null;
    options: StudentResultOption[];
  };
  answer: {
    selectedOptionIds: string[];
    isCorrect: boolean;
    pointsAwarded: number;
  };
}

export interface StudentAttemptResult {
  attempt: {
    id: string;
    attemptNumber: number;
    status: 'SUBMITTED';
    score: number;
    maxScore: number;
    percentage: number;
    startedAt: string;
    submittedAt: string;
  };
  test: { id: string; title: string; type: TestType };
  questions: StudentResultQuestion[];
}
