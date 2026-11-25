BEGIN;
ALTER TABLE test_attempts ADD COLUMN "s10ProtocolVersion" INTEGER NOT NULL DEFAULT 1 CHECK ("s10ProtocolVersion" IN (1,2));
ALTER TABLE exam_task_progress ADD COLUMN "protocolVersion" INTEGER NOT NULL DEFAULT 1 CHECK ("protocolVersion" IN (1,2));
CREATE TABLE exam_task_captures (
 "progressId" UUID PRIMARY KEY REFERENCES exam_task_progress(id) ON DELETE RESTRICT,
 "prepareKey" UUID NOT NULL UNIQUE,"nonceHash" TEXT NOT NULL UNIQUE CHECK ("nonceHash" ~ '^[a-f0-9]{64}$'),
 phase TEXT NOT NULL DEFAULT 'ARMED' CHECK(phase IN ('ARMED','START_CONFIRMED','STOP_CONFIRMED','BLOCKED_REVIEW')),
 "armedAt" TIMESTAMP(3) NOT NULL,"armExpiresAt" TIMESTAMP(3) NOT NULL,
 "startedAt" TIMESTAMP(3),deadline TIMESTAMP(3),"stoppedAt" TIMESTAMP(3),"stopDigest" TEXT,
 CHECK("armExpiresAt"="armedAt"+interval '3000 milliseconds'),
 CHECK(("startedAt" IS NULL AND deadline IS NULL) OR ("startedAt">="armedAt" AND "startedAt"<="armExpiresAt" AND deadline="startedAt"+interval '30000 milliseconds')),
 CHECK(("stoppedAt" IS NULL AND "stopDigest" IS NULL) OR (deadline IS NOT NULL AND "stoppedAt">=deadline AND "stoppedAt"<=deadline+interval '2000 milliseconds' AND "stopDigest" ~ '^[a-f0-9]{64}$')),
 CHECK(phase<>'START_CONFIRMED' OR "startedAt" IS NOT NULL),
 CHECK(phase<>'STOP_CONFIRMED' OR "stoppedAt" IS NOT NULL)
);
CREATE TABLE exam_task_audio_validations (
 "progressId" UUID PRIMARY KEY REFERENCES exam_task_progress(id) ON DELETE RESTRICT,
 digest TEXT NOT NULL CHECK(digest ~ '^[a-f0-9]{64}$'),"storageKey" TEXT UNIQUE,bytes INTEGER NOT NULL CHECK(bytes>=0 AND bytes<=10485760),
 status TEXT NOT NULL CHECK(status IN ('VALID','REJECTED')),code TEXT,codec TEXT,"sampleRate" INTEGER,"sampleCount" INTEGER,channels INTEGER,
 "decoderIdentity" TEXT NOT NULL,"sourceSha256" TEXT NOT NULL CHECK("sourceSha256" ~ '^[a-f0-9]{64}$'),"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK(status<>'VALID' OR (codec IS NOT NULL AND "sampleRate" IS NOT NULL AND channels IS NOT NULL AND "sampleCount" IS NOT NULL AND codec='opus' AND "sampleRate"=48000 AND channels BETWEEN 1 AND 2 AND "sampleCount" BETWEEN 1440000 AND 1680000 AND bytes>0 AND "storageKey" IS NOT NULL AND code IS NULL))
);
CREATE FUNCTION s10_pin_protocol() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='UPDATE' AND NEW."s10ProtocolVersion"<>OLD."s10ProtocolVersion" THEN RAISE EXCEPTION 'S10_PROTOCOL_IMMUTABLE' USING ERRCODE='42501'; END IF;
 IF TG_OP='INSERT' AND NEW."s10ProtocolVersion"=2 AND current_setting('app.s10_enable',true) IS DISTINCT FROM 'DEC045' THEN RAISE EXCEPTION 'S10_PROTOCOL_CAPABILITY_REQUIRED' USING ERRCODE='42501'; END IF;
 RETURN NEW; END $$;
