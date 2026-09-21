# VS02 IMPLEMENTATION PLAN — CLAUDE REVIEW

**Vertical Slice:** Core Learning Delivery
**Baseline:** `main` @ `15169f7` — `feat: complete VS01 auth catalog and enrollment (#2)`
**Status:** Planning-only — no repository modifications

---

## REPO BASELINE

| Attribute | Detail |
|---|---|
| **HEAD** | `15169f7` — VS01 merged & closed |
| **Framework** | NestJS 11 + Prisma 7 + React 19 + Vite 7 |
| **Auth** | Session-based (`express-session` + `connect-pg-simple`), cookie `sel.sid` |
| **Auth Guards** | Global `AuthGuard` (session → DB lookup) + `RolesGuard` (reflector metadata) |
| **Decorators** | `@Public()`, `@Roles(UserRole.*)`, `@CurrentUser()` |
| **Validation** | `class-validator` / `class-transformer` with global `ValidationPipe` (whitelist + transform) |
| **API prefix** | `/api` global prefix |
| **Migrations** | `20260919051724_init`, `20260919075324_vs01_auth_catalog_enrollment` |
| **Seed** | Idempotent upserts — 3 users, 1 course, 2 class offerings |
| **CI** | GitHub Actions: lint → typecheck → unit tests → E2E tests → build |
| **Tests** | 6 unit (Jest) + 3 E2E (Jest+Supertest) backend; 2 frontend (Vitest+RTL) |

### Reusable Foundations from VS01

