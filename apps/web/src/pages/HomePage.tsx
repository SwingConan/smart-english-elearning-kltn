import { useEffect, useState } from 'react';
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  CheckCircle2,
  Headphones,
  MessageSquareText,
  Route,
  Search,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { Link } from 'react-router';
import { newsEvents } from '@/content/news-events';
import { catalogApi } from '@/features/catalog/api';
import { CourseCard } from '@/features/catalog/CourseCard';
import type { PublicCourse } from '@/features/catalog/types';

export function HomePage() {
  const [courses, setCourses] = useState<PublicCourse[]>([]);
  const [courseState, setCourseState] = useState<'loading' | 'ready' | 'error'>('loading');
  useEffect(() => {
    const controller = new AbortController();
    void catalogApi
      .list({ page: 1, limit: 3 }, controller.signal)
      .then((response) => {
        setCourses(response.data);
        setCourseState('ready');
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError'))
          setCourseState('error');
      });
    return () => controller.abort();
  }, []);

  return (
    <>
      <section className="hero-grid overflow-hidden bg-indigo-950 text-white">
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[1.15fr_.85fr] lg:px-8 lg:py-28">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[.22em] text-indigo-200">
              TOEIC learning, organized
            </p>
            <h1 className="mt-5 max-w-3xl text-4xl font-bold tracking-tight sm:text-6xl">
              Xác định hướng đi. Chọn đúng lớp. Học với tiến độ rõ ràng.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-indigo-100">
              Khám phá chương trình TOEIC theo kỹ năng, so sánh lớp học thực tế và tiếp tục hành
              trình trong một không gian học tập tập trung.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link className="btn-light" to="/catalog">
                Khám phá khóa học <ArrowRight size={18} />
              </Link>
              <Link className="btn-ghost-light" to="/guide#placement">
                Tìm hiểu kiểm tra đầu vào
              </Link>
            </div>
          </div>
          <div className="relative min-h-80 rounded-[2rem] border border-white/15 bg-white/10 p-7 backdrop-blur">
            <div className="absolute inset-7 rounded-3xl bg-gradient-to-br from-sky-400/30 via-indigo-300/10 to-emerald-300/20" />
            <div className="relative grid h-full content-between gap-8">
              <Sparkles className="text-amber-300" size={42} />
              <div className="space-y-3">
                {[
                  'Khóa học phù hợp mục tiêu',
                  'Lớp học có lịch và trạng thái rõ ràng',
                  'Bài học · Bài kiểm tra · Tiến độ',
                ].map((text, index) => (
                  <div className="flex items-center gap-3 rounded-xl bg-white/10 p-4" key={text}>
                    <span className="grid size-8 place-items-center rounded-full bg-white text-sm font-bold text-indigo-800">
                      {index + 1}
                    </span>
                    <span>{text}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section-shell">
        <div className="text-center">
          <p className="eyebrow">Bắt đầu theo nhu cầu</p>
          <h2 className="section-title">Bạn muốn bắt đầu từ đâu?</h2>
        </div>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          <JourneyCard
            icon={Sparkles}
            title="Đã biết mục tiêu"
            text="Lọc chương trình theo kỹ năng và trình độ mong muốn."
            to="/catalog"
          />
          <JourneyCard
            icon={Search}
            title="Chưa biết trình độ"
            text="Tính năng kiểm tra đầu vào đang được chuẩn bị để hỗ trợ xác định trình độ và gợi ý lớp phù hợp."
            to="/guide#placement"
          />
          <JourneyCard
            icon={BookOpen}
            title="Đã có lớp học"
            text="Đăng nhập để tiếp tục bài học, bài kiểm tra và theo dõi tiến độ."
            to="/student/enrollments"
          />
        </div>
      </section>

      <section className="section-shell pt-0">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow">Chương trình đang mở</p>
            <h2 className="section-title">Khóa học nổi bật</h2>
          </div>
          <Link className="font-semibold text-indigo-700" to="/catalog">
            Xem tất cả →
          </Link>
        </div>
        {courseState === 'loading' ? (
          <div className="mt-8 grid gap-6 md:grid-cols-3" role="status">
            {[1, 2, 3].map((item) => (
              <div className="h-80 animate-pulse rounded-2xl bg-slate-200" key={item} />
            ))}
          </div>
        ) : courseState === 'error' ? (
          <p className="state-error mt-8">
            Chưa thể tải khóa học. Bạn có thể mở danh mục khóa học để thử lại.
          </p>
        ) : courses.length === 0 ? (
          <p className="state-empty mt-8">Chưa có khóa học được công bố.</p>
        ) : (
          <div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {courses.map((course) => (
              <CourseCard course={course} key={course.id} />
            ))}
          </div>
        )}
      </section>

      <section className="bg-indigo-50">
        <div className="section-shell grid items-center gap-10 lg:grid-cols-2">
          <div className="visual-indigo min-h-80 rounded-3xl p-8">
            <Route className="text-white" size={54} />
          </div>
          <div>
            <p className="eyebrow">Kiểm tra đầu vào</p>
            <h2 className="section-title">Hiểu điểm xuất phát trước khi chọn lộ trình</h2>
            <p className="mt-4 leading-7 text-slate-600">
              Tính năng kiểm tra đầu vào đang được chuẩn bị để hỗ trợ người học xác định trình độ và
              nhận gợi ý lớp phù hợp.
            </p>
            <Link className="btn-primary mt-6" to="/guide#placement">
              Tìm hiểu kiểm tra đầu vào
            </Link>
          </div>
        </div>
      </section>

      <section className="section-shell">
        <div className="text-center">
          <p className="eyebrow">Một flow liên tục</p>
          <h2 className="section-title">Học như thế nào trên hệ thống?</h2>
        </div>
        <div className="mt-10 grid gap-5 md:grid-cols-4">
          {[
            ['01', 'Đặt mục tiêu'],
            ['02', 'Chọn khóa học và lớp'],
            ['03', 'Học và làm bài'],
            ['04', 'Theo dõi tiến độ'],
          ].map(([number, title]) => (
            <article className="card" key={number}>
              <span className="text-sm font-bold text-indigo-600">{number}</span>
              <h3 className="mt-3 font-bold">{title}</h3>
            </article>
          ))}
        </div>
      </section>

      <section className="bg-slate-950 text-white">
        <div className="section-shell">
          <p className="eyebrow text-sky-300">TOEIC domains</p>
          <h2 className="section-title">Phát triển theo từng kỹ năng</h2>
          <p className="mt-4 max-w-3xl text-slate-300">
            Nền tảng hỗ trợ Listening, Reading, Speaking và Writing. Mỗi khóa học thể hiện rõ các kỹ
            năng được giảng dạy.
          </p>
          <div className="mt-9 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              [Headphones, 'Listening'],
              [BookOpen, 'Reading'],
              [MessageSquareText, 'Speaking'],
              [Sparkles, 'Writing'],
            ].map(([Icon, label]) => (
              <div
                className="rounded-2xl border border-white/10 bg-white/5 p-5"
                key={String(label)}
              >
                <Icon className="text-sky-300" />
                <h3 className="mt-4 font-semibold">{String(label)}</h3>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section-shell">
        <div className="text-center">
          <p className="eyebrow">Năng lực thật</p>
          <h2 className="section-title">Vì sao chọn nền tảng này?</h2>
        </div>
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          <ValueCard
            icon={ShieldCheck}
            title="Trạng thái minh bạch"
            text="Thông tin miễn phí, có phí, số chỗ còn lại và trạng thái đăng ký được trình bày rõ ràng."
          />
          <ValueCard
            icon={BarChart3}
            title="Tiến độ từ dữ liệu thật"
            text="Tiến độ bài học và kết quả kiểm tra được tổng hợp theo từng học phần."
          />
          <ValueCard
            icon={CheckCircle2}
            title="Một không gian lớp học"
            text="Tổng quan, bài học, bài kiểm tra, kết quả và tiến độ cùng nằm trong một không gian học tập."
          />
        </div>
      </section>

      <section className="section-shell pt-0">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="eyebrow">Cập nhật mới</p>
            <h2 className="section-title">Tin tức & Sự kiện</h2>
          </div>
          <Link className="font-semibold text-indigo-700" to="/news-events">
            Xem tất cả →
          </Link>
        </div>
        <div className="mt-8 grid gap-6 md:grid-cols-3">
          {newsEvents.slice(0, 3).map((item) => (
            <article className="overflow-hidden rounded-2xl border bg-white" key={item.slug}>
              <div className={`visual-${item.coverKey} h-36`} />
              <div className="p-5">
                <p className="text-xs font-bold uppercase tracking-wide text-indigo-700">
                  {item.category}
                </p>
                <h3 className="mt-2 text-lg font-bold">{item.title}</h3>
                <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600">{item.excerpt}</p>
                <Link
                  className="mt-4 inline-block font-semibold text-indigo-700"
                  to={`/news-events/${item.slug}`}
                >
                  Đọc thêm →
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="section-shell pt-0">
        <div className="rounded-[2rem] bg-gradient-to-r from-indigo-600 to-sky-600 px-7 py-12 text-center text-white sm:px-12">
          <h2 className="text-3xl font-bold">Sẵn sàng chọn lớp phù hợp?</h2>
          <p className="mx-auto mt-3 max-w-2xl text-indigo-50">
            Bắt đầu từ khóa học, so sánh các lớp đang mở và chọn lịch học phù hợp.
          </p>
          <Link className="btn-light mt-6" to="/catalog">
            Khám phá khóa học
          </Link>
        </div>
      </section>
    </>
  );
}

function JourneyCard({
  icon: Icon,
  title,
  text,
  to,
}: {
  icon: typeof Search;
  title: string;
  text: string;
  to: string;
}) {
  return (
    <Link className="card group" to={to}>
      <Icon className="text-indigo-600" />
      <h3 className="mt-4 text-xl font-bold group-hover:text-indigo-700">{title}</h3>
      <p className="mt-2 leading-7 text-slate-600">{text}</p>
      <span className="mt-5 inline-flex items-center gap-2 font-semibold text-indigo-700">
        Bắt đầu <ArrowRight size={17} />
      </span>
    </Link>
  );
}
function ValueCard({
  icon: Icon,
  title,
  text,
}: {
  icon: typeof ShieldCheck;
  title: string;
  text: string;
}) {
  return (
    <article className="card">
      <Icon className="text-indigo-600" />
      <h3 className="mt-4 text-xl font-bold">{title}</h3>
      <p className="mt-2 leading-7 text-slate-600">{text}</p>
    </article>
  );
}
