# M02 Implementation Report — Public TOEIC Website + Student LMS

## A. Git

- Start main SHA: `844573fd38b54c3ac0d409a71ba272e30c0892b3`
- Branch: `feat/m02-public-student-lms-productization`
- Logical commits:
  - `40a388c` — `feat(m02): add product APIs and realistic demo seed`
  - `4100926` — `feat(m02): productize public TOEIC website`
  - `78b66e1` — `feat(m02): productize student class LMS`
  - Quality/report commit: recorded in Git history after this report is committed
- Final HEAD: use `git rev-parse HEAD` after the quality/report commit.
- The implementation started from canonical `main == origin/main`.
- Source DOCX/XLSX artifacts in the repository root remain untracked and are not part of any commit.

## B. Independent review resolution

The independent-review file was not present in the repository. The mapping below uses the finding identifiers and acceptance themes carried into the approved implementation prompt; it does not invent or replace the external review document.

| Finding | Resolution | Evidence |
| --- | --- | --- |
| F-01 News/Events | Implemented | `apps/web/src/content/news-events.ts`, list/detail routes, 4 typed items and not-found state |
| F-02 ClassOffering detail | Implemented | `GET /api/class-offerings/:id`, `ClassOfferingDetailPage.tsx`, public-safe select and state-aware enrollment CTA |
| F-03 Schedule seed | Implemented | Structured `ClassScheduleSlot` seed using the schema's 1–7 weekday contract; UI formats the structured values |
| F-04 Demo seed depth | Implemented | 5 Courses, 10 ClassOfferings, schedules, a 3-module/8-lesson main class, resources, assessments and enrollment states |
| F-05 Target-score filter | Deferred by approved data reality | Current Course schema has no unambiguous target-score range. No fake frontend threshold was introduced. |
| F-06 Course/ClassOffering separation | Implemented | Catalog cards/details model Course; schedule, tuition, capacity and enrollment remain ClassOffering concerns |
| F-07 Placement CTA conflict | Implemented within M02 boundary | Public CTA routes to `/guide#placement`; it does not start an attempt or claim a result |
| F-08 ClassShell and legacy navigation | Implemented | Core shell has Overview, Learning, Tests, Results and Progress. Mastery/Adaptive routes remain for regression but are absent from core navigation. |
| F-09 Resource access | Implemented | ACTIVE enrollment ownership and Course-resource scoping; external URL delivery is authorized through a dedicated API contract |
| F-10 Progress product contract | Implemented | Overall, module, lesson and assessment progress from persisted state; no BKT mastery used as core progress |
| F-11 Assessment purpose boundary | Implemented | Class assessment list includes `IN_CLASS`/`PRACTICE_MOCK` and excludes Placement; legacy direct-start regression remains compatible |
| F-12 Explicit ClassOffering code | Implemented | All M02 seed offerings have deterministic codes; code is returned and displayed |
| F-13 Schema drift check | Implemented | `npm run prisma:drift-check` plus CI shadow-database step |
| F-14 Loading/error/responsive/a11y | Implemented | Demo-critical pages include state handling, mobile drawers, focus styles, labelled icon controls and table overflow |
| F-15 Automated coverage | Implemented where repository tooling exists | API unit, Web Vitest and API E2E extended. The repository has no Playwright dependency/script. |
| F-16 Screenshot/browser evidence | Deferred by environment | Local runtime/API smoke was performed; no browser automation or screenshot tool is configured in this repository/session. |

## C. Routes and screens

| Route | Page/layout | Backend dependency | Status |
| --- | --- | --- | --- |
| `/` | `HomePage` in `PublicLayout` | public catalog + typed news | Implemented |
| `/catalog` | `CatalogPage` | `GET /api/courses` | Implemented |
| `/catalog/:slug` | `CourseDetailPage` | `GET /api/courses/:slug` | Implemented |
| `/classes/:id` | `ClassOfferingDetailPage` | `GET /api/class-offerings/:id` + enrollment APIs | Implemented |
| `/guide` | `GuidePage` | static product content | Implemented |
| `/news-events` | `NewsEventsPage` | typed static content | Implemented |
| `/news-events/:slug` | `NewsEventDetailPage` | typed static content | Implemented |
| `/about` | `AboutPage` | none | Implemented |
| `/contact` | `ContactPage` | none; no fake submit form | Implemented |
| `/student/enrollments` | `MyEnrollmentsPage` | enrollment list with progress summary | Implemented |
| `/student/enrollments/:enrollmentId` | `ClassOverviewPage` in `ClassShellLayout` | enrollment detail, content, progress | Implemented |
| `.../learn` | `LearningPage` | Course curriculum/content | Implemented |
| `.../lessons/:lessonId` | `LessonPage` | open/complete lesson, resource authorization | Implemented |
| `.../tests` | existing assessment list in ClassShell | student assessment APIs | Integrated |
| `.../attempts/:attemptId` | existing attempt page in ClassShell | attempt/autosave/submit APIs | Integrated |
| `.../attempts/:attemptId/result` | existing result page in ClassShell | authorized result API | Integrated |
| `.../results` | `ClassResultsPage` | assessment list/result links | Implemented |
| `.../progress` | `ProgressPage` | detailed learning progress API | Implemented |

