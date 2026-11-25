import type {
  AcademicApproval, ApprovedRule, CompletionCriterion, CompletionEvidence, CompletionInput,
  CompletionReason, CompletionResult, CompletionScope, CriterionResult, EvidenceReference,
} from './completion.contracts';

const text = (x: unknown): x is string => typeof x === 'string' && x.trim().length > 0;
const reference = (x: EvidenceReference | null | undefined): x is EvidenceReference =>
  !!x && text(x.id) && text(x.revision);
const sameRef = (a: EvidenceReference | null | undefined, b: EvidenceReference | null | undefined) =>
  reference(a) && reference(b) && a.id === b.id && a.revision === b.revision;
const approval = (x: AcademicApproval | null | undefined) =>
  !!x && text(x.decisionId) && text(x.actorId) && text(x.approvedAt) &&
  Number.isFinite(Date.parse(x.approvedAt));
const rule = (x: ApprovedRule | null | undefined): x is ApprovedRule =>
  !!x && reference(x.ref) && approval(x.approval);
const scopeValid = (s: CompletionScope) =>
  !!s && text(s.enrollmentId) && text(s.classOfferingId) && text(s.courseVersionId);
const sameScope = (a: CompletionScope, b: CompletionScope) =>
  scopeValid(a) && scopeValid(b) && a.enrollmentId === b.enrollmentId &&
  a.classOfferingId === b.classOfferingId && a.courseVersionId === b.courseVersionId;
const copyRef = (r: EvidenceReference): EvidenceReference => ({ id: r.id, revision: r.revision });

/** Pure normalized-evidence assessment. Never authorizes or issues a certificate.
 * No clock, I/O, averaging, retake selection or implicit academic defaults.
 * Pinned inputs must come from a future trusted read-only adapter; freshness
 * after this snapshot and issuance-time revalidation are outside Slice1.
 */
export function evaluateCompletion(input: CompletionInput): CompletionResult {
  const scope = { ...input.scope };
  const blocked = (reason: CompletionReason): CompletionResult => ({
    scope, state: 'PENDING_EVIDENCE', policyRef: null, criteria: [], blockers: [reason],
  });
  if (!scopeValid(input.scope)) return blocked('SCOPE_INVALID');
  const cv = input.courseVersion;
  if (!cv || cv.state !== 'APPROVED' || !approval(cv.approval) ||
    cv.ref.id !== input.scope.courseVersionId || !sameRef(cv.ref, input.courseVersionPin))
    return blocked('COURSE_VERSION_UNAPPROVED_OR_STALE');
  const policy = input.policy;
  if (!policy) return blocked('POLICY_MISSING');
  if (policy.state !== 'APPROVED' || !approval(policy.approval) ||
    !sameRef(policy.ref, input.policyPin) || !sameRef(policy.courseVersionRef, cv.ref))
    return blocked('POLICY_UNAPPROVED_OR_STALE');
  if (!rule(policy.applicabilityRule) || policy.applicability !== 'APPLICABLE' ||
    !Array.isArray(policy.criteria) || !policy.criteria.length ||
    policy.criteria.some(c => !text(c.id) || typeof c.mandatory !== 'boolean' ||
      !['W03_GRADE', 'W06_ATTENDANCE', 'W07_ENTITLEMENT'].includes(c.kind)) ||
    new Set(policy.criteria.map(c => c.id)).size !== policy.criteria.length ||
    !policy.criteria.some(c => c.kind === 'W07_ENTITLEMENT' && c.mandatory))
    return blocked('POLICY_INCOMPLETE');

  const criteria = policy.criteria.map(c => assess(c, input));
  const mandatory = criteria.filter(c => c.mandatory);
  // A confirmed failure cannot be compensated by another pass or hidden by pending evidence.
  const state = mandatory.some(c => c.status === 'NOT_MET') ? 'NOT_ELIGIBLE'
    : mandatory.some(c => c.status === 'PENDING') ? 'PENDING_EVIDENCE' : 'ELIGIBLE_FOR_REVIEW';
  return {
    scope, state, policyRef: copyRef(policy.ref), criteria,
    blockers: [...new Set(mandatory.filter(c => c.status === 'PENDING' || c.status === 'NOT_MET')
      .map(c => c.reason))],
  };
}

