export interface InstructorClassOffering {
  id: string;
  name: string;
  status: string;
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
  url: string;
  orderIndex: number;
  isDownloadable: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ModuleInput {
  title: string;
  description?: string;
}

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
