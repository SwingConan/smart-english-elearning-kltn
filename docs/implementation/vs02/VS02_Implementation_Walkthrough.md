# VS02 — Implementation Walkthrough

**Vertical Slice:** Core Learning Delivery  
**Base:** `main` @ `15169f7`  
**Date:** 2026-09-20

---

## Summary

VS02 implements the full core learning delivery pipeline: Instructor assigned Course → Module → Lesson → LearningResource → Student ACTIVE Enrollment access → Open/continue Lesson → LessonProgress → Course progress baseline.

---

## Phase 1 — Schema + Migration + Seed ✅

### Prisma Schema Changes

**New Enums** added to [schema.prisma](file:///d:/KLTN_Project/smart-english-elearning-kltn/apps/api/prisma/schema.prisma):
- `ResourceType` (VIDEO, DOCUMENT, LINK)
- `LessonProgressStatus` (NOT_STARTED, IN_PROGRESS, COMPLETED)

**New Models** (4 total):

| Model | Table | Key Constraints |
|---|---|---|
| `Module` | `modules` | `@@unique([courseId, orderIndex])` |
| `Lesson` | `lessons` | `@@unique([moduleId, orderIndex])` |
| `LearningResource` | `learning_resources` | `@@unique([lessonId, orderIndex])` |
| `LessonProgress` | `lesson_progress` | `@@unique([enrollmentId, lessonId])` |

**Existing Model Updates:**
- `Course` → added `modules Module[]` relation
- `Enrollment` → added `lessonProgress LessonProgress[]` relation

### Migration

Created: `20260920081644_vs02_core_learning` — additive only, no existing table modifications.

### Seed Extension

[seed.ts](file:///d:/KLTN_Project/smart-english-elearning-kltn/apps/api/prisma/seed.ts) extended with:
- 2 modules, 3 lessons, 3 resources (VIDEO + DOCUMENT + LINK)
- 1 ACTIVE enrollment for demo student
- All idempotent upserts with stable UUIDs

---

## Phase 2 — Instructor Content Backend ✅

### Files Created (10 files)

| File | Purpose |
|---|---|
| [instructor-content.service.ts](file:///d:/KLTN_Project/smart-english-elearning-kltn/apps/api/src/modules/learning/instructor-content.service.ts) | Business logic + ownership verification |
| [instructor-content.controller.ts](file:///d:/KLTN_Project/smart-english-elearning-kltn/apps/api/src/modules/learning/instructor-content.controller.ts) | 16 REST endpoints |
| [dto/create-module.dto.ts](file:///d:/KLTN_Project/smart-english-elearning-kltn/apps/api/src/modules/learning/dto/create-module.dto.ts) | Module creation DTO |
| [dto/update-module.dto.ts](file:///d:/KLTN_Project/smart-english-elearning-kltn/apps/api/src/modules/learning/dto/update-module.dto.ts) | Module update DTO |
| [dto/create-lesson.dto.ts](file:///d:/KLTN_Project/smart-english-elearning-kltn/apps/api/src/modules/learning/dto/create-lesson.dto.ts) | Lesson creation DTO |
| [dto/update-lesson.dto.ts](file:///d:/KLTN_Project/smart-english-elearning-kltn/apps/api/src/modules/learning/dto/update-lesson.dto.ts) | Lesson update DTO |
| [dto/create-resource.dto.ts](file:///d:/KLTN_Project/smart-english-elearning-kltn/apps/api/src/modules/learning/dto/create-resource.dto.ts) | Resource creation DTO |
| [dto/update-resource.dto.ts](file:///d:/KLTN_Project/smart-english-elearning-kltn/apps/api/src/modules/learning/dto/update-resource.dto.ts) | Resource update DTO |
| [dto/reorder.dto.ts](file:///d:/KLTN_Project/smart-english-elearning-kltn/apps/api/src/modules/learning/dto/reorder.dto.ts) | Reorder DTO |

### API Endpoints (16 total)

| Category | Method | Path |
|---|---|---|
| Teaching | GET | `/api/instructor/teaching` |
| Modules | GET | `/api/instructor/courses/:courseId/modules` |
| Modules | POST | `/api/instructor/courses/:courseId/modules` |
| Modules | PATCH | `/api/instructor/modules/:moduleId` |
| Modules | DELETE | `/api/instructor/modules/:moduleId` |
| Modules | PATCH | `/api/instructor/courses/:courseId/modules/reorder` |
| Lessons | GET | `/api/instructor/modules/:moduleId/lessons` |
| Lessons | POST | `/api/instructor/modules/:moduleId/lessons` |
| Lessons | PATCH | `/api/instructor/lessons/:lessonId` |
| Lessons | DELETE | `/api/instructor/lessons/:lessonId` |
| Lessons | PATCH | `/api/instructor/modules/:moduleId/lessons/reorder` |
| Resources | GET | `/api/instructor/lessons/:lessonId/resources` |
| Resources | POST | `/api/instructor/lessons/:lessonId/resources` |
| Resources | PATCH | `/api/instructor/resources/:resourceId` |
| Resources | DELETE | `/api/instructor/resources/:resourceId` |
| Resources | PATCH | `/api/instructor/lessons/:lessonId/resources/reorder` |

### Key Implementation Details
- **Ownership:** Every mutation verifies instructor has ≥1 ClassOffering for the course
- **Ordering:** Integer-based with unique constraint; reorder uses temp negative values
- **Delete guard:** Blocked if LessonProgress exists (409 Conflict)
- **Cascade delete:** Resources → Lessons → Module when no progress exists
- **Reindex:** After delete, remaining items reindexed to contiguous 0..N

---

## Phase 3 — Student Learning Backend ✅

### Files Created (2 files)

| File | Purpose |
|---|---|
| [learning.service.ts](file:///d:/KLTN_Project/smart-english-elearning-kltn/apps/api/src/modules/learning/learning.service.ts) | Student learning business logic |
| [learning.controller.ts](file:///d:/KLTN_Project/smart-english-elearning-kltn/apps/api/src/modules/learning/learning.controller.ts) | 4 REST endpoints |

### API Endpoints (4 total)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/learning/enrollments/:id/content` | Course content tree with progress |
| GET | `/api/learning/enrollments/:id/lessons/:lessonId` | Open/view lesson |
| PATCH | `/api/learning/enrollments/:id/lessons/:lessonId/complete` | Mark lesson completed |
| GET | `/api/learning/enrollments/:id/progress` | Course progress summary |

### Key Implementation Details
- **Access:** ACTIVE + COMPLETED enrollments can view; only ACTIVE can update progress
- **IDOR:** All queries filter by `learnerId` + return 404 (not 403)
- **Progress:** NOT_STARTED → IN_PROGRESS (on open), → COMPLETED (on complete)
- **Idempotent:** Re-completing returns existing without changing `completedAt`
- **Derivation:** `progressPercent = round(completed / total * 100)`, 0 lessons = 0%

### Module Registration

[learning.module.ts](file:///d:/KLTN_Project/smart-english-elearning-kltn/apps/api/src/modules/learning/learning.module.ts) — registers all 4 components (2 controllers + 2 services).

---

## Phase 4 — Instructor Frontend ✅

### Files Created

| File | Purpose |
|---|---|
| [features/instructor/types.ts](file:///d:/KLTN_Project/smart-english-elearning-kltn/apps/web/src/features/instructor/types.ts) | TypeScript interfaces |
| [features/instructor/api.ts](file:///d:/KLTN_Project/smart-english-elearning-kltn/apps/web/src/features/instructor/api.ts) | API client |
| [pages/InstructorTeachingPage.tsx](file:///d:/KLTN_Project/smart-english-elearning-kltn/apps/web/src/pages/InstructorTeachingPage.tsx) | Assigned courses list |
| [pages/CourseContentManagementPage.tsx](file:///d:/KLTN_Project/smart-english-elearning-kltn/apps/web/src/pages/CourseContentManagementPage.tsx) | Module/Lesson/Resource CRUD |

### Routes Added
- `/instructor/teaching` → InstructorTeachingPage
- `/instructor/courses/:courseId/content` → CourseContentManagementPage

### Navigation
AuthNavigation updated: INSTRUCTOR role now sees "Lớp giảng dạy" link.

---

## Phase 5 — Student Learning Frontend ✅

### Files Created

| File | Purpose |
|---|---|
| [features/learning/types.ts](file:///d:/KLTN_Project/smart-english-elearning-kltn/apps/web/src/features/learning/types.ts) | TypeScript interfaces |
| [features/learning/api.ts](file:///d:/KLTN_Project/smart-english-elearning-kltn/apps/web/src/features/learning/api.ts) | API client |
| [features/learning/display.ts](file:///d:/KLTN_Project/smart-english-elearning-kltn/apps/web/src/features/learning/display.ts) | Display helpers |
| [pages/LearningPage.tsx](file:///d:/KLTN_Project/smart-english-elearning-kltn/apps/web/src/pages/LearningPage.tsx) | Course content + lesson viewer |

### Routes Added
- `/student/enrollments/:enrollmentId/learn` → LearningPage

### Existing Page Updated
[MyEnrollmentsPage.tsx](file:///d:/KLTN_Project/smart-english-elearning-kltn/apps/web/src/pages/MyEnrollmentsPage.tsx) — added "Tiếp tục học" button for ACTIVE enrollments.

---

## Verification Results

### All Tests Green ✅

| Suite | Count | Status |
|---|---|---|
| Backend Unit (Jest) | 8 suites, 53 tests | ✅ PASS |
| Backend E2E (Jest+Supertest) | 4 suites, 6 tests | ✅ PASS |
| Frontend (Vitest+RTL) | 6 suites, 50 tests | ✅ PASS |
| **Total** | **18 suites, 109 tests** | **✅ ALL GREEN** |

### Build ✅

```
API: ✅ Prisma generate + nest build
Web: ✅ tsc + vite build (327 KB gzipped: 98 KB)
```

### Typecheck ✅

```
API:  tsc --noEmit → 0 errors
Web:  tsc -b → 0 errors
```

---

## What's Still Needed (Phase 6)

- [ ] VS02-specific unit tests (instructor content service, learning service)
- [ ] VS02-specific E2E tests (instructor content, student learning)
- [ ] Update README.md and docs/MODULE_MAP.md
- [ ] End-to-end manual demo verification with seed data

---

## Files Changed Summary

### Modified Files (4)

| File | Change |
|---|---|
| `apps/api/prisma/schema.prisma` | +2 enums, +4 models, +2 relations |
| `apps/api/prisma/seed.ts` | +VS02 demo content (modules, lessons, resources, enrollment) |
| `apps/web/src/App.tsx` | +3 routes, +3 imports |
| `apps/web/src/pages/MyEnrollmentsPage.tsx` | +"Tiếp tục học" button for ACTIVE enrollments |

### New Files (19)

| Category | Count | Files |
|---|---|---|
| Migration | 1 | `prisma/migrations/20260920081644_vs02_core_learning/migration.sql` |
| Backend DTOs | 7 | create/update module, lesson, resource + reorder |
| Backend Services | 2 | instructor-content.service.ts, learning.service.ts |
| Backend Controllers | 2 | instructor-content.controller.ts, learning.controller.ts |
| Backend Module | 1 | learning.module.ts (updated from placeholder) |
| Frontend Feature Types | 2 | instructor/types.ts, learning/types.ts |
| Frontend Feature API | 2 | instructor/api.ts, learning/api.ts |
| Frontend Feature Display | 1 | learning/display.ts |
| Frontend Pages | 3 | InstructorTeachingPage, CourseContentManagementPage, LearningPage |
