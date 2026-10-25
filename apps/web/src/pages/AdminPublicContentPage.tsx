import { FolderPlus, ImagePlus, Newspaper, Plus, X } from 'lucide-react';
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { RichContentEditor } from '@/components/ui/RichContentEditor';
import { SafeRichHtml } from '@/components/ui/SafeRichHtml';
import { SafeMarkdown } from '@/components/ui/SafeMarkdown';
import { PageHeader, SectionHeader, StatusBadge } from '@/components/ui/ProductPrimitives';
import type {
  PublicContent,
  PublicContentAsset,
  PublicContentCategory,
  PublicContentCoverKey,
} from '@/features/public-content/api';
import { PUBLIC_CONTENT_COVER_OPTIONS, publicContentApi } from '@/features/public-content/api';
import { datetimeLocalToIso, isoToDatetimeLocal } from '@/features/public-content/datetime';

const emptyForm = {
  id: '',
  slug: '',
  categoryId: '',
  title: '',
  excerpt: '',
  contentFormat: 'RICH_HTML' as 'RICH_HTML' | 'MARKDOWN',
  bodyHtml: '<p></p>',
  bodyMarkdown: '',
  featured: false,
  coverKey: '',
  coverAssetId: '',
  publishedAt: '',
  publishedAtDirty: false,
};

