# M07 Implementation Report — Instructor LMS

## Status

- Milestone: M07 — Instructor LMS
- Branch: `feature/m07-instructor-lms`
- Base `main`: `35bcdef55fee32c5eddfb9be5194d5e0c01ead4c`
- Candidate status: ready for GPT implementation review
- Database migration: none; the M07 design is implemented with the existing schema
- Boundaries preserved: no merge, no `main` push, no M08/M09 work

## Delivered scope

### Class-centered instructor workspace

- Added an instructor class list with search, class status, schedule, learner count, and one primary **Vào lớp** action.
- Added a responsive class workspace with six tabs: Overview, Learners, Content, Assessments, Grading, and Results.
- Added class overview metrics, upcoming/open assessment visibility, roster search, and read-only learner detail.
- Learner detail uses one latest, fully finalized, same-assessment four-skill snapshot; it does not combine scores from unrelated attempts.
- Preserved submitted attempt history and surfaced lesson progress and instructor feedback.

### Shared course content and protected documents

- Kept Modules, Lessons, and Resources course-scoped and clearly warns instructors that edits affect every class using that course.
- Added optimistic concurrency for shared content updates with `expectedUpdatedAt` and `409 STALE_SHARED_CONTENT`.
- Added safe instructor document upload/replacement for PDF, DOCX, PPTX, XLSX, and TXT, with extension/MIME/signature checks and a 20 MB limit.
- Added storage-key traversal protection, protected instructor preview, authorized student download, private/no-store responses, and replacement cleanup.
- Student delivery requires an ACTIVE enrollment in a class belonging to the resource's course.

### Four-skill authoring

- Requires `toeicSkill` for new questions.
- Restricts Listening/Reading to objective answers and Speaking/Writing to audio/text response modes.
- Requires an active rubric for productive questions and forbids objective answer options for productive items.
- Added rubric list/read endpoints and four-skill filters in the Question Bank.
- Added grouped Test Builder authoring: group CRUD/reorder, text/media stimuli, stimulus reorder/delete, skill-compatible question selection, and moving questions between compatible groups.
- Preserved historical-attempt mutation locks and added publish validation for points, rubrics, media, groups, and four-skill structure.

### Scheduling, grading, and reporting

- Added purpose-aware class assessment scheduling while keeping templates and the Question Bank course-shared.
- Added a deterministic oldest-submission-first class grading inbox with status/search filters.
- Added optimistic grading concurrency using `AnswerEvaluation.updatedAt` and `409 STALE_GRADING_EVALUATION`.
- Added save/finalize plus next-item navigation only after a successful mutation.
- Added truthful class result counts, latest-submitted-attempt representatives, FINAL-only skill averages, sample size, and excluded count.
- All instructor workspace reads are scoped to the authenticated instructor's owned ClassOffering.

## Deterministic M07 fixture

- Added `apps/api/prisma/m07-seed.ts` and integrated it into the root seed.
- The primary demo class contains 11 active learners total, including 9 M07 Vietnamese learner accounts with mixed lesson progress.
- Existing M06 periodic/midterm/final and mixed pending/final/multiple-attempt data are reused instead of duplicated.
- Added one project-authored stored TXT handbook for protected file-delivery verification.
- Repeated seed execution is idempotent.

## Test coverage

- Instructor ownership/IDOR boundaries.
- Bounded roster/overview aggregates and deterministic grading order.
- Same-attempt finalized four-skill snapshot and FINAL-only class averages.
- Storage type/signature/size/traversal validation and replacement cleanup.
- Shared-content and grading optimistic concurrency.
- Productive-question/rubric matrix, group skill compatibility, historical mutation locks, and group movement.
- Workspace navigation, roster search/read-only semantics, and truthful results UI.
- M07 E2E covers workspace/roster/detail, IDOR, protected file delivery, content concurrency, grading queue, and results.

## GPT implementation review fixes

