import type {
  ApprovedPolicy,
  BusinessRole,
  CenterDayRequest,
  CmsModerationCheck,
  ConfigChangeCheck,
  DailyProjection,
  DailyProjectionCheck,
  DayResolution,
  EvidenceState,
  ExportParityCheck,
  ExportPreflight,
  GuardResult,
  Masking,
  MetricDefinition,
  Permission,
  ProjectedMetric,
  ResourceScope,
  Revision,
  RoleProjectionContract,
  SafeOperationsStatus,
  ScopedAccess,
  SourceDomain,
  SourceWave,
} from './operations.contracts';

const assurance = {
  assurance: 'OFFLINE_CONSISTENCY_ONLY',
  runtimeAuthorized: false,
  requiresServerVerification: true,
} as const;
const text = (x: unknown): x is string => typeof x === 'string' && !!x.trim();
const code = (x: unknown): x is string => typeof x === 'string' && /^[A-Z][A-Z0-9_]{0,63}$/.test(x);
const ref = (x: Revision | null | undefined): x is Revision =>
  !!x && text(x.id) && text(x.revision);
const sameRef = (a: Revision | null | undefined, b: Revision | null | undefined) =>
  ref(a) && ref(b) && a.id === b.id && a.revision === b.revision;
const sameScope = (a: ResourceScope, b: ResourceScope) =>
  !!a &&
  !!b &&
  text(a.id) &&
  a.id === b.id &&
  a.kind === b.kind &&
  [
    'LEARNER',
    'CLASS',
    'PROGRAM',
    'SUPPORT_QUEUE',
    'LEDGER',
    'INSPECTION',
    'STAFF',
    'TECHNICAL',
    'CMS',
  ].includes(a.kind);
const approved = (p: ApprovedPolicy) =>
  !!p && p.state === 'APPROVED' && ref(p.ref) && ref(p.approvalRef);
const unique = (xs: readonly string[]) =>
  Array.isArray(xs) && xs.length > 0 && xs.every(text) && new Set(xs).size === xs.length;

function sourceInstant(value: string): number {
  if (
    !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(
      value,
    )
  )
    return NaN;
  const date = value.slice(0, 10),
    localDate = Date.parse(date + 'T00:00:00Z');
  if (!Number.isFinite(localDate) || new Date(localDate).toISOString().slice(0, 10) !== date)
    return NaN;
  return Date.parse(value);
}

class Rejected extends Error {
  constructor(
    readonly decision: 'BLOCKED' | 'DENIED',
    readonly reason: string,
  ) {
    super(reason);
  }
}
function check(
  ok: unknown,
  reason: string,
  decision: Rejected['decision'] = 'BLOCKED',
): asserts ok {
  if (!ok) throw new Rejected(decision, reason);
}
const guard = (decision: GuardResult['decision'], reason: string): GuardResult => ({
  ...assurance,
  decision,
  reason,
});
function simulate(f: () => void): GuardResult {
  try {
    f();
    return guard('CONDITIONS_MET_OFFLINE', 'OFFLINE_PRECONDITIONS_ONLY');
  } catch (e) {
    return e instanceof Rejected
      ? guard(e.decision, e.reason)
      : guard('BLOCKED', 'MALFORMED_INPUT');
  }
}
function access(a: ScopedAccess, permission: Permission, roles: readonly BusinessRole[]) {
  check(
    a && a.actor && text(a.actor.principalId) && text(a.actor.personId) && ref(a.actor.sessionRef),
    'IDENTITY_UNVERIFIED',
  );
  check(roles.includes(a.actor.role), 'ROLE_DENIED', 'DENIED');
  check(a.actor.sessionState === 'AUTHENTICATED', 'SESSION_INVALID', 'DENIED');
  for (const g of [a.selectedGrant, a.currentGrant]) {
    check(
      g &&
        g.principalId === a.actor.principalId &&
        g.permission === permission &&
        sameScope(g.scope, a.scope),
      'GRANT_SCOPE_OR_PERMISSION_DENIED',
      'DENIED',
    );
    check(g.state !== 'REVOKED' && g.validity !== 'INVALID', 'GRANT_REVOKED', 'DENIED');
    check(
      g.state === 'ACTIVE' &&
        g.validity === 'VALID' &&
        ref(g.ref) &&
        ref(g.decisionRef) &&
        ref(g.authorityRef) &&
        text(g.authorityEpoch),
      'GRANT_UNVERIFIED',
    );
  }
  check(
    sameRef(a.selectedGrant.ref, a.currentGrant.ref) &&
      sameRef(a.selectedGrant.decisionRef, a.currentGrant.decisionRef) &&
      sameRef(a.selectedGrant.authorityRef, a.currentGrant.authorityRef) &&
      a.selectedGrant.authorityEpoch === a.currentGrant.authorityEpoch,
    'GRANT_CHANGED',
  );
}

