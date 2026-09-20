# VS01 Implemented Data Model

This is the **VS01 implemented subset**, not the complete thesis domain model.
It supplements rather than replaces the formal Draw.io ERD and Excel Data
Dictionary artifacts.

## Entities and relationships

### User

Stores account identity, Argon2id password hash, name, role, status, and
timestamps.

- creates zero or more `Course` records through `Course.createdById`;
- may be assigned as instructor to zero or more `ClassOffering` records;
- owns zero or more learner `Enrollment` records.

### UserSession

Migration-managed PostgreSQL session storage used by `express-session` and
`connect-pg-simple`. It stores the session identifier (`sid`), JSON session
payload (`sess`), and expiry (`expire`). The session payload carries the
authenticated user identifier; there is no database foreign key from
`UserSession` to `User`.

### Course

Stores descriptive catalog data, publication state, creator, and timestamps.
A course has many class offerings. `slug` is stable after creation even if the
title changes.

### ClassOffering

Represents a scheduled/enrollable offering of a course. It holds status,
pricing, optional capacity and dates, and an optional instructor assignment.
Pricing belongs here, not on `Course`.

### Enrollment

Anchors a student registration to one class offering. It records the learner,
offering, enrollment status, and timestamps.

```text
User 1 ---- * Course              (createdBy)
Course 1 -- * ClassOffering
User 0..1 - * ClassOffering      (instructor assignment)
User 1 ---- * Enrollment         (learner)
ClassOffering 1 -- * Enrollment
```

## Enums

- `UserRole`: `STUDENT`, `INSTRUCTOR`, `ADMIN_COORDINATOR`
- `UserStatus`: `ACTIVE`, `INACTIVE`, `LOCKED`
- `ClassOfferingStatus`: `DRAFT`, `OPEN`, `IN_PROGRESS`, `COMPLETED`,
  `CANCELLED`
- `PricingType`: `FREE`, `PAID`
- `EnrollmentStatus`: `ACTIVE`, `PENDING_PAYMENT`, `COMPLETED`, `DROPPED`,
  `CANCELLED`

## Key constraints and indexes

- `User.email` is unique.
- `Course.slug` is unique; creation handles concurrent collisions through the
  database constraint and bounded retries.
- `Course.isPublished` and `Course.level` are indexed.
- `ClassOffering.courseId`, `status`, and `instructorId` are indexed.
- `Enrollment(learnerId, classOfferingId)` is unique, preventing duplicate
  registration at the database boundary.
- `Enrollment.learnerId`, `Enrollment.classOfferingId`, and
  `Enrollment(classOfferingId, status)` are indexed.
- `user_sessions.expire` is indexed for expiry cleanup.

Foreign keys connect courses to creators, offerings to courses and optional
instructors, and enrollments to learners and offerings.

## Implemented domain rules

- Public catalog output includes only published courses and OPEN offerings.
- FREE enrollment becomes `ACTIVE`.
- PAID enrollment becomes `PENDING_PAYMENT`; VS01 does not confirm payment or
  grant active learning access.
- Only `ACTIVE` enrollments consume offering capacity.
- FREE capacity check and enrollment creation occur in one Serializable
  transaction with bounded retry for serialization conflicts.
- Registration identity and enrollment ownership come from the authenticated
  server-side session rather than client-supplied user IDs.
