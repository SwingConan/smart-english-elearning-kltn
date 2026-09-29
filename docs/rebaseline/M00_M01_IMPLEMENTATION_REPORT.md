# M00/M01 Implementation Report — TOEIC LMS Rebaseline

Date: 2026-09-29  
Scope: M00 Safety Baseline + M01 Schema Migration Foundation only  
Implementation commit: `d394c4ba11b04e3757deecdb8bf308ea604ad6c9`

## A. Git baseline and recovery

- Starting branch: `main`
- Starting HEAD: `e7dc2485478f67d637851ab8469303cf1437446e`
- Implementation branch: `feat/m01-toeic-rebaseline-data-model`
- Recovery point: immutable starting commit plus the implementation commit above; no repository ZIP was created by this work.
- Pre-existing untracked file preserved and excluded from commits: `smart-english-elearning-kltn-current.zip`.
- No reset, force checkout, force push, dependency upgrade, or secret commit was performed.

## B. Source-of-truth handling

Implementation was checked against the repository, Data Dictionary v1.0, Domain Model/ERD v1.0, Architecture v1.0, Functional Requirements v1.0, and the rebaseline roadmap. Data Dictionary v1.0 controlled field names, types, nullability, relationships, enums, and constraints.

No schema conflict was found between the implementation request and Data Dictionary v1.0. The workbook labels itself DRAFT, but this implementation was explicitly authorized by the implementation request. Compatibility defaults used by legacy create flows are listed under known issues for reviewer attention.

## C. Files changed

### Prisma/schema

- `apps/api/prisma/schema.prisma`
  - Added the M01 TOEIC assessment, evaluation, and recommendation domain.
  - Kept all BKT/Adaptive models and added `LEGACY/FROZEN` documentation.
  - Kept legacy `QuestionType`/`TestType` columns as nullable physical compatibility fields.

### Migration

- `apps/api/prisma/migrations/20260929050000_m01_toeic_rebaseline_data_model/migration.sql`
  - Additive/rework migration with explicit backfills, fail-fast mapping guards, checks, FKs, indexes, and context-specific partial unique indexes.

### Seed

- `apps/api/prisma/seed.ts`
  - Added TOEIC skill metadata, explicit class metadata, L&R placement mode, ClassAssessment, internal evaluation policy/bands, and deterministic course recommendation criteria.
  - Retained legacy BKT seed records required by the existing demo architecture.

### Backend compatibility

- Assessment services, controllers, DTOs, and module under `apps/api/src/modules/assessments/`.
- Course/ClassOffering services and DTOs under `apps/api/src/modules/courses/` and `apps/api/src/modules/classes/`.
- Legacy knowledge-model ownership guard in `apps/api/src/modules/knowledge-model/knowledge-model-instructor.service.ts`.
- `assessment-compatibility.interceptor.ts` preserves the VS03 response field `type` while also exposing the new `responseType`/`purpose` fields.

### Tests

- Updated affected assessment, learning, BKT, and knowledge-model unit/E2E fixtures to supply the new required ownership and classification fields.
- Added a regression assertion that newly created attempts persist `learnerId`.

### Documentation

- This report: `docs/rebaseline/M00_M01_IMPLEMENTATION_REPORT.md`.

No frontend source file was changed.

## D. Schema delta

### New enums

`ToeicSkill`, `CourseSkillScope`, `ClassModality`, `QuestionResponseType`, `TestPurpose`, `PlacementMode`, `AssessmentStage`, `AnswerEvaluationSource`, `AnswerEvaluationStatus`, `SkillScoreStatus`, `SkillScoreSource`, `AttemptEvaluationStatus`, `EvaluationMetric`, `CriterionRuleMode`, `CourseRecommendationKind`, and `StudyRecommendationTarget`.

### New models

- `ClassScheduleSlot`
- `ClassAssessment`
- `Rubric`
- `RubricCriterion`
- `AnswerEvaluation`
- `RubricCriterionScore`
- `AttemptSkillScore`
- `EvaluationPolicy`
- `EvaluationBand`
- `AttemptEvaluation`
- `CourseRecommendationProfile`
- `CourseSkillCriterion`
- `CourseRecommendation`
- `StudyRecommendation`

