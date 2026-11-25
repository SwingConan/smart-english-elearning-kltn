-- DEC059/060: candidate33, additive DEV only. No legacy data backfill.
BEGIN;
-- Extend the exact migration32 scope contract; no GLOBAL consultation authority.
ALTER TABLE permission_grants DROP CONSTRAINT grant_scope;
ALTER TABLE permission_grants ADD CONSTRAINT grant_scope CHECK (
 ("scopeType"='GLOBAL' AND "scopeId" IS NULL AND capability NOT LIKE 'consultation.%' AND capability NOT LIKE 'inspection.%' AND capability<>'shift.review' AND capability NOT LIKE 'academic.%' AND capability NOT LIKE 'finance.%' AND (capability NOT LIKE 'support.%' OR capability IN ('support.taxonomy.author','support.taxonomy.approve'))) OR
 ("scopeType"='CLASS' AND "scopeId" IS NOT NULL AND capability IN ('class.read','academic.schedule.approve','academic.rubric.approve','academic.grade.publish','academic.quiz.approve','academic.quiz.grade.publish','academic.meeting.approve','academic.attendance.approve','academic.admission.approve','finance.verify','finance.adjust.propose','finance.adjust.approve','inspection.assign','inspection.hours.review','shift.review')) OR
 ("scopeType"='COURSE' AND "scopeId" IS NOT NULL AND capability='academic.program.approve') OR
 ("scopeType"='SUPPORT_TOPIC' AND "scopeId" ~ '^[A-Z][A-Z0-9_]{2,39}$' AND capability IN ('support.ticket.read','support.ticket.assign','support.ticket.reply','support.ticket.transfer','support.ticket.close','support.application.write','support.application.review','support.referral.respond')) OR
 ("scopeType"='TEACHER' AND "scopeId" ~ '^[0-9a-f-]{36}$' AND capability IN ('consultation.profile.approve','consultation.link.approve','consultation.booking.review')));
