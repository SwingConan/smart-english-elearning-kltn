-- CreateTable
CREATE TABLE "course_adaptive_policies" (
    "id" UUID NOT NULL,
    "courseId" UUID NOT NULL,
    "remedialThreshold" DOUBLE PRECISION NOT NULL DEFAULT 0.4,
    "progressionThreshold" DOUBLE PRECISION NOT NULL DEFAULT 0.8,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "course_adaptive_policies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "course_adaptive_policies_courseId_key" ON "course_adaptive_policies"("courseId");

-- AddForeignKey
ALTER TABLE "course_adaptive_policies" ADD CONSTRAINT "course_adaptive_policies_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
