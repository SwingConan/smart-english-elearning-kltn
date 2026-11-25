# W10-DF-S2 consolidated offline development batch

Authority: current PO chat and live W10-DF-S2 authorization
https://docs.google.com/document/d/11_kv_z2vQkla2TFyGdtYTsbWJZEmWwnynde6DFZALIk/edit
(modified 2026-11-06T06:51:34.730Z). Artifact038, Master DEC069, Catalog BR111,
and prior CF01 review were read through the Drive connector. No Drive write.
Current authorization supersedes historical stop-after-slice notes for this batch
only; it does not approve open business policies or runtime access.

## One-time inventory and source lock

| Policy           | Existing source/tests                                                                                                                                                         | Proven offline gap and action                                                                                                                           | Runtime / business boundary                                                                                                                   |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| P1 CMS           | operations-foundation.ts:141; operations-source-adapters.ts:249; foundation/S2 specs cover TV draft, HVU publishing, revision lineage, author-person separation and licensing | Existing offline guards retained; no duplicate workflow or pretend CMS UI                                                                               | Actual revision persistence, approvals and public publication require runtime. Content classes/licensing/retention remain OPEN                |
| P2 configuration | operations-foundation.ts:194,235; existing config/health tests                                                                                                                | ConfigChangeCheck exists but OperationsSourcePort:74 has no technical reader/composition. Add value-free, scoped configuration preflight using S1 guard | Real config/secret storage/provider and durable audit are NOT REACHED. Sensitive approver policy OPEN; adapter blocks every sensitive request |
| P3 audit         | operations.contracts.ts:137; operations-foundation.ts:253                                                                                                                     | OpsAuditReadContract has no source-reader/projection composition. Add scoped W01 metadata projection and lineage/revision checks                        | Actual W01 audit reader/grants and history completeness require runtime; retention and privileged PII disclosure remain OPEN                  |
| P4 reports       | operations-foundation.ts:286,398; seven-role, timezone, zero/null tests                                                                                                       | No additional proven offline implementation gap; reuse unchanged                                                                                        | Metric lists/state filters/denominators remain OPEN; source readers require runtime                                                           |
| P5 CSV           | operations-foundation.ts:491,569; parity, revocation and injection tests                                                                                                      | Existing guard/encoder retained; no duplicate serializer or unapproved field template                                                                   | Real download/export audit and approved CSV fields require runtime/policy                                                                     |
| P6 provenance    | operations-source-adapters.ts:76,369; S2 negatives and CF01 five cases                                                                                                        | Preserve temporal-completeness fix byte-for-byte; apply same explicit trust boundary to new technical ports                                             | W05B/W09 stay unverified; no connector, sweep, source-module call or confirmed metrics                                                        |

Exact pre-edit manifest (all NEW, operations-owned):

1. operations-technical.contracts.ts
2. operations-technical-adapter.ts
3. operations-technical.spec.ts
4. CONSOLIDATED_OFFLINE_BATCH.md

No existing W10 or W01-W09 file is edited. No W10-exclusive UI route was found;
existing class-operations UI belongs to earlier waves and is outside scope.

## Implemented boundary

The new source port is a REQUIRED FUTURE interface, not a claim that W01 already
exports these APIs. Its only modes are UNIMPLEMENTED and IN_MEMORY_ONLY.
Missing source/provider fails closed. Auth contexts come from the existing S2
authority adapter, never request-body identity, roles or trusted markers.

Configuration preflight reuses simulateConfigChange and the existing authority
adapter. It binds setting code/request revision/scope, source confirmation rule,
policy approval and current manifest. It returns only the allowlisted code,
ordinary sensitivity and S1 safe status; no values/URLs/tokens enter output.
Configured=true is still UNVERIFIED, not CONNECTED; health remains UNKNOWN.
Sensitive approval remains BUSINESS OPEN even when a fixture supplies an approval.
changePerformed=false, auditPersisted=false, runtimeAuthorized=false always.

Audit read reuses simulateAuditRead, requires technical QT scope, W01 source,
approved event-code field policy and independently read source/policy lineage.
Foreign rows, unknown field policy, stale revisions, duplicate event identities
and noncanonical timestamps block the whole projection. The read-port timestamp
format is canonical UTC ISO (Date.toISOString), a technical normalization
requirement, not a retention/day/academic effective-time rule. No actual event
codes or disclosure grants are invented: policies are inputs requiring future
server verification. Returned rows omit actorPseudonym, actor IDs and raw payloads;
every row is UNVERIFIED and confirmedEventCount=null, including an empty fixture.
There is no writer/delete port; no source history is mutated.

Both paths check source heads and revalidate principal/session/grants before and
after the final head read. These are offline consistency checks, not an atomic DB
revocation guarantee. Server-backed coherent reads, authenticated person/grant
lineage and transaction-time authorization remain integration blockers.

## Planned verification (not a PASS claim)

After code completion: one W10-only Jest run of foundation, S2 (including the five
CF01 cases), permission map, W01 row mapper and new technical spec, under an
in-memory forbidden-runtime-import/network guard. Scoped noEmit typecheck and
ESLint on operations TypeScript only. No W09 224-suite rerun or 584-wide claim.
Actual commands/results and preservation receipts are appended after execution.

Baseline: branch feat/v2-se-sw-01-pilot-main; HEAD
d9ef6bcc70986e9f05e1a7c2c84ed0317f693ed9; 439 entries; index SHA256
9b01f017f40047492a81680c4badd8e5b9596a8eefa4cdf6f56af5e87476ba41.
980 existing working files path/content digest:
78e74c5bc57a0e65e60e58a97d6eaa2673d6972e8d3e5d000dda3eb4b51c96a9.
Pre-edit protected ledger11353, media13, migration34 and incident22 hashes matched.
The four locked paths did not exist. No applicable AGENTS.md was found.

CF01 source hashes before this batch:

- operations-source-adapters.ts: 873c41b24595dd44335c0e42218bcaef88e8cc1d0176cc747cfd81b51ab71060
- operations-s2.spec.ts: c7b5e6daf0a3f39920f45a435b3a7ae05547fa680f82660a7e4cc695862f472f

## Open boundaries, rollback and consolidated review

BUSINESS OPEN: metric/CSV templates; sensitive approver; CMS content/legal rules;
retention/PII disclosure; operational health/SLA. RUNTIME NOT REACHED: actual W01
grants/source connectors, configuration application, immutable audit persistence,
CMS publishing, database/HTTP/browser validation and real private CSV delivery.
No verified authorization, actual data connectivity or UC completion is claimed.

Rollback proposal only: after separate approval and evidence preservation, remove
only these four additions. No source is registered and no database changed, so no
migration/data rollback is required. Do not execute cleanup automatically.

