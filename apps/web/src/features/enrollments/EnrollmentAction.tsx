import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { useAuth } from '@/features/auth/auth-context';
import { safeReturnUrl } from '@/features/auth/return-url';
import { ApiError } from '@/lib/api-client';
import { enrollmentApi } from './api';
import { EnrollmentCheckoutModal } from './EnrollmentCheckoutModal';
import type { EnrollmentView } from './types';

export function EnrollmentAction({
  classOfferingId,
  disabledReason,
  w07Managed = false,
}: {
  classOfferingId: string;
  disabledReason?: string;
  w07Managed?: boolean;
}) {
  const { user, isLoading, refreshUser } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<EnrollmentView | null>(null);
  const [existing, setExisting] = useState<EnrollmentView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [refreshingCheckout, setRefreshingCheckout] = useState(false);
  const [retryingHold, setRetryingHold] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const returnUrl = safeReturnUrl(`${location.pathname}${location.search}${location.hash}`);

  const enrollment = result ?? existing;

  useEffect(() => {
    if (user?.role !== 'STUDENT') return;
    const controller = new AbortController();
    void enrollmentApi
      .listMine(controller.signal)
      .then((items) =>
        setExisting(
          items.find(
            (item) =>
              item.classOffering.id === classOfferingId &&
              item.status !== 'CANCELLED' &&
              item.status !== 'DROPPED',
          ) ?? null,
        ),
      )
      .catch(() => undefined);
    return () => controller.abort();
  }, [classOfferingId, user?.role]);

  useEffect(() => {
    if (!checkoutOpen || enrollment?.status !== 'PENDING_PAYMENT') return;
    const enrollmentId = enrollment.id;
    let cancelled = false;
    const timer = window.setInterval(() => {
      void enrollmentApi
        .detail(enrollmentId)
        .then((latest) => {
          if (!cancelled) setResult(latest);
        })
        .catch(() => undefined);
    }, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [checkoutOpen, enrollment?.id, enrollment?.status]);

  if (isLoading)
    return (
      <button className="btn-secondary mt-5" disabled type="button">
        Đang kiểm tra...
      </button>
    );
  if(w07Managed && false)return <div className="mt-5 space-y-3"><Link className="btn-primary" to={user?'/admissions?classId='+classOfferingId:'/login?'+new URLSearchParams({returnUrl:'/admissions?classId='+classOfferingId}).toString()}>Yêu cầu nhập học</Link></div>;
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
  const handleRefreshCheckout = async () => {
    if (!enrollment) return;
    setRefreshingCheckout(true);
    setCheckoutError(null);
    try {
      setResult(await enrollmentApi.detail(enrollment.id));
    } catch {
      setCheckoutError('Chưa thể kiểm tra trạng thái thanh toán lúc này.');
    } finally {
      setRefreshingCheckout(false);
    }
  };

  const handleRetryHold = async () => {
    if (!enrollment) return;
    setRetryingHold(true);
    setCheckoutError(null);
    try {
      await enrollmentApi.retryHold(enrollment.id);
      setResult(await enrollmentApi.detail(enrollment.id));
    } catch (requestError) {
      setCheckoutError(messageFor(requestError));
    } finally {
      setRetryingHold(false);
    }
  };

  if (enrollment)
    return (
      <>
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
          {enrollment.status === 'ACTIVE' ? (
            <Link
              className="mt-3 inline-block font-semibold underline"
              to={`/classroom/${enrollment.classOffering.id}`}
            >
              Vào lớp học
            </Link>
          ) : (
            <div className="mt-3 space-y-2">
              <button
                className="btn-primary w-full text-center text-sm"
                onClick={() => setCheckoutOpen(true)}
                type="button"
              >
                {`Mở pop-up thanh toán${enrollment.activeOrder ? ` (${enrollment.activeOrder.paymentCode})` : ''}`}
              </button>
              <Link
                className="block text-center text-xs font-medium text-emerald-900 underline"
                to={`/student/finance?enrollmentId=${encodeURIComponent(enrollment.id)}`}
              >
                Xem tại trang Tài chính học viên
              </Link>
            </div>
          )}
        </div>
        <EnrollmentCheckoutModal
          open={checkoutOpen}
          enrollment={enrollment}
          learnerName={user.fullName}
          learnerEmail={user.email}
          onClose={() => setCheckoutOpen(false)}
          onRefresh={() => void handleRefreshCheckout()}
          onRetryHold={() => void handleRetryHold()}
          refreshing={refreshingCheckout}
          retrying={retryingHold}
          error={checkoutError}
        />
      </>
    );

  const enroll = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setSubmitting(true);
    setError(null);
    try {
      const created = await enrollmentApi.create(classOfferingId, {
        entrySource:
          new URLSearchParams(window.location.search).get('from') === 'placement'
            ? 'PLACEMENT_MATCH'
            : 'CATALOG_DIRECT',
      });
      setResult(created);
      if (created.status === 'PENDING_PAYMENT') {
        setCheckoutOpen(true);
      }
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
