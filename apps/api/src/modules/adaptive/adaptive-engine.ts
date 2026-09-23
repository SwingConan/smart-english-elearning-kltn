export type AdaptiveConfigurationStatus = 'READY' | 'PARTIALLY_MAPPED' | 'NO_MAPPED_LESSONS';

export type AdaptiveMasteryState = 'PRIOR' | 'OBSERVED';

export type AdaptiveMasteryBand = 'UNASSESSED' | 'REMEDIAL' | 'REINFORCEMENT' | 'PROGRESSION_READY';

export type AdaptivePrerequisiteStatus = 'READY' | 'BLOCKED';

export type AdaptiveLessonCategory = 'REMEDIAL' | 'REINFORCEMENT' | 'PROGRESSION';

export type AdaptiveReasonCode =
  | 'REMEDIAL_LOW_MASTERY'
  | 'REINFORCEMENT_BUILDING'
  | 'PROGRESSION_PREREQUISITES_READY'
  | 'LOCKED_PREREQUISITE';

export type AdaptiveLessonProgressStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';

export interface AdaptivePolicyInput {
  remedialThreshold: number;
  progressionThreshold: number;
}

export interface AdaptiveLearnerStateInput {
  masteryProbability: number;
  observationCount?: number;
}

export interface AdaptiveSkillInput {
  id: string;
  code: string;
  name: string;
  pInit: number;
  prerequisiteSkillIds: readonly string[];
  learnerState?: AdaptiveLearnerStateInput;
}

export interface AdaptiveLessonInput {
  id: string;
  title: string;
  moduleId: string;
  moduleTitle: string;
  moduleOrderIndex: number;
  lessonOrderIndex: number;
  skillIds: readonly string[];
  progressStatus?: AdaptiveLessonProgressStatus;
}

export interface ComputeAdaptivePathInput {
  policy: AdaptivePolicyInput;
  skills: readonly AdaptiveSkillInput[];
  lessons: readonly AdaptiveLessonInput[];
}

export interface AdaptiveUnsatisfiedPrerequisite {
  skillId: string;
  code: string;
  name: string;
  state: AdaptiveMasteryState;
  masteryProbability: number;
}

export interface AdaptiveSkillClassification {
  skillId: string;
  code: string;
  name: string;
  state: AdaptiveMasteryState;
  masteryProbability: number;
  masteryBand: AdaptiveMasteryBand;
  prerequisiteStatus: AdaptivePrerequisiteStatus;
  unsatisfiedPrerequisites: AdaptiveUnsatisfiedPrerequisite[];
}

export interface AdaptiveLessonReason {
  reasonCode: AdaptiveReasonCode;
  focusSkillId: string;
  focusSkillCode: string;
  focusSkillName: string;
  masteryProbability: number;
  threshold: number | null;
  state: AdaptiveMasteryState;
  unsatisfiedPrerequisites: AdaptiveUnsatisfiedPrerequisite[];
}

export interface AdaptiveLessonMetadata {
  lessonId: string;
  title: string;
  moduleId: string;
  moduleTitle: string;
  moduleOrderIndex: number;
  lessonOrderIndex: number;
  isCompleted: boolean;
}

export interface AdaptivePathLesson extends AdaptiveLessonMetadata {
  category: AdaptiveLessonCategory;
  isReview: boolean;
  reason: AdaptiveLessonReason;
}

export interface AdaptiveBlockedLesson extends AdaptiveLessonMetadata {
  reason: AdaptiveLessonReason;
}

export type AdaptiveUnmappedLesson = AdaptiveLessonMetadata;

