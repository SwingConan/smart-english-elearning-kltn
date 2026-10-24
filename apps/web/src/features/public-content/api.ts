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
export interface PublicContent {
  id: string;
  slug: string;
  category: string;
  title: string;
  excerpt: string;
  bodyMarkdown?: string;
  coverKey?: PublicContentCoverKey | null;
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
  adminDetail: (id: string) => apiFetch<PublicContent>(`/admin/public-content/${id}`),
  create: (input: Omit<PublicContent, 'id'>) =>
    apiFetch<PublicContent>('/admin/public-content', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  update: (id: string, input: Partial<Omit<PublicContent, 'id' | 'status'>>) =>
    apiFetch<PublicContent>(`/admin/public-content/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
  publish: (id: string) =>
    apiFetch<PublicContent>(`/admin/public-content/${id}/publish`, { method: 'POST' }),
  archive: (id: string) =>
    apiFetch<PublicContent>(`/admin/public-content/${id}/archive`, { method: 'POST' }),
};
