import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { instructorApi } from '@/features/instructor/api';
import type { InstructorGradingInbox } from '@/features/instructor/types';

const labels: Record<string, string> = { WAITING: 'Chờ chấm', PARTIAL: 'Đang chấm dở', FINAL: 'Đã chấm' };
const stateTone: Record<string, string> = { WAITING: 'bg-amber-100 text-amber-800', PARTIAL: 'bg-indigo-100 text-indigo-800', FINAL: 'bg-emerald-100 text-emerald-800' };
const stages: Record<string, string> = { PERIODIC: 'Thường kỳ', MIDTERM: 'Giữa kỳ', FINAL: 'Cuối kỳ' };

export function InstructorClassGradingPage() {
  const { classOfferingId = '' } = useParams();
  const [data, setData] = useState<InstructorGradingInbox | null>(null);
  const [filter, setFilter] = useState('ALL');
  const [assessmentFilter, setAssessmentFilter] = useState('ALL');
  const [stageFilter, setStageFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void instructorApi.classes.grading(classOfferingId, controller.signal)
      .then((loaded) => { setData(loaded); setError(false); })
      .catch((cause: unknown) => { if (!(cause instanceof Error && cause.name === 'AbortError')) setError(true); });
    return () => controller.abort();
  }, [classOfferingId]);
  const rows = useMemo(() => data?.submissions.filter((submission) =>
    (filter === 'ALL' || submission.gradingState === filter) &&
    (assessmentFilter === 'ALL' || submission.classAssessment.id === assessmentFilter) &&
    (stageFilter === 'ALL' || submission.classAssessment.stage === stageFilter) &&
    `${submission.learner.fullName} ${submission.classAssessment.test.title}`.toLowerCase().includes(search.toLowerCase()),
  ) ?? [], [assessmentFilter, data, filter, search, stageFilter]);
  const groupedRows = useMemo(() => {
    const assessments = new Map<string, { title: string; stage: string; learners: Map<string, { name: string; email: string; attempts: typeof rows }> }>();
    for (const submission of rows) {
      const assessment = assessments.get(submission.classAssessment.id) ?? { title: submission.classAssessment.test.title, stage: submission.classAssessment.stage, learners: new Map() };
      const learner = assessment.learners.get(submission.learner.id) ?? { name: submission.learner.fullName, email: submission.learner.email, attempts: [] };
      learner.attempts.push(submission);
      assessment.learners.set(submission.learner.id, learner);
      assessments.set(submission.classAssessment.id, assessment);
    }
    return [...assessments.entries()];
  }, [rows]);
  if (error) return <div className="state-error">Không thể tải danh sách chấm bài.</div>;
  if (!data) return <div className="h-64 animate-pulse rounded-2xl bg-slate-200" />;
  const summary = data.summary ?? {
    waiting: data.submissions.filter((item) => item.gradingState === 'WAITING').length,
    partial: data.submissions.filter((item) => item.gradingState === 'PARTIAL').length,
    final: data.submissions.filter((item) => item.gradingState === 'FINAL').length,
  };
  return <div className="space-y-5">
    <section className="rounded-2xl border bg-white p-5">
      <h2 className="text-2xl font-bold">Chấm bài</h2>
      <p className="mt-1 text-sm text-slate-500">Ưu tiên bài nộp sớm nhất. Bộ lọc không thay đổi thứ tự hàng chờ.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Summary label="Chờ chấm" value={summary.waiting} tone="text-amber-700" />
        <Summary label="Đang chấm dở" value={summary.partial} tone="text-indigo-700" />
        <Summary label="Đã chấm" value={summary.final} tone="text-emerald-700" />
      </div>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <select aria-label="Lọc trạng thái chấm" className="rounded-lg border px-3 py-2" onChange={(event) => setFilter(event.target.value)} value={filter}>
          <option value="ALL">Tất cả trạng thái</option><option value="WAITING">Chờ chấm</option><option value="PARTIAL">Đang chấm dở</option><option value="FINAL">Đã chấm</option>
        </select>
        <select aria-label="Lọc bài kiểm tra" className="rounded-lg border px-3 py-2" onChange={(event) => setAssessmentFilter(event.target.value)} value={assessmentFilter}><option value="ALL">Tất cả bài kiểm tra</option>{[...new Map(data.submissions.map((item) => [item.classAssessment.id, item.classAssessment.test.title])).entries()].map(([id, title]) => <option key={id} value={id}>{title}</option>)}</select>
        <select aria-label="Lọc đợt đánh giá" className="rounded-lg border px-3 py-2" onChange={(event) => setStageFilter(event.target.value)} value={stageFilter}><option value="ALL">Tất cả đợt</option>{Object.entries(stages).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        <input aria-label="Tìm học viên hoặc bài kiểm tra" className="rounded-lg border px-3 py-2" onChange={(event) => setSearch(event.target.value)} placeholder="Tìm học viên hoặc bài kiểm tra" />
      </div>
    </section>
    <section className="space-y-4">
      {groupedRows.map(([assessmentId, assessment]) => <details className="rounded-2xl border bg-white p-4" key={assessmentId} open><summary className="cursor-pointer list-none"><span className="font-bold">{assessment.title}</span><span className="ml-2 rounded-full bg-indigo-50 px-2 py-1 text-xs text-indigo-700">{stages[assessment.stage] ?? 'Bài kiểm tra'}</span><span className="ml-2 text-sm text-slate-500">{[...assessment.learners.values()].reduce((sum, learner) => sum + learner.attempts.length, 0)} lượt nộp</span></summary><div className="mt-4 space-y-3">{[...assessment.learners.entries()].map(([learnerId, learner]) => <details className="rounded-xl bg-slate-50 p-3" key={learnerId} open><summary className="cursor-pointer font-semibold">{learner.name} <span className="font-normal text-slate-500">· {learner.email} · {learner.attempts.length} lượt</span></summary><div className="mt-3 space-y-2">{learner.attempts.map((submission) => <article className="grid gap-3 rounded-lg border bg-white p-3 lg:grid-cols-[1fr_auto_auto] lg:items-center" key={submission.id}><div><span className={`rounded-full px-2 py-1 text-xs font-bold ${stateTone[submission.gradingState] ?? 'bg-slate-100 text-slate-700'}`}>{labels[submission.gradingState] ?? 'Chưa xác định'}</span><p className="mt-2 text-sm">Lượt {submission.attemptNumber} · nộp {new Date(submission.submittedAt).toLocaleString('vi-VN')}</p></div><div className="grid grid-cols-3 gap-2 text-center text-sm"><Snapshot label="Nghe" value={submission.listeningScore} /><Snapshot label="Đọc" value={submission.readingScore} /><div className="rounded-lg bg-slate-50 px-3 py-2"><span className="block text-xs text-slate-500">Nói/Viết</span><strong>{submission.productiveFinalizedCount}/{submission.productiveTotal}</strong></div></div><Link className="rounded-lg bg-indigo-600 px-4 py-2 text-center font-semibold text-white" to={`/instructor/classes/${classOfferingId}/assessments/${submission.classAssessment.id}/attempts/${submission.id}/grading`}>{submission.gradingState === 'WAITING' ? 'Chấm bài' : submission.gradingState === 'PARTIAL' ? 'Tiếp tục chấm' : 'Xem / chỉnh điểm'}</Link></article>)}</div></details>)}</div></details>)}
      {rows.length === 0 ? <p className="rounded-xl border bg-white py-8 text-center text-slate-500">Hiện không có bài nào phù hợp.</p> : null}
    </section>
  </div>;
}

function Summary({ label, value, tone }: { label: string; value: number; tone: string }) {
  return <div className="rounded-xl bg-slate-50 p-4"><p className="text-sm text-slate-500">{label}</p><p className={`mt-1 text-2xl font-bold ${tone}`}>{value}</p></div>;
}
function Snapshot({ label, value }: { label: string; value: number | null }) {
  return <div className="rounded-lg bg-slate-50 px-3 py-2"><span className="block text-xs text-slate-500">{label}</span><strong>{value === null ? 'Chưa có' : `${value}%`}</strong></div>;
}
