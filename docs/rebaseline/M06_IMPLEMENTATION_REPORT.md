# M06 Implementation Report — In-class Assessment

## Candidate

- Base: `main` at `73de4c997f7515aada804ce01ccd80068224b968`
- Branch: `feature/m06-in-class-assessment`
- Scope: in-class assessment scheduling, four-skill learner attempts, instructor-final productive grading, truthful result/history projection
- Out of scope: M07/M08, AI final grading, a second learner assessment area, changes to Product Owner reference artifacts

## Locked decisions implemented

- `Test` remains reusable content; `ClassAssessment` is the class assignment/schedule.
- Active duplicate assignment is blocked by a partial unique index on class and test.
- Class attempt numbering is assignment-scoped; non-class and Placement compatibility is retained through partial indexes.
- Effective deadline is the earlier of the attempt time limit and assignment close time.
- Listening/Reading are scored objectively; Speaking/Writing remain pending until instructor-final rubric grading.
- Persisted productive scores use Prisma `Decimal` and `ROUND_HALF_UP` at two decimal places.
- One instructor-final evaluation is enforced per answer; editing a final judgment requires an explicit edit action and updates the existing evaluation.
- IN_CLASS submissions do not update BKT mastery. Legacy adaptive/BKT verification uses `PRACTICE_MOCK` fixtures.

## Database and migration

Migration: `20261003180000_m06_in_class_assessment`

- Widens `TestAnswer.pointsAwarded` to `DECIMAL(10,2)`.
- Adds the partial uniqueness safety net for instructor-final evaluations.
- Adds the partial uniqueness safety net for active class assignments.
- Replaces the legacy global enrollment attempt-number key with assignment-scoped and non-class partial keys.
- Preserves Placement-specific indexes and existing data.

## API implementation

Instructor routes under `/api/instructor/classes/:classOfferingId/assessments` provide:

- assigned-class workspace and published IN_CLASS test selection;
- create/read/update scheduling with ownership, course, window, duplicate, and immutability validation;
- submission grading queue and grading detail;
- draft/final/edit-final rubric grading;
- protected learner-audio playback.

Student routes provide:

- real assignment-based assessment listing;
- serializable start/resume with assignment-scoped attempt limits;
- lazy expiry and effective-deadline finalization;
- grouped, answer-key-free four-skill attempt projection;
- objective/text autosave and protected audio upload/playback;
- productive-response completeness checks on manual submit;
- objective skill-score persistence without IN_CLASS BKT effects;
- truthful pending/final skill and overall result projection.

## Product UI

- Student assessment cards show stage, availability window, attempts, status, skills, and result history entry points.
- Attempt UI renders grouped Listening, Reading, Speaking, and Writing tasks, protected stimuli, autosave state, timer, recording status, and a submit confirmation dialog.
- Result UI separates per-skill final/pending/missing states and withholds overall total until all four skills are final.
- Instructor teaching cards link to a narrow class assessment workspace.
- Instructor scheduling, grading queue, and rubric grading detail pages use the established responsive project UI.

## Deterministic demo data

The idempotent M06 seed creates three separate published IN_CLASS tests and assignments:

- periodic: closed, completed, fully reviewed;
- midterm: open, submitted with Speaking/Writing pending;
- final: upcoming.

Each test has a separate identity and 11 project-owned tasks: 4 Listening, 4 Reading, 2 Speaking, and 1 Writing. The seed reuses approved M05 project-owned media/content, creates real attempts/answers/evaluations/criterion scores/skill scores, and resets the stable demo grading state deterministically on rerun.

## Test coverage

- Unit coverage includes assignment list projection, objective scoring, transaction retry bounds, ownership, exact weighted Decimal grading, rubric range rejection, and explicit final-edit protection.
- Web coverage includes legacy objective flows plus four-skill Writing/Speaking controls, submit confirmation, and pending-total truthfulness.
- M06 E2E covers deterministic assignment projection, answer-key stripping, pending versus final results, role/ownership enforcement, final evaluation uniqueness/edit semantics, and protected audio.
- Existing adaptive/BKT E2E fixtures were classified as `PRACTICE_MOCK` so the M06 IN_CLASS isolation rule is explicit and regression-tested.

## Verification

Final candidate verification:

- `npm run prisma:validate` — PASS
- `npm run prisma:generate` — PASS
- `npm run prisma:migrate:deploy` — PASS; no pending migrations
- `npm run prisma:status` — PASS; database up to date
- `npm run prisma:drift-check` — PASS; no difference
- `npm run seed` twice — PASS; deterministic/idempotent
- `npm run lint` — PASS
- `npm run typecheck` — PASS
- `npm run test` — PASS: API 331/331, Web 199/199
- `npm run test:e2e -w @smart-elearning/api` — PASS: 88/88
- `npm run build` — PASS
- `npm run check:m05-manifest` — PASS
- `git diff --check` — PASS

## Known non-blocking warnings

- An isolated clean-database replay could not be executed because the local PostgreSQL role does not have `CREATEDB`; the attempt stopped before creating a database. Migration deploy, migration status, and schema drift verification against the existing development database all pass.
- Vite reports the existing large-bundle advisory (about 567 kB for the main chunk).
- PostgreSQL `pg` emits the known client-query deprecation warning during E2E.
- Expected negative-path logs remain in Placement and invalid-BKT tests.

No schema drift, merge, `main` push, M07/M08 work, or Product Owner artifact mutation is part of this candidate.
