import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { toeicSkillLabel } from '@/features/assessments/display';
import type { ToeicSkill } from '@/features/assessments/types';
import { instructorApi } from '@/features/instructor/api';
import type { InstructorLearnerDetail } from '@/features/instructor/types';

export function InstructorLearnerDetailPage() {
  const { classOfferingId = '', enrollmentId = '' } = useParams();
  const [data, setData] = useState<InstructorLearnerDetail | null>(null); const [error, setError] = useState(false);
  useEffect(() => { const controller = new AbortController(); void instructorApi.classes.learner(classOfferingId, enrollmentId, controller.signal).then((loaded) => { setData(loaded); setError(false); }).catch((cause: unknown) => { if (!(cause instanceof Error && cause.name === 'AbortError')) setError(true); }); return () => controller.abort(); }, [classOfferingId, enrollmentId]);
  const attemptGroups = useMemo(() => {
    const groups = new Map<string, { title: string; attempts: NonNullable<typeof data>['attempts'] }>();
    for (const attempt of data?.attempts ?? []) {
      const key = attempt.classAssessment?.id ?? attempt.classAssessment?.test.title ?? attempt.id;
      const group = groups.get(key) ?? { title: attempt.classAssessment?.test.title ?? 'Bài kiểm tra', attempts: [] };
      group.attempts.push(attempt);
      groups.set(key, group);
    }
    return [...groups.values()];
  }, [data]);
  if (error) return <div className="state-error">Không thể tải hồ sơ học viên hoặc bạn không có quyền truy cập.</div>;
  if (!data) return <div className="h-64 animate-pulse rounded-2xl bg-slate-200" />;
  return <div className="space-y-6">
    <section className="rounded-2xl border bg-white p-6"><Link className="text-sm font-semibold text-indigo-700" to={`/instructor/classes/${classOfferingId}/learners`}>← Danh sách học viên</Link><h2 className="mt-3 text-2xl font-bold">{data.enrollment.learner.fullName}</h2><p className="text-slate-500">{data.enrollment.learner.email}</p></section>
    <section className="rounded-2xl border bg-white p-5"><h3 className="font-bold">Kết quả 4 kỹ năng gần nhất</h3>{data.latestFourSkillSnapshot ? <div className="mt-4"><p className="text-sm text-slate-500">{data.latestFourSkillSnapshot.assessmentTitle} · cùng một bài kiểm tra đã chấm hoàn tất</p><div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">{data.latestFourSkillSnapshot.scores.map((score) => <div className="rounded-xl bg-indigo-50 p-3" key={score.skill}><strong>{toeicSkillLabel[score.skill as ToeicSkill]}</strong><p className="text-xl font-bold text-indigo-700">{score.normalizedScore}%</p><div className="mt-2 h-2 overflow-hidden rounded-full bg-indigo-100"><div className="h-full bg-indigo-600" style={{ width: `${Math.max(0, Math.min(100, score.normalizedScore))}%` }} /></div></div>)}</div></div> : <p className="mt-3 text-slate-500">Chưa có bài kiểm tra trong lớp được chấm hoàn tất đủ bốn kỹ năng.</p>}</section>
    <section className="grid gap-6 lg:grid-cols-2"><div className="rounded-2xl border bg-white p-5"><h3 className="font-bold">Tiến độ bài học</h3><div className="mt-3 space-y-2">{data.lessonProgress.map((progress) => <div className="flex justify-between rounded-lg bg-slate-50 p-3" key={progress.lesson.id}><span><small className="block text-slate-500">{progress.lesson.module.title}</small>{progress.lesson.title}</span><strong className={progress.status === 'COMPLETED' ? 'text-emerald-700' : 'text-slate-500'}>{progress.status === 'COMPLETED' ? 'Hoàn thành' : progress.status === 'IN_PROGRESS' ? 'Đang học' : 'Chưa bắt đầu'}</strong></div>)}</div></div>
      <div className="rounded-2xl border bg-white p-5"><h3 className="font-bold">Lịch sử bài kiểm tra</h3><div className="mt-3 space-y-3">{attemptGroups.map((group) => <details className="rounded-xl border bg-slate-50 p-3" key={group.title} open><summary className="cursor-pointer font-semibold">{group.title} · {group.attempts.length} lượt</summary><div className="mt-3 space-y-3">{group.attempts.map((attempt) => <article className="rounded-lg bg-white p-3" key={attempt.id}><div className="flex justify-between"><span className="font-medium">Lượt {attempt.attemptNumber}</span><time className="text-xs text-slate-500">{attempt.submittedAt ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(attempt.submittedAt)) : 'Chưa có thời gian'}</time></div><div className="mt-2 flex flex-wrap gap-2">{attempt.skillScores.map((score) => <span className="rounded-full border px-2 py-1 text-xs" key={score.skill}>{toeicSkillLabel[score.skill as ToeicSkill]}: {score.status === 'FINAL' ? `${score.normalizedScore}%` : 'Đang chờ'}</span>)}</div>{attempt.feedback?.filter((item) => item.feedback).map((item, index) => <p className="mt-2 text-sm text-slate-600" key={index}>Nhận xét: {item.feedback}</p>)}</article>)}</div></details>)}{data.attempts.length === 0 ? <p className="text-slate-500">Chưa có bài đã nộp.</p> : null}</div></div>
    </section>
  </div>;
}
