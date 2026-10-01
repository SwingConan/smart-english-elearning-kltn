ALTER TYPE "EvaluationMetric" ADD VALUE 'LR_NORMALIZED';

ALTER TABLE "evaluation_bands"
  DROP CONSTRAINT "evaluation_bands_skill_check";

ALTER TABLE "evaluation_bands"
  ADD CONSTRAINT "evaluation_bands_skill_check" CHECK (
    ("metric"::text IN ('LR_TOTAL', 'LR_NORMALIZED') AND "skill" IS NULL)
    OR ("metric"::text NOT IN ('LR_TOTAL', 'LR_NORMALIZED') AND "skill" IS NOT NULL)
  );
