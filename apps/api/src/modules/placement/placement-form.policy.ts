import { PlacementMode, PlacementSelfLevel } from '../../generated/prisma/client';

export const PLACEMENT_LR_FORM_IDS = {
  FOUNDATION: '80000000-0000-4000-8000-000000000001',
  CORE: '80000000-0000-4000-8000-000000000011',
  ADVANCED: '80000000-0000-4000-8000-000000000012',
} as const;
export const PLACEMENT_FOUR_SKILLS_FORM_ID = '80000000-0000-4000-8000-000000000021';
// M05 intentionally has one canonical FOUR_SKILLS form. If multiple forms are added later,
// revisit the active-attempt partial uniqueness invariant as well as semantic-mode lookup.

const LR_FORM_BY_SELF_LEVEL: Record<PlacementSelfLevel, string> = {
  UNKNOWN: PLACEMENT_LR_FORM_IDS.CORE,
  BEGINNER: PLACEMENT_LR_FORM_IDS.FOUNDATION,
  BASIC: PLACEMENT_LR_FORM_IDS.FOUNDATION,
  INTERMEDIATE: PLACEMENT_LR_FORM_IDS.CORE,
  GOOD: PLACEMENT_LR_FORM_IDS.ADVANCED,
};

export function selectPlacementFormId(
  mode: PlacementMode,
  selfLevel: PlacementSelfLevel,
): string | null {
  if (mode === PlacementMode.FOUR_SKILLS) return PLACEMENT_FOUR_SKILLS_FORM_ID;
  return LR_FORM_BY_SELF_LEVEL[selfLevel];
}

export function placementFormPolicyEntries() {
  const lr = Object.entries(LR_FORM_BY_SELF_LEVEL).map(([selfLevel, testId]) => ({
    selfLevel: selfLevel as PlacementSelfLevel,
    testId,
  }));
  return [...lr, { selfLevel: PlacementSelfLevel.UNKNOWN, testId: PLACEMENT_FOUR_SKILLS_FORM_ID }];
}
