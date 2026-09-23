# KLTN Project State Checkpoint 07 — VS04

## 1. Snapshot

- Date: 2026-09-23
- Branch: `feat/vs04-bkt-foundation`
- Base `main`: `e0f1a67b46fe177f3eff1265176b273a07aa2d6e`
- Current HEAD entering H1:
  `605175ff2e4c3798b95591d9f6f8d05b11d79ce2`
- Migration: `20260922075959_vs04_knowledge_bkt_foundation`
- Status: implemented, independently reviewed CLEAN, pre-merge

The H1 documentation commit becomes a newer feature-branch HEAD. This
checkpoint retains the exact implementation starting point for auditability.

## 2. Implemented vertical

```text
Assigned Instructor Course
-> Skill/KC CRUD and BKT parameters
-> prerequisite graph
-> QuestionSkill and LessonSkill mappings

ACTIVE Student Enrollment
-> objective Attempt submit and deterministic grading
-> submission-time mapped binary observations
-> BKT
-> LearnerSkillState + MasteryHistory
-> Student mastery overview + history
```

The data foundation adds `Skill`, `SkillPrerequisite`, `QuestionSkill`,
`LessonSkill`, `LearnerSkillState`, and `MasteryHistory`. Current state is
Enrollment × Skill; history is an immutable TestAnswer × Skill observation
trail.

## 3. Core invariants

- Skills and mappings are Course-scoped; prerequisite edges are self-free and
  acyclic.
- QuestionSkill is mutable and the mapping at submission time controls future
  observations; past history is never recomputed.
- The first observation starts from `Skill.pInit`; mastery GET represents a
  missing state as PRIOR without writing a row.
- BKT runs only on the first successful submit and shares the Serializable
  transaction with final validation, grading, state, history, and Attempt
  transition.
- Repeated and concurrent submit do not duplicate BKT/history or lose state.
- Effective BKT-parameter changes freeze after history exists; metadata and
  prerequisites retain their documented mutability.
- Mastery/history is independent of result publication and does not leak
  assessment answer truth.

## 4. Validation baseline entering H1

- Lint: PASS
- Typecheck: PASS
- API unit: 14 suites / 148 tests — PASS
- API E2E: 10 suites / 41 tests — PASS
- Web: 15 files / 129 tests — PASS
- Total: 318 tests — PASS
- API/Web build: PASS

H1 is documentation-only. The 318 implementation tests were not rerun solely
for these Markdown edits.

## 5. Review and audit

VS04-G1 returned CLEAN with:

- 0 BLOCKER
- 0 HIGH
- 0 MEDIUM
- 0 LOW

The existing npm audit baseline is 0 critical / 9 high / 0 moderate / 0 low.
No audit remediation is performed or claimed in H1.

## 6. Proposed Decision Log records for H2

- DEC-042: establish Knowledge Model + BKT before Adaptive.
- DEC-043: Course-scoped Skill with per-Skill BKT parameters.
- DEC-044: mutable QuestionSkill with submission-time observation semantics.
- DEC-045: Enrollment × Skill learner state.
- DEC-046: immutable per-TestAnswer × Skill history.
- DEC-047: atomic BKT integration in assessment submit.
- DEC-048: Serializable retry for learner-state concurrency.
- DEC-049: freeze BKT parameters after mastery history.
- DEC-050: same-Course, self-free, acyclic prerequisites.
- DEC-051: mastery/history independent of result publication.
- DEC-052: Adaptive recommendation/path generation remains VS05.

These are proposed records only. No external Decision Log or formal artifact is
modified or claimed synchronized in H1, and repository numbering has no known
conflict.

## 7. Explicitly deferred to VS05 and later

- Adaptive Recommendation and personalized paths
- prerequisite lock/unlock and mastery thresholds
- DKT, forgetting, response-time modeling, and engagement signals
- Essay/AI grading
- Instructor mastery dashboard and class analytics
- recommendation ranking and automatic Lesson recommendation
- mastery-based certificate logic

## 8. Pending formal artifacts

VS04-H2 must synchronize the maintained external use-case/FR traceability,
domain model/ERD, data dictionary, API specification, Decision Log, thesis
sections, and any external checkpoint copy. No DOCX, XLSX, Draw.io, or Drive
update is claimed complete here.

## 9. Exact next steps

1. **VS04-H2 — Formal Academic Artifact Synchronization**.
2. **VS04-H3 — Final validation / PR / CI / teammate review / squash merge**.

Do not start VS05 before VS04 close-out is approved.
