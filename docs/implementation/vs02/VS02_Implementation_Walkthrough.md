# VS02 — Implementation Walkthrough

**Vertical slice:** Core Learning Delivery

**Base:** `main` at `15169f7`

**Date:** 2026-09-20

## Summary

VS02 implements the flow from assigned instructor content management through
student lesson completion and course progress:

```text
Instructor assigned Course
-> Module -> Lesson -> LearningResource
-> Student ACTIVE Enrollment
-> Open Lesson -> LessonProgress -> Course progress
```

## Data foundation

The additive migration `20260920081644_vs02_core_learning` introduces:

- enums `ResourceType` (`VIDEO`, `DOCUMENT`, `LINK`) and
  `LessonProgressStatus` (`NOT_STARTED`, `IN_PROGRESS`, `COMPLETED`);
- models `Module`, `Lesson`, `LearningResource`, and `LessonProgress`;
- unique integer order positions within each parent;
- one progress identity per `Enrollment × Lesson`.

The development seed adds stable sample content and an `ACTIVE` enrollment. It
remains idempotent and is not required by CI or E2E tests.

## Instructor backend

`InstructorContentController` and `InstructorContentService` expose 16 routes:

| Area | Method | Route |
|---|---|---|
| Teaching | GET | `/api/instructor/teaching` |
| Modules | GET/POST | `/api/instructor/courses/:courseId/modules` |
| Modules | PATCH/DELETE | `/api/instructor/modules/:moduleId` |
| Modules | PATCH | `/api/instructor/courses/:courseId/modules/reorder` |
| Lessons | GET/POST | `/api/instructor/modules/:moduleId/lessons` |
| Lessons | PATCH/DELETE | `/api/instructor/lessons/:lessonId` |
| Lessons | PATCH | `/api/instructor/modules/:moduleId/lessons/reorder` |
| Resources | GET/POST | `/api/instructor/lessons/:lessonId/resources` |
| Resources | PATCH/DELETE | `/api/instructor/resources/:resourceId` |
| Resources | PATCH | `/api/instructor/lessons/:lessonId/resources/reorder` |

Every operation follows the instructor assignment chain through a real
`ClassOffering`. Create operations allocate order inside a Serializable
transaction with a bounded three-attempt retry. Reorders use an interactive
Serializable transaction, re-read and validate complete membership inside that
transaction, write temporary indices, then deterministic contiguous final
indices. Delete and sibling reindex are atomic; existing learner progress
blocks lesson/module deletion and is preserved.

## Student backend

Only an enrollment whose status is exactly `ACTIVE` can access learning data.
`PENDING_PAYMENT`, `COMPLETED`, `DROPPED`, and `CANCELLED` are denied with 404.
Ownership and cross-course validation also return 404.

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/learning/enrollments/:enrollmentId/content` | Ordered course tree and lesson status |
| POST | `/api/learning/enrollments/:enrollmentId/lessons/:lessonId/open` | Open lesson and update access progress |
| PATCH | `/api/learning/enrollments/:enrollmentId/lessons/:lessonId/complete` | Complete a lesson idempotently |
| GET | `/api/learning/enrollments/:enrollmentId/progress` | Course completion summary |

Lesson resources are returned with authorized lesson/content data. A standalone
resource endpoint is unnecessary because it would add no functional coverage.
The removed side-effectful GET lesson route is not part of the current API.

Progress mutations run in Serializable transactions with bounded retry for
transient conflicts. Open/open, complete/complete, and open/complete races are
covered. A completed lesson is never downgraded and its `completedAt` value is
preserved.

## Frontend

Instructor routes:

- `/instructor/teaching`
- `/instructor/courses/:courseId/content`

The content editor uses arrow controls rather than a drag-and-drop dependency.
It prevents overlapping mutations, rolls optimistic reorder state back on
failure, handles expired sessions, and shows safe error messages.

Student route:

- `/student/enrollments/:enrollmentId/learn`

The implemented design is one combined `LearningPage`; no separate
`LessonViewPage` is required. It renders the course tree, selected lesson,
authorized resources, completion action, and course progress. Expired sessions
redirect safely without retrying mutations.

`VIDEO`, `DOCUMENT`, and `LINK` resources remain URL-based. `isDownloadable`
controls UI/business behavior for documents; it is not cryptographic download
protection.

## Automated verification

| Runner | Suites/files | Tests | Status |
|---|---:|---:|---|
| API unit | 10 suites | 89 | PASS |
| API E2E | 6 suites | 16 | PASS |
| Web | 8 files | 63 | PASS |
| **Total** | **24 suites/files** | **168** | **PASS** |

The DB-backed E2E suite covers create and reorder concurrency, progress races,
authorization/IDOR rules, cross-course rejection, and preservation of both
in-progress and completed learner progress during rejected deletes.

## Status

Implementation, automated verification, final technical verification,
independent review, and the two MEDIUM review fixes are complete. Formal
DOCX/XLSX/Draw.io and external artifact synchronization remains a separate
follow-up.
