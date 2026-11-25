import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import type { AuthorityActor } from '../authorization/authorization.service';
import { ClassLmsService } from '../class-lms/class-lms.service';
import { CAPABILITIES } from '../authorization/permission.policy';
import { BUSINESS_ROLES } from '../authorization/permission.policy';
import { safeSupportText } from '../support/support.policy';

const ALLOWLISTED_CONFIG_CODES = [
  'EMAIL_PROVIDER',
  'SMTP_CREDENTIALS',
  'SEPAY_WEBHOOK_SECRET',
  'SEPAY_API_TOKEN',
  'REPORT_CENTER_TIME_ZONE',
  'AI_EXTERNAL_PROVIDER',
] as const;

function redactAuditReason(reason?: string | null): string {
  if (!reason) return '';
  if (/(password|secret|token|apikey|api_key)\s*[:=]/i.test(reason)) {
    return '[REDACTED_SENSITIVE_DETAIL]';
  }
  return reason;
}

/** Real session-bound API, deliberately cannot upgrade offline claims to authority. */
@Injectable()
export class OperationsRuntimeService {
  constructor(
    private readonly db: PrismaService,
    private readonly lms: ClassLmsService,
  ) {}
  readiness(actor: AuthorityActor) {
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(842030)`;
      const user = await this.lms.context(tx, actor);
      if (!BUSINESS_ROLES.includes(user.role)) throw new ForbiddenException();
      const required = [
        'cms.draft',
        'cms.review',
        'cms.publish',
        'ops.config.change',
        'ops.audit.read',
        'report.view',
        'report.export',
      ];
      const missingCapabilities = required.filter(
        (c) => !(CAPABILITIES as readonly string[]).includes(c),
      );
      const w09Enabled =
        process.env.W09_ENABLED === 'DEV_W09' && process.env.NODE_ENV !== 'production';
      let w09Source: {
        domain: 'W09_CERTIFICATE';
        state: 'AVAILABLE' | 'DEGRADED' | 'UNAVAILABLE';
        reason: string;
      } = {
        domain: 'W09_CERTIFICATE',
        state: 'UNAVAILABLE',
        reason: 'ISSUANCE_NOT_IMPLEMENTED',
      };
      if (w09Enabled) {
        try {
          const stats = await tx.$queryRaw<
            { approvedPolicies: number; draftPolicies: number; issuedCerts: number }[]
          >`
            SELECT
              (SELECT count(*)::int FROM w09_completion_policies WHERE state = 'APPROVED') AS "approvedPolicies",
              (SELECT count(*)::int FROM w09_completion_policies WHERE state = 'DRAFT') AS "draftPolicies",
              (SELECT count(*)::int FROM w09_certificates WHERE state = 'ISSUED') AS "issuedCerts"
          `;
          const s = stats?.[0];
          w09Source =
            s && s.approvedPolicies > 0
              ? {
                  domain: 'W09_CERTIFICATE',
                  state: 'AVAILABLE',
                  reason: `W09_ACTIVE_POLICIES_${s.approvedPolicies}_CERTIFICATES_${s.issuedCerts}`,
                }
              : {
                  domain: 'W09_CERTIFICATE',
                  state: 'DEGRADED',
                  reason: 'NO_APPROVED_COMPLETION_POLICY_YET',
                };
        } catch {
          w09Source = {
            domain: 'W09_CERTIFICATE',
            state: 'UNAVAILABLE',
            reason: 'W09_SCHEMA_UNAVAILABLE',
          };
        }
      }

      let w01Source: { domain: string; state: string; reason: string } = {
        domain: 'W01_AUTHORITY',
        state: 'UNVERIFIED',
        reason: 'W10_CAPABILITY_SCOPE_AND_AUDIT_READER_REQUIRED',
      };
      let w02Source: { domain: string; state: string; reason: string } = {
        domain: 'W02_W03_W04_W06_W07_W08',
        state: 'UNVERIFIED',
        reason: 'APPROVED_METRICS_AND_SCOPED_READERS_REQUIRED',
      };
      let w05bSource: { domain: string; state: string; reason: string } = {
        domain: 'W05B_CONSULTATION',
        state: 'UNVERIFIED',
        reason: 'REAL_CLOCK_ACCEPTANCE_DEFERRED',
      };
      try {
        const liveCounts = await tx.$queryRaw<
          {
            activeUsers: number;
            activeGrants: number;
            openClasses: number;
            activeEnrollments: number;
            consultProfiles: number;
            consultBookings: number;
          }[]
        >`
          SELECT
            (SELECT count(*)::int FROM users WHERE status = 'ACTIVE') AS "activeUsers",
            (SELECT count(*)::int FROM permission_grants WHERE "revokedAt" IS NULL AND ("expiresAt" IS NULL OR "expiresAt" > NOW())) AS "activeGrants",
            (SELECT count(*)::int FROM class_offerings WHERE status IN ('OPEN', 'IN_PROGRESS')) AS "openClasses",
            (SELECT count(*)::int FROM enrollments WHERE status = 'ACTIVE') AS "activeEnrollments",
            (SELECT count(*)::int FROM w05b_profiles) AS "consultProfiles",
            (SELECT count(*)::int FROM w05b_bookings) AS "consultBookings"
        `;
        const row = liveCounts?.[0];
        if (row && typeof row.activeUsers === 'number') {
          w01Source = {
            domain: 'W01_AUTHORITY',
            state: 'AVAILABLE',
            reason: `W01_LIVE_${row.activeUsers}_USERS_${row.activeGrants}_GRANTS`,
          };
          w02Source = {
            domain: 'W02_W03_W04_W06_W07_W08',
            state: 'AVAILABLE',
            reason: `W02_W08_LIVE_${row.openClasses}_CLASSES_${row.activeEnrollments}_ENROLLMENTS`,
          };
          w05bSource = {
            domain: 'W05B_CONSULTATION',
            state: 'AVAILABLE',
            reason: `W05B_LIVE_${row.consultProfiles}_PROFILES_${row.consultBookings}_BOOKINGS`,
          };
        }
      } catch {
        // Preserve safe UNVERIFIED fallback when mock/minimal DB lacks full module tables
      }

      return {
        viewerId: user.id,
        role: user.role,
        mode: 'INTEGRATION_BLOCKED' as const,
        // A valid session proves identity, not the absent W10 resource grants.
        runtimeAuthorized: false,
        publicationAvailable: false,
        exportAvailable: false,
        health: 'UNKNOWN' as const,
        missingCapabilities,
        sources: [w01Source, w02Source, w05bSource, w09Source],
      };
    });
  }
  async unavailableAction(actor: AuthorityActor) {
    await this.readiness(actor);
    // Do not reinterpret accounts.manage, a caller role, or GLOBAL as W10 scope.
    throw new ForbiddenException({
      code: 'W10_AUTHORITY_SOURCE_INTEGRATION_REQUIRED',
      message: 'Approved capability scopes, source readers and durable workflow are required',
    });
  }

  systemConfig(actor: AuthorityActor) {
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(842030)`;
      const user = await this.lms.context(tx, actor);
      if (user.role !== 'SYSTEM_ADMIN') {
        throw new ForbiddenException(
          'Chỉ Quản trị viên hệ thống (QT) được phép xem cấu hình dịch vụ.',
        );
      }
      const proposals = tx.domainAuditEvent?.findMany
        ? await tx.domainAuditEvent.findMany({
            where: {
              objectType: 'SYSTEM_CONFIG',
              action: 'CONFIG_CHANGE_PROPOSED',
            },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take: 25,
            select: {
              id: true,
              actorId: true,
              objectId: true,
              decision: true,
              reason: true,
              createdAt: true,
            },
          })
        : [];
      return {
        viewerId: user.id,
        role: user.role,
        checkedAt: new Date().toISOString(),
        settings: [
          {
            code: 'EMAIL_PROVIDER',
            category: 'EMAIL_RECOVERY',
            sensitivity: 'ORDINARY',
            configured: Boolean(process.env.EMAIL_PROVIDER),
            maskedValue: process.env.EMAIL_PROVIDER ?? 'noop',
            connectionState:
              process.env.EMAIL_PROVIDER === 'smtp' && process.env.SMTP_HOST
                ? 'CONFIGURED_TEST_TRANSPORT'
                : 'SAFE_NOOP_TRANSPORT',
            operatorNote:
              'Cần cấu hình SMTP chính thức được PO phê duyệt trước khi mở gửi mail LIVE.',
          },
          {
            code: 'SMTP_CREDENTIALS',
            category: 'EMAIL_RECOVERY',
            sensitivity: 'SENSITIVE',
            configured: Boolean(process.env.SMTP_HOST && process.env.SMTP_PASS),
            maskedValue: '••••••••',
            connectionState: Boolean(process.env.SMTP_HOST && process.env.SMTP_PASS)
              ? 'MASKED_CONFIGURED'
              : 'UNCONFIGURED',
            operatorNote: 'Thông tin xác thực SMTP luôn được che mật khẩu trên giao diện và API.',
          },
          {
            code: 'SEPAY_WEBHOOK_SECRET',
            category: 'FINANCE_SEPAY',
            sensitivity: 'SENSITIVE',
            configured: Boolean(process.env.SEPAY_WEBHOOK_SECRET),
            maskedValue: '••••••••',
            connectionState: 'GUARDED_NON_LIVE',
            operatorNote:
              'Guard 503 bảo vệ QA/production; chỉ mở đối soát tự động khi PO cấp secret LIVE.',
          },
          {
            code: 'SEPAY_API_TOKEN',
            category: 'FINANCE_SEPAY',
            sensitivity: 'SENSITIVE',
            configured: Boolean(process.env.SEPAY_API_TOKEN),
            maskedValue: '••••••••',
            connectionState: 'GUARDED_NON_LIVE',
            operatorNote: 'Token đối soát SePay luôn được che giá trị thực (••••••••).',
          },
          {
            code: 'REPORT_CENTER_TIME_ZONE',
            category: 'REPORTING',
            sensitivity: 'ORDINARY',
            configured: process.env.REPORT_CENTER_TIME_ZONE === 'Asia/Ho_Chi_Minh',
            maskedValue: process.env.REPORT_CENTER_TIME_ZONE ?? 'UNCONFIGURED',
            connectionState:
              process.env.REPORT_CENTER_TIME_ZONE === 'Asia/Ho_Chi_Minh'
                ? 'VERIFIED_TIMEZONE'
                : 'UNCONFIGURED',
            operatorNote: 'Múi giờ trung tâm chuẩn hóa cửa sổ báo cáo cuối ngày UTC+7.',
          },
          {
            code: 'AI_EXTERNAL_PROVIDER',
            category: 'ADAPTIVE_AI',
            sensitivity: 'SENSITIVE',
            configured: Boolean(process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY),
            maskedValue: '••••••••',
            connectionState:
              process.env.PLACEMENT_AI_ADVISORY_PROVIDER === 'GEMINI' &&
              process.env.PLACEMENT_AI_ADVISORY_STAGING_ENABLED === 'true' &&
              Boolean(process.env.GEMINI_API_KEY)
                ? 'GEMINI_ADVISORY_ACTIVE'
                : 'RULE_BASED_FALLBACK_ACTIVE',
            operatorNote:
              process.env.PLACEMENT_AI_ADVISORY_PROVIDER === 'GEMINI' &&
              process.env.PLACEMENT_AI_ADVISORY_STAGING_ENABLED === 'true' &&
              Boolean(process.env.GEMINI_API_KEY)
                ? `Gemini AI (${process.env.GEMINI_ADVISORY_MODEL ?? 'gemini-3.5-flash-lite'}) đang bật cho chẩn đoán & gợi ý lộ trình Placement.`
                : 'Hệ thống đang dùng rule-based engine; cần API key được duyệt để bật LLM mở rộng.',
          },
        ],
        proposals: proposals.map((p) => ({
          id: p.id,
          actorId: p.actorId,
          settingCode: p.objectId,
          decision: p.decision,
          reason: redactAuditReason(p.reason),
          createdAt: p.createdAt.toISOString(),
        })),
      };
    });
  }

  proposeConfigChange(
    actor: AuthorityActor,
    input: { settingCode?: string; proposedState?: string; reason?: string },
  ) {
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(842030)`;
      const user = await this.lms.context(tx, actor);
      if (user.role !== 'SYSTEM_ADMIN') {
        throw new ForbiddenException(
          'Chỉ Quản trị viên hệ thống (QT) được phép đề xuất thay đổi cấu hình.',
        );
      }
      const code = (input.settingCode ?? '').trim();
      if (!(ALLOWLISTED_CONFIG_CODES as readonly string[]).includes(code)) {
        throw new BadRequestException('Mã cấu hình không nằm trong danh mục cho phép.');
      }
      const reason = (input.reason ?? '').trim();
      if (reason.length < 10 || reason.length > 500) {
        throw new BadRequestException('Lý do đề xuất thay đổi cấu hình phải từ 10 đến 500 ký tự.');
      }
      if (/(password|secret|token|apikey|api_key)\s*[:=]/i.test(reason)) {
        throw new BadRequestException(
          'Không được đính kèm mật khẩu hoặc khóa bí mật trực tiếp vào lý do đề xuất.',
        );
      }
      const proposedState = (input.proposedState ?? 'REQUEST_OPERATOR_UPDATE').trim().slice(0, 80);
      const event = await tx.domainAuditEvent.create({
        data: {
          actorId: user.id,
          action: 'CONFIG_CHANGE_PROPOSED',
          objectType: 'SYSTEM_CONFIG',
          objectId: code,
          decision: 'PENDING_OPERATOR_REVIEW',
          reason: `[${proposedState}] ${reason}`,
        },
      });
      return {
        id: event.id,
        settingCode: code,
        proposedState,
        decision: event.decision,
        reason: event.reason,
        createdAt: event.createdAt.toISOString(),
      };
    });
  }

  systemAudit(
    actor: AuthorityActor,
    query: { action?: string; objectType?: string; search?: string; limit?: string },
  ) {
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(842030)`;
      const user = await this.lms.context(tx, actor);
      if (user.role !== 'SYSTEM_ADMIN') {
        throw new ForbiddenException(
          'Chỉ Quản trị viên hệ thống (QT) được phép truy vấn nhật ký hệ thống.',
        );
      }
      const [probe] = await tx.$queryRaw<
        { checkedAt: Date; activeSessions: number; totalUsers: number }[]
      >`SELECT clock_timestamp() AS "checkedAt", (SELECT count(*)::int FROM user_sessions WHERE expire > clock_timestamp()) AS "activeSessions", (SELECT count(*)::int FROM users) AS "totalUsers"`;
      const actionFilter = query.action?.trim() || undefined;
      const objectTypeFilter = query.objectType?.trim() || undefined;
      const searchFilter = query.search?.trim() || undefined;
      const take = Math.min(Math.max(Number(query.limit) || 50, 1), 100);

      const where = {
        ...(actionFilter && actionFilter !== 'ALL' ? { action: actionFilter } : {}),
        ...(objectTypeFilter && objectTypeFilter !== 'ALL' ? { objectType: objectTypeFilter } : {}),
        ...(searchFilter
          ? {
              OR: [
                { action: { contains: searchFilter, mode: 'insensitive' as const } },
                { objectType: { contains: searchFilter, mode: 'insensitive' as const } },
                { objectId: { contains: searchFilter, mode: 'insensitive' as const } },
                { reason: { contains: searchFilter, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      };

      const rows = await tx.domainAuditEvent.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take,
        select: {
          id: true,
          actorId: true,
          action: true,
          objectType: true,
          objectId: true,
          decision: true,
          reason: true,
          createdAt: true,
        },
      });

      return {
        viewerId: user.id,
        role: user.role,
        health: {
          status: 'HEALTHY',
          database: 'CONNECTED',
          activeSessions: probe?.activeSessions ?? 0,
          totalUsers: probe?.totalUsers ?? 0,
          checkedAt: (probe?.checkedAt ?? new Date()).toISOString(),
        },
        filters: {
          action: actionFilter ?? 'ALL',
          objectType: objectTypeFilter ?? 'ALL',
          search: searchFilter ?? '',
        },
        events: rows.map((r) => ({
          id: r.id,
          actorId: r.actorId,
          action: r.action,
          objectType: r.objectType,
          objectId: r.objectId,
          decision: r.decision,
          reason: redactAuditReason(r.reason),
          createdAt: r.createdAt.toISOString(),
        })),
      };
    });
  }

  listTechnicalEscalations(
    actor: AuthorityActor,
    query: { status?: string; search?: string },
  ) {
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(842031)`;
      const user = await this.lms.context(tx, actor);
      if (user.role !== 'SYSTEM_ADMIN') {
        throw new ForbiddenException('Chỉ Quản trị viên hệ thống (QT) được xem hàng đợi sự cố kỹ thuật.');
      }
      const [reg] = await tx.$queryRaw<
        { tbl: string | null }[]
      >`SELECT to_regclass('public.support_technical_escalations')::text AS tbl`;
      if (!reg?.tbl) {
        return { viewerId: user.id, role: user.role, escalations: [] };
      }
      type EscalationRow = {
        id: string;
        ticketId: string;
        ticketRef: string;
        ticketTitle: string;
        ticketState: string;
        topicCode: string;
        topicTitle: string;
        incidentCategory: string;
        summary: string;
        reason: string;
        affectedRoute: string | null;
        affectedAccountEmail: string | null;
        status: string;
        resolutionNote: string | null;
        createdById: string;
        createdByName: string;
        createdByEmail: string;
        learnerId: string;
        learnerName: string;
        learnerEmail: string;
        assignedAdminId: string | null;
        assignedAdminName: string | null;
        resolvedByName: string | null;
        respondedAt: Date | null;
        createdAt: Date;
      };
      const rows = await tx.$queryRaw<EscalationRow[]>`
        SELECT e.id,
               e.ticket_id AS "ticketId",
               t.reference AS "ticketRef",
               CASE
                 WHEN char_length(t.description) > 120
                   THEN trim(regexp_replace(LEFT(t.description, 120), '\\s+\\S*$', '')) || '…'
                 ELSE t.description
               END AS "ticketTitle",
               t.state AS "ticketState",
               tp.code AS "topicCode",
               tp.title AS "topicTitle",
               e.incident_category AS "incidentCategory",
               e.summary,
               e.reason,
               e.affected_route AS "affectedRoute",
               e.affected_account_email AS "affectedAccountEmail",
               e.status,
               e.resolution_note AS "resolutionNote",
               e.created_by_id AS "createdById",
               cu."fullName" AS "createdByName",
               cu.email AS "createdByEmail",
               t."learnerId" AS "learnerId",
               lu."fullName" AS "learnerName",
               lu.email AS "learnerEmail",
               e.assigned_admin_id AS "assignedAdminId",
               au."fullName" AS "assignedAdminName",
               ru."fullName" AS "resolvedByName",
               e.responded_at AS "respondedAt",
               e.created_at AS "createdAt"
        FROM support_technical_escalations e
        JOIN support_tickets t ON t.id = e.ticket_id
        JOIN support_topics tp ON tp.id = t."topicId"
        JOIN users cu ON cu.id = e.created_by_id
        LEFT JOIN users lu ON lu.id = t."learnerId"
        LEFT JOIN users au ON au.id = e.assigned_admin_id
        LEFT JOIN users ru ON ru.id = e.resolved_by_id
        ORDER BY CASE WHEN e.status IN ('OPEN', 'IN_REVIEW') THEN 0 ELSE 1 END,
                 e.created_at DESC
        LIMIT 100
      `;
      const ticketIds = [...new Set(rows.map((r) => r.ticketId))];
      const attachments = ticketIds.length
        ? await tx.supportTicketAttachment.findMany({
            where: { ticketId: { in: ticketIds } },
            select: {
              id: true,
              ticketId: true,
              originalName: true,
              mimeType: true,
              byteSize: true,
            },
          })
        : [];
      const statusFilter = query.status?.trim();
      const searchFilter = query.search?.trim().toLowerCase();
      const filtered = rows.filter((r) => {
        if (statusFilter && statusFilter !== 'ALL' && r.status !== statusFilter) return false;
        if (searchFilter) {
          const hay = [
            r.ticketRef,
            r.ticketTitle,
            r.summary,
            r.affectedRoute ?? '',
            r.affectedAccountEmail ?? '',
            r.learnerName,
            r.learnerEmail,
            r.incidentCategory,
          ]
            .join(' ')
            .toLowerCase();
          if (!hay.includes(searchFilter)) return false;
        }
        return true;
      });
      return {
        viewerId: user.id,
        role: user.role,
        escalations: filtered.map((r) => ({
          ...r,
          respondedAt: r.respondedAt ? r.respondedAt.toISOString() : null,
          createdAt: r.createdAt.toISOString(),
          attachments: attachments.filter((att) => att.ticketId === r.ticketId),
        })),
      };
    });
  }

  respondTechnicalEscalation(
    actor: AuthorityActor,
    escalationId: string,
    body: { status?: string; resolutionNote?: string; replyToLearner?: boolean },
  ) {
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(842031)`;
      const user = await this.lms.context(tx, actor);
      if (user.role !== 'SYSTEM_ADMIN') {
        throw new ForbiddenException('Chỉ Quản trị viên hệ thống (QT) được xử lý sự cố kỹ thuật.');
      }
      if (!/^[0-9a-f-]{36}$/i.test(escalationId)) {
        throw new BadRequestException('Mã sự cố kỹ thuật không hợp lệ.');
      }
      const nextStatus = (body.status ?? '').trim();
      if (!['IN_REVIEW', 'RESOLVED', 'RETURNED_TO_COUNSELOR'].includes(nextStatus)) {
        throw new BadRequestException(
          'Trạng thái phản hồi phải là IN_REVIEW, RESOLVED hoặc RETURNED_TO_COUNSELOR.',
        );
      }
      const note = (body.resolutionNote ?? '').trim();
      if (note.length < 5 || note.length > 2000) {
        throw new BadRequestException('Nội dung xử lý kỹ thuật phải từ 5 đến 2000 ký tự.');
      }
      const existingRows = await tx.$queryRaw<
        { id: string; ticketId: string; status: string }[]
      >`
        SELECT id, ticket_id AS "ticketId", status
        FROM support_technical_escalations
        WHERE id = ${escalationId}::uuid
        LIMIT 1
      `;
      const existing = existingRows[0];
      if (!existing) {
        throw new NotFoundException('Không tìm thấy yêu cầu sự cố kỹ thuật.');
      }
      const ticket = await tx.supportTicket.findUnique({ where: { id: existing.ticketId } });
      if (!ticket) {
        throw new NotFoundException('Không tìm thấy phiếu hỗ trợ gốc.');
      }
      await tx.$executeRaw`SET LOCAL TIME ZONE 'UTC'`;
      await tx.$queryRaw`SELECT set_config('app.support_actor', ${user.id}, true), set_config('app.support_session', ${actor.sessionId}, true)`;
      const now = new Date();
      if (nextStatus === 'IN_REVIEW') {
        await tx.$executeRaw`
          UPDATE support_technical_escalations
          SET status = 'IN_REVIEW',
              assigned_admin_id = COALESCE(assigned_admin_id, ${user.id}::uuid),
              resolution_note = ${safeSupportText(note)},
              responded_at = ${now},
              updated_at = ${now}
          WHERE id = ${escalationId}::uuid
        `;
        await tx.supportEvent.create({
          data: {
            ticketId: ticket.id,
            actorId: user.id,
            kind: 'TECHNICAL_REVIEW',
            reason: safeSupportText(note),
            publicLabel: 'Quản trị hệ thống đang kiểm tra sự cố kỹ thuật',
          },
        });
        await tx.domainAuditEvent.create({
          data: {
            actorId: user.id,
            action: 'SUPPORT_TECHNICAL_ESCALATION_IN_REVIEW',
            objectType: 'SupportTicket',
            objectId: ticket.id,
            decision: 'ALLOW',
            reason: safeSupportText(note),
          },
        });
        return {
          id: escalationId,
          ticketId: ticket.id,
          status: 'IN_REVIEW',
          ticketState: ticket.state,
          respondedAt: now.toISOString(),
        };
      }

      await tx.$executeRaw`
        UPDATE support_technical_escalations
        SET status = ${nextStatus},
            resolved_by_id = ${user.id}::uuid,
            assigned_admin_id = COALESCE(assigned_admin_id, ${user.id}::uuid),
            resolution_note = ${safeSupportText(note)},
            responded_at = ${now},
            updated_at = ${now}
        WHERE id = ${escalationId}::uuid
      `;

      const [openRefCount, otherOpenEscRows] = await Promise.all([
        tx.supportReferral.count({ where: { ticketId: ticket.id, state: 'OPEN' } }),
        tx.$queryRaw<{ id: string }[]>`
          SELECT id
          FROM support_technical_escalations
          WHERE ticket_id = ${ticket.id}::uuid
            AND id <> ${escalationId}::uuid
            AND status IN ('OPEN', 'IN_REVIEW')
          LIMIT 1
        `,
      ]);
      let nextTicketState = ticket.state;
      if (openRefCount === 0 && otherOpenEscRows.length === 0 && ticket.state === 'WAITING_SPECIALIST') {
        await tx.supportTicket.update({
          where: { id: ticket.id },
          data: {
            state: 'IN_PROGRESS',
            lockVersion: { increment: 1 },
            updatedAt: now,
          },
        });
        nextTicketState = 'IN_PROGRESS';
      }

      await tx.supportMessage.create({
        data: {
          ticketId: ticket.id,
          actorId: user.id,
          visibility: body.replyToLearner ? 'PUBLIC' : 'INTERNAL',
          body: safeSupportText(`[Quản trị hệ thống - ${nextStatus}]: ${note}`),
        },
      });
      await tx.supportEvent.create({
        data: {
          ticketId: ticket.id,
          actorId: user.id,
          kind: 'TECHNICAL_RESOLUTION',
          reason: safeSupportText(note),
          publicLabel:
            nextStatus === 'RESOLVED'
              ? 'Quản trị hệ thống đã xử lý sự cố kỹ thuật'
              : 'Quản trị hệ thống đã phản hồi và chuyển lại Nhân viên tư vấn',
        },
      });
      await tx.domainAuditEvent.create({
        data: {
          actorId: user.id,
          action: `SUPPORT_TECHNICAL_ESCALATION_${nextStatus}`,
          objectType: 'SupportTicket',
          objectId: ticket.id,
          decision: 'ALLOW',
          reason: safeSupportText(note),
        },
      });

      return {
        id: escalationId,
        ticketId: ticket.id,
        status: nextStatus,
        ticketState: nextTicketState,
        respondedAt: now.toISOString(),
      };
    });
  }
}
