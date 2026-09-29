import { FormEvent, useEffect, useState } from 'react';
import { Filter, Search } from 'lucide-react';
import { useSearchParams } from 'react-router';
import { catalogApi } from '@/features/catalog/api';
import {
  CATALOG_LIMIT,
  readCatalogUrlState,
  writeCatalogUrlState,
} from '@/features/catalog/catalog-query';
import { CourseCard } from '@/features/catalog/CourseCard';
import type { CatalogResponse, CourseSkillScope } from '@/features/catalog/types';

type LoadState =
  | { key: string; status: 'loading' }
  | { key: string; status: 'success'; response: CatalogResponse }
  | { key: string; status: 'error' };
const skillOptions: Array<[CourseSkillScope, string]> = [
  ['LR', 'Listening & Reading'],
  ['LISTENING', 'Listening'],
  ['READING', 'Reading'],
  ['SPEAKING', 'Speaking'],
  ['WRITING', 'Writing'],
  ['FOUR_SKILLS', '4 kỹ năng'],
];

export function CatalogPage() {
  const [params, setParams] = useSearchParams();
  const state = readCatalogUrlState(params);
  const [reloadKey, setReloadKey] = useState(0);
  const key = `${state.search}|${state.level}|${state.skillScope}|${state.availability}|${state.page}|${reloadKey}`;
  const [load, setLoad] = useState<LoadState>({ key: '', status: 'loading' });
  useEffect(() => {
    const controller = new AbortController();
    void catalogApi
      .list(
        {
          search: state.search || undefined,
          level: state.level || undefined,
          skillScope: (state.skillScope || undefined) as CourseSkillScope | undefined,
          availability: state.availability ? 'OPEN' : undefined,
          page: state.page,
          limit: CATALOG_LIMIT,
        },
        controller.signal,
      )
      .then((response) => setLoad({ key, status: 'success', response }))
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError'))
          setLoad({ key, status: 'error' });
      });
    return () => controller.abort();
  }, [key, state.availability, state.level, state.page, state.search, state.skillScope]);
  const current = load.key === key;
  const response = current && load.status === 'success' ? load.response : null;
  const levels = Array.from(
    new Set([state.level, ...(response?.data.map((course) => course.level) ?? [])]),
  ).filter(Boolean);
  const update = (next: typeof state) => setParams(writeCatalogUrlState(next));

  return (
    <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
      <p className="eyebrow">Danh mục khóa học</p>
      <h1 className="page-title">Chọn chương trình phù hợp</h1>
      <p className="page-lead">
        Lọc theo kỹ năng, trình độ và khả năng có lớp đang mở. Lịch học và học phí được so sánh ở
        từng lớp học đang mở.
      </p>
      <Filters
        key={`${state.search}|${state.level}|${state.skillScope}|${state.availability}`}
        initial={state}
        levels={levels}
        onChange={update}
      />
      {!current || load.status === 'loading' ? (
        <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3" role="status">
          {[1, 2, 3, 4, 5, 6].map((item) => (
            <div className="h-80 animate-pulse rounded-2xl bg-slate-200" key={item} />
          ))}
        </div>
      ) : null}
      {current && load.status === 'error' ? (
        <div className="state-error mt-10" role="alert">
          <p>Không thể tải danh sách khóa học.</p>
          <button
            className="mt-3 font-semibold underline"
            onClick={() => setReloadKey((value) => value + 1)}
            type="button"
          >
            Thử lại
          </button>
        </div>
      ) : null}
      {response?.data.length === 0 ? (
        <div className="state-empty mt-10">
          <p>Không tìm thấy khóa học phù hợp với bộ lọc.</p>
          <button
            className="mt-3 font-semibold text-indigo-700"
            onClick={() =>
              update({ search: '', level: '', skillScope: '', availability: '', page: 1 })
            }
            type="button"
          >
            Xóa bộ lọc
          </button>
        </div>
      ) : null}
      {response && response.data.length > 0 ? (
        <>
          <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {response.data.map((course) => (
              <CourseCard course={course} key={course.id} />
            ))}
          </div>
          <nav
            aria-label="Phân trang khóa học"
            className="mt-10 flex items-center justify-center gap-4"
          >
            <button
              className="btn-secondary disabled:opacity-40"
              disabled={response.meta.page <= 1}
              onClick={() => update({ ...state, page: response.meta.page - 1 })}
              type="button"
            >
              Trang trước
            </button>
            <span className="text-sm font-medium">
              Trang {response.meta.page} / {Math.max(response.meta.totalPages, 1)}
            </span>
            <button
              className="btn-secondary disabled:opacity-40"
              disabled={response.meta.page >= response.meta.totalPages}
              onClick={() => update({ ...state, page: response.meta.page + 1 })}
              type="button"
            >
              Trang sau
            </button>
          </nav>
        </>
      ) : null}
    </section>
  );
}

function Filters({
  initial,
  levels,
  onChange,
}: {
  initial: ReturnType<typeof readCatalogUrlState>;
  levels: string[];
  onChange: (state: ReturnType<typeof readCatalogUrlState>) => void;
}) {
  const [search, setSearch] = useState(initial.search);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onChange({ ...initial, search: search.trim(), page: 1 });
  };
  return (
    <form
      className="mt-9 grid gap-4 rounded-2xl border bg-white p-5 shadow-sm lg:grid-cols-[1.5fr_1fr_1fr_1fr_auto] lg:items-end"
      onSubmit={submit}
    >
      <label>
        <span className="text-sm font-semibold">Tìm kiếm</span>
        <div className="relative mt-2">
          <Search className="absolute left-3 top-2.5 text-slate-400" size={18} />
          <input
            className="w-full rounded-lg border py-2 pl-10 pr-3"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Tên hoặc từ khóa"
            type="search"
            value={search}
          />
        </div>
      </label>
      <Select
        label="Trình độ"
        value={initial.level}
        onChange={(value) => onChange({ ...initial, level: value, page: 1 })}
        options={levels.map((value) => [value, value])}
      />
      <Select
        label="Kỹ năng"
        value={initial.skillScope}
        onChange={(value) => onChange({ ...initial, skillScope: value, page: 1 })}
        options={skillOptions}
      />
      <Select
        label="Lớp học"
        value={initial.availability}
        onChange={(value) => onChange({ ...initial, availability: value, page: 1 })}
        options={[['OPEN', 'Có lớp đang mở']]}
      />
      <button className="btn-primary" type="submit">
        <Filter size={17} />
        Áp dụng
      </button>
    </form>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: ReadonlyArray<readonly [string, string]>;
}) {
  return (
    <label>
      <span className="text-sm font-semibold">{label}</span>
      <select
        className="mt-2 w-full rounded-lg border px-3 py-2"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        <option value="">Tất cả</option>
        {options.map(([optionValue, label]) => (
          <option key={optionValue} value={optionValue}>
            {label}
          </option>
        ))}
      </select>
    </label>
  );
}
