# VS04 Traceability Summary

This repository summary uses the locked VS04 requirement and use-case meanings.
Formal DOCX/XLSX/Draw.io synchronization remains pending in VS04-H2 and is not
claimed complete here.

## Functional requirements

| Requirement | Coverage        | Implemented meaning and evidence                                                                                                                  |
| ----------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-ASM-004  | FULL            | A Question maps to one or more Skill/KCs through QuestionSkill and the Instructor mapping API/UI.                                                 |
| FR-ADP-001  | FULL            | Instructor manages the Course Skill/KC catalog through Skill CRUD backend and frontend.                                                           |
| FR-ADP-002  | FULL            | Instructor defines Skill prerequisites through same-Course, self-free, cycle-safe full-set replacement.                                           |
| FR-ADP-003  | FULL            | A Lesson maps to taught/reinforced Skills through LessonSkill backend and frontend.                                                               |
| FR-ADP-004  | FULL            | The existing VS03 Test Builder configures PLACEMENT Tests.                                                                                        |
| FR-ADP-005  | FULL            | A Student with a valid ACTIVE Enrollment performs a PLACEMENT through the VS03 Attempt lifecycle, with VS04 learner-model observations on submit. |
| FR-ADP-006  | FULL            | The first mapped observation initializes state from `Skill.pInit` when no LearnerSkillState exists.                                               |
| FR-ADP-007  | FULL            | Valid per-Skill `pInit`, `pLearn`, `pGuess`, and `pSlip` parameters are configurable and used by the BKT engine.                                  |
| FR-ADP-008  | FULL            | Valid mapped objective observations update mastery through `computeBktUpdate` and LearnerSkillState.                                              |
| FR-ADP-009  | FULL            | LearnerSkillState stores current mastery; MasteryHistory and the Student history API/UI preserve the evaluation trajectory.                       |
| FR-ADP-010  | NOT IMPLEMENTED | Adaptive rules and recommendation are deferred.                                                                                                   |
| FR-ADP-011  | NOT IMPLEMENTED | Adaptive rules and recommendation are deferred.                                                                                                   |
| FR-ADP-012  | NOT IMPLEMENTED | Adaptive rules and recommendation are deferred.                                                                                                   |
| FR-ADP-013  | NOT IMPLEMENTED | Adaptive rules and recommendation are deferred.                                                                                                   |
| FR-ADP-014  | NOT IMPLEMENTED | Adaptive rules and recommendation are deferred.                                                                                                   |
| FR-ADP-015  | NOT IMPLEMENTED | Adaptive rules/recommendation and Instructor learner-mastery dashboard are deferred.                                                              |
| FR-ADP-016  | NOT IMPLEMENTED | Adaptive rules/recommendation and Instructor learner-mastery dashboard are deferred.                                                              |

FR-ADP-010 through FR-ADP-016 must not be inferred from the implemented
learner-model foundation. Adaptive Recommendation and personalized path
generation belong to VS05.

## Use cases

| Use case | Coverage | Exact meaning and repository evidence                                                                                                          |
| -------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| UC10     | FULL     | Existing Assessment Test flow remains complete.                                                                                                |
| UC13     | FULL     | **Xem tiến độ / mastery**: Student mastery overview/history APIs and UI.                                                                       |
| UC25     | FULL     | **Quản lý Skill / prerequisite / BKT**: Instructor Knowledge Model backend and frontend.                                                       |
| UC41     | FULL     | **Cập nhật mastery bằng BKT**: objective submit → BKT → LearnerSkillState/MasteryHistory.                                                      |
| UC09     | PARTIAL  | **Học theo lộ trình cá nhân hóa**: VS04 supplies learner-model/mastery state, but recommendation and personalized-path generation remain VS05. |

UC13 and UC41 retain these exact meanings and are not interchangeable.

## Principal implementation evidence

- Data migration: `20260922075959_vs04_knowledge_bkt_foundation`.
- Models: `Skill`, `SkillPrerequisite`, `QuestionSkill`, `LessonSkill`,
  `LearnerSkillState`, and `MasteryHistory`.
- Instructor backend: `apps/api/src/modules/knowledge-model/`.
- Submit integration: `AssessmentStudentService` under
  `apps/api/src/modules/assessments/`.
- Student read path: `LearningController` and `LearningService` under
  `apps/api/src/modules/learning/`.
- Instructor frontend: Knowledge Model page plus Question/Lesson mapping
  integrations.
- Student frontend: mastery overview and history.
- Verification baseline entering H1: 14 API unit suites / 148 tests, 10 API
  E2E suites / 41 tests, and 15 Web files / 129 tests — 318 PASS total.

## Deferred boundary

VS04 does not implement Adaptive Recommendation, personalized paths,
prerequisite enforcement, thresholds, DKT, forgetting, response-time or
engagement input, Essay/AI grading, Instructor mastery dashboards, class
analytics, recommendation ranking, automatic Lesson recommendation, or
mastery-based certificates.
