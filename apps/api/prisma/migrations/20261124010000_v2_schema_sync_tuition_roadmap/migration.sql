-- Additive schema synchronization for class_roadmap_items, support_ticket_attachments,
-- tuition/SePay models, and course/class/enrollment metadata columns.
-- Preserves all custom PL/pgSQL triggers, raw w09_* tables, and wave constraints.

ALTER TABLE "class_offerings"
  ADD COLUMN IF NOT EXISTS "defaultRoomId" UUID,
  ADD COLUMN IF NOT EXISTS "durationWeeks" INTEGER,
  ADD COLUMN IF NOT EXISTS "periodsPerSession" INTEGER;

ALTER TABLE "class_schedule_slots"
  ADD COLUMN IF NOT EXISTS "roomId" UUID;

ALTER TABLE "courses"
  ADD COLUMN IF NOT EXISTS "defaultDurationWeeks" INTEGER,
  ADD COLUMN IF NOT EXISTS "defaultPeriodsPerSession" INTEGER,
  ADD COLUMN IF NOT EXISTS "defaultPricingType" "PricingType",
  ADD COLUMN IF NOT EXISTS "defaultSessionsCount" INTEGER,
  ADD COLUMN IF NOT EXISTS "defaultTuitionFeeVnd" INTEGER;

ALTER TABLE "enrollments"
  ADD COLUMN IF NOT EXISTS "entrySource" TEXT,
  ADD COLUMN IF NOT EXISTS "isTestHarness" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "placementAttemptId" UUID,
  ADD COLUMN IF NOT EXISTS "releaseReason" TEXT,
  ADD COLUMN IF NOT EXISTS "reservedUntil" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "seatReleasedAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "class_roadmap_items" (
    "id" UUID NOT NULL,
    "classOfferingId" UUID NOT NULL,
    "weekNumber" INTEGER NOT NULL,
    "sessionNumber" INTEGER NOT NULL,
    "sessionDate" DATE NOT NULL,
    "startTime" VARCHAR(5) NOT NULL,
    "endTime" VARCHAR(5) NOT NULL,
    "periods" INTEGER NOT NULL DEFAULT 3,
    "modality" "ClassModality" NOT NULL DEFAULT 'OFFLINE',
    "roomId" UUID,
    "locationText" VARCHAR(300),
    "meetingUrl" VARCHAR(500),
    "topicTitle" VARCHAR(300) NOT NULL,
    "contentSummary" VARCHAR(1000) NOT NULL DEFAULT '',
    "sourceModuleId" UUID,
    "teachingSessionId" UUID,
    "orderIndex" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "class_roadmap_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "support_ticket_attachments" (
    "id" UUID NOT NULL,
    "ticketId" UUID NOT NULL,
    "uploaderId" UUID NOT NULL,
    "originalName" VARCHAR(255) NOT NULL,
    "storedKey" VARCHAR(128) NOT NULL,
    "mimeType" VARCHAR(128) NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "sha256" VARCHAR(64) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "support_ticket_attachments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "tuition_receivables" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "enrollmentId" UUID NOT NULL,
    "learnerId" UUID NOT NULL,
    "classOfferingId" UUID NOT NULL,
    "receivableCode" TEXT NOT NULL,
    "amountVnd" INTEGER NOT NULL,
    "paidAmountVnd" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'VND',
    "status" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "isTestHarness" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tuition_receivables_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "tuition_payment_orders" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "receivableId" UUID NOT NULL,
    "enrollmentId" UUID NOT NULL,
    "learnerId" UUID NOT NULL,
    "classOfferingId" UUID NOT NULL,
    "paymentCode" TEXT NOT NULL,
    "expectedAmountVnd" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'VND',
    "bankCode" TEXT,
    "accountNumber" TEXT,
    "accountName" TEXT,
    "qrUrl" TEXT,
    "status" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "releasedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "isTestHarness" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tuition_payment_orders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "sepay_tuition_transactions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "provider" TEXT NOT NULL DEFAULT 'SEPAY',
    "bankAccountId" TEXT NOT NULL,
    "providerTransactionId" TEXT NOT NULL,
    "orderId" UUID,
    "receivableId" UUID,
    "paymentCodeExtracted" TEXT,
    "amountVnd" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'VND',
    "transferType" TEXT NOT NULL DEFAULT 'in',
    "content" TEXT NOT NULL,
    "referenceCode" TEXT,
    "gateway" TEXT,
    "transactionDate" TIMESTAMP(3) NOT NULL,
    "classification" TEXT NOT NULL,
    "reconciliationState" TEXT NOT NULL,
    "verificationSource" TEXT NOT NULL,
    "verifiedBankApi" BOOLEAN NOT NULL DEFAULT false,
    "isTestHarness" BOOLEAN NOT NULL DEFAULT false,
    "rawHash" TEXT NOT NULL,
    "semanticHash" TEXT NOT NULL,
    "rawPayload" JSONB NOT NULL,
    "resolutionNote" TEXT,
    "resolvedById" UUID,
    "resolvedGrantId" UUID,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sepay_tuition_transactions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "tuition_receipts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "receiptNumber" TEXT NOT NULL,
    "receivableId" UUID NOT NULL,
    "orderId" UUID,
    "transactionId" UUID NOT NULL,
    "learnerId" UUID NOT NULL,
    "classOfferingId" UUID NOT NULL,
    "amountVnd" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'VND',
    "issuedById" UUID,
    "verificationMethod" TEXT NOT NULL,
    "isTestHarness" BOOLEAN NOT NULL DEFAULT false,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tuition_receipts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "tuition_reconciliation_actions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "transactionId" UUID,
    "receivableId" UUID,
    "orderId" UUID,
    "actorId" UUID,
    "grantId" UUID,
    "action" TEXT NOT NULL,
    "previousState" TEXT,
    "nextState" TEXT NOT NULL,
    "note" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tuition_reconciliation_actions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "class_roadmap_items_classOfferingId_orderIndex_idx" ON "class_roadmap_items"("classOfferingId", "orderIndex");
