# M06 Implementation Report — In-class Assessment

## Candidate

- Base: `main` at `73de4c997f7515aada804ce01ccd80068224b968`
- Branch: `feature/m06-in-class-assessment`
- Scope: in-class assessment scheduling, four-skill learner attempts, instructor-final productive grading, truthful result/history projection
- Out of scope: M07/M08, AI final grading, a second learner assessment area, changes to Product Owner reference artifacts

## Locked decisions implemented

- `Test` remains reusable content; `ClassAssessment` is the class assignment/schedule.
- Active duplicate assignment is blocked by a partial unique index on class and test.
- Class attempt numbering is assignment-scoped; non-class and Placement compatibility is retained through partial indexes.
- Effective deadline is the earlier of the attempt time limit and assignment close time.
- Listening/Reading are scored objectively; Speaking/Writing remain pending until instructor-final rubric grading.
- Persisted productive scores use Prisma `Decimal` and `ROUND_HALF_UP` at two decimal places.
- One instructor-final evaluation is enforced per answer; editing a final judgment requires an explicit edit action and updates the existing evaluation.
- IN_CLASS submissions do not update BKT mastery. Legacy adaptive/BKT verification uses `PRACTICE_MOCK` fixtures.

## Database and migration

Migration: `20261003180000_m06_in_class_assessment`

- Widens `TestAnswer.pointsAwarded` to `DECIMAL(10,2)`.
- Adds the partial uniqueness safety net for instructor-final evaluations.
- Adds the partial uniqueness safety net for active class assignments.
- Replaces the legacy global enrollment attempt-number key with assignment-scoped and non-class partial keys.
- Preserves Placement-specific indexes and existing data.

## API implementation

Instructor routes under `/api/instructor/classes/:classOfferingId/assessments` provide:

- assigned-class workspace and published IN_CLASS test selection;
- create/read/update scheduling with ownership, course, window, duplicate, and immutability validation;
- submission grading queue and grading detail;
- draft/final/edit-final rubric grading;
- protected learner-audio playback.

Student routes provide:

- real assignment-based assessment listing;
- serializable start/resume with assignment-scoped attempt limits;
- lazy expiry and effective-deadline finalization;
- grouped, answer-key-free four-skill attempt projection;
- objective/text autosave and protected audio upload/playback;
- productive-response completeness checks on manual submit;
- objective skill-score persistence without IN_CLASS BKT effects;
- truthful pending/final skill and overall result projection.

## Product UI

- Student assessment cards show stage, availability window, attempts, status, skills, and result history entry points.
- Attempt UI renders grouped Listening, Reading, Speaking, and Writing tasks, protected stimuli, autosave state, timer, recording status, and a submit confirmation dialog.
- Result UI separates per-skill final/pending/missing states and withholds overall total until all four skills are final.
- Instructor teaching cards link to a narrow class assessment workspace.
- Instructor scheduling, grading queue, and rubric grading detail pages use the established responsive project UI.

## Deterministic demo data

The idempotent M06 seed creates three separate published IN_CLASS tests and assignments:

- periodic: closed, completed, fully reviewed;
- midterm: open, submitted with Speaking/Writing pending;
- final: upcoming.

Each test has a separate identity and 11 project-owned tasks: 4 Listening, 4 Reading, 2 Speaking, and 1 Writing. The seed reuses approved M05 project-owned media/content, creates real attempts/answers/evaluations/criterion scores/skill scores, and resets the stable demo grading state deterministically on rerun.

## Test coverage

- Unit coverage includes assignment list projection, objective scoring, transaction retry bounds, ownership, exact weighted Decimal grading, rubric range rejection, and explicit final-edit protection.
- Web coverage includes legacy objective flows plus four-skill Writing/Speaking controls, submit confirmation, and pending-total truthfulness.
- M06 E2E covers deterministic assignment projection, answer-key stripping, pending versus final results, role/ownership enforcement, final evaluation uniqueness/edit semantics, and protected audio.
- Existing adaptive/BKT E2E fixtures were classified as `PRACTICE_MOCK` so the M06 IN_CLASS isolation rule is explicit and regression-tested.

## Verification

Final candidate verification:

