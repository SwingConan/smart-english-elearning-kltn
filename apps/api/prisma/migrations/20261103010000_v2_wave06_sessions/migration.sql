BEGIN;
CREATE TABLE w06_meet (
"id" uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
"sessionId" uuid NOT NULL,
"number" integer NOT NULL,
"url" varchar(100) NOT NULL,
"makerId" uuid NOT NULL,
"reason" varchar(1000) NOT NULL,
"key" uuid NOT NULL,
"state" varchar(24) NOT NULL DEFAULT 'PENDING_APPROVAL',
"reviewerId" uuid,
"reviewReason" varchar(1000),
"decisionKey" uuid,
"createdAt" timestamptz(6) NOT NULL DEFAULT clock_timestamp(),
"reviewedAt" timestamptz(6),
UNIQUE("sessionId","number"),
UNIQUE("makerId","key"),
FOREIGN KEY("sessionId") REFERENCES teaching_sessions(id) ON DELETE RESTRICT,
FOREIGN KEY("makerId") REFERENCES users(id) ON DELETE RESTRICT,
FOREIGN KEY("reviewerId") REFERENCES users(id) ON DELETE RESTRICT
);
CREATE TABLE w06_attendance_activities (
"id" uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
"classId" uuid NOT NULL,
"creatorId" uuid NOT NULL,
"createdAt" timestamptz(6) NOT NULL DEFAULT clock_timestamp(),
FOREIGN KEY("classId") REFERENCES class_offerings(id) ON DELETE RESTRICT,
FOREIGN KEY("creatorId") REFERENCES users(id) ON DELETE RESTRICT
);
CREATE TABLE w06_windows (
"id" uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
"sessionId" uuid NOT NULL,
"activityId" uuid NOT NULL,
"startsAt" timestamptz(6) NOT NULL,
"endsAt" timestamptz(6) NOT NULL,
"timezone" varchar(100) NOT NULL,
"revision" integer NOT NULL,
"createdAt" timestamptz(6) NOT NULL DEFAULT clock_timestamp(),
FOREIGN KEY("sessionId") REFERENCES teaching_sessions(id) ON DELETE RESTRICT,
FOREIGN KEY("activityId") REFERENCES w06_attendance_activities(id) ON DELETE RESTRICT
);
CREATE TABLE w06_codes (
"id" uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
"windowId" uuid NOT NULL,
"number" integer NOT NULL,
"verifier" varchar(64) NOT NULL,
"expiresAt" timestamptz(6) NOT NULL,
"creatorId" uuid NOT NULL,
"key" uuid NOT NULL,
"createdAt" timestamptz(6) NOT NULL DEFAULT clock_timestamp(),
UNIQUE("windowId","number"),
UNIQUE("creatorId","key"),
FOREIGN KEY("windowId") REFERENCES w06_windows(id) ON DELETE RESTRICT,
FOREIGN KEY("creatorId") REFERENCES users(id) ON DELETE RESTRICT
);
CREATE TABLE w06_receipts (
"id" uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
"windowId" uuid NOT NULL,
"learnerId" uuid NOT NULL,
"codeId" uuid NOT NULL,
"key" uuid NOT NULL,
"status" varchar(24) NOT NULL,
"acceptedAt" timestamptz(6) NOT NULL DEFAULT clock_timestamp(),
UNIQUE("windowId","learnerId"),
UNIQUE("learnerId","key"),
FOREIGN KEY("windowId") REFERENCES w06_windows(id) ON DELETE RESTRICT,
FOREIGN KEY("learnerId") REFERENCES users(id) ON DELETE RESTRICT,
FOREIGN KEY("codeId") REFERENCES w06_codes(id) ON DELETE RESTRICT
);
CREATE TABLE w06_corrections (
"id" uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
"windowId" uuid NOT NULL,
"learnerId" uuid NOT NULL,
"makerId" uuid NOT NULL,
"baseVersion" integer NOT NULL,
"beforeStatus" varchar(24) NOT NULL,
"requestedStatus" varchar(24) NOT NULL,
"evidence" varchar(2000) NOT NULL,
"reason" varchar(1000) NOT NULL,
"key" uuid NOT NULL,
"state" varchar(24) NOT NULL DEFAULT 'PENDING_APPROVAL',
"reviewerId" uuid,
"reviewReason" varchar(1000),
"decisionKey" uuid,
"revision" integer,
"createdAt" timestamptz(6) NOT NULL DEFAULT clock_timestamp(),
"reviewedAt" timestamptz(6),
UNIQUE("makerId","key"),
UNIQUE("windowId","learnerId","revision"),
FOREIGN KEY("windowId") REFERENCES w06_windows(id) ON DELETE RESTRICT,
FOREIGN KEY("learnerId") REFERENCES users(id) ON DELETE RESTRICT,
FOREIGN KEY("makerId") REFERENCES users(id) ON DELETE RESTRICT,
FOREIGN KEY("reviewerId") REFERENCES users(id) ON DELETE RESTRICT
);
CREATE TABLE w06_exceptions (
"id" uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
"sessionId" uuid NOT NULL,
"makerId" uuid NOT NULL,
"kind" varchar(16) NOT NULL,
"startLocal" varchar(30),
"endLocal" varchar(30),
"timezone" varchar(100) NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
"startOffsetMinutes" integer,
"endOffsetMinutes" integer,
"roomId" uuid,
"assignmentId" uuid,
"modality" varchar(16) NOT NULL,
"requiredCapabilities" "RoomCapability"[] NOT NULL,
"reason" varchar(1000) NOT NULL,
"key" uuid NOT NULL,
"state" varchar(24) NOT NULL DEFAULT 'PENDING_APPROVAL',
"routedSessionId" uuid,
"routedById" uuid,
"decisionKey" uuid,
"reviewReason" varchar(1000),
"createdAt" timestamptz(6) NOT NULL DEFAULT clock_timestamp(),
UNIQUE("makerId","key"),
FOREIGN KEY("sessionId") REFERENCES teaching_sessions(id) ON DELETE RESTRICT,
FOREIGN KEY("makerId") REFERENCES users(id) ON DELETE RESTRICT,
FOREIGN KEY("roomId") REFERENCES rooms(id) ON DELETE RESTRICT,
FOREIGN KEY("assignmentId") REFERENCES class_instructor_assignments(id) ON DELETE RESTRICT,
FOREIGN KEY("routedSessionId") REFERENCES teaching_sessions(id) ON DELETE RESTRICT,
FOREIGN KEY("routedById") REFERENCES users(id) ON DELETE RESTRICT
);
CREATE TABLE w06_notifications (
"id" uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
"sessionId" uuid NOT NULL,
"recipientId" uuid NOT NULL,
"kind" varchar(32) NOT NULL,
"sourceId" uuid NOT NULL,
"createdAt" timestamptz(6) NOT NULL DEFAULT clock_timestamp(),
UNIQUE("kind","sourceId","recipientId"),
FOREIGN KEY("sessionId") REFERENCES teaching_sessions(id) ON DELETE RESTRICT,
FOREIGN KEY("recipientId") REFERENCES users(id) ON DELETE RESTRICT
);
CREATE TABLE w06_rates (
"id" uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
"windowId" uuid NOT NULL,
"learnerId" uuid NOT NULL,
"count" integer NOT NULL DEFAULT 0,
"resetAt" timestamptz(6) NOT NULL,
UNIQUE("windowId","learnerId"),
FOREIGN KEY("windowId") REFERENCES w06_windows(id) ON DELETE RESTRICT,
FOREIGN KEY("learnerId") REFERENCES users(id) ON DELETE RESTRICT
);
CREATE INDEX w06_meet_pending ON w06_meet(state,"sessionId");
CREATE INDEX w06_exception_pending ON w06_exceptions(state,"sessionId");
CREATE INDEX w06_correction_history ON w06_corrections("windowId","learnerId",state);
CREATE INDEX w06_notification_inbox ON w06_notifications("recipientId","createdAt");
ALTER TABLE w06_meet ADD CONSTRAINT w06_meet_review_metadata CHECK (
 (state='PENDING_APPROVAL' AND "reviewerId" IS NULL AND "reviewedAt" IS NULL AND "decisionKey" IS NULL AND "reviewReason" IS NULL) OR
 (state IN ('APPROVED','REJECTED') AND "reviewerId" IS NOT NULL AND "reviewedAt" IS NOT NULL AND "decisionKey" IS NOT NULL AND "reviewReason" IS NOT NULL AND length(trim("reviewReason"))>0));
