import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { instructorApi } from '@/features/instructor/api';
import { classStatus } from '@/features/instructor/class-status';
import type { InstructorClass } from '@/features/instructor/types';

const dayLabels = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

export function InstructorTeachingPage() {
  const [classes, setClasses] = useState<InstructorClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState('');
  const [courseId, setCourseId] = useState('ALL');
  const [status, setStatus] = useState('ALL');
  const [day, setDay] = useState('ALL');
  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        let loaded: InstructorClass[];
        try {
          loaded = await instructorApi.classes.list(controller.signal);
        } catch (cause) {
          if (cause instanceof Error && cause.name === 'AbortError') return;
          const entries = await instructorApi.teaching.list(controller.signal);
          loaded = entries.flatMap(({ course, classOfferings }) => classOfferings.map((offering) => ({ ...offering, code: offering.code ?? '—', activeLearnerCount: offering.activeLearnerCount ?? 0, course: { id: course.id, title: course.title, level: course.level } })));
        }
        setClasses(loaded);
        setError(false);
      } catch (cause) {
        if (!(cause instanceof Error && cause.name === 'AbortError')) setError(true);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, []);
  const courses = useMemo(
    () => [...new Map(classes.map((item) => [item.course.id, item.course])).values()],
    [classes],
  );
  const groups = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase('vi');
    const filtered = classes.filter(
      (item) =>
        (courseId === 'ALL' || item.course.id === courseId) &&
        (status === 'ALL' || item.status === status) &&
        (day === 'ALL' || item.scheduleSlots?.some((slot) => String(slot.dayOfWeek) === day)) &&
        `${item.code} ${item.name} ${item.course.title}`.toLocaleLowerCase('vi').includes(needle),
    );
    return [...new Map(filtered.map((item) => [item.course.id, item.course])).values()].map(
      (course) => ({ course, classes: filtered.filter((item) => item.course.id === course.id) }),
    );
  }, [classes, courseId, day, search, status]);
  if (loading)
    return (
      <div className="p-8 text-center text-gray-500" role="status">
        Đang tải danh sách...
      </div>
    );
  if (error) return <div className="state-error text-red-600">Không thể tải danh sách lớp giảng dạy.</div>;
  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <header>
        <p className="text-sm font-bold uppercase tracking-wider text-indigo-600">
          Không gian giảng dạy
        </p>
        <h1 className="mt-1 text-3xl font-bold">Lớp giảng dạy của tôi</h1>
        <p className="mt-2 text-slate-500">
          Các lớp được nhóm theo khóa học để thầy cô theo dõi nhanh và không lặp thông tin.
        </p>
      </header>
      <section aria-label="Bộ lọc lớp" className="mt-6 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <input
          aria-label="Tìm lớp"
          className="rounded-xl border px-3 py-2"
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm mã, tên lớp, khóa học"
          value={search}
        />
        <select
          aria-label="Lọc khóa học"
          className="rounded-xl border px-3 py-2"
          onChange={(e) => setCourseId(e.target.value)}
          value={courseId}
        >
          <option value="ALL">Tất cả khóa học</option>
          {courses.map((course) => (
            <option key={course.id} value={course.id}>
              {course.title}
            </option>
          ))}
        </select>
        <select
          aria-label="Lọc trạng thái lớp"
          className="rounded-xl border px-3 py-2"
          onChange={(e) => setStatus(e.target.value)}
          value={status}
        >
          <option value="ALL">Tất cả trạng thái</option>
          {['OPEN', 'IN_PROGRESS', 'COMPLETED', 'CLOSED', 'DRAFT'].map((value) => (
            <option key={value} value={value}>
              {classStatus(value).label}
            </option>
          ))}
        </select>
        <select
          aria-label="Lọc ngày học"
          className="rounded-xl border px-3 py-2"
          onChange={(e) => setDay(e.target.value)}
          value={day}
        >
          <option value="ALL">Tất cả ngày học</option>
          {dayLabels.map((label, index) => (
            <option key={label} value={index}>
              {label}
            </option>
          ))}
        </select>
      </section>
      <div className="mt-7 space-y-5">
        {groups.map(({ course, classes: rows }) => (
          <details
            className="overflow-hidden rounded-2xl border bg-white shadow-sm"
            key={course.id}
            open
          >
            <summary className="cursor-pointer list-none bg-slate-50 px-5 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold">{course.title}</h2>
                  <p className="text-sm text-slate-500">
                    {course.level} · {rows.length} lớp
                  </p>
                </div>
                <strong className="text-sm text-indigo-700">
                  {rows.reduce((sum, row) => sum + row.activeLearnerCount, 0)} học viên đang học
                </strong>
              </div>
            </summary>
            <div className="hidden overflow-x-auto md:block">
              <table className="min-w-[760px] w-full text-left text-sm">
                <thead className="border-y bg-white text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-5 py-3">Lớp học</th>
                    <th className="px-5 py-3">Lịch học</th>
                    <th className="px-5 py-3">Học viên</th>
                    <th className="px-5 py-3">Trạng thái</th>
                    <th className="px-5 py-3 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((item) => (
                    <ClassRow item={item} key={item.id} />
                  ))}
                </tbody>
              </table>
            </div>
            <div className="grid gap-3 p-4 md:hidden">
              {rows.map((item) => (
                <ClassCard item={item} key={item.id} />
              ))}
            </div>
          </details>
        ))}
        {groups.length === 0 && <div className="state-empty">Không có lớp phù hợp.</div>}
      </div>
    </main>
  );
}
function StatusPill({ value }: { value: string }) {
  const item = classStatus(value);
  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold ${item.className}`}
    >
      {item.label}
    </span>
  );
}
function ClassRow({ item }: { item: InstructorClass }) {
  return (
    <tr className="hover:bg-indigo-50/40">
      <td className="px-5 py-4">
        <p className="font-bold">{item.name}</p>
        <p className="text-xs text-slate-500">{item.code}</p>
      </td>
      <td className="px-5 py-4">
        <Schedule item={item} />
      </td>
      <td className="px-5 py-4 font-semibold">{item.activeLearnerCount}</td>
      <td className="px-5 py-4">
        <StatusPill value={item.status} />
      </td>
      <td className="px-5 py-4 text-right">
        <Link
          className="inline-block whitespace-nowrap rounded-lg bg-indigo-600 px-3 py-2 font-semibold text-white"
          to={`/instructor/classes/${item.id}`}
        >
          Vào lớp
        </Link>
      </td>
    </tr>
  );
}
function ClassCard({ item }: { item: InstructorClass }) {
  return (
    <article className="rounded-xl border p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-bold">{item.name}</h3>
          <p className="text-xs text-slate-500">{item.code}</p>
        </div>
        <StatusPill value={item.status} />
      </div>
      <div className="mt-3 text-sm">
        <Schedule item={item} />
      </div>
      <p className="mt-3 text-sm">
        <strong>{item.activeLearnerCount}</strong> học viên
      </p>
      <Link
        className="mt-3 block whitespace-nowrap rounded-lg bg-indigo-600 px-3 py-2 text-center font-semibold text-white"
        to={`/instructor/classes/${item.id}`}
      >
        Vào lớp
      </Link>
    </article>
  );
}
function Schedule({ item }: { item: InstructorClass }) {
  const slots = [
    ...new Map(
      (item.scheduleSlots ?? []).map((slot) => [
        `${slot.dayOfWeek}|${slot.startTime}|${slot.endTime}|${slot.locationText ?? ''}`,
        slot,
      ]),
    ).values(),
  ];
  if (!slots.length) return <span className="text-slate-500">Chưa xếp lịch</span>;
  return (
    <span className="flex flex-wrap gap-1.5">
      {slots.map((slot) => (
        <span
          className="whitespace-nowrap rounded-full bg-slate-100 px-2 py-1 text-xs font-medium"
          key={`${slot.dayOfWeek}-${slot.startTime}-${slot.endTime}-${slot.locationText}`}
        >
          {dayLabels[slot.dayOfWeek]} · {slot.startTime}–{slot.endTime}
          {slot.locationText ? ` · ${slot.locationText}` : ''}
        </span>
      ))}
    </span>
  );
}
