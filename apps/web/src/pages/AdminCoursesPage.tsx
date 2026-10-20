import { FormEvent, useEffect, useState } from 'react';
import { BookOpen, ChevronLeft, ChevronRight, Plus, Search } from 'lucide-react';
import { Link, useLocation } from 'react-router';
import { adminApi } from '@/features/admin/api';
import { useAdminSessionExpiry } from '@/features/admin/use-admin-session-expiry';
import {
  COURSE_SKILL_SCOPES,
  type AdminCourse,
  type CourseQuery,
  type PageMeta,
} from '@/features/admin/types';

const controlClass =
  'mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200';

type LoadState =
  | { status: 'loading' }
  | { status: 'success'; courses: AdminCourse[]; meta: PageMeta }
  | { status: 'error' };

export function AdminCoursesPage() {
  const location = useLocation();
  const [query, setQuery] = useState<CourseQuery>({ page: 1, limit: 20 });
  const [draft, setDraft] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const redirectExpiredSession = useAdminSessionExpiry();

  useEffect(() => {
    const controller = new AbortController();
    void adminApi.courses
      .list(query, controller.signal)
      .then(({ data, meta }) => setState({ status: 'success', courses: data, meta }))
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
  const updateFilter = (key: keyof CourseQuery, value: string | boolean | undefined) => {
    setState({ status: 'loading' });
    setQuery((current) => ({
      ...current,
      [key]: value === '' || value === undefined ? undefined : value,
      page: 1,
    }));
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
    query.search || query.isPublished !== undefined || query.skillScope || query.level,
  );
  const message = (location.state as { message?: string } | null)?.message;

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-indigo-600">
            Quản trị học vụ
          </p>
          <h1 className="mt-1 text-3xl font-black tracking-tight">Khóa học TOEIC</h1>
          <p className="mt-2 text-slate-600">
            Quản lý thông tin, phạm vi kỹ năng và trạng thái xuất bản.
          </p>
        </div>
        <Link
          className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 font-semibold text-white shadow-sm hover:bg-indigo-700"
          to="/admin/courses/new"
        >
          <Plus size={18} />
          Tạo khóa học
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
        className="mt-6 grid gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-2 xl:grid-cols-5"
        onSubmit={submitSearch}
      >
        <label className="xl:col-span-2">
          <span className="text-sm font-semibold">Tìm kiếm</span>
          <span className="relative block">
            <Search className="absolute left-3 top-4 text-slate-400" size={17} />
            <input
              className={`${controlClass} pl-10`}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Tên hoặc slug khóa học"
              value={draft}
            />
          </span>
        </label>
        <label>
          <span className="text-sm font-semibold">Xuất bản</span>
          <select
            className={controlClass}
            onChange={(event) =>
              updateFilter(
                'isPublished',
                event.target.value === '' ? undefined : event.target.value === 'true',
              )
            }
            value={query.isPublished === undefined ? '' : String(query.isPublished)}
          >
            <option value="">Tất cả</option>
            <option value="true">Đã xuất bản</option>
            <option value="false">Bản nháp</option>
          </select>
        </label>
        <label>
          <span className="text-sm font-semibold">Kỹ năng</span>
          <select
            className={controlClass}
            onChange={(event) => updateFilter('skillScope', event.target.value)}
            value={query.skillScope ?? ''}
          >
            <option value="">Tất cả</option>
            {COURSE_SKILL_SCOPES.map((scope) => (
              <option key={scope} value={scope}>
                {skillLabel(scope)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="text-sm font-semibold">Trình độ</span>
          <input
            className={controlClass}
            onChange={(event) => updateFilter('level', event.target.value.trim())}
            placeholder="Ví dụ: BEGINNER"
            value={query.level ?? ''}
          />
        </label>
        <div className="flex flex-wrap gap-2 md:col-span-2 xl:col-span-5">
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
        {state.status === 'loading' ? <Loading label="Đang tải khóa học..." /> : null}
        {state.status === 'error' ? <ErrorState onRetry={retry} /> : null}
        {state.status === 'success' && state.courses.length === 0 ? (
          <EmptyState filtered={hasFilters} onReset={reset} />
        ) : null}
        {state.status === 'success' && state.courses.length > 0 ? (
          <CourseResults courses={state.courses} />
        ) : null}
        {state.status === 'success' ? <Pagination meta={state.meta} onPage={changePage} /> : null}
      </div>
    </section>
  );
}

function CourseResults({ courses }: { courses: AdminCourse[] }) {
  return (
    <>
      <div className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm md:block">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-5 py-4">Khóa học</th>
              <th className="px-5 py-4">Phạm vi</th>
              <th className="px-5 py-4">Trình độ</th>
              <th className="px-5 py-4">Lớp</th>
              <th className="px-5 py-4">Trạng thái</th>
              <th className="px-5 py-4">Cập nhật</th>
              <th className="px-5 py-4">
                <span className="sr-only">Thao tác</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {courses.map((course) => (
              <tr key={course.id}>
                <td className="px-5 py-4">
                  <p className="font-semibold">{course.title}</p>
                  <p className="mt-1 text-xs text-slate-500">/{course.slug}</p>
                </td>
                <td className="px-5 py-4">{skillLabel(course.skillScope)}</td>
                <td className="px-5 py-4">{course.level}</td>
                <td className="px-5 py-4">{course._count?.classOfferings ?? 0}</td>
                <td className="px-5 py-4">
                  <Status published={course.isPublished} />
                </td>
                <td className="px-5 py-4">{formatDate(course.updatedAt)}</td>
                <td className="px-5 py-4 text-right">
                  <Link
                    className="font-semibold text-indigo-700 hover:underline"
                    to={`/admin/courses/${course.id}/edit`}
                  >
                    Chỉnh sửa
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="space-y-3 md:hidden">
        {courses.map((course) => (
          <article
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
            key={course.id}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-bold">{course.title}</h2>
                <p className="text-xs text-slate-500">/{course.slug}</p>
              </div>
              <Status published={course.isPublished} />
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-slate-500">Kỹ năng</dt>
                <dd className="font-medium">{skillLabel(course.skillScope)}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Trình độ</dt>
                <dd className="font-medium">{course.level}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Số lớp</dt>
                <dd className="font-medium">{course._count?.classOfferings ?? 0}</dd>
              </div>
            </dl>
            <Link
              className="mt-4 inline-block font-semibold text-indigo-700"
              to={`/admin/courses/${course.id}/edit`}
            >
              Chỉnh sửa
            </Link>
          </article>
        ))}
      </div>
    </>
  );
}

function Status({ published }: { published: boolean }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${published ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}
    >
      {published ? 'Đã xuất bản' : 'Bản nháp'}
    </span>
  );
}
function Loading({ label }: { label: string }) {
  return (
    <div className="rounded-2xl border bg-white p-8 text-center text-slate-600" role="status">
      {label}
    </div>
  );
}
function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 p-6" role="alert">
      <p className="font-semibold text-red-800">Không thể tải danh sách khóa học.</p>
      <button
        className="mt-3 rounded-lg border border-red-300 px-3 py-2 text-sm font-semibold text-red-800"
        onClick={onRetry}
        type="button"
      >
        Thử lại
      </button>
    </div>
  );
}
function EmptyState({ filtered, onReset }: { filtered: boolean; onReset: () => void }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
      <BookOpen className="mx-auto text-slate-400" />
      <h2 className="mt-3 font-bold">
        {filtered ? 'Không có khóa học phù hợp' : 'Chưa có khóa học nào'}
      </h2>
      {filtered ? (
        <button className="mt-3 font-semibold text-indigo-700" onClick={onReset} type="button">
          Xóa bộ lọc
        </button>
      ) : (
        <Link className="mt-3 inline-block font-semibold text-indigo-700" to="/admin/courses/new">
          Tạo khóa học đầu tiên
        </Link>
      )}
    </div>
  );
}
function Pagination({ meta, onPage }: { meta: PageMeta; onPage: (page: number) => void }) {
  if (meta.totalPages <= 1) return null;
  return (
    <nav aria-label="Phân trang khóa học" className="mt-4 flex items-center justify-between">
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
function skillLabel(scope: AdminCourse['skillScope']): string {
  return {
    LISTENING: 'Nghe',
    READING: 'Đọc',
    LR: 'Nghe & Đọc',
    SPEAKING: 'Nói',
    WRITING: 'Viết',
    FOUR_SKILLS: 'Bốn kỹ năng',
  }[scope];
}
function formatDate(value: string): string {
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short' }).format(new Date(value));
}
