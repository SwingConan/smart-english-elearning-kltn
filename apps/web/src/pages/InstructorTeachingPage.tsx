import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import {
  BookOpen,
  Calendar,
  FileCheck2,
  HelpCircle,
  MoreVertical,
  Search,
  Star,
  Users,
} from 'lucide-react';
import { instructorApi } from '@/features/instructor/api';
import { classStatus } from '@/features/instructor/class-status';
import type { InstructorClass } from '@/features/instructor/types';
import { WEEKDAY_OPTIONS, weekdayLabel } from '@/features/classes/schedule';
import { IuhCourseCardBanner } from '@/features/class-lms/IuhLmsShell';
import { classCodeLabel } from '@/features/demo/presentation';
import { learnerClassLabel, learnerCourseLabel } from '@/features/enrollments/presentation';

type ViewMode = 'CARD' | 'TABLE';

export function InstructorTeachingPage() {
  const [classes, setClasses] = useState<InstructorClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState('');
  const [courseId, setCourseId] = useState('ALL');
  const [status, setStatus] = useState('ALL');
  const [day, setDay] = useState('ALL');
  const [viewMode, setViewMode] = useState<ViewMode>('CARD');

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
          loaded = entries.flatMap(({ course, classOfferings }) =>
            classOfferings.map((offering) => ({
              ...offering,
              code: offering.code ?? '—',
              activeLearnerCount: offering.activeLearnerCount ?? 0,
              course: { id: course.id, title: course.title, level: course.level },
            })),
          );
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
        `${classCodeLabel(item.code)} ${item.code} ${learnerClassLabel(item.name, item.code, item.course.title)} ${item.name} ${learnerCourseLabel(item.course.title)}`
          .toLocaleLowerCase('vi')
          .includes(needle),
    );
    return [...new Map(filtered.map((item) => [item.course.id, item.course])).values()].map(
      (course) => ({ course, classes: filtered.filter((item) => item.course.id === course.id) }),
    );
  }, [classes, courseId, day, search, status]);

  if (loading) {
    return (
      <div className="p-8 text-center text-gray-500" role="status">
        Đang tải danh sách...
      </div>
    );
  }
  if (error) {
    return (
      <div className="state-error text-red-600">Không thể tải danh sách lớp giảng dạy.</div>
    );
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-[#76a35e]">
            Không gian giảng dạy
          </p>
          <h1 className="mt-1 text-2xl font-bold text-[#e66f2b] sm:text-[26px]">
            Lớp được phân công giảng dạy
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Mở từng lớp để tổ chức học phần, thêm hoạt động học tập, chấm bài và điểm danh theo đúng
            giao diện lớp học.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/instructor/assessments-hub"
            className="inline-flex items-center gap-1.5 rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <HelpCircle size={14} aria-hidden="true" />
            Ngân hàng câu hỏi
          </Link>
          <Link
            to="/instructor/requests"
            className="inline-flex items-center gap-1.5 rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Calendar size={14} aria-hidden="true" />
            Meet & Đề nghị lịch
          </Link>
        </div>
      </header>

      <section className="rounded border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-3">
          <h2 className="text-[15px] font-semibold text-[#e66f2b]">
            Tổng quan về các lớp phụ trách
          </h2>
          <span className="text-xs text-slate-500">
            {classes.length} lớp · {courses.length} khóa học
          </span>
        </div>

        {/* IUH Compact Filter Toolbar */}
        <section
          aria-label="Bộ lọc lớp"
          className="flex flex-wrap items-center justify-between gap-2.5 px-4 py-4 sm:px-5"
        >
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <div className="relative w-full sm:w-56">
              <Search
                size={15}
                className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
              <input
                aria-label="Tìm lớp"
                className="w-full min-w-0 rounded border border-slate-300 bg-white py-1.5 pr-3 pl-8 text-sm text-slate-800 placeholder:text-slate-400 focus:border-[#76a35e] focus:outline-none"
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm mã, tên lớp, khóa học"
                value={search}
              />
            </div>

            <select
              aria-label="Lọc khóa học"
              className="w-full min-w-0 max-w-full rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 focus:border-[#76a35e] focus:outline-none sm:w-auto"
              onChange={(e) => setCourseId(e.target.value)}
              value={courseId}
            >
              <option value="ALL">Tất cả khóa học</option>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {learnerCourseLabel(course.title)}
                </option>
              ))}
            </select>

            <select
              aria-label="Lọc trạng thái lớp"
              className="w-full min-w-0 max-w-full rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 focus:border-[#76a35e] focus:outline-none sm:w-auto"
              onChange={(e) => setStatus(e.target.value)}
              value={status}
            >
              <option value="ALL">Tất cả trạng thái</option>
              {['OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'DRAFT'].map((value) => (
                <option key={value} value={value}>
                  {classStatus(value).label}
                </option>
              ))}
            </select>

            <select
              aria-label="Lọc ngày học"
              className="w-full min-w-0 max-w-full rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 focus:border-[#76a35e] focus:outline-none sm:w-auto"
              onChange={(e) => setDay(e.target.value)}
              value={day}
            >
              <option value="ALL">Tất cả ngày học</option>
              {WEEKDAY_OPTIONS.map(({ label, value }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <select
            aria-label="Kiểu hiển thị"
            value={viewMode}
            onChange={(e) => setViewMode(e.target.value as ViewMode)}
            className="w-full min-w-0 max-w-full rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 focus:border-[#76a35e] focus:outline-none sm:w-auto"
          >
            <option value="CARD">Dạng thẻ</option>
            <option value="TABLE">Dạng bảng</option>
          </select>
        </section>

        <div className="space-y-6 border-t border-slate-200 px-5 py-5">
          {groups.map(({ course, classes: rows }) => {
            const totalLearners = rows.reduce((sum, row) => sum + row.activeLearnerCount, 0);
            return (
              <details className="space-y-3" key={course.id} open>
                <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 rounded border border-slate-200 bg-[#f8f9fa] px-4 py-3">
                  <div>
                    <h2 className="text-base font-bold text-slate-900">
                      {learnerCourseLabel(course.title)}
                    </h2>
                    <p className="text-xs text-slate-500">
                      {({ FOUNDATION: 'Nền tảng', INTERMEDIATE: 'Trung cấp', ADVANCED: 'Nâng cao', ADVANCING: 'Trung cao cấp' }[course.level] ?? course.level)} · {rows.length} lớp
                    </p>
                  </div>
                  <strong className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#2f5d1e]">
                    <Users size={14} aria-hidden="true" />
                    {totalLearners} học viên đang học
                  </strong>
                </summary>

                {/* Desktop View */}
                <div className="hidden md:block">
                  {viewMode === 'CARD' ? (
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                      {rows.map((item, idx) => (
                        <IuhInstructorClassCard
                          item={item}
                          courseId={course.id}
                          variantIndex={idx}
                          key={item.id}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded border border-slate-200">
                      <table className="min-w-[760px] w-full text-left text-sm">
                        <thead className="border-b bg-[#f8f9fa] text-xs uppercase text-slate-600">
                          <tr>
                            <th className="px-4 py-2.5">Lớp học</th>
                            <th className="px-4 py-2.5">Lịch học</th>
                            <th className="px-4 py-2.5">Học viên</th>
                            <th className="px-4 py-2.5">Trạng thái</th>
                            <th className="px-4 py-2.5 text-right">Thao tác</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {rows.map((item) => (
                            <ClassRow item={item} key={item.id} />
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Mobile View */}
                <div className="grid gap-3 md:hidden">
                  {rows.map((item) => (
                    <ClassCard item={item} key={item.id} />
                  ))}
                </div>
              </details>
            );
          })}

          {groups.length === 0 && (
            <div className="state-empty rounded border border-dashed border-slate-300 bg-[#f8f9fa] p-8 text-center text-sm text-slate-600">
              Không có lớp phù hợp với bộ lọc hiện tại.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function StatusPill({ value }: { value: string }) {
  const item = classStatus(value);
  return (
    <span
      className={`inline-flex whitespace-nowrap rounded border px-2 py-0.5 text-[11px] font-semibold ${item.className}`}
    >
      {item.label}
    </span>
  );
}

function IuhInstructorClassCard({
  item,
  courseId,
  variantIndex,
}: {
  item: InstructorClass;
  courseId: string;
  variantIndex: number;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const displayName = learnerClassLabel(item.name, item.code, item.course.title);
  const displayCode = classCodeLabel(item.code);

  return (
    <article className="relative flex flex-col overflow-hidden rounded border border-slate-200 bg-white transition hover:border-slate-300">
      <IuhCourseCardBanner variantIndex={variantIndex} />

      <div className="flex flex-1 flex-col justify-between p-3.5">
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-2">
            <Link
              to={`/classroom/${item.id}`}
              className="flex items-start gap-1.5 text-[14px] font-semibold leading-snug text-[#e66f2b] hover:underline"
            >
              <Star
                size={13}
                className="mt-1 shrink-0 fill-[#76a35e] text-[#76a35e]"
                aria-hidden="true"
              />
              <span className="line-clamp-2">{displayName}</span>
            </Link>

            <div className="relative shrink-0">
              <button
                type="button"
                aria-label={`Tùy chọn nhanh cho ${displayName}`}
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((v) => !v)}
                className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
              >
                <MoreVertical size={15} aria-hidden="true" />
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-full z-20 mt-1 w-52 rounded border border-slate-200 bg-white py-1 text-xs shadow-lg">
                  <Link
                    to={`/instructor/classes/${item.id}`}
                    className="flex items-center gap-2 px-3 py-2 text-slate-700 hover:bg-slate-50 hover:text-[#e66f2b]"
                  >
                    <Users size={13} aria-hidden="true" />
                    Học viên, Điểm & Sĩ số
                  </Link>
                  <Link
                    to={`/instructor/courses/${courseId}/question-bank`}
                    className="flex items-center gap-2 px-3 py-2 text-slate-700 hover:bg-slate-50 hover:text-[#e66f2b]"
                  >
                    <HelpCircle size={13} aria-hidden="true" />
                    Ngân hàng câu hỏi
                  </Link>
                  <Link
                    to={`/instructor/courses/${courseId}/tests`}
                    className="flex items-center gap-2 px-3 py-2 text-slate-700 hover:bg-slate-50 hover:text-[#e66f2b]"
                  >
                    <FileCheck2 size={13} aria-hidden="true" />
                    Đề kiểm tra khóa học
                  </Link>
                </div>
              )}
            </div>
          </div>

          <p className="text-xs font-medium text-slate-500">{displayCode}</p>
          <div className="text-xs">
            <Schedule item={item} />
          </div>
        </div>

        <div className="mt-3.5 flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill value={item.status} />
            <span className="text-xs font-medium text-slate-600">
              {item.activeLearnerCount} học viên
            </span>
          </div>
          <Link
            className="inline-flex items-center gap-1 whitespace-nowrap rounded bg-[#76a35e] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#658f50]"
            to={`/classroom/${item.id}`}
          >
            <BookOpen size={13} aria-hidden="true" />
            Vào lớp
          </Link>
        </div>
      </div>
    </article>
  );
}

function ClassRow({ item }: { item: InstructorClass }) {
  const displayName = learnerClassLabel(item.name, item.code, item.course.title);
  const displayCode = classCodeLabel(item.code);
  return (
    <tr className="hover:bg-[#f8f9fa]">
      <td className="px-4 py-3">
        <Link
          to={`/classroom/${item.id}`}
          className="font-semibold text-[#e66f2b] hover:underline"
        >
          {displayName}
        </Link>
        <p className="text-xs text-slate-500">{displayCode}</p>
      </td>
      <td className="px-4 py-3">
        <Schedule item={item} />
      </td>
      <td className="px-4 py-3 font-semibold text-slate-800">{item.activeLearnerCount}</td>
      <td className="px-4 py-3">
        <StatusPill value={item.status} />
      </td>
      <td className="px-4 py-3 text-right">
        <Link
          className="inline-block whitespace-nowrap rounded bg-[#76a35e] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#658f50]"
          to={`/classroom/${item.id}`}
        >
          Vào lớp
        </Link>
      </td>
    </tr>
  );
}

function ClassCard({ item }: { item: InstructorClass }) {
  const displayName = learnerClassLabel(item.name, item.code, item.course.title);
  const displayCode = classCodeLabel(item.code);
  return (
    <article className="min-w-0 rounded border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-bold break-words text-[#e66f2b]">{displayName}</h3>
          <p className="text-xs break-all text-slate-500">{displayCode}</p>
        </div>
        <StatusPill value={item.status} />
      </div>
      <div className="mt-3 text-sm">
        <Schedule item={item} />
      </div>
      <p className="mt-3 text-xs text-slate-700">
        <strong>{item.activeLearnerCount}</strong> học viên
      </p>
      <Link
        className="mt-3 block whitespace-nowrap rounded bg-[#76a35e] px-3 py-2 text-center text-xs font-semibold text-white hover:bg-[#658f50]"
        to={`/classroom/${item.id}`}
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
          className="inline-flex max-w-full flex-wrap items-center gap-1 break-words rounded bg-slate-100 px-2 py-0.5 text-xs font-medium leading-relaxed text-slate-700"
          key={`${slot.dayOfWeek}-${slot.startTime}-${slot.endTime}-${slot.locationText}`}
        >
          <span>
            {weekdayLabel(slot.dayOfWeek)} · {slot.startTime}–{slot.endTime}
            {slot.locationText ? ` · ${slot.locationText}` : ''}
          </span>
        </span>
      ))}
    </span>
  );
}
