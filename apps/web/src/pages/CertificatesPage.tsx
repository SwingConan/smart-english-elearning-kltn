import {
  Award,
  BookOpenCheck,
  CalendarCheck,
  CheckCircle2,
  CircleAlert,
  Clock3,
  LoaderCircle,
} from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useState } from 'react';
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
  const [evaluating, setEvaluating] = useState(false);
  const [hasEvaluated, setHasEvaluated] = useState(false);
  const [evaluationError, setEvaluationError] = useState('');
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
    setEvaluating(true);
    setEvaluationError('');
    try {
      setData(await certificateApi.evaluate(enrollmentId));
      setHasEvaluated(true);
    } catch {
      setEvaluationError(
        'Không thể hoàn tất lần kiểm tra. Dữ liệu sẵn sàng hiện tại vẫn được giữ nguyên.',
      );
    } finally {
      setEvaluating(false);
    }
  };
  const lessonPassed = data.evidence.lesson.percent >= data.policy.minLessonCompletionPercent;
  const attendanceState =
    data.policy.minAttendancePercent === null
      ? 'PASS'
      : !data.evidence.attendance.coverageComplete || data.evidence.attendance.percent === null
        ? 'PENDING'
        : data.evidence.attendance.percent >= data.policy.minAttendancePercent
          ? 'PASS'
          : 'FAIL';
  const finalState = !data.policy.requireFinalAssessment
    ? 'PASS'
    : data.evidence.finalAssessment.satisfied
      ? 'PASS'
      : data.unmet.includes('FINAL_ASSESSMENT_INCOMPLETE_OR_PENDING') ||
          data.unmet.includes('FINAL_ASSESSMENT_NOT_CONFIGURED')
        ? 'PENDING'
        : 'FAIL';
  return (
    <section className="space-y-7">
      <div>
        <p className="text-sm font-bold uppercase tracking-widest text-indigo-700">
          Thành tựu khóa học
        </p>
        <h2 className="mt-2 text-3xl font-black">Hoàn thành & chứng chỉ</h2>
        <p className="mt-2 max-w-3xl text-slate-600">
          Hệ thống đọc tiêu chí thật từ chính sách lớp và minh chứng hiện tại. Không có phần trăm
          hoặc giai đoạn kiểm tra mô phỏng.
        </p>
      </div>

      <div className="rounded-3xl border bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="text-xl font-bold">Mức sẵn sàng hiện tại</h3>
            <p className="mt-1 text-sm text-slate-600">
              {hasEvaluated
                ? 'Kết quả dưới đây là phản hồi mới nhất sau lần kiểm tra.'
                : 'Đây là dữ liệu sẵn sàng trước khi yêu cầu hệ thống đánh giá và cấp chứng chỉ.'}
            </p>
          </div>
          <ReadinessBadge passed={data.eligible} />
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          <CriterionCard
            delay={0}
            evidence={`${data.evidence.lesson.completed}/${data.evidence.lesson.total} bài · ${data.evidence.lesson.percent}%`}
            icon={<BookOpenCheck />}
            label="Bài học"
            requirement={`Yêu cầu tối thiểu ${data.policy.minLessonCompletionPercent}%`}
            state={lessonPassed ? 'PASS' : 'FAIL'}
          />
          <CriterionCard
            delay={80}
            evidence={
              data.evidence.attendance.coverageComplete
                ? data.evidence.attendance.percent === null
                  ? 'Chưa có dữ liệu tỷ lệ'
                  : `${data.evidence.attendance.percent}% trên dữ liệu đã chốt`
                : 'Còn buổi học chưa được ghi nhận'
            }
            icon={<CalendarCheck />}
            label="Điểm danh"
            requirement={
              data.policy.minAttendancePercent === null
                ? 'Không áp dụng ngưỡng'
                : `Yêu cầu tối thiểu ${data.policy.minAttendancePercent}%`
            }
            state={attendanceState}
          />
          <CriterionCard
            delay={160}
            evidence={
              data.policy.requireFinalAssessment
                ? data.evidence.finalAssessment.satisfied
                  ? 'Đã có kết quả cuối đạt yêu cầu'
                  : 'Chưa có kết quả cuối đủ điều kiện'
                : 'Chính sách lớp không yêu cầu'
            }
            icon={<Award />}
            label="Đánh giá cuối khóa"
            requirement={
              data.policy.requireFinalAssessment ? 'Bắt buộc hoàn tất' : 'Không bắt buộc'
            }
            state={finalState}
          />
        </div>

        {data.unmet.length ? (
          <div className="mt-6 rounded-2xl bg-amber-50 p-5 text-amber-950">
            <div className="flex items-center gap-2 font-bold">
              <CircleAlert size={19} /> Việc cần hoàn tất
            </div>
            <ul className="mt-3 list-disc space-y-2 pl-5">
              {data.unmet.map((item) => (
                <li key={item}>{unmetLabels[item] ?? 'Điều kiện hoàn thành chưa được đáp ứng.'}</li>
              ))}
            </ul>
            <p className="mt-3 text-sm">
              Hoàn tất các mục trên rồi chạy kiểm tra lại. Chứng chỉ chỉ xuất hiện khi giao dịch cấp
              thực sự thành công.
            </p>
          </div>
        ) : (
          <div className="mt-6 flex gap-3 rounded-2xl bg-emerald-50 p-5 text-emerald-950">
            <CheckCircle2 className="shrink-0" />
            <div>
              <strong>Minh chứng hiện tại đáp ứng chính sách.</strong>
              <p className="mt-1 text-sm">
                Hãy yêu cầu hệ thống kiểm tra để hoàn tất giao dịch cấp chứng chỉ.
              </p>
            </div>
          </div>
        )}

        {evaluationError ? (
          <div className="state-error mt-5" role="alert">
            {evaluationError}
          </div>
        ) : null}

        {certificate ? (
          <div className="mt-7 overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-700 to-teal-600 p-1 shadow-lg">
            <div className="rounded-[20px] border border-white/30 p-6 text-white sm:p-8">
              <Award size={38} />
              <p className="mt-4 text-2xl font-black">Bạn đã hoàn thành khóa học</p>
              <p className="mt-2 max-w-xl text-emerald-50">
                Chứng chỉ {certificate.certificateNumber} đã được cấp từ giao dịch hoàn thành có
                thẩm quyền.
              </p>
              <a className="btn-secondary mt-5" href={certificateApi.downloadUrl(certificate.id)}>
                In / tải chứng chỉ
              </a>
            </div>
          </div>
        ) : (
          <button
            aria-busy={evaluating}
            className="btn-primary mt-6"
            disabled={evaluating}
            onClick={() => void evaluate()}
          >
            {evaluating ? <LoaderCircle className="animate-spin" size={18} /> : null}
            {evaluating
              ? 'Hệ thống đang kiểm tra tiêu chí thực tế…'
              : 'Kiểm tra điều kiện hoàn thành'}
          </button>
        )}
      </div>
    </section>
  );
}