CREATE TABLE w05b_profiles (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "teacherId" uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE RESTRICT,
 "currentRevision" integer NOT NULL DEFAULT 0, enabled boolean NOT NULL DEFAULT true,
 "createdAt" timestamptz(3) NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE w05b_profile_revisions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "profileId" uuid NOT NULL REFERENCES w05b_profiles(id) ON DELETE RESTRICT,
 number integer NOT NULL, "displayName" varchar(120) NOT NULL, bio varchar(2000) NOT NULL,
 specialties varchar(500) NOT NULL, "makerId" uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 state varchar(24) NOT NULL DEFAULT 'DRAFT' CHECK(state IN ('DRAFT','APPROVED','REJECTED')),
 "reviewerId" uuid REFERENCES users(id) ON DELETE RESTRICT, "reviewReason" varchar(1000),
 "reviewedAt" timestamptz(3), "createdAt" timestamptz(3) NOT NULL DEFAULT clock_timestamp(),
 UNIQUE("profileId",number), CHECK("reviewerId" IS NULL OR "reviewerId"<>"makerId")
);
CREATE TABLE w05b_availability (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "teacherId" uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 kind varchar(16) NOT NULL CHECK(kind IN ('WEEKLY','LEAVE')),
 weekday integer, "startMinute" integer, "endMinute" integer,
 "startsAt" timestamptz(3), "endsAt" timestamptz(3),
 active boolean NOT NULL DEFAULT true, reason varchar(1000) NOT NULL,
 "createdAt" timestamptz(3) NOT NULL DEFAULT clock_timestamp(),
 CHECK((kind='WEEKLY' AND weekday IS NOT NULL AND "startMinute" IS NOT NULL AND "endMinute" IS NOT NULL AND weekday BETWEEN 0 AND 6 AND "startMinute">=0 AND "endMinute"<=1440 AND "endMinute">"startMinute" AND "startsAt" IS NULL AND "endsAt" IS NULL) OR
       (kind='LEAVE' AND "startsAt" IS NOT NULL AND "endsAt" IS NOT NULL AND weekday IS NULL AND "startMinute" IS NULL AND "endMinute" IS NULL AND "endsAt">"startsAt"))
);
CREATE TABLE w05b_bookings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "teacherId" uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 "learnerId" uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 "profileRevisionId" uuid NOT NULL REFERENCES w05b_profile_revisions(id) ON DELETE RESTRICT,
 "startsAt" timestamptz(3) NOT NULL, "endsAt" timestamptz(3) NOT NULL,
 "reservedFrom" timestamptz(3) NOT NULL, "reservedUntil" timestamptz(3) NOT NULL,
 state varchar(24) NOT NULL DEFAULT 'HOLD' CHECK(state IN ('HOLD','PENDING_GV','CONFIRMED','REJECTED','EXPIRED','CANCELLED','SUPERSEDED')),
 "expiresAt" timestamptz(3), topic varchar(1000) NOT NULL DEFAULT '', version integer NOT NULL DEFAULT 0,
 "linkRevision" integer NOT NULL DEFAULT 0, "replacesId" uuid REFERENCES w05b_bookings(id) ON DELETE RESTRICT,
 "createdAt" timestamptz(3) NOT NULL DEFAULT clock_timestamp(),
 CHECK("endsAt"="startsAt"+interval '30 minutes'),
 CHECK("reservedFrom"="startsAt"-interval '10 minutes' AND "reservedUntil"="endsAt"+interval '10 minutes'),
 CHECK((state IN ('HOLD','PENDING_GV') AND "expiresAt" IS NOT NULL) OR (state NOT IN ('HOLD','PENDING_GV') AND "expiresAt" IS NULL)),
 CONSTRAINT w05b_teacher_no_overlap EXCLUDE USING gist ("teacherId" WITH =,tstzrange("reservedFrom","reservedUntil",'[)') WITH &&) WHERE(state IN ('HOLD','PENDING_GV','CONFIRMED'))
);
CREATE INDEX w05b_learner_state ON w05b_bookings("learnerId",state,"startsAt");
CREATE TABLE w05b_links (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "bookingId" uuid NOT NULL REFERENCES w05b_bookings(id) ON DELETE RESTRICT,
 number integer NOT NULL, url varchar(500) NOT NULL, "makerId" uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 state varchar(24) NOT NULL DEFAULT 'PENDING' CHECK(state IN ('PENDING','APPROVED','REJECTED')),
 "reviewerId" uuid REFERENCES users(id) ON DELETE RESTRICT, reason varchar(1000) NOT NULL,
 "reviewReason" varchar(1000), "createdAt" timestamptz(3) NOT NULL DEFAULT clock_timestamp(), "reviewedAt" timestamptz(3),
 UNIQUE("bookingId",number), CHECK("reviewerId" IS NULL OR "reviewerId"<>"makerId"),
 CHECK(url ~ '^https://meet[.]google[.]com/[a-z]{3}-[a-z]{4}-[a-z]{3}$')
);
CREATE TABLE w05b_changes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "bookingId" uuid NOT NULL REFERENCES w05b_bookings(id) ON DELETE RESTRICT,
 "makerId" uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 kind varchar(16) NOT NULL CHECK(kind IN ('CANCEL','RESCHEDULE')),
 "newStartsAt" timestamptz(3), "baseVersion" integer NOT NULL,
 reason varchar(1000) NOT NULL, state varchar(24) NOT NULL DEFAULT 'PENDING' CHECK(state IN ('PENDING','APPROVED','REJECTED')),
 "reviewerId" uuid REFERENCES users(id) ON DELETE RESTRICT, "reviewReason" varchar(1000),
 "createdAt" timestamptz(3) NOT NULL DEFAULT clock_timestamp(), "reviewedAt" timestamptz(3),
 CHECK((kind='RESCHEDULE')=("newStartsAt" IS NOT NULL)), CHECK("reviewerId" IS NULL OR "reviewerId"<>"makerId")
);
CREATE TABLE w05b_reports (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "bookingId" uuid NOT NULL REFERENCES w05b_bookings(id) ON DELETE RESTRICT,
 "makerId" uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 "parentId" uuid REFERENCES w05b_reports(id) ON DELETE RESTRICT,
 kind varchar(16) NOT NULL CHECK(kind IN ('NO_SHOW','DISPUTE')), evidence varchar(2000) NOT NULL,
 "createdAt" timestamptz(3) NOT NULL DEFAULT clock_timestamp(),
 CHECK((kind='DISPUTE')=("parentId" IS NOT NULL))
);
CREATE TABLE w05b_commands (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "actorId" uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 key uuid NOT NULL, payload jsonb NOT NULL, result jsonb NOT NULL,
 "createdAt" timestamptz(3) NOT NULL DEFAULT clock_timestamp(), UNIQUE("actorId",key)
);
CREATE TABLE w05b_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "actorId" uuid REFERENCES users(id) ON DELETE RESTRICT,
 "objectId" uuid NOT NULL, kind varchar(48) NOT NULL, reason varchar(2000) NOT NULL,
 "createdAt" timestamptz(3) NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE w05b_outbox (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "eventId" uuid NOT NULL REFERENCES w05b_events(id) ON DELETE RESTRICT,
 "recipientId" uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT, "createdAt" timestamptz(3) NOT NULL DEFAULT clock_timestamp(),
 UNIQUE("eventId","recipientId")
);

CREATE FUNCTION w05b_actor(a uuid,sid text) RETURNS text LANGUAGE sql STABLE AS $$
 SELECT u.role::text FROM users u JOIN user_sessions s ON s.sess->>'userId'=u.id::text
 WHERE u.id=a AND u.status='ACTIVE' AND s.sid=sid AND s.expire>clock_timestamp()
