-- Additive only: existing enum values, users, grants, sessions and S10 rows retained.
ALTER TYPE "UserRole" ADD VALUE 'COUNSELOR';
ALTER TYPE "UserRole" ADD VALUE 'ACADEMIC_MANAGER';
ALTER TYPE "UserRole" ADD VALUE 'CASHIER';
ALTER TYPE "UserRole" ADD VALUE 'TEACHING_INSPECTOR';
ALTER TYPE "UserRole" ADD VALUE 'SYSTEM_ADMIN';

CREATE TABLE "permission_grants" (
 "id" UUID NOT NULL, "userId" UUID NOT NULL, "capability" TEXT NOT NULL,
 "scopeType" TEXT NOT NULL, "scopeId" TEXT, "requestedBy" UUID NOT NULL,
 "approvedBy" UUID, "approvedAt" TIMESTAMP(3), "effectiveAt" TIMESTAMP(3) NOT NULL,
 "expiresAt" TIMESTAMP(3) NOT NULL, "revokedAt" TIMESTAMP(3), "revokedBy" UUID,
 "reason" VARCHAR(500) NOT NULL, "revokeReason" VARCHAR(500),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "permission_grants_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "grant_scope" CHECK (("scopeType"='GLOBAL' AND "scopeId" IS NULL) OR ("scopeType"='CLASS' AND "scopeId" IS NOT NULL AND "capability"='class.read')),
 CONSTRAINT "grant_interval" CHECK ("expiresAt">"effectiveAt"),
 CONSTRAINT "grant_independent" CHECK ("requestedBy"<>"userId" AND ("approvedBy" IS NULL OR ("approvedBy"<>"userId" AND "approvedBy"<>"requestedBy"))),
 CONSTRAINT "grant_approval_pair" CHECK (("approvedBy" IS NULL)=("approvedAt" IS NULL)),
 CONSTRAINT "grant_revoke_pair" CHECK (("revokedBy" IS NULL)=("revokedAt" IS NULL))
);
CREATE INDEX "permission_grants_userId_capability_expiresAt_idx" ON "permission_grants"("userId","capability","expiresAt");
CREATE TABLE "account_role_decisions" (
 "id" UUID NOT NULL, "userId" UUID NOT NULL, "previousRole" "UserRole" NOT NULL,
 "nextRole" "UserRole" NOT NULL, "requestedBy" UUID NOT NULL, "approvedBy" UUID,
 "effectiveAt" TIMESTAMP(3), "reason" VARCHAR(500) NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "account_role_decisions_pkey" PRIMARY KEY("id"),
 CONSTRAINT "role_independent" CHECK ("requestedBy"<>"userId" AND ("approvedBy" IS NULL OR ("approvedBy"<>"userId" AND "approvedBy"<>"requestedBy"))),
 CONSTRAINT "role_approval_pair" CHECK (("approvedBy" IS NULL)=("effectiveAt" IS NULL))
);
CREATE INDEX "account_role_decisions_userId_createdAt_idx" ON "account_role_decisions"("userId","createdAt");
CREATE TABLE "domain_audit_events" (
 "id" UUID NOT NULL, "actorId" UUID NOT NULL, "action" TEXT NOT NULL,
 "objectType" TEXT NOT NULL, "objectId" TEXT NOT NULL, "decision" TEXT NOT NULL,
 "reason" VARCHAR(500) NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "domain_audit_events_pkey" PRIMARY KEY("id")
);
CREATE INDEX "domain_audit_events_objectType_objectId_createdAt_idx" ON "domain_audit_events"("objectType","objectId","createdAt");
CREATE INDEX "domain_audit_events_actorId_createdAt_idx" ON "domain_audit_events"("actorId","createdAt");
-- Application DB role must not own/disable this trigger in production.
CREATE FUNCTION v2_audit_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'V2_AUDIT_IMMUTABLE'; END; $$;
CREATE TRIGGER v2_audit_immutable BEFORE UPDATE OR DELETE OR TRUNCATE
 ON "domain_audit_events" FOR EACH STATEMENT EXECUTE FUNCTION v2_audit_immutable();