ALTER TABLE w06_corrections ADD CONSTRAINT w06_correction_review_metadata CHECK (
 (state='PENDING_APPROVAL' AND "reviewerId" IS NULL AND "reviewedAt" IS NULL AND "decisionKey" IS NULL AND "reviewReason" IS NULL AND revision IS NULL) OR
 (state IN ('APPROVED','REJECTED') AND "reviewerId" IS NOT NULL AND "reviewedAt" IS NOT NULL AND "decisionKey" IS NOT NULL AND "reviewReason" IS NOT NULL AND length(trim("reviewReason"))>0 AND ((state='APPROVED' AND revision="baseVersion"+1) OR (state='REJECTED' AND revision IS NULL))));
ALTER TABLE w06_exceptions ADD CONSTRAINT w06_exception_route_metadata CHECK (
 (state='PENDING_APPROVAL' AND "routedById" IS NULL AND "routedSessionId" IS NULL AND "decisionKey" IS NULL AND "reviewReason" IS NULL) OR
 (state IN ('ROUTED','REJECTED') AND "routedById" IS NOT NULL AND "decisionKey" IS NOT NULL AND "reviewReason" IS NOT NULL AND length(trim("reviewReason"))>0 AND ((state='ROUTED' AND "routedSessionId" IS NOT NULL) OR (state='REJECTED' AND "routedSessionId" IS NULL))));
