# VS06 — Instructor Learner Mastery Dashboard

## 1. Authority and status

This document is the authoritative implementation scope for VS06. Historical
Claude VS06-0A planning is advisory only; the ChatGPT decisions recorded here
override it wherever they differ.

VS06 implements an Instructor Learner Mastery Dashboard that lets an assigned
Instructor view current BKT learner mastery for every Course Skill/KC across
ACTIVE Enrollments in that Instructor's own assigned ClassOfferings.

No application implementation begins in VS06-0B.

## 2. Formal source and traceability boundary

The canonical external formal artifacts were supplied to and reviewed by
ChatGPT before this scope lock.

- Requirement: `FR-ADP-016`
- Priority: MUST
- Primary actor: Instructor
- Exact requirement wording: "Hệ thống phải cho phép Instructor xem learner
  mastery theo từng Skill để hỗ trợ giảng dạy và can thiệp."
- Verification wording: "Instructor xem được learner/skill state."
- Formal mapping: `FR-ADP-016 → UC30`
- UC30 title: "Xem analytics & báo cáo lớp"

Successful VS06 closeout targets:

| Requirement / use case | Expected status |
| ---------------------- | --------------- |
| FR-ADP-016             | FULL            |
| UC30                   | PARTIAL         |

UC30 is broader than FR-ADP-016. Engagement, assessment, attendance, and
broader class reporting remain outside VS06, so VS06 must not claim UC30
`FULL`. Do not create a replacement UC or renumber the existing 45-UC model.

VS06 preserves `FR-ADP-010..015 = FULL` and `UC09`, `UC13`, `UC41`, and `UC42`
as `FULL`. It must not automatically mark `FR-ENG-006`, `FR-ENG-007`,
`FR-RPT-002`, `FR-ADM-002`, or `FR-ADM-003` as `FULL`.

## 3. Course route and Instructor-owned data scope

The API route is Course-level, but its data scope is not all Course
Enrollments. An Instructor may see an Enrollment only when all three predicates
are true:

```text
classOffering.courseId = requested courseId
AND classOffering.instructorId = authenticated instructorId
AND enrollment.status = ACTIVE
```

Authorization and row filtering are separate mandatory controls. Proving that
an Instructor has one assignment in a Course does not authorize access to
learners from another Instructor's ClassOffering in the same Course.

For example, if Instructor A owns Class A and Instructor B owns Class B in the
same Course, Instructor A sees only Class A Enrollment rows and Instructor B
sees only Class B Enrollment rows.

## 4. Authorization contract

- Unauthenticated request: `401`.
- Authenticated wrong role, including Student: `403`.
- Instructor with no assigned ClassOffering for the requested Course: opaque
  `404`.
- Assigned Instructor: allowed, subject to the row filter in section 3.

The endpoint uses the existing Instructor role and opaque unassigned-Course
conventions. It must not change backend authorization assumptions.

## 5. Enrollment row identity and status

Only ACTIVE Enrollments are included. Pending, cancelled, completed, dropped,
or any other non-ACTIVE Enrollment is excluded.

Enrollment is the dashboard row identity. Do not deduplicate by `learnerId`.
Because LearnerSkillState is Enrollment-scoped, the same learner with two
ACTIVE Enrollments in two ClassOfferings owned by the same Instructor produces
two rows, each with its own:

- `enrollmentId`;
- ClassOffering context;
- Skill mastery state.

## 6. Single read-only backend endpoint

VS06-A implements exactly:

```text
GET /api/instructor/courses/:courseId/learner-mastery
```

There is no `/history`, `/analytics`, `/aggregate`, `/at-risk`, or
`/interventions` endpoint and no POST, PUT, PATCH, or DELETE dashboard action.

The GET performs zero writes. It must not create or update:

- LearnerSkillState;
- MasteryHistory;
- CourseAdaptivePolicy;
- Enrollment;
- LessonProgress;
- analytics snapshots.

It does not run BKT or initialize state on read.

## 7. Response contract

The conceptual response is:

```text
{
  courseId,
  policy: {
    remedialThreshold,
    progressionThreshold,
    source
  },
  skills: [
    { skillId, code, name }
  ],
  learners: [
    {
      enrollmentId,
      learnerId,
      learnerName,
      classOffering: { id, name },
      skillStates: [
        {
          skillId,
          state,
          masteryProbability,
          masteryBand,
          observationCount,
          lastObservedAt
        }
      ]
    }
  ]
}
```

Use actual existing schema/API ClassOffering display fields. Do not add schema
fields solely to match the conceptual response. Every Course Skill appears in
every returned Enrollment row even when LearnerSkillState is absent.

Do not expose learner email, password/session data, assessment answers,
QuestionOption data, correct answers, Question explanations, or raw TestAnswer
data.

## 8. Current mastery semantics

Reuse the locked VS04/VS05 learner-model semantics:

- Existing LearnerSkillState: `state = OBSERVED` and use the persisted current
  mastery, observation count, and last-observed timestamp.
- Missing LearnerSkillState: `state = PRIOR`, mastery is `Skill.pInit`,
  `observationCount = 0`, and `lastObservedAt = null`.
- PRIOR always has `masteryBand = UNASSESSED`, regardless of numeric `pInit`.