- F-01/F-05/F-07/F-08: Student stored-resource downloads now use the visible Lesson action and an authenticated Blob flow; learner payloads omit `storageKey`; download headers use one RFC 5987 UTF-8 helper; multipart metadata is DTO-validated.
- F-02: one reusable publishability validator now protects published-test mutations atomically and is rechecked defensively before class scheduling.
- F-03/F-10: the grading inbox excludes objective-only attempts, distinguishes waiting/partial/final instructor review, and shows summary counts, L/R snapshots, and productive finalized/total evidence.
- F-04/F-06: parent deletion removes stored objects only after database commit; upload downloadability is preserved; stored resources cannot be converted through generic link editing.
- F-09/F-11/F-12: legacy research features are removed from the primary Instructor class flow; TOEIC skills and statuses use Vietnamese labels; roster/results have mobile cards; class Content uses a desktop outline/editor workspace with a stacked mobile fallback.
- Regression coverage includes visible Blob download, raw-key stripping, multipart true/false transformation, storage cleanup timing, representation invariants, grading truth, published mutation validation, defensive scheduling, responsive cards, and browser-level visible download evidence.

## GPT implementation re-review round 2

- RR-01: Question Bank updates now collect every referencing `PUBLISHED` Test inside the same serializable transaction, preserve the historical-attempt lock, apply the Question/options mutation, and re-run the complete publishability invariant for every collected Test before commit. Any invalid referenced Test rejects the request and atomically rolls back the Question/options mutation; Tests are never demoted automatically.
- RR-01 regression coverage verifies rejection of a grouped-Test skill mismatch, acceptance of safe wording/difficulty edits, validation of multiple referencing published Tests, and the unchanged pre-mutation historical-attempt lock.
- RR-02: stored-document metadata edits now omit disabled `type` and `url` fields and send only `title`, `isDownloadable`, and `expectedUpdatedAt`. The service whitelists stored metadata updates, preserves `DOCUMENT`/null URL/storage metadata, rejects generic kind conversion and malformed null-bearing payloads, and keeps valid external-resource editing intact.
- RR-02 regression coverage verifies stored title and downloadability edits, exact preserved update fields, malformed/conversion rejection, external editing, and a browser-level visible metadata edit with persistence after reload and fixture restoration.

## Verification

| Gate | Result |
| --- | --- |
| `npm run check:m05-manifest` | PASS — 8 Listening, 8 Reading, 3 Speaking, 2 Writing, 5 rubrics, 8 assets |
| `npm run prisma:validate` | PASS |
| `npm run prisma:generate` | PASS |
| `npm run prisma:migrate:deploy` | PASS — 11 migrations, no pending migration |
| `npm run prisma:status` | PASS — schema up to date |
| `npm run prisma:drift-check` | PASS — no schema difference |
| `npm run prisma:seed` ×2 | PASS — idempotent |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm run test` | PASS — API 383/383; Web 231/231 |
| `npm run test:e2e -w @smart-elearning/api` | PASS — 97/97 after deterministic reseed |
| `npm run build` | PASS |
| `git diff --check` | PASS |

## Developer browser smoke

The repeatable CDP smoke driver is `scripts/m07-browser-smoke.mjs`. It was run against local API `http://localhost:3000/api` and Web `http://localhost:5173` in Chrome headless with the local seed credential supplied only through `M07_SMOKE_PASSWORD`.

All 21 checks passed:

1. Isolated 1,000-question server-paginated picker, followed by complete fixture cleanup.
2. Instructor teaching list.
3. Class overview.
4. Roster.
5. Learner detail.
6. Shared-content warning.
7. Upload, Video, and Link resource creation modes.
8. Four-skill Question Bank pagination/import entry points.
9. Malformed XLSX error display without persistence.
10. Template download plus warning-only XLSX preview, row-level existing-bank warning, enabled safe confirm state, no UI confirmation, and temporary fixture cleanup.
11. Safe Question Bank return to the originating class-assessment route.
12. Guided grouped Test Builder.
13. Class scheduling.
14. Grading inbox.
15. Grading detail and same-attempt response navigator.
16. Class results.
17. Visible stored-document metadata edit, persistence after reload, and deterministic title restoration.
18. Visible Student LessonPage stored-document download through the user-facing action.
19. Protected student document delivery with attachment headers and body verification.
20. Mobile class workspace/drawer at 390 × 844.
21. Tablet results at 820 × 1180.

