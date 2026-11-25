-- Independent additive CMS lane. Does not run or mark Prisma migrations33/34.
CREATE SCHEMA cms_v2;
CREATE TABLE cms_v2.migrations (version text PRIMARY KEY, checksum text NOT NULL, authority text NOT NULL, applied_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE TABLE cms_v2.target_binding (singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton), database_name text NOT NULL, database_oid oid NOT NULL, physical_id text NOT NULL, authority text NOT NULL);
CREATE TABLE cms_v2.persons (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), label text NOT NULL);
CREATE TABLE cms_v2.identities (user_id uuid PRIMARY KEY REFERENCES public.users(id), person_id uuid NOT NULL REFERENCES cms_v2.persons(id));
CREATE TABLE cms_v2.scopes (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, policy_ref text NOT NULL CHECK(policy_ref='V2-DEC-070/BR-V2-112:ORIGINAL_TEAM_TEXT'));
CREATE TABLE cms_v2.grants (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES public.users(id), scope_id uuid NOT NULL REFERENCES cms_v2.scopes(id),
 capability text NOT NULL CHECK(capability IN ('cms.draft','cms.review','cms.publish','cms.read','cms.audit')),
 effective_at timestamptz NOT NULL, expires_at timestamptz NOT NULL CHECK(expires_at>effective_at), revoked_at timestamptz,
 authority text NOT NULL, granted_at timestamptz NOT NULL DEFAULT clock_timestamp(), UNIQUE(user_id,scope_id,capability)
);
CREATE TABLE cms_v2.contents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), scope_id uuid NOT NULL REFERENCES cms_v2.scopes(id), slug text NOT NULL UNIQUE CHECK(slug~'^[a-z0-9][a-z0-9-]{2,119}$'),
 created_by_user uuid NOT NULL REFERENCES public.users(id), created_by_person uuid NOT NULL REFERENCES cms_v2.persons(id), created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 head_revision uuid, current_publication uuid, lock_version integer NOT NULL DEFAULT 0
);
CREATE TABLE cms_v2.revisions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), content_id uuid NOT NULL REFERENCES cms_v2.contents(id), number integer NOT NULL CHECK(number>0), parent_id uuid REFERENCES cms_v2.revisions(id),
 title text NOT NULL CHECK(length(btrim(title)) BETWEEN 3 AND 160), body text NOT NULL CHECK(length(btrim(body)) BETWEEN 1 AND 20000),
 source_reference text NOT NULL CHECK(length(btrim(source_reference)) BETWEEN 3 AND 300), policy_ref text NOT NULL CHECK(policy_ref='V2-DEC-070/BR-V2-112:ORIGINAL_TEAM_TEXT'),
 body_sha256 text NOT NULL, author_user uuid NOT NULL REFERENCES public.users(id), author_person uuid NOT NULL REFERENCES cms_v2.persons(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), UNIQUE(content_id,number)
);
CREATE TABLE cms_v2.revision_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), revision_id uuid NOT NULL REFERENCES cms_v2.revisions(id), number integer NOT NULL,
 state text NOT NULL CHECK(state IN ('DRAFT','IN_REVIEW','APPROVED','REJECTED','PUBLISHED','WITHDRAWN')),
 actor_user uuid NOT NULL REFERENCES public.users(id), actor_person uuid NOT NULL REFERENCES cms_v2.persons(id), reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 3 AND 500),
 at timestamptz NOT NULL DEFAULT clock_timestamp(), UNIQUE(revision_id,number)
);
CREATE TABLE cms_v2.revision_authors (revision_id uuid NOT NULL REFERENCES cms_v2.revisions(id), person_id uuid NOT NULL REFERENCES cms_v2.persons(id), PRIMARY KEY(revision_id,person_id));
CREATE TABLE cms_v2.publications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), revision_id uuid NOT NULL UNIQUE REFERENCES cms_v2.revisions(id), approval_event_id uuid NOT NULL REFERENCES cms_v2.revision_events(id),
 published_by_user uuid NOT NULL REFERENCES public.users(id), published_by_person uuid NOT NULL REFERENCES cms_v2.persons(id), at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE cms_v2.publication_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), publication_id uuid NOT NULL REFERENCES cms_v2.publications(id), kind text NOT NULL CHECK(kind IN ('PUBLISHED','WITHDRAWN','SUPERSEDED')),
 actor_user uuid NOT NULL REFERENCES public.users(id), actor_person uuid NOT NULL REFERENCES cms_v2.persons(id), reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 3 AND 500), at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE cms_v2.audit_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, scope_id uuid NOT NULL REFERENCES cms_v2.scopes(id), content_id uuid NOT NULL REFERENCES cms_v2.contents(id), revision_id uuid NOT NULL REFERENCES cms_v2.revisions(id),
 action text NOT NULL, actor_user uuid NOT NULL REFERENCES public.users(id), actor_person uuid NOT NULL REFERENCES cms_v2.persons(id), reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 3 AND 500),
 at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE cms_v2.contents ADD CONSTRAINT cms_head_revision FOREIGN KEY(head_revision) REFERENCES cms_v2.revisions(id), ADD CONSTRAINT cms_current_publication FOREIGN KEY(current_publication) REFERENCES cms_v2.publications(id);
