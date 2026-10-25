import { Search } from 'lucide-react';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { ConfirmDialog } from '@/components/ui/Feedback';
import {
  CopyButton,
  DetailDrawer,
  PageContainer,
  PageHeader,
  SectionHeader,
  StatusBadge,
} from '@/components/ui/ProductPrimitives';
import type { Payment, PaymentClassOption, PaymentQuery } from '@/features/payments/api';
import { paymentApi } from '@/features/payments/api';

const paymentLabels: Record<string, string> = {
  PENDING: 'Chờ chuyển khoản',
  SUBMITTED: 'Chờ đối soát',
  VERIFIED: 'Đã xác minh',
  REJECTED: 'Đã từ chối',
  CANCELLED: 'Đã hủy',
};
const enrollmentLabels: Record<string, string> = {
  PENDING_PAYMENT: 'Chờ thanh toán',
  ACTIVE: 'Đang học',
  COMPLETED: 'Đã hoàn thành',
  CANCELLED: 'Đã hủy đăng ký',
  DROPPED: 'Đã dừng học',
};

function paymentTone(status: string): 'success' | 'warning' | 'danger' | 'neutral' {
  if (status === 'VERIFIED') return 'success';
  if (status === 'REJECTED' || status === 'CANCELLED') return 'danger';
  if (status === 'PENDING' || status === 'SUBMITTED') return 'warning';
  return 'neutral';
}

const formatMoney = (value: number) => `${value.toLocaleString('vi-VN')} ₫`;
const formatDate = (value?: string | null) =>
  value ? new Date(value).toLocaleString('vi-VN') : 'Chưa có';

