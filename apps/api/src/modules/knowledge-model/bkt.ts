/** Numeric tolerance used to guard degenerate Bayesian denominators. */
export const BKT_EPSILON = 1e-10;

export interface BktUpdate {
  evidencePosterior: number;
  posteriorMastery: number;
}

function assertProbability(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${name} must be a finite probability between 0 and 1`);
  }
}

function clampProbability(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * Applies one binary Bayesian Knowledge Tracing update.
 *
 * The observed correct/incorrect evidence first updates mastery with Bayes'
 * rule, then the learning transition is applied. This model has no forgetting.
 * A near-zero evidence denominator falls back to the prior before transition
 * so degenerate, but valid, probability inputs remain finite and deterministic.
 */
export function computeBktUpdate(
  priorMastery: number,
  pLearn: number,
  pGuess: number,
  pSlip: number,
  isCorrect: boolean,
): BktUpdate {
  assertProbability('priorMastery', priorMastery);
  assertProbability('pLearn', pLearn);
  assertProbability('pGuess', pGuess);
  assertProbability('pSlip', pSlip);

  const numerator = isCorrect
    ? priorMastery * (1 - pSlip)
    : priorMastery * pSlip;
  const denominator = isCorrect
    ? numerator + (1 - priorMastery) * pGuess
    : numerator + (1 - priorMastery) * (1 - pGuess);

  const evidencePosterior = clampProbability(
    Math.abs(denominator) < BKT_EPSILON
      ? priorMastery
      : numerator / denominator,
  );
  const posteriorMastery = clampProbability(
    evidencePosterior + (1 - evidencePosterior) * pLearn,
  );

  return { evidencePosterior, posteriorMastery };
}
