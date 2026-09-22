# VS03 — Assessment Foundation

## Status and authority

This document is the coordinator-approved, authoritative scope for VS03
implementation. Historical or advisory planning material does not override the
decisions locked here.

VS03 implementation has not started at this checkpoint.

## Vertical slice

```text
Instructor assigned Course
→ Objective Question Bank
→ Test Builder
→ PLACEMENT / QUIZ
→ Publish
→ Student ACTIVE Enrollment
→ Start/Resume Attempt
→ Autosave Answers
→ Submit Final Answers
→ Deterministic server-side scoring
→ Result publication policy
→ Student Result
```

## Entities

- `Question`
- `QuestionOption`
- `Test`
- `TestQuestion`
- `TestAttempt`
- `TestAnswer`

## Enums

### QuestionType

- `SINGLE_CHOICE`
- `TRUE_FALSE`
- `MULTIPLE_CHOICE`

### QuestionDifficulty

- `EASY`
- `MEDIUM`
- `HARD`

### TestType

- `PLACEMENT`
- `QUIZ`

### TestStatus

- `DRAFT`
- `PUBLISHED`

### TestAttemptStatus

- `IN_PROGRESS`
- `SUBMITTED`

## Locked schema rules

### Question and QuestionOption

- A `Question` belongs to one `Course`.
- A Question has `type`, `difficulty`, `content`, and optional `explanation`.
- Question has no manual `orderIndex`.
- `QuestionOption` has a deterministic `orderIndex`.

### Test

- A `Test` belongs to one `Course`.
- A `QUIZ` uses a nullable `lessonId` at schema level because `PLACEMENT`
  is course-level.
- A `PUBLISHED` QUIZ must reference a `Lesson` belonging to the same `Course`.
- A `PLACEMENT` must not reference a `Lesson`.
- Test has `title`, `description`, `type`, `status`, `maxAttempts`, and
  `showResultAfterSubmit`.
- `maxAttempts` defaults to `1`.
- `showResultAfterSubmit` defaults to `true`.
- VS03 Test does not have `timeLimitMin`, `passingScore`, or manual Test
  `orderIndex`.

### TestQuestion

`TestQuestion` contains:

- `testId`
- `questionId`
- `orderIndex`
- `points`

Question and Test must belong to the same Course.

### Attempt and answer

- `TestAttempt` belongs to `Enrollment × Test`.
- `TestAnswer` belongs to `Attempt × TestQuestion`.
- `selectedOptionIds` uses a PostgreSQL UUID array.
- No Skill or BKT fields are introduced in VS03.

## Historical integrity

Once any `TestAttempt` exists, the Test structure is frozen.

The following fields and relationships cannot change:

- `type`
- `lessonId`
- `maxAttempts`
- TestQuestion membership
- TestQuestion order
- TestQuestion points

The Test cannot be unpublished or deleted after an attempt exists.

The following Test fields may still change:

- `title`
- `description`
- `showResultAfterSubmit`

If a Question is referenced by a Test that has attempts, the entire Question
and all its options are immutable.

Question deletion returns `409 Conflict` when referenced by any TestQuestion,
even when no attempt exists.

## Question validation

| Type | Option count | Correct-option rule |
|---|---:|---|
| `SINGLE_CHOICE` | At least 2 | Exactly 1 correct |
| `TRUE_FALSE` | Exactly 2 | Exactly 1 correct |
| `MULTIPLE_CHOICE` | At least 2 | At least 1 correct |

## Scoring

- `SINGLE_CHOICE` and `TRUE_FALSE`: the exact selected correct option receives
  full points; every other selection receives zero.
- `MULTIPLE_CHOICE`: only an exact set match receives full points; every other
  selection receives zero.
- There is no partial credit in VS03.
- Score is server-authoritative and is computed from database truth.
- Client-provided score is never accepted.

## Attempt lifecycle

- Student assessment access requires an `ACTIVE` Enrollment.
- Only one `IN_PROGRESS` attempt may exist at a time for an
  `Enrollment × Test` pair.
- `POST` start is start-or-resume:
  - create a new attempt when none is in progress;
  - return the current in-progress attempt when one exists;
  - return `409 Conflict` when the attempt limit is reached and no attempt is
    resumable.
