import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router';
import type { Consultation } from '@/features/engagement/api';
import { engagementApi } from '@/features/engagement/api';

const labels: Record<string, string> = {
  REQUESTED: 'Đang chờ xác nhận',
  CONFIRMED: 'Sắp diễn ra',
  DECLINED: 'Đã từ chối',
  CANCELLED: 'Học viên đã hủy',
  COMPLETED: 'Đã hoàn tất',
};
type Draft = {
  confirmedStartAt: string;
  durationMinutes: number;
  meetingUrl: string;
  declineReason: string;
  instructorNote: string;
};
const makeDraft = (item: Consultation): Draft => ({
  confirmedStartAt: (item.confirmedStartAt ?? item.requestedStartAt).slice(0, 16),
  durationMinutes: item.durationMinutes,
  meetingUrl: item.meetingUrl ?? '',
  declineReason: item.declineReason ?? '',
  instructorNote: item.instructorNote ?? '',
});

export function InstructorConsultationsPage() {
  const { classOfferingId = '' } = useParams();
  const [items, setItems] = useState<Consultation[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const load = useCallback(() => {
    return engagementApi.consultations
      .instructor(classOfferingId)
      .then((data) => {
        setItems(data);
        setDrafts(Object.fromEntries(data.map((item) => [item.id, makeDraft(item)])));
        setState('ready');
      })
      .catch(() => setState('error'));
  }, [classOfferingId]);
  useEffect(() => void load(), [load]);
  const setDraft = (id: string, value: Partial<Draft>) =>
    setDrafts((current) => ({ ...current, [id]: { ...current[id]!, ...value } }));
  const update = async (item: Consultation, status: string) => {
    const draft = drafts[item.id]!;
    await engagementApi.consultations.update(classOfferingId, item.id, {
      status,
      ...(status === 'CONFIRMED'
        ? {
            confirmedStartAt: new Date(draft.confirmedStartAt).toISOString(),
            durationMinutes: draft.durationMinutes,
            meetingUrl: draft.meetingUrl || undefined,
            instructorNote: draft.instructorNote || undefined,
          }
        : {}),
      ...(status === 'DECLINED'
        ? { declineReason: draft.declineReason, instructorNote: draft.instructorNote || undefined }
        : {}),
      ...(status === 'COMPLETED' ? { instructorNote: draft.instructorNote || undefined } : {}),
    });
    await load();
  };
  const groups = [
    ['Yêu cầu mới', items.filter((item) => item.status === 'REQUESTED')],
    ['Sắp diễn ra', items.filter((item) => item.status === 'CONFIRMED')],
    ['Lịch sử', items.filter((item) => !['REQUESTED', 'CONFIRMED'].includes(item.status))],
  ] as const;
  if (state === 'loading') return <p role="status">Đang tải lịch tư vấn…</p>;
  if (state === 'error')
    return (
      <div className="state-error" role="alert">
        Không thể tải lịch tư vấn.{' '}
        <button className="btn-secondary ml-2" onClick={() => void load()}>
          Thử lại
        </button>
      </div>
    );
  return (
    <section className="space-y-8">
      <h2 className="text-2xl font-black">Yêu cầu tư vấn</h2>
      {groups.map(([title, rows]) => (
        <div key={title}>
          <h3 className="text-xl font-bold">{title}</h3>
          {rows.length === 0 ? (
            <p className="mt-3 text-slate-500">Không có yêu cầu.</p>
          ) : (
            <div className="mt-3 space-y-4">
              {rows.map((item) => {
                const draft = drafts[item.id]!;
                return (
                  <article className="rounded-2xl border bg-white p-5" key={item.id}>
                    <div className="flex flex-wrap justify-between gap-2">
                      <strong>
                        {item.enrollment?.learner.fullName} · {item.topic}
                      </strong>
                      <span>{labels[item.status] ?? item.status}</span>
                    </div>
                    <p className="mt-2 text-sm text-slate-600">
                      Mong muốn: {new Date(item.requestedStartAt).toLocaleString('vi-VN')} ·{' '}
                      {item.durationMinutes} phút
                    </p>
                    {item.learnerNote ? (
                      <p className="mt-2">Ghi chú học viên: {item.learnerNote}</p>
                    ) : null}
                    {['REQUESTED', 'CONFIRMED'].includes(item.status) ? (
                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        <label>
                          <span className="text-sm font-semibold">Thời gian xác nhận</span>
                          <input
                            className="input-field mt-1"
                            onChange={(e) =>
                              setDraft(item.id, { confirmedStartAt: e.target.value })
                            }
                            type="datetime-local"
                            value={draft.confirmedStartAt}
                          />
                        </label>
                        <label>
                          <span className="text-sm font-semibold">Thời lượng</span>
                          <select
                            className="input-field mt-1"
                            onChange={(e) =>
                              setDraft(item.id, { durationMinutes: Number(e.target.value) })
                            }
                            value={draft.durationMinutes}
                          >
                            {[15, 30, 45, 60].map((value) => (
                              <option key={value}>{value}</option>
                            ))}
                          </select>
                        </label>
                        <label>
                          <span className="text-sm font-semibold">Liên kết phòng tư vấn</span>
                          <input
                            className="input-field mt-1"
                            onChange={(e) => setDraft(item.id, { meetingUrl: e.target.value })}
                            placeholder="https://…"
                            type="url"
                            value={draft.meetingUrl}
                          />
                        </label>
                        <label>
                          <span className="text-sm font-semibold">
                            Ghi chú riêng của giảng viên
                          </span>
                          <textarea
                            className="input-field mt-1"
                            onChange={(e) => setDraft(item.id, { instructorNote: e.target.value })}
                            value={draft.instructorNote}
                          />
                        </label>
                        {item.status === 'REQUESTED' ? (
                          <label className="md:col-span-2">
                            <span className="text-sm font-semibold">Lý do từ chối</span>
                            <input
                              className="input-field mt-1"
                              onChange={(e) => setDraft(item.id, { declineReason: e.target.value })}
                              value={draft.declineReason}
                            />
                          </label>
                        ) : null}
                      </div>
                    ) : item.instructorNote ? (
                      <p className="mt-2 text-sm text-slate-600">
                        Ghi chú riêng: {item.instructorNote}
                      </p>
                    ) : null}
                    <div className="mt-4 flex flex-wrap gap-2">
                      {item.status === 'REQUESTED' ? (
                        <>
                          <button
                            className="btn-primary"
                            onClick={() => void update(item, 'CONFIRMED')}
                          >
                            Xác nhận
                          </button>
                          <button
                            className="btn-secondary"
                            disabled={!draft.declineReason.trim()}
                            onClick={() => void update(item, 'DECLINED')}
                          >
                            Từ chối
                          </button>
                        </>
                      ) : null}
                      {item.status === 'CONFIRMED' ? (
                        <>
                          <button
                            className="btn-secondary"
                            onClick={() => void update(item, 'CONFIRMED')}
                          >
                            Lưu lịch mới
                          </button>
                          <button
                            className="btn-primary"
                            onClick={() => void update(item, 'COMPLETED')}
                          >
                            Đánh dấu hoàn tất
                          </button>
                        </>
                      ) : null}
                    </div>
                    {item.declineReason ? (
                      <p className="mt-3 text-rose-700">Lý do: {item.declineReason}</p>
                    ) : null}
                  </article>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </section>
  );
}
