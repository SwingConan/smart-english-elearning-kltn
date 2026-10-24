import { FormEvent, useCallback, useEffect, useState } from 'react';
import { PublicContent, publicContentApi } from '@/features/public-content/api';
import { SafeMarkdown } from '@/components/ui/SafeMarkdown';

export function AdminPublicContentPage() {
  const [items, setItems] = useState<PublicContent[]>([]);
  const [form, setForm] = useState({
    slug: '',
    category: 'Cập nhật chương trình',
    title: '',
    excerpt: '',
    bodyMarkdown: '',
    featured: false,
  });
  const load = useCallback(() => publicContentApi.admin().then(setItems), []);
  useEffect(() => {
    void load();
  }, [load]);
  const create = async (e: FormEvent) => {
    e.preventDefault();
    await publicContentApi.create(form);
    setForm({ ...form, slug: '', title: '', excerpt: '', bodyMarkdown: '' });
    await load();
  };
  return (
    <section>
      <h1 className="text-3xl font-black">Nội dung công khai</h1>
      <form
        className="mt-6 grid gap-3 rounded-2xl border bg-white p-6"
        onSubmit={(e) => void create(e)}
      >
        <input
          className="rounded-xl border p-3"
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          placeholder="Tiêu đề"
          required
          value={form.title}
        />
        <input
          className="rounded-xl border p-3"
          onChange={(e) => setForm({ ...form, slug: e.target.value })}
          placeholder="slug-bai-viet"
          required
          value={form.slug}
        />
        <select
          className="rounded-xl border p-3"
          onChange={(e) => setForm({ ...form, category: e.target.value })}
          value={form.category}
        >
          <option>Cập nhật chương trình</option>
          <option>Lịch khai giảng</option>
          <option>Workshop</option>
          <option>Kỹ năng TOEIC</option>
          <option>Hướng dẫn học</option>
        </select>
        <textarea
          className="rounded-xl border p-3"
          onChange={(e) => setForm({ ...form, excerpt: e.target.value })}
          placeholder="Tóm tắt"
          required
          value={form.excerpt}
        />
        <textarea
          className="min-h-40 rounded-xl border p-3"
          onChange={(e) => setForm({ ...form, bodyMarkdown: e.target.value })}
          placeholder="Nội dung Markdown"
          required
          value={form.bodyMarkdown}
        />
        {form.bodyMarkdown ? (
          <div className="rounded-xl bg-slate-50 p-4">
            <SafeMarkdown markdown={form.bodyMarkdown} />
          </div>
        ) : null}
        <button className="btn-primary">Tạo bản nháp</button>
      </form>
      <div className="mt-6 space-y-3">
        {items.map((item) => (
          <article className="rounded-2xl border bg-white p-5" key={item.id}>
            <div className="flex justify-between">
              <div>
                <strong>{item.title}</strong>
                <p>
                  {item.category} · {item.status}
                </p>
              </div>
              <div className="flex gap-2">
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
    </section>
  );
}
