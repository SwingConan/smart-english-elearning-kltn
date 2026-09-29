import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  CalendarDays,
  Clock3,
  GraduationCap,
  MapPin,
  Monitor,
  Users,
} from 'lucide-react';
import { Link, useParams } from 'react-router';
import { catalogApi } from '@/features/catalog/api';
import type { PublicClassOffering, PublicCourse } from '@/features/catalog/types';
import { EnrollmentAction } from '@/features/enrollments/EnrollmentAction';
import { ApiError } from '@/lib/api-client';

type OfferingDetail = PublicClassOffering & {
  course: Pick<PublicCourse, 'id' | 'title' | 'slug' | 'description' | 'level' | 'skillScope'>;
};
type State =
  | { status: 'loading' }
  | { status: 'ready'; offering: OfferingDetail }
  | { status: 'not-found' | 'error' };
const date = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'long' });
const money = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' });

export function ClassOfferingDetailPage() {
  const { id = '' } = useParams();
  const [state, setState] = useState<State>({ status: 'loading' });
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void catalogApi
      .offeringDetail(id, controller.signal)
      .then((offering) => setState({ status: 'ready', offering: offering as OfferingDetail }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setState({
          status: error instanceof ApiError && error.status === 404 ? 'not-found' : 'error',
        });
      });
    return () => controller.abort();
  }, [id, reload]);
  if (state.status === 'loading')
    return (
      <div className="section-shell" role="status">
        <div className="h-96 animate-pulse rounded-3xl bg-slate-200" />
      </div>
    );
  if (state.status === 'not-found')
    return (
      <Notice
        title="Không tìm thấy lớp học"
        text="Lớp chưa được công bố hoặc đường dẫn không chính xác."
      />
    );
  if (state.status === 'error')
    return (
      <section className="section-shell">
        <div className="state-error">
          Không thể tải thông tin lớp.
          <button
            className="ml-3 font-semibold underline"
            onClick={() => setReload((value) => value + 1)}
            type="button"
          >
            Thử lại
          </button>
        </div>
      </section>
    );
  if (state.status !== 'ready') return null;
  const { offering } = state;
  const disabledReason =
    offering.registrationState === 'FULL'
      ? 'Lớp đã đủ số học viên ACTIVE.'
      : offering.registrationState === 'UPCOMING'
        ? 'Lớp chưa đến thời gian nhận đăng ký.'
        : offering.registrationState === 'CLOSED'
          ? 'Lớp không còn nhận đăng ký.'
          : undefined;
  return (
    <article className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
      <Link
        className="inline-flex items-center gap-2 text-sm font-semibold text-indigo-700"
        to={`/catalog/${offering.course.slug}`}
      >
        <ArrowLeft size={16} />
        {offering.course.title}
      </Link>
      <div className="mt-7 grid gap-8 lg:grid-cols-[1fr_380px]">
        <div>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-bold text-indigo-700">
              {offering.code}
            </span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
              {offering.modality}
            </span>
          </div>
          <h1 className="mt-4 text-4xl font-bold">{offering.name}</h1>
          <p className="mt-3 text-lg text-slate-600">
            Thuộc chương trình{' '}
            <Link className="font-semibold text-indigo-700" to={`/catalog/${offering.course.slug}`}>
              {offering.course.title}
            </Link>
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <Info
              icon={GraduationCap}
              label="Giảng viên"
              value={offering.instructor?.fullName ?? 'Đang cập nhật'}
            />
            <Info icon={Monitor} label="Hình thức" value={offering.modality} />
            <Info
              icon={CalendarDays}
              label="Thời gian lớp"
              value={`${formatDate(offering.classStart)} – ${formatDate(offering.classEnd)}`}
            />
            <Info
              icon={Clock3}
              label="Thời lượng"
              value={`${offering.totalSessions ?? '—'} buổi · ${offering.totalPeriods ?? '—'} tiết`}
            />
            <Info
              icon={Users}
              label="Sĩ số"
              value={`${offering.registeredCount}/${offering.maxStudents ?? 'Không giới hạn'} · ${offering.isFull ? 'Đã đầy' : `${offering.remainingSeats ?? '—'} chỗ còn lại`}`}
            />
            <Info icon={MapPin} label="Lịch học" value={formatSchedule(offering)} />
          </div>
          <section className="mt-10">
            <h2 className="text-2xl font-bold">Tóm tắt chương trình</h2>
            <p className="mt-3 leading-7 text-slate-600">{offering.course.description}</p>
            <Link
              className="mt-4 inline-block font-semibold text-indigo-700"
              to={`/catalog/${offering.course.slug}`}
            >
              Xem curriculum đầy đủ →
            </Link>
          </section>
        </div>
        <aside className="self-start rounded-3xl border bg-white p-7 shadow-lg lg:sticky lg:top-28">
          <p className="text-sm font-semibold text-slate-500">Học phí</p>
          <p className="mt-2 text-3xl font-bold text-indigo-700">
            {offering.pricingType === 'FREE'
              ? 'Miễn phí'
              : offering.tuitionFeeVnd
                ? money.format(offering.tuitionFeeVnd)
                : 'Đang cập nhật'}
          </p>
          <div className="mt-5 rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">
            {offering.pricingType === 'FREE'
              ? 'Đăng ký hợp lệ sẽ tạo Enrollment ACTIVE.'
              : 'Đăng ký sẽ tạo trạng thái PENDING_PAYMENT. M02 không tích hợp cổng thanh toán giả.'}
          </div>
          <EnrollmentAction classOfferingId={offering.id} disabledReason={disabledReason} />
        </aside>
      </div>
    </article>
  );
}

function Info({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: string }) {
  return (
    <div className="rounded-2xl border bg-white p-5">
      <Icon className="text-indigo-600" size={21} />
      <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 font-semibold">{value}</p>
    </div>
  );
}
function formatDate(value: string | null) {
  if (!value) return 'Đang cập nhật';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 'Đang cập nhật' : date.format(parsed);
}
function formatSchedule(offering: PublicClassOffering) {
  if (!offering.scheduleSlots.length) return 'Đang cập nhật';
  const days: Record<number, string> = {
    1: 'Thứ Hai',
    2: 'Thứ Ba',
    3: 'Thứ Tư',
    4: 'Thứ Năm',
    5: 'Thứ Sáu',
    6: 'Thứ Bảy',
    7: 'Chủ nhật',
  };
  return offering.scheduleSlots
    .map(
      (slot) =>
        `${days[slot.dayOfWeek] ?? `Ngày ${slot.dayOfWeek}`} ${new Date(slot.startTime).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })}–${new Date(slot.endTime).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })}${slot.locationText ? ` · ${slot.locationText}` : ''}`,
    )
    .join('; ');
}
function Notice({ title, text }: { title: string; text: string }) {
  return (
    <section className="section-shell text-center">
      <h1 className="text-3xl font-bold">{title}</h1>
      <p className="mt-3 text-slate-600">{text}</p>
      <Link className="btn-primary mt-6" to="/catalog">
        Xem danh mục
      </Link>
    </section>
  );
}
