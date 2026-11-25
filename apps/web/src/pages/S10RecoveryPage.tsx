import { useRef, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
type Review = {
  state: { epoch: string; phase: string; resetCount: number };
  events: Array<{
    id: string;
    action: string;
    reason: string | null;
    createdAt: string;
    accepted: boolean;
  }>;
};
export function S10RecoveryPage() {
  const [attempt, setAttempt] = useState(''),
    [question, setQuestion] = useState(''),
    [reason, setReason] = useState('');
  const [review, setReview] = useState<Review | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const key = useRef(crypto.randomUUID());
  const base = `/placement/attempts/${encodeURIComponent(attempt)}/tasks/${encodeURIComponent(question)}/s10/recovery`;
  const load = async () => {
    setBusy(true);
    setError('');
    setReview(null);
    try {
      setReview(await apiFetch<Review>(base));
      key.current = crypto.randomUUID();
    } catch {
      setError('Không thể mở hồ sơ. Cần quyền recovery riêng và mã bài làm/câu hỏi hợp lệ.');
    } finally {
      setBusy(false);
    }
  };
  const reset = async () => {
    if (!review || busy) return;
    setBusy(true);
    setError('');
    try {
      await apiFetch(base, {
        method: 'POST',
        body: JSON.stringify({ epoch: review.state.epoch, key: key.current, reason }),
      });
      setReview(await apiFetch<Review>(base));
      setReason('');
    } catch {
      setError(
        'Chưa xác nhận khôi phục. Tải lại hồ sơ để đối chiếu nhật ký; không tạo yêu cầu khác khi chưa rõ kết quả.',
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="space-y-4 p-6">
      <h1 className="text-xl font-bold">Học vụ · xem xét khôi phục S10</h1>
      <p>
        Chỉ học vụ được cấp quyền recovery riêng có thể duyệt tối đa một lần. Không bù thời gian
        toàn bài thi.
      </p>
      <label className="block">
        Mã attempt
        <input
          className="block w-full border p-2"
          value={attempt}
          onChange={(e) => {
            setAttempt(e.target.value);
            setReview(null);
          }}
        />
      </label>
      <label className="block">
        Mã câu hỏi
        <input
          className="block w-full border p-2"
          value={question}
          onChange={(e) => {
            setQuestion(e.target.value);
            setReview(null);
          }}
        />
      </label>
      <button type="button" disabled={busy || !attempt || !question} onClick={() => void load()}>
        Mở hồ sơ
      </button>
      {error ? <p role="alert">{error}</p> : null}
      {review ? (
        <>
          <p>
            Trạng thái: {review.state.phase} · Đã reset: {review.state.resetCount}/1
          </p>
          <ul>
            {review.events.map((e) => (
              <li key={e.id}>
                {e.createdAt} · {e.action} · {e.accepted ? 'Chấp nhận' : 'Từ chối'} {e.reason}
              </li>
            ))}
          </ul>
          <label className="block">
            Lý do học vụ
            <textarea
              maxLength={500}
              className="block w-full border p-2"
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                key.current = crypto.randomUUID();
              }}
            />
          </label>
          <button
            type="button"
            disabled={
              busy ||
              review.state.phase !== 'BLOCKED_REVIEW' ||
              review.state.resetCount !== 0 ||
              reason.trim().length < 10
            }
            onClick={() => void reset()}
          >
            Duyệt một epoch S10 mới
          </button>
        </>
      ) : null}
    </section>
  );
}
