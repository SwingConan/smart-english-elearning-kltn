import type {
  ApprovedRule,
  CompletionCriterion,
  CompletionEvidence,
  EvidenceReference,
} from './completion.contracts';
import { SERVER_READ_SNAPSHOT } from './evidence-adapter.contracts';
import type {
  AcademicResolution,
  AdapterReason,
  ApprovalClaim,
  DecisionProvenance,
  EffectiveAttendance,
  EvidenceAdapterContext,
  EvidenceAdapterResult,
  EvidenceIdentity,
  EvidenceProjection,
  W03Projection,
  W06Projection,
  W06CorrectionProjection,
  W06SessionProjection,
  W07Projection,
} from './evidence-adapter.contracts';

const text = (s: unknown): s is string => typeof s === 'string' && !!s.trim();
const ref = (r: EvidenceReference | null | undefined): r is EvidenceReference =>
  !!r && text(r.id) && text(r.revision);
const same = (a: EvidenceReference | null | undefined, b: EvidenceReference | null | undefined) =>
  ref(a) && ref(b) && a.id === b.id && a.revision === b.revision;
const identity = (a: EvidenceIdentity, b: EvidenceIdentity) =>
  !!a &&
  !!b &&
  ['learnerId', 'enrollmentId', 'classOfferingId', 'courseVersionId'].every((k) => {
    const key = k as keyof EvidenceIdentity;
    return text(a[key]) && a[key] === b[key];
  });
const timestamp = (s: unknown): s is string =>
  text(s) &&
  /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(s) &&
  Number.isFinite(Date.parse(s));
const copyRef = (r: EvidenceReference): EvidenceReference => ({ id: r.id, revision: r.revision });
const scopeOf = (c: EvidenceAdapterContext) => ({
  enrollmentId: c.identity.enrollmentId,
  classOfferingId: c.identity.classOfferingId,
  courseVersionId: c.identity.courseVersionId,
});
const result = (
  status: EvidenceAdapterResult['status'],
  reason: AdapterReason,
  evidence: CompletionEvidence | null = null,
  effectiveAttendance: readonly EffectiveAttendance[] = [],
): EvidenceAdapterResult => ({
  status,
  reason,
  evidence,
  effectiveAttendance,
  assurance: 'OFFLINE_CONSISTENCY_ONLY',
  serverIntegrationRequired: true,
});
const pending = (reason: AdapterReason) => result('PENDING', reason);
const reject = (reason: AdapterReason) => result('REJECTED', reason);

// Canonical JSON projection comparison, not a signature/authentication check.
// Reject accessors/functions/nonfinite values/cycles instead of executing/coercing them.
function canonical(x: unknown, depth = 0): string | null {
  if (depth > 32) return null;
  if (x === null || typeof x === 'string' || typeof x === 'boolean') return JSON.stringify(x);
  if (typeof x === 'number') return Number.isFinite(x) ? JSON.stringify(x) : null;
  if (!x || typeof x !== 'object') return null;
  if (!Array.isArray(x)) {
    // structuredClone/VM contexts can have a different Object.prototype. Check
    // the native plain-object constructor without invoking a constructor getter.
    const prototype = Object.getPrototypeOf(x);
    if (prototype !== null) {
      const constructor = Object.getOwnPropertyDescriptor(prototype, 'constructor');
      if (
        Object.getPrototypeOf(prototype) !== null ||
        !constructor ||
        !('value' in constructor) ||
        typeof constructor.value !== 'function' ||
        Function.prototype.toString.call(constructor.value) !==
          Function.prototype.toString.call(Object)
      )
        return null;
    }
  }
  if (Reflect.ownKeys(x).some((k) => typeof k !== 'string')) return null;
  const parts: string[] = [];
  const keys = Array.isArray(x)
    ? Array.from({ length: x.length }, (_, i) => String(i))
    : Object.keys(x).sort();
  for (const k of keys) {
    const d = Object.getOwnPropertyDescriptor(x, k);
    if (!d || !('value' in d)) return null;
    const v = canonical(d.value, depth + 1);
    if (v === null) return null;
    parts.push(Array.isArray(x) ? v : JSON.stringify(k) + ':' + v);
  }
  return (Array.isArray(x) ? '[' : '{') + parts.join(',') + (Array.isArray(x) ? ']' : '}');
}

