import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { engagementApi } from '@/features/engagement/api';
import { ApiError } from '@/lib/api-client';

type LiveData = Awaited<ReturnType<typeof engagementApi.liveClass>>;
const day = (value: number) => (value === 7 ? 'Chủ nhật' : `Thứ ${value + 1}`);
const time = (value: string) =>
  new Date(value).toLocaleTimeString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  });
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
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  if (state === 'loading') return <p role="status">Đang tải lớp trực tuyến…</p>;
  if (state === 'offline')
    return <div className="state-empty">Lớp này không cấu hình phòng học trực tuyến.</div>;
  if (state === 'error')
    return (
      <div className="state-error" role="alert">
        Không thể tải phòng học trực tuyến.{' '}
        <button className="underline" onClick={() => void load()}>
          Thử lại
        </button>
      </div>
    );
  if (!data) return null;
  return (
    <section className="space-y-5">
      <header>
        <h2 className="text-2xl font-black">Lớp học trực tuyến</h2>
        <p>
          {data.classOffering.name} ·{' '}
          {data.classOffering.modality === 'HYBRID'
            ? 'Học kết hợp (HYBRID)'
            : 'Học trực tuyến (ONLINE)'}
        </p>
      </header>
      {data.classOffering.scheduleSlots.length === 0 ? (
        <div className="state-empty">Lịch học đang được cập nhật.</div>
      ) : null}
      {data.classOffering.scheduleSlots.map((slot) => (
        <article className="rounded-2xl border bg-white p-5" key={slot.id}>
          <strong>{day(slot.dayOfWeek)}</strong>
          <p>
            {time(slot.startTime)} – {time(slot.endTime)}
          </p>
          {slot.meetingUrl ? (
            <a className="btn-primary mt-4" href={slot.meetingUrl} rel="noreferrer" target="_blank">
              Vào phòng học
            </a>
          ) : (
            <p className="mt-2 text-amber-800">
              Giảng viên/điều phối viên chưa cập nhật liên kết học trực tuyến.
            </p>
          )}
        </article>
      ))}
    </section>
  );
}
