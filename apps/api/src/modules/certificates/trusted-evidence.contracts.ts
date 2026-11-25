import type {
  CompletionCriterion,
  CompletionPolicy,
  CompletionResult,
  CourseVersionEvidence,
  EvidenceReference,
} from './completion.contracts';
import type {
  AcademicResolution,
  AdapterReason,
  DecisionProvenance,
  EvidenceIdentity,
  W03Projection,
  W06Projection,
  W07Projection,
} from './evidence-adapter.contracts';

/** Obtained from server session authentication, never from request body/role flags.
 * These ports describe obligations; S3A implements NO authentication or DB reader.
 */
export interface ServerReadPrincipal {
  readonly id: string;
  readonly sessionId: string;
}

/** Selectors only. No source rows, approvals, S2 results, grants or markers accepted. */
export interface CompletionReadRequest {
  readonly identity: EvidenceIdentity;
  readonly courseVersionPin: EvidenceReference;
  readonly policyPin: EvidenceReference;
}

export interface ReadAuthorization {
  readonly state: 'AUTHORIZED' | 'DENIED' | 'UNKNOWN';
  readonly principal: ServerReadPrincipal;
  readonly identity: EvidenceIdentity;
  readonly decisionRef: EvidenceReference;
  readonly authorityRef: EvidenceReference;
  /** Changes when relevant sessions/grants/scope change; not a role string. */
  readonly authorityEpoch: string;
}

export interface CompletionReadAccessRepository {
  authorizeRead(
    principal: ServerReadPrincipal,
    request: CompletionReadRequest,
  ): Promise<ReadAuthorization>;
}

export interface SourceSelection {
  readonly criterionId: string;
  readonly kind: CompletionCriterion['kind'];
  /** Null is an authoritatively observed absence, not a default passing row. */
  readonly sourcePin: EvidenceReference | null;
}

/** Same authorized, coherent view for all read ports. Ref must change even for
 * A→B→A transitions (ABA). Cover enrollment/version, policy, publication,
 * corrections, entitlement, approval lineage and academic resolutions. S3B must
 * implement this with actual snapshot/head validation, not fixture approved:true.
 */
export interface CompletionReadManifest {
  readonly ref: EvidenceReference;
  readonly identity: EvidenceIdentity;
  readonly courseVersionPin: EvidenceReference;
  readonly policyPin: EvidenceReference;
  readonly bindingPin: EvidenceReference;
  readonly lineagePin: EvidenceReference;
  readonly selections: readonly SourceSelection[];
}

export interface ScopedRead<T> {
  readonly manifestRef: EvidenceReference;
  readonly revisionRef: EvidenceReference;
  readonly completeness: 'COMPLETE' | 'INCOMPLETE' | 'UNKNOWN';
  readonly value: T | null;
}

export interface EnrollmentEvidenceBinding {
  readonly identity: EvidenceIdentity;
  readonly enrollment: {
    readonly id: string;
    readonly learnerId: string;
    readonly classOfferingId: string;
  };
  readonly classOffering: {
    readonly id: string;
    readonly courseVersionRef: EvidenceReference;
  };
  readonly courseVersion: CourseVersionEvidence;
}

export interface ScopeEvidenceRepository {
  readBinding(manifest: CompletionReadManifest): Promise<ScopedRead<EnrollmentEvidenceBinding>>;
}
export interface CompletionPolicyReadRepository {
  readPolicy(manifest: CompletionReadManifest): Promise<ScopedRead<CompletionPolicy>>;
}
export interface ApprovalLineageRepository {
  /** Independently read decisions/authorization and explicit approved-rule
   * resolutions, not copies of the projection's asserted approval fields.
   */
  readLineage(manifest: CompletionReadManifest): Promise<
    ScopedRead<{
      readonly decisions: readonly DecisionProvenance[];
      readonly resolutions: readonly AcademicResolution[];
    }>
  >;
}
export interface W03PublishedEvidenceRepository {
  /** Join immutable submitted revision, final grade/attempt and publication lineage.
   * Must not instantiate quiz services or invoke their expiry sweeps.
   */
  readPublishedGrade(
    manifest: CompletionReadManifest,
    selection: SourceSelection,
  ): Promise<ScopedRead<W03Projection>>;
}
export interface W06OfficialEvidenceRepository {
  /** Exhaustive official session/window/receipt and correction chain; no Meet clicks/W08 hours. */
  readOfficialAttendance(
    manifest: CompletionReadManifest,
    selection: SourceSelection,
  ): Promise<ScopedRead<W06Projection>>;
}
export interface W07EntitlementEvidenceRepository {
  /** Actual enrollment/application/decision links; no inferred historical validity. */
  readEntitlement(
    manifest: CompletionReadManifest,
    selection: SourceSelection,
  ): Promise<ScopedRead<W07Projection>>;
}

export interface CompletionReadSession {
  readManifest(): Promise<CompletionReadManifest>;
  readonly scope: ScopeEvidenceRepository;
  readonly policies: CompletionPolicyReadRepository;
  readonly lineage: ApprovalLineageRepository;
  readonly w03: W03PublishedEvidenceRepository;
  readonly w06: W06OfficialEvidenceRepository;
  readonly w07: W07EntitlementEvidenceRepository;
  /** Release this scoped read handle on success/failure; no mutation/lifecycle command. */
  close(): Promise<void>;
}

/** Server DI only; never built/deserialized from an HTTP request. No implementation here. */
export interface TrustedEvidenceRepositories {
  readonly access: CompletionReadAccessRepository;
  openRead(
    authorization: ReadAuthorization,
    request: CompletionReadRequest,
  ): Promise<CompletionReadSession>;
}

export type TrustedReadReason =
  | 'ASSESSED'
  | 'INVALID_REQUEST'
  | 'READ_DENIED'
  | 'UNVERIFIED_AUTHORIZATION'
  | 'SCOPE_MISMATCH'
  | 'STALE_READ'
  | 'INCOMPLETE_READ'
  | 'CONTRADICTORY_READ'
  | 'POLICY_UNRESOLVED'
  | 'SOURCE_REJECTED'
  | 'READ_BOUNDARY_FAILURE';

export interface TrustedCompletionReadResult {
  readonly status: 'ASSESSED' | 'PENDING' | 'REJECTED' | 'DENIED';
  readonly reason: TrustedReadReason;
  readonly assessment: CompletionResult | null;
  readonly manifestRef: EvidenceReference | null;
  readonly diagnostics: readonly { readonly criterionId: string; readonly reason: AdapterReason }[];
  /** Even a successful in-memory composition is not authenticated DB verification. */
  readonly assurance: 'OFFLINE_REPOSITORY_CONTRACT_ONLY';
  readonly runtimeVerified: false;
  readonly serverIntegrationRequired: true;
}
