import { HttpException, Injectable } from '@nestjs/common';
import { Prisma, type UserRole } from '../../generated/prisma/client';
import { type AuthorityActor, AuthorizationService } from '../authorization/authorization.service';
import { SupportService } from '../support/support.service';
import { AdmissionsFinanceService } from '../admissions-finance/admissions-finance.service';
import { InspectionService } from '../inspection/inspection.service';
import { available, unavailable, ref, type Source } from './report-source';
type Tx = Prisma.TransactionClient;
@Injectable()
export class RoleReportAdapters {
  constructor(
    private readonly support: SupportService,
    private readonly finance: AdmissionsFinanceService,
    private readonly inspection: InspectionService,
    private readonly authority: AuthorizationService,
  ) {}
  private async guarded(code: string, wave: string, read: () => Promise<Source>): Promise<Source> {
    try {
      return await read();
    } catch (error) {
      if (!(error instanceof HttpException) || ![403, 404, 409].includes(error.getStatus()))
        throw error;
      return unavailable(
        code,
        wave,
        wave === 'W05A'
          ? 'W05A_TARGET_GUARD_OR_CURRENT_SCOPE_REQUIRED'
          : wave === 'W07'
            ? 'W07_TARGET_GUARD_OR_CURRENT_SCOPE_REQUIRED'
            : 'W08_GUARD_OR_CURRENT_IDENTITY_REQUIRED',
      );
    }
  }
  async read(
    tx: Tx,
    actor: AuthorityActor,
    role: UserRole,
    from: Date,
    to: Date,
    requested: string,
  ): Promise<Source[]> {
    const sources: Source[] = [],
      wants = (code: string) => requested === 'ALL' || requested === code;
    if (role === 'INSTRUCTOR' && wants('TEACHING_CALENDAR')) {
      // Existing W02 calendar read scope: a teacher may read their own published
      // session metadata. Historical visibility does not grant current teaching actions.
      const rows = await tx.teachingSession.findMany({
        where: {
          instructorId: actor.id,
          state: 'PUBLISHED',
          intent: 'PUBLISH',
          startsAt: { gte: from, lt: to },
          replacements: { none: { state: 'PUBLISHED' } },
        },
        select: { id: true, startsAt: true, state: true, revision: true, classOfferingId: true },
        orderBy: [{ startsAt: 'desc' }, { id: 'asc' }],
        take: 201,
      });
      sources.push(
        available(
          'TEACHING_CALENDAR',
          'W02',
          'W02_OWN_PUBLISHED_CALENDAR_METADATA_ONLY',
          rows.map((r) => ({
            id: r.id,
            at: r.startsAt.toISOString(),
            label: 'Buổi dạy của bản thân đã công bố',
            state: r.state,
            revision: String(r.revision),
            resource: ref(r.classOfferingId),
          })),
        ),
      );
    }
    if (role === 'COUNSELOR' && wants('SUPPORT'))
      sources.push(
        await this.guarded('SUPPORT', 'W05A', async () => {
          const rows = await this.support.reportActivity(tx, actor, from, to);
          return rows === null
            ? unavailable('SUPPORT', 'W05A', 'NO_CURRENT_SUPPORT_TOPIC_SCOPE')
            : available(
                'SUPPORT',
                'W05A',
                'CURRENT_APPROVED_TOPIC_AND_OWNED_TICKETS',
                rows.map((r) => ({
                  id: r.id,
                  at: r.updatedAt.toISOString(),
                  label: 'Phiếu CSKH trong phạm vi hiện hành',
                  state: r.state,
                  revision: String(r.lockVersion),
                  resource: ref(r.id),
                })),
              );
        }),
      );
    if (
      role === 'COUNSELOR' &&
      wants('CONSULTATION') &&
      ['DEV_DEC059', 'DEV_DEC060'].includes(process.env.W05B_ENABLED ?? '')
    ) {
      const rows = await tx.$queryRaw<
        {
          id: string;
          state: string;
          startsAt: Date;
          createdAt: Date;
          version: number;
          teacherId: string;
        }[]
      >`SELECT id, state::text AS state, "startsAt", "createdAt", version, "teacherId"::text AS "teacherId" FROM w05b_bookings WHERE ("startsAt" >= ${from} AND "startsAt" < ${to}) OR ("createdAt" >= ${from} AND "createdAt" < ${to}) ORDER BY "createdAt" DESC, "startsAt" DESC, id LIMIT 201`;
      sources.push(
        available(
          'CONSULTATION',
          'W05B',
          'W05B_DEV_CONSULTATION_BOOKINGS',
          rows.map((r) => ({
            id: r.id,
            at: (r.createdAt ?? r.startsAt).toISOString(),
            label: 'Lịch tư vấn 1:1 với giảng viên',
            state: r.state,
            revision: String(r.version),
            resource: ref(r.teacherId),
          })),
        ),
      );
    }
    if (
      (role === 'STUDENT' || role === 'ACADEMIC_MANAGER') &&
      wants('CERTIFICATE') &&
      process.env.W09_ENABLED === 'DEV_W09'
    ) {
      const rows =
        role === 'STUDENT'
          ? await tx.$queryRaw<
              {
                id: string;
                certificateCode: string;
                state: string;
                issuedAt: Date;
                classOfferingId: string;
                classCode: string | null;
              }[]
            >`SELECT cert.id, cert."certificateCode", cert.state::text AS state, cert."issuedAt", en."classOfferingId"::text AS "classOfferingId", co.code AS "classCode" FROM w09_certificates cert JOIN enrollments en ON en.id = cert."enrollmentId" LEFT JOIN class_offerings co ON co.id = en."classOfferingId" WHERE en."learnerId" = ${actor.id}::uuid AND cert."issuedAt" >= ${from} AND cert."issuedAt" < ${to} ORDER BY cert."issuedAt" DESC, cert.id LIMIT 201`
          : await tx.$queryRaw<
              {
                id: string;
                certificateCode: string;
                state: string;
                issuedAt: Date;
                classOfferingId: string;
                classCode: string | null;
              }[]
            >`SELECT cert.id, cert."certificateCode", cert.state::text AS state, cert."issuedAt", en."classOfferingId"::text AS "classOfferingId", co.code AS "classCode" FROM w09_certificates cert JOIN enrollments en ON en.id = cert."enrollmentId" LEFT JOIN class_offerings co ON co.id = en."classOfferingId" WHERE cert."issuedAt" >= ${from} AND cert."issuedAt" < ${to} ORDER BY cert."issuedAt" DESC, cert.id LIMIT 201`;
      sources.push(
        available(
          'CERTIFICATE',
          'W09',
          role === 'STUDENT' ? 'W09_OWN_TEST_CERTIFICATES' : 'W09_HVU_TEST_CERTIFICATES',
          rows.map((r) => ({
            id: r.id,
            at: r.issuedAt.toISOString(),
            label: r.classCode
              ? `Chứng chỉ ${r.certificateCode} · Lớp ${r.classCode}`
              : `Chứng chỉ ${r.certificateCode}`,
            state: r.state,
            revision: r.issuedAt.toISOString(),
            resource: ref(r.classOfferingId),
          })),
        ),
      );
    }
    if (role === 'CASHIER' && wants('FINANCE')) {
      let w07Error: HttpException | null = null;
      let w07Source: Source | null = null;
      try {
        const rows = await this.finance.reportActivity(tx, actor, from, to);
        if (rows === null) {
          w07Source = unavailable('FINANCE', 'W07', 'NO_CURRENT_FINANCE_CLASS_SCOPE');
        } else {
          w07Source = available(
            'FINANCE',
            'W07',
            process.env.W10_REPORT_CSV_ENABLED === 'DEV_W10' &&
              process.env.W07_RUN_INTENT === 'DEC049_DISPOSABLE_ONLY'
              ? 'CURRENT_FINANCE_CLASS_SCOPE_DISPOSABLE_MANUAL_TEST_AND_OFFICIAL_EVENTS'
              : 'CURRENT_FINANCE_CLASS_SCOPE_NON_SYNTHETIC_EVENTS_ONLY',
            rows.map((r) => ({
              id: r.id,
              at: r.createdAt.toISOString(),
              label: r.synthetic
                ? `Bút toán học phí MANUAL_TEST (${r.amountVnd} VND)`
                : 'Sự kiện sổ thu phí có nguồn chính thức',
              state: r.kind,
              revision: r.createdAt.toISOString(),
              resource: ref(r.obligationId),
            })),
          );
        }
      } catch (error) {
        if (!(error instanceof HttpException) || ![403, 404, 409].includes(error.getStatus())) {
          throw error;
        }
        w07Error = error;
      }

      const hasUnifiedTuition =
        Boolean((tx as unknown as { tuitionReceivable?: unknown }).tuitionReceivable) &&
        Boolean((tx as unknown as { permissionGrant?: unknown }).permissionGrant);

      if (w07Source && w07Source.state === 'AVAILABLE' && (w07Source.records?.length ?? 0) > 0) {
        sources.push(w07Source);
      } else if (hasUnifiedTuition) {
        const nowRows = await tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`;
        const now = nowRows[0]?.now ?? new Date();
        const financeGrants = await tx.permissionGrant.findMany({
          where: {
            userId: actor.id,
            capability: 'finance.verify',
            approvedBy: { not: null },
            approvedAt: { lte: now },
            effectiveAt: { lte: now },
            expiresAt: { gt: now },
            revokedAt: null,
          },
          select: { scopeType: true, scopeId: true },
        });
        if (financeGrants.length === 0) {
          sources.push(unavailable('FINANCE', 'Q07', 'NO_CURRENT_FINANCE_CLASS_SCOPE'));
        } else {
          const [receivables, receipts, txs, actions] = await Promise.all([
            tx.tuitionReceivable.findMany({
              where: { isTestHarness: false, createdAt: { gte: from, lt: to } },
              select: {
                id: true,
                receivableCode: true,
                amountVnd: true,
                status: true,
                createdAt: true,
                classOfferingId: true,
                classOffering: { select: { code: true } },
              },
              orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
              take: 100,
            }),
            tx.tuitionReceipt.findMany({
              where: { isTestHarness: false, issuedAt: { gte: from, lt: to } },
              select: {
                id: true,
                receiptNumber: true,
                amountVnd: true,
                issuedAt: true,
                classOfferingId: true,
                classOffering: { select: { code: true } },
              },
              orderBy: [{ issuedAt: 'desc' }, { id: 'asc' }],
              take: 100,
            }),
            tx.sePayTuitionTransaction.findMany({
              where: { isTestHarness: false, transactionDate: { gte: from, lt: to } },
              select: {
                id: true,
                amountVnd: true,
                reconciliationState: true,
                transactionDate: true,
                receivable: {
                  select: {
                    classOfferingId: true,
                    classOffering: { select: { code: true } },
                  },
                },
              },
              orderBy: [{ transactionDate: 'desc' }, { id: 'asc' }],
              take: 100,
            }),
            tx.tuitionReconciliationAction.findMany({
              where: {
                createdAt: { gte: from, lt: to },
                transaction: { isTestHarness: false },
              },
              select: {
                id: true,
                action: true,
                nextState: true,
                createdAt: true,
                receivable: {
                  select: {
                    classOfferingId: true,
                    classOffering: { select: { code: true } },
                  },
                },
              },
              orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
              take: 100,
            }),
          ]);
          const fmtVnd = (n: number) => `${n.toLocaleString('vi-VN')} đ`;
          const combined = [
            ...receipts.map((r) => ({
              id: `rcpt:${r.id}`,
              at: r.issuedAt.toISOString(),
              label: `Phiếu thu ${r.receiptNumber} · ${r.classOffering?.code ?? ''} (${fmtVnd(r.amountVnd)})`.trim(),
              state: 'ISSUED',
              revision: r.issuedAt.toISOString(),
              resource: ref(r.classOfferingId),
            })),
            ...txs.map((t) => ({
              id: `tx:${t.id}`,
              at: t.transactionDate.toISOString(),
              label: `Giao dịch chuyển khoản SePay${
                t.receivable?.classOffering?.code ? ` · ${t.receivable.classOffering.code}` : ''
              } (${fmtVnd(t.amountVnd)})`,
              state: t.reconciliationState,
              revision: t.transactionDate.toISOString(),
              resource: ref(t.receivable?.classOfferingId ?? t.id),
            })),
            ...receivables.map((r) => ({
              id: `rcv:${r.id}`,
              at: r.createdAt.toISOString(),
              label: `Khoản phải thu ${r.receivableCode} · ${r.classOffering?.code ?? ''} (${fmtVnd(r.amountVnd)})`.trim(),
              state: r.status,
              revision: r.createdAt.toISOString(),
              resource: ref(r.classOfferingId),
            })),
            ...actions.map((a) => ({
              id: `act:${a.id}`,
              at: a.createdAt.toISOString(),
              label: `Đối soát giao dịch Thu ngân${
                a.receivable?.classOffering?.code ? ` · ${a.receivable.classOffering.code}` : ''
              }`,
              state: a.nextState,
              revision: a.createdAt.toISOString(),
              resource: ref(a.receivable?.classOfferingId ?? a.id),
            })),
          ]
            .sort((a, b) => b.at.localeCompare(a.at))
            .slice(0, 201);
          sources.push(
            available('FINANCE', 'Q07', 'CURRENT_FINANCE_VERIFY_SCOPE_TUITION_LEDGER', combined),
          );
        }
      } else if (w07Error) {
        sources.push(unavailable('FINANCE', 'W07', 'W07_TARGET_GUARD_OR_CURRENT_SCOPE_REQUIRED'));
      } else if (w07Source) {
        sources.push(w07Source);
      }
    }
    if (role === 'TEACHING_INSPECTOR')
      for (const code of ['INSPECTION', 'STAFF_SHIFT'] as const)
        if (wants(code))
          sources.push(
            await this.guarded(code, 'W08', async () => {
              const rows = await this.inspection.reportActivity(tx, actor, from, to, code);
              return available(
                code,
                'W08',
                'CURRENT_INSPECTOR_OWN_ASSIGNMENTS_AND_CLOCKS',
                rows.map((r) =>
                  'startsAt' in r
                    ? {
                        id: r.id,
                        at: r.startsAt.toISOString(),
                        label: 'Ca thanh tra lớp học',
                        state: r.state,
                        revision: String(r.revision),
                        resource: ref(r.id),
                      }
                    : {
                        id: r.id,
                        at: r.createdAt.toISOString(),
                        label: `Ghi nhận ${r.kind === 'IN' ? 'vào ca' : r.kind === 'OUT' ? 'ra ca' : r.kind} thanh tra`,
                        state: r.kind,
                        revision: r.createdAt.toISOString(),
                        resource: ref(r.assignmentId),
                      },
                ),
              );
            }),
          );
    if (role === 'ACADEMIC_MANAGER' && (wants('CLASS_SCHEDULE') || wants('ACADEMIC_DECISIONS'))) {
      const nowRows = await tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`,
        now = nowRows[0].now;
      const grants = await tx.permissionGrant.findMany({
        where: {
          userId: actor.id,
          capability: { in: ['academic.schedule.approve', 'academic.program.approve'] },
          approvedBy: { not: null },
          approvedAt: { lte: now },
          effectiveAt: { lte: now },
          expiresAt: { gt: now },
          revokedAt: null,
        },
        select: { capability: true, scopeType: true, scopeId: true },
      });
      // Match the existing W02 planning read contract: course author OR current
      // resource-scoped schedule/program authority; inherent class.read is insufficient.
      const classes = await tx.classOffering.findMany({
          where: {
            OR: [
              { course: { createdById: actor.id } },
              {
                id: {
                  in: grants
                    .filter(
                      (g) =>
                        g.capability === 'academic.schedule.approve' && g.scopeType === 'CLASS',
                    )
                    .flatMap((g) => (g.scopeId ? [g.scopeId] : [])),
                },
              },
            ],
          },
          select: { id: true },
        }),
        ids = classes.map((c) => c.id);
      if (wants('CLASS_SCHEDULE')) {
        const rows = await tx.teachingSession.findMany({
          where: {
            classOfferingId: { in: ids },
            state: 'PUBLISHED',
            intent: 'PUBLISH',
            startsAt: { gte: from, lt: to },
            replacements: { none: { state: 'PUBLISHED' } },
          },
          select: {
            id: true,
            startsAt: true,
            endsAt: true,
            state: true,
            revision: true,
            classOfferingId: true,
            classOffering: { select: { code: true, name: true } },
            room: { select: { code: true } },
          },
          orderBy: [{ startsAt: 'desc' }, { id: 'asc' }],
          take: 201,
        });
        const fmtHm = (d: Date) =>
          new Intl.DateTimeFormat('vi-VN', {
            timeZone: 'Asia/Ho_Chi_Minh',
            hour: '2-digit',
            minute: '2-digit',
            hourCycle: 'h23',
          }).format(d);
        sources.push(
          available(
            'CLASS_SCHEDULE',
            'W02',
            'W02_CURRENT_CLASS_PLANNING_READ_SCOPE',
            rows.map((r) => ({
              id: r.id,
              at: r.startsAt.toISOString(),
              label: `Buổi học ${r.classOffering?.code ?? ''} (${fmtHm(r.startsAt)}–${fmtHm(r.endsAt)}${
                r.room?.code ? ` · Phòng ${r.room.code}` : ' · Trực tuyến'
              })`.trim(),
              state: r.state,
              revision: String(r.revision),
              resource: ref(r.classOfferingId),
            })),
          ),
        );
      }
      if (wants('ACADEMIC_DECISIONS')) {
        const courseIds = grants
          .filter((g) => g.capability === 'academic.program.approve' && g.scopeType === 'COURSE')
          .flatMap((g) => (g.scopeId ? [g.scopeId] : []));
        const rows = await tx.$queryRaw<
          {
            id: string;
            at: Date;
            state: string;
            revision: number;
            resource: string;
            kind: string;
            targetLabel: string | null;
          }[]
        >(Prisma.sql`
          SELECT * FROM (
            SELECT s.id,s."approvedAt" AS at,s.state::text,s.revision,s."classOfferingId"::text AS resource,'SESSION' AS kind, co.code AS "targetLabel"
            FROM teaching_sessions s
            JOIN class_offerings co ON co.id = s."classOfferingId"
            WHERE s."classOfferingId"=ANY(${ids}::uuid[]) AND s."approvedAt">=${from} AND s."approvedAt"<${to} AND s."approvedBy" IS NOT NULL
            UNION ALL
            SELECT a.id,a."approvedAt",a.state::text,a."lockVersion",a."classOfferingId"::text,'ASSIGNMENT', co.code
            FROM class_instructor_assignments a
            JOIN class_offerings co ON co.id = a."classOfferingId"
            WHERE a."classOfferingId"=ANY(${ids}::uuid[]) AND a."approvedAt">=${from} AND a."approvedAt"<${to} AND a."approvedBy" IS NOT NULL
            UNION ALL
            SELECT v.id,v."approvedAt",v.state::text,v.number,v."courseId"::text,'PROGRAM', c.title
            FROM course_versions v
            JOIN courses c ON c.id=v."courseId"
            WHERE (c."createdById"=${actor.id}::uuid OR v."courseId"=ANY(${courseIds}::uuid[])) AND v."approvedAt">=${from} AND v."approvedAt"<${to} AND v."approvedBy" IS NOT NULL
          ) d ORDER BY at DESC,id LIMIT 201`);
        const kindVi: Record<string, string> = {
          SESSION: 'Phê duyệt buổi học',
          ASSIGNMENT: 'Phê duyệt phân công GV',
          PROGRAM: 'Phê duyệt phiên bản chương trình',
        };
        sources.push(
          available(
            'ACADEMIC_DECISIONS',
            'W02',
            'W02_CURRENT_CLASS_OR_PROGRAM_READ_SCOPE',
            rows.map((r) => ({
              id: r.id,
              at: r.at.toISOString(),
              label: r.targetLabel
                ? `${kindVi[r.kind] ?? `Quyết định ${r.kind}`} · ${r.targetLabel}`
                : `Quyết định ${r.kind} đã ghi nhận`,
              state: r.state,
              revision: String(r.revision),
              resource: ref(r.resource),
            })),
          ),
        );
      }
    }
    if (role === 'SYSTEM_ADMIN' && (wants('AUTHORITY_EVENTS') || wants('RUNTIME_PROBE'))) {
      const permitted = await this.authority.permits(
        actor.id,
        'accounts.manage',
        { type: 'GLOBAL' },
        tx,
      );
      if (wants('AUTHORITY_EVENTS')) {
        if (!permitted)
          sources.push(
            unavailable('AUTHORITY_EVENTS', 'W01', 'CURRENT_ACCOUNTS_SOURCE_READ_REQUIRED'),
          );
        else {
          const rows = await tx.domainAuditEvent.findMany({
            where: {
              createdAt: { gte: from, lt: to },
              objectType: { in: ['USER', 'GRANT', 'ROLE_DECISION'] },
              action: {
                in: [
                  'GRANT_REQUEST',
                  'GRANT_APPROVE',
                  'GRANT_REVOKE',
                  'ROLE_REQUEST',
                  'ROLE_APPROVE',
                  'ACCOUNT_CREATE',
                  'ACCOUNT_STATUS',
                  'RECOVERY_AUTHORITY_REVOKE',
                ],
              },
            },
            select: { id: true, createdAt: true, action: true, decision: true, objectId: true },
            orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
            take: 201,
          });
          sources.push(
            available(
              'AUTHORITY_EVENTS',
              'W01',
              'EXISTING_W01_AUTHORITY_OVERVIEW_REDACTED_ACCOUNT_GRANT_EVENTS',
              rows.map((r) => ({
                id: r.id,
                at: r.createdAt.toISOString(),
                label: r.action,
                state: r.decision,
                revision: r.createdAt.toISOString(),
                resource: ref(r.objectId),
              })),
            ),
          );
        }
      }
      if (wants('RUNTIME_PROBE')) {
        if (!permitted)
          sources.push(
            unavailable('RUNTIME_PROBE', 'W10', 'CURRENT_ACCOUNTS_SOURCE_READ_REQUIRED'),
          );
        else {
          const [probe] = await tx.$queryRaw<
            { at: Date; value: number }[]
          >`SELECT clock_timestamp() AS at,1::int AS value`;
          const inWindow = probe.at >= from && probe.at < to;
          sources.push(
            available(
              'RUNTIME_PROBE',
              'W10',
              'CURRENT_TECHNICAL_SESSION_DATABASE_QUERY_ONLY',
              inWindow
                ? [
                    {
                      id: 'database-query',
                      at: probe.at.toISOString(),
                      label:
                        'API thực thi SELECT 1 tới PostgreSQL — chỉ xác nhận đường truy vấn này',
                      state: probe.value === 1 ? 'QUERY_SUCCEEDED' : 'UNKNOWN',
                      revision: probe.at.toISOString(),
                      resource: 'POSTGRES_QUERY',
                    },
                  ]
                : [],
            ),
          );
        }
      }
    }
    return sources;
  }
}