- `npm run prisma:validate` — PASS
- `npm run prisma:generate` — PASS
- `npm run prisma:migrate:deploy` — PASS; no pending migrations
- `npm run prisma:status` — PASS; database up to date
- `npm run prisma:drift-check` — PASS; no difference
- `npm run seed` twice — PASS; deterministic/idempotent
- `npm run lint` — PASS
- `npm run typecheck` — PASS
- `npm run test` — PASS: API 331/331, Web 199/199
- `npm run test:e2e -w @smart-elearning/api` — PASS: 88/88
- `npm run build` — PASS
- `npm run check:m05-manifest` — PASS
- `git diff --check` — PASS

## Known non-blocking warnings

- An isolated clean-database replay could not be executed because the local PostgreSQL role does not have `CREATEDB`; the attempt stopped before creating a database. Migration deploy, migration status, and schema drift verification against the existing development database all pass.
- Vite reports the existing large-bundle advisory (about 567 kB for the main chunk).
- PostgreSQL `pg` emits the known client-query deprecation warning during E2E.
- Expected negative-path logs remain in Placement and invalid-BKT tests.

No schema drift, merge, `main` push, M07/M08 work, or Product Owner artifact mutation is part of this candidate.

## GPT implementation review fixes

- Previous HEAD: `2964b7372478a682d44cc7f619be42aeab39f18a`.
- New candidate HEAD: the commit containing this report; the immutable SHA is recorded in the Git handoff after commit/push.
- Visual Gate has not started and is not claimed as passed.

### F-01 through F-09 dispositions

- F-01: repaired all M06-introduced Vietnamese mojibake in seed, assessment API messages, and learner/instructor M06 pages. The deterministic titles are exactly `Kiểm tra thường kỳ 01`, `Kiểm tra giữa kỳ`, and `Kiểm tra cuối kỳ`; E2E asserts them and a source scan finds no `Ã`, `Ä`, or `Æ` sequences in the audited M06 user-facing files.
- F-02: submit now checks the effective deadline before applying request answers. An expired submit finalizes only persisted state; E2E proves late objective and Writing payloads cannot alter answers or score.
- F-03: Speaking now follows PREP/READY/RECORDING/LOCAL_DRAFT/UPLOADING/COMMITTED/UPLOAD_ERROR with preparation countdown, maximum duration, local playback, explicit save, committed playback, safe re-record/discard/retry behavior, submit/navigation guards, track teardown, and object-URL cleanup.
- F-04: answer autosave is revision-safe and serialized with at most one request in flight. Edits made during a save are drained immediately afterward, and manual submit flushes/awaits the latest revision.
- F-05: grading rejects missing/blank productive responses with `PRODUCTIVE_RESPONSE_MISSING`; productive FINAL aggregation additionally requires a real response, awarded points, and exactly one reviewed-final instructor evaluation.
- F-06: the M06 grouped exam uses one focused group at a time, stable global numbering, skill-grouped current/completed navigation, desktop sidebar, and mobile collapsible navigation without raw task codes. Legacy ungrouped objective tests remain backward compatible.
- F-07: grading localizes productive skills, supports criterion feedback and partial drafts without invalid empty scores, requires all criteria only for final confirmation, adds all/waiting/completed filters, and shows concise Listening/Reading snapshots.
- F-08: pre-attempt stage/window/attempt-limit editing is exposed with backend immutability preserved; progress includes four-skill final/pending/missing snapshots; scheduling and grading detail have retryable load errors.
- F-09: the timer initializes from `Date.now()`, disables normal edits at zero, and reconciles with server-authoritative expiry.

### Focused regression evidence

- Class/learner assessment service unit suites: 11/11 PASS.
- M06 Web regression suite: 13/13 PASS, including revision ordering, submit during in-flight save, re-record/failure preservation, teardown, maximum duration, submit lock, navigator, timer initialization, grading draft/feedback, filters, schedule editing, progress snapshots, and load errors.
- M06 E2E suite: 7/7 PASS, including canonical Unicode titles, late-payload rejection, missing-response grading rejection, Decimal grading, uniqueness, ownership, result truth, and protected audio.

### Final verification after review fixes

