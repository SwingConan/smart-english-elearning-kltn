import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { Consultation, engagementApi } from '@/features/engagement/api';
export function InstructorConsultationsPage() {
  const { classOfferingId = '' } = useParams();
  const [items, setItems] = useState<Consultation[]>([]);
  const load = useCallback(
    () => engagementApi.consultations.instructor(classOfferingId).then(setItems),
    [classOfferingId],
  );
  useEffect(() => {
    void load();
  }, [load]);
  const action = (item: Consultation, status: string) => {
    const input: Record<string, unknown> = { status };
    if (status === 'CONFIRMED') {
      input.confirmedStartAt = item.requestedStartAt;
      input.meetingUrl =
        item.meetingUrl || window.prompt('Liên kết HTTP(S) phòng tư vấn') || undefined;
    }
    if (status === 'DECLINED')
      input.declineReason = window.prompt('Lý do từ chối') || 'Không thể sắp xếp';
    void engagementApi.consultations.update(classOfferingId, item.id, input).then(load);
  };
  return (
    <section className="space-y-5">
      <h2 className="text-2xl font-black">Yêu cầu tư vấn</h2>
      {items.map((item) => (
        <article className="rounded-2xl border bg-white p-5" key={item.id}>
          <div className="flex justify-between">
            <strong>
              {item.enrollment?.learner.fullName} · {item.topic}
            </strong>
            <span>{item.status}</span>
          </div>
          <p className="mt-2">{new Date(item.requestedStartAt).toLocaleString('vi-VN')}</p>
          <div className="mt-4 flex gap-2">
            {item.status === 'REQUESTED' ? (
              <>
                <button className="btn-primary" onClick={() => action(item, 'CONFIRMED')}>
                  Xác nhận
                </button>
                <button className="btn-secondary" onClick={() => action(item, 'DECLINED')}>
                  Từ chối
                </button>
              </>
            ) : null}
            {item.status === 'CONFIRMED' ? (
              <button className="btn-primary" onClick={() => action(item, 'COMPLETED')}>
                Đánh dấu hoàn tất
              </button>
            ) : null}
          </div>
        </article>
      ))}
    </section>
  );
}
