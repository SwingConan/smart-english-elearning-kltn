-- Preserve 001 and its applied checksum; strengthen the independent LIVE source fence.
CREATE OR REPLACE FUNCTION sepay_v2.validate_live_source() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE fee public.w07_obligations;app public.w07_applications;
BEGIN
 PERFORM sepay_v2.assert_target();
 SELECT * INTO fee FROM public.w07_obligations WHERE id=NEW.obligation_id;
 SELECT * INTO app FROM public.w07_applications WHERE id=fee."applicationId";
 IF app.id IS NULL OR app.state<>'APPROVED' OR app."consentVersion"<>NEW.consent_version OR
 app."learnerId" IN (NEW.academic_actor,NEW.finance_actor) OR
 NOT public.w07_price(app."classId") OR NOT public.w07_open(app."classId") OR
 NOT EXISTS(SELECT 1 FROM public.w07_academic_decisions d WHERE d.id=fee."decisionId" AND d.kind='APPROVE' AND d."reviewerId"=NEW.academic_actor AND d.number=app."lockVersion") OR
 NOT EXISTS(SELECT 1 FROM public.users WHERE id=NEW.academic_actor AND role='ACADEMIC_MANAGER' AND status='ACTIVE') OR
 NOT EXISTS(SELECT 1 FROM public.users WHERE id=NEW.finance_actor AND role='CASHIER' AND status='ACTIVE') OR
 NOT EXISTS(SELECT 1 FROM public.permission_grants WHERE "userId"=NEW.finance_actor AND capability='finance.verify' AND "scopeType"='CLASS' AND "scopeId"=app."classId"::text AND "approvedBy" IS NOT NULL AND "approvedAt"<=timezone('UTC',clock_timestamp()) AND "revokedAt" IS NULL AND "effectiveAt"<=timezone('UTC',clock_timestamp()) AND "expiresAt">timezone('UTC',clock_timestamp())) OR
 NOT EXISTS(SELECT 1 FROM public.permission_grants WHERE "userId"=NEW.academic_actor AND capability='academic.admission.approve' AND "scopeType"='CLASS' AND "scopeId"=app."classId"::text AND "approvedBy" IS NOT NULL AND "approvedAt"<=timezone('UTC',clock_timestamp()) AND "revokedAt" IS NULL AND "effectiveAt"<=timezone('UTC',clock_timestamp()) AND "expiresAt">timezone('UTC',clock_timestamp()))
 THEN RAISE EXCEPTION 'SEPAY_LIVE_SOURCE_APPROVAL_REQUIRED' USING ERRCODE='42501';END IF;
 RETURN NEW;
END $$;