/** No transition, publication, revision write or public content projection. */
export function simulateCmsModeration(input: CmsModerationCheck): GuardResult {
  return simulate(() => {
    const drafting = ['EDIT_DRAFT', 'SUBMIT_REVIEW'].includes(input.action);
    check(
      ['EDIT_DRAFT', 'SUBMIT_REVIEW', 'PUBLISH', 'REJECT', 'WITHDRAW'].includes(input.action),
      'ACTION_UNSUPPORTED',
    );
    access(
      input.access,
      drafting ? 'cms.draft' : input.action === 'REJECT' ? 'cms.review' : 'cms.publish',
      drafting ? ['COUNSELOR'] : ['ACADEMIC_MANAGER'],
    );
    const r = input.revision;
    check(
      input.access.scope.kind === 'CMS' && input.access.scope.id === r.contentId,
      'CONTENT_SCOPE_DENIED',
      'DENIED',
    );
    check(
      approved(input.policy) &&
        sameScope(input.policy.scope, input.access.scope) &&
        input.policy.actions.includes(input.action),
      'CMS_POLICY_UNRESOLVED',
    );
    check(sameRef(r.ref, input.expectedRevision), 'REVISION_STALE');
    check(r.authorshipComplete === true && unique(r.authorPersonIds), 'AUTHORSHIP_UNVERIFIED');
    if (r.parentRef)
      check(
        input.parent &&
          sameRef(r.parentRef, input.parent.ref) &&
          input.parent.contentId === r.contentId &&
          !sameRef(r.ref, r.parentRef),
        'REVISION_LINEAGE_INVALID',
      );
    else check(input.parent === null, 'REVISION_LINEAGE_INVALID');
    const state = drafting ? 'DRAFT' : input.action === 'WITHDRAW' ? 'PUBLISHED' : 'IN_REVIEW';
    check(r.state === state, 'STATE_TRANSITION_DENIED', 'DENIED');
    if (!drafting) {
      check(
        !r.authorPersonIds.includes(input.access.actor.personId),
        'AUTHOR_CANNOT_APPROVE',
        'DENIED',
      );
      check(ref(input.reasonRef), 'DECISION_REASON_REQUIRED');
    }
    if (input.action === 'PUBLISH')
      check(
        r.assetClearance === 'APPROVED' && ref(r.licensingDecisionRef),
        'ASSET_CLEARANCE_UNVERIFIED',
      );
  });
}

export function simulateConfigChange(input: ConfigChangeCheck): GuardResult {
  return simulate(() => {
    access(input.access, 'ops.config.change', ['SYSTEM_ADMIN']);
    check(
      input.access.scope.kind === 'TECHNICAL' &&
        approved(input.policy) &&
        sameScope(input.policy.scope, input.access.scope),
      'CONFIG_POLICY_UNRESOLVED',
    );
    check(
      code(input.settingCode) && input.policy.allowedSettingCodes.includes(input.settingCode),
      'SETTING_NOT_ALLOWLISTED',
      'DENIED',
    );
    check(ref(input.requestRef), 'REQUEST_REVISION_REQUIRED');
    check(
      input.sensitivity === 'ORDINARY' || input.sensitivity === 'SENSITIVE',
      'SENSITIVITY_UNKNOWN',
    );
    if (input.sensitivity === 'SENSITIVE') {
      const a = input.sensitiveApproval;
      check(
        a &&
          ref(a.ref) &&
          ref(a.authorityRuleRef) &&
          sameRef(a.requestRef, input.requestRef) &&
          sameRef(a.policyRef, input.policy.ref),
        'SENSITIVE_APPROVAL_UNRESOLVED',
      );
      check(
        text(a.approverPersonId) && a.approverPersonId !== input.access.actor.personId,
        'SELF_APPROVAL_DENIED',
        'DENIED',
      );
    }
  });
}

