import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  CreditCard,
  QrCode,
  RefreshCw,
  Search,
  ShieldCheck,
  Wallet,
} from 'lucide-react';
import { useAuth } from '@/features/auth/auth-context';
import { apiFetch, ApiError } from '@/lib/api-client';
import { UnifiedStudentFinancePanel } from '@/features/learner/UnifiedStudentFinancePanel';
import { UnifiedCashierTuitionPanel } from '@/features/workspace/UnifiedCashierTuitionPanel';
import { isTechnicalQaRecord } from '@/features/catalog/record-presentation';
import { CopyTextButton } from '@/components/ui/Feedback';

type Order = {
  obligationId: string;
  id: string;
  code: string;
  amountVnd: number;
  state: string;
  qrUrl: string | null;
  recipient: { accountNumber: string; accountHolder: string; bankCode: string };
};

type Overview = {
  viewerId: string;
  configuration: string;
  sourceReason: string;
  eligibleObligations: { id: string; classId: string; amountVnd: number; title: string }[];
  orders: Order[];
  bankConnectionCheck?: boolean;
  testAmountVnd?: number;
};

type CashierRecord = {
  id: string;
  classification: string;
  received_at: string;
  order_id: string;
  transaction_id: string;
  decision: string | null;
};

type Cashier = {
  scope: string;
  reason: string | null;
  records: null | CashierRecord[];
  unmatched: string;
};

const base = '/v2/payments/sepay';
const money = (value: number) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value);

const stateLabel: Record<string, string> = {
  PENDING: 'Chờ chuyển khoản',
  NEEDS_RECONCILIATION: 'Cần đối soát',
  RECEIPT_CONFIRMED: 'Đã xác nhận giao dịch',
};

const stateBadge: Record<string, string> = {
  PENDING: 'badge-pending',
  NEEDS_RECONCILIATION: 'badge-info',
  RECEIPT_CONFIRMED: 'badge-published',
};

const classificationLabel: Record<string, string> = {
  EXACT_MATCH_PENDING_RECONCILIATION: 'Khớp chính xác · Chờ xác nhận',
  ADDITIONAL_TRANSFER_REQUIRES_RECONCILIATION: 'Chuyển khoản bổ sung / trùng đơn · Cần giữ đối soát',
  AMOUNT_MISMATCH: 'Sai lệch số tiền · Cần giữ xử lý',
  RECEIVER_MISMATCH: 'Sai tài khoản nhận · Không tự ghi nhận',
  RECIPIENT_CONFIGURATION_CHANGED: 'Cấu hình nhận thay đổi · Cần giữ',
  UNIDENTIFIED: 'Chưa xác định học viên/đơn · Cần giữ',
};

