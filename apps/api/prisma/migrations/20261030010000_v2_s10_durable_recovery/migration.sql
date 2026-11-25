-- CreateTable
CREATE TABLE "exam_task_progress" (
    "id" UUID NOT NULL,
    "attemptId" UUID NOT NULL,
    "testQuestionId" UUID NOT NULL,
    "learnerId" UUID NOT NULL,
    "epoch" UUID NOT NULL,
    "parentEpoch" UUID,
    "resetCount" INTEGER NOT NULL DEFAULT 0,
    "contentVersion" TEXT NOT NULL,
    "assetVersion" TEXT NOT NULL,
    "mediaSha256" TEXT NOT NULL,
    "mediaStorageKey" TEXT NOT NULL,
    "mediaDurationMs" INTEGER NOT NULL,
    "phase" TEXT NOT NULL DEFAULT 'NOT_STARTED',
    "revision" INTEGER NOT NULL DEFAULT 0,
    "started" INTEGER NOT NULL DEFAULT 0,
    "completed" INTEGER NOT NULL DEFAULT 0,
    "leaseSessionHash" TEXT,
    "leaseTabHash" TEXT,
    "leaseTokenHash" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "playNonceHash" TEXT,
    "playIssuedAt" TIMESTAMP(3),
    "mediaRead" BOOLEAN NOT NULL DEFAULT false,
    "responseDeadline" TIMESTAMP(3),
    "uploadDigest" TEXT,
    "savedAnswerId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exam_task_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_task_events" (
    "id" UUID NOT NULL,
    "progressId" UUID NOT NULL,
    "actorId" UUID,
    "actorKind" TEXT NOT NULL DEFAULT 'USER',
    "action" TEXT NOT NULL,
    "accepted" BOOLEAN NOT NULL,
    "code" TEXT,
    "reason" VARCHAR(500),
    "revision" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exam_task_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_task_receipts" (
    "id" UUID NOT NULL,
    "progressId" UUID NOT NULL,
    "actorHash" TEXT NOT NULL,
    "key" UUID NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "outcome" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exam_task_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_task_uploads" (
    "id" UUID NOT NULL,
    "progressId" UUID NOT NULL,
    "key" UUID NOT NULL,
    "digest" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'STAGED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exam_task_uploads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_recovery_permissions" (
    "userId" UUID NOT NULL,
    "grantedBy" UUID NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "exam_recovery_permissions_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE UNIQUE INDEX "exam_task_progress_epoch_key" ON "exam_task_progress"("epoch");

-- CreateIndex
CREATE INDEX "exam_task_progress_attemptId_testQuestionId_createdAt_idx" ON "exam_task_progress"("attemptId", "testQuestionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "exam_task_progress_attemptId_testQuestionId_resetCount_key" ON "exam_task_progress"("attemptId", "testQuestionId", "resetCount");

-- CreateIndex
CREATE INDEX "exam_task_events_progressId_createdAt_idx" ON "exam_task_events"("progressId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "exam_task_receipts_progressId_actorHash_key_key" ON "exam_task_receipts"("progressId", "actorHash", "key");

-- CreateIndex
CREATE UNIQUE INDEX "exam_task_uploads_storageKey_key" ON "exam_task_uploads"("storageKey");

-- CreateIndex
CREATE INDEX "exam_task_uploads_status_createdAt_idx" ON "exam_task_uploads"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "exam_task_uploads_progressId_key_key" ON "exam_task_uploads"("progressId", "key");

-- AddForeignKey
ALTER TABLE "exam_task_progress" ADD CONSTRAINT "exam_task_progress_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "test_attempts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_task_progress" ADD CONSTRAINT "exam_task_progress_testQuestionId_fkey" FOREIGN KEY ("testQuestionId") REFERENCES "test_questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_task_progress" ADD CONSTRAINT "exam_task_progress_parentEpoch_fkey" FOREIGN KEY ("parentEpoch") REFERENCES "exam_task_progress"("epoch") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_task_progress" ADD CONSTRAINT "exam_task_progress_savedAnswerId_fkey" FOREIGN KEY ("savedAnswerId") REFERENCES "test_answers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_task_events" ADD CONSTRAINT "exam_task_events_progressId_fkey" FOREIGN KEY ("progressId") REFERENCES "exam_task_progress"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_task_receipts" ADD CONSTRAINT "exam_task_receipts_progressId_fkey" FOREIGN KEY ("progressId") REFERENCES "exam_task_progress"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_task_uploads" ADD CONSTRAINT "exam_task_uploads_progressId_fkey" FOREIGN KEY ("progressId") REFERENCES "exam_task_progress"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_recovery_permissions" ADD CONSTRAINT "exam_recovery_permissions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Invariants are enforced even if a future caller bypasses the command service.
CREATE UNIQUE INDEX s10_one_reset_per_attempt ON exam_task_progress ("attemptId") WHERE "resetCount"=1;
ALTER TABLE exam_task_progress ADD CONSTRAINT s10_counts CHECK (
  completed BETWEEN 0 AND 2 AND started BETWEEN 0 AND 2 AND completed <= started
  AND started-completed <= 1 AND revision >= 0 AND "mediaDurationMs" > 0
  AND "resetCount" BETWEEN 0 AND 1
  AND (("resetCount"=0 AND "parentEpoch" IS NULL) OR ("resetCount"=1 AND "parentEpoch" IS NOT NULL))
  AND "mediaSha256" ~ '^[a-f0-9]{64}$'
  AND phase IN ('NOT_STARTED','READY','PLAYING','WAITING_GESTURE','RECORDING_READY','RECORDING','UPLOADING','UPLOAD_RETRY','SAVED','BLOCKED_REVIEW','SUPERSEDED')
  AND ("responseDeadline" IS NULL OR completed=2)
  AND (phase <> 'SAVED' OR "savedAnswerId" IS NOT NULL)
);
CREATE FUNCTION s10_immutable_progress() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'S10 history cannot be deleted'; END IF;
  IF (NEW."attemptId",NEW."testQuestionId",NEW."learnerId",NEW.epoch,NEW."parentEpoch",NEW."resetCount",
      NEW."contentVersion",NEW."assetVersion",NEW."mediaSha256",NEW."mediaStorageKey",NEW."mediaDurationMs")
     IS DISTINCT FROM
     (OLD."attemptId",OLD."testQuestionId",OLD."learnerId",OLD.epoch,OLD."parentEpoch",OLD."resetCount",
      OLD."contentVersion",OLD."assetVersion",OLD."mediaSha256",OLD."mediaStorageKey",OLD."mediaDurationMs")
     OR NEW.started < OLD.started OR NEW.completed < OLD.completed OR NEW.revision < OLD.revision
     OR (OLD."responseDeadline" IS NOT NULL AND NEW."responseDeadline" IS DISTINCT FROM OLD."responseDeadline")
     OR (OLD.phase='SUPERSEDED' AND NEW.phase <> 'SUPERSEDED')
     OR (OLD.phase='SAVED' AND NEW.phase <> 'SAVED')
  THEN RAISE EXCEPTION 'S10 immutable binding or cursor'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER s10_immutable_progress BEFORE UPDATE OR DELETE ON exam_task_progress
  FOR EACH ROW EXECUTE FUNCTION s10_immutable_progress();
CREATE FUNCTION s10_append_only_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'S10 audit is append only'; END $$;
CREATE TRIGGER s10_append_only_event BEFORE UPDATE OR DELETE ON exam_task_events
  FOR EACH ROW EXECUTE FUNCTION s10_append_only_event();
