import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { certificateApi, CompletionPolicy } from '@/features/certificates/api';

export function AdminCompletionPolicyPage() {
  const { classOfferingId = '' } = useParams();
  const [form, setForm] = useState<CompletionPolicy | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const load = useCallback(async () => {
    try {
      setForm(await certificateApi.policy(classOfferingId));
      setState('ready');
    } catch {
      setState('error');
    }
  }, [classOfferingId]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  if (state === 'loading') return <p role="status">Đang tải tiêu chí hoàn thành…</p>;
  if (state === 'error')
    return (
      <div className="state-error" role="alert">
        Không thể tải tiêu chí hoàn thành.{' '}
        <button className="underline" onClick={() => void load()}>
          Thử lại
        </button>
      </div>
    );
  if (!form) return null;
  const lockMessage =
    form.lockReason === 'CLASS_COMPLETED'
      ? 'Lớp đã hoàn thành nên tiêu chí đã khóa.'
      : form.lockReason === 'COMPLETION_EXISTS'
        ? 'Đã có học viên hoàn thành nên tiêu chí đã khóa để bảo toàn lịch sử.'
        : '';
  const save = async () => {
    setMessage('');
    try {
      await certificateApi.savePolicy(classOfferingId, {
        minLessonCompletionPercent: form.minLessonCompletionPercent,
        minAttendancePercent: form.minAttendancePercent,
        requireFinalAssessment: form.requireFinalAssessment,
      });
      setMessage('Đã lưu tiêu chí hoàn thành.');
      await load();
    } catch {
      setMessage('Không thể lưu tiêu chí. Vui lòng kiểm tra và thử lại.');
    }
  };
  return (
    <section>
      <h1 className="text-3xl font-black">Tiêu chí hoàn thành khóa học</h1>
      <p className="mt-2 max-w-2xl text-slate-600">
        Đây là tiêu chí vận hành để xác định hoàn thành khóa học, không phải tiêu chí cấp điểm TOEIC
        chính thức.
      </p>
      {form.locked ? (
        <p className="mt-4 rounded-xl bg-amber-50 p-4 text-amber-900">{lockMessage}</p>
      ) : null}
      <fieldset
        className="mt-6 grid max-w-xl gap-4 rounded-2xl border bg-white p-6"
        disabled={form.locked}
      >
        <label>
          <span>Hoàn thành bài học (%)</span>
          <input
            className="input-field mt-2"
            max={100}
            min={0}
            onChange={(e) =>
              setForm({ ...form, minLessonCompletionPercent: Number(e.target.value) })
            }
            type="number"
            value={form.minLessonCompletionPercent}
          />
        </label>
        <label>
          <span>Điểm danh tối thiểu (%)</span>
          <input
            className="input-field mt-2"
            max={100}
            min={0}
            onChange={(e) =>
              setForm({
                ...form,
                minAttendancePercent: e.target.value === '' ? null : Number(e.target.value),
              })
            }
            type="number"
            value={form.minAttendancePercent ?? ''}
          />
        </label>
        <label className="flex gap-2">
          <input
            checked={form.requireFinalAssessment}
            onChange={(e) => setForm({ ...form, requireFinalAssessment: e.target.checked })}
            type="checkbox"
          />{' '}
          Yêu cầu đánh giá cuối khóa
        </label>
        <button className="btn-primary" onClick={() => void save()} type="button">
          Lưu tiêu chí
        </button>
      </fieldset>
      {message ? (
        <p className="mt-4" role="status">
          {message}
        </p>
      ) : null}
    </section>
  );
}
