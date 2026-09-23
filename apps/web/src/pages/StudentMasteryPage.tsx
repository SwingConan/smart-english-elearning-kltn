import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useSessionExpiry } from '@/features/auth/use-session-expiry';
import { learningApi } from '@/features/learning/api';
import { masteryPercentage, masteryTimestamp } from '@/features/learning/display';
import type {
  MasteryHistoryResponse,
  MasteryOverview,
  MasterySkill,
} from '@/features/learning/types';

type OverviewState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'success'; data: MasteryOverview };

type HistoryState =
  | { status: 'idle' }
  | { status: 'loading'; skill: MasterySkill }
  | { status: 'error'; skill: MasterySkill }
  | { status: 'success'; skill: MasterySkill; data: MasteryHistoryResponse };

export function StudentMasteryPage() {
  const { enrollmentId } = useParams<{ enrollmentId: string }>();
  const redirectExpiredSession = useSessionExpiry();
  const [overview, setOverview] = useState<OverviewState>({ status: 'loading' });
  const [history, setHistory] = useState<HistoryState>({ status: 'idle' });

  useEffect(() => {
    if (!enrollmentId) return;
    const controller = new AbortController();
    void learningApi.getMastery(enrollmentId, controller.signal)
      .then((data) => setOverview({ status: 'success', data }))
      .catch(async (error: unknown) => {
        if (error instanceof Error && error.name === 'AbortError') return;
        if (await redirectExpiredSession(error)) return;
        setOverview({ status: 'error' });
      });
    return () => controller.abort();
  }, [enrollmentId, redirectExpiredSession]);

  const openHistory = (skill: MasterySkill) => {
    if (!enrollmentId) return;
    setHistory({ status: 'loading', skill });
    void learningApi.getMasteryHistory(enrollmentId, skill.id)
      .then((data) => setHistory({ status: 'success', skill, data }))
      .catch(async (error: unknown) => {
        if (await redirectExpiredSession(error)) return;
        setHistory({ status: 'error', skill });
      });
  };

  if (!enrollmentId) {
    return <p className="rounded-md bg-red-50 p-4 text-red-700" role="alert">Không thể xác định lớp học.</p>;
  }

  return (
    <section className="space-y-6">
      <header>
        <Link className="text-sm font-medium text-blue-700 hover:underline" to="/student/enrollments">
          &larr; Khóa học của tôi
        </Link>
        <h1 className="mt-3 text-3xl font-bold">Tiến độ kỹ năng</h1>
        <p className="mt-2 max-w-3xl text-slate-600">
          Xác suất mastery theo Bayesian Knowledge Tracing (BKT), được cập nhật từ các observation trong bài kiểm tra.
        </p>
      </header>

      {overview.status === 'loading' ? <p role="status">Đang tải tiến độ kỹ năng...</p> : null}
      {overview.status === 'error' ? (
        <p className="rounded-md bg-red-50 p-4 text-red-700" role="alert">
          Không thể tải tiến độ kỹ năng. Lớp học có thể không còn khả dụng.
        </p>
      ) : null}
      {overview.status === 'success' && overview.data.skills.length === 0 ? (
        <p className="rounded-xl border bg-white p-6 text-slate-600">
          Khóa học chưa được cấu hình Skill / Knowledge Component.
        </p>
      ) : null}
      {overview.status === 'success' && overview.data.skills.length > 0 ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {overview.data.skills.map((skill) => (
            <SkillCard key={skill.id} skill={skill} onOpenHistory={openHistory} />
          ))}
        </div>
      ) : null}

      {history.status !== 'idle' ? (
        <HistoryPanel history={history} onClose={() => setHistory({ status: 'idle' })} />
      ) : null}
    </section>
  );
}

