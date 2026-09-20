# VS01 Traceability

No authoritative FR/UC identifiers are present in the repository documents at
this checkpoint. The mapping therefore uses implemented business-flow names.
Formal FR/UC ID mapping must be synchronized with the master requirements
artifact; no IDs are invented here.

| Business flow | Backend contract | Frontend route/page | Principal verification | Status |
|---|---|---|---|---|
| Guest catalog | `GET /api/courses`, `GET /api/courses/:slug` | `/catalog` (`CatalogPage`), `/catalog/:slug` (`CourseDetailPage`) | `apps/api/test/catalog-admin.e2e-spec.ts`; `apps/web/src/features/catalog/catalog.test.tsx` | Implemented |
| Register/Login/Session | `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` | `/register` (`RegisterPage`), `/login` (`LoginPage`), `AuthProvider` | `apps/api/test/auth.e2e-spec.ts`; `apps/web/src/features/auth/auth.test.tsx` | Implemented |
| Admin course management | `GET/POST /api/admin/courses`, `PATCH /api/admin/courses/:id` | `/admin/courses` (`AdminCoursesPage`) | `apps/api/test/catalog-admin.e2e-spec.ts`; `apps/web/src/features/admin/admin.test.tsx` | Implemented for `ADMIN_COORDINATOR` |
| Admin class-offering management | `GET/POST /api/admin/class-offerings`, `PATCH /api/admin/class-offerings/:id` | `/admin/class-offerings` (`AdminClassOfferingsPage`) | `apps/api/test/catalog-admin.e2e-spec.ts`; `apps/web/src/features/admin/admin.test.tsx` | Implemented; instructor lookup/reassignment UI deferred |
| Student enrollment | `POST /api/enrollments` | Enrollment action on `/catalog/:slug` | `apps/api/test/enrollment.e2e-spec.ts`; `apps/web/src/features/enrollments/enrollment.test.tsx` | Implemented; payment confirmation deferred |
| My Enrollments | `GET /api/enrollments/my`, `GET /api/enrollments/:id` | `/student/enrollments` (`MyEnrollmentsPage`) | `apps/api/test/enrollment.e2e-spec.ts`; `apps/web/src/features/enrollments/enrollment.test.tsx` | Implemented for `STUDENT` |

## Authorization trace

- Public catalog and registration/login are explicitly public.
- The API is protected by a global authentication guard by default.
- Admin endpoints additionally require `ADMIN_COORDINATOR`.
- Enrollment endpoints additionally require `STUDENT` and derive ownership
  from the authenticated session.
- Frontend route guards mirror roles for navigation and user experience, but
  backend guards remain the security boundary.

## Deferred traceability

Payment integration, learning modules/progress, instructor lookup/reassignment,
and BKT/Adaptive behavior are outside VS01. They have no implemented endpoint,
page, or passing-system claim in this mapping.
