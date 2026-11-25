import { ForbiddenException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import type { AuthorityActor } from '../authorization/authorization.service';
import { TuitionPaymentService } from '../tuition/tuition-payment.service';

@Injectable()
export class LearnerFinanceService {
  constructor(
    private readonly db: PrismaService,
    @Optional() private readonly tuitionPayment?: TuitionPaymentService,
  ) {}

  async read(actor: AuthorityActor, id?: string) {
    const unified = this.tuitionPayment
      ? await this.tuitionPayment.getLearnerFinanceOverview(actor.id)
      : null;

    const legacy = await this.db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SET TRANSACTION READ ONLY`;
        // Owner reads use the current authenticated session, independently of experimental payment commands.
        const [user] = await tx.$queryRaw<{ id: string }[]>`
        SELECT u.id FROM users u JOIN user_sessions s ON s.sess->>'userId'=u.id::text
        WHERE u.id=${actor.id}::uuid AND u.role='STUDENT' AND u.status='ACTIVE'
        AND s.sid=${actor.sessionId} AND s.expire>clock_timestamp()`;
        if (!user) throw new ForbiddenException('Current learner session required');
        const rows = await tx.w07Application.findMany({
          where: { learnerId: user.id, ...(id ? { id } : {}) },
          orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
          select: {
            id: true,
            state: true,
            amountVnd: true,
            createdAt: true,
            consentVersion: true,
            class: { select: { id: true, name: true, code: true } },
            w07ObligationApplication: {
              select: {
                id: true,
                amountVnd: true,
                dueAt: true,
                w07AllocationObligation: { select: { amountVnd: true } },
                w07PaymentEventObligation: { select: { excessVnd: true } },
                w07EvidenceObligation: {
                  select: {
                    id: true,
                    amountVnd: true,
                    createdAt: true,
                    w07PaymentEventEvidence: { select: { kind: true } },
                  },
                },
              },
            },
          },
        });
        if (id && !rows.length) throw new NotFoundException('Application not available');
        return {
          data: rows.map((row) => {
            const fee = row.w07ObligationApplication[0];
            const paid = fee?.w07AllocationObligation.reduce((sum, x) => sum + x.amountVnd, 0) ?? 0;
            const credit =
              fee?.w07PaymentEventObligation.reduce((sum, x) => sum + x.excessVnd, 0) ?? 0;
            return {
              id: row.id,
              state: row.state,
              class: row.class,
              amountVnd: row.amountVnd,
              createdAt: row.createdAt,
              demonstration: row.consentVersion === 'W07_SYNTHETIC_ADMISSION_V1',
              obligation: fee
                ? {
                    dueVnd: fee.amountVnd,
                    paidVnd: paid,
                    remainingVnd: fee.amountVnd - paid,
                    dueAt: fee.dueAt,
                    state:
                      credit > 0
                        ? 'CREDIT_PENDING'
                        : paid === fee.amountVnd
                          ? 'SETTLED'
                          : paid > 0
                            ? 'PARTIAL'
                            : 'UNPAID',
                  }
                : null,
              evidence:
                fee?.w07EvidenceObligation.map((e) => ({
                  id: e.id,
                  amountVnd: e.amountVnd,
                  createdAt: e.createdAt,
                  state: e.w07PaymentEventEvidence[0]?.kind ?? 'PENDING_REVIEW',
                })) ?? [],
            };
          }),
        };
      },
      { maxWait: 10000, timeout: 15000 },
    );

    if (!unified) return legacy;
    return {
      ...legacy,
      unified,
    };
  }
}
