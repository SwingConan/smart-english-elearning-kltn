import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { Certificate, certificateApi, Readiness } from '@/features/certificates/api';

const unmetLabels: Record<string, string> = {
  ENROLLMENT_NOT_ACTIVE: 'Đăng ký học không còn ở trạng thái đang học.',
  CLASS_NOT_COMPLETED: 'Lớp học chưa kết thúc.',
  LESSON_PROGRESS_BELOW_POLICY: 'Chưa hoàn thành đủ tỷ lệ bài học yêu cầu.',
  ATTENDANCE_UNMARKED: 'Vẫn còn buổi học chưa được điểm danh.',
  ATTENDANCE_BELOW_POLICY: 'Tỷ lệ điểm danh chưa đạt yêu cầu.',
  FINAL_ASSESSMENT_NOT_CONFIGURED: 'Lớp chưa cấu hình bài đánh giá cuối khóa.',
  FINAL_ASSESSMENT_INCOMPLETE_OR_PENDING: 'Bài cuối khóa chưa hoàn tất hoặc đang chờ duyệt.',
};
export function CertificatesPage() {
  const [items, setItems] = useState<Certificate[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const load = useCallback(async () => {
    try {
      setItems(await certificateApi.mine());
      setState('ready');
    } catch {
      setState('error');
    }
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  return (
    <section className="mx-auto max-w-5xl px-4 py-12">
      <h1 className="text-3xl font-black">Chứng chỉ của tôi</h1>
      {state === 'loading' ? (
        <p className="mt-6" role="status">
          Đang tải chứng chỉ…
        </p>
      ) : null}
      {state === 'error' ? (
        <div className="state-error mt-6">
          Không thể tải chứng chỉ.{' '}
          <button className="underline" onClick={() => void load()}>
            Thử lại
          </button>
        </div>
      ) : null}
      {state === 'ready' && items.length === 0 ? (
        <div className="state-empty mt-6">Bạn chưa có chứng chỉ.</div>
      ) : null}
      <div className="mt-7 grid gap-5 sm:grid-cols-2">
        {items.map((item) => (
          <article
            className="rounded-2xl border-4 border-double border-indigo-200 bg-white p-6 text-center shadow-sm"
            key={item.id}
          >
            <p className="text-xs font-bold uppercase tracking-widest text-indigo-700">
              Smart English E-Learning
            </p>
            <h2 className="mt-3 text-xl font-black">Chứng nhận hoàn thành</h2>
            <p className="mt-3">
              Học viên <strong>{item.learnerNameSnapshot}</strong>
            </p>
            <p>
              Khóa học <strong>{item.courseTitleSnapshot}</strong>
            </p>
            <p>
              Lớp {item.classNameSnapshot} ({item.classCodeSnapshot})
            </p>
            <p className="mt-3 font-mono text-sm">{item.certificateNumber}</p>
            <p className="text-sm">
              Cấp ngày {new Date(item.issuedAt).toLocaleDateString('vi-VN')}
            </p>
            <p
              className={`mt-3 font-bold ${item.revokedAt ? 'text-rose-700' : 'text-emerald-700'}`}
            >
              {item.revokedAt ? 'Đã thu hồi — không còn hiệu lực' : 'Còn hiệu lực'}
            </p>
            {!item.revokedAt ? (
              <a className="btn-secondary mt-4" href={certificateApi.downloadUrl(item.id)}>
                Tải chứng chỉ
              </a>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}
export function EnrollmentCertificatePage() {
  const { enrollmentId = '' } = useParams();
  const [data, setData] = useState<Readiness | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const load = useCallback(async () => {
    try {
      setData(await certificateApi.readiness(enrollmentId));
      setState('ready');
    } catch {
      setState('error');
    }
  }, [enrollmentId]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  if (state === 'loading') return <p role="status">Đang kiểm tra điều kiện hoàn thành…</p>;
  if (state === 'error')
    return (
      <div className="state-error">
        Không thể kiểm tra điều kiện.{' '}
        <button className="underline" onClick={() => void load()}>
          Thử lại
        </button>
      </div>
    );
  if (!data) return null;
  const certificate = data.completion?.certificate;
  const evaluate = async () => {
    setState('loading');
    try {
      setData(await certificateApi.evaluate(enrollmentId));
      setState('ready');
    } catch {
      setState('error');
    }
  };
  return (
    <section className="space-y-5">
      <h2 className="text-2xl font-black">Hoàn thành & chứng chỉ</h2>
      <div className="rounded-2xl border bg-white p-6">
        <h3 className="font-bold">Tiêu chí và minh chứng</h3>
        <dl className="mt-3 grid gap-2">
          <div>
            <dt>Bài học</dt>
            <dd>
              {data.evidence.lesson.completed}/{data.evidence.lesson.total} ·{' '}
              {data.evidence.lesson.percent}% (yêu cầu {data.policy.minLessonCompletionPercent}%)
            </dd>
          </div>
          <div>
            <dt>Điểm danh</dt>
            <dd>
              {data.evidence.attendance.coverageComplete
                ? `${data.evidence.attendance.percent ?? 0}%`
                : 'Chưa ghi nhận đầy đủ'}
              {data.policy.minAttendancePercent !== null
                ? ` (yêu cầu ${data.policy.minAttendancePercent}%)`
                : ''}
            </dd>
          </div>
          <div>
            <dt>Đánh giá cuối khóa</dt>
            <dd>
              {data.policy.requireFinalAssessment
                ? data.evidence.finalAssessment.satisfied
                  ? 'Đã đạt'
                  : 'Chưa đạt'
                : 'Không bắt buộc'}
            </dd>
          </div>
        </dl>
        {data.unmet.length ? (
          <ul className="mt-4 list-disc pl-5 text-amber-800">
            {data.unmet.map((item) => (
              <li key={item}>{unmetLabels[item] ?? 'Điều kiện hoàn thành chưa được đáp ứng.'}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-emerald-700">Đã đáp ứng các điều kiện hiện tại.</p>
        )}
        {certificate ? (
          <a className="btn-primary mt-5" href={certificateApi.downloadUrl(certificate.id)}>
            Tải chứng chỉ
          </a>
        ) : (
          <button className="btn-primary mt-5" onClick={() => void evaluate()}>
            Kiểm tra điều kiện hoàn thành
          </button>
        )}
      </div>
    </section>
  );
}
