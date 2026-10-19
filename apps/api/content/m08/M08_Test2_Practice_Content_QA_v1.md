# M08 Test 2 Selected Practice Content QA v1

Status: **PASS — ready for GPT/Product content-pack review; not imported or seeded.**

## Scope lock

- Source: `NEW TOEIC - TEST 2.rar` only.
- Selection manifest SHA-256: `7972b6e7351f6e4d3d410c4f4193fb7cf9c096f8de09592a6d53d024e89ddb18`.
- Content manifest SHA-256: `64FDD32FDC36304BDAC013875A5B3E2601DC90DF994AD992825CE98305AC28F3`.
- Media manifest SHA-256: `8C78DE879AF29860815CAF9F717FCDC0A550B5A7895C2FC16A61924D34CC7598`.
- Application source, Prisma, seed, database, Lesson/Test/ClassAssessment: untouched.
- Selected media ZIP SHA-256: `10B942F5FC968A02875703083275756CD00D6FF58C6EAE837F80211995B87AE9`.

## Automated QA

| Check | Result |
|---|---|
| Exactly 82 selected questions | PASS |
| Exact authoritative selection match | PASS |
| Answer key verified 82/82 | PASS |
| Stable unique content keys | PASS |
| No missing or unreferenced selected media | PASS |
| All media files present; hashes reverified | PASS |
| Selected segmented audio complete (24 assets) | PASS |
| Selected visual/document assets complete (15 assets) | PASS |
| All 24 listening transcripts protected | PASS |
| No transcript text in public/pre-submit projection | PASS |
| No unselected question included | PASS |
| All required shared-stimulus groups preserved | PASS |
| Q65–67 and their media excluded | PASS |

## Counts

- Questions: **82**; groups: **46**.
- By Part: `{"1": 6, "2": 10, "3": 12, "4": 12, "5": 16, "6": 8, "7": 18}`.
- Readiness: `{"READY_WITH_PROCESSING": 30, "READY": 52}`.
- Difficulty: `{"CORE": 34, "FOUNDATION": 29, "STRETCH": 19}`.
- Media: **39** files = 24 MP3 + 15 JPEG.

## Required group integrity

- Part 3: Q32–34, Q44–46, Q56–58, Q68–70.
- Part 4: Q71–73, Q83–85, Q89–91, Q95–97.
- Part 6: Q135–138, Q139–142.
- Part 7: Q164–167, Q168–171, Q176–180, Q186–190.

## Transcript and content safety

Listening transcript text is stored only in stimuli marked `isProtected: true`, `learnerVisiblePreSubmit: false`, and `purpose: LISTENING_TRANSCRIPT`. Part 1/2 learner options are letter-only; spoken option text remains inside the protected transcript. The content pack contains no storage keys and no absolute local source paths.

## Q67 evidence-hygiene clarification

The tagging row for Q67 says the answer combines spoken detail with a supplied visual/graphic, while the prior source audit mapped printed Part 3 graphics only to Q62–64 and Q68–70. This claim is therefore treated as source-evidence inconsistent. Q65–67 are not selected, their audio is not copied, no Q67 visual is produced, and the claim is not propagated into this pack. This has no impact on the authoritative 82-question selection.

## Media strategy

Selected binaries remain in `artifacts/M08_A2_Test2_Practice_Content_v1/media/` pending review. Every binary path, byte size, SHA-256, source page/file, crop rectangle (images), dimensions, and duration (audio) is recorded in `M08_Test2_Practice_Media_Manifest_v1.json`. No application runtime asset directory was modified.

## Reading runtime representation lock

- Part 6/7 learner runtime primary: `READING_STIMULUS_TEXT` — exactly one learner-visible shared stimulus per group.
- Part 6/7 JPEG crops: `SOURCE_REFERENCE_ONLY`, `seedAsLearnerStimulus: false`, review evidence only.
- Duplicate-prevention gate: A2.3b must not seed a Reading JPEG as a second learner-visible stimulus.
- Learner-visible images remain enabled only for Part 1 photographs, Part 3 Q68–70 graphic, and Part 4 Q95–97 graphic.
- Media disposition counts: 24 `LEARNER_AUDIO_STIMULUS`, 8 `LEARNER_VISIBLE_STIMULUS`, 7 `SOURCE_REFERENCE_ONLY`.

## Selected media ZIP evidence

- File: `M08_Test2_Practice_Selected_Media_v1.zip`.
- SHA-256: `10B942F5FC968A02875703083275756CD00D6FF58C6EAE837F80211995B87AE9`.
- Entries: **39**, exactly matching all `packPath` values in the Media Manifest.
- ZIP entry roots preserve `media/audio/...` and `media/images/...`.
- Raw Test 2 archive, PDF, and transcript source files: **not included**.

## Gate

Stop after Content Pack review. No seed/import or M08 recommendation work is authorized by this artifact.
