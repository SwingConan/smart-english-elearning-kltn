import {
  boundaryGuard,
  boundaryRef,
  copyBoundaryData,
  equalRef,
  equalScope,
  OperationsAuthorityAdapter,
} from './operations-authority-adapter';
import type { OperationsAuthorityContext } from './operations-authority.contracts';
import {
  projectSafeOperationsStatus,
  simulateCmsModeration,
  simulateDailyProjection,
  simulateExportParity,
} from './operations-foundation';
import type {
  GuardResult,
  MetricDefinition,
  ReportViewContract,
  ResourceScope,
  Revision,
  ScopedAccess,
} from './operations.contracts';
import type {
  CmsBoundaryRequest,
  DailyBoundaryResult,
  ExportBoundaryRequest,
  ExportBoundaryResult,
  MetricReadRecord,
  OfficialDecisionContract,
  OperationsSourcePort,
  OperationsViewTicket,
  SourceClaimAnalysis,
  SourceLineageRead,
} from './operations-source.contracts';

const met = (g: GuardResult) => g.decision === 'CONDITIONS_MET_OFFLINE';
const dated = (s: string | null) =>
  typeof s === 'string' && /(Z|[+-]\d{2}:\d{2})$/.test(s) && Number.isFinite(Date.parse(s));
const failedDaily = (g: GuardResult): DailyBoundaryResult => ({
  guard: g,
  projection: null,
  claimAnalysis: [],
  viewTicket: null,
  runtimeAuthorized: false,
});
const failedExport = (g: GuardResult): ExportBoundaryResult => ({
  guard: g,
  preflight: null,
  runtimeAuthorized: false,
});
function decision(
  list: readonly OfficialDecisionContract[],
  pin: Revision | null,
  subject: Revision,
  purpose: OfficialDecisionContract['purpose'],
  scope: ResourceScope,
  rule?: Revision,
) {
  const found = list.filter((d) => equalRef(d.ref, pin));
  return (
    found.length === 1 &&
    found[0].state === 'APPROVED' &&
    found[0].purpose === purpose &&
    equalRef(found[0].subjectRef, subject) &&
    equalScope(found[0].scope, scope) &&
    boundaryRef(found[0].authorityRef) &&
    boundaryRef(found[0].ruleRef) &&
    (!rule || equalRef(found[0].ruleRef, rule))
  );
}

/** Validate a declared claim without turning consistency into runtime provenance.
 * Null and provisional evidence are never inferred to be measured zero.
 */
