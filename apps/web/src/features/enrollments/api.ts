import { apiFetch } from '@/lib/api-client';
import type { EnrollmentView } from './types';

export const enrollmentApi = {
  create: (classOfferingId: string) =>
    apiFetch<EnrollmentView>('/enrollments', {
      method: 'POST',
      body: JSON.stringify({ classOfferingId }),
    }),
  listMine: (signal?: AbortSignal) =>
    apiFetch<EnrollmentView[]>('/enrollments/my', { signal }),
};
