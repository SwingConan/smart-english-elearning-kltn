CREATE TABLE "completion_policies" (
  "id" UUID NOT NULL, "classOfferingId" UUID NOT NULL,
  "minLessonCompletionPercent" INTEGER NOT NULL DEFAULT 100, "minAttendancePercent" INTEGER,
  "requireFinalAssessment" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "completion_policies_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "completion_policy_lesson_percent_check" CHECK ("minLessonCompletionPercent" BETWEEN 0 AND 100),
  CONSTRAINT "completion_policy_attendance_percent_check" CHECK ("minAttendancePercent" IS NULL OR "minAttendancePercent" BETWEEN 0 AND 100)
);
CREATE UNIQUE INDEX "completion_policies_classOfferingId_key" ON "completion_policies"("classOfferingId");
ALTER TABLE "completion_policies" ADD CONSTRAINT "completion_policies_classOfferingId_fkey" FOREIGN KEY ("classOfferingId") REFERENCES "class_offerings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "course_completions" (
  "id" UUID NOT NULL, "enrollmentId" UUID NOT NULL, "policyId" UUID,
  "criteriaSnapshot" JSONB NOT NULL, "evidenceSnapshot" JSONB NOT NULL,
  "completedAt" TIMESTAMP(3) NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "course_completions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "course_completions_enrollmentId_key" ON "course_completions"("enrollmentId");
CREATE INDEX "course_completions_policyId_idx" ON "course_completions"("policyId");
ALTER TABLE "course_completions" ADD CONSTRAINT "course_completions_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "enrollments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "course_completions" ADD CONSTRAINT "course_completions_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "completion_policies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "certificates" (
  "id" UUID NOT NULL, "completionId" UUID NOT NULL, "certificateNumber" TEXT NOT NULL,
  "learnerNameSnapshot" TEXT NOT NULL, "learnerEmailSnapshot" TEXT NOT NULL,
  "courseTitleSnapshot" TEXT NOT NULL, "classNameSnapshot" TEXT NOT NULL, "classCodeSnapshot" TEXT NOT NULL,
  "issuedAt" TIMESTAMP(3) NOT NULL, "revokedAt" TIMESTAMP(3), "revokedById" UUID,
  "revokeReason" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "certificates_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "certificates_completionId_key" ON "certificates"("completionId");
CREATE UNIQUE INDEX "certificates_certificateNumber_key" ON "certificates"("certificateNumber");
CREATE INDEX "certificates_issuedAt_idx" ON "certificates"("issuedAt");
CREATE INDEX "certificates_revokedAt_idx" ON "certificates"("revokedAt");
CREATE INDEX "certificates_revokedById_idx" ON "certificates"("revokedById");
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_completionId_fkey" FOREIGN KEY ("completionId") REFERENCES "course_completions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_revokedById_fkey" FOREIGN KEY ("revokedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
