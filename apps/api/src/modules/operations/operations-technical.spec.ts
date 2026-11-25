import type { OperationsAuthorityPort, PrincipalRead } from './operations-authority.contracts';
import { OperationsAuthorityAdapter } from './operations-authority-adapter';
import type {
  BusinessRole,
  GrantRead,
  Permission,
  ResourceScope,
  Revision,
  ScopedAccess,
} from './operations.contracts';
import type { OfficialDecisionContract, SourceLineageRead } from './operations-source.contracts';
import { OperationsTechnicalAdapter } from './operations-technical-adapter';
import type {
  ConfigurationPreflightRead,
  ConfigurationPreflightRequest,
  OperationsTechnicalSourcePort,
  TechnicalAuditRead,
} from './operations-technical.contracts';

const ref = (id: string, revision = 'synthetic-1'): Revision => ({ id, revision });
const scope: ResourceScope = { kind: 'TECHNICAL', id: 'synthetic-operations-area' };
const request: ConfigurationPreflightRequest = {
  settingCode: 'SYNTHETIC_SETTING',
  requestRef: ref('request'),
};
const auditRequest = { expectedManifest: ref('audit-manifest') };

class MemoryAuthority implements OperationsAuthorityPort {
  mode = 'IN_MEMORY_ONLY' as const;
  revoked = new Set<Permission>();
  principal: PrincipalRead = {
    ref: ref('principal'),
    authorityEpoch: 'synthetic-epoch',
    accountState: 'ACTIVE',
    principal: {
      principalId: 'synthetic-account',
      personId: 'synthetic-person',
      role: 'SYSTEM_ADMIN',
      sessionRef: ref('session'),
      sessionState: 'AUTHENTICATED',
    },
  };
  readPrincipal() {
    return Promise.resolve(structuredClone(this.principal));
  }
  readGrant(
    principalId: string,
    permission: Permission,
    _target: ResourceScope,
  ): Promise<GrantRead> {
    return Promise.resolve({
      ref: ref(permission),
      principalId,
      permission,
      scope,
      state: this.revoked.has(permission) ? 'REVOKED' : 'ACTIVE',
      validity: 'VALID',
      authorityEpoch: 'synthetic-epoch',
      decisionRef: ref('grant-decision'),
      authorityRef: ref('grant-authority'),
    });
  }
}
class MemoryTechnicalSource implements OperationsTechnicalSourcePort {
  mode: OperationsTechnicalSourcePort['mode'] = 'IN_MEMORY_ONLY';
  configReads = 0;
  auditReads = 0;
  headReads = 0;
  lineageComplete = true;
  fail = false;
  missing = false;
  missingHead = false;
  afterLineage?: () => void;
  afterHead?: () => void;
  configHead: Revision = ref('config-manifest');
  auditHead: Revision = ref('audit-manifest');
  config: ConfigurationPreflightRead = {
    manifestRef: this.configHead,
    lineagePin: ref('lineage'),
    sourceRevision: ref('config-source'),
    sourceConfirmationRuleRef: ref('source-rule'),
    policyApprovalRuleRef: ref('policy-rule'),
    scope,
    completeness: 'COMPLETE',
    binding: request,
    configured: true,
    check: {
      policy: {
        ref: ref('config-policy'),
        state: 'APPROVED',
        approvalRef: ref('config-policy-decision'),
        scope,
        allowedSettingCodes: ['SYNTHETIC_SETTING'],
      },
      sensitivity: 'ORDINARY',
      sensitiveApproval: null,
    },
  };
  auditRead: TechnicalAuditRead = {
    manifestRef: this.auditHead,
    lineagePin: ref('lineage'),
    sourceRevision: ref('audit-source'),
    sourceConfirmationRuleRef: ref('source-rule'),
    policyApprovalRuleRef: ref('policy-rule'),
    scope,
    completeness: 'COMPLETE',
    sourceWave: 'W01',
    fieldPolicy: {
      ref: ref('audit-policy'),
      state: 'APPROVED',
      approvalRef: ref('audit-policy-decision'),
      scope,
      allowedEventCodes: ['SYNTHETIC_EVENT'],
    },
    records: [
      {
        ref: ref('audit-event'),
        scope,
        occurredAt: '2026-11-06T07:00:00.000Z',
        eventCode: 'SYNTHETIC_EVENT',
        actorPseudonym: 'private-actor',
        fieldPolicyRef: ref('audit-policy'),
        sourceRevision: ref('audit-source'),
      },
    ],
  };
  decisions: OfficialDecisionContract[] = [
    {
      ref: ref('config-policy-decision'),
      subjectRef: ref('config-policy'),
      purpose: 'POLICY',
      state: 'APPROVED',
      scope,
      ruleRef: ref('policy-rule'),
      authorityRef: ref('independent-authority'),
    },
    {
      ref: ref('audit-policy-decision'),
      subjectRef: ref('audit-policy'),
      purpose: 'POLICY',
      state: 'APPROVED',
      scope,
      ruleRef: ref('policy-rule'),
      authorityRef: ref('independent-authority'),
    },
    {
      ref: ref('config-confirmation'),
      subjectRef: ref('config-source'),
      purpose: 'CONFIRMATION',
      state: 'APPROVED',
      scope,
      ruleRef: ref('source-rule'),
      authorityRef: ref('independent-authority'),
    },
    {
      ref: ref('audit-confirmation'),
      subjectRef: ref('audit-source'),
      purpose: 'CONFIRMATION',
      state: 'APPROVED',
      scope,
      ruleRef: ref('source-rule'),
      authorityRef: ref('independent-authority'),
    },
  ];
  readConfigurationPreflight(_a: ScopedAccess, _q: ConfigurationPreflightRequest) {
    this.configReads++;
    if (this.fail) throw Error('private-provider-password');
    return Promise.resolve(this.missing ? null : structuredClone(this.config));
  }
  readAudit(_a: ScopedAccess) {
    this.auditReads++;
    if (this.fail) throw Error('private-provider-password');
    return Promise.resolve(this.missing ? null : structuredClone(this.auditRead));
  }
  readLineage(
    _a: ScopedAccess,
    manifestRef: Revision,
    lineagePin: Revision,
  ): Promise<SourceLineageRead> {
    const l: SourceLineageRead = {
      ref: lineagePin,
      manifestRef,
      completeness: this.lineageComplete ? 'COMPLETE' : 'INCOMPLETE',
      decisions: structuredClone(this.decisions),
    };
    this.afterLineage?.();
    return Promise.resolve(l);
  }
  readCurrentHead(_a: ScopedAccess, kind: 'CONFIGURATION' | 'AUDIT', _selector: string) {
    this.headReads++;
    const head = this.missingHead
      ? null
      : structuredClone(kind === 'CONFIGURATION' ? this.configHead : this.auditHead);
    this.afterHead?.();
    return Promise.resolve(head);
  }
}
async function setup() {
  const grants = new MemoryAuthority(),
    authority = new OperationsAuthorityAdapter(grants);
  const port = new MemoryTechnicalSource(),
    adapter = new OperationsTechnicalAdapter(authority, port);
  const opened = await authority.open();
  expect(opened.guard.runtimeAuthorized).toBe(false);
  expect(opened.context).not.toBeNull();
  return { grants, authority, port, adapter, context: opened.context! };
}
const met = (g: { decision: string }) => expect(g.decision).toBe('CONDITIONS_MET_OFFLINE');
const blocked = (g: { decision: string }) => expect(g.decision).not.toBe('CONDITIONS_MET_OFFLINE');

