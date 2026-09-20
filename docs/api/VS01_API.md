# VS01 Implemented API

This document records the API contract implemented by VS01. Routes are under
the `/api` global prefix. Authentication uses the server-side `sel.sid` session
cookie; protected endpoints do not use bearer tokens.

## Authentication

| Method and path | Access | Key request fields | Main response semantics | Main errors |
|---|---|---|---|---|
| `POST /api/auth/register` | Public | `email`, `password`, `fullName` | `201`; creates a `STUDENT` account and returns the public user. It does **not** log the user in. | `400` validation, `409` duplicate email |
| `POST /api/auth/login` | Public | `email`, `password` | `200`; returns the public user and creates/regenerates a PostgreSQL-backed session cookie. | `400` validation, `401` generic invalid credentials |
| `POST /api/auth/logout` | Authenticated | None | `204`; destroys the server-side session and clears `sel.sid`. | `401` without a valid session |
| `GET /api/auth/me` | Authenticated | None | `200`; returns `id`, `email`, `fullName`, `role`, and `status`. | `401` without a valid session |

Passwords and `passwordHash` are never response fields.

## Public catalog

| Method and path | Access | Key request fields | Main response semantics | Main errors |
|---|---|---|---|---|
| `GET /api/courses` | Public | Query: optional `search`, optional `level`, `page` (default 1), `limit` (default 12, maximum 50) | `200`; paginated published courses with only OPEN class offerings. | `400` invalid query values |
| `GET /api/courses/:slug` | Public | Course slug | `200`; one published course with only OPEN offerings. Public instructor data is limited to `id` and `fullName`. | `404` missing or unpublished course |

Pricing is read from each `ClassOffering`: FREE offerings use zero tuition;
PAID offerings use `tuitionFeeVnd`. `Course` has no authoritative price.

## Admin course management

All routes require an authenticated `ADMIN_COORDINATOR` (`401` without a valid
session, `403` for another role).

| Method and path | Key request fields | Main response semantics | Main errors |
|---|---|---|---|
| `GET /api/admin/courses` | None | `200`; all courses for administration. | `401`, `403` |
| `POST /api/admin/courses` | `title`, `level`; optional `description`, `thumbnailUrl`, `isPublished` | `201`; backend derives `slug` and `createdById`. Concurrent slug collisions are retried within a bounded limit. | `400` validation, `409` slug conflict after retry exhaustion |
| `PATCH /api/admin/courses/:id` | Any allowed create field as a partial update | `200`; updates allowed fields. Changing title does not change slug. | `400` invalid UUID/body, `404` course missing |

Clients cannot submit `id`, `slug`, `createdById`, or timestamps because global
DTO validation rejects non-whitelisted fields.

## Admin class-offering management

All routes require an authenticated `ADMIN_COORDINATOR` (`401` without a valid
session, `403` for another role).

| Method and path | Key request fields | Main response semantics | Main errors |
|---|---|---|---|
| `GET /api/admin/class-offerings` | None | `200`; all offerings with course and public instructor summaries. | `401`, `403` |
| `POST /api/admin/class-offerings` | `courseId`, `name`; optional `instructorId`, `status`, `pricingType`, `tuitionFeeVnd`, `maxStudents`, enrollment/class dates | `201`; defaults to DRAFT and FREE when omitted. | `400` validation, missing course, invalid instructor, pricing/capacity/date rule |
| `PATCH /api/admin/class-offerings/:id` | Partial set of the create fields | `200`; updates only submitted fields. Explicit nullable fields may be cleared where the DTO permits. | `400` invalid UUID/body or business rule, `404` offering missing |

FREE tuition must be absent, null, or zero. PAID tuition must be a positive
integer. Capacity is optional but positive when supplied. Enrollment start must
not be after enrollment end, and class start must be before class end. The
backend accepts a valid instructor ID, but VS01 intentionally has no instructor
lookup/reassignment UI.

## Student enrollments

All routes require an authenticated `STUDENT` (`401` without a valid session,
`403` for another role). The learner identity always comes from the session.

| Method and path | Key request fields | Main response semantics | Main errors |
|---|---|---|---|
| `POST /api/enrollments` | `classOfferingId` only | `201`; FREE becomes `ACTIVE`, PAID becomes `PENDING_PAYMENT`. | `400` unavailable/window closed, `404` offering missing, `409` duplicate/full/concurrent conflict |
| `GET /api/enrollments/my` | None | `200`; current learner's enrollments ordered by enrollment time. | `401`, `403` |
| `GET /api/enrollments/:id` | Enrollment UUID | `200`; current learner's enrollment detail. | `400` invalid UUID, `404` missing or owned by another learner |

`PENDING_PAYMENT` is a payment stub only: it is not payment confirmation or
active learning access and does not consume ACTIVE capacity. FREE capacity is
checked and created in a Serializable transaction; serialization conflicts are
retried up to three attempts.
