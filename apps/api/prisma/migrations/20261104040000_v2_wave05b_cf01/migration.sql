-- DEC061 additive candidate34: preserve all original1–33 SQL and history.
BEGIN;
CREATE OR REPLACE FUNCTION w05b_booking_guard() RETURNS trigger LANGUAGE plpgsql AS $$
 DECLARE a uuid:=nullif(current_setting('app.w05b_actor',true),'')::uuid;
 BEGIN
 IF TG_OP='UPDATE' THEN
  IF OLD.state='HOLD' AND NEW.state NOT IN ('HOLD','PENDING_GV','EXPIRED','CANCELLED') THEN RAISE EXCEPTION 'W05B_HOLD_TRANSITION_DENIED';END IF;
  IF OLD.state='HOLD' AND NEW.state='PENDING_GV' AND NOT coalesce((
   (current_setting('app.w05b_op',true)='SUBMIT' AND NEW."replacesId" IS NULL) OR
   (current_setting('app.w05b_op',true) IN ('RESCHEDULE','CHANGE_APPROVE') AND NEW."replacesId" IS NOT NULL AND EXISTS(
    SELECT 1 FROM w05b_bookings prior WHERE prior.id=NEW."replacesId" AND prior.state='SUPERSEDED' AND prior."learnerId"=NEW."learnerId" AND prior."teacherId"=NEW."teacherId" AND length(prior.topic) BETWEEN 10 AND 1000))
  ),false) THEN RAISE EXCEPTION 'W05B_VALID_SUBMISSION_REQUIRED';END IF;
  IF NEW.version<>OLD.version+1 OR NEW."teacherId"<>OLD."teacherId" OR NEW."learnerId"<>OLD."learnerId"
   OR NEW."profileRevisionId"<>OLD."profileRevisionId" OR NEW."startsAt"<>OLD."startsAt" OR NEW."endsAt"<>OLD."endsAt"
   OR NEW."reservedFrom"<>OLD."reservedFrom" OR NEW."reservedUntil"<>OLD."reservedUntil" OR NEW."replacesId" IS DISTINCT FROM OLD."replacesId"
  THEN RAISE EXCEPTION 'W05B_BOOKING_IMMUTABLE_OR_STALE';END IF;
  IF NEW.state='EXPIRED' AND (OLD.state NOT IN ('HOLD','PENDING_GV') OR OLD."expiresAt">clock_timestamp()) THEN RAISE EXCEPTION 'W05B_EARLY_EXPIRY';END IF;
  IF OLD.state NOT IN ('HOLD','PENDING_GV','CONFIRMED') THEN RAISE EXCEPTION 'W05B_TERMINAL_BOOKING';END IF;
 END IF;
 IF NEW.state IN ('PENDING_GV','CONFIRMED') AND length(NEW.topic) NOT BETWEEN 10 AND 1000 THEN RAISE EXCEPTION 'W05B_VALID_TOPIC_REQUIRED';END IF;
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

