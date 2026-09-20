# VS02 Current Implementation

## 1. Scope

VS02 implements Core Learning Delivery:

```text
Instructor assigned Course
-> Module
-> Lesson
-> LearningResource
-> Student ACTIVE Enrollment
-> Open Lesson
-> LessonProgress
-> Course progress
```

It extends the VS01 authentication, course, class-offering, and enrollment
foundation without redefining those domain boundaries.

## 2. Implemented Models

- `Module`: ordered reusable curriculum section belonging to a `Course`.
- `Lesson`: ordered lesson belonging to a `Module`.
- `LearningResource`: ordered URL-based `VIDEO`, `DOCUMENT`, or `LINK`
  belonging to a `Lesson`.
- `LessonProgress`: progress identified by one `Enrollment × Lesson` pair.

Enums:

- `ResourceType`: `VIDEO`, `DOCUMENT`, `LINK`.
- `LessonProgressStatus`: `NOT_STARTED`, `IN_PROGRESS`, `COMPLETED`.

## 3. Authorization

Instructor content operations require the authenticated `INSTRUCTOR` role and
a real assignment chain from the instructor through `ClassOffering` to the
requested course. Parent relationships are resolved server-side for lesson and
resource operations.

Student learning operations require the authenticated `STUDENT` role, ownership
of the requested enrollment, and `Enrollment.status === ACTIVE`.
`PENDING_PAYMENT`, `COMPLETED`, `DROPPED`, and `CANCELLED` do not grant VS02
learning access. Missing, foreign-owned, inactive, and cross-course resources
return 404 to avoid disclosing protected records.

## 4. Current API Contract

### Instructor endpoints

| Method | Route |
|---|---|
| GET | `/api/instructor/teaching` |
| GET | `/api/instructor/courses/:courseId/modules` |
| POST | `/api/instructor/courses/:courseId/modules` |
| PATCH | `/api/instructor/modules/:moduleId` |
| DELETE | `/api/instructor/modules/:moduleId` |
| PATCH | `/api/instructor/courses/:courseId/modules/reorder` |
| GET | `/api/instructor/modules/:moduleId/lessons` |
| POST | `/api/instructor/modules/:moduleId/lessons` |
| PATCH | `/api/instructor/lessons/:lessonId` |
| DELETE | `/api/instructor/lessons/:lessonId` |
| PATCH | `/api/instructor/modules/:moduleId/lessons/reorder` |
| GET | `/api/instructor/lessons/:lessonId/resources` |
| POST | `/api/instructor/lessons/:lessonId/resources` |
| PATCH | `/api/instructor/resources/:resourceId` |
| DELETE | `/api/instructor/resources/:resourceId` |
| PATCH | `/api/instructor/lessons/:lessonId/resources/reorder` |

### Student endpoints

| Method | Route | Behavior |
|---|---|---|
| GET | `/api/learning/enrollments/:enrollmentId/content` | Authorized ordered course tree and lesson statuses |
| POST | `/api/learning/enrollments/:enrollmentId/lessons/:lessonId/open` | Opens a lesson and records/refreshes access progress |
| PATCH | `/api/learning/enrollments/:enrollmentId/lessons/:lessonId/complete` | Completes a lesson idempotently |
| GET | `/api/learning/enrollments/:enrollmentId/progress` | Returns course completion counts and percentage |

The lesson-open operation intentionally uses `POST .../open` because it updates
`LessonProgress`. There is no side-effectful GET equivalent. Authorized lesson
responses include their resources, so no standalone student resource endpoint
is required.

## 5. Ordering and Concurrency

- **Create:** each Module/Lesson/LearningResource order is allocated inside a
  Serializable transaction with bounded retry.
- **Reorder:** the service uses an interactive Serializable transaction,
  re-reads children and validates exact membership inside the transaction, then
  writes temporary and contiguous final integer indices. Retry is bounded to
  three attempts for relevant transient conflicts.
