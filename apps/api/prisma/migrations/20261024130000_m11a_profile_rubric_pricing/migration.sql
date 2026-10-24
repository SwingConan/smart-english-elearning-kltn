ALTER TABLE "users" ADD COLUMN "phoneNumber" VARCHAR(32);

ALTER TABLE "rubrics" ADD COLUMN "createdById" UUID;
CREATE INDEX "rubrics_createdById_idx" ON "rubrics"("createdById");
ALTER TABLE "rubrics" ADD CONSTRAINT "rubrics_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "enrollments"
  ADD COLUMN "pricingTypeSnapshot" "PricingType",
  ADD COLUMN "tuitionFeeVndSnapshot" INTEGER;

UPDATE "enrollments" e
SET "pricingTypeSnapshot" = c."pricingType",
    "tuitionFeeVndSnapshot" = CASE
      WHEN c."pricingType" = 'PAID'::"PricingType" THEN c."tuitionFeeVnd"
      ELSE NULL
    END
FROM "class_offerings" c
WHERE c."id" = e."classOfferingId";

ALTER TABLE "enrollments" ALTER COLUMN "pricingTypeSnapshot" SET NOT NULL;
ALTER TABLE "enrollments" ALTER COLUMN "pricingTypeSnapshot" SET DEFAULT 'FREE';
