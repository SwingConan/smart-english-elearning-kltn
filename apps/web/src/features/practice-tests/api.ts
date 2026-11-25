import { apiFetch } from '@/lib/api-client';
import type {
  PracticeAttemptResponse,
  PracticeResultResponse,
  PracticeResultSummary,
  PracticeTestListResponse,
} from './types';

export const practiceTestsApi = {
  listTests(signal?: AbortSignal) {
    return apiFetch<PracticeTestListResponse>('/v2/practice-tests', { signal });
  },

  startTest(testId: string, restart = false) {
    return apiFetch<{ attemptId: string; resumed: boolean }>(
      `/v2/practice-tests/${testId}/start`,
      {
        method: 'POST',
        body: JSON.stringify({ restart }),
      },
    );
  },

  getAttempt(attemptId: string, signal?: AbortSignal) {
    return apiFetch<PracticeAttemptResponse>(`/v2/practice-tests/attempts/${attemptId}`, {
      signal,
    });
  },

  saveProgress(
    attemptId: string,
    payload: {
      answers?: Array<{ testQuestionId: string; selectedOptionIds: string[] }>;
      markedQuestionIds?: string[];
      listeningGroupIndex?: number;
      enterReading?: boolean;
    },
  ) {
    return apiFetch<{
      saved: boolean;
      state: {
        phase: 'LISTENING' | 'READING';
        listeningGroupIndex: number;
        readingRemainingSeconds: number;
        markedQuestionIds: string[];
      };
    }>(`/v2/practice-tests/attempts/${attemptId}/answers`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  submitAttempt(attemptId: string) {
    return apiFetch<{
      attemptId: string;
      submittedAt: string;
      summary: PracticeResultSummary;
    }>(`/v2/practice-tests/attempts/${attemptId}/submit`, {
      method: 'POST',
    });
  },

  getHistoryByTest(testId: string, signal?: AbortSignal) {
    return apiFetch<PracticeResultResponse>(`/v2/practice-tests/${testId}/history`, { signal });
  },

  getResultByAttempt(attemptId: string, signal?: AbortSignal) {
    return apiFetch<PracticeResultResponse>(`/v2/practice-tests/attempts/${attemptId}/result`, {
      signal,
    });
  },
};
