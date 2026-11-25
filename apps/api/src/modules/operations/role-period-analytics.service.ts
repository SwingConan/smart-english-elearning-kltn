import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuthorizationService } from '../authorization/authorization.service';
import {
  currentAssignmentWindow,
  effectiveInstructorScope,
} from '../authorization/instructor-scope';
import { ClassLmsService } from '../class-lms/class-lms.service';

type Tx = Prisma.TransactionClient;

export type PeriodPreset = 'TODAY' | 'LAST_7D' | 'THIS_MONTH' | 'LAST_MONTH' | 'ALL' | 'CUSTOM';
export type SupportedPeriodRole =
  | 'COUNSELOR'
  | 'ACADEMIC_MANAGER'
  | 'INSTRUCTOR'
  | 'STUDENT'
  | 'TEACHING_INSPECTOR'
  | 'SYSTEM_ADMIN';

export interface PeriodReportActor {
  id: string;
  sessionId?: string;
}

export interface PeriodReportQuery {
  preset?: string;
  from?: string;
  to?: string;
  scopeId?: string;
}

export interface PeriodKpiCard {
  id: string;
  label: string;
  value: string | number;
  sublabel: string;
  tone: 'indigo' | 'emerald' | 'amber' | 'sky' | 'rose' | 'slate';
}

export interface PeriodChartSeries {
  name: string;
  type: 'bar' | 'line';
  color: string;
  data: number[];
}

export interface PeriodBreakdownColumn {
  key: string;
  label: string;
  align?: 'left' | 'right' | 'center';
}

export type PeriodReportRow = Record<string, string | number | null | undefined>;

export interface PeriodSecondaryPanel {
  title: string;
  subtitle: string;
  columns: PeriodBreakdownColumn[];
  rows: PeriodReportRow[];
}

export interface PeriodLedgerRow extends PeriodReportRow {
  id: string;
  href?: string | null;
  hrefLabel?: string | null;
}

export interface PeriodAnalyticsReport {
  role: SupportedPeriodRole;
  roleLabel: string;
  reportTitle: string;
  reportSubtitle: string;
  generatedAt: string;
  timezone: string;
  actor: { id: string; fullName: string; role: string };
  filters: {
    preset: PeriodPreset;
    from: string;
    to: string;
    scopeId: string | null;
    scopeLabel: string;
    scopeSelectLabel: string;
    scopeOptions: Array<{ id: string; label: string }>;
  };
  kpis: PeriodKpiCard[];
  executiveSummary: string[];
  charts: {
    trend: {
      title: string;
      subtitle: string;
      labels: string[];
      series: PeriodChartSeries[];
    };
    distribution: {
      title: string;
      subtitle: string;
      kind: 'pie' | 'bar';
      items: Array<{ name: string; value: number; color?: string }>;
    };
  };
  breakdown: {
    title: string;
    subtitle: string;
    columns: PeriodBreakdownColumn[];
    rows: PeriodReportRow[];
    totals: PeriodReportRow;
  };
  secondaryPanel: PeriodSecondaryPanel | null;
  ledger: {
    title: string;
    subtitle: string;
    columns: PeriodBreakdownColumn[];
    rows: PeriodLedgerRow[];
  };
  exportFilenameBase: string;
}

interface PeriodWindow {
  preset: PeriodPreset;
  from: string;
  to: string;
  startAt: Date;
  endExclusive: Date;
  granularity: 'day' | 'month';
  bucketKeys: string[];
  bucketLabels: string[];
}

const VALID_PRESETS: readonly PeriodPreset[] = [
  'TODAY',
  'LAST_7D',
  'THIS_MONTH',
  'LAST_MONTH',
  'ALL',
  'CUSTOM',
];

const SUPPORTED_ROLES: readonly SupportedPeriodRole[] = [
  'COUNSELOR',
  'ACADEMIC_MANAGER',
  'INSTRUCTOR',
  'STUDENT',
  'TEACHING_INSPECTOR',
  'SYSTEM_ADMIN',
];

const SERIES_PALETTE = [
  '#4f46e5',
  '#10b981',
  '#f59e0b',
  '#0ea5e9',
  '#ec4899',
  '#8b5cf6',
  '#64748b',
];