CREATE UNIQUE INDEX IF NOT EXISTS "support_ticket_attachments_storedKey_key" ON "support_ticket_attachments"("storedKey");
CREATE INDEX IF NOT EXISTS "support_ticket_attachments_ticketId_createdAt_idx" ON "support_ticket_attachments"("ticketId", "createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "tuition_receivables_enrollmentId_key" ON "tuition_receivables"("enrollmentId");
CREATE UNIQUE INDEX IF NOT EXISTS "tuition_receivables_receivableCode_key" ON "tuition_receivables"("receivableCode");
CREATE INDEX IF NOT EXISTS "tuition_receivables_learnerId_status_idx" ON "tuition_receivables"("learnerId", "status");
CREATE INDEX IF NOT EXISTS "tuition_receivables_classOfferingId_status_idx" ON "tuition_receivables"("classOfferingId", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "tuition_payment_orders_paymentCode_key" ON "tuition_payment_orders"("paymentCode");
CREATE INDEX IF NOT EXISTS "tuition_payment_orders_receivableId_status_idx" ON "tuition_payment_orders"("receivableId", "status");
CREATE INDEX IF NOT EXISTS "tuition_payment_orders_enrollmentId_status_idx" ON "tuition_payment_orders"("enrollmentId", "status");
CREATE INDEX IF NOT EXISTS "tuition_payment_orders_status_expiresAt_idx" ON "tuition_payment_orders"("status", "expiresAt");
CREATE INDEX IF NOT EXISTS "sepay_tuition_transactions_reconciliationState_createdAt_idx" ON "sepay_tuition_transactions"("reconciliationState", "createdAt");
CREATE INDEX IF NOT EXISTS "sepay_tuition_transactions_orderId_idx" ON "sepay_tuition_transactions"("orderId");
CREATE UNIQUE INDEX IF NOT EXISTS "sepay_tuition_transactions_bankAccountId_providerTransactio_key" ON "sepay_tuition_transactions"("bankAccountId", "providerTransactionId");
CREATE UNIQUE INDEX IF NOT EXISTS "tuition_receipts_receiptNumber_key" ON "tuition_receipts"("receiptNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "tuition_receipts_receivableId_key" ON "tuition_receipts"("receivableId");
CREATE UNIQUE INDEX IF NOT EXISTS "tuition_receipts_transactionId_key" ON "tuition_receipts"("transactionId");
CREATE INDEX IF NOT EXISTS "tuition_receipts_learnerId_issuedAt_idx" ON "tuition_receipts"("learnerId", "issuedAt");
CREATE INDEX IF NOT EXISTS "tuition_reconciliation_actions_transactionId_createdAt_idx" ON "tuition_reconciliation_actions"("transactionId", "createdAt");
CREATE INDEX IF NOT EXISTS "enrollments_classOfferingId_status_reservedUntil_idx" ON "enrollments"("classOfferingId", "status", "reservedUntil");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'class_offerings_defaultRoomId_fkey') THEN
    ALTER TABLE "class_offerings" ADD CONSTRAINT "class_offerings_defaultRoomId_fkey" FOREIGN KEY ("defaultRoomId") REFERENCES "rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'class_schedule_slots_roomId_fkey') THEN
    ALTER TABLE "class_schedule_slots" ADD CONSTRAINT "class_schedule_slots_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'class_roadmap_items_classOfferingId_fkey') THEN
    ALTER TABLE "class_roadmap_items" ADD CONSTRAINT "class_roadmap_items_classOfferingId_fkey" FOREIGN KEY ("classOfferingId") REFERENCES "class_offerings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'class_roadmap_items_roomId_fkey') THEN
    ALTER TABLE "class_roadmap_items" ADD CONSTRAINT "class_roadmap_items_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'support_ticket_attachments_ticketId_fkey') THEN
    ALTER TABLE "support_ticket_attachments" ADD CONSTRAINT "support_ticket_attachments_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "support_tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tuition_receivables_enrollmentId_fkey') THEN
    ALTER TABLE "tuition_receivables" ADD CONSTRAINT "tuition_receivables_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "enrollments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tuition_receivables_learnerId_fkey') THEN
    ALTER TABLE "tuition_receivables" ADD CONSTRAINT "tuition_receivables_learnerId_fkey" FOREIGN KEY ("learnerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tuition_receivables_classOfferingId_fkey') THEN
    ALTER TABLE "tuition_receivables" ADD CONSTRAINT "tuition_receivables_classOfferingId_fkey" FOREIGN KEY ("classOfferingId") REFERENCES "class_offerings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tuition_payment_orders_receivableId_fkey') THEN
    ALTER TABLE "tuition_payment_orders" ADD CONSTRAINT "tuition_payment_orders_receivableId_fkey" FOREIGN KEY ("receivableId") REFERENCES "tuition_receivables"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tuition_payment_orders_enrollmentId_fkey') THEN
    ALTER TABLE "tuition_payment_orders" ADD CONSTRAINT "tuition_payment_orders_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "enrollments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tuition_payment_orders_learnerId_fkey') THEN
    ALTER TABLE "tuition_payment_orders" ADD CONSTRAINT "tuition_payment_orders_learnerId_fkey" FOREIGN KEY ("learnerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tuition_payment_orders_classOfferingId_fkey') THEN
    ALTER TABLE "tuition_payment_orders" ADD CONSTRAINT "tuition_payment_orders_classOfferingId_fkey" FOREIGN KEY ("classOfferingId") REFERENCES "class_offerings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sepay_tuition_transactions_orderId_fkey') THEN
    ALTER TABLE "sepay_tuition_transactions" ADD CONSTRAINT "sepay_tuition_transactions_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "tuition_payment_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sepay_tuition_transactions_receivableId_fkey') THEN
    ALTER TABLE "sepay_tuition_transactions" ADD CONSTRAINT "sepay_tuition_transactions_receivableId_fkey" FOREIGN KEY ("receivableId") REFERENCES "tuition_receivables"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sepay_tuition_transactions_resolvedById_fkey') THEN
    ALTER TABLE "sepay_tuition_transactions" ADD CONSTRAINT "sepay_tuition_transactions_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tuition_receipts_receivableId_fkey') THEN
    ALTER TABLE "tuition_receipts" ADD CONSTRAINT "tuition_receipts_receivableId_fkey" FOREIGN KEY ("receivableId") REFERENCES "tuition_receivables"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tuition_receipts_orderId_fkey') THEN
    ALTER TABLE "tuition_receipts" ADD CONSTRAINT "tuition_receipts_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "tuition_payment_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tuition_receipts_transactionId_fkey') THEN
    ALTER TABLE "tuition_receipts" ADD CONSTRAINT "tuition_receipts_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "sepay_tuition_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tuition_receipts_learnerId_fkey') THEN
    ALTER TABLE "tuition_receipts" ADD CONSTRAINT "tuition_receipts_learnerId_fkey" FOREIGN KEY ("learnerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tuition_receipts_classOfferingId_fkey') THEN
    ALTER TABLE "tuition_receipts" ADD CONSTRAINT "tuition_receipts_classOfferingId_fkey" FOREIGN KEY ("classOfferingId") REFERENCES "class_offerings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tuition_receipts_issuedById_fkey') THEN
    ALTER TABLE "tuition_receipts" ADD CONSTRAINT "tuition_receipts_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tuition_reconciliation_actions_transactionId_fkey') THEN
    ALTER TABLE "tuition_reconciliation_actions" ADD CONSTRAINT "tuition_reconciliation_actions_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "sepay_tuition_transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tuition_reconciliation_actions_receivableId_fkey') THEN
    ALTER TABLE "tuition_reconciliation_actions" ADD CONSTRAINT "tuition_reconciliation_actions_receivableId_fkey" FOREIGN KEY ("receivableId") REFERENCES "tuition_receivables"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tuition_reconciliation_actions_orderId_fkey') THEN
    ALTER TABLE "tuition_reconciliation_actions" ADD CONSTRAINT "tuition_reconciliation_actions_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "tuition_payment_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tuition_reconciliation_actions_actorId_fkey') THEN
    ALTER TABLE "tuition_reconciliation_actions" ADD CONSTRAINT "tuition_reconciliation_actions_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

