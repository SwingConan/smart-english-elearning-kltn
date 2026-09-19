# Vertical Slice 01 — Implementation Plan v0.1 APPROVED

**Project:** Smart English E-Learning  
**Date:** 2026-09-19  
**Status:** APPROVED FOR IMPLEMENTATION  
**Branch:** `feat/vs01-auth-catalog-enrollment`

## 1. Goal

Deliver the first end-to-end business slice:

**Auth → Public Catalog → Course / ClassOffering → Enrollment**

This slice establishes the foundation for later learning, BKT/adaptive, essay AI, engagement, consultation, virtual classroom, and certificate features.

## 2. Scope

### In scope

- Public learner registration
- Login / logout / current session
- Argon2id password hashing
- PostgreSQL-backed server-side session
- HttpOnly cookie auth
- Basic authorization foundation
- Public course catalog
- Course detail
- ClassOffering
- Minimal Admin/Training Coordinator management UI
- Student enrollment
- Duplicate-enrollment prevention
- Free/paid offering behavior without payment integration
- Student enrollment list
- CI database support for integration/E2E tests

### Explicitly out of scope

- BKT / Adaptive Learning
- Essay AI / grading
- Engagement Analytics
- Virtual Classroom
- Consultation / AI advisory
- Payment gateway
- Certificate
- Module/Lesson learning content
- File upload
- Email verification
- Password reset
- OAuth/social login
- BullMQ/Redis/background queue

## 3. Decisions approved after plan review

### DECISION A — Session table is migration-managed

Do **not** let `connect-pg-simple` create tables at runtime.

Add a Prisma model mapped to the PostgreSQL session table and create it through Prisma migration.

Recommended model shape:

```prisma
model UserSession {
  sid    String   @id @db.VarChar
  sess   Json
  expire DateTime @db.Timestamp(6)

  @@index([expire])
  @@map("user_sessions")
}
```

`connect-pg-simple` must use:

- `tableName: "user_sessions"`
- `createTableIfMissing: false`

Session data is still owned by `express-session`; application code does not query session rows through Prisma.

Reason: database schema remains reproducible through migrations and CI; application startup must not perform DDL.

### DECISION B — Global authentication guard

Use a global `AuthGuard` via `APP_GUARD`.

Public routes explicitly use `@Public()`.

Public routes include at least:

- health
- register
- login
- public catalog list
- public course detail

Use `RolesGuard` with `@Roles(...)`; it may also be global as long as routes without role metadata pass through.

Reason: protected-by-default is safer than relying on every future controller author to remember `@UseGuards()`.

### DECISION C — Keep combined admin role

Keep existing:

`ADMIN_COORDINATOR`

Do not split `ADMIN` and `TRAINING_COORDINATOR` in VS01.

### DECISION D — Pricing belongs to ClassOffering

Do not place the authoritative free/paid flag on `Course`.

`ClassOffering` is the actual opened cohort and owns registration/pricing behavior.

Recommended:

```prisma
enum PricingType {
  FREE
  PAID
}

model ClassOffering {
  // ...
  pricingType   PricingType @default(FREE)
  tuitionFeeVnd Int?
}
```

Business rules:

- `FREE` → tuition fee is `null` or `0`
- `PAID` → tuition fee must be greater than `0`
- no payment gateway is implemented in VS01

### DECISION E — Paid enrollment stub

For a paid offering:

- create enrollment with `PENDING_PAYMENT`
- do not activate learning access
- do not implement payment confirmation/provider in VS01

Capacity calculation counts `ACTIVE` enrollments only.

This avoids permanently consuming seats with unpaid placeholder enrollments.

### DECISION F — Minimal Admin UI is required

Swagger/Prisma Studio are development tools, not the user-facing implementation.

VS01 must include minimal Admin/Training Coordinator pages for:

- create/edit/publish Course
- create/edit/open ClassOffering

The pages may be simple; visual polish is not the priority.

### DECISION G — Database-backed E2E tests run in CI

VS01 must extend GitHub Actions with PostgreSQL service support.

CI flow should:

1. start PostgreSQL service
2. install dependencies
3. Prisma generate
4. `prisma migrate deploy` against CI test DB
5. run lint/typecheck/unit tests
6. run API integration/E2E tests
7. build

`migrate deploy` does not need a Prisma shadow database.

Do not use production credentials.

## 4. Domain model

### User

Existing fields remain.

Add relations:

- created Courses
- assigned ClassOfferings
- learner Enrollments

Existing roles remain:

- STUDENT
- INSTRUCTOR
- ADMIN_COORDINATOR

Existing statuses remain:

- ACTIVE
- INACTIVE
- LOCKED

Auth rules:

- public registration always creates `STUDENT`
- email is normalized with `trim().toLowerCase()`
- INACTIVE/LOCKED users cannot log in
- passwordHash is never returned

### UserSession

New migration-managed session table described above.

No FK to User is required because express-session stores the payload as JSON.

### Course

Recommended fields:

