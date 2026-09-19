# Backend Module Map

The backend is a **Modular Monolith**. Modules are logical boundaries inside one deployable NestJS application.

| Module | Responsibility | Main future entities |
|---|---|---|
| auth | Login/logout/session/password workflow | User, session store |
| users | User/profile/account administration | User |
| courses | Public catalog + Course/Module/Lesson/Resource | Course, Module, Lesson, LearningResource |
| classes | ClassOffering, Instructor assignment, schedule/roster coordination | ClassOffering, InstructorAssignment, ClassSession |
| enrollments | Student enrollment lifecycle | Enrollment |
| learning | Lesson access and progress | LessonProgress |
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

## Deferred/candidate modules

- Payment integration: candidate, not scaffolded as runtime code yet.
- Background worker: deferred until Essay AI/Engagement needs queue/retry.
