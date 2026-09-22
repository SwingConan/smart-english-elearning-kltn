# Backend Module Map

The backend is a **Modular Monolith**. Modules are logical boundaries inside one deployable NestJS application.

| Module            | Responsibility                                                                                                                              | Main entities / direction                                                               |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| auth              | Login/logout/session/password workflow                                                                                                      | User, session store                                                                     |
| users             | User/profile/account administration                                                                                                         | User                                                                                    |
| courses           | Public catalog and Course metadata                                                                                                          | Course                                                                                  |
| classes           | ClassOffering, Instructor assignment, schedule/roster coordination                                                                          | ClassOffering, InstructorAssignment, ClassSession                                       |
| enrollments       | Student enrollment lifecycle                                                                                                                | Enrollment                                                                              |
| learning          | Instructor curriculum delivery, authorized lesson access, and progress                                                                      | Module, Lesson, LearningResource, LessonProgress                                        |
| assessments       | Objective Question Bank, Test/TestQuestion lifecycle, Student Attempt/TestAnswer, deterministic scoring, and publication-controlled results | Question, QuestionOption, Test, TestQuestion, TestAttempt, TestAnswer                   |
| knowledge-model   | Course Skill/KC catalog, prerequisite graph, Question/Lesson mapping, and pure BKT math                                                     | Skill, SkillPrerequisite, QuestionSkill, LessonSkill, LearnerSkillState, MasteryHistory |
| adaptive          | Future recommendation and personalized-path generation                                                                                      | AdaptiveRecommendation (future)                                                         |
| essay-grading     | AI suggested assessment + Instructor finalization                                                                                           | AIGradingResult, FinalEssayGrade                                                        |
| engagement        | Learning events + aggregate metrics                                                                                                         | LearningEvent, EngagementMetric                                                         |
| consultations     | Instructor consultation + AI advisory                                                                                                       | Conversation, Message                                                                   |
| virtual-classroom | Session join/link/attendance                                                                                                                | ClassSession, Attendance                                                                |
| certificates      | Completion rules + certificate issuance                                                                                                     | CompletionRule, Certificate                                                             |
| admin             | System settings, operational reports, audit                                                                                                 | SystemSetting, AuditLog                                                                 |

## Dependency rule

Prefer domain modules depending on shared infrastructure, not on one another's private internals.
If module A needs module B, expose a small service contract instead of importing database tables directly across the codebase.

## VS02 LearningModule boundary

`LearningModule` owns or coordinates the VS02 learning-delivery components:

- domain data: `Module`, `Lesson`, `LearningResource`, and `LessonProgress`;
- instructor application boundary: `InstructorContentController` and
  `InstructorContentService`;
- student application boundary: `LearningController` and `LearningService`.

`Course` and `ClassOffering` remain entities of the existing course and class
domains. `Enrollment` remains the learner-to-class relationship of the
enrollment domain. `LearningModule` consumes those relationships for
authorization and progress scoping; it does not redefine their ownership.

## VS03 AssessmentsModule boundary

`AssessmentsModule` implements the objective assessment foundation:

- Instructor Question Bank and PLACEMENT/QUIZ Test Builder;
- ordered TestQuestion membership and historical mutation guards;
- ACTIVE-enrollment Student Test discovery, start/resume, autosave, submit, and
  deterministic objective scoring;
- publication-controlled Student results;
- Instructor Question Bank/Test management/Test editor and Student
  list/Attempt/Result frontend surfaces.

At VS03 close-out, Essay/AI grading, Skill/BKT/Adaptive behavior, and Instructor
assessment analytics/results remained future work. VS04 now implements the
Skill/BKT foundation through the ownership boundaries below; Essay/AI,
Adaptive behavior, and Instructor analytics remain deferred.

## VS04 Knowledge Model and mastery boundaries

VS04 spans three backend boundaries without creating a distributed service:

- `apps/api/src/modules/knowledge-model/` owns Instructor Skill CRUD,
  prerequisite replacement, QuestionSkill/LessonSkill mapping, and the pure BKT
  calculation.
- `apps/api/src/modules/assessments/assessment-student.service.ts` owns the
  BKT write-side during the first successful objective Attempt submission. It
  resolves current QuestionSkill mappings after deterministic grading and
  updates LearnerSkillState/MasteryHistory in the same Serializable
  transaction.
- `apps/api/src/modules/learning/` owns the Student mastery overview/history
  read-side for the learner's own ACTIVE Enrollment.

Frontend ownership follows those application boundaries:

- `apps/web/src/features/knowledge-model/` and
  `apps/web/src/pages/KnowledgeModelPage.tsx` provide Instructor Skill and
  prerequisite management.
- `apps/web/src/features/assessments/` integrates QuestionSkill mapping.
- `apps/web/src/pages/CourseContentManagementPage.tsx` integrates LessonSkill
  mapping into Course content management.
- `apps/web/src/features/learning/` and
  `apps/web/src/pages/StudentMasteryPage.tsx` provide the Student mastery and
  history read experience.

The future `adaptive` boundary may consume this learner model in VS05, but
VS04 does not implement recommendation, path generation, prerequisite
lock/unlock, or an Instructor learner-mastery dashboard.

## Deferred/candidate modules

- Payment integration: candidate, not scaffolded as runtime code yet.
- Background worker: deferred until Essay AI/Engagement needs queue/retry.
