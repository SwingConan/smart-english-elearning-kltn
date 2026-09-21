# VS02 — Task Tracker

## Phase 1 — Schema, migration, and seed foundation ✅

- [x] Add `ResourceType` and `LessonProgressStatus`.
- [x] Add `Module`, `Lesson`, `LearningResource`, and `LessonProgress`.
- [x] Apply migration `20260920081644_vs02_core_learning`.
- [x] Extend the idempotent development seed with learning content and an
  `ACTIVE` demo enrollment.
- [x] Preserve VS01 regression coverage.

## Phase 2 — Instructor content backend ✅

- [x] Implement assigned-course ownership checks.
- [x] Implement Module/Lesson/LearningResource CRUD and ordered listing.
- [x] Implement transactional create, reorder, delete, and reindex behavior.
- [x] Preserve learner progress through delete guards.

## Phase 3 — Student learning backend ✅

- [x] Enforce `ACTIVE`-only enrollment access and ownership-as-404 behavior.
- [x] Return authorized content and lesson resources.
- [x] Implement `POST .../lessons/:lessonId/open` and idempotent completion.
- [x] Calculate course progress from completed lessons in the same enrollment
  and course.

## Phase 4 — Instructor frontend ✅

- [x] Add assigned teaching and course-content routes.
- [x] Add Module/Lesson/LearningResource management.
- [x] Add arrow-based reorder with optimistic rollback on failure.
- [x] Add pending-mutation and expired-session handling.

## Phase 5 — Student frontend ✅

- [x] Add combined `LearningPage` for course structure, lesson detail,
  resources, completion, and progress.
- [x] Add Continue Learning navigation for `ACTIVE` enrollments.
- [x] Add role protection and expired-session handling.

## Phase 6 — QA, review, and repository documentation

- [x] Phase 6A backend correctness and data-integrity fixes.
- [x] Phase 6B frontend hardening and lint cleanup.
- [x] Phase 6C automated verification.
- [x] Phase 6D final technical verification.
- [x] Independent review: 0 BLOCKER / 0 HIGH / 2 MEDIUM / 5 LOW.
- [x] Phase 6E-1 resolved both MEDIUM findings.
- [x] Repository Markdown close-out.
- [ ] Synchronize formal DOCX/XLSX/Draw.io and external project artifacts.

## Current automated baseline

| Runner | Suites/files | Tests |
|---|---:|---:|
| API unit (Jest) | 10 suites | 89 |
| API E2E (Jest/Supertest) | 6 suites | 16 |
| Web (Vitest) | 8 files | 63 |
| **Total** | **24 suites/files** | **168** |

The historical implementation draft remains planning evidence. Current
behavior is documented in `VS02_Current_Implementation.md`.
