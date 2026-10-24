import { FormEvent, useCallback, useEffect, useState } from 'react';
import type { Payment, PaymentClassOption, PaymentQuery } from '@/features/payments/api';
import { paymentApi } from '@/features/payments/api';

const labels: Record<string, string> = {
  PENDING: 'Chờ chuyển khoản',
  SUBMITTED: 'Chờ đối soát',
  VERIFIED: 'Đã xác minh',
  REJECTED: 'Đã từ chối',
  CANCELLED: 'Đã hủy',
};
export function AdminPaymentsPage() {
  const [items, setItems] = useState<Payment[]>([]);
  const [meta, setMeta] = useState({ total: 0, page: 1, limit: 20, totalPages: 0 });
  const [draft, setDraft] = useState<PaymentQuery>({});
  const [query, setQuery] = useState<PaymentQuery>({ page: 1, limit: 20 });
  const [detail, setDetail] = useState<Payment | null>(null);
  const [rejecting, setRejecting] = useState<Payment | null>(null);
  const [reason, setReason] = useState('');
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [classOptions, setClassOptions] = useState<PaymentClassOption[]>([]);
  const [optionState, setOptionState] = useState<'loading' | 'ready' | 'error'>('loading');
  const load = useCallback(async () => {
    try {
      const response = await paymentApi.admin(query);
      setItems(response.data);
      setMeta(response.meta ?? { total: response.data.length, page: 1, limit: 20, totalPages: 1 });
      setState('ready');
    } catch {
      setState('error');
    }
  }, [query]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  const loadClassOptions = useCallback(async () => {
    setOptionState('loading');
    try {
      setClassOptions(await paymentApi.filterOptions());
      setOptionState('ready');
    } catch {
      setOptionState('error');
    }
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => void loadClassOptions(), 0);
    return () => window.clearTimeout(timer);
  }, [loadClassOptions]);
  const filter = (event: FormEvent) => {
    event.preventDefault();
    setQuery({ ...draft, search: draft.search?.trim() || undefined, page: 1, limit: 20 });
  };
  const reject = async (event: FormEvent) => {
    event.preventDefault();
    if (!rejecting || !reason.trim()) return;
    await paymentApi.reject(rejecting.id, reason.trim());
    setRejecting(null);
    setDetail(null);
    setReason('');
    await load();
  };
  const verify = async (item: Payment) => {
    if (!window.confirm('Xác nhận thanh toán sẽ kích hoạt quyền học cho đăng ký này.')) return;
    await paymentApi.verify(item.id);
    setDetail(null);
    await load();
  };
  const open = async (id: string) => setDetail(await paymentApi.detail(id));
  return (
    <section>
      <h1 className="text-3xl font-black">Đối soát thanh toán</h1>
      <form
        className="mt-6 grid gap-3 rounded-2xl border bg-white p-4 sm:grid-cols-2 lg:grid-cols-5"
        onSubmit={filter}
      >
        <label className="sm:col-span-2">
          <span className="text-sm font-semibold">Tìm kiếm</span>
          <input
            className="input-field mt-1"
            onChange={(e) => setDraft({ ...draft, search: e.target.value })}
            placeholder="Học viên, email hoặc mã tham chiếu"
            type="search"
            value={draft.search ?? ''}
          />
        </label>
        <label>
          <span className="text-sm font-semibold">Trạng thái</span>
          <select
            className="input-field mt-1"
            onChange={(e) =>
              setDraft({
                ...draft,
                status: (e.target.value || undefined) as PaymentQuery['status'],
              })
            }
            value={draft.status ?? ''}
          >
            <option value="">Tất cả</option>
            {Object.entries(labels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="text-sm font-semibold">Lớp học</span>
          <select
            className="input-field mt-1"
            disabled={optionState === 'loading'}
            onChange={(e) => setDraft({ ...draft, classOfferingId: e.target.value || undefined })}
            value={draft.classOfferingId ?? ''}
          >
            <option value="">
              {optionState === 'loading' ? 'Đang tải danh sách lớp…' : 'Tất cả lớp'}
            </option>
            {classOptions.map((item) => (
              <option key={item.id} value={item.id}>
                {item.code} — {item.name}
              </option>
            ))}
          </select>
          {optionState === 'error' ? (
            <span className="mt-1 block text-sm text-rose-700" role="alert">
              Không thể tải danh sách lớp.{' '}
              <button className="underline" onClick={() => void loadClassOptions()} type="button">
                Thử lại
              </button>
            </span>
          ) : null}
        </label>
        <span />
        <label>
          <span className="text-sm font-semibold">Từ ngày</span>
          <input
            className="input-field mt-1"
            onChange={(e) => setDraft({ ...draft, createdFrom: e.target.value || undefined })}
            type="date"
            value={draft.createdFrom ?? ''}
          />
        </label>
        <label>
          <span className="text-sm font-semibold">Đến ngày</span>
          <input
            className="input-field mt-1"
            onChange={(e) => setDraft({ ...draft, createdTo: e.target.value || undefined })}
            type="date"
            value={draft.createdTo ?? ''}
          />
        </label>
        <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-3">
          <button className="btn-primary">Lọc</button>
          <button
            className="btn-secondary"
            onClick={() => {
              setDraft({});
              setQuery({ page: 1, limit: 20 });
            }}
            type="button"
          >
            Xóa bộ lọc
          </button>
          <span className="ml-auto text-sm text-slate-500">{meta.total} kết quả</span>
        </div>
      </form>
      {state === 'loading' ? (
        <p className="mt-6" role="status">
          Đang tải giao dịch…
        </p>
      ) : null}
      {state === 'error' ? (
        <div className="state-error mt-6" role="alert">
          Không thể tải giao dịch.{' '}
          <button className="underline" onClick={() => void load()}>
            Thử lại
          </button>
        </div>
      ) : null}
      {state === 'ready' && items.length === 0 ? (
        <div className="state-empty mt-6">Chưa có giao dịch phù hợp.</div>
      ) : null}
      {state === 'ready' ? (
        <div className="mt-6 space-y-3">
          {items.map((item) => (
            <article className="rounded-2xl border bg-white p-5" key={item.id}>
              <div className="flex flex-wrap justify-between gap-3">
                <div>
                  <strong>{item.referenceCode}</strong>
                  <p>
                    {item.enrollment?.learner.fullName ?? 'Không rõ học viên'} ·{' '}
                    {item.enrollment?.learner.email ?? '—'}
                  </p>
                  <p>
                    {item.enrollment?.classOffering?.code ?? '—'} —{' '}
                    {item.enrollment?.classOffering?.name ?? 'Không rõ lớp'}
                  </p>
                  <p>{item.amountVnd.toLocaleString('vi-VN')} ₫</p>
                </div>
                <span>{labels[item.status] ?? item.status}</span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button className="btn-secondary" onClick={() => void open(item.id)}>
                  Xem chi tiết
                </button>
                {item.status === 'SUBMITTED' ? (
                  <>
                    <button className="btn-primary" onClick={() => void verify(item)}>
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
                  </>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      ) : null}
      {meta.totalPages > 1 ? (
        <nav aria-label="Phân trang" className="mt-5 flex items-center justify-center gap-3">
          <button
            className="btn-secondary"
            disabled={meta.page <= 1}
            onClick={() => setQuery({ ...query, page: meta.page - 1 })}
          >
            Trang trước
          </button>
          <span>
            Trang {meta.page}/{meta.totalPages}
          </span>
          <button
            className="btn-secondary"
            disabled={meta.page >= meta.totalPages}
            onClick={() => setQuery({ ...query, page: meta.page + 1 })}
          >
            Trang sau
          </button>
        </nav>
      ) : null}
      {detail ? (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4"
          role="dialog"
        >
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-6">
            <h2 className="text-xl font-bold">Chi tiết thanh toán</h2>
            <dl className="mt-4 grid gap-2">
              <div>
                <dt>Học viên</dt>
                <dd>
                  {detail.enrollment?.learner.fullName ?? 'Không rõ'} ·{' '}
                  {detail.enrollment?.learner.email ?? '—'}
                </dd>
              </div>
              <div>
                <dt>Lớp</dt>
                <dd>
                  {detail.enrollment?.classOffering?.code ?? '—'} —{' '}
                  {detail.enrollment?.classOffering?.name ?? 'Không rõ'}
                </dd>
              </div>
              <div>
                <dt>Số tiền</dt>
                <dd>{detail.amountVnd.toLocaleString('vi-VN')} ₫</dd>
              </div>
              <div>
                <dt>Mã hệ thống</dt>
                <dd className="break-all">{detail.referenceCode}</dd>
              </div>
              <div>
                <dt>Mã giao dịch người học</dt>
                <dd>{detail.payerReference || 'Chưa có'}</dd>
              </div>
              <div>
                <dt>Ghi chú người học</dt>
                <dd>{detail.learnerNote || 'Không có'}</dd>
              </div>
              <div>
                <dt>Trạng thái đăng ký</dt>
                <dd>{detail.enrollment?.status ?? 'Không rõ'}</dd>
              </div>
              <div>
                <dt>Tạo lúc</dt>
                <dd>{new Date(detail.createdAt).toLocaleString('vi-VN')}</dd>
              </div>
              {detail.submittedAt ? (
                <div>
                  <dt>Gửi đối soát</dt>
                  <dd>{new Date(detail.submittedAt).toLocaleString('vi-VN')}</dd>
                </div>
              ) : null}
              {detail.verifiedAt ? (
                <div>
                  <dt>Xác minh</dt>
                  <dd>{new Date(detail.verifiedAt).toLocaleString('vi-VN')}</dd>
                </div>
              ) : null}
              {detail.adminNote ? (
                <div>
                  <dt>Ghi chú/lý do từ chối</dt>
                  <dd>{detail.adminNote}</dd>
                </div>
              ) : null}
            </dl>
            <button className="btn-secondary mt-5" onClick={() => setDetail(null)}>
              Đóng
            </button>
          </div>
        </div>
      ) : null}
      {rejecting ? (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4"
          role="dialog"
        >
          <form className="w-full max-w-lg rounded-2xl bg-white p-6" onSubmit={reject}>
            <h2 className="text-xl font-bold">Từ chối giao dịch</h2>
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