CREATE INDEX cms_revision_content_idx ON cms_v2.revisions(content_id,number DESC);
CREATE INDEX cms_revision_event_idx ON cms_v2.revision_events(revision_id,number DESC);
CREATE INDEX cms_audit_content_idx ON cms_v2.audit_events(content_id,id);
CREATE INDEX cms_grant_scope_idx ON cms_v2.grants(user_id,scope_id,capability);

CREATE FUNCTION cms_v2.assert_target() RETURNS void LANGUAGE plpgsql AS $$
DECLARE b cms_v2.target_binding;
BEGIN
 SELECT * INTO b FROM cms_v2.target_binding WHERE singleton;
 IF b IS NULL OR current_database()<>b.database_name OR (SELECT oid FROM pg_database WHERE datname=current_database())<>b.database_oid
 OR current_database()!~'^v2_wave01_dev_test_w10_cms_complete02_[a-z0-9_]+$' OR current_user<>'wave01' OR inet_server_port()<>55401
 OR (SELECT system_identifier::text FROM pg_control_system())<>b.physical_id
 OR shobj_description(b.database_oid,'pg_database')<>'SMART_ENGLISH_DISPOSABLE_E2E_V1'
 THEN RAISE EXCEPTION 'CMS_TARGET_IDENTITY_REQUIRED' USING ERRCODE='42501'; END IF;
END $$;
CREATE FUNCTION cms_v2.actor() RETURNS uuid LANGUAGE sql STABLE AS $$
 SELECT u.id FROM public.users u JOIN public.user_sessions s ON s.sess->>'userId'=u.id::text
 WHERE u.id::text=current_setting('cms_v2.actor',true) AND s.sid=current_setting('cms_v2.session',true) AND s.expire>clock_timestamp() AND u.status='ACTIVE'
$$;
CREATE FUNCTION cms_v2.permits(a uuid,s uuid,c text) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM public.users u JOIN cms_v2.identities i ON i.user_id=u.id JOIN cms_v2.grants g ON g.user_id=u.id
 WHERE u.id=a AND u.status='ACTIVE' AND g.scope_id=s AND g.capability=c AND g.effective_at<=clock_timestamp() AND g.expires_at>clock_timestamp() AND g.revoked_at IS NULL
 AND ((c='cms.draft' AND u.role='COUNSELOR') OR (c IN ('cms.review','cms.publish') AND u.role='ACADEMIC_MANAGER') OR (c IN ('cms.read','cms.audit') AND u.role IN ('COUNSELOR','ACADEMIC_MANAGER'))))
