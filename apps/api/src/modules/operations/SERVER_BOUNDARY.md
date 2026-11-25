# W10-DF-S2 — server authority and source integration boundary

Authority is the explicit PO six-file code-only S2 approval. Live Master DEC069,
Catalog BR111 and Artifact038 were read before coding; policy directions remain
unchanged. Every preexisting file, including the four S1 files, is read-only.

## Read-only source inspection and actual integration blockers

| Existing source inspected                                                                    | Reusable contract / constraint                                                                                                                                           | Gap for W10                                                                                                                                                                     |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| auth/guards/auth.guard.ts                                                                    | Session userId, active user lookup, server request.user                                                                                                                  | No W10 request-bound read port or canonical-person resolution                                                                                                                   |
| authorization/authorization.service.ts                                                       | requireActor verifies persisted session; permits checks active role, independent approved grant, PG effective/expiry/revocation time; grant/role changes revoke sessions | permits is a DB operation; no invocation allowed. New W10 capabilities are absent                                                                                               |
| authorization/permission.policy.ts                                                           | Seven business roles; explicit eligible/inherent capability rules; scopes GLOBAL/CLASS/COURSE/SUPPORT_TOPIC/TEACHER                                                      | No cms._, ops._ or report.* capability. W10 CMS/TECHNICAL/LEDGER/INSPECTION/LEARNER scopes have no approved lossless mapping. Never map to GLOBAL or accounts.manage implicitly |
| academic/academic.service.ts, schema CourseVersion/TeachingSession/ClassInstructorAssignment | W02 current effective assignments and published/revisioned official schedule                                                                                             | Need current class/teacher joins, source revisions and approved daily state predicates                                                                                          |
| class-lms assignment/grading/quiz services                                                   | W03 immutable submission/grade/release revisions; learner grade view is PUBLISHED                                                                                        | REVIEWED_FINAL alone is not published. quiz service onModuleInit starts mutating expiry sweeps; do not instantiate it                                                           |
| placement service and placement_result_releases schema                                       | W04 owner attempt and separately released results                                                                                                                        | No approved W10 final-state metric/read-only connector; no source service called                                                                                                |
| support/support.service.ts and SupportEvent/Referral/Consent schema                          | W05A scoped ticket/event/consent history; DEV fence and live session checks                                                                                              | No unrestricted report feed; actual privacy/topic/ownership policy still needed                                                                                                 |
| consultations/consultations.service.ts                                                       | W05B approved profiles/bookings/history/outbox                                                                                                                           | Startup includes sweep timer. Existing incident and runtime uncertainty remain; no confirmed booking facts                                                                      |
| session-engagement service and W06Receipt/Correction schema                                  | W06 published session access, learner receipt and independent correction history                                                                                         | Must read exhaustive official corrections and rule resolution, not Meet clicks or teacher hours                                                                                 |
| admissions-finance service and W07 tables                                                    | W07 admission decisions, payment events, allocations, entitlement links                                                                                                  | Hard pins original 55401/data-directory/identity. Do not invoke, spoof or relax guard; finance and entitlement are distinct facts                                               |
| inspection service and W08 assignment/report/decision/clock/correction schema                | W08 assigned scope and separate scheduled/observed/approved hours, own shift                                                                                             | Complete revision/decision/correction history and domain-specific source rule needed                                                                                            |
| certificates evidence-adapter.contracts.ts / trusted-evidence.contracts.ts                   | Existing W03/W06/W07 projections, EvidenceAdapterResult, TrustedCompletionReadResult                                                                                     | These are offline consistency contracts, not verified DB readers. W09 cannot provide issued-certificate facts                                                                   |

The inspection found no existing trusted W10 source or authority implementation
that can be safely wired without changing forbidden existing modules. This is an
explicit runtime integration blocker, not an invented working provider API.
Required changes for a future separately approved integration include W01 W10
capability eligibility and scope semantics, independent grants/person identity,
request-bound session reads, complete source connectors, approved metrics/state
filters and atomic current-head/revocation verification. None is applied here.

## The six new files

