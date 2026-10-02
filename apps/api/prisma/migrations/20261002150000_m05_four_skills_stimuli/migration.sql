CREATE TYPE "AssessmentStimulusType" AS ENUM ('TEXT', 'IMAGE', 'AUDIO');

ALTER TABLE "test_question_groups"
  ADD COLUMN "taskCode" TEXT,
  ADD COLUMN "preparationSeconds" INTEGER,
  ADD COLUMN "responseSeconds" INTEGER,
  ADD COLUMN "recommendedSeconds" INTEGER,
  ADD COLUMN "maxRecordingSeconds" INTEGER;

ALTER TABLE "test_question_groups"
  ADD CONSTRAINT "test_question_groups_timing_nonnegative_check"
  CHECK (
    ("preparationSeconds" IS NULL OR "preparationSeconds" >= 0) AND
    ("responseSeconds" IS NULL OR "responseSeconds" >= 0) AND
    ("recommendedSeconds" IS NULL OR "recommendedSeconds" >= 0) AND
    ("maxRecordingSeconds" IS NULL OR "maxRecordingSeconds" >= 0)
  ),
  ADD CONSTRAINT "test_question_groups_response_within_recording_check"
  CHECK (
    "responseSeconds" IS NULL OR
    "maxRecordingSeconds" IS NULL OR
    "responseSeconds" <= "maxRecordingSeconds"
  );

CREATE TABLE "assessment_stimuli" (
  "id" UUID NOT NULL,
  "groupId" UUID NOT NULL,
  "type" "AssessmentStimulusType" NOT NULL,
  "orderIndex" INTEGER NOT NULL,
  "textContent" TEXT,
  "storageKey" TEXT,
  "mimeType" TEXT,
  "altText" TEXT,
  "isProtected" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "assessment_stimuli_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "assessment_stimuli_payload_check" CHECK (
    ("type" = 'TEXT' AND "textContent" IS NOT NULL AND "storageKey" IS NULL) OR
    ("type" IN ('IMAGE', 'AUDIO') AND "storageKey" IS NOT NULL)
  )
);

CREATE UNIQUE INDEX "assessment_stimuli_groupId_orderIndex_key"
  ON "assessment_stimuli"("groupId", "orderIndex");
CREATE INDEX "assessment_stimuli_groupId_idx" ON "assessment_stimuli"("groupId");

ALTER TABLE "assessment_stimuli"
  ADD CONSTRAINT "assessment_stimuli_groupId_fkey"
  FOREIGN KEY ("groupId") REFERENCES "test_question_groups"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
