import type { PlacementSnapshot } from './source-eligibility';

export type Phase =
  'LISTENING' | 'READING' | 'BREAK' | 'SPEAKING' | 'WRITING' | 'SUBMITTED' | 'BLOCKED_REVIEW';
export type TaskWindow = {
  groupId: string;
  preparationSeconds: number;
  playbackSeconds: number;
  responseSeconds: number;
  uploadSeconds?: number;
};
export type TimingPolicy = { sourceHash: string; tasks: TaskWindow[]; evidence: string };
export type RubricPolicy = {
  sourceHash: string;
  evidence: string;
  scale: string;
  tasks: { groupId: string; criteria: { code: string; descriptor: string; max: number }[] }[];
};
export type CriteriaPolicy = {
  evidence: string;
  rules: {
    skill: string;
    part?: string;
    domainCode?: string;
    priorityRank?: number;
    scale: string;
    minSamples: number;
    min: number;
    max: number;
    courseVersionIds: string[];
  }[];
};
export const PHASE_SECONDS = { LISTENING: 2700, READING: 4500, BREAK: 600 } as const;
export function validateTiming(s: PlacementSnapshot, b: TimingPolicy, digest: string) {
  if (b.sourceHash !== digest || !b.evidence?.trim() || !Array.isArray(b.tasks)) return false;
  if (!b.tasks.every((t) => t && typeof t === 'object')) return false;
  const groups = s.groups.filter((g) => ['SPEAKING', 'WRITING'].includes(g.skill));
  return (
    b.tasks.length === groups.length &&
    new Set(b.tasks.map((t) => t.groupId)).size === groups.length &&
    groups.every((g) => {
      const t = b.tasks.find((x) => x.groupId === g.id);
      return (
        !!t &&
        g.questions.length === 1 &&
        [t.preparationSeconds, t.playbackSeconds, t.responseSeconds].every(
          (v) => Number.isSafeInteger(v) && v >= 0 && v <= 7200,
        ) &&
        t.responseSeconds > 0 &&
        (g.skill !== 'SPEAKING' ||
          g.taskCode === 'SE_SW_01_S10_V01' ||
          (Number.isSafeInteger(t.uploadSeconds) &&
            t.uploadSeconds! >= 0 &&
            t.uploadSeconds! <= 120)) &&
        (g.taskCode !== 'SE_SW_01_S10_V01' || (t.responseSeconds === 30 && t.playbackSeconds > 0))
      );
    })
  );
}
export function phaseGroups(s: PlacementSnapshot, phase: Phase, index: number) {
  const groups = s.groups.filter((g) => g.skill === phase);
  return ['SPEAKING', 'WRITING'].includes(phase) ? groups.slice(index, index + 1) : groups;
}
export function duration(phase: Phase, index: number, s: PlacementSnapshot, p: TimingPolicy) {
  if (phase === 'LISTENING' || phase === 'READING' || phase === 'BREAK')
    return PHASE_SECONDS[phase];
  const group = phaseGroups(s, phase, index)[0],
    t = p.tasks.find((t) => t.groupId === group?.id);
  if (!t) throw Error('APPROVED_TASK_WINDOW_MISSING');
  return t.preparationSeconds + t.playbackSeconds + t.responseSeconds;
}
export function nextPhase(
  phase: Phase,
  index: number,
  s: PlacementSnapshot,
  breakRequested = false,
): { phase: Phase; index: number } {
  if (phase === 'LISTENING') return { phase: 'READING', index: 0 };
  if (phase === 'READING')
    return {
      phase: s.mode === 'LR' ? 'SUBMITTED' : breakRequested ? 'BREAK' : 'SPEAKING',
      index: 0,
    };
  if (phase === 'BREAK') return { phase: 'SPEAKING', index: 0 };
  if (phase === 'SPEAKING' || phase === 'WRITING') {
    if (index + 1 < s.groups.filter((g) => g.skill === phase).length)
      return { phase, index: index + 1 };
    return { phase: phase === 'SPEAKING' ? 'WRITING' : 'SUBMITTED', index: 0 };
  }
  throw Error('TERMINAL_SITTING');
}
export function rawParts(
  s: PlacementSnapshot,
  answers: { testQuestionId: string; selectedOptionIds: string[] }[],
) {
  return s.groups
    .filter((g) => ['LISTENING', 'READING'].includes(g.skill))
    .map((g) => ({
      skill: g.skill,
      part: g.taskCode,
      samples: g.questions.length,
      correct: g.questions.filter((q) => {
        const a = answers.find((a) => a.testQuestionId === q.id),
          key = q.options.filter((o) => o.isCorrect).map((o) => o.id);
        return (
          key.length === 1 && a?.selectedOptionIds.length === 1 && a.selectedOptionIds[0] === key[0]
        );
      }).length,
    }));
}