Consolidated Fix List will contain actual material verification failures; known
runtime/business boundaries remain OPEN rather than invented offline features.
STOP after handoff for GPT Web Batch Review. No automatic Consolidated Fix.
W05B incident evidence/release restrictions and migrations33/34 UNACCEPTED remain.
MEDIA_QA_PASS=false; ACADEMIC_APPROVED=false; PUBLISHED=false.

## Actual consolidated verification — 2026-11-06

One Jest execution after all code edits/formatting: **406 PASS, 0 FAIL,
0 skipped; 5/5 suites PASS; 9.332 seconds; exit 0**.

| Suite | Actual PASS |
| --- | ---: |
| operations-foundation.spec.ts | 106 |
| operations-s2.spec.ts | 78 (includes all five CF01 cases) |
| operations-permission-map.spec.ts | 103 |
| operations-w01-row-mapper.spec.ts | 78 |
| operations-technical.spec.ts | 41 NEW |
| Total W10 only | 406 |

No 584-wide or W09 regression execution was performed in this batch. Historical
584 PASS and historical CF01 five PASS remain earlier evidence, not replacement
results. New 41 cases cover role negatives, foreign scope before disclosure,
config value/URL/token exclusion, UNCONFIGURED/UNVERIFIED/UNKNOWN semantics,
allowlist/request bindings, sensitive-policy OPEN, independent rule/revision
lineage, stale/missing heads, W01 audit-only provenance, actor/payload omission,
empty != confirmed zero, foreign/malformed/repeated audit rows, source failure
sanitization, pre-read revoke and revoke during the final head read.

Scoped strict noEmit TypeScript (15 operations TS files): PASS exit0.
Scoped ESLint (same 15 files): PASS exit0. Neither check used write/cache options.
Runtime-import/network guard: blockedImports=0, networkAttempts=0. No source
service, DB/HTTP/browser/provider, PostgreSQL utility or real data was used.

Actual raw Jest invocation, cwd repository root:

```powershell
node -e 'const Module=require(''module'');let blockedImports=0,networkAttempts=0;const original=Module._load;Module._load=function(n,...a){if(/^(pg($|\/)|@prisma\/|@nestjs\/)|generated[\\/]prisma/.test(n)){blockedImports++;throw Error(''W10_OFFLINE_FORBIDDEN_IMPORT'');}return original.call(this,n,...a);};const deny=()=>{networkAttempts++;throw Error(''W10_OFFLINE_NETWORK_FORBIDDEN'');};const net=require(''node:net'');net.Socket.prototype.connect=deny;net.Server.prototype.listen=deny;require(''node:tls'').connect=deny;for(const lib of [''node:http'',''node:https'']){const m=require(lib);m.request=deny;m.get=deny;}globalThis.fetch=deny;require(''jest'').runCLI({config:require(''path'').resolve(''apps/api/jest.config.cjs''),runInBand:true,cache:false,runTestsByPath:true,_:[''apps/api/src/modules/operations/operations-foundation.spec.ts'',''apps/api/src/modules/operations/operations-s2.spec.ts'',''apps/api/src/modules/operations/operations-permission-map.spec.ts'',''apps/api/src/modules/operations/operations-w01-row-mapper.spec.ts'',''apps/api/src/modules/operations/operations-technical.spec.ts''],$0:''W10_CONSOLIDATED_OFFLINE''},[process.cwd()]).then(({results:r})=>{console.log(''W10_CONSOLIDATED_RESULT ''+JSON.stringify({passed:r.numPassedTests,failed:r.numFailedTests,pending:r.numPendingTests,suites:r.numTotalTestSuites,success:r.success,blockedImports,networkAttempts,files:r.testResults.map(t=>({file:t.testFilePath.split(/[\\/]/).pop(),passed:t.numPassingTests,failed:t.numFailingTests,pending:t.numPendingTests}))}));process.exitCode=r.success&&networkAttempts===0&&blockedImports===0?0:1;}).catch(e=>{console.error(e);process.exitCode=1;});'
```

Actual typecheck/lint invocations, cwd apps/api:

```powershell
node ../../node_modules/typescript/bin/tsc --noEmit --incremental false --strict --skipLibCheck --target ES2023 --module commonjs --types node,jest src/modules/operations/operations.contracts.ts src/modules/operations/operations-foundation.ts src/modules/operations/operations-foundation.spec.ts src/modules/operations/operations-authority.contracts.ts src/modules/operations/operations-authority-adapter.ts src/modules/operations/operations-source.contracts.ts src/modules/operations/operations-source-adapters.ts src/modules/operations/operations-s2.spec.ts src/modules/operations/operations-permission-map.ts src/modules/operations/operations-permission-map.spec.ts src/modules/operations/operations-w01-row-mapper.ts src/modules/operations/operations-w01-row-mapper.spec.ts src/modules/operations/operations-technical.contracts.ts src/modules/operations/operations-technical-adapter.ts src/modules/operations/operations-technical.spec.ts
node ../../node_modules/eslint/bin/eslint.js src/modules/operations/operations.contracts.ts src/modules/operations/operations-foundation.ts src/modules/operations/operations-foundation.spec.ts src/modules/operations/operations-authority.contracts.ts src/modules/operations/operations-authority-adapter.ts src/modules/operations/operations-source.contracts.ts src/modules/operations/operations-source-adapters.ts src/modules/operations/operations-s2.spec.ts src/modules/operations/operations-permission-map.ts src/modules/operations/operations-permission-map.spec.ts src/modules/operations/operations-w01-row-mapper.ts src/modules/operations/operations-w01-row-mapper.spec.ts src/modules/operations/operations-technical.contracts.ts src/modules/operations/operations-technical-adapter.ts src/modules/operations/operations-technical.spec.ts
```

No test failure/correction/retry occurred after the code-complete run. A read-only
rg line-reference command used a Windows-invalid path glob; it failed without
changing anything. The corrected read-only -g invocation resolved references.
This was not a test rerun or business-code failure.

## Actual preservation and review status

After code/tests at 2026-11-06T07:09:30.787Z: branch/HEAD/index unchanged; dirty tree
439 -> 443, exactly the four frozen new paths. Removing those four status rows
reproduces the original status SHA256:
7e29250fef28d5886c6e8af325c2c8676056915e7284f3347fb4196ba4818e51.

All 980 previous Git-enumerated working files have the SAME path/content digest:
78e74c5bc57a0e65e60e58a97d6eaa2673d6972e8d3e5d000dda3eb4b51c96a9.
CF01 two source hashes remain byte-identical. Protected files11353, media13,
migration34 and prior incident22 all matched their before ledgers (0 differences).
No old evidence or source was rewritten. Only this new report is updated to record
completed checks and the exact addition diffs.

