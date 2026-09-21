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
