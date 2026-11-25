/** W10-DF-S1: inert data contracts, not authenticated capabilities or DB schema. */
export interface Revision {
  readonly id: string;
  readonly revision: string;
}
export type BusinessRole =
  | 'STUDENT'
  | 'INSTRUCTOR'
  | 'COUNSELOR'
  | 'ACADEMIC_MANAGER'
  | 'CASHIER'
  | 'TEACHING_INSPECTOR'
  | 'SYSTEM_ADMIN';
export type ScopeKind =
  | 'LEARNER'
  | 'CLASS'
  | 'PROGRAM'
  | 'SUPPORT_QUEUE'
  | 'LEDGER'
  | 'INSPECTION'
  | 'STAFF'
  | 'TECHNICAL'
  | 'CMS';
/** Supplied by future authenticated server resolution, not a client role/filter. No wildcard. */
export interface ResourceScope {
  readonly kind: ScopeKind;
  readonly id: string;
}
export interface StaffOrLearner {
  readonly principalId: string;
  readonly personId: string;
  readonly role: BusinessRole;
  readonly sessionRef: Revision;
  readonly sessionState: 'AUTHENTICATED' | 'EXPIRED' | 'UNKNOWN';
}
export type Permission =
  | 'cms.draft'
  | 'cms.review'
  | 'cms.publish'
  | 'ops.config.change'
  | 'ops.audit.read'
  | 'report.view'
  | 'report.export';
export interface GrantRead {
  readonly ref: Revision;
  readonly principalId: string;
  readonly permission: Permission;
  readonly scope: ResourceScope;
  readonly state: 'ACTIVE' | 'REVOKED' | 'UNKNOWN';
  readonly validity: 'VALID' | 'INVALID' | 'UNKNOWN';
  readonly authorityEpoch: string;
  readonly decisionRef: Revision;
  readonly authorityRef: Revision;
}
export interface ScopedAccess {
  readonly actor: StaffOrLearner;
  readonly selectedGrant: GrantRead;
  readonly currentGrant: GrantRead;
  readonly scope: ResourceScope;
}
export interface OfflineAssurance {
  readonly assurance: 'OFFLINE_CONSISTENCY_ONLY';
  readonly runtimeAuthorized: false;
  readonly requiresServerVerification: true;
}
export interface GuardResult extends OfflineAssurance {
  readonly decision: 'CONDITIONS_MET_OFFLINE' | 'BLOCKED' | 'DENIED';
  readonly reason: string;
}
export interface ApprovedPolicy {
  readonly ref: Revision;
  readonly state: 'APPROVED' | 'DRAFT' | 'UNKNOWN';
  readonly approvalRef: Revision | null;
}

export type CmsState = 'DRAFT' | 'IN_REVIEW' | 'PUBLISHED' | 'REJECTED' | 'WITHDRAWN';
export type CmsAction = 'EDIT_DRAFT' | 'SUBMIT_REVIEW' | 'PUBLISH' | 'REJECT' | 'WITHDRAW';
export interface CmsRevision {
  readonly ref: Revision;
  readonly contentId: string;
  readonly state: CmsState;
  readonly parentRef: Revision | null;
  readonly authorPersonIds: readonly string[];
  readonly authorshipComplete: boolean;
  readonly assetClearance: 'APPROVED' | 'REJECTED' | 'UNKNOWN';
  readonly licensingDecisionRef: Revision | null;
}
export interface CmsModerationCheck {
  readonly access: ScopedAccess;
  readonly action: CmsAction;
  readonly revision: CmsRevision;
  readonly expectedRevision: Revision;
  readonly parent: { readonly ref: Revision; readonly contentId: string } | null;
  /** Specific content classes/withdrawal authority require an approved scoped rule. */
  readonly policy: ApprovedPolicy & {
    readonly scope: ResourceScope;
    readonly actions: readonly CmsAction[];
  };
  readonly reasonRef: Revision | null;
}

export interface ConfigChangeCheck {
  readonly access: ScopedAccess;
  readonly requestRef: Revision;
  readonly settingCode: string;
  readonly policy: ApprovedPolicy & {
    readonly scope: ResourceScope;
    readonly allowedSettingCodes: readonly string[];
  };
  readonly sensitivity: 'ORDINARY' | 'SENSITIVE' | 'UNKNOWN';
  /** Future independently verified approval; no actual config values accepted. */
  readonly sensitiveApproval: {
    readonly ref: Revision;
    readonly requestRef: Revision;
    readonly policyRef: Revision;
    readonly approverPersonId: string;
    readonly authorityRuleRef: Revision;
  } | null;
}
export type HealthState = 'HEALTHY' | 'DEGRADED' | 'UNAVAILABLE' | 'UNKNOWN';
export type ProviderState = 'CONNECTED' | 'UNCONFIGURED' | 'UNVERIFIED';
/** Describes future source obligations; S1 has no reader authenticating these fields. */
export interface ProviderObservationContract {
  readonly ref: Revision;
  readonly observedAt: string;
  readonly scope: ResourceScope;
  readonly health: HealthState;
  readonly provider: ProviderState;
  readonly observerAuthorityRef: Revision;
  readonly observationPolicyRef: Revision;
}
export interface SafeOperationsStatus extends OfflineAssurance {
  readonly configuration: 'UNCONFIGURED' | 'UNVERIFIED';
  readonly health: 'UNKNOWN';
  readonly reason: 'NO_AUTHENTICATED_OBSERVATION';
}
export interface OpsAuditReadContract {
  readonly ref: Revision;
  readonly scope: ResourceScope;
  readonly occurredAt: string;
  readonly eventCode: string;
  readonly actorPseudonym: string | null;
  readonly fieldPolicyRef: Revision;
  readonly sourceRevision: Revision;
  // No raw message/secret payload, update or delete operation.
}

