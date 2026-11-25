import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import {
  Download,
  FileSpreadsheet,
  Lightbulb,
  Printer,
  RefreshCw,
  Search,
} from 'lucide-react';
import { ReportEChart } from '@/components/charts/ReportEChart';
import { useAuth } from '@/features/auth/auth-context';
import { useProductRead } from '@/features/product/api';
import { apiFetch } from '@/lib/api-client';
import { centerToday, roleReportDescriptions } from './model';
import type { BusinessRole } from './contracts';
import { sourceAvailabilityLabel } from '@/features/presentation/labels';
import { classCodeLabel } from '@/features/demo/presentation';
import {
  buildDomainDonutOption,
  buildShiftBarOption,
  buildTrend7dOption,
  type RoleReportTrendDay,
} from './role-report-echarts';
import {
  buildExecutiveNarrative,
  downloadExecutiveCsvReport,
  downloadFormattedExcelReport,
  type ExecutiveReportExportInput,
} from './role-report-export';
import { CashierFinancialReport } from './CashierFinancialReport';
import { RolePeriodAnalyticsReport } from './RolePeriodAnalyticsReport';
import {
  formatPrintTimestampVn,
  PrintableReportFooter,
  PrintableReportHeader,
} from './PrintableReportChrome';
import {
  formatActionLabel,
  formatObjectTypeLabel,
} from '@/features/workspace/admin-presentation';

const PERIOD_ANALYTICS_ROLES = new Set([
  'COUNSELOR',
  'ACADEMIC_MANAGER',
  'INSTRUCTOR',
  'STUDENT',
  'TEACHING_INSPECTOR',
  'SYSTEM_ADMIN',
]);

function periodReportTabLabel(role: string | undefined, academicTrack?: 'TRAINING' | 'STUDENT_AFFAIRS' | null): string {
  switch (role) {
    case 'CASHIER':
      return 'Báo cáo tài chính & Doanh thu';
    case 'COUNSELOR':
      return 'Báo cáo Tư vấn & CSKH';
    case 'ACADEMIC_MANAGER':
      if (academicTrack === 'TRAINING') return 'Báo cáo Điều hành Đào tạo';
      if (academicTrack === 'STUDENT_AFFAIRS') return 'Báo cáo Học vụ Học viên';
      return 'Báo cáo Điều hành Học vụ';
    case 'INSTRUCTOR':
      return 'Báo cáo Giảng dạy & Chấm bài';
    case 'STUDENT':
      return 'Báo cáo Tiến độ & Kết quả học tập';
    case 'TEACHING_INSPECTOR':
      return 'Báo cáo Thanh tra & Giám sát';
    case 'SYSTEM_ADMIN':
      return 'Báo cáo Hệ thống, Kiểm toán & Bảo mật';
    default:
      return 'Báo cáo tổng hợp';
  }
}

type ReportRecord = {
  id: string;
  at: string;
  label: string;
  state: string;
  revision: string;
  resource: string;
};

type ReportSource = {
  code: string;
  wave: string;
  state: string;
  reason: string | null;
  completeness: string;
  authority: string | null;
  records: ReportRecord[] | null;
};

type Report = {
  viewerId: string;
  role: string;
  asOf: string;
  window: { date: string; timeZone: string; startAt: string; endExclusive: string };
  filters: { source: string };
  sourceOptions: string[];
  completeness: 'PARTIAL';
  formalReportAuthorized?: boolean;
  metrics?: {
    state: 'AVAILABLE' | 'UNAVAILABLE';
    value: {
      totalSources: number;
      availableSources: number;
      totalRecords: number;
      bySource: Record<string, { state: string; count: number | null; wave: string }>;
      byState: Record<string, number>;
    } | null;
    reason: string | null;
  };
  csv: { available: boolean; reason: string | null };
  sources: ReportSource[];
};

const labels: Record<string, string> = {
  LEARNING: 'Hoạt động học tập',
  SUBMISSIONS: 'Bài đã nộp',
  PLACEMENT_RESULTS: 'Kết quả kiểm tra đầu vào đã công bố',
  TEACHING: 'Lịch dạy được phân công',
  GRADING: 'Bản chấm trong phân công hiện hành',
  SUPPORT: 'CSKH trong phạm vi',
  CONSULTATION: 'Tư vấn 1:1',
  ACADEMIC: 'Hồ sơ lớp học quản lý',
  FINANCE: 'Thu phí và đối soát',
  INSPECTION: 'Thanh tra được phân công',
  STAFF_SHIFT: 'Ca của bản thân',
  ACCOUNTS: 'Bản ghi tạo tài khoản',
  SECURITY_OPS: 'Nhật ký và vận hành',
  CERTIFICATE: 'Chứng chỉ & Hoàn thành',
  CLASS_SCHEDULE: 'Lịch buổi học đã công bố',
  ACADEMIC_DECISIONS: 'Quyết định phê duyệt học vụ',
  AUTHORITY_EVENTS: 'Thay đổi tài khoản và quyền',
  RUNTIME_PROBE: 'Kiểm tra kết nối dữ liệu',
  TEACHING_CALENDAR: 'Lịch dạy đã công bố của bản thân',
};