CREATE TRIGGER s10_pin_protocol BEFORE INSERT OR UPDATE ON test_attempts FOR EACH ROW EXECUTE FUNCTION s10_pin_protocol();
CREATE FUNCTION s10_v2_actor(p exam_task_progress) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT CASE WHEN current_setting('app.s10_system',true)='maintenance' THEN true ELSE
 EXISTS(SELECT 1 FROM users u JOIN user_sessions s ON s.sid=current_setting('app.s10_session',true) AND s.sess->>'userId'=u.id::text AND s.expire>clock_timestamp()
 WHERE u.id::text=current_setting('app.s10_actor',true) AND u.status='ACTIVE' AND
 ((u.role='STUDENT' AND u.id=p."learnerId" AND
 (p."leaseSessionHash" IS NULL OR (p."leaseSessionHash"=encode(sha256(convert_to(s.sid,'UTF8')),'hex') AND p."leaseTabHash"=encode(sha256(convert_to(current_setting('app.s10_tab',true),'UTF8')),'hex') AND p."leaseTokenHash"=encode(sha256(convert_to(current_setting('app.s10_token',true),'UTF8')),'hex')))) OR
 (u.role='ACADEMIC_MANAGER' AND (EXISTS(SELECT 1 FROM exam_recovery_permissions r WHERE r."userId"=u.id AND r."revokedAt" IS NULL) OR EXISTS(SELECT 1 FROM permission_grants g WHERE g."userId"=u.id AND g.capability='assessment.recovery.approve' AND g."scopeType"='GLOBAL' AND g."revokedAt" IS NULL AND g."approvedBy" IS NOT NULL AND g."approvedAt"<=clock_timestamp() AND g."effectiveAt"<=clock_timestamp() AND g."expiresAt">clock_timestamp()))))) END
$$;
CREATE FUNCTION s10_v2_progress_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c exam_task_captures%ROWTYPE; a exam_task_audio_validations%ROWTYPE; BEGIN
 IF TG_OP='TRUNCATE' THEN RAISE EXCEPTION 'S10_HISTORY_APPEND_ONLY' USING ERRCODE='42501'; END IF;
 IF TG_OP='UPDATE' AND NEW."protocolVersion"<>OLD."protocolVersion" THEN RAISE EXCEPTION 'S10_PROTOCOL_IMMUTABLE' USING ERRCODE='42501'; END IF;
 IF NEW."protocolVersion"<> (SELECT "s10ProtocolVersion" FROM test_attempts WHERE id=NEW."attemptId") THEN RAISE EXCEPTION 'S10_ATTEMPT_PROTOCOL_PIN' USING ERRCODE='42501'; END IF;
 IF NEW."protocolVersion"=2 THEN
  IF NOT s10_v2_actor(NEW) THEN RAISE EXCEPTION 'S10_V2_ACTOR_OR_OLD_BINARY' USING ERRCODE='42501'; END IF;
  SELECT * INTO c FROM exam_task_captures WHERE "progressId"=NEW.id;
  IF NEW."responseDeadline" IS NOT NULL AND (c.deadline IS NULL OR NEW."responseDeadline"<>c.deadline) THEN RAISE EXCEPTION 'S10_DEADLINE_ANCHOR' USING ERRCODE='42501'; END IF;
  IF NEW.phase='SAVED' THEN
   SELECT * INTO a FROM exam_task_audio_validations WHERE "progressId"=NEW.id;
   IF c."stoppedAt" IS NULL OR a.status IS DISTINCT FROM 'VALID' OR a.digest IS DISTINCT FROM c."stopDigest" OR a.digest IS DISTINCT FROM NEW."uploadDigest" OR a."sourceSha256"<>NEW."mediaSha256" OR NOT EXISTS(SELECT 1 FROM test_answers t WHERE t.id=NEW."savedAnswerId" AND t."attemptId"=NEW."attemptId" AND t."testQuestionId"=NEW."testQuestionId" AND t."audioStorageKey"=a."storageKey" AND t."pointsAwarded" IS NULL AND t."isCorrect" IS NULL) THEN RAISE EXCEPTION 'S10_VALID_ORIGINAL_REQUIRED' USING ERRCODE='42501'; END IF;
  END IF;
 END IF; RETURN NEW; END $$;
