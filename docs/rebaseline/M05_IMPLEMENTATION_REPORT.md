# M05 Implementation Report — Four-Skill Placement

## Baseline and scope

- Baseline main: `09422a8fc163cd7c479cfe1da1372d9e1efa4352`
- Feature branch: `feature/m05-four-skills`
- Scope: enable the canonical 45-minute `FOUR_SKILLS` Placement flow while preserving M03/M04 Listening & Reading behavior.
- Product truth: Listening/Reading are objectively graded; Speaking/Writing responses are persisted but remain pending genuine evaluation. No four-skill aggregate, official TOEIC score, fabricated S/W score, or LR-only recommendation is presented as a four-skill result.

## Schema and migration

Migration `20261002150000_m05_four_skills_stimuli` is additive:

- adds `AssessmentStimulusType` (`TEXT`, `IMAGE`, `AUDIO`);
- adds `AssessmentStimulus` with ordered group ownership, protected-content flag, content/media metadata, unique `(groupId, orderIndex)`, index and cascading FK;
- adds nullable task/timing fields to `TestQuestionGroup`;
- enforces non-negative timing, `responseSeconds <= maxRecordingSeconds`, and stimulus payload/type consistency with database CHECK constraints.

Legacy `stimulusText` and `audioUrl` remain. New ordered stimuli take precedence, while existing M03 LR groups keep their legacy rendering fallback.

## Canonical form, content and media

- Canonical test ID: `80000000-0000-4000-8000-000000000021` (`M05_PLACEMENT_FOUR_SKILLS_CORE_V1`).
- Every self-level maps to this one form. Resume lookup is semantic by learner + active status + pre-enrollment Placement context + `FOUR_SKILLS` mode, so an LR and a four-skill attempt may coexist.
- If future work introduces multiple four-skill forms, the current partial uniqueness invariant must be revisited.
- Tasks: 8 Listening, 8 Reading, 3 Speaking `AUDIO_RESPONSE`, and 2 Writing `TEXT_RESPONSE` (21 total).
- Selected source numbers: Listening 3, 7, 32–34, 71–73; Reading 101–102, 131–132, 147–148, 191, 194.
- Speaking tasks: read aloud, describe picture, opinion. Writing tasks: written request, opinion.
- Five project rubrics and their ordered weighted criteria are seeded as real data; M05 does not execute an automatic rubric grader.
- Approved manifests and QA report live under `apps/api/content/m05/`.
- Runtime media live under `apps/api/assets/assessment/m05/test1/{audio,images}` and `apps/api/assets/assessment/m05/speaking/`: four MP3 files and four JPG files.
- Raw RAR/PDF/source paths are not runtime or CI dependencies.

`npm run check:m05-manifest` verifies counts, uniqueness, approved answer mapping, option membership, stimulus payload/order, media references, S/W rubric references, rubric criterion order/weights, file size and SHA-256. Its built-in malformed fixture must also be rejected. CI runs this gate.

## Seed

`prisma/m05-seed.ts` consumes the approved manifests, uses stable deterministic IDs/content keys, and upserts the canonical form, groups, visible/protected stimuli, questions/options, rubrics and criteria. It seeds no learner recording, S/W evaluation, S/W `AttemptSkillScore`, or four-skill recommendation. Two consecutive seed runs completed successfully.

## API, storage and race handling

- Objective and text answers use the owner-scoped Placement save contract; Writing uses debounced `textResponse` upsert.
- Speaking uses a dedicated multipart endpoint with a 10 MiB limit and allowlisted `audio/webm`, `audio/ogg`, `audio/mp4`, and `audio/mpeg` MIME types.
- `AssessmentResponseStorage` isolates storage behavior. The M05 adapter stores generated keys under `.local-storage/assessment-responses/`, which is gitignored. Browser input never supplies a storage path.
- Upload writes a new blob first, then rechecks ownership/status/expiry/question type in a Serializable transaction. Only a successful transaction replaces the answer key; the prior blob is deleted afterward. Rejected or late uploads delete the new orphan best-effort.
- Manual four-skill submit returns `409 AUDIO_UPLOAD_INCOMPLETE` until every Speaking task has a committed audio key. Timeout still finalizes with missing productive responses, and later uploads cannot mutate the submitted attempt.
- Static stimuli and learner playback are owner-scoped. Media keys resolve beneath an approved root only; raw filesystem paths are never returned.
- Learner exam projection filters protected stimuli in the Prisma include and again in projection, and strips correctness, explanations and answer-key fields.

