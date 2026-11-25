import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Database,
  ExternalLink,
  Filter,
  Lock,
  Paperclip,
  RefreshCw,
  Search,
  Server,
  ShieldCheck,
  SlidersHorizontal,
  Wrench,
} from 'lucide-react';
import {
  ADMIN_ROLE_SHORT,
  AUDIT_DECISION_META,
  classifyConfigConnection,
  classifyReadinessSource,
  formatActionLabel,
  formatConfigConnectionLabel,
  formatConfigSettingMeta,
  formatEscalationCategory,
  formatEscalationStatus,
  formatObjectTypeLabel,
  formatReadinessDomain,
  formatReadinessReason,
  formatTicketStateLabel,
  formatVnDateTime,
  redactSensitiveText,
  sanitizeAccountDisplayName,
  SERVICE_STATUS_META,
  type AdminAccountDirectoryResponse,
  type AdminAccountItem,
  type ServiceHealthLevel,
} from '@/features/workspace/admin-presentation';
import { apiFetch, ApiError } from '@/lib/api-client';

type HealthResponse = {
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
    sensitivity: 'ORDINARY' | 'SENSITIVE';
    configured: boolean;
    maskedValue: string;
    connectionState: string;
    operatorNote: string;
  }>;
  proposals: Array<{
    id: string;
    actorId: string;
    settingCode: string;
    decision: string;
    reason: string;
    createdAt: string;
  }>;
};

type ReadinessResponse = {
  mode: string;
  health: string;
  sources: Array<{
    domain: string;
    state: string;
    reason: string;
  }>;
};

type ServiceCard = {
  id: string;
  name: string;
  category: string;
  level: ServiceHealthLevel;
  summary: string;
  detail: string;
  checkedAt?: string;
};

const controlClass =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#5f8b48] focus:outline-none focus:ring-2 focus:ring-[#dce8d4]';

function getTodayIsoDate(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
}

type TechnicalEscalationItem = {
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
  createdByName: string;
  learnerName: string;
  learnerEmail: string;
  assignedAdminName: string | null;
  resolvedByName: string | null;
  respondedAt: string | null;
  createdAt: string;
  attachments: {
    id: string;
    ticketId: string;
    originalName: string;
    mimeType: string;
    byteSize: number;
  }[];
};

