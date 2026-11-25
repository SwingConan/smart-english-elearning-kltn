-- W03A additive only. Four justified class-local snapshot/progress tables; no old row backfill.

CREATE TYPE "ClassActivityType" AS ENUM ('LESSON','RESOURCE');

CREATE TYPE "ClassActivityState" AS ENUM ('DRAFT','PUBLISHED','HIDDEN');

CREATE TABLE "class_sections" (
 "id" UUID NOT NULL PRIMARY KEY,
 "classOfferingId" UUID NOT NULL,
 "title" VARCHAR(250) NOT NULL,
 "introduction" TEXT NOT NULL DEFAULT '',
 "orderIndex" INTEGER NOT NULL,
 "lockVersion" INTEGER NOT NULL DEFAULT 0,
 "createdById" UUID NOT NULL,
 "updatedById" UUID NOT NULL,
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMPTZ(3) NOT NULL
);

CREATE TABLE "class_activities" (
 "id" UUID NOT NULL PRIMARY KEY,
 "sectionId" UUID NOT NULL,
 "type" "ClassActivityType" NOT NULL,
 "title" VARCHAR(250) NOT NULL,
 "introduction" TEXT NOT NULL DEFAULT '',
 "contentMarkdown" TEXT NOT NULL DEFAULT '',
 "resourceUrl" TEXT,
 "storageKey" TEXT,
 "originalFileName" TEXT,
 "mimeType" TEXT,
 "fileBytes" INTEGER,
 "fileSha256" VARCHAR(64),
 "sourceLessonId" UUID,
 "sourceResourceId" UUID,
 "sourceUpdatedAt" TIMESTAMPTZ(3),
 "availableFrom" TIMESTAMPTZ(3),
 "availableUntil" TIMESTAMPTZ(3),
 "state" "ClassActivityState" NOT NULL DEFAULT 'DRAFT',
 "orderIndex" INTEGER NOT NULL,
 "lockVersion" INTEGER NOT NULL DEFAULT 0,
 "revisionNumber" INTEGER NOT NULL DEFAULT 0,
 "publishedRevisionId" UUID,
 "createdById" UUID NOT NULL,
 "updatedById" UUID NOT NULL,
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMPTZ(3) NOT NULL
);

CREATE TABLE "class_activity_revisions" (
 "id" UUID NOT NULL PRIMARY KEY,
 "activityId" UUID NOT NULL,
 "classOfferingId" UUID NOT NULL,
 "number" INTEGER NOT NULL,
 "type" "ClassActivityType" NOT NULL,
 "title" VARCHAR(250) NOT NULL,
 "introduction" TEXT NOT NULL,
 "contentMarkdown" TEXT NOT NULL,
 "resourceUrl" TEXT,
 "storageKey" TEXT,
 "originalFileName" TEXT,
 "mimeType" TEXT,
 "fileBytes" INTEGER,
 "fileSha256" VARCHAR(64),
 "sourceLessonId" UUID,
 "sourceResourceId" UUID,
 "sourceUpdatedAt" TIMESTAMPTZ(3),
 "availableFrom" TIMESTAMPTZ(3),
 "availableUntil" TIMESTAMPTZ(3),
 "publishedById" UUID NOT NULL,
 "publishedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "class_activity_progress" (
 "id" UUID NOT NULL PRIMARY KEY,
 "enrollmentId" UUID NOT NULL,
 "revisionId" UUID NOT NULL,
 "status" "LessonProgressStatus" NOT NULL DEFAULT 'IN_PROGRESS',
 "openedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "completedAt" TIMESTAMPTZ(3)
);

