import { CalendarDays } from 'lucide-react';
import { Link } from 'react-router';
import { newsEvents } from '@/content/news-events';
import { newsCoverUrl } from '@/content/news-assets';

export function NewsEventsPage() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
      <p className="eyebrow">Góc học tập</p>
      <h1 className="page-title">Tin tức & Sự kiện</h1>
      <p className="page-lead">
        Thông tin khai giảng, workshop và hướng dẫn học được biên soạn cho hành trình TOEIC trên nền
        tảng.
      </p>
      <div className="mt-10 grid gap-6 md:grid-cols-2">
        {newsEvents.map((item) => (
          <article
            className="overflow-hidden rounded-2xl border bg-white shadow-sm"
            key={item.slug}
          >
            <img
              alt=""
              className="aspect-[16/10] w-full object-cover transition duration-500 hover:scale-[1.02]"
              decoding="async"
              loading="lazy"
              src={newsCoverUrl(item)}
            />
            <div className="p-6">
              <p className="flex items-center gap-2 text-sm font-medium text-indigo-700">
                <CalendarDays size={16} />
                {item.category} · {new Date(item.publishedAt).toLocaleDateString('vi-VN')}
              </p>
              <h2 className="mt-3 text-xl font-bold">{item.title}</h2>
              <p className="mt-3 text-sm leading-6 text-slate-600">{item.excerpt}</p>
              <Link
                className="mt-5 inline-flex font-semibold text-indigo-700"
                to={`/news-events/${item.slug}`}
              >
                Đọc bài viết →
              </Link>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
