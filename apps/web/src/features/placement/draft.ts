import type { PlacementDraft, PlacementSelfLevel } from './types';

export const PLACEMENT_DRAFT_KEY = 'smart-english:placement-draft:v1';

const levels = new Set<PlacementSelfLevel>([
  'UNKNOWN',
  'BEGINNER',
  'BASIC',
  'INTERMEDIATE',
  'GOOD',
]);

export const emptyPlacementDraft: PlacementDraft = {
  version: 1,
  mode: 'LR',
  goalScore: null,
  selfLevel: null,
  step: 1,
};

export function readPlacementDraft(storage: Pick<Storage, 'getItem'>): PlacementDraft {
  try {
    const parsed = JSON.parse(storage.getItem(PLACEMENT_DRAFT_KEY) ?? 'null') as Partial<PlacementDraft> | null;
    if (!parsed || parsed.version !== 1 || (parsed.mode !== 'LR' && parsed.mode !== 'FOUR_SKILLS')) return emptyPlacementDraft;
    const goalScore = Number.isInteger(parsed.goalScore) && Number(parsed.goalScore) >= 10 && Number(parsed.goalScore) <= 990
      ? Number(parsed.goalScore)
      : null;
    const selfLevel = parsed.selfLevel && levels.has(parsed.selfLevel) ? parsed.selfLevel : null;
    const step = parsed.step === 2 || parsed.step === 3 ? parsed.step : 1;
    return { version: 1, mode: parsed.mode, goalScore, selfLevel, step };
  } catch {
    return emptyPlacementDraft;
  }
}

export function writePlacementDraft(storage: Pick<Storage, 'setItem'>, draft: PlacementDraft) {
  storage.setItem(PLACEMENT_DRAFT_KEY, JSON.stringify(draft));
}
