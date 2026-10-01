import { PlacementMode, PlacementSelfLevel } from '../../generated/prisma/client';
import { PLACEMENT_LR_FORM_IDS, selectPlacementFormId } from './placement-form.policy';

describe('Placement form policy', () => {
  it.each([
    [PlacementSelfLevel.UNKNOWN, PLACEMENT_LR_FORM_IDS.CORE],
    [PlacementSelfLevel.BEGINNER, PLACEMENT_LR_FORM_IDS.FOUNDATION],
    [PlacementSelfLevel.BASIC, PLACEMENT_LR_FORM_IDS.FOUNDATION],
    [PlacementSelfLevel.INTERMEDIATE, PLACEMENT_LR_FORM_IDS.CORE],
    [PlacementSelfLevel.GOOD, PLACEMENT_LR_FORM_IDS.ADVANCED],
  ])('maps %s deterministically to the configured LR form', (selfLevel, expected) => {
    expect(selectPlacementFormId(PlacementMode.LR, selfLevel)).toBe(expected);
  });

  it('does not select a form for FOUR_SKILLS in M03', () => {
    expect(selectPlacementFormId(PlacementMode.FOUR_SKILLS, PlacementSelfLevel.GOOD)).toBeNull();
  });
});
