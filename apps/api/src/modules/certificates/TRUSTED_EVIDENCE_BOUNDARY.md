# W09-DF-S3A: trusted-reader integration boundary

This slice defines server-owned read ports and an offline-testable composition of
S2 normalizers with the S1 evaluator. It provides no concrete repository, controller,
Nest provider registration, ORM query, authentication implementation or certificate
operation. Existing S1/S2 code remains unchanged.

## Trust boundary

`TrustedEvidenceRepositories` must be supplied by server dependency injection.
`ServerReadPrincipal` must come from authenticated server session state, never a
request body. The request carries selectors only; source payloads, role flags,
approval booleans and S2 snapshots are not forwarded to the read ports.

Authorization, enrollment/class/version binding, approved policy, independent
approval lineage and each W03/W06/W07 projection have separate typed read ports.
In S3A they are controlled in-memory dependencies only. Their TypeScript types,
`AUTHORIZED`, `COMPLETE`, revision strings and fixture approval fields are NOT
cryptographic or database verification. A malicious or incorrectly implemented
repository can violate the contract. Offline validation cannot authenticate its
assertions.

Every result, including `ELIGIBLE_FOR_REVIEW`, therefore carries
`assurance: OFFLINE_REPOSITORY_CONTRACT_ONLY`, `runtimeVerified: false` and
`serverIntegrationRequired: true`. S2's internal `SERVER_READ_SNAPSHOT` symbol only
distinguishes in-process composition from serialized input; it grants no authority.
No output is an issuance decision or academic approval.

## Composition and fail-closed behavior

The reader authorizes before opening source reads, verifies exact learner,
Enrollment, ClassOffering, CourseVersion and policy pins, then reads the binding,
policy, independent lineage and selected projections. It rechecks authorization
and the manifest before returning an assessment. Read envelopes must identify the
same manifest, expected revision and complete record set. Observed source absence
is explicit (`sourcePin: null`) and remains pending when a mandatory criterion
requires it. Detected unavailable, contradictory, incomplete, stale or unauthorized reads
cannot produce an eligible assessment.

S2 enforces publication/finalization and authority lineage for W03, the complete
approved correction chain for official W06 learner attendance, and matching W07
application/admission/entitlement links with an explicit approved validity-rule
resolution. A reviewed assignment alone is not published. Provisional receipts,
teacher hours and Meet clicks cannot substitute for official learner attendance.
ACTIVE enrollment alone does not establish historical entitlement validity.

Academic resolutions remain explicit, independently sourced inputs; this reader
does not implement an unapproved grade-selection, rounding, attendance-denominator,
retake, exemption or entitlement-time policy. It never derives them from raw rows.
There are no exemption loaders in this slice; absent exemption authority is not
invented. Real academic rules A1-A5 and approved applicability remain dependencies.

Repository values are copied at read boundaries; mutable aliases, getters, class
instances and malformed data cannot silently become a mutable S2 snapshot. Errors
return sanitized failure reasons. The scoped read handle is released on success or
failure; failed release suppresses the assessment. There are no automatic retries,
sweeps or writes.

## Freshness obligations for S3B

The manifest must cover all relevant source heads, not only one selected grade:
enrollment/class/version binding, policy applicability, current publication/final
revisions, attendance sessions/windows/receipts/corrections, entitlement decisions,
approval authority and academic resolutions. Completeness must include pending,
rejected and competing correction records needed to establish an unambiguous
history. A filtered-away contradiction cannot be labelled complete.

Manifest and authority epochs must change on every relevant transition, including
A-to-B-to-A changes. `readManifest()` at the final check must observe the current
authorized heads, not simply repeat an old snapshot's cached header. Each source
read must be bound to the manifest's coherent view. A transaction design must
explain how this coherent view and the final current-head/authorization check are
obtained together; two unrelated queries with matching fixture markers are not
sufficient. Returned evidence is pinned to that read boundary, not guaranteed
fresh indefinitely or safe for a later issuance transaction.

S3A detects reported head/revision changes, scope mismatches, changed authority
epochs and missing completeness. It cannot detect a provider changing actual rows
while reusing every manifest, revision and authority pin. A controlled negative
contract example documents this limitation and still asserts `runtimeVerified:
false`. Implementing and independently verifying these obligations requires a
separately authorized S3B integration; it is not a runtime PASS from S3A.

