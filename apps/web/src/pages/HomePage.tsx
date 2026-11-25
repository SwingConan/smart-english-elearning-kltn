import { useEffect, useState } from 'react';
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  CheckCircle2,
  Headphones,
  MessageSquareText,
  MonitorPlay,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  UsersRound,
} from 'lucide-react';
import { Link } from 'react-router';
import { newsEvents } from '@/content/news-events';
import { newsCoverUrl } from '@/content/news-assets';
import { catalogApi } from '@/features/catalog/api';
import { CourseCard } from '@/features/catalog/CourseCard';
import type { PublicCourse } from '@/features/catalog/types';
import { PageSkeleton } from '@/components/ui/Feedback';
import heroImage from '@/assets/marketing/home-hero.webp';
import placementImage from '@/assets/marketing/placement-assessment.webp';

export function HomePage() {
  const [courses, setCourses] = useState<PublicCourse[]>([]);
  const [courseState, setCourseState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [reloadKey, setReloadKey] = useState(0);
  const [catalogContext, setCatalogContext] = useState<string>();
  useEffect(() => {
    const controller = new AbortController();
    void catalogApi
      .list({ page: 1, limit: 3 }, controller.signal)
      .then((response) => {
        setCourses(response.data);
        setCatalogContext(response.meta.dataContext);
        setCourseState('ready');
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError'))
          setCourseState('error');
      });
    return () => controller.abort();
  }, [reloadKey]);

  return (
    <>
      <section className="hero-grid overflow-hidden bg-[#183121] text-white">
        <div className="mx-auto grid max-w-7xl items-center gap-8 lg:gap-12 px-4 py-10 sm:px-6 sm:py-14 lg:grid-cols-[1.15fr_.85fr] lg:px-8 lg:py-16">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[.22em] text-[#cfe7c2]">
              Chương trình luyện thi TOEIC
            </p>
            <h1 className="mt-5 max-w-3xl text-4xl font-bold tracking-tight sm:text-6xl">
              Luyện thi TOEIC theo lộ trình phù hợp
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-100">
              Khám phá các khóa học phù hợp với trình độ và mục tiêu của bạn. Luyện tập từng kỹ
              năng, làm bài kiểm tra và theo dõi kết quả học tập trên Smart English.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link className="btn-light" to="/catalog">
                Khám phá khóa học <ArrowRight size={18} />
              </Link>
              <Link className="btn-ghost-light" to="/placement">
                Kiểm tra trình độ đầu vào
              </Link>
            </div>
          </div>
          <div className="relative aspect-[16/10] overflow-hidden rounded-[2rem] border border-white/15 bg-[#1b3624] shadow-2xl shadow-black/40">
            <img
              alt="Lớp học tiếng Anh hiện đại với giảng viên và học viên đang luyện tập"
              className="size-full object-cover object-center"
              decoding="sync"
              fetchPriority="high"
              src={heroImage}
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-indigo-950/45 via-transparent to-white/5" />
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
            text="Chọn mục tiêu và làm bài kiểm tra để xác định năng lực từ kết quả thực tế."
            to="/placement"
          />
          <JourneyCard
            icon={BookOpen}
            title="Đã có lớp học"
            text="Đăng nhập để vào trang tổng quan, tiếp tục bài học, bài kiểm tra và theo dõi tiến độ."
            to="/workspace"
          />
        </div>
      </section>

      <section className="section-shell pt-0">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow">Chương trình đào tạo</p>
            <h2 className="section-title">Khóa học nổi bật</h2>
          </div>
          <Link className="font-semibold text-[#4d7439] hover:underline" to="/catalog">
            Xem tất cả khóa học →
          </Link>
        </div>
        {catalogContext === 'QA_REFERENCE' && (
          <p role="note" className="mt-3 text-sm text-slate-600">
            Thông tin khóa học và lịch khai giảng chính thức được cập nhật thường xuyên từ phòng đào tạo.
          </p>
        )}
        {courseState === 'loading' ? (
          <div className="mt-8">
            <PageSkeleton />
          </div>
        ) : courseState === 'error' ? (
          <div
            className="state-error mt-8 flex flex-wrap items-center justify-between gap-4"
            role="alert"
          >
            <div>
              <strong>Chưa thể tải khóa học.</strong>
              <p className="mt-1 text-sm">Kiểm tra kết nối rồi thử tải lại danh sách.</p>
            </div>
            <button
              className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 font-semibold shadow-sm"
              onClick={() => {
                setCourseState('loading');
                setReloadKey((value) => value + 1);
              }}
              type="button"
            >
              <RefreshCw size={17} /> Thử lại
            </button>
          </div>
        ) : courses.length === 0 ? (
          <div className="state-empty mt-8">
            <BookOpen aria-hidden="true" className="mx-auto text-[#5f8b48]" size={32} />
            <h3 className="mt-3 font-bold text-slate-900">Chưa có khóa học được công bố</h3>
            <p className="mt-1 text-sm">Các chương trình mới sẽ xuất hiện tại đây khi sẵn sàng.</p>
          </div>
        ) : (
          <div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {courses.map((course) => (
              <CourseCard course={course} key={course.id} />
            ))}
          </div>
        )}
      </section>

      <section className="bg-[#f4f8f1]">
        <div className="section-shell grid items-center gap-10 lg:grid-cols-2">
          <div className="aspect-[3/2] overflow-hidden rounded-3xl shadow-lg">
            <img
              alt="Người học xem lại bài đánh giá trình độ trên laptop"
              className="size-full object-cover"
              decoding="async"
              src={placementImage}
            />
          </div>
          <div>
            <p className="eyebrow">Kiểm tra đầu vào miễn phí</p>
            <h2 className="section-title">Đánh giá chính xác trình độ TOEIC hiện tại</h2>
            <p className="mt-4 leading-7 text-slate-600">
              Làm bài kiểm tra ngắn gồm Listening & Reading theo format chuẩn để biết mức điểm hiện tại và nhận gợi ý lộ trình học tập phù hợp nhất.
            </p>
            <Link className="btn-primary mt-6" to="/placement">
              Bắt đầu kiểm tra đầu vào
            </Link>
          </div>
        </div>
      </section>

      <section className="section-shell">
        <div className="text-center">
          <p className="eyebrow">Phương pháp đào tạo</p>
          <h2 className="section-title">Trải nghiệm học tại Smart English</h2>
          <p className="mx-auto mt-4 max-w-3xl leading-7 text-slate-600">
            Kết hợp học trực tiếp cùng giảng viên và hệ thống luyện tập trực tuyến 24/7 giúp học viên nắm chắc kiến thức và tự tin đạt điểm mục tiêu.
          </p>
        </div>
        <div className="mt-10 grid gap-5 md:grid-cols-4">
          {[
            [
              UsersRound,
              'Tương tác cùng giảng viên',
              'Học trực tiếp, sửa phát âm, luyện phản xạ và giải đáp thắc mắc ngay trong từng buổi học.',
            ],
            [
              Headphones,
              'Luyện tập 4 kỹ năng',
              'Thực hành Listening, Reading, Speaking và Writing theo cấu trúc đề thi TOEIC.',
            ],
            [
              MonitorPlay,
              'Học trực tuyến tiện lợi',
              'Theo dõi bài giảng, xem lại tài liệu và làm bài tập mọi lúc, mọi nơi trên cùng một hệ thống.',
            ],
            [
              BarChart3,
              'Đo lường tiến độ rõ ràng',
              'Theo dõi điểm số từng kỹ năng qua các bài kiểm tra định kỳ và nhận phân tích chi tiết để cải thiện.',
            ],
          ].map(([Icon, title, text]) => (
            <article
              className="card-interactive rounded-2xl border bg-white p-6"
              key={String(title)}
            >
              <Icon className="text-[#5f8b48]" />
              <h3 className="mt-4 font-bold">{String(title)}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{String(text)}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="bg-[#1b3624] text-white">
        <div className="section-shell">
          <p className="eyebrow text-[#cfe7c2]">Rèn luyện 4 kỹ năng</p>
          <h2 className="section-title">Nâng cao từng kỹ năng TOEIC</h2>
          <p className="mt-4 max-w-3xl text-slate-300">
            Hệ thống bài học và bài kiểm tra được thiết kế chuyên biệt cho từng kỹ năng: Nghe hiểu, Đọc hiểu, Nói và Viết, bám sát cấu trúc bài thi mới nhất.
          </p>
          <div className="mt-9 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              [Headphones, 'Listening (Nghe hiểu)'],
              [BookOpen, 'Reading (Đọc hiểu)'],
              [MessageSquareText, 'Speaking (Nói)'],
              [Sparkles, 'Writing (Viết)'],
            ].map(([Icon, label]) => (
              <div
                className="rounded-2xl border border-white/10 bg-white/5 p-5"
                key={String(label)}
              >
                <Icon className="text-[#a5d08d]" />
                <h3 className="mt-4 font-semibold">{String(label)}</h3>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section-shell">
        <div className="text-center">
          <p className="eyebrow">Đặc điểm chương trình</p>
          <h2 className="section-title">Điểm nổi bật của khóa học</h2>
        </div>
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          <ValueCard
            icon={ShieldCheck}
            title="Lộ trình học rõ ràng"
            text="Nội dung học, chuẩn đầu ra, học phí và thời khóa biểu được thể hiện minh bạch cho từng lớp học."
          />
          <ValueCard
            icon={BarChart3}
            title="Theo dõi tiến độ học tập"
            text="Kết quả làm bài và quá trình học được ghi nhận cụ thể, giúp học viên theo dõi mức độ tiến bộ qua từng buổi."
          />
          <ValueCard
            icon={CheckCircle2}
            title="Học tập trong một không gian"
            text="Bài học, tài liệu, bài tập và nhận xét từ giảng viên được sắp xếp tập trung, thuận tiện cho việc ôn luyện."
          />
        </div>
      </section>

      <section className="section-shell pt-0">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="eyebrow">Góc học tập</p>
            <h2 className="section-title">Tin tức & Sự kiện</h2>
          </div>
          <Link className="font-semibold text-[#4d7439] hover:underline" to="/news-events">
            Xem tất cả bài viết →
          </Link>
        </div>
        <p className="mt-3 text-sm text-slate-600">
          Cập nhật lịch thi TOEIC, thông báo khai giảng và các phương pháp học tập hiệu quả từ đội ngũ giảng viên.
        </p>
        <div className="mt-8 grid gap-6 md:grid-cols-3">
          {newsEvents.slice(0, 3).map((item) => (
            <article className="overflow-hidden rounded-2xl border bg-white" key={item.slug}>
              <img
                alt=""
                className="aspect-[16/10] w-full object-cover transition duration-500 hover:scale-[1.02]"
                decoding="async"
                src={newsCoverUrl(item)}
              />
              <div className="p-5">
                <p className="text-xs font-bold uppercase tracking-wide text-[#4d7439]">
                  {item.category}
                </p>
                <h3 className="mt-2 text-lg font-bold">{item.title}</h3>
                <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600">{item.excerpt}</p>
                <Link
                  className="mt-4 inline-block font-semibold text-[#4d7439] hover:underline"
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
        <div className="rounded-[2rem] bg-gradient-to-r from-[#4e773a] via-[#5f8b48] to-[#3f642c] px-7 py-12 text-center text-white sm:px-12">
          <h2 className="text-3xl font-bold">Bắt đầu hành trình luyện thi TOEIC</h2>
          <p className="mx-auto mt-3 max-w-2xl text-[#eef6ea]">
            Chọn khóa học phù hợp với mục tiêu của bạn hoặc làm bài kiểm tra để xác định trình độ xuất phát.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link className="btn-light" to="/catalog">
              Xem danh sách khóa học
            </Link>
            <Link className="btn-ghost-light" to="/placement">
              Làm bài kiểm tra đầu vào
            </Link>
          </div>
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
      <Icon className="text-[#5f8b48]" />
      <h3 className="mt-4 text-xl font-bold group-hover:text-[#4d7439]">{title}</h3>
      <p className="mt-2 leading-7 text-slate-600">{text}</p>
      <span className="mt-5 inline-flex items-center gap-2 font-semibold text-[#4d7439]">
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
      <Icon className="text-[#5f8b48]" />
      <h3 className="mt-4 text-xl font-bold">{title}</h3>
      <p className="mt-2 leading-7 text-slate-600">{text}</p>
    </article>
  );
}
