import { FormEvent, useCallback, useEffect, useState } from 'react';
import {
  AdminCertificateDetail,
  Certificate,
  CertificateAdminQuery,
  certificateApi,
} from '@/features/certificates/api';
export function AdminCertificatesPage() {
  const [items, setItems] = useState<Certificate[]>([]);
  const [total, setTotal] = useState(0);
  const [draft, setDraft] = useState<CertificateAdminQuery>({});
  const [query, setQuery] = useState<CertificateAdminQuery>({});
  const [detail, setDetail] = useState<AdminCertificateDetail | null>(null);
  const [revoking, setRevoking] = useState<Certificate | null>(null);
  const [reason, setReason] = useState('');
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const load = useCallback(async () => {
    try {
      const response = await certificateApi.admin(query);
      setItems(response.data);
      setTotal(response.meta.total);
      setState('ready');
    } catch {
      setState('error');
    }
  }, [query]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  const search = (event: FormEvent) => {
    event.preventDefault();
    setQuery({ ...draft, search: draft.search?.trim() || undefined, page: 1 });
  };
  const revoke = async (event: FormEvent) => {
    event.preventDefault();
    if (!revoking || !reason.trim()) return;
    await certificateApi.revoke(revoking.id, reason.trim());
    setRevoking(null);
    setDetail(null);
    setReason('');
    await load();
  };
  return (
    <section>
      <h1 className="text-3xl font-black">Sổ chứng chỉ</h1>
      <form
        className="mt-6 grid gap-3 rounded-2xl border bg-white p-4 sm:grid-cols-2 lg:grid-cols-5"
        onSubmit={search}
      >
        <label className="lg:col-span-2">
          <span>Tìm kiếm</span>
          <input
            className="input-field mt-1"
            onChange={(e) => setDraft({ ...draft, search: e.target.value })}
            placeholder="Số, học viên, email, khóa hoặc lớp"
            type="search"
            value={draft.search ?? ''}
          />
        </label>
        <label>
          <span>Trạng thái</span>
          <select
            className="input-field mt-1"
            onChange={(e) =>
              setDraft({
                ...draft,
                status: (e.target.value || undefined) as CertificateAdminQuery['status'],
              })
            }
            value={draft.status ?? ''}
          >
            <option value="">Tất cả</option>
            <option value="VALID">Còn hiệu lực</option>
            <option value="REVOKED">Đã thu hồi</option>
          </select>
        </label>
        <label>
          <span>Từ ngày</span>
          <input
            className="input-field mt-1"
            onChange={(e) => setDraft({ ...draft, issuedFrom: e.target.value || undefined })}
            type="date"
            value={draft.issuedFrom ?? ''}
          />
        </label>
        <label>
          <span>Đến ngày</span>
          <input
            className="input-field mt-1"
            onChange={(e) => setDraft({ ...draft, issuedTo: e.target.value || undefined })}
            type="date"
            value={draft.issuedTo ?? ''}
          />
        </label>
        <div className="flex items-end gap-2 lg:col-span-5">
          <button className="btn-primary">Lọc chứng chỉ</button>
          <button
            className="btn-secondary"
            onClick={() => {
              setDraft({});
              setQuery({});
            }}
            type="button"
          >
            Xóa bộ lọc
          </button>
          <span className="ml-auto">{total} kết quả</span>
        </div>
      </form>
      {state === 'loading' ? (
        <p className="mt-6" role="status">
          Đang tải chứng chỉ…
        </p>
      ) : null}
      {state === 'error' ? (
        <div className="state-error mt-6">
          Không thể tải chứng chỉ.{' '}
          <button className="underline" onClick={() => void load()}>
            Thử lại
          </button>
        </div>
      ) : null}
      {state === 'ready' && items.length === 0 ? (
        <div className="state-empty mt-6">Không có chứng chỉ phù hợp.</div>
      ) : null}
      <div className="mt-6 space-y-3">
        {items.map((item) => (
          <article className="rounded-2xl border bg-white p-5" key={item.id}>
            <div className="flex flex-wrap justify-between gap-3">
              <div>
                <strong>{item.certificateNumber}</strong>
                <p>
                  {item.learnerNameSnapshot} · {item.courseTitleSnapshot}
                </p>
              </div>
              <span>{item.revokedAt ? 'Đã thu hồi' : 'Còn hiệu lực'}</span>
            </div>
            <div className="mt-3 flex gap-2">
              <button
                className="btn-secondary"
                onClick={() => void certificateApi.adminDetail(item.id).then(setDetail)}
              >
                Xem chi tiết
              </button>
              {!item.revokedAt ? (
                <button
                  className="btn-secondary text-rose-700"
                  onClick={() => {
                    setRevoking(item);
                    setReason('');
                  }}
                >
                  Thu hồi
                </button>
              ) : null}
            </div>
          </article>
        ))}
      </div>
      {detail ? (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4"
          role="dialog"
        >
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-6">
            <h2 className="text-xl font-bold">Chi tiết chứng chỉ</h2>
            <dl className="mt-4 grid gap-2">
              <div>
                <dt>Số chứng chỉ</dt>
                <dd>{detail.certificateNumber}</dd>
              </div>
              <div>
                <dt>Thông tin đóng băng</dt>
                <dd>
                  {detail.learnerNameSnapshot} · {detail.courseTitleSnapshot} ·{' '}
                  {detail.classCodeSnapshot} — {detail.classNameSnapshot}
                </dd>
              </div>
              <div>
                <dt>Liên kết đăng ký</dt>
                <dd>
                  {detail.completion.enrollment.learner.fullName} ·{' '}
                  {detail.completion.enrollment.learner.email} ·{' '}
                  {detail.completion.enrollment.classOffering.code}
                </dd>
              </div>
              <div>
                <dt>Cấp lúc</dt>
                <dd>{new Date(detail.issuedAt).toLocaleString('vi-VN')}</dd>
              </div>
              <div>
                <dt>Trạng thái</dt>
                <dd>{detail.revokedAt ? 'Đã thu hồi' : 'Còn hiệu lực'}</dd>
              </div>
              {detail.revokedAt ? (
                <>
                  <div>
                    <dt>Thu hồi lúc</dt>
                    <dd>{new Date(detail.revokedAt).toLocaleString('vi-VN')}</dd>
                  </div>
                  <div>
                    <dt>Lý do</dt>
                    <dd>{detail.revokeReason}</dd>
                  </div>
                  <div>
                    <dt>Người thu hồi</dt>
                    <dd>{detail.revokedBy?.fullName ?? 'Không có dữ liệu'}</dd>
                  </div>
                </>
              ) : null}
            </dl>
            <button className="btn-secondary mt-5" onClick={() => setDetail(null)}>
              Đóng
            </button>
          </div>
        </div>
      ) : null}
      {revoking ? (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4"
          role="dialog"
        >
          <form className="w-full max-w-lg rounded-2xl bg-white p-6" onSubmit={revoke}>
            <h2 className="text-xl font-bold">Xác nhận thu hồi chứng chỉ</h2>
            <p className="mt-2">Chứng chỉ sẽ không còn hiệu lực và lịch sử vẫn được lưu.</p>
            <label className="mt-4 block">
              <span>Lý do thu hồi</span>
              <textarea
                autoFocus
                className="input-field mt-1 min-h-28"
                maxLength={2000}
                onChange={(e) => setReason(e.target.value)}
                required
                value={reason}
              />
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setRevoking(null)} type="button">
                Hủy
              </button>
              <button className="btn-primary" disabled={!reason.trim()}>
                Thu hồi chứng chỉ
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  );
}
