BEGIN;
-- CreateTable
CREATE TABLE "support_topics" (
    "id" UUID NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "version" INTEGER NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "routes" TEXT[],
    "authorId" UUID NOT NULL,
    "approvedById" UUID,
    "approvedAt" TIMESTAMPTZ(3),
    "reason" VARCHAR(500) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_topics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_tickets" (
    "id" UUID NOT NULL,
    "reference" VARCHAR(48) NOT NULL,
    "topicId" UUID NOT NULL,
    "learnerId" UUID,
    "guestName" VARCHAR(100),
    "claimedContact" VARCHAR(160),
    "contactVerified" BOOLEAN NOT NULL DEFAULT false,
    "contactMethod" VARCHAR(16) NOT NULL,
    "description" VARCHAR(2000) NOT NULL,
    "consentVersion" VARCHAR(40) NOT NULL,
    "ownerId" UUID,
    "state" VARCHAR(24) NOT NULL DEFAULT 'NEW',
    "lockVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_messages" (
    "id" UUID NOT NULL,
    "ticketId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "visibility" VARCHAR(16) NOT NULL,
    "body" VARCHAR(2000) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_events" (
    "id" UUID NOT NULL,
    "ticketId" UUID NOT NULL,
    "actorId" UUID,
    "kind" VARCHAR(32) NOT NULL,
    "publicLabel" VARCHAR(120) NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_referrals" (
    "id" UUID NOT NULL,
    "ticketId" UUID NOT NULL,
    "category" VARCHAR(24) NOT NULL,
    "specialistId" UUID NOT NULL,
    "createdById" UUID NOT NULL,
    "summary" VARCHAR(1000) NOT NULL,
    "state" VARCHAR(16) NOT NULL DEFAULT 'OPEN',
    "response" VARCHAR(1500),
    "reason" VARCHAR(500) NOT NULL,
    "lockVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMPTZ(3),

    CONSTRAINT "support_referrals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_consents" (
    "id" UUID NOT NULL,
    "ticketId" UUID NOT NULL,
    "learnerId" UUID NOT NULL,
    "purpose" VARCHAR(24) NOT NULL,
    "attemptId" UUID,
    "granted" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_consents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "counseling_applications" (
    "id" UUID NOT NULL,
    "ticketId" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "learnerId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "reviewerId" UUID NOT NULL,
    "consentId" UUID NOT NULL,
    "state" VARCHAR(24) NOT NULL DEFAULT 'DRAFT',
    "needs" VARCHAR(2000) NOT NULL,
    "target" VARCHAR(500) NOT NULL,
    "goalLR" INTEGER,
    "goalSpeaking" INTEGER,
    "goalWriting" INTEGER,
    "classId" UUID,
    "courseVersionId" UUID,
    "placementAttemptId" UUID,
    "provenance" JSONB NOT NULL,
    "snapshot" JSONB,
    "reason" VARCHAR(500) NOT NULL,
    "reviewReason" VARCHAR(500),
    "lockVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMPTZ(3),
    "reviewedAt" TIMESTAMPTZ(3),

    CONSTRAINT "counseling_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_requests" (
    "id" UUID NOT NULL,
    "principal" VARCHAR(80) NOT NULL,
    "key" UUID NOT NULL,
    "digest" VARCHAR(64) NOT NULL,
    "response" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_abuse_buckets" (
    "id" VARCHAR(64) NOT NULL,
    "windowStart" TIMESTAMPTZ(3) NOT NULL,
    "count" INTEGER NOT NULL,

    CONSTRAINT "support_abuse_buckets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "support_topics_code_version_key" ON "support_topics"("code", "version");

-- CreateIndex
CREATE UNIQUE INDEX "support_tickets_reference_key" ON "support_tickets"("reference");

-- CreateIndex
CREATE INDEX "support_tickets_ownerId_state_createdAt_idx" ON "support_tickets"("ownerId", "state", "createdAt");

-- CreateIndex
CREATE INDEX "support_tickets_learnerId_createdAt_idx" ON "support_tickets"("learnerId", "createdAt");

-- CreateIndex
CREATE INDEX "support_messages_ticketId_createdAt_idx" ON "support_messages"("ticketId", "createdAt");

-- CreateIndex
CREATE INDEX "support_events_ticketId_createdAt_idx" ON "support_events"("ticketId", "createdAt");

-- CreateIndex
CREATE INDEX "support_referrals_specialistId_state_idx" ON "support_referrals"("specialistId", "state");

-- CreateIndex
CREATE INDEX "support_consents_ticketId_purpose_createdAt_idx" ON "support_consents"("ticketId", "purpose", "createdAt");

-- CreateIndex
CREATE INDEX "counseling_applications_reviewerId_state_idx" ON "counseling_applications"("reviewerId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "counseling_applications_ticketId_number_key" ON "counseling_applications"("ticketId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "support_requests_principal_key_key" ON "support_requests"("principal", "key");

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "support_topics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "support_tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_events" ADD CONSTRAINT "support_events_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "support_tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_referrals" ADD CONSTRAINT "support_referrals_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "support_tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_consents" ADD CONSTRAINT "support_consents_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "support_tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "counseling_applications" ADD CONSTRAINT "counseling_applications_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "support_tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Additive W05A guards. Manual cross-domain FKs are intentional, scalar Prisma fields remain unchanged.
-- Extend the existing scoped-grant check without changing any historical grant rows.
ALTER TABLE permission_grants DROP CONSTRAINT grant_scope;
ALTER TABLE permission_grants ADD CONSTRAINT grant_scope CHECK (
 ("scopeType"='GLOBAL' AND "scopeId" IS NULL AND capability NOT LIKE 'academic.%' AND (capability NOT LIKE 'support.%' OR capability IN ('support.taxonomy.author','support.taxonomy.approve'))) OR
 ("scopeType"='CLASS' AND "scopeId" IS NOT NULL AND capability IN ('class.read','academic.schedule.approve','academic.rubric.approve','academic.grade.publish','academic.quiz.approve','academic.quiz.grade.publish')) OR
 ("scopeType"='COURSE' AND "scopeId" IS NOT NULL AND capability='academic.program.approve') OR
 ("scopeType"='SUPPORT_TOPIC' AND "scopeId" ~ '^[A-Z][A-Z0-9_]{2,39}$' AND capability IN ('support.ticket.read','support.ticket.assign','support.ticket.reply','support.ticket.transfer','support.ticket.close','support.application.write','support.application.review','support.referral.respond')));
ALTER TABLE support_topics ADD CONSTRAINT support_topic_author_fk FOREIGN KEY ("authorId") REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE support_topics ADD CONSTRAINT support_topic_approver_fk FOREIGN KEY ("approvedById") REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE support_tickets ADD CONSTRAINT support_learner_fk FOREIGN KEY ("learnerId") REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE support_tickets ADD CONSTRAINT support_owner_fk FOREIGN KEY ("ownerId") REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE support_messages ADD CONSTRAINT support_message_actor_fk FOREIGN KEY ("actorId") REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE support_events ADD CONSTRAINT support_event_actor_fk FOREIGN KEY ("actorId") REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE support_referrals ADD CONSTRAINT support_specialist_fk FOREIGN KEY ("specialistId") REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE support_referrals ADD CONSTRAINT support_referral_maker_fk FOREIGN KEY ("createdById") REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE support_consents ADD CONSTRAINT support_consent_learner_fk FOREIGN KEY ("learnerId") REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE support_consents ADD CONSTRAINT support_consent_attempt_fk FOREIGN KEY ("attemptId") REFERENCES test_attempts(id) ON DELETE RESTRICT;
ALTER TABLE counseling_applications ADD CONSTRAINT counseling_learner_fk FOREIGN KEY ("learnerId") REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE counseling_applications ADD CONSTRAINT counseling_author_fk FOREIGN KEY ("authorId") REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE counseling_applications ADD CONSTRAINT counseling_reviewer_fk FOREIGN KEY ("reviewerId") REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE counseling_applications ADD CONSTRAINT counseling_consent_fk FOREIGN KEY ("consentId") REFERENCES support_consents(id) ON DELETE RESTRICT;
ALTER TABLE counseling_applications ADD CONSTRAINT counseling_class_fk FOREIGN KEY ("classId") REFERENCES class_offerings(id) ON DELETE RESTRICT;
ALTER TABLE counseling_applications ADD CONSTRAINT counseling_version_fk FOREIGN KEY ("courseVersionId") REFERENCES course_versions(id) ON DELETE RESTRICT;
ALTER TABLE counseling_applications ADD CONSTRAINT counseling_placement_fk FOREIGN KEY ("placementAttemptId") REFERENCES test_attempts(id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX support_one_open_referral ON support_referrals("ticketId",category,"specialistId") WHERE state='OPEN';
ALTER TABLE support_tickets ADD CONSTRAINT support_ticket_bounds CHECK ("lockVersion">=0 AND NOT "contactVerified" AND state IN ('NEW','TRIAGED','IN_PROGRESS','WAITING_CUSTOMER','WAITING_SPECIALIST','RESOLVED','CLOSED','REOPENED') AND "consentVersion"='DEV_SUPPORT_V1' AND (("learnerId" IS NOT NULL AND "guestName" IS NULL AND "claimedContact" IS NULL AND "contactMethod"='IN_APP') OR ("learnerId" IS NULL AND "guestName" IS NOT NULL AND "claimedContact" ~ '^[a-zA-Z0-9_.+\-]+@example\.invalid$' AND "contactMethod"='EMAIL')));
ALTER TABLE support_messages ADD CONSTRAINT support_visibility CHECK(visibility IN ('PUBLIC','INTERNAL'));
ALTER TABLE support_referrals ADD CONSTRAINT support_referral_states CHECK(state IN ('OPEN','RESPONDED') AND category IN ('ACADEMIC','FINANCE','LEARNING') AND ((state='OPEN' AND response IS NULL AND "respondedAt" IS NULL) OR (state='RESPONDED' AND response IS NOT NULL AND "respondedAt" IS NOT NULL)));
ALTER TABLE support_consents ADD CONSTRAINT support_consent_purpose CHECK(purpose IN ('APPLICATION','PLACEMENT') AND ((purpose='APPLICATION' AND "attemptId" IS NULL) OR(purpose='PLACEMENT' AND "attemptId" IS NOT NULL)));
ALTER TABLE counseling_applications ADD CONSTRAINT counseling_bounds CHECK(state IN ('DRAFT','SUBMITTED_TO_HVU','ACKNOWLEDGED','CORRECTION_REQUESTED') AND number>0 AND "lockVersion">=0 AND ("goalLR" IS NULL OR "goalLR" BETWEEN 10 AND 990) AND ("goalSpeaking" IS NULL OR "goalSpeaking" BETWEEN 0 AND 200) AND ("goalWriting" IS NULL OR "goalWriting" BETWEEN 0 AND 200) AND (("classId" IS NULL)=("courseVersionId" IS NULL)));
CREATE FUNCTION w05_actor() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.support_actor',true),'')::uuid $$;
CREATE FUNCTION w05_role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT role::text FROM users WHERE id=w05_actor() AND status='ACTIVE' AND email LIKE '%@example.invalid' AND EXISTS(SELECT 1 FROM user_sessions WHERE sid=current_setting('app.support_session',true) AND sess->>'userId'=w05_actor()::text AND expire>clock_timestamp()) $$;
CREATE FUNCTION w05_cap(who uuid, cap text, topic text) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM users u JOIN permission_grants g ON g."userId"=u.id WHERE u.id=who AND u.status='ACTIVE' AND g.capability=cap AND g."approvedBy" IS NOT NULL AND g."approvedAt"<=clock_timestamp() AND g."effectiveAt"<=clock_timestamp() AND g."expiresAt">clock_timestamp() AND g."revokedAt" IS NULL AND
 (cap NOT IN ('support.ticket.assign','support.ticket.reply','support.ticket.transfer','support.ticket.close','support.application.write') OR EXISTS(SELECT 1 FROM permission_grants rg WHERE rg."userId"=who AND rg.capability='support.ticket.read' AND rg."scopeType"='SUPPORT_TOPIC' AND rg."scopeId"=topic AND rg."approvedBy" IS NOT NULL AND rg."approvedAt"<=clock_timestamp() AND rg."effectiveAt"<=clock_timestamp() AND rg."expiresAt">clock_timestamp() AND rg."revokedAt" IS NULL)) AND
 ((g."scopeType"='SUPPORT_TOPIC' AND g."scopeId"=topic AND ((cap IN ('support.ticket.read','support.ticket.assign','support.ticket.reply','support.ticket.transfer','support.ticket.close','support.application.write') AND u.role='COUNSELOR') OR(cap='support.application.review' AND u.role='ACADEMIC_MANAGER') OR(cap='support.referral.respond' AND u.role IN ('ACADEMIC_MANAGER','CASHIER','INSTRUCTOR')))) OR (g."scopeType"='GLOBAL' AND g."scopeId" IS NULL AND cap IN ('support.taxonomy.author','support.taxonomy.approve') AND u.role='ACADEMIC_MANAGER')))
$$;
CREATE FUNCTION w05_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE a uuid:=w05_actor(); r text:=w05_role(); t support_tickets%ROWTYPE; code text; cap text; latest support_consents%ROWTYPE; routes text[];
BEGIN
 IF current_database() !~ '^v2_wave01_dev_test_w05a_[a-z0-9_]+$' OR TG_OP IN ('DELETE','TRUNCATE') THEN RAISE EXCEPTION 'SUPPORT_APPEND_ONLY_OR_DEV' USING ERRCODE='42501'; END IF;
 IF a IS NULL AND TG_TABLE_NAME NOT IN ('support_tickets','support_events','support_requests','support_abuse_buckets') THEN RAISE EXCEPTION 'SUPPORT_ACTOR_REQUIRED' USING ERRCODE='42501'; END IF;
 IF TG_TABLE_NAME IN ('support_messages','support_events','support_consents','support_requests') AND TG_OP<>'INSERT' THEN RAISE EXCEPTION 'SUPPORT_APPEND_ONLY' USING ERRCODE='42501'; END IF;
 IF a IS NOT NULL AND r IS NULL THEN RAISE EXCEPTION 'SUPPORT_CURRENT_SESSION' USING ERRCODE='42501'; END IF;
 IF TG_TABLE_NAME='support_topics' THEN
   IF TG_OP='INSERT' THEN
     IF NEW."authorId"<>a OR NOT w05_cap(a,'support.taxonomy.author',NULL) OR NEW."approvedById" IS NOT NULL OR NEW."approvedAt" IS NOT NULL OR NEW.version<>(SELECT coalesce(max(version),0)+1 FROM support_topics WHERE support_topics.code=NEW.code) OR NEW.routes <@ ARRAY['ACADEMIC','FINANCE','LEARNING']::text[] IS NOT TRUE THEN RAISE EXCEPTION 'SUPPORT_TOPIC_AUTHOR' USING ERRCODE='42501'; END IF;
   ELSE
     IF OLD."approvedById" IS NOT NULL OR NEW."approvedById" IS DISTINCT FROM a OR a=OLD."authorId" OR NOT w05_cap(a,'support.taxonomy.approve',NULL) OR NEW."approvedAt" IS NULL OR (to_jsonb(NEW)-ARRAY['approvedById','approvedAt']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['approvedById','approvedAt']) THEN RAISE EXCEPTION 'SUPPORT_INDEPENDENT_TOPIC' USING ERRCODE='42501'; END IF;
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
     ELSIF NOT ((r='STUDENT' AND NEW."learnerId"=a) OR (OLD."ownerId"=a AND (w05_cap(a,'support.ticket.reply',code) OR w05_cap(a,'support.ticket.close',code) OR w05_cap(a,'support.ticket.transfer',code) OR w05_cap(a,'support.application.write',code)))) THEN RAISE EXCEPTION 'SUPPORT_OWNER_REQUIRED' USING ERRCODE='42501'; END IF;
     IF NEW.state<>OLD.state THEN
       IF NEW.state='WAITING_SPECIALIST' AND NOT EXISTS(SELECT 1 FROM support_referrals WHERE "ticketId"=NEW.id AND state='OPEN') THEN RAISE EXCEPTION 'SUPPORT_OPEN_REFERRAL_REQUIRED' USING ERRCODE='42501'; END IF;
       IF NEW.state IN ('RESOLVED','CLOSED') AND EXISTS(SELECT 1 FROM support_referrals WHERE "ticketId"=NEW.id AND state='OPEN') THEN RAISE EXCEPTION 'SUPPORT_REFERRAL_UNFINISHED' USING ERRCODE='42501'; END IF;
       IF r='STUDENT' AND NOT ((OLD.state='RESOLVED' AND NEW.state IN ('CLOSED','REOPENED')) OR (OLD.state='CLOSED' AND NEW.state='REOPENED')) THEN RAISE EXCEPTION 'SUPPORT_LEARNER_TRANSITION' USING ERRCODE='42501'; END IF;
       IF r<>'STUDENT' AND NOT w05_cap(a,'support.ticket.close',code) THEN RAISE EXCEPTION 'SUPPORT_CLOSE_GRANT' USING ERRCODE='42501'; END IF;
       IF NOT ((OLD.state='NEW' AND NEW.state IN ('TRIAGED','IN_PROGRESS')) OR (OLD.state='TRIAGED' AND NEW.state='IN_PROGRESS') OR (OLD.state='IN_PROGRESS' AND NEW.state IN ('WAITING_CUSTOMER','WAITING_SPECIALIST','RESOLVED')) OR (OLD.state IN ('WAITING_CUSTOMER','WAITING_SPECIALIST') AND NEW.state IN ('IN_PROGRESS','RESOLVED')) OR (OLD.state='RESOLVED' AND NEW.state IN ('CLOSED','REOPENED')) OR (OLD.state='CLOSED' AND NEW.state='REOPENED') OR (OLD.state='REOPENED' AND NEW.state='IN_PROGRESS')) THEN RAISE EXCEPTION 'SUPPORT_TRANSITION' USING ERRCODE='42501'; END IF;
     END IF;
   END IF;
 ELSE
   SELECT * INTO t FROM support_tickets WHERE id=NEW."ticketId";
   SELECT st.code,st.routes INTO code,routes FROM support_topics st WHERE st.id=t."topicId";
   IF TG_TABLE_NAME='support_messages' THEN
     IF NEW."actorId"<>a OR NOT ((r='STUDENT' AND t."learnerId"=a AND NEW.visibility='PUBLIC') OR (t."ownerId"=a AND w05_cap(a,'support.ticket.reply',code))) OR t.state='CLOSED' THEN RAISE EXCEPTION 'SUPPORT_MESSAGE_SCOPE' USING ERRCODE='42501'; END IF;
   ELSIF TG_TABLE_NAME='support_events' THEN
     IF NEW."actorId" IS DISTINCT FROM a OR (a IS NULL AND (NEW.kind<>'CREATED' OR current_setting('app.support_intake',true) IS DISTINCT FROM 'true')) OR (a IS NOT NULL AND NOT ((r='STUDENT' AND t."learnerId"=a) OR (r='COUNSELOR' AND (t."ownerId"=a OR w05_cap(a,'support.ticket.assign',code) OR w05_cap(a,'support.ticket.transfer',code))) OR EXISTS(SELECT 1 FROM support_referrals WHERE "ticketId"=t.id AND "specialistId"=a AND w05_cap(a,'support.referral.respond',code)) OR EXISTS(SELECT 1 FROM counseling_applications WHERE "ticketId"=t.id AND "reviewerId"=a AND w05_cap(a,'support.application.review',code)))) THEN RAISE EXCEPTION 'SUPPORT_EVENT_SCOPE' USING ERRCODE='42501'; END IF;
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
END $$;
DO $$ DECLARE name text; BEGIN FOREACH name IN ARRAY ARRAY['support_topics','support_tickets','support_messages','support_events','support_referrals','support_consents','counseling_applications','support_requests','support_abuse_buckets'] LOOP EXECUTE format('CREATE TRIGGER w05a_%I BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION w05_guard()',name,name);EXECUTE format('CREATE TRIGGER w05a_%I_truncate BEFORE TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION w05_guard()',name,name); END LOOP; END $$;

COMMIT;