function formatDateTimeVn(iso: string) {
  try {
    return new Intl.DateTimeFormat('vi-VN', {
      dateStyle: 'short',
      timeStyle: 'short',
      timeZone: 'Asia/Ho_Chi_Minh',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function SePayPaymentsPage() {
  const { user } = useAuth();
  if (!user) return <p className="workspace-page">Đăng nhập để xem học phí.</p>;
  if (user.role === 'CASHIER' || user.role === 'SYSTEM_ADMIN') {
    return (
      <div className="workspace-page space-y-6">
        <header className="rounded-xl border border-slate-200 bg-white p-5">
          <span className="inline-flex items-center rounded bg-[#e9f2e4] px-2.5 py-0.5 text-xs font-semibold text-[#2f5d1e]">
            Cổng thanh toán &amp; Đối soát SePay
          </span>
          <h1 className="mt-1.5 text-2xl font-bold text-[#e66f2b] sm:text-3xl">
            Đối soát giao dịch chuyển khoản &amp; Ngoại lệ
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Kiểm tra sao kê chuyển khoản ngân hàng qua SePay, xử lý các giao dịch thiếu/dư/sai mã
            và cấp phiếu thu xác nhận kích hoạt lớp học.
          </p>
        </header>
        <UnifiedCashierTuitionPanel />
      </div>
    );
  }
  return <UnifiedStudentSePayCheckoutPage key={user.id} />;
}

function UnifiedStudentSePayCheckoutPage() {
  const [simCode, setSimCode] = useState('');
  const [simAmount, setSimAmount] = useState('2100000');
  const [simTxId, setSimTxId] = useState(() => String(900000 + Math.floor(Math.random() * 90000)));
  const [simNote, setSimNote] = useState('');
  const [simError, setSimError] = useState('');
  const [simBusy, setSimBusy] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [sepayCfg, setSepayCfg] = useState<{ gateway: string | null; accountNumber: string | null } | null>(null);

  const runHarness = async (e: React.FormEvent) => {
    e.preventDefault();
    setSimBusy(true);
    setSimError('');
    setSimNote('');
    try {
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const vnDate = new Date(now.getTime() + 7 * 3600000);
      const txDateStr = `${vnDate.getUTCFullYear()}-${pad(vnDate.getUTCMonth() + 1)}-${pad(vnDate.getUTCDate())} ${pad(vnDate.getUTCHours())}:${pad(vnDate.getUTCMinutes())}:${pad(vnDate.getUTCSeconds())}`;
      const res = await apiFetch<{
        classification: string;
        reconciliationState: string;
        receiptNumber: string | null;
      }>('/v2/payments/sepay/test-harness/simulate-transfer', {
        method: 'POST',
        body: JSON.stringify({
          id: Number(simTxId) || Date.now() % 100000000,
          gateway: sepayCfg?.gateway || 'MBBank',
          transactionDate: txDateStr,
          accountNumber: sepayCfg?.accountNumber || 'DEV-LOCAL-ACCOUNT',
          subAccount: '',
          code: simCode.trim() || null,
          content: `${simCode.trim() || 'NO_CODE'} DEV_TEST_HARNESS`,
          transferType: 'in',
          transferAmount: Number(simAmount) || 0,
          referenceCode: `DEV-TEST-${Date.now()}`,
          description: 'Synthetic DEV student harness transfer',
        }),
      });
      setSimNote(
        `[DEV TEST HARNESS] ${res.classification} -> ${res.reconciliationState}${
          res.receiptNumber ? ` (${res.receiptNumber})` : ''
        }`,
      );
      setSimTxId(String(900000 + Math.floor(Math.random() * 90000)));
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setSimError(err instanceof ApiError ? err.message : 'Lỗi chạy DEV test harness.');
    } finally {
      setSimBusy(false);
    }
  };

  const showDevHarness =
    import.meta.env.DEV &&
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('devHarness') === '1';

  return (
    <main className="workspace-page space-y-6">
      <UnifiedStudentFinancePanel
        key={refreshKey}
        onLoaded={(loaded) => setSepayCfg({ gateway: loaded.sepay.gateway, accountNumber: loaded.sepay.accountNumber })}
      />
      {showDevHarness && (
        <form
          onSubmit={(e) => void runHarness(e)}
          className="workspace-card space-y-3 border-2 border-dashed border-orange-300 bg-orange-50/40"
        >
          <div>
            <span className="rounded bg-orange-200 px-2 py-0.5 text-[11px] font-bold text-orange-950">
              DEV TEST HARNESS (MÔ PHỎNG TEST — TÁCH BIỆT TIỀN THẬT)
            </span>
            <p className="mt-1 text-xs text-slate-700">
              Chỉ dùng trong môi trường DEV để kiểm thử luồng đối soát (khớp chuẩn, thiếu tiền, dư
              tiền, sai mã, quá hạn). Hệ thống thật vẫn bắt buộc chữ ký HMAC & xác minh SePay Bank API.
            </p>
          </div>
          {simError && (
            <div role="alert" className="rounded bg-rose-50 px-3 py-2 text-xs text-rose-900">
              {simError}
            </div>
          )}
          {simNote && (
            <div role="status" className="rounded bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
              {simNote}
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-xs font-semibold text-slate-700">
              Mã chuyển khoản (paymentCode)
              <input
                type="text"
                value={simCode}
                onChange={(e) => setSimCode(e.target.value)}
                placeholder="Dán mã SETU... vào đây"
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-mono text-xs"
              />
            </label>
            <label className="text-xs font-semibold text-slate-700">
              Số tiền chuyển (VND)
              <input
                type="number"
                value={simAmount}
                onChange={(e) => setSimAmount(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-mono text-xs"
              />
            </label>
            <label className="text-xs font-semibold text-slate-700">
              Mã GD ngân hàng giả lập
              <input
                type="number"
                value={simTxId}
                onChange={(e) => setSimTxId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-mono text-xs"
              />
            </label>
          </div>
          <button
            type="submit"
            disabled={simBusy}
            className="rounded-lg bg-orange-700 px-4 py-2 text-xs font-semibold text-white hover:bg-orange-800 disabled:opacity-50"
          >
            {simBusy ? 'Đang gửi mô phỏng...' : 'Gửi giao dịch mô phỏng (TEST)'}
          </button>
        </form>
      )}
    </main>
  );
}

export function LegacySePayStudentFallback() {
  const { user } = useAuth();
  if (!user) return null;
  return <SePayPaymentWorkspace key={user.id + ':' + user.role} />;
}

function CashierSePayWorkspace() {
  const { user } = useAuth();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [overviewErr, setOverviewErr] = useState<{ status?: number; code?: string } | null>(null);
  const [cashier, setCashier] = useState<Cashier | null>(null);
  const [cashierErr, setCashierErr] = useState<{ status?: number; code?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const [query, setQuery] = useState('');
  const [classFilter, setClassFilter] = useState('ALL');
  const [decisionFilter, setDecisionFilter] = useState('ALL');

  const reload = useCallback(async () => {
    setLoading(true);
    setMessage('');
    const [ovRes, cRes] = await Promise.allSettled([
      apiFetch<Overview>(base),
      apiFetch<Cashier>(base + '/cashier'),
    ]);

    if (ovRes.status === 'fulfilled') {
      setOverview(ovRes.value);
      setOverviewErr(null);
    } else {
      setOverview(null);
      const err = ovRes.reason;
      setOverviewErr({
        status: err instanceof ApiError ? err.status : undefined,
        code: err instanceof Error ? err.message : 'SEPAY_OVERVIEW_UNAVAILABLE',
      });
    }

    if (cRes.status === 'fulfilled') {
      setCashier(cRes.value);
      setCashierErr(null);
    } else {
      setCashier(null);
      const err = cRes.reason;
      setCashierErr({
        status: err instanceof ApiError ? err.status : undefined,
        code: err instanceof Error ? err.message : 'SEPAY_CASHIER_UNAVAILABLE',
      });
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function reconcile(id: string, decision: 'CONFIRM_RECEIPT' | 'HOLD', reason: string) {
    if (busy) return;
    setBusy(true);
    setMessage('');
    try {
      await apiFetch(base + '/transactions/' + id + '/reconcile', {
        method: 'POST',
        body: JSON.stringify({ decision, reason }),
      });
      setMessage('Đã lưu quyết định đối soát và ghi dấu vết kiểm toán. Quyền học vẫn theo luồng học vụ.');
      await reload();
    } catch {
      setMessage(
        'Chưa ghi nhận được quyết định đối soát. Giao dịch ngoại lệ hoặc ngoài phạm vi grant không được tự xác nhận đủ tiền.',
      );
    } finally {
      setBusy(false);
    }
  }

  const records = useMemo(() => cashier?.records ?? [], [cashier]);

  const stats = useMemo(
    () => ({
      total: records.length,
      matchedPending: records.filter(
        (r) => !r.decision && r.classification === 'EXACT_MATCH_PENDING_RECONCILIATION',
      ).length,
      exceptions: records.filter(
        (r) => !r.decision && r.classification !== 'EXACT_MATCH_PENDING_RECONCILIATION',
      ).length,
      decided: records.filter((r) => !!r.decision).length,
    }),
    [records],
  );

  const filteredRecords = useMemo(() => {
    const q = query.trim().toLowerCase();
    return records.filter((r) => {
      if (classFilter !== 'ALL' && r.classification !== classFilter) return false;
      if (decisionFilter === 'PENDING' && r.decision !== null) return false;
      if (decisionFilter !== 'ALL' && decisionFilter !== 'PENDING' && r.decision !== decisionFilter)
        return false;
      if (!q) return true;
      return (
        r.transaction_id.toLowerCase().includes(q) ||
        r.order_id.toLowerCase().includes(q) ||
        r.id.toLowerCase().includes(q)
      );
    });
  }, [records, query, classFilter, decisionFilter]);

  return (
    <main className="workspace-page space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
        <Link
          className="font-semibold text-[#2f5d1e] hover:text-[#e66f2b] hover:underline"
          to="/workspace"
        >
          ← Tổng quan thu ngân
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            className="font-semibold text-slate-700 hover:text-[#e66f2b] hover:underline"
            to="/workspace/admissions"
          >
            Khoản phải thu & Công nợ →
          </Link>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
            onClick={() => void reload()}
            disabled={loading || busy}
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} aria-hidden="true" />
            Đọc lại trạng thái
          </button>
        </div>
      </div>

      <header className="rounded-lg border border-slate-200 bg-white p-5 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded bg-[#e9f2e4] px-2.5 py-0.5 text-xs font-semibold text-[#2f5d1e]">
            <CreditCard size={13} aria-hidden="true" />
            Thu ngân · Đối soát SePay (UC 2)
          </span>
          {overview?.configuration === 'VERIFIED' && (
            <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
              <ShieldCheck size={13} aria-hidden="true" />
              Tài khoản nhận đã xác minh
            </span>
          )}
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-[#e66f2b] sm:text-3xl">
          Đối soát & xác nhận giao dịch học phí
        </h1>
        <p className="max-w-3xl text-sm text-slate-600">
          Sử dụng cơ chế SePay & callback hiện có để đối chiếu mã tham chiếu, số tiền, khoản phải
          thu và lưu quyết định xác nhận hoặc giữ xử lý ngoại lệ kèm dấu vết kiểm toán.
        </p>
      </header>

      {message && (
        <p
          role="status"
          className="rounded-lg border border-indigo-200 bg-indigo-50 p-3.5 text-sm font-medium text-indigo-950"
        >
          {message}
        </p>
      )}

      {/* Safety & Guard Strip */}
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-xs text-amber-950 space-y-1.5">
          <p className="flex items-center gap-1.5 font-bold">
            <AlertTriangle size={15} className="shrink-0 text-amber-700" aria-hidden="true" />
            Tình trạng cổng đối soát thu ngân ({user?.email})
          </p>
          {cashierErr ? (
            <p className="leading-relaxed">
              Endpoint <code className="font-mono">/api/v2/payments/sepay/cashier</code> trả về{' '}
              <strong>
                HTTP {cashierErr.status ?? 'N/A'} ({cashierErr.code})
              </strong>
              . Hộp thư giao dịch <code className="font-mono">sepay_v2</code> chỉ kích hoạt trên
              môi trường hợp nhất (unified verified QA target) và thu ngân có grant{' '}
              <code className="font-mono">finance.verify</code> còn hiệu lực.
            </p>
          ) : cashier?.scope === 'UNAVAILABLE' ? (
            <p className="leading-relaxed">
              Chưa khả dụng ({cashier.reason ?? 'CURRENT_CLASS_FINANCE_VERIFY_REQUIRED'}) · Cần
              quyền đối soát <code className="font-mono">finance.verify</code> theo lớp còn hiệu lực.
            </p>
          ) : (
            <p className="leading-relaxed text-emerald-900">
              Cổng đối soát thu ngân đang mở theo phạm vi lớp được phân quyền.
            </p>
          )}
          {overviewErr && (
            <p className="text-[11px] text-amber-900">
              Nguồn kiểm tra kết nối ngân hàng (<code className="font-mono">/api/v2/payments/sepay</code>):{' '}
              HTTP {overviewErr.status ?? 'N/A'} ({overviewErr.code}) — phân tách độc lập với giao
              dịch học phí của học viên.
            </p>
          )}
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4 text-xs text-slate-700 space-y-1.5">
          <p className="flex items-center gap-1.5 font-bold text-slate-900">
            <ShieldCheck size={15} className="text-[#76a35e]" aria-hidden="true" />
            Quy tắc đối soát an toàn
          </p>
          <ul className="list-disc pl-4 space-y-1 leading-relaxed text-[11px]">
            <li>
              Không coi giao dịch kiểm tra kết nối <strong>10.000 đ</strong> (
              <code className="font-mono">NON_ACADEMIC_BANK_CONNECTION_CHECK</code>) là học phí đã
              nộp hoặc nguồn xác nhận công nợ.
            </li>
            <li>
              Không tự động đánh dấu khoản phải thu <strong>1.850.000 đ</strong> lịch sử là Đã
              thanh toán khi chưa có đối soát hợp lệ.
            </li>
            <li>
              Giao dịch trùng lặp, sai số tiền hoặc chưa khớp học viên bắt buộc dùng{' '}
              <code className="font-mono">HOLD</code> kèm lý do kiểm toán (tối thiểu 8 ký tự).
            </li>
          </ul>
        </div>
      </section>

      {/* Records Section */}
      <section className="rounded-lg border border-slate-200 bg-white p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-lg font-bold text-[#e66f2b]">
              Hàng đợi giao dịch & trường hợp cần đối soát
            </h2>
            <p className="text-xs text-slate-600">
              {cashier?.records
                ? `Tổng ${stats.total} bản ghi · ${stats.matchedPending} khớp chờ xác nhận · ${stats.exceptions} ngoại lệ · ${stats.decided} đã ghi nhận quyết định`
                : 'Hiển thị trung thực theo phạm vi grant và dữ liệu SePay thực tế.'}
            </p>
          </div>
        </div>

        {loading && (
          <p role="status" className="text-sm text-slate-600">
            Đang đọc dữ liệu đối soát SePay…
          </p>
        )}

        {!loading && cashier?.scope === 'AVAILABLE' && cashier.records && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <label className="relative flex-1 min-w-[200px]">
                <span className="sr-only">Tìm mã giao dịch hoặc mã đơn</span>
                <Search
                  size={14}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Tìm mã giao dịch (transaction_id) hoặc order_id..."
                  className="w-full rounded border border-slate-300 bg-white py-1.5 pl-8 pr-3 text-xs text-slate-900"
                />
              </label>
              <select
                aria-label="Lọc phân loại giao dịch"
                value={classFilter}
                onChange={(e) => setClassFilter(e.target.value)}
                className="rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800"
              >
                <option value="ALL">Mọi phân loại</option>
                <option value="EXACT_MATCH_PENDING_RECONCILIATION">Khớp chính xác</option>
                <option value="ADDITIONAL_TRANSFER_REQUIRES_RECONCILIATION">
                  Bổ sung / trùng đơn
                </option>
                <option value="AMOUNT_MISMATCH">Sai số tiền</option>
                <option value="RECEIVER_MISMATCH">Sai người nhận</option>
                <option value="UNIDENTIFIED">Chưa xác định học viên</option>
              </select>
              <select
                aria-label="Lọc quyết định đối soát"
                value={decisionFilter}
                onChange={(e) => setDecisionFilter(e.target.value)}
                className="rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800"
              >
                <option value="ALL">Mọi trạng thái</option>
                <option value="PENDING">Chưa quyết định</option>
                <option value="CONFIRM_RECEIPT">Đã xác nhận thu</option>
                <option value="HOLD">Đang giữ đối soát</option>
              </select>
            </div>

            {filteredRecords.length === 0 ? (
              <p className="rounded border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
                Không có bản ghi nào khớp điều kiện lọc trong phạm vi đã được kiểm tra.
              </p>
            ) : (
              <div className="space-y-3">
                {filteredRecords.map((row) => (
                  <Reconciliation key={row.id} row={row} busy={busy} onSave={reconcile} />
                ))}
              </div>
            )}
          </>
        )}

        {!loading && (!cashier || cashier.scope === 'UNAVAILABLE') && (
          <p className="rounded border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
            Chưa khả dụng · Không có danh sách giao dịch SePay nào được mở trong phạm vi phiên hiện
            tại. Hệ thống không giả lập hoặc tự tạo dữ liệu giao dịch.
          </p>
        )}

        <p className="text-xs text-slate-500">
          Giao dịch chưa ghép được lớp: Chưa khả dụng · cần quyền đối soát tài khoản ngân hàng được
          phê duyệt. Không tự cấp quyền đọc chéo.
        </p>
      </section>
    </main>
  );
}

function SePayPaymentWorkspace() {
  const { user } = useAuth(),
    [params, setParams] = useSearchParams();
  const [data, setData] = useState<Overview>(),
    [cashier, setCashier] = useState<Cashier>(),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [selected, setSelected] = useState(''),
    [consent, setConsent] = useState(false),
    [message, setMessage] = useState('');
  const keys = useRef(new Map<string, string>());

  const reload = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError('');
    try {
      const next = await apiFetch<Overview>(base);
      if (next.viewerId !== user.id) throw new Error('Principal changed');
      setData(next);
    } catch (e) {
      setData(undefined);
      setCashier(undefined);
      setError(
        e instanceof ApiError && [401, 403].includes(e.status)
          ? 'Không có quyền truy cập hoặc phiên đăng nhập đã hết hạn.'
          : 'Chưa tải được thông tin thanh toán. Vui lòng thử lại sau.',
      );
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void Promise.resolve().then(reload);
  }, [reload]);

  useEffect(() => {
    if (!data?.orders.some((o) => o.state === 'PENDING')) return;
    const timer = setInterval(() => void reload(), 15000);
    return () => clearInterval(timer);
  }, [data, reload]);

  async function create() {
    if (!selected || !consent || busy) return;
    setBusy(true);
    setMessage('');
    try {
      if (!keys.current.has(selected)) keys.current.set(selected, crypto.randomUUID());
      const order = await apiFetch<Order>(base + '/orders', {
        method: 'POST',
        body: JSON.stringify({
          obligationId: selected,
          key: keys.current.get(selected),
          consentVersion: 'W07_SEPAY_PAYMENT_V1',
        }),
      });
      setParams({ order: order.id });
      setMessage('Đã tạo chỉ dẫn chuyển khoản. Trạng thái tiền vào do backend xác thực.');
      await reload();
    } catch (e) {
      setMessage(
        e instanceof ApiError && e.status === 409
          ? 'Đơn học phí chưa đủ chứng cứ LIVE hoặc đã thay đổi. Hãy liên hệ học vụ.'
          : 'Chưa tạo được đơn. Giữ nguyên yêu cầu để thử lại; chưa có xác nhận thanh toán.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function createBankCheck() {
    if (!consent || busy) return;
    setBusy(true);
    setMessage('');
    try {
      const key = 'bank-connection-check';
      if (!keys.current.has(key)) keys.current.set(key, crypto.randomUUID());
      const order = await apiFetch<Order>(base + '/bank-checks', {
        method: 'POST',
        body: JSON.stringify({ key: keys.current.get(key), consentVersion: 'BR136_NON_ACADEMIC_BANK_CHECK_V1' }),
      });
      setParams({ order: order.id });
      setMessage('Đã tạo đơn kiểm tra ngân hàng riêng. Kiểm tra đúng người nhận và số tiền trước khi tự duyệt chuyển khoản.');
      await reload();
    } catch {
      setMessage('Chưa tạo được đơn kiểm tra. Chưa có xác nhận thanh toán.');
    } finally { setBusy(false); }
  }

  async function reconcile(id: string, decision: 'CONFIRM_RECEIPT' | 'HOLD', reason: string) {
    if (busy) return;
    setBusy(true);
    setMessage('');
    try {
      await apiFetch(base + '/transactions/' + id + '/reconcile', {
        method: 'POST',
        body: JSON.stringify({ decision, reason }),
      });
      setMessage('Đã lưu quyết định đối soát. Quyền học vẫn theo luồng học vụ.');
      await reload();
    } catch {
      setMessage(
        'Chưa ghi nhận được quyết định. Giao dịch ngoại lệ không được tự xác nhận đủ tiền.',
      );
    } finally {
      setBusy(false);
    }
  }

  const active = data?.orders.find((o) => o.id === params.get('order'));

  return (
    <main className="workspace-page">
      {/* Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-700 hover:underline"
          to="/workspace"
        >
          ← Không gian làm việc
        </Link>

        <nav className="flex flex-wrap items-center gap-2.5">
          <Link
            className="btn-secondary inline-flex items-center gap-1.5 px-3.5 py-2 text-sm"
            to="/admissions"
          >
            <ClipboardCheck size={15} className="text-indigo-600" aria-hidden="true" />
            Hồ sơ và đối soát thủ công hiện có
          </Link>
          <button
            type="button"
            className="btn-secondary inline-flex items-center gap-1.5 px-3.5 py-2 text-sm"
            onClick={() => void reload()}
            disabled={loading || busy}
          >
            <RefreshCw size={15} aria-hidden="true" />
            Đọc lại trạng thái
          </button>
        </nav>
      </div>

      {/* Header Banner */}
      <header className="workspace-header">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="badge-info">
              <CreditCard size={13} aria-hidden="true" />
              Cổng thanh toán & VietQR · SePay
            </span>
            {data?.configuration === 'VERIFIED' && (
              <span className="badge-published">
                <ShieldCheck size={13} aria-hidden="true" />
                Tài khoản nhận đã xác minh
              </span>
            )}
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
            Học phí qua SePay
          </h1>
          <p className="max-w-3xl text-sm text-slate-600">
            Tạo mã VietQR để thanh toán các khoản học phí đã được phê duyệt. Sau khi hệ thống đối soát đủ số tiền, quyền vào lớp sẽ được kích hoạt theo quy định học vụ.
          </p>
        </div>
      </header>

      {loading && (
        <p role="status" className="workspace-card text-sm text-slate-600">
          Đang đọc dữ liệu thanh toán…
        </p>
      )}
      {error && (
        <p role="alert" className="state-error text-sm font-medium">
          {error}
        </p>
      )}
      {message && (
        <p
          role="status"
          className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4 text-sm font-medium text-indigo-950"
        >
          {message}
        </p>
      )}

      {data && (
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          {/* Left Column: Obligation Selector & Config Status */}
          <div className="space-y-6">
            {data.bankConnectionCheck && (
              <section className="workspace-card space-y-4" aria-label="Kiểm tra kết nối ngân hàng">
                <h2 className="text-lg font-bold">Kiểm tra kết nối ngân hàng · {money(data.testAmountVnd ?? 10000)}</h2>
                <p className="text-sm">Đơn kiểm tra riêng, không phải học phí và không cấp quyền học. Chỉ chuyển tiền sau khi PO kiểm tra QR, người nhận và số tiền. Tiền vào chỉ được xác nhận sau webhook thật và đối soát SePay.</p>
                {!data.orders.length && <>
                  <label className="flex items-start gap-2 text-sm">
                    <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />
                    Tôi đồng ý tạo QR để kiểm tra thông tin; thao tác này chưa chuyển tiền.
                  </label>
                  <button className="btn-primary" type="button" disabled={!consent || busy || data.configuration !== 'VERIFIED'} onClick={() => void createBankCheck()}>Tạo QR kiểm tra ngân hàng</button>
                </>}
              </section>
            )}
            {data.configuration !== 'VERIFIED' && (
              <section
                className="workspace-card border-amber-300 bg-amber-50 text-amber-950"
                aria-label="Cấu hình thanh toán"
              >
                <h2 className="font-bold">Chưa khả dụng · Chưa xác minh tài khoản nhận</h2>
                <p className="mt-1 text-sm">
                  Operator cần cấu hình SePay, tài khoản ngân hàng và HTTPS callback trong môi
                  trường bảo mật. Chưa có mã QR để chuyển tiền.
                </p>
              </section>
            )}

            {user?.role === 'STUDENT' && !data.bankConnectionCheck && (
              <section className="workspace-card space-y-4">
                <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3">
                  <span className="grid size-9 place-items-center rounded-xl bg-indigo-50 text-indigo-600">
                    <Wallet size={18} aria-hidden="true" />
                  </span>
                  <div>
                    <h2 className="text-lg font-bold text-slate-950">
                      Đơn học phí được phép thanh toán
                    </h2>
                    <p className="text-xs text-slate-500">
                      Chọn nghĩa vụ học phí đã được phê duyệt để khởi tạo mã VietQR
                    </p>
                  </div>
                </div>

                {!data.eligibleObligations.length ? (
                  <p className="workspace-subcard text-sm text-slate-600">
                    Hiện tại bạn chưa có khoản học phí nào cần thanh toán. Các khoản phí mới sẽ xuất hiện tại đây sau khi hồ sơ nhập học được phê duyệt.
                  </p>
                ) : (
                  <>
                    <label className="block space-y-1.5 text-sm font-semibold text-slate-700">
                      Đơn học phí
                      <select
                        className="input-field py-2.5 text-sm"
                        value={selected}
                        onChange={(e) => {
                          setSelected(e.target.value);
                          setConsent(false);
                        }}
                      >
                        <option value="">Chọn đơn được duyệt</option>
                        {data.eligibleObligations.map((o) => (
                          <option key={o.id} value={o.id}>
                            {isTechnicalQaRecord(o.title) ? 'Học phí QA đã duyệt' : o.title} ·{' '}
                            {money(o.amountVnd)}
                          </option>
                        ))}
                      </select>
                    </label>

                    {selected && (
                      <details className="audit-disclosure">
                        <summary>Điều khoản gốc của nghĩa vụ</summary>
                        <p className="mt-1.5">
                          {data.eligibleObligations.find((o) => o.id === selected)?.title}
                        </p>
                        <p>
                          Giá và tên phiên bản gốc được giữ nguyên; đây là nguồn QA đã được duyệt.
                        </p>
                      </details>
                    )}

                    <label className="workspace-subcard flex items-start gap-2.5 text-sm leading-6 text-slate-700">
                      <input
                        type="checkbox"
                        className="mt-1 size-4 accent-indigo-600"
                        checked={consent}
                        onChange={(e) => setConsent(e.target.checked)}
                      />
                      <span>
                        Tôi đồng ý tạo chỉ dẫn chuyển khoản với đúng số tiền đã duyệt; thao tác này
                        chưa tự ghi nhận đã nhận tiền.
                      </span>
                    </label>

                    <button
                      type="button"
                      className="btn-primary w-full sm:w-auto"
                      disabled={!selected || !consent || busy || data.configuration !== 'VERIFIED'}
                      onClick={() => void create()}
                    >
                      <QrCode size={16} aria-hidden="true" />
                      {busy ? 'Đang tạo đơn…' : 'Tạo QR thanh toán'}
                    </button>
                  </>
                )}
              </section>
            )}
          </div>

          {/* Right Column: VietQR Checkout & Transaction List */}
          <div className="space-y-6">
            {active && active.qrUrl && (
              <section
                className="workspace-card border-indigo-200 bg-gradient-to-br from-white to-indigo-50/40"
                aria-label="Thông tin chuyển khoản SePay"
              >
                <div className="mb-4 flex items-center justify-between gap-2 border-b border-indigo-100 pb-3">
                  <div>
                    <span className="badge-info">VietQR sẵn sàng</span>
                    <h2 className="mt-1 text-lg font-bold text-slate-950">
                      Chi tiết thanh toán mã đơn
                    </h2>
                  </div>
                  <strong className="text-xl font-extrabold text-indigo-700">
                    {money(active.amountVnd)}
                  </strong>
                </div>
                <div className="grid items-center gap-6 sm:grid-cols-[minmax(0,1fr)_auto]">
                  <dl className="grid gap-3 text-sm sm:grid-cols-2">
                    <div className="workspace-subcard bg-white py-2.5">
                      <dt className="text-xs font-medium text-slate-500">Số tiền</dt>
                      <dd className="mt-0.5 font-bold text-slate-950">{money(active.amountVnd)}</dd>
                    </div>
                    <div className="workspace-subcard bg-white py-2.5">
                      <dt className="text-xs font-medium text-slate-500">Nội dung chuyển khoản</dt>
                      <dd className="mt-0.5 flex items-center justify-between gap-2 font-mono font-bold text-indigo-700">
                        <span>{active.code}</span>
                        <CopyTextButton value={active.code} label="Sao chép mã" />
                      </dd>
                    </div>
                    <div className="workspace-subcard bg-white py-2.5">
                      <dt className="text-xs font-medium text-slate-500">Ngân hàng nhận</dt>
                      <dd className="mt-0.5 flex items-center gap-1.5 font-semibold text-slate-900">
                        <Building2 size={14} className="text-slate-400" aria-hidden="true" />
                        {active.recipient.bankCode} · {active.recipient.accountNumber}
                      </dd>
                    </div>
                    <div className="workspace-subcard bg-white py-2.5">
                      <dt className="text-xs font-medium text-slate-500">Chủ tài khoản</dt>
                      <dd className="mt-0.5 font-semibold text-slate-900">
                        {active.recipient.accountHolder}
                      </dd>
                    </div>
                  </dl>
                  <div className="flex flex-col items-center rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                    <img
                      className="w-56 max-w-full rounded-xl"
                      src={active.qrUrl}
                      alt={'VietQR ' + active.code}
                      referrerPolicy="no-referrer"
                    />
                    <span className="mt-2 text-[11px] font-semibold text-slate-500">
                      Quét mã bằng ứng dụng ngân hàng
                    </span>
                  </div>
                </div>
              </section>
            )}

            {!!data.orders.length && (
              <section className="workspace-card space-y-4">
                <div className="border-b border-slate-100 pb-3">
                  <h2 className="text-lg font-bold text-slate-950">Đơn thanh toán đã tạo</h2>
                  <p className="text-xs text-slate-500">
                    Theo dõi trạng thái xác nhận từ cổng SePay theo thời gian thực
                  </p>
                </div>

                {data.orders.map((order) => (
                  <article key={order.id} className="workspace-subcard bg-white space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-mono text-sm font-bold text-slate-950">{order.code}</p>
                        <p className="mt-0.5 text-sm font-semibold text-indigo-700">
                          {money(order.amountVnd)}
                        </p>
                      </div>
                      <span className={stateBadge[order.state] ?? 'badge-info'}>
                        {stateLabel[order.state] ?? order.state}
                      </span>
                    </div>

                    <div className="grid gap-3 border-t border-slate-100 pt-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                      <div className="space-y-1.5 text-xs text-slate-600">
                        <p>
                          Ngân hàng:{' '}
                          <strong className="text-slate-900">{order.recipient.bankCode}</strong> ·
                          Số TK:{' '}
                          <strong className="font-mono text-slate-900">
                            {order.recipient.accountNumber}
                          </strong>
                        </p>
                        <p>
                          Chủ tài khoản:{' '}
                          <strong className="text-slate-900">
                            {order.recipient.accountHolder}
                          </strong>
                        </p>
                        <div className="flex items-center gap-2 pt-1">
                          <span className="rounded bg-slate-100 px-2 py-0.5 font-mono font-semibold text-slate-800">
                            {order.code}
                          </span>
                          <CopyTextButton value={order.code} label="Sao chép nội dung CK" />
                        </div>
                      </div>
                      {order.qrUrl && (
                        <div className="flex flex-col items-center rounded-xl border border-slate-200 bg-slate-50 p-2.5">
                          <img
                            className="w-52 max-w-full rounded-xl"
                            src={order.qrUrl}
                            alt={'VietQR ' + order.code}
                            referrerPolicy="no-referrer"
                          />
                          <span className="mt-2 text-[11px] font-semibold text-slate-500">
                            Quét mã VietQR để chuyển khoản
                          </span>
                        </div>
                      )}
                    </div>
                  </article>
                ))}
              </section>
            )}

            {cashier && (
              <section className="workspace-card space-y-4">
                {cashier.records?.map((row) => (
                  <Reconciliation key={row.id} row={row} busy={busy} onSave={reconcile} />
                ))}
              </section>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

function Reconciliation({
  row,
  busy,
  onSave,
}: {
  row: CashierRecord;
  busy: boolean;
  onSave: (id: string, d: 'CONFIRM_RECEIPT' | 'HOLD', reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState('');
  const isMatched = row.classification === 'EXACT_MATCH_PENDING_RECONCILIATION';
  return (
    <article className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-0.5">
          <h3 className="font-bold text-slate-950">Giao dịch #{row.transaction_id}</h3>
          <p className="text-xs text-slate-600">
            Mã đơn SePay: <code className="font-mono">{row.order_id}</code> · Nhận lúc{' '}
            {formatDateTimeVn(row.received_at)}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <span
            className={`inline-flex rounded px-2 py-0.5 text-[11px] font-semibold ${
              isMatched ? 'bg-[#e9f2e4] text-[#2f5d1e]' : 'bg-amber-100 text-amber-900'
            }`}
          >
            {classificationLabel[row.classification] ?? row.classification}
          </span>
          <span className="inline-flex rounded border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700">
            {row.decision ?? 'Chờ đối soát'}
          </span>
        </div>
      </div>

      <label className="block space-y-1 text-xs font-semibold text-slate-700">
        Lý do đối soát & dấu vết kiểm toán (tối thiểu 8 ký tự)
        <textarea
          className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#76a35e] focus:outline-none"
          rows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          minLength={8}
          maxLength={1000}
          placeholder="Ghi rõ kết quả đối chiếu mã tham chiếu, số tiền và bằng chứng..."
        />
      </label>

      <div className="flex flex-wrap gap-2.5">
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded bg-[#76a35e] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#658f50] disabled:opacity-50"
          disabled={
            busy ||
            !!row.decision ||
            reason.trim().length < 8 ||
            !isMatched
          }
          onClick={() => void onSave(row.id, 'CONFIRM_RECEIPT', reason.trim())}
        >
          <CheckCircle2 size={14} aria-hidden="true" />
          Xác nhận tiền vào đúng đơn
        </button>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"
          disabled={busy || !!row.decision || reason.trim().length < 8}
          onClick={() => void onSave(row.id, 'HOLD', reason.trim())}
        >
          Giữ chờ đối soát
        </button>
      </div>
    </article>
  );
}
