CREATE TYPE "ConsultationStatus" AS ENUM ('REQUESTED', 'CONFIRMED', 'COMPLETED', 'DECLINED', 'CANCELLED');
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'LATE', 'EXCUSED');

CREATE TABLE "consultation_requests" (
  "id" UUID NOT NULL, "enrollmentId" UUID NOT NULL, "instructorId" UUID NOT NULL,
  "status" "ConsultationStatus" NOT NULL DEFAULT 'REQUESTED', "topic" TEXT NOT NULL,
  "learnerNote" TEXT, "instructorNote" TEXT, "requestedStartAt" TIMESTAMP(3) NOT NULL,
  "confirmedStartAt" TIMESTAMP(3), "durationMinutes" INTEGER NOT NULL, "meetingUrl" TEXT,
  "declineReason" TEXT, "cancelledAt" TIMESTAMP(3), "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "consultation_requests_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "consultation_requests_enrollmentId_status_idx" ON "consultation_requests"("enrollmentId", "status");
CREATE INDEX "consultation_requests_instructorId_status_idx" ON "consultation_requests"("instructorId", "status");
CREATE INDEX "consultation_requests_requestedStartAt_idx" ON "consultation_requests"("requestedStartAt");
CREATE INDEX "consultation_requests_confirmedStartAt_idx" ON "consultation_requests"("confirmedStartAt");
ALTER TABLE "consultation_requests" ADD CONSTRAINT "consultation_requests_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "enrollments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "consultation_requests" ADD CONSTRAINT "consultation_requests_instructorId_fkey" FOREIGN KEY ("instructorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "attendance_sessions" (
  "id" UUID NOT NULL, "classOfferingId" UUID NOT NULL, "scheduleSlotId" UUID,
  "sessionDate" DATE NOT NULL, "title" TEXT, "note" TEXT, "createdById" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "attendance_sessions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "attendance_sessions_classOfferingId_sessionDate_idx" ON "attendance_sessions"("classOfferingId", "sessionDate");
CREATE INDEX "attendance_sessions_scheduleSlotId_idx" ON "attendance_sessions"("scheduleSlotId");
CREATE INDEX "attendance_sessions_createdById_idx" ON "attendance_sessions"("createdById");
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_classOfferingId_fkey" FOREIGN KEY ("classOfferingId") REFERENCES "class_offerings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_scheduleSlotId_fkey" FOREIGN KEY ("scheduleSlotId") REFERENCES "class_schedule_slots"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "attendance_records" (
  "id" UUID NOT NULL, "attendanceSessionId" UUID NOT NULL, "enrollmentId" UUID NOT NULL,
  "status" "AttendanceStatus" NOT NULL, "note" TEXT, "recordedById" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "attendance_records_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "attendance_records_attendanceSessionId_enrollmentId_key" ON "attendance_records"("attendanceSessionId", "enrollmentId");
CREATE INDEX "attendance_records_enrollmentId_status_idx" ON "attendance_records"("enrollmentId", "status");
CREATE INDEX "attendance_records_recordedById_idx" ON "attendance_records"("recordedById");
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_attendanceSessionId_fkey" FOREIGN KEY ("attendanceSessionId") REFERENCES "attendance_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "enrollments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
