# W10-DF-S3 — Frontend Development First

Local review record, 2026-11-06. This batch implements frontend presentation and
offline interactions only. No operational publication, export, provider access or
runtime authorization is proven. No API endpoint was invented.

## Authority and inventory

Baseline: P1–P6 / DEC069 / Artifact038 and explicit UI authorization in the task.
Drive was not re-read in this UI batch; traceability links do not imply access.
Unresolved policy remains OPEN. Prior backend tests are historical, not rerun UI
evidence: W10 406 PASS, W09 224 PASS as previously recorded.

Before edits, source inventory found PublicLayout, existing Tailwind design
tokens/classes, Feedback/PageSkeleton, SafeMarkdown, AuthContext, RoleRoute and
AuthNavigation. There was no W10 frontend or registered W10 HTTP controller.
Backend contracts and the side-effect-free `resolveCenterDay` are reused read-only.
No W01–W09 module or shared authentication/security logic is changed.

Frozen manifest (two minimal registrations, seven new files):

- `apps/web/src/App.tsx`: one operations import pair and one protected route.
- `apps/web/src/features/auth/AuthNavigation.tsx`: one W10 link component.
- `apps/web/src/features/operations/contracts.ts`
- `apps/web/src/features/operations/model.ts`
- `apps/web/src/features/operations/OperationsNavigationLink.tsx`
- `apps/web/src/features/operations/OperationsPage.tsx`
- `apps/web/src/features/operations/model.test.ts`
- `apps/web/src/features/operations/operations.test.tsx`
- `apps/web/src/features/operations/UI_BATCH_REVIEW.md` (this report).

## Screen / role matrix

| UC | Route under `/workspace/operations/` | Eligible navigation | Offline UI coverage | Runtime boundary |
|---|---|---|---|---|
| UCV2-08 / P1 | `cms` | TV, HVU | TV ephemeral Markdown draft/preview; HVU reason input; revision detail/history; DRAFT, IN_REVIEW, REJECTED, WITHDRAWN, PUBLISHED filters | Save/submit/review/publish/reject/withdraw disabled; server identity, author ≠ approver, grants, policy, assets and revision must be revalidated |
| UCV2-54 / P2 | `settings` | QT | Safe setting-code metadata; redacted values; UNCONFIGURED/UNVERIFIED; sensitive-approval explanation | No config values, edits, credential input or provider probes; authenticated allowlist/approval still required |
| UCV2-55 / P3 | `audit` | QT | Date/scope/event filters, safe event projection, revision, UNKNOWN health, missing-observation explanation | No raw payload or actor PII; authenticated field policy/freshness reader missing |
| UCV2-56 / P4–P6 | `reports` | HV, GV, TV, HVU, TN, TT, QT | UTC+7 date, exact half-open day, scoped/source/status filters, provenance/completeness, missing values and blocked private CSV | No confirmed metric or export from offline fixtures; current view/export grants, authoritative metric definitions, source pins, completeness and CSV server guard still required |

| Role | Daily-report context | Other W10 entry |
|---|---|---|
| HV | Own learning/published outcomes | None |
| GV | Assigned classes/teaching/grading/attendance | None |
| TV | Scoped support/consultation | CMS authoring |
| HVU | Scoped academic/program/class decisions | CMS independent review |
| TN | Scoped finance/ledger | None |
| TT | Assigned inspection/personal shifts | None |
| QT | Technical/accounts/security operations | Settings, audit/health |

Role eligibility controls navigation only. Explicit grants cannot be established
from AuthContext role, a selected scope, an offline fixture or a marker string.
Unknown/legacy roles and inactive/locked users are denied before W10 reads.

## Data and interaction boundaries

Default reader returns UNAVAILABLE in memory. It performs no fetch/HTTP, Nest,
Prisma, DB, provider call or publication. Only controlled in-memory tests inject
OFFLINE_TEST_ONLY snapshots, prominently labelled as test data. No seeded mock
data is bundled into the normal page or presented as operational evidence.

Every snapshot binds principal, role, UC, date and exact scope. Mismatched scopes,
wrong source kinds, out-of-day timestamps or malformed projected records fail
closed; asynchronous error text is replaced with a safe generic message. Reader
responses are keyed, obsolete resolutions discarded and foreign data never
merged across scopes. Navigation changes reset role/UC-local state. CMS drafts
remain in component memory and are explicitly unsaved, not localStorage.

All projected numeric values remain null, including fixture CONFIRMED ZERO.
W05B/W09 cannot be confirmed from this boundary. UNKNOWN is not HEALTHY.
`runtimeAuthorized=false` and `exportPerformed=false`; no Blob, CSV download,
object URL, client-side confirmation or simulated successful action exists.
CF01 backend temporal completeness is untouched.