function decision(
  c: EvidenceAdapterContext,
  target: EvidenceReference,
  purpose: DecisionProvenance['purpose'],
  claim?: ApprovalClaim | null,
  pin?: EvidenceReference | null,
): DecisionProvenance | EvidenceAdapterResult {
  const rows = c.snapshot!.decisions.filter(
    (d) =>
      same(d.subjectRef, target) &&
      d.purpose === purpose &&
      (pin ? same(d.ref, pin) : claim ? d.ref.id === claim.decisionId : true),
  );
  if (!rows.length) return pending('UNVERIFIED_PROVENANCE');
  if (rows.length !== 1) return reject('SOURCE_CONTRADICTION');
  const d = rows[0];
  if (d.state === 'REJECTED') return reject('DECISION_REJECTED');
  const expectedScope = ['COURSE_VERSION', 'POLICY', 'RULE'].includes(purpose)
    ? 'COURSE_VERSION'
    : 'CLASS';
  if (
    d.scope !== expectedScope ||
    d.scopeId !==
      (expectedScope === 'CLASS' ? c.identity.classOfferingId : c.identity.courseVersionId)
  )
    return reject('IDENTITY_MISMATCH');
  if (
    d.state !== 'APPROVED' ||
    !ref(d.ref) ||
    !ref(d.authorityRef) ||
    !text(d.actorId) ||
    !timestamp(d.decidedAt)
  )
    return pending('UNVERIFIED_PROVENANCE');
  if (
    claim &&
    (claim.decisionId !== d.ref.id ||
      claim.actorId !== d.actorId ||
      claim.approvedAt !== d.decidedAt)
  )
    return reject('SOURCE_CONTRADICTION');
  return d;
}
const isResult = (x: object): x is EvidenceAdapterResult => 'status' in x;
const approvalOf = (d: DecisionProvenance): ApprovalClaim => ({
  decisionId: d.ref.id,
  actorId: d.actorId,
  approvedAt: d.decidedAt,
});

