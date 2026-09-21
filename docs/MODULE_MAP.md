# Backend Module Map

The backend is a **Modular Monolith**. Modules are logical boundaries inside one deployable NestJS application.

| Module | Responsibility | Main future entities |
|---|---|---|
| auth | Login/logout/session/password workflow | User, session store |
| users | User/profile/account administration | User |
| courses | Public catalog and Course metadata | Course |
| classes | ClassOffering, Instructor assignment, schedule/roster coordination | ClassOffering, InstructorAssignment, ClassSession |
| enrollments | Student enrollment lifecycle | Enrollment |
| learning | Instructor curriculum delivery, authorized lesson access, and progress | Module, Lesson, LearningResource, LessonProgress |
| assessments | Question Bank, Test, Attempt, Answer, Essay submission | Question, Test, TestAttempt, TestAnswer, EssaySubmission |
| adaptive | Skill model, BKT, mastery, adaptive recommendation | Skill, LearnerSkillState, MasteryHistory, AdaptiveRecommendation |
| essay-grading | AI suggested assessment + Instructor finalization | AIGradingResult, FinalEssayGrade |
| engagement | Learning events + aggregate metrics | LearningEvent, EngagementMetric |
| consultations | Instructor consultation + AI advisory | Conversation, Message |
| virtual-classroom | Session join/link/attendance | ClassSession, Attendance |
| certificates | Completion rules + certificate issuance | CompletionRule, Certificate |
| admin | System settings, operational reports, audit | SystemSetting, AuditLog |

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

## Deferred/candidate modules

- Payment integration: candidate, not scaffolded as runtime code yet.
- Background worker: deferred until Essay AI/Engagement needs queue/retry.
