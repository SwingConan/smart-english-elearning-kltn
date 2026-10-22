import { FormEvent, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, SlidersHorizontal } from 'lucide-react';
import { Link } from 'react-router';
import { adminApi } from '@/features/admin/api';
import { courseSkillScopeLabel } from '@/features/admin/labels';
import type {
  CourseRecommendationDirectoryQuery,
  CourseRecommendationProfile,
  CourseRecommendationProfileState,
  CourseRecommendationRow,
  PageMeta,
} from '@/features/admin/types';
import { useAdminSessionExpiry } from '@/features/admin/use-admin-session-expiry';
import { courseLevelLabel } from '@/features/catalog/display';

type Filters = { search: string; publication: string; profileState: string };
const initialFilters: Filters = { search: '', publication: '', profileState: '' };

export function AdminCourseRecommendationProfilesPage() {
  const redirectExpiredSession = useAdminSessionExpiry();
  const [filters, setFilters] = useState(initialFilters);
  const [query, setQuery] = useState<CourseRecommendationDirectoryQuery>({ page: 1, limit: 20 });
  const [rows, setRows] = useState<CourseRecommendationRow[] | null>(null);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    void adminApi.criteria.courseRecommendations
      .list(query, controller.signal)
      .then((response) => {
        setRows(response.data);
        setMeta(response.meta);
      })
      .catch(async (reason: unknown) => {
        if (reason instanceof Error && reason.name === 'AbortError') return;
        if (await redirectExpiredSession(reason)) return;
        setError(true);
      });
    return () => controller.abort();
  }, [query, redirectExpiredSession, reloadKey]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError(false);
    setRows(null);
    setQuery({
      search: filters.search.trim() || undefined,
      isPublished: filters.publication === '' ? undefined : filters.publication === 'true',
      profileState: (filters.profileState || undefined) as
        CourseRecommendationProfileState | undefined,
      page: 1,
      limit: 20,
    });
  };
  const reset = () => {
    setFilters(initialFilters);
    setError(false);
    setRows(null);
    setQuery({ page: 1, limit: 20 });
  };

  return (
    <section>
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-600">
        Quản trị học vụ
      </p>
      <div className="mt-2 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-3xl font-bold">Tiêu chí gợi ý khóa học</h1>
          <p className="mt-2 max-w-3xl leading-7 text-slate-600">
            Cấu hình điều kiện Listening/Reading để hệ thống gợi ý khóa học phù hợp cho các kết quả
            mới.
          </p>
        </div>
      </div>
      <div className="mt-5 rounded-2xl border border-indigo-200 bg-indigo-50 p-4 text-sm leading-6 text-indigo-950">
        Gợi ý được quyết định bằng quy tắc xác định. AI không thay đổi kết quả. Các gợi ý đã lưu
        trước đây không bị tính lại.
      </div>

      <form
        className="mt-6 grid gap-3 rounded-2xl border bg-white p-4 shadow-sm md:grid-cols-[minmax(14rem,1fr)_12rem_12rem_auto]"
        onSubmit={submit}
      >
        <label>
          <span className="sr-only">Tìm tên khóa học</span>
          <input
            className="w-full rounded-xl border px-3 py-2.5"
            onChange={(event) =>
              setFilters((current) => ({ ...current, search: event.target.value }))
            }
            placeholder="Tìm tên khóa học"
            value={filters.search}
          />
        </label>
        <label>
          <span className="sr-only">Trạng thái công bố</span>
          <select
            className="w-full rounded-xl border px-3 py-2.5"
            onChange={(event) =>
              setFilters((current) => ({ ...current, publication: event.target.value }))
            }
            value={filters.publication}
          >
            <option value="">Mọi trạng thái công bố</option>
            <option value="true">Đã công bố</option>
            <option value="false">Bản nháp</option>
          </select>
        </label>
        <label>
          <span className="sr-only">Trạng thái hồ sơ</span>
          <select
            className="w-full rounded-xl border px-3 py-2.5"
            onChange={(event) =>
              setFilters((current) => ({ ...current, profileState: event.target.value }))
            }
            value={filters.profileState}
          >
            <option value="">Mọi trạng thái gợi ý</option>
            <option value="ACTIVE">Đang áp dụng</option>
            <option value="INACTIVE">Tạm tắt</option>
            <option value="UNCONFIGURED">Chưa cấu hình</option>
          </select>
        </label>
        <div className="flex gap-2">
          <button className="btn-primary flex-1" type="submit">
            <SlidersHorizontal size={17} /> Lọc
          </button>
          <button className="btn-secondary" onClick={reset} type="button">
            Đặt lại
          </button>
        </div>
      </form>

      {error ? (
        <ErrorState
          onRetry={() => {
            setError(false);
            setRows(null);
            setReloadKey((key) => key + 1);
          }}
        />
      ) : null}
      {!error && rows === null ? (
        <div
          aria-label="Đang tải danh sách tiêu chí gợi ý khóa học"
          className="mt-6 h-72 animate-pulse rounded-2xl bg-slate-200"
          role="status"
        />
      ) : null}
      {!error && rows?.length === 0 ? (
        <EmptyState
          filtered={Object.values(query).some(
            (value) => value !== undefined && value !== 1 && value !== 20,
          )}
          onReset={reset}
        />
      ) : null}
      {rows?.length ? <Directory rows={rows} /> : null}
      {meta ? (
        <Pagination
          meta={meta}
          onPage={(page) => {
            setRows(null);
            setQuery((current) => ({ ...current, page }));
          }}
        />
      ) : null}
    </section>
  );
}

