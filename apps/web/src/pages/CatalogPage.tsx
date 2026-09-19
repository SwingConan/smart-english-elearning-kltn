import { FormEvent, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { catalogApi } from '@/features/catalog/api';
import {
  CATALOG_LIMIT,
  readCatalogUrlState,
  writeCatalogUrlState,
} from '@/features/catalog/catalog-query';
import { CourseCard } from '@/features/catalog/CourseCard';
import type { CatalogResponse } from '@/features/catalog/types';

type CatalogLoadState =
  | { key: string; status: 'loading' }
  | { key: string; status: 'success'; response: CatalogResponse }
  | { key: string; status: 'error' };

export function CatalogPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlState = readCatalogUrlState(searchParams);
  const requestKey = `${urlState.search}|${urlState.level}|${urlState.page}`;
  const [loadState, setLoadState] = useState<CatalogLoadState>({
    key: '',
    status: 'loading',
  });

  useEffect(() => {
    const controller = new AbortController();
    void catalogApi
      .list(
        {
          search: urlState.search || undefined,
          level: urlState.level || undefined,
          page: urlState.page,
          limit: CATALOG_LIMIT,
        },
        controller.signal,
      )
      .then((response) => {
        setLoadState({ key: requestKey, status: 'success', response });
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setLoadState({ key: requestKey, status: 'error' });
        }
      });
    return () => controller.abort();
  }, [requestKey, urlState.level, urlState.page, urlState.search]);

  const updateUrl = (next: typeof urlState) => {
    setSearchParams(writeCatalogUrlState(next));
  };
  const isCurrent = loadState.key === requestKey;
  const response = isCurrent && loadState.status === 'success' ? loadState.response : null;
  const levelOptions = Array.from(
    new Set([urlState.level, ...(response?.data.map((course) => course.level) ?? [])]),
  ).filter(Boolean);

  return (
    <section>
      <h1 className="text-3xl font-bold">Khóa học</h1>
      <p className="mt-2 text-slate-600">Khám phá các khóa học tiếng Anh đang được công bố.</p>

      <CatalogFilters
        key={`${urlState.search}|${urlState.level}`}
        initialSearch={urlState.search}
        level={urlState.level}
        levelOptions={levelOptions}
        onLevelChange={(level) => updateUrl({ ...urlState, level, page: 1 })}
        onSearch={(search) => updateUrl({ ...urlState, search, page: 1 })}
      />

      {!isCurrent || loadState.status === 'loading' ? (
        <p className="mt-8" role="status">Đang tải danh sách khóa học...</p>
      ) : null}
      {isCurrent && loadState.status === 'error' ? (
        <p className="mt-8 rounded-md bg-red-50 p-4 text-red-700" role="alert">
          Không thể tải danh sách khóa học. Vui lòng thử lại.
        </p>
      ) : null}
      {response?.data.length === 0 ? (
        <p className="mt-8 rounded-md border bg-white p-6">Không tìm thấy khóa học phù hợp.</p>
      ) : null}
      {response && response.data.length > 0 ? (
        <>
          <div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {response.data.map((course) => <CourseCard course={course} key={course.id} />)}
          </div>
          <nav aria-label="Phân trang khóa học" className="mt-8 flex items-center justify-center gap-4">
            <button
              aria-label="Trang trước"
              className="rounded-md border bg-white px-4 py-2 disabled:opacity-50"
              disabled={response.meta.page <= 1}
              onClick={() => updateUrl({ ...urlState, page: response.meta.page - 1 })}
              type="button"
            >
              Trước
            </button>
            <span>Trang {response.meta.page} / {Math.max(response.meta.totalPages, 1)}</span>
            <button
              aria-label="Trang sau"
              className="rounded-md border bg-white px-4 py-2 disabled:opacity-50"
              disabled={response.meta.page >= response.meta.totalPages}
              onClick={() => updateUrl({ ...urlState, page: response.meta.page + 1 })}
              type="button"
            >
              Sau
            </button>
          </nav>
        </>
      ) : null}
    </section>
  );
}

interface CatalogFiltersProps {
  initialSearch: string;
  level: string;
  levelOptions: string[];
  onSearch: (search: string) => void;
  onLevelChange: (level: string) => void;
}

function CatalogFilters({ initialSearch, level, levelOptions, onSearch, onLevelChange }: CatalogFiltersProps) {
  const [search, setSearch] = useState(initialSearch);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSearch(search.trim());
  };

  return (
    <form className="mt-6 flex flex-col gap-4 rounded-xl border bg-white p-4 md:flex-row md:items-end" onSubmit={submit}>
      <label className="flex-1">
        <span className="block text-sm font-medium">Tìm khóa học</span>
        <input
          className="mt-1 w-full rounded-md border px-3 py-2"
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Ví dụ: grammar"
          type="search"
          value={search}
        />
      </label>
      <label>
        <span className="block text-sm font-medium">Trình độ</span>
        <select
          className="mt-1 w-full rounded-md border px-3 py-2"
          onChange={(event) => onLevelChange(event.target.value)}
          value={level}
        >
          <option value="">Tất cả</option>
          {levelOptions.map((courseLevel) => (
            <option key={courseLevel} value={courseLevel}>{courseLevel}</option>
          ))}
        </select>
      </label>
      <button className="rounded-md bg-slate-900 px-5 py-2 text-white" type="submit">
        Tìm kiếm
      </button>
    </form>
  );
}
