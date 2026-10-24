import { FormEvent, useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Check, CircleAlert, Search, Users } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { adminApi } from '@/features/admin/api';
import { adminErrorMessage } from '@/features/admin/errors';
import { modalityLabel, readinessReasonLabel, statusLabel } from '@/features/admin/labels';
import type {
  AdminClassOffering,
  AdminRoster,
  AdminRosterRow,
  EnrollmentStatus,
  InstructorOption,
  OperationalReadinessReason,
  RosterQuery,
  ScheduleSlotInput,
} from '@/features/admin/types';
import { useAdminSessionExpiry } from '@/features/admin/use-admin-session-expiry';
import { WEEKDAY_OPTIONS, weekdayLabel } from '@/features/classes/schedule';
import { EnrollmentStatusBadge } from '@/features/enrollments/EnrollmentStatusBadge';
import { enrollmentStatusLabel } from '@/features/enrollments/display';

const controlClass =
  'mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200';
const buttonClass =
  'rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50';
const cardClass = 'rounded-2xl border border-slate-200 bg-white p-5 shadow-sm';
const emptySchedule: ScheduleSlotInput = {
  dayOfWeek: 1,
  startTime: '08:00',
  endTime: '10:00',
  locationText: '',
  meetingUrl: '',
};
const rosterStatuses: EnrollmentStatus[] = [
  'ACTIVE',
  'PENDING_PAYMENT',
  'COMPLETED',
  'DROPPED',
  'CANCELLED',
];

type PageState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; offering: AdminClassOffering };

export function AdminClassOfferingOperationsPage() {
  const { classOfferingId = '' } = useParams();
  const redirectExpiredSession = useAdminSessionExpiry();
  const [state, setState] = useState<PageState>({ status: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  const [notice, setNotice] = useState('');
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);

  const fetchOffering = useCallback(
    (signal?: AbortSignal) => adminApi.offerings.get(classOfferingId, signal),
    [classOfferingId],
  );
  const handleOfferingError = useCallback(
    async (error: unknown) => {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      if (await redirectExpiredSession(error)) return;
      setState({ status: 'error', message: adminErrorMessage(error) });
    },
    [redirectExpiredSession],
  );
  const refreshOffering = useCallback(async () => {
    try {
      const offering = await fetchOffering();
      setState({ status: 'ready', offering });
    } catch (error: unknown) {
      await handleOfferingError(error);
    }
  }, [fetchOffering, handleOfferingError]);
  const reload = useCallback(() => {
    setState({ status: 'loading' });
    setReloadKey((value) => value + 1);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void fetchOffering(controller.signal)
      .then((offering) => setState({ status: 'ready', offering }))
      .catch(handleOfferingError);
    return () => controller.abort();
  }, [fetchOffering, handleOfferingError, reloadKey]);

  const mutate = async (work: () => Promise<unknown>, success: string): Promise<boolean> => {
    setBusy(true);
    setActionError('');
    setNotice('');
    try {
      await work();
      setNotice(success);
      reload();
      return true;
    } catch (error) {
      if (!(await redirectExpiredSession(error))) setActionError(adminErrorMessage(error));
      return false;
    } finally {
      setBusy(false);
    }
  };

  if (state.status === 'loading') {
    return (
      <p className={cardClass} role="status">
        Đang tải thông tin vận hành lớp...
      </p>
    );
  }
  if (state.status === 'error') {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6" role="alert">
        <p className="font-semibold text-red-800">{state.message}</p>
        <button
          className="mt-3 rounded-lg border border-red-300 px-3 py-2"
          onClick={reload}
          type="button"
        >
          Thử lại
        </button>
      </div>
    );
  }
  const { offering } = state;
  return (
    <section className="space-y-6">
      <header>
        <Link
          className="btn-secondary mb-4 inline-flex"
          to={`/admin/class-offerings/${classOfferingId}/completion`}
        >
          Tiêu chí hoàn thành khóa học
        </Link>
        <Link
          className="inline-flex items-center gap-1 text-sm font-semibold text-indigo-700"
          to="/admin/class-offerings"
        >
          <ArrowLeft size={16} /> Quay lại danh sách lớp
        </Link>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-indigo-600">
              Vận hành lớp
            </p>
            <h1 className="mt-1 text-3xl font-black tracking-tight">{offering.name}</h1>
            <p className="mt-2 text-slate-600">
              {offering.code} · {offering.course.title}
            </p>
          </div>
          <Link
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold"
            to={`/admin/class-offerings/${offering.id}/edit`}
          >
            Chỉnh sửa thông tin
          </Link>
        </div>
        <dl className="mt-5 grid gap-3 rounded-2xl bg-slate-900 p-4 text-sm text-white sm:grid-cols-2 lg:grid-cols-4">
          <Summary label="Trạng thái" value={statusLabel(offering.status)} />
          <Summary label="Đăng ký" value={registrationLabel(offering.registrationState)} />
          <Summary label="Hình thức" value={modalityLabel(offering.modality)} />
          <Summary
            label="Sĩ số"
            value={`${offering.registeredCount}/${offering.maxStudents ?? 'Không giới hạn'}`}
          />
        </dl>
      </header>
      {notice ? (
        <p
          className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-emerald-800"
          role="status"
        >
          {notice}
        </p>
      ) : null}
      {actionError ? (
        <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-red-800" role="alert">
          {actionError}
        </p>
      ) : null}

      <ReadinessCard
        busy={busy}
        offering={offering}
        onOpen={() =>
          void mutate(
            () => adminApi.offerings.update(offering.id, { status: 'OPEN' }),
            'Lớp đã được mở.',
          )
        }
      />
      <div className="grid gap-6 xl:grid-cols-2">
        <InstructorCard
          busy={busy}
          key={offering.instructorId ?? 'unassigned'}
          offering={offering}
          onMutate={mutate}
          redirectExpiredSession={redirectExpiredSession}
        />
        <ScheduleCard busy={busy} offering={offering} onMutate={mutate} />
      </div>
      <RosterCard
        classOfferingId={offering.id}
        onOfferingMutated={refreshOffering}
        redirectExpiredSession={redirectExpiredSession}
      />
    </section>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-slate-300">{label}</dt>
      <dd className="mt-1 font-semibold">{value}</dd>
    </div>
  );
}

