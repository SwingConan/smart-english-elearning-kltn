import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import {
  Calendar,
  CalendarClock,
  Check,
  CheckCircle2,
  Clock,
  Info,
  RefreshCw,
  Video,
  X,
} from 'lucide-react';
import { ApiError, apiFetch } from '@/lib/api-client';
import { isManualMeetUrl } from '@/features/meet/manual-meet';
import type { ConsultationBooking } from '@/pages/ConsultationsPage';

const TZ = 'Asia/Ho_Chi_Minh';

const stamp = (s: string) =>
  new Intl.DateTimeFormat('vi-VN', {
    timeZone: TZ,
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(s));

const timeOnly = (s: string) =>
  new Intl.DateTimeFormat('vi-VN', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(s));

const vnDayKey = (s: string) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(s));

const vnDayShort = (s: string) =>
  new Intl.DateTimeFormat('vi-VN', {
    timeZone: TZ,
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
  }).format(new Date(s));

const vnDayNumber = (s: string) =>
  new Intl.DateTimeFormat('vi-VN', { timeZone: TZ, day: '2-digit' }).format(new Date(s));

const vnMonthShort = (s: string) =>
  new Intl.DateTimeFormat('vi-VN', { timeZone: TZ, month: 'short' }).format(new Date(s));

const labels: Record<string, string> = {
  HOLD: 'Đang giữ chỗ',
  PENDING_GV: 'Chờ giảng viên xác nhận',
  REQUESTED: 'Chờ xác nhận',
  CONFIRMED: 'Đã xác nhận',
  COMPLETED: 'Đã hoàn thành',
  CANCELLED: 'Đã hủy',
  EXPIRED: 'Đã hết hạn',
  REJECTED: 'Đã từ chối',
  SUPERSEDED: 'Đã chuyển sang lịch mới',
  PENDING: 'Chờ duyệt',
  APPROVED: 'Đã duyệt',
};

const TOPIC_SUGGESTIONS = [
  {
    short: 'Lộ trình Listening',
    text: 'Tư vấn lộ trình tăng điểm Listening Part 1–4 và phương pháp nghe chép chính tả hàng ngày.',
  },
  {
    short: 'Ngữ pháp Part 5–6',
    text: 'Hệ thống lại ngữ pháp nền tảng TOEIC Part 5–6 và chiến lược phân bổ thời gian làm đề.',
  },
  {
    short: 'Định hướng chọn lớp',
    text: 'Đánh giá kết quả kiểm tra gần nhất và định hướng chọn lớp luyện thi TOEIC phù hợp mục tiêu.',
  },
  {
    short: 'Chiến lược Part 7',
    text: 'Giải đáp lỗi sai Reading Part 7 và cách đọc lướt tìm ý chính nhanh hơn khi thi thật.',
  },
];

type Profile = {
  id: string;
  teacherId: string;
  displayName: string;
  bio?: string;
  specialties?: string;
};
type Slot = { startsAt: string; endsAt: string };
type DayGroup = {
  key: string;
  label: string;
  slots: { startsAt: string; endsAt: string; timeLabel: string }[];
};
type Command = { key: string; op: string; [key: string]: unknown };
type Action =
  | 'SUBMIT'
  | 'CANCEL'
  | 'RESCHEDULE'
  | 'REQUEST_CANCEL'
  | 'REQUEST_RESCHEDULE'
  | 'NO_SHOW'
  | 'DISPUTE';

const actionTitles: Record<Action, string> = {
  SUBMIT: 'Gửi nội dung tư vấn',
  CANCEL: 'Hủy lịch hẹn',
  RESCHEDULE: 'Đổi giờ hẹn',
  REQUEST_CANCEL: 'Đề nghị hủy lịch',
  REQUEST_RESCHEDULE: 'Đề nghị đổi giờ',
  NO_SHOW: 'Báo vắng buổi tư vấn',
  DISPUTE: 'Phản hồi báo vắng',
};

function groupSlotsByDay(slots: Slot[] | undefined): DayGroup[] {
  if (!slots?.length) return [];
  const map = new Map<string, DayGroup>();
  for (const s of slots) {
    const key = vnDayKey(s.startsAt);
    let group = map.get(key);
    if (!group) {
      group = { key, label: vnDayShort(s.startsAt), slots: [] };
      map.set(key, group);
    }
    group.slots.push({
      startsAt: s.startsAt,
      endsAt: s.endsAt,
      timeLabel: timeOnly(s.startsAt),
    });
  }
  return Array.from(map.values());
}