export function AdminPublicContentPage() {
  const [items, setItems] = useState<PublicContent[]>([]);
  const [categories, setCategories] = useState<PublicContentCategory[]>([]);
  const [assets, setAssets] = useState<PublicContentAsset[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [tab, setTab] = useState<'content' | 'categories' | 'media'>('content');
  const [preview, setPreview] = useState(false);
  const [message, setMessage] = useState('');
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const uploadRef = useRef<HTMLInputElement>(null);
  const load = useCallback(async () => {
    try {
      const [content, categoryRows, media] = await Promise.all([
        publicContentApi.admin(),
        publicContentApi.adminCategories(),
        publicContentApi.assets(),
      ]);
      setItems(Array.isArray(content) ? content : content.data);
      setCategories(categoryRows);
      setAssets(media);
      setForm((current) => ({
        ...current,
        categoryId: current.categoryId || categoryRows.find((item) => item.isActive)?.id || '',
      }));
      setState('ready');
    } catch {
      setState('error');
    }
  }, []);
  useEffect(() => {
    void Promise.resolve().then(() => load());
  }, [load]);
  const save = async (event: FormEvent) => {
    event.preventDefault();
    const input = {
      slug: form.slug,
      categoryId: form.categoryId,
      title: form.title,
      excerpt: form.excerpt,
      contentFormat: form.contentFormat,
      bodyHtml: form.contentFormat === 'RICH_HTML' ? form.bodyHtml : null,
      bodyMarkdown: form.contentFormat === 'MARKDOWN' ? form.bodyMarkdown : null,
      featured: form.featured,
      coverKey: (form.coverKey || null) as PublicContentCoverKey | null,
      coverAssetId: form.coverAssetId || null,
      ...(!form.id || form.publishedAtDirty
        ? { publishedAt: datetimeLocalToIso(form.publishedAt) }
        : {}),
    } as const;
    if (form.id) await publicContentApi.update(form.id, input);
    else await publicContentApi.create(input);
    setMessage(form.id ? 'Đã lưu thay đổi.' : 'Đã tạo bản nháp.');
    setForm({ ...emptyForm, categoryId: categories.find((item) => item.isActive)?.id ?? '' });
    await load();
  };
  const edit = async (id: string) => {
    const item = await publicContentApi.adminDetail(id);
    setForm({
      id: item.id,
      slug: item.slug,
      categoryId:
        item.categoryId ??
        (typeof item.category === 'string'
          ? (categories.find((row) => row.name === item.category)?.id ?? '')
          : item.category.id),
      title: item.title,
      excerpt: item.excerpt,
      contentFormat: item.contentFormat ?? 'MARKDOWN',
      bodyHtml: item.bodyHtml ?? '<p></p>',
      bodyMarkdown: item.bodyMarkdown ?? '',
      featured: item.featured,
      coverKey: item.coverKey ?? '',
      coverAssetId: item.coverAssetId ?? '',
      publishedAt: item.publishedAt ? isoToDatetimeLocal(item.publishedAt) : '',
      publishedAtDirty: false,
    });
    setTab('content');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const upload = async (file?: File) => {
    if (!file) return null;
    try {
      const asset = await publicContentApi.uploadAsset(file);
      setAssets((current) => [asset, ...current]);
      setMessage('Ảnh đã được tải lên kho nội dung.');
      return asset.url;
    } catch {
      setMessage('Ảnh không hợp lệ. Chỉ nhận JPEG, PNG, WebP đúng chữ ký và tối đa 8 MB.');
      return null;
    } finally {
      if (uploadRef.current) uploadRef.current.value = '';
    }
  };
  const selectEditorImage = async () => {
    if (assets[0] && window.confirm('Chèn ảnh mới nhất trong thư viện? Chọn Hủy để tải ảnh mới.'))
      return assets[0].url;
    uploadRef.current?.click();
    return null;
  };
  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="Quản trị nội dung"
        title="Public Content CMS"
        description="Soạn nội dung phong phú, quản lý danh mục và ảnh trong cùng một quy trình an toàn."
      />
      <nav className="flex gap-2 border-b" aria-label="Khu vực CMS">
        {(
          [
            ['content', Newspaper, 'Bài viết'],
            ['categories', FolderPlus, 'Danh mục'],
            ['media', ImagePlus, 'Thư viện ảnh'],
          ] as const
        ).map(([value, Icon, label]) => (
          <button
            className={`flex items-center gap-2 border-b-2 px-4 py-3 font-bold ${tab === value ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500'}`}
            key={value}
            onClick={() => setTab(value)}
          >
            <Icon size={18} />
            {label}
          </button>
        ))}
      </nav>
      <input
        ref={uploadRef}
        className="sr-only"
        accept="image/jpeg,image/png,image/webp"
        onChange={(event) => void upload(event.target.files?.[0])}
        type="file"
      />
      {message ? (
        <p className="rounded-xl bg-sky-50 p-3 font-semibold text-sky-800" role="status">
          {message}
        </p>
      ) : null}
      {state === 'error' ? (
        <div className="state-error">
          Không thể tải CMS.{' '}
          <button className="underline" onClick={() => void load()}>
            Thử lại
          </button>
        </div>
      ) : null}
      {tab === 'content' ? (
        <>
          <form
            className="grid gap-6 rounded-3xl border bg-white p-6 shadow-sm"
            onSubmit={(event) => void save(event)}
          >
            <SectionHeader
              title={form.id ? 'Chỉnh sửa bài viết' : 'Tạo bản nháp'}
              actions={
                <button
                  className="btn-secondary"
                  onClick={() => setPreview((value) => !value)}
                  type="button"
                >
                  {preview ? 'Quay lại soạn thảo' : 'Xem trước'}
                </button>
              }
            />
            {preview ? (
              <article className="mx-auto w-full max-w-3xl">
                <p className="text-sm font-bold text-indigo-700">
                  {categories.find((item) => item.id === form.categoryId)?.name}
                </p>
                <h2 className="mt-2 text-4xl font-black">{form.title || 'Tiêu đề bài viết'}</h2>
                <p className="mt-3 text-lg text-slate-600">{form.excerpt}</p>
                <div className="mt-8">
                  {form.contentFormat === 'RICH_HTML' ? (
                    <SafeRichHtml html={form.bodyHtml} />
                  ) : (
                    <SafeMarkdown markdown={form.bodyMarkdown} />
                  )}
                </div>
              </article>
            ) : (
              <>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="font-semibold md:col-span-2">
                    Tiêu đề
                    <input
                      className="input-field mt-1"
                      minLength={3}
                      onChange={(event) => setForm({ ...form, title: event.target.value })}
                      required
                      value={form.title}
                    />
                  </label>
                  <label className="font-semibold">
                    Đường dẫn
                    <input
                      className="input-field mt-1"
                      onChange={(event) => setForm({ ...form, slug: event.target.value })}
                      required
                      value={form.slug}
                    />
                  </label>
                  <label className="font-semibold">
                    Danh mục
                    <select
                      className="input-field mt-1"
                      onChange={(event) => setForm({ ...form, categoryId: event.target.value })}
                      required
                      value={form.categoryId}
                    >
                      {categories
                        .filter((item) => item.isActive || item.id === form.categoryId)
                        .map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                          </option>
                        ))}
                    </select>
                  </label>
                </div>
                <label className="font-semibold">
                  Tóm tắt
                  <textarea
                    className="input-field mt-1"
                    minLength={10}
                    onChange={(event) => setForm({ ...form, excerpt: event.target.value })}
                    required
                    value={form.excerpt}
                  />
                </label>
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="font-semibold">Nội dung</span>
                    <select
                      className="rounded-lg border px-3 py-1 text-sm"
                      onChange={(event) =>
                        setForm({
                          ...form,
                          contentFormat: event.target.value as 'RICH_HTML' | 'MARKDOWN',
                        })
                      }
                      value={form.contentFormat}
                    >
                      <option value="RICH_HTML">Rich text</option>
                      <option value="MARKDOWN">Markdown cũ</option>
                    </select>
                  </div>
                  {form.contentFormat === 'RICH_HTML' ? (
                    <RichContentEditor
                      onChange={(bodyHtml) => setForm((current) => ({ ...current, bodyHtml }))}
                      onInsertImage={selectEditorImage}
                      value={form.bodyHtml}
                    />
                  ) : (
                    <textarea
                      className="input-field min-h-72"
                      onChange={(event) => setForm({ ...form, bodyMarkdown: event.target.value })}
                      value={form.bodyMarkdown}
                    />
                  )}
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                  <label className="font-semibold">
                    Ảnh bìa đã tải
                    <select
                      className="input-field mt-1"
                      onChange={(event) =>
                        setForm({ ...form, coverAssetId: event.target.value, coverKey: '' })
                      }
                      value={form.coverAssetId}
                    >
                      <option value="">Không chọn</option>
                      {assets.map((asset) => (
                        <option key={asset.id} value={asset.id}>
                          {asset.originalName}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="font-semibold">
                    Ảnh minh họa có sẵn
                    <select
                      className="input-field mt-1"
                      onChange={(event) =>
                        setForm({ ...form, coverKey: event.target.value, coverAssetId: '' })
                      }
                      value={form.coverKey}
                    >
                      <option value="">Không chọn</option>
                      {PUBLIC_CONTENT_COVER_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="font-semibold">
                    Lịch xuất bản
                    <input
                      className="input-field mt-1"
                      onChange={(event) =>
                        setForm({
                          ...form,
                          publishedAt: event.target.value,
                          publishedAtDirty: true,
                        })
                      }
                      type="datetime-local"
                      value={form.publishedAt}
                    />
                  </label>
                </div>
                <label className="flex items-center gap-2 font-semibold">
                  <input
                    checked={form.featured}
                    onChange={(event) => setForm({ ...form, featured: event.target.checked })}
                    type="checkbox"
                  />
                  Bài viết nổi bật
                </label>
              </>
            )}
            <div className="flex gap-2">
              <button className="btn-primary">
                <Plus size={17} />
                {form.id ? 'Lưu thay đổi' : 'Tạo bản nháp'}
              </button>
              {form.id ? (
                <button
                  className="btn-secondary"
                  onClick={() => setForm({ ...emptyForm, categoryId: categories[0]?.id ?? '' })}
                  type="button"
                >
                  <X size={17} />
                  Hủy
                </button>
              ) : null}
            </div>
          </form>
          <div className="space-y-3">
            {items.map((item) => (
              <article
                className="flex flex-col gap-3 rounded-2xl border bg-white p-5 sm:flex-row sm:items-center"
                key={item.id}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <strong>{item.title}</strong>
                    <StatusBadge
                      tone={
                        item.status === 'PUBLISHED'
                          ? 'success'
                          : item.status === 'ARCHIVED'
                            ? 'neutral'
                            : 'warning'
                      }
                    >
                      {item.status === 'PUBLISHED'
                        ? 'Đã xuất bản'
                        : item.status === 'ARCHIVED'
                          ? 'Đã lưu trữ'
                          : 'Bản nháp'}
                    </StatusBadge>
                  </div>
                  <p className="mt-1 text-sm text-slate-500">
                    {typeof item.category === 'string' ? item.category : item.category.name} ·{' '}
                    {item.contentFormat === 'RICH_HTML' ? 'Rich text' : 'Markdown'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
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
              </article>
            ))}
          </div>
        </>
      ) : null}
      {tab === 'categories' ? <CategoryManager categories={categories} reload={load} /> : null}
      {tab === 'media' ? (
        <div className="space-y-5">
          <SectionHeader
            title="Thư viện ảnh"
            description="Ảnh được xác minh chữ ký tệp và chỉ có thể xóa khi không được bài viết sử dụng."
            actions={
              <button className="btn-primary" onClick={() => uploadRef.current?.click()}>
                <ImagePlus size={17} />
                Tải ảnh
              </button>
            }
          />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {assets.map((asset) => (
              <figure className="overflow-hidden rounded-2xl border bg-white" key={asset.id}>
                <img
                  alt={asset.originalName}
                  className="aspect-video w-full object-cover"
                  src={asset.url}
                />
                <figcaption className="p-3">
                  <p className="truncate text-sm font-bold">{asset.originalName}</p>
                  <p className="text-xs text-slate-500">{Math.ceil(asset.sizeBytes / 1024)} KB</p>
                  <button
                    className="mt-2 text-xs font-bold text-rose-700"
                    onClick={() => void publicContentApi.removeAsset(asset.id).then(load)}
                  >
                    Xóa nếu chưa dùng
                  </button>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function CategoryManager({
  categories,
  reload,
}: {
  categories: PublicContentCategory[];
  reload: () => Promise<void>;
}) {
  const [form, setForm] = useState({ name: '', slug: '', description: '' });
  const create = async (event: FormEvent) => {
    event.preventDefault();
    await publicContentApi.createCategory(form);
    setForm({ name: '', slug: '', description: '' });
    await reload();
  };
  return (
    <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
      <form
        className="space-y-4 rounded-3xl border bg-white p-5"
        onSubmit={(event) => void create(event)}
      >
        <SectionHeader title="Danh mục mới" />
        <label className="block font-semibold">
          Tên
          <input
            className="input-field mt-1"
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            required
            value={form.name}
          />
        </label>
        <label className="block font-semibold">
          Slug
          <input
            className="input-field mt-1"
            onChange={(event) => setForm({ ...form, slug: event.target.value })}
            required
            value={form.slug}
          />
        </label>
        <label className="block font-semibold">
          Mô tả
          <textarea
            className="input-field mt-1"
            onChange={(event) => setForm({ ...form, description: event.target.value })}
            value={form.description}
          />
        </label>
        <button className="btn-primary">Tạo danh mục</button>
      </form>
      <div className="space-y-3">
        {categories.map((item) => (
          <article
            className="flex items-center gap-4 rounded-2xl border bg-white p-4"
            key={item.id}
          >
            <div className="flex-1">
              <strong>{item.name}</strong>
              <p className="text-sm text-slate-500">
                /{item.slug} · {item._count?.content ?? 0} bài viết
              </p>
            </div>
            <StatusBadge tone={item.isActive ? 'success' : 'neutral'}>
              {item.isActive ? 'Đang dùng' : 'Ngừng dùng'}
            </StatusBadge>
            {item.isActive ? (
              <button
                className="text-sm font-bold text-rose-700"
                onClick={() => void publicContentApi.removeCategory(item.id).then(reload)}
              >
                Ngừng dùng
              </button>
            ) : null}
          </article>
        ))}
      </div>
    </div>
  );
}
