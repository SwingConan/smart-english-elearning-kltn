# M04 Implementation Report — Evaluation and Course/Class Recommendation

## Baseline and branch

- Canonical baseline: `737b3856a286eb8d2b39973db3862287a7d7b59d`
- Branch: `feature/m04-evaluation-recommendation`
- Final implementation: the commit containing this report; the immutable pushed HEAD is recorded in the handoff response because a commit cannot embed its own hash.
- Scope: deterministic Placement L&R evaluation, Course recommendation, live ClassOffering projection, and rich Placement result UI.
- Explicitly excluded: official/estimated TOEIC conversion, AI inference, BKT updates, automatic enrollment, admin recommendation configuration UI, and M05/M06/M08 work.

## Architecture

M03 objective submission remains the authoritative first phase. After a submitted, owner-scoped, pre-enrollment Placement L&R attempt is confirmed, M04 runs in a separate Serializable transaction:

1. reuse or create one final `AttemptEvaluation` snapshot;
2. match active published Course profiles using final normalized Listening/Reading scores;
3. persist deterministic `CourseRecommendation` and typed `ruleReason` snapshots;
4. project current ClassOffering/enrollment availability at read time.

An M04 failure cannot roll back or hide the valid objective result. Placement history reads existing evaluation labels but does not lazily generate all historical rows.

## Schema and migration

Migration: `apps/api/prisma/migrations/20261001170000_m04_lr_normalized_metric/migration.sql`.

Exact additive semantic delta:

- add `EvaluationMetric.LR_NORMALIZED`;
- update `evaluation_bands_skill_check` so aggregate `LR_TOTAL` and `LR_NORMALIZED` bands require `skill IS NULL`, while skill-specific metrics require a skill.

No model/table/column is removed. Existing legacy metrics and data remain compatible.

This closes plan finding F-01: M04 does not overload legacy 10–990-like `LR_TOTAL` bands.

## Evaluation policy and band semantics

The seed leaves exactly one active L&R policy: `M04_PLACEMENT_LR_NORMALIZED_V1`. Its normalized bands are:

| Code | Vietnamese label | Interval |
| --- | --- | --- |
| `FOUNDATION` | Nền tảng | `[0, 45)` |
| `DEVELOPING` | Đang phát triển | `[45, 70)` |
| `ADVANCING` | Nâng cao | `[70, 100]` |

The engine validates full 0–100 coverage, order, gaps, overlaps, duplicate order indexes, and terminal 100. Overall percentage is derived only from objective `TestAttempt.score / maxScore`. Both final L/R skill scores are required. Strongest/weakest or balanced state and Vietnamese summary are deterministic. `lrTotalScore` and `aiExplanation` remain `NULL`.

This closes plan finding F-02: intermediate upper bounds are exclusive and only the terminal upper bound is inclusive.

## Lazy generation, idempotence, and concurrency

- Result access can backfill a missing evaluation/recommendation for an owner-scoped submitted attempt.
- Existing snapshots are returned unchanged.
- A completed M04 evaluation with zero Course matches acts as a valid no-match snapshot and is not regenerated on later reads.
- Evaluation and recommendation persistence share one Serializable transaction.
- Expected Prisma `P2002`/`P2034` races are retried up to three times and the winning snapshots are reread.
- Concurrent historical result E2E access converges to one `AttemptEvaluation` and one stable recommendation set.

## Recommendation algorithm and reason snapshot

Only active profiles of published Courses participate. Normalized criterion bounds are inclusive. `ALL` requires every criterion; `ANY` requires at least one. Empty criteria, missing required skills, invalid ranges, and estimated-TOEIC-only criteria do not produce a match. Matches sort by profile priority ascending and then stable Course ID. The first is `PRIMARY`; later matches are `SUPPLEMENTARY`.

Persisted `ruleReason` schema v1 contains:

- evaluation policy code and level;
- profile rule mode and priority;
- each skill value, min/max range, and matched flag.

The UI derives “Vì sao khóa học này phù hợp?” from this snapshot. Unsupported/malformed JSON returns a safe unavailable state rather than exposing or inventing an explanation.

## Live availability and enrollment semantics

`computeRegistrationState` is shared by public ClassOffering projection, recommendation projection, and enrollment validation. It derives `AVAILABLE`, `FULL`, `UPCOMING`, or `CLOSED` from the current Course publication, offering status, enrollment window, ACTIVE seat count, and capacity. Unlimited capacity is supported. An existing enrollment, including `PENDING_PAYMENT`, blocks a duplicate enabled action without consuming an ACTIVE seat. The Course recommendation remains historical; ClassOffering availability is deliberately live.