ALTER TABLE w06_meet ADD CONSTRAINT w06_meet_url CHECK(url ~ '^https://meet[.]google[.]com/[a-z]{3}-[a-z]{4}-[a-z]{3}$');
ALTER TABLE w06_meet ADD CHECK(number>0 AND length(trim(reason))>0 AND state IN ('PENDING_APPROVAL','APPROVED','REJECTED'));
ALTER TABLE w06_corrections ADD CHECK("requestedStatus" IN ('PRESENT','LATE','NOT_RECORDED') AND "beforeStatus" IN ('PRESENT','LATE','NOT_RECORDED') AND "baseVersion">=0 AND length(trim(evidence))>0 AND length(trim(reason))>0 AND state IN ('PENDING_APPROVAL','APPROVED','REJECTED'));
ALTER TABLE w06_receipts ADD CHECK(status IN ('PRESENT','LATE'));
ALTER TABLE w06_codes ADD CHECK(number>0 AND verifier ~ '^[a-f0-9]{64}$');
ALTER TABLE w06_windows ADD CHECK("endsAt">"startsAt" AND revision>0);
ALTER TABLE w06_exceptions ADD CHECK(kind IN ('LEAVE','RESCHEDULE','MAKEUP') AND state IN ('PENDING_APPROVAL','ROUTED','REJECTED') AND length(trim(reason))>0);
ALTER TABLE w06_rates ADD CHECK(count>=0);
ALTER TABLE permission_grants DROP CONSTRAINT grant_scope;
ALTER TABLE permission_grants ADD CONSTRAINT grant_scope CHECK (
 ("scopeType"='GLOBAL' AND "scopeId" IS NULL AND capability NOT LIKE 'academic.%' AND (capability NOT LIKE 'support.%' OR capability IN ('support.taxonomy.author','support.taxonomy.approve'))) OR
 ("scopeType"='CLASS' AND "scopeId" IS NOT NULL AND capability IN ('class.read','academic.schedule.approve','academic.rubric.approve','academic.grade.publish','academic.quiz.approve','academic.quiz.grade.publish','academic.meeting.approve','academic.attendance.approve')) OR
 ("scopeType"='COURSE' AND "scopeId" IS NOT NULL AND capability='academic.program.approve') OR
 ("scopeType"='SUPPORT_TOPIC' AND "scopeId" ~ '^[A-Z][A-Z0-9_]{2,39}$' AND capability IN ('support.ticket.read','support.ticket.assign','support.ticket.reply','support.ticket.transfer','support.ticket.close','support.application.write','support.application.review','support.referral.respond')));