describe('W10 consolidated technical offline boundary P2/P3', () => {
  it('returns value-free config metadata, no applied change or fake health', async () => {
    const e = await setup();
    Object.assign(e.port.config, {
      password: 'private-value',
      url: 'https://private-provider',
      token: 'private-token',
    });
    const r = await e.adapter.configurationPreflight(e.context, scope, request);
    met(r.guard);
    expect(r).toMatchObject({
      changePerformed: false,
      auditRequired: true,
      auditPersisted: false,
      runtimeAuthorized: false,
    });
    expect(r.setting?.status).toMatchObject({
      health: 'UNKNOWN',
      configuration: 'UNVERIFIED',
      runtimeAuthorized: false,
    });
    expect(JSON.stringify(r)).not.toMatch(/private-value|private-provider|private-token/);
  });
  it.each([false, null] as const)(
    'keeps configured=%s truthful without a live connection claim',
    async (configured) => {
      const e = await setup();
      e.port.config = { ...e.port.config, configured };
      const r = await e.adapter.configurationPreflight(e.context, scope, request);
      met(r.guard);
      expect(r.setting?.status.configuration).toBe(
        configured === false ? 'UNCONFIGURED' : 'UNVERIFIED',
      );
      expect(r.setting?.status.health).toBe('UNKNOWN');
    },
  );
  it.each([
    'STUDENT',
    'INSTRUCTOR',
    'COUNSELOR',
    'ACADEMIC_MANAGER',
    'CASHIER',
    'TEACHING_INSPECTOR',
  ] as const)('denies %s before reading technical sources', async (role: BusinessRole) => {
    const e = await setup();
    e.grants.principal = {
      ...e.grants.principal,
      principal: { ...e.grants.principal.principal, role },
    };
    blocked((await e.adapter.configurationPreflight(e.context, scope, request)).guard);
    blocked((await e.adapter.audit(e.context, scope, auditRequest)).guard);
    expect(e.port.configReads + e.port.auditReads).toBe(0);
  });
  it('blocks missing/unimplemented source ports rather than claiming connectivity', async () => {
    const e = await setup();
    for (const source of [null, Object.assign(e.port, { mode: 'UNIMPLEMENTED' as const })]) {
      const adapter = new OperationsTechnicalAdapter(e.authority, source);
      blocked((await adapter.configurationPreflight(e.context, scope, request)).guard);
      blocked((await adapter.audit(e.context, scope, auditRequest)).guard);
    }
    expect(e.port.configReads + e.port.auditReads).toBe(0);
  });
  it('requires exact request ref/code binding, not caller approval fields', async () => {
    const e = await setup();
    e.port.config = { ...e.port.config, binding: { ...request, requestRef: ref('other-request') } };
    expect((await e.adapter.configurationPreflight(e.context, scope, request)).guard.reason).toBe(
      'CONFIG_REQUEST_BINDING_MISMATCH',
    );
  });
  it('denies foreign technical scope before fetching source data', async () => {
    const e = await setup();
    const foreign: ResourceScope = { ...scope, id: 'foreign-operations-area' };
    expect(
      (await e.adapter.configurationPreflight(e.context, foreign, request)).guard.decision,
    ).toBe('DENIED');
    expect((await e.adapter.audit(e.context, foreign, auditRequest)).guard.decision).toBe('DENIED');
    expect(e.port.configReads + e.port.auditReads).toBe(0);
  });
  it('requires the approved config allowlist', async () => {
    const e = await setup();
    e.port.config = {
      ...e.port.config,
      check: {
        ...e.port.config.check,
        policy: { ...e.port.config.check.policy, allowedSettingCodes: [] },
      },
    };
    expect((await e.adapter.configurationPreflight(e.context, scope, request)).guard.reason).toBe(
      'SETTING_NOT_ALLOWLISTED',
    );
  });
  it('does not invent a sensitive approver even with a fixture approval', async () => {
    const e = await setup();
    e.port.config = {
      ...e.port.config,
      check: {
        ...e.port.config.check,
        sensitivity: 'SENSITIVE',
        sensitiveApproval: {
          ref: ref('fixture-approval'),
          requestRef: request.requestRef,
          policyRef: e.port.config.check.policy.ref,
          approverPersonId: 'different-person',
          authorityRuleRef: ref('fixture-rule'),
        },
      },
    };
    const r = await e.adapter.configurationPreflight(e.context, scope, request);
    expect(r.guard.reason).toBe('SENSITIVE_APPROVER_POLICY_OPEN');
    expect(r.setting).toBeNull();
    expect(r.changePerformed).toBe(false);
  });
  it.each(['POLICY', 'CONFIRMATION'] as const)(
    'requires %s lineage from a separate read',
    async (purpose) => {
      const e = await setup();
      e.port.decisions = e.port.decisions.filter((d) => d.purpose !== purpose);
      blocked((await e.adapter.configurationPreflight(e.context, scope, request)).guard);
      blocked((await e.adapter.audit(e.context, scope, auditRequest)).guard);
    },
  );
  it('rejects contradictory duplicate approvals rather than selecting an APPROVED row', async () => {
    const e = await setup();
    e.port.decisions.push({ ...e.port.decisions[0], state: 'REJECTED' });
    expect((await e.adapter.configurationPreflight(e.context, scope, request)).guard.reason).toBe(
      'CONFIG_LINEAGE_UNVERIFIED',
    );
  });
  it('checks exact approval-rule revision', async () => {
    const e = await setup();
    e.port.decisions = e.port.decisions.map((d) => ({ ...d, ruleRef: ref('stale-rule') }));
    blocked((await e.adapter.configurationPreflight(e.context, scope, request)).guard);
    blocked((await e.adapter.audit(e.context, scope, auditRequest)).guard);
  });
  it('projects W01 audit without actor identifiers, payloads or confirmed counts', async () => {
    const e = await setup();
    Object.assign(e.port.auditRead.records[0], {
      actorId: 'private-id',
      message: 'private-token',
      password: 'private-value',
    });
    const r = await e.adapter.audit(e.context, scope, auditRequest);
    met(r.guard);
    expect(r).toMatchObject({
      confirmedEventCount: null,
      completeness: 'INCOMPLETE',
      historyModified: false,
      runtimeAuthorized: false,
    });
    expect(r.records[0].evidenceState).toBe('UNVERIFIED');
    expect(JSON.stringify(r)).not.toMatch(/private-actor|private-id|private-token|private-value/);
  });
  it('an empty audit fixture never proves confirmed zero or complete history', async () => {
    const e = await setup();
    e.port.auditRead = { ...e.port.auditRead, records: [] };
    const r = await e.adapter.audit(e.context, scope, auditRequest);
    met(r.guard);
    expect(r.records).toEqual([]);
    expect(r.confirmedEventCount).toBeNull();
    expect(r.completeness).toBe('INCOMPLETE');
  });
  it.each(['W05B', 'W09'])('rejects %s as an official W01 audit feed', async (sourceWave) => {
    const e = await setup();
    Object.assign(e.port.auditRead, { sourceWave });
    const r = await e.adapter.audit(e.context, scope, auditRequest);
    blocked(r.guard);
    expect(r.records).toEqual([]);
    expect(r.confirmedEventCount).toBeNull();
  });
  it.each(['scope', 'revision', 'fieldPolicy', 'eventCode', 'timestamp'])(
    'rejects conflicting audit %s',
    async (change) => {
      const e = await setup(),
        row = e.port.auditRead.records[0];
      e.port.auditRead = {
        ...e.port.auditRead,
        records: [
          {
            ...row,
            ...(change === 'scope' ? { scope: { ...scope, id: 'foreign-area' } } : {}),
            ...(change === 'revision' ? { sourceRevision: ref('stale-source') } : {}),
            ...(change === 'fieldPolicy' ? { fieldPolicyRef: ref('foreign-policy') } : {}),
            ...(change === 'eventCode' ? { eventCode: 'NOT_ALLOWLISTED' } : {}),
            ...(change === 'timestamp' ? { occurredAt: 'not-a-date' } : {}),
          },
        ],
      };
      const r = await e.adapter.audit(e.context, scope, auditRequest);
      blocked(r.guard);
      expect(r.records).toEqual([]);
    },
  );
  it('rejects repeated audit revisions without rewriting history', async () => {
    const e = await setup();
    e.port.auditRead = {
      ...e.port.auditRead,
      records: [e.port.auditRead.records[0], e.port.auditRead.records[0]],
    };
    expect((await e.adapter.audit(e.context, scope, auditRequest)).guard.reason).toBe(
      'AUDIT_HISTORY_AMBIGUOUS',
    );
  });
  it('requires approved scoped audit field policy', async () => {
    const e = await setup();
    e.port.auditRead = {
      ...e.port.auditRead,
      fieldPolicy: { ...e.port.auditRead.fieldPolicy, scope: { ...scope, id: 'foreign-area' } },
    };
    expect((await e.adapter.audit(e.context, scope, auditRequest)).guard.reason).toBe(
      'AUDIT_FIELD_POLICY_UNVERIFIED',
    );
  });
  it('rejects stale audit manifest before projecting records', async () => {
    const e = await setup();
    expect(
      (await e.adapter.audit(e.context, scope, { expectedManifest: ref('old-manifest') })).guard
        .reason,
    ).toBe('AUDIT_MANIFEST_STALE');
  });
  it.each(['missing', 'incomplete', 'lineage'])(
    'fails closed for %s source evidence',
    async (change) => {
      const e = await setup();
      if (change === 'missing') e.port.missing = true;
      if (change === 'incomplete') {
        e.port.config = { ...e.port.config, completeness: 'INCOMPLETE' };
        e.port.auditRead = { ...e.port.auditRead, completeness: 'INCOMPLETE' };
      }
      if (change === 'lineage') e.port.lineageComplete = false;
      blocked((await e.adapter.configurationPreflight(e.context, scope, request)).guard);
      blocked((await e.adapter.audit(e.context, scope, auditRequest)).guard);
    },
  );
  it('rechecks both config/audit source heads after lineage reads', async () => {
    const e = await setup();
    e.port.afterLineage = () => {
      e.port.configHead = ref('changed');
      e.port.auditHead = ref('changed');
    };
    expect((await e.adapter.configurationPreflight(e.context, scope, request)).guard.reason).toBe(
      'TECHNICAL_SOURCE_HEAD_CHANGED_OR_UNAVAILABLE',
    );
    expect((await e.adapter.audit(e.context, scope, auditRequest)).guard.reason).toBe(
      'TECHNICAL_SOURCE_HEAD_CHANGED_OR_UNAVAILABLE',
    );
  });
  it('blocks source disappearance without retries', async () => {
    const e = await setup();
    e.port.missingHead = true;
    blocked((await e.adapter.audit(e.context, scope, auditRequest)).guard);
    expect(e.port.headReads).toBe(1);
  });
  it.each(['ops.config.change', 'ops.audit.read'] as const)(
    'blocks revoked %s before source disclosure',
    async (permission) => {
      const e = await setup();
      e.grants.revoked.add(permission);
      const r =
        permission === 'ops.config.change'
          ? await e.adapter.configurationPreflight(e.context, scope, request)
          : await e.adapter.audit(e.context, scope, auditRequest);
      blocked(r.guard);
      expect(e.port.configReads + e.port.auditReads).toBe(0);
    },
  );
  it.each(['ops.config.change', 'ops.audit.read'] as const)(
    'blocks %s revoked during the final head read',
    async (permission) => {
      const e = await setup();
      e.port.afterHead = () => {
        e.grants.revoked.add(permission);
      };
      const r =
        permission === 'ops.config.change'
          ? await e.adapter.configurationPreflight(e.context, scope, request)
          : await e.adapter.audit(e.context, scope, auditRequest);
      expect(r.guard.decision).toBe('DENIED');
      expect(r.runtimeAuthorized).toBe(false);
    },
  );
  it('sanitizes source failures without exposing credentials or retrying', async () => {
    const e = await setup();
    e.port.fail = true;
    const r = await e.adapter.configurationPreflight(e.context, scope, request);
    expect(r.guard.reason).toBe('TECHNICAL_SOURCE_READ_FAILED');
    expect(JSON.stringify(r)).not.toContain('private-provider-password');
    expect(e.port.configReads).toBe(1);
  });
  it('does not mutate source audit history', async () => {
    const e = await setup(),
      before = JSON.stringify(e.port.auditRead);
    await e.adapter.audit(e.context, scope, auditRequest);
    expect(JSON.stringify(e.port.auditRead)).toBe(before);
  });
});