## Required future integration verification (not executed)

- Authenticate the principal and enforce real scoped RBAC before reads; establish
  how revocations and concurrent scope changes fence the final read boundary.
- Read actual W03 published immutable submission/attempt revisions and independently
  verified final/publication decisions without invoking quiz service sweeps.
- Read exhaustive W06 official learner records and correction lineage, verifying
  independent reviewer authority and revision precedence from durable sources.
- Read W07 enrollment/application/entitlement decisions, actual decision authority
  and an approved historical/effective-time rule; leave unknown rules pending.
- Establish policy/CourseVersion approval and independent rule-resolution provenance;
  do not turn projection `approved: true` into a verified decision.
- Demonstrate snapshot/head consistency, ABA detection, deletion/absence handling,
  concurrent correction/publication/revocation and error cleanup against a separately
  approved isolated environment. This slice performs no PostgreSQL/HTTP access.

## Rollback and stop

Only four new S3A files are added: the contracts, reader, its isolated spec and this
boundary document. No module registration or public route changes. A future
authorized rollback can remove those four files after preserving evidence; no
database rollback is required. Do not overwrite existing S1/S2 or unrelated work.

STOP after the S3A batch report for GPT Web review. S3B, issuance, UI/PDF, real
grants and any database access remain outside this authorization. W05B status and
all release gates remain unchanged/false.

## Consolidated S3A development receipt (2026-11-05)

### Authority and Stage A

Live connected Drive reads succeeded before coding:

