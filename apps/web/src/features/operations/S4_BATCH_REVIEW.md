# W10-DF-S4 — consolidated offline integration and UI quality

One bounded batch. Source-only composition and in-memory tests; not runtime
authorization, publication, export, provider verification or W10 completion.

## Canonical evidence actually accessed

Read-only Google Drive connector fetches succeeded for all five supplied sources:

- Artifact038, P1–P6: `1QqfjtfMhbzWCDjIHlGoRbpmx_5Q4QnxszwPcZyMjE7A`,
  modified 2026-11-05T12:21:26.527Z.
- Master, relevant DEC069 section: `1B9fzuLdLQ3IOeLno5y1uMICzhvVO91O0T7RSZ5PWM-s`,
  modified 2026-11-05T12:16:36.447Z.
- Catalog, relevant BR111 section: `1iNQ_lHOgllHxCpIJGlpyMy0XU9FUWmbOvzN96J6e0Qw`,
  modified 2026-11-05T12:18:31.596Z; four UCs still DRAFT, not DONE.
- S2 authorization: `11_kv_z2vQkla2TFyGdtYTsbWJZEmWwnynde6DFZALIk`,
  modified 2026-11-06T06:51:34.730Z.
- S3 review: `1Na0MdilJet9c5RIylKKWQX-JUMRpPirkyZ9rgc8AvG8`,
  modified 2026-11-06T07:41:33.209Z. It accepts reported offline evidence only;
  no independent local-file/browser/runtime review was claimed by GPT Web.

Local policies/evidence inspected read-only: API OFFLINE_BOUNDARY.md,
SERVER_BOUNDARY.md, CONSOLIDATED_OFFLINE_BATCH.md; UI UI_BATCH_REVIEW.md and the
actual current operations contracts, guards, adapters, route registration and
tests. Historical 406 API and 93 UI tests are not new S4 results.
No Drive modifications or external evidence sharing.

## Inventory and frozen manifest before edits

Baseline branch `feat/v2-se-sw-01-pilot-main`, HEAD
`d9ef6bcc70986e9f05e1a7c2c84ed0317f693ed9`; 450 dirty/untracked entries;
index SHA256 `9b01f017f40047492a81680c4badd8e5b9596a8eefa4cdf6f56af5e87476ba41`.
988 old Git-enumerated files outside the manifest, path/hash digest
`8ea9d5c3898d5a36089fa71758658c4a80691624bee5322b5b9a75fadcc8b55b`.

| Scope | Exact path under repository | Action |
|---|---|---|
| Backend | apps/api/src/modules/operations/operations-workbench.contracts.ts | NEW inert UI-selection/server-plan contracts |
| Backend | apps/api/src/modules/operations/operations-workbench.ts | NEW composition over existing authority/source/technical adapters |
| Backend | apps/api/src/modules/operations/operations-workbench.spec.ts | NEW isolated tests |
| Frontend | apps/web/src/features/operations/contracts.ts | EDIT type-only workbench contract re-export |
| Frontend | apps/web/src/features/operations/model.ts | EDIT unavailable workbench and minimal revision projection |
| Frontend | apps/web/src/features/operations/OperationsPage.tsx | EDIT bound preflight controls, reader identity and focus/scroll accessibility |
| Frontend | apps/web/src/features/operations/OperationsPreflight.tsx | NEW fail-closed offline condition UI |
| Frontend | apps/web/src/features/operations/integration.test.tsx | NEW cross-layer/offline UI tests |
| Evidence | apps/web/src/features/operations/S4_BATCH_REVIEW.md | NEW this report, commands/raw logs/diffs/receipts |

No route/navigation changes needed: existing App/RoleRoute registration and
OperationsNavigationLink cover all four routes and seven roles. They remain
read-only, as do W01–W09, existing W10 backend/tests and old evidence.

## Proven gaps and reuse matrix

Source line references here describe the inspected pre-edit baseline. Final
positions change when adding controls; exact baseline deltas are recorded below.

| UC / policy | Existing PASS code retained | Proven gap and bounded change | Still requires runtime/policy |
|---|---|---|---|
| 08 / P1 | S1 CMS guard; source-adapters.ts:249 CMS lineage/revision/person-author checks | UI contracts.ts:50 only had read(), Page.tsx:45 disabled operations with no preflight composition. Connect selected immutable revision/action to existing cms() guard; detached request before await | Actual content/revision/decision persistence, publication and legal/content classes |
| 54 / P2 | technical-adapter.ts:141 configuration preflight and sensitive-policy OPEN guard | No typed UI binding to that guard. Bind selected code to a server-owned request/revision plan, never to a caller-approved flag | Sensitive reviewer, real allowlists/secrets/provider and rollback policy |
| 55 / P3 | technical audit adapter's scoped immutable, secret-minimal projection; UNKNOWN health | No UI condition path to current-grant/audit revision guard. New bound preflight uses existing adapter, never edits history | Trusted W01 source/field policy, durable audit and SLA/retention |
| 56 / P4–P6 | S1/S2 daily/source/export guards, CF01 temporal fix, CSV encoder, seven-role projections | UI lacked view-ticket/export preflight wiring. New in-process composition retains opaque tickets, exact scope/date/display-filter plan, rechecks current grants/source heads; no download | Atomic runtime authorization, official readers, approved metric/CSV schema and genuine observations |
| All / UI reads | Existing date/role/scope binding and obsolete-response cancellation | Page.tsx:85–113 state key omitted reader identity; replacement reader could retain the old model until resolving. Bind state to reader too | Real server revocation fence still NOT REACHED |
| 08 / minimization | Typed revision read models | model.ts:195 history spread copied undeclared revision fields. Project id/revision explicitly and detach | Not a claim of independently verified source provenance |
| All / keyboard | Existing system components, labels, responsive cards/nav/table | Page heading had no route focus; report scroll wrapper had no keyboard focus; selected CMS detail lacked a focus target. Add semantic focus targets/labels without a new design system | Actual visual layout, screen-reader/contrast and real Chrome QA |

Seven-role report semantics remain unchanged: HV owned learning/outcomes; GV
assigned teaching/grading/attendance; TV scoped support/consultation; HVU scoped
academic/program/class decisions; TN ledger; TT assigned inspections/own shifts;
QT accounts/security/ops. Role navigation never establishes explicit grants.

## Implementation and trust boundary

The workbench is IN_MEMORY_ONLY and NOT registered with Nest or any HTTP route.
UI -> typed selection -> workbench -> unchanged S2 authority/source/technical
adapters -> S1 guards. Constructor receives the adapter-owned opaque context,
resource scope and future server-owned request/schema/revision plans; UI sends
no principal, role, approval boolean, grant or view ticket. Inputs/plans are
defensively copied. Scope mismatch, invalid/revoked grant, stale revision, missing
source/plan or conflicting display filters block. Concurrent old view checks
cannot replace a newer cached ticket; a new/failed view invalidates its prior
ticket and failed authority validation clears cached tickets.

Configuration request revisions, audit manifests and export field/schema plans
are integration requirements, not newly discovered W01 APIs or approved business
defaults. Missing plans stay BLOCKED. Display-filter equality binds the exact
offline selection to the supplied export plan; it does not invent semantic field
templates or source-state mappings. Sensitive approver policy remains OPEN.

Normal routes use UNIMPLEMENTED ports: no network request, operational data,
fake success, CSV Blob or mutation. Test-only snapshots stay visibly labelled.
Successful checks say only that conditions are consistent offline; they never
enable actual save/review/publish/config/export controls. Result flags always
remain runtimeAuthorized=false, mutationPerformed=false, exportPerformed=false,
auditPersisted=false. Forged success flags and unsafe reason strings are blocked;
raw provider errors are not shown. No historical source/audit data is rewritten.

## Visual/browser boundary

CHROME_VISUAL_QA=NOT_REACHED. Read-only inspection found the existing
scripts/m07-browser-smoke.mjs requires HTTP CDP, WebSocket and app navigation;
scripts/lib/e2e-browser-guard.mjs also calls a live fixture health endpoint and
target guard. That harness is outside the no-socket/no-DB allowance. It was NOT
executed or modified. No browser/service launch or substitute screenshot.
DOM focus, labels, single-flight and responsive containers can be tested offline,
but do not prove desktop/mobile pixels or assistive-technology behavior.

## Verification plan and actual evidence

After development, one bounded API W10 run (existing five pure suites plus the
new composition suite), one bounded web run (existing model/UI/App suites plus
new integration suite), scoped no-emit typecheck and lint. Raw commands, results,
preservation receipts and one consolidated fix list are appended after execution.
No repeated run-to-green, backend server, DB/SQL/socket or provider invocation.

## Status boundary

CODE COMPLETE refers only to authorized offline contracts/composition/UI changes.
OFFLINE TESTED requires the actual results below. VISUAL NOT VERIFIED and
RUNTIME NOT REACHED remain explicit. BUSINESS OPEN: metric/CSV definitions,
source effective-time mapping and templates, sensitive approver/rollback,
CMS content/legal/retention rules, audit field/privacy policy and health SLA.

Preserve W05B RC01–09=0 PASS/0 FAIL/9 NOT REACHED, closeout DEFERRED;
migrations33/34 UNACCEPTED. MEDIA_QA_PASS=false, ACADEMIC_APPROVED=false,
PUBLISHED=false. No UC completion or production PASS.

STOP for one GPT Web Batch Review. No automatic CF/runtime stage.

## Actual S4 verification — completed

| Check | PASS | FAIL | SKIP / NOT REACHED | Evidence |
|---|---:|---:|---|---|
| W10 API offline Jest | 431 | 0 | 0 skipped | Six suites, 13.887 s, exit 0; unchanged five suites 406 plus new workbench 25 |
| W10 web offline Vitest | 112 | 0 | 0 skipped | Four suites, 19.11 s, exit 0; existing 93 plus new integration 19 |
| API strict noEmit | PASS | 0 | — | 18 roots and dependencies, zero diagnostics |
| API scoped lint | PASS | 0 | — | 18 operations TS files, zero diagnostics |
| Web initial noEmit | — | 1 | — | Deferred test mock inferred Promise<unknown>; raw diagnostic retained |
| Web initial lint | — | 1 | — | Unused waitFor import in new integration test; raw diagnostic retained |
| Web final strict noEmit | PASS | 0 | — | 11 roots including existing Vite ambient declaration and dependencies |
| Web final scoped lint | PASS | 0 | — | Eight W10 TS/TSX files + read-only App/AuthNavigation |
| Chrome visual/accessibility | — | — | NOT REACHED | No qualifying socket-free harness; no screenshots invented |
| HTTP/DB/runtime authority/providers | — | — | NOT REACHED | Outside batch authority |

API and web are separate invocations in one verification batch. Do not report
historical 584, or 406+93 from S2/S3, as one current execution.

One post-check cleanup changed only the new integration test: remove unused
`waitFor` and annotate `vi.fn<OperationsWorkbenchPort['check']>` /
`Promise<OperationsWorkbenchResult>`. No assertion, expected outcome or runtime
expression changed. Both transpile to identical JavaScript SHA256
`70f2aebcb0e0052a3f8f379b4f4f4aadcba6fb018cad383d0b638fe9db54a666`. Tests were NOT rerun.
Only the failed web typecheck/lint were repeated once after that cleanup.
No timeout, skip, fake clock, changed assertion, new service or run-to-green loop.

The backend guard rejected forbidden runtime imports and attempted network
operations; actual counts were blockedImports=0 and networkAttempts=0. Web tests
trap unexpected fetch. Existing CF01 temporal tests remain in the API S2 suite;
all original backend implementation/spec files and S3 test files were read-only.

## Exact verification commands and raw results

No command below is an instruction to start a runtime stage. These are receipts
of the bounded offline checks actually executed. Typecheck uses the existing
tsconfig and TypeScript compiler API with noEmit=true and incremental=false;
there is no emit/tsbuildinfo or shared configuration edit.

### api-tests

Working directory: `repository root`.

```powershell
node -e '
const Module=require(''module'');let blockedImports=0,networkAttempts=0;const original=Module._load;
Module._load=function(n,...a){if(/^(pg($|\/)|@prisma\/|@nestjs\/)|generated[\\/]prisma/.test(n)){blockedImports++;throw Error(''W10_OFFLINE_FORBIDDEN_IMPORT'');}return original.call(this,n,...a);};
const deny=()=>{networkAttempts++;throw Error(''W10_OFFLINE_NETWORK_FORBIDDEN'');};
const net=require(''node:net'');net.Socket.prototype.connect=deny;net.Server.prototype.listen=deny;require(''node:tls'').connect=deny;for(const lib of [''node:http'',''node:https'']){const m=require(lib);m.request=deny;m.get=deny;}globalThis.fetch=deny;
require(''jest'').runCLI({config:require(''path'').resolve(''apps/api/jest.config.cjs''),runInBand:true,cache:false,verbose:false,runTestsByPath:true,_:[''operations-foundation.spec.ts'',''operations-s2.spec.ts'',''operations-permission-map.spec.ts'',''operations-w01-row-mapper.spec.ts'',''operations-technical.spec.ts'',''operations-workbench.spec.ts''].map(n=>''apps/api/src/modules/operations/''+n),$0:''W10_S4_OFFLINE''},[process.cwd()]).then(({results:r})=>{console.log(''W10_S4_API_RESULT ''+JSON.stringify({passed:r.numPassedTests,failed:r.numFailedTests,pending:r.numPendingTests,suites:r.numTotalTestSuites,success:r.success,blockedImports,networkAttempts,files:r.testResults.map(t=>({file:t.testFilePath.split(/[\\/]/).pop(),passed:t.numPassingTests,failed:t.numFailingTests,pending:t.numPendingTests,cases:t.testFilePath.includes(''workbench'')?t.testResults.map(x=>({title:x.fullName,status:x.status,duration:x.duration})):undefined}))}));process.exitCode=r.success&&networkAttempts===0&&blockedImports===0?0:1;}).catch(e=>{console.error(e);process.exitCode=1;});
'
```

