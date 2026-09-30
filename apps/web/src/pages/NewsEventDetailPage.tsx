import { ArrowLeft, CalendarDays } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { findNewsEvent } from '@/content/news-events';

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
  return (
    <article className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
      <Link
        className="inline-flex items-center gap-2 text-sm font-semibold text-indigo-700"
        to="/news-events"
      >
        <ArrowLeft size={16} />
        Tin tức & Sự kiện
      </Link>
      <p className="mt-8 flex items-center gap-2 text-sm font-medium text-indigo-700">
        <CalendarDays size={16} />
        {item.category} · {new Date(item.publishedAt).toLocaleDateString('vi-VN')}
      </p>
      <h1 className="mt-3 text-4xl font-bold tracking-tight">{item.title}</h1>
      <p className="mt-5 text-lg leading-8 text-slate-600">{item.excerpt}</p>
      <div className={`visual-${item.coverKey} mt-8 h-64 rounded-3xl`} />
      <div className="mt-8 space-y-5 text-base leading-8 text-slate-700">
        {item.body.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>
    </article>
  );
}
