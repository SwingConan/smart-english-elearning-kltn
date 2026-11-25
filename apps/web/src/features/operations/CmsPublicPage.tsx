import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { ApiError, apiFetch } from '@/lib/api-client';
import { cmsTime, type CmsPublications } from './cms-api';
export function CmsPublicPage() {
  const { slug } = useParams(),
    [tick, setTick] = useState(0),
    [state, setState] = useState<{ key: string; data?: CmsPublications; error?: number }>();
  const path = '/v2/cms/publications' + (slug ? '/' + encodeURIComponent(slug) : ''),
    key = path + ':' + tick;
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    void apiFetch<CmsPublications>(path, { signal: controller.signal })
      .then((data) => {
        if (active) setState({ key, data });
      })
      .catch((e) => {
        if (active) setState({ key, error: e instanceof ApiError ? e.status : 503 });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [path, key]);
  const current = state?.key === key ? state : undefined;
  return (
    <section
      aria-label="Bài viết đã công bố"
      className="mx-auto max-w-[1280px] space-y-6 px-4 py-8 sm:px-6 lg:px-8"
    >
      <nav
        aria-label="Breadcrumb"
        className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500"
      >
        <Link to="/" className="text-[#2d581b] hover:underline">
          Trang chủ
        </Link>
        <span aria-hidden="true">/</span>
        <span className="inline-flex items-center rounded bg-[#76a35e] px-2.5 py-0.5 font-semibold text-white">
          Bài viết đã công bố
        </span>
      </nav>
      <header className="border-b border-slate-200 pb-4">
        <p className="text-xs font-bold tracking-wide text-[#76a35e] uppercase">
          Nội dung do nhóm biên soạn
        </p>
        <h1 className="mt-1 text-2xl font-bold text-[#e66f2b] sm:text-3xl">Bài viết đã công bố</h1>
        <p className="mt-1 text-sm text-slate-600">
          Chỉ hiển thị revision đã được duyệt và đang được công bố.
        </p>
      </header>
      {!current ? (
        <p role="status" className="rounded-md border border-slate-200 bg-white p-4 text-sm text-slate-600">
          Đang đọc nội dung công bố…
        </p>
      ) : current.error ? (
        <div
          role="alert"
          className="space-y-1 rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"
        >
          <p className="font-bold">
            {current.error === 404
              ? 'Nội dung không được công bố hoặc đã được thu hồi.'
              : 'Chưa có bài viết công bố nào sẵn sàng hiển thị lúc này.'}
          </p>
          {current.error !== 404 && (
            <p className="text-xs">
              Cổng xuất bản nội dung đang tạm ngừng hoặc chưa được kích hoạt trong phiên hiện tại.
            </p>
          )}
        </div>
      ) : !current.data?.items.length ? (
        <p className="rounded-md border border-slate-200 bg-white p-4 text-sm text-slate-600">
          Chưa có nội dung đang được công bố.
        </p>
      ) : (
        current.data.items.map((item) => (
          <article className="space-y-4 rounded-md border border-slate-200 bg-white p-6" key={item.revisionId}>
            <h2 className="text-2xl font-bold text-[#e66f2b]">
              {slug ? (
                item.title
              ) : (
                <Link to={'/cms/publications/' + item.slug} className="text-[#2d581b] hover:underline">
                  {item.title}
                </Link>
              )}
            </h2>
            <p className="text-xs text-slate-500">
              Revision {item.revision} · Công bố lúc {cmsTime(item.publishedAt)} · UTC+7
            </p>
            <p className="whitespace-pre-wrap break-words leading-8 text-slate-800">{item.body}</p>
            <p className="text-xs text-slate-600">Nguồn: {item.sourceReference}</p>
          </article>
        ))
      )}
      {current?.data?.truncated && <p className="text-xs text-slate-600">Đang hiển thị 100 nội dung công bố gần nhất.</p>}
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className="rounded border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          onClick={() => setTick((t) => t + 1)}
        >
          Đọc lại nội dung công khai
        </button>
        {slug && (
          <Link
            className="rounded border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            to="/cms/publications"
          >
            Tất cả nội dung công bố
          </Link>
        )}
        <Link
          className="rounded border border-[#76a35e] bg-[#f4f9f1] px-4 py-2 text-xs font-semibold text-[#2d581b] hover:bg-[#e5f1de]"
          to="/"
        >
          Về trang chủ
        </Link>
      </div>
    </section>
  );
}
