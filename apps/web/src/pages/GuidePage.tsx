import { BookOpen, CheckCircle2, ClipboardCheck, GraduationCap } from 'lucide-react';
import { Link } from 'react-router';

export function GuidePage() {
  const steps = [
    [
      BookOpen,
      '1. Chọn chương trình',
      'Lọc Course theo level và kỹ năng, sau đó xem curriculum trước khi chọn lớp.',
    ],
    [
      ClipboardCheck,
      '2. So sánh lớp',
      'Đối chiếu lịch học, hình thức, giảng viên, học phí và số chỗ còn lại.',
    ],
    [
      GraduationCap,
      '3. Học trong LMS',
      'Mở bài học theo thứ tự, tải tài liệu được phép và đánh dấu hoàn thành.',
    ],
    [
      CheckCircle2,
      '4. Kiểm tra tiến độ',
      'Làm assessment trong lớp, xem kết quả và theo dõi tiến độ theo module.',
    ],
  ] as const;
  return (
    <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
      <p className="eyebrow">Bắt đầu thuận lợi</p>
      <h1 className="page-title">Hướng dẫn học trên hệ thống</h1>
      <p className="page-lead">
        Từ chọn Course đến theo dõi tiến độ, mọi bước đều có đường điều hướng rõ ràng và dữ liệu
        theo đúng trạng thái lớp.
      </p>
      <div className="mt-10 grid gap-5 md:grid-cols-2">
        {steps.map(([Icon, title, text]) => (
          <article className="card" key={title}>
            <Icon className="text-indigo-600" />
            <h2 className="mt-4 text-xl font-bold">{title}</h2>
            <p className="mt-2 leading-7 text-slate-600">{text}</p>
          </article>
        ))}
      </div>
      <div className="mt-12 rounded-3xl bg-indigo-950 p-8 text-white" id="placement">
        <h2 className="text-2xl font-bold">Kiểm tra đầu vào</h2>
        <p className="mt-3 max-w-3xl leading-7 text-indigo-100">
          Placement sẽ mở ở M03 với quy trình làm bài và kết quả đầy đủ. Trong M02, bạn có thể xem
          Course và đăng ký các lớp không yêu cầu Placement mà không gặp luồng thi giả hoặc nút
          không hoạt động.
        </p>
        <Link className="btn-light mt-6" to="/catalog">
          Khám phá khóa học
        </Link>
      </div>
    </section>
  );
}
