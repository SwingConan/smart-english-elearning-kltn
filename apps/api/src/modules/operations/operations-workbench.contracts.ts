import type { CmsBoundaryRequest, ExportBoundaryRequest } from './operations-source.contracts';
import type { ConfigurationPreflightRequest } from './operations-technical.contracts';
import type { GuardResult, Revision } from './operations.contracts';

/** In-process offline contract. This is NOT a registered HTTP DTO or capability.
 * The UI supplies selectors only; principal, grants, field plan and opaque view
 * ticket stay with the bound composition. No command performs a mutation.
 */
export type OperationsWorkbenchSelection =
  | { readonly kind: 'CMS'; readonly scopeId: string; readonly request: CmsBoundaryRequest }
  | { readonly kind: 'CONFIGURATION'; readonly scopeId: string; readonly settingCode: string }
  | { readonly kind: 'AUDIT'; readonly scopeId: string }
  | { readonly kind: 'DAILY'; readonly scopeId: string; readonly date: string }
  | {
      readonly kind: 'EXPORT';
      readonly scopeId: string;
      readonly date: string;
      readonly filters: { readonly source: string; readonly state: string };
    };

/** Required future SERVER-owned bindings. Missing plans block; UI text/booleans
 * never approve an allowlist, revision, export schema, or sensitive approver.
 */
export interface OperationsWorkbenchPlan {
  readonly configuration?: ConfigurationPreflightRequest;
  readonly auditManifest?: Revision;
  readonly export?: {
    readonly date: string;
    readonly request: ExportBoundaryRequest;
    readonly displayFilters: { readonly source: string; readonly state: string };
  };
}
export interface OperationsWorkbenchResult {
  readonly guard: GuardResult;
  readonly runtimeAuthorized: false;
  readonly mutationPerformed: false;
  readonly exportPerformed: false;
  readonly auditPersisted: false;
}
export interface OperationsWorkbenchPort {
  readonly mode: 'UNIMPLEMENTED' | 'IN_MEMORY_ONLY';
  check(selection: OperationsWorkbenchSelection): Promise<OperationsWorkbenchResult>;
}
