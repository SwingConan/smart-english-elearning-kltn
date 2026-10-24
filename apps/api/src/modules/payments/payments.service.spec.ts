import { ConfigService } from '@nestjs/config';
import { EnrollmentStatus, PaymentStatus, PricingType } from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { PaymentsService } from './payments.service';

describe('PaymentsService', () => {
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
        findFirst: jest
          .fn()
          .mockResolvedValue({
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
});