function validate(
  source: unknown,
  c: EvidenceAdapterContext,
  kind: CompletionCriterion['kind'],
): { source: EvidenceProjection; criterion: CompletionCriterion } | EvidenceAdapterResult {
  if (canonical(source) === null || !source || typeof source !== 'object')
    return reject('MALFORMED_SOURCE');
  const s = source as EvidenceProjection,
    snap = c.snapshot;
  if (!snap || snap[SERVER_READ_SNAPSHOT] !== true) return pending('UNVERIFIED_PROVENANCE');
  if (
    !snap.enrollment ||
    !Array.isArray(snap.records) ||
    !Array.isArray(snap.decisions) ||
    !Array.isArray(snap.resolutions)
  )
    return pending('UNVERIFIED_PROVENANCE');
  if (
    !identity(s.identity, c.identity) ||
    !identity(snap.identity, c.identity) ||
    snap.enrollment.id !== c.identity.enrollmentId ||
    snap.enrollment.learnerId !== c.identity.learnerId ||
    snap.enrollment.classOfferingId !== c.identity.classOfferingId
  )
    return reject('IDENTITY_MISMATCH');
  if (
    !same(s.ref, c.sourcePin) ||
    !same(s.policyRef, c.policyPin) ||
    !same(snap.policyRef, c.policyPin) ||
    !same(s.courseVersionRef, c.courseVersionPin) ||
    !same(snap.courseVersionRef, c.courseVersionPin) ||
    c.courseVersionPin.id !== c.identity.courseVersionId
  )
    return pending('STALE_REVISION');
  const records = snap.records.filter((r) => same(r.ref, s.ref));
  if (!records.length) return pending('UNVERIFIED_PROVENANCE');
  if (records.length !== 1 || canonical(records[0]) !== canonical(s))
    return reject('SOURCE_CONTRADICTION');
  const cvDecision = decision(c, c.courseVersionPin, 'COURSE_VERSION');
  if (isResult(cvDecision)) return cvDecision;
  const p = c.policy;
  if (
    !p ||
    p.state !== 'APPROVED' ||
    !same(p.ref, c.policyPin) ||
    !same(p.courseVersionRef, c.courseVersionPin) ||
    p.applicability !== 'APPLICABLE' ||
    !p.approval ||
    !Array.isArray(p.criteria)
  )
    return pending('POLICY_UNRESOLVED');
  const pDecision = decision(c, p.ref, 'POLICY', p.approval);
  if (isResult(pDecision)) return pDecision;
  const rows = p.criteria.filter((x) => x.id === c.criterionId);
  if (rows.length !== 1 || rows[0].kind !== kind) return reject('SOURCE_CONTRADICTION');
  const rules = [p.applicabilityRule];
  const criterion = rows[0];
  if (criterion.kind === 'W03_GRADE') rules.push(criterion.selectionRule, criterion.roundingRule);
  else if (criterion.kind === 'W06_ATTENDANCE') rules.push(criterion.calculationRule);
  else rules.push(criterion.validityRule);
  for (const r of rules) {
    if (!r || !ref(r.ref) || !r.approval) return pending('RULE_UNRESOLVED');
    const d = decision(c, r.ref, 'RULE', r.approval);
    if (isResult(d)) return d;
  }
  return { source: s, criterion };
}

function referenceSet(a: readonly EvidenceReference[], b: readonly EvidenceReference[]) {
  const key = (r: EvidenceReference) => JSON.stringify([r.id, r.revision]);
  return (
    a.every(ref) &&
    b.every(ref) &&
    new Set(a.map(key)).size === a.length &&
    new Set(b.map(key)).size === b.length &&
    a.length === b.length &&
    a.every((r) => b.some((s) => same(r, s)))
  );
}

function resolution(
  c: EvidenceAdapterContext,
  kind: AcademicResolution['kind'],
  rules: readonly ApprovedRule[],
  sources: readonly EvidenceReference[],
): AcademicResolution | EvidenceAdapterResult {
  const rows = c.snapshot!.resolutions.filter(
    (r) => r.kind === kind && r.criterionId === c.criterionId,
  );
  if (!rows.length) return pending('RULE_UNRESOLVED');
  if (rows.length !== 1) return reject('SOURCE_CONTRADICTION');
  const r = rows[0];
  if (!identity(r.identity, c.identity)) return reject('IDENTITY_MISMATCH');
  if (
    !ref(r.ref) ||
    !same(r.policyRef, c.policyPin) ||
    !referenceSet(
      r.ruleRefs,
      rules.map((x) => x.ref),
    ) ||
    !referenceSet(r.sourceRefs, sources)
  )
    return pending('STALE_REVISION');
  if (r.outcome === 'UNKNOWN') return pending('RULE_UNRESOLVED');
  return r;
}

