-- Approved exact QA offer admission. Original TEST paths and all existing history remain.
SELECT runtime_v2.assert_target(),sepay_v2.assert_target();
CREATE TABLE academic_offer_v2.admission_offers(
 class_id uuid PRIMARY KEY REFERENCES public.class_offerings(id),
 version_id uuid NOT NULL REFERENCES public.course_versions(id),
 amount_vnd integer NOT NULL CHECK(amount_vnd=400000),
 consent_version text NOT NULL CHECK(consent_version='W07_DEC071_ADMISSION_V1'),
 authority text NOT NULL CHECK(authority='V2-DEC-071 / BR-V2-113'),
 actor_id uuid NOT NULL REFERENCES public.users(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TRIGGER admission_offer_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON academic_offer_v2.admission_offers FOR EACH STATEMENT EXECUTE FUNCTION runtime_v2.immutable();
CREATE FUNCTION academic_offer_v2.validate_admission_offer() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM runtime_v2.assert_target();
 IF NEW.actor_id IS DISTINCT FROM public.w07_actor() OR public.w07_grant('academic.admission.approve',NEW.class_id) IS NULL OR
 NEW.version_id<>'d326340a-f8a2-4daf-a732-e93afe0a3a4c'::uuid OR
 NOT public.w07_open(NEW.class_id) OR NOT public.w07_price(NEW.class_id) OR
 NOT EXISTS(SELECT 1 FROM public.class_offerings c JOIN public.course_versions v ON v.id=c."versionId"
 WHERE c.id=NEW.class_id AND v.id=NEW.version_id AND v.state='PUBLISHED' AND v."standardTuitionFeeVnd"=NEW.amount_vnd AND c."approvedTuitionFeeVnd"=NEW.amount_vnd AND v."standardPricingType"='PAID'
 AND c."createdAt">v."approvedAt" AT TIME ZONE 'UTC')
 THEN RAISE EXCEPTION 'DEC071_EXACT_APPROVED_NEW_OFFER_REQUIRED' USING ERRCODE='42501';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER admission_offer_validate BEFORE INSERT ON academic_offer_v2.admission_offers FOR EACH ROW EXECUTE FUNCTION academic_offer_v2.validate_admission_offer();
CREATE FUNCTION academic_offer_v2.allowed_admission(class_id uuid,consent text) RETURNS boolean LANGUAGE plpgsql STABLE AS $$
BEGIN
 PERFORM runtime_v2.assert_target();
 RETURN consent='W07_DEC071_ADMISSION_V1' AND EXISTS(
 SELECT 1 FROM academic_offer_v2.admission_offers a JOIN public.class_offerings c ON c.id=a.class_id
 WHERE a.class_id=allowed_admission.class_id AND a.consent_version=consent AND c."versionId"=a.version_id
 AND c."approvedTuitionFeeVnd"=a.amount_vnd AND public.w07_open(c.id) AND public.w07_price(c.id));
END $$;
-- Retain every legacy scope/state/money invariant. The additional consent is valid
-- only for the exact PO-approved version and an explicitly authorized NEW class.
DO $$ DECLARE body text;needle text; BEGIN
 SELECT pg_get_functiondef('public.w07_guard()'::regprocedure) INTO body;
 needle:='NEW."consentVersion"<>''W07_SYNTHETIC_ADMISSION_V1''';
 IF position(needle IN body)=0 OR position('allowed_admission' IN body)>0 THEN RAISE EXCEPTION 'ORIGINAL_W07_GUARD_REQUIRED';END IF;
 body:=replace(body,needle,'(NEW."consentVersion"<>''W07_SYNTHETIC_ADMISSION_V1'' AND NOT academic_offer_v2.allowed_admission(offer.id,NEW."consentVersion"))');
 body:=replace(body,' IF TG_TABLE_NAME=''w07_academic_decisions'' THEN',
 ' IF app."consentVersion"=''W07_DEC071_ADMISSION_V1'' AND TG_TABLE_NAME NOT IN (''w07_academic_decisions'',''w07_obligations'',''w07_notifications'') THEN RAISE EXCEPTION ''DEC071_NO_TEST_FINANCE_OR_ENTITLEMENT'' USING ERRCODE=''42501'';END IF;
 IF TG_TABLE_NAME=''w07_academic_decisions'' THEN');
 EXECUTE body;
 SELECT pg_get_functiondef('public.w07_after()'::regprocedure) INTO body;
 IF position('''W07_SYNTHETIC'',NEW.id::text,''TEST_ONLY''' IN body)=0 THEN RAISE EXCEPTION 'ORIGINAL_W07_AUDIT_REQUIRED';END IF;
 body:=replace(body,' INSERT INTO domain_audit_events',
 ' IF TG_TABLE_NAME=''w07_applications'' THEN SELECT * INTO app FROM w07_applications WHERE id=NEW.id;
 ELSIF TG_TABLE_NAME=''w07_obligations'' THEN SELECT * INTO app FROM w07_applications WHERE id=NEW."applicationId";END IF;
 INSERT INTO domain_audit_events');
 body:=replace(body,'''W07_SYNTHETIC'',NEW.id::text,''TEST_ONLY'',''Typed immutable DEV history; no real funds or payout''',
 'CASE WHEN app."consentVersion"=''W07_DEC071_ADMISSION_V1'' THEN ''W07_DEC071_QA'' ELSE ''W07_SYNTHETIC'' END,NEW.id::text,CASE WHEN app."consentVersion"=''W07_DEC071_ADMISSION_V1'' THEN ''PO_APPROVED_QA'' ELSE ''TEST_ONLY'' END,CASE WHEN app."consentVersion"=''W07_DEC071_ADMISSION_V1'' THEN ''V2-DEC-071 / BR-V2-113; approved 400000 VND obligation, no bank payment or entitlement'' ELSE ''Typed immutable DEV history; no real funds or payout'' END');
 EXECUTE body;
END $$;
