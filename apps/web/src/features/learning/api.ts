import { ApiError, apiFetch, apiUrl } from '@/lib/api-client';
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

  openLesson: (
    enrollmentId: string,
    lessonId: string,
    signal?: AbortSignal,
  ): Promise<LessonDetail> =>
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

  downloadStoredResource: async (
    enrollmentId: string,
    resourceId: string,
  ): Promise<{ blob: Blob; fileName: string }> => {
    const response = await fetch(apiUrl(`/learning/enrollments/${enrollmentId}/resources/${resourceId}/download`), {
      credentials: 'include',
    });
    if (!response.ok) throw new ApiError(response.status, await response.text());
    return {
      blob: await response.blob(),
      fileName: fileNameFromDisposition(response.headers.get('content-disposition')) ?? 'tai-lieu',
    };
  },

  getMastery: (enrollmentId: string, signal?: AbortSignal): Promise<MasteryOverview> =>
    apiFetch(`/learning/enrollments/${enrollmentId}/mastery`, { signal }),

  getMasteryHistory: (
    enrollmentId: string,
    skillId: string,
    signal?: AbortSignal,
  ): Promise<MasteryHistoryResponse> =>
    apiFetch(`/learning/enrollments/${enrollmentId}/mastery/${skillId}/history`, { signal }),
};

function fileNameFromDisposition(value: string | null): string | null {
  if (!value) return null;
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(value)?.[1];
  if (encoded) {
    try { return decodeURIComponent(encoded); } catch { /* use the ASCII fallback */ }
  }
  return /filename="([^"]+)"/i.exec(value)?.[1] ?? null;
}