const readinessChecks: Array<{
  label: string;
  reasons: OperationalReadinessReason[];
}> = [
  { label: 'Khóa học đã xuất bản', reasons: ['COURSE_UNPUBLISHED'] },
  {
    label: 'Đã phân công giảng viên đang hoạt động',
    reasons: ['INSTRUCTOR_MISSING', 'INSTRUCTOR_INACTIVE'],
  },
  {
    label: 'Đã có ít nhất một lịch học hợp lệ',
    reasons: ['SCHEDULE_MISSING', 'SCHEDULE_DESTINATION_MISSING'],
  },
  { label: 'Đã có ngày bắt đầu và kết thúc lớp hợp lệ', reasons: ['CLASS_DATES_MISSING'] },
];

function ReadinessCard({
  offering,
  busy,
  onOpen,
}: {
  offering: AdminClassOffering;
  busy: boolean;
  onOpen: () => void;
}) {
  const missing = new Set(offering.operationalReadiness.missing);
  return (
    <section className={cardClass} aria-labelledby="readiness-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold" id="readiness-heading">
            Mức độ sẵn sàng
          </h2>
          <p
            className={`mt-1 text-sm font-semibold ${offering.operationalReadiness.isReady ? 'text-emerald-700' : 'text-amber-700'}`}
          >
            {offering.status === 'DRAFT'
              ? offering.operationalReadiness.isReady
                ? 'Sẵn sàng vận hành'
                : 'Cần hoàn thiện'
              : statusLabel(offering.status)}
          </p>
        </div>
        {offering.status === 'DRAFT' && offering.operationalReadiness.isReady ? (
          <button className={buttonClass} disabled={busy} onClick={onOpen} type="button">
            Mở lớp
          </button>
        ) : null}
      </div>
      <ul className="mt-4 grid gap-2 md:grid-cols-2">
        {readinessChecks.map((item) => {
          const complete = item.reasons.every((reason) => !missing.has(reason));
          return (
            <li
              className={`flex items-center gap-2 rounded-xl border p-3 text-sm ${complete ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-900'}`}
              key={item.label}
            >
              {complete ? <Check size={17} /> : <CircleAlert size={17} />}
              {item.label}
            </li>
          );
        })}
      </ul>
      {offering.operationalReadiness.missing.includes('SCHEDULE_DESTINATION_MISSING') ? (
        <p className="mt-3 text-sm text-amber-800">
          {readinessReasonLabel('SCHEDULE_DESTINATION_MISSING')}
        </p>
      ) : null}
    </section>
  );
}

