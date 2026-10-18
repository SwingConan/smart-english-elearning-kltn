import {
  ArrowRight,
  BookOpenCheck,
  BrainCircuit,
  Headphones,
  Layers3,
  MessageCircle,
  PenLine,
  Route,
  ShieldCheck,
  Sparkles,
  Target,
} from 'lucide-react';
import { Link } from 'react-router';

const journey = [
  ['Khám phá', 'Tìm chương trình theo kỹ năng và trình độ bạn muốn tập trung.'],
  ['Placement', 'Thực hiện đánh giá đầu vào nội bộ trước khi chọn lớp và Enrollment.'],
  ['Evaluation & gợi ý', 'Đọc kết quả theo kỹ năng và gợi ý khóa học/lớp từ dữ liệu hiện có.'],
  ['Enrollment', 'Chọn lớp phù hợp rồi theo dõi đúng trạng thái đăng ký và quyền truy cập.'],
  ['LMS & Assessment', 'Học bài, dùng tài liệu và thực hiện đánh giá trong không gian lớp.'],
  [
    'Kết quả & bước tiếp theo',
    'Đọc đúng dữ liệu đã có; trạng thái thiếu hoặc đang chờ không phải 0.',
  ],
] as const;

const skills = [
  [
    Headphones,
    'Listening',
    'Luyện nghe theo tình huống, nhận diện ý chính và thông tin hành động.',
  ],
  [
    BookOpenCheck,
    'Reading',
    'Đọc theo mục đích, định vị dữ kiện và kết nối thông tin giữa các văn bản.',
  ],
  [MessageCircle, 'Speaking', 'Tổ chức câu trả lời rõ ràng, có lý do và ví dụ phù hợp.'],
  [PenLine, 'Writing', 'Viết đúng mục đích giao tiếp, đầy đủ ý và có trình tự dễ theo dõi.'],
] as const;

