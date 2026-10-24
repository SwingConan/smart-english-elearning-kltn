import { FormEvent, useCallback, useEffect, useState } from 'react';
import { SafeMarkdown } from '@/components/ui/SafeMarkdown';
import type { PublicContent } from '@/features/public-content/api';
import { publicContentApi } from '@/features/public-content/api';
import { datetimeLocalToIso, isoToDatetimeLocal } from '@/features/public-content/datetime';

const emptyForm = {
  id: '',
  slug: '',
  category: 'Cập nhật chương trình',
  title: '',
  excerpt: '',
  bodyMarkdown: '',
  featured: false,
  coverKey: '',
  coverImageUrl: '',
  publishedAt: '',
  publishedAtOriginal: '' as string | null,
  publishedAtDirty: false,
};

export function AdminPublicContentPage() {
  const [items, setItems] = useState<PublicContent[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const load = useCallback(() => {
    return publicContentApi
      .admin()
      .then((data) => {
        setItems(data);
        setState('ready');
      })
      .catch(() => setState('error'));
  }, []);
  useEffect(() => void load(), [load]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setMessage('');
    const input = {
      slug: form.slug,
      category: form.category,
      title: form.title,
      excerpt: form.excerpt,
      bodyMarkdown: form.bodyMarkdown,
      featured: form.featured,
      coverKey: form.coverKey.trim() || null,
      coverImageUrl: form.coverImageUrl.trim() || null,
      ...(!form.id || form.publishedAtDirty
        ? { publishedAt: datetimeLocalToIso(form.publishedAt) }
        : {}),
    };
    if (form.id) await publicContentApi.update(form.id, input);
    else await publicContentApi.create(input);
    setMessage(form.id ? 'Đã lưu thay đổi bài viết.' : 'Đã tạo bản nháp.');
    setForm(emptyForm);
    await load();
  };

  const edit = async (id: string) => {
    const item = await publicContentApi.adminDetail(id);
    setForm({
      id: item.id,
      slug: item.slug,
      category: item.category,
      title: item.title,
      excerpt: item.excerpt,
      bodyMarkdown: item.bodyMarkdown ?? '',
      featured: item.featured,
      coverKey: item.coverKey ?? '',
      coverImageUrl: item.coverImageUrl ?? '',
      publishedAt: item.publishedAt ? isoToDatetimeLocal(item.publishedAt) : '',
      publishedAtOriginal: item.publishedAt ?? null,
      publishedAtDirty: false,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <section>
      <h1 className="text-3xl font-black">Nội dung công khai</h1>
      <form className="mt-6 grid gap-4 rounded-2xl border bg-white p-6" onSubmit={save}>
        <h2 className="text-xl font-bold">{form.id ? 'Chỉnh sửa bài viết' : 'Tạo bản nháp'}</h2>
        <label>
          <span className="text-sm font-semibold">Tiêu đề</span>
          <input
            className="input-field mt-1"
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            required
            value={form.title}
          />
        </label>
        <div className="grid gap-4 md:grid-cols-2">
          <label>
            <span className="text-sm font-semibold">Slug</span>
            <input
              className="input-field mt-1"
              onChange={(e) => setForm({ ...form, slug: e.target.value })}
              required
              value={form.slug}
            />
          </label>
          <label>
            <span className="text-sm font-semibold">Danh mục</span>
            <select
              className="input-field mt-1"
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              value={form.category}
            >
              <option>Cập nhật chương trình</option>
              <option>Lịch khai giảng</option>
              <option>Workshop</option>
              <option>Kỹ năng TOEIC</option>
              <option>Hướng dẫn học</option>
            </select>
          </label>
        </div>
        <label>
          <span className="text-sm font-semibold">Tóm tắt</span>
          <textarea
            className="input-field mt-1"
            onChange={(e) => setForm({ ...form, excerpt: e.target.value })}
            required
            value={form.excerpt}
          />
        </label>
        <label>
          <span className="text-sm font-semibold">Nội dung Markdown</span>
          <textarea
            className="input-field mt-1 min-h-56"
            onChange={(e) => setForm({ ...form, bodyMarkdown: e.target.value })}
            required
            value={form.bodyMarkdown}
          />
        </label>
        <div className="grid gap-4 md:grid-cols-3">
          <label>
            <span className="text-sm font-semibold">Cover key</span>
            <input
              className="input-field mt-1"
              onChange={(e) => setForm({ ...form, coverKey: e.target.value, coverImageUrl: '' })}
              value={form.coverKey}
            />
          </label>
          <label>
            <span className="text-sm font-semibold">Ảnh HTTPS</span>
            <input
              className="input-field mt-1"
              onChange={(e) => setForm({ ...form, coverImageUrl: e.target.value, coverKey: '' })}
              type="url"
              value={form.coverImageUrl}
            />
          </label>
          <label>
            <span className="text-sm font-semibold">Lịch xuất bản</span>
            <input
              className="input-field mt-1"
              onChange={(e) =>
                setForm({ ...form, publishedAt: e.target.value, publishedAtDirty: true })
              }
              type="datetime-local"
              value={form.publishedAt}
            />
          </label>
        </div>
        <label className="flex items-center gap-2">
          <input
            checked={form.featured}
            onChange={(e) => setForm({ ...form, featured: e.target.checked })}
            type="checkbox"
          />{' '}
          Bài viết nổi bật
        </label>
        {form.bodyMarkdown ? (
          <div className="rounded-xl bg-slate-50 p-4">
            <SafeMarkdown markdown={form.bodyMarkdown} />
          </div>
        ) : null}
        <div className="flex gap-2">
          <button className="btn-primary">{form.id ? 'Lưu thay đổi' : 'Tạo bản nháp'}</button>
          {form.id ? (
            <button className="btn-secondary" onClick={() => setForm(emptyForm)} type="button">
              Hủy chỉnh sửa
            </button>
          ) : null}
        </div>
        {message ? (
          <p className="text-emerald-700" role="status">
            {message}
          </p>
        ) : null}
      </form>
      {state === 'loading' ? (
        <p className="mt-6" role="status">
          Đang tải nội dung…
        </p>
      ) : state === 'error' ? (
        <div className="state-error mt-6" role="alert">
          Không thể tải nội dung.{' '}
          <button className="btn-secondary ml-3" onClick={() => void load()}>
            Thử lại
          </button>
        </div>
      ) : items.length === 0 ? (
        <div className="state-empty mt-6">Chưa có nội dung.</div>
      ) : (
        <div className="mt-6 space-y-3">
          {items.map((item) => (
            <article className="rounded-2xl border bg-white p-5" key={item.id}>
              <div className="flex flex-wrap justify-between gap-3">
                <div>
                  <strong>{item.title}</strong>
                  <p>
                    {item.category} ·{' '}
                    {item.status === 'PUBLISHED'
                      ? 'Đã xuất bản'
                      : item.status === 'ARCHIVED'
                        ? 'Đã lưu trữ'
                        : 'Bản nháp'}
                    {item.publishedAt
                      ? ` · ${new Date(item.publishedAt).toLocaleString('vi-VN')}`
                      : ''}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button className="btn-secondary" onClick={() => void edit(item.id)}>
                    Chỉnh sửa
                  </button>
                  {item.status !== 'PUBLISHED' ? (
                    <button
                      className="btn-primary"
                      onClick={() => void publicContentApi.publish(item.id).then(load)}
                    >
                      Xuất bản
                    </button>
                  ) : null}
                  {item.status !== 'ARCHIVED' ? (
                    <button
                      className="btn-secondary"
                      onClick={() => void publicContentApi.archive(item.id).then(load)}
                    >
                      Lưu trữ
                    </button>
                  ) : null}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
