import { duration, nextPhase, phaseGroups, rawParts, validateTiming } from './workflow.policy';
import type { PlacementSnapshot } from './source-eligibility';
import { BUSINESS_ROLES, eligible, inherent } from '../authorization/permission.policy';
const s = {
  mode: 'FOUR_SKILLS',
  groups: [
    {
      id: 'l',
      skill: 'LISTENING',
      taskCode: 'P1',
      questions: [{ id: 'ql', options: [{ id: 'key', isCorrect: true }] }],
    },
    { id: 'r', skill: 'READING', taskCode: 'P5', questions: [] },
    { id: 's', skill: 'SPEAKING', taskCode: 'SE_SW_01_S10_V01', questions: [{ id: 'sq' }] },
    { id: 'w', skill: 'WRITING', questions: [{ id: 'wq' }] },
  ],
} as unknown as PlacementSnapshot;
const p = {
  sourceHash: 'hash',
  evidence: 'Independent synthetic DEV policy, not academic signoff',
  tasks: [
    { groupId: 's', preparationSeconds: 0, playbackSeconds: 90, responseSeconds: 30 },
    { groupId: 'w', preparationSeconds: 0, playbackSeconds: 0, responseSeconds: 60 },
  ],
};
describe('W04B approved timing/diagnostic contract', () => {
  it('preserves exact LR server windows and separate10min break, task timing only from policy', () => {
    expect(duration('LISTENING', 0, s, p)).toBe(2700);
    expect(duration('READING', 0, s, p)).toBe(4500);
    expect(duration('BREAK', 0, s, p)).toBe(600);
    expect(duration('SPEAKING', 0, s, p)).toBe(120);
    expect(duration('WRITING', 0, s, p)).toBe(60);
  });
  it('does not infer missing or changed S/W timing', () => {
    expect(validateTiming(s, p, 'hash')).toBe(true);
    expect(validateTiming(s, p, 'other')).toBe(false);
    expect(validateTiming(s, { ...p, tasks: [] }, 'hash')).toBe(false);
    expect(() => duration('SPEAKING', 0, s, { ...p, tasks: [] })).toThrow();
  });
  it.each([-1, NaN, 30.5, 7201])('rejects invalid seconds %s', (v) =>
    expect(
      validateTiming(
        s,
        { ...p, tasks: [{ ...p.tasks[0], preparationSeconds: v }, p.tasks[1]] },
        'hash',
      ),
    ).toBe(false),
  );
  it('keeps S10 response30s and requires playback', () => {
    for (const t of [
      { ...p.tasks[0], responseSeconds: 31 },
      { ...p.tasks[0], playbackSeconds: 0 },
    ])
      expect(validateTiming(s, { ...p, tasks: [t, p.tasks[1]] }, 'hash')).toBe(false);
  });
  it('allows break only in FOUR transition, LR ends after Reading', () => {
    expect(nextPhase('READING', 0, s, true).phase).toBe('BREAK');
    expect(nextPhase('READING', 0, { ...s, mode: 'LR' }, true).phase).toBe('SUBMITTED');
    expect(nextPhase('BREAK', 0, s).phase).toBe('SPEAKING');
  });
  it('advances per-task without global FOUR timer and hides other section groups', () => {
    expect(nextPhase('SPEAKING', 0, s)).toEqual({ phase: 'WRITING', index: 0 });
    expect(nextPhase('WRITING', 0, s).phase).toBe('SUBMITTED');
    expect(phaseGroups(s, 'BREAK', 0)).toEqual([]);
    expect(phaseGroups(s, 'READING', 0).map((g) => g.id)).toEqual(['r']);
  });
  it('raw objective evidence counts exact singleton only, no official conversion', () => {
    expect(rawParts(s, [{ testQuestionId: 'ql', selectedOptionIds: ['key'] }])[0].correct).toBe(1);
    expect(
      rawParts(s, [{ testQuestionId: 'ql', selectedOptionIds: ['key', 'wrong'] }])[0].correct,
    ).toBe(0);
    expect(rawParts(s, [])[0].samples).toBe(1);
  });
  it.each(BUSINESS_ROLES)('%s has no inherited Placement delegated authority', (role) => {
    for (const cap of [
      'placement.grader.assign',
      'placement.result.publish',
      'placement.criteria.author',
      'placement.criteria.approve',
      'placement.source.approve',
      'placement.rubric.approve',
    ]) {
      expect(eligible(role, cap)).toBe(role === 'ACADEMIC_MANAGER');
      expect(inherent(role, cap)).toBe(false);
    }
    for (const cap of ['placement.source.author', 'placement.rubric.author'])
      expect(eligible(role, cap)).toBe(role === 'INSTRUCTOR');
  });
});
