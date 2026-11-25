-- Additive function correction: disambiguate reason in publication replacement.
-- Existing revision/audit rows are never updated.
CREATE OR REPLACE FUNCTION cms_v2.command(action text, scope uuid, revision uuid, expected integer, payload jsonb) RETURNS uuid LANGUAGE plpgsql AS $$
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
       INSERT INTO cms_v2.revision_events(revision_id,number,state,actor_user,actor_person,reason) SELECT old_r.id,max(e.number)+1,'WITHDRAWN',a,person,btrim(payload->>'reason') FROM cms_v2.revision_events e WHERE e.revision_id=old_r.id;
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
