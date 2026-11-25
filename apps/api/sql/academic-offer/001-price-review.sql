-- Independent, additive QA migration. Never marks Prisma migrations 33/34 applied.
SELECT runtime_v2.assert_target();
DO $$ BEGIN
 IF (SELECT oid FROM pg_database WHERE datname=current_database())<>953322 THEN
  RAISE EXCEPTION 'APPROVED_OFFER_QA_IDENTITY_REQUIRED';
 END IF;
END $$;
CREATE SCHEMA academic_offer_v2;
CREATE TABLE academic_offer_v2.migrations(
 version text PRIMARY KEY, checksum text NOT NULL CHECK(length(checksum)=64),
 authority text NOT NULL, applied_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE academic_offer_v2.version_events(
 id uuid PRIMARY KEY, version_id uuid NOT NULL REFERENCES public.course_versions(id),
 actor_id uuid NOT NULL REFERENCES public.users(id), kind text NOT NULL
 CHECK(kind IN ('DRAFT_SAVED','SUBMITTED','PRICE_CONFIRMED','PUBLISHED','RETURNED')),
 snapshot jsonb NOT NULL, reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 10 AND 500),
 po_reference text, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(kind<>'PRICE_CONFIRMED' OR length(btrim(po_reference)) BETWEEN 10 AND 300)
);
CREATE INDEX version_events_history ON academic_offer_v2.version_events(version_id,created_at,id);
CREATE UNIQUE INDEX version_price_once ON academic_offer_v2.version_events(version_id)
 WHERE kind='PRICE_CONFIRMED';
CREATE FUNCTION academic_offer_v2.validate_event() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v public.course_versions; principal uuid;
BEGIN
 PERFORM runtime_v2.assert_target();
 principal:=nullif(current_setting('academic_offer_v2.actor',true),'')::uuid;
 SELECT * INTO v FROM public.course_versions WHERE id=NEW.version_id;
 IF principal IS NULL OR principal<>NEW.actor_id OR NOT EXISTS(
  SELECT 1 FROM public.users u JOIN public.user_sessions s ON s.sess->>'userId'=u.id::text
  WHERE u.id=principal AND u.role='ACADEMIC_MANAGER' AND u.status='ACTIVE'
  AND s.sid=current_setting('academic_offer_v2.session',true) AND s.expire>clock_timestamp()
 ) OR NEW.snapshot IS DISTINCT FROM to_jsonb(v)
 THEN RAISE EXCEPTION 'ACADEMIC_EVENT_PRINCIPAL_SNAPSHOT_REQUIRED' USING ERRCODE='42501';END IF;
 IF NEW.kind IN ('PRICE_CONFIRMED','PUBLISHED') THEN
  IF principal=v."proposedBy" OR NOT public.v2_academic_approver(principal,'academic.program.approve','COURSE',v."courseId"::text)
  THEN RAISE EXCEPTION 'ACADEMIC_INDEPENDENT_SCOPED_REVIEW_REQUIRED' USING ERRCODE='42501';END IF;
 ELSE
  IF principal<>v."proposedBy" THEN RAISE EXCEPTION 'ACADEMIC_VERSION_AUTHOR_REQUIRED' USING ERRCODE='42501';END IF;
 END IF;
 IF NEW.kind='PRICE_CONFIRMED' AND (v.state<>'PENDING_APPROVAL' OR v."standardPricingType" IS NULL OR v."standardTuitionFeeVnd" IS NULL)
 THEN RAISE EXCEPTION 'EXPLICIT_PO_PRICE_REQUIRED' USING ERRCODE='23514';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER version_event_validate BEFORE INSERT ON academic_offer_v2.version_events
 FOR EACH ROW EXECUTE FUNCTION academic_offer_v2.validate_event();
CREATE TRIGGER version_event_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON academic_offer_v2.version_events
 FOR EACH STATEMENT EXECUTE FUNCTION runtime_v2.immutable();
CREATE TRIGGER academic_migration_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON academic_offer_v2.migrations
 FOR EACH STATEMENT EXECUTE FUNCTION runtime_v2.immutable();
CREATE FUNCTION academic_offer_v2.price_publication_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.state='PUBLISHED' AND OLD.state<>'PUBLISHED' AND NOT EXISTS(
  SELECT 1 FROM academic_offer_v2.version_events e WHERE e.version_id=OLD.id AND e.kind='PRICE_CONFIRMED'
  AND e.actor_id=NEW."approvedBy" AND e.snapshot=to_jsonb(OLD)
 ) THEN RAISE EXCEPTION 'RECORDED_PO_PRICE_CONFIRMATION_REQUIRED' USING ERRCODE='23514';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER approved_offer_po_price BEFORE UPDATE ON public.course_versions
 FOR EACH ROW EXECUTE FUNCTION academic_offer_v2.price_publication_guard();