CREATE OR REPLACE FUNCTION w05b_command(a uuid,sid text,k uuid,p jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
 DECLARE role text; op text:=p->>'op'; obj uuid:=nullif(p->>'id','')::uuid; target uuid:=nullif(p->>'teacherId','')::uuid;
 r w05b_profile_revisions; pr w05b_profiles; b w05b_bookings; replacement w05b_bookings;
 l w05b_links; c w05b_changes; report w05b_reports; cached w05b_commands;
 result jsonb; st timestamptz; en timestamptz; why text:=coalesce(p->>'reason','');
 BEGIN
 PERFORM pg_advisory_xact_lock(842030);
 role:=w05b_actor(a,sid);IF role IS NULL THEN RAISE EXCEPTION 'W05B_AUTH_REQUIRED' USING ERRCODE='42501';END IF;
 IF role NOT IN ('STUDENT','INSTRUCTOR','ACADEMIC_MANAGER') THEN RAISE EXCEPTION 'W05B_ROLE_DENIED' USING ERRCODE='42501';END IF;
 PERFORM set_config('app.w05b_command','DEC060',true);PERFORM set_config('app.w05b_actor',a::text,true);PERFORM set_config('app.w05b_op',op,true);
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
   IF op='RESCHEDULE' AND (b.state NOT IN ('PENDING_GV','CONFIRMED') OR length(b.topic) NOT BETWEEN 10 AND 1000) THEN RAISE EXCEPTION 'W05B_VALID_SUBMISSION_REQUIRED';END IF;
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

-- No W06 function/trigger/table is changed. A later class URL quarantines W05B exposure.
CREATE FUNCTION w05b_link_clear(p_id uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM w05b_links l WHERE l.id=p_id AND NOT EXISTS(SELECT 1 FROM w06_meet m WHERE m.url=l.url))
$$;
CREATE OR REPLACE FUNCTION w05b_visible_link(b w05b_bookings,a uuid) RETURNS text LANGUAGE sql STABLE AS $$
 SELECT l.url FROM w05b_links l JOIN users u ON u.id=a AND u.status='ACTIVE'
 WHERE b.state='CONFIRMED' AND ((a=b."learnerId" AND u.role='STUDENT') OR (a=b."teacherId" AND u.role='INSTRUCTOR'))
 AND clock_timestamp()>=b."startsAt" AND clock_timestamp()<b."endsAt" AND l."bookingId"=b.id
 AND l.number=b."linkRevision" AND l.state='APPROVED' AND w05b_link_clear(l.id)
$$;
CREATE FUNCTION w05b_link_review_guard() RETURNS trigger LANGUAGE plpgsql AS $$
 BEGIN
 PERFORM pg_advisory_xact_lock(842030);
 IF NEW.state='APPROVED' AND EXISTS(SELECT 1 FROM w06_meet WHERE url=NEW.url) THEN RAISE EXCEPTION 'W05B_CLASS_LINK_REUSE_DENIED';END IF;
 RETURN NEW;
 END $$;
CREATE TRIGGER w05b_link_class_guard BEFORE INSERT OR UPDATE ON w05b_links FOR EACH ROW EXECUTE FUNCTION w05b_link_review_guard();

CREATE UNIQUE INDEX w05b_review_event_once ON w05b_events("objectId",kind)
 WHERE kind IN ('REVIEW_PROFILE_V1','REVIEW_LINK_V1','REVIEW_CHANGE_V1','LINK_COLLISION_V1');

CREATE FUNCTION w05b_review_notice_allowed(e w05b_events,a uuid) RETURNS boolean LANGUAGE plpgsql STABLE AS $$
 DECLARE v_teacher uuid; v_maker uuid; v_learner uuid; v_cap text;
 BEGIN
 IF e.kind='REVIEW_PROFILE_V1' THEN
  SELECT p."teacherId",r."makerId" INTO v_teacher,v_maker FROM w05b_profile_revisions r JOIN w05b_profiles p ON p.id=r."profileId"
   WHERE r.id=e."objectId" AND r.state='DRAFT' AND r.number=p."currentRevision";v_cap:='consultation.profile.approve';
 ELSIF e.kind IN ('REVIEW_LINK_V1','LINK_COLLISION_V1') THEN
  SELECT b."teacherId",l."makerId",b."learnerId" INTO v_teacher,v_maker,v_learner FROM w05b_links l JOIN w05b_bookings b ON b.id=l."bookingId"
   WHERE l.id=e."objectId" AND b.state='CONFIRMED' AND l.number=b."linkRevision" AND
   ((e.kind='REVIEW_LINK_V1' AND l.state='PENDING' AND w05b_link_clear(l.id)) OR (e.kind='LINK_COLLISION_V1' AND l.state='APPROVED' AND NOT w05b_link_clear(l.id)));
  v_cap:='consultation.link.approve';
  IF e.kind='LINK_COLLISION_V1' AND v_teacher IS NOT NULL AND a IN (v_teacher,v_learner) THEN RETURN true;END IF;
 ELSIF e.kind='REVIEW_CHANGE_V1' THEN
  SELECT b."teacherId",c."makerId",b."learnerId" INTO v_teacher,v_maker,v_learner FROM w05b_changes c JOIN w05b_bookings b ON b.id=c."bookingId"
   WHERE c.id=e."objectId" AND c.state='PENDING' AND c."baseVersion"=b.version AND b.state IN ('PENDING_GV','CONFIRMED');v_cap:='consultation.booking.review';
 ELSE RETURN true;
 END IF;
 RETURN v_teacher IS NOT NULL AND a<>v_maker AND a<>v_teacher AND (v_learner IS NULL OR a<>v_learner) AND w05b_permit(a,v_cap,v_teacher);
 END $$;

CREATE FUNCTION w05b_route_review(p_kind text,p_id uuid) RETURNS void LANGUAGE plpgsql AS $$
 DECLARE v_teacher uuid; v_maker uuid; v_learner uuid; v_event w05b_events; v_reason text;
 BEGIN
 PERFORM pg_advisory_xact_lock(842030);
 IF p_kind='REVIEW_PROFILE_V1' THEN
  SELECT p."teacherId",r."makerId" INTO v_teacher,v_maker FROM w05b_profile_revisions r JOIN w05b_profiles p ON p.id=r."profileId" WHERE r.id=p_id AND r.state='DRAFT' AND r.number=p."currentRevision";
  v_reason:='Có phiên bản hồ sơ tư vấn chờ học vụ duyệt độc lập.';
 ELSIF p_kind IN ('REVIEW_LINK_V1','LINK_COLLISION_V1') THEN
  SELECT b."teacherId",l."makerId",b."learnerId" INTO v_teacher,v_maker,v_learner FROM w05b_links l JOIN w05b_bookings b ON b.id=l."bookingId" WHERE l.id=p_id AND b.state='CONFIRMED' AND l.number=b."linkRevision" AND ((p_kind='REVIEW_LINK_V1' AND l.state='PENDING' AND w05b_link_clear(l.id)) OR (p_kind='LINK_COLLISION_V1' AND l.state='APPROVED' AND NOT w05b_link_clear(l.id)));
  v_reason:=CASE WHEN p_kind='REVIEW_LINK_V1' THEN 'Có phiên bản link tư vấn chờ học vụ duyệt độc lập.' ELSE 'Link tư vấn trùng tài nguyên lớp; đã chặn truy cập, cần giảng viên đề xuất link riêng mới.' END;
 ELSIF p_kind='REVIEW_CHANGE_V1' THEN
  SELECT b."teacherId",c."makerId",b."learnerId" INTO v_teacher,v_maker,v_learner FROM w05b_changes c JOIN w05b_bookings b ON b.id=c."bookingId" WHERE c.id=p_id AND c.state='PENDING' AND c."baseVersion"=b.version AND b.state IN ('PENDING_GV','CONFIRMED');
  v_reason:='Có yêu cầu thay đổi lịch tư vấn chờ duyệt độc lập và lý do.';
 ELSE RAISE EXCEPTION 'W05B_REVIEW_KIND_INVALID';END IF;
 IF v_teacher IS NULL THEN RETURN;END IF;
 SELECT * INTO v_event FROM w05b_events WHERE "objectId"=p_id AND kind=p_kind;
 IF v_event.id IS NULL THEN INSERT INTO w05b_events("actorId","objectId",kind,reason) VALUES(v_maker,p_id,p_kind,v_reason) RETURNING * INTO v_event;END IF;
 INSERT INTO w05b_outbox("eventId","recipientId") SELECT v_event.id,u.id FROM users u
  WHERE u.status='ACTIVE' AND w05b_review_notice_allowed(v_event,u.id)
  AND (u.role='ACADEMIC_MANAGER' OR (p_kind='LINK_COLLISION_V1' AND u.id IN (v_teacher,v_learner)))
  ON CONFLICT("eventId","recipientId") DO NOTHING;
 END $$;
CREATE FUNCTION w05b_pending_review_trigger() RETURNS trigger LANGUAGE plpgsql AS $$
 BEGIN
 PERFORM w05b_route_review(CASE TG_TABLE_NAME WHEN 'w05b_profile_revisions' THEN 'REVIEW_PROFILE_V1' WHEN 'w05b_links' THEN 'REVIEW_LINK_V1' ELSE 'REVIEW_CHANGE_V1' END,NEW.id);
 RETURN NEW;
 END $$;
CREATE TRIGGER w05b_pending_review AFTER INSERT ON w05b_profile_revisions FOR EACH ROW EXECUTE FUNCTION w05b_pending_review_trigger();
CREATE TRIGGER w05b_pending_review AFTER INSERT ON w05b_links FOR EACH ROW EXECUTE FUNCTION w05b_pending_review_trigger();
CREATE TRIGGER w05b_pending_review AFTER INSERT ON w05b_changes FOR EACH ROW EXECUTE FUNCTION w05b_pending_review_trigger();

CREATE OR REPLACE FUNCTION w05b_sweep() RETURNS integer LANGUAGE plpgsql AS $$
 DECLARE n integer; v record;
 BEGIN
 PERFORM set_config('app.w05b_command','DEC060',true);n:=w05b_expire();
 FOR v IN SELECT r.id FROM w05b_profile_revisions r JOIN w05b_profiles p ON p.id=r."profileId" AND r.number=p."currentRevision" WHERE r.state='DRAFT' LOOP PERFORM w05b_route_review('REVIEW_PROFILE_V1',v.id);END LOOP;
 FOR v IN SELECT l.id,l.state FROM w05b_links l JOIN w05b_bookings b ON b.id=l."bookingId" AND l.number=b."linkRevision" AND b.state='CONFIRMED' WHERE l.state IN ('PENDING','APPROVED') LOOP
  IF v.state='PENDING' THEN PERFORM w05b_route_review('REVIEW_LINK_V1',v.id);ELSE PERFORM w05b_route_review('LINK_COLLISION_V1',v.id);END IF;
 END LOOP;
 FOR v IN SELECT c.id FROM w05b_changes c JOIN w05b_bookings b ON b.id=c."bookingId" AND c."baseVersion"=b.version AND b.state IN ('PENDING_GV','CONFIRMED') WHERE c.state='PENDING' LOOP PERFORM w05b_route_review('REVIEW_CHANGE_V1',v.id);END LOOP;
 RETURN n;
 END $$;

COMMIT;