$$;
CREATE FUNCTION cms_v2.append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'CMS_APPEND_ONLY' USING ERRCODE='42501'; END $$;
CREATE FUNCTION cms_v2.write_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM cms_v2.assert_target();
 IF current_setting('cms_v2.command',true) IS DISTINCT FROM 'ACTIVE' OR cms_v2.actor() IS NULL THEN RAISE EXCEPTION 'CMS_COMMAND_REQUIRED' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
DO $$DECLARE t text;BEGIN
 FOREACH t IN ARRAY ARRAY['revisions','revision_events','revision_authors','publications','publication_events','audit_events','persons','identities','scopes','grants','migrations','target_binding'] LOOP
 EXECUTE format('CREATE TRIGGER cms_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON cms_v2.%I FOR EACH STATEMENT EXECUTE FUNCTION cms_v2.append_only()',t);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['contents','revisions','revision_events','revision_authors','publications','publication_events','audit_events'] LOOP
 EXECUTE format('CREATE TRIGGER cms_write_guard BEFORE INSERT OR UPDATE ON cms_v2.%I FOR EACH ROW EXECUTE FUNCTION cms_v2.write_guard()',t);
 END LOOP;
END $$;
CREATE TRIGGER cms_content_no_delete BEFORE DELETE OR TRUNCATE ON cms_v2.contents FOR EACH STATEMENT EXECUTE FUNCTION cms_v2.append_only();

CREATE FUNCTION cms_v2.command(action text, scope uuid, revision uuid, expected integer, payload jsonb) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE a uuid; person uuid; cap text; content cms_v2.contents; r cms_v2.revisions; old_r cms_v2.revisions;
 current_state text; next_state text; event_num integer; new_id uuid; new_pub uuid; approval uuid; reason text; title_text text; body_text text; source_text text;
