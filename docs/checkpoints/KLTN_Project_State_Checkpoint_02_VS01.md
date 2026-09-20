# KLTN Project State Checkpoint 02 — VS01

## 1. Snapshot

- Date: 2026-09-20
- Branch: `feat/vs01-auth-catalog-enrollment`
- HEAD before documentation close-out: `670dd28`
- Status: VS01 functional implementation and targeted fix review complete;
  Phase 6D-2 documentation close-out is uncommitted and awaiting review.

## 2. VS01 scope

Implemented: session authentication, public catalog, coordinator management of
courses and class offerings, student enrollment, My Enrollments, database
migrations, development seed, tests, and CI coverage.

Explicitly out: payment confirmation, learning module/progress, instructor
lookup/reassignment UI, BKT/Adaptive behavior, CSRF token implementation,
production proxy configuration, auth rate limiting, and audit remediation.

## 3. Implemented architecture

- Web: React/TypeScript/Vite SPA in `apps/web`; feature API clients and route
  guards; Vite proxies `/api` during local development.
- API: NestJS 11 modular monolith in `apps/api`; global REST prefix `/api` and
  Swagger at `/docs`.
- Database: PostgreSQL through Prisma 7.10.0 and migration-first schema changes.
- Sessions: `express-session` with `connect-pg-simple`; migration-managed
  `user_sessions`; HttpOnly `sel.sid`, `SameSite=Lax`, secure in production.
- Authentication is protected-by-default through a global auth guard; public
  endpoints require explicit `@Public()` metadata. Roles are enforced by the
  backend roles guard.

## 4. Implemented domain/data

The VS01 subset contains `User`, `UserSession`, `Course`, `ClassOffering`, and
`Enrollment`, with enums `UserRole`, `UserStatus`, `ClassOfferingStatus`,
`PricingType`, and `EnrollmentStatus`.

Durable decisions:

- pricing lives on `ClassOffering`, not `Course`;
- `user_sessions` is owned by Prisma migrations;
- enrollment is unique by learner and class offering;
- instructor assignment is optional and references a real `INSTRUCTOR` user.

See `docs/design/VS01_IMPLEMENTED_DATA_MODEL.md` for constraints and indexes.

## 5. Auth/session behavior

- Registration creates an active `STUDENT` account and never auto-logs in.
- Login verifies Argon2id hashes, regenerates the session, and persists the user
  ID server-side.
- `/auth/me` returns only the public user contract.
- Logout destroys the database session and clears the cookie.
- Generic login errors do not disclose whether an account exists.
- Expired admin/student sessions clear or refresh client auth state and redirect
  through a sanitized internal return URL; mutations are not retried.

## 6. Course/ClassOffering behavior

- Public APIs expose only published courses and OPEN offerings.
- Public instructor shape is limited to `id` and `fullName`.
- Course slug is backend-owned, stable on title edits, and created with bounded
  retry on database uniqueness collisions.
- `createdById` comes from the authenticated coordinator.
- Offerings own pricing, capacity, dates, status, and optional instructor.
- FREE pricing permits zero/no tuition; PAID requires positive integer tuition.
- The admin UI intentionally does not fake instructor data or provide an
  assignment UI because no lookup endpoint exists.

## 7. Enrollment behavior

- Only authenticated `STUDENT` users can enroll.
- The request contains only `classOfferingId`; learner identity comes from the
  session.
- FREE becomes `ACTIVE`; PAID becomes `PENDING_PAYMENT`.
- `PENDING_PAYMENT` is not active learning access and does not consume ACTIVE
  capacity.
- Duplicate enrollment is protected by service checks and a database unique
  constraint.
- FREE capacity check and creation share a Serializable transaction. Prisma
  P2034 retry is bounded to three attempts.
- Detail ownership returns 404 when the enrollment is absent or belongs to
  another learner.

## 8. Frontend routes

- Public: `/`, `/status`, `/catalog`, `/catalog/:slug`, `/login`, `/register`
- Student: `/student/enrollments`
- Coordinator: `/admin/courses`, `/admin/class-offerings`
- Instructor: `/instructor/*` remains a protected placeholder, not a completed
  learning workflow.