export function analyzeSourceClaim(
  record: MetricReadRecord,
  d: MetricDefinition,
  lineage: readonly OfficialDecisionContract[],
): SourceClaimAnalysis {
  const s = record.claim;
  const value =
    s.evidenceState === 'CONFIRMED' && typeof s.value === 'number' && Number.isFinite(s.value)
      ? s.value
      : null;
  const out = (
    consistency: SourceClaimAnalysis['consistency'],
    reason: string,
  ): SourceClaimAnalysis => ({
    code: d.code,
    consistency,
    reason,
    declaredState: s.evidenceState,
    declaredValue: value,
    runtimeVerified: false,
  });
  if (
    !equalScope(s.scope, d.scope) ||
    s.domain !== d.domain ||
    s.sourceWave !== d.sourceWave ||
    !equalRef(s.sourceRef, d.expectedSourcePin)
  )
    return out('REJECTED', 'SOURCE_SCOPE_OR_REVISION_MISMATCH');
  if (s.provenance !== 'OFFLINE_SYNTHETIC' && s.provenance !== 'UNVERIFIED')
    return out('REJECTED', 'UNSUPPORTED_PROVENANCE_MARKER');
  if (!['CONFIRMED', 'PENDING', 'UNKNOWN', 'UNAVAILABLE', 'UNVERIFIED'].includes(s.evidenceState))
    return out('REJECTED', 'INVALID_EVIDENCE_STATE');
  if (s.evidenceState !== 'CONFIRMED') return out('PENDING', 'SOURCE_NOT_CONFIRMED');
  if (value === null || s.completeness !== 'COMPLETE')
    return out('PENDING', 'VALUE_OR_COMPLETENESS_MISSING');
  if (s.supersedesRef) return out('PENDING', 'OFFICIAL_CORRECTION_PRECEDENCE_REQUIRED');
  if (
    record.decisionPins.length === 0 ||
    new Set(record.decisionPins.map((p) => JSON.stringify(p))).size !==
      record.decisionPins.length ||
    !record.decisionPins.every((p) =>
      decision(lineage, p, s.sourceRef, 'CONFIRMATION', d.scope, d.confirmationRuleRef),
    )
  )
    return out('PENDING', 'INDEPENDENT_CONFIRMATION_LINEAGE_REQUIRED');
  if (s.sourceWave === 'W05B' || s.sourceWave === 'W09')
    return out(
      'PENDING',
      s.sourceWave === 'W05B' ? 'W05B_RUNTIME_UNVERIFIED' : 'W09_RUNTIME_UNVERIFIED',
    );
  const existing = record.existing;
  if (s.domain === 'PUBLISHED_OUTCOME' && s.sourceWave === 'W03' && existing?.kind !== 'W03')
    return out('PENDING', 'PUBLISHED_CONTRACT_REQUIRED');
  if (s.domain === 'CLASS_ATTENDANCE' && s.sourceWave === 'W06' && existing?.kind !== 'W06')
    return out('PENDING', 'OFFICIAL_ATTENDANCE_CONTRACT_REQUIRED');
  if (existing) {
    if (existing.kind === 'W09_OFFLINE')
      return out('REJECTED', 'OFFLINE_COMPLETION_IS_NOT_OFFICIAL_METRIC');
    const e = existing.projection;
    if (
      existing.kind !== s.sourceWave ||
      !equalRef(e.ref, s.sourceRef) ||
      !(s.scope.kind === 'CLASS'
        ? e.identity.classOfferingId === s.scope.id
        : s.scope.kind === 'LEARNER' && e.identity.learnerId === s.scope.id)
    )
      return out('REJECTED', 'EXISTING_CONTRACT_BINDING_MISMATCH');
    if (existing.kind === 'W03') {
      const p = existing.projection;
      if (
        !(
          (p.source === 'W03_ASSIGNMENT' && p.state === 'PUBLISHED') ||
          (p.source === 'W03_QUIZ' && p.state === 'SUBMITTED')
        ) ||
        !dated(p.confirmedAt) ||
        !dated(p.publishedAt) ||
        !p.publishedById ||
        p.makerIds.includes(p.publishedById) ||
        !decision(
          lineage,
          p.publicationDecisionRef,
          p.ref,
          'PUBLICATION',
          d.scope,
          d.statusPredicateRef,
        )
      )
        return out('PENDING', 'PUBLISHED_FINAL_LINEAGE_REQUIRED');
    }
    if (existing.kind === 'W06') {
      const p = existing.projection,
        n = existing.normalized;
      if (
        p.source !== 'W06_LEARNER_ATTENDANCE' ||
        p.historyComplete !== true ||
        !n ||
        n.status !== 'NORMALIZED' ||
        n.assurance !== 'OFFLINE_CONSISTENCY_ONLY' ||
        !n.evidence ||
        n.evidence.kind !== 'W06_ATTENDANCE' ||
        !equalRef(n.evidence.ref, p.ref) ||
        n.evidence.state !== 'OFFICIAL_CONFIRMED' ||
        n.evidence.scope.classOfferingId !== p.identity.classOfferingId ||
        n.evidence.scope.enrollmentId !== p.identity.enrollmentId ||
        n.evidence.scope.courseVersionId !== p.identity.courseVersionId ||
        !p.sessions.every(
          (s) =>
            s.classOfferingId === p.identity.classOfferingId &&
            equalRef(s.courseVersionRef, p.courseVersionRef),
        )
      )
        return out('PENDING', 'OFFICIAL_ATTENDANCE_RESOLUTION_REQUIRED');
    }
    if (existing.kind === 'W07') {
      const p = existing.projection;
      if (
        p.entitlementEnrollmentId !== p.identity.enrollmentId ||
        p.application.learnerId !== p.identity.learnerId ||
        p.application.classOfferingId !== p.identity.classOfferingId ||
        !equalRef(p.application.courseVersionRef, p.courseVersionRef)
      )
        return out('REJECTED', 'ENTITLEMENT_IDENTITY_MISMATCH');
      return out('PENDING', 'ENTITLEMENT_ACADEMIC_PERIOD_UNRESOLVED');
    }
  }
  return out('CONSISTENT_OFFLINE', 'DECLARED_VALUE_ONLY_NOT_AUTHENTICATED');
}

interface ViewBinding {
  readonly context: OperationsAuthorityContext;
  readonly scope: ResourceScope;
  readonly view: ReportViewContract;
}
/** Inert composition over required server read ports. No provider API is invented
 * as an existing implementation; no verified-runtime branch exists in S2.
 */
