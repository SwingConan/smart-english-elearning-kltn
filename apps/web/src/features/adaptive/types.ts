export type AdaptivePolicySource = 'DEFAULT' | 'SAVED';

export interface AdaptivePolicy {
  courseId: string;
  remedialThreshold: number;
  progressionThreshold: number;
  source: AdaptivePolicySource;
}

export interface AdaptivePolicyInput {
  remedialThreshold: number;
  progressionThreshold: number;
}

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

export interface AdaptivePathPolicy {
  remedialThreshold: number;
  progressionThreshold: number;
  source: AdaptivePolicySource;
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

export interface StudentAdaptivePath {
  enrollmentId: string;
  courseId: string;
  policy: AdaptivePathPolicy;
  configurationStatus: AdaptiveConfigurationStatus;
  skillClassifications: AdaptiveSkillClassification[];
  path: AdaptivePathLesson[];
  blockedLessons: AdaptiveBlockedLesson[];
  unmappedLessons: AdaptiveUnmappedLesson[];
}