### web-tests

Working directory: `D:\KLTN_Project\smart-english-elearning-kltn\apps\web`.

```powershell
node ../../node_modules/vitest/vitest.mjs run --config vite.config.ts --maxWorkers 1 --no-file-parallelism src/features/operations/model.test.ts src/features/operations/operations.test.tsx src/features/operations/integration.test.tsx src/App.test.tsx
```

### api-typecheck

Working directory: `repository root`.

```powershell
node -e '
const fs=require(''fs''),path=require(''path''),ts=require(''typescript'');
const area=process.argv[1],cfgpath=''apps/''+area+''/tsconfig''+(area===''web''?''.app'':'''')+''.json'',cfg=ts.readConfigFile(cfgpath,ts.sys.readFile),parsed=ts.parseJsonConfigFileContent(cfg.config,ts.sys,path.dirname(cfgpath));
const roots=area===''api''?fs.readdirSync(''apps/api/src/modules/operations'').filter(n=>n.endsWith(''.ts'')).map(n=>path.resolve(''apps/api/src/modules/operations/''+n)):fs.readdirSync(''apps/web/src/features/operations'').filter(n=>/\.tsx?$/.test(n)).map(n=>path.resolve(''apps/web/src/features/operations/''+n)).concat([path.resolve(''apps/web/src/App.tsx''),path.resolve(''apps/web/src/features/auth/AuthNavigation.tsx''),...parsed.fileNames.filter(n=>n.endsWith(''.d.ts'')).map(n=>path.resolve(n))]);
const program=ts.createProgram(roots,{...parsed.options,noEmit:true,declaration:false,sourceMap:false,incremental:false,composite:false});
const d=[...parsed.errors,...ts.getPreEmitDiagnostics(program)];
console.log(JSON.stringify({area,roots:roots.length,noEmit:true,diagnostics:d.length}));
for(const x of d){const at=x.file&&x.start!==undefined?x.file.getLineAndCharacterOfPosition(x.start):null;console.log((x.file?x.file.fileName:''config'')+(at?'':''+(at.line+1)+'':''+(at.character+1):'''')+'' TS''+x.code+'' ''+ts.flattenDiagnosticMessageText(x.messageText,'' ''));}
process.exitCode=d.length?1:0;
' api
```

### web-typecheck

Working directory: `repository root`.

```powershell
node -e '
const fs=require(''fs''),path=require(''path''),ts=require(''typescript'');
const area=process.argv[1],cfgpath=''apps/''+area+''/tsconfig''+(area===''web''?''.app'':'''')+''.json'',cfg=ts.readConfigFile(cfgpath,ts.sys.readFile),parsed=ts.parseJsonConfigFileContent(cfg.config,ts.sys,path.dirname(cfgpath));
const roots=area===''api''?fs.readdirSync(''apps/api/src/modules/operations'').filter(n=>n.endsWith(''.ts'')).map(n=>path.resolve(''apps/api/src/modules/operations/''+n)):fs.readdirSync(''apps/web/src/features/operations'').filter(n=>/\.tsx?$/.test(n)).map(n=>path.resolve(''apps/web/src/features/operations/''+n)).concat([path.resolve(''apps/web/src/App.tsx''),path.resolve(''apps/web/src/features/auth/AuthNavigation.tsx''),...parsed.fileNames.filter(n=>n.endsWith(''.d.ts'')).map(n=>path.resolve(n))]);
const program=ts.createProgram(roots,{...parsed.options,noEmit:true,declaration:false,sourceMap:false,incremental:false,composite:false});
const d=[...parsed.errors,...ts.getPreEmitDiagnostics(program)];
console.log(JSON.stringify({area,roots:roots.length,noEmit:true,diagnostics:d.length}));
for(const x of d){const at=x.file&&x.start!==undefined?x.file.getLineAndCharacterOfPosition(x.start):null;console.log((x.file?x.file.fileName:''config'')+(at?'':''+(at.line+1)+'':''+(at.character+1):'''')+'' TS''+x.code+'' ''+ts.flattenDiagnosticMessageText(x.messageText,'' ''));}
process.exitCode=d.length?1:0;
' web
```

### api-lint

Working directory: `repository root`.

```powershell
node node_modules/eslint/bin/eslint.js --config apps/api/eslint.config.mjs apps/api/src/modules/operations/operations.contracts.ts apps/api/src/modules/operations/operations-foundation.ts apps/api/src/modules/operations/operations-foundation.spec.ts apps/api/src/modules/operations/operations-authority.contracts.ts apps/api/src/modules/operations/operations-authority-adapter.ts apps/api/src/modules/operations/operations-source.contracts.ts apps/api/src/modules/operations/operations-source-adapters.ts apps/api/src/modules/operations/operations-s2.spec.ts apps/api/src/modules/operations/operations-permission-map.ts apps/api/src/modules/operations/operations-permission-map.spec.ts apps/api/src/modules/operations/operations-w01-row-mapper.ts apps/api/src/modules/operations/operations-w01-row-mapper.spec.ts apps/api/src/modules/operations/operations-technical.contracts.ts apps/api/src/modules/operations/operations-technical-adapter.ts apps/api/src/modules/operations/operations-technical.spec.ts apps/api/src/modules/operations/operations-workbench.contracts.ts apps/api/src/modules/operations/operations-workbench.ts apps/api/src/modules/operations/operations-workbench.spec.ts
```

### web-lint

Working directory: `repository root`.

```powershell
node node_modules/eslint/bin/eslint.js --config apps/web/eslint.config.mjs apps/web/src/features/operations/contracts.ts apps/web/src/features/operations/model.ts apps/web/src/features/operations/model.test.ts apps/web/src/features/operations/OperationsNavigationLink.tsx apps/web/src/features/operations/OperationsPage.tsx apps/web/src/features/operations/operations.test.tsx apps/web/src/features/operations/OperationsPreflight.tsx apps/web/src/features/operations/integration.test.tsx apps/web/src/App.tsx apps/web/src/features/auth/AuthNavigation.tsx
```

Final web typecheck/lint used the exact same respective commands above once.
Raw initial failures are retained alongside final results:

### api-tests — exit 0

```text
PASS apps/api/src/modules/operations/operations-s2.spec.ts (11.592 s)
PASS apps/api/src/modules/operations/operations-foundation.spec.ts
PASS apps/api/src/modules/operations/operations-workbench.spec.ts
PASS apps/api/src/modules/operations/operations-technical.spec.ts
PASS apps/api/src/modules/operations/operations-w01-row-mapper.spec.ts
PASS apps/api/src/modules/operations/operations-permission-map.spec.ts

Test Suites: 6 passed, 6 total
Tests:       431 passed, 431 total
Snapshots:   0 total
Time:        13.887 s
Ran all test suites within paths "apps/api/src/modules/operations/operations-foundation.spec.ts", "apps/api/src/modules/operations/operations-s2.spec.ts", "apps/api/src/modules/operations/operations-permission-map.spec.ts", "apps/api/src/modules/operations/operations-w01-row-mapper.spec.ts", "apps/api/src/modules/operations/operations-technical.spec.ts", "apps/api/src/modules/operations/operations-workbench.spec.ts".
W10_S4_API_RESULT {"passed":431,"failed":0,"pending":0,"suites":6,"success":true,"blockedImports":0,"networkAttempts":0,"files":[{"file":"operations-s2.spec.ts","passed":78,"failed":0,"pending":0},{"file":"operations-foundation.spec.ts","passed":106,"failed":0,"pending":0},{"file":"operations-workbench.spec.ts","passed":25,"failed":0,"pending":0,"cases":[{"title":"W10 offline UI/backend workbench composition STUDENT report -> export preflight reuses existing guarded adapters without executing","status":"passed","duration":9},{"title":"W10 offline UI/backend workbench composition INSTRUCTOR report -> export preflight reuses existing guarded adapters without executing","status":"passed","duration":4},{"title":"W10 offline UI/backend workbench composition COUNSELOR report -> export preflight reuses existing guarded adapters without executing","status":"passed","duration":3},{"title":"W10 offline UI/backend workbench composition ACADEMIC_MANAGER report -> export preflight reuses existing guarded adapters without executing","status":"passed","duration":3},{"title":"W10 offline UI/backend workbench composition CASHIER report -> export preflight reuses existing guarded adapters without executing","status":"passed","duration":3},{"title":"W10 offline UI/backend workbench composition TEACHING_INSPECTOR report -> export preflight reuses existing guarded adapters without executing","status":"passed","duration":4},{"title":"W10 offline UI/backend workbench composition SYSTEM_ADMIN report -> export preflight reuses existing guarded adapters without executing","status":"passed","duration":3},{"title":"W10 offline UI/backend workbench composition does not read source under REVOKED grant","status":"passed","duration":0},{"title":"W10 offline UI/backend workbench composition does not read source under UNKNOWN grant","status":"passed","duration":0},{"title":"W10 offline UI/backend workbench composition rejects invalid grants before source disclosure","status":"passed","duration":1},{"title":"W10 offline UI/backend workbench composition denies cross-resource selection without source reads","status":"passed","duration":0},{"title":"W10 offline UI/backend workbench composition cannot use a forged or differently issued authority context","status":"passed","duration":1},{"title":"W10 offline UI/backend workbench composition requires a previous guarded view and exact date/filter plan","status":"passed","duration":2},{"title":"W10 offline UI/backend workbench composition revocation between view/export denies and invalidates the cached ticket","status":"passed","duration":2},{"title":"W10 offline UI/backend workbench composition source change after view is blocked by the existing export head check","status":"passed","duration":2},{"title":"W10 offline UI/backend workbench composition missing source never creates an export ticket","status":"passed","duration":0},{"title":"W10 offline UI/backend workbench composition concurrent older view cannot replace the newer selection ticket","status":"passed","duration":5},{"title":"W10 offline UI/backend workbench composition TV EDIT_DRAFT is a condition check, never a saved revision","status":"passed","duration":2},{"title":"W10 offline UI/backend workbench composition TV SUBMIT_REVIEW is a condition check, never a saved revision","status":"passed","duration":1},{"title":"W10 offline UI/backend workbench composition HVU review pins a detached revision before asynchronous reads; self-approval denied","status":"passed","duration":5},{"title":"W10 offline UI/backend workbench composition stale CMS revision cannot follow the latest revision implicitly","status":"passed","duration":1},{"title":"W10 offline UI/backend workbench composition QT configuration and audit route to the existing technical adapters only","status":"passed","duration":4},{"title":"W10 offline UI/backend workbench composition unknown configuration or missing bound server plans fail closed","status":"passed","duration":0},{"title":"W10 offline UI/backend workbench composition does not resolve sensitive approval policy from an in-memory plan","status":"passed","duration":0},{"title":"W10 offline UI/backend workbench composition sanitizes provider errors and has no performed-success branch","status":"passed","duration":1}]},{"file":"operations-technical.spec.ts","passed":41,"failed":0,"pending":0},{"file":"operations-w01-row-mapper.spec.ts","passed":78,"failed":0,"pending":0},{"file":"operations-permission-map.spec.ts","passed":103,"failed":0,"pending":0}]}
```

### web-tests — exit 0

```text
RUN  v4.1.11 D:/KLTN_Project/smart-english-elearning-kltn/apps/web


 Test Files  4 passed (4)
      Tests  112 passed (112)
   Start at  15:04:10
   Duration  19.11s (transform 3.08s, setup 0ms, import 8.03s, tests 4.46s, environment 5.69s)
```

### api-typecheck — exit 0

```text
{"area":"api","roots":18,"noEmit":true,"diagnostics":0}
```

### web-typecheck — exit 1

```text
{"area":"web","roots":11,"noEmit":true,"diagnostics":1}
D:/KLTN_Project/smart-english-elearning-kltn/apps/web/src/features/operations/integration.test.tsx:407:7 TS2322 Type 'Mock<() => Promise<unknown>>' is not assignable to type '(selection: OperationsWorkbenchSelection) => Promise<OperationsWorkbenchResult>'.   Type 'Promise<unknown>' is not assignable to type 'Promise<OperationsWorkbenchResult>'.     Type 'unknown' is not assignable to type 'OperationsWorkbenchResult'.
```

### api-lint — exit 0

```text
(no stdout/stderr diagnostics)
```

