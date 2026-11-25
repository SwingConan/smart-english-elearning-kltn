import { describe, expect, it } from 'vitest';
import {
  centerToday,
  cmsStates,
  displayDay,
  operationsRoles,
  requestKey,
  sectionsFor,
  unavailableReader,
  viewModel,
} from './model';
import type { BusinessRole, OperationsOfflineSnapshot, OperationsReadRequest } from './contracts';

const request: OperationsReadRequest = {
  viewerId: 'learner-1',
  role: 'STUDENT',
  section: 'reports',
  date: '2026-11-06',
  scopeId: 'learner-1',
};
const fixture = (q = request): OperationsOfflineSnapshot => ({
  status: 'OFFLINE_TEST_ONLY',
  binding: q,
  scopes: [{ kind: 'LEARNER', id: q.scopeId, label: 'Phạm vi synthetic' }],
  cms: [],
  settings: [],
  audit: [],
  metrics: [
    {
      metricCode: 'LEARNING_COUNT',
      sourceRef: { id: 'source', revision: '1' },
      scope: { kind: 'LEARNER', id: q.scopeId },
      domain: 'LEARNING',
      sourceWave: 'W03',
      effectiveAt: '2026-11-06T10:00:00Z',
      evidenceState: 'CONFIRMED',
      completeness: 'COMPLETE',
      value: 0,
      supersedesRef: null,
      provenance: 'OFFLINE_SYNTHETIC',
    },
  ],
});

