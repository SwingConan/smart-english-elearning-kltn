-- CreateEnum
CREATE TYPE "ToeicSkill" AS ENUM ('LISTENING', 'READING', 'SPEAKING', 'WRITING');

-- CreateEnum
CREATE TYPE "CourseSkillScope" AS ENUM ('LR', 'FOUR_SKILLS', 'LISTENING', 'READING', 'SPEAKING', 'WRITING');

-- CreateEnum
CREATE TYPE "ClassModality" AS ENUM ('ONLINE', 'OFFLINE', 'HYBRID');

-- CreateEnum
CREATE TYPE "QuestionResponseType" AS ENUM ('SINGLE_CHOICE', 'TRUE_FALSE', 'MULTIPLE_CHOICE', 'TEXT_RESPONSE', 'AUDIO_RESPONSE');

-- CreateEnum
CREATE TYPE "TestPurpose" AS ENUM ('PLACEMENT', 'IN_CLASS', 'PRACTICE_MOCK');

-- CreateEnum
CREATE TYPE "PlacementMode" AS ENUM ('LR', 'FOUR_SKILLS');

-- CreateEnum
CREATE TYPE "AssessmentStage" AS ENUM ('PERIODIC', 'MIDTERM', 'FINAL');

-- CreateEnum
CREATE TYPE "AnswerEvaluationSource" AS ENUM ('AI', 'INSTRUCTOR');

-- CreateEnum
CREATE TYPE "AnswerEvaluationStatus" AS ENUM ('AI_PROVISIONAL', 'PENDING_REVIEW', 'REVIEWED_FINAL', 'FAILED');

-- CreateEnum
CREATE TYPE "SkillScoreStatus" AS ENUM ('PROVISIONAL', 'FINAL');

-- CreateEnum
CREATE TYPE "SkillScoreSource" AS ENUM ('OBJECTIVE_AUTO', 'AI_ESTIMATE', 'INSTRUCTOR_CONFIRMED');

-- CreateEnum
CREATE TYPE "AttemptEvaluationStatus" AS ENUM ('PROVISIONAL', 'FINAL');

-- CreateEnum
CREATE TYPE "EvaluationMetric" AS ENUM ('LR_TOTAL', 'SKILL_ESTIMATED_TOEIC', 'SKILL_NORMALIZED');

-- CreateEnum
CREATE TYPE "CriterionRuleMode" AS ENUM ('ALL', 'ANY');

-- CreateEnum
CREATE TYPE "CourseRecommendationKind" AS ENUM ('PRIMARY', 'SUPPLEMENTARY');

-- CreateEnum
CREATE TYPE "StudyRecommendationTarget" AS ENUM ('SKILL', 'LESSON', 'RESOURCE', 'PRACTICE');

-- Add target columns as nullable first so existing rows can be explicitly backfilled.
ALTER TABLE "class_offerings" ADD COLUMN     "code" TEXT,
ADD COLUMN     "modality" "ClassModality",
ADD COLUMN     "totalPeriods" INTEGER,
ADD COLUMN     "totalSessions" INTEGER;

ALTER TABLE "courses" ADD COLUMN     "skillScope" "CourseSkillScope";

-- The baseline seed is the only mapping that is known without inventing business data.
UPDATE "courses"
SET "skillScope" = 'LR'
WHERE "slug" = 'demo-english-foundations';

UPDATE "class_offerings"
SET "code" = CASE "id"
  WHEN '10000000-0000-4000-8000-000000000001'::uuid THEN 'TOEIC-LR-DEMO-FREE'
  WHEN '10000000-0000-4000-8000-000000000002'::uuid THEN 'TOEIC-LR-DEMO-PAID'
END,
"modality" = 'ONLINE'
WHERE "id" IN (
  '10000000-0000-4000-8000-000000000001'::uuid,
  '10000000-0000-4000-8000-000000000002'::uuid
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "courses" WHERE "skillScope" IS NULL) THEN
    RAISE EXCEPTION 'M01 migration requires an explicit Course.skillScope mapping for every non-demo course';
  END IF;
  IF EXISTS (SELECT 1 FROM "class_offerings" WHERE "code" IS NULL OR "modality" IS NULL) THEN
    RAISE EXCEPTION 'M01 migration requires explicit ClassOffering.code and modality mappings for every non-demo offering';
  END IF;
