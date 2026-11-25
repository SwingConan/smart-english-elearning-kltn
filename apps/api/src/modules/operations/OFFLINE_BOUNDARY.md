# W10-DF-S1 — offline operations foundation

Authority: the explicit PO approval for one code-only batch and exactly four new
files in this directory. Live Master DEC069, Catalog BR111 and Artifact038 were
read before coding. Their business-policy approval alone was not used as coding
authority. No file outside these four is written by this batch.

## Implemented boundaries

`operations.contracts.ts` defines inert CMS revision/moderation, scoped grants,
allowlisted config, provider/audit observation, seven-role source projection,
daily window, provenance/completeness and view/export contracts. These are not DB
models or authenticated capabilities. No Nest registration, API, reader, HTTP,
Prisma, PostgreSQL, source-module sweep or persistent operation is included.

`operations-foundation.ts` implements pure guards/simulations:

- CMS authoring requires TV/COUNSELOR and explicit scoped draft grant. Review/
  publication requires independently authorized HVU/ACADEMIC_MANAGER, exact
  revision, complete author-person lineage, applicable approved content policy,
  reason and, for publication, asset/license clearance. Self-approval is compared
  by canonical person ID. Material changes require a different linked revision;
  published/rejected/withdrawn revisions are not edited in place. No revision or
  content is actually published, persisted or exposed publicly.
- QT/SYSTEM_ADMIN config changes require exact technical scope, explicit current
  grant, an approved allowlist and known sensitivity. Sensitive requests need a
  separate exact-request/policy approval and independent person under an explicit
  authority rule. The actual approver policy is still open; no rule is invented.
  No raw setting values are accepted by the change guard. Audit contracts expose
  no update/delete operation or raw event payload.
- Safe operations status is a strict value-free projection. No raw URL, error,
  secret, arbitrary config field or object serialization is reflected. Missing,
  synthetic and client `verified:true` observations never yield HEALTHY or
  CONNECTED. All S1 health remains UNKNOWN; only an explicit configured=false
  claim is displayed as UNCONFIGURED, otherwise UNVERIFIED. This is not a probe.
- One reporting framework defines seven role/domain/scope projections. Source
  domain/wave routing is a conservative contract vocabulary, not an approved
  canonical metric list or query definition. Every metric separately needs an
  approved scoped definition, status predicate, confirmation/effective-time rule,
  exact revision and provenance. No count, denominator, debt amount or provider
  threshold is hardcoded. Learners are own-only; staff-shift scope is own-person;
  other resources require exact explicit grants, with no global/wildcard fallback.
- Daily boundaries require explicit configured Asia/Ho_Chi_Minh. Modern UTC+7
  candidate midnights are checked against Intl for both ends; unsupported zones
  or historical offset mismatch block, rather than guess DST/effective policy.
  The window is [startAt,endExclusive); no system/default/client clock grants
  authority and no silent timezone fallback occurs.
- Source values remain null and reports INCOMPLETE in this slice. A synthetic
  CONFIRMED/COMPLETE/zero claim becomes UNVERIFIED, never real CONFIRMED. Pending,
  unknown, unavailable and missing evidence remain distinct from measured zero.
  W05B consultation and W09 completion/certificate facts get no special trust
  upgrade. Duplicate/corrected competing rows remain UNKNOWN, not last-row-wins.
- CSV preflight rechecks current view AND export grants, principal/person/session,
  role, date/scope, revision manifest, narrower filters/fields and same-or-stricter
  masking. SECRET/UNKNOWN fields are denied. Missing required source completeness
  or audit intent blocks. No export/download/audit persistence is performed and
  no actual COMPLETE report is returned, even if a fixture claims completeness.
  A pure CSV cell encoder neutralizes formula prefixes and quotes delimiters;
  it is not secret redaction or permission checking. Only previously authorized,
  allowlisted, masked, non-secret cells may reach a future serializer.

## Assurance and missing runtime verification

