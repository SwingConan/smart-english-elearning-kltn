-- Add ASSIGNMENT to the class-local publication contract. No legacy data backfill.
-- Cast to text inside checks so PostgreSQL can add/use enum after this transaction commits.
ALTER TYPE "ClassActivityType" ADD VALUE 'ASSIGNMENT';
ALTER TABLE class_activity_revisions DROP CONSTRAINT revision_shape;
ALTER TABLE class_activity_revisions ADD CONSTRAINT revision_shape CHECK (
 number>0 AND length(btrim(title))>0
 AND ("availableFrom" IS NULL OR "availableUntil" IS NULL OR "availableUntil">"availableFrom")
 AND ((type::text='LESSON' AND length(btrim("contentMarkdown"))>0 AND "resourceUrl" IS NULL AND "storageKey" IS NULL)
 OR (type::text='RESOURCE' AND (("resourceUrl" IS NOT NULL)::int+("storageKey" IS NOT NULL)::int)=1)
 OR (type::text='ASSIGNMENT' AND length(btrim("contentMarkdown"))>0 AND "resourceUrl" IS NULL AND "storageKey" IS NULL)));
ALTER TABLE class_activities ADD CONSTRAINT assignment_draft_shape CHECK (type::text<>'ASSIGNMENT' OR (
 "resourceUrl" IS NULL AND "storageKey" IS NULL AND "sourceLessonId" IS NULL AND "sourceResourceId" IS NULL AND "availableFrom" IS NULL AND "availableUntil" IS NULL));
ALTER TABLE class_activity_revisions ADD CONSTRAINT assignment_revision_shape CHECK (type::text<>'ASSIGNMENT' OR (
 "sourceLessonId" IS NULL AND "sourceResourceId" IS NULL AND "availableFrom" IS NULL AND "availableUntil" IS NULL));

CREATE TABLE class_assignment_submissions (
 id UUID PRIMARY KEY,
 "activityId" UUID NOT NULL REFERENCES class_activities(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 "enrollmentId" UUID NOT NULL REFERENCES enrollments(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 "revisionId" UUID NOT NULL REFERENCES class_activity_revisions(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 "learnerId" UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 "classOfferingId" UUID NOT NULL REFERENCES class_offerings(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 state VARCHAR(16) NOT NULL DEFAULT 'DRAFT', text TEXT NOT NULL DEFAULT '',
 "storageKey" TEXT, "originalFileName" TEXT, "mimeType" TEXT, "fileBytes" INTEGER, "fileSha256" VARCHAR(64),
 "lockVersion" INTEGER NOT NULL DEFAULT 1, "idempotencyKey" UUID, "requestHash" VARCHAR(64),
 "submittedAt" TIMESTAMPTZ(3), "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMPTZ(3) NOT NULL,
 CONSTRAINT submission_shape CHECK (
  "lockVersion">=1 AND length(text)<=100000 AND
  ((state='DRAFT' AND "submittedAt" IS NULL AND "idempotencyKey" IS NULL AND "requestHash" IS NULL)
   OR (state='SUBMITTED' AND "submittedAt" IS NOT NULL AND "idempotencyKey" IS NOT NULL AND "requestHash" ~ '^[a-f0-9]{64}$' AND (length(btrim(text))>0 OR "storageKey" IS NOT NULL))) AND
  (("storageKey" IS NULL AND "originalFileName" IS NULL AND "mimeType" IS NULL AND "fileBytes" IS NULL AND "fileSha256" IS NULL)
   OR ("storageKey" IS NOT NULL AND "originalFileName" IS NOT NULL AND "mimeType" IS NOT NULL AND "fileBytes" BETWEEN 1 AND 20971520 AND "fileSha256" ~ '^[a-f0-9]{64}$')))
);
CREATE UNIQUE INDEX "class_assignment_submissions_activityId_enrollmentId_key" ON class_assignment_submissions("activityId","enrollmentId");
CREATE INDEX "class_assignment_submissions_classOfferingId_activityId_state_idx" ON class_assignment_submissions("classOfferingId","activityId",state);

CREATE FUNCTION w03b_submission_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE a uuid;
BEGIN
 PERFORM pg_advisory_xact_lock(842030);
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'W03B_RETAIN_SUBMISSION' USING ERRCODE='23514'; END IF;
 a:=w03_actor();
 IF NOT EXISTS(SELECT 1 FROM enrollments e JOIN users u ON u.id=e."learnerId"
  JOIN class_activity_revisions r ON r.id=NEW."revisionId"
  JOIN class_activities ca ON ca.id=r."activityId" JOIN class_sections s ON s.id=ca."sectionId"
  WHERE e.id=NEW."enrollmentId" AND e.status='ACTIVE' AND u.id=a AND u.id=NEW."learnerId" AND u.status='ACTIVE' AND u.role='STUDENT'
  AND r.type::text='ASSIGNMENT' AND ca.id=NEW."activityId" AND r."classOfferingId"=e."classOfferingId" AND e."classOfferingId"=NEW."classOfferingId"
  AND s."publishedRevisionId" IS NOT NULL AND ca.state='PUBLISHED' AND ca."publishedRevisionId"=r.id)
 THEN RAISE EXCEPTION 'W03B_SUBMISSION_SCOPE_DENIED' USING ERRCODE='42501';END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.state<>'DRAFT' OR NEW."lockVersion"<>1 THEN RAISE EXCEPTION 'W03B_SAVE_DRAFT_FIRST' USING ERRCODE='23514';END IF;
  NEW."createdAt":=clock_timestamp();
 ELSE
  IF OLD.state='SUBMITTED' OR NEW.id<>OLD.id OR NEW."activityId"<>OLD."activityId" OR NEW."enrollmentId"<>OLD."enrollmentId" OR NEW."learnerId"<>OLD."learnerId" OR NEW."classOfferingId"<>OLD."classOfferingId" OR NEW."createdAt"<>OLD."createdAt" OR NEW."lockVersion"<>OLD."lockVersion"+1
  THEN RAISE EXCEPTION 'W03B_IMMUTABLE_OR_CAS' USING ERRCODE='23514';END IF;
  IF NEW.state='SUBMITTED' THEN
   IF (NEW."revisionId",NEW.text,NEW."storageKey",NEW."fileSha256",NEW."fileBytes",NEW."mimeType",NEW."originalFileName") IS DISTINCT FROM (OLD."revisionId",OLD.text,OLD."storageKey",OLD."fileSha256",OLD."fileBytes",OLD."mimeType",OLD."originalFileName") THEN RAISE EXCEPTION 'W03B_SUBMIT_SAVED_DRAFT' USING ERRCODE='23514';END IF;
   NEW."submittedAt":=clock_timestamp();
  END IF;
 END IF;
 NEW."updatedAt":=clock_timestamp();RETURN NEW;
END $$;
CREATE TRIGGER w03b_submission_guard BEFORE INSERT OR UPDATE OR DELETE ON class_assignment_submissions FOR EACH ROW EXECUTE FUNCTION w03b_submission_guard();
CREATE FUNCTION w03b_no_manual_completion() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.status='COMPLETED' AND EXISTS(SELECT 1 FROM class_activity_revisions WHERE id=NEW."revisionId" AND type::text='ASSIGNMENT') THEN
  RAISE EXCEPTION 'W03B_SUBMISSION_IS_NOT_LESSON_COMPLETION' USING ERRCODE='23514';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER w03b_no_manual_completion BEFORE INSERT OR UPDATE ON class_activity_progress FOR EACH ROW EXECUTE FUNCTION w03b_no_manual_completion();
