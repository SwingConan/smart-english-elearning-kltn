# VS04 — Knowledge Model & BKT Foundation

## 1. Status and baseline

- Status: **IMPLEMENTED / REVIEW CLEAN / PRE-MERGE**
- Branch: `feat/vs04-bkt-foundation`
- Current implementation HEAD entering H1:
  `605175ff2e4c3798b95591d9f6f8d05b11d79ce2`
- Base `main`: `e0f1a67b46fe177f3eff1265176b273a07aa2d6e`
- Migration: `20260922075959_vs04_knowledge_bkt_foundation`
- Last verified implementation baseline entering H1: 318 tests PASS
- Independent review: VS04-G1 CLEAN, with zero
  BLOCKER/HIGH/MEDIUM/LOW findings

H1 is documentation-only and does not claim to rerun the implementation test
suite. The documentation commit becomes a newer branch HEAD.

## 2. Implemented vertical slice

```text
Instructor assigned Course
-> Skill / Knowledge Component CRUD and BKT parameters
-> prerequisite graph
-> Question -> Skill mapping
-> Lesson -> Skill mapping

Student ACTIVE Enrollment
-> submit objective Assessment
-> deterministic VS03 grading
-> current QuestionSkill lookup at submission time
-> binary correctness observations
-> Bayesian Knowledge Tracing
-> LearnerSkillState
-> MasteryHistory
-> mastery overview and history
```

Adaptive Recommendation and personalized path generation are not part of
VS04. They remain VS05 work.

## 3. Data model

VS04 adds exactly six knowledge-model entities:

- `Skill`: Course-scoped Knowledge Component. Its `code` is unique per Course,
  and it owns `pInit`, `pLearn`, `pGuess`, and `pSlip`. It has neither
  `orderIndex` nor `masteryThreshold`.
- `SkillPrerequisite`: same-Course directed edge with no self-edge, no cycle,
  and a unique `(skillId, prerequisiteSkillId)` pair.
- `QuestionSkill`: many-to-many Question-to-Skill bridge with no weight. It is
  historically mutable; the mapping present at submission time supplies the
  observation targets.
- `LessonSkill`: instructional Lesson-to-Skill mapping. It does not enforce
  prerequisite access or adaptive behavior.
- `LearnerSkillState`: current state for one unique Enrollment × Skill pair,
  including mastery probability, observation count, and last-observed time.
  Enrollment is the learner-journey anchor.
- `MasteryHistory`: append-only observation audit with one unique row per
  TestAnswer × Skill, recording `priorMastery`, `evidencePosterior`, and
  `posteriorMastery`.

## 4. Binary BKT calculation

Let `L` be prior mastery, `T = pLearn`, `G = pGuess`, and `S = pSlip`.

Correct observation:

```text
evidencePosterior = L * (1 - S)
                    / [L * (1 - S) + (1 - L) * G]
```

Incorrect observation:

```text
evidencePosterior = L * S
                    / [L * S + (1 - L) * (1 - G)]
```

Learning transition:

```text
posteriorMastery = evidencePosterior
                   + (1 - evidencePosterior) * T
```

The implementation uses an `EPSILON` denominator guard and clamps outputs to
`[0, 1]`. VS04 has no forgetting, DKT, response-time or engagement input,
threshold classification, or client-side BKT.

## 5. Initialization and read semantics

When the first observation arrives and no LearnerSkillState exists,
`priorMastery = Skill.pInit`; the real observation is then applied. A bare
`pInit` state is not persisted before an observation.

Mastery GET is read-only for an unobserved Skill and returns:

```text
state = PRIOR
masteryProbability = Skill.pInit
observationCount = 0
lastObservedAt = null
```

It does not create a LearnerSkillState row.

## 6. Assessment-submit integration

BKT runs only on the first successful `IN_PROGRESS -> SUBMITTED` transition.
The same Serializable transaction performs final-answer validation and
persistence, objective grading, TestAnswer correctness/points persistence,
LearnerSkillState updates, MasteryHistory creation, and the Attempt transition.

A repeated submit takes the immutable early-return path: it does not rescore,
rerun BKT, duplicate history, change mastery, or change `submittedAt`.

Observation order is deterministic: `TestQuestion.orderIndex ASC`, then
`Skill.id ASC` within a Question. Multiple observations for one Skill are
sequential; each posterior becomes the next observation's prior.

