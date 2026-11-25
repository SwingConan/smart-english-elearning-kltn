-- Forward-only metadata default fix. No UPDATE, timezone conversion or historical rewrite.
-- Timestamp-without-time-zone values in these three V2 tables represent UTC instants.
ALTER TABLE "permission_grants" ALTER COLUMN "createdAt"
  SET DEFAULT timezone('UTC'::text, CURRENT_TIMESTAMP);
ALTER TABLE "account_role_decisions" ALTER COLUMN "createdAt"
  SET DEFAULT timezone('UTC'::text, CURRENT_TIMESTAMP);
ALTER TABLE "domain_audit_events" ALTER COLUMN "createdAt"
  SET DEFAULT timezone('UTC'::text, CURRENT_TIMESTAMP);