END $$;

ALTER TABLE "courses" ALTER COLUMN "skillScope" SET NOT NULL;
ALTER TABLE "class_offerings" ALTER COLUMN "code" SET NOT NULL;
ALTER TABLE "class_offerings" ALTER COLUMN "modality" SET NOT NULL;

-- Compatibility defaults apply only to newly created records. Existing rows above are
-- never inferred: they must have explicit mappings before this point.
ALTER TABLE "courses" ALTER COLUMN "skillScope" SET DEFAULT 'LR';
ALTER TABLE "class_offerings" ALTER COLUMN "modality" SET DEFAULT 'ONLINE';

-- AlterTable
ALTER TABLE "learning_resources" ADD COLUMN     "mimeType" TEXT,
ADD COLUMN     "originalFileName" TEXT,
ADD COLUMN     "storageKey" TEXT,
ALTER COLUMN "url" DROP NOT NULL;

-- AlterTable
ALTER TABLE "lessons" ADD COLUMN     "focusSkills" "ToeicSkill"[] DEFAULT ARRAY[]::"ToeicSkill"[];

-- Keep the legacy type column/enum physically for rollback and audit compatibility.
ALTER TABLE "questions" ADD COLUMN     "responseType" "QuestionResponseType",
ADD COLUMN     "rubricId" UUID,
ADD COLUMN     "toeicSkill" "ToeicSkill",
ALTER COLUMN "courseId" DROP NOT NULL;

UPDATE "questions"
SET "responseType" = "type"::text::"QuestionResponseType";

UPDATE "questions"
SET "toeicSkill" = CASE "id"
  WHEN '60000000-0000-4000-8000-000000000001'::uuid THEN 'LISTENING'::"ToeicSkill"
  WHEN '60000000-0000-4000-8000-000000000002'::uuid THEN 'LISTENING'::"ToeicSkill"
  WHEN '60000000-0000-4000-8000-000000000003'::uuid THEN 'READING'::"ToeicSkill"
  WHEN '60000000-0000-4000-8000-000000000004'::uuid THEN 'READING'::"ToeicSkill"
  WHEN '60000000-0000-4000-8000-000000000005'::uuid THEN 'READING'::"ToeicSkill"
END
WHERE "id" IN (
  '60000000-0000-4000-8000-000000000001'::uuid,
  '60000000-0000-4000-8000-000000000002'::uuid,
  '60000000-0000-4000-8000-000000000003'::uuid,
  '60000000-0000-4000-8000-000000000004'::uuid,
  '60000000-0000-4000-8000-000000000005'::uuid
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "questions" WHERE "toeicSkill" IS NULL) THEN
    RAISE EXCEPTION 'M01 migration requires an explicit Question.toeicSkill mapping; legacy BKT mappings are not inferred';
  END IF;
END $$;

ALTER TABLE "questions" ALTER COLUMN "responseType" SET NOT NULL;
ALTER TABLE "questions" ALTER COLUMN "toeicSkill" SET NOT NULL;
ALTER TABLE "questions" ALTER COLUMN "type" DROP NOT NULL;

-- AlterTable
ALTER TABLE "test_answers" ADD COLUMN     "audioStorageKey" TEXT,
ADD COLUMN     "textResponse" TEXT;

ALTER TABLE "test_attempts" ADD COLUMN     "classAssessmentId" UUID,
ADD COLUMN     "learnerId" UUID,
ALTER COLUMN "enrollmentId" DROP NOT NULL;

-- Critical ownership backfill: preserve every historical attempt and derive its owner
-- from the enrollment relation before learnerId becomes required.
UPDATE "test_attempts" AS ta
SET "learnerId" = e."learnerId"
FROM "enrollments" AS e
WHERE ta."enrollmentId" = e."id";

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "test_attempts" WHERE "learnerId" IS NULL) THEN
    RAISE EXCEPTION 'M01 TestAttempt learnerId backfill failed because an Enrollment owner is missing';
  END IF;
END $$;

ALTER TABLE "test_attempts" ALTER COLUMN "learnerId" SET NOT NULL;

-- Keep legacy Test.type for rollback. Map QUIZ contextually instead of blindly renaming it.
ALTER TABLE "tests" ADD COLUMN     "placementMode" "PlacementMode",
ADD COLUMN     "purpose" "TestPurpose",
ADD COLUMN     "timeLimitMinutes" INTEGER,
ALTER COLUMN "courseId" DROP NOT NULL;

