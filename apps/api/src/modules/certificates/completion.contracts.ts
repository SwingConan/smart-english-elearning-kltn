/** W09-DF-S1: inert, normalized contracts only. No source-service/ORM imports.
 * A future trusted adapter must verify authorization, current revisions and policy
 * applicability. These types and the pure evaluator are NOT an API trust boundary
 * or proof that a source is still current in a database.
 */
export interface EvidenceReference {
  readonly id: string;
  /** Immutable revision identifier/digest; does not assume every table has a revision column. */
  readonly revision: string;
}

export interface CompletionScope {
  readonly enrollmentId: string;
  readonly classOfferingId: string;
  readonly courseVersionId: string;
}

export interface AcademicApproval {
  readonly decisionId: string;
  readonly actorId: string;
  readonly approvedAt: string;
}

export interface ApprovedRule {
  readonly ref: EvidenceReference;
  readonly approval: AcademicApproval;
}

export interface CourseVersionEvidence {
  readonly ref: EvidenceReference;
  readonly state: 'APPROVED' | 'DRAFT' | 'UNKNOWN';
  readonly approval: AcademicApproval | null;
}

interface CriterionBase {
  readonly id: string;
  readonly mandatory: boolean;
}

export interface GradeCriterion extends CriterionBase {
  readonly kind: 'W03_GRADE';
  /** Supplied by an academically approved policy; no default or scale conversion. */
  readonly threshold: { readonly minimum: number; readonly scale: string } | null;
  readonly selectionRule: ApprovedRule | null;
  readonly roundingRule: ApprovedRule | null;
  readonly exemptionRule: ApprovedRule | null;
}

export interface AttendanceCriterion extends CriterionBase {
  readonly kind: 'W06_ATTENDANCE';
  /** Identifies approved numerator/denominator, makeup and exception semantics. */
  readonly calculationRule: ApprovedRule | null;
  readonly exemptionRule: ApprovedRule | null;
}

export interface EntitlementCriterion extends CriterionBase {
  readonly kind: 'W07_ENTITLEMENT';
  /** Historical/issue-time validity must be explicitly resolved, never guessed. */
  readonly validityRule: ApprovedRule | null;
}

export type CompletionCriterion = GradeCriterion | AttendanceCriterion | EntitlementCriterion;

export interface CompletionPolicy {
  readonly ref: EvidenceReference;
  readonly courseVersionRef: EvidenceReference;
  readonly state: 'APPROVED' | 'DRAFT' | 'REVOKED' | 'UNKNOWN';
  /** Approval covers this exact rule list and revision. */
  readonly approval: AcademicApproval | null;
  readonly applicabilityRule: ApprovedRule | null;
  readonly applicability: 'APPLICABLE' | 'NOT_APPLICABLE' | 'UNKNOWN';
  readonly criteria: readonly CompletionCriterion[];
}

interface EvidenceBase {
  readonly criterionId: string;
  readonly scope: CompletionScope;
  readonly ref: EvidenceReference;
}

export interface W03GradeEvidence extends EvidenceBase {
  readonly kind: 'W03_GRADE';
  readonly state: 'PUBLISHED' | 'FINAL' | 'PENDING' | 'PROVISIONAL' | 'UNKNOWN';
  /** FINAL alone is insufficient: release/authorization evidence is required. */
  readonly finalized: boolean;
  readonly publication: AcademicApproval | null;
  readonly selectionRuleRef: EvidenceReference;
  readonly roundingRuleRef: EvidenceReference;
  /** Value already resolved under the explicit rounding rule; null is not zero. */
  readonly value: number | null;
  readonly scale: string;
}

export interface W06AttendanceEvidence extends EvidenceBase {
  readonly kind: 'W06_ATTENDANCE';
  readonly state: 'OFFICIAL_CONFIRMED' | 'PENDING' | 'UNKNOWN';
  readonly sessionRefs: readonly EvidenceReference[];
  readonly receiptRefs: readonly EvidenceReference[];
  readonly corrections: readonly {
    readonly ref: EvidenceReference;
    readonly state: 'APPROVED' | 'PENDING' | 'REJECTED';
    readonly approval: AcademicApproval | null;
  }[];
  readonly calculationRuleRef: EvidenceReference;
  /** Adapter-resolved under that approved rule; this slice computes no attendance ratio. */
  readonly outcome: 'SATISFIED' | 'NOT_MET' | 'PENDING' | 'UNKNOWN';
}

export interface W07EntitlementEvidence extends EvidenceBase {
  readonly kind: 'W07_ENTITLEMENT';
  readonly state: 'AUTHORIZED' | 'PENDING' | 'UNKNOWN';
  readonly authorizationRef: EvidenceReference | null;
  readonly validityRuleRef: EvidenceReference;
  readonly outcome: 'VALID' | 'INVALID' | 'UNKNOWN';
}

export type CompletionEvidence = W03GradeEvidence | W06AttendanceEvidence | W07EntitlementEvidence;

export interface CompletionExemption {
  readonly criterionId: string;
  readonly scope: CompletionScope;
  readonly ref: EvidenceReference;
  readonly policyRef: EvidenceReference;
  readonly ruleRef: EvidenceReference;
  readonly state: 'APPROVED' | 'PENDING' | 'REVOKED';
  readonly approval: AcademicApproval | null;
}

export interface CompletionInput {
  readonly scope: CompletionScope;
  readonly courseVersion: CourseVersionEvidence | null;
  readonly courseVersionPin: EvidenceReference;
  readonly policy: CompletionPolicy | null;
  readonly policyPin: EvidenceReference;
  /** Pins belong to the evaluation snapshot, not to the shared CourseVersion policy. */
  readonly evidencePins: Readonly<Record<string, EvidenceReference | undefined>>;
  readonly evidence: readonly CompletionEvidence[];
  readonly exemptions: readonly CompletionExemption[];
}

export type CriterionStatus = 'SATISFIED' | 'NOT_MET' | 'PENDING' | 'NOT_APPLICABLE';
export type CompletionState = 'PENDING_EVIDENCE' | 'NOT_ELIGIBLE' | 'ELIGIBLE_FOR_REVIEW';
export type CompletionReason =
  | 'SCOPE_INVALID' | 'COURSE_VERSION_UNAPPROVED_OR_STALE' | 'POLICY_MISSING'
  | 'POLICY_UNAPPROVED_OR_STALE' | 'POLICY_INCOMPLETE' | 'RULE_UNRESOLVED'
  | 'EVIDENCE_MISSING_OR_AMBIGUOUS' | 'EVIDENCE_SCOPE_MISMATCH' | 'EVIDENCE_REVISION_MISMATCH'
  | 'EVIDENCE_UNCONFIRMED' | 'GRADE_BELOW_THRESHOLD' | 'GRADE_MEETS_THRESHOLD'
  | 'ATTENDANCE_NOT_MET' | 'ATTENDANCE_MET' | 'ENTITLEMENT_INVALID' | 'ENTITLEMENT_VALID'
  | 'INVALID_EXEMPTION' | 'APPROVED_EXEMPTION';

export interface CriterionResult {
  readonly criterionId: string;
  readonly mandatory: boolean;
  readonly status: CriterionStatus;
  readonly reason: CompletionReason;
  readonly evidenceRef: EvidenceReference | null;
}

export interface CompletionResult {
  readonly scope: CompletionScope;
  readonly state: CompletionState;
  readonly policyRef: EvidenceReference | null;
  readonly criteria: readonly CriterionResult[];
  readonly blockers: readonly CompletionReason[];
}
