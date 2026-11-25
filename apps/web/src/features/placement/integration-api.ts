import { apiFetch } from '@/lib/api-client';
export type Mode = 'LR' | 'FOUR_SKILLS';
export type Goals = { goalLR: number; goalSpeaking?: number; goalWriting?: number };
export type PreviewSource = {
  id: string;
  mode: Mode;
  version: number;
  title: string;
  itemCount: number;
  policyId?: string;
  attemptId?: string;
  attemptStatus?: string;
  retakeAllowed?: boolean;
};
export type PlacementIntegrationConfig = {
  modes: Mode[];
  fullExamEnabled: boolean;
  releaseScope?: string;
  previewEnabled: boolean;
  workflowEnabled?: boolean;
  sources: PreviewSource[];
  message: string;
};
export type PlacementHistoryEntry = {
  attemptId: string;
  kind: string;
  status?: string;
  label: string;
  mode?: Mode;
  startedAt?: string;
  submittedAt?: string | null;
  resultPath: string | null;
};
export type PreviewQuestion = {
  testQuestionId: string;
  content: string;
  responseType: string;
  toeicSkill: string;
  options: { id: string; content: string }[];
  selectedOptionIds: string[];
  textResponse: string | null;
  audioUploaded: boolean;
};
export type PreviewExam = {
  attemptId: string;
  state: 'DEV_PREVIEW' | 'PREVIEW_COMPLETED';
  mode: Mode;
  goals: Goals;
  lockVersion: number;
  marked: string[];
  receipt: string | null;
  wholeExamDeadline: null;
  ungraded: true;
  title: string;
  sourceVersion: number;
  groups: {
    id: string;
    taskCode: string | null;
    title: string | null;
    instructions: string | null;
    skill: string;
    playbackPolicy: unknown;
    stimulusText: string | null;
    stimuli: {
      id: string;
      type: string;
      textContent: string | null;
      mediaUrl: string | null;
      altText: string | null;
    }[];
    questions: PreviewQuestion[];
  }[];
};
export type PreviewDiagnostic = {
  attemptId: string;
  mode: Mode;
  state: string;
  label: string;
  goals: Goals;
  score: null;
  measuredLevel: null;
  officialToeicScore: null;
  receipt: string | null;
  skillResults: { skill: string; status: string; score: null }[];
  recommendations: never[];
};
const root = '/v2/placement';
const id = encodeURIComponent;
export const placementIntegration = {
  config: (signal?: AbortSignal) =>
    apiFetch<PlacementIntegrationConfig>(root + '/config', { signal }),
  start: async (
    b: Goals & { mode: Mode; sourceVersionId: string; policyId?: string; idempotencyKey: string },
  ) => {
    if (b.policyId) {
      const result = await apiFetch<{ attemptId: string; resumed: boolean }>(
        root + '/workflow/attempts',
        {
          method: 'POST',
          body: JSON.stringify(b),
        },
      );
      return { ...result, examPath: `/placement/sittings/${result.attemptId}` };
    }
    return apiFetch<{ attemptId: string; examPath: string; resumed: boolean }>(root + '/previews', {
      method: 'POST',
      body: JSON.stringify(b),
    });
  },
  exam: (a: string) => apiFetch<PreviewExam>(root + '/attempts/' + id(a) + '/exam'),
  write: (a: string, q: string | undefined, kind: 'answers' | 'marks' | 'complete', b: unknown) =>
    apiFetch<{ lockVersion: number; state: string; receipt: string | null }>(
      root + '/attempts/' + id(a) + '/' + kind + (q ? '/' + id(q) : ''),
      { method: kind === 'complete' ? 'POST' : 'PUT', body: JSON.stringify(b) },
    ),
  diagnostic: (a: string) =>
    apiFetch<PreviewDiagnostic>(root + '/attempts/' + id(a) + '/diagnostic'),
  history: () => apiFetch<PlacementHistoryEntry[]>(root + '/history'),
};