UPDATE "tests"
SET "purpose" = CASE
  WHEN "type" = 'PLACEMENT' THEN 'PLACEMENT'::"TestPurpose"
  WHEN "type" = 'QUIZ' AND "lessonId" IS NOT NULL THEN 'IN_CLASS'::"TestPurpose"
  ELSE 'PRACTICE_MOCK'::"TestPurpose"
END,
"placementMode" = CASE WHEN "type" = 'PLACEMENT' THEN 'LR'::"PlacementMode" ELSE NULL END;

ALTER TABLE "tests" ALTER COLUMN "purpose" SET NOT NULL;
ALTER TABLE "tests" ALTER COLUMN "type" DROP NOT NULL;

-- CreateTable
CREATE TABLE "class_schedule_slots" (
    "id" UUID NOT NULL,
    "classOfferingId" UUID NOT NULL,
    "dayOfWeek" SMALLINT NOT NULL,
    "startTime" TIME NOT NULL,
    "endTime" TIME NOT NULL,
    "locationText" TEXT,
    "meetingUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "class_schedule_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_assessments" (
    "id" UUID NOT NULL,
    "classOfferingId" UUID NOT NULL,
    "testId" UUID NOT NULL,
    "stage" "AssessmentStage" NOT NULL,
    "openAt" TIMESTAMP(3),
    "closeAt" TIMESTAMP(3),
    "maxAttemptsOverride" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "class_assessments_pkey" PRIMARY KEY ("id")
);

-- Materialize legacy lesson-scoped quizzes in their actual class context so historical
-- in-class attempts satisfy the new ownership chain without deleting or recreating them.
INSERT INTO "class_assessments" (
  "id", "classOfferingId", "testId", "stage", "isActive", "createdAt", "updatedAt"
)
SELECT DISTINCT
  (
    substr(md5(e."classOfferingId"::text || ':' || ta."testId"::text), 1, 8) || '-' ||
    substr(md5(e."classOfferingId"::text || ':' || ta."testId"::text), 9, 4) || '-4' ||
    substr(md5(e."classOfferingId"::text || ':' || ta."testId"::text), 14, 3) || '-8' ||
    substr(md5(e."classOfferingId"::text || ':' || ta."testId"::text), 18, 3) || '-' ||
    substr(md5(e."classOfferingId"::text || ':' || ta."testId"::text), 21, 12)
  )::uuid,
  e."classOfferingId",
  ta."testId",
  'PERIODIC'::"AssessmentStage",
  false,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "test_attempts" ta
JOIN "tests" t ON t."id" = ta."testId" AND t."purpose" = 'IN_CLASS'
JOIN "enrollments" e ON e."id" = ta."enrollmentId";

UPDATE "test_attempts" ta
SET "classAssessmentId" = ca."id"
FROM "enrollments" e, "class_assessments" ca
WHERE ta."enrollmentId" = e."id"
  AND ca."classOfferingId" = e."classOfferingId"
  AND ca."testId" = ta."testId";

-- Placement is learner-owned after cutover; retain learnerId and release the old
-- enrollment dependency. MasteryHistory keeps its own legacy enrollment reference.
UPDATE "test_attempts" ta
SET "enrollmentId" = NULL,
    "classAssessmentId" = NULL
FROM "tests" t
WHERE t."id" = ta."testId" AND t."purpose" = 'PLACEMENT';

COMMENT ON COLUMN "questions"."type" IS 'LEGACY/FROZEN pre-M01 response type; use responseType';
COMMENT ON COLUMN "tests"."type" IS 'LEGACY/FROZEN pre-M01 test type; use purpose';