export function AdminOperationsCenterPage() {
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab: 'monitor' | 'escalations' | 'config' =
    searchParams.get('tab') === 'escalations' || location.hash === '#technical-escalations'
      ? 'escalations'
      : searchParams.get('tab') === 'config' || location.hash === '#config'
        ? 'config'
        : 'monitor';
  const setOpsTab = (next: 'monitor' | 'escalations' | 'config') => {
    setSearchParams(next === 'monitor' ? {} : { tab: next }, { replace: true });
  };

  // Real service status states
  const [services, setServices] = useState<ServiceCard[]>([]);
  const [configData, setConfigData] = useState<SystemConfigResponse | null>(null);
  const [readinessData, setReadinessData] = useState<ReadinessResponse | null>(null);
  const [auditData, setAuditData] = useState<SystemAuditResponse | null>(null);
  const [accounts, setAccounts] = useState<AdminAccountItem[]>([]);
  const [escalations, setEscalations] = useState<TechnicalEscalationItem[]>([]);
  const [escStatusFilter, setEscStatusFilter] = useState('ALL');
  const [escNotes, setEscNotes] = useState<Record<string, string>>({});
  const [escReplyLearner, setEscReplyLearner] = useState<Record<string, boolean>>({});
  const [escBusyId, setEscBusyId] = useState<string | null>(null);
  const [escNotice, setEscNotice] = useState('');
  const [escError, setEscError] = useState('');

  // Diagnostics & errors (sanitized, never secrets/stack)
  const [healthError, setHealthError] = useState('');
  const [auditError, setAuditError] = useState('');
  const [configError, setConfigError] = useState('');

  // Audit Log Filters
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [actorFilter, setActorFilter] = useState('ALL');
  const [actionFilter, setActionFilter] = useState('ALL');
  const [decisionFilter, setDecisionFilter] = useState('ALL');
  const [objectTypeFilter, setObjectTypeFilter] = useState('ALL');
  const [searchInput, setSearchInput] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');

  // Config proposal form
  const [proposalSettingCode, setProposalSettingCode] = useState('EMAIL_PROVIDER');
  const [proposalState, setProposalState] = useState('REQUEST_OPERATOR_UPDATE');
  const [proposalReason, setProposalReason] = useState('');
  const [proposalNotice, setProposalNotice] = useState('');
  const [proposalError, setProposalError] = useState('');
  const [submittingProposal, setSubmittingProposal] = useState(false);

  const [loading, setLoading] = useState(true);
  const [lastCheckedAt, setLastCheckedAt] = useState('');
  const [displayLimit, setDisplayLimit] = useState(25);
  const [auditPage, setAuditPage] = useState(1);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setHealthError('');
    setAuditError('');
    setConfigError('');

    const auditParams = new URLSearchParams({ limit: '100' });
    if (actionFilter !== 'ALL') auditParams.set('action', actionFilter);
    if (objectTypeFilter !== 'ALL') auditParams.set('objectType', objectTypeFilter);
    if (appliedSearch.trim()) auditParams.set('search', appliedSearch.trim());

    const apiStarted = performance.now();
    const [healthRes, auditRes, cfgRes, readyRes, accRes, escRes] = await Promise.allSettled([
      apiFetch<HealthResponse>('/health'),
      apiFetch<SystemAuditResponse>(`/v2/operations/system-audit?${auditParams.toString()}`),
      apiFetch<SystemConfigResponse>('/v2/operations/system-config'),
      apiFetch<ReadinessResponse>('/v2/operations/readiness'),
      apiFetch<AdminAccountDirectoryResponse>('/admin/accounts?limit=100&excludeTest=true'),
      apiFetch<{ escalations: TechnicalEscalationItem[] }>('/v2/operations/technical-escalations'),
    ]);
    const apiLatencyMs = Math.round(performance.now() - apiStarted);

    const cards: ServiceCard[] = [];

    // 1. API Core (/api/health)
    if (healthRes.status === 'fulfilled') {
      const h = healthRes.value;
      const isOk = h?.status === 'ok';
      cards.push({
        id: 'api-core',
        name: 'API Backend (NestJS)',
        category: 'Dịch vụ máy chủ chính',
        level: isOk ? 'OPERATIONAL' : 'UNDETERMINED',
        summary: isOk
          ? `Phản hồi ổn định (${apiLatencyMs} ms)`
          : 'Trạng thái phản hồi chưa rõ',
        detail: 'Cổng API nghiệp vụ đang tiếp nhận và xử lý yêu cầu bình thường.',
        checkedAt: h?.timestamp,
      });
    } else {
      const detail =
        healthRes.reason instanceof ApiError
          ? `HTTP ${healthRes.reason.status}: ${healthRes.reason.message}`
          : 'Không thể kết nối tới máy chủ API';
      setHealthError(detail);
      cards.push({
        id: 'api-core',
        name: 'API Backend (NestJS)',
        category: 'Dịch vụ máy chủ chính',
        level: 'UNREACHABLE',
        summary: 'Máy chủ API không phản hồi',
        detail,
      });
    }

    // 2. PostgreSQL & Session Store (/api/v2/operations/system-audit)
    if (auditRes.status === 'fulfilled') {
      const a = auditRes.value;
      setAuditData(a);
      const isConnected = a.health.database === 'CONNECTED' && a.health.status === 'HEALTHY';
      cards.push({
        id: 'postgres-db',
        name: 'PostgreSQL & Session Store',
        category: 'Cơ sở dữ liệu chính',
        level: isConnected ? 'OPERATIONAL' : 'UNREACHABLE',
        summary: isConnected
          ? `Kết nối ổn định · ${a.health.activeSessions} phiên đang mở`
          : 'Mất kết nối cơ sở dữ liệu',
        detail: `Tổng tài khoản ghi nhận: ${a.health.totalUsers} · Phiên truy vấn hợp lệ`,
        checkedAt: a.health.checkedAt,
      });
    } else {
      const detail =
        auditRes.reason instanceof ApiError
          ? `HTTP ${auditRes.reason.status}: ${auditRes.reason.message}`
          : 'Không truy cập được nhật ký & cơ sở dữ liệu';
      setAuditError(detail);
      cards.push({
        id: 'postgres-db',
        name: 'PostgreSQL & Session Store',
        category: 'Cơ sở dữ liệu chính',
        level: 'UNREACHABLE',
        summary: 'Không đọc được sức khỏe CSDL & nhật ký',
        detail,
      });
    }

    // 3. System Config integrations (/api/v2/operations/system-config)
    if (cfgRes.status === 'fulfilled') {
      setConfigData(cfgRes.value);
      for (const setting of cfgRes.value.settings) {
        const meta = formatConfigSettingMeta(setting.code, setting.category);
        const level = classifyConfigConnection(setting.connectionState);
        cards.push({
          id: `cfg-${setting.code}`,
          name: meta.name,
          category: meta.category,
          level,
          summary: `${formatConfigConnectionLabel(setting.connectionState)} · Giá trị: ${setting.maskedValue}`,
          detail: setting.operatorNote,
          checkedAt: cfgRes.value.checkedAt,
        });
      }
    } else {
      const detail =
        cfgRes.reason instanceof ApiError
          ? `HTTP ${cfgRes.reason.status}: ${cfgRes.reason.message}`
          : 'Không đọc được cấu hình vận hành.';
      setConfigError(detail);
      cards.push({
        id: 'cfg-unavailable',
        name: 'Cấu hình tích hợp hệ thống',
        category: 'Kiểm tra cấu hình',
        level: 'UNREACHABLE',
        summary: 'Không truy cập được cấu hình hệ thống',
        detail,
      });
    }

    // 4. Operational Modules Readiness (/api/v2/operations/readiness)
    if (readyRes.status === 'fulfilled') {
      setReadinessData(readyRes.value);
      for (const src of readyRes.value.sources) {
        const level = classifyReadinessSource(src.state);
        cards.push({
          id: `ready-${src.domain}`,
          name: formatReadinessDomain(src.domain),
          category: 'Tình trạng kết nối phân hệ',
          level,
          summary: SERVICE_STATUS_META[level].label,
          detail: formatReadinessReason(src.reason),
        });
      }
    } else {
      cards.push({
        id: 'ready-unreachable',
        name: 'Kết nối các phân hệ nghiệp vụ',
        category: 'Tình trạng kết nối phân hệ',
        level: 'UNREACHABLE',
        summary: 'Không truy cập được trạng thái phân hệ',
        detail: 'Kiểm tra kết nối máy chủ hoặc quyền truy cập.',
      });
    }

    if (accRes.status === 'fulfilled') {
      setAccounts(accRes.value.data);
    }

    if (escRes.status === 'fulfilled' && Array.isArray(escRes.value?.escalations)) {
      setEscalations(escRes.value.escalations);
    }

    setServices(cards);
    setLastCheckedAt(new Date().toISOString());
    setLoading(false);
  }, [actionFilter, appliedSearch, objectTypeFilter]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const accountById = useMemo(
    () => new Map(accounts.map((a) => [a.id, a])),
    [accounts],
  );

  const actorOptions = useMemo(() => {
    const ids = new Set<string>();
    for (const acc of accounts) ids.add(acc.id);
    for (const ev of auditData?.events ?? []) ids.add(ev.actorId);
    return [...ids].map((id) => {
      const acc = accountById.get(id);
      return {
        id,
        label: acc
          ? `${sanitizeAccountDisplayName(acc.fullName)} (${acc.email}) · ${ADMIN_ROLE_SHORT[acc.role] ?? acc.role}`
          : `Tài khoản (${id.slice(0, 8)}…)`,
      };
    });
  }, [accounts, accountById, auditData]);

  const distinctActions = useMemo(() => {
    const set = new Set<string>();
    for (const ev of auditData?.events ?? []) set.add(ev.action);
    if (actionFilter !== 'ALL') set.add(actionFilter);
    return [...set].sort();
  }, [auditData, actionFilter]);

  const distinctObjectTypes = useMemo(() => {
    const set = new Set<string>();
    for (const ev of auditData?.events ?? []) set.add(ev.objectType);
    if (objectTypeFilter !== 'ALL') set.add(objectTypeFilter);
    return [...set].sort();
  }, [auditData, objectTypeFilter]);

  const filteredEvents = useMemo(() => {
    const events = auditData?.events ?? [];
    const fromMs = fromDate ? new Date(`${fromDate}T00:00:00+07:00`).getTime() : null;
    const toMs = toDate ? new Date(`${toDate}T23:59:59.999+07:00`).getTime() : null;
    const keyword = appliedSearch.trim().toLowerCase();

    return events.filter((ev) => {
      const evMs = new Date(ev.createdAt).getTime();
      if (fromMs !== null && !Number.isNaN(fromMs) && evMs < fromMs) return false;
      if (toMs !== null && !Number.isNaN(toMs) && evMs > toMs) return false;
      if (actorFilter !== 'ALL' && ev.actorId !== actorFilter) return false;
      if (actionFilter !== 'ALL' && ev.action !== actionFilter) return false;
      if (decisionFilter !== 'ALL' && ev.decision !== decisionFilter) return false;
      if (objectTypeFilter !== 'ALL' && ev.objectType !== objectTypeFilter) return false;
      if (keyword) {
        const actorName = accountById.get(ev.actorId)?.email?.toLowerCase() ?? '';
        const haystack = [
          ev.action,
          formatActionLabel(ev.action),
          ev.objectType,
          formatObjectTypeLabel(ev.objectType),
          ev.objectId,
          ev.decision,
          ev.reason,
          actorName,
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(keyword)) return false;
      }
      return true;
    });
  }, [
    accountById,
    actionFilter,
    actorFilter,
    appliedSearch,
    auditData,
    decisionFilter,
    fromDate,
    objectTypeFilter,
    toDate,
  ]);

  const auditTotalPages = Math.max(1, Math.ceil(filteredEvents.length / displayLimit));
  const safeAuditPage = Math.min(auditPage, auditTotalPages);
  const visibleEvents = useMemo(
    () =>
      filteredEvents.slice(
        (safeAuditPage - 1) * displayLimit,
        safeAuditPage * displayLimit,
      ),
    [displayLimit, filteredEvents, safeAuditPage],
  );

  const serviceSummary = useMemo(() => {
    const counts = { OPERATIONAL: 0, UNREACHABLE: 0, UNDETERMINED: 0 };
    for (const s of services) counts[s.level] += 1;
    return counts;
  }, [services]);

  const handleAuditSearchSubmit = (e: FormEvent) => {
    e.preventDefault();
    setAuditPage(1);
    setAppliedSearch(searchInput.trim());
  };

  const resetAuditFilters = () => {
    setFromDate('');
    setToDate('');
    setActorFilter('ALL');
    setActionFilter('ALL');
    setDecisionFilter('ALL');
    setObjectTypeFilter('ALL');
    setSearchInput('');
    setAppliedSearch('');
    setAuditPage(1);
  };

  const handleProposeConfig = async (e: FormEvent) => {
    e.preventDefault();
    setProposalError('');
    setProposalNotice('');
    const reason = proposalReason.trim();
    if (reason.length < 10) {
      setProposalError('Lý do đề xuất thay đổi cấu hình phải từ 10 đến 500 ký tự.');
      return;
    }
    setSubmittingProposal(true);
    try {
      const meta = formatConfigSettingMeta(proposalSettingCode, '');
      await apiFetch('/v2/operations/system-config/proposals', {
        method: 'POST',
        body: JSON.stringify({
          settingCode: proposalSettingCode,
          proposedState: proposalState,
          reason,
        }),
      });
      setProposalReason('');
      setProposalNotice(
        `Đã ghi nhận đề xuất thay đổi cấu hình cho "${meta.name}" vào nhật ký kiểm toán.`,
      );
      await loadAll();
    } catch (err) {
      setProposalError(
        err instanceof Error ? err.message : 'Không thể gửi đề xuất cấu hình.',
      );
    } finally {
      setSubmittingProposal(false);
    }
  };

  const visibleEscalations = useMemo(() => {
    if (escStatusFilter === 'ALL') return escalations;
    return escalations.filter((e) => e.status === escStatusFilter);
  }, [escalations, escStatusFilter]);

  const handleRespondEscalation = async (
    escalationId: string,
    status: 'IN_REVIEW' | 'RESOLVED' | 'RETURNED_TO_COUNSELOR',
  ) => {
    setEscError('');
    setEscNotice('');
    const note = (escNotes[escalationId] ?? '').trim();
    if (note.length < 5) {
      setEscError('Vui lòng nhập nội dung phản hồi kỹ thuật tối thiểu 5 ký tự.');
      return;
    }
    setEscBusyId(escalationId);
    try {
      const res = await apiFetch<{ status: string; ticketState: string }>(
        `/v2/operations/technical-escalations/${escalationId}/respond`,
        {
          method: 'POST',
          body: JSON.stringify({
            status,
            resolutionNote: note,
            replyToLearner: Boolean(escReplyLearner[escalationId]),
          }),
        },
      );
      setEscNotice(
        `Đã cập nhật sự cố kỹ thuật -> ${formatEscalationStatus(res.status).label} (phiếu: ${formatTicketStateLabel(res.ticketState)}).`,
      );
      setEscNotes((prev) => ({ ...prev, [escalationId]: '' }));
      await loadAll();
    } catch (err) {
      setEscError(err instanceof Error ? err.message : 'Không thể phản hồi sự cố kỹ thuật.');
    } finally {
      setEscBusyId(null);
    }
  };

  return (
    <div className="mx-auto min-w-0 max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      {/* Header */}
      <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
          <Link
            to="/workspace"
            className="inline-flex items-center gap-1.5 font-semibold text-[#51743e] hover:underline"
          >
            <ArrowLeft size={14} aria-hidden="true" />
            Tổng quan quản trị
          </Link>
          <span className="text-slate-400">/ Nhật ký hoạt động &amp; Tình trạng vận hành</span>
        </div>

        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full border border-[#dce8d4] bg-[#f4f8f1] px-2.5 py-0.5 text-xs font-semibold text-[#51743e]">
                <Activity size={13} aria-hidden="true" />
                Giám sát nhật ký &amp; tình trạng dịch vụ thực tế
              </span>
              {lastCheckedAt && (
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs text-slate-600">
                  Kiểm tra lúc: {formatVnDateTime(lastCheckedAt)}
                </span>
              )}
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Nhật ký hệ thống &amp; Tình trạng vận hành
            </h1>
            <p className="max-w-3xl text-sm text-slate-600">
              Theo dõi tình trạng hoạt động thực tế của các dịch vụ đang chạy trong hệ thống, xử lý
              hàng đợi sự cố kỹ thuật từ CSKH và tra cứu nhật ký kiểm toán từ cơ sở dữ liệu.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => void loadAll()}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg bg-[#5f8b48] px-4 py-2 text-sm font-semibold text-white hover:bg-[#51773d] disabled:opacity-60"
            >
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} aria-hidden="true" />
              Kiểm tra lại tình trạng
            </button>
            <Link
              to="/workspace/authority"
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <ShieldCheck size={15} aria-hidden="true" />
              Quản lý tài khoản
            </Link>
          </div>
        </div>

        {/* Service State Legend & Counters */}
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-emerald-800">
                {SERVICE_STATUS_META.OPERATIONAL.label}
              </span>
              <span className="rounded-full bg-white px-2 py-0.5 text-xs font-bold text-emerald-800 ring-1 ring-emerald-200">
                {serviceSummary.OPERATIONAL}
              </span>
            </div>
            <p className="mt-1 text-[11px] text-emerald-900/80">
              {SERVICE_STATUS_META.OPERATIONAL.description}
            </p>
          </div>
          <div className="rounded-lg border border-rose-200 bg-rose-50/50 p-3.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-rose-800">
                {SERVICE_STATUS_META.UNREACHABLE.label}
              </span>
              <span className="rounded-full bg-white px-2 py-0.5 text-xs font-bold text-rose-800 ring-1 ring-rose-200">
                {serviceSummary.UNREACHABLE}
              </span>
            </div>
            <p className="mt-1 text-[11px] text-rose-900/80">
              {SERVICE_STATUS_META.UNREACHABLE.description}
            </p>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-amber-900">
                {SERVICE_STATUS_META.UNDETERMINED.label}
              </span>
              <span className="rounded-full bg-white px-2 py-0.5 text-xs font-bold text-amber-900 ring-1 ring-amber-200">
                {serviceSummary.UNDETERMINED}
              </span>
            </div>
            <p className="mt-1 text-[11px] text-amber-900/80">
              {SERVICE_STATUS_META.UNDETERMINED.description}
            </p>
          </div>
        </div>
      </section>

      {/* Navigation Tabs */}
      <nav aria-label="Phân khu giám sát vận hành" className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
        <button
          type="button"
          onClick={() => setOpsTab('monitor')}
          className={`rounded-lg px-3.5 py-2 text-xs font-semibold transition ${
            activeTab === 'monitor'
              ? 'bg-[#76a35e] text-white'
              : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
          }`}
        >
          Tình trạng dịch vụ &amp; Nhật ký
        </button>
        <button
          type="button"
          onClick={() => setOpsTab('escalations')}
          className={`rounded-lg px-3.5 py-2 text-xs font-semibold transition ${
            activeTab === 'escalations'
              ? 'bg-[#76a35e] text-white'
              : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
          }`}
        >
          Hàng đợi sự cố kỹ thuật ({escalations.filter((e) => e.status === 'OPEN' || e.status === 'IN_REVIEW').length})
        </button>
        <button
          type="button"
          onClick={() => setOpsTab('config')}
          className={`rounded-lg px-3.5 py-2 text-xs font-semibold transition ${
            activeTab === 'config'
              ? 'bg-[#76a35e] text-white'
              : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
          }`}
        >
          Cấu hình hệ thống &amp; Đề xuất
        </button>
      </nav>

      {/* Section 1: Service Health Monitor (#health) */}
      {activeTab === 'monitor' && (
      <>
      <section
        id="health"
        className="min-w-0 space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-xs"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Server size={18} className="text-[#5f8b48]" aria-hidden="true" />
            <h2 className="text-lg font-bold text-slate-900">
              Tình trạng dịch vụ &amp; phân hệ thực tế
            </h2>
          </div>
          <span className="text-xs text-slate-500">
            Dữ liệu kiểm tra trực tiếp từ máy chủ · Minh bạch các mục chưa mở ngoài môi trường thật
          </span>
        </div>

        {(healthError || auditError || configError) && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800"
          >
            <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
            <div className="space-y-0.5">
              {healthError && <p>Trạng thái API: {healthError}</p>}
              {auditError && <p>Nhật ký &amp; CSDL: {auditError}</p>}
              {configError && <p>Cấu hình hệ thống: {configError}</p>}
            </div>
          </div>
        )}

        <div className="grid min-w-0 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {services.map((svc) => {
            const meta = SERVICE_STATUS_META[svc.level];
            return (
              <article
                key={svc.id}
                className="flex min-w-0 flex-col justify-between rounded-lg border border-slate-200 bg-slate-50/40 p-4"
              >
                <div className="min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="break-words text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        {svc.category}
                      </p>
                      <h3 className="mt-0.5 break-words text-sm font-bold text-slate-900">
                        {svc.name}
                      </h3>
                    </div>
                    <span
                      className={`shrink-0 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${meta.badgeClass}`}
                    >
                      {meta.label}
                    </span>
                  </div>
                  <p className="mt-2 break-words text-xs font-medium text-slate-800">{svc.summary}</p>
                  <p className="mt-1 break-words text-[11px] leading-relaxed text-slate-600">
                    {svc.detail}
                  </p>
                </div>
                {svc.checkedAt && (
                  <p className="mt-2 border-t border-slate-100 pt-2 text-[11px] text-slate-400">
                    Mốc server: {formatVnDateTime(svc.checkedAt)}
                  </p>
                )}
              </article>
            );
          })}
        </div>

        {readinessData && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-700">
            <span className="font-semibold">Tổng quan mức độ tích hợp máy chủ:</span> Đang theo dõi{' '}
            <strong>{readinessData.sources.length}</strong> phân hệ nghiệp vụ · Các chức năng quản
            trị tài khoản, phân quyền, nhật ký, cấu hình và xử lý sự cố đều hoạt động trực tiếp trên
            CSDL.
          </div>
        )}
      </section>

      {/* Section 2: System Audit Log Explorer */}
      <section
        id="audit-log"
        className="min-w-0 space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-xs"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Database size={18} className="text-[#5f8b48]" aria-hidden="true" />
            <div>
              <h2 className="text-lg font-bold text-slate-900">Nhật ký hoạt động hệ thống</h2>
              <p className="text-xs text-slate-500">
                Truy vấn bản ghi kiểm toán thực tế từ cơ sở dữ liệu (tự động che thông tin bí mật).
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
              {filteredEvents.length} bản ghi khớp bộ lọc
            </span>
            <select
              id="audit-display-limit"
              name="displayLimit"
              aria-label="Số dòng hiển thị"
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700"
              value={displayLimit}
              onChange={(e) => {
                setDisplayLimit(Number(e.target.value));
                setAuditPage(1);
              }}
            >
              <option value={25}>Hiển thị 25 dòng</option>
              <option value={50}>Hiển thị 50 dòng</option>
              <option value={100}>Hiển thị 100 dòng</option>
            </select>
          </div>
        </div>

        {/* Multi-dimension Audit Filter Bar */}
        <form onSubmit={handleAuditSearchSubmit} className="space-y-3 rounded-lg bg-slate-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-700">
              <Filter size={14} aria-hidden="true" />
              Lọc theo thời gian, người thực hiện, hành động &amp; kết quả
            </span>
            <div className="flex flex-wrap gap-1.5 text-[11px]">
              <button
                type="button"
                onClick={() => {
                  const today = getTodayIsoDate();
                  setFromDate(today);
                  setToDate(today);
                  setAuditPage(1);
                }}
                className="rounded border border-slate-300 bg-white px-2 py-0.5 font-semibold text-slate-700 hover:bg-slate-100"
              >
                Hôm nay
              </button>
              <button
                type="button"
                onClick={resetAuditFilters}
                className="rounded border border-slate-300 bg-white px-2 py-0.5 font-semibold text-slate-700 hover:bg-slate-100"
              >
                Xóa bộ lọc
              </button>
            </div>
          </div>

          <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <label htmlFor="audit-from-date" className="min-w-0 text-xs font-semibold text-slate-700">
              Từ ngày (GMT+7)
              <input
                id="audit-from-date"
                name="fromDate"
                type="date"
                aria-label="Từ ngày"
                className={`${controlClass} mt-1`}
                value={fromDate}
                onChange={(e) => {
                  setFromDate(e.target.value);
                  setAuditPage(1);
                }}
              />
            </label>
            <label htmlFor="audit-to-date" className="min-w-0 text-xs font-semibold text-slate-700">
              Đến ngày (GMT+7)
              <input
                id="audit-to-date"
                name="toDate"
                type="date"
                aria-label="Đến ngày"
                className={`${controlClass} mt-1`}
                value={toDate}
                onChange={(e) => {
                  setToDate(e.target.value);
                  setAuditPage(1);
                }}
              />
            </label>
            <label htmlFor="audit-actor-filter" className="min-w-0 text-xs font-semibold text-slate-700">
              Người thực hiện
              <select
                id="audit-actor-filter"
                name="actorFilter"
                aria-label="Lọc theo người thực hiện"
                className={`${controlClass} mt-1`}
                value={actorFilter}
                onChange={(e) => {
                  setActorFilter(e.target.value);
                  setAuditPage(1);
                }}
              >
                <option value="ALL">Tất cả người thực hiện</option>
                {actorOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
            <label htmlFor="audit-action-filter" className="text-xs font-semibold text-slate-700">
              Hành động
              <select
                id="audit-action-filter"
                name="actionFilter"
                aria-label="Lọc theo hành động"
                className={`${controlClass} mt-1`}
                value={actionFilter}
                onChange={(e) => {
                  setActionFilter(e.target.value);
                  setAuditPage(1);
                }}
              >
                <option value="ALL">Tất cả hành động</option>
                {distinctActions.map((act) => (
                  <option key={act} value={act}>
                    {formatActionLabel(act)}
                  </option>
                ))}
              </select>
            </label>
            <label htmlFor="audit-decision-filter" className="text-xs font-semibold text-slate-700">
              Kết quả
              <select
                id="audit-decision-filter"
                name="decisionFilter"
                aria-label="Lọc theo kết quả"
                className={`${controlClass} mt-1`}
                value={decisionFilter}
                onChange={(e) => {
                  setDecisionFilter(e.target.value);
                  setAuditPage(1);
                }}
              >
                <option value="ALL">Tất cả kết quả</option>
                <option value="ALLOW">Hợp lệ / Cho phép</option>
                <option value="DENY">Từ chối truy cập</option>
                <option value="PENDING_OPERATOR_REVIEW">Chờ duyệt vận hành</option>
              </select>
            </label>
            <label htmlFor="audit-object-filter" className="text-xs font-semibold text-slate-700">
              Loại đối tượng
              <select
                id="audit-object-filter"
                name="objectTypeFilter"
                aria-label="Lọc theo loại đối tượng"
                className={`${controlClass} mt-1`}
                value={objectTypeFilter}
                onChange={(e) => {
                  setObjectTypeFilter(e.target.value);
                  setAuditPage(1);
                }}
              >
                <option value="ALL">Tất cả đối tượng</option>
                {distinctObjectTypes.map((ot) => (
                  <option key={ot} value={ot}>
                    {formatObjectTypeLabel(ot)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex flex-wrap gap-2">
            <div className="relative min-w-[240px] flex-1">
              <Search
                size={15}
                className="pointer-events-none absolute top-2.5 left-3 text-slate-400"
                aria-hidden="true"
              />
              <input
                id="audit-keyword-input"
                name="auditSearch"
                type="search"
                aria-label="Tìm từ khóa nhật ký"
                className={`${controlClass} pl-9`}
                placeholder="Tìm theo mã đối tượng, hành động hoặc nội dung lý do..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
            </div>
            <button
              type="submit"
              className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
            >
              Truy vấn máy chủ
            </button>
          </div>
        </form>

        {/* Audit Events Table */}
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-[11px] uppercase text-slate-500">
              <tr>
                <th className="whitespace-nowrap px-3 py-2.5 font-semibold">Thời gian (GMT+7)</th>
                <th className="whitespace-nowrap px-3 py-2.5 font-semibold">Người thực hiện</th>
                <th className="whitespace-nowrap px-3 py-2.5 font-semibold">Hành động</th>
                <th className="whitespace-nowrap px-3 py-2.5 font-semibold">Đối tượng</th>
                <th className="whitespace-nowrap px-3 py-2.5 font-semibold">Kết quả</th>
                <th className="px-3 py-2.5 font-semibold">Lý do / Ngữ cảnh (đã che bí mật)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {!filteredEvents.length ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500">
                    {loading
                      ? 'Đang tải nhật ký hệ thống...'
                      : 'Không có bản ghi kiểm toán nào khớp bộ lọc hiện tại.'}
                  </td>
                </tr>
              ) : (
                visibleEvents.map((ev) => {
                  const actorAcc = accountById.get(ev.actorId);
                  const decMeta = AUDIT_DECISION_META[ev.decision] ?? {
                    label: ev.decision,
                    badgeClass: 'border-slate-200 bg-slate-50 text-slate-700',
                  };
                  return (
                    <tr key={ev.id} className="hover:bg-slate-50/70">
                      <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">
                        {formatVnDateTime(ev.createdAt)}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="font-semibold text-slate-900">
                          {actorAcc
                            ? sanitizeAccountDisplayName(actorAcc.fullName)
                            : 'Tài khoản hệ thống'}
                        </div>
                        {actorAcc && (
                          <div className="font-mono text-[11px] text-slate-500">
                            {actorAcc.email}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="font-semibold text-slate-900">
                          {formatActionLabel(ev.action)}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-[11px] text-slate-700">
                        <div className="font-medium">{formatObjectTypeLabel(ev.objectType)}</div>
                        <div className="font-mono text-slate-500" title={ev.objectId}>
                          {ev.objectId.length > 18
                            ? `${ev.objectId.slice(0, 14)}…`
                            : ev.objectId}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5">
                        <span
                          className={`inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold ${decMeta.badgeClass}`}
                        >
                          {decMeta.label}
                        </span>
                      </td>
                      <td className="max-w-md px-3 py-2.5 text-slate-700">
                        {redactSensitiveText(ev.reason)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {auditTotalPages > 1 && (
          <div className="flex items-center justify-between text-xs text-slate-600">
            <span>
              Trang {safeAuditPage} / {auditTotalPages} ({filteredEvents.length} bản ghi)
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={safeAuditPage <= 1}
                onClick={() => setAuditPage((p) => Math.max(1, p - 1))}
                className="rounded-md border border-slate-300 px-2.5 py-1 font-semibold disabled:opacity-40"
              >
                Trang trước
              </button>
              <button
                type="button"
                disabled={safeAuditPage >= auditTotalPages}
                onClick={() => setAuditPage((p) => p + 1)}
                className="rounded-md border border-slate-300 px-2.5 py-1 font-semibold disabled:opacity-40"
              >
                Trang sau
              </button>
            </div>
          </div>
        )}
      </section>
      </>
      )}

      {/* Section 2.5: Technical Escalations from Counselor */}
      {activeTab === 'escalations' && (
      <section
        id="technical-escalations"
        className="min-w-0 space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-xs"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Wrench size={18} className="text-[#5f8b48]" aria-hidden="true" />
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                Hàng đợi sự cố kỹ thuật từ CSKH
              </h2>
              <p className="text-xs text-slate-500">
                Tiếp nhận sự cố vượt thẩm quyền do Nhân viên tư vấn chuyển lên, kiểm tra nhật ký/tài
                khoản và trả kết quả về phiếu.
              </p>
            </div>
          </div>
          <label htmlFor="esc-status-filter" className="flex items-center gap-2 text-xs font-semibold text-slate-700">
            Lọc trạng thái
            <select
              id="esc-status-filter"
              name="escStatusFilter"
              aria-label="Lọc trạng thái sự cố kỹ thuật"
              value={escStatusFilter}
              onChange={(e) => setEscStatusFilter(e.target.value)}
              className="rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-normal"
            >
              <option value="ALL">Tất cả ({escalations.length})</option>
              <option value="OPEN">Chờ tiếp nhận</option>
              <option value="IN_REVIEW">Đang kiểm tra</option>
              <option value="RESOLVED">Đã xử lý xong</option>
              <option value="RETURNED_TO_COUNSELOR">Đã trả lại CSKH</option>
            </select>
          </label>
        </div>

        {escError && (
          <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-800">
            {escError}
          </p>
        )}
        {escNotice && (
          <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-900">
            {escNotice}
          </p>
        )}

        {!visibleEscalations.length ? (
          <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-6 text-center text-xs text-slate-600">
            Chưa có sự cố kỹ thuật nào trong bộ lọc hiện tại. Các chức năng kiểm tra tài khoản,
            quyền, nhật ký và cấu hình bên dưới vẫn hoạt động độc lập.
          </p>
        ) : (
          <div className="space-y-4">
            {visibleEscalations.map((esc) => {
              const isOpen = ['OPEN', 'IN_REVIEW'].includes(esc.status);
              const escMeta = formatEscalationStatus(esc.status);
              return (
                <article
                  key={esc.id}
                  className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/40 p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-mono font-bold text-slate-900">{esc.ticketRef}</span>
                        <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 font-semibold text-sky-900">
                          {formatEscalationCategory(esc.incidentCategory)}
                        </span>
                        <span
                          className={`rounded-full border px-2 py-0.5 font-semibold ${escMeta.badgeClass}`}
                        >
                          {escMeta.label}
                        </span>
                        <span className="text-slate-500">
                          Phiếu: {formatTicketStateLabel(esc.ticketState)} ·{' '}
                          {formatVnDateTime(esc.createdAt)}
                        </span>
                      </div>
                      <h3 className="text-sm font-bold text-slate-900">{esc.ticketTitle}</h3>
                      <p className="text-xs text-slate-700">{esc.summary}</p>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs">
                      <Link
                        to={`/workspace/support/tickets/${esc.ticketId}`}
                        className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1.5 font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        <ExternalLink size={12} aria-hidden="true" />
                        Đọc phiếu (chỉ đọc)
                      </Link>
                      <button
                        type="button"
                        onClick={() => {
                          setSearchInput(esc.ticketId);
                          setAppliedSearch(esc.ticketId);
                          setAuditPage(1);
                          document
                            .getElementById('audit-log')
                            ?.scrollIntoView({ behavior: 'smooth' });
                        }}
                        className="rounded border border-slate-300 bg-white px-2.5 py-1.5 font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        Lọc nhật ký phiếu
                      </button>
                      <Link
                        to="/workspace/authority"
                        className="rounded border border-[#dce8d4] bg-[#f4f8f1] px-2.5 py-1.5 font-semibold text-[#2d581b] hover:bg-[#eaf2e4]"
                      >
                        Kiểm tra tài khoản &amp; quyền
                      </Link>
                    </div>
                  </div>

                  <div className="grid gap-2 rounded border border-slate-200 bg-white p-3 text-xs text-slate-600 sm:grid-cols-3">
                    <div>
                      <span className="font-semibold text-slate-800">Học viên:</span>{' '}
                      {sanitizeAccountDisplayName(esc.learnerName)} ({esc.learnerEmail})
                    </div>
                    <div>
                      <span className="font-semibold text-slate-800">CSKH chuyển lên:</span>{' '}
                      {sanitizeAccountDisplayName(esc.createdByName)}
                    </div>
                    <div>
                      <span className="font-semibold text-slate-800">Đường dẫn / Tài khoản lỗi:</span>{' '}
                      <span className="font-mono">
                        {esc.affectedRoute || '—'} · {esc.affectedAccountEmail || '—'}
                      </span>
                    </div>
                  </div>

                  {esc.attachments.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="inline-flex items-center gap-1 font-semibold text-slate-700">
                        <Paperclip size={13} aria-hidden="true" />
                        Tệp đính kèm trên phiếu:
                      </span>
                      {esc.attachments.map((att) => (
                        <a
                          key={att.id}
                          href={`/api/v2/support/tickets/${esc.ticketId}/attachments/${att.id}/file?download=1`}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded border border-slate-300 bg-white px-2 py-0.5 font-medium text-[#2d581b] hover:underline"
                        >
                          {att.originalName} ({Math.max(1, Math.round(att.byteSize / 1024))} KB)
                        </a>
                      ))}
                    </div>
                  )}

                  {esc.resolutionNote && (
                    <div className="rounded border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-xs text-emerald-950">
                      <strong>
                        Ghi chú xử lý kỹ thuật ({esc.resolvedByName ?? esc.assignedAdminName ?? 'Quản trị'}):
                      </strong>{' '}
                      {esc.resolutionNote}
                    </div>
                  )}

                  {isOpen && (
                    <div className="space-y-2 border-t border-slate-200 pt-3">
                      <label
                        htmlFor={`esc-note-${esc.id}`}
                        className="block text-xs font-semibold text-slate-700"
                      >
                        Kết luận / Phương án xử lý kỹ thuật trả về phiếu &amp; CSKH (tối thiểu 5 ký tự)
                        <textarea
                          id={`esc-note-${esc.id}`}
                          name={`escNote-${esc.id}`}
                          rows={2}
                          value={escNotes[esc.id] ?? ''}
                          onChange={(e) =>
                            setEscNotes((prev) => ({ ...prev, [esc.id]: e.target.value }))
                          }
                          placeholder="Ví dụ: Đã kiểm tra nhật ký hệ thống và cấp lại phiên/quyền nộp bài LMS cho học viên..."
                          className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-xs font-normal"
                        />
                      </label>
                      <label
                        htmlFor={`esc-reply-learner-${esc.id}`}
                        className="inline-flex items-center gap-2 text-xs text-slate-700"
                      >
                        <input
                          id={`esc-reply-learner-${esc.id}`}
                          name={`escReplyLearner-${esc.id}`}
                          type="checkbox"
                          checked={Boolean(escReplyLearner[esc.id])}
                          onChange={(e) =>
                            setEscReplyLearner((prev) => ({
                              ...prev,
                              [esc.id]: e.target.checked,
                            }))
                          }
                        />
                        Hiển thị ghi chú xử lý kỹ thuật công khai cho học viên trên phiếu
                      </label>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={escBusyId === esc.id}
                          onClick={() => void handleRespondEscalation(esc.id, 'IN_REVIEW')}
                          className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                        >
                          Đánh dấu đang kiểm tra
                        </button>
                        <button
                          type="button"
                          disabled={escBusyId === esc.id}
                          onClick={() => void handleRespondEscalation(esc.id, 'RESOLVED')}
                          className="rounded bg-[#5f8b48] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#51773d] disabled:opacity-50"
                        >
                          Đã xử lý xong &amp; Trả CSKH
                        </button>
                        <button
                          type="button"
                          disabled={escBusyId === esc.id}
                          onClick={() =>
                            void handleRespondEscalation(esc.id, 'RETURNED_TO_COUNSELOR')
                          }
                          className="rounded border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-50"
                        >
                          Trả lại CSKH thu thập thêm thông tin
                        </button>
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
      )}

      {/* Section 3: Masked System Configuration & Auditable Change Proposal (#config) */}
      {activeTab === 'config' && (
      <section
        id="config"
        className="min-w-0 space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-xs"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <SlidersHorizontal size={18} className="text-[#5f8b48]" aria-hidden="true" />
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                Cấu hình tích hợp hệ thống (đã che bí mật)
              </h2>
              <p className="text-xs text-slate-500">
                Mọi khóa bí mật luôn được che phía máy chủ (••••••••). Không lưu hoặc hiển thị giá
                trị nhạy cảm.
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
            <Lock size={12} aria-hidden="true" /> Đã khóa hiển thị thông tin bí mật
          </span>
        </div>

        {configData ? (
          <div className="grid min-w-0 gap-6 lg:grid-cols-12">
            <div className="min-w-0 overflow-x-auto rounded-lg border border-slate-200 lg:col-span-7">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-[11px] uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Mục cấu hình</th>
                    <th className="whitespace-nowrap px-3 py-2 font-semibold">Giá trị che</th>
                    <th className="whitespace-nowrap px-3 py-2 font-semibold">Tình trạng</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {configData.settings.map((item) => {
                    const settingMeta = formatConfigSettingMeta(item.code, item.category);
                    const level = classifyConfigConnection(item.connectionState);
                    const meta = SERVICE_STATUS_META[level];
                    return (
                      <tr key={item.code}>
                        <td className="px-3 py-2.5">
                          <div className="font-semibold text-slate-900">{settingMeta.name}</div>
                          <div className="text-[11px] text-slate-500">{item.operatorNote}</div>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 font-mono text-slate-700">
                          {item.maskedValue}
                        </td>
                        <td className="px-3 py-2.5">
                          <span
                            className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${meta.badgeClass}`}
                          >
                            {formatConfigConnectionLabel(item.connectionState)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <form
              onSubmit={handleProposeConfig}
              className="min-w-0 space-y-3 rounded-lg border border-slate-200 bg-slate-50/70 p-4 lg:col-span-5"
            >
              <h3 className="text-sm font-bold text-slate-900">
                Đề xuất thay đổi cấu hình có kiểm toán
              </h3>
              <p className="text-xs text-slate-600">
                Ghi nhận yêu cầu thay đổi biến môi trường/hạ tầng (.env) vào sổ kiểm toán để bộ phận
                kỹ thuật vận hành máy chủ thực hiện. Không nhập trực tiếp mật khẩu hoặc khóa bí mật
                vào lý do.
              </p>

              {proposalError && (
                <div className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
                  {proposalError}
                </div>
              )}
              {proposalNotice && (
                <div className="flex items-center gap-1.5 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                  <CheckCircle2 size={14} aria-hidden="true" />
                  <span>{proposalNotice}</span>
                </div>
              )}

              <label htmlFor="proposal-setting-code" className="block text-xs font-semibold text-slate-700">
                Danh mục cấu hình cho phép
                <select
                  id="proposal-setting-code"
                  name="proposalSettingCode"
                  className={`${controlClass} mt-1`}
                  value={proposalSettingCode}
                  onChange={(e) => setProposalSettingCode(e.target.value)}
                >
                  {configData.settings.map((s) => {
                    const m = formatConfigSettingMeta(s.code, s.category);
                    return (
                      <option key={s.code} value={s.code}>
                        {m.name} · {m.category}
                      </option>
                    );
                  })}
                </select>
              </label>

              <label htmlFor="proposal-state-select" className="block text-xs font-semibold text-slate-700">
                Phương án đề xuất
                <select
                  id="proposal-state-select"
                  name="proposalState"
                  className={`${controlClass} mt-1`}
                  value={proposalState}
                  onChange={(e) => setProposalState(e.target.value)}
                >
                  <option value="REQUEST_OPERATOR_UPDATE">Đề nghị cập nhật cấu hình vận hành</option>
                  <option value="REQUEST_SECRET_ROTATION">Đề nghị xoay vòng khóa bí mật</option>
                  <option value="KEEP_SAFE_NOOP">Giữ chế độ an toàn hiện tại</option>
                </select>
              </label>

              <label htmlFor="proposal-reason-input" className="block text-xs font-semibold text-slate-700">
                Lý do đề xuất (10–500 ký tự, không chứa khóa bí mật)
                <textarea
                  id="proposal-reason-input"
                  name="proposalReason"
                  rows={2}
                  className={`${controlClass} mt-1`}
                  placeholder="Nêu rõ nhu cầu thay đổi cấu hình cần vận hành phê duyệt..."
                  value={proposalReason}
                  onChange={(e) => setProposalReason(e.target.value)}
                />
              </label>

              <button
                type="submit"
                disabled={submittingProposal}
                className="w-full rounded-lg bg-[#5f8b48] px-4 py-2 text-xs font-semibold text-white hover:bg-[#51773d] disabled:opacity-60"
              >
                Gửi đề xuất thay đổi cấu hình
              </button>

              {configData.proposals.length > 0 && (
                <div className="border-t border-slate-200 pt-2">
                  <p className="text-[11px] font-semibold uppercase text-slate-500">
                    Đề xuất gần đây ({configData.proposals.length})
                  </p>
                  <ul className="mt-1 space-y-1 text-[11px]">
                    {configData.proposals.slice(0, 4).map((p) => {
                      const settingMeta = formatConfigSettingMeta(p.settingCode, '');
                      const decMeta = AUDIT_DECISION_META[p.decision];
                      return (
                        <li key={p.id} className="rounded bg-white px-2 py-1 ring-1 ring-slate-200">
                          <strong>{settingMeta.name}</strong> · {decMeta?.label ?? p.decision} —{' '}
                          {redactSensitiveText(p.reason)}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </form>
          </div>
        ) : (
          <p className="text-sm text-slate-500">
            {loading ? 'Đang tải cấu hình hệ thống...' : 'Chưa có dữ liệu cấu hình.'}
          </p>
        )}
      </section>
      )}
    </div>
  );
}
