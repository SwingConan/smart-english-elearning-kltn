# VS05 — Adaptive Recommendation & Personalized Learning Path

## 1. Authority and status

This document is the only authoritative implementation scope for VS05.
Historical Claude architecture plans and external advisory reviews do not
override it.

VS05 converts the VS04 learner model into a deterministic, explainable
personalized learning path. It does not use an LLM or ML ranking model.

## 2. Locked vertical slice

```text
LearnerSkillState / Skill.pInit
+ SkillPrerequisite
+ LessonSkill
+ LessonProgress
+ CourseAdaptivePolicy
        ↓
Pure Adaptive Engine
        ↓
Mastery band
+ prerequisite eligibility
        ↓
REMEDIAL / REINFORCEMENT / PROGRESSION recommendations
        ↓
Student Personalized Learning Path
+ structured explanation
```

## 3. Traceability targets

| Requirement / use case | VS05 target     |
| ---------------------- | --------------- |
| FR-ADP-010             | FULL            |
| FR-ADP-011             | FULL            |
| FR-ADP-012             | FULL            |
| FR-ADP-013             | FULL            |
| FR-ADP-014             | FULL            |
| FR-ADP-015             | FULL            |
| FR-ADP-016             | NOT IMPLEMENTED |
| UC09                   | FULL            |
| UC42                   | FULL            |

VS05 must not alter the completed VS04 meanings of UC13 (mastery/progress
view), UC25 (Skill/prerequisite/BKT management), or UC41 (BKT mastery update).

## 4. Persisted data model

VS05 adds exactly one model: `CourseAdaptivePolicy`.

Conceptual fields:

- `id`
- `courseId`
- `remedialThreshold`
- `progressionThreshold`
- `createdAt`
- `updatedAt`

Constraints and defaults:

- `courseId` is unique: one policy per Course.
- The Course foreign key uses `RESTRICT`.
- `remedialThreshold` defaults to `0.4`.
- `progressionThreshold` defaults to `0.8`.
- `0 <= remedialThreshold < progressionThreshold <= 1`.

Do not add `Skill.masteryThreshold`, Recommendation, PersonalizedPath, or
RecommendationHistory models.

## 5. Policy lifecycle

Policy is freely mutable and has no historical freeze.

- When no row exists, the application uses `0.4` and `0.8` in memory.
- GET must not auto-create a row.
- The response identifies `source = DEFAULT | SAVED`.
- PUT performs full replacement of the two thresholds and creates or updates
  the single persisted Course policy.
- A policy change takes effect on the next adaptive-path GET.

## 6. Mastery source

VS05 reuses VS04 semantics exactly:

- Existing LearnerSkillState: use the persisted `masteryProbability` and
  `state = OBSERVED`.
- Missing LearnerSkillState: use `Skill.pInit` and `state = PRIOR`.

Adaptive GET must not create LearnerSkillState. Only mapped objective
assessment observations update BKT mastery.

## 7. Two independent Skill dimensions

Do not overload one enum with mastery and prerequisites. Derive both dimensions
for every Skill:

```text
MasteryBand:
UNASSESSED | REMEDIAL | REINFORCEMENT | PROGRESSION_READY

PrerequisiteStatus:
READY | BLOCKED
```

### 7.1 Mastery bands

- PRIOR always maps to `UNASSESSED`. PRIOR is unknown, not weak or strong.
- OBSERVED mastery `< remedialThreshold` maps to `REMEDIAL`.
- OBSERVED mastery `>= remedialThreshold` and `< progressionThreshold` maps to
  `REINFORCEMENT`.
- OBSERVED mastery `>= progressionThreshold` maps to `PROGRESSION_READY`.

These boundary comparisons are exact.

### 7.2 Direct prerequisite eligibility

Evaluate direct prerequisites only. VS05 does not calculate transitive closure.

A direct prerequisite is satisfied only when both are true:

```text
state = OBSERVED
masteryProbability >= progressionThreshold
```

A PRIOR prerequisite is never satisfied, including when its `Skill.pInit` is
at or above the progression threshold. A Skill is READY only when all direct
prerequisites are satisfied; otherwise it is BLOCKED. VS04 already keeps the
graph acyclic.

