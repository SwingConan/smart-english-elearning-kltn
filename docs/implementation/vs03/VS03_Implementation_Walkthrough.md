# VS03 Implementation Walkthrough

**Vertical slice:** Objective Assessment Foundation
**Base:** `main` at `5f64a233c6e35a6abb3fb01e9f433613f68661cd`
**Date:** 2026-09-22

The Instructor APIs are implemented by `AssessmentInstructorController` and
`AssessmentInstructorService`. Student APIs are implemented by
`AssessmentStudentController` and `AssessmentStudentService`.

## 1. Instructor Question Bank

Routes:

- `GET/POST /api/instructor/courses/:courseId/questions`
- `GET/PATCH/DELETE /api/instructor/questions/:questionId`

The service verifies the authenticated Instructor is assigned through a real
ClassOffering for the Course. It validates SC/TF/MC option structure,
difficulty, normalized option uniqueness, and deterministic option order.
Deletion returns 409 when any TestQuestion references the Question; mutation is
also blocked when a referencing Test has an Attempt.

Frontend: `QuestionBankPage` at
`/instructor/courses/:courseId/question-bank`. The form supports type-specific
radio/checkbox correctness, option ordering, pending guards, and safe conflict
messages. There is no Question reorder endpoint or course-level Question order.

## 2. Instructor Test creation and editing

Routes:

- `GET/POST /api/instructor/courses/:courseId/tests`
- `GET/PATCH/DELETE /api/instructor/tests/:testId`
- `POST /api/instructor/tests/:testId/questions`
- `PATCH/DELETE /api/instructor/tests/:testId/questions/:testQuestionId`
- `PATCH /api/instructor/tests/:testId/questions/reorder`

`TestManagementPage` creates DRAFT PLACEMENT/QUIZ Tests and shows lifecycle
actions. `TestEditorPage` edits metadata, selects unused same-Course Questions,
changes positive points, removes membership, and reorders through complete ID
membership. Reorder is optimistic in the UI and rolls back on failure.

Metadata PATCH sends only effective deltas. Locked fields are not hidden: a
real type, Lesson, or max-attempt change is sent and remains subject to backend
historical rules.

## 3. Publish validation

Routes:

- `PATCH /api/instructor/tests/:testId/publish`
- `PATCH /api/instructor/tests/:testId/unpublish`

Publishing revalidates Lesson rules, positive maxAttempts, at least one
TestQuestion, contiguous order, positive points, same-Course membership, and
the stored Question structure. PLACEMENT must not reference a Lesson. A
PUBLISHED QUIZ must reference a same-Course Lesson. Publish/unpublish are
idempotent before history exists; unpublish is blocked after any Attempt.

## 4. Student Test discovery

Route: `GET /api/learning/enrollments/:enrollmentId/tests`.

The service requires the learner's own ACTIVE Enrollment and lists only
PUBLISHED Tests in its Course. The response contains Test metadata, question
count, attempts used, current in-progress identity, and latest submitted
identity. It does not contain Questions, options, explanations, answers, or
grading truth.

Frontend: `StudentAssessmentListPage` at
`/student/enrollments/:enrollmentId/tests` provides Start, Resume, exhausted
attempt, and result-navigation states.

## 5. Start or resume

Route: `POST /api/learning/enrollments/:enrollmentId/tests/:testId/attempts`.

Flow:

```text
require own ACTIVE Enrollment
-> require PUBLISHED same-Course Test
-> return existing IN_PROGRESS Attempt if present
-> otherwise compare attemptsUsed with maxAttempts
-> create next numbered IN_PROGRESS Attempt
```

The existing in-progress Attempt is returned before max-attempt rejection.
The operation uses a Serializable transaction with bounded retry.

## 6. Safe Attempt content

Route: `GET /api/learning/enrollments/:enrollmentId/attempts/:attemptId`.

For IN_PROGRESS Attempts the service returns ordered Questions, safe options,
points, and saved selected option IDs. It omits correct-option flags,
explanations, grading fields, score, and maximum score. A SUBMITTED Attempt
returns metadata only so the frontend redirects to the result route instead of
rendering editable controls.

Frontend: `StudentTestAttemptPage` at
`/student/enrollments/:enrollmentId/attempts/:attemptId`.

## 7. Autosave

Route: `PATCH /api/learning/enrollments/:enrollmentId/attempts/:attemptId/answers`.

The frontend updates selections immediately and waits 500 ms before autosave.
It uses generation tracking so an older request completion cannot roll visible
state backward. The backend validates complete batch membership and option IDs
atomically and upserts selections with grading fields set to null.

Autosave is convenience state, not scoring authority.

## 8. Final submit and scoring

Route: `POST /api/learning/enrollments/:enrollmentId/attempts/:attemptId/submit`.

The frontend cancels a pending debounce and submits the complete current local
answer state, including empty selections. The backend transaction reloads
database Question/options/points, validates selection ownership, upserts final
answers, calculates exact-match objective scores, and marks the Attempt
SUBMITTED.

Repeated submit returns the already stored immutable result. Client grading
fields are neither required nor trusted.

## 9. Result publication

Route: `GET /api/learning/enrollments/:enrollmentId/attempts/:attemptId/result`.

The Attempt must be SUBMITTED. The service reads the current
`showResultAfterSubmit` flag each time; false returns 403, and true exposes the
score, percentage, correct options, learner selections, awarded points, and
explanations. The Student result page distinguishes policy 403 from expired
session 401 and does not fabricate a result for an in-progress 404.

Frontend: `StudentTestResultPage` at
`/student/enrollments/:enrollmentId/attempts/:attemptId/result`.

## 10. Historical freeze

The first Attempt, even IN_PROGRESS, freezes Test type/Lesson/maxAttempts,
TestQuestion membership/order/points, unpublish/delete, and referenced
Question/options. Checks and mutations share Serializable transactions.
Title, description, and result-publication policy remain editable. VS03 does
not maintain snapshots or versions.

## 11. Concurrent start

Two start requests race inside Serializable transactions. Relevant conflicts
are retried up to the bounded limit; both callers converge on the same
IN_PROGRESS Attempt, and the database retains one row for that active attempt.

## 12. Concurrent submit

Two submit requests are serialized/retried. The first completed transaction
stores one answer row per TestQuestion and the immutable submitted result. The
other request observes SUBMITTED and returns that result without rescoring.
No arbitrary winner's score is assumed by the permanent E2E test.

## Verification pointers

- Unit: `assessment-instructor.service.spec.ts`,
  `assessment-student.service.spec.ts`.
- E2E: `assessment-instructor.e2e-spec.ts`,
  `assessment-student.e2e-spec.ts`.
- Frontend: assessment tests under
  `apps/web/src/features/assessments/`.