function Directory({ rows }: { rows: CourseRecommendationRow[] }) {
  return (
    <>
      <div className="mt-6 hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm md:block">
        <table className="w-full min-w-[920px] text-left text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-4 py-3">Khóa học</th>
              <th className="px-4 py-3">Công bố</th>
              <th className="px-4 py-3">Gợi ý</th>
              <th className="px-4 py-3">Cách kết hợp</th>
              <th className="px-4 py-3">Ưu tiên</th>
              <th className="px-4 py-3">Điều kiện</th>
              <th className="px-4 py-3">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr className="border-t align-top" key={row.course.id}>
                <td className="px-4 py-4">
                  <p className="font-bold">{row.course.title}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {courseLevelLabel(row.course.level)} ·{' '}
                    {courseSkillScopeLabel(row.course.skillScope)}
                  </p>
                </td>
                <td className="px-4 py-4">
                  <PublicationBadge published={row.course.isPublished} />
                  {!row.course.isPublished ? (
                    <p className="mt-2 max-w-44 text-xs leading-5 text-amber-800">
                      Khóa học chưa công bố nên không xuất hiện trong gợi ý cho học viên.
                    </p>
                  ) : null}
                </td>
                <td className="px-4 py-4">
                  <ProfileBadge profile={row.profile} />
                </td>
                <td className="px-4 py-4">{ruleModeLabel(row.profile)}</td>
                <td className="px-4 py-4">{row.profile?.priority ?? '—'}</td>
                <td className="max-w-64 px-4 py-4 text-slate-700">
                  {criteriaSummary(row.profile)}
                </td>
                <td className="px-4 py-4">
                  <Link
                    className="font-semibold text-indigo-700"
                    to={`/admin/criteria/course-recommendations/${row.course.id}`}
                  >
                    Chỉnh sửa
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-6 space-y-4 md:hidden">
        {rows.map((row) => (
          <article className="rounded-2xl border bg-white p-5 shadow-sm" key={row.course.id}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-bold">{row.course.title}</h2>
                <p className="mt-1 text-xs text-slate-500">
                  {courseLevelLabel(row.course.level)} ·{' '}
                  {courseSkillScopeLabel(row.course.skillScope)}
                </p>
              </div>
              <PublicationBadge published={row.course.isPublished} />
            </div>
            <div className="mt-4">
              <ProfileBadge profile={row.profile} />
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-slate-500">Cách kết hợp</dt>
                <dd className="font-medium">{ruleModeLabel(row.profile)}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Ưu tiên</dt>
                <dd className="font-medium">{row.profile?.priority ?? '—'}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-slate-500">Điều kiện</dt>
                <dd className="mt-1">{criteriaSummary(row.profile)}</dd>
              </div>
            </dl>
            {!row.course.isPublished ? (
              <p className="mt-4 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                Khóa học chưa công bố nên không xuất hiện trong gợi ý cho học viên.
              </p>
            ) : null}
            <Link
              className="mt-4 inline-block font-semibold text-indigo-700"
              to={`/admin/criteria/course-recommendations/${row.course.id}`}
            >
              Chỉnh sửa tiêu chí
            </Link>
          </article>
        ))}
      </div>
    </>
  );
}

