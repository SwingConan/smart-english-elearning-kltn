import { ClassOfferingStatus, EnrollmentStatus } from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { CertificatesService } from './certificates.service';

describe('CertificatesService authoritative issuance', () => {
  function harness(initialStatus: EnrollmentStatus = EnrollmentStatus.ACTIVE) {
    let status = initialStatus;
    let completion: { id: string; enrollmentId: string; certificate?: { id: string } } | null =
      null;
    const enrollmentRow = () => ({
      id: 'enrollment',
      status,
      learner: { fullName: 'Nguyễn Văn A', email: 'a@example.com' },
      lessonProgress: [],
      attendanceRecords: [],
      courseCompletion: completion,
      classOffering: {
        id: 'class',
        name: 'Lớp A',
        code: 'A01',
        status: ClassOfferingStatus.COMPLETED,
        course: { title: 'TOEIC', modules: [] },
        completionPolicy: {
          id: 'policy',
          minLessonCompletionPercent: 100,
          minAttendancePercent: null,
          requireFinalAssessment: false,
        },
        attendanceSessions: [],
        classAssessments: [],
      },
    });
    const tx = {
      $queryRaw: jest.fn(),
      enrollment: {
        findFirst: jest.fn().mockImplementation(() => Promise.resolve(enrollmentRow())),
        updateMany: jest.fn().mockImplementation(() => {
          if (status !== EnrollmentStatus.ACTIVE) return Promise.resolve({ count: 0 });
          status = EnrollmentStatus.COMPLETED;
          return Promise.resolve({ count: 1 });
        }),
      },
      courseCompletion: {
        create: jest.fn().mockImplementation(({ data }) => {
          completion = { id: 'completion', enrollmentId: data.enrollmentId };
          return Promise.resolve(completion);
        }),
      },
      certificate: {
        create: jest.fn().mockImplementation(() => {
          const certificate = { id: 'certificate' };
          if (completion) completion.certificate = certificate;
          return Promise.resolve(certificate);
        }),
      },
    };
    let transactionQueue = Promise.resolve<unknown>(undefined);
    const prisma = {
      enrollment: {
        findFirst: jest.fn().mockImplementation(() => Promise.resolve(enrollmentRow())),
      },
      courseCompletion: {
        findUnique: jest.fn().mockImplementation(() => Promise.resolve(completion)),
      },
      $transaction: jest.fn((callback: (client: typeof tx) => Promise<unknown>) => {
        const result = transactionQueue.then(() => callback(tx));
        transactionQueue = result.catch(() => undefined);
        return result;
      }),
    };
    return {
      service: new CertificatesService(prisma as unknown as PrismaService),
      tx,
      setStatus: (value: EnrollmentStatus) => {
        status = value;
      },
    };
  }

  it('issues once for an eligible ACTIVE enrollment and remains idempotent after success', async () => {
    const { service, tx } = harness();
    const first = await service.evaluate('learner', 'enrollment');
    const repeated = await service.evaluate('learner', 'enrollment');
    expect(first.completion?.certificate).toEqual({ id: 'certificate' });
    expect(repeated.completion?.certificate).toEqual({ id: 'certificate' });
    expect(tx.enrollment.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.courseCompletion.create).toHaveBeenCalledTimes(1);
    expect(tx.certificate.create).toHaveBeenCalledTimes(1);
  });

  it.each([EnrollmentStatus.DROPPED, EnrollmentStatus.CANCELLED])(
    'does not issue for an otherwise eligible %s enrollment',
    async (status) => {
      const { service, tx } = harness(status);
      const result = await service.evaluate('learner', 'enrollment');
      expect(result.eligible).toBe(false);
      expect(result.unmet).toContain('ENROLLMENT_NOT_ACTIVE');
      expect(tx.courseCompletion.create).not.toHaveBeenCalled();
      expect(tx.certificate.create).not.toHaveBeenCalled();
    },
  );

  it('re-reads status after the row lock and refuses issuance when enrollment became non-ACTIVE', async () => {
    const { service, tx, setStatus } = harness();
    tx.$queryRaw.mockImplementationOnce(() => {
      setStatus(EnrollmentStatus.DROPPED);
    });
    const result = await service.evaluate('learner', 'enrollment');
    expect(result.unmet).toContain('ENROLLMENT_NOT_ACTIVE');
    expect(tx.enrollment.updateMany).not.toHaveBeenCalled();
    expect(tx.courseCompletion.create).not.toHaveBeenCalled();
  });

  it('serializes concurrent evaluations into one completion and certificate', async () => {
    const { service, tx } = harness();
    const [first, second] = await Promise.all([
      service.evaluate('learner', 'enrollment'),
      service.evaluate('learner', 'enrollment'),
    ]);
    expect(first.completion).toBeTruthy();
    expect(second.completion).toBeTruthy();
    expect(tx.courseCompletion.create).toHaveBeenCalledTimes(1);
    expect(tx.certificate.create).toHaveBeenCalledTimes(1);
  });
});
