import { useCallback, useEffect, useState } from 'react';
import { Payment, paymentApi } from '@/features/payments/api';
export function AdminPaymentsPage() {
  const [items, setItems] = useState<Payment[]>([]);
  const load = useCallback(() => paymentApi.admin().then((r) => setItems(r.data)), []);
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <section>
      <h1 className="text-3xl font-black">Đối soát thanh toán</h1>
      <div className="mt-6 space-y-3">
        {items.map((item) => (
          <article className="rounded-2xl border bg-white p-5" key={item.id}>
            <div className="flex flex-wrap justify-between gap-3">
              <div>
                <strong>{item.referenceCode}</strong>
                <p>
                  {item.enrollment?.learner?.fullName} · {item.amountVnd.toLocaleString('vi-VN')} ₫
                </p>
              </div>
              <span>{item.status}</span>
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
                  onClick={() => void paymentApi.reject(item.id, 'Không khớp giao dịch').then(load)}
                >
                  Từ chối
                </button>
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}