- **Delete/reindex:** deletion and sibling reindex are atomic. Existing
  `LessonProgress` prevents lesson/module deletion and is not removed.
- **LessonProgress:** open and complete mutations use Serializable transactions
  with bounded conflict retry. Concurrent open/open, complete/complete, and
  open/complete behavior is covered by DB-backed E2E tests.

## 6. Frontend

Instructor routes:

- `/instructor/teaching`
- `/instructor/courses/:courseId/content`

The content page provides Module/Lesson/LearningResource CRUD and arrow-based
ordering without a drag-and-drop dependency. It guards pending mutations,
rolls an optimistic reorder back on failure, displays safe errors, and redirects
expired sessions without retrying a mutation.

Student route:

- `/student/enrollments/:enrollmentId/learn`

The combined `LearningPage` displays the course tree, selected lesson,
authorized resources, completion action, and progress. A separate
`LessonViewPage` is not part of the implemented design. Role guards provide UI
navigation boundaries; backend authorization remains authoritative.

## 7. Progress Semantics

Opening a lesson without progress creates `IN_PROGRESS` and updates
`lastAccessedAt`. Reopening an in-progress lesson refreshes access time. Opening
a completed lesson preserves `COMPLETED` and `completedAt` while refreshing
access time. Completing is idempotent and never downgrades progress.

Course progress is scoped to the same enrollment and course:

```text
progressPercent = round(completedLessons / totalLessons * 100)
```

An empty course reports zero percent, and the result is capped at 100 percent.

## 8. Resource Policy

Resources are URL-based and have type `VIDEO`, `DOCUMENT`, or `LINK`.
`isDownloadable` is a business/UI policy used to show the document download
action. It is not cryptographic download protection and does not control an
external URL after a learner receives it.

## 9. Automated Verification

| Runner | Suites/files | Tests |
|---|---:|---:|
| API unit | 10 suites | 89 |
| API E2E | 6 suites | 16 |
| Web | 8 files | 63 |
| **Total** | **24 suites/files** | **168** |

The E2E suite uses PostgreSQL and covers concurrent order allocation, concurrent
reorder invariants, progress mutation races, authorization/IDOR, cross-course
validation, and learner-progress delete guards.

## 10. Traceability Summary

These classifications are FULL/PARTIAL within current documented
implementation scope:

| Use case | Coverage |
|---|---|
| UC21 | FULL |
| UC22 | FULL |
| UC09 | PARTIAL |
| UC13 | PARTIAL |
| UC14 | PARTIAL |

Repository requirement mapping:

- `FR-CM-004`: instructor manages Module in assigned Course/content.
- `FR-CM-005`: instructor manages Lesson.
- `FR-CM-006`: instructor manages or attaches learning resources.
- `FR-LRN-001`: student accesses authorized enrolled learning content.
- `FR-LRN-003`: student opens or continues a Lesson.
- `FR-LRN-004`: system records Lesson completion.
- `FR-LRN-005`: system updates Course progress.
- `FR-LRN-006`: student views Course progress.
- `FR-LRN-010`: downloadable-resource policy.

UC09 remains PARTIAL: no adaptive behavior is implemented.

## 11. Explicitly Deferred

- Question Bank, Test/Quiz, Placement, and Skill modeling
- BKT, mastery, and adaptive learning
- Engagement analytics and Essay AI
- Virtual Classroom and Certificate
- payment confirmation/gateway
- file upload/object storage
- multi-instructor content ownership
- admin roster
- video watch-position analytics

## 12. Technical Status

- 0 known BLOCKER findings.
- 0 known HIGH findings from the independent VS02 review.
- Both independent-review MEDIUM findings are resolved.
- Known LOW documentation items are addressed by the repository close-out;
  optional brittle-selector and duplicated-test-utility cleanup remains
  non-blocking.
- Formal DOCX/XLSX/Draw.io and external artifact synchronization is still
  required and is not claimed complete here.
