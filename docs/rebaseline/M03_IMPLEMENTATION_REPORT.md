# M03 Implementation Report — Placement L&R End-to-End

## Baseline and branch

- Canonical baseline: `8eb945c2394bf50ac5cbb687db44b5eea2892df6`
- Branch: `feat/m03-placement-lr`
- Scope: M03 Placement Listening & Reading only
- Explicitly excluded: M04 evaluation/recommendation execution and M05 four-skill Placement

## Commits

- `bd11314` — `feat(m03): add placement data foundation and seed`
- `76ed482` — `feat(m03): implement placement orchestration`
- `6c88328` — `feat(m03): build placement wizard and exam workspace`
- Final verification/tests/report commit: this report's containing commit

## Schema and migration

Exactly one additive M03 migration was created:

- `apps/api/prisma/migrations/20261001090000_m03_placement_lr/migration.sql`

It adds:

- `PlacementSelfLevel` (`UNKNOWN`, `BEGINNER`, `BASIC`, `INTERMEDIATE`, `GOOD`)
- nullable `TestAttempt.placementSelfLevel`
- nullable `TestAttempt.placementGoalScore`, constrained to `10..990` when present
- `TestQuestionGroup` for ordered Listening/Reading groups
- nullable `TestQuestion.groupId` with `ON DELETE SET NULL`, preserving ungrouped legacy tests
- `Test -> TestQuestionGroup` lifecycle with `ON DELETE CASCADE`

No old migration was modified.

### Partial unique index

The baseline already contained the required same-form defense-in-depth index, so M03 did not create a redundant duplicate. The M03 migration documents its exact existing definition:

```sql
CREATE UNIQUE INDEX "test_attempts_placement_in_progress_key"
ON "test_attempts"("testId", "learnerId")
WHERE "status" = 'IN_PROGRESS'
  AND "enrollmentId" IS NULL
  AND "classAssessmentId" IS NULL;
```

This index prevents duplicate active pre-enrollment attempts for the same learner and Test. It cannot enforce same-mode uniqueness across different Test rows because a PostgreSQL index on `test_attempts` cannot join to `tests.placementMode`. The authoritative cross-form invariant therefore remains the Serializable service transaction.

## Placement APIs

- `GET /api/placement/config` — public, product-safe policy/config; no Test IDs
- `POST /api/placement/attempts/start` — STUDENT start/resume
- `GET /api/placement/attempts/:id/exam` — owner-only safe grouped exam
- `PUT /api/placement/attempts/:id/answers/:testQuestionId` — owner-only autosave
- `POST /api/placement/attempts/:id/submit` — owner-only idempotent objective submit
- `GET /api/placement/attempts/:id/result` — owner-only submitted result
- `GET /api/placement/history` — current learner's completed Placement history

The exam serializer does not return `isCorrect`, correct flags, `explanation`, `pointsAwarded`, evaluation, recommendation, or Listening `stimulusText`.

## Form policy and concurrency

Server-only deterministic L&R mapping:

| Self level | Form |
| --- | --- |
| `UNKNOWN` | Core |
| `BEGINNER` | Foundation |
| `BASIC` | Foundation |
| `INTERMEDIATE` | Core |
| `GOOD` | Advanced |

`FOUR_SKILLS` returns typed `PLACEMENT_MODE_NOT_AVAILABLE` in M03.

Start/resume executes in a Serializable transaction with retry for Prisma `P2002`, `P2003`, and `P2034`. The existing attempt query uses learner + pre-enrollment context + `IN_PROGRESS` + `Test.purpose=PLACEMENT` + `Test.placementMode=LR`, not the newly selected Test ID. Changing self-level therefore resumes the existing active L&R attempt. The concurrency E2E test sends two simultaneous starts and verifies they converge to one database row and one attempt ID.

## Expiry and scoring

`expiresAt` is calculated from immutable server `startedAt + Test.timeLimitMinutes`. Exam read, save, submit, and start/resume encounters guard expiry. An expired active attempt is lazily finalized idempotently before a result transition or a new start.

Submit scores the persisted objective answers server-side and upserts exactly two `AttemptSkillScore` rows:

- `LISTENING`
- `READING`
- status `FINAL`
- source `OBJECTIVE_AUTO`
- raw, maximum, and percentage-normalized scores
- `estimatedToeicScore = NULL`

The result is explicitly internal/non-official. It contains no M04 level, strongest/weakest conclusion, recommendation, AI explanation, or fake four-skill total.

## BKT and M04 isolation

Placement uses a separate `PlacementService` submit path and never calls the legacy `AssessmentStudentService.applyBktObservations` flow. Unit and E2E verification confirms Placement submit creates:

- zero `LearnerSkillState`
- zero `MasteryHistory`
- zero `AttemptEvaluation`
- zero `CourseRecommendation`

## Authentication return flow

