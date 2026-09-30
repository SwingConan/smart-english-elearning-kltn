import { BellRing, MessageCircleMore, ShieldCheck } from 'lucide-react';

export function ContactPage() {
  return (
    <section className="mx-auto max-w-5xl px-4 py-14 sm:px-6">
      <p className="eyebrow">Hỗ trợ</p>
      <h1 className="page-title">Liên hệ</h1>
      <p className="page-lead">
        Kênh liên hệ chính thức của nhóm dự án sẽ được cập nhật tại đây khi sẵn sàng.
      </p>
      <div className="mt-10 grid gap-5 md:grid-cols-3">
        <ContactCard
          icon={MessageCircleMore}
          title="Kênh liên hệ"
          value="Thông tin liên hệ của nhóm dự án đang được cập nhật."
        />
        <ContactCard
          icon={BellRing}
          title="Thông báo"
          value="Các kênh hỗ trợ chính thức sẽ được công bố trực tiếp trên trang này."
        />
        <ContactCard
          icon={ShieldCheck}
          title="Thông tin xác thực"
          value="Chúng tôi không hiển thị email, số điện thoại hoặc thời gian phản hồi khi chưa được xác nhận."
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