CREATE FUNCTION w06_actor() RETURNS uuid LANGUAGE sql STABLE AS $$
 SELECT u.id FROM users u JOIN user_sessions s ON s.sess->>'userId'=u.id::text
 WHERE u.id::text=current_setting('app.w06_actor',true) AND s.sid=current_setting('app.w06_session',true) AND s.expire>clock_timestamp() AND u.status='ACTIVE'
$$;
CREATE FUNCTION w06_cap(a uuid,c text,k uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM users u JOIN permission_grants g ON g."userId"=u.id WHERE u.id=a AND u.status='ACTIVE' AND u.role='ACADEMIC_MANAGER' AND g.capability=c AND g."scopeType"='CLASS' AND g."scopeId"=k::text AND g."approvedBy" IS NOT NULL AND g."approvedAt"<=clock_timestamp() AND g."effectiveAt"<=clock_timestamp() AND g."expiresAt">clock_timestamp() AND g."revokedAt" IS NULL)
$$;
CREATE FUNCTION w06_teacher(a uuid,s teaching_sessions) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM users u JOIN class_instructor_assignments x ON x."instructorId"=u.id WHERE u.id=a AND u.role='INSTRUCTOR' AND u.status='ACTIVE' AND x.id=s."assignmentId" AND x."classOfferingId"=s."classOfferingId" AND x."instructorId"=s."instructorId" AND x.state IN ('PUBLISHED','SUPERSEDED') AND x."effectiveFrom"<=clock_timestamp() AND x."reservedUntil">clock_timestamp() AND x."effectiveFrom"<=s."startsAt" AND x."reservedUntil">=s."endsAt")
$$;
CREATE FUNCTION w06_learner(a uuid,k uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM users u JOIN enrollments e ON e."learnerId"=u.id WHERE u.id=a AND u.role='STUDENT' AND u.status='ACTIVE' AND e."classOfferingId"=k AND e.status='ACTIVE')
$$;
-- Pure deterministic seam; command guards always supply clock_timestamp(), never client input.
CREATE FUNCTION w06_status_at(n timestamptz,b timestamptz,e timestamptz) RETURNS text LANGUAGE sql IMMUTABLE AS $$
 SELECT CASE WHEN n<b OR n>=e THEN 'CLOSED' WHEN n<=b+interval '10 minutes' THEN 'PRESENT' ELSE 'LATE' END
