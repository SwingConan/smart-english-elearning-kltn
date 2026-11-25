import { evaluateCompletion } from './completion-evaluator';
import type { CompletionResult, EvidenceReference, ApprovedRule } from './completion.contracts';
import type { CompletionReadRequest } from './trusted-evidence.contracts';
import type {
  CertificateActorRead,
  CertificateGrantRead,
  CertificateGuardReason,
  CertificateGuardSimulation,
  CertificateIssuePreflight,
  CertificateReviewCheck,
  ScopedCompletionAssessment,
} from './certificate-review.contracts';

const text = (x: unknown): x is string => typeof x === 'string' && !!x.trim();
const ref = (x: EvidenceReference | null | undefined): x is EvidenceReference =>
  !!x && text(x.id) && text(x.revision);
const sameRef = (
  a: EvidenceReference | null | undefined,
  b: EvidenceReference | null | undefined,
) => ref(a) && ref(b) && a.id === b.id && a.revision === b.revision;
const rule = (r: ApprovedRule | null) =>
  !!r &&
  ref(r.ref) &&
  !!r.approval &&
  text(r.approval.decisionId) &&
  text(r.approval.actorId) &&
  text(r.approval.approvedAt) &&
  Number.isFinite(Date.parse(r.approval.approvedAt));
const sameTarget = (a: CompletionReadRequest, b: CompletionReadRequest) =>
  !!a &&
  !!b &&
  !!a.identity &&
  !!b.identity &&
  (['learnerId', 'enrollmentId', 'classOfferingId', 'courseVersionId'] as const).every(
    (k) => text(a.identity[k]) && a.identity[k] === b.identity[k],
  ) &&
  sameRef(a.courseVersionPin, b.courseVersionPin) &&
  sameRef(a.policyPin, b.policyPin) &&
  a.identity.courseVersionId === a.courseVersionPin.id;

class GuardFailure extends Error {
  constructor(
    readonly decision: 'BLOCKED' | 'DENIED',
    readonly reason: CertificateGuardReason,
  ) {
    super(reason);
  }
}
function check(
  ok: unknown,
  reason: CertificateGuardReason,
  decision: GuardFailure['decision'] = 'BLOCKED',
): asserts ok {
  if (!ok) throw new GuardFailure(decision, reason);
}
function result(
  action: CertificateGuardSimulation['action'],
  decision: CertificateGuardSimulation['decision'],
  reason: CertificateGuardReason,
): CertificateGuardSimulation {
  return {
    action,
    decision,
    reason,
    assurance: 'OFFLINE_AUTHORIZATION_SIMULATION_ONLY',
    runtimeAuthorized: false,
    requiresServerVerification: true,
  };
}

function assessment(
  read: ScopedCompletionAssessment,
  target: CompletionReadRequest,
): CompletionResult {
  check(sameTarget(read.request, target), 'SCOPE_MISMATCH', 'DENIED');
  const r = read.result;
  check(
    r.status === 'ASSESSED' && r.reason === 'ASSESSED' && ref(r.manifestRef) && r.assessment,
    'EVIDENCE_UNAVAILABLE',
  );
  // Reject an injected claim of runtime verification; S3A has no such authority.
  check(
    r.assurance === 'OFFLINE_REPOSITORY_CONTRACT_ONLY' &&
      r.runtimeVerified === false &&
      r.serverIntegrationRequired === true,
    'EVIDENCE_UNAVAILABLE',
  );
  const a = r.assessment;
  check(
    a.scope.enrollmentId === target.identity.enrollmentId &&
      a.scope.classOfferingId === target.identity.classOfferingId &&
      a.scope.courseVersionId === target.identity.courseVersionId &&
      sameRef(a.policyRef, target.policyPin),
    'SCOPE_MISMATCH',
    'DENIED',
  );
  check(a.state !== 'NOT_ELIGIBLE', 'NOT_ELIGIBLE');
  check(a.state === 'ELIGIBLE_FOR_REVIEW', 'EVIDENCE_UNAVAILABLE');
  check(
    Array.isArray(a.criteria) &&
      a.criteria.length > 0 &&
      new Set(a.criteria.map((c) => c.criterionId)).size === a.criteria.length &&
      Array.isArray(a.blockers) &&
      a.blockers.length === 0,
    'CONTRADICTORY_ASSESSMENT',
  );
  check(
    a.criteria.every(
      (c) => !c.mandatory || c.status === 'SATISFIED' || c.status === 'NOT_APPLICABLE',
    ),
    'CONTRADICTORY_ASSESSMENT',
  );
  check(
    a.criteria.every((c) => c.status !== 'NOT_APPLICABLE'),
    'EXEMPTION_UNVERIFIED',
  );
  check(
    a.criteria.every(
      (c) => (c.status !== 'SATISFIED' && c.status !== 'NOT_MET') || ref(c.evidenceRef),
    ),
    'CONTRADICTORY_ASSESSMENT',
  );
  return a;
}

