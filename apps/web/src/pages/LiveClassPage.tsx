import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { engagementApi } from '@/features/engagement/api';

type LiveData = Awaited<ReturnType<typeof engagementApi.liveClass>>;
export function LiveClassPage() {
  const { enrollmentId = '' } = useParams();
  const [data, setData] = useState<LiveData | null>(null);
  useEffect(() => {
    void engagementApi.liveClass(enrollmentId).then(setData);
  }, [enrollmentId]);
  if (!data) return <p role="status">Đang tải lớp trực tuyến…</p>;
  return (
    <section className="space-y-5">
      <h2 className="text-2xl font-black">Lớp học trực tuyến</h2>
      {data.classOffering.scheduleSlots.map((slot) => (
        <article className="rounded-2xl border bg-white p-5" key={slot.id}>
          <strong>Thứ {slot.dayOfWeek + 1}</strong>
          <p>
            {new Date(slot.startTime).toLocaleTimeString('vi-VN')} –{' '}
            {new Date(slot.endTime).toLocaleTimeString('vi-VN')}
          </p>
          {slot.meetingUrl ? (
            <a className="btn-primary mt-4" href={slot.meetingUrl} rel="noreferrer" target="_blank">
              Vào phòng học
            </a>
          ) : (
            <p className="mt-2 text-amber-700">Chưa có liên kết phòng học.</p>
          )}
        </article>
      ))}
    </section>
  );
}
