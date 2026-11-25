-- W03B-D K1-K6. Shared Article/Tag lifecycle; no BKT, Course or Quiz source rewrite.
CREATE TABLE knowledge_entries (
 id UUID PRIMARY KEY,kind VARCHAR(12) NOT NULL,slug VARCHAR(160) NOT NULL,"tagCode" VARCHAR(80),
 "latestNumber" INTEGER NOT NULL DEFAULT 0,"lockVersion" INTEGER NOT NULL DEFAULT 0,visibility VARCHAR(16) NOT NULL DEFAULT 'HIDDEN',"publishedRevisionId" UUID,
 "createdById" UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 "withdrawnById" UUID REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,"withdrawnAt" TIMESTAMPTZ(3),"withdrawalReason" VARCHAR(1000) NOT NULL DEFAULT '',
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMPTZ(3) NOT NULL,
 CONSTRAINT knowledge_entry_shape CHECK(kind IN ('ARTICLE','TAG') AND slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND "latestNumber">=0 AND "lockVersion">=0
 AND ((kind='ARTICLE' AND "tagCode" IS NULL) OR (kind='TAG' AND "tagCode" IS NOT NULL AND "tagCode" ~ '^[A-Z][A-Z0-9_]*$'))
 AND ((visibility='HIDDEN' AND "publishedRevisionId" IS NULL AND "withdrawnAt" IS NULL AND "withdrawnById" IS NULL)
 OR (visibility='LIVE' AND "publishedRevisionId" IS NOT NULL AND "withdrawnAt" IS NULL AND "withdrawnById" IS NULL)
 OR (visibility='WITHDRAWN' AND "publishedRevisionId" IS NOT NULL AND "withdrawnAt" IS NOT NULL AND "withdrawnById" IS NOT NULL AND length(btrim("withdrawalReason"))>=10)))
);
CREATE UNIQUE INDEX knowledge_entries_slug_key ON knowledge_entries(slug);
CREATE UNIQUE INDEX "knowledge_entries_tagCode_key" ON knowledge_entries("tagCode");
CREATE UNIQUE INDEX "knowledge_entries_publishedRevisionId_key" ON knowledge_entries("publishedRevisionId");
CREATE TABLE knowledge_revisions (
 id UUID PRIMARY KEY,"entryId" UUID NOT NULL REFERENCES knowledge_entries(id) ON DELETE RESTRICT ON UPDATE CASCADE,number INTEGER NOT NULL,state VARCHAR(16) NOT NULL DEFAULT 'DRAFT',"lockVersion" INTEGER NOT NULL DEFAULT 0,
 title VARCHAR(250) NOT NULL,objectives TEXT[] NOT NULL DEFAULT '{}',"bodyMarkdown" TEXT NOT NULL DEFAULT '',examples JSONB NOT NULL DEFAULT '[]',practice JSONB NOT NULL DEFAULT '[]',rights JSONB NOT NULL DEFAULT '{}',"references" JSONB NOT NULL DEFAULT '[]',
 skills "ToeicSkill"[] NOT NULL DEFAULT '{}',part INTEGER,synonyms TEXT[] NOT NULL DEFAULT '{}',"makerIds" UUID[] NOT NULL DEFAULT '{}',
 "createdById" UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,"reviewedById" UUID REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,"publishedById" UUID REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 "reviewReason" VARCHAR(1000) NOT NULL DEFAULT '',"reviewedAt" TIMESTAMPTZ(3),"publishedAt" TIMESTAMPTZ(3),"sourceHash" VARCHAR(64),
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMPTZ(3) NOT NULL,
 CONSTRAINT knowledge_revision_shape CHECK(number>0 AND "lockVersion">=0 AND length(btrim(title))>0 AND state IN ('DRAFT','SUBMITTED','REJECTED','REVIEWED','PUBLISHED')
 AND (state NOT IN ('REVIEWED','PUBLISHED') OR ("reviewedById" IS NOT NULL AND "reviewedAt" IS NOT NULL AND "sourceHash" IS NOT NULL AND "sourceHash" ~ '^[a-f0-9]{64}$'))
 AND ((state='PUBLISHED' AND "publishedById" IS NOT NULL AND "publishedAt" IS NOT NULL) OR (state<>'PUBLISHED' AND "publishedById" IS NULL AND "publishedAt" IS NULL)))
);
CREATE UNIQUE INDEX "knowledge_revisions_entryId_number_key" ON knowledge_revisions("entryId",number);
CREATE INDEX "knowledge_revisions_state_entryId_idx" ON knowledge_revisions(state,"entryId");
ALTER TABLE knowledge_entries ADD CONSTRAINT "knowledge_entries_publishedRevisionId_fkey" FOREIGN KEY("publishedRevisionId") REFERENCES knowledge_revisions(id) ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE TABLE knowledge_revision_tags (
 "articleRevisionId" UUID NOT NULL REFERENCES knowledge_revisions(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 "tagRevisionId" UUID NOT NULL REFERENCES knowledge_revisions(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 PRIMARY KEY("articleRevisionId","tagRevisionId")
);
CREATE INDEX "knowledge_revision_tags_tagRevisionId_idx" ON knowledge_revision_tags("tagRevisionId");
CREATE TABLE quiz_knowledge_links (
 id UUID PRIMARY KEY,"testQuestionId" UUID NOT NULL REFERENCES test_questions(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 "tagRevisionId" UUID NOT NULL REFERENCES knowledge_revisions(id) ON DELETE RESTRICT ON UPDATE CASCADE,"articleRevisionId" UUID NOT NULL REFERENCES knowledge_revisions(id) ON DELETE RESTRICT ON UPDATE CASCADE,"sourceHash" VARCHAR(64) NOT NULL,
 state VARCHAR(16) NOT NULL DEFAULT 'DRAFT',"lockVersion" INTEGER NOT NULL DEFAULT 0,"makerIds" UUID[] NOT NULL DEFAULT '{}',reason VARCHAR(1000) NOT NULL,
 "authoredById" UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,"reviewedById" UUID REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,"publishedById" UUID REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,"withdrawnById" UUID REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 "reviewedAt" TIMESTAMPTZ(3),"publishedAt" TIMESTAMPTZ(3),"withdrawnAt" TIMESTAMPTZ(3),"withdrawalReason" VARCHAR(1000) NOT NULL DEFAULT '',"createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMPTZ(3) NOT NULL,
 CONSTRAINT knowledge_link_shape CHECK("lockVersion">=0 AND length(btrim(reason))>=10 AND "sourceHash" ~ '^[a-f0-9]{64}$' AND state IN ('DRAFT','SUBMITTED','REJECTED','REVIEWED','PUBLISHED','WITHDRAWN')
 AND (state NOT IN ('REVIEWED','PUBLISHED','WITHDRAWN') OR ("reviewedById" IS NOT NULL AND "reviewedAt" IS NOT NULL))
 AND (state NOT IN ('PUBLISHED','WITHDRAWN') OR ("publishedById" IS NOT NULL AND "publishedAt" IS NOT NULL))
 AND (state<>'WITHDRAWN' OR ("withdrawnById" IS NOT NULL AND "withdrawnAt" IS NOT NULL AND length(btrim("withdrawalReason"))>=10)))
);
CREATE UNIQUE INDEX "quiz_knowledge_links_testQuestionId_tagRevisionId_articleRevisionId_key" ON quiz_knowledge_links("testQuestionId","tagRevisionId","articleRevisionId");
CREATE INDEX "quiz_knowledge_links_state_tagRevisionId_idx" ON quiz_knowledge_links(state,"tagRevisionId");
CREATE UNIQUE INDEX w03bd_audit_request_once ON domain_audit_events("actorId",action,"objectType",split_part(reason,':',1)) WHERE "objectType" LIKE 'W03BD_%';

CREATE FUNCTION w03bd_actor(cap TEXT) RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE a UUID; required_role TEXT;
BEGIN
 PERFORM pg_advisory_xact_lock(842030);a:=w03_actor();required_role:=CASE WHEN cap='knowledge.author' THEN 'INSTRUCTOR' ELSE 'ACADEMIC_MANAGER' END;
 IF cap NOT IN ('knowledge.author','knowledge.review','knowledge.publish') OR NOT EXISTS(SELECT 1 FROM users u JOIN permission_grants g ON g."userId"=u.id WHERE u.id=a AND u.status='ACTIVE' AND u.role::text=required_role AND g.capability=cap
 AND g."scopeType"='GLOBAL' AND g."scopeId" IS NULL AND g."approvedBy" IS NOT NULL AND g."approvedAt"<=timezone('UTC',clock_timestamp()) AND g."effectiveAt"<=timezone('UTC',clock_timestamp()) AND g."expiresAt">timezone('UTC',clock_timestamp()) AND g."revokedAt" IS NULL) THEN RAISE EXCEPTION 'W03BD_CAPABILITY_REQUIRED' USING ERRCODE='42501';END IF;RETURN a;
END $$;
CREATE FUNCTION w03bd_live(rid UUID,current_only BOOLEAN DEFAULT false) RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM knowledge_revisions r JOIN knowledge_entries e ON e.id=r."entryId" WHERE r.id=rid AND r.state='PUBLISHED' AND e.visibility='LIVE' AND (NOT current_only OR e."publishedRevisionId"=r.id))
$$;
CREATE FUNCTION w03bd_revision_hash(rid UUID) RETURNS TEXT LANGUAGE sql STABLE AS $$
 SELECT encode(sha256(convert_to((to_jsonb(r)-ARRAY['state','lockVersion','reviewReason','reviewedById','reviewedAt','publishedById','publishedAt','sourceHash','updatedAt'])::text||coalesce((SELECT jsonb_agg("tagRevisionId" ORDER BY "tagRevisionId")::text FROM knowledge_revision_tags WHERE "articleRevisionId"=rid),'[]'),'UTF8')),'hex') FROM knowledge_revisions r WHERE r.id=rid
$$;
CREATE FUNCTION w03bd_entry_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE a UUID;r knowledge_revisions; prior_number INTEGER;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'W03BD_RETAIN_ENTRY' USING ERRCODE='23514';END IF;
 IF TG_OP='INSERT' THEN a:=w03bd_actor('knowledge.author');IF NEW."createdById"<>a OR NEW."latestNumber"<>0 OR NEW."lockVersion"<>0 OR NEW.visibility<>'HIDDEN' THEN RAISE EXCEPTION 'W03BD_ENTRY_START' USING ERRCODE='23514';END IF;
 ELSE
  IF (NEW.id,NEW.kind,NEW.slug,NEW."tagCode",NEW."createdById",NEW."createdAt") IS DISTINCT FROM (OLD.id,OLD.kind,OLD.slug,OLD."tagCode",OLD."createdById",OLD."createdAt") OR NEW."lockVersion"<>OLD."lockVersion"+1 THEN RAISE EXCEPTION 'W03BD_ENTRY_IDENTITY_OR_CAS' USING ERRCODE='23514';END IF;
  IF NEW."publishedRevisionId" IS DISTINCT FROM OLD."publishedRevisionId" THEN
   a:=w03bd_actor('knowledge.publish');SELECT * INTO r FROM knowledge_revisions WHERE id=NEW."publishedRevisionId";
   SELECT number INTO prior_number FROM knowledge_revisions WHERE id=OLD."publishedRevisionId";
   IF r."entryId" IS DISTINCT FROM NEW.id OR r.state<>'PUBLISHED' OR r."publishedById"<>a OR r.number<=coalesce(prior_number,0) OR NEW.visibility<>'LIVE' OR NEW."latestNumber"<>OLD."latestNumber" THEN RAISE EXCEPTION 'W03BD_PUBLICATION_POINTER' USING ERRCODE='23514';END IF;
  ELSIF NEW.visibility='WITHDRAWN' AND OLD.visibility='LIVE' THEN
   a:=w03bd_actor('knowledge.publish');IF NEW."latestNumber"<>OLD."latestNumber" OR NEW."withdrawnById" IS DISTINCT FROM a OR length(btrim(NEW."withdrawalReason"))<10 THEN RAISE EXCEPTION 'W03BD_WITHDRAW_REASON' USING ERRCODE='23514';END IF;NEW."withdrawnAt":=clock_timestamp();
  ELSE
   PERFORM w03bd_actor('knowledge.author');IF NEW."latestNumber"<>OLD."latestNumber"+1 OR (to_jsonb(NEW)-ARRAY['latestNumber','lockVersion','updatedAt']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['latestNumber','lockVersion','updatedAt']) OR NOT EXISTS(SELECT 1 FROM knowledge_revisions WHERE "entryId"=NEW.id AND number=NEW."latestNumber") THEN RAISE EXCEPTION 'W03BD_ENTRY_COUNTER_ONLY' USING ERRCODE='23514';END IF;
  END IF;
 END IF;NEW."updatedAt":=clock_timestamp();RETURN NEW;
END $$;
CREATE TRIGGER w03bd_entry_guard BEFORE INSERT OR UPDATE OR DELETE ON knowledge_entries FOR EACH ROW EXECUTE FUNCTION w03bd_entry_guard();
CREATE FUNCTION w03bd_revision_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE a UUID;e knowledge_entries; previous_state TEXT; prior_makers UUID[];
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'W03BD_RETAIN_REVISION' USING ERRCODE='23514';END IF;SELECT * INTO e FROM knowledge_entries WHERE id=NEW."entryId";
 IF TG_OP='INSERT' THEN
  a:=w03bd_actor('knowledge.author');SELECT state,"makerIds" INTO previous_state,prior_makers FROM knowledge_revisions WHERE "entryId"=e.id ORDER BY number DESC LIMIT 1;
  IF NEW."createdById"<>a OR NEW.state<>'DRAFT' OR NEW."lockVersion"<>0 OR NEW.number<>e."latestNumber"+1 OR (previous_state IS NOT NULL AND previous_state<>'PUBLISHED') THEN RAISE EXCEPTION 'W03BD_REVISION_START' USING ERRCODE='23514';END IF;NEW."makerIds":=ARRAY(SELECT DISTINCT unnest(coalesce(prior_makers,'{}')||a));
 ELSE
  IF OLD.state='PUBLISHED' OR (NEW.id,NEW."entryId",NEW.number,NEW."createdById",NEW."createdAt") IS DISTINCT FROM (OLD.id,OLD."entryId",OLD.number,OLD."createdById",OLD."createdAt") OR NEW."lockVersion"<>OLD."lockVersion"+1 THEN RAISE EXCEPTION 'W03BD_FROZEN_OR_CAS' USING ERRCODE='23514';END IF;
  IF OLD.state IN ('DRAFT','REJECTED') AND NEW.state IN ('DRAFT','SUBMITTED') THEN
   a:=w03bd_actor('knowledge.author');NEW."makerIds":=ARRAY(SELECT DISTINCT unnest(OLD."makerIds"||a));NEW."reviewedById":=NULL;NEW."reviewedAt":=NULL;NEW."sourceHash":=NULL;
  ELSE
   IF (to_jsonb(NEW)-ARRAY['state','reviewReason','reviewedById','reviewedAt','publishedById','publishedAt','sourceHash','lockVersion','updatedAt']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','reviewReason','reviewedById','reviewedAt','publishedById','publishedAt','sourceHash','lockVersion','updatedAt']) THEN RAISE EXCEPTION 'W03BD_REVIEW_SAVED_ONLY' USING ERRCODE='23514';END IF;
   IF OLD.state='SUBMITTED' AND NEW.state IN ('REVIEWED','REJECTED') OR OLD.state='REVIEWED' AND NEW.state='REJECTED' THEN
    a:=w03bd_actor('knowledge.review');IF a=ANY(OLD."makerIds") OR length(btrim(NEW."reviewReason"))<10 THEN RAISE EXCEPTION 'W03BD_INDEPENDENT_REVIEW_REQUIRED' USING ERRCODE='42501';END IF;
    IF NEW.state='REVIEWED' THEN NEW."reviewedById":=a;NEW."reviewedAt":=clock_timestamp();NEW."sourceHash":=w03bd_revision_hash(OLD.id);END IF;
   ELSIF OLD.state='REVIEWED' AND NEW.state='PUBLISHED' THEN
    a:=w03bd_actor('knowledge.publish');IF a=ANY(OLD."makerIds") OR NEW."publishedById" IS DISTINCT FROM a OR NEW."sourceHash" IS DISTINCT FROM w03bd_revision_hash(OLD.id) THEN RAISE EXCEPTION 'W03BD_INDEPENDENT_PUBLISH_REQUIRED' USING ERRCODE='42501';END IF;NEW."publishedAt":=clock_timestamp();
   ELSE RAISE EXCEPTION 'W03BD_TRANSITION' USING ERRCODE='23514';END IF;
  END IF;
 END IF;
 IF NEW.state IN ('SUBMITTED','REVIEWED','PUBLISHED') THEN
  IF e.kind='TAG' THEN
   IF cardinality(NEW.skills)=0 OR NEW.part IS NULL OR NEW.part NOT BETWEEN 1 AND 7 THEN RAISE EXCEPTION 'W03BD_TYPED_TAG_REQUIRED' USING ERRCODE='23514';END IF;
  ELSE
   IF cardinality(NEW.objectives)=0 OR length(btrim(NEW."bodyMarkdown"))<100 OR jsonb_array_length(NEW.examples)<1 OR jsonb_array_length(NEW.practice)<3 OR NOT EXISTS(SELECT 1 FROM knowledge_revision_tags WHERE "articleRevisionId"=NEW.id)
    OR NOT coalesce(NEW.rights->>'kind' IN ('ORIGINAL','LICENSED'),false) OR length(btrim(coalesce(NEW.rights->>'owner','')))<3 OR length(btrim(coalesce(NEW.rights->>'proof','')))<20 OR coalesce(NEW.rights->>'license','') NOT IN ('ORIGINAL_TEXT','CC_BY','CC0','PERMISSION')
    OR EXISTS(SELECT 1 FROM knowledge_revision_tags WHERE "articleRevisionId"=NEW.id AND NOT w03bd_live("tagRevisionId",true)) THEN RAISE EXCEPTION 'W03BD_CONTENT_RIGHTS_OR_TAGS_INCOMPLETE' USING ERRCODE='23514';END IF;
  END IF;
 END IF;
 NEW."updatedAt":=clock_timestamp();RETURN NEW;
END $$;
CREATE TRIGGER w03bd_revision_guard BEFORE INSERT OR UPDATE OR DELETE ON knowledge_revisions FOR EACH ROW EXECUTE FUNCTION w03bd_revision_guard();
CREATE FUNCTION w03bd_tag_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE row knowledge_revision_tags;r knowledge_revisions;k TEXT;
BEGIN
 IF TG_OP='DELETE' THEN row:=OLD;ELSE row:=NEW;END IF;SELECT * INTO r FROM knowledge_revisions WHERE id=row."articleRevisionId";SELECT kind INTO k FROM knowledge_entries WHERE id=r."entryId";PERFORM w03bd_actor('knowledge.author');
 IF TG_OP='UPDATE' OR r.state NOT IN ('DRAFT','REJECTED') OR k<>'ARTICLE' OR (TG_OP<>'DELETE' AND NOT EXISTS(SELECT 1 FROM knowledge_revisions tr JOIN knowledge_entries te ON te.id=tr."entryId" WHERE tr.id=row."tagRevisionId" AND te.kind='TAG' AND w03bd_live(tr.id,true))) THEN RAISE EXCEPTION 'W03BD_TAG_PROVENANCE_OR_FROZEN' USING ERRCODE='23514';END IF;
 RETURN row;
END $$;
CREATE TRIGGER w03bd_tag_guard BEFORE INSERT OR UPDATE OR DELETE ON knowledge_revision_tags FOR EACH ROW EXECUTE FUNCTION w03bd_tag_guard();
CREATE FUNCTION w03bd_link_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c UUID;a UUID;t tests;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'W03BD_RETAIN_LINK' USING ERRCODE='23514';END IF;
 SELECT src.* INTO t FROM test_questions q JOIN tests src ON src.id=q."testId" WHERE q.id=NEW."testQuestionId";c:=w03bc_class(t.id);
 IF c IS NULL OR t."quizState" IS DISTINCT FROM 'APPROVED' OR t."quizSourceHash" IS DISTINCT FROM NEW."sourceHash" OR (NOT (TG_OP='UPDATE' AND OLD.state='PUBLISHED' AND NEW.state='WITHDRAWN') AND (NOT w03bd_live(NEW."tagRevisionId",true) OR NOT w03bd_live(NEW."articleRevisionId",true) OR NOT EXISTS(SELECT 1 FROM knowledge_revision_tags WHERE "articleRevisionId"=NEW."articleRevisionId" AND "tagRevisionId"=NEW."tagRevisionId"))) THEN RAISE EXCEPTION 'W03BD_APPROVED_PROVENANCE_REQUIRED' USING ERRCODE='23514';END IF;
 IF TG_OP='INSERT' THEN
  a:=w03bd_actor('knowledge.author');PERFORM w03_teacher(c);IF NEW."authoredById"<>a OR NEW.state<>'DRAFT' OR NEW."lockVersion"<>0 THEN RAISE EXCEPTION 'W03BD_LINK_START' USING ERRCODE='23514';END IF;NEW."makerIds":=ARRAY[a];
 ELSE
  IF (NEW.id,NEW."testQuestionId",NEW."tagRevisionId",NEW."articleRevisionId",NEW."sourceHash",NEW."authoredById",NEW."createdAt") IS DISTINCT FROM (OLD.id,OLD."testQuestionId",OLD."tagRevisionId",OLD."articleRevisionId",OLD."sourceHash",OLD."authoredById",OLD."createdAt") OR NEW."lockVersion"<>OLD."lockVersion"+1 OR OLD.state='WITHDRAWN' THEN RAISE EXCEPTION 'W03BD_LINK_IDENTITY_OR_CAS' USING ERRCODE='23514';END IF;
  IF OLD.state IN ('DRAFT','REJECTED') AND NEW.state='SUBMITTED' THEN a:=w03bd_actor('knowledge.author');PERFORM w03_teacher(c);
  ELSE
   IF OLD.state='SUBMITTED' AND NEW.state IN ('REVIEWED','REJECTED') THEN a:=w03bd_actor('knowledge.review');
   ELSIF OLD.state='REVIEWED' AND NEW.state='PUBLISHED' OR OLD.state='PUBLISHED' AND NEW.state='WITHDRAWN' THEN a:=w03bd_actor('knowledge.publish');
   ELSE RAISE EXCEPTION 'W03BD_LINK_TRANSITION' USING ERRCODE='23514';END IF;
   IF a=ANY(OLD."makerIds") OR a=ANY(t."quizMakerIds") OR NOT v2_academic_approver(a,'academic.quiz.approve','CLASS',c::text) THEN RAISE EXCEPTION 'W03BD_INDEPENDENT_CLASS_CHECKER_REQUIRED' USING ERRCODE='42501';END IF;
   IF (to_jsonb(NEW)-ARRAY['state','reviewedById','reviewedAt','publishedById','publishedAt','withdrawnById','withdrawnAt','withdrawalReason','lockVersion','updatedAt']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','reviewedById','reviewedAt','publishedById','publishedAt','withdrawnById','withdrawnAt','withdrawalReason','lockVersion','updatedAt']) THEN RAISE EXCEPTION 'W03BD_LINK_SAVED_ONLY' USING ERRCODE='23514';END IF;
   IF NEW.state='REVIEWED' THEN NEW."reviewedById":=a;NEW."reviewedAt":=clock_timestamp();END IF;
   IF NEW.state='PUBLISHED' THEN NEW."publishedById":=a;NEW."publishedAt":=clock_timestamp();END IF;
   IF NEW.state='WITHDRAWN' THEN IF NEW."withdrawnById" IS DISTINCT FROM a OR length(btrim(NEW."withdrawalReason"))<10 THEN RAISE EXCEPTION 'W03BD_WITHDRAW_REASON' USING ERRCODE='23514';END IF;NEW."withdrawnAt":=clock_timestamp();END IF;
  END IF;
 END IF;NEW."updatedAt":=clock_timestamp();RETURN NEW;
END $$;
CREATE TRIGGER w03bd_link_guard BEFORE INSERT OR UPDATE OR DELETE ON quiz_knowledge_links FOR EACH ROW EXECUTE FUNCTION w03bd_link_guard();
