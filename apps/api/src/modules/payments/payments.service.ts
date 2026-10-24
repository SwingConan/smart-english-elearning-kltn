import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import {
  EnrollmentStatus,
  PaymentStatus,
  PricingType,
  Prisma,
} from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import {
  PaymentQueryDto,
  RejectPaymentDto,
  ReviewPaymentDto,
  SubmitPaymentDto,
} from './dto/payment.dto';

const paymentInclude = {
  enrollment: {
    select: {
      id: true,
      status: true,
      learnerId: true,
      pricingTypeSnapshot: true,
      tuitionFeeVndSnapshot: true,
      learner: { select: { fullName: true, email: true } },
      classOffering: { select: { id: true, name: true, code: true, maxStudents: true } },
    },
  },
} satisfies Prisma.TuitionPaymentInclude;

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async create(learnerId: string, enrollmentId: string) {
    const bank = this.bankInstructions();
    const enrollment = await this.requireOwnedEnrollment(learnerId, enrollmentId);
    if (enrollment.pricingTypeSnapshot !== PricingType.PAID || !enrollment.tuitionFeeVndSnapshot) {
      throw new BadRequestException('This enrollment does not require a tuition payment');
    }
    if (enrollment.status !== EnrollmentStatus.PENDING_PAYMENT) {
      throw new ConflictException('Enrollment is not awaiting payment');
    }
    const existing = await this.prisma.tuitionPayment.findFirst({
      where: { enrollmentId, status: { in: [PaymentStatus.PENDING, PaymentStatus.SUBMITTED] } },
      include: paymentInclude,
    });
    if (existing) return { ...existing, bank };

    try {
      const payment = await this.prisma.tuitionPayment.create({
        data: {
          enrollmentId,
          amountVnd: enrollment.tuitionFeeVndSnapshot,
          referenceCode: `${bank.transferPrefix}-${randomBytes(8).toString('hex').toUpperCase()}`,
        },
        include: paymentInclude,
      });
      return { ...payment, bank };
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('An actionable payment already exists; reload payment history');
      }
      throw error;
    }
  }

  async listMine(learnerId: string, enrollmentId: string) {
    await this.requireOwnedEnrollment(learnerId, enrollmentId);
    const data = await this.prisma.tuitionPayment.findMany({
      where: { enrollmentId },
      orderBy: { createdAt: 'desc' },
      include: paymentInclude,
    });
    return {
      data,
      bank: data.some((item) => item.status === PaymentStatus.PENDING)
        ? this.bankInstructions()
        : null,
    };
  }

  async submit(
    learnerId: string,
    enrollmentId: string,
    paymentId: string,
    input: SubmitPaymentDto,
  ) {
    await this.requireOwnedEnrollment(learnerId, enrollmentId);
    const changed = await this.prisma.tuitionPayment.updateMany({
      where: { id: paymentId, enrollmentId, status: PaymentStatus.PENDING },
      data: {
        status: PaymentStatus.SUBMITTED,
        payerReference: input.payerReference?.trim() || null,
        learnerNote: input.learnerNote?.trim() || null,
        submittedAt: new Date(),
      },
    });
    if (changed.count !== 1) throw new ConflictException('Payment is no longer pending');
    return this.prisma.tuitionPayment.findUnique({
      where: { id: paymentId },
      include: paymentInclude,
    });
  }

  async listAdmin(query: PaymentQueryDto) {
    const where: Prisma.TuitionPaymentWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { referenceCode: { contains: query.search, mode: 'insensitive' } },
              { payerReference: { contains: query.search, mode: 'insensitive' } },
              {
                enrollment: {
                  learner: { fullName: { contains: query.search, mode: 'insensitive' } },
                },
              },
              {
                enrollment: { learner: { email: { contains: query.search, mode: 'insensitive' } } },
              },
            ],
          }
        : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.tuitionPayment.findMany({
        where,
        include: paymentInclude,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.tuitionPayment.count({ where }),
    ]);
    return {
      data,
      meta: {
        total,
        page: query.page,
        limit: query.limit,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async adminDetail(id: string) {
    const payment = await this.prisma.tuitionPayment.findUnique({
      where: { id },
      include: paymentInclude,
    });
    if (!payment) throw new NotFoundException('Payment not found');
    return payment;
  }

  async verify(adminId: string, id: string, input: ReviewPaymentDto) {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            await tx.$queryRaw(
              Prisma.sql`SELECT id FROM "tuition_payments" WHERE id = ${id}::uuid FOR UPDATE`,
            );
            const payment = await tx.tuitionPayment.findUnique({
              where: { id },
              include: paymentInclude,
            });
            if (!payment) throw new NotFoundException('Payment not found');
            if (payment.status === PaymentStatus.VERIFIED) return payment;
            if (payment.status !== PaymentStatus.SUBMITTED)
              throw new ConflictException('Only submitted payments can be verified');
            if (payment.enrollment.status !== EnrollmentStatus.PENDING_PAYMENT)
              throw new ConflictException('Enrollment is no longer awaiting payment');
            if (payment.amountVnd !== payment.enrollment.tuitionFeeVndSnapshot)
              throw new ConflictException(
                'Payment amount does not match the immutable tuition snapshot',
              );

            const reservedCount = await tx.enrollment.count({
              where: {
                classOfferingId: payment.enrollment.classOffering.id,
                status: { in: [EnrollmentStatus.ACTIVE, EnrollmentStatus.PENDING_PAYMENT] },
              },
            });
            const capacity = payment.enrollment.classOffering.maxStudents;
            if (capacity !== null && reservedCount > capacity)
              throw new ConflictException('Class capacity reservation is invalid');
            const enrollmentChanged = await tx.enrollment.updateMany({
              where: { id: payment.enrollment.id, status: EnrollmentStatus.PENDING_PAYMENT },
              data: { status: EnrollmentStatus.ACTIVE },
            });
            if (enrollmentChanged.count !== 1)
              throw new ConflictException('Enrollment changed; reload and retry');
            const paymentChanged = await tx.tuitionPayment.updateMany({
              where: { id, status: PaymentStatus.SUBMITTED },
              data: {
                status: PaymentStatus.VERIFIED,
                verifiedAt: new Date(),
                verifiedById: adminId,
                adminNote: input.adminNote?.trim() || null,
              },
            });
            if (paymentChanged.count !== 1)
              throw new ConflictException('Payment changed; reload and retry');
            return tx.tuitionPayment.findUniqueOrThrow({ where: { id }, include: paymentInclude });
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error: unknown) {
        if (!this.isTransactionConflict(error)) throw error;
        const current = await this.prisma.tuitionPayment.findUnique({
          where: { id },
          include: paymentInclude,
        });
        if (current?.status === PaymentStatus.VERIFIED) return current;
        if (attempt === 3)
          throw new ConflictException('Concurrent payment review detected; reload and retry');
      }
    }
    throw new ConflictException('Concurrent payment review detected; reload and retry');
  }

  async reject(adminId: string, id: string, input: RejectPaymentDto) {
    void adminId;
    const changed = await this.prisma.tuitionPayment.updateMany({
      where: { id, status: { in: [PaymentStatus.PENDING, PaymentStatus.SUBMITTED] } },
      data: { status: PaymentStatus.REJECTED, adminNote: input.reason },
    });
    if (changed.count !== 1)
      throw new ConflictException('Payment cannot be rejected in its current state');
    return this.adminDetail(id);
  }

  private requireOwnedEnrollment(learnerId: string, id: string) {
    return this.prisma.enrollment
      .findFirst({
        where: { id, learnerId },
        select: { id: true, status: true, pricingTypeSnapshot: true, tuitionFeeVndSnapshot: true },
      })
      .then((row) => {
        if (!row) throw new NotFoundException('Enrollment not found');
        return row;
      });
  }

  private bankInstructions() {
    const bankName = this.config.get<string>('PAYMENT_BANK_NAME')?.trim();
    const account = this.config.get<string>('PAYMENT_BANK_ACCOUNT')?.trim();
    const accountName = this.config.get<string>('PAYMENT_BANK_ACCOUNT_NAME')?.trim();
    if (!bankName || !account || !accountName)
      throw new ServiceUnavailableException('Bank transfer configuration is incomplete');
    return {
      bankName,
      account,
      accountName,
      transferPrefix: this.config.get<string>('PAYMENT_TRANSFER_PREFIX')?.trim() || 'SMARTENGLISH',
    };
  }

  private isTransactionConflict(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === 'P2034' ||
        (error.code === 'P2010' && JSON.stringify(error.meta).includes('40001')))
    );
  }
}
