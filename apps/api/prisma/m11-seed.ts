import {
  AttendanceStatus,
  ConsultationStatus,
  EnrollmentStatus,
  PaymentStatus,
  PrismaClient,
} from '../src/generated/prisma/client';

export async function seedM11(
  prisma: PrismaClient,
  input: {
    studentId: string;
    instructorId: string;
    classOfferingId: string;
    activeEnrollmentId: string;
    paidEnrollmentId: string;
  },
) {
  await prisma.tuitionPayment.upsert({
    where: { referenceCode: 'SMARTENGLISH-DEMO-M11' },
    update: {
      status: PaymentStatus.SUBMITTED,
      amountVnd: 1_500_000,
      submittedAt: new Date('2026-10-24T03:00:00Z'),
    },
    create: {
      id: 'b1100000-0000-4000-8000-000000000001',
      enrollmentId: input.paidEnrollmentId,
      status: PaymentStatus.SUBMITTED,
      amountVnd: 1_500_000,
      referenceCode: 'SMARTENGLISH-DEMO-M11',
      payerReference: 'VCB-DEMO-20261024',
      submittedAt: new Date('2026-10-24T03:00:00Z'),
    },
  });
  await prisma.consultationRequest.upsert({
    where: { id: 'b1200000-0000-4000-8000-000000000001' },
    update: { status: ConsultationStatus.REQUESTED },
    create: {
      id: 'b1200000-0000-4000-8000-000000000001',
      enrollmentId: input.activeEnrollmentId,
      instructorId: input.instructorId,
      status: ConsultationStatus.REQUESTED,
      topic: 'Kế hoạch cải thiện kỹ năng Listening',
      learnerNote: 'Em cần góp ý cho lịch tự học tuần tới.',
      requestedStartAt: new Date('2026-11-02T12:00:00Z'),
      durationMinutes: 30,
    },
  });
  const session = await prisma.attendanceSession.upsert({
    where: { id: 'b1300000-0000-4000-8000-000000000001' },
    update: { title: 'Buổi học M11 mẫu' },
    create: {
      id: 'b1300000-0000-4000-8000-000000000001',
      classOfferingId: input.classOfferingId,
      sessionDate: new Date('2026-10-20T00:00:00Z'),
      title: 'Buổi học M11 mẫu',
      createdById: input.instructorId,
    },
  });
  await prisma.attendanceRecord.upsert({
    where: {
      attendanceSessionId_enrollmentId: {
        attendanceSessionId: session.id,
        enrollmentId: input.activeEnrollmentId,
      },
    },
    update: { status: AttendanceStatus.PRESENT, recordedById: input.instructorId },
    create: {
      attendanceSessionId: session.id,
      enrollmentId: input.activeEnrollmentId,
      status: AttendanceStatus.PRESENT,
      recordedById: input.instructorId,
    },
  });
  await prisma.completionPolicy.upsert({
    where: { classOfferingId: input.classOfferingId },
    update: {
      minLessonCompletionPercent: 100,
      minAttendancePercent: 80,
      requireFinalAssessment: true,
    },
    create: {
      id: 'b1400000-0000-4000-8000-000000000001',
      classOfferingId: input.classOfferingId,
      minLessonCompletionPercent: 100,
      minAttendancePercent: 80,
      requireFinalAssessment: true,
    },
  });
  await prisma.rubric.upsert({
    where: { id: 'b1500000-0000-4000-8000-000000000001' },
    update: { createdById: input.instructorId, isActive: true },
    create: {
      id: 'b1500000-0000-4000-8000-000000000001',
      name: 'M11 Speaking clarity',
      description: 'Rubric thuộc giảng viên để thử nghiệm CRUD.',
      createdById: input.instructorId,
      criteria: {
        create: [{ code: 'CLARITY', name: 'Độ rõ ràng', orderIndex: 0, maxScore: 10, weight: 1 }],
      },
    },
  });
  await prisma.enrollment.updateMany({
    where: { id: input.activeEnrollmentId },
    data: { status: EnrollmentStatus.ACTIVE },
  });
}
