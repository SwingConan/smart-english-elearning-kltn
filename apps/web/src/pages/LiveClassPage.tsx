import { CalendarDays, Clock3, ExternalLink, MapPin, Radio } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { SectionHeader, StatusBadge } from '@/components/ui/ProductPrimitives';
import { engagementApi, type LiveOccurrence } from '@/features/engagement/api';
import { ApiError } from '@/lib/api-client';

type LiveData = Awaited<ReturnType<typeof engagementApi.liveClass>>;
const labels = {
  LIVE: 'Đang diễn ra',
  UPCOMING: 'Sắp diễn ra',
  ENDED: 'Đã kết thúc',
  NO_LINK: 'Chưa có liên kết',
} as const;
const formatTime = (value: string) =>
  new Date(value).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

export function LiveClassPage() {
  const { enrollmentId = '' } = useParams();
  const [data, setData] = useState<LiveData | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'offline' | 'error'>('loading');
  const load = useCallback(async () => {
    try {
      setData(await engagementApi.liveClass(enrollmentId));
      setState('ready');
    } catch (error) {
      setState(error instanceof ApiError && error.status === 400 ? 'offline' : 'error');
    }
  }, [enrollmentId]);
  useEffect(() => {
    void Promise.resolve().then(() => load());
  }, [load]);
  if (state === 'loading')
    return <div className="h-72 animate-pulse rounded-3xl bg-slate-200" role="status" />;
  if (state === 'offline')
    return <div className="state-empty">Lớp này không cấu hình phòng học trực tuyến.</div>;
  if (state === 'error' || !data)
    return (
      <div className="state-error" role="alert">
        Không thể tải lịch lớp trực tuyến.{' '}
        <button className="underline" onClick={() => void load()}>
          Thử lại
        </button>
      </div>
    );
  const occurrences =
    data.occurrences ??
    data.classOffering.scheduleSlots.map((slot) => ({
      id: slot.id,
      scheduleSlotId: slot.id,
      date: '',
      dayOfWeek: slot.dayOfWeek,
      startAt: slot.startTime,
      endAt: slot.endTime,
      status: slot.meetingUrl ? ('LIVE' as const) : ('NO_LINK' as const),
      modality: data.classOffering.modality,
      locationText: slot.locationText,
      meetingAvailable: Boolean(slot.meetingUrl),
      joinUrl: slot.meetingUrl,
    }));
  const next =
    occurrences.find((item) => item.status === 'LIVE') ??
    occurrences.find((item) => ['UPCOMING', 'NO_LINK'].includes(item.status));
  return (
    <section className="space-y-6">
      <SectionHeader
        title="Lớp học trực tuyến"
        description={`${data.classOffering.name} · ${data.classOffering.modality === 'HYBRID' ? 'Học kết hợp (HYBRID)' : 'Học trực tuyến (ONLINE)'} · ${data.classOffering.instructor?.fullName ?? 'Chưa phân công giảng viên'}`}
      />
      {next ? (
        <article className="overflow-hidden rounded-3xl bg-slate-950 p-6 text-white shadow-xl sm:p-8">
          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div>
              <StatusBadge
                tone={
                  next.status === 'LIVE' ? 'danger' : next.status === 'NO_LINK' ? 'warning' : 'info'
                }
              >
                {labels[next.status]}
              </StatusBadge>
              <p className="mt-5 text-sm font-bold uppercase tracking-widest text-sky-300">
                Buổi học tiếp theo
              </p>
              <h3 className="mt-2 text-3xl font-black">
                {new Date(next.startAt).toLocaleDateString('vi-VN', {
                  weekday: 'long',
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                })}
              </h3>
              <p className="mt-3 text-lg text-slate-300">
                <Clock3 className="mr-2 inline" />
                {formatTime(next.startAt)} – {formatTime(next.endAt)} ·{' '}
                {next.modality === 'HYBRID' ? 'Kết hợp' : 'Trực tuyến'}
              </p>
              {next.locationText ? (
                <p className="mt-2 text-slate-300">
                  <MapPin className="mr-2 inline" size={17} />
                  {next.locationText}
                </p>
              ) : null}
            </div>
            {next.status === 'LIVE' && next.joinUrl ? (
              <a
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-rose-500 px-6 py-3 font-black text-white shadow-lg transition hover:bg-rose-400"
                href={next.joinUrl}
                rel="noreferrer"
                target="_blank"
              >
                <Radio size={18} /> Vào phòng học <ExternalLink size={16} />
              </a>
            ) : (
              <p className="max-w-xs rounded-xl bg-white/10 p-4 text-sm text-slate-200">
                {next.status === 'NO_LINK'
                  ? 'Liên kết chưa được cập nhật. Hệ thống sẽ không hiển thị URL trước khi buổi học thực sự diễn ra.'
                  : 'Nút tham gia chỉ mở trong thời gian buổi học.'}
              </p>
            )}
          </div>
        </article>
      ) : (
        <div className="state-empty">Chưa có buổi học nào trong lịch sắp tới.</div>
      )}
      <div className="rounded-3xl border bg-white p-6 shadow-sm">
        <SectionHeader
          title="Lịch gần đây và sắp tới"
          description="Lịch được tạo từ khoảng ngày của lớp và thời khóa biểu lặp theo múi giờ Việt Nam."
        />
        <div className="mt-5 divide-y">
          {occurrences.map((item) => (
            <OccurrenceRow item={item} key={item.id} />
          ))}
        </div>
      </div>
    </section>
  );
}

function OccurrenceRow({ item }: { item: LiveOccurrence }) {
  return (
    <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center">
      <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-700">
        <CalendarDays size={21} />
      </div>
      <div className="min-w-0 flex-1">
        <strong>
          {new Date(item.startAt).toLocaleDateString('vi-VN', {
            weekday: 'long',
            day: '2-digit',
            month: '2-digit',
          })}
        </strong>
        <p className="text-sm text-slate-500">
          {formatTime(item.startAt)} – {formatTime(item.endAt)} ·{' '}
          {item.modality === 'HYBRID' ? 'Kết hợp' : 'Trực tuyến'}
        </p>
        {item.status === 'NO_LINK' ? (
          <p className="mt-1 text-sm text-amber-800">
            Giảng viên/điều phối viên chưa cập nhật liên kết học trực tuyến.
          </p>
        ) : null}
      </div>
      <StatusBadge
        tone={
          item.status === 'LIVE'
            ? 'danger'
            : item.status === 'ENDED'
              ? 'neutral'
              : item.status === 'NO_LINK'
                ? 'warning'
                : 'info'
        }
      >
        {labels[item.status]}
      </StatusBadge>
      {item.status === 'LIVE' && item.joinUrl ? (
        <a
          aria-label="Tham gia buổi học trong danh sách"
          className="btn-primary"
          href={item.joinUrl}
          rel="noreferrer"
          target="_blank"
        >
          <ExternalLink size={16} /> Tham gia
        </a>
      ) : null}
    </div>
  );
}