function InstructorCard({
  offering,
  busy,
  onMutate,
  redirectExpiredSession,
}: {
  offering: AdminClassOffering;
  busy: boolean;
  onMutate: (work: () => Promise<unknown>, success: string) => Promise<boolean>;
  redirectExpiredSession: (error: unknown) => Promise<boolean>;
}) {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<InstructorOption[]>([]);
  const [selected, setSelected] = useState(offering.instructorId ?? '');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void adminApi.offerings
      .instructorOptions({ search: query || undefined, page: 1, limit: 50 }, controller.signal)
      .then((result) => {
        setOptions(result.data);
        setError(false);
      })
      .catch(async (cause: unknown) => {
        if (cause instanceof DOMException && cause.name === 'AbortError') return;
        if (!(await redirectExpiredSession(cause))) setError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [query, redirectExpiredSession]);
  const locked = offering.status === 'COMPLETED' || offering.status === 'CANCELLED';
  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setQuery(search.trim());
  };
  const assign = () => {
    const target = options.find(({ id }) => id === selected);
    if (!target || !window.confirm(`Phân công ${target.fullName} phụ trách lớp ${offering.name}?`))
      return;
    void onMutate(
      () => adminApi.offerings.assignInstructor(offering.id, target.id),
      'Đã cập nhật giảng viên phụ trách.',
    );
  };
  const unassign = () => {
    if (
      !window.confirm(
        `Gỡ phân công khỏi lớp ${offering.name}? Giảng viên sẽ không còn thấy lớp này.`,
      )
    )
      return;
    void onMutate(
      () => adminApi.offerings.assignInstructor(offering.id, null),
      'Đã gỡ phân công giảng viên.',
    );
  };
  return (
    <section className={cardClass} aria-labelledby="instructor-heading">
      <h2 className="text-lg font-bold" id="instructor-heading">
        Giảng viên phụ trách
      </h2>
      {offering.instructor ? (
        <div className="mt-3 rounded-xl bg-indigo-50 p-3">
          <p className="font-semibold">{offering.instructor.fullName}</p>
          <p className="text-sm text-slate-600">{offering.instructor.email}</p>
        </div>
      ) : (
        <p className="mt-3 rounded-xl bg-slate-50 p-3 text-slate-600">Chưa phân công</p>
      )}
      <form className="mt-4 flex gap-2" onSubmit={submitSearch}>
        <label className="flex-1">
          <span className="text-sm font-semibold">Tìm giảng viên</span>
          <input
            className={controlClass}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Tên hoặc email"
            value={search}
          />
        </label>
        <button className="mt-7 rounded-xl border px-3" type="submit">
          <Search size={18} />
          <span className="sr-only">Tìm</span>
        </button>
      </form>
      {loading ? (
        <p className="mt-3 text-sm text-slate-500" role="status">
          Đang tải giảng viên...
        </p>
      ) : null}
      {error ? (
        <p className="mt-3 text-sm text-red-700" role="alert">
          Không thể tải danh sách giảng viên.
        </p>
      ) : null}
      {!loading && !error && options.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">Không có giảng viên phù hợp.</p>
      ) : null}
      {options.length ? (
        <label className="mt-3 block">
          <span className="text-sm font-semibold">Giảng viên đang hoạt động</span>
          <select
            className={controlClass}
            disabled={locked}
            onChange={(event) => setSelected(event.target.value)}
            value={selected}
          >
            <option value="">Chọn giảng viên</option>
            {options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.fullName} · {option.email}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          className={buttonClass}
          disabled={busy || locked || !selected || selected === offering.instructorId}
          onClick={assign}
          type="button"
        >
          {offering.instructor ? 'Thay đổi' : 'Phân công giảng viên'}
        </button>
        {offering.instructor && ['DRAFT', 'OPEN'].includes(offering.status) ? (
          <button
            className="rounded-xl border border-red-300 px-4 py-2 text-sm font-semibold text-red-700"
            disabled={busy}
            onClick={unassign}
            type="button"
          >
            Gỡ phân công
          </button>
        ) : null}
      </div>
    </section>
  );
}

function ScheduleCard({
  offering,
  busy,
  onMutate,
}: {
  offering: AdminClassOffering;
  busy: boolean;
  onMutate: (work: () => Promise<unknown>, success: string) => Promise<boolean>;
}) {
  const [form, setForm] = useState<ScheduleSlotInput>(emptySchedule);
  const [editingId, setEditingId] = useState<string | null>(null);
  const locked = offering.status === 'COMPLETED' || offering.status === 'CANCELLED';
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const work = editingId
      ? () => adminApi.offerings.updateScheduleSlot(offering.id, editingId, form)
      : () => adminApi.offerings.createScheduleSlot(offering.id, form);
    void onMutate(work, editingId ? 'Đã cập nhật lịch học.' : 'Đã thêm lịch học.').then(
      (succeeded) => {
        if (succeeded) {
          setEditingId(null);
          setForm(emptySchedule);
        }
      },
    );
  };
  return (
    <section className={cardClass} aria-labelledby="schedule-heading">
      <h2 className="text-lg font-bold" id="schedule-heading">
        Lịch học
      </h2>
      <p className="mt-1 text-sm text-slate-500">
        Giờ học được giữ theo giờ trên lịch tuần, không chuyển múi giờ.
      </p>
      <div className="mt-4 space-y-2">
        {offering.scheduleSlots.map((slot) => (
          <article className="rounded-xl border p-3" key={slot.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold">
                  {weekdayLabel(slot.dayOfWeek)} · {slot.startTime}–{slot.endTime}
                </p>
                <p className="text-sm text-slate-600">
                  {slot.locationText || 'Học trực tuyến'}
                  {slot.meetingUrl ? ` · ${slot.meetingUrl}` : ''}
                </p>
              </div>
              {!locked ? (
                <div className="flex gap-3 text-sm">
                  <button
                    className="font-semibold text-indigo-700"
                    onClick={() => {
                      setEditingId(slot.id);
                      setForm({
                        dayOfWeek: slot.dayOfWeek,
                        startTime: slot.startTime,
                        endTime: slot.endTime,
                        locationText: slot.locationText ?? '',
                        meetingUrl: slot.meetingUrl ?? '',
                      });
                    }}
                    type="button"
                  >
                    Chỉnh sửa
                  </button>
                  <button
                    className="font-semibold text-red-700"
                    onClick={() => {
                      if (window.confirm('Xóa lịch học này?'))
                        void onMutate(
                          () => adminApi.offerings.deleteScheduleSlot(offering.id, slot.id),
                          'Đã xóa lịch học.',
                        );
                    }}
                    type="button"
                  >
                    Xóa
                  </button>
                </div>
              ) : null}
            </div>
          </article>
        ))}
        {!offering.scheduleSlots.length ? (
          <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">Chưa có lịch học.</p>
        ) : null}
      </div>
      {!locked ? (
        <form className="mt-5 grid gap-3 sm:grid-cols-2" onSubmit={submit}>
          <label>
            <span className="text-sm font-semibold">Ngày trong tuần</span>
            <select
              className={controlClass}
              onChange={(event) =>
                setForm((current) => ({ ...current, dayOfWeek: Number(event.target.value) }))
              }
              value={form.dayOfWeek}
            >
              {WEEKDAY_OPTIONS.map((day) => (
                <option key={day.value} value={day.value}>
                  {day.label} · {day.longLabel}
                </option>
              ))}
            </select>
          </label>
          <span className="hidden sm:block" />
          <label>
            <span className="text-sm font-semibold">Giờ bắt đầu</span>
            <input
              className={controlClass}
              onChange={(event) =>
                setForm((current) => ({ ...current, startTime: event.target.value }))
              }
              required
              type="time"
              value={form.startTime}
            />
          </label>
          <label>
            <span className="text-sm font-semibold">Giờ kết thúc</span>
            <input
              className={controlClass}
              onChange={(event) =>
                setForm((current) => ({ ...current, endTime: event.target.value }))
              }
              required
              type="time"
              value={form.endTime}
            />
          </label>
          <label>
            <span className="text-sm font-semibold">Phòng / địa điểm</span>
            <input
              className={controlClass}
              onChange={(event) =>
                setForm((current) => ({ ...current, locationText: event.target.value }))
              }
              value={form.locationText ?? ''}
            />
          </label>
          <label>
            <span className="text-sm font-semibold">Link học trực tuyến</span>
            <input
              className={controlClass}
              onChange={(event) =>
                setForm((current) => ({ ...current, meetingUrl: event.target.value }))
              }
              placeholder="https://..."
              type="url"
              value={form.meetingUrl ?? ''}
            />
          </label>
          <div className="flex gap-2 sm:col-span-2">
            <button
              className={buttonClass}
              disabled={busy || (!form.locationText?.trim() && !form.meetingUrl?.trim())}
              type="submit"
            >
              {editingId ? 'Lưu lịch học' : 'Thêm lịch'}
            </button>
            {editingId ? (
              <button
                className="rounded-xl border px-4 py-2 text-sm font-semibold"
                onClick={() => {
                  setEditingId(null);
                  setForm(emptySchedule);
                }}
                type="button"
              >
                Hủy chỉnh sửa
              </button>
            ) : null}
          </div>
        </form>
      ) : null}
    </section>
  );
}

function RosterCard({
  classOfferingId,
  onOfferingMutated,
  redirectExpiredSession,
}: {
  classOfferingId: string;
  onOfferingMutated: () => Promise<void>;
  redirectExpiredSession: (error: unknown) => Promise<boolean>;
}) {
  const [query, setQuery] = useState<RosterQuery>({ page: 1, limit: 20 });
  const [search, setSearch] = useState('');
  const [data, setData] = useState<AdminRoster | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const reloadRoster = () => {
    setLoading(true);
    setReloadKey((value) => value + 1);
  };
  useEffect(() => {
    const controller = new AbortController();
    void adminApi.offerings
      .roster(classOfferingId, query, controller.signal)
      .then((result) => {
        setData(result);
        setError('');
      })
      .catch(async (cause: unknown) => {
        if (cause instanceof DOMException && cause.name === 'AbortError') return;
        if (!(await redirectExpiredSession(cause))) setError(adminErrorMessage(cause));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [classOfferingId, query, redirectExpiredSession, reloadKey]);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setQuery((current) => ({ ...current, search: search.trim() || undefined, page: 1 }));
  };
  const mutate = async (row: AdminRosterRow, status: EnrollmentStatus) => {
    if (
      !window.confirm(
        `${enrollmentStatusLabel(status)} học viên ${row.learner.fullName}? Thao tác này có thể thay đổi số chỗ còn lại.`,
      )
    )
      return;
    try {
      await adminApi.offerings.updateRosterStatus(classOfferingId, row.id, status);
      reloadRoster();
      await onOfferingMutated();
    } catch (cause) {
      if (!(await redirectExpiredSession(cause))) setError(adminErrorMessage(cause));
    }
  };
  const actions = (row: AdminRosterRow) =>
    row.status === 'ACTIVE' ? (
      <div className="flex flex-wrap gap-2">
        <button
          className="font-semibold text-amber-700"
          onClick={() => void mutate(row, 'DROPPED')}
          type="button"
        >
          Cho thôi học
        </button>
        <button
          className="font-semibold text-red-700"
          onClick={() => void mutate(row, 'CANCELLED')}
          type="button"
        >
          Hủy ghi danh
        </button>
      </div>
    ) : row.status === 'PENDING_PAYMENT' ? (
      <button
        className="font-semibold text-red-700"
        onClick={() => void mutate(row, 'CANCELLED')}
        type="button"
      >
        Hủy ghi danh
      </button>
    ) : (
      <span className="text-slate-400">Không có thao tác</span>
    );
  return (
    <section className={cardClass} aria-labelledby="roster-heading">
      <div className="flex items-center gap-2">
        <Users className="text-indigo-600" size={21} />
        <h2 className="text-lg font-bold" id="roster-heading">
          Học viên trong lớp
        </h2>
      </div>
      {data ? (
        <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-5">
          <SummaryTile label="Tổng ghi danh" value={data.summary.total} />
          <SummaryTile label="Đang học" value={data.summary.active} />
          <SummaryTile label="Chờ thanh toán" value={data.summary.pendingPayment} />
          <SummaryTile label="Hoàn thành" value={data.summary.completed} />
          <SummaryTile label="Rời lớp / Đã hủy" value={data.summary.droppedOrCancelled} />
        </dl>
      ) : null}
      <form
        className="mt-5 grid gap-3 sm:grid-cols-[1fr_220px_auto] sm:items-end"
        onSubmit={submit}
      >
        <label>
          <span className="text-sm font-semibold">Tìm học viên</span>
          <input
            className={controlClass}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Tên hoặc email"
            value={search}
          />
        </label>
        <label>
          <span className="text-sm font-semibold">Trạng thái ghi danh</span>
          <select
            className={controlClass}
            onChange={(event) => {
              setLoading(true);
              setQuery((current) => ({
                ...current,
                status: (event.target.value || undefined) as EnrollmentStatus | undefined,
                page: 1,
              }));
            }}
            value={query.status ?? ''}
          >
            <option value="">Tất cả</option>
            {rosterStatuses.map((status) => (
              <option key={status} value={status}>
                {enrollmentStatusLabel(status)}
              </option>
            ))}
          </select>
        </label>
        <button className={buttonClass} type="submit">
          <Search className="inline" size={16} /> Tìm
        </button>
      </form>
      {loading ? (
        <p className="mt-5 text-sm text-slate-500" role="status">
          Đang tải danh sách học viên...
        </p>
      ) : null}
      {error ? (
        <div className="mt-5 rounded-xl bg-red-50 p-4 text-red-800" role="alert">
          <p>{error}</p>
          <button className="mt-2 font-semibold underline" onClick={reloadRoster} type="button">
            Thử lại
          </button>
        </div>
      ) : null}
      {!loading && !error && data?.data.length === 0 ? (
        <p className="mt-5 rounded-xl bg-slate-50 p-5 text-center text-slate-600">
          Không có học viên phù hợp.
        </p>
      ) : null}
      {!loading && !error && data?.data.length ? (
        <>
          <div className="mt-5 hidden overflow-x-auto md:block">
            <table className="w-full text-left text-sm">
              <thead className="border-y bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-3">Học viên</th>
                  <th className="px-3 py-3">Trạng thái</th>
                  <th className="px-3 py-3">Ngày ghi danh</th>
                  <th className="px-3 py-3">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.data.map((row) => (
                  <tr key={row.id}>
                    <td className="px-3 py-3">
                      <p className="font-semibold">{row.learner.fullName}</p>
                      <p className="text-xs text-slate-500">{row.learner.email}</p>
                    </td>
                    <td className="px-3 py-3">
                      <EnrollmentStatusBadge status={row.status} />
                    </td>
                    <td className="px-3 py-3">
                      {new Date(row.enrolledAt).toLocaleDateString('vi-VN')}
                    </td>
                    <td className="px-3 py-3">{actions(row)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-5 grid gap-3 md:hidden">
            {data.data.map((row) => (
              <article className="rounded-xl border p-4" key={row.id}>
                <p className="font-semibold">{row.learner.fullName}</p>
                <p className="text-sm text-slate-500">{row.learner.email}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                  <EnrollmentStatusBadge status={row.status} />
                  <span aria-hidden="true">·</span>
                  <span>{new Date(row.enrolledAt).toLocaleDateString('vi-VN')}</span>
                </div>
                <div className="mt-3 text-sm">{actions(row)}</div>
              </article>
            ))}
          </div>
        </>
      ) : null}
      {data && data.meta.totalPages > 1 ? (
        <div className="mt-4 flex items-center justify-end gap-3">
          <button
            className="rounded-lg border px-3 py-2 disabled:opacity-50"
            disabled={data.meta.page <= 1}
            onClick={() => {
              setLoading(true);
              setQuery((current) => ({ ...current, page: data.meta.page - 1 }));
            }}
            type="button"
          >
            Trang trước
          </button>
          <span className="text-sm">
            Trang {data.meta.page}/{data.meta.totalPages}
          </span>
          <button
            className="rounded-lg border px-3 py-2 disabled:opacity-50"
            disabled={data.meta.page >= data.meta.totalPages}
            onClick={() => {
              setLoading(true);
              setQuery((current) => ({ ...current, page: data.meta.page + 1 }));
            }}
            type="button"
          >
            Trang sau
          </button>
        </div>
      ) : null}
    </section>
  );
}

function SummaryTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <dt className="text-slate-500">{label}</dt>
      <dd className="mt-1 text-lg font-bold">{value}</dd>
    </div>
  );
}

function registrationLabel(value: AdminClassOffering['registrationState']): string {
  return {
    AVAILABLE: 'Đang nhận đăng ký',
    FULL: 'Đã đủ chỗ',
    UPCOMING: 'Sắp mở đăng ký',
    CLOSED: 'Đã đóng đăng ký',
  }[value];
}