## 7. Concurrency and exactly-once behavior

PostgreSQL Serializable transactions and bounded retry (three attempts) cover:

- same-Attempt concurrent submit: one effective submission and BKT application;
- different-Attempt same-Skill submit: no lost update and a valid serial order;
- initialization races: unique Enrollment × Skill plus retry.

The student transaction recognizes implemented Prisma conflict codes `P2002`,
`P2003`, and `P2034`. The implementation does not introduce distributed locks.
Unique TestAnswer × Skill history gives additional exactly-once protection.

## 8. Historical semantics

QuestionSkill remains mutable. Its current mapping affects future submissions;
old MasteryHistory remains immutable, and there is no retroactive mastery
recomputation.

After any MasteryHistory exists for a Skill, effective changes to `pInit`,
`pLearn`, `pGuess`, or `pSlip` are locked. `code`, `name`, and `description`
remain mutable, and a same-value BKT echo is allowed.

Prerequisites remain mutable and are not adaptive enforcement in VS04.

## 9. Instructor API and authorization

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

Access requires an authenticated INSTRUCTOR assigned to the Course through a
ClassOffering. PUT mapping endpoints perform full-set replacement.

## 10. Student API and secrecy

```text
GET /api/learning/enrollments/:enrollmentId/mastery
GET /api/learning/enrollments/:enrollmentId/mastery/:skillId/history
```

Access requires the authenticated STUDENT's own ACTIVE Enrollment. Foreign or
inactive access returns 404. Overview returns all Course Skills; history
returns the learner-owned trajectory.

Mastery and history are independent of `showResultAfterSubmit`. They do not
expose correct option IDs, `QuestionOption.isCorrect`, explanations,
`selectedOptionIds`, or hidden assessment-result details. The binary
`MasteryHistory.isCorrect` observation is intentionally allowed.

## 11. Frontend

Instructor route: `/instructor/courses/:courseId/skills`.

It supports Skill CRUD, BKT parameters, prerequisite configuration, and the
QuestionSkill/LessonSkill mapping integrations in the Question Bank and Course
content surfaces.

Student route: `/student/enrollments/:enrollmentId/mastery`.

It shows mastery overview, PRIOR/OBSERVED state, probability, observation
count, direct prerequisite metadata, and mastery trajectory/history. It has no
client-side BKT, threshold/mastered classification, Adaptive Recommendation,
or Instructor mastery dashboard.

## 12. Verification

| Runner    |        Suites/files |   Tests | Status   |
| --------- | ------------------: | ------: | -------- |
| API unit  |           14 suites |     148 | PASS     |
| API E2E   |           10 suites |      41 | PASS     |
| Web       |            15 files |     129 | PASS     |
| **Total** | **39 suites/files** | **318** | **PASS** |

This is the last verified implementation baseline entering H1; the tests were
not rerun solely for documentation changes.

## 13. Explicitly deferred to later slices

- Adaptive Recommendation and personalized path generation
- prerequisite lock/unlock and mastery thresholds
- DKT, forgetting, response-time modeling, and engagement signals
- Essay/AI grading
- Instructor mastery dashboard and class analytics
- recommendation ranking and automatic Lesson recommendation
- mastery-based certificate logic

## 14. Proposed H2 Decision Log records

Subject to external formal-artifact synchronization in H2:

- DEC-042: VS04 establishes Knowledge Model + BKT before Adaptive.
- DEC-043: Skill is Course-scoped with per-Skill BKT parameters.
- DEC-044: QuestionSkill remains mutable; submission-time mapping defines
  future observation semantics.
- DEC-045: LearnerSkillState is Enrollment × Skill.
- DEC-046: MasteryHistory is an immutable per-TestAnswer × Skill audit trail.
- DEC-047: BKT runs atomically inside the assessment-submit transaction.
- DEC-048: Serializable retry protects concurrent learner-state updates.
- DEC-049: Skill BKT parameters freeze after mastery history exists.
- DEC-050: Prerequisites remain same-Course, self-free, and acyclic.
- DEC-051: Student mastery/history is independent of result publication.
- DEC-052: Adaptive recommendation/path generation remains VS05.

These numbers do not currently conflict with repository Decision Log records.
External Decision Log artifacts are not modified or claimed synchronized here.
