# KLTN Project State Checkpoint 08 — Post-VS04 / Pre-VS05

## Snapshot

- Date: 2026-09-23
- Starting main baseline:
  `3f85825f49eda13783c78b114e8c9d596c79664f`
- Current feature branch: `feat/vs05-adaptive-learning`
- VS04 status: **MERGED / COMPLETE**
- VS04 Pull Request: `#5`
- VS04 squash commit:
  `3f85825f49eda13783c78b114e8c9d596c79664f`
- Final verified implementation baseline: 318 tests PASS
- VS05 status: scope planning started; implementation not started
- Authoritative VS05 scope:
  `docs/implementation/vs05/VS05_Approved_Scope.md`

Historical Claude architecture plans are advisory only. The approved repository
scope is authoritative.

## Closed VS04 baseline

VS04 delivered the Course-scoped Skill/KC catalog, prerequisite graph,
QuestionSkill and LessonSkill mappings, pure binary BKT engine, atomic
assessment-submit integration, Enrollment-scoped LearnerSkillState, immutable
MasteryHistory, and Student mastery overview/history.

The merged commit is:

```text
3f85825f49eda13783c78b114e8c9d596c79664f
feat: complete VS04 knowledge model and BKT foundation (#5)
```

The final pre-merge verification passed 14 API unit suites / 148 tests, 10 API
E2E suites / 41 tests, and 15 Web files / 129 tests: 318 tests total. The VS04
G1 independent review was CLEAN. Formal VS04 academic artifacts were
synchronized separately by the project owner.

## Locked VS05 direction

VS05 turns the existing learner model into a deterministic and explainable
personalized path:

```text
latest mastery + prerequisites + Lesson mappings + progress + Course policy
-> pure compute-on-read Adaptive Engine
-> mastery bands and prerequisite eligibility
-> REMEDIAL / REINFORCEMENT / PROGRESSION path
-> structured learner-facing explanation
```

VS05 persists only one new CourseAdaptivePolicy per Course. Recommendations and
paths are computed on read and are not stored. Adaptive BLOCKED status affects
recommendation eligibility only and does not deny Lesson access.

FR-ADP-010 through FR-ADP-015 and UC09/UC42 are the intended completion
targets. FR-ADP-016 remains not implemented. VS04-completed UC13, UC25, and
UC41 retain their meanings.

## Explicit boundary

VS05 does not introduce DKT, forgetting, response-time/engagement/emotion
adaptation, LLM ranking, generative content, Instructor learner-mastery
dashboards, class analytics, Essay/AI grading, certificates based on mastery,
persisted recommendation history, or hard Lesson authorization.

## Advisor demo

The advisor demo is intentionally deferred by the project owner until a later
milestone.

## Exact next step

**VS05-A — CourseAdaptivePolicy Data Foundation**, only after the VS05 scope is
reviewed and approved.

Do not begin VS05-A during this scope-lock checkpoint.
