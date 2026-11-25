-- Wave 02 / W09: Additive completion policy, certificate review, governed issuance, lookup & revocation.
-- Applied only on disposable E2E/DEV databases. Never mutates protected QA/Baseline DBs.
BEGIN;

ALTER TABLE permission_grants DROP CONSTRAINT grant_scope;
ALTER TABLE permission_grants ADD CONSTRAINT grant_scope CHECK (
  ("scopeType"='GLOBAL' AND "scopeId" IS NULL AND capability NOT LIKE 'consultation.%' AND capability NOT LIKE 'inspection.%' AND capability<>'shift.review' AND capability NOT LIKE 'academic.%' AND capability NOT LIKE 'finance.%' AND capability NOT LIKE 'certificate.%' AND (capability NOT LIKE 'support.%' OR capability IN ('support.taxonomy.author','support.taxonomy.approve'))) OR
  ("scopeType"='CLASS' AND "scopeId" IS NOT NULL AND capability IN ('class.read','academic.schedule.approve','academic.rubric.approve','academic.grade.publish','academic.quiz.approve','academic.quiz.grade.publish','academic.meeting.approve','academic.attendance.approve','academic.admission.approve','finance.verify','finance.adjust.propose','finance.adjust.approve','inspection.assign','inspection.hours.review','shift.review','certificate.policy.approve','certificate.review','certificate.issue','certificate.revoke')) OR
  ("scopeType"='COURSE' AND "scopeId" IS NOT NULL AND capability IN ('academic.program.approve','certificate.policy.approve')) OR
  ("scopeType"='SUPPORT_TOPIC' AND "scopeId" ~ '^[A-Z][A-Z0-9_]{2,39}$' AND capability IN ('support.ticket.read','support.ticket.assign','support.ticket.reply','support.ticket.transfer','support.ticket.close','support.application.write','support.application.review','support.referral.respond')) OR
  ("scopeType"='TEACHER' AND "scopeId" ~ '^[0-9a-f-]{36}$' AND capability IN ('consultation.profile.approve','consultation.link.approve','consultation.booking.review'))
);

CREATE TABLE w09_completion_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "courseId" uuid NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
  "classOfferingId" uuid REFERENCES class_offerings(id) ON DELETE RESTRICT,
  code varchar(80) NOT NULL UNIQUE,
  version integer NOT NULL DEFAULT 1,
  title varchar(200) NOT NULL,
  description varchar(2000) NOT NULL,
  "isTestPolicy" boolean NOT NULL DEFAULT false,
  criteria jsonb NOT NULL,
  state varchar(24) NOT NULL DEFAULT 'DRAFT' CHECK (state IN ('DRAFT', 'APPROVED', 'REJECTED')),
  "makerId" uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  "reviewerId" uuid REFERENCES users(id) ON DELETE RESTRICT,
  reason varchar(1000) NOT NULL,
  "reviewReason" varchar(1000),
  "createdAt" timestamptz(3) NOT NULL DEFAULT clock_timestamp(),
  "reviewedAt" timestamptz(3),
  CHECK ("reviewerId" IS NULL OR "reviewerId" <> "makerId"),
  CHECK (jsonb_typeof(criteria) = 'array' AND jsonb_array_length(criteria) >= 1)
);

CREATE INDEX w09_policies_course_state ON w09_completion_policies("courseId", state);
CREATE INDEX w09_policies_class_state ON w09_completion_policies("classOfferingId", state);

CREATE TABLE w09_certificate_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "enrollmentId" uuid NOT NULL REFERENCES enrollments(id) ON DELETE RESTRICT,
  "policyId" uuid NOT NULL REFERENCES w09_completion_policies(id) ON DELETE RESTRICT,
  decision varchar(24) NOT NULL CHECK (decision IN ('ELIGIBLE', 'REJECTED')),
  "evaluationSnapshot" jsonb NOT NULL,
  "reviewerId" uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reason varchar(1000) NOT NULL,
  "createdAt" timestamptz(3) NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX w09_reviews_enrollment ON w09_certificate_reviews("enrollmentId", "createdAt" DESC);

CREATE TABLE w09_certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "certificateCode" varchar(64) NOT NULL UNIQUE,
  "enrollmentId" uuid NOT NULL UNIQUE REFERENCES enrollments(id) ON DELETE RESTRICT,
  "policyId" uuid NOT NULL REFERENCES w09_completion_policies(id) ON DELETE RESTRICT,
  "reviewId" uuid NOT NULL UNIQUE REFERENCES w09_certificate_reviews(id) ON DELETE RESTRICT,
  "idempotencyKey" varchar(120) NOT NULL UNIQUE,
  "isTestPolicy" boolean NOT NULL DEFAULT false,
  state varchar(24) NOT NULL DEFAULT 'ISSUED' CHECK (state IN ('ISSUED', 'REVOKED')),
  "immutableSnapshot" jsonb NOT NULL,
  "reviewerId" uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  "issuerId" uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  "issueReason" varchar(1000) NOT NULL,
  "issuedAt" timestamptz(3) NOT NULL DEFAULT clock_timestamp(),
  "revokedById" uuid REFERENCES users(id) ON DELETE RESTRICT,
  "revokeReason" varchar(1000),
  "revokedAt" timestamptz(3),
  CHECK ("issuerId" <> "reviewerId"),
  CHECK (
    (state = 'ISSUED' AND "revokedById" IS NULL AND "revokeReason" IS NULL AND "revokedAt" IS NULL) OR
    (state = 'REVOKED' AND "revokedById" IS NOT NULL AND length(coalesce("revokeReason", '')) >= 10 AND "revokedAt" IS NOT NULL)
  )
);

CREATE TABLE w09_certificate_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "certificateId" uuid REFERENCES w09_certificates(id) ON DELETE RESTRICT,
  "policyId" uuid REFERENCES w09_completion_policies(id) ON DELETE RESTRICT,
  "enrollmentId" uuid REFERENCES enrollments(id) ON DELETE RESTRICT,
  "actorId" uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  kind varchar(48) NOT NULL,
  reason varchar(1000) NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamptz(3) NOT NULL DEFAULT clock_timestamp()
);

COMMIT;