export function normalizeW03(source: unknown, c: EvidenceAdapterContext): EvidenceAdapterResult {
  const v = validate(source, c, 'W03_GRADE');
  if (isResult(v)) return v;
  const s = v.source as W03Projection;
  if (!['W03_ASSIGNMENT', 'W03_QUIZ'].includes(s.source)) return reject('UNSUPPORTED_SOURCE');
  if (!ref(s.activityRevisionRef) || !Array.isArray(s.makerIds) || !s.makerIds.every(text))
    return reject('MALFORMED_SOURCE');
  // Assignment REVIEWED_FINAL and quiz SUBMITTED without release never become published grades.
  if (s.state !== (s.source === 'W03_ASSIGNMENT' ? 'PUBLISHED' : 'SUBMITTED'))
    return pending('NOT_PUBLISHED_FINAL');
  if (
    !timestamp(s.confirmedAt) ||
    !timestamp(s.publishedAt) ||
    !text(s.publishedById) ||
    !ref(s.publicationDecisionRef) ||
    s.value === null
  )
    return pending('NOT_PUBLISHED_FINAL');
  if (!Number.isFinite(s.value) || s.value < 0 || !text(s.scale)) return reject('MALFORMED_SOURCE');
  if (Date.parse(s.publishedAt) < Date.parse(s.confirmedAt) || s.makerIds.includes(s.publishedById))
    return reject('SOURCE_CONTRADICTION');
  const d = decision(c, s.ref, 'W03_PUBLICATION', null, s.publicationDecisionRef);
  if (isResult(d)) return d;
  if (d.actorId !== s.publishedById || d.decidedAt !== s.publishedAt)
    return reject('SOURCE_CONTRADICTION');
  const rule = v.criterion as Extract<CompletionCriterion, { kind: 'W03_GRADE' }>;
  const r = resolution(
    c,
    'W03_GRADE',
    [rule.selectionRule!, rule.roundingRule!],
    [s.ref, s.activityRevisionRef, d.ref],
  );
  if (isResult(r)) return r;
  if (r.outcome !== 'RESOLVED' || r.normalizedValue !== s.value || r.scale !== s.scale)
    return reject('SOURCE_CONTRADICTION');
  return result('NORMALIZED', 'NORMALIZED', {
    kind: 'W03_GRADE',
    criterionId: c.criterionId,
    scope: scopeOf(c),
    ref: copyRef(s.ref),
    state: 'PUBLISHED',
    finalized: true,
    publication: approvalOf(d),
    value: s.value,
    scale: s.scale,
    selectionRuleRef: copyRef(rule.selectionRule!.ref),
    roundingRuleRef: copyRef(rule.roundingRule!.ref),
  });
}

