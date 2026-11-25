-- W04A private ungraded integration. No real source publication or inferred goals.
CREATE TABLE placement_source_versions (
 id UUID PRIMARY KEY,"testId" UUID NOT NULL UNIQUE REFERENCES tests(id) ON DELETE RESTRICT,
 mode "PlacementMode" NOT NULL,version INTEGER NOT NULL CHECK(version>0),purpose VARCHAR(16) NOT NULL CHECK(purpose IN ('CANDIDATE','DEV_PREVIEW')),
 snapshot JSONB NOT NULL,"sourceHash" VARCHAR(64) NOT NULL CHECK("sourceHash" ~ '^[a-f0-9]{64}$'),provenance JSONB NOT NULL,
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE test_attempts ADD COLUMN "placementVersionId" UUID REFERENCES placement_source_versions(id) ON DELETE RESTRICT,
 ADD COLUMN "placementGoalSpeaking" INTEGER,ADD COLUMN "placementGoalWriting" INTEGER,
 ADD COLUMN "placementLockVersion" INTEGER NOT NULL DEFAULT 0,ADD COLUMN "placementMarked" UUID[] NOT NULL DEFAULT '{}',ADD COLUMN "placementReceipt" UUID;
CREATE UNIQUE INDEX placement_receipt_once ON test_attempts("placementReceipt");
CREATE UNIQUE INDEX placement_preview_once ON test_attempts("learnerId","placementVersionId") WHERE "placementVersionId" IS NOT NULL;
CREATE UNIQUE INDEX w04a_request_once ON domain_audit_events("actorId",action,"objectType",split_part(reason,':',1)) WHERE "objectType"='W04A_REQUEST';
ALTER TABLE test_attempts ADD CONSTRAINT placement_v2_attempt_shape CHECK("placementVersionId" IS NULL OR
 ("enrollmentId" IS NULL AND "classAssessmentId" IS NULL AND "quizRevisionId" IS NULL AND "placementSelfLevel" IS NULL
 AND "placementGoalScore" BETWEEN 10 AND 990 AND "placementGoalScore" IS NOT NULL AND score IS NULL AND "maxScore" IS NULL AND "placementLockVersion">=0
 AND ((status='IN_PROGRESS' AND "placementReceipt" IS NULL AND "submittedAt" IS NULL) OR(status='SUBMITTED' AND "placementReceipt" IS NOT NULL AND "submittedAt" IS NOT NULL))));

CREATE FUNCTION w04a_source_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE t tests; actual JSONB;
BEGIN
 PERFORM pg_advisory_xact_lock(842030);
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'W04A_SOURCE_IMMUTABLE' USING ERRCODE='23514';END IF;
 SELECT * INTO t FROM tests WHERE id=NEW."testId";
 IF t.purpose<>'PLACEMENT' OR t."placementMode" IS DISTINCT FROM NEW.mode OR t."courseId" IS NOT NULL OR t."lessonId" IS NOT NULL OR t."quizActivityId" IS NOT NULL OR t."timeLimitMinutes" IS NOT NULL THEN
 RAISE EXCEPTION 'W04A_MODE_OR_UNAPPROVED_TIMER' USING ERRCODE='23514';END IF;
 IF NEW.purpose='DEV_PREVIEW' AND (current_database()!~'^v2_wave01_dev_test_w04a_[a-z0-9_]+$' OR current_user<>'wave01'
 OR shobj_description((SELECT oid FROM pg_database WHERE datname=current_database()),'pg_database') IS DISTINCT FROM 'SMART_ENGLISH_DISPOSABLE_E2E_V1') THEN
 RAISE EXCEPTION 'W04A_DEV_ONLY' USING ERRCODE='42501';END IF;
 IF NEW.snapshot->>'testId' IS DISTINCT FROM NEW."testId"::text OR NEW.snapshot->>'mode' IS DISTINCT FROM NEW.mode::text THEN
 RAISE EXCEPTION 'W04A_SNAPSHOT_IDENTITY' USING ERRCODE='23514';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER w04a_source BEFORE INSERT OR UPDATE OR DELETE ON placement_source_versions FOR EACH ROW EXECUTE FUNCTION w04a_source_guard();

CREATE FUNCTION w04a_frozen_graph() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE a UUID;b UUID;locked BOOLEAN;
BEGIN
 PERFORM pg_advisory_xact_lock(842030);
 IF TG_TABLE_NAME='tests' THEN a:=CASE WHEN TG_OP='INSERT' THEN NEW.id ELSE OLD.id END;b:=CASE WHEN TG_OP='DELETE' THEN a ELSE NEW.id END;
 ELSIF TG_TABLE_NAME IN ('test_questions','test_question_groups') THEN a:=CASE WHEN TG_OP='INSERT' THEN NEW."testId" ELSE OLD."testId" END;b:=CASE WHEN TG_OP='DELETE' THEN a ELSE NEW."testId" END;
 ELSIF TG_TABLE_NAME='assessment_stimuli' THEN
 SELECT "testId" INTO a FROM test_question_groups WHERE id=CASE WHEN TG_OP='INSERT' THEN NEW."groupId" ELSE OLD."groupId" END;
 SELECT "testId" INTO b FROM test_question_groups WHERE id=CASE WHEN TG_OP='DELETE' THEN OLD."groupId" ELSE NEW."groupId" END;
 ELSIF TG_TABLE_NAME='questions' THEN
 SELECT EXISTS(SELECT 1 FROM test_questions q JOIN placement_source_versions v ON v."testId"=q."testId" WHERE q."questionId"=CASE WHEN TG_OP='INSERT' THEN NEW.id ELSE OLD.id END OR q."questionId"=CASE WHEN TG_OP='DELETE' THEN OLD.id ELSE NEW.id END) INTO locked;
 ELSE
 SELECT EXISTS(SELECT 1 FROM test_questions q JOIN placement_source_versions v ON v."testId"=q."testId" WHERE q."questionId"=CASE WHEN TG_OP='INSERT' THEN NEW."questionId" ELSE OLD."questionId" END OR q."questionId"=CASE WHEN TG_OP='DELETE' THEN OLD."questionId" ELSE NEW."questionId" END) INTO locked;
 END IF;
 IF locked OR EXISTS(SELECT 1 FROM placement_source_versions WHERE "testId" IN(a,b)) THEN RAISE EXCEPTION 'W04A_FROZEN_GRAPH' USING ERRCODE='23514';END IF;
 IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;
END $$;
CREATE TRIGGER w04a_test BEFORE INSERT OR UPDATE OR DELETE ON tests FOR EACH ROW EXECUTE FUNCTION w04a_frozen_graph();
CREATE TRIGGER w04a_question BEFORE INSERT OR UPDATE OR DELETE ON questions FOR EACH ROW EXECUTE FUNCTION w04a_frozen_graph();
CREATE TRIGGER w04a_option BEFORE INSERT OR UPDATE OR DELETE ON question_options FOR EACH ROW EXECUTE FUNCTION w04a_frozen_graph();
CREATE TRIGGER w04a_test_question BEFORE INSERT OR UPDATE OR DELETE ON test_questions FOR EACH ROW EXECUTE FUNCTION w04a_frozen_graph();
CREATE TRIGGER w04a_group BEFORE INSERT OR UPDATE OR DELETE ON test_question_groups FOR EACH ROW EXECUTE FUNCTION w04a_frozen_graph();
CREATE TRIGGER w04a_stimulus BEFORE INSERT OR UPDATE OR DELETE ON assessment_stimuli FOR EACH ROW EXECUTE FUNCTION w04a_frozen_graph();

CREATE FUNCTION w04a_attempt_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v placement_source_versions;role_now TEXT;owner_session_user TEXT;
BEGIN
 IF TG_OP='DELETE' THEN IF OLD."placementVersionId" IS NOT NULL THEN RAISE EXCEPTION 'W04A_RETAIN_ATTEMPT' USING ERRCODE='23514';END IF;RETURN OLD;END IF;
 IF NEW."placementVersionId" IS NULL AND (TG_OP='INSERT' OR OLD."placementVersionId" IS NULL) THEN RETURN NEW;END IF;
 PERFORM pg_advisory_xact_lock(842030);
 SELECT * INTO v FROM placement_source_versions WHERE id=NEW."placementVersionId";
 SELECT role::text INTO role_now FROM users WHERE id=NEW."learnerId" AND status='ACTIVE';
 SELECT sess->>'userId' INTO owner_session_user FROM user_sessions WHERE sid=current_setting('app.class_lms_session',true) AND expire>clock_timestamp();
 IF current_setting('app.class_lms_actor',true) IS DISTINCT FROM NEW."learnerId"::text OR owner_session_user IS DISTINCT FROM NEW."learnerId"::text OR role_now IS DISTINCT FROM 'STUDENT' THEN RAISE EXCEPTION 'W04A_OWNER_SESSION' USING ERRCODE='42501';END IF;
 IF v.id IS NULL OR v.purpose<>'DEV_PREVIEW' OR current_database()!~'^v2_wave01_dev_test_w04a_[a-z0-9_]+$' OR NEW."testId"<>v."testId" OR
 (v.mode='LR' AND(NEW."placementGoalSpeaking" IS NOT NULL OR NEW."placementGoalWriting" IS NOT NULL)) OR
 (v.mode='FOUR_SKILLS' AND(NEW."placementGoalSpeaking" IS NULL OR NEW."placementGoalWriting" IS NULL OR NEW."placementGoalSpeaking" NOT BETWEEN 0 AND 200 OR NEW."placementGoalWriting" NOT BETWEEN 0 AND 200)) THEN RAISE EXCEPTION 'W04A_SOURCE_OR_GOALS' USING ERRCODE='23514';END IF;
 IF TG_OP='UPDATE' AND(OLD.status<>'IN_PROGRESS' OR NEW."placementVersionId" IS DISTINCT FROM OLD."placementVersionId" OR NEW."learnerId"<>OLD."learnerId" OR NEW."testId"<>OLD."testId" OR NEW."placementGoalScore"<>OLD."placementGoalScore" OR NEW."placementGoalSpeaking" IS DISTINCT FROM OLD."placementGoalSpeaking" OR NEW."placementGoalWriting" IS DISTINCT FROM OLD."placementGoalWriting" OR NEW."startedAt"<>OLD."startedAt" OR NEW."placementLockVersion"<>OLD."placementLockVersion"+1) THEN RAISE EXCEPTION 'W04A_ATTEMPT_IMMUTABLE_OR_STALE' USING ERRCODE='23514';END IF;
 IF EXISTS(SELECT 1 FROM unnest(NEW."placementMarked") q WHERE NOT EXISTS(SELECT 1 FROM test_questions WHERE id=q AND "testId"=NEW."testId")) THEN RAISE EXCEPTION 'W04A_FOREIGN_MARK' USING ERRCODE='23514';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER w04a_attempt BEFORE INSERT OR UPDATE OR DELETE ON test_attempts FOR EACH ROW EXECUTE FUNCTION w04a_attempt_guard();

CREATE FUNCTION w04a_answer_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE a test_attempts;owner_session_user TEXT;q test_questions;
BEGIN
 SELECT * INTO a FROM test_attempts WHERE id=CASE WHEN TG_OP='INSERT' THEN NEW."attemptId" ELSE OLD."attemptId" END;
 IF a."placementVersionId" IS NULL THEN IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;END IF;
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'W04A_RETAIN_ANSWER' USING ERRCODE='23514';END IF;
 SELECT sess->>'userId' INTO owner_session_user FROM user_sessions WHERE sid=current_setting('app.class_lms_session',true) AND expire>=clock_timestamp();
 SELECT * INTO q FROM test_questions WHERE id=NEW."testQuestionId";
 IF a.status<>'IN_PROGRESS' OR current_setting('app.class_lms_actor',true) IS DISTINCT FROM a."learnerId"::text OR owner_session_user IS DISTINCT FROM a."learnerId"::text OR q."testId" IS DISTINCT FROM a."testId" OR NEW."attemptId"<>a.id OR NEW."isCorrect" IS NOT NULL OR NEW."pointsAwarded" IS NOT NULL THEN RAISE EXCEPTION 'W04A_PREVIEW_ANSWER_BOUNDARY' USING ERRCODE='42501';END IF;
 IF TG_OP='UPDATE' AND(NEW."attemptId"<>OLD."attemptId" OR NEW."testQuestionId"<>OLD."testQuestionId") THEN RAISE EXCEPTION 'W04A_IMMUTABLE_ANSWER_IDENTITY' USING ERRCODE='23514';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER w04a_answer BEFORE INSERT OR UPDATE OR DELETE ON test_answers FOR EACH ROW EXECUTE FUNCTION w04a_answer_guard();