/** No raw config/message/URL/error fields survive. Synthetic/verified:true flags
 * cannot authenticate an observation. Even fake successful probes stay UNKNOWN.
 */
export function projectSafeOperationsStatus(input: unknown): SafeOperationsStatus {
  let configured: unknown;
  try {
    if (input && typeof input === 'object') {
      const d = Object.getOwnPropertyDescriptor(input, 'configured');
      if (d && 'value' in d) configured = d.value;
    }
  } catch {
    configured = undefined;
  }
  return {
    ...assurance,
    configuration: configured === false ? 'UNCONFIGURED' : 'UNVERIFIED',
    health: 'UNKNOWN',
    reason: 'NO_AUTHENTICATED_OBSERVATION',
  };
}

export function simulateAuditRead(a: ScopedAccess): GuardResult {
  return simulate(() => {
    access(a, 'ops.audit.read', ['SYSTEM_ADMIN']);
    check(a.scope.kind === 'TECHNICAL', 'AUDIT_SCOPE_DENIED', 'DENIED');
  });
}

const projections: readonly RoleProjectionContract[] = [
  {
    role: 'STUDENT',
    domains: ['LEARNING', 'PUBLISHED_OUTCOME', 'COMPLETION', 'CERTIFICATE'],
    scopeKinds: ['LEARNER'],
  },
  {
    role: 'INSTRUCTOR',
    domains: ['TEACHING', 'PUBLISHED_OUTCOME', 'CLASS_ATTENDANCE'],
    scopeKinds: ['CLASS'],
  },
  { role: 'COUNSELOR', domains: ['SUPPORT', 'CONSULTATION'], scopeKinds: ['SUPPORT_QUEUE'] },
  {
    role: 'ACADEMIC_MANAGER',
    domains: ['ACADEMIC', 'TEACHING', 'CLASS_ATTENDANCE', 'COMPLETION', 'CERTIFICATE'],
    scopeKinds: ['CLASS', 'PROGRAM'],
  },
  { role: 'CASHIER', domains: ['FINANCE'], scopeKinds: ['LEDGER'] },
  {
    role: 'TEACHING_INSPECTOR',
    domains: ['INSPECTION', 'STAFF_SHIFT'],
    scopeKinds: ['INSPECTION', 'STAFF'],
  },
  { role: 'SYSTEM_ADMIN', domains: ['ACCOUNTS', 'SECURITY_OPS'], scopeKinds: ['TECHNICAL'] },
];
/** Return fresh copies; consumers cannot mutate shared role definitions. */
export function roleProjection(role: BusinessRole): RoleProjectionContract | null {
  const p = projections.find((p) => p.role === role);
  return p ? { role: p.role, domains: [...p.domains], scopeKinds: [...p.scopeKinds] } : null;
}

/** Explicit configured target timezone only; no implicit system clock/default or
 * guessed alternate/DST policy. Verify each midnight with Intl, including end day.
 */