## UI and accessibility

Existing system colors, typography, card/button/input styles and icons reused.
Four screen layouts share a clear header, role/assurance badges, horizontal mobile
navigation / desktop sidebar, responsive filter cards and readable empty states.
The report table scrolls inside its own container on narrow screens. Fields have
labels, controls have native disabled semantics, navigation has aria-current,
updates have live regions, decorative icons are hidden and previews escape HTML.
This is DOM/offline coverage, not a claim of visual Chrome or screen-reader QA.
No dev server or browser connection is authorized or started in this batch.

## Verification — actual results

One bounded Vitest invocation, not a broad frontend/backend regression:

```powershell
# Working directory: apps/web
node ../../node_modules/vitest/vitest.mjs run --config vite.config.ts --maxWorkers 1 --no-file-parallelism src/features/operations/model.test.ts src/features/operations/operations.test.tsx src/App.test.tsx
```

```text
RUN  v4.1.11 D:/KLTN_Project/smart-english-elearning-kltn/apps/web


 Test Files  3 passed (3)
      Tests  93 passed (93)
   Start at  14:34:21
   Duration  15.48s (transform 2.48s, setup 0ms, import 7.54s, tests 1.98s, environment 5.16s)
```

Result: 93 PASS / 0 FAIL / 0 SKIPPED, three suites, exit 0. Includes seven-role
actual App route rendering and the existing App smoke test. No test rerun.
Coverage includes role/section negatives, guest/inactive/locked/legacy, source
binding, scope kind and learner isolation, UTC+7 half-open boundaries, temporal
invalidity, stale response rejection, explicit read retry, loss of active status,
CMS safe local preview/history/five states, QT masking/UNKNOWN health, safe audit
filtering, source/status report filters, never-confirmed zero and disabled CSV.
Desktop/mobile cases are semantic DOM checks at nominal widths 320/1440, not
visual rendering or real-browser authentication tests.

Initial typecheck: FAIL (exit 1), three new annotation errors:
`model.ts` two implicit-any CMS history callbacks and
`operations.test.tsx` deferred reader Promise inferred as unknown.
The custom no-emit command also omitted existing `vite-env.d.ts`, causing
18 asset/import.meta diagnostics. These 18 were a verification-command omission,
not proven source regressions. Corrected by including the existing ambient
declaration read-only; no shared config was edited.

The three annotations were corrected once, inside the manifest, followed by one
bounded type/lint verification. TypeScript transpilation of final vs reconstructed
pre-correction code was byte-identical for both files; no test logic or runtime
expression changed, and tests were not rerun to seek a green result.
The initial diagnostic output is retained below.

```text
{"noEmit":true,"scopedFiles":8,"scopedDiagnostics":3,"dependencyDiagnostics":18}
apps/web/src/content/news-assets.ts:1:29 TS2307 Cannot find module '@/assets/editorial/enrollment-opening.webp' or its corresponding type declarations.
apps/web/src/content/news-assets.ts:2:26 TS2307 Cannot find module '@/assets/editorial/four-skill-results.webp' or its corresponding type declarations.
apps/web/src/content/news-assets.ts:3:29 TS2307 Cannot find module '@/assets/editorial/learning-experience-update.webp' or its corresponding type declarations.
apps/web/src/content/news-assets.ts:4:27 TS2307 Cannot find module '@/assets/editorial/listening-workshop.webp' or its corresponding type declarations.
apps/web/src/content/news-assets.ts:5:26 TS2307 Cannot find module '@/assets/editorial/reading-strategy.webp' or its corresponding type declarations.
apps/web/src/content/news-assets.ts:6:27 TS2307 Cannot find module '@/assets/editorial/speaking-practice.webp' or its corresponding type declarations.
apps/web/src/content/news-assets.ts:7:27 TS2307 Cannot find module '@/assets/editorial/study-path-guidance.webp' or its corresponding type declarations.
apps/web/src/content/news-assets.ts:8:26 TS2307 Cannot find module '@/assets/editorial/writing-purpose.webp' or its corresponding type declarations.
apps/web/src/features/auth/AuthShell.tsx:2:28 TS2307 Cannot find module '@/assets/auth/auth-study.webp' or its corresponding type declarations.
apps/web/src/features/catalog/course-assets.ts:1:29 TS2307 Cannot find module '@/assets/courses/course-four-skills.webp' or its corresponding type declarations.
apps/web/src/features/catalog/course-assets.ts:2:28 TS2307 Cannot find module '@/assets/courses/course-listening.webp' or its corresponding type declarations.
apps/web/src/features/catalog/course-assets.ts:3:21 TS2307 Cannot find module '@/assets/courses/course-lr.webp' or its corresponding type declarations.
apps/web/src/features/catalog/course-assets.ts:4:26 TS2307 Cannot find module '@/assets/courses/course-reading.webp' or its corresponding type declarations.
apps/web/src/features/catalog/course-assets.ts:5:27 TS2307 Cannot find module '@/assets/courses/course-speaking.webp' or its corresponding type declarations.
apps/web/src/features/catalog/course-assets.ts:6:26 TS2307 Cannot find module '@/assets/courses/course-writing.webp' or its corresponding type declarations.
D:/KLTN_Project/smart-english-elearning-kltn/apps/web/src/features/operations/model.ts:151:25 TS7006 Parameter 'h' implicitly has an 'any' type.
D:/KLTN_Project/smart-english-elearning-kltn/apps/web/src/features/operations/model.ts:190:31 TS7006 Parameter 'h' implicitly has an 'any' type.
D:/KLTN_Project/smart-english-elearning-kltn/apps/web/src/features/operations/operations.test.tsx:210:7 TS2322 Type 'Mock<(q: any) => Promise<unknown>>' is not assignable to type '(request: OperationsReadRequest) => Promise<OperationsReadResult>'.   Type 'Promise<unknown>' is not assignable to type 'Promise<OperationsReadResult>'.     Type 'unknown' is not assignable to type 'OperationsReadResult'.
apps/web/src/lib/api-client.ts:1:39 TS2339 Property 'env' does not exist on type 'ImportMeta'.
apps/web/src/pages/HomePage.tsx:23:23 TS2307 Cannot find module '@/assets/marketing/home-hero.webp' or its corresponding type declarations.
apps/web/src/pages/HomePage.tsx:24:28 TS2307 Cannot find module '@/assets/marketing/placement-assessment.webp' or its corresponding type declarations.
```