-- CreateTable
CREATE TABLE "rubrics" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rubrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rubric_criteria" (
    "id" UUID NOT NULL,
    "rubricId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "orderIndex" INTEGER NOT NULL,
    "maxScore" DECIMAL(8,2) NOT NULL,
    "weight" DECIMAL(6,4) NOT NULL DEFAULT 1.0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rubric_criteria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "answer_evaluations" (
    "id" UUID NOT NULL,
    "testAnswerId" UUID NOT NULL,
    "source" "AnswerEvaluationSource" NOT NULL,
    "status" "AnswerEvaluationStatus" NOT NULL,
    "evaluatorId" UUID,
    "totalScore" DECIMAL(8,2),
    "feedback" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "answer_evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rubric_criterion_scores" (
    "id" UUID NOT NULL,
    "answerEvaluationId" UUID NOT NULL,
    "rubricCriterionId" UUID NOT NULL,
    "score" DECIMAL(8,2) NOT NULL,
    "feedback" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rubric_criterion_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attempt_skill_scores" (
    "id" UUID NOT NULL,
    "attemptId" UUID NOT NULL,
    "skill" "ToeicSkill" NOT NULL,
    "rawScore" DECIMAL(10,2),
    "maxRawScore" DECIMAL(10,2),
    "estimatedToeicScore" INTEGER,
    "normalizedScore" DECIMAL(5,2) NOT NULL,
    "status" "SkillScoreStatus" NOT NULL,
    "source" "SkillScoreSource" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attempt_skill_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evaluation_policies" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "placementMode" "PlacementMode",
    "ruleConfig" JSONB NOT NULL DEFAULT '{}',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "evaluation_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evaluation_bands" (
    "id" UUID NOT NULL,
    "policyId" UUID NOT NULL,
    "metric" "EvaluationMetric" NOT NULL,
    "skill" "ToeicSkill",
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "minValue" DECIMAL(10,2) NOT NULL,
    "maxValue" DECIMAL(10,2) NOT NULL,
    "summaryTemplate" TEXT,
    "orderIndex" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "evaluation_bands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attempt_evaluations" (
    "id" UUID NOT NULL,
    "attemptId" UUID NOT NULL,
    "evaluationPolicyId" UUID,
    "status" "AttemptEvaluationStatus" NOT NULL,
    "placementLevelCode" TEXT,
    "placementLevelLabel" TEXT,
    "strongestSkill" "ToeicSkill",
    "weakestSkill" "ToeicSkill",
    "lrTotalScore" INTEGER,
    "summary" TEXT,
    "aiExplanation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attempt_evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_recommendation_profiles" (
    "id" UUID NOT NULL,
    "courseId" UUID NOT NULL,
    "ruleMode" "CriterionRuleMode" NOT NULL DEFAULT 'ALL',
    "priority" INTEGER NOT NULL DEFAULT 100,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "course_recommendation_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_skill_criteria" (
    "id" UUID NOT NULL,
    "profileId" UUID NOT NULL,
    "skill" "ToeicSkill" NOT NULL,
    "minNormalizedScore" DECIMAL(5,2),
    "maxNormalizedScore" DECIMAL(5,2),
    "minEstimatedToeicScore" INTEGER,
    "maxEstimatedToeicScore" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "course_skill_criteria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_recommendations" (
    "id" UUID NOT NULL,
    "attemptId" UUID NOT NULL,
    "courseId" UUID NOT NULL,
    "kind" "CourseRecommendationKind" NOT NULL DEFAULT 'PRIMARY',
    "ruleReason" JSONB NOT NULL DEFAULT '{}',
    "aiExplanation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "course_recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "study_recommendations" (
    "id" UUID NOT NULL,
    "learnerId" UUID NOT NULL,
    "enrollmentId" UUID NOT NULL,
    "sourceAttemptId" UUID,
    "skill" "ToeicSkill" NOT NULL,
    "targetType" "StudyRecommendationTarget" NOT NULL DEFAULT 'SKILL',
    "lessonId" UUID,
    "resourceId" UUID,
    "title" TEXT NOT NULL,
    "actionText" TEXT NOT NULL,
    "aiExplanation" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "study_recommendations_pkey" PRIMARY KEY ("id")
);

-- Database-enforced invariants from Data Dictionary v1.0. Cross-row/cross-table
-- ownership rules remain transaction/service enforced and are listed in the report.
ALTER TABLE "class_offerings"
  ADD CONSTRAINT "class_offerings_tuition_nonnegative_check" CHECK ("tuitionFeeVnd" IS NULL OR "tuitionFeeVnd" >= 0),
  ADD CONSTRAINT "class_offerings_capacity_positive_check" CHECK ("maxStudents" IS NULL OR "maxStudents" > 0),
  ADD CONSTRAINT "class_offerings_total_sessions_positive_check" CHECK ("totalSessions" IS NULL OR "totalSessions" > 0),
  ADD CONSTRAINT "class_offerings_total_periods_positive_check" CHECK ("totalPeriods" IS NULL OR "totalPeriods" > 0),
  ADD CONSTRAINT "class_offerings_enrollment_window_check" CHECK ("enrollmentStart" IS NULL OR "enrollmentEnd" IS NULL OR "enrollmentEnd" >= "enrollmentStart"),
  ADD CONSTRAINT "class_offerings_class_window_check" CHECK ("classStart" IS NULL OR "classEnd" IS NULL OR "classEnd" >= "classStart");

ALTER TABLE "class_schedule_slots"
  ADD CONSTRAINT "class_schedule_slots_day_check" CHECK ("dayOfWeek" BETWEEN 1 AND 7),
  ADD CONSTRAINT "class_schedule_slots_time_check" CHECK ("endTime" > "startTime");

ALTER TABLE "learning_resources"
  ADD CONSTRAINT "learning_resources_location_check" CHECK ("url" IS NOT NULL OR "storageKey" IS NOT NULL);

ALTER TABLE "rubric_criteria"
  ADD CONSTRAINT "rubric_criteria_order_check" CHECK ("orderIndex" >= 0),
  ADD CONSTRAINT "rubric_criteria_max_score_check" CHECK ("maxScore" > 0),
  ADD CONSTRAINT "rubric_criteria_weight_check" CHECK ("weight" BETWEEN 0 AND 1);

ALTER TABLE "tests"
  ADD CONSTRAINT "tests_placement_mode_check" CHECK (
    ("purpose" = 'PLACEMENT' AND "placementMode" IS NOT NULL)
    OR ("purpose" <> 'PLACEMENT' AND "placementMode" IS NULL)
  ),
  ADD CONSTRAINT "tests_max_attempts_check" CHECK ("maxAttempts" > 0),
  ADD CONSTRAINT "tests_time_limit_check" CHECK ("timeLimitMinutes" IS NULL OR "timeLimitMinutes" > 0);

ALTER TABLE "class_assessments"
  ADD CONSTRAINT "class_assessments_window_check" CHECK ("openAt" IS NULL OR "closeAt" IS NULL OR "closeAt" > "openAt"),
  ADD CONSTRAINT "class_assessments_max_attempts_check" CHECK ("maxAttemptsOverride" IS NULL OR "maxAttemptsOverride" > 0);

ALTER TABLE "test_attempts"
  ADD CONSTRAINT "test_attempts_number_check" CHECK ("attemptNumber" >= 1),
  ADD CONSTRAINT "test_attempts_class_context_check" CHECK ("classAssessmentId" IS NULL OR "enrollmentId" IS NOT NULL);

ALTER TABLE "answer_evaluations"
  ADD CONSTRAINT "answer_evaluations_score_check" CHECK ("totalScore" IS NULL OR "totalScore" >= 0),
  ADD CONSTRAINT "answer_evaluations_evaluator_check" CHECK ("source" <> 'INSTRUCTOR' OR "evaluatorId" IS NOT NULL);

ALTER TABLE "rubric_criterion_scores"
  ADD CONSTRAINT "rubric_criterion_scores_nonnegative_check" CHECK ("score" >= 0);

ALTER TABLE "attempt_skill_scores"
  ADD CONSTRAINT "attempt_skill_scores_raw_check" CHECK ("rawScore" IS NULL OR "rawScore" >= 0),
  ADD CONSTRAINT "attempt_skill_scores_max_raw_check" CHECK ("maxRawScore" IS NULL OR "maxRawScore" >= 0),
  ADD CONSTRAINT "attempt_skill_scores_raw_bounds_check" CHECK ("rawScore" IS NULL OR "maxRawScore" IS NULL OR "rawScore" <= "maxRawScore"),
  ADD CONSTRAINT "attempt_skill_scores_normalized_check" CHECK ("normalizedScore" BETWEEN 0 AND 100);

ALTER TABLE "evaluation_bands"
  ADD CONSTRAINT "evaluation_bands_range_check" CHECK ("minValue" <= "maxValue"),
  ADD CONSTRAINT "evaluation_bands_skill_check" CHECK (
    ("metric" = 'LR_TOTAL' AND "skill" IS NULL)
    OR ("metric" <> 'LR_TOTAL' AND "skill" IS NOT NULL)
  ),
  ADD CONSTRAINT "evaluation_bands_order_check" CHECK ("orderIndex" >= 0);

ALTER TABLE "attempt_evaluations"
  ADD CONSTRAINT "attempt_evaluations_lr_total_check" CHECK ("lrTotalScore" IS NULL OR "lrTotalScore" BETWEEN 10 AND 990);

ALTER TABLE "course_skill_criteria"
  ADD CONSTRAINT "course_skill_criteria_normalized_check" CHECK (
    ("minNormalizedScore" IS NULL OR "minNormalizedScore" BETWEEN 0 AND 100)
    AND ("maxNormalizedScore" IS NULL OR "maxNormalizedScore" BETWEEN 0 AND 100)
    AND ("minNormalizedScore" IS NULL OR "maxNormalizedScore" IS NULL OR "minNormalizedScore" <= "maxNormalizedScore")
  ),
  ADD CONSTRAINT "course_skill_criteria_estimated_check" CHECK (
    "minEstimatedToeicScore" IS NULL OR "maxEstimatedToeicScore" IS NULL OR "minEstimatedToeicScore" <= "maxEstimatedToeicScore"
  );

-- CreateIndex
CREATE INDEX "class_schedule_slots_classOfferingId_idx" ON "class_schedule_slots"("classOfferingId");

-- CreateIndex
CREATE INDEX "class_schedule_slots_classOfferingId_dayOfWeek_idx" ON "class_schedule_slots"("classOfferingId", "dayOfWeek");

-- CreateIndex
CREATE INDEX "class_assessments_classOfferingId_idx" ON "class_assessments"("classOfferingId");

-- CreateIndex
CREATE INDEX "class_assessments_testId_idx" ON "class_assessments"("testId");

-- CreateIndex
CREATE INDEX "class_assessments_stage_idx" ON "class_assessments"("stage");

-- CreateIndex
CREATE INDEX "class_assessments_isActive_idx" ON "class_assessments"("isActive");

-- CreateIndex
CREATE INDEX "rubrics_isActive_idx" ON "rubrics"("isActive");

-- CreateIndex
CREATE INDEX "rubric_criteria_rubricId_idx" ON "rubric_criteria"("rubricId");

-- CreateIndex
CREATE UNIQUE INDEX "rubric_criteria_rubricId_code_key" ON "rubric_criteria"("rubricId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "rubric_criteria_rubricId_orderIndex_key" ON "rubric_criteria"("rubricId", "orderIndex");

-- CreateIndex
CREATE INDEX "answer_evaluations_testAnswerId_idx" ON "answer_evaluations"("testAnswerId");

-- CreateIndex
CREATE INDEX "answer_evaluations_source_idx" ON "answer_evaluations"("source");

-- CreateIndex
CREATE INDEX "answer_evaluations_status_idx" ON "answer_evaluations"("status");

-- CreateIndex
CREATE INDEX "answer_evaluations_evaluatorId_idx" ON "answer_evaluations"("evaluatorId");

-- CreateIndex
CREATE INDEX "rubric_criterion_scores_answerEvaluationId_idx" ON "rubric_criterion_scores"("answerEvaluationId");

-- CreateIndex
CREATE INDEX "rubric_criterion_scores_rubricCriterionId_idx" ON "rubric_criterion_scores"("rubricCriterionId");

-- CreateIndex
CREATE UNIQUE INDEX "rubric_criterion_scores_answerEvaluationId_rubricCriterionI_key" ON "rubric_criterion_scores"("answerEvaluationId", "rubricCriterionId");

-- CreateIndex
CREATE INDEX "attempt_skill_scores_attemptId_idx" ON "attempt_skill_scores"("attemptId");

-- CreateIndex
CREATE INDEX "attempt_skill_scores_status_idx" ON "attempt_skill_scores"("status");

-- CreateIndex
CREATE INDEX "attempt_skill_scores_source_idx" ON "attempt_skill_scores"("source");

-- CreateIndex
CREATE UNIQUE INDEX "attempt_skill_scores_attemptId_skill_key" ON "attempt_skill_scores"("attemptId", "skill");

-- CreateIndex
CREATE UNIQUE INDEX "evaluation_policies_code_key" ON "evaluation_policies"("code");

-- CreateIndex
CREATE INDEX "evaluation_policies_placementMode_idx" ON "evaluation_policies"("placementMode");

-- CreateIndex
CREATE INDEX "evaluation_policies_isActive_idx" ON "evaluation_policies"("isActive");

-- CreateIndex
CREATE INDEX "evaluation_bands_policyId_idx" ON "evaluation_bands"("policyId");

-- CreateIndex
CREATE INDEX "evaluation_bands_metric_skill_idx" ON "evaluation_bands"("metric", "skill");

-- CreateIndex
CREATE UNIQUE INDEX "evaluation_bands_policyId_metric_skill_code_key" ON "evaluation_bands"("policyId", "metric", "skill", "code");

-- CreateIndex
CREATE UNIQUE INDEX "evaluation_bands_policyId_orderIndex_key" ON "evaluation_bands"("policyId", "orderIndex");

-- CreateIndex
CREATE UNIQUE INDEX "attempt_evaluations_attemptId_key" ON "attempt_evaluations"("attemptId");

-- CreateIndex
CREATE INDEX "attempt_evaluations_evaluationPolicyId_idx" ON "attempt_evaluations"("evaluationPolicyId");

-- CreateIndex
CREATE INDEX "attempt_evaluations_status_idx" ON "attempt_evaluations"("status");

-- CreateIndex
CREATE INDEX "attempt_evaluations_placementLevelCode_idx" ON "attempt_evaluations"("placementLevelCode");

-- CreateIndex
CREATE UNIQUE INDEX "course_recommendation_profiles_courseId_key" ON "course_recommendation_profiles"("courseId");

-- CreateIndex
CREATE INDEX "course_recommendation_profiles_priority_idx" ON "course_recommendation_profiles"("priority");

-- CreateIndex
CREATE INDEX "course_recommendation_profiles_isActive_idx" ON "course_recommendation_profiles"("isActive");

-- CreateIndex
CREATE INDEX "course_skill_criteria_profileId_idx" ON "course_skill_criteria"("profileId");

-- CreateIndex
CREATE UNIQUE INDEX "course_skill_criteria_profileId_skill_key" ON "course_skill_criteria"("profileId", "skill");

-- CreateIndex
CREATE INDEX "course_recommendations_attemptId_idx" ON "course_recommendations"("attemptId");

-- CreateIndex
CREATE INDEX "course_recommendations_courseId_idx" ON "course_recommendations"("courseId");

-- CreateIndex
CREATE INDEX "course_recommendations_kind_idx" ON "course_recommendations"("kind");

-- CreateIndex
CREATE UNIQUE INDEX "course_recommendations_attemptId_courseId_key" ON "course_recommendations"("attemptId", "courseId");

-- CreateIndex
CREATE INDEX "study_recommendations_learnerId_idx" ON "study_recommendations"("learnerId");

-- CreateIndex
CREATE INDEX "study_recommendations_enrollmentId_idx" ON "study_recommendations"("enrollmentId");

-- CreateIndex
CREATE INDEX "study_recommendations_sourceAttemptId_idx" ON "study_recommendations"("sourceAttemptId");

-- CreateIndex
CREATE INDEX "study_recommendations_skill_idx" ON "study_recommendations"("skill");

-- CreateIndex
CREATE INDEX "study_recommendations_lessonId_idx" ON "study_recommendations"("lessonId");

-- CreateIndex
CREATE INDEX "study_recommendations_resourceId_idx" ON "study_recommendations"("resourceId");

-- CreateIndex
CREATE INDEX "study_recommendations_isActive_idx" ON "study_recommendations"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "class_offerings_code_key" ON "class_offerings"("code");

-- CreateIndex
CREATE INDEX "questions_courseId_responseType_idx" ON "questions"("courseId", "responseType");

-- CreateIndex
CREATE INDEX "questions_toeicSkill_idx" ON "questions"("toeicSkill");

-- CreateIndex
CREATE INDEX "questions_rubricId_idx" ON "questions"("rubricId");

-- CreateIndex
CREATE INDEX "test_attempts_learnerId_idx" ON "test_attempts"("learnerId");

-- CreateIndex
CREATE INDEX "test_attempts_classAssessmentId_idx" ON "test_attempts"("classAssessmentId");

-- Prisma cannot declare partial indexes; these implement context-specific numbering
-- and start-or-resume uniqueness without treating NULL values as equal globally.
CREATE UNIQUE INDEX "test_attempts_placement_context_number_key"
ON "test_attempts"("testId", "learnerId", "attemptNumber")
WHERE "enrollmentId" IS NULL AND "classAssessmentId" IS NULL;

CREATE UNIQUE INDEX "test_attempts_class_context_number_key"
ON "test_attempts"("classAssessmentId", "learnerId", "attemptNumber")
WHERE "classAssessmentId" IS NOT NULL;

CREATE UNIQUE INDEX "test_attempts_placement_in_progress_key"
ON "test_attempts"("testId", "learnerId")
WHERE "status" = 'IN_PROGRESS' AND "enrollmentId" IS NULL AND "classAssessmentId" IS NULL;

CREATE UNIQUE INDEX "test_attempts_class_in_progress_key"
ON "test_attempts"("classAssessmentId", "learnerId")
WHERE "status" = 'IN_PROGRESS' AND "classAssessmentId" IS NOT NULL;

-- CreateIndex
CREATE INDEX "tests_purpose_idx" ON "tests"("purpose");

-- CreateIndex
CREATE INDEX "tests_placementMode_idx" ON "tests"("placementMode");

-- AddForeignKey
ALTER TABLE "class_schedule_slots" ADD CONSTRAINT "class_schedule_slots_classOfferingId_fkey" FOREIGN KEY ("classOfferingId") REFERENCES "class_offerings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_rubricId_fkey" FOREIGN KEY ("rubricId") REFERENCES "rubrics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_assessments" ADD CONSTRAINT "class_assessments_classOfferingId_fkey" FOREIGN KEY ("classOfferingId") REFERENCES "class_offerings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_assessments" ADD CONSTRAINT "class_assessments_testId_fkey" FOREIGN KEY ("testId") REFERENCES "tests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_attempts" ADD CONSTRAINT "test_attempts_learnerId_fkey" FOREIGN KEY ("learnerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_attempts" ADD CONSTRAINT "test_attempts_classAssessmentId_fkey" FOREIGN KEY ("classAssessmentId") REFERENCES "class_assessments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rubric_criteria" ADD CONSTRAINT "rubric_criteria_rubricId_fkey" FOREIGN KEY ("rubricId") REFERENCES "rubrics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answer_evaluations" ADD CONSTRAINT "answer_evaluations_testAnswerId_fkey" FOREIGN KEY ("testAnswerId") REFERENCES "test_answers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answer_evaluations" ADD CONSTRAINT "answer_evaluations_evaluatorId_fkey" FOREIGN KEY ("evaluatorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rubric_criterion_scores" ADD CONSTRAINT "rubric_criterion_scores_answerEvaluationId_fkey" FOREIGN KEY ("answerEvaluationId") REFERENCES "answer_evaluations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rubric_criterion_scores" ADD CONSTRAINT "rubric_criterion_scores_rubricCriterionId_fkey" FOREIGN KEY ("rubricCriterionId") REFERENCES "rubric_criteria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempt_skill_scores" ADD CONSTRAINT "attempt_skill_scores_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "test_attempts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_bands" ADD CONSTRAINT "evaluation_bands_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "evaluation_policies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempt_evaluations" ADD CONSTRAINT "attempt_evaluations_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "test_attempts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempt_evaluations" ADD CONSTRAINT "attempt_evaluations_evaluationPolicyId_fkey" FOREIGN KEY ("evaluationPolicyId") REFERENCES "evaluation_policies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_recommendation_profiles" ADD CONSTRAINT "course_recommendation_profiles_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_skill_criteria" ADD CONSTRAINT "course_skill_criteria_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "course_recommendation_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_recommendations" ADD CONSTRAINT "course_recommendations_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "test_attempts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_recommendations" ADD CONSTRAINT "course_recommendations_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_recommendations" ADD CONSTRAINT "study_recommendations_learnerId_fkey" FOREIGN KEY ("learnerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_recommendations" ADD CONSTRAINT "study_recommendations_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "enrollments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_recommendations" ADD CONSTRAINT "study_recommendations_sourceAttemptId_fkey" FOREIGN KEY ("sourceAttemptId") REFERENCES "test_attempts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_recommendations" ADD CONSTRAINT "study_recommendations_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "lessons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_recommendations" ADD CONSTRAINT "study_recommendations_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "learning_resources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
