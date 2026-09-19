-- CreateEnum
CREATE TYPE "ClassOfferingStatus" AS ENUM ('DRAFT', 'OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PricingType" AS ENUM ('FREE', 'PAID');

-- CreateEnum
CREATE TYPE "EnrollmentStatus" AS ENUM ('ACTIVE', 'PENDING_PAYMENT', 'COMPLETED', 'DROPPED', 'CANCELLED');

-- CreateTable
CREATE TABLE "user_sessions" (
    "sid" VARCHAR NOT NULL,
    "sess" JSONB NOT NULL,
    "expire" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("sid")
);

-- CreateTable
CREATE TABLE "courses" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_offerings" (
    "id" UUID NOT NULL,
    "courseId" UUID NOT NULL,
    "instructorId" UUID,
    "name" TEXT NOT NULL,
    "status" "ClassOfferingStatus" NOT NULL DEFAULT 'DRAFT',
    "pricingType" "PricingType" NOT NULL DEFAULT 'FREE',
    "tuitionFeeVnd" INTEGER,
    "maxStudents" INTEGER,
    "enrollmentStart" TIMESTAMP(3),
    "enrollmentEnd" TIMESTAMP(3),
    "classStart" TIMESTAMP(3),
    "classEnd" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "class_offerings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enrollments" (
    "id" UUID NOT NULL,
    "learnerId" UUID NOT NULL,
    "classOfferingId" UUID NOT NULL,
    "status" "EnrollmentStatus" NOT NULL,
    "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_sessions_expire_idx" ON "user_sessions"("expire");

-- CreateIndex
CREATE UNIQUE INDEX "courses_slug_key" ON "courses"("slug");

-- CreateIndex
CREATE INDEX "courses_isPublished_idx" ON "courses"("isPublished");

-- CreateIndex
CREATE INDEX "courses_level_idx" ON "courses"("level");

-- CreateIndex
CREATE INDEX "class_offerings_courseId_idx" ON "class_offerings"("courseId");

-- CreateIndex
CREATE INDEX "class_offerings_status_idx" ON "class_offerings"("status");

-- CreateIndex
CREATE INDEX "class_offerings_instructorId_idx" ON "class_offerings"("instructorId");

-- CreateIndex
CREATE INDEX "enrollments_learnerId_idx" ON "enrollments"("learnerId");

-- CreateIndex
CREATE INDEX "enrollments_classOfferingId_idx" ON "enrollments"("classOfferingId");

-- CreateIndex
CREATE INDEX "enrollments_classOfferingId_status_idx" ON "enrollments"("classOfferingId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "enrollments_learnerId_classOfferingId_key" ON "enrollments"("learnerId", "classOfferingId");

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_offerings" ADD CONSTRAINT "class_offerings_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_offerings" ADD CONSTRAINT "class_offerings_instructorId_fkey" FOREIGN KEY ("instructorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_learnerId_fkey" FOREIGN KEY ("learnerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_classOfferingId_fkey" FOREIGN KEY ("classOfferingId") REFERENCES "class_offerings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
