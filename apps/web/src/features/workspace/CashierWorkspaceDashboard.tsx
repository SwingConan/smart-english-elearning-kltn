import { useCallback, useEffect, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api-client';
import { useAuth } from '@/features/auth/auth-context';
import type { CashierWorkspaceData } from './UnifiedCashierTuitionPanel';

const vnd = (n: number) => `${n.toLocaleString('vi-VN')} đ`;

const classifLabels: Record<string, string> = {
  EXACT_MATCH: 'Khớp chuẩn',
  UNDERPAYMENT: 'Thiếu tiền',
  OVERPAYMENT: 'Dư tiền',
  UNMATCHED_CODE: 'Không khớp mã thanh toán',
  EXPIRED_HOLD: 'Quá hạn giữ chỗ',
  CLASS_FULL: 'Lớp đã hết chỗ',
  DUPLICATE_TX: 'Trùng lặp giao dịch',
  RECEIVER_MISMATCH: 'Sai tài khoản nhận',
  WRONG_TYPE: 'Sai loại giao dịch',
};

const recStatusLabels: Record<string, string> = {
  UNPAID: 'Chưa thanh toán',
  PARTIAL: 'Thu một phần',
  PAID: 'Đã thu đủ',
  OVERPAID: 'Nộp dư',
  NEEDS_RECONCILIATION: 'Cần đối soát',
  EXPIRED: 'Quá hạn giữ chỗ',
};

const txStateLabels: Record<string, string> = {
  AUTO_SETTLED: 'Tự động khớp SePay',
  PENDING_CASHIER_REVIEW: 'Chờ Thu ngân xử lý',
  RESOLVED_CONFIRMED: 'Đã xác nhận thủ công',
  RESOLVED_PARTIAL: 'Ghi nhận thu một phần',
  RESOLVED_REFUND_NEEDED: 'Cần hoàn tiền',
  RESOLVED_REJECTED: 'Từ chối / Không khớp',
};

function formatTxRef(id: string): string {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(id)) {
    return id.slice(0, 8).toUpperCase();
  }
  return id;
}

