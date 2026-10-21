import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { instructorApi } from '@/features/instructor/api';
import type { EnrollmentStatus, InstructorRoster } from '@/features/instructor/types';

const statusPresentation: Record<EnrollmentStatus, { label: string; className: string }> = {
  ACTIVE: { label: 'Đang học', className: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  PENDING_PAYMENT: { label: 'Chờ thanh toán', className: 'bg-amber-50 text-amber-700 ring-amber-200' },
  COMPLETED: { label: 'Hoàn thành', className: 'bg-blue-50 text-blue-700 ring-blue-200' },
  DROPPED: { label: 'Đã rời lớp', className: 'bg-slate-100 text-slate-700 ring-slate-200' },
  CANCELLED: { label: 'Đã hủy', className: 'bg-rose-50 text-rose-700 ring-rose-200' },
};

function RosterStatusBadge({ status }: { status: EnrollmentStatus }) {
  const presentation = statusPresentation[status];
  return <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${presentation.className}`}>{presentation.label}</span>;
}

export function InstructorRosterPage() {
  const { classOfferingId = '' } = useParams();
  const [data, setData] = useState<InstructorRoster | null>(null);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState('');
  useEffect(() => { const controller = new AbortController(); void instructorApi.classes.learners(classOfferingId, controller.signal).then((loaded) => { setData(loaded); setError(false); }).catch((cause: unknown) => { if (!(cause instanceof Error && cause.name === 'AbortError')) setError(true); }); return () => controller.abort(); }, [classOfferingId]);
  const rows = useMemo(() => data?.learners.filter((item) => `${item.learner.fullName} ${item.learner.email}`.toLowerCase().includes(search.toLowerCase())) ?? [], [data, search]);
  const detailUrl = (id: string) => `/instructor/classes/${classOfferingId}/learners/${id}`;
  if (error) return <div className="state-error">Không thể tải danh sách học viên.</div>;
  if (!data) return <div className="h-56 animate-pulse rounded-2xl bg-slate-200" role="status" />;
  return <section className="rounded-2xl border bg-white p-5 shadow-sm">
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><h2 className="text-2xl font-bold">Học viên</h2><p className="text-sm text-slate-500">Theo dõi tiến độ học tập và bài kiểm tra của từng học viên.</p></div><input aria-label="Tìm học viên" className="rounded-xl border px-3 py-2" onChange={(event) => setSearch(event.target.value)} placeholder="Tìm tên hoặc email" value={search} /></div>
    <div className="mt-5 hidden overflow-x-auto md:block"><table className="min-w-full text-sm"><thead><tr className="border-b bg-slate-50 text-left text-slate-500"><th className="p-3">Học viên</th><th className="p-3">Trạng thái</th><th className="p-3">Tiến độ bài học</th><th className="p-3">Bài gần nhất</th><th className="p-3">Hoạt động học gần nhất</th><th className="p-3"><span className="sr-only">Thao tác</span></th></tr></thead><tbody>{rows.map((item, index) => <tr className={index % 2 ? 'bg-slate-50/70' : ''} key={item.id}><td className="p-3"><strong>{item.learner.fullName}</strong><br/><span className="text-slate-500">{item.learner.email}</span></td><td className="p-3"><RosterStatusBadge status={item.status} /></td><td className="min-w-44 p-3"><div className="mb-1 flex justify-between text-xs"><span>{item.completedLessons}/{item.totalLessons}</span><strong>{item.progressPercentage}%</strong></div><div className="h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-indigo-600" style={{ width: `${item.progressPercentage}%` }} /></div></td><td className="p-3">{item.latestAssessment ? <><p className="font-medium">{item.latestAssessment.title}</p><p className="text-xs text-slate-500">{item.latestAssessment.state === 'PENDING' ? 'Chờ chấm' : item.latestAssessment.average === null ? 'Đã nộp' : `${item.latestAssessment.average}%`}</p></> : 'Chưa có'}</td><td className="p-3 text-slate-600">{formatDate(item.latestLearningActivityAt)}</td><td className="p-3"><Link className="font-semibold text-indigo-700" to={detailUrl(item.id)}>Xem chi tiết</Link></td></tr>)}</tbody></table></div>
    <div className="mt-5 grid gap-3 md:hidden" data-testid="mobile-roster-cards">{rows.map((item) => <article className="rounded-xl border p-4" key={item.id}><div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold">{item.learner.fullName}</h3><p className="break-all text-sm text-slate-500">{item.learner.email}</p></div><RosterStatusBadge status={item.status} /></div><dl className="mt-4 grid grid-cols-3 gap-2 text-sm"><div><dt className="text-slate-500">Bài học</dt><dd className="font-semibold">{item.completedLessons}/{item.totalLessons}</dd></div><div><dt className="text-slate-500">Đã nộp</dt><dd className="font-semibold">{item.submittedAssessmentCount}</dd></div><div><dt className="text-slate-500">Chờ chấm</dt><dd className="font-semibold">{item.pendingGradingCount}</dd></div></dl><Link className="mt-4 inline-block font-semibold text-indigo-700" to={detailUrl(item.id)}>Xem chi tiết</Link></article>)}</div>
    {rows.length === 0 ? <p className="py-8 text-center text-slate-500">Không có học viên phù hợp.</p> : null}
  </section>;
}

function formatDate(value?: string | null): string { return value ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : 'Chưa có'; }
