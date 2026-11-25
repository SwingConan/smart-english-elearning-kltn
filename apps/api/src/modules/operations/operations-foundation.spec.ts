import type {
  BusinessRole,
  CenterDayRequest,
  CmsModerationCheck,
  ConfigChangeCheck,
  DailyProjectionCheck,
  EvidenceState,
  ExportParityCheck,
  MetricDefinition,
  Permission,
  ResourceScope,
  Revision,
  ScopedAccess,
  SourceDomain,
  SourceMetricClaim,
  SourceWave,
} from './operations.contracts';
import {
  encodeSafeCsvCell,
  projectSafeOperationsStatus,
  resolveCenterDay,
  roleProjection,
  simulateAuditRead,
  simulateCmsModeration,
  simulateConfigChange,
  simulateDailyProjection,
  simulateExportParity,
} from './operations-foundation';

type Mutable<T> = { -readonly [K in keyof T]: T[K] };
const ref = (id: string, revision = 'synthetic-1'): Revision => ({ id, revision });
const scope = (kind: ResourceScope['kind'], id: string): ResourceScope => ({ kind, id });
const day: CenterDayRequest = {
  date: '2026-11-05',
  timeZone: 'Asia/Ho_Chi_Minh',
  configurationRef: ref('synthetic-timezone-config'),
};
function access(
  permission: Permission,
  role: BusinessRole,
  target: ResourceScope,
): Mutable<ScopedAccess> {
  const actor = {
    principalId: 'principal-A',
    personId: 'person-A',
    role,
    sessionRef: ref('synthetic-session'),
    sessionState: 'AUTHENTICATED' as const,
  };
  const grant = {
    ref: ref('synthetic-' + permission),
    principalId: actor.principalId,
    permission,
    scope: target,
    state: 'ACTIVE' as const,
    validity: 'VALID' as const,
    authorityEpoch: 'synthetic-epoch',
    decisionRef: ref('synthetic-grant-decision'),
    authorityRef: ref('synthetic-authority'),
  };
  return structuredClone({ actor, selectedGrant: grant, currentGrant: grant, scope: target });
}
function cms(): Mutable<CmsModerationCheck> {
  const target = scope('CMS', 'synthetic-content');
  return structuredClone({
    access: access('cms.publish', 'ACADEMIC_MANAGER', target),
    action: 'PUBLISH',
    expectedRevision: ref('synthetic-content-revision'),
    revision: {
      ref: ref('synthetic-content-revision'),
      contentId: target.id,
      state: 'IN_REVIEW',
      parentRef: null,
      authorPersonIds: ['different-author-person'],
      authorshipComplete: true,
      assetClearance: 'APPROVED',
      licensingDecisionRef: ref('synthetic-license'),
    },
    parent: null,
    policy: {
      ref: ref('synthetic-cms-policy'),
      state: 'APPROVED',
      approvalRef: ref('synthetic-policy-approval'),
      scope: target,
      actions: ['EDIT_DRAFT', 'SUBMIT_REVIEW', 'PUBLISH', 'REJECT', 'WITHDRAW'],
    },
    reasonRef: ref('synthetic-reason'),
  });
}
function config(): Mutable<ConfigChangeCheck> {
  const target = scope('TECHNICAL', 'synthetic-config-area');
  return structuredClone({
    access: access('ops.config.change', 'SYSTEM_ADMIN', target),
    requestRef: ref('synthetic-change'),
    settingCode: 'SYNTHETIC_SETTING',
    policy: {
      ref: ref('synthetic-config-policy'),
      state: 'APPROVED',
      approvalRef: ref('synthetic-approval'),
      scope: target,
      allowedSettingCodes: ['SYNTHETIC_SETTING'],
    },
    sensitivity: 'ORDINARY',
    sensitiveApproval: null,
  });
}
const roles: readonly [BusinessRole, ResourceScope['kind'], SourceDomain, SourceWave][] = [
  ['STUDENT', 'LEARNER', 'LEARNING', 'W03'],
  ['INSTRUCTOR', 'CLASS', 'TEACHING', 'W02'],
  ['COUNSELOR', 'SUPPORT_QUEUE', 'CONSULTATION', 'W05B'],
  ['ACADEMIC_MANAGER', 'CLASS', 'ACADEMIC', 'W02'],
  ['CASHIER', 'LEDGER', 'FINANCE', 'W07'],
  ['TEACHING_INSPECTOR', 'INSPECTION', 'INSPECTION', 'W08'],
  ['SYSTEM_ADMIN', 'TECHNICAL', 'SECURITY_OPS', 'W01'],
];
function daily([role, kind, domain, wave] = roles[0]): Mutable<DailyProjectionCheck> {
  const target = scope(kind, kind === 'LEARNER' ? 'principal-A' : 'synthetic-resource');
  const definition: MetricDefinition = {
    ref: ref('synthetic-metric-definition'),
    state: 'APPROVED',
    approvalRef: ref('synthetic-approval'),
    code: 'SYNTHETIC_METRIC',
    role,
    domain,
    sourceWave: wave,
    required: true,
    scope: target,
    statusPredicateRef: ref('synthetic-state-rule'),
    confirmationRuleRef: ref('synthetic-confirmation-rule'),
    effectiveTimeRuleRef: ref('synthetic-effective-time-rule'),
    expectedSourcePin: ref('synthetic-source'),
  };
  const source: SourceMetricClaim = {
    metricCode: definition.code,
    sourceRef: definition.expectedSourcePin,
    scope: target,
    domain,
    sourceWave: wave,
    effectiveAt: '2026-11-05T01:00:00Z',
    evidenceState: 'CONFIRMED',
    completeness: 'COMPLETE',
    value: 0,
    supersedesRef: null,
    provenance: 'OFFLINE_SYNTHETIC',
  };
  return structuredClone({
    access: access('report.view', role, target),
    day,
    definitions: [definition],
    sources: [source],
  });
}
function exporting(): Mutable<ExportParityCheck> {
  const target = scope('CLASS', 'synthetic-resource'),
    a = access('report.view', 'INSTRUCTOR', target),
    b = access('report.export', 'INSTRUCTOR', target);
  const view = {
    viewerPrincipalId: a.actor.principalId,
    role: a.actor.role,
    scope: target,
    day,
    manifestRef: ref('synthetic-report-manifest'),
    metricCodes: ['SYNTHETIC_METRIC', 'SYNTHETIC_SECOND'],
    statusFilters: ['CONFIRMED', 'PENDING'] as readonly EvidenceState[],
    fields: [
      { code: 'SYNTHETIC_COUNT', classification: 'PUBLIC' as const, masking: 'FULL' as const },
      { code: 'SYNTHETIC_ACTOR', classification: 'PRIVATE' as const, masking: 'MASKED' as const },
    ],
    requiredSourcesComplete: true,
  };
  return structuredClone({
    viewAccessNow: a,
    exportAccessNow: b,
    view,
    requested: { ...view, metricCodes: ['SYNTHETIC_METRIC'], statusFilters: ['PENDING'] },
    currentManifestRef: view.manifestRef,
    auditCorrelationRef: ref('synthetic-audit-intent'),
    format: 'CSV',
  });
}
const met = (r: { decision: string }) => expect(r.decision).toBe('CONDITIONS_MET_OFFLINE');
const notMet = (r: { decision: string }) => expect(r.decision).not.toBe('CONDITIONS_MET_OFFLINE');
function freeze(x: unknown) {
  if (x && typeof x === 'object') {
    Object.values(x).forEach(freeze);
    Object.freeze(x);
  }
}

