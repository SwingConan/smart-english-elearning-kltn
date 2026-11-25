import { OperationsAuthorityAdapter } from './operations-authority-adapter';
import type {
  OperationsAuthorityContext,
  OperationsAuthorityPort,
  PrincipalRead,
} from './operations-authority.contracts';
import { OperationsSourceAdapter } from './operations-source-adapters';
import type {
  CmsSourceRead,
  DailySourceRead,
  OperationsSourcePort,
  OfficialDecisionContract,
  ExportBoundaryRequest,
} from './operations-source.contracts';
import { OperationsTechnicalAdapter } from './operations-technical-adapter';
import type {
  OperationsTechnicalSourcePort,
  ConfigurationPreflightRead,
  TechnicalAuditRead,
} from './operations-technical.contracts';
import type {
  BusinessRole,
  GrantRead,
  ResourceScope,
  Revision,
  SourceDomain,
  SourceWave,
} from './operations.contracts';
import { OperationsOfflineWorkbench } from './operations-workbench';
import type {
  OperationsWorkbenchPlan,
  OperationsWorkbenchSelection,
} from './operations-workbench.contracts';

const ref = (id: string, revision = 'synthetic-1'): Revision => ({ id, revision });
const date = '2026-11-06';
const roleScopes: readonly [BusinessRole, ResourceScope['kind'], SourceDomain, SourceWave][] = [
  ['STUDENT', 'LEARNER', 'LEARNING', 'W03'],
  ['INSTRUCTOR', 'CLASS', 'TEACHING', 'W02'],
  ['COUNSELOR', 'SUPPORT_QUEUE', 'SUPPORT', 'W05A'],
  ['ACADEMIC_MANAGER', 'CLASS', 'ACADEMIC', 'W02'],
  ['CASHIER', 'LEDGER', 'FINANCE', 'W07'],
  ['TEACHING_INSPECTOR', 'INSPECTION', 'INSPECTION', 'W08'],
  ['SYSTEM_ADMIN', 'TECHNICAL', 'ACCOUNTS', 'W01'],
];
async function environment(role: BusinessRole = 'STUDENT', kind?: ResourceScope['kind']) {
  const projection = roleScopes.find((row) => row[0] === role)!;
  const scope: ResourceScope = {
    kind: kind ?? projection[1],
    id: role === 'STUDENT' ? 'synthetic-user' : 'synthetic-scope',
  };
  const state = {
    grant: 'ACTIVE' as GrantRead['state'],
    validity: 'VALID' as GrantRead['validity'],
    principalFailure: false,
    sourceFailure: false,
    sourceReads: 0,
  };
  const principal: PrincipalRead = {
    ref: ref('principal'),
    accountState: 'ACTIVE',
    authorityEpoch: 'synthetic-epoch',
    principal: {
      principalId: 'synthetic-user',
      personId: 'synthetic-person',
      role,
      sessionRef: ref('session'),
      sessionState: 'AUTHENTICATED',
    },
  };
  const authPort: OperationsAuthorityPort = {
    mode: 'IN_MEMORY_ONLY',
    readPrincipal: async () => {
      if (state.principalFailure) throw Error('password=NEVER_DISCLOSE');
      return structuredClone(principal);
    },
    readGrant: async (principalId, permission, target) => ({
      ref: ref('grant-' + permission),
      principalId,
      permission,
      scope: target,
      state: state.grant,
      validity: state.validity,
      authorityEpoch: 'synthetic-epoch',
      decisionRef: ref('grant-decision'),
      authorityRef: ref('grant-authority'),
    }),
  };
  const authority = new OperationsAuthorityAdapter(authPort);
  const context = (await authority.open()).context!;
  const decision = (
    id: string,
    subject: string,
    purpose: OfficialDecisionContract['purpose'],
    rule: string,
  ): OfficialDecisionContract => ({
    ref: ref(id),
    subjectRef: ref(subject),
    purpose,
    ruleRef: ref(rule),
    scope,
    authorityRef: ref('independent-authority'),
    state: 'APPROVED',
  });
  const decisions = [
    decision('metric-approval', 'metric-policy', 'POLICY', 'policy-rule'),
    decision('confirmation', 'metric-source', 'CONFIRMATION', 'confirmation-rule'),
    decision('cms-approval', 'cms-policy', 'POLICY', 'policy-rule'),
    decision('license', 'cms-revision', 'LICENSE', 'license-rule'),
    decision('technical-approval', 'technical-policy', 'POLICY', 'policy-rule'),
    decision('technical-confirmation', 'technical-source', 'CONFIRMATION', 'confirmation-rule'),
  ];
  const exportRequest: ExportBoundaryRequest = {
    metricCodes: ['SYNTHETIC_METRIC'],
    statusFilters: ['CONFIRMED', 'PENDING'],
    fields: [{ code: 'SYNTHETIC_VALUE', masking: 'FULL', classification: 'PUBLIC' }],
    format: 'CSV',
    auditCorrelationRef: ref('correlation'),
  };
  const daily: DailySourceRead = {
    manifestRef: ref('daily-head'),
    lineagePin: ref('lineage'),
    scope,
    completeness: 'COMPLETE',
    definitions: [
      {
        ref: ref('metric-policy'),
        state: 'APPROVED',
        approvalRef: ref('metric-approval'),
        code: 'SYNTHETIC_METRIC',
        role,
        domain: projection[2],
        sourceWave: projection[3],
        required: true,
        scope,
        statusPredicateRef: ref('status'),
        confirmationRuleRef: ref('confirmation-rule'),
        effectiveTimeRuleRef: ref('effective-rule'),
        expectedSourcePin: ref('metric-source'),
      },
    ],
    records: [
      {
        claim: {
          metricCode: 'SYNTHETIC_METRIC',
          sourceRef: ref('metric-source'),
          scope,
          domain: projection[2],
          sourceWave: projection[3],
          effectiveAt: '2026-11-06T01:00:00.000Z',
          evidenceState: 'CONFIRMED',
          completeness: 'COMPLETE',
          value: 0,
          supersedesRef: null,
          provenance: 'OFFLINE_SYNTHETIC',
        },
        decisionPins: [ref('confirmation')],
        existing: null,
      },
    ],
    view: {
      viewerPrincipalId: 'synthetic-user',
      role,
      scope,
      day: { date, timeZone: 'Asia/Ho_Chi_Minh', configurationRef: ref('center-timezone') },
      manifestRef: ref('daily-head'),
      metricCodes: exportRequest.metricCodes,
      statusFilters: exportRequest.statusFilters,
      fields: exportRequest.fields,
      requiredSourcesComplete: true,
    },
  };
  const cms: CmsSourceRead = {
    manifestRef: ref('cms-head'),
    lineagePin: ref('lineage'),
    scope,
    completeness: 'COMPLETE',
    data: {
      revision: {
        ref: ref('cms-revision'),
        contentId: scope.id,
        state: role === 'COUNSELOR' ? 'DRAFT' : 'IN_REVIEW',
        parentRef: null,
        authorPersonIds: ['synthetic-other-author'],
        authorshipComplete: true,
        assetClearance: 'APPROVED',
        licensingDecisionRef: ref('license'),
      },
      parent: null,
      policy: {
        ref: ref('cms-policy'),
        state: 'APPROVED',
        approvalRef: ref('cms-approval'),
        scope,
        actions: ['EDIT_DRAFT', 'SUBMIT_REVIEW', 'PUBLISH', 'REJECT', 'WITHDRAW'],
      },
      reasonRef: ref('decision-reason'),
    },
  };
  const sourcesPort: OperationsSourcePort = {
    mode: 'IN_MEMORY_ONLY',
    readCms: async () => {
      state.sourceReads++;
      if (state.sourceFailure) throw Error('token=NEVER_DISCLOSE');
      return structuredClone(cms);
    },
    readDaily: async () => {
      state.sourceReads++;
      return structuredClone(daily);
    },
    readLineage: async (_a, manifestRef, lineagePin) => ({
      ref: lineagePin,
      manifestRef,
      completeness: 'COMPLETE',
      decisions: structuredClone(decisions),
    }),
    readCurrentHead: async (_a, kind) => (kind === 'CMS' ? cms.manifestRef : daily.manifestRef),
  };
  const base = {
    manifestRef: ref('technical-head'),
    lineagePin: ref('lineage'),
    sourceRevision: ref('technical-source'),
    sourceConfirmationRuleRef: ref('confirmation-rule'),
    policyApprovalRuleRef: ref('policy-rule'),
    scope,
    completeness: 'COMPLETE' as const,
  };
  const configuration: ConfigurationPreflightRead = {
    ...base,
    binding: { settingCode: 'LOG_LEVEL', requestRef: ref('config-request') },
    configured: false,
    check: {
      sensitivity: 'ORDINARY',
      sensitiveApproval: null,
      policy: {
        ref: ref('technical-policy'),
        state: 'APPROVED',
        approvalRef: ref('technical-approval'),
        scope,
        allowedSettingCodes: ['LOG_LEVEL'],
      },
    },
  };
  const audit: TechnicalAuditRead = {
    ...base,
    sourceWave: 'W01',
    fieldPolicy: {
      ref: ref('technical-policy'),
      state: 'APPROVED',
      approvalRef: ref('technical-approval'),
      scope,
      allowedEventCodes: ['GRANT_REVOKED'],
    },
    records: [
      {
        ref: ref('audit-event'),
        scope,
        occurredAt: '2026-11-06T01:00:00.000Z',
        eventCode: 'GRANT_REVOKED',
        actorPseudonym: 'not-for-ui',
        fieldPolicyRef: ref('technical-policy'),
        sourceRevision: ref('technical-source'),
      },
    ],
  };
  const technicalPort: OperationsTechnicalSourcePort = {
    mode: 'IN_MEMORY_ONLY',
    readConfigurationPreflight: async () => structuredClone(configuration),
    readAudit: async () => structuredClone(audit),
    readLineage: sourcesPort.readLineage,
    readCurrentHead: async () => base.manifestRef,
  };
  const sources = new OperationsSourceAdapter(authority, sourcesPort),
    technical = new OperationsTechnicalAdapter(authority, technicalPort);
  const plan: OperationsWorkbenchPlan = {
    configuration: configuration.binding,
    auditManifest: base.manifestRef,
    export: { date, request: exportRequest, displayFilters: { source: 'ALL', state: 'ALL' } },
  };
  const workbench = new OperationsOfflineWorkbench(
    authority,
    sources,
    technical,
    context,
    scope,
    plan,
  );
  return {
    workbench,
    authority,
    sources,
    technical,
    authPort,
    context,
    scope,
    state,
    sourcesPort,
    daily,
    cms,
    configuration,
    plan,
  };
}
const dailySelection = (scopeId: string): OperationsWorkbenchSelection => ({
  kind: 'DAILY',
  scopeId,
  date,
});
const exportSelection = (scopeId: string): OperationsWorkbenchSelection => ({
  kind: 'EXPORT',
  scopeId,
  date,
  filters: { source: 'ALL', state: 'ALL' },
});
function neverPerformed(r: Awaited<ReturnType<OperationsOfflineWorkbench['check']>>) {
  expect(r).toMatchObject({
    runtimeAuthorized: false,
    mutationPerformed: false,
    exportPerformed: false,
    auditPersisted: false,
    guard: { runtimeAuthorized: false, requiresServerVerification: true },
  });
}

