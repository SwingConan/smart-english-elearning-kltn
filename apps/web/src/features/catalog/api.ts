import { apiFetch } from '@/lib/api-client';
import type { CatalogQuery, CatalogResponse, PublicClassOffering, PublicCourse } from './types';

export const catalogApi = {
  list: (query: CatalogQuery, signal?: AbortSignal) => {
    const params = new URLSearchParams();
    if (query.search) params.set('search', query.search);
    if (query.level) params.set('level', query.level);
    if (query.skillScope) params.set('skillScope', query.skillScope);
    if (query.availability) params.set('availability', query.availability);
    params.set('page', String(query.page));
    params.set('limit', String(query.limit));
    return apiFetch<CatalogResponse>(`/courses?${params.toString()}`, { signal });
  },
  detail: (slug: string, signal?: AbortSignal) =>
    apiFetch<PublicCourse>(`/courses/${encodeURIComponent(slug)}`, { signal }),
  offeringDetail: (id: string, signal?: AbortSignal) =>
    apiFetch<
      PublicClassOffering & { course: Omit<PublicCourse, 'classOfferings' | 'openOfferingCount'> }
    >(`/class-offerings/${encodeURIComponent(id)}`, { signal }),
};