| New source | SHA256 |
| --- | --- |
| operations-technical.contracts.ts | 706eb59c768462dd53478634938669ab2eeeb3468d815fa227cc52d6d4e65996 |
| operations-technical-adapter.ts | 1c9f0a4d2a52c26e0bceb54881f54b13383669e17b2f9e31be86be81483c1537 |
| operations-technical.spec.ts | 2b24bdbecdfd28904dedda17df4060b1f25e6131d35410ae4564841ea7c524e1 |

Consolidated Fix List: **no material code/test/lint/typecheck failure found in the
authorized offline batch**. No second fix/test loop is opened. The following are
carried as explicit boundaries, not closed by tests:

- Runtime authority/source binding, coherent DB history and atomic revocation:
  NOT REACHED. Offline sequential rechecks cannot prove a future malicious
  provider, reused revision pins or operation-time transaction safety.
- Sensitive configuration approver: BUSINESS OPEN; always BLOCKED by new adapter.
- Canonical metric/CSV templates, event disclosure rules, retention, CMS legal
  classes and health SLA: BUSINESS OPEN. Synthetic rule/event names are test-only.
- No W10 UI/server module is registered; no live provider/config change, audit
  write, publication, actual export or UC completion is claimed.
- W05B/W09/Recovery01 and prior cross-wave findings remain unchanged; no
  runtime/postgreSQL diagnostic or release action was performed.

STOP for one GPT Web Batch Review. No automatic Consolidated Fix, migration,
runtime stage or next slice. All three release gates remain false.

## Exact code addition diffs

All three code files are NEW; the fourth addition is this entire report. There
are no existing-file edits. The patches below were generated in memory from the
tested bytes; no temporary diff file or Git mutation was used.

```diff
===================================================================
--- /dev/null	
+++ apps/api/src/modules/operations/operations-technical.contracts.ts	
@@ -1,0 +1,89 @@
\ No newline at end of file
+import type {
+  ApprovedPolicy,
+  ConfigChangeCheck,
+  GuardResult,
+  OpsAuditReadContract,
+  ResourceScope,
+  Revision,
+  SafeOperationsStatus,
+  ScopedAccess,
+} from './operations.contracts';
+import type { SourceLineageRead } from './operations-source.contracts';
+
+export interface ConfigurationPreflightRequest {
+  readonly settingCode: string;
+  readonly requestRef: Revision;
+}
+interface TechnicalReadBase {
+  readonly manifestRef: Revision;
+  readonly lineagePin: Revision;
+  readonly sourceRevision: Revision;
+  readonly sourceConfirmationRuleRef: Revision;
+  readonly policyApprovalRuleRef: Revision;
+  readonly scope: ResourceScope;
+  readonly completeness: 'COMPLETE' | 'INCOMPLETE' | 'UNKNOWN';
+}
+/** No configuration value, URL, credential or provider client belongs here. */
+export interface ConfigurationPreflightRead extends TechnicalReadBase {
+  readonly binding: ConfigurationPreflightRequest;
+  readonly check: Omit<ConfigChangeCheck, 'access' | 'settingCode' | 'requestRef'>;
+  readonly configured: boolean | null;
+}
+export interface TechnicalAuditRead extends TechnicalReadBase {
+  readonly sourceWave: 'W01';
+  readonly fieldPolicy: ApprovedPolicy & {
+    readonly scope: ResourceScope;
+    readonly allowedEventCodes: readonly string[];
+  };
+  readonly records: readonly OpsAuditReadContract[];
+}
+/** NEW integration requirements, not existing W01 API methods. There is no
+ * runtime-verified implementation or writable repository in this batch.
+ * Future server integration must supply scoped immutable W01 audit history,
+ * independently authorized policy/confirmation lineage, coherent revisions and
+ * an atomic revocation fence. In-memory rows and markers cannot prove these.
+ */
+export interface OperationsTechnicalSourcePort {
+  readonly mode: 'UNIMPLEMENTED' | 'IN_MEMORY_ONLY';
+  readConfigurationPreflight(
+    binding: ScopedAccess,
+    request: ConfigurationPreflightRequest,
+  ): Promise<ConfigurationPreflightRead | null>;
+  readAudit(binding: ScopedAccess): Promise<TechnicalAuditRead | null>;
+  readLineage(
+    binding: ScopedAccess,
+    manifestRef: Revision,
+    lineagePin: Revision,
+  ): Promise<SourceLineageRead | null>;
+  readCurrentHead(
+    binding: ScopedAccess,
+    kind: 'CONFIGURATION' | 'AUDIT',
+    selector: string,
+  ): Promise<Revision | null>;
+}
+export interface ConfigurationPreflightResult {
+  readonly guard: GuardResult;
+  readonly setting: {
+    readonly code: string;
+    readonly sensitivity: 'ORDINARY';
+    readonly status: SafeOperationsStatus;
+  } | null;
+  readonly changePerformed: false;
+  readonly auditRequired: true;
+  readonly auditPersisted: false;
+  readonly runtimeAuthorized: false;
+}
+export interface TechnicalAuditResult {
+  readonly guard: GuardResult;
+  readonly records: readonly {
+    readonly ref: Revision;
+    readonly eventCode: string;
+    readonly occurredAt: string;
+    readonly sourceRevision: Revision;
+    readonly evidenceState: 'UNVERIFIED';
+  }[];
+  readonly completeness: 'INCOMPLETE';
+  readonly confirmedEventCount: null;
+  readonly historyModified: false;
+  readonly runtimeAuthorized: false;
+}
```

