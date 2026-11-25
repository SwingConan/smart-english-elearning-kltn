import { describe, it, expect } from 'vitest';
import {
  fixtureDate,
  fixtureScope,
  qaRoles,
  readerFor,
  scenarios,
  snapshot,
  watermark,
} from './fixtures';
import { viewModel } from '../model';
import type { OperationsReadRequest } from '../contracts';
describe('W10 S5B isolated deterministic fixtures', () => {
  it('labels all QA output and includes seven report roles', () => {
    expect(watermark).toBe('SYNTHETIC DATA — VISUAL QA ONLY');
    for (const role of qaRoles)
      expect(
        scenarios.some((s) => s.role === role && s.section === 'reports' && s.state === 'normal'),
      ).toBe(true);
  });
  it.each(
    scenarios.filter((s) => !['loading', 'error', 'unavailable', 'denied'].includes(s.state)),
  )('%s is deterministic and accepted only as offline data', (s) => {
    const q: OperationsReadRequest = {
      viewerId: 'synthetic-viewer',
      role: s.role,
      section: s.section,
      date: fixtureDate,
      scopeId: fixtureScope(s.role),
    };
    expect(snapshot(q, s.state)).toEqual(snapshot(q, s.state));
    const model = viewModel(snapshot(q, s.state), q);
    expect(model.status).toBe('OFFLINE_TEST_ONLY');
    expect(model.runtimeAuthorized).toBe(false);
    expect(model.exportPerformed).toBe(false);
    expect(model.metrics.every((m) => m.value === null && String(m.state) !== 'CONFIRMED')).toBe(
      true,
    );
  });
  it('covers all CMS states without claiming real decisions', () => {
    const q: OperationsReadRequest = {
      viewerId: 'synthetic-viewer',
      role: 'ACADEMIC_MANAGER',
      section: 'cms',
      date: fixtureDate,
      scopeId: fixtureScope('ACADEMIC_MANAGER'),
    };
    expect(snapshot(q, 'normal').cms.map((c) => c.state)).toEqual([
      'DRAFT',
      'IN_REVIEW',
      'PUBLISHED',
      'REJECTED',
      'WITHDRAWN',
    ]);
  });
  it('does not turn synthetic zero into an operational confirmed metric', () => {
    const q: OperationsReadRequest = {
      viewerId: 'synthetic-viewer',
      role: 'STUDENT',
      section: 'reports',
      date: fixtureDate,
      scopeId: fixtureScope('STUDENT'),
    };
    expect(snapshot(q, 'zero').metrics[0].value).toBe(0);
    expect(viewModel(snapshot(q, 'zero'), q).metrics[0]).toMatchObject({
      value: null,
      state: 'UNVERIFIED',
    });
  });
  it('keeps denied/unavailable/error explicit', async () => {
    const q: OperationsReadRequest = {
      viewerId: 'synthetic-viewer',
      role: 'STUDENT',
      section: 'reports',
      date: fixtureDate,
      scopeId: fixtureScope('STUDENT'),
    };
    for (const state of ['unavailable', 'denied'] as const)
      expect(await readerFor({ ...scenarios[0], state }).read(q)).toEqual({
        status: state.toUpperCase(),
      });
    await expect(readerFor({ ...scenarios[0], state: 'error' }).read(q)).rejects.toThrow(
      'Synthetic unavailable',
    );
  });
});
