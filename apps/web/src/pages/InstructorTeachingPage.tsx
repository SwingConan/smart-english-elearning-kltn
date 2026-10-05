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
  return <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
    <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><p className="text-sm font-bold uppercase tracking-wider text-indigo-600">Instructor LMS</p><h1 className="mt-1 text-3xl font-bold">Lớp giảng dạy của tôi</h1><p className="mt-2 text-slate-500">Chọn một lớp để quản lý học viên, nội dung, bài kiểm tra và kết quả.</p></div><div className="flex flex-col gap-2 sm:flex-row"><input aria-label="Tìm lớp" className="rounded-xl border px-3 py-2" onChange={(event) => setSearch(event.target.value)} placeholder="Tìm mã, tên lớp, khóa học" value={search} /><select aria-label="Lọc trạng thái lớp" className="rounded-xl border px-3 py-2" onChange={(event) => setStatus(event.target.value)} value={status}><option value="ALL">Tất cả trạng thái</option><option value="OPEN">Đang mở đăng ký</option><option value="IN_PROGRESS">Đang học</option><option value="COMPLETED">Đã kết thúc</option><option value="CLOSED">Đã đóng</option></select></div></div>
    <div className="mt-7 space-y-3">{filtered.map((item) => <article className="rounded-2xl border bg-white p-5 shadow-sm" key={item.id}><div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-center"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><div><span className="text-xs font-bold uppercase text-slate-500">{item.code}</span><h2 className="mt-1 text-lg font-bold">{item.name}</h2></div><div><span className="text-xs text-slate-500">Khóa học</span><p className="font-semibold">{item.course.title}</p><small>{item.course.level}</small></div><div><span className="text-xs text-slate-500">Lịch học</span><p>{item.scheduleSlots?.length ? item.scheduleSlots.map((slot) => `${dayLabels[slot.dayOfWeek]} ${slot.startTime}–${slot.endTime}`).join(', ') : 'Chưa xếp lịch'}</p></div><div><span className="text-xs text-slate-500">Học viên / trạng thái</span><p><strong>{item.activeLearnerCount}</strong> · {statusLabels[item.status] ?? item.status}</p></div></div><Link className="rounded-xl bg-indigo-600 px-5 py-3 text-center font-bold text-white hover:bg-indigo-700" to={`/instructor/classes/${item.id}`}>Vào lớp</Link></div><details className="mt-3 text-xs text-slate-500"><summary className="cursor-pointer">Công cụ nâng cao</summary><div className="mt-2 flex flex-wrap gap-3"><Link to={`/instructor/classes/${item.id}/assessments`}>Bài kiểm tra của lớp</Link><Link to={`/instructor/courses/${item.course.id}/question-bank`}>Ngân hàng câu hỏi</Link><Link to={`/instructor/courses/${item.course.id}/tests`}>Mẫu bài kiểm tra</Link><Link to={`/instructor/courses/${item.course.id}/skills`}>Mô hình kiến thức — Kỹ năng (KC)</Link><Link to={`/instructor/courses/${item.course.id}/adaptive-policy`}>Chính sách thích ứng</Link><Link to={`/instructor/courses/${item.course.id}/learner-mastery`}>Mức độ thành thạo của học viên</Link></div></details></article>)}{filtered.length === 0 ? <div className="rounded-2xl border bg-white p-10 text-center text-slate-500">Không có lớp phù hợp.</div> : null}</div>
  </div>;
}
