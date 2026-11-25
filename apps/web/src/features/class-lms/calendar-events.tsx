import { useEffect, useRef } from 'react';
import { Link } from 'react-router';
import { X } from 'lucide-react';
import type { CalendarEvent } from './api';
import { schoolDay, schoolTime } from './month';
import { learnerClassLabel } from '@/features/enrollments/presentation';
import type { ConsultationBooking } from '@/pages/ConsultationsPage';

const kinds = {
  TEACHING_SESSION: ['Buổi học', 'border-indigo-200 bg-indigo-50 text-indigo-950'],
  ASSIGNMENT: ['Bài tập', 'border-amber-200 bg-amber-50 text-amber-950'],
  QUIZ: ['Bài kiểm tra luyện tập', 'border-violet-200 bg-violet-50 text-violet-950'],
  REGULAR: ['Kiểm tra thường kỳ', 'border-teal-200 bg-teal-50 text-teal-950'],
  MIDTERM: ['Kiểm tra giữa kỳ', 'border-purple-200 bg-purple-50 text-purple-950'],
  FINAL: ['Kiểm tra cuối kỳ', 'border-rose-200 bg-rose-50 text-rose-950'],
  ATTENDANCE: ['Điểm danh', 'border-orange-200 bg-orange-50 text-orange-950'],
  ASSESSMENT: ['Bài kiểm tra', 'border-violet-200 bg-violet-50 text-violet-950'],
  LESSON: ['Hoạt động', 'border-sky-200 bg-sky-50 text-sky-950'],
  RESOURCE: ['Tài nguyên', 'border-sky-200 bg-sky-50 text-sky-950'],
  CONSULTATION: ['Tư vấn 1:1', 'border-teal-200 bg-teal-50 text-teal-950'],
};
const states = {
  NOT_STARTED: 'Chưa làm',
  SUBMITTED: 'Đã nộp',
  OVERDUE: 'Quá hạn',
  COMPLETED: 'Đã hoàn thành',
};
export type DayEvent = {
  id: string;
  source: keyof typeof kinds;
  title: string;
  startsAt: string;
  endsAt: string;
  className?: string;
  status: string;
  deadline?: string | null;
  availableFrom?: string | null;
  submittedAt?: string | null;
  url: string;
  action: string;
  meetUrl?: string | null;
  note?: string | null;
};
const valid = (value: string) => Number.isFinite(new Date(value).getTime());
export function calendarItems(
  events: CalendarEvent[],
  bookings: ConsultationBooking[],
  options?: { consultationUrl?: string; studentView?: boolean },
): DayEvent[] {
  const consultationUrl = options?.consultationUrl ?? '/consultations';
  const studentView = options?.studentView ?? false;
  const lessons = events
    .filter((e) => valid(e.startsAt) && valid(e.endsAt))
    .map((e) => ({
      id: e.id,
      source: e.source,
      title: e.title ?? (e.meetUrl ? 'Buổi học · Google Meet' : 'Buổi học'),
      startsAt: e.startsAt,
      endsAt: e.endsAt,
      className: learnerClassLabel(
        e.classOffering.name,
        e.classOffering.code,
        e.classOffering.course.title,
      ),
      status: e.status
        ? states[e.status]
        : e.attendance?.status === 'PRESENT'
          ? 'Đã điểm danh'
          : e.attendance?.status === 'LATE'
            ? 'Đi muộn'
            : studentView
              ? 'Đã lên lịch'
              : 'Đã duyệt',
      deadline: e.deadline,
      availableFrom: e.availableFrom,
      submittedAt: e.submittedAt,
      url: e.actionUrl ?? '/my/events/' + e.id,
      action: e.actionLabel ?? 'Vào lớp',
      meetUrl: e.meetUrl,
      note: e.actionNote,
    }));
  const consultations: DayEvent[] = bookings
    .filter(
      (b) =>
        valid(b.startsAt) &&
        valid(b.endsAt) &&
        !['EXPIRED', 'REJECTED', 'CANCELLED', 'SUPERSEDED'].includes(b.state),
    )
    .map((b) => ({
      id: 'consultation:' + b.id,
      source: 'CONSULTATION',
      title: 'Tư vấn 1:1 · ' + b.displayName,
      startsAt: b.startsAt,
      endsAt: b.endsAt,
      status:
        (
          { HOLD: 'Đang giữ chỗ', PENDING_GV: 'Chờ xác nhận', CONFIRMED: 'Đã xác nhận' } as Record<
            string,
            string
          >
        )[b.state] ?? b.state,
      url: consultationUrl,
      action: 'Xem lịch tư vấn',
      meetUrl: b.state === 'CONFIRMED' ? b.joinUrl : null,
    }));
  return [...lessons, ...consultations].sort(
    (a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt) || a.id.localeCompare(b.id),
  );
}
export function eventsOnDay(items: DayEvent[], day: string) {
  return items.filter(
    (e) =>
      schoolDay(e.startsAt) <= day &&
      schoolDay(
        new Date(Math.max(Date.parse(e.startsAt), Date.parse(e.endsAt) - 1)).toISOString(),
      ) >= day,
  );
}
export function CalendarLegend() {
  return (
    <div className="mb-3 flex flex-wrap gap-2 text-xs" aria-label="Loại sự kiện">
      {(['TEACHING_SESSION', 'ASSIGNMENT', 'QUIZ', 'CONSULTATION', 'LESSON'] as const).map((k) => (
        <span key={k} className={'rounded border px-2 py-1 ' + kinds[k][1]}>
          {kinds[k][0]}
        </span>
      ))}
    </div>
  );
}
export function CalendarDayAgenda({ rows }: { rows: DayEvent[] }) {
  return (
    <div className="space-y-3">
      {!rows.length && (
        <p className="rounded-xl bg-slate-50 p-5 text-sm text-slate-600">
          Không có sự kiện trong ngày này.
        </p>
      )}
      {rows.map((e) => (
        <article key={e.id} className={'min-w-0 rounded-xl border p-4 ' + kinds[e.source][1]}>
          <div className="flex flex-wrap justify-between gap-2 text-xs font-semibold">
            <span>
              {kinds[e.source][0]} · {schoolTime(e.startsAt)}
              {e.endsAt !== e.startsAt ? ' — ' + schoolTime(e.endsAt) : ''}
            </span>
            <span>{e.status}</span>
          </div>
          <h3 className="mt-2 break-words font-bold">{e.title}</h3>
          <p className="mt-1 text-sm">{e.className}</p>
          {e.deadline && (
            <p className="mt-1 text-xs">
              Hạn hoàn thành: {schoolDay(e.deadline)} · {schoolTime(e.deadline)}
            </p>
          )}
          {e.note && <p className="mt-2 text-xs">{e.note}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              className="inline-flex rounded-lg border border-current bg-white px-3 py-2 text-sm font-semibold"
              to={e.url}
            >
              {e.action}
            </Link>
            {e.meetUrl && (
              <a
                href={e.meetUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex rounded-lg bg-indigo-700 px-3 py-2 text-sm font-semibold text-white"
              >
                Vào Meet
              </a>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}
export function DayPreview({
  rows,
  open,
}: {
  rows: DayEvent[];
  open: (anchor?: HTMLElement | null) => void;
}) {
  const trigger = (ev: React.MouseEvent<HTMLButtonElement>) => {
    ev.stopPropagation();
    const cell = ev.currentTarget.closest('[data-day]') as HTMLElement | null;
    open(cell ?? ev.currentTarget);
  };
  return (
    <div className="space-y-1">
      {rows.slice(0, 2).map((e) => (
        <button
          type="button"
          key={e.id}
          onClick={trigger}
          title={schoolTime(e.startsAt) + ' · ' + e.title + ' · ' + e.status}
          className={
            'block w-full min-w-0 overflow-hidden rounded border px-1 py-1 text-left text-[9px] leading-snug transition-transform duration-150 hover:scale-[1.02] sm:text-xs ' +
            kinds[e.source][1]
          }
        >
          <span className="block truncate font-bold">
            {schoolTime(e.startsAt)} · {kinds[e.source][0]}
          </span>
          <span className="block truncate">{e.title}</span>
          <span className="hidden truncate sm:block">{e.status}</span>
        </button>
      ))}
      {rows.length > 2 && (
        <button
          type="button"
          className="block w-full break-words rounded py-1 text-left text-[9px] font-bold text-indigo-800 hover:underline sm:text-xs"
          onClick={trigger}
        >
          +{rows.length - 2} sự kiện khác
        </button>
      )}
    </div>
  );
}
export function CalendarDayModal({
  day,
  rows,
  close,
  origin,
}: {
  day: string;
  rows: DayEvent[];
  close: () => void;
  origin?: { dx: number; dy: number } | null;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const el = dialog.current!;
    el.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      el.close();
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []);
  const date = day.split('-').reverse().join('/');
  const stamp = (iso: string) =>
    schoolDay(iso).split('-').reverse().join('/') + ' · ' + schoolTime(iso);
  const zoomStyle = origin
    ? ({ '--zoom-dx': `${origin.dx}px`, '--zoom-dy': `${origin.dy}px` } as React.CSSProperties)
    : undefined;
  return (
    <dialog
      ref={dialog}
      aria-labelledby="calendar-day-title"
      style={zoomStyle}
      onCancel={close}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
      className="calendar-day-modal-zoom fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-1rem)] max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 text-slate-900 shadow-2xl backdrop:bg-slate-950/45 backdrop:backdrop-blur-[2px] sm:p-6"
    >
      <header className="mb-4 flex items-start justify-between gap-3 border-b border-slate-200 pb-3">
        <div>
          <h2 id="calendar-day-title" className="text-lg font-bold">
            Sự kiện ngày {date}
          </h2>
          <p className="text-xs text-slate-500">{rows.length} sự kiện · Giờ Việt Nam (GMT+7)</p>
        </div>
        <button
          type="button"
          aria-label="Đóng chi tiết ngày"
          className="shrink-0 rounded-lg border border-slate-200 p-2 transition hover:bg-slate-100 active:scale-95"
          onClick={close}
        >
          <X size={20} />
        </button>
      </header>
      {rows.length === 0 && (
        <p className="calendar-day-item-enter py-6 text-center text-sm text-slate-600">
          Không có sự kiện trong ngày này.
        </p>
      )}
      <ul className="space-y-3">
        {rows.map((e, index) => (
          <li
            key={e.id}
            style={{ animationDelay: `${Math.min(index, 6) * 35}ms` }}
            className={
              'calendar-day-item-enter min-w-0 rounded-xl border p-3 shadow-xs transition hover:shadow-sm sm:p-4 ' +
              kinds[e.source][1]
            }
          >
            <div className="flex flex-wrap justify-between gap-2 text-xs font-semibold">
              <span>{kinds[e.source][0]}</span>
              <span>{e.status}</span>
            </div>
            <h3 className="my-2 break-words font-bold">{e.title}</h3>
            <p className="text-sm">
              {stamp(e.startsAt)}
              {e.endsAt !== e.startsAt ? ' — ' + stamp(e.endsAt) : ''}
            </p>
            {e.className && <p className="mt-1 break-words text-sm">Lớp: {e.className}</p>}
            <dl className="mt-2 space-y-1 text-xs">
              {e.availableFrom && (
                <div>
                  <dt className="inline font-semibold">Mở từ: </dt>
                  <dd className="inline">{stamp(e.availableFrom)}</dd>
                </div>
              )}
              {e.deadline && (
                <div>
                  <dt className="inline font-semibold">Hạn nộp / hoàn thành: </dt>
                  <dd className="inline">{stamp(e.deadline)}</dd>
                </div>
              )}
              {e.submittedAt && (
                <div>
                  <dt className="inline font-semibold">Đã nộp lúc: </dt>
                  <dd className="inline">{stamp(e.submittedAt)}</dd>
                </div>
              )}
            </dl>
            {e.note && <p className="mt-2 text-xs">{e.note}</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                to={e.url}
                className="inline-flex items-center rounded-lg border border-current bg-white px-3 py-2 text-sm font-semibold"
                onClick={close}
              >
                {e.action}
              </Link>
              {e.meetUrl && (
                <a
                  href={e.meetUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center rounded-lg bg-indigo-700 px-3 py-2 text-sm font-semibold text-white"
                >
                  Vào Meet
                </a>
              )}
            </div>
          </li>
        ))}
      </ul>
    </dialog>
  );
}
