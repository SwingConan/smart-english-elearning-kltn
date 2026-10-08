# M07 Manual Visual Gate Data Readiness Report

## Candidate

- Branch: `feature/m07-instructor-lms`
- Source HEAD before data preparation: `ea9ef7fb5616bb645c0973bd8c116a8b04c7a45c`
- Base `origin/main`: `35bcdef55fee32c5eddfb9be5194d5e0c01ead4c`
- Scope: deterministic development/demo data preparation and validation only
- Schema migration: none

## Accounts

The local password is supplied only through `SEED_DEFAULT_PASSWORD`; it is intentionally not recorded here.

| Role | Name | Email |
|---|---|---|
| Instructor | Trần Thu Hà | `instructor.demo@smart-elearning.local` |
| Primary learner | Nguyễn Minh Anh | `student.demo@smart-elearning.local` |

## Primary class and curriculum

- Course: `TOEIC Workplace Foundations`
- Class: `TOEIC-LR-2609-EVE` — `TOEIC L&R Foundation — Tối T3/T5`
- Status: `IN_PROGRESS`
- Active learners: **11**
- Curriculum: **3 Modules / 8 Lessons**

The Instructor catalog contains **10 classes across 5 Courses**:

| Course | Class code | Class | Visible status |
|---|---|---|---|
| TOEIC Workplace Foundations | `TOEIC-LR-2609-EVE` | TOEIC L&R Foundation — Tối T3/T5 | IN_PROGRESS |
| TOEIC Workplace Foundations | `TOEIC-LR-2611-WE` | TOEIC L&R Foundation — Cuối tuần | OPEN |
| TOEIC Listening Focus | `TOEIC-LIS-01` | Listening buổi tối | OPEN |
| TOEIC Listening Focus | `TOEIC-LIS-02` | Listening cuối tuần | COMPLETED |
| TOEIC Reading Strategies | `TOEIC-REA-01` | Reading tăng tốc | IN_PROGRESS |
| TOEIC Reading Strategies | `TOEIC-REA-02` | Reading thực hành | CANCELLED (`Đã hủy`) |
| TOEIC L&R Advancing | `TOEIC-LR-ADV-01` | L&R nâng cao tối | OPEN |
| TOEIC L&R Advancing | `TOEIC-LR-ADV-02` | L&R nâng cao cuối tuần | OPEN |
| Workplace Writing Foundations | `WRITING-FDN-01` | Writing nền tảng | OPEN |
| Workplace Writing Foundations | `WRITING-FDN-02` | Writing thực hành | OPEN |

All seeded schedule slots are unique within their class/day/time/location tuple.

## Learner progress

Progress is derived from persisted `LessonProgress` rows across the eight Lessons.

| Bucket | Learners |
|---|---:|
| 0–24% | 2 |
| 25–49% | 2 |
| 50–74% | 3 |
| 75–99% | 2 |
| 100% | 2 |

Detailed deterministic distribution:

| Learner | Completed Lessons | Progress |
|---|---:|---:|
| Nguyễn Minh Anh | 4/8 | 50% |
| Trần Ngọc Anh | 2/8 | 25% |
| Nguyễn Minh Khang | 6/8 | 75% |
| Lê Hoàng Lan | 8/8 | 100% |
| Phạm Gia Huy | 5/8 | 63% |
| Võ Thu Trang | 3/8 | 38% |
| Đặng Bảo Long | 7/8 | 88% |
| Bùi Thanh Hà | 1/8 | 13% |
| Đỗ Quốc Việt | 5/8 | 63% |
| Hồ Mai Phương | 8/8 | 100% |
| Trương Tuấn Dũng | 0/8 | 0% |

Nguyễn Minh Anh, Trần Ngọc Anh and Nguyễn Minh Khang have activity older than seven days in the fixed October 2026 demo timeline. The other eight learners have recent activity.

## Persistent learning resources

All three resources are attached to `Welcome & Course Overview`:

| Title | Type | Expected behavior |
|---|---|---|
| Cẩm nang học tập của lớp | DOCUMENT | protected stored `text/plain` object; downloadable as `cam-nang-hoc-tap.txt` |
| Trải nghiệm bài thi TOEIC Listening & Reading | VIDEO | relevant ETS Global experience video, using the safe `youtube-nocookie.com` embed path |
| Tài nguyên TOEIC tham khảo | LINK | opens as an external HTTPS resource |

## Question Bank

The M07 pack contains exactly **80** reusable project-authored Questions, identified by the `M07-VG-` content prefix:

| Skill / response type | Count |
|---|---:|
| Listening / SINGLE_CHOICE | 24 |
| Reading / SINGLE_CHOICE | 24 |
| Speaking / AUDIO_RESPONSE | 16 |
| Writing / TEXT_RESPONSE | 16 |

All 32 productive Questions reference active M05 rubrics. The M05 canonical Questions remain intact. No 1,000-question browser-smoke fixture is persisted.

## Manual XLSX fixtures

- `scripts/fixtures/m07/M07_MANUAL_GATE_IMPORT_WARNING_ONLY.xlsx`
  - 2 valid duplicate rows
  - 0 errors
  - at least 2 duplicate warnings
  - confirmation remains enabled
- `scripts/fixtures/m07/M07_MANUAL_GATE_IMPORT_ERROR.xlsx`
  - productive Writing row without a rubric reference
  - at least 1 row error
  - confirmation is disabled

Both workbooks are small, contain no macros and contain no formulas.

## Safe draft Test

- Title: `VG-R3 — Đề demo hướng dẫn`
- Purpose: `IN_CLASS`
- Status: `DRAFT`
- Historical attempts: **0**
- Structure: Listening, Reading, Speaking and Writing Parts
- Stimulus: one project-authored TEXT stimulus in the Listening Part

Reseeding removes draft structure mutations and restores this exact four-Part baseline.

## Assessment and grading states

Results denominators use the latest submitted attempt per learner. Midterm retains eight raw attempt records because Nguyễn Minh Anh has two attempts, while the submitted learner denominator is seven.

| Assessment | Availability | Submitted learners | Fully FINAL | PARTIAL | WAITING | Not submitted |
|---|---|---:|---:|---:|---:|---:|
| Kiểm tra thường kỳ 01 | CLOSED | 8 | 6 | 1 | 1 | 3 |
| Kiểm tra giữa kỳ | OPEN | 7 | 5 | 1 | 1 | 4 |
| Kiểm tra cuối kỳ | UPCOMING | 0 | 0 | 0 | 0 | 11 |

Exact latest Midterm examples:

- FINAL: Nguyễn Minh Anh, Trần Ngọc Anh, Nguyễn Minh Khang, Lê Hoàng Lan, Phạm Gia Huy
- PARTIAL: Võ Thu Trang
- WAITING: Đặng Bảo Long

Additional grouped-history case:

- Nguyễn Minh Anh Midterm attempt #1 is WAITING and contains both Speaking and Writing responses.
- Nguyễn Minh Anh Midterm attempt #2 is fully FINAL.

Periodic skill denominators shown by Results:

- Listening: 8
- Reading: 8
- Speaking: 7
- Writing: 6

Midterm latest-attempt skill denominators shown by Results:

- Listening: 7
- Reading: 7
- Speaking: 6
- Writing: 5

Both Periodic and Midterm have at least five fully FINAL learners and varied scores across at least three distribution bands.

## Primary learner storyline

Nguyễn Minh Anh has module progress, recent assessment activity, grouped Midterm history and two trend-bearing assessments.

| Assessment / attempt | Listening | Reading | Speaking | Writing | State |
|---|---:|---:|---:|---:|---|
| Periodic attempt #1 | 84 | 78 | 74 | 70 | fully FINAL |
| Midterm attempt #1 | 78 | 72 | Pending | Pending | productive grading WAITING |
| Midterm attempt #2 | 88 | 82 | 78 | 76 | fully FINAL |

Values are internal normalized percentages and are not official TOEIC scores.

## Reset contract

From the repository root, with the local seed environment already configured:

```bash
npm run prisma:seed
npm run check:m07-visual-gate-data
```

No manual SQL is required. The seed does not print or persist the seed password.

## Validator manifest

```text
M07 Visual Gate data manifest PASS

Classes: 10
Courses: 5
Class statuses: OPEN / IN_PROGRESS / COMPLETED / CANCELLED
Primary class active learners: 11
Progress buckets: 2 / 2 / 3 / 2 / 2
Question Bank: 80 (24 Listening / 24 Reading / 16 Speaking / 16 Writing)
Periodic: 8 submitted / 6 final / 1 partial / 1 waiting
Midterm: 7 learners submitted / 5 final / 1 partial / 1 waiting
Trend-bearing assessments: 2
Draft test: VG-R3 — Đề demo hướng dẫn
Resources: stored + YouTube + external
XLSX fixtures: 2
Scale-fixture leak: 0
```

This report records data readiness only. It does not claim Product Owner Manual Visual Gate PASS.
