-- Existing authenticated demo actors were renamed to their PO login emails.
-- Keep the original fixture rule everywhere else. No grants, topic approvals,
-- ownership, guest contact rules or expiry checks are changed.
CREATE OR REPLACE FUNCTION public.w05_role() RETURNS text LANGUAGE plpgsql STABLE AS $$
DECLARE actor_role text; actor_email text;
BEGIN
  SELECT u.role::text,u.email INTO actor_role,actor_email
  FROM public.users u
  WHERE u.id=public.w05_actor() AND u.status='ACTIVE'
    AND EXISTS(SELECT 1 FROM public.user_sessions s
      WHERE s.sid=current_setting('app.support_session',true)
      AND s.sess->>'userId'=u.id::text AND s.expire>clock_timestamp());
  IF actor_role IS NULL THEN RETURN NULL; END IF;
  IF actor_email NOT LIKE '%@example.invalid' THEN
    -- This assertion pins OID, physical cluster, marker, path, native port and DB actor.
    -- A normal email cannot turn any other database into an approved demo target.
    PERFORM br136_bank_check.assert_target();
  END IF;
  RETURN actor_role;
END $$;