## 8. Adaptive lock boundary

BLOCKED means the Skill or Lesson is not eligible for an adaptive progression
recommendation. It is not an access-control decision. Existing ACTIVE
Enrollment and Lesson access rules remain unchanged; the adaptive engine must
not become an authorization system.

## 9. Lesson mapping and output groups

Lesson category derives only from LessonSkill mappings.

- A Lesson with no mapped Skills is excluded from the actionable path and
  returned separately as UNMAPPED metadata.
- If any mapped Skill is BLOCKED, the Lesson is excluded from the actionable
  path and returned under `blockedLessons`.
- A blocked Lesson is not classified as REMEDIAL, REINFORCEMENT, or
  PROGRESSION.

For an eligible mapped Lesson:

1. If any mapped Skill is REMEDIAL, category is `REMEDIAL`.
2. Otherwise, if any mapped Skill is REINFORCEMENT, category is
   `REINFORCEMENT`.
3. Otherwise, if any mapped Skill is UNASSESSED, category is `PROGRESSION`.
4. Otherwise all mapped Skills are PROGRESSION_READY, so the Lesson is omitted
   from the primary actionable path.

This is the multi-Skill worst-actionable-need priority:

```text
REMEDIAL > REINFORCEMENT > PROGRESSION
```

For REMEDIAL or REINFORCEMENT, `focusSkill` is the mapped Skill in that
category with the lowest mastery, tie-broken by `Skill.id ASC`. For
PROGRESSION, it is the UNASSESSED mapped Skill with `Skill.id ASC`.

## 10. Completed Lessons

LessonProgress never updates mastery.

- A completed REMEDIAL or REINFORCEMENT Lesson may remain as review with
  `isCompleted = true` and `isReview = true`.
- It sorts after uncompleted Lessons in the same category.
- A completed PROGRESSION Lesson is excluded from the primary progression
  recommendations.

## 11. Curriculum configuration status

Student responses include:

```text
configurationStatus:
READY | PARTIALLY_MAPPED | NO_MAPPED_LESSONS
```

If the Course has no LessonSkill rows, return an empty actionable path,
`NO_MAPPED_LESSONS`, and all unmapped Lessons separately. The system must not
present an unmapped curriculum as personalized.

- `READY`: every Course Lesson has at least one LessonSkill mapping.
- `PARTIALLY_MAPPED`: the Course has at least one mapped Lesson and at least one
  unmapped Lesson.
- `NO_MAPPED_LESSONS`: no Course Lesson has a LessonSkill mapping.

## 12. Deterministic path order

Primary category order:

1. REMEDIAL
2. REINFORCEMENT
3. PROGRESSION

REMEDIAL and REINFORCEMENT tie-breaks:

1. uncompleted before completed review;
2. focus mastery ascending;
3. `Module.orderIndex ASC`;
4. `Lesson.orderIndex ASC`;
5. `Lesson.id ASC`.

PROGRESSION tie-breaks:

1. `Module.orderIndex ASC`;
2. `Lesson.orderIndex ASC`;
3. `Lesson.id ASC`.

`blockedLessons` and `unmappedLessons` use curriculum order. All ordering must
be deterministic.

## 13. Explainability contract

The backend returns structured reason data. Localized `reasonText` is not the
source of truth.

Locked reason codes:

- `REMEDIAL_LOW_MASTERY`
- `REINFORCEMENT_BUILDING`
- `PROGRESSION_PREREQUISITES_READY`
- `LOCKED_PREREQUISITE`

A reason object may contain:

- `reasonCode`
- `focusSkillId`
- `focusSkillCode`
- `focusSkillName`
- `masteryProbability`
- `threshold`
- `state`
- `unsatisfiedPrerequisites`

The frontend maps reason codes and structured fields to Vietnamese display
copy.

## 14. Compute-on-read architecture

Recommendations and paths are not persisted. Student GET reads the latest:

- policy;
- Skills and LearnerSkillStates;
- SkillPrerequisites;
- Lessons and LessonSkills;
- LessonProgress.

