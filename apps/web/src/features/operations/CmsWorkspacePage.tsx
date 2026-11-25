import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useAuth } from '@/features/auth/auth-context';
import { useProductRead } from '@/features/product/api';
import {
  cmsCreate,
  cmsCommand,
  cmsMessage,
  cmsTime,
  cmsStateLabels,
  cmsActionLabels,
  type CmsDashboard,
  type CmsDetail,
  type CmsAction,
} from './cms-api';
function Failure({ phase }: { phase: string }) {
  return phase === 'LOADING' ? (
    <p role="status" className="rounded-md border border-slate-200 bg-white p-4 text-sm text-slate-600">
      Đang tải nội dung và quyền biên tập…
    </p>
  ) : (
    <div
      role="alert"
      className="space-y-1.5 rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"
    >
      <p className="font-bold">
        {phase === 'DENIED'
          ? 'Bạn chưa có quyền biên tập nội dung này hoặc phiên đăng nhập đã hết hạn.'
          : 'Không tải được nội dung website (/v2/operations/cms).'}
      </p>
      {phase !== 'DENIED' && (
        <p className="text-xs leading-relaxed">
          Máy chủ backend hiện tại đang khóa kho CMS do chưa bật cấu hình QA/schema{' '}
          <code>cms_v2</code> được xác minh (<code>503 CMS_VERIFIED_QA_CONFIGURATION_REQUIRED</code>).
          Giao diện không tạo dữ liệu giả hoặc bỏ qua quy trình duyệt độc lập.
        </p>
      )}
    </div>
  );
}
export function CmsWorkspacePage() {
  const { user } = useAuth(),
    [params, setParams] = useSearchParams(),
    [notice, setNotice] = useState('');
  const { data: response, phase, reload } = useProductRead<CmsDashboard>('/v2/operations/cms');
  const data =
    response?.viewerId === user?.id && response?.role === user?.role ? response : undefined;
  const selected = params.get('revision') ?? data?.contents[0]?.headRevision;
  const creating =
    params.get('new') === '1' || (!data?.contents.length && data?.scopes.some((s) => s.canCreate));
  function saved(detail: CmsDetail, message: string) {
    setNotice(message);
    setParams({ revision: detail.id });
    reload();
  }
  return (
    <section
      aria-label="Quản lý nội dung website"
      className="mx-auto max-w-[1280px] min-w-0 space-y-6 px-4 py-6 sm:px-6 lg:px-8"
    >
      <nav
        aria-label="Breadcrumb"
        className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500"
      >
        <Link to="/workspace" className="text-[#2d581b] hover:underline">
          Trang chủ
        </Link>
        <span aria-hidden="true">/</span>
        <span className="inline-flex items-center rounded bg-[#76a35e] px-2.5 py-0.5 font-semibold text-white">
          Quản lý nội dung website
        </span>
      </nav>
      <header className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold tracking-wide text-[#76a35e] uppercase">
            {user?.role === 'COUNSELOR' ? 'TV' : 'HVU'} · Nội dung website
          </p>
          <h1 className="mt-1 text-2xl font-bold text-[#e66f2b] sm:text-3xl">
            Quản lý nội dung website
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Văn bản gốc của nhóm · xem trước nội dung · duyệt độc lập · công bố theo revision.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={reload}
            className="rounded border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Đọc lại nội dung
          </button>
          <Link
            className="rounded border border-[#76a35e] bg-[#f4f9f1] px-3.5 py-2 text-xs font-semibold text-[#2d581b] hover:bg-[#e5f1de]"
            to="/cms/publications"
          >
            Xem bài viết đã công bố
          </Link>
          {data?.scopes.some((s) => s.canCreate) && (
            <button
              type="button"
              className="rounded bg-[#76a35e] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#658f50]"
              onClick={() => {
                setNotice('');
                setParams({ new: '1' });
              }}
            >
              Tạo nội dung mới
            </button>
          )}
        </div>
      </header>
      {notice && (
        <p role="status" className="rounded-lg bg-emerald-50 p-4 text-emerald-800">
          {notice}
        </p>
      )}
      {!data ? (
        <Failure phase={phase} />
      ) : (
        <>
          <p className="text-sm text-slate-600">
            Quyền theo tài nguyên đã kiểm tra lúc {cmsTime(data.checkedAt)} · UTC+7. Chỉ dùng văn
            bản tự biên soạn trong phạm vi được PO cho phép; không đính kèm media bên ngoài.
          </p>
          <section className="rounded-xl border bg-white p-5 space-y-3">
            <h2 className="text-xl font-bold">Nội dung trong phạm vi</h2>
            {!data.contents.length ? (
              <p>Chưa có nội dung trong phạm vi đã được kiểm tra.</p>
            ) : (
              <ul className="space-y-2">
                {data.contents.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      className="w-full rounded-lg border p-3 text-left hover:bg-indigo-50"
                      onClick={() => {
                        setNotice('');
                        setParams({ revision: c.headRevision });
                      }}
                    >
                      <strong>{c.title}</strong>
                      <span className="ml-3">
                        Revision {c.number} · {cmsStateLabels[c.state] ?? c.state}
                      </span>
                      {c.publishedRevisionId && (
                        <span className="block text-sm text-emerald-700">
                          Có revision đang công bố
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {data.truncated && <p>Đang hiển thị 100 nội dung gần nhất; danh sách chưa đầy đủ.</p>}
          </section>
          {creating ? (
            <CreateForm
              dashboard={data}
              onSaved={(d) => saved(d, 'Đã lưu bản nháp. Bản nháp chưa được công bố.')}
            />
          ) : selected ? (
            <RevisionPanel
              key={selected}
              id={selected}
              onSaved={saved}
              onSelect={(id) => {
                setNotice('');
                setParams({ revision: id });
              }}
            />
          ) : (
            <p>Chọn một nội dung để xem revision và lịch sử.</p>
          )}
        </>
      )}
    </section>
  );
}
function CreateForm({
  dashboard,
  onSaved,
}: {
  dashboard: CmsDashboard;
  onSaved: (d: CmsDetail) => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      const payload = Object.fromEntries(form.entries());
      onSaved(await cmsCreate(payload));
    } catch (e) {
      setError(cmsMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={(e) => void submit(e)} className="rounded-xl border bg-white p-5 space-y-4">
      <h2 className="text-xl font-bold">Tạo bản nháp</h2>
      <label className="block">
        Phạm vi nội dung
        <select name="scopeId" className="input-field mt-1 w-full" required>
          {dashboard.scopes
            .filter((s) => s.canCreate)
            .map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
        </select>
      </label>
      <label className="block">
        Tiêu đề
        <input
          name="title"
          className="input-field mt-1 w-full"
          required
          minLength={3}
          maxLength={160}
        />
      </label>
      <label className="block">
        Nội dung gốc
        <textarea
          name="body"
          aria-label="Nội dung gốc"
          className="input-field mt-1 min-h-48 w-full"
          required
          maxLength={20000}
        />
      </label>
      <label className="block">
        Nguồn biên soạn
        <input
          name="sourceReference"
          className="input-field mt-1 w-full"
          required
          minLength={3}
          maxLength={300}
          placeholder="Nhóm biên soạn, mục đích và ngày soạn"
        />
      </label>
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      <button type="submit" className="btn-primary" disabled={busy}>
        {busy ? 'Đang lưu…' : 'Lưu bản nháp'}
      </button>
    </form>
  );
}
function RevisionPanel({
  id,
  onSaved,
  onSelect,
}: {
  id: string;
  onSaved: (d: CmsDetail, message: string) => void;
  onSelect: (id: string) => void;
}) {
  const { user } = useAuth(),
    { data, phase, reload } = useProductRead<CmsDetail>(
      '/v2/operations/cms/revisions/' + encodeURIComponent(id),
    );
  if (!data || data.viewerId !== user?.id)
    return (
      <>
        <Failure phase={phase} />
        <button type="button" className="btn-secondary" onClick={reload}>
          Đọc lại revision
        </button>
      </>
    );
  return (
    <RevisionForm
      key={`${data.id}:${data.lockVersion}`}
      detail={data}
      onSaved={onSaved}
      onSelect={onSelect}
    />
  );
}
function RevisionForm({
  detail: d,
  onSaved,
  onSelect,
}: {
  detail: CmsDetail;
  onSaved: (d: CmsDetail, message: string) => void;
  onSelect: (id: string) => void;
}) {
  const [title, setTitle] = useState(d.title),
    [body, setBody] = useState(d.body),
    [source, setSource] = useState(d.sourceReference),
    [reason, setReason] = useState(''),
    [previewMode, setPreviewMode] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const editable = d.allowedActions.some((a) => ['edit', 'revise'].includes(a));
  async function act(action: CmsAction) {
    setError('');
    if (reason.trim().length < 3) {
      setError('Nhập lý do thao tác ít nhất 3 ký tự.');
      return;
    }
    if (
      ['edit', 'revise'].includes(action) &&
      (title.trim().length < 3 || !body.trim() || source.trim().length < 3)
    ) {
      setError('Cần tiêu đề, nội dung và nguồn biên soạn hợp lệ.');
      return;
    }
    setBusy(true);
    try {
      const payload = {
        scopeId: d.scopeId,
        expectedVersion: d.lockVersion,
        reason,
        ...(['edit', 'revise'].includes(action) ? { title, body, sourceReference: source } : {}),
      };
      const changed = await cmsCommand(d.id, action, payload);
      onSaved(
        changed,
        `Đã thực hiện: ${cmsActionLabels[action]}. Trạng thái: ${cmsStateLabels[changed.state] ?? changed.state}.`,
      );
    } catch (e) {
      setError(cmsMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-label="Chi tiết revision" className="space-y-5 rounded-md border border-slate-200 bg-white p-5">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
        <div>
          <h2 className="text-xl font-bold text-[#e66f2b]">
            Revision {d.number} · {cmsStateLabels[d.state] ?? d.state}
          </h2>
          <p className="text-xs text-slate-600">
            Tạo lúc {cmsTime(d.createdAt)} · Người tạo #{d.authorUser.slice(0, 8)} · Phiên bản kiểm
            tra {d.lockVersion}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setPreviewMode((v) => !v)}
          className="rounded border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
        >
          {previewMode ? 'Quay lại trình soạn thảo' : 'Xem trước hiển thị website'}
        </button>
      </header>
      {d.isAuthor && (
        <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">
          Bạn là người tham gia tạo revision. Hệ thống không cho bạn tự duyệt hoặc công bố, kể cả
          bằng tài khoản có vai trò HVU.
        </p>
      )}
      {previewMode ? (
        <article className="space-y-3 rounded-md border border-[#b9d4ab] bg-[#f8fbf6] p-5">
          <p className="text-xs font-bold text-[#76a35e] uppercase">
            Bản xem trước hiển thị công khai
          </p>
          <h3 className="text-2xl font-bold text-slate-900">{title || '(Chưa có tiêu đề)'}</h3>
          <p className="whitespace-pre-wrap break-words text-sm leading-7 text-slate-800">
            {body || '(Chưa có nội dung)'}
          </p>
          <p className="text-xs text-slate-600">Nguồn biên soạn: {source || '—'}</p>
        </article>
      ) : (
        <>
          <label className="block text-sm font-medium">
            Tiêu đề
            <input
              className="input-field mt-1 w-full"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              readOnly={!editable}
              maxLength={160}
            />
          </label>
          <label className="block text-sm font-medium">
            Nội dung gốc
            <textarea
              className="input-field mt-1 min-h-56 w-full"
              aria-label="Nội dung gốc"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              readOnly={!editable}
              maxLength={20000}
            />
          </label>
          <label className="block text-sm font-medium">
            Nguồn biên soạn
            <input
              className="input-field mt-1 w-full"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              readOnly={!editable}
              maxLength={300}
            />
          </label>
        </>
      )}
      <p className="break-all text-xs text-slate-500">
        Policy: {d.policyRef} · SHA-256: {d.bodySha256}
      </p>
      {!!d.allowedActions.length && (
        <>
          <label className="block">
            Lý do thao tác
            <textarea
              className="input-field mt-1 w-full"
              aria-label="Lý do thao tác"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
            />
          </label>
          <div className="flex flex-wrap gap-3">
            {d.allowedActions.map((action) => (
              <button
                type="button"
                className="btn-primary"
                key={action}
                disabled={busy}
                onClick={() => void act(action)}
              >
                {busy ? 'Đang xử lý…' : cmsActionLabels[action]}
              </button>
            ))}
          </div>
        </>
      )}
      {!d.allowedActions.length && (
        <p>
          Không có thao tác phù hợp với trạng thái và quyền hiện hành. Người được phân quyền độc lập
          sẽ thực hiện bước tiếp theo.
        </p>
      )}
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      <Link className="inline-block text-indigo-700 underline" to={'/cms/publications/' + d.slug}>
        Mở đường dẫn công khai
      </Link>
      <section className="space-y-2 border-t pt-4">
        <h3 className="font-bold">Lịch sử phiên bản</h3>
        <ul className="space-y-2">
          {d.history.map((h) => (
            <li key={h.id}>
              <button
                type="button"
                className="text-indigo-700 underline"
                onClick={() => onSelect(h.id)}
              >
                Revision {h.number} · {cmsStateLabels[h.state] ?? h.state}
              </button>
              <span className="ml-2 text-sm">{cmsTime(h.createdAt)}</span>
            </li>
          ))}
        </ul>
      </section>
      <section className="space-y-2 border-t pt-4">
        <h3 className="font-bold">Trạng thái của revision</h3>
        <ol className="space-y-2">
          {d.events.map((e) => (
            <li key={e.id}>
              {cmsStateLabels[e.state] ?? e.state} · {cmsTime(e.at)} · Người thực hiện #
              {e.actorUser.slice(0, 8)}
              <p className="text-sm text-slate-600">{e.reason}</p>
            </li>
          ))}
        </ol>
      </section>
      <section className="space-y-2 border-t pt-4">
        <h3 className="font-bold">Lịch sử nội dung website</h3>
        {d.audit === null ? (
          <p>Không có quyền đọc audit của phạm vi này.</p>
        ) : (
          <ol className="space-y-3">
            {d.audit.map((e) => (
              <li key={e.id}>
                <strong>{e.action}</strong> · {cmsTime(e.at)} · #{e.actorUser.slice(0, 8)}
                <p className="text-sm text-slate-600">{e.reason}</p>
              </li>
            ))}
          </ol>
        )}
      </section>
    </section>
  );
}
