import {
  BarChart3,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  ClipboardCheck,
  FileCheck2,
  LayoutDashboard,
  Route,
  Search,
  UserPlus,
} from 'lucide-react';
import { Link } from 'react-router';

const steps = [
  [
    UserPlus,
    'Tạo tài khoản và đăng nhập',
    'Đăng ký tài khoản học viên để lưu lại lịch sử làm bài, kết quả kiểm tra và tiến độ học tập trên toàn hệ thống.',
  ],
  [
    Search,
    'Khám phá chương trình và xác định mục tiêu',
    'Tìm hiểu các khóa học theo mục tiêu điểm số TOEIC (450, 650, 800+) hoặc theo kỹ năng bạn muốn tập trung phát triển.',
  ],
  [
    ClipboardCheck,
    'Kiểm tra đầu vào trước khi đăng ký lớp',
    'Thực hiện bài kiểm tra trình độ miễn phí để xác định chính xác năng lực hiện tại trước khi chọn khóa học.',
  ],
  [
    BarChart3,
    'Đọc kết quả theo kỹ năng',
    'Xem điểm số chi tiết từng phần. Điểm Nghe & Đọc có kết quả ngay; bài Nói & Viết sẽ được giảng viên chấm và gửi nhận xét.',
  ],
  [
    Route,
    'Xem gợi ý khóa học và lớp',
    'Hệ thống tự động đề xuất khóa học và lớp học phù hợp nhất dựa trên kết quả kiểm tra đầu vào và mục tiêu của bạn.',
  ],
  [
    BookOpen,
    'Chọn lớp phù hợp',
    'So sánh thời khóa biểu, hình thức học, giảng viên phụ trách và chọn lớp học thuận tiện nhất với thời gian biểu của bạn.',
  ],
  [
    CircleDollarSign,
    'Đăng ký lớp và theo dõi trạng thái',
    'Xác nhận đăng ký lớp học và hoàn tất nghĩa vụ học phí qua chuyển khoản ngân hàng bằng mã VietQR SePay tiện lợi.',
  ],
  [
    LayoutDashboard,
    'Vào lớp và học bài',
    'Truy cập không gian lớp học trực tuyến, xem lịch học, bài giảng tương tác và tải tài liệu học tập trước mỗi buổi học.',
  ],
  [
    FileCheck2,
    'Làm bài kiểm tra trong lớp',
    'Hoàn thành các bài tập củng cố, bài mini-test và bài thi thử trong suốt khóa học để đánh giá mức độ tiến bộ.',
  ],
  [
    CheckCircle2,
    'Đọc kết quả, tiến độ và bước tiếp theo',
    'Xem biểu đồ tiến độ học tập, nhận xét chi tiết từ giảng viên và tự tin đạt điểm số TOEIC mục tiêu.',
  ],
] as const;

const glossary = [
  ['Khóa học', 'Chương trình đào tạo tổng thể với mục tiêu điểm số cụ thể (ví dụ: TOEIC 450+, TOEIC 650+, 4 Kỹ năng).'],
  ['Lớp học', 'Lớp học cụ thể thuộc một khóa học, có lịch học cố định, giảng viên phụ trách và danh sách học viên.'],
  ['Đăng ký ghi danh', 'Thao tác chọn lớp và hoàn tất thủ tục đăng ký học.'],
  ['Bài kiểm tra định kỳ', 'Bài test đánh giá kiến thức đã học trong khóa, gồm các câu hỏi trắc nghiệm hoặc bài tập tự luận.'],
  ['Báo cáo tiến độ', 'Bảng tổng hợp điểm số các bài kiểm tra, mức độ hoàn thành bài học và nhận xét từ giảng viên.'],
  [
    'Kiểm tra đầu vào (Placement Test)',
    'Bài đánh giá năng lực ban đầu giúp học viên và trung tâm chọn đúng lớp học phù hợp với trình độ.',
  ],
] as const;

const faqs = [
  [
    'Tôi nên chọn khóa học hay lớp học trước?',
    'Bạn nên tìm hiểu khóa học để xác định mục tiêu và lộ trình trước. Sau đó, làm bài kiểm tra đầu vào để chọn đúng lớp học có lịch học và trình độ phù hợp nhất với bạn.',
  ],
  [
    'Sau khi thanh toán học phí, khi nào tôi vào học được?',
    'Sau khi hoàn tất đủ 100% học phí của lớp và giao dịch được hệ thống đối soát thành công, quyền vào học và tài liệu sẽ được mở. Trường hợp thanh toán một phần hoặc đang chờ đối soát, hồ sơ sẽ được ghi nhận và giữ chỗ theo quy định của trung tâm.',
  ],
  [
    'Bài làm Speaking và Writing bao lâu thì có kết quả?',
    'Giảng viên chuyên môn sẽ chấm bài theo rubric chuẩn và gửi kèm nhận xét chi tiết cho bạn trong vòng 24–48 giờ.',
  ],
  [
    'Kết quả kiểm tra đầu vào có thời hạn bao lâu?',
    'Kết quả kiểm tra đầu vào phản ánh trình độ tại thời điểm làm bài. Bạn nên đăng ký lớp học trong vòng 30 ngày để đảm bảo lộ trình phù hợp nhất.',
  ],
  [
    'Tôi có thể học trên điện thoại hoặc máy tính bảng không?',
    'Có. Hệ thống hỗ trợ tốt trên mọi thiết bị. Tuy nhiên, đối với các bài thi thử trọn vẹn 2 tiếng, bạn nên sử dụng máy tính để có trải nghiệm giống phòng thi thật nhất.',
  ],
] as const;

export function GuidePage() {
  return (
    <main>
      <section className="border-b bg-gradient-to-b from-indigo-50 to-white">
        <div className="mx-auto max-w-5xl px-4 py-16 text-center sm:px-6 lg:py-20">
          <p className="eyebrow">Quy trình học tập</p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">
            Hướng dẫn học trên hệ thống
          </h1>
          <p className="mx-auto mt-5 max-w-3xl text-lg leading-8 text-slate-600">
            Mười bước từ tạo tài khoản đến theo dõi tiến độ, kèm giải thích thuật ngữ và câu trả lời cho
            những thắc mắc thường gặp.
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
            <p className="eyebrow">Trước khi chọn lớp</p>
            <h2 className="mt-3 text-3xl font-bold">Kiểm tra đầu vào</h2>
            <p className="mt-4 max-w-3xl leading-7 text-slate-600">
              Sau khi đăng nhập, chọn bài Nghe và Đọc hoặc bài bốn kỹ năng, đặt điểm mục tiêu
              rồi xem hướng dẫn trước khi làm bài. Kết quả và lớp gợi ý phụ thuộc vào dữ liệu
              đã được xác nhận; kết quả nội bộ không phải điểm thi TOEIC chính thức.
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
            <Link className="btn-primary !bg-white !text-indigo-800" to="/catalog">
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
