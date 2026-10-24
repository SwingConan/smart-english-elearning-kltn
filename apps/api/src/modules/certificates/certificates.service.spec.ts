import { EnrollmentStatus } from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { CertificatesService } from './certificates.service';

describe('CertificatesService', () => {
  it('creates one completion and certificate across repeated evaluation', async () => {
    let stored: { id: string; enrollmentId: string; certificate?: { id: string } } | null = null;
    const tx = {
      $queryRaw: jest.fn(),
      courseCompletion: {
        findUnique: jest.fn().mockImplementation(() => Promise.resolve(stored)),
        create: jest.fn().mockImplementation(({ data }) => {
          stored = { id: 'completion', enrollmentId: data.enrollmentId };
          return Promise.resolve(stored);
        }),
      },
      enrollment: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      certificate: {
        create: jest.fn().mockImplementation(() => {
          const certificate = { id: 'certificate' };
          if (stored) stored.certificate = certificate;
          return Promise.resolve(certificate);
        }),
      },
    };
    const prisma = {
      $transaction: jest.fn((callback) => callback(tx)),
      courseCompletion: { findUnique: jest.fn() },
    };
    const service = new CertificatesService(prisma as unknown as PrismaService);
    jest.spyOn(service, 'readiness').mockResolvedValue({
      enrollment: {
        id: 'enrollment',
        status: EnrollmentStatus.ACTIVE,
        learner: { fullName: 'Nguyễn Văn A', email: 'a@example.com' },
        classOffering: {
          id: 'class',
          name: 'Lớp A',
          code: 'A01',
          status: 'COMPLETED',
          course: { title: 'TOEIC' },
        },
      },
      policy: {
        id: 'policy',
        minLessonCompletionPercent: 100,
        minAttendancePercent: null,
        requireFinalAssessment: true,
      },
      evidence: {
        lesson: { total: 1, completed: 1, percent: 100 },
        attendance: {
          totalSessions: 0,
          markedSessions: 0,
          attendedSessions: 0,
          coverageComplete: true,
          percent: null,
        },
        finalAssessment: { activeCount: 1, satisfied: true },
      },
      eligible: true,
      unmet: [],
      completion: null,
    } as never);
    await service.evaluate('learner', 'enrollment');
    await service.evaluate('learner', 'enrollment');
    expect(tx.courseCompletion.create).toHaveBeenCalledTimes(1);
    expect(tx.certificate.create).toHaveBeenCalledTimes(1);
  });
});
