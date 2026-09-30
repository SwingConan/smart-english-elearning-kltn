import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { useAuth } from '@/features/auth/auth-context';
import { safeReturnUrl } from '@/features/auth/return-url';
import { ApiError } from '@/lib/api-client';
import { enrollmentApi } from './api';
import type { EnrollmentView } from './types';

export function EnrollmentAction({
  classOfferingId,
  disabledReason,
}: {
  classOfferingId: string;
  disabledReason?: string;
}) {
  const { user, isLoading, refreshUser } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<EnrollmentView | null>(null);
  const [existing, setExisting] = useState<EnrollmentView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const returnUrl = safeReturnUrl(`${location.pathname}${location.search}${location.hash}`);

  useEffect(() => {
    if (user?.role !== 'STUDENT') return;
    const controller = new AbortController();
    void enrollmentApi
      .listMine(controller.signal)
      .then((items) =>
        setExisting(items.find((item) => item.classOffering.id === classOfferingId) ?? null),
      )
      .catch(() => undefined);
    return () => controller.abort();
  }, [classOfferingId, user?.role]);

  if (isLoading)
    return (
      <button className="btn-secondary mt-5" disabled type="button">
        Đang kiểm tra...
      </button>
    );
  if (disabledReason)
    return (
      <div className="mt-5">
        <button className="btn-secondary opacity-60" disabled type="button">
          Không thể đăng ký
        </button>
        <p className="mt-2 text-sm text-slate-600">{disabledReason}</p>
      </div>
    );
  if (!user)
    return (
      <Link
        className="btn-primary mt-5"
        to={`/login?${new URLSearchParams({ returnUrl }).toString()}`}
      >
        Đăng nhập để đăng ký
      </Link>
    );
  if (user.role !== 'STUDENT')
    return (
      <div className="mt-5">
        <button className="btn-secondary opacity-60" disabled type="button">
          Đăng ký
        </button>
        <p className="mt-2 text-sm text-slate-600">Chỉ tài khoản học viên có thể đăng ký lớp.</p>
      </div>
    );
  const enrollment = result ?? existing;
  if (enrollment)
    return (
      <div
        className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950"
        role="status"
      >
        <p className="font-semibold">
          {enrollment.status === 'ACTIVE'
            ? 'Bạn đã đăng ký lớp này.'
            : 'Đăng ký đang chờ thanh toán.'}
        </p>
        <p className="mt-1">
          {enrollment.status === 'ACTIVE'
            ? 'Không gian lớp học đã sẵn sàng.'
            : 'Nội dung lớp chỉ mở sau khi đăng ký được xác nhận.'}
        </p>
        <Link
          className="mt-3 inline-block font-semibold underline"
          to={
            enrollment.status === 'ACTIVE'
              ? `/student/enrollments/${enrollment.id}`
              : '/student/enrollments'
          }
        >
          {enrollment.status === 'ACTIVE' ? 'Vào lớp học' : 'Xem Lớp học của tôi'}
        </Link>
      </div>
    );

  const enroll = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setSubmitting(true);
    setError(null);
    try {
      setResult(await enrollmentApi.create(classOfferingId));
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) {
        await refreshUser();
        navigate(`/login?${new URLSearchParams({ returnUrl }).toString()}`, { replace: true });
        return;
      }
      setError(messageFor(requestError));
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  };
  return (
    <div className="mt-5">
      <button
        className="btn-primary disabled:opacity-50"
        disabled={submitting}
        onClick={() => void enroll()}
        type="button"
      >
        {submitting ? 'Đang xử lý...' : 'Đăng ký lớp'}
      </button>
      {error ? (
        <p className="mt-3 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function messageFor(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 400) return 'Lớp hiện không nhận đăng ký.';
    if (error.status === 403) return 'Bạn không có quyền đăng ký lớp này.';
    if (error.status === 404) return 'Lớp không còn khả dụng.';
    if (error.status === 409) return 'Lớp đã đầy hoặc bạn đã đăng ký trước đó.';
  }
  return 'Không thể kết nối máy chủ. Vui lòng thử lại.';
}
