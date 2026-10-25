import { apiFetch } from '@/lib/api-client';
export const PUBLIC_CONTENT_COVER_OPTIONS = [
  { value: 'enrollment', label: 'Khai giảng và đăng ký' },
  { value: 'listening', label: 'Luyện nghe' },
  { value: 'reading', label: 'Luyện đọc' },
  { value: 'speaking', label: 'Luyện nói' },
  { value: 'writing', label: 'Luyện viết' },
  { value: 'placement', label: 'Kiểm tra đầu vào' },
  { value: 'study-rhythm', label: 'Nhịp độ học tập' },
  { value: 'results', label: 'Kết quả học tập' },
] as const;
export type PublicContentCoverKey = (typeof PUBLIC_CONTENT_COVER_OPTIONS)[number]['value'];
export interface PublicContentCategory {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  sortOrder: number;
  isActive: boolean;
  _count?: { content: number };
}
export interface PublicContentAsset {
  id: string;
  storageKey: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
  createdAt: string;
}
export interface PublicContent {
  id: string;
  slug: string;
  categoryId?: string;
  category: PublicContentCategory | string;
  title: string;
  excerpt: string;
  contentFormat?: 'MARKDOWN' | 'RICH_HTML';
  bodyMarkdown?: string | null;
  bodyHtml?: string | null;
  coverKey?: PublicContentCoverKey | null;
  coverAssetId?: string | null;
  coverAsset?: PublicContentAsset | null;
  coverImageUrl?: string | null;
  featured: boolean;
  status?: string;
  publishedAt?: string | null;
}
type SaveContent = Omit<
  PublicContent,
  'id' | 'category' | 'coverAsset' | 'coverImageUrl' | 'status'
>;
export const publicContentApi = {
  list: (category?: string) =>
    apiFetch<{ data: PublicContent[] }>(
      `/public-content${category ? `?category=${encodeURIComponent(category)}` : ''}`,
    ),
  categories: () => apiFetch<PublicContentCategory[]>('/public-content/categories'),
  detail: (slug: string) => apiFetch<PublicContent>(`/public-content/${encodeURIComponent(slug)}`),
  admin: () =>
    apiFetch<{ data: PublicContent[] } | PublicContent[]>('/admin/public-content?limit=100'),
  adminDetail: (id: string) => apiFetch<PublicContent>(`/admin/public-content/${id}`),
  create: (input: SaveContent) =>
    apiFetch<PublicContent>('/admin/public-content', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  update: (id: string, input: Partial<SaveContent>) =>
    apiFetch<PublicContent>(`/admin/public-content/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
  publish: (id: string) =>
    apiFetch<PublicContent>(`/admin/public-content/${id}/publish`, { method: 'POST' }),
  archive: (id: string) =>
    apiFetch<PublicContent>(`/admin/public-content/${id}/archive`, { method: 'POST' }),
  adminCategories: () => apiFetch<PublicContentCategory[]>('/admin/public-content/categories'),
  createCategory: (input: {
    name: string;
    slug: string;
    description?: string;
    sortOrder?: number;
  }) =>
    apiFetch<PublicContentCategory>('/admin/public-content/categories', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  updateCategory: (id: string, input: Partial<PublicContentCategory>) =>
    apiFetch<PublicContentCategory>(`/admin/public-content/categories/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
  removeCategory: (id: string) =>
    apiFetch(`/admin/public-content/categories/${id}`, { method: 'DELETE' }),
  assets: () => apiFetch<PublicContentAsset[]>('/admin/public-content/assets'),
  uploadAsset: (file: File) => {
    const body = new FormData();
    body.append('file', file);
    return apiFetch<PublicContentAsset>('/admin/public-content/assets', { method: 'POST', body });
  },
  removeAsset: (id: string) => apiFetch(`/admin/public-content/assets/${id}`, { method: 'DELETE' }),
};