export function normalizeW06(source: unknown, c: EvidenceAdapterContext): EvidenceAdapterResult {
  const v = validate(source, c, 'W06_ATTENDANCE');
  if (isResult(v)) return v;
  const s = v.source as W06Projection;
  if (s.source !== 'W06_LEARNER_ATTENDANCE') return reject('UNSUPPORTED_SOURCE');
  if (!s.historyComplete) return pending('INCOMPLETE_CORRECTION_HISTORY');
  if (!Array.isArray(s.sessions) || !s.sessions.length) return pending('INSUFFICIENT_EVIDENCE');
  const effective: EffectiveAttendance[] = [],
    sessionRefs: EvidenceReference[] = [],
    receiptRefs: EvidenceReference[] = [];
  const corrections: Extract<
    CompletionEvidence,
    { kind: 'W06_ATTENDANCE' }
  >['corrections'][number][] = [];
  const sources = [s.ref],
    sessionIds = new Set<string>(),
    windowIds = new Set<string>();
  const sessions: readonly W06SessionProjection[] = s.sessions;
  for (const session of sessions) {
    if (!session || typeof session !== 'object') return reject('MALFORMED_SOURCE');
    if (!ref(session.ref) || !ref(session.windowRef) || !Array.isArray(session.corrections))
      return reject('MALFORMED_SOURCE');
    if (session.classOfferingId !== c.identity.classOfferingId) return reject('IDENTITY_MISMATCH');
    if (!same(session.courseVersionRef, c.courseVersionPin)) return pending('STALE_REVISION');
    if (session.state !== 'PUBLISHED') return pending('INSUFFICIENT_EVIDENCE');
    if (sessionIds.has(session.ref.id) || windowIds.has(session.windowRef.id))
      return reject('SOURCE_CONTRADICTION');
    sessionIds.add(session.ref.id);
    windowIds.add(session.windowRef.id);
    sessionRefs.push(copyRef(session.ref));
    sources.push(session.ref, session.windowRef);
    let status = 'NOT_RECORDED',
      version = 0,
      last: EvidenceReference | null = null;
    const raw = session.receipt;
    if (raw) {
      if (raw.learnerId !== c.identity.learnerId || !same(raw.windowRef, session.windowRef))
        return reject('IDENTITY_MISMATCH');
      if (raw.state !== 'ACCEPTED' || !timestamp(raw.acceptedAt))
        return pending('INSUFFICIENT_EVIDENCE');
      if (!ref(raw.ref) || !['PRESENT', 'LATE'].includes(raw.status))
        return reject('SOURCE_CONTRADICTION');
      status = raw.status;
      receiptRefs.push(copyRef(raw.ref));
      sources.push(raw.ref);
    }
    const history: readonly W06CorrectionProjection[] = session.corrections;
    const correctionIds = new Set<string>();
    for (const x of history) {
      if (!x || typeof x !== 'object') return reject('MALFORMED_SOURCE');
      if (x.learnerId !== c.identity.learnerId || !same(x.windowRef, session.windowRef))
        return reject('IDENTITY_MISMATCH');
      if (!['APPROVED', 'PENDING_APPROVAL', 'REJECTED'].includes(x.state))
        return pending('INSUFFICIENT_EVIDENCE');
      if (
        !ref(x.ref) ||
        !text(x.makerId) ||
        !Number.isInteger(x.baseVersion) ||
        x.baseVersion < 0 ||
        !['PRESENT', 'LATE', 'NOT_RECORDED'].includes(x.beforeStatus) ||
        !['PRESENT', 'LATE', 'NOT_RECORDED'].includes(x.requestedStatus)
      )
        return reject('MALFORMED_SOURCE');
      if (correctionIds.has(x.ref.id)) return reject('CORRECTION_CONFLICT');
      correctionIds.add(x.ref.id);
      if (
        x.state === 'PENDING_APPROVAL' &&
        (x.revision !== null ||
          x.reviewerId !== null ||
          x.reviewedAt !== null ||
          x.decisionRef !== null)
      )
        return reject('SOURCE_CONTRADICTION');
      if (
        x.state === 'REJECTED' &&
        (x.revision !== null ||
          !text(x.reviewerId) ||
          !timestamp(x.reviewedAt) ||
          !ref(x.decisionRef))
      )
        return reject('SOURCE_CONTRADICTION');
    }
    const approved = history
      .filter((x) => x.state === 'APPROVED')
      .slice()
      .sort((a, b) => (a.revision ?? 0) - (b.revision ?? 0));
    if (new Set(approved.map((x) => x.revision)).size !== approved.length)
      return reject('CORRECTION_CONFLICT');
    for (const x of approved) {
      if (
        !Number.isInteger(x.baseVersion) ||
        !Number.isInteger(x.revision) ||
        x.baseVersion < 0 ||
        x.revision !== x.baseVersion + 1 ||
        x.baseVersion !== version
      )
        return pending('INCOMPLETE_CORRECTION_HISTORY');
      if (
        x.beforeStatus !== status ||
        !['PRESENT', 'LATE', 'NOT_RECORDED'].includes(x.requestedStatus) ||
        !text(x.makerId) ||
        x.makerId === x.reviewerId
      )
        return reject('CORRECTION_CONFLICT');
      if (!ref(x.ref) || !ref(x.decisionRef) || !timestamp(x.reviewedAt))
        return pending('UNVERIFIED_PROVENANCE');
      const d = decision(c, x.ref, 'W06_CORRECTION', null, x.decisionRef);
      if (isResult(d)) return d;
      if (d.actorId !== x.reviewerId || d.decidedAt !== x.reviewedAt)
        return reject('SOURCE_CONTRADICTION');
      status = x.requestedStatus;
      version = x.revision!;
      last = copyRef(x.ref);
      corrections.push({ ref: copyRef(x.ref), state: 'APPROVED', approval: approvalOf(d) });
      sources.push(x.ref);
    }
    if (!raw && !approved.length) return pending('INSUFFICIENT_EVIDENCE');
    effective.push({ sessionRef: copyRef(session.ref), status, version, correctionRef: last });
  }
  const rule = v.criterion as Extract<CompletionCriterion, { kind: 'W06_ATTENDANCE' }>;
  const r = resolution(c, 'W06_ATTENDANCE', [rule.calculationRule!], sources);
  if (isResult(r)) return r;
  if (r.outcome !== 'SATISFIED' && r.outcome !== 'NOT_MET') return reject('SOURCE_CONTRADICTION');
  return result(
    'NORMALIZED',
    'NORMALIZED',
    {
      kind: 'W06_ATTENDANCE',
      criterionId: c.criterionId,
      scope: scopeOf(c),
      ref: copyRef(s.ref),
      state: 'OFFICIAL_CONFIRMED',
      sessionRefs,
      receiptRefs,
      corrections,
      calculationRuleRef: copyRef(rule.calculationRule!.ref),
      outcome: r.outcome,
    },
    effective,
  );
}