function assess(c: CompletionCriterion, input: CompletionInput): CriterionResult {
  const result = (
    status: CriterionResult['status'], reason: CompletionReason, evidenceRef: EvidenceReference | null = null,
  ): CriterionResult => ({ criterionId: c.id, mandatory: c.mandatory, status, reason,
    evidenceRef: evidenceRef ? copyRef(evidenceRef) : null });
  const pending = (reason: CompletionReason) => result('PENDING', reason);
  // An exemption needs an explicit approved rule for this exact policy, learner and criterion.
  const exemptions = input.exemptions.filter(e => e.criterionId === c.id);
  if (exemptions.length) {
    const e = exemptions[0];
    if (exemptions.length !== 1 || c.kind === 'W07_ENTITLEMENT' || !rule(c.exemptionRule) ||
      e.state !== 'APPROVED' || !approval(e.approval) || !reference(e.ref) ||
      !sameScope(e.scope, input.scope) || !sameRef(e.policyRef, input.policyPin) ||
      !sameRef(e.ruleRef, c.exemptionRule.ref)) return pending('INVALID_EXEMPTION');
    return result('NOT_APPLICABLE', 'APPROVED_EXEMPTION', e.ref);
  }
  if (c.kind === 'W03_GRADE' && (!rule(c.selectionRule) || !rule(c.roundingRule) ||
    !c.threshold || !Number.isFinite(c.threshold.minimum) || c.threshold.minimum < 0 ||
    !text(c.threshold.scale))) return pending('RULE_UNRESOLVED');
  if (c.kind === 'W06_ATTENDANCE' && !rule(c.calculationRule)) return pending('RULE_UNRESOLVED');
  if (c.kind === 'W07_ENTITLEMENT' && !rule(c.validityRule)) return pending('RULE_UNRESOLVED');

  const sources = input.evidence.filter(e => e.criterionId === c.id);
  if (sources.length !== 1) return pending('EVIDENCE_MISSING_OR_AMBIGUOUS');
  const e: CompletionEvidence = sources[0];
  if (!sameScope(e.scope, input.scope)) return pending('EVIDENCE_SCOPE_MISMATCH');
  const pin = Object.hasOwn(input.evidencePins, c.id) ? input.evidencePins[c.id] : undefined;
  if (!sameRef(e.ref, pin)) return pending('EVIDENCE_REVISION_MISMATCH');
  if (e.kind !== c.kind) return pending('EVIDENCE_UNCONFIRMED');

  if (c.kind === 'W03_GRADE' && e.kind === 'W03_GRADE') {
    if (!['PUBLISHED', 'FINAL'].includes(e.state) || e.finalized !== true || !approval(e.publication) ||
      !sameRef(e.selectionRuleRef, c.selectionRule?.ref) ||
      !sameRef(e.roundingRuleRef, c.roundingRule?.ref) || e.value === null ||
      !Number.isFinite(e.value) || e.value < 0 || e.scale !== c.threshold?.scale)
      return pending('EVIDENCE_UNCONFIRMED');
    const pass = e.value >= c.threshold.minimum;
    return result(pass ? 'SATISFIED' : 'NOT_MET',
      pass ? 'GRADE_MEETS_THRESHOLD' : 'GRADE_BELOW_THRESHOLD', e.ref);
  }
  if (c.kind === 'W06_ATTENDANCE' && e.kind === 'W06_ATTENDANCE') {
    if (e.state !== 'OFFICIAL_CONFIRMED' || !sameRef(e.calculationRuleRef, c.calculationRule?.ref) ||
      !e.sessionRefs.length || !e.sessionRefs.every(reference) || !e.receiptRefs.every(reference) ||
      (!e.receiptRefs.length && !e.corrections.length) ||
      e.corrections.some(x => x.state !== 'APPROVED' || !reference(x.ref) || !approval(x.approval)))
      return pending('EVIDENCE_UNCONFIRMED');
    if (e.outcome !== 'SATISFIED' && e.outcome !== 'NOT_MET') return pending('EVIDENCE_UNCONFIRMED');
    return result(e.outcome, e.outcome === 'SATISFIED' ? 'ATTENDANCE_MET' : 'ATTENDANCE_NOT_MET', e.ref);
  }
  if (c.kind === 'W07_ENTITLEMENT' && e.kind === 'W07_ENTITLEMENT') {
    if (e.state !== 'AUTHORIZED' || !reference(e.authorizationRef) ||
      !sameRef(e.validityRuleRef, c.validityRule?.ref) || !['VALID', 'INVALID'].includes(e.outcome))
      return pending('EVIDENCE_UNCONFIRMED');
    return result(e.outcome === 'VALID' ? 'SATISFIED' : 'NOT_MET',
      e.outcome === 'VALID' ? 'ENTITLEMENT_VALID' : 'ENTITLEMENT_INVALID', e.ref);
  }
  return pending('EVIDENCE_UNCONFIRMED');
}