- operations-authority.contracts.ts: new required read-only authority ports and
  opaque context/result contracts, using S1 types.
- operations-authority-adapter.ts: server-port principal binding without caller
  identity/role arguments; exact grant checks, epoch/session/person revalidation
  and defensive data copies. Errors are sanitized; no retry/sweep/write.
- operations-source.contracts.ts: new source/lineage/head read-port requirements,
  typed reuse of existing W09 W03/W06/W07/offline result contracts, daily/CMS/view
  ticket and declared-claim analysis contracts.
- operations-source-adapters.ts: S1 CMS/daily/export composition, separate policy/
  licensing/confirmation lineage, freshness and revocation checks, no real data
  fetch or export. Health delegates to S1's UNKNOWN/UNVERIFIED fallback.
- operations-s2.spec.ts: controlled synthetic in-memory providers and offline
  negative/integration-style tests. These are not Nest/DB/HTTP tests.
- SERVER_BOUNDARY.md: this source inventory, trust gap, test/preservation report.

No other source, report, fixture, package, cache or evidence file is written in the
repository. No module/controller/provider is registered and no actual source
service is imported at runtime. Existing source contracts are imported by type
only; S1 foundation functions are reused unchanged.

## Authority: contexts are bindings, not authentication

readPrincipal() has no caller principal/role/boolean parameter. A future server DI
port must be bound to the actual authenticated request and persisted session, not
deserialize a request body into a PrincipalRead. Server principal, active account,
session revision, actual person, role, grant revision/decision/authority/epoch and
exact concrete scope are checked and rechecked. No GLOBAL fallback or role-derived
permission is added. S1 retains author-person != approver-person and role checks.

Contexts and view tickets are stored in adapter-private WeakMaps. JSON clones,
marker strings, foreign-adapter objects and caller role/identity fields cannot
mint them. This protects composition binding only: creating a context through a
synthetic port does not authenticate that port or its records.

Port modes are UNIMPLEMENTED or IN_MEMORY_ONLY, never VERIFIED. Missing or
unimplemented ports block. There is no branch that sets runtimeAuthorized=true.
All guards remain OFFLINE_CONSISTENCY_ONLY / requiresServerVerification=true.
Even a syntactically complete in-memory grant is not a real staff grant.

## Official source requirements and seven-role provenance

S1's role/source/scope contracts are reused for HV own learner activity/published
outcomes; GV assigned class teaching/grading/attendance; TV scoped support and
consultation; HVU program/class decisions; TN scoped payment/allocation/debt;
TT assigned inspection and own shift; QT scoped account/grant/security events.
No fixed count, score threshold, denominator, retention or state filter is invented.
Each metric needs its versioned approved definition, status/confirmation/effective
time rules and expected source pin, with separate approved lineage.

W03 published outcomes require the existing publication/finalization projection
and independent publication lineage. W06 attendance requires official learner
history and a matching existing S2 normalized correction-resolution contract;
neither type nor a NORMALIZED marker verifies actual history. W07 entitlement
identity is checked but historical validity remains unresolved; it is not a payment
receipt. W05B/W09 stay runtime unverified even with confirmation-looking records.
No offline completion result is promoted to an issued certificate or a real count.

SourceClaimAnalysis preserves declaredState/declaredValue separately: a consistent
CONFIRMED claim with numerical zero retains declaredValue=0, while null, pending,
unknown or unavailable never become zero. This is validation of a declaration,
not an authenticated fact. The S1 runtime-facing projection still has null values,
unverified/pending/unavailable state and INCOMPLETE completeness. Never graph or
export declaredValue as a confirmed production metric. Real confirmed zero cannot
be established by this offline batch; a trusted connector remains required.

Separate lineage reads require exact manifest/lineage pins and complete records.
Conflicting decisions, foreign scope, stale source refs and unavailable policies
fail closed. Missing/competing required source rows and pending consistency force
the stored view's required-source completeness false, preventing export preflight
from accepting an optimistic completeness flag.

