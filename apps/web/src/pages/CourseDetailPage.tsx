import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import { useAuth } from '@/features/auth/auth-context';
import { safeReturnUrl } from '@/features/auth/return-url';
import { catalogApi } from '@/features/catalog/api';
import type { PublicClassOffering, PublicCourse } from '@/features/catalog/types';
import { ApiError } from '@/lib/api-client';

type DetailLoadState =
  | { slug: string; status: 'loading' }
  | { slug: string; status: 'success'; course: PublicCourse }
  | { slug: string; status: 'not-found' }
  | { slug: string; status: 'error' };

const vndFormatter = new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
});
const dateFormatter = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium' });

export function CourseDetailPage() {
  const { slug = '' } = useParams();
  const [loadState, setLoadState] = useState<DetailLoadState>({ slug: '', status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    void catalogApi
      .detail(slug, controller.signal)
      .then((course) => setLoadState({ slug, status: 'success', course }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setLoadState({
          slug,
          status: error instanceof ApiError && error.status === 404 ? 'not-found' : 'error',
        });
      });
    return () => controller.abort();
  }, [slug]);

  if (loadState.slug !== slug || loadState.status === 'loading') {
    return <p role="status">Đang tải thông tin khóa học...</p>;
  }
  if (loadState.status === 'not-found') {
    return <section><h1 className="text-2xl font-semibold">Không tìm thấy khóa học</h1></section>;
  }
  if (loadState.status === 'error') {
    return <p className="rounded-md bg-red-50 p-4 text-red-700" role="alert">Không thể tải khóa học. Vui lòng thử lại.</p>;
  }

  const { course } = loadState;
  return (
    <article>
      <Link className="text-sm underline" to="/catalog">← Quay lại danh sách</Link>
      <div className="mt-5 grid gap-8 md:grid-cols-[2fr_1fr]">
        <div>
          <p className="text-sm font-semibold uppercase text-slate-500">{course.level}</p>
          <h1 className="mt-2 text-3xl font-bold">{course.title}</h1>
          <p className="mt-5 whitespace-pre-line text-slate-700">{course.description}</p>
        </div>
        {course.thumbnailUrl ? (
          <img alt={`Ảnh khóa học ${course.title}`} className="w-full rounded-xl object-cover" src={course.thumbnailUrl} />
        ) : null}
      </div>

      <section className="mt-10" aria-labelledby="open-offerings-heading">
        <h2 className="text-2xl font-semibold" id="open-offerings-heading">Lớp đang mở</h2>
        {course.classOfferings.length === 0 ? (
          <p className="mt-4 rounded-md border bg-white p-5">Hiện chưa có lớp đang mở đăng ký.</p>
        ) : (
          <div className="mt-5 grid gap-5 md:grid-cols-2">
            {course.classOfferings.map((offering) => (
              <OfferingCard key={offering.id} offering={offering} />
            ))}
          </div>
        )}
      </section>
    </article>
  );
}

function OfferingCard({ offering }: { offering: PublicClassOffering }) {
  return (
    <article className="rounded-xl border bg-white p-5">
      <h3 className="text-lg font-semibold">{offering.name}</h3>
      <p className="mt-2 font-medium text-emerald-700">
        {offering.pricingType === 'FREE'
          ? 'Miễn phí'
          : offering.tuitionFeeVnd === null
            ? 'Học phí chưa cập nhật'
            : vndFormatter.format(offering.tuitionFeeVnd)}
      </p>
      <dl className="mt-4 space-y-2 text-sm text-slate-700">
        {offering.instructor ? <Detail label="Giảng viên" value={offering.instructor.fullName} /> : null}
        {offering.maxStudents !== null ? <Detail label="Sĩ số tối đa" value={String(offering.maxStudents)} /> : null}
        {offering.enrollmentStart ? <Detail label="Mở đăng ký" value={formatDate(offering.enrollmentStart)} /> : null}
        {offering.enrollmentEnd ? <Detail label="Đóng đăng ký" value={formatDate(offering.enrollmentEnd)} /> : null}
        {offering.classStart ? <Detail label="Khai giảng" value={formatDate(offering.classStart)} /> : null}
        {offering.classEnd ? <Detail label="Kết thúc" value={formatDate(offering.classEnd)} /> : null}
      </dl>
      <EnrollmentPlaceholder />
    </article>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="flex gap-2"><dt className="font-medium">{label}:</dt><dd>{value}</dd></div>;
}

function EnrollmentPlaceholder() {
  const { user, isLoading } = useAuth();
  const location = useLocation();
  const returnUrl = safeReturnUrl(`${location.pathname}${location.search}${location.hash}`);

  if (isLoading) {
    return <button className="mt-5 rounded-md border px-4 py-2" disabled type="button">Đăng ký</button>;
  }
  if (!user) {
    const params = new URLSearchParams({ returnUrl });
    return <Link className="mt-5 inline-block rounded-md bg-slate-900 px-4 py-2 text-white" to={`/login?${params.toString()}`}>Đăng ký</Link>;
  }

  return (
    <div className="mt-5">
      <button className="rounded-md border px-4 py-2 opacity-60" disabled type="button">Đăng ký</button>
      <p className="mt-2 text-xs text-slate-500">
        {user.role === 'STUDENT'
          ? 'Chức năng đăng ký sẽ được kết nối ở bước tiếp theo.'
          : 'Chỉ tài khoản học viên có thể đăng ký lớp.'}
      </p>
    </div>
  );
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Chưa cập nhật' : dateFormatter.format(date);
}