CREATE TRIGGER s10_v2_progress_guard BEFORE INSERT OR UPDATE ON exam_task_progress FOR EACH ROW EXECUTE FUNCTION s10_v2_progress_guard();
CREATE TRIGGER s10_v2_progress_no_truncate BEFORE TRUNCATE ON exam_task_progress FOR EACH STATEMENT EXECUTE FUNCTION s10_v2_progress_guard();
CREATE FUNCTION s10_v2_capture_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p exam_task_progress%ROWTYPE; BEGIN
 IF TG_OP IN ('DELETE','TRUNCATE') THEN RAISE EXCEPTION 'S10_CAPTURE_HISTORY_IMMUTABLE' USING ERRCODE='42501'; END IF;
 SELECT * INTO p FROM exam_task_progress WHERE id=NEW."progressId";
 IF p."protocolVersion"<>2 OR NOT s10_v2_actor(p) OR p.started<>2 OR p.completed<>2 THEN RAISE EXCEPTION 'S10_CAPTURE_AUTHORITY' USING ERRCODE='42501'; END IF;
 IF TG_OP='INSERT' AND (p.phase<>'RECORDING_READY' OR NEW.phase<>'ARMED' OR NEW."startedAt" IS NOT NULL OR NEW."stoppedAt" IS NOT NULL) THEN RAISE EXCEPTION 'S10_ARM_AFTER_PLAY2' USING ERRCODE='42501'; END IF;
 IF TG_OP='UPDATE' THEN
  IF (NEW."progressId",NEW."prepareKey",NEW."nonceHash",NEW."armedAt",NEW."armExpiresAt") IS DISTINCT FROM (OLD."progressId",OLD."prepareKey",OLD."nonceHash",OLD."armedAt",OLD."armExpiresAt") OR (OLD."startedAt" IS NOT NULL AND (NEW."startedAt",NEW.deadline) IS DISTINCT FROM (OLD."startedAt",OLD.deadline)) OR (OLD."stoppedAt" IS NOT NULL AND (NEW."stoppedAt",NEW."stopDigest") IS DISTINCT FROM (OLD."stoppedAt",OLD."stopDigest")) OR OLD.phase='BLOCKED_REVIEW' THEN RAISE EXCEPTION 'S10_CAPTURE_BINDING_IMMUTABLE' USING ERRCODE='42501'; END IF;
  IF NOT ((OLD.phase='ARMED' AND NEW.phase IN ('START_CONFIRMED','BLOCKED_REVIEW')) OR (OLD.phase='START_CONFIRMED' AND NEW.phase IN ('STOP_CONFIRMED','BLOCKED_REVIEW')) OR (OLD.phase='STOP_CONFIRMED' AND NEW.phase='BLOCKED_REVIEW')) THEN RAISE EXCEPTION 'S10_CAPTURE_TRANSITION' USING ERRCODE='42501'; END IF;
 END IF; RETURN NEW; END $$;
CREATE TRIGGER s10_v2_capture_guard BEFORE INSERT OR UPDATE OR DELETE ON exam_task_captures FOR EACH ROW EXECUTE FUNCTION s10_v2_capture_guard();
CREATE TRIGGER s10_v2_capture_no_truncate BEFORE TRUNCATE ON exam_task_captures FOR EACH STATEMENT EXECUTE FUNCTION s10_v2_capture_guard();
CREATE FUNCTION s10_v2_audio_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p exam_task_progress%ROWTYPE; c exam_task_captures%ROWTYPE; BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'S10_AUDIO_VALIDATION_IMMUTABLE' USING ERRCODE='42501'; END IF;
 SELECT * INTO p FROM exam_task_progress WHERE id=NEW."progressId";SELECT * INTO c FROM exam_task_captures WHERE "progressId"=NEW."progressId";
 IF p."protocolVersion"<>2 OR NOT s10_v2_actor(p) OR NEW."sourceSha256"<>p."mediaSha256" OR (NEW.status='VALID' AND (c.phase IS DISTINCT FROM 'STOP_CONFIRMED' OR c."stopDigest"<>NEW.digest OR NOT EXISTS(SELECT 1 FROM exam_task_uploads u WHERE u."progressId"=p.id AND u.digest=NEW.digest AND u."storageKey"=NEW."storageKey" AND u.bytes=NEW.bytes))) THEN RAISE EXCEPTION 'S10_ORIGINAL_VALIDATION_AUTHORITY' USING ERRCODE='42501'; END IF;
 RETURN NEW;END $$;
