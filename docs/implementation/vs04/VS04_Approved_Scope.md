# VS04 — Knowledge Model & BKT Foundation

## 1. Authority and status

This document is the authoritative scope for VS04. Historical or advisory
Claude planning does not override it.

VS04 establishes the knowledge model and Bayesian Knowledge Tracing (BKT)
foundation. Adaptive Recommendation and personalized path generation belong to
VS05, not VS04.

## 2. Locked vertical slice

```text
Instructor assigned Course
-> Skill / Knowledge Component CRUD
-> Skill prerequisite graph
-> Question -> Skill mapping
-> Lesson -> Skill mapping

Student ACTIVE Enrollment
-> submit objective assessment
-> deterministic VS03 scoring
-> mapped binary observations
-> BKT
-> LearnerSkillState
-> MasteryHistory
-> mastery overview
-> mastery history
```

## 3. Locked domain model

### 3.1 Skill

Conceptual fields:

- `id`
- `courseId`
- `code`
- `name`
- optional `description`
- `pInit`
- `pLearn`
- `pGuess`
- `pSlip`
- `createdAt`
- `updatedAt`

Rules:

- A Skill belongs to one Course.
- `code` is unique within its Course.
- There is no `orderIndex` or `masteryThreshold`.
- BKT parameters belong to each Skill.
- Defaults are `pInit = 0.5`, `pLearn = 0.1`, `pGuess = 0.2`, and
  `pSlip = 0.1`.
- Each parameter must be in `[0, 1]`.
- `pGuess + pSlip < 1`; this must not be replaced by an arbitrary `0.99`
  business rule.

### 3.2 SkillPrerequisite

Conceptual fields: `id`, `skillId`, `prerequisiteSkillId`, and `createdAt`.

`skillId` requires `prerequisiteSkillId`. Both Skills must belong to the same
Course. Self-links, duplicate `(skillId, prerequisiteSkillId)` pairs, and
cycles are invalid. VS04 stores the graph but does not enforce adaptive access.

### 3.3 QuestionSkill

Conceptual fields: `id`, `questionId`, `skillId`, and `createdAt`.

Rules:

- Question and Skill must belong to the same Course.
- `(questionId, skillId)` is unique.
- A Question may map to multiple Skills, with no mapping weight.
- Every mapped Skill receives the same binary correctness observation.

QuestionSkill mappings remain mutable. BKT uses the mapping present at
submission time. Removing or remapping a QuestionSkill does not delete
MasteryHistory or recompute past mastery/history; it affects future
observations only.

### 3.4 LessonSkill

Conceptual fields: `id`, `lessonId`, `skillId`, and `createdAt`.

Lesson and Skill must belong to the same Course, and `(lessonId, skillId)` is
unique. This is instructional mapping only: VS04 adds neither prerequisite
lock/unlock nor adaptive Lesson recommendation.

### 3.5 LearnerSkillState

Conceptual fields:

- `id`
- `enrollmentId`
- `skillId`
- `masteryProbability`
- `observationCount`
- optional `lastObservedAt`
- `createdAt`
- `updatedAt`

`(enrollmentId, skillId)` is unique. The Enrollment and Skill must resolve to
the same Course. State belongs to an Enrollment, not directly to a User, and
`masteryProbability` is constrained to `[0, 1]`.

When the first observation arrives without persisted state, use `Skill.pInit`
as `priorMastery`, then apply the observation normally.

Student mastery GET returns every Course Skill without creating missing state:

- missing persisted state: `masteryProbability = pInit`,
  `observationCount = 0`, `lastObservedAt = null`, `state = PRIOR`;
- persisted state: `state = OBSERVED`.

### 3.6 MasteryHistory

Conceptual fields:

- `id`
- `enrollmentId`
- `skillId`
- `testAttemptId`
- `testAnswerId`
- `isCorrect`
- `priorMastery`
- `evidencePosterior`
- `posteriorMastery`
- `createdAt`

`(testAnswerId, skillId)` is unique. `priorMastery` is the value before the
observation; `evidencePosterior` is the Bayesian evidence posterior before the
learning transition; and `posteriorMastery` is the final value written to
LearnerSkillState. MasteryHistory is an immutable audit and explainability
trail.

## 4. BKT calculation

Let `L` be prior mastery, `T = pLearn`, `G = pGuess`, and `S = pSlip`.

For a correct observation:

```text
evidencePosterior = L*(1-S) / [L*(1-S) + (1-L)*G]
```

For an incorrect observation:

```text
evidencePosterior = L*S / [L*S + (1-L)*(1-G)]
```

Apply the learning transition:

```text
posteriorMastery = evidencePosterior + (1-evidencePosterior)*T
```

VS04 has no forgetting parameter.

### Numerical safety

