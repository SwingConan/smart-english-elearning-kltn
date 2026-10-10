import {
  BookOpen,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  ClipboardCheck,
  FileCheck2,
  GraduationCap,
  KeyRound,
  LayoutDashboard,
  Search,
  UserPlus,
} from 'lucide-react';
import { Link } from 'react-router';

const steps = [
  [
    UserPlus,
    'Tạo tài khoản',
    'Đăng ký bằng họ tên, email và mật khẩu để lưu hành trình học của riêng bạn.',
  ],
  [
    KeyRound,
    'Đăng nhập',
    'Đăng nhập trước khi đăng ký lớp hoặc truy cập những khu vực dành cho học viên.',
  ],
  [
    Search,
    'Khám phá khóa học',
    'Lọc chương trình theo từ khóa, trình độ, kỹ năng và khả năng có lớp đang mở.',
  ],
  [
    BookOpen,
    'Xem chi tiết chương trình',
    'Đọc mục tiêu, nội dung theo module và các lớp đang mở thuộc chương trình đó.',
  ],
  [
    ClipboardCheck,
    'Chọn lớp phù hợp',
    'So sánh lịch học, hình thức, giảng viên, học phí và số chỗ còn lại.',
  ],
  [
    CircleDollarSign,
    'Hoàn tất điều kiện đăng ký',
    'Lớp miễn phí có thể được ghi nhận ngay; lớp có học phí có thể cần chờ xác nhận thanh toán.',
  ],
  [
    LayoutDashboard,
    'Vào không gian lớp',
    'Theo dõi tổng quan và dùng thanh điều hướng lớp để chuyển giữa các khu vực.',
  ],
  [
    GraduationCap,
    'Học bài và dùng tài liệu',
    'Mở bài học theo cấu trúc, xem nội dung và tải tài liệu khi được cho phép.',
  ],
  [
    FileCheck2,
    'Làm bài kiểm tra',
    'Đọc hướng dẫn, hoàn thành phần được giao và kiểm tra trạng thái trước khi nộp.',
  ],
  [
    CheckCircle2,
    'Đọc kết quả và tiến độ',
    'Xem dữ liệu theo kỹ năng, chú ý trạng thái đang chờ hoặc còn thiếu trước khi chọn bước tiếp theo.',
  ],
] as const;

const glossary = [
  ['Khóa học', 'Chương trình mô tả mục tiêu, phạm vi kỹ năng và nội dung học.'],
  ['Lớp học', 'Một đợt triển khai cụ thể của khóa học, có lịch, hình thức, giảng viên và học phí.'],
  ['Đăng ký', 'Bản ghi thể hiện quan hệ của người học với một lớp và trạng thái truy cập.'],
  ['Bài kiểm tra', 'Hoạt động đánh giá trong lớp; một số phần có thể cần chờ giảng viên chấm.'],
  ['Tiến độ', 'Thông tin tổng hợp từ hoạt động học và đánh giá, phụ thuộc vào dữ liệu hiện có.'],
  [
    'Kiểm tra đầu vào',
    'Bài đánh giá tham khảo trước khi học, không phải chứng chỉ hay kết quả thi chính thức.',
  ],
] as const;

const faqs = [
  [
    'Tôi nên chọn khóa học hay lớp học trước?',
    'Hãy xem khóa học để hiểu chương trình, sau đó chọn một lớp đang mở có lịch và hình thức phù hợp.',
  ],
  [
    'Vì sao đã đăng ký nhưng chưa vào được nội dung?',
    'Quyền truy cập phụ thuộc vào trạng thái đăng ký. Với lớp có học phí, bạn có thể đang ở trạng thái chờ thanh toán hoặc chờ xác nhận.',
  ],
  [
    'Kết quả đang chờ có được tính vào tiến độ không?',
    'Giao diện chỉ tổng hợp dữ liệu đã sẵn sàng. Phần đang chờ hoặc còn thiếu được hiển thị theo trạng thái riêng, không bị suy diễn thành kết quả.',
  ],
  [
    'Kiểm tra đầu vào có phải bài thi TOEIC chính thức không?',
    'Không. Đây là hoạt động đánh giá nội bộ nhằm cung cấp thêm thông tin tham khảo cho việc khám phá chương trình.',
  ],
  [
    'Tôi có thể học trên điện thoại không?',
    'Các trang chính được thiết kế responsive. Với bài nghe hoặc bài kiểm tra dài, thiết bị có màn hình lớn và kết nối ổn định thường thuận tiện hơn.',
  ],
] as const;

