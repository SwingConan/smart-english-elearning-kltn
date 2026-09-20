# KLTN Project State Checkpoint 03 — VS02 Core Learning Delivery

## 1. Snapshot

- Date: 2026-09-20
- Branch: `feat/vs02-learning-delivery`
- HEAD before documentation close-out: `7b1bb76`
- Status: VS02 implementation, automated verification, technical verification,
  independent review, and targeted review fixes complete; repository Markdown
  close-out prepared.

## 2. VS02 scope

Implemented Core Learning Delivery:

```text
Assigned instructor Course
-> Module -> Lesson -> LearningResource
-> ACTIVE student Enrollment
-> Open/complete Lesson -> LessonProgress -> Course progress
```

The slice builds on VS01 authentication, course/class-offering, and enrollment
behavior. It does not implement the deferred assessment, adaptive, payment, or
advanced learning capabilities listed below.

## 3. Implemented data

The additive migration `20260920081644_vs02_core_learning` adds:

- `Module`, `Lesson`, `LearningResource`, `LessonProgress`;
- `ResourceType` and `LessonProgressStatus`;
- unique ordered child positions;
- unique `Enrollment × Lesson` progress identity.

Module/Lesson/LearningResource form reusable Course curriculum rather than
ClassOffering-specific copies. Lesson progress is enrollment-specific.

## 4. Implemented backend flows

- Assigned instructors list teaching assignments and manage modules, lessons,
  and URL-based resources.
- Create, reorder, delete, and reindex operations protect deterministic integer
  order and preserve learner progress.
- Students can access learning content only through their own `ACTIVE`
  enrollment.
- Lesson open and completion update progress safely and idempotently.
- Course progress counts completed lessons only within the same enrollment and
  course.

The current student API has four routes. The state-changing lesson-open route
is:

```http
POST /api/learning/enrollments/:enrollmentId/lessons/:lessonId/open
```

The previous side-effectful GET shape is not current API behavior.

## 5. Implemented frontend flows

- Instructor: `/instructor/teaching` and
  `/instructor/courses/:courseId/content`.
- Student: `/student/enrollments/:enrollmentId/learn` from My Enrollments.
- One combined `LearningPage` displays structure, lesson details, resources,
  completion, and progress.
- Arrow-based reorder includes optimistic rollback; no drag-and-drop dependency
  is introduced.
- Pending mutations and expired sessions are handled without automatic mutation
  retry.

## 6. Major decisions

- Reusable Course owns curriculum; ClassOffering supplies instructor assignment.
- VS02 learning access is `ACTIVE` enrollment only.
- `LearningResource` is URL-based for `VIDEO`, `DOCUMENT`, and `LINK`.
- `isDownloadable` is a business/UI policy, not download-security enforcement.
- `LessonProgress` identity is `Enrollment × Lesson`.
- Course progress baseline is completed lessons divided by total lessons.
- Lesson open uses `POST .../open`, not GET.
- Ordered mutations use transaction-backed integer `orderIndex` values.
- Quiz, BKT, mastery, and adaptive behavior remain deferred.

No authoritative repository Decision Log exists; formal Decision Log updates
remain part of external artifact synchronization.

## 7. Concurrency and integrity

- Create operations use Serializable transactions with bounded retry.
- Reorders use interactive Serializable transactions, re-read exact membership
  inside the transaction, and write temporary then contiguous final indices.
- Delete and sibling reindex are atomic; progress rows prevent destructive
  lesson/module deletion.
- Progress mutations use Serializable transactions with bounded retry.
- COMPLETED progress is never downgraded and `completedAt` is preserved.

## 8. Validation baseline

Latest validated baseline at `7b1bb76`:

- Lint: PASS
- Typecheck: PASS
- API unit: 10 suites / 89 tests — PASS
- API E2E: 6 suites / 16 tests — PASS
- Web: 8 files / 63 tests — PASS
- Total: 168 tests — PASS
- API/Web build: PASS

Database-backed coverage includes concurrent create/reorder, open/open,
complete/complete, open/complete, IDOR, cross-course checks, and learner-progress
delete guards.

## 9. Review status

The independent VS02 review reported:

- 0 BLOCKER
- 0 HIGH
- 2 MEDIUM
- 5 LOW

Both MEDIUM findings were resolved in `7b1bb76`:

- reorder membership and writes now share an interactive Serializable
  transaction with bounded retry;
- lesson open now uses `POST .../open` rather than side-effectful GET.

Documentation LOW findings are addressed in this close-out. Optional brittle
CSS-selector and duplicated frontend test-utility cleanup remains non-blocking.

## 10. Known limitations and deferred scope

- Question Bank, Test/Quiz, Placement, Skill, BKT, mastery, and Adaptive
- Engagement analytics, Essay AI, Virtual Classroom, and Certificate
- payment confirmation/gateway
- file upload/object storage and enforced private download delivery
- multi-instructor ownership and admin roster
- video watch-position analytics

This checkpoint does not claim production readiness or completion of those
capabilities.

## 11. Formal artifacts still requiring synchronization

Repository Markdown is not a substitute for the external formal artifacts.
The following categories remain pending:

- Use Case coverage
- Functional Requirements
- Traceability Matrix
- Domain Model / ERD
- Data Dictionary
- API Specification
- Decision Log
- thesis/report update notes
- external formal copy of Checkpoint 03, if maintained

No DOCX, XLSX, Draw.io, or Drive synchronization is claimed in this checkpoint.

## 12. Git checkpoint history

- `74925c0` — `chore: checkpoint vs02 implementation draft`
- `e7ebdbd` — `fix: harden vs02 learning integrity`
- `6580b0d` — `fix: harden vs02 learning frontend`
- `afa9efb` — `test: add vs02 learning coverage`
- `7b1bb76` — `fix: address vs02 independent review findings`

## 13. Exact next step

Review and approve this documentation-only diff, commit it as
`docs: close out vs02 implementation`, and synchronize the branch normally.
Then coordinate formal artifact synchronization before opening or merging the
VS02 Pull Request. Do not begin a new functional slice during close-out.
