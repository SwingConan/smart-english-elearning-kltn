export const CATALOG_LIMIT = 12;

export interface CatalogUrlState {
  search: string;
  level: string;
  page: number;
}

export function readCatalogUrlState(params: URLSearchParams): CatalogUrlState {
  const search = params.get('search')?.trim() ?? '';
  const level = params.get('level')?.trim() ?? '';
  const rawPage = Number(params.get('page'));
  const page = Number.isSafeInteger(rawPage) && rawPage >= 1 ? rawPage : 1;
  return { search, level, page };
}

export function writeCatalogUrlState(state: CatalogUrlState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.search) params.set('search', state.search);
  if (state.level) params.set('level', state.level);
  if (state.page > 1) params.set('page', String(state.page));
  return params;
}