export function GuidePage() {
  return (
    <main>
      <section className="border-b bg-gradient-to-b from-indigo-50 to-white">
        <div className="mx-auto max-w-5xl px-4 py-16 text-center sm:px-6 lg:py-20">
          <p className="eyebrow">Bắt đầu thuận lợi</p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">
            Hướng dẫn học trên hệ thống
          </h1>
          <p className="mx-auto mt-5 max-w-3xl text-lg leading-8 text-slate-600">
            Mười bước từ tạo tài khoản đến đọc tiến độ, kèm giải thích thuật ngữ và câu trả lời cho
            những tình huống thường gặp.
          </p>
          <nav aria-label="Điều hướng nhanh" className="mt-8 flex flex-wrap justify-center gap-2">
            <a className="filter-chip" href="#steps">
              10 bước bắt đầu
            </a>
            <a className="filter-chip" href="#glossary">
              Thuật ngữ
            </a>
            <a className="filter-chip" href="#faq">
              Câu hỏi thường gặp
            </a>
          </nav>
        </div>
      </section>

      <section className="section-shell" id="steps">
        <div className="mx-auto max-w-5xl">
          <p className="eyebrow">Lộ trình thao tác</p>
          <h2 className="mt-3 text-3xl font-bold">10 bước bắt đầu</h2>
          <div className="relative mt-10 space-y-5 before:absolute before:bottom-8 before:left-6 before:top-8 before:w-px before:bg-indigo-200 sm:before:left-8">
            {steps.map(([Icon, title, text], index) => (
              <article
                className="relative grid grid-cols-[3rem_1fr] gap-5 rounded-2xl border bg-white p-5 shadow-sm sm:grid-cols-[4rem_1fr] sm:p-7"
                key={title}
              >
                <div className="relative z-10 flex size-12 items-center justify-center rounded-full bg-indigo-700 text-white sm:size-16">
                  <Icon size={23} />
                </div>
                <div>
                  <p className="text-sm font-bold text-indigo-700">BƯỚC {index + 1}</p>
                  <h3 className="mt-1 text-xl font-bold">{title}</h3>
                  <p className="mt-2 leading-7 text-slate-600">{text}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y bg-slate-50" id="placement">
        <div className="mx-auto grid max-w-5xl gap-7 px-4 py-14 sm:px-6 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <p className="eyebrow">Trước khi chọn khóa học</p>
            <h2 className="mt-3 text-3xl font-bold">Kiểm tra đầu vào</h2>
            <p className="mt-4 max-w-3xl leading-7 text-slate-600">
              Chọn mục tiêu và trình độ tự đánh giá, sau đó thực hiện bài Listening & Reading để có
              thêm dữ liệu tham khảo. Kết quả nội bộ không phải chứng chỉ hoặc điểm thi TOEIC chính
              thức.
            </p>
          </div>
          <Link className="btn-primary" to="/placement">
            Bắt đầu kiểm tra
          </Link>
        </div>
      </section>

      <section className="section-shell" id="glossary">
        <div className="mx-auto max-w-6xl">
          <p className="eyebrow">Hiểu đúng hệ thống</p>
          <h2 className="mt-3 text-3xl font-bold">Thuật ngữ cần biết</h2>
          <dl className="mt-8 grid gap-4 md:grid-cols-2">
            {glossary.map(([term, description]) => (
              <div className="rounded-2xl border bg-white p-6" key={term}>
                <dt className="font-bold text-indigo-800">{term}</dt>
                <dd className="mt-2 leading-7 text-slate-600">{description}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="border-y bg-indigo-50" id="faq">
        <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
          <p className="eyebrow">Cần giải đáp?</p>
          <h2 className="mt-3 text-3xl font-bold">Câu hỏi thường gặp</h2>
          <div className="mt-8 space-y-3">
            {faqs.map(([question, answer]) => (
              <details
                className="group rounded-2xl border bg-white p-5 open:shadow-sm"
                key={question}
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-bold">
                  {question}
                  <ChevronDown className="shrink-0 transition group-open:rotate-180" size={20} />
                </summary>
                <p className="mt-4 border-t pt-4 leading-7 text-slate-600">{answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="section-shell text-center">
        <div className="mx-auto max-w-3xl rounded-3xl bg-indigo-950 px-6 py-12 text-white">
          <h2 className="text-3xl font-bold">Bắt đầu từ lựa chọn phù hợp với bạn</h2>
          <p className="mt-4 leading-7 text-indigo-100">
            Khám phá chương trình đang có hoặc làm kiểm tra đầu vào để có thêm thông tin tham khảo.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Link className="btn-primary !bg-white !text-indigo-800" to="/courses">
              Xem khóa học
            </Link>
            <Link
              className="btn-secondary !border-white/30 !bg-transparent !text-white"
              to="/placement"
            >
              Kiểm tra đầu vào
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
