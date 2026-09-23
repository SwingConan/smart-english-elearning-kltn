-- CreateTable
CREATE TABLE "skills" (
    "id" UUID NOT NULL,
    "courseId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "pInit" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "pLearn" DOUBLE PRECISION NOT NULL DEFAULT 0.1,
    "pGuess" DOUBLE PRECISION NOT NULL DEFAULT 0.2,
    "pSlip" DOUBLE PRECISION NOT NULL DEFAULT 0.1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skill_prerequisites" (
    "id" UUID NOT NULL,
    "skillId" UUID NOT NULL,
    "prerequisiteSkillId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "skill_prerequisites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_skills" (
    "id" UUID NOT NULL,
    "questionId" UUID NOT NULL,
    "skillId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "question_skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lesson_skills" (
    "id" UUID NOT NULL,
    "lessonId" UUID NOT NULL,
    "skillId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lesson_skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learner_skill_states" (
    "id" UUID NOT NULL,
    "enrollmentId" UUID NOT NULL,
    "skillId" UUID NOT NULL,
    "masteryProbability" DOUBLE PRECISION NOT NULL,
    "observationCount" INTEGER NOT NULL DEFAULT 0,
    "lastObservedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "learner_skill_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mastery_history" (
    "id" UUID NOT NULL,
    "enrollmentId" UUID NOT NULL,
    "skillId" UUID NOT NULL,
    "testAttemptId" UUID NOT NULL,
    "testAnswerId" UUID NOT NULL,
    "isCorrect" BOOLEAN NOT NULL,
    "priorMastery" DOUBLE PRECISION NOT NULL,
    "evidencePosterior" DOUBLE PRECISION NOT NULL,
    "posteriorMastery" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mastery_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "skills_courseId_code_key" ON "skills"("courseId", "code");

-- CreateIndex
CREATE INDEX "skill_prerequisites_prerequisiteSkillId_idx" ON "skill_prerequisites"("prerequisiteSkillId");

-- CreateIndex
CREATE UNIQUE INDEX "skill_prerequisites_skillId_prerequisiteSkillId_key" ON "skill_prerequisites"("skillId", "prerequisiteSkillId");

-- CreateIndex
CREATE INDEX "question_skills_skillId_idx" ON "question_skills"("skillId");

-- CreateIndex
CREATE UNIQUE INDEX "question_skills_questionId_skillId_key" ON "question_skills"("questionId", "skillId");

-- CreateIndex
CREATE INDEX "lesson_skills_skillId_idx" ON "lesson_skills"("skillId");

-- CreateIndex
CREATE UNIQUE INDEX "lesson_skills_lessonId_skillId_key" ON "lesson_skills"("lessonId", "skillId");

-- CreateIndex
CREATE INDEX "learner_skill_states_skillId_idx" ON "learner_skill_states"("skillId");

-- CreateIndex
CREATE UNIQUE INDEX "learner_skill_states_enrollmentId_skillId_key" ON "learner_skill_states"("enrollmentId", "skillId");

-- CreateIndex
CREATE INDEX "mastery_history_enrollmentId_skillId_createdAt_idx" ON "mastery_history"("enrollmentId", "skillId", "createdAt");

-- CreateIndex
CREATE INDEX "mastery_history_skillId_idx" ON "mastery_history"("skillId");

-- CreateIndex
CREATE INDEX "mastery_history_testAttemptId_idx" ON "mastery_history"("testAttemptId");

-- CreateIndex
CREATE UNIQUE INDEX "mastery_history_testAnswerId_skillId_key" ON "mastery_history"("testAnswerId", "skillId");

-- AddForeignKey
ALTER TABLE "skills" ADD CONSTRAINT "skills_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skill_prerequisites" ADD CONSTRAINT "skill_prerequisites_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "skills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skill_prerequisites" ADD CONSTRAINT "skill_prerequisites_prerequisiteSkillId_fkey" FOREIGN KEY ("prerequisiteSkillId") REFERENCES "skills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_skills" ADD CONSTRAINT "question_skills_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_skills" ADD CONSTRAINT "question_skills_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "skills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_skills" ADD CONSTRAINT "lesson_skills_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "lessons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_skills" ADD CONSTRAINT "lesson_skills_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "skills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learner_skill_states" ADD CONSTRAINT "learner_skill_states_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "enrollments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learner_skill_states" ADD CONSTRAINT "learner_skill_states_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "skills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mastery_history" ADD CONSTRAINT "mastery_history_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "enrollments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mastery_history" ADD CONSTRAINT "mastery_history_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "skills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mastery_history" ADD CONSTRAINT "mastery_history_testAttemptId_fkey" FOREIGN KEY ("testAttemptId") REFERENCES "test_attempts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mastery_history" ADD CONSTRAINT "mastery_history_testAnswerId_fkey" FOREIGN KEY ("testAnswerId") REFERENCES "test_answers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
