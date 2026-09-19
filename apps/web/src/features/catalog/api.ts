import { apiFetch } from '@/lib/api-client';
import type { CatalogQuery, CatalogResponse, PublicCourse } from './types';

export const catalogApi = {
  list: (query: CatalogQuery, signal?: AbortSignal) => {
    const params = new URLSearchParams();
    if (query.search) params.set('search', query.search);
    if (query.level) params.set('level', query.level);
    params.set('page', String(query.page));
    params.set('limit', String(query.limit));
    return apiFetch<CatalogResponse>(`/courses?${params.toString()}`, { signal });
  },
  detail: (slug: string, signal?: AbortSignal) =>
    apiFetch<PublicCourse>(`/courses/${encodeURIComponent(slug)}`, { signal }),
};
