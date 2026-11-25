-- W03B-B D1-D6. Reuse Rubric/RubricCriterion/RubricCriterionScore; ONE new grade-version table.
ALTER TABLE rubrics ADD COLUMN "assignmentActivityId" UUID REFERENCES class_activities(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 ADD COLUMN "assignmentVersion" INTEGER, ADD COLUMN "assignmentState" VARCHAR(24),
 ADD COLUMN "authoredById" UUID REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 ADD COLUMN "makerIds" UUID[] NOT NULL DEFAULT '{}',
 ADD COLUMN "approvedById" UUID REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 ADD COLUMN "approvedAt" TIMESTAMPTZ(3), ADD COLUMN "lockVersion" INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX "rubrics_assignmentActivityId_assignmentVersion_key" ON rubrics("assignmentActivityId","assignmentVersion");
ALTER TABLE rubrics ADD CONSTRAINT assignment_rubric_shape CHECK (
 ("assignmentActivityId" IS NULL AND "assignmentVersion" IS NULL AND "assignmentState" IS NULL AND "authoredById" IS NULL AND "approvedById" IS NULL AND "approvedAt" IS NULL AND cardinality("makerIds")=0 AND "lockVersion"=0)
 OR ("assignmentActivityId" IS NOT NULL AND "assignmentVersion" IS NOT NULL AND "assignmentState" IS NOT NULL AND "assignmentVersion">0 AND "authoredById" IS NOT NULL AND NOT "isActive" AND "lockVersion">=0 AND length(btrim(name))>0 AND
 (("assignmentState"='DRAFT' AND "approvedById" IS NULL AND "approvedAt" IS NULL) OR ("assignmentState"='PUBLISHED' AND "approvedById" IS NOT NULL AND "approvedAt" IS NOT NULL))));

CREATE TABLE assignment_grades (
 id UUID PRIMARY KEY, "submissionId" UUID NOT NULL REFERENCES class_assignment_submissions(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 "rubricId" UUID NOT NULL REFERENCES rubrics(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 number INTEGER NOT NULL, state VARCHAR(24) NOT NULL DEFAULT 'DRAFT', "lockVersion" INTEGER NOT NULL DEFAULT 0,
 "createdById" UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 "gradedById" UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 "makerIds" UUID[] NOT NULL DEFAULT '{}', reason VARCHAR(1000) NOT NULL DEFAULT '', feedback TEXT NOT NULL DEFAULT '',
 "confirmedAt" TIMESTAMPTZ(3), "publishedById" UUID REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE, "publishedAt" TIMESTAMPTZ(3),
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMPTZ(3) NOT NULL,
 CONSTRAINT assignment_grade_shape CHECK(number>0 AND "lockVersion">=0 AND (number=1 OR length(btrim(reason))>0) AND
 ((state='DRAFT' AND "confirmedAt" IS NULL AND "publishedById" IS NULL AND "publishedAt" IS NULL) OR
  (state='REVIEWED_FINAL' AND "confirmedAt" IS NOT NULL AND "publishedById" IS NULL AND "publishedAt" IS NULL) OR
  (state='PUBLISHED' AND "confirmedAt" IS NOT NULL AND "publishedById" IS NOT NULL AND "publishedAt">="confirmedAt")))
);
CREATE UNIQUE INDEX "assignment_grades_submissionId_number_key" ON assignment_grades("submissionId",number);
CREATE INDEX "assignment_grades_state_submissionId_idx" ON assignment_grades(state,"submissionId");
ALTER TABLE rubric_criterion_scores ALTER COLUMN "answerEvaluationId" DROP NOT NULL;
ALTER TABLE rubric_criterion_scores ADD COLUMN "assignmentGradeId" UUID REFERENCES assignment_grades(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE rubric_criterion_scores ADD CONSTRAINT criterion_score_owner CHECK (("answerEvaluationId" IS NOT NULL)::int+("assignmentGradeId" IS NOT NULL)::int=1);
CREATE UNIQUE INDEX "rubric_criterion_scores_assignmentGradeId_rubricCriterionId_key" ON rubric_criterion_scores("assignmentGradeId","rubricCriterionId");

-- Distinct delegated class capabilities; no inherent checker privilege and no legacy scope broadening.
ALTER TABLE permission_grants DROP CONSTRAINT grant_scope;
ALTER TABLE permission_grants ADD CONSTRAINT grant_scope CHECK (
 ("scopeType"='GLOBAL' AND "scopeId" IS NULL AND capability NOT LIKE 'academic.%') OR
 ("scopeType"='CLASS' AND "scopeId" IS NOT NULL AND capability IN ('class.read','academic.schedule.approve','academic.rubric.approve','academic.grade.publish')) OR
 ("scopeType"='COURSE' AND "scopeId" IS NOT NULL AND capability='academic.program.approve'));
CREATE UNIQUE INDEX w03bb_audit_request_once ON domain_audit_events("actorId",action,"objectType",split_part(reason,':',1)) WHERE "objectType" LIKE 'W03BB_%';

CREATE FUNCTION w03bb_checker(c UUID, cap TEXT) RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE a UUID;
BEGIN
 PERFORM pg_advisory_xact_lock(842030); a:=w03_actor();
 IF NOT v2_academic_approver(a,cap,'CLASS',c::text) THEN RAISE EXCEPTION 'W03BB_CHECKER_SCOPE_DENIED' USING ERRCODE='42501';END IF;
 RETURN a;
END $$;
CREATE FUNCTION w03bb_submission_class(sid UUID) RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE c UUID;
BEGIN
 SELECT s."classOfferingId" INTO c FROM class_assignment_submissions s JOIN enrollments e ON e.id=s."enrollmentId"
 JOIN users u ON u.id=s."learnerId" JOIN class_activity_revisions r ON r.id=s."revisionId"
 WHERE s.id=sid AND s.state='SUBMITTED' AND e.status='ACTIVE' AND u.status='ACTIVE' AND u.role='STUDENT'
 AND e."learnerId"=s."learnerId" AND e."classOfferingId"=s."classOfferingId" AND r."activityId"=s."activityId" AND r."classOfferingId"=s."classOfferingId" AND r.type::text='ASSIGNMENT';
 IF c IS NULL THEN RAISE EXCEPTION 'W03BB_SUBMISSION_SCOPE_DENIED' USING ERRCODE='42501';END IF;RETURN c;
END $$;
CREATE FUNCTION w03bb_rubric_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c UUID; a UUID; last_num INTEGER; last_state TEXT;
BEGIN
 IF TG_OP='DELETE' THEN IF OLD."assignmentActivityId" IS NOT NULL THEN RAISE EXCEPTION 'W03BB_RETAIN_RUBRIC' USING ERRCODE='23514';END IF;RETURN OLD;END IF;
 IF TG_OP='UPDATE' AND OLD."assignmentActivityId" IS DISTINCT FROM NEW."assignmentActivityId" THEN RAISE EXCEPTION 'W03BB_RUBRIC_OWNER_IMMUTABLE' USING ERRCODE='23514';END IF;
 IF NEW."assignmentActivityId" IS NULL THEN RETURN NEW;END IF;
 PERFORM pg_advisory_xact_lock(842030);
 SELECT s."classOfferingId" INTO c FROM class_activities a JOIN class_sections s ON s.id=a."sectionId" WHERE a.id=NEW."assignmentActivityId" AND a.type::text='ASSIGNMENT';
 IF c IS NULL THEN RAISE EXCEPTION 'W03BB_ASSIGNMENT_REQUIRED' USING ERRCODE='23514';END IF;
 IF TG_OP='INSERT' THEN
  a:=w03_teacher(c);SELECT "assignmentVersion","assignmentState" INTO last_num,last_state FROM rubrics WHERE "assignmentActivityId"=NEW."assignmentActivityId" ORDER BY "assignmentVersion" DESC LIMIT 1;
  IF NEW."assignmentState"<>'DRAFT' OR NEW."lockVersion"<>0 OR NEW."authoredById"<>a OR NEW."assignmentVersion"<>coalesce(last_num,0)+1 OR (last_num IS NOT NULL AND last_state<>'PUBLISHED') THEN RAISE EXCEPTION 'W03BB_RUBRIC_START_OR_VERSION' USING ERRCODE='23514';END IF;
  NEW."makerIds":=ARRAY[a];
 ELSE
  IF OLD."assignmentState"='PUBLISHED' OR NEW.id<>OLD.id OR NEW."assignmentVersion"<>OLD."assignmentVersion" OR NEW."authoredById"<>OLD."authoredById" OR NEW."createdAt"<>OLD."createdAt" OR NEW."lockVersion"<>OLD."lockVersion"+1 THEN RAISE EXCEPTION 'W03BB_IMMUTABLE_RUBRIC_OR_CAS' USING ERRCODE='23514';END IF;
  IF NEW."assignmentState"='PUBLISHED' THEN
   a:=w03bb_checker(c,'academic.rubric.approve');
   IF a=ANY(OLD."makerIds") OR NEW."approvedById"<>a THEN RAISE EXCEPTION 'W03BB_INDEPENDENT_CHECKER_REQUIRED' USING ERRCODE='42501';END IF;
   IF (to_jsonb(NEW)-ARRAY['assignmentState','approvedById','approvedAt','lockVersion','updatedAt']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['assignmentState','approvedById','approvedAt','lockVersion','updatedAt']) THEN RAISE EXCEPTION 'W03BB_RUBRIC_SNAPSHOT_MISMATCH' USING ERRCODE='23514';END IF;
   IF NOT EXISTS(SELECT 1 FROM rubric_criteria WHERE "rubricId"=OLD.id) OR (SELECT count(*) FROM rubric_criteria WHERE "rubricId"=OLD.id)>50 THEN RAISE EXCEPTION 'W03BB_RUBRIC_CRITERIA_REQUIRED' USING ERRCODE='23514';END IF;
   NEW."approvedAt":=clock_timestamp();
  ELSIF NEW."assignmentState"='DRAFT' THEN
   a:=w03_teacher(c);NEW."makerIds":=ARRAY(SELECT DISTINCT unnest(OLD."makerIds"||a));
  ELSE RAISE EXCEPTION 'W03BB_RUBRIC_TRANSITION' USING ERRCODE='23514';END IF;
 END IF;
 NEW."updatedAt":=timezone('UTC',clock_timestamp());RETURN NEW;
END $$;
CREATE TRIGGER w03bb_rubric_guard BEFORE INSERT OR UPDATE OR DELETE ON rubrics FOR EACH ROW EXECUTE FUNCTION w03bb_rubric_guard();

CREATE FUNCTION w03bb_criterion_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r rubrics; old_r rubrics; c UUID; item rubric_criteria;
BEGIN
 IF TG_OP='DELETE' THEN item:=OLD;ELSE item:=NEW;END IF;
 SELECT * INTO r FROM rubrics WHERE id=item."rubricId";
 IF TG_OP='UPDATE' AND NEW."rubricId"<>OLD."rubricId" THEN
  SELECT * INTO old_r FROM rubrics WHERE id=OLD."rubricId";
  IF r."assignmentActivityId" IS NOT NULL OR old_r."assignmentActivityId" IS NOT NULL THEN RAISE EXCEPTION 'W03BB_CRITERION_OWNER' USING ERRCODE='23514';END IF;
 END IF;
 IF r."assignmentActivityId" IS NULL THEN RETURN item;END IF;
 SELECT s."classOfferingId" INTO c FROM class_activities a JOIN class_sections s ON s.id=a."sectionId" WHERE a.id=r."assignmentActivityId";
 PERFORM w03_teacher(c);
 IF r."assignmentState"<>'DRAFT' THEN RAISE EXCEPTION 'W03BB_IMMUTABLE_RUBRIC_CRITERION' USING ERRCODE='23514';END IF;
 IF TG_OP<>'DELETE' AND (NEW."maxScore"<=0 OR NEW.weight<>1 OR length(btrim(NEW.name))=0 OR length(btrim(coalesce(NEW.description,'')))=0 OR NEW."orderIndex"<0) THEN RAISE EXCEPTION 'W03BB_CRITERION_SHAPE' USING ERRCODE='23514';END IF;
 RETURN item;
END $$;
CREATE TRIGGER w03bb_criterion_guard BEFORE INSERT OR UPDATE OR DELETE ON rubric_criteria FOR EACH ROW EXECUTE FUNCTION w03bb_criterion_guard();

CREATE FUNCTION w03bb_grade_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c UUID; a UUID; s class_assignment_submissions; r rubrics; last_num INTEGER; last_state TEXT;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'W03BB_RETAIN_GRADE_HISTORY' USING ERRCODE='23514';END IF;
 PERFORM pg_advisory_xact_lock(842030);c:=w03bb_submission_class(NEW."submissionId");
 SELECT * INTO s FROM class_assignment_submissions WHERE id=NEW."submissionId";
 SELECT * INTO r FROM rubrics WHERE id=NEW."rubricId";
 IF r."assignmentActivityId" IS DISTINCT FROM s."activityId" OR r."assignmentState" IS DISTINCT FROM 'PUBLISHED' THEN RAISE EXCEPTION 'W03BB_APPROVED_RUBRIC_REQUIRED' USING ERRCODE='23514';END IF;
 IF TG_OP='INSERT' THEN
  a:=w03_teacher(c);SELECT number,state INTO last_num,last_state FROM assignment_grades WHERE "submissionId"=NEW."submissionId" ORDER BY number DESC LIMIT 1;
  IF NEW.state<>'DRAFT' OR NEW."lockVersion"<>0 OR NEW."createdById"<>a OR NEW."gradedById"<>a OR NEW.number<>coalesce(last_num,0)+1 OR (last_num IS NOT NULL AND last_state<>'PUBLISHED') THEN RAISE EXCEPTION 'W03BB_GRADE_START_OR_VERSION' USING ERRCODE='23514';END IF;
  NEW."makerIds":=ARRAY[a];NEW."createdAt":=clock_timestamp();
 ELSE
  IF OLD.state='PUBLISHED' OR NEW.id<>OLD.id OR NEW."submissionId"<>OLD."submissionId" OR NEW."rubricId"<>OLD."rubricId" OR NEW.number<>OLD.number OR NEW."createdById"<>OLD."createdById" OR NEW."createdAt"<>OLD."createdAt" OR NEW."lockVersion"<>OLD."lockVersion"+1 THEN RAISE EXCEPTION 'W03BB_IMMUTABLE_GRADE_OR_CAS' USING ERRCODE='23514';END IF;
  IF OLD.state='DRAFT' AND NEW.state IN ('DRAFT','REVIEWED_FINAL') THEN
   a:=w03_teacher(c);IF NEW."gradedById"<>a THEN RAISE EXCEPTION 'W03BB_GRADER_MISMATCH' USING ERRCODE='42501';END IF;
   NEW."makerIds":=ARRAY(SELECT DISTINCT unnest(OLD."makerIds"||a));
   IF NEW.state='REVIEWED_FINAL' THEN
    IF (to_jsonb(NEW)-ARRAY['state','gradedById','makerIds','confirmedAt','lockVersion','updatedAt']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','gradedById','makerIds','confirmedAt','lockVersion','updatedAt']) THEN RAISE EXCEPTION 'W03BB_FINAL_SAVED_GRADE_ONLY' USING ERRCODE='23514';END IF;
    IF EXISTS(SELECT 1 FROM rubric_criteria rc WHERE rc."rubricId"=r.id AND NOT EXISTS(SELECT 1 FROM rubric_criterion_scores cs WHERE cs."assignmentGradeId"=OLD.id AND cs."rubricCriterionId"=rc.id)) THEN RAISE EXCEPTION 'W03BB_INCOMPLETE_GRADE' USING ERRCODE='23514';END IF;
    NEW."confirmedAt":=clock_timestamp();
   END IF;
  ELSIF OLD.state='REVIEWED_FINAL' AND NEW.state='PUBLISHED' THEN
   a:=w03bb_checker(c,'academic.grade.publish');
   IF a=ANY(OLD."makerIds") OR a=OLD."gradedById" OR NEW."publishedById"<>a THEN RAISE EXCEPTION 'W03BB_INDEPENDENT_CHECKER_REQUIRED' USING ERRCODE='42501';END IF;
   IF (to_jsonb(NEW)-ARRAY['state','publishedById','publishedAt','lockVersion','updatedAt']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','publishedById','publishedAt','lockVersion','updatedAt']) THEN RAISE EXCEPTION 'W03BB_PUBLISH_SNAPSHOT_MISMATCH' USING ERRCODE='23514';END IF;
   NEW."publishedAt":=clock_timestamp();
  ELSE RAISE EXCEPTION 'W03BB_GRADE_TRANSITION' USING ERRCODE='23514';END IF;
 END IF;
 NEW."updatedAt":=clock_timestamp();RETURN NEW;
END $$;
CREATE TRIGGER w03bb_grade_guard BEFORE INSERT OR UPDATE OR DELETE ON assignment_grades FOR EACH ROW EXECUTE FUNCTION w03bb_grade_guard();

CREATE FUNCTION w03bb_score_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE item rubric_criterion_scores; g assignment_grades; rc rubric_criteria; r rubrics;
BEGIN
 IF TG_OP='DELETE' THEN item:=OLD;ELSE item:=NEW;END IF;
 SELECT * INTO rc FROM rubric_criteria WHERE id=item."rubricCriterionId";SELECT * INTO r FROM rubrics WHERE id=rc."rubricId";
 IF TG_OP='UPDATE' AND (NEW."assignmentGradeId" IS NOT NULL OR OLD."assignmentGradeId" IS NOT NULL) AND (NEW."assignmentGradeId" IS DISTINCT FROM OLD."assignmentGradeId" OR NEW."answerEvaluationId" IS DISTINCT FROM OLD."answerEvaluationId" OR NEW."rubricCriterionId"<>OLD."rubricCriterionId") THEN RAISE EXCEPTION 'W03BB_SCORE_OWNER_IMMUTABLE' USING ERRCODE='23514';END IF;
 IF item."assignmentGradeId" IS NULL THEN
  IF r."assignmentActivityId" IS NOT NULL THEN RAISE EXCEPTION 'W03BB_NO_LEGACY_CLASS_RUBRIC_MIX' USING ERRCODE='23514';END IF;RETURN item;
 END IF;
 SELECT * INTO g FROM assignment_grades WHERE id=item."assignmentGradeId";PERFORM w03_teacher(w03bb_submission_class(g."submissionId"));
 IF g.state<>'DRAFT' OR rc."rubricId"<>g."rubricId" OR r."assignmentState"<>'PUBLISHED' THEN RAISE EXCEPTION 'W03BB_IMMUTABLE_OR_FOREIGN_SCORE' USING ERRCODE='23514';END IF;
 IF TG_OP<>'DELETE' AND (item.score<0 OR item.score>rc."maxScore") THEN RAISE EXCEPTION 'W03BB_SCORE_OUT_OF_RANGE' USING ERRCODE='23514';END IF;
 RETURN item;
END $$;
CREATE TRIGGER w03bb_score_guard BEFORE INSERT OR UPDATE OR DELETE ON rubric_criterion_scores FOR EACH ROW EXECUTE FUNCTION w03bb_score_guard();
