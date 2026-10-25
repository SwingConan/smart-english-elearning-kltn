import { describe, expect, it } from 'vitest';
import { deriveSkillInsights } from './learning-report-insights';

describe('deriveSkillInsights', () => {
  it('derives strongest, weakest and comparable changes from FINAL data only', () => {
    const result = deriveSkillInsights([
      {
        attemptId: 'l1',
        submittedAt: '2026-10-01T00:00:00Z',
        skill: 'LISTENING',
        normalizedScore: 70,
        status: 'FINAL',
        source: 'OBJECTIVE_AUTO',
      },
      {
        attemptId: 'l2',
        submittedAt: '2026-10-10T00:00:00Z',
        skill: 'LISTENING',
        normalizedScore: 82,
        status: 'FINAL',
        source: 'OBJECTIVE_AUTO',
      },
      {
        attemptId: 'r1',
        submittedAt: '2026-10-02T00:00:00Z',
        skill: 'READING',
        normalizedScore: 78,
        status: 'FINAL',
        source: 'OBJECTIVE_AUTO',
      },
      {
        attemptId: 'r2',
        submittedAt: '2026-10-11T00:00:00Z',
        skill: 'READING',
        normalizedScore: 74,
        status: 'FINAL',
        source: 'OBJECTIVE_AUTO',
      },
      {
        attemptId: 's1',
        submittedAt: '2026-10-12T00:00:00Z',
        skill: 'SPEAKING',
        normalizedScore: null,
        status: 'PROVISIONAL',
        source: 'AI_ESTIMATE',
      },
    ]);

    expect(result.strongest).toMatchObject({ skill: 'LISTENING', score: 82, delta: 12 });
    expect(result.weakest).toMatchObject({ skill: 'READING', score: 74, delta: -4 });
    expect(result.improving?.skill).toBe('LISTENING');
    expect(result.declining?.skill).toBe('READING');
    expect(result.latestChange?.skill).toBe('READING');
    expect(result.current.find((item) => item.skill === 'SPEAKING')).toBeUndefined();
  });

  it('does not coerce a missing score to zero', () => {
    const result = deriveSkillInsights([
      {
        attemptId: 'w1',
        submittedAt: null,
        skill: 'WRITING',
        normalizedScore: null,
        status: 'PROVISIONAL',
        source: 'AI_ESTIMATE',
      },
    ]);

    expect(result.current).toEqual([]);
    expect(result.strongest).toBeNull();
    expect(result.weakest).toBeNull();
  });
});