const assessmentKey = (a: CompletionResult) =>
  JSON.stringify(
    [...a.criteria]
      .sort((a, b) => a.criterionId.localeCompare(b.criterionId))
      .map((c) => [
        c.criterionId,
        c.mandatory,
        c.status,
        c.reason,
        c.evidenceRef?.id ?? null,
        c.evidenceRef?.revision ?? null,
      ]),
  );

function basis(input: CertificateReviewCheck) {
  const { target, current } = input;
  check(sameTarget(target, target), 'MALFORMED_INPUT');
  const old = assessment(input.candidate, target),
    now = assessment(current.assessment, target);
  check(
    sameRef(input.candidate.result.manifestRef, current.assessment.result.manifestRef),
    'STALE_EVIDENCE',
  );
  check(assessmentKey(old) === assessmentKey(now), 'STALE_EVIDENCE');
  const p = current.policy;
  check(current.academicRules === 'RESOLVED' && p && current.courseVersion, 'POLICY_UNRESOLVED');
  const scope = {
    enrollmentId: target.identity.enrollmentId,
    classOfferingId: target.identity.classOfferingId,
    courseVersionId: target.identity.courseVersionId,
  };
  const policyCheck = evaluateCompletion({
    scope,
    courseVersion: current.courseVersion,
    courseVersionPin: target.courseVersionPin,
    policy: p,
    policyPin: target.policyPin,
    evidencePins: {},
    evidence: [],
    exemptions: [],
  });
  check(
    policyCheck.criteria.length > 0 &&
      !policyCheck.criteria.some((c) => c.reason === 'RULE_UNRESOLVED'),
    'POLICY_UNRESOLVED',
  );
  check(
    p.criteria.length === now.criteria.length &&
      p.criteria.every((c) =>
        now.criteria.some((n) => n.criterionId === c.id && n.mandatory === c.mandatory),
      ),
    'CONTRADICTORY_ASSESSMENT',
  );
  const passedReasons = {
    W03_GRADE: 'GRADE_MEETS_THRESHOLD',
    W06_ATTENDANCE: 'ATTENDANCE_MET',
    W07_ENTITLEMENT: 'ENTITLEMENT_VALID',
  };
  const failedReasons = {
    W03_GRADE: 'GRADE_BELOW_THRESHOLD',
    W06_ATTENDANCE: 'ATTENDANCE_NOT_MET',
    W07_ENTITLEMENT: 'ENTITLEMENT_INVALID',
  };
  check(
    p.criteria.every((c) => {
      const n = now.criteria.find((n) => n.criterionId === c.id)!;
      return n.status === 'SATISFIED'
        ? n.reason === passedReasons[c.kind]
        : n.status === 'NOT_MET'
          ? n.reason === failedReasons[c.kind]
          : n.status === 'PENDING';
    }),
    'CONTRADICTORY_ASSESSMENT',
  );
  const h = current.holds;
  check(
    h &&
      sameTarget(
        { identity: h.identity, courseVersionPin: target.courseVersionPin, policyPin: h.policyRef },
        target,
      ),
    'SCOPE_MISMATCH',
    'DENIED',
  );
  check(
    ref(h.ref) &&
      sameRef(h.manifestRef, current.assessment.result.manifestRef) &&
      h.completeness === 'COMPLETE' &&
      rule(h.governingRule),
    'HOLDS_UNRESOLVED',
  );
  check(h.conflicts !== 'PRESENT', 'CONFLICTING_HOLD');
  check(h.conflicts === 'NONE', 'HOLDS_UNRESOLVED');
}