export class OperationsSourceAdapter {
  readonly #views = new WeakMap<OperationsViewTicket, ViewBinding>();
  constructor(
    private readonly authority: OperationsAuthorityAdapter,
    private readonly port: OperationsSourcePort | null,
  ) {}
  private async lineage(
    a: ScopedAccess,
    manifest: Revision,
    pin: Revision,
  ): Promise<SourceLineageRead | null> {
    if (!this.port) return null;
    const l = copyBoundaryData(
      await this.port.readLineage(copyBoundaryData(a), { ...manifest }, { ...pin }),
    );
    return l &&
      equalRef(l.manifestRef, manifest) &&
      equalRef(l.ref, pin) &&
      l.completeness === 'COMPLETE' &&
      Array.isArray(l.decisions)
      ? l
      : null;
  }
  private async finish(
    c: OperationsAuthorityContext,
    a: ScopedAccess,
    kind: 'CMS' | 'DAILY',
    selector: string,
    head: Revision,
  ): Promise<GuardResult> {
    const current = copyBoundaryData(
      await this.port!.readCurrentHead(copyBoundaryData(a), kind, selector),
    );
    if (!equalRef(current, head))
      return boundaryGuard('BLOCKED', 'SOURCE_HEAD_CHANGED_OR_UNAVAILABLE');
    return this.authority.revalidate(c);
  }
  async cms(
    context: OperationsAuthorityContext,
    scope: ResourceScope,
    request: CmsBoundaryRequest,
  ): Promise<GuardResult> {
    if (this.port?.mode !== 'IN_MEMORY_ONLY')
      return boundaryGuard('BLOCKED', 'SOURCE_INTEGRATION_UNAVAILABLE');
    try {
      const action = request.action,
        expectedRevision = {
          id: request.expectedRevision.id,
          revision: request.expectedRevision.revision,
        };
      const permission =
        action === 'EDIT_DRAFT' || action === 'SUBMIT_REVIEW'
          ? 'cms.draft'
          : action === 'REJECT'
            ? 'cms.review'
            : 'cms.publish';
      const auth = await this.authority.readAccess(context, permission, scope);
      if (!auth.access) return auth.guard;
      const read = copyBoundaryData(await this.port.readCms(copyBoundaryData(auth.access)));
      if (
        !read ||
        !boundaryRef(read.manifestRef) ||
        !equalScope(read.scope, scope) ||
        read.completeness !== 'COMPLETE'
      )
        return boundaryGuard('BLOCKED', 'CMS_READ_INCOMPLETE');
      const l = await this.lineage(auth.access, read.manifestRef, read.lineagePin);
      if (
        !l ||
        !decision(l.decisions, read.data.policy.approvalRef, read.data.policy.ref, 'POLICY', scope)
      )
        return boundaryGuard('BLOCKED', 'CMS_POLICY_LINEAGE_UNAVAILABLE');
      if (
        action === 'PUBLISH' &&
        !decision(
          l.decisions,
          read.data.revision.licensingDecisionRef,
          read.data.revision.ref,
          'LICENSE',
          scope,
        )
      )
        return boundaryGuard('BLOCKED', 'CMS_LICENSE_LINEAGE_UNAVAILABLE');
      const checked = simulateCmsModeration({
        ...read.data,
        access: auth.access,
        action,
        expectedRevision,
      });
      if (!met(checked)) return checked;
      return await this.finish(context, auth.access, 'CMS', scope.id, read.manifestRef);
    } catch {
      return boundaryGuard('BLOCKED', 'SOURCE_READ_FAILED');
    }
  }
  async daily(
    context: OperationsAuthorityContext,
    scope: ResourceScope,
    request: { readonly date: string },
  ): Promise<DailyBoundaryResult> {
    if (this.port?.mode !== 'IN_MEMORY_ONLY')
      return failedDaily(boundaryGuard('BLOCKED', 'SOURCE_INTEGRATION_UNAVAILABLE'));
    try {
      const date = request.date;
      if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date))
        return failedDaily(boundaryGuard('BLOCKED', 'DATE_INVALID'));
      const auth = await this.authority.readAccess(context, 'report.view', scope);
      if (!auth.access) return failedDaily(auth.guard);
      const read = copyBoundaryData(await this.port.readDaily(copyBoundaryData(auth.access), date));
      if (
        !read ||
        !boundaryRef(read.manifestRef) ||
        !equalScope(read.scope, scope) ||
        read.completeness !== 'COMPLETE'
      )
        return failedDaily(boundaryGuard('BLOCKED', 'DAILY_READ_INCOMPLETE'));
      const v = read.view;
      if (
        v.viewerPrincipalId !== auth.access.actor.principalId ||
        v.role !== auth.access.actor.role ||
        !equalScope(v.scope, scope) ||
        v.day.date !== date ||
        !equalRef(v.manifestRef, read.manifestRef)
      )
        return failedDaily(boundaryGuard('DENIED', 'SERVER_VIEW_BINDING_MISMATCH'));
      if (
        !Array.isArray(v.metricCodes) ||
        v.metricCodes.length !== read.definitions.length ||
        new Set(v.metricCodes).size !== v.metricCodes.length ||
        !read.definitions.every((d) => v.metricCodes.includes(d.code))
      )
        return failedDaily(boundaryGuard('BLOCKED', 'VIEW_DEFINITION_MISMATCH'));
      const l = await this.lineage(auth.access, read.manifestRef, read.lineagePin);
      if (
        !l ||
        !read.definitions.every((d) => decision(l.decisions, d.approvalRef, d.ref, 'POLICY', scope))
      )
        return failedDaily(boundaryGuard('BLOCKED', 'METRIC_POLICY_LINEAGE_UNAVAILABLE'));
      const analysis: SourceClaimAnalysis[] = [];
      for (const r of read.records) {
        const d = read.definitions.find((d) => d.code === r.claim.metricCode);
        if (!d) return failedDaily(boundaryGuard('DENIED', 'UNREQUESTED_SOURCE'));
        analysis.push(analyzeSourceClaim(r, d, l.decisions));
      }
      if (analysis.some((a) => a.consistency === 'REJECTED'))
        return failedDaily(boundaryGuard('DENIED', 'SOURCE_CONTRADICTORY'));
      const projection = simulateDailyProjection({
        access: auth.access,
        day: v.day,
        definitions: read.definitions,
        sources: read.records.map((r) => r.claim),
      });
      if (!met(projection.guard)) return failedDaily(projection.guard);
      const end = await this.finish(context, auth.access, 'DAILY', date, read.manifestRef);
      if (!met(end)) return failedDaily(end);
      const ticket = Object.freeze(Object.create(null)) as OperationsViewTicket;
      // Completeness claims never become actual COMPLETE in a runtime export.
      const requiredComplete =
        v.requiredSourcesComplete === true &&
        read.definitions
          .filter((d) => d.required)
          .every(
            (d) =>
                // Reuse S1's validated outcome, including its half-open day window.
                projection.metrics.some(
                  (m) =>
                    m.code === d.code &&
                    m.evidenceState === 'UNVERIFIED' &&
                    m.reason === 'AUTHENTICATED_SOURCE_REQUIRED',
                ) &&
              read.records.filter((r) => r.claim.metricCode === d.code).length === 1 &&
              analysis.some((a) => a.code === d.code && a.consistency === 'CONSISTENT_OFFLINE'),
          );
      this.#views.set(ticket, {
        context,
        scope: copyBoundaryData(scope),
        view: copyBoundaryData({ ...v, requiredSourcesComplete: requiredComplete }),
      });
      return {
        guard: end,
        projection,
        claimAnalysis: analysis,
        viewTicket: ticket,
        runtimeAuthorized: false,
      };
    } catch {
      return failedDaily(boundaryGuard('BLOCKED', 'SOURCE_READ_FAILED'));
    }
  }
  async export(
    context: OperationsAuthorityContext,
    ticket: OperationsViewTicket,
    request: ExportBoundaryRequest,
  ): Promise<ExportBoundaryResult> {
    const b = this.#views.get(ticket);
    if (!b || b.context !== context || this.port?.mode !== 'IN_MEMORY_ONLY')
      return failedExport(boundaryGuard('DENIED', 'UNBOUND_VIEW_TICKET'));
    try {
      const v = await this.authority.readAccess(context, 'report.view', b.scope);
      if (!v.access) return failedExport(v.guard);
      const e = await this.authority.readAccess(context, 'report.export', b.scope);
      if (!e.access) return failedExport(e.guard);
      const current = copyBoundaryData(
        await this.port.readCurrentHead(copyBoundaryData(v.access), 'DAILY', b.view.day.date),
      );
      if (!current) return failedExport(boundaryGuard('BLOCKED', 'SOURCE_HEAD_UNAVAILABLE'));
      const requested = {
        ...copyBoundaryData(b.view),
        metricCodes: copyBoundaryData(request.metricCodes),
        statusFilters: copyBoundaryData(request.statusFilters),
        fields: copyBoundaryData(request.fields),
      };
      const preflight = simulateExportParity({
        viewAccessNow: v.access,
        exportAccessNow: e.access,
        view: copyBoundaryData(b.view),
        requested,
        currentManifestRef: current,
        auditCorrelationRef: copyBoundaryData(request.auditCorrelationRef),
        format: request.format,
      });
      if (!met(preflight.guard))
        return { guard: preflight.guard, preflight, runtimeAuthorized: false };
      const end = await this.finish(
        context,
        v.access,
        'DAILY',
        b.view.day.date,
        b.view.manifestRef,
      );
      return met(end) ? { guard: end, preflight, runtimeAuthorized: false } : failedExport(end);
    } catch {
      return failedExport(boundaryGuard('BLOCKED', 'SOURCE_READ_FAILED'));
    }
  }
  /** No connector is called; S1 preserves UNKNOWN/UNVERIFIED. */
  health() {
    return projectSafeOperationsStatus(null);
  }
}
