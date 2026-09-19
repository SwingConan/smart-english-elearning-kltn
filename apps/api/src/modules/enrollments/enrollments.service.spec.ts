import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  ClassOfferingStatus,
  EnrollmentStatus,
  PricingType,
  Prisma,
} from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { EnrollmentsService } from './enrollments.service';

describe('EnrollmentsService', () => {
  const learnerId = '7784b3a4-95cd-4ba7-a8f2-8fa4ca36dd65';
  const otherLearnerId = '658183f9-4569-424b-8359-da9687c9feea';
  const classOfferingId = 'a45346c7-ab30-438a-96e6-9ba2e09fe969';
  const enrollmentId = '8f83e4fa-544c-419c-9d45-bd03dd5e963e';
  const now = new Date('2026-09-19T12:00:00.000Z');
  const offering = {
    id: classOfferingId,
    status: ClassOfferingStatus.OPEN,
    pricingType: PricingType.FREE,
    maxStudents: null,
    enrollmentStart: null,
    enrollmentEnd: null,
    course: { isPublished: true },
  };
  const transaction = {
    classOffering: { findUnique: jest.fn() },
    enrollment: {
      findUnique: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
    },
  };
  const prisma = {
    $transaction: jest.fn(),
    enrollment: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
  };
  const service = new EnrollmentsService(prisma as unknown as PrismaService);

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(now);
    jest.clearAllMocks();
    transaction.classOffering.findUnique.mockResolvedValue(offering);
    transaction.enrollment.findUnique.mockResolvedValue(null);
    transaction.enrollment.count.mockResolvedValue(0);
    transaction.enrollment.create.mockImplementation(({ data }) =>
      Promise.resolve({
        id: enrollmentId,
        status: data.status,
        enrolledAt: now,
        classOffering: { id: classOfferingId },
      }),
    );
    prisma.$transaction.mockImplementation(
      (callback: (client: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('creates FREE enrollment as ACTIVE in a Serializable transaction', async () => {
    await expect(
      service.create(learnerId, { classOfferingId }),
    ).resolves.toMatchObject({ status: EnrollmentStatus.ACTIVE });

    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
    expect(transaction.enrollment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          learnerId,
          classOfferingId,
          status: EnrollmentStatus.ACTIVE,
        },
      }),
    );
  });

  it('creates PAID enrollment as PENDING_PAYMENT without reserving capacity', async () => {
    transaction.classOffering.findUnique.mockResolvedValue({
      ...offering,
      pricingType: PricingType.PAID,
      maxStudents: 1,
    });

    await expect(
      service.create(learnerId, { classOfferingId }),
    ).resolves.toMatchObject({ status: EnrollmentStatus.PENDING_PAYMENT });
    expect(transaction.enrollment.count).not.toHaveBeenCalled();
  });

  it('rejects a duplicate enrollment with 409', async () => {
    transaction.enrollment.findUnique.mockResolvedValue({ id: enrollmentId });

    await expect(
      service.create(learnerId, { classOfferingId }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('maps a database unique race to 409', async () => {
    transaction.enrollment.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '7.10.0',
      }),
    );

    await expect(
      service.create(learnerId, { classOfferingId }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('returns 404 when the offering does not exist', async () => {
    transaction.classOffering.findUnique.mockResolvedValue(null);

    await expect(
      service.create(learnerId, { classOfferingId }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects an offering that is not OPEN', async () => {
    transaction.classOffering.findUnique.mockResolvedValue({
      ...offering,
      status: ClassOfferingStatus.DRAFT,
    });

    await expect(
      service.create(learnerId, { classOfferingId }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an offering for an unpublished course', async () => {
    transaction.classOffering.findUnique.mockResolvedValue({
      ...offering,
      course: { isPublished: false },
    });

    await expect(
      service.create(learnerId, { classOfferingId }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects enrollment before the inclusive start boundary', async () => {
    transaction.classOffering.findUnique.mockResolvedValue({
      ...offering,
      enrollmentStart: new Date(now.getTime() + 1),
    });

    await expect(
      service.create(learnerId, { classOfferingId }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects enrollment after the inclusive end boundary', async () => {
    transaction.classOffering.findUnique.mockResolvedValue({
      ...offering,
      enrollmentEnd: new Date(now.getTime() - 1),
    });

    await expect(
      service.create(learnerId, { classOfferingId }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepts enrollment exactly at start and end boundaries', async () => {
    transaction.classOffering.findUnique.mockResolvedValue({
      ...offering,
      enrollmentStart: now,
      enrollmentEnd: now,
    });

    await expect(
      service.create(learnerId, { classOfferingId }),
    ).resolves.toMatchObject({ status: EnrollmentStatus.ACTIVE });
  });

  it('treats null maxStudents as unlimited', async () => {
    await service.create(learnerId, { classOfferingId });
    expect(transaction.enrollment.count).not.toHaveBeenCalled();
  });

  it('creates when ACTIVE capacity remains and counts only ACTIVE rows', async () => {
    transaction.classOffering.findUnique.mockResolvedValue({
      ...offering,
      maxStudents: 2,
    });
    transaction.enrollment.count.mockResolvedValue(1);

    await service.create(learnerId, { classOfferingId });
    expect(transaction.enrollment.count).toHaveBeenCalledWith({
      where: {
        classOfferingId,
        status: EnrollmentStatus.ACTIVE,
      },
    });
  });

  it('rejects a full class with 409', async () => {
    transaction.classOffering.findUnique.mockResolvedValue({
      ...offering,
      maxStudents: 1,
    });
    transaction.enrollment.count.mockResolvedValue(1);

    await expect(
      service.create(learnerId, { classOfferingId }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('retries a serialization conflict with a bounded attempt', async () => {
    const serializationError = new Prisma.PrismaClientKnownRequestError(
      'Transaction conflict',
      { code: 'P2034', clientVersion: '7.10.0' },
    );
    prisma.$transaction
      .mockRejectedValueOnce(serializationError)
      .mockImplementationOnce(
        (callback: (client: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      );

    await expect(
      service.create(learnerId, { classOfferingId }),
    ).resolves.toMatchObject({ status: EnrollmentStatus.ACTIVE });
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it('stops after three serialization-conflict attempts', async () => {
    prisma.$transaction.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Transaction conflict', {
        code: 'P2034',
        clientVersion: '7.10.0',
      }),
    );

    await expect(
      service.create(learnerId, { classOfferingId }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.$transaction).toHaveBeenCalledTimes(3);
  });

  it('lists only the current learner enrollments', async () => {
    prisma.enrollment.findMany.mockResolvedValue([]);

    await service.listMine(learnerId);
    expect(prisma.enrollment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { learnerId } }),
    );
  });

  it('returns 404 instead of exposing another learner enrollment', async () => {
    prisma.enrollment.findFirst.mockResolvedValue(null);

    await expect(
      service.getMineById(otherLearnerId, enrollmentId),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.enrollment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: enrollmentId, learnerId: otherLearnerId },
      }),
    );
  });
});