Current source heads and authority are rechecked before returning. Export repeats
both view/export grant checks, uses the server-bound view ticket and S1 narrower
scope/filter/field/masking checks, and requires audit intent. No export/audit is
performed. Source disappearance or change since view blocks. The manifest must
cover policies, releases, correction history and completeness; it must change for
A-to-B-to-A transitions. A future connector must read current heads rather than
repeat a cached snapshot and fence source/grant changes coherently. A broken
provider reusing every pin cannot be authenticated by these offline comparisons.

Actual canonical metric definitions, CMS/asset rules and approvers, config/health
connectors, real RBAC, row filtering, source provenance and durable export audit
remain NOT REACHED. No preexisting service with side effects is called.

## Preservation, rollback and STOP

Baseline: 429 dirty/untracked entries, branch feat/v2-se-sw-01-pilot-main,
HEAD d9ef6bcc70986e9f05e1a7c2c84ed0317f693ed9; index SHA-256
9b01f017f40047492a81680c4badd8e5b9596a8eefa4cdf6f56af5e87476ba41.
All W10-S1/W09 pins, 34 migration hashes, 13 media and 11,353 protected files
matched before coding; none of the six target files existed.

Final actual check results and preservation receipts are appended after execution.
No seventh artifact is needed; tool output remains in the transcript.
Future authorized rollback can remove only these six new files after preserving
evidence; no DB rollback is needed. Nothing is registered or deployed.

STOP for GPT Web Batch Review. No S3, PostgreSQL retry, real grants or automatic
Consolidated Fix. W05B0PASS/0FAIL/9NOT REACHED, DEFERRED; migrations33/34 UNACCEPTED;
MEDIA_QA_PASS=false; ACADEMIC_APPROVED=false; PUBLISHED=false.

## Consolidated S2 execution report — 2026-11-05

Live reads succeeded before changes: Master modified12:16:36.447Z, Catalog
12:18:31.596Z, Artifact03812:21:26.527Z. Explicit PO S2 chat approval, not policy
approval alone, supplies the six-file implementation authority. No document edit.
Baseline read at13:35:17.017Z matched429 entries and all prior pinned content.

| Actual final check                                   | Result                                         |
| ---------------------------------------------------- | ---------------------------------------------- |
| New W10-S2 tests                                     | 73 PASS                                        |
| Existing W10-S1                                      | 106 PASS                                       |
| Existing W09 S1/S2/S3A/S4A                           | 30+89+44+61 =224 PASS                          |
| Combined Jest                                        | 6 suites,403 PASS,0 FAIL,0 SKIP;12.183s        |
| Scoped strict TypeScript,20 files                    | PASS,exit0                                     |
| Scoped ESLint,20 files                               | PASS,exit0                                     |
| Offline guard                                        | 0 forbidden runtime imports;0 network attempts |
| Real Nest session/RBAC/DB/HTTP/provider verification | NOT REACHED                                    |

Final raw merged Jest summary:

```text
PASS src/modules/operations/operations-s2.spec.ts (9.655 s)
PASS src/modules/operations/operations-foundation.spec.ts
PASS src/modules/certificates/evidence-adapters.spec.ts
PASS src/modules/certificates/certificate-review-guards.spec.ts
PASS src/modules/certificates/trusted-evidence-reader.spec.ts
PASS src/modules/certificates/completion-evaluator.spec.ts
Test Suites: 6 passed, 6 total
Tests:       403 passed, 403 total
Snapshots:   0 total
Time:        12.183 s
W10_S2_OFFLINE_GUARD {"blockedImports":0,"networkAttempts":0}
```

Jest used local jest.config.cjs, --runInBand --no-cache --runTestsByPath for these
six specs. No fake clock, skip or timeout increase. The wrapper blocked PG/Prisma/
Nest runtime imports and TCP/TLS/listen/HTTP(S)/fetch attempts. Typecheck used local
tsc --noEmit --incremental false --strict --skipLibCheck --target ES2023 --module
commonjs --types node,jest on all20 explicit W09/W10 TypeScript files. Local ESLint
checked the same20 files without fixing/caching. Prettier wrote only the six new
S2 files. No seventh report/test-log/cache/package file was created in the repo.

