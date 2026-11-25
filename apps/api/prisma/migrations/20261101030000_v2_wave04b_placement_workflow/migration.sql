-- CreateTable
CREATE TABLE "placement_workflow_policies" (
    "id" UUID NOT NULL,
    "kind" VARCHAR(24) NOT NULL,
    "mode" "PlacementMode" NOT NULL,
    "sourceId" UUID,
    "body" JSONB NOT NULL,
    "digest" VARCHAR(64) NOT NULL,
    "authorId" UUID NOT NULL,
    "approvedById" UUID,
    "approvedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" VARCHAR(500) NOT NULL,

    CONSTRAINT "placement_workflow_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "placement_sittings" (
    "attemptId" UUID NOT NULL,
    "policyId" UUID NOT NULL,
    "phase" VARCHAR(24) NOT NULL,
    "taskIndex" INTEGER NOT NULL DEFAULT 0,
    "phaseStartedAt" TIMESTAMPTZ(3) NOT NULL,
    "deadline" TIMESTAMPTZ(3),
    "lockVersion" INTEGER NOT NULL DEFAULT 0,
    "receipt" UUID,
    "blockedReason" VARCHAR(500),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "placement_sittings_pkey" PRIMARY KEY ("attemptId")
);

-- CreateTable
CREATE TABLE "placement_grader_assignments" (
    "id" UUID NOT NULL,
    "attemptId" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "graderId" UUID NOT NULL,
    "assignedById" UUID NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "placement_grader_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "placement_human_evaluations" (
    "id" UUID NOT NULL,
    "attemptId" UUID NOT NULL,
    "skill" VARCHAR(16) NOT NULL,
    "number" INTEGER NOT NULL,
    "rubricId" UUID,
    "assignmentId" UUID,
    "graderId" UUID,
    "body" JSONB NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "placement_human_evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "placement_result_releases" (
    "evaluationId" UUID NOT NULL,
    "publishedById" UUID NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "placement_result_releases_pkey" PRIMARY KEY ("evaluationId")
);

