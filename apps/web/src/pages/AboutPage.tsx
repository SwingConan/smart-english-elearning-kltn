import { Layers3, ShieldCheck, Target } from 'lucide-react';

export function AboutPage() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
      <p className="eyebrow">Về nền tảng</p>
      <h1 className="page-title">Một hành trình học TOEIC có cấu trúc</h1>
      <p className="page-lead">
        Smart English E-Learning là đồ án KLTN tập trung kết nối discovery, lớp học, nội dung, bài
        kiểm tra và tiến độ trên một nền tảng nhất quán.
      </p>
      <div className="mt-10 grid gap-6 md:grid-cols-3">
        {[
          [
            Target,
            'Đúng mục tiêu',
            'Khóa học và lớp học được trình bày rõ để người học chọn đúng chương trình và lịch học.',
          ],
          [
            Layers3,
            'Học tập liền mạch',
            'Không gian lớp giữ ngữ cảnh xuyên suốt từ tổng quan đến bài học, bài kiểm tra, kết quả và tiến độ.',
          ],
          [
            ShieldCheck,
            'Quyền truy cập rõ ràng',
            'Nội dung học chỉ mở cho đăng ký đã được xác nhận; trạng thái chờ thanh toán được trình bày minh bạch.',
          ],
        ].map(([Icon, title, text]) => (
          <article className="card" key={String(title)}>
            <Icon className="text-indigo-600" />
            <h2 className="mt-4 text-xl font-bold">{String(title)}</h2>
            <p className="mt-2 leading-7 text-slate-600">{String(text)}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
