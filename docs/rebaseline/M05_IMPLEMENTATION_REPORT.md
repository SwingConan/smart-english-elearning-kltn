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