M02 enrollment rules remain unchanged: M04 never auto-enrolls. Result CTAs continue into existing Course/Class/Enrollment routes.

## API/result contract and partial failure

The existing Placement submit/result responses retain the objective fields and add:

- `durationMinutes`;
- `enhancement: { status: READY | ERROR, error }`;
- nullable `evaluation`;
- `recommendations[]` with Course, typed reason status, live offerings, capacity, registration state, and current learner enrollment state.

Ownership/not-found/in-progress remain request-level errors. A valid submitted result with M04 configuration/input failure returns HTTP success with the complete objective result, `enhancement.status=ERROR`, `evaluation=null`, and an empty recommendation list. The frontend keeps L/R results visible and offers a scoped retry.

## Frontend

- `PlacementResultPage` now provides attempt context, responsive skill cards, loading skeleton, scoped retry, empty-match state, catalog/history actions, and the required disclaimer.
- `PlacementEvaluationCard` renders level, whole-test percentage, balanced/strongest/priority-skill state, and deterministic summary.
- `CourseRecommendationCard` renders primary/alternative Courses, deterministic reason, live classes, instructor, modality, schedule, dates, sessions/periods, tuition, capacity, enrollment state, and non-dead CTAs.
- Placement history shows a stored internal level when one already exists; it does not trigger lazy generation.
- Learner copy contains no policy/profile/database terminology and no fake TOEIC estimate.

## Seed/demo scenarios

The idempotent seed:

- deactivates the legacy demo L&R policy and activates one M04 normalized policy with three bands;
- publishes four distinct recommendation profiles: general foundation, Listening focus, Reading focus, and advanced L&R;
- provides multiple deterministic matches with stable priority ordering;
- includes available, closed/in-progress, no-actionable-class, and full/already-enrolled offering scenarios;
- preserves stable project-authored M03 Placement forms and demo learners.

The required seed password is supplied only through `SEED_DEFAULT_PASSWORD`; no fallback credential was added.

## Files changed by area

- Prisma: schema enum, additive migration, deterministic seed.
- Evaluation: domain errors, pure engine/tests, service/module.
- Recommendation: engine/tests, typed reason parser, snapshot/service/module and concurrency tests.
- Availability: shared registration-state helper/tests plus ClassOffering and enrollment reuse.
- Placement: module orchestration, two-phase result enrichment, history projection, unit and E2E coverage.
- Web: Placement types, result page, evaluation/recommendation components, history label, frontend tests.
- Documentation: this report.

## Verification