export interface AdaptivePathResult {
  configurationStatus: AdaptiveConfigurationStatus;
  skillClassifications: AdaptiveSkillClassification[];
  path: AdaptivePathLesson[];
  blockedLessons: AdaptiveBlockedLesson[];
  unmappedLessons: AdaptiveUnmappedLesson[];
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function assertProbability(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${name} must be a finite probability between 0 and 1`);
  }
}

function validatePolicy(policy: AdaptivePolicyInput): void {
  assertProbability('remedialThreshold', policy.remedialThreshold);
  assertProbability('progressionThreshold', policy.progressionThreshold);

  if (policy.remedialThreshold >= policy.progressionThreshold) {
    throw new Error('remedialThreshold must be less than progressionThreshold');
  }
}

export function classifyMasteryBand(
  state: AdaptiveMasteryState,
  masteryProbability: number,
  policy: AdaptivePolicyInput,
): AdaptiveMasteryBand {
  if (state === 'PRIOR') {
    return 'UNASSESSED';
  }
  if (masteryProbability < policy.remedialThreshold) {
    return 'REMEDIAL';
  }
  if (masteryProbability < policy.progressionThreshold) {
    return 'REINFORCEMENT';
  }
  return 'PROGRESSION_READY';
}

function lessonMetadata(lesson: AdaptiveLessonInput): AdaptiveLessonMetadata {
  return {
    lessonId: lesson.id,
    title: lesson.title,
    moduleId: lesson.moduleId,
    moduleTitle: lesson.moduleTitle,
    moduleOrderIndex: lesson.moduleOrderIndex,
    lessonOrderIndex: lesson.lessonOrderIndex,
    isCompleted: lesson.progressStatus === 'COMPLETED',
  };
}

function compareCurriculum(left: AdaptiveLessonMetadata, right: AdaptiveLessonMetadata): number {
  return (
    left.moduleOrderIndex - right.moduleOrderIndex ||
    left.lessonOrderIndex - right.lessonOrderIndex ||
    compareText(left.lessonId, right.lessonId)
  );
}

function makeReason(
  reasonCode: AdaptiveReasonCode,
  focus: AdaptiveSkillClassification,
  threshold: number | null,
): AdaptiveLessonReason {
  return {
    reasonCode,
    focusSkillId: focus.skillId,
    focusSkillCode: focus.code,
    focusSkillName: focus.name,
    masteryProbability: focus.masteryProbability,
    threshold,
    state: focus.state,
    unsatisfiedPrerequisites: focus.unsatisfiedPrerequisites.map((prerequisite) => ({
      ...prerequisite,
    })),
  };
}

function lowestMasteryThenId(
  left: AdaptiveSkillClassification,
  right: AdaptiveSkillClassification,
): number {
  return (
    left.masteryProbability - right.masteryProbability || compareText(left.skillId, right.skillId)
  );
}

function categoryRank(category: AdaptiveLessonCategory): number {
  switch (category) {
    case 'REMEDIAL':
      return 0;
    case 'REINFORCEMENT':
      return 1;
    case 'PROGRESSION':
      return 2;
  }
}

function comparePath(left: AdaptivePathLesson, right: AdaptivePathLesson): number {
  const categoryDifference = categoryRank(left.category) - categoryRank(right.category);
  if (categoryDifference !== 0) {
    return categoryDifference;
  }

  if (left.category !== 'PROGRESSION' && right.category !== 'PROGRESSION') {
    const completionDifference = Number(left.isCompleted) - Number(right.isCompleted);
    if (completionDifference !== 0) {
      return completionDifference;
    }
    const masteryDifference = left.reason.masteryProbability - right.reason.masteryProbability;
    if (masteryDifference !== 0) {
      return masteryDifference;
    }
  }

  return compareCurriculum(left, right);
}

/**
 * Computes a deterministic adaptive path from plain current-state data.
 * This function performs no persistence and does not mutate its input.
 */
export function computeAdaptivePath(input: ComputeAdaptivePathInput): AdaptivePathResult {
  validatePolicy(input.policy);

  const skillById = new Map<string, AdaptiveSkillInput>();
  for (const skill of input.skills) {
    if (skillById.has(skill.id)) {
      throw new Error(`Duplicate Skill ID: ${skill.id}`);
    }
    assertProbability(`Skill ${skill.id} pInit`, skill.pInit);
    if (skill.learnerState) {
      assertProbability(
        `Skill ${skill.id} masteryProbability`,
        skill.learnerState.masteryProbability,
      );
    }
    skillById.set(skill.id, skill);
  }

  for (const skill of input.skills) {
    for (const prerequisiteSkillId of skill.prerequisiteSkillIds) {
      if (!skillById.has(prerequisiteSkillId)) {
        throw new Error(
          `Skill ${skill.id} references unknown prerequisite Skill ${prerequisiteSkillId}`,
        );
      }
    }
  }

  const baseClassifications = new Map<
    string,
    Omit<AdaptiveSkillClassification, 'prerequisiteStatus' | 'unsatisfiedPrerequisites'>
  >();
  for (const skill of input.skills) {
    const state: AdaptiveMasteryState = skill.learnerState ? 'OBSERVED' : 'PRIOR';
    const masteryProbability = skill.learnerState?.masteryProbability ?? skill.pInit;
    baseClassifications.set(skill.id, {
      skillId: skill.id,
      code: skill.code,
      name: skill.name,
      state,
      masteryProbability,
      masteryBand: classifyMasteryBand(state, masteryProbability, input.policy),
    });
  }

  const classificationById = new Map<string, AdaptiveSkillClassification>();
  for (const skill of input.skills) {
    const base = baseClassifications.get(skill.id)!;
    const unsatisfiedPrerequisites = skill.prerequisiteSkillIds
      .map((prerequisiteSkillId) => baseClassifications.get(prerequisiteSkillId)!)
      .filter(
        (prerequisite) =>
          prerequisite.state !== 'OBSERVED' ||
          prerequisite.masteryProbability < input.policy.progressionThreshold,
      )
      .map((prerequisite) => ({
        skillId: prerequisite.skillId,
        code: prerequisite.code,
        name: prerequisite.name,
        state: prerequisite.state,
        masteryProbability: prerequisite.masteryProbability,
      }))
      .sort((left, right) => compareText(left.skillId, right.skillId));

    classificationById.set(skill.id, {
      ...base,
      prerequisiteStatus: unsatisfiedPrerequisites.length === 0 ? 'READY' : 'BLOCKED',
      unsatisfiedPrerequisites,
    });
  }

  const skillClassifications = [...classificationById.values()].sort(
    (left, right) => compareText(left.code, right.code) || compareText(left.skillId, right.skillId),
  );

  const path: AdaptivePathLesson[] = [];
  const blockedLessons: AdaptiveBlockedLesson[] = [];
  const unmappedLessons: AdaptiveUnmappedLesson[] = [];
  let mappedLessonCount = 0;

  for (const lesson of input.lessons) {
    const metadata = lessonMetadata(lesson);
    if (lesson.skillIds.length === 0) {
      unmappedLessons.push(metadata);
      continue;
    }
    mappedLessonCount += 1;

    const mappedSkills = lesson.skillIds.map((skillId) => {
      const classification = classificationById.get(skillId);
      if (!classification) {
        throw new Error(`Lesson ${lesson.id} references unknown Skill ${skillId}`);
      }
      return classification;
    });

    const blockedFocus = mappedSkills
      .filter((skill) => skill.prerequisiteStatus === 'BLOCKED')
      .sort((left, right) => compareText(left.skillId, right.skillId))[0];
    if (blockedFocus) {
      blockedLessons.push({
        ...metadata,
        reason: makeReason('LOCKED_PREREQUISITE', blockedFocus, input.policy.progressionThreshold),
      });
      continue;
    }

    const remedialFocus = mappedSkills
      .filter((skill) => skill.masteryBand === 'REMEDIAL')
      .sort(lowestMasteryThenId)[0];
    const reinforcementFocus = mappedSkills
      .filter((skill) => skill.masteryBand === 'REINFORCEMENT')
      .sort(lowestMasteryThenId)[0];
    const progressionFocus = mappedSkills
      .filter((skill) => skill.masteryBand === 'UNASSESSED')
      .sort((left, right) => compareText(left.skillId, right.skillId))[0];

    let category: AdaptiveLessonCategory;
    let reason: AdaptiveLessonReason;
    if (remedialFocus) {
      category = 'REMEDIAL';
      reason = makeReason('REMEDIAL_LOW_MASTERY', remedialFocus, input.policy.remedialThreshold);
    } else if (reinforcementFocus) {
      category = 'REINFORCEMENT';
      reason = makeReason(
        'REINFORCEMENT_BUILDING',
        reinforcementFocus,
        input.policy.progressionThreshold,
      );
    } else if (progressionFocus) {
      category = 'PROGRESSION';
      reason = makeReason('PROGRESSION_PREREQUISITES_READY', progressionFocus, null);
    } else {
      continue;
    }

    if (category === 'PROGRESSION' && metadata.isCompleted) {
      continue;
    }
    path.push({
      ...metadata,
      category,
      isReview: metadata.isCompleted && (category === 'REMEDIAL' || category === 'REINFORCEMENT'),
      reason,
    });
  }

  const configurationStatus: AdaptiveConfigurationStatus =
    mappedLessonCount === 0
      ? 'NO_MAPPED_LESSONS'
      : mappedLessonCount === input.lessons.length
        ? 'READY'
        : 'PARTIALLY_MAPPED';

  return {
    configurationStatus,
    skillClassifications,
    path: path.sort(comparePath),
    blockedLessons: blockedLessons.sort(compareCurriculum),
    unmappedLessons: unmappedLessons.sort(compareCurriculum),
  };
}
