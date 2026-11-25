BEGIN;
CREATE TABLE w07_class_controls (
"id" uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
"classId" uuid NOT NULL,
"actorId" uuid NOT NULL,
"reason" varchar(1000) NOT NULL,
"createdAt" timestamptz(6) NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE w07_applications (
"id" uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
"classId" uuid NOT NULL,
"learnerId" uuid NOT NULL,
"number" integer NOT NULL,
"parentId" uuid,
"courseVersionId" uuid,
"versionNumber" integer,
"termsTitle" varchar(300),
"pricingType" varchar(16),
"amountVnd" integer,
"termsApprovedAt" timestamptz(3),
"referralId" uuid,
"referralNumber" integer,
"referralConsentId" uuid,
"consentVersion" varchar(40) NOT NULL,
"consentedAt" timestamptz(6) NOT NULL DEFAULT clock_timestamp(),
"state" varchar(24) NOT NULL,
"blockReason" varchar(80),
"lockVersion" integer NOT NULL DEFAULT 0,
"key" uuid NOT NULL,
"createdAt" timestamptz(6) NOT NULL DEFAULT clock_timestamp(),
UNIQUE("learnerId","key"),
UNIQUE("learnerId","classId","number")
);
CREATE TABLE w07_academic_decisions (
"id" uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
"applicationId" uuid NOT NULL,
"number" integer NOT NULL,
"kind" varchar(16) NOT NULL,
"reviewerId" uuid NOT NULL,
"grantId" uuid NOT NULL,
"caseId" uuid,
"reason" varchar(1000) NOT NULL,
"key" uuid NOT NULL,
"createdAt" timestamptz(6) NOT NULL DEFAULT clock_timestamp(),
UNIQUE("applicationId","number"),
UNIQUE("reviewerId","key")
);
CREATE TABLE w07_obligations (
"id" uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
"applicationId" uuid NOT NULL,
"decisionId" uuid NOT NULL,
"courseVersionId" uuid NOT NULL,
"amountVnd" integer NOT NULL,
"currency" varchar(3) NOT NULL DEFAULT 'VND',
"dueAt" timestamptz(6),
"createdAt" timestamptz(6) NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE w07_payment_evidence (
"id" uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
"obligationId" uuid NOT NULL,
"learnerId" uuid NOT NULL,
"amountVnd" integer NOT NULL,
"sourceRef" varchar(80) NOT NULL,
"sha256" varchar(64) NOT NULL,
"fileKey" varchar(80) NOT NULL,
"mimeType" varchar(80) NOT NULL,
"bytes" integer NOT NULL,
"synthetic" boolean NOT NULL DEFAULT true,
"key" uuid NOT NULL,
"createdAt" timestamptz(6) NOT NULL DEFAULT clock_timestamp(),
UNIQUE("learnerId","key")
);
CREATE TABLE w07_payment_events (
"id" uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
"obligationId" uuid NOT NULL,
"evidenceId" uuid,
"parentId" uuid,
"adjustmentDecisionId" uuid,
"kind" varchar(16) NOT NULL,
"amountVnd" integer NOT NULL,
"excessVnd" integer NOT NULL DEFAULT 0,
"actorId" uuid NOT NULL,
"grantId" uuid NOT NULL,
"reason" varchar(1000) NOT NULL,
"key" uuid NOT NULL,
"synthetic" boolean NOT NULL DEFAULT true,
"createdAt" timestamptz(6) NOT NULL DEFAULT clock_timestamp(),
UNIQUE("actorId","key")
);
CREATE TABLE w07_allocations (
"id" uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
"obligationId" uuid NOT NULL,
"eventId" uuid NOT NULL,
"amountVnd" integer NOT NULL,
"createdAt" timestamptz(6) NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE w07_adjustments (
"id" uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
"eventId" uuid NOT NULL,
"makerId" uuid NOT NULL,
"kind" varchar(16) NOT NULL,
"amountVnd" integer NOT NULL,
"reason" varchar(1000) NOT NULL,
"evidence" varchar(2000) NOT NULL,
"state" varchar(24) NOT NULL,
"blockReason" varchar(100),
"key" uuid NOT NULL,
"createdAt" timestamptz(6) NOT NULL DEFAULT clock_timestamp(),
UNIQUE("makerId","key")
);
CREATE TABLE w07_adjustment_decisions (
"id" uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
"requestId" uuid NOT NULL,
"reviewerId" uuid NOT NULL,
"grantId" uuid NOT NULL,
"decision" varchar(16) NOT NULL,
"reason" varchar(1000) NOT NULL,
"key" uuid NOT NULL,
"createdAt" timestamptz(6) NOT NULL DEFAULT clock_timestamp(),
UNIQUE("reviewerId","key")
);
CREATE TABLE w07_entitlements (
"id" uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
"applicationId" uuid NOT NULL,
"learnerId" uuid NOT NULL,
"enrollmentId" uuid,
"outcome" varchar(24) NOT NULL,
"reasonCode" varchar(80) NOT NULL,
"previousStatus" varchar(24),
"key" uuid NOT NULL,
"createdAt" timestamptz(6) NOT NULL DEFAULT clock_timestamp(),
UNIQUE("applicationId","key")
);
CREATE TABLE w07_cases (
"id" uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
"applicationId" uuid NOT NULL,
"learnerId" uuid NOT NULL,
"kind" varchar(16) NOT NULL,
"targetClassId" uuid,
"state" varchar(24) NOT NULL,
"blockReason" varchar(100),
"reason" varchar(1000) NOT NULL,
"key" uuid NOT NULL,
"createdAt" timestamptz(6) NOT NULL DEFAULT clock_timestamp(),
UNIQUE("learnerId","key")
);
CREATE TABLE w07_notifications (
"id" uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
"applicationId" uuid NOT NULL,
"recipientId" uuid NOT NULL,
"kind" varchar(32) NOT NULL,
"sourceId" uuid NOT NULL,
"createdAt" timestamptz(6) NOT NULL DEFAULT clock_timestamp(),
UNIQUE("recipientId","kind","sourceId")
);
ALTER TABLE w07_class_controls ADD FOREIGN KEY("classId") REFERENCES class_offerings(id) ON DELETE RESTRICT;
ALTER TABLE w07_class_controls ADD FOREIGN KEY("actorId") REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE w07_applications ADD FOREIGN KEY("classId") REFERENCES class_offerings(id) ON DELETE RESTRICT;
ALTER TABLE w07_applications ADD FOREIGN KEY("learnerId") REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE w07_applications ADD FOREIGN KEY("parentId") REFERENCES w07_applications(id) ON DELETE RESTRICT;
ALTER TABLE w07_applications ADD FOREIGN KEY("courseVersionId") REFERENCES course_versions(id) ON DELETE RESTRICT;
ALTER TABLE w07_applications ADD FOREIGN KEY("referralId") REFERENCES counseling_applications(id) ON DELETE RESTRICT;
ALTER TABLE w07_applications ADD FOREIGN KEY("referralConsentId") REFERENCES support_consents(id) ON DELETE RESTRICT;
ALTER TABLE w07_academic_decisions ADD FOREIGN KEY("applicationId") REFERENCES w07_applications(id) ON DELETE RESTRICT;
ALTER TABLE w07_academic_decisions ADD FOREIGN KEY("reviewerId") REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE w07_academic_decisions ADD FOREIGN KEY("grantId") REFERENCES permission_grants(id) ON DELETE RESTRICT;
ALTER TABLE w07_academic_decisions ADD FOREIGN KEY("caseId") REFERENCES w07_cases(id) ON DELETE RESTRICT;
ALTER TABLE w07_obligations ADD FOREIGN KEY("applicationId") REFERENCES w07_applications(id) ON DELETE RESTRICT;
ALTER TABLE w07_obligations ADD FOREIGN KEY("decisionId") REFERENCES w07_academic_decisions(id) ON DELETE RESTRICT;
ALTER TABLE w07_obligations ADD FOREIGN KEY("courseVersionId") REFERENCES course_versions(id) ON DELETE RESTRICT;
ALTER TABLE w07_payment_evidence ADD FOREIGN KEY("obligationId") REFERENCES w07_obligations(id) ON DELETE RESTRICT;
ALTER TABLE w07_payment_evidence ADD FOREIGN KEY("learnerId") REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE w07_payment_events ADD FOREIGN KEY("obligationId") REFERENCES w07_obligations(id) ON DELETE RESTRICT;
ALTER TABLE w07_payment_events ADD FOREIGN KEY("evidenceId") REFERENCES w07_payment_evidence(id) ON DELETE RESTRICT;
ALTER TABLE w07_payment_events ADD FOREIGN KEY("parentId") REFERENCES w07_payment_events(id) ON DELETE RESTRICT;
ALTER TABLE w07_payment_events ADD FOREIGN KEY("adjustmentDecisionId") REFERENCES w07_adjustment_decisions(id) ON DELETE RESTRICT;
ALTER TABLE w07_payment_events ADD FOREIGN KEY("actorId") REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE w07_payment_events ADD FOREIGN KEY("grantId") REFERENCES permission_grants(id) ON DELETE RESTRICT;
ALTER TABLE w07_allocations ADD FOREIGN KEY("obligationId") REFERENCES w07_obligations(id) ON DELETE RESTRICT;
ALTER TABLE w07_allocations ADD FOREIGN KEY("eventId") REFERENCES w07_payment_events(id) ON DELETE RESTRICT;
ALTER TABLE w07_adjustments ADD FOREIGN KEY("eventId") REFERENCES w07_payment_events(id) ON DELETE RESTRICT;
ALTER TABLE w07_adjustments ADD FOREIGN KEY("makerId") REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE w07_adjustment_decisions ADD FOREIGN KEY("requestId") REFERENCES w07_adjustments(id) ON DELETE RESTRICT;
ALTER TABLE w07_adjustment_decisions ADD FOREIGN KEY("reviewerId") REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE w07_adjustment_decisions ADD FOREIGN KEY("grantId") REFERENCES permission_grants(id) ON DELETE RESTRICT;
ALTER TABLE w07_entitlements ADD FOREIGN KEY("applicationId") REFERENCES w07_applications(id) ON DELETE RESTRICT;
ALTER TABLE w07_entitlements ADD FOREIGN KEY("learnerId") REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE w07_entitlements ADD FOREIGN KEY("enrollmentId") REFERENCES enrollments(id) ON DELETE RESTRICT;
ALTER TABLE w07_cases ADD FOREIGN KEY("applicationId") REFERENCES w07_applications(id) ON DELETE RESTRICT;
ALTER TABLE w07_cases ADD FOREIGN KEY("learnerId") REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE w07_cases ADD FOREIGN KEY("targetClassId") REFERENCES class_offerings(id) ON DELETE RESTRICT;
ALTER TABLE w07_notifications ADD FOREIGN KEY("applicationId") REFERENCES w07_applications(id) ON DELETE RESTRICT;
ALTER TABLE w07_notifications ADD FOREIGN KEY("recipientId") REFERENCES users(id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX w07_one_evidence_review ON w07_payment_events("evidenceId") WHERE kind IN ('VERIFY','REJECT');
CREATE UNIQUE INDEX w07_class_controls_classId_key ON w07_class_controls("classId");
CREATE UNIQUE INDEX w07_academic_decisions_caseId_key ON w07_academic_decisions("caseId");
CREATE UNIQUE INDEX w07_obligations_applicationId_key ON w07_obligations("applicationId");
CREATE UNIQUE INDEX w07_obligations_decisionId_key ON w07_obligations("decisionId");
CREATE UNIQUE INDEX w07_payment_evidence_sourceRef_key ON w07_payment_evidence("sourceRef");
CREATE UNIQUE INDEX w07_payment_evidence_sha256_key ON w07_payment_evidence(sha256);
CREATE UNIQUE INDEX w07_payment_evidence_fileKey_key ON w07_payment_evidence("fileKey");
CREATE UNIQUE INDEX w07_payment_events_adjustmentDecisionId_key ON w07_payment_events("adjustmentDecisionId");
CREATE UNIQUE INDEX w07_allocations_eventId_key ON w07_allocations("eventId");
CREATE UNIQUE INDEX w07_adjustment_decisions_requestId_key ON w07_adjustment_decisions("requestId");
CREATE UNIQUE INDEX w07_one_reversal ON w07_payment_events("parentId") WHERE kind='REVERSAL';
CREATE UNIQUE INDEX w07_one_active_application ON w07_entitlements("applicationId") WHERE outcome='ACTIVE';
CREATE UNIQUE INDEX w07_one_active_enrollment ON w07_entitlements("enrollmentId") WHERE outcome='ACTIVE';
CREATE INDEX w07_application_queue ON w07_applications("classId",state);
CREATE INDEX w07_evidence_obligation ON w07_payment_evidence("obligationId","createdAt");
CREATE INDEX w07_event_obligation ON w07_payment_events("obligationId","createdAt");
CREATE INDEX w07_allocation_balance ON w07_allocations("obligationId");
CREATE INDEX w07_notification_recipient ON w07_notifications("recipientId","createdAt");
ALTER TABLE w07_applications ADD CHECK(number>0 AND "lockVersion">=0 AND state IN ('SUBMITTED','BLOCKED_REVIEW','APPROVED','REJECTED','CANCELLED') AND ("amountVnd" IS NULL OR "amountVnd">=0));
ALTER TABLE w07_academic_decisions ADD CHECK(number>0 AND kind IN ('APPROVE','REJECT','CANCEL') AND length(trim(reason))>0);
ALTER TABLE w07_obligations ADD CHECK("amountVnd">0 AND currency='VND' AND "dueAt" IS NULL);
ALTER TABLE w07_payment_evidence ADD CHECK("amountVnd">0 AND synthetic AND "sourceRef" ~ '^TEST-[A-Z0-9_-]{6,70}$' AND sha256 ~ '^[a-f0-9]{64}$' AND bytes BETWEEN 1 AND 5242880 AND "mimeType" IN ('image/png','image/jpeg','application/pdf') AND "fileKey" ~ '^[a-f0-9-]{36}[.](png|jpg|pdf)$');
ALTER TABLE w07_payment_events ADD CHECK(synthetic AND "excessVnd">=0 AND length(trim(reason))>0 AND ((kind='VERIFY' AND "amountVnd">0 AND "evidenceId" IS NOT NULL AND "parentId" IS NULL AND "adjustmentDecisionId" IS NULL) OR (kind='REJECT' AND "amountVnd"=0 AND "excessVnd"=0 AND "evidenceId" IS NOT NULL AND "parentId" IS NULL AND "adjustmentDecisionId" IS NULL) OR (kind='REVERSAL' AND "amountVnd"<0 AND "excessVnd"=0 AND "evidenceId" IS NULL AND "parentId" IS NOT NULL AND "adjustmentDecisionId" IS NOT NULL)));
ALTER TABLE w07_allocations ADD CHECK("amountVnd"<>0);
ALTER TABLE w07_adjustments ADD CHECK("amountVnd">0 AND kind IN ('REVERSAL','REFUND','ADJUSTMENT') AND state IN ('PENDING_REVIEW','BLOCKED_REVIEW') AND length(trim(reason))>0 AND length(trim(evidence))>0 AND ((state='BLOCKED_REVIEW' AND "blockReason" IS NOT NULL) OR (state='PENDING_REVIEW' AND "blockReason" IS NULL)));
ALTER TABLE w07_adjustment_decisions ADD CHECK(decision IN ('APPROVE','REJECT') AND length(trim(reason))>0);
ALTER TABLE w07_cases ADD CHECK(kind IN ('WITHDRAW','TRANSFER') AND state IN ('PENDING_REVIEW','BLOCKED_REVIEW') AND length(trim(reason))>0);
ALTER TABLE w07_entitlements ADD CHECK(outcome IN ('ACTIVE','PENDING_CAPACITY','BLOCKED_REVIEW') AND ((outcome='ACTIVE' AND "enrollmentId" IS NOT NULL) OR (outcome<>'ACTIVE' AND "enrollmentId" IS NULL)));
ALTER TABLE permission_grants DROP CONSTRAINT grant_scope;
ALTER TABLE permission_grants ADD CONSTRAINT grant_scope CHECK (
 ("scopeType"='GLOBAL' AND "scopeId" IS NULL AND capability NOT LIKE 'academic.%' AND capability NOT LIKE 'finance.%' AND (capability NOT LIKE 'support.%' OR capability IN ('support.taxonomy.author','support.taxonomy.approve'))) OR
 ("scopeType"='CLASS' AND "scopeId" IS NOT NULL AND capability IN ('class.read','academic.schedule.approve','academic.rubric.approve','academic.grade.publish','academic.quiz.approve','academic.quiz.grade.publish','academic.meeting.approve','academic.attendance.approve','academic.admission.approve','finance.verify','finance.adjust.propose','finance.adjust.approve')) OR
 ("scopeType"='COURSE' AND "scopeId" IS NOT NULL AND capability='academic.program.approve') OR
 ("scopeType"='SUPPORT_TOPIC' AND "scopeId" ~ '^[A-Z][A-Z0-9_]{2,39}$' AND capability IN ('support.ticket.read','support.ticket.assign','support.ticket.reply','support.ticket.transfer','support.ticket.close','support.application.write','support.application.review','support.referral.respond')));

CREATE FUNCTION w07_actor() RETURNS uuid LANGUAGE sql STABLE AS $$
 SELECT u.id FROM users u JOIN user_sessions s ON s.sess->>'userId'=u.id::text WHERE u.id::text=current_setting('app.w07_actor',true) AND s.sid=current_setting('app.w07_session',true) AND s.expire>clock_timestamp() AND u.status='ACTIVE' AND u.email LIKE '%@example.invalid'
$$;
CREATE FUNCTION w07_grant(cap text, class_id uuid) RETURNS uuid LANGUAGE sql STABLE AS $$
 SELECT g.id FROM permission_grants g JOIN users u ON u.id=g."userId" WHERE u.id=w07_actor() AND u.status='ACTIVE' AND ((cap='academic.admission.approve' AND u.role='ACADEMIC_MANAGER') OR (cap IN ('finance.verify','finance.adjust.propose','finance.adjust.approve') AND u.role='CASHIER')) AND g.capability=cap AND g."scopeType"='CLASS' AND g."scopeId"=class_id::text AND g."approvedBy" IS NOT NULL AND g."approvedAt"<=timezone('UTC',clock_timestamp()) AND g."effectiveAt"<=timezone('UTC',clock_timestamp()) AND g."expiresAt">timezone('UTC',clock_timestamp()) AND g."revokedAt" IS NULL ORDER BY g.id LIMIT 1
$$;
CREATE FUNCTION w07_open(class_id uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM class_offerings c JOIN courses p ON p.id=c."courseId" WHERE c.id=class_id AND c.status='OPEN' AND p."isPublished" AND (c."enrollmentStart" IS NULL OR c."enrollmentStart"<=timezone('UTC',clock_timestamp())) AND (c."enrollmentEnd" IS NULL OR c."enrollmentEnd">=timezone('UTC',clock_timestamp())))
$$;
CREATE FUNCTION w07_price(class_id uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM class_offerings c JOIN course_versions v ON v.id=c."versionId" WHERE c.id=class_id AND v."courseId"=c."courseId" AND v.state='PUBLISHED' AND v."effectiveFrom"<=clock_timestamp() AND v."approvedBy" IS NOT NULL AND c."termsApprovedAt"=v."approvedAt" AND c."termsTitle"=v.title AND c."termsLevel"=v.level AND c."termsSkillScope"=v."skillScope" AND c."approvedPricingType"=v."standardPricingType" AND c."approvedTuitionFeeVnd"=v."standardTuitionFeeVnd" AND c."pricingType"=c."approvedPricingType" AND c."tuitionFeeVnd"=c."approvedTuitionFeeVnd")
$$;
CREATE FUNCTION w07_paid(fee uuid) RETURNS bigint LANGUAGE sql STABLE AS $$ SELECT coalesce(sum("amountVnd"),0)::bigint FROM w07_allocations WHERE "obligationId"=fee $$;
CREATE FUNCTION w07_activation(application_id uuid) RETURNS text LANGUAGE plpgsql AS $$
DECLARE app w07_applications; fee w07_obligations; c class_offerings;
BEGIN
 SELECT * INTO app FROM w07_applications WHERE id=application_id;
 IF app.id IS NULL OR app.state<>'APPROVED' OR NOT EXISTS(SELECT 1 FROM w07_academic_decisions d WHERE d."applicationId"=app.id AND d.number=app."lockVersion" AND d.kind='APPROVE' AND d."reviewerId"<>app."learnerId") THEN RETURN 'ACADEMIC_APPROVAL_REQUIRED';END IF;
 SELECT * INTO fee FROM w07_obligations WHERE "applicationId"=app.id;
 IF fee.id IS NULL OR fee."courseVersionId" IS DISTINCT FROM app."courseVersionId" OR fee."amountVnd" IS DISTINCT FROM app."amountVnd" THEN RETURN 'UNKNOWN_FEE_PROVENANCE';END IF;
 IF NOT w07_open(app."classId") OR NOT w07_price(app."classId") THEN RETURN 'OFFER_REVIEW_REQUIRED';END IF;
 IF EXISTS(SELECT 1 FROM w07_payment_events WHERE "obligationId"=fee.id AND "excessVnd">0) THEN RETURN 'CREDIT_PENDING';END IF;
 IF w07_paid(fee.id)<>fee."amountVnd" THEN RETURN 'VERIFIED_FULL_FEE_REQUIRED';END IF;
 IF EXISTS(SELECT 1 FROM w07_payment_evidence e WHERE e."obligationId"=fee.id AND NOT EXISTS(SELECT 1 FROM w07_payment_events p WHERE p."evidenceId"=e.id)) THEN RETURN 'EVIDENCE_REVIEW_REQUIRED';END IF;
 SELECT * INTO c FROM class_offerings WHERE id=app."classId";
 IF c."maxStudents" IS NULL THEN RETURN 'CAPACITY_POLICY_REQUIRED';END IF;
 IF (SELECT count(*) FROM enrollments WHERE "classOfferingId"=c.id AND status='ACTIVE')>=c."maxStudents" THEN RETURN 'PENDING_CAPACITY';END IF;
 RETURN 'READY';
END $$;

CREATE FUNCTION w07_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE who uuid; role_now text; n timestamptz; app w07_applications; offer class_offerings; prior_app w07_applications; fee w07_obligations; proof w07_payment_evidence; evt w07_payment_events; parent_evt w07_payment_events; req w07_adjustments; decision w07_adjustment_decisions; academic w07_academic_decisions; case_request w07_cases; consent_row support_consents; referral counseling_applications; balance bigint; expected bigint; gate text;
BEGIN
 PERFORM pg_advisory_xact_lock(842030);n:=clock_timestamp();
 IF TG_OP IN ('DELETE','TRUNCATE') THEN RAISE EXCEPTION 'W07_APPEND_ONLY' USING ERRCODE='23514';END IF;
 who:=w07_actor();IF who IS NULL THEN RAISE EXCEPTION 'W07_ACTIVE_SYNTHETIC_SESSION_REQUIRED' USING ERRCODE='42501';END IF;
 SELECT role::text INTO role_now FROM users WHERE id=who;
 IF TG_OP='UPDATE' THEN
  IF TG_TABLE_NAME<>'w07_applications' THEN RAISE EXCEPTION 'W07_HISTORY_IMMUTABLE' USING ERRCODE='23514';END IF;
  IF (to_jsonb(NEW)-ARRAY['state','lockVersion']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','lockVersion']) OR NEW."lockVersion"<>OLD."lockVersion"+1 OR NOT EXISTS(SELECT 1 FROM w07_academic_decisions d WHERE d."applicationId"=OLD.id AND d.number=NEW."lockVersion" AND d."reviewerId"=who AND NEW.state=CASE d.kind WHEN 'APPROVE' THEN 'APPROVED' WHEN 'REJECT' THEN 'REJECTED' ELSE 'CANCELLED' END) THEN RAISE EXCEPTION 'W07_HISTORY_IMMUTABLE' USING ERRCODE='23514';END IF;RETURN NEW;
 END IF;
 IF TG_TABLE_NAME='w07_class_controls' THEN
  IF NEW."actorId"<>who OR w07_grant('academic.admission.approve',NEW."classId") IS NULL OR NOT w07_open(NEW."classId") OR length(trim(NEW.reason))=0 THEN RAISE EXCEPTION 'W07_CONTROL_SCOPE' USING ERRCODE='42501';END IF;NEW."createdAt":=n;RETURN NEW;
 END IF;
 IF TG_TABLE_NAME='w07_applications' THEN
  SELECT * INTO offer FROM class_offerings WHERE id=NEW."classId";
  IF role_now<>'STUDENT' OR NEW."learnerId"<>who OR NOT w07_open(offer.id) OR NOT EXISTS(SELECT 1 FROM w07_class_controls WHERE "classId"=offer.id) OR NEW."consentVersion"<>'W07_SYNTHETIC_ADMISSION_V1' OR EXISTS(SELECT 1 FROM enrollments WHERE "classOfferingId"=offer.id AND "learnerId"=who AND status='ACTIVE') THEN RAISE EXCEPTION 'W07_APPLICATION_SCOPE' USING ERRCODE='42501';END IF;
  SELECT * INTO prior_app FROM w07_applications WHERE "learnerId"=who AND "classId"=offer.id ORDER BY number DESC LIMIT 1;
  IF NEW.number<>coalesce(prior_app.number,0)+1 OR NEW."parentId" IS DISTINCT FROM prior_app.id OR (prior_app.id IS NOT NULL AND prior_app.state NOT IN ('REJECTED','CANCELLED')) THEN RAISE EXCEPTION 'W07_APPLICATION_VERSION' USING ERRCODE='23514';END IF;
  NEW."courseVersionId":=offer."versionId";SELECT number INTO NEW."versionNumber" FROM course_versions WHERE id=offer."versionId";
  NEW."termsTitle":=offer."termsTitle";NEW."pricingType":=offer."approvedPricingType"::text;NEW."amountVnd":=offer."approvedTuitionFeeVnd";NEW."termsApprovedAt":=offer."termsApprovedAt";
  NEW.state:=CASE WHEN w07_price(offer.id) AND offer."approvedPricingType"='PAID' AND offer."approvedTuitionFeeVnd">0 THEN 'SUBMITTED' ELSE 'BLOCKED_REVIEW' END;
  NEW."blockReason":=CASE WHEN NEW.state='SUBMITTED' THEN NULL WHEN w07_price(offer.id) AND offer."approvedPricingType"='FREE' THEN 'FREE_EXCEPTION_POLICY_REQUIRED' ELSE 'UNKNOWN_APPROVED_PRICE_PROVENANCE' END;NEW."lockVersion":=0;NEW."consentedAt":=n;NEW."createdAt":=n;
  IF NEW."referralId" IS NOT NULL THEN
   SELECT * INTO referral FROM counseling_applications WHERE id=NEW."referralId";
   SELECT * INTO consent_row FROM support_consents WHERE "ticketId"=referral."ticketId" AND purpose='APPLICATION' ORDER BY "createdAt" DESC,id DESC LIMIT 1;
   IF referral.id IS NULL OR referral."learnerId"<>who OR referral.state<>'ACKNOWLEDGED' OR referral.snapshot IS NULL OR referral."reviewedAt" IS NULL OR referral."submittedAt" IS NULL OR referral."reviewerId"=referral."authorId" OR consent_row.id IS NULL OR NOT consent_row.granted OR consent_row."learnerId"<>who OR (referral."classId" IS NOT NULL AND referral."classId"<>offer.id) THEN RAISE EXCEPTION 'W07_REFERRAL_PROVENANCE_REQUIRED' USING ERRCODE='42501';END IF;
   NEW."referralNumber":=referral.number;NEW."referralConsentId":=consent_row.id;
  ELSE NEW."referralNumber":=NULL;NEW."referralConsentId":=NULL;END IF;RETURN NEW;
 END IF;
 IF TG_TABLE_NAME IN ('w07_academic_decisions','w07_obligations','w07_entitlements','w07_cases','w07_notifications') THEN SELECT * INTO app FROM w07_applications WHERE id=NEW."applicationId";
 ELSIF TG_TABLE_NAME IN ('w07_payment_evidence','w07_payment_events','w07_allocations') THEN SELECT * INTO fee FROM w07_obligations WHERE id=NEW."obligationId";SELECT * INTO app FROM w07_applications WHERE id=fee."applicationId";
 ELSIF TG_TABLE_NAME='w07_adjustments' THEN SELECT * INTO evt FROM w07_payment_events WHERE id=NEW."eventId";SELECT * INTO fee FROM w07_obligations WHERE id=evt."obligationId";SELECT * INTO app FROM w07_applications WHERE id=fee."applicationId";
 ELSIF TG_TABLE_NAME='w07_adjustment_decisions' THEN SELECT * INTO req FROM w07_adjustments WHERE id=NEW."requestId";SELECT * INTO evt FROM w07_payment_events WHERE id=req."eventId";SELECT * INTO fee FROM w07_obligations WHERE id=evt."obligationId";SELECT * INTO app FROM w07_applications WHERE id=fee."applicationId";
 ELSE RAISE EXCEPTION 'W07_UNKNOWN_LIFECYCLE';END IF;
 IF app.id IS NULL THEN RAISE EXCEPTION 'W07_APPLICATION_REQUIRED' USING ERRCODE='23514';END IF;
 IF TG_TABLE_NAME='w07_academic_decisions' THEN
  IF NEW."reviewerId"<>who OR NEW."grantId" IS DISTINCT FROM w07_grant('academic.admission.approve',app."classId") OR who=app."learnerId" OR NEW.number<>app."lockVersion"+1 OR EXISTS(SELECT 1 FROM counseling_applications WHERE id=app."referralId" AND "authorId"=who) THEN RAISE EXCEPTION 'W07_INDEPENDENT_ACADEMIC_SCOPE' USING ERRCODE='42501';END IF;
  IF NEW.kind='APPROVE' AND (app.state<>'SUBMITTED' OR NOT w07_open(app."classId") OR NOT w07_price(app."classId") OR app."pricingType"<>'PAID' OR app."amountVnd" IS NULL OR app."amountVnd"<=0 OR NOT EXISTS(SELECT 1 FROM class_offerings WHERE id=app."classId" AND "versionId"=app."courseVersionId" AND "approvedTuitionFeeVnd"=app."amountVnd" AND "termsApprovedAt"=app."termsApprovedAt")) THEN RAISE EXCEPTION 'W07_APPROVAL_PROVENANCE_REQUIRED' USING ERRCODE='23514';END IF;
  IF NEW.kind='REJECT' AND app.state NOT IN ('SUBMITTED','BLOCKED_REVIEW') THEN RAISE EXCEPTION 'W07_ACADEMIC_STATE' USING ERRCODE='23514';END IF;
  IF NEW.kind='CANCEL' THEN
   SELECT * INTO case_request FROM w07_cases WHERE id=NEW."caseId";
   IF case_request.id IS NULL OR case_request."applicationId"<>app.id OR case_request.kind<>'WITHDRAW' OR case_request.state<>'PENDING_REVIEW' OR app.state NOT IN ('SUBMITTED','APPROVED') OR EXISTS(SELECT 1 FROM w07_entitlements WHERE "applicationId"=app.id AND outcome='ACTIVE') THEN RAISE EXCEPTION 'W07_CANCEL_POLICY_REVIEW_REQUIRED' USING ERRCODE='23514';END IF;
  ELSIF NEW."caseId" IS NOT NULL THEN RAISE EXCEPTION 'W07_CASE_MISMATCH' USING ERRCODE='23514';END IF;
 ELSIF TG_TABLE_NAME='w07_obligations' THEN
  SELECT * INTO academic FROM w07_academic_decisions WHERE id=NEW."decisionId";
  IF academic.id IS NULL OR academic.kind<>'APPROVE' OR academic."applicationId"<>app.id OR academic."reviewerId"<>who OR NEW."courseVersionId" IS DISTINCT FROM app."courseVersionId" OR NEW."amountVnd" IS DISTINCT FROM app."amountVnd" OR NEW."dueAt" IS NOT NULL OR app.state<>'APPROVED' THEN RAISE EXCEPTION 'W07_IMMUTABLE_OBLIGATION' USING ERRCODE='23514';END IF;
 ELSIF TG_TABLE_NAME='w07_payment_evidence' THEN
  IF role_now<>'STUDENT' OR NEW."learnerId"<>who OR app."learnerId"<>who OR app.state<>'APPROVED' OR NOT NEW.synthetic THEN RAISE EXCEPTION 'W07_OWN_TEST_PROOF_ONLY' USING ERRCODE='42501';END IF;
 ELSIF TG_TABLE_NAME='w07_payment_events' THEN
  IF NEW."actorId"<>who THEN RAISE EXCEPTION 'W07_FINANCE_ACTOR' USING ERRCODE='42501';END IF;
  IF NEW.kind IN ('VERIFY','REJECT') THEN
   SELECT * INTO proof FROM w07_payment_evidence WHERE id=NEW."evidenceId";
   SELECT * INTO academic FROM w07_academic_decisions WHERE "applicationId"=app.id AND kind='APPROVE' ORDER BY number DESC LIMIT 1;
   IF proof.id IS NULL OR proof."obligationId"<>fee.id OR proof."learnerId"=who OR academic."reviewerId"=who OR NEW."grantId" IS DISTINCT FROM w07_grant('finance.verify',app."classId") OR NEW."parentId" IS NOT NULL OR NEW."adjustmentDecisionId" IS NOT NULL OR (NEW.kind='VERIFY' AND app.state<>'APPROVED') THEN RAISE EXCEPTION 'W07_INDEPENDENT_FINANCE_SCOPE' USING ERRCODE='42501';END IF;
   balance:=w07_paid(fee.id);NEW."amountVnd":=CASE WHEN NEW.kind='VERIFY' THEN proof."amountVnd" ELSE 0 END;NEW."excessVnd":=CASE WHEN NEW.kind='VERIFY' THEN greatest(0,proof."amountVnd"-(fee."amountVnd"-balance)) ELSE 0 END;
  ELSE
   SELECT * INTO parent_evt FROM w07_payment_events WHERE id=NEW."parentId";SELECT * INTO decision FROM w07_adjustment_decisions WHERE id=NEW."adjustmentDecisionId";SELECT * INTO req FROM w07_adjustments WHERE id=decision."requestId";
   IF parent_evt.id IS NULL OR parent_evt.kind<>'VERIFY' OR parent_evt."obligationId"<>fee.id OR parent_evt."excessVnd"<>0 OR decision.id IS NULL OR decision.decision<>'APPROVE' OR decision."reviewerId"<>who OR req.kind<>'REVERSAL' OR req."eventId"<>parent_evt.id OR req."amountVnd"<>parent_evt."amountVnd" OR NEW."grantId" IS DISTINCT FROM w07_grant('finance.adjust.approve',app."classId") OR NEW.reason<>decision.reason OR EXISTS(SELECT 1 FROM w07_entitlements WHERE "applicationId"=app.id AND outcome='ACTIVE') THEN RAISE EXCEPTION 'W07_REVERSAL_POLICY_REVIEW_REQUIRED' USING ERRCODE='23514';END IF;NEW."amountVnd":=-parent_evt."amountVnd";NEW."excessVnd":=0;
  END IF;
 ELSIF TG_TABLE_NAME='w07_allocations' THEN
  SELECT * INTO evt FROM w07_payment_events WHERE id=NEW."eventId";
  IF evt.id IS NULL OR evt."obligationId"<>fee.id OR evt."actorId"<>who OR evt.kind='REJECT' THEN RAISE EXCEPTION 'W07_ALLOCATION_SOURCE' USING ERRCODE='42501';END IF;
  balance:=w07_paid(fee.id);expected:=CASE WHEN evt.kind='VERIFY' THEN least(evt."amountVnd",fee."amountVnd"-balance) ELSE evt."amountVnd" END;
  IF NEW."amountVnd"<>expected OR balance+NEW."amountVnd"<0 OR balance+NEW."amountVnd">fee."amountVnd" THEN RAISE EXCEPTION 'W07_BALANCE_INVARIANT' USING ERRCODE='23514';END IF;
 ELSIF TG_TABLE_NAME='w07_adjustments' THEN
  IF NEW."makerId"<>who OR w07_grant('finance.adjust.propose',app."classId") IS NULL OR evt.kind<>'VERIFY' THEN RAISE EXCEPTION 'W07_ADJUSTMENT_SCOPE' USING ERRCODE='42501';END IF;
  NEW.state:='BLOCKED_REVIEW';NEW."blockReason":='FINANCIAL_POLICY_REQUIRED';
  IF NEW.kind='REVERSAL' AND NEW."amountVnd"=evt."amountVnd" AND evt."excessVnd"=0 AND NOT EXISTS(SELECT 1 FROM w07_entitlements WHERE "applicationId"=app.id AND outcome='ACTIVE') AND NOT EXISTS(SELECT 1 FROM w07_payment_events WHERE "parentId"=evt.id) THEN NEW.state:='PENDING_REVIEW';NEW."blockReason":=NULL;END IF;
 ELSIF TG_TABLE_NAME='w07_adjustment_decisions' THEN
  IF req.id IS NULL OR NEW."reviewerId"<>who OR who=req."makerId" OR NEW."grantId" IS DISTINCT FROM w07_grant('finance.adjust.approve',app."classId") THEN RAISE EXCEPTION 'W07_INDEPENDENT_FINANCE_CHECKER' USING ERRCODE='42501';END IF;
  IF NEW.decision='APPROVE' AND (req.state<>'PENDING_REVIEW' OR req.kind<>'REVERSAL' OR req."amountVnd"<>evt."amountVnd" OR evt."excessVnd"<>0 OR EXISTS(SELECT 1 FROM w07_payment_events WHERE "parentId"=evt.id) OR EXISTS(SELECT 1 FROM w07_entitlements WHERE "applicationId"=app.id AND outcome='ACTIVE')) THEN RAISE EXCEPTION 'W07_ADJUSTMENT_BLOCKED_REVIEW' USING ERRCODE='23514';END IF;
 ELSIF TG_TABLE_NAME='w07_cases' THEN
  IF NEW."learnerId"<>who OR app."learnerId"<>who OR role_now<>'STUDENT' OR (NEW.kind='TRANSFER' AND NEW."targetClassId" IS NULL) OR (NEW.kind='WITHDRAW' AND NEW."targetClassId" IS NOT NULL) THEN RAISE EXCEPTION 'W07_OWN_CASE_ONLY' USING ERRCODE='42501';END IF;
  NEW.state:='PENDING_REVIEW';NEW."blockReason":=NULL;
  IF NEW.kind='TRANSFER' OR EXISTS(SELECT 1 FROM w07_entitlements WHERE "applicationId"=app.id AND outcome='ACTIVE') THEN NEW.state:='BLOCKED_REVIEW';NEW."blockReason":=CASE WHEN NEW.kind='TRANSFER' THEN 'TRANSFER_TERMS_POLICY_REQUIRED' ELSE 'ENTITLEMENT_EFFECTIVE_POLICY_REQUIRED' END;END IF;
 ELSIF TG_TABLE_NAME='w07_entitlements' THEN
  IF NEW."learnerId"<>who OR app."learnerId"<>who OR role_now<>'STUDENT' THEN RAISE EXCEPTION 'W07_OWN_ENTITLEMENT_ONLY' USING ERRCODE='42501';END IF;
  IF NEW.outcome='ACTIVE' THEN
   IF NOT EXISTS(SELECT 1 FROM enrollments e WHERE e.id=NEW."enrollmentId" AND e."learnerId"=who AND e."classOfferingId"=app."classId" AND e.status='ACTIVE') OR app.state<>'APPROVED' OR current_setting('app.w07_application',true) IS DISTINCT FROM app.id::text THEN RAISE EXCEPTION 'W07_ACTIVE_RECEIPT_SOURCE' USING ERRCODE='42501';END IF;
  ELSE
   gate:=w07_activation(app.id);IF gate='READY' OR NEW."reasonCode"<>gate OR NEW.outcome IS DISTINCT FROM (CASE WHEN gate='PENDING_CAPACITY' THEN 'PENDING_CAPACITY' ELSE 'BLOCKED_REVIEW' END) THEN RAISE EXCEPTION 'W07_PENDING_RECEIPT_SOURCE' USING ERRCODE='23514';END IF;
  END IF;
 ELSIF TG_TABLE_NAME='w07_notifications' THEN
  IF NEW."recipientId"<>app."learnerId" OR NOT ((NEW.kind='ACADEMIC_DECISION' AND EXISTS(SELECT 1 FROM w07_academic_decisions WHERE id=NEW."sourceId" AND "applicationId"=app.id)) OR (NEW.kind='TEST_FINANCE_REVIEW' AND EXISTS(SELECT 1 FROM w07_payment_events WHERE id=NEW."sourceId" AND "obligationId" IN (SELECT id FROM w07_obligations WHERE "applicationId"=app.id))) OR (NEW.kind='ENTITLEMENT' AND EXISTS(SELECT 1 FROM w07_entitlements WHERE id=NEW."sourceId" AND "applicationId"=app.id))) THEN RAISE EXCEPTION 'W07_NOTIFICATION_PROVENANCE' USING ERRCODE='23514';END IF;
 END IF;
 NEW."createdAt":=n;RETURN NEW;
END $$;

CREATE FUNCTION w07_after() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE app w07_applications; fee w07_obligations; delta bigint; req w07_adjustments; original_event w07_payment_events;
BEGIN
 IF TG_TABLE_NAME='w07_academic_decisions' THEN
  UPDATE w07_applications SET state=CASE NEW.kind WHEN 'APPROVE' THEN 'APPROVED' WHEN 'REJECT' THEN 'REJECTED' ELSE 'CANCELLED' END,"lockVersion"=NEW.number WHERE id=NEW."applicationId" RETURNING * INTO app;
  IF NEW.kind='APPROVE' THEN INSERT INTO w07_obligations("applicationId","decisionId","courseVersionId","amountVnd") VALUES(app.id,NEW.id,app."courseVersionId",app."amountVnd");END IF;
  INSERT INTO w07_notifications("applicationId","recipientId",kind,"sourceId") VALUES(app.id,app."learnerId",'ACADEMIC_DECISION',NEW.id);
 ELSIF TG_TABLE_NAME='w07_payment_events' THEN
  SELECT * INTO fee FROM w07_obligations WHERE id=NEW."obligationId";SELECT * INTO app FROM w07_applications WHERE id=fee."applicationId";
  delta:=CASE WHEN NEW.kind='VERIFY' THEN least(NEW."amountVnd",fee."amountVnd"-w07_paid(fee.id)) WHEN NEW.kind='REVERSAL' THEN NEW."amountVnd" ELSE 0 END;
  IF delta<>0 THEN INSERT INTO w07_allocations("obligationId","eventId","amountVnd") VALUES(fee.id,NEW.id,delta);END IF;
  INSERT INTO w07_notifications("applicationId","recipientId",kind,"sourceId") VALUES(app.id,app."learnerId",'TEST_FINANCE_REVIEW',NEW.id);
 ELSIF TG_TABLE_NAME='w07_adjustment_decisions' THEN
  IF NEW.decision='APPROVE' THEN
  SELECT * INTO req FROM w07_adjustments WHERE id=NEW."requestId";SELECT * INTO original_event FROM w07_payment_events WHERE id=req."eventId";
  INSERT INTO w07_payment_events("obligationId","parentId","adjustmentDecisionId",kind,"amountVnd","actorId","grantId",reason,key) VALUES(original_event."obligationId",original_event.id,NEW.id,'REVERSAL',-original_event."amountVnd",NEW."reviewerId",NEW."grantId",NEW.reason,NEW.key);
  END IF;
 ELSIF TG_TABLE_NAME='w07_entitlements' THEN
  SELECT * INTO app FROM w07_applications WHERE id=NEW."applicationId";
  INSERT INTO w07_notifications("applicationId","recipientId",kind,"sourceId") VALUES(app.id,app."learnerId",'ENTITLEMENT',NEW.id);
 END IF;
 INSERT INTO domain_audit_events(id,"actorId",action,"objectType","objectId",decision,reason,"createdAt") VALUES(gen_random_uuid(),w07_actor(),'W07_'||upper(TG_TABLE_NAME),'W07_SYNTHETIC',NEW.id::text,'TEST_ONLY','Typed immutable DEV history; no real funds or payout',timezone('UTC',clock_timestamp()));
 RETURN NEW;
END $$;
DO $$ DECLARE name text;BEGIN FOREACH name IN ARRAY ARRAY['w07_class_controls','w07_applications','w07_academic_decisions','w07_obligations','w07_payment_evidence','w07_payment_events','w07_allocations','w07_adjustments','w07_adjustment_decisions','w07_entitlements','w07_cases','w07_notifications'] LOOP
 EXECUTE format('CREATE TRIGGER w07_guard BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION w07_guard()',name);
 EXECUTE format('CREATE TRIGGER w07_truncate BEFORE TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION w07_guard()',name);
 IF name<>'w07_notifications' THEN EXECUTE format('CREATE TRIGGER w07_after AFTER INSERT ON %I FOR EACH ROW EXECUTE FUNCTION w07_after()',name);END IF;
END LOOP;END $$;

CREATE FUNCTION w07_enrollment_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE app w07_applications; gate text;
BEGIN
 IF TG_OP='TRUNCATE' THEN IF EXISTS(SELECT 1 FROM w07_class_controls) THEN RAISE EXCEPTION 'W07_ENROLLMENT_HISTORY_REQUIRED' USING ERRCODE='23514';END IF;RETURN NULL;END IF;
 IF TG_OP IN ('UPDATE','DELETE') AND EXISTS(SELECT 1 FROM w07_class_controls) THEN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'W07_ENROLLMENT_IDENTITY_IMMUTABLE' USING ERRCODE='23514';END IF;
  IF NEW.id<>OLD.id OR NEW."learnerId"<>OLD."learnerId" OR NEW."classOfferingId"<>OLD."classOfferingId" OR NEW."enrolledAt" IS DISTINCT FROM OLD."enrolledAt" THEN RAISE EXCEPTION 'W07_ENROLLMENT_IDENTITY_IMMUTABLE' USING ERRCODE='23514';END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD;END IF;
 IF NOT EXISTS(SELECT 1 FROM w07_class_controls) THEN RETURN NEW;END IF;
 PERFORM pg_advisory_xact_lock(842030);
 IF TG_OP='UPDATE' AND NEW.status=OLD.status THEN RETURN NEW;END IF;
 SELECT * INTO app FROM w07_applications WHERE id=nullif(current_setting('app.w07_application',true),'')::uuid;
 IF NEW.status<>'ACTIVE' OR app.id IS NULL OR w07_actor() IS DISTINCT FROM app."learnerId" OR (SELECT role::text FROM users WHERE id=w07_actor()) IS DISTINCT FROM 'STUDENT' OR app."learnerId"<>NEW."learnerId" OR app."classId"<>NEW."classOfferingId" OR nullif(current_setting('app.w07_key',true),'') IS NULL THEN RAISE EXCEPTION 'W07_USE_GUARDED_ENTITLEMENT' USING ERRCODE='42501';END IF;
 gate:=w07_activation(app.id);IF gate<>'READY' THEN RAISE EXCEPTION 'W07_ENTITLEMENT_NOT_READY' USING ERRCODE='23514';END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION w07_enrollment_receipt() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE app w07_applications; previous text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM w07_class_controls WHERE "classId"=NEW."classOfferingId") OR NEW.status<>'ACTIVE' OR (TG_OP='UPDATE' AND OLD.status='ACTIVE') THEN RETURN NEW;END IF;
 SELECT * INTO app FROM w07_applications WHERE id=nullif(current_setting('app.w07_application',true),'')::uuid;
 previous:=CASE WHEN TG_OP='UPDATE' THEN OLD.status::text ELSE NULL END;
 INSERT INTO w07_entitlements("applicationId","learnerId","enrollmentId",outcome,"reasonCode","previousStatus",key) VALUES(app.id,app."learnerId",NEW.id,'ACTIVE','ACADEMIC_AND_VERIFIED_TEST_FEE',previous,current_setting('app.w07_key')::uuid);
 RETURN NEW;
END $$;
CREATE TRIGGER w07_enrollment_guard BEFORE INSERT OR UPDATE OR DELETE ON enrollments FOR EACH ROW EXECUTE FUNCTION w07_enrollment_guard();
CREATE TRIGGER w07_enrollment_truncate BEFORE TRUNCATE ON enrollments FOR EACH STATEMENT EXECUTE FUNCTION w07_enrollment_guard();
CREATE TRIGGER w07_enrollment_receipt AFTER INSERT OR UPDATE ON enrollments FOR EACH ROW EXECUTE FUNCTION w07_enrollment_receipt();
COMMIT;
