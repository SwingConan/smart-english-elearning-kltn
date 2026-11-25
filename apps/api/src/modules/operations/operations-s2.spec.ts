import type {
  BusinessRole,
  CmsModerationCheck,
  GrantRead,
  Permission,
  ResourceScope,
  Revision,
  ScopedAccess,
  SourceDomain,
  SourceWave,
} from './operations.contracts';
import type {
  OperationsAuthorityContext,
  OperationsAuthorityPort,
  PrincipalRead,
} from './operations-authority.contracts';
import { copyBoundaryData, OperationsAuthorityAdapter } from './operations-authority-adapter';
import type {
  CmsSourceRead,
  DailySourceRead,
  ExportBoundaryRequest,
  MetricReadRecord,
  OfficialDecisionContract,
  OperationsSourcePort,
  OperationsViewTicket,
  SourceLineageRead,
} from './operations-source.contracts';
import { analyzeSourceClaim, OperationsSourceAdapter } from './operations-source-adapters';

type Mutable<T> = { -readonly [K in keyof T]: T[K] };
const ref = (id: string, revision = 'synthetic-1'): Revision => ({ id, revision });
const roles: readonly [BusinessRole, ResourceScope['kind'], SourceDomain, SourceWave][] = [
  ['STUDENT', 'LEARNER', 'LEARNING', 'W03'],
  ['INSTRUCTOR', 'CLASS', 'TEACHING', 'W02'],
  ['COUNSELOR', 'SUPPORT_QUEUE', 'CONSULTATION', 'W05B'],
  ['ACADEMIC_MANAGER', 'CLASS', 'ACADEMIC', 'W02'],
  ['CASHIER', 'LEDGER', 'FINANCE', 'W07'],
  ['TEACHING_INSPECTOR', 'INSPECTION', 'INSPECTION', 'W08'],
  ['SYSTEM_ADMIN', 'TECHNICAL', 'ACCOUNTS', 'W01'],
];
const ok = (g: { decision: string }) => expect(g.decision).toBe('CONDITIONS_MET_OFFLINE');
const denied = (g: { decision: string }) => expect(g.decision).not.toBe('CONDITIONS_MET_OFFLINE');
class MemoryAuthority implements OperationsAuthorityPort {
  mode: 'IN_MEMORY_ONLY' | 'UNIMPLEMENTED' = 'IN_MEMORY_ONLY';
  principal: PrincipalRead;
  reads = 0;
  grantReads = 0;
  revision = 'synthetic-1';
  grantScope: ResourceScope | null = null;
  state: GrantRead['state'] = 'ACTIVE';
  validity: GrantRead['validity'] = 'VALID';
  fail = false;
  revoked = new Set<Permission>();
  constructor(role: BusinessRole) {
    this.principal = {
      ref: ref('principal-read'),
      principal: {
        principalId: 'user-A',
        personId: 'person-A',
        role,
        sessionRef: ref('server-session'),
        sessionState: 'AUTHENTICATED',
      },
      accountState: 'ACTIVE',
      authorityEpoch: 'epoch-1',
    };
  }
  async readPrincipal() {
    this.reads++;
    if (this.fail) throw Error('private credential detail');
    return structuredClone(this.principal);
  }
  async readGrant(
    principalId: string,
    permission: Permission,
    scope: ResourceScope,
  ): Promise<GrantRead | null> {
    this.grantReads++;
    if (this.fail) throw Error('private credential detail');
    return {
      ref: ref('grant-' + permission, this.revision),
      principalId,
      permission,
      scope: this.grantScope ?? scope,
      state: this.revoked.has(permission) ? 'REVOKED' : this.state,
      validity: this.validity,
      authorityEpoch: 'epoch-1',
      decisionRef: ref('grant-decision'),
      authorityRef: ref('independent-authority'),
    };
  }
}
class MemorySources implements OperationsSourcePort {
  mode: 'IN_MEMORY_ONLY' | 'UNIMPLEMENTED' = 'IN_MEMORY_ONLY';
  dailyData: Mutable<DailySourceRead>;
  cmsData: Mutable<CmsSourceRead>;
  dailyHead = ref('daily-head');
  cmsHead = ref('cms-head');
  decisions: OfficialDecisionContract[] = [];
  reads = 0;
  headReads = 0;
  lineageReads = 0;
  fail = false;
  missing = false;
  missingHead = false;
  lineageComplete = true;
  aliases = false;
  afterRead?: () => void;
  afterLineage?: () => void;
  constructor(role: BusinessRole, target: ResourceScope, domain: SourceDomain, wave: SourceWave) {
    const definition = {
      ref: ref('metric-rule'),
      state: 'APPROVED' as const,
      approvalRef: ref('metric-policy-decision'),
      code: 'SYNTHETIC_METRIC',
      role,
      domain,
      sourceWave: wave,
      required: true,
      scope: target,
      statusPredicateRef: ref('status-predicate'),
      confirmationRuleRef: ref('confirmation-rule'),
      effectiveTimeRuleRef: ref('effective-time-rule'),
      expectedSourcePin: ref('official-source'),
    };
    this.dailyData = {
      manifestRef: this.dailyHead,
      lineagePin: ref('lineage'),
      scope: target,
      completeness: 'COMPLETE',
      definitions: [definition],
      records: [
        {
          claim: {
            metricCode: definition.code,
            sourceRef: definition.expectedSourcePin,
            scope: target,
            domain,
            sourceWave: wave,
            effectiveAt: '2026-11-05T01:00:00Z',
            evidenceState: 'CONFIRMED',
            completeness: 'COMPLETE',
            value: 0,
            supersedesRef: null,
            provenance: 'OFFLINE_SYNTHETIC',
          },
          decisionPins: [ref('confirmation-decision')],
          existing: null,
        },
      ],
      view: {
        viewerPrincipalId: 'user-A',
        role,
        scope: target,
        day: {
          date: '2026-11-05',
          timeZone: 'Asia/Ho_Chi_Minh',
          configurationRef: ref('center-timezone'),
        },
        manifestRef: this.dailyHead,
        metricCodes: [definition.code],
        statusFilters: ['CONFIRMED', 'PENDING'],
        fields: [
          { code: 'SYNTHETIC_VALUE', masking: 'FULL', classification: 'PUBLIC' },
          { code: 'SYNTHETIC_ACTOR', masking: 'MASKED', classification: 'PRIVATE' },
        ],
        requiredSourcesComplete: true,
      },
    };
    const data: Omit<CmsModerationCheck, 'access' | 'action' | 'expectedRevision'> = {
      revision: {
        ref: ref('cms-revision'),
        contentId: target.id,
        state: 'IN_REVIEW',
        parentRef: null,
        authorPersonIds: ['different-author-person'],
        authorshipComplete: true,
        assetClearance: 'APPROVED',
        licensingDecisionRef: ref('license-decision'),
      },
      parent: null,
      policy: {
        ref: ref('cms-policy'),
        state: 'APPROVED',
        approvalRef: ref('cms-policy-decision'),
        scope: target,
        actions: ['PUBLISH', 'REJECT', 'WITHDRAW', 'EDIT_DRAFT', 'SUBMIT_REVIEW'],
      },
      reasonRef: ref('decision-reason'),
    };
    this.cmsData = {
      manifestRef: this.cmsHead,
      lineagePin: ref('lineage'),
      scope: target,
      completeness: 'COMPLETE',
      data,
    };
    this.decisions = [
      {
        ref: definition.approvalRef,
        subjectRef: definition.ref,
        scope: target,
        ruleRef: ref('policy-approval-rule'),
        authorityRef: ref('independent-policy-authority'),
        purpose: 'POLICY',
        state: 'APPROVED',
      },
      {
        ref: ref('confirmation-decision'),
        subjectRef: definition.expectedSourcePin,
        scope: target,
        ruleRef: definition.confirmationRuleRef,
        authorityRef: ref('independent-source-authority'),
        purpose: 'CONFIRMATION',
        state: 'APPROVED',
      },
      {
        ref: ref('cms-policy-decision'),
        subjectRef: data.policy.ref,
        scope: target,
        ruleRef: ref('cms-approval-rule'),
        authorityRef: ref('cms-policy-authority'),
        purpose: 'POLICY',
        state: 'APPROVED',
      },
      {
        ref: ref('license-decision'),
        subjectRef: data.revision.ref,
        scope: target,
        ruleRef: ref('license-rule'),
        authorityRef: ref('license-authority'),
        purpose: 'LICENSE',
        state: 'APPROVED',
      },
    ];
  }
  async readDaily(_a: ScopedAccess, _date: string) {
    this.reads++;
    if (this.fail) throw Error('private source URL');
    if (this.missing) return null;
    const r = this.aliases ? this.dailyData : structuredClone(this.dailyData);
    this.afterRead?.();
    return r;
  }
  async readCms(_a: ScopedAccess) {
    this.reads++;
    if (this.fail) throw Error('private source URL');
    return this.missing ? null : structuredClone(this.cmsData);
  }
  async readLineage(
    _a: ScopedAccess,
    manifestRef: Revision,
    lineagePin: Revision,
  ): Promise<SourceLineageRead> {
    this.lineageReads++;
    const read = {
      ref: lineagePin,
      manifestRef,
      completeness: this.lineageComplete ? ('COMPLETE' as const) : ('INCOMPLETE' as const),
      decisions: structuredClone(this.decisions),
    };
    this.afterLineage?.();
    return read;
  }
  async readCurrentHead(_a: ScopedAccess, kind: 'CMS' | 'DAILY', _selector: string) {
    this.headReads++;
    return this.missingHead
      ? null
      : structuredClone(kind === 'CMS' ? this.cmsHead : this.dailyHead);
  }
}
function setup(tuple = roles[0], cms = false) {
  const [role, kind, domain, wave] = tuple,
    target: ResourceScope = {
      kind: cms ? 'CMS' : kind,
      id: cms ? 'content-A' : kind === 'LEARNER' ? 'user-A' : 'resource-A',
    };
  const a = new MemoryAuthority(role),
    authority = new OperationsAuthorityAdapter(a),
    sources = new MemorySources(role, target, domain, wave),
    boundary = new OperationsSourceAdapter(authority, sources);
  return { a, authority, sources, boundary, target };
}
type Env = ReturnType<typeof setup>;
async function open(e: Env) {
  const o = await e.authority.open();
  ok(o.guard);
  expect(o.context).not.toBeNull();
  return o.context!;
}
async function daily(e: Env, c?: OperationsAuthorityContext) {
  return e.boundary.daily(c ?? (await open(e)), e.target, { date: '2026-11-05' });
}
function exportRequest(e: Env): ExportBoundaryRequest {
  return {
    metricCodes: ['SYNTHETIC_METRIC'],
    statusFilters: ['PENDING'],
    fields: [e.sources.dailyData.view.fields[0]],
    format: 'CSV',
    auditCorrelationRef: ref('audit-intent'),
  };
}
const cmsRequest = { action: 'PUBLISH' as const, expectedRevision: ref('cms-revision') };