function PublicationBadge({ published }: { published: boolean }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${published ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}
    >
      {published ? 'Đã công bố' : 'Bản nháp'}
    </span>
  );
}
function ProfileBadge({ profile }: { profile: CourseRecommendationProfile | null }) {
  const label = profile ? (profile.isActive ? 'Đang áp dụng' : 'Tạm tắt') : 'Chưa cấu hình';
  const style = profile
    ? profile.isActive
      ? 'bg-indigo-100 text-indigo-800'
      : 'bg-slate-200 text-slate-700'
    : 'bg-amber-100 text-amber-800';
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${style}`}>
      {label}
    </span>
  );
}
function ruleModeLabel(profile: CourseRecommendationProfile | null) {
  return profile
    ? profile.ruleMode === 'ALL'
      ? 'Tất cả điều kiện'
      : 'Chỉ cần một điều kiện'
    : '—';
}
function criteriaSummary(profile: CourseRecommendationProfile | null) {
  if (!profile?.criteria.length) return 'Chưa có điều kiện';
  const joiner = profile.ruleMode === 'ALL' ? ' và ' : ' hoặc ';
  return profile.criteria
    .map(
      (criterion) =>
        `${criterion.skill === 'LISTENING' ? 'Listening' : 'Reading'} ${criterion.minNormalizedScore ?? 'không giới hạn'}–${criterion.maxNormalizedScore ?? 'không giới hạn'}`,
    )
    .join(joiner);
}
function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-6" role="alert">
      <p className="font-semibold text-red-800">Không thể tải danh sách tiêu chí gợi ý khóa học.</p>
      <button className="btn-secondary mt-3" onClick={onRetry}>
        Thử lại
      </button>
    </div>
  );
}
function EmptyState({ filtered, onReset }: { filtered: boolean; onReset: () => void }) {
  return (
    <div className="mt-6 rounded-2xl border border-dashed bg-white p-10 text-center">
      <h2 className="font-bold">
        {filtered ? 'Không có khóa học phù hợp bộ lọc' : 'Chưa có khóa học nào'}
      </h2>
      {filtered ? (
        <button className="mt-3 font-semibold text-indigo-700" onClick={onReset}>
          Xóa bộ lọc
        </button>
      ) : null}
    </div>
  );
}
function Pagination({ meta, onPage }: { meta: PageMeta; onPage: (page: number) => void }) {
  if (meta.totalPages <= 1) return null;
  return (
    <nav
      aria-label="Phân trang tiêu chí khóa học"
      className="mt-4 flex items-center justify-between"
    >
      <p className="text-sm text-slate-600">
        Trang {meta.page}/{meta.totalPages} · {meta.total} kết quả
      </p>
      <div className="flex gap-2">
        <button
          aria-label="Trang trước"
          className="rounded-lg border bg-white p-2 disabled:opacity-40"
          disabled={meta.page <= 1}
          onClick={() => onPage(meta.page - 1)}
        >
          <ChevronLeft />
        </button>
        <button
          aria-label="Trang sau"
          className="rounded-lg border bg-white p-2 disabled:opacity-40"
          disabled={meta.page >= meta.totalPages}
          onClick={() => onPage(meta.page + 1)}
        >
          <ChevronRight />
        </button>
      </div>
    </nav>
  );
}
