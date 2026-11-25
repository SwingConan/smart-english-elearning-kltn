import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  Copy,
  CreditCard,
  QrCode,
  Receipt,
  RefreshCw,
  ShieldCheck,
  Wallet,
} from 'lucide-react';
import { apiFetch, ApiError } from '@/lib/api-client';
import { enrollmentApi } from '@/features/enrollments/api';
import { learnerClassLabel, learnerCourseLabel } from '@/features/enrollments/presentation';

export interface UnifiedFinanceResponse {
  serverTime: string;
  sepay: {
    configured: boolean;
    bankCode: string | null;
    gateway: string | null;
    accountNumberMasked: string | null;
    accountNumber: string | null;
    accountHolder: string | null;
    callbackPath: string;
  };
  summary: {
    totalReceivables: number;
    unpaidOrHeldCount: number;
    paidCount: number;
    exceptionCount: number;
    expiredCount: number;
  };
  receivables: Array<{
    id: string;
    receivableCode: string;
    enrollmentId: string;
    enrollmentStatus: string;
    reservedUntil: string | null;
    seatReleasedAt: string | null;
    releaseReason: string | null;
    entrySource: string | null;
    placementAttemptId: string | null;
    classOffering: {
      id: string;
      code: string;
      name: string;
      status: string;
      maxStudents: number | null;
      course: { id: string; title: string; slug: string; level: string };
    };
    amountVnd: number;
    paidAmountVnd: number;
    remainingVnd: number;
    currency: string;
    status: string;
    dueAt: string | null;
    paidAt: string | null;
    isTestHarness: boolean;
    activeOrder: {
      id: string;
      paymentCode: string;
      expectedAmountVnd: number;
      currency: string;
      bankCode: string | null;
      accountNumber: string | null;
      accountName: string | null;
      qrUrl: string | null;
      status: string;
      expiresAt: string;
      remainingSeconds: number;
    } | null;
    latestOrder: {
      id: string;
      paymentCode: string;
      expectedAmountVnd: number;
      status: string;
      expiresAt: string;
      remainingSeconds: number;
    } | null;
    receipt: {
      id: string;
      receiptNumber: string;
      amountVnd: number;
      currency: string;
      verificationMethod: string;
      isTestHarness: boolean;
      issuedAt: string;
    } | null;
    transactions: Array<{
      id: string;
      providerTransactionId: string;
      amountVnd: number;
      classification: string;
      reconciliationState: string;
      verificationSource: string;
      verifiedBankApi: boolean;
      isTestHarness: boolean;
      content: string;
      transactionDate: string;
      resolutionNote: string | null;
    }>;
  }>;
  historicalLegacyW07: Array<{
    id: string;
    classCode: string;
    className: string;
    state: string;
    amountVnd: number;
    createdAt: string;
    historicalOnly: boolean;
    note: string;
  }>;
}

type FilterTab = 'ALL' | 'PENDING' | 'PAID' | 'EXPIRED';

const formatVnd = (n: number) => `${n.toLocaleString('vi-VN')} ₫`;

