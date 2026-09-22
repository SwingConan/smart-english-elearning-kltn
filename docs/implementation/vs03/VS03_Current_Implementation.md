# VS03 Current Implementation

## 1. Status and baseline

- Branch: `feat/vs03-assessment-foundation`
- Documentation starting HEAD: `124f8cce4b90ffbbd667dea4375afe6c4bd1fb5e`
- Migration: `20260921054337_vs03_assessment_foundation`
- Implementation validation baseline entering H1: 235 tests PASS
- Independent verification: G3 CLEAN, with no remaining findings

The H1 documentation commit will become a newer branch HEAD. This document
describes implemented behavior, not the historical implementation drafts.

## 2. Implemented vertical slice

```text
Instructor assigned Course
-> Objective Question Bank
-> Test Builder
-> PLACEMENT / QUIZ
-> Publish
-> ACTIVE Student Enrollment
-> Start/Resume Attempt
-> Autosave Answers
-> Final Submit
-> Deterministic server-side scoring
-> Result publication policy
-> Student Result
```

VS03 extends the VS01 authentication/enrollment and VS02 learning-delivery
foundations. It does not redefine ownership of Course, ClassOffering,
Enrollment, Module, or Lesson.

## 3. Domain model

Enums:

- `QuestionType`: `SINGLE_CHOICE`, `TRUE_FALSE`, `MULTIPLE_CHOICE`.
- `QuestionDifficulty`: `EASY`, `MEDIUM`, `HARD`.
- `TestType`: `PLACEMENT`, `QUIZ`.
- `TestStatus`: `DRAFT`, `PUBLISHED`.
- `TestAttemptStatus`: `IN_PROGRESS`, `SUBMITTED`.

Entities:

- `Question`: reusable, Course-scoped objective question.
- `QuestionOption`: ordered option belonging to one Question.
- `Test`: Course-owned PLACEMENT or QUIZ definition.
- `TestQuestion`: ordered Test-to-Question membership with points.
- `TestAttempt`: one numbered learner attempt for an Enrollment and Test.
- `TestAnswer`: one answer per Attempt and TestQuestion.

Important exclusions are deliberate: there is no `Question.orderIndex`,
`Test.orderIndex`, time limit, passing score, Skill/KC field, or assessment
snapshot/version entity in VS03.

## 4. Question rules

- The Question Bank is reusable within one Course and requires a difficulty.
- `SINGLE_CHOICE`: at least two options and exactly one correct option.
- `TRUE_FALSE`: exactly two options and exactly one correct option; option labels
  remain editable.
- `MULTIPLE_CHOICE`: at least two options and one or more correct options.
- Option content is non-empty, normalized duplicate content is rejected, and
  option order is stored as contiguous `QuestionOption.orderIndex` values.
- A Question cannot be deleted while referenced by any TestQuestion (`409`).
- A Question and all its options become immutable when any referencing Test has
  any Attempt.

## 5. Test rules

- A Test belongs to one Course.
- A PLACEMENT is course-level and has `lessonId = null`.
- A QUIZ may have `lessonId = null` while DRAFT.
- A PUBLISHED QUIZ must reference a Lesson belonging to the same Course.
- `maxAttempts` defaults to 1 and must be a positive integer.
- `showResultAfterSubmit` defaults to true.
- Publishing also requires at least one structurally valid TestQuestion.

## 6. TestQuestion rules

- Question and Test must belong to the same Course.
- Points are positive integers.
- A Question can appear only once in a Test.
- Ordering is contiguous and unique within the Test.
- Reorder requests must contain the complete TestQuestion membership. The
  membership check and writes occur in one Serializable transaction.

## 7. Historical integrity

Once any Attempt exists, including an `IN_PROGRESS` Attempt, structural history
is frozen. The following cannot change:

- `Test.type`, `lessonId`, or `maxAttempts`;
- TestQuestion membership, order, or points;
- Test unpublish or deletion;
- referenced Question content, type, difficulty, explanation, or options.

The Test title, description, and `showResultAfterSubmit` remain independently
editable. The frontend sends metadata PATCH deltas so unchanged locked values
are not needlessly resubmitted; a genuinely changed locked value is still sent
and remains subject to backend `409` enforcement.

VS03 uses mutation prohibition rather than snapshot/versioning. Existing
Attempts continue to refer to the frozen Test and Question structure.

## 8. Attempt lifecycle and authorization

- Student assessment access requires the authenticated `STUDENT` role and the
  learner's own `ACTIVE` Enrollment.
- The Enrollment-to-ClassOffering-to-Course chain is the ownership anchor.
- Foreign, inactive, cross-course, or missing learner resources return 404.
- Starting is start-or-resume: return the current IN_PROGRESS Attempt first;
  otherwise reject an exhausted limit or create the next attempt number.
- Concurrent starts converge on one IN_PROGRESS Attempt.
- Only PUBLISHED Tests belonging to the Enrollment Course are discoverable and
  startable.

