import { useCallback, useEffect, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api-client';
import { useAuth } from '@/features/auth/auth-context';

export interface CashierWorkspaceData {
  authority: {
    hasAnyActiveFinanceVerifyGrant: boolean;
    activeGrantsCount: number;
    grantedClassIds: string[];
  };
  sepay: {
    configured: boolean;
    bankCode: string | null;
    gateway: string | null;
    accountNumber: string | null;
    accountHolder: string | null;
  };
  summary: {
    realCollectedVnd: number;
    testHarnessCollectedVnd: number;
    totalReceivablesCount: number;
    unpaidCount: number;
    paidCount: number;
    pendingExceptionsCount: number;
    receiptsRealCount: number;
    receiptsTestCount: number;
  };
  receivables: Array<{
    id: string;
    receivableCode: string;
    amountVnd: number;
    paidAmountVnd: number;
    status: string;
    dueAt: string | null;
    paidAt: string | null;
    isTestHarness: boolean;
    learner: { id: string; fullName: string; email: string };
    classOffering: { id: string; code: string; name: string; maxStudents: number | null };
    enrollment: { id: string; status: string; reservedUntil: string | null; entrySource: string | null };
    paymentOrders: Array<{ id: string; paymentCode: string; status: string; expiresAt: string }>;
    receipt: { id: string; receiptNumber: string; isTestHarness: boolean } | null;
  }>;
  transactions: Array<{
    id: string;
    providerTransactionId: string;
    paymentCodeExtracted: string | null;
    amountVnd: number;
    content: string;
    referenceCode: string | null;
    gateway: string | null;
    transactionDate: string;
    classification: string;
    reconciliationState: string;
    verificationSource: string;
    verifiedBankApi: boolean;
    isTestHarness: boolean;
    resolutionNote: string | null;
    resolvedAt: string | null;
    order: { id: string; paymentCode: string; expectedAmountVnd: number; status: string } | null;
    receivable: {
      id: string;
      receivableCode: string;
      amountVnd: number;
      paidAmountVnd: number;
      status: string;
      learner: { id: string; fullName: string; email: string };
      classOffering: { id: string; code: string; name: string };
    } | null;
    receipt: { id: string; receiptNumber: string; isTestHarness: boolean } | null;
  }>;
  receipts: Array<{
    id: string;
    receiptNumber: string;
    amountVnd: number;
    verificationMethod: string;
    isTestHarness: boolean;
    issuedAt: string;
    learner: { id: string; fullName: string; email: string };
    classOffering: { id: string; code: string; name: string };
    receivable: { id: string; receivableCode: string };
    transaction: {
      id: string;
      providerTransactionId: string;
      gateway: string | null;
      verificationSource: string;
    };
  }>;
  reconciliationActions: Array<{
    id: string;
    action: string;
    previousState: string | null;
    nextState: string;
    note: string | null;
    createdAt: string;
    actor: { id: string; fullName: string; email: string } | null;
  }>;
  historicalLegacy: {
    w07Applications: Array<{
      id: string;
      learnerEmail: string;
      learnerName: string;
      classCode: string;
      state: string;
      amountVnd: number;
      createdAt: string;
    }>;
    bankCheckOrders: Array<{
      id: string;
      payment_code: string;
      amount_vnd: number;
      status: string;
      created_at: string;
    }>;
  };
}

const vnd = (n: number) => `${n.toLocaleString('vi-VN')} đ`;

const classifLabels: Record<string, string> = {
  EXACT_MATCH: 'Khớp chuẩn',
  UNDERPAYMENT: 'Thiếu tiền',
  OVERPAYMENT: 'Dư tiền',
  UNMATCHED_CODE: 'Không khớp mã thanh toán',
  EXPIRED_HOLD: 'Quá hạn giữ chỗ 15 phút',
  CLASS_FULL: 'Lớp đã hết chỗ',
  DUPLICATE_TX: 'Trùng lặp giao dịch',
  RECEIVER_MISMATCH: 'Sai tài khoản nhận',
  WRONG_TYPE: 'Sai loại giao dịch',
};

const reconciliationLabels: Record<string, string> = {
  AUTO_SETTLED: 'Tự động khớp SePay',
  PENDING_CASHIER_REVIEW: 'Chờ Thu ngân xử lý',
  RESOLVED_CONFIRMED: 'Đã xác nhận thủ công',
  RESOLVED_PARTIAL: 'Ghi nhận thu một phần',
  RESOLVED_REFUND_NEEDED: 'Cần hoàn tiền',
  RESOLVED_REJECTED: 'Từ chối / Không khớp',
};

const receivableStatusLabels: Record<string, string> = {
  UNPAID: 'Chưa thanh toán',
  PARTIAL: 'Thu một phần',
  PAID: 'Đã thu đủ',
  OVERPAID: 'Nộp dư',
  NEEDS_RECONCILIATION: 'Cần đối soát',
  EXPIRED: 'Quá hạn giữ chỗ',
  APPROVED: 'Đã duyệt',
  SUBMITTED: 'Đã nộp hồ sơ',
  PENDING: 'Chờ xử lý',
  PENDING_PAYMENT: 'Chờ thanh toán',
  COMPLETED: 'Hoàn thành',
  REJECTED: 'Từ chối',
};

const enrollmentStatusLabels: Record<string, string> = {
  ACTIVE: 'Đang theo học',
  PENDING_PAYMENT: 'Chờ thanh toán',
  CANCELLED: 'Đã hủy',
  COMPLETED: 'Hoàn thành',
};

const verificationMethodLabels: Record<string, string> = {
  SEPAY_AUTO_VERIFIED: 'Xác nhận tự động qua SePay',
  CASHIER_MANUAL_VERIFIED: 'Thu ngân đối soát thủ công',
  DEV_SYNTHETIC_TEST_HARNESS: 'Mô phỏng kiểm thử',
};

function formatTxRef(id: string): string {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(id)) {
    return id.slice(0, 8).toUpperCase();
  }
  return id;
}