describe('W10 CMS moderation consistency only (no publishing)', () => {
  it('simulates distinct HVU review/publish prerequisites without authorizing or publishing', () => {
    const r = simulateCmsModeration(cms());
    met(r);
    expect(r.runtimeAuthorized).toBe(false);
    expect(r).not.toHaveProperty('published');
  });
  it.each([
    'COUNSELOR',
    'SYSTEM_ADMIN',
    'STUDENT',
    'INSTRUCTOR',
    'CASHIER',
    'TEACHING_INSPECTOR',
  ] as const)('denies %s direct publishing despite a publish-shaped grant', (role) => {
    const x = cms();
    x.access = { ...x.access, actor: { ...x.access.actor, role } };
    expect(simulateCmsModeration(x).decision).toBe('DENIED');
  });
  it('denies same actual author even through a different account/session', () => {
    const x = cms();
    x.revision = { ...x.revision, authorPersonIds: [x.access.actor.personId] };
    expect(simulateCmsModeration(x).reason).toBe('AUTHOR_CANNOT_APPROVE');
  });
  it.each(['DRAFT', 'PUBLISHED', 'REJECTED', 'WITHDRAWN'] as const)(
    'does not publish %s state in place',
    (state) => {
      const x = cms();
      x.revision = { ...x.revision, state };
      notMet(simulateCmsModeration(x));
    },
  );
  it('requires exact revision, scoped policy, decision reason and complete authorship', () => {
    const xs = [cms(), cms(), cms(), cms(), cms()];
    xs[0].expectedRevision = ref('other');
    xs[1].policy = { ...xs[1].policy, scope: scope('CMS', 'foreign') };
    xs[2].reasonRef = null;
    xs[3].revision = { ...xs[3].revision, authorshipComplete: false };
    xs[4].revision = { ...xs[4].revision, authorPersonIds: [] };
    xs.forEach((x) => notMet(simulateCmsModeration(x)));
  });
  it.each(['UNKNOWN', 'REJECTED'] as const)('blocks %s assets', (assetClearance) => {
    const x = cms();
    x.revision = { ...x.revision, assetClearance };
    expect(simulateCmsModeration(x).reason).toBe('ASSET_CLEARANCE_UNVERIFIED');
  });
  it('blocks unlicensed assets even if the state claims approved', () => {
    const x = cms();
    x.revision = { ...x.revision, licensingDecisionRef: null };
    notMet(simulateCmsModeration(x));
  });
  it('permits scoped TV draft editing/submission only as simulation', () => {
    for (const action of ['EDIT_DRAFT', 'SUBMIT_REVIEW'] as const) {
      const x = cms();
      x.action = action;
      x.access = access('cms.draft', 'COUNSELOR', x.access.scope);
      x.revision = { ...x.revision, state: 'DRAFT' };
      met(simulateCmsModeration(x));
    }
  });
  it('requires linked new revision for editing published material; does not rewrite the old one', () => {
    const x = cms();
    x.action = 'EDIT_DRAFT';
    x.access = access('cms.draft', 'COUNSELOR', x.access.scope);
    x.parent = { ref: ref('content-history', 'v1'), contentId: x.revision.contentId };
    x.revision = {
      ...x.revision,
      state: 'DRAFT',
      ref: ref('content-history', 'v2'),
      parentRef: x.parent.ref,
    };
    x.expectedRevision = x.revision.ref;
    met(simulateCmsModeration(x));
    x.revision = { ...x.revision, ref: x.parent.ref };
    x.expectedRevision = x.revision.ref;
    expect(simulateCmsModeration(x).reason).toBe('REVISION_LINEAGE_INVALID');
  });
  it('rejects missing/foreign revision parent and stale policy', () => {
    const x = cms();
    x.revision = { ...x.revision, parentRef: ref('parent') };
    notMet(simulateCmsModeration(x));
    x.parent = { ref: ref('parent'), contentId: 'foreign' };
    notMet(simulateCmsModeration(x));
    const y = cms();
    y.policy = { ...y.policy, state: 'DRAFT' };
    notMet(simulateCmsModeration(y));
  });
  it('requires independent scoped rejection/withdrawal and preserves source state', () => {
    for (const action of ['REJECT', 'WITHDRAW'] as const) {
      const x = cms();
      x.action = action;
      x.access = access(
        action === 'REJECT' ? 'cms.review' : 'cms.publish',
        'ACADEMIC_MANAGER',
        x.access.scope,
      );
      x.revision = { ...x.revision, state: action === 'WITHDRAW' ? 'PUBLISHED' : 'IN_REVIEW' };
      const before = JSON.stringify(x);
      met(simulateCmsModeration(x));
      expect(JSON.stringify(x)).toBe(before);
    }
  });
  it('cannot expand a grant to foreign content', () => {
    const x = cms();
    x.revision = { ...x.revision, contentId: 'foreign' };
    expect(simulateCmsModeration(x).decision).toBe('DENIED');
  });
});

