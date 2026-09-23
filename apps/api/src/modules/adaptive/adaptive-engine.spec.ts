import {
  AdaptiveLessonInput,
  AdaptiveSkillInput,
  ComputeAdaptivePathInput,
  computeAdaptivePath,
} from './adaptive-engine';

const policy = {
  remedialThreshold: 0.4,
  progressionThreshold: 0.8,
};

function skill(id: string, overrides: Partial<AdaptiveSkillInput> = {}): AdaptiveSkillInput {
  return {
    id,
    code: id.toUpperCase(),
    name: `Skill ${id}`,
    pInit: 0.5,
    prerequisiteSkillIds: [],
    ...overrides,
  };
}

function lesson(
  id: string,
  skillIds: readonly string[],
  overrides: Partial<AdaptiveLessonInput> = {},
): AdaptiveLessonInput {
  return {
    id,
    title: `Lesson ${id}`,
    moduleId: 'module-1',
    moduleTitle: 'Module 1',
    moduleOrderIndex: 1,
    lessonOrderIndex: 1,
    skillIds,
    progressStatus: 'NOT_STARTED',
    ...overrides,
  };
}

function input(
  skills: readonly AdaptiveSkillInput[],
  lessons: readonly AdaptiveLessonInput[] = [],
): ComputeAdaptivePathInput {
  return { policy, skills, lessons };
}

describe('computeAdaptivePath policy and input validation', () => {
  it('accepts the default policy thresholds', () => {
    expect(computeAdaptivePath(input([], []))).toEqual({
      configurationStatus: 'NO_MAPPED_LESSONS',
      skillClassifications: [],
      path: [],
      blockedLessons: [],
      unmappedLessons: [],
    });
  });

  it.each([
    [-0.01, 0.8],
    [0.4, 1.01],
    [0.4, 0.4],
    [0.8, 0.4],
    [Number.NaN, 0.8],
    [0.4, Number.POSITIVE_INFINITY],
  ])('rejects invalid policy thresholds %#', (remedial, progression) => {
    expect(() =>
      computeAdaptivePath({
        policy: {
          remedialThreshold: remedial,
          progressionThreshold: progression,
        },
        skills: [],
        lessons: [],
      }),
    ).toThrow(Error);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -0.01, 1.01])(
    'rejects invalid pInit %p',
    (pInit) => {
      expect(() => computeAdaptivePath(input([skill('s1', { pInit })]))).toThrow(Error);
    },
  );

  it.each([Number.NaN, Number.NEGATIVE_INFINITY, -0.01, 1.01])(
    'rejects invalid observed mastery %p',
    (masteryProbability) => {
      expect(() =>
        computeAdaptivePath(input([skill('s1', { learnerState: { masteryProbability } })])),
      ).toThrow(Error);
    },
  );

  it('rejects duplicate Skill IDs', () => {
    expect(() => computeAdaptivePath(input([skill('s1'), skill('s1')]))).toThrow(
      'Duplicate Skill ID',
    );
  });

  it('rejects unknown prerequisite and Lesson Skill references', () => {
    expect(() =>
      computeAdaptivePath(input([skill('s1', { prerequisiteSkillIds: ['missing'] })])),
    ).toThrow('unknown prerequisite Skill');
    expect(() => computeAdaptivePath(input([skill('s1')], [lesson('l1', ['missing'])]))).toThrow(
      'unknown Skill',
    );
  });
});

