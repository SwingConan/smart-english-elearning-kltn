-- Two specialized ACADEMIC_MANAGER tracks:
-- 1) Quản lý Đào tạo (programs, classes, rooms, schedules, instructors, Meet/schedule exceptions, inspection, 1:1 consultations)
-- 2) Quản lý Học vụ Học viên (placement, completion policies & certificates, TOEIC knowledge library, CSKH support referrals/topics, admissions)
-- Removes cross-HVU ("2 HVU duyệt chéo") locks while preserving audit trails and role boundaries (GV/TV/TT -> HVU).

BEGIN;

ALTER TABLE course_versions DROP CONSTRAINT IF EXISTS version_independent;
ALTER TABLE class_instructor_assignments DROP CONSTRAINT IF EXISTS assignment_independent;
ALTER TABLE teaching_sessions DROP CONSTRAINT IF EXISTS session_independent;
ALTER TABLE w09_completion_policies DROP CONSTRAINT IF EXISTS w09_completion_policies_check;
ALTER TABLE w09_certificates DROP CONSTRAINT IF EXISTS w09_certificates_check;

CREATE OR REPLACE FUNCTION public.v2_academic_history_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
  IF TG_OP<>'UPDATE' OR OLD.state<>'PENDING_APPROVAL' OR NEW."approvedBy" IS NULL THEN
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
END $function$;

CREATE OR REPLACE FUNCTION public.w03bd_actor(cap text)
 RETURNS uuid
 LANGUAGE plpgsql
AS $function$
DECLARE a UUID;
BEGIN
 PERFORM pg_advisory_xact_lock(842030);
 a:=w03_actor();
 IF cap NOT IN ('knowledge.author','knowledge.review','knowledge.publish') OR NOT EXISTS(
   SELECT 1 FROM users u JOIN permission_grants g ON g."userId"=u.id
   WHERE u.id=a AND u.status='ACTIVE'
   AND ((cap='knowledge.author' AND u.role::text IN ('INSTRUCTOR','ACADEMIC_MANAGER')) OR (cap IN ('knowledge.review','knowledge.publish') AND u.role::text='ACADEMIC_MANAGER'))
   AND g.capability=cap
   AND g."scopeType"='GLOBAL' AND g."scopeId" IS NULL AND g."approvedBy" IS NOT NULL
   AND g."approvedAt"<=timezone('UTC',clock_timestamp()) AND g."effectiveAt"<=timezone('UTC',clock_timestamp())
   AND g."expiresAt">timezone('UTC',clock_timestamp()) AND g."revokedAt" IS NULL
 ) THEN RAISE EXCEPTION 'W03BD_CAPABILITY_REQUIRED' USING ERRCODE='42501'; END IF;
 RETURN a;
END $function$;