CREATE TRIGGER s10_v2_audio_guard BEFORE INSERT OR UPDATE OR DELETE ON exam_task_audio_validations FOR EACH ROW EXECUTE FUNCTION s10_v2_audio_guard();
CREATE TRIGGER s10_v2_audio_no_truncate BEFORE TRUNCATE ON exam_task_audio_validations FOR EACH STATEMENT EXECUTE FUNCTION s10_v2_audio_guard();
-- Keep existing event UPDATE/DELETE guards; also deny TRUNCATE bypass.
CREATE TRIGGER s10_events_no_truncate BEFORE TRUNCATE ON exam_task_events FOR EACH STATEMENT EXECUTE FUNCTION s10_append_only_event();

CREATE FUNCTION s10_v2_answer_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p exam_task_progress%ROWTYPE; a exam_task_audio_validations%ROWTYPE; aid uuid; qid uuid; BEGIN
 aid:=CASE WHEN TG_OP='DELETE' THEN OLD."attemptId" ELSE NEW."attemptId" END;
 qid:=CASE WHEN TG_OP='DELETE' THEN OLD."testQuestionId" ELSE NEW."testQuestionId" END;
 IF EXISTS(SELECT 1 FROM test_attempts t JOIN test_questions q ON q.id=qid JOIN test_question_groups g ON g.id=q."groupId" WHERE t.id=aid AND t."s10ProtocolVersion"=2 AND g."taskCode"='SE_SW_01_S10_V01') THEN
  SELECT * INTO p FROM exam_task_progress WHERE "attemptId"=aid AND "testQuestionId"=qid ORDER BY "resetCount" DESC LIMIT 1;
  IF TG_OP='DELETE' OR p.id IS NULL OR NOT s10_v2_actor(p) THEN RAISE EXCEPTION 'S10_ANSWER_KERNEL_REQUIRED' USING ERRCODE='42501'; END IF;
  SELECT * INTO a FROM exam_task_audio_validations WHERE "progressId"=p.id;
  IF a.status IS DISTINCT FROM 'VALID' OR NEW."audioStorageKey" IS DISTINCT FROM a."storageKey" OR NEW."pointsAwarded" IS NOT NULL OR NEW."isCorrect" IS NOT NULL THEN RAISE EXCEPTION 'S10_VALID_UNGRADED_ORIGINAL_REQUIRED' USING ERRCODE='42501'; END IF;
  IF TG_OP='UPDATE' AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'S10_ORIGINAL_ANSWER_IMMUTABLE' USING ERRCODE='42501'; END IF;
 END IF; RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END; END $$;
CREATE TRIGGER s10_v2_answer_guard BEFORE INSERT OR UPDATE OR DELETE ON test_answers FOR EACH ROW EXECUTE FUNCTION s10_v2_answer_guard();
CREATE FUNCTION s10_v2_receipt_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p exam_task_progress%ROWTYPE; BEGIN
 IF TG_OP='TRUNCATE' THEN RAISE EXCEPTION 'S10_RECEIPT_HISTORY_IMMUTABLE' USING ERRCODE='42501'; END IF;
 SELECT * INTO p FROM exam_task_progress WHERE id=CASE WHEN TG_OP='DELETE' THEN OLD."progressId" ELSE NEW."progressId" END;
 IF p."protocolVersion"=2 THEN
  IF TG_OP='DELETE' OR NOT s10_v2_actor(p) THEN RAISE EXCEPTION 'S10_RECEIPT_AUTHORITY' USING ERRCODE='42501'; END IF;
  IF TG_OP='UPDATE' AND ((NEW.id,NEW."progressId",NEW."actorHash",NEW.key,NEW.fingerprint,NEW."createdAt") IS DISTINCT FROM (OLD.id,OLD."progressId",OLD."actorHash",OLD.key,OLD.fingerprint,OLD."createdAt") OR OLD.outcome->>'phase'<>'STAGED' OR NEW.outcome->>'phase'<>'SAVED' OR p.phase<>'SAVED') THEN RAISE EXCEPTION 'S10_RECEIPT_FINAL_IMMUTABLE' USING ERRCODE='42501'; END IF;
 END IF;RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END; END $$;
CREATE TRIGGER s10_v2_receipt_guard BEFORE INSERT OR UPDATE OR DELETE ON exam_task_receipts FOR EACH ROW EXECUTE FUNCTION s10_v2_receipt_guard();
CREATE TRIGGER s10_receipts_no_truncate BEFORE TRUNCATE ON exam_task_receipts FOR EACH STATEMENT EXECUTE FUNCTION s10_v2_receipt_guard();

COMMIT;
