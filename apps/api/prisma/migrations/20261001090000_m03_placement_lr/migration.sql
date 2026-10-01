-- CreateEnum
CREATE TYPE "PlacementSelfLevel" AS ENUM ('UNKNOWN', 'BEGINNER', 'BASIC', 'INTERMEDIATE', 'GOOD');

-- AlterTable
ALTER TABLE "test_attempts"
  ADD COLUMN "placementSelfLevel" "PlacementSelfLevel",
  ADD COLUMN "placementGoalScore" INTEGER;

-- CreateTable
CREATE TABLE "test_question_groups" (
  "id" UUID NOT NULL,
  "testId" UUID NOT NULL,
  "skill" "ToeicSkill" NOT NULL,
  "orderIndex" INTEGER NOT NULL,
  "title" TEXT,
  "instructions" TEXT,
  "stimulusText" TEXT,
  "audioUrl" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "test_question_groups_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "test_questions" ADD COLUMN "groupId" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "test_question_groups_testId_orderIndex_key"
ON "test_question_groups"("testId", "orderIndex");

CREATE INDEX "test_question_groups_testId_idx" ON "test_question_groups"("testId");
CREATE INDEX "test_questions_groupId_idx" ON "test_questions"("groupId");

-- The existing partial unique index below remains the database defense against
-- duplicate active rows for the same learner/form. Cross-form LR convergence is
-- enforced by the Serializable Placement service because an index cannot join
-- test_attempts to tests. Its exact existing definition is:
-- CREATE UNIQUE INDEX "test_attempts_placement_in_progress_key"
-- ON "test_attempts"("testId", "learnerId")
-- WHERE "status" = 'IN_PROGRESS' AND "enrollmentId" IS NULL AND "classAssessmentId" IS NULL;

-- AddCheckConstraint
ALTER TABLE "test_attempts"
  ADD CONSTRAINT "test_attempts_placement_goal_score_check"
  CHECK ("placementGoalScore" IS NULL OR "placementGoalScore" BETWEEN 10 AND 990);

-- AddForeignKey
ALTER TABLE "test_question_groups"
  ADD CONSTRAINT "test_question_groups_testId_fkey"
  FOREIGN KEY ("testId") REFERENCES "tests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "test_questions"
  ADD CONSTRAINT "test_questions_groupId_fkey"
  FOREIGN KEY ("groupId") REFERENCES "test_question_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;