### web-lint — exit 1

```text
D:\KLTN_Project\smart-english-elearning-kltn\apps\web\src\features\operations\integration.test.tsx
  2:51  error  'waitFor' is defined but never used  @typescript-eslint/no-unused-vars

✖ 1 problem (1 error, 0 warnings)
```

### web-typecheck-final — exit 0

```text
{"area":"web","roots":11,"noEmit":true,"diagnostics":0}
```

### web-lint-final — exit 0

```text
(no stdout/stderr diagnostics)
```

## Preservation receipt and changed-file hashes

Measured after code/tests: branch `feat/v2-se-sw-01-pilot-main`; HEAD `d9ef6bcc70986e9f05e1a7c2c84ed0317f693ed9` unchanged.
Git index SHA256 `9b01f017f40047492a81680c4badd8e5b9596a8eefa4cdf6f56af5e87476ba41` unchanged. Working tree
450 -> 456 entries, exactly six new manifest files plus three edits
of existing untracked S3 files. No new route/navigation edit, staging or commit.

988 old Git-enumerated files outside the nine-path manifest remain byte-identical
with digest `8ea9d5c3898d5a36089fa71758658c4a80691624bee5322b5b9a75fadcc8b55b`. This includes all pre-existing API operations
files, S3 UI tests/report, App/AuthNavigation, W09 and prior-wave code.

Original protected ledger: 11,351/11,353 match the older source ledger; the two
inherited S3 registration changes (App.tsx and AuthNavigation.tsx) remain exactly
at this S4 baseline and are NOT S4 changes. No new missing/unexplained protected
mismatch. Migrations 1–34: 34/34; media: 13/13; incident evidence: 22/22 matches.
CF01, S10, W5 v02, M07, monthly calendar and old evidence remain preserved.
These file hashes do not verify current database rows, cluster health or
migration acceptance.

| Changed/new source | Bytes | SHA256 after |
|---|---:|---|
| `apps/api/src/modules/operations/operations-workbench.contracts.ts` | 1936 | `ea8a618b64edcefb421afd2082c72aad09bd8cc2927fc86786ae46feed489aa0` |
| `apps/api/src/modules/operations/operations-workbench.ts` | 4994 | `d5a87be7aa15152a10dd474a18203bd7f30894552f5c5a06826d908b61a6f473` |
| `apps/api/src/modules/operations/operations-workbench.spec.ts` | 19841 | `f8ac7c11ac57a15598395627f83d0401eb593b49dae9f2906d158388c4ff02a7` |
| `apps/web/src/features/operations/contracts.ts` | 2644 | `799d2f2d82047e693304313a2815ee26c6edf9691512377b212ccb9684133ee0` |
| `apps/web/src/features/operations/model.ts` | 8458 | `6f636641563529edf91ec508c2ef3464809fc2bf7504341700f92467d8afc14f` |
| `apps/web/src/features/operations/OperationsPage.tsx` | 34117 | `c072095cc2a875cebded51919bd74448b1368287cb8330b180f0c51e22a6657a` |
| `apps/web/src/features/operations/OperationsPreflight.tsx` | 4818 | `d1f3e4594a74a65c2abfc7f0c57564109e69792f8bd4d1ea88473b9154949009` |
| `apps/web/src/features/operations/integration.test.tsx` | 18301 | `a96b18a38dfd864e0da1f2bde9ba5545eaa9579d93f597ad78bf4375b28a3690` |

The ninth path is this new report. Its self hash is excluded to avoid a recursive
digest; it is reported separately at handoff.

Source diff below compares against the captured pre-edit working-tree content,
not HEAD (which contains unrelated local work). Complete new-file diffs are
included for five new source/test files; this report is the sixth new file.
No old report was overwritten.

## Consolidated Fix List and remaining gates

| ID | Classification | Result / remaining work |
|---|---|---|
| S4-T01 | Test typing/import — corrected, review pending | Initial TS2322 and unused-import lint failures retained; one annotation/import cleanup, identical emitted JS, final type/lint PASS. No repeated tests. |
| S4-R01 | RUNTIME NOT REACHED | Default UI read/condition ports remain UNAVAILABLE/UNIMPLEMENTED; no real API registration, authenticated source reader, grant provenance, coherent DB snapshot, atomic revocation fence or persistence. Offline condition checks are not runtime authorization. |
| S4-R02 | RUNTIME / BUSINESS OPEN | Server-owned config request/audit manifest/CSV field plan must be authenticated and approval-bound. Display-filter mismatch blocks; this batch does not decide canonical metrics, CSV columns or sensitive change authority. No actual export/publication or audit write. |
| S4-V01 | VISUAL NOT VERIFIED | Real Chrome desktop/mobile, inherited header density/overflow, focus visibility under sticky header, contrast and screen-reader acceptance remain NOT REACHED. DOM focus tests are not visual/a11y certification. |
| S4-B01 | BUSINESS OPEN | Content classes/licensing/retention, detailed metric/source-state/effective-time/CSV schemas, audit disclosure, sensitive approver and health SLA remain undecided. No defaults invented. |

No material P0/P1 defect was proven by this bounded offline verification.
Do not interpret missing runtime evidence as security/production PASS.
The original presentation reader remains a labelled in-memory fixture boundary;
the new workbench composes condition checks only, not genuine source loading.
Real frontend/backend payload readers still need a separately approved runtime
integration environment. No production-ready W10 claim.

CODE COMPLETE: the nine-path authorized offline composition/UI delta.
OFFLINE TESTED: API 431 and web 112 PASS, final scoped typecheck/lint PASS.
VISUAL NOT VERIFIED: CHROME_VISUAL_QA=NOT_REACHED.
RUNTIME NOT REACHED: actual authorization/source/persistence/provider operations.
BUSINESS OPEN: items above; no UC DONE or acceptance of migrations33/34.

STOP for ONE GPT Web Batch Review. No automatic CF, runtime stage or next wave.
MEDIA_QA_PASS=false; ACADEMIC_APPROVED=false; PUBLISHED=false.

## Complete scoped source diff

### apps/api/src/modules/operations/operations-workbench.contracts.ts

```diff
===================================================================
--- /dev/null	
+++ apps/api/src/modules/operations/operations-workbench.contracts.ts	
@@ -1,0 +1,43 @@
\ No newline at end of file
+import type { CmsBoundaryRequest, ExportBoundaryRequest } from './operations-source.contracts';
+import type { ConfigurationPreflightRequest } from './operations-technical.contracts';
+import type { GuardResult, Revision } from './operations.contracts';
+
+/** In-process offline contract. This is NOT a registered HTTP DTO or capability.
+ * The UI supplies selectors only; principal, grants, field plan and opaque view
+ * ticket stay with the bound composition. No command performs a mutation.
+ */
+export type OperationsWorkbenchSelection =
+  | { readonly kind: 'CMS'; readonly scopeId: string; readonly request: CmsBoundaryRequest }
+  | { readonly kind: 'CONFIGURATION'; readonly scopeId: string; readonly settingCode: string }
+  | { readonly kind: 'AUDIT'; readonly scopeId: string }
+  | { readonly kind: 'DAILY'; readonly scopeId: string; readonly date: string }
+  | {
+      readonly kind: 'EXPORT';
+      readonly scopeId: string;
+      readonly date: string;
+      readonly filters: { readonly source: string; readonly state: string };
+    };
+
+/** Required future SERVER-owned bindings. Missing plans block; UI text/booleans
+ * never approve an allowlist, revision, export schema, or sensitive approver.
+ */
+export interface OperationsWorkbenchPlan {
+  readonly configuration?: ConfigurationPreflightRequest;
+  readonly auditManifest?: Revision;
+  readonly export?: {
+    readonly date: string;
+    readonly request: ExportBoundaryRequest;
+    readonly displayFilters: { readonly source: string; readonly state: string };
+  };
+}
+export interface OperationsWorkbenchResult {
+  readonly guard: GuardResult;
+  readonly runtimeAuthorized: false;
+  readonly mutationPerformed: false;
+  readonly exportPerformed: false;
+  readonly auditPersisted: false;
+}
+export interface OperationsWorkbenchPort {
+  readonly mode: 'UNIMPLEMENTED' | 'IN_MEMORY_ONLY';
+  check(selection: OperationsWorkbenchSelection): Promise<OperationsWorkbenchResult>;
+}
```

### apps/api/src/modules/operations/operations-workbench.ts

```diff
===================================================================
--- /dev/null	
+++ apps/api/src/modules/operations/operations-workbench.ts	
@@ -1,0 +1,115 @@
\ No newline at end of file
+import {
+  boundaryGuard,
+  copyBoundaryData,
+  equalScope,
+  OperationsAuthorityAdapter,
+} from './operations-authority-adapter';
+import type { OperationsAuthorityContext } from './operations-authority.contracts';
+import { OperationsSourceAdapter } from './operations-source-adapters';
+import type { OperationsViewTicket } from './operations-source.contracts';
+import { OperationsTechnicalAdapter } from './operations-technical-adapter';
+import type { GuardResult, ResourceScope } from './operations.contracts';
+import type {
+  OperationsWorkbenchPlan,
+  OperationsWorkbenchPort,
+  OperationsWorkbenchResult,
+  OperationsWorkbenchSelection,
+} from './operations-workbench.contracts';
+
+const result = (guard: GuardResult): OperationsWorkbenchResult => ({
+  guard,
+  runtimeAuthorized: false,
+  mutationPerformed: false,
+  exportPerformed: false,
+  auditPersisted: false,
+});
+
+/** Offline composition only. Reuses S1/S2 guards; no controller, writer, provider,
+ * DB loader or runtime authentication. Its mode does not assert server trust.
+ * An opaque context belongs to its authority adapter; no caller role/id is used.
+ */
+export class OperationsOfflineWorkbench implements OperationsWorkbenchPort {
+  readonly mode = 'IN_MEMORY_ONLY' as const;
+  readonly #scope: ResourceScope;
+  readonly #plan: OperationsWorkbenchPlan;
+  readonly #views = new Map<string, OperationsViewTicket>();
+  readonly #epochs = new Map<string, number>();
+  constructor(
+    private readonly authority: OperationsAuthorityAdapter,
+    private readonly sources: OperationsSourceAdapter,
+    private readonly technical: OperationsTechnicalAdapter,
+    private readonly context: OperationsAuthorityContext,
+    scope: ResourceScope,
+    plan: OperationsWorkbenchPlan = {},
+  ) {
+    this.#scope = copyBoundaryData(scope);
+    this.#plan = copyBoundaryData(plan);
+  }
+  async check(selection: OperationsWorkbenchSelection): Promise<OperationsWorkbenchResult> {
+    try {
+      // Capture detached immutable inputs BEFORE awaiting authority/source reads.
+      const q = copyBoundaryData(selection);
+      if (!equalScope(this.#scope, this.#scope) || q.scopeId !== this.#scope.id)
+        return result(boundaryGuard('DENIED', 'WORKBENCH_SCOPE_DENIED'));
+      let epoch = 0;
+      if (q.kind === 'DAILY') {
+        epoch = (this.#epochs.get(q.date) ?? 0) + 1;
+        this.#epochs.set(q.date, epoch);
+        this.#views.delete(q.date);
+      }
+      const current = await this.authority.revalidate(this.context);
+      if (current.decision !== 'CONDITIONS_MET_OFFLINE') {
+        this.#views.clear();
+        return result(current);
+      }
+      switch (q.kind) {
+        case 'CMS':
+          return result(await this.sources.cms(this.context, this.#scope, q.request));
+        case 'CONFIGURATION': {
+          const p = this.#plan.configuration;
+          if (!p) return result(boundaryGuard('BLOCKED', 'CONFIG_REQUEST_BINDING_UNAVAILABLE'));
+          if (p.settingCode !== q.settingCode)
+            return result(boundaryGuard('DENIED', 'CONFIG_REQUEST_BINDING_MISMATCH'));
+          return result(
+            (await this.technical.configurationPreflight(this.context, this.#scope, p)).guard,
+          );
+        }
+        case 'AUDIT': {
+          const expectedManifest = this.#plan.auditManifest;
+          if (!expectedManifest)
+            return result(boundaryGuard('BLOCKED', 'AUDIT_REVISION_BINDING_UNAVAILABLE'));
+          return result(
+            (await this.technical.audit(this.context, this.#scope, { expectedManifest })).guard,
+          );
+        }
+        case 'DAILY': {
+          const checked = await this.sources.daily(this.context, this.#scope, { date: q.date });
+          if (epoch !== this.#epochs.get(q.date))
+            return result(boundaryGuard('BLOCKED', 'VIEW_PREFLIGHT_SUPERSEDED'));
+          if (checked.guard.decision === 'CONDITIONS_MET_OFFLINE' && checked.viewTicket)
+            this.#views.set(q.date, checked.viewTicket);
+          return result(checked.guard);
+        }
+        case 'EXPORT': {
+          const p = this.#plan.export;
+          const ticket = this.#views.get(q.date);
+          if (!p || p.date !== q.date)
+            return result(boundaryGuard('BLOCKED', 'EXPORT_SCHEMA_BINDING_UNAVAILABLE'));
+          if (
+            !q.filters ||
+            q.filters.source !== p.displayFilters.source ||
+            q.filters.state !== p.displayFilters.state
+          )
+            return result(boundaryGuard('BLOCKED', 'EXPORT_DISPLAY_FILTER_BINDING_UNAVAILABLE'));
+          if (!ticket) return result(boundaryGuard('DENIED', 'VIEW_PREFLIGHT_REQUIRED'));
+          return result((await this.sources.export(this.context, ticket, p.request)).guard);
+        }
+        default:
+          return result(boundaryGuard('BLOCKED', 'WORKBENCH_SELECTION_INVALID'));
+      }
+    } catch {
+      // Source/provider errors must never reach UI/logs as secret-bearing text.
+      return result(boundaryGuard('BLOCKED', 'WORKBENCH_PREFLIGHT_FAILED'));
+    }
+  }
+}
```