describe('computeAdaptivePath Skill semantics', () => {
  it.each([
    [0.1, 'UNASSESSED'],
    [0.9, 'UNASSESSED'],
  ] as const)('keeps PRIOR pInit %p UNASSESSED', (pInit, masteryBand) => {
    const result = computeAdaptivePath(input([skill('s1', { pInit })]));

    expect(result.skillClassifications[0]).toMatchObject({
      state: 'PRIOR',
      masteryProbability: pInit,
      masteryBand,
    });
  });

  it.each([
    [0.399999, 'REMEDIAL'],
    [0.4, 'REINFORCEMENT'],
    [0.799999, 'REINFORCEMENT'],
    [0.8, 'PROGRESSION_READY'],
    [0.95, 'PROGRESSION_READY'],
  ] as const)('classifies observed mastery %p as %s', (masteryProbability, masteryBand) => {
    const result = computeAdaptivePath(
      input([skill('s1', { learnerState: { masteryProbability } })]),
    );

    expect(result.skillClassifications[0]).toMatchObject({
      state: 'OBSERVED',
      masteryProbability,
      masteryBand,
    });
  });

  it('marks a Skill without prerequisites READY', () => {
    const result = computeAdaptivePath(input([skill('s1')]));

    expect(result.skillClassifications[0]).toMatchObject({
      prerequisiteStatus: 'READY',
      unsatisfiedPrerequisites: [],
    });
  });

  it('blocks PRIOR and below-threshold direct prerequisites', () => {
    const result = computeAdaptivePath(
      input([
        skill('target', { prerequisiteSkillIds: ['prior', 'low'] }),
        skill('prior', { pInit: 0.9 }),
        skill('low', { learnerState: { masteryProbability: 0.79 } }),
      ]),
    );
    const target = result.skillClassifications.find(
      (classification) => classification.skillId === 'target',
    );

    expect(target).toMatchObject({
      prerequisiteStatus: 'BLOCKED',
      unsatisfiedPrerequisites: [
        { skillId: 'low', state: 'OBSERVED', masteryProbability: 0.79 },
        { skillId: 'prior', state: 'PRIOR', masteryProbability: 0.9 },
      ],
    });
  });

  it('accepts an observed direct prerequisite exactly at progression', () => {
    const result = computeAdaptivePath(
      input([
        skill('target', { prerequisiteSkillIds: ['ready'] }),
        skill('ready', { learnerState: { masteryProbability: 0.8 } }),
      ]),
    );

    expect(result.skillClassifications.find(({ skillId }) => skillId === 'target')).toMatchObject({
      prerequisiteStatus: 'READY',
    });
  });

  it('blocks when one of multiple direct prerequisites is unsatisfied', () => {
    const result = computeAdaptivePath(
      input([
        skill('target', { prerequisiteSkillIds: ['ready', 'prior'] }),
        skill('ready', { learnerState: { masteryProbability: 0.9 } }),
        skill('prior'),
      ]),
    );

    expect(result.skillClassifications.find(({ skillId }) => skillId === 'target')).toMatchObject({
      prerequisiteStatus: 'BLOCKED',
      unsatisfiedPrerequisites: [{ skillId: 'prior' }],
    });
  });

  it('evaluates only direct prerequisites', () => {
    const result = computeAdaptivePath(
      input([
        skill('advanced', { prerequisiteSkillIds: ['middle'] }),
        skill('middle', {
          prerequisiteSkillIds: ['foundation'],
          learnerState: { masteryProbability: 0.9 },
        }),
        skill('foundation'),
      ]),
    );

    expect(result.skillClassifications.find(({ skillId }) => skillId === 'advanced')).toMatchObject(
      { prerequisiteStatus: 'READY' },
    );
    expect(result.skillClassifications.find(({ skillId }) => skillId === 'middle')).toMatchObject({
      prerequisiteStatus: 'BLOCKED',
    });
  });

  it('uses current mastery when a previously sufficient prerequisite drops', () => {
    const readyInput = input([
      skill('target', { prerequisiteSkillIds: ['prerequisite'] }),
      skill('prerequisite', { learnerState: { masteryProbability: 0.8 } }),
    ]);
    const droppedInput = input([
      skill('target', { prerequisiteSkillIds: ['prerequisite'] }),
      skill('prerequisite', { learnerState: { masteryProbability: 0.79 } }),
    ]);

    expect(computeAdaptivePath(readyInput).skillClassifications[1].prerequisiteStatus).toBe(
      'READY',
    );
    expect(computeAdaptivePath(droppedInput).skillClassifications[1].prerequisiteStatus).toBe(
      'BLOCKED',
    );
  });

  it('sorts classifications by Skill code and then Skill ID', () => {
    const result = computeAdaptivePath(
      input([
        skill('b', { code: 'SAME' }),
        skill('z', { code: 'FIRST' }),
        skill('a', { code: 'SAME' }),
      ]),
    );

    expect(result.skillClassifications.map(({ skillId }) => skillId)).toEqual(['z', 'a', 'b']);
  });
});

