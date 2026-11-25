import type {
  ApprovedPolicy,
  ConfigChangeCheck,
  GuardResult,
  OpsAuditReadContract,
  ResourceScope,
  Revision,
  SafeOperationsStatus,
  ScopedAccess,
} from './operations.contracts';
import type { SourceLineageRead } from './operations-source.contracts';

export interface ConfigurationPreflightRequest {
  readonly settingCode: string;
  readonly requestRef: Revision;
}
interface TechnicalReadBase {
  readonly manifestRef: Revision;
  readonly lineagePin: Revision;
  readonly sourceRevision: Revision;
  readonly sourceConfirmationRuleRef: Revision;
  readonly policyApprovalRuleRef: Revision;
  readonly scope: ResourceScope;
  readonly completeness: 'COMPLETE' | 'INCOMPLETE' | 'UNKNOWN';
}
/** No configuration value, URL, credential or provider client belongs here. */
export interface ConfigurationPreflightRead extends TechnicalReadBase {
  readonly binding: ConfigurationPreflightRequest;
  readonly check: Omit<ConfigChangeCheck, 'access' | 'settingCode' | 'requestRef'>;
  readonly configured: boolean | null;
}
export interface TechnicalAuditRead extends TechnicalReadBase {
  readonly sourceWave: 'W01';
  readonly fieldPolicy: ApprovedPolicy & {
    readonly scope: ResourceScope;
    readonly allowedEventCodes: readonly string[];
  };
  readonly records: readonly OpsAuditReadContract[];
}
/** NEW integration requirements, not existing W01 API methods. There is no
 * runtime-verified implementation or writable repository in this batch.
 * Future server integration must supply scoped immutable W01 audit history,
 * independently authorized policy/confirmation lineage, coherent revisions and
 * an atomic revocation fence. In-memory rows and markers cannot prove these.
 */
export interface OperationsTechnicalSourcePort {
  readonly mode: 'UNIMPLEMENTED' | 'IN_MEMORY_ONLY';
  readConfigurationPreflight(
    binding: ScopedAccess,
    request: ConfigurationPreflightRequest,
  ): Promise<ConfigurationPreflightRead | null>;
  readAudit(binding: ScopedAccess): Promise<TechnicalAuditRead | null>;
  readLineage(
    binding: ScopedAccess,
    manifestRef: Revision,
    lineagePin: Revision,
  ): Promise<SourceLineageRead | null>;
  readCurrentHead(
    binding: ScopedAccess,
    kind: 'CONFIGURATION' | 'AUDIT',
    selector: string,
  ): Promise<Revision | null>;
}
export interface ConfigurationPreflightResult {
  readonly guard: GuardResult;
  readonly setting: {
    readonly code: string;
    readonly sensitivity: 'ORDINARY';
    readonly status: SafeOperationsStatus;
  } | null;
  readonly changePerformed: false;
  readonly auditRequired: true;
  readonly auditPersisted: false;
  readonly runtimeAuthorized: false;
}
export interface TechnicalAuditResult {
  readonly guard: GuardResult;
  readonly records: readonly {
    readonly ref: Revision;
    readonly eventCode: string;
    readonly occurredAt: string;
    readonly sourceRevision: Revision;
    readonly evidenceState: 'UNVERIFIED';
  }[];
  readonly completeness: 'INCOMPLETE';
  readonly confirmedEventCount: null;
  readonly historyModified: false;
  readonly runtimeAuthorized: false;
}