### apps/api/src/modules/operations/operations-workbench.spec.ts

```diff
===================================================================
--- /dev/null	
+++ apps/api/src/modules/operations/operations-workbench.spec.ts	
@@ -1,0 +1,582 @@
\ No newline at end of file
+import { OperationsAuthorityAdapter } from './operations-authority-adapter';
+import type {
+  OperationsAuthorityContext,
+  OperationsAuthorityPort,
+  PrincipalRead,
+} from './operations-authority.contracts';
+import { OperationsSourceAdapter } from './operations-source-adapters';
+import type {
+  CmsSourceRead,
+  DailySourceRead,
+  OperationsSourcePort,
+  OfficialDecisionContract,
+  ExportBoundaryRequest,
+} from './operations-source.contracts';
+import { OperationsTechnicalAdapter } from './operations-technical-adapter';
+import type {
+  OperationsTechnicalSourcePort,
+  ConfigurationPreflightRead,
+  TechnicalAuditRead,
+} from './operations-technical.contracts';
+import type {
+  BusinessRole,
+  GrantRead,
+  ResourceScope,
+  Revision,
+  SourceDomain,
+  SourceWave,
+} from './operations.contracts';
+import { OperationsOfflineWorkbench } from './operations-workbench';
+import type {
+  OperationsWorkbenchPlan,
+  OperationsWorkbenchSelection,
+} from './operations-workbench.contracts';
+
+const ref = (id: string, revision = 'synthetic-1'): Revision => ({ id, revision });
+const date = '2026-11-06';
+const roleScopes: readonly [BusinessRole, ResourceScope['kind'], SourceDomain, SourceWave][] = [
+  ['STUDENT', 'LEARNER', 'LEARNING', 'W03'],
+  ['INSTRUCTOR', 'CLASS', 'TEACHING', 'W02'],
+  ['COUNSELOR', 'SUPPORT_QUEUE', 'SUPPORT', 'W05A'],
+  ['ACADEMIC_MANAGER', 'CLASS', 'ACADEMIC', 'W02'],
+  ['CASHIER', 'LEDGER', 'FINANCE', 'W07'],
+  ['TEACHING_INSPECTOR', 'INSPECTION', 'INSPECTION', 'W08'],
+  ['SYSTEM_ADMIN', 'TECHNICAL', 'ACCOUNTS', 'W01'],
+];
+async function environment(role: BusinessRole = 'STUDENT', kind?: ResourceScope['kind']) {
+  const projection = roleScopes.find((row) => row[0] === role)!;
+  const scope: ResourceScope = {
+    kind: kind ?? projection[1],
+    id: role === 'STUDENT' ? 'synthetic-user' : 'synthetic-scope',
+  };
+  const state = {
+    grant: 'ACTIVE' as GrantRead['state'],
+    validity: 'VALID' as GrantRead['validity'],
+    principalFailure: false,
+    sourceFailure: false,
+    sourceReads: 0,
+  };
+  const principal: PrincipalRead = {
+    ref: ref('principal'),
+    accountState: 'ACTIVE',
+    authorityEpoch: 'synthetic-epoch',
+    principal: {
+      principalId: 'synthetic-user',
+      personId: 'synthetic-person',
+      role,
+      sessionRef: ref('session'),
+      sessionState: 'AUTHENTICATED',
+    },
+  };
+  const authPort: OperationsAuthorityPort = {
+    mode: 'IN_MEMORY_ONLY',
+    readPrincipal: async () => {
+      if (state.principalFailure) throw Error('password=NEVER_DISCLOSE');
+      return structuredClone(principal);
+    },
+    readGrant: async (principalId, permission, target) => ({
+      ref: ref('grant-' + permission),
+      principalId,
+      permission,
+      scope: target,
+      state: state.grant,
+      validity: state.validity,
+      authorityEpoch: 'synthetic-epoch',
+      decisionRef: ref('grant-decision'),
+      authorityRef: ref('grant-authority'),
+    }),
+  };
+  const authority = new OperationsAuthorityAdapter(authPort);
+  const context = (await authority.open()).context!;
+  const decision = (
+    id: string,
+    subject: string,
+    purpose: OfficialDecisionContract['purpose'],
+    rule: string,
+  ): OfficialDecisionContract => ({
+    ref: ref(id),
+    subjectRef: ref(subject),
+    purpose,
+    ruleRef: ref(rule),
+    scope,
+    authorityRef: ref('independent-authority'),
+    state: 'APPROVED',
+  });
+  const decisions = [
+    decision('metric-approval', 'metric-policy', 'POLICY', 'policy-rule'),
+    decision('confirmation', 'metric-source', 'CONFIRMATION', 'confirmation-rule'),
+    decision('cms-approval', 'cms-policy', 'POLICY', 'policy-rule'),
+    decision('license', 'cms-revision', 'LICENSE', 'license-rule'),
+    decision('technical-approval', 'technical-policy', 'POLICY', 'policy-rule'),
+    decision('technical-confirmation', 'technical-source', 'CONFIRMATION', 'confirmation-rule'),
+  ];
+  const exportRequest: ExportBoundaryRequest = {
+    metricCodes: ['SYNTHETIC_METRIC'],
+    statusFilters: ['CONFIRMED', 'PENDING'],
+    fields: [{ code: 'SYNTHETIC_VALUE', masking: 'FULL', classification: 'PUBLIC' }],
+    format: 'CSV',
+    auditCorrelationRef: ref('correlation'),
+  };
+  const daily: DailySourceRead = {
+    manifestRef: ref('daily-head'),
+    lineagePin: ref('lineage'),
+    scope,
+    completeness: 'COMPLETE',
+    definitions: [
+      {
+        ref: ref('metric-policy'),
+        state: 'APPROVED',
+        approvalRef: ref('metric-approval'),
+        code: 'SYNTHETIC_METRIC',
+        role,
+        domain: projection[2],
+        sourceWave: projection[3],
+        required: true,
+        scope,
+        statusPredicateRef: ref('status'),
+        confirmationRuleRef: ref('confirmation-rule'),
+        effectiveTimeRuleRef: ref('effective-rule'),
+        expectedSourcePin: ref('metric-source'),
+      },
+    ],
+    records: [
+      {
+        claim: {
+          metricCode: 'SYNTHETIC_METRIC',
+          sourceRef: ref('metric-source'),
+          scope,
+          domain: projection[2],
+          sourceWave: projection[3],
+          effectiveAt: '2026-11-06T01:00:00.000Z',
+          evidenceState: 'CONFIRMED',
+          completeness: 'COMPLETE',
+          value: 0,
+          supersedesRef: null,
+          provenance: 'OFFLINE_SYNTHETIC',
+        },
+        decisionPins: [ref('confirmation')],
+        existing: null,
+      },
+    ],
+    view: {
+      viewerPrincipalId: 'synthetic-user',
+      role,
+      scope,
+      day: { date, timeZone: 'Asia/Ho_Chi_Minh', configurationRef: ref('center-timezone') },
+      manifestRef: ref('daily-head'),
+      metricCodes: exportRequest.metricCodes,
+      statusFilters: exportRequest.statusFilters,
+      fields: exportRequest.fields,
+      requiredSourcesComplete: true,
+    },
+  };
+  const cms: CmsSourceRead = {
+    manifestRef: ref('cms-head'),
+    lineagePin: ref('lineage'),
+    scope,
+    completeness: 'COMPLETE',
+    data: {
+      revision: {
+        ref: ref('cms-revision'),
+        contentId: scope.id,
+        state: role === 'COUNSELOR' ? 'DRAFT' : 'IN_REVIEW',
+        parentRef: null,
+        authorPersonIds: ['synthetic-other-author'],
+        authorshipComplete: true,
+        assetClearance: 'APPROVED',
+        licensingDecisionRef: ref('license'),
+      },
+      parent: null,
+      policy: {
+        ref: ref('cms-policy'),
+        state: 'APPROVED',
+        approvalRef: ref('cms-approval'),
+        scope,
+        actions: ['EDIT_DRAFT', 'SUBMIT_REVIEW', 'PUBLISH', 'REJECT', 'WITHDRAW'],
+      },
+      reasonRef: ref('decision-reason'),
+    },
+  };
+  const sourcesPort: OperationsSourcePort = {
+    mode: 'IN_MEMORY_ONLY',
+    readCms: async () => {
+      state.sourceReads++;
+      if (state.sourceFailure) throw Error('token=NEVER_DISCLOSE');
+      return structuredClone(cms);
+    },
+    readDaily: async () => {
+      state.sourceReads++;
+      return structuredClone(daily);
+    },
+    readLineage: async (_a, manifestRef, lineagePin) => ({
+      ref: lineagePin,
+      manifestRef,
+      completeness: 'COMPLETE',
+      decisions: structuredClone(decisions),
+    }),
+    readCurrentHead: async (_a, kind) => (kind === 'CMS' ? cms.manifestRef : daily.manifestRef),
+  };
+  const base = {
+    manifestRef: ref('technical-head'),
+    lineagePin: ref('lineage'),
+    sourceRevision: ref('technical-source'),
+    sourceConfirmationRuleRef: ref('confirmation-rule'),
+    policyApprovalRuleRef: ref('policy-rule'),
+    scope,
+    completeness: 'COMPLETE' as const,
+  };
+  const configuration: ConfigurationPreflightRead = {
+    ...base,
+    binding: { settingCode: 'LOG_LEVEL', requestRef: ref('config-request') },
+    configured: false,
+    check: {
+      sensitivity: 'ORDINARY',
+      sensitiveApproval: null,
+      policy: {
+        ref: ref('technical-policy'),
+        state: 'APPROVED',
+        approvalRef: ref('technical-approval'),
+        scope,
+        allowedSettingCodes: ['LOG_LEVEL'],
+      },
+    },
+  };
+  const audit: TechnicalAuditRead = {
+    ...base,
+    sourceWave: 'W01',
+    fieldPolicy: {
+      ref: ref('technical-policy'),
+      state: 'APPROVED',
+      approvalRef: ref('technical-approval'),
+      scope,
+      allowedEventCodes: ['GRANT_REVOKED'],
+    },
+    records: [
+      {
+        ref: ref('audit-event'),
+        scope,
+        occurredAt: '2026-11-06T01:00:00.000Z',
+        eventCode: 'GRANT_REVOKED',
+        actorPseudonym: 'not-for-ui',
+        fieldPolicyRef: ref('technical-policy'),
+        sourceRevision: ref('technical-source'),
+      },
+    ],
+  };
+  const technicalPort: OperationsTechnicalSourcePort = {
+    mode: 'IN_MEMORY_ONLY',
+    readConfigurationPreflight: async () => structuredClone(configuration),
+    readAudit: async () => structuredClone(audit),
+    readLineage: sourcesPort.readLineage,
+    readCurrentHead: async () => base.manifestRef,
+  };
+  const sources = new OperationsSourceAdapter(authority, sourcesPort),
+    technical = new OperationsTechnicalAdapter(authority, technicalPort);
+  const plan: OperationsWorkbenchPlan = {
+    configuration: configuration.binding,
+    auditManifest: base.manifestRef,
+    export: { date, request: exportRequest, displayFilters: { source: 'ALL', state: 'ALL' } },
+  };
+  const workbench = new OperationsOfflineWorkbench(
+    authority,
+    sources,
+    technical,
+    context,
+    scope,
+    plan,
+  );
+  return {
+    workbench,
+    authority,
+    sources,
+    technical,
+    authPort,
+    context,
+    scope,
+    state,
+    sourcesPort,
+    daily,
+    cms,
+    configuration,
+    plan,
+  };
+}
+const dailySelection = (scopeId: string): OperationsWorkbenchSelection => ({
+  kind: 'DAILY',
+  scopeId,
+  date,
+});
+const exportSelection = (scopeId: string): OperationsWorkbenchSelection => ({
+  kind: 'EXPORT',
+  scopeId,
+  date,
+  filters: { source: 'ALL', state: 'ALL' },
+});
+function neverPerformed(r: Awaited<ReturnType<OperationsOfflineWorkbench['check']>>) {
+  expect(r).toMatchObject({
+    runtimeAuthorized: false,
+    mutationPerformed: false,
+    exportPerformed: false,
+    auditPersisted: false,
+    guard: { runtimeAuthorized: false, requiresServerVerification: true },
+  });
+}
+
+describe('W10 offline UI/backend workbench composition', () => {
+  it.each(roleScopes)(
+    '%s report -> export preflight reuses existing guarded adapters without executing',
+    async (role) => {
+      const e = await environment(role);
+      const viewed = await e.workbench.check(dailySelection(e.scope.id));
+      expect(viewed.guard.decision).toBe('CONDITIONS_MET_OFFLINE');
+      neverPerformed(viewed);
+      const exported = await e.workbench.check(exportSelection(e.scope.id));
+      expect(exported.guard.decision).toBe('CONDITIONS_MET_OFFLINE');
+      neverPerformed(exported);
+    },
+  );
+  it.each(['REVOKED', 'UNKNOWN'] as const)('does not read source under %s grant', async (grant) => {
+    const e = await environment();
+    e.state.grant = grant;
+    const r = await e.workbench.check(dailySelection(e.scope.id));
+    expect(r.guard.decision).not.toBe('CONDITIONS_MET_OFFLINE');
+    expect(e.state.sourceReads).toBe(0);
+    neverPerformed(r);
+  });
+  it('rejects invalid grants before source disclosure', async () => {
+    const e = await environment();
+    e.state.validity = 'INVALID';
+    expect((await e.workbench.check(dailySelection(e.scope.id))).guard.decision).toBe('DENIED');
+    expect(e.state.sourceReads).toBe(0);
+  });
+  it('denies cross-resource selection without source reads', async () => {
+    const e = await environment();
+    expect((await e.workbench.check(dailySelection('foreign'))).guard.reason).toBe(
+      'WORKBENCH_SCOPE_DENIED',
+    );
+    expect(e.state.sourceReads).toBe(0);
+  });
+  it('cannot use a forged or differently issued authority context', async () => {
+    const e = await environment();
+    const w = new OperationsOfflineWorkbench(
+      e.authority,
+      e.sources,
+      e.technical,
+      {} as OperationsAuthorityContext,
+      e.scope,
+    );
+    expect((await w.check(dailySelection(e.scope.id))).guard.reason).toBe('UNBOUND_CONTEXT');
+    expect(e.state.sourceReads).toBe(0);
+  });
+  it('requires a previous guarded view and exact date/filter plan', async () => {
+    const e = await environment();
+    expect((await e.workbench.check(exportSelection(e.scope.id))).guard.reason).toBe(
+      'VIEW_PREFLIGHT_REQUIRED',
+    );
+    await e.workbench.check(dailySelection(e.scope.id));
+    expect(
+      (
+        await e.workbench.check({
+          kind: 'EXPORT',
+          scopeId: e.scope.id,
+          date: '2026-11-07',
+          filters: { source: 'ALL', state: 'ALL' },
+        })
+      ).guard.reason,
+    ).toBe('EXPORT_SCHEMA_BINDING_UNAVAILABLE');
+    expect(
+      (
+        await e.workbench.check({
+          kind: 'EXPORT',
+          scopeId: e.scope.id,
+          date,
+          filters: { source: 'W09', state: 'ALL' },
+        })
+      ).guard.reason,
+    ).toBe('EXPORT_DISPLAY_FILTER_BINDING_UNAVAILABLE');
+  });
+  it('revocation between view/export denies and invalidates the cached ticket', async () => {
+    const e = await environment();
+    await e.workbench.check(dailySelection(e.scope.id));
+    e.state.grant = 'REVOKED';
+    expect((await e.workbench.check(exportSelection(e.scope.id))).guard.decision).toBe('DENIED');
+    e.state.grant = 'ACTIVE';
+    expect((await e.workbench.check(exportSelection(e.scope.id))).guard.reason).toBe(
+      'VIEW_PREFLIGHT_REQUIRED',
+    );
+  });
+  it('source change after view is blocked by the existing export head check', async () => {
+    const e = await environment();
+    await e.workbench.check(dailySelection(e.scope.id));
+    jest.spyOn(e.sourcesPort, 'readCurrentHead').mockResolvedValue(ref('new-head'));
+    expect((await e.workbench.check(exportSelection(e.scope.id))).guard.decision).not.toBe(
+      'CONDITIONS_MET_OFFLINE',
+    );
+  });
+  it('missing source never creates an export ticket', async () => {
+    const e = await environment();
+    jest.spyOn(e.sourcesPort, 'readDaily').mockResolvedValue(null);
+    expect((await e.workbench.check(dailySelection(e.scope.id))).guard.decision).toBe('BLOCKED');
+    expect((await e.workbench.check(exportSelection(e.scope.id))).guard.reason).toBe(
+      'VIEW_PREFLIGHT_REQUIRED',
+    );
+  });
+  it('concurrent older view cannot replace the newer selection ticket', async () => {
+    const e = await environment();
+    let resolve!: (v: DailySourceRead) => void;
+    let entered!: () => void;
+    const sourceEntered = new Promise<void>((r) => {
+      entered = r;
+    });
+    jest.spyOn(e.sourcesPort, 'readDaily').mockImplementationOnce(
+      () =>
+        new Promise((r) => {
+          resolve = r;
+          entered();
+        }),
+    );
+    const first = e.workbench.check(dailySelection(e.scope.id));
+    // Explicit in-memory barrier, no polling/fake clock or increased timeout.
+    await sourceEntered;
+    const second = await e.workbench.check(dailySelection(e.scope.id));
+    expect(second.guard.decision).toBe('CONDITIONS_MET_OFFLINE');
+    resolve(structuredClone(e.daily));
+    expect((await first).guard.reason).toBe('VIEW_PREFLIGHT_SUPERSEDED');
+    expect((await e.workbench.check(exportSelection(e.scope.id))).guard.decision).toBe(
+      'CONDITIONS_MET_OFFLINE',
+    );
+  });
+  it.each(['EDIT_DRAFT', 'SUBMIT_REVIEW'] as const)(
+    'TV %s is a condition check, never a saved revision',
+    async (action) => {
+      const e = await environment('COUNSELOR', 'CMS');
+      const r = await e.workbench.check({
+        kind: 'CMS',
+        scopeId: e.scope.id,
+        request: { action, expectedRevision: ref('cms-revision') },
+      });
+      expect(r.guard.decision).toBe('CONDITIONS_MET_OFFLINE');
+      neverPerformed(r);
+    },
+  );
+  it('HVU review pins a detached revision before asynchronous reads; self-approval denied', async () => {
+    const e = await environment('ACADEMIC_MANAGER', 'CMS');
+    const q = {
+      kind: 'CMS' as const,
+      scopeId: e.scope.id,
+      request: {
+        action: 'PUBLISH' as const,
+        expectedRevision: { id: 'cms-revision', revision: 'synthetic-1' },
+      },
+    };
+    const pending = e.workbench.check(q);
+    q.request.expectedRevision.revision = 'changed';
+    const r = await pending;
+    expect(r.guard.decision).toBe('CONDITIONS_MET_OFFLINE');
+    neverPerformed(r);
+    const self = {
+      ...e.cms,
+      data: {
+        ...e.cms.data,
+        revision: { ...e.cms.data.revision, authorPersonIds: ['synthetic-person'] },
+      },
+    };
+    jest.spyOn(e.sourcesPort, 'readCms').mockResolvedValue(self);
+    expect(
+      (
+        await e.workbench.check({
+          kind: 'CMS',
+          scopeId: e.scope.id,
+          request: { action: 'PUBLISH', expectedRevision: ref('cms-revision') },
+        })
+      ).guard.reason,
+    ).toBe('AUTHOR_CANNOT_APPROVE');
+  });
+  it('stale CMS revision cannot follow the latest revision implicitly', async () => {
+    const e = await environment('ACADEMIC_MANAGER', 'CMS');
+    expect(
+      (
+        await e.workbench.check({
+          kind: 'CMS',
+          scopeId: e.scope.id,
+          request: { action: 'PUBLISH', expectedRevision: ref('cms-revision', 'old') },
+        })
+      ).guard.reason,
+    ).toBe('REVISION_STALE');
+  });
+  it('QT configuration and audit route to the existing technical adapters only', async () => {
+    const e = await environment('SYSTEM_ADMIN');
+    for (const q of [
+      { kind: 'CONFIGURATION', scopeId: e.scope.id, settingCode: 'LOG_LEVEL' },
+      { kind: 'AUDIT', scopeId: e.scope.id },
+    ] as const) {
+      const r = await e.workbench.check(q);
+      expect(r.guard.decision).toBe('CONDITIONS_MET_OFFLINE');
+      neverPerformed(r);
+      expect(JSON.stringify(r)).not.toContain('not-for-ui');
+    }
+  });
+  it('unknown configuration or missing bound server plans fail closed', async () => {
+    const e = await environment('SYSTEM_ADMIN');
+    expect(
+      (
+        await e.workbench.check({
+          kind: 'CONFIGURATION',
+          scopeId: e.scope.id,
+          settingCode: 'FOREIGN_SETTING',
+        })
+      ).guard.reason,
+    ).toBe('CONFIG_REQUEST_BINDING_MISMATCH');
+    const w = new OperationsOfflineWorkbench(
+      e.authority,
+      e.sources,
+      e.technical,
+      e.context,
+      e.scope,
+    );
+    expect(
+      (await w.check({ kind: 'CONFIGURATION', scopeId: e.scope.id, settingCode: 'LOG_LEVEL' }))
+        .guard.reason,
+    ).toBe('CONFIG_REQUEST_BINDING_UNAVAILABLE');
+    expect((await w.check({ kind: 'AUDIT', scopeId: e.scope.id })).guard.reason).toBe(
+      'AUDIT_REVISION_BINDING_UNAVAILABLE',
+    );
+  });
+  it('does not resolve sensitive approval policy from an in-memory plan', async () => {
+    const e = await environment('SYSTEM_ADMIN');
+    const port: OperationsTechnicalSourcePort = {
+      mode: 'IN_MEMORY_ONLY',
+      readConfigurationPreflight: async () => ({
+        ...e.configuration,
+        check: { ...e.configuration.check, sensitivity: 'SENSITIVE' },
+      }),
+      readAudit: async () => null,
+      readLineage: async () => null,
+      readCurrentHead: async () => null,
+    };
+    const w = new OperationsOfflineWorkbench(
+      e.authority,
+      e.sources,
+      new OperationsTechnicalAdapter(e.authority, port),
+      e.context,
+      e.scope,
+      e.plan,
+    );
+    expect(
+      (await w.check({ kind: 'CONFIGURATION', scopeId: e.scope.id, settingCode: 'LOG_LEVEL' }))
+        .guard.reason,
+    ).toBe('SENSITIVE_APPROVER_POLICY_OPEN');
+  });
+  it('sanitizes provider errors and has no performed-success branch', async () => {
+    const e = await environment('ACADEMIC_MANAGER', 'CMS');
+    e.state.sourceFailure = true;
+    const r = await e.workbench.check({
+      kind: 'CMS',
+      scopeId: e.scope.id,
+      request: { action: 'PUBLISH', expectedRevision: ref('cms-revision') },
+    });
+    expect(r.guard.decision).toBe('BLOCKED');
+    expect(JSON.stringify(r)).not.toContain('NEVER_DISCLOSE');
+    neverPerformed(r);
+  });
+});
```

