import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { certificateApi } from '@/features/certificates/api';
export function AdminCompletionPolicyPage() {
  const { classOfferingId = '' } = useParams();
  const [form, setForm] = useState({
    minLessonCompletionPercent: 100,
    minAttendancePercent: null as number | null,
    requireFinalAssessment: true,
  });
  const [msg, setMsg] = useState('');
  useEffect(() => {
    void certificateApi.policy(classOfferingId).then(setForm);
  }, [classOfferingId]);
  return (
    <section>
      <h1 className="text-3xl font-black">Chính sách hoàn thành</h1>
      <div className="mt-6 grid max-w-xl gap-4 rounded-2xl border bg-white p-6">
        <label>
          Hoàn thành bài học (%)
          <input
            className="mt-2 w-full rounded-xl border p-3"
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
          Điểm danh tối thiểu (%)
          <input
            className="mt-2 w-full rounded-xl border p-3"
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
        <label>
          <input
            checked={form.requireFinalAssessment}
            onChange={(e) => setForm({ ...form, requireFinalAssessment: e.target.checked })}
            type="checkbox"
          />{' '}
          Yêu cầu đánh giá cuối khóa
        </label>
        <button
          className="btn-primary"
          onClick={() =>
            void certificateApi
              .savePolicy(classOfferingId, form)
              .then(() => setMsg('Đã lưu chính sách.'))
          }
        >
          Lưu chính sách
        </button>
        {msg ? <p role="status">{msg}</p> : null}
      </div>
    </section>
  );
}