The guest wizard stores a versioned, sanitized session draft. `RegisterPage` now preserves only a `safeReturnUrl`, forwards it to `/login?registered=1&returnUrl=...`, and `LoginPage` preserves it on the registration link. External return paths remain rejected by the existing safety helper.

## Frontend

- Public `/placement` three-step wizard with goal presets/custom validation, self-level choice, confirmation, real duration, readiness checkbox, and disabled four-skill option
- Protected focused exam workspace at `/placement/attempts/:attemptId/exam`
- Protected objective result at `/placement/attempts/:attemptId/result`
- synchronous blank-tab opening before the async start request
- BroadcastChannel with storage-event fallback for submission handoff
- all questions in a group visible together
- Reading passage visible; Listening transcript hidden
- browser SpeechSynthesis development/demo playback for project-owned Listening scripts
- server-persisted answers with Saving/Saved/Error UI
- server-authoritative countdown with 5-minute and 1-minute warnings
- local, browser/device-specific mark-for-review state
- desktop sticky navigator and mobile collapsible navigator
- completed attempt history with result revisit links

## Seed

The idempotent development seed adds three published L&R forms:

- Foundation — 20 minutes
- Core — 25 minutes
- Advanced — 30 minutes

Each form has four ordered groups (two Listening and two Reading), eight realistic project-authored objective questions, stable IDs, and four options per question. Listening uses documented browser SpeechSynthesis fallback with project-owned scripts; Reading uses project-authored passages. No official/copyrighted TOEIC item is claimed.

### CI seed prerequisite

- CI requires the deterministic application seed after migrations and schema drift checks, before API E2E, because Placement form selection deliberately depends on the curated Foundation, Core, and Advanced records with stable policy IDs.
- GitHub Actions on `aa7285530ce0632c2f487e05d9585921fae1b531` applied migrations but did not seed; all nine Placement E2E tests then failed from missing grouped form data, unavailable start policy, and the missing Advanced test foreign key. Other E2E suites passed.
- GitHub Actions run #24 on `c403830afccb1e3d99601187a486a217de529116` reached the new seed step but exposed that CI had not configured the required `SEED_DEFAULT_PASSWORD`; later quality and E2E steps therefore did not run.
- The seed step now scopes a CI-only password to that step. Local verification includes two consecutive seed runs followed by the complete API E2E suite; the final GitHub result remains pending until the new Actions run completes.

## Verification

| Command | Result |
| --- | --- |
| `npm run prisma:validate` | PASS |
| `npm run prisma:generate` | PASS |
| `npm run prisma:migrate:deploy` | PASS — all eight migrations applied to a clean isolated verification schema |
| `npx prisma migrate diff --config prisma.config.ts --from-empty --to-migrations prisma/migrations --script` | PASS — clean migration replay |
| `npm run prisma:drift-check` | PASS — no difference detected |
| `npm run prisma:seed` (twice consecutively) | PASS — idempotent on the clean isolated verification schema |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm run test` | PASS — API 267/267; Web 189/189 |
| `npm run test:e2e -w @smart-elearning/api` | PASS — 80/80 after migrations and two seed runs on the clean isolated verification schema |
| `npm run build` | PASS |
| `git diff --check` | PASS |

Placement-specific evidence:

- API unit: 14/14 across policy and service suites
- API E2E: 9/9
- Web targeted suite: 24/24 across Placement, auth, and M02 product navigation
- Existing M02 in-class assessment and legacy suites remain green in the full runs

## Visual evidence and Demo Launch Sheet

Automated interactive screenshot capture is **NOT AVAILABLE** in this environment. No screenshots were fabricated.

- Web: `http://localhost:5173/placement`
- API: `http://localhost:3000/api`
- Account: `student.demo@smart-elearning.local`
- Password: use the local development seed value (`SEED_DEFAULT_PASSWORD`); in the verified environment it is `smartelearningapp`
- Launch: run `npm run dev`, open the Web URL, choose target and self-level, confirm readiness, then sign in if prompted and click **Bắt đầu**
- Expected: a new tab opens the server-selected L&R form; answers autosave; refresh resumes the same attempt and timer; submit shows the internal L/R result; return to `/placement` to revisit it in history

## Known limitations and warnings

- Mark-for-review is intentionally local to the browser/device for M03; answers are server-persisted.
- Listening demo audio uses browser SpeechSynthesis, so voice quality/availability depends on the browser/OS.
- Vite reports a non-blocking production bundle warning (`~521 kB` main chunk) and recommends future code splitting.
- E2E emits a `pg` deprecation warning during concurrent client activity; all E2E tests pass.
- The legacy BKT negative-path E2E intentionally logs its tested probability validation exception; the suite passes.
- M04 evaluation/recommendation and M05 four-skill Placement remain deferred and were not implemented.

## Repository safety

Existing untracked DOCX/XLSX/Markdown/UIdemo reference artifacts were not staged, modified, deleted, or committed. Only the M03 feature branch is intended for push; `main` is not pushed or merged by this work.