BEGIN
 PERFORM cms_v2.assert_target(); PERFORM pg_advisory_xact_lock(842030);
 a:=cms_v2.actor();SELECT person_id INTO person FROM cms_v2.identities WHERE user_id=a;
 IF a IS NULL OR person IS NULL THEN RAISE EXCEPTION 'CMS_CURRENT_IDENTITY_REQUIRED' USING ERRCODE='42501'; END IF;
 cap:=CASE WHEN action IN ('create','edit','revise','submit') THEN 'cms.draft' WHEN action IN ('approve','reject') THEN 'cms.review' WHEN action IN ('publish','withdraw') THEN 'cms.publish' ELSE NULL END;
 IF cap IS NULL OR NOT cms_v2.permits(a,scope,cap) THEN RAISE EXCEPTION 'CMS_RESOURCE_PERMISSION_REQUIRED' USING ERRCODE='42501'; END IF;
 reason:=btrim(payload->>'reason');IF reason IS NULL OR length(reason) NOT BETWEEN 3 AND 500 THEN RAISE EXCEPTION 'CMS_REASON_REQUIRED' USING ERRCODE='23514';END IF;
 PERFORM set_config('cms_v2.command','ACTIVE',true);
 IF action='create' THEN
   new_id:=gen_random_uuid();
   INSERT INTO cms_v2.contents(scope_id,slug,created_by_user,created_by_person) VALUES(scope,coalesce(nullif(payload->>'slug',''),'cms-'||replace(new_id::text,'-','')),a,person) RETURNING * INTO content;
 ELSE
   SELECT * INTO r FROM cms_v2.revisions WHERE id=revision;
   IF r IS NULL THEN RAISE EXCEPTION 'CMS_CONTENT_NOT_FOUND' USING ERRCODE='P0002'; END IF;
   SELECT * INTO content FROM cms_v2.contents WHERE id=r.content_id AND scope_id=scope FOR UPDATE;
   IF content IS NULL THEN RAISE EXCEPTION 'CMS_CONTENT_NOT_FOUND' USING ERRCODE='P0002'; END IF;
   IF expected IS NULL OR content.lock_version<>expected THEN RAISE EXCEPTION 'CMS_STALE_REVISION' USING ERRCODE='40001'; END IF;
   SELECT state,number INTO current_state,event_num FROM cms_v2.revision_events WHERE revision_id=r.id ORDER BY number DESC LIMIT 1;
   IF current_state IS NULL THEN RAISE EXCEPTION 'CMS_STATE_UNAVAILABLE' USING ERRCODE='23514';END IF;
   IF action<>'withdraw' AND content.head_revision<>r.id THEN RAISE EXCEPTION 'CMS_STALE_REVISION' USING ERRCODE='40001';END IF;
 END IF;
 IF action IN ('create','edit','revise') THEN
   IF action='edit' AND current_state<>'DRAFT' THEN RAISE EXCEPTION 'CMS_NEW_REVISION_REQUIRED' USING ERRCODE='23514';END IF;
   IF action='revise' AND current_state NOT IN ('PUBLISHED','REJECTED','WITHDRAWN','APPROVED') THEN RAISE EXCEPTION 'CMS_STATE_TRANSITION_DENIED' USING ERRCODE='23514';END IF;
   title_text:=btrim(payload->>'title');body_text:=btrim(payload->>'body');source_text:=btrim(payload->>'sourceReference');
   new_id:=gen_random_uuid();
   INSERT INTO cms_v2.revisions(id,content_id,number,parent_id,title,body,source_reference,policy_ref,body_sha256,author_user,author_person)
   VALUES(new_id,content.id,coalesce(r.number,0)+1,r.id,title_text,body_text,source_text,'V2-DEC-070/BR-V2-112:ORIGINAL_TEAM_TEXT',encode(sha256(convert_to(title_text||E'\n'||body_text,'UTF8')),'hex'),a,person);
   INSERT INTO cms_v2.revision_authors(revision_id,person_id) SELECT new_id,person UNION SELECT new_id,person_id FROM cms_v2.revision_authors WHERE revision_id=r.id;
   INSERT INTO cms_v2.revision_events(revision_id,number,state,actor_user,actor_person,reason) VALUES(new_id,1,'DRAFT',a,person,reason);
   UPDATE cms_v2.contents SET head_revision=new_id,lock_version=lock_version+1 WHERE id=content.id;
 ELSE
   new_id:=r.id;
   IF action IN ('approve','reject','publish') AND EXISTS(SELECT 1 FROM cms_v2.revision_authors WHERE revision_id=r.id AND person_id=person) THEN RAISE EXCEPTION 'CMS_AUTHOR_CANNOT_REVIEW_OR_PUBLISH' USING ERRCODE='42501';END IF;
   next_state:=CASE action WHEN 'submit' THEN 'IN_REVIEW' WHEN 'approve' THEN 'APPROVED' WHEN 'reject' THEN 'REJECTED' WHEN 'publish' THEN 'PUBLISHED' WHEN 'withdraw' THEN 'WITHDRAWN' END;
   IF (action='submit' AND current_state<>'DRAFT') OR (action IN ('approve','reject') AND current_state<>'IN_REVIEW') OR (action='publish' AND current_state<>'APPROVED') OR (action='withdraw' AND current_state<>'PUBLISHED') THEN RAISE EXCEPTION 'CMS_STATE_TRANSITION_DENIED' USING ERRCODE='23514';END IF;
   IF action='publish' THEN
     SELECT id INTO approval FROM cms_v2.revision_events WHERE revision_id=r.id AND state='APPROVED' AND actor_person<>r.author_person ORDER BY number DESC LIMIT 1;
     IF approval IS NULL OR r.policy_ref<>'V2-DEC-070/BR-V2-112:ORIGINAL_TEAM_TEXT' THEN RAISE EXCEPTION 'CMS_APPROVAL_AND_CLEARANCE_REQUIRED' USING ERRCODE='42501';END IF;
     IF content.current_publication IS NOT NULL THEN
       SELECT q.* INTO old_r FROM cms_v2.publications p JOIN cms_v2.revisions q ON q.id=p.revision_id WHERE p.id=content.current_publication;
       INSERT INTO cms_v2.publication_events(publication_id,kind,actor_user,actor_person,reason) VALUES(content.current_publication,'SUPERSEDED',a,person,reason);
       INSERT INTO cms_v2.revision_events(revision_id,number,state,actor_user,actor_person,reason) SELECT old_r.id,max(number)+1,'WITHDRAWN',a,person,reason FROM cms_v2.revision_events WHERE revision_id=old_r.id;
     END IF;
     INSERT INTO cms_v2.publications(revision_id,approval_event_id,published_by_user,published_by_person) VALUES(r.id,approval,a,person) RETURNING id INTO new_pub;
     INSERT INTO cms_v2.publication_events(publication_id,kind,actor_user,actor_person,reason) VALUES(new_pub,'PUBLISHED',a,person,reason);
     UPDATE cms_v2.contents SET current_publication=new_pub WHERE id=content.id;
   ELSIF action='withdraw' THEN
     IF NOT EXISTS(SELECT 1 FROM cms_v2.publications WHERE id=content.current_publication AND revision_id=r.id) THEN RAISE EXCEPTION 'CMS_PUBLICATION_NOT_CURRENT' USING ERRCODE='23514';END IF;
     INSERT INTO cms_v2.publication_events(publication_id,kind,actor_user,actor_person,reason) VALUES(content.current_publication,'WITHDRAWN',a,person,reason);
     UPDATE cms_v2.contents SET current_publication=NULL WHERE id=content.id;
   END IF;
   INSERT INTO cms_v2.revision_events(revision_id,number,state,actor_user,actor_person,reason) VALUES(r.id,event_num+1,next_state,a,person,reason);
   UPDATE cms_v2.contents SET lock_version=lock_version+1 WHERE id=content.id;
 END IF;
 INSERT INTO cms_v2.audit_events(scope_id,content_id,revision_id,action,actor_user,actor_person,reason) VALUES(scope,content.id,new_id,upper(action),a,person,reason);
 RETURN new_id;