describe('W10 UI fail-closed projection', () => {
  it.each(operationsRoles)('exposes the report entry for %s without claiming grants', (role) => {
    expect(sectionsFor(role)).toContain('reports');
  });
  it.each(['ADMIN_COORDINATOR', 'UNKNOWN', '', 'student'])(
    'does not admit unsupported role %s',
    (role) => expect(sectionsFor(role)).toEqual([]),
  );
  it('keeps CMS and technical navigation separate', () => {
    expect(sectionsFor('COUNSELOR')).toEqual(['cms', 'reports']);
    expect(sectionsFor('ACADEMIC_MANAGER')).toEqual(['cms', 'reports']);
    expect(sectionsFor('SYSTEM_ADMIN')).toEqual(['settings', 'audit', 'reports']);
  });
  it('default reader performs no provider integration', async () => {
    expect(await unavailableReader.read(request)).toEqual({ status: 'UNAVAILABLE' });
  });
  it.each(['UNAVAILABLE', 'DENIED'] as const)(
    'preserves %s without rows or authority',
    (status) => {
      expect(viewModel({ status }, request)).toMatchObject({
        status,
        metrics: [],
        runtimeAuthorized: false,
        exportPerformed: false,
      });
    },
  );
  it('drops confirmed zero and returns neither runtime authorization nor performed export', () => {
    expect(viewModel(fixture(), request)).toMatchObject({
      status: 'OFFLINE_TEST_ONLY',
      metrics: [{ state: 'UNVERIFIED', value: null }],
      runtimeAuthorized: false,
      exportPerformed: false,
    });
  });
  it.each(['W05B', 'W09'] as const)(
    'never confirms unverified %s even with fixture CONFIRMED/COMPLETE',
    (sourceWave) => {
      const raw = fixture();
      expect(
        viewModel({ ...raw, metrics: [{ ...raw.metrics[0], sourceWave }] }, request).metrics[0],
      ).toMatchObject({ state: 'UNVERIFIED', value: null });
    },
  );
  it.each(['PENDING', 'UNKNOWN', 'UNAVAILABLE', 'UNVERIFIED'] as const)(
    'preserves non-confirmed %s and no numeric value',
    (evidenceState) => {
      const raw = fixture();
      expect(
        viewModel({ ...raw, metrics: [{ ...raw.metrics[0], evidenceState, value: 19 }] }, request)
          .metrics[0],
      ).toMatchObject({ state: evidenceState, value: null });
    },
  );
  it.each(['viewerId', 'role', 'section', 'date', 'scopeId'] as const)(
    'rejects mismatched snapshot binding: %s',
    (field) => {
      const raw = fixture();
      expect(
        viewModel({ ...raw, binding: { ...request, [field]: 'foreign' } }, request).status,
      ).toBe('DENIED');
    },
  );
  it('does not pool cross-class source rows', () => {
    const raw = fixture();
    expect(
      viewModel(
        { ...raw, metrics: [{ ...raw.metrics[0], scope: { kind: 'CLASS', id: 'foreign' } }] },
        request,
      ).status,
    ).toBe('DENIED');
  });
  it('rejects the wrong scope kind even when the textual id is equal', () => {
    const raw = fixture();
    expect(
      viewModel(
        { ...raw, metrics: [{ ...raw.metrics[0], scope: { kind: 'CLASS', id: request.scopeId } }] },
        request,
      ).status,
    ).toBe('DENIED');
  });
  it('denies another learner scope, even if included by a fixture reader', () => {
    const q = { ...request, scopeId: 'another' };
    expect(viewModel(fixture(q), q).status).toBe('DENIED');
  });
  it('does not expose source rows until a scope is selected', () => {
    const q = { ...request, scopeId: '' };
    expect(viewModel(fixture(q), q).status).toBe('DENIED');
  });
  it.each([
    'bad',
    '',
    '2026-11-07T00:00:00+07:00',
    '2026-11-05T16:59:59.999Z',
    '2026-11-06T17:00:00Z',
    '2026-11-06T10:00:00',
  ])('rejects wrong/ambiguous effective time %s', (effectiveAt) => {
    const raw = fixture();
    expect(
      viewModel({ ...raw, metrics: [{ ...raw.metrics[0], effectiveAt }] }, request).status,
    ).toBe('DENIED');
  });
  it.each(['2026-11-05T17:00:00Z', '2026-11-06T16:59:59.999Z'])(
    'includes half-open day boundary %s without confirming',
    (effectiveAt) => {
      const raw = fixture();
      expect(
        viewModel({ ...raw, metrics: [{ ...raw.metrics[0], effectiveAt }] }, request).metrics[0],
      ).toMatchObject({ value: null, state: 'UNVERIFIED' });
    },
  );
  it('uses UTC+7 date and exact half-open interval', () => {
    expect(centerToday(new Date('2026-11-05T17:00:00Z'))).toBe('2026-11-06');
    expect(displayDay('2026-11-06')).toMatchObject({
      status: 'RESOLVED',
      window: { startAt: '2026-11-05T17:00:00.000Z', endExclusive: '2026-11-06T17:00:00.000Z' },
    });
    expect(displayDay('2026-02-30').status).toBe('BLOCKED');
  });
  it('contains exactly the five existing CMS states', () =>
    expect(Object.keys(cmsStates)).toEqual([
      'DRAFT',
      'IN_REVIEW',
      'PUBLISHED',
      'REJECTED',
      'WITHDRAWN',
    ]));
  it('keys requests by role, principal, scope, section and date', () => {
    for (const field of ['viewerId', 'role', 'scopeId', 'section', 'date'])
      expect(requestKey({ ...request, [field]: 'changed' })).not.toBe(requestKey(request));
  });
  it('removes configuration values and cannot claim CONNECTED', () => {
    const q: OperationsReadRequest = {
      ...request,
      role: 'SYSTEM_ADMIN',
      section: 'settings',
      scopeId: 'tech',
    };
    const raw = {
      ...fixture(q),
      scopes: [{ kind: 'TECHNICAL' as const, id: 'tech', label: 'Kỹ thuật' }],
      settings: [
        {
          scopeId: 'tech',
          code: 'MAIL_PROVIDER',
          sensitivity: 'SENSITIVE' as const,
          configured: true,
          secret: 'must-not-leak',
        },
      ],
    };
    const result = viewModel(raw, q);
    expect(result.settings).toEqual([
      { scopeId: 'tech', code: 'MAIL_PROVIDER', sensitivity: 'SENSITIVE', configured: null },
    ]);
    expect(JSON.stringify(result)).not.toContain('must-not-leak');
  });
  it('does not surface audit actor or raw payload', () => {
    const q: OperationsReadRequest = {
      ...request,
      role: 'SYSTEM_ADMIN',
      section: 'audit',
      scopeId: 'tech',
    };
    const raw = {
      ...fixture(q),
      scopes: [{ kind: 'TECHNICAL' as const, id: 'tech', label: 'Kỹ thuật' }],
      audit: [
        {
          ref: { id: 'audit', revision: '1' },
          scope: { kind: 'TECHNICAL' as const, id: 'tech' },
          occurredAt: '2026-11-06T10:00:00Z',
          eventCode: 'GRANT_REVOKED',
          actorPseudonym: 'private-actor',
          fieldPolicyRef: { id: 'p', revision: '1' },
          sourceRevision: { id: 's', revision: '1' },
          payload: 'must-not-leak',
        },
      ],
    };
    const result = viewModel(raw, q);
    expect(result.audit).toHaveLength(1);
    expect(JSON.stringify(result)).not.toMatch(/private-actor|must-not-leak/);
  });
  it.each(operationsRoles.filter((r) => !['COUNSELOR', 'ACADEMIC_MANAGER'].includes(r)))(
    'denies CMS for role %s',
    (role: BusinessRole) => {
      const q = { ...request, role, section: 'cms' as const };
      expect(viewModel(fixture(q), q).status).toBe('DENIED');
    },
  );
});