ALTER TABLE "class_sections" ADD CONSTRAINT "class_sections_classOfferingId_fkey" FOREIGN KEY ("classOfferingId") REFERENCES "class_offerings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "class_sections" ADD CONSTRAINT "class_sections_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "class_sections" ADD CONSTRAINT "class_sections_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "class_activities" ADD CONSTRAINT "class_activities_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "class_sections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "class_activities" ADD CONSTRAINT "class_activities_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "class_activities" ADD CONSTRAINT "class_activities_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "class_activities" ADD CONSTRAINT "class_activities_sourceLessonId_fkey" FOREIGN KEY ("sourceLessonId") REFERENCES "lessons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "class_activities" ADD CONSTRAINT "class_activities_sourceResourceId_fkey" FOREIGN KEY ("sourceResourceId") REFERENCES "learning_resources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "class_activities" ADD CONSTRAINT "class_activities_publishedRevisionId_fkey" FOREIGN KEY ("publishedRevisionId") REFERENCES "class_activity_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "class_activity_revisions" ADD CONSTRAINT "class_activity_revisions_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "class_activities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "class_activity_revisions" ADD CONSTRAINT "class_activity_revisions_classOfferingId_fkey" FOREIGN KEY ("classOfferingId") REFERENCES "class_offerings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "class_activity_revisions" ADD CONSTRAINT "class_activity_revisions_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "class_activity_revisions" ADD CONSTRAINT "class_activity_revisions_sourceLessonId_fkey" FOREIGN KEY ("sourceLessonId") REFERENCES "lessons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "class_activity_revisions" ADD CONSTRAINT "class_activity_revisions_sourceResourceId_fkey" FOREIGN KEY ("sourceResourceId") REFERENCES "learning_resources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "class_activity_progress" ADD CONSTRAINT "class_activity_progress_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "enrollments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "class_activity_progress" ADD CONSTRAINT "class_activity_progress_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "class_activity_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "class_sections" ADD CONSTRAINT "class_section_order" UNIQUE ("classOfferingId", "orderIndex") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "class_activities" ADD CONSTRAINT "class_activity_order" UNIQUE ("sectionId", "orderIndex") DEFERRABLE INITIALLY IMMEDIATE;

CREATE UNIQUE INDEX "class_activities_publishedRevisionId_key" ON "class_activities"("publishedRevisionId");

CREATE UNIQUE INDEX "class_activity_revisions_activityId_number_key" ON "class_activity_revisions"("activityId", "number");

CREATE UNIQUE INDEX "class_activity_progress_enrollmentId_revisionId_key" ON "class_activity_progress"("enrollmentId", "revisionId");

CREATE INDEX "class_activity_revisions_classOfferingId_publishedAt_idx" ON "class_activity_revisions"("classOfferingId","publishedAt");

-- Scoped SQL authorization and immutable publication/progress safety. No legacy row rewrite.
ALTER TABLE class_sections ADD CONSTRAINT section_order_nonnegative CHECK ("orderIndex">=0 AND "lockVersion">=0 AND length(btrim(title))>0);
ALTER TABLE class_activities ADD CONSTRAINT activity_shape CHECK (
 "orderIndex">=0 AND "lockVersion">=0 AND "revisionNumber">=0 AND length(btrim(title))>0
 AND ("availableFrom" IS NULL OR "availableUntil" IS NULL OR "availableUntil">"availableFrom")
 AND NOT ("sourceLessonId" IS NOT NULL AND "sourceResourceId" IS NOT NULL)
 AND ("resourceUrl" IS NULL OR "storageKey" IS NULL)
 AND (type<>'LESSON' OR ("storageKey" IS NULL AND "resourceUrl" IS NULL AND "sourceResourceId" IS NULL))
 AND (type<>'RESOURCE' OR "sourceLessonId" IS NULL)
 AND (state<>'PUBLISHED' OR "publishedRevisionId" IS NOT NULL));
ALTER TABLE class_activity_revisions ADD CONSTRAINT revision_shape CHECK (
 number>0 AND length(btrim(title))>0
 AND ("availableFrom" IS NULL OR "availableUntil" IS NULL OR "availableUntil">"availableFrom")
 AND ((type='LESSON' AND length(btrim("contentMarkdown"))>0 AND "resourceUrl" IS NULL AND "storageKey" IS NULL)
   OR (type='RESOURCE' AND (("resourceUrl" IS NOT NULL)::int+("storageKey" IS NOT NULL)::int)=1)));
ALTER TABLE class_activity_progress ADD CONSTRAINT progress_truth CHECK (
 (status='IN_PROGRESS' AND "completedAt" IS NULL) OR (status='COMPLETED' AND "completedAt">="openedAt"));

CREATE FUNCTION w03_actor() RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE a uuid; actor_sid text;
BEGIN
 a:=nullif(current_setting('app.class_lms_actor',true),'')::uuid;
 actor_sid:=nullif(current_setting('app.class_lms_session',true),'');
 IF a IS NULL OR actor_sid IS NULL OR NOT EXISTS(SELECT 1 FROM user_sessions WHERE user_sessions.sid=actor_sid AND sess->>'userId'=a::text AND expire>clock_timestamp()) THEN
  RAISE EXCEPTION 'W03_AUTH_REQUIRED' USING ERRCODE='42501';
 END IF;
 RETURN a;