describe('W10 config/health/audit fail closed and value-free', () => {
  it('simulates only explicit QT allowlisted technical change', () => {
    met(simulateConfigChange(config()));
  });
  it('does not infer business configuration authority from other roles', () => {
    const x = config();
    x.access = { ...x.access, actor: { ...x.access.actor, role: 'ACADEMIC_MANAGER' } };
    notMet(simulateConfigChange(x));
  });
  it('denies non-allowlisted setting or unknown sensitivity', () => {
    const x = config();
    x.settingCode = 'SECRET_NEW_SETTING';
    notMet(simulateConfigChange(x));
    const y = config();
    y.sensitivity = 'UNKNOWN';
    notMet(simulateConfigChange(y));
  });
  it('requires separately governed sensitive approval bound to exact request/policy', () => {
    const x = config();
    x.sensitivity = 'SENSITIVE';
    notMet(simulateConfigChange(x));
    x.sensitiveApproval = {
      ref: ref('approval'),
      requestRef: x.requestRef,
      policyRef: x.policy.ref,
      authorityRuleRef: ref('synthetic-approver-rule'),
      approverPersonId: 'different-person',
    };
    met(simulateConfigChange(x));
    x.sensitiveApproval = { ...x.sensitiveApproval, requestRef: ref('stale') };
    notMet(simulateConfigChange(x));
  });
  it('denies sensitive self-approval', () => {
    const x = config();
    x.sensitivity = 'SENSITIVE';
    x.sensitiveApproval = {
      ref: ref('approval'),
      requestRef: x.requestRef,
      policyRef: x.policy.ref,
      authorityRuleRef: ref('rule'),
      approverPersonId: x.access.actor.personId,
    };
    expect(simulateConfigChange(x).reason).toBe('SELF_APPROVAL_DENIED');
  });
  it.each([
    null,
    undefined,
    {},
    'secret-token',
    {
      configured: true,
      health: 'HEALTHY',
      connected: true,
      verified: true,
      token: 'secret-token',
      error: 'secret-password',
    },
    { configured: false, password: 'secret-password' },
  ])('never manufactures healthy/connected from %p', (input) => {
    const r = projectSafeOperationsStatus(input);
    expect(r.health).toBe('UNKNOWN');
    expect(r.configuration).not.toBe('CONNECTED');
    expect(r.runtimeAuthorized).toBe(false);
    expect(JSON.stringify(r)).not.toMatch(/secret-token|secret-password/);
  });
  it('distinguishes explicitly unconfigured from unverified without echoing details', () => {
    expect(projectSafeOperationsStatus({ configured: false }).configuration).toBe('UNCONFIGURED');
    expect(projectSafeOperationsStatus({ configured: true }).configuration).toBe('UNVERIFIED');
  });
  it('does not invoke getters or leak proxy exceptions when redacting', () => {
    const getter = jest.fn(() => {
      throw Error('secret-password');
    });
    const input = Object.defineProperty({}, 'configured', { get: getter });
    expect(projectSafeOperationsStatus(input).health).toBe('UNKNOWN');
    expect(getter).not.toHaveBeenCalled();
    const proxy = new Proxy(
      {},
      {
        getOwnPropertyDescriptor() {
          throw Error('secret-password');
        },
      },
    );
    expect(projectSafeOperationsStatus(proxy).health).toBe('UNKNOWN');
  });
  it('requires scoped explicit audit.read; exposes no edit/delete operation or raw record', () => {
    const a = access('ops.audit.read', 'SYSTEM_ADMIN', scope('TECHNICAL', 'security'));
    met(simulateAuditRead(a));
    a.currentGrant = { ...a.currentGrant, permission: 'ops.config.change' };
    notMet(simulateAuditRead(a));
    expect(simulateAuditRead(a)).not.toHaveProperty('rawEvents');
  });
  it.each(['REVOKED', 'UNKNOWN'] as const)('blocks %s grants', (state) => {
    const x = config();
    x.access = { ...x.access, currentGrant: { ...x.access.currentGrant, state } };
    notMet(simulateConfigChange(x));
  });
  it.each(['INVALID', 'UNKNOWN'] as const)('blocks %s validity', (validity) => {
    const x = config();
    x.access = { ...x.access, currentGrant: { ...x.access.currentGrant, validity } };
    notMet(simulateConfigChange(x));
  });
  it('detects changed grant epoch, revision, authority or expired session', () => {
    for (const change of [
      { authorityEpoch: 'after-ABA' },
      { ref: ref('new-grant') },
      { authorityRef: ref('new-authority') },
    ]) {
      const x = config();
      x.access = { ...x.access, currentGrant: { ...x.access.currentGrant, ...change } };
      expect(simulateConfigChange(x).reason).toBe('GRANT_CHANGED');
    }
    const y = config();
    y.access = { ...y.access, actor: { ...y.access.actor, sessionState: 'EXPIRED' } };
    notMet(simulateConfigChange(y));
  });
});

