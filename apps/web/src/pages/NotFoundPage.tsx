import { Link } from 'react-router';

export function NotFoundPage() {
  return (
    <section className="space-y-3">
      <h1 className="text-2xl font-semibold">404</h1>
      <p className="text-slate-600">Trang không tồn tại.</p>
      <Link className="underline" to="/">Quay về trang chủ</Link>
    </section>
  );
}
