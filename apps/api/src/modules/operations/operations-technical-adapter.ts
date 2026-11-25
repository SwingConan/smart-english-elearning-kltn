import type { OperationsAuthorityContext } from './operations-authority.contracts';
import {
  boundaryGuard,
  boundaryRef,
  copyBoundaryData,
  equalRef,
  equalScope,
  OperationsAuthorityAdapter,
} from './operations-authority-adapter';
import type { GuardResult, ResourceScope, Revision, ScopedAccess } from './operations.contracts';
import {
  projectSafeOperationsStatus,
  simulateAuditRead,
  simulateConfigChange,
} from './operations-foundation';
import type { OfficialDecisionContract, SourceLineageRead } from './operations-source.contracts';
import type {
  ConfigurationPreflightRead,
  ConfigurationPreflightRequest,
  ConfigurationPreflightResult,
  OperationsTechnicalSourcePort,
  TechnicalAuditRead,
  TechnicalAuditResult,
} from './operations-technical.contracts';

const met = (g: GuardResult) => g.decision === 'CONDITIONS_MET_OFFLINE';
const code = (v: unknown): v is string => typeof v === 'string' && /^[A-Z][A-Z0-9_]{0,63}$/.test(v);
const configFailure = (guard: GuardResult): ConfigurationPreflightResult => ({
  guard,
  setting: null,
  changePerformed: false,
  auditRequired: true,
  auditPersisted: false,
  runtimeAuthorized: false,
});
const auditFailure = (guard: GuardResult): TechnicalAuditResult => ({
  guard,
  records: [],
  completeness: 'INCOMPLETE',
  confirmedEventCount: null,
  historyModified: false,
  runtimeAuthorized: false,
});

/** Offline-only, value-free technical projections. No provider, DB, writer,
 * timer, network probe or real authorization implementation is constructed.
 */
export class OperationsTechnicalAdapter {
  constructor(
    private readonly authority: OperationsAuthorityAdapter,
    private readonly port: OperationsTechnicalSourcePort | null,
  ) {}

  private base(read: ConfigurationPreflightRead | TechnicalAuditRead, scope: ResourceScope) {
    return (
      !!read &&
      read.completeness === 'COMPLETE' &&
      equalScope(read.scope, scope) &&
      boundaryRef(read.manifestRef) &&
      boundaryRef(read.lineagePin) &&
      boundaryRef(read.sourceRevision) &&
      boundaryRef(read.sourceConfirmationRuleRef) &&
      boundaryRef(read.policyApprovalRuleRef)
    );
  }

  private async lineage(
    access: ScopedAccess,
    read: ConfigurationPreflightRead | TechnicalAuditRead,
  ): Promise<SourceLineageRead | null> {
    const l = copyBoundaryData(
      await this.port!.readLineage(
        copyBoundaryData(access),
        { ...read.manifestRef },
        { ...read.lineagePin },
      ),
    );
    return l &&
      l.completeness === 'COMPLETE' &&
      Array.isArray(l.decisions) &&
      equalRef(l.ref, read.lineagePin) &&
      equalRef(l.manifestRef, read.manifestRef)
      ? l
      : null;
  }

  private decision(
    l: SourceLineageRead,
    pin: Revision | null,
    subject: Revision,
    rule: Revision,
    scope: ResourceScope,
    purpose: OfficialDecisionContract['purpose'],
  ) {
    const found = l.decisions.filter((d) => equalRef(d.ref, pin));
    return (
      found.length === 1 &&
      found[0].state === 'APPROVED' &&
      found[0].purpose === purpose &&
      equalRef(found[0].subjectRef, subject) &&
      equalRef(found[0].ruleRef, rule) &&
      equalScope(found[0].scope, scope) &&
      boundaryRef(found[0].authorityRef)
    );
  }

