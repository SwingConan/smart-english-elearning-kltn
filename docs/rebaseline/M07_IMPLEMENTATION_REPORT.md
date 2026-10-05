# M07 Implementation Report — Instructor LMS

## Status

- Milestone: M07 — Instructor LMS
- Branch: `feature/m07-instructor-lms`
- Base `main`: `35bcdef55fee32c5eddfb9be5194d5e0c01ead4c`
- Candidate status: ready for GPT implementation review
- Database migration: none; the M07 design is implemented with the existing schema
- Boundaries preserved: no merge, no `main` push, no M08/M09 work

## Delivered scope

### Class-centered instructor workspace

- Added an instructor class list with search, class status, schedule, learner count, and one primary **Vào lớp** action.
- Added a responsive class workspace with six tabs: Overview, Learners, Content, Assessments, Grading, and Results.
- Added class overview metrics, upcoming/open assessment visibility, roster search, and read-only learner detail.
- Learner detail uses one latest, fully finalized, same-assessment four-skill snapshot; it does not combine scores from unrelated attempts.
- Preserved submitted attempt history and surfaced lesson progress and instructor feedback.

### Shared course content and protected documents

- Kept Modules, Lessons, and Resources course-scoped and clearly warns instructors that edits affect every class using that course.
- Added optimistic concurrency for shared content updates with `expectedUpdatedAt` and `409 STALE_SHARED_CONTENT`.
- Added safe instructor document upload/replacement for PDF, DOCX, PPTX, XLSX, and TXT, with extension/MIME/signature checks and a 20 MB limit.
- Added storage-key traversal protection, protected instructor preview, authorized student download, private/no-store responses, and replacement cleanup.
- Student delivery requires an ACTIVE enrollment in a class belonging to the resource's course.

### Four-skill authoring

- Requires `toeicSkill` for new questions.
- Restricts Listening/Reading to objective answers and Speaking/Writing to audio/text response modes.
- Requires an active rubric for productive questions and forbids objective answer options for productive items.
- Added rubric list/read endpoints and four-skill filters in the Question Bank.
- Added grouped Test Builder authoring: group CRUD/reorder, text/media stimuli, stimulus reorder/delete, skill-compatible question selection, and moving questions between compatible groups.
- Preserved historical-attempt mutation locks and added publish validation for points, rubrics, media, groups, and four-skill structure.

### Scheduling, grading, and reporting

- Added purpose-aware class assessment scheduling while keeping templates and the Question Bank course-shared.
- Added a deterministic oldest-submission-first class grading inbox with status/search filters.
- Added optimistic grading concurrency using `AnswerEvaluation.updatedAt` and `409 STALE_GRADING_EVALUATION`.
- Added save/finalize plus next-item navigation only after a successful mutation.
- Added truthful class result counts, latest-submitted-attempt representatives, FINAL-only skill averages, sample size, and excluded count.
- All instructor workspace reads are scoped to the authenticated instructor's owned ClassOffering.

## Deterministic M07 fixture

- Added `apps/api/prisma/m07-seed.ts` and integrated it into the root seed.
- The primary demo class contains 11 active learners total, including 9 M07 Vietnamese learner accounts with mixed lesson progress.
- Existing M06 periodic/midterm/final and mixed pending/final/multiple-attempt data are reused instead of duplicated.
- Added one project-authored stored TXT handbook for protected file-delivery verification.
- Repeated seed execution is idempotent.

## Test coverage

- Instructor ownership/IDOR boundaries.
- Bounded roster/overview aggregates and deterministic grading order.
- Same-attempt finalized four-skill snapshot and FINAL-only class averages.
- Storage type/signature/size/traversal validation and replacement cleanup.
- Shared-content and grading optimistic concurrency.
- Productive-question/rubric matrix, group skill compatibility, historical mutation locks, and group movement.
- Workspace navigation, roster search/read-only semantics, and truthful results UI.
- M07 E2E covers workspace/roster/detail, IDOR, protected file delivery, content concurrency, grading queue, and results.

## Verification

| Gate | Result |
| --- | --- |
| `npm run check:m05-manifest` | PASS — 8 Listening, 8 Reading, 3 Speaking, 2 Writing, 5 rubrics, 8 assets |
| `npm run prisma:validate` | PASS |
| `npm run prisma:generate` | PASS |
| `npm run prisma:migrate:deploy` | PASS — 11 migrations, no pending migration |
| `npm run prisma:migrate:status` | PASS — schema up to date |
| `npm run prisma:drift-check` | PASS — no schema difference |
| `npm run prisma:seed` ×2 | PASS — idempotent |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm run test` | PASS — API 357/357; Web 223/223 |
| `npm run test:e2e -w @smart-elearning/api` | PASS — 96/96 |
| `npm run build` | PASS |
| `git diff --check` | PASS |

## Developer browser smoke

The repeatable CDP smoke driver is `scripts/m07-browser-smoke.mjs`. It was run against local API `http://localhost:3000/api` and Web `http://localhost:5173` in Microsoft Edge headless with the local seed credential supplied only through `M07_SMOKE_PASSWORD`.

All 14 checks passed:

1. Instructor teaching list.
2. Class overview.
3. Roster.
4. Learner detail.
5. Shared-content warning.
6. Four-skill Question Bank.
7. Grouped Test Builder.
8. Class scheduling.
9. Grading inbox.
10. Grading detail and next-item actions.
11. Class results.
12. Protected student document delivery with attachment headers and body verification.
13. Mobile class workspace/drawer at 390 × 844.
14. Tablet results at 820 × 1180.

No horizontal page overflow was detected in any checked viewport. The smoke pass exposed and corrected aborted-request handling on instructor pages under browser navigation, and corrected Question Bank copy to describe four-skill authoring truthfully.

This is a developer smoke pass, not the Product Owner Manual Visual Gate.

## Known non-blocking observations

- Vite reports a 622.43 kB minified JavaScript bundle (170.55 kB gzip), above its 500 kB advisory threshold.
- PostgreSQL/`pg` emits the pre-existing deprecation warning during database verification.
- Negative-path unit/E2E cases intentionally emit expected service error logs.
- Windows Git reports LF-to-CRLF working-copy notices; `git diff --check` remains clean.

## Review handoff

Reviewers should focus on instructor ownership boundaries, shared-content concurrency, protected file delivery, productive-question validation, historical assessment locks, grading concurrency, and result aggregation semantics. No milestone merge is performed by this implementation task.
