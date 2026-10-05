export type LessonProgressStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';

export interface LessonSummary {
  id: string;
  title: string;
  description: string | null;
  orderIndex: number;
  progressStatus: LessonProgressStatus;
  resourceCount: number;
}

export interface ModuleSummary {
  id: string;
  title: string;
  description: string | null;
  orderIndex: number;
  lessons: LessonSummary[];
}

export interface CourseContent {
  course: {
    id: string;
    title: string;
    level: string;
  };
  modules: ModuleSummary[];
}

export type ResourceType = 'VIDEO' | 'DOCUMENT' | 'LINK';

export interface LessonResource {
  id: string;
  title: string;
  type: ResourceType;
  url: string | null;
  originalFileName: string | null;
  mimeType: string | null;
  updatedAt: string;
  orderIndex: number;
  isDownloadable: boolean;
}

export interface LessonDetail {
  id: string;
  title: string;
  description: string | null;
  orderIndex: number;
  module: { id: string; title: string };
  resources: LessonResource[];
  progress: {
    status: LessonProgressStatus;
    lastAccessedAt: string | null;
    completedAt: string | null;
  };
}

export interface CourseProgress {
  enrollmentId: string;
  courseTitle: string;
  totalLessons: number;
  completedLessons: number;
  progressPercent: number;
  modules: Array<{
    id: string;
    title: string;
    orderIndex: number;
    totalLessons: number;
    completedLessons: number;
    progressPercent: number;
    lessons: Array<{
      id: string;
      title: string;
      orderIndex: number;
      status: LessonProgressStatus;
      completedAt: string | null;
    }>;
  }>;
  assessments: Array<{
    id: string;
    testId: string;
    title: string;
    purpose: 'IN_CLASS' | 'PRACTICE_MOCK';
    stage: 'PERIODIC' | 'MIDTERM' | 'FINAL';
    openAt: string | null;
    closeAt: string | null;
    maxAttempts: number;
    status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';
    currentAttempt: {
      attemptId: string;
      attemptNumber: number;
      status: 'IN_PROGRESS';
    } | null;
    submittedAttempts: AssessmentAttemptSummary[];
  }>;
}

export interface AssessmentSkillResult {
  skill: 'LISTENING' | 'READING' | 'SPEAKING' | 'WRITING';
  state: 'FINAL' | 'PENDING_REVIEW' | 'MISSING_RESPONSE';
  normalizedScore: number | null;
}

export interface AssessmentAttemptSummary {
  attemptId: string;
  attemptNumber: number;
  submittedAt: string | null;
  resultAvailable: boolean;
  skillResults: AssessmentSkillResult[];
}

export type MasteryState = 'PRIOR' | 'OBSERVED';

export interface MasteryPrerequisite {
  id: string;
  code: string;
  name: string;
}

export interface MasterySkill {
  id: string;
  code: string;
  name: string;
  description: string | null;
  masteryProbability: number;
  observationCount: number;
  lastObservedAt: string | null;
  state: MasteryState;
  prerequisites: MasteryPrerequisite[];
}

export interface MasteryOverview {
  enrollmentId: string;
  courseId: string;
  skills: MasterySkill[];
}

export interface MasteryCurrentState {
  masteryProbability: number;
  observationCount: number;
  lastObservedAt: string | null;
  state: MasteryState;
}

export interface MasteryHistoryRow {
  id: string;
  testAttemptId: string;
  testAnswerId: string;
  isCorrect: boolean;
  priorMastery: number;
  evidencePosterior: number;
  posteriorMastery: number;
  createdAt: string;
}

export interface MasteryHistoryResponse {
  enrollmentId: string;
  skill: Pick<MasterySkill, 'id' | 'code' | 'name' | 'description'>;
  current: MasteryCurrentState;
  history: MasteryHistoryRow[];
}