$$;
CREATE FUNCTION w05b_permit(a uuid,cap text,teacher uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM users u JOIN permission_grants g ON g."userId"=u.id
 WHERE u.id=a AND u.role='ACADEMIC_MANAGER' AND u.status='ACTIVE' AND g.capability=cap
 AND g."scopeType"='TEACHER' AND g."scopeId"=teacher::text AND g."approvedBy" IS NOT NULL
 AND g."approvedAt"<=clock_timestamp() AND g."effectiveAt"<=clock_timestamp() AND g."expiresAt">clock_timestamp() AND g."revokedAt" IS NULL)
$$;
CREATE FUNCTION w05b_emit(a uuid,obj uuid,k text,r text,recipients uuid[]) RETURNS void LANGUAGE plpgsql AS $$
 DECLARE eid uuid;
 BEGIN
 INSERT INTO w05b_events("actorId","objectId",kind,reason) VALUES(a,obj,k,r) RETURNING id INTO eid;
 INSERT INTO w05b_outbox("eventId","recipientId") SELECT eid,x FROM unnest(recipients) x WHERE x IS NOT NULL GROUP BY x;
 END $$;
CREATE FUNCTION w05b_expire() RETURNS integer LANGUAGE plpgsql AS $$
 DECLARE b w05b_bookings; n integer:=0;
 BEGIN
 PERFORM pg_advisory_xact_lock(842030);
 FOR b IN SELECT * FROM w05b_bookings WHERE state IN ('HOLD','PENDING_GV') AND "expiresAt"<=clock_timestamp() FOR UPDATE LOOP
 UPDATE w05b_bookings SET state='EXPIRED',"expiresAt"=NULL,version=version+1 WHERE id=b.id;
 PERFORM w05b_emit(NULL,b.id,'EXPIRED','Server reservation deadline elapsed',ARRAY[b."learnerId",b."teacherId"]);n:=n+1;
 END LOOP;RETURN n;
 END $$;
CREATE FUNCTION w05b_request_at(n timestamptz,st timestamptz) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
 SELECT st>=n+interval '24 hours' AND st<=n+interval '14 days'
$$;
CREATE FUNCTION w05b_slot(teacher uuid,st timestamptz,en timestamptz) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT en=st+interval '30 minutes' AND st>clock_timestamp()
 AND EXISTS(SELECT 1 FROM users WHERE id=teacher AND role='INSTRUCTOR' AND status='ACTIVE')
 AND EXISTS(SELECT 1 FROM w05b_availability a WHERE a."teacherId"=teacher AND a.active AND a.kind='WEEKLY'
   AND a.weekday=extract(dow FROM st AT TIME ZONE 'Asia/Ho_Chi_Minh')::int
   AND st AT TIME ZONE 'Asia/Ho_Chi_Minh'>=(date_trunc('day',st AT TIME ZONE 'Asia/Ho_Chi_Minh')+a."startMinute"*interval '1 minute')
   AND en AT TIME ZONE 'Asia/Ho_Chi_Minh'<=(date_trunc('day',st AT TIME ZONE 'Asia/Ho_Chi_Minh')+a."endMinute"*interval '1 minute'))
 AND NOT EXISTS(SELECT 1 FROM w05b_availability a WHERE a."teacherId"=teacher AND a.active AND a.kind='LEAVE'
    AND tstzrange(a."startsAt",a."endsAt",'[)') && tstzrange(st-interval '10 minutes',en+interval '10 minutes','[)'))
 AND NOT EXISTS(SELECT 1 FROM teaching_sessions t WHERE t."instructorId"=teacher AND t.state='PUBLISHED'
    AND EXISTS(SELECT 1 FROM class_instructor_assignments x WHERE x.id=t."assignmentId" AND x."instructorId"=teacher AND x.state IN ('PUBLISHED','SUPERSEDED') AND x."effectiveFrom"<=t."startsAt" AND x."reservedUntil">=t."endsAt")
    AND tstzrange(t."startsAt",t."endsAt",'[)') && tstzrange(st-interval '10 minutes',en+interval '10 minutes','[)'))
$$;
CREATE FUNCTION w05b_visible_link(b w05b_bookings,a uuid) RETURNS text LANGUAGE sql STABLE AS $$
 SELECT l.url FROM w05b_links l JOIN users u ON u.id=a AND u.status='ACTIVE'
 WHERE b.state='CONFIRMED' AND ((a=b."learnerId" AND u.role='STUDENT') OR (a=b."teacherId" AND u.role='INSTRUCTOR'))
 AND clock_timestamp()>=b."startsAt" AND clock_timestamp()<b."endsAt" AND l."bookingId"=b.id
 AND l.number=b."linkRevision" AND l.state='APPROVED'
$$;