## Learner UX

- `/placement` presents enabled LR and four-skill cards. Four-skill start requires an explicit microphone check; unsupported and denied states are recoverable and never block LR.
- The exam preserves focus layout, timer, mobile collapsible navigator and autosave. Ordered TEXT/IMAGE/AUDIO stimuli support multi-document groups and canonical MP3 playback without TTS fallback.
- Speaking has preparation, explicit start, live/max duration, stop, local playback, re-record, upload/retry and committed playback states. Active recording/upload locks exam navigation and submit; before-unload warns during recording.
- Writing has debounced save state and informational word count.
- Four-skill results show L/R as final and S/W submitted/missing counts as `Chờ đánh giá`. Evaluation and recommendations use a neutral pending state. The internal `TestAttempt.score/maxScore` remains objective L/R-only and is never rendered as a four-skill total.
- Mixed history shows the mode plus compact L/R and S/W state without side effects.
- LR results retain M04 evaluation, deterministic recommendations and live ClassOffering presentation.

## Verification

- `npm run check:m05-manifest`: PASS — 8 Listening, 8 Reading, 3 Speaking, 2 Writing, 5 rubrics, 8 SHA-verified assets; malformed fixture rejected.
- `npm run prisma:validate`: PASS.
- `npm run prisma:generate`: PASS.
- `npm run prisma:migrate:deploy`: PASS — migration applied.
- `npm run prisma:drift-check`: PASS — no difference detected.
- `npx prisma migrate status --config prisma.config.ts` from `apps/api`: PASS — 10 migrations, database up to date.
- `npm run prisma:seed` twice: PASS both times.
- `npm run lint`: PASS.
- `npm run typecheck`: PASS.
- `npm run test`: PASS — API 319/319 and Web 194/194.
- `npm run test:e2e -w @smart-elearning/api`: PASS — 83/83.
- `npm run build`: PASS — API and Web.
- `git diff --check`: PASS.

Observed non-product flakes during implementation:

- one unchanged M03 LR concurrency test initially hit PostgreSQL serialization error `40001`; the unchanged rerun passed;
- one full-Web run timed out in an unrelated admin authorization test; the unchanged isolated rerun passed.
- the Web production build retains the existing Rollup warning for a minified chunk above 500 kB (`543.82 kB`, gzip `152.01 kB`).
- the PostgreSQL driver emits its existing `client.query()` deprecation warning during E2E.

## Security coverage

Tests cover guest/foreign ownership boundaries, guessed or wrong response targets, objective option ownership, response-type separation, protected transcript/answer-key stripping, static media ownership, learner recording ownership, safe generated storage keys/path traversal rejection, MIME/size validation, expiry/submission mutation rejection, incomplete manual submit and late-upload orphan cleanup.

## Known limitations

- Speaking and Writing stay pending because M05 has no genuine evaluator.
- There is no AI grading or instructor grading UI.
- Learner response storage is local filesystem storage intended for the current deployment/demo architecture.
- Browser recording depends on native `MediaRecorder` and supported codecs.
- Visual Gate is handed off for manual review; this report does not claim Visual Gate PASS.

## Visual Gate handoff

1. Open `/placement` and compare LR vs 4 Skills cards.
2. Run microphone preflight; also verify denied and unsupported recovery.
3. Start four-skill mode at desktop width, then inspect the mobile single-column layout.
4. Check Part 1 image/audio, Part 3/4 real MP3 playback, and Part 7 ordered multiple documents.
5. Record, stop, play, re-record and upload every Speaking response.
6. Enter Writing responses and observe save states/word count across navigation.
7. Confirm navigation and submit are blocked during active recording/upload; inspect failed-upload recovery.
8. Submit successfully and verify L/R final plus S/W pending cards with no four-skill recommendation.
9. Exercise timeout with a missing productive response and verify the truthful missing state.
10. Reopen the result from mixed Placement history.
11. Submit an LR attempt and verify the existing M04 result/evaluation/recommendation/ClassOffering flow is unchanged.

