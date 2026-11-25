import { quizDigest } from '../class-lms/quiz.service';
export const PLACEMENT_BLUEPRINT = {
  LISTENING: { 1: 6, 2: 25, 3: 39, 4: 30 },
  READING: { 5: 30, 6: 16, 7: 54 },
  SPEAKING: 11,
  WRITING: 8,
} as const;
export type PlacementSnapshot = {
  testId: string;
  allQuestionIds: string[];
  mode: 'LR' | 'FOUR_SKILLS';
  title: string;
  groups: {
    id: string;
    skill: string;
    taskCode: string | null;
    title: string | null;
    instructions: string | null;
    stimulusText: string | null;
    audioUrl: string | null;
    preparationSeconds: number | null;
    responseSeconds: number | null;
    recommendedSeconds: number | null;
    maxRecordingSeconds: number | null;
    stimuli: {
      id: string;
      type: string;
      orderIndex: number;
      textContent: string | null;
      storageKey: string | null;
      mimeType: string | null;
      altText: string | null;
      isProtected: boolean;
    }[];
    questions: {
      id: string;
      orderIndex: number;
      points: number;
      questionId: string;
      content: string;
      responseType: string;
      skill: string;
      explanation: string | null;
      options: { id: string; content: string; orderIndex: number; isCorrect: boolean }[];
    }[];
  }[];
};
export type PlacementProvenance = {
  source?: string;
  rights?: { status?: string; evidence?: string };
  academic?: { status?: string; reviewerId?: string };
  assets?: {
    id: string;
    sha256: string;
    rights: string;
    reviewers: { id: string; status: string; reviewedAt: string; human: boolean }[];
  }[];
  synthetic?: boolean;
};
export function placementEligibility(s: PlacementSnapshot, p: PlacementProvenance) {
  const reasons = new Set<string>(),
    counts: Record<string, number> = {},
    parts: Record<string, number> = {};
  const ids = new Set<string>();
  const all = s.groups.flatMap((g) => g.questions.map((q) => q.id));
  if (
    all.length !== s.allQuestionIds.length ||
    new Set(all).size !== all.length ||
    s.allQuestionIds.some((id) => !all.includes(id))
  )
    reasons.add('UNASSIGNED_OR_FOREIGN_QUESTIONS');
  for (const g of s.groups) {
    const part = /^(?:LR-)?P([1-7])$/.exec(g.taskCode ?? '')?.[1];
    if (!g.questions.length) reasons.add('EMPTY_GROUP');
    for (const q of g.questions) {
      counts[q.skill] = (counts[q.skill] ?? 0) + 1;
      if (ids.has(q.questionId)) reasons.add('DUPLICATE_QUESTION');
      ids.add(q.questionId);
      if (q.skill !== g.skill || !q.content.trim() || g.audioUrl)
        reasons.add('INVALID_CONTENT_OR_EXTERNAL_MEDIA');
      if (['LISTENING', 'READING'].includes(q.skill)) {
        if (
          !part ||
          (q.skill === 'LISTENING' && Number(part) > 4) ||
          (q.skill === 'READING' && Number(part) < 5)
        )
          reasons.add('MISSING_OR_WRONG_PART');
        else parts[part] = (parts[part] ?? 0) + 1;
        if (
          q.responseType !== 'SINGLE_CHOICE' ||
          q.options.length < 2 ||
          q.options.filter((x) => x.isCorrect).length !== 1 ||
          q.options.some((x) => !x.content.trim())
        )
          reasons.add('ANSWER_KEY_INVALID');
      } else if (
        (q.skill === 'SPEAKING' && q.responseType !== 'AUDIO_RESPONSE') ||
        (q.skill === 'WRITING' && q.responseType !== 'TEXT_RESPONSE')
      )
        reasons.add('RESPONSE_TYPE_INVALID');
    }
    const publicAssets = g.stimuli.filter((x) => !x.isProtected);
    if (g.skill === 'LISTENING' && !publicAssets.some((x) => x.type === 'AUDIO'))
      reasons.add('LISTENING_AUDIO_MISSING');
    if (part === '1' && !publicAssets.some((x) => x.type === 'IMAGE'))
      reasons.add('PART1_IMAGE_MISSING');
    if (
      g.skill === 'SPEAKING' &&
      g.taskCode === 'SE_SW_01_S10_V01' &&
      !publicAssets.some((x) => x.type === 'AUDIO' && x.mimeType === 'audio/wav')
    )
      reasons.add('S10_WAV_MISSING');
    for (const a of g.stimuli.filter((x) => x.type !== 'TEXT')) {
      const ev = p.assets?.find((x) => x.id === a.id);
      if (!a.storageKey || !ev || !/^[a-f0-9]{64}$/.test(ev.sha256))
        reasons.add('ASSET_EVIDENCE_MISSING');
      if (ev?.rights !== 'CLEARED') reasons.add('ASSET_RIGHTS_PENDING');
      const reviewers = (ev?.reviewers ?? []).filter(
        (x) =>
          x.human && x.status === 'PASS' && !!x.id && Number.isFinite(Date.parse(x.reviewedAt)),
      );
      if (new Set(reviewers.map((x) => x.id)).size < 2) reasons.add('TWO_MEDIA_REVIEWERS_PENDING');
    }
  }
  for (const [part, n] of Object.entries({
    ...PLACEMENT_BLUEPRINT.LISTENING,
    ...PLACEMENT_BLUEPRINT.READING,
  }))
    if (parts[part] !== n) reasons.add('FULL_PART_BLUEPRINT_MISMATCH');
  if (counts.LISTENING !== 100 || counts.READING !== 100) reasons.add('FULL_LR_200_REQUIRED');
  if (s.mode === 'FOUR_SKILLS' && (counts.SPEAKING !== 11 || counts.WRITING !== 8))
    reasons.add('FULL_FOUR_SKILLS_219_REQUIRED');
  if (s.mode === 'LR' && ((counts.SPEAKING ?? 0) || (counts.WRITING ?? 0)))
    reasons.add('WRONG_MODE_CONTENT');
  if (!p.source?.trim()) reasons.add('SOURCE_PROVENANCE_MISSING');
  if (p.rights?.status !== 'CLEARED' || !p.rights.evidence?.trim())
    reasons.add('SOURCE_RIGHTS_PENDING');
  if (p.academic?.status !== 'APPROVED' || !p.academic.reviewerId)
    reasons.add('ACADEMIC_REVIEW_PENDING');
  if (p.synthetic) reasons.add('SYNTHETIC_NOT_PUBLISHABLE');
  return {
    counts,
    parts,
    fullBlueprintAndEvidenceReady: reasons.size === 0,
    reasons: [...reasons],
    learnerPublishable: false as const,
    policyGate: 'REAL_SOURCE_RELEASE_AUTHORIZATION_PENDING',
  };
}
export const placementSourceDigest = (s: PlacementSnapshot) => quizDigest(s);