-- Immutable history and gateway-only writes, including raw SQL clients.
CREATE FUNCTION w05b_guard() RETURNS trigger LANGUAGE plpgsql AS $$
 BEGIN
 PERFORM pg_advisory_xact_lock(842030);
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'W05B_HISTORY_IMMUTABLE';END IF;
 IF coalesce(current_setting('app.w05b_command',true),'')<>'DEC060' THEN RAISE EXCEPTION 'W05B_GATEWAY_REQUIRED';END IF;
 IF TG_OP='UPDATE' AND TG_TABLE_NAME IN ('w05b_commands','w05b_events','w05b_outbox','w05b_reports') THEN RAISE EXCEPTION 'W05B_HISTORY_IMMUTABLE';END IF;
 IF TG_OP='UPDATE' AND TG_TABLE_NAME IN ('w05b_profile_revisions','w05b_links','w05b_changes') THEN
  IF OLD.state NOT IN ('DRAFT','PENDING') OR NEW.state NOT IN ('APPROVED','REJECTED') OR NEW."reviewerId" IS NULL
     OR (to_jsonb(OLD)-ARRAY['state','reviewerId','reviewReason','reviewedAt'])<>(to_jsonb(NEW)-ARRAY['state','reviewerId','reviewReason','reviewedAt'])
  THEN RAISE EXCEPTION 'W05B_REVISION_IMMUTABLE';END IF;
 END IF;
 RETURN NEW;
 END $$;
DO $$ DECLARE n text; BEGIN FOREACH n IN ARRAY ARRAY['profiles','profile_revisions','availability','bookings','links','changes','reports','commands','events','outbox'] LOOP
 EXECUTE format('CREATE TRIGGER w05b_write BEFORE INSERT OR UPDATE OR DELETE ON w05b_%I FOR EACH ROW EXECUTE FUNCTION w05b_guard()',n);
 END LOOP;END $$;

CREATE FUNCTION w05b_booking_guard() RETURNS trigger LANGUAGE plpgsql AS $$
 DECLARE a uuid:=nullif(current_setting('app.w05b_actor',true),'')::uuid;
 BEGIN
 IF TG_OP='UPDATE' THEN
  IF NEW.version<>OLD.version+1 OR NEW."teacherId"<>OLD."teacherId" OR NEW."learnerId"<>OLD."learnerId"
   OR NEW."profileRevisionId"<>OLD."profileRevisionId" OR NEW."startsAt"<>OLD."startsAt" OR NEW."endsAt"<>OLD."endsAt"
   OR NEW."reservedFrom"<>OLD."reservedFrom" OR NEW."reservedUntil"<>OLD."reservedUntil" OR NEW."replacesId" IS DISTINCT FROM OLD."replacesId"
  THEN RAISE EXCEPTION 'W05B_BOOKING_IMMUTABLE_OR_STALE';END IF;
  IF NEW.state='EXPIRED' AND (OLD.state NOT IN ('HOLD','PENDING_GV') OR OLD."expiresAt">clock_timestamp()) THEN RAISE EXCEPTION 'W05B_EARLY_EXPIRY';END IF;
  IF OLD.state NOT IN ('HOLD','PENDING_GV','CONFIRMED') THEN RAISE EXCEPTION 'W05B_TERMINAL_BOOKING';END IF;
 END IF;
 IF TG_OP='INSERT' OR (NEW.state IN ('PENDING_GV','CONFIRMED') AND OLD.state<>NEW.state) THEN
  IF NOT w05b_slot(NEW."teacherId",NEW."startsAt",NEW."endsAt") THEN RAISE EXCEPTION 'W05B_SLOT_UNAVAILABLE';END IF;
 END IF;
 IF TG_OP='INSERT' THEN
  IF NOT EXISTS(SELECT 1 FROM users WHERE id=NEW."learnerId" AND status='ACTIVE' AND role='STUDENT') THEN RAISE EXCEPTION 'W05B_LEARNER_REQUIRED';END IF;
  IF NOT EXISTS(SELECT 1 FROM w05b_profile_revisions r JOIN w05b_profiles p ON p.id=r."profileId" JOIN users u ON u.id=p."teacherId"
    WHERE r.id=NEW."profileRevisionId" AND r.number=p."currentRevision" AND p.enabled AND r.state='APPROVED' AND p."teacherId"=NEW."teacherId" AND u.status='ACTIVE' AND u.role='INSTRUCTOR')
  THEN RAISE EXCEPTION 'W05B_APPROVED_PROFILE_REQUIRED';END IF;
  IF NOT w05b_request_at(clock_timestamp(),NEW."startsAt") OR NEW.state<>'HOLD' OR NEW."expiresAt">clock_timestamp()+interval '5 minutes' OR NEW."expiresAt"<=clock_timestamp()
   OR EXISTS(SELECT 1 FROM w05b_bookings WHERE "learnerId"=NEW."learnerId" AND state='HOLD')
  THEN RAISE EXCEPTION 'W05B_ONE_HOLD_REQUIRED';END IF;
 END IF;
 IF NEW.state='PENDING_GV' AND (TG_OP='INSERT' OR OLD.state<>NEW.state) THEN
  IF (SELECT count(*) FROM w05b_bookings WHERE "learnerId"=NEW."learnerId" AND state='PENDING_GV' AND id<>NEW.id)>=2 THEN RAISE EXCEPTION 'W05B_TWO_PENDING_LIMIT';END IF;
  IF NOT EXISTS(SELECT 1 FROM w05b_profiles p JOIN w05b_profile_revisions r ON r."profileId"=p.id AND r.number=p."currentRevision" WHERE p."teacherId"=NEW."teacherId" AND p.enabled AND r.state='APPROVED') THEN RAISE EXCEPTION 'W05B_APPROVED_PROFILE_REQUIRED';END IF;
 END IF;
 RETURN NEW;
 END $$;