export function CashierWorkspaceDashboard() {
  const { user } = useAuth();
  const [data, setData] = useState<CashierWorkspaceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await apiFetch<CashierWorkspaceData>('/v2/payments/sepay/cashier');
      setData(res);
      setError('');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Không tải được dữ liệu tổng quan thu ngân.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!user) return null;

  const hasTestRecords =
    (data?.summary.testHarnessCollectedVnd ?? 0) > 0 || (data?.summary.receiptsTestCount ?? 0) > 0;
  const pendingTransactions =
    data?.transactions.filter((t) => t.reconciliationState === 'PENDING_CASHIER_REVIEW') ?? [];
  const recentTransactions =
    pendingTransactions.length > 0 ? pendingTransactions : (data?.transactions ?? []).slice(0, 4);

  return (
    <div className="space-y-6">
      <header className="rounded-xl border border-slate-200 bg-white p-5">
        <span className="inline-flex items-center rounded bg-[#e9f2e4] px-2.5 py-0.5 text-xs font-semibold text-[#2f5d1e]">
          Thu ngân Smart English · Tổng quan điều hành
        </span>
        <h1 className="mt-1.5 text-2xl font-bold text-[#e66f2b] sm:text-3xl">
          Tổng quan thu học phí &amp; công nợ
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Theo dõi nhanh tổng thực thu, tình trạng công nợ học viên, các giao dịch chờ xử lý và kênh
          nhận chuyển khoản SePay.
        </p>
      </header>

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-900"
        >
          {error}
        </div>
      )}

      {loading && !data ? (
        <div className="workspace-card text-sm text-slate-600">
          Đang tải số liệu tổng quan thu ngân…
        </div>
      ) : null}

      {data && (
        <>
          <section
            aria-label="Chỉ số tài chính thu ngân"
            className={`grid gap-3 sm:grid-cols-2 ${hasTestRecords ? 'xl:grid-cols-5' : 'xl:grid-cols-4'}`}
          >
            <div className="workspace-card space-y-1">
              <p className="text-xs font-medium text-slate-500">Tổng thực thu học phí</p>
              <p className="text-2xl font-bold text-emerald-700">
                {vnd(data.summary.realCollectedVnd)}
              </p>
              <p className="text-xs text-slate-500">{data.summary.receiptsRealCount} phiếu thu thật</p>
            </div>

            {hasTestRecords && (
              <div className="workspace-card space-y-1 border-amber-200 bg-amber-50/40">
                <p className="text-xs font-medium text-amber-800">Dữ liệu mô phỏng kiểm thử</p>
                <p className="text-2xl font-bold text-amber-900">
                  {vnd(data.summary.testHarnessCollectedVnd)}
                </p>
                <p className="text-xs text-amber-700">
                  {data.summary.receiptsTestCount} phiếu thu kiểm thử (tách khỏi doanh thu thật)
                </p>
              </div>
            )}

            <div className="workspace-card space-y-1">
              <p className="text-xs font-medium text-slate-500">Khoản phải thu &amp; Công nợ</p>
              <p className="text-2xl font-bold text-slate-900">
                {data.summary.totalReceivablesCount}
              </p>
              <p className="text-xs text-slate-500">
                Chờ thu/một phần: {data.summary.unpaidCount} · Đã thu đủ: {data.summary.paidCount}
              </p>
            </div>

            <div className="workspace-card space-y-1">
              <p className="text-xs font-medium text-slate-500">Ngoại lệ chờ xử lý</p>
              <p
                className={`text-2xl font-bold ${
                  data.summary.pendingExceptionsCount > 0 ? 'text-rose-700' : 'text-slate-900'
                }`}
              >
                {data.summary.pendingExceptionsCount}
              </p>
              <p className="text-xs text-slate-500">
                {data.summary.pendingExceptionsCount > 0
                  ? 'Thiếu/Dư/Sai mã cần Thu ngân rà soát'
                  : 'Không có giao dịch tồn đọng'}
              </p>
            </div>

            <div className="workspace-card space-y-1">
              <p className="text-xs font-medium text-slate-500">Phạm vi &amp; Kênh SePay</p>
              <p className="text-sm font-bold text-slate-900">
                {data.authority.hasAnyActiveFinanceVerifyGrant
                  ? `Đang hiệu lực (${data.authority.activeGrantsCount} phạm vi lớp)`
                  : 'Chưa có quyền / Đã hết hạn'}
              </p>
              <p className="text-xs text-slate-500">
                Ngân hàng:{' '}
                {data.sepay.configured
                  ? `${data.sepay.bankCode} · ${data.sepay.accountNumber}`
                  : 'Chưa cấu hình'}
              </p>
            </div>
          </section>

          <div className="grid gap-5 lg:grid-cols-2">
            <section className="workspace-card space-y-3">
              <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                <h2 className="text-base font-bold text-slate-900">
                  {pendingTransactions.length > 0
                    ? `Giao dịch cần xử lý (${pendingTransactions.length})`
                    : `Giao dịch SePay gần nhất (${recentTransactions.length})`}
                </h2>
              </div>
              {recentTransactions.length === 0 ? (
                <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-xs text-slate-500">
                  Chưa phát sinh giao dịch chuyển khoản nào.
                </p>
              ) : (
                <div className="space-y-2.5">
                  {recentTransactions.map((tx) => {
                    const isPending = tx.reconciliationState === 'PENDING_CASHIER_REVIEW';
                    return (
                      <article
                        key={tx.id}
                        className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 text-xs space-y-1"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-mono font-bold text-slate-900">
                            TX #{formatTxRef(tx.providerTransactionId)}
                          </span>
                          <div className="flex items-center gap-1.5">
                            <span className="rounded bg-slate-200/70 px-2 py-0.5 font-semibold text-slate-800">
                              {classifLabels[tx.classification] ?? tx.classification}
                            </span>
                            <span
                              className={`rounded-full px-2 py-0.5 font-semibold ${
                                isPending
                                  ? 'bg-rose-100 text-rose-900'
                                  : 'bg-emerald-100 text-emerald-900'
                              }`}
                            >
                              {txStateLabels[tx.reconciliationState] ?? tx.reconciliationState}
                            </span>
                          </div>
                        </div>
                        <p className="text-slate-700">
                          Số tiền: <strong>{vnd(tx.amountVnd)}</strong> · Mã CK:{' '}
                          <span className="font-mono">{tx.paymentCodeExtracted ?? '—'}</span>
                        </p>
                        {tx.receivable && (
                          <p className="text-slate-600">
                            {tx.receivable.learner.fullName} · Lớp{' '}
                            <strong>{tx.receivable.classOffering.code}</strong> · Đã thu/Phải thu:{' '}
                            {vnd(tx.receivable.paidAmountVnd)} / {vnd(tx.receivable.amountVnd)}
                          </p>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="workspace-card space-y-3">
              <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                <h2 className="text-base font-bold text-slate-900">
                  Khoản phải thu &amp; Phiếu thu gần đây
                </h2>
              </div>
              {data.receivables.length === 0 ? (
                <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-xs text-slate-500">
                  Chưa có khoản phải thu nào được ghi nhận.
                </p>
              ) : (
                <div className="space-y-2.5">
                  {data.receivables.slice(0, 5).map((r) => (
                    <div
                      key={r.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2.5 text-xs"
                    >
                      <div className="space-y-0.5">
                        <p className="font-semibold text-slate-900">
                          {r.learner.fullName} ·{' '}
                          <span className="font-mono text-[#2f5d1e]">{r.receivableCode}</span>
                        </p>
                        <p className="text-slate-600">
                          Lớp {r.classOffering.code} · Đã thu {vnd(r.paidAmountVnd)} · Tổng{' '}
                          {vnd(r.amountVnd)}
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-2.5 py-0.5 font-semibold ${
                          r.status === 'PAID'
                            ? 'bg-emerald-100 text-emerald-900'
                            : r.status === 'EXPIRED'
                              ? 'bg-slate-200 text-slate-700'
                              : 'bg-amber-100 text-amber-900'
                        }`}
                      >
                        {recStatusLabels[r.status] ?? r.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
