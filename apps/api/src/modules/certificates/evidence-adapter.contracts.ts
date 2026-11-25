import type {
  AcademicApproval,
  CompletionEvidence,
  CompletionPolicy,
  CompletionScope,
  EvidenceReference,
} from './completion.contracts';

/** Runtime separation from JSON, NOT an authentication mechanism or grant.
 * Only a future authenticated server read boundary may attach this key AFTER
 * verifying the records, decisions, rules and snapshot completeness. S2 provides
 * no factory/loader that turns client assertions into verified provenance.
 */
export const SERVER_READ_SNAPSHOT: unique symbol = Symbol('W09_SERVER_READ_SNAPSHOT');

export interface EvidenceIdentity extends CompletionScope {
  readonly learnerId: string;
}

interface ProjectionBase {
  readonly ref: EvidenceReference;
  readonly identity: EvidenceIdentity;
  readonly courseVersionRef: EvidenceReference;
  readonly policyRef: EvidenceReference;
}

/** Narrow read projections, not HTTP DTOs or Prisma models. Foreign keys and
 * CourseVersion/enrollment associations require actual server-side joins later.
 */
export interface W03Projection extends ProjectionBase {
  readonly source: 'W03_ASSIGNMENT' | 'W03_QUIZ';
  readonly activityRevisionRef: EvidenceReference;
  readonly state: string;
  readonly confirmedAt: string | null;
  readonly publishedAt: string | null;
  readonly publishedById: string | null;
  readonly publicationDecisionRef: EvidenceReference | null;
  readonly makerIds: readonly string[];
  readonly value: number | null;
  readonly scale: string;
}

export interface W06CorrectionProjection {
  readonly ref: EvidenceReference;
  readonly learnerId: string;
  readonly windowRef: EvidenceReference;
  readonly state: string;
  readonly baseVersion: number;
  readonly revision: number | null;
  readonly beforeStatus: string;
  readonly requestedStatus: string;
  readonly makerId: string;
  readonly reviewerId: string | null;
  readonly reviewedAt: string | null;
  readonly decisionRef: EvidenceReference | null;
}

export interface W06SessionProjection {
  readonly ref: EvidenceReference;
  readonly classOfferingId: string;
  readonly courseVersionRef: EvidenceReference;
  readonly state: string;
  readonly windowRef: EvidenceReference;
  readonly receipt: {
    readonly ref: EvidenceReference;
    readonly learnerId: string;
    readonly windowRef: EvidenceReference;
    readonly state: 'ACCEPTED' | 'PROVISIONAL' | 'UNKNOWN';
    readonly status: string;
    readonly acceptedAt: string | null;
  } | null;
  /** Must be the complete history, not just the latest row. */
  readonly corrections: readonly W06CorrectionProjection[];
}

export interface W06Projection extends ProjectionBase {
  readonly source: 'W06_LEARNER_ATTENDANCE' | 'TEACHER_HOURS' | 'MEET_CLICK';
  readonly historyComplete: boolean;
  readonly sessions: readonly W06SessionProjection[];
}

export interface W07Projection extends ProjectionBase {
  readonly source: 'W07_ENTITLEMENT';
  readonly entitlementOutcome: string;
  readonly entitlementEnrollmentId: string | null;
  readonly enrollmentStatus: string;
  readonly application: {
    readonly ref: EvidenceReference;
    readonly learnerId: string;
    readonly classOfferingId: string;
    readonly courseVersionRef: EvidenceReference;
    readonly state: string;
    readonly academicDecisionRef: EvidenceReference | null;
  };
}

export type EvidenceProjection = W03Projection | W06Projection | W07Projection;

export interface DecisionProvenance {
  readonly ref: EvidenceReference;
  readonly subjectRef: EvidenceReference;
  readonly purpose:
    'COURSE_VERSION' | 'POLICY' | 'RULE' | 'W03_PUBLICATION' | 'W06_CORRECTION' | 'W07_ADMISSION';
  readonly scope: 'COURSE_VERSION' | 'CLASS';
  readonly scopeId: string;
  readonly state: 'APPROVED' | 'REJECTED' | 'UNKNOWN';
  readonly actorId: string;
  readonly decidedAt: string;
  /** Independently resolved authorization evidence, NOT an actor's role claim. */
  readonly authorityRef: EvidenceReference;
}

export interface AcademicResolution {
  readonly ref: EvidenceReference;
  readonly kind: 'W03_GRADE' | 'W06_ATTENDANCE' | 'W07_ENTITLEMENT';
  readonly criterionId: string;
  readonly identity: EvidenceIdentity;
  readonly policyRef: EvidenceReference;
  readonly ruleRefs: readonly EvidenceReference[];
  /** Exact input set, including official sessions/receipts/approved corrections. */
  readonly sourceRefs: readonly EvidenceReference[];
  readonly outcome: 'RESOLVED' | 'SATISFIED' | 'NOT_MET' | 'VALID' | 'INVALID' | 'UNKNOWN';
  readonly normalizedValue: number | null;
  readonly scale: string | null;
}

export interface ServerReadSnapshot {
  readonly [SERVER_READ_SNAPSHOT]: true;
  readonly identity: EvidenceIdentity;
  readonly policyRef: EvidenceReference;
  readonly courseVersionRef: EvidenceReference;
  readonly enrollment: {
    readonly id: string;
    readonly learnerId: string;
    readonly classOfferingId: string;
  };
  readonly records: readonly EvidenceProjection[];
  readonly decisions: readonly DecisionProvenance[];
  readonly resolutions: readonly AcademicResolution[];
}

export interface EvidenceAdapterContext {
  readonly identity: EvidenceIdentity;
  readonly policy: CompletionPolicy | null;
  readonly policyPin: EvidenceReference;
  readonly courseVersionPin: EvidenceReference;
  readonly criterionId: string;
  readonly sourcePin: EvidenceReference;
  readonly snapshot: ServerReadSnapshot | null;
}

export type AdapterReason =
  | 'MALFORMED_SOURCE'
  | 'UNVERIFIED_PROVENANCE'
  | 'IDENTITY_MISMATCH'
  | 'STALE_REVISION'
  | 'SOURCE_CONTRADICTION'
  | 'POLICY_UNRESOLVED'
  | 'RULE_UNRESOLVED'
  | 'DECISION_REJECTED'
  | 'NOT_PUBLISHED_FINAL'
  | 'INSUFFICIENT_EVIDENCE'
  | 'UNSUPPORTED_SOURCE'
  | 'CORRECTION_CONFLICT'
  | 'INCOMPLETE_CORRECTION_HISTORY'
  | 'NORMALIZED';

export interface EffectiveAttendance {
  readonly sessionRef: EvidenceReference;
  readonly status: string;
  readonly version: number;
  readonly correctionRef: EvidenceReference | null;
}

export interface EvidenceAdapterResult {
  readonly status: 'NORMALIZED' | 'PENDING' | 'REJECTED';
  readonly reason: AdapterReason;
  readonly evidence: CompletionEvidence | null;
  readonly effectiveAttendance: readonly EffectiveAttendance[];
  /** S2 verifies consistency against supplied server facts, not their real-world authenticity. */
  readonly assurance: 'OFFLINE_CONSISTENCY_ONLY';
  readonly serverIntegrationRequired: true;
}

export type ApprovalClaim = AcademicApproval;