- id UUID
- title
- slug unique
- description
- level
- thumbnailUrl optional
- isPublished
- createdById
- createdAt
- updatedAt

Important:

- price/free-paid state is not authoritative here
- public catalog returns only published courses

Slug rule:

- auto-generate on create
- normalize title to URL-safe slug
- handle collisions with deterministic suffix
- do not automatically change slug when title is edited

### ClassOffering

Recommended fields:

- id UUID
- courseId
- instructorId optional
- name
- status
- pricingType
- tuitionFeeVnd optional
- maxStudents optional
- enrollmentStart optional
- enrollmentEnd optional
- classStart optional
- classEnd optional
- createdAt
- updatedAt

Statuses:

- DRAFT
- OPEN
- IN_PROGRESS
- COMPLETED
- CANCELLED

Business validation:

- enrollmentStart <= enrollmentEnd
- classStart < classEnd
- enrollment allowed only while status is OPEN
- if enrollment dates exist, current time must be inside the enrollment window
- instructor assignment is managed by ADMIN_COORDINATOR

### Enrollment

Fields:

- id UUID
- learnerId
- classOfferingId
- status
- enrolledAt
- updatedAt

Statuses:

- ACTIVE
- PENDING_PAYMENT
- COMPLETED
- DROPPED
- CANCELLED

Constraint:

```prisma
@@unique([learnerId, classOfferingId])
```

Enrollment rules:

- STUDENT + ACTIVE user only
- offering must be OPEN
- enrollment window must permit registration
- no duplicate enrollment
- free offering → ACTIVE
- paid offering → PENDING_PAYMENT
- capacity counts ACTIVE enrollments
- ownership enforced for learner-facing detail/list endpoints

## 5. Database / indexes

Recommended indexes:

### Course
- `isPublished`
- `level`

### ClassOffering
- `courseId`
- `status`
- `instructorId`

### Enrollment
- unique `(learnerId, classOfferingId)`
- `learnerId`
- `classOfferingId`
- consider `(classOfferingId, status)` because capacity queries filter ACTIVE

Migration name:

`vs01_auth_catalog_enrollment`

Do not use `db push`.

## 6. Auth / session design

Dependencies:

- `express-session`
- `connect-pg-simple`
- `@types/express-session`

Use the existing `pg`/PostgreSQL connection string but keep the session store operationally separate from Prisma internals.

Recommended session behavior:

- custom cookie name such as `sel.sid`
- HttpOnly = true
- Secure = production only
- SameSite = lax
- rolling session = true
- maxAge = 24h baseline
- store only minimal session data, primarily `userId`
- regenerate session ID after successful login
- destroy session and clear cookie on logout

Production proxy consideration:

- configure `trust proxy` appropriately before production secure-cookie deployment

No JWT.
No token in localStorage.

CSRF baseline for VS01:

- explicit CORS origin
- credentials enabled
- SameSite=Lax
- same-site SPA deployment assumption

A dedicated CSRF-token mechanism is deferred, but must be revisited if cross-site deployment requirements change.

## 7. API plan

