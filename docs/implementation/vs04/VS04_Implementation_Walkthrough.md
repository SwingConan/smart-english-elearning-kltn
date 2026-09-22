# VS04 Implementation Walkthrough

**Vertical slice:** Knowledge Model & BKT Foundation

**Base:** `main` at `e0f1a67b46fe177f3eff1265176b273a07aa2d6e`

**Date:** 2026-09-23

## 1. Why VS04 exists

VS03 can grade objective assessments, but a score alone is not a longitudinal
learner model. VS04 connects objective answers to Course Skills and maintains
an explainable probability trajectory with Bayesian Knowledge Tracing (BKT).
It deliberately stops before recommendation or personalized-path generation.

## 2. Knowledge Model

The `knowledge-model` API module owns Skill definitions, prerequisite edges,
QuestionSkill and LessonSkill mappings, and the pure BKT calculation. A Skill
belongs to one Course and owns its four BKT parameters. Learner state is
anchored to an Enrollment so separate learner journeys remain separate.

## 3. Skill and prerequisite configuration

An assigned Instructor manages Skills through
`/api/instructor/courses/:courseId/skills` and entity routes under
`/api/instructor/skills/:skillId`. Skill codes are unique per Course.

Prerequisite PUT is a transactional full-set replacement. Validation rejects
cross-Course IDs, a Skill requiring itself, duplicate edges, and cycles. The
graph is descriptive metadata in VS04; it does not lock Lessons.

## 4. Question and Lesson mapping

QuestionSkill maps assessment evidence to one or more Skills. LessonSkill says
which Skills a Lesson teaches or reinforces. Both use full-set replacement,
same-Course validation, and no weights. LessonSkill does not cause adaptive
navigation.

QuestionSkill is intentionally mutable after Attempts exist. The mapping read
during submission controls that observation; later remapping affects future
submissions only and cannot rewrite MasteryHistory.

## 5. Objective assessment as the observation source

VS04 reuses VS03 deterministic grading. After final answers have been validated
and graded from database truth, each mapped objective TestAnswer yields one
binary `isCorrect` observation for every currently mapped Skill. An unmapped
Question is still scored but does not affect mastery.

## 6. BKT formula and example

Let `L` be prior mastery, `T = pLearn`, `G = pGuess`, and `S = pSlip`.

```text
correct evidence = L*(1-S) / [L*(1-S) + (1-L)*G]
incorrect evidence = L*S / [L*S + (1-L)*(1-G)]
posterior = evidence + (1-evidence)*T
```

Example Skill `GRAMMAR_BASIC`:

```text
pInit = 0.5, pLearn = 0.1, pGuess = 0.2, pSlip = 0.1
correct observation

priorMastery       = 0.5000
evidencePosterior  = 0.45 / 0.55 = 0.8182
posteriorMastery   = 0.8182 + (1 - 0.8182)*0.1 = 0.8364
```

The engine guards near-zero denominators and clamps outputs to `[0,1]`. There
is no forgetting, DKT, threshold, response-time, or engagement input.

## 7. Submit transaction flow

The first successful `IN_PROGRESS -> SUBMITTED` transition runs one
Serializable transaction:

```text
ownership/status validation
-> final payload validation and answer persistence
-> objective grading and TestAnswer correctness/points
-> current QuestionSkill lookup
-> ordered BKT observations
-> LearnerSkillState update
-> append MasteryHistory
-> Attempt SUBMITTED
```

TestQuestions are processed by `orderIndex ASC`, then mapped Skills by
`Skill.id ASC`. For repeated observations of one Skill, each posterior is the
next prior.

## 8. LearnerSkillState

LearnerSkillState stores the current probability, observation count, and last
observation for one unique Enrollment × Skill. If it does not yet exist, the
first real observation starts from `Skill.pInit`; a bare prior row is never
created in advance.

## 9. MasteryHistory

Each TestAnswer × Skill observation appends one immutable history row with the
prior, evidence posterior, final posterior, correctness, and source IDs. This
supports an explainable trajectory and an exactly-once uniqueness boundary.

## 10. Student mastery read path

The mastery overview requires the learner's own ACTIVE Enrollment and returns
every Course Skill. Missing state is represented without a write as PRIOR with
`pInit`, zero observations, and no last-observed timestamp. Persisted state is
OBSERVED. The history endpoint returns the learner-owned trajectory oldest to
newest.

These endpoints do not depend on assessment result publication and expose no
answer IDs, correct-option flags, explanations, or hidden score details.

## 11. Concurrency and idempotency

Student submit uses PostgreSQL Serializable transactions with at most three
attempts for implemented retryable Prisma conflicts (`P2002`, `P2003`, and
`P2034`). Same-Attempt races converge on one submission. Different Attempts
updating one Skill serialize without losing an update. Initialization races
converge through the unique Enrollment × Skill constraint and retry.

Repeated submit returns the immutable stored result without rescoring, another
BKT transition, duplicate history, mastery change, or `submittedAt` change.

## 12. Historical integrity

Once history exists for a Skill, effective BKT-parameter changes are blocked;
metadata remains editable, and same-value parameter echoes are harmless.
Question mappings and prerequisites remain mutable. Existing history is never
recomputed retroactively.

## 13. Frontend demonstration flow

1. Sign in as an assigned Instructor and open
   `/instructor/courses/:courseId/skills`.
2. Create/edit a Skill and its BKT parameters, then configure prerequisites.
3. Map Questions in the Question Bank and Lessons in Course content.
4. Sign in as a Student with an ACTIVE Enrollment and submit a mapped objective
   assessment.
5. Open `/student/enrollments/:enrollmentId/mastery` to inspect PRIOR/OBSERVED
   states and the stored mastery trajectory.

The browser only formats server-returned probabilities; it contains no BKT
formula.

## 14. Deferred to VS05 and later

VS04 does not implement Adaptive Recommendation, personalized paths,
prerequisite lock/unlock, mastery thresholds, automatic Lesson recommendation,
recommendation ranking, Instructor mastery dashboards, or class analytics.
DKT, forgetting, response-time/engagement models, Essay/AI grading, and
mastery-based certificates also remain deferred.