describe('W10-S2 authority boundary (controlled in-memory only)', () => {
  it('binds server-port principal without any caller identity/role arguments', async () => {
    const e = setup(),
      c = await open(e),
      r = await e.authority.readAccess(c, 'report.view', e.target);
    ok(r.guard);
    expect(r.access?.actor.principalId).toBe('user-A');
    expect(r.guard.runtimeAuthorized).toBe(false);
  });
  it('fails closed for absent/unimplemented or invented verified providers', async () => {
    const e = setup();
    e.a.mode = 'UNIMPLEMENTED';
    const r = await e.authority.open();
    expect(r.context).toBeNull();
    expect(e.a.reads).toBe(0);
    const missing = await new OperationsAuthorityAdapter(null).open();
    expect(missing.context).toBeNull();
    e.a.mode = 'SERVER_VERIFIED' as MemoryAuthority['mode'];
    expect((await e.authority.open()).context).toBeNull();
  });
  it.each(['INACTIVE', 'UNKNOWN'] as const)('rejects %s account', async (accountState) => {
    const e = setup();
    e.a.principal = { ...e.a.principal, accountState };
    expect((await e.authority.open()).context).toBeNull();
  });
  it.each(['EXPIRED', 'UNKNOWN'] as const)('rejects %s server session', async (sessionState) => {
    const e = setup();
    e.a.principal = { ...e.a.principal, principal: { ...e.a.principal.principal, sessionState } };
    expect((await e.authority.open()).context).toBeNull();
  });
  it('does not accept forged/serialized context, trusted-marker string or another adapter context', async () => {
    const e = setup(),
      c = await open(e),
      foreign = setup();
    for (const fake of [
      {},
      JSON.parse(JSON.stringify(c)),
      { trusted: true, role: 'SYSTEM_ADMIN', runtimeAuthorized: true },
      'TRUSTED_SERVER_PRINCIPAL',
    ]) {
      const r = await e.authority.readAccess(
        fake as OperationsAuthorityContext,
        'report.view',
        e.target,
      );
      expect(r.access).toBeNull();
    }
    expect(
      (await foreign.authority.readAccess(c, 'report.view', foreign.target)).access,
    ).toBeNull();
    expect(foreign.a.grantReads).toBe(0);
  });
  it('rejects legacy role without silently mapping to QT', async () => {
    const e = setup();
    e.a.principal = {
      ...e.a.principal,
      principal: { ...e.a.principal.principal, role: 'ADMIN_COORDINATOR' as BusinessRole },
    };
    expect((await e.authority.open()).context).toBeNull();
  });
  it.each(['REVOKED', 'UNKNOWN'] as const)('blocks %s grant', async (state) => {
    const e = setup(),
      c = await open(e);
    e.a.state = state;
    expect((await e.authority.readAccess(c, 'report.view', e.target)).access).toBeNull();
  });
  it.each(['INVALID', 'UNKNOWN'] as const)('blocks %s validity', async (validity) => {
    const e = setup(),
      c = await open(e);
    e.a.validity = validity;
    expect((await e.authority.readAccess(c, 'report.view', e.target)).access).toBeNull();
  });
  it('denies cross-resource and mismatched permission rather than widening to GLOBAL', async () => {
    const e = setup(),
      c = await open(e);
    e.a.grantScope = { ...e.target, id: 'foreign' };
    expect((await e.authority.readAccess(c, 'report.view', e.target)).access).toBeNull();
    expect(
      (await e.authority.readAccess(c, 'unregistered' as Permission, e.target)).access,
    ).toBeNull();
  });
  it('catches changed session/person/role/grant epoch and revision', async () => {
    for (const variant of ['session', 'person', 'role', 'epoch', 'grant']) {
      const e = setup(),
        c = await open(e);
      ok((await e.authority.readAccess(c, 'report.view', e.target)).guard);
      if (variant === 'grant') e.a.revision = 'after-ABA';
      else if (variant === 'epoch')
        e.a.principal = { ...e.a.principal, authorityEpoch: 'after-ABA' };
      else
        e.a.principal = {
          ...e.a.principal,
          principal: {
            ...e.a.principal.principal,
            ...(variant === 'session'
              ? { sessionRef: ref('new-session') }
              : variant === 'person'
                ? { personId: 'foreign-person' }
                : { role: 'SYSTEM_ADMIN' as const }),
          },
        };
      denied(await e.authority.revalidate(c));
    }
  });
  it('does not expose provider errors, instantiate services or retry authority reads', async () => {
    const e = setup();
    e.a.fail = true;
    const r = await e.authority.open();
    expect(r.context).toBeNull();
    expect(e.a.reads).toBe(1);
    expect(JSON.stringify(r)).not.toContain('private');
  });
  it('rejects accessors and class objects while preserving plain cross-realm data', () => {
    const getter = jest.fn(() => true);
    expect(() =>
      copyBoundaryData(Object.defineProperty({}, 'approved', { get: getter, enumerable: true })),
    ).toThrow();
    expect(getter).not.toHaveBeenCalled();
    expect(() => copyBoundaryData(new Date())).toThrow();
    expect(copyBoundaryData(structuredClone({ id: 'A', values: [0, null] }))).toEqual({
      id: 'A',
      values: [0, null],
    });
  });
});