```diff
===================================================================
--- /dev/null	
+++ apps/api/src/modules/operations/operations-technical-adapter.ts	
@@ -1,0 +1,282 @@
\ No newline at end of file
+import type { OperationsAuthorityContext } from './operations-authority.contracts';
+import {
+  boundaryGuard,
+  boundaryRef,
+  copyBoundaryData,
+  equalRef,
+  equalScope,
+  OperationsAuthorityAdapter,
+} from './operations-authority-adapter';
+import type { GuardResult, ResourceScope, Revision, ScopedAccess } from './operations.contracts';
+import {
+  projectSafeOperationsStatus,
+  simulateAuditRead,
+  simulateConfigChange,
+} from './operations-foundation';
+import type { OfficialDecisionContract, SourceLineageRead } from './operations-source.contracts';
+import type {
+  ConfigurationPreflightRead,
+  ConfigurationPreflightRequest,
+  ConfigurationPreflightResult,
+  OperationsTechnicalSourcePort,
+  TechnicalAuditRead,
+  TechnicalAuditResult,
+} from './operations-technical.contracts';
+
+const met = (g: GuardResult) => g.decision === 'CONDITIONS_MET_OFFLINE';
+const code = (v: unknown): v is string => typeof v === 'string' && /^[A-Z][A-Z0-9_]{0,63}$/.test(v);
+const configFailure = (guard: GuardResult): ConfigurationPreflightResult => ({
+  guard,
+  setting: null,
+  changePerformed: false,
+  auditRequired: true,
+  auditPersisted: false,
+  runtimeAuthorized: false,
+});
+const auditFailure = (guard: GuardResult): TechnicalAuditResult => ({
+  guard,
+  records: [],
+  completeness: 'INCOMPLETE',
+  confirmedEventCount: null,
+  historyModified: false,
+  runtimeAuthorized: false,
+});
+
+/** Offline-only, value-free technical projections. No provider, DB, writer,
+ * timer, network probe or real authorization implementation is constructed.
+ */
+export class OperationsTechnicalAdapter {
+  constructor(
+    private readonly authority: OperationsAuthorityAdapter,
+    private readonly port: OperationsTechnicalSourcePort | null,
+  ) {}
+
+  private base(read: ConfigurationPreflightRead | TechnicalAuditRead, scope: ResourceScope) {
+    return (
+      !!read &&
+      read.completeness === 'COMPLETE' &&
+      equalScope(read.scope, scope) &&
+      boundaryRef(read.manifestRef) &&
+      boundaryRef(read.lineagePin) &&
+      boundaryRef(read.sourceRevision) &&
+      boundaryRef(read.sourceConfirmationRuleRef) &&
+      boundaryRef(read.policyApprovalRuleRef)
+    );
+  }
+
+  private async lineage(
+    access: ScopedAccess,
+    read: ConfigurationPreflightRead | TechnicalAuditRead,
+  ): Promise<SourceLineageRead | null> {
+    const l = copyBoundaryData(
+      await this.port!.readLineage(
+        copyBoundaryData(access),
+        { ...read.manifestRef },
+        { ...read.lineagePin },
+      ),
+    );
+    return l &&
+      l.completeness === 'COMPLETE' &&
+      Array.isArray(l.decisions) &&
+      equalRef(l.ref, read.lineagePin) &&
+      equalRef(l.manifestRef, read.manifestRef)
+      ? l
+      : null;
+  }
+
+  private decision(
+    l: SourceLineageRead,
+    pin: Revision | null,
+    subject: Revision,
+    rule: Revision,
+    scope: ResourceScope,
+    purpose: OfficialDecisionContract['purpose'],
+  ) {
+    const found = l.decisions.filter((d) => equalRef(d.ref, pin));
+    return (
+      found.length === 1 &&
+      found[0].state === 'APPROVED' &&
+      found[0].purpose === purpose &&
+      equalRef(found[0].subjectRef, subject) &&
+      equalRef(found[0].ruleRef, rule) &&
+      equalScope(found[0].scope, scope) &&
+      boundaryRef(found[0].authorityRef)
+    );
+  }
+
+  private confirmed(l: SourceLineageRead, read: ConfigurationPreflightRead | TechnicalAuditRead) {
+    const found = l.decisions.filter(
+      (d) => d.purpose === 'CONFIRMATION' && equalRef(d.subjectRef, read.sourceRevision),
+    );
+    return (
+      found.length === 1 &&
+      this.decision(
+        l,
+        found[0].ref,
+        read.sourceRevision,
+        read.sourceConfirmationRuleRef,
+        read.scope,
+        'CONFIRMATION',
+      )
+    );
+  }
+
+  private async finish(
+    context: OperationsAuthorityContext,
+    access: ScopedAccess,
+    read: ConfigurationPreflightRead | TechnicalAuditRead,
+    kind: 'CONFIGURATION' | 'AUDIT',
+    selector: string,
+  ) {
+    const before = await this.authority.revalidate(context);
+    if (!met(before)) return before;
+    const head = copyBoundaryData(
+      await this.port!.readCurrentHead(copyBoundaryData(access), kind, selector),
+    );
+    if (!equalRef(head, read.manifestRef))
+      return boundaryGuard('BLOCKED', 'TECHNICAL_SOURCE_HEAD_CHANGED_OR_UNAVAILABLE');
+    return this.authority.revalidate(context);
+  }
+
+  async configurationPreflight(
+    context: OperationsAuthorityContext,
+    scope: ResourceScope,
+    request: ConfigurationPreflightRequest,
+  ): Promise<ConfigurationPreflightResult> {
+    if (this.port?.mode !== 'IN_MEMORY_ONLY')
+      return configFailure(boundaryGuard('BLOCKED', 'TECHNICAL_SOURCE_INTEGRATION_UNAVAILABLE'));
+    try {
+      const q = copyBoundaryData(request);
+      if (!code(q.settingCode) || !boundaryRef(q.requestRef))
+        return configFailure(boundaryGuard('BLOCKED', 'CONFIG_REQUEST_INVALID'));
+      const auth = await this.authority.readAccess(context, 'ops.config.change', scope);
+      if (!auth.access) return configFailure(auth.guard);
+      const read = copyBoundaryData(
+        await this.port.readConfigurationPreflight(copyBoundaryData(auth.access), q),
+      );
+      if (!read || !this.base(read, scope))
+        return configFailure(boundaryGuard('BLOCKED', 'CONFIG_SOURCE_INCOMPLETE'));
+      if (
+        read.binding.settingCode !== q.settingCode ||
+        !equalRef(read.binding.requestRef, q.requestRef)
+      )
+        return configFailure(boundaryGuard('DENIED', 'CONFIG_REQUEST_BINDING_MISMATCH'));
+      // DEC069 leaves the sensitive reviewer/authority policy OPEN. No supplied
+      // fixture approval may silently resolve that policy or enable a change.
+      if (read.check.sensitivity === 'SENSITIVE')
+        return configFailure(boundaryGuard('BLOCKED', 'SENSITIVE_APPROVER_POLICY_OPEN'));
+      if (read.configured !== null && typeof read.configured !== 'boolean')
+        return configFailure(boundaryGuard('BLOCKED', 'CONFIG_STATE_INVALID'));
+      const l = await this.lineage(auth.access, read);
+      const p = read.check.policy;
+      if (
+        !l ||
+        !this.confirmed(l, read) ||
+        !this.decision(l, p.approvalRef, p.ref, read.policyApprovalRuleRef, scope, 'POLICY')
+      )
+        return configFailure(boundaryGuard('BLOCKED', 'CONFIG_LINEAGE_UNVERIFIED'));
+      const checked = simulateConfigChange({
+        ...read.check,
+        access: auth.access,
+        requestRef: q.requestRef,
+        settingCode: q.settingCode,
+      });
+      if (!met(checked)) return configFailure(checked);
+      const end = await this.finish(context, auth.access, read, 'CONFIGURATION', q.settingCode);
+      if (!met(end)) return configFailure(end);
+      return {
+        guard: end,
+        setting: {
+          code: q.settingCode,
+          sensitivity: 'ORDINARY',
+          status: projectSafeOperationsStatus({ configured: read.configured }),
+        },
+        changePerformed: false,
+        auditRequired: true,
+        auditPersisted: false,
+        runtimeAuthorized: false,
+      };
+    } catch {
+      return configFailure(boundaryGuard('BLOCKED', 'TECHNICAL_SOURCE_READ_FAILED'));
+    }
+  }
+
+  async audit(
+    context: OperationsAuthorityContext,
+    scope: ResourceScope,
+    request: { readonly expectedManifest: Revision },
+  ): Promise<TechnicalAuditResult> {
+    if (this.port?.mode !== 'IN_MEMORY_ONLY')
+      return auditFailure(boundaryGuard('BLOCKED', 'TECHNICAL_SOURCE_INTEGRATION_UNAVAILABLE'));
+    try {
+      const q = copyBoundaryData(request);
+      if (!boundaryRef(q.expectedManifest))
+        return auditFailure(boundaryGuard('BLOCKED', 'AUDIT_REQUEST_INVALID'));
+      const auth = await this.authority.readAccess(context, 'ops.audit.read', scope);
+      if (!auth.access) return auditFailure(auth.guard);
+      const checked = simulateAuditRead(auth.access);
+      if (!met(checked)) return auditFailure(checked);
+      const read = copyBoundaryData(await this.port.readAudit(copyBoundaryData(auth.access)));
+      if (!read || !this.base(read, scope) || read.sourceWave !== 'W01')
+        return auditFailure(boundaryGuard('BLOCKED', 'AUDIT_SOURCE_INCOMPLETE_OR_UNSUPPORTED'));
+      if (!equalRef(read.manifestRef, q.expectedManifest))
+        return auditFailure(boundaryGuard('BLOCKED', 'AUDIT_MANIFEST_STALE'));
+      const p = read.fieldPolicy;
+      const l = await this.lineage(auth.access, read);
+      if (
+        !l ||
+        !this.confirmed(l, read) ||
+        p.state !== 'APPROVED' ||
+        !equalScope(p.scope, scope) ||
+        !Array.isArray(p.allowedEventCodes) ||
+        !p.allowedEventCodes.length ||
+        !p.allowedEventCodes.every(code) ||
+        new Set(p.allowedEventCodes).size !== p.allowedEventCodes.length ||
+        !this.decision(l, p.approvalRef, p.ref, read.policyApprovalRuleRef, scope, 'POLICY')
+      )
+        return auditFailure(boundaryGuard('BLOCKED', 'AUDIT_FIELD_POLICY_UNVERIFIED'));
+      if (
+        !Array.isArray(read.records) ||
+        new Set(read.records.map((r) => r.ref.id)).size !== read.records.length
+      )
+        return auditFailure(boundaryGuard('BLOCKED', 'AUDIT_HISTORY_AMBIGUOUS'));
+      const records: TechnicalAuditResult['records'][number][] = [];
+      for (const row of read.records) {
+        // Canonical UTC source projection; no historical day/retention rule is inferred.
+        const ms = typeof row.occurredAt === 'string' ? Date.parse(row.occurredAt) : NaN;
+        if (
+          !equalScope(row.scope, scope) ||
+          !boundaryRef(row.ref) ||
+          !equalRef(row.sourceRevision, read.sourceRevision) ||
+          !equalRef(row.fieldPolicyRef, p.ref) ||
+          !code(row.eventCode) ||
+          !p.allowedEventCodes.includes(row.eventCode) ||
+          !Number.isFinite(ms) ||
+          new Date(ms).toISOString() !== row.occurredAt
+        )
+          return auditFailure(
+            boundaryGuard('DENIED', 'AUDIT_RECORD_SCOPE_POLICY_OR_REVISION_DENIED'),
+          );
+        records.push({
+          ref: { ...row.ref },
+          eventCode: row.eventCode,
+          occurredAt: row.occurredAt,
+          sourceRevision: { ...row.sourceRevision },
+          evidenceState: 'UNVERIFIED',
+        });
+      }
+      const end = await this.finish(context, auth.access, read, 'AUDIT', read.manifestRef.id);
+      if (!met(end)) return auditFailure(end);
+      return {
+        guard: end,
+        records,
+        completeness: 'INCOMPLETE',
+        confirmedEventCount: null,
+        historyModified: false,
+        runtimeAuthorized: false,
+      };
+    } catch {
+      return auditFailure(boundaryGuard('BLOCKED', 'TECHNICAL_SOURCE_READ_FAILED'));
+    }
+  }
+}
```