- `npm run check:m05-manifest` — PASS.
- Prisma validate/generate/deploy/status/drift — PASS; 11 migrations, database up to date, no difference.
- `npm run seed` twice — PASS; idempotent. A final seed rerun restored deterministic demo state after E2E.
- `npm run lint` — PASS.
- `npm run typecheck` — PASS.
- `npm run test` — PASS: API 333/333; Web 210/210.
- `npm run test:e2e -w @smart-elearning/api` — PASS: 90/90.
- `npm run build` — PASS.
- Clean-database replay remains unavailable locally because the PostgreSQL role lacks `CREATEDB`; no destructive permission change was attempted. The repository has no separate safe local replay mechanism beyond the CI-created database path.

Known non-blocking output remains the Vite large-chunk advisory (about 581 kB), the PostgreSQL `pg` deprecation warning, and expected negative-path logs.

Rerun disclosure: the first full unit run exposed eight legacy Web assertions that still assumed the old all-questions layout/concurrent autosave behavior. Legacy ungrouped objective rendering was kept backward compatible and those assertions were updated for serialized saves; the subsequent focused and full runs pass. The first lint run also caught synchronous effect-state updates in the new pages; those were corrected before the final passing lint run.

## GPT re-review round 2 fixes

- Previous HEAD: `ab3a0f1503c16c0ba535603647ebf69904e8468b`.
- New candidate HEAD: the commit containing this report; the immutable SHA is recorded in the Git handoff after commit/push.
- R2-F01: the Speaking recorder lifecycle effect now explicitly restores `mounted.current = true` during setup, so React StrictMode effect replay cannot suppress the post-stop local-draft transition. Existing recorder, track, and object-URL teardown remains intact.
- R2-F02: the recorder reports state, local-draft truth, and committed-answer truth through a narrow parent contract. Recording, upload, local drafts, and failed uploads with a retained blob block submit, confirmation, skill/task navigation, previous/next controls, and the assessment-list exit. Discarding restores the prior committed recording and clears the guard; a permission failure without a blob exposes a retry path without trapping page navigation.
- Focused M06 Web suite: 17/17 PASS, including StrictMode record/stop, committed replacement draft guards, discard recovery, failed-upload retry/discard guards, permission-denied recovery, maximum duration, and media-track teardown.
- Full verification: M05 manifest PASS; Prisma validate/drift PASS; seed twice PASS and final post-E2E seed restore PASS; lint PASS; typecheck PASS; API unit 333/333 PASS; Web 214/214 PASS; API E2E 90/90 PASS; build PASS; `git diff --check` PASS.
- No schema, API, scoring, migration, M05 Placement, M07, or M08 behavior was changed. Manual Visual Gate has not started and is not claimed as passed.

## Visual Gate round 1 corrected findings / fixes

- Previous HEAD: `171cefbe58f83c69b1765474b9e4af59b2b8ab6b`.
- New candidate HEAD: the commit containing this section; the immutable SHA is recorded in the Git handoff after commit/push.
- This corrective pass addresses the supplied round-1 findings. It does not claim that the Product Owner Visual Gate has passed; a Product Owner retest remains required.

### VG-F01 through VG-F11 dispositions

