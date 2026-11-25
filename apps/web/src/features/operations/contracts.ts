import type {
  BusinessRole,
  CmsState,
  EvidenceState,
  OpsAuditReadContract,
  ResourceScope,
  Revision,
  SourceMetricClaim,
} from '../../../../api/src/modules/operations/operations.contracts';

export type { BusinessRole, CmsState, EvidenceState };
export type {
  OperationsWorkbenchPort,
  OperationsWorkbenchSelection,
} from '../../../../api/src/modules/operations/operations-workbench.contracts';
export type OperationsSection = 'cms' | 'settings' | 'audit' | 'reports';
export interface OperationsReadRequest {
  readonly viewerId: string;
  readonly role: BusinessRole;
  readonly section: OperationsSection;
  readonly date: string;
  readonly scopeId: string;
}
export interface CmsReadItem {
  readonly id: string;
  readonly scopeId: string;
  readonly title: string;
  readonly body: string;
  readonly state: CmsState;
  readonly revision: Revision;
  readonly history: readonly { readonly revision: Revision; readonly state: CmsState }[];
}
export interface SettingReadItem {
  readonly scopeId: string;
  readonly code: string;
  readonly sensitivity: 'ORDINARY' | 'SENSITIVE' | 'UNKNOWN';
  readonly configured: boolean | null;
}
/** Future HTTP adapter is NOT implemented. Only explicitly labelled test data
 * may exercise loaded UI states; no fake production endpoint or provider exists.
 * Fixture markers/roles cannot authorize any mutation or expose confirmed facts.
 */
export interface OperationsOfflineSnapshot {
  readonly status: 'OFFLINE_TEST_ONLY';
  readonly binding: OperationsReadRequest;
  readonly scopes: readonly (ResourceScope & { readonly label: string })[];
  readonly cms: readonly CmsReadItem[];
  readonly settings: readonly SettingReadItem[];
  readonly audit: readonly OpsAuditReadContract[];
  readonly metrics: readonly SourceMetricClaim[];
}
export type OperationsReadResult =
  { readonly status: 'UNAVAILABLE' | 'DENIED' } | OperationsOfflineSnapshot;
export interface OperationsReader {
  read(request: OperationsReadRequest): Promise<OperationsReadResult>;
}
export interface OperationsViewModel {
  readonly status: 'UNAVAILABLE' | 'DENIED' | 'OFFLINE_TEST_ONLY';
  readonly scopes: OperationsOfflineSnapshot['scopes'];
  readonly cms: readonly CmsReadItem[];
  readonly settings: readonly SettingReadItem[];
  readonly audit: readonly Pick<OpsAuditReadContract, 'ref' | 'eventCode' | 'occurredAt'>[];
  readonly metrics: readonly {
    readonly code: string;
    readonly sourceWave: SourceMetricClaim['sourceWave'];
    readonly state: Exclude<EvidenceState, 'CONFIRMED'>;
    readonly value: null;
  }[];
  readonly runtimeAuthorized: false;
  readonly exportPerformed: false;
}
