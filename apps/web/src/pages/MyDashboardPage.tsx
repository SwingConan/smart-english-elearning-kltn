import { classCodeLabel } from '@/features/demo/presentation';
import { learnerClassLabel } from '@/features/enrollments/presentation';
import { type ConsultationBooking } from './ConsultationsPage';
import { useEffect, useState } from 'react';
import { Link, useSearchParams, useParams } from 'react-router';
import { apiFetch } from '@/lib/api-client';
import {
  accountLabel,
  classLabel,
  isTechnicalQaRecord,
} from '@/features/catalog/record-presentation';
import { SourceRecord } from '@/features/catalog/SourceRecord';
import { useAuth } from '@/features/auth/auth-context';
import { SessionEngagementPanel, W06Notifications } from './SessionEngagementPage';
import { button, field, type ClassCard, type CalendarEvent } from '@/features/class-lms/api';
import {
  monthCells,
  schoolDay,
  schoolMonth,
  schoolTime,
  shiftMonth,
} from '@/features/class-lms/month';
import {
  calendarItems,
  eventsOnDay,
  DayPreview,
  CalendarDayModal,
  CalendarLegend,
  CalendarDayAgenda,
} from '@/features/class-lms/calendar-events';
import {
  CalendarDays,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  ArrowUpRight,
  Clock,
  MapPin,
  User,
} from 'lucide-react';

