import { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  MoreVertical,
  Search,
  Star,
  UserRound,
} from 'lucide-react';
import { Link } from 'react-router';
import { enrollmentApi } from '@/features/enrollments/api';
import type { EnrollmentStatus, EnrollmentView } from '@/features/enrollments/types';
import { learnerClassLabel, learnerCourseLabel } from '@/features/enrollments/presentation';
import { accountLabel } from '@/features/catalog/record-presentation';
import { IuhCourseCardBanner } from '@/features/class-lms/IuhLmsShell';

type Filter = 'ALL' | 'ACTIVE' | 'COMPLETED' | 'PENDING_PAYMENT' | 'CANCELLED';
type SortMode = 'RECENT' | 'NAME';
type ViewMode = 'CARD' | 'LIST';

export function MyEnrollmentsPage() {
  const [items, setItems] = useState<EnrollmentView[]>([]);
  const [filter, setFilter] = useState<Filter>('ALL');
  const [sortMode, setSortMode] = useState<SortMode>('RECENT');
  const [viewMode, setViewMode] = useState<ViewMode>('CARD');
  const [pageSize, setPageSize] = useState<number>(12);
  const [page, setPage] = useState<number>(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    enrollmentApi
      .listMine(controller.signal)
      .then((res) => {
        setItems(res);
        setLoading(false);
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : 'Không tải được danh sách lớp.');
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = items.filter((item) => {
      if (q) {
        const hay =
          `${item.classOffering.name} ${item.classOffering.code} ${item.classOffering.course.title} ${learnerClassLabel(item.classOffering.name, item.classOffering.code)} ${learnerCourseLabel(item.classOffering.course.title)}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (filter === 'ACTIVE') {
        return item.status === 'ACTIVE';
      }
      if (filter === 'COMPLETED') {
        return item.status === 'COMPLETED' || item.classOffering.status === 'COMPLETED';
      }
      if (filter === 'PENDING_PAYMENT') {
        return item.status === 'PENDING_PAYMENT';
      }
      if (filter === 'CANCELLED') {
        return item.status === 'CANCELLED' || item.status === 'DROPPED';
      }
      return true;
    });

    if (sortMode === 'NAME') {
      return [...list].sort((a, b) =>
        learnerClassLabel(a.classOffering.name, a.classOffering.code).localeCompare(
          learnerClassLabel(b.classOffering.name, b.classOffering.code),
          'vi',
        ),
      );
    }
    return list;
  }, [items, filter, search, sortMode]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageItems = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-[#e66f2b]">Lớp đang theo học</h1>

      {error && (
        <p
          role="alert"
          className="rounded border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
        >
          {error}
        </p>
      )}

      <section className="rounded border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-5 py-3">
          <h2 className="text-[15px] font-semibold text-[#e66f2b]">Tổng quan về khóa học</h2>
        </div>

        {/* Single compact IUH filter / search / sort / view toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 px-5 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Lọc trạng thái lớp học"
              value={filter}
              onChange={(e) => {
                setFilter(e.target.value as Filter);
                setPage(1);
              }}
              className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 focus:border-[#76a35e] focus:outline-none"
            >
              <option value="ALL">Tất cả ({items.length})</option>
              <option value="ACTIVE">Đang học</option>
              <option value="COMPLETED">Hoàn thành</option>
              <option value="PENDING_PAYMENT">Chờ thanh toán</option>
              <option value="CANCELLED">Đã hủy</option>
            </select>

            <div className="relative">
              <Search
                size={15}
                className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
              <input
                type="search"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Tìm kiếm lớp học..."
                className="w-56 rounded border border-slate-300 bg-white py-1.5 pr-3 pl-8 text-sm text-slate-800 placeholder:text-slate-400 focus:border-[#76a35e] focus:outline-none"
              />
            </div>

            <select
              aria-label="Sắp xếp lớp học"
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as SortMode)}
              className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 focus:border-[#76a35e] focus:outline-none"
            >
              <option value="RECENT">Truy cập gần nhất</option>
              <option value="NAME">Tên lớp (A–Z)</option>
            </select>

            <select
              aria-label="Kiểu hiển thị"
              value={viewMode}
              onChange={(e) => setViewMode(e.target.value as ViewMode)}
              className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 focus:border-[#76a35e] focus:outline-none"
            >
              <option value="CARD">Thẻ (Card)</option>
              <option value="LIST">Danh sách (List)</option>
            </select>
          </div>

          <span className="text-xs text-slate-500">
            Hiển thị {pageItems.length} / {filtered.length} lớp
          </span>
        </div>

        {loading ? (
          <div className="grid gap-4 px-5 pb-5 md:grid-cols-2 lg:grid-cols-3" role="status">
            {[1, 2, 3].map((k) => (
              <div
                key={k}
                className="h-56 animate-pulse rounded border border-slate-200 bg-slate-50"
              />
            ))}
          </div>
        ) : pageItems.length === 0 ? (
          <div className="mx-5 mb-5 rounded border border-slate-200 bg-[#f8f9fa] p-8 text-center">
            <p className="text-sm font-semibold text-slate-800">
              {items.length === 0
                ? 'Bạn chưa ghi danh lớp học nào.'
                : 'Không tìm thấy lớp phù hợp với điều kiện lọc.'}
            </p>
            {items.length === 0 && (
              <Link
                to="/courses"
                className="mt-4 inline-flex rounded bg-[#76a35e] px-4 py-2 text-sm font-semibold text-white hover:bg-[#658f50]"
              >
                Xem các khóa học hiện có
              </Link>
            )}
          </div>
        ) : viewMode === 'CARD' ? (
          <div className="grid gap-4 px-5 pb-4 md:grid-cols-2 lg:grid-cols-3">
            {pageItems.map((item, idx) => (
              <IuhClassCard key={item.id} enrollment={item} variantIndex={idx} />
            ))}
          </div>
        ) : (
          <div className="divide-y divide-slate-200 border-t border-slate-200 px-5">
            {pageItems.map((item, idx) => (
              <IuhClassListRow key={item.id} enrollment={item} variantIndex={idx} />
            ))}
          </div>
        )}

        {/* Bottom Pagination matching IUH "Hiển thị 12 ▾ | < >" */}
        {!loading && filtered.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-3 text-xs text-slate-600">
            <label className="flex items-center gap-2">
              <span>Hiển thị:</span>
              <select
                aria-label="Số lớp mỗi trang"
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700"
              >
                <option value={6}>6</option>
                <option value={12}>12</option>
                <option value={24}>24</option>
              </select>
            </label>

            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label="Trang trước"
                disabled={safePage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="inline-flex size-7 items-center justify-center rounded border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40"
              >
                <ChevronLeft size={14} />
              </button>
              <span className="px-2 font-medium text-slate-700">
                {safePage} / {totalPages}
              </span>
              <button
                type="button"
                aria-label="Trang sau"
                disabled={safePage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="inline-flex size-7 items-center justify-center rounded border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function IuhClassCard({
  enrollment,
  variantIndex,
}: {
  enrollment: EnrollmentView;
  variantIndex: number;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const c = enrollment.classOffering;
  const active = enrollment.status === 'ACTIVE' || enrollment.status === 'COMPLETED';
  const classTitle = learnerClassLabel(c.name, c.code, c.course.title);
  const courseTitle = learnerCourseLabel(c.course.title);
  const instructor = c.instructor ? accountLabel(c.instructor.fullName) : 'Đang cập nhật';

  return (
    <article className="relative flex flex-col overflow-hidden rounded-lg border border-slate-200 bg-white transition hover:border-slate-300 hover:shadow-xs">
      <IuhCourseCardBanner variantIndex={variantIndex} locked={!active} />

      <div className="flex flex-1 flex-col justify-between p-4">
        <div>
          <div className="flex items-start justify-between gap-2">
            {active ? (
              <Link
                to={`/classroom/${c.id}`}
                className="flex items-start gap-1.5 text-[14px] font-semibold leading-snug text-[#e66f2b] hover:underline"
              >
                <Star
                  size={13}
                  className="mt-1 shrink-0 fill-[#2b7de9] text-[#2b7de9]"
                  aria-hidden="true"
                />
                <span className="line-clamp-2">{classTitle}</span>
              </Link>
            ) : (
              <span className="text-[14px] font-semibold leading-snug text-slate-700 line-clamp-2">
                {classTitle}
              </span>
            )}
            <StatusBadge status={enrollment.status} />
          </div>

          <p className="mt-1.5 line-clamp-1 text-xs font-medium text-slate-600">{courseTitle}</p>
          <div className="mt-2.5 space-y-1 text-[12px] text-slate-500">
            <p className="flex items-center gap-1.5">
              <CalendarDays size={13} className="shrink-0 text-slate-400" aria-hidden="true" />
              <span className="truncate">{schedule(enrollment)}</span>
            </p>
            <p className="flex items-center gap-1.5">
              <UserRound size={13} className="shrink-0 text-slate-400" aria-hidden="true" />
              <span className="truncate">Giảng viên: {instructor}</span>
            </p>
          </div>
        </div>

        <div className="relative mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5 text-xs">
          {active ? (
            <>
              <span className="text-slate-600">
                {enrollment.progress.progressPercent}% hoàn thành ({enrollment.progress.completedLessons}/
                {enrollment.progress.totalLessons} bài)
              </span>
              <button
                type="button"
                aria-label={`Tùy chọn cho ${classTitle}`}
                onClick={() => setMenuOpen((v) => !v)}
                className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
              >
                <MoreVertical size={15} aria-hidden="true" />
              </button>
              {menuOpen && (
                <div className="absolute right-0 bottom-full z-20 mb-1 w-44 rounded border border-slate-200 bg-white py-1 text-xs shadow-lg">
                  <Link
                    to={`/classroom/${c.id}`}
                    className="block px-3 py-1.5 font-semibold text-slate-800 hover:bg-slate-50 hover:text-[#e66f2b]"
                  >
                    Vào học ngay
                  </Link>
                  <Link
                    to={`/classroom/${c.id}/gradebook`}
                    className="block px-3 py-1.5 text-slate-700 hover:bg-slate-50 hover:text-[#e66f2b]"
                  >
                    Xem bảng điểm
                  </Link>
                  <Link
                    to={`/classroom/${c.id}/progress`}
                    className="block px-3 py-1.5 text-slate-700 hover:bg-slate-50 hover:text-[#e66f2b]"
                  >
                    Tiến độ & Phân tích
                  </Link>
                  <Link
                    to="/student/bookings"
                    className="block px-3 py-1.5 text-slate-700 hover:bg-slate-50 hover:text-[#e66f2b]"
                  >
                    Tư vấn 1:1 giảng viên
                  </Link>
                  <Link
                    to="/my/progress"
                    className="block px-3 py-1.5 text-slate-700 hover:bg-slate-50 hover:text-[#e66f2b]"
                  >
                    Tiến độ &amp; Chứng chỉ
                  </Link>
                  <Link
                    to="/my/calendar"
                    className="block px-3 py-1.5 text-slate-700 hover:bg-slate-50 hover:text-[#e66f2b]"
                  >
                    Bảng điều khiển
                  </Link>
                </div>
              )}
            </>
          ) : enrollment.status === 'PENDING_PAYMENT' ? (
            <Link
              to={`/student/finance?enrollmentId=${encodeURIComponent(enrollment.id)}`}
              className="inline-flex items-center gap-1.5 font-semibold text-[#e66f2b] hover:underline"
            >
              <CreditCard size={13} aria-hidden="true" />
              Thanh toán học phí để mở lớp
            </Link>
          ) : (
            <span className="text-slate-500">Hồ sơ lớp học đã lưu trữ</span>
          )}
        </div>
      </div>
    </article>
  );
}

function IuhClassListRow({
  enrollment,
  variantIndex,
}: {
  enrollment: EnrollmentView;
  variantIndex: number;
}) {
  const c = enrollment.classOffering;
  const active = enrollment.status === 'ACTIVE' || enrollment.status === 'COMPLETED';
  const classTitle = learnerClassLabel(c.name, c.code, c.course.title);
  const courseTitle = learnerCourseLabel(c.course.title);
  const instructor = c.instructor ? accountLabel(c.instructor.fullName) : 'Đang cập nhật';

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <div className="size-10 shrink-0 overflow-hidden rounded border border-slate-200">
          <IuhCourseCardBanner variantIndex={variantIndex} locked={!active} />
        </div>
        <div className="min-w-0">
          {active ? (
            <Link
              to={`/classroom/${c.id}`}
              className="block truncate text-sm font-semibold text-[#e66f2b] hover:underline"
            >
              {classTitle}
            </Link>
          ) : (
            <p className="truncate text-sm font-semibold text-slate-700">{classTitle}</p>
          )}
          <p className="truncate text-xs text-slate-500">
            {courseTitle} · {schedule(enrollment)} · GV: {instructor}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3 text-xs">
        <StatusBadge status={enrollment.status} />
        {active ? (
          <span className="font-medium text-slate-600">{enrollment.progress.progressPercent}%</span>
        ) : enrollment.status === 'PENDING_PAYMENT' ? (
          <Link
            to={`/student/finance?enrollmentId=${encodeURIComponent(enrollment.id)}`}
            className="font-semibold text-[#e66f2b] hover:underline"
          >
            Thanh toán
          </Link>
        ) : (
          <span className="text-slate-400">Đã lưu trữ</span>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: EnrollmentStatus }) {
  const label: Record<EnrollmentStatus, string> = {
    ACTIVE: 'Đang học',
    PENDING_PAYMENT: 'Chờ thanh toán',
    CANCELLED: 'Đã hủy',
    COMPLETED: 'Hoàn thành',
  };
  const cls =
    status === 'ACTIVE'
      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
      : status === 'COMPLETED'
        ? 'bg-[#e7f3e4] text-[#2f6627] border-[#b7d6af]'
        : status === 'PENDING_PAYMENT'
          ? 'bg-amber-50 text-amber-800 border-amber-200'
          : 'bg-slate-100 text-slate-600 border-slate-200';
  return (
    <span className={`shrink-0 rounded border px-2 py-0.5 text-[11px] font-semibold ${cls}`}>
      {label[status]}
    </span>
  );
}

function schedule(enrollment: EnrollmentView) {
  const slots = enrollment.classOffering.scheduleSlots;
  if (!slots.length) return 'Lịch học đang cập nhật';
  const days: Record<number, string> = {
    1: 'T2',
    2: 'T3',
    3: 'T4',
    4: 'T5',
    5: 'T6',
    6: 'T7',
    7: 'CN',
  };
  const first = slots[0];
  return `${slots.map((slot) => days[slot.dayOfWeek] ?? `Ngày ${slot.dayOfWeek}`).join('/')} ${new Date(first.startTime).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })}`;
}
