import { apiFetch } from '@/lib/api-client';
import type { AdaptivePolicy, AdaptivePolicyInput, StudentAdaptivePath } from './types';

export const adaptivePolicyApi = {
  get: (courseId: string, signal?: AbortSignal): Promise<AdaptivePolicy> =>
    apiFetch(`/instructor/courses/${encodeURIComponent(courseId)}/adaptive-policy`, {
      signal,
    }),
  update: (courseId: string, input: AdaptivePolicyInput): Promise<AdaptivePolicy> =>
    apiFetch(`/instructor/courses/${encodeURIComponent(courseId)}/adaptive-policy`, {
      method: 'PUT',
      body: JSON.stringify(input),
    }),
};

export const adaptivePathApi = {
  get: (enrollmentId: string, signal?: AbortSignal): Promise<StudentAdaptivePath> =>
    apiFetch(`/learning/enrollments/${encodeURIComponent(enrollmentId)}/adaptive-path`, { signal }),
};
