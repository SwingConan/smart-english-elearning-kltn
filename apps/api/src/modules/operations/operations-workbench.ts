import {
  boundaryGuard,
  copyBoundaryData,
  equalScope,
  OperationsAuthorityAdapter,
} from './operations-authority-adapter';
import type { OperationsAuthorityContext } from './operations-authority.contracts';
import { OperationsSourceAdapter } from './operations-source-adapters';
import type { OperationsViewTicket } from './operations-source.contracts';
import { OperationsTechnicalAdapter } from './operations-technical-adapter';
import type { GuardResult, ResourceScope } from './operations.contracts';
import type {
  OperationsWorkbenchPlan,
  OperationsWorkbenchPort,
  OperationsWorkbenchResult,
  OperationsWorkbenchSelection,
} from './operations-workbench.contracts';

const result = (guard: GuardResult): OperationsWorkbenchResult => ({
  guard,
  runtimeAuthorized: false,
  mutationPerformed: false,
  exportPerformed: false,
  auditPersisted: false,
});

/** Offline composition only. Reuses S1/S2 guards; no controller, writer, provider,
 * DB loader or runtime authentication. Its mode does not assert server trust.
 * An opaque context belongs to its authority adapter; no caller role/id is used.
 */
export class OperationsOfflineWorkbench implements OperationsWorkbenchPort {
  readonly mode = 'IN_MEMORY_ONLY' as const;
  readonly #scope: ResourceScope;
  readonly #plan: OperationsWorkbenchPlan;
  readonly #views = new Map<string, OperationsViewTicket>();
  readonly #epochs = new Map<string, number>();
  constructor(
    private readonly authority: OperationsAuthorityAdapter,
    private readonly sources: OperationsSourceAdapter,
    private readonly technical: OperationsTechnicalAdapter,
    private readonly context: OperationsAuthorityContext,
    scope: ResourceScope,
    plan: OperationsWorkbenchPlan = {},
  ) {
    this.#scope = copyBoundaryData(scope);
    this.#plan = copyBoundaryData(plan);
  }
  async check(selection: OperationsWorkbenchSelection): Promise<OperationsWorkbenchResult> {
    try {
      // Capture detached immutable inputs BEFORE awaiting authority/source reads.
      const q = copyBoundaryData(selection);
      if (!equalScope(this.#scope, this.#scope) || q.scopeId !== this.#scope.id)
        return result(boundaryGuard('DENIED', 'WORKBENCH_SCOPE_DENIED'));
      let epoch = 0;
      if (q.kind === 'DAILY') {
        epoch = (this.#epochs.get(q.date) ?? 0) + 1;
        this.#epochs.set(q.date, epoch);
        this.#views.delete(q.date);
      }
      const current = await this.authority.revalidate(this.context);
      if (current.decision !== 'CONDITIONS_MET_OFFLINE') {
        this.#views.clear();
        return result(current);
      }
      switch (q.kind) {
        case 'CMS':
          return result(await this.sources.cms(this.context, this.#scope, q.request));
        case 'CONFIGURATION': {
          const p = this.#plan.configuration;
          if (!p) return result(boundaryGuard('BLOCKED', 'CONFIG_REQUEST_BINDING_UNAVAILABLE'));
          if (p.settingCode !== q.settingCode)
            return result(boundaryGuard('DENIED', 'CONFIG_REQUEST_BINDING_MISMATCH'));
          return result(
            (await this.technical.configurationPreflight(this.context, this.#scope, p)).guard,
          );
        }
        case 'AUDIT': {
          const expectedManifest = this.#plan.auditManifest;
          if (!expectedManifest)
            return result(boundaryGuard('BLOCKED', 'AUDIT_REVISION_BINDING_UNAVAILABLE'));
          return result(
            (await this.technical.audit(this.context, this.#scope, { expectedManifest })).guard,
          );
        }
        case 'DAILY': {
          const checked = await this.sources.daily(this.context, this.#scope, { date: q.date });
          if (epoch !== this.#epochs.get(q.date))
            return result(boundaryGuard('BLOCKED', 'VIEW_PREFLIGHT_SUPERSEDED'));
          if (checked.guard.decision === 'CONDITIONS_MET_OFFLINE' && checked.viewTicket)
            this.#views.set(q.date, checked.viewTicket);
          return result(checked.guard);
        }
        case 'EXPORT': {
          const p = this.#plan.export;
          const ticket = this.#views.get(q.date);
          if (!p || p.date !== q.date)
            return result(boundaryGuard('BLOCKED', 'EXPORT_SCHEMA_BINDING_UNAVAILABLE'));
          if (
            !q.filters ||
            q.filters.source !== p.displayFilters.source ||
            q.filters.state !== p.displayFilters.state
          )
            return result(boundaryGuard('BLOCKED', 'EXPORT_DISPLAY_FILTER_BINDING_UNAVAILABLE'));
          if (!ticket) return result(boundaryGuard('DENIED', 'VIEW_PREFLIGHT_REQUIRED'));
          return result((await this.sources.export(this.context, ticket, p.request)).guard);
        }
        default:
          return result(boundaryGuard('BLOCKED', 'WORKBENCH_SELECTION_INVALID'));
      }
    } catch {
      // Source/provider errors must never reach UI/logs as secret-bearing text.
      return result(boundaryGuard('BLOCKED', 'WORKBENCH_PREFLIGHT_FAILED'));
    }
  }
}