describe('W10-S2 server-reader composition over immutable S1 guards', () => {
  it('denies a foreign learner before fetching source rows even if a provider supplies a matching grant', async () => {
    const e = setup(),
      c = await open(e);
    const r = await e.boundary.daily(
      c,
      { kind: 'LEARNER', id: 'foreign-learner' },
      { date: '2026-11-05' },
    );
    expect(r.guard.decision).toBe('DENIED');
    expect(e.sources.reads).toBe(0);
    expect(e.sources.lineageReads).toBe(0);
  });
  it('denies role-incompatible CMS access before fetching private author/license data', async () => {
    const e = setup(roles[2], true),
      c = await open(e);
    const r = await e.boundary.cms(c, e.target, cmsRequest);
    expect(r.reason).toBe('ROLE_DENIED');
    expect(e.sources.reads).toBe(0);
    expect(e.sources.lineageReads).toBe(0);
  });
  it.each(roles)(
    'composes %s daily source projection without confirmed runtime facts',
    async (...tuple) => {
      const e = setup(tuple),
        r = await daily(e);
      ok(r.guard);
      expect(r.viewTicket).not.toBeNull();
      expect(r.runtimeAuthorized).toBe(false);
      expect(r.projection?.metrics[0].value).toBeNull();
      expect(r.projection?.metrics[0].evidenceState).toBe('UNVERIFIED');
    },
  );
  it('preserves declared confirmed zero separately from effective unverified runtime data', async () => {
    const e = setup(),
      r = await daily(e);
    expect(r.claimAnalysis[0]).toMatchObject({
      declaredState: 'CONFIRMED',
      declaredValue: 0,
      consistency: 'CONSISTENT_OFFLINE',
      runtimeVerified: false,
    });
    expect(r.projection?.metrics[0].value).toBeNull();
  });
  it.each(['PENDING', 'UNKNOWN', 'UNAVAILABLE', 'UNVERIFIED'] as const)(
    'keeps %s evidence/null distinct from confirmed zero',
    async (evidenceState) => {
      const e = setup();
      e.sources.dailyData.records = e.sources.dailyData.records.map((r) => ({
        ...r,
        claim: { ...r.claim, evidenceState, value: 0 },
      }));
      const r = await daily(e);
      expect(r.claimAnalysis[0].declaredValue).toBeNull();
      expect(r.claimAnalysis[0].declaredState).toBe(evidenceState);
      expect(r.projection?.metrics[0].value).toBeNull();
    },
  );
  it('does not convert null/incomplete evidence into zero', async () => {
    const e = setup();
    e.sources.dailyData.records = e.sources.dailyData.records.map((r) => ({
      ...r,
      claim: { ...r.claim, value: null },
    }));
    const r = await daily(e);
    expect(r.claimAnalysis[0].consistency).toBe('PENDING');
    expect(r.claimAnalysis[0].declaredValue).toBeNull();
  });
  it('requires independent policy and confirmation lineage, not approved booleans in a row', async () => {
    const e = setup();
    e.sources.decisions = e.sources.decisions.filter((d) => d.purpose !== 'POLICY');
    expect((await daily(e)).guard.reason).toBe('METRIC_POLICY_LINEAGE_UNAVAILABLE');
    const f = setup();
    f.sources.decisions = f.sources.decisions.filter((d) => d.purpose !== 'CONFIRMATION');
    const r = await daily(f);
    expect(r.claimAnalysis[0].consistency).toBe('PENDING');
    expect(r.projection?.metrics[0].value).toBeNull();
  });
  it('rejects duplicate/conflicting lineage decisions rather than choosing APPROVED', async () => {
    const e = setup();
    e.sources.decisions.push({ ...e.sources.decisions[0], state: 'REJECTED' });
    expect((await daily(e)).viewTicket).toBeNull();
  });
  it('blocks incomplete snapshot/lineage and missing source provider', async () => {
    const e = setup();
    e.sources.dailyData.completeness = 'INCOMPLETE';
    expect((await daily(e)).projection).toBeNull();
    const f = setup();
    f.sources.lineageComplete = false;
    expect((await daily(f)).projection).toBeNull();
    const g = setup();
    g.sources.mode = 'UNIMPLEMENTED';
    expect((await daily(g)).projection).toBeNull();
    expect(g.sources.reads).toBe(0);
  });
  it('denies caller scope/role spoofing and wrong server-owned view binding', async () => {
    const e = setup();
    e.sources.dailyData.view = { ...e.sources.dailyData.view, viewerPrincipalId: 'foreign' };
    expect((await daily(e)).guard.decision).toBe('DENIED');
    const f = setup(),
      c = await open(f);
    f.a.grantScope = { ...f.target, id: 'foreign' };
    expect(
      (
        await f.boundary.daily(c, f.target, {
          date: '2026-11-05',
          role: 'SYSTEM_ADMIN',
          verified: true,
        } as { date: string })
      ).projection,
    ).toBeNull();
    expect(f.sources.reads).toBe(0);
  });
  it('rejects cross-resource and changed source revision', async () => {
    for (const change of ['scope', 'revision']) {
      const e = setup();
      e.sources.dailyData.records = e.sources.dailyData.records.map((r) => ({
        ...r,
        claim: {
          ...r.claim,
          ...(change === 'scope'
            ? { scope: { ...e.target, id: 'foreign' } }
            : { sourceRef: ref('stale-source') }),
        },
      }));
      expect((await daily(e)).guard.decision).toBe('DENIED');
    }
  });
  it('blocks changed/ABA source heads and grant revocation between reads without retry', async () => {
    const e = setup();
    e.sources.afterLineage = () => {
      e.sources.dailyHead = ref('daily-head', 'after-ABA');
    };
    const r = await daily(e);
    expect(r.guard.reason).toBe('SOURCE_HEAD_CHANGED_OR_UNAVAILABLE');
    expect(e.sources.reads).toBe(1);
    expect(e.sources.headReads).toBe(1);
    const f = setup();
    f.sources.afterLineage = () => {
      f.a.revoked.add('report.view');
    };
    expect((await daily(f)).guard.decision).toBe('DENIED');
  });
  it('does not promote missing/correction-ambiguous evidence or claim source completeness', async () => {
    const e = setup();
    e.sources.dailyData.records = [];
    const c = await open(e),
      r = await daily(e, c);
    expect(r.projection?.metrics[0].evidenceState).toBe('UNAVAILABLE');
    expect((await e.boundary.export(c, r.viewTicket!, exportRequest(e))).guard.reason).toBe(
      'REQUIRED_SOURCES_INCOMPLETE',
    );
    const f = setup();
    f.sources.dailyData.records = [...f.sources.dailyData.records, ...f.sources.dailyData.records];
    const fc = await open(f),
      fr = await daily(f, fc);
    expect(fr.projection?.metrics[0].evidenceState).toBe('UNKNOWN');
    expect((await f.boundary.export(fc, fr.viewTicket!, exportRequest(f))).guard.reason).toBe(
      'REQUIRED_SOURCES_INCOMPLETE',
    );
  });
  describe('required source with unresolved effective time', () => {
    it.each([
      ['invalid timestamp', 'not-a-date', false],
      ['before the reporting day', '2026-11-04T16:59:59.999Z', false],
      ['exactly the next day start', '2026-11-05T17:00:00.000Z', false],
      ['valid just before the day end', '2026-11-05T16:59:59.999Z', true],
      ['valid exactly at the day start', '2026-11-04T17:00:00.000Z', true],
    ] as const)('%s', async (_name, effectiveAt, valid) => {
      const e = setup();
      e.sources.dailyData.records = e.sources.dailyData.records.map((r) => ({
        ...r,
        claim: { ...r.claim, effectiveAt },
      }));
      const c = await open(e),
        r = await daily(e, c);
      expect(r.viewTicket).not.toBeNull();
      expect(r.runtimeAuthorized).toBe(false);
      expect(r.projection?.metrics[0]).toMatchObject({
        evidenceState: valid ? 'UNVERIFIED' : 'UNKNOWN',
        reason: valid ? 'AUTHENTICATED_SOURCE_REQUIRED' : 'SOURCE_EFFECTIVE_TIME_UNRESOLVED',
        value: null,
      });

      const x = await e.boundary.export(c, r.viewTicket!, exportRequest(e));
      if (valid) {
        ok(x.guard);
      } else {
        expect(x.guard.decision).toBe('BLOCKED');
        expect(x.guard.reason).toBe('REQUIRED_SOURCES_INCOMPLETE');
      }
      expect(x.preflight).not.toBeNull();
      expect(x.preflight?.exportPerformed).toBe(false);
      expect(x.preflight?.runtimeAuthorized).toBe(false);
      expect(x.runtimeAuthorized).toBe(false);
    });
  });
  it('keeps W05B and W09 runtime unverified despite zero and confirmation-looking lineage', async () => {
    for (const variant of ['W05B', 'W09'] as const) {
      const e = setup(variant === 'W05B' ? roles[2] : roles[0]);
      if (variant === 'W09') {
        e.sources.dailyData.definitions = e.sources.dailyData.definitions.map((d) => ({
          ...d,
          domain: 'COMPLETION',
          sourceWave: 'W09',
        }));
        e.sources.dailyData.records = e.sources.dailyData.records.map((r) => ({
          ...r,
          claim: { ...r.claim, domain: 'COMPLETION', sourceWave: 'W09' },
        }));
      }
      const c = await open(e),
        r = await daily(e, c);
      expect(r.claimAnalysis[0].reason).toBe(variant + '_RUNTIME_UNVERIFIED');
      expect(r.projection?.metrics[0].value).toBeNull();
      expect((await e.boundary.export(c, r.viewTicket!, exportRequest(e))).guard.reason).toBe(
        'REQUIRED_SOURCES_INCOMPLETE',
      );
    }
  });
  it('copies reader data and does not pretend it detects a provider reusing every pin', async () => {
    const e = setup();
    e.sources.aliases = true;
    e.sources.afterLineage = () => {
      e.sources.dailyData.records = e.sources.dailyData.records.map((r) => ({
        ...r,
        claim: { ...r.claim, value: 999 },
      }));
    };
    const r = await daily(e);
    expect(r.claimAnalysis[0].declaredValue).toBe(0);
    expect(r.runtimeAuthorized).toBe(false);
    expect(r.projection?.metrics[0].value).toBeNull();
  });
  it('sanitizes source exceptions and does not start retries or expose raw URLs', async () => {
    const e = setup();
    e.sources.fail = true;
    const r = await daily(e);
    expect(r.guard.reason).toBe('SOURCE_READ_FAILED');
    expect(JSON.stringify(r)).not.toContain('private');
    expect(e.sources.reads).toBe(1);
  });
  it('keeps configuration/health integration explicitly unverified', () => {
    const e = setup();
    expect(e.boundary.health()).toMatchObject({
      health: 'UNKNOWN',
      configuration: 'UNVERIFIED',
      runtimeAuthorized: false,
    });
  });
});