It then calls a pure Adaptive Engine. After an assessment submission changes
BKT mastery, the next GET naturally reflects the new path. No background job,
event bus, recommendation cache-invalidation system, or distributed ranking
service is introduced.

## 15. Instructor API

Exactly these routes:

```text
GET /api/instructor/courses/:courseId/adaptive-policy
PUT /api/instructor/courses/:courseId/adaptive-policy
```

GET returns saved policy or in-memory defaults without writing. PUT performs
full replacement:

```json
{
  "remedialThreshold": 0.4,
  "progressionThreshold": 0.8
}
```

Authorization is authenticated INSTRUCTOR → assigned ClassOffering → Course.

## 16. Student API

Exactly one route:

```text
GET /api/learning/enrollments/:enrollmentId/adaptive-path
```

Authorization is authenticated STUDENT → own ACTIVE Enrollment. Foreign,
inactive, or missing access returns 404. There is no separate recommendation
endpoint.

The response contains:

- `policy`: thresholds and `source`;
- `configurationStatus`;
- `skillClassifications`: Skill identity, mastery, state, mastery band,
  prerequisite status, and unsatisfied prerequisites;
- `path`: actionable REMEDIAL, REINFORCEMENT, and PROGRESSION Lessons;
- `blockedLessons`;
- `unmappedLessons`.

## 17. Frontend scope

Instructor route: `/instructor/courses/:courseId/adaptive-policy`.

It provides two threshold inputs, band explanations, DEFAULT/SAVED indication,
validation, and save behavior.

Student route: `/student/enrollments/:enrollmentId/path`.

It displays the current path, Skill summary, category, focus Skill, mastery
probability, explanation, completed/review indicator, blocked section, and
unmapped-curriculum warning.

Approved wording includes “Personalized Learning Path”, “Adaptive
Recommendation”, and “BKT-based learner model”. Do not claim “AI generated
recommendation”.

## 18. Data seed plan

VS05-A may seed exactly one CourseAdaptivePolicy for the existing demo Course:

```text
remedialThreshold = 0.4
progressionThreshold = 0.8
```

The seed remains idempotent. Do not seed recommendation or path rows.

## 19. Required future test coverage

- policy defaults, validation, and GET no-write;
- PRIOR never treated as remedial or prerequisite-ready;
- exact threshold boundaries;
- PRIOR prerequisite blocks;
- observed prerequisite at the progression threshold unlocks;
- remedial, reinforcement, and progression classification;
- multi-Skill category/focus priority;
- completed remedial/reinforcement review ordering;
- completed progression exclusion;
- unmapped Lesson and no-mapped-Lesson Course behavior;
- stable deterministic ordering;
- structured reason correctness;
- path changes after a BKT mastery change;
- policy changes reflected on the next GET;
- adaptive GET remains read-only;
- foreign/inactive Enrollment authorization;
- Instructor assignment authorization;
- LessonProgress never mutates BKT mastery.

## 20. Explicitly out of scope

- DKT and forgetting
- response-time or engagement adaptation
- emotion and proctoring
- LLM recommendations and generative content
- Instructor learner-mastery dashboard and class mastery analytics
- Essay/AI grading
- mastery-based certificates
- persisted recommendation history
- hard Lesson access enforcement

## 21. Phase plan

- **VS05-0:** scope and architecture.
- **VS05-A:** CourseAdaptivePolicy data foundation.
- **VS05-B:** pure Adaptive Engine.
- **VS05-C1:** Instructor adaptive-policy backend.
- **VS05-C2:** Student adaptive-path backend.
- **VS05-D:** Instructor adaptive-policy frontend.
- **VS05-E:** Student personalized-path frontend.
- **VS05-F1:** backend/integration hardening.
- **VS05-F2:** frontend hardening.
- **VS05-G:** independent review.
- **VS05-H:** repository docs, formal synchronization, PR, and merge.

No production, schema, migration, seed, API, UI, or test implementation is
authorized by this scope-lock phase. VS05-A begins only after separate scope
approval.