const reasons: Record<string, string> = {
  W05A_TARGET_GUARD_OR_CURRENT_SCOPE_REQUIRED:
    'Nguồn tư vấn và hỗ trợ chưa vượt qua kiểm tra an toàn hoặc bạn chưa có quyền xem chủ đề này.',
  W07_TARGET_GUARD_OR_CURRENT_SCOPE_REQUIRED:
    'Nguồn học phí chưa đủ cấu hình đã xác minh hoặc quyền truy cập hiện hành.',
  W08_GUARD_OR_CURRENT_IDENTITY_REQUIRED:
    'Nguồn thanh tra chưa vượt qua kiểm tra an toàn hoặc chưa xác minh được tài khoản.',
  NO_CURRENT_SUPPORT_TOPIC_SCOPE:
    'Bạn chưa có quyền xem chủ đề hỗ trợ này hoặc quyền đã hết hạn.',
  NO_CURRENT_FINANCE_CLASS_SCOPE:
    'Không có quyền tài chính theo lớp còn hiệu lực. Không hiển thị giao dịch ngoài phạm vi.',
  CURRENT_SOURCE_AUTHORITY_OR_GUARD_UNAVAILABLE:
    'Quyền truy cập hoặc kiểm tra an toàn của nguồn chưa đủ điều kiện.',
  SOURCE_GUARD_UNAVAILABLE: 'Nguồn chưa vượt qua kiểm tra an toàn để đọc dữ liệu.',
  NO_CURRENT_ASSIGNED_CLASS: 'Không có lớp được phân công hiện hành trong phạm vi đọc.',
  CURRENT_CLASS_READ_REQUIRED: 'Chưa có quyền xem lớp hiện hành.',
  CURRENT_ACCOUNTS_SOURCE_READ_REQUIRED: 'Chưa có quyền đọc nguồn tài khoản.',
  EXACT_OPS_AUDIT_SCOPE_NOT_REGISTERED:
    'Chưa được cấp quyền xem nhật ký trong phạm vi này; quyền quản lý tài khoản không bao gồm quyền xem nhật ký.',
  W05B_RUNTIME_UNACCEPTED: 'Nguồn lịch tư vấn 1:1 chưa được xác minh hoạt động.',
  W09_ISSUANCE_UNAVAILABLE: 'Nguồn phát hành chứng chỉ chưa khả dụng.',
  GUARDED_SCOPED_SOURCE_READER_NOT_CONNECTED:
    'Chưa kết nối được nguồn đã xác minh với quyền truy cập phù hợp.',
};

const stateLabels: Record<string, string> = {
  PUBLISHED: 'Đã công bố',
  CONFIRMED: 'Đã xác nhận',
  APPROVED: 'Đã duyệt',
  REVIEWED_FINAL: 'Đã chấm & Xác nhận',
  PENDING: 'Chờ duyệt',
  PENDING_APPROVAL: 'Chờ duyệt',
  PENDING_GV: 'Chờ xác nhận',
  IN_PROGRESS: 'Đang diễn ra',
  ISSUED: 'Đã cấp chứng chỉ',
  ROUTED: 'Đã chuyển duyệt',
  BLOCKED: 'Đã tạm khóa',
  COMPLETED: 'Đã hoàn thành',
  CANCELLED: 'Đã hủy',
  REJECTED: 'Từ chối',
  DRAFT: 'Nháp',
  ACTIVE: 'Đang hoạt động',
  OPEN: 'Đang mở',
  NEW: 'Chờ tiếp nhận',
  TRIAGED: 'Đã phân loại',
  WAITING_CUSTOMER: 'Chờ học viên',
  WAITING_SPECIALIST: 'Chờ phản hồi chuyên môn',
  RESOLVED: 'Đã giải quyết',
  CLOSED: 'Đã đóng',
  REOPENED: 'Đã mở lại',
  PAID: 'Đã thu đủ',
  AUTO_SETTLED: 'Tự động khớp SePay',
  SETTLED: 'Đã đối soát xong',
  PARTIAL: 'Thu một phần',
  UNPAID: 'Chưa thanh toán',
  OVERPAID: 'Nộp dư',
  NEEDS_RECONCILIATION: 'Cần đối soát',
  PENDING_CASHIER_REVIEW: 'Chờ Thu ngân xử lý',
  EXPIRED: 'Quá hạn giữ chỗ',
  ACKNOWLEDGED: 'Đã tiếp nhận ca',
  ACCEPTED: 'Đã tiếp nhận ca',
  IN: 'Vào ca',
  OUT: 'Ra ca',
  INVALIDATED: 'Hết hiệu lực / Đổi lịch',
  SUPERSEDED: 'Đã có bản thay thế',
  REVOKED: 'Đã thu hồi',
  HVU_CONFIRMED: 'Học vụ đã xác nhận',
  DECLINED: 'Không thể nhận ca',
  REASSIGNED: 'Đã điều phối lại',
  ALLOW: 'Hợp lệ / Cho phép',
  DENY: 'Từ chối truy cập',
  RECORDED: 'Đã ghi nhận',
  QUERY_SUCCEEDED: 'Kết nối CSDL ổn định',
  PENDING_OPERATOR_REVIEW: 'Chờ duyệt vận hành',
  EXPORTED: 'Đã xuất dữ liệu',
  RETURNED_TO_COUNSELOR: 'Đã trả lại CSKH',
  UNKNOWN: 'Chưa thể xác định',
};

const formatReportState = (state: string, role?: string) => {
  if (role === 'CASHIER' && state === 'ISSUED') return 'Đã phát hành';
  return stateLabels[state] ?? state;
};

const COMPLETED_STATES = new Set([
  'PUBLISHED',
  'CONFIRMED',
  'APPROVED',
  'REVIEWED_FINAL',
  'ISSUED',
  'COMPLETED',
  'RESOLVED',
  'CLOSED',
  'PAID',
  'AUTO_SETTLED',
  'SETTLED',
  'ACKNOWLEDGED',
  'OUT',
  'HVU_CONFIRMED',
  'ALLOW',
  'RECORDED',
  'QUERY_SUCCEEDED',
  'EXPORTED',
  'RETURNED_TO_COUNSELOR',
]);

const formatReportLabel = (text: string) => {
  if (text.startsWith('API thực thi SELECT 1 tới PostgreSQL')) {
    return 'Kiểm tra kết nối cơ sở dữ liệu PostgreSQL';
  }
  const colonIdx = text.indexOf(': ');
  if (colonIdx > 0 && /^[A-Za-z_]+$/.test(text.slice(0, colonIdx))) {
    const obj = text.slice(0, colonIdx);
    const act = text.slice(colonIdx + 2);
    return `${formatObjectTypeLabel(obj)}: ${formatActionLabel(act)}`;
  }
  if (/^[A-Z0-9_]+$/.test(text)) {
    return formatActionLabel(text);
  }
  return text
    .replace(/\bW0[123][A-Z]*-[A-Za-z0-9-]+\b/g, (code) => classCodeLabel(code))
    .replace(/\bQuyết định SESSION\b/g, 'Phê duyệt buổi học')
    .replace(/\bQuyết định ASSIGNMENT\b/g, 'Phê duyệt phân công GV')
    .replace(/\bQuyết định PROGRAM\b/g, 'Phê duyệt chương trình')
    .replace(/\bCông bố kết quả FOUR_SKILLS\b/g, 'Công bố kết quả 4 kỹ năng')
    .replace(/\bCông bố kết quả SPEAKING\b/g, 'Công bố kết quả Kỹ năng Nói')
    .replace(/\bCông bố kết quả WRITING\b/g, 'Công bố kết quả Kỹ năng Viết')
    .replace(/\bCông bố kết quả LR\b/g, 'Công bố kết quả Nghe & Đọc');
};

