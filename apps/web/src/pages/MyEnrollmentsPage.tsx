import { useEffect, useMemo, useState } from 'react';
import { BookOpen, CalendarDays, Clock3, CreditCard, Search } from 'lucide-react';
import { Link } from 'react-router';
import { enrollmentApi } from '@/features/enrollments/api';
import type { EnrollmentStatus, EnrollmentView } from '@/features/enrollments/types';

type Filter = 'ALL' | 'ACTIVE' | 'UPCOMING' | 'COMPLETED';
export function MyEnrollmentsPage() {
  const [items, setItems] = useState<EnrollmentView[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [filter, setFilter] = useState<Filter>('ALL');
  const [search, setSearch] = useState('');
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void enrollmentApi
      .listMine(controller.signal)
      .then((data) => {
        setItems(data);
        setState('ready');
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) setState('error');
      });
    return () => controller.abort();
  }, [reload]);
  const filtered = useMemo(
    () =>
      items.filter((item) => {
        const text =
          `${item.classOffering.name} ${item.classOffering.code} ${item.classOffering.course.title}`.toLowerCase();
        if (!text.includes(search.trim().toLowerCase())) return false;
        if (filter === 'ACTIVE')
          return item.status === 'ACTIVE' && item.classOffering.status === 'IN_PROGRESS';
        if (filter === 'UPCOMING')
          return item.status === 'ACTIVE' && item.classOffering.status === 'OPEN';
        if (filter === 'COMPLETED')
          return item.status === 'COMPLETED' || item.classOffering.status === 'COMPLETED';
        return true;
      }),
    [filter, items, search],
  );
  return (
    <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <p className="eyebrow">Không gian học tập</p>
      <h1 className="page-title">Lớp học của tôi</h1>
      <p className="page-lead">
        Theo dõi lớp đang học, lớp sắp bắt đầu và trạng thái chờ thanh toán tại một nơi.
      </p>
      <div className="mt-8 flex flex-col gap-4 rounded-2xl border bg-white p-4 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap gap-2">
          {(
            [
              ['ALL', 'Tất cả'],
              ['ACTIVE', 'Đang học'],
              ['UPCOMING', 'Sắp bắt đầu'],
              ['COMPLETED', 'Hoàn thành'],
            ] as Array<[Filter, string]>
          ).map(([value, label]) => (
            <button
              className={`rounded-full px-4 py-2 text-sm font-semibold ${filter === value ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}
              key={value}
              onClick={() => setFilter(value)}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
        <label className="relative">
          <Search className="absolute left-3 top-2.5 text-slate-400" size={18} />
          <span className="sr-only">Tìm lớp học</span>
          <input
            className="rounded-lg border py-2 pl-10 pr-3"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Tìm lớp học"
            type="search"
            value={search}
          />
        </label>
      </div>
      {state === 'loading' ? (
        <div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3" role="status">
          {[1, 2, 3].map((item) => (
            <div className="h-80 animate-pulse rounded-2xl bg-slate-200" key={item} />
          ))}
        </div>
      ) : null}
      {state === 'error' ? (
        <div className="state-error mt-8">
          Không thể tải danh sách lớp.
          <button
            className="ml-3 font-semibold underline"
            onClick={() => setReload((value) => value + 1)}
            type="button"
          >
            Thử lại
          </button>
        </div>
      ) : null}
      {state === 'ready' && filtered.length === 0 ? (
        <div className="state-empty mt-8">
          <BookOpen className="mx-auto text-indigo-600" size={36} />
          <p className="mt-3">Chưa có lớp phù hợp với bộ lọc.</p>
          <Link className="mt-3 inline-block font-semibold text-indigo-700" to="/catalog">
            Khám phá khóa học
          </Link>
        </div>
      ) : null}
      {state === 'ready' && filtered.length > 0 ? (
        <div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((item) => (
            <ClassCard enrollment={item} key={item.id} />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function ClassCard({ enrollment }: { enrollment: EnrollmentView }) {
  const active = enrollment.status === 'ACTIVE';
  return (
    <article className="overflow-hidden rounded-2xl border bg-white shadow-sm">
      <div className="visual-indigo h-28 p-5 text-white">
        <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">
          {enrollment.classOffering.code}
        </span>
      </div>
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-indigo-700">
              {enrollment.classOffering.course.title}
            </p>
            <h2 className="mt-1 text-xl font-bold">{enrollment.classOffering.name}</h2>
          </div>
          <Status status={enrollment.status} />
        </div>
        <div className="mt-4 space-y-2 text-sm text-slate-600">
          <p className="flex items-center gap-2">
            <CalendarDays size={16} />
            {schedule(enrollment)}
          </p>
          <p className="flex items-center gap-2">
            <Clock3 size={16} />
            {enrollment.classOffering.instructor?.fullName ?? 'Giảng viên đang cập nhật'}
          </p>
        </div>
        {active ? (
          <>
            <div className="mt-5">
              <div className="flex justify-between text-xs font-semibold">
                <span>Tiến độ</span>
                <span>
                  {enrollment.progress.completedLessons}/{enrollment.progress.totalLessons} bài ·{' '}
                  {enrollment.progress.progressPercent}%
                </span>
              </div>
              <div className="mt-2 h-2 rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-indigo-600"
                  style={{ width: `${enrollment.progress.progressPercent}%` }}
                />
              </div>
            </div>
            <Link className="btn-primary mt-5 w-full" to={`/student/enrollments/${enrollment.id}`}>
              Vào lớp học
            </Link>
          </>
        ) : enrollment.status === 'PENDING_PAYMENT' ? (
          <div className="mt-5 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
            <p className="flex items-center gap-2 font-semibold">
              <CreditCard size={17} />
              Chờ thanh toán
            </p>
            <p className="mt-1">
              Nội dung lớp chưa được mở trong khi đăng ký đang chờ xác nhận thanh toán.
            </p>
          </div>
        ) : (
          <p className="mt-5 text-sm text-slate-500">
            Lớp hiện chưa mở quyền truy cập nội dung học.
          </p>
        )}
      </div>
    </article>
  );
}
function Status({ status }: { status: EnrollmentStatus }) {
  const label: Record<EnrollmentStatus, string> = {
    ACTIVE: 'Đang học',
    PENDING_PAYMENT: 'Chờ thanh toán',
    COMPLETED: 'Đã hoàn thành',
    DROPPED: 'Đã dừng học',
    CANCELLED: 'Đã hủy',
  };
  return (
    <span
      className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700' : status === 'PENDING_PAYMENT' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'}`}
    >
      {label[status]}
    </span>
  );
}
function schedule(enrollment: EnrollmentView) {
  const slots = enrollment.classOffering.scheduleSlots;
  if (!slots.length) return 'Lịch học đang cập nhật';
  const days: Record<number, string> = {
    1: 'T2',
    2: 'T3',
    3: 'T4',
    4: 'T5',
    5: 'T6',
    6: 'T7',
    7: 'CN',
  };
  const first = slots[0];
  return `${slots.map((slot) => days[slot.dayOfWeek] ?? `Ngày ${slot.dayOfWeek}`).join('/')} ${new Date(first.startTime).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })}`;
}