function mentorInitials(name: string): string {
  const clean = name
    .split(/[·–-]/)[0]
    .replace(/^(ThS\.|TS\.|Cô|Thầy|Giảng viên)\s+/i, '')
    .trim();
  const words = clean.split(/\s+/).filter((w) => /^[A-Za-zÀ-ỹ]/.test(w));
  if (words.length === 0) return 'GV';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0] ?? ''}${words[words.length - 1][0] ?? ''}`.toUpperCase();
}

function errorText(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';
    if (error.status === 404 || error.status === 403)
      return 'Bạn không còn quyền thực hiện thao tác với lịch hẹn này. Hãy tải lại lịch.';
    if (error.status === 409)
      return 'Lịch hoặc trạng thái vừa thay đổi. Nội dung được giữ lại; hãy tải lại để chọn giờ còn trống.';
    if (error.status === 400)
      return 'Thông tin chưa hợp lệ. Kiểm tra thời gian và nhập nội dung ít nhất 10 ký tự.';
  }
  return 'Chưa nhận được xác nhận lưu. Dùng “Thử lại yêu cầu” để kiểm tra đúng thao tác, tránh đặt trùng.';
}

function stateBadgeClass(state: string, expired: boolean) {
  if (expired || state === 'EXPIRED' || state === 'REJECTED' || state === 'CANCELLED') {
    return 'border border-rose-200 bg-rose-50 text-rose-800';
  }
  if (state === 'CONFIRMED') {
    return 'border border-[#cde0c0] bg-[#eef6e8] text-[#2f581c]';
  }
  if (state === 'HOLD' || state === 'PENDING_GV' || state === 'REQUESTED') {
    return 'border border-amber-200 bg-amber-50 text-amber-900';
  }
  if (state === 'COMPLETED') {
    return 'border border-sky-200 bg-sky-50 text-sky-900';
  }
  return 'border border-slate-200 bg-slate-100 text-slate-700';
}

export function StudentConsultationsPage() {
  const [profiles, setProfiles] = useState<Profile[]>(),
    [bookings, setBookings] = useState<ConsultationBooking[]>();
  const [teacher, setTeacher] = useState(''),
    [slots, setSlots] = useState<Slot[]>(),
    [selectedDay, setSelectedDay] = useState(''),
    [slot, setSlot] = useState(''),
    [topic, setTopic] = useState('');
  const [bookingTab, setBookingTab] = useState<'ACTIVE' | 'ALL' | 'HISTORY'>('ACTIVE');
  const [errors, setErrors] = useState<Record<string, string>>({}),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  const [last, setLast] = useState<Command | null>(null),
    [serverNow, setServerNow] = useState(Date.now());
  const [modal, setModal] = useState<{
    booking: ConsultationBooking;
    action: Action;
    parentId?: string;
  }>();
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    const results = await Promise.allSettled([
      apiFetch<Profile[]>('/v2/consultations/profiles'),
      apiFetch<{ data: ConsultationBooking[]; serverTime: string }>('/v2/consultations/bookings'),
    ]);
    const [p, b] = results;
    if (p.status === 'fulfilled') {
      setProfiles(p.value);
      setErrors((e) => ({ ...e, profiles: '' }));
    } else setErrors((e) => ({ ...e, profiles: errorText(p.reason) }));
    if (b.status === 'fulfilled') {
      setBookings(b.value.data);
      setServerNow(new Date(b.value.serverTime).getTime());
      setErrors((e) => ({ ...e, bookings: '' }));
    } else setErrors((e) => ({ ...e, bookings: errorText(b.reason) }));
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 30000);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    let live = true;
    if (!teacher) return;
    void apiFetch<Slot[]>('/v2/consultations/slots?teacherId=' + encodeURIComponent(teacher))
      .then((s) => {
        if (live) {
          setSlots(s);
          setSelectedDay(s.length ? vnDayKey(s[0].startsAt) : '');
        }
      })
      .catch((e) => {
        if (live) {
          setSlots([]);
          setSelectedDay('');
          setErrors((v) => ({ ...v, slots: errorText(e) }));
        }
      });
    return () => {
      live = false;
    };
  }, [teacher]);

  const command = async (input: Command) => {
    setLast(input);
    try {
      const result = await apiFetch<{ id: string }>('/v2/consultations/commands', {
        method: 'POST',
        body: JSON.stringify(input),
      });
      setLast(null);
      return result;
    } catch (e) {
      if (e instanceof ApiError && e.status < 500) setLast(null);
      throw e;
    }
  };

  const run = async (work: () => Promise<void>) => {
    if (inFlight.current) return false;
    inFlight.current = true;
    setBusy(true);
    setErrors((e) => ({ ...e, action: '' }));
    setMessage('');
    try {
      await work();
      setMessage('Đã lưu thao tác. Trạng thái lịch hẹn được cập nhật bên dưới.');
      await load();
      return true;
    } catch (e) {
      setErrors((v) => ({ ...v, action: errorText(e) }));
      await load();
      return false;
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const newBooking = () =>
    run(async () => {
      const held = await command({
        key: crypto.randomUUID(),
        op: 'HOLD',
        teacherId: teacher,
        startsAt: slot,
      });
      await command({ key: crypto.randomUUID(), op: 'SUBMIT', id: held.id, topic: topic.trim() });
      setSlot('');
      setTopic('');
    });

  const act = async (reason: string, startsAt: string) => {
    if (!modal) return;
    const { booking: b, action, parentId } = modal;
    const data: Command = {
      key: crypto.randomUUID(),
      op: action.startsWith('REQUEST_') ? 'CHANGE_REQUEST' : action,
      id: b.id,
      version: b.version,
    };
    if (action === 'SUBMIT') data.topic = reason;
    else if (action === 'NO_SHOW' || action === 'DISPUTE') {
      data.evidence = reason;
      if (parentId) data.parentId = parentId;
    } else {
      data.reason = reason;
      if (action.startsWith('REQUEST_'))
        data.kind = action === 'REQUEST_CANCEL' ? 'CANCEL' : 'RESCHEDULE';
      if (action.includes('RESCHEDULE')) data.startsAt = startsAt;
    }
    if (
      await run(async () => {
        await command(data);
      })
    )
      setModal(undefined);
  };

  const dayGroups = useMemo(() => groupSlotsByDay(slots), [slots]);
  const effectiveDay =
    dayGroups.find((d) => d.key === selectedDay)?.key ?? dayGroups[0]?.key ?? '';
  const visibleDayGroup = dayGroups.find((d) => d.key === effectiveDay);

  const active = (bookings ?? []).filter(
    (b) =>
      ['HOLD', 'PENDING_GV', 'REQUESTED'].includes(b.state) ||
      (b.state === 'CONFIRMED' && new Date(b.endsAt).getTime() > serverNow),
  );
  const previous = (bookings ?? []).filter((b) => !active.includes(b));

  const displayedBookings =
    bookingTab === 'ALL'
      ? (bookings ?? [])
      : bookingTab === 'HISTORY'
        ? previous
        : active.length > 0
          ? active
          : (bookings ?? []);

  function bookingCard(b: ConsultationBooking) {
    const a = b.actions,
      end = new Date(b.endsAt).getTime(),
      expired = Boolean(b.expiresAt && new Date(b.expiresAt).getTime() <= serverNow);
    const open = (action: Action, parentId?: string) => setModal({ booking: b, action, parentId });
    const hasLinkRevision = typeof b.linkRevision === 'number' && b.linkRevision > 0;
    const isLiveMeet = Boolean(b.joinUrl && isManualMeetUrl(b.joinUrl));

    return (
      <article
        className={`min-w-0 rounded-xl border p-4 transition ${
          isLiveMeet
            ? 'border-[#76a35e] bg-[#f8fbf5]'
            : 'border-slate-200 bg-white hover:border-slate-300'
        }`}
        key={b.id}
        data-booking-id={b.id}
      >
        <div className="flex flex-wrap items-start justify-between gap-2.5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-lg border border-[#d6e6cc] bg-[#eef6e8] text-center">
              <span className="text-sm font-bold leading-none text-[#2f581c]">
                {vnDayNumber(b.startsAt)}
              </span>
              <span className="mt-0.5 text-[10px] font-medium uppercase text-[#4d7439]">
                {vnMonthShort(b.startsAt)}
              </span>
            </div>
            <div className="min-w-0">
              <h3 className="truncate font-semibold text-slate-900">{b.displayName}</h3>
              <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                <Clock size={12} className="shrink-0 text-[#5f8b48]" aria-hidden="true" />
                <span>
                  {timeOnly(b.startsAt)} – {timeOnly(b.endsAt)} · {vnDayShort(b.startsAt)}
                </span>
              </p>
            </div>
          </div>
          <span
            className={`shrink-0 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${stateBadgeClass(
              b.state,
              expired,
            )}`}
          >
            {labels[expired ? 'EXPIRED' : b.state] ?? 'Đang cập nhật'}
          </span>
        </div>

        {b.topic && (
          <p className="mt-2.5 text-sm leading-relaxed text-slate-700 break-words">{b.topic}</p>
        )}

        {b.expiresAt && !expired && (
          <p className="mt-1.5 text-xs text-slate-500">
            {b.state === 'HOLD' ? 'Gửi nội dung trước' : 'Hạn phản hồi'}:{' '}
            <span className="font-medium text-slate-700">{stamp(b.expiresAt)}</span>
          </p>
        )}

        {isLiveMeet && b.joinUrl ? (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[#d6e6cc] pt-2.5">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#2f581c]">
              <CheckCircle2 size={14} className="shrink-0 text-[#4d7439]" aria-hidden="true" />
              Phòng Google Meet đang mở
            </span>
            <a
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#5f8b48] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#4d7439]"
              href={b.joinUrl}
              target="_blank"
              rel="noreferrer"
            >
              <Video size={14} aria-hidden="true" />
              Vào Meet
            </a>
          </div>
        ) : (
          b.state === 'CONFIRMED' && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
              <Info size={13} className="shrink-0 text-[#5f8b48]" aria-hidden="true" />
              <span>
                {end <= serverNow
                  ? 'Buổi hẹn đã kết thúc.'
                  : b.linkBlockReason
                    ? 'Đường dẫn Meet đang được giảng viên cập nhật lại.'
                    : hasLinkRevision
                      ? 'Link Google Meet đã sẵn sàng và sẽ mở nút “Vào Meet” đúng giờ hẹn.'
                      : 'Giảng viên sẽ cập nhật link Google Meet và mở nút “Vào Meet” trước giờ hẹn.'}
              </span>
            </p>
          )
        )}

        {(a?.submit ||
          a?.reschedule ||
          a?.cancel ||
          a?.requestReschedule ||
          a?.requestCancel ||
          a?.reportAbsence) && (
          <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-2.5">
            {a?.submit && (
              <button
                type="button"
                className="rounded-lg bg-[#5f8b48] px-3 py-1 text-xs font-semibold text-white transition hover:bg-[#4d7439] disabled:opacity-50"
                disabled={busy || !!last}
                onClick={() => open('SUBMIT')}
              >
                Gửi nội dung tư vấn
              </button>
            )}
            {a?.reschedule && (
              <button
                type="button"
                className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                disabled={busy || !!last}
                onClick={() => open('RESCHEDULE')}
              >
                Đổi giờ
              </button>
            )}
            {a?.cancel && (
              <button
                type="button"
                className="rounded-lg border border-rose-200 px-2.5 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                disabled={busy || !!last}
                onClick={() => open('CANCEL')}
              >
                Hủy lịch
              </button>
            )}
            {a?.requestReschedule && (
              <button
                type="button"
                className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                disabled={busy || !!last}
                onClick={() => open('REQUEST_RESCHEDULE')}
              >
                Đề nghị đổi giờ
              </button>
            )}
            {a?.requestCancel && (
              <button
                type="button"
                className="rounded-lg border border-rose-200 px-2.5 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                disabled={busy || !!last}
                onClick={() => open('REQUEST_CANCEL')}
              >
                Đề nghị hủy
              </button>
            )}
            {a?.reportAbsence && (
              <button
                type="button"
                className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                disabled={busy || !!last}
                onClick={() => open('NO_SHOW')}
              >
                Báo vắng
              </button>
            )}
          </div>
        )}

        {b.changes?.map((c) => (
          <p
            className="mt-2 rounded-lg bg-amber-50/80 px-2.5 py-1.5 text-xs text-amber-900"
            key={c.id}
          >
            <strong>{c.kind === 'CANCEL' ? 'Đề nghị hủy lịch' : 'Đề nghị đổi giờ'}</strong> ·{' '}
            {labels[c.state] ?? 'Đang xem xét'}
            {c.reason ? ` — ${c.reason}` : ''}
          </p>
        ))}

        {b.reports?.map((r) => (
          <div
            className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs text-slate-700"
            key={r.id}
          >
            <p>
              <strong>{r.kind === 'DISPUTE' ? 'Phản hồi báo vắng' : 'Báo cáo vắng'}</strong> ·{' '}
              {r.evidence ?? r.summary}
            </p>
            {a?.disputableReportIds.includes(r.id) && (
              <button
                className="font-semibold text-[#4d7439] underline"
                type="button"
                onClick={() => open('DISPUTE', r.id)}
              >
                Phản hồi
              </button>
            )}
          </div>
        ))}
      </article>
    );
  }

  return (
    <main className="mx-auto min-w-0 max-w-6xl space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Đặt lịch tư vấn 1:1
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Trao đổi 30 phút qua Google Meet (giờ Việt Nam GMT+7) · Miễn phí với giảng viên chuyên môn
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/my/calendar" className="btn-secondary gap-1.5 text-sm">
            <Calendar size={15} aria-hidden="true" />
            Lịch học
          </Link>
          <button
            type="button"
            className="btn-secondary gap-1.5 text-sm"
            disabled={busy}
            onClick={() => void load()}
          >
            <RefreshCw size={15} aria-hidden="true" />
            Tải lại
          </button>
        </div>
      </header>

      {errors.action && (
        <div
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"
        >
          {errors.action}
          {last && (
            <button
              type="button"
              className="btn-secondary ml-2 text-xs"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await command(last);
                })
              }
            >
              Thử lại yêu cầu
            </button>
          )}
        </div>
      )}

      {message && (
        <p
          role="status"
          className="flex items-center gap-2 rounded-xl border border-[#cde0c0] bg-[#eef6e8] p-3.5 text-sm font-medium text-[#2f581c]"
        >
          <CheckCircle2 size={17} className="shrink-0 text-[#4d7439]" aria-hidden="true" />
          <span>{message}</span>
        </p>
      )}

      <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
        <section
          className="min-w-0 space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs"
          aria-labelledby="new-consultation"
        >
          <div className="border-b border-slate-100 pb-3">
            <h2 id="new-consultation" className="flex items-center gap-2 text-lg font-bold text-slate-900">
              <CalendarClock size={20} className="text-[#5f8b48]" aria-hidden="true" />
              Đặt lịch mới
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Chọn giảng viên, chọn ngày & khung giờ 30 phút phù hợp rồi mô tả nội dung muốn trao đổi.
            </p>
          </div>

          {errors.profiles && (
            <p role="alert" className="text-sm text-rose-700">
              {errors.profiles}
            </p>
          )}

          {!profiles && !errors.profiles ? (
            <p role="status" className="text-sm text-slate-500">
              Đang tải giảng viên…
            </p>
          ) : profiles?.length === 0 ? (
            <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
              Chưa có giảng viên mở lịch tư vấn. Bạn có thể quay lại sau để xem lịch mới.
            </p>
          ) : (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                void newBooking();
              }}
            >
              <fieldset disabled={busy || !!last} className="min-w-0 space-y-5">
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-slate-800">1. Chọn giảng viên</p>
                  <div className="grid gap-2">
                    {profiles?.map((p) => {
                      const selected = p.teacherId === teacher;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            setTeacher(p.teacherId);
                            setSlot('');
                            setSelectedDay('');
                            setSlots(undefined);
                            setErrors((v) => ({ ...v, slots: '' }));
                          }}
                          className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition ${
                            selected
                              ? 'border-[#5f8b48] bg-[#f4f9f1] ring-1 ring-[#5f8b48]'
                              : 'border-slate-200 bg-white hover:border-[#9dc088]'
                          }`}
                        >
                          <div
                            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                              selected
                                ? 'bg-[#5f8b48] text-white'
                                : 'bg-[#eef6e8] text-[#2f581c]'
                            }`}
                          >
                            {mentorInitials(p.displayName)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <p className="truncate text-sm font-semibold text-slate-900">
                                {p.displayName}
                              </p>
                              {selected && (
                                <Check size={15} className="shrink-0 text-[#4d7439]" aria-hidden="true" />
                              )}
                            </div>
                            {p.specialties && (
                              <p className="mt-0.5 truncate text-xs text-slate-600">{p.specialties}</p>
                            )}
                            {selected && p.bio && (
                              <p className="mt-1 text-xs leading-relaxed text-slate-500">{p.bio}</p>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-800">2. Chọn ngày & khung giờ</span>
                    {slot && (
                      <span className="text-xs font-medium text-[#3f642c]">
                        Đã chọn: {vnDayShort(slot)} · {timeOnly(slot)}
                      </span>
                    )}
                  </div>

                  {/* Screen-reader & keyboard accessible select backing the visual day/time picker */}
                  <select
                    aria-label="Thời gian tư vấn"
                    className="sr-only"
                    tabIndex={-1}
                    disabled={!teacher || !slots?.length}
                    value={slot}
                    onChange={(e) => {
                      setSlot(e.target.value);
                      if (e.target.value) setSelectedDay(vnDayKey(e.target.value));
                    }}
                  >
                    <option value="">Chọn khung giờ</option>
                    {slots?.map((s) => (
                      <option key={s.startsAt} value={s.startsAt}>
                        {stamp(s.startsAt)}
                      </option>
                    ))}
                  </select>

                  {!teacher ? (
                    <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-3.5 py-3 text-xs text-slate-500">
                      Vui lòng chọn giảng viên ở bước 1 để xem các khung giờ trống trong 14 ngày tới.
                    </p>
                  ) : !slots ? (
                    <p role="status" className="text-xs text-slate-500">
                      Đang tải lịch trống…
                    </p>
                  ) : dayGroups.length > 0 ? (
                    <div className="space-y-2.5">
                      <div className="flex gap-1.5 overflow-x-auto pb-1">
                        {dayGroups.map((dg) => {
                          const activeDay = dg.key === effectiveDay;
                          return (
                            <button
                              key={dg.key}
                              type="button"
                              onClick={() => setSelectedDay(dg.key)}
                              className={`shrink-0 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
                                activeDay
                                  ? 'border-[#5f8b48] bg-[#5f8b48] text-white'
                                  : 'border-slate-200 bg-white text-slate-700 hover:border-[#9dc088]'
                              }`}
                            >
                              {dg.label}
                            </button>
                          );
                        })}
                      </div>
                      {visibleDayGroup && (
                        <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
                          {visibleDayGroup.slots.map((item) => {
                            const picked = slot === item.startsAt;
                            return (
                              <button
                                key={item.startsAt}
                                type="button"
                                onClick={() => setSlot(item.startsAt)}
                                className={`rounded-lg border px-2 py-1.5 text-xs font-semibold transition ${
                                  picked
                                    ? 'border-[#4d7439] bg-[#eef6e8] text-[#2f581c] ring-1 ring-[#5f8b48]'
                                    : 'border-slate-200 bg-white text-slate-700 hover:border-[#76a35e] hover:text-[#2f581c]'
                                }`}
                              >
                                {item.timeLabel}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ) : null}

                  {errors.slots ? (
                    <p role="alert" className="text-xs text-rose-700">
                      {errors.slots}
                    </p>
                  ) : (
                    teacher &&
                    slots?.length === 0 && (
                      <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500">
                        Giảng viên chưa có giờ trống trong 14 ngày tới. Hãy chọn giảng viên khác.
                      </p>
                    )
                  )}
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <label htmlFor="consultation-topic" className="text-sm font-semibold text-slate-800">
                      3. Nội dung muốn trao đổi
                    </label>
                    <span className="text-xs text-slate-400">
                      {topic.trim().length}/10+ ký tự
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {TOPIC_SUGGESTIONS.map((s) => (
                      <button
                        key={s.short}
                        type="button"
                        aria-label={s.text}
                        onClick={() => setTopic(s.text)}
                        className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-700 transition hover:border-[#76a35e] hover:bg-[#eef6e8] hover:text-[#2f581c]"
                      >
                        {s.short}
                      </button>
                    ))}
                  </div>
                  <textarea
                    id="consultation-topic"
                    required
                    minLength={10}
                    maxLength={1000}
                    rows={3}
                    className="input-field text-sm"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    placeholder="Ví dụ: Tôi muốn cải thiện kỹ năng nghe Part 2–3 và sắp xếp thời gian tự học..."
                  />
                </div>

                <div className="space-y-2">
                  <button
                    type="submit"
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#5f8b48] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#4d7439] disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={!teacher || !slot || topic.trim().length < 10 || busy || !!last}
                  >
                    {busy ? 'Đang gửi…' : 'Gửi yêu cầu đặt lịch'}
                  </button>
                  <p className="text-center text-xs text-slate-500">
                    Đổi hoặc hủy trực tiếp trước giờ hẹn 12 tiếng.
                  </p>
                </div>
              </fieldset>
            </form>
          )}
        </section>

        <section
          className="min-w-0 space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs"
          aria-labelledby="my-consultations"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div>
              <h2 id="my-consultations" className="text-lg font-bold text-slate-900">
                Lịch hẹn của tôi
              </h2>
              <p className="text-xs text-slate-500">
                Theo dõi xác nhận giảng viên, đường dẫn Google Meet và đổi/hủy lịch
              </p>
            </div>
            {bookings && (
              <div className="flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
                {(
                  [
                    ['ACTIVE', `Sắp tới (${active.length})`],
                    ['ALL', `Tất cả (${bookings.length})`],
                    ['HISTORY', `Lịch sử (${previous.length})`],
                  ] as const
                ).map(([tabKey, tabLabel]) => (
                  <button
                    key={tabKey}
                    type="button"
                    onClick={() => setBookingTab(tabKey)}
                    className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                      bookingTab === tabKey
                        ? 'bg-[#5f8b48] text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {tabLabel}
                  </button>
                ))}
              </div>
            )}
          </div>

          {errors.bookings ? (
            <p role="alert" className="text-sm text-rose-700">
              {errors.bookings}
            </p>
          ) : !bookings ? (
            <p role="status" className="text-sm text-slate-500">
              Đang tải lịch hẹn…
            </p>
          ) : !bookings.length ? (
            <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
              Bạn chưa có lịch hẹn. Chọn giảng viên và giờ trống bên cạnh để gửi yêu cầu.
            </p>
          ) : displayedBookings.length === 0 ? (
            <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
              Không có lịch hẹn nào trong mục này. Chuyển sang tab “Tất cả” để xem toàn bộ lịch.
            </p>
          ) : (
            <div className="space-y-3">{displayedBookings.map(bookingCard)}</div>
          )}

          <div className="border-t border-slate-100 pt-3">
            <Link to="/my/calendar" className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#4d7439] hover:underline">
              <Calendar size={15} aria-hidden="true" />
              Xem trên Bảng điều khiển lịch học
            </Link>
          </div>
        </section>
      </div>

      {modal && (
        <BookingActionModal
          key={modal.booking.id + modal.action}
          booking={modal.booking}
          action={modal.action}
          busy={busy}
          uncertain={!!last}
          retry={() => {
            if (last)
              void run(async () => {
                await command(last);
              }).then((ok) => {
                if (ok) setModal(undefined);
              });
          }}
          error={errors.action}
          close={() => setModal(undefined)}
          submit={act}
        />
      )}
    </main>
  );
}

function BookingActionModal({
  booking,
  action,
  busy,
  uncertain,
  retry,
  error,
  close,
  submit,
}: {
  booking: ConsultationBooking;
  action: Action;
  busy: boolean;
  uncertain: boolean;
  retry: () => void;
  error?: string;
  close: () => void;
  submit: (reason: string, startsAt: string) => Promise<void>;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    [reason, setReason] = useState(action === 'SUBMIT' ? (booking.topic ?? '') : ''),
    [slots, setSlots] = useState<Slot[]>(),
    [slot, setSlot] = useState(''),
    [loadError, setLoadError] = useState('');
  const reschedule = action.includes('RESCHEDULE');
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null,
      dialog = ref.current!;
    dialog.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      dialog.close();
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []);
  useEffect(() => {
    let live = true;
    if (reschedule)
      void apiFetch<Slot[]>(
        '/v2/consultations/slots?teacherId=' + encodeURIComponent(booking.teacherId),
      )
        .then((s) => {
          if (live) setSlots(s);
        })
        .catch(() => {
          if (live) setLoadError('Chưa tải được giờ trống. Đóng và mở lại để thử lại.');
        });
    return () => {
      live = false;
    };
  }, [booking.teacherId, reschedule]);
  return (
    <dialog
      ref={ref}
      aria-labelledby="consultation-action-title"
      className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-xl backdrop:bg-slate-950/50"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) close();
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <h2 id="consultation-action-title" className="text-xl font-bold text-slate-900">
          {actionTitles[action]}
        </h2>
        <button
          type="button"
          className="shrink-0 rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
          aria-label="Đóng hộp thoại"
          disabled={busy}
          onClick={close}
        >
          <X size={18} />
        </button>
      </div>
      <p className="mt-2 text-sm text-slate-500">
        {booking.displayName} · {stamp(booking.startsAt)}
      </p>
      <form
        className="mt-4 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit(reason.trim(), slot);
        }}
      >
        {reschedule && (
          <label className="block text-sm font-semibold text-slate-800">
            Giờ mới
            <select
              required
              className="input-field mt-1 text-sm"
              value={slot}
              onChange={(e) => setSlot(e.target.value)}
            >
              <option value="">{!slots ? 'Đang tải giờ trống…' : 'Chọn giờ khác'}</option>
              {slots?.map((s) => (
                <option key={s.startsAt} value={s.startsAt}>
                  {stamp(s.startsAt)}
                </option>
              ))}
            </select>
            {loadError && (
              <p role="alert" className="mt-2 text-sm text-rose-700">
                {loadError}
              </p>
            )}
            {slots?.length === 0 && (
              <p className="mt-2 text-sm text-slate-500">Chưa có giờ trống để đổi.</p>
            )}
          </label>
        )}
        <label className="block text-sm font-semibold text-slate-800">
          {action === 'SUBMIT'
            ? 'Nội dung tư vấn'
            : action === 'NO_SHOW' || action === 'DISPUTE'
              ? 'Nội dung và căn cứ'
              : 'Lý do'}
          <textarea
            disabled={busy || uncertain}
            required
            minLength={10}
            maxLength={action === 'NO_SHOW' || action === 'DISPUTE' ? 2000 : 1000}
            rows={4}
            className="input-field mt-1 text-sm"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        <p className="text-xs text-slate-500">
          Ít nhất 10 ký tự.{' '}
          {action.startsWith('REQUEST_')
            ? 'Đề nghị được gửi để xem xét; lịch cũ được giữ đến khi có quyết định.'
            : action === 'NO_SHOW'
              ? 'Báo cáo cần phản ánh điều đã xảy ra, không tự thay đổi điểm danh lớp học.'
              : 'Thao tác được kiểm tra theo trạng thái và thời gian hiện tại.'}
        </p>
        {error && (
          <p role="alert" className="text-sm text-rose-700">
            {error}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className="btn-secondary text-sm" disabled={busy} onClick={close}>
            Quay lại
          </button>
          {uncertain ? (
            <button
              type="button"
              className="rounded-xl bg-[#5f8b48] px-4 py-2 text-sm font-semibold text-white hover:bg-[#4d7439] disabled:opacity-50"
              disabled={busy}
              onClick={retry}
            >
              Thử lại yêu cầu
            </button>
          ) : (
            <button
              type="submit"
              className="rounded-xl bg-[#5f8b48] px-4 py-2 text-sm font-semibold text-white hover:bg-[#4d7439] disabled:opacity-50"
              disabled={busy || reason.trim().length < 10 || (reschedule && !slot)}
            >
              {busy ? 'Đang gửi…' : action === 'CANCEL' ? 'Xác nhận hủy' : 'Gửi yêu cầu'}
            </button>
          )}
        </div>
      </form>
    </dialog>
  );
}
