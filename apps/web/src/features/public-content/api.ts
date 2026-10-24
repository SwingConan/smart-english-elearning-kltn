import { apiFetch } from '@/lib/api-client';
export interface PublicContent {
  id: string;
  slug: string;
  category: string;
  title: string;
  excerpt: string;
  bodyMarkdown?: string;
  coverKey?: string | null;
  coverImageUrl?: string | null;
  featured: boolean;
  status?: string;
  publishedAt?: string | null;
}
export const publicContentApi = {
  list: (category?: string) =>
    apiFetch<{ data: PublicContent[] }>(
      `/public-content${category ? `?category=${encodeURIComponent(category)}` : ''}`,
    ),
  detail: (slug: string) => apiFetch<PublicContent>(`/public-content/${encodeURIComponent(slug)}`),
  admin: () => apiFetch<PublicContent[]>('/admin/public-content'),
  create: (input: Omit<PublicContent, 'id'>) =>
    apiFetch<PublicContent>('/admin/public-content', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  publish: (id: string) =>
    apiFetch<PublicContent>(`/admin/public-content/${id}/publish`, { method: 'POST' }),
  archive: (id: string) =>
    apiFetch<PublicContent>(`/admin/public-content/${id}/archive`, { method: 'POST' }),
};