| Pattern | Location | Reuse in VS02 |
|---|---|---|
| `@Roles(UserRole.INSTRUCTOR)` | [roles.decorator.ts](file:///d:/KLTN_Project/smart-english-elearning-kltn/apps/api/src/modules/auth/decorators/roles.decorator.ts) | Instructor controller guard |
| `@CurrentUser()` + `PublicUser` | [current-user.decorator.ts](file:///d:/KLTN_Project/smart-english-elearning-kltn/apps/api/src/modules/auth/decorators/current-user.decorator.ts) | Ownership extraction |
| Ownership IDOR protection | [enrollments.service.ts](file:///d:/KLTN_Project/smart-english-elearning-kltn/apps/api/src/modules/enrollments/enrollments.service.ts) `getMineById(learnerId, id)` | Student learning access pattern |
| `PrismaService` (global) | [prisma.module.ts](file:///d:/KLTN_Project/smart-english-elearning-kltn/apps/api/src/infrastructure/prisma/prisma.module.ts) | All new services |
| DTO pattern | `class-validator` + `class-transformer` | New DTOs |
| Serializable transactions | [enrollments.service.ts](file:///d:/KLTN_Project/smart-english-elearning-kltn/apps/api/src/modules/enrollments/enrollments.service.ts) | Progress race conditions |
| Safe delete pattern | [courses.service.ts](file:///d:/KLTN_Project/smart-english-elearning-kltn/apps/api/src/modules/courses/courses.service.ts) `delete()` | Module/Lesson delete guards |
| `apiFetch` with `credentials: 'include'` | [api-client.ts](file:///d:/KLTN_Project/smart-english-elearning-kltn/apps/web/src/lib/api-client.ts) | All new API calls |
| `RoleRoute` + `ProtectedRoute` | [RoleRoute.tsx](file:///d:/KLTN_Project/smart-english-elearning-kltn/apps/web/src/features/auth/RoleRoute.tsx) | New instructor/student routes |
| Feature module structure | `features/{domain}/` with `api.ts`, `types.ts`, components | New learning/instructor features |

### Relevant Placeholders Found

| Item | Status |
|---|---|
| `LearningModule` | Empty NestJS module in [learning.module.ts](file:///d:/KLTN_Project/smart-english-elearning-kltn/apps/api/src/modules/learning/learning.module.ts) — VS02 target |
| `/instructor/*` route | `PlaceholderPage` in [App.tsx](file:///d:/KLTN_Project/smart-english-elearning-kltn/apps/web/src/App.tsx#L45-L50) — VS02 will replace |
| `ClassOffering.instructorId` | Nullable FK — already supports single-instructor assignment |
| `Enrollment.learnerId` + ownership | Already anti-IDOR pattern — VS02 extends |

---

## UC / FR MAPPING

### Use Case Coverage

| UC | Description | VS02 Coverage | Notes |
|---|---|---|---|
| **UC21** | Xem lớp được phân công | ✅ **FULL** | Instructor sees assigned ClassOfferings + Courses |
| **UC22** | Quản lý nội dung được phân công | ✅ **FULL** | Module/Lesson/Resource CRUD scoped to assigned Courses |
| **UC09** | Học theo lộ trình cá nhân hóa | ⚠️ **PARTIAL** | Sequential content delivery only. **Adaptive/BKT NOT included.** |
| **UC13** | Xem tiến độ / mastery | ⚠️ **PARTIAL** | Lesson completion progress only. **Mastery/BKT NOT included.** |
| **UC14** | Tải tài liệu khóa học | ✅ **FULL** | URL-based download with `isDownloadable` policy |

### Functional Requirements Mapping

| FR | Description | VS02 Implementation |
|---|---|---|
| **FR-CM-004** | Module management | Module CRUD + reorder by Instructor |
| **FR-CM-005** | Lesson management | Lesson CRUD + reorder by Instructor |
| **FR-CM-006** | Learning resource management | LearningResource CRUD (VIDEO/DOCUMENT/LINK, URL-only) |
| **FR-LRN-001** | View learning content structure | Student GET course→modules→lessons→resources tree |
| **FR-LRN-003** | Track lesson progress | `LessonProgress` with NOT_STARTED/IN_PROGRESS/COMPLETED |
| **FR-LRN-004** | Resume learning | `lastAccessedAt` + optional `resumeData` (JSON) |
| **FR-LRN-005** | Mark lesson complete | Explicit `PATCH` to set COMPLETED + `completedAt` |
| **FR-LRN-006** | View course progress | Derived: `completedLessons / totalLessons` per enrollment |
| **FR-LRN-010** | Download resources | `isDownloadable` flag gates download URL delivery |

---

## DOMAIN / SCHEMA

### New Enums

```prisma
enum ResourceType {
  VIDEO
  DOCUMENT
  LINK
}

enum LessonProgressStatus {
  NOT_STARTED
  IN_PROGRESS
  COMPLETED
}
```

### New Models

#### Module

```prisma
model Module {
  id          String   @id @default(uuid()) @db.Uuid
  courseId     String   @db.Uuid
  title       String
  description String?  @db.Text
  orderIndex  Int
  course      Course   @relation(fields: [courseId], references: [id])
  lessons     Lesson[]
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@unique([courseId, orderIndex])
  @@index([courseId])
  @@map("modules")
}
```

| Field | Rationale |
|---|---|
| `courseId` | FK to Course — content belongs to reusable curriculum, NOT ClassOffering |
| `orderIndex` | Int for deterministic ordering. `@@unique([courseId, orderIndex])` prevents duplicate positions |
| `description` | Optional module-level description |

#### Lesson

```prisma
model Lesson {
  id          String            @id @default(uuid()) @db.Uuid
  moduleId    String            @db.Uuid
  title       String
  description String?           @db.Text
  orderIndex  Int
  module      Module            @relation(fields: [moduleId], references: [id])
  resources   LearningResource[]
  progress    LessonProgress[]
  createdAt   DateTime          @default(now())
  updatedAt   DateTime          @updatedAt

  @@unique([moduleId, orderIndex])
  @@index([moduleId])
  @@map("lessons")
}
```

#### LearningResource

```prisma
model LearningResource {
  id             String       @id @default(uuid()) @db.Uuid
  lessonId       String       @db.Uuid
  title          String
  type           ResourceType
  url            String
  orderIndex     Int
  isDownloadable Boolean      @default(false)
  lesson         Lesson       @relation(fields: [lessonId], references: [id])
  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt

  @@unique([lessonId, orderIndex])
  @@index([lessonId])
  @@map("learning_resources")
}
```

#### LessonProgress

```prisma
model LessonProgress {
  id             String               @id @default(uuid()) @db.Uuid
  enrollmentId   String               @db.Uuid
  lessonId       String               @db.Uuid
  status         LessonProgressStatus @default(NOT_STARTED)
  lastAccessedAt DateTime?
  completedAt    DateTime?
  enrollment     Enrollment           @relation(fields: [enrollmentId], references: [id])
  lesson         Lesson               @relation(fields: [lessonId], references: [id])
  createdAt      DateTime             @default(now())
  updatedAt      DateTime             @updatedAt

  @@unique([enrollmentId, lessonId])
  @@index([enrollmentId])
  @@index([lessonId])
  @@map("lesson_progress")
}
```

| Design Decision | Rationale |
|---|---|
| `enrollmentId × lessonId` ownership | Progress belongs to **Enrollment**, not directly User. A student re-enrolling in a different ClassOffering of the same Course gets fresh progress. |
| `lastAccessedAt` | Supports FR-LRN-004 resume. Updated on every lesson open/access. |
| No `resumeData` JSON yet | Keep minimal. Video position tracking is VS02 out-of-scope. Can add `resumeData Json?` if absolutely needed, but recommend deferring to avoid overengineering. |
| `completedAt` | Nullable timestamp — set once on completion, not cleared. |
| No cascade delete from Enrollment | `onDelete` defaults to `Restrict` — prevents accidental enrollment deletion from cascading away progress records. |

### Existing Model Modifications

#### Course — add `modules` relation

```prisma
model Course {
  // ... existing fields ...
  modules        Module[]         // ← ADD
}
```

#### Enrollment — add `lessonProgress` relation

```prisma
model Enrollment {
  // ... existing fields ...
  lessonProgress LessonProgress[] // ← ADD
}
```

### Constraints Summary

| Constraint | Type | Purpose |
|---|---|---|
| `Module @@unique([courseId, orderIndex])` | Unique | No duplicate module positions per course |
| `Lesson @@unique([moduleId, orderIndex])` | Unique | No duplicate lesson positions per module |
| `LearningResource @@unique([lessonId, orderIndex])` | Unique | No duplicate resource positions per lesson |
| `LessonProgress @@unique([enrollmentId, lessonId])` | Unique | One progress record per enrollment-lesson pair |

### Indexes Summary

| Model | Index | Purpose |
|---|---|---|
| Module | `[courseId]` | Fast lookup by course |
| Lesson | `[moduleId]` | Fast lookup by module |
| LearningResource | `[lessonId]` | Fast lookup by lesson |
| LessonProgress | `[enrollmentId]` | Progress listing per enrollment |
| LessonProgress | `[lessonId]` | Analytics / aggregate queries |

### Ordering Strategy

**Approach:** Integer `orderIndex` with unique constraint per parent.

**Reorder semantics:**

1. Client sends new desired order as array of IDs: `[id_a, id_b, id_c]`
2. Backend validates all IDs belong to the same parent
3. Execute inside a transaction:
   - Temporarily set all affected items to negative `orderIndex` values (avoids unique constraint violations during swap)
   - Then set final `orderIndex` values matching the array position (0, 1, 2, ...)
4. This is atomic and deterministic — no fragile swap or gap-based ordering

**Why not fractional/float ordering?** Integer ordering with unique constraint is simpler, deterministic, and prevents the drift/precision issues of fractional approaches. The temporary-negative-then-assign-final pattern handles reordering safely.

### Delete Semantics

> [!IMPORTANT]
> **Chosen baseline: Hard delete with referential guard — the simplest defensible approach.**

| Entity | Delete Behavior | Guard |
|---|---|---|
| **Module** | Hard delete | BLOCKED if any Lesson under this Module has LessonProgress records. Instructor must explicitly delete Lessons with progress first (or acknowledge data loss). |
| **Lesson** | Hard delete | BLOCKED if any LessonProgress records exist for this Lesson. Returns 409 Conflict with clear message. |
| **LearningResource** | Hard delete | No guard needed — resources have no dependents |
| **Module (cascading lessons)** | When Module has NO progress | Cascade-delete its Lessons and their Resources in a transaction |
| **Lesson (cascading resources)** | When Lesson has NO progress | Cascade-delete its Resources in a transaction |

**Why not soft delete?**
- VS02 is pre-production. No real learner data exists yet.
- Soft delete adds `deletedAt` filtering complexity to every query (including content tree queries, progress derivation).
- If a future VS requires archival, it can add soft delete then. Starting with hard delete + referential guard is the simplest defensible baseline.
- The guard ensures no accidental progress data loss — the same protection soft delete would provide, but simpler.

**When progress exists:** The endpoint returns `409 Conflict` with a message like: `"Cannot delete lesson with existing learner progress. Remove progress records first or contact administrator."` This is intentionally manual — in VS02, there's no bulk data management UI. Future iterations may add archive/soft-delete.

---

## AUTHORIZATION

### Instructor Ownership

```
Instructor → ClassOffering (via instructorId) → Course (via courseId)
```

**Authorization check for every Instructor mutation:**

```typescript
async assertInstructorOwnsCourse(instructorId: string, courseId: string): Promise<void> {
  const assignment = await this.prisma.classOffering.findFirst({
    where: { courseId, instructorId },
    select: { id: true },
  });
  if (!assignment) {
    throw new ForbiddenException(
      'You are not assigned to any class offering of this course',
    );
  }
}
```

| Rule | Implementation |
|---|---|
| Instructor creates Module for Course X | Must have ≥1 ClassOffering where `instructorId = user.id` AND `courseId = X` |
| Instructor updates Lesson in Module of Course X | Same ownership check via Module→Course chain |
| Instructor deletes Resource in Lesson | Same ownership chain: Resource→Lesson→Module→Course |
| Unassigned Instructor | 403 Forbidden |
| Student calls Instructor endpoint | 403 Forbidden (RolesGuard) |
| Admin calls Instructor endpoint | 403 Forbidden (RolesGuard) — Admin content editing NOT required in VS02 |

> [!NOTE]
> **Partial implementation note:** This uses the existing single-instructor `ClassOffering.instructorId` field. Multi-instructor assignment (InstructorAssignment table) is NOT in VS02 scope. An instructor assigned to any ClassOffering of a Course can manage that Course's content. This is documented as a known limitation.

### Student ACTIVE Enrollment Access

**Authorization check for every Student learning endpoint:**

```typescript
async getActiveEnrollmentOrFail(learnerId: string, enrollmentId: string): Promise<Enrollment> {
  const enrollment = await this.prisma.enrollment.findFirst({
    where: {
      id: enrollmentId,
      learnerId,          // IDOR protection
      status: 'ACTIVE',   // PENDING_PAYMENT/DROPPED/CANCELLED blocked
    },
  });
  if (!enrollment) {
    throw new NotFoundException('Enrollment not found');
  }
  return enrollment;
}
```

| Rule | Implementation |
|---|---|
| ACTIVE enrollment | Access granted |
| PENDING_PAYMENT | **Denied** — 404 (not 403, to prevent enumeration) |
| DROPPED | **Denied** — 404 |
| CANCELLED | **Denied** — 404 |
| COMPLETED | **Denied** for VS02 — students cannot access completed enrollment content. Reconsider in future VS if read-only access is wanted. |
| Wrong `enrollmentId` for student | **Denied** — 404 (IDOR protection, same as VS01 pattern) |

> [!IMPORTANT]
> **Design decision needed:** Should `COMPLETED` enrollment status allow read-only access to content? VS02 spec says "ACTIVE", but blocking completed students from reviewing may be undesirable. **Recommendation: Allow read-only access for COMPLETED in addition to ACTIVE, but only allow progress updates for ACTIVE.** This avoids a jarring UX when admin marks enrollment COMPLETED and student loses all access.

### IDOR Protection

Following the VS01 enrollment pattern, all Student endpoints:

1. Always filter by `learnerId = currentUser.id`
2. Return **404** (not 403) when enrollment doesn't match — prevents resource existence leak
3. Never accept `learnerId` from request body — always from `@CurrentUser()`

---

## API PLAN

### Instructor Endpoints

All under `@Roles(UserRole.INSTRUCTOR)` + `@CurrentUser()` ownership verification.

#### Teaching Discovery

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/instructor/teaching` | List Courses where instructor has ≥1 ClassOffering assignment. Returns distinct courses with their class offerings. |

#### Module Management

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/instructor/courses/:courseId/modules` | List modules for course (ordered) |
| `POST` | `/api/instructor/courses/:courseId/modules` | Create module (auto-appends to end) |
| `PATCH` | `/api/instructor/modules/:moduleId` | Update module title/description |
| `DELETE` | `/api/instructor/modules/:moduleId` | Delete module (with progress guard) |
| `PATCH` | `/api/instructor/courses/:courseId/modules/reorder` | Reorder modules |

#### Lesson Management

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/instructor/modules/:moduleId/lessons` | List lessons for module (ordered) |
| `POST` | `/api/instructor/modules/:moduleId/lessons` | Create lesson (auto-appends) |
| `PATCH` | `/api/instructor/lessons/:lessonId` | Update lesson title/description |
| `DELETE` | `/api/instructor/lessons/:lessonId` | Delete lesson (with progress guard) |
| `PATCH` | `/api/instructor/modules/:moduleId/lessons/reorder` | Reorder lessons |

#### Resource Management

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/instructor/lessons/:lessonId/resources` | List resources (ordered) |
| `POST` | `/api/instructor/lessons/:lessonId/resources` | Create resource |
| `PATCH` | `/api/instructor/resources/:resourceId` | Update resource |
| `DELETE` | `/api/instructor/resources/:resourceId` | Delete resource |
| `PATCH` | `/api/instructor/lessons/:lessonId/resources/reorder` | Reorder resources |

#### Instructor DTOs

```typescript
// Module
class CreateModuleDto {
  @IsString() @IsNotEmpty() @MaxLength(300) title: string;
  @IsOptional() @IsString() @MaxLength(5000) description?: string;
}

class UpdateModuleDto extends PartialType(CreateModuleDto) {}

class ReorderDto {
  @IsArray() @IsUUID('all', { each: true }) orderedIds: string[];
}

// Lesson
class CreateLessonDto {
  @IsString() @IsNotEmpty() @MaxLength(300) title: string;
  @IsOptional() @IsString() @MaxLength(5000) description?: string;
}

class UpdateLessonDto extends PartialType(CreateLessonDto) {}

// Resource
class CreateResourceDto {
  @IsString() @IsNotEmpty() @MaxLength(300) title: string;
  @IsEnum(ResourceType) type: ResourceType;
  @IsUrl({ require_tld: false }) @MaxLength(2048) url: string;
  @IsOptional() @IsBoolean() isDownloadable?: boolean;
}

class UpdateResourceDto extends PartialType(CreateResourceDto) {}
```

### Student Endpoints

All under `@Roles(UserRole.STUDENT)` + `@CurrentUser()` ownership verification.

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/learning/enrollments/:enrollmentId/content` | Get full course content tree for enrollment (modules→lessons→resources) with progress status per lesson |
| `GET` | `/api/learning/enrollments/:enrollmentId/lessons/:lessonId` | Open/view a specific lesson. Creates or updates LessonProgress (NOT_STARTED→IN_PROGRESS). Updates `lastAccessedAt`. Returns lesson detail + resources. |
| `PATCH` | `/api/learning/enrollments/:enrollmentId/lessons/:lessonId/complete` | Mark lesson as COMPLETED. Sets `completedAt`. Idempotent — re-completing returns 200, not error. |
| `GET` | `/api/learning/enrollments/:enrollmentId/progress` | Get course progress summary: `{ totalLessons, completedLessons, progressPercent }` |
| `GET` | `/api/learning/enrollments/:enrollmentId/resources/:resourceId` | Get resource detail. If `isDownloadable = false`, omit `url` from response (or mark it non-downloadable in response). If `isDownloadable = true`, include `url`. |

#### Student Response Shapes

```typescript
// Content tree response
interface CourseContentResponse {
  course: { id: string; title: string; level: string; };
  modules: {
    id: string;
    title: string;
    description: string | null;
    orderIndex: number;
    lessons: {
      id: string;
      title: string;
      description: string | null;
      orderIndex: number;
      progressStatus: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';
      resourceCount: number;
    }[];
  }[];
}

// Progress response
interface CourseProgressResponse {
  enrollmentId: string;
  courseTitle: string;
  totalLessons: number;
  completedLessons: number;
  progressPercent: number;  // 0–100, integer
}
```

---

## RESOURCE POLICY

### URL-based Resources in VS02

VS02 supports only URL-based resources with three types:

| Type | Use Case | Example |
|---|---|---|
| `VIDEO` | YouTube, Vimeo, or hosted video link | `https://youtube.com/watch?v=...` |
| `DOCUMENT` | Google Docs, hosted PDF link | `https://docs.google.com/...` |
| `LINK` | Any web resource | `https://example.com/article` |

### Download Policy Enforcement

| `isDownloadable` | Behavior |
|---|---|
| `true` | Student response includes `url` and a `downloadable: true` flag. Frontend renders a download/open button. |
| `false` | Student response includes `url` for viewing but `downloadable: false`. Frontend renders only a "view" action (opens in new tab) and does NOT render a download button. |

> [!WARNING]
> **Enforcement limitation:** For URL-based resources, `isDownloadable = false` is a **UI-level policy only**. The URL is necessarily visible to the browser to render the resource (e.g., embed a YouTube video). The browser can always access the URL directly. VS02 cannot cryptographically protect an external URL that the client needs to display. True download prevention requires: (1) server-side proxied content delivery, or (2) DRM — both out of VS02 scope.
>
> **What VS02 CAN enforce:** The frontend will not show download controls when `isDownloadable = false`. The API will still include the URL (it must, for viewing), but will include the `downloadable` flag so the frontend knows which UX to render. This is an honest policy signal, not a security boundary.

### No Upload Implementation

- No file upload endpoint
- No Multer middleware
- No object storage (S3, GCS, etc.)
- Instructors paste URLs manually

---

## FRONTEND PLAN

### Instructor UI

#### New Routes

```
/instructor/teaching          → InstructorTeachingPage (assigned courses list)
/instructor/courses/:courseId/content → CourseContentManagementPage (module/lesson/resource CRUD)
```

#### `/instructor/teaching`

- Replaces current `PlaceholderPage` at `/instructor/*`
- Calls `GET /api/instructor/teaching`
- Shows cards/table of assigned courses with their class offerings
- Each course card has "Quản lý nội dung" button → navigates to content management
- Reuses layout pattern from existing admin pages

#### `/instructor/courses/:courseId/content`

- Hierarchical content editor
- **Module panel:** Accordion/list of modules with drag-reorder (or up/down arrows for simplicity)
  - Create Module button
  - Each module: edit (inline or modal), delete (with confirmation)
- **Lesson panel:** When module selected, shows its lessons
  - Create Lesson button
  - Each lesson: edit, delete, reorder
- **Resource panel:** When lesson selected, shows its resources
  - Create Resource button (form: title, type dropdown, URL input, isDownloadable checkbox)
  - Each resource: edit, delete, reorder
- Delete confirmation shows warning if content has dependencies

#### New Feature Module: `features/instructor/`

```
features/instructor/
├── api.ts              # instructorApi.teaching.list(), modules.create(), etc.
├── types.ts            # InstructorCourse, Module, Lesson, Resource types
├── errors.ts           # Error message mapping (reuse pattern from admin)
└── components/
    ├── ModuleList.tsx
    ├── ModuleForm.tsx
    ├── LessonList.tsx
    ├── LessonForm.tsx
    ├── ResourceList.tsx
    └── ResourceForm.tsx
```

### Student UI

#### New Routes

```
/student/enrollments                           → MyEnrollmentsPage (existing, enhanced)
/student/enrollments/:enrollmentId/learn       → LearningPage (course content + progress)
/student/enrollments/:enrollmentId/lessons/:lessonId → LessonViewPage (lesson detail + resources)
```

#### Enhanced `MyEnrollmentsPage`

- Existing page at [MyEnrollmentsPage.tsx](file:///d:/KLTN_Project/smart-english-elearning-kltn/apps/web/src/pages/MyEnrollmentsPage.tsx)
- Add "Tiếp tục học" (Continue learning) button for ACTIVE enrollments → navigates to `/student/enrollments/:id/learn`
- Show progress bar per enrollment (calls progress endpoint)

#### `/student/enrollments/:enrollmentId/learn` (LearningPage)

- Calls `GET /api/learning/enrollments/:id/content`
- Left sidebar: Module → Lesson tree with progress indicators (✓ completed, ● in-progress, ○ not started)
- Content area: Selected lesson content + resources
- Progress summary at top

#### `/student/enrollments/:enrollmentId/lessons/:lessonId` (LessonViewPage)

- Calls `GET /api/learning/enrollments/:id/lessons/:lessonId`
- Displays lesson description
- Lists resources with appropriate actions:
  - VIDEO → embedded player or "Xem video" button
  - DOCUMENT → "Xem tài liệu" / "Tải xuống" (if downloadable)
  - LINK → "Mở liên kết"
- "Hoàn thành bài học" button → calls complete endpoint
- "Bài tiếp theo" / "Bài trước" navigation

#### New Feature Module: `features/learning/`

```
features/learning/
├── api.ts              # learningApi.getContent(), openLesson(), completeLesson(), getProgress()
├── types.ts            # CourseContent, LessonDetail, CourseProgress, LessonProgressStatus
├── display.ts          # Progress formatting, resource type labels
└── components/
    ├── ContentSidebar.tsx
    ├── LessonViewer.tsx
    ├── ResourceItem.tsx
    └── ProgressBar.tsx
```

### Navigation Updates

#### `InstructorLayout` / `AuthNavigation`

Add nav link: `{ path: '/instructor/teaching', label: 'Lớp giảng dạy', icon: '📚' }`

#### `AuthNavigation` for Student

Add "Tiếp tục học" quick link alongside existing enrollment link.

---

## TEST PLAN

### Unit Tests (Jest — `apps/api/src/modules/`)

#### Instructor Service Unit Tests (`instructor-content.service.spec.ts`)

1. **Ownership verification:**
   - Instructor with ClassOffering assignment → allowed
   - Instructor without assignment → `ForbiddenException`
   - Instructor with assignment to different Course → `ForbiddenException`

2. **Module CRUD:**
   - Create module assigns correct `orderIndex` (next available)
   - Update module title
   - Delete module with no lessons → success
   - Delete module with lessons but no progress → cascade delete
   - Delete module with lessons that have progress → `ConflictException` (409)

3. **Lesson CRUD:**
   - Create lesson assigns correct `orderIndex`
   - Delete lesson with no progress → success + cascade resources
   - Delete lesson with progress → `ConflictException`

4. **Resource CRUD:**
   - Create resource with valid URL
   - Create resource with invalid URL → validation error
   - Delete resource → success (no dependents)

5. **Reorder:**
   - Reorder modules: verify final `orderIndex` values
   - Reorder with missing ID → `BadRequestException`
   - Reorder with ID from wrong parent → `BadRequestException`
   - Reorder with duplicate IDs → `BadRequestException`

#### Student Learning Service Unit Tests (`learning.service.spec.ts`)

1. **Content access:**
   - ACTIVE enrollment → returns content tree
   - PENDING_PAYMENT enrollment → `NotFoundException`
   - DROPPED/CANCELLED enrollment → `NotFoundException`
   - Another student's enrollment → `NotFoundException` (IDOR)

2. **Lesson open:**
   - First open → creates LessonProgress(NOT_STARTED→IN_PROGRESS)
   - Subsequent open → updates `lastAccessedAt`, status stays IN_PROGRESS
   - Already COMPLETED → updates `lastAccessedAt`, status stays COMPLETED

3. **Lesson completion:**
   - IN_PROGRESS → COMPLETED, sets `completedAt`
   - Already COMPLETED → idempotent 200, `completedAt` unchanged
   - NOT_STARTED → COMPLETED (direct completion allowed)

4. **Course progress:**
   - 0/3 lessons completed → `{ progressPercent: 0 }`
   - 2/3 lessons completed → `{ progressPercent: 67 }`
   - 3/3 lessons completed → `{ progressPercent: 100 }`
   - Course with 0 lessons → `{ progressPercent: 0 }` (edge case)

5. **Resource access:**
   - `isDownloadable: true` → response includes `downloadable: true`
   - `isDownloadable: false` → response includes `downloadable: false`
   - Resource from wrong enrollment → `NotFoundException`

### API E2E Tests (Jest + Supertest — `apps/api/test/`)

#### `instructor-content.e2e-spec.ts`

1. Unauthenticated → 401
2. Student calling instructor endpoints → 403
3. Admin calling instructor endpoints → 403
4. Instructor creates module for assigned course → 201
5. Instructor creates module for unassigned course → 403
6. Full CRUD lifecycle: module → lesson → resource → delete chain
7. Reorder modules → verify order persists
8. Delete lesson with progress → 409
9. Resource `isDownloadable` flag persisted correctly

#### `learning.e2e-spec.ts`

1. Unauthenticated → 401
2. Instructor calling student endpoints → 403
3. Student with ACTIVE enrollment → gets content tree
4. Student with PENDING_PAYMENT → 404
5. Student accessing another student's enrollment → 404
6. Open lesson → creates progress
7. Complete lesson → sets COMPLETED
8. Complete already-completed lesson → idempotent 200
9. Progress calculation after completing lessons
10. Resource download policy in response

### Frontend Tests (Vitest + RTL — `apps/web/`)

1. `InstructorTeachingPage` renders course list from mock API
2. `LearningPage` renders content tree with correct progress icons
3. `LessonViewPage` renders resources with correct download/view buttons
4. `ResourceItem` shows download button only when `downloadable: true`
5. Navigation: instructor link visible for INSTRUCTOR role

### VS01 Regression

> [!IMPORTANT]
> All existing tests MUST remain green:
> - `auth.service.spec.ts` ✓
> - `auth.e2e-spec.ts` ✓
> - `courses.service.spec.ts` ✓
> - `class-offerings.service.spec.ts` ✓
> - `enrollments.service.spec.ts` ✓
> - `enrollment.e2e-spec.ts` ✓
> - `health.controller.spec.ts` ✓
> - `health.e2e-spec.ts` ✓
> - `users.service.spec.ts` ✓
> - `auth.guard.spec.ts` ✓
> - `roles.guard.spec.ts` ✓
> - `App.test.tsx` ✓
> - `api-client.test.ts` ✓

The new migration only adds tables/relations — no modifications to existing VS01 tables.

---

## SEED

### Changes to [seed.ts](file:///d:/KLTN_Project/smart-english-elearning-kltn/apps/api/prisma/seed.ts)

Extend existing seed with VS02 demo data:

```typescript
// Stable IDs for VS02 content
const DEMO_MODULE_1_ID = '20000000-0000-4000-8000-000000000001';
const DEMO_MODULE_2_ID = '20000000-0000-4000-8000-000000000002';
const DEMO_LESSON_1_ID = '30000000-0000-4000-8000-000000000001';
const DEMO_LESSON_2_ID = '30000000-0000-4000-8000-000000000002';
const DEMO_LESSON_3_ID = '30000000-0000-4000-8000-000000000003';
const DEMO_RESOURCE_VIDEO_ID = '40000000-0000-4000-8000-000000000001';
const DEMO_RESOURCE_DOC_ID   = '40000000-0000-4000-8000-000000000002';
const DEMO_RESOURCE_LINK_ID  = '40000000-0000-4000-8000-000000000003';
```

**Content structure seeded:**

```
Demo English Foundations (existing course)
├── Module 1: "Getting Started" (orderIndex: 0)
│   ├── Lesson 1: "Welcome & Course Overview" (orderIndex: 0)
│   │   ├── Resource: VIDEO "Introduction Video" (downloadable: false)
│   │   └── Resource: DOCUMENT "Course Syllabus" (downloadable: true)
│   └── Lesson 2: "Basic Greetings" (orderIndex: 1)
│       └── Resource: LINK "Practice Exercises" (downloadable: false)
└── Module 2: "Everyday Vocabulary" (orderIndex: 1)
    └── Lesson 3: "Common Words" (orderIndex: 0)
```

**URLs:** Use safe placeholder URLs (e.g., `https://example.com/demo-video`, `https://example.com/demo-syllabus.pdf`). No real external secrets.

**Pattern:** Follows existing upsert pattern. Uses stable UUIDs. Idempotent. No BKT/quiz data created.

**Enrollment seed for demo:** Upsert an ACTIVE enrollment for `student.demo@smart-elearning.local` in the free offering (already seeded via VS01), enabling immediate VS02 demo.

---

## IMPLEMENTATION PHASES

### Phase 1 — Schema + Migration + Seed Foundation
> Estimated: 1 review unit

**Deliverables:**
- Add `Module`, `Lesson`, `LearningResource`, `LessonProgress` to `schema.prisma`
- Add `ResourceType`, `LessonProgressStatus` enums
- Add relations to existing `Course` and `Enrollment` models
- Run `prisma migrate dev` to create migration `vs02_core_learning`
- Extend `seed.ts` with VS02 demo content
- Verify: `prisma migrate deploy` + `prisma db seed` pass
- Verify: all VS01 tests still green

### Phase 2 — Instructor Content Backend
> Estimated: 1 review unit

**Deliverables:**
- `InstructorContentService` with ownership verification
- `InstructorContentController` with all Module/Lesson/Resource CRUD + reorder endpoints
- DTOs: `CreateModuleDto`, `UpdateModuleDto`, `CreateLessonDto`, `UpdateLessonDto`, `CreateResourceDto`, `UpdateResourceDto`, `ReorderDto`
- Wire into `LearningModule`
- Unit tests: `instructor-content.service.spec.ts`
- E2E tests: `instructor-content.e2e-spec.ts`

### Phase 3 — Student Learning/Progress Backend
> Estimated: 1 review unit

**Deliverables:**
- `LearningService` with enrollment ownership verification
- `LearningController` with content tree, lesson open, lesson complete, progress, resource access endpoints
- Wire into `LearningModule`
- Unit tests: `learning.service.spec.ts`
- E2E tests: `learning.e2e-spec.ts`

### Phase 4 — Instructor Frontend
> Estimated: 1 review unit

**Deliverables:**
- `features/instructor/` module (api, types, components)
- `InstructorTeachingPage` — assigned courses view
- `CourseContentManagementPage` — Module/Lesson/Resource CRUD UI
- Replace `/instructor/*` placeholder with real routes
- Update `AuthNavigation` for instructor links
- Frontend test: basic render test

### Phase 5 — Student Learning Frontend
> Estimated: 1 review unit

**Deliverables:**
- `features/learning/` module (api, types, components)
- Enhanced `MyEnrollmentsPage` — progress bar + continue learning button
- `LearningPage` — content tree sidebar + lesson viewer
- `LessonViewPage` — resource display with download policy
- Frontend tests: render + interaction tests

### Phase 6 — Full QA / Documentation / Review
> Estimated: 1 review unit

**Deliverables:**
- Run full CI pipeline locally: lint + typecheck + unit + E2E + build
- Verify VS01 regression — all 13 existing tests green
- Verify VS02 seed is demoable end-to-end
- Update `README.md` with VS02 capabilities
- Update `docs/MODULE_MAP.md` with learning module details
- Final code review checklist

---

## RISKS / NEEDS DECISION

### 1. COMPLETED Enrollment Access (Decision Required)

> [!IMPORTANT]
> **Should `COMPLETED` enrollment status allow read-only access to course content?**
>
> - **Option A (Strict):** Only `ACTIVE` enrollments can access content. Student loses access when enrollment is marked COMPLETED.
> - **Option B (Recommended):** `ACTIVE` and `COMPLETED` enrollments can view content. Only `ACTIVE` can update progress.
>
> The spec says "ACTIVE", but Option B is better UX (student can review after course completion).

### 2. Reorder UX Approach

> [!NOTE]
> **Drag-and-drop vs. arrow buttons for reordering:**
> - Drag-and-drop requires a library (e.g., `@dnd-kit/core`) — adds dependency
> - Up/Down arrow buttons are simpler, no new dependency
>
> **Recommendation:** Start with arrow buttons in VS02 for simplicity. Drag-and-drop can be added as UX polish later.

### 3. Instructor Multi-Course Content Sharing

> [!NOTE]
> Content belongs to Course, not ClassOffering. If two instructors (A and B) are each assigned to different ClassOfferings of the same Course, both can edit the same content. This is by design in VS02 (single curriculum per Course), but should be documented as a known collaboration constraint.

### 4. Empty Course Progress Edge Case

When a course has zero lessons, `progressPercent` should be `0` (not `NaN` or `100`). This edge case must be handled explicitly in the progress calculation.

### 5. Migration Safety

The migration only adds new tables and adds relation fields to existing tables. No existing columns are modified or removed. Existing VS01 data remains valid. `prisma migrate deploy` is safe.

---

## ACCEPTANCE CRITERIA

### Must-Pass for VS02 Completion

- [ ] Instructor can list courses/classes they are assigned to
- [ ] Instructor can create/update/delete/reorder Modules within assigned Course
- [ ] Instructor can create/update/delete/reorder Lessons within Module
- [ ] Instructor can create/update/delete/reorder Resources (VIDEO/DOCUMENT/LINK) within Lesson
- [ ] Instructor CANNOT manage content for unassigned Courses (403)
- [ ] Student with ACTIVE enrollment can view course content tree with progress
- [ ] Student can open a lesson (creates/updates IN_PROGRESS progress)
- [ ] Student can mark lesson COMPLETED (idempotent)
- [ ] Student can view derived course progress (completed/total)
- [ ] Student with PENDING_PAYMENT CANNOT access learning content (404)
- [ ] Student CANNOT access another student's enrollment (404, no existence leak)
- [ ] Resource `isDownloadable` policy is respected in frontend UI
- [ ] Delete of Module/Lesson with existing progress is blocked (409)
- [ ] Seed provides demoable VS02 data
- [ ] All 13 VS01 tests remain green
- [ ] VS02 unit + E2E tests pass
- [ ] CI pipeline passes
- [ ] No file upload/Multer/object storage introduced
- [ ] No quiz/BKT/adaptive data or logic introduced

---

## OUT OF SCOPE

Explicitly excluded from VS02 (per spec §12):

| Item | Status |
|---|---|
| Question Bank | ❌ Not in VS02 |
| Test / Quiz | ❌ Not in VS02 |
| Placement Test | ❌ Not in VS02 |
| Skill Model | ❌ Not in VS02 |
| BKT (Bayesian Knowledge Tracing) | ❌ Not in VS02 |
| Adaptive Recommendation | ❌ Not in VS02 |
| Engagement Events | ❌ Not in VS02 |
| Essay / Writing Module | ❌ Not in VS02 |
| AI Integration | ❌ Not in VS02 |
| Virtual Classroom | ❌ Not in VS02 |
| Certificate | ❌ Not in VS02 |
| Payment Confirmation | ❌ Not in VS02 |
| File Upload | ❌ Not in VS02 |
| Object Storage (S3/GCS) | ❌ Not in VS02 |
| Multi-Instructor Assignment | ❌ Not in VS02 |
| Admin Roster Management | ❌ Not in VS02 |
| Video Analytics / Watch Position | ❌ Not in VS02 |
| Mastery Calculation | ❌ Not in VS02 |

---

## SAFE FIRST IMPLEMENTATION STEP

**Phase 1: Schema + Migration + Seed**

This is the safest starting point because:

1. **Zero risk to existing code** — only adds new tables, enums, and relation fields
2. **Validates schema design early** — migration errors caught before any application code
3. **Enables parallel development** — once schema is merged, backend Phases 2+3 can reference real Prisma types
4. **Seed provides demo baseline** — VS02 can be demonstrated immediately after Phase 1
5. **VS01 regression verifiable** — run all existing tests against new schema to confirm no breakage

**Concrete first PR:**
1. Edit `schema.prisma` — add 4 models + 2 enums + 2 relations
2. `npx prisma migrate dev --name vs02_core_learning`
3. Extend `seed.ts` with demo modules/lessons/resources
4. Run: `npm run lint && npm run typecheck && npm run test && npm run test:e2e && npm run build`
5. Verify all green → PR ready