| Command | Result |
| --- | --- |
| `npm run prisma:validate` | PASS |
| `npm run prisma:generate` | PASS |
| `npm run prisma:migrate:deploy` | PASS — M04 migration applied |
| `npm run prisma:drift-check` | PASS — no difference detected; migrations replayed against Prisma shadow database |
| `npx prisma migrate status --config prisma.config.ts` | PASS — database schema up to date |
| `npm run prisma:seed` twice with local `SEED_DEFAULT_PASSWORD` | PASS — idempotent |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm run test` | PASS — API 307/307; Web 191/191 |
| `npm run test:e2e -w @smart-elearning/api` | PASS — 82/82 |
| `npm run build` | PASS |
| `git diff --check` | PASS |

Security/regression coverage includes guest protection, owner filters, guessed/foreign attempt denial, answer-key stripping, two-phase submit, BKT isolation, concurrent lazy generation, malformed reason fallback, M02 enrollment semantics, and the existing catalog/LMS/assessment suites.

## Known limitations and non-blocking follow-ups

- Recommendation configuration remains seed/admin-data driven; a full admin rule editor is intentionally outside M04.
- Recommendation snapshots preserve Course matching, while Course copy and offering availability are live projections by design.
- Vite reports a non-blocking main bundle size warning around 532 kB; future route-level splitting can reduce it.
- Concurrent PostgreSQL E2E activity emits an upstream `pg` deprecation warning; all suites pass.
- During this review-fix verification, two full E2E attempts observed the existing M03 concurrent-start test surface PostgreSQL serialization `40001` as an adapter error; the isolated Placement suite then passed 12/12 and the final unchanged full suite passed 82/82. No M03 concurrency/business code was altered in this targeted M04 pass.
- The tested partial-failure path intentionally logs the semantic M04 error code server-side without leaking internals to the learner.

No blocking issue remains. There was no deviation from the specified M04 business boundary. The migration additionally updates the pre-existing metric/skill CHECK constraint because adding `LR_NORMALIZED` without it would make valid aggregate bands impossible.

## GPT implementation review fixes

- Reviewed old HEAD: `6b8fe3e52d0e3264347091ad598b269fe831453d`.
- Final fix HEAD: recorded in the immutable final handoff response because the commit cannot embed its own hash.
- F-01: PRIMARY learner copy changed from the evaluative “Khóa học phù hợp nhất” to “Khóa học phù hợp chính”. The Placement frontend regression asserts the approved wording and forbids the old wording.
- F-02: persisted recommendations now parse `ruleReason` once and project by kind, saved `profile.priority`, then Course ID. Malformed reasons use a deterministic last-priority fallback without regeneration. A RecommendationService test proves priority 100 Course Z precedes priority 200 Course A among supplementary rows.
- F-03: recommendation Course level, skill scope, and offering modality reuse `courseLevelLabel`, `skillScopeLabel`, and `modalityLabel` from the M02 catalog display helpers. Frontend assertions verify `Nền tảng · Listening & Reading` and forbid `FOUNDATION · LR` product copy.
- F-04: live offerings now sort actionable AVAILABLE classes first, followed deterministically by registration state, class start, and ID. An existing enrollment remains non-actionable and stays visible; it is not elevated above a newly actionable class. A service test proves a later AVAILABLE/actionable class precedes an earlier CLOSED class.
- Focused verification: RecommendationService 4/4 and Placement frontend 13/13 PASS.
- Full verification after the fixes: API 305/305, Web 190/190, E2E 82/82 PASS, together with Prisma, seed, lint, typecheck, build, and diff checks listed in the final handoff.
- No schema change, migration, recommendation regeneration, enrollment-rule change, or M05/M06/M08 boundary expansion was introduced by this review-fix pass.

## Manual Visual Gate fixes

- Initial Product Owner Visual Gate verdict: **FAIL** at reviewed HEAD `de1f30f4c8e424e36306e5524b53edf6d3e3d4b0`; this section records the corrective implementation, not a replacement Visual Gate approval.
- VG-F01: equal Listening/Reading results no longer tell learners that their skills are “đang cân bằng” or “ở trạng thái cân bằng”. The result card now says “Kết quả Listening và Reading hiện tương đương.” A 0/0 FOUNDATION evaluation summary says “Cả hai kỹ năng đều cần được củng cố từ nền tảng.” Strongest/weakest remain unset, while internal `BALANCED` semantics and all score/level calculations remain unchanged.
- VG-F02: the Student workspace brand now links to `/`, and the header exposes a visible “Trang chủ” link to `/`. “Khóa học của tôi” remains available at `/student/enrollments`; authentication navigation and the Placement exam layout were not changed.
- Focused regression verification: evaluation engine 21/21 PASS; Placement plus M02 frontend 22/22 PASS. Tests explicitly reject the old learner-facing balance phrases and assert the home/workspace link destinations.
- Full verification after the fixes: Prisma validate/generate/migrate/drift/status PASS; seed twice PASS; lint PASS; typecheck PASS; API 307/307 PASS; Web 191/191 PASS; final full E2E retry 82/82 PASS; build PASS; diff check PASS.
- E2E observation: the first full run reached 81/82 and an isolated Placement retry reached 11/12 because the existing M03 concurrent-start case surfaced PostgreSQL `40001 TransactionWriteConflict`. An unchanged full-suite retry passed 82/82. No M03 concurrency or Placement business logic was modified.
- Final corrective commit HEAD is recorded in the immutable handoff response because a commit cannot embed its own hash.
- No schema, migration, API, evaluation scoring, recommendation, enrollment, M05, M06, or M08 scope was added.

## Manual Visual Gate handoff

Product Owner should inspect, without treating this report as a Visual Gate approval:

1. `/placement` — complete the wizard as the seeded STUDENT and submit a low/mixed result.
2. `/placement/attempts/:attemptId/result` — objective L/R cards, internal level, strongest/priority skill, reason text, primary and supplementary Courses.
3. Same result at mobile width — no horizontal overflow; class details and CTAs remain usable.
4. A result matching a Course with available classes — current seats and “Xem và đăng ký lớp”.
5. Seeded full/already-enrolled and no-actionable-class Courses — truthful disabled/current-enrollment presentation.
6. `/catalog/:slug` and `/classes/:id` via result CTAs — existing product flow continues correctly.
7. `/placement` history after submission — stored internal level is visible and result revisit works.
8. Temporarily unavailable M04 configuration in a controlled test environment — objective result remains visible with scoped retry.

No M05, M06, or M08 scope was implemented.