Use a small `EPSILON` denominator guard. If a denominator is effectively zero,
use `priorMastery` as the evidence-posterior fallback, then apply the normal
learning transition. Clamp calculated `evidencePosterior` and
`posteriorMastery` to `[0, 1]`. This safety rule does not replace parameter
validation.

## 5. Deterministic observation order

For one submitted Test, process TestQuestions by `orderIndex ASC`. If a
Question maps to multiple Skills, process Skill IDs `ASC`. Multiple Questions
for the same Skill are processed sequentially, with each posterior becoming
the next observation's prior.

## 6. Assessment-submit integration

BKT processing must be part of the first successful `IN_PROGRESS -> SUBMITTED`
transition and must run in the same existing Serializable transaction as final
answer validation, objective scoring, TestAnswer grading, and Attempt submit.

Conceptual transaction order:

1. Validate ownership and status.
2. Validate the final answer payload.
3. Persist final answer selections.
4. Perform deterministic objective scoring.
5. Persist TestAnswer correctness and points.
6. Resolve current QuestionSkill mappings.
7. Process BKT observations.
8. Update or initialize LearnerSkillState.
9. Append MasteryHistory.
10. Mark the Attempt SUBMITTED.

A repeated submit returns the existing submitted result without rerunning BKT,
duplicating history, or changing mastery. An unmapped Question is still scored
but produces no BKT update.

## 7. Concurrency

Reuse PostgreSQL Serializable transactions with bounded retry.

- Concurrent submits for one Attempt preserve VS03 idempotency and produce one
  BKT transition.
- Concurrent different Attempts for the same Enrollment and Skill must not
  lose updates. A retry re-reads LearnerSkillState and recomputes BKT in a
  valid serial order.
- LearnerSkillState initialization uses unique `(enrollmentId, skillId)` and an
  upsert-compatible pattern.
- Current state/prior is determined inside the transaction. After a
  serialization or uniqueness conflict, no mastery calculated by the failed
  transaction may be reused.
- Unique `(testAnswerId, skillId)` gives MasteryHistory additional exactly-once
  protection.
- No Redis or distributed lock is introduced.

## 8. Historical integrity

Once any MasteryHistory exists for a Skill, effective changes to `pInit`,
`pLearn`, `pGuess`, or `pSlip` are locked. `code`, `name`, and `description`
remain mutable. A PATCH that echoes an unchanged BKT value is not rejected
merely because the field is present.

Skill deletion returns `409` when referenced by QuestionSkill, LessonSkill,
SkillPrerequisite, LearnerSkillState, or MasteryHistory; otherwise deletion is
allowed. Relevant foreign keys preserve history with `RESTRICT`.

## 9. Prerequisite graph replacement

Prerequisites use transactional full-set replacement. The operation re-reads
the current Course graph and rejects cross-Course IDs, self-links, duplicates,
and cycles. DFS or topological validation is acceptable. Prerequisites remain
mutable because VS04 does not use them for BKT or adaptive enforcement.

## 10. Instructor API

Locked routes:

```text
GET    /api/instructor/courses/:courseId/skills
POST   /api/instructor/courses/:courseId/skills
PATCH  /api/instructor/skills/:skillId
DELETE /api/instructor/skills/:skillId
GET    /api/instructor/skills/:skillId/prerequisites
PUT    /api/instructor/skills/:skillId/prerequisites
GET    /api/instructor/questions/:questionId/skills
PUT    /api/instructor/questions/:questionId/skills
GET    /api/instructor/lessons/:lessonId/skills
PUT    /api/instructor/lessons/:lessonId/skills
```

QuestionSkill and LessonSkill full-set replacement bodies use
`{ "skillIds": [...] }`. Prerequisite replacement uses
`{ "prerequisiteSkillIds": [...] }`.

Authorization is authenticated `INSTRUCTOR -> ClassOffering.instructorId ->
Course`. Entity-first routes resolve the entity to its Course before enforcing
assignment. Request bodies never establish Course ownership.

## 11. Student API

Locked routes:

```text
GET /api/learning/enrollments/:enrollmentId/mastery
GET /api/learning/enrollments/:enrollmentId/mastery/:skillId/history
```

Authorization requires an authenticated STUDENT's own ACTIVE Enrollment.
PENDING_PAYMENT, COMPLETED, DROPPED, CANCELLED, foreign, and missing Enrollment
access return `404`.

The mastery overview returns every Course Skill with safe Skill fields,
masteryProbability, observationCount, lastObservedAt, and `PRIOR | OBSERVED`.
Safe prerequisite metadata may be included.

History is learner-owned, restricted to a same-Course Skill, ordered oldest to
newest, and returns `isCorrect`, `priorMastery`, `evidencePosterior`,
`posteriorMastery`, and `createdAt`. Safe assessment/question context is
optional only when it does not leak answers or introduce unnecessary
complexity. Other learners' state is never exposed.