type CriterionState = 'PASS' | 'FAIL' | 'PENDING';

function CriterionCard({
  icon,
  label,
  evidence,
  requirement,
  state,
  delay,
}: {
  icon: ReactNode;
  label: string;
  evidence: string;
  requirement: string;
  state: CriterionState;
  delay: number;
}) {
  const labelByState = { PASS: 'Đạt', FAIL: 'Chưa đạt', PENDING: 'Chưa đủ dữ liệu' };
  const tone =
    state === 'PASS'
      ? 'border-emerald-200 bg-emerald-50'
      : state === 'FAIL'
        ? 'border-rose-200 bg-rose-50'
        : 'border-amber-200 bg-amber-50';
  const StateIcon = state === 'PASS' ? CheckCircle2 : state === 'PENDING' ? Clock3 : CircleAlert;
  return (
    <article
      className={`rounded-2xl border p-5 transition-all ${tone}`}
      data-state={state}
      style={{ transitionDelay: `${delay}ms` }}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="text-indigo-700">{icon}</span>
        <span className="inline-flex items-center gap-1 text-xs font-bold">
          <StateIcon size={15} /> {labelByState[state]}
        </span>
      </div>
      <h4 className="mt-4 font-bold">{label}</h4>
      <p className="mt-2 text-sm">{evidence}</p>
      <p className="mt-2 text-xs text-slate-600">{requirement}</p>
    </article>
  );
}

function ReadinessBadge({ passed }: { passed: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-bold ${passed ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'}`}
    >
      {passed ? <CheckCircle2 size={17} /> : <Clock3 size={17} />}
      {passed ? 'Sẵn sàng đánh giá cấp' : 'Chưa sẵn sàng'}
    </span>
  );
}