const formatCountdown = (seconds: number) => {
  const s = Math.max(0, Math.floor(seconds));
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${mm}:${ss}`;
};

const statusBadgeMap: Record<string, { label: string; cls: string }> = {
  UNPAID: {
    label: 'Chờ thanh toán',
    cls: 'bg-amber-50 text-amber-800 border-amber-200',
  },
  PARTIAL: {
    label: 'Đã đóng một phần',
    cls: 'bg-sky-50 text-sky-800 border-sky-200',
  },
  PAID: {
    label: 'Đã thanh toán đủ',
    cls: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  },
  OVERPAID: {
    label: 'Đóng dư — Đang đối soát',
    cls: 'bg-indigo-50 text-indigo-800 border-indigo-200',
  },
  NEEDS_RECONCILIATION: {
    label: 'Đang chờ thu ngân xác nhận',
    cls: 'bg-rose-50 text-rose-800 border-rose-200',
  },
  EXPIRED: {
    label: 'Hết hạn giữ chỗ 15 phút',
    cls: 'bg-slate-100 text-slate-700 border-slate-200',
  },
  CANCELLED: {
    label: 'Hết hạn giữ chỗ',
    cls: 'bg-slate-100 text-slate-700 border-slate-200',
  },
};

const classificationVi: Record<string, string> = {
  EXACT_MATCH: 'Khớp số tiền & mã thanh toán',
  UNDERPAYMENT: 'Chuyển thiếu so với học phí',
  OVERPAYMENT: 'Chuyển dư so với học phí',
  UNMATCHED_CODE: 'Nội dung chuyển khoản chưa khớp mã',
  EXPIRED_HOLD: 'Chuyển khoản sau khi hết 15 phút giữ chỗ',
  CLASS_FULL: 'Lớp đã đủ sĩ số',
  DUPLICATE_TX: 'Giao dịch trùng lặp',
  RECEIVER_MISMATCH: 'Tài khoản nhận chưa khớp',
};

const reconciliationVi: Record<string, string> = {
  AUTO_SETTLED: 'Đối soát tự động thành công',
  MANUALLY_RESOLVED: 'Thu ngân đã xác nhận',
  RESOLVED: 'Đã xử lý xong',
  PENDING: 'Đang chờ kiểm tra',
  NEEDS_REVIEW: 'Chờ thu ngân kiểm tra',
  IGNORED: 'Không áp dụng',
};

const enrollmentStatusVi: Record<string, string> = {
  ACTIVE: 'Đã mở lớp học',
  PENDING_PAYMENT: 'Chờ hoàn tất học phí',
  CANCELLED: 'Đã nhả suất giữ chỗ',
  COMPLETED: 'Đã hoàn thành khóa học',
};

function formatVerificationMethod(method: string): string {
  switch (method) {
    case 'SEPAY_AUTO_VERIFIED':
      return 'Chuyển khoản ngân hàng (SePay xác nhận tự động)';
    case 'CASHIER_MANUAL_VERIFIED':
    case 'MANUAL':
      return 'Thu ngân trung tâm xác nhận';
    default:
      return 'Chuyển khoản ngân hàng qua SePay';
  }
}

function legacyStateVi(state: string): string {
  switch (state) {
    case 'APPROVED':
      return 'Đã duyệt';
    case 'PENDING':
      return 'Đang xử lý';
    case 'REJECTED':
      return 'Đã từ chối';
    default:
      return 'Đã lưu trữ';
  }
}

function priorityRank(rec: UnifiedFinanceResponse['receivables'][number], nowMs: number): number {
  const hasValidHold =
    Boolean(rec.activeOrder) &&
    new Date(rec.activeOrder!.expiresAt).getTime() > nowMs;
  if (hasValidHold) return 0;
  if (['UNPAID', 'PARTIAL', 'NEEDS_RECONCILIATION', 'OVERPAID'].includes(rec.status)) return 1;
  if (rec.status === 'PAID') return 2;
  return 3;
}

export function UnifiedStudentFinancePanel({
  onChanged,
  onLoaded,
  pendingEnrollmentCount = 0,
  pendingEnrollmentVnd = 0,
}: {
  onChanged?: () => void;
  onLoaded?: (data: UnifiedFinanceResponse) => void;
  pendingEnrollmentCount?: number;
  pendingEnrollmentVnd?: number;
}) {
  const [searchParams] = useSearchParams();
  const focusedEnrollmentId = searchParams.get('enrollmentId');
  const [data, setData] = useState<UnifiedFinanceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterTab>('ALL');
  const [nowMs, setNowMs] = useState(() => Date.now());

  const load = async (manual = false) => {
    if (manual) setRefreshing(true);
    try {
      const res = await apiFetch<{ unified?: UnifiedFinanceResponse }>('/v2/my/finance');
      const loaded = res?.unified
        ? res.unified
        : await apiFetch<UnifiedFinanceResponse>('/v2/payments/sepay');
      if (!loaded || !Array.isArray(loaded.receivables)) {
        setData(null);
        return;
      }
      setData(loaded);
      onLoaded?.(loaded);
      setError('');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Chưa thể tải thông tin học phí lúc này.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const hasActiveCountdown = useMemo(
    () => Boolean(data?.receivables.some((r) => Boolean(r.activeOrder))),
    [data],
  );

  useEffect(() => {
    if (!hasActiveCountdown) return;
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, [hasActiveCountdown]);

  const handleRetryHold = async (enrollmentId: string) => {
    setBusyId(enrollmentId);
    setError('');
    try {
      await enrollmentApi.retryHold(enrollmentId);
      await load();
      onChanged?.();
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.message
          : 'Không thể giữ chỗ lúc này (lớp có thể đã đủ sĩ số hoặc ngừng nhận học viên).',
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleCopy = async (value: string, key: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      // Clipboard may be restricted in non-HTTPS contexts
    }
  };

  const stats = useMemo(() => {
    if (!data) {
      return {
        pendingCount: 0,
        activeHoldCount: 0,
        paidCount: 0,
        expiredCount: 0,
        totalPaidVnd: 0,
        totalRemainingVnd: 0,
      };
    }
    let activeHoldCount = 0;
    let pendingCount = 0;
    let paidCount = 0;
    let expiredCount = 0;
    let totalPaidVnd = 0;
    let totalRemainingVnd = 0;

    for (const r of data.receivables) {
      totalPaidVnd += r.paidAmountVnd;
      const validHold =
        Boolean(r.activeOrder) && new Date(r.activeOrder!.expiresAt).getTime() > nowMs;
      if (validHold) activeHoldCount += 1;

      if (r.status === 'PAID') {
        paidCount += 1;
      } else if (r.status === 'EXPIRED' || r.status === 'CANCELLED') {
        expiredCount += 1;
      } else {
        pendingCount += 1;
        totalRemainingVnd += r.remainingVnd;
      }
    }

    return {
      pendingCount,
      activeHoldCount,
      paidCount,
      expiredCount,
      totalPaidVnd,
      totalRemainingVnd,
    };
  }, [data, nowMs]);

  const visibleReceivables = useMemo(() => {
    if (!data) return [];
    const sorted = [...data.receivables].sort((a, b) => {
      if (focusedEnrollmentId) {
        if (a.enrollmentId === focusedEnrollmentId) return -1;
        if (b.enrollmentId === focusedEnrollmentId) return 1;
      }
      return priorityRank(a, nowMs) - priorityRank(b, nowMs);
    });
    if (filter === 'PENDING') {
      return sorted.filter(
        (r) =>
          !['PAID', 'EXPIRED', 'CANCELLED'].includes(r.status) ||
          (r.activeOrder && new Date(r.activeOrder.expiresAt).getTime() > nowMs),
      );
    }
    if (filter === 'PAID') return sorted.filter((r) => r.status === 'PAID');
    if (filter === 'EXPIRED') {
      return sorted.filter((r) => r.status === 'EXPIRED' || r.status === 'CANCELLED');
    }
    return sorted;
  }, [data, filter, focusedEnrollmentId, nowMs]);

  if (loading) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs" role="status">
        <div className="flex items-center gap-3 text-sm text-slate-600">
          <RefreshCw size={16} className="animate-spin text-[#5f8b48]" aria-hidden="true" />
          <span>Đang tải thông tin học phí và biên lai của bạn…</span>
        </div>
      </section>
    );
  }

  if (!data && !error) {
    return null;
  }

  return (
    <section className="space-y-6" aria-label="Học phí và thanh toán">
      {/* Header + KPI Summary */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[#4d7439]">
              <Wallet size={14} aria-hidden="true" />
              Học phí &amp; Ghi danh
            </p>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Học phí &amp; Thanh toán
            </h1>
            <p className="max-w-2xl text-sm text-slate-600">
              Theo dõi các khoản học phí, giữ chỗ 15 phút khi thanh toán chuyển khoản VietQR và xem
              biên lai lớp đã kích hoạt.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void load(true)}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
            >
              <RefreshCw
                size={13}
                className={refreshing ? 'animate-spin' : ''}
                aria-hidden="true"
              />
              Làm mới
            </button>
            <Link
              to="/student/enrollments"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              <BookOpen size={13} aria-hidden="true" />
              Lớp đang theo học
            </Link>
            <Link
              to="/catalog"
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#5f8b48] px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-[#4c7238]"
            >
              Chọn thêm lớp học
              <ArrowRight size={13} aria-hidden="true" />
            </Link>
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900"
          >
            <AlertCircle size={16} className="shrink-0 text-rose-600" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        {data && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-amber-200/80 bg-amber-50/50 p-4">
              <div className="flex items-center justify-between text-xs font-medium text-amber-900">
                <span>Cần thanh toán</span>
                <CreditCard size={15} className="text-amber-600" aria-hidden="true" />
              </div>
              <p className="mt-1.5 text-2xl font-bold text-amber-950">
                {stats.pendingCount + pendingEnrollmentCount}
              </p>
              <p className="mt-1 text-xs text-amber-800/90">
                {stats.totalRemainingVnd > 0
                  ? `Còn lại: ${formatVnd(stats.totalRemainingVnd)}`
                  : pendingEnrollmentCount > 0
                    ? pendingEnrollmentVnd > 0
                      ? `${pendingEnrollmentCount} lớp chờ tạo mã (${formatVnd(pendingEnrollmentVnd)})`
                      : `${pendingEnrollmentCount} lớp đăng ký chờ hoàn tất`
                    : 'Không có khoản chờ chuyển khoản'}
              </p>
            </div>

            <div className="rounded-xl border border-indigo-200/80 bg-indigo-50/50 p-4">
              <div className="flex items-center justify-between text-xs font-medium text-indigo-900">
                <span>Đang giữ chỗ 15 phút</span>
                <Clock size={15} className="text-indigo-600" aria-hidden="true" />
              </div>
              <p className="mt-1.5 text-2xl font-bold text-indigo-950">{stats.activeHoldCount}</p>
              <p className="mt-1 text-xs text-indigo-800/90">
                {stats.activeHoldCount > 0
                  ? 'Có mã QR chuyển khoản đang hiệu lực'
                  : 'Chưa có phiên giữ chỗ đang chạy'}
              </p>
            </div>

            <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/50 p-4">
              <div className="flex items-center justify-between text-xs font-medium text-emerald-900">
                <span>Đã hoàn tất học phí</span>
                <CheckCircle2 size={15} className="text-emerald-600" aria-hidden="true" />
              </div>
              <p className="mt-1.5 text-2xl font-bold text-emerald-950">{stats.paidCount}</p>
              <p className="mt-1 text-xs text-emerald-800/90">
                Tổng đã đóng: {formatVnd(stats.totalPaidVnd)}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
              <div className="flex items-center justify-between text-xs font-medium text-slate-700">
                <span>Hết hạn giữ chỗ</span>
                <Receipt size={15} className="text-slate-500" aria-hidden="true" />
              </div>
              <p className="mt-1.5 text-2xl font-bold text-slate-900">{stats.expiredCount}</p>
              <p className="mt-1 text-xs text-slate-600">
                {stats.expiredCount > 0
                  ? 'Có thể bấm giữ chỗ lại nếu lớp còn slot'
                  : 'Tất cả lượt đăng ký đều đang hiệu lực'}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Filter Tabs */}
      {data && data.receivables.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div
            className="inline-flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-2xs"
            role="tablist"
            aria-label="Lọc danh sách học phí"
          >
            {(
              [
                ['ALL', `Tất cả (${data.receivables.length})`],
                ['PENDING', `Cần thanh toán (${stats.pendingCount})`],
                ['PAID', `Đã thanh toán (${stats.paidCount})`],
                ['EXPIRED', `Hết hạn (${stats.expiredCount})`],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={filter === key}
                onClick={() => setFilter(key)}
                className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition ${
                  filter === key
                    ? 'bg-slate-900 text-white shadow-2xs'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <span className="text-xs text-slate-500">
            Hiển thị {visibleReceivables.length} / {data.receivables.length} khoản học phí
          </span>
        </div>
      )}

      {/* Empty State */}
      {data && data.receivables.length === 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-xs">
          <Wallet size={32} className="mx-auto text-slate-400" aria-hidden="true" />
          <h2 className="mt-3 text-base font-bold text-slate-900">
            Bạn chưa có khoản học phí nào
          </h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-600">
            Hãy chọn lớp học phù hợp từ danh mục khóa học hoặc làm bài kiểm tra đầu vào để nhận lộ
            trình và mức học phí chi tiết.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2.5">
            <Link
              to="/catalog"
              className="rounded-lg bg-[#5f8b48] px-4 py-2 text-xs font-semibold text-white hover:bg-[#4c7238]"
            >
              Xem danh mục khóa học
            </Link>
            <Link
              to="/placement"
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Làm kiểm tra đầu vào
            </Link>
          </div>
        </div>
      )}

      {/* Filtered Empty State */}
      {data && data.receivables.length > 0 && visibleReceivables.length === 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-600">
          Không có khoản học phí nào trong mục lọc này.
        </div>
      )}

      {/* Receivables List */}
      <div className="space-y-4">
        {visibleReceivables.map((rec) => {
          const isFocused = focusedEnrollmentId === rec.enrollmentId;
          const liveRemaining = rec.activeOrder
            ? Math.max(0, Math.floor((new Date(rec.activeOrder.expiresAt).getTime() - nowMs) / 1000))
            : 0;
          const orderStillValid = Boolean(rec.activeOrder && liveRemaining > 0);
          const canRetryHold =
            rec.status !== 'PAID' &&
            rec.enrollmentStatus !== 'ACTIVE' &&
            !orderStillValid;

          const badge = orderStillValid
            ? {
                label: 'Đang giữ chỗ 15 phút',
                cls: 'bg-indigo-50 text-indigo-800 border-indigo-200',
              }
            : statusBadgeMap[rec.status] ?? {
                label: 'Đang cập nhật',
                cls: 'bg-slate-100 text-slate-700 border-slate-200',
              };

          const courseTitle = learnerCourseLabel(rec.classOffering.course.title);
          const classTitle = learnerClassLabel(
            rec.classOffering.name,
            rec.classOffering.code,
            rec.classOffering.course.title,
          );
          const originLabel =
            rec.entrySource === 'PLACEMENT_MATCH'
              ? 'Gợi ý sau kiểm tra đầu vào'
              : 'Chọn lớp trực tiếp tại Khóa học';
          const enrollLabel = enrollmentStatusVi[rec.enrollmentStatus] ?? 'Đang xử lý';

          return (
            <article
              key={rec.id}
              data-testid={`tuition-receivable-${rec.receivableCode}`}
              className={`rounded-2xl border bg-white p-5 shadow-xs transition space-y-4 ${
                isFocused
                  ? 'border-indigo-500 ring-2 ring-indigo-100'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              {/* Card Header */}
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${badge.cls}`}
                    >
                      {badge.label}
                    </span>
                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                      {originLabel}
                    </span>
                  </div>

                  <h2 className="text-lg font-bold text-slate-900">
                    {classTitle}
                  </h2>
                  <p className="text-xs text-slate-600">
                    Khóa học: <span className="font-medium text-slate-800">{courseTitle}</span> ·{' '}
                    <span>{enrollLabel}</span>
                  </p>
                </div>

                {/* Price Block */}
                <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-2.5 text-right sm:min-w-48">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                    Học phí lớp học
                  </p>
                  <p className="mt-0.5 text-xl font-bold text-slate-900">
                    {formatVnd(rec.amountVnd)}
                  </p>
                  {rec.status !== 'PAID' ? (
                    <p className="mt-0.5 text-xs text-slate-600">
                      Đã đóng: {formatVnd(rec.paidAmountVnd)} · Còn lại:{' '}
                      <strong className="text-slate-900">{formatVnd(rec.remainingVnd)}</strong>
                    </p>
                  ) : (
                    <p className="mt-0.5 text-xs font-medium text-emerald-700">
                      Đã thanh toán đủ
                    </p>
                  )}
                </div>
              </div>

              {/* Active 15-min Hold & QR Checkout */}
              {orderStillValid && rec.activeOrder && (
                <div className="grid gap-5 rounded-xl border border-indigo-200 bg-indigo-50/40 p-4 sm:grid-cols-[minmax(0,1fr)_auto]">
                  <div className="space-y-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-700 px-3 py-1 font-mono text-xs font-bold text-white">
                        <Clock size={12} aria-hidden="true" />
                        Còn lại: {formatCountdown(liveRemaining)}
                      </span>
                      <span className="text-xs text-slate-600">
                        Hết hạn giữ chỗ lúc{' '}
                        {new Date(rec.activeOrder.expiresAt).toLocaleTimeString('vi-VN')}
                      </span>
                    </div>

                    <div className="grid gap-2 rounded-lg border border-indigo-100 bg-white p-3 text-xs sm:grid-cols-2">
                      <div>
                        <p className="text-slate-500">Ngân hàng thụ hưởng</p>
                        <p className="mt-0.5 font-semibold text-slate-900">
                          {rec.activeOrder.bankCode ?? 'MB Bank'}
                        </p>
                      </div>
                      <div>
                        <p className="text-slate-500">Chủ tài khoản</p>
                        <p className="mt-0.5 font-semibold text-slate-900">
                          {rec.activeOrder.accountName ?? 'Smart English'}
                        </p>
                      </div>
                      <div className="flex items-center justify-between gap-2 sm:col-span-2 border-t border-slate-100 pt-2">
                        <div>
                          <p className="text-slate-500">Số tài khoản</p>
                          <p className="mt-0.5 font-mono text-sm font-bold text-slate-900">
                            {rec.activeOrder.accountNumber ?? 'Đang cập nhật'}
                          </p>
                        </div>
                        {rec.activeOrder.accountNumber && (
                          <button
                            type="button"
                            onClick={() =>
                              void handleCopy(rec.activeOrder!.accountNumber!, `acc-${rec.id}`)
                            }
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                          >
                            {copiedKey === `acc-${rec.id}` ? (
                              <>
                                <Check size={12} className="text-emerald-600" /> Đã sao chép
                              </>
                            ) : (
                              <>
                                <Copy size={12} /> Sao chép
                              </>
                            )}
                          </button>
                        )}
                      </div>
                      <div className="flex items-center justify-between gap-2 sm:col-span-2 border-t border-slate-100 pt-2">
                        <div>
                          <p className="text-slate-500">Số tiền cần chuyển</p>
                          <p className="mt-0.5 text-base font-bold text-indigo-950">
                            {formatVnd(rec.activeOrder.expectedAmountVnd)}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2 sm:col-span-2 border-t border-slate-100 pt-2">
                        <div>
                          <p className="text-slate-500">Nội dung chuyển khoản (bắt buộc)</p>
                          <code className="mt-0.5 inline-block font-mono text-sm font-bold text-indigo-900">
                            {rec.activeOrder.paymentCode}
                          </code>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            void handleCopy(rec.activeOrder!.paymentCode, `code-${rec.id}`)
                          }
                          className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-800 hover:bg-indigo-100"
                        >
                          {copiedKey === `code-${rec.id}` ? (
                            <>
                              <Check size={12} className="text-emerald-600" /> Đã sao chép
                            </>
                          ) : (
                            <>
                              <Copy size={12} /> Sao chép mã
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    <p className="flex items-start gap-1.5 text-xs text-slate-600">
                      <ShieldCheck
                        size={14}
                        className="mt-0.5 shrink-0 text-[#5f8b48]"
                        aria-hidden="true"
                      />
                      <span>
                        Chuyển khoản đúng số tiền và nội dung trên trong thời gian giữ chỗ. Hệ
                        thống tự động xác nhận và mở lớp học ngay sau khi nhận được giao dịch.
                      </span>
                    </p>
                  </div>

                  {rec.activeOrder.qrUrl && (
                    <div className="flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-white p-3">
                      <img
                        src={rec.activeOrder.qrUrl}
                        alt={`Mã QR thanh toán ${rec.activeOrder.paymentCode}`}
                        className="h-44 w-44 rounded-lg object-contain"
                        referrerPolicy="no-referrer"
                      />
                      <span className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-slate-600">
                        <QrCode size={12} aria-hidden="true" />
                        Quét bằng app ngân hàng
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Expired / Retry Hold Bar */}
              {canRetryHold && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                  <p className="text-xs text-slate-700">
                    {rec.enrollmentStatus === 'CANCELLED'
                      ? 'Phiên giữ chỗ 15 phút trước đã hết hạn nên chỗ học đã được mở lại. Bạn có thể giữ chỗ lại ngay để thanh toán.'
                      : 'Chưa có mã thanh toán đang hoạt động cho lớp học này.'}
                  </p>
                  <button
                    type="button"
                    disabled={busyId === rec.enrollmentId}
                    onClick={() => void handleRetryHold(rec.enrollmentId)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
                  >
                    <QrCode size={13} aria-hidden="true" />
                    {busyId === rec.enrollmentId
                      ? 'Đang tạo mã thanh toán…'
                      : 'Giữ chỗ 15 phút & Tạo mã QR'}
                  </button>
                </div>
              )}

              {/* Paid Receipt Banner */}
              {rec.receipt && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50/70 p-4">
                  <div className="space-y-1 text-xs text-emerald-950">
                    <p className="flex items-center gap-1.5 font-bold">
                      <CheckCircle2 size={14} className="text-emerald-700" aria-hidden="true" />
                      <span>Biên lai học phí:</span>
                      <span className="font-mono">{rec.receipt.receiptNumber}</span>
                    </p>
                    <p className="text-emerald-900/90">
                      Số tiền xác nhận: <strong>{formatVnd(rec.receipt.amountVnd)}</strong> ·{' '}
                      {formatVerificationMethod(rec.receipt.verificationMethod)} · Cấp lúc{' '}
                      {new Date(rec.receipt.issuedAt).toLocaleString('vi-VN')}
                    </p>
                  </div>
                  {rec.enrollmentStatus === 'ACTIVE' && (
                    <Link
                      to={`/classroom/${encodeURIComponent(rec.classOffering.id)}`}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[#5f8b48] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#4c7238]"
                    >
                      Vào lớp học ngay
                      <ArrowRight size={13} aria-hidden="true" />
                    </Link>
                  )}
                </div>
              )}

              {/* Collapsible Invoice & Transaction Reference */}
              <details className="group border-t border-slate-100 pt-2.5 text-xs">
                <summary className="flex cursor-pointer list-none items-center justify-between text-slate-500 hover:text-slate-800">
                  <span className="inline-flex items-center gap-1.5 font-medium">
                    <Receipt size={13} aria-hidden="true" />
                    Chi tiết hóa đơn {rec.receivableCode}
                    {rec.transactions.length > 0
                      ? ` · ${rec.transactions.length} giao dịch chuyển khoản`
                      : ''}
                  </span>
                  <ChevronDown
                    size={14}
                    className="transition-transform group-open:rotate-180"
                    aria-hidden="true"
                  />
                </summary>

                <div className="mt-3 space-y-2 rounded-xl bg-slate-50 p-3">
                  <p className="text-slate-600">
                    Mã khoản thu: <span className="font-mono font-semibold">{rec.receivableCode}</span>
                  </p>
                  {rec.transactions.length > 0 ? (
                    rec.transactions.map((t) => (
                      <div
                        key={t.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2"
                      >
                        <div>
                          <span className="font-mono text-[11px] font-semibold text-slate-700">
                            Mã giao dịch: {t.providerTransactionId.slice(0, 12)}
                            {t.providerTransactionId.length > 12 ? '…' : ''}
                          </span>{' '}
                          · <strong>{formatVnd(t.amountVnd)}</strong> ·{' '}
                          <span>{classificationVi[t.classification] ?? 'Giao dịch ngân hàng'}</span>
                          <p className="mt-0.5 text-[11px] text-slate-500">
                            Thời gian: {new Date(t.transactionDate).toLocaleString('vi-VN')}
                          </p>
                          {t.resolutionNote && (
                            <p className="mt-0.5 text-slate-600">
                              Ghi chú thu ngân: {t.resolutionNote}
                            </p>
                          )}
                        </div>
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] font-semibold text-slate-700">
                          {reconciliationVi[t.reconciliationState] ?? 'Đã ghi nhận'}
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="text-slate-500">Chưa ghi nhận giao dịch chuyển khoản nào.</p>
                  )}
                </div>
              </details>
            </article>
          );
        })}
      </div>

      {/* Collapsible Historical Legacy Records (zero dev codes) */}
      {data && data.historicalLegacyW07.length > 0 && (
        <details className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs">
          <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold text-slate-700 hover:text-slate-900">
            <span>Hồ sơ ghi danh trước đây ({data.historicalLegacyW07.length})</span>
            <ChevronDown size={15} className="text-slate-400" aria-hidden="true" />
          </summary>
          <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
            {data.historicalLegacyW07.map((h) => (
              <div
                key={h.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-700"
              >
                <span>
                  <strong className="text-slate-900">
                    {learnerClassLabel(h.className, h.classCode)}
                  </strong>{' '}
                  · {formatVnd(h.amountVnd)} ·{' '}
                  <span className="text-slate-500">Hồ sơ lưu trữ (chỉ xem)</span>
                </span>
                <span className="rounded-full border border-slate-200 bg-white px-2.5 py-0.5 font-semibold text-slate-700">
                  {legacyStateVi(h.state)}
                </span>
              </div>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