export type SourceDomain =
  | 'LEARNING'
  | 'PUBLISHED_OUTCOME'
  | 'TEACHING'
  | 'CLASS_ATTENDANCE'
  | 'SUPPORT'
  | 'CONSULTATION'
  | 'ACADEMIC'
  | 'FINANCE'
  | 'INSPECTION'
  | 'STAFF_SHIFT'
  | 'ACCOUNTS'
  | 'SECURITY_OPS'
  | 'COMPLETION'
  | 'CERTIFICATE';
export type SourceWave =
  'W01' | 'W02' | 'W03' | 'W04' | 'W05A' | 'W05B' | 'W06' | 'W07' | 'W08' | 'W09';
export type EvidenceState = 'CONFIRMED' | 'PENDING' | 'UNVERIFIED' | 'UNAVAILABLE' | 'UNKNOWN';
export type Completeness = 'COMPLETE' | 'PARTIAL' | 'UNKNOWN';
export interface RoleProjectionContract {
  readonly role: BusinessRole;
  readonly domains: readonly SourceDomain[];
  readonly scopeKinds: readonly ScopeKind[];
}
export interface CenterDayRequest {
  readonly date: string;
  readonly timeZone: string;
  readonly configurationRef: Revision;
}
export interface CenterDayWindow extends OfflineAssurance {
  readonly date: string;
  readonly timeZone: 'Asia/Ho_Chi_Minh';
  readonly startAt: string;
  readonly endExclusive: string;
  readonly configurationRef: Revision;
}
export type DayResolution =
  | { readonly status: 'RESOLVED'; readonly window: CenterDayWindow }
  | {
      readonly status: 'BLOCKED';
      readonly reason: 'DATE_INVALID' | 'TIMEZONE_UNSUPPORTED_OR_UNCONFIGURED';
    };
export interface MetricDefinition extends ApprovedPolicy {
  readonly code: string;
  readonly role: BusinessRole;
  readonly domain: SourceDomain;
  readonly sourceWave: SourceWave;
  readonly required: boolean;
  readonly scope: ResourceScope;
  readonly statusPredicateRef: Revision;
  readonly confirmationRuleRef: Revision;
  readonly effectiveTimeRuleRef: Revision;
  readonly expectedSourcePin: Revision;
}
export interface SourceMetricClaim {
  readonly metricCode: string;
  readonly sourceRef: Revision;
  readonly scope: ResourceScope;
  readonly domain: SourceDomain;
  readonly sourceWave: SourceWave;
  readonly effectiveAt: string;
  readonly evidenceState: EvidenceState;
  readonly completeness: Completeness;
  readonly value: number | null;
  readonly supersedesRef: Revision | null;
  /** Deliberately no authenticated/verified:true field. */
  readonly provenance: 'OFFLINE_SYNTHETIC' | 'UNVERIFIED';
}
export interface ProjectedMetric {
  readonly code: string;
  readonly sourcePin: Revision | null;
  readonly evidenceState: Exclude<EvidenceState, 'CONFIRMED'>;
  readonly value: null;
  readonly completeness: 'PARTIAL' | 'UNKNOWN';
  readonly reason: string;
}
export interface DailyProjection extends OfflineAssurance {
  readonly guard: GuardResult;
  readonly role: BusinessRole | null;
  readonly window: CenterDayWindow | null;
  readonly metrics: readonly ProjectedMetric[];
  readonly completeness: 'INCOMPLETE';
}
export interface DailyProjectionCheck {
  readonly access: ScopedAccess;
  readonly day: CenterDayRequest;
  readonly definitions: readonly MetricDefinition[];
  readonly sources: readonly SourceMetricClaim[];
}
export type Masking = 'FULL' | 'MASKED' | 'OMITTED';
export interface ExportField {
  readonly code: string;
  readonly masking: Masking;
  readonly classification: 'PUBLIC' | 'PRIVATE' | 'SECRET' | 'UNKNOWN';
}
export interface ReportViewContract {
  readonly viewerPrincipalId: string;
  readonly role: BusinessRole;
  readonly scope: ResourceScope;
  readonly day: CenterDayRequest;
  readonly manifestRef: Revision;
  readonly metricCodes: readonly string[];
  readonly statusFilters: readonly EvidenceState[];
  readonly fields: readonly ExportField[];
  readonly requiredSourcesComplete: boolean;
}
export interface ExportParityCheck {
  readonly viewAccessNow: ScopedAccess;
  readonly exportAccessNow: ScopedAccess;
  readonly view: ReportViewContract;
  readonly requested: Omit<ReportViewContract, 'requiredSourcesComplete'>;
  readonly currentManifestRef: Revision;
  readonly auditCorrelationRef: Revision | null;
  readonly format: 'CSV' | 'XLSX' | 'PDF';
}
export interface ExportPreflight extends OfflineAssurance {
  readonly guard: GuardResult;
  readonly exportPerformed: false;
  readonly auditRequired: true;
  readonly auditPersisted: false;
  readonly reportCompleteness: 'INCOMPLETE';
}