### Extended/reworked models

- `Course`: `skillScope`, recommendation profile/results.
- `ClassOffering`: unique `code`, `modality`, `totalSessions`, `totalPeriods`, schedules, assessments.
- `Lesson`: `focusSkills`.
- `LearningResource`: nullable URL plus provider-neutral storage metadata.
- `Question`: nullable `courseId`, required `responseType` and `toeicSkill`, optional rubric.
- `Test`: nullable `courseId`, required `purpose`, optional `placementMode` and time limit.
- `TestAttempt`: required `learnerId`; nullable `enrollmentId` and `classAssessmentId`; evaluation/recommendation relations.
- `TestAnswer`: text/audio payload and evaluation relations.

### Key indexes and constraints

- Unique `AttemptSkillScore(attemptId, skill)` and `AttemptEvaluation(attemptId)`.
- Unique rubric code/order and criterion score per evaluation.
- Unique course recommendation per attempt/course and criterion per profile/skill.
- Partial unique indexes implement one in-progress attempt and attempt numbering per placement/class context.
- DB checks cover score ranges, normalized score 0..100, rubric bounds, scheduling/date bounds, positive counts, placement-mode consistency, evaluation-band semantics, and resource location presence.
- Existing Enrollment and TestAnswer unique constraints remain intact.

## E. Migration safety

The migration follows `ADD → BACKFILL → ASSERT → NOT NULL/INDEX/FK`.

### TestAttempt ownership backfill

1. Add nullable `learnerId`.
2. Populate it by joining `test_attempts.enrollmentId` to `enrollments.learnerId`.
3. Abort with a clear exception if any historical attempt cannot resolve an owner.
4. Set `learnerId` to NOT NULL and add its FK/index.
5. Convert historical Placement attempts to learner-owned context by setting `enrollmentId` and `classAssessmentId` to NULL.
6. Materialize inactive PERIODIC ClassAssessment bridge rows for historical lesson-scoped in-class quiz attempts, then link those attempts without recreating them or their answers.

### Explicit mapping guards

Known demo Course, ClassOffering, and Question rows receive explicit target metadata. Any unknown legacy row lacking a locked `skillScope`, class code/modality, or `toeicSkill` causes migration failure with an actionable message instead of silently inventing production data.

### Destructive SQL review

- No `DROP TABLE`, `DROP COLUMN`, `DELETE`, or `TRUNCATE`.
- Existing attempts and answers are retained.
- Legacy `questions.type`, `tests.type`, `QuestionType`, and `TestType` remain physically present and documented as frozen.
- Rollback/recovery is via the starting Git commit/branch and normal database backup/restore. A down migration is intentionally not fabricated because it would discard M01 data.

## F. Integrity enforcement boundaries

### DB enforced

Required ownership/nullability, PK/FK relations, listed unique constraints, partial context indexes, score/range checks, ordering uniqueness, schedule/date checks, and resource-location checks.

### Service/transaction enforced

Question payload matching response type, instructor/course ownership, objective answer validation, enrollment authorization, idempotent submit, and legacy course-scoped BKT mapping isolation.

### Deferred to M03+ business flows

Cross-table Placement versus IN_CLASS context validation, ClassAssessment test/course consistency, official in-class S/W finalization workflow, evaluation execution, deterministic recommendation execution, and pre-enrollment Placement start/resume endpoints. The schema supports these rules, but M01 intentionally does not implement their business endpoints.

## G. Verification report

### Baseline before changes

| Command                                        | Result          | Notes                                                                                         |
| ---------------------------------------------- | --------------- | --------------------------------------------------------------------------------------------- |
| `npm.cmd ci`                                   | PASS            | Installed from lockfile; no dependency upgrade.                                               |
| `npm.cmd run lint`                             | PASS            | API + web.                                                                                    |
| `npm.cmd run typecheck`                        | PASS            | API + web.                                                                                    |
| `npm.cmd run test`                             | PASS            | 18 API suites/248 tests + 18 web files/178 tests.                                             |
| `npm.cmd run prisma:validate`                  | PASS            | Required permission for Prisma engine cache.                                                  |
| `npm.cmd run prisma:generate`                  | PASS            | Prisma Client 7.10.0.                                                                         |
| `npm.cmd run build`                            | PASS            | API + web.                                                                                    |
| `npm.cmd run test:e2e -w @smart-elearning/api` | PASS            | 14 suites/69 tests.                                                                           |
| `npm.cmd run format:check`                     | FAIL (baseline) | 281 pre-existing formatting warnings across the repository; not mass-fixed as unrelated work. |

