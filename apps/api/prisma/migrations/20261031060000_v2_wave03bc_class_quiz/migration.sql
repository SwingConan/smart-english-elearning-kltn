-- W03B-C Q1-Q6: reuse existing assessment persistence, no new engine tables.
ALTER TYPE "ClassActivityType" ADD VALUE 'QUIZ';
ALTER TABLE tests ADD COLUMN "quizActivityId" UUID REFERENCES class_activities(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 ADD COLUMN "quizVersion" INTEGER, ADD COLUMN "quizState" VARCHAR(16),
 ADD COLUMN "quizAuthorId" UUID REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 ADD COLUMN "quizMakerIds" UUID[] NOT NULL DEFAULT '{}',
 ADD COLUMN "quizApprovedById" UUID REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 ADD COLUMN "quizApprovedAt" TIMESTAMPTZ(3), ADD COLUMN "quizSourceHash" VARCHAR(64), ADD COLUMN "quizLockVersion" INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX "tests_quizActivityId_quizVersion_key" ON tests("quizActivityId","quizVersion");
ALTER TABLE questions ADD COLUMN "quizSourceId" UUID REFERENCES tests(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE class_activity_revisions ADD COLUMN "quizTestId" UUID REFERENCES tests(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE test_attempts ADD COLUMN "quizRevisionId" UUID REFERENCES class_activity_revisions(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 ADD COLUMN "quizDeadline" TIMESTAMPTZ(3), ADD COLUMN "quizLockVersion" INTEGER NOT NULL DEFAULT 0,
 ADD COLUMN "quizMarked" UUID[] NOT NULL DEFAULT '{}', ADD COLUMN "quizReceipt" UUID,
 ADD COLUMN "quizFinalReason" VARCHAR(16), ADD COLUMN "quizPublishedById" UUID REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 ADD COLUMN "quizPublishedAt" TIMESTAMPTZ(3);
CREATE UNIQUE INDEX "test_attempts_quizReceipt_key" ON test_attempts("quizReceipt");
CREATE UNIQUE INDEX quiz_one_attempt_per_version ON test_attempts("enrollmentId","testId") WHERE "quizDeadline" IS NOT NULL;
CREATE INDEX quiz_due_attempts ON test_attempts("quizDeadline") WHERE "quizDeadline" IS NOT NULL AND status='IN_PROGRESS';
ALTER TABLE tests ADD CONSTRAINT quiz_source_shape CHECK ("quizActivityId" IS NULL OR
 ("quizVersion">0 AND "quizVersion" IS NOT NULL AND "quizAuthorId" IS NOT NULL AND "quizLockVersion">=0 AND purpose='IN_CLASS' AND status='DRAFT'
 AND "courseId" IS NULL AND "lessonId" IS NULL AND "placementMode" IS NULL AND "maxAttempts"=1 AND NOT "showResultAfterSubmit"
 AND "timeLimitMinutes" BETWEEN 5 AND 120 AND "timeLimitMinutes" IS NOT NULL
 AND (("quizState"='DRAFT' AND "quizApprovedById" IS NULL AND "quizApprovedAt" IS NULL AND "quizSourceHash" IS NULL)
 OR ("quizState"='APPROVED' AND "quizApprovedById" IS NOT NULL AND "quizApprovedAt" IS NOT NULL AND "quizSourceHash" IS NOT NULL AND "quizSourceHash" ~ '^[a-f0-9]{64}$')) AND "quizState" IS NOT NULL));
ALTER TABLE test_attempts ADD CONSTRAINT quiz_attempt_shape CHECK ("quizDeadline" IS NULL OR
 ("quizRevisionId" IS NOT NULL AND "enrollmentId" IS NOT NULL AND "classAssessmentId" IS NOT NULL AND "attemptNumber"=1 AND "quizLockVersion">=0
 AND ((status='IN_PROGRESS' AND score IS NULL AND "maxScore" IS NULL AND "submittedAt" IS NULL AND "quizReceipt" IS NULL AND "quizFinalReason" IS NULL AND "quizPublishedAt" IS NULL AND "quizPublishedById" IS NULL)
 OR (status='SUBMITTED' AND score IS NOT NULL AND "maxScore">0 AND score BETWEEN 0 AND "maxScore" AND "submittedAt" IS NOT NULL AND "quizReceipt" IS NOT NULL AND "quizFinalReason" IN ('SUBMITTED','EXPIRED')))
 AND (("quizPublishedAt" IS NULL AND "quizPublishedById" IS NULL) OR ("quizPublishedAt" IS NOT NULL AND "quizPublishedById" IS NOT NULL AND status='SUBMITTED'))));
ALTER TABLE class_activity_revisions DROP CONSTRAINT revision_shape;
ALTER TABLE class_activity_revisions ADD CONSTRAINT revision_shape CHECK (
 number>0 AND length(btrim(title))>0 AND ("availableFrom" IS NULL OR "availableUntil" IS NULL OR "availableUntil">"availableFrom")
 AND ((type::text='LESSON' AND length(btrim("contentMarkdown"))>0 AND "resourceUrl" IS NULL AND "storageKey" IS NULL)
 OR (type::text='RESOURCE' AND (("resourceUrl" IS NOT NULL)::int+("storageKey" IS NOT NULL)::int)=1)
 OR (type::text='ASSIGNMENT' AND length(btrim("contentMarkdown"))>0 AND "resourceUrl" IS NULL AND "storageKey" IS NULL)
 OR (type::text='QUIZ' AND "quizTestId" IS NOT NULL AND "resourceUrl" IS NULL AND "storageKey" IS NULL)));
ALTER TABLE class_activities ADD CONSTRAINT quiz_activity_text_only CHECK(type::text<>'QUIZ' OR
 ("resourceUrl" IS NULL AND "storageKey" IS NULL AND "sourceLessonId" IS NULL AND "sourceResourceId" IS NULL AND "availableFrom" IS NULL AND "availableUntil" IS NULL));
ALTER TABLE permission_grants DROP CONSTRAINT grant_scope;
ALTER TABLE permission_grants ADD CONSTRAINT grant_scope CHECK (
 ("scopeType"='GLOBAL' AND "scopeId" IS NULL AND capability NOT LIKE 'academic.%') OR
 ("scopeType"='CLASS' AND "scopeId" IS NOT NULL AND capability IN ('class.read','academic.schedule.approve','academic.rubric.approve','academic.grade.publish','academic.quiz.approve','academic.quiz.grade.publish')) OR
 ("scopeType"='COURSE' AND "scopeId" IS NOT NULL AND capability='academic.program.approve'));
CREATE UNIQUE INDEX w03bc_audit_request_once ON domain_audit_events("actorId",action,"objectType",split_part(reason,':',1)) WHERE "objectType" LIKE 'W03BC_%';

CREATE FUNCTION w03bc_class(tid UUID) RETURNS UUID LANGUAGE sql STABLE AS $$
 SELECT s."classOfferingId" FROM tests t JOIN class_activities a ON a.id=t."quizActivityId" JOIN class_sections s ON s.id=a."sectionId" WHERE t.id=tid AND a.type::text='QUIZ'
$$;
-- PostgreSQL owns the SHA-256 snapshot, including ordered keys and explicit UTC config.
CREATE FUNCTION w03bc_source_hash(tid UUID) RETURNS TEXT LANGUAGE sql STABLE AS $$
 SELECT encode(sha256(convert_to(jsonb_build_object('id',t.id,'activityId',t."quizActivityId",'version',t."quizVersion",'title',t.title,'duration',t."timeLimitMinutes",
 'config',(SELECT jsonb_build_object('classId',c."classOfferingId",'openAt',extract(epoch from c."openAt"),'closeAt',extract(epoch from c."closeAt")) FROM class_assessments c WHERE c."testId"=t.id LIMIT 1),
 'questions',(SELECT jsonb_agg(jsonb_build_object('id',tq.id,'order',tq."orderIndex",'points',tq.points,'prompt',q.content,'explanation',q.explanation,
 'options',(SELECT jsonb_agg(jsonb_build_object('id',o.id,'order',o."orderIndex",'content',o.content,'isCorrect',o."isCorrect") ORDER BY o."orderIndex") FROM question_options o WHERE o."questionId"=q.id)) ORDER BY tq."orderIndex") FROM test_questions tq JOIN questions q ON q.id=tq."questionId" WHERE tq."testId"=t.id))::text,'UTF8')),'hex') FROM tests t WHERE t.id=tid
$$;
CREATE FUNCTION w03bc_source_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c UUID; a UUID; prev tests; item tests;
BEGIN
 IF TG_OP='DELETE' THEN IF OLD."quizActivityId" IS NOT NULL THEN RAISE EXCEPTION 'W03BC_RETAIN_SOURCE' USING ERRCODE='23514';END IF;RETURN OLD;END IF;
 IF TG_OP='UPDATE' AND OLD."quizActivityId" IS DISTINCT FROM NEW."quizActivityId" THEN RAISE EXCEPTION 'W03BC_SOURCE_OWNER' USING ERRCODE='23514';END IF;
 IF NEW."quizActivityId" IS NULL THEN RETURN NEW;END IF;
 PERFORM pg_advisory_xact_lock(842030);
 SELECT s."classOfferingId" INTO c FROM class_activities ca JOIN class_sections s ON s.id=ca."sectionId" WHERE ca.id=NEW."quizActivityId" AND ca.type::text='QUIZ';
 IF c IS NULL THEN RAISE EXCEPTION 'W03BC_CLASS_REQUIRED' USING ERRCODE='23514';END IF;
 IF TG_OP='INSERT' THEN
  a:=w03_teacher(c);SELECT * INTO prev FROM tests WHERE "quizActivityId"=NEW."quizActivityId" ORDER BY "quizVersion" DESC LIMIT 1;
  IF NEW."quizState"<>'DRAFT' OR NEW."quizAuthorId"<>a OR NEW."quizLockVersion"<>0 OR NEW."quizVersion"<>coalesce(prev."quizVersion",0)+1 OR (prev.id IS NOT NULL AND prev."quizState"<>'APPROVED') THEN RAISE EXCEPTION 'W03BC_SOURCE_VERSION' USING ERRCODE='23514';END IF;
  NEW."quizMakerIds":=ARRAY[a];
 ELSE
  IF OLD."quizState"='APPROVED' OR NEW.id<>OLD.id OR NEW."quizVersion"<>OLD."quizVersion" OR NEW."quizAuthorId"<>OLD."quizAuthorId" OR NEW."createdAt"<>OLD."createdAt" OR NEW."quizLockVersion"<>OLD."quizLockVersion"+1 THEN RAISE EXCEPTION 'W03BC_FROZEN_SOURCE_OR_CAS' USING ERRCODE='23514';END IF;
  IF NEW."quizState"='APPROVED' THEN
   a:=w03bb_checker(c,'academic.quiz.approve');
   IF a=ANY(OLD."quizMakerIds") OR NEW."quizApprovedById"<>a THEN RAISE EXCEPTION 'W03BC_INDEPENDENT_CHECKER' USING ERRCODE='42501';END IF;
   IF (to_jsonb(NEW)-ARRAY['quizState','quizApprovedById','quizApprovedAt','quizSourceHash','quizLockVersion','updatedAt']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['quizState','quizApprovedById','quizApprovedAt','quizSourceHash','quizLockVersion','updatedAt']) THEN RAISE EXCEPTION 'W03BC_SOURCE_CHANGED_AT_APPROVAL' USING ERRCODE='23514';END IF;
   IF NOT EXISTS(SELECT 1 FROM test_questions WHERE "testId"=OLD.id) OR (SELECT count(*) FROM test_questions WHERE "testId"=OLD.id)>100
    OR EXISTS(SELECT 1 FROM test_questions tq JOIN questions q ON q.id=tq."questionId" WHERE tq."testId"=OLD.id AND
      (q."quizSourceId" IS DISTINCT FROM OLD.id OR tq.points NOT BETWEEN 1 AND 1000 OR tq."groupId" IS NOT NULL OR
       (SELECT count(*) FROM question_options WHERE "questionId"=q.id AND "isCorrect")<>1 OR (SELECT count(*) FROM question_options WHERE "questionId"=q.id) NOT BETWEEN 2 AND 6))
    OR NOT EXISTS(SELECT 1 FROM class_assessments WHERE "testId"=OLD.id AND "classOfferingId"=c AND "openAt" IS NOT NULL AND "closeAt">"openAt" AND NOT "isActive")
   THEN RAISE EXCEPTION 'W03BC_SOURCE_INCOMPLETE' USING ERRCODE='23514';END IF;
   NEW."quizApprovedAt":=clock_timestamp();NEW."quizSourceHash":=w03bc_source_hash(OLD.id);
  ELSE a:=w03_teacher(c);NEW."quizMakerIds":=ARRAY(SELECT DISTINCT unnest(OLD."quizMakerIds"||a));END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER w03bc_source_guard BEFORE INSERT OR UPDATE OR DELETE ON tests FOR EACH ROW EXECUTE FUNCTION w03bc_source_guard();

CREATE FUNCTION w03bc_question_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE tid UUID; oldtid UUID; cid UUID; item RECORD;
BEGIN
 IF TG_OP='DELETE' THEN item:=OLD;ELSE item:=NEW;END IF;
 IF TG_TABLE_NAME='questions' THEN tid:=item."quizSourceId";IF TG_OP='UPDATE' THEN oldtid:=OLD."quizSourceId";END IF;
 ELSIF TG_TABLE_NAME='question_options' THEN SELECT "quizSourceId" INTO tid FROM questions WHERE id=item."questionId";IF TG_OP='UPDATE' THEN SELECT "quizSourceId" INTO oldtid FROM questions WHERE id=OLD."questionId";IF NEW."questionId"<>OLD."questionId" AND (tid IS NOT NULL OR oldtid IS NOT NULL) THEN RAISE EXCEPTION 'W03BC_QUESTION_OWNER' USING ERRCODE='23514';END IF;END IF;
 ELSE
  SELECT "quizSourceId" INTO tid FROM questions WHERE id=item."questionId";
  IF EXISTS(SELECT 1 FROM tests WHERE id=item."testId" AND "quizActivityId" IS NOT NULL) AND tid IS DISTINCT FROM item."testId" THEN RAISE EXCEPTION 'W03BC_NO_SHARED_QUESTION' USING ERRCODE='23514';END IF;
  IF tid IS NOT NULL AND tid<>item."testId" THEN RAISE EXCEPTION 'W03BC_NO_SHARED_QUESTION' USING ERRCODE='23514';END IF;
  IF TG_OP='UPDATE' AND (NEW."testId"<>OLD."testId" OR NEW."questionId"<>OLD."questionId") THEN SELECT q."quizSourceId" INTO oldtid FROM questions q WHERE q.id=OLD."questionId";IF tid IS NOT NULL OR oldtid IS NOT NULL THEN RAISE EXCEPTION 'W03BC_QUESTION_OWNER' USING ERRCODE='23514';END IF;END IF;
 END IF;
 IF TG_OP='UPDATE' AND TG_TABLE_NAME='questions' AND tid IS DISTINCT FROM oldtid THEN RAISE EXCEPTION 'W03BC_QUESTION_OWNER' USING ERRCODE='23514';END IF;
 IF tid IS NULL THEN RETURN item;END IF;
 cid:=w03bc_class(tid);PERFORM w03_teacher(cid);
 IF NOT EXISTS(SELECT 1 FROM tests WHERE id=tid AND "quizState"='DRAFT') THEN RAISE EXCEPTION 'W03BC_FROZEN_QUESTION' USING ERRCODE='23514';END IF;
 IF TG_OP<>'DELETE' AND TG_TABLE_NAME='questions' THEN
  IF NEW."courseId" IS NOT NULL OR NEW."rubricId" IS NOT NULL OR NEW."responseType"<>'SINGLE_CHOICE' OR NEW."toeicSkill"<>'READING' OR length(btrim(NEW.content))=0 THEN RAISE EXCEPTION 'W03BC_TEXT_MCQ_ONLY' USING ERRCODE='23514';END IF;
 END IF;
 RETURN item;
END $$;
CREATE TRIGGER w03bc_question_guard BEFORE INSERT OR UPDATE OR DELETE ON questions FOR EACH ROW EXECUTE FUNCTION w03bc_question_guard();
CREATE TRIGGER w03bc_option_guard BEFORE INSERT OR UPDATE OR DELETE ON question_options FOR EACH ROW EXECUTE FUNCTION w03bc_question_guard();
CREATE TRIGGER w03bc_test_question_guard BEFORE INSERT OR UPDATE OR DELETE ON test_questions FOR EACH ROW EXECUTE FUNCTION w03bc_question_guard();

CREATE FUNCTION w03bc_config_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE item class_assessments; tid UUID; c UUID;
BEGIN
 IF TG_OP='DELETE' THEN item:=OLD;ELSE item:=NEW;END IF;
 tid:=item."testId";c:=w03bc_class(tid);
 IF TG_OP='UPDATE' AND OLD."testId"<>NEW."testId" AND w03bc_class(OLD."testId") IS NOT NULL THEN RAISE EXCEPTION 'W03BC_CONFIG_OWNER' USING ERRCODE='23514';END IF;
 IF c IS NULL THEN RETURN item;END IF;
 PERFORM w03_teacher(c);
 IF NOT EXISTS(SELECT 1 FROM tests WHERE id=tid AND "quizState"='DRAFT') OR (TG_OP='UPDATE' AND NEW."classOfferingId"<>OLD."classOfferingId") THEN RAISE EXCEPTION 'W03BC_FROZEN_CONFIG' USING ERRCODE='23514';END IF;
 IF TG_OP<>'DELETE' AND (item."classOfferingId"<>c OR item."isActive" OR item."openAt" IS NULL OR item."closeAt" IS NULL OR item."closeAt"<=item."openAt" OR item."maxAttemptsOverride" IS DISTINCT FROM 1 OR EXISTS(SELECT 1 FROM class_assessments WHERE "testId"=tid AND id<>item.id)) THEN RAISE EXCEPTION 'W03BC_EXPLICIT_CONFIG_REQUIRED' USING ERRCODE='23514';END IF;
 RETURN item;
END $$;
CREATE TRIGGER w03bc_config_guard BEFORE INSERT OR UPDATE OR DELETE ON class_assessments FOR EACH ROW EXECUTE FUNCTION w03bc_config_guard();
CREATE FUNCTION w03bc_no_media_group() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE tid UUID;
BEGIN
 IF TG_OP='UPDATE' AND EXISTS(SELECT 1 FROM tests WHERE id=OLD."testId" AND "quizActivityId" IS NOT NULL) THEN RAISE EXCEPTION 'W03BC_TEXT_ONLY_NO_GROUPS' USING ERRCODE='23514';END IF;
 IF TG_OP='DELETE' THEN tid:=OLD."testId";ELSE tid:=NEW."testId";END IF;
 IF EXISTS(SELECT 1 FROM tests WHERE id=tid AND "quizActivityId" IS NOT NULL) THEN RAISE EXCEPTION 'W03BC_TEXT_ONLY_NO_GROUPS' USING ERRCODE='23514';END IF;
 IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;
END $$;
CREATE TRIGGER w03bc_no_media_group BEFORE INSERT OR UPDATE OR DELETE ON test_question_groups FOR EACH ROW EXECUTE FUNCTION w03bc_no_media_group();
CREATE FUNCTION w03bc_revision_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.type::text='QUIZ' THEN
  IF NOT EXISTS(SELECT 1 FROM tests WHERE id=NEW."quizTestId" AND "quizActivityId"=NEW."activityId" AND "quizState"='APPROVED') OR NEW."sourceLessonId" IS NOT NULL OR NEW."sourceResourceId" IS NOT NULL OR NEW."availableFrom" IS NOT NULL OR NEW."availableUntil" IS NOT NULL THEN RAISE EXCEPTION 'W03BC_APPROVED_SOURCE_REQUIRED' USING ERRCODE='23514';END IF;
 ELSIF NEW."quizTestId" IS NOT NULL THEN RAISE EXCEPTION 'W03BC_QUIZ_SOURCE_TYPE' USING ERRCODE='23514';END IF;RETURN NEW;
END $$;
CREATE TRIGGER w03bc_revision_guard BEFORE INSERT ON class_activity_revisions FOR EACH ROW EXECUTE FUNCTION w03bc_revision_guard();

CREATE FUNCTION w03bc_student(eid UUID) RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE a UUID;
BEGIN
 a:=w03_actor();IF NOT EXISTS(SELECT 1 FROM enrollments e JOIN users u ON u.id=e."learnerId" WHERE e.id=eid AND e."learnerId"=a AND e.status='ACTIVE' AND u.role='STUDENT' AND u.status='ACTIVE') THEN RAISE EXCEPTION 'W03BC_ENROLLMENT_DENIED' USING ERRCODE='42501';END IF;RETURN a;
END $$;
CREATE FUNCTION w03bc_attempt_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE t tests; ca class_assessments; r class_activity_revisions; c UUID; a UUID; earned INTEGER; maximum INTEGER; current_time_utc TIMESTAMP;
BEGIN
 IF TG_OP='DELETE' THEN IF OLD."quizDeadline" IS NOT NULL THEN RAISE EXCEPTION 'W03BC_RETAIN_ATTEMPT' USING ERRCODE='23514';END IF;RETURN OLD;END IF;
 SELECT * INTO t FROM tests WHERE id=NEW."testId";
 IF TG_OP='UPDATE' AND OLD."testId"<>NEW."testId" AND OLD."quizDeadline" IS NOT NULL THEN RAISE EXCEPTION 'W03BC_ATTEMPT_OWNER' USING ERRCODE='23514';END IF;
 IF t."quizActivityId" IS NULL THEN IF NEW."quizDeadline" IS NOT NULL THEN RAISE EXCEPTION 'W03BC_SOURCE_REQUIRED' USING ERRCODE='23514';END IF;RETURN NEW;END IF;
 PERFORM pg_advisory_xact_lock(842030);c:=w03bc_class(t.id);current_time_utc:=timezone('UTC',clock_timestamp());
 IF TG_OP='INSERT' THEN
  a:=w03bc_student(NEW."enrollmentId");SELECT * INTO r FROM class_activity_revisions WHERE id=NEW."quizRevisionId";SELECT * INTO ca FROM class_assessments WHERE id=NEW."classAssessmentId";
  IF a<>NEW."learnerId" OR t."quizState"<>'APPROVED' OR r."quizTestId" IS DISTINCT FROM t.id OR r."classOfferingId" IS DISTINCT FROM c OR ca."testId" IS DISTINCT FROM t.id OR ca."classOfferingId" IS DISTINCT FROM c
   OR NOT EXISTS(SELECT 1 FROM enrollments WHERE id=NEW."enrollmentId" AND "classOfferingId"=c)
   OR NOT EXISTS(SELECT 1 FROM class_activities a JOIN class_sections s ON s.id=a."sectionId" WHERE a.id=t."quizActivityId" AND a.state='PUBLISHED' AND a."publishedRevisionId"=r.id AND s."publishedRevisionId" IS NOT NULL)
   OR current_time_utc<ca."openAt" OR current_time_utc>=ca."closeAt" OR NEW.status<>'IN_PROGRESS' OR NEW."quizLockVersion"<>0 THEN RAISE EXCEPTION 'W03BC_START_DENIED' USING ERRCODE='42501';END IF;
  NEW."startedAt":=current_time_utc;NEW."quizDeadline":=least(current_time_utc+make_interval(mins=>t."timeLimitMinutes"),ca."closeAt") AT TIME ZONE 'UTC';
 ELSE
  IF NEW.id<>OLD.id OR (NEW."testId",NEW."learnerId",NEW."enrollmentId",NEW."classAssessmentId",NEW."quizRevisionId",NEW."quizDeadline",NEW."startedAt",NEW."attemptNumber",NEW."createdAt") IS DISTINCT FROM (OLD."testId",OLD."learnerId",OLD."enrollmentId",OLD."classAssessmentId",OLD."quizRevisionId",OLD."quizDeadline",OLD."startedAt",OLD."attemptNumber",OLD."createdAt") OR NEW."quizLockVersion"<>OLD."quizLockVersion"+1 THEN RAISE EXCEPTION 'W03BC_ATTEMPT_IMMUTABLE_OR_CAS' USING ERRCODE='23514';END IF;
  IF OLD.status='IN_PROGRESS' THEN
   IF NEW.status='IN_PROGRESS' THEN
    PERFORM w03bc_student(OLD."enrollmentId");IF clock_timestamp()>=OLD."quizDeadline" OR NEW.score IS NOT NULL OR NEW."quizReceipt" IS NOT NULL THEN RAISE EXCEPTION 'W03BC_EXPIRED' USING ERRCODE='23514';END IF;
   ELSE
    IF clock_timestamp()<OLD."quizDeadline" THEN PERFORM w03bc_student(OLD."enrollmentId");NEW."quizFinalReason":='SUBMITTED';ELSE NEW."quizFinalReason":='EXPIRED';END IF;
    IF NEW."quizMarked" IS DISTINCT FROM OLD."quizMarked" OR NEW."quizPublishedAt" IS NOT NULL THEN RAISE EXCEPTION 'W03BC_FINALIZE_SAVED_ONLY' USING ERRCODE='23514';END IF;
    SELECT coalesce(sum(CASE WHEN cardinality(ans."selectedOptionIds")=1 AND opt."isCorrect" THEN tq.points ELSE 0 END),0)::int,coalesce(sum(tq.points),0)::int INTO earned,maximum FROM test_questions tq
     LEFT JOIN test_answers ans ON ans."attemptId"=OLD.id AND ans."testQuestionId"=tq.id LEFT JOIN question_options opt ON opt.id=ans."selectedOptionIds"[1] AND opt."questionId"=tq."questionId" WHERE tq."testId"=OLD."testId";
    NEW.score:=earned;NEW."maxScore":=maximum;NEW."submittedAt":=current_time_utc;NEW."quizReceipt":=gen_random_uuid();
    INSERT INTO domain_audit_events(id,"actorId",action,"objectType","objectId",decision,reason,"createdAt") VALUES(gen_random_uuid(),OLD."learnerId",'W03BC_FINALIZE','QUIZ_ATTEMPT',OLD.id::text,'ALLOW','Persisted answers finalized: '||NEW."quizFinalReason",timezone('UTC',clock_timestamp()));
   END IF;
  ELSE
   IF OLD."quizPublishedAt" IS NOT NULL OR NEW.status<>'SUBMITTED' OR NEW."quizPublishedAt" IS NULL THEN RAISE EXCEPTION 'W03BC_FINAL_RECEIPT_IMMUTABLE' USING ERRCODE='23514';END IF;
   a:=w03bb_checker(c,'academic.quiz.grade.publish');
   IF a=ANY(t."quizMakerIds") OR NEW."quizPublishedById" IS DISTINCT FROM a THEN RAISE EXCEPTION 'W03BC_INDEPENDENT_CHECKER' USING ERRCODE='42501';END IF;
   IF (to_jsonb(NEW)-ARRAY['quizPublishedAt','quizPublishedById','quizLockVersion','updatedAt']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['quizPublishedAt','quizPublishedById','quizLockVersion','updatedAt']) THEN RAISE EXCEPTION 'W03BC_PUBLISH_SNAPSHOT' USING ERRCODE='23514';END IF;NEW."quizPublishedAt":=clock_timestamp();
  END IF;
 END IF;
 IF EXISTS(SELECT 1 FROM unnest(NEW."quizMarked") x WHERE NOT EXISTS(SELECT 1 FROM test_questions WHERE id=x AND "testId"=NEW."testId")) THEN RAISE EXCEPTION 'W03BC_FOREIGN_MARK' USING ERRCODE='23514';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER w03bc_attempt_guard BEFORE INSERT OR UPDATE OR DELETE ON test_attempts FOR EACH ROW EXECUTE FUNCTION w03bc_attempt_guard();
CREATE FUNCTION w03bc_answer_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE item test_answers; a test_attempts;
BEGIN
 IF TG_OP='DELETE' THEN item:=OLD;ELSE item:=NEW;END IF;SELECT * INTO a FROM test_attempts WHERE id=item."attemptId";
 IF TG_OP='UPDATE' AND (OLD."attemptId"<>NEW."attemptId" OR OLD."testQuestionId"<>NEW."testQuestionId") THEN RAISE EXCEPTION 'W03BC_ANSWER_OWNER' USING ERRCODE='23514';END IF;
 IF a."quizDeadline" IS NULL THEN RETURN item;END IF;
 PERFORM pg_advisory_xact_lock(842030);PERFORM w03bc_student(a."enrollmentId");
 IF a.status<>'IN_PROGRESS' OR clock_timestamp()>=a."quizDeadline" OR NOT EXISTS(SELECT 1 FROM test_questions WHERE id=item."testQuestionId" AND "testId"=a."testId") THEN RAISE EXCEPTION 'W03BC_ANSWER_CLOSED_OR_FOREIGN' USING ERRCODE='23514';END IF;
 IF TG_OP<>'DELETE' AND (cardinality(item."selectedOptionIds")>1 OR item."textResponse" IS NOT NULL OR item."audioStorageKey" IS NOT NULL OR item."isCorrect" IS NOT NULL OR item."pointsAwarded" IS NOT NULL
  OR EXISTS(SELECT 1 FROM unnest(item."selectedOptionIds") opt WHERE NOT EXISTS(SELECT 1 FROM question_options o JOIN test_questions tq ON tq."questionId"=o."questionId" WHERE o.id=opt AND tq.id=item."testQuestionId"))) THEN RAISE EXCEPTION 'W03BC_SINGLE_OPTION_ONLY' USING ERRCODE='23514';END IF;RETURN item;
END $$;
CREATE TRIGGER w03bc_answer_guard BEFORE INSERT OR UPDATE OR DELETE ON test_answers FOR EACH ROW EXECUTE FUNCTION w03bc_answer_guard();
-- Idempotent, restart-safe: callable without a learner session only AFTER the server deadline.
CREATE FUNCTION w03bc_expire_due() RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE n INTEGER;
BEGIN
 PERFORM pg_advisory_xact_lock(842030);
 UPDATE test_attempts SET status='SUBMITTED',"quizLockVersion"="quizLockVersion"+1,"updatedAt"=timezone('UTC',clock_timestamp()) WHERE "quizDeadline"<=clock_timestamp() AND status='IN_PROGRESS';
 GET DIAGNOSTICS n=ROW_COUNT;RETURN n;
END $$;
