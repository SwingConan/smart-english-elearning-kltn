CREATE TYPE "AttendanceRecordSource" AS ENUM ('INSTRUCTOR', 'SELF_CHECK_IN');

ALTER TABLE "users" ADD COLUMN "avatarKey" VARCHAR(128);

CREATE TABLE "consultation_threads" (
  "id" UUID NOT NULL,
  "enrollmentId" UUID NOT NULL,
  "learnerLastReadAt" TIMESTAMP(3),
  "instructorLastReadAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "consultation_threads_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "consultation_messages" (
  "id" UUID NOT NULL,
  "threadId" UUID NOT NULL,
  "senderId" UUID NOT NULL,
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "consultation_messages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "consultation_threads_enrollmentId_key" ON "consultation_threads"("enrollmentId");
CREATE INDEX "consultation_messages_threadId_createdAt_idx" ON "consultation_messages"("threadId", "createdAt");
CREATE INDEX "consultation_messages_senderId_idx" ON "consultation_messages"("senderId");

ALTER TABLE "consultation_threads" ADD CONSTRAINT "consultation_threads_enrollmentId_fkey"
  FOREIGN KEY ("enrollmentId") REFERENCES "enrollments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "consultation_messages" ADD CONSTRAINT "consultation_messages_threadId_fkey"
  FOREIGN KEY ("threadId") REFERENCES "consultation_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "consultation_messages" ADD CONSTRAINT "consultation_messages_senderId_fkey"
  FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "attendance_sessions"
  ADD COLUMN "opensAt" TIMESTAMP(3),
  ADD COLUMN "closesAt" TIMESTAMP(3),
  ADD COLUMN "selfCheckInEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "accessCodeHash" VARCHAR(255),
  ADD COLUMN "closedAt" TIMESTAMP(3);

ALTER TABLE "attendance_records"
  ADD COLUMN "source" "AttendanceRecordSource" NOT NULL DEFAULT 'INSTRUCTOR',
  ADD COLUMN "checkedInAt" TIMESTAMP(3);