export function resolveCenterDay(input: CenterDayRequest): DayResolution {
  try {
    if (input.timeZone !== 'Asia/Ho_Chi_Minh' || !ref(input.configurationRef))
      return { status: 'BLOCKED', reason: 'TIMEZONE_UNSUPPORTED_OR_UNCONFIGURED' };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date))
      return { status: 'BLOCKED', reason: 'DATE_INVALID' };
    const midnight = Date.parse(input.date + 'T00:00:00Z');
    if (!Number.isFinite(midnight) || new Date(midnight).toISOString().slice(0, 10) !== input.date)
      return { status: 'BLOCKED', reason: 'DATE_INVALID' };
    const start = midnight - 7 * 3600000,
      end = start + 86400000;
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: input.timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    for (const [stamp, expected] of [
      [start, input.date],
      [end, new Date(midnight + 86400000).toISOString().slice(0, 10)],
    ] as const) {
      const parts = fmt.formatToParts(new Date(stamp));
      const part = (name: string) => parts.find((p) => p.type === name)?.value;
      if (
        [part('year'), part('month'), part('day')].join('-') !== expected ||
        part('hour') !== '00' ||
        part('minute') !== '00' ||
        part('second') !== '00'
      )
        return { status: 'BLOCKED', reason: 'TIMEZONE_UNSUPPORTED_OR_UNCONFIGURED' };
    }
    return {
      status: 'RESOLVED',
      window: {
        ...assurance,
        date: input.date,
        timeZone: input.timeZone,
        startAt: new Date(start).toISOString(),
        endExclusive: new Date(end).toISOString(),
        configurationRef: { ...input.configurationRef },
      },
    };
  } catch {
    return { status: 'BLOCKED', reason: 'DATE_INVALID' };
  }
}

function reportAccess(a: ScopedAccess, permission: 'report.view' | 'report.export') {
  const p = roleProjection(a.actor.role);
  check(p, 'ROLE_DENIED', 'DENIED');
  access(a, permission, [p.role]);
  check(p.scopeKinds.includes(a.scope.kind), 'ROLE_RESOURCE_SCOPE_DENIED', 'DENIED');
  if (a.actor.role === 'STUDENT')
    check(a.scope.id === a.actor.principalId, 'FOREIGN_LEARNER_DENIED', 'DENIED');
  if (a.scope.kind === 'STAFF')
    check(a.scope.id === a.actor.personId, 'FOREIGN_STAFF_DENIED', 'DENIED');
  return p;
}
const domainWaves: Readonly<Record<SourceDomain, readonly SourceWave[]>> = {
  LEARNING: ['W03'],
  PUBLISHED_OUTCOME: ['W03', 'W04'],
  TEACHING: ['W02', 'W06'],
  CLASS_ATTENDANCE: ['W06'],
  SUPPORT: ['W05A'],
  CONSULTATION: ['W05B'],
  ACADEMIC: ['W02', 'W03', 'W04', 'W06', 'W07'],
  FINANCE: ['W07'],
  INSPECTION: ['W08'],
  STAFF_SHIFT: ['W08'],
  ACCOUNTS: ['W01'],
  SECURITY_OPS: ['W01'],
  COMPLETION: ['W09'],
  CERTIFICATE: ['W09'],
};
function metricDefinition(
  d: MetricDefinition,
  input: DailyProjectionCheck,
  p: RoleProjectionContract,
) {
  check(
    approved(d) &&
      code(d.code) &&
      typeof d.required === 'boolean' &&
      ref(d.statusPredicateRef) &&
      ref(d.confirmationRuleRef) &&
      ref(d.effectiveTimeRuleRef) &&
      ref(d.expectedSourcePin),
    'METRIC_POLICY_UNRESOLVED',
  );
  check(
    d.role === p.role &&
      p.domains.includes(d.domain) &&
      sameScope(d.scope, input.access.scope) &&
      domainWaves[d.domain]?.includes(d.sourceWave),
    'METRIC_SCOPE_DENIED',
    'DENIED',
  );
}