export function UnifiedCashierTuitionPanel() {
  const { user } = useAuth();
  const [data, setData] = useState<CashierWorkspaceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState('ALL');
  const [scopeFilter, setScopeFilter] = useState<'ALL' | 'REAL' | 'TEST'>('ALL');
  const [tab, setTab] = useState<'EXCEPTIONS' | 'RECEIVABLES' | 'RECEIPTS' | 'LEGACY'>('EXCEPTIONS');

  // Resolution state per tx id
  const [notesByTx, setNotesByTx] = useState<Record<string, string>>({});
  const [targetRecByTx, setTargetRecByTx] = useState<Record<string, string>>({});
  const [busyTxId, setBusyTxId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const qs = new URLSearchParams();
      if (search.trim()) qs.set('search', search.trim());
      if (stateFilter !== 'ALL') qs.set('state', stateFilter);
      if (scopeFilter !== 'ALL') qs.set('scope', scopeFilter);
      const url = `/v2/payments/sepay/cashier${qs.toString() ? `?${qs.toString()}` : ''}`;
      const res = await apiFetch<CashierWorkspaceData>(url);
      setData(res);
      setError('');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Không tải được dữ liệu thu ngân hợp nhất.');
    } finally {
      setLoading(false);
    }
  }, [search, stateFilter, scopeFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleResolve = async (
    txId: string,
    decision:
      | 'CONFIRM_MATCH_AND_ACTIVATE'
      | 'MARK_PARTIAL_KEEP_PENDING'
      | 'MARK_REFUND_NEEDED'
      | 'REJECT_UNMATCHED',
  ) => {
    const reason = (notesByTx[txId] ?? '').trim();
    if (reason.length < 5) {
      setError('Vui lòng nhập lý do đối soát tối thiểu 5 ký tự.');
      return;
    }
    setBusyTxId(txId);
    setError('');
    setNotice('');
    try {
      const res = await apiFetch<{
        reconciliationState: string;
        receiptNumber: string | null;
      }>(`/v2/payments/sepay/transactions/${encodeURIComponent(txId)}/reconcile`, {
        method: 'POST',
        body: JSON.stringify({
          decision,
          receivableId: targetRecByTx[txId] || undefined,
          reason,
        }),
      });
      setNotice(
        `Đã đối soát giao dịch: ${reconciliationLabels[res.reconciliationState] ?? res.reconciliationState}${
          res.receiptNumber ? ` (Phiếu thu: ${res.receiptNumber})` : ''
        }`,
      );
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Không thể thực hiện đối soát.');
    } finally {
      setBusyTxId(null);
    }
  };

  if (loading && !data) {
    return (
      <div className="workspace-card text-sm text-slate-600">
        Đang tải dữ liệu thu ngân, khoản phải thu & đối soát SePay...
      </div>
    );
  }

  return (
    <section className="space-y-6" aria-label="Sổ thu ngân học phí hợp nhất">
      {error && (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-900">
          {error}
        </div>
      )}
      {notice && (
        <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900">
          {notice}
        </div>
      )}

      {data && (
        <>
          {(() => {
            const hasTestRecords =
              data.summary.testHarnessCollectedVnd > 0 || data.summary.receiptsTestCount > 0;
            const legacyCount =
              data.historicalLegacy.w07Applications.length +
              data.historicalLegacy.bankCheckOrders.length;
            return (
              <>
                <div
                  className={`grid gap-3 sm:grid-cols-2 ${
                    hasTestRecords ? 'xl:grid-cols-5' : 'xl:grid-cols-4'
                  }`}
                >
                  <div className="workspace-card space-y-1">
                    <p className="text-xs font-medium text-slate-500">Tổng thực thu học phí</p>
                    <p className="text-xl font-bold text-emerald-700">
                      {vnd(data.summary.realCollectedVnd)}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {data.summary.receiptsRealCount} phiếu thu thật
                    </p>
                  </div>
                  {hasTestRecords && (
                    <div className="workspace-card space-y-1 border-amber-200 bg-amber-50/40">
                      <p className="text-xs font-medium text-amber-800">
                        Dữ liệu mô phỏng kiểm thử
                      </p>
                      <p className="text-xl font-bold text-amber-900">
                        {vnd(data.summary.testHarnessCollectedVnd)}
                      </p>
                      <p className="text-[11px] text-amber-700">
                        {data.summary.receiptsTestCount} phiếu thu kiểm thử (tách riêng)
                      </p>
                    </div>
                  )}
                  <div className="workspace-card space-y-1">
                    <p className="text-xs font-medium text-slate-500">Khoản phải thu</p>
                    <p className="text-xl font-bold text-slate-900">
                      {data.summary.totalReceivablesCount}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Chờ thu/một phần: {data.summary.unpaidCount} · Đã thu đủ:{' '}
                      {data.summary.paidCount}
                    </p>
                  </div>
                  <div className="workspace-card space-y-1">
                    <p className="text-xs font-medium text-slate-500">Ngoại lệ chờ xử lý</p>
                    <p
                      className={`text-xl font-bold ${
                        data.summary.pendingExceptionsCount > 0
                          ? 'text-rose-700'
                          : 'text-slate-900'
                      }`}
                    >
                      {data.summary.pendingExceptionsCount}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Thiếu/Dư/Sai mã/Quá hạn/Hết chỗ
                    </p>
                  </div>
                  <div className="workspace-card space-y-1">
                    <p className="text-xs font-medium text-slate-500">Phạm vi &amp; Kênh SePay</p>
                    <p className="text-sm font-bold text-slate-900">
                      {data.authority.hasAnyActiveFinanceVerifyGrant
                        ? `Đang hiệu lực (${data.authority.activeGrantsCount} phạm vi lớp)`
                        : 'Chưa có quyền / Đã hết hạn'}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      SePay:{' '}
                      {data.sepay.configured
                        ? `${data.sepay.bankCode} ${data.sepay.accountNumber}`
                        : 'Chưa cấu hình'}
                    </p>
                  </div>
                </div>

                <div className="workspace-card flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap gap-2">
                    {(
                      [
                        ['EXCEPTIONS', `Giao dịch & Ngoại lệ (${data.transactions.length})`],
                        ['RECEIVABLES', `Khoản phải thu & Công nợ (${data.receivables.length})`],
                        ['RECEIPTS', `Phiếu thu (${data.receipts.length})`],
                        ...(legacyCount > 0
                          ? ([['LEGACY', `Dữ liệu trước đây (${legacyCount})`]] as const)
                          : []),
                      ] as const
                    ).map(([key, label]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setTab(key)}
                        className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                          tab === key
                            ? 'bg-slate-900 text-white'
                            : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="search"
                      aria-label="Tìm giao dịch hoặc khoản phải thu"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Tìm mã khoản thu, mã CK, email, lớp..."
                      className="min-w-[260px] rounded-lg border border-slate-300 px-3 py-1.5 text-xs"
                    />
                    {hasTestRecords && (
                      <select
                        aria-label="Lọc nguồn giao dịch"
                        value={scopeFilter}
                        onChange={(e) => setScopeFilter(e.target.value as 'ALL' | 'REAL' | 'TEST')}
                        className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
                      >
                        <option value="ALL">Mọi nguồn giao dịch</option>
                        <option value="REAL">Giao dịch chính thức</option>
                        <option value="TEST">Giao dịch kiểm thử</option>
                      </select>
                    )}
                    <select
                      aria-label="Lọc trạng thái khoản thu"
                      value={stateFilter}
                      onChange={(e) => setStateFilter(e.target.value)}
                      className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
                    >
                      <option value="ALL">Mọi trạng thái nợ</option>
                      <option value="UNPAID">Chưa thanh toán</option>
                      <option value="PARTIAL">Thu một phần</option>
                      <option value="PAID">Đã thu đủ</option>
                      <option value="OVERPAID">Nộp dư</option>
                      <option value="NEEDS_RECONCILIATION">Cần đối soát</option>
                      <option value="EXPIRED">Quá hạn giữ chỗ</option>
                    </select>
                  </div>
                </div>
              </>
            );
          })()}

          {tab === 'EXCEPTIONS' && (
            <div className="space-y-3">
              {data.transactions.length === 0 ? (
                <div className="workspace-card text-sm text-slate-500">
                  Chưa có giao dịch học phí nào phù hợp bộ lọc.
                </div>
              ) : (
                data.transactions.map((tx) => {
                  const isPending = tx.reconciliationState === 'PENDING_CASHIER_REVIEW';
                  const canMutate = user?.role === 'CASHIER';
                  return (
                    <article
                      key={tx.id}
                      data-testid={`cashier-tx-${tx.providerTransactionId}`}
                      className="workspace-card space-y-3"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-sm font-bold text-slate-900">
                              TX #{formatTxRef(tx.providerTransactionId)}
                            </span>
                            <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-800">
                              {classifLabels[tx.classification] ?? tx.classification}
                            </span>
                            <span
                              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                                isPending
                                  ? 'bg-rose-100 text-rose-900'
                                  : 'bg-emerald-100 text-emerald-900'
                              }`}
                            >
                              {reconciliationLabels[tx.reconciliationState] ?? tx.reconciliationState}
                            </span>
                            {tx.isTestHarness && (
                              <span className="rounded bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-900">
                                Dữ liệu kiểm thử
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-600">
                            Số tiền: <strong>{vnd(tx.amountVnd)}</strong> · Mã tách được:{' '}
                            <code className="font-mono">{tx.paymentCodeExtracted ?? '—'}</code> · Nội dung:{' '}
                            <code className="font-mono">{tx.content}</code>
                          </p>
                          {tx.receivable && (
                            <p className="text-xs text-slate-600">
                              Khoản thu: <strong>{tx.receivable.receivableCode}</strong> · Học viên:{' '}
                              {tx.receivable.learner.fullName} ({tx.receivable.learner.email}) · Lớp:{' '}
                              <strong>{tx.receivable.classOffering.code}</strong> · Đã thu/Phải thu:{' '}
                              {vnd(tx.receivable.paidAmountVnd)} / {vnd(tx.receivable.amountVnd)}
                            </p>
                          )}
                          {tx.receipt && (
                            <p className="text-xs font-semibold text-emerald-800">
                              Phiếu thu đã cấp: <span className="font-mono">{tx.receipt.receiptNumber}</span>
                            </p>
                          )}
                          {tx.resolutionNote && (
                            <p className="text-xs text-slate-700">
                              Kết quả xử lý: {tx.resolutionNote}
                            </p>
                          )}
                        </div>
                        <span className="text-xs text-slate-500">
                          {new Date(tx.transactionDate).toLocaleString('vi-VN')}
                        </span>
                      </div>

                      {isPending && canMutate && (
                        <div className="space-y-2.5 border-t border-slate-100 pt-3">
                          {!tx.receivable && data.receivables.length > 0 && (
                            <label className="block text-xs font-semibold text-slate-700">
                              Ghép vào khoản phải thu (nếu chuyển sai mã):
                              <select
                                value={targetRecByTx[tx.id] ?? ''}
                                onChange={(e) =>
                                  setTargetRecByTx((prev) => ({ ...prev, [tx.id]: e.target.value }))
                                }
                                className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
                              >
                                <option value="">-- Chọn khoản phải thu --</option>
                                {data.receivables
                                  .filter((r) => r.status !== 'PAID')
                                  .map((r) => (
                                    <option key={r.id} value={r.id}>
                                      {r.receivableCode} · {r.learner.email} · {r.classOffering.code} ({vnd(r.amountVnd)})
                                    </option>
                                  ))}
                              </select>
                            </label>
                          )}
                          <label className="block text-xs font-semibold text-slate-700">
                            Ghi chú đối soát của Thu ngân (bắt buộc &ge; 5 ký tự):
                            <input
                              type="text"
                              value={notesByTx[tx.id] ?? ''}
                              onChange={(e) =>
                                setNotesByTx((prev) => ({ ...prev, [tx.id]: e.target.value }))
                              }
                              placeholder="Ví dụ: Đã đối chiếu sao kê MB & số tiền thực nhận..."
                              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs"
                            />
                          </label>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              disabled={busyTxId === tx.id}
                              onClick={() => void handleResolve(tx.id, 'CONFIRM_MATCH_AND_ACTIVATE')}
                              className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
                            >
                              Xác nhận đủ tiền & kích hoạt LMS
                            </button>
                            <button
                              type="button"
                              disabled={busyTxId === tx.id}
                              onClick={() => void handleResolve(tx.id, 'MARK_PARTIAL_KEEP_PENDING')}
                              className="rounded-lg border border-sky-300 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-900 hover:bg-sky-100 disabled:opacity-50"
                            >
                              Ghi nhận thu một phần (giữ chờ)
                            </button>
                            <button
                              type="button"
                              disabled={busyTxId === tx.id}
                              onClick={() => void handleResolve(tx.id, 'MARK_REFUND_NEEDED')}
                              className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-50"
                            >
                              Đánh dấu cần hoàn tiền
                            </button>
                            <button
                              type="button"
                              disabled={busyTxId === tx.id}
                              onClick={() => void handleResolve(tx.id, 'REJECT_UNMATCHED')}
                              className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-900 hover:bg-rose-100 disabled:opacity-50"
                            >
                              Từ chối / Không khớp
                            </button>
                          </div>
                        </div>
                      )}
                    </article>
                  );
                })
              )}
            </div>
          )}

          {tab === 'RECEIVABLES' && (
            <div className="workspace-card overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 text-slate-500">
                  <tr>
                    <th className="py-2 pr-3">Mã khoản thu</th>
                    <th className="py-2 pr-3">Học viên</th>
                    <th className="py-2 pr-3">Lớp</th>
                    <th className="py-2 pr-3">Phải thu</th>
                    <th className="py-2 pr-3">Đã thu</th>
                    <th className="py-2 pr-3">Mã CK mới nhất</th>
                    <th className="py-2 pr-3">Trạng thái</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.receivables.map((r) => (
                    <tr key={r.id}>
                      <td className="py-2.5 pr-3 font-mono font-semibold">
                        {r.receivableCode}
                        {r.isTestHarness && (
                          <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] font-bold text-amber-900">
                            Kiểm thử
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 pr-3">
                        <div className="font-semibold text-slate-900">{r.learner.fullName}</div>
                        <div className="text-slate-500">{r.learner.email}</div>
                      </td>
                      <td className="py-2.5 pr-3">
                        {r.classOffering.code} ·{' '}
                        {enrollmentStatusLabels[r.enrollment.status] ?? r.enrollment.status}
                      </td>
                      <td className="py-2.5 pr-3 font-semibold">{vnd(r.amountVnd)}</td>
                      <td className="py-2.5 pr-3 font-semibold text-emerald-700">
                        {vnd(r.paidAmountVnd)}
                      </td>
                      <td className="py-2.5 pr-3 font-mono">
                        {r.paymentOrders[0]?.paymentCode ?? '—'}
                      </td>
                      <td className="py-2.5 pr-3">
                        <span
                          className={`rounded px-2 py-0.5 font-semibold ${
                            r.status === 'PAID'
                              ? 'bg-emerald-100 text-emerald-900'
                              : r.status === 'EXPIRED'
                                ? 'bg-slate-200 text-slate-700'
                                : 'bg-amber-100 text-amber-900'
                          }`}
                        >
                          {receivableStatusLabels[r.status] ?? r.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'RECEIPTS' && (
            <div className="workspace-card overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 text-slate-500">
                  <tr>
                    <th className="py-2 pr-3">Số phiếu thu</th>
                    <th className="py-2 pr-3">Học viên</th>
                    <th className="py-2 pr-3">Lớp</th>
                    <th className="py-2 pr-3">Số tiền</th>
                    <th className="py-2 pr-3">Phương thức xác minh</th>
                    <th className="py-2 pr-3">Ngày cấp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.receipts.map((rc) => (
                    <tr key={rc.id}>
                      <td className="py-2.5 pr-3 font-mono font-bold">
                        {rc.receiptNumber}
                        {rc.isTestHarness && (
                          <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] font-bold text-amber-900">
                            Kiểm thử
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 pr-3">{rc.learner.email}</td>
                      <td className="py-2.5 pr-3">{rc.classOffering.code}</td>
                      <td className="py-2.5 pr-3 font-semibold text-emerald-700">
                        {vnd(rc.amountVnd)}
                      </td>
                      <td className="py-2.5 pr-3">
                        {verificationMethodLabels[rc.verificationMethod] ?? rc.verificationMethod}
                      </td>
                      <td className="py-2.5 pr-3">
                        {new Date(rc.issuedAt).toLocaleString('vi-VN')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'LEGACY' && (
            <div className="workspace-card space-y-4">
              {data.historicalLegacy.w07Applications.length > 0 && (
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Hồ sơ ghi danh trước đây (chỉ đọc)
                  </h3>
                  {data.historicalLegacy.w07Applications.map((a) => (
                    <p key={a.id} className="mt-1 text-xs text-slate-600">
                      {a.classCode} · {a.learnerEmail} · {vnd(a.amountVnd)} ·{' '}
                      {receivableStatusLabels[a.state] ?? a.state}
                    </p>
                  ))}
                </div>
              )}
              {data.historicalLegacy.bankCheckOrders.length > 0 && (
                <div className="border-t border-slate-100 pt-3">
                  <h3 className="text-sm font-bold text-slate-900">
                    Giao dịch kiểm tra kết nối tài khoản ngân hàng (chỉ đọc)
                  </h3>
                  {data.historicalLegacy.bankCheckOrders.map((b) => (
                    <p key={b.id} className="mt-1 font-mono text-xs text-slate-600">
                      {b.payment_code} · {vnd(b.amount_vnd)} ·{' '}
                      {receivableStatusLabels[b.status] ?? b.status}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
