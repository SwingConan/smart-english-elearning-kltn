export type QuestionType =
  | 'SINGLE_CHOICE'
  | 'TRUE_FALSE'
  | 'MULTIPLE_CHOICE'
  | 'TEXT_RESPONSE'
  | 'AUDIO_RESPONSE';
export type QuestionDifficulty = 'EASY' | 'MEDIUM' | 'HARD';
export type TestType = 'PLACEMENT' | 'QUIZ';
export type TestStatus = 'DRAFT' | 'PUBLISHED';
export type TestPurpose = 'PLACEMENT' | 'IN_CLASS' | 'PRACTICE_MOCK';
export type AssessmentStage = 'PERIODIC' | 'MIDTERM' | 'FINAL';
export type ToeicSkill = 'LISTENING' | 'READING' | 'SPEAKING' | 'WRITING';

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
  toeicSkill?: ToeicSkill;
  difficulty: QuestionDifficulty;
  content: string;
  explanation: string | null;
  rubricId?: string | null;
  rubric?: RubricSummary | null;
  createdAt: string;
  updatedAt: string;
  options: QuestionOption[];
  usageCount?: number;
}
export interface QuestionPage {
  items: AssessmentQuestion[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}
export interface QuestionQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  skill?: ToeicSkill;
  responseType?: QuestionType;
  difficulty?: QuestionDifficulty;
  usage?: 'ALL' | 'USED' | 'UNUSED';
}
export interface QuestionImportPreview {
  rows: Array<{ rowNumber: number; input: QuestionInput | null; errors: string[] }>;
  summary: { total: number; valid: number; invalid: number };
  canConfirm: boolean;
}
export interface QuestionInput {
  type: QuestionType;
  toeicSkill: ToeicSkill;
  difficulty: QuestionDifficulty;
  content: string;
  explanation?: string | null;
  rubricId?: string | null;
  options: Array<{ content: string; isCorrect: boolean }>;
}
export interface RubricSummary {
  id: string;
  name: string;
  description: string | null;
  criteria: Array<{ id: string; name: string; description: string | null; weight: string | number; maxScore: string | number; orderIndex: number }>;
}
export interface AssessmentTestSummary {
  id: string;
  courseId: string;
  lessonId: string | null;
  /** Legacy response alias retained by the API compatibility layer. */
  type: TestType | TestPurpose;
  purpose?: TestPurpose;
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
  groupId?: string | null;
  orderIndex: number;
  points: number;
  question: Omit<AssessmentQuestion, 'courseId' | 'createdAt' | 'updatedAt'>;
}
export interface AssessmentStimulus {
  id: string;
  type: 'TEXT' | 'IMAGE' | 'AUDIO';
  orderIndex: number;
  textContent: string | null;
  mimeType: string | null;
  altText: string | null;
}
export interface AssessmentTestGroup {
  id: string;
  skill: ToeicSkill;
  orderIndex: number;
  title: string | null;
  instructions: string | null;
  preparationSeconds: number | null;
  responseSeconds: number | null;
  recommendedSeconds: number | null;
  maxRecordingSeconds: number | null;
  stimuli: AssessmentStimulus[];
  testQuestions: AssessmentTestQuestion[];
}
export interface AssessmentTestDetail extends AssessmentTestSummary {
  testQuestions: AssessmentTestQuestion[];
  questionGroups?: AssessmentTestGroup[];
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
  classAssessmentId?: string | null;
  id: string;
  purpose: Exclude<TestPurpose, 'PLACEMENT'>;
  stage: AssessmentStage | null;
  title: string;
  description: string | null;
  lessonId: string | null;
  maxAttempts: number;
  timeLimitMinutes: number | null;
  openAt: string | null;
  closeAt: string | null;
  showResultAfterSubmit: boolean;
  questionCount: number;
  skills?: ToeicSkill[];
  attemptsUsed: number;
  hasInProgressAttempt: boolean;
  inProgressAttemptId: string | null;
  latestSubmittedAttemptId: string | null;
  latestSubmittedAt?: string | null;
}
export interface StudentAttemptStart {
  id: string;
  testId: string;
  enrollmentId: string;
  attemptNumber: number;
  status: StudentAttemptStatus;
  startedAt: string;
}
export interface StudentAttemptOption { id: string; content: string; orderIndex: number }
export interface StudentAttemptQuestion {
  testQuestionId: string;
  orderIndex?: number;
  points: number;
  question: {
    id: string;
    type: QuestionType;
    responseType?: QuestionType;
    toeicSkill?: ToeicSkill;
    difficulty: QuestionDifficulty;
    content: string;
    options: StudentAttemptOption[];
  };
  selectedOptionIds: string[];
  textResponse?: string | null;
  audioUploaded?: boolean;
  audioUrl?: string | null;
}
export interface StudentAttemptStimulus {
  id: string;
  type: 'TEXT' | 'IMAGE' | 'AUDIO';
  orderIndex: number;
  textContent: string | null;
  mediaUrl: string | null;
  mimeType: string | null;
  altText: string | null;
}
export interface StudentAttemptGroup {
  id: string;
  skill: ToeicSkill;
  orderIndex: number;
  title: string | null;
  instructions: string | null;
  taskCode: string | null;
  preparationSeconds: number | null;
  responseSeconds: number | null;
  recommendedSeconds: number | null;
  maxRecordingSeconds: number | null;
  stimulusText: string | null;
  stimuli: StudentAttemptStimulus[];
  questions: StudentAttemptQuestion[];
}
export interface StudentAttemptContent {
  attempt: {
    id: string;
    attemptNumber: number;
    status: StudentAttemptStatus;
    startedAt: string;
    submittedAt: string | null;
    expiresAt?: string | null;
  };
  test: {
    id: string;
    title: string;
    description?: string | null;
    type: TestType | TestPurpose;
    purpose?: TestPurpose;
    stage?: AssessmentStage | null;
    timeLimitMinutes?: number | null;
  };
  questions?: StudentAttemptQuestion[];
  groups?: StudentAttemptGroup[];
}
export interface StudentAnswerSelection {
  testQuestionId: string;
  selectedOptionIds?: string[];
  textResponse?: string;
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
  test: { id: string; title: string; type: TestType | TestPurpose; purpose?: TestPurpose; stage?: AssessmentStage | null };
  resultAvailable: boolean;
}
export interface StudentResultOption extends StudentAttemptOption { isCorrect: boolean; wasSelected: boolean }
export interface StudentResultQuestion {
  testQuestionId: string;
  points: number;
  question: {
    id: string;
    type: QuestionType;
    difficulty: QuestionDifficulty;
    toeicSkill?: ToeicSkill;
    content: string;
    explanation: string | null;
    options: StudentResultOption[];
  };
  answer: {
    selectedOptionIds: string[];
    textResponse?: string | null;
    audioUrl?: string | null;
    isCorrect: boolean | null;
    pointsAwarded: number | null;
    evaluation?: {
      status: string;
      totalScore: number | null;
      feedback: string | null;
      criteria: Array<{ id: string; name: string; score: number; maxScore: number; feedback: string | null }>;
    } | null;
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
  test: { id: string; title: string; type: TestType | TestPurpose; purpose?: TestPurpose; stage?: AssessmentStage | null };
  gradingState?: 'SUBMITTED_PENDING_REVIEW' | 'REVIEWED_FINAL';
  skills?: Array<{
    skill: ToeicSkill;
    state: 'FINAL' | 'PENDING_REVIEW' | 'MISSING_RESPONSE';
    status: string | null;
    source: string | null;
    rawScore: number | null;
    maxRawScore: number | null;
    normalizedScore: number | null;
  }>;
  total?: { awardedPoints: number; maxPoints: number; percentage: number; label: string } | null;
  questions: StudentResultQuestion[];
}

export interface ClassAssessmentSummary {
  id: string;
  stage: AssessmentStage;
  openAt: string | null;
  closeAt: string | null;
  maxAttemptsOverride: number | null;
  isActive: boolean;
  submissionCount: number;
  pendingGradingCount: number;
  attemptCount: number;
  test: { id: string; title: string; maxAttempts: number; timeLimitMinutes: number | null; _count: { testQuestions: number } };
}
export interface ClassAssessmentWorkspace {
  classOffering: { id: string; code: string; name: string; course: { id: string; title: string } };
  availableTests: Array<{ id: string; title: string; timeLimitMinutes: number | null; maxAttempts: number }>;
  assessments: ClassAssessmentSummary[];
}
export interface GradingQueue {
  assessment: {
    id: string;
    stage: AssessmentStage;
    test: { id: string; title: string };
    classOffering: { id: string; code: string; name: string; course: { id: string; title: string } };
  };
  submissions: Array<{
    id: string;
    attemptNumber: number;
    submittedAt: string;
    learner: { id: string; fullName: string; email: string };
    gradingState: 'SUBMITTED_PENDING_REVIEW' | 'PARTIALLY_REVIEWED' | 'REVIEWED_FINAL';
    skillScores: Array<{ skill: ToeicSkill; normalizedScore: number; status: string; source: string }>;
  }>;
}
export interface GradingDetail {
  id: string;
  attemptNumber: number;
  submittedAt: string;
  learner: { id: string; fullName: string; email: string };
  test: { id: string; title: string };
  answers: Array<{
    id: string;
    textResponse: string | null;
    audioUrl: string | null;
    pointsAwarded: number | null;
    testQuestion: {
      id: string;
      points: number;
      orderIndex: number;
      question: {
        content: string;
        responseType: QuestionType;
        toeicSkill: ToeicSkill;
        rubric: {
          id: string;
          name: string;
          criteria: Array<{ id: string; name: string; description: string | null; orderIndex: number; maxScore: number; weight: number }>;
        };
      };
    };
    evaluation: {
      updatedAt: string;
      status: string;
      totalScore: number | null;
      feedback: string | null;
      criterionScores: Array<{ rubricCriterionId: string; score: number; feedback: string | null }>;
    } | null;
  }>;
}
