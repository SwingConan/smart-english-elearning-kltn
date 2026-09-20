import { apiFetch } from '@/lib/api-client';
import type {
  AdminClassOffering,
  AdminCourse,
  ClassOfferingInput,
  CourseInput,
} from './types';

export const adminApi = {
  courses: {
    list: (signal?: AbortSignal) => apiFetch<AdminCourse[]>('/admin/courses', { signal }),
    create: (input: CourseInput) => apiFetch<AdminCourse>('/admin/courses', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
    update: (id: string, input: Partial<CourseInput>) =>
      apiFetch<AdminCourse>(`/admin/courses/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
  },
  offerings: {
    list: (signal?: AbortSignal) =>
      apiFetch<AdminClassOffering[]>('/admin/class-offerings', { signal }),
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
};
