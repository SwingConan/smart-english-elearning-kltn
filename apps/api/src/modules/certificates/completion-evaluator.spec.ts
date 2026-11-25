import { evaluateCompletion } from './completion-evaluator';
import type {
  AcademicApproval, ApprovedRule, CompletionInput, CompletionPolicy, CompletionScope,
  GradeCriterion, W03GradeEvidence, W06AttendanceEvidence, W07EntitlementEvidence,
} from './completion.contracts';

// Explicit synthetic policy only. These numbers/rules are NOT Smart English academic defaults.
const approval: AcademicApproval = {
  decisionId: 'synthetic-decision', actorId: 'synthetic-academic', approvedAt: '2026-01-01T00:00:00Z',
};
const rule = (id: string): ApprovedRule => ({ ref: { id, revision: 'approved-v1' }, approval });
const scope: CompletionScope = {
  enrollmentId: 'enrollment-A', classOfferingId: 'class-A', courseVersionId: 'course-version-A',
};
const courseRef = { id: scope.courseVersionId, revision: 'approved-v1' };
const gradeCriterion: GradeCriterion = {
  id: 'writing', kind: 'W03_GRADE', mandatory: true,
  threshold: { minimum: 3, scale: 'synthetic-five-point-scale' },
  selectionRule: rule('selected-final'), roundingRule: rule('explicit-rounding'), exemptionRule: null,
};
const policy: CompletionPolicy = {
  ref: { id: 'policy-A', revision: 'approved-v1' }, courseVersionRef: courseRef,
  state: 'APPROVED', approval, applicabilityRule: rule('effective-policy'), applicability: 'APPLICABLE',
  criteria: [gradeCriterion, {
    id: 'attendance', kind: 'W06_ATTENDANCE', mandatory: true,
    calculationRule: rule('explicit-attendance-calculation'), exemptionRule: null,
  }, { id: 'entitlement', kind: 'W07_ENTITLEMENT', mandatory: true, validityRule: rule('explicit-validity-period') }],
};
const grade: W03GradeEvidence = {
  criterionId: 'writing', kind: 'W03_GRADE', scope, ref: { id: 'grade-A', revision: 'published-v2' },
  state: 'PUBLISHED', finalized: true, publication: approval, value: 4,
  scale: 'synthetic-five-point-scale', selectionRuleRef: rule('selected-final').ref,
  roundingRuleRef: rule('explicit-rounding').ref,
};
const attendance: W06AttendanceEvidence = {
  criterionId: 'attendance', kind: 'W06_ATTENDANCE', scope,
  ref: { id: 'official-attendance-snapshot', revision: 'v2' }, state: 'OFFICIAL_CONFIRMED',
  sessionRefs: [{ id: 'dated-session-A', revision: 'official-v2' }],
  receiptRefs: [{ id: 'original-receipt', revision: 'immutable' }],
  corrections: [{ ref: { id: 'approved-correction', revision: 'v1' }, state: 'APPROVED', approval }],
  calculationRuleRef: rule('explicit-attendance-calculation').ref, outcome: 'SATISFIED',
};
const entitlement: W07EntitlementEvidence = {
  criterionId: 'entitlement', kind: 'W07_ENTITLEMENT', scope,
  ref: { id: 'entitlement-event-A', revision: 'immutable-event' }, state: 'AUTHORIZED',
  authorizationRef: { id: 'authorized-admission-decision', revision: 'v1' },
  validityRuleRef: rule('explicit-validity-period').ref, outcome: 'VALID',
};
const fixture = (): CompletionInput => structuredClone({
  scope, courseVersion: { ref: courseRef, state: 'APPROVED', approval },
  courseVersionPin: courseRef, policy, policyPin: policy.ref,
  evidencePins: { writing: grade.ref, attendance: attendance.ref, entitlement: entitlement.ref },
  evidence: [grade, attendance, entitlement], exemptions: [],
});
function withGrade(change: Partial<W03GradeEvidence>): CompletionInput {
  return { ...fixture(), evidence: [{ ...grade, ...change }, attendance, entitlement] };
}
function withPolicy(change: Partial<CompletionPolicy>): CompletionInput {
  return { ...fixture(), policy: { ...policy, ...change } };
}
function withGradeRule(change: Partial<GradeCriterion>): CompletionInput {
  return withPolicy({ criteria: [{ ...gradeCriterion, ...change }, ...policy.criteria.slice(1)] });
}
const writing = (input: CompletionInput) => evaluateCompletion(input).criteria.find(x => x.criterionId === 'writing');