CREATE TRIGGER w05b_booking_rules BEFORE INSERT OR UPDATE ON w05b_bookings FOR EACH ROW EXECUTE FUNCTION w05b_booking_guard();

-- Both booking commands and official publication take the established scheduling lock.
CREATE FUNCTION w05b_official_conflict() RETURNS trigger LANGUAGE plpgsql AS $$
 BEGIN
 PERFORM pg_advisory_xact_lock(842030);
 IF NEW.state='PUBLISHED' AND NEW."instructorId" IS NOT NULL AND EXISTS(
 SELECT 1 FROM w05b_bookings b WHERE b."teacherId"=NEW."instructorId" AND
 (b.state='CONFIRMED' OR (b.state IN ('HOLD','PENDING_GV') AND b."expiresAt">clock_timestamp()))
 AND tstzrange(b."reservedFrom",b."reservedUntil",'[)') && tstzrange(NEW."startsAt",NEW."endsAt",'[)'))
 THEN RAISE EXCEPTION 'W05B_OFFICIAL_CONSULTATION_CONFLICT';END IF; RETURN NEW;
 END $$;
CREATE TRIGGER w05b_official_booking_conflict BEFORE INSERT OR UPDATE OF state,"startsAt","endsAt","instructorId" ON teaching_sessions FOR EACH ROW EXECUTE FUNCTION w05b_official_conflict();

