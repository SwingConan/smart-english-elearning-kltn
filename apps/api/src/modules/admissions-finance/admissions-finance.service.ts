import { ConflictException, HttpException, Injectable, NotFoundException } from '@nestjs/common';
import { resolve } from 'node:path';
import { Prisma, type User } from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuthorizationService, type AuthorityActor } from '../authorization/authorization.service';
import {
  integerVnd,
  proofSha,
  validateTestProof,
  type W07_CAPS,
} from './admissions-finance.policy';
import { W07ProofStorage } from './admissions-finance.storage';
import { verifyUnifiedTarget } from '../operations/unified-runtime.guard';
import type {
  W07AcademicDto,
  W07AdjustmentDecisionDto,
  W07AdjustmentDto,
  W07ApplyDto,
  W07CaseDto,
  W07Key,
  W07Reason,
  W07UploadDto,
  W07VerifyDto,
} from './admissions-finance.dto';
type Tx = Prisma.TransactionClient;
type Cap = (typeof W07_CAPS)[number];
@Injectable()
export class AdmissionsFinanceService {
  constructor(
    private readonly db: PrismaService,
    private readonly authority: AuthorizationService,
    private readonly storage: W07ProofStorage,
  ) {}
  private approvedQa() {
    return (
      process.env.W07_ENABLED === 'QA_DEC071' &&
      process.env.W07_RUN_INTENT === 'DEC071_INTEGRATED_QA'
    );
  }
  private enabled() {
    if (
      (!this.approvedQa() && process.env.W07_ENABLED !== 'DEV_DEC049') ||
      process.env.NODE_ENV === 'production' ||
      (!this.approvedQa() && process.env.W07_RUN_INTENT !== 'DEC049_DISPOSABLE_ONLY') ||
      !process.env.E2E_DATABASE_URL ||
      process.env.DATABASE_URL !== process.env.E2E_DATABASE_URL
    )
      throw new NotFoundException();
  }
  private async run<T>(a: AuthorityActor, work: (tx: Tx, u: User) => Promise<T>): Promise<T> {
    this.enabled();
    try {
      return await this.db.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(842030)`;
          const u = await this.reportContext(tx, a);
          return work(tx, u);
        },
        { maxWait: 15000, timeout: 30000 },
      );
    } catch (e) {
      if (e instanceof HttpException) throw e;
      if (
        /W07_|P2002|P2003|P2004|P2034|23505|23514|42501|40001|40P01/.test(
          String(e) + JSON.stringify(e),
        )
      )
        throw new ConflictException(
          'W07 command conflicts with current scope, immutable history, balance or policy; reload before retry',
          { cause: e },
        );
      throw e;
    }
  }
  private async reportContext(tx: Tx, a: AuthorityActor) {
    this.enabled();
    if (this.approvedQa()) await verifyUnifiedTarget(tx);
    const [identity] = await tx.$queryRaw<
      {
        db: string;
        oid: string;
        role: string;
        sr: string;
        schema: string;
        dir: string;
        host: string;
        port: number;
        marker: string;
      }[]
    >`SELECT current_database() AS db,oid::text AS oid,current_user AS role,session_user AS sr,current_schema() AS schema,current_setting('data_directory') AS dir,host(inet_server_addr()) AS host,inet_server_port() AS port,shobj_description(oid,'pg_database') AS marker FROM pg_database WHERE datname=current_database()`;
    const vpsApproved = process.env.VPS_DEPLOY_APPROVED === 'SMART_ENGLISH_VPS_2026';
    const expectedPort = vpsApproved
      ? Number(new URL(process.env.DATABASE_URL ?? 'postgresql://127.0.0.1:5432').port || '5432')
      : 55401;
    const dirMismatch = vpsApproved
      ? !identity.dir
      : resolve(identity.dir) !==
        resolve(process.env.W07_WORKSPACE_ROOT ?? '', '.local-storage/v2-wave01/postgres');
    if (
      identity.db !== process.env.W07_EXPECTED_DATABASE ||
      identity.oid !== process.env.W07_VERIFIED_OID ||
      identity.role !== 'wave01' ||
      identity.sr !== 'wave01' ||
      identity.schema !== 'public' ||
      identity.host !== '127.0.0.1' ||
      identity.port !== expectedPort ||
      dirMismatch ||
      identity.marker !== 'SMART_ENGLISH_DISPOSABLE_E2E_V1'
    )
      throw new ConflictException('W07 disposable database identity unavailable');
    await tx.$queryRaw`SELECT set_config('app.w07_actor',${a.id},true),set_config('app.w07_session',${a.sessionId},true)`;
    const [ctx] = await tx.$queryRaw<{ id: string | null }[]>`SELECT w07_actor() AS id`;
    if (!ctx.id) throw new NotFoundException('Authenticated synthetic DEV identity required');
    const u = await tx.user.findUniqueOrThrow({ where: { id: ctx.id } });
    return u;
  }
  /** Source metadata only. Synthetic test payments are never real receipts. */
  async reportActivity(tx: Tx, a: AuthorityActor, from: Date, to: Date) {
    const u = await this.reportContext(tx, a);
    if (u.role !== 'CASHIER') throw new NotFoundException();
    const candidates = await this.scopeIds(tx, u),
      classes: string[] = [];
    for (const id of candidates)
      if (
        (await this.cap(tx, u, id, 'finance.verify')) ||
        (await this.cap(tx, u, id, 'finance.adjust.propose')) ||
        (await this.cap(tx, u, id, 'finance.adjust.approve'))
      )
        classes.push(id);
    if (!classes.length) return null;
    const includeDisposableManualTest =
      process.env.W10_REPORT_CSV_ENABLED === 'DEV_W10' &&
      process.env.W07_RUN_INTENT === 'DEC049_DISPOSABLE_ONLY';
    return tx.w07PaymentEvent.findMany({
      where: {
        ...(includeDisposableManualTest ? {} : { synthetic: false }),
        obligation: { application: { classId: { in: classes } } },
        createdAt: { gte: from, lt: to },
      },
      select: {
        id: true,
        kind: true,
        amountVnd: true,
        synthetic: true,
        createdAt: true,
        obligationId: true,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: 201,
    });
  }
  private async cap(tx: Tx, u: User, classId: string, cap: Cap) {
    return this.authority.permits(u.id, cap, { type: 'CLASS', id: classId }, tx);
  }
  private async grant(tx: Tx, u: User, classId: string, cap: Cap) {
    if (!(await this.cap(tx, u, classId, cap)))
      throw new NotFoundException('No current scoped authority');
    const [g] = await tx.$queryRaw<
      { id: string | null }[]
    >`SELECT w07_grant(${cap},${classId}::uuid) AS id`;
    if (!g.id) throw new NotFoundException();
    return g.id;
  }
  private async access(
    tx: Tx,
    u: User,
    id: string,
    mode: 'read' | 'academic' | 'finance' | 'own' = 'read',
  ) {
    const app = await tx.w07Application.findUnique({ where: { id } });
    if (!app) throw new NotFoundException('Application not available');
    const own = u.role === 'STUDENT' && u.id === app.learnerId,
      academic = await this.cap(tx, u, app.classId, 'academic.admission.approve'),
      finance =
        (await this.cap(tx, u, app.classId, 'finance.verify')) ||
        (await this.cap(tx, u, app.classId, 'finance.adjust.propose')) ||
        (await this.cap(tx, u, app.classId, 'finance.adjust.approve'));
    if (
      mode === 'own'
        ? !own
        : mode === 'academic'
          ? !academic
          : mode === 'finance'
            ? !finance
            : !own && !academic && !finance
    )
      throw new NotFoundException('Application not available');
    return { app, own, academic, finance };
  }
  private async scopeIds(tx: Tx, u: User) {
    const [c] = await tx.$queryRaw<
        { ms: number }[]
      >`SELECT extract(epoch FROM clock_timestamp())::double precision*1000 AS ms`,
      now = new Date(c.ms);
    const caps =
      u.role === 'ACADEMIC_MANAGER'
        ? ['academic.admission.approve']
        : u.role === 'CASHIER'
          ? ['finance.verify', 'finance.adjust.propose', 'finance.adjust.approve']
          : [];
    return (
      await tx.permissionGrant.findMany({
        where: {
          userId: u.id,
          capability: { in: caps },
          scopeType: 'CLASS',
          scopeId: { not: null },
          approvedBy: { not: null },
          approvedAt: { lte: now },
          effectiveAt: { lte: now },
          expiresAt: { gt: now },
          revokedAt: null,
        },
        select: { scopeId: true },
      })
    ).flatMap((x) => (x.scopeId ? [x.scopeId] : []));
  }
  offers(a: AuthorityActor) {
    return this.run(a, async (tx, u) => {
      if (u.role !== 'STUDENT') throw new NotFoundException();
      const rows = await tx.w07ClassControl.findMany({
          include: {
            class: {
              select: {
                id: true,
                code: true,
                name: true,
                versionId: true,
                approvedTuitionFeeVnd: true,
                approvedPricingType: true,
                maxStudents: true,
                course: { select: { title: true } },
                _count: { select: { enrollments: { where: { status: 'ACTIVE' } } } },
              },
            },
          },
          take: 200,
          orderBy: { createdAt: 'desc' },
        }),
        data = [];
      for (const r of rows) {
        const [v] = await tx.$queryRaw<
          { open: boolean; price: boolean }[]
        >`SELECT w07_open(${r.classId}::uuid) AS open,w07_price(${r.classId}::uuid) AS price`;
        const approved = this.approvedQa()
          ? (
              await tx.$queryRaw<
                { ok: boolean }[]
              >`SELECT academic_offer_v2.allowed_admission(${r.classId}::uuid,'W07_DEC071_ADMISSION_V1') ok`
            )[0].ok
          : false;
        if (v.open && (!this.approvedQa() || approved))
          data.push({
            consentVersion: approved ? 'W07_DEC071_ADMISSION_V1' : 'W07_SYNTHETIC_ADMISSION_V1',
            id: r.classId,
            code: r.class.code,
            name: r.class.name,
            course: r.class.course.title,
            amountVnd: r.class.approvedTuitionFeeVnd,
            pricingType: r.class.approvedPricingType,
            versionId: r.class.versionId,
            ready:
              v.price &&
              r.class.approvedPricingType === 'PAID' &&
              (r.class.approvedTuitionFeeVnd ?? 0) > 0,
            remainingSeats:
              r.class.maxStudents === null
                ? null
                : Math.max(0, r.class.maxStudents - r.class._count.enrollments),
            noSeatHold: true,
          });
      }
      return { synthetic: !this.approvedQa(), data };
    });
  }
  staffClasses(a: AuthorityActor) {
    return this.run(a, async (tx, u) => ({
      data: await tx.classOffering.findMany({
        where: { id: { in: await this.scopeIds(tx, u) } },
        select: {
          id: true,
          code: true,
          name: true,
          status: true,
          versionId: true,
          approvedTuitionFeeVnd: true,
          w07ClassControlClass: { select: { id: true } },
        },
        orderBy: { code: 'asc' },
        take: 200,
      }),
    }));
  }
  enable(a: AuthorityActor, classId: string, input: W07Reason) {
    return this.run(a, async (tx, u) => {
      await this.grant(tx, u, classId, 'academic.admission.approve');
      const old = await tx.w07ClassControl.findUnique({ where: { classId } });
      if (old) return { id: old.id, enabled: true, noSeatHold: true };
      const c = await tx.w07ClassControl.create({
        data: { classId, actorId: u.id, reason: input.reason },
      });
      if (this.approvedQa())
        await tx.$executeRaw`INSERT INTO academic_offer_v2.admission_offers(class_id,version_id,amount_vnd,consent_version,authority,actor_id)
        SELECT id,"versionId","approvedTuitionFeeVnd",'W07_DEC071_ADMISSION_V1','V2-DEC-071 / BR-V2-113',${u.id}::uuid FROM class_offerings WHERE id=${classId}::uuid`;
      return { id: c.id, enabled: true, noSeatHold: true };
    });
  }
  referrals(a: AuthorityActor) {
    return this.run(a, async (tx, u) => {
      if (u.role !== 'STUDENT') throw new NotFoundException();
      const rows = await tx.counselingApplication.findMany({
          where: {
            learnerId: u.id,
            state: 'ACKNOWLEDGED',
            snapshot: { not: Prisma.JsonNull },
            submittedAt: { not: null },
            reviewedAt: { not: null },
          },
          select: { id: true, number: true, ticketId: true, classId: true },
          take: 100,
        }),
        data = [];
      for (const r of rows) {
        const c = await tx.supportConsent.findFirst({
          where: { ticketId: r.ticketId, purpose: 'APPLICATION', learnerId: u.id },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        });
        if (c?.granted)
          data.push({
            id: r.id,
            number: r.number,
            classId: r.classId,
            label: 'W05A acknowledged counseling source — not admission',
          });
      }
      return { data };
    });
  }
  apply(a: AuthorityActor, input: W07ApplyDto) {
    return this.run(a, async (tx, u) => {
      if (u.role !== 'STUDENT') throw new NotFoundException();
      if (this.approvedQa()) {
        const [allowed] = await tx.$queryRaw<
          { ok: boolean }[]
        >`SELECT academic_offer_v2.allowed_admission(${input.classId}::uuid,${input.consentVersion}) ok`;
        if (!allowed.ok)
          throw new ConflictException('DEC071 approved offer and current consent required');
      } else if (input.consentVersion !== 'W07_SYNTHETIC_ADMISSION_V1')
        throw new ConflictException('TEST admission consent required');
      const retry = await tx.w07Application.findUnique({
        where: { learnerId_key: { learnerId: u.id, key: input.key } },
      });
      if (retry) {
        if (
          retry.classId !== input.classId ||
          retry.referralId !== (input.referralId ?? null) ||
          retry.consentVersion !== input.consentVersion
        )
          throw new ConflictException('Idempotency key conflict');
        return {
          id: retry.id,
          state: retry.state,
          lockVersion: retry.lockVersion,
          synthetic: retry.consentVersion==='W07_SYNTHETIC_ADMISSION_V1',
        };
      }
      const old = await tx.w07Application.findFirst({
        where: { learnerId: u.id, classId: input.classId },
        orderBy: { number: 'desc' },
      });
      if (old && !['REJECTED', 'CANCELLED'].includes(old.state))
        throw new ConflictException(
          'An immutable current application already exists; open its receipt',
        );
      const app = await tx.w07Application.create({
        data: {
          classId: input.classId,
          learnerId: u.id,
          number: (old?.number ?? 0) + 1,
          parentId: old?.id,
          referralId: input.referralId,
          consentVersion: input.consentVersion,
          state: 'SUBMITTED',
          key: input.key,
        },
      });
      return {
        id: app.id,
        state: app.state,
        lockVersion: app.lockVersion,
        synthetic: app.consentVersion==='W07_SYNTHETIC_ADMISSION_V1',
        blockReason: app.blockReason,
      };
    });
  }
  mine(a: AuthorityActor) {
    return this.run(a, async (tx, u) => {
      if (u.role !== 'STUDENT') throw new NotFoundException();
      return {
        synthetic: true,
        data: await tx.w07Application.findMany({
          where: { learnerId: u.id },
          select: {
            id: true,
            state: true,
            number: true,
            amountVnd: true,
            blockReason: true,
            createdAt: true,
            class: { select: { code: true, name: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 100,
        }),
      };
    });
  }
  workspace(a: AuthorityActor) {
    return this.run(a, async (tx, u) => ({
      synthetic: true,
      data: await tx.w07Application.findMany({
        where: { classId: { in: await this.scopeIds(tx, u) } },
        select: {
          id: true,
          state: true,
          number: true,
          lockVersion: true,
          amountVnd: true,
          blockReason: true,
          class: { select: { code: true, name: true } },
          learner: { select: { fullName: true } },
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
    }));
  }
  private async balance(tx: Tx, feeId: string) {
    const [b] = await tx.$queryRaw<
      { dueVnd: number; paidVnd: number; remainingVnd: number; creditPendingVnd: string }[]
    >`SELECT f."amountVnd" AS "dueVnd",w07_paid(f.id)::integer AS "paidVnd",(f."amountVnd"-w07_paid(f.id))::integer AS "remainingVnd",coalesce((SELECT sum(p."excessVnd") FROM w07_payment_events p WHERE p."obligationId"=f.id),0)::text AS "creditPendingVnd" FROM w07_obligations f WHERE f.id=${feeId}::uuid`;
    return {
      ...b,
      state:
        b.creditPendingVnd !== '0'
          ? 'CREDIT_PENDING'
          : b.remainingVnd === 0
            ? 'SETTLED_TEST'
            : b.paidVnd > 0
              ? 'PARTIAL_TEST'
              : 'UNPAID',
      realSettlement: false,
    };
  }
  detail(a: AuthorityActor, id: string) {
    return this.run(a, async (tx, u) => {
      const p = await this.access(tx, u, id),
        app = p.app,
        fee = await tx.w07Obligation.findUnique({ where: { applicationId: id } }),
        proofs = fee
          ? await tx.w07Evidence.findMany({
              where: { obligationId: fee.id },
              orderBy: { createdAt: 'desc' },
            })
          : [],
        events = fee
          ? await tx.w07PaymentEvent.findMany({
              where: { obligationId: fee.id },
              orderBy: { createdAt: 'asc' },
            })
          : [];
      const adjustments = fee
        ? await tx.w07Adjustment.findMany({
            where: { event: { obligationId: fee.id } },
            include: {
              w07AdjustmentDecisionRequest: { select: { id: true, decision: true, reason: true } },
            },
            orderBy: { createdAt: 'desc' },
          })
        : [];
      const flags = {
        academic: p.academic,
        finance: p.finance,
        own: p.own,
        verify: await this.cap(tx, u, app.classId, 'finance.verify'),
        proposeAdjustment: await this.cap(tx, u, app.classId, 'finance.adjust.propose'),
        checkAdjustment: await this.cap(tx, u, app.classId, 'finance.adjust.approve'),
      };
      return {
        synthetic: app.consentVersion === 'W07_SYNTHETIC_ADMISSION_V1',
        application: {
          id: app.id,
          state: app.state,
          number: app.number,
          lockVersion: app.lockVersion,
          amountVnd: app.amountVnd,
          pricingType: app.pricingType,
          versionId: app.courseVersionId,
          versionNumber: app.versionNumber,
          termsTitle: app.termsTitle,
          termsApprovedAt: app.termsApprovedAt,
          blockReason: app.blockReason,
          referralId: app.referralId,
          referralNumber: app.referralNumber,
          consentedAt: app.consentedAt,
          consentVersion: app.consentVersion,
          createdAt: app.createdAt,
        },
        class: await tx.classOffering.findUnique({
          where: { id: app.classId },
          select: { id: true, code: true, name: true },
        }),
        learner: await tx.user.findUnique({
          where: { id: app.learnerId },
          select: { fullName: true },
        }),
        permissions: flags,
        decisions: await tx.w07AcademicDecision.findMany({
          where: { applicationId: id },
          select: { id: true, kind: true, number: true, reason: true, createdAt: true },
          orderBy: { number: 'asc' },
        }),
        obligation: fee
          ? {
              id: fee.id,
              dueAt: fee.dueAt,
              duePolicy: 'UNSPECIFIED',
              currency: fee.currency,
              ...(await this.balance(tx, fee.id)),
            }
          : null,
        evidence: proofs.map((e) => ({
          id: e.id,
          amountVnd: e.amountVnd,
          createdAt: e.createdAt,
          bytes: e.bytes,
          mimeType: e.mimeType,
          status: events.find((x) => x.evidenceId === e.id)?.kind ?? 'PENDING_REVIEW',
          ...(p.own || p.finance ? { sourceRef: e.sourceRef, sha256: e.sha256 } : {}),
          downloadable: p.own || flags.verify,
        })),
        events: events.map((e) => ({
          id: e.id,
          kind: e.kind,
          amountVnd: e.amountVnd,
          excessVnd: e.excessVnd,
          parentId: e.parentId,
          reason: p.finance || p.own ? e.reason : 'SYNTHETIC TEST financial review',
          createdAt: e.createdAt,
          synthetic: true,
        })),
        adjustments: adjustments.map((r) => ({
          id: r.id,
          eventId: r.eventId,
          makerId: r.makerId,
          kind: r.kind,
          amountVnd: r.amountVnd,
          reason: r.reason,
          evidence: r.evidence,
          state: r.w07AdjustmentDecisionRequest[0]?.decision ?? r.state,
          blockReason: r.blockReason,
          decision: r.w07AdjustmentDecisionRequest[0] ?? null,
        })),
        entitlements: await tx.w07Entitlement.findMany({
          where: { applicationId: id },
          select: {
            id: true,
            outcome: true,
            reasonCode: true,
            enrollmentId: true,
            previousStatus: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 50,
        }),
        cases: await tx.w07Case.findMany({
          where: { applicationId: id },
          select: {
            id: true,
            kind: true,
            state: true,
            blockReason: true,
            targetClassId: true,
            reason: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        }),
      };
    });
  }
  configuration(a: AuthorityActor) {
    return this.run(a, async () => ({
      approvedQa: this.approvedQa(),
      consentVersion: this.approvedQa() ? 'W07_DEC071_ADMISSION_V1' : 'W07_SYNTHETIC_ADMISSION_V1',
    }));
  }
  authorizePaymentSource(a: AuthorityActor, id: string, input: W07Reason) {
    return this.run(a, async (tx, u) => {
      if (!this.approvedQa() || u.role !== 'CASHIER') throw new NotFoundException();
      const { app } = await this.access(tx, u, id, 'finance');
      await this.grant(tx, u, app.classId, 'finance.verify');
      const fee = await tx.w07Obligation.findUnique({ where: { applicationId: id } });
      const decision = fee
        ? await tx.w07AcademicDecision.findUnique({ where: { id: fee.decisionId } })
        : null;
      if (
        !fee ||
        !decision ||
        app.state !== 'APPROVED' ||
        app.consentVersion !== 'W07_DEC071_ADMISSION_V1' ||
        decision.reviewerId === u.id ||
        app.learnerId === u.id
      )
        throw new ConflictException('Approved independent DEC071 source required');
      await tx.$executeRaw`INSERT INTO sepay_v2.live_sources(obligation_id,consent_version,decision_reference,academic_actor,finance_actor)
        VALUES(${fee.id}::uuid,${app.consentVersion},${'V2-DEC-071 / BR-V2-113; ' + input.reason},${decision.reviewerId}::uuid,${u.id}::uuid) ON CONFLICT(obligation_id) DO NOTHING`;
      await this.authority.audit(
        tx,
        u.id,
        'W07_DEC071_PAYMENT_SOURCE',
        'W07_OBLIGATION',
        fee.id,
        'V2-DEC-071 / BR-V2-113: nguồn giá đã duyệt; chưa xác nhận tiền hoặc cấp quyền học.',
      );
      return {
        obligationId: fee.id,
        amountVnd: fee.amountVnd,
        state: 'SOURCE_AUTHORIZED',
        paymentReceived: false,
        entitlement: 'UNCHANGED',
      };
    });
  }
  academic(a: AuthorityActor, id: string, input: W07AcademicDto) {
    return this.run(a, async (tx, u) => {
      const { app } = await this.access(tx, u, id, 'academic'),
        grantId = await this.grant(tx, u, app.classId, 'academic.admission.approve');
      const old = await tx.w07AcademicDecision.findUnique({
        where: { reviewerId_key: { reviewerId: u.id, key: input.key } },
      });
      if (old) {
        if (
          old.applicationId !== id ||
          old.kind !== input.decision ||
          old.reason !== input.reason ||
          old.caseId !== (input.caseId ?? null) ||
          old.number !== input.expectedVersion + 1
        )
          throw new ConflictException('Idempotency key conflict');
        return { id: old.id, kind: old.kind, number: old.number };
      }
      if (app.lockVersion !== input.expectedVersion)
        throw new ConflictException('Stale admission version');
      const r = await tx.w07AcademicDecision.create({
        data: {
          applicationId: id,
          number: app.lockVersion + 1,
          reviewerId: u.id,
          grantId,
          kind: input.decision,
          caseId: input.caseId,
          reason: input.reason,
          key: input.key,
        },
      });
      return { id: r.id, kind: r.kind, number: r.number };
    });
  }
  paymentReceipt(a: AuthorityActor, feeId: string, key: string) {
    return this.run(a, async (tx, u) => {
      const fee = await tx.w07Obligation.findUnique({ where: { id: feeId } });
      if (!fee) throw new NotFoundException();
      // Same ownership/consent/entitlement boundary as the original upload.
      await this.access(tx, u, fee.applicationId, 'own');
      const proof = await tx.w07Evidence.findUnique({
        where: { learnerId_key: { learnerId: u.id, key } },
      });
      if (!proof || proof.obligationId !== feeId) throw new NotFoundException();
      await this.storage.read(proof.fileKey, proof.sha256, proof.bytes);
      return {
        id: proof.id,
        sha256: proof.sha256,
        bytes: proof.bytes,
        amountVnd: proof.amountVnd,
        sourceRef: proof.sourceRef,
        createdAt: proof.createdAt,
        receipt: 'STORED_TEST_EVIDENCE' as const,
        paymentConfirmed: false,
        synthetic: true,
      };
    });
  }
  async upload(
    a: AuthorityActor,
    feeId: string,
    input: W07UploadDto,
    file: { buffer: Buffer; size: number; originalname: string; mimetype: string },
  ) {
    let created: string | undefined;
    const meta = validateTestProof(file),
      amountVnd = integerVnd(input.amountVnd),
      hash = proofSha(file.buffer);
    try {
      return await this.run(a, async (tx, u) => {
        const fee = await tx.w07Obligation.findUnique({ where: { id: feeId } });
        if (!fee) throw new NotFoundException();
        await this.access(tx, u, fee.applicationId, 'own');
        const old = await tx.w07Evidence.findUnique({
          where: { learnerId_key: { learnerId: u.id, key: input.key } },
        });
        if (old) {
          if (
            old.obligationId !== feeId ||
            old.amountVnd !== amountVnd ||
            old.sha256 !== hash ||
            old.sourceRef !== input.sourceRef
          )
            throw new ConflictException('Idempotency key conflict');
          await this.storage.read(old.fileKey, old.sha256, old.bytes);
          return { id: old.id, status: 'PENDING_OR_REVIEWED', synthetic: true, sha256: old.sha256 };
        }
        const duplicate = await tx.w07Evidence.findFirst({
          where: { OR: [{ sourceRef: input.sourceRef }, { sha256: hash }] },
        });
        if (duplicate) {
          if (
            duplicate.learnerId === u.id &&
            duplicate.obligationId === feeId &&
            duplicate.sourceRef === input.sourceRef &&
            duplicate.sha256 === hash &&
            duplicate.amountVnd === amountVnd
          ) {
            await this.storage.read(duplicate.fileKey, duplicate.sha256, duplicate.bytes);
            return {
              id: duplicate.id,
              status: 'PENDING_OR_REVIEWED',
              synthetic: true,
              sha256: duplicate.sha256,
              replayed: true,
            };
          }
          throw new ConflictException('Duplicate TEST evidence or source reference');
        }
        created = await this.storage.put(file.buffer, meta.extension);
        const r = await tx.w07Evidence.create({
          data: {
            obligationId: feeId,
            learnerId: u.id,
            amountVnd,
            sourceRef: input.sourceRef,
            sha256: hash,
            fileKey: created,
            mimeType: meta.mimeType,
            bytes: file.size,
            key: input.key,
            synthetic: true,
          },
        });
        return { id: r.id, status: 'PENDING_REVIEW', synthetic: true, sha256: r.sha256 };
      });
    } catch (e) {
      if (created) {
        const candidate = created;
        try {
          // run() acquires the SAME transaction lock before this read. The original
          // upload must have finished COMMIT/ROLLBACK before absence is conclusive.
          // A rejected driver promise alone does not prove ROLLBACK.
          await this.run(a, async (tx) => {
            const durable = await tx.w07Evidence.findUnique({ where: { fileKey: candidate } });
            if (!durable) await this.storage.removeUncommitted(candidate);
          });
        } catch {
          // Unknown commit, unavailable DB or revoked session: retain privately.
          // Retry reconciles the immutable key/hash; never destroy potential proof.
        }
      }
      throw e;
    }
  }
  proof(a: AuthorityActor, id: string) {
    return this.run(a, async (tx, u) => {
      const r = await tx.w07Evidence.findUnique({
        where: { id },
        include: { obligation: { select: { applicationId: true } } },
      });
      if (!r) throw new NotFoundException();
      const p = await this.access(tx, u, r.obligation.applicationId);
      if (!p.own && !(await this.cap(tx, u, p.app.classId, 'finance.verify')))
        throw new NotFoundException();
      return {
        body: await this.storage.read(r.fileKey, r.sha256, r.bytes),
        mimeType: r.mimeType,
        fileName: 'SYNTHETIC_TEST_PROOF.' + r.fileKey.split('.').pop(),
      };
    });
  }
  verify(a: AuthorityActor, id: string, input: W07VerifyDto) {
    return this.run(a, async (tx, u) => {
      const e = await tx.w07Evidence.findUnique({
        where: { id },
        include: { obligation: { select: { applicationId: true } } },
      });
      if (!e) throw new NotFoundException();
      const { app } = await this.access(tx, u, e.obligation.applicationId, 'finance'),
        grantId = await this.grant(tx, u, app.classId, 'finance.verify');
      const old = await tx.w07PaymentEvent.findUnique({
        where: { actorId_key: { actorId: u.id, key: input.key } },
      });
      if (old) {
        if (old.evidenceId !== id || old.kind !== input.decision || old.reason !== input.reason)
          throw new ConflictException('Idempotency key conflict');
        return { id: old.id, kind: old.kind, synthetic: true };
      }
      if (input.decision === 'VERIFY') await this.storage.read(e.fileKey, e.sha256, e.bytes);
      const r = await tx.w07PaymentEvent.create({
        data: {
          obligationId: e.obligationId,
          evidenceId: id,
          kind: input.decision,
          amountVnd: input.decision === 'VERIFY' ? e.amountVnd : 0,
          actorId: u.id,
          grantId,
          reason: input.reason,
          key: input.key,
          synthetic: true,
        },
      });
      return {
        id: r.id,
        kind: r.kind,
        synthetic: true,
        realSettlement: false,
        balance: await this.balance(tx, e.obligationId),
      };
    });
  }
  activate(a: AuthorityActor, id: string, input: W07Key) {
    return this.run(a, async (tx, u) => {
      const { app } = await this.access(tx, u, id, 'own');
      const active = await tx.w07Entitlement.findFirst({
        where: { applicationId: id, outcome: 'ACTIVE' },
      });
      if (active) {
        const row = await tx.enrollment.findUnique({ where: { id: active.enrollmentId! } });
        if (row?.status !== 'ACTIVE')
          throw new ConflictException('Entitlement restoration policy required');
        return { id: active.id, outcome: active.outcome, enrollmentId: active.enrollmentId };
      }
      const old = await tx.w07Entitlement.findUnique({
        where: { applicationId_key: { applicationId: id, key: input.key } },
      });
      if (old) return { id: old.id, outcome: old.outcome, reasonCode: old.reasonCode };
      const [g] = await tx.$queryRaw<
        { code: string }[]
      >`SELECT w07_activation(${id}::uuid) AS code`;
      if (g.code !== 'READY') {
        const r = await tx.w07Entitlement.create({
          data: {
            applicationId: id,
            learnerId: u.id,
            outcome: g.code === 'PENDING_CAPACITY' ? 'PENDING_CAPACITY' : 'BLOCKED_REVIEW',
            reasonCode: g.code,
            key: input.key,
          },
        });
        return { id: r.id, outcome: r.outcome, reasonCode: r.reasonCode };
      }
      await tx.$queryRaw`SELECT set_config('app.w07_application',${id},true),set_config('app.w07_key',${input.key},true)`;
      const existing = await tx.enrollment.findUnique({
        where: { learnerId_classOfferingId: { learnerId: u.id, classOfferingId: app.classId } },
      });
      if (existing && existing.status !== 'PENDING_PAYMENT')
        throw new ConflictException('Existing enrollment requires reviewed restoration policy');
      const enrollment = existing
        ? await tx.enrollment.update({ where: { id: existing.id }, data: { status: 'ACTIVE' } })
        : await tx.enrollment.create({
            data: { learnerId: u.id, classOfferingId: app.classId, status: 'ACTIVE' },
          });
      const receipt = await tx.w07Entitlement.findFirstOrThrow({
        where: { applicationId: id, enrollmentId: enrollment.id, outcome: 'ACTIVE' },
      });
      return { id: receipt.id, outcome: receipt.outcome, enrollmentId: enrollment.id };
    });
  }
  adjustment(a: AuthorityActor, eventId: string, input: W07AdjustmentDto) {
    return this.run(a, async (tx, u) => {
      const e = await tx.w07PaymentEvent.findUnique({
        where: { id: eventId },
        include: { obligation: { select: { applicationId: true } } },
      });
      if (!e) throw new NotFoundException();
      const { app } = await this.access(tx, u, e.obligation.applicationId, 'finance');
      await this.grant(tx, u, app.classId, 'finance.adjust.propose');
      const old = await tx.w07Adjustment.findUnique({
        where: { makerId_key: { makerId: u.id, key: input.key } },
      });
      if (old) {
        if (
          old.eventId !== eventId ||
          old.kind !== input.kind ||
          old.amountVnd !== input.amountVnd ||
          old.reason !== input.reason ||
          old.evidence !== input.evidence
        )
          throw new ConflictException('Idempotency key conflict');
        return { id: old.id, state: old.state, blockReason: old.blockReason, payout: false };
      }
      const r = await tx.w07Adjustment.create({
        data: { ...input, eventId, makerId: u.id, state: 'PENDING_REVIEW' },
      });
      return { id: r.id, state: r.state, blockReason: r.blockReason, payout: false };
    });
  }
  adjustmentDecision(a: AuthorityActor, id: string, input: W07AdjustmentDecisionDto) {
    return this.run(a, async (tx, u) => {
      const r = await tx.w07Adjustment.findUnique({
        where: { id },
        include: { event: { include: { obligation: { select: { applicationId: true } } } } },
      });
      if (!r) throw new NotFoundException();
      const { app } = await this.access(tx, u, r.event.obligation.applicationId, 'finance'),
        grantId = await this.grant(tx, u, app.classId, 'finance.adjust.approve');
      const old = await tx.w07AdjustmentDecision.findUnique({ where: { requestId: id } });
      if (old) {
        if (
          old.reviewerId !== u.id ||
          old.key !== input.key ||
          old.decision !== input.decision ||
          old.reason !== input.reason
        )
          throw new ConflictException('Already reviewed');
        return { id: old.id, decision: old.decision, payout: false };
      }
      const d = await tx.w07AdjustmentDecision.create({
        data: {
          requestId: id,
          reviewerId: u.id,
          grantId,
          decision: input.decision,
          reason: input.reason,
          key: input.key,
        },
      });
      return { id: d.id, decision: d.decision, payout: false, realDisbursement: false };
    });
  }
  caseRequest(a: AuthorityActor, id: string, input: W07CaseDto) {
    return this.run(a, async (tx, u) => {
      await this.access(tx, u, id, 'own');
      if (
        input.targetClassId &&
        !(await tx.classOffering.findFirst({
          where: { id: input.targetClassId, course: { isPublished: true }, status: 'OPEN' },
          select: { id: true },
        }))
      )
        throw new NotFoundException('Target offer unavailable');
      const old = await tx.w07Case.findUnique({
        where: { learnerId_key: { learnerId: u.id, key: input.key } },
      });
      if (old) {
        if (
          old.applicationId !== id ||
          old.kind !== input.kind ||
          old.targetClassId !== (input.targetClassId ?? null) ||
          old.reason !== input.reason
        )
          throw new ConflictException('Idempotency key conflict');
        return old;
      }
      return tx.w07Case.create({
        data: { ...input, applicationId: id, learnerId: u.id, state: 'PENDING_REVIEW' },
      });
    });
  }
  notifications(a: AuthorityActor) {
    return this.run(a, async (tx, u) => {
      if (u.role !== 'STUDENT') throw new NotFoundException();
      return {
        data: await tx.w07Notification.findMany({
          where: { recipientId: u.id, application: { learnerId: u.id } },
          select: { id: true, applicationId: true, kind: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
          take: 100,
        }),
        delivery: 'IN_APP_INTENT_ONLY',
        synthetic: true,
      };
    });
  }
}