function actor(
  read: CertificateActorRead,
  target: CompletionReadRequest,
  capability: CertificateGrantRead['capability'],
) {
  const i = read.identity;
  check(i && text(i.principalId) && text(i.personId) && ref(i.sessionRef), 'GRANT_UNVERIFIED');
  check(i.role === 'ACADEMIC_MANAGER', 'ROLE_DENIED', 'DENIED');
  check(read.sessionState !== 'EXPIRED', 'SESSION_INVALID', 'DENIED');
  check(read.sessionState === 'AUTHENTICATED', 'SESSION_INVALID');
  check(read.authorization !== 'DENIED', 'GRANT_DENIED', 'DENIED');
  check(read.authorization === 'AUTHORIZED', 'GRANT_UNVERIFIED');
  const g = read.grant;
  check(g, 'GRANT_DENIED', 'DENIED');
  check(
    g.principalId === i.principalId &&
      g.capability === capability &&
      g.classOfferingId === target.identity.classOfferingId,
    'GRANT_DENIED',
    'DENIED',
  );
  check(g.state !== 'REVOKED' && g.validity !== 'INVALID', 'GRANT_DENIED', 'DENIED');
  check(
    g.state === 'ACTIVE' &&
      g.validity === 'VALID' &&
      ref(g.ref) &&
      text(g.authorityEpoch) &&
      g.decision &&
      ref(g.decision.ref) &&
      ref(g.decision.authorityRef) &&
      text(g.decision.requestedByPersonId) &&
      text(g.decision.approvedByPersonId),
    'GRANT_UNVERIFIED',
  );
  check(
    g.decision.requestedByPersonId !== g.decision.approvedByPersonId &&
      g.decision.approvedByPersonId !== i.personId,
    'GRANT_DENIED',
    'DENIED',
  );
  return g;
}

function actorPair(
  atSelection: CertificateActorRead,
  now: CertificateActorRead,
  target: CompletionReadRequest,
  capability: CertificateGrantRead['capability'],
) {
  const prior = actor(atSelection, target, capability),
    current = actor(now, target, capability);
  check(
    atSelection.identity.principalId === now.identity.principalId &&
      atSelection.identity.personId === now.identity.personId &&
      sameRef(atSelection.identity.sessionRef, now.identity.sessionRef),
    'AUTHORIZATION_CHANGED',
  );
  check(
    sameRef(prior.ref, current.ref) &&
      prior.authorityEpoch === current.authorityEpoch &&
      sameRef(prior.decision.ref, current.decision.ref) &&
      sameRef(prior.decision.authorityRef, current.decision.authorityRef) &&
      prior.decision.requestedByPersonId === current.decision.requestedByPersonId &&
      prior.decision.approvedByPersonId === current.decision.approvedByPersonId,
    'AUTHORIZATION_CHANGED',
  );
}

function simulate(
  action: CertificateGuardSimulation['action'],
  verify: () => void,
): CertificateGuardSimulation {
  try {
    verify();
    return result(action, 'SIMULATED_ELIGIBLE', 'SIMULATED_ELIGIBLE');
  } catch (error) {
    return error instanceof GuardFailure
      ? result(action, error.decision, error.reason)
      : result(action, 'BLOCKED', 'MALFORMED_INPUT');
  }
}

/** Pure precondition simulation. Never authenticates or stores a review. */
export function simulateCertificateReviewEligibility(
  input: CertificateReviewCheck,
): CertificateGuardSimulation {
  return simulate('REVIEW', () => {
    actorPair(input.actorAtSelection, input.actorNow, input.target, 'certificate.review');
    basis(input);
  });
}

/** Future issuer preflight simulation only; no issuance/unique-ID/DB operation. */
export function simulateCertificateIssuePreflight(
  input: CertificateIssuePreflight,
): CertificateGuardSimulation {
  return simulate('ISSUE_PREFLIGHT', () => {
    actorPair(input.actorAtSelection, input.actorNow, input.target, 'certificate.issue');
    basis(input);
    const review = input.priorReview;
    check(
      review && review.state === 'APPROVED' && ref(review.ref) && input.reviewerNow,
      'REVIEW_REQUIRED',
    );
    check(
      sameTarget(review.target, input.target) &&
        sameRef(review.manifestRef, input.current.assessment.result.manifestRef),
      'STALE_REVIEW',
    );
    actorPair(review.reviewerAtDecision, input.reviewerNow, input.target, 'certificate.review');
    check(
      input.actorNow.identity.principalId !== input.reviewerNow.identity.principalId &&
        input.actorNow.identity.personId !== input.reviewerNow.identity.personId,
      'SAME_PERSON_REVIEW_AND_ISSUE',
      'DENIED',
    );
  });
}