function SkillCard({ skill, onOpenHistory }: { skill: MasterySkill; onOpenHistory: (skill: MasterySkill) => void }) {
  const width = Math.max(0, Math.min(100, skill.masteryProbability * 100));
  return (
    <article className="rounded-xl border bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{skill.code}</p>
          <h2 className="text-lg font-semibold">{skill.name}</h2>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold">{skill.state}</span>
      </div>
      {skill.description ? <p className="mt-2 text-sm text-slate-600">{skill.description}</p> : null}
      <div className="mt-4">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-sm font-medium">BKT mastery probability</span>
          <strong className="text-xl">{masteryPercentage(skill.masteryProbability)}</strong>
        </div>
        <div aria-hidden="true" className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
          <div className="h-full rounded-full bg-blue-600" style={{ width: `${width}%` }} />
        </div>
      </div>
      <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
        <Detail label="Observation" value={String(skill.observationCount)} />
        <Detail label="Cập nhật cuối" value={masteryTimestamp(skill.lastObservedAt)} />
      </dl>
      <p className="mt-3 rounded bg-slate-50 p-3 text-sm text-slate-700">
        {skill.state === 'PRIOR'
          ? 'Giá trị khởi tạo — chưa có observation.'
          : 'Đã cập nhật từ kết quả bài kiểm tra.'}
      </p>
      <div className="mt-4 text-sm">
        <h3 className="font-medium">Prerequisites</h3>
        {skill.prerequisites.length === 0 ? (
          <p className="mt-1 text-slate-500">Không có prerequisite.</p>
        ) : (
          <ul className="mt-1 list-disc pl-5 text-slate-600">
            {skill.prerequisites.map((item) => <li key={item.id}>{item.code} — {item.name}</li>)}
          </ul>
        )}
      </div>
      <button
        className="mt-5 rounded border border-blue-600 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50"
        onClick={() => onOpenHistory(skill)}
        type="button"
      >
        Xem lịch sử {skill.code}
      </button>
    </article>
  );
}

function HistoryPanel({
  history,
  onClose,
}: {
  history: Exclude<HistoryState, { status: 'idle' }>;
  onClose: () => void;
}) {
  return (
    <section aria-labelledby="mastery-history-heading" className="rounded-xl border bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{history.skill.code}</p>
          <h2 className="text-xl font-semibold" id="mastery-history-heading">Lịch sử mastery — {history.skill.name}</h2>
        </div>
        <button className="rounded border px-3 py-1.5 text-sm" onClick={onClose} type="button">Đóng</button>
      </div>
      {history.status === 'loading' ? <p className="mt-5" role="status">Đang tải lịch sử mastery...</p> : null}
      {history.status === 'error' ? (
        <p className="mt-5 rounded bg-red-50 p-4 text-red-700" role="alert">
          Không thể tải lịch sử mastery cho Skill này.
        </p>
      ) : null}
      {history.status === 'success' ? <HistoryContent data={history.data} /> : null}
    </section>
  );
}

function HistoryContent({ data }: { data: MasteryHistoryResponse }) {
  return (
    <div className="mt-5 space-y-5">
      <dl className="grid gap-3 rounded-lg bg-slate-50 p-4 text-sm sm:grid-cols-4">
        <Detail label="Hiện tại" value={masteryPercentage(data.current.masteryProbability)} />
        <Detail label="Trạng thái" value={data.current.state} />
        <Detail label="Observation" value={String(data.current.observationCount)} />
        <Detail label="Cập nhật cuối" value={masteryTimestamp(data.current.lastObservedAt)} />
      </dl>
      {data.history.length === 0 ? (
        <p className="rounded border border-dashed p-5 text-slate-600">Chưa có observation cho Skill này.</p>
      ) : (
        <ol className="space-y-3">
          {data.history.map((row, index) => (
            <li className="rounded-lg border p-4" key={row.id}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold">Observation {index + 1}</h3>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium">
                  {row.isCorrect ? 'Đúng' : 'Sai'}
                </span>
              </div>
              <p className="mt-3 font-mono text-sm" aria-label={`BKT transition ${index + 1}`}>
                {masteryPercentage(row.priorMastery)} <span aria-hidden="true">→</span>{' '}
                {masteryPercentage(row.evidencePosterior)} <span aria-hidden="true">→</span>{' '}
                {masteryPercentage(row.posteriorMastery)}
              </p>
              <p className="mt-1 text-xs text-slate-500">Prior → Evidence update → After learning transition</p>
              <p className="mt-2 text-xs text-slate-500">{masteryTimestamp(row.createdAt)}</p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div><dt className="font-medium text-slate-700">{label}</dt><dd className="text-slate-600">{value}</dd></div>;
}