## 9. Autosave and final submission

Autosave is a resume convenience. It atomically validates and upserts selected
option IDs, but it does not grade: `isCorrect` and `pointsAwarded` remain null.

The submit payload is the final authority. Submission revalidates selections,
uses database Question/options/points as truth, upserts every final answer,
calculates the score, and marks the Attempt SUBMITTED in one transaction.
Omitted Questions are recorded as unanswered. A repeated submit returns the
existing immutable result without rescoring or changing `submittedAt`.
Concurrent submissions converge on one result without duplicate TestAnswer
rows.

## 10. Scoring

- SINGLE_CHOICE and TRUE_FALSE receive full points only for the exact correct
  option.
- MULTIPLE_CHOICE receives full points only for an exact set match.
- Every other selection receives zero; there is no partial credit.
- Percentage is calculated server-side from stored score and maximum score.
- Client-provided score, correctness, awarded points, or percentage is rejected.

## 11. Result policy and secrecy

A detailed result is available only when the Attempt is SUBMITTED and the
current Test has `showResultAfterSubmit === true`. The flag is evaluated at
read time; false returns a friendly 403 even for the learner's own result.

Before permitted result access, student responses omit correct-option flags,
Question explanations, grading fields, score, and maximum score. Correctness,
explanations, and awarded points are exposed only by the authorized result
endpoint.

## 12. Frontend surfaces

Instructor:

- `/instructor/courses/:courseId/question-bank` — Question Bank CRUD.
- `/instructor/courses/:courseId/tests` — Test creation and lifecycle.
- `/instructor/tests/:testId/edit` — metadata and TestQuestion editor.

There is no Instructor assessment-results dashboard.

Student:

- `/student/enrollments/:enrollmentId/tests` — published Test list and attempt
  summary.
- `/student/enrollments/:enrollmentId/attempts/:attemptId` — safe test-taking
  page with 500 ms debounced autosave.
- `/student/enrollments/:enrollmentId/attempts/:attemptId/result` — permitted
  submitted result.

The attempt page updates local choices immediately, prevents stale autosave
completion from rolling state backward, and submits the current local answer
set even when a debounce is pending.

## 13. Concurrency and transactions

Assessment structural mutations use interactive Prisma Serializable
transactions with bounded retry (up to three attempts) for relevant transaction
and TestQuestion-order conflicts. This includes historical checks performed
with Test/Question updates, deletion/unpublish guards, and TestQuestion add,
update, delete, and reorder operations.

Student start/resume, autosave, and submit use Serializable transactions with
bounded retry for recognized Prisma constraint/serialization conflicts.
Permanent DB-backed tests cover concurrent structural reorder/add, concurrent
start, and concurrent submit. Read-only listing/result operations do not claim
to use Serializable transactions.

## 14. Security boundary

- Global authentication and role guards protect Instructor and Student APIs.
- Instructor operations require a real assignment through a ClassOffering for
  the requested Course.
- Student operations require learner ownership and ACTIVE Enrollment status.
- Ownership and parent-chain checks protect against IDOR and cross-course IDs.
- Attempt content preserves pre-submission answer secrecy.
- Scoring is server-authoritative and selected options are validated against
  the applicable TestQuestion.
- Frontend route guards improve navigation UX; backend guards remain the
  security boundary.

## 15. Major decisions

- Establish objective assessments before Skill/BKT/Adaptive work.
- Use a Course-scoped reusable Question Bank without Question/Test course order.
- Require QuestionDifficulty.
- Use one Test model for PLACEMENT and QUIZ.
- Store `TestAnswer.selectedOptionIds` as PostgreSQL `UUID[]`.
- Preserve history by prohibiting structural mutation after Attempts.
- Make the start endpoint start-or-resume.
- Treat final submit as authoritative and repeated submit as idempotent.
- Evaluate result visibility at read time.
- Defer the Instructor results dashboard.

Formal Decision Log numbering is intentionally deferred to H2.

## 16. Automated verification and review

| Runner | Suites/files | Tests | Status |
|---|---:|---:|---|
| API unit | 12 suites | 108 | PASS |
| API E2E | 8 suites | 25 | PASS |
| Web | 13 files | 102 | PASS |
| **Total** | **33 suites/files** | **235** | **PASS** |

G1 found one genuine MEDIUM issue: the Test editor sent unchanged locked fields
in every metadata PATCH. G2 fixed it with delta-only PATCH construction and a
permanent regression test. G3 verified the fix as CLEAN with zero remaining
findings.

## 17. Explicitly deferred

- Essay, Rubric, and AI grading
- Skill/KC mapping, BKT, LearnerSkillState, and Adaptive behavior
- engagement analytics
- time-limit configuration/enforcement and passing score
- Instructor assessment-results dashboard
- objective assessment analytics/reporting
- file upload and proctoring
- multi-instructor support