export function MyDashboardPage({ full = false }: { full?: boolean }) {
  const { user } = useAuth(),
    [search, setSearch] = useSearchParams(),
    [classes, setClasses] = useState<ClassCard[]>(),
    [events, setEvents] = useState<CalendarEvent[]>(),
    [consultations, setConsultations] = useState<ConsultationBooking[]>([]),
    [consultationError, setConsultationError] = useState(''),
    [canPropose, setCanPropose] = useState(false),
    [error, setError] = useState(''),
    [classError, setClassError] = useState(''),
    [truncated, setTruncated] = useState(false),
    [retry, setRetry] = useState(0),
    [calendarRefresh, setCalendarRefresh] = useState(0),
    [selectedDay, setSelectedDay] = useState<string | null>(null),
    [zoomOrigin, setZoomOrigin] = useState<{ dx: number; dy: number } | null>(null);

  function openDayModal(day: string, anchor?: HTMLElement | null) {
    const rect = anchor?.getBoundingClientRect();
    if (rect && rect.width > 0 && typeof window !== 'undefined' && window.innerWidth > 0) {
      const rawDx = rect.left + rect.width / 2 - window.innerWidth / 2;
      const rawDy = rect.top + rect.height / 2 - window.innerHeight / 2;
      setZoomOrigin({
        dx: Math.round(Math.max(-360, Math.min(360, rawDx))),
        dy: Math.round(Math.max(-240, Math.min(240, rawDy))),
      });
    } else {
      setZoomOrigin(null);
    }
    setSelectedDay(day);
  }

  const month = /^20\d{2}-(?:0[1-9]|1[0-2])$/.test(search.get('month') ?? '')
      ? search.get('month')!
      : schoolMonth(),
    course = search.get('course') ?? '',
    classId = search.get('classId') ?? '';
  const dayView = search.get('view') === 'day';
  const requestedDay = search.get('date') ?? schoolDay(new Date().toISOString());
  const agendaDay =
    /^20\d{2}-\d{2}-\d{2}$/.test(requestedDay) &&
    Number.isFinite(Date.parse(requestedDay)) &&
    requestedDay.startsWith(month)
      ? requestedDay
      : month + '-01';

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') setCalendarRefresh((n) => n + 1);
    };
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener('focus', refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
    };
  }, []);

  useEffect(() => {
    let live = true;
    void apiFetch<{ data: ClassCard[]; canProposeOfficialSession: boolean }>('/v2/my/classes')
      .then((r) => {
        if (live) {
          setClasses(r.data);
          setClassError('');
          setCanPropose(r.canProposeOfficialSession);
        }
      })
      .catch(() => {
        if (live) {
          setCanPropose(false);
          setClassError('Không tải được các lớp của bạn.');
        }
      });
    return () => {
      live = false;
    };
  }, [retry]);

  useEffect(() => {
    let live = true;
    void apiFetch<{ data: CalendarEvent[]; truncated: boolean }>(
      '/v2/my/calendar?month=' + month + (classId ? '&classId=' + encodeURIComponent(classId) : ''),
    )
      .then((r) => {
        if (live) {
          setEvents(r.data);
          setTruncated(r.truncated);
          setError('');
        }
      })
      .catch(() => {
        if (live) {
          setEvents(undefined);
          setError('Không tải được lịch. Kiểm tra phiên đăng nhập và thử lại.');
        }
      });
    return () => {
      live = false;
    };
  }, [month, classId, retry, calendarRefresh]);

  useEffect(() => {
    let live = true;
    if (classId || course || !user || !['STUDENT', 'INSTRUCTOR'].includes(user.role)) return;
    void apiFetch<{ data: ConsultationBooking[] }>('/v2/consultations/bookings?month=' + month)
      .then((r) => {
        if (
          !Array.isArray(r.data) ||
          r.data.some(
            (b) =>
              typeof b.teacherId !== 'string' ||
              typeof b.displayName !== 'string' ||
              ![
                'HOLD',
                'PENDING_GV',
                'CONFIRMED',
                'EXPIRED',
                'REJECTED',
                'CANCELLED',
                'SUPERSEDED',
              ].includes(b.state),
          )
        )
          throw new Error('Invalid private consultation projection');
        if (live) {
          setConsultations(r.data);
          setConsultationError('');
        }
      })
      .catch(() => {
        if (live) {
          setConsultations([]);
          setConsultationError('Không tải được lịch tư vấn 1:1.');
        }
      });
    return () => {
      live = false;
    };
  }, [month, retry, user, classId, course]);

  const courseOptions = Array.from(
    new Set(
      (classes ?? [])
        .map((c) => (isTechnicalQaRecord(c.course.title) ? '' : c.course.title.trim()))
        .filter(Boolean),
    ),
  );
  const classesInCourse = course
    ? (classes ?? []).filter((c) => c.course.title.trim() === course)
    : (classes ?? []);

  function filter(nextMonth: string, nextClass = classId, nextCourse = course) {
    const resolvedClass =
      nextCourse &&
      nextClass &&
      classes &&
      !classes.some((c) => c.id === nextClass && c.course.title.trim() === nextCourse)
        ? ''
        : nextClass;
    if (nextMonth !== month || resolvedClass !== classId) {
      setEvents(undefined);
    }
    setSelectedDay(null);
    setSearch({
      month: nextMonth,
      ...(dayView ? { view: 'day' } : {}),
      ...(nextCourse ? { course: nextCourse } : {}),
      ...(resolvedClass ? { classId: resolvedClass } : {}),
    });
  }

  const today = schoolDay(new Date().toISOString());
  const filteredEvents =
    course && !classId
      ? (events ?? []).filter(
          (ev) =>
            ev.classOffering?.course?.title?.trim() === course ||
            classesInCourse.some((c) => c.id === ev.classOffering?.id),
        )
      : (events ?? []);
  const items = calendarItems(filteredEvents, classId || course ? [] : consultations, {
    consultationUrl: user?.role === 'STUDENT' ? '/student/bookings' : '/consultations',
    studentView: user?.role === 'STUDENT',
  });
  const displayClass = learnerClassLabel;
  const stripColors = [
    'bg-gradient-to-r from-indigo-600 to-indigo-500',
    'bg-gradient-to-r from-teal-600 to-emerald-500',
    'bg-gradient-to-r from-amber-600 to-orange-500',
  ];

  const recent = [...classesInCourse].sort((a, b) =>
    (b.lastAccessedAt ?? '').localeCompare(a.lastAccessedAt ?? ''),
  );

  return (
    <div className="workspace-page min-w-0" data-testid="my-dashboard">
      {user?.role !== 'STUDENT' && (
        <nav
          aria-label="Đường dẫn"
          className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500"
        >
          <Link to="/workspace" className="hover:text-indigo-700">
            Tổng quan
          </Link>
          <span>/</span>
          <Link to="/my/calendar" className="text-indigo-700 hover:underline">
            Bảng điều khiển
          </Link>
          <span>/</span>
          <Link
            to={user?.role === 'INSTRUCTOR' ? '/instructor/teaching' : '/my/#my-classes'}
            className="hover:text-indigo-700"
          >
            {user?.role === 'ACADEMIC_MANAGER'
              ? 'Lớp trong phạm vi trung tâm'
              : user?.role === 'INSTRUCTOR'
                ? 'Lớp được phân công'
                : 'Các lớp học của tôi'}
          </Link>
        </nav>
      )}

      <header className="workspace-header flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-indigo-700">
            Smart English · {user ? accountLabel(user.fullName) : ''}
          </p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
            {full
              ? 'Bảng điều khiển'
              : user?.role === 'STUDENT'
                ? 'Lịch học và lớp của tôi'
                : user?.role === 'INSTRUCTOR'
                  ? 'Bảng điều khiển'
                  : 'Lịch đào tạo trung tâm'}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {full
              ? user?.role === 'STUDENT'
                ? 'Theo dõi lịch học, bài tập, bài kiểm tra, điểm danh, lịch tư vấn 1:1 và lọc nhanh theo khóa học hoặc lớp.'
                : 'Theo dõi lịch học, lịch giảng dạy, bài tập, bài kiểm tra, điểm danh và lọc nhanh theo khóa học hoặc lớp.'
              : 'Theo dõi thời khóa biểu, lịch trực tuyến và lọc nhanh theo khóa học hoặc lớp của bạn.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          {canPropose && user?.role === 'ACADEMIC_MANAGER' && (
            <Link className="btn-primary text-sm" to="/academic/planning">
              Sự kiện mới · Đề xuất buổi
            </Link>
          )}
          {!full && (
            <a href="#my-classes" className="btn-secondary text-sm">
              <BookOpen className="h-4 w-4" />
              {user?.role === 'ACADEMIC_MANAGER' ? 'Lớp trung tâm' : 'Lớp học của tôi'} (
              {classes?.length ?? 0})
            </a>
          )}
        </div>
      </header>

      {classError && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900"
        >
          <span>{classError}</span>
          <button className={button} onClick={() => setRetry((x) => x + 1)}>
            Tải lại danh sách lớp
          </button>
        </div>
      )}

      <section className="workspace-card min-w-0" aria-labelledby="month-calendar">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700">
              <CalendarDays className="h-5 w-5" />
            </span>
            <div>
              <h2 id="month-calendar" className="text-xl font-bold text-slate-900 sm:text-2xl">
                Lịch tháng
              </h2>
              <p className="text-xs text-slate-500">
                Buổi học, bài tập, bài kiểm tra, hạn hoàn thành và lịch tư vấn 1:1
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              disabled={month === '2000-01'}
              aria-label="Tháng trước"
              onClick={() => filter(shiftMonth(month, -1))}
            >
              <ChevronLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Tháng trước</span>
            </button>
            <h3
              className="min-w-[140px] text-center text-base font-extrabold text-slate-900 sm:text-lg"
              aria-live="polite"
            >
              Tháng {month.slice(5)} / {month.slice(0, 4)}
            </h3>
            <button
              className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              disabled={month === '2099-12'}
              aria-label="Tháng sau"
              onClick={() => filter(shiftMonth(month, 1))}
            >
              <span className="hidden sm:inline">Tháng sau</span>
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="mb-5 grid items-end gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_200px]">
          <label className="min-w-0 max-w-full flex-1 text-sm font-semibold text-slate-700">
            Khóa học
            <select
              className={field}
              value={course}
              onChange={(e) => filter(month, '', e.target.value)}
            >
              <option value="">Tất cả khóa học</option>
              {courseOptions.map((title) => (
                <option key={title} value={title}>
                  {title}
                </option>
              ))}
            </select>
          </label>
          <label className="min-w-0 max-w-full flex-1 text-sm font-semibold text-slate-700">
            Khóa học / lớp
            <select
              className={field}
              value={classId}
              onChange={(e) => filter(month, e.target.value, course)}
            >
              <option value="">
                {user?.role === 'STUDENT' ? 'Tất cả lớp của tôi' : 'Tất cả lớp được phép'}
              </option>
              {classesInCourse.map((c, i) => (
                <option key={c.id} value={c.id}>
                  {classCodeLabel(c.code) ? `${classCodeLabel(c.code)} · ` : ''}
                  {displayClass(c.name, c.code, c.course.title)}
                  {isTechnicalQaRecord(c.name, c.code, c.course.title) ? ' · ' + (i + 1) : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-semibold text-slate-700">
            Chọn tháng
            <input
              type="month"
              min="2000-01"
              max="2099-12"
              className={field}
              value={month}
              onChange={(e) => {
                if (e.target.value) filter(e.target.value);
              }}
            />
          </label>
        </div>

        {error && (
          <div
            role="alert"
            className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900"
          >
            <span>{error}</span>
            <button className={button} onClick={() => setRetry((x) => x + 1)}>
              Thử lại
            </button>
          </div>
        )}

        {!events && !error && (
          <p role="status" className="mb-3 text-sm text-slate-500">
            Đang tải lịch…
          </p>
        )}

        <CalendarLegend />
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <div className="flex gap-2">
            <button
              type="button"
              className={button}
              aria-pressed={!dayView}
              onClick={() =>
                setSearch({
                  month,
                  ...(course ? { course } : {}),
                  ...(classId ? { classId } : {}),
                })
              }
            >
              Lịch tháng
            </button>
            <button
              type="button"
              className={button}
              aria-pressed={dayView}
              onClick={() =>
                setSearch({
                  month,
                  view: 'day',
                  ...(course ? { course } : {}),
                  ...(classId ? { classId } : {}),
                })
              }
            >
              Theo ngày
            </button>
          </div>
          {dayView && (
            <label className="text-sm font-semibold text-slate-700">
              Chọn ngày
              <input
                type="date"
                className={field}
                value={agendaDay}
                onChange={(e) => {
                  if (e.target.value)
                    setSearch({
                      month: e.target.value.slice(0, 7),
                      view: 'day',
                      date: e.target.value,
                      ...(course ? { course } : {}),
                      ...(classId ? { classId } : {}),
                    });
                }}
              />
            </label>
          )}
        </div>
        {dayView ? (
          <div className="calendar-day-item-enter">
            <CalendarDayAgenda rows={eventsOnDay(items, agendaDay)} />
          </div>
        ) : (
          <div
            role="table"
            aria-label={'Lịch tháng ' + month}
            className="min-w-0 rounded-xl border border-slate-200 bg-white"
          >
            <div role="row" className="grid grid-cols-7 overflow-hidden rounded-t-xl border-b border-slate-200 bg-slate-50">
              {['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map((d) => (
                <div
                  role="columnheader"
                  key={d}
                  className="border-r border-slate-200 py-2.5 text-center text-xs font-extrabold uppercase tracking-wider text-slate-600 last:border-r-0 sm:text-sm"
                >
                  {d}
                </div>
              ))}
            </div>
            {Array.from({ length: monthCells(month).length / 7 }, (_, week) => (
              <div
                role="row"
                className="grid grid-cols-7 border-b border-slate-200 last:border-b-0"
                key={week}
              >
                {monthCells(month)
                  .slice(week * 7, week * 7 + 7)
                  .map((day, i) => {
                    const rows = day ? eventsOnDay(items, day) : [];
                    const isToday = day === today;
                    const isSelected = Boolean(day && selectedDay === day);
                    return (
                      <div
                        role="cell"
                        key={day ?? 'blank' + i}
                        data-day={day ?? ''}
                        onClick={(ev) => {
                          if (day) openDayModal(day, ev.currentTarget);
                        }}
                        className={
                          'group/day min-h-24 min-w-0 border-r border-slate-200 p-1.5 transition-all duration-200 ease-out last:border-r-0 sm:min-h-32 sm:p-2 ' +
                          (!day
                            ? 'bg-slate-50/50 '
                            : isSelected
                              ? 'relative z-10 scale-[1.02] cursor-pointer rounded-lg bg-[#eef6e8] shadow-md ring-2 ring-[#5f8b48] '
                              : isToday
                                ? 'cursor-pointer bg-indigo-50/60 hover:relative hover:z-10 hover:scale-[1.025] hover:rounded-lg hover:bg-indigo-50 hover:shadow-md hover:ring-1 hover:ring-indigo-300 active:scale-[0.985] '
                                : 'cursor-pointer bg-white hover:relative hover:z-10 hover:scale-[1.025] hover:rounded-lg hover:bg-[#f6faf3] hover:shadow-md hover:ring-1 hover:ring-[#76a35e]/60 active:scale-[0.985] ')
                        }
                      >
                        <div className="mb-1 flex items-center justify-between">
                          <button
                            type="button"
                            disabled={!day}
                            aria-label={day ? `Xem tất cả sự kiện ngày ${day}` : undefined}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (day) {
                                const cell = e.currentTarget.closest('[data-day]') as HTMLElement | null;
                                openDayModal(day, cell ?? e.currentTarget);
                              }
                            }}
                            className={
                              'inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold transition-transform duration-200 group-hover/day:scale-110 sm:h-7 sm:w-7 sm:text-sm ' +
                              (isToday
                                ? 'bg-indigo-700 text-white shadow-xs'
                                : isSelected
                                  ? 'bg-[#5f8b48] text-white'
                                  : 'text-slate-700')
                            }
                            aria-current={isToday ? 'date' : undefined}
                          >
                            {day ? Number(day.slice(8)) : ''}
                          </button>
                        </div>
                        <DayPreview
                          rows={rows}
                          open={(anchor) => {
                            if (day) openDayModal(day, anchor);
                          }}
                        />
                      </div>
                    );
                  })}
              </div>
            ))}
          </div>
        )}

        {consultationError && (
          <p role="status" className="mt-3 text-xs text-amber-800">
            {consultationError}
          </p>
        )}
        {events && items.length === 0 && (
          <p className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
            Không có sự kiện có ngày hợp lệ trong tháng và phạm vi đã chọn.
          </p>
        )}
        {truncated && (
          <p
            role="alert"
            className="mt-3 rounded-xl bg-amber-50 px-4 py-2.5 text-sm text-amber-900"
          >
            Lịch chưa tải đủ sự kiện. Chọn một lớp để thu hẹp phạm vi.
          </p>
        )}
        <footer className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4 text-xs text-slate-500 sm:text-sm">
          <p>
            Giờ Việt Nam (GMT+7). Bấm ngày để xem tất cả sự kiện. Chỉ hiển thị hoạt động có ngày hợp
            lệ.
          </p>
          {!full && (
            <Link
              className="inline-flex items-center gap-1 font-bold text-indigo-700 hover:underline"
              to={
                '/my/calendar?month=' +
                month +
                (course ? '&course=' + encodeURIComponent(course) : '') +
                (classId ? '&classId=' + encodeURIComponent(classId) : '')
              }
            >
              Xem lịch đầy đủ
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          )}
        </footer>
      </section>

      {selectedDay && (
        <CalendarDayModal
          day={selectedDay}
          origin={zoomOrigin}
          rows={eventsOnDay(items, selectedDay)}
          close={() => {
            setSelectedDay(null);
            setZoomOrigin(null);
          }}
        />
      )}

      {!full && (
        <section id="my-classes" aria-labelledby="recent-classes" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 id="recent-classes" className="text-xl font-bold text-slate-900">
                {user?.role === 'ACADEMIC_MANAGER'
                  ? 'Lớp học trong phạm vi quản lý'
                  : 'Các lớp học được truy cập gần đây'}
              </h2>
              <p className="text-xs text-slate-500">
                {user?.role === 'ACADEMIC_MANAGER'
                  ? `Đang hiển thị ${Math.min(6, recent.length)}/${classes?.length ?? recent.length} lớp trong phạm vi quản lý`
                  : 'Truy cập nhanh không gian học tập, bài tập, điểm danh và tài nguyên theo từng lớp'}
              </p>
            </div>
            {user?.role === 'ACADEMIC_MANAGER' && (
              <Link
                to="/academic"
                className="text-xs font-semibold text-indigo-700 hover:underline"
              >
                Xem toàn bộ ({classes?.length ?? 0}) tại Chương trình &amp; Lớp →
              </Link>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {recent.slice(0, 6).map((c, i) => (
              <article
                key={c.id}
                className="group flex min-w-0 flex-col justify-between overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <div>
                  <div
                    className={'h-3 ' + stripColors[i % stripColors.length]}
                    aria-hidden="true"
                  />
                  <div className="space-y-2 p-5">
                    <p className="text-xs font-bold uppercase tracking-wider text-indigo-700">
                      {isTechnicalQaRecord(c.course.title) ? 'Chương trình QA' : c.course.title}
                    </p>
                    <h3 className="break-words text-lg font-extrabold text-slate-900">
                      {classCodeLabel(c.code) ? `${classCodeLabel(c.code)} · ` : ''}
                  {displayClass(c.name, c.code, c.course.title)}
                    </h3>
                    <p className="text-xs text-slate-500">
                      {c.lastAccessedAt
                        ? 'Có hoạt động học đã ghi nhận'
                        : user?.role === 'ACADEMIC_MANAGER'
                          ? 'Hồ sơ lớp sẵn sàng xem & điều phối'
                          : 'Chưa có lần học được ghi nhận'}
                    </p>
                    <SourceRecord name={c.name} code={c.code} courseTitle={c.course.title} />
                  </div>
                </div>
                <div className="border-t border-slate-100 bg-slate-50/70 px-5 py-3">
                  <Link
                    className="inline-flex items-center gap-1.5 text-sm font-bold text-indigo-700 hover:text-indigo-900"
                    to={
                      (user?.role === 'ACADEMIC_MANAGER' ? '/academic/classes/' : '/classroom/') +
                      c.id
                    }
                  >
                    Vào lớp
                    <ArrowUpRight className="h-4 w-4" />
                  </Link>
                </div>
              </article>
            ))}
          </div>

          {classes?.length === 0 && (
            <p className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
              Bạn chưa có lớp học nào đang hoạt động. Vui lòng đăng ký khóa học để bắt đầu.
            </p>
          )}
        </section>
      )}
    </div>
  );
}

export function MyCalendarEventPage() {
  return <EventDetail />;
}

function EventDetail() {
  const { user } = useAuth();
  const { id = '' } = useParams(),
    [event, setEvent] = useState<CalendarEvent>(),
    [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    void apiFetch<CalendarEvent>('/v2/my/events/' + id)
      .then((e) => {
        if (live) setEvent(e);
      })
      .catch(() => {
        if (live) setError('Buổi học không còn trong lịch được phép.');
      });
    return () => {
      live = false;
    };
  }, [id]);

  return (
    <div className="workspace-page space-y-5">
      <Link
        to={user?.role === 'STUDENT' ? '/my/calendar' : '/my/'}
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-700 hover:underline"
      >
        ← Lịch tháng
      </Link>
      <header className="workspace-header">
        <p className="text-xs font-bold uppercase tracking-wider text-indigo-700">
          Lịch học chính thức
        </p>
        <h1 className="mt-1 text-2xl font-extrabold text-slate-900">Chi tiết buổi học</h1>
      </header>
      {error && (
        <p
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900"
        >
          {error}
        </p>
      )}
      {!event && !error && <p role="status">Đang tải buổi…</p>}
      {event && (
        <article className="workspace-card space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <span className="badge-published">
                {user?.role === 'STUDENT'
                  ? 'Buổi học đã được xác nhận'
                  : `Buổi đã duyệt · phiên bản ${event.revision}`}
              </span>
              <h2 className="mt-2 text-xl font-extrabold text-slate-900">
                {user?.role === 'STUDENT'
                  ? learnerClassLabel(event.classOffering.name, event.classOffering.code)
                  : `${classCodeLabel(event.classOffering.code)} · ${event.classOffering.name}`}
              </h2>
              <p className="text-sm text-slate-600">{event.classOffering.course.title}</p>
            </div>
            <Link
              to={
                (user?.role === 'ACADEMIC_MANAGER' ? '/academic/classes/' : '/classroom/') +
                event.classOffering.id
              }
              className={button}
            >
              Vào không gian lớp
            </Link>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="workspace-subcard flex items-start gap-2.5">
              <Clock className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" />
              <div className="text-sm">
                <p className="text-xs font-semibold text-slate-500">
                  {user?.role === 'STUDENT' ? 'Thời gian học (GMT+7)' : 'Thời gian (giờ trường)'}
                </p>
                <p className="font-bold text-slate-900">
                  {schoolDay(event.startsAt)} · {schoolTime(event.startsAt)} —{' '}
                  {schoolTime(event.endsAt)}
                </p>
              </div>
            </div>
            <div className="workspace-subcard flex items-start gap-2.5">
              <User className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" />
              <div className="text-sm">
                <p className="text-xs font-semibold text-slate-500">Giảng viên & hình thức</p>
                <p className="font-bold text-slate-900">
                  {event.instructor?.fullName ?? 'Chưa có giảng viên'} ·{' '}
                  {user?.role === 'STUDENT'
                    ? ((
                        {
                          ONLINE: 'Trực tuyến',
                          OFFLINE: 'Tại trung tâm',
                          HYBRID: 'Kết hợp',
                        } as Record<string, string>
                      )[event.modality] ?? event.modality)
                    : event.modality}
                </p>
              </div>
            </div>
            <div className="workspace-subcard flex items-start gap-2.5">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" />
              <div className="text-sm">
                <p className="text-xs font-semibold text-slate-500">Phòng học</p>
                <p className="font-bold text-slate-900">
                  {event.room
                    ? event.room.code + ' · ' + event.room.location
                    : 'Không có phòng vật lý'}
                </p>
              </div>
            </div>
          </div>

          {!!event.relatedActivities?.length && (
            <section className="space-y-3 rounded-xl border border-indigo-100 bg-indigo-50 p-4">
              <h3 className="font-bold text-slate-900">Nội dung của buổi học</h3>
              <ul className="space-y-2">
                {event.relatedActivities.map(activity => (
                  <li key={activity.id}>
                    <Link className="font-semibold text-indigo-700 underline" to={activity.actionUrl}>{activity.title}</Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <SessionEngagementPanel key={id} sessionId={id} />
          {user?.role !== 'STUDENT' && <W06Notifications />}
        </article>
      )}
    </div>
  );
}
