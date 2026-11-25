import type {
  ApprovedRule,
  CompletionPolicy,
  CourseVersionEvidence,
  EvidenceReference,
} from './completion.contracts';
import type { EvidenceIdentity } from './evidence-adapter.contracts';
import type {
  CompletionReadRequest,
  TrustedCompletionReadResult,
} from './trusted-evidence.contracts';

/** A server must authenticate canonical person identity independently of account,
 * role and session IDs. These are data contracts, not authenticated capabilities.
 */
export interface CertificateStaffIdentity {
  readonly principalId: string;
  readonly personId: string;
  readonly role: string;
  readonly sessionRef: EvidenceReference;
}

export interface CertificateGrantRead {
  readonly ref: EvidenceReference;
  readonly principalId: string;
  readonly capability: 'certificate.review' | 'certificate.issue';
  readonly classOfferingId: string;
  readonly state: 'ACTIVE' | 'REVOKED' | 'UNKNOWN';
  /** Resolved by future server authority, never inferred from a client clock. */
  readonly validity: 'VALID' | 'INVALID' | 'UNKNOWN';
  readonly authorityEpoch: string;
  readonly decision: {
    readonly ref: EvidenceReference;
    readonly authorityRef: EvidenceReference;
    readonly requestedByPersonId: string;
    readonly approvedByPersonId: string;
  };
}

export interface CertificateActorRead {
  readonly identity: CertificateStaffIdentity;
  readonly sessionState: 'AUTHENTICATED' | 'EXPIRED' | 'UNKNOWN';
  readonly authorization: 'AUTHORIZED' | 'DENIED' | 'UNKNOWN';
  readonly grant: CertificateGrantRead | null;
}

/** Carries the exact request binding that S3A's result alone does not include
 * (notably learnerId). A future authenticated reader must establish this binding.
 */
export interface ScopedCompletionAssessment {
  readonly request: CompletionReadRequest;
  readonly result: TrustedCompletionReadResult;
}

export interface CertificateHoldsRead {
  readonly ref: EvidenceReference;
  readonly identity: EvidenceIdentity;
  readonly policyRef: EvidenceReference;
  readonly manifestRef: EvidenceReference;
  /** No hold/appeal semantics are invented here. Missing approved rule blocks. */
  readonly governingRule: ApprovedRule | null;
  readonly completeness: 'COMPLETE' | 'INCOMPLETE' | 'UNKNOWN';
  readonly conflicts: 'NONE' | 'PRESENT' | 'UNKNOWN';
}

export interface CertificateReviewContext {
  readonly assessment: ScopedCompletionAssessment;
  readonly courseVersion: CourseVersionEvidence | null;
  readonly policy: CompletionPolicy | null;
  readonly academicRules: 'RESOLVED' | 'UNKNOWN';
  readonly holds: CertificateHoldsRead;
}

export interface CertificateReviewCheck {
  readonly target: CompletionReadRequest;
  readonly candidate: ScopedCompletionAssessment;
  readonly current: CertificateReviewContext;
  readonly actorAtSelection: CertificateActorRead;
  readonly actorNow: CertificateActorRead;
}

/** Input contract only: S4A never produces or persists a review decision.
 * State APPROVED or a reference supplied by a caller is not verified lineage.
 */
export interface PriorCertificateReview {
  readonly ref: EvidenceReference;
  readonly state: 'APPROVED' | 'REJECTED' | 'PENDING';
  readonly target: CompletionReadRequest;
  readonly manifestRef: EvidenceReference;
  readonly reviewerAtDecision: CertificateActorRead;
}

export interface CertificateIssuePreflight extends CertificateReviewCheck {
  readonly priorReview: PriorCertificateReview | null;
  readonly reviewerNow: CertificateActorRead | null;
}

export type CertificateGuardReason =
  | 'SIMULATED_ELIGIBLE'
  | 'MALFORMED_INPUT'
  | 'SCOPE_MISMATCH'
  | 'POLICY_UNRESOLVED'
  | 'EVIDENCE_UNAVAILABLE'
  | 'NOT_ELIGIBLE'
  | 'STALE_EVIDENCE'
  | 'CONTRADICTORY_ASSESSMENT'
  | 'EXEMPTION_UNVERIFIED'
  | 'HOLDS_UNRESOLVED'
  | 'CONFLICTING_HOLD'
  | 'ROLE_DENIED'
  | 'SESSION_INVALID'
  | 'GRANT_DENIED'
  | 'GRANT_UNVERIFIED'
  | 'AUTHORIZATION_CHANGED'
  | 'REVIEW_REQUIRED'
  | 'STALE_REVIEW'
  | 'SAME_PERSON_REVIEW_AND_ISSUE';

export interface CertificateGuardSimulation {
  readonly action: 'REVIEW' | 'ISSUE_PREFLIGHT';
  readonly decision: 'SIMULATED_ELIGIBLE' | 'BLOCKED' | 'DENIED';
  readonly reason: CertificateGuardReason;
  /** No output of these pure guards authorizes a real server operation. */
  readonly assurance: 'OFFLINE_AUTHORIZATION_SIMULATION_ONLY';
  readonly runtimeAuthorized: false;
  readonly requiresServerVerification: true;
}