export function normalizeW07(source: unknown, c: EvidenceAdapterContext): EvidenceAdapterResult {
  const v = validate(source, c, 'W07_ENTITLEMENT');
  if (isResult(v)) return v;
  const s = v.source as W07Projection;
  if (s.source !== 'W07_ENTITLEMENT') return reject('UNSUPPORTED_SOURCE');
  if (!s.application || !ref(s.application.ref) || !text(s.enrollmentStatus))
    return reject('MALFORMED_SOURCE');
  if (!text(s.application.state) || s.application.state === 'UNKNOWN')
    return pending('INSUFFICIENT_EVIDENCE');
  if (
    s.application.learnerId !== c.identity.learnerId ||
    s.application.classOfferingId !== c.identity.classOfferingId
  )
    return reject('IDENTITY_MISMATCH');
  if (!same(s.application.courseVersionRef, c.courseVersionPin)) return pending('STALE_REVISION');
  if (s.entitlementOutcome === 'PENDING_CAPACITY' || s.entitlementOutcome === 'BLOCKED_REVIEW')
    return s.entitlementEnrollmentId === null
      ? pending('INSUFFICIENT_EVIDENCE')
      : reject('SOURCE_CONTRADICTION');
  if (s.entitlementOutcome !== 'ACTIVE') return pending('INSUFFICIENT_EVIDENCE');
  if (s.entitlementEnrollmentId !== c.identity.enrollmentId) return reject('IDENTITY_MISMATCH');
  if (!ref(s.application.academicDecisionRef)) return pending('UNVERIFIED_PROVENANCE');
  const d = decision(
    c,
    s.application.ref,
    'W07_ADMISSION',
    null,
    s.application.academicDecisionRef,
  );
  if (isResult(d)) return d;
  if (d.actorId === c.identity.learnerId) return reject('SOURCE_CONTRADICTION');
  const rule = v.criterion as Extract<CompletionCriterion, { kind: 'W07_ENTITLEMENT' }>;
  const r = resolution(
    c,
    'W07_ENTITLEMENT',
    [rule.validityRule!],
    [s.ref, s.application.ref, d.ref],
  );
  if (isResult(r)) return r;
  if (r.outcome !== 'VALID' && r.outcome !== 'INVALID') return reject('SOURCE_CONTRADICTION');
  return result('NORMALIZED', 'NORMALIZED', {
    kind: 'W07_ENTITLEMENT',
    criterionId: c.criterionId,
    scope: scopeOf(c),
    ref: copyRef(s.ref),
    state: 'AUTHORIZED',
    authorizationRef: copyRef(d.ref),
    validityRuleRef: copyRef(rule.validityRule!.ref),
    outcome: r.outcome,
  });
}
