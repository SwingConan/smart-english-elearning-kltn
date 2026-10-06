import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { instructorApi } from '@/features/instructor/api';
import type { InstructorRoster } from '@/features/instructor/types';

const statusLabel: Record<string, string> = { ACTIVE: 'Đang học', COMPLETED: 'Hoàn thành', CANCELLED: 'Đã hủy', REFUNDED: 'Đã hoàn tiền', PENDING_PAYMENT: 'Chờ thanh toán' };

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
    <div className="mt-5 hidden md:block"><table className="min-w-full text-sm"><thead><tr className="border-b text-left text-slate-500"><th className="p-3">Học viên</th><th className="p-3">Trạng thái</th><th className="p-3">Bài học</th><th className="p-3">Bài đã nộp</th><th className="p-3">Chờ chấm</th><th className="p-3"><span className="sr-only">Thao tác</span></th></tr></thead><tbody>{rows.map((item) => <tr className="border-b last:border-0" key={item.id}><td className="p-3"><strong>{item.learner.fullName}</strong><br/><span className="text-slate-500">{item.learner.email}</span></td><td className="p-3">{statusLabel[item.status] ?? 'Chưa xác định'}</td><td className="p-3">{item.completedLessons}/{item.totalLessons} · {item.progressPercentage}%</td><td className="p-3">{item.submittedAssessmentCount}</td><td className="p-3">{item.pendingGradingCount}</td><td className="p-3"><Link className="font-semibold text-indigo-700" to={detailUrl(item.id)}>Xem chi tiết</Link></td></tr>)}</tbody></table></div>
    <div className="mt-5 grid gap-3 md:hidden" data-testid="mobile-roster-cards">{rows.map((item) => <article className="rounded-xl border p-4" key={item.id}><div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold">{item.learner.fullName}</h3><p className="break-all text-sm text-slate-500">{item.learner.email}</p></div><span className="rounded-full bg-indigo-50 px-2 py-1 text-xs text-indigo-700">{statusLabel[item.status] ?? 'Chưa xác định'}</span></div><dl className="mt-4 grid grid-cols-3 gap-2 text-sm"><div><dt className="text-slate-500">Bài học</dt><dd className="font-semibold">{item.completedLessons}/{item.totalLessons}</dd></div><div><dt className="text-slate-500">Đã nộp</dt><dd className="font-semibold">{item.submittedAssessmentCount}</dd></div><div><dt className="text-slate-500">Chờ chấm</dt><dd className="font-semibold">{item.pendingGradingCount}</dd></div></dl><Link className="mt-4 inline-block font-semibold text-indigo-700" to={detailUrl(item.id)}>Xem chi tiết</Link></article>)}</div>
    {rows.length === 0 ? <p className="py-8 text-center text-slate-500">Không có học viên phù hợp.</p> : null}
  </section>;
}