```diff
===================================================================
--- /dev/null	
+++ apps/api/src/modules/operations/operations-technical.spec.ts	
@@ -1,0 +1,505 @@
\ No newline at end of file
+import type { OperationsAuthorityPort, PrincipalRead } from './operations-authority.contracts';
+import { OperationsAuthorityAdapter } from './operations-authority-adapter';
+import type {
+  BusinessRole,
+  GrantRead,
+  Permission,
+  ResourceScope,
+  Revision,
+  ScopedAccess,
+} from './operations.contracts';
+import type { OfficialDecisionContract, SourceLineageRead } from './operations-source.contracts';
+import { OperationsTechnicalAdapter } from './operations-technical-adapter';
+import type {
+  ConfigurationPreflightRead,
+  ConfigurationPreflightRequest,
+  OperationsTechnicalSourcePort,
+  TechnicalAuditRead,
+} from './operations-technical.contracts';
+
+const ref = (id: string, revision = 'synthetic-1'): Revision => ({ id, revision });
+const scope: ResourceScope = { kind: 'TECHNICAL', id: 'synthetic-operations-area' };
+const request: ConfigurationPreflightRequest = {
+  settingCode: 'SYNTHETIC_SETTING',
+  requestRef: ref('request'),
+};
+const auditRequest = { expectedManifest: ref('audit-manifest') };
+
+class MemoryAuthority implements OperationsAuthorityPort {
+  mode = 'IN_MEMORY_ONLY' as const;
+  revoked = new Set<Permission>();
+  principal: PrincipalRead = {
+    ref: ref('principal'),
+    authorityEpoch: 'synthetic-epoch',
+    accountState: 'ACTIVE',
+    principal: {
+      principalId: 'synthetic-account',
+      personId: 'synthetic-person',
+      role: 'SYSTEM_ADMIN',
+      sessionRef: ref('session'),
+      sessionState: 'AUTHENTICATED',
+    },
+  };
+  readPrincipal() {
+    return Promise.resolve(structuredClone(this.principal));
+  }
+  readGrant(
+    principalId: string,
+    permission: Permission,
+    _target: ResourceScope,
+  ): Promise<GrantRead> {
+    return Promise.resolve({
+      ref: ref(permission),
+      principalId,
+      permission,
+      scope,
+      state: this.revoked.has(permission) ? 'REVOKED' : 'ACTIVE',
+      validity: 'VALID',
+      authorityEpoch: 'synthetic-epoch',
+      decisionRef: ref('grant-decision'),
+      authorityRef: ref('grant-authority'),
+    });
+  }
+}
+class MemoryTechnicalSource implements OperationsTechnicalSourcePort {
+  mode: OperationsTechnicalSourcePort['mode'] = 'IN_MEMORY_ONLY';
+  configReads = 0;
+  auditReads = 0;
+  headReads = 0;
+  lineageComplete = true;
+  fail = false;
+  missing = false;
+  missingHead = false;
+  afterLineage?: () => void;
+  afterHead?: () => void;
+  configHead: Revision = ref('config-manifest');
+  auditHead: Revision = ref('audit-manifest');
+  config: ConfigurationPreflightRead = {
+    manifestRef: this.configHead,
+    lineagePin: ref('lineage'),
+    sourceRevision: ref('config-source'),
+    sourceConfirmationRuleRef: ref('source-rule'),
+    policyApprovalRuleRef: ref('policy-rule'),
+    scope,
+    completeness: 'COMPLETE',
+    binding: request,
+    configured: true,
+    check: {
+      policy: {
+        ref: ref('config-policy'),
+        state: 'APPROVED',
+        approvalRef: ref('config-policy-decision'),
+        scope,
+        allowedSettingCodes: ['SYNTHETIC_SETTING'],
+      },
+      sensitivity: 'ORDINARY',
+      sensitiveApproval: null,
+    },
+  };
+  auditRead: TechnicalAuditRead = {
+    manifestRef: this.auditHead,
+    lineagePin: ref('lineage'),
+    sourceRevision: ref('audit-source'),
+    sourceConfirmationRuleRef: ref('source-rule'),
+    policyApprovalRuleRef: ref('policy-rule'),
+    scope,
+    completeness: 'COMPLETE',
+    sourceWave: 'W01',
+    fieldPolicy: {
+      ref: ref('audit-policy'),
+      state: 'APPROVED',
+      approvalRef: ref('audit-policy-decision'),
+      scope,
+      allowedEventCodes: ['SYNTHETIC_EVENT'],
+    },
+    records: [
+      {
+        ref: ref('audit-event'),
+        scope,
+        occurredAt: '2026-11-06T07:00:00.000Z',
+        eventCode: 'SYNTHETIC_EVENT',
+        actorPseudonym: 'private-actor',
+        fieldPolicyRef: ref('audit-policy'),
+        sourceRevision: ref('audit-source'),
+      },
+    ],
+  };
+  decisions: OfficialDecisionContract[] = [
+    {
+      ref: ref('config-policy-decision'),
+      subjectRef: ref('config-policy'),
+      purpose: 'POLICY',
+      state: 'APPROVED',
+      scope,
+      ruleRef: ref('policy-rule'),
+      authorityRef: ref('independent-authority'),
+    },
+    {
+      ref: ref('audit-policy-decision'),
+      subjectRef: ref('audit-policy'),
+      purpose: 'POLICY',
+      state: 'APPROVED',
+      scope,
+      ruleRef: ref('policy-rule'),
+      authorityRef: ref('independent-authority'),
+    },
+    {
+      ref: ref('config-confirmation'),
+      subjectRef: ref('config-source'),
+      purpose: 'CONFIRMATION',
+      state: 'APPROVED',
+      scope,
+      ruleRef: ref('source-rule'),
+      authorityRef: ref('independent-authority'),
+    },
+    {
+      ref: ref('audit-confirmation'),
+      subjectRef: ref('audit-source'),
+      purpose: 'CONFIRMATION',
+      state: 'APPROVED',
+      scope,
+      ruleRef: ref('source-rule'),
+      authorityRef: ref('independent-authority'),
+    },
+  ];
+  readConfigurationPreflight(_a: ScopedAccess, _q: ConfigurationPreflightRequest) {
+    this.configReads++;
+    if (this.fail) throw Error('private-provider-password');
+    return Promise.resolve(this.missing ? null : structuredClone(this.config));
+  }
+  readAudit(_a: ScopedAccess) {
+    this.auditReads++;
+    if (this.fail) throw Error('private-provider-password');
+    return Promise.resolve(this.missing ? null : structuredClone(this.auditRead));
+  }
+  readLineage(
+    _a: ScopedAccess,
+    manifestRef: Revision,
+    lineagePin: Revision,
+  ): Promise<SourceLineageRead> {
+    const l: SourceLineageRead = {
+      ref: lineagePin,
+      manifestRef,
+      completeness: this.lineageComplete ? 'COMPLETE' : 'INCOMPLETE',
+      decisions: structuredClone(this.decisions),
+    };
+    this.afterLineage?.();
+    return Promise.resolve(l);
+  }
+  readCurrentHead(_a: ScopedAccess, kind: 'CONFIGURATION' | 'AUDIT', _selector: string) {
+    this.headReads++;
+    const head = this.missingHead
+      ? null
+      : structuredClone(kind === 'CONFIGURATION' ? this.configHead : this.auditHead);
+    this.afterHead?.();
+    return Promise.resolve(head);
+  }
+}
+async function setup() {
+  const grants = new MemoryAuthority(),
+    authority = new OperationsAuthorityAdapter(grants);
+  const port = new MemoryTechnicalSource(),
+    adapter = new OperationsTechnicalAdapter(authority, port);
+  const opened = await authority.open();
+  expect(opened.guard.runtimeAuthorized).toBe(false);
+  expect(opened.context).not.toBeNull();
+  return { grants, authority, port, adapter, context: opened.context! };
+}
+const met = (g: { decision: string }) => expect(g.decision).toBe('CONDITIONS_MET_OFFLINE');
+const blocked = (g: { decision: string }) => expect(g.decision).not.toBe('CONDITIONS_MET_OFFLINE');
+
+describe('W10 consolidated technical offline boundary P2/P3', () => {
+  it('returns value-free config metadata, no applied change or fake health', async () => {
+    const e = await setup();
+    Object.assign(e.port.config, {
+      password: 'private-value',
+      url: 'https://private-provider',
+      token: 'private-token',
+    });
+    const r = await e.adapter.configurationPreflight(e.context, scope, request);
+    met(r.guard);
+    expect(r).toMatchObject({
+      changePerformed: false,
+      auditRequired: true,
+      auditPersisted: false,
+      runtimeAuthorized: false,
+    });
+    expect(r.setting?.status).toMatchObject({
+      health: 'UNKNOWN',
+      configuration: 'UNVERIFIED',
+      runtimeAuthorized: false,
+    });
+    expect(JSON.stringify(r)).not.toMatch(/private-value|private-provider|private-token/);
+  });
+  it.each([false, null] as const)(
+    'keeps configured=%s truthful without a live connection claim',
+    async (configured) => {
+      const e = await setup();
+      e.port.config = { ...e.port.config, configured };
+      const r = await e.adapter.configurationPreflight(e.context, scope, request);
+      met(r.guard);
+      expect(r.setting?.status.configuration).toBe(
+        configured === false ? 'UNCONFIGURED' : 'UNVERIFIED',
+      );
+      expect(r.setting?.status.health).toBe('UNKNOWN');
+    },
+  );
+  it.each([
+    'STUDENT',
+    'INSTRUCTOR',
+    'COUNSELOR',
+    'ACADEMIC_MANAGER',
+    'CASHIER',
+    'TEACHING_INSPECTOR',
+  ] as const)('denies %s before reading technical sources', async (role: BusinessRole) => {
+    const e = await setup();
+    e.grants.principal = {
+      ...e.grants.principal,
+      principal: { ...e.grants.principal.principal, role },
+    };
+    blocked((await e.adapter.configurationPreflight(e.context, scope, request)).guard);
+    blocked((await e.adapter.audit(e.context, scope, auditRequest)).guard);
+    expect(e.port.configReads + e.port.auditReads).toBe(0);
+  });
+  it('blocks missing/unimplemented source ports rather than claiming connectivity', async () => {
+    const e = await setup();
+    for (const source of [null, Object.assign(e.port, { mode: 'UNIMPLEMENTED' as const })]) {
+      const adapter = new OperationsTechnicalAdapter(e.authority, source);
+      blocked((await adapter.configurationPreflight(e.context, scope, request)).guard);
+      blocked((await adapter.audit(e.context, scope, auditRequest)).guard);
+    }
+    expect(e.port.configReads + e.port.auditReads).toBe(0);
+  });
+  it('requires exact request ref/code binding, not caller approval fields', async () => {
+    const e = await setup();
+    e.port.config = { ...e.port.config, binding: { ...request, requestRef: ref('other-request') } };
+    expect((await e.adapter.configurationPreflight(e.context, scope, request)).guard.reason).toBe(
+      'CONFIG_REQUEST_BINDING_MISMATCH',
+    );
+  });
+  it('denies foreign technical scope before fetching source data', async () => {
+    const e = await setup();
+    const foreign: ResourceScope = { ...scope, id: 'foreign-operations-area' };
+    expect(
+      (await e.adapter.configurationPreflight(e.context, foreign, request)).guard.decision,
+    ).toBe('DENIED');
+    expect((await e.adapter.audit(e.context, foreign, auditRequest)).guard.decision).toBe('DENIED');
+    expect(e.port.configReads + e.port.auditReads).toBe(0);
+  });
+  it('requires the approved config allowlist', async () => {
+    const e = await setup();
+    e.port.config = {
+      ...e.port.config,
+      check: {
+        ...e.port.config.check,
+        policy: { ...e.port.config.check.policy, allowedSettingCodes: [] },
+      },
+    };
+    expect((await e.adapter.configurationPreflight(e.context, scope, request)).guard.reason).toBe(
+      'SETTING_NOT_ALLOWLISTED',
+    );
+  });
+  it('does not invent a sensitive approver even with a fixture approval', async () => {
+    const e = await setup();
+    e.port.config = {
+      ...e.port.config,
+      check: {
+        ...e.port.config.check,
+        sensitivity: 'SENSITIVE',
+        sensitiveApproval: {
+          ref: ref('fixture-approval'),
+          requestRef: request.requestRef,
+          policyRef: e.port.config.check.policy.ref,
+          approverPersonId: 'different-person',
+          authorityRuleRef: ref('fixture-rule'),
+        },
+      },
+    };
+    const r = await e.adapter.configurationPreflight(e.context, scope, request);
+    expect(r.guard.reason).toBe('SENSITIVE_APPROVER_POLICY_OPEN');
+    expect(r.setting).toBeNull();
+    expect(r.changePerformed).toBe(false);
+  });
+  it.each(['POLICY', 'CONFIRMATION'] as const)(
+    'requires %s lineage from a separate read',
+    async (purpose) => {
+      const e = await setup();
+      e.port.decisions = e.port.decisions.filter((d) => d.purpose !== purpose);
+      blocked((await e.adapter.configurationPreflight(e.context, scope, request)).guard);
+      blocked((await e.adapter.audit(e.context, scope, auditRequest)).guard);
+    },
+  );
+  it('rejects contradictory duplicate approvals rather than selecting an APPROVED row', async () => {
+    const e = await setup();
+    e.port.decisions.push({ ...e.port.decisions[0], state: 'REJECTED' });
+    expect((await e.adapter.configurationPreflight(e.context, scope, request)).guard.reason).toBe(
+      'CONFIG_LINEAGE_UNVERIFIED',
+    );
+  });
+  it('checks exact approval-rule revision', async () => {
+    const e = await setup();
+    e.port.decisions = e.port.decisions.map((d) => ({ ...d, ruleRef: ref('stale-rule') }));
+    blocked((await e.adapter.configurationPreflight(e.context, scope, request)).guard);
+    blocked((await e.adapter.audit(e.context, scope, auditRequest)).guard);
+  });
+  it('projects W01 audit without actor identifiers, payloads or confirmed counts', async () => {
+    const e = await setup();
+    Object.assign(e.port.auditRead.records[0], {
+      actorId: 'private-id',
+      message: 'private-token',
+      password: 'private-value',
+    });
+    const r = await e.adapter.audit(e.context, scope, auditRequest);
+    met(r.guard);
+    expect(r).toMatchObject({
+      confirmedEventCount: null,
+      completeness: 'INCOMPLETE',
+      historyModified: false,
+      runtimeAuthorized: false,
+    });
+    expect(r.records[0].evidenceState).toBe('UNVERIFIED');
+    expect(JSON.stringify(r)).not.toMatch(/private-actor|private-id|private-token|private-value/);
+  });
+  it('an empty audit fixture never proves confirmed zero or complete history', async () => {
+    const e = await setup();
+    e.port.auditRead = { ...e.port.auditRead, records: [] };
+    const r = await e.adapter.audit(e.context, scope, auditRequest);
+    met(r.guard);
+    expect(r.records).toEqual([]);
+    expect(r.confirmedEventCount).toBeNull();
+    expect(r.completeness).toBe('INCOMPLETE');
+  });
+  it.each(['W05B', 'W09'])('rejects %s as an official W01 audit feed', async (sourceWave) => {
+    const e = await setup();
+    Object.assign(e.port.auditRead, { sourceWave });
+    const r = await e.adapter.audit(e.context, scope, auditRequest);
+    blocked(r.guard);
+    expect(r.records).toEqual([]);
+    expect(r.confirmedEventCount).toBeNull();
+  });
+  it.each(['scope', 'revision', 'fieldPolicy', 'eventCode', 'timestamp'])(
+    'rejects conflicting audit %s',
+    async (change) => {
+      const e = await setup(),
+        row = e.port.auditRead.records[0];
+      e.port.auditRead = {
+        ...e.port.auditRead,
+        records: [
+          {
+            ...row,
+            ...(change === 'scope' ? { scope: { ...scope, id: 'foreign-area' } } : {}),
+            ...(change === 'revision' ? { sourceRevision: ref('stale-source') } : {}),
+            ...(change === 'fieldPolicy' ? { fieldPolicyRef: ref('foreign-policy') } : {}),
+            ...(change === 'eventCode' ? { eventCode: 'NOT_ALLOWLISTED' } : {}),
+            ...(change === 'timestamp' ? { occurredAt: 'not-a-date' } : {}),
+          },
+        ],
+      };
+      const r = await e.adapter.audit(e.context, scope, auditRequest);
+      blocked(r.guard);
+      expect(r.records).toEqual([]);
+    },
+  );
+  it('rejects repeated audit revisions without rewriting history', async () => {
+    const e = await setup();
+    e.port.auditRead = {
+      ...e.port.auditRead,
+      records: [e.port.auditRead.records[0], e.port.auditRead.records[0]],
+    };
+    expect((await e.adapter.audit(e.context, scope, auditRequest)).guard.reason).toBe(
+      'AUDIT_HISTORY_AMBIGUOUS',
+    );
+  });
+  it('requires approved scoped audit field policy', async () => {
+    const e = await setup();
+    e.port.auditRead = {
+      ...e.port.auditRead,
+      fieldPolicy: { ...e.port.auditRead.fieldPolicy, scope: { ...scope, id: 'foreign-area' } },
+    };
+    expect((await e.adapter.audit(e.context, scope, auditRequest)).guard.reason).toBe(
+      'AUDIT_FIELD_POLICY_UNVERIFIED',
+    );
+  });
+  it('rejects stale audit manifest before projecting records', async () => {
+    const e = await setup();
+    expect(
+      (await e.adapter.audit(e.context, scope, { expectedManifest: ref('old-manifest') })).guard
+        .reason,
+    ).toBe('AUDIT_MANIFEST_STALE');
+  });
+  it.each(['missing', 'incomplete', 'lineage'])(
+    'fails closed for %s source evidence',
+    async (change) => {
+      const e = await setup();
+      if (change === 'missing') e.port.missing = true;
+      if (change === 'incomplete') {
+        e.port.config = { ...e.port.config, completeness: 'INCOMPLETE' };
+        e.port.auditRead = { ...e.port.auditRead, completeness: 'INCOMPLETE' };
+      }
+      if (change === 'lineage') e.port.lineageComplete = false;
+      blocked((await e.adapter.configurationPreflight(e.context, scope, request)).guard);
+      blocked((await e.adapter.audit(e.context, scope, auditRequest)).guard);
+    },
+  );
+  it('rechecks both config/audit source heads after lineage reads', async () => {
+    const e = await setup();
+    e.port.afterLineage = () => {
+      e.port.configHead = ref('changed');
+      e.port.auditHead = ref('changed');
+    };
+    expect((await e.adapter.configurationPreflight(e.context, scope, request)).guard.reason).toBe(
+      'TECHNICAL_SOURCE_HEAD_CHANGED_OR_UNAVAILABLE',
+    );
+    expect((await e.adapter.audit(e.context, scope, auditRequest)).guard.reason).toBe(
+      'TECHNICAL_SOURCE_HEAD_CHANGED_OR_UNAVAILABLE',
+    );
+  });
+  it('blocks source disappearance without retries', async () => {
+    const e = await setup();
+    e.port.missingHead = true;
+    blocked((await e.adapter.audit(e.context, scope, auditRequest)).guard);
+    expect(e.port.headReads).toBe(1);
+  });
+  it.each(['ops.config.change', 'ops.audit.read'] as const)(
+    'blocks revoked %s before source disclosure',
+    async (permission) => {
+      const e = await setup();
+      e.grants.revoked.add(permission);
+      const r =
+        permission === 'ops.config.change'
+          ? await e.adapter.configurationPreflight(e.context, scope, request)
+          : await e.adapter.audit(e.context, scope, auditRequest);
+      blocked(r.guard);
+      expect(e.port.configReads + e.port.auditReads).toBe(0);
+    },
+  );
+  it.each(['ops.config.change', 'ops.audit.read'] as const)(
+    'blocks %s revoked during the final head read',
+    async (permission) => {
+      const e = await setup();
+      e.port.afterHead = () => {
+        e.grants.revoked.add(permission);
+      };
+      const r =
+        permission === 'ops.config.change'
+          ? await e.adapter.configurationPreflight(e.context, scope, request)
+          : await e.adapter.audit(e.context, scope, auditRequest);
+      expect(r.guard.decision).toBe('DENIED');
+      expect(r.runtimeAuthorized).toBe(false);
+    },
+  );
+  it('sanitizes source failures without exposing credentials or retrying', async () => {
+    const e = await setup();
+    e.port.fail = true;
+    const r = await e.adapter.configurationPreflight(e.context, scope, request);
+    expect(r.guard.reason).toBe('TECHNICAL_SOURCE_READ_FAILED');
+    expect(JSON.stringify(r)).not.toContain('private-provider-password');
+    expect(e.port.configReads).toBe(1);
+  });
+  it('does not mutate source audit history', async () => {
+    const e = await setup(),
+      before = JSON.stringify(e.port.auditRead);
+    await e.adapter.audit(e.context, scope, auditRequest);
+    expect(JSON.stringify(e.port.auditRead)).toBe(before);
+  });
+});
```
