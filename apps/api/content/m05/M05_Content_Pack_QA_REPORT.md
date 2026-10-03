# M05 — CONTENT PACK QA REPORT

**Pack:** `M05_Content_Pack_v0_1`
**Date:** 2026-10-02
**Verdict:** PASS

## Content counts

- Listening selected: 8 questions
- Reading selected: 8 questions
- Speaking: 3 tasks
- Writing: 2 tasks
- Rubrics: 5
- Static media assets: 8

## Test 1 selection

Listening:
- Part 1: Q3
- Part 2: Q7
- Part 3: Q32–34
- Part 4: Q71–73

Reading:
- Part 5: Q101–102
- Part 6: Q131–132
- Part 7 single-document: Q147–148
- Part 7 richer multi-document source: Q191 + Q194 from source group Q191–195

All selected objective answer keys were cross-checked against `Đáp án Test 1.pdf`.

## Automated content checks

- L/R count = 8 + 8
- no duplicate selected source question number inside a skill
- every objective correct answer exists in its option set
- expected answer-key map matches all 16 selected questions
- every referenced mediaKey exists in `M05_Media_Manifest.json`
- every static asset exists and SHA-256 matches
- every Speaking/Writing task references an existing rubric
- every rubric criterion order is contiguous
- every rubric's weights sum to 1.0

## Security/content notes

- Listening transcripts are stored in the manifest as `isProtected=true`.
- Active learner exam projection must filter them server-side.
- Part 1 image alt text is intentionally neutral so accessibility metadata does not reveal the answer.
- Test 1 real MP3 is canonical; no TTS fallback for failed canonical media.
- S/W content is not auto-scored in M05.
- Speaking Describe Picture reuses a licensed Test 1 image; task prompt/rubric remain project-authored.

## Validation errors

- None

## Warnings

- None

## Status

**CONTENT PACK READY FOR IMPLEMENTATION HANDOFF.**
