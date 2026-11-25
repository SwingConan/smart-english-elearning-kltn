import { BellRing, MessageCircleMore, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router';

export function ContactPage() {
  return (
    <section className="mx-auto max-w-5xl px-4 py-14 sm:px-6">
      <p className="eyebrow">Hỗ trợ học viên</p>
      <h1 className="page-title">Thông tin liên hệ</h1>
      <p className="page-lead">
        Học viên có thể gửi yêu cầu hỗ trợ hoặc đặt lịch tư vấn trực tiếp qua hệ thống.
      </p>
      <div className="my-6">
        <Link className="inline-block rounded-xl bg-indigo-600 px-6 py-3 font-semibold text-white shadow-sm hover:bg-indigo-700 transition" to="/support">
          Gửi yêu cầu hỗ trợ hoặc đặt lịch tư vấn
        </Link>
      </div>
      <div className="mt-10 grid gap-5 md:grid-cols-3">
        <ContactCard
          icon={MessageCircleMore}
          title="Tư vấn học tập"
          value="Đặt lịch trao đổi trực tuyến cùng tư vấn viên hoặc giảng viên trong khu vực tài khoản học viên."
        />
        <ContactCard
          icon={BellRing}
          title="Hỗ trợ kỹ thuật"
          value="Gửi phiếu yêu cầu hỗ trợ khi gặp vấn đề về tài khoản, buổi học hoặc bài kiểm tra."
        />
        <ContactCard
          icon={ShieldCheck}
          title="Xác thực thông tin"
          value="Các thông báo chính thức về lịch học, học phí và bài thi được cập nhật trực tiếp trên hệ thống Smart English."
        />
      </div>
    </section>
  );
}

function ContactCard({
  icon: Icon,
  title,
  value,
}: {
  icon: typeof MessageCircleMore;
  title: string;
  value: string;
}) {
  return (
    <article className="card">
      <Icon className="text-indigo-600" />
      <h2 className="mt-4 font-bold">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">{value}</p>
    </article>
  );
}