describe('W10-S2 CMS and view/export permission parity', () => {
  it('uses server-read authors/policy/license and unchanged S1 CMS guard', async () => {
    const e = setup(roles[3], true),
      c = await open(e);
    ok(await e.boundary.cms(c, e.target, cmsRequest));
    expect(e.sources.headReads).toBe(1);
  });
  it('denies the actual author even from another account and ignores request authority fields', async () => {
    const e = setup(roles[3], true),
      c = await open(e);
    e.sources.cmsData.data = {
      ...e.sources.cmsData.data,
      revision: {
        ...e.sources.cmsData.data.revision,
        authorPersonIds: [e.a.principal.principal.personId],
      },
    };
    expect(
      (
        await e.boundary.cms(c, e.target, {
          ...cmsRequest,
          authorPersonIds: ['someone-else'],
          verified: true,
        } as typeof cmsRequest)
      ).reason,
    ).toBe('AUTHOR_CANNOT_APPROVE');
  });
  it.each([roles[2], roles[6]])('does not grant publishing to %s', async (...tuple) => {
    const e = setup(tuple, true),
      c = await open(e);
    expect((await e.boundary.cms(c, e.target, cmsRequest)).reason).toBe('ROLE_DENIED');
  });
  it('requires independent license approval and current revision', async () => {
    const e = setup(roles[3], true),
      c = await open(e);
    e.sources.decisions = e.sources.decisions.filter((d) => d.purpose !== 'LICENSE');
    expect((await e.boundary.cms(c, e.target, cmsRequest)).reason).toBe(
      'CMS_LICENSE_LINEAGE_UNAVAILABLE',
    );
    const f = setup(roles[3], true),
      fc = await open(f);
    expect(
      (await f.boundary.cms(fc, f.target, { ...cmsRequest, expectedRevision: ref('old') })).reason,
    ).toBe('REVISION_STALE');
  });
  it('rejects unpublished state and revoked CMS permission', async () => {
    const e = setup(roles[3], true),
      c = await open(e);
    e.sources.cmsData.data = {
      ...e.sources.cmsData.data,
      revision: { ...e.sources.cmsData.data.revision, state: 'DRAFT' },
    };
    expect((await e.boundary.cms(c, e.target, cmsRequest)).reason).toBe('STATE_TRANSITION_DENIED');
    const f = setup(roles[3], true),
      fc = await open(f);
    f.sources.afterLineage = () => f.a.revoked.add('cms.publish');
    expect((await f.boundary.cms(fc, f.target, cmsRequest)).decision).toBe('DENIED');
  });
  it('rechecks CMS source freshness after consistency checks', async () => {
    const e = setup(roles[3], true),
      c = await open(e);
    e.sources.afterLineage = () => {
      e.sources.cmsHead = ref('cms-head', 'changed');
    };
    expect((await e.boundary.cms(c, e.target, cmsRequest)).reason).toBe(
      'SOURCE_HEAD_CHANGED_OR_UNAVAILABLE',
    );
  });
  it('performs only a narrower simulated export preflight with no export/audit write', async () => {
    const e = setup(),
      c = await open(e),
      r = await daily(e, c),
      x = await e.boundary.export(c, r.viewTicket!, exportRequest(e));
    ok(x.guard);
    expect(x.runtimeAuthorized).toBe(false);
    expect(x.preflight?.exportPerformed).toBe(false);
    expect(x.preflight?.auditPersisted).toBe(false);
    expect(x.preflight?.reportCompleteness).toBe('INCOMPLETE');
  });
  it('does not accept forged/serialized/foreign view tickets', async () => {
    const e = setup(),
      c = await open(e),
      r = await daily(e, c);
    const other = await open(e);
    for (const t of [
      {},
      JSON.parse(JSON.stringify(r.viewTicket)),
      { trusted: true, role: 'SYSTEM_ADMIN' },
    ])
      expect(
        (await e.boundary.export(c, t as OperationsViewTicket, exportRequest(e))).guard.reason,
      ).toBe('UNBOUND_VIEW_TICKET');
    expect((await e.boundary.export(other, r.viewTicket!, exportRequest(e))).guard.reason).toBe(
      'UNBOUND_VIEW_TICKET',
    );
  });
  it.each(['report.view', 'report.export'] as const)(
    'denies revoked %s between view and export',
    async (permission) => {
      const e = setup(),
        c = await open(e),
        r = await daily(e, c);
      e.a.revoked.add(permission);
      expect((await e.boundary.export(c, r.viewTicket!, exportRequest(e))).guard.decision).toBe(
        'DENIED',
      );
    },
  );
  it('denies source changes/disappearance between view and export', async () => {
    const e = setup(),
      c = await open(e),
      r = await daily(e, c);
    e.sources.dailyHead = ref('daily-head', 'changed');
    expect((await e.boundary.export(c, r.viewTicket!, exportRequest(e))).guard.reason).toBe(
      'SOURCE_CHANGED_SINCE_VIEW',
    );
  });
  it('blocks a source head that disappears after the view', async () => {
    const e = setup(),
      c = await open(e),
      r = await daily(e, c);
    e.sources.missingHead = true;
    expect((await e.boundary.export(c, r.viewTicket!, exportRequest(e))).guard.reason).toBe(
      'SOURCE_HEAD_UNAVAILABLE',
    );
  });
  it('rejects wider filters, less masking, secret fields and missing audit intent', async () => {
    const e = setup(),
      c = await open(e),
      r = await daily(e, c),
      q = exportRequest(e);
    for (const request of [
      { ...q, metricCodes: ['OTHER'] },
      { ...q, statusFilters: ['UNAVAILABLE' as const] },
      { ...q, fields: [{ ...e.sources.dailyData.view.fields[1], masking: 'FULL' as const }] },
      {
        ...q,
        fields: [{ code: 'PASSWORD', masking: 'FULL' as const, classification: 'SECRET' as const }],
      },
      { ...q, auditCorrelationRef: null },
    ])
      denied((await e.boundary.export(c, r.viewTicket!, request)).guard);
  });
  it('cannot be upgraded by caller viewer/role/scope fields or VERIFIED marker', async () => {
    const e = setup(),
      c = await open(e),
      r = await daily(e, c);
    const x = await e.boundary.export(c, r.viewTicket!, {
      ...exportRequest(e),
      viewerPrincipalId: 'other',
      scope: { kind: 'GLOBAL' },
      verified: true,
    } as ExportBoundaryRequest);
    expect(x.runtimeAuthorized).toBe(false);
    expect(x.preflight?.runtimeAuthorized).toBe(false);
  });
});