- VG-F01: preserved Nest `StreamableFile`/binary responses in the compatibility interceptor instead of recursively converting them to plain JSON. Authenticated E2E checks now require canonical image/audio MIME and non-empty bytes. Real Chrome confirmed the image at 930×665, audio duration 24.663125 seconds, and successful playback.
- VG-F02: M06 cloning now assigns one positive point to each Speaking/Writing question while leaving M05 Placement source points unchanged. Rerunning the idempotent seed repairs existing M06 rows. Instructor-final aggregation rejects a non-positive productive denominator with `PRODUCTIVE_POINTS_CONFIGURATION_INVALID` before persisting a FINAL skill score; Decimal coverage proves 0.8/1 becomes a finite 80%.
- VG-F03: Speaking preparation and recording use absolute wall-clock deadlines with 250 ms display ticks. Delayed callbacks derive remaining/elapsed time from `Date.now()` and cannot extend the allowed duration. Unit coverage simulates throttling; Chrome measured a 30→28 second decrease after about two seconds.
- VG-F04: course-level list/editor presentation is purpose-aware. M06 cards display `Bài kiểm tra trên lớp`; the IN_CLASS editor exposes a read-only `Mục đích` and never sends a legacy `type` mutation or displays `Xếp lớp` for the M06 form.
- VG-F05: each instructor class offering is now a distinct sub-card with a prominent `Bài kiểm tra của lớp` action. The normal demo route reaches scheduling, grading queue, and learner grading detail.
- VG-F06: the student list adds compact Tất cả/Thường kỳ/Giữa kỳ/Cuối kỳ filters, urgency ordering, stronger stage/status hierarchy, and clearer active/exhausted attempt copy.
- VG-F07: attempt groups can be marked `Đánh dấu xem lại`; marks persist per attempt in browser storage and remain independent of answered/current state.
- VG-F08: structured 409 codes map to specific Vietnamese messages for incomplete productive responses, expiry, attempt limits, not-open, and closed assessments. Real Chrome confirmed the incomplete Speaking/Writing backend message after submit confirmation.
- VG-F09: active quota copy is `Đang làm lượt X/Y`; exhausted copy is `Đã hoàn thành X/Y lượt`, and exhausted cards expose no start/resume CTA. Backend counting remains assignment-scoped.
- VG-F10: raw class statuses are localized. Legacy knowledge/adaptive/mastery links move under `Công cụ nâng cao` with Vietnamese labels instead of dominating the M06 path.
- VG-F11: reusable course authoring is named `Mẫu bài kiểm tra`, includes a concise distinction from class assignments, and renders non-empty purpose-aware badges. The editor title/list navigation uses matching reusable-template terminology.
- Committed Speaking playback now has the explicit `Bản ghi đã lưu` label. Submit confirmation separately reports unanswered objective, unsaved Speaking, and unsaved Writing counts, with a positive completeness message when both productive counts are zero.

### Focused regression evidence

- `ClassAssessmentService` unit suite: 8/8 PASS, including positive one-point normalization and zero-denominator rejection.
- Focused Web assessment/navigation/builder suites: 40/40 PASS, including deadline drift, mark-for-review, specific domain error, committed playback, list filter/copy, localized instructor navigation, and IN_CLASS editor purpose.
- M06 E2E suite: 8/8 PASS after deterministic seed, including canonical binary media, positive productive points, finite final skill values, ownership, grading, expiry, and missing-response protection.

### Full verification after corrected fixes

- `npm run check:m05-manifest` — PASS: 8 Listening, 8 Reading, 3 Speaking, 2 Writing, 5 rubrics, 8 assets; malformed fixture rejected.
- `npm run prisma:validate` / `prisma:generate` — PASS.
- `npm run prisma:migrate:deploy` / `prisma:status` — PASS: 11 migrations, no pending migration, database up to date.
- `npm run prisma:drift-check` — PASS: no difference detected.
- `npm run seed` twice — PASS and idempotent; a final post-E2E seed restored deterministic demo grading state.
- `npm run lint` — PASS.
- `npm run typecheck` — PASS.
- `npm run test` — PASS: API 335/335; Web 218/218.
- `npm run test:e2e -w @smart-elearning/api` — PASS: 91/91.
- `npm run build` — PASS.
- `git diff --check` — PASS.

### Mandatory real-browser smoke

Product Owner-equivalent smoke ran in local headless Chrome against the real Vite/Nest application using the deterministic student and instructor demo accounts.

- Student: assessment list filters and urgency hierarchy rendered; active `2/2` and exhausted copy were distinct; M06 midterm opened; canonical image rendered at 930×665; canonical audio exposed 24.663125 seconds of metadata and played; Speaking showed positive points; mark-for-review persisted; preparation changed 30→28 seconds on wall clock; fake-device recording uploaded, displayed `Bản ghi đã lưu`, and remained playable after leaving/returning to the task; submit confirmation showed all three missing-count lines; confirming submit produced the specific incomplete Speaking/Writing message.
- Instructor: `TOEIC L&R Foundation — Tối T3/T5` was findable from `Lớp giảng dạy của tôi`; class status was localized; the prominent class-assessment action opened the workspace; stage/open/close/max-attempt controls and assigned schedules were visible; midterm grading queue and Nguyễn Minh Anh grading detail were reachable; reusable authoring was clearly separated; the M06 list badge/editor displayed `Bài kiểm tra trên lớp` without `Xếp lớp`.