## GPT implementation review fixes

Previous reviewed HEAD: `1270b76948840c51885fdb6fc8b82041b6515e7d`.

- F-01 closed: Writing now reports dirty/saving/error state to the exam parent, manual submit remains locked until the current revision is confirmed by the server, and completion of an older request cannot mark a newer revision as saved. Timeout submission remains server-authoritative and unaffected. The confirmation dialog includes pending and failed Writing status.
- F-02 closed: active `MediaRecorder` callbacks are neutralized during teardown, an active recorder is stopped, every acquired media track is stopped, refs are cleared, parent locks are released, and late permission/upload completions do not update unmounted UI or trigger an upload.
- F-03 closed: a new Speaking recording is an explicit uncommitted local draft even when an older server recording exists. The UI says `Bản ghi mới chưa được lưu`, manual submit stays locked through recording/local-draft/upload-error/uploading states, successful upload clears the draft lock, and the learner may discard the draft to keep the prior committed recording.
- F-04 closed: both desktop and mobile navigators group global question numbers under Listening, Reading, Speaking, and Writing while preserving answered/current/marked semantics and the LR flow.
- F-05 closed: Placement mode cards honor `config.modes[].enabled`; disabled modes cannot be selected or started, display the configured availability note, and a restored disabled draft deterministically falls back to enabled LR (or the first enabled mode).

Focused verification:

- Placement frontend regression suite: PASS — 20/20, including current-revision Writing save locking, committed-vs-local Speaking draft behavior, recorder teardown, four-skill navigator grouping, and disabled-mode normalization.
- Web typecheck: PASS.

Full verification after the fixes:

- `npm run check:m05-manifest`: PASS — 8 Listening, 8 Reading, 3 Speaking, 2 Writing, 5 rubrics, 8 assets; malformed fixture rejected.
- `npm run prisma:validate`: PASS.
- `npm run prisma:generate`: PASS.
- `npm run prisma:migrate:deploy`: PASS — 10 migrations, no pending migration.
- `npm run prisma:drift-check`: PASS — no difference detected.
- Prisma migration status: PASS — database schema is up to date.
- `npm run prisma:seed` twice: PASS both times; seed remains idempotent.
- `npm run lint`: PASS.
- `npm run typecheck`: PASS.
- `npm run test`: PASS — API 319/319 and Web 197/197.
- `npm run test:e2e -w @smart-elearning/api`: PASS — 83/83.
- `npm run build`: PASS — API and Web; the pre-existing Web bundle-size warning remains (547.14 kB minified, 152.91 kB gzip).
- `git diff --check`: PASS.

This corrective pass changes only frontend state management, learner-facing availability behavior, regression tests, and this report. It introduces no schema, migration, seed-content, API contract, or scoring/business-rule change.

## Visual Gate Round 1 fixes

Candidate HEAD: `505533d76ff810410ab657efca00d9144ca1b254`.

Manual Visual Gate remains pending retest; this section records corrective implementation evidence only and does not claim Visual Gate PASS.

### VG-F01 — static assessment media runtime delivery

- Reproduced before the fix on the normal development API: both a real JPG and a real MP3 request returned HTTP 400.
- Exact diagnosis: the running Nest module used `__dirname = apps/api/dist/src/modules/placement`. The previous `resolve(__dirname, '../../../assets/assessment/m05')` therefore selected `apps/api/dist/assets/assessment/m05`. For DB key `test1/images/T1-L-P1-Q003.jpg`, the final path was `apps/api/dist/assets/assessment/m05/test1/images/T1-L-P1-Q003.jpg`; neither that root nor file existed. The tracked file is under `apps/api/assets/assessment/m05/test1/images/T1-L-P1-Q003.jpg`.
- `createReadStream` reported the missing-file error asynchronously after the controller had begun constructing the response, which surfaced as the misleading generic 400 observed by the Product Owner.
- Added a dedicated assessment-stimulus media storage component. Its default root is discovered from the `@smart-elearning/api` package root in both source and compiled layouts, with optional `ASSESSMENT_STIMULUS_MEDIA_ROOT` override. Key validation and root-containment traversal protection remain enforced.
- The storage reads and validates file availability before the controller response is created. A configured-but-missing asset is now a controlled `503 STIMULUS_MEDIA_UNAVAILABLE`; invalid/foreign/non-member/protected stimuli remain unavailable through the learner endpoint.
- Actual development runtime smoke: JPG `200 image/jpeg`, 209,975 bytes; MP3 `200 audio/mpeg`, 445,238 bytes.
- Actual compiled runtime smoke after `npm run build`, running `apps/api/dist/src/main.js`: JPG `200 image/jpeg`, 209,975 bytes; MP3 `200 audio/mpeg`, 445,238 bytes.

