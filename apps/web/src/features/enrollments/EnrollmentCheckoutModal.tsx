import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, Clock3, Copy, RefreshCw, ShieldCheck, X } from 'lucide-react';
import { Link } from 'react-router';
import { modalityLabel } from '@/features/catalog/display';
import type { EnrollmentView } from './types';

const moneyFormatter = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' });
const timeFormatter = new Intl.DateTimeFormat('vi-VN', {
  hour: '2-digit',
  minute: '2-digit',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'Asia/Ho_Chi_Minh',
});
const shortDateFormatter = new Intl.DateTimeFormat('vi-VN', {
  dateStyle: 'medium',
  timeZone: 'Asia/Ho_Chi_Minh',
});

export function formatCountdown(totalSeconds: number): string {
  const clamped = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(clamped / 60);
  const secs = clamped % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function EnrollmentCheckoutModal({
  open,
  enrollment,
  learnerName,
  learnerEmail,
  onClose,
  onRefresh,
  onRetryHold,
  refreshing,
  retrying,
  error,
}: {
  open: boolean;
  enrollment: EnrollmentView;
  learnerName?: string | null;
  learnerEmail?: string | null;
  onClose: () => void;
  onRefresh: () => void;
  onRetryHold: () => void;
  refreshing: boolean;
  retrying: boolean;
  error: string | null;
}) {
  const [copiedCode, setCopiedCode] = useState(false);
  const activeOrder = enrollment.activeOrder ?? null;
  const order = activeOrder ?? enrollment.latestOrder ?? null;

  const targetEpochMs = useMemo(() => {
    if (!activeOrder) return 0;
    if (typeof activeOrder.remainingSeconds === 'number' && activeOrder.remainingSeconds > 0) {
      return Date.now() + activeOrder.remainingSeconds * 1000;
    }
    const parsed = Date.parse(activeOrder.expiresAt);
    return Number.isFinite(parsed) ? parsed : 0;
  }, [activeOrder?.id, activeOrder?.expiresAt, activeOrder?.remainingSeconds]);

  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!open || enrollment.status !== 'PENDING_PAYMENT') return;
    setNowMs(Date.now());
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [open, enrollment.status, targetEpochMs]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  const remainingSeconds =
    enrollment.status === 'PENDING_PAYMENT' && targetEpochMs > 0
      ? Math.max(0, Math.ceil((targetEpochMs - nowMs) / 1000))
      : 0;
  const isHoldActive = enrollment.status === 'PENDING_PAYMENT' && Boolean(activeOrder) && remainingSeconds > 0;
  const expectedAmount =
    activeOrder?.expectedAmountVnd ??
    enrollment.receivable?.amountVnd ??
    enrollment.classOffering.tuitionFeeVnd ??
    0;

  const handleCopy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedCode(true);
      window.setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      setCopiedCode(false);
    }
  };

  const modalNode = (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-slate-950/65 p-3 sm:p-6 backdrop-blur-xs"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="enrollment-checkout-title"
    >
      <div className="my-auto max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-3xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4 sm:px-6">
          <div>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
                enrollment.status === 'ACTIVE'
                  ? 'bg-emerald-100 text-emerald-800'
                  : isHoldActive
                    ? 'bg-amber-100 text-amber-900'
                    : 'bg-rose-100 text-rose-800'
              }`}
            >
              {enrollment.status === 'ACTIVE' ? (
                <>
                  <CheckCircle2 size={14} />
                  Thanh toán thành công
                </>
              ) : isHoldActive ? (
                <>
                  <Clock3 size={14} />
                  Đang giữ chỗ 15 phút · Chờ thanh toán
                </>
              ) : (
                <>
                  <Clock3 size={14} />
                  Hết thời gian giữ chỗ
                </>
              )}
            </span>
            <h2 id="enrollment-checkout-title" className="mt-2 text-lg font-bold text-slate-900 sm:text-xl">
              {enrollment.status === 'ACTIVE'
                ? 'Ghi danh lớp học hoàn tất'
                : 'Xác nhận đăng ký & Thanh toán học phí'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng pop-up thanh toán"
            className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4 p-5 sm:p-6">
          {enrollment.status === 'ACTIVE' ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-950">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-base font-bold">
                    Hệ thống đã đối soát thanh toán và ghi nhận bạn vào lớp!
                  </p>
                  <p className="mt-1 text-sm text-emerald-800">
                    Khóa: {enrollment.classOffering.name} ({enrollment.classOffering.code})
                    {enrollment.receivable?.receipt?.receiptNumber
                      ? ` · Phiếu thu ${enrollment.receivable.receipt.receiptNumber}`
                      : ''}
                  </p>
                </div>
                <Link
                  to={`/classroom/${enrollment.classOffering.id}`}
                  className="btn-primary shrink-0 text-center"
                >
                  Vào lớp học ngay
                </Link>
              </div>
            </div>
          ) : isHoldActive && activeOrder ? (
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-indigo-200 bg-indigo-50 px-5 py-4 text-indigo-950">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-600 text-white">
                  <Clock3 size={22} />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">
                    Thời gian giữ chỗ còn lại
                  </p>
                  <p className="text-sm text-indigo-900">
                    Giữ chỗ đến{' '}
                    <span className="font-semibold">
                      {timeFormatter.format(new Date(activeOrder.expiresAt))}
                    </span>
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p
                  data-testid="checkout-countdown"
                  className="font-mono text-3xl font-extrabold tracking-tight text-indigo-700 tabular-nums"
                >
                  {formatCountdown(remainingSeconds)}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-rose-950">
              <div>
                <p className="font-semibold">Phiên giữ chỗ đã hết hạn hoặc chưa sẵn sàng.</p>
                <p className="mt-1 text-sm text-rose-800">
                  Bấm giữ chỗ lại để tạo mã VietQR thanh toán mới (15 phút).
                </p>
              </div>
              <button
                type="button"
                onClick={onRetryHold}
                disabled={retrying}
                className="btn-primary shrink-0"
              >
                {retrying ? 'Đang tạo giữ chỗ...' : 'Giữ chỗ lại 15 phút'}
              </button>
            </div>
          )}

          {error ? (
            <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800" role="alert">
              {error}
            </p>
          ) : null}

          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-5">
              <h3 className="text-sm font-bold uppercase tracking-wide text-slate-600">
                Thông tin xác nhận đăng ký
              </h3>
              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="text-slate-500">Chương trình</dt>
                  <dd className="font-semibold text-slate-900">
                    {enrollment.classOffering.course.title}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Lớp học</dt>
                  <dd className="font-semibold text-slate-900">
                    {enrollment.classOffering.name}{' '}
                    <span className="ml-1 rounded bg-slate-200 px-1.5 py-0.5 text-xs font-mono text-slate-700">
                      {enrollment.classOffering.code}
                    </span>
                  </dd>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <dt className="text-slate-500">Hình thức</dt>
                    <dd className="font-medium text-slate-800">
                      {modalityLabel(enrollment.classOffering.modality)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Khai giảng dự kiến</dt>
                    <dd className="font-medium text-slate-800">
                      {enrollment.classOffering.classStart
                        ? shortDateFormatter.format(new Date(enrollment.classOffering.classStart))
                        : 'Đang cập nhật'}
                    </dd>
                  </div>
                </div>
                {learnerName || learnerEmail ? (
                  <div>
                    <dt className="text-slate-500">Học viên đăng ký</dt>
                    <dd className="font-medium text-slate-800">
                      {learnerName ?? 'Học viên'}
                      {learnerEmail ? ` (${learnerEmail})` : ''}
                    </dd>
                  </div>
                ) : null}
                {enrollment.receivable?.receivableCode ? (
                  <div>
                    <dt className="text-slate-500">Mã khoản thu</dt>
                    <dd className="font-mono text-xs font-semibold text-slate-700">
                      {enrollment.receivable.receivableCode}
                    </dd>
                  </div>
                ) : null}
                <div className="border-t border-slate-200 pt-3">
                  <dt className="text-slate-500">Tổng học phí cần thanh toán</dt>
                  <dd className="mt-1 text-2xl font-extrabold text-indigo-700">
                    {moneyFormatter.format(expectedAmount)}
                  </dd>
                </div>
              </dl>

              <div className="flex items-start gap-2 rounded-xl bg-white p-3 text-xs leading-5 text-slate-600 ring-1 ring-slate-200/80">
                <ShieldCheck size={16} className="mt-0.5 shrink-0 text-emerald-600" />
                <span>
                  Lớp học chỉ mở sau khi xác nhận thanh toán. Vui lòng giữ nguyên số tiền và nội dung chuyển khoản để SePay tự động đối soát ngay.
                </span>
              </div>
            </div>

            <div className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wide text-slate-600">
                  Quét mã VietQR để thanh toán
                </h3>

                {isHoldActive && activeOrder ? (
                  activeOrder.qrUrl ? (
                    <div className="mt-3 flex flex-col items-center">
                      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-xs">
                        <img
                          src={activeOrder.qrUrl}
                          alt={`Mã VietQR thanh toán ${activeOrder.paymentCode}`}
                          referrerPolicy="no-referrer"
                          className="h-48 w-48 object-contain"
                        />
                      </div>

                      <div className="mt-4 w-full space-y-2 rounded-xl bg-slate-50 p-3.5 text-sm">
                        <div className="flex justify-between gap-2">
                          <span className="text-slate-500">Ngân hàng</span>
                          <span className="font-semibold text-slate-900">
                            {activeOrder.bankCode ?? 'MB'}
                          </span>
                        </div>
                        <div className="flex justify-between gap-2">
                          <span className="text-slate-500">Số tài khoản</span>
                          <span className="font-mono font-semibold text-slate-900">
                            {activeOrder.accountNumber ?? '—'}
                          </span>
                        </div>
                        <div className="flex justify-between gap-2">
                          <span className="text-slate-500">Chủ tài khoản</span>
                          <span className="font-semibold text-slate-900">
                            {activeOrder.accountName ?? '—'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2 border-t border-slate-200 pt-2">
                          <span className="text-slate-500">Nội dung CK</span>
                          <div className="flex items-center gap-2">
                            <span className="rounded bg-amber-100 px-2 py-0.5 font-mono text-xs font-bold text-amber-950">
                              {activeOrder.paymentCode}
                            </span>
                            <button
                              type="button"
                              onClick={() => void handleCopy(activeOrder.paymentCode)}
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                            >
                              <Copy size={12} />
                              {copiedCode ? 'Đã chép' : 'Sao chép'}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                      Chưa có cấu hình VietQR SePay hoạt động trên máy chủ.
                    </div>
                  )
                ) : enrollment.status === 'ACTIVE' ? (
                  <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                    Đơn thanh toán {order?.paymentCode ? `(${order.paymentCode}) ` : ''}đã được xác nhận hoàn tất.
                  </div>
                ) : (
                  <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                    Mã VietQR hiện không khả dụng vì phiên giữ chỗ đã hết hạn. Hãy bấm “Giữ chỗ lại 15 phút” để lấy mã mới.
                  </div>
                )}
              </div>

              {enrollment.status === 'PENDING_PAYMENT' ? (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
                  <span className="text-xs text-slate-500">
                    {isHoldActive
                      ? 'Đang tự động kiểm tra giao dịch mỗi 3 giây...'
                      : 'Chưa ghi nhận thanh toán.'}
                  </span>
                  <button
                    type="button"
                    onClick={onRefresh}
                    disabled={refreshing}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
                    {refreshing ? 'Đang kiểm tra...' : 'Kiểm tra đã thanh toán'}
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalNode, document.body) : modalNode;
}