export function AboutPage() {
  return (
    <main>
      <section className="overflow-hidden bg-gradient-to-br from-indigo-950 via-indigo-900 to-slate-900 text-white">
        <div className="mx-auto grid max-w-7xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[1.1fr_.9fr] lg:items-center lg:px-8 lg:py-28">
          <div>
            <p className="eyebrow !text-indigo-200">Về Smart English</p>
            <h1 className="mt-4 max-w-3xl text-4xl font-bold tracking-tight sm:text-6xl">
              Học tiếng Anh có định hướng, tiến bộ có căn cứ
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-indigo-100">
              Một không gian học tập kết nối chương trình tại trung tâm với trải nghiệm online, giúp
              người học biết mình đang học gì, vì sao cần học và bước tiếp theo là gì.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link className="btn-primary !bg-white !text-indigo-800" to="/catalog">
                Khám phá khóa học <ArrowRight size={18} />
              </Link>
              <Link className="btn-secondary !border-white/30 !bg-white/10 !text-white" to="/guide">
                Xem cách bắt đầu
              </Link>
            </div>
          </div>
          <div className="relative mx-auto w-full max-w-lg rounded-[2rem] border border-white/15 bg-white/10 p-7 shadow-2xl backdrop-blur">
            <Sparkles className="text-amber-300" size={30} />
            <p className="mt-6 text-sm font-semibold uppercase tracking-[.2em] text-indigo-200">
              Sứ mệnh
            </p>
            <p className="mt-3 text-2xl font-semibold leading-10">
              Giúp mỗi người học xây dựng lộ trình phù hợp và duy trì một nhịp học có thể thực hiện
              trong đời sống thật.
            </p>
          </div>
        </div>
      </section>

      <section className="section-shell">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-10 lg:grid-cols-2 lg:items-start">
            <div>
              <p className="eyebrow">Triết lý học tập</p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
                Cấu trúc rõ để người học chủ động hơn
              </h2>
              <p className="mt-5 text-lg leading-8 text-slate-600">
                Smart English tổ chức trải nghiệm quanh những quyết định thật: chọn mục tiêu, chọn
                lớp, hoàn thành hoạt động học và đọc kết quả đúng bối cảnh. Công nghệ hỗ trợ những
                quyết định đó nhưng không thay thế nỗ lực học tập hay đánh giá chuyên môn.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {[
                [
                  Target,
                  'Đúng mục tiêu',
                  'Nội dung và lớp học được mô tả theo kỹ năng, lịch và điều kiện truy cập.',
                ],
                [
                  Route,
                  'Có bước tiếp theo',
                  'Mỗi trạng thái đều dẫn tới một hành động phù hợp thay vì để người học tự đoán.',
                ],
                [
                  Layers3,
                  'Liền mạch',
                  'Từ khám phá đến lớp học, bài kiểm tra và tiến độ vẫn giữ nguyên ngữ cảnh.',
                ],
                [
                  ShieldCheck,
                  'Minh bạch',
                  'Dữ liệu thiếu, đang chờ hoặc chưa đủ điều kiện được hiển thị đúng bản chất.',
                ],
              ].map(([Icon, title, text]) => (
                <article className="card" key={String(title)}>
                  <Icon className="text-indigo-600" />
                  <h3 className="mt-4 text-lg font-bold">{String(title)}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{String(text)}</p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="border-y bg-slate-50">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <p className="eyebrow">Hành trình học tập</p>
          <h2 className="mt-3 text-3xl font-bold">Từ khám phá đến hành động tiếp theo</h2>
          <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {journey.map(([title, text], index) => (
              <article className="relative rounded-2xl border bg-white p-6" key={title}>
                <span className="flex size-10 items-center justify-center rounded-full bg-indigo-100 font-bold text-indigo-700">
                  {index + 1}
                </span>
                <h3 className="mt-5 text-lg font-bold">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section-shell">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-2xl">
            <p className="eyebrow">Bốn kỹ năng</p>
            <h2 className="mt-3 text-3xl font-bold">
              Phát triển năng lực theo từng mục tiêu cụ thể
            </h2>
          </div>
          <div className="mt-9 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {skills.map(([Icon, title, text]) => (
              <article className="card-interactive rounded-2xl border bg-white p-6" key={title}>
                <Icon className="text-indigo-600" />
                <h3 className="mt-4 text-xl font-bold">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-indigo-50">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-16 sm:px-6 lg:grid-cols-[.8fr_1.2fr] lg:px-8">
          <div>
            <BrainCircuit className="text-indigo-700" size={36} />
            <h2 className="mt-4 text-3xl font-bold">Điểm khác biệt nằm ở sự kết nối</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <p className="rounded-2xl bg-white p-5 leading-7 text-slate-700">
              Khóa học và lớp học là hai lớp thông tin riêng: chương trình cho biết học gì, lớp cho
              biết học khi nào và theo điều kiện nào.
            </p>
            <p className="rounded-2xl bg-white p-5 leading-7 text-slate-700">
              Không gian lớp gom bài học, tài liệu, bài kiểm tra, kết quả và tiến độ về một luồng
              điều hướng nhất quán.
            </p>
            <p className="rounded-2xl bg-white p-5 leading-7 text-slate-700">
              Trạng thái đăng ký và quyền truy cập được trình bày rõ để người học biết mình có thể
              làm gì ngay lúc này.
            </p>
            <p className="rounded-2xl bg-white p-5 leading-7 text-slate-700">
              Kết quả được đọc theo từng kỹ năng và độ đầy đủ của dữ liệu, không biến dữ liệu đang
              chờ thành kết luận.
            </p>
          </div>
        </div>
      </section>

      <section className="section-shell text-center">
        <div className="mx-auto max-w-3xl rounded-3xl bg-indigo-950 px-6 py-12 text-white sm:px-10">
          <h2 className="text-3xl font-bold">Sẵn sàng tìm lộ trình phù hợp?</h2>
          <p className="mt-4 leading-7 text-indigo-100">
            Bắt đầu bằng việc khám phá chương trình hoặc đọc hướng dẫn đầy đủ về hành trình học trên
            hệ thống.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Link className="btn-primary !bg-white !text-indigo-800" to="/catalog">
              Xem khóa học
            </Link>
            <Link
              className="btn-secondary !border-white/30 !bg-transparent !text-white"
              to="/guide"
            >
              Hướng dẫn học
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