/** No actual count/amount is confirmed from fixture claims; unavailable != zero. */
export function simulateDailyProjection(input: DailyProjectionCheck): DailyProjection {
  let metrics: ProjectedMetric[] = [],
    window: DailyProjection['window'] = null,
    role: BusinessRole | null = null;
  const g = simulate(() => {
    const p = reportAccess(input.access, 'report.view');
    role = p.role;
    const day = resolveCenterDay(input.day);
    check(day.status === 'RESOLVED', day.status === 'BLOCKED' ? day.reason : 'DATE_INVALID');
    window = day.window;
    check(
      Array.isArray(input.definitions) &&
        input.definitions.length > 0 &&
        unique(input.definitions.map((d) => d.code)),
      'METRIC_POLICY_UNRESOLVED',
    );
    check(Array.isArray(input.sources), 'SOURCE_READ_UNAVAILABLE');
    input.definitions.forEach((d) => metricDefinition(d, input, p));
    check(
      input.sources.every((s) => input.definitions.some((d) => d.code === s.metricCode)),
      'UNREQUESTED_SOURCE_DENIED',
      'DENIED',
    );
    metrics = input.definitions.map((d) => {
      const found = input.sources.filter((s) => s.metricCode === d.code);
      const empty = (
        state: ProjectedMetric['evidenceState'],
        reason: string,
        pin: Revision | null = null,
      ): ProjectedMetric => ({
        code: d.code,
        sourcePin: pin ? { ...pin } : null,
        evidenceState: state,
        value: null,
        completeness: 'UNKNOWN',
        reason,
      });
      if (found.length === 0) return empty('UNAVAILABLE', 'SOURCE_MISSING');
      if (found.length !== 1) return empty('UNKNOWN', 'SOURCE_REVISION_AMBIGUOUS');
      const s = found[0];
      check(
        sameScope(s.scope, input.access.scope) &&
          s.domain === d.domain &&
          s.sourceWave === d.sourceWave,
        'SOURCE_SCOPE_DENIED',
        'DENIED',
      );
      if (!sameRef(s.sourceRef, d.expectedSourcePin)) return empty('UNKNOWN', 'SOURCE_STALE');
      const stamp = sourceInstant(s.effectiveAt);
      if (
        !/(Z|[+-]\d{2}:\d{2})$/.test(s.effectiveAt) ||
        !Number.isFinite(stamp) ||
        stamp < Date.parse(day.window.startAt) ||
        stamp >= Date.parse(day.window.endExclusive)
      )
        return empty('UNKNOWN', 'SOURCE_EFFECTIVE_TIME_UNRESOLVED');
      if (s.supersedesRef && (!ref(s.supersedesRef) || sameRef(s.supersedesRef, s.sourceRef)))
        return empty('UNKNOWN', 'CORRECTION_LINEAGE_UNRESOLVED');
      if (s.provenance !== 'OFFLINE_SYNTHETIC' && s.provenance !== 'UNVERIFIED')
        return empty('UNKNOWN', 'UNSUPPORTED_PROVENANCE_CLAIM');
      if (
        s.evidenceState === 'PENDING' ||
        s.evidenceState === 'UNAVAILABLE' ||
        s.evidenceState === 'UNKNOWN'
      )
        return empty(s.evidenceState, 'SOURCE_NOT_CONFIRMED', s.sourceRef);
      if (s.evidenceState !== 'CONFIRMED' && s.evidenceState !== 'UNVERIFIED')
        return empty('UNKNOWN', 'EVIDENCE_STATE_INVALID');
      return empty('UNVERIFIED', 'AUTHENTICATED_SOURCE_REQUIRED', s.sourceRef);
    });
  });
  return {
    ...assurance,
    guard: g,
    role: g.decision === 'CONDITIONS_MET_OFFLINE' ? role : null,
    window: g.decision === 'CONDITIONS_MET_OFFLINE' ? window : null,
    metrics: g.decision === 'CONDITIONS_MET_OFFLINE' ? metrics : [],
    completeness: 'INCOMPLETE',
  };
}

const rank: Readonly<Record<Masking, number>> = { FULL: 0, MASKED: 1, OMITTED: 2 };
const subset = (a: readonly string[], b: readonly string[]) =>
  unique(a) && unique(b) && a.every((x) => b.includes(x));
const sameDay = (a: CenterDayRequest, b: CenterDayRequest) =>
  a.date === b.date && a.timeZone === b.timeZone && sameRef(a.configurationRef, b.configurationRef);