describe('W10 daily report date/provenance and seven projections', () => {
  it('resolves explicit center calendar date as a half-open UTC window', () => {
    const r = resolveCenterDay(day);
    expect(r.status).toBe('RESOLVED');
    if (r.status === 'RESOLVED') {
      expect(r.window.startAt).toBe('2026-11-04T17:00:00.000Z');
      expect(r.window.endExclusive).toBe('2026-11-05T17:00:00.000Z');
    }
  });
  it.each(['2026-02-29', '2026-13-01', '2026-11-31', '2026-1-5', 'not-date'])(
    'rejects invalid date %s',
    (date) => {
      expect(resolveCenterDay({ ...day, date }).status).toBe('BLOCKED');
    },
  );
  it('accepts leap day without using a fake or system clock', () => {
    expect(resolveCenterDay({ ...day, date: '2028-02-29' }).status).toBe('RESOLVED');
  });
  it.each(['UTC', 'Asia/Bangkok', 'not-zone', ''])(
    'does not silently default unsupported timezone %s',
    (timeZone) => {
      expect(resolveCenterDay({ ...day, timeZone }).status).toBe('BLOCKED');
    },
  );
  it.each(roles)('constructs %s source projection with scoped explicit grant only', (...role) => {
    const r = simulateDailyProjection(daily(role));
    met(r.guard);
    expect(r.completeness).toBe('INCOMPLETE');
    expect(r.metrics[0].value).toBeNull();
    expect(r.metrics[0].evidenceState).toBe('UNVERIFIED');
    expect(r.runtimeAuthorized).toBe(false);
  });
  it('returns fresh role metadata and rejects legacy or unknown role', () => {
    const p = roleProjection('STUDENT')!;
    (p.domains as SourceDomain[]).push('FINANCE');
    expect(roleProjection('STUDENT')!.domains).not.toContain('FINANCE');
    expect(roleProjection('ADMIN_COORDINATOR' as BusinessRole)).toBeNull();
  });
  it('denies foreign learner and staff ownership even when a grant claims that resource', () => {
    const x = daily();
    x.access = access('report.view', 'STUDENT', scope('LEARNER', 'foreign'));
    expect(simulateDailyProjection(x).guard.reason).toBe('FOREIGN_LEARNER_DENIED');
    const y = daily(roles[5]);
    y.access = access('report.view', 'TEACHING_INSPECTOR', scope('STAFF', 'foreign'));
    expect(simulateDailyProjection(y).guard.reason).toBe('FOREIGN_STAFF_DENIED');
  });
  it.each(roles)('denies %s source rows from a different resource', (...role) => {
    const x = daily(role);
    x.sources = x.sources.map((s) => ({ ...s, scope: { ...s.scope, id: 'foreign' } }));
    expect(simulateDailyProjection(x).guard.decision).toBe('DENIED');
    expect(simulateDailyProjection(x).metrics).toEqual([]);
  });
  it('does not let QT export academic/finance/certificate metrics by role', () => {
    const x = daily(roles[6]);
    x.definitions = x.definitions.map((d) => ({ ...d, domain: 'FINANCE', sourceWave: 'W07' }));
    expect(simulateDailyProjection(x).guard.decision).toBe('DENIED');
  });
  it('requires approved metric definitions and explicit status/confirmation/effective-time rules', () => {
    for (const change of [
      { approvalRef: null },
      { statusPredicateRef: ref('') },
      { confirmationRuleRef: ref('') },
      { effectiveTimeRuleRef: ref('') },
    ]) {
      const x = daily();
      x.definitions = x.definitions.map((d) => ({ ...d, ...change }));
      notMet(simulateDailyProjection(x).guard);
    }
    const y = daily();
    y.definitions = [];
    notMet(simulateDailyProjection(y).guard);
  });
  it.each(['PENDING', 'UNAVAILABLE', 'UNKNOWN'] as const)(
    'preserves %s as null rather than confirmed zero',
    (evidenceState) => {
      const x = daily();
      x.sources = x.sources.map((s) => ({ ...s, evidenceState, value: 0 }));
      const r = simulateDailyProjection(x);
      expect(r.metrics[0].evidenceState).toBe(evidenceState);
      expect(r.metrics[0].value).toBeNull();
    },
  );
  it('does not authenticate zero, nonzero, completeness or verified flags from synthetic claims', () => {
    for (const value of [0, 17, null]) {
      const x = daily();
      x.sources = x.sources.map((s) => ({ ...s, value, verified: true }));
      const r = simulateDailyProjection(x);
      expect(r.metrics[0].evidenceState).toBe('UNVERIFIED');
      expect(r.metrics[0].value).toBeNull();
      expect(r.completeness).toBe('INCOMPLETE');
    }
  });
  it('explicitly keeps W05B consultation and W09 completion/certificate unverified', () => {
    for (const [base, domain, wave] of [
      [roles[2], 'CONSULTATION', 'W05B'],
      [roles[0], 'COMPLETION', 'W09'],
      [roles[0], 'CERTIFICATE', 'W09'],
    ] as const) {
      const x = daily(base);
      x.definitions = x.definitions.map((d) => ({ ...d, domain, sourceWave: wave }));
      x.sources = x.sources.map((s) => ({ ...s, domain, sourceWave: wave }));
      const r = simulateDailyProjection(x);
      expect(r.metrics[0].evidenceState).toBe('UNVERIFIED');
      expect(r.metrics[0].value).toBeNull();
    }
  });
  it('marks missing sources unavailable, never an empty COMPLETE success', () => {
    const x = daily();
    x.sources = [];
    const r = simulateDailyProjection(x);
    expect(r.metrics[0].reason).toBe('SOURCE_MISSING');
    expect(r.metrics[0].value).toBeNull();
    expect(r.completeness).toBe('INCOMPLETE');
  });
  it('preserves stale/ambiguous correction evidence as unknown without choosing a convenient revision', () => {
    const x = daily();
    x.sources = [
      ...x.sources,
      { ...x.sources[0], sourceRef: ref('corrected'), supersedesRef: x.sources[0].sourceRef },
    ];
    expect(simulateDailyProjection(x).metrics[0].reason).toBe('SOURCE_REVISION_AMBIGUOUS');
    const y = daily();
    y.sources = y.sources.map((s) => ({ ...s, sourceRef: ref('old') }));
    expect(simulateDailyProjection(y).metrics[0].reason).toBe('SOURCE_STALE');
  });
  it('includes start boundary and excludes the next midnight without changing test clocks', () => {
    for (const [effectiveAt, accepted] of [
      ['2026-11-04T17:00:00.000Z', true],
      ['2026-11-05T16:59:59.999Z', true],
      ['2026-11-05T17:00:00.000Z', false],
      ['2026-11-04T16:59:59.999Z', false],
      ['2026-11-05T01:00:00', false],
    ] as const) {
      const x = daily();
      x.sources = x.sources.map((s) => ({ ...s, effectiveAt }));
      expect(simulateDailyProjection(x).metrics[0].reason).toBe(
        accepted ? 'AUTHENTICATED_SOURCE_REQUIRED' : 'SOURCE_EFFECTIVE_TIME_UNRESOLVED',
      );
    }
  });
  it('denies unrequested metric rows and domain/wave mismatches', () => {
    const x = daily();
    x.sources = x.sources.map((s) => ({ ...s, metricCode: 'UNREQUESTED' }));
    expect(simulateDailyProjection(x).guard.decision).toBe('DENIED');
    const y = daily();
    y.sources = y.sources.map((s) => ({ ...s, sourceWave: 'W07' }));
    expect(simulateDailyProjection(y).guard.decision).toBe('DENIED');
  });
  it('does not normalize an invalid source 24:00 timestamp into an apparently valid report day', () => {
    const x = daily();
    x.sources = x.sources.map((s) => ({ ...s, effectiveAt: '2026-11-04T24:00:00Z' }));
    expect(simulateDailyProjection(x).metrics[0].reason).toBe('SOURCE_EFFECTIVE_TIME_UNRESOLVED');
  });
});

