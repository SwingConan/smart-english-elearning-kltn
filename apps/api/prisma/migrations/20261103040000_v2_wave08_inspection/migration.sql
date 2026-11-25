BEGIN;
CREATE TABLE w08_assignment (
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
"sessionId" uuid NOT NULL REFERENCES teaching_sessions(id) ON DELETE RESTRICT,
"classId" uuid NOT NULL REFERENCES class_offerings(id) ON DELETE RESTRICT,
"teacherId" uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
"inspectorId" uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
"dispatcherId" uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
"meetId" uuid NOT NULL REFERENCES w06_meet(id) ON DELETE RESTRICT,
"revision" integer NOT NULL,
"startsAt" timestamptz(6) NOT NULL,
"endsAt" timestamptz(6) NOT NULL,
"state" text NOT NULL,
"version" integer NOT NULL,
"reason" text NOT NULL,
"createdAt" timestamptz(6) NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE w08_segment (
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
"assignmentId" uuid NOT NULL REFERENCES w08_assignment(id) ON DELETE RESTRICT,
"inspectorId" uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
"startedAt" timestamptz(6) NOT NULL,
"stoppedAt" timestamptz(6),
"createdAt" timestamptz(6) NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE w08_report (
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
"assignmentId" uuid NOT NULL REFERENCES w08_assignment(id) ON DELETE RESTRICT,
"reporterId" uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
"number" integer NOT NULL,
"presence" text NOT NULL,
"conditions" text NOT NULL,
"reason" text NOT NULL,
"attestation" text NOT NULL,
"createdAt" timestamptz(6) NOT NULL DEFAULT clock_timestamp(),
UNIQUE("assignmentId",number)
);
CREATE TABLE w08_decision (
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
"assignmentId" uuid NOT NULL REFERENCES w08_assignment(id) ON DELETE RESTRICT,
"reportId" uuid NOT NULL REFERENCES w08_report(id) ON DELETE RESTRICT,
"reviewerId" uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
"number" integer NOT NULL,
"disposition" text NOT NULL,
"approvedSeconds" integer,
"reason" text NOT NULL,
"createdAt" timestamptz(6) NOT NULL DEFAULT clock_timestamp(),
UNIQUE("assignmentId",number)
);
CREATE TABLE w08_dispute (
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
"assignmentId" uuid NOT NULL REFERENCES w08_assignment(id) ON DELETE RESTRICT,
"teacherId" uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
"reason" text NOT NULL,
"createdAt" timestamptz(6) NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE w08_clock (
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
"assignmentId" uuid NOT NULL REFERENCES w08_assignment(id) ON DELETE RESTRICT,
"inspectorId" uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
"kind" text NOT NULL,
"createdAt" timestamptz(6) NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE w08_correction (
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
"assignmentId" uuid NOT NULL REFERENCES w08_assignment(id) ON DELETE RESTRICT,
"inspectorId" uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
"kind" text NOT NULL,
"evidence" text NOT NULL,
"reason" text NOT NULL,
"createdAt" timestamptz(6) NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE w08_correction_decision (
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
"correctionId" uuid NOT NULL REFERENCES w08_correction(id) ON DELETE RESTRICT,
"reviewerId" uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
"disposition" text NOT NULL,
"reason" text NOT NULL,
"createdAt" timestamptz(6) NOT NULL DEFAULT clock_timestamp(),
UNIQUE("correctionId")
);
-- CF01/DEC054: proposed human correction is separate from raw server clock events.
ALTER TABLE w08_correction ADD COLUMN revision integer NOT NULL,
 ADD COLUMN "proposedOutAt" timestamptz(6),
 ADD COLUMN "supersedesId" uuid REFERENCES w08_correction(id) ON DELETE RESTRICT,
 ADD CONSTRAINT w08_correction_revision UNIQUE("assignmentId",revision),
 ADD CHECK(revision>0);
ALTER TABLE w08_correction_decision ADD COLUMN revision integer NOT NULL,
 ADD COLUMN "correctedOutAt" timestamptz(6), ADD COLUMN "approvedShiftSeconds" integer,
 ADD CHECK(revision>0 AND ((disposition='REJECT' AND "correctedOutAt" IS NULL AND "approvedShiftSeconds" IS NULL)
 OR (disposition='ACCEPT' AND "correctedOutAt" IS NOT NULL AND "approvedShiftSeconds" IS NOT NULL AND "approvedShiftSeconds">=0)));
CREATE TABLE w08_receipt (
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
"actorId" uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
"key" uuid NOT NULL,
"digest" text NOT NULL,
"assignmentId" uuid REFERENCES w08_assignment(id) ON DELETE RESTRICT,
"action" text NOT NULL,
"result" jsonb NOT NULL,
"before" jsonb,
"after" jsonb,
"reason" text NOT NULL,
"createdAt" timestamptz(6) NOT NULL DEFAULT clock_timestamp(),
UNIQUE("actorId",key)
);
CREATE TABLE w08_notification (
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
"recipientId" uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
"assignmentId" uuid NOT NULL REFERENCES w08_assignment(id) ON DELETE RESTRICT,
"kind" text NOT NULL,
"sourceId" uuid NOT NULL,
"createdAt" timestamptz(6) NOT NULL DEFAULT clock_timestamp(),
UNIQUE("recipientId","sourceId",kind)
);
ALTER TABLE permission_grants DROP CONSTRAINT grant_scope;
ALTER TABLE permission_grants ADD CONSTRAINT grant_scope CHECK (
 ("scopeType"='GLOBAL' AND "scopeId" IS NULL AND capability NOT LIKE 'inspection.%' AND capability<>'shift.review' AND capability NOT LIKE 'academic.%' AND capability NOT LIKE 'finance.%' AND (capability NOT LIKE 'support.%' OR capability IN ('support.taxonomy.author','support.taxonomy.approve'))) OR
 ("scopeType"='CLASS' AND "scopeId" IS NOT NULL AND capability IN ('class.read','academic.schedule.approve','academic.rubric.approve','academic.grade.publish','academic.quiz.approve','academic.quiz.grade.publish','academic.meeting.approve','academic.attendance.approve','academic.admission.approve','finance.verify','finance.adjust.propose','finance.adjust.approve')) OR
 ("scopeType"='COURSE' AND "scopeId" IS NOT NULL AND capability='academic.program.approve') OR
 ("scopeType"='SUPPORT_TOPIC' AND "scopeId" ~ '^[A-Z][A-Z0-9_]{2,39}$' AND capability IN ('support.ticket.read','support.ticket.assign','support.ticket.reply','support.ticket.transfer','support.ticket.close','support.application.write','support.application.review','support.referral.respond')) OR ("scopeType"='CLASS' AND "scopeId" IS NOT NULL AND capability IN ('inspection.assign','inspection.hours.review','shift.review')));

ALTER TABLE w08_assignment ADD CHECK (state IN ('ACTIVE','ACKNOWLEDGED','DECLINED','REASSIGNED','INVALIDATED') AND version>=0 AND "endsAt">"startsAt" AND length(trim(reason))>0);
ALTER TABLE w08_assignment ADD CONSTRAINT w08_inspector_no_overlap EXCLUDE USING gist ("inspectorId" WITH =,tstzrange("startsAt","endsAt",'[)') WITH &&) WHERE (state IN ('ACTIVE','ACKNOWLEDGED'));
CREATE UNIQUE INDEX w08_one_inspection_session ON w08_assignment("sessionId") WHERE state IN ('ACTIVE','ACKNOWLEDGED');
CREATE UNIQUE INDEX w08_one_open_segment ON w08_segment("inspectorId") WHERE "stoppedAt" IS NULL;
ALTER TABLE w08_segment ADD CHECK ("stoppedAt" IS NULL OR "stoppedAt">="startedAt");
ALTER TABLE w08_report ADD CHECK (presence IN ('PRESENT','LATE','ABSENT','INACCESSIBLE') AND number>0 AND length(trim(reason))>0 AND length(trim(conditions))>0 AND attestation='TT-REPORTED');
ALTER TABLE w08_decision ADD CHECK(disposition IN ('APPROVE','PARTIAL','REJECT') AND ((disposition='REJECT' AND "approvedSeconds" IS NULL) OR (disposition<>'REJECT' AND "approvedSeconds" IS NOT NULL AND "approvedSeconds">=0)) AND length(trim(reason))>0);
ALTER TABLE w08_clock ADD CHECK(kind IN ('IN','OUT'));
ALTER TABLE w08_correction ADD CHECK(kind IN ('MISSING_CHECKOUT','LATE','EARLY','CANCELLED','WRONG_DEVICE') AND length(trim(reason))>0 AND length(trim(evidence))>0);
ALTER TABLE w08_correction_decision ADD CHECK(disposition IN ('ACCEPT','REJECT') AND length(trim(reason))>0);

CREATE FUNCTION w08_actor() RETURNS uuid LANGUAGE sql STABLE AS $$
 SELECT u.id FROM users u JOIN user_sessions s ON s.sess->>'userId'=u.id::text
 WHERE u.id=nullif(current_setting('app.w08_actor',true),'')::uuid AND u.status='ACTIVE'
 AND s.sid=current_setting('app.w08_session',true) AND s.expire>clock_timestamp()
$$;
CREATE FUNCTION w08_current(a w08_assignment) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM teaching_sessions s JOIN w06_meet m ON m.id=a."meetId"
 WHERE s.id=a."sessionId" AND s.state='PUBLISHED' AND s.revision=a.revision AND s."instructorId"=a."teacherId"
 AND s."startsAt"=a."startsAt" AND s."endsAt"=a."endsAt" AND s."classOfferingId"=a."classId"
 AND s.modality IN ('ONLINE','HYBRID') AND m."sessionId"=s.id AND m.state='APPROVED'
 AND m.number=(SELECT max(number)FROM w06_meet WHERE "sessionId"=s.id)
 AND EXISTS(SELECT 1 FROM class_instructor_assignments x WHERE x.id=s."assignmentId" AND x."instructorId"=a."teacherId" AND x.state IN ('PUBLISHED','SUPERSEDED') AND x."effectiveFrom"<=s."startsAt" AND x."reservedUntil">=s."endsAt"))
$$;
CREATE FUNCTION w08_observed(k uuid) RETURNS integer LANGUAGE sql STABLE AS $$
 SELECT floor(extract(epoch FROM sum(upper(r)-lower(r))))::integer FROM
 (SELECT unnest(range_agg(tstzrange(greatest(g."startedAt",a."startsAt"),least(g."stoppedAt",a."endsAt"),'[)'))) r
 FROM w08_segment g JOIN w08_assignment a ON a.id=g."assignmentId" WHERE a.id=k AND g."stoppedAt" IS NOT NULL AND g."stoppedAt">g."startedAt") x
$$;
CREATE FUNCTION w08_notify(k uuid,c text,src uuid) RETURNS void LANGUAGE sql AS $$
 INSERT INTO w08_notification("recipientId","assignmentId",kind,"sourceId")
 SELECT DISTINCT p,k,c,src FROM w08_assignment a CROSS JOIN LATERAL unnest(ARRAY[a."inspectorId",a."teacherId",a."dispatcherId"])p WHERE a.id=k ON CONFLICT DO NOTHING
$$;
CREATE FUNCTION w08_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE actor uuid:=w08_actor(); a w08_assignment; s teaching_sessions; n timestamptz:=clock_timestamp(); lastkind text; report w08_report; cor w08_correction; clockin timestamptz; clockout timestamptz; prior uuid;
BEGIN
 IF TG_OP IN ('DELETE','TRUNCATE') THEN RAISE EXCEPTION 'W08_IMMUTABLE' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock(842030);
 IF TG_TABLE_NAME='w08_assignment' THEN
  IF TG_OP='UPDATE' AND NEW.state='INVALIDATED' AND NOT w08_current(OLD) AND (to_jsonb(NEW)-ARRAY['state','version'])=(to_jsonb(OLD)-ARRAY['state','version']) THEN RETURN NEW;END IF;
  IF actor IS NULL THEN RAISE EXCEPTION 'W08_ACTOR' USING ERRCODE='42501';END IF;
  IF TG_OP='INSERT' THEN
   IF NOT w06_cap(actor,'inspection.assign',NEW."classId") OR NEW."dispatcherId"<>actor OR NOT EXISTS(SELECT 1 FROM users WHERE id=NEW."inspectorId" AND role='TEACHING_INSPECTOR' AND status='ACTIVE') OR NOT w08_current(NEW) OR NEW.state<>'ACTIVE' OR NEW.version<>0 THEN RAISE EXCEPTION 'W08_DISPATCH' USING ERRCODE='42501';END IF;
  ELSE
   IF (to_jsonb(NEW)-ARRAY['state','version']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','version']) OR NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'W08_ASSIGNMENT_HISTORY' USING ERRCODE='42501';END IF;
   IF NEW.state IS DISTINCT FROM OLD.state AND NOT ((NEW.state IN ('DECLINED','ACKNOWLEDGED') AND OLD.state IN ('ACTIVE','ACKNOWLEDGED') AND actor=OLD."inspectorId") OR (NEW.state='REASSIGNED' AND w06_cap(actor,'inspection.assign',OLD."classId"))) THEN RAISE EXCEPTION 'W08_ASSIGNMENT_STATE' USING ERRCODE='42501';END IF;
   IF NEW.state=OLD.state AND actor<>OLD."inspectorId" AND actor<>OLD."teacherId" AND NOT (w06_cap(actor,'inspection.hours.review',OLD."classId") OR w06_cap(actor,'shift.review',OLD."classId")) THEN RAISE EXCEPTION 'W08_SCOPE' USING ERRCODE='42501';END IF;
  END IF; RETURN NEW;
 END IF;
 IF TG_OP='UPDATE' AND TG_TABLE_NAME<>'w08_segment' THEN RAISE EXCEPTION 'W08_APPEND_ONLY' USING ERRCODE='42501';END IF;
 IF actor IS NULL THEN RAISE EXCEPTION 'W08_ACTOR' USING ERRCODE='42501';END IF;
 IF TG_TABLE_NAME='w08_correction_decision' THEN SELECT * INTO cor FROM w08_correction WHERE id=NEW."correctionId"; SELECT * INTO a FROM w08_assignment WHERE id=cor."assignmentId";
 ELSE SELECT * INTO a FROM w08_assignment WHERE id=NEW."assignmentId";END IF;
 IF a.id IS NULL THEN RAISE EXCEPTION 'W08_NOT_FOUND' USING ERRCODE='42501';END IF;
 IF (TG_TABLE_NAME IN ('w08_report','w08_clock') OR TG_TABLE_NAME='w08_segment' AND TG_OP='INSERT') AND (a.state NOT IN ('ACTIVE','ACKNOWLEDGED') OR NOT w08_current(a)) THEN RAISE EXCEPTION 'W08_STALE' USING ERRCODE='42501';END IF;
 IF TG_TABLE_NAME IN ('w08_segment','w08_report','w08_clock','w08_correction') AND (actor<>a."inspectorId" OR NOT EXISTS(SELECT 1 FROM users WHERE id=actor AND role='TEACHING_INSPECTOR')) THEN RAISE EXCEPTION 'W08_INSPECTOR' USING ERRCODE='42501';END IF;
 IF TG_TABLE_NAME='w08_segment' THEN
  IF NEW."inspectorId"<>actor OR n<a."startsAt" OR n>=a."endsAt" AND TG_OP='INSERT' THEN RAISE EXCEPTION 'W08_SEGMENT_WINDOW' USING ERRCODE='23514';END IF;
  IF TG_OP='INSERT' THEN NEW."startedAt":=n;NEW."stoppedAt":=NULL;
  ELSE IF OLD."stoppedAt" IS NOT NULL OR (to_jsonb(NEW)-'stoppedAt')<>(to_jsonb(OLD)-'stoppedAt') THEN RAISE EXCEPTION 'W08_SEGMENT_IMMUTABLE' USING ERRCODE='42501';END IF; NEW."stoppedAt":=least(n,a."endsAt");END IF;
 ELSIF TG_TABLE_NAME='w08_report' THEN
  IF NEW."reporterId"<>actor OR EXISTS(SELECT 1 FROM w08_segment WHERE "assignmentId"=a.id AND "stoppedAt" IS NULL) OR NOT EXISTS(SELECT 1 FROM w08_segment WHERE "assignmentId"=a.id AND "stoppedAt" IS NOT NULL) THEN RAISE EXCEPTION 'W08_PENDING_EVIDENCE' USING ERRCODE='23514';END IF;
 ELSIF TG_TABLE_NAME='w08_decision' THEN
  SELECT * INTO report FROM w08_report WHERE id=NEW."reportId" AND "assignmentId"=a.id;
  IF NOT w06_cap(actor,'inspection.hours.review',a."classId") OR actor IN(a."inspectorId",a."teacherId") OR NEW."reviewerId"<>actor OR report.id IS NULL OR actor=report."reporterId" OR NOT w08_current(a) OR a.state NOT IN ('ACTIVE','ACKNOWLEDGED') OR report.number<>(SELECT max(number)FROM w08_report WHERE "assignmentId"=a.id) OR (NEW.disposition<>'REJECT' AND (report.presence='INACCESSIBLE' OR NEW."approvedSeconds">coalesce(w08_observed(a.id),-1) OR NEW."approvedSeconds">extract(epoch FROM a."endsAt"-a."startsAt"))) THEN RAISE EXCEPTION 'W08_INDEPENDENT_EVIDENCE_REVIEW' USING ERRCODE='42501';END IF;
 ELSIF TG_TABLE_NAME='w08_dispute' THEN
  IF NEW."teacherId"<>actor OR actor<>a."teacherId" OR NOT EXISTS(SELECT 1 FROM users WHERE id=actor AND role='INSTRUCTOR') THEN RAISE EXCEPTION 'W08_OWN_DISPUTE' USING ERRCODE='42501';END IF;
 ELSIF TG_TABLE_NAME='w08_clock' THEN
  IF NEW."inspectorId"<>actor THEN RAISE EXCEPTION 'W08_CLOCK_IDENTITY' USING ERRCODE='42501';END IF;
  IF n<a."startsAt" OR n>=a."endsAt" THEN RAISE EXCEPTION 'W08_CLOCK_OUTSIDE_SHIFT_CORRECTION_REQUIRED' USING ERRCODE='23514';END IF;
  SELECT kind INTO lastkind FROM w08_clock WHERE "assignmentId"=a.id ORDER BY "createdAt" DESC LIMIT 1;
  IF (NEW.kind='IN' AND lastkind IS NOT NULL) OR (NEW.kind='OUT' AND lastkind IS DISTINCT FROM 'IN') OR (NEW.kind='IN' AND EXISTS(SELECT 1 FROM w08_clock c WHERE c."inspectorId"=actor AND c.kind='IN' AND NOT EXISTS(SELECT 1 FROM w08_clock o WHERE o."assignmentId"=c."assignmentId" AND o.kind='OUT') AND NOT EXISTS(SELECT 1 FROM w08_correction r JOIN w08_correction_decision d ON d."correctionId"=r.id WHERE r."assignmentId"=c."assignmentId" AND r.kind IN ('MISSING_CHECKOUT','CANCELLED') AND d.disposition='ACCEPT'))) THEN RAISE EXCEPTION 'W08_CLOCK_STATE_CORRECTION_REQUIRED' USING ERRCODE='23514';END IF;
 ELSIF TG_TABLE_NAME='w08_correction' THEN
  IF NEW."inspectorId"<>actor THEN RAISE EXCEPTION 'W08_CORRECTION_OWNER' USING ERRCODE='42501';END IF;
  SELECT min("createdAt") INTO clockin FROM w08_clock WHERE "assignmentId"=a.id AND kind='IN';
  SELECT c.id INTO prior FROM w08_correction c JOIN w08_correction_decision d ON d."correctionId"=c.id AND d.disposition='ACCEPT' WHERE c."assignmentId"=a.id ORDER BY c.revision DESC LIMIT 1;
  IF NEW.revision<>coalesce((SELECT max(revision) FROM w08_correction WHERE "assignmentId"=a.id),0)+1 OR NEW."supersedesId" IS DISTINCT FROM prior THEN RAISE EXCEPTION 'W08_CORRECTION_VERSION' USING ERRCODE='23514';END IF;
  IF NEW."proposedOutAt" IS NOT NULL AND (clockin IS NULL OR NEW."proposedOutAt"<clockin OR NEW."proposedOutAt">least(a."endsAt",n)) THEN RAISE EXCEPTION 'W08_CORRECTION_EVIDENCE_BOUNDS' USING ERRCODE='23514';END IF;
 ELSIF TG_TABLE_NAME='w08_correction_decision' THEN
  IF NOT w06_cap(actor,'shift.review',a."classId") OR NEW."reviewerId"<>actor OR actor IN(a."inspectorId",a."teacherId") THEN RAISE EXCEPTION 'W08_SHIFT_REVIEW' USING ERRCODE='42501';END IF;
  IF NEW.revision<>cor.revision THEN RAISE EXCEPTION 'W08_CORRECTION_STALE' USING ERRCODE='23514';END IF;
  NEW."correctedOutAt":=NULL;NEW."approvedShiftSeconds":=NULL;
  IF NEW.disposition='ACCEPT' THEN
   SELECT min("createdAt") INTO clockin FROM w08_clock WHERE "assignmentId"=a.id AND kind='IN';
   SELECT max("createdAt") INTO clockout FROM w08_clock WHERE "assignmentId"=a.id AND kind='OUT';
   clockout:=coalesce(cor."proposedOutAt",clockout);
   SELECT c.id INTO prior FROM w08_correction c JOIN w08_correction_decision d ON d."correctionId"=c.id AND d.disposition='ACCEPT' WHERE c."assignmentId"=a.id ORDER BY c.revision DESC LIMIT 1;
   IF cor.revision<>(SELECT max(revision) FROM w08_correction WHERE "assignmentId"=a.id) OR cor."supersedesId" IS DISTINCT FROM prior OR clockin IS NULL OR clockout IS NULL OR clockout<clockin OR clockout>least(a."endsAt",n) THEN RAISE EXCEPTION 'W08_SHIFT_PENDING_EVIDENCE_OR_STALE' USING ERRCODE='23514';END IF;
   IF EXISTS(SELECT 1 FROM w08_correction c JOIN w08_correction_decision d ON d."correctionId"=c.id AND d.disposition='ACCEPT' JOIN w08_clock i ON i."assignmentId"=c."assignmentId" AND i.kind='IN' WHERE c."inspectorId"=a."inspectorId" AND c."assignmentId"<>a.id AND tstzrange(i."createdAt",d."correctedOutAt",'[)') && tstzrange(clockin,clockout,'[)')) THEN RAISE EXCEPTION 'W08_SHIFT_CORRECTION_OVERLAP' USING ERRCODE='23P01';END IF;
   NEW."correctedOutAt":=clockout;NEW."approvedShiftSeconds":=floor(extract(epoch FROM clockout-clockin))::int;
  END IF;
 END IF;
 IF TG_OP='INSERT' THEN NEW."createdAt":=n;END IF;RETURN NEW;
END $$;
DO $$ DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['w08_assignment','w08_segment','w08_report','w08_decision','w08_dispute','w08_clock','w08_correction','w08_correction_decision'] LOOP
 EXECUTE format('CREATE TRIGGER w08_guard BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION w08_guard()',t);
 EXECUTE format('CREATE TRIGGER w08_no_truncate BEFORE TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION w08_guard()',t);
END LOOP;END $$;
CREATE TABLE w08_revision(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),"assignmentId" uuid NOT NULL REFERENCES w08_assignment(id) ON DELETE RESTRICT,"actorId" uuid REFERENCES users(id) ON DELETE RESTRICT,origin text NOT NULL,"before" jsonb NOT NULL,"after" jsonb NOT NULL,"createdAt" timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE FUNCTION w08_invalidate() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE a w08_assignment;BEGIN
 FOR a IN SELECT * FROM w08_assignment WHERE state IN ('ACTIVE','ACKNOWLEDGED') AND NOT w08_current(w08_assignment) LOOP
  UPDATE w08_assignment SET state='INVALIDATED',version=version+1 WHERE id=a.id;
  PERFORM w08_notify(a.id,'OFFICIAL_REVISION_INVALIDATED',gen_random_uuid());
  INSERT INTO w08_revision("assignmentId","actorId",origin,"before","after") VALUES(a.id,coalesce(w08_actor(),w06_actor()),TG_TABLE_NAME,to_jsonb(a),to_jsonb(a)||jsonb_build_object('state','INVALIDATED','version',a.version+1));
 END LOOP;RETURN NEW;
END $$;
CREATE TRIGGER w08_session_revision AFTER UPDATE ON teaching_sessions FOR EACH ROW EXECUTE FUNCTION w08_invalidate();
CREATE TRIGGER w08_meet_revision AFTER INSERT OR UPDATE ON w06_meet FOR EACH ROW EXECUTE FUNCTION w08_invalidate();
CREATE TRIGGER w08_teacher_revision AFTER UPDATE ON class_instructor_assignments FOR EACH ROW EXECUTE FUNCTION w08_invalidate();
CREATE FUNCTION w08_append_only() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'W08_APPEND_ONLY' USING ERRCODE='42501';END $$;
CREATE TRIGGER w08_receipt_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON w08_receipt FOR EACH STATEMENT EXECUTE FUNCTION w08_append_only();
CREATE TRIGGER w08_outbox_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON w08_notification FOR EACH STATEMENT EXECUTE FUNCTION w08_append_only();
CREATE TRIGGER w08_revision_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON w08_revision FOR EACH STATEMENT EXECUTE FUNCTION w08_append_only();
CREATE FUNCTION w08_assignment_audit() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN
 INSERT INTO w08_revision("assignmentId","actorId",origin,"before","after") VALUES(NEW.id,coalesce(w08_actor(),w06_actor()),'W08_ASSIGNMENT_'||TG_OP,CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) ELSE '{}'::jsonb END,to_jsonb(NEW));RETURN NEW;END $$;
CREATE TRIGGER w08_assignment_audit AFTER INSERT OR UPDATE ON w08_assignment FOR EACH ROW EXECUTE FUNCTION w08_assignment_audit();
COMMIT;
