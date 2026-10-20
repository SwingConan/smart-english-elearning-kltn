import { apiFetch } from '@/lib/api-client';
import type {
  AdminClassOffering,
  AdminCourse,
  ClassOfferingInput,
  CourseInput,
  CourseQuery,
  OfferingQuery,
  Paginated,
  StudyRecommendationPolicy,
  StudyRecommendationPolicyInput,
} from './types';

function queryString<T extends object>(input: T): string {
  const params = new URLSearchParams();
  Object.entries(input as Record<string, unknown>).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  });
  const query = params.toString();
  return query ? `?${query}` : '';
}

export const adminApi = {
  courses: {
    list: (query: CourseQuery = {}, signal?: AbortSignal) =>
      apiFetch<Paginated<AdminCourse>>(`/admin/courses${queryString(query)}`, { signal }),
    get: (id: string, signal?: AbortSignal) =>
      apiFetch<AdminCourse>(`/admin/courses/${encodeURIComponent(id)}`, { signal }),
    create: (input: CourseInput) =>
      apiFetch<AdminCourse>('/admin/courses', { method: 'POST', body: JSON.stringify(input) }),
    update: (id: string, input: Partial<CourseInput>) =>
      apiFetch<AdminCourse>(`/admin/courses/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    uploadThumbnail: (id: string, file: File) => {
      const body = new FormData();
      body.set('file', file);
      return apiFetch<AdminCourse>(`/admin/courses/${encodeURIComponent(id)}/thumbnail`, {
        method: 'POST',
        body,
      });
    },
    removeThumbnail: (id: string) =>
      apiFetch<AdminCourse>(`/admin/courses/${encodeURIComponent(id)}/thumbnail`, {
        method: 'DELETE',
      }),
  },
  offerings: {
    list: (query: OfferingQuery = {}, signal?: AbortSignal) =>
      apiFetch<Paginated<AdminClassOffering>>(`/admin/class-offerings${queryString(query)}`, {
        signal,
      }),
    get: (id: string, signal?: AbortSignal) =>
      apiFetch<AdminClassOffering>(`/admin/class-offerings/${encodeURIComponent(id)}`, { signal }),
    create: (input: ClassOfferingInput) =>
      apiFetch<AdminClassOffering>('/admin/class-offerings', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    update: (id: string, input: Partial<ClassOfferingInput>) =>
      apiFetch<AdminClassOffering>(`/admin/class-offerings/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
  },
  studyRecommendationPolicy: {
    get: (signal?: AbortSignal) =>
      apiFetch<StudyRecommendationPolicy>('/admin/study-recommendation-policy', { signal }),
    update: (input: StudyRecommendationPolicyInput) =>
      apiFetch<StudyRecommendationPolicy>('/admin/study-recommendation-policy', {
        method: 'PUT',
        body: JSON.stringify(input),
      }),
  },
};