describe('W10-S2 existing-contract provenance negatives', () => {
  function published() {
    const e = setup();
    const d = { ...e.sources.dailyData.definitions[0], domain: 'PUBLISHED_OUTCOME' as const };
    const r: MetricReadRecord = {
      ...e.sources.dailyData.records[0],
      claim: { ...e.sources.dailyData.records[0].claim, domain: d.domain },
      existing: {
        kind: 'W03',
        projection: {
          ref: d.expectedSourcePin,
          identity: {
            learnerId: 'user-A',
            enrollmentId: 'enroll-A',
            classOfferingId: 'class-A',
            courseVersionId: 'cv-A',
          },
          courseVersionRef: ref('cv-A'),
          policyRef: ref('academic-policy'),
          source: 'W03_ASSIGNMENT',
          activityRevisionRef: ref('activity-final'),
          state: 'PUBLISHED',
          confirmedAt: '2026-11-05T01:00:00Z',
          publishedAt: '2026-11-05T01:00:00Z',
          publishedById: 'publisher',
          publicationDecisionRef: ref('publication-decision'),
          makerIds: ['teacher'],
          value: 0,
          scale: 'SYNTHETIC_ONLY',
        },
      },
    };
    const l = [
      ...e.sources.decisions,
      {
        ref: ref('publication-decision'),
        subjectRef: d.expectedSourcePin,
        scope: d.scope,
        ruleRef: d.statusPredicateRef,
        authorityRef: ref('publisher-authority'),
        purpose: 'PUBLICATION' as const,
        state: 'APPROVED' as const,
      },
    ];
    return { d, r, l };
  }
  it('checks published/final W03 contract but labels even zero as a declared claim only', () => {
    const { d, r, l } = published();
    expect(analyzeSourceClaim(r, d, l)).toMatchObject({
      consistency: 'CONSISTENT_OFFLINE',
      declaredValue: 0,
      runtimeVerified: false,
    });
  });
  it.each(['REVIEWED_FINAL', 'DRAFT', 'UNKNOWN'])('does not treat W03 %s as published', (state) => {
    const { d, r, l } = published();
    const x = {
      ...r,
      existing: {
        ...r.existing!,
        projection: { ...(r.existing as { projection: object }).projection, state },
      },
    } as MetricReadRecord;
    expect(analyzeSourceClaim(x, d, l).consistency).toBe('PENDING');
  });
  it('requires independent publication authority and finalization', () => {
    const { d, r, l } = published();
    expect(
      analyzeSourceClaim(
        r,
        d,
        l.filter((x) => x.purpose !== 'PUBLICATION'),
      ).consistency,
    ).toBe('PENDING');
    const x = {
      ...r,
      existing: {
        ...r.existing!,
        projection: { ...(r.existing as { projection: object }).projection, confirmedAt: null },
      },
    } as MetricReadRecord;
    expect(analyzeSourceClaim(x, d, l).consistency).toBe('PENDING');
  });
  it('rejects invalid publication/finalization timestamps rather than trusting nonempty flags', () => {
    const { d, r, l } = published();
    const x = {
      ...r,
      existing: {
        ...r.existing!,
        projection: {
          ...(r.existing as { projection: object }).projection,
          publishedAt: 'not-a-date',
        },
      },
    } as MetricReadRecord;
    expect(analyzeSourceClaim(x, d, l).reason).toBe('PUBLISHED_FINAL_LINEAGE_REQUIRED');
  });
  it('does not substitute a generic marker for W03 publication or W06 official corrections', () => {
    const { d, r, l } = published();
    expect(analyzeSourceClaim({ ...r, existing: null }, d, l).reason).toBe(
      'PUBLISHED_CONTRACT_REQUIRED',
    );
    const x = { ...d, domain: 'CLASS_ATTENDANCE' as const, sourceWave: 'W06' as const };
    expect(
      analyzeSourceClaim(
        { ...r, claim: { ...r.claim, domain: x.domain, sourceWave: x.sourceWave }, existing: null },
        x,
        l,
      ).reason,
    ).toBe('OFFICIAL_ATTENDANCE_CONTRACT_REQUIRED');
  });
  it('does not select a corrected record without official precedence resolution', () => {
    const { d, r, l } = published();
    expect(
      analyzeSourceClaim({ ...r, claim: { ...r.claim, supersedesRef: ref('old') } }, d, l).reason,
    ).toBe('OFFICIAL_CORRECTION_PRECEDENCE_REQUIRED');
  });
  it('rejects cross-learner existing contracts even when the outer scope is correct', () => {
    const { d, r, l } = published();
    const p = (r.existing as { projection: { identity: object } }).projection;
    const x = {
      ...r,
      existing: {
        ...r.existing!,
        projection: { ...p, identity: { ...p.identity, learnerId: 'foreign' } },
      },
    } as MetricReadRecord;
    expect(analyzeSourceClaim(x, d, l).consistency).toBe('REJECTED');
  });
  function attendance() {
    const { d, r, l } = published();
    const definition = { ...d, domain: 'CLASS_ATTENDANCE' as const, sourceWave: 'W06' as const };
    const identity = {
      learnerId: 'user-A',
      enrollmentId: 'enroll-A',
      classOfferingId: 'class-A',
      courseVersionId: 'cv-A',
    };
    const scope = {
      enrollmentId: identity.enrollmentId,
      classOfferingId: identity.classOfferingId,
      courseVersionId: identity.courseVersionId,
    };
    const record: MetricReadRecord = {
      ...r,
      claim: { ...r.claim, domain: definition.domain, sourceWave: definition.sourceWave },
      existing: {
        kind: 'W06',
        projection: {
          ref: d.expectedSourcePin,
          identity,
          courseVersionRef: ref('cv-A'),
          policyRef: ref('academic-policy'),
          source: 'W06_LEARNER_ATTENDANCE',
          historyComplete: true,
          sessions: [],
        },
        normalized: {
          status: 'NORMALIZED',
          reason: 'NORMALIZED',
          evidence: {
            ref: d.expectedSourcePin,
            scope,
            criterionId: 'attendance',
            kind: 'W06_ATTENDANCE',
            state: 'OFFICIAL_CONFIRMED',
            sessionRefs: [],
            receiptRefs: [],
            corrections: [],
            calculationRuleRef: ref('explicit-calculation-rule'),
            outcome: 'SATISFIED',
          },
          effectiveAttendance: [],
          assurance: 'OFFLINE_CONSISTENCY_ONLY',
          serverIntegrationRequired: true,
        },
      },
    };
    return { d: definition, r: record, l };
  }
  it('reuses normalized W06 contracts as offline declarations, never authenticated official facts', () => {
    const { d, r, l } = attendance();
    expect(analyzeSourceClaim(r, d, l)).toMatchObject({
      consistency: 'CONSISTENT_OFFLINE',
      runtimeVerified: false,
    });
  });
  it.each(['TEACHER_HOURS', 'MEET_CLICK'] as const)(
    'does not substitute W06 %s for learner attendance',
    (source) => {
      const { d, r, l } = attendance();
      if (r.existing?.kind !== 'W06') throw Error('fixture');
      const x = {
        ...r,
        existing: { ...r.existing, projection: { ...r.existing.projection, source } },
      };
      expect(analyzeSourceClaim(x, d, l).consistency).toBe('PENDING');
    },
  );
  it('requires full W06 correction history and normalization rather than a status marker alone', () => {
    const { d, r, l } = attendance();
    if (r.existing?.kind !== 'W06') throw Error('fixture');
    expect(
      analyzeSourceClaim({ ...r, existing: { ...r.existing, normalized: null } }, d, l).consistency,
    ).toBe('PENDING');
    expect(
      analyzeSourceClaim(
        {
          ...r,
          existing: {
            ...r.existing,
            projection: { ...r.existing.projection, historyComplete: false },
          },
        },
        d,
        l,
      ).consistency,
    ).toBe('PENDING');
  });
  it.each(['enrollmentId', 'courseVersionId'] as const)(
    'blocks W06 normalized evidence with a different %s',
    (key) => {
      const { d, r, l } = attendance();
      if (r.existing?.kind !== 'W06' || !r.existing.normalized?.evidence) throw Error('fixture');
      const n = r.existing.normalized;
      const x = {
        ...r,
        existing: {
          ...r.existing,
          normalized: {
            ...n,
            evidence: { ...n.evidence!, scope: { ...n.evidence!.scope, [key]: 'foreign' } },
          },
        },
      };
      expect(analyzeSourceClaim(x, d, l).consistency).toBe('PENDING');
    },
  );
  it('preserves entitlement identity and leaves historical validity unresolved', () => {
    const { d, r, l } = attendance();
    const identity = {
      learnerId: 'user-A',
      enrollmentId: 'enroll-A',
      classOfferingId: 'class-A',
      courseVersionId: 'cv-A',
    };
    const definition = { ...d, domain: 'FINANCE' as const, sourceWave: 'W07' as const };
    const record: MetricReadRecord = {
      ...r,
      claim: { ...r.claim, domain: definition.domain, sourceWave: definition.sourceWave },
      existing: {
        kind: 'W07',
        projection: {
          ref: d.expectedSourcePin,
          identity,
          courseVersionRef: ref('cv-A'),
          policyRef: ref('academic-policy'),
          source: 'W07_ENTITLEMENT',
          entitlementOutcome: 'ACTIVE',
          entitlementEnrollmentId: 'foreign',
          enrollmentStatus: 'ACTIVE',
          application: {
            ref: ref('application'),
            learnerId: identity.learnerId,
            classOfferingId: identity.classOfferingId,
            courseVersionRef: ref('cv-A'),
            state: 'APPROVED',
            academicDecisionRef: ref('admission-decision'),
          },
        },
      },
    };
    expect(analyzeSourceClaim(record, definition, l).reason).toBe('ENTITLEMENT_IDENTITY_MISMATCH');
    if (record.existing?.kind !== 'W07') throw Error('fixture');
    const x = {
      ...record,
      existing: {
        ...record.existing,
        projection: {
          ...record.existing.projection,
          entitlementEnrollmentId: identity.enrollmentId,
        },
      },
    };
    expect(analyzeSourceClaim(x, definition, l).reason).toBe(
      'ENTITLEMENT_ACADEMIC_PERIOD_UNRESOLVED',
    );
  });
});