- `maxAttempts` defaults to `1`.

## Submission transaction

The submit request contains the final answer set. Within one transaction, the
server must:

1. validate enrollment/attempt ownership;
2. validate that every selected option belongs to the applicable question;
3. upsert final answers;
4. calculate the score from database truth;
5. mark the attempt `SUBMITTED`.

Repeated submit is idempotent: it returns the existing immutable result,
does not rescore, and does not overwrite `submittedAt`.

## Result publication policy

A student may see a detailed result only when both conditions are true:

- the attempt is `SUBMITTED`; and
- `test.showResultAfterSubmit === true`.

Otherwise, access to the student's own unpublished result returns a friendly
`403 Forbidden`.

Before result publication, responses must never expose option `isCorrect` or a
Question `explanation`.

## Student API contract

| Method | Route |
|---|---|
| GET | `/api/learning/enrollments/:enrollmentId/tests` |
| POST | `/api/learning/enrollments/:enrollmentId/tests/:testId/attempts` |
| GET | `/api/learning/enrollments/:enrollmentId/attempts/:attemptId` |
| PATCH | `/api/learning/enrollments/:enrollmentId/attempts/:attemptId/answers` |
| POST | `/api/learning/enrollments/:enrollmentId/attempts/:attemptId/submit` |
| GET | `/api/learning/enrollments/:enrollmentId/attempts/:attemptId/result` |

There is no pre-attempt endpoint that exposes the full Test questions.

## Instructor API contract

### Question

| Method | Route |
|---|---|
| GET | `/api/instructor/courses/:courseId/questions` |
| POST | `/api/instructor/courses/:courseId/questions` |
| GET | `/api/instructor/questions/:questionId` |
| PATCH | `/api/instructor/questions/:questionId` |
| DELETE | `/api/instructor/questions/:questionId` |

There is no Question reorder endpoint.

### Test

| Method | Route |
|---|---|
| GET | `/api/instructor/courses/:courseId/tests` |
| POST | `/api/instructor/courses/:courseId/tests` |
| GET | `/api/instructor/tests/:testId` |
| PATCH | `/api/instructor/tests/:testId` |
| DELETE | `/api/instructor/tests/:testId` |
| PATCH | `/api/instructor/tests/:testId/publish` |
| PATCH | `/api/instructor/tests/:testId/unpublish` |

### TestQuestion

| Method | Route |
|---|---|
| POST | `/api/instructor/tests/:testId/questions` |
| PATCH | `/api/instructor/tests/:testId/questions/:testQuestionId` |
| DELETE | `/api/instructor/tests/:testId/questions/:testQuestionId` |
| PATCH | `/api/instructor/tests/:testId/questions/reorder` |

The instructor objective-result dashboard is deferred.

## Formal traceability expectation

### Use cases

| Use case | Expected coverage |
|---|---|
| UC10 | FULL |
| UC23 | PARTIAL |
| UC24 | FULL |
| UC12 | PARTIAL |

### Functional requirements

| Requirement | Expected coverage |
|---|---|
| FR-ASM-001 | FULL |
| FR-ASM-002 | PARTIAL |
| FR-ASM-003 | FULL |
| FR-ASM-004 | NOT IMPLEMENTED |
| FR-ASM-005 | FULL |
| FR-ASM-006 | FULL |
| FR-ASM-007 | PARTIAL |
| FR-ASM-008 | FULL |
| FR-ASM-009 | FULL |
| FR-ASM-010 | PARTIAL |
| FR-ASM-011 | FULL |
| FR-ASM-012 | NOT IMPLEMENTED |
| FR-ASM-013 | NOT IMPLEMENTED |
| FR-ASM-014 | NOT IMPLEMENTED |

These are expected classifications for the approved VS03 scope and must be
revalidated against the completed implementation before formal close-out.

## Explicitly deferred

- Essay
- Rubric
- AI grading
- Skill, QuestionSkill, and LessonSkill
- BKT and LearnerSkillState
- Adaptive behavior
- Engagement
- time-limit enforcement
- objective assessment analytics/report dashboard
- file upload
- proctoring
- multi-instructor support