No horizontal page overflow was detected in any checked viewport. The smoke pass exposed and corrected aborted-request handling on instructor pages under browser navigation, and corrected Question Bank copy to describe four-skill authoring truthfully.

This is a developer smoke pass, not the Product Owner Manual Visual Gate.

## Product Owner Visual Gate Round 1 redesign

- **VG07-01 — Teaching list:** replaced oversized class cards with a compact desktop table and responsive mobile cards; schedule slots are projected as `HH:mm`, with no database transport date exposed.
- **VG07-02 — Class overview:** added a clear KPI hierarchy, lesson-completion evidence, assessment windows, status, and submitted/active learner counts.
- **VG07-03 — Roster:** added striped operational rows, proportional progress bars, latest learning activity, and latest assessment state while retaining the mobile-card fallback.
- **VG07-04 — Learner detail:** renamed the four-skill summary, added proportional score bars, and grouped attempt history by assessment with nested attempts.
- **VG07-05 — Course content:** retained the desktop outline/editor hierarchy and separated resource authoring into Upload, Video, and Link modes; stored-file editing shows safe metadata and replacement/delete controls.
- **VG07-06 — Question Bank scale:** added server-side search/filter/usage pagination, usage counts, and bounded page sizes.
- **VG07-07 — XLSX import:** added a 5 MB, 2,000-row, `.xlsx`-only two-stage preview/confirm workflow, formula rejection, row-level errors, deterministic template download, and all-or-nothing persistence.
- **VG07-08 — Navigation context:** Question Bank and Kho đề accept only safe instructor-class return paths, preserving the class workflow context.
- **VG07-09 — Product terminology:** renamed user-facing “Mẫu bài kiểm tra” to “Kho đề”; internal route, model, and API names are unchanged.
- **VG07-10 — Guided Test Builder:** added a five-step authoring cue, three-column structure/metadata/validation workspace, “Phần thi”/“Ngữ liệu” copy, preview dialog, and a server-paginated multi-select question drawer whose selections survive page changes.
- **VG07-11 — Class assessment scheduling:** clarified the flow as select đề → set schedule → assign to class, with return-aware links to shared authoring tools.
- **VG07-12 — Grading queue:** grouped submissions by assessment, learner, and attempt, with assessment/stage/state/search filters and compact objective/productive evidence.
- **VG07-13 — Grading continuity:** next-item actions now advance to the next unfinished productive response in the same attempt before moving to another learner attempt.
- **VG07-14 — Results dashboard:** added top KPI cards, grading-completion progress, skill-average bars with sample/exclusion evidence, and a striped learner matrix/mobile cards.
- **VG07-15 — Responsive consistency:** aligned cards, tables, chips, spacing, progress bars, and responsive fallbacks across the primary instructor workspace.
- **VG07-16 — Regression evidence:** added schedule projection, paginated question query, safe XLSX inert-data handling, and updated browser-smoke checkpoints. Product Owner Round 2 remains required; this implementation report does not claim Visual Gate PASS.

No Prisma schema change or migration was required for this redesign.

## XLSX import security and preview correction

- Removed the direct `exceljs@4.4.0` runtime dependency and its affected transitive chain. XLSX input now uses exact-pinned `read-excel-file@9.3.10`; deterministic templates use exact-pinned `write-excel-file@4.1.1`. Both packages support Node.js 22, are MIT licensed, and separate the untrusted read path from template generation.
- The reader returns cell values only and does not evaluate formulas. Formula cells are therefore treated as inert cached values (or empty when no cached value exists); the server never executes spreadsheet formulas. The library does not expose formula metadata, so the import does not claim reliable formula detection or rejection.
- Preview validates all referenced productive rubrics with one set-based active-rubric query and reports an inactive/missing rubric as a row-level error. Confirm retains the existing transactional rubric check as defense in depth.
- Preview derives a canonical `(toeicSkill, responseType, normalized content)` key, reports duplicates inside the uploaded file and against the existing course Question Bank as row-level `warnings[]`, and keeps warnings separate from blocking `errors[]`.
- Existing-bank detection uses one bounded, case-insensitive candidate query (distinct rows, maximum 2,000 results); preview still enforces `.xlsx`, 5 MB, and 2,000-row limits before persistence.
- The UI shows valid/invalid/warning counts and row-level warning detail. Warning-only previews remain confirmable; any row error keeps all-or-nothing confirmation disabled.
- Regression coverage includes template round-trip readability, malformed XLSX handling, inert formula behavior, size/row caps, preview-time active-rubric validation, duplicate warnings, warning/error UI states, and unchanged atomic confirmation.
- `npm audit --json` changed from 46 findings (8 moderate, 36 high, 2 critical) before replacement to 44 findings (6 moderate, 36 high, 2 critical) afterward. High/Critical counts did not increase; the remaining High/Critical findings are pre-existing monorepo dependencies, and neither exact-pinned XLSX package appears in the audit findings.

