import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router';
import {
  Activity,
  ArrowLeft,
  CheckCircle2,
  KeyRound,
  Lock,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  UserPlus,
  Users,
} from 'lucide-react';
import { ConfirmDialog } from '@/components/ui/Feedback';
import { useAuth } from '@/features/auth/auth-context';
import type { UserRole } from '@/features/auth/api';
import {
  ACCOUNT_STATUS_META,
  ADMIN_ROLE_LABELS,
  ADMIN_ROLE_SHORT,
  AUDIT_DECISION_META,
  formatActionLabel,
  formatCapabilityLabel,
  formatScopeLabel,
  formatVnDateTime,
  isTestFixtureEmail,
  redactSensitiveText,
  sanitizeAccountDisplayName,
  type AdminAccountDirectoryResponse,
  type AdminAccountItem,
} from '@/features/workspace/admin-presentation';
import {
  workspaceApi,
  type AuthorityOverview,
  type Grant,
  type RoleDecision,
} from '@/features/workspace/api';
import { apiFetch, ApiError } from '@/lib/api-client';

type SystemAuditResponse = {
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

const STAFF_CREATE_ROLES = [
  'INSTRUCTOR',
  'COUNSELOR',
  'CASHIER',
  'TEACHING_INSPECTOR',
] as const;

const RBAC_TARGET_ROLES: UserRole[] = [
  'INSTRUCTOR',
  'COUNSELOR',
  'ACADEMIC_MANAGER',
  'CASHIER',
  'TEACHING_INSPECTOR',
  'SYSTEM_ADMIN',
];

const ALL_ROLE_FILTER_OPTIONS: UserRole[] = [
  'STUDENT',
  'INSTRUCTOR',
  'COUNSELOR',
  'ACADEMIC_MANAGER',
  'CASHIER',
  'TEACHING_INSPECTOR',
  'SYSTEM_ADMIN',
  'ADMIN_COORDINATOR',
];

const RECOVERY_REVOKE_ELIGIBLE_ROLES = new Set<string>([
  'INSTRUCTOR',
  'ACADEMIC_MANAGER',
  'TEACHING_INSPECTOR',
  'ADMIN_COORDINATOR',
]);

const GRANT_CAPABILITIES = [
  'class.read',
  'authority.approve',
  'assessment.recovery.approve',
  'academic.schedule.approve',
  'academic.admission.approve',
  'academic.meeting.approve',
  'academic.attendance.approve',
  'consultation.link.approve',
  'finance.verify',
  'finance.adjust.approve',
  'support.ticket.read',
  'support.ticket.assign',
  'support.ticket.reply',
  'support.ticket.close',
  'support.ticket.transfer',
  'support.referral.respond',
  'support.taxonomy.author',
  'support.taxonomy.approve',
  'inspection.assign',
  'inspection.hours.review',
  'shift.review',
] as const;

const GRANTS_PAGE_SIZE = 12;

const controlClass =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#5f8b48] focus:outline-none focus:ring-2 focus:ring-[#dce8d4]';

export function AuthorityPage() {
  const { user } = useAuth();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab: 'accounts' | 'rbac' =
    searchParams.get('tab') === 'rbac' || location.hash === '#rbac' ? 'rbac' : 'accounts';
  const setAuthorityTab = (next: 'accounts' | 'rbac') => {
    setSearchParams(next === 'rbac' ? { tab: 'rbac' } : {}, { replace: true });
  };

  // Directory filters
  const [searchInput, setSearchInput] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [showFixtures, setShowFixtures] = useState(false);
  const [page, setPage] = useState(1);

  // Grants table filters & pagination
  const [grantSearch, setGrantSearch] = useState('');
  const [grantStatusFilter, setGrantStatusFilter] = useState<
    'ALL' | 'ACTIVE' | 'PENDING' | 'INACTIVE'
  >('ALL');
  const [grantPage, setGrantPage] = useState(1);

  // Loaded data
  const [directory, setDirectory] = useState<AdminAccountDirectoryResponse | null>(null);
  const [allKnownAccounts, setAllKnownAccounts] = useState<AdminAccountItem[]>([]);
  const [authority, setAuthority] = useState<AuthorityOverview>({
    grants: [],
    roles: [],
    audit: [],
  });
  const [recentEvents, setRecentEvents] = useState<SystemAuditResponse['events']>([]);
  const [approvedTopics, setApprovedTopics] = useState<
    Array<{ id: string; code: string; title: string }>
  >([]);
  const [canApprove, setCanApprove] = useState(false);

  // Selected account & detail
  const [selectedId, setSelectedId] = useState<string>('');
  const [selectedDetail, setSelectedDetail] = useState<AdminAccountItem | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Create staff form
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createFullName, setCreateFullName] = useState('');
  const [createEmail, setCreateEmail] = useState('');
  const [createPassword, setCreatePassword] = useState('');
  const [createRole, setCreateRole] =
    useState<(typeof STAFF_CREATE_ROLES)[number]>('INSTRUCTOR');

  // Selected account governance forms
  const [actionReason, setActionReason] = useState('');
  const [proposeNextRole, setProposeNextRole] = useState<UserRole>('COUNSELOR');
  const [grantCapability, setGrantCapability] = useState<string>('class.read');
  const [grantScopeType, setGrantScopeType] = useState<
    'GLOBAL' | 'CLASS' | 'COURSE' | 'SUPPORT_TOPIC' | 'TEACHER'
  >('GLOBAL');
  const [grantScopeId, setGrantScopeId] = useState('');
  const [grantExpiresAt, setGrantExpiresAt] = useState(() =>
    new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 16),
  );
  const [grantReason, setGrantReason] = useState('');

  // Feedback & modal
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [noticeMsg, setNoticeMsg] = useState('');
  const [confirmState, setConfirmState] = useState<{
    title: string;
    description: string;
    confirmLabel: string;
    onConfirm: () => Promise<void>;
  } | null>(null);

  const loadDirectory = useCallback(async () => {
    const params = new URLSearchParams();
    params.set('limit', '50');
    params.set('page', String(page));
    if (!showFixtures) params.set('excludeTest', 'true');
    if (appliedSearch.trim()) params.set('search', appliedSearch.trim());
    if (roleFilter !== 'ALL') params.set('role', roleFilter);
    if (statusFilter !== 'ALL') params.set('status', statusFilter);

    const dir = await apiFetch<AdminAccountDirectoryResponse>(
      `/admin/accounts?${params.toString()}`,
    );
    setDirectory(dir);
    return dir;
  }, [appliedSearch, page, roleFilter, showFixtures, statusFilter]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const [dirRes, knownRes, authRes, meRes, auditRes, topicRes] = await Promise.allSettled([
        loadDirectory(),
        apiFetch<AdminAccountDirectoryResponse>('/admin/accounts?limit=100'),
        workspaceApi.authority(),
        workspaceApi.me(),
        apiFetch<SystemAuditResponse>('/v2/operations/system-audit?limit=40'),
        apiFetch<{ topics: Array<{ id: string; code: string; title: string }> }>(
          '/v2/support/public/topics',
        ),
      ]);

      if (dirRes.status === 'fulfilled') {
        const list = Array.isArray(dirRes.value?.data) ? dirRes.value.data : [];
        setSelectedId((prev) => {
          if (prev && list.some((a) => a.id === prev)) return prev;
          return list[0]?.id ?? '';
        });
      } else {
        setErrorMsg('Không thể tải danh sách tài khoản từ hệ thống.');
      }

      if (knownRes.status === 'fulfilled') {
        setAllKnownAccounts(knownRes.value.data);
      }

      if (authRes.status === 'fulfilled') {
        setAuthority(authRes.value);
      }

      if (meRes.status === 'fulfilled') {
        setCanApprove(Boolean(meRes.value.capabilities.authorityApprove));
      }

      if (auditRes.status === 'fulfilled') {
        setRecentEvents(auditRes.value.events);
      }

      if (topicRes.status === 'fulfilled') {
        setApprovedTopics(topicRes.value.topics ?? []);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Lỗi tải dữ liệu tài khoản.');
    } finally {
      setLoading(false);
    }
  }, [loadDirectory]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const loadAccountDetail = useCallback(async (userId: string) => {
    if (!userId) {
      setSelectedDetail(null);
      return;
    }
    setDetailLoading(true);
    try {
      const detail = await apiFetch<AdminAccountItem>(
        `/admin/accounts/${encodeURIComponent(userId)}`,
      );
      setSelectedDetail(detail);
      if (detail.role !== 'STUDENT') {
        const candidate = RBAC_TARGET_ROLES.find((r) => r !== detail.role) ?? 'INSTRUCTOR';
        setProposeNextRole(candidate);
      }
    } catch {
      setSelectedDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAccountDetail(selectedId);
  }, [selectedId, loadAccountDetail]);

  const accountLookup = useMemo(() => {
    const map = new Map<string, AdminAccountItem>();
    for (const acc of allKnownAccounts) map.set(acc.id, acc);
    for (const acc of directory?.data ?? []) map.set(acc.id, acc);
    return map;
  }, [allKnownAccounts, directory]);

  const topicTitleMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of approvedTopics) map.set(t.code, t.title);
    return map;
  }, [approvedTopics]);

  const visibleTopics = useMemo(
    () =>
      showFixtures
        ? approvedTopics
        : approvedTopics.filter((t) => !/synthetic/i.test(t.code)),
    [approvedTopics, showFixtures],
  );

  const displayAccountRef = useCallback(
    (id?: string | null) => {
      if (!id) return 'Chưa có';
      const found = accountLookup.get(id);
      if (!found) return 'Tài khoản hệ thống';
      return `${sanitizeAccountDisplayName(found.fullName)} (${found.email})`;
    },
    [accountLookup],
  );

  const pendingRoles = useMemo(
    () => authority.roles.filter((r) => !r.approvedBy),
    [authority.roles],
  );
  const pendingGrants = useMemo(
    () => authority.grants.filter((g) => !g.approvedBy && !g.revokedAt),
    [authority.grants],
  );

  const filteredGrants = useMemo(() => {
    const kw = grantSearch.trim().toLowerCase();
    const nowMs = Date.now();
    return authority.grants.filter((g) => {
      const acc = accountLookup.get(g.userId);
      if (!showFixtures && (isTestFixtureEmail(acc?.email) || g.scopeId === 'SYNTHETIC_DEMO_STUDY')) {
        return false;
      }
      const isExpired =
        Boolean(g.approvedBy) && !g.revokedAt && new Date(g.expiresAt).getTime() <= nowMs;
      const isActive = Boolean(g.approvedBy) && !g.revokedAt && !isExpired;
      const isPending = !g.approvedBy && !g.revokedAt;

      if (grantStatusFilter === 'ACTIVE' && !isActive) return false;
      if (grantStatusFilter === 'PENDING' && !isPending) return false;
      if (grantStatusFilter === 'INACTIVE' && (isActive || isPending)) return false;

      if (kw) {
        const capText = formatCapabilityLabel(g.capability).toLowerCase();
        const hay = [
          acc?.fullName ?? '',
          acc?.email ?? '',
          g.capability,
          capText,
          g.scopeType,
          g.scopeId ?? '',
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      return true;
    });
  }, [accountLookup, authority.grants, grantSearch, grantStatusFilter, showFixtures]);

  const grantTotalPages = Math.max(1, Math.ceil(filteredGrants.length / GRANTS_PAGE_SIZE));
  const safeGrantPage = Math.min(grantPage, grantTotalPages);
  const visibleGrants = useMemo(
    () =>
      filteredGrants.slice(
        (safeGrantPage - 1) * GRANTS_PAGE_SIZE,
        safeGrantPage * GRANTS_PAGE_SIZE,
      ),
    [filteredGrants, safeGrantPage],
  );

  const selectedAccountEvents = useMemo(() => {
    if (!selectedId) return [];
    return recentEvents
      .filter((ev) => ev.actorId === selectedId || ev.objectId === selectedId)
      .slice(0, 8);
  }, [recentEvents, selectedId]);

  const selectedAccountGrants = useMemo(() => {
    if (!selectedId) return [];
    return authority.grants.filter((g) => g.userId === selectedId);
  }, [authority.grants, selectedId]);

  const selectedAccountRoleHistory = useMemo(() => {
    if (!selectedId) return [];
    return authority.roles.filter((r) => r.userId === selectedId);
  }, [authority.roles, selectedId]);

  const handleSearchSubmit = (event: FormEvent) => {
    event.preventDefault();
    setPage(1);
    setAppliedSearch(searchInput.trim());
  };

  const resetFilters = () => {
    setSearchInput('');
    setAppliedSearch('');
    setRoleFilter('ALL');
    setStatusFilter('ALL');
    setPage(1);
  };

  const runMutation = async (fn: () => Promise<void>, successMessage: string) => {
    setBusy(true);
    setErrorMsg('');
    setNoticeMsg('');
    try {
      await fn();
      setNoticeMsg(successMessage);
      await loadAll();
      if (selectedId) {
        await loadAccountDetail(selectedId);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMsg(err.message);
      } else if (err instanceof Error) {
        setErrorMsg(err.message);
      } else {
        setErrorMsg('Không thể thực hiện thao tác quản trị lúc này.');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleCreateAccount = async (event: FormEvent) => {
    event.preventDefault();
    const trimmedName = createFullName.trim();
    const trimmedEmail = createEmail.trim().toLowerCase();
    const pwd = createPassword;
    setCreatePassword('');
    if (!trimmedName || !trimmedEmail || pwd.length < 8) {
      setErrorMsg('Vui lòng nhập họ tên, email hợp lệ và mật khẩu tối thiểu 8 ký tự.');
      return;
    }

    setBusy(true);
    setErrorMsg('');
    setNoticeMsg('');
    try {
      const created = await apiFetch<AdminAccountItem>('/admin/accounts', {
        method: 'POST',
        body: JSON.stringify({
          fullName: trimmedName,
          email: trimmedEmail,
          password: pwd,
          role: createRole,
        }),
      });
      setCreateFullName('');
      setCreateEmail('');
      setShowCreateForm(false);
      setSearchInput(created.email);
      setAppliedSearch(created.email);
      setRoleFilter('ALL');
      setStatusFilter('ALL');
      setPage(1);
      setSelectedId(created.id);
      setNoticeMsg(
        `Đã khởi tạo tài khoản nhân sự ${created.email} (${ADMIN_ROLE_SHORT[created.role] ?? created.role}) và ghi nhận nhật ký kiểm toán.`,
      );
      await loadAll();
      await loadAccountDetail(created.id);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Không thể khởi tạo tài khoản nhân sự.',
      );
    } finally {
      setBusy(false);
    }
  };

  const handleStatusChange = (nextStatus: 'ACTIVE' | 'LOCKED' | 'INACTIVE') => {
    if (!selectedDetail) return;
    const reason = actionReason.trim();
    if (reason.length < 10) {
      setErrorMsg(
        'Vui lòng nhập lý do thao tác từ 10 đến 500 ký tự để lưu vết kiểm toán hệ thống.',
      );
      return;
    }
    const statusLabel = ACCOUNT_STATUS_META[nextStatus]?.label ?? nextStatus;
    setConfirmState({
      title: `Chuyển trạng thái tài khoản sang "${statusLabel}"?`,
      description:
        nextStatus === 'LOCKED'
          ? `Tài khoản ${selectedDetail.email} sẽ bị khóa đăng nhập và thu hồi phiên hiện hành. Toàn bộ lịch sử học tập, bài nộp, điểm số, học phí và phê duyệt vẫn được bảo toàn nguyên vẹn.`
          : `Tài khoản ${selectedDetail.email} sẽ chuyển sang trạng thái ${statusLabel} và ghi nhận vào nhật ký hệ thống.`,
      confirmLabel: `Xác nhận ${statusLabel}`,
      onConfirm: async () => {
        await runMutation(
          async () => {
            await apiFetch(`/admin/accounts/${encodeURIComponent(selectedDetail.id)}/status`, {
              method: 'PATCH',
              body: JSON.stringify({ status: nextStatus, reason }),
            });
            setActionReason('');
          },
          `Đã cập nhật trạng thái tài khoản ${selectedDetail.email} thành ${statusLabel} (giữ nguyên toàn bộ lịch sử dữ liệu).`,
        );
      },
    });
  };

  const handleProposeRole = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedDetail) return;
    const reason = actionReason.trim();
    if (reason.length < 10) {
      setErrorMsg('Lý do đề xuất đổi vai trò phải từ 10 đến 500 ký tự.');
      return;
    }
    await runMutation(
      async () => {
        await workspaceApi.action('roles', {
          userId: selectedDetail.id,
          nextRole: proposeNextRole,
          reason,
        });
        setActionReason('');
      },
      `Đã tạo đề xuất đổi vai trò cho ${selectedDetail.email} sang ${ADMIN_ROLE_SHORT[proposeNextRole] ?? proposeNextRole} (chờ phê duyệt độc lập).`,
    );
  };

  const handleProposeGrant = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedDetail) return;
    const reason = grantReason.trim();
    if (reason.length < 10) {
      setErrorMsg('Lý do cấp quyền bổ sung phải từ 10 đến 500 ký tự.');
      return;
    }
    if (grantScopeType !== 'GLOBAL' && !grantScopeId.trim()) {
      setErrorMsg('Vui lòng nhập mã đối tượng phạm vi hợp lệ.');
      return;
    }
    await runMutation(
      async () => {
        await workspaceApi.action('grants', {
          userId: selectedDetail.id,
          capability: grantCapability,
          scopeType: grantScopeType,
          ...(grantScopeType !== 'GLOBAL' ? { scopeId: grantScopeId.trim() } : {}),
          effectiveAt: new Date().toISOString(),
          expiresAt: new Date(grantExpiresAt).toISOString(),
          reason,
        });
        setGrantReason('');
        setGrantScopeId('');
      },
      `Đã gửi đề xuất quyền "${formatCapabilityLabel(grantCapability)}" cho ${selectedDetail.email} (chờ người duyệt độc lập).`,
    );
  };

  const handleRevokeRecovery = () => {
    if (!selectedDetail) return;
    const reason = actionReason.trim();
    if (reason.length < 10) {
      setErrorMsg('Vui lòng nhập lý do thu hồi quyền mở lại bài (10–500 ký tự).');
      return;
    }
    setConfirmState({
      title: `Thu hồi toàn bộ quyền mở lại bài của ${selectedDetail.email}?`,
      description:
        'Hành động này thu hồi các quyền mở lại bài kiểm tra đang hiệu lực và đăng xuất phiên hiện hành của tài khoản.',
      confirmLabel: 'Xác nhận thu hồi',
      onConfirm: async () => {
        await runMutation(
          async () => {
            await workspaceApi.action(
              `recovery-permissions/${encodeURIComponent(selectedDetail.id)}/revoke`,
              { reason },
            );
            setActionReason('');
          },
          `Đã thu hồi quyền mở lại bài kiểm tra của ${selectedDetail.email}.`,
        );
      },
    });
  };

  const handleApproveRole = (decision: RoleDecision) => {
    setConfirmState({
      title: 'Phê duyệt đề xuất chuyển vai trò?',
      description: `Tài khoản ${displayAccountRef(decision.userId)} sẽ chuyển từ ${ADMIN_ROLE_LABELS[decision.previousRole] ?? decision.previousRole} sang ${ADMIN_ROLE_LABELS[decision.nextRole] ?? decision.nextRole} và thu hồi phiên đăng nhập hiện hành.`,
      confirmLabel: 'Phê duyệt vai trò',
      onConfirm: async () => {
        await runMutation(async () => {
          await workspaceApi.action(`roles/${encodeURIComponent(decision.id)}/approve`);
        }, 'Đã phê duyệt thay đổi vai trò và ghi nhận kiểm toán.');
      },
    });
  };

  const handleApproveGrant = (grant: Grant) => {
    setConfirmState({
      title: 'Phê duyệt quyền bổ sung có thời hạn?',
      description: `Cấp quyền "${formatCapabilityLabel(grant.capability)}" (${formatScopeLabel(grant.scopeType, grant.scopeId, topicTitleMap)}) cho ${displayAccountRef(grant.userId)}.`,
      confirmLabel: 'Phê duyệt quyền',
      onConfirm: async () => {
        await runMutation(async () => {
          await workspaceApi.action(`grants/${encodeURIComponent(grant.id)}/approve`);
        }, `Đã phê duyệt quyền "${formatCapabilityLabel(grant.capability)}".`);
      },
    });
  };

  const handleRevokeGrant = (grant: Grant) => {
    const reason =
      actionReason.trim() || 'Thu hồi quyền bổ sung theo rà soát định kỳ của quản trị viên';
    setConfirmState({
      title: 'Thu hồi quyền bổ sung?',
      description: `Thu hồi quyền "${formatCapabilityLabel(grant.capability)}" của ${displayAccountRef(grant.userId)}. Lý do ghi nhận: "${reason}".`,
      confirmLabel: 'Thu hồi quyền',
      onConfirm: async () => {
        await runMutation(async () => {
          await workspaceApi.action(`grants/${encodeURIComponent(grant.id)}/revoke`, { reason });
        }, `Đã thu hồi quyền "${formatCapabilityLabel(grant.capability)}".`);
      },
    });
  };

  const accounts = directory?.data ?? [];
  const totalPages = directory?.meta?.totalPages ?? 1;
  const isSelfSelected = Boolean(selectedDetail && user && selectedDetail.id === user.id);
  const excludedCount = directory?.summary?.excludedFixtures ?? 0;

  return (
    <div className="mx-auto min-w-0 max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      {/* Breadcrumb & Header */}
      <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
          <Link
            to="/workspace"
            className="inline-flex items-center gap-1.5 font-semibold text-[#51743e] hover:underline"
          >
            <ArrowLeft size={14} aria-hidden="true" />
            Tổng quan quản trị
          </Link>
          <span className="text-slate-400">/ Quản lý tài khoản &amp; Phân quyền</span>
        </div>

        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full border border-[#dce8d4] bg-[#f4f8f1] px-2.5 py-0.5 text-xs font-semibold text-[#51743e]">
                <ShieldCheck size={13} aria-hidden="true" />
                Quản lý tài khoản &amp; Phân quyền độc lập
              </span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                {canApprove
                  ? 'Quyền phê duyệt phân quyền: Đã kích hoạt'
                  : 'Chế độ quản trị danh bạ & đề xuất (cần duyệt độc lập)'}
              </span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Quản lý tài khoản người dùng
            </h1>
            <p className="max-w-3xl text-sm text-slate-600">
              Tra cứu danh bạ tài khoản, lọc theo vai trò và trạng thái, xem chi tiết phân công &amp;
              lịch sử, khởi tạo tài khoản nhân sự và thực hiện khóa/kích hoạt/phân quyền theo đúng
              chính sách kiểm soát truy cập.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => setShowCreateForm((v) => !v)}
              className="inline-flex items-center gap-2 rounded-lg bg-[#5f8b48] px-4 py-2 text-sm font-semibold text-white hover:bg-[#51773d]"
            >
              <UserPlus size={15} aria-hidden="true" />
              {showCreateForm ? 'Đóng form tạo tài khoản' : 'Tạo tài khoản nhân sự'}
            </button>
            <button
              type="button"
              onClick={() => void loadAll()}
              disabled={loading || busy}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} aria-hidden="true" />
              Tải lại
            </button>
            <Link
              to="/workspace/operations"
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Activity size={15} aria-hidden="true" />
              Xem nhật ký hệ thống
            </Link>
          </div>
        </div>

        {/* Summary KPI Strip */}
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="rounded-lg border border-slate-200 bg-slate-50/70 px-3.5 py-2.5">
            <p className="text-[11px] font-semibold uppercase text-slate-500">Tổng tài khoản</p>
            <p className="mt-0.5 text-xl font-bold text-slate-900">
              {directory?.summary?.total ?? accounts.length}
            </p>
          </div>
          <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 px-3.5 py-2.5">
            <p className="text-[11px] font-semibold uppercase text-emerald-700">Đang hoạt động</p>
            <p className="mt-0.5 text-xl font-bold text-emerald-800">
              {directory?.summary?.active ?? '—'}
            </p>
          </div>
          <div className="rounded-lg border border-rose-200 bg-rose-50/50 px-3.5 py-2.5">
            <p className="text-[11px] font-semibold uppercase text-rose-700">Đã khóa</p>
            <p className="mt-0.5 text-xl font-bold text-rose-800">
              {directory?.summary?.locked ?? '—'}
            </p>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50/50 px-3.5 py-2.5">
            <p className="text-[11px] font-semibold uppercase text-amber-800">Ngưng hoạt động</p>
            <p className="mt-0.5 text-xl font-bold text-amber-900">
              {directory?.summary?.inactive ?? '—'}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50/70 px-3.5 py-2.5">
            <p className="text-[11px] font-semibold uppercase text-slate-500">Hồ sơ chờ duyệt</p>
            <p className="mt-0.5 text-xl font-bold text-slate-900">
              {pendingRoles.length + pendingGrants.length}
            </p>
          </div>
        </div>
      </section>

      {errorMsg && (
        <div
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800"
        >
          {errorMsg}
        </div>
      )}
      {noticeMsg && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800"
        >
          <CheckCircle2 size={16} aria-hidden="true" />
          <span>{noticeMsg}</span>
        </div>
      )}

      {/* Create Staff Account Panel */}
      {showCreateForm && (
        <section className="rounded-xl border border-[#c7dcba] bg-[#f8fbf6] p-5 shadow-xs">
          <h2 className="text-base font-bold text-slate-900">Khởi tạo tài khoản nhân sự mới</h2>
          <p className="mt-1 text-xs text-slate-600">
            Chỉ khởi tạo được tài khoản nghiệp vụ cơ bản (Giảng viên, Tư vấn viên, Thu ngân, Thanh tra).
            Vai trò quản trị/học vụ cấp cao phải đi qua quy trình Đề xuất &amp; Phê duyệt vai trò độc
            lập. Mật khẩu ban đầu chỉ truyền một lần khi tạo và không hiển thị lại.
          </p>
          <form onSubmit={handleCreateAccount} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <label htmlFor="create-staff-name" className="text-xs font-semibold text-slate-700">
              Họ và tên
              <input
                id="create-staff-name"
                name="fullName"
                type="text"
                required
                className={`${controlClass} mt-1`}
                placeholder="Nguyễn Văn A"
                value={createFullName}
                onChange={(e) => setCreateFullName(e.target.value)}
              />
            </label>
            <label htmlFor="create-staff-email" className="text-xs font-semibold text-slate-700">
              Email đăng nhập
              <input
                id="create-staff-email"
                name="email"
                type="email"
                required
                className={`${controlClass} mt-1`}
                placeholder="nhanvien@smartenglish.edu.vn"
                value={createEmail}
                onChange={(e) => setCreateEmail(e.target.value)}
              />
            </label>
            <label htmlFor="create-staff-password" className="text-xs font-semibold text-slate-700">
              Mật khẩu khởi tạo (≥ 8 ký tự)
              <input
                id="create-staff-password"
                name="password"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                className={`${controlClass} mt-1`}
                placeholder="••••••••"
                value={createPassword}
                onChange={(e) => setCreatePassword(e.target.value)}
              />
            </label>
            <label htmlFor="create-staff-role" className="text-xs font-semibold text-slate-700">
              Vai trò nhân sự
              <select
                id="create-staff-role"
                name="role"
                className={`${controlClass} mt-1`}
                value={createRole}
                onChange={(e) =>
                  setCreateRole(e.target.value as (typeof STAFF_CREATE_ROLES)[number])
                }
              >
                {STAFF_CREATE_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ADMIN_ROLE_LABELS[r] ?? r}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-end">
              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-lg bg-[#5f8b48] px-4 py-2 text-sm font-semibold text-white hover:bg-[#51773d] disabled:opacity-60"
              >
                Tạo tài khoản
              </button>
            </div>
          </form>
        </section>
      )}

      {/* Workspace Tab Strip */}
      <nav aria-label="Phân khu quản trị tài khoản" className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
        <button
          type="button"
          onClick={() => setAuthorityTab('accounts')}
          className={`rounded-lg px-3.5 py-2 text-xs font-semibold transition ${
            activeTab === 'accounts'
              ? 'bg-[#76a35e] text-white'
              : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
          }`}
        >
          Danh bạ tài khoản &amp; Cấp quyền ({directory?.meta?.total ?? accounts.length})
        </button>
        <button
          type="button"
          onClick={() => setAuthorityTab('rbac')}
          className={`rounded-lg px-3.5 py-2 text-xs font-semibold transition ${
            activeTab === 'rbac'
              ? 'bg-[#76a35e] text-white'
              : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
          }`}
        >
          Hàng đợi duyệt vai trò &amp; quyền ({pendingRoles.length + pendingGrants.length})
        </button>
      </nav>

      {/* Main Master-Detail Workspace */}
      {activeTab === 'accounts' && (
      <div className="grid min-w-0 gap-6 lg:grid-cols-12">
        {/* Left: Account Directory */}
        <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-5 shadow-xs lg:col-span-7">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <Users size={18} className="text-[#5f8b48]" aria-hidden="true" />
              <h2 className="text-lg font-bold text-slate-900">Danh sách tài khoản</h2>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowFixtures((v) => !v);
                  setPage(1);
                }}
                className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition ${
                  showFixtures
                    ? 'border-amber-300 bg-amber-50 text-amber-900'
                    : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                }`}
              >
                {showFixtures
                  ? 'Đang hiện tài khoản kiểm thử'
                  : `Hiện tài khoản kiểm thử${excludedCount > 0 ? ` (${excludedCount})` : ''}`}
              </button>
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
                Hiển thị {accounts.length} / {directory?.meta?.total ?? accounts.length} kết quả
              </span>
            </div>
          </div>

          {/* Search & Filters */}
          <form onSubmit={handleSearchSubmit} className="mt-4 grid gap-2.5 sm:grid-cols-12">
            <div className="sm:col-span-4">
              <label className="sr-only" htmlFor="account-search-input">
                Tìm kiếm theo tên hoặc email
              </label>
              <div className="relative">
                <Search
                  size={15}
                  className="pointer-events-none absolute top-2.5 left-3 text-slate-400"
                  aria-hidden="true"
                />
                <input
                  id="account-search-input"
                  name="accountSearch"
                  type="search"
                  className={`${controlClass} pl-9`}
                  placeholder="Tìm họ tên hoặc email..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                />
              </div>
            </div>
            <div className="sm:col-span-3">
              <label className="sr-only" htmlFor="account-role-filter">
                Lọc theo vai trò
              </label>
              <select
                id="account-role-filter"
                name="roleFilter"
                aria-label="Lọc theo vai trò"
                className={controlClass}
                value={roleFilter}
                onChange={(e) => {
                  setRoleFilter(e.target.value);
                  setPage(1);
                }}
              >
                <option value="ALL">Tất cả vai trò</option>
                {ALL_ROLE_FILTER_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    {ADMIN_ROLE_SHORT[r] ?? r}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-3">
              <label className="sr-only" htmlFor="account-status-filter">
                Lọc theo trạng thái
              </label>
              <select
                id="account-status-filter"
                name="statusFilter"
                aria-label="Lọc theo trạng thái"
                className={controlClass}
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(1);
                }}
              >
                <option value="ALL">Mọi trạng thái</option>
                <option value="ACTIVE">Đang hoạt động</option>
                <option value="LOCKED">Đã khóa</option>
                <option value="INACTIVE">Ngưng hoạt động</option>
              </select>
            </div>
            <div className="flex gap-1.5 sm:col-span-2">
              <button
                type="submit"
                className="flex-1 whitespace-nowrap rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"
              >
                Tìm
              </button>
              {(appliedSearch || roleFilter !== 'ALL' || statusFilter !== 'ALL') && (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="whitespace-nowrap rounded-lg border border-slate-300 px-2.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Xóa lọc
                </button>
              )}
            </div>
          </form>

          {/* Table */}
          <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-[11px] uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2.5 font-semibold">Họ tên &amp; Email</th>
                  <th className="whitespace-nowrap px-3 py-2.5 font-semibold">Vai trò</th>
                  <th className="whitespace-nowrap px-3 py-2.5 font-semibold">Trạng thái</th>
                  <th className="whitespace-nowrap px-3 py-2.5 text-right font-semibold">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {!accounts.length ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-sm text-slate-500">
                      {loading
                        ? 'Đang tải danh sách tài khoản...'
                        : 'Không tìm thấy tài khoản phù hợp với điều kiện lọc.'}
                    </td>
                  </tr>
                ) : (
                  accounts.map((acc) => {
                    const isSelected = acc.id === selectedId;
                    const stMeta = ACCOUNT_STATUS_META[acc.status] ?? {
                      label: acc.status,
                      badgeClass: 'border-slate-200 bg-slate-50 text-slate-700',
                    };
                    return (
                      <tr
                        key={acc.id}
                        className={isSelected ? 'bg-[#f4f8f1]/80' : 'hover:bg-slate-50/70'}
                      >
                        <td className="px-3 py-2.5">
                          <div className="font-semibold text-slate-900">
                            {sanitizeAccountDisplayName(acc.fullName)}
                          </div>
                          <div className="mt-0.5 font-mono text-[11px] text-slate-600">
                            {acc.email}
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5">
                          <span className="inline-flex whitespace-nowrap rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 font-medium text-slate-700">
                            {ADMIN_ROLE_SHORT[acc.role] ?? acc.role}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5">
                          <span
                            className={`inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 font-semibold ${stMeta.badgeClass}`}
                          >
                            {stMeta.label}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right">
                          <button
                            type="button"
                            onClick={() => setSelectedId(acc.id)}
                            className={`whitespace-nowrap rounded-lg px-2.5 py-1 font-semibold ${
                              isSelected
                                ? 'bg-[#5f8b48] text-white'
                                : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            {isSelected ? 'Đang xem' : 'Chi tiết'}
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="mt-3 flex items-center justify-between text-xs text-slate-600">
              <span>
                Trang {page} / {totalPages}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="rounded-md border border-slate-300 px-2.5 py-1 font-semibold disabled:opacity-40"
                >
                  Trang trước
                </button>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="rounded-md border border-slate-300 px-2.5 py-1 font-semibold disabled:opacity-40"
                >
                  Trang sau
                </button>
              </div>
            </div>
          )}
        </section>

        {/* Right: Sanitized Account Detail & Actions */}
        <aside className="min-w-0 rounded-xl border border-slate-200 bg-white p-5 shadow-xs lg:col-span-5">
          <div className="border-b border-slate-100 pb-3">
            <h2 className="text-lg font-bold text-slate-900">Chi tiết tài khoản &amp; Thao tác</h2>
            <p className="text-xs text-slate-500">
              Thông tin xác thực (mật khẩu, khóa bí mật, mã băm) không bao giờ được xuất ra giao diện.
            </p>
          </div>

          {detailLoading ? (
            <p className="py-8 text-center text-sm text-slate-500">
              Đang tải hồ sơ tài khoản...
            </p>
          ) : !selectedDetail ? (
            <p className="py-8 text-center text-sm text-slate-500">
              Chọn một tài khoản trong danh sách để xem chi tiết và thao tác.
            </p>
          ) : (
            <div className="mt-4 space-y-5">
              {/* Identity card */}
              <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-4 text-xs">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">
                      {sanitizeAccountDisplayName(selectedDetail.fullName)}
                    </h3>
                    <p className="mt-0.5 font-mono text-xs text-slate-700">
                      {selectedDetail.email}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
                      (ACCOUNT_STATUS_META[selectedDetail.status] ?? {
                        badgeClass: 'border-slate-200 bg-white text-slate-700',
                      }).badgeClass
                    }`}
                  >
                    {ACCOUNT_STATUS_META[selectedDetail.status]?.label ?? selectedDetail.status}
                  </span>
                </div>

                <dl className="mt-3 grid min-w-0 grid-cols-2 gap-x-3 gap-y-2 border-t border-slate-200 pt-3">
                  <div className="min-w-0">
                    <dt className="text-slate-500">Vai trò hiện tại</dt>
                    <dd className="break-words font-semibold text-slate-900">
                      {ADMIN_ROLE_LABELS[selectedDetail.role] ?? selectedDetail.role}
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-slate-500">Mã định danh</dt>
                    <dd className="truncate font-mono text-slate-700" title={selectedDetail.id}>
                      {selectedDetail.id}
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-slate-500">Ngày tạo</dt>
                    <dd className="text-slate-800">{formatVnDateTime(selectedDetail.createdAt)}</dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-slate-500">Cập nhật gần nhất</dt>
                    <dd className="text-slate-800">{formatVnDateTime(selectedDetail.updatedAt)}</dd>
                  </div>
                </dl>

                {/* Dependency & History Preservation */}
                {selectedDetail.context && (
                  <div className="mt-3 grid grid-cols-3 gap-2 border-t border-slate-200 pt-3 text-center">
                    <div className="rounded bg-white p-2 ring-1 ring-slate-200">
                      <div className="text-[11px] text-slate-500">Lớp vận hành</div>
                      <div className="text-sm font-bold text-slate-900">
                        {selectedDetail.context.operationalClassAssignments}
                      </div>
                    </div>
                    <div className="rounded bg-white p-2 ring-1 ring-slate-200">
                      <div className="text-[11px] text-slate-500">Phân công lớp</div>
                      <div className="text-sm font-bold text-slate-900">
                        {selectedDetail.context.totalClassAssignments}
                      </div>
                    </div>
                    <div className="rounded bg-white p-2 ring-1 ring-slate-200">
                      <div className="text-[11px] text-slate-500">Lượt ghi danh</div>
                      <div className="text-sm font-bold text-slate-900">
                        {selectedDetail.context.enrollmentCount}
                      </div>
                    </div>
                  </div>
                )}

                <p className="mt-3 flex items-start gap-1.5 rounded bg-white px-2.5 py-2 text-[11px] text-slate-600 ring-1 ring-slate-200">
                  <Lock size={13} className="mt-0.5 shrink-0 text-[#5f8b48]" aria-hidden="true" />
                  <span>
                    Khóa hoặc ngưng hoạt động giữ nguyên toàn bộ lịch sử học tập, thanh toán, bài nộp và phê duyệt; đặt lại mật khẩu thực hiện qua luồng Quên mật khẩu bảo mật.
                  </span>
                </p>
              </div>

              {/* Status & Role Controls */}
              <div className="space-y-3 rounded-lg border border-slate-200 p-4">
                <h4 className="flex items-center gap-1.5 text-sm font-bold text-slate-900">
                  <UserCheck size={15} className="text-[#5f8b48]" aria-hidden="true" />
                  Quản trị trạng thái &amp; Đề xuất vai trò
                </h4>

                {isSelfSelected ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                    <strong>Giới hạn tự thao tác (Kiểm soát độc lập):</strong> Quản trị viên không
                    thể tự khóa tài khoản, đổi trạng thái hoặc tự thay đổi vai trò của chính mình.
                  </div>
                ) : (
                  <>
                    <label
                      htmlFor="account-action-reason"
                      className="block text-xs font-semibold text-slate-700"
                    >
                      Lý do thao tác (bắt buộc 10–500 ký tự để lưu vết kiểm toán)
                      <textarea
                        id="account-action-reason"
                        name="actionReason"
                        rows={2}
                        className={`${controlClass} mt-1`}
                        placeholder="Ví dụ: Tạm khóa tài khoản theo yêu cầu rà soát bảo mật..."
                        value={actionReason}
                        onChange={(e) => setActionReason(e.target.value)}
                      />
                    </label>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={busy || selectedDetail.status === 'ACTIVE'}
                        onClick={() => handleStatusChange('ACTIVE')}
                        className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        Kích hoạt lại
                      </button>
                      <button
                        type="button"
                        disabled={busy || selectedDetail.status === 'LOCKED'}
                        onClick={() => handleStatusChange('LOCKED')}
                        className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-800 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        Khóa tài khoản
                      </button>
                      <button
                        type="button"
                        disabled={busy || selectedDetail.status === 'INACTIVE'}
                        onClick={() => handleStatusChange('INACTIVE')}
                        className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        Ngưng hoạt động
                      </button>
                      {RECOVERY_REVOKE_ELIGIBLE_ROLES.has(selectedDetail.role) && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={handleRevokeRecovery}
                          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-45"
                        >
                          Thu hồi quyền mở lại bài
                        </button>
                      )}
                    </div>

                    {selectedDetail.role !== 'STUDENT' ? (
                      <form
                        onSubmit={handleProposeRole}
                        className="border-t border-slate-100 pt-3"
                      >
                        <label
                          htmlFor="propose-next-role"
                          className="block text-xs font-semibold text-slate-700"
                        >
                          Đề xuất chuyển vai trò nhân sự (cần người duyệt độc lập)
                        </label>
                        <div className="mt-1.5 flex gap-2">
                          <select
                            id="propose-next-role"
                            name="proposeNextRole"
                            aria-label="Chọn vai trò đề xuất"
                            className={controlClass}
                            value={proposeNextRole}
                            onChange={(e) => setProposeNextRole(e.target.value as UserRole)}
                          >
                            {RBAC_TARGET_ROLES.filter((r) => r !== selectedDetail.role).map((r) => (
                              <option key={r} value={r}>
                                {ADMIN_ROLE_LABELS[r] ?? r}
                              </option>
                            ))}
                          </select>
                          <button
                            type="submit"
                            disabled={busy}
                            className="shrink-0 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                          >
                            Đề xuất vai trò
                          </button>
                        </div>
                      </form>
                    ) : (
                      <p className="border-t border-slate-100 pt-2 text-[11px] text-slate-500">
                        Vai trò Học viên được cố định theo chính sách hệ thống, không chuyển đổi sang vai trò nhân sự.
                      </p>
                    )}
                  </>
                )}
              </div>

              {/* Propose Scoped Permission Grant */}
              {!isSelfSelected && selectedDetail.role !== 'STUDENT' && (
                <form
                  onSubmit={handleProposeGrant}
                  className="space-y-3 rounded-lg border border-slate-200 p-4"
                >
                  <h4 className="flex items-center gap-1.5 text-sm font-bold text-slate-900">
                    <KeyRound size={15} className="text-[#5f8b48]" aria-hidden="true" />
                    Đề xuất quyền bổ sung có thời hạn
                  </h4>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label
                      htmlFor="grant-capability-select"
                      className="text-xs font-semibold text-slate-700 sm:col-span-2"
                    >
                      Quyền nghiệp vụ bổ sung
                      <select
                        id="grant-capability-select"
                        name="grantCapability"
                        className={`${controlClass} mt-1`}
                        value={grantCapability}
                        onChange={(e) => setGrantCapability(e.target.value)}
                      >
                        {GRANT_CAPABILITIES.map((cap) => (
                          <option key={cap} value={cap}>
                            {formatCapabilityLabel(cap)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label
                      htmlFor="grant-scope-type"
                      className="text-xs font-semibold text-slate-700"
                    >
                      Loại phạm vi áp dụng
                      <select
                        id="grant-scope-type"
                        name="grantScopeType"
                        className={`${controlClass} mt-1`}
                        value={grantScopeType}
                        onChange={(e) =>
                          setGrantScopeType(
                            e.target.value as
                              | 'GLOBAL'
                              | 'CLASS'
                              | 'COURSE'
                              | 'SUPPORT_TOPIC'
                              | 'TEACHER',
                          )
                        }
                      >
                        <option value="GLOBAL">Toàn hệ thống</option>
                        <option value="CLASS">Theo lớp học cụ thể</option>
                        <option value="COURSE">Theo khóa học cụ thể</option>
                        <option value="TEACHER">Theo giảng viên</option>
                        <option value="SUPPORT_TOPIC">Theo chủ đề hỗ trợ</option>
                      </select>
                    </label>
                    <label
                      htmlFor="grant-expires-at"
                      className="text-xs font-semibold text-slate-700"
                    >
                      Hết hiệu lực (≤ 366 ngày)
                      <input
                        id="grant-expires-at"
                        name="grantExpiresAt"
                        type="datetime-local"
                        className={`${controlClass} mt-1`}
                        value={grantExpiresAt}
                        onChange={(e) => setGrantExpiresAt(e.target.value)}
                      />
                    </label>
                    {grantScopeType !== 'GLOBAL' && (
                      <div className="space-y-2 sm:col-span-2">
                        {grantScopeType === 'SUPPORT_TOPIC' && visibleTopics.length > 0 && (
                          <label
                            htmlFor="grant-topic-quick-select"
                            className="block text-xs font-semibold text-slate-700"
                          >
                            Chọn nhanh chủ đề hỗ trợ đã duyệt
                            <select
                              id="grant-topic-quick-select"
                              name="grantTopicQuickSelect"
                              className={`${controlClass} mt-1`}
                              value={
                                visibleTopics.some((tp) => tp.code === grantScopeId)
                                  ? grantScopeId
                                  : ''
                              }
                              onChange={(e) => {
                                if (e.target.value) setGrantScopeId(e.target.value);
                              }}
                            >
                              <option value="">-- Chọn hoặc nhập mã chủ đề bên dưới --</option>
                              {visibleTopics.map((tp) => (
                                <option key={tp.id} value={tp.code}>
                                  {tp.title} ({tp.code})
                                </option>
                              ))}
                            </select>
                          </label>
                        )}
                        <label
                          htmlFor="grant-scope-id"
                          className="block text-xs font-semibold text-slate-700"
                        >
                          Mã đối tượng phạm vi ({formatScopeLabel(grantScopeType)})
                          <input
                            id="grant-scope-id"
                            name="grantScopeId"
                            type="text"
                            className={`${controlClass} mt-1`}
                            placeholder={
                              grantScopeType === 'SUPPORT_TOPIC'
                                ? 'Nhập mã chủ đề hỗ trợ'
                                : 'Nhập mã UUID lớp học / khóa học / giảng viên'
                            }
                            value={grantScopeId}
                            onChange={(e) => setGrantScopeId(e.target.value)}
                          />
                        </label>
                      </div>
                    )}
                    <label
                      htmlFor="grant-reason-input"
                      className="text-xs font-semibold text-slate-700 sm:col-span-2"
                    >
                      Lý do cấp quyền (10–500 ký tự)
                      <input
                        id="grant-reason-input"
                        name="grantReason"
                        type="text"
                        className={`${controlClass} mt-1`}
                        placeholder="Nêu rõ mục đích nghiệp vụ và phạm vi giới hạn..."
                        value={grantReason}
                        onChange={(e) => setGrantReason(e.target.value)}
                      />
                    </label>
                  </div>
                  <button
                    type="submit"
                    disabled={busy}
                    className="rounded-lg border border-[#5f8b48] bg-[#f4f8f1] px-3 py-1.5 text-xs font-semibold text-[#3f5e2f] hover:bg-[#eaf2e4] disabled:opacity-50"
                  >
                    Gửi đề xuất cấp quyền
                  </button>
                </form>
              )}

              {/* Account Grants, Role Decisions & Audit Summary */}
              <div className="space-y-3 rounded-lg border border-slate-200 p-4 text-xs">
                <h4 className="font-bold text-slate-900">
                  Quyền bổ sung &amp; Vết kiểm toán của tài khoản này
                </h4>
                <p className="text-slate-600">
                  Quyền bổ sung: <strong>{selectedAccountGrants.length}</strong> · Quyết định vai
                  trò: <strong>{selectedAccountRoleHistory.length}</strong> · Nhật ký gần đây:{' '}
                  <strong>{selectedAccountEvents.length}</strong>
                </p>

                {selectedAccountGrants.length > 0 && (
                  <ul className="space-y-1.5">
                    {selectedAccountGrants.slice(0, 5).map((g) => (
                      <li
                        key={g.id}
                        className="flex items-center justify-between gap-2 rounded bg-slate-50 px-2.5 py-1.5"
                      >
                        <div className="min-w-0">
                          <div className="truncate font-semibold text-slate-800">
                            {formatCapabilityLabel(g.capability)}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {formatScopeLabel(g.scopeType, g.scopeId, topicTitleMap)}
                          </div>
                        </div>
                        <span className="shrink-0 whitespace-nowrap font-medium text-slate-600">
                          {g.revokedAt
                            ? 'Đã thu hồi'
                            : g.approvedBy
                              ? 'Đã duyệt'
                              : 'Chờ duyệt'}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}

                {selectedAccountEvents.length > 0 && (
                  <ul className="space-y-1.5 border-t border-slate-100 pt-2">
                    {selectedAccountEvents.slice(0, 4).map((ev) => {
                      const decMeta = AUDIT_DECISION_META[ev.decision];
                      return (
                        <li key={ev.id} className="rounded bg-slate-50 px-2.5 py-1.5">
                          <div className="flex items-center justify-between font-semibold text-slate-800">
                            <span>{formatActionLabel(ev.action)}</span>
                            <span className="text-[11px] font-normal text-slate-500">
                              {formatVnDateTime(ev.createdAt)}
                            </span>
                          </div>
                          <p className="mt-0.5 truncate text-[11px] text-slate-600">
                            {decMeta?.label ?? ev.decision} · {redactSensitiveText(ev.reason)}
                          </p>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          )}
        </aside>
      </div>
      )}

      {/* RBAC Independent Approval Queue (#rbac) */}
      {activeTab === 'rbac' && (
      <section
        id="rbac"
        className="min-w-0 space-y-5 rounded-xl border border-slate-200 bg-white p-6 shadow-xs"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[#51743e]">
              Kiểm soát phân quyền hai người độc lập
            </p>
            <h2 className="text-lg font-bold text-slate-900">
              Quyết định vai trò &amp; Quyền bổ sung
            </h2>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
            <ShieldAlert size={14} aria-hidden="true" />
            Người đề xuất, người nhận quyền và người phê duyệt phải khác nhau
          </span>
        </div>

        <div className="grid min-w-0 gap-6 lg:grid-cols-12">
          {/* Role Decisions */}
          <div className="min-w-0 lg:col-span-5">
            <h3 className="mb-2 text-sm font-bold text-slate-900">
              Quyết định chuyển vai trò ({authority.roles.length})
            </h3>
            <div className="max-h-96 min-w-0 overflow-auto rounded-lg border border-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-slate-50 text-[11px] uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Tài khoản</th>
                    <th className="px-3 py-2 font-semibold">Chuyển đổi</th>
                    <th className="whitespace-nowrap px-3 py-2 font-semibold">Trạng thái</th>
                    <th className="whitespace-nowrap px-3 py-2 text-right font-semibold">Duyệt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {!authority.roles.length ? (
                    <tr>
                      <td colSpan={4} className="px-3 py-6 text-center text-slate-500">
                        Chưa có quyết định chuyển vai trò nào.
                      </td>
                    </tr>
                  ) : (
                    authority.roles.map((r) => {
                      const canAct =
                        !r.approvedBy &&
                        canApprove &&
                        Boolean(user) &&
                        user!.id !== r.requestedBy &&
                        user!.id !== r.userId;
                      return (
                        <tr key={r.id}>
                          <td className="px-3 py-2">
                            <div className="font-semibold text-slate-800">
                              {displayAccountRef(r.userId)}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              Lý do: {redactSensitiveText(r.reason)}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-[11px] text-slate-700">
                            {ADMIN_ROLE_SHORT[r.previousRole] ?? r.previousRole} →{' '}
                            <strong>{ADMIN_ROLE_SHORT[r.nextRole] ?? r.nextRole}</strong>
                          </td>
                          <td className="whitespace-nowrap px-3 py-2">
                            {r.approvedBy ? (
                              <span className="inline-flex whitespace-nowrap rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                                Đã duyệt
                              </span>
                            ) : (
                              <span className="inline-flex whitespace-nowrap rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                                Chờ duyệt
                              </span>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-right">
                            {!r.approvedBy && (
                              <button
                                type="button"
                                disabled={!canAct || busy}
                                title={
                                  canApprove
                                    ? 'Cần tài khoản duyệt độc lập khác người đề xuất'
                                    : 'Tài khoản hiện tại chưa được cấp quyền phê duyệt độc lập'
                                }
                                onClick={() => handleApproveRole(r)}
                                className="whitespace-nowrap rounded-md bg-[#5f8b48] px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-[#51773d] disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                Duyệt
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Permission Grants */}
          <div className="min-w-0 lg:col-span-7">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-slate-900">
                Quyền bổ sung có phạm vi ({filteredGrants.length})
              </h3>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  id="rbac-grant-search"
                  name="grantSearch"
                  type="search"
                  aria-label="Tìm quyền bổ sung theo nhân sự hoặc tên quyền"
                  placeholder="Tìm nhân sự hoặc quyền..."
                  value={grantSearch}
                  onChange={(e) => {
                    setGrantSearch(e.target.value);
                    setGrantPage(1);
                  }}
                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-800 focus:border-[#5f8b48] focus:outline-none"
                />
                <select
                  id="rbac-grant-status"
                  name="grantStatusFilter"
                  aria-label="Lọc trạng thái quyền bổ sung"
                  value={grantStatusFilter}
                  onChange={(e) => {
                    setGrantStatusFilter(
                      e.target.value as 'ALL' | 'ACTIVE' | 'PENDING' | 'INACTIVE',
                    );
                    setGrantPage(1);
                  }}
                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-800 focus:border-[#5f8b48] focus:outline-none"
                >
                  <option value="ALL">Mọi trạng thái</option>
                  <option value="ACTIVE">Đang hiệu lực</option>
                  <option value="PENDING">Chờ duyệt</option>
                  <option value="INACTIVE">Hết hạn / Đã thu hồi</option>
                </select>
              </div>
            </div>
            <div className="min-w-0 overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-[11px] uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Tài khoản &amp; Quyền</th>
                    <th className="px-3 py-2 font-semibold">Phạm vi / Hết hạn</th>
                    <th className="whitespace-nowrap px-3 py-2 font-semibold">Trạng thái</th>
                    <th className="whitespace-nowrap px-3 py-2 text-right font-semibold">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {!visibleGrants.length ? (
                    <tr>
                      <td colSpan={4} className="px-3 py-6 text-center text-slate-500">
                        {authority.grants.length === 0
                          ? 'Chưa có quyền bổ sung nào.'
                          : 'Không có quyền bổ sung khớp bộ lọc.'}
                      </td>
                    </tr>
                  ) : (
                    visibleGrants.map((g) => {
                      const isExpired =
                        Boolean(g.approvedBy) &&
                        !g.revokedAt &&
                        new Date(g.expiresAt).getTime() <= Date.now();
                      const canApproveThis =
                        !g.approvedBy &&
                        !g.revokedAt &&
                        canApprove &&
                        Boolean(user) &&
                        user!.id !== g.requestedBy &&
                        user!.id !== g.userId;
                      const canRevokeThis =
                        !g.revokedAt && !isExpired && Boolean(user) && user!.id !== g.userId;
                      const canRenewThis = Boolean(user) && user!.id !== g.userId;
                      return (
                        <tr key={g.id} className="hover:bg-slate-50/70">
                          <td className="px-3 py-2">
                            <div className="font-semibold text-slate-800">
                              {displayAccountRef(g.userId)}
                            </div>
                            <div className="text-[11px] font-medium text-[#51743e]">
                              {formatCapabilityLabel(g.capability)}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-[11px] text-slate-600">
                            <div title={g.scopeId ?? undefined}>
                              {formatScopeLabel(g.scopeType, g.scopeId, topicTitleMap)}
                            </div>
                            <div>Hạn: {formatVnDateTime(g.expiresAt)}</div>
                          </td>
                          <td className="whitespace-nowrap px-3 py-2">
                            {g.revokedAt ? (
                              <span className="inline-flex whitespace-nowrap rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                                Đã thu hồi
                              </span>
                            ) : isExpired ? (
                              <span className="inline-flex whitespace-nowrap rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700">
                                Đã hết hạn
                              </span>
                            ) : g.approvedBy ? (
                              <span className="inline-flex whitespace-nowrap rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                                Hiệu lực
                              </span>
                            ) : (
                              <span className="inline-flex whitespace-nowrap rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                                Chờ duyệt
                              </span>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-right">
                            <div className="flex justify-end gap-1.5">
                              {!g.approvedBy && !g.revokedAt && (
                                <button
                                  type="button"
                                  disabled={!canApproveThis || busy}
                                  title={
                                    canApprove
                                      ? 'Cần người duyệt độc lập khác người đề xuất/nhận'
                                      : 'Tài khoản chưa được cấp quyền phê duyệt độc lập'
                                  }
                                  onClick={() => handleApproveGrant(g)}
                                  className="whitespace-nowrap rounded-md bg-[#5f8b48] px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-[#51773d] disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                  Duyệt
                                </button>
                              )}
                              {canRenewThis && (
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => {
                                    setSelectedId(g.userId);
                                    setGrantCapability(g.capability);
                                    setGrantScopeType(
                                      g.scopeType as
                                        | 'GLOBAL'
                                        | 'CLASS'
                                        | 'COURSE'
                                        | 'SUPPORT_TOPIC'
                                        | 'TEACHER',
                                    );
                                    setGrantScopeId(g.scopeId ?? '');
                                    setGrantExpiresAt(
                                      new Date(Date.now() + 30 * 86400000)
                                        .toISOString()
                                        .slice(0, 16),
                                    );
                                    setGrantReason(
                                      `Gia hạn quyền "${formatCapabilityLabel(g.capability)}" (${formatScopeLabel(g.scopeType, g.scopeId, topicTitleMap)}) thêm 30 ngày`,
                                    );
                                    setNoticeMsg(
                                      `Đã điền sẵn đề xuất gia hạn quyền "${formatCapabilityLabel(g.capability)}" ở khung Chi tiết tài khoản bên trên. Kiểm tra lý do và gửi để phê duyệt độc lập.`,
                                    );
                                  }}
                                  className="whitespace-nowrap rounded-md border border-[#5f8b48] bg-[#f4f8f1] px-2.5 py-1 text-[11px] font-semibold text-[#3f5e2f] hover:bg-[#eaf2e4] disabled:opacity-40"
                                >
                                  Gia hạn
                                </button>
                              )}
                              {!g.revokedAt && !isExpired && (
                                <button
                                  type="button"
                                  disabled={!canRevokeThis || busy}
                                  onClick={() => handleRevokeGrant(g)}
                                  className="whitespace-nowrap rounded-md border border-rose-300 bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-40"
                                >
                                  Thu hồi
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            {grantTotalPages > 1 && (
              <div className="mt-2.5 flex items-center justify-between text-xs text-slate-600">
                <span>
                  Trang {safeGrantPage} / {grantTotalPages} ({filteredGrants.length} quyền)
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={safeGrantPage <= 1}
                    onClick={() => setGrantPage((p) => Math.max(1, p - 1))}
                    className="rounded border border-slate-300 px-2.5 py-1 font-semibold disabled:opacity-40"
                  >
                    Trang trước
                  </button>
                  <button
                    type="button"
                    disabled={safeGrantPage >= grantTotalPages}
                    onClick={() => setGrantPage((p) => p + 1)}
                    className="rounded border border-slate-300 px-2.5 py-1 font-semibold disabled:opacity-40"
                  >
                    Trang sau
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
      )}

      <ConfirmDialog
        open={Boolean(confirmState)}
        title={confirmState?.title ?? ''}
        description={confirmState?.description ?? ''}
        confirmLabel={confirmState?.confirmLabel ?? 'Xác nhận'}
        isBusy={busy}
        onCancel={() => {
          if (!busy) setConfirmState(null);
        }}
        onConfirm={() => {
          if (!confirmState) return;
          const run = confirmState.onConfirm;
          setConfirmState(null);
          void run();
        }}
      />
    </div>
  );
}
