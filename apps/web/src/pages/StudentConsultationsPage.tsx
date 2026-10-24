import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router';
import type { Consultation } from '@/features/engagement/api';
import { engagementApi } from '@/features/engagement/api';

const labels: Record<string, string> = {
  REQUESTED: 'Đang chờ xác nhận',
  CONFIRMED: 'Đã xác nhận',
  DECLINED: 'Đã từ chối',
  CANCELLED: 'Đã hủy',
  COMPLETED: 'Đã hoàn tất',
};

export function StudentConsultationsPage() {
  const { enrollmentId = '' } = useParams();
  const [items, setItems] = useState<Consultation[]>([]);
  const [form, setForm] = useState({ topic: '', start: '', durationMinutes: 30, learnerNote: '' });
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const load = useCallback(() => {
    return engagementApi.consultations
      .mine(enrollmentId)
      .then((data) => {
        setItems(data);
        setState('ready');
      })
      .catch(() => setState('error'));
  }, [enrollmentId]);
  useEffect(() => void load(), [load]);
  const create = async (event: FormEvent) => {
    event.preventDefault();
    await engagementApi.consultations.create(enrollmentId, {
      topic: form.topic,
      requestedStartAt: new Date(form.start).toISOString(),
      durationMinutes: form.durationMinutes,
      learnerNote: form.learnerNote || undefined,
    });
    setForm({ topic: '', start: '', durationMinutes: 30, learnerNote: '' });
    await load();
  };
  return (
    <section className="space-y-6">
      <h2 className="text-2xl font-black">Tư vấn với giảng viên</h2>
      <form className="grid gap-4 rounded-2xl border bg-white p-5 sm:grid-cols-2" onSubmit={create}>
        <label>
          <span className="text-sm font-semibold">Chủ đề</span>
          <input
            className="input-field mt-1"
            minLength={3}
            onChange={(e) => setForm({ ...form, topic: e.target.value })}
            required
            value={form.topic}
          />
        </label>
        <label>
          <span className="text-sm font-semibold">Thời gian mong muốn</span>
          <input
            className="input-field mt-1"
            min={new Date().toISOString().slice(0, 16)}
            onChange={(e) => setForm({ ...form, start: e.target.value })}
            required
            type="datetime-local"
            value={form.start}
          />
        </label>
        <label>
          <span className="text-sm font-semibold">Thời lượng</span>
          <select
            className="input-field mt-1"
            onChange={(e) => setForm({ ...form, durationMinutes: Number(e.target.value) })}
            value={form.durationMinutes}
          >
            {[15, 30, 45, 60].map((value) => (
              <option key={value} value={value}>
                {value} phút
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="text-sm font-semibold">Ghi chú cho giảng viên (không bắt buộc)</span>
          <textarea
            className="input-field mt-1"
            onChange={(e) => setForm({ ...form, learnerNote: e.target.value })}
            value={form.learnerNote}
          />
        </label>
        <button className="btn-primary sm:col-span-2">Gửi yêu cầu</button>
      </form>
      {state === 'loading' ? (
        <p role="status">Đang tải yêu cầu…</p>
      ) : state === 'error' ? (
        <div className="state-error" role="alert">
          Không thể tải yêu cầu.{' '}
          <button className="btn-secondary ml-2" onClick={() => void load()}>
            Thử lại
          </button>
        </div>
      ) : items.length === 0 ? (
        <div className="state-empty">Bạn chưa có yêu cầu tư vấn nào.</div>
      ) : (
        items.map((item) => (
          <article className="rounded-2xl border bg-white p-5" key={item.id}>
            <div className="flex flex-wrap justify-between gap-2">
              <strong>{item.topic}</strong>
              <span>{labels[item.status] ?? item.status}</span>
            </div>
            <p className="mt-2 text-sm text-slate-600">
              Thời gian {item.confirmedStartAt ? 'đã xác nhận' : 'mong muốn'}:{' '}
              {new Date(item.confirmedStartAt ?? item.requestedStartAt).toLocaleString('vi-VN')} ·{' '}
              {item.durationMinutes} phút
            </p>
            {item.learnerNote ? <p className="mt-2">Ghi chú của bạn: {item.learnerNote}</p> : null}
            {item.declineReason ? (
              <p className="mt-2 text-rose-700">Lý do từ chối: {item.declineReason}</p>
            ) : null}
            {item.status === 'CONFIRMED' && item.meetingUrl ? (
              <a
                className="btn-primary mt-3"
                href={item.meetingUrl}
                rel="noreferrer"
                target="_blank"
              >
                Mở phòng tư vấn
              </a>
            ) : null}
            {['REQUESTED', 'CONFIRMED'].includes(item.status) ? (
              <button
                className="mt-3 block text-sm font-semibold text-rose-700"
                onClick={() =>
                  void engagementApi.consultations.cancel(enrollmentId, item.id).then(load)
                }
              >
                Hủy yêu cầu
              </button>
            ) : null}
          </article>
        ))
      )}
    </section>
  );
}
