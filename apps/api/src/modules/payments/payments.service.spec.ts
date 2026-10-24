import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { EnrollmentStatus, PaymentStatus, PricingType } from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { validate } from 'class-validator';
import { RejectPaymentDto } from './dto/payment.dto';
import { PaymentsService } from './payments.service';

describe('PaymentsService', () => {
  it('rejects an empty or whitespace-only rejection reason at validation', async () => {
    const dto = Object.assign(new RejectPaymentDto(), { reason: '   ' });
    await expect(validate(dto)).resolves.not.toHaveLength(0);
  });

  it('persists the exact rejection reason without changing enrollment status', async () => {
    const prisma = {
      tuitionPayment: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn().mockResolvedValue({
          id: 'payment',
          status: PaymentStatus.REJECTED,
          adminNote: 'Không tìm thấy giao dịch VCB #123',
          enrollment: { status: EnrollmentStatus.PENDING_PAYMENT },
        }),
      },
      enrollment: { updateMany: jest.fn() },
    };
    const service = new PaymentsService(
      prisma as unknown as PrismaService,
      { get: jest.fn() } as unknown as ConfigService,
    );
    await expect(
      service.reject('admin', 'payment', { reason: 'Không tìm thấy giao dịch VCB #123' }),
    ).resolves.toMatchObject({
      adminNote: 'Không tìm thấy giao dịch VCB #123',
      enrollment: { status: EnrollmentStatus.PENDING_PAYMENT },
    });
    expect(prisma.tuitionPayment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ adminNote: 'Không tìm thấy giao dịch VCB #123' }),
      }),
    );
    expect(prisma.enrollment.updateMany).not.toHaveBeenCalled();
  });

  it('keeps a second verification idempotent and activates the enrollment once', async () => {
    const payment: {
      id: string;
      status: PaymentStatus;
      amountVnd: number;
      enrollment: {
        id: string;
        status: EnrollmentStatus;
        tuitionFeeVndSnapshot: number;
        pricingTypeSnapshot: PricingType;
        classOffering: { id: string; maxStudents: number };
      };
    } = {
      id: '10000000-0000-4000-8000-000000000001',
      status: PaymentStatus.SUBMITTED,
      amountVnd: 1_500_000,
      enrollment: {
        id: 'enrollment',
        status: EnrollmentStatus.PENDING_PAYMENT,
        tuitionFeeVndSnapshot: 1_500_000,
        pricingTypeSnapshot: PricingType.PAID,
        classOffering: { id: 'class', maxStudents: 20 },
      },
    };
    const tx = {
      $queryRaw: jest.fn(),
      tuitionPayment: {
        findUnique: jest.fn().mockImplementation(() => Promise.resolve(payment)),
        updateMany: jest.fn().mockImplementation(() => {
          payment.status = PaymentStatus.VERIFIED;
          return Promise.resolve({ count: 1 });
        }),
        findUniqueOrThrow: jest.fn().mockImplementation(() => Promise.resolve(payment)),
      },
      enrollment: {
        count: jest.fn().mockResolvedValue(1),
        updateMany: jest.fn().mockImplementation(() => {
          payment.enrollment.status = EnrollmentStatus.ACTIVE;
          return Promise.resolve({ count: 1 });
        }),
      },
    };
    const prisma = { $transaction: jest.fn((callback) => callback(tx)) };
    const service = new PaymentsService(
      prisma as unknown as PrismaService,
      { get: jest.fn() } as unknown as ConfigService,
    );
    await expect(service.verify('admin', payment.id, {})).resolves.toMatchObject({
      status: PaymentStatus.VERIFIED,
    });
    await expect(service.verify('admin', payment.id, {})).resolves.toMatchObject({
      status: PaymentStatus.VERIFIED,
    });
    expect(tx.enrollment.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.tuitionPayment.updateMany).toHaveBeenCalledTimes(1);
  });

  it('never trusts a client amount when creating a payment', async () => {
    const prisma = {
      enrollment: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'enrollment',
          status: EnrollmentStatus.PENDING_PAYMENT,
          pricingTypeSnapshot: PricingType.PAID,
          tuitionFeeVndSnapshot: 2_000_000,
        }),
      },
      tuitionPayment: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve(data)),
      },
    };
    const config = {
      get: jest.fn(
        (key: string) =>
          ({
            PAYMENT_BANK_NAME: 'Bank',
            PAYMENT_BANK_ACCOUNT: '123',
            PAYMENT_BANK_ACCOUNT_NAME: 'SMART ENGLISH',
          })[key],
      ),
    };
    const service = new PaymentsService(
      prisma as unknown as PrismaService,
      config as unknown as ConfigService,
    );
    await service.create('learner', 'enrollment');
    expect(prisma.tuitionPayment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ amountVnd: 2_000_000 }) }),
    );
  });

  it('allows a new request when rejected history has no actionable payment', async () => {
    const prisma = {
      enrollment: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'enrollment',
          status: EnrollmentStatus.PENDING_PAYMENT,
          pricingTypeSnapshot: PricingType.PAID,
          tuitionFeeVndSnapshot: 900_000,
        }),
      },
      tuitionPayment: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'new', status: PaymentStatus.PENDING }),
      },
    };
    const config = {
      get: jest.fn(
        (key: string) =>
          ({
            PAYMENT_BANK_NAME: 'Bank',
            PAYMENT_BANK_ACCOUNT: '123',
            PAYMENT_BANK_ACCOUNT_NAME: 'SMART ENGLISH',
          })[key],
      ),
    };
    const service = new PaymentsService(
      prisma as unknown as PrismaService,
      config as unknown as ConfigService,
    );
    await expect(service.create('learner', 'enrollment')).resolves.toMatchObject({ id: 'new' });
    expect(prisma.tuitionPayment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { in: [PaymentStatus.PENDING, PaymentStatus.SUBMITTED] },
        }),
      }),
    );
  });

  it('returns enrollment pricing and class context when payment history is empty', async () => {
    const enrollment = {
      id: 'enrollment',
      status: EnrollmentStatus.PENDING_PAYMENT,
      pricingTypeSnapshot: PricingType.PAID,
      tuitionFeeVndSnapshot: 1_200_000,
      classOffering: {
        id: 'class-b',
        code: 'B02',
        name: 'Lớp B',
        course: { id: 'course', title: 'TOEIC 650' },
      },
    };
    const prisma = {
      enrollment: { findFirst: jest.fn().mockResolvedValue(enrollment) },
      tuitionPayment: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new PaymentsService(
      prisma as unknown as PrismaService,
      { get: jest.fn() } as unknown as ConfigService,
    );
    await expect(service.listMine('learner', 'enrollment')).resolves.toEqual({
      data: [],
      bank: null,
      enrollment,
    });
  });

  it('loads bounded authoritative class options independently of the current payment page', async () => {
    const options = [
      { id: 'class-a', code: 'A01', name: 'Lớp A' },
      { id: 'class-b', code: 'B02', name: 'Lớp B' },
    ];
    const prisma = { classOffering: { findMany: jest.fn().mockResolvedValue(options) } };
    const service = new PaymentsService(
      prisma as unknown as PrismaService,
      { get: jest.fn() } as unknown as ConfigService,
    );
    await expect(service.listAdminFilterOptions()).resolves.toEqual(options);
    expect(prisma.classOffering.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 500, select: { id: true, code: true, name: true } }),
    );
  });
});
