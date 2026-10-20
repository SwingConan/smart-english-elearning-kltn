import { FormEvent, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, GraduationCap, Plus, Search } from 'lucide-react';
import { Link, useLocation } from 'react-router';
import { adminApi } from '@/features/admin/api';
import { modalityLabel, statusLabel } from '@/features/admin/labels';
import { useAdminSessionExpiry } from '@/features/admin/use-admin-session-expiry';
import {
  CLASS_MODALITIES,
  OFFERING_STATUSES,
  type AdminClassOffering,
  type AdminCourse,
  type OfferingQuery,
  type PageMeta,
} from '@/features/admin/types';

const controlClass =
  'mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200';
type LoadState =
  | { status: 'loading' }
  | { status: 'success'; offerings: AdminClassOffering[]; courses: AdminCourse[]; meta: PageMeta }
  | { status: 'error' };

export function AdminClassOfferingsPage() {
  const location = useLocation();
  const [query, setQuery] = useState<OfferingQuery>({ page: 1, limit: 20 });
  const [draft, setDraft] = useState('');
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  const redirectExpiredSession = useAdminSessionExpiry();

  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      adminApi.offerings.list(query, controller.signal),
      adminApi.courses.list({ page: 1, limit: 50 }, controller.signal),
    ])
      .then(([offerings, courses]) =>
        setState({
          status: 'success',
          offerings: offerings.data,
          meta: offerings.meta,
          courses: courses.data,
        }),
      )
      .catch(async (error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        if (await redirectExpiredSession(error)) return;
        setState({ status: 'error' });
      });
    return () => controller.abort();
  }, [query, reloadKey, redirectExpiredSession]);

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    setState({ status: 'loading' });
    setQuery((current) => ({ ...current, search: draft.trim() || undefined, page: 1 }));
  };
  const updateFilter = (key: keyof OfferingQuery, value: string | undefined) => {
    setState({ status: 'loading' });
    setQuery((current) => ({ ...current, [key]: value || undefined, page: 1 }));
  };
  const reset = () => {
    setDraft('');
    setState({ status: 'loading' });
    setQuery({ page: 1, limit: 20 });
  };
  const retry = () => {
    setState({ status: 'loading' });
    setReloadKey((value) => value + 1);
  };
  const changePage = (page: number) => {
    setState({ status: 'loading' });
    setQuery((current) => ({ ...current, page }));
  };
  const hasFilters = Boolean(
    query.search || query.courseId || query.status || query.modality || query.pricingType,
  );
  const message = (location.state as { message?: string } | null)?.message;

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-indigo-600">
            Quản trị học vụ
          </p>
          <h1 className="mt-1 text-3xl font-black tracking-tight">Lớp học</h1>
          <p className="mt-2 text-slate-600">
            Quản lý lớp mở, học phí, sức chứa và thời gian đăng ký.
          </p>
        </div>
        <Link
          className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 font-semibold text-white shadow-sm"
          to="/admin/class-offerings/new"
        >
          <Plus size={18} />
          Tạo lớp học
        </Link>
      </div>
      {message ? (
        <p
          className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-emerald-800"
          role="status"
        >
          {message}
        </p>
      ) : null}
      <form
        className="mt-6 grid gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-2 xl:grid-cols-6"
        onSubmit={submitSearch}
      >
        <label className="xl:col-span-2">
          <span className="text-sm font-semibold">Tìm kiếm</span>
          <span className="relative block">
            <Search className="absolute left-3 top-4 text-slate-400" size={17} />
            <input
              className={`${controlClass} pl-10`}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Tên, mã lớp hoặc khóa học"
              value={draft}
            />
          </span>
        </label>
        <label>
          <span className="text-sm font-semibold">Khóa học</span>
          <select
            className={controlClass}
            onChange={(event) => updateFilter('courseId', event.target.value)}
            value={query.courseId ?? ''}
          >
            <option value="">Tất cả</option>
            {state.status === 'success'
              ? state.courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.title}
                  </option>
                ))
              : null}
          </select>
        </label>
        <label>
          <span className="text-sm font-semibold">Trạng thái</span>
          <select
            className={controlClass}
            onChange={(event) => updateFilter('status', event.target.value)}
            value={query.status ?? ''}
          >
            <option value="">Tất cả</option>
            {OFFERING_STATUSES.map((status) => (
              <option key={status} value={status}>
                {statusLabel(status)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="text-sm font-semibold">Hình thức</span>
          <select
            className={controlClass}
            onChange={(event) => updateFilter('modality', event.target.value)}
            value={query.modality ?? ''}
          >
            <option value="">Tất cả</option>
            {CLASS_MODALITIES.map((modality) => (
              <option key={modality} value={modality}>
                {modalityLabel(modality)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="text-sm font-semibold">Học phí</span>
          <select
            className={controlClass}
            onChange={(event) => updateFilter('pricingType', event.target.value)}
            value={query.pricingType ?? ''}
          >
            <option value="">Tất cả</option>
            <option value="FREE">Miễn phí</option>
            <option value="PAID">Có phí</option>
          </select>
        </label>
        <div className="flex gap-2 md:col-span-2 xl:col-span-6">
          <button
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
            type="submit"
          >
            Áp dụng
          </button>
          <button
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-50"
            disabled={!hasFilters && !draft}
            onClick={reset}
            type="button"
          >
            Đặt lại
          </button>
        </div>
      </form>
      <div className="mt-6">
        {state.status === 'loading' ? (
          <p className="rounded-2xl border bg-white p-8 text-center" role="status">
            Đang tải lớp học...
          </p>
        ) : null}
        {state.status === 'error' ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6" role="alert">
            <p className="font-semibold text-red-800">Không thể tải dữ liệu quản trị.</p>
            <button
              className="mt-3 rounded-lg border border-red-300 px-3 py-2"
              onClick={retry}
              type="button"
            >
              Thử lại
            </button>
          </div>
        ) : null}
        {state.status === 'success' && state.offerings.length === 0 ? (
          <Empty filtered={hasFilters} onReset={reset} />
        ) : null}
        {state.status === 'success' && state.offerings.length ? (
          <OfferingResults offerings={state.offerings} />
        ) : null}
        {state.status === 'success' ? <Pagination meta={state.meta} onPage={changePage} /> : null}
      </div>
    </section>
  );
}

function OfferingResults({ offerings }: { offerings: AdminClassOffering[] }) {
  return (
    <>
      <div className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:block">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-4">Lớp học</th>
              <th className="px-4 py-4">Khóa học</th>
              <th className="px-4 py-4">Trạng thái</th>
              <th className="px-4 py-4">Hình thức</th>
              <th className="px-4 py-4">Đăng ký</th>
              <th className="px-4 py-4">Giảng viên</th>
              <th>
                <span className="sr-only">Thao tác</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {offerings.map((item) => (
              <tr key={item.id}>
                <td className="px-4 py-4">
                  <p className="font-semibold">{item.name}</p>
                  <p className="text-xs text-slate-500">{item.code}</p>
                </td>
                <td className="px-4 py-4">{item.course.title}</td>
                <td className="px-4 py-4">
                  <Badge>{statusLabel(item.status)}</Badge>
                </td>
                <td className="px-4 py-4">{modalityLabel(item.modality)}</td>
                <td className="px-4 py-4">
                  <p>
                    {item.registeredCount}/{item.maxStudents ?? '∞'}
                  </p>
                  <p className="text-xs text-slate-500">
                    {registrationLabel(item.registrationState)}
                  </p>
                </td>
                <td className="px-4 py-4">{item.instructor?.fullName ?? 'Chưa phân công'}</td>
                <td className="px-4 py-4 text-right">
                  <Link
                    className="font-semibold text-indigo-700"
                    to={`/admin/class-offerings/${item.id}/edit`}
                  >
                    Chỉnh sửa
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="space-y-3 lg:hidden">
        {offerings.map((item) => (
          <article className="rounded-2xl border bg-white p-4 shadow-sm" key={item.id}>
            <div className="flex justify-between gap-3">
              <div>
                <h2 className="font-bold">{item.name}</h2>
                <p className="text-xs text-slate-500">
                  {item.code} · {item.course.title}
                </p>
              </div>
              <Badge>{statusLabel(item.status)}</Badge>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-slate-500">Hình thức</dt>
                <dd>{modalityLabel(item.modality)}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Đăng ký</dt>
                <dd>
                  {item.registeredCount}/{item.maxStudents ?? '∞'} ·{' '}
                  {registrationLabel(item.registrationState)}
                </dd>
              </div>
              <div className="col-span-2">
                <dt className="text-slate-500">Giảng viên</dt>
                <dd>{item.instructor?.fullName ?? 'Chưa phân công'}</dd>
              </div>
            </dl>
            <Link
              className="mt-4 inline-block font-semibold text-indigo-700"
              to={`/admin/class-offerings/${item.id}/edit`}
            >
              Chỉnh sửa
            </Link>
          </article>
        ))}
      </div>
    </>
  );
}
function Empty({ filtered, onReset }: { filtered: boolean; onReset: () => void }) {
  return (
    <div className="rounded-2xl border border-dashed bg-white p-10 text-center">
      <GraduationCap className="mx-auto text-slate-400" />
      <h2 className="mt-3 font-bold">
        {filtered ? 'Không có lớp học phù hợp' : 'Chưa có lớp học nào'}
      </h2>
      {filtered ? (
        <button className="mt-3 font-semibold text-indigo-700" onClick={onReset} type="button">
          Xóa bộ lọc
        </button>
      ) : (
        <Link
          className="mt-3 inline-block font-semibold text-indigo-700"
          to="/admin/class-offerings/new"
        >
          Tạo lớp học đầu tiên
        </Link>
      )}
    </div>
  );
}
function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-bold text-indigo-700">
      {children}
    </span>
  );
}
function Pagination({ meta, onPage }: { meta: PageMeta; onPage: (page: number) => void }) {
  if (meta.totalPages <= 1) return null;
  return (
    <nav aria-label="Phân trang lớp học" className="mt-4 flex items-center justify-between">
      <p className="text-sm text-slate-600">
        Trang {meta.page}/{meta.totalPages} · {meta.total} kết quả
      </p>
      <div className="flex gap-2">
        <button
          aria-label="Trang trước"
          className="rounded-lg border bg-white p-2 disabled:opacity-40"
          disabled={meta.page <= 1}
          onClick={() => onPage(meta.page - 1)}
          type="button"
        >
          <ChevronLeft />
        </button>
        <button
          aria-label="Trang sau"
          className="rounded-lg border bg-white p-2 disabled:opacity-40"
          disabled={meta.page >= meta.totalPages}
          onClick={() => onPage(meta.page + 1)}
          type="button"
        >
          <ChevronRight />
        </button>
      </div>
    </nav>
  );
}
function registrationLabel(state: AdminClassOffering['registrationState']) {
  return { AVAILABLE: 'Còn chỗ', FULL: 'Đã đầy', UPCOMING: 'Sắp mở', CLOSED: 'Đã đóng' }[state];
}