const roles: Record<string, string> = {
  STUDENT: 'Học viên',
  INSTRUCTOR: 'Giảng viên',
  COUNSELOR: 'Tư vấn viên',
  ACADEMIC_MANAGER: 'Quản lý học vụ',
  CASHIER: 'Thu ngân',
  TEACHING_INSPECTOR: 'Thanh tra',
  SYSTEM_ADMIN: 'Quản trị',
};

const displayTime = (s: string) =>
  new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(s));

const formatVnDateLabel = (dateStr: string) => {
  const parts = dateStr.split('-');
  return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : dateStr;
};

function vnHour(iso: string): number {
  const part = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    hourCycle: 'h23',
  })
    .formatToParts(new Date(iso))
    .find((p) => p.type === 'hour');
  return Number(part?.value ?? 0);
}

function shiftDate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  return new Date(Date.UTC(y, m - 1, d + days, 12, 0, 0)).toISOString().slice(0, 10);
}

export function RoleReportsPage() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const isCashier = user?.role === 'CASHIER';
  const hasPeriodAnalytics = Boolean(user?.role && PERIOD_ANALYTICS_ROLES.has(user.role));
  const supportsTabs = isCashier || hasPeriodAnalytics;
  const activeMode =
    supportsTabs && params.get('tab') !== 'activity' && !params.get('date')
      ? isCashier
        ? 'financial'
        : 'period'
      : 'activity';

  if (!supportsTabs) {
    return <RoleReportsContent />;
  }

  return (
    <div className="section-shell min-w-0 space-y-5 py-6">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3 print:hidden">
        <button
          type="button"
          onClick={() => setParams({}, { replace: true })}
          className={`rounded-lg border px-4 py-2 text-xs font-semibold transition ${
            activeMode !== 'activity'
              ? 'border-[#76a35e] bg-[#76a35e] text-white'
              : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
          }`}
        >
          {periodReportTabLabel(user?.role, user?.academicTrack)}
        </button>
        <button
          type="button"
          onClick={() => setParams({ tab: 'activity' }, { replace: true })}
          className={`rounded-lg border px-4 py-2 text-xs font-semibold transition ${
            activeMode === 'activity'
              ? 'border-[#76a35e] bg-[#76a35e] text-white'
              : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
          }`}
        >
          Nhật ký hoạt động trong ngày
        </button>
      </div>

      {activeMode === 'financial' ? (
        <CashierFinancialReport />
      ) : activeMode === 'period' ? (
        <RolePeriodAnalyticsReport />
      ) : (
        <RoleReportsContent embedded />
      )}
    </div>
  );
}