END $$;

CREATE VIEW cms_v2.current_revisions AS
 SELECT r.*, e.state,e.id AS state_event_id,e.actor_user AS state_actor_user,e.actor_person AS state_actor_person,e.at AS state_at,e.reason AS state_reason
 FROM cms_v2.revisions r JOIN LATERAL(SELECT * FROM cms_v2.revision_events x WHERE x.revision_id=r.id ORDER BY x.number DESC LIMIT 1)e ON true;
CREATE VIEW cms_v2.public_content AS
 SELECT c.slug,r.id AS revision_id,r.number AS revision,r.title,r.body,r.source_reference,r.policy_ref,r.body_sha256,p.at AS published_at
 FROM cms_v2.contents c JOIN cms_v2.publications p ON p.id=c.current_publication JOIN cms_v2.revisions r ON r.id=p.revision_id
 JOIN cms_v2.revision_events e ON e.id=p.approval_event_id AND e.revision_id=r.id AND e.state='APPROVED' AND e.actor_person<>r.author_person
 JOIN cms_v2.scopes s ON s.id=c.scope_id AND s.policy_ref=r.policy_ref
 JOIN LATERAL(SELECT kind FROM cms_v2.publication_events x WHERE x.publication_id=p.id ORDER BY x.at DESC,x.id DESC LIMIT 1) h ON h.kind='PUBLISHED'
 WHERE p.published_by_person<>r.author_person AND r.policy_ref='V2-DEC-070/BR-V2-112:ORIGINAL_TEAM_TEXT'
 AND NOT EXISTS(SELECT 1 FROM cms_v2.revision_authors a WHERE a.revision_id=r.id AND a.person_id IN (p.published_by_person,e.actor_person));