describe('computeAdaptivePath Lesson categories and reasons', () => {
  it.each([
    [0.2, 'REMEDIAL', 'REMEDIAL_LOW_MASTERY', 0.4],
    [0.6, 'REINFORCEMENT', 'REINFORCEMENT_BUILDING', 0.8],
  ] as const)(
    'creates an observed %s recommendation',
    (masteryProbability, category, reasonCode, threshold) => {
      const result = computeAdaptivePath(
        input([skill('s1', { learnerState: { masteryProbability } })], [lesson('l1', ['s1'])]),
      );

      expect(result.path[0]).toMatchObject({
        category,
        isCompleted: false,
        isReview: false,
        reason: {
          reasonCode,
          focusSkillId: 's1',
          masteryProbability,
          threshold,
          state: 'OBSERVED',
          unsatisfiedPrerequisites: [],
        },
      });
    },
  );

  it('creates a PRIOR progression recommendation with structured reason', () => {
    const result = computeAdaptivePath(
      input([skill('s1', { pInit: 0.9 })], [lesson('l1', ['s1'])]),
    );

    expect(result.path[0]).toMatchObject({
      category: 'PROGRESSION',
      reason: {
        reasonCode: 'PROGRESSION_PREREQUISITES_READY',
        focusSkillId: 's1',
        focusSkillCode: 'S1',
        focusSkillName: 'Skill s1',
        masteryProbability: 0.9,
        threshold: null,
        state: 'PRIOR',
      },
    });
    expect(result.path[0].reason).not.toHaveProperty('reasonText');
  });

  it('omits an eligible Lesson when all mapped Skills are progression-ready', () => {
    const result = computeAdaptivePath(
      input([skill('s1', { learnerState: { masteryProbability: 0.8 } })], [lesson('l1', ['s1'])]),
    );

    expect(result.path).toEqual([]);
    expect(result.blockedLessons).toEqual([]);
    expect(result.unmappedLessons).toEqual([]);
  });

  it.each([
    [0.2, undefined, 'REMEDIAL'],
    [0.6, undefined, 'REINFORCEMENT'],
    [0.9, undefined, 'PROGRESSION'],
  ] as const)(
    'applies worst-need priority for mastery %p plus an UNASSESSED Skill',
    (masteryProbability, learnerState, category) => {
      const observed = skill('observed', {
        learnerState: { masteryProbability },
      });
      const unassessed = skill('unassessed', { learnerState });
      const result = computeAdaptivePath(
        input([observed, unassessed], [lesson('l1', ['observed', 'unassessed'])]),
      );

      expect(result.path[0].category).toBe(category);
    },
  );

  it.each([
    [0.2, 0.6, 'REMEDIAL'],
    [0.6, undefined, 'REINFORCEMENT'],
    [0.9, undefined, 'PROGRESSION'],
  ] as const)(
    'prioritizes mixed mapped Skills (%p, %p) as %s',
    (firstMastery, secondMastery, category) => {
      const first = skill('first', {
        learnerState: { masteryProbability: firstMastery },
      });
      const second = skill('second', {
        learnerState:
          secondMastery === undefined ? undefined : { masteryProbability: secondMastery },
      });
      const result = computeAdaptivePath(
        input([first, second], [lesson('l1', ['first', 'second'])]),
      );

      expect(result.path[0].category).toBe(category);
    },
  );

  it('chooses lowest mastery and then Skill ID as remedial focus', () => {
    const result = computeAdaptivePath(
      input(
        [
          skill('c', { learnerState: { masteryProbability: 0.3 } }),
          skill('b', { learnerState: { masteryProbability: 0.2 } }),
          skill('a', { learnerState: { masteryProbability: 0.2 } }),
        ],
        [lesson('l1', ['c', 'b', 'a'])],
      ),
    );

    expect(result.path[0].reason.focusSkillId).toBe('a');
  });

  it('chooses lowest mastery and then Skill ID as reinforcement focus', () => {
    const result = computeAdaptivePath(
      input(
        [
          skill('c', { learnerState: { masteryProbability: 0.7 } }),
          skill('b', { learnerState: { masteryProbability: 0.5 } }),
          skill('a', { learnerState: { masteryProbability: 0.5 } }),
        ],
        [lesson('l1', ['c', 'b', 'a'])],
      ),
    );

    expect(result.path[0].reason.focusSkillId).toBe('a');
  });

  it('chooses the lowest Skill ID among multiple UNASSESSED Skills', () => {
    const result = computeAdaptivePath(input([skill('b'), skill('a')], [lesson('l1', ['b', 'a'])]));

    expect(result.path[0].reason.focusSkillId).toBe('a');
  });

  it('blocks the entire Lesson and selects blocked Skill ID deterministically', () => {
    const result = computeAdaptivePath(
      input(
        [
          skill('blocked-b', { prerequisiteSkillIds: ['prior-b'] }),
          skill('blocked-a', { prerequisiteSkillIds: ['prior-c', 'prior-a'] }),
          skill('prior-a'),
          skill('prior-b'),
          skill('prior-c'),
        ],
        [lesson('l1', ['blocked-b', 'blocked-a'])],
      ),
    );

    expect(result.path).toEqual([]);
    expect(result.blockedLessons[0]).toMatchObject({
      lessonId: 'l1',
      reason: {
        reasonCode: 'LOCKED_PREREQUISITE',
        focusSkillId: 'blocked-a',
        threshold: 0.8,
        unsatisfiedPrerequisites: [{ skillId: 'prior-a' }, { skillId: 'prior-c' }],
      },
    });
  });
});