No Prisma schema change or migration was required for this correction.

## Product Owner Visual Gate Round 2 targeted redesign

- **R2-01 — Teaching hierarchy:** classes are grouped by Course by default, with course/status/day/search filters, deduplicated schedule chips, semantic status colors, and non-wrapping desktop actions.
- **R2-02 — Overview value:** the class dashboard now answers learner count, aggregate progress, five progress buckets, assessment submission states, grading composition, actionable follow-ups, and upcoming open/close deadlines. Grading and assessment summaries link to existing workspaces.
- **R2-04 — Learner evidence:** learner detail adds an operational summary, module completion, finalized in-class skill trend, timestamp-derived activity timeline, collapsed historical assessment groups, and duplicate-feedback removal.
- **R2-06 improvement — Student video:** trusted YouTube watch, short, and embed URLs render through `youtube-nocookie.com`; arbitrary URLs remain external links.
- **R2-09 — Assessment language:** primary copy now uses “Ngân hàng câu hỏi”, “Đề kiểm tra”, and “Lịch kiểm tra của lớp”, supported by a three-step teacher flow and an explicit media relationship panel.
- **R2-10 unblock — Guided builder:** the Test Editor now exposes five navigable authoring steps, keeps selected-Part context for the paginated picker, and preserves the safe return path when creating a question.
- **R2-11 — Scheduling language:** assignment copy follows the five teacher decisions from published test through class assignment; existing scheduling rules and locks are unchanged.
- **R2-14 — Results value:** results show completion composition, plain-language denominators, per-skill score distributions, finalized in-class cross-assessment trend, and the existing learner drill-down matrix with search.

The redesign uses existing timestamps and assessment records only. It does not add predictive analytics, a chart dependency, a Prisma migration, or a new event model. Product Owner Round 3 remains required; this report does not claim Visual Gate PASS.

## Round 3 browser smoke

- Candidate before smoke: `f1a5838012c04a8e1e7b6863cb37ff8dc30d5faf`.
- Dedicated Google Chrome was launched headless with CDP port `9333` and an isolated temporary profile; the process and profile were removed after the run.
- Result: **40/40 checks PASS**, with zero horizontal-overflow failures at desktop `1440×900`, tablet `820×1180`, and mobile `390×844`.
- Coverage includes Course-grouped Teaching and filters, meaningful Overview data/actions, enriched learner detail, the three-concept Assessment Hub, visible five-step Test Builder navigation, the 1,000-question server-paginated picker, Results completion/distribution/trend/matrix, inline `youtube-nocookie.com` playback and safe external-video fallback, protected downloads, resource modes, XLSX preview/warnings, grading hierarchy, same-attempt navigation, and safe class return context.
- Temporary fixtures cleaned: 1,000 scale questions, one XLSX duplicate question, and two VIDEO resources. The deterministic seed was not changed.
- Smoke found and corrected two narrow regressions: React StrictMode abort handling on learner detail, and primary Assessment Hub link labels. This remains engineering verification and does not claim Product Owner Visual Gate PASS.

## Known non-blocking observations

- Vite reports a 655.72 kB minified JavaScript bundle (178.24 kB gzip), above its 500 kB advisory threshold.
- PostgreSQL/`pg` emits the pre-existing deprecation warning during database verification.
- Negative-path unit/E2E cases intentionally emit expected service error logs.
- Windows Git reports LF-to-CRLF working-copy notices; `git diff --check` remains clean.