const evidenceStates: readonly EvidenceState[] = [
  'CONFIRMED',
  'PENDING',
  'UNVERIFIED',
  'UNAVAILABLE',
  'UNKNOWN',
];
export function simulateExportParity(input: ExportParityCheck): ExportPreflight {
  const g = simulate(() => {
    check(input.format === 'CSV', 'FORMAT_NOT_APPROVED', 'DENIED');
    reportAccess(input.viewAccessNow, 'report.view');
    reportAccess(input.exportAccessNow, 'report.export');
    const v = input.view,
      r = input.requested,
      va = input.viewAccessNow,
      ea = input.exportAccessNow;
    check(
      va.actor.principalId === ea.actor.principalId &&
        va.actor.personId === ea.actor.personId &&
        sameRef(va.actor.sessionRef, ea.actor.sessionRef) &&
        v.viewerPrincipalId === va.actor.principalId &&
        r.viewerPrincipalId === v.viewerPrincipalId &&
        v.role === va.actor.role &&
        r.role === v.role &&
        ea.actor.role === v.role,
      'VIEWER_CHANGED',
      'DENIED',
    );
    check(
      sameScope(v.scope, va.scope) && sameScope(v.scope, ea.scope) && sameScope(v.scope, r.scope),
      'EXPORT_SCOPE_WIDENED',
      'DENIED',
    );
    check(
      resolveCenterDay(v.day).status === 'RESOLVED' && sameDay(v.day, r.day),
      'EXPORT_DATE_WIDENED',
      'DENIED',
    );
    check(
      sameRef(v.manifestRef, input.currentManifestRef) &&
        sameRef(r.manifestRef, input.currentManifestRef),
      'SOURCE_CHANGED_SINCE_VIEW',
    );
    check(
      subset(r.metricCodes, v.metricCodes) &&
        r.metricCodes.every(code) &&
        subset(r.statusFilters, v.statusFilters) &&
        r.statusFilters.every((s) => evidenceStates.includes(s)),
      'EXPORT_FILTER_WIDENED',
      'DENIED',
    );
    check(
      unique(v.fields.map((f) => f.code)) && unique(r.fields.map((f) => f.code)),
      'FIELD_POLICY_UNRESOLVED',
    );
    for (const field of r.fields) {
      const original = v.fields.find((f) => f.code === field.code);
      check(
        original &&
          code(field.code) &&
          (field.classification === 'PUBLIC' || field.classification === 'PRIVATE') &&
          field.classification === original.classification &&
          Object.hasOwn(rank, field.masking) &&
          Object.hasOwn(rank, original.masking) &&
          rank[field.masking] >= rank[original.masking],
        'EXPORT_FIELD_OR_MASK_WIDENED',
        'DENIED',
      );
    }
    check(v.requiredSourcesComplete === true, 'REQUIRED_SOURCES_INCOMPLETE');
    check(ref(input.auditCorrelationRef), 'EXPORT_AUDIT_REQUIRED');
  });
  return {
    ...assurance,
    guard: g,
    exportPerformed: false,
    auditRequired: true,
    auditPersisted: false,
    reportCompleteness: 'INCOMPLETE',
  };
}

/** Only already allowlisted, masked, non-secret cells may reach a future serializer.
 * This is encoding, NOT authorization/redaction, and performs no export/download.
 */
export function encodeSafeCsvCell(value: unknown): string {
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  if (value === null || value === undefined) return '';
  if (typeof value !== 'string') return '[REDACTED]';
  let first = 0;
  while (
    first < value.length &&
    (value.charCodeAt(first) <= 31 || value.charCodeAt(first) === 127 || /\s/.test(value[first]))
  )
    first++;
  const formula =
    (first < value.length && '=+-@＝＋－＠'.includes(value[first])) ||
    [9, 10, 13].includes(value.charCodeAt(0));
  const safe = formula ? "'" + value : value;
  return /[",\r\n]/.test(safe) ? '"' + safe.replaceAll('"', '""') + '"' : safe;
}