END $$;
CREATE FUNCTION w03_teacher(c uuid) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE a uuid;
BEGIN
 PERFORM pg_advisory_xact_lock(842030);
 a:=w03_actor();
 PERFORM 1 FROM class_offerings WHERE id=c FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM users WHERE id=a AND role='INSTRUCTOR' AND status='ACTIVE') OR NOT EXISTS(
  SELECT 1 FROM class_offerings co WHERE co.id=c AND (
   EXISTS(SELECT 1 FROM class_instructor_assignments ia WHERE ia."classOfferingId"=c AND ia."instructorId"=a AND ia.state IN ('PUBLISHED','SUPERSEDED') AND ia."effectiveFrom"<=clock_timestamp() AND ia."reservedUntil">clock_timestamp())
   OR (co."instructorId"=a AND NOT EXISTS(SELECT 1 FROM class_instructor_assignments ia WHERE ia."classOfferingId"=c))
  )) THEN RAISE EXCEPTION 'W03_TEACHER_SCOPE_DENIED' USING ERRCODE='42501';END IF;
 RETURN a;
END $$;
CREATE FUNCTION w03_content_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c uuid; a uuid; r class_activity_revisions%ROWTYPE; course uuid;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'W03_RETAIN_CONTENT_HISTORY' USING ERRCODE='23514';END IF;
 IF TG_TABLE_NAME='class_sections' THEN
  c:=NEW."classOfferingId";
  IF TG_OP='UPDATE' AND NEW."classOfferingId"<>OLD."classOfferingId" THEN RAISE EXCEPTION 'W03_IMMUTABLE_CLASS_OWNER' USING ERRCODE='23514';END IF;
 ELSE
  SELECT "classOfferingId" INTO c FROM class_sections WHERE id=NEW."sectionId";
  IF TG_OP='UPDATE' AND (NEW."sectionId"<>OLD."sectionId" OR NEW.type<>OLD.type) THEN RAISE EXCEPTION 'W03_IMMUTABLE_ACTIVITY_OWNER_TYPE' USING ERRCODE='23514';END IF;
 END IF;
 a:=w03_teacher(c);
 IF NEW."updatedById"<>a OR (TG_OP='INSERT' AND (NEW."createdById"<>a OR NEW."lockVersion"<>0)) THEN RAISE EXCEPTION 'W03_ACTOR_MISMATCH' USING ERRCODE='42501';END IF;
 IF TG_OP='UPDATE' THEN
  IF NEW.id<>OLD.id OR NEW."createdById"<>OLD."createdById" OR NEW."createdAt"<>OLD."createdAt" OR NEW."lockVersion"<>OLD."lockVersion"+1 THEN RAISE EXCEPTION 'W03_CAS_OR_HISTORY_MISMATCH' USING ERRCODE='23514';END IF;
 END IF;
 IF TG_TABLE_NAME='class_activities' THEN
  SELECT "courseId" INTO course FROM class_offerings WHERE id=c;
  IF NEW."sourceLessonId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM lessons l JOIN modules m ON m.id=l."moduleId" WHERE l.id=NEW."sourceLessonId" AND m."courseId"=course) THEN RAISE EXCEPTION 'W03_FOREIGN_LESSON' USING ERRCODE='42501';END IF;
  IF NEW."sourceResourceId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM learning_resources lr JOIN lessons l ON l.id=lr."lessonId" JOIN modules m ON m.id=l."moduleId" WHERE lr.id=NEW."sourceResourceId" AND m."courseId"=course) THEN RAISE EXCEPTION 'W03_FOREIGN_RESOURCE' USING ERRCODE='42501';END IF;
  IF NEW."publishedRevisionId" IS NOT NULL THEN
   SELECT * INTO r FROM class_activity_revisions WHERE id=NEW."publishedRevisionId" AND "activityId"=NEW.id AND "classOfferingId"=c;
   IF r.id IS NULL OR r.number<>NEW."revisionNumber" THEN RAISE EXCEPTION 'W03_FOREIGN_PUBLICATION' USING ERRCODE='23514';END IF;
  END IF;
  IF NEW.state='PUBLISHED' AND (NEW.title,NEW.introduction,NEW."contentMarkdown",NEW."resourceUrl",NEW."storageKey",NEW."availableFrom",NEW."availableUntil",NEW."sourceLessonId",NEW."sourceResourceId",NEW."sourceUpdatedAt") IS DISTINCT FROM (r.title,r.introduction,r."contentMarkdown",r."resourceUrl",r."storageKey",r."availableFrom",r."availableUntil",r."sourceLessonId",r."sourceResourceId",r."sourceUpdatedAt") THEN RAISE EXCEPTION 'W03_PUBLICATION_SNAPSHOT_MISMATCH' USING ERRCODE='23514';END IF;
 END IF;
 NEW."updatedAt":=clock_timestamp();
 RETURN NEW;
