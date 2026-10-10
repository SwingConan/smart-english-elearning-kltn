import { ArrowLeft, ArrowRight, CalendarDays, Check, Clock3 } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { newsCoverUrl } from '@/content/news-assets';
import { findNewsEvent, newsEvents } from '@/content/news-events';

export function NewsEventDetailPage() {
  const { slug = '' } = useParams();
  const item = findNewsEvent(slug);
  if (!item)
    return (
      <section className="mx-auto max-w-3xl px-4 py-20 text-center">
        <h1 className="text-3xl font-bold">Không tìm thấy bài viết</h1>
        <p className="mt-3 text-slate-600">
          Nội dung có thể đã được cập nhật hoặc đường dẫn không chính xác.
        </p>
        <Link className="btn-primary mt-6" to="/news-events">
          Xem tất cả tin tức
        </Link>
      </section>
    );

  const related = newsEvents
    .filter((candidate) => candidate.slug !== item.slug)
    .sort((a, b) => Number(b.category === item.category) - Number(a.category === item.category))
    .slice(0, 3);

  return (
    <main>
      <article>
        <header className="border-b bg-slate-50">
          <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:py-16">
            <Link
              className="inline-flex items-center gap-2 text-sm font-semibold text-indigo-700"
              to="/news-events"
            >
              <ArrowLeft size={16} /> Tin tức & Sự kiện
            </Link>
            <p className="mt-8 text-sm font-semibold text-indigo-700">{item.category}</p>
            <h1 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">{item.title}</h1>
            <p className="mt-5 text-lg leading-8 text-slate-600">{item.excerpt}</p>
            <div className="mt-6 flex flex-wrap gap-5 text-sm font-medium text-slate-500">
              <span className="inline-flex items-center gap-2">
                <CalendarDays size={17} />
                {new Date(item.publishedAt).toLocaleDateString('vi-VN')}
              </span>
              <span className="inline-flex items-center gap-2">
                <Clock3 size={17} />
                {item.readMinutes} phút đọc
              </span>
            </div>
          </div>
        </header>
        <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
          <img
            alt=""
            className="aspect-[16/10] w-full rounded-3xl object-cover shadow-sm"
            src={newsCoverUrl(item)}
          />
          <div className="mx-auto mt-12 max-w-3xl space-y-12">
            {item.sections.map((section) => (
              <section key={section.heading}>
                <h2 className="text-2xl font-bold tracking-tight">{section.heading}</h2>
                {section.paragraphs?.map((paragraph) => (
                  <p className="mt-4 text-base leading-8 text-slate-700" key={paragraph}>
                    {paragraph}
                  </p>
                ))}
                {section.bullets && (
                  <ul className="mt-5 space-y-3">
                    {section.bullets.map((bullet) => (
                      <li className="flex gap-3 leading-7 text-slate-700" key={bullet}>
                        <Check className="mt-1 shrink-0 text-indigo-600" size={19} />
                        {bullet}
                      </li>
                    ))}
                  </ul>
                )}
                {section.steps && (
                  <ol className="mt-5 space-y-4">
                    {section.steps.map((step, index) => (
                      <li className="flex gap-4 leading-7 text-slate-700" key={step}>
                        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-700">
                          {index + 1}
                        </span>
                        {step}
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            ))}
          </div>
          <div className="mx-auto mt-12 max-w-3xl rounded-3xl bg-indigo-950 px-6 py-8 text-white sm:px-8">
            <h2 className="text-2xl font-bold">Biến thông tin thành bước học tiếp theo</h2>
            <p className="mt-3 leading-7 text-indigo-100">
              Khám phá khóa học đang mở hoặc xem hướng dẫn để hiểu quy trình học trên nền tảng.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link className="btn-primary !bg-white !text-indigo-800" to="/catalog">
                Xem khóa học
              </Link>
              <Link
                className="btn-secondary !border-white/30 !bg-transparent !text-white"
                to="/guide"
              >
                Xem hướng dẫn
              </Link>
            </div>
          </div>
        </div>
      </article>

      <section className="border-t bg-slate-50">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="eyebrow">Đọc tiếp</p>
              <h2 className="mt-2 text-3xl font-bold">Bài viết liên quan</h2>
            </div>
            <Link
              className="hidden items-center gap-2 font-semibold text-indigo-700 sm:inline-flex"
              to="/news-events"
            >
              Xem tất cả <ArrowRight size={18} />
            </Link>
          </div>
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            {related.map((candidate) => (
              <Link
                className="card-interactive overflow-hidden rounded-2xl border bg-white"
                key={candidate.slug}
                to={`/news-events/${candidate.slug}`}
              >
                <img
                  alt=""
                  className="aspect-[16/9] w-full object-cover"
                  loading="lazy"
                  src={newsCoverUrl(candidate)}
                />
                <div className="p-5">
                  <p className="text-sm font-semibold text-indigo-700">{candidate.category}</p>
                  <h3 className="mt-2 font-bold leading-snug">{candidate.title}</h3>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