Known non-blocking output remains the Vite large-chunk advisory (585.35 kB), PostgreSQL `pg` client-query deprecation warnings, and expected negative-path logs. The first focused E2E rerun encountered grading state left by an earlier interrupted local run; deterministic reseeding restored the fixture, after which the focused and full E2E runs passed.

## Visual Gate round 2 fixes

- Previous HEAD: `b65c1d7f31aba49d3465527bff25d768f20e455d`.
- New candidate HEAD: the commit containing this section; the immutable SHA is recorded in the Git handoff after commit/push.
- This pass addresses VG2-F01 through VG2-F07 from the supplied Round 2 findings. It does not claim that the Product Owner Visual Gate has passed; GPT delta review and the final Product Owner retest remain required.

### Finding dispositions

- VG2-F01: `LearningService.getProgress()` no longer flattens a class assignment to `orderBy attemptNumber desc / take: 1`. It now queries attempts separately with both `enrollmentId` and the current set of `classAssessmentId` values, returns `currentAttempt` independently from newest-first `submittedAttempts`, and includes attempt number, submitted time, result visibility, and truthful four-skill state per submitted attempt. Progress shows the active attempt and prior result together; Results lists every published submitted attempt with its own result link.
- VG2-F02: the student filter taxonomy now includes `Luyện tập / Thi thử`; `PRACTICE_MOCK` is excluded from the three IN_CLASS stage filters. Active and open cards receive stronger indigo/blue treatment, upcoming cards remain neutral, and submitted/closed cards are visually quieter while preserving existing CTA rules.
- VG2-F03: instructor teaching cards use consistent title/metadata heights, flex-aligned class sections, and stable class-offering internals while retaining `Bài kiểm tra của lớp` as the dominant M06 action.
- VG2-F04: every non-empty rubric score is validated client-side against `0 <= score <= maxScore`. Invalid fields receive `aria-invalid`, a red treatment, and the exact Vietnamese range message; draft/final actions remain blocked and no request is sent.
- VG2-F05: decimal rubric weights remain unchanged in data and grading math but render as teacher-facing percentages such as `55%` and `45%`.
- VG2-F06: final-graded queue rows now use `Xem / chỉnh điểm`; the detail action remains `Cập nhật điểm cuối`.
- VG2-F07: the submit confirmation presents objective, Speaking, and Writing missing counts as compact bordered rows with status color, icon treatment, and count badges. Submission safety behavior is unchanged.

### Verification and browser evidence

- Focused API: `learning.service.spec.ts` 25/25 PASS, including submitted attempt 1 plus active attempt 2 and explicit assignment/enrollment scoping.
- Focused Web: `m06-assessment-ui.test.tsx` plus `student-assessment-list.test.tsx` 27/27 PASS, covering attempt history/results, Practice/Mock filtering, urgency styling, score validation, percentage weights, and final-review CTA.
- `npm run check:m05-manifest` — PASS: 8 Listening, 8 Reading, 3 Speaking, 2 Writing, 5 rubrics, 8 assets; malformed fixture rejected.
- Prisma validate/generate/deploy/status/drift — PASS: 11 migrations, database up to date, no difference detected.
- `npm run prisma:seed` twice — PASS and idempotent.
- `npm run lint` / `npm run typecheck` — PASS.
- `npm run test` — PASS: API 336/336; Web 220/220.
- `npm run test:e2e -w @smart-elearning/api` — PASS: 91/91.
- `npm run build` / `git diff --check` — PASS. Vite retains the non-blocking 588.74 kB chunk advisory.
- Real Microsoft Edge headless smoke against the current Vite/Nest source passed: Student Progress showed active attempt `2/2` plus submitted attempt 1 and its result link; Results retained attempt 1; assessment taxonomy/urgency and the structured submit dialog rendered; Instructor teaching-card normalization rendered; the final queue used `Xem / chỉnh điểm`; grading detail displayed `Trọng số 55%`; score `5/4` produced immediate inline validation and blocked final action; changing back to a valid score restored the action without mutating the saved grade.

Known non-blocking output remains the Vite large-chunk advisory, PostgreSQL `pg` client-query deprecation warnings, and expected negative-path test logs.