### apps/web/src/features/operations/contracts.ts

```diff
===================================================================
--- batch-baseline/apps/web/src/features/operations/contracts.ts	
+++ apps/web/src/features/operations/contracts.ts	
@@ -9,6 +9,10 @@
 } from '../../../../api/src/modules/operations/operations.contracts';
 
 export type { BusinessRole, CmsState, EvidenceState };
+export type {
+  OperationsWorkbenchPort,
+  OperationsWorkbenchSelection,
+} from '../../../../api/src/modules/operations/operations-workbench.contracts';
 export type OperationsSection = 'cms' | 'settings' | 'audit' | 'reports';
 export interface OperationsReadRequest {
   readonly viewerId: string;
```

### apps/web/src/features/operations/model.ts

```diff
===================================================================
--- batch-baseline/apps/web/src/features/operations/model.ts	
+++ apps/web/src/features/operations/model.ts	
@@ -8,6 +8,7 @@
   OperationsViewModel,
   CmsState,
   CmsReadItem,
+  OperationsWorkbenchPort,
 } from './contracts';
 
 export const operationsRoles: BusinessRole[] = [
@@ -50,6 +51,23 @@
 export const unavailableReader: OperationsReader = {
   read: () => Promise.resolve({ status: 'UNAVAILABLE' }),
 };
+export const unavailableWorkbench: OperationsWorkbenchPort = {
+  mode: 'UNIMPLEMENTED',
+  check: () =>
+    Promise.resolve({
+      guard: {
+        decision: 'BLOCKED',
+        reason: 'WORKBENCH_INTEGRATION_UNAVAILABLE',
+        assurance: 'OFFLINE_CONSISTENCY_ONLY',
+        runtimeAuthorized: false,
+        requiresServerVerification: true,
+      },
+      runtimeAuthorized: false,
+      mutationPerformed: false,
+      exportPerformed: false,
+      auditPersisted: false,
+    }),
+};
 export function centerToday(now = new Date()): string {
   const p = new Intl.DateTimeFormat('en-CA', {
     timeZone: 'Asia/Ho_Chi_Minh',
@@ -192,7 +210,7 @@
       state: r.state,
       revision: { id: r.revision.id, revision: r.revision.revision },
       history: r.history.map((h: CmsReadItem['history'][number]) => ({
-        revision: { ...h.revision },
+        revision: { id: h.revision.id, revision: h.revision.revision },
         state: h.state,
       })),
     })),
```