- [Master DEC068](https://docs.google.com/document/d/1B9fzuLdLQ3IOeLno5y1uMICzhvVO91O0T7RSZ5PWM-s/edit), modified `2026-11-05T08:23:17.164Z`.
- [Catalog BR110](https://docs.google.com/document/d/1iNQ_lHOgllHxCpIJGlpyMy0XU9FUWmbOvzN96J6e0Qw/edit), modified `2026-11-05T08:23:54.692Z`.
- [Artifact037](https://docs.google.com/document/d/1pTZBJYCOcf6NnnyV-J-oByYZ_1HjSVr1ZGj5QO_-jk8/edit), modified `2026-11-05T08:24:38.372Z`.

Current user authority is the bounded code-only S3A request. The documents do not
provide numeric thresholds or close unresolved A1-A5 academic rules. Synthetic
test scales, dates and minimum values are test data only.

Stage A at `2026-11-05T10:31:13.306102Z` observed:

- Branch `feat/v2-se-sw-01-pilot-main`, HEAD `d9ef6bcc70986e9f05e1a7c2c84ed0317f693ed9`.
- 417 existing dirty/untracked entries; none of the four S3A target files existed.
- Seven S1/S2 files matched their prior SHA-256 pins.
- 11,353 protected files, 13 media and all 34 migration hashes matched their
  existing preservation receipts. No target-file conflict was observed.

### Changed files

Only the following new files were written beneath this certificates module:

| File                              | Purpose                                                                  | Source SHA-256 after final test run                                |
| --------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `trusted-evidence.contracts.ts`   | Read authorization, scoped source ports, revision/completeness contracts | `e5c5a229b59667358de174b25c83de9a84969f7cc773f351daff3c5375ec79c8` |
| `trusted-evidence-reader.ts`      | Scope/freshness checks and S2-to-S1 composition                          | `32d454b2e00d6c199f3da2a1014a401ba5f13efbef5c94756b659e662a9c73fc` |
| `trusted-evidence-reader.spec.ts` | Controlled in-memory repositories and negative/race scenarios            | `f100bdbefbaaa75b7e59e5d6f224364b55903ab0d4a54f3c5b29812fa62cabc3` |
| `TRUSTED_EVIDENCE_BOUNDARY.md`    | Integration obligations and this consolidated receipt                    | Self-hash omitted to avoid a circular receipt                      |

No S1/S2 adjustments were necessary. The existing module registration and source
services were not changed.

### Actual checks and failure history

Final run used local Jest with `--config jest.config.cjs --runInBand --no-cache
--runTestsByPath` and the three certificates specs. The wrapper rejected imports
of PostgreSQL, Prisma and Nest runtime modules and rejected TCP/TLS connection
attempts. No fake time or increased test timeout was used.

| Check                                | Actual result                                  |
| ------------------------------------ | ---------------------------------------------- |
| S1 evaluator                         | 30 PASS                                        |
| S2 normalizers                       | 89 PASS                                        |
| S3A reader composition               | 44 PASS                                        |
| Total                                | 3 suites / 163 tests PASS; 0 failed; 0 skipped |
| Scoped strict TypeScript             | Exit 0                                         |
| Scoped ESLint                        | Exit 0, no errors/warnings                     |
| Offline guard                        | 0 forbidden runtime imports; 0 socket attempts |
| Real source/DB/HTTP/RBAC integration | NOT REACHED; forbidden in S3A                  |

Final raw Jest summary:

```text
PASS src/modules/certificates/evidence-adapters.spec.ts (7.754 s)
PASS src/modules/certificates/trusted-evidence-reader.spec.ts
PASS src/modules/certificates/completion-evaluator.spec.ts
Test Suites: 3 passed, 3 total
Tests:       163 passed, 163 total
Snapshots:   0 total
Time:        8.778 s
S3A_OFFLINE_GUARD {"blockedImports":0,"socketAttempts":0}
```

Typecheck invoked local `tsc --noEmit --incremental false --strict --skipLibCheck
--target ES2023 --module commonjs --types node,jest` on the nine S1/S2/S3A
TypeScript files. Local ESLint checked those same files. Formatting touched only
the four new S3A files.

Earlier actual failures were retained in the execution transcript: the first
S3A suite did not compile (`TS2540`, attempted assignment to readonly fixture
`applicability`); S1/S2's 119 tests passed in that run. The new fixture now replaces
the policy record immutably. Initial scoped lint then found an unused
`SourceSelection` import in the new spec; it was removed. Assertions were not
removed or weakened. A preservation command using `python` could not start
because that command was not available; the read-only hash check was completed
using Node instead. These were development/check-tool failures, not DB failures.

Coverage includes unauthorized actor/session/scope, enrollment/class/version
joins, unverified flags and S2 results, incomplete/stale envelopes, missing source,
unpublished grade, conflicting publication lineage, mandatory graded zero,
unknown applicability, full correction precedence and competing revisions,
mismatched entitlement, changed source/lineage heads, ABA epochs, authorization
revocation, reader/cleanup errors and mutable-alias isolation. The provider
contract-violation case explicitly demonstrates the remaining freshness boundary.

### Preservation receipt and open findings

Read-only post-test check at `2026-11-05T10:42:44.338Z` observed the same branch,
HEAD and index SHA-256. Dirty/untracked count is 421: the original 417 plus the
four new S3A files. No prior working-tree content changed:

- 958 Git-enumerated files excluding the four allowed additions have the same
  aggregate path/content SHA-256 before and after:
  `7d853d5a0a9db03dcc08b42af151bfc115a40e8c1db32f82e2f1cf3990713e1c`.
- Index SHA-256 before/after:
  `9b01f017f40047492a81680c4badd8e5b9596a8eefa4cdf6f56af5e87476ba41`.
- Seven S1/S2 hashes match; protected-file differences: 0 of 11,353;
  media differences: 0 of 13; migration differences: 0 of 34.
- Git inspections disabled optional locks. No Git mutation, source service edit,
  PostgreSQL/HTTP access, migration, cluster or W05B action was performed.

No new P0/P1 defect was detected by the completed offline checks. This is not an
assessment of real source/RBAC correctness. Authenticated lineage, coherent actual
source reads, revocation fencing, current-head/ABA behavior and approved academic
resolutions remain unverified integration dependencies for S3B. A provider that
reuses all pins after changing data cannot be authenticated by this pure reader.
Unresolved academic rules remain fail-closed, not implemented defaults.

W05B RC01-RC09 remain 0 PASS / 0 FAIL / 9 NOT REACHED; W05B closeout DEFERRED;
migrations33/34 UNACCEPTED. `MEDIA_QA_PASS=false`, `ACADEMIC_APPROVED=false`,
`PUBLISHED=false` remain unchanged. No real DB-row integrity is claimed from hashes.

STOP: hand off S3A for GPT Web Batch Review. Do not execute S3B automatically.
