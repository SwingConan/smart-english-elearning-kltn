-- W02B additive only. Baseline 17 migrations and existing rows are not rewritten.
-- Operator must positively identify a marked disposable DEV before deployment.
BEGIN;
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE TYPE "AcademicDecisionState" AS ENUM ('DRAFT','PENDING_APPROVAL','PUBLISHED','SUPERSEDED','CANCELLED');
CREATE TYPE "RoomStatus" AS ENUM ('ACTIVE','MAINTENANCE','UNAVAILABLE');
CREATE TYPE "RoomCapability" AS ENUM ('PROJECTOR','WHITEBOARD','SPEAKERS','COMPUTER','ACCESSIBLE');
CREATE TYPE "SessionIntent" AS ENUM ('PUBLISH','RESCHEDULE','CANCEL');

CREATE TABLE course_versions (
 id UUID PRIMARY KEY, "courseId" UUID NOT NULL REFERENCES courses(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 number INTEGER NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL, level TEXT NOT NULL, "skillScope" "CourseSkillScope" NOT NULL,
 "standardPricingType" "PricingType", "standardTuitionFeeVnd" INTEGER, "effectiveFrom" TIMESTAMPTZ(3) NOT NULL,
 state "AcademicDecisionState" NOT NULL DEFAULT 'DRAFT', "proposedBy" UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 "approvedBy" UUID REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE, reason VARCHAR(500) NOT NULL, "decisionReason" VARCHAR(500),
 "lockVersion" INTEGER NOT NULL DEFAULT 0, "submittedAt" TIMESTAMPTZ(3), "approvedAt" TIMESTAMPTZ(3), "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT version_price CHECK (("standardPricingType" IS NULL AND "standardTuitionFeeVnd" IS NULL) OR ("standardPricingType" IS NOT NULL AND "standardTuitionFeeVnd" IS NOT NULL AND (("standardPricingType"='FREE' AND "standardTuitionFeeVnd"=0) OR ("standardPricingType"='PAID' AND "standardTuitionFeeVnd">0)))),
 CONSTRAINT version_decision CHECK (state IN ('DRAFT','PENDING_APPROVAL','PUBLISHED')),
 CONSTRAINT version_independent CHECK ("approvedBy" IS NULL OR "approvedBy"<>"proposedBy"),
 CONSTRAINT version_approval CHECK ((state='PUBLISHED')=("approvedBy" IS NOT NULL AND "approvedAt" IS NOT NULL))
);
CREATE UNIQUE INDEX "course_versions_courseId_number_key" ON course_versions("courseId",number);
CREATE INDEX "course_versions_state_effectiveFrom_idx" ON course_versions(state,"effectiveFrom");

CREATE TABLE rooms (
 id UUID PRIMARY KEY, code TEXT NOT NULL, name TEXT NOT NULL, location TEXT NOT NULL, capacity INTEGER NOT NULL,
 capabilities "RoomCapability"[] NOT NULL, status "RoomStatus" NOT NULL DEFAULT 'ACTIVE',
 "createdBy" UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 "lockVersion" INTEGER NOT NULL DEFAULT 0, "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT room_capacity CHECK (capacity>0)
);
CREATE UNIQUE INDEX rooms_code_key ON rooms(code);

CREATE TABLE class_instructor_assignments (
 id UUID PRIMARY KEY, "classOfferingId" UUID NOT NULL REFERENCES class_offerings(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 "instructorId" UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 "effectiveFrom" TIMESTAMPTZ(3) NOT NULL, "effectiveTo" TIMESTAMPTZ(3) NOT NULL, "reservedUntil" TIMESTAMPTZ(3) NOT NULL,
 "replacesId" UUID REFERENCES class_instructor_assignments(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 state "AcademicDecisionState" NOT NULL DEFAULT 'DRAFT', "proposedBy" UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 "approvedBy" UUID REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE, "eligibilityConfirmed" BOOLEAN NOT NULL DEFAULT false,
 reason VARCHAR(500) NOT NULL, "decisionReason" VARCHAR(500), "lockVersion" INTEGER NOT NULL DEFAULT 0,
 "submittedAt" TIMESTAMPTZ(3), "approvedAt" TIMESTAMPTZ(3), "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT assignment_interval CHECK ("effectiveTo">"effectiveFrom" AND "reservedUntil">="effectiveFrom" AND "reservedUntil"<="effectiveTo"),
 CONSTRAINT assignment_decision CHECK (state IN ('DRAFT','PENDING_APPROVAL','PUBLISHED','SUPERSEDED')),
 CONSTRAINT assignment_independent CHECK ("approvedBy" IS NULL OR "approvedBy"<>"proposedBy"),
 CONSTRAINT assignment_approval CHECK ((state IN ('PUBLISHED','SUPERSEDED'))=("approvedBy" IS NOT NULL AND "approvedAt" IS NOT NULL)),
 CONSTRAINT assignment_no_overlap EXCLUDE USING gist ("classOfferingId" WITH =, tstzrange("effectiveFrom","reservedUntil",'[)') WITH &&) WHERE (state IN ('PUBLISHED','SUPERSEDED'))
);
CREATE UNIQUE INDEX "class_instructor_assignments_replacesId_key" ON class_instructor_assignments("replacesId");
CREATE INDEX assignment_class_state_from_idx ON class_instructor_assignments("classOfferingId",state,"effectiveFrom");

CREATE TABLE teaching_sessions (
 id UUID PRIMARY KEY, "occurrenceId" UUID NOT NULL, revision INTEGER NOT NULL DEFAULT 1,
 "supersedesId" UUID REFERENCES teaching_sessions(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 "classOfferingId" UUID NOT NULL REFERENCES class_offerings(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 "startsAt" TIMESTAMPTZ(3) NOT NULL, "endsAt" TIMESTAMPTZ(3) NOT NULL, timezone TEXT NOT NULL, modality "ClassModality" NOT NULL,
 "roomId" UUID REFERENCES rooms(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 "instructorId" UUID REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 "assignmentId" UUID REFERENCES class_instructor_assignments(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 "requiredCapabilities" "RoomCapability"[] NOT NULL,
 "sourceTemplateId" UUID REFERENCES class_schedule_slots(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 "sourceTemplateUpdatedAt" TIMESTAMP(3), "generationKey" TEXT, "generatedFrom" DATE, "generatedThrough" DATE,
 state "AcademicDecisionState" NOT NULL DEFAULT 'DRAFT', intent "SessionIntent" NOT NULL DEFAULT 'PUBLISH',
 "proposedBy" UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 "approvedBy" UUID REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 reason VARCHAR(500) NOT NULL, "decisionReason" VARCHAR(500), "lockVersion" INTEGER NOT NULL DEFAULT 0,
 "submittedAt" TIMESTAMPTZ(3), "approvedAt" TIMESTAMPTZ(3), "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT session_interval CHECK ("endsAt">"startsAt"),
 CONSTRAINT session_revision CHECK (revision>0),
 CONSTRAINT session_independent CHECK ("approvedBy" IS NULL OR "approvedBy"<>"proposedBy"),
 CONSTRAINT session_approval CHECK ((state IN ('PUBLISHED','SUPERSEDED','CANCELLED'))=("approvedBy" IS NOT NULL AND "approvedAt" IS NOT NULL)),
 CONSTRAINT session_online_room CHECK (modality<>'ONLINE' OR "roomId" IS NULL),
 CONSTRAINT session_room_no_overlap EXCLUDE USING gist ("roomId" WITH =, tstzrange("startsAt","endsAt",'[)') WITH &&) WHERE (state='PUBLISHED' AND "roomId" IS NOT NULL),
 CONSTRAINT session_instructor_no_overlap EXCLUDE USING gist ("instructorId" WITH =, tstzrange("startsAt","endsAt",'[)') WITH &&) WHERE (state='PUBLISHED'),
 CONSTRAINT session_class_no_overlap EXCLUDE USING gist ("classOfferingId" WITH =, tstzrange("startsAt","endsAt",'[)') WITH &&) WHERE (state='PUBLISHED')
);
CREATE UNIQUE INDEX "teaching_sessions_generationKey_key" ON teaching_sessions("generationKey");
CREATE UNIQUE INDEX "teaching_sessions_occurrenceId_revision_key" ON teaching_sessions("occurrenceId",revision);
CREATE UNIQUE INDEX session_one_current_revision ON teaching_sessions("occurrenceId") WHERE state='PUBLISHED';
CREATE INDEX "teaching_sessions_classOfferingId_state_startsAt_idx" ON teaching_sessions("classOfferingId",state,"startsAt");
CREATE INDEX "teaching_sessions_instructorId_state_startsAt_idx" ON teaching_sessions("instructorId",state,"startsAt");

CREATE TABLE academic_notification_intents (
 id UUID PRIMARY KEY, "sessionId" UUID NOT NULL REFERENCES teaching_sessions(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 "recipientId" UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 kind "SessionIntent" NOT NULL, "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "academic_notification_intents_sessionId_recipientId_key" ON academic_notification_intents("sessionId","recipientId");

ALTER TABLE class_offerings ADD COLUMN "versionId" UUID REFERENCES course_versions(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 ADD COLUMN "termsTitle" TEXT, ADD COLUMN "termsDescription" TEXT, ADD COLUMN "termsLevel" TEXT, ADD COLUMN "termsSkillScope" "CourseSkillScope",
 ADD COLUMN "approvedPricingType" "PricingType", ADD COLUMN "approvedTuitionFeeVnd" INTEGER, ADD COLUMN "termsApprovedAt" TIMESTAMPTZ(3);
ALTER TABLE class_offerings ADD CONSTRAINT offer_version_snapshot_pair CHECK (
 ("versionId" IS NULL AND "termsTitle" IS NULL AND "termsDescription" IS NULL AND "termsLevel" IS NULL AND "termsSkillScope" IS NULL AND "approvedPricingType" IS NULL AND "approvedTuitionFeeVnd" IS NULL AND "termsApprovedAt" IS NULL) OR
 ("versionId" IS NOT NULL AND "termsTitle" IS NOT NULL AND "termsDescription" IS NOT NULL AND "termsLevel" IS NOT NULL AND "termsSkillScope" IS NOT NULL AND "approvedPricingType" IS NOT NULL AND "approvedTuitionFeeVnd" IS NOT NULL AND "termsApprovedAt" IS NOT NULL));

-- Extend the existing CHECK without invalidating any existing W01 contract.
ALTER TABLE permission_grants DROP CONSTRAINT grant_scope;
ALTER TABLE permission_grants ADD CONSTRAINT grant_scope CHECK (
 ("scopeType"='GLOBAL' AND "scopeId" IS NULL AND capability NOT LIKE 'academic.%') OR
 ("scopeType"='CLASS' AND "scopeId" IS NOT NULL AND capability IN ('class.read','academic.schedule.approve')) OR
 ("scopeType"='COURSE' AND "scopeId" IS NOT NULL AND capability='academic.program.approve'));

CREATE FUNCTION v2_academic_approver(actor UUID, capability_name TEXT, scope_type TEXT, scope_id TEXT) RETURNS BOOLEAN
 LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(842030);
 RETURN EXISTS (SELECT 1 FROM users u JOIN permission_grants g ON g."userId"=u.id
  WHERE u.id=actor AND u.role='ACADEMIC_MANAGER' AND u.status='ACTIVE' AND g.capability=capability_name
   AND g."scopeType"=scope_type AND g."scopeId"=scope_id AND g."approvedBy" IS NOT NULL
   AND g."approvedAt"<=timezone('UTC',clock_timestamp()) AND g."revokedAt" IS NULL
   AND g."effectiveAt"<=timezone('UTC',clock_timestamp()) AND g."expiresAt">timezone('UTC',clock_timestamp()));
END $$;

CREATE FUNCTION v2_academic_history_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE class_id UUID; owner_id UUID; a class_instructor_assignments; r rooms; prior teaching_sessions; planned_capacity INTEGER; scope_kind TEXT; scope_identity TEXT; cap_name TEXT;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'ACADEMIC_HISTORY_IMMUTABLE' USING ERRCODE='23514'; END IF;
 IF TG_OP='INSERT' AND NEW.state<>'DRAFT' THEN RAISE EXCEPTION 'ACADEMIC_MUST_START_DRAFT' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' THEN
  IF OLD.state IN ('PUBLISHED','SUPERSEDED','CANCELLED') THEN
   IF NOT (OLD.state='PUBLISHED' AND NEW.state='SUPERSEDED' AND TG_TABLE_NAME<>'course_versions'
    AND (to_jsonb(NEW)-'state'-'lockVersion'-'reservedUntil')=(to_jsonb(OLD)-'state'-'lockVersion'-'reservedUntil')) THEN
    RAISE EXCEPTION 'ACADEMIC_HISTORY_IMMUTABLE' USING ERRCODE='23514';
   END IF;
   RETURN NEW;
  END IF;
  IF NEW.id<>OLD.id OR NEW."proposedBy"<>OLD."proposedBy" OR NEW."createdAt"<>OLD."createdAt" THEN
   RAISE EXCEPTION 'ACADEMIC_PROVENANCE_IMMUTABLE' USING ERRCODE='23514';
  END IF;
  IF OLD.state='DRAFT' AND NEW.state NOT IN ('DRAFT','PENDING_APPROVAL') THEN RAISE EXCEPTION 'SUBMIT_BEFORE_APPROVAL' USING ERRCODE='23514'; END IF;
  IF OLD.state='PENDING_APPROVAL' AND NEW.state NOT IN ('PENDING_APPROVAL','DRAFT','PUBLISHED','CANCELLED') THEN RAISE EXCEPTION 'INVALID_ACADEMIC_TRANSITION' USING ERRCODE='23514'; END IF;
  IF OLD.state='PENDING_APPROVAL' AND (to_jsonb(NEW)-'state'-'approvedBy'-'approvedAt'-'decisionReason'-'lockVersion'-'eligibilityConfirmed')
   IS DISTINCT FROM (to_jsonb(OLD)-'state'-'approvedBy'-'approvedAt'-'decisionReason'-'lockVersion'-'eligibilityConfirmed') THEN
   RAISE EXCEPTION 'ACADEMIC_SUBMITTED_PAYLOAD_FROZEN' USING ERRCODE='23514';
  END IF;
 END IF;
 IF NOT EXISTS (SELECT 1 FROM users WHERE id=NEW."proposedBy" AND role='ACADEMIC_MANAGER' AND status='ACTIVE') THEN
  RAISE EXCEPTION 'ACADEMIC_MAKER_REQUIRED' USING ERRCODE='23514'; END IF;
 IF TG_TABLE_NAME='course_versions' THEN
  scope_kind:='COURSE'; scope_identity:=NEW."courseId"::TEXT; cap_name:='academic.program.approve';
  SELECT "createdById" INTO owner_id FROM courses WHERE id=NEW."courseId";
  IF owner_id IS DISTINCT FROM NEW."proposedBy" THEN RAISE EXCEPTION 'ACADEMIC_OWNER_REQUIRED' USING ERRCODE='23514'; END IF;
 ELSE
  class_id:=NEW."classOfferingId";
  scope_kind:='CLASS'; scope_identity:=class_id::TEXT; cap_name:='academic.schedule.approve';
  SELECT c."createdById" INTO owner_id FROM courses c JOIN class_offerings o ON o."courseId"=c.id WHERE o.id=class_id;
  IF owner_id IS DISTINCT FROM NEW."proposedBy" THEN RAISE EXCEPTION 'ACADEMIC_OWNER_REQUIRED' USING ERRCODE='23514'; END IF;
 END IF;
 IF NEW.state IN ('PUBLISHED','CANCELLED') THEN
  IF TG_OP<>'UPDATE' OR OLD.state<>'PENDING_APPROVAL' OR NEW."approvedBy" IS NULL OR NEW."approvedBy"=NEW."proposedBy" THEN
   RAISE EXCEPTION 'INDEPENDENT_APPROVAL_REQUIRED' USING ERRCODE='23514'; END IF;
  IF NOT v2_academic_approver(NEW."approvedBy",cap_name,scope_kind,scope_identity) THEN
   RAISE EXCEPTION 'ACADEMIC_APPROVER_GRANT_REQUIRED' USING ERRCODE='23514'; END IF;
  IF TG_TABLE_NAME='class_instructor_assignments' THEN
   IF NOT NEW."eligibilityConfirmed" OR NEW."effectiveFrom"<clock_timestamp() OR NOT EXISTS(SELECT 1 FROM users WHERE id=NEW."instructorId" AND role='INSTRUCTOR' AND status='ACTIVE') THEN
    RAISE EXCEPTION 'ASSIGNMENT_ELIGIBILITY_OR_TIME_INVALID' USING ERRCODE='23514'; END IF;
  ELSIF TG_TABLE_NAME='teaching_sessions' THEN
   IF NEW."supersedesId" IS NOT NULL THEN
    SELECT * INTO prior FROM teaching_sessions WHERE id=NEW."supersedesId";
    IF prior.id IS NULL OR prior.state<>'SUPERSEDED' OR prior."occurrenceId"<>NEW."occurrenceId" OR prior."classOfferingId"<>class_id OR prior.revision+1<>NEW.revision THEN
     RAISE EXCEPTION 'STALE_SESSION_REVISION' USING ERRCODE='23514'; END IF;
   END IF;
   IF NEW.intent='CANCEL' THEN
    IF NEW.state<>'CANCELLED' OR NEW."supersedesId" IS NULL THEN RAISE EXCEPTION 'INVALID_CANCELLATION' USING ERRCODE='23514'; END IF;
    IF (NEW."startsAt",NEW."endsAt",NEW."roomId",NEW."instructorId",NEW."assignmentId",NEW.timezone,NEW.modality) IS DISTINCT FROM
     (prior."startsAt",prior."endsAt",prior."roomId",prior."instructorId",prior."assignmentId",prior.timezone,prior.modality) THEN
     RAISE EXCEPTION 'CANCELLATION_SNAPSHOT_REQUIRED' USING ERRCODE='23514'; END IF;
   ELSE
    IF NEW.state<>'PUBLISHED' OR NEW."startsAt"<=clock_timestamp() THEN RAISE EXCEPTION 'SESSION_MUST_BE_FUTURE' USING ERRCODE='23514'; END IF;
    SELECT * INTO a FROM class_instructor_assignments WHERE id=NEW."assignmentId";
    IF a.id IS NULL OR a.state NOT IN ('PUBLISHED','SUPERSEDED') OR a."classOfferingId"<>class_id OR a."instructorId" IS DISTINCT FROM NEW."instructorId"
      OR a."effectiveFrom">NEW."startsAt" OR a."reservedUntil"<NEW."endsAt" THEN
     RAISE EXCEPTION 'SESSION_ASSIGNMENT_INVALID' USING ERRCODE='23514'; END IF;
    IF NOT EXISTS(SELECT 1 FROM users WHERE id=NEW."instructorId" AND role='INSTRUCTOR' AND status='ACTIVE') THEN
     RAISE EXCEPTION 'SESSION_INSTRUCTOR_INACTIVE' USING ERRCODE='23514'; END IF;
    IF NEW.modality<>'ONLINE' THEN
     SELECT * INTO r FROM rooms WHERE id=NEW."roomId" FOR SHARE;
     SELECT "maxStudents" INTO planned_capacity FROM class_offerings WHERE id=class_id;
     IF r.id IS NULL OR r.status<>'ACTIVE' OR planned_capacity IS NULL OR r.capacity<planned_capacity OR NOT (r.capabilities @> NEW."requiredCapabilities") THEN
      RAISE EXCEPTION 'ROOM_UNSUITABLE' USING ERRCODE='23514'; END IF;
    END IF;
   END IF;
  END IF;
 END IF;
 IF TG_TABLE_NAME='teaching_sessions' THEN
  IF NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=NEW.timezone) THEN RAISE EXCEPTION 'IANA_TIMEZONE_REQUIRED' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER version_history_guard BEFORE INSERT OR UPDATE OR DELETE ON course_versions FOR EACH ROW EXECUTE FUNCTION v2_academic_history_guard();
CREATE TRIGGER assignment_history_guard BEFORE INSERT OR UPDATE OR DELETE ON class_instructor_assignments FOR EACH ROW EXECUTE FUNCTION v2_academic_history_guard();
CREATE TRIGGER session_history_guard BEFORE INSERT OR UPDATE OR DELETE ON teaching_sessions FOR EACH ROW EXECUTE FUNCTION v2_academic_history_guard();
CREATE FUNCTION v2_academic_supersession_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.state='SUPERSEDED' AND OLD.state='PUBLISHED' THEN
  IF TG_TABLE_NAME='teaching_sessions' THEN
   IF NOT EXISTS(SELECT 1 FROM teaching_sessions WHERE "supersedesId"=OLD.id AND state IN ('PUBLISHED','CANCELLED')) THEN
    RAISE EXCEPTION 'ATOMIC_SESSION_REPLACEMENT_REQUIRED' USING ERRCODE='23514'; END IF;
  ELSE
   IF NOT EXISTS(SELECT 1 FROM class_instructor_assignments WHERE "replacesId"=OLD.id AND "classOfferingId"=OLD."classOfferingId" AND state='PUBLISHED' AND "effectiveFrom"=NEW."reservedUntil" AND "effectiveFrom">=OLD."effectiveFrom" AND "effectiveFrom"<=OLD."reservedUntil") THEN
    RAISE EXCEPTION 'ATOMIC_ASSIGNMENT_REPLACEMENT_REQUIRED' USING ERRCODE='23514'; END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER session_atomic_supersession AFTER UPDATE ON teaching_sessions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION v2_academic_supersession_guard();
CREATE CONSTRAINT TRIGGER assignment_atomic_supersession AFTER UPDATE ON class_instructor_assignments DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION v2_academic_supersession_guard();
CREATE TRIGGER version_no_truncate BEFORE TRUNCATE ON course_versions FOR EACH STATEMENT EXECUTE FUNCTION v2_audit_immutable();
CREATE TRIGGER assignment_no_truncate BEFORE TRUNCATE ON class_instructor_assignments FOR EACH STATEMENT EXECUTE FUNCTION v2_audit_immutable();
CREATE TRIGGER session_no_truncate BEFORE TRUNCATE ON teaching_sessions FOR EACH STATEMENT EXECUTE FUNCTION v2_audit_immutable();
CREATE TRIGGER academic_outbox_no_mutation BEFORE UPDATE OR DELETE OR TRUNCATE ON academic_notification_intents FOR EACH STATEMENT EXECUTE FUNCTION v2_audit_immutable();

CREATE FUNCTION v2_offer_terms_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE v course_versions;
BEGIN
 IF TG_OP='UPDATE' AND OLD."versionId" IS NOT NULL AND
  (NEW."versionId",NEW."courseId",NEW."termsTitle",NEW."termsDescription",NEW."termsLevel",NEW."termsSkillScope",NEW."approvedPricingType",NEW."approvedTuitionFeeVnd",NEW."termsApprovedAt",NEW."pricingType",NEW."tuitionFeeVnd") IS DISTINCT FROM
  (OLD."versionId",OLD."courseId",OLD."termsTitle",OLD."termsDescription",OLD."termsLevel",OLD."termsSkillScope",OLD."approvedPricingType",OLD."approvedTuitionFeeVnd",OLD."termsApprovedAt",OLD."pricingType",OLD."tuitionFeeVnd") THEN
   RAISE EXCEPTION 'OFFER_TERMS_IMMUTABLE' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' AND OLD."versionId" IS NULL AND NEW."versionId" IS NOT NULL THEN
  RAISE EXCEPTION 'NO_RETROACTIVE_VERSION_LINK' USING ERRCODE='23514'; END IF;
 IF TG_OP='INSERT' AND NEW."versionId" IS NOT NULL THEN
  SELECT * INTO v FROM course_versions WHERE id=NEW."versionId";
  IF v.id IS NULL OR v.state<>'PUBLISHED' OR v."courseId"<>NEW."courseId" OR v."effectiveFrom">clock_timestamp() OR v."standardPricingType" IS NULL
   OR (NEW."termsTitle",NEW."termsDescription",NEW."termsLevel",NEW."termsSkillScope",NEW."approvedPricingType",NEW."approvedTuitionFeeVnd",NEW."termsApprovedAt",NEW."pricingType",NEW."tuitionFeeVnd") IS DISTINCT FROM
    (v.title,v.description,v.level,v."skillScope",v."standardPricingType",v."standardTuitionFeeVnd",v."approvedAt",v."standardPricingType",v."standardTuitionFeeVnd") THEN
   RAISE EXCEPTION 'APPROVED_VERSION_SNAPSHOT_REQUIRED' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER offer_terms_guard BEFORE INSERT OR UPDATE ON class_offerings FOR EACH ROW EXECUTE FUNCTION v2_offer_terms_guard();

CREATE FUNCTION v2_room_live_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM teaching_sessions WHERE "roomId"=OLD.id AND state='PUBLISHED' AND "endsAt">clock_timestamp()) THEN
  RAISE EXCEPTION 'ROOM_IN_USE_REVISE_SESSIONS_FIRST' USING ERRCODE='23514'; END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER room_live_guard BEFORE UPDATE OR DELETE ON rooms FOR EACH ROW EXECUTE FUNCTION v2_room_live_guard();
COMMIT;
