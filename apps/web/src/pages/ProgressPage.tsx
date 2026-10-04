import { useEffect, useState } from 'react';
import { CheckCircle2, Circle, ClipboardCheck } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { assessmentTypeLabel } from '@/features/assessments/display';
import { learningApi } from '@/features/learning/api';
import type { CourseProgress } from '@/features/learning/types';

export function ProgressPage() {
  const { enrollmentId = '' } = useParams();
  const [progress, setProgress] = useState<CourseProgress | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void learningApi.getProgress(enrollmentId, controller.signal).then((data) => {
      setProgress(data); setState('ready');
    }).catch((error: unknown) => {
      if (!(error instanceof DOMException && error.name === 'AbortError')) setState('error');
    });
    return () => controller.abort();
  }, [enrollmentId, reload]);
  if (state === 'loading') return <div className="h-80 animate-pulse rounded-2xl bg-white" role="status" />;
  if (state === 'error' || !progress) return <div className="state-error">Không thể tải tiến độ.<button className="ml-3 font-semibold underline" onClick={() => { setState('loading'); setReload((value) => value + 1); }} type="button">Thử lại</button></div>;
  return <section className="space-y-6">
    <header className="rounded-2xl border bg-white p-6"><p className="eyebrow">Tiến độ</p><h2 className="mt-2 text-3xl font-bold">Tiến độ lớp học</h2><div className="mt-6 flex items-end justify-between"><div><p className="text-5xl font-bold text-indigo-700">{progress.progressPercent}%</p><p className="mt-2 text-sm text-slate-500">{progress.completedLessons}/{progress.totalLessons} bài đã hoàn thành</p></div></div><div className="mt-5 h-3 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-indigo-600" style={{ width: `${progress.progressPercent}%` }} /></div></header>
    <div className="space-y-5">{progress.modules.map((module) => <article className="rounded-2xl border bg-white p-6" key={module.id}><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold text-indigo-700">HỌC PHẦN {module.orderIndex + 1}</p><h3 className="mt-1 text-xl font-bold">{module.title}</h3></div><span className="font-bold text-indigo-700">{module.progressPercent}%</span></div><ul className="mt-5 divide-y">{module.lessons.map((lesson) => <li className="flex items-center gap-3 py-3" key={lesson.id}>{lesson.status === 'COMPLETED' ? <CheckCircle2 className="text-emerald-600" size={19} /> : <Circle className="text-slate-400" size={19} />}<Link className="flex-1 font-medium hover:text-indigo-700" to={`/student/enrollments/${enrollmentId}/lessons/${lesson.id}`}>{lesson.title}</Link><span className="text-xs text-slate-500">{lesson.status === 'COMPLETED' ? 'Hoàn thành' : lesson.status === 'IN_PROGRESS' ? 'Đang học' : 'Chưa học'}</span></li>)}</ul></article>)}</div>
    <section className="rounded-2xl border bg-white p-6"><h2 className="flex items-center gap-2 text-xl font-bold"><ClipboardCheck />Tiến độ bài kiểm tra</h2>{progress.assessments.length === 0 ? <p className="mt-4 text-slate-600">Chưa có bài kiểm tra trong lớp.</p> : <div className="mt-4 grid gap-3 md:grid-cols-2">{progress.assessments.map((item) => <div className="rounded-xl bg-slate-50 p-4" key={item.id}><span className="rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-semibold text-indigo-800">{assessmentTypeLabel(item.purpose, item.stage)}</span><p className="mt-2 font-semibold">{item.title}</p><p className="mt-1 text-sm text-slate-500">{item.status === 'COMPLETED' ? 'Đã nộp' : item.status === 'IN_PROGRESS' ? 'Đang làm' : 'Chưa bắt đầu'}</p>{item.status === 'COMPLETED' && (item.skillResults?.length ?? 0) > 0 ? <div className="mt-3 grid grid-cols-2 gap-2 text-xs">{item.skillResults?.map((skill) => <div className="rounded-lg border bg-white px-2 py-1.5" key={skill.skill}><span className="font-semibold">{skillLabel(skill.skill)}</span>{' '}<span className="text-slate-500">{skill.state === 'FINAL' && skill.normalizedScore !== null ? `${formatPercent(skill.normalizedScore)}%` : skill.state === 'PENDING_REVIEW' ? 'Chờ chấm' : 'Chưa có câu trả lời'}</span></div>)}</div> : null}{item.attemptId && item.status === 'COMPLETED' ? <Link className="mt-3 inline-block text-sm font-semibold text-indigo-700" to={`/student/enrollments/${enrollmentId}/attempts/${item.attemptId}/result`}>Xem kết quả</Link> : null}</div>)}</div>}</section>
  </section>;
}

function skillLabel(skill: 'LISTENING' | 'READING' | 'SPEAKING' | 'WRITING') { return { LISTENING: 'Listening', READING: 'Reading', SPEAKING: 'Speaking', WRITING: 'Writing' }[skill]; }
function formatPercent(value: number) { return Number.isInteger(value) ? String(value) : value.toFixed(1); }
