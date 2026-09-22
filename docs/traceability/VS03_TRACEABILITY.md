# VS03 Traceability Summary

This repository summary uses the authoritative formal FR semantics supplied for
VS03 close-out. Formal DOCX/XLSX artifact synchronization remains pending in
VS03-H2; this file does not claim those external artifacts are already updated.

## Use cases

| Use case | Coverage | Repository evidence and boundary |
|---|---|---|
| UC10 | FULL | Instructor objective Question Bank backend and frontend |
| UC23 | PARTIAL | Objective questions implemented; Essay support remains deferred |
| UC24 | FULL | Test Builder, publish, attempts, scoring, and Student result |
| UC12 | PARTIAL | Objective assessment/result flow implemented; broader deferred capabilities remain outside VS03 |

## Functional requirements

| Requirement | Coverage | Implemented meaning / remaining boundary |
|---|---|---|
| FR-ASM-001 | FULL | Instructor creates, updates, and manages a reusable Course Question Bank. |
| FR-ASM-002 | PARTIAL | Formal requirement includes at least MCQ and Essay; VS03 implements objective questions only. Essay is deferred. |
| FR-ASM-003 | FULL | Objective choices, correct-answer truth, and optional explanation are implemented. |
| FR-ASM-004 | NOT IMPLEMENTED | Question-to-Skill/KC mapping is deferred. |
| FR-ASM-005 | FULL | Instructor-declared QuestionDifficulty is required. |
| FR-ASM-006 | FULL | Separate PLACEMENT/QUIZ Tests use the reusable Question Bank. |
| FR-ASM-007 | PARTIAL | `maxAttempts` and Test type are implemented; time configuration/enforcement is not. |
| FR-ASM-008 | FULL | Student with a valid ACTIVE Enrollment can take a published PLACEMENT/QUIZ. |
| FR-ASM-009 | FULL | Deterministic objective auto-grading is implemented. |
| FR-ASM-010 | PARTIAL | Answers and correctness are stored, but reliable response-time observation is not implemented. |
| FR-ASM-011 | FULL | Student result access follows the Instructor-controlled read-time publication policy. |
| FR-ASM-012 | NOT IMPLEMENTED | Essay creation is deferred. |
| FR-ASM-013 | NOT IMPLEMENTED | Essay submission is deferred. |
| FR-ASM-014 | NOT IMPLEMENTED | Instructor Essay review is deferred. |

## Principal implementation evidence

- Data: migration `20260921054337_vs03_assessment_foundation` and Prisma models
  `Question`, `QuestionOption`, `Test`, `TestQuestion`, `TestAttempt`, and
  `TestAnswer`.
- Instructor API: `AssessmentInstructorController` and
  `AssessmentInstructorService`.
- Student API: `AssessmentStudentController` and `AssessmentStudentService`.
- Instructor UI: `QuestionBankPage`, `TestManagementPage`, and
  `TestEditorPage`.
- Student UI: `StudentAssessmentListPage`, `StudentTestAttemptPage`, and
  `StudentTestResultPage`.
- Verification: assessment unit/E2E suites and frontend assessment tests.

## Deferred traceability

Essay/Rubric/AI grading, Skill/KC, BKT/LearnerSkillState, Adaptive behavior,
time-limit enforcement, Instructor assessment analytics/results, engagement,
file upload, proctoring, and multi-instructor support are not implemented by
VS03 and must not be inferred from PARTIAL classifications.