### apps/web/src/features/operations/OperationsPage.tsx

```diff
===================================================================
--- batch-baseline/apps/web/src/features/operations/OperationsPage.tsx	
+++ apps/web/src/features/operations/OperationsPage.tsx	
@@ -1,4 +1,4 @@
-import { useEffect, useMemo, useState, type ReactNode } from 'react';
+import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
 import { Link, Navigate, NavLink, useParams, useSearchParams } from 'react-router';
 import {
   ArrowLeft,
@@ -22,7 +22,10 @@
   OperationsReadRequest,
   OperationsSection,
   OperationsViewModel,
+  OperationsWorkbenchPort,
 } from './contracts';
+import { OperationsPreflight } from './OperationsPreflight';
+import type { CmsAction } from '../../../../api/src/modules/operations/operations.contracts';
 import {
   centerToday,
   cmsStates,
@@ -32,6 +35,7 @@
   sectionsFor,
   sectionLabels,
   unavailableReader,
+  unavailableWorkbench,
   viewModel,
 } from './model';
 
@@ -81,7 +85,8 @@
   );
 }
 type LoadState =
-  { key: string; status: 'READY'; model: OperationsViewModel } | { key: string; status: 'ERROR' };
+  | { key: string; reader: OperationsReader; status: 'READY'; model: OperationsViewModel }
+  | { key: string; reader: OperationsReader; status: 'ERROR' };
 function useOperationsRead(
   reader: OperationsReader,
   request: OperationsReadRequest,
@@ -98,10 +103,10 @@
       .then(() => reader.read(request))
       .then((raw) => {
         const model = viewModel(raw, request);
-        if (current) setState({ key, status: 'READY', model });
+        if (current) setState({ key, reader, status: 'READY', model });
       })
       .catch(() => {
-        if (current) setState({ key, status: 'ERROR' });
+        if (current) setState({ key, reader, status: 'ERROR' });
       });
     return () => {
       current = false;
@@ -109,13 +114,19 @@
   }, [reader, request, key, validDay]);
   return !validDay
     ? { status: 'INVALID_DATE' as const }
-    : state?.key === key
+    : state?.key === key && state.reader === reader
       ? state
       : { status: 'LOADING' as const };
 }
 
 /** Role gates only shape navigation. No authenticated runtime permission is inferred here. */
-export function OperationsPage({ reader = unavailableReader }: { reader?: OperationsReader }) {
+export function OperationsPage({
+  reader = unavailableReader,
+  preflightPort = unavailableWorkbench,
+}: {
+  reader?: OperationsReader;
+  preflightPort?: OperationsWorkbenchPort;
+}) {
   const { user, isLoading } = useAuth();
   const { section } = useParams();
   if (isLoading)
@@ -136,6 +147,7 @@
       role={user.role as BusinessRole}
       section={section as OperationsSection}
       reader={reader}
+      preflightPort={preflightPort}
     />
   );
 }
@@ -145,11 +157,13 @@
   role,
   section,
   reader,
+  preflightPort,
 }: {
   viewerId: string;
   role: BusinessRole;
   section: OperationsSection;
   reader: OperationsReader;
+  preflightPort: OperationsWorkbenchPort;
 }) {
   const [params, setParams] = useSearchParams();
   const date = params.get('date') ?? centerToday();
@@ -168,6 +182,10 @@
       return next;
     });
   const day = displayDay(date);
+  const heading = useRef<HTMLHeadingElement>(null);
+  useEffect(() => {
+    heading.current?.focus({ preventScroll: true });
+  }, [section]);
   return (
     <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
       <Link
@@ -180,7 +198,11 @@
       <header className="mb-8 flex flex-col gap-5 border-b border-slate-200 pb-8 sm:flex-row sm:items-start sm:justify-between">
         <div className="max-w-2xl space-y-3">
           <p className="eyebrow">SMART ENGLISH · VẬN HÀNH</p>
-          <h1 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
+          <h1
+            ref={heading}
+            tabIndex={-1}
+            className="text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl"
+          >
             {sectionLabels[section]}
           </h1>
           <p className="leading-relaxed text-slate-600">
@@ -320,10 +342,16 @@
             loaded.status !== 'INVALID_DATE' &&
             model?.status !== 'DENIED' && (
               <>
-                {section === 'cms' && <CmsPanel key={scopeId} model={model} role={role} />}
-                {section === 'settings' && <SettingsPanel model={model} />}
-                {section === 'audit' && <AuditPanel model={model} />}
-                {section === 'reports' && <ReportsPanel model={model} />}
+                {section === 'cms' && (
+                  <CmsPanel key={scopeId} model={model} role={role} port={preflightPort} />
+                )}
+                {section === 'settings' && <SettingsPanel model={model} port={preflightPort} />}
+                {section === 'audit' && (
+                  <AuditPanel model={model} port={preflightPort} scopeId={scopeId} />
+                )}
+                {section === 'reports' && (
+                  <ReportsPanel model={model} port={preflightPort} scopeId={scopeId} date={date} />
+                )}
               </>
             )}
         </div>
@@ -332,15 +360,30 @@
   );
 }
 
-function CmsPanel({ model, role }: { model: OperationsViewModel | null; role: BusinessRole }) {
+function CmsPanel({
+  model,
+  role,
+  port,
+}: {
+  model: OperationsViewModel | null;
+  role: BusinessRole;
+  port: OperationsWorkbenchPort;
+}) {
   const [filter, setFilter] = useState('ALL');
   const [selected, setSelected] = useState('');
   const [title, setTitle] = useState('');
   const [body, setBody] = useState('');
   const [preview, setPreview] = useState(false);
   const [reason, setReason] = useState('');
+  const [action, setAction] = useState<CmsAction>(role === 'COUNSELOR' ? 'EDIT_DRAFT' : 'PUBLISH');
   const items = (model?.cms ?? []).filter((item) => filter === 'ALL' || item.state === filter);
-  const current = items.find((item) => item.id === selected);
+  const revisionKey = (item: NonNullable<typeof model>['cms'][number]) =>
+    JSON.stringify([item.id, item.revision.id, item.revision.revision]);
+  const current = items.find((item) => revisionKey(item) === selected);
+  const detail = useRef<HTMLElement>(null);
+  useEffect(() => {
+    if (current) detail.current?.focus({ preventScroll: true });
+  }, [selected, current]);
   return (
     <div className="space-y-6">
       {role === 'COUNSELOR' && (
@@ -438,10 +481,12 @@
                 <button
                   type="button"
                   onClick={() => {
-                    setSelected(item.id);
+                    setSelected(revisionKey(item));
                     setReason('');
                   }}
-                  aria-pressed={selected === item.id}
+                  aria-pressed={selected === revisionKey(item)}
+                  aria-expanded={selected === revisionKey(item)}
+                  aria-controls="w10-cms-version-detail"
                   className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-4 text-left hover:bg-slate-50"
                 >
                   <span className="min-w-0">
@@ -461,6 +506,9 @@
         )}
         {current && (
           <section
+            id="w10-cms-version-detail"
+            ref={detail}
+            tabIndex={-1}
             aria-label="Chi tiết phiên bản"
             className="space-y-4 border-t border-slate-200 pt-5"
           >
@@ -480,6 +528,41 @@
                 </li>
               ))}
             </ol>
+            <label className="block space-y-2 text-sm font-semibold">
+              Điều kiện thao tác trên revision
+              <select
+                className="input-field block w-full"
+                value={action}
+                onChange={(e) => setAction(e.target.value as CmsAction)}
+              >
+                {(role === 'COUNSELOR'
+                  ? ['EDIT_DRAFT', 'SUBMIT_REVIEW']
+                  : ['PUBLISH', 'REJECT', 'WITHDRAW']
+                ).map((a) => (
+                  <option key={a} value={a}>
+                    {
+                      (
+                        {
+                          EDIT_DRAFT: 'Sửa bản nháp',
+                          SUBMIT_REVIEW: 'Gửi duyệt',
+                          PUBLISH: 'Công bố',
+                          REJECT: 'Từ chối',
+                          WITHDRAW: 'Thu hồi',
+                        } as Record<string, string>
+                      )[a]
+                    }
+                  </option>
+                ))}
+              </select>
+            </label>
+            <OperationsPreflight
+              port={port}
+              selection={{
+                kind: 'CMS',
+                scopeId: current.scopeId,
+                request: { action, expectedRevision: current.revision },
+              }}
+            />
             {role === 'ACADEMIC_MANAGER' ? (
               <>
                 <label className="block space-y-2 text-sm font-semibold">
@@ -511,7 +594,15 @@
   );
 }
 
-function SettingsPanel({ model }: { model: OperationsViewModel | null }) {
+function SettingsPanel({
+  model,
+  port,
+}: {
+  model: OperationsViewModel | null;
+  port: OperationsWorkbenchPort;
+}) {
+  const [code, setCode] = useState('');
+  const selected = model?.settings.find((s) => s.code === code) ?? model?.settings[0];
   return (
     <article className="card space-y-5">
       <div>
@@ -543,11 +634,45 @@
         không gửi thay đổi hoặc kiểm tra provider thật.
       </div>
       <BlockedButton>Đề nghị thay đổi cấu hình</BlockedButton>
+      <label className="block space-y-2 text-sm font-semibold">
+        Cấu hình cần đối chiếu
+        <select
+          className="input-field block w-full"
+          value={selected?.code ?? ''}
+          disabled={!model?.settings.length}
+          onChange={(e) => setCode(e.target.value)}
+        >
+          <option value="" disabled>
+            Chưa có cấu hình thuộc phạm vi
+          </option>
+          {model?.settings.map((s) => (
+            <option key={s.code} value={s.code}>
+              Đối chiếu · {s.code}
+            </option>
+          ))}
+        </select>
+      </label>
+      <OperationsPreflight
+        port={port}
+        selection={
+          selected
+            ? { kind: 'CONFIGURATION', scopeId: selected.scopeId, settingCode: selected.code }
+            : null
+        }
+      />
     </article>
   );
 }
 
-function AuditPanel({ model }: { model: OperationsViewModel | null }) {
+function AuditPanel({
+  model,
+  port,
+  scopeId,
+}: {
+  model: OperationsViewModel | null;
+  port: OperationsWorkbenchPort;
+  scopeId: string;
+}) {
   const [event, setEvent] = useState('ALL');
   const rows = (model?.audit ?? []).filter((r) => event === 'ALL' || r.eventCode === event);
   return (
@@ -595,6 +720,10 @@
         <p className="text-sm text-slate-600">
           Không hiển thị payload gốc, danh tính cá nhân hoặc credential.
         </p>
+        <OperationsPreflight
+          port={port}
+          selection={model?.status === 'OFFLINE_TEST_ONLY' ? { kind: 'AUDIT', scopeId } : null}
+        />
         {!rows.length ? (
           <Empty>Chưa có sự kiện phù hợp được phép hiển thị.</Empty>
         ) : (
@@ -614,7 +743,17 @@
   );
 }
 
-function ReportsPanel({ model }: { model: OperationsViewModel | null }) {
+function ReportsPanel({
+  model,
+  port,
+  scopeId,
+  date,
+}: {
+  model: OperationsViewModel | null;
+  port: OperationsWorkbenchPort;
+  scopeId: string;
+  date: string;
+}) {
   const [source, setSource] = useState('ALL');
   const [state, setState] = useState('ALL');
   const metrics = (model?.metrics ?? []).filter(
@@ -678,7 +817,12 @@
       {!metrics.length ? (
         <Empty>Chưa có chỉ số phù hợp được xác minh. Đây không phải kết quả bằng 0.</Empty>
       ) : (
-        <div className="overflow-x-auto rounded-xl border border-slate-200">
+        <div
+          role="region"
+          aria-label="Bảng báo cáo có thể cuộn ngang"
+          tabIndex={0}
+          className="overflow-x-auto rounded-xl border border-slate-200"
+        >
           <table className="w-full min-w-[30rem] text-left text-sm">
             <caption className="sr-only">
               Chỉ số theo nguồn và trạng thái bằng chứng; không có giá trị được xác nhận từ dữ liệu
@@ -717,6 +861,24 @@
         minh runtime không tạo số liệu confirmed. Xuất CSV cần kiểm tra lại quyền, phạm vi, revision
         và chống formula injection tại server; hiện chưa có file được tạo hoặc tải xuống.
       </div>
+      <div className="grid gap-4 xl:grid-cols-2">
+        <OperationsPreflight
+          port={port}
+          label="Kiểm tra quyền xem (offline)"
+          selection={
+            model?.status === 'OFFLINE_TEST_ONLY' ? { kind: 'DAILY', scopeId, date } : null
+          }
+        />
+        <OperationsPreflight
+          port={port}
+          label="Kiểm tra CSV (offline)"
+          selection={
+            model?.status === 'OFFLINE_TEST_ONLY'
+              ? { kind: 'EXPORT', scopeId, date, filters: { source, state } }
+              : null
+          }
+        />
+      </div>
     </article>
   );
 }
```

