import { apiFetch } from '@/lib/api-client';
import type { EnrollmentView } from './types';

export const enrollmentApi = {
  create: (
    classOfferingId: string,
    meta?: { entrySource?: string; placementAttemptId?: string },
  ) =>
    apiFetch<EnrollmentView>('/enrollments', {
      method: 'POST',
      body: JSON.stringify({ classOfferingId, ...meta }),
    }),
  retryHold: (enrollmentId: string) =>
    apiFetch<{
      enrollmentId: string;
      status: string;
      reservedUntil: string;
      order: NonNullable<EnrollmentView['activeOrder']>;
    }>(`/enrollments/${encodeURIComponent(enrollmentId)}/retry-hold`, {
      method: 'POST',
    }),
  listMine: (signal?: AbortSignal) => apiFetch<EnrollmentView[]>('/enrollments/my', { signal }),
  detail: (id: string, signal?: AbortSignal) =>
    apiFetch<EnrollmentView>(`/enrollments/${encodeURIComponent(id)}`, { signal }),
};
