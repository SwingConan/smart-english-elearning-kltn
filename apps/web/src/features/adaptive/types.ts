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