The UI uses cookie sessions only; it stores no bearer token and cannot read the
HttpOnly session cookie.

## 9. Tests and validation

Latest Phase 6D-2 validation on 2026-09-20:

- Skeleton check: PASS
- Lint: PASS
- Typecheck: PASS
- API unit tests: PASS — 8 suites / 53 tests
- Web tests: PASS — 6 files / 50 tests
- API E2E: PASS — 4 suites / 6 tests
- Build: PASS

Principal E2E files are `auth.e2e-spec.ts`, `catalog-admin.e2e-spec.ts`,
`enrollment.e2e-spec.ts`, and `health.e2e-spec.ts`.

## 10. CI

`.github/workflows/ci.yml` uses Node 22.22.3, npm 12.0.2, PostgreSQL 14, and
CI-only credentials. It runs `npm ci`, Prisma Client generation,
`prisma migrate deploy`, skeleton check, lint, typecheck, unit/frontend tests,
API E2E, and build. The development seed is not part of CI.

## 11. Security baseline / known risks

- Recorded npm audit status: 0 critical, 9 high, 0 moderate, 0 low.
- Known chains: NestJS/Multer and Prisma tooling through `deepmerge-ts`/`mysql2`.
- No upload endpoint currently exists, and the application uses PostgreSQL;
  neither fact removes the recorded advisories.
- No verified non-breaking remediation is currently adopted. Do not run
  `npm audit fix --force`.
- Deferred production work: reassess CSRF protection, configure `trust proxy`
  for reverse-proxy secure cookies, add auth rate limiting, and re-review Multer
  before file upload.
- This checkpoint does not claim the system is production ready.

## 12. Development seed

`npm run prisma:seed` requires local ignored `SEED_DEFAULT_PASSWORD` with 8–128
characters. The seed is blocked in production, uses Argon2id, and is idempotent
through stable user emails, a stable course slug, and stable offering IDs.

It creates/updates demo `ADMIN_COORDINATOR`, `INSTRUCTOR`, and `STUDENT` users,
one published sample course, and FREE and PAID OPEN offerings assigned to the
demo instructor. Reruns update hashes from the current local password without
logging the password or hash.

## 13. Git checkpoint history

- `eb82b01` — `feat: establish vs01 database and ci foundation`
- `8c1154e` — `feat: implement session authentication backend`
- `faac3c2` — `feat: implement course and class offering backend`
- `dea3306` — `feat: implement enrollment backend`
- `86e0aaf` — `feat: implement frontend authentication`
- `cf36a00` — `feat: implement public course catalog frontend`
- `d04aa30` — `feat: implement admin course and class offering ui`
- `d5c1cc5` — `feat: implement enrollment frontend`
- `670dd28` — `fix: harden vs01 edge cases and development setup`

## 14. Review history

- Phase 6A: technical verification completed before targeted fixes.
- Phase 6B: independent Claude review completed.
- Phase 6C: targeted fix pass completed and committed at `670dd28`.
- Phase 6D-1: targeted re-review of `d5c1cc5...670dd28` reported 0 BLOCKER,
  0 HIGH, 0 MEDIUM, and 0 LOW findings; documentation close-out approved.

## 15. Deferred items

- Payment confirmation and payment-provider integration
- Learning modules, lessons, progress, and completion
- Instructor lookup/reassignment UI and supporting lookup contract
- BKT/Adaptive implementation
- Production CSRF/proxy/rate-limit hardening
- Dependency advisory remediation when a verified compatible path exists

After repo documentation review, synchronize these external formal artifacts;
they are **not claimed as updated here**:

- ERD / Data Dictionary
- API Design artifact
- Requirements/UC traceability spreadsheet
- Decision Log
- Report implementation chapter

## 16. Exact next step

Have ChatGPT Web review the Phase 6D-2 documentation-only diff. If approved,
create the documentation checkpoint commit, then follow the separately approved
push/PR workflow. Do not begin the next functional slice during VS01 code freeze.