## Review handoff

Reviewers should focus on instructor ownership boundaries, shared-content concurrency, protected file delivery, productive-question validation, historical assessment locks, grading concurrency, and result aggregation semantics. No milestone merge is performed by this implementation task.

## Visual Gate Round 3 corrections

Candidate before this correction: `331a30d34187b68210fc33bee8539b23c0f8b796`.

| Finding | Disposition |
| --- | --- |
| R3-01 | Preserved the teaching catalog regression. Persistence has `CANCELLED`, not a distinct `CLOSED` enum; the Instructor catalog continues to project `CANCELLED` as the visible `CLOSED` state and keeps `COMPLETED` distinct. No schema state was invented. |
| R3-02 | Added learner-backed drill-downs for every progress bucket, grading state, assessment submission state, and the 7-day inactive cohort. The progress numerator now explicitly explains `learners × lessons`; timeline labels separate opening and closing events. |
| R3-03 | Preserved roster ownership, search, responsive cards, and read-only membership behavior. |
| R3-04 | Collapsed multiple final rubric evaluations from one attempt into one user activity event. Clarified that the skill trend uses final internal 0–100 results and is not a TOEIC score or causal ability claim. |
| R3-05/R3-06 | Preserved content-management and Assessment Hub regressions. |
| R3-07 | Rewrote only the M07-VG demo questions with self-contained workplace context. Question Bank and picker now show response type, skill, rubric/required-stimulus guidance, usage, search, filters and server pagination. |
| R3-08/R3-09 | Added a pre-commit confirmation dialog after an enabled `Xác nhận nhập` click. Cancel performs no mutation; invalid previews remain disabled; backend revalidation and transactional persistence remain authoritative. |
| R3-10 | Root cause confirmed in code: reorder returned thin groups without `stimuli`/`testQuestions`, while the next render dereferenced both relations. The API now returns complete ordered groups. The five steps now separate metadata, structure, contextual question/stimulus authoring, settings/readiness, and student preview/publish safeguards. Seeded titles use numbered Vietnamese skill labels. |
| R3-11/R3-12 | Distribution values remain FINAL-only learner counts. Buckets and completion states filter to named learners; missing/pending values remain `Chưa có`/`Đang chờ`, never zero. Learner profile deep links are ownership-scoped. |
| R3-13/R3-14 | Preserved assessment → learner → attempt grading hierarchy and same-attempt draft navigation. |
| R3-15 | YouTube resources are compact by default and mount the privacy-enhanced iframe only after explicit expansion; no autoplay. The seed now uses the relevant ETS Global TOEIC experience video instead of the unrelated developer demo. Protected document delivery and external-link behavior are unchanged. |
| R3-16 | Responsive retest is required at 1440×900, 820×1180 and 390×844. Engineering checks do not constitute Product Owner approval. |

No Prisma schema change or migration was required. This implementation report does not claim that the Product Owner Manual Visual Gate passed.

### Round 3 correction verification

- Focused API regression: **45/45 PASS** across Assessment Instructor and Instructor Workspace services.
- Focused Web regression: **32/32 PASS** across Test Builder, Question Bank, Instructor Workspace, and Student Learning.
- Full API unit: **385/385 PASS**; full Web: **235/235 PASS**; API E2E: **97/97 PASS**.
- Prisma validate/generate/status/drift, deterministic seed, M07 data manifest, M05 manifest, lint, typecheck, build, and `git diff --check`: **PASS**.
- Dedicated headless-Chrome correction smoke: **40/40 PASS**, including the 1,000-question picker, five-step builder, class drill-down surfaces, Results story, protected document delivery, lazy/collapsible YouTube playback, and safe arbitrary-video fallback.
- Responsive evidence: desktop `1440×900`, tablet `820×1180`, and mobile `390×844` completed with **0 horizontal-overflow failures**.
- Smoke-owned fixtures were cleaned: 1,000 scale questions, one XLSX duplicate, and two temporary VIDEO resources. A final deterministic reseed/data-manifest check was run after smoke.

These are engineering verification results only. Product Owner Round 3 correction retest remains the release gate.
