-- M08-B adds a configurable deterministic study-recommendation policy and
-- immutable per-source recommendation evidence without removing legacy rows.
CREATE TABLE "study_recommendation_policies" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "weakThreshold" DECIMAL(5,2) NOT NULL,
    "strongThreshold" DECIMAL(5,2) NOT NULL,
    "minimumTaskQuestions" INTEGER NOT NULL,
    "maxRecommendations" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "study_recommendation_policies_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "study_recommendations"
ADD COLUMN "policyId" UUID,
ADD COLUMN "priority" INTEGER NOT NULL DEFAULT 100,
ADD COLUMN "ruleReason" JSONB NOT NULL DEFAULT '{}';

CREATE UNIQUE INDEX "study_recommendation_policies_code_key" ON "study_recommendation_policies"("code");
CREATE INDEX "study_recommendation_policies_isActive_idx" ON "study_recommendation_policies"("isActive");
CREATE INDEX "study_recommendations_policyId_idx" ON "study_recommendations"("policyId");
CREATE INDEX "study_recommendations_priority_idx" ON "study_recommendations"("priority");
CREATE UNIQUE INDEX "study_recommendations_enrollmentId_sourceAttemptId_priority_key"
ON "study_recommendations"("enrollmentId", "sourceAttemptId", "priority");

ALTER TABLE "study_recommendations"
ADD CONSTRAINT "study_recommendations_policyId_fkey"
FOREIGN KEY ("policyId") REFERENCES "study_recommendation_policies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