  private confirmed(l: SourceLineageRead, read: ConfigurationPreflightRead | TechnicalAuditRead) {
    const found = l.decisions.filter(
      (d) => d.purpose === 'CONFIRMATION' && equalRef(d.subjectRef, read.sourceRevision),
    );
    return (
      found.length === 1 &&
      this.decision(
        l,
        found[0].ref,
        read.sourceRevision,
        read.sourceConfirmationRuleRef,
        read.scope,
        'CONFIRMATION',
      )
    );
  }

  private async finish(
    context: OperationsAuthorityContext,
    access: ScopedAccess,
    read: ConfigurationPreflightRead | TechnicalAuditRead,
    kind: 'CONFIGURATION' | 'AUDIT',
    selector: string,
  ) {
    const before = await this.authority.revalidate(context);
    if (!met(before)) return before;
    const head = copyBoundaryData(
      await this.port!.readCurrentHead(copyBoundaryData(access), kind, selector),
    );
    if (!equalRef(head, read.manifestRef))
      return boundaryGuard('BLOCKED', 'TECHNICAL_SOURCE_HEAD_CHANGED_OR_UNAVAILABLE');
    return this.authority.revalidate(context);
  }

  async configurationPreflight(
    context: OperationsAuthorityContext,
    scope: ResourceScope,
    request: ConfigurationPreflightRequest,
  ): Promise<ConfigurationPreflightResult> {
    if (this.port?.mode !== 'IN_MEMORY_ONLY')
      return configFailure(boundaryGuard('BLOCKED', 'TECHNICAL_SOURCE_INTEGRATION_UNAVAILABLE'));
    try {
      const q = copyBoundaryData(request);
      if (!code(q.settingCode) || !boundaryRef(q.requestRef))
        return configFailure(boundaryGuard('BLOCKED', 'CONFIG_REQUEST_INVALID'));
      const auth = await this.authority.readAccess(context, 'ops.config.change', scope);
      if (!auth.access) return configFailure(auth.guard);
      const read = copyBoundaryData(
        await this.port.readConfigurationPreflight(copyBoundaryData(auth.access), q),
      );
      if (!read || !this.base(read, scope))
        return configFailure(boundaryGuard('BLOCKED', 'CONFIG_SOURCE_INCOMPLETE'));
      if (
        read.binding.settingCode !== q.settingCode ||
        !equalRef(read.binding.requestRef, q.requestRef)
      )
        return configFailure(boundaryGuard('DENIED', 'CONFIG_REQUEST_BINDING_MISMATCH'));
      // DEC069 leaves the sensitive reviewer/authority policy OPEN. No supplied
      // fixture approval may silently resolve that policy or enable a change.
      if (read.check.sensitivity === 'SENSITIVE')
        return configFailure(boundaryGuard('BLOCKED', 'SENSITIVE_APPROVER_POLICY_OPEN'));
      if (read.configured !== null && typeof read.configured !== 'boolean')
        return configFailure(boundaryGuard('BLOCKED', 'CONFIG_STATE_INVALID'));
      const l = await this.lineage(auth.access, read);
      const p = read.check.policy;
      if (
        !l ||
        !this.confirmed(l, read) ||
        !this.decision(l, p.approvalRef, p.ref, read.policyApprovalRuleRef, scope, 'POLICY')
      )
        return configFailure(boundaryGuard('BLOCKED', 'CONFIG_LINEAGE_UNVERIFIED'));
      const checked = simulateConfigChange({
        ...read.check,
        access: auth.access,
        requestRef: q.requestRef,
        settingCode: q.settingCode,
      });
      if (!met(checked)) return configFailure(checked);
      const end = await this.finish(context, auth.access, read, 'CONFIGURATION', q.settingCode);
      if (!met(end)) return configFailure(end);
      return {
        guard: end,
        setting: {
          code: q.settingCode,
          sensitivity: 'ORDINARY',
          status: projectSafeOperationsStatus({ configured: read.configured }),
        },
        changePerformed: false,
        auditRequired: true,
        auditPersisted: false,
        runtimeAuthorized: false,
      };
    } catch {
      return configFailure(boundaryGuard('BLOCKED', 'TECHNICAL_SOURCE_READ_FAILED'));
    }
  }