### Final after changes

| Command                                                                                             | Result            | Notes                                                                                                                     |
| --------------------------------------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `npx.cmd prisma format --schema prisma/schema.prisma`                                               | PASS              | Schema formatted.                                                                                                         |
| `npm.cmd run prisma:validate`                                                                       | PASS              | Schema valid.                                                                                                             |
| `npm.cmd run prisma:generate`                                                                       | PASS              | Client generated.                                                                                                         |
| `npm.cmd run prisma:migrate:deploy`                                                                 | PASS              | Representative existing DB upgraded in place.                                                                             |
| `npx.cmd prisma migrate diff --from-empty --to-migrations prisma/migrations --script --output ...`  | PASS              | All migrations replayed through a clean shadow database and emitted a complete SQL schema.                                |
| `npx.cmd prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` | PASS              | No schema drift detected.                                                                                                 |
| `npm.cmd run prisma:seed`                                                                           | PASS              | M01 + legacy-compatible development seed.                                                                                 |
| `npm.cmd run lint`                                                                                  | PASS              | API + web.                                                                                                                |
| `npm.cmd run typecheck`                                                                             | PASS              | API + web.                                                                                                                |
| `npm.cmd run test`                                                                                  | PASS              | 18 API suites/248 tests + 18 web files/178 tests.                                                                         |
| `npm.cmd run test:e2e -w @smart-elearning/api`                                                      | PASS              | 14 suites/69 tests, including legacy VS01–VS06 paths.                                                                     |
| `npm.cmd run build`                                                                                 | PASS              | API + web production builds.                                                                                              |
| `git diff --check`                                                                                  | PASS              | No whitespace errors.                                                                                                     |
| Root `format:check`                                                                                 | NOT RERUN AS PASS | Baseline failure is unrelated and remains documented; changed TypeScript files and Prisma schema were formatted directly. |

## H. Actual behavior change versus not implemented

### Changed now

- M01 persistence supports learner-owned Placement attempts before Enrollment and class-scoped attempts through ClassAssessment.
- Every new TestAttempt in the existing assessment service writes `learnerId`.
- TOEIC L/R/S/W classification, subjective response/rubric persistence, per-skill results, evaluation snapshots/config, and deterministic recommendation persistence now exist.
- Existing response consumers keep the legacy `type` alias while new persistence/API payloads expose explicit semantics.
- Legacy BKT/Adaptive data and tests remain operational and are marked frozen rather than deleted.

### Not implemented in this milestone

- No Placement page, navigation redesign, or other frontend change.
- No pre-enrollment Placement endpoint or M03 orchestration.
- No evaluation/recommendation engine execution.
- No real AI provider, storage provider integration, payment gateway, certificate, attendance, consultation, queue, Redis, microservice, or public CMS.
- No BKT/Adaptive deletion or new feature work.

## I. Known issues and reviewer focus

1. The migration intentionally aborts on non-demo legacy rows whose new TOEIC metadata cannot be inferred. A production-like rollout must provide an explicit mapping before deploy.
2. Existing VS03 enrollment-scoped assessment routes remain active for compatibility. The new pre-enrollment Placement route and strict context orchestration belong to M03.
3. Legacy create APIs use compatibility defaults (`LR`, `ONLINE`, generated class code, and `READING` when old question clients omit `toeicSkill`) because frontend redesign is prohibited in M01. Review whether these defaults should become required inputs at the M02/M03 API contract gate.
4. DB cannot safely express all cross-table context rules as CHECK constraints; new M03/M07 services must enforce Test purpose, Enrollment/ClassAssessment/course ownership, and S/W finalization in one transaction.
5. The expected BKT error log emitted by one negative-path E2E test remains unchanged; the suite passes and the error is deliberately exercised.

STOP: M02 and later milestones were not started, and this report does not mark M00/M01 as independently approved or DONE.
