import { apiFetch } from '@/lib/api-client';
import type {
  PlacementConfig,
  PlacementExamResponse,
  PlacementHistoryItem,
  PlacementResult,
  PlacementSelfLevel,
  PlacementStartResponse,
} from './types';

const segment = encodeURIComponent;

export const placementApi = {
  config: (signal?: AbortSignal): Promise<PlacementConfig> =>
    apiFetch('/placement/config', { signal }),
  start: (input: {
    mode: 'LR' | 'FOUR_SKILLS';
    selfLevel: PlacementSelfLevel;
    goalScore: number;
  }): Promise<PlacementStartResponse> =>
    apiFetch('/placement/attempts/start', { method: 'POST', body: JSON.stringify(input) }),
  exam: (attemptId: string, signal?: AbortSignal): Promise<PlacementExamResponse> =>
    apiFetch(`/placement/attempts/${segment(attemptId)}/exam`, { signal }),
  saveAnswer: (
    attemptId: string,
    testQuestionId: string,
    answer: { selectedOptionIds: string[] } | { textResponse: string },
  ) =>
    apiFetch<{ savedAt: string; state: 'SAVED' }>(
      `/placement/attempts/${segment(attemptId)}/answers/${segment(testQuestionId)}`,
      { method: 'PUT', body: JSON.stringify(answer) },
    ),
  uploadAudio: (attemptId: string, testQuestionId: string, blob: Blob) => {
    const body = new FormData();
    body.append('file', blob, 'speaking-response.webm');
    return apiFetch<{ savedAt: string; state: 'UPLOADED'; playbackUrl: string }>(
      `/placement/attempts/${segment(attemptId)}/answers/${segment(testQuestionId)}/audio`,
      { method: 'POST', body },
    );
  },
  submit: (attemptId: string, reason: 'MANUAL' | 'TIMEOUT'): Promise<PlacementResult> =>
    apiFetch(`/placement/attempts/${segment(attemptId)}/submit`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
  result: (attemptId: string, signal?: AbortSignal): Promise<PlacementResult> =>
    apiFetch(`/placement/attempts/${segment(attemptId)}/result`, { signal }),
  history: (signal?: AbortSignal): Promise<PlacementHistoryItem[]> =>
    apiFetch('/placement/history', { signal }),
};
