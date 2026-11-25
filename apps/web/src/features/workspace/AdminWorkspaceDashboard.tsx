import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Database,
  FileSpreadsheet,
  Lock,
  RefreshCw,
  Server,
  ShieldCheck,
  SlidersHorizontal,
  Users,
  Wrench,
} from 'lucide-react';
import { useAuth } from '@/features/auth/auth-context';
import { apiFetch, ApiError } from '@/lib/api-client';
import {
  ACCOUNT_STATUS_META,
  ADMIN_ROLE_SHORT,
  AUDIT_DECISION_META,
  classifyConfigConnection,
  formatActionLabel,
  formatEscalationCategory,
  formatVnDateTime,
  redactSensitiveText,
  sanitizeAccountDisplayName,
  SERVICE_STATUS_META,
  type AdminAccountDirectoryResponse,
  type ServiceHealthLevel,
} from './admin-presentation';
import { workspaceApi, type AuthorityOverview } from './api';

type HealthCheckResponse = {
  status: string;
  service: string;
  timestamp: string;
};

type SystemAuditResponse = {
  viewerId: string;
  role: string;
  health: {
    status: string;
    database: string;
    activeSessions: number;
    totalUsers: number;
    checkedAt: string;
  };
  events: Array<{
    id: string;
    actorId: string;
    action: string;
    objectType: string;
    objectId: string;
    decision: string;
    reason: string;
    createdAt: string;
  }>;
};

type SystemConfigResponse = {
  checkedAt: string;
  settings: Array<{
    code: string;
    category: string;
    sensitivity: string;
    configured: boolean;
    maskedValue: string;
    connectionState: string;
    operatorNote: string;
  }>;
  proposals: Array<{ id: string }>;
};

type ReadinessResponse = {
  mode: string;
  health: string;
  sources: Array<{ domain: string; state: string; reason: string }>;
};

type EscalationSummaryItem = {
  id: string;
  ticketRef: string;
  incidentCategory: string;
  summary: string;
  status: string;
  createdAt: string;
};

