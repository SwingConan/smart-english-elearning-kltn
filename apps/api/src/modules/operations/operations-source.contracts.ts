import type {
  EvidenceAdapterResult,
  W03Projection,
  W06Projection,
  W07Projection,
} from '../certificates/evidence-adapter.contracts';
import type { TrustedCompletionReadResult } from '../certificates/trusted-evidence.contracts';
import type {
  CmsAction,
  CmsModerationCheck,
  DailyProjection,
  EvidenceState,
  ExportField,
  ExportPreflight,
  GuardResult,
  MetricDefinition,
  ReportViewContract,
  ResourceScope,
  Revision,
  ScopedAccess,
  SourceMetricClaim,
} from './operations.contracts';

/** Existing exported contracts reused by type only. None is runtime-verified.
 * No import of Nest/Prisma or source services with mutation/sweep behavior.
 */
export type ExistingEvidenceContract =
  | { readonly kind: 'W03'; readonly projection: W03Projection }
  | {
      readonly kind: 'W06';
      readonly projection: W06Projection;
      readonly normalized: EvidenceAdapterResult | null;
    }
  | { readonly kind: 'W07'; readonly projection: W07Projection }
  | { readonly kind: 'W09_OFFLINE'; readonly result: TrustedCompletionReadResult };
export interface MetricReadRecord {
  readonly claim: SourceMetricClaim;
  readonly decisionPins: readonly Revision[];
  readonly existing: ExistingEvidenceContract | null;
}
export interface OfficialDecisionContract {
  readonly ref: Revision;
  readonly subjectRef: Revision;
  readonly scope: ResourceScope;
  readonly ruleRef: Revision;
  readonly authorityRef: Revision;
  readonly purpose: 'POLICY' | 'LICENSE' | 'PUBLICATION' | 'CONFIRMATION';
  readonly state: 'APPROVED' | 'REJECTED' | 'UNKNOWN';
}
export interface SourceLineageRead {
  readonly ref: Revision;
  readonly manifestRef: Revision;
  readonly completeness: 'COMPLETE' | 'INCOMPLETE' | 'UNKNOWN';
  readonly decisions: readonly OfficialDecisionContract[];
}
interface SourceReadBase {
  readonly manifestRef: Revision;
  readonly lineagePin: Revision;
  readonly scope: ResourceScope;
  readonly completeness: 'COMPLETE' | 'INCOMPLETE' | 'UNKNOWN';
}
export interface CmsSourceRead extends SourceReadBase {
  readonly data: Omit<CmsModerationCheck, 'access' | 'action' | 'expectedRevision'>;
}
export interface DailySourceRead extends SourceReadBase {
  readonly definitions: readonly MetricDefinition[];
  readonly records: readonly MetricReadRecord[];
  readonly view: ReportViewContract;
}
/** NEW required read ports, not claims about existing provider API methods.
 * Server DI must enforce binding, complete official histories, current heads/ABA
 * and independent approval authority. Current providers are absent or in-memory.
 */
export interface OperationsSourcePort {
  readonly mode: 'UNIMPLEMENTED' | 'IN_MEMORY_ONLY';
  readDaily(binding: ScopedAccess, date: string): Promise<DailySourceRead | null>;
  readCms(binding: ScopedAccess): Promise<CmsSourceRead | null>;
  readLineage(
    binding: ScopedAccess,
    manifestRef: Revision,
    lineagePin: Revision,
  ): Promise<SourceLineageRead | null>;
  readCurrentHead(
    binding: ScopedAccess,
    kind: 'CMS' | 'DAILY',
    selector: string,
  ): Promise<Revision | null>;
}
/** Preserves the mathematical meaning of zero and pending without promoting a
 * claim to an authenticated runtime fact. Only this nested declared value may
 * contain a consistent CONFIRMED claim. Display/runtime projection stays separate.
 */
export interface SourceClaimAnalysis {
  readonly code: string;
  readonly consistency: 'CONSISTENT_OFFLINE' | 'PENDING' | 'REJECTED';
  readonly reason: string;
  readonly declaredState: EvidenceState;
  readonly declaredValue: number | null;
  readonly runtimeVerified: false;
}
declare const viewBrand: unique symbol;
export interface OperationsViewTicket {
  readonly [viewBrand]: true;
}
export interface DailyBoundaryResult {
  readonly guard: GuardResult;
  readonly projection: DailyProjection | null;
  readonly claimAnalysis: readonly SourceClaimAnalysis[];
  readonly viewTicket: OperationsViewTicket | null;
  readonly runtimeAuthorized: false;
}
export interface CmsBoundaryRequest {
  readonly action: CmsAction;
  readonly expectedRevision: Revision;
}
export interface ExportBoundaryRequest {
  readonly metricCodes: readonly string[];
  readonly statusFilters: readonly EvidenceState[];
  readonly fields: readonly ExportField[];
  readonly format: 'CSV' | 'XLSX' | 'PDF';
  readonly auditCorrelationRef: Revision | null;
}
export interface ExportBoundaryResult {
  readonly guard: GuardResult;
  readonly preflight: ExportPreflight | null;
  readonly runtimeAuthorized: false;
}