CREATE OR REPLACE FUNCTION public.w03bd_revision_guard()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE a UUID;e knowledge_entries; previous_state TEXT; prior_makers UUID[];
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'W03BD_RETAIN_REVISION' USING ERRCODE='23514';END IF;
 SELECT * INTO e FROM knowledge_entries WHERE id=NEW."entryId";
 IF TG_OP='INSERT' THEN
  a:=w03bd_actor('knowledge.author');
  SELECT state,"makerIds" INTO previous_state,prior_makers FROM knowledge_revisions WHERE "entryId"=e.id ORDER BY number DESC LIMIT 1;
  IF NEW."createdById"<>a OR NEW.state<>'DRAFT' OR NEW."lockVersion"<>0 OR NEW.number<>e."latestNumber"+1 OR (previous_state IS NOT NULL AND previous_state<>'PUBLISHED') THEN
   RAISE EXCEPTION 'W03BD_REVISION_START' USING ERRCODE='23514';
  END IF;
  NEW."makerIds":=ARRAY(SELECT DISTINCT unnest(coalesce(prior_makers,'{}')||a));
 ELSE
  IF OLD.state='PUBLISHED' OR (NEW.id,NEW."entryId",NEW.number,NEW."createdById",NEW."createdAt") IS DISTINCT FROM (OLD.id,OLD."entryId",OLD.number,OLD."createdById",OLD."createdAt") OR NEW."lockVersion"<>OLD."lockVersion"+1 THEN
   RAISE EXCEPTION 'W03BD_FROZEN_OR_CAS' USING ERRCODE='23514';
  END IF;
  IF OLD.state IN ('DRAFT','REJECTED') AND NEW.state IN ('DRAFT','SUBMITTED') THEN
   a:=w03bd_actor('knowledge.author');
   NEW."makerIds":=ARRAY(SELECT DISTINCT unnest(OLD."makerIds"||a));
   NEW."reviewedById":=NULL; NEW."reviewedAt":=NULL; NEW."sourceHash":=NULL;
  ELSE
   IF (to_jsonb(NEW)-ARRAY['state','reviewReason','reviewedById','reviewedAt','publishedById','publishedAt','sourceHash','lockVersion','updatedAt']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','reviewReason','reviewedById','reviewedAt','publishedById','publishedAt','sourceHash','lockVersion','updatedAt']) THEN
    RAISE EXCEPTION 'W03BD_REVIEW_SAVED_ONLY' USING ERRCODE='23514';
   END IF;
   IF OLD.state='SUBMITTED' AND NEW.state IN ('REVIEWED','REJECTED') OR OLD.state='REVIEWED' AND NEW.state='REJECTED' THEN
    a:=w03bd_actor('knowledge.review');
    IF length(btrim(NEW."reviewReason"))<10 THEN RAISE EXCEPTION 'W03BD_INDEPENDENT_REVIEW_REQUIRED' USING ERRCODE='42501'; END IF;
    IF NEW.state='REVIEWED' THEN NEW."reviewedById":=a; NEW."reviewedAt":=clock_timestamp(); NEW."sourceHash":=w03bd_revision_hash(OLD.id); END IF;
   ELSIF OLD.state='REVIEWED' AND NEW.state='PUBLISHED' THEN
    a:=w03bd_actor('knowledge.publish');
    IF NEW."publishedById" IS DISTINCT FROM a OR NEW."sourceHash" IS DISTINCT FROM w03bd_revision_hash(OLD.id) THEN
     RAISE EXCEPTION 'W03BD_INDEPENDENT_PUBLISH_REQUIRED' USING ERRCODE='42501';
    END IF;
    NEW."publishedAt":=clock_timestamp();
   ELSE RAISE EXCEPTION 'W03BD_TRANSITION' USING ERRCODE='23514'; END IF;
  END IF;
 END IF;
 IF NEW.state IN ('SUBMITTED','REVIEWED','PUBLISHED') THEN
  IF e.kind='TAG' THEN
   IF cardinality(NEW.skills)=0 OR NEW.part IS NULL OR NEW.part NOT BETWEEN 1 AND 7 THEN RAISE EXCEPTION 'W03BD_TYPED_TAG_REQUIRED' USING ERRCODE='23514'; END IF;
  ELSE
   IF cardinality(NEW.objectives)=0 OR length(btrim(NEW."bodyMarkdown"))<100 OR jsonb_array_length(NEW.examples)<1 OR jsonb_array_length(NEW.practice)<3 OR NOT EXISTS(SELECT 1 FROM knowledge_revision_tags WHERE "articleRevisionId"=NEW.id)
    OR NOT coalesce(NEW.rights->>'kind' IN ('ORIGINAL','LICENSED'),false) OR length(btrim(coalesce(NEW.rights->>'owner','')))<3 OR length(btrim(coalesce(NEW.rights->>'proof','')))<20 OR coalesce(NEW.rights->>'license','') NOT IN ('ORIGINAL_TEXT','CC_BY','CC0','PERMISSION')
    OR EXISTS(SELECT 1 FROM knowledge_revision_tags WHERE "articleRevisionId"=NEW.id AND NOT w03bd_live("tagRevisionId",true)) THEN
    RAISE EXCEPTION 'W03BD_CONTENT_RIGHTS_OR_TAGS_INCOMPLETE' USING ERRCODE='23514';
   END IF;
  END IF;
 END IF;
 NEW."updatedAt":=clock_timestamp();
 RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.w04b_policy_guard()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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
 IF OLD."approvedById" IS NOT NULL OR NEW."approvedById" IS DISTINCT FROM a OR NEW."approvedAt" IS NULL
 OR (to_jsonb(NEW)-ARRAY['approvedById','approvedAt']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['approvedById','approvedAt']) THEN RAISE EXCEPTION 'W04B_INDEPENDENT_IMMUTABLE_POLICY' USING ERRCODE='42501';END IF;
 NEW."approvedAt":=clock_timestamp();END IF;
 RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.w04b_append_guard()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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
 IF NEW.skill='LR' THEN IF a<>t."learnerId" OR NEW."graderId" IS NOT NULL OR NEW."rubricId" IS NOT NULL OR NEW."assignmentId" IS NOT NULL OR (NEW.body->>'state' IS DISTINCT FROM 'OBJECTIVE_VERIFIED_DEV' AND
        (NEW.body->>'state' IS DISTINCT FROM 'INTERNAL_OBJECTIVE_SCORED' OR
         current_setting('app.placement_internal_release',true) IS DISTINCT FROM 'PO_INTERNAL_20261113' OR NOT EXISTS(
           SELECT 1 FROM placement_internal_releases r WHERE r."sourceId"=t."placementVersionId" AND r."decisionId"='PO_INTERNAL_20261113' AND r.active=true))) THEN RAISE EXCEPTION 'W04B_OBJECTIVE_ONLY' USING ERRCODE='42501';END IF;
 ELSE SELECT * INTO g FROM placement_grader_assignments WHERE id=NEW."assignmentId";SELECT * INTO p FROM placement_workflow_policies WHERE id=NEW."rubricId";
 IF g."attemptId" IS DISTINCT FROM t.id OR g."graderId" IS DISTINCT FROM a OR NEW."graderId" IS DISTINCT FROM a OR g.number<>(SELECT max(number) FROM placement_grader_assignments WHERE "attemptId"=t.id) OR NOT EXISTS(SELECT 1 FROM users WHERE id=a AND role='INSTRUCTOR' AND status='ACTIVE') OR p.kind IS DISTINCT FROM 'RUBRIC' OR p."approvedById" IS NULL OR p."sourceId" IS DISTINCT FROM t."placementVersionId" OR NEW.body->>'state' IS DISTINCT FROM 'REVIEWED_FINAL' OR NEW.body->>'originalEvidenceReviewed' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'W04B_HUMAN_RUBRIC_REQUIRED' USING ERRCODE='42501';END IF;END IF;RETURN NEW;
 END IF;
 IF TG_TABLE_NAME='placement_result_releases' THEN a:=w04b_actor('placement.result.publish');SELECT * INTO e FROM placement_human_evaluations WHERE id=NEW."evaluationId";SELECT * INTO t FROM test_attempts WHERE id=e."attemptId";
 SELECT p0.* INTO p FROM placement_workflow_policies p0 JOIN placement_sittings s ON s."policyId"=p0.id WHERE s."attemptId"=t.id;
 IF NEW."publishedById"<>a OR a=coalesce(e."graderId",t."learnerId") OR e.number<>(SELECT max(number) FROM placement_human_evaluations WHERE "attemptId"=t.id AND skill=e.skill) OR length(btrim(NEW.reason))<10 THEN RAISE EXCEPTION 'W04B_INDEPENDENT_LATEST_RELEASE' USING ERRCODE='42501';END IF;RETURN NEW;
 END IF;
 RAISE EXCEPTION 'W04B_UNKNOWN_MUTATION' USING ERRCODE='42501';
END $function$;

CREATE OR REPLACE FUNCTION public.w05_guard()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE a uuid:=w05_actor(); r text:=w05_role(); t support_tickets%ROWTYPE; code text; cap text; latest support_consents%ROWTYPE; routes text[];
BEGIN
 IF current_database()='v2_wave01_dev_test_w04b_br136_demo_20261111_42db33' THEN
 PERFORM br136_bank_check.assert_target(); -- BR136_EXACT_SUPPORT_TARGET
 ELSIF current_database() !~ '^v2_wave01_dev_test_(w05a|w04b_w05a|w04b_wave05)_[a-z0-9_]+$' THEN RAISE EXCEPTION 'SUPPORT_APPEND_ONLY_OR_DEV' USING ERRCODE='42501'; END IF;
 IF TG_OP IN ('DELETE','TRUNCATE') THEN RAISE EXCEPTION 'SUPPORT_APPEND_ONLY_OR_DEV' USING ERRCODE='42501'; END IF;
 IF a IS NULL AND TG_TABLE_NAME NOT IN ('support_tickets','support_events','support_requests','support_abuse_buckets') THEN RAISE EXCEPTION 'SUPPORT_ACTOR_REQUIRED' USING ERRCODE='42501'; END IF;
 IF TG_TABLE_NAME IN ('support_messages','support_events','support_consents','support_requests') AND TG_OP<>'INSERT' THEN RAISE EXCEPTION 'SUPPORT_APPEND_ONLY' USING ERRCODE='42501'; END IF;
 IF a IS NOT NULL AND r IS NULL THEN RAISE EXCEPTION 'SUPPORT_CURRENT_SESSION' USING ERRCODE='42501'; END IF;
 IF TG_TABLE_NAME='support_topics' THEN
   IF TG_OP='INSERT' THEN
     IF NEW."authorId"<>a OR NOT w05_cap(a,'support.taxonomy.author',NULL) OR NEW."approvedById" IS NOT NULL OR NEW."approvedAt" IS NOT NULL OR NEW.version<>(SELECT coalesce(max(version),0)+1 FROM support_topics WHERE support_topics.code=NEW.code) OR NEW.routes <@ ARRAY['ACADEMIC','FINANCE','LEARNING']::text[] IS NOT TRUE THEN RAISE EXCEPTION 'SUPPORT_TOPIC_AUTHOR' USING ERRCODE='42501'; END IF;
   ELSE
     IF OLD."approvedById" IS NOT NULL OR NEW."approvedById" IS DISTINCT FROM a OR NOT w05_cap(a,'support.taxonomy.approve',NULL) OR NEW."approvedAt" IS NULL OR (to_jsonb(NEW)-ARRAY['approvedById','approvedAt']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['approvedById','approvedAt']) THEN RAISE EXCEPTION 'SUPPORT_INDEPENDENT_TOPIC' USING ERRCODE='42501'; END IF;
   END IF;
 ELSIF TG_TABLE_NAME='support_abuse_buckets' THEN
   IF current_setting('app.support_intake',true) IS DISTINCT FROM 'true' OR NEW.count<1 OR NEW.count>6 THEN RAISE EXCEPTION 'SUPPORT_INTAKE_ONLY' USING ERRCODE='42501'; END IF;
 ELSIF TG_TABLE_NAME='support_requests' THEN
   IF (a IS NOT NULL AND NEW.principal<>a::text) OR (a IS NULL AND (current_setting('app.support_intake',true) IS DISTINCT FROM 'true' OR NEW.principal !~ '^G:[a-f0-9]{64}$')) THEN RAISE EXCEPTION 'SUPPORT_REQUEST_ACTOR' USING ERRCODE='42501'; END IF;
 ELSIF TG_TABLE_NAME='support_tickets' THEN
   SELECT st.code,st.routes INTO code,routes FROM support_topics st WHERE st.id=NEW."topicId" AND st."approvedById" IS NOT NULL;
   IF code IS NULL THEN RAISE EXCEPTION 'SUPPORT_APPROVED_TOPIC' USING ERRCODE='42501'; END IF;
   IF TG_OP='INSERT' THEN
     IF current_setting('app.support_intake',true) IS DISTINCT FROM 'true' OR NEW."ownerId" IS NOT NULL OR NEW.state<>'NEW' OR NEW."lockVersion"<>0 OR NEW."learnerId" IS DISTINCT FROM a OR (a IS NOT NULL AND r<>'STUDENT') THEN RAISE EXCEPTION 'SUPPORT_INTAKE_ACTOR' USING ERRCODE='42501'; END IF;
   ELSE
     IF (to_jsonb(NEW)-ARRAY['ownerId','state','lockVersion','updatedAt']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['ownerId','state','lockVersion','updatedAt']) OR NEW."lockVersion"<>OLD."lockVersion"+1 THEN RAISE EXCEPTION 'SUPPORT_IMMUTABLE_IDENTITY_CAS' USING ERRCODE='42501'; END IF;
     IF NEW."ownerId" IS DISTINCT FROM OLD."ownerId" THEN
       cap:=CASE WHEN OLD."ownerId" IS NULL THEN 'support.ticket.assign' ELSE 'support.ticket.transfer' END;
       IF NOT w05_cap(a,cap,code) OR (OLD."ownerId" IS NOT NULL AND OLD."ownerId"<>a) OR NOT w05_cap(NEW."ownerId",'support.ticket.read',code) OR NOT w05_cap(NEW."ownerId",'support.ticket.reply',code) THEN RAISE EXCEPTION 'SUPPORT_ASSIGNMENT' USING ERRCODE='42501'; END IF;
     ELSIF NOT ((r='STUDENT' AND NEW."learnerId"=a) OR (OLD."ownerId"=a AND (w05_cap(a,'support.ticket.reply',code) OR w05_cap(a,'support.ticket.close',code) OR w05_cap(a,'support.ticket.transfer',code) OR w05_cap(a,'support.application.write',code))) OR (r='SYSTEM_ADMIN' AND OLD.state='WAITING_SPECIALIST' AND NEW.state='IN_PROGRESS' AND EXISTS(SELECT 1 FROM support_technical_escalations WHERE ticket_id=NEW.id))) THEN RAISE EXCEPTION 'SUPPORT_OWNER_REQUIRED' USING ERRCODE='42501'; END IF;
     IF NEW.state<>OLD.state THEN
       IF NEW.state='WAITING_SPECIALIST' AND NOT (EXISTS(SELECT 1 FROM support_referrals WHERE "ticketId"=NEW.id AND state='OPEN') OR EXISTS(SELECT 1 FROM support_technical_escalations WHERE ticket_id=NEW.id AND status IN ('OPEN','IN_REVIEW'))) THEN RAISE EXCEPTION 'SUPPORT_OPEN_REFERRAL_REQUIRED' USING ERRCODE='42501'; END IF;
       IF NEW.state IN ('RESOLVED','CLOSED') AND (EXISTS(SELECT 1 FROM support_referrals WHERE "ticketId"=NEW.id AND state='OPEN') OR EXISTS(SELECT 1 FROM support_technical_escalations WHERE ticket_id=NEW.id AND status IN ('OPEN','IN_REVIEW'))) THEN RAISE EXCEPTION 'SUPPORT_REFERRAL_UNFINISHED' USING ERRCODE='42501'; END IF;
       IF r='STUDENT' AND NOT ((OLD.state='RESOLVED' AND NEW.state IN ('CLOSED','REOPENED')) OR (OLD.state='CLOSED' AND NEW.state='REOPENED')) THEN RAISE EXCEPTION 'SUPPORT_LEARNER_TRANSITION' USING ERRCODE='42501'; END IF;
       IF r<>'STUDENT' AND NOT (w05_cap(a,'support.ticket.close',code) OR (w05_cap(a,'support.ticket.transfer',code) AND NEW.state='WAITING_SPECIALIST' AND EXISTS(SELECT 1 FROM support_technical_escalations WHERE ticket_id=NEW.id AND status IN ('OPEN','IN_REVIEW'))) OR (r='SYSTEM_ADMIN' AND OLD.state='WAITING_SPECIALIST' AND NEW.state='IN_PROGRESS' AND EXISTS(SELECT 1 FROM support_technical_escalations WHERE ticket_id=NEW.id))) THEN RAISE EXCEPTION 'SUPPORT_CLOSE_GRANT' USING ERRCODE='42501'; END IF;
       IF NOT ((OLD.state='NEW' AND NEW.state IN ('TRIAGED','IN_PROGRESS')) OR (OLD.state='TRIAGED' AND NEW.state='IN_PROGRESS') OR (OLD.state='IN_PROGRESS' AND NEW.state IN ('WAITING_CUSTOMER','WAITING_SPECIALIST','RESOLVED')) OR (OLD.state IN ('WAITING_CUSTOMER','WAITING_SPECIALIST') AND NEW.state IN ('IN_PROGRESS','RESOLVED')) OR (OLD.state='RESOLVED' AND NEW.state IN ('CLOSED','REOPENED')) OR (OLD.state='CLOSED' AND NEW.state='REOPENED') OR (OLD.state='REOPENED' AND NEW.state='IN_PROGRESS') OR (NEW.state='WAITING_SPECIALIST' AND OLD.state NOT IN ('RESOLVED','CLOSED') AND EXISTS(SELECT 1 FROM support_technical_escalations WHERE ticket_id=NEW.id AND status IN ('OPEN','IN_REVIEW')))) THEN RAISE EXCEPTION 'SUPPORT_TRANSITION' USING ERRCODE='42501'; END IF;
     END IF;
   END IF;
 ELSE
   SELECT * INTO t FROM support_tickets WHERE id=NEW."ticketId";
   SELECT st.code,st.routes INTO code,routes FROM support_topics st WHERE st.id=t."topicId";
   IF TG_TABLE_NAME='support_messages' THEN
     IF NEW."actorId"<>a OR NOT ((r='STUDENT' AND t."learnerId"=a AND NEW.visibility='PUBLIC') OR (t."ownerId"=a AND w05_cap(a,'support.ticket.reply',code)) OR (r='SYSTEM_ADMIN' AND EXISTS(SELECT 1 FROM support_technical_escalations WHERE ticket_id=t.id))) OR t.state='CLOSED' THEN RAISE EXCEPTION 'SUPPORT_MESSAGE_SCOPE' USING ERRCODE='42501'; END IF;
   ELSIF TG_TABLE_NAME='support_events' THEN
     IF NEW."actorId" IS DISTINCT FROM a OR (a IS NULL AND (NEW.kind<>'CREATED' OR current_setting('app.support_intake',true) IS DISTINCT FROM 'true')) OR (a IS NOT NULL AND NOT ((r='STUDENT' AND t."learnerId"=a) OR (r='COUNSELOR' AND (t."ownerId"=a OR w05_cap(a,'support.ticket.assign',code) OR w05_cap(a,'support.ticket.transfer',code))) OR EXISTS(SELECT 1 FROM support_referrals WHERE "ticketId"=t.id AND "specialistId"=a AND w05_cap(a,'support.referral.respond',code)) OR EXISTS(SELECT 1 FROM counseling_applications WHERE "ticketId"=t.id AND "reviewerId"=a AND w05_cap(a,'support.application.review',code)) OR (r='SYSTEM_ADMIN' AND EXISTS(SELECT 1 FROM support_technical_escalations WHERE ticket_id=t.id)))) THEN RAISE EXCEPTION 'SUPPORT_EVENT_SCOPE' USING ERRCODE='42501'; END IF;
   ELSIF TG_TABLE_NAME='support_consents' THEN
     IF r<>'STUDENT' OR t."learnerId" IS DISTINCT FROM a OR NEW."learnerId" IS DISTINCT FROM a OR (NEW."attemptId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM test_attempts WHERE id=NEW."attemptId" AND "learnerId"=a)) THEN RAISE EXCEPTION 'SUPPORT_CONSENT_OWNER' USING ERRCODE='42501'; END IF;
   ELSIF TG_TABLE_NAME='support_referrals' THEN
     IF TG_OP='INSERT' THEN
       IF t."ownerId" IS DISTINCT FROM a OR NEW."createdById" IS DISTINCT FROM a OR NEW.state<>'OPEN' OR NOT w05_cap(a,'support.ticket.transfer',code) OR NOT (NEW.category=ANY(routes)) OR NOT w05_cap(NEW."specialistId",'support.referral.respond',code) OR NOT EXISTS(SELECT 1 FROM users WHERE id=NEW."specialistId" AND role::text=CASE NEW.category WHEN 'ACADEMIC' THEN 'ACADEMIC_MANAGER' WHEN 'FINANCE' THEN 'CASHIER' WHEN 'LEARNING' THEN 'INSTRUCTOR' END) THEN RAISE EXCEPTION 'SUPPORT_REFERRAL_ASSIGNMENT' USING ERRCODE='42501'; END IF;
     ELSE
       IF OLD."specialistId" IS DISTINCT FROM a OR r IS DISTINCT FROM (CASE OLD.category WHEN 'ACADEMIC' THEN 'ACADEMIC_MANAGER' WHEN 'FINANCE' THEN 'CASHIER' WHEN 'LEARNING' THEN 'INSTRUCTOR' END) OR NOT w05_cap(a,'support.referral.respond',code) OR OLD.state<>'OPEN' OR NEW.state<>'RESPONDED' OR NEW."lockVersion"<>OLD."lockVersion"+1 OR (to_jsonb(NEW)-ARRAY['state','response','respondedAt','lockVersion']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','response','respondedAt','lockVersion']) THEN RAISE EXCEPTION 'SUPPORT_REFERRAL_RESPONSE' USING ERRCODE='42501'; END IF;
     END IF;
   ELSIF TG_TABLE_NAME='counseling_applications' THEN
     SELECT * INTO latest FROM support_consents WHERE "ticketId"=t.id AND purpose='APPLICATION' ORDER BY "createdAt" DESC,id DESC LIMIT 1;
     IF t."learnerId" IS NULL OR NEW."learnerId" IS DISTINCT FROM t."learnerId" THEN RAISE EXCEPTION 'SUPPORT_VERIFIED_ACCOUNT_REQUIRED' USING ERRCODE='42501'; END IF;
     IF TG_OP='INSERT' OR NEW.state='SUBMITTED_TO_HVU' THEN
       IF t."ownerId" IS DISTINCT FROM a OR NOT w05_cap(a,'support.application.write',code) OR latest.id IS NULL OR NOT latest.granted OR NOT w05_cap(NEW."reviewerId",'support.application.review',code) THEN RAISE EXCEPTION 'SUPPORT_APPLICATION_SCOPE_CONSENT' USING ERRCODE='42501'; END IF;
       IF NEW."placementAttemptId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM test_attempts ta JOIN placement_source_versions pv ON ta."placementVersionId"=pv.id WHERE ta.id=NEW."placementAttemptId" AND ta."learnerId"=t."learnerId" AND pv.purpose='LEARNER_PUBLISHABLE' AND pv.provenance->>'synthetic'='false') THEN RAISE EXCEPTION 'SUPPORT_REAL_PLACEMENT_ONLY' USING ERRCODE='42501'; END IF;
       IF NEW."classId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM class_offerings c JOIN course_versions v ON v.id=c."versionId" JOIN courses co ON co.id=c."courseId" WHERE c.id=NEW."classId" AND v.id=NEW."courseVersionId" AND c.status='OPEN' AND v.state='PUBLISHED' AND co."isPublished" AND (c."enrollmentStart" IS NULL OR c."enrollmentStart"<=clock_timestamp()) AND (c."enrollmentEnd" IS NULL OR c."enrollmentEnd">=clock_timestamp()) AND (c."maxStudents" IS NULL OR c."maxStudents"> (SELECT count(*) FROM enrollments WHERE "classOfferingId"=c.id AND status IN ('ACTIVE','PENDING_PAYMENT'))) AND EXISTS(SELECT 1 FROM teaching_sessions WHERE "classOfferingId"=c.id AND state='PUBLISHED' AND intent='PUBLISH' AND "startsAt">clock_timestamp())) THEN RAISE EXCEPTION 'SUPPORT_ELIGIBLE_CLASS_VERSION' USING ERRCODE='42501'; END IF;
     END IF;
     IF TG_OP='INSERT' THEN
       IF NEW."authorId" IS DISTINCT FROM a OR NEW."consentId" IS DISTINCT FROM latest.id OR NEW.state<>'DRAFT' OR NEW.snapshot IS NOT NULL OR NEW."lockVersion"<>0 OR NEW.number<>(SELECT coalesce(max(number),0)+1 FROM counseling_applications WHERE "ticketId"=t.id) OR EXISTS(SELECT 1 FROM counseling_applications WHERE "ticketId"=t.id AND number=NEW.number-1 AND state<>'CORRECTION_REQUESTED') THEN RAISE EXCEPTION 'SUPPORT_VERSIONED_DRAFT' USING ERRCODE='42501'; END IF;
     ELSE
       IF NEW."lockVersion"<>OLD."lockVersion"+1 OR (to_jsonb(NEW)-ARRAY['state','snapshot','submittedAt','reviewedAt','reviewReason','lockVersion']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','snapshot','submittedAt','reviewedAt','reviewReason','lockVersion']) THEN RAISE EXCEPTION 'SUPPORT_APPLICATION_IMMUTABLE' USING ERRCODE='42501'; END IF;
       IF OLD.state='DRAFT' THEN
         IF NEW.state<>'SUBMITTED_TO_HVU' OR NEW.snapshot IS NULL OR NEW."submittedAt" IS NULL THEN RAISE EXCEPTION 'SUPPORT_SUBMISSION_SNAPSHOT' USING ERRCODE='42501'; END IF;
         IF NEW.snapshot->>'learnerId' IS DISTINCT FROM NEW."learnerId"::text OR NEW.snapshot->>'authorId' IS DISTINCT FROM NEW."authorId"::text OR NEW.snapshot->>'reviewerId' IS DISTINCT FROM NEW."reviewerId"::text OR NEW.snapshot->>'needs' IS DISTINCT FROM NEW.needs OR NEW.snapshot->>'target' IS DISTINCT FROM NEW.target OR NEW.snapshot->>'consentId' IS DISTINCT FROM latest.id::text THEN RAISE EXCEPTION 'SUPPORT_SNAPSHOT_PROVENANCE' USING ERRCODE='42501'; END IF;
       ELSE
         IF OLD.state NOT IN ('SUBMITTED_TO_HVU','ACKNOWLEDGED') OR NEW.state NOT IN ('ACKNOWLEDGED','CORRECTION_REQUESTED') OR NEW.snapshot IS DISTINCT FROM OLD.snapshot OR NEW."submittedAt" IS DISTINCT FROM OLD."submittedAt" OR NEW."reviewerId" IS DISTINCT FROM a OR NEW."authorId"=a OR NOT w05_cap(a,'support.application.review',code) THEN RAISE EXCEPTION 'SUPPORT_INDEPENDENT_REVIEW' USING ERRCODE='42501'; END IF;
       END IF;
     END IF;
   END IF;
 END IF;
 RETURN NEW;
END $function$;

COMMIT;
