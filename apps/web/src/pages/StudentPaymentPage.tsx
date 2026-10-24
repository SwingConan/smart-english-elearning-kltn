import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { BankInstructions, Payment, paymentApi } from '@/features/payments/api';

export function StudentPaymentPage() {
  const { enrollmentId = '' } = useParams();
  const [items, setItems] = useState<Payment[]>([]);
  const [bank, setBank] = useState<BankInstructions | null>(null);
  const [payerReference, setReference] = useState('');
  const load = useCallback(
    () =>
      paymentApi.mine(enrollmentId).then((data) => {
        setItems(data.data);
        setBank(data.bank);
      }),
    [enrollmentId],
  );
  useEffect(() => {
    void load();
  }, [load]);
  const create = async () => {
    const payment = await paymentApi.create(enrollmentId);
    setBank(payment.bank);
    await load();
  };
  const submit = async (event: FormEvent, id: string) => {
    event.preventDefault();
    await paymentApi.submit(enrollmentId, id, { payerReference });
    await load();
  };
  return (
    <section className="space-y-6">
      <header>
        <h2 className="text-2xl font-black">Thanh toán học phí</h2>
        <p className="text-slate-600">Số tiền và mã chuyển khoản do hệ thống xác nhận.</p>
      </header>
      {items.length === 0 ? (
        <button className="btn-primary" onClick={() => void create()}>
          Tạo yêu cầu thanh toán
        </button>
      ) : null}
      {bank ? (
        <div className="rounded-2xl border bg-indigo-50 p-5">
          <strong>{bank.bankName}</strong>
          <p>
            {bank.account} · {bank.accountName}
          </p>
        </div>
      ) : null}
      {items.map((item) => (
        <article className="rounded-2xl border bg-white p-5" key={item.id}>
          <div className="flex justify-between">
            <strong>{item.amountVnd.toLocaleString('vi-VN')} ₫</strong>
            <span>{item.status}</span>
          </div>
          <p className="mt-2 font-mono">{item.referenceCode}</p>
          {item.status === 'PENDING' ? (
            <form className="mt-4 flex gap-3" onSubmit={(event) => void submit(event, item.id)}>
              <input
                className="flex-1 rounded-xl border p-3"
                onChange={(e) => setReference(e.target.value)}
                placeholder="Mã giao dịch ngân hàng"
                value={payerReference}
              />
              <button className="btn-primary">Đã chuyển khoản</button>
            </form>
          ) : null}
        </article>
      ))}
    </section>
  );
}
