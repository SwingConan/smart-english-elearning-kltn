import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { toeicSkillLabel } from '@/features/assessments/display';
import type { ToeicSkill } from '@/features/assessments/types';
import { instructorApi } from '@/features/instructor/api';
const skills: ToeicSkill[] = ['LISTENING', 'READING', 'SPEAKING', 'WRITING'];
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
  return score?.status === 'FINAL' ? `${score.normalizedScore}%` : score ? 'Đang chờ' : 'Chưa có';
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
        setTrend((data as unknown as { trend: Trend[] }).trend ?? []);
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
            <div className="mt-4 flex h-6 overflow-hidden rounded-full bg-slate-100">
              {[
                ['fullyGraded', 'bg-emerald-500'],
                ['pendingGrading', 'bg-amber-400'],
                ['notSubmitted', 'bg-slate-300'],
              ].map(([key, color]) => (
                <div
                  className={color}
                  key={key}
                  style={{
                    width: `${assessment.completion.total ? ((assessment.completion[key as keyof typeof assessment.completion] as number) / assessment.completion.total) * 100 : 0}%`,
                  }}
                />
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-5 text-sm">
              <button className="font-semibold text-indigo-700 underline" onClick={() => { const ids = assessment.learners.filter((row) => skills.every((skill) => row.skillScores.some((score) => score.skill === skill && score.status === 'FINAL'))).map((row) => row.id); setAttemptFilter(new Set(ids)); setFilterLabel('Đã chấm đủ'); }} type="button">{assessment.completion.fullyGraded} đã chấm đủ</button>
              <button className="font-semibold text-indigo-700 underline" onClick={() => { const ids = assessment.learners.filter((row) => !skills.every((skill) => row.skillScores.some((score) => score.skill === skill && score.status === 'FINAL'))).map((row) => row.id); setAttemptFilter(new Set(ids)); setFilterLabel('Chờ chấm'); }} type="button">{assessment.completion.pendingGrading} chờ chấm</button>
              <button className="font-semibold text-indigo-700 underline" onClick={() => { setAttemptFilter(new Set()); setFilterLabel('Chưa nộp'); }} type="button">{assessment.completion.notSubmitted} chưa nộp</button>
            </div>
          </section>
          <section>
            <h3 className="mb-3 text-lg font-bold">So sánh kỹ năng</h3>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {assessment.skillAverages.map((item) => (
                <div className="rounded-xl border bg-white p-4" key={item.skill}>
                  <strong>{toeicSkillLabel[item.skill]}</strong>
                  <p className="mt-2 text-2xl font-bold text-indigo-700">
                    {item.average === null ? '—' : `${item.average}%`}
                  </p>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
                    <div
                      className="h-full bg-indigo-600"
                      style={{ width: `${item.average ?? 0}%` }}
                    />
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    {item.sampleCount}/{assessment.completion.total} học viên đã có điểm cuối
                  </p>
                  <p className="text-xs text-slate-500">
                    {assessment.completion.total - item.sampleCount} chưa đủ dữ liệu
                  </p>
                </div>
              ))}
            </div>
          </section>
          <section className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border bg-white p-5">
              <h3 className="font-bold">Phân bố điểm</h3>
              <p className="text-sm text-slate-500">
                Số học viên theo khoảng điểm cuối của từng kỹ năng.
              </p>
              {assessment.skillAverages.map((item) => (
                <div className="mt-4" key={item.skill}>
                  <strong className="text-sm">{toeicSkillLabel[item.skill]}</strong>
                  <div className="mt-1 grid grid-cols-4 gap-1 text-center text-xs">
                    {Object.entries(item.distribution).map(([key, count]) => (
                      <button className="rounded bg-indigo-50 p-2 hover:bg-indigo-100" key={key} onClick={() => { const ids = (item.distributionLearners?.[key] ?? []).map((row) => row.id); setAttemptFilter(new Set(ids)); setFilterLabel(`${toeicSkillLabel[item.skill]} · ${({ below50: '<50', from50To69: '50–69', from70To84: '70–84', from85To100: '85–100' } as Record<string,string>)[key]}`); }} type="button">
                        <b className="block text-indigo-700">{count}</b>
                        {
                          (
                            {
                              below50: '<50',
                              from50To69: '50–69',
                              from70To84: '70–84',
                              from85To100: '85–100',
                            } as Record<string, string>
                          )[key]
                        }
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="rounded-2xl border bg-white p-5">
              <h3 className="font-bold">Xu hướng qua các đợt kiểm tra</h3>
              <p className="text-sm text-slate-500">Chỉ dùng bài trong lớp và điểm đã chấm cuối.</p>
              {trend.length >= 2 ? (
                <div className="mt-4 space-y-3">
                  {trend.map((point) => (
                    <div className="rounded-lg border p-3" key={point.assessmentId}>
                      <strong>{point.title}</strong>
                      <p className="text-xs text-slate-500">
                        {new Date(point.date).toLocaleDateString('vi-VN')}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {point.skills.map((score) => (
                          <span
                            className="rounded-full bg-indigo-50 px-2 py-1 text-xs"
                            key={score.skill}
                          >
                            {toeicSkillLabel[score.skill]} {score.average}% · {score.sampleCount}{' '}
                            học viên
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-500">
                  Cần ít nhất 2 đợt kiểm tra có điểm cuối để hiển thị xu hướng.
                </p>
              )}
            </div>
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