describe('W10 offline UI/backend workbench composition', () => {
  it.each(roleScopes)(
    '%s report -> export preflight reuses existing guarded adapters without executing',
    async (role) => {
      const e = await environment(role);
      const viewed = await e.workbench.check(dailySelection(e.scope.id));
      expect(viewed.guard.decision).toBe('CONDITIONS_MET_OFFLINE');
      neverPerformed(viewed);
      const exported = await e.workbench.check(exportSelection(e.scope.id));
      expect(exported.guard.decision).toBe('CONDITIONS_MET_OFFLINE');
      neverPerformed(exported);
    },
  );
  it.each(['REVOKED', 'UNKNOWN'] as const)('does not read source under %s grant', async (grant) => {
    const e = await environment();
    e.state.grant = grant;
    const r = await e.workbench.check(dailySelection(e.scope.id));
    expect(r.guard.decision).not.toBe('CONDITIONS_MET_OFFLINE');
    expect(e.state.sourceReads).toBe(0);
    neverPerformed(r);
  });
  it('rejects invalid grants before source disclosure', async () => {
    const e = await environment();
    e.state.validity = 'INVALID';
    expect((await e.workbench.check(dailySelection(e.scope.id))).guard.decision).toBe('DENIED');
    expect(e.state.sourceReads).toBe(0);
  });
  it('denies cross-resource selection without source reads', async () => {
    const e = await environment();
    expect((await e.workbench.check(dailySelection('foreign'))).guard.reason).toBe(
      'WORKBENCH_SCOPE_DENIED',
    );
    expect(e.state.sourceReads).toBe(0);
  });
  it('cannot use a forged or differently issued authority context', async () => {
    const e = await environment();
    const w = new OperationsOfflineWorkbench(
      e.authority,
      e.sources,
      e.technical,
      {} as OperationsAuthorityContext,
      e.scope,
    );
    expect((await w.check(dailySelection(e.scope.id))).guard.reason).toBe('UNBOUND_CONTEXT');
    expect(e.state.sourceReads).toBe(0);
  });
  it('requires a previous guarded view and exact date/filter plan', async () => {
    const e = await environment();
    expect((await e.workbench.check(exportSelection(e.scope.id))).guard.reason).toBe(
      'VIEW_PREFLIGHT_REQUIRED',
    );
    await e.workbench.check(dailySelection(e.scope.id));
    expect(
      (
        await e.workbench.check({
          kind: 'EXPORT',
          scopeId: e.scope.id,
          date: '2026-11-07',
          filters: { source: 'ALL', state: 'ALL' },
        })
      ).guard.reason,
    ).toBe('EXPORT_SCHEMA_BINDING_UNAVAILABLE');
    expect(
      (
        await e.workbench.check({
          kind: 'EXPORT',
          scopeId: e.scope.id,
          date,
          filters: { source: 'W09', state: 'ALL' },
        })
      ).guard.reason,
    ).toBe('EXPORT_DISPLAY_FILTER_BINDING_UNAVAILABLE');
  });
  it('revocation between view/export denies and invalidates the cached ticket', async () => {
    const e = await environment();
    await e.workbench.check(dailySelection(e.scope.id));
    e.state.grant = 'REVOKED';
    expect((await e.workbench.check(exportSelection(e.scope.id))).guard.decision).toBe('DENIED');
    e.state.grant = 'ACTIVE';
    expect((await e.workbench.check(exportSelection(e.scope.id))).guard.reason).toBe(
      'VIEW_PREFLIGHT_REQUIRED',
    );
  });
  it('source change after view is blocked by the existing export head check', async () => {
    const e = await environment();
    await e.workbench.check(dailySelection(e.scope.id));
    jest.spyOn(e.sourcesPort, 'readCurrentHead').mockResolvedValue(ref('new-head'));
    expect((await e.workbench.check(exportSelection(e.scope.id))).guard.decision).not.toBe(
      'CONDITIONS_MET_OFFLINE',
    );
  });
  it('missing source never creates an export ticket', async () => {
    const e = await environment();
    jest.spyOn(e.sourcesPort, 'readDaily').mockResolvedValue(null);
    expect((await e.workbench.check(dailySelection(e.scope.id))).guard.decision).toBe('BLOCKED');
    expect((await e.workbench.check(exportSelection(e.scope.id))).guard.reason).toBe(
      'VIEW_PREFLIGHT_REQUIRED',
    );
  });
  it('concurrent older view cannot replace the newer selection ticket', async () => {
    const e = await environment();
    let resolve!: (v: DailySourceRead) => void;
    let entered!: () => void;
    const sourceEntered = new Promise<void>((r) => {
      entered = r;
    });
    jest.spyOn(e.sourcesPort, 'readDaily').mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r;
          entered();
        }),
    );
    const first = e.workbench.check(dailySelection(e.scope.id));
    // Explicit in-memory barrier, no polling/fake clock or increased timeout.
    await sourceEntered;
    const second = await e.workbench.check(dailySelection(e.scope.id));
    expect(second.guard.decision).toBe('CONDITIONS_MET_OFFLINE');
    resolve(structuredClone(e.daily));
    expect((await first).guard.reason).toBe('VIEW_PREFLIGHT_SUPERSEDED');
    expect((await e.workbench.check(exportSelection(e.scope.id))).guard.decision).toBe(
      'CONDITIONS_MET_OFFLINE',
    );
  });
  it.each(['EDIT_DRAFT', 'SUBMIT_REVIEW'] as const)(
    'TV %s is a condition check, never a saved revision',
    async (action) => {
      const e = await environment('COUNSELOR', 'CMS');
      const r = await e.workbench.check({
        kind: 'CMS',
        scopeId: e.scope.id,
        request: { action, expectedRevision: ref('cms-revision') },
      });
      expect(r.guard.decision).toBe('CONDITIONS_MET_OFFLINE');
      neverPerformed(r);
    },
  );
  it('HVU review pins a detached revision before asynchronous reads; self-approval denied', async () => {
    const e = await environment('ACADEMIC_MANAGER', 'CMS');
    const q = {
      kind: 'CMS' as const,
      scopeId: e.scope.id,
      request: {
        action: 'PUBLISH' as const,
        expectedRevision: { id: 'cms-revision', revision: 'synthetic-1' },
      },
    };
    const pending = e.workbench.check(q);
    q.request.expectedRevision.revision = 'changed';
    const r = await pending;
    expect(r.guard.decision).toBe('CONDITIONS_MET_OFFLINE');
    neverPerformed(r);
    const self = {
      ...e.cms,
      data: {
        ...e.cms.data,
        revision: { ...e.cms.data.revision, authorPersonIds: ['synthetic-person'] },
      },
    };
    jest.spyOn(e.sourcesPort, 'readCms').mockResolvedValue(self);
    expect(
      (
        await e.workbench.check({
          kind: 'CMS',
          scopeId: e.scope.id,
          request: { action: 'PUBLISH', expectedRevision: ref('cms-revision') },
        })
      ).guard.reason,
    ).toBe('AUTHOR_CANNOT_APPROVE');
  });
  it('stale CMS revision cannot follow the latest revision implicitly', async () => {
    const e = await environment('ACADEMIC_MANAGER', 'CMS');
    expect(
      (
        await e.workbench.check({
          kind: 'CMS',
          scopeId: e.scope.id,
          request: { action: 'PUBLISH', expectedRevision: ref('cms-revision', 'old') },
        })
      ).guard.reason,
    ).toBe('REVISION_STALE');
  });
  it('QT configuration and audit route to the existing technical adapters only', async () => {
    const e = await environment('SYSTEM_ADMIN');
    for (const q of [
      { kind: 'CONFIGURATION', scopeId: e.scope.id, settingCode: 'LOG_LEVEL' },
      { kind: 'AUDIT', scopeId: e.scope.id },
    ] as const) {
      const r = await e.workbench.check(q);
      expect(r.guard.decision).toBe('CONDITIONS_MET_OFFLINE');
      neverPerformed(r);
      expect(JSON.stringify(r)).not.toContain('not-for-ui');
    }
  });
  it('unknown configuration or missing bound server plans fail closed', async () => {
    const e = await environment('SYSTEM_ADMIN');
    expect(
      (
        await e.workbench.check({
          kind: 'CONFIGURATION',
          scopeId: e.scope.id,
          settingCode: 'FOREIGN_SETTING',
        })
      ).guard.reason,
    ).toBe('CONFIG_REQUEST_BINDING_MISMATCH');
    const w = new OperationsOfflineWorkbench(
      e.authority,
      e.sources,
      e.technical,
      e.context,
      e.scope,
    );
    expect(
      (await w.check({ kind: 'CONFIGURATION', scopeId: e.scope.id, settingCode: 'LOG_LEVEL' }))
        .guard.reason,
    ).toBe('CONFIG_REQUEST_BINDING_UNAVAILABLE');
    expect((await w.check({ kind: 'AUDIT', scopeId: e.scope.id })).guard.reason).toBe(
      'AUDIT_REVISION_BINDING_UNAVAILABLE',
    );
  });
  it('does not resolve sensitive approval policy from an in-memory plan', async () => {
    const e = await environment('SYSTEM_ADMIN');
    const port: OperationsTechnicalSourcePort = {
      mode: 'IN_MEMORY_ONLY',
      readConfigurationPreflight: async () => ({
        ...e.configuration,
        check: { ...e.configuration.check, sensitivity: 'SENSITIVE' },
      }),
      readAudit: async () => null,
      readLineage: async () => null,
      readCurrentHead: async () => null,
    };
    const w = new OperationsOfflineWorkbench(
      e.authority,
      e.sources,
      new OperationsTechnicalAdapter(e.authority, port),
      e.context,
      e.scope,
      e.plan,
    );
    expect(
      (await w.check({ kind: 'CONFIGURATION', scopeId: e.scope.id, settingCode: 'LOG_LEVEL' }))
        .guard.reason,
    ).toBe('SENSITIVE_APPROVER_POLICY_OPEN');
  });
  it('sanitizes provider errors and has no performed-success branch', async () => {
    const e = await environment('ACADEMIC_MANAGER', 'CMS');
    e.state.sourceFailure = true;
    const r = await e.workbench.check({
      kind: 'CMS',
      scopeId: e.scope.id,
      request: { action: 'PUBLISH', expectedRevision: ref('cms-revision') },
    });
    expect(r.guard.decision).toBe('BLOCKED');
    expect(JSON.stringify(r)).not.toContain('NEVER_DISCLOSE');
    neverPerformed(r);
  });
});