### Auth

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`

Registration:

```json
{
  "email": "...",
  "password": "...",
  "fullName": "..."
}
```

Rules:

- validate
- normalize email
- role fixed to STUDENT
- Argon2id hash
- duplicate email → 409
- sanitized response only

Login:

- generic invalid-credentials response
- verify status ACTIVE
- verify Argon2id
- regenerate session
- store userId
- return sanitized user

### Public catalog

- `GET /api/courses`
- `GET /api/courses/:slug`

List query:

- search
- level
- page
- limit

Catalog returns only `isPublished = true`.

Course detail returns only class offerings that are appropriate for public registration, normally OPEN offerings.

### Enrollment

- `POST /api/enrollments`
- `GET /api/enrollments/my`
- `GET /api/enrollments/:id`

Role: STUDENT.

### Admin / Coordinator

Minimum required:

- `POST /api/admin/courses`
- `PATCH /api/admin/courses/:id`
- `GET /api/admin/courses`
- `POST /api/admin/class-offerings`
- `PATCH /api/admin/class-offerings/:id`
- `GET /api/admin/class-offerings`

Optional in VS01 if time remains:

- roster endpoint

Do not implement full class-management universe in this slice.

## 8. Frontend plan

Routes:

- `/`
- `/catalog`
- `/catalog/:slug`
- `/login`
- `/register`
- `/student/enrollments`
- `/admin/courses`
- `/admin/class-offerings`
- existing `/status`
- `*` not found

Student dashboard is optional/minimal; `/student/enrollments` is the required authenticated learner page for this slice.

Required frontend foundations:

- `AuthProvider`
- `useAuth`
- `ProtectedRoute`
- `RoleRoute`

Auth state:

- initial `GET /api/auth/me`
- browser-managed cookie only
- no token storage

Required pages:

- Login
- Register
- Catalog
- Course Detail
- My Enrollments
- Minimal Admin Courses
- Minimal Admin ClassOfferings

## 9. Seed strategy

Create an idempotent development seed.

Do not hard-code real or production-like credentials into source.

Preferred:

- use `SEED_DEFAULT_PASSWORD` from local/CI dev environment
- hash it with Argon2id
- create/update demo Admin, Instructor, Student accounts
- create sample courses/class offerings

Seed is development/demo tooling only.

Do not automatically seed production.

## 10. Test plan

### Unit

Auth:
- register hash
- duplicate email
- normalized email
- invalid login
- locked/inactive login
- sanitized responses

Guards:
- public bypass
- missing session → 401
- wrong role → 403

Catalog:
- only published
- search
- level filter
- slug lookup

Enrollment:
- free → ACTIVE
- paid → PENDING_PAYMENT
- duplicate → 409
- non-OPEN → reject
- outside enrollment window → reject
- full class → reject
- ownership checks

### API integration / E2E

Required:

1. register → login → me → logout
2. guest catalog without auth
3. admin creates/publishes course
4. admin creates/opens offering
5. student login → enroll → list own enrollments
6. duplicate enrollment rejected
7. STUDENT admin access rejected
8. session persists through PostgreSQL-backed store

These tests should run against PostgreSQL in CI.

### Frontend

At minimum:

- LoginForm
- RegisterForm
- CatalogPage/CourseCard
- ProtectedRoute
- enrollment success/error path
- role protection for admin route

## 11. Implementation order

### Phase 1 — Branch + DB + CI foundation

1. Create `feat/vs01-auth-catalog-enrollment`
2. Add session dependencies
3. Update Prisma schema
4. Create migration `vs01_auth_catalog_enrollment`
5. Add session table through migration
6. Add safe env-template variables
7. Add PostgreSQL service/test database to CI
8. Ensure `prisma migrate deploy` + existing quality checks pass

### Phase 2 — Auth backend

1. UsersService
2. AuthService
3. AuthController
4. DTOs
5. session middleware
6. global AuthGuard + `@Public`
7. RolesGuard + `@Roles`
8. auth unit tests
9. auth integration/E2E tests

### Phase 3 — Course/ClassOffering backend + Admin UI

1. Course service/controller
2. ClassOffering service
3. admin controllers/DTOs
4. catalog queries
5. seed data
6. minimal admin course page
7. minimal admin class-offering page

### Phase 4 — Catalog frontend

1. AuthProvider/useAuth
2. Login/Register pages
3. public catalog
4. course detail
5. route protection
6. frontend tests

### Phase 5 — Enrollment end-to-end

1. Enrollment service/controller
2. free/paid status logic
3. duplicate/capacity/window checks
4. My Enrollments frontend
5. enrollment UI from course detail
6. API E2E tests
7. frontend tests

### Phase 6 — Final verification

1. full lint
2. typecheck
3. unit tests
4. API E2E
5. frontend tests
6. build
7. manual demo:
   - admin creates course/offering
   - guest browses
   - learner registers/logs in
   - learner enrolls
   - learner views enrollment
8. update README/docs
9. security review
10. PR

## 12. Acceptance criteria

VS01 is complete only when:

1. Guest browses catalog without login.
2. Guest views published course detail.
3. Guest registers as STUDENT.
4. User logs in with Argon2id-verified credentials.
5. Browser receives HttpOnly session cookie.
6. Session is stored in PostgreSQL.
7. `/api/auth/me` works after login.
8. Logout destroys session.
9. Protected-by-default guard behavior works.
10. STUDENT cannot use admin routes.
11. ADMIN_COORDINATOR can create/edit/publish courses.
12. ADMIN_COORDINATOR can create/edit/open class offerings.
13. Minimal Admin UI exists.
14. Student can enroll in OPEN free offering → ACTIVE.
15. Student can enroll in OPEN paid offering → PENDING_PAYMENT.
16. Paid enrollment does not grant active learning access.
17. Duplicate enrollment is prevented.
18. Full class prevents additional ACTIVE enrollment.
19. Enrollment dates are enforced.
20. Student can list own enrollments.
21. Public catalog never shows unpublished courses.
22. No JWT/localStorage auth.
23. No payment-provider integration.
24. API integration/E2E tests run against PostgreSQL in CI.
25. lint/typecheck/test/build all pass.

## 13. Risk controls

- Do not add file upload in VS01 because current Multer security chain remains under review.
- Do not run `npm audit fix --force`.
- Do not change NestJS/Prisma/Vite majors during feature implementation unless a blocker is separately reviewed.
- Keep the feature branch limited to VS01.
- Do not start BKT/adaptive work before this slice is merged.

## 14. Documentation close-out

When VS01 is stable and merged:

- update README if setup/API behavior changed
- update API design documentation
- update ERD/Data Dictionary for the implemented schema
- update traceability for implemented UCs/FRs
- create `KLTN_Project_State_Checkpoint_02_VS01.md`
- add Decision Log entries for durable decisions made in this slice

**Approved to proceed to implementation after this plan is stored in the repository.**