describe('computeAdaptivePath completion and configuration', () => {
  it.each([
    [0.2, 'REMEDIAL'],
    [0.6, 'REINFORCEMENT'],
  ] as const)('keeps a completed %s Lesson as review', (masteryProbability, category) => {
    const result = computeAdaptivePath(
      input(
        [skill('s1', { learnerState: { masteryProbability } })],
        [lesson('l1', ['s1'], { progressStatus: 'COMPLETED' })],
      ),
    );

    expect(result.path[0]).toMatchObject({
      category,
      isCompleted: true,
      isReview: true,
    });
    expect(result.skillClassifications[0].masteryProbability).toBe(masteryProbability);
  });

  it('includes uncompleted progression but excludes completed progression', () => {
    const result = computeAdaptivePath(
      input(
        [skill('s1')],
        [lesson('open', ['s1']), lesson('done', ['s1'], { progressStatus: 'COMPLETED' })],
      ),
    );

    expect(result.path.map(({ lessonId }) => lessonId)).toEqual(['open']);
  });

  it('treats IN_PROGRESS as uncompleted', () => {
    const result = computeAdaptivePath(
      input(
        [skill('s1', { learnerState: { masteryProbability: 0.2 } })],
        [lesson('l1', ['s1'], { progressStatus: 'IN_PROGRESS' })],
      ),
    );

    expect(result.path[0]).toMatchObject({
      isCompleted: false,
      isReview: false,
    });
  });

  it('returns NO_MAPPED_LESSONS for no Lessons', () => {
    expect(computeAdaptivePath(input([skill('s1')]))).toMatchObject({
      configurationStatus: 'NO_MAPPED_LESSONS',
      path: [],
      unmappedLessons: [],
    });
  });

  it('returns all unmapped Lessons separately when none are mapped', () => {
    const result = computeAdaptivePath(
      input(
        [skill('s1')],
        [
          lesson('later', [], { lessonOrderIndex: 2 }),
          lesson('earlier', [], { lessonOrderIndex: 1 }),
        ],
      ),
    );

    expect(result.configurationStatus).toBe('NO_MAPPED_LESSONS');
    expect(result.path).toEqual([]);
    expect(result.blockedLessons).toEqual([]);
    expect(result.unmappedLessons.map(({ lessonId }) => lessonId)).toEqual(['earlier', 'later']);
  });

  it('distinguishes partially mapped and fully mapped curricula', () => {
    const skills = [skill('s1')];
    const mapped = lesson('mapped', ['s1']);
    const unmapped = lesson('unmapped', []);

    expect(computeAdaptivePath(input(skills, [mapped, unmapped])).configurationStatus).toBe(
      'PARTIALLY_MAPPED',
    );
    expect(computeAdaptivePath(input(skills, [mapped])).configurationStatus).toBe('READY');
  });
});