### VG-F02 — learner-facing group titles

- The idempotent M05 seed now persists explicit Vietnamese learner titles for all twelve internal task-code families: Parts 1–7, three Speaking task types, and two Writing task types.
- `taskCode` remains unchanged for internal policy/data use. Learner group titles no longer expose values such as `L1_PHOTOGRAPH`, `R7_READING_COMPREHENSION`, or `W_OPINION`.
- API E2E verifies representative persisted titles and rejects raw task-code patterns in the learner-facing `title` field.

### VG-F03 and VG-F04 — StrictMode lifecycle guards

- Exact diagnosis: both productive-answer components initialized `mounted` to true, while effect cleanup set it false. React development StrictMode performs a setup → cleanup → setup probe without recreating that ref. Because setup did not explicitly restore true, Speaking discarded the resolved microphone stream before entering `RECORDING`, and Writing ignored a successful current-revision save completion, leaving the visible UI at `Đang lưu…`.
- Both effects now explicitly set the guard active during every setup and inactive during cleanup. Genuine unmount still neutralizes recorder callbacks, stops recorder/tracks, clears refs/parent locks, blocks late UI mutation, and retains Writing revision/stale-completion protection.
- StrictMode Speaking regression covers ready → visible recording/stop → uncommitted local draft → upload → committed state and submit unlock. The genuine-unmount teardown regression remains green.
- StrictMode Writing regression covers dirty/save locking, successful `Đã lưu`, submit unlock, and proof that a stale first request cannot clear a newer revision.

### Focused verification

- Assessment stimulus media storage unit tests: PASS — 3/3 (compiled-root discovery, actual committed asset/traversal defense, controlled missing-media error).
- Placement API E2E: PASS — 13/13, including real JPG/MP3 bytes and MIME types, foreign owner denial, guessed stimulus denial, protected transcript stripping, learner-friendly titles, and preserved `AUDIO_UPLOAD_INCOMPLETE` behavior.
- Placement frontend regression suite: PASS — 20/20, including StrictMode Speaking and Writing flows plus genuine-unmount cleanup.
- Runtime smoke in development and compiled execution: PASS for both real JPG and real MP3 requests.

### Full verification

- `npm run check:m05-manifest`: PASS — 8 Listening, 8 Reading, 3 Speaking, 2 Writing, 5 rubrics, 8 assets; malformed fixture rejected.
- `npm run prisma:validate`: PASS.
- `npm run prisma:generate`: PASS.
- `npm run prisma:migrate:deploy`: PASS — 10 migrations, none pending.
- `npm run prisma:drift-check`: PASS — no difference detected.
- Prisma migrate status with the repository config: PASS — database schema is up to date.
- `npm run prisma:seed` twice: PASS; title updates remain idempotent.
- `npm run lint`: PASS.
- `npm run typecheck`: PASS.
- `npm run test`: PASS — API 322/322 and Web 197/197.
- `npm run test:e2e -w @smart-elearning/api`: PASS — 83/83.
- `npm run build`: PASS — API and Web; the existing Web chunk warning remains (547.17 kB minified, 152.91 kB gzip).
- `git diff --check`: PASS.

No schema/migration, scoring/recommendation, AI grading, instructor grading, or M06/M07/M08 change was introduced. Manual FOUR_SKILLS submission still requires committed audio for every Speaking task and preserves `AUDIO_UPLOAD_INCOMPLETE`.