-- CreateTable
CREATE TABLE "placement_evidence_reads" (
    "id" UUID NOT NULL,
    "assignmentId" UUID NOT NULL,
    "questionId" UUID NOT NULL,
    "digest" VARCHAR(64) NOT NULL,
    "kind" VARCHAR(16) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "placement_evidence_reads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "placement_workflow_requests" (
    "id" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "key" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "digest" VARCHAR(64) NOT NULL,
    "response" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "placement_workflow_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "placement_task_recordings" (
    "id" UUID NOT NULL,
    "attemptId" UUID NOT NULL,
    "questionId" UUID NOT NULL,
    "state" VARCHAR(24) NOT NULL DEFAULT 'STARTED',
    "tabId" UUID NOT NULL,
    "tokenHash" VARCHAR(64) NOT NULL,
    "sessionHash" VARCHAR(64) NOT NULL,
    "startedAt" TIMESTAMPTZ(3) NOT NULL,
    "deadline" TIMESTAMPTZ(3) NOT NULL,
    "uploadDeadline" TIMESTAMPTZ(3) NOT NULL,
    "storageKey" TEXT,
    "digest" VARCHAR(64),
    "durationMs" INTEGER,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "placement_task_recordings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "placement_workflow_policies_kind_mode_createdAt_idx" ON "placement_workflow_policies"("kind", "mode", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "placement_sittings_receipt_key" ON "placement_sittings"("receipt");

-- CreateIndex
CREATE UNIQUE INDEX "placement_grader_assignments_attemptId_number_key" ON "placement_grader_assignments"("attemptId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "placement_human_evaluations_attemptId_skill_number_key" ON "placement_human_evaluations"("attemptId", "skill", "number");

-- CreateIndex
CREATE UNIQUE INDEX "placement_evidence_reads_assignmentId_questionId_digest_key" ON "placement_evidence_reads"("assignmentId", "questionId", "digest");

-- CreateIndex
CREATE UNIQUE INDEX "placement_workflow_requests_actorId_key_key" ON "placement_workflow_requests"("actorId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "placement_task_recordings_attemptId_questionId_key" ON "placement_task_recordings"("attemptId", "questionId");

-- AddForeignKey
ALTER TABLE "placement_workflow_policies" ADD CONSTRAINT "placement_workflow_policies_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "placement_source_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "placement_workflow_policies" ADD CONSTRAINT "placement_workflow_policies_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "placement_workflow_policies" ADD CONSTRAINT "placement_workflow_policies_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "placement_sittings" ADD CONSTRAINT "placement_sittings_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "test_attempts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "placement_sittings" ADD CONSTRAINT "placement_sittings_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "placement_workflow_policies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "placement_grader_assignments" ADD CONSTRAINT "placement_grader_assignments_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "test_attempts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "placement_grader_assignments" ADD CONSTRAINT "placement_grader_assignments_graderId_fkey" FOREIGN KEY ("graderId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "placement_grader_assignments" ADD CONSTRAINT "placement_grader_assignments_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "placement_human_evaluations" ADD CONSTRAINT "placement_human_evaluations_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "test_attempts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "placement_human_evaluations" ADD CONSTRAINT "placement_human_evaluations_rubricId_fkey" FOREIGN KEY ("rubricId") REFERENCES "placement_workflow_policies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "placement_human_evaluations" ADD CONSTRAINT "placement_human_evaluations_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "placement_grader_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "placement_human_evaluations" ADD CONSTRAINT "placement_human_evaluations_graderId_fkey" FOREIGN KEY ("graderId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "placement_result_releases" ADD CONSTRAINT "placement_result_releases_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "placement_human_evaluations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "placement_result_releases" ADD CONSTRAINT "placement_result_releases_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "placement_evidence_reads" ADD CONSTRAINT "placement_evidence_reads_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "placement_grader_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "placement_evidence_reads" ADD CONSTRAINT "placement_evidence_reads_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "test_questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "placement_workflow_requests" ADD CONSTRAINT "placement_workflow_requests_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "placement_task_recordings" ADD CONSTRAINT "placement_task_recordings_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "test_attempts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "placement_task_recordings" ADD CONSTRAINT "placement_task_recordings_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "test_questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION w04a_source_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE t tests; actual JSONB;
BEGIN
 PERFORM pg_advisory_xact_lock(842030);
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'W04A_SOURCE_IMMUTABLE' USING ERRCODE='23514';END IF;
 SELECT * INTO t FROM tests WHERE id=NEW."testId";
 IF t.purpose<>'PLACEMENT' OR t."placementMode" IS DISTINCT FROM NEW.mode OR t."courseId" IS NOT NULL OR t."lessonId" IS NOT NULL OR t."quizActivityId" IS NOT NULL OR t."timeLimitMinutes" IS NOT NULL THEN
 RAISE EXCEPTION 'W04A_MODE_OR_UNAPPROVED_TIMER' USING ERRCODE='23514';END IF;
 IF NEW.purpose='DEV_PREVIEW' AND (current_database()!~'^v2_wave01_dev_test_w04[ab]_[a-z0-9_]+$' OR current_user<>'wave01'
 OR shobj_description((SELECT oid FROM pg_database WHERE datname=current_database()),'pg_database') IS DISTINCT FROM 'SMART_ENGLISH_DISPOSABLE_E2E_V1') THEN
 RAISE EXCEPTION 'W04A_DEV_ONLY' USING ERRCODE='42501';END IF;
 IF NEW.snapshot->>'testId' IS DISTINCT FROM NEW."testId"::text OR NEW.snapshot->>'mode' IS DISTINCT FROM NEW.mode::text THEN
 RAISE EXCEPTION 'W04A_SNAPSHOT_IDENTITY' USING ERRCODE='23514';END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION w04a_attempt_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v placement_source_versions;role_now TEXT;owner_session_user TEXT;
BEGIN
 IF TG_OP='DELETE' THEN IF OLD."placementVersionId" IS NOT NULL THEN RAISE EXCEPTION 'W04A_RETAIN_ATTEMPT' USING ERRCODE='23514';END IF;RETURN OLD;END IF;
 IF NEW."placementVersionId" IS NULL AND (TG_OP='INSERT' OR OLD."placementVersionId" IS NULL) THEN RETURN NEW;END IF;
 PERFORM pg_advisory_xact_lock(842030);
 SELECT * INTO v FROM placement_source_versions WHERE id=NEW."placementVersionId";
 SELECT role::text INTO role_now FROM users WHERE id=NEW."learnerId" AND status='ACTIVE';
 SELECT sess->>'userId' INTO owner_session_user FROM user_sessions WHERE sid=current_setting('app.class_lms_session',true) AND expire>clock_timestamp();
 IF current_setting('app.class_lms_actor',true) IS DISTINCT FROM NEW."learnerId"::text OR owner_session_user IS DISTINCT FROM NEW."learnerId"::text OR role_now IS DISTINCT FROM 'STUDENT' THEN RAISE EXCEPTION 'W04A_OWNER_SESSION' USING ERRCODE='42501';END IF;
 IF v.id IS NULL OR v.purpose<>'DEV_PREVIEW' OR current_database()!~'^v2_wave01_dev_test_w04[ab]_[a-z0-9_]+$' OR NEW."testId"<>v."testId" OR
 (v.mode='LR' AND(NEW."placementGoalSpeaking" IS NOT NULL OR NEW."placementGoalWriting" IS NOT NULL)) OR
 (v.mode='FOUR_SKILLS' AND(NEW."placementGoalSpeaking" IS NULL OR NEW."placementGoalWriting" IS NULL OR NEW."placementGoalSpeaking" NOT BETWEEN 0 AND 200 OR NEW."placementGoalWriting" NOT BETWEEN 0 AND 200)) THEN RAISE EXCEPTION 'W04A_SOURCE_OR_GOALS' USING ERRCODE='23514';END IF;
 IF TG_OP='UPDATE' AND(OLD.status<>'IN_PROGRESS' OR NEW."placementVersionId" IS DISTINCT FROM OLD."placementVersionId" OR NEW."learnerId"<>OLD."learnerId" OR NEW."testId"<>OLD."testId" OR NEW."placementGoalScore"<>OLD."placementGoalScore" OR NEW."placementGoalSpeaking" IS DISTINCT FROM OLD."placementGoalSpeaking" OR NEW."placementGoalWriting" IS DISTINCT FROM OLD."placementGoalWriting" OR NEW."startedAt"<>OLD."startedAt" OR NEW."placementLockVersion"<>OLD."placementLockVersion"+1) THEN RAISE EXCEPTION 'W04A_ATTEMPT_IMMUTABLE_OR_STALE' USING ERRCODE='23514';END IF;
 IF EXISTS(SELECT 1 FROM unnest(NEW."placementMarked") q WHERE NOT EXISTS(SELECT 1 FROM test_questions WHERE id=q AND "testId"=NEW."testId")) THEN RAISE EXCEPTION 'W04A_FOREIGN_MARK' USING ERRCODE='23514';END IF;
 RETURN NEW;
END $$;

CREATE FUNCTION w04b_actor(cap TEXT DEFAULT NULL) RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE a UUID; r TEXT;
BEGIN
 PERFORM pg_advisory_xact_lock(842030);
 IF current_database()!~'^v2_wave01_dev_test_w04b_[a-z0-9_]+$' OR current_user<>'wave01'
 OR current_schema()<>'public' OR inet_server_port()<>55401 OR host(inet_server_addr())<>'127.0.0.1'
 OR lower(replace(current_setting('data_directory'),chr(92),'/'))<>lower('D:/KLTN_Project/smart-english-elearning-kltn/.local-storage/v2-wave01/postgres')
 OR shobj_description((SELECT oid FROM pg_database WHERE datname=current_database()),'pg_database') IS DISTINCT FROM 'SMART_ENGLISH_DISPOSABLE_E2E_V1'
 THEN RAISE EXCEPTION 'W04B_PRIVATE_DEV_ONLY' USING ERRCODE='42501';END IF;
 SELECT u.id,u.role::text INTO a,r FROM users u JOIN user_sessions s ON s.sess->>'userId'=u.id::text
 WHERE u.id::text=current_setting('app.class_lms_actor',true) AND s.sid=current_setting('app.class_lms_session',true)
 AND s.expire>clock_timestamp() AND u.status='ACTIVE' AND u.email LIKE '%@example.invalid';
 IF a IS NULL THEN RAISE EXCEPTION 'W04B_CURRENT_SESSION_REQUIRED' USING ERRCODE='42501';END IF;
 IF cap IS NOT NULL AND (r IS DISTINCT FROM CASE WHEN cap IN('placement.source.author','placement.rubric.author') THEN 'INSTRUCTOR' ELSE 'ACADEMIC_MANAGER' END
 OR NOT EXISTS(SELECT 1 FROM permission_grants g WHERE g."userId"=a AND g.capability=cap AND g."scopeType"='GLOBAL' AND g."scopeId" IS NULL
 AND g."approvedBy" IS NOT NULL AND g."approvedAt"<=clock_timestamp() AND g."effectiveAt"<=clock_timestamp() AND g."expiresAt">clock_timestamp() AND g."revokedAt" IS NULL))
 THEN RAISE EXCEPTION 'W04B_EXPLICIT_GRANT_REQUIRED' USING ERRCODE='42501';END IF;
 RETURN a;
END $$;
CREATE FUNCTION w04b_policy_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE a UUID; prefix TEXT; v placement_source_versions;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'W04B_RETAIN_POLICY' USING ERRCODE='23514';END IF;
 prefix:=CASE NEW.kind WHEN 'SOURCE_TIMING' THEN 'source' WHEN 'RUBRIC' THEN 'rubric' WHEN 'CRITERIA' THEN 'criteria' END;
 IF prefix IS NULL OR length(btrim(NEW.reason))<10 OR NEW.digest!~'^[a-f0-9]{64}$' OR jsonb_typeof(NEW.body)<>'object'
 OR (NEW.kind='CRITERIA') IS DISTINCT FROM (NEW."sourceId" IS NULL) THEN RAISE EXCEPTION 'W04B_POLICY_SHAPE' USING ERRCODE='23514';END IF;
 IF NEW."sourceId" IS NOT NULL THEN SELECT * INTO v FROM placement_source_versions WHERE id=NEW."sourceId";
 IF v.id IS NULL OR v.mode<>NEW.mode OR v.purpose<>'DEV_PREVIEW' OR v.provenance->>'synthetic' IS DISTINCT FROM 'true' OR NEW.body->>'sourceHash' IS DISTINCT FROM v."sourceHash" THEN RAISE EXCEPTION 'W04B_POLICY_SOURCE' USING ERRCODE='23514';END IF;END IF;
 IF TG_OP='INSERT' THEN a:=w04b_actor('placement.'||prefix||'.author');IF NEW."authorId"<>a OR NEW."approvedById" IS NOT NULL OR NEW."approvedAt" IS NOT NULL THEN RAISE EXCEPTION 'W04B_DRAFT_ONLY' USING ERRCODE='42501';END IF;
 ELSE a:=w04b_actor('placement.'||prefix||'.approve');
 IF OLD."approvedById" IS NOT NULL OR a=OLD."authorId" OR NEW."approvedById" IS DISTINCT FROM a OR NEW."approvedAt" IS NULL
 OR (to_jsonb(NEW)-ARRAY['approvedById','approvedAt']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['approvedById','approvedAt']) THEN RAISE EXCEPTION 'W04B_INDEPENDENT_IMMUTABLE_POLICY' USING ERRCODE='42501';END IF;
 NEW."approvedAt":=clock_timestamp();END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER w04b_policy BEFORE INSERT OR UPDATE OR DELETE ON placement_workflow_policies FOR EACH ROW EXECUTE FUNCTION w04b_policy_guard();

CREATE FUNCTION w04b_window(s placement_sittings) RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE body JSONB; source JSONB; gid TEXT; t JSONB;
BEGIN
 IF s.phase='LISTENING' THEN RETURN 2700;ELSIF s.phase='READING' THEN RETURN 4500;ELSIF s.phase='BREAK' THEN RETURN 600;END IF;
 SELECT p.body,v.snapshot INTO body,source FROM placement_workflow_policies p JOIN placement_source_versions v ON v.id=p."sourceId" WHERE p.id=s."policyId";
 SELECT g->>'id' INTO gid FROM jsonb_array_elements(source->'groups') WITH ORDINALITY x(g,n) WHERE g->>'skill'=s.phase ORDER BY n OFFSET s."taskIndex" LIMIT 1;
 SELECT q INTO t FROM jsonb_array_elements(body->'tasks')q WHERE q->>'groupId'=gid;
 IF t IS NULL THEN RAISE EXCEPTION 'W04B_APPROVED_WINDOW_MISSING' USING ERRCODE='23514';END IF;
 RETURN (t->>'preparationSeconds')::int+(t->>'playbackSeconds')::int+(t->>'responseSeconds')::int;
END $$;
CREATE FUNCTION w04b_sitting_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE a UUID; attempt test_attempts;p placement_workflow_policies;v placement_source_versions;cnt INTEGER;expected_phase TEXT;expected_index INTEGER;start_at TIMESTAMPTZ;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'W04B_RETAIN_SITTING' USING ERRCODE='23514';END IF;
 a:=w04b_actor();SELECT * INTO attempt FROM test_attempts WHERE id=NEW."attemptId";
 SELECT * INTO p FROM placement_workflow_policies WHERE id=NEW."policyId";SELECT * INTO v FROM placement_source_versions WHERE id=attempt."placementVersionId";
 IF attempt."learnerId"<>a OR NOT EXISTS(SELECT 1 FROM users WHERE id=a AND role='STUDENT') OR p.kind<>'SOURCE_TIMING' OR p."sourceId" IS DISTINCT FROM v.id OR p."approvedById" IS NULL THEN RAISE EXCEPTION 'W04B_OWNER_TIMING_REQUIRED' USING ERRCODE='42501';END IF;
 IF TG_OP='INSERT' THEN
 IF NEW.phase<>'LISTENING' OR NEW."taskIndex"<>0 OR NEW."lockVersion"<>0 OR NEW.receipt IS NOT NULL OR attempt.status<>'IN_PROGRESS' THEN RAISE EXCEPTION 'W04B_START_SHAPE' USING ERRCODE='23514';END IF;
 NEW."phaseStartedAt":=clock_timestamp();NEW.deadline:=NEW."phaseStartedAt"+interval '45 minutes';RETURN NEW;END IF;
 IF OLD.phase IN('SUBMITTED','BLOCKED_REVIEW') OR NEW."attemptId"<>OLD."attemptId" OR NEW."policyId"<>OLD."policyId" OR NEW."createdAt"<>OLD."createdAt" OR NEW."lockVersion"<>OLD."lockVersion"+1 THEN RAISE EXCEPTION 'W04B_TERMINAL_OR_CAS' USING ERRCODE='23514';END IF;
 IF NEW.phase='BLOCKED_REVIEW' THEN IF length(btrim(NEW."blockedReason"))<10 OR NEW.deadline IS NOT NULL OR NEW.receipt IS NOT NULL THEN RAISE EXCEPTION 'W04B_INCIDENT_EVIDENCE' USING ERRCODE='23514';END IF;RETURN NEW;END IF;
 IF NEW.phase=OLD.phase AND NEW."taskIndex"=OLD."taskIndex" THEN
 IF NEW."phaseStartedAt"<>OLD."phaseStartedAt" OR NEW.deadline IS DISTINCT FROM OLD.deadline OR NEW.receipt IS DISTINCT FROM OLD.receipt OR clock_timestamp()>=OLD.deadline THEN RAISE EXCEPTION 'W04B_NO_PAUSE_OR_EXTENSION' USING ERRCODE='23514';END IF;RETURN NEW;END IF;
 expected_index:=0;
 IF OLD.phase='LISTENING' THEN expected_phase:='READING';
 ELSIF OLD.phase='READING' THEN expected_phase:=CASE WHEN v.mode='LR' THEN 'SUBMITTED' WHEN NEW.phase='BREAK' THEN 'BREAK' ELSE 'SPEAKING' END;
 ELSIF OLD.phase='BREAK' THEN expected_phase:='SPEAKING';
 ELSE SELECT count(*) INTO cnt FROM jsonb_array_elements(v.snapshot->'groups')g WHERE g->>'skill'=OLD.phase;
 IF OLD."taskIndex"+1<cnt THEN expected_phase:=OLD.phase;expected_index:=OLD."taskIndex"+1;
 ELSE expected_phase:=CASE OLD.phase WHEN 'SPEAKING' THEN 'WRITING' ELSE 'SUBMITTED' END;END IF;END IF;
 IF NEW.phase IS DISTINCT FROM expected_phase OR NEW."taskIndex"<>expected_index THEN RAISE EXCEPTION 'W04B_SEQUENCE' USING ERRCODE='23514';END IF;
 IF NEW.phase='SUBMITTED' THEN IF NEW.receipt IS NULL OR NEW.receipt IS DISTINCT FROM attempt."placementReceipt" OR attempt.status<>'SUBMITTED' OR NEW.deadline IS NOT NULL THEN RAISE EXCEPTION 'W04B_RECEIPT_REQUIRED' USING ERRCODE='23514';END IF;
 ELSE start_at:=CASE WHEN clock_timestamp()>=OLD.deadline THEN OLD.deadline ELSE NEW."phaseStartedAt" END;
 IF abs(extract(epoch FROM (NEW."phaseStartedAt"-start_at)))>0.1 OR NEW."phaseStartedAt">clock_timestamp() OR (clock_timestamp()<OLD.deadline AND abs(extract(epoch FROM(clock_timestamp()-NEW."phaseStartedAt")))>5) THEN RAISE EXCEPTION 'W04B_ORIGINAL_CLOCK' USING ERRCODE='23514';END IF;
 NEW.deadline:=NEW."phaseStartedAt"+make_interval(secs=>w04b_window(NEW));IF NEW.deadline<=clock_timestamp() THEN RAISE EXCEPTION 'W04B_ELAPSED_WINDOW' USING ERRCODE='23514';END IF;END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER w04b_sitting BEFORE INSERT OR UPDATE OR DELETE ON placement_sittings FOR EACH ROW EXECUTE FUNCTION w04b_sitting_guard();

CREATE FUNCTION w04b_assignment_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE a UUID;n INT;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'W04B_ASSIGNMENT_APPEND_ONLY' USING ERRCODE='23514';END IF;a:=w04b_actor('placement.grader.assign');
 SELECT coalesce(max(number),0)+1 INTO n FROM placement_grader_assignments WHERE "attemptId"=NEW."attemptId";
 IF NEW.number<>n OR NEW."assignedById"<>a OR a=NEW."graderId" OR length(btrim(NEW.reason))<10 OR NOT EXISTS(SELECT 1 FROM users WHERE id=NEW."graderId" AND role='INSTRUCTOR' AND status='ACTIVE')
 OR NOT EXISTS(SELECT 1 FROM placement_sittings s JOIN test_attempts t ON t.id=s."attemptId" JOIN placement_source_versions v ON v.id=t."placementVersionId" WHERE s."attemptId"=NEW."attemptId" AND s.phase='SUBMITTED' AND v.mode='FOUR_SKILLS') THEN RAISE EXCEPTION 'W04B_ELIGIBLE_ASSIGNMENT' USING ERRCODE='42501';END IF;RETURN NEW;
END $$;
CREATE TRIGGER w04b_assignment BEFORE INSERT OR UPDATE OR DELETE ON placement_grader_assignments FOR EACH ROW EXECUTE FUNCTION w04b_assignment_guard();
CREATE FUNCTION w04b_append_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE a UUID;g placement_grader_assignments;e placement_human_evaluations;t test_attempts;p placement_workflow_policies;n INT;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'W04B_EVIDENCE_APPEND_ONLY' USING ERRCODE='23514';END IF;a:=w04b_actor();
 IF TG_TABLE_NAME='placement_workflow_requests' THEN IF NEW."actorId"<>a THEN RAISE EXCEPTION 'W04B_REQUEST_OWNER' USING ERRCODE='42501';END IF;RETURN NEW;END IF;
 IF TG_TABLE_NAME='placement_evidence_reads' THEN SELECT * INTO g FROM placement_grader_assignments WHERE id=NEW."assignmentId";
 IF g."graderId" IS DISTINCT FROM a OR g.number<>(SELECT max(number) FROM placement_grader_assignments WHERE "attemptId"=g."attemptId") OR NOT EXISTS(SELECT 1 FROM users WHERE id=a AND role='INSTRUCTOR') OR NOT EXISTS(SELECT 1 FROM test_questions q JOIN test_attempts owner_attempt ON owner_attempt."testId"=q."testId" WHERE owner_attempt.id=g."attemptId" AND q.id=NEW."questionId") THEN RAISE EXCEPTION 'W04B_CURRENT_ASSIGNED_GRADER' USING ERRCODE='42501';END IF;RETURN NEW;END IF;
 IF TG_TABLE_NAME='placement_task_recordings' THEN SELECT * INTO t FROM test_attempts WHERE id=NEW."attemptId";
 IF t."learnerId" IS DISTINCT FROM a OR NOT EXISTS(SELECT 1 FROM placement_sittings s JOIN test_questions q ON q."testId"=t."testId" JOIN test_question_groups grp ON grp.id=q."groupId" WHERE s."attemptId"=t.id AND s.phase='SPEAKING' AND s.deadline>clock_timestamp() AND q.id=NEW."questionId" AND grp."taskCode" IS DISTINCT FROM 'SE_SW_01_S10_V01') THEN RAISE EXCEPTION 'W04B_ORIGINAL_RECORDING_WINDOW' USING ERRCODE='42501';END IF;RETURN NEW;END IF;
 IF TG_TABLE_NAME='placement_human_evaluations' THEN
 SELECT * INTO t FROM test_attempts WHERE id=NEW."attemptId";
 IF NOT EXISTS(SELECT 1 FROM placement_sittings WHERE "attemptId"=t.id AND phase='SUBMITTED') THEN RAISE EXCEPTION 'W04B_SUBMITTED_REQUIRED' USING ERRCODE='23514';END IF;
 SELECT coalesce(max(number),0)+1 INTO n FROM placement_human_evaluations WHERE "attemptId"=t.id AND skill=NEW.skill;
 IF NEW.number<>n OR NEW.skill NOT IN('LR','SPEAKING','WRITING') OR length(btrim(NEW.reason))<10 THEN RAISE EXCEPTION 'W04B_EVALUATION_VERSION' USING ERRCODE='23514';END IF;
 IF NEW.skill='LR' THEN IF a<>t."learnerId" OR NEW."graderId" IS NOT NULL OR NEW."rubricId" IS NOT NULL OR NEW."assignmentId" IS NOT NULL OR NEW.body->>'state'<>'OBJECTIVE_VERIFIED_DEV' THEN RAISE EXCEPTION 'W04B_OBJECTIVE_ONLY' USING ERRCODE='42501';END IF;
 ELSE SELECT * INTO g FROM placement_grader_assignments WHERE id=NEW."assignmentId";SELECT * INTO p FROM placement_workflow_policies WHERE id=NEW."rubricId";
 IF g."attemptId" IS DISTINCT FROM t.id OR g."graderId" IS DISTINCT FROM a OR NEW."graderId" IS DISTINCT FROM a OR g.number<>(SELECT max(number) FROM placement_grader_assignments WHERE "attemptId"=t.id) OR NOT EXISTS(SELECT 1 FROM users WHERE id=a AND role='INSTRUCTOR' AND status='ACTIVE') OR p.kind IS DISTINCT FROM 'RUBRIC' OR p."approvedById" IS NULL OR p."sourceId" IS DISTINCT FROM t."placementVersionId" OR NEW.body->>'state' IS DISTINCT FROM 'REVIEWED_FINAL' OR NEW.body->>'originalEvidenceReviewed' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'W04B_HUMAN_RUBRIC_REQUIRED' USING ERRCODE='42501';END IF;END IF;RETURN NEW;
 END IF;
 IF TG_TABLE_NAME='placement_result_releases' THEN a:=w04b_actor('placement.result.publish');SELECT * INTO e FROM placement_human_evaluations WHERE id=NEW."evaluationId";SELECT * INTO t FROM test_attempts WHERE id=e."attemptId";
 SELECT p0.* INTO p FROM placement_workflow_policies p0 JOIN placement_sittings s ON s."policyId"=p0.id WHERE s."attemptId"=t.id;
 IF NEW."publishedById"<>a OR a=coalesce(e."graderId",t."learnerId") OR a=p."authorId" OR e.number<>(SELECT max(number) FROM placement_human_evaluations WHERE "attemptId"=t.id AND skill=e.skill) OR length(btrim(NEW.reason))<10 THEN RAISE EXCEPTION 'W04B_INDEPENDENT_LATEST_RELEASE' USING ERRCODE='42501';END IF;RETURN NEW;
 END IF;
 RAISE EXCEPTION 'W04B_UNKNOWN_MUTATION' USING ERRCODE='42501';
END $$;
CREATE TRIGGER w04b_request BEFORE INSERT OR UPDATE OR DELETE ON placement_workflow_requests FOR EACH ROW EXECUTE FUNCTION w04b_append_guard();
CREATE TRIGGER w04b_evidence BEFORE INSERT OR UPDATE OR DELETE ON placement_evidence_reads FOR EACH ROW EXECUTE FUNCTION w04b_append_guard();

CREATE TRIGGER w04b_evaluation BEFORE INSERT OR UPDATE OR DELETE ON placement_human_evaluations FOR EACH ROW EXECUTE FUNCTION w04b_append_guard();
CREATE TRIGGER w04b_release BEFORE INSERT OR UPDATE OR DELETE ON placement_result_releases FOR EACH ROW EXECUTE FUNCTION w04b_append_guard();

CREATE OR REPLACE FUNCTION w04a_answer_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE a test_attempts;owner_session_user TEXT;q test_questions;
BEGIN
 SELECT * INTO a FROM test_attempts WHERE id=CASE WHEN TG_OP='INSERT' THEN NEW."attemptId" ELSE OLD."attemptId" END;
 IF a."placementVersionId" IS NULL THEN IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;END IF;
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'W04A_RETAIN_ANSWER' USING ERRCODE='23514';END IF;
 SELECT sess->>'userId' INTO owner_session_user FROM user_sessions WHERE sid=current_setting('app.class_lms_session',true) AND expire>=clock_timestamp();
 SELECT * INTO q FROM test_questions WHERE id=NEW."testQuestionId";
 IF a.status<>'IN_PROGRESS' OR current_setting('app.class_lms_actor',true) IS DISTINCT FROM a."learnerId"::text OR owner_session_user IS DISTINCT FROM a."learnerId"::text OR q."testId" IS DISTINCT FROM a."testId" OR NEW."attemptId"<>a.id OR NEW."isCorrect" IS NOT NULL OR NEW."pointsAwarded" IS NOT NULL THEN RAISE EXCEPTION 'W04A_PREVIEW_ANSWER_BOUNDARY' USING ERRCODE='42501';END IF;
 IF TG_OP='UPDATE' AND(NEW."attemptId"<>OLD."attemptId" OR NEW."testQuestionId"<>OLD."testQuestionId") THEN RAISE EXCEPTION 'W04A_IMMUTABLE_ANSWER_IDENTITY' USING ERRCODE='23514';END IF;
 IF EXISTS(SELECT 1 FROM placement_sittings WHERE "attemptId"=a.id) AND NOT EXISTS(
 SELECT 1 FROM placement_sittings s JOIN test_question_groups g ON g.id=q."groupId" JOIN placement_workflow_policies p ON p.id=s."policyId" JOIN placement_source_versions v ON v.id=p."sourceId"
 WHERE s."attemptId"=a.id AND (s.deadline>clock_timestamp() OR EXISTS(SELECT 1 FROM placement_task_recordings recording WHERE recording."attemptId"=a.id AND recording."questionId"=NEW."testQuestionId" AND recording.state='SAVED' AND recording."uploadDeadline">=clock_timestamp() AND recording."tokenHash"=encode(sha256(convert_to(current_setting('app.placement_recording_token',true),'UTF8')),'hex'))) AND s.phase=g.skill::text AND
 (s.phase IN('LISTENING','READING') OR g.id::text=(SELECT x->>'id' FROM jsonb_array_elements(v.snapshot->'groups') WITH ORDINALITY z(x,n) WHERE x->>'skill'=s.phase ORDER BY n OFFSET s."taskIndex" LIMIT 1)))
 THEN RAISE EXCEPTION 'W04B_CURRENT_ANSWER_WINDOW' USING ERRCODE='42501';END IF;
 RETURN NEW;
END $$;

-- Criterion/receipt/source verification independent of the HTTP projection.
CREATE FUNCTION w04b_evaluation_evidence_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE t test_attempts;v placement_source_versions;p placement_workflow_policies;g JSONB;q JSONB;task JSONB;c JSONB;item JSONB;ans test_answers;hash TEXT;n INTEGER;correct INTEGER;arr JSONB:='[]';total NUMERIC:=0;maximum NUMERIC:=0;samples INTEGER:=0;expected_tasks INTEGER:=0;
BEGIN
 SELECT * INTO t FROM test_attempts WHERE id=NEW."attemptId";SELECT * INTO v FROM placement_source_versions WHERE id=t."placementVersionId";
 IF NEW.body->>'sourceHash' IS DISTINCT FROM v."sourceHash" THEN RAISE EXCEPTION 'W04B_RESULT_SOURCE_HASH' USING ERRCODE='23514';END IF;
 IF NEW.skill='LR' THEN
 FOR g IN SELECT x FROM jsonb_array_elements(v.snapshot->'groups')x WHERE x->>'skill' IN('LISTENING','READING') LOOP
 n:=0;correct:=0;
 FOR q IN SELECT x FROM jsonb_array_elements(g->'questions')x LOOP
 n:=n+1;SELECT * INTO ans FROM test_answers WHERE "attemptId"=t.id AND "testQuestionId"=(q->>'id')::uuid;
 IF cardinality(ans."selectedOptionIds")=1 AND ans."selectedOptionIds"[1]::text=(SELECT o->>'id' FROM jsonb_array_elements(q->'options')o WHERE (o->>'isCorrect')::boolean LIMIT 1) THEN correct:=correct+1;END IF;
 END LOOP;
 arr:=arr||jsonb_build_array(jsonb_build_object('skill',g->>'skill','part',g->>'taskCode','samples',n,'correct',correct));
 END LOOP;
 IF NEW.body->'parts' IS DISTINCT FROM arr THEN RAISE EXCEPTION 'W04B_OBJECTIVE_COUNTS' USING ERRCODE='23514';END IF;RETURN NEW;
 END IF;
 SELECT * INTO p FROM placement_workflow_policies WHERE id=NEW."rubricId";
 IF NEW.body->>'scale' IS DISTINCT FROM p.body->>'scale' OR jsonb_typeof(NEW.body->'scores') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'W04B_RUBRIC_SCALE' USING ERRCODE='23514';END IF;
 FOR g IN SELECT x FROM jsonb_array_elements(v.snapshot->'groups')x WHERE x->>'skill'=NEW.skill LOOP
 expected_tasks:=expected_tasks+1;
 SELECT x INTO task FROM jsonb_array_elements(p.body->'tasks')x WHERE x->>'groupId'=g->>'id';
 IF task IS NULL OR jsonb_typeof(NEW.body->'scores'->(g->>'id')) IS DISTINCT FROM 'array' OR jsonb_array_length(NEW.body->'scores'->(g->>'id'))<>jsonb_array_length(task->'criteria') THEN RAISE EXCEPTION 'W04B_TASK_CRITERIA' USING ERRCODE='23514';END IF;
 FOR c IN SELECT x FROM jsonb_array_elements(task->'criteria')x LOOP
 SELECT count(*),min(x::text)::jsonb INTO n,item FROM jsonb_array_elements(NEW.body->'scores'->(g->>'id'))x WHERE x->>'code'=c->>'code';
 IF n<>1 OR jsonb_typeof(item->'score') IS DISTINCT FROM 'number' OR (item->>'score')::numeric<0 OR (item->>'score')::numeric>(c->>'max')::numeric OR coalesce(length(btrim(item->>'evidence')),0)<10 OR coalesce(length(btrim(item->>'feedback')),0)<10 THEN RAISE EXCEPTION 'W04B_CRITERION_BOUNDS_AND_EVIDENCE' USING ERRCODE='23514';END IF;
 total:=total+(item->>'score')::numeric;maximum:=maximum+(c->>'max')::numeric;
 END LOOP;
 FOR q IN SELECT x FROM jsonb_array_elements(g->'questions')x LOOP
 samples:=samples+1;SELECT * INTO ans FROM test_answers WHERE "attemptId"=t.id AND "testQuestionId"=(q->>'id')::uuid;
 IF NEW.skill='WRITING' THEN hash:=encode(sha256(convert_to(coalesce(ans."textResponse",''),'UTF8')),'hex');
 ELSE SELECT digest INTO hash FROM placement_task_recordings WHERE "attemptId"=t.id AND "questionId"=(q->>'id')::uuid;
 IF hash IS NULL THEN SELECT digest INTO hash FROM exam_task_uploads WHERE "storageKey"=ans."audioStorageKey" AND status='COMMITTED';END IF;END IF;
 IF hash IS NULL OR NOT EXISTS(SELECT 1 FROM placement_evidence_reads WHERE "assignmentId"=NEW."assignmentId" AND "questionId"=(q->>'id')::uuid AND digest=hash) THEN RAISE EXCEPTION 'W04B_ORIGINAL_EVIDENCE_REQUIRED' USING ERRCODE='42501';END IF;
 END LOOP;
 END LOOP;
 IF (SELECT count(*) FROM jsonb_object_keys(NEW.body->'scores'))<>expected_tasks OR (NEW.body->>'total')::numeric IS DISTINCT FROM total OR (NEW.body->>'max')::numeric IS DISTINCT FROM maximum OR (NEW.body->>'samples')::int IS DISTINCT FROM samples THEN RAISE EXCEPTION 'W04B_CRITERION_TOTAL' USING ERRCODE='23514';END IF;RETURN NEW;
END $$;
CREATE TRIGGER w04b_evaluation_evidence BEFORE INSERT ON placement_human_evaluations FOR EACH ROW EXECUTE FUNCTION w04b_evaluation_evidence_guard();
CREATE FUNCTION w04b_release_eligibility_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE e placement_human_evaluations;
BEGIN
 SELECT * INTO e FROM placement_human_evaluations WHERE id=NEW."evaluationId";
 IF e."assignmentId" IS NOT NULL AND (e."assignmentId" IS DISTINCT FROM (SELECT id FROM placement_grader_assignments WHERE "attemptId"=e."attemptId" ORDER BY number DESC LIMIT 1) OR NOT EXISTS(SELECT 1 FROM users WHERE id=e."graderId" AND role='INSTRUCTOR' AND status='ACTIVE')) THEN RAISE EXCEPTION 'W04B_CURRENT_GRADER_RECONFIRM' USING ERRCODE='42501';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER w04b_release_eligibility BEFORE INSERT ON placement_result_releases FOR EACH ROW EXECUTE FUNCTION w04b_release_eligibility_guard();

-- Generic Speaking captures have one durable start receipt; S10 retains its existing epoch protocol.
ALTER TABLE placement_task_recordings ADD CONSTRAINT w04b_recording_shape CHECK (
 (state='STARTED' AND "storageKey" IS NULL AND digest IS NULL AND "durationMs" IS NULL) OR
 (state='SAVED' AND "storageKey" IS NOT NULL AND digest IS NOT NULL AND digest ~ '^[a-f0-9]{64}$' AND "durationMs" IS NOT NULL AND "durationMs">0));
CREATE FUNCTION w04b_recording_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE actor_id UUID; own test_attempts; sitting placement_sittings; source JSONB; policy JSONB; group_id TEXT; task JSONB;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'W04B_RETAIN_ORIGINAL_RECORDING' USING ERRCODE='23514';END IF;
 actor_id:=w04b_actor();SELECT * INTO own FROM test_attempts WHERE id=NEW."attemptId";SELECT * INTO sitting FROM placement_sittings WHERE "attemptId"=own.id;
 SELECT v.snapshot,p.body INTO source,policy FROM placement_source_versions v JOIN placement_workflow_policies p ON p."sourceId"=v.id WHERE p.id=sitting."policyId";
 SELECT g->>'id' INTO group_id FROM jsonb_array_elements(source->'groups') WITH ORDINALITY x(g,n) WHERE g->>'skill'='SPEAKING' ORDER BY n OFFSET sitting."taskIndex" LIMIT 1;
 SELECT x INTO task FROM jsonb_array_elements(policy->'tasks')x WHERE x->>'groupId'=group_id;
 IF actor_id IS DISTINCT FROM own."learnerId" OR NOT EXISTS(SELECT 1 FROM users WHERE id=actor_id AND role='STUDENT' AND status='ACTIVE') OR sitting.phase IS DISTINCT FROM 'SPEAKING' OR own.status<>'IN_PROGRESS'
 OR NOT EXISTS(SELECT 1 FROM test_questions q JOIN test_question_groups g ON g.id=q."groupId" WHERE q.id=NEW."questionId" AND q."testId"=own."testId" AND g.id::text=group_id AND g."taskCode" IS DISTINCT FROM 'SE_SW_01_S10_V01')
 OR NEW."sessionHash" IS DISTINCT FROM encode(sha256(convert_to(current_setting('app.class_lms_session',true),'UTF8')),'hex')
 OR NEW."tokenHash" IS DISTINCT FROM encode(sha256(convert_to(current_setting('app.placement_recording_token',true),'UTF8')),'hex') THEN RAISE EXCEPTION 'W04B_CURRENT_RECORDING_RECEIPT' USING ERRCODE='42501';END IF;
 IF TG_OP='INSERT' THEN
 IF NEW.state<>'STARTED' OR sitting.deadline<=clock_timestamp() OR clock_timestamp()<sitting."phaseStartedAt"+make_interval(secs=>(task->>'preparationSeconds')::int+(task->>'playbackSeconds')::int) OR task->>'uploadSeconds' IS NULL OR (task->>'uploadSeconds')::int NOT BETWEEN 0 AND 120 OR abs(extract(epoch FROM(clock_timestamp()-NEW."startedAt")))>5 THEN RAISE EXCEPTION 'W04B_CAPTURE_START_ONCE' USING ERRCODE='23514';END IF;
 NEW.deadline:=least(sitting.deadline,NEW."startedAt"+make_interval(secs=>(task->>'responseSeconds')::int));
 NEW."uploadDeadline":=sitting.deadline+make_interval(secs=>(task->>'uploadSeconds')::int);
 ELSE
 IF OLD.state<>'STARTED' OR NEW.state<>'SAVED' OR (to_jsonb(NEW)-ARRAY['state','storageKey','digest','durationMs']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','storageKey','digest','durationMs']) OR clock_timestamp()>OLD."uploadDeadline" OR NEW."durationMs">extract(epoch FROM(OLD.deadline-OLD."startedAt"))*1000 OR NEW."storageKey"<>own."learnerId"::text||'/'||own.id::text||'/'||NEW."questionId"::text||'/'||NEW.id::text||'.wav' THEN RAISE EXCEPTION 'W04B_IMMUTABLE_CAPTURE_COMMIT' USING ERRCODE='23514';END IF;
 END IF;RETURN NEW;
END $$;
CREATE TRIGGER w04b_recording BEFORE INSERT OR UPDATE OR DELETE ON placement_task_recordings FOR EACH ROW EXECUTE FUNCTION w04b_recording_guard();
