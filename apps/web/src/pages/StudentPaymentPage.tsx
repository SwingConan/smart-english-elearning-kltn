import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { BankInstructions, Payment, paymentApi } from '@/features/payments/api';

const labels = {
  PENDING: 'Chờ chuyển khoản',
  SUBMITTED: 'Đã báo chuyển khoản, chờ đối soát',
  VERIFIED: 'Đã xác minh',
  REJECTED: 'Đã từ chối',
  CANCELLED: 'Đã hủy',
};
const when = (value?: string | null) => (value ? new Date(value).toLocaleString('vi-VN') : null);

export function StudentPaymentPage() {
  const { enrollmentId = '' } = useParams();
  const [items, setItems] = useState<Payment[]>([]);
  const [bank, setBank] = useState<BankInstructions | null>(null);
  const [payerReference, setReference] = useState('');
  const [learnerNote, setLearnerNote] = useState('');
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      const data = await paymentApi.mine(enrollmentId);
      setItems(data.data);
      setBank(data.bank);
      setState('ready');
    } catch {
      setState('error');
    }
  }, [enrollmentId]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  const create = async () => {
    setBusy(true);
    try {
      const payment = await paymentApi.create(enrollmentId);
      setBank(payment.bank);
      await load();
    } finally {
      setBusy(false);
    }
  };
  const submit = async (event: FormEvent, id: string) => {
    event.preventDefault();
    setBusy(true);
    try {
      await paymentApi.submit(enrollmentId, id, {
        ...(payerReference.trim() ? { payerReference: payerReference.trim() } : {}),
        ...(learnerNote.trim() ? { learnerNote: learnerNote.trim() } : {}),
      });
      await load();
    } finally {
      setBusy(false);
    }
  };
  if (state === 'loading') return <p role="status">Đang tải hướng dẫn thanh toán…</p>;
  if (state === 'error')
    return (
      <div className="state-error" role="alert">
        Không thể tải thông tin thanh toán.{' '}
        <button className="underline" onClick={() => void load()}>
          Thử lại
        </button>
      </div>
    );
  const actionable = items.some((item) => ['PENDING', 'SUBMITTED'].includes(item.status));
  const identity = items[0]?.enrollment;
  return (
    <section className="space-y-6">
      <header>
        <h2 className="text-2xl font-black">Thanh toán học phí</h2>
        {identity?.classOffering ? (
          <p className="text-slate-600">
            {identity.classOffering.course.title} · {identity.classOffering.code} —{' '}
            {identity.classOffering.name}
          </p>
        ) : null}
      </header>
      {!actionable ? (
        <button className="btn-primary" disabled={busy} onClick={() => void create()}>
          {items.length === 0 ? 'Tạo yêu cầu thanh toán' : 'Tạo yêu cầu thanh toán mới'}
        </button>
      ) : null}
      {items.length === 0 ? <div className="state-empty">Chưa có yêu cầu thanh toán.</div> : null}
      {bank ? (
        <div className="rounded-2xl border bg-indigo-50 p-5">
          <h3 className="font-bold">Hướng dẫn chuyển khoản</h3>
          <dl className="mt-3 grid gap-2 sm:grid-cols-2">
            <div>
              <dt className="text-sm text-slate-600">Ngân hàng</dt>
              <dd>{bank.bankName}</dd>
            </div>
            <div>
              <dt className="text-sm text-slate-600">Số tài khoản</dt>
              <dd>{bank.account}</dd>
            </div>
            <div>
              <dt className="text-sm text-slate-600">Chủ tài khoản</dt>
              <dd>{bank.accountName}</dd>
            </div>
          </dl>
        </div>
      ) : null}
      {items.map((item) => (
        <article className="rounded-2xl border bg-white p-5" key={item.id}>
          <div className="flex flex-wrap justify-between gap-2">
            <strong>{item.amountVnd.toLocaleString('vi-VN')} ₫</strong>
            <span>
              {labels[item.status as keyof typeof labels] ?? item.status}
              <span className="sr-only">{item.status}</span>
            </span>
          </div>
          <p className="mt-2">
            Nội dung chuyển khoản:{' '}
            <strong className="break-all font-mono">{item.referenceCode}</strong>
          </p>
          {item.payerReference ? <p>Mã giao dịch ngân hàng: {item.payerReference}</p> : null}
          {item.learnerNote ? <p>Ghi chú của bạn: {item.learnerNote}</p> : null}
          <ul className="mt-3 text-sm text-slate-600">
            <li>Tạo lúc: {when(item.createdAt)}</li>
            {item.submittedAt ? <li>Báo đã chuyển khoản: {when(item.submittedAt)}</li> : null}
            {item.verifiedAt ? <li>Xác minh lúc: {when(item.verifiedAt)}</li> : null}
            {item.status === 'REJECTED' ? (
              <li className="text-rose-700">
                Lý do từ chối: {item.adminNote || 'Không có ghi chú'}
              </li>
            ) : null}
          </ul>
          {item.status === 'PENDING' ? (
            <form className="mt-4 grid gap-3" onSubmit={(event) => void submit(event, item.id)}>
              <label>
                <span className="text-sm font-semibold">Mã giao dịch của bạn</span>
                <input
                  className="input-field mt-1"
                  maxLength={128}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="Mã giao dịch ngân hàng"
                  value={payerReference}
                />
              </label>
              <label>
                <span className="text-sm font-semibold">Ghi chú (không bắt buộc)</span>
                <textarea
                  className="input-field mt-1"
                  maxLength={2000}
                  onChange={(e) => setLearnerNote(e.target.value)}
                  value={learnerNote}
                />
              </label>
              <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
                “Đã chuyển khoản” chỉ gửi thông tin để đối soát, chưa xác minh thanh toán và chưa
                kích hoạt quyền học.
              </p>
              <button className="btn-primary justify-self-start" disabled={busy}>
                Đã chuyển khoản
              </button>
            </form>
          ) : null}
        </article>
      ))}
    </section>
  );
}
