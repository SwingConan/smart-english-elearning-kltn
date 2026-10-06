import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { instructorApi } from '@/features/instructor/api';
import type { InstructorGradingInbox } from '@/features/instructor/types';

const labels: Record<string, string> = { WAITING: 'Chờ chấm', PARTIAL: 'Đang chấm dở', FINAL: 'Đã chấm' };
const stages: Record<string, string> = { PERIODIC: 'Thường kỳ', MIDTERM: 'Giữa kỳ', FINAL: 'Cuối kỳ' };

export function InstructorClassGradingPage() {
  const { classOfferingId = '' } = useParams();
  const [data, setData] = useState<InstructorGradingInbox | null>(null);
  const [filter, setFilter] = useState('ALL');
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
    `${submission.learner.fullName} ${submission.classAssessment.test.title}`.toLowerCase().includes(search.toLowerCase()),
  ) ?? [], [data, filter, search]);
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
        <input aria-label="Tìm học viên hoặc bài kiểm tra" className="rounded-lg border px-3 py-2" onChange={(event) => setSearch(event.target.value)} placeholder="Tìm học viên hoặc bài kiểm tra" />
      </div>
    </section>
    <section className="space-y-3">
      {rows.map((submission) => <article className="rounded-xl border bg-white p-4" key={submission.id}>
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div className="min-w-0">
            <span className="rounded-full bg-indigo-50 px-2 py-1 text-xs font-bold text-indigo-700">{labels[submission.gradingState] ?? 'Chưa xác định'}</span>
            <h3 className="mt-2 font-bold">{submission.learner.fullName}</h3>
            <p className="text-sm text-slate-600">{submission.classAssessment.test.title} · {stages[submission.classAssessment.stage] ?? 'Bài kiểm tra'} · lượt {submission.attemptNumber}</p>
            <p className="text-xs text-slate-500">Nộp lúc {new Date(submission.submittedAt).toLocaleString('vi-VN')}</p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-sm">
            <Snapshot label="Nghe" value={submission.listeningScore} />
            <Snapshot label="Đọc" value={submission.readingScore} />
            <div className="rounded-lg bg-slate-50 px-3 py-2"><span className="block text-xs text-slate-500">Nói/Viết đã chốt</span><strong>{submission.productiveFinalizedCount}/{submission.productiveTotal}</strong></div>
          </div>
          <Link className="rounded-lg bg-indigo-600 px-4 py-2 text-center font-semibold text-white" to={`/instructor/classes/${classOfferingId}/assessments/${submission.classAssessment.id}/attempts/${submission.id}/grading`}>
            {submission.gradingState === 'WAITING' ? 'Chấm bài' : submission.gradingState === 'PARTIAL' ? 'Tiếp tục chấm' : 'Xem / chỉnh điểm'}
          </Link>
        </div>
      </article>)}
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