Never classify PRIOR as REMEDIAL, REINFORCEMENT, or PROGRESSION_READY.

## 9. Mastery bands and policy

Reuse the existing pure `classifyMasteryBand` logic; do not duplicate threshold
classification.

For OBSERVED mastery, without rounding before classification:

```text
mastery < remedialThreshold
→ REMEDIAL

remedialThreshold <= mastery < progressionThreshold
→ REINFORCEMENT

mastery >= progressionThreshold
→ PROGRESSION_READY
```

Use the current CourseAdaptivePolicy when present and report `source = SAVED`.
When absent, use the shared in-memory adaptive-policy defaults and report
`source = DEFAULT`. Dashboard GET must not create a policy row. Do not duplicate
the `0.4 / 0.8` literals across services.

## 10. Deterministic ordering

Backend ordering is locked:

- Skills: `Skill.code ASC`, then `Skill.id ASC`.
- Enrollment rows: ClassOffering display name ASC, ClassOffering ID ASC,
  learner display name ASC, learner ID ASC, then Enrollment ID ASC.

If the schema uses an equivalent existing ClassOffering display field, VS06-A
must document that comparator. The frontend preserves backend ordering.

## 11. Empty states

These are successful `200` states:

- Assigned Course with no ACTIVE Enrollments: Skills may be populated and
  `learners = []`.
- Course with no Skills: `skills = []` and each learner has
  `skillStates = []`.
- Course without a saved policy: return the DEFAULT policy without writing.

## 12. Persistence boundary

VS06 requires:

- Prisma schema change: NO;
- new model: NO;
- migration: NO;
- seed change: NO.

It reuses Course, ClassOffering, Enrollment, User, Skill, LearnerSkillState,
and CourseAdaptivePolicy. MasteryHistory is not required by the core endpoint.

## 13. Frontend scope

VS06-C adds one route:

```text
/instructor/courses/:courseId/learner-mastery
```

The entry point is InstructorTeachingPage → assigned Course → Learner Mastery.
The page contains:

1. header and Course context;
2. DEFAULT/SAVED policy and thresholds;
3. Skill legend;
4. Enrollment-based learner mastery matrix/table with ClassOffering context,
   mastery percentage, PRIOR/OBSERVED state, band, observation count, and last
   observed time where present;
5. defined empty states.

Do not add a chart dependency, history modal, or intervention workflow.

## 14. Explicitly out of scope

- Instructor MasteryHistory drill-down;
- class mastery averages, mean, median, percentile, cohort distributions, or
  heatmaps;
- at-risk prediction or ranking;
- automated intervention, manual mastery override, or Instructor AI advice;
- engagement indicators, trends, or response-time analytics;
- assessment or attendance reporting dashboards;
- a combined progress/mastery/assessment/engagement learner dashboard;
- PDF/CSV export, email notifications, or live WebSocket updates;
- DKT, forgetting, or new adaptive recommendation semantics;
- persisted recommendation history;
- adaptive blocking as Lesson authorization.

## 15. Permanent backend test contract

Security and data-scope coverage must prove:

- unauthenticated `401`;
- Student/wrong role `403`;
- unassigned Instructor `404`;
- assigned Instructor `200`;
- Instructor A and B assigned different ClassOfferings in the same Course see
  only their own Enrollment rows;
- one Instructor with multiple own ClassOfferings sees ACTIVE Enrollment rows
  from all of them;
- non-ACTIVE Enrollments are excluded;
- response contains no assessment secrets.

Mastery coverage must prove:

- PRIOR returns `pInit`, UNASSESSED, count zero, and null last-observed time;
- OBSERVED returns current LearnerSkillState;
- exact remedial boundary is REINFORCEMENT;
- exact progression boundary is PROGRESSION_READY;
- saved policy is used;
- missing policy returns DEFAULT without a write;
- GET does not initialize LearnerSkillState.

## 16. Cross-feature proof

VS06-D proves the real integration sequence:

```text
Instructor dashboard GET
→ learner initially PRIOR/current state

Student submits a real mapped objective assessment
→ existing VS04 BKT updates LearnerSkillState

Instructor dashboard GET again
→ current mastery and band reflect the persisted update
```

There is no dashboard write hook, assessment semantic change, or adaptive
engine semantic change.

## 17. Formal artifact workflow

Codex must not independently perform final external formal-artifact handoff.
At VS06 formal closeout:

1. the user uploads the latest canonical external DOCX/XLSX artifacts to
   ChatGPT;
2. ChatGPT directly reviews and updates them;
3. ChatGPT returns the updated files;
4. the user confirms they have been saved;
5. only then is formal synchronization COMPLETE.

Do not replace this workflow with a repository substitute.

## 18. Locked phase plan

- **VS06-0B:** scope lock and checkpoint only.
- **VS06-A:** Instructor learner-mastery backend and unit/service tests.
- **VS06-B:** backend E2E, security, and cross-ClassOffering scoping.
- **VS06-C:** Instructor Learner Mastery frontend.
- **VS06-D:** cross-feature and frontend/backend hardening.
- **VS06-E:** independent review only with Claude/Antigravity.
- **VS06-F:** repository docs → ChatGPT formal-artifact handoff → final
  regression → PR → human review → squash merge.

Do not collapse phases automatically. The exact next step after approval is
VS06-A.
