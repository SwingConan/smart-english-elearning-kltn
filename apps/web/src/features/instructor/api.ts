import { apiFetch } from '@/lib/api-client';
import type {
  TeachingEntry,
  Module,
  Lesson,
  LearningResource,
  ModuleInput,
  LessonInput,
  ResourceInput,
  InstructorClass,
  InstructorClassOverview,
  InstructorRoster,
  InstructorLearnerDetail,
  InstructorClassResults,
  InstructorGradingInbox,
  VersionedModuleInput,
  VersionedLessonInput,
  VersionedResourceInput,
} from './types';

export const instructorApi = {
  classes: {
    list: (signal?: AbortSignal): Promise<InstructorClass[]> => apiFetch('/instructor/classes', { signal }),
    overview: (classId: string, signal?: AbortSignal): Promise<InstructorClassOverview> => apiFetch(`/instructor/classes/${classId}/overview`, { signal }),
    learners: (classId: string, signal?: AbortSignal): Promise<InstructorRoster> => apiFetch(`/instructor/classes/${classId}/learners`, { signal }),
    learner: (classId: string, enrollmentId: string, signal?: AbortSignal): Promise<InstructorLearnerDetail> => apiFetch(`/instructor/classes/${classId}/learners/${enrollmentId}`, { signal }),
    results: (classId: string, signal?: AbortSignal): Promise<InstructorClassResults> => apiFetch(`/instructor/classes/${classId}/results`, { signal }),
    grading: (classId: string, signal?: AbortSignal): Promise<InstructorGradingInbox> => apiFetch(`/instructor/classes/${classId}/grading`, { signal }),
  },
  teaching: {
    list: (signal?: AbortSignal): Promise<TeachingEntry[]> =>
      apiFetch('/instructor/teaching', { signal }),
  },

  modules: {
    list: (courseId: string, signal?: AbortSignal): Promise<Module[]> =>
      apiFetch(`/instructor/courses/${courseId}/modules`, { signal }),
    create: (courseId: string, input: ModuleInput): Promise<Module> =>
      apiFetch(`/instructor/courses/${courseId}/modules`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    update: (moduleId: string, input: VersionedModuleInput): Promise<Module> =>
      apiFetch(`/instructor/modules/${moduleId}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    delete: (moduleId: string): Promise<{ message: string }> =>
      apiFetch(`/instructor/modules/${moduleId}`, { method: 'DELETE' }),
    reorder: (courseId: string, orderedIds: string[]): Promise<void> =>
      apiFetch(`/instructor/courses/${courseId}/modules/reorder`, {
        method: 'PATCH',
        body: JSON.stringify({ orderedIds }),
      }),
  },

  lessons: {
    list: (moduleId: string, signal?: AbortSignal): Promise<Lesson[]> =>
      apiFetch(`/instructor/modules/${moduleId}/lessons`, { signal }),
    create: (moduleId: string, input: LessonInput): Promise<Lesson> =>
      apiFetch(`/instructor/modules/${moduleId}/lessons`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    update: (lessonId: string, input: VersionedLessonInput): Promise<Lesson> =>
      apiFetch(`/instructor/lessons/${lessonId}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    delete: (lessonId: string): Promise<{ message: string }> =>
      apiFetch(`/instructor/lessons/${lessonId}`, { method: 'DELETE' }),
    reorder: (moduleId: string, orderedIds: string[]): Promise<void> =>
      apiFetch(`/instructor/modules/${moduleId}/lessons/reorder`, {
        method: 'PATCH',
        body: JSON.stringify({ orderedIds }),
      }),
  },

  resources: {
    list: (lessonId: string, signal?: AbortSignal): Promise<LearningResource[]> =>
      apiFetch(`/instructor/lessons/${lessonId}/resources`, { signal }),
    create: (lessonId: string, input: ResourceInput): Promise<LearningResource> =>
      apiFetch(`/instructor/lessons/${lessonId}/resources`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    update: (resourceId: string, input: VersionedResourceInput): Promise<LearningResource> =>
      apiFetch(`/instructor/resources/${resourceId}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    delete: (resourceId: string): Promise<{ message: string }> =>
      apiFetch(`/instructor/resources/${resourceId}`, { method: 'DELETE' }),
    reorder: (lessonId: string, orderedIds: string[]): Promise<void> =>
      apiFetch(`/instructor/lessons/${lessonId}/resources/reorder`, {
        method: 'PATCH',
        body: JSON.stringify({ orderedIds }),
      }),
    upload: (lessonId: string, title: string, file: File, isDownloadable: boolean, replaceResourceId?: string, expectedUpdatedAt?: string): Promise<LearningResource> => {
      const body = new FormData();
      body.append('title', title);
      body.append('file', file);
      body.append('isDownloadable', String(isDownloadable));
      if (replaceResourceId) body.append('replaceResourceId', replaceResourceId);
      if (expectedUpdatedAt) body.append('expectedUpdatedAt', expectedUpdatedAt);
      return apiFetch(`/instructor/lessons/${lessonId}/resources/upload`, { method: 'POST', body });
    },
  },
};
