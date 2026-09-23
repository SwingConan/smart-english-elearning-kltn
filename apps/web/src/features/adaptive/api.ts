import { apiFetch } from '@/lib/api-client';
import type { AdaptivePolicy, AdaptivePolicyInput } from './types';

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
