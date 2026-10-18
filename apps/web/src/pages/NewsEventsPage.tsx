import { ArrowRight, CalendarDays, Clock3, Search, X } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { newsCoverUrl } from '@/content/news-assets';
import { newsCategories, newsEvents } from '@/content/news-events';

export function NewsEventsPage() {
  const [category, setCategory] = useState<(typeof newsCategories)[number]>('Tất cả');
  const [query, setQuery] = useState('');
  const featured = newsEvents.find((item) => item.featured) ?? newsEvents[0];
  const normalizedQuery = query.trim().toLocaleLowerCase('vi');
  const filtered = newsEvents.filter(
    (item) =>
      (category === 'Tất cả' || item.category === category) &&
      (!normalizedQuery ||
        `${item.title} ${item.excerpt}`.toLocaleLowerCase('vi').includes(normalizedQuery)),
  );

  const resetFilters = () => {
    setCategory('Tất cả');
    setQuery('');
  };

  return (
    <main>
      <section className="border-b bg-gradient-to-br from-slate-950 via-indigo-950 to-indigo-800 text-white">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1.05fr_.95fr] lg:items-center lg:px-8 lg:py-20">
          <div>
            <p className="eyebrow !text-indigo-200">Góc học tập</p>
            <h1 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">
              Tin tức & Sự kiện
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-indigo-100">
              Bài viết thực hành về kỹ năng TOEIC, cách học trên nền tảng và thông tin lớp học đang
              mở.
            </p>
            <Link
              className="mt-7 inline-flex items-center gap-2 font-semibold text-white"
              to={`/news-events/${featured.slug}`}
            >
              Đọc bài nổi bật <ArrowRight size={18} />
            </Link>
          </div>
          <Link
            className="group overflow-hidden rounded-3xl border border-white/15 bg-white/10 shadow-2xl"
            to={`/news-events/${featured.slug}`}
          >
            <img
              alt="Lớp học tiếng Anh đang chuẩn bị cho kỳ khai giảng"
              className="aspect-[16/9] w-full object-cover transition duration-500 group-hover:scale-[1.025]"
              src={newsCoverUrl(featured)}
            />
            <div className="p-5">
              <p className="text-sm font-semibold text-indigo-200">
                Bài viết nổi bật · {featured.readMinutes} phút đọc
              </p>
              <h2 className="mt-2 text-xl font-bold leading-snug">{featured.title}</h2>
            </div>
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="eyebrow">Thư viện nội dung</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight">
              Tìm nội dung phù hợp với mục tiêu của bạn
            </h2>
          </div>
          <label className="relative block w-full lg:max-w-sm">
            <span className="sr-only">Tìm bài viết</span>
            <Search
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
              size={19}
            />
            <input
              className="input-field !pl-11"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Tìm theo chủ đề..."
              type="search"
              value={query}
            />
          </label>
        </div>

        <div aria-label="Lọc bài viết theo danh mục" className="mt-7 flex flex-wrap gap-2">
          {newsCategories.map((item) => (
            <button
              aria-pressed={category === item}
              className={`filter-chip ${category === item ? 'filter-chip-active' : ''}`}
              key={item}
              onClick={() => setCategory(item)}
              type="button"
            >
              {item}
            </button>
          ))}
        </div>

        <p aria-live="polite" className="mt-6 text-sm font-medium text-slate-500">
          {filtered.length} bài viết phù hợp
        </p>
        {filtered.length ? (
          <div className="mt-5 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {filtered.map((item) => (
              <article
                className="card-interactive group overflow-hidden rounded-2xl border bg-white shadow-sm"
                key={item.slug}
              >
                <Link to={`/news-events/${item.slug}`}>
                  <img
                    alt=""
                    className="aspect-[16/10] w-full object-cover transition duration-500 group-hover:scale-[1.025]"
                    decoding="async"
                    loading="lazy"
                    src={newsCoverUrl(item)}
                  />
                </Link>
                <div className="p-6">
                  <p className="text-sm font-semibold text-indigo-700">{item.category}</p>
                  <h3 className="mt-2 text-xl font-bold leading-snug">
                    <Link className="hover:text-indigo-700" to={`/news-events/${item.slug}`}>
                      {item.title}
                    </Link>
                  </h3>
                  <p className="mt-3 line-clamp-3 text-sm leading-6 text-slate-600">
                    {item.excerpt}
                  </p>
                  <div className="mt-5 flex items-center gap-4 text-xs font-medium text-slate-500">
                    <span className="inline-flex items-center gap-1.5">
                      <CalendarDays size={15} />
                      {new Date(item.publishedAt).toLocaleDateString('vi-VN')}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <Clock3 size={15} />
                      {item.readMinutes} phút
                    </span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="mt-8 rounded-3xl border border-dashed bg-slate-50 px-6 py-16 text-center">
            <Search className="mx-auto text-slate-400" size={32} />
            <h3 className="mt-4 text-xl font-bold">Chưa tìm thấy bài viết phù hợp</h3>
            <p className="mt-2 text-slate-600">
              Thử từ khóa khác hoặc xóa bộ lọc để xem toàn bộ nội dung.
            </p>
            <button className="btn-secondary mt-6" onClick={resetFilters} type="button">
              <X size={17} /> Xóa bộ lọc
            </button>
          </div>
        )}
      </section>
    </main>
  );
}
