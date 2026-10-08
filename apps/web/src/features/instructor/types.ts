export interface InstructorClassOffering {
  id: string;
  code?: string;
  name: string;
  status: string;
  modality?: string;
  classStart?: string | null;
  classEnd?: string | null;
  activeLearnerCount?: number;
  scheduleSlots?: Array<{
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    locationText: string | null;
  }>;
  course?: { id: string; title: string; level: string };
}

export interface InstructorClass extends InstructorClassOffering {
  code: string;
  activeLearnerCount: number;
  course: { id: string; title: string; level: string };
}

export interface InstructorClassOverview {
  classOffering: InstructorClass;
  activeLearnerCount: number;
  lessonProgress: { completed: number; total: number; percentage: number };
  assessments: Array<{
    id: string;
    stage: string;
    openAt: string | null;
    closeAt: string | null;
    availability: string;
    submittedLearnerCount: number;
    inProgressLearnerCount: number;
    notSubmittedLearnerCount: number;
    activeLearnerCount: number;
    test: { id: string; title: string };
    learners?: OverviewLearner[];
  }>;
  pendingGradingCount: number;
  grading: {
    waiting: number;
    partial: number;
    final: number;
    attempts?: Array<{
      state: 'WAITING' | 'PARTIAL' | 'FINAL';
      attemptId: string;
      attemptNumber: number;
      submittedAt: string | null;
      learnerId: string;
      learner: { fullName: string; email: string };
      assessmentId: string | null;
      assessmentTitle: string;
    }>;
  };
  progressBuckets: Array<{ label: string; count: number; learners?: OverviewLearner[] }>;
  upcomingDeadlines: Array<{ kind: string; at: string; assessmentId: string; title: string }>;
  followUps: Array<{
    kind: string;
    count: number;
    label: string;
    learners?: OverviewLearner[];
  }>;
}

export interface OverviewLearner {
  enrollmentId: string;
  learnerId: string;
  learner: { fullName: string; email: string };
  completedLessons: number;
  totalLessons: number;
  percentage: number;
  lastActivityAt: string;
  state?: 'SUBMITTED' | 'IN_PROGRESS' | 'NOT_SUBMITTED';
}

export interface InstructorRoster {
  classOffering: InstructorClass;
  learners: Array<{
    id: string;
    status: string;
    enrolledAt: string;
    learner: { id: string; fullName: string; email: string };
    completedLessons: number;
    totalLessons: number;
    progressPercentage: number;
    submittedAssessmentCount: number;
    pendingGradingCount: number;
    latestGradedAssessmentAt: string | null;
    latestLearningActivityAt?: string | null;
    latestAssessment?: null | {
      title: string;
      submittedAt: string | null;
      state: 'PENDING' | 'GRADED' | 'SUBMITTED';
      average: number | null;
    };
  }>;
}

export interface InstructorLearnerDetail {
  classOffering: InstructorClass;
  enrollment: {
    id: string;
    status: string;
    enrolledAt: string;
    learner: { id: string; fullName: string; email: string };
  };
  lessonProgress: Array<{
    status: string;
    lastAccessedAt: string | null;
    completedAt: string | null;
    lesson: { id: string; title: string; module: { id: string; title: string } };
  }>;
  attempts: Array<{
    id: string;
    attemptNumber: number;
    submittedAt: string | null;
    classAssessment?: { id: string; stage: string; test: { title: string } };
    skillScores: Array<{ skill: string; status: string; normalizedScore: number }>;
    feedback?: Array<{ feedback: string | null }>;
  }>;
  latestFourSkillSnapshot: null | {
    assessmentTitle: string;
    scores: Array<{ skill: string; normalizedScore: number }>;
  };
  summary: {
    completedLessons: number;
    totalLessons: number;
    submittedAssessmentCount: number;
    pendingGradingCount: number;
    lastActivityAt: string | null;
  };
  moduleProgress: Array<{
    id: string;
    title: string;
    completed: number;
    total: number;
    percentage: number;
  }>;
  recentActivity: Array<{ type: string; at: string; label: string }>;
  skillTrend: Array<{
    attemptId: string;
    assessmentTitle: string;
    stage: string;
    date: string;
    scores: Array<{ skill: string; normalizedScore: number }>;
  }>;
}

export interface InstructorClassResults {
  classOffering: InstructorClass;
  assessments: Array<Record<string, unknown>>;
}

export interface InstructorGradingInbox {
  classOffering: InstructorClass;
  summary: { waiting: number; partial: number; final: number };
  submissions: Array<{
    id: string;
    attemptNumber: number;
    submittedAt: string;
    gradingState: string;
    listeningScore: number | null;
    readingScore: number | null;
    productiveFinalizedCount: number;
    productiveTotal: number;
    learner: { id: string; fullName: string; email: string };
    classAssessment: { id: string; stage: string; test: { id: string; title: string } };
  }>;
  groups: Array<{
    classAssessment: { id: string; stage: string; test: { id: string; title: string } };
    learners: Array<{
      learner: { id: string; fullName: string; email: string };
      attempts: InstructorGradingInbox['submissions'];
    }>;
  }>;
}

export interface InstructorCourse {
  id: string;
  title: string;
  slug: string;
  level: string;
  isPublished: boolean;
  _count: { modules: number };
}

export interface TeachingEntry {
  course: InstructorCourse;
  classOfferings: InstructorClassOffering[];
}

export interface Module {
  id: string;
  courseId: string;
  title: string;
  description: string | null;
  orderIndex: number;
  createdAt: string;
  updatedAt: string;
}

export interface Lesson {
  id: string;
  moduleId: string;
  title: string;
  description: string | null;
  orderIndex: number;
  createdAt: string;
  updatedAt: string;
}

export type ResourceType = 'VIDEO' | 'DOCUMENT' | 'LINK';

export interface LearningResource {
  id: string;
  lessonId: string;
  title: string;
  type: ResourceType;
  url: string | null;
  storageKey?: string | null;
  mimeType?: string | null;
  originalFileName?: string | null;
  sizeBytes?: number | null;
  orderIndex: number;
  isDownloadable: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ModuleInput {
  title: string;
  description?: string;
}

export type VersionedModuleInput = Partial<ModuleInput> & { expectedUpdatedAt: string };
export type VersionedLessonInput = Partial<LessonInput> & { expectedUpdatedAt: string };
export type VersionedResourceInput = Partial<ResourceInput> & { expectedUpdatedAt: string };

export interface LessonInput {
  title: string;
  description?: string;
}

export interface ResourceInput {
  title: string;
  type: ResourceType;
  url: string;
  isDownloadable?: boolean;
}