## D. Backend/API delta

- Public catalog accepts `skillScope` and `availability=OPEN` and returns derived offering capacity/registration state.
- Public Course detail returns curriculum preview without protected lesson content.
- New `GET /api/class-offerings/:id` returns public-safe Course/instructor/schedule/tuition/capacity fields only.
- Enrollment list/detail returns ClassOffering, instructor, schedule, Course and persisted lesson progress summaries.
- Learning progress now returns per-module/per-lesson completion plus eligible class assessment states.
- New `GET /api/learning/enrollments/:enrollmentId/resources/:resourceId/download` requires an authenticated STUDENT, learner-owned ACTIVE enrollment, downloadable resource and Course ownership.
- Class assessment discovery excludes Placement. Existing attempt authorization, answer secrecy, idempotent submission and legacy regression behavior remain intact.
- No Prisma schema or migration was added; the approved M01 data model was sufficient.

## E. Seed delta

The idempotent development seed now establishes:

| Entity/content | Demo total |
| --- | ---: |
| Course | 5 |
| ClassOffering | 10 |
| ClassScheduleSlot | 20 (2 per offering) |
| Main-class Module | 3 |
| Main-class Lesson | 8 |
| Main-class Resource | at least 6 |
| Main-course Test | 3 (Placement legacy, in-class quiz, practice mock) |
| Main demo learner Enrollment | 3 representative records, including ACTIVE and PENDING_PAYMENT; a separate ACTIVE fill record drives full capacity |
| Submitted Attempt with answers/score | 1 |
| Typed static News/Event | 4 |

Seed verification was run twice consecutively and passed both times.

## F. Visual and product work

- Added `lucide-react`; core UI no longer depends on emoji icons.
- Added shared public header/footer and mobile navigation.
- Replaced the developer homepage with the approved product sections and honest M03-safe Placement messaging.
- Added responsive Course cards, filter form, curriculum preview, ClassOffering comparison and detail UI.
- Added persistent desktop/mobile ClassShell navigation and productized My Classes, Overview, Lesson, Results and Progress.
- Added loading, empty, retry/error, full, upcoming, not-found, unauthorized and PENDING_PAYMENT treatments where applicable.
- Added shared focus-visible styling and accessible labels for icon/menu controls.

## G. Verification

| Command | Result |
| --- | --- |
| `npm ci` | NOT RUN — dependencies were already installed; `lucide-react` was installed with lockfile update |
| `npm run prisma:validate` | PASS |
| `npm run prisma:generate` | PASS |
| `npm run prisma:drift-check` | PASS — no difference detected |
| `npm run prisma:seed` (twice) | PASS — idempotent |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm run test -w @smart-elearning/api -- --runInBand` | PASS — 18 suites, 253/253 tests |
| `npm run test -w @smart-elearning/web -- --run` / root `npm run test` | PASS — 19 files, 174/174 tests |
| `npm run test:e2e -w @smart-elearning/api` | PASS — 14 suites, 70/70 tests |
| `npm run build` | PASS — API and Web production builds |
| targeted Prettier on changed files | PASS |
| root `npm run format:check` | NOT RUN — approved baseline contains unrelated warnings; no mass rewrite was performed |
| `git diff --check` | PASS |
| Playwright E2E | NOT RUN — no Playwright dependency or script exists in the repository |
| migration replay/status | NOT APPLICABLE — M02 introduced no schema migration |

Observed non-blocking test output: the intentional invalid-BKT rollback E2E logs its expected server exception, and `pg` emits an existing client-query deprecation warning. All suites pass.

## H. Demo evidence

Local `npm run dev` smoke verification:

- API booted and registered the new public ClassOffering and resource-download routes.
- `GET /api/health` returned `ok`.
- Catalog request using both `skillScope=LR` and `availability=OPEN` returned filtered data.
- Demo Course detail returned 3 modules and 8 lessons.
- Public ClassOffering detail returned a deterministic code, two structured schedule slots, capacity and registration state.
- Vite served `/catalog` with HTTP 200.
- Public and student navigation/behavior is additionally covered by Web component tests and API E2E.

No screenshot was captured because the repository/session has no Playwright or interactive browser capture tool. Authenticated student click-through is represented by API E2E and component-route tests rather than a claimed manual browser run.

## I. Known issues and follow-ups

- Target-score/range filtering remains absent because the approved/current Course schema does not define an unambiguous filter field.
- Download delivery supports the existing authorized external-URL contract. M02 did not introduce a protected binary storage service or upload UI.
- News/Events remains typed static content by locked decision; there is no CMS/admin editor.
- The repository has no Playwright setup, so full browser click-flow automation/screenshots remain a follow-up if the team adopts that tooling.
- Existing BKT/Adaptive endpoints/routes remain for regression compatibility and are intentionally not promoted in the new ClassShell.
- Local test output includes a non-blocking `pg` deprecation warning described above.

## J. Explicit M03 boundary

M03 has not started. M02 does not implement Placement start, attempt orchestration, scoring, result, evaluation or recommendation UI. Public Placement references are informational and route to the Guide section only.