$$;
CREATE FUNCTION w06_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE a uuid; s teaching_sessions; w w06_windows; c w06_codes; n timestamptz; v integer; before_status text; who text;
BEGIN
 PERFORM pg_advisory_xact_lock(842030);
 n:=clock_timestamp();
 IF TG_OP IN ('DELETE','TRUNCATE') THEN RAISE EXCEPTION 'W06_APPEND_ONLY' USING ERRCODE='23514'; END IF;
 a:=w06_actor();IF a IS NULL THEN RAISE EXCEPTION 'W06_ACTIVE_SESSION_REQUIRED' USING ERRCODE='42501'; END IF;
 SELECT role::text INTO who FROM users WHERE id=a;
 IF TG_TABLE_NAME='w06_attendance_activities' THEN
  IF TG_OP<>'INSERT' OR NEW."creatorId"<>a OR NOT EXISTS(SELECT 1 FROM teaching_sessions t WHERE t."classOfferingId"=NEW."classId" AND t.state='PUBLISHED' AND w06_teacher(a,t)) THEN RAISE EXCEPTION 'W06_ACTIVITY_SCOPE' USING ERRCODE='42501';END IF; RETURN NEW;
 END IF;
 IF TG_TABLE_NAME IN ('w06_meet','w06_windows','w06_exceptions','w06_notifications') THEN SELECT * INTO s FROM teaching_sessions WHERE id=NEW."sessionId";
 ELSE SELECT * INTO w FROM w06_windows WHERE id=NEW."windowId";SELECT * INTO s FROM teaching_sessions WHERE id=w."sessionId";END IF;
 IF s.id IS NULL OR (s.state<>'PUBLISHED' AND TG_TABLE_NAME<>'w06_notifications') THEN RAISE EXCEPTION 'W06_CURRENT_SESSION_REQUIRED' USING ERRCODE='23514';END IF;
 IF TG_TABLE_NAME='w06_windows' THEN
  IF TG_OP<>'INSERT' OR NOT w06_teacher(a,s) OR (NEW."startsAt",NEW."endsAt",NEW.timezone,NEW.revision) IS DISTINCT FROM (s."startsAt",s."endsAt",s.timezone,s.revision) OR NOT EXISTS(SELECT 1 FROM w06_attendance_activities WHERE id=NEW."activityId" AND "classId"=s."classOfferingId") THEN RAISE EXCEPTION 'W06_WINDOW_PROVENANCE' USING ERRCODE='42501';END IF;
 ELSIF TG_TABLE_NAME='w06_meet' THEN
  IF TG_OP='INSERT' THEN
   IF NEW."makerId"<>a OR NOT w06_teacher(a,s) OR NEW.state<>'PENDING_APPROVAL' OR NEW."reviewerId" IS NOT NULL OR NEW."reviewedAt" IS NOT NULL OR NEW."decisionKey" IS NOT NULL OR NEW.number<>coalesce((SELECT max(number) FROM w06_meet WHERE "sessionId"=s.id),0)+1 THEN RAISE EXCEPTION 'W06_MEET_PROPOSAL' USING ERRCODE='42501'; END IF;NEW."createdAt":=n;
  ELSE
   IF OLD.state<>'PENDING_APPROVAL' OR NEW.state NOT IN ('APPROVED','REJECTED') OR NEW."reviewerId" IS DISTINCT FROM a OR a=OLD."makerId" OR NOT w06_cap(a,'academic.meeting.approve',s."classOfferingId") OR NEW."decisionKey" IS NULL OR length(trim(NEW."reviewReason"))=0 OR OLD.number<>(SELECT max(number) FROM w06_meet WHERE "sessionId"=s.id) OR (to_jsonb(NEW)-ARRAY['state','reviewerId','reviewReason','decisionKey','reviewedAt']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','reviewerId','reviewReason','decisionKey','reviewedAt']) THEN RAISE EXCEPTION 'W06_MEET_REVIEW' USING ERRCODE='42501'; END IF;NEW."reviewedAt":=n;
  END IF;
 ELSIF TG_TABLE_NAME='w06_codes' THEN
  IF TG_OP<>'INSERT' OR NEW."creatorId"<>a OR NOT w06_teacher(a,s) OR n<s."startsAt" OR n>=s."endsAt" OR NEW."expiresAt">least(s."endsAt",n+interval '120 seconds') OR NEW."expiresAt"<=n OR NEW.number<>coalesce((SELECT max(number) FROM w06_codes WHERE "windowId"=w.id),0)+1 THEN RAISE EXCEPTION 'W06_CODE_WINDOW' USING ERRCODE='42501';END IF;NEW."createdAt":=n;
 ELSIF TG_TABLE_NAME='w06_receipts' THEN
  SELECT * INTO c FROM w06_codes WHERE id=NEW."codeId";
  IF TG_OP<>'INSERT' OR a<>NEW."learnerId" OR NOT w06_learner(a,s."classOfferingId") OR n<s."startsAt" OR n>=s."endsAt" OR c.id IS NULL OR c."windowId"<>w.id OR c."expiresAt"<=n OR c.number<>(SELECT max(number) FROM w06_codes WHERE "windowId"=w.id) OR c.verifier IS DISTINCT FROM current_setting('app.w06_verifier',true) THEN RAISE EXCEPTION 'W06_CHECKIN_DENIED' USING ERRCODE='42501';END IF;
  NEW."acceptedAt":=n;NEW.status:=w06_status_at(n,s."startsAt",s."endsAt");
 ELSIF TG_TABLE_NAME='w06_corrections' THEN
  SELECT coalesce(max(revision),0) INTO v FROM w06_corrections WHERE "windowId"=w.id AND "learnerId"=NEW."learnerId" AND state='APPROVED';
  SELECT "requestedStatus" INTO before_status FROM w06_corrections WHERE "windowId"=w.id AND "learnerId"=NEW."learnerId" AND state='APPROVED' ORDER BY revision DESC LIMIT 1;
  IF before_status IS NULL THEN SELECT status INTO before_status FROM w06_receipts WHERE "windowId"=w.id AND "learnerId"=NEW."learnerId";END IF;before_status:=coalesce(before_status,'NOT_RECORDED');
  IF TG_OP='INSERT' THEN
   IF NEW."makerId"<>a OR NOT (w06_teacher(a,s) OR (a=NEW."learnerId" AND w06_learner(a,s."classOfferingId"))) OR NOT w06_learner(NEW."learnerId",s."classOfferingId") OR NEW.state<>'PENDING_APPROVAL' OR NEW."baseVersion"<>v OR NEW."beforeStatus"<>before_status OR NEW.revision IS NOT NULL OR NEW."reviewerId" IS NOT NULL OR NEW."reviewedAt" IS NOT NULL OR NEW."decisionKey" IS NOT NULL THEN RAISE EXCEPTION 'W06_CORRECTION_REQUEST' USING ERRCODE='42501';END IF;NEW."createdAt":=n;
  ELSE
   IF OLD.state<>'PENDING_APPROVAL' OR NEW.state NOT IN ('APPROVED','REJECTED') OR NEW."reviewerId" IS DISTINCT FROM a OR a=OLD."makerId" OR NOT w06_cap(a,'academic.attendance.approve',s."classOfferingId") OR NEW."baseVersion"<>v OR NEW."beforeStatus"<>before_status OR NOT w06_learner(NEW."learnerId",s."classOfferingId") OR NEW."decisionKey" IS NULL OR length(trim(NEW."reviewReason"))=0 OR (to_jsonb(NEW)-ARRAY['state','reviewerId','reviewReason','decisionKey','reviewedAt','revision']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','reviewerId','reviewReason','decisionKey','reviewedAt','revision']) THEN RAISE EXCEPTION 'W06_CORRECTION_REVIEW' USING ERRCODE='42501';END IF;NEW.revision:=CASE WHEN NEW.state='APPROVED' THEN v+1 ELSE NULL END;NEW."reviewedAt":=n;
  END IF;
 ELSIF TG_TABLE_NAME='w06_rates' THEN
  IF NEW."learnerId"<>a OR NOT w06_learner(a,s."classOfferingId") OR (TG_OP='UPDATE' AND (NEW.id,NEW."windowId",NEW."learnerId") IS DISTINCT FROM (OLD.id,OLD."windowId",OLD."learnerId")) THEN RAISE EXCEPTION 'W06_RATE_SCOPE' USING ERRCODE='42501';END IF;
 ELSIF TG_TABLE_NAME='w06_exceptions' THEN
  IF TG_OP='INSERT' THEN
   IF NEW."makerId"<>a OR NOT w06_teacher(a,s) OR s."startsAt"<=n OR NEW.state<>'PENDING_APPROVAL' OR NEW."routedById" IS NOT NULL OR NEW."routedSessionId" IS NOT NULL OR NEW."decisionKey" IS NOT NULL THEN RAISE EXCEPTION 'W06_EXCEPTION_REQUEST' USING ERRCODE='42501';END IF;NEW."createdAt":=n;
  ELSE
   IF OLD.state<>'PENDING_APPROVAL' OR NEW.state NOT IN ('ROUTED','REJECTED') OR NEW."routedById" IS DISTINCT FROM a OR a=OLD."makerId" OR NOT w06_cap(a,'academic.schedule.approve',s."classOfferingId") OR s."startsAt"<=n OR NEW."decisionKey" IS NULL OR length(trim(NEW."reviewReason"))=0 OR (to_jsonb(NEW)-ARRAY['state','routedById','routedSessionId','decisionKey','reviewReason']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','routedById','routedSessionId','decisionKey','reviewReason']) THEN RAISE EXCEPTION 'W06_EXCEPTION_ROUTE' USING ERRCODE='42501';END IF;
   IF NEW.state='ROUTED' AND NOT EXISTS(SELECT 1 FROM teaching_sessions t WHERE t.id=NEW."routedSessionId" AND t.state='PENDING_APPROVAL' AND t."proposedBy"=a AND t."classOfferingId"=s."classOfferingId" AND ((NEW.kind='MAKEUP' AND t."occurrenceId"<>s."occurrenceId" AND t."supersedesId" IS NULL) OR (NEW.kind<>'MAKEUP' AND t."supersedesId"=s.id AND t.intent=CASE WHEN NEW.kind='LEAVE' THEN 'CANCEL'::"SessionIntent" ELSE 'RESCHEDULE'::"SessionIntent" END))) THEN RAISE EXCEPTION 'W06_EXISTING_APPROVAL_REQUIRED' USING ERRCODE='42501';END IF;
  END IF;
 ELSIF TG_TABLE_NAME='w06_notifications' THEN
  IF TG_OP<>'INSERT' OR NOT ((NEW.kind='MEET_APPROVED' AND EXISTS(SELECT 1 FROM w06_meet WHERE id=NEW."sourceId" AND "sessionId"=s.id AND state='APPROVED')) OR (NEW.kind='ATTENDANCE_REVIEWED' AND EXISTS(SELECT 1 FROM w06_corrections r JOIN w06_windows proof_window ON proof_window.id=r."windowId" WHERE r.id=NEW."sourceId" AND proof_window."sessionId"=s.id AND r.state='APPROVED')) OR (NEW.kind IN ('PUBLISH','RESCHEDULE','CANCEL') AND NEW."sourceId"=s.id AND s.state IN ('PUBLISHED','CANCELLED') AND s."approvedBy"=a)) THEN RAISE EXCEPTION 'W06_NOTIFICATION_APPROVAL_REQUIRED' USING ERRCODE='42501';END IF;
 ELSE RAISE EXCEPTION 'W06_UNKNOWN_TABLE';END IF;
 RETURN NEW;
END $$;
DO $$ DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['w06_attendance_activities','w06_windows','w06_meet','w06_codes','w06_receipts','w06_corrections','w06_exceptions','w06_rates','w06_notifications'] LOOP
 EXECUTE format('CREATE TRIGGER w06_guard BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION w06_guard()',t);
 EXECUTE format('CREATE TRIGGER w06_truncate BEFORE TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION w06_guard()',t);
END LOOP;END $$;
COMMIT;
