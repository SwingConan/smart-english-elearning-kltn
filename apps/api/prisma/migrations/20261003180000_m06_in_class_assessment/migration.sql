-- M06 widens awarded points so rubric-weighted productive scores are lossless.
ALTER TABLE "test_answers"
ALTER COLUMN "pointsAwarded" TYPE DECIMAL(10, 2)
USING "pointsAwarded"::DECIMAL(10, 2);

-- One current instructor-final judgment per learner answer.
CREATE UNIQUE INDEX "answer_evaluations_instructor_final_key"
ON "answer_evaluations"("testAnswerId")
WHERE "source" = 'INSTRUCTOR' AND "status" = 'REVIEWED_FINAL';

-- Prevent duplicate active scheduling of the same reusable test in one class.
CREATE UNIQUE INDEX "class_assessments_active_assignment_key"
ON "class_assessments"("classOfferingId", "testId")
WHERE "isActive" = true;

-- The legacy full unique key makes attempt numbers collide when one Test is
-- scheduled in multiple ClassAssessment contexts. Replace it with context-safe
-- partial keys. Placement-specific keys from M01 remain unchanged.
DROP INDEX "test_attempts_testId_enrollmentId_attemptNumber_key";
DROP INDEX "test_attempts_class_context_number_key";

CREATE UNIQUE INDEX "test_attempts_class_assessment_attempt_key"
ON "test_attempts"("classAssessmentId", "enrollmentId", "attemptNumber")
WHERE "classAssessmentId" IS NOT NULL AND "enrollmentId" IS NOT NULL;

CREATE UNIQUE INDEX "test_attempts_enrollment_non_class_attempt_key"
ON "test_attempts"("testId", "enrollmentId", "attemptNumber")
WHERE "classAssessmentId" IS NULL AND "enrollmentId" IS NOT NULL;