  async audit(
    context: OperationsAuthorityContext,
    scope: ResourceScope,
    request: { readonly expectedManifest: Revision },
  ): Promise<TechnicalAuditResult> {
    if (this.port?.mode !== 'IN_MEMORY_ONLY')
      return auditFailure(boundaryGuard('BLOCKED', 'TECHNICAL_SOURCE_INTEGRATION_UNAVAILABLE'));
    try {
      const q = copyBoundaryData(request);
      if (!boundaryRef(q.expectedManifest))
        return auditFailure(boundaryGuard('BLOCKED', 'AUDIT_REQUEST_INVALID'));
      const auth = await this.authority.readAccess(context, 'ops.audit.read', scope);
      if (!auth.access) return auditFailure(auth.guard);
      const checked = simulateAuditRead(auth.access);
      if (!met(checked)) return auditFailure(checked);
      const read = copyBoundaryData(await this.port.readAudit(copyBoundaryData(auth.access)));
      if (!read || !this.base(read, scope) || read.sourceWave !== 'W01')
        return auditFailure(boundaryGuard('BLOCKED', 'AUDIT_SOURCE_INCOMPLETE_OR_UNSUPPORTED'));
      if (!equalRef(read.manifestRef, q.expectedManifest))
        return auditFailure(boundaryGuard('BLOCKED', 'AUDIT_MANIFEST_STALE'));
      const p = read.fieldPolicy;
      const l = await this.lineage(auth.access, read);
      if (
        !l ||
        !this.confirmed(l, read) ||
        p.state !== 'APPROVED' ||
        !equalScope(p.scope, scope) ||
        !Array.isArray(p.allowedEventCodes) ||
        !p.allowedEventCodes.length ||
        !p.allowedEventCodes.every(code) ||
        new Set(p.allowedEventCodes).size !== p.allowedEventCodes.length ||
        !this.decision(l, p.approvalRef, p.ref, read.policyApprovalRuleRef, scope, 'POLICY')
      )
        return auditFailure(boundaryGuard('BLOCKED', 'AUDIT_FIELD_POLICY_UNVERIFIED'));
      if (
        !Array.isArray(read.records) ||
        new Set(read.records.map((r) => r.ref.id)).size !== read.records.length
      )
        return auditFailure(boundaryGuard('BLOCKED', 'AUDIT_HISTORY_AMBIGUOUS'));
      const records: TechnicalAuditResult['records'][number][] = [];
      for (const row of read.records) {
        // Canonical UTC source projection; no historical day/retention rule is inferred.
        const ms = typeof row.occurredAt === 'string' ? Date.parse(row.occurredAt) : NaN;
        if (
          !equalScope(row.scope, scope) ||
          !boundaryRef(row.ref) ||
          !equalRef(row.sourceRevision, read.sourceRevision) ||
          !equalRef(row.fieldPolicyRef, p.ref) ||
          !code(row.eventCode) ||
          !p.allowedEventCodes.includes(row.eventCode) ||
          !Number.isFinite(ms) ||
          new Date(ms).toISOString() !== row.occurredAt
        )
          return auditFailure(
            boundaryGuard('DENIED', 'AUDIT_RECORD_SCOPE_POLICY_OR_REVISION_DENIED'),
          );
        records.push({
          ref: { ...row.ref },
          eventCode: row.eventCode,
          occurredAt: row.occurredAt,
          sourceRevision: { ...row.sourceRevision },
          evidenceState: 'UNVERIFIED',
        });
      }
      const end = await this.finish(context, auth.access, read, 'AUDIT', read.manifestRef.id);
      if (!met(end)) return auditFailure(end);
      return {
        guard: end,
        records,
        completeness: 'INCOMPLETE',
        confirmedEventCount: null,
        historyModified: false,
        runtimeAuthorized: false,
      };
    } catch {
      return auditFailure(boundaryGuard('BLOCKED', 'TECHNICAL_SOURCE_READ_FAILED'));
    }
  }
}
