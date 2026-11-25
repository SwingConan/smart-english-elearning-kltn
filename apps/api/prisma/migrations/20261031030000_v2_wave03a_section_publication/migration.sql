-- Additive CF01. Never infer a publication from current draft metadata.
CREATE TABLE class_section_revisions (
 id UUID NOT NULL PRIMARY KEY,
 "sectionId" UUID NOT NULL REFERENCES class_sections(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 number INTEGER NOT NULL CHECK(number>0),
 title VARCHAR(250) NOT NULL CHECK(length(btrim(title))>0),
 introduction TEXT NOT NULL,
 "sourceLockVersion" INTEGER NOT NULL CHECK("sourceLockVersion">=0),
 "publishedById" UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 "publishedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "class_section_revisions_sectionId_number_key" ON class_section_revisions("sectionId",number);
ALTER TABLE class_sections ADD COLUMN "publishedRevisionId" UUID, ADD COLUMN "revisionNumber" INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX "class_sections_publishedRevisionId_key" ON class_sections("publishedRevisionId");
ALTER TABLE class_sections ADD CONSTRAINT "class_sections_publishedRevisionId_fkey" FOREIGN KEY("publishedRevisionId") REFERENCES class_section_revisions(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE class_sections ADD CONSTRAINT section_publication_shape CHECK (("publishedRevisionId" IS NULL AND "revisionNumber"=0) OR ("publishedRevisionId" IS NOT NULL AND "revisionNumber">0));

CREATE FUNCTION w03_section_revision_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE s class_sections%ROWTYPE; a uuid;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'W03_IMMUTABLE_SECTION_PUBLICATION' USING ERRCODE='23514';END IF;
 SELECT * INTO s FROM class_sections WHERE id=NEW."sectionId";
 a:=w03_teacher(s."classOfferingId");
 IF s.id IS NULL OR NEW."publishedById"<>a OR NEW.number<>s."revisionNumber"+1 OR NEW."sourceLockVersion"<>s."lockVersion" OR (NEW.title,NEW.introduction) IS DISTINCT FROM (s.title,s.introduction) THEN
  RAISE EXCEPTION 'W03_SECTION_SNAPSHOT_MISMATCH' USING ERRCODE='23514';
 END IF;
 NEW."publishedAt":=clock_timestamp();RETURN NEW;
END $$;
CREATE TRIGGER w03_section_revision_guard BEFORE INSERT OR UPDATE OR DELETE ON class_section_revisions FOR EACH ROW EXECUTE FUNCTION w03_section_revision_guard();

CREATE FUNCTION w03_section_pointer_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r class_section_revisions%ROWTYPE;
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW."publishedRevisionId" IS NOT NULL OR NEW."revisionNumber"<>0 THEN RAISE EXCEPTION 'W03_NEW_SECTION_MUST_BE_DRAFT' USING ERRCODE='23514';END IF;
 ELSE
  IF (NEW."publishedRevisionId",NEW."revisionNumber") IS DISTINCT FROM (OLD."publishedRevisionId",OLD."revisionNumber") THEN
   SELECT * INTO r FROM class_section_revisions WHERE id=NEW."publishedRevisionId" AND "sectionId"=OLD.id;
   IF r.id IS NULL OR NEW."revisionNumber"<>OLD."revisionNumber"+1 OR r.number<>NEW."revisionNumber" OR r."sourceLockVersion"<>OLD."lockVersion" OR NEW."lockVersion"<>OLD."lockVersion"+1 OR r."publishedById"<>NEW."updatedById" OR (r.title,r.introduction) IS DISTINCT FROM (NEW.title,NEW.introduction) THEN
    RAISE EXCEPTION 'W03_SECTION_POINTER_MISMATCH' USING ERRCODE='23514';
   END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER w03_section_pointer_guard BEFORE INSERT OR UPDATE ON class_sections FOR EACH ROW EXECUTE FUNCTION w03_section_pointer_guard();

CREATE FUNCTION w03_progress_section_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM class_activity_revisions r JOIN class_activities a ON a.id=r."activityId" JOIN class_sections s ON s.id=a."sectionId" WHERE r.id=NEW."revisionId" AND s."publishedRevisionId" IS NOT NULL) THEN
  RAISE EXCEPTION 'W03_SECTION_NOT_PUBLISHED' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER w03_progress_section_guard BEFORE INSERT OR UPDATE ON class_activity_progress FOR EACH ROW EXECUTE FUNCTION w03_progress_section_guard();
