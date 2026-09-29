import { Layers3, ShieldCheck, Target } from 'lucide-react';

export function AboutPage() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
      <p className="eyebrow">Về nền tảng</p>
      <h1 className="page-title">Một hành trình học TOEIC có cấu trúc</h1>
      <p className="page-lead">
        Smart English E-Learning là đồ án KLTN tập trung kết nối discovery, lớp học, nội dung,
        assessment và tiến độ trên một nền tảng nhất quán.
      </p>
      <div className="mt-10 grid gap-6 md:grid-cols-3">
        {[
          [
            Target,
            'Đúng mục tiêu',
            'Course và ClassOffering được tách rõ để người học chọn đúng chương trình và lịch học.',
          ],
          [
            Layers3,
            'Học tập liền mạch',
            'Class shell giữ ngữ cảnh từ tổng quan đến lesson, assessment, result và progress.',
          ],
          [
            ShieldCheck,
            'Quyền truy cập rõ ràng',
            'Nội dung LMS chỉ mở cho Enrollment ACTIVE; trạng thái chờ thanh toán không bị mô tả sai.',
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