The initial S2 run passed393/393, with typecheck/lint PASS. Eight additional
hardening cases then covered W03 timestamp validity, W06 normalized contract
scope/history/type isolation and unresolved W07 entitlement period; that401/401
run passed. Final static review added early S1-compatible role/owner/scope denial
inside the new authority adapter before fetching source rows, with two focused
prefetch privacy cases. Final403/403 passed. There was no S2 failing business test or timeout to replace with a green
rerun. W06 checks establish selected offline contract consistency only; they do
not recompute academic denominators or prove the actual correction chain/normalizer
execution. Future trusted source integration must supply and independently verify
those facts; fixture NORMALIZED is not authenticated provenance.

Historical failures remain intact: W10-S1's first328-test run had327 PASS/1 FAIL
from an old expected pin on a new CMS revision fixture, and initial lint found
one control-regex error. That batch corrected the fixture/encoder without removing
assertions; its final106 W10 tests remain unchanged and PASS here. The read-only S1
OFFLINE_BOUNDARY.md and prior transcript preserve that history. W09-S3B Stage B
remains FAIL/BLOCKED, Stage C NOT REACHED; W05B actor0/0/9 and existing timeout/
incident logs were not replaced, rerun or closed by this offline S2 batch.

### Preservation receipts

Read-only post-test verification at13:56:57.482Z:

- Same branch/HEAD as baseline; same index SHA-256
  9b01f017f40047492a81680c4badd8e5b9596a8eefa4cdf6f56af5e87476ba41.
- All original429 entries preserved; total435 is exactly the six allowed additions.
  No existing W10-S1 or W01–W09 file was changed.
- 958 original Git-enumerated files excluding separately pinned W09/W10 additions
  retain digest7d853d5a0a9db03dcc08b42af151bfc115a40e8c1db32f82e2f1cf3990713e1c.
  All12 previously added W09/W10-S1 file pins also match; seven S1/S2 pins match.
- Protected-file differences0/11353; media differences0/13; migration differences0/34.
- At13:54:04.670Z,22 existing W05B/W09 incident evidence files matched their sealed
  prior manifest; its own hash still matched
  b1ef7f9de1bf5efafdab12cb41cf2e721c1bb66ecdafe00f40c4844dd98fab15.
  These hashes do not establish live database rows or listener health.

Source SHA-256 after final tests (this document omits a circular self-hash):

| New file                          | SHA-256                                                          |
| --------------------------------- | ---------------------------------------------------------------- |
| operations-authority.contracts.ts | a1476e7e4f45621f79c8824ac6806c37a6d5ad1eb59a9dddeda79ac7c69ed35a |
| operations-authority-adapter.ts   | fc90084c507c86084724129d7e8ab91c98e7f5964a8a10be5b0297adc32a43ac |
| operations-source.contracts.ts    | 2c952e14e53a27a5f2966377a0be62c1d29d28a400904a0da5bf6bb7b1d7c2d3 |
| operations-source-adapters.ts     | 0efb81571332a19cc0cd2f378d7804318591e961c4b052d8fef91cd3f6732fdd |
| operations-s2.spec.ts             | 1171f220b344cbb2002f61c8685ef97c6e994aaab402f255e8057856629a269b |

No PostgreSQL lifecycle, SQL/driver/socket, application HTTP, Prisma, Nest service,
source sweep, real grant, Git mutation, Drive write or production action occurred.
Only the expressly requested connected Drive document reads used remote access.

### Proven findings, gaps and STOP

No new P0/P1 defect was proven by completed offline tests. Proven integration gaps
are the missing W10 capability/scope mappings in W01, unavailable request-bound
trusted reader/person resolution, absent official source connectors and unresolved
canonical metric/field/approval policy. They are blockers, not patched capabilities
or working runtime integrations. Existing S3B environment P1 remains OPEN.
No synthetic declaration is presented as a confirmed runtime fact; actual zero,
runtime authorization, provenance and complete exports remain unverified.

The batch is ready for GPT Web review of code/contract behavior and blockers.
STOP. No S3, PostgreSQL retry, scope expansion or automatic Consolidated Fix.
