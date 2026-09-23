import { computeBktUpdate } from './bkt';

describe('computeBktUpdate', () => {
  it('computes the normal correct-response update', () => {
    const result = computeBktUpdate(0.4, 0.1, 0.2, 0.1, true);

    expect(result.evidencePosterior).toBeCloseTo(0.75, 10);
    expect(result.posteriorMastery).toBeCloseTo(0.775, 10);
  });

  it('computes the normal incorrect-response update', () => {
    const result = computeBktUpdate(0.4, 0.1, 0.2, 0.1, false);

    expect(result.evidencePosterior).toBeCloseTo(1 / 13, 10);
    expect(result.posteriorMastery).toBeCloseTo(11 / 65, 10);
  });

  it('moves evidence in the expected direction for a nondegenerate model', () => {
    const correct = computeBktUpdate(0.4, 0, 0.2, 0.1, true);
    const incorrect = computeBktUpdate(0.4, 0, 0.2, 0.1, false);

    expect(correct.evidencePosterior).toBeGreaterThan(0.4);
    expect(incorrect.evidencePosterior).toBeLessThan(0.4);
  });

  it('applies the learning transition after the evidence update', () => {
    const withoutLearning = computeBktUpdate(0.4, 0, 0.2, 0.1, true);
    const withLearning = computeBktUpdate(0.4, 0.25, 0.2, 0.1, true);

    expect(withLearning.evidencePosterior).toBeCloseTo(
      withoutLearning.evidencePosterior,
      10,
    );
    expect(withLearning.posteriorMastery).toBeCloseTo(
      withLearning.evidencePosterior +
        (1 - withLearning.evidencePosterior) * 0.25,
      10,
    );
  });

  it('is deterministic for identical inputs', () => {
    const first = computeBktUpdate(0.35, 0.12, 0.18, 0.08, true);
    const second = computeBktUpdate(0.35, 0.12, 0.18, 0.08, true);

    expect(second).toEqual(first);
  });

  it('handles prior mastery of zero', () => {
    const result = computeBktUpdate(0, 0.2, 0.25, 0.1, false);

    expect(result.evidencePosterior).toBe(0);
    expect(result.posteriorMastery).toBeCloseTo(0.2, 10);
  });

  it('handles prior mastery of one', () => {
    const result = computeBktUpdate(1, 0.2, 0.25, 0.1, true);

    expect(result.evidencePosterior).toBe(1);
    expect(result.posteriorMastery).toBe(1);
  });

  it('leaves evidence unchanged when pLearn is zero', () => {
    const result = computeBktUpdate(0.4, 0, 0.2, 0.1, true);

    expect(result.posteriorMastery).toBeCloseTo(
      result.evidencePosterior,
      10,
    );
  });

  it('transitions to full mastery when pLearn is one', () => {
    const result = computeBktUpdate(0.4, 1, 0.2, 0.1, false);

    expect(result.posteriorMastery).toBe(1);
  });

  it('handles zero guess probability', () => {
    const result = computeBktUpdate(0.4, 0.1, 0, 0.1, true);

    expect(result.evidencePosterior).toBe(1);
    expect(result.posteriorMastery).toBe(1);
  });

  it('handles zero slip probability', () => {
    const result = computeBktUpdate(0.4, 0.1, 0.2, 0, false);

    expect(result.evidencePosterior).toBe(0);
    expect(result.posteriorMastery).toBeCloseTo(0.1, 10);
  });

  it('uses the prior for a zero correct-response denominator', () => {
    const result = computeBktUpdate(0, 0.3, 0, 0, true);

    expect(result.evidencePosterior).toBe(0);
    expect(result.posteriorMastery).toBeCloseTo(0.3, 10);
  });

  it('uses the prior for a zero incorrect-response denominator', () => {
    const result = computeBktUpdate(1, 0.3, 0, 0, false);

    expect(result.evidencePosterior).toBe(1);
    expect(result.posteriorMastery).toBe(1);
  });

  it.each([
    [0, 0, 0, 0, true],
    [0, 1, 1, 1, false],
    [1, 0, 1, 1, true],
    [1, 1, 0, 0, false],
    [0.5, 0.5, 0.5, 0.5, true],
    [0.5, 0.5, 0.5, 0.5, false],
  ])(
    'keeps outputs finite and bounded for boundary case %#',
    (prior, learn, guess, slip, correct) => {
      const result = computeBktUpdate(prior, learn, guess, slip, correct);

      expect(Number.isFinite(result.evidencePosterior)).toBe(true);
      expect(Number.isFinite(result.posteriorMastery)).toBe(true);
      expect(result.evidencePosterior).toBeGreaterThanOrEqual(0);
      expect(result.evidencePosterior).toBeLessThanOrEqual(1);
      expect(result.posteriorMastery).toBeGreaterThanOrEqual(0);
      expect(result.posteriorMastery).toBeLessThanOrEqual(1);
    },
  );

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'rejects non-finite probability input %p',
    (invalid) => {
      expect(() => computeBktUpdate(invalid, 0.1, 0.2, 0.1, true)).toThrow(
        Error,
      );
    },
  );

  it.each([-0.01, 1.01])('rejects out-of-range probability input %p', (invalid) => {
    expect(() => computeBktUpdate(0.4, invalid, 0.2, 0.1, true)).toThrow(
      Error,
    );
  });

  it.each([
    [0.2, 0.1, 0.15, 0.05],
    [0.5, 0.2, 0.2, 0.1],
    [0.8, 0.3, 0.1, 0.2],
  ])(
    'satisfies BKT sanity properties for prior=%p, learn=%p, guess=%p, slip=%p',
    (prior, learn, guess, slip) => {
      const correct = computeBktUpdate(prior, learn, guess, slip, true);
      const incorrect = computeBktUpdate(prior, learn, guess, slip, false);
      const noLearning = computeBktUpdate(prior, 0, guess, slip, true);

      expect(correct.evidencePosterior).toBeGreaterThanOrEqual(
        incorrect.evidencePosterior,
      );
      expect(correct.posteriorMastery).toBeGreaterThanOrEqual(
        correct.evidencePosterior,
      );
      expect(incorrect.posteriorMastery).toBeGreaterThanOrEqual(
        incorrect.evidencePosterior,
      );
      expect(noLearning.posteriorMastery).toBeCloseTo(
        noLearning.evidencePosterior,
        10,
      );
    },
  );
});