describe('computeAdaptivePath ordering and purity', () => {
  it('orders categories, reviews, mastery, curriculum, and Lesson ID', () => {
    const skills = [
      skill('rem-low', { learnerState: { masteryProbability: 0.1 } }),
      skill('rem-high', { learnerState: { masteryProbability: 0.3 } }),
      skill('reinforce', { learnerState: { masteryProbability: 0.5 } }),
      skill('prior'),
    ];
    const lessons = [
      lesson('progression-b', ['prior'], { lessonOrderIndex: 2 }),
      lesson('reinforcement', ['reinforce']),
      lesson('review', ['rem-low'], { progressStatus: 'COMPLETED' }),
      lesson('remedial-high', ['rem-high']),
      lesson('remedial-low-b', ['rem-low'], { lessonOrderIndex: 2 }),
      lesson('remedial-low-a', ['rem-low'], { lessonOrderIndex: 1 }),
      lesson('progression-a', ['prior'], { lessonOrderIndex: 1 }),
    ];

    expect(
      computeAdaptivePath(input(skills, lessons)).path.map(({ lessonId }) => lessonId),
    ).toEqual([
      'remedial-low-a',
      'remedial-low-b',
      'remedial-high',
      'review',
      'reinforcement',
      'progression-a',
      'progression-b',
    ]);
  });

  it('uses module, Lesson order, and Lesson ID tie-breaks', () => {
    const skills = [skill('remedial', { learnerState: { masteryProbability: 0.2 } })];
    const lessons = [
      lesson('module-later', ['remedial'], { moduleOrderIndex: 2 }),
      lesson('lesson-later', ['remedial'], { lessonOrderIndex: 2 }),
      lesson('z', ['remedial']),
      lesson('a', ['remedial']),
    ];

    expect(
      computeAdaptivePath(input(skills, lessons)).path.map(({ lessonId }) => lessonId),
    ).toEqual(['a', 'z', 'lesson-later', 'module-later']);
  });

  it('orders blocked and unmapped Lessons by curriculum position and ID', () => {
    const skills = [skill('blocked', { prerequisiteSkillIds: ['prior'] }), skill('prior')];
    const lessons = [
      lesson('blocked-b', ['blocked'], { lessonOrderIndex: 2 }),
      lesson('unmapped-b', [], { moduleOrderIndex: 2 }),
      lesson('blocked-a', ['blocked'], { lessonOrderIndex: 1 }),
      lesson('unmapped-a', [], { moduleOrderIndex: 1 }),
    ];
    const result = computeAdaptivePath(input(skills, lessons));

    expect(result.blockedLessons.map(({ lessonId }) => lessonId)).toEqual([
      'blocked-a',
      'blocked-b',
    ]);
    expect(result.unmappedLessons.map(({ lessonId }) => lessonId)).toEqual([
      'unmapped-a',
      'unmapped-b',
    ]);
  });

  it('is independent of Skill, prerequisite, Lesson, and mapping input order', () => {
    const skills = [
      skill('target', { prerequisiteSkillIds: ['prior-b', 'prior-a'] }),
      skill('prior-a'),
      skill('prior-b'),
    ];
    const lessons = [lesson('mapped', ['target', 'prior-a']), lesson('unmapped', [])];
    const reversedSkills = [...skills].reverse().map((item) => ({
      ...item,
      prerequisiteSkillIds: [...item.prerequisiteSkillIds].reverse(),
    }));
    const reversedLessons = [...lessons]
      .reverse()
      .map((item) => ({ ...item, skillIds: [...item.skillIds].reverse() }));

    expect(computeAdaptivePath(input(reversedSkills, reversedLessons))).toEqual(
      computeAdaptivePath(input(skills, lessons)),
    );
  });

  it('does not mutate inputs and is deterministic across repeated calls', () => {
    const value = input(
      [skill('s2', { learnerState: { masteryProbability: 0.2 } }), skill('s1')],
      [lesson('l2', ['s2']), lesson('l1', ['s1'])],
    );
    const snapshot = structuredClone(value);

    const first = computeAdaptivePath(value);
    const second = computeAdaptivePath(value);

    expect(value).toEqual(snapshot);
    expect(second).toEqual(first);
  });

  it('recalculates from changed mastery without retaining state', () => {
    const curriculum = [lesson('l1', ['s1'])];
    const remedial = computeAdaptivePath(
      input([skill('s1', { learnerState: { masteryProbability: 0.2 } })], curriculum),
    );
    const ready = computeAdaptivePath(
      input([skill('s1', { learnerState: { masteryProbability: 0.9 } })], curriculum),
    );

    expect(remedial.path[0].category).toBe('REMEDIAL');
    expect(ready.path).toEqual([]);
  });
});