export function AdminPaymentsPage() {
  const [items, setItems] = useState<Payment[]>([]);
  const [meta, setMeta] = useState({ total: 0, page: 1, limit: 20, totalPages: 0 });
  const [draft, setDraft] = useState<PaymentQuery>({});
  const [query, setQuery] = useState<PaymentQuery>({ page: 1, limit: 20 });
  const [detail, setDetail] = useState<Payment | null>(null);
  const [verifying, setVerifying] = useState<Payment | null>(null);
  const [rejecting, setRejecting] = useState<Payment | null>(null);
  const [reason, setReason] = useState('');
  const [mutationBusy, setMutationBusy] = useState(false);
  const [mutationError, setMutationError] = useState('');
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [classOptions, setClassOptions] = useState<PaymentClassOption[]>([]);
  const [optionState, setOptionState] = useState<'loading' | 'ready' | 'error'>('loading');

  const load = useCallback(async () => {
    setState('loading');
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

  const openDetail = async (id: string) => {
    setMutationError('');
    setDetail(await paymentApi.detail(id));
  };

  const verify = async () => {
    if (!verifying) return;
    setMutationBusy(true);
    setMutationError('');
    try {
      await paymentApi.verify(verifying.id);
      setVerifying(null);
      setDetail(null);
      await load();
    } catch {
      setMutationError('Không thể xác minh giao dịch. Vui lòng tải lại dữ liệu và thử lại.');
    } finally {
      setMutationBusy(false);
    }
  };

  const reject = async (event: FormEvent) => {
    event.preventDefault();
    if (!rejecting || !reason.trim()) return;
    setMutationBusy(true);
    setMutationError('');
    try {
      await paymentApi.reject(rejecting.id, reason.trim());
      setRejecting(null);
      setDetail(null);
      setReason('');
      await load();
    } catch {
      setMutationError('Không thể từ chối giao dịch. Vui lòng tải lại dữ liệu và thử lại.');
    } finally {
      setMutationBusy(false);
    }
  };

  const actionButtons = (item: Payment) => (
    <div className="flex flex-wrap gap-2">
      <button className="btn-secondary" onClick={() => void openDetail(item.id)} type="button">
        Xem chi tiết
      </button>
      {item.status === 'SUBMITTED' ? (
        <>
          <button className="btn-primary" onClick={() => setVerifying(item)} type="button">
            Xác minh
          </button>
          <button
            className="btn-secondary"
            onClick={() => {
              setRejecting(item);
              setReason('');
              setMutationError('');
            }}
            type="button"
          >
            Từ chối
          </button>
        </>
      ) : null}
    </div>
  );

  return (
    <PageContainer className="space-y-7">
      <PageHeader
        eyebrow="Vận hành tài chính"
        title="Đối soát thanh toán"
        description="Đây là quy trình đối soát thủ công: chỉ xác minh sau khi giao dịch đã được kiểm tra trên tài khoản ngân hàng. Hệ thống không tự suy diễn doanh thu hoặc trạng thái chuyển khoản."
      />

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <SectionHeader
          title="Bộ lọc sổ giao dịch"
          description={`${meta.total} giao dịch khớp điều kiện hiện tại. Kết quả luôn được tải lại từ máy chủ sau mỗi thao tác.`}
          actions={<StatusBadge tone="info">Chuyển khoản ngân hàng</StatusBadge>}
        />
        <form className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-6" onSubmit={filter}>
          <label className="sm:col-span-2">
            <span className="text-sm font-semibold">Tìm kiếm</span>
            <div className="relative mt-1">
              <Search className="absolute left-3 top-3 text-slate-400" size={18} />
              <input
                className="input-field pl-10"
                onChange={(event) => setDraft({ ...draft, search: event.target.value })}
                placeholder="Học viên, email hoặc mã tham chiếu"
                type="search"
                value={draft.search ?? ''}
              />
            </div>
          </label>
          <label>
            <span className="text-sm font-semibold">Trạng thái</span>
            <select
              className="input-field mt-1"
              onChange={(event) =>
                setDraft({
                  ...draft,
                  status: (event.target.value || undefined) as PaymentQuery['status'],
                })
              }
              value={draft.status ?? ''}
            >
              <option value="">Tất cả</option>
              {Object.entries(paymentLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="lg:col-span-2">
            <span className="text-sm font-semibold">Lớp học</span>
            <select
              className="input-field mt-1"
              disabled={optionState === 'loading'}
              onChange={(event) =>
                setDraft({ ...draft, classOfferingId: event.target.value || undefined })
              }
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
              onChange={(event) =>
                setDraft({ ...draft, createdFrom: event.target.value || undefined })
              }
              type="date"
              value={draft.createdFrom ?? ''}
            />
          </label>
          <label>
            <span className="text-sm font-semibold">Đến ngày</span>
            <input
              className="input-field mt-1"
              onChange={(event) =>
                setDraft({ ...draft, createdTo: event.target.value || undefined })
              }
              type="date"
              value={draft.createdTo ?? ''}
            />
          </label>
          <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
            <button className="btn-primary">Áp dụng bộ lọc</button>
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
          </div>
        </form>
      </section>

      {mutationError ? (
        <div className="state-error" role="alert">
          {mutationError}
        </div>
      ) : null}
      {state === 'loading' ? <p role="status">Đang tải sổ giao dịch…</p> : null}
      {state === 'error' ? (
        <div className="state-error" role="alert">
          Không thể tải giao dịch.{' '}
          <button className="underline" onClick={() => void load()}>
            Thử lại
          </button>
        </div>
      ) : null}
      {state === 'ready' && items.length === 0 ? (
        <div className="state-empty">Chưa có giao dịch phù hợp.</div>
      ) : null}

      {state === 'ready' && items.length ? (
        <section aria-label="Sổ giao dịch thanh toán">
          <div
            className="hidden overflow-x-auto rounded-3xl border bg-white shadow-sm md:block"
            data-testid="payment-ledger-table"
          >
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-4">Giao dịch</th>
                  <th className="px-5 py-4">Học viên</th>
                  <th className="px-5 py-4">Lớp</th>
                  <th className="px-5 py-4">Số tiền</th>
                  <th className="px-5 py-4">Gửi đối soát</th>
                  <th className="px-5 py-4">Trạng thái</th>
                  <th className="px-5 py-4">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {items.map((item) => (
                  <tr className="align-top hover:bg-slate-50/70" key={item.id}>
                    <td className="px-5 py-4">
                      <strong className="font-mono">{item.referenceCode}</strong>
                      <p className="mt-1 text-xs text-slate-500">Chuyển khoản ngân hàng</p>
                    </td>
                    <td className="px-5 py-4">
                      <strong>{item.enrollment?.learner.fullName ?? 'Không rõ học viên'}</strong>
                      <p className="text-xs text-slate-500">
                        {item.enrollment?.learner.email ?? '—'}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <strong>{item.enrollment?.classOffering?.code ?? '—'}</strong>
                      <p className="max-w-48 text-xs text-slate-500">
                        {item.enrollment?.classOffering?.name ?? 'Không rõ lớp'}
                      </p>
                    </td>
                    <td className="px-5 py-4 font-bold">{formatMoney(item.amountVnd)}</td>
                    <td className="px-5 py-4">{formatDate(item.submittedAt ?? item.createdAt)}</td>
                    <td className="px-5 py-4">
                      <StatusBadge tone={paymentTone(item.status)}>
                        {paymentLabels[item.status] ?? 'Không xác định'}
                      </StatusBadge>
                    </td>
                    <td className="px-5 py-4">{actionButtons(item)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-4 md:hidden" data-testid="payment-ledger-cards">
            {items.map((item) => (
              <article className="rounded-3xl border bg-white p-5 shadow-sm" key={item.id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <strong className="font-mono">{item.referenceCode}</strong>
                    <p className="mt-1 text-sm text-slate-500">Chuyển khoản ngân hàng</p>
                  </div>
                  <StatusBadge tone={paymentTone(item.status)}>
                    {paymentLabels[item.status] ?? 'Không xác định'}
                  </StatusBadge>
                </div>
                <dl className="mt-5 grid gap-3 text-sm">
                  <ScanRow
                    label="Học viên"
                    value={item.enrollment?.learner.fullName ?? 'Không rõ'}
                  />
                  <ScanRow
                    label="Lớp"
                    value={`${item.enrollment?.classOffering?.code ?? '—'} — ${item.enrollment?.classOffering?.name ?? 'Không rõ'}`}
                  />
                  <ScanRow label="Số tiền" value={formatMoney(item.amountVnd)} />
                  <ScanRow
                    label="Gửi đối soát"
                    value={formatDate(item.submittedAt ?? item.createdAt)}
                  />
                </dl>
                <div className="mt-5">{actionButtons(item)}</div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {meta.totalPages > 1 ? (
        <nav aria-label="Phân trang" className="flex items-center justify-center gap-3">
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

      <DetailDrawer
        description="Dữ liệu từ hồ sơ đăng ký và nhật ký xử lý trên máy chủ."
        onClose={() => setDetail(null)}
        open={Boolean(detail)}
        title="Chi tiết đối soát"
      >
        {detail ? (
          <div className="space-y-7">
            <section>
              <SectionHeader title="Giao dịch" />
              <dl className="mt-4 grid gap-4 rounded-2xl bg-slate-50 p-5 sm:grid-cols-2">
                <DetailRow label="Mã tham chiếu" value={detail.referenceCode} copy />
                <DetailRow label="Phương thức" value="Chuyển khoản ngân hàng" />
                <DetailRow label="Số tiền" value={formatMoney(detail.amountVnd)} />
                <DetailRow
                  label="Trạng thái"
                  value={paymentLabels[detail.status] ?? 'Không xác định'}
                />
                <DetailRow label="Mã người chuyển" value={detail.payerReference || 'Chưa có'} />
                <DetailRow label="Khởi tạo" value={formatDate(detail.createdAt)} />
              </dl>
            </section>
            <section>
              <SectionHeader title="Đăng ký học" />
              <dl className="mt-4 grid gap-4 rounded-2xl border p-5 sm:grid-cols-2">
                <DetailRow
                  label="Học viên"
                  value={`${detail.enrollment?.learner.fullName ?? 'Không rõ'} · ${detail.enrollment?.learner.email ?? '—'}`}
                />
                <DetailRow
                  label="Trạng thái đăng ký"
                  value={enrollmentLabels[detail.enrollment?.status ?? ''] ?? 'Không xác định'}
                />
                <DetailRow
                  label="Lớp"
                  value={`${detail.enrollment?.classOffering?.code ?? '—'} — ${detail.enrollment?.classOffering?.name ?? 'Không rõ'}`}
                />
                <DetailRow
                  label="Khóa học"
                  value={detail.enrollment?.classOffering?.course.title ?? 'Không rõ'}
                />
              </dl>
            </section>
            <section>
              <SectionHeader title="Nhật ký đối soát" />
              <dl className="mt-4 grid gap-4 rounded-2xl border p-5 sm:grid-cols-2">
                <DetailRow label="Gửi đối soát" value={formatDate(detail.submittedAt)} />
                <DetailRow label="Xác minh" value={formatDate(detail.verifiedAt)} />
                <DetailRow label="Ghi chú học viên" value={detail.learnerNote || 'Không có'} />
                <DetailRow label="Ghi chú quản trị" value={detail.adminNote || 'Không có'} />
              </dl>
            </section>
            {detail.status === 'SUBMITTED' ? actionButtons(detail) : null}
          </div>
        ) : null}
      </DetailDrawer>

      <ConfirmDialog
        busyLabel="Đang xác minh…"
        confirmLabel="Xác minh thanh toán"
        description={`Bạn đã kiểm tra giao dịch ${verifying?.referenceCode ?? ''} trên tài khoản ngân hàng. Xác minh sẽ kích hoạt quyền học cho đăng ký này.`}
        isBusy={mutationBusy}
        onCancel={() => setVerifying(null)}
        onConfirm={() => void verify()}
        open={Boolean(verifying)}
        title="Xác nhận đã nhận thanh toán?"
      />

      {rejecting ? (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/55 p-4 backdrop-blur-sm">
          <form
            aria-labelledby="reject-payment-title"
            aria-modal="true"
            className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl"
            onSubmit={(event) => void reject(event)}
            role="dialog"
          >
            <h2 className="text-xl font-bold" id="reject-payment-title">
              Từ chối giao dịch
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Mã {rejecting.referenceCode}. Lý do sẽ được lưu trong lịch sử và hiển thị để học viên
              biết cách xử lý.
            </p>
            <label className="mt-5 block">
              <span className="font-semibold">Lý do từ chối</span>
              <textarea
                autoFocus
                className="input-field mt-2 min-h-28"
                maxLength={2000}
                onChange={(event) => setReason(event.target.value)}
                required
                value={reason}
              />
            </label>
            <div className="mt-6 flex justify-end gap-2">
              <button
                className="btn-secondary"
                disabled={mutationBusy}
                onClick={() => setRejecting(null)}
                type="button"
              >
                Quay lại
              </button>
              <button className="btn-primary" disabled={!reason.trim() || mutationBusy}>
                {mutationBusy ? 'Đang lưu…' : 'Xác nhận từ chối'}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </PageContainer>
  );
}

function ScanRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right font-semibold text-slate-900">{value}</dd>
    </div>
  );
}

function DetailRow({
  label,
  value,
  copy = false,
}: {
  label: string;
  value: string;
  copy?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 flex items-center gap-2 font-semibold text-slate-900">
        <span className="break-all">{value}</span>
        {copy ? <CopyButton label="Sao chép mã" value={value} /> : null}
      </dd>
    </div>
  );
}
