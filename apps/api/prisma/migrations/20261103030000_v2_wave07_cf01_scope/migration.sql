-- CF01 DEV candidate: no changes to migrations1-30. See W07_CF01_MIGRATION31_PROPOSAL.md.
BEGIN;
CREATE OR REPLACE FUNCTION w07_enrollment_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE app w07_applications; gate text;
BEGIN
 IF TG_OP='TRUNCATE' THEN IF EXISTS(SELECT 1 FROM w07_class_controls) THEN RAISE EXCEPTION 'W07_ENROLLMENT_HISTORY_REQUIRED' USING ERRCODE='23514';END IF;RETURN NULL;END IF;
 -- Serialize rollout/control creation with enrollment writes before checking scope.
 PERFORM pg_advisory_xact_lock(842030);
 IF NOT EXISTS(SELECT 1 FROM w07_class_controls WHERE "classId"=CASE WHEN TG_OP='DELETE' THEN OLD."classOfferingId" ELSE NEW."classOfferingId" END)
 AND NOT (TG_OP='UPDATE' AND EXISTS(SELECT 1 FROM w07_class_controls WHERE "classId"=OLD."classOfferingId")) THEN
  IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;
 END IF;
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'W07_ENROLLMENT_IDENTITY_IMMUTABLE' USING ERRCODE='23514';END IF;
 IF TG_OP='UPDATE' AND (NEW.id<>OLD.id OR NEW."learnerId"<>OLD."learnerId" OR NEW."classOfferingId"<>OLD."classOfferingId" OR NEW."enrolledAt" IS DISTINCT FROM OLD."enrolledAt") THEN RAISE EXCEPTION 'W07_ENROLLMENT_IDENTITY_IMMUTABLE' USING ERRCODE='23514';END IF;
 IF TG_OP='UPDATE' AND NEW.status=OLD.status THEN RETURN NEW;END IF;
 SELECT * INTO app FROM w07_applications WHERE id=nullif(current_setting('app.w07_application',true),'')::uuid;
 IF NEW.status<>'ACTIVE' OR app.id IS NULL OR w07_actor() IS DISTINCT FROM app."learnerId" OR (SELECT role::text FROM users WHERE id=w07_actor()) IS DISTINCT FROM 'STUDENT' OR app."learnerId"<>NEW."learnerId" OR app."classId"<>NEW."classOfferingId" OR nullif(current_setting('app.w07_key',true),'') IS NULL THEN RAISE EXCEPTION 'W07_USE_GUARDED_ENTITLEMENT' USING ERRCODE='42501';END IF;
 gate:=w07_activation(app.id);IF gate<>'READY' THEN RAISE EXCEPTION 'W07_ENTITLEMENT_NOT_READY' USING ERRCODE='23514';END IF;
 RETURN NEW;
END $$;
COMMIT;
