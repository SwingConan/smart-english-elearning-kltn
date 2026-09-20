import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAuth } from '@/features/auth/auth-context';
import { safeReturnUrl } from '@/features/auth/return-url';
import { enrollmentApi } from '@/features/enrollments/api';
import { enrollmentStatusLabel, pricingLabel } from '@/features/enrollments/display';
import type { EnrollmentView } from '@/features/enrollments/types';
import { ApiError } from '@/lib/api-client';

type LoadState =
  | { status: 'loading' }
  | { status: 'success'; enrollments: EnrollmentView[] }
  | { status: 'error' };

const dateFormatter = new Intl.DateTimeFormat('vi-VN', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

export function MyEnrollmentsPage() {
  const [loadState, setLoadState] = useState<LoadState>({ status: 'loading' });
  const { refreshUser } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const controller = new AbortController();
    void enrollmentApi.listMine(controller.signal)
      .then((enrollments) => setLoadState({ status: 'success', enrollments }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        if (error instanceof ApiError && error.status === 401) {
          void refreshUser().then(() => {
            const returnUrl = safeReturnUrl('/student/enrollments');
            navigate(`/login?${new URLSearchParams({ returnUrl }).toString()}`, { replace: true });
          });
          return;
        }
        setLoadState({ status: 'error' });
      });
    return () => controller.abort();
  }, [navigate, refreshUser]);

  return (
    <section>
      <h1 className="text-3xl font-bold">Khóa học của tôi</h1>
      <p className="mt-2 text-slate-600">Các lớp học bạn đã đăng ký.</p>
      {loadState.status === 'loading' ? <p className="mt-6" role="status">Đang tải danh sách đăng ký...</p> : null}
      {loadState.status === 'error' ? (
        <p className="mt-6 rounded-md bg-red-50 p-4 text-red-700" role="alert">Không thể tải danh sách đăng ký. Vui lòng thử lại.</p>
      ) : null}
      {loadState.status === 'success' && loadState.enrollments.length === 0 ? (
        <p className="mt-6 rounded-md border bg-white p-5">Bạn chưa đăng ký lớp học nào.</p>
      ) : null}
      {loadState.status === 'success' && loadState.enrollments.length > 0 ? (
        <div className="mt-6 space-y-4">
          {loadState.enrollments.map((enrollment) => (
            <article className="rounded-xl border bg-white p-5" key={enrollment.id}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <Link className="text-lg font-semibold underline" to={`/catalog/${enrollment.classOffering.course.slug}`}>
                    {enrollment.classOffering.course.title}
                  </Link>
                  <p className="mt-1 text-sm text-slate-500">{enrollment.classOffering.course.level}</p>
                  <h2 className="mt-3 font-medium">{enrollment.classOffering.name}</h2>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium">
                  {enrollmentStatusLabel(enrollment.status)}
                </span>
              </div>
              <dl className="mt-4 grid gap-2 text-sm md:grid-cols-2">
                <Detail label="Trạng thái lớp" value={offeringStatusLabel(enrollment.classOffering.status)} />
                <Detail label="Học phí" value={pricingLabel(enrollment.classOffering.pricingType, enrollment.classOffering.tuitionFeeVnd)} />
                <Detail label="Ngày đăng ký" value={formatDate(enrollment.enrolledAt)} />
              </dl>
              {enrollment.status === 'ACTIVE' && (
                <div className="mt-4 border-t pt-4">
                  <Link
                    to={`/student/enrollments/${enrollment.id}/learn`}
                    className="inline-block rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 font-medium text-sm"
                  >
                    Tiếp tục học
                  </Link>
                </div>
              )}
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="flex gap-2"><dt className="font-medium">{label}:</dt><dd>{value}</dd></div>;
}

function offeringStatusLabel(status: EnrollmentView['classOffering']['status']): string {
  return {
    DRAFT: 'Bản nháp',
    OPEN: 'Đang mở',
    IN_PROGRESS: 'Đang học',
    COMPLETED: 'Hoàn thành',
    CANCELLED: 'Đã hủy',
  }[status];
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Chưa cập nhật' : dateFormatter.format(date);
}