export function AdminWorkspaceDashboard() {
  const { user } = useAuth();
  const [directory, setDirectory] = useState<AdminAccountDirectoryResponse | null>(null);
  const [authority, setAuthority] = useState<AuthorityOverview | null>(null);
  const [apiHealth, setApiHealth] = useState<{
    level: ServiceHealthLevel;
    detail: string;
    checkedAt?: string;
  }>({ level: 'UNDETERMINED', detail: 'Đang kiểm tra kết nối máy chủ API' });
  const [auditData, setAuditData] = useState<SystemAuditResponse | null>(null);
  const [auditError, setAuditError] = useState<string>('');
  const [configData, setConfigData] = useState<SystemConfigResponse | null>(null);
  const [readinessData, setReadinessData] = useState<ReadinessResponse | null>(null);
  const [escalations, setEscalations] = useState<EscalationSummaryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    setAuditError('');

    const [dirRes, authRes, healthRes, auditRes, cfgRes, readyRes, escRes] =
      await Promise.allSettled([
        apiFetch<AdminAccountDirectoryResponse>('/admin/accounts?limit=100&excludeTest=true'),
        workspaceApi.authority(),
        apiFetch<HealthCheckResponse>('/health'),
        apiFetch<SystemAuditResponse>('/v2/operations/system-audit?limit=12'),
        apiFetch<SystemConfigResponse>('/v2/operations/system-config'),
        apiFetch<ReadinessResponse>('/v2/operations/readiness'),
        apiFetch<{ escalations?: EscalationSummaryItem[] }>(
          '/v2/operations/technical-escalations',
        ),
      ]);

    if (dirRes.status === 'fulfilled') setDirectory(dirRes.value);
    else setLoadError('Không thể tải danh bạ tài khoản từ máy chủ.');

    if (authRes.status === 'fulfilled') setAuthority(authRes.value);

    if (healthRes.status === 'fulfilled' && healthRes.value?.status === 'ok') {
      setApiHealth({
        level: 'OPERATIONAL',
        detail: 'Máy chủ API phản hồi ổn định',
        checkedAt: healthRes.value.timestamp,
      });
    } else if (healthRes.status === 'rejected') {
      const msg =
        healthRes.reason instanceof ApiError
          ? `HTTP ${healthRes.reason.status}: ${healthRes.reason.message}`
          : 'Không kết nối được máy chủ API';
      setApiHealth({ level: 'UNREACHABLE', detail: msg });
    } else {
      setApiHealth({ level: 'UNDETERMINED', detail: 'Trạng thái phản hồi chưa rõ' });
    }

    if (auditRes.status === 'fulfilled') {
      setAuditData(auditRes.value);
    } else {
      setAuditError(
        auditRes.reason instanceof Error
          ? auditRes.reason.message
          : 'Không truy cập được nhật ký hệ thống.',
      );
    }

    if (cfgRes.status === 'fulfilled') setConfigData(cfgRes.value);
    if (readyRes.status === 'fulfilled') setReadinessData(readyRes.value);
    if (escRes.status === 'fulfilled' && Array.isArray(escRes.value?.escalations)) {
      setEscalations(escRes.value.escalations);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const accounts = directory?.data ?? [];
  const accountById = useMemo(
    () => new Map(accounts.map((acc) => [acc.id, acc])),
    [accounts],
  );

  const pendingRoles = useMemo(
    () => (authority?.roles ?? []).filter((r) => !r.approvedBy),
    [authority],
  );
  const pendingGrants = useMemo(
    () => (authority?.grants ?? []).filter((g) => !g.approvedBy && !g.revokedAt),
    [authority],
  );

  const openEscalations = useMemo(
    () => escalations.filter((e) => e.status === 'OPEN' || e.status === 'IN_REVIEW'),
    [escalations],
  );

  const roleCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const acc of accounts) {
      counts.set(acc.role, (counts.get(acc.role) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [accounts]);

  const dbServiceLevel: ServiceHealthLevel = auditData
    ? auditData.health.database === 'CONNECTED' && auditData.health.status === 'HEALTHY'
      ? 'OPERATIONAL'
      : 'UNREACHABLE'
    : auditError
      ? 'UNREACHABLE'
      : 'UNDETERMINED';

  const configCounts = useMemo(() => {
    const stats = { OPERATIONAL: 0, UNREACHABLE: 0, UNDETERMINED: 0 };
    for (const item of configData?.settings ?? []) {
      stats[classifyConfigConnection(item.connectionState)] += 1;
    }
    return stats;
  }, [configData]);

  const operationalReadyCount = useMemo(
    () =>
      (readinessData?.sources ?? []).filter(
        (s) => s.state === 'AVAILABLE' || s.state === 'VERIFIED' || s.state === 'HEALTHY',
      ).length,
    [readinessData],
  );

  const readinessSummaryLevel: ServiceHealthLevel = !readinessData
    ? 'UNDETERMINED'
    : operationalReadyCount === readinessData.sources.length && readinessData.sources.length > 0
      ? 'OPERATIONAL'
      : 'UNDETERMINED';

  return (
    <div className="mx-auto min-w-0 max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      {/* Header banner */}
      <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
              <span className="rounded-full border border-[#dce8d4] bg-[#f4f8f1] px-2.5 py-0.5 text-[#51743e]">
                Cổng Quản trị Hệ thống Smart English
              </span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-slate-700">
                {user?.fullName ?? 'Quản trị hệ thống'}
              </span>
              {Boolean(directory?.summary?.excludedFixtures) && (
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 font-normal text-slate-600">
                  Đã ẩn {directory?.summary?.excludedFixtures} tài khoản kiểm thử tự động
                </span>
              )}
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              Tổng quan quản trị hệ thống
            </h1>
            <p className="max-w-3xl text-sm text-slate-600">
              Không gian điều hành tập trung cho Quản trị hệ thống: quản lý danh bạ tài khoản &amp;
              phân quyền phê duyệt độc lập, xử lý sự cố kỹ thuật từ CSKH và giám sát nhật ký cùng
              tình trạng vận hành các dịch vụ.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => void loadDashboard()}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} aria-hidden="true" />
              Làm mới trạng thái
            </button>
            <Link
              to="/workspace/authority"
              className="inline-flex items-center gap-2 rounded-lg bg-[#5f8b48] px-4 py-2 text-sm font-semibold text-white hover:bg-[#51773d]"
            >
              <Users size={15} aria-hidden="true" />
              Quản lý tài khoản
            </Link>
            <Link
              to="/workspace/operations"
              className="inline-flex items-center gap-2 rounded-lg border border-[#76a35e] bg-[#f4f8f1] px-4 py-2 text-sm font-semibold text-[#3f5e2f] hover:bg-[#eaf2e4]"
            >
              <Activity size={15} aria-hidden="true" />
              Nhật ký &amp; Vận hành
            </Link>
            <Link
              to="/workspace/reports"
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <FileSpreadsheet size={15} aria-hidden="true" />
              Báo cáo hệ thống
            </Link>
          </div>
        </div>
        {loadError && (
          <div
            role="alert"
            className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-800"
          >
            {loadError}
          </div>
        )}
      </section>

      {/* Open Technical Escalations Alert Banner */}
      {openEscalations.length > 0 && (
        <section
          aria-label="Cảnh báo sự cố kỹ thuật cần xử lý"
          className="flex flex-col gap-3 rounded-xl border border-amber-300 bg-amber-50/80 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-700" aria-hidden="true" />
            <div className="space-y-0.5 text-xs text-amber-950">
              <p className="text-sm font-bold">
                Có {openEscalations.length} sự cố kỹ thuật từ CSKH đang chờ Quản trị hệ thống kiểm tra
              </p>
              <p>
                Hồ sơ mới nhất: <span className="font-mono font-semibold">{openEscalations[0].ticketRef}</span> ·{' '}
                {formatEscalationCategory(openEscalations[0].incidentCategory)} — {openEscalations[0].summary}
              </p>
            </div>
          </div>
          <Link
            to="/workspace/operations#technical-escalations"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-amber-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-amber-800"
          >
            <Wrench size={14} aria-hidden="true" />
            Xử lý sự cố ngay
          </Link>
        </section>
      )}

      {/* KPI cards */}
      <section aria-label="Chỉ số hệ thống thực tế" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-500">
            <span>Tài khoản hệ thống</span>
            <Users size={16} className="text-[#5f8b48]" aria-hidden="true" />
          </div>
          <p className="mt-2 text-3xl font-bold text-slate-900">
            {directory?.summary?.total ?? (loading ? '...' : accounts.length)}
          </p>
          <p className="mt-1 text-xs text-slate-600">
            Hoạt động: <strong className="text-emerald-700">{directory?.summary?.active ?? '—'}</strong> ·{' '}
            Khóa: <strong className="text-rose-700">{directory?.summary?.locked ?? '—'}</strong> ·{' '}
            Ngưng: <strong>{directory?.summary?.inactive ?? '—'}</strong>
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-500">
            <span>Hồ sơ phân quyền chờ duyệt</span>
            <ShieldCheck size={16} className="text-amber-600" aria-hidden="true" />
          </div>
          <p className="mt-2 text-3xl font-bold text-slate-900">
            {authority ? pendingRoles.length + pendingGrants.length : loading ? '...' : '—'}
          </p>
          <p className="mt-1 text-xs text-slate-600">
            Đổi vai trò: <strong>{authority ? pendingRoles.length : '—'}</strong> · Quyền bổ sung:{' '}
            <strong>{authority ? pendingGrants.length : '—'}</strong>
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-500">
            <span>API &amp; Cơ sở dữ liệu</span>
            <Database size={16} className="text-emerald-600" aria-hidden="true" />
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span
              className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${SERVICE_STATUS_META[dbServiceLevel].badgeClass}`}
            >
              {SERVICE_STATUS_META[dbServiceLevel].label}
            </span>
          </div>
          <p className="mt-2 text-xs text-slate-600">
            Phiên hoạt động:{' '}
            <strong>{auditData ? auditData.health.activeSessions : 'Chưa xác định'}</strong>
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-500">
            <span>Cấu hình &amp; Tích hợp</span>
            <SlidersHorizontal size={16} className="text-slate-600" aria-hidden="true" />
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900">
            {configData ? `${configCounts.OPERATIONAL}/${configData.settings.length}` : '—'}
            <span className="ml-1 text-xs font-medium text-slate-500">đã sẵn sàng</span>
          </p>
          <p className="mt-1 text-xs text-slate-600">
            {configData
              ? `${configCounts.UNDETERMINED} mục ở chế độ an toàn / chưa cấu hình`
              : 'Chưa đọc cấu hình vận hành'}
          </p>
        </div>
      </section>

      {/* Main 2-Column Overview Grid */}
      <div className="grid min-w-0 gap-6 lg:grid-cols-12">
        {/* Accounts & Roles Summary */}
        <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-5 shadow-xs lg:col-span-5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[#51743e]">
                Quản lý tài khoản &amp; Phân quyền
              </p>
              <h2 className="text-lg font-bold text-slate-900">Phân bố vai trò &amp; Bảo toàn dữ liệu</h2>
            </div>
            <Link
              to="/workspace/authority"
              className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-semibold text-[#51743e] hover:underline"
            >
              Mở chi tiết <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </div>

          <div className="mt-4 space-y-2.5">
            {roleCounts.length === 0 ? (
              <p className="text-sm text-slate-500">
                {loading ? 'Đang tải phân bố vai trò...' : 'Chưa có dữ liệu tài khoản.'}
              </p>
            ) : (
              roleCounts.map(([role, count]) => (
                <div
                  key={role}
                  className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50/70 px-3 py-2 text-sm"
                >
                  <span className="font-medium text-slate-700">
                    {ADMIN_ROLE_SHORT[role] ?? role}
                  </span>
                  <span className="rounded-full bg-white px-2.5 py-0.5 text-xs font-bold text-slate-900 ring-1 ring-slate-200">
                    {count} tài khoản
                  </span>
                </div>
              ))
            )}
          </div>

          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
            <p className="flex items-center gap-1.5 font-semibold text-slate-800">
              <Lock size={13} aria-hidden="true" /> Nguyên tắc bảo toàn lịch sử &amp; bảo mật phân quyền
            </p>
            <p className="mt-1">
              Mật khẩu và khóa bí mật không bao giờ hiển thị trên giao diện. Khóa tài khoản chỉ thu hồi
              phiên đăng nhập, giữ nguyên toàn bộ lịch sử học tập, bài nộp, học phí và phê duyệt.
            </p>
          </div>

          <div className="mt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Tài khoản vận hành tiêu biểu
            </h3>
            <ul className="mt-2 divide-y divide-slate-100 text-xs">
              {accounts.slice(0, 6).map((acc) => {
                const st = ACCOUNT_STATUS_META[acc.status] ?? {
                  label: acc.status,
                  badgeClass: 'border-slate-200 bg-slate-50 text-slate-700',
                };
                return (
                  <li key={acc.id} className="flex items-center justify-between py-2">
                    <div className="min-w-0 pr-2">
                      <p className="truncate font-semibold text-slate-900">
                        {sanitizeAccountDisplayName(acc.fullName)}
                      </p>
                      <p className="truncate font-mono text-[11px] text-slate-500">{acc.email}</p>
                    </div>
                    <span
                      className={`shrink-0 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold ${st.badgeClass}`}
                    >
                      {st.label}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        {/* System Health & Recent Audit */}
        <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-5 shadow-xs lg:col-span-7">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[#51743e]">
                Nhật ký &amp; Tình trạng hệ thống
              </p>
              <h2 className="text-lg font-bold text-slate-900">
                Giám sát dịch vụ &amp; Sự kiện kiểm toán gần nhất
              </h2>
            </div>
            <Link
              to="/workspace/operations"
              className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-semibold text-[#51743e] hover:underline"
            >
              Xem đầy đủ <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </div>

          {/* Live Services Strip */}
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-slate-200 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                  <Server size={14} aria-hidden="true" /> Máy chủ API
                </span>
                <span
                  className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${SERVICE_STATUS_META[apiHealth.level].badgeClass}`}
                >
                  {SERVICE_STATUS_META[apiHealth.level].label}
                </span>
              </div>
              <p className="mt-1.5 text-xs text-slate-600">{apiHealth.detail}</p>
            </div>

            <div className="rounded-lg border border-slate-200 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                  <Database size={14} aria-hidden="true" /> Cơ sở dữ liệu
                </span>
                <span
                  className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${SERVICE_STATUS_META[dbServiceLevel].badgeClass}`}
                >
                  {SERVICE_STATUS_META[dbServiceLevel].label}
                </span>
              </div>
              <p className="mt-1.5 text-xs text-slate-600">
                {auditData
                  ? `Kết nối ổn định · ${auditData.health.activeSessions} phiên hoạt động`
                  : auditError || 'Chưa kết nối được cơ sở dữ liệu'}
              </p>
            </div>

            <div className="rounded-lg border border-slate-200 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                  <Wrench size={14} aria-hidden="true" /> Kết nối phân hệ
                </span>
                <span
                  className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${SERVICE_STATUS_META[readinessSummaryLevel].badgeClass}`}
                >
                  {readinessData
                    ? `${operationalReadyCount}/${readinessData.sources.length} sẵn sàng`
                    : 'Đang kiểm tra'}
                </span>
              </div>
              <p className="mt-1.5 text-xs text-slate-600">
                {readinessData
                  ? `Theo dõi ${readinessData.sources.length} phân hệ nghiệp vụ (${openEscalations.length} sự cố mở)`
                  : 'Đang kiểm tra mức độ sẵn sàng...'}
              </p>
            </div>
          </div>

          {/* Latest Audit Events */}
          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Sự kiện kiểm toán thực tế mới nhất
              </h3>
              <span className="text-xs text-slate-500">
                {auditData ? `${auditData.events.length} bản ghi gần đây` : ''}
              </span>
            </div>

            {auditError ? (
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
                {auditError}
              </div>
            ) : !auditData?.events.length ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-center text-xs text-slate-500">
                {loading ? 'Đang tải nhật ký hệ thống...' : 'Chưa có bản ghi kiểm toán nào.'}
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-[11px] uppercase text-slate-500">
                    <tr>
                      <th className="px-3 py-2 font-semibold">Thời gian</th>
                      <th className="px-3 py-2 font-semibold">Người thực hiện</th>
                      <th className="px-3 py-2 font-semibold">Hành động</th>
                      <th className="px-3 py-2 font-semibold">Kết quả</th>
                      <th className="px-3 py-2 font-semibold">Chi tiết</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {auditData.events.slice(0, 8).map((ev) => {
                      const actorAcc = accountById.get(ev.actorId);
                      const decMeta = AUDIT_DECISION_META[ev.decision] ?? {
                        label: ev.decision,
                        badgeClass: 'border-slate-200 bg-slate-50 text-slate-700',
                      };
                      return (
                        <tr key={ev.id} className="hover:bg-slate-50/70">
                          <td className="whitespace-nowrap px-3 py-2 text-slate-600">
                            {formatVnDateTime(ev.createdAt)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2">
                            <span className="font-medium text-slate-800">
                              {actorAcc
                                ? sanitizeAccountDisplayName(actorAcc.fullName)
                                : 'Tài khoản hệ thống'}
                            </span>
                          </td>
                          <td className="px-3 py-2 font-medium text-slate-800">
                            {formatActionLabel(ev.action)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2">
                            <span
                              className={`inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold ${decMeta.badgeClass}`}
                            >
                              {decMeta.label}
                            </span>
                          </td>
                          <td className="max-w-xs truncate px-3 py-2 text-slate-600" title={redactSensitiveText(ev.reason)}>
                            {redactSensitiveText(ev.reason)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
