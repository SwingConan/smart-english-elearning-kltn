# KLTN Project State Checkpoint 10 — Post-VS05 / Pre-VS06

## Snapshot

- Date: 2026-09-24
- Base main SHA: `f3b9c83288682aabae56f8dc41f36becf4f12fa1`
- Current feature branch: `feat/vs06-instructor-learner-mastery`
- VS05 status: **MERGED / COMPLETE**
- VS05 Pull Request: `#6`
- VS05 squash commit: `f3b9c83288682aabae56f8dc41f36becf4f12fa1`
- Final verified baseline: 451 tests PASS
- npm audit baseline: 0 critical / 6 high / 0 moderate / 0 low
- Migration count: 6
- VS06 status: scope locked; implementation not started
- Authoritative VS06 scope:
  `docs/implementation/vs06/VS06_Approved_Scope.md`

Historical Claude planning is advisory only. The approved repository scope is
authoritative.

## Closed VS05 baseline

VS05 delivered one CourseAdaptivePolicy, a pure deterministic adaptive engine,
Instructor policy management, Student personalized learning paths, and the
assessment → BKT → LearnerSkillState → compute-on-read adaptive-path proof.

The merged commit is:

```text
f3b9c83288682aabae56f8dc41f36becf4f12fa1
feat: complete VS05 adaptive recommendation and personalized learning path (#6)
```

Final release validation passed 17 API unit suites / 228 tests, 13 API E2E
suites / 61 tests, and 17 Web files / 162 tests: 451 tests total. Lint,
typecheck, build, migration status, and diff checks passed. The accepted audit
baseline is 0 critical / 6 high / 0 moderate / 0 low. The VS05 G1 independent
review was CLEAN, and formal VS05 traceability was completed externally.

## Locked VS06 target

VS06 implements the Instructor Learner Mastery Dashboard for the exact formal
requirement:

> Hệ thống phải cho phép Instructor xem learner mastery theo từng Skill để hỗ
> trợ giảng dạy và can thiệp.

- Target: `FR-ADP-016 = FULL`.
- Formal mapping: `FR-ADP-016 → UC30`.
- Expected UC30 result: `PARTIAL`, not `FULL`, because broader class analytics
  and reporting remain outside VS06.

No new UC is created and the existing 45-UC model is not renumbered.

## Security and data scope

Although the route is Course-level, an Instructor may see only ACTIVE
Enrollment rows satisfying:

```text
classOffering.courseId = requested courseId
AND classOffering.instructorId = authenticated instructorId
AND enrollment.status = ACTIVE
```

An assignment-existence check never grants access to another Instructor's
ClassOffering learners in the same Course. Enrollment remains the row identity;
the dashboard does not deduplicate by learner ID.

## Persistence and functional boundary

VS06 adds no Prisma model, schema change, migration, seed change, or dashboard
write behavior. It reads existing Skill, LearnerSkillState,
CourseAdaptivePolicy, Enrollment, ClassOffering, Course, and User data.

MasteryHistory drill-down, class aggregates, distributions, heatmaps, at-risk
ranking, interventions, engagement analytics, assessment/attendance reporting,
exports, notifications, DKT, forgetting, and new recommendation logic are out
of scope.

The only backend endpoint planned for VS06 core is:

```text
GET /api/instructor/courses/:courseId/learner-mastery
```

The planned frontend route is:

```text
/instructor/courses/:courseId/learner-mastery
```

## Formal artifact workflow

External canonical formal artifacts are not updated independently by Codex.
During VS06 formal closeout, the user supplies the latest DOCX/XLSX artifacts
to ChatGPT, ChatGPT updates and returns them, and the user confirms they were
saved. Only then is external formal synchronization complete.

## Exact next step

**VS06-A — Instructor Learner Mastery backend and unit/service tests**, only
after this scope lock is reviewed and approved.

Do not begin VS06-A during this checkpoint.