END $$;
CREATE TRIGGER w03_section_guard BEFORE INSERT OR UPDATE OR DELETE ON class_sections FOR EACH ROW EXECUTE FUNCTION w03_content_guard();
CREATE TRIGGER w03_activity_guard BEFORE INSERT OR UPDATE OR DELETE ON class_activities FOR EACH ROW EXECUTE FUNCTION w03_content_guard();

CREATE FUNCTION w03_revision_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE a uuid; item class_activities%ROWTYPE; c uuid;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'W03_IMMUTABLE_PUBLICATION' USING ERRCODE='23514';END IF;
 SELECT * INTO item FROM class_activities WHERE id=NEW."activityId";
 SELECT "classOfferingId" INTO c FROM class_sections WHERE id=item."sectionId";
 a:=w03_teacher(c);
 IF NEW."classOfferingId"<>c OR NEW."publishedById"<>a OR item.state<>'DRAFT' OR NEW.number<>item."revisionNumber"+1 OR NEW.type<>item.type OR
 (NEW.title,NEW.introduction,NEW."contentMarkdown",NEW."resourceUrl",NEW."storageKey",NEW."availableFrom",NEW."availableUntil",NEW."sourceLessonId",NEW."sourceResourceId",NEW."sourceUpdatedAt") IS DISTINCT FROM (item.title,item.introduction,item."contentMarkdown",item."resourceUrl",item."storageKey",item."availableFrom",item."availableUntil",item."sourceLessonId",item."sourceResourceId",item."sourceUpdatedAt") THEN RAISE EXCEPTION 'W03_REVISION_MISMATCH' USING ERRCODE='23514';END IF;
 NEW."publishedAt":=clock_timestamp();RETURN NEW;
END $$;
CREATE TRIGGER w03_revision_guard BEFORE INSERT OR UPDATE OR DELETE ON class_activity_revisions FOR EACH ROW EXECUTE FUNCTION w03_revision_guard();
CREATE FUNCTION w03_progress_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE a uuid;
BEGIN
 PERFORM pg_advisory_xact_lock(842030);a:=w03_actor();
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'W03_RETAIN_PROGRESS_HISTORY' USING ERRCODE='23514';END IF;
 IF NOT EXISTS(SELECT 1 FROM enrollments e JOIN users u ON u.id=e."learnerId" JOIN class_activity_revisions r ON r.id=NEW."revisionId" JOIN class_activities ca ON ca.id=r."activityId"
  WHERE e.id=NEW."enrollmentId" AND e.status='ACTIVE' AND u.id=a AND u.status='ACTIVE' AND u.role='STUDENT' AND e."classOfferingId"=r."classOfferingId"
  AND ca.state='PUBLISHED' AND ca."publishedRevisionId"=r.id AND (r."availableFrom" IS NULL OR r."availableFrom"<=clock_timestamp()) AND (r."availableUntil" IS NULL OR r."availableUntil">clock_timestamp())) THEN RAISE EXCEPTION 'W03_PROGRESS_SCOPE_DENIED' USING ERRCODE='42501';END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.status<>'IN_PROGRESS' THEN RAISE EXCEPTION 'W03_OPEN_BEFORE_COMPLETE' USING ERRCODE='23514';END IF;NEW."openedAt":=clock_timestamp();
 ELSE
  IF NEW.id<>OLD.id OR NEW."enrollmentId"<>OLD."enrollmentId" OR NEW."revisionId"<>OLD."revisionId" OR NEW."openedAt"<>OLD."openedAt" OR OLD.status='COMPLETED' OR NEW.status<>'COMPLETED' THEN RAISE EXCEPTION 'W03_IMMUTABLE_PROGRESS' USING ERRCODE='23514';END IF;
  NEW."completedAt":=clock_timestamp();
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER w03_progress_guard BEFORE INSERT OR UPDATE OR DELETE ON class_activity_progress FOR EACH ROW EXECUTE FUNCTION w03_progress_guard();