### apps/web/src/features/operations/OperationsPreflight.tsx

```diff
===================================================================
--- /dev/null	
+++ apps/web/src/features/operations/OperationsPreflight.tsx	
@@ -1,0 +1,127 @@
\ No newline at end of file
+import { useEffect, useId, useRef, useState } from 'react';
+import { LockKeyhole, ShieldCheck } from 'lucide-react';
+import type { OperationsWorkbenchPort, OperationsWorkbenchSelection } from './contracts';
+import type { OperationsWorkbenchResult } from '../../../../api/src/modules/operations/operations-workbench.contracts';
+
+import { unavailableWorkbench } from './model';
+function safeOutcome(r: OperationsWorkbenchResult): { state: string; reason: string } {
+  if (
+    !r ||
+    r.runtimeAuthorized !== false ||
+    r.mutationPerformed !== false ||
+    r.exportPerformed !== false ||
+    r.auditPersisted !== false ||
+    r.guard?.runtimeAuthorized !== false ||
+    r.guard.assurance !== 'OFFLINE_CONSISTENCY_ONLY' ||
+    r.guard.requiresServerVerification !== true ||
+    !['CONDITIONS_MET_OFFLINE', 'DENIED', 'BLOCKED'].includes(r.guard.decision) ||
+    !/^[A-Z][A-Z0-9_]{0,95}$/.test(r.guard.reason)
+  )
+    return { state: 'BLOCKED', reason: 'UNVERIFIED_PREFLIGHT_RESULT' };
+  return { state: r.guard.decision, reason: r.guard.reason };
+}
+type State = {
+  key: string;
+  port: OperationsWorkbenchPort;
+  pending: boolean;
+  outcome: ReturnType<typeof safeOutcome> | null;
+};
+
+/** Checking conditions is never saving/publishing/exporting. In-memory DI is for
+ * offline verification only; it cannot establish runtime grants or connectivity.
+ */
+export function OperationsPreflight({
+  port = unavailableWorkbench,
+  selection,
+  label = 'Kiểm tra điều kiện offline',
+}: {
+  port?: OperationsWorkbenchPort;
+  selection: OperationsWorkbenchSelection | null;
+  label?: string;
+}) {
+  const description = useId();
+  const key = JSON.stringify(selection);
+  const [state, setState] = useState<State | null>(null);
+  const sequence = useRef(0);
+  const inFlight = useRef(false);
+  useEffect(
+    () => () => {
+      sequence.current++;
+      inFlight.current = false;
+    },
+    [key, port],
+  );
+  const current = state?.key === key && state.port === port ? state : null;
+  const pending = current?.pending === true;
+  const unavailable = port.mode !== 'IN_MEMORY_ONLY' || !selection;
+  async function check() {
+    if (unavailable || inFlight.current || !selection) return;
+    const generation = ++sequence.current;
+    inFlight.current = true;
+    setState({ key, port, pending: true, outcome: null });
+    try {
+      const outcome = safeOutcome(await port.check(selection));
+      if (generation === sequence.current) setState({ key, port, pending: false, outcome });
+    } catch {
+      if (generation === sequence.current)
+        setState({
+          key,
+          port,
+          pending: false,
+          outcome: { state: 'BLOCKED', reason: 'PREFLIGHT_UNAVAILABLE' },
+        });
+    } finally {
+      if (generation === sequence.current) inFlight.current = false;
+    }
+  }
+  return (
+    <section
+      aria-label={label}
+      className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4"
+    >
+      <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
+        <ShieldCheck size={17} aria-hidden="true" />
+        {label}
+      </div>
+      <p id={description} className="text-xs leading-relaxed text-slate-600">
+        Chỉ đối chiếu contract, quyền và revision bằng bộ kiểm tra offline. Không lưu, duyệt, công
+        bố, đổi cấu hình hoặc xuất file. Quyền server vẫn chưa xác minh.
+      </p>
+      {unavailable && (
+        <p className="text-xs text-slate-600">
+          UNAVAILABLE · Chưa có binding kiểm tra phù hợp với lựa chọn hiện tại.
+        </p>
+      )}
+      <button
+        type="button"
+        onClick={() => void check()}
+        disabled={unavailable || pending}
+        aria-busy={pending}
+        aria-describedby={description}
+        className="btn-secondary inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
+      >
+        <LockKeyhole size={15} aria-hidden="true" />
+        {pending ? 'Đang kiểm tra điều kiện…' : label}
+      </button>
+      <div
+        role="status"
+        aria-live="polite"
+        aria-atomic="true"
+        className="space-y-1 text-sm [overflow-wrap:anywhere]"
+      >
+        {current?.outcome && (
+          <>
+            <p className="font-semibold">
+              {current.outcome.state === 'CONDITIONS_MET_OFFLINE'
+                ? 'Điều kiện nhất quán offline — chưa được phép thực thi'
+                : current.outcome.state === 'DENIED'
+                  ? 'Bị từ chối — kiểm tra quyền và phạm vi hiện hành'
+                  : 'Bị chặn — chưa đủ bằng chứng hoặc binding'}
+            </p>
+            <p className="font-mono text-xs text-slate-600">{current.outcome.reason}</p>
+          </>
+        )}
+      </div>
+    </section>
+  );
+}
```

### apps/web/src/features/operations/integration.test.tsx

