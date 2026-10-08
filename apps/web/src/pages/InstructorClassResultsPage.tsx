import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { toeicSkillLabel } from '@/features/assessments/display';
import type { ToeicSkill } from '@/features/assessments/types';
import { instructorApi } from '@/features/instructor/api';
import { SkillTrendChart } from '@/components/SkillTrendChart';
import { formatTrendNumber } from '@/components/trend-format';
const skills: ToeicSkill[] = ['LISTENING', 'READING', 'SPEAKING', 'WRITING'];
const distributionMeta = {
  below50: { label: '<50', color: 'bg-rose-500' },
  from50To69: { label: '50–69', color: 'bg-amber-400' },
  from70To84: { label: '70–84', color: 'bg-sky-500' },
  from85To100: { label: '85–100', color: 'bg-emerald-500' },
} as const;
type Score = { skill: ToeicSkill; status: string; normalizedScore: number };
type Average = {
  skill: ToeicSkill;
  average: number | null;
  sampleCount: number;
  excludedCount: number;
  distribution: { below50: number; from50To69: number; from70To84: number; from85To100: number };
  distributionLearners?: Record<string, Array<{ id: string; learner: { fullName: string; email: string } }>>;
};
type Assessment = {
  id: string;
  stage: string;
  test: { title: string };
  submittedCount: number;
  latestAttemptCount: number;
  fullyGradedCount: number;
  pendingGradingCount: number;
  notSubmittedCount: number;
  completion: { fullyGraded: number; pendingGrading: number; notSubmitted: number; total: number };
  skillAverages: Average[];
  learners: Array<{
    id: string;
    learnerId?: string;
    enrollmentId?: string | null;
    learner: { fullName: string; email: string };
    attemptNumber: number;
    label: string;
    skillScores: Score[];
  }>;
  notSubmittedLearners?: Array<{ enrollmentId: string; learnerId: string; learner: { fullName: string; email: string } }>;
};
type Trend = {
  assessmentId: string;
  title: string;
  stage: string;
  date: string;
  skills: Array<{ skill: ToeicSkill; average: number; sampleCount: number }>;
};
function scoreLabel(scores: Score[], skill: ToeicSkill) {
  const score = scores.find((item) => item.skill === skill);
  return score?.status === 'FINAL' ? `${formatTrendNumber(score.normalizedScore)}%` : score ? 'Đang chờ' : 'Chưa có';
}
export function InstructorClassResultsPage() {
  const { classOfferingId = '' } = useParams();
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [trend, setTrend] = useState<Trend[]>([]);
  const [selected, setSelected] = useState('');
  const [query, setQuery] = useState('');
  const [attemptFilter, setAttemptFilter] = useState<Set<string> | null>(null);
  const [filterLabel, setFilterLabel] = useState('');
  const [state, setState] = useState('loading');
  useEffect(() => {
    const controller = new AbortController();
    void instructorApi.classes
      .results(classOfferingId, controller.signal)
      .then((data) => {
        const rows = data.assessments as Assessment[];
        setAssessments(rows);
        setTrend(data.trend ?? []);
        setSelected(rows[0]?.id ?? '');
        setState('ready');
      })
      .catch(() => setState('error'));
    return () => controller.abort();
  }, [classOfferingId]);
  const assessment = useMemo(
    () => assessments.find((item) => item.id === selected),
    [assessments, selected],
  );
  const learners =
    assessment?.learners.filter((row) =>
      (!attemptFilter || attemptFilter.has(row.id)) &&
      `${row.learner.fullName} ${row.learner.email}`.toLowerCase().includes(query.toLowerCase()),
    ) ?? [];
  if (state === 'error') return <div className="state-error">Không thể tải kết quả lớp.</div>;
  if (state === 'loading') return <div className="h-64 animate-pulse rounded-2xl bg-slate-200" />;
  return (
    <div className="space-y-5">
      <section className="rounded-2xl border bg-white p-5">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <h2 className="text-2xl font-bold">Kết quả lớp</h2>
            <p className="text-sm text-slate-500">
              Điểm trung bình và biểu đồ chỉ dùng điểm đã chấm cuối.
            </p>
          </div>
          <select
            aria-label="Chọn bài kiểm tra"
            className="rounded-lg border px-3 py-2"
            onChange={(e) => { setSelected(e.target.value); setAttemptFilter(null); setFilterLabel(''); }}
            value={selected}
          >
            {assessments.map((item) => (
              <option key={item.id} value={item.id}>
                {item.test.title}
              </option>
            ))}
          </select>
        </div>
      </section>
      {assessment ? (
        <>
          <section className="rounded-2xl border bg-white p-5">
            <h3 className="font-bold">Mức độ hoàn chỉnh kết quả</h3>
            <p className="text-sm text-slate-500">
              {assessment.completion.total} học viên đang học
            </p>
            <div className="mt-4 flex h-8 overflow-hidden rounded-full bg-slate-100" aria-label="Thanh tiến độ kết quả 100 phần trăm">
              {[
                ['fullyGraded', 'bg-emerald-500', 'Đã chấm đủ'],
                ['pendingGrading', 'bg-amber-400', 'Chờ chấm'],
                ['notSubmitted', 'bg-slate-300', 'Chưa nộp'],
              ].map(([key, color, label]) => (
                <button
                  aria-label={`${label}: ${assessment.completion[key as keyof typeof assessment.completion]}/${assessment.completion.total}`}
                  className={`${color} min-w-0 focus:outline focus:outline-2 focus:outline-indigo-700`}
                  key={key}
                  onClick={() => {
                    if (key === 'notSubmitted') { setAttemptFilter(new Set()); setFilterLabel('Chưa nộp'); return; }
                    const complete = key === 'fullyGraded';
                    const ids = assessment.learners.filter((row) => skills.every((skill) => row.skillScores.some((score) => score.skill === skill && score.status === 'FINAL')) === complete).map((row) => row.id);
                    setAttemptFilter(new Set(ids)); setFilterLabel(label);
                  }}
                  style={{
                    width: `${assessment.completion.total ? ((assessment.completion[key as keyof typeof assessment.completion] as number) / assessment.completion.total) * 100 : 0}%`,
                  }}
                  title={`${label}: ${assessment.completion[key as keyof typeof assessment.completion]}/${assessment.completion.total}`}
                  type="button"
                />
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-5 text-sm">
              <button className="font-semibold text-indigo-700 underline" onClick={() => { const ids = assessment.learners.filter((row) => skills.every((skill) => row.skillScores.some((score) => score.skill === skill && score.status === 'FINAL'))).map((row) => row.id); setAttemptFilter(new Set(ids)); setFilterLabel('Đã chấm đủ'); }} type="button">{assessment.completion.fullyGraded} đã chấm đủ</button>
              <button className="font-semibold text-indigo-700 underline" onClick={() => { const ids = assessment.learners.filter((row) => !skills.every((skill) => row.skillScores.some((score) => score.skill === skill && score.status === 'FINAL'))).map((row) => row.id); setAttemptFilter(new Set(ids)); setFilterLabel('Chờ chấm'); }} type="button">{assessment.completion.pendingGrading} chờ chấm</button>
              <button className="font-semibold text-indigo-700 underline" onClick={() => { setAttemptFilter(new Set()); setFilterLabel('Chưa nộp'); }} type="button">{assessment.completion.notSubmitted} chưa nộp</button>
            </div>
          </section>
          <section className="rounded-2xl border bg-white p-5" data-testid="consolidated-skill-comparison">
            <h3 className="text-lg font-bold">So sánh kỹ năng</h3>
            <p className="text-sm text-slate-500">Điểm trung bình từ các mẫu đã chấm cuối; chọn một hàng để lọc học viên.</p>
            <div className="mt-4 divide-y">
              {assessment.skillAverages.map((item) => (
                <button className="grid w-full grid-cols-[6rem_minmax(4rem,1fr)] items-center gap-3 py-3 text-left hover:bg-indigo-50 sm:grid-cols-[8rem_minmax(6rem,1fr)_5rem_5rem] sm:px-2" key={item.skill} onClick={() => { const ids = assessment.learners.filter((row) => row.skillScores.some((score) => score.skill === item.skill && score.status === 'FINAL')).map((row) => row.id); setAttemptFilter(new Set(ids)); setFilterLabel(`${toeicSkillLabel[item.skill]} · có điểm cuối`); }} type="button">
                  <strong>{toeicSkillLabel[item.skill]}</strong>
                  <div className="h-3 overflow-hidden rounded-full bg-slate-200">
                    {item.average !== null ? <div
                      className="h-full bg-indigo-600"
                      style={{ width: `${item.average}%` }}
                    /> : null}
                  </div>
                  <span className="text-right font-bold text-indigo-700">{item.average === null ? '—' : `${formatTrendNumber(item.average)}%`}</span>
                  <span className="text-right text-xs text-slate-500">n={item.sampleCount}/{assessment.completion.total}</span>
                  <span className="sr-only">{item.sampleCount}/{assessment.completion.total} học viên đã có điểm cuối</span>
                  <span className="sr-only">{assessment.completion.total - item.sampleCount} chưa đủ dữ liệu</span>
                </button>
              ))}
            </div>
          </section>
          <section className="min-w-0 overflow-hidden rounded-2xl border bg-white p-5" data-testid="results-distribution">
              <h3 className="font-bold">Phân bố điểm</h3>
              <p className="text-sm text-slate-500">
                Số học viên theo khoảng điểm cuối của từng kỹ năng.
              </p>
              {assessment.skillAverages.map((item) => (
                <div className="mt-4" key={item.skill}>
                  <strong className="text-sm">{toeicSkillLabel[item.skill]}</strong>
                  <div className="mt-2 flex h-9 overflow-hidden rounded-lg bg-slate-100" aria-label={`Phân bố ${toeicSkillLabel[item.skill]} 100 phần trăm`}>
                    {Object.entries(item.distribution).map(([key, count]) => (
                      <button aria-label={`${toeicSkillLabel[item.skill]} ${distributionMeta[key as keyof typeof distributionMeta].label}: ${count}/${item.sampleCount}`} className={`${distributionMeta[key as keyof typeof distributionMeta].color} overflow-hidden text-ellipsis whitespace-nowrap px-1 text-xs font-bold text-white focus:outline focus:outline-2 focus:outline-indigo-800`} key={key} onClick={() => { const ids = (item.distributionLearners?.[key] ?? []).map((row) => row.id); setAttemptFilter(new Set(ids)); setFilterLabel(`${toeicSkillLabel[item.skill]} · ${distributionMeta[key as keyof typeof distributionMeta].label}`); }} style={{ width: `${item.sampleCount ? count / item.sampleCount * 100 : 0}%` }} title={`${distributionMeta[key as keyof typeof distributionMeta].label}: ${count}`} type="button">
                        {count > 0 ? count : ''}
                      </button>
                    ))}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600">{Object.entries(distributionMeta).map(([key, meta]) => <span className="flex items-center gap-1" key={key}><i className={`h-2.5 w-2.5 rounded-sm ${meta.color}`} />{meta.label}: {item.distribution[key as keyof typeof item.distribution]}</span>)}</div>
                  <p className="mt-1 text-xs text-slate-500">n={item.sampleCount} điểm cuối; dữ liệu thiếu không tính là 0.</p>
                </div>
              ))}
          </section>
          <section className="min-w-0 overflow-hidden rounded-2xl border bg-white p-5" data-testid="results-trend">
              <h3 className="font-bold">Xu hướng qua các đợt kiểm tra</h3>
              <p className="text-sm text-slate-500">Chỉ dùng bài trong lớp và điểm đã chấm cuối.</p>
              {trend.length >= 2 ? (
                <SkillTrendChart showSampleCount points={trend.map((point) => ({ id: point.assessmentId, title: point.title, date: point.date, values: Object.fromEntries(point.skills.map((score) => [score.skill, { score: score.average, sampleCount: score.sampleCount }])) }))} />
              ) : (
                <p className="mt-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-500">
                  Cần ít nhất 2 đợt kiểm tra có điểm cuối để hiển thị xu hướng.
                </p>
              )}
          </section>
          <section className="rounded-2xl border bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-bold">Kết quả từng học viên</h3>
                <p className="text-sm text-slate-500">
                  Lớp chi tiết để kiểm tra và xử lý dữ liệu thiếu.
                </p>
              </div>
              <input
                aria-label="Tìm học viên trong kết quả"
                className="rounded-lg border px-3 py-2"
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Tìm tên hoặc email"
                value={query}
              />
            </div>
            {filterLabel ? <div className="mt-3 flex items-center gap-3 rounded-lg bg-indigo-50 p-3 text-sm"><strong>Đang lọc: {filterLabel}</strong><button className="font-semibold text-indigo-700 underline" onClick={() => { setAttemptFilter(null); setFilterLabel(''); }} type="button">Bỏ lọc</button></div> : null}
            {filterLabel === 'Chưa nộp' ? <div className="mt-4 grid gap-3 sm:grid-cols-2">{(assessment.notSubmittedLearners ?? []).filter((row) => `${row.learner.fullName} ${row.learner.email}`.toLowerCase().includes(query.toLowerCase())).map((row) => <article className="rounded-xl border p-4" key={row.learnerId}><strong>{row.learner.fullName}</strong><p className="text-sm text-slate-500">{row.learner.email}</p><Link className="mt-2 inline-block font-semibold text-indigo-700" to={`/instructor/classes/${classOfferingId}/learners/${row.enrollmentId}`}>Mở hồ sơ →</Link></article>)}</div> : null}
            {filterLabel !== 'Chưa nộp' ? <div className="mt-4 hidden overflow-x-auto md:block">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="p-3">Học viên</th>
                    {skills.map((skill) => (
                      <th className="p-3" key={skill}>
                        {toeicSkillLabel[skill]}
                      </th>
                    ))}
                    <th className="p-3">Chi tiết</th>
                  </tr>
                </thead>
                <tbody>
                  {learners.map((row) => (
                    <tr className="border-b" key={row.id}>
                      <td className="p-3">
                        <strong>{row.learner.fullName}</strong>
                        <br />
                        <span className="text-slate-500">{row.learner.email}</span>
                      </td>
                      {skills.map((skill) => (
                        <td className="p-3" key={skill}>
                          {scoreLabel(row.skillScores, skill)}
                        </td>
                      ))}
                      <td className="p-3">
                        <Link
                          className="font-semibold text-indigo-700"
                          to={row.enrollmentId ? `/instructor/classes/${classOfferingId}/learners/${row.enrollmentId}` : `/instructor/classes/${classOfferingId}/grading`}
                        >
                          Xem
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div> : null}
            {filterLabel !== 'Chưa nộp' ? <div className="mt-4 grid gap-3 md:hidden">
              {learners.map((row) => (
                <article className="rounded-xl border p-4" key={row.id}>
                  <strong>{row.learner.fullName}</strong>
                  <p className="text-sm text-slate-500">{row.learner.email}</p>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {skills.map((skill) => (
                      <span className="text-sm" key={skill}>
                        {toeicSkillLabel[skill]}: {scoreLabel(row.skillScores, skill)}
                      </span>
                    ))}
                  </div>
                  {row.enrollmentId ? <Link className="mt-3 inline-block font-semibold text-indigo-700" to={`/instructor/classes/${classOfferingId}/learners/${row.enrollmentId}`}>Mở hồ sơ →</Link> : null}
                </article>
              ))}
            </div> : null}
          </section>
        </>
      ) : (
        <div className="state-empty">Chưa có bài kiểm tra trong lớp.</div>
      )}
    </div>
  );
}