## 12. Frontend scope

Instructor route: `/instructor/courses/:courseId/skills`.

It provides Skill list/create/edit/delete, BKT parameter editing, and
prerequisite configuration. Question Bank adds Question-to-Skill mapping UX;
Course content Lesson management adds Lesson-to-Skill mapping UX.

Student route: `/student/enrollments/:enrollmentId/mastery`.

It displays Skill, mastery percentage, observation count, PRIOR/OBSERVED, and
history access or expandable history.

VS04 does not add a mastered/not-mastered label, mastery threshold, adaptive
recommendation, or Instructor learner-mastery dashboard.

## 13. Development seed intent

Use stable UUIDs for four Skills:

| Skill code | pInit | pLearn | pGuess | pSlip |
|---|---:|---:|---:|---:|
| `GRAMMAR_BASIC` | 0.5 | 0.1 | 0.2 | 0.1 |
| `VOCAB_FOUNDATION` | 0.5 | 0.1 | 0.2 | 0.1 |
| `READING_COMPREHENSION` | 0.3 | 0.1 | 0.2 | 0.1 |
| `SENTENCE_CONSTRUCTION` | 0.3 | 0.1 | 0.2 | 0.1 |

Question mappings:

- Q1: GRAMMAR_BASIC, VOCAB_FOUNDATION
- Q2: VOCAB_FOUNDATION
- Q3: GRAMMAR_BASIC, SENTENCE_CONSTRUCTION
- Q4: VOCAB_FOUNDATION
- Q5: GRAMMAR_BASIC, SENTENCE_CONSTRUCTION

Lesson mappings:

- existing Lesson 1: GRAMMAR_BASIC, VOCAB_FOUNDATION
- existing Lesson 2: VOCAB_FOUNDATION, SENTENCE_CONSTRUCTION
- existing Lesson 3: READING_COMPREHENSION

Prerequisites:

- SENTENCE_CONSTRUCTION requires GRAMMAR_BASIC.
- READING_COMPREHENSION requires VOCAB_FOUNDATION.

Do not seed LearnerSkillState or MasteryHistory. Demo submissions must generate
them through the real learner flow.

## 14. Close-out traceability expectations

These are expectations to revalidate against actual implementation in VS04-H,
not final completion claims.

| Requirement | Expected close-out status |
|---|---|
| FR-ASM-004 | FULL after Question-to-Skill mapping |
| FR-ADP-001 | FULL |
| FR-ADP-002 | FULL |
| FR-ADP-003 | FULL |
| FR-ADP-004 | expected FULL based on the existing Placement Test builder |
| FR-ADP-005 | expected FULL after Placement submissions update the learner model |
| FR-ADP-006 | FULL |
| FR-ADP-007 | FULL |
| FR-ADP-008 | FULL |
| FR-ADP-009 | FULL |
| FR-ADP-010 | NOT IMPLEMENTED |
| FR-ADP-011 | NOT IMPLEMENTED |
| FR-ADP-012 | NOT IMPLEMENTED |
| FR-ADP-013 | NOT IMPLEMENTED |
| FR-ADP-014 | NOT IMPLEMENTED |
| FR-ADP-015 | NOT IMPLEMENTED |
| FR-ADP-016 | NOT IMPLEMENTED |

| Use case | Expected close-out status |
|---|---|
| UC25 | FULL |
| UC41 | FULL |
| UC13 | expected FULL after the Student mastery view |
| UC09 | remains PARTIAL because Adaptive/Personalized Path is deferred |
| UC10 | remains FULL |

## 15. Explicitly deferred from VS04

- Adaptive Recommendation and personalized path generation
- prerequisite lock/unlock and mastery-threshold classification
- DKT and a forgetting parameter
- response-time modeling and engagement signals
- Essay/AI grading
- Instructor learner-mastery dashboard and class mastery analytics
- recommendation ranking and automatic Lesson recommendation
- mastery-based certificate logic

## 16. Phase plan

- **VS04-0:** Scope and architecture.
- **VS04-A:** Prisma data foundation, migration, and seed.
- **VS04-B:** Instructor Skill/Prerequisite/Mapping backend.
- **VS04-C1:** Pure BKT engine and unit tests.
- **VS04-C2:** Submit integration and LearnerSkillState/MasteryHistory.
- **VS04-C3:** Student mastery/history backend.
- **VS04-D:** Instructor Knowledge Model frontend.
- **VS04-E:** Student Mastery frontend.
- **VS04-F1:** Backend permanent integration/E2E tests.
- **VS04-F2:** Frontend permanent tests.
- **VS04-G:** Independent review and hardening.
- **VS04-H:** Repository docs, formal synchronization, PR, and merge.

C1, C2, and C3 are internal checkpoints on this same feature branch, not
separate Pull Requests.