All guards return OFFLINE_CONSISTENCY_ONLY, runtimeAuthorized=false and
requiresServerVerification=true, even for CONDITIONS_MET_OFFLINE. Fixture grants,
APPROVED/VALID flags and revision IDs cannot authenticate a source. Types and
markers must never be mounted as standalone API authorization. Provider observation
contracts describe future requirements; there is no implemented verified branch.

Future separately authorized integration must establish authenticated server
identity/canonical person/session, current grants and independent approval lineage,
resource/row filters, actual complete current source revisions and correction
history, approved metric/CSV field policies, timezone configuration, health
observation/secret-storage policy, revocation fencing and durable audit. Reusing
all revision pins after data changes cannot be detected by offline comparison.
W05B/W09 runtime blockers and their prior incident evidence remain unchanged.

Unresolved metric definitions, CMS content/licensing/withdrawal rules, sensitive
change approver, retention/PII fields, health SLA and actual integrations remain
OPEN. Missing policies fail closed. No real grant, CMS publishing, certificate
operation, DB integration, UC completion or release acceptance is claimed.

## Verification and preservation

Focused synthetic tests live in `operations-foundation.spec.ts`. Test logs and
checks are returned through the execution transcript; no fifth evidence file,
snapshot, cache in the repository, package edit or application artifact is created.
Relevant W09 offline suites can run with the same network/runtime-import denial
wrapper. Typecheck uses noEmit/incremental=false; lint does not write a cache.

Baseline observed at 2026-11-05T12:56:02.194Z: branch
feat/v2-se-sw-01-pilot-main, HEAD d9ef6bcc70986e9f05e1a7c2c84ed0317f693ed9,
425 dirty/untracked entries, index SHA-256
9b01f017f40047492a81680c4badd8e5b9596a8eefa4cdf6f56af5e87476ba41.
S1–S4A file pins, 34 migration hashes, 13 media and 11,353 protected-file entries
matched. No target file existed and no applicable AGENTS.md was found in the
ancestor path. Final test results and preservation checks are appended below
after actual execution, not inferred from previous green runs.

## Rollback and STOP

Only these four new files are added: contracts, foundation, isolated spec and this
document. No module/provider/route is registered. Future authorized rollback can
remove these additions after preserving evidence; no DB rollback is needed.
Do not execute any further slice or runtime diagnostic automatically.

W05B0PASS/0FAIL/9NOT REACHED, closeout DEFERRED; migration33/34 UNACCEPTED;
MEDIA_QA_PASS=false; ACADEMIC_APPROVED=false; PUBLISHED=false.

STOP for GPT Web Batch Review. No W10-S2 authority.

## Consolidated execution receipt — 2026-11-05

Live read metadata: Master modified12:16:36.447Z, Catalog12:18:31.596Z,
Artifact03812:21:26.527Z. Explicit current PO chat approval authorizes only the
four files named above. No target conflict or baseline mismatch was found.

| Actual check                                       | Result                                         |
| -------------------------------------------------- | ---------------------------------------------- |
| New W10 pure suite                                 | 106 PASS                                       |
| W09 S1/S2/S3A/S4A regression                       | 30/89/44/61 =224 PASS                          |
| Final combined Jest                                | 5 suites,330 PASS,0 FAIL,0 SKIP;8.706s         |
| Scoped strict TypeScript                           | PASS,exit0                                     |
| Scoped ESLint                                      | PASS,exit0; no rule suppression                |
| Offline guard                                      | 0 forbidden runtime imports;0 network attempts |
| Actual provider/source/server-grant/DB integration | NOT REACHED; outside authority                 |

Final raw merged Jest summary:

```text
PASS src/modules/operations/operations-foundation.spec.ts (7.04 s)
PASS src/modules/certificates/evidence-adapters.spec.ts
PASS src/modules/certificates/certificate-review-guards.spec.ts
PASS src/modules/certificates/trusted-evidence-reader.spec.ts
PASS src/modules/certificates/completion-evaluator.spec.ts
Test Suites: 5 passed, 5 total
Tests:       330 passed, 330 total
Snapshots:   0 total
Time:        8.706 s
W10_OFFLINE_GUARD {"blockedImports":0,"networkAttempts":0}
```

