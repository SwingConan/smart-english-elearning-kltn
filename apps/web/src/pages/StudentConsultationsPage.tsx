import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { Consultation, engagementApi } from '@/features/engagement/api';

export function StudentConsultationsPage() {
  const { enrollmentId = '' } = useParams();
  const [items, setItems] = useState<Consultation[]>([]);
  const [topic, setTopic] = useState('');
  const [start, setStart] = useState('');
  const load = useCallback(
    () => engagementApi.consultations.mine(enrollmentId).then(setItems),
    [enrollmentId],
  );
  useEffect(() => {
    void load();
  }, [load]);
  const create = async (event: FormEvent) => {
    event.preventDefault();
    await engagementApi.consultations.create(enrollmentId, {
      topic,
      requestedStartAt: new Date(start).toISOString(),
      durationMinutes: 30,
    });
    setTopic('');
    setStart('');
    await load();
  };
  return (
    <section className="space-y-6">
      <h2 className="text-2xl font-black">Tư vấn với giảng viên</h2>
      <form
        className="grid gap-3 rounded-2xl border bg-white p-5 sm:grid-cols-2"
        onSubmit={(e) => void create(e)}
      >
        <input
          className="rounded-xl border p-3"
          onChange={(e) => setTopic(e.target.value)}
          placeholder="Chủ đề cần tư vấn"
          required
          value={topic}
        />
        <input
          className="rounded-xl border p-3"
          min={new Date().toISOString().slice(0, 16)}
          onChange={(e) => setStart(e.target.value)}
          required
          type="datetime-local"
          value={start}
        />
        <button className="btn-primary sm:col-span-2">Gửi yêu cầu</button>
      </form>
      {items.map((item) => (
        <article className="rounded-2xl border bg-white p-5" key={item.id}>
          <div className="flex justify-between">
            <strong>{item.topic}</strong>
            <span>{item.status}</span>
          </div>
          <p className="mt-2 text-sm text-slate-600">
            {new Date(item.confirmedStartAt ?? item.requestedStartAt).toLocaleString('vi-VN')}
          </p>
          {['REQUESTED', 'CONFIRMED'].includes(item.status) ? (
            <button
              className="mt-3 text-sm font-semibold text-rose-700"
              onClick={() =>
                void engagementApi.consultations.cancel(enrollmentId, item.id).then(load)
              }
            >
              Hủy yêu cầu
            </button>
          ) : null}
        </article>
      ))}
    </section>
  );
}
