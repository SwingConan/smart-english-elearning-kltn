import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Certificate, CertificateAdminQuery, certificateApi } from '@/features/certificates/api';
export function AdminCertificatesPage() {
  const [items, setItems] = useState<Certificate[]>([]);
  const [total, setTotal] = useState(0);
  const [draft, setDraft] = useState<CertificateAdminQuery>({});
  const [query, setQuery] = useState<CertificateAdminQuery>({});
  const load = useCallback(
    () =>
      certificateApi.admin(query).then((response) => {
        setItems(response.data);
        setTotal(response.meta.total);
      }),
    [query],
  );
  useEffect(() => {
    void load();
  }, [load]);
  const search = (event: FormEvent) => {
    event.preventDefault();
    setQuery({ ...draft, search: draft.search?.trim() || undefined, page: 1 });
  };
  return (
    <section>
      <h1 className="text-3xl font-black">Sổ chứng chỉ</h1>
      <form
        className="mt-6 grid gap-3 rounded-2xl border bg-white p-4 lg:grid-cols-5"
        onSubmit={search}
      >
        <label className="lg:col-span-2">
          <span className="text-sm font-semibold">Tìm kiếm</span>
          <input
            className="input-field mt-1"
            onChange={(event) => setDraft((value) => ({ ...value, search: event.target.value }))}
            placeholder="Số, học viên, email, khóa hoặc lớp"
            type="search"
            value={draft.search ?? ''}
          />
        </label>
        <label>
          <span className="text-sm font-semibold">Trạng thái</span>
          <select
            className="input-field mt-1"
            onChange={(event) =>
              setDraft((value) => ({
                ...value,
                status: (event.target.value || undefined) as CertificateAdminQuery['status'],
              }))
            }
            value={draft.status ?? ''}
          >
            <option value="">Tất cả</option>
            <option value="VALID">Còn hiệu lực</option>
            <option value="REVOKED">Đã thu hồi</option>
          </select>
        </label>
        <label>
          <span className="text-sm font-semibold">Từ ngày</span>
          <input
            className="input-field mt-1"
            onChange={(event) =>
              setDraft((value) => ({ ...value, issuedFrom: event.target.value || undefined }))
            }
            type="date"
            value={draft.issuedFrom ?? ''}
          />
        </label>
        <label>
          <span className="text-sm font-semibold">Đến ngày</span>
          <input
            className="input-field mt-1"
            onChange={(event) =>
              setDraft((value) => ({ ...value, issuedTo: event.target.value || undefined }))
            }
            type="date"
            value={draft.issuedTo ?? ''}
          />
        </label>
        <div className="flex items-end gap-2 lg:col-span-5">
          <button className="btn-primary" type="submit">
            Lọc chứng chỉ
          </button>
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
          <span className="ml-auto text-sm text-slate-500">{total} kết quả</span>
        </div>
      </form>
      <div className="mt-6 space-y-3">
        {items.map((item) => (
          <article className="rounded-2xl border bg-white p-5" key={item.id}>
            <div className="flex justify-between">
              <div>
                <strong>{item.certificateNumber}</strong>
                <p>
                  {item.learnerNameSnapshot} · {item.courseTitleSnapshot}
                </p>
              </div>
              <span>{item.revokedAt ? 'Đã thu hồi' : 'Còn hiệu lực'}</span>
            </div>
            {!item.revokedAt ? (
              <button
                className="mt-3 text-sm font-semibold text-rose-700"
                onClick={() => {
                  const reason = window.prompt('Lý do thu hồi');
                  if (reason) void certificateApi.revoke(item.id, reason).then(load);
                }}
              >
                Thu hồi
              </button>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}