Jest used local jest.config.cjs, runInBand/no-cache/runTestsByPath for exactly the
five specs above, unchanged default timeout, no fake clock. The wrapper denied PG,
Prisma and Nest runtime imports, TCP/TLS/listen, HTTP(S) and fetch calls. Typecheck
used local tsc with noEmit, incremental=false, strict, skipLibCheck, targetES2023,
modulecommonjs and typesnode,jest on the three W10 and twelve W09 TypeScript files.
Local ESLint checked those same15 files without fix/cache. Prettier wrote only
the four approved new files. No extra evidence/log/package/Prisma file was written.

Failure history remains in the execution transcript: first combined run had
327 PASS/1 FAIL of328. A new CMS revision fixture retained its old expected pin;
the guard correctly returned BLOCKED. The positive fixture now supplies the new
expected pin, while its self-parent negative test supplies matching pins to reach
the lineage rejection assertion. No assertion was weakened. Initial lint reported
one no-control-regex error in the CSV prefix scan; a character-code scan replaced
the control-range regex without disabling rules. The next328-test run passed.
Two further focused edge tests cover invalid24:00 source-time normalization and
empty/control-prefix CSV cells; final330 passed. No run was repeated unchanged to
hide a failure.

### Preservation receipt

Post-test read-only verification at13:09:56.583Z:

- Branch and HEAD unchanged from baseline; index SHA-256 unchanged:
  9b01f017f40047492a81680c4badd8e5b9596a8eefa4cdf6f56af5e87476ba41.
- Original425 dirty/untracked entries preserved; total429 is exactly four new
  operations files. No existing source or W09 S1–S4A file changed.
- 958 preexisting Git-enumerated files excluding the separately pinned eight W09
  additions retain digest7d853d5a0a9db03dcc08b42af151bfc115a40e8c1db32f82e2f1cf3990713e1c;
  all eight W09 addition hashes also match. Seven S1/S2 pins match.
- Protected differences0/11353; media differences0/13; migration differences0/34.
- At13:09:32.157Z,22 existing W05B/W09 incident evidence files matched the sealed
  prior manifest. Its own SHA-256 still matched
  b1ef7f9de1bf5efafdab12cb41cf2e721c1bb66ecdafe00f40c4844dd98fab15.
  This is byte preservation, not current cluster or database-row integrity.
- Code SHA-256: contracts7a0b9f0c21c1dbbabbb13a0d4eeb5a0c6380af49ad2e0939699ff8824de1f47c;
  foundation6bd7960c5b1e9f13b48bf19fa154729623039b4a3da76f626535d714ec681b3d;
  speca364078e4b9ec7f24cfa3933ee464436effd1bdd3ab6a496cf4a460b5368251d.
  This document omits a self-hash to avoid a circular receipt.

No DB/HTTP/provider client, PostgreSQL lifecycle/repair, migration, real grant,
CMS publishing, W01–W09 edit, Git mutation or Drive write was performed. Drive
document reads used the explicitly requested connected tool; no app HTTP request
was executed. Existing clusters/incident files were not diagnosed or changed.

### Findings and STOP

No new P0/P1 defect was found by the completed offline checks. This does not
assess real server authorization, source correctness, operational health or
production security. S3B environment P1 remains OPEN; W05B/W09 unverified sources
remain unverified. Canonical metric/CSV policies, sensitive approver, CMS/legal
details, retention, true grant/source provenance and runtime integration remain
dependencies. S1 is deliberately incapable of promoting fixture claims to actual
CONFIRMED, HEALTHY, CONNECTED, complete reports or authorized operations.

STOP for GPT Web Batch Review. Do not start W10-S2. Three release gates remain false.
