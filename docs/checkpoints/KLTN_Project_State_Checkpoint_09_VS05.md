# KLTN Project State Checkpoint 09 — VS05 / Pre-Merge

## 1. Repository snapshot

- Date: 2026-09-23
- Branch: `feat/vs05-adaptive-learning`
- Base `main` / merged VS04 commit:
  `3f85825f49eda13783c78b114e8c9d596c79664f`
- Current HEAD entering H1:
  `959ed9ad8bb2bbc785b42871f7fd5d8c4acb6d5d`
- Feature branch synchronized with origin before H1: **YES**
- Working tree entering H1: **CLEAN**
- VS05 merge status: **IMPLEMENTED / REVIEW CLEAN / NOT MERGED**
- Authoritative scope:
  `docs/implementation/vs05/VS05_Approved_Scope.md`

The H1 documentation commit becomes a newer feature-branch HEAD. This
checkpoint retains the exact pre-H1 implementation state for auditability.

## 2. Objective and architecture

VS05 delivers Adaptive Recommendation and a Personalized Learning Path using a
deterministic, explainable, compute-on-read engine:

```text
Course policy + current VS04 learner model + direct prerequisites
+ LessonSkill mappings + LessonProgress
-> pure adaptive engine
-> mastery classifications + ordered path + structured reasons
```

Recommendations and paths are not persisted. The next adaptive-path GET reads
the latest policy, mastery, mappings, and progress.

## 3. Completed phases

- **VS05-0B:** authoritative scope lock and feature-branch setup.
- **VS05-A:** `CourseAdaptivePolicy` data foundation, migration, and seed.
- **VS05-B:** pure deterministic adaptive engine.
- **VS05-C1:** Instructor adaptive-policy backend.
- **VS05-C2:** Student adaptive-path backend.
- **VS05-D:** Instructor adaptive-policy frontend.
- **VS05-E:** Student Personalized Learning Path frontend.
- **VS05-F1:** backend and cross-feature integration hardening.
- **VS05-F2:** frontend and UX hardening.
- **VS05-G:** independent review, G1 CLEAN.
- **VS05-H0:** test-only closure of review NOTE G-01.
- **VS05-H1:** repository documentation and project-memory synchronization.
- **VS05-H2:** formal traceability closeout completed in the external canonical artifacts.
- **VS05-H3:** final release validation, PASS.

## 4. Locked semantics

- PRIOR mastery is always `UNASSESSED`; it is not weak or strong evidence.
- OBSERVED mastery uses the exact Course remedial/progression thresholds to
  derive `REMEDIAL`, `REINFORCEMENT`, or `PROGRESSION_READY`.
- Only direct prerequisites are evaluated. A prerequisite is satisfied only
  when it is OBSERVED and reaches the progression threshold.
- Eligible Lesson priority is `REMEDIAL > REINFORCEMENT > PROGRESSION`.
- Adaptive `BLOCKED` means ineligible for progression recommendation; it is
  not a Lesson-access authorization rule.
- Unmapped Lessons are returned separately from actionable and blocked groups.
- Completed REMEDIAL/REINFORCEMENT Lessons may remain as review; completed
  PROGRESSION Lessons are omitted from primary progression recommendations.
- `LessonProgress` never updates BKT mastery.
- Recommendations are computed on read and are never persisted.

## 5. Implemented surfaces

Instructor API:

```text
GET /api/instructor/courses/:courseId/adaptive-policy
PUT /api/instructor/courses/:courseId/adaptive-policy
```

Student API:

```text
GET /api/learning/enrollments/:enrollmentId/adaptive-path
```

Frontend routes:

```text
/instructor/courses/:courseId/adaptive-policy
/student/enrollments/:enrollmentId/path
```

## 6. Data foundation

VS05 adds exactly one persisted model: `CourseAdaptivePolicy`.

- Latest migration: `20260923081928_vs05_adaptive_policy_foundation`
- Total migration count: 6
- Migration status: all applied, no pending migration or drift indication.
- No recommendation/path/history persistence was added.

## 7. Cross-feature proof

Permanent integration coverage proves:

```text
assessment submit
-> deterministic grading
-> current QuestionSkill observation
-> BKT
-> LearnerSkillState
-> next adaptive GET
-> changed Personalized Learning Path
```

Repeated assessment submit remains exactly-once: it does not rescore, rerun
BKT, duplicate MasteryHistory, or change mastery. H0 additionally proves that
real Lesson completion updates `LessonProgress` without changing
`LearnerSkillState`, `observationCount`, `masteryProbability`,
`MasteryHistory`, or adaptive mastery classification.

## 8. Independent review

VS05-G G1 was CLEAN:

- 0 BLOCKER
- 0 HIGH
- 0 MEDIUM
- 0 LOW
- 1 NOTE

G-01 was a test-coverage note, not a behavioral defect. It was closed in H0 by
commit `959ed9ad8bb2bbc785b42871f7fd5d8c4acb6d5d` with no production semantic
change.

## 9. Verification and audit baseline

| Runner    |        Suites/files |   Tests | Status   |
| --------- | ------------------: | ------: | -------- |
| API unit  |           17 suites |     228 | PASS     |
| API E2E   |           13 suites |      61 | PASS     |
| Web       |            17 files |     162 | PASS     |
| **Total** | **47 suites/files** | **451** | **PASS** |

- Lint: PASS
- Typecheck: PASS
- API/Web build: PASS
- npm audit: 0 critical / 6 high / 0 moderate / 0 low
- Audit fix performed: **NO**
- Dependency changes made for the audit count: **NO**

H3 reran the final release validation against the production tree: all 451
tests, lint, typecheck, and build passed. The branch is **READY FOR PR**.

## 10. Traceability closeout

VS05-H2 synchronized the external canonical formal artifacts with these
official statuses:

- FR-ADP-010: `FULL`
- FR-ADP-011: `FULL`
- FR-ADP-012: `FULL`
- FR-ADP-013: `FULL`
- FR-ADP-014: `FULL`
- FR-ADP-015: `FULL`
- FR-ADP-016: `NOT IMPLEMENTED`
- UC09: `FULL`
- UC42: `FULL`

The canonical DOCX/XLSX artifacts remain external to this repository. H2
validated their structure after synchronization and did not create a fake
repository artifact or commit.

## 11. Out of scope / future work

- DKT and forgetting
- response-time or engagement adaptation
- LLM recommendation or generative content
- Instructor learner-mastery dashboard and class mastery analytics
- persisted recommendation history
- hard Lesson authorization based on adaptive `BLOCKED`

## 12. Exact next step

**VS05-H4 — PR / review / squash merge**.

Do not begin a new functional slice before VS05 is reviewed and merged.
