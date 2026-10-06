import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { instructorApi } from '@/features/instructor/api';
import type { InstructorClass } from '@/features/instructor/types';

const statusLabels: Record<string, string> = { OPEN: 'Đang mở đăng ký', IN_PROGRESS: 'Đang học', CLOSED: 'Đã đóng', COMPLETED: 'Đã kết thúc', DRAFT: 'Bản nháp' };
const dayLabels = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

export function InstructorTeachingPage() {
  const [classes, setClasses] = useState<InstructorClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('ALL');
  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        let loaded: InstructorClass[];
        try {
          loaded = await instructorApi.classes.list(controller.signal);
        } catch (error) {
          if (error instanceof Error && error.name === 'AbortError') return;
          const entries = await instructorApi.teaching.list(controller.signal);
          loaded = entries.flatMap(({ course, classOfferings }) => classOfferings.map((offering) => ({
            ...offering,
            code: offering.code ?? '—',
            activeLearnerCount: offering.activeLearnerCount ?? 0,
            course: { id: course.id, title: course.title, level: course.level },
          })));
        }
        setClasses(loaded);
        setError(false);
      } catch (error) {
        if (!(error instanceof Error && error.name === 'AbortError')) setError(true);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, []);
  const filtered = useMemo(() => classes.filter((item) => (status === 'ALL' || item.status === status) && `${item.code} ${item.name} ${item.course.title}`.toLowerCase().includes(search.trim().toLowerCase())), [classes, search, status]);
  if (loading) return <div className="p-8 text-center text-gray-500" role="status">Đang tải danh sách...</div>;
  if (error) return <div className="p-8 text-center text-red-600">Không thể tải danh sách lớp giảng dạy. Vui lòng thử lại.</div>;
  return <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
    <header className="flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><p className="text-sm font-bold uppercase tracking-wider text-indigo-600">Không gian giảng dạy</p><h1 className="mt-1 text-3xl font-bold">Lớp giảng dạy của tôi</h1><p className="mt-2 text-slate-500">Theo dõi lịch học, sĩ số và mở nhanh không gian làm việc của từng lớp.</p></div><div className="flex flex-col gap-2 sm:flex-row"><input aria-label="Tìm lớp" className="rounded-xl border px-3 py-2" onChange={(event) => setSearch(event.target.value)} placeholder="Tìm mã, tên lớp, khóa học" value={search} /><select aria-label="Lọc trạng thái lớp" className="rounded-xl border px-3 py-2" onChange={(event) => setStatus(event.target.value)} value={status}><option value="ALL">Tất cả trạng thái</option><option value="OPEN">Đang mở đăng ký</option><option value="IN_PROGRESS">Đang học</option><option value="COMPLETED">Đã kết thúc</option><option value="CLOSED">Đã đóng</option></select></div></header>
    {filtered.length === 0 ? <div className="mt-7 rounded-2xl border bg-white p-10 text-center text-slate-500">Không có lớp phù hợp.</div> : <>
      <div className="mt-7 hidden overflow-hidden rounded-2xl border bg-white shadow-sm md:block"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-4">Lớp học</th><th className="px-5 py-4">Khóa học</th><th className="px-5 py-4">Lịch học</th><th className="px-5 py-4">Học viên</th><th className="px-5 py-4">Trạng thái</th><th className="px-5 py-4 text-right">Thao tác</th></tr></thead><tbody className="divide-y">{filtered.map((item, index) => <tr className={`${index % 2 ? 'bg-slate-50/60' : ''} hover:bg-indigo-50/50`} key={item.id}><td className="px-5 py-4"><p className="font-bold">{item.name}</p><p className="text-xs text-slate-500">{item.code}</p></td><td className="px-5 py-4"><p className="font-medium">{item.course.title}</p><p className="text-xs text-slate-500">{item.course.level}</p></td><td className="px-5 py-4"><Schedule item={item} /></td><td className="px-5 py-4 font-semibold">{item.activeLearnerCount}</td><td className="px-5 py-4"><span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700">{statusLabels[item.status] ?? 'Chưa xác định'}</span></td><td className="px-5 py-4 text-right"><Link className="inline-block rounded-lg bg-indigo-600 px-3 py-2 font-semibold text-white" to={`/instructor/classes/${item.id}`}>Vào lớp</Link></td></tr>)}</tbody></table></div>
      <div className="mt-7 grid gap-4 md:hidden">{filtered.map((item) => <article className="rounded-2xl border bg-white p-5 shadow-sm" key={item.id}><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase text-slate-500">{item.code}</p><h2 className="mt-1 text-lg font-bold">{item.name}</h2><p className="text-sm text-slate-600">{item.course.title}</p></div><span className="rounded-full bg-indigo-50 px-2 py-1 text-xs font-semibold text-indigo-700">{statusLabels[item.status] ?? 'Chưa xác định'}</span></div><dl className="mt-4 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-slate-500">Lịch học</dt><dd><Schedule item={item} /></dd></div><div><dt className="text-slate-500">Học viên</dt><dd className="font-semibold">{item.activeLearnerCount}</dd></div></dl><Link className="mt-4 block rounded-xl bg-indigo-600 px-4 py-2.5 text-center font-bold text-white" to={`/instructor/classes/${item.id}`}>Vào lớp</Link></article>)}</div>
    </>}
  </main>;
}

function Schedule({ item }: { item: InstructorClass }) {
  if (!item.scheduleSlots?.length) return <span className="text-slate-500">Chưa xếp lịch</span>;
  return <span className="flex flex-wrap gap-1.5">{item.scheduleSlots.map((slot, index) => <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium" key={`${slot.dayOfWeek}-${slot.startTime}-${index}`}>{dayLabels[slot.dayOfWeek] ?? `T${slot.dayOfWeek}`} · {slot.startTime}–{slot.endTime}{slot.locationText ? ` · ${slot.locationText}` : ''}</span>)}</span>;
}
