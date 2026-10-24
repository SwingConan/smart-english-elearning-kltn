CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'SUBMITTED', 'VERIFIED', 'REJECTED', 'CANCELLED');
CREATE TYPE "PaymentMethod" AS ENUM ('BANK_TRANSFER');

CREATE TABLE "tuition_payments" (
  "id" UUID NOT NULL,
  "enrollmentId" UUID NOT NULL,
  "method" "PaymentMethod" NOT NULL DEFAULT 'BANK_TRANSFER',
  "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
  "amountVnd" INTEGER NOT NULL,
  "referenceCode" TEXT NOT NULL,
  "payerReference" VARCHAR(128),
  "learnerNote" TEXT,
  "adminNote" TEXT,
  "submittedAt" TIMESTAMP(3),
  "verifiedAt" TIMESTAMP(3),
  "verifiedById" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "tuition_payments_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "tuition_payments_referenceCode_key" ON "tuition_payments"("referenceCode");
CREATE INDEX "tuition_payments_enrollmentId_status_idx" ON "tuition_payments"("enrollmentId", "status");
CREATE INDEX "tuition_payments_status_createdAt_idx" ON "tuition_payments"("status", "createdAt");
CREATE INDEX "tuition_payments_verifiedById_idx" ON "tuition_payments"("verifiedById");
ALTER TABLE "tuition_payments" ADD CONSTRAINT "tuition_payments_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "enrollments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tuition_payments" ADD CONSTRAINT "tuition_payments_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "tuition_payments_one_actionable_per_enrollment"
  ON "tuition_payments"("enrollmentId") WHERE "status" IN ('PENDING', 'SUBMITTED');
