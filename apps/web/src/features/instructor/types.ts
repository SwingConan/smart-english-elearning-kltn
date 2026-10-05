export interface InstructorClassOffering {
  id: string;
  code?: string;
  name: string;
  status: string;
  modality?: string;
  classStart?: string | null;
  classEnd?: string | null;
  activeLearnerCount?: number;
  scheduleSlots?: Array<{ dayOfWeek: number; startTime: string; endTime: string; locationText: string | null }>;
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
  assessments: Array<{ id: string; stage: string; openAt: string | null; closeAt: string | null; availability: string; test: { id: string; title: string } }>;
  pendingGradingCount: number;
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
  lessonProgress: Array<{ status: string; lastAccessedAt: string | null; completedAt: string | null; lesson: { id: string; title: string; module: { id: string; title: string } } }>;
  attempts: Array<{ id: string; attemptNumber: number; submittedAt: string | null; classAssessment?: { test: { title: string } }; skillScores: Array<{ skill: string; status: string; normalizedScore: number }>; feedback?: Array<{ feedback: string | null }> }>;
  latestFourSkillSnapshot: null | { assessmentTitle: string; scores: Array<{ skill: string; normalizedScore: number }> };
}

export interface InstructorClassResults {
  classOffering: InstructorClass;
  assessments: Array<Record<string, unknown>>;
}

export interface InstructorGradingInbox {
  classOffering: InstructorClass;
  submissions: Array<{
    id: string;
    attemptNumber: number;
    submittedAt: string;
    gradingState: string;
    learner: { id: string; fullName: string; email: string };
    classAssessment: { id: string; stage: string; test: { id: string; title: string } };
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
