-- A signed notification is not sufficient to confirm receipt. Pin the actual
-- LIVE transaction returned by SePay API v2, before an independent cashier decision.
CREATE TABLE sepay_v2.provider_checks(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 inbox_id uuid NOT NULL UNIQUE REFERENCES sepay_v2.inbox(id),
 bank_account_id uuid NOT NULL,transaction_uuid uuid NOT NULL,
 actor_id uuid NOT NULL REFERENCES public.users(id),
 response_hash char(64) NOT NULL,verified_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(bank_account_id,transaction_uuid)
);
CREATE TRIGGER sepay_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON sepay_v2.provider_checks FOR EACH STATEMENT EXECUTE FUNCTION sepay_v2.immutable();