function RoleReportsContent({ embedded = false }: { embedded?: boolean }) {
  const { user } = useAuth(),
    [params, setParams] = useSearchParams();
  const updateFilterParams = (next: { date: string; source: string }) => {
    const currentTab = params.get('tab');
    setParams(currentTab ? { tab: currentTab, ...next } : next);
  };
  const todayStr = useMemo(() => centerToday(), []);
  const yesterdayStr = useMemo(() => shiftDate(todayStr, -1), [todayStr]);
  const date = params.get('date') ?? todayStr,
    source = params.get('source') ?? 'ALL';
  const {
    data: response,
    phase,
    reload,
  } = useProductRead<Report>(
    '/v2/operations/role-reports?' + new URLSearchParams({ date, source }),
  );
  const data =
    response?.viewerId === user?.id && response?.role === user?.role ? response : undefined;

  const [trendDays, setTrendDays] = useState<RoleReportTrendDay[] | null>(null);
  const [exporting, setExporting] = useState(false);
  const [detailSearch, setDetailSearch] = useState('');
  const [groupMode, setGroupMode] = useState<'summary' | 'detail'>('summary');
  const [expandedSources, setExpandedSources] = useState<Record<string, boolean>>({});
  const [exportResult, setExportResult] = useState<{
    fileName: string;
    rowCount: number;
    kind: 'Excel' | 'CSV';
  } | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    if (!data) {
      setTrendDays(null);
      return;
    }
    let live = true;
    void apiFetch<{ endDate: string; days: RoleReportTrendDay[] }>(
      '/v2/operations/role-reports/trend?' + new URLSearchParams({ date, source }),
    )
      .then((res) => {
        if (live && Array.isArray(res?.days)) {
          setTrendDays(res.days);
        }
      })
      .catch(() => {
        if (live) setTrendDays(null);
      });
    return () => {
      live = false;
    };
  }, [data, date, source]);

  const sourcesWithRecords = useMemo(
    () => (data?.sources ?? []).filter((s) => (s.records?.length ?? 0) > 0),
    [data],
  );
  const otherSources = useMemo(
    () => (data?.sources ?? []).filter((s) => (s.records?.length ?? 0) === 0),
    [data],
  );
  const allRecords = useMemo(
    () => sourcesWithRecords.flatMap((s) => s.records ?? []),
    [sourcesWithRecords],
  );
  const totalVisibleRecords = allRecords.length;
  const totalRecordsCount =
    data?.metrics?.state === 'AVAILABLE' && data.metrics.value
      ? data.metrics.value.totalRecords
      : totalVisibleRecords;

  const stateBreakdown = useMemo(() => {
    const entries =
      data?.metrics?.state === 'AVAILABLE' && data.metrics.value
        ? Object.entries(data.metrics.value.byState)
        : Object.entries(
            allRecords.reduce<Record<string, number>>((acc, r) => {
              acc[r.state] = (acc[r.state] ?? 0) + 1;
              return acc;
            }, {}),
          );
    return entries.sort((a, b) => b[1] - a[1]);
  }, [data, allRecords]);

  const completedCount = useMemo(
    () =>
      stateBreakdown.reduce(
        (sum, [st, cnt]) => (COMPLETED_STATES.has(st) ? sum + cnt : sum),
        0,
      ),
    [stateBreakdown],
  );
  const completedRate =
    totalRecordsCount > 0 ? Math.round((completedCount / totalRecordsCount) * 100) : 0;
  const pendingCount = Math.max(0, totalRecordsCount - completedCount);

  const topSource = useMemo(() => {
    if (!sourcesWithRecords.length) return null;
    const top = [...sourcesWithRecords].sort(
      (a, b) => (b.records?.length ?? 0) - (a.records?.length ?? 0),
    )[0];
    const cnt = top.records?.length ?? 0;
    return {
      code: top.code,
      label: labels[top.code] ?? top.code,
      count: cnt,
      pct: totalRecordsCount > 0 ? Math.round((cnt / totalRecordsCount) * 100) : 0,
      records: top.records ?? [],
    };
  }, [sourcesWithRecords, totalRecordsCount]);

  const topGroupedActivity = useMemo(() => {
    if (!topSource) return null;
    const counts = new Map<string, number>();
    for (const r of topSource.records) {
      const lbl = formatReportLabel(r.label);
      counts.set(lbl, (counts.get(lbl) ?? 0) + 1);
    }
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    return sorted[0] ? { label: sorted[0][0], count: sorted[0][1] } : null;
  }, [topSource]);

  const shiftBreakdown = useMemo(() => {
    const buckets = [
      { label: 'Đêm (00–05h)', count: 0 },
      { label: 'Sáng (06–11h)', count: 0 },
      { label: 'Chiều (12–17h)', count: 0 },
      { label: 'Tối (18–23h)', count: 0 },
    ];
    for (const r of allRecords) {
      const h = vnHour(r.at);
      if (h < 6) buckets[0].count += 1;
      else if (h < 12) buckets[1].count += 1;
      else if (h < 18) buckets[2].count += 1;
      else buckets[3].count += 1;
    }
    return buckets.map((b) => ({
      ...b,
      pct: totalVisibleRecords > 0 ? Math.round((b.count / totalVisibleRecords) * 100) : 0,
    }));
  }, [allRecords, totalVisibleRecords]);

  const peakShift = useMemo(
    () => [...shiftBreakdown].sort((a, b) => b.count - a.count)[0] ?? null,
    [shiftBreakdown],
  );

  const narrative = useMemo(
    () =>
      buildExecutiveNarrative({
        dateLabel: formatVnDateLabel(data?.window.date ?? date),
        isoDate: data?.window.date ?? date,
        totalRecords: totalRecordsCount,
        completedCount,
        completedRate,
        activeDomainCount: sourcesWithRecords.length,
        totalDomainCount: data?.sources.length ?? 0,
        topSource,
        topGroupedActivity,
        peakShift,
        pendingCount,
        trendDays,
        isStudent: user?.role === 'STUDENT',
      }),
    [
      data,
      date,
      totalRecordsCount,
      completedCount,
      completedRate,
      sourcesWithRecords.length,
      topSource,
      topGroupedActivity,
      peakShift,
      pendingCount,
      trendDays,
      user?.role,
    ],
  );

  const deltaVsPrevDay = useMemo(() => {
    if (!trendDays || trendDays.length < 2 || !data) return null;
    const idx = trendDays.findIndex((d) => d.date === data.window.date);
    if (idx <= 0) return null;
    const prev = trendDays[idx - 1];
    const diff = totalRecordsCount - prev.total;
    return {
      diff,
      prevTotal: prev.total,
      prevDateLabel: formatVnDateLabel(prev.date),
      avg7d: Math.round(trendDays.reduce((s, d) => s + d.total, 0) / trendDays.length),
    };
  }, [trendDays, data, totalRecordsCount]);

  const trendOption = useMemo(
    () =>
      trendDays && data
        ? buildTrend7dOption(
            trendDays,
            data.window.date,
            user?.role === 'SYSTEM_ADMIN' ? 'Hợp lệ / Xác nhận' : 'Đã công bố / Hoàn tất',
          )
        : null,
    [trendDays, data, user?.role],
  );
  const donutOption = useMemo(
    () =>
      data && totalRecordsCount > 0
        ? buildDomainDonutOption(
            data.sources.map((s) => ({
              code: s.code,
              label: labels[s.code] ?? s.code,
              count: s.records?.length ?? 0,
            })),
          )
        : null,
    [data, totalRecordsCount],
  );
  const shiftOption = useMemo(
    () => (totalVisibleRecords > 0 ? buildShiftBarOption(shiftBreakdown) : null),
    [totalVisibleRecords, shiftBreakdown],
  );

  const resolvedRoleLabel =
    user?.role === 'ACADEMIC_MANAGER'
      ? user.academicTrack === 'TRAINING'
        ? 'Quản lý Đào tạo'
        : user.academicTrack === 'STUDENT_AFFAIRS'
          ? 'Quản lý Học vụ Học viên'
          : roles.ACADEMIC_MANAGER
      : (roles[user?.role ?? ''] ?? 'Nhân sự');

  const buildExportInput = (): ExecutiveReportExportInput | null => {
    if (!data) return null;
    return {
      dateLabel: formatVnDateLabel(data.window.date),
      isoDate: data.window.date,
      roleKey: data.role,
      roleLabel: resolvedRoleLabel,
      viewerName: user?.fullName ?? 'Cán bộ quản lý',
      updatedAtLabel: displayTime(data.asOf),
      filterLabel:
        data.filters.source === 'ALL'
          ? 'Tất cả phân hệ'
          : (labels[data.filters.source] ?? data.filters.source),
      totalRecords: totalRecordsCount,
      completedCount,
      completedRate,
      narrativeBullets: narrative.bullets,
      sources: data.sources.map((s) => {
        const recs = s.records ?? [];
        const pct = totalRecordsCount > 0 ? Math.round((recs.length / totalRecordsCount) * 100) : 0;
        return {
          code: s.code,
          label: labels[s.code] ?? s.code,
          count: recs.length,
          pct,
          availabilityLabel: sourceAvailabilityLabel(s.state),
          records: recs.map((r) => ({
            atLabel: displayTime(r.at),
            activityLabel: formatReportLabel(r.label),
            stateLabel: formatReportState(r.state, user?.role),
            ref: r.resource || r.id,
          })),
        };
      }),
      stateRows: stateBreakdown.map(([st, cnt]) => ({
        stateLabel: formatReportState(st, user?.role),
        count: cnt,
        pct: totalRecordsCount > 0 ? Math.round((cnt / totalRecordsCount) * 100) : 0,
      })),
      shiftRows: shiftBreakdown.map((sh) => ({
        label: sh.label,
        count: sh.count,
        pct: sh.pct,
      })),
    };
  };

  const handleExport = async (kind: 'Excel' | 'CSV') => {
    const payload = buildExportInput();
    if (!payload || !data) return;
    setExporting(true);
    setExportError(null);
    try {
      if (data.csv.available) {
        await apiFetch('/v2/operations/role-reports/export', {
          method: 'POST',
          body: JSON.stringify({ date, source }),
        }).catch(() => null);
      }
      const fileName =
        kind === 'Excel'
          ? downloadFormattedExcelReport(payload)
          : downloadExecutiveCsvReport(payload);
      setExportResult({ fileName, rowCount: totalRecordsCount, kind });
    } catch {
      setExportError('Không thể tạo tệp báo cáo lúc này. Vui lòng thử lại.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div
      className={
        embedded
          ? 'report-print-root min-w-0 space-y-5'
          : 'report-print-root section-shell min-w-0 space-y-5 py-6'
      }
    >
      {/* Formal Print Header (visible on print / PDF export) */}
      {data && (
        <PrintableReportHeader
          department={`Smart English LMS · ${resolvedRoleLabel}`}
          documentCode="BC-NGAY"
          title={`Báo cáo tổng hợp hoạt động ngày ${formatVnDateLabel(data.window.date)}`}
          subtitle={
            source === 'ALL'
              ? 'Toàn bộ phân hệ nghiệp vụ trong phạm vi quyền hạn'
              : `Phân hệ: ${labels[source] ?? source}`
          }
          metaRows={[
            { label: 'Ngày báo cáo', value: `${formatVnDateLabel(data.window.date)} (GMT+7)` },
            { label: 'Vai trò', value: resolvedRoleLabel || user?.role || 'Nhân sự' },
            { label: 'Người lập', value: user?.fullName ?? 'Nhân sự hệ thống' },
            { label: 'Xuất bản lúc', value: `${formatPrintTimestampVn()} (GMT+7)` },
          ]}
        />
      )}

      <header className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5 print:hidden">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[#2f5d1e]">
            {user?.role === 'STUDENT'
              ? 'Học viên · Tiến độ & Hoạt động học tập'
              : `${resolvedRoleLabel} · Phân tích & Điều hành`}
          </p>
          <h1 className="mt-1 text-2xl font-bold text-[#e66f2b] sm:text-[26px]">
            Báo cáo hoạt động trong ngày
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">
            {roleReportDescriptions[user?.role as BusinessRole]} Kết hợp biểu đồ xu hướng 7 ngày,
            phân tích khung giờ cao điểm và xuất báo cáo chuẩn Excel / PDF.
          </p>
        </div>
        {data && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="btn-primary inline-flex items-center gap-1.5 px-3.5 py-2 text-xs"
              disabled={exporting}
              onClick={() => void handleExport('Excel')}
            >
              <FileSpreadsheet size={14} aria-hidden="true" />
              {exporting ? 'Đang xuất…' : 'Xuất Excel (.xls)'}
            </button>
            <button
              type="button"
              className="btn-secondary inline-flex items-center gap-1.5 px-3 py-2 text-xs"
              disabled={exporting}
              onClick={() => void handleExport('CSV')}
            >
              <Download size={14} aria-hidden="true" />
              Xuất CSV
            </button>
            <button
              type="button"
              className="btn-secondary inline-flex items-center gap-1.5 px-3 py-2 text-xs"
              onClick={() => window.print()}
            >
              <Printer size={14} aria-hidden="true" />
              In / Xuất PDF
            </button>
            <button
              className="btn-secondary inline-flex items-center gap-1.5 px-3 py-2 text-xs"
              type="button"
              onClick={reload}
            >
              <RefreshCw size={14} aria-hidden="true" />
              Làm mới
            </button>
          </div>
        )}
      </header>

      <form
        className="flex flex-wrap items-end justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 print:hidden"
        onSubmit={(event) => {
          event.preventDefault();
          const nextDate = new FormData(event.currentTarget).get('date');
          if (typeof nextDate === 'string') updateFilterParams({ date: nextDate, source });
        }}
      >
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <span className="block text-xs font-semibold text-slate-700">Chọn nhanh</span>
            <div className="inline-flex overflow-hidden rounded-lg border border-slate-300 text-xs font-semibold">
              <button
                type="button"
                onClick={() => updateFilterParams({ date: todayStr, source })}
                className={`px-3 py-1.5 ${
                  date === todayStr
                    ? 'bg-[#76a35e] text-white'
                    : 'bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                Hôm nay
              </button>
              <button
                type="button"
                onClick={() => updateFilterParams({ date: yesterdayStr, source })}
                className={`border-l border-slate-300 px-3 py-1.5 ${
                  date === yesterdayStr
                    ? 'bg-[#76a35e] text-white'
                    : 'bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                Hôm qua
              </button>
            </div>
          </div>

          <label className="space-y-1 text-xs font-semibold text-slate-700">
            <span>Ngày xem</span>
            <input
              type="date"
              required
              name="date"
              key={date}
              className="input-field py-1.5 text-sm"
              defaultValue={date}
            />
          </label>
          <button className="btn-primary px-3.5 py-2 text-xs" type="submit">
            Xem ngày này
          </button>

          {data && (
            <label className="min-w-[270px] space-y-1 text-xs font-semibold text-slate-700">
              <span>Phân hệ nghiệp vụ</span>
              <select
                aria-label="Nguồn hiển thị"
                className="input-field py-1.5 text-sm font-normal"
                value={source}
                onChange={(e) => updateFilterParams({ date, source: e.target.value })}
              >
                <option value="ALL">Tất cả phân hệ ({data.sourceOptions.length})</option>
                {data.sourceOptions.map((code) => (
                  <option key={code} value={code}>
                    {labels[code] ?? code}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        <label className="min-w-[270px] space-y-1 text-xs font-semibold text-slate-700">
          <span>Tìm nhanh trong báo cáo</span>
          <span className="relative flex items-center">
            <Search size={14} className="pointer-events-none absolute left-2.5 text-slate-400" />
            <input
              type="search"
              value={detailSearch}
              onChange={(e) => setDetailSearch(e.target.value)}
              placeholder={
                user?.role === 'COUNSELOR'
                  ? 'Tìm phiếu, lịch tư vấn, trạng thái…'
                  : 'Tìm hạng mục, mã lớp, trạng thái…'
              }
              className="input-field w-full py-1.5 pl-8 text-xs font-normal"
            />
          </span>
        </label>
      </form>

      {phase === 'LOADING' && (
        <p role="status" className="text-sm text-slate-500">
          Đang tổng hợp và phân tích dữ liệu báo cáo…
        </p>
      )}
      {(phase === 'DENIED' || (response && !data)) && (
        <p role="alert" className="state-error text-sm">
          Bạn không có quyền xem báo cáo này hoặc phiên đăng nhập không phù hợp.
        </p>
      )}
      {phase === 'ERROR' && (
        <p role="alert" className="state-error text-sm">
          Không tải được dữ liệu ngày này. Vui lòng kiểm tra lại ngày chọn và thử lại.
        </p>
      )}

      {exportError && (
        <p role="alert" className="state-error text-sm print:hidden">
          {exportError}
        </p>
      )}
      {exportResult && (
        <div
          role="status"
          className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-950 print:hidden"
        >
          Đã xuất tệp {exportResult.kind} chuẩn báo cáo <strong>{exportResult.fileName}</strong> (
          {exportResult.rowCount} bản ghi chi tiết kèm phần nhận định &amp; tổng hợp).
        </div>
      )}

      {data && (
        <>
          {/* Executive Narrative Story Block */}
          <section
            aria-label={
              user?.role === 'STUDENT' ? 'Nhận định hoạt động học tập' : 'Nhận định điều hành'
            }
            className="rounded-xl border border-[#76a35e]/50 bg-[#f7faf5] p-4 space-y-2"
          >
            <div className="flex items-center gap-2 text-sm font-bold text-[#2f5d1e]">
              <Lightbulb size={16} className="shrink-0 text-[#e66f2b]" aria-hidden="true" />
              <span>{narrative.headline}</span>
            </div>
            <ul className="space-y-1 pl-6 text-xs leading-5 text-slate-700 list-disc">
              {narrative.bullets.map((bullet, idx) => (
                <li key={idx}>{bullet}</li>
              ))}
            </ul>
          </section>

          {/* 4 Executive KPI Cards */}
          <div
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 print:grid-cols-4 print:gap-2"
            aria-label="Chỉ số tổng hợp KPI trong ngày"
          >
            <div className="report-print-keep rounded-xl border border-slate-200 bg-white p-4 print:rounded-lg print:p-2.5">
              <div className="text-xs font-medium text-slate-500 print:text-[10px]">Kỳ báo cáo (GMT+7)</div>
              <div className="mt-1 text-xl font-bold text-slate-900 print:text-base">
                {formatVnDateLabel(data.window.date)}
              </div>
              <div className="mt-0.5 text-xs text-slate-500 print:text-[10px]">
                Cập nhật lúc {displayTime(data.asOf)}
              </div>
            </div>
            <div className="report-print-keep rounded-xl border border-[#76a35e]/40 bg-white p-4 print:rounded-lg print:p-2.5">
              <div className="text-xs font-medium text-[#2f5d1e] print:text-[10px]">Tổng hoạt động ghi nhận</div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-[#2f5d1e] print:text-base">{totalRecordsCount}</span>
                {deltaVsPrevDay && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold print:text-[9px] ${
                      deltaVsPrevDay.diff > 0
                        ? 'bg-emerald-50 text-emerald-700'
                        : deltaVsPrevDay.diff < 0
                          ? 'bg-amber-50 text-amber-800'
                          : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {deltaVsPrevDay.diff >= 0 ? `+${deltaVsPrevDay.diff}` : deltaVsPrevDay.diff} so với{' '}
                    {deltaVsPrevDay.prevDateLabel.slice(0, 5)}
                  </span>
                )}
              </div>
              <div className="mt-0.5 text-xs text-slate-500 print:text-[10px]">
                {deltaVsPrevDay
                  ? `Trung bình 7 ngày: ${deltaVsPrevDay.avg7d} bản ghi/ngày`
                  : `Trên ${sourcesWithRecords.length}/${data.sources.length} phân hệ`}
              </div>
            </div>
            <div className="report-print-keep rounded-xl border border-slate-200 bg-white p-4 print:rounded-lg print:p-2.5">
              <div className="text-xs font-medium text-slate-500 print:text-[10px]">Tỷ lệ hoàn tất / xác nhận</div>
              <div className="mt-1 text-2xl font-bold text-slate-900 print:text-base">{completedRate}%</div>
              <div className="mt-0.5 text-xs text-slate-500 print:text-[10px]">
                {completedCount}/{totalRecordsCount} bản ghi hoàn tất · {pendingCount} đang mở/chờ
              </div>
            </div>
            <div className="report-print-keep rounded-xl border border-slate-200 bg-white p-4 print:rounded-lg print:p-2.5">
              <div className="text-xs font-medium text-slate-500 print:text-[10px]">Phân hệ nhiều phát sinh nhất</div>
              <div className="mt-1 truncate text-base font-bold text-[#e66f2b] print:text-xs">
                {topSource ? topSource.label : 'Chưa có phát sinh'}
              </div>
              <div className="mt-0.5 text-xs text-slate-500 print:text-[10px]">
                {topSource
                  ? `${topSource.count} bản ghi (${topSource.pct}% tổng ngày)`
                  : 'Chọn ngày khác để xem thêm'}
              </div>
            </div>
          </div>

          {/* Visual ECharts Section */}
          {(trendOption || donutOption || shiftOption) && (
            <section className="space-y-4" aria-label="Biểu đồ phân tích hoạt động">
              {trendOption && (
                <div className="report-print-keep rounded-xl border border-slate-200 bg-white p-4 print:rounded-lg print:p-3">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h2 className="text-sm font-bold text-slate-900 print:text-xs">
                        Xu hướng khối lượng hoạt động 7 ngày gần nhất
                      </h2>
                      <p className="text-xs text-slate-500 print:text-[10px]">
                        Cột màu cam đánh dấu ngày đang xem ({formatVnDateLabel(data.window.date)}). <span className="print:hidden">Bấm vào cột để chuyển nhanh sang ngày tương ứng.</span>
                      </p>
                    </div>
                  </div>
                  <ReportEChart
                    ariaLabel="Biểu đồ xu hướng hoạt động 7 ngày gần nhất"
                    className="h-64 w-full print:h-48"
                    option={trendOption}
                    onDataClick={(point) => {
                      const d = (point as { date?: string } | null)?.date;
                      if (d) updateFilterParams({ date: d, source });
                    }}
                  />
                </div>
              )}

              {(donutOption || shiftOption) && (
                <div className="grid gap-4 lg:grid-cols-2 print:grid-cols-2 print:gap-3">
                  {donutOption && (
                    <div className="report-print-keep rounded-xl border border-slate-200 bg-white p-4 print:rounded-lg print:p-3">
                      <h2 className="text-sm font-bold text-slate-900 print:text-xs">
                        Cơ cấu tỷ trọng theo Phân hệ nghiệp vụ
                      </h2>
                      <p className="mb-2 text-xs text-slate-500 print:hidden">
                        Bấm vào từng mảng phân hệ để lọc riêng phân hệ đó.
                      </p>
                      <ReportEChart
                        ariaLabel="Biểu đồ cơ cấu tỷ trọng theo phân hệ"
                        className="h-64 w-full print:h-48"
                        option={donutOption}
                        onDataClick={(point) => {
                          const code = (point as { sourceCode?: string } | null)?.sourceCode;
                          if (code) updateFilterParams({ date, source: code });
                        }}
                      />
                    </div>
                  )}

                  {shiftOption && (
                    <div className="report-print-keep rounded-xl border border-slate-200 bg-white p-4 print:rounded-lg print:p-3">
                      <h2 className="text-sm font-bold text-slate-900 print:text-xs">
                        Phân bổ hoạt động theo Khung giờ trong ngày (GMT+7)
                      </h2>
                      <p className="mb-2 text-xs text-slate-500 print:text-[10px]">
                        {user?.role === 'STUDENT'
                          ? 'Nhận diện khung giờ học tập tập trung nhiều hoạt động / buổi học nhất.'
                          : 'Nhận diện khung giờ vận hành tập trung nhiều thao tác / buổi học nhất.'}
                      </p>
                      <ReportEChart
                        ariaLabel="Biểu đồ phân bổ theo khung giờ"
                        className="h-64 w-full print:h-48"
                        option={shiftOption}
                      />
                    </div>
                  )}
                </div>
              )}
            </section>
          )}

          {/* Executive Summary Tables */}
          <section
            className="grid gap-4 lg:grid-cols-2 print:grid-cols-2 print:gap-3"
            aria-label={
              user?.role === 'STUDENT'
                ? 'Bảng tổng hợp hoạt động học tập'
                : 'Bảng tổng hợp điều hành'
            }
          >
            <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <h2 className="text-sm font-bold text-slate-900">
                  I. Tổng hợp theo Phân hệ nghiệp vụ
                </h2>
                {source !== 'ALL' && (
                  <button
                    type="button"
                    onClick={() => updateFilterParams({ date, source: 'ALL' })}
                    className="text-xs font-semibold text-[#2f5d1e] hover:underline print:hidden"
                  >
                    Xem tất cả
                  </button>
                )}
              </div>
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-100 text-slate-500">
                  <tr>
                    <th className="py-2 font-semibold">Phân hệ</th>
                    <th className="py-2 font-semibold text-right">Số lượng</th>
                    <th className="py-2 font-semibold text-right w-28">Tỷ trọng</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.sources.map((s) => {
                    const count = s.records?.length ?? 0;
                    const pct =
                      totalRecordsCount > 0 ? Math.round((count / totalRecordsCount) * 100) : 0;
                    return (
                      <tr key={s.code}>
                        <td className="py-2">
                          <button
                            type="button"
                            onClick={() => updateFilterParams({ date, source: s.code })}
                            className="font-semibold text-slate-800 hover:text-[#e66f2b] hover:underline text-left"
                          >
                            {labels[s.code] ?? s.code}
                          </button>
                        </td>
                        <td className="py-2 text-right font-bold text-slate-900">{count}</td>
                        <td className="py-2 text-right">
                          <div className="inline-flex items-center gap-2">
                            <div className="h-1.5 w-14 overflow-hidden rounded-full bg-slate-100">
                              <div className="h-full bg-[#76a35e]" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="w-8 text-slate-600">{pct}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <h2 className="text-sm font-bold text-slate-900">
                  II. Phân bổ theo Trạng thái xử lý
                </h2>
                <span className="text-xs text-slate-500">{stateBreakdown.length} nhóm trạng thái</span>
              </div>
              {stateBreakdown.length === 0 ? (
                <p className="py-6 text-center text-xs text-slate-500">
                  Ngày này chưa có bản ghi phát sinh để thống kê trạng thái.
                </p>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-100 text-slate-500">
                    <tr>
                      <th className="py-2 font-semibold">Trạng thái</th>
                      <th className="py-2 font-semibold text-right">Số bản ghi</th>
                      <th className="py-2 font-semibold text-right w-28">Tỷ lệ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {stateBreakdown.map(([st, cnt]) => {
                      const pct =
                        totalRecordsCount > 0 ? Math.round((cnt / totalRecordsCount) * 100) : 0;
                      return (
                        <tr key={st}>
                          <td className="py-2 font-medium text-slate-800">
                            {formatReportState(st, user?.role)}
                          </td>
                          <td className="py-2 text-right font-bold text-slate-900">{cnt}</td>
                          <td className="py-2 text-right text-slate-600">{pct}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </section>

          {/* View Mode Bar for Detail Sections */}
          {sourcesWithRecords.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
              <h2 className="text-base font-bold text-slate-900">
                III. Chi tiết hoạt động theo từng phân hệ
              </h2>
              <div className="inline-flex overflow-hidden rounded-lg border border-slate-300 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setGroupMode('summary')}
                  className={`px-3 py-1.5 ${
                    groupMode === 'summary'
                      ? 'bg-[#76a35e] text-white'
                      : 'bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  Tóm tắt gộp nhóm
                </button>
                <button
                  type="button"
                  onClick={() => setGroupMode('detail')}
                  className={`border-l border-slate-300 px-3 py-1.5 ${
                    groupMode === 'detail'
                      ? 'bg-[#76a35e] text-white'
                      : 'bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  Chi tiết từng bản ghi
                </button>
              </div>
            </div>
          )}

          {sourcesWithRecords.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-600">
              Ngày {formatVnDateLabel(data.window.date)} chưa có hoạt động nào phát sinh trong phạm
              vi hiển thị.
            </div>
          ) : (
            sourcesWithRecords.map((s) => {
              const q = detailSearch.trim().toLowerCase();
              const filteredRecords = (s.records ?? []).filter((r) => {
                if (!q) return true;
                const formatted = formatReportLabel(r.label).toLowerCase();
                const st = formatReportState(r.state, user?.role).toLowerCase();
                return formatted.includes(q) || st.includes(q);
              });
              if (q && filteredRecords.length === 0) return null;

              const groupedBuckets = [
                ...filteredRecords
                  .reduce<
                    Map<string, { label: string; state: string; count: number; latestAt: string }>
                  >((map, r) => {
                    const lbl = formatReportLabel(r.label);
                    const key = `${lbl}__${r.state}`;
                    const cur = map.get(key);
                    if (!cur) {
                      map.set(key, { label: lbl, state: r.state, count: 1, latestAt: r.at });
                    } else {
                      cur.count += 1;
                      if (r.at > cur.latestAt) cur.latestAt = r.at;
                    }
                    return map;
                  }, new Map())
                  .values(),
              ].sort((a, b) => b.count - a.count);

              return (
                <section
                  className="min-w-0 space-y-3 rounded-xl border border-slate-200 bg-white p-5 print:rounded-lg print:p-3"
                  key={s.code}
                  aria-label={labels[s.code]}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-base font-bold text-slate-900">
                      {labels[s.code] ?? s.code} ({filteredRecords.length} bản ghi)
                    </h3>
                    <span className="rounded-full bg-[#f4f9f1] px-2.5 py-0.5 text-xs font-semibold text-[#2d581b]">
                      {sourceAvailabilityLabel(s.state)}
                    </span>
                  </div>

                  {groupMode === 'summary' ? (
                    <div className="overflow-x-auto rounded-lg border border-slate-200">
                      <table className="w-full divide-y divide-slate-200 text-left text-sm">
                        <thead className="bg-slate-50 text-xs font-semibold text-slate-600">
                          <tr>
                            <th className="px-3.5 py-2.5">Hạng mục hoạt động</th>
                            <th className="px-3.5 py-2.5 text-right">Số lần ghi nhận</th>
                            <th className="px-3.5 py-2.5">Gần nhất lúc</th>
                            <th className="px-3.5 py-2.5">Trạng thái</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white">
                          {groupedBuckets.map((g) => (
                            <tr key={`${g.label}-${g.state}`} className="hover:bg-slate-50/60">
                              <td className="px-3.5 py-2.5 font-medium text-slate-900">{g.label}</td>
                              <td className="px-3.5 py-2.5 text-right font-bold text-[#2f5d1e]">
                                {g.count}
                              </td>
                              <td className="whitespace-nowrap px-3.5 py-2.5 text-xs text-slate-600">
                                {displayTime(g.latestAt)}
                              </td>
                              <td className="px-3.5 py-2.5">
                                <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                                  {formatReportState(g.state, user?.role)}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <>
                      <div className="overflow-x-auto rounded-lg border border-slate-200">
                        <table className="w-full divide-y divide-slate-200 text-left text-sm">
                          <caption className="sr-only">Hoạt động {labels[s.code]}</caption>
                          <thead className="bg-slate-50 text-xs font-semibold text-slate-600">
                            <tr>
                              <th className="px-3.5 py-2.5">Thời gian</th>
                              <th className="px-3.5 py-2.5">Nội dung hoạt động</th>
                              <th className="px-3.5 py-2.5">Trạng thái</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 bg-white">
                            {filteredRecords.map((r, rowIdx) => {
                              const hiddenOnScreen = !expandedSources[s.code] && rowIdx >= 10;
                              return (
                                <tr
                                  className={`transition-colors hover:bg-slate-50/60 ${
                                    hiddenOnScreen ? 'hidden print:table-row' : ''
                                  }`}
                                  key={r.id}
                                >
                                  <td className="whitespace-nowrap px-3.5 py-2.5 text-xs text-slate-600">
                                    {displayTime(r.at)}
                                  </td>
                                  <td className="px-3.5 py-2.5 font-medium text-slate-900">
                                    {formatReportLabel(r.label)}
                                  </td>
                                  <td className="px-3.5 py-2.5">
                                    <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                                      {formatReportState(r.state, user?.role)}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      {filteredRecords.length > 10 && (
                        <div className="flex justify-end print:hidden">
                          <button
                            type="button"
                            className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                            onClick={() =>
                              setExpandedSources((prev) => ({
                                ...prev,
                                [s.code]: !prev[s.code],
                              }))
                            }
                          >
                            {expandedSources[s.code]
                              ? 'Thu gọn còn 10 dòng gần nhất'
                              : `Xem tất cả (${filteredRecords.length} bản ghi)`}
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </section>
              );
            })
          )}

          {otherSources.length > 0 && (
            <details className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 text-xs text-slate-600 print:hidden">
              <summary className="cursor-pointer font-semibold text-slate-700">
                Các nhóm dữ liệu chưa có phát sinh trong ngày ({otherSources.length})
              </summary>
              <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
                {otherSources.map((s) => (
                  <div
                    key={s.code}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2"
                  >
                    <p className="font-semibold text-slate-800">{labels[s.code] ?? s.code}</p>
                    <p className="mt-0.5 text-slate-500">
                      {s.reason
                        ? (reasons[s.reason] ?? 'Chưa có quyền hoặc chưa phát sinh dữ liệu.')
                        : 'Chưa có hoạt động nào trong ngày này.'}
                    </p>
                  </div>
                ))}
              </div>
            </details>
          )}

          {/* Print Signature Block */}
          <PrintableReportFooter
            leftName={user?.fullName ?? ''}
            leftTitle={user?.role === 'STUDENT' ? 'Học viên' : 'Người lập báo cáo'}
            rightTitle={
              user?.role === 'STUDENT' ? 'Xác nhận của Trung tâm' : 'Xác nhận của Ban quản lý'
            }
          />
        </>
      )}
    </div>
  );
}
