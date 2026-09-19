import { useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { useAuth } from '@/features/auth/auth-context';
import { safeReturnUrl } from '@/features/auth/return-url';
import { ApiError } from '@/lib/api-client';
import { enrollmentApi } from './api';
import type { EnrollmentView } from './types';

export function EnrollmentAction({ classOfferingId }: { classOfferingId: string }) {
  const { user, isLoading, refreshUser } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<EnrollmentView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const submittingRef = useRef(false);
  const returnUrl = safeReturnUrl(`${location.pathname}${location.search}${location.hash}`);

  if (isLoading) {
    return <button className="mt-5 rounded-md border px-4 py-2" disabled type="button">Đăng ký</button>;
  }
  if (!user) {
    const params = new URLSearchParams({ returnUrl });
    return <Link className="mt-5 inline-block rounded-md bg-slate-900 px-4 py-2 text-white" to={`/login?${params.toString()}`}>Đăng ký</Link>;
  }
  if (user.role !== 'STUDENT') {
    return (
      <div className="mt-5">
        <button className="rounded-md border px-4 py-2 opacity-60" disabled type="button">Đăng ký</button>
        <p className="mt-2 text-xs text-slate-500">Chỉ tài khoản học viên có thể đăng ký lớp.</p>
      </div>
    );
  }
  if (result) {
    return (
      <div className="mt-5 rounded-md bg-emerald-50 p-3 text-sm text-emerald-900" role="status">
        <p>
          {result.status === 'ACTIVE'
            ? 'Đăng ký khóa học thành công.'
            : 'Yêu cầu đăng ký đã được tạo và đang chờ thanh toán.'}
        </p>
        <Link className="mt-2 inline-block font-medium underline" to="/student/enrollments">Xem khóa học của tôi</Link>
      </div>
    );
  }

  const enroll = async () => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setIsSubmitting(true);
    setError(null);
    try {
      setResult(await enrollmentApi.create(classOfferingId));
    } catch (requestError: unknown) {
      if (requestError instanceof ApiError && requestError.status === 401) {
        await refreshUser();
        const params = new URLSearchParams({ returnUrl });
        navigate(`/login?${params.toString()}`, { replace: true });
        return;
      }
      setError(enrollmentErrorMessage(requestError));
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mt-5">
      <button
        className="rounded-md bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
        disabled={isSubmitting}
        onClick={() => void enroll()}
        type="button"
      >
        {isSubmitting ? 'Đang xử lý...' : 'Đăng ký'}
      </button>
      {error ? <p className="mt-2 text-sm text-red-700" role="alert">{error}</p> : null}
    </div>
  );
}

function enrollmentErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.status) {
      case 400:
        return 'Hiện không thể đăng ký lớp học này. Vui lòng kiểm tra thời gian hoặc trạng thái lớp.';
      case 403:
        return 'Bạn không có quyền đăng ký lớp học này.';
      case 404:
        return 'Lớp học không còn tồn tại hoặc không khả dụng.';
      case 409:
        return 'Không thể hoàn tất đăng ký vì lớp học đã đầy hoặc bạn đã đăng ký trước đó.';
    }
  }
  return 'Không thể kết nối máy chủ. Vui lòng thử lại.';
}