describe('W10 private view/export parity simulation and CSV encoding', () => {
  it('permits a narrower CSV preflight, but performs no export, audit write or runtime authorization', () => {
    const r = simulateExportParity(exporting());
    met(r.guard);
    expect(r.exportPerformed).toBe(false);
    expect(r.auditPersisted).toBe(false);
    expect(r.reportCompleteness).toBe('INCOMPLETE');
    expect(r.runtimeAuthorized).toBe(false);
  });
  it.each(['XLSX', 'PDF'] as const)('denies deferred %s format', (format) => {
    const x = exporting();
    x.format = format;
    notMet(simulateExportParity(x).guard);
  });
  it('rechecks both current view and export grants, including revocation between reads', () => {
    for (const key of ['viewAccessNow', 'exportAccessNow'] as const) {
      const x = exporting();
      x[key] = { ...x[key], currentGrant: { ...x[key].currentGrant, state: 'REVOKED' } };
      expect(simulateExportParity(x).guard.decision).toBe('DENIED');
    }
  });
  it('denies changed principal, role or foreign resource', () => {
    const xs = [exporting(), exporting(), exporting()];
    xs[0].requested = { ...xs[0].requested, viewerPrincipalId: 'foreign' };
    xs[1].requested = { ...xs[1].requested, role: 'SYSTEM_ADMIN' };
    xs[2].requested = { ...xs[2].requested, scope: scope('CLASS', 'foreign') };
    xs.forEach((x) => expect(simulateExportParity(x).guard.decision).toBe('DENIED'));
  });
  it('denies wider dates, metric filters or source-state filters', () => {
    const xs = [exporting(), exporting(), exporting()];
    xs[0].requested = { ...xs[0].requested, day: { ...day, date: '2026-11-06' } };
    xs[1].requested = { ...xs[1].requested, metricCodes: ['FOREIGN_METRIC'] };
    xs[2].requested = { ...xs[2].requested, statusFilters: ['UNAVAILABLE'] };
    xs.forEach((x) => expect(simulateExportParity(x).guard.decision).toBe('DENIED'));
  });
  it('denies source disappearance/changes after the view and requires audit intent', () => {
    const x = exporting();
    x.currentManifestRef = ref('changed-or-disappeared');
    expect(simulateExportParity(x).guard.reason).toBe('SOURCE_CHANGED_SINCE_VIEW');
    const y = exporting();
    y.auditCorrelationRef = null;
    expect(simulateExportParity(y).guard.reason).toBe('EXPORT_AUDIT_REQUIRED');
  });
  it('blocks incomplete required sources even if the export requests fewer columns', () => {
    const x = exporting();
    x.view = { ...x.view, requiredSourcesComplete: false };
    expect(simulateExportParity(x).guard.reason).toBe('REQUIRED_SOURCES_INCOMPLETE');
  });
  it('allows stricter masking/field subsets and denies less masked or extra fields', () => {
    const x = exporting();
    x.requested = { ...x.requested, fields: [{ ...x.view.fields[1], masking: 'OMITTED' }] };
    met(simulateExportParity(x).guard);
    x.requested = { ...x.requested, fields: [{ ...x.view.fields[1], masking: 'FULL' }] };
    notMet(simulateExportParity(x).guard);
    x.requested = {
      ...x.requested,
      fields: [{ code: 'EXTRA', masking: 'FULL', classification: 'PUBLIC' }],
    };
    notMet(simulateExportParity(x).guard);
  });
  it.each(['SECRET', 'UNKNOWN'] as const)(
    'never exports %s-classified fields despite view inclusion',
    (classification) => {
      const x = exporting(),
        fields = [{ code: 'PRIVATE_SETTING', masking: 'FULL' as const, classification }];
      x.view = { ...x.view, fields };
      x.requested = { ...x.requested, fields };
      expect(simulateExportParity(x).guard.decision).toBe('DENIED');
    },
  );
  it.each([
    '=1+1',
    '+SUM(A1)',
    '-1+2',
    '@SUM(A1)',
    '  =CMD()',
    '\tformula',
    '\r=1',
    '\n=1',
    '\uFEFF=1',
    '＝1+1',
    '＋1',
  ])('neutralizes CSV prefix %p', (value) => {
    const encoded = encodeSafeCsvCell(value);
    expect(encoded.startsWith("'") || encoded.startsWith('"\'')).toBe(true);
  });
  it('quotes CSV delimiters/quotes/newlines while preserving ordinary numeric zero', () => {
    expect(encodeSafeCsvCell('a,b')).toBe('"a,b"');
    expect(encodeSafeCsvCell('a"b')).toBe('"a""b"');
    expect(encodeSafeCsvCell('a\nb')).toBe('"a\nb"');
    expect(encodeSafeCsvCell(0)).toBe('0');
    expect(encodeSafeCsvCell(-3)).toBe('-3');
    expect(encodeSafeCsvCell(null)).toBe('');
  });
  it('does not coerce object secrets/functions into CSV text', () => {
    const convert = jest.fn(() => {
      throw Error('secret');
    });
    expect(encodeSafeCsvCell({ password: 'secret', toString: convert })).toBe('[REDACTED]');
    expect(convert).not.toHaveBeenCalled();
    expect(encodeSafeCsvCell(NaN)).toBe('');
  });
  it('handles empty/whitespace cells and leading binary control prefixes without disabling lint rules', () => {
    expect(encodeSafeCsvCell('')).toBe('');
    expect(encodeSafeCsvCell('   ')).toBe('   ');
    expect(encodeSafeCsvCell(String.fromCharCode(0) + '=1')).toBe(
      "'" + String.fromCharCode(0) + '=1',
    );
  });
  it('keeps all pure inputs unchanged and cannot be upgraded by a fixture server marker', () => {
    const x = exporting(),
      before = JSON.stringify(x);
    freeze(x);
    const a = simulateExportParity(x),
      b = simulateExportParity(x);
    expect(a).toEqual(b);
    expect(JSON.stringify(x)).toBe(before);
    expect(
      simulateConfigChange({ ...config(), verified: true } as ConfigChangeCheck).runtimeAuthorized,
    ).toBe(false);
  });
  it('fails closed on malformed guard inputs without leaking raw secrets', () => {
    for (const input of [null, {}, { password: 'secret-password' }]) {
      const r = simulateCmsModeration(input as unknown as CmsModerationCheck);
      notMet(r);
      expect(JSON.stringify(r)).not.toContain('secret-password');
      notMet(simulateConfigChange(input as unknown as ConfigChangeCheck));
      notMet(simulateDailyProjection(input as unknown as DailyProjectionCheck).guard);
      notMet(simulateExportParity(input as unknown as ExportParityCheck).guard);
    }
  });
});
