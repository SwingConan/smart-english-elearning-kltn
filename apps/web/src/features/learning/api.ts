import { apiFetch } from '@/lib/api-client';
import type {
  CourseContent,
  CourseProgress,
  LessonDetail,
  MasteryHistoryResponse,
  MasteryOverview,
} from './types';

export const learningApi = {
  getContent: (enrollmentId: string, signal?: AbortSignal): Promise<CourseContent> =>
    apiFetch(`/learning/enrollments/${enrollmentId}/content`, { signal }),

  openLesson: (enrollmentId: string, lessonId: string, signal?: AbortSignal): Promise<LessonDetail> =>
    apiFetch(`/learning/enrollments/${enrollmentId}/lessons/${lessonId}/open`, {
      method: 'POST',
      signal,
    }),

  completeLesson: (enrollmentId: string, lessonId: string): Promise<unknown> =>
    apiFetch(`/learning/enrollments/${enrollmentId}/lessons/${lessonId}/complete`, {
      method: 'PATCH',
    }),

  getProgress: (enrollmentId: string, signal?: AbortSignal): Promise<CourseProgress> =>
    apiFetch(`/learning/enrollments/${enrollmentId}/progress`, { signal }),

  getMastery: (enrollmentId: string, signal?: AbortSignal): Promise<MasteryOverview> =>
    apiFetch(`/learning/enrollments/${enrollmentId}/mastery`, { signal }),

  getMasteryHistory: (
    enrollmentId: string,
    skillId: string,
    signal?: AbortSignal,
  ): Promise<MasteryHistoryResponse> =>
    apiFetch(`/learning/enrollments/${enrollmentId}/mastery/${skillId}/history`, { signal }),
};