Final no-emit typecheck: PASS, exit 0. TypeScript compiler API parses the existing
`apps/web/tsconfig.app.json`, checks eight scoped TS/TSX roots plus the existing
Vite ambient declaration and their dependencies, with noEmit=true,
incremental=false, composite=false; no emit or tsbuildinfo. Output:

```text
{"noEmit":true,"scopedFiles":9,"scopedDiagnostics":0,"dependencyDiagnostics":0}
```

Scoped ESLint: PASS (exit 0, no diagnostics), initially and after annotations:

```powershell
# Working directory: apps/web; no --fix or cache
node ../../node_modules/eslint/bin/eslint.js src/features/operations/contracts.ts src/features/operations/model.ts src/features/operations/OperationsNavigationLink.tsx src/features/operations/OperationsPage.tsx src/features/operations/model.test.ts src/features/operations/operations.test.tsx src/App.tsx src/features/auth/AuthNavigation.tsx
```

No backend tests, live HTTP, SQL, DB, provider, export/publication or Chrome server
was started. Static W10 implementation scan found no fetch/XMLHttpRequest/
WebSocket/EventSource/storage/Blob calls. Tests explicitly trap unexpected fetch.

## Diff and preservation receipt

Branch `feat/v2-se-sw-01-pilot-main`; HEAD before/after:
`d9ef6bcc70986e9f05e1a7c2c84ed0317f693ed9`.

Git index SHA-256 before/after:
`9b01f017f40047492a81680c4badd8e5b9596a8eefa4cdf6f56af5e87476ba41`.

Working tree: 443 → 450 entries, exactly seven new manifest files.
Both registered existing files were already dirty; their prior content was saved
in memory before editing and compared against this batch baseline, not HEAD.
No previous local change was reset, overwritten, staged or committed.

- 982 old Git-enumerated files outside the manifest: unchanged aggregate SHA-256
  `afe6fc26b8d1b8b9e901b78b123226f4017c672113bff5eac48ef4f86c407b05`.
- All 18 W10 backend files: individual hashes unchanged, including CF01.
- Original 11,353-file protected ledger: 11,351 byte-identical, two authorized
  route/navigation deltas only; zero missing or unexplained mismatches.
- Migrations 1–34: 34/34 hash matches; media: 13/13; incident evidence: 22/22.
- W09, W05B, S10, W5 v02, M07, monthly calendar and previous evidence preserved.
  File hashes do not assert database-row integrity or migration acceptance.
- No PostgreSQL/SQL/ORM, process lifecycle, real grants, actual export,
  publication, Drive edits, Git mutation or release operation.

All six new source/test files are full new-file deltas; their complete content
is present beside this report for review. They are untracked and intentionally
not staged. Hashes after final annotations:

| New file | Bytes | SHA-256 |
|---|---:|---|
| `contracts.ts` | 2491 | `8d6eaab47a66688ff23b2a8e639d78bf7d1df3609cfdf706569d535231fd63c2` |
| `model.test.ts` | 8117 | `2621d922cf26090e0b1162d7b7955191a644cb0ac70d2fd1b842af8e642608ed` |
| `model.ts` | 7908 | `ef7c554d60c5d07df9958b004a442c1765ad760958527d516a199a5de0aba634` |
| `operations.test.tsx` | 17874 | `3d1d7becb3132daf452e88f87fea02ea37513e766a0ea1bb1fa7f9f30f6141a5` |
| `OperationsNavigationLink.tsx` | 372 | `05e3800eaf5bed80a493f242e3619635cb1fffbf21ac20c9f2aba8539c59285b` |
| `OperationsPage.tsx` | 29058 | `68a50a05ca23c9a0e31a34824e78ddb930214a0dcf55ecca603bcb6901cf8d02` |

This report is the seventh new file. Its own hash is excluded from its table
to avoid a self-referential digest.

Minimal existing-file delta against the in-memory pre-batch baseline
(line markers show each insertion, not a claimed complete standard patch):

```diff
--- batch-baseline/apps/web/src/App.tsx
+++ working-tree/apps/web/src/App.tsx
@@ old:23 new:23 @@
+import { OperationsPage } from '@/features/operations/OperationsPage';
@@ old:23 new:24 @@
+import { operationsRoles } from '@/features/operations/model';
@@ old:333 new:335 @@
+          path="workspace/operations/:section?"
@@ old:333 new:336 @@
+          element={<RoleRoute allowedRoles={operationsRoles}><OperationsPage /></RoleRoute>}
@@ old:333 new:337 @@
+        />
@@ old:333 new:338 @@
+        <Route
--- batch-baseline/apps/web/src/features/auth/AuthNavigation.tsx
+++ working-tree/apps/web/src/features/auth/AuthNavigation.tsx
@@ old:7 new:7 @@
+import { OperationsNavigationLink } from '@/features/operations/OperationsNavigationLink';
@@ old:45 new:46 @@
+      <OperationsNavigationLink />
```

## Consolidated Fix / open acceptance list

| ID | Kind / status | Evidence and required next work |
|---|---|---|
| UI-W10-01 | Runtime integration boundary — OPEN | Default reader is intentionally UNAVAILABLE; current server grants, authenticated source scope/revisions, CMS authorship and config approvals remain unverified. No backend wiring is authorized in this frontend batch. |
| UI-W10-02 | Runtime export acceptance — NOT REACHED | UI export is always disabled; server view/export parity after revoke, fresh revision, private download and formula-safe CSV require actual endpoint/runtime tests. No false export success is offered. |
| UI-W10-03 | Visual/browser accessibility QA — NOT REACHED | Real Chrome desktop/mobile screenshots, text overflow (including inherited global header density), keyboard/screen-reader and focus/contrast verification remain to be reviewed. Nominal-width DOM tests do not prove layout pixels. |
| UI-W10-T1 | New type annotations — CORRECTED | Three initial diagnostics preserved above; final typecheck/lint PASS, emitted JS unchanged; no repeat Vitest run. |
| UI-W10-T2 | Typecheck command ambient context — CORRECTED | Existing Vite declaration added to read-only compiler root set; no source/config workaround or baseline-error suppression. |

No proven new P0/P1 security regression was found in the scoped offline checks.
This is not evidence of runtime authorization/security PASS. Offline interaction
coverage is complete for this manifest; operational source integration and
visual acceptance remain OPEN.

Release gates: MEDIA_QA_PASS=false, ACADEMIC_APPROVED=false, PUBLISHED=false.
STOP for GPT Web consolidated Batch Review. No automatic CF or runtime stage.

## Remaining integration / acceptance

- Real trusted W10 HTTP read endpoints and current scoped grants remain absent.
- Moderation/config/audit/report adapters must authenticate provenance, freshness,
  explicit allowlists and publication/approval lineage server-side.
- Current authorization and revision parity must be rechecked at export time;
  sensitive data and CSV formula injection need real HTTP acceptance before use.
- Seven-role source completeness and person-vs-principal bindings need actual
  server evidence; W05B/W09 incident/runtime blockers remain unchanged.
- Desktop/mobile screenshots, keyboard/screen-reader and visual overflow checks
  in real Chrome are NOT REACHED; offline DOM tests cannot prove those.
- Original release gates remain false. No UC completion or production PASS.

STOP for GPT Web consolidated Batch Review. No automatic CF or runtime stage.