function isValidYmd(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function formatYmdCenter(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function addDaysYmd(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  return dt.toISOString().slice(0, 10);
}

function ymdToCenterMidnightUtc(ymd: string): Date {
  // Center timezone is Asia/Ho_Chi_Minh (fixed UTC+7, no DST).
  return new Date(`${ymd}T00:00:00.000+07:00`);
}

function ymdEndExclusiveUtc(ymd: string): Date {
  return new Date(ymdToCenterMidnightUtc(addDaysYmd(ymd, 1)).getTime());
}

function monthDayCount(year: number, monthIndexZero: number): number {
  return new Date(Date.UTC(year, monthIndexZero + 1, 0)).getUTCDate();
}

function buildBuckets(
  from: string,
  to: string,
): { granularity: 'day' | 'month'; bucketKeys: string[]; bucketLabels: string[] } {
  const startMs = ymdToCenterMidnightUtc(from).getTime();
  const endMs = ymdToCenterMidnightUtc(to).getTime();
  const daySpan = Math.floor((endMs - startMs) / 86_400_000) + 1;
  if (daySpan <= 45) {
    const keys: string[] = [];
    const labels: string[] = [];
    for (let i = 0; i < daySpan; i += 1) {
      const k = addDaysYmd(from, i);
      keys.push(k);
      labels.push(`${k.slice(8, 10)}/${k.slice(5, 7)}`);
    }
    return { granularity: 'day', bucketKeys: keys, bucketLabels: labels };
  }
  const keys: string[] = [];
  const labels: string[] = [];
  let y = Number(from.slice(0, 4));
  let m = Number(from.slice(5, 7));
  const endYm = to.slice(0, 7);
  while (`${y}-${String(m).padStart(2, '0')}` <= endYm && keys.length < 36) {
    const k = `${y}-${String(m).padStart(2, '0')}`;
    keys.push(k);
    labels.push(`T${String(m).padStart(2, '0')}/${y}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return { granularity: 'month', bucketKeys: keys, bucketLabels: labels };
}

function bucketKeyForDate(date: Date, timeZone: string, granularity: 'day' | 'month'): string {
  const ymd = formatYmdCenter(date, timeZone);
  return granularity === 'day' ? ymd : ymd.slice(0, 7);
}

function resolvePeriodWindow(query: PeriodReportQuery, now: Date, timeZone: string): PeriodWindow {
  const rawPreset = (query.preset || 'THIS_MONTH').toUpperCase();
  const preset: PeriodPreset = VALID_PRESETS.includes(rawPreset as PeriodPreset)
    ? (rawPreset as PeriodPreset)
    : 'THIS_MONTH';
  const today = formatYmdCenter(now, timeZone);
  let from = today;
  let to = today;

  if (query.from || query.to) {
    from = query.from ?? query.to ?? today;
    to = query.to ?? query.from ?? today;
    if (!isValidYmd(from) || !isValidYmd(to)) {
      throw new BadRequestException('Định dạng ngày lọc không hợp lệ (YYYY-MM-DD)');
    }
    if (from > to) {
      throw new BadRequestException('Ngày bắt đầu không được lớn hơn ngày kết thúc');
    }
    const span =
      Math.floor(
        (ymdToCenterMidnightUtc(to).getTime() - ymdToCenterMidnightUtc(from).getTime()) /
          86_400_000,
      ) + 1;
    if (span > 1100) {
      throw new BadRequestException('Khoảng thời gian báo cáo tối đa 1.100 ngày');
    }
    const buckets = buildBuckets(from, to);
    return {
      preset: query.preset && VALID_PRESETS.includes(rawPreset as PeriodPreset) ? preset : 'CUSTOM',
      from,
      to,
      startAt: ymdToCenterMidnightUtc(from),
      endExclusive: ymdEndExclusiveUtc(to),
      ...buckets,
    };
  }

  switch (preset) {
    case 'TODAY':
      from = today;
      to = today;
      break;
    case 'LAST_7D':
      from = addDaysYmd(today, -6);
      to = today;
      break;
    case 'THIS_MONTH': {
      const y = Number(today.slice(0, 4));
      const m = Number(today.slice(5, 7));
      const ym = today.slice(0, 7);
      from = `${ym}-01`;
      to = `${ym}-${String(monthDayCount(y, m - 1)).padStart(2, '0')}`;
      break;
    }
    case 'LAST_MONTH': {
      const y = Number(today.slice(0, 4));
      const m = Number(today.slice(5, 7));
      const prevYear = m === 1 ? y - 1 : y;
      const prevMonth = m === 1 ? 12 : m - 1;
      const ym = `${prevYear}-${String(prevMonth).padStart(2, '0')}`;
      from = `${ym}-01`;
      to = `${ym}-${String(monthDayCount(prevYear, prevMonth - 1)).padStart(2, '0')}`;
      break;
    }
    case 'ALL': {
      from = `${today.slice(0, 4)}-01-01`;
      to = addDaysYmd(today, 180);
      break;
    }
    case 'CUSTOM':
      from = `${today.slice(0, 7)}-01`;
      to = today;
      break;
  }

  const buckets = buildBuckets(from, to);
  return {
    preset,
    from,
    to,
    startAt: ymdToCenterMidnightUtc(from),
    endExclusive: ymdEndExclusiveUtc(to),
    ...buckets,
  };
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function pct(num: number | null | undefined, den: number | null | undefined): number {
  const n = Number(num ?? 0);
  const d = Number(den ?? 0);
  if (!Number.isFinite(n) || !Number.isFinite(d) || d <= 0) return 0;
  return round1((n * 100) / d);
}

function formatCenterDateTime(date: Date | null | undefined, timeZone: string): string {
  if (!date) return '—';
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatCenterTimeHm(date: Date | null | undefined, timeZone: string): string {
  if (!date) return '—';
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

function supportStateLabel(state: string): string {
  const map: Record<string, string> = {
    NEW: 'Chờ tiếp nhận',
    IN_PROGRESS: 'Đang xử lý',
    WAITING_SPECIALIST: 'Chờ chuyên gia',
    RESOLVED: 'Đã giải quyết',
    CLOSED: 'Đã đóng',
  };
  return map[state] ?? state;
}

function bookingStateLabel(state: string): string {
  const map: Record<string, string> = {
    PENDING_GV: 'Chờ giảng viên xác nhận',
    CONFIRMED: 'Đã xác nhận',
    REJECTED: 'Đã từ chối / đổi lịch',
    CANCELLED: 'Đã hủy',
    COMPLETED: 'Đã hoàn thành',
    EXPIRED: 'Hết hạn',
  };
  return map[state] ?? state;
}

function classStatusLabel(status: string): string {
  const map: Record<string, string> = {
    DRAFT: 'Bản nháp',
    OPEN: 'Đang tuyển sinh',
    IN_PROGRESS: 'Đang giảng dạy',
    COMPLETED: 'Đã hoàn thành',
    CANCELLED: 'Đã hủy',
  };
  return map[status] ?? status;
}

function enrollmentStatusLabel(status: string): string {
  const map: Record<string, string> = {
    PENDING_PAYMENT: 'Chờ thanh toán',
    ACTIVE: 'Đang học',
    COMPLETED: 'Hoàn thành',
    CANCELLED: 'Đã hủy',
    SUSPENDED: 'Tạm dừng',
  };
  return map[status] ?? status;
}

function sessionStateLabel(state: string): string {
  const map: Record<string, string> = {
    DRAFT: 'Nháp',
    PENDING_APPROVAL: 'Chờ học vụ duyệt',
    PUBLISHED: 'Đã công bố',
    REJECTED: 'Cần điều chỉnh',
    SUPERSEDED: 'Đã thay thế',
  };
  return map[state] ?? state;
}

function formatDurationShort(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return '0 phút';
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = Math.floor(totalSeconds % 60);
  if (hrs > 0) return mins > 0 ? `${hrs}g ${mins}p` : `${hrs} giờ`;
  if (mins > 0) return secs > 0 ? `${mins}p ${secs}s` : `${mins} phút`;
  return `${secs} giây`;
}

function inspectorAssignmentStateLabel(state: string): string {
  const map: Record<string, string> = {
    ACTIVE: 'Chờ tiếp nhận',
    DISPATCHED: 'Đã phân công',
    ACKNOWLEDGED: 'Đã tiếp nhận',
    ACCEPTED: 'Đã tiếp nhận',
    DECLINED: 'Từ chối nhận ca',
    INVALIDATED: 'Hết hiệu lực / Đổi lịch',
    REASSIGNED: 'Đã điều phối lại',
  };
  return map[state] ?? state;
}

function inspectorPresenceLabel(presence: string): string {
  const map: Record<string, string> = {
    PRESENT: 'Có mặt đúng giờ',
    LATE: 'Vào muộn',
    ABSENT: 'Vắng mặt',
    INACCESSIBLE: 'Không vào được lớp',
  };
  return map[presence] ?? presence;
}

function snippetText(text: string | null | undefined, max = 64): string {
  const cleaned = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return 'Không có mô tả thêm';
  return cleaned.length > max ? `${cleaned.slice(0, max - 1)}…` : cleaned;
}

async function tableExists(tx: Tx, tableName: string): Promise<boolean> {
  if (typeof (tx as { $queryRaw?: unknown }).$queryRaw !== 'function') return false;
  try {
    const rows = await tx.$queryRaw<{ tbl: string | null }[]>`
      SELECT to_regclass(${`public.${tableName}`})::text AS tbl
    `;
    return Boolean(rows[0]?.tbl);
  } catch {
    return false;
  }
}

async function safeRawQuery<T>(tx: Tx, query: Prisma.Sql): Promise<T[]> {
  if (typeof (tx as { $queryRaw?: unknown }).$queryRaw !== 'function') return [];
  const canSavepoint = typeof (tx as { $executeRawUnsafe?: unknown }).$executeRawUnsafe === 'function';
  if (canSavepoint) {
    try {
      await (tx as { $executeRawUnsafe: (sql: string) => Promise<unknown> }).$executeRawUnsafe(
        'SAVEPOINT role_period_safe_raw',
      );
      const rows = await tx.$queryRaw<T[]>(query);
      await (tx as { $executeRawUnsafe: (sql: string) => Promise<unknown> }).$executeRawUnsafe(
        'RELEASE SAVEPOINT role_period_safe_raw',
      );
      return rows;
    } catch {
      try {
        await (tx as { $executeRawUnsafe: (sql: string) => Promise<unknown> }).$executeRawUnsafe(
          'ROLLBACK TO SAVEPOINT role_period_safe_raw',
        );
      } catch {
        // Ignore rollback failure outside an active transaction.
      }
      return [];
    }
  }
  try {
    return await tx.$queryRaw<T[]>(query);
  } catch {
    return [];
  }
}

/**
 * Generates domain-complete, permission-scoped period analytics reports for
 * COUNSELOR, ACADEMIC_MANAGER, INSTRUCTOR, and STUDENT portals.
 */
@Injectable()
export class RolePeriodAnalyticsService {
  constructor(
    private readonly db: PrismaService,
    private readonly lms: ClassLmsService,
    private readonly authority: AuthorizationService,
  ) {}

  async getPeriodReport(
    actor: PeriodReportActor,
    query: PeriodReportQuery,
  ): Promise<PeriodAnalyticsReport> {
    const timeZone = process.env.REPORT_CENTER_TIME_ZONE || 'Asia/Ho_Chi_Minh';
    if (query.from && !isValidYmd(query.from)) {
      throw new BadRequestException('Ngày bắt đầu không hợp lệ');
    }
    if (query.to && !isValidYmd(query.to)) {
      throw new BadRequestException('Ngày kết thúc không hợp lệ');
    }

    return this.db.$transaction(async (tx) => {
      const ctx = await this.lms.context(tx, {
        id: actor.id,
        sessionId: actor.sessionId ?? '',
      });
      if (!SUPPORTED_ROLES.includes(ctx.role as SupportedPeriodRole)) {
        throw new ForbiddenException(
          'Vai trò hiện tại không sử dụng phân hệ báo cáo tổng hợp đa kỳ này',
        );
      }

      const nameMap = await this.loadUserNames(tx, [ctx.id]);
      const user = {
        id: ctx.id,
        role: ctx.role,
        fullName: nameMap.get(ctx.id) ?? ctx.role,
      };
      const now = await this.lms.now(tx);
      const window = resolvePeriodWindow(query, now, timeZone);
      const scopeId = query.scopeId?.trim() || null;

      switch (ctx.role as SupportedPeriodRole) {
        case 'COUNSELOR':
          return this.buildCounselorReport(tx, user, window, timeZone, scopeId, now);
        case 'ACADEMIC_MANAGER':
          return this.buildAcademicReport(tx, user, window, timeZone, scopeId);
        case 'INSTRUCTOR':
          return this.buildInstructorReport(tx, user, window, timeZone, scopeId, now);
        case 'STUDENT':
          return this.buildStudentReport(tx, user, window, timeZone, scopeId);
        case 'TEACHING_INSPECTOR':
          return this.buildInspectorReport(tx, user, window, timeZone, scopeId, now);
        case 'SYSTEM_ADMIN':
          return this.buildAdminReport(tx, user, window, timeZone, scopeId, now);
      }
    });
  }

  private async buildCounselorReport(
    tx: Tx,
    user: { id: string; fullName: string; role: string },
    window: PeriodWindow,
    timeZone: string,
    scopeId: string | null,
    now: Date,
  ): Promise<PeriodAnalyticsReport> {
    const approvedTopics = await tx.supportTopic.findMany({
      where: { approvedById: { not: null } },
      select: { id: true, code: true, title: true },
      orderBy: { code: 'asc' },
    });

    const authorizedTopics: Array<{ id: string; code: string; title: string }> = [];
    for (const topic of approvedTopics) {
      if (
        await this.authority.permits(
          user.id,
          'support.ticket.read',
          { type: 'SUPPORT_TOPIC', id: topic.code },
          tx,
        )
      ) {
        authorizedTopics.push(topic);
      }
    }

    if (authorizedTopics.length === 0) {
      throw new ForbiddenException('Tài khoản chưa được cấp quyền chủ đề CSKH nào còn hiệu lực');
    }

    let selectedTopic: { id: string; code: string; title: string } | null = null;
    if (scopeId) {
      selectedTopic =
        authorizedTopics.find((t) => t.id === scopeId || t.code === scopeId) ?? null;
      if (!selectedTopic) {
        throw new ForbiddenException('Chủ đề CSKH ngoài phạm vi được cấp quyền');
      }
    }

    const topicIds = selectedTopic
      ? [selectedTopic.id]
      : authorizedTopics.map((t) => t.id);

    const tickets = await tx.supportTicket.findMany({
      where: {
        topicId: { in: topicIds },
        createdAt: { gte: window.startAt, lt: window.endExclusive },
      },
      include: {
        topic: { select: { id: true, code: true, title: true } },
        messages: {
          orderBy: { createdAt: 'asc' },
          select: { actorId: true, visibility: true, createdAt: true },
        },
        referrals: {
          select: { id: true, state: true, category: true, createdAt: true, respondedAt: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const bookings = await tx.w05BBooking.findMany({
      where: { createdAt: { gte: window.startAt, lt: window.endExclusive } },
      select: { id: true, state: true, startsAt: true, createdAt: true, topic: true, teacherId: true },
      orderBy: { createdAt: 'desc' },
    });

    const hasEscTable = await tableExists(tx, 'support_technical_escalations');
    const escalations = hasEscTable
      ? await safeRawQuery<{ id: string; status: string; created_at: Date }>(
          tx,
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          await this.buildEscalationQuery(topicIds, window),
        )
      : [];

    const userIds = Array.from(
      new Set(
        tickets
          .flatMap((t) => [t.learnerId, t.ownerId])
          .filter((id): id is string => Boolean(id)),
      ),
    );
    const userMap = await this.loadUserNames(tx, userIds);

    const bucketIndex = new Map(window.bucketKeys.map((k, idx) => [k, idx]));
    const ticketNewSeries = new Array<number>(window.bucketKeys.length).fill(0);
    const ticketClosedSeries = new Array<number>(window.bucketKeys.length).fill(0);
    const bookingSeries = new Array<number>(window.bucketKeys.length).fill(0);

    const stateCounts = new Map<string, number>();
    const topicBuckets = new Map<
      string,
      {
        id: string;
        code: string;
        title: string;
        total: number;
        newCount: number;
        inProgress: number;
        resolvedClosed: number;
        slaOverdue: number;
        firstResponseHours: number[];
      }
    >();

    for (const topic of selectedTopic ? [selectedTopic] : authorizedTopics) {
      topicBuckets.set(topic.id, {
        id: topic.id,
        code: topic.code,
        title: topic.title,
        total: 0,
        newCount: 0,
        inProgress: 0,
        resolvedClosed: 0,
        slaOverdue: 0,
        firstResponseHours: [],
      });
    }

    const allResponseHours: number[] = [];
    let resolvedClosedTotal = 0;
    let openOverdueTotal = 0;
    let unownedTotal = 0;
    let referralTotal = 0;
    let referralDone = 0;

    for (const ticket of tickets) {
      const idx = bucketIndex.get(bucketKeyForDate(ticket.createdAt, timeZone, window.granularity));
      if (idx !== undefined) {
        ticketNewSeries[idx] += 1;
        if (ticket.state === 'RESOLVED' || ticket.state === 'CLOSED') {
          ticketClosedSeries[idx] += 1;
        }
      }
      stateCounts.set(ticket.state, (stateCounts.get(ticket.state) ?? 0) + 1);
      if (!ticket.ownerId && ticket.state === 'NEW') unownedTotal += 1;

      const tb = topicBuckets.get(ticket.topicId);
      if (tb) tb.total += 1;

      const isDone = ticket.state === 'RESOLVED' || ticket.state === 'CLOSED';
      if (isDone) {
        resolvedClosedTotal += 1;
        if (tb) tb.resolvedClosed += 1;
      } else if (ticket.state === 'NEW') {
        if (tb) tb.newCount += 1;
      } else {
        if (tb) tb.inProgress += 1;
      }

      const ageHours = (now.getTime() - ticket.createdAt.getTime()) / 3_600_000;
      if (!isDone && ageHours > 24) {
        openOverdueTotal += 1;
        if (tb) tb.slaOverdue += 1;
      }

      const firstStaffMsg = ticket.messages.find((m) => m.actorId !== ticket.learnerId);
      if (firstStaffMsg) {
        const hrs = Math.max(
          0,
          (firstStaffMsg.createdAt.getTime() - ticket.createdAt.getTime()) / 3_600_000,
        );
        allResponseHours.push(hrs);
        if (tb) tb.firstResponseHours.push(hrs);
      }

      referralTotal += ticket.referrals.length;
      referralDone += ticket.referrals.filter((r) => Boolean(r.respondedAt)).length;
    }

    for (const b of bookings) {
      const idx = bucketIndex.get(bucketKeyForDate(b.createdAt, timeZone, window.granularity));
      if (idx !== undefined) bookingSeries[idx] += 1;
    }

    const confirmedBookings = bookings.filter((b) =>
      ['CONFIRMED', 'COMPLETED'].includes(b.state),
    ).length;
    const pendingBookings = bookings.filter((b) => b.state === 'PENDING_GV').length;
    const openEsc = escalations.filter((e) => e.status === 'OPEN').length;
    const resolvedEsc = escalations.filter((e) => e.status !== 'OPEN').length;
    const resolutionRate = pct(resolvedClosedTotal, tickets.length);
    const avgFirstRespHours =
      allResponseHours.length > 0
        ? round1(allResponseHours.reduce((a, b) => a + b, 0) / allResponseHours.length)
        : 0;

    const avgRespLabel =
      allResponseHours.length === 0
        ? 'Chưa có'
        : avgFirstRespHours < 0.1
          ? '< 0.1h'
          : `${avgFirstRespHours}h`;
    const avgRespLong =
      allResponseHours.length === 0
        ? '—'
        : avgFirstRespHours < 0.1
          ? '< 0.1 giờ'
          : `${avgFirstRespHours} giờ`;

    const breakdownRows: PeriodReportRow[] = Array.from(topicBuckets.values()).map((tb) => {
      const tbRaw =
        tb.firstResponseHours.length > 0
          ? round1(tb.firstResponseHours.reduce((a, b) => a + b, 0) / tb.firstResponseHours.length)
          : null;
      const avgHrs =
        tbRaw === null ? '—' : tbRaw < 0.1 ? '< 0.1 giờ' : `${tbRaw} giờ`;
      return {
        topicCode: tb.code,
        topicTitle: tb.title,
        total: tb.total,
        newCount: tb.newCount,
        inProgress: tb.inProgress,
        resolvedClosed: tb.resolvedClosed,
        resolutionRate: `${pct(tb.resolvedClosed, tb.total)}%`,
        avgFirstResponse: avgHrs,
        slaOverdue: tb.slaOverdue,
      };
    });

    const totalsRow: PeriodReportRow = {
      topicCode: 'TỔNG CỘNG',
      topicTitle: `${selectedTopic ? 1 : authorizedTopics.length} chủ đề được phân quyền`,
      total: tickets.length,
      newCount: stateCounts.get('NEW') ?? 0,
      inProgress:
        (stateCounts.get('IN_PROGRESS') ?? 0) + (stateCounts.get('WAITING_SPECIALIST') ?? 0),
      resolvedClosed: resolvedClosedTotal,
      resolutionRate: `${resolutionRate}%`,
      avgFirstResponse: avgRespLong,
      slaOverdue: openOverdueTotal,
    };

    const bookingBreakdownMap = new Map<string, number>();
    for (const b of bookings) {
      bookingBreakdownMap.set(b.state, (bookingBreakdownMap.get(b.state) ?? 0) + 1);
    }
    const secondaryRows: PeriodReportRow[] = [
      ...Array.from(bookingBreakdownMap.entries()).map(([state, count]) => ({
        channel: 'Lịch tư vấn 1-1',
        itemLabel: bookingStateLabel(state),
        total: count,
        share: `${pct(count, bookings.length)}%`,
        note:
          state === 'PENDING_GV'
            ? 'Cần theo dõi giảng viên phản hồi lịch hẹn'
            : 'Ghi nhận trong kỳ',
      })),
      {
        channel: 'Chuyển tuyến chuyên môn',
        itemLabel: 'Chuyển chuyên gia & leo thang kỹ thuật',
        total: referralTotal + escalations.length,
        share:
          referralTotal + escalations.length > 0
            ? `${pct(referralDone + resolvedEsc, referralTotal + escalations.length)}% hoàn tất`
            : '0%',
        note: `${referralTotal} chuyển chuyên gia (${referralDone} đã hồi đáp) · ${escalations.length} báo cáo kỹ thuật (${openEsc} đang mở)`,
      },
    ];

    const ledgerRows: PeriodLedgerRow[] = tickets.slice(0, 50).map((t) => ({
      id: t.id,
      reference: t.reference,
      topicTitle: t.topic.title,
      requester:
        t.learnerId && userMap.get(t.learnerId)
          ? userMap.get(t.learnerId)!
          : t.guestName || 'Khách vãng lai',
      summary: snippetText(t.description),
      ownerName: t.ownerId ? (userMap.get(t.ownerId) ?? 'Đã phân công') : 'Chưa nhận xử lý',
      stateLabel: supportStateLabel(t.state),
      createdAt: formatCenterDateTime(t.createdAt, timeZone),
      href: `/workspace/support/tickets/${t.id}`,
      hrefLabel: 'Mở phiếu',
    }));

    return {
      role: 'COUNSELOR',
      roleLabel: 'Tư vấn viên & Chăm sóc học viên',
      reportTitle: 'Báo cáo Chăm sóc Học viên & Tư vấn Tuyển sinh',
      reportSubtitle:
        'Theo dõi khối lượng phiếu hỗ trợ, tốc độ phản hồi đầu tiên, tồn đọng SLA và hiệu suất lịch tư vấn 1-1 trong phạm vi chủ đề được phân quyền.',
      generatedAt: now.toISOString(),
      timezone: timeZone,
      actor: user,
      filters: {
        preset: window.preset,
        from: window.from,
        to: window.to,
        scopeId: selectedTopic?.id ?? null,
        scopeLabel: selectedTopic ? `${selectedTopic.code} — ${selectedTopic.title}` : 'Tất cả chủ đề được phân quyền',
        scopeSelectLabel: 'Chủ đề CSKH',
        scopeOptions: authorizedTopics.map((t) => ({
          id: t.id,
          label: `${t.code} — ${t.title}`,
        })),
      },
      kpis: [
        {
          id: 'counselor-tickets',
          label: 'Phiếu hỗ trợ tiếp nhận',
          value: tickets.length,
          sublabel: `${unownedTotal} phiếu chưa nhận · ${stateCounts.get('NEW') ?? 0} đang chờ tiếp nhận`,
          tone: 'indigo',
        },
        {
          id: 'counselor-resolution',
          label: 'Tỷ lệ xử lý hoàn tất',
          value: `${resolutionRate}%`,
          sublabel: `${resolvedClosedTotal}/${tickets.length} phiếu đã giải quyết hoặc đóng`,
          tone: resolutionRate >= 70 ? 'emerald' : 'amber',
        },
        {
          id: 'counselor-sla',
          label: 'Phản hồi đầu TB / Tồn SLA',
          value: avgRespLabel,
          sublabel: `${openOverdueTotal} phiếu đang mở quá 24 giờ chưa khép`,
          tone: openOverdueTotal > 0 ? 'rose' : 'sky',
        },
        {
          id: 'counselor-bookings',
          label: 'Lịch tư vấn 1-1 & Chuyển tuyến',
          value: bookings.length,
          sublabel: `${confirmedBookings} xác nhận · ${pendingBookings} chờ GV · ${openEsc} sự cố kỹ thuật mở`,
          tone: 'sky',
        },
      ],
      executiveSummary: [
        `Trong kỳ ${window.from} đến ${window.to}, bộ phận CSKH tiếp nhận ${tickets.length} phiếu hỗ trợ thuộc ${selectedTopic ? `chủ đề "${selectedTopic.title}"` : `${authorizedTopics.length} chủ đề được phân quyền`}.`,
        `Tỷ lệ khép phiếu (Đã giải quyết/Đã đóng) đạt ${resolutionRate}% (${resolvedClosedTotal} phiếu); còn ${openOverdueTotal} phiếu mở quá 24 giờ và ${unownedTotal} phiếu mới chưa có người nhận.`,
        `Thời gian phản hồi đầu tiên trung bình từ nhân sự là ${allResponseHours.length > 0 ? avgRespLong : 'chưa đủ dữ liệu phản hồi'}; phát sinh ${bookings.length} lịch hẹn tư vấn 1-1 (${confirmedBookings} đã xác nhận).`,
      ],
      charts: {
        trend: {
          title: 'Diễn biến tiếp nhận phiếu hỗ trợ & lịch tư vấn trong kỳ',
          subtitle: 'So sánh số phiếu tiếp nhận mới, phiếu đã xử lý xong và lịch tư vấn 1-1',
          labels: window.bucketLabels,
          series: [
            { name: 'Phiếu tiếp nhận mới', type: 'bar', color: '#4f46e5', data: ticketNewSeries },
            { name: 'Phiếu đã giải quyết/đóng', type: 'bar', color: '#10b981', data: ticketClosedSeries },
            { name: 'Lịch tư vấn 1-1', type: 'line', color: '#f59e0b', data: bookingSeries },
          ],
        },
        distribution: {
          title: 'Cơ cấu trạng thái phiếu hỗ trợ',
          subtitle: 'Phân bổ phiếu tiếp nhận trong kỳ theo trạng thái xử lý',
          kind: 'pie',
          items: Array.from(stateCounts.entries()).map(([state, value], idx) => ({
            name: supportStateLabel(state),
            value,
            color: SERIES_PALETTE[idx % SERIES_PALETTE.length],
          })),
        },
      },
      breakdown: {
        title: 'Hiệu suất xử lý theo từng chủ đề hỗ trợ',
        subtitle: 'Đối soát khối lượng tiếp nhận, tỷ lệ xử lý, tốc độ phản hồi và tồn SLA > 24h',
        columns: [
          { key: 'topicCode', label: 'Mã chủ đề' },
          { key: 'topicTitle', label: 'Chủ đề hỗ trợ' },
          { key: 'total', label: 'Tiếp nhận', align: 'right' },
          { key: 'newCount', label: 'Mới / Chờ nhận', align: 'right' },
          { key: 'inProgress', label: 'Đang xử lý', align: 'right' },
          { key: 'resolvedClosed', label: 'Đã đóng / Xong', align: 'right' },
          { key: 'resolutionRate', label: 'Tỷ lệ xong', align: 'right' },
          { key: 'avgFirstResponse', label: 'Phản hồi đầu TB', align: 'right' },
          { key: 'slaOverdue', label: 'Tồn > 24h', align: 'right' },
        ],
        rows: breakdownRows,
        totals: totalsRow,
      },
      secondaryPanel: {
        title: 'Lịch tư vấn 1-1 & Phối hợp liên phòng ban',
        subtitle: 'Tổng hợp kết quả đặt lịch tư vấn cùng giảng viên và chuyển tuyến chuyên môn/kỹ thuật',
        columns: [
          { key: 'channel', label: 'Kênh phối hợp' },
          { key: 'itemLabel', label: 'Trạng thái / Phân loại' },
          { key: 'total', label: 'Số lượng', align: 'right' },
          { key: 'share', label: 'Tỷ lệ', align: 'right' },
          { key: 'note', label: 'Ghi chú vận hành' },
        ],
        rows: secondaryRows,
      },
      ledger: {
        title: 'Sổ chi tiết phiếu hỗ trợ trong kỳ',
        subtitle: `Hiển thị tối đa 50 phiếu mới nhất trong kỳ (tổng ${tickets.length} phiếu) — liên kết trực tiếp tới hồ sơ xử lý`,
        columns: [
          { key: 'reference', label: 'Mã phiếu' },
          { key: 'topicTitle', label: 'Chủ đề' },
          { key: 'requester', label: 'Người gửi' },
          { key: 'summary', label: 'Nội dung tóm tắt' },
          { key: 'ownerName', label: 'Phụ trách' },
          { key: 'stateLabel', label: 'Trạng thái' },
          { key: 'createdAt', label: 'Thời gian gửi' },
        ],
        rows: ledgerRows,
      },
      exportFilenameBase: `bao-cao-cskh-${window.from}-den-${window.to}`,
    };
  }

  private async buildEscalationQuery(topicIds: string[], window: PeriodWindow): Promise<Prisma.Sql> {
    const { Prisma: PrismaNS } = await import('../../generated/prisma/client');
    return PrismaNS.sql`
      SELECT ste.id, ste.status, ste.created_at
      FROM support_technical_escalations ste
      JOIN support_tickets st ON st.id = ste.ticket_id
      WHERE st."topicId" = ANY(${topicIds}::uuid[])
        AND ste.created_at >= ${window.startAt}
        AND ste.created_at < ${window.endExclusive}
    `;
  }

  private async buildAcademicReport(
    tx: Tx,
    user: { id: string; fullName: string; role: string },
    window: PeriodWindow,
    timeZone: string,
    scopeId: string | null,
  ): Promise<PeriodAnalyticsReport> {
    if (!(await this.authority.permits(user.id, 'class.read', { type: 'GLOBAL' }, tx))) {
      throw new ForbiddenException('Cần quyền class.read mức toàn hệ thống để xem báo cáo học vụ');
    }

    const classes = await tx.classOffering.findMany({
      select: {
        id: true,
        code: true,
        name: true,
        status: true,
        maxStudents: true,
        modality: true,
        instructorId: true,
      },
      orderBy: [{ status: 'asc' }, { code: 'asc' }],
    });

    const selectedClass = scopeId ? classes.find((c) => c.id === scopeId) ?? null : null;
    if (scopeId && !selectedClass) {
      throw new NotFoundOrForbiddenClassError();
    }

    const targetClassIds = selectedClass ? [selectedClass.id] : classes.map((c) => c.id);
    const targetClasses = selectedClass ? [selectedClass] : classes;

    const enrollments = await tx.enrollment.findMany({
      where: { classOfferingId: { in: targetClassIds } },
      select: {
        id: true,
        classOfferingId: true,
        status: true,
        enrolledAt: true,
      },
    });

    const sessions = await tx.teachingSession.findMany({
      where: {
        classOfferingId: { in: targetClassIds },
        startsAt: { gte: window.startAt, lt: window.endExclusive },
      },
      select: {
        id: true,
        classOfferingId: true,
        startsAt: true,
        endsAt: true,
        state: true,
        instructorId: true,
      },
      orderBy: { startsAt: 'desc' },
    });

    const placementEvals = await tx.placementHumanEvaluation.findMany({
      where: { createdAt: { gte: window.startAt, lt: window.endExclusive } },
      select: { id: true, skill: true, createdAt: true },
    });

    const placementReleases = await tx.placementResultRelease.findMany({
      where: { createdAt: { gte: window.startAt, lt: window.endExclusive } },
      select: { evaluationId: true, createdAt: true },
    });

    const submittedTests = await tx.testAttempt.findMany({
      where: {
        status: 'SUBMITTED',
        submittedAt: { gte: window.startAt, lt: window.endExclusive },
      },
      select: { id: true, score: true, maxScore: true, submittedAt: true },
    });

    const hasAttTable = await tableExists(tx, 'lms_local_attendance_records');
    const attRows = hasAttTable && targetClassIds.length > 0
      ? await safeRawQuery<{ class_offering_id: string; status: string; checked_in_at: Date }>(
          tx,
          await this.sqlAttendanceByClasses(targetClassIds, window),
        )
      : [];

    const hasCertTable = await tableExists(tx, 'w09_certificates');
    const certRows = hasCertTable
      ? await safeRawQuery<{
          id: string;
          certificateCode: string;
          state: string;
          issuedAt: Date;
          classOfferingId: string;
        }>(tx, await this.sqlCertsByClasses(targetClassIds, window))
      : [];

    const instructorIds = Array.from(
      new Set(
        [...targetClasses.map((c) => c.instructorId), ...sessions.map((s) => s.instructorId)]
          .filter((id): id is string => Boolean(id)),
      ),
    );
    const userMap = await this.loadUserNames(tx, instructorIds);

    const activeEnrolledPerClass = new Map<string, number>();
    const newEnrolledInPeriodPerClass = new Map<string, number>();
    let totalActiveSeats = 0;
    let totalNewEnrollmentsInPeriod = 0;
    let pendingPaymentSeats = 0;

    const bucketIndex = new Map(window.bucketKeys.map((k, idx) => [k, idx]));
    const sessionSeries = new Array<number>(window.bucketKeys.length).fill(0);
    const enrollmentSeries = new Array<number>(window.bucketKeys.length).fill(0);

    for (const enr of enrollments) {
      if (enr.status === 'ACTIVE' || enr.status === 'COMPLETED') {
        totalActiveSeats += 1;
        activeEnrolledPerClass.set(
          enr.classOfferingId,
          (activeEnrolledPerClass.get(enr.classOfferingId) ?? 0) + 1,
        );
      } else if (enr.status === 'PENDING_PAYMENT') {
        pendingPaymentSeats += 1;
      }
      if (enr.enrolledAt >= window.startAt && enr.enrolledAt < window.endExclusive) {
        totalNewEnrollmentsInPeriod += 1;
        newEnrolledInPeriodPerClass.set(
          enr.classOfferingId,
          (newEnrolledInPeriodPerClass.get(enr.classOfferingId) ?? 0) + 1,
        );
        const idx = bucketIndex.get(bucketKeyForDate(enr.enrolledAt, timeZone, window.granularity));
        if (idx !== undefined) enrollmentSeries[idx] += 1;
      }
    }

    const sessionsByClass = new Map<string, { total: number; published: number; pending: number }>();
    let publishedSessions = 0;
    let pendingApprovalSessions = 0;
    let activeScheduledSessions = 0;

    for (const s of sessions) {
      if (s.state === 'SUPERSEDED') continue;
      activeScheduledSessions += 1;
      if (s.state === 'PUBLISHED') publishedSessions += 1;
      if (s.state === 'PENDING_APPROVAL') pendingApprovalSessions += 1;
      const cur = sessionsByClass.get(s.classOfferingId) ?? { total: 0, published: 0, pending: 0 };
      cur.total += 1;
      if (s.state === 'PUBLISHED') cur.published += 1;
      if (s.state === 'PENDING_APPROVAL') cur.pending += 1;
      sessionsByClass.set(s.classOfferingId, cur);

      const idx = bucketIndex.get(bucketKeyForDate(s.startsAt, timeZone, window.granularity));
      if (idx !== undefined) sessionSeries[idx] += 1;
    }

    const attByClass = new Map<string, { presentLate: number; total: number }>();
    let totalAttRecords = 0;
    let totalAttPresent = 0;
    for (const r of attRows) {
      totalAttRecords += 1;
      const ok = r.status === 'PRESENT' || r.status === 'LATE';
      if (ok) totalAttPresent += 1;
      const cur = attByClass.get(r.class_offering_id) ?? { presentLate: 0, total: 0 };
      cur.total += 1;
      if (ok) cur.presentLate += 1;
      attByClass.set(r.class_offering_id, cur);
    }

    const certsByClass = new Map<string, { issued: number; revoked: number }>();
    let issuedCerts = 0;
    let revokedCerts = 0;
    for (const c of certRows) {
      const cur = certsByClass.get(c.classOfferingId) ?? { issued: 0, revoked: 0 };
      if (c.state === 'REVOKED') {
        revokedCerts += 1;
        cur.revoked += 1;
      } else {
        issuedCerts += 1;
        cur.issued += 1;
      }
      certsByClass.set(c.classOfferingId, cur);
    }

    const operatingClasses = targetClasses.filter((c) =>
      ['OPEN', 'IN_PROGRESS', 'COMPLETED'].includes(c.status),
    ).length;
    const totalCapacity = targetClasses
      .filter((c) => ['OPEN', 'IN_PROGRESS'].includes(c.status))
      .reduce((sum, c) => sum + (c.maxStudents || 0), 0);
    const fillRate = pct(totalActiveSeats, totalCapacity);
    const overallAttRate = pct(totalAttPresent, totalAttRecords);

    const breakdownRows: PeriodReportRow[] = targetClasses.map((cls) => {
      const activeSeats = activeEnrolledPerClass.get(cls.id) ?? 0;
      const newInPeriod = newEnrolledInPeriodPerClass.get(cls.id) ?? 0;
      const sc = sessionsByClass.get(cls.id) ?? { total: 0, published: 0, pending: 0 };
      const att = attByClass.get(cls.id) ?? { presentLate: 0, total: 0 };
      const cc = certsByClass.get(cls.id) ?? { issued: 0, revoked: 0 };
      return {
        classCode: cls.code,
        className: cls.name,
        statusLabel: classStatusLabel(cls.status),
        instructorName: cls.instructorId ? (userMap.get(cls.instructorId) ?? 'Chưa gán') : 'Chưa gán',
        seatsSummary: `${activeSeats}/${cls.maxStudents ?? '—'}`,
        newEnrolled: newInPeriod,
        sessionsInPeriod: sc.total,
        attendanceRate: att.total > 0 ? `${pct(att.presentLate, att.total)}%` : 'Chưa có',
        certsIssued: cc.issued,
        fillRate: cls.maxStudents ? `${pct(activeSeats, cls.maxStudents)}%` : '—',
      };
    });

    const totalsRow: PeriodReportRow = {
      classCode: 'TỔNG CỘNG',
      className: `${targetClasses.length} lớp học`,
      statusLabel: `${operatingClasses} lớp vận hành`,
      instructorName: '—',
      seatsSummary: `${totalActiveSeats}/${totalCapacity || '—'}`,
      newEnrolled: totalNewEnrollmentsInPeriod,
      sessionsInPeriod: activeScheduledSessions,
      attendanceRate: totalAttRecords > 0 ? `${overallAttRate}%` : 'Chưa có',
      certsIssued: issuedCerts,
      fillRate: totalCapacity > 0 ? `${fillRate}%` : '—',
    };

    const topSeatClasses = [...targetClasses]
      .map((c) => ({
        name: `${c.code}`,
        value: activeEnrolledPerClass.get(c.id) ?? 0,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);

    const ledgerRows: PeriodLedgerRow[] = sessions
      .filter((s) => s.state !== 'SUPERSEDED')
      .slice(0, 50)
      .map((s) => {
        const cls = targetClasses.find((c) => c.id === s.classOfferingId);
        return {
          id: s.id,
          classCode: cls?.code ?? '—',
          className: cls?.name ?? 'Lớp học',
          instructorName: s.instructorId ? (userMap.get(s.instructorId) ?? 'Giảng viên') : 'Chưa gán',
          sessionTime: `${formatCenterDateTime(s.startsAt, timeZone)} → ${formatCenterTimeHm(s.endsAt, timeZone)}`,
          stateLabel: sessionStateLabel(s.state),
          href: cls ? `/academic/classes/${cls.id}` : '/academic',
          hrefLabel: 'Xem lớp',
        };
      });

    return {
      role: 'ACADEMIC_MANAGER',
      roleLabel: 'Quản lý Học vụ & Đào tạo',
      reportTitle: 'Báo cáo Điều hành Học vụ, Lớp học & Chất lượng Đào tạo',
      reportSubtitle:
        'Tổng hợp tình hình lớp học, lấp đầy sĩ số, kỷ luật lịch giảng dạy, chuyên cần lớp, chấm đánh giá đầu vào và cấp chứng chỉ tốt nghiệp.',
      generatedAt: new Date().toISOString(),
      timezone: timeZone,
      actor: user,
      filters: {
        preset: window.preset,
        from: window.from,
        to: window.to,
        scopeId: selectedClass?.id ?? null,
        scopeLabel: selectedClass ? `${selectedClass.code} — ${selectedClass.name}` : 'Tất cả lớp học toàn hệ thống',
        scopeSelectLabel: 'Lớp học',
        scopeOptions: classes.map((c) => ({
          id: c.id,
          label: `${c.code} — ${c.name}`,
        })),
      },
      kpis: [
        {
          id: 'acad-classes-seats',
          label: 'Lớp vận hành & Sĩ số',
          value: `${operatingClasses} lớp`,
          sublabel: `${totalActiveSeats} học viên đang học/hoàn thành · ${newEnrolledInPeriodPerClass.size > 0 ? `${totalNewEnrollmentsInPeriod} ghi danh mới trong kỳ` : `${pendingPaymentSeats} hồ sơ chờ thanh toán`}`,
          tone: 'indigo',
        },
        {
          id: 'acad-sessions',
          label: 'Buổi giảng dạy trong kỳ',
          value: activeScheduledSessions,
          sublabel: `${publishedSessions} đã công bố · ${pendingApprovalSessions} chờ học vụ duyệt`,
          tone: pendingApprovalSessions > 0 ? 'amber' : 'emerald',
        },
        {
          id: 'acad-attendance-eval',
          label: 'Chuyên cần & Xếp lớp',
          value: totalAttRecords > 0 ? `${overallAttRate}%` : `${placementEvals.length} lượt chấm`,
          sublabel: `${totalAttRecords} lượt điểm danh · ${placementEvals.length} chấm Speaking/Writing (${placementReleases.length} đã công bố)`,
          tone: 'sky',
        },
        {
          id: 'acad-certs',
          label: 'Chứng chỉ & Bài thi trong kỳ',
          value: `${issuedCerts} chứng chỉ`,
          sublabel: `${revokedCerts} thu hồi · ${submittedTests.length} bài thi hệ thống đã nộp`,
          tone: 'emerald',
        },
      ],
      executiveSummary: [
        `Hệ thống hiện ghi nhận ${targetClasses.length} lớp học (${operatingClasses} lớp đang mở/đang dạy/hoàn thành) với ${totalActiveSeats} lượt ghi danh hợp lệ${totalCapacity > 0 ? `, tỷ lệ lấp đầy chỉ tiêu đạt ${fillRate}%` : ''}.`,
        `Trong kỳ ${window.from} – ${window.to}, có ${activeScheduledSessions} buổi dạy được xếp lịch (${publishedSessions} đã công bố, ${pendingApprovalSessions} đang chờ duyệt) và ${totalNewEnrollmentsInPeriod} lượt ghi danh mới.`,
        `Mảng khảo thí & chứng chỉ ghi nhận ${placementEvals.length} lượt chấm đầu vào 4 kỹ năng, ${placementReleases.length} kết quả đã công bố, ${submittedTests.length} lượt nộp bài thi hệ thống và ${issuedCerts} chứng chỉ tốt nghiệp được cấp.`,
      ],
      charts: {
        trend: {
          title: 'Nhịp độ lịch buổi dạy & ghi danh theo thời gian',
          subtitle: 'Số buổi học hiệu lực và lượt ghi danh mới phát sinh trong kỳ báo cáo',
          labels: window.bucketLabels,
          series: [
            { name: 'Buổi học lên lịch', type: 'bar', color: '#4f46e5', data: sessionSeries },
            { name: 'Ghi danh mới', type: 'line', color: '#10b981', data: enrollmentSeries },
          ],
        },
        distribution: {
          title: 'Phân bổ sĩ số thực học theo lớp trọng điểm',
          subtitle: 'Nhóm lớp có số học viên đang học / hoàn thành cao nhất',
          kind: 'bar',
          items: topSeatClasses.map((item, idx) => ({
            ...item,
            color: SERIES_PALETTE[idx % SERIES_PALETTE.length],
          })),
        },
      },
      breakdown: {
        title: 'Bảng tổng hợp hiệu suất vận hành theo lớp học',
        subtitle: 'So sánh sĩ số, buổi dạy trong kỳ, chuyên cần và chứng chỉ cấp của từng lớp',
        columns: [
          { key: 'classCode', label: 'Mã lớp' },
          { key: 'className', label: 'Tên lớp học' },
          { key: 'statusLabel', label: 'Trạng thái' },
          { key: 'instructorName', label: 'Giảng viên' },
          { key: 'seatsSummary', label: 'Sĩ số / Chỉ tiêu', align: 'right' },
          { key: 'newEnrolled', label: 'Ghi danh (kỳ)', align: 'right' },
          { key: 'sessionsInPeriod', label: 'Buổi dạy (kỳ)', align: 'right' },
          { key: 'attendanceRate', label: 'Chuyên cần', align: 'right' },
          { key: 'certsIssued', label: 'Chứng chỉ', align: 'right' },
        ],
        rows: breakdownRows,
        totals: totalsRow,
      },
      secondaryPanel: {
        title: 'Tổng hợp khảo thí xếp lớp & chứng chỉ trong kỳ',
        subtitle: 'Số liệu kiểm soát đầu vào và đầu ra toàn trung tâm trong giai đoạn chọn lọc',
        columns: [
          { key: 'category', label: 'Hạng mục học thuật' },
          { key: 'metricValue', label: 'Số lượng', align: 'right' },
          { key: 'detail', label: 'Diễn giải số liệu' },
        ],
        rows: [
          {
            category: 'Đánh giá đầu vào (Speaking/Writing)',
            metricValue: placementEvals.length,
            detail: `${placementReleases.length} lượt đã công bố kết quả chính thức tới học viên`,
          },
          {
            category: 'Bài thi hệ thống đã nộp',
            metricValue: submittedTests.length,
            detail: 'Bao gồm bài kiểm tra đầu vào & đánh giá năng lực định kỳ',
          },
          {
            category: 'Chứng chỉ hoàn thành khóa học',
            metricValue: issuedCerts,
            detail: `${issuedCerts} đã cấp hợp lệ · ${revokedCerts} đã thu hồi trong kỳ`,
          },
        ],
      },
      ledger: {
        title: 'Danh sách buổi dạy gần nhất trong kỳ',
        subtitle: `Hiển thị tối đa 50 buổi dạy hiệu lực gần nhất (tổng ${activeScheduledSessions} buổi)`,
        columns: [
          { key: 'classCode', label: 'Mã lớp' },
          { key: 'className', label: 'Lớp học' },
          { key: 'instructorName', label: 'Giảng viên' },
          { key: 'sessionTime', label: 'Thời gian buổi học' },
          { key: 'stateLabel', label: 'Trạng thái lịch' },
        ],
        rows: ledgerRows,
      },
      exportFilenameBase: `bao-cao-hoc-vu-${window.from}-den-${window.to}`,
    };
  }

  private async buildInstructorReport(
    tx: Tx,
    user: { id: string; fullName: string; role: string },
    window: PeriodWindow,
    timeZone: string,
    scopeId: string | null,
    now: Date,
  ): Promise<PeriodAnalyticsReport> {
    const classes = await tx.classOffering.findMany({
      where: effectiveInstructorScope(user.id, currentAssignmentWindow(now)),
      select: {
        id: true,
        code: true,
        name: true,
        status: true,
        maxStudents: true,
        modality: true,
      },
      orderBy: { code: 'asc' },
    });

    const selectedClass = scopeId ? classes.find((c) => c.id === scopeId) ?? null : null;
    if (scopeId && !selectedClass) {
      throw new ForbiddenException('Lớp học nằm ngoài phạm vi phân công giảng dạy hiện tại');
    }

    const targetClasses = selectedClass ? [selectedClass] : classes;
    const targetClassIds = targetClasses.map((c) => c.id);

    const enrollments = targetClassIds.length
      ? await tx.enrollment.findMany({
          where: {
            classOfferingId: { in: targetClassIds },
            status: { in: ['ACTIVE', 'COMPLETED'] },
          },
          select: { id: true, classOfferingId: true, status: true },
        })
      : [];

    const sessions = targetClassIds.length
      ? await tx.teachingSession.findMany({
          where: {
            classOfferingId: { in: targetClassIds },
            startsAt: { gte: window.startAt, lt: window.endExclusive },
            state: { not: 'SUPERSEDED' },
          },
          select: {
            id: true,
            classOfferingId: true,
            startsAt: true,
            endsAt: true,
            state: true,
            modality: true,
          },
          orderBy: { startsAt: 'desc' },
        })
      : [];

    const hasAttTable = await tableExists(tx, 'lms_local_attendance_records');
    const attRows =
      hasAttTable && targetClassIds.length > 0
        ? await safeRawQuery<{ class_offering_id: string; status: string; checked_in_at: Date }>(
            tx,
            await this.sqlAttendanceByClasses(targetClassIds, window),
          )
        : [];

    const hasLocalAssignTable = await tableExists(tx, 'lms_local_assignment_grades');
    const localAssignGrades =
      hasLocalAssignTable && targetClassIds.length > 0
        ? await safeRawQuery<{
            submission_id: string;
            class_offering_id: string;
            score: number | null;
            max_score: number | null;
            state: string;
            graded_at: Date | null;
          }>(tx, await this.sqlLocalAssignGradesByClasses(targetClassIds, window))
        : [];

    const hasLocalQuizTable = await tableExists(tx, 'lms_local_quiz_attempts');
    const localQuizAttempts =
      hasLocalQuizTable && targetClassIds.length > 0
        ? await safeRawQuery<{
            id: string;
            class_offering_id: string;
            total_score: number | null;
            max_score: number | null;
            grading_status: string;
            submitted_at: Date | null;
          }>(tx, await this.sqlLocalQuizzesByClasses(targetClassIds, window))
        : [];

    const placementEvals = await tx.placementHumanEvaluation.findMany({
      where: {
        graderId: user.id,
        createdAt: { gte: window.startAt, lt: window.endExclusive },
      },
      select: { id: true, skill: true, createdAt: true },
    });

    const bucketIndex = new Map(window.bucketKeys.map((k, idx) => [k, idx]));
    const sessionSeries = new Array<number>(window.bucketKeys.length).fill(0);
    const gradedSeries = new Array<number>(window.bucketKeys.length).fill(0);

    const seatsPerClass = new Map<string, number>();
    for (const e of enrollments) {
      seatsPerClass.set(e.classOfferingId, (seatsPerClass.get(e.classOfferingId) ?? 0) + 1);
    }

    let totalHours = 0;
    let publishedSessions = 0;
    let pendingApprovalSessions = 0;
    let draftSessions = 0;
    const sessionsByClass = new Map<string, { count: number; hours: number; published: number }>();

    for (const s of sessions) {
      const hrs = Math.max(0, (s.endsAt.getTime() - s.startsAt.getTime()) / 3_600_000);
      totalHours += hrs;
      if (s.state === 'PUBLISHED') publishedSessions += 1;
      else if (s.state === 'PENDING_APPROVAL') pendingApprovalSessions += 1;
      else if (s.state === 'DRAFT') draftSessions += 1;
      const cur = sessionsByClass.get(s.classOfferingId) ?? { count: 0, hours: 0, published: 0 };
      cur.count += 1;
      cur.hours += hrs;
      if (s.state === 'PUBLISHED') cur.published += 1;
      sessionsByClass.set(s.classOfferingId, cur);

      const idx = bucketIndex.get(bucketKeyForDate(s.startsAt, timeZone, window.granularity));
      if (idx !== undefined) sessionSeries[idx] += 1;
    }

    const attByClass = new Map<string, { ok: number; total: number }>();
    let totalAttOk = 0;
    for (const r of attRows) {
      const ok = r.status === 'PRESENT' || r.status === 'LATE';
      if (ok) totalAttOk += 1;
      const cur = attByClass.get(r.class_offering_id) ?? { ok: 0, total: 0 };
      cur.total += 1;
      if (ok) cur.ok += 1;
      attByClass.set(r.class_offering_id, cur);
    }

    const gradesByClass = new Map<string, { count: number; scorePcts: number[] }>();
    let pendingQuizManual = 0;
    const allScorePcts: number[] = [];

    for (const g of localAssignGrades) {
      const cur = gradesByClass.get(g.class_offering_id) ?? { count: 0, scorePcts: [] };
      cur.count += 1;
      if (g.score !== null && g.max_score && Number(g.max_score) > 0) {
        const sp = pct(Number(g.score), Number(g.max_score));
        cur.scorePcts.push(sp);
        allScorePcts.push(sp);
      }
      gradesByClass.set(g.class_offering_id, cur);
      if (g.graded_at) {
        const idx = bucketIndex.get(bucketKeyForDate(g.graded_at, timeZone, window.granularity));
        if (idx !== undefined) gradedSeries[idx] += 1;
      }
    }

    for (const q of localQuizAttempts) {
      const isPendingQuiz =
        q.grading_status === 'PENDING_MANUAL' || q.grading_status === 'PENDING_MANUAL_GRADE';
      if (isPendingQuiz) pendingQuizManual += 1;
      const cur = gradesByClass.get(q.class_offering_id) ?? { count: 0, scorePcts: [] };
      cur.count += 1;
      if (
        q.submitted_at &&
        !isPendingQuiz &&
        q.total_score !== null &&
        q.max_score &&
        Number(q.max_score) > 0
      ) {
        const sp = pct(Number(q.total_score), Number(q.max_score));
        cur.scorePcts.push(sp);
        allScorePcts.push(sp);
      }
      gradesByClass.set(q.class_offering_id, cur);
      if (q.submitted_at) {
        const idx = bucketIndex.get(bucketKeyForDate(q.submitted_at, timeZone, window.granularity));
        if (idx !== undefined) gradedSeries[idx] += 1;
      }
    }

    const activeLearnerEnrollments = enrollments.filter((e) => e.status === 'ACTIVE').length;
    const completedLearnerEnrollments = enrollments.filter((e) => e.status === 'COMPLETED').length;

    const totalGradedWork = localAssignGrades.length + localQuizAttempts.length;
    const avgScorePct =
      allScorePcts.length > 0
        ? round1(allScorePcts.reduce((a, b) => a + b, 0) / allScorePcts.length)
        : 0;
    const overallAttRate = pct(totalAttOk, attRows.length);

    const breakdownRows: PeriodReportRow[] = targetClasses.map((cls) => {
      const sc = sessionsByClass.get(cls.id) ?? { count: 0, hours: 0, published: 0 };
      const att = attByClass.get(cls.id) ?? { ok: 0, total: 0 };
      const gr = gradesByClass.get(cls.id) ?? { count: 0, scorePcts: [] };
      const clsAvg =
        gr.scorePcts.length > 0
          ? `${round1(gr.scorePcts.reduce((a, b) => a + b, 0) / gr.scorePcts.length)}%`
          : '—';
      return {
        classCode: cls.code,
        className: cls.name,
        statusLabel: classStatusLabel(cls.status),
        students: seatsPerClass.get(cls.id) ?? 0,
        sessions: sc.count,
        hours: round1(sc.hours),
        attendanceRate: att.total > 0 ? `${pct(att.ok, att.total)}%` : 'Chưa có',
        workItems: gr.count,
        avgScore: clsAvg,
      };
    });

    const totalsRow: PeriodReportRow = {
      classCode: 'TỔNG CỘNG',
      className: `${targetClasses.length} lớp phụ trách`,
      statusLabel: '—',
      students: enrollments.length,
      sessions: sessions.length,
      hours: round1(totalHours),
      attendanceRate: attRows.length > 0 ? `${overallAttRate}%` : 'Chưa có',
      workItems: totalGradedWork,
      avgScore: allScorePcts.length > 0 ? `${avgScorePct}%` : '—',
    };

    const classMap = new Map(targetClasses.map((c) => [c.id, c]));
    const ledgerRows: PeriodLedgerRow[] = sessions.slice(0, 50).map((s) => {
      const cls = classMap.get(s.classOfferingId);
      const durHours = round1((s.endsAt.getTime() - s.startsAt.getTime()) / 3_600_000);
      return {
        id: s.id,
        classCode: cls?.code ?? '—',
        className: cls?.name ?? 'Lớp giảng dạy',
        sessionWindow: `${formatCenterDateTime(s.startsAt, timeZone)} → ${formatCenterTimeHm(s.endsAt, timeZone)}`,
        durationHours: `${durHours} giờ`,
        modalityLabel: s.modality === 'ONLINE' ? 'Trực tuyến' : 'Trực tiếp',
        stateLabel: sessionStateLabel(s.state),
        href: cls ? `/instructor/classes/${cls.id}` : '/instructor/teaching',
        hrefLabel: 'Vào lớp',
      };
    });

    return {
      role: 'INSTRUCTOR',
      roleLabel: 'Giảng viên phụ trách',
      reportTitle: 'Báo cáo Giảng dạy, Chuyên cần & Chấm bài của Giảng viên',
      reportSubtitle:
        'Tổng hợp khối lượng buổi dạy, giờ đứng lớp, tỷ lệ chuyên cần học viên, bài tập/quiz và chấm đánh giá xếp lớp trong phạm vi được phân công.',
      generatedAt: now.toISOString(),
      timezone: timeZone,
      actor: user,
      filters: {
        preset: window.preset,
        from: window.from,
        to: window.to,
        scopeId: selectedClass?.id ?? null,
        scopeLabel: selectedClass ? `${selectedClass.code} — ${selectedClass.name}` : 'Tất cả lớp phụ trách',
        scopeSelectLabel: 'Lớp giảng dạy',
        scopeOptions: classes.map((c) => ({
          id: c.id,
          label: `${c.code} — ${c.name}`,
        })),
      },
      kpis: [
        {
          id: 'inst-sessions',
          label: 'Buổi dạy & Giờ đứng lớp',
          value: `${sessions.length} buổi`,
          sublabel: `${round1(totalHours)} giờ · ${publishedSessions} đã công bố · ${pendingApprovalSessions} chờ duyệt${draftSessions > 0 ? ` · ${draftSessions} nháp` : ''}`,
          tone: 'indigo',
        },
        {
          id: 'inst-students',
          label: 'Lớp & Học viên phụ trách',
          value: `${activeLearnerEnrollments} đang học`,
          sublabel: `${targetClasses.length} lớp phân công · ${enrollments.length} tổng lượt ghi danh${completedLearnerEnrollments > 0 ? ` (${completedLearnerEnrollments} hoàn thành)` : ''}`,
          tone: 'sky',
        },
        {
          id: 'inst-attendance',
          label: 'Chuyên cần học viên',
          value: attRows.length > 0 ? `${overallAttRate}%` : 'Chưa có',
          sublabel:
            attRows.length > 0
              ? `${totalAttOk}/${attRows.length} lượt có mặt hoặc đi muộn`
              : 'Chưa phát sinh lượt điểm danh trong kỳ',
          tone: overallAttRate >= 80 || attRows.length === 0 ? 'emerald' : 'amber',
        },
        {
          id: 'inst-grading',
          label: 'Bài tập, Quiz & Chấm thi',
          value: totalGradedWork + placementEvals.length,
          sublabel: `${allScorePcts.length > 0 ? `Điểm TB ${avgScorePct}% · ` : ''}${pendingQuizManual} quiz chờ chấm tay · ${placementEvals.length} chấm xếp lớp`,
          tone: pendingQuizManual > 0 ? 'amber' : 'emerald',
        },
      ],
      executiveSummary: [
        `Trong giai đoạn ${window.from} – ${window.to}, giảng viên phụ trách ${targetClasses.length} lớp (${enrollments.length} học viên đang học/hoàn thành) với ${sessions.length} buổi học hiệu lực (${round1(totalHours)} giờ dạy).`,
        `Tỷ lệ chuyên cần ghi nhận đạt ${attRows.length > 0 ? `${overallAttRate}% (${totalAttOk}/${attRows.length} lượt)` : 'chưa có lượt điểm danh trong kỳ'}.`,
        `Hoạt động chấm chữa gồm ${localAssignGrades.length} bài tập tự luận, ${localQuizAttempts.length} lượt làm quiz${allScorePcts.length > 0 ? ` (điểm trung bình ${avgScorePct}%)` : ''} và ${placementEvals.length} lượt chấm Speaking/Writing đầu vào.`,
      ],
      charts: {
        trend: {
          title: 'Tiến độ giảng dạy & chấm bài theo thời gian',
          subtitle: 'Số buổi dạy lên lịch và lượt bài tập/quiz phát sinh trong từng mốc thời gian',
          labels: window.bucketLabels,
          series: [
            { name: 'Buổi giảng dạy', type: 'bar', color: '#4f46e5', data: sessionSeries },
            { name: 'Bài tập / Quiz ghi nhận', type: 'line', color: '#10b981', data: gradedSeries },
          ],
        },
        distribution: {
          title: 'Phân bổ buổi dạy theo lớp phụ trách',
          subtitle: 'Số lượng buổi dạy trong kỳ theo từng lớp',
          kind: 'bar',
          items: targetClasses.map((c, idx) => ({
            name: c.code,
            value: sessionsByClass.get(c.id)?.count ?? 0,
            color: SERIES_PALETTE[idx % SERIES_PALETTE.length],
          })),
        },
      },
      breakdown: {
        title: 'Tổng hợp giảng dạy theo từng lớp phụ trách',
        subtitle: 'Sĩ số, buổi dạy, thời lượng giờ, tỷ lệ chuyên cần và điểm trung bình bài nộp',
        columns: [
          { key: 'classCode', label: 'Mã lớp' },
          { key: 'className', label: 'Tên lớp' },
          { key: 'statusLabel', label: 'Trạng thái' },
          { key: 'students', label: 'Học viên', align: 'right' },
          { key: 'sessions', label: 'Buổi dạy', align: 'right' },
          { key: 'hours', label: 'Giờ dạy', align: 'right' },
          { key: 'attendanceRate', label: 'Chuyên cần', align: 'right' },
          { key: 'workItems', label: 'Bài tập & Quiz', align: 'right' },
          { key: 'avgScore', label: 'Điểm TB', align: 'right' },
        ],
        rows: breakdownRows,
        totals: totalsRow,
      },
      secondaryPanel: {
        title: 'Chi tiết công tác chấm bài & đánh giá học thuật trong kỳ',
        subtitle: 'Tổng hợp toàn bộ đầu mục chấm điểm thuộc trách nhiệm giảng viên',
        columns: [
          { key: 'workType', label: 'Loại hình chấm điểm' },
          { key: 'count', label: 'Số lượt', align: 'right' },
          { key: 'detail', label: 'Tình trạng chi tiết' },
        ],
        rows: [
          {
            workType: 'Bài tập tự luận LMS lớp học',
            count: localAssignGrades.length,
            detail: `${localAssignGrades.filter((g) => g.state === 'PUBLISHED').length} đã công bố điểm cho học viên`,
          },
          {
            workType: 'Bài trắc nghiệm / Quiz lớp học',
            count: localQuizAttempts.length,
            detail: `${pendingQuizManual} lượt đang chờ chấm tự luận thủ công`,
          },
          {
            workType: 'Chấm đánh giá xếp lớp (Speaking/Writing)',
            count: placementEvals.length,
            detail: `Ghi nhận trực tiếp theo tài khoản chấm của giảng viên trong kỳ`,
          },
        ],
      },
      ledger: {
        title: 'Chi tiết lịch buổi giảng dạy trong kỳ',
        subtitle: `Hiển thị tối đa 50 buổi dạy hiệu lực gần nhất thuộc lớp phụ trách (tổng ${sessions.length} buổi)`,
        columns: [
          { key: 'classCode', label: 'Mã lớp' },
          { key: 'className', label: 'Tên lớp' },
          { key: 'sessionWindow', label: 'Khung giờ dạy' },
          { key: 'durationHours', label: 'Thời lượng', align: 'right' },
          { key: 'modalityLabel', label: 'Hình thức' },
          { key: 'stateLabel', label: 'Trạng thái' },
        ],
        rows: ledgerRows,
      },
      exportFilenameBase: `bao-cao-giang-day-${window.from}-den-${window.to}`,
    };
  }

  private async buildStudentReport(
    tx: Tx,
    user: { id: string; fullName: string; role: string },
    window: PeriodWindow,
    timeZone: string,
    scopeId: string | null,
  ): Promise<PeriodAnalyticsReport> {
    const enrollments = await tx.enrollment.findMany({
      where: { learnerId: user.id },
      include: {
        classOffering: {
          select: { id: true, code: true, name: true, status: true, modality: true },
        },
      },
      orderBy: { enrolledAt: 'desc' },
    });

    const selectedEnrollment = scopeId
      ? enrollments.find((e) => e.classOfferingId === scopeId || e.id === scopeId) ?? null
      : null;
    if (scopeId && !selectedEnrollment) {
      throw new ForbiddenException('Khóa học không thuộc tài khoản học viên hiện tại');
    }

    const targetEnrollments = selectedEnrollment ? [selectedEnrollment] : enrollments;
    const targetClassIds = targetEnrollments.map((e) => e.classOfferingId);
    const targetEnrollmentIds = targetEnrollments.map((e) => e.id);

    const hasAttTable = await tableExists(tx, 'lms_local_attendance_records');
    const attRows =
      hasAttTable && targetClassIds.length > 0
        ? await safeRawQuery<{
            id: string;
            class_offering_id: string;
            status: string;
            checked_in_at: Date;
          }>(tx, await this.sqlStudentAttendance(user.id, targetClassIds, window))
        : [];

    const hasQuizTable = await tableExists(tx, 'lms_local_quiz_attempts');
    const quizRows =
      hasQuizTable && targetClassIds.length > 0
        ? await safeRawQuery<{
            id: string;
            class_offering_id: string;
            status: string;
            total_score: number | null;
            max_score: number | null;
            submitted_at: Date | null;
            started_at: Date;
          }>(tx, await this.sqlStudentQuizzes(user.id, targetClassIds, window))
        : [];

    const testAttempts = await tx.testAttempt.findMany({
      where: {
        learnerId: user.id,
        createdAt: { gte: window.startAt, lt: window.endExclusive },
        ...(selectedEnrollment ? { enrollmentId: selectedEnrollment.id } : {}),
      },
      select: {
        id: true,
        enrollmentId: true,
        status: true,
        score: true,
        maxScore: true,
        submittedAt: true,
        createdAt: true,
        test: { select: { title: true, purpose: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const placementAttemptIds = testAttempts
      .filter((t) => t.test?.purpose === 'PLACEMENT')
      .map((t) => t.id);
    const hasPlacementEvalTable =
      placementAttemptIds.length > 0 &&
      (await tableExists(tx, 'placement_human_evaluations')) &&
      (await tableExists(tx, 'placement_result_releases'));
    const placementEvalRows = hasPlacementEvalTable
      ? await safeRawQuery<{
          attemptId: string;
          skill: string;
          body: unknown;
        }>(
          tx,
          Prisma.sql`
            SELECT phe."attemptId"::text AS "attemptId", phe.skill, phe.body
            FROM placement_human_evaluations phe
            JOIN placement_result_releases prr ON prr."evaluationId" = phe.id
            WHERE phe."attemptId" = ANY(${placementAttemptIds}::uuid[])
          `,
        )
      : [];
    const placementEvalByAttempt = new Map<
      string,
      { lrCorrect?: number; lrSamples?: number; speaking?: string; writing?: string }
    >();
    for (const row of placementEvalRows) {
      const cur = placementEvalByAttempt.get(row.attemptId) ?? {};
      const body = (row.body ?? {}) as {
        parts?: Array<{ samples?: number; correct?: number }>;
        total?: string | number;
        max?: string | number;
      };
      if (row.skill === 'LR' && Array.isArray(body.parts)) {
        let correct = 0;
        let samples = 0;
        for (const p of body.parts) {
          correct += Number(p?.correct ?? 0);
          samples += Number(p?.samples ?? 0);
        }
        if (samples > 0) {
          cur.lrCorrect = correct;
          cur.lrSamples = samples;
        }
      } else if (row.skill === 'SPEAKING' && body.total !== undefined) {
        cur.speaking = body.max !== undefined ? `${body.total}/${body.max}` : String(body.total);
      } else if (row.skill === 'WRITING' && body.total !== undefined) {
        cur.writing = body.max !== undefined ? `${body.total}/${body.max}` : String(body.total);
      }
      placementEvalByAttempt.set(row.attemptId, cur);
    }

    const lessonProgress = targetEnrollmentIds.length
      ? await tx.lessonProgress.findMany({
          where: {
            enrollmentId: { in: targetEnrollmentIds },
            updatedAt: { gte: window.startAt, lt: window.endExclusive },
          },
          select: { id: true, enrollmentId: true, status: true, updatedAt: true, completedAt: true },
        })
      : [];

    const hasCapTable =
      targetEnrollmentIds.length > 0 && (await tableExists(tx, 'class_activity_progress'));
    const capRows = hasCapTable
      ? await safeRawQuery<{
          enrollmentId: string;
          status: string;
          touchedAt: Date;
        }>(
          tx,
          Prisma.sql`
            SELECT
              cap."enrollmentId"::text AS "enrollmentId",
              cap.status::text AS status,
              COALESCE(cap."completedAt", cap."openedAt") AS "touchedAt"
            FROM class_activity_progress cap
            WHERE cap."enrollmentId" = ANY(${targetEnrollmentIds}::uuid[])
              AND COALESCE(cap."completedAt", cap."openedAt") >= ${window.startAt}
              AND COALESCE(cap."completedAt", cap."openedAt") < ${window.endExclusive}
          `,
        )
      : [];

    const hasCertTable = await tableExists(tx, 'w09_certificates');
    const certRows =
      hasCertTable && targetEnrollmentIds.length > 0
        ? await safeRawQuery<{
            id: string;
            certificateCode: string;
            enrollmentId: string;
            state: string;
            issuedAt: Date;
          }>(tx, await this.sqlStudentCerts(targetEnrollmentIds))
        : [];

    const bucketIndex = new Map(window.bucketKeys.map((k, idx) => [k, idx]));
    const studyEventsSeries = new Array<number>(window.bucketKeys.length).fill(0);
    const quizSeries = new Array<number>(window.bucketKeys.length).fill(0);

    const attByClass = new Map<string, { presentLate: number; total: number }>();
    let totalAttOk = 0;
    for (const a of attRows) {
      const ok = a.status === 'PRESENT' || a.status === 'LATE';
      if (ok) totalAttOk += 1;
      const cur = attByClass.get(a.class_offering_id) ?? { presentLate: 0, total: 0 };
      cur.total += 1;
      if (ok) cur.presentLate += 1;
      attByClass.set(a.class_offering_id, cur);

      const idx = bucketIndex.get(bucketKeyForDate(a.checked_in_at, timeZone, window.granularity));
      if (idx !== undefined) studyEventsSeries[idx] += 1;
    }

    const quizByClass = new Map<string, { submitted: number; total: number; scorePcts: number[] }>();
    const allScorePcts: number[] = [];
    let submittedQuizzes = 0;
    for (const q of quizRows) {
      const isSubmitted = q.status === 'SUBMITTED' || q.status === 'GRADED';
      if (isSubmitted) submittedQuizzes += 1;
      const cur = quizByClass.get(q.class_offering_id) ?? {
        submitted: 0,
        total: 0,
        scorePcts: [],
      };
      cur.total += 1;
      if (isSubmitted) cur.submitted += 1;
      if (isSubmitted && q.total_score !== null && q.max_score && Number(q.max_score) > 0) {
        const sp = pct(Number(q.total_score), Number(q.max_score));
        cur.scorePcts.push(sp);
        allScorePcts.push(sp);
      }
      quizByClass.set(q.class_offering_id, cur);

      const dt = q.submitted_at ?? q.started_at;
      const idx = bucketIndex.get(bucketKeyForDate(dt, timeZone, window.granularity));
      if (idx !== undefined) quizSeries[idx] += 1;
    }

    for (const lp of lessonProgress) {
      const idx = bucketIndex.get(bucketKeyForDate(lp.updatedAt, timeZone, window.granularity));
      if (idx !== undefined) studyEventsSeries[idx] += 1;
    }
    for (const cp of capRows) {
      const idx = bucketIndex.get(bucketKeyForDate(cp.touchedAt, timeZone, window.granularity));
      if (idx !== undefined) studyEventsSeries[idx] += 1;
    }

    const lpByEnrollment = new Map<string, { completed: number; inProgress: number }>();
    let completedLessons = 0;
    let inProgressLessons = 0;
    for (const lp of lessonProgress) {
      const cur = lpByEnrollment.get(lp.enrollmentId) ?? { completed: 0, inProgress: 0 };
      if (lp.status === 'COMPLETED') {
        completedLessons += 1;
        cur.completed += 1;
      } else {
        inProgressLessons += 1;
        cur.inProgress += 1;
      }
      lpByEnrollment.set(lp.enrollmentId, cur);
    }
    for (const cp of capRows) {
      const cur = lpByEnrollment.get(cp.enrollmentId) ?? { completed: 0, inProgress: 0 };
      if (cp.status === 'COMPLETED') {
        completedLessons += 1;
        cur.completed += 1;
      } else {
        inProgressLessons += 1;
        cur.inProgress += 1;
      }
      lpByEnrollment.set(cp.enrollmentId, cur);
    }

    const activeEnr = targetEnrollments.filter((e) => e.status === 'ACTIVE').length;
    const completedEnr = targetEnrollments.filter((e) => e.status === 'COMPLETED').length;
    const avgQuizScore =
      allScorePcts.length > 0
        ? round1(allScorePcts.reduce((a, b) => a + b, 0) / allScorePcts.length)
        : 0;
    const attRate = pct(totalAttOk, attRows.length);
    const issuedCerts = certRows.filter((c) => c.state === 'ISSUED').length;

    const breakdownRows: PeriodReportRow[] = targetEnrollments.map((enr) => {
      const att = attByClass.get(enr.classOfferingId) ?? { presentLate: 0, total: 0 };
      const qz = quizByClass.get(enr.classOfferingId) ?? { submitted: 0, total: 0, scorePcts: [] };
      const lp = lpByEnrollment.get(enr.id) ?? { completed: 0, inProgress: 0 };
      const avgCls =
        qz.scorePcts.length > 0
          ? `${round1(qz.scorePcts.reduce((a, b) => a + b, 0) / qz.scorePcts.length)}%`
          : '—';
      return {
        classCode: enr.classOffering.code,
        className: enr.classOffering.name,
        enrollmentStatus: enrollmentStatusLabel(enr.status),
        attendanceSummary: att.total > 0 ? `${att.presentLate}/${att.total} (${pct(att.presentLate, att.total)}%)` : 'Chưa có',
        quizSummary: `${qz.submitted}/${qz.total}`,
        avgScore: avgCls,
        lessonsSummary: `${lp.completed} xong / ${lp.inProgress} đang học`,
      };
    });

    const totalsRow: PeriodReportRow = {
      classCode: 'TỔNG CỘNG',
      className: `${targetEnrollments.length} ghi danh khóa học`,
      enrollmentStatus: `${activeEnr} đang học · ${completedEnr} hoàn thành`,
      attendanceSummary:
        attRows.length > 0 ? `${totalAttOk}/${attRows.length} (${attRate}%)` : 'Chưa có',
      quizSummary: `${submittedQuizzes}/${quizRows.length}`,
      avgScore: allScorePcts.length > 0 ? `${avgQuizScore}%` : '—',
      lessonsSummary: `${completedLessons} xong / ${inProgressLessons} đang học`,
    };

    const classById = new Map(targetEnrollments.map((e) => [e.classOfferingId, e.classOffering]));
    const ledgerItems: Array<{ sortMs: number; row: PeriodLedgerRow }> = [];

    for (const q of quizRows) {
      const cls = classById.get(q.class_offering_id);
      const dt = q.submitted_at ?? q.started_at;
      const pctText =
        q.total_score !== null && q.max_score && Number(q.max_score) > 0
          ? `${round1(Number(q.total_score))}/${round1(Number(q.max_score))} (${pct(Number(q.total_score), Number(q.max_score))}%)`
          : 'Đang chờ chấm';
      ledgerItems.push({
        sortMs: dt.getTime(),
        row: {
          id: `quiz-${q.id}`,
          activityType: 'Bài Quiz lớp học',
          className: cls?.name ?? 'Khóa học',
          resultText: pctText,
          statusLabel: q.status === 'SUBMITTED' || q.status === 'GRADED' ? 'Đã nộp' : 'Đang làm',
          recordedAt: formatCenterDateTime(dt, timeZone),
          href: cls ? `/classroom/${cls.id}` : '/student/enrollments',
          hrefLabel: 'Vào học',
        },
      });
    }

    const cleanAttemptTitle = (raw?: string | null): string => {
      if (!raw) return 'Đánh giá';
      const cleaned = raw
        .replace(/^\[(?:SYNTHETIC (?:DEMO|DRAFT)|SYNTHETIC DEMO BR136)\]\s*/i, '')
        .trim();
      if (cleaned === 'Speaking and Writing - teacher review') {
        return 'Luyện nói và viết — Giảng viên nhận xét';
      }
      if (cleaned === 'Library visit - Reading and Listening') {
        return 'Luyện nghe và đọc — Một buổi ở thư viện';
      }
      if (cleaned === 'Everyday English — draft review') {
        return 'Tiếng Anh hằng ngày — Luyện tập';
      }
      return cleaned || 'Đánh giá';
    };

    for (const t of testAttempts) {
      const dt = t.submittedAt ?? t.createdAt;
      const pe = placementEvalByAttempt.get(t.id);
      let pctText =
        t.score !== null && t.maxScore !== null && Number(t.maxScore) > 0
          ? `${round1(Number(t.score))}/${round1(Number(t.maxScore))} (${pct(Number(t.score), Number(t.maxScore))}%)`
          : 'Chưa có điểm';
      if (t.score === null && pe) {
        const parts: string[] = [];
        if (pe.lrCorrect !== undefined && pe.lrSamples) {
          parts.push(`L&R ${pe.lrCorrect}/${pe.lrSamples} (${pct(pe.lrCorrect, pe.lrSamples)}%)`);
        }
        if (pe.speaking) parts.push(`Nói ${pe.speaking}`);
        if (pe.writing) parts.push(`Viết ${pe.writing}`);
        if (parts.length > 0) pctText = parts.join(' · ');
      }
      const isPlacement = t.test?.purpose === 'PLACEMENT';
      const matchedAttemptCls = t.enrollmentId
        ? targetEnrollments.find((e) => e.id === t.enrollmentId)?.classOffering
        : undefined;
      ledgerItems.push({
        sortMs: dt.getTime(),
        row: {
          id: `test-${t.id}`,
          activityType: `Bài thi: ${cleanAttemptTitle(t.test?.title) || 'Đánh giá'}`,
          className: matchedAttemptCls
            ? matchedAttemptCls.name
            : selectedEnrollment
              ? selectedEnrollment.classOffering.name
              : 'Hệ thống khảo thí',
          resultText: pctText,
          statusLabel: pe ? 'Đã công bố' : t.status === 'SUBMITTED' ? 'Đã nộp' : 'Đang thực hiện',
          recordedAt: formatCenterDateTime(dt, timeZone),
          href: isPlacement
            ? `/placement/sittings/${t.id}/result`
            : t.enrollmentId
              ? `/student/enrollments/${t.enrollmentId}/tests`
              : '/student/enrollments',
          hrefLabel: isPlacement ? 'Xem kết quả' : 'Xem bài kiểm tra',
        },
      });
    }

    for (const a of attRows) {
      const cls = classById.get(a.class_offering_id);
      ledgerItems.push({
        sortMs: a.checked_in_at.getTime(),
        row: {
          id: `att-${a.id}`,
          activityType: 'Điểm danh buổi học',
          className: cls?.name ?? 'Khóa học',
          resultText: a.status === 'PRESENT' ? 'Có mặt đúng giờ' : a.status === 'LATE' ? 'Đi muộn' : 'Vắng mặt',
          statusLabel: 'Đã ghi nhận',
          recordedAt: formatCenterDateTime(a.checked_in_at, timeZone),
          href: cls ? `/classroom/${cls.id}/attendance` : '/student/enrollments',
          hrefLabel: 'Xem điểm danh',
        },
      });
    }

    ledgerItems.sort((a, b) => b.sortMs - a.sortMs);

    return {
      role: 'STUDENT',
      roleLabel: 'Học viên',
      reportTitle: 'Báo cáo Tiến độ Học tập & Kết quả Cá nhân',
      reportSubtitle:
        'Tổng hợp tình trạng ghi danh khóa học, chuyên cần điểm danh, điểm số Quiz/bài thi và chứng chỉ đạt được của bạn.',
      generatedAt: new Date().toISOString(),
      timezone: timeZone,
      actor: user,
      filters: {
        preset: window.preset,
        from: window.from,
        to: window.to,
        scopeId: selectedEnrollment?.classOfferingId ?? null,
        scopeLabel: selectedEnrollment
          ? `${selectedEnrollment.classOffering.code} — ${selectedEnrollment.classOffering.name}`
          : 'Tất cả khóa học của tôi',
        scopeSelectLabel: 'Khóa học của tôi',
        scopeOptions: enrollments.map((e) => ({
          id: e.classOfferingId,
          label: `${e.classOffering.code} — ${e.classOffering.name}`,
        })),
      },
      kpis: [
        {
          id: 'stu-courses',
          label: 'Khóa học tham gia',
          value: activeEnr + completedEnr,
          sublabel: `${activeEnr} đang học · ${completedEnr} hoàn thành · ${enrollments.length} tổng ghi danh`,
          tone: 'indigo',
        },
        {
          id: 'stu-attendance',
          label: 'Chuyên cần trong kỳ',
          value: attRows.length > 0 ? `${attRate}%` : 'Chưa có',
          sublabel:
            attRows.length > 0
              ? `${totalAttOk}/${attRows.length} buổi có mặt hoặc đi muộn`
              : 'Chưa có lượt điểm danh trong kỳ',
          tone: attRate >= 80 || attRows.length === 0 ? 'emerald' : 'amber',
        },
        {
          id: 'stu-quizzes',
          label: 'Quiz & Điểm trung bình',
          value: allScorePcts.length > 0 ? `${avgQuizScore}%` : `${submittedQuizzes} bài`,
          sublabel: `${submittedQuizzes} quiz đã nộp · ${testAttempts.filter((t) => t.status === 'SUBMITTED').length} bài thi hệ thống đã nộp`,
          tone: 'sky',
        },
        {
          id: 'stu-lessons-certs',
          label: 'Bài học & Chứng chỉ',
          value: `${completedLessons + inProgressLessons} bài học`,
          sublabel: `${completedLessons} hoàn thành · ${inProgressLessons} đang học · ${issuedCerts} chứng chỉ`,
          tone: 'emerald',
        },
      ],
      executiveSummary: [
        `Trong khoảng ${window.from} – ${window.to}, bạn có ${activeEnr} khóa học đang theo học và ${completedEnr} khóa đã hoàn thành (trên tổng ${targetEnrollments.length} lượt ghi danh).`,
        `Chuyên cần điểm danh đạt ${attRows.length > 0 ? `${attRate}% (${totalAttOk}/${attRows.length} buổi)` : 'chưa có dữ liệu điểm danh trong kỳ'}; bạn đã thực hiện ${submittedQuizzes} lượt Quiz lớp học${allScorePcts.length > 0 ? ` với điểm trung bình ${avgQuizScore}%` : ''}.`,
        `Bạn đã tương tác ${lessonProgress.length} bài học (${completedLessons} hoàn thành, ${inProgressLessons} đang học), nộp ${testAttempts.filter((t) => t.status === 'SUBMITTED').length} bài thi hệ thống và sở hữu ${issuedCerts} chứng chỉ được cấp.`,
      ],
      charts: {
        trend: {
          title: 'Nhịp độ học tập & làm bài kiểm tra trong kỳ',
          subtitle: 'Số hoạt động điểm danh/bài học và lượt làm Quiz theo từng mốc thời gian',
          labels: window.bucketLabels,
          series: [
            { name: 'Điểm danh & Bài học', type: 'bar', color: '#4f46e5', data: studyEventsSeries },
            { name: 'Lượt làm Quiz', type: 'line', color: '#10b981', data: quizSeries },
          ],
        },
        distribution: {
          title: 'Trạng thái ghi danh các khóa học',
          subtitle: 'Tổng hợp toàn bộ khóa học gắn với tài khoản của bạn',
          kind: 'pie',
          items: Array.from(
            targetEnrollments.reduce((acc, e) => {
              const lbl = enrollmentStatusLabel(e.status);
              acc.set(lbl, (acc.get(lbl) ?? 0) + 1);
              return acc;
            }, new Map<string, number>()),
          ).map(([name, value], idx) => ({
            name,
            value,
            color: SERIES_PALETTE[idx % SERIES_PALETTE.length],
          })),
        },
      },
      breakdown: {
        title: 'Bảng kết quả học tập theo từng khóa học',
        subtitle: 'Theo dõi chuyên cần, số bài Quiz, điểm trung bình và tiến độ bài học theo từng lớp',
        columns: [
          { key: 'classCode', label: 'Mã lớp' },
          { key: 'className', label: 'Tên khóa học' },
          { key: 'enrollmentStatus', label: 'Trạng thái' },
          { key: 'attendanceSummary', label: 'Chuyên cần (kỳ)', align: 'right' },
          { key: 'quizSummary', label: 'Quiz đã nộp', align: 'right' },
          { key: 'avgScore', label: 'Điểm TB', align: 'right' },
          { key: 'lessonsSummary', label: 'Tiến độ bài học', align: 'right' },
        ],
        rows: breakdownRows,
        totals: totalsRow,
      },
      secondaryPanel: {
        title: 'Chứng chỉ & Bài kiểm tra năng lực hệ thống',
        subtitle: 'Các chứng chỉ và lượt thi xếp lớp gắn với hồ sơ học tập của bạn',
        columns: [
          { key: 'category', label: 'Hạng mục' },
          { key: 'count', label: 'Số lượng', align: 'right' },
          { key: 'detail', label: 'Ghi chú' },
        ],
        rows: [
          {
            category: 'Bài thi xếp lớp / năng lực đã nộp',
            count: testAttempts.filter((t) => t.status === 'SUBMITTED').length,
            detail: `${testAttempts.filter((t) => t.status === 'IN_PROGRESS').length} bài đang thực hiện dở`,
          },
          {
            category: 'Chứng chỉ tốt nghiệp đã cấp',
            count: issuedCerts,
            detail:
              certRows.length > 0
                ? certRows.map((c) => c.certificateCode).join(', ')
                : 'Chưa có chứng chỉ nào được cấp cho các ghi danh đã chọn',
          },
        ],
      },
      ledger: {
        title: 'Nhật ký điểm danh, Quiz & bài thi gần nhất trong kỳ',
        subtitle: `Hiển thị tối đa 50 hoạt động gần nhất của bạn trong giai đoạn chọn lọc`,
        columns: [
          { key: 'activityType', label: 'Hoạt động' },
          { key: 'className', label: 'Khóa học / Nguồn' },
          { key: 'resultText', label: 'Kết quả / Ghi nhận' },
          { key: 'statusLabel', label: 'Trạng thái' },
          { key: 'recordedAt', label: 'Thời gian' },
        ],
        rows: ledgerItems.slice(0, 50).map((i) => i.row),
      },
      exportFilenameBase: `bao-cao-hoc-tap-${window.from}-den-${window.to}`,
    };
  }

  private async buildInspectorReport(
    tx: Tx,
    user: { id: string; fullName: string; role: string },
    window: PeriodWindow,
    timeZone: string,
    scopeId: string | null,
    now: Date,
  ): Promise<PeriodAnalyticsReport> {
    const allOwnAssignments = await tx.w08Assignment.findMany({
      where: { inspectorId: user.id },
      select: { classId: true },
    });

    const scopeClassIds = Array.from(new Set(allOwnAssignments.map((a) => a.classId)));
    const classRows = scopeClassIds.length
      ? await tx.classOffering.findMany({
          where: { id: { in: scopeClassIds } },
          select: { id: true, code: true, name: true },
          orderBy: { code: 'asc' },
        })
      : [];
    const classMap = new Map(classRows.map((c) => [c.id, c]));

    if (scopeId && !scopeClassIds.includes(scopeId)) {
      throw new ForbiddenException('Lớp học nằm ngoài phạm vi phân công thanh tra của bạn');
    }

    const assignments = await tx.w08Assignment.findMany({
      where: {
        inspectorId: user.id,
        startsAt: { lt: window.endExclusive },
        endsAt: { gt: window.startAt },
        ...(scopeId ? { classId: scopeId } : {}),
      },
      orderBy: [{ startsAt: 'desc' }, { id: 'asc' }],
    });

    const assignmentIds = assignments.map((a) => a.id);
    const [segments, reports, decisions, clocks, corrections] = assignmentIds.length
      ? await Promise.all([
          tx.w08Segment.findMany({
            where: { assignmentId: { in: assignmentIds }, inspectorId: user.id },
          }),
          tx.w08Report.findMany({
            where: { assignmentId: { in: assignmentIds }, reporterId: user.id },
            orderBy: { number: 'asc' },
          }),
          tx.w08Decision.findMany({
            where: { assignmentId: { in: assignmentIds } },
            orderBy: { number: 'asc' },
          }),
          tx.w08Clock.findMany({
            where: { assignmentId: { in: assignmentIds }, inspectorId: user.id },
          }),
          tx.w08Correction.findMany({
            where: { assignmentId: { in: assignmentIds }, inspectorId: user.id },
          }),
        ])
      : [[], [], [], [], []];

    const correctionIds = corrections.map((c) => c.id);
    const correctionDecisions = correctionIds.length
      ? await tx.w08CorrectionDecision.findMany({
          where: { correctionId: { in: correctionIds } },
        })
      : [];
    const correctionDecisionMap = new Map(correctionDecisions.map((d) => [d.correctionId, d]));

    const segmentsByAssignment = new Map<string, number>();
    for (const seg of segments) {
      if (!seg.stoppedAt) continue;
      const secs = Math.max(0, Math.floor((seg.stoppedAt.getTime() - seg.startedAt.getTime()) / 1000));
      segmentsByAssignment.set(seg.assignmentId, (segmentsByAssignment.get(seg.assignmentId) ?? 0) + secs);
    }

    const latestReportByAssignment = new Map<string, typeof reports[number]>();
    for (const r of reports) {
      latestReportByAssignment.set(r.assignmentId, r);
    }

    const latestDecisionByAssignment = new Map<string, typeof decisions[number]>();
    for (const d of decisions) {
      latestDecisionByAssignment.set(d.assignmentId, d);
    }

    const clockInByAssignment = new Map<string, number>();
    const clockOutByAssignment = new Map<string, number>();
    const bucketIndex = new Map(window.bucketKeys.map((k, idx) => [k, idx]));
    const liveShiftSeries = new Array<number>(window.bucketKeys.length).fill(0);
    const reportSeries = new Array<number>(window.bucketKeys.length).fill(0);
    const clockSeries = new Array<number>(window.bucketKeys.length).fill(0);

    for (const c of clocks) {
      if (c.kind === 'IN') {
        clockInByAssignment.set(c.assignmentId, (clockInByAssignment.get(c.assignmentId) ?? 0) + 1);
      } else if (c.kind === 'OUT') {
        clockOutByAssignment.set(c.assignmentId, (clockOutByAssignment.get(c.assignmentId) ?? 0) + 1);
      }
      const idx = bucketIndex.get(bucketKeyForDate(c.createdAt, timeZone, window.granularity));
      if (idx !== undefined) clockSeries[idx] += 1;
    }

    const stateCounts = new Map<string, number>();
    const presenceCounts = new Map<string, number>();
    const classBuckets = new Map<
      string,
      {
        classId: string;
        code: string;
        name: string;
        liveCount: number;
        acknowledgedCount: number;
        invalidatedCount: number;
        reportCount: number;
        observedSeconds: number;
        approvedSeconds: number;
      }
    >();

    for (const cid of scopeId ? [scopeId] : scopeClassIds) {
      const cls = classMap.get(cid);
      classBuckets.set(cid, {
        classId: cid,
        code: cls?.code ?? cid.slice(0, 8),
        name: cls?.name ?? 'Lớp học trong phạm vi thanh tra',
        liveCount: 0,
        acknowledgedCount: 0,
        invalidatedCount: 0,
        reportCount: 0,
        observedSeconds: 0,
        approvedSeconds: 0,
      });
    }

    let liveTotal = 0;
    let activePendingAck = 0;
    let acknowledgedTotal = 0;
    let invalidatedTotal = 0;
    let reportedAssignments = 0;
    let totalObservedSeconds = 0;
    let totalApprovedSeconds = 0;
    let approvedDecisionCount = 0;

    for (const a of assignments) {
      stateCounts.set(a.state, (stateCounts.get(a.state) ?? 0) + 1);
      const isLive = ['ACTIVE', 'ACKNOWLEDGED', 'DISPATCHED', 'ACCEPTED'].includes(a.state);
      const isAck = ['ACKNOWLEDGED', 'ACCEPTED'].includes(a.state);
      const cb = classBuckets.get(a.classId);

      if (isLive) {
        liveTotal += 1;
        if (!isAck) activePendingAck += 1;
        if (cb) cb.liveCount += 1;
        const idx = bucketIndex.get(bucketKeyForDate(a.startsAt, timeZone, window.granularity));
        if (idx !== undefined) liveShiftSeries[idx] += 1;
      } else {
        invalidatedTotal += 1;
        if (cb) cb.invalidatedCount += 1;
      }

      if (isAck) {
        acknowledgedTotal += 1;
        if (cb) cb.acknowledgedCount += 1;
      }

      const obsSec = segmentsByAssignment.get(a.id) ?? 0;
      totalObservedSeconds += obsSec;
      if (cb) cb.observedSeconds += obsSec;

      const rep = latestReportByAssignment.get(a.id);
      if (rep) {
        reportedAssignments += 1;
        presenceCounts.set(rep.presence, (presenceCounts.get(rep.presence) ?? 0) + 1);
        if (cb) cb.reportCount += 1;
        const idx = bucketIndex.get(bucketKeyForDate(rep.createdAt, timeZone, window.granularity));
        if (idx !== undefined) reportSeries[idx] += 1;
      }

      const dec = latestDecisionByAssignment.get(a.id);
      if (dec && dec.disposition !== 'REJECT' && dec.approvedSeconds !== null) {
        totalApprovedSeconds += dec.approvedSeconds;
        approvedDecisionCount += 1;
        if (cb) cb.approvedSeconds += dec.approvedSeconds;
      }
    }

    const clockInTotal = clocks.filter((c) => c.kind === 'IN').length;
    const clockOutTotal = clocks.filter((c) => c.kind === 'OUT').length;
    const correctionsAccepted = corrections.filter(
      (c) => correctionDecisionMap.get(c.id)?.disposition === 'ACCEPT',
    ).length;
    const correctionsPending = corrections.filter((c) => !correctionDecisionMap.has(c.id)).length;
    const reportRate = pct(reportedAssignments, liveTotal);

    const breakdownRows: PeriodReportRow[] = Array.from(classBuckets.values()).map((cb) => ({
      classCode: cb.code,
      className: cb.name,
      liveCount: cb.liveCount,
      acknowledgedCount: cb.acknowledgedCount,
      reportCount: cb.reportCount,
      observedDuration: formatDurationShort(cb.observedSeconds),
      approvedDuration: cb.approvedSeconds > 0 ? formatDurationShort(cb.approvedSeconds) : '—',
      invalidatedCount: cb.invalidatedCount,
    }));

    const totalsRow: PeriodReportRow = {
      classCode: 'TỔNG CỘNG',
      className: `${scopeId ? 1 : scopeClassIds.length} lớp trong phạm vi`,
      liveCount: liveTotal,
      acknowledgedCount: acknowledgedTotal,
      reportCount: reportedAssignments,
      observedDuration: formatDurationShort(totalObservedSeconds),
      approvedDuration: totalApprovedSeconds > 0 ? formatDurationShort(totalApprovedSeconds) : '—',
      invalidatedCount: invalidatedTotal,
    };

    const secondaryRows: PeriodReportRow[] = [
      ...Array.from(presenceCounts.entries()).map(([presence, count]) => ({
        category: 'Hiện diện giảng viên (theo biên bản)',
        itemLabel: inspectorPresenceLabel(presence),
        total: count,
        note: `${pct(count, reportedAssignments)}% trên tổng biên bản đã nộp`,
      })),
      {
        category: 'Chấm công ca thanh tra',
        itemLabel: 'Lượt vào ca / ra ca đã ghi nhận',
        total: clocks.length,
        note: `${clockInTotal} lượt vào ca · ${clockOutTotal} lượt ra ca`,
      },
      {
        category: 'Đề xuất điều chỉnh chấm công',
        itemLabel: 'Hồ sơ điều chỉnh gửi Học vụ',
        total: corrections.length,
        note: `${correctionsAccepted} đã chấp nhận · ${correctionsPending} đang chờ xét duyệt`,
      },
    ];

    const ledgerRows: PeriodLedgerRow[] = assignments.slice(0, 50).map((a) => {
      const cls = classMap.get(a.classId);
      const obsSec = segmentsByAssignment.get(a.id) ?? 0;
      const rep = latestReportByAssignment.get(a.id);
      const dec = latestDecisionByAssignment.get(a.id);
      const clockIns = clockInByAssignment.get(a.id) ?? 0;
      const clockOuts = clockOutByAssignment.get(a.id) ?? 0;

      const obsText =
        obsSec > 0
          ? `${formatDurationShort(obsSec)}${dec?.approvedSeconds ? ` · Duyệt: ${formatDurationShort(dec.approvedSeconds)}` : ''}`
          : rep
            ? 'Đã nộp biên bản'
            : 'Chưa ghi nhận quan sát';

      return {
        id: a.id,
        classCode: cls?.code ?? a.classId.slice(0, 8),
        className: cls?.name ?? 'Lớp thanh tra',
        shiftWindow: `${formatCenterDateTime(a.startsAt, timeZone)} → ${formatCenterTimeHm(a.endsAt, timeZone)}`,
        stateLabel: inspectorAssignmentStateLabel(a.state),
        presenceLabel: rep ? inspectorPresenceLabel(rep.presence) : 'Chưa nộp biên bản',
        observationSummary: obsText,
        clockSummary: `${clockIns} vào / ${clockOuts} ra`,
        href: `/workspace/inspection?assignment=${a.id}&date=${formatYmdCenter(a.startsAt, timeZone)}`,
        hrefLabel: 'Mở ca trực',
      };
    });

    const selectedClass = scopeId ? classMap.get(scopeId) : null;

    return {
      role: 'TEACHING_INSPECTOR',
      roleLabel: 'Thanh tra đào tạo',
      reportTitle: 'Báo cáo Công tác Thanh tra, Quan sát & Chấm công Ca trực',
      reportSubtitle:
        'Tổng hợp ca thanh tra được điều phối, tỷ lệ tiếp nhận & nộp biên bản, thời lượng quan sát đối chiếu với Học vụ và chấm công vào/ra ca.',
      generatedAt: now.toISOString(),
      timezone: timeZone,
      actor: user,
      filters: {
        preset: window.preset,
        from: window.from,
        to: window.to,
        scopeId: scopeId ?? null,
        scopeLabel: selectedClass
          ? `${selectedClass.code} — ${selectedClass.name}`
          : 'Tất cả lớp được phân công thanh tra',
        scopeSelectLabel: 'Lớp thanh tra',
        scopeOptions: classRows.map((c) => ({
          id: c.id,
          label: `${c.code} — ${c.name}`,
        })),
      },
      kpis: [
        {
          id: 'insp-shifts',
          label: 'Ca thanh tra hiệu lực',
          value: liveTotal,
          sublabel: `${activePendingAck} chờ tiếp nhận · ${acknowledgedTotal} đã tiếp nhận · ${invalidatedTotal} hết hiệu lực`,
          tone: activePendingAck > 0 ? 'amber' : 'indigo',
        },
        {
          id: 'insp-reports',
          label: 'Biên bản quan sát đã nộp',
          value: `${reportedAssignments}/${liveTotal}`,
          sublabel: `Tỷ lệ hoàn tất ${reportRate}% trên ca hiệu lực trong kỳ`,
          tone: reportRate >= 80 ? 'emerald' : 'sky',
        },
        {
          id: 'insp-hours',
          label: 'Thời lượng quan sát & duyệt',
          value: formatDurationShort(totalObservedSeconds),
          sublabel: `Học vụ xác nhận: ${totalApprovedSeconds > 0 ? formatDurationShort(totalApprovedSeconds) : 'Chưa có'} (${approvedDecisionCount} ca đã đối chiếu)`,
          tone: 'emerald',
        },
        {
          id: 'insp-clocks',
          label: 'Chấm công ca & Điều chỉnh',
          value: `${clocks.length} lượt`,
          sublabel: `${clockInTotal} vào ca · ${clockOutTotal} ra ca · ${corrections.length} đề xuất điều chỉnh`,
          tone: 'sky',
        },
      ],
      executiveSummary: [
        `Trong giai đoạn ${window.from} – ${window.to}, thanh tra được điều phối ${assignments.length} lượt phân công (${liveTotal} ca đang hiệu lực, ${invalidatedTotal} ca đã thay thế do đổi lịch).`,
        `Đã tiếp nhận ${acknowledgedTotal}/${liveTotal} ca hiệu lực (${activePendingAck} ca đang chờ xác nhận nhận ca) và nộp ${reportedAssignments} biên bản quan sát (${reportRate}%).`,
        `Tổng thời lượng quan sát ghi nhận đạt ${formatDurationShort(totalObservedSeconds)}; Học vụ đã đối chiếu xác nhận ${totalApprovedSeconds > 0 ? formatDurationShort(totalApprovedSeconds) : '0 phút'} qua ${approvedDecisionCount} quyết định độc lập.`,
      ],
      charts: {
        trend: {
          title: 'Nhịp độ ca thanh tra, biên bản & chấm công theo thời gian',
          subtitle: 'Số ca thanh tra hiệu lực, biên bản nộp và lượt chấm công vào/ra ca trong kỳ',
          labels: window.bucketLabels,
          series: [
            { name: 'Ca thanh tra hiệu lực', type: 'bar', color: '#4f46e5', data: liveShiftSeries },
            { name: 'Biên bản đã nộp', type: 'bar', color: '#10b981', data: reportSeries },
            { name: 'Lượt chấm công vào/ra', type: 'line', color: '#f59e0b', data: clockSeries },
          ],
        },
        distribution: {
          title: 'Cơ cấu trạng thái phân công thanh tra',
          subtitle: 'Phân bổ toàn bộ ca thanh tra trong kỳ theo trạng thái hiện hành',
          kind: 'pie',
          items: Array.from(stateCounts.entries()).map(([state, value], idx) => ({
            name: inspectorAssignmentStateLabel(state),
            value,
            color: SERIES_PALETTE[idx % SERIES_PALETTE.length],
          })),
        },
      },
      breakdown: {
        title: 'Tổng hợp công tác thanh tra theo từng lớp học',
        subtitle: 'So sánh số ca hiệu lực, tình trạng tiếp nhận, biên bản và giờ đối chiếu theo lớp',
        columns: [
          { key: 'classCode', label: 'Mã lớp' },
          { key: 'className', label: 'Tên lớp học' },
          { key: 'liveCount', label: 'Ca hiệu lực', align: 'right' },
          { key: 'acknowledgedCount', label: 'Đã tiếp nhận', align: 'right' },
          { key: 'reportCount', label: 'Biên bản', align: 'right' },
          { key: 'observedDuration', label: 'Quan sát', align: 'right' },
          { key: 'approvedDuration', label: 'HV xác nhận', align: 'right' },
          { key: 'invalidatedCount', label: 'Đã thay thế', align: 'right' },
        ],
        rows: breakdownRows,
        totals: totalsRow,
      },
      secondaryPanel: {
        title: 'Hiện diện giảng viên & Chấm công thanh tra',
        subtitle: 'Tổng hợp đánh giá hiện diện giảng viên và nhật ký vào/ra ca',
        columns: [
          { key: 'category', label: 'Nhóm nghiệp vụ' },
          { key: 'itemLabel', label: 'Chi tiết' },
          { key: 'total', label: 'Số lượng', align: 'right' },
          { key: 'note', label: 'Diễn giải' },
        ],
        rows: secondaryRows,
      },
      ledger: {
        title: 'Sổ chi tiết ca thanh tra trong kỳ',
        subtitle: `Hiển thị tối đa 50 ca gần nhất (tổng ${assignments.length} ca) — liên kết mở trực tiếp phân hệ thanh tra`,
        columns: [
          { key: 'classCode', label: 'Mã lớp' },
          { key: 'className', label: 'Tên lớp' },
          { key: 'shiftWindow', label: 'Khung giờ ca' },
          { key: 'stateLabel', label: 'Trạng thái ca' },
          { key: 'presenceLabel', label: 'Hiện diện GV' },
          { key: 'observationSummary', label: 'Quan sát / Duyệt' },
          { key: 'clockSummary', label: 'Vào / Ra ca', align: 'right' },
        ],
        rows: ledgerRows,
      },
      exportFilenameBase: `bao-cao-thanh-tra-${window.from}-den-${window.to}`,
    };
  }

  private async buildAdminReport(
    tx: Tx,
    user: { id: string; fullName: string; role: string },
    window: PeriodWindow,
    timeZone: string,
    scopeId: string | null,
    now: Date,
  ): Promise<PeriodAnalyticsReport> {
    const scopeOptions: Array<{ id: string; label: string }> = [
      { id: 'AUTHORITY', label: 'Tài khoản & Phân quyền' },
      { id: 'ESCALATIONS', label: 'Sự cố kỹ thuật từ CSKH' },
      { id: 'SECURITY', label: 'Kiểm toán & Bảo mật hệ thống' },
      { id: 'CONFIG', label: 'Đề xuất cấu hình tích hợp' },
    ];
    if (scopeId && !scopeOptions.some((o) => o.id === scopeId)) {
      throw new ForbiddenException('Phạm vi báo cáo quản trị không hợp lệ');
    }

    const activeScope = scopeId ?? 'ALL';

    const classifyAuditDomain = (objectType: string, action: string): string => {
      if (
        ['USER', 'GRANT', 'ROLE_DECISION', 'AUTHORITY', 'RECOVERY_AUTHORITY'].includes(objectType) ||
        action.startsWith('ACCOUNT_') ||
        action.startsWith('ROLE_') ||
        action.startsWith('GRANT_') ||
        action === 'RECOVERY_AUTHORITY_REVOKE'
      ) {
        return 'AUTHORITY';
      }
      if (
        objectType === 'SupportTicket' ||
        action.includes('SUPPORT') ||
        action.includes('TECHNICAL_ESCALATION')
      ) {
        return 'ESCALATIONS';
      }
      if (
        objectType === 'SYSTEM_CONFIG' ||
        objectType === 'ROLE_REPORT' ||
        action.startsWith('CONFIG_') ||
        action.includes('REPORT_CSV_EXPORT')
      ) {
        return 'CONFIG';
      }
      if (action.includes('DENY') || action.includes('LOCK') || action.includes('REVOKE')) {
        return 'SECURITY';
      }
      return 'ACADEMIC_OPS';
    };

    const domainGroupLabel = (group: string): string => {
      const map: Record<string, string> = {
        AUTHORITY: 'Tài khoản & Phân quyền',
        ESCALATIONS: 'Sự cố kỹ thuật từ CSKH',
        CONFIG: 'Cấu hình & Xuất báo cáo',
        SECURITY: 'Bảo mật & Kiểm soát truy cập',
        ACADEMIC_OPS: 'Học vụ, Giảng dạy & Thanh tra',
      };
      return map[group] ?? 'Vận hành khác';
    };

    const adminActionLabel = (action: string): string => {
      const map: Record<string, string> = {
        ACCOUNT_CREATE: 'Tạo tài khoản nhân sự',
        ACCOUNT_STATUS: 'Đổi trạng thái tài khoản',
        ROLE_REQUEST: 'Đề xuất chuyển vai trò',
        ROLE_APPROVE: 'Phê duyệt vai trò',
        GRANT_REQUEST: 'Đề xuất cấp quyền bổ sung',
        GRANT_APPROVE: 'Phê duyệt quyền bổ sung',
        GRANT_REVOKE: 'Thu hồi quyền bổ sung',
        RECOVERY_AUTHORITY_REVOKE: 'Thu hồi quyền mở lại bài',
        CONFIG_CHANGE_PROPOSED: 'Đề xuất đổi cấu hình',
        W02B_SESSIONS_APPROVE: 'Duyệt ban hành buổi học',
        W02B_SESSIONS_SUBMIT: 'Gửi duyệt lịch buổi học',
        W02B_SESSION_DRAFT_CREATE: 'Tạo nháp buổi học mới',
        W02A_PROGRAM_APPROVE: 'Phê duyệt chương trình học',
        W02A_COURSE_APPROVE: 'Phê duyệt khóa học',
        W03_ACTIVITY_PUBLISH: 'Công bố hoạt động lớp',
        W03_ACTIVITY_DRAFT: 'Lưu nháp hoạt động lớp',
        W03_ACTIVITY_HIDE: 'Ẩn hoạt động lớp',
        W03_SECTION_PUBLISH: 'Công bố chương học',
        W03_SECTION_SAVE: 'Lưu chương học',
        W10_ROLE_REPORT_CSV_EXPORT: 'Xuất CSV báo cáo vận hành',
        SUPPORT_TECHNICAL_ESCALATION_CREATED: 'Tiếp nhận sự cố kỹ thuật mới',
        SUPPORT_TECHNICAL_ESCALATION_IN_REVIEW: 'Đang kiểm tra sự cố kỹ thuật',
        SUPPORT_TECHNICAL_ESCALATION_RESOLVED: 'Hoàn tất xử lý sự cố kỹ thuật',
        SUPPORT_TECHNICAL_ESCALATION_RETURNED_TO_COUNSELOR: 'Chuyển lại CSKH kiểm tra thêm',
      };
      return map[action] ?? action.replace(/^W\d+[A-Z]?_/, '').replace(/_/g, ' ');
    };

    const adminDecisionLabel = (decision: string): string => {
      const map: Record<string, string> = {
        ALLOW: 'Hợp lệ / Cho phép',
        DENY: 'Từ chối truy cập',
        PENDING_OPERATOR_REVIEW: 'Chờ duyệt vận hành',
        EXPORTED: 'Đã xuất dữ liệu',
        RECORDED: 'Đã ghi nhận',
      };
      return map[decision] ?? decision;
    };

    const escalationStateLabel = (state: string): string => {
      const map: Record<string, string> = {
        OPEN: 'Chờ tiếp nhận',
        IN_REVIEW: 'Đang kiểm tra',
        RESOLVED: 'Đã xử lý xong',
        RETURNED_TO_COUNSELOR: 'Đã trả lại CSKH',
      };
      return map[state] ?? state;
    };

    const redactAdminReason = (reason: string | null | undefined): string => {
      if (!reason) return 'Không có ghi chú bổ sung';
      const cleaned = reason
        .replace(
          /(password|passwd|secret|token|apikey|api_key|authorization|bearer)\s*[:=]\s*\S+/gi,
          '$1=***ĐÃ CHE***',
        )
        .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '***JWT ĐÃ CHE***');
      return snippetText(cleaned, 78);
    };

    const realUsers = tx.user?.findMany
      ? await tx.user.findMany({
          where: { NOT: { email: { endsWith: '@example.invalid' } } },
          select: { id: true, role: true, status: true, createdAt: true },
        })
      : [];

    const [auditRows, roleDecisions, permissionGrants] = await Promise.all([
      tx.domainAuditEvent?.findMany
        ? tx.domainAuditEvent.findMany({
            where: { createdAt: { gte: window.startAt, lt: window.endExclusive } },
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
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take: 2000,
          })
        : Promise.resolve([]),
      tx.accountRoleDecision?.findMany
        ? tx.accountRoleDecision.findMany({
            select: {
              id: true,
              userId: true,
              previousRole: true,
              nextRole: true,
              approvedBy: true,
              createdAt: true,
            },
          })
        : Promise.resolve([]),
      tx.permissionGrant?.findMany
        ? tx.permissionGrant.findMany({
            select: {
              id: true,
              userId: true,
              capability: true,
              scopeType: true,
              approvedBy: true,
              revokedAt: true,
              expiresAt: true,
              createdAt: true,
            },
          })
        : Promise.resolve([]),
    ]);

    const hasEscTable = await tableExists(tx, 'support_technical_escalations');
    const escRows = hasEscTable
      ? await safeRawQuery<{
          id: string;
          ticketId: string;
          ticketRef: string;
          incidentCategory: string;
          status: string;
          summary: string;
          createdAt: Date;
          respondedAt: Date | null;
        }>(tx, await this.sqlAdminEscalations())
      : [];

    const hasSessionTable = await tableExists(tx, 'user_sessions');
    const activeSessionRows = hasSessionTable
      ? await safeRawQuery<{ count: number }>(tx, await this.sqlActiveSessionsCount())
      : [];
    const activeSessionsCount = Number(activeSessionRows[0]?.count ?? 0);

    const allEvents = auditRows.map((ev) => ({
      ...ev,
      group: classifyAuditDomain(ev.objectType, ev.action),
    }));

    const scopedEvents = allEvents.filter((ev) => {
      if (activeScope === 'ALL') return true;
      if (activeScope === 'SECURITY') {
        return ev.decision === 'DENY' || ev.group === 'AUTHORITY' || ev.group === 'SECURITY';
      }
      return ev.group === activeScope;
    });

    const escInWindow = escRows.filter(
      (e) => e.createdAt >= window.startAt && e.createdAt < window.endExclusive,
    );
    const escBacklogOpen = escRows.filter((e) => e.status === 'OPEN' || e.status === 'IN_REVIEW').length;
    const escResolvedInWindow = escInWindow.filter(
      (e) => e.status === 'RESOLVED' || e.status === 'RETURNED_TO_COUNSELOR',
    ).length;

    const realUsersActive = realUsers.filter((u) => u.status === 'ACTIVE').length;
    const realUsersLocked = realUsers.filter((u) => u.status === 'LOCKED').length;
    const realUsersInactive = realUsers.filter((u) => u.status === 'INACTIVE').length;
    const newUsersInWindow = realUsers.filter(
      (u) => u.createdAt >= window.startAt && u.createdAt < window.endExclusive,
    ).length;

    const pendingRolesCount = roleDecisions.filter((r) => !r.approvedBy).length;
    const pendingGrantsCount = permissionGrants.filter((g) => !g.approvedBy && !g.revokedAt).length;
    const activeGrantsCount = permissionGrants.filter(
      (g) => Boolean(g.approvedBy) && !g.revokedAt && g.expiresAt > now,
    ).length;

    const allowCount = scopedEvents.filter((e) => e.decision === 'ALLOW' || e.decision === 'EXPORTED').length;
    const denyCount = scopedEvents.filter((e) => e.decision === 'DENY').length;
    const pendingDecisionCount = scopedEvents.filter(
      (e) => e.decision === 'PENDING_OPERATOR_REVIEW',
    ).length;
    const allowRate = pct(allowCount, scopedEvents.length);

    const actorIds = [...new Set(scopedEvents.slice(0, 50).map((e) => e.actorId))];
    const actorNameMap = await this.loadUserNames(tx, actorIds);

    const bucketIndex = new Map(window.bucketKeys.map((k, idx) => [k, idx]));
    const allowSeries = new Array<number>(window.bucketKeys.length).fill(0);
    const pendingSeries = new Array<number>(window.bucketKeys.length).fill(0);
    const denySeries = new Array<number>(window.bucketKeys.length).fill(0);

    const domainAgg = new Map<
      string,
      { group: string; label: string; total: number; allow: number; pending: number; deny: number }
    >();

    for (const ev of scopedEvents) {
      const idx = bucketIndex.get(bucketKeyForDate(ev.createdAt, timeZone, window.granularity));
      if (idx !== undefined) {
        if (ev.decision === 'DENY') denySeries[idx] += 1;
        else if (ev.decision === 'PENDING_OPERATOR_REVIEW') pendingSeries[idx] += 1;
        else allowSeries[idx] += 1;
      }

      const cur = domainAgg.get(ev.group) ?? {
        group: ev.group,
        label: domainGroupLabel(ev.group),
        total: 0,
        allow: 0,
        pending: 0,
        deny: 0,
      };
      cur.total += 1;
      if (ev.decision === 'DENY') cur.deny += 1;
      else if (ev.decision === 'PENDING_OPERATOR_REVIEW') cur.pending += 1;
      else cur.allow += 1;
      domainAgg.set(ev.group, cur);
    }

    const breakdownRows: PeriodReportRow[] = Array.from(domainAgg.values())
      .sort((a, b) => b.total - a.total)
      .map((row) => ({
        groupLabel: row.label,
        totalCount: row.total,
        allowCount: row.allow,
        pendingCount: row.pending,
        denyCount: row.deny,
        allowRate: `${pct(row.allow, row.total)}%`,
      }));

    const totalsRow: PeriodReportRow = {
      groupLabel: 'TỔNG CỘNG',
      totalCount: scopedEvents.length,
      allowCount,
      pendingCount: pendingDecisionCount,
      denyCount,
      allowRate: scopedEvents.length > 0 ? `${allowRate}%` : '—',
    };

    const secondaryRows: PeriodReportRow[] = [
      {
        category: 'Tài khoản hệ thống (thực tế)',
        itemLabel: `${realUsersActive} hoạt động · ${realUsersLocked} khóa · ${realUsersInactive} ngưng`,
        total: realUsers.length,
        note: `${newUsersInWindow} tài khoản tạo mới trong kỳ (đã loại tài khoản kiểm thử)`,
      },
      {
        category: 'Phê duyệt RBAC độc lập',
        itemLabel: `${pendingRolesCount} hồ sơ chuyển vai trò · ${pendingGrantsCount} đề xuất quyền`,
        total: pendingRolesCount + pendingGrantsCount,
        note: `${activeGrantsCount} quyền bổ sung có phạm vi đang còn hiệu lực`,
      },
      {
        category: 'Hàng đợi sự cố kỹ thuật CSKH',
        itemLabel: `${escBacklogOpen} sự cố đang mở / kiểm tra hiện tại`,
        total: escInWindow.length,
        note: `${escResolvedInWindow}/${escInWindow.length} sự cố phát sinh trong kỳ đã có phản hồi xử lý`,
      },
      {
        category: 'Phiên đăng nhập & Cấu hình',
        itemLabel: `${activeSessionsCount} phiên đăng nhập đang hiệu lực`,
        total: pendingDecisionCount,
        note: `${pendingDecisionCount} đề xuất thay đổi cấu hình đang chờ vận hành xác nhận`,
      },
    ];

    const ledgerRows: PeriodLedgerRow[] =
      activeScope === 'ESCALATIONS'
        ? escRows.slice(0, 50).map((e) => ({
            id: e.id,
            occurredAt: formatCenterDateTime(e.createdAt, timeZone),
            actorName: e.ticketRef,
            actionLabel: `Sự cố kỹ thuật (${e.incidentCategory === 'LMS_SUBMISSION_ERROR' ? 'Lỗi nộp bài / tài nguyên LMS' : e.incidentCategory})`,
            decisionLabel: escalationStateLabel(e.status),
            summary: snippetText(e.summary, 78),
            href: '/workspace/operations#technical-escalations',
            hrefLabel: 'Xử lý sự cố',
          }))
        : scopedEvents.slice(0, 50).map((ev) => ({
            id: ev.id,
            occurredAt: formatCenterDateTime(ev.createdAt, timeZone),
            actorName: actorNameMap.get(ev.actorId) ?? 'Hệ thống',
            actionLabel: adminActionLabel(ev.action),
            decisionLabel: adminDecisionLabel(ev.decision),
            summary: redactAdminReason(ev.reason),
            href:
              ev.group === 'AUTHORITY'
                ? '/workspace/authority#rbac'
                : '/workspace/operations',
            hrefLabel: ev.group === 'AUTHORITY' ? 'Mở phân quyền' : 'Xem nhật ký',
          }));

    const selectedScopeLabel =
      scopeOptions.find((o) => o.id === activeScope)?.label ?? 'Toàn bộ phân hệ vận hành & bảo mật';

    return {
      role: 'SYSTEM_ADMIN',
      roleLabel: 'Quản trị hệ thống',
      reportTitle: 'Báo cáo Hệ thống, Kiểm toán & An toàn Vận hành',
      reportSubtitle:
        'Tổng hợp nhật ký kiểm toán hành vi hệ thống, biến động tài khoản & phân quyền RBAC, xử lý sự cố kỹ thuật từ CSKH và tình trạng phiên đăng nhập.',
      generatedAt: now.toISOString(),
      timezone: timeZone,
      actor: user,
      filters: {
        preset: window.preset,
        from: window.from,
        to: window.to,
        scopeId: scopeId ?? null,
        scopeLabel: selectedScopeLabel,
        scopeSelectLabel: 'Phạm vi giám sát',
        scopeOptions,
      },
      kpis: [
        {
          id: 'adm-audit',
          label: 'Sự kiện kiểm toán trong kỳ',
          value: scopedEvents.length,
          sublabel: `${allowCount} hợp lệ · ${pendingDecisionCount} chờ duyệt · ${denyCount} từ chối (${allowRate}% hợp lệ)`,
          tone: denyCount > 0 ? 'amber' : 'indigo',
        },
        {
          id: 'adm-accounts',
          label: 'Tài khoản & Phân quyền RBAC',
          value: `${realUsersActive}/${realUsers.length}`,
          sublabel: `${newUsersInWindow} tài khoản mới · ${pendingRolesCount + pendingGrantsCount} hồ sơ RBAC chờ duyệt`,
          tone: pendingRolesCount + pendingGrantsCount > 0 ? 'amber' : 'emerald',
        },
        {
          id: 'adm-escalations',
          label: 'Sự cố kỹ thuật từ CSKH',
          value: `${escResolvedInWindow}/${escInWindow.length}`,
          sublabel: `${escBacklogOpen} sự cố đang chờ kỹ thuật xử lý · ${activeGrantsCount} quyền bổ sung hiệu lực`,
          tone: escBacklogOpen > 0 ? 'amber' : 'emerald',
        },
        {
          id: 'adm-sessions',
          label: 'Phiên đăng nhập hiệu lực',
          value: activeSessionsCount,
          sublabel: `${denyCount} lượt bị chặn truy cập trong kỳ · Bí mật luôn được che`,
          tone: 'sky',
        },
      ],
      executiveSummary: [
        `Trong giai đoạn ${window.from} – ${window.to}, hệ thống ghi nhận ${scopedEvents.length} bản ghi kiểm toán (${allowCount} hợp lệ / ${denyCount} từ chối truy cập, tỷ lệ hợp lệ ${allowRate}%).`,
        `Danh bạ vận hành hiện có ${realUsers.length} tài khoản (${realUsersActive} đang hoạt động, ${realUsersLocked} đang khóa), cùng ${activeGrantsCount} quyền bổ sung hiệu lực và ${pendingRolesCount + pendingGrantsCount} đề xuất RBAC chờ duyệt độc lập.`,
        `Hàng đợi sự cố kỹ thuật từ CSKH đang có ${escBacklogOpen} hồ sơ chờ xử lý (${escInWindow.length} sự cố phát sinh trong kỳ, đã xử lý ${escResolvedInWindow}).`,
      ],
      charts: {
        trend: {
          title: 'Biến động sự kiện kiểm toán & kiểm soát truy cập',
          subtitle: 'Phân tách thao tác hợp lệ, đề xuất chờ duyệt và lượt từ chối truy cập theo mốc thời gian',
          labels: window.bucketLabels,
          series: [
            { name: 'Hợp lệ / Cho phép', type: 'bar', color: '#10b981', data: allowSeries },
            { name: 'Chờ duyệt vận hành', type: 'bar', color: '#f59e0b', data: pendingSeries },
            { name: 'Từ chối truy cập', type: 'line', color: '#e11d48', data: denySeries },
          ],
        },
        distribution: {
          title: 'Cơ cấu sự kiện theo Phân hệ kiểm soát',
          subtitle: 'Tỷ trọng nhật ký kiểm toán phát sinh theo từng nhóm nghiệp vụ',
          kind: 'pie',
          items: Array.from(domainAgg.values()).map((d, idx) => ({
            name: d.label,
            value: d.total,
            color: SERIES_PALETTE[idx % SERIES_PALETTE.length],
          })),
        },
      },
      breakdown: {
        title: 'Tổng hợp kiểm toán theo Phân hệ quản trị',
        subtitle: 'So sánh tổng số sự kiện, trạng thái hợp lệ, chờ duyệt và tỷ lệ bị từ chối theo phân hệ',
        columns: [
          { key: 'groupLabel', label: 'Phân hệ kiểm soát' },
          { key: 'totalCount', label: 'Tổng sự kiện', align: 'right' },
          { key: 'allowCount', label: 'Hợp lệ', align: 'right' },
          { key: 'pendingCount', label: 'Chờ duyệt', align: 'right' },
          { key: 'denyCount', label: 'Từ chối', align: 'right' },
          { key: 'allowRate', label: 'Tỷ lệ hợp lệ', align: 'right' },
        ],
        rows: breakdownRows,
        totals: totalsRow,
      },
      secondaryPanel: {
        title: 'Tổng quan Tài khoản, RBAC, Sự cố & Phiên hoạt động',
        subtitle: 'Chỉ số trạng thái vận hành thực tế tại thời điểm lập báo cáo',
        columns: [
          { key: 'category', label: 'Hạng mục quản trị' },
          { key: 'itemLabel', label: 'Chi tiết hiện trạng' },
          { key: 'total', label: 'Số lượng', align: 'right' },
          { key: 'note', label: 'Ghi chú vận hành' },
        ],
        rows: secondaryRows,
      },
      ledger: {
        title:
          activeScope === 'ESCALATIONS'
            ? 'Danh sách sự cố kỹ thuật từ CSKH'
            : 'Sổ nhật ký kiểm toán gần nhất trong kỳ',
        subtitle: `Hiển thị tối đa 50 bản ghi gần nhất (tổng ${activeScope === 'ESCALATIONS' ? escRows.length : scopedEvents.length} bản ghi)`,
        columns: [
          { key: 'occurredAt', label: 'Thời gian' },
          { key: 'actorName', label: activeScope === 'ESCALATIONS' ? 'Mã phiếu' : 'Người thực hiện' },
          { key: 'actionLabel', label: 'Hành động / Phân loại' },
          { key: 'decisionLabel', label: 'Kết quả / Trạng thái' },
          { key: 'summary', label: 'Nội dung chi tiết' },
        ],
        rows: ledgerRows,
      },
      exportFilenameBase: `bao-cao-quan-tri-he-thong-${window.from}-den-${window.to}`,
    };
  }

  private async sqlAdminEscalations(): Promise<Prisma.Sql> {
    const { Prisma: PrismaNS } = await import('../../generated/prisma/client');
    return PrismaNS.sql`
      SELECT e.id::text,
             e.ticket_id::text AS "ticketId",
             t.reference AS "ticketRef",
             e.incident_category AS "incidentCategory",
             e.status,
             e.summary,
             e.created_at AS "createdAt",
             e.responded_at AS "respondedAt"
      FROM support_technical_escalations e
      JOIN support_tickets t ON t.id = e.ticket_id
      ORDER BY e.created_at DESC
      LIMIT 200
    `;
  }

  private async sqlActiveSessionsCount(): Promise<Prisma.Sql> {
    const { Prisma: PrismaNS } = await import('../../generated/prisma/client');
    return PrismaNS.sql`
      SELECT count(*)::int AS count
      FROM user_sessions
      WHERE expire > clock_timestamp()
    `;
  }

  private async loadUserNames(tx: Tx, userIds: string[]): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    if (userIds.length === 0) return map;
    const rows = await tx.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, fullName: true },
    });
    for (const r of rows) {
      map.set(r.id, r.fullName);
    }
    return map;
  }

  private async sqlAttendanceByClasses(
    classIds: string[],
    window: PeriodWindow,
  ): Promise<Prisma.Sql> {
    const { Prisma: PrismaNS } = await import('../../generated/prisma/client');
    return PrismaNS.sql`
      SELECT class_offering_id::text, status, checked_in_at
      FROM lms_local_attendance_records
      WHERE class_offering_id::text = ANY(${classIds}::text[])
        AND checked_in_at >= ${window.startAt}
        AND checked_in_at < ${window.endExclusive}
    `;
  }

  private async sqlCertsByClasses(classIds: string[], window: PeriodWindow): Promise<Prisma.Sql> {
    const { Prisma: PrismaNS } = await import('../../generated/prisma/client');
    return PrismaNS.sql`
      SELECT c.id::text, c."certificateCode", c.state, c."issuedAt", e."classOfferingId"::text AS "classOfferingId"
      FROM w09_certificates c
      JOIN enrollments e ON e.id = c."enrollmentId"
      WHERE e."classOfferingId"::text = ANY(${classIds}::text[])
        AND c."issuedAt" >= ${window.startAt}
        AND c."issuedAt" < ${window.endExclusive}
    `;
  }

  private async sqlLocalAssignGradesByClasses(
    classIds: string[],
    window: PeriodWindow,
  ): Promise<Prisma.Sql> {
    const { Prisma: PrismaNS } = await import('../../generated/prisma/client');
    return PrismaNS.sql`
      SELECT submission_id::text, class_offering_id::text, score, max_score, state, graded_at
      FROM lms_local_assignment_grades
      WHERE class_offering_id::text = ANY(${classIds}::text[])
        AND COALESCE(graded_at, updated_at) >= ${window.startAt}
        AND COALESCE(graded_at, updated_at) < ${window.endExclusive}
    `;
  }

  private async sqlLocalQuizzesByClasses(
    classIds: string[],
    window: PeriodWindow,
  ): Promise<Prisma.Sql> {
    const { Prisma: PrismaNS } = await import('../../generated/prisma/client');
    return PrismaNS.sql`
      SELECT id::text, class_offering_id::text, total_score, max_score, grading_status, submitted_at
      FROM lms_local_quiz_attempts
      WHERE class_offering_id::text = ANY(${classIds}::text[])
        AND COALESCE(submitted_at, started_at) >= ${window.startAt}
        AND COALESCE(submitted_at, started_at) < ${window.endExclusive}
    `;
  }

  private async sqlStudentAttendance(
    learnerId: string,
    classIds: string[],
    window: PeriodWindow,
  ): Promise<Prisma.Sql> {
    const { Prisma: PrismaNS } = await import('../../generated/prisma/client');
    return PrismaNS.sql`
      SELECT id::text, class_offering_id::text, status, checked_in_at
      FROM lms_local_attendance_records
      WHERE learner_id::text = ${learnerId}
        AND class_offering_id::text = ANY(${classIds}::text[])
        AND checked_in_at >= ${window.startAt}
        AND checked_in_at < ${window.endExclusive}
    `;
  }

  private async sqlStudentQuizzes(
    learnerId: string,
    classIds: string[],
    window: PeriodWindow,
  ): Promise<Prisma.Sql> {
    const { Prisma: PrismaNS } = await import('../../generated/prisma/client');
    return PrismaNS.sql`
      SELECT id::text, class_offering_id::text, status, total_score, max_score, submitted_at, started_at
      FROM lms_local_quiz_attempts
      WHERE learner_id::text = ${learnerId}
        AND class_offering_id::text = ANY(${classIds}::text[])
        AND COALESCE(submitted_at, started_at) >= ${window.startAt}
        AND COALESCE(submitted_at, started_at) < ${window.endExclusive}
    `;
  }

  private async sqlStudentCerts(enrollmentIds: string[]): Promise<Prisma.Sql> {
    const { Prisma: PrismaNS } = await import('../../generated/prisma/client');
    return PrismaNS.sql`
      SELECT id::text, "certificateCode", "enrollmentId"::text, state, "issuedAt"
      FROM w09_certificates
      WHERE "enrollmentId"::text = ANY(${enrollmentIds}::text[])
      ORDER BY "issuedAt" DESC
    `;
  }
}

class NotFoundOrForbiddenClassError extends ForbiddenException {
  constructor() {
    super('Lớp học không tồn tại hoặc nằm ngoài phạm vi báo cáo');
  }
}
