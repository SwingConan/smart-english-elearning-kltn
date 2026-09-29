import { Clock3, Mail, MapPin } from 'lucide-react';

export function ContactPage() {
  return (
    <section className="mx-auto max-w-5xl px-4 py-14 sm:px-6">
      <p className="eyebrow">Hỗ trợ</p>
      <h1 className="page-title">Liên hệ</h1>
      <p className="page-lead">
        Kênh liên hệ phục vụ demo và trao đổi về đồ án. Trang không hiển thị form gửi giả khi chưa
        có backend xử lý.
      </p>
      <div className="mt-10 grid gap-5 md:grid-cols-3">
        <ContactCard icon={Mail} title="Email" value="support@smart-english.local" />
        <ContactCard
          icon={MapPin}
          title="Địa điểm"
          value="Không gian demo KLTN — TP. Hồ Chí Minh"
        />
        <ContactCard
          icon={Clock3}
          title="Thời gian phản hồi"
          value="Thứ Hai–Thứ Sáu, 08:00–17:00"
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
  icon: typeof Mail;
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
