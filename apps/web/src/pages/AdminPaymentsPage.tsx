import { FormEvent, useCallback, useEffect, useState } from 'react';
import type { Payment } from '@/features/payments/api';
import { paymentApi } from '@/features/payments/api';

const labels: Record<string, string> = {
  PENDING: 'Chờ học viên chuyển khoản',
  SUBMITTED: 'Chờ đối soát',
  VERIFIED: 'Đã xác minh',
  REJECTED: 'Đã từ chối',
  CANCELLED: 'Đã hủy',
};

export function AdminPaymentsPage() {
  const [items, setItems] = useState<Payment[]>([]);
  const [rejecting, setRejecting] = useState<Payment | null>(null);
  const [reason, setReason] = useState('');
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const load = useCallback(() => {
    return paymentApi
      .admin()
      .then((response) => {
        setItems(response.data);
        setState('ready');
      })
      .catch(() => setState('error'));
  }, []);
  useEffect(() => void load(), [load]);
  const reject = async (event: FormEvent) => {
    event.preventDefault();
    if (!rejecting) return;
    await paymentApi.reject(rejecting.id, reason);
    setRejecting(null);
    setReason('');
    await load();
  };
  return (
    <section>
      <h1 className="text-3xl font-black">Đối soát thanh toán</h1>
      {state === 'loading' ? (
        <p className="mt-6" role="status">
          Đang tải giao dịch…
        </p>
      ) : state === 'error' ? (
        <div className="state-error mt-6" role="alert">
          Không thể tải giao dịch.{' '}
          <button className="btn-secondary ml-2" onClick={() => void load()}>
            Thử lại
          </button>
        </div>
      ) : items.length === 0 ? (
        <div className="state-empty mt-6">Chưa có giao dịch cần đối soát.</div>
      ) : (
        <div className="mt-6 space-y-3">
          {items.map((item) => (
            <article className="rounded-2xl border bg-white p-5" key={item.id}>
              <div className="flex flex-wrap justify-between gap-3">
                <div>
                  <strong>{item.referenceCode}</strong>
                  <p>
                    {item.enrollment?.learner?.fullName} · {item.amountVnd.toLocaleString('vi-VN')}{' '}
                    ₫
                  </p>
                  {item.payerReference ? (
                    <p className="text-sm text-slate-600">Mã ngân hàng: {item.payerReference}</p>
                  ) : null}
                  {item.status === 'REJECTED' && item.adminNote ? (
                    <p className="mt-2 text-rose-700">Lý do từ chối: {item.adminNote}</p>
                  ) : null}
                </div>
                <span>{labels[item.status] ?? item.status}</span>
              </div>
              {item.status === 'SUBMITTED' ? (
                <div className="mt-4 flex gap-2">
                  <button
                    className="btn-primary"
                    onClick={() => void paymentApi.verify(item.id).then(load)}
                  >
                    Xác minh
                  </button>
                  <button
                    className="btn-secondary"
                    onClick={() => {
                      setRejecting(item);
                      setReason('');
                    }}
                  >
                    Từ chối
                  </button>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      )}
      {rejecting ? (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4"
          role="dialog"
        >
          <form className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl" onSubmit={reject}>
            <h2 className="text-xl font-bold">Từ chối giao dịch {rejecting.referenceCode}</h2>
            <label className="mt-4 block">
              <span className="font-semibold">Lý do từ chối</span>
              <textarea
                autoFocus
                className="input-field mt-2 min-h-28"
                maxLength={2000}
                onChange={(e) => setReason(e.target.value)}
                required
                value={reason}
              />
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setRejecting(null)} type="button">
                Quay lại
              </button>
              <button className="btn-primary" disabled={!reason.trim()}>
                Xác nhận từ chối
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  );
}
