import { apiFetch } from '@/lib/api-client';
import type { StudyRecommendationResponse } from './types';

export const studyRecommendationApi = {
  get: (enrollmentId: string, signal?: AbortSignal): Promise<StudyRecommendationResponse> =>
    apiFetch(`/learning/enrollments/${encodeURIComponent(enrollmentId)}/recommendations`, {
      signal,
    }),
};