```diff
===================================================================
--- /dev/null	
+++ apps/web/src/features/operations/integration.test.tsx	
@@ -1,0 +1,470 @@
\ No newline at end of file
+import '@testing-library/jest-dom/vitest';
+import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
+import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
+import { MemoryRouter, Route, Routes } from 'react-router';
+import { AuthContext, type AuthContextValue } from '@/features/auth/auth-context';
+import type { AuthUser } from '@/features/auth/api';
+import { OperationsPage } from './OperationsPage';
+import { OperationsPreflight } from './OperationsPreflight';
+import { viewModel } from './model';
+import type {
+  BusinessRole,
+  OperationsReader,
+  OperationsReadRequest,
+  OperationsOfflineSnapshot,
+} from './contracts';
+import { OperationsAuthorityAdapter } from '../../../../api/src/modules/operations/operations-authority-adapter';
+import { OperationsSourceAdapter } from '../../../../api/src/modules/operations/operations-source-adapters';
+import { OperationsTechnicalAdapter } from '../../../../api/src/modules/operations/operations-technical-adapter';
+import { OperationsOfflineWorkbench } from '../../../../api/src/modules/operations/operations-workbench';
+import type { OperationsAuthorityPort } from '../../../../api/src/modules/operations/operations-authority.contracts';
+import type {
+  CmsSourceRead,
+  OperationsSourcePort,
+} from '../../../../api/src/modules/operations/operations-source.contracts';
+import type {
+  OperationsWorkbenchPort,
+  OperationsWorkbenchResult,
+  OperationsWorkbenchSelection,
+} from '../../../../api/src/modules/operations/operations-workbench.contracts';
+import type {
+  GrantRead,
+  ResourceScope,
+} from '../../../../api/src/modules/operations/operations.contracts';
+
+const ref = (id: string) => ({ id, revision: 'synthetic-1' });
+const date = '2026-11-06';
+const scope = { kind: 'CMS' as const, id: 'synthetic-scope' };
+function auth(role: BusinessRole): AuthContextValue {
+  return {
+    user: {
+      id: 'synthetic-user',
+      fullName: 'Synthetic actor',
+      email: 'offline@example.invalid',
+      role,
+      status: 'ACTIVE',
+    } as AuthUser,
+    isLoading: false,
+    error: null,
+    login: vi.fn(),
+    register: vi.fn(),
+    logout: vi.fn(),
+    refreshUser: vi.fn(),
+  };
+}
+const raw = (q: OperationsReadRequest): OperationsOfflineSnapshot => ({
+  status: 'OFFLINE_TEST_ONLY',
+  binding: q,
+  scopes: [
+    {
+      kind: q.section === 'cms' ? 'CMS' : q.role === 'STUDENT' ? 'LEARNER' : 'TECHNICAL',
+      id: q.scopeId,
+      label: 'Phạm vi synthetic',
+    },
+  ],
+  cms: [],
+  settings: [],
+  audit: [],
+  metrics: [],
+});
+const cmsReader: OperationsReader = {
+  read: async (q) => ({
+    ...raw(q),
+    cms: [
+      {
+        id: 'content',
+        scopeId: q.scopeId,
+        title: 'Revision synthetic',
+        body: 'Nội dung nội bộ kiểm thử',
+        state: 'IN_REVIEW',
+        revision: ref('cms-revision'),
+        history: [{ revision: ref('cms-revision'), state: 'IN_REVIEW' }],
+      },
+    ],
+  }),
+};
+function element(
+  role: BusinessRole,
+  section: string,
+  reader: OperationsReader,
+  port?: OperationsWorkbenchPort,
+) {
+  return (
+    <AuthContext.Provider value={auth(role)}>
+      <MemoryRouter
+        initialEntries={[
+          `/workspace/operations/${section}?date=${date}&scope=${role === 'STUDENT' ? 'synthetic-user' : scope.id}`,
+        ]}
+      >
+        <Routes>
+          <Route
+            path="/workspace/operations/:section"
+            element={<OperationsPage reader={reader} preflightPort={port} />}
+          />
+        </Routes>
+      </MemoryRouter>
+    </AuthContext.Provider>
+  );
+}
+async function serverBoundary(
+  role: BusinessRole = 'ACADEMIC_MANAGER',
+  target: ResourceScope = scope,
+) {
+  const state = { grant: 'ACTIVE' as GrantRead['state'], selfAuthor: false };
+  const authPort: OperationsAuthorityPort = {
+    mode: 'IN_MEMORY_ONLY',
+    readPrincipal: async () => ({
+      ref: ref('principal'),
+      accountState: 'ACTIVE',
+      authorityEpoch: 'epoch',
+      principal: {
+        principalId: 'synthetic-user',
+        personId: 'synthetic-person',
+        role,
+        sessionRef: ref('session'),
+        sessionState: 'AUTHENTICATED',
+      },
+    }),
+    readGrant: async (principalId, permission, resource) => ({
+      ref: ref('grant-' + permission),
+      principalId,
+      permission,
+      scope: resource,
+      state: state.grant,
+      validity: 'VALID',
+      authorityEpoch: 'epoch',
+      decisionRef: ref('grant-decision'),
+      authorityRef: ref('independent-grant-authority'),
+    }),
+  };
+  const authority = new OperationsAuthorityAdapter(authPort),
+    context = (await authority.open()).context!;
+  const cms: CmsSourceRead = {
+    scope: target,
+    manifestRef: ref('cms-head'),
+    lineagePin: ref('lineage'),
+    completeness: 'COMPLETE',
+    data: {
+      revision: {
+        ref: ref('cms-revision'),
+        contentId: target.id,
+        state: 'IN_REVIEW',
+        parentRef: null,
+        authorPersonIds: ['another-author'],
+        authorshipComplete: true,
+        assetClearance: 'APPROVED',
+        licensingDecisionRef: ref('license'),
+      },
+      parent: null,
+      policy: {
+        ref: ref('cms-policy'),
+        state: 'APPROVED',
+        approvalRef: ref('policy-approval'),
+        scope: target,
+        actions: ['PUBLISH', 'REJECT', 'WITHDRAW'],
+      },
+      reasonRef: ref('reason'),
+    },
+  };
+  const sourcePort: OperationsSourcePort = {
+    mode: 'IN_MEMORY_ONLY',
+    readCms: vi.fn(async () => ({
+      ...cms,
+      data: {
+        ...cms.data,
+        revision: {
+          ...cms.data.revision,
+          authorPersonIds: [state.selfAuthor ? 'synthetic-person' : 'another-author'],
+        },
+      },
+    })),
+    readDaily: async () => null,
+    readLineage: async () => ({
+      ref: ref('lineage'),
+      manifestRef: ref('cms-head'),
+      completeness: 'COMPLETE',
+      decisions: [
+        {
+          ref: ref('policy-approval'),
+          subjectRef: ref('cms-policy'),
+          scope: target,
+          ruleRef: ref('policy-rule'),
+          authorityRef: ref('policy-authority'),
+          purpose: 'POLICY',
+          state: 'APPROVED',
+        },
+        {
+          ref: ref('license'),
+          subjectRef: ref('cms-revision'),
+          scope: target,
+          ruleRef: ref('license-rule'),
+          authorityRef: ref('license-authority'),
+          purpose: 'LICENSE',
+          state: 'APPROVED',
+        },
+      ],
+    }),
+    readCurrentHead: async () => ref('cms-head'),
+  };
+  const sources = new OperationsSourceAdapter(authority, sourcePort),
+    technical = new OperationsTechnicalAdapter(authority, null);
+  const workbench = new OperationsOfflineWorkbench(authority, sources, technical, context, target);
+  return { state, workbench, sourcePort };
+}
+const selection: OperationsWorkbenchSelection = { kind: 'DAILY', scopeId: 'synthetic-user', date };
+const outcome = (
+  decision: 'CONDITIONS_MET_OFFLINE' | 'DENIED' | 'BLOCKED',
+  reason = 'SYNTHETIC_CHECK',
+): OperationsWorkbenchResult => ({
+  guard: {
+    decision,
+    reason,
+    assurance: 'OFFLINE_CONSISTENCY_ONLY',
+    runtimeAuthorized: false,
+    requiresServerVerification: true,
+  },
+  runtimeAuthorized: false,
+  mutationPerformed: false,
+  exportPerformed: false,
+  auditPersisted: false,
+});
+beforeEach(() => {
+  vi.stubGlobal(
+    'fetch',
+    vi.fn(() => {
+      throw Error('HTTP forbidden in W10 offline tests');
+    }),
+  );
+});
+afterEach(() => {
+  cleanup();
+  vi.unstubAllGlobals();
+});
+
+describe('W10 S4 offline cross-layer/UI quality', () => {
+  it('default port is honestly unavailable and never executes a check', () => {
+    render(<OperationsPreflight selection={selection} />);
+    expect(screen.getByRole('button', { name: 'Kiểm tra điều kiện offline' })).toBeDisabled();
+    expect(screen.getByText(/UNAVAILABLE · Chưa có binding/)).toBeInTheDocument();
+    expect(fetch).not.toHaveBeenCalled();
+  });
+  it('CMS UI -> workbench -> existing authority/source guards only checks the pinned revision', async () => {
+    const e = await serverBoundary();
+    const spy = vi.spyOn(e.workbench, 'check');
+    render(element('ACADEMIC_MANAGER', 'cms', cmsReader, e.workbench));
+    await screen.findByText(/Dữ liệu kiểm thử —/);
+    fireEvent.click(screen.getByRole('button', { name: /Revision synthetic/ }));
+    expect(screen.getByRole('region', { name: 'Chi tiết phiên bản' })).toHaveFocus();
+    fireEvent.click(screen.getByRole('button', { name: 'Kiểm tra điều kiện offline' }));
+    expect(
+      await screen.findByText('Điều kiện nhất quán offline — chưa được phép thực thi'),
+    ).toBeInTheDocument();
+    expect(spy).toHaveBeenCalledWith({
+      kind: 'CMS',
+      scopeId: scope.id,
+      request: { action: 'PUBLISH', expectedRevision: ref('cms-revision') },
+    });
+    for (const name of ['Duyệt & công bố', 'Từ chối', 'Thu hồi'])
+      expect(screen.getByRole('button', { name })).toBeDisabled();
+    expect(fetch).not.toHaveBeenCalled();
+  });
+  it.each(['REVOKED', 'UNKNOWN'] as const)(
+    '%s grant fails closed through the actual offline adapters',
+    async (grant) => {
+      const e = await serverBoundary();
+      e.state.grant = grant;
+      render(element('ACADEMIC_MANAGER', 'cms', cmsReader, e.workbench));
+      await screen.findByText(/Dữ liệu kiểm thử —/);
+      fireEvent.click(screen.getByRole('button', { name: /Revision synthetic/ }));
+      fireEvent.click(screen.getByRole('button', { name: 'Kiểm tra điều kiện offline' }));
+      await screen.findByText(
+        grant === 'REVOKED' ? 'CURRENT_GRANT_DENIED' : 'GRANT_PROVENANCE_UNAVAILABLE',
+      );
+      expect(e.sourcePort.readCms).not.toHaveBeenCalled();
+      expect(screen.getByRole('button', { name: 'Duyệt & công bố' })).toBeDisabled();
+    },
+  );
+  it('self-author approval is rejected in UI without publishing', async () => {
+    const e = await serverBoundary();
+    e.state.selfAuthor = true;
+    render(element('ACADEMIC_MANAGER', 'cms', cmsReader, e.workbench));
+    await screen.findByText(/Dữ liệu kiểm thử —/);
+    fireEvent.click(screen.getByRole('button', { name: /Revision synthetic/ }));
+    fireEvent.click(screen.getByRole('button', { name: 'Kiểm tra điều kiện offline' }));
+    expect(await screen.findByText('AUTHOR_CANNOT_APPROVE')).toBeInTheDocument();
+    expect(screen.getByRole('button', { name: 'Duyệt & công bố' })).toBeDisabled();
+  });
+  it.each(['settings', 'audit'] as const)(
+    'QT %s shows a missing server binding rather than inventing approval',
+    async (section) => {
+      const e = await serverBoundary('SYSTEM_ADMIN', { kind: 'TECHNICAL', id: scope.id });
+      const reader: OperationsReader = {
+        read: async (q) => ({
+          ...raw(q),
+          settings:
+            section === 'settings'
+              ? [
+                  {
+                    scopeId: q.scopeId,
+                    code: 'LOG_LEVEL',
+                    sensitivity: 'ORDINARY',
+                    configured: false,
+                  },
+                ]
+              : [],
+        }),
+      };
+      render(element('SYSTEM_ADMIN', section, reader, e.workbench));
+      await screen.findByText(/Dữ liệu kiểm thử —/);
+      fireEvent.click(screen.getByRole('button', { name: 'Kiểm tra điều kiện offline' }));
+      await screen.findByText(
+        section === 'settings'
+          ? 'CONFIG_REQUEST_BINDING_UNAVAILABLE'
+          : 'AUDIT_REVISION_BINDING_UNAVAILABLE',
+      );
+      expect(fetch).not.toHaveBeenCalled();
+    },
+  );
+  it('daily source unavailable and CSV plan missing are distinct, never fake zero/export', async () => {
+    const e = await serverBoundary('STUDENT', { kind: 'LEARNER', id: 'synthetic-user' });
+    const reader: OperationsReader = { read: async (q) => raw(q) };
+    render(element('STUDENT', 'reports', reader, e.workbench));
+    await screen.findByText(/Dữ liệu kiểm thử —/);
+    fireEvent.click(screen.getByRole('button', { name: 'Kiểm tra quyền xem (offline)' }));
+    await screen.findByText('DAILY_READ_INCOMPLETE');
+    fireEvent.click(screen.getByRole('button', { name: 'Kiểm tra CSV (offline)' }));
+    await screen.findByText('EXPORT_SCHEMA_BINDING_UNAVAILABLE');
+    expect(screen.getByRole('button', { name: /Xuất CSV riêng tư/ })).toBeDisabled();
+    expect(screen.getByText(/Đây không phải kết quả bằng 0/)).toBeInTheDocument();
+  });
+  it('reader replacement hides the prior snapshot immediately, not just after a response', async () => {
+    const reader2: OperationsReader = { read: () => new Promise(() => {}) };
+    const rendered = render(element('ACADEMIC_MANAGER', 'cms', cmsReader));
+    await screen.findByRole('button', { name: /Revision synthetic/ });
+    rendered.rerender(element('ACADEMIC_MANAGER', 'cms', reader2));
+    expect(screen.queryByRole('button', { name: /Revision synthetic/ })).not.toBeInTheDocument();
+    expect(screen.getByLabelText('Đang tải dữ liệu W10')).toBeInTheDocument();
+  });
+  it('history revision projection strips fields outside the contract and detaches copies', async () => {
+    const q: OperationsReadRequest = {
+      viewerId: 'synthetic-user',
+      role: 'ACADEMIC_MANAGER',
+      section: 'cms',
+      date,
+      scopeId: scope.id,
+    };
+    const source = (await cmsReader.read(q)) as OperationsOfflineSnapshot;
+    const extra = {
+      ...source,
+      cms: [
+        {
+          ...source.cms[0],
+          history: [
+            { state: 'DRAFT' as const, revision: { ...ref('old'), secret: 'NEVER_DISCLOSE' } },
+          ],
+        },
+      ],
+    };
+    const projected = viewModel(extra, q);
+    expect(JSON.stringify(projected)).not.toContain('NEVER_DISCLOSE');
+    extra.cms[0].history[0].revision.revision = 'changed';
+    expect(projected.cms[0].history[0].revision.revision).toBe('synthetic-1');
+  });
+  it('heading and report scroll region are reachable via focus semantics (DOM only)', async () => {
+    const reader: OperationsReader = {
+      read: async (q) => ({
+        ...raw(q),
+        metrics: [
+          {
+            metricCode: 'SYNTHETIC_METRIC',
+            sourceRef: ref('source'),
+            scope: { kind: 'LEARNER', id: q.scopeId },
+            domain: 'LEARNING',
+            sourceWave: 'W03',
+            effectiveAt: '2026-11-06T01:00:00.000Z',
+            evidenceState: 'CONFIRMED',
+            completeness: 'COMPLETE',
+            value: 0,
+            supersedesRef: null,
+            provenance: 'OFFLINE_SYNTHETIC',
+          },
+        ],
+      }),
+    };
+    render(element('STUDENT', 'reports', reader));
+    expect(screen.getByRole('heading', { name: 'Báo cáo cuối ngày' })).toHaveFocus();
+    await screen.findByRole('table');
+    const region = screen.getByRole('region', { name: 'Bảng báo cáo có thể cuộn ngang' });
+    expect(region).toHaveAttribute('tabindex', '0');
+    region.focus();
+    expect(region).toHaveFocus();
+    expect(within(region).getByRole('table')).toBeInTheDocument();
+  });
+  it('prefight is single-flight and ignores obsolete results on selection change', async () => {
+    let resolve!: (r: OperationsWorkbenchResult) => void;
+    const port: OperationsWorkbenchPort = {
+      mode: 'IN_MEMORY_ONLY',
+      check: vi.fn<OperationsWorkbenchPort['check']>(
+        () =>
+          new Promise<OperationsWorkbenchResult>((r) => {
+            resolve = r;
+          }),
+      ),
+    };
+    const rendered = render(<OperationsPreflight port={port} selection={selection} />);
+    const button = screen.getByRole('button', { name: 'Kiểm tra điều kiện offline' });
+    fireEvent.click(button);
+    fireEvent.click(button);
+    expect(port.check).toHaveBeenCalledTimes(1);
+    expect(screen.getByRole('button', { name: 'Đang kiểm tra điều kiện…' })).toBeDisabled();
+    rendered.rerender(
+      <OperationsPreflight port={port} selection={{ ...selection, scopeId: 'changed' }} />,
+    );
+    await act(async () => resolve(outcome('CONDITIONS_MET_OFFLINE', 'OBSOLETE_RESULT')));
+    expect(screen.queryByText('OBSOLETE_RESULT')).not.toBeInTheDocument();
+  });
+  it('a replacement port cannot retain the former condition result', async () => {
+    const first: OperationsWorkbenchPort = {
+      mode: 'IN_MEMORY_ONLY',
+      check: async () => outcome('CONDITIONS_MET_OFFLINE'),
+    };
+    const rendered = render(<OperationsPreflight port={first} selection={selection} />);
+    fireEvent.click(screen.getByRole('button', { name: 'Kiểm tra điều kiện offline' }));
+    await screen.findByText('SYNTHETIC_CHECK');
+    rendered.rerender(<OperationsPreflight selection={selection} />);
+    expect(screen.queryByText('SYNTHETIC_CHECK')).not.toBeInTheDocument();
+    expect(screen.getByRole('button', { name: 'Kiểm tra điều kiện offline' })).toBeDisabled();
+  });
+  it.each(['runtimeAuthorized', 'mutationPerformed', 'exportPerformed', 'auditPersisted'] as const)(
+    'rejects fake %s result flags',
+    async (flag) => {
+      const port: OperationsWorkbenchPort = {
+        mode: 'IN_MEMORY_ONLY',
+        check: async () =>
+          ({
+            ...outcome('CONDITIONS_MET_OFFLINE'),
+            [flag]: true,
+          }) as unknown as OperationsWorkbenchResult,
+      };
+      render(<OperationsPreflight port={port} selection={selection} />);
+      fireEvent.click(screen.getByRole('button', { name: 'Kiểm tra điều kiện offline' }));
+      await screen.findByText('UNVERIFIED_PREFLIGHT_RESULT');
+      expect(screen.queryByText(/Điều kiện nhất quán offline/)).not.toBeInTheDocument();
+    },
+  );
+  it.each(['throw', 'unsafe-reason'] as const)('sanitizes %s provider details', async (mode) => {
+    const port: OperationsWorkbenchPort = {
+      mode: 'IN_MEMORY_ONLY',
+      check: async () => {
+        if (mode === 'throw') throw Error('password=NEVER_DISCLOSE');
+        return outcome('BLOCKED', 'password=NEVER_DISCLOSE');
+      },
+    };
+    render(<OperationsPreflight port={port} selection={selection} />);
+    fireEvent.click(screen.getByRole('button', { name: 'Kiểm tra điều kiện offline' }));
+    await screen.findByText(
+      mode === 'throw' ? 'PREFLIGHT_UNAVAILABLE' : 'UNVERIFIED_PREFLIGHT_RESULT',
+    );
+    expect(screen.queryByText(/NEVER_DISCLOSE/)).not.toBeInTheDocument();
+  });
+});
```