CREATE FUNCTION w05b_command(a uuid,sid text,k uuid,p jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
 DECLARE role text; op text:=p->>'op'; obj uuid:=nullif(p->>'id','')::uuid; target uuid:=nullif(p->>'teacherId','')::uuid;
 r w05b_profile_revisions; pr w05b_profiles; b w05b_bookings; replacement w05b_bookings;
 l w05b_links; c w05b_changes; report w05b_reports; cached w05b_commands;
 result jsonb; st timestamptz; en timestamptz; why text:=coalesce(p->>'reason','');
 BEGIN
 PERFORM pg_advisory_xact_lock(842030);
 role:=w05b_actor(a,sid);IF role IS NULL THEN RAISE EXCEPTION 'W05B_AUTH_REQUIRED' USING ERRCODE='42501';END IF;
 IF role NOT IN ('STUDENT','INSTRUCTOR','ACADEMIC_MANAGER') THEN RAISE EXCEPTION 'W05B_ROLE_DENIED' USING ERRCODE='42501';END IF;
 PERFORM set_config('app.w05b_command','DEC060',true);PERFORM set_config('app.w05b_actor',a::text,true);
 PERFORM w05b_expire();
 SELECT * INTO cached FROM w05b_commands WHERE "actorId"=a AND key=k;
 IF FOUND THEN
  IF cached.payload<>p THEN RAISE EXCEPTION 'W05B_IDEMPOTENCY_CONFLICT';END IF;
  RETURN cached.result; -- Only IDs/state, never a meeting URL or private third-party record.
 END IF;
 IF op='PROFILE_SAVE' THEN
  IF role<>'INSTRUCTOR' THEN RAISE EXCEPTION 'W05B_ROLE_DENIED' USING ERRCODE='42501';END IF;
  IF length(p->>'displayName') NOT BETWEEN 2 AND 120 OR length(p->>'bio') NOT BETWEEN 10 AND 2000 OR length(p->>'specialties') NOT BETWEEN 2 AND 500 OR p->>'displayName' IS NULL OR p->>'bio' IS NULL OR p->>'specialties' IS NULL THEN RAISE EXCEPTION 'W05B_PROFILE_INVALID';END IF;
  INSERT INTO w05b_profiles("teacherId") VALUES(a) ON CONFLICT("teacherId") DO NOTHING;
  UPDATE w05b_profiles SET "currentRevision"="currentRevision"+1 WHERE "teacherId"=a RETURNING * INTO pr;
  INSERT INTO w05b_profile_revisions("profileId",number,"displayName",bio,specialties,"makerId") VALUES(pr.id,pr."currentRevision",p->>'displayName',p->>'bio',p->>'specialties',a) RETURNING * INTO r;
  result:=jsonb_build_object('id',r.id,'state',r.state,'number',r.number);
  PERFORM w05b_emit(a,r.id,op,'Public profile draft saved',ARRAY[a]);
 ELSIF op IN ('PROFILE_APPROVE','PROFILE_REJECT','PROFILE_DISABLE','PROFILE_ENABLE') THEN
  IF op IN ('PROFILE_DISABLE','PROFILE_ENABLE') THEN SELECT * INTO pr FROM w05b_profiles WHERE id=obj;ELSE SELECT * INTO r FROM w05b_profile_revisions WHERE id=obj;SELECT * INTO pr FROM w05b_profiles WHERE id=r."profileId";END IF;
  IF pr.id IS NULL OR (a<>pr."teacherId" AND NOT w05b_permit(a,'consultation.profile.approve',pr."teacherId")) THEN RAISE EXCEPTION 'W05B_NOT_FOUND' USING ERRCODE='42501';END IF;
  IF op IN ('PROFILE_APPROVE','PROFILE_REJECT') THEN
   IF NOT w05b_permit(a,'consultation.profile.approve',pr."teacherId") OR a=r."makerId" OR a=pr."teacherId" THEN RAISE EXCEPTION 'W05B_INDEPENDENT_REVIEW_REQUIRED' USING ERRCODE='42501';END IF;
   IF r.state<>'DRAFT' OR r.number<>pr."currentRevision" OR length(why)<10 THEN RAISE EXCEPTION 'W05B_STALE_REVIEW';END IF;
   UPDATE w05b_profile_revisions SET state=CASE WHEN op='PROFILE_APPROVE' THEN 'APPROVED' ELSE 'REJECTED' END,"reviewerId"=a,"reviewReason"=why,"reviewedAt"=clock_timestamp() WHERE id=r.id;
  ELSE
   IF length(why)<10 THEN RAISE EXCEPTION 'W05B_REASON_REQUIRED';END IF;
   IF op='PROFILE_ENABLE' AND (a=pr."teacherId" OR NOT w05b_permit(a,'consultation.profile.approve',pr."teacherId")) THEN RAISE EXCEPTION 'W05B_INDEPENDENT_REVIEW_REQUIRED' USING ERRCODE='42501';END IF;
   UPDATE w05b_profiles SET enabled=(op='PROFILE_ENABLE') WHERE id=pr.id;
  END IF;
  result:=jsonb_build_object('id',obj,'ok',true);PERFORM w05b_emit(a,obj,op,why,ARRAY[pr."teacherId"]);
 ELSIF op IN ('AVAILABILITY_ADD','AVAILABILITY_REMOVE') THEN
  IF role<>'INSTRUCTOR' OR length(why)<10 THEN RAISE EXCEPTION 'W05B_ROLE_OR_REASON_DENIED' USING ERRCODE='42501';END IF;
  IF op='AVAILABILITY_REMOVE' THEN
   UPDATE w05b_availability SET active=false WHERE id=obj AND "teacherId"=a AND active;IF NOT FOUND THEN RAISE EXCEPTION 'W05B_NOT_FOUND' USING ERRCODE='42501';END IF;
  ELSE
   st:=nullif(p->>'startsAt','')::timestamptz;en:=nullif(p->>'endsAt','')::timestamptz;
   IF p->>'kind'='LEAVE' AND EXISTS(SELECT 1 FROM w05b_bookings WHERE "teacherId"=a AND state IN ('HOLD','PENDING_GV','CONFIRMED') AND tstzrange("reservedFrom","reservedUntil",'[)') && tstzrange(st,en,'[)')) THEN RAISE EXCEPTION 'W05B_RESOLVE_BOOKINGS_BEFORE_LEAVE';END IF;
   INSERT INTO w05b_availability("teacherId",kind,weekday,"startMinute","endMinute","startsAt","endsAt",reason) VALUES(a,p->>'kind',(p->>'weekday')::int,(p->>'startMinute')::int,(p->>'endMinute')::int,st,en,why) RETURNING id INTO obj;
  END IF;
  result:=jsonb_build_object('id',obj,'ok',true);PERFORM w05b_emit(a,obj,op,why,ARRAY[a]);
 ELSIF op='HOLD' THEN
  IF role<>'STUDENT' THEN RAISE EXCEPTION 'W05B_LEARNER_REQUIRED' USING ERRCODE='42501';END IF;
  IF (SELECT count(*) FROM w05b_bookings WHERE "learnerId"=a AND state='PENDING_GV')>=2 THEN RAISE EXCEPTION 'W05B_TWO_PENDING_LIMIT';END IF;
  st:=(p->>'startsAt')::timestamptz;en:=st+interval '30 minutes';
  SELECT r1.* INTO r FROM w05b_profiles p1 JOIN w05b_profile_revisions r1 ON r1."profileId"=p1.id AND r1.number=p1."currentRevision" WHERE p1."teacherId"=target AND p1.enabled AND r1.state='APPROVED';
  IF r.id IS NULL THEN RAISE EXCEPTION 'W05B_APPROVED_PROFILE_REQUIRED';END IF;
  INSERT INTO w05b_bookings("teacherId","learnerId","profileRevisionId","startsAt","endsAt","reservedFrom","reservedUntil","expiresAt") VALUES(target,a,r.id,st,en,st-interval '10 minutes',en+interval '10 minutes',clock_timestamp()+interval '5 minutes') RETURNING * INTO b;
  obj:=b.id;result:=jsonb_build_object('id',b.id,'state',b.state,'expiresAt',b."expiresAt",'version',b.version);PERFORM w05b_emit(a,b.id,op,'Temporary five-minute reservation',ARRAY[a]);
 ELSIF op IN ('SUBMIT','CONFIRM','REJECT','CANCEL','RESCHEDULE','CHANGE_REQUEST','CHANGE_APPROVE','CHANGE_REJECT','LINK_PROPOSE','LINK_APPROVE','LINK_REJECT','NO_SHOW','DISPUTE') THEN
  IF op IN ('CHANGE_APPROVE','CHANGE_REJECT') THEN SELECT * INTO c FROM w05b_changes WHERE id=obj;obj:=c."bookingId";END IF;
  IF op IN ('LINK_APPROVE','LINK_REJECT') THEN SELECT * INTO l FROM w05b_links WHERE id=obj;obj:=l."bookingId";END IF;
  SELECT * INTO b FROM w05b_bookings WHERE id=obj FOR UPDATE;
  IF b.id IS NULL OR NOT ((a=b."learnerId" AND role='STUDENT') OR (a=b."teacherId" AND role='INSTRUCTOR') OR
    (role='ACADEMIC_MANAGER' AND ((op IN ('LINK_APPROVE','LINK_REJECT') AND w05b_permit(a,'consultation.link.approve',b."teacherId")) OR (op IN ('CHANGE_APPROVE','CHANGE_REJECT') AND w05b_permit(a,'consultation.booking.review',b."teacherId")))))
  THEN RAISE EXCEPTION 'W05B_NOT_FOUND' USING ERRCODE='42501';END IF;
  IF op='SUBMIT' THEN
   IF a<>b."learnerId" OR b.state<>'HOLD' OR b."expiresAt"<=clock_timestamp() OR length(p->>'topic') NOT BETWEEN 10 AND 1000 OR p->>'topic' IS NULL THEN RAISE EXCEPTION 'W05B_STALE_HOLD';END IF;
   UPDATE w05b_bookings SET state='PENDING_GV',topic=p->>'topic',"expiresAt"=clock_timestamp()+interval '12 hours',version=version+1 WHERE id=b.id;
  ELSIF op IN ('CONFIRM','REJECT') THEN
   IF a<>b."teacherId" OR role<>'INSTRUCTOR' OR b.state<>'PENDING_GV' OR b."expiresAt"<=clock_timestamp() THEN RAISE EXCEPTION 'W05B_STALE_DECISION';END IF;
   UPDATE w05b_bookings SET state=CASE WHEN op='CONFIRM' THEN 'CONFIRMED' ELSE 'REJECTED' END,"expiresAt"=NULL,version=version+1 WHERE id=b.id;
  ELSIF op IN ('CANCEL','RESCHEDULE','CHANGE_APPROVE','CHANGE_REJECT') THEN
   IF b.state NOT IN ('PENDING_GV','CONFIRMED','HOLD') THEN RAISE EXCEPTION 'W05B_STALE_BOOKING';END IF;
   IF op IN ('CANCEL','RESCHEDULE') THEN
    IF a<>b."learnerId" OR b."startsAt"<clock_timestamp()+interval '12 hours' OR length(why)<10 OR (p->>'version')::int IS DISTINCT FROM b.version THEN RAISE EXCEPTION 'W05B_LATE_REVIEW_OR_CAS_REQUIRED';END IF;
   ELSE
    IF c.state<>'PENDING' OR c."baseVersion"<>b.version OR a=c."makerId" OR NOT ((a=b."teacherId" AND role='INSTRUCTOR') OR w05b_permit(a,'consultation.booking.review',b."teacherId")) OR length(why)<10 THEN RAISE EXCEPTION 'W05B_INDEPENDENT_REVIEW_REQUIRED' USING ERRCODE='42501';END IF;
    UPDATE w05b_changes SET state=CASE WHEN op='CHANGE_APPROVE' THEN 'APPROVED' ELSE 'REJECTED' END,"reviewerId"=a,"reviewReason"=why,"reviewedAt"=clock_timestamp() WHERE id=c.id;
   END IF;
   IF op<>'CHANGE_REJECT' THEN
    IF op='RESCHEDULE' OR (op='CHANGE_APPROVE' AND c.kind='RESCHEDULE') THEN
     st:=CASE WHEN op='RESCHEDULE' THEN (p->>'startsAt')::timestamptz ELSE c."newStartsAt" END;en:=st+interval '30 minutes';
     -- Free old range only inside the same transaction; any failure restores it.
     UPDATE w05b_bookings SET state='SUPERSEDED',"expiresAt"=NULL,version=version+1 WHERE id=b.id;
     SELECT r1.* INTO r FROM w05b_profiles p1 JOIN w05b_profile_revisions r1 ON r1."profileId"=p1.id AND r1.number=p1."currentRevision" WHERE p1."teacherId"=b."teacherId" AND p1.enabled AND r1.state='APPROVED';
     INSERT INTO w05b_bookings("teacherId","learnerId","profileRevisionId","startsAt","endsAt","reservedFrom","reservedUntil","expiresAt","replacesId",topic) VALUES(b."teacherId",b."learnerId",r.id,st,en,st-interval '10 minutes',en+interval '10 minutes',clock_timestamp()+interval '5 minutes',b.id,b.topic) RETURNING * INTO replacement;
     UPDATE w05b_bookings SET state='PENDING_GV',"expiresAt"=clock_timestamp()+interval '12 hours',version=version+1 WHERE id=replacement.id;
    ELSE UPDATE w05b_bookings SET state='CANCELLED',"expiresAt"=NULL,version=version+1 WHERE id=b.id;END IF;
   END IF;
  ELSIF op='CHANGE_REQUEST' THEN
   IF b.state NOT IN ('PENDING_GV','CONFIRMED') OR length(why)<10 OR (p->>'version')::int IS DISTINCT FROM b.version OR role NOT IN ('STUDENT','INSTRUCTOR') THEN RAISE EXCEPTION 'W05B_CHANGE_INVALID';END IF;
   INSERT INTO w05b_changes("bookingId","makerId",kind,"newStartsAt","baseVersion",reason) VALUES(b.id,a,p->>'kind',nullif(p->>'startsAt','')::timestamptz,b.version,why) RETURNING id INTO obj;
  ELSIF op='LINK_PROPOSE' THEN
   IF a<>b."teacherId" OR role<>'INSTRUCTOR' OR b.state<>'CONFIRMED' OR length(why)<10 THEN RAISE EXCEPTION 'W05B_LINK_DENIED' USING ERRCODE='42501';END IF;
   IF EXISTS(SELECT 1 FROM w06_meet WHERE url=p->>'url') THEN RAISE EXCEPTION 'W05B_CLASS_LINK_REUSE_DENIED';END IF;
   UPDATE w05b_bookings SET "linkRevision"="linkRevision"+1,version=version+1 WHERE id=b.id RETURNING * INTO b;
   INSERT INTO w05b_links("bookingId",number,url,"makerId",reason) VALUES(b.id,b."linkRevision",p->>'url',a,why) RETURNING id INTO obj;
  ELSIF op IN ('LINK_APPROVE','LINK_REJECT') THEN
   IF NOT w05b_permit(a,'consultation.link.approve',b."teacherId") OR a=l."makerId" OR a IN (b."teacherId",b."learnerId") THEN RAISE EXCEPTION 'W05B_INDEPENDENT_REVIEW_REQUIRED' USING ERRCODE='42501';END IF;
   IF b.state<>'CONFIRMED' OR b."linkRevision"<>l.number OR l.state<>'PENDING' OR length(why)<10 THEN RAISE EXCEPTION 'W05B_STALE_LINK';END IF;
   UPDATE w05b_links SET state=CASE WHEN op='LINK_APPROVE' THEN 'APPROVED' ELSE 'REJECTED' END,"reviewerId"=a,"reviewReason"=why,"reviewedAt"=clock_timestamp() WHERE id=l.id;obj:=l.id;
  ELSIF op IN ('NO_SHOW','DISPUTE') THEN
   IF role NOT IN ('STUDENT','INSTRUCTOR') OR b.state<>'CONFIRMED' OR clock_timestamp()<b."endsAt" OR length(p->>'evidence') NOT BETWEEN 10 AND 2000 OR p->>'evidence' IS NULL THEN RAISE EXCEPTION 'W05B_REPORT_EVIDENCE_REQUIRED';END IF;
   IF op='DISPUTE' THEN
    SELECT * INTO report FROM w05b_reports WHERE id=(p->>'parentId')::uuid AND "bookingId"=b.id AND kind='NO_SHOW';
    IF report.id IS NULL OR report."makerId"=a THEN RAISE EXCEPTION 'W05B_REPORT_NOT_FOUND' USING ERRCODE='42501';END IF;
   END IF;
   INSERT INTO w05b_reports("bookingId","makerId","parentId",kind,evidence) VALUES(b.id,a,CASE WHEN op='DISPUTE' THEN report.id END,op,p->>'evidence') RETURNING id INTO obj;
  END IF;
  result:=jsonb_build_object('id',coalesce(replacement.id,obj),'bookingId',b.id,'ok',true);
  PERFORM w05b_emit(a,b.id,op,coalesce(nullif(why,''),'Consultation state updated'),ARRAY[b."learnerId",b."teacherId"]);
 ELSE RAISE EXCEPTION 'W05B_UNKNOWN_COMMAND';
 END IF;
 INSERT INTO w05b_commands("actorId",key,payload,result) VALUES(a,k,p,result);RETURN result;
 END $$;

-- Background expiry has no actor and cannot renew, retake, or change a deadline.
CREATE FUNCTION w05b_sweep() RETURNS integer LANGUAGE plpgsql AS $$
 BEGIN PERFORM set_config('app.w05b_command','DEC060',true);RETURN w05b_expire();END $$;
COMMIT;