describe('W09-DF-S1 pure completion foundation (offline synthetic policy)', () => {
  it('returns eligible-for-review, not issuance, for all independently satisfied mandatory evidence', () => {
    const result = evaluateCompletion(fixture());
    expect(result.state).toBe('ELIGIBLE_FOR_REVIEW');
    expect(result.criteria.map(c => c.status)).toEqual(['SATISFIED', 'SATISFIED', 'SATISFIED']);
    expect(result.blockers).toEqual([]);
    expect(result).not.toHaveProperty('certificate');
  });

  it.each([0, 2.999])('preserves a confirmed failing grade %s rather than averaging it away', value => {
    const result = evaluateCompletion(withGrade({ value }));
    expect(result.state).toBe('NOT_ELIGIBLE');
    expect(result.blockers).toContain('GRADE_BELOW_THRESHOLD');
  });
  it('uses the explicit threshold boundary without inventing rounding', () => {
    expect(evaluateCompletion(withGrade({ value: 3 })).state).toBe('ELIGIBLE_FOR_REVIEW');
  });
  it.each([null, Number.NaN, Number.POSITIVE_INFINITY, -1])('does not interpret unknown/invalid grade %s as a score', value => {
    expect(evaluateCompletion(withGrade({ value })).state).toBe('PENDING_EVIDENCE');
  });
  it.each(['PENDING', 'PROVISIONAL', 'UNKNOWN'] as const)('does not accept %s grade evidence', state => {
    expect(evaluateCompletion(withGrade({ state })).state).toBe('PENDING_EVIDENCE');
  });
  it('requires publication/authorization even when a grade is marked FINAL', () => {
    expect(evaluateCompletion(withGrade({ state: 'FINAL', publication: null })).state).toBe('PENDING_EVIDENCE');
    expect(evaluateCompletion(withGrade({ state: 'FINAL' })).state).toBe('ELIGIBLE_FOR_REVIEW');
    expect(evaluateCompletion(withGrade({ finalized: false })).state).toBe('PENDING_EVIDENCE');
  });
  it('requires an approved policy and an exact current policy pin', () => {
    expect(evaluateCompletion({ ...fixture(), policy: null }).blockers).toEqual(['POLICY_MISSING']);
    for (const state of ['DRAFT', 'REVOKED', 'UNKNOWN'] as const)
      expect(evaluateCompletion(withPolicy({ state })).state).toBe('PENDING_EVIDENCE');
    expect(evaluateCompletion(withPolicy({ approval: null })).state).toBe('PENDING_EVIDENCE');
    expect(evaluateCompletion({ ...fixture(), policyPin: { ...policy.ref, revision: 'old' } }).state).toBe('PENDING_EVIDENCE');
  });
  it('requires an approved, pinned CourseVersion and nonempty enrollment/class identity', () => {
    const input = fixture();
    expect(evaluateCompletion({ ...input, courseVersion: null }).state).toBe('PENDING_EVIDENCE');
    expect(evaluateCompletion({ ...input, courseVersionPin: { ...courseRef, revision: 'different' } }).state).toBe('PENDING_EVIDENCE');
    expect(evaluateCompletion({ ...input, courseVersion: { ref: courseRef, state: 'DRAFT', approval } }).state).toBe('PENDING_EVIDENCE');
    expect(evaluateCompletion({ ...input, scope: { ...scope, enrollmentId: '' } }).blockers).toEqual(['SCOPE_INVALID']);
    expect(evaluateCompletion(withPolicy({ courseVersionRef: { id: 'other', revision: 'approved-v1' } })).state).toBe('PENDING_EVIDENCE');
  });
  it('blocks empty/ambiguous policy lists and cannot omit mandatory entitlement', () => {
    for (const criteria of [[], [gradeCriterion], [...policy.criteria, gradeCriterion]])
      expect(evaluateCompletion(withPolicy({ criteria })).blockers).toEqual(['POLICY_INCOMPLETE']);
    expect(evaluateCompletion(withPolicy({ applicability: 'UNKNOWN' })).state).toBe('PENDING_EVIDENCE');
    expect(evaluateCompletion(withPolicy({ applicabilityRule: null })).state).toBe('PENDING_EVIDENCE');
  });
  it('does not fill missing threshold, scale, selection, rounding or rule approval', () => {
    for (const change of [
      { threshold: null }, { threshold: { minimum: Number.NaN, scale: 'x' } },
      { threshold: { minimum: 1, scale: '' } }, { selectionRule: null }, { roundingRule: null },
      { selectionRule: { ...rule('selected-final'), approval: { ...approval, actorId: '' } } },
    ]) expect(writing(withGradeRule(change))?.reason).toBe('RULE_UNRESOLVED');
  });
  it('does not infer attendance denominator or entitlement effective-time rules', () => {
    const noAttendanceRule = withPolicy({ criteria: [gradeCriterion,
      { ...policy.criteria[1], kind: 'W06_ATTENDANCE', calculationRule: null, exemptionRule: null }, policy.criteria[2]] });
    expect(evaluateCompletion(noAttendanceRule).state).toBe('PENDING_EVIDENCE');
    const noValidityRule = withPolicy({ criteria: [...policy.criteria.slice(0, 2),
      { id: 'entitlement', kind: 'W07_ENTITLEMENT', mandatory: true, validityRule: null }] });
    expect(evaluateCompletion(noValidityRule).state).toBe('PENDING_EVIDENCE');
  });
  it('requires evidence and rejects ambiguous versions rather than choosing latest/best', () => {
    expect(evaluateCompletion({ ...fixture(), evidence: [attendance, entitlement] }).state).toBe('PENDING_EVIDENCE');
    expect(evaluateCompletion({ ...fixture(), evidence: [grade, { ...grade, ref: { ...grade.ref, revision: 'newer' } }, attendance, entitlement] }).state).toBe('PENDING_EVIDENCE');
  });
  it.each(['enrollmentId', 'classOfferingId', 'courseVersionId'] as const)('rejects foreign %s even with the selected evidence ID', key => {
    const input = withGrade({ scope: { ...scope, [key]: 'foreign' } });
    expect(writing(input)?.reason).toBe('EVIDENCE_SCOPE_MISMATCH');
    expect(writing(input)?.evidenceRef).toBeNull();
    expect(evaluateCompletion(input).state).toBe('PENDING_EVIDENCE');
  });
  it('assesses two classes of the same course independently without pooling their grades', () => {
    const otherScope = { ...scope, enrollmentId: 'enrollment-B', classOfferingId: 'class-B' };
    const b: CompletionInput = { ...fixture(), scope: otherScope,
      evidence: [{ ...grade, scope: otherScope, value: 0 }, { ...attendance, scope: otherScope }, { ...entitlement, scope: otherScope }] };
    expect(evaluateCompletion(fixture()).state).toBe('ELIGIBLE_FOR_REVIEW');
    expect(evaluateCompletion(b).state).toBe('NOT_ELIGIBLE');
    expect(evaluateCompletion({ ...b, evidence: [grade, ...b.evidence.slice(1)] }).state).toBe('PENDING_EVIDENCE');
  });
  it('rejects evidence revision, kind, scale and academic-resolution mismatches', () => {
    expect(writing(withGrade({ ref: { ...grade.ref, revision: 'stale' } }))?.reason).toBe('EVIDENCE_REVISION_MISMATCH');
    expect(evaluateCompletion({ ...fixture(), evidencePins: {} }).state).toBe('PENDING_EVIDENCE');
    for (const change of [{ scale: 'other' }, { selectionRuleRef: rule('other').ref },
      { roundingRuleRef: rule('other').ref }])
      expect(evaluateCompletion(withGrade(change)).state).toBe('PENDING_EVIDENCE');
    expect(evaluateCompletion({ ...fixture(), evidence: [{ ...attendance, criterionId: 'writing', ref: grade.ref }, attendance, entitlement] }).state).toBe('PENDING_EVIDENCE');
  });
  it('uses only official attendance and approved corrections under the pinned calculation', () => {
    for (const modified of [
      { ...attendance, state: 'PENDING' as const }, { ...attendance, outcome: 'UNKNOWN' as const },
      { ...attendance, sessionRefs: [] }, { ...attendance, receiptRefs: [], corrections: [] },
      { ...attendance, calculationRuleRef: rule('other').ref },
      { ...attendance, corrections: [{ ...attendance.corrections[0], state: 'PENDING' as const }] },
      { ...attendance, corrections: [{ ...attendance.corrections[0], approval: null }] },
    ]) expect(evaluateCompletion({ ...fixture(), evidence: [grade, modified, entitlement] }).state).toBe('PENDING_EVIDENCE');
    expect(evaluateCompletion({ ...fixture(), evidence: [grade, { ...attendance, outcome: 'NOT_MET' }, entitlement] }).state).toBe('NOT_ELIGIBLE');
  });
  it('requires authorized entitlement and never guesses its effective-time validity', () => {
    for (const modified of [{ ...entitlement, authorizationRef: null },
      { ...entitlement, outcome: 'UNKNOWN' as const }, { ...entitlement, state: 'PENDING' as const },
      { ...entitlement, validityRuleRef: rule('other').ref }])
      expect(evaluateCompletion({ ...fixture(), evidence: [grade, attendance, modified] }).state).toBe('PENDING_EVIDENCE');
    expect(evaluateCompletion({ ...fixture(), evidence: [grade, attendance, { ...entitlement, outcome: 'INVALID' }] }).state).toBe('NOT_ELIGIBLE');
  });
  it('does not hide a confirmed mandatory failure behind missing evidence', () => {
    expect(evaluateCompletion({ ...withGrade({ value: 0 }), evidence: [{ ...grade, value: 0 }, entitlement] }).state).toBe('NOT_ELIGIBLE');
  });
  it('does not let optional missing evidence block satisfied mandatory criteria', () => {
    expect(evaluateCompletion(withPolicy({ criteria: [...policy.criteria,
      { ...gradeCriterion, id: 'optional-extra', mandatory: false }] })).state).toBe('ELIGIBLE_FOR_REVIEW');
  });
  const exemption = () => ({ criterionId: 'writing', scope, ref: { id: 'exemption', revision: 'v1' },
    policyRef: policy.ref, ruleRef: rule('approved-exemption-rule').ref, state: 'APPROVED' as const, approval });
  it('returns NOT_APPLICABLE only for a policy-authorized, approved, scoped exemption', () => {
    const input = { ...withGradeRule({ exemptionRule: rule('approved-exemption-rule') }),
      exemptions: [exemption()], evidence: [attendance, entitlement] };
    expect(writing(input)?.status).toBe('NOT_APPLICABLE');
    expect(evaluateCompletion(input).state).toBe('ELIGIBLE_FOR_REVIEW');
  });
  it('rejects unapproved/foreign/stale/duplicate exemptions and cannot exempt entitlement', () => {
    expect(evaluateCompletion({ ...fixture(), exemptions: [exemption()] }).state).toBe('PENDING_EVIDENCE');
    const base = withGradeRule({ exemptionRule: rule('approved-exemption-rule') });
    for (const e of [{ ...exemption(), approval: null }, { ...exemption(), state: 'PENDING' as const },
      { ...exemption(), scope: { ...scope, enrollmentId: 'other' } },
      { ...exemption(), policyRef: { ...policy.ref, revision: 'old' } },
      { ...exemption(), ruleRef: rule('different').ref }])
      expect(writing({ ...base, exemptions: [e] })?.reason).toBe('INVALID_EXEMPTION');
    expect(evaluateCompletion({ ...base, exemptions: [exemption(), exemption()] }).state).toBe('PENDING_EVIDENCE');
    expect(evaluateCompletion({ ...base, exemptions: [{ ...exemption(), criterionId: 'entitlement' }] }).state).toBe('PENDING_EVIDENCE');
  });
  it('is deterministic and does not mutate or retain mutable references to its inputs', () => {
    const input = fixture(), before = structuredClone(input);
    function freeze(x: object) { Object.freeze(x); for (const v of Object.values(x)) if (v && typeof v === 'object') freeze(v); }
    freeze(input);
    expect(evaluateCompletion(input)).toEqual(evaluateCompletion(input));
    expect(input).toEqual(before);
    expect(evaluateCompletion(input).policyRef).not.toBe(input.policy?.ref);
    expect(evaluateCompletion(input).criteria[0].evidenceRef).not.toBe(input.evidence[0].ref);
  });
});
