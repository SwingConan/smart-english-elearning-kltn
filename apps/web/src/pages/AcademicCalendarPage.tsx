import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router';
import { useAuth } from '@/features/auth/auth-context';
import {
  Calendar,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  Filter,
  List,
  MapPin,
  Search,
  UserRound,
  X,
} from 'lucide-react';
import {
  academicState,
  planningApi,
  schoolDate,
  type Session,
} from '@/features/academic/planning-api';
import {
  WEEKDAY_SHORT_MONDAY_FIRST,
  formatFullVnDate,
  formatVnDate,
  formatVnMonthLabel,
  monthGridCells,
  pickInitialWeekMonday,
  shiftDateKey,
  shiftMonthKey,
  timeToBand,
  vnDateKey,
  vnHourMinute,
  vnTimeOnly,
  vnTodayKey,
  weekDateKeys,
  weekMondayKey,
} from '@/features/academic/calendar-utils';
import {
  WeeklyTimetableGrid,
  type GridTone,
  type TimetableGridItem,
} from '@/features/academic/WeeklyTimetableGrid';
import { accountLabel, classLabel } from '@/features/catalog/record-presentation';
import { classCodeLabel } from '@/features/demo/presentation';
import { SourceRecord } from '@/features/catalog/SourceRecord';

const STATE_BADGE: Record<string, string> = {
  PUBLISHED: 'border-[#76a35e]/40 bg-[#e9f2e4] text-[#2f5d1e]',
  PENDING_APPROVAL: 'border-amber-300 bg-amber-50 text-amber-800',
  DRAFT: 'border-slate-300 bg-slate-100 text-slate-700',
  CANCELLED: 'border-red-200 bg-red-50 text-red-700',
  SUPERSEDED: 'border-slate-300 bg-slate-100 text-slate-500',
};

const STATE_TONE: Record<string, GridTone> = {
  PUBLISHED: 'green',
  PENDING_APPROVAL: 'amber',
  DRAFT: 'neutral',
  CANCELLED: 'rose',
  SUPERSEDED: 'neutral',
};

export function AcademicCalendarPage() {
  const { user } = useAuth();
  if (user?.role === 'STUDENT') return <Navigate to="/my/calendar?view=day" replace />;
  return <CalendarResults />;
}

function classDetailHref(role: string | undefined, classId: string | undefined): string {
  const safeId = classId ?? '';
  if (role === 'INSTRUCTOR') return `/classroom/${safeId}`;
  if (role === 'ACADEMIC_MANAGER') return `/academic/classes/${safeId}`;
  return `/workspace/classes/${safeId}`;
}

function CalendarResults() {
  const { user } = useAuth();
  const todayKey = useMemo(() => vnTodayKey(), []);
  const [rows, setRows] = useState<Session[]>();
  const [error, setError] = useState('');
  const [total, setTotal] = useState(0);

  // Filters
  const [query, setQuery] = useState('');
  const [classId, setClassId] = useState('ALL');
  const [instructorId, setInstructorId] = useState('ALL');
  const [roomId, setRoomId] = useState('ALL');
  const [stateFilter, setStateFilter] = useState('ALL');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [viewMode, setViewMode] = useState<'week' | 'month' | 'list'>('week');
  const [weekMonday, setWeekMonday] = useState(() => weekMondayKey(todayKey));
  const [monthKey, setMonthKey] = useState(() => todayKey.slice(0, 7));
  const [page, setPage] = useState(1);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);
  const perPage = 25;

  useEffect(() => {
    let live = true;
    async function loadAll() {
      try {
        const first = await planningApi.get<{ data: Session[]; meta: { total: number } }>(
          'calendar?page=1&limit=100',
        );
        let collected = [...(first.data ?? [])];
        const totalCount = first.meta?.total ?? collected.length;
        if (totalCount > collected.length && collected.length > 0) {
          const pages = Math.min(5, Math.ceil(totalCount / 100));
          const rest = await Promise.all(
            Array.from({ length: pages - 1 }, (_, i) =>
              planningApi.get<{ data: Session[]; meta: { total: number } }>(
                `calendar?page=${i + 2}&limit=100`,
              ),
            ),
          );
          for (const res of rest) {
            collected = collected.concat(res.data ?? []);
          }
        }
        if (live) {
          setRows(collected);
          setTotal(totalCount);
          const initialMonday = pickInitialWeekMonday(
            collected.map((s) => vnDateKey(s.startsAt)),
            todayKey,
          );
          setWeekMonday(initialMonday);
          setMonthKey(initialMonday.slice(0, 7));
        }
      } catch {
        if (live) setError('Không tải được lịch trong phạm vi của bạn.');
      }
    }
    void loadAll();
    return () => {
      live = false;
    };
  }, [todayKey]);

  const classOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of rows ?? []) {
      const cid = s.classOfferingId ?? s.classOffering?.id;
      if (cid) {
        map.set(
          cid,
          `${classCodeLabel(s.classOffering.code)} · ${classLabel(s.classOffering.name)}`,
        );
      }
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], 'vi'));
  }, [rows]);

  const instructorOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of rows ?? []) {
      if (s.instructor) map.set(s.instructor.id, accountLabel(s.instructor.fullName));
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], 'vi'));
  }, [rows]);

  const roomOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of rows ?? []) {
      if (s.room) map.set(s.room.id, `${s.room.code} · ${s.room.name}`);
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], 'vi'));
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (rows ?? []).filter((s) => {
      if (classId !== 'ALL' && s.classOfferingId !== classId) return false;
      if (instructorId === '__NONE__' && s.instructor) return false;
      if (instructorId !== 'ALL' && instructorId !== '__NONE__' && s.instructor?.id !== instructorId) {
        return false;
      }
      if (roomId === '__NONE__' && s.room) return false;
      if (roomId !== 'ALL' && roomId !== '__NONE__' && s.room?.id !== roomId) return false;
      if (stateFilter !== 'ALL' && s.state !== stateFilter) return false;
      const dKey = vnDateKey(s.startsAt);
      if (dateFrom && dKey < dateFrom) return false;
      if (dateTo && dKey > dateTo) return false;
      if (q) {
        const hay = [
          s.classOffering.code,
          s.classOffering.name,
          s.instructor?.fullName ?? '',
          s.room?.code ?? '',
          s.room?.name ?? '',
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, classId, instructorId, roomId, stateFilter, dateFrom, dateTo, query]);

  const summary = useMemo(() => {
    let published = 0;
    let pending = 0;
    let draft = 0;
    let closed = 0;
    for (const s of filtered) {
      if (s.state === 'PUBLISHED') published += 1;
      else if (s.state === 'PENDING_APPROVAL') pending += 1;
      else if (s.state === 'DRAFT') draft += 1;
      else closed += 1;
    }
    return { published, pending, draft, closed };
  }, [filtered]);

  const sessionsByDate = useMemo(() => {
    const map = new Map<string, Session[]>();
    for (const s of filtered) {
      const k = vnDateKey(s.startsAt);
      const bucket = map.get(k) ?? [];
      bucket.push(s);
      map.set(k, bucket);
    }
    for (const bucket of map.values()) {
      bucket.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    }
    return map;
  }, [filtered]);

  const weekDays = useMemo(() => weekDateKeys(weekMonday), [weekMonday]);
  const weekItems: TimetableGridItem[] = useMemo(() => {
    const out: TimetableGridItem[] = [];
    weekDays.forEach((dayKey, dayIndex) => {
      const list = sessionsByDate.get(dayKey) ?? [];
      for (const s of list) {
        const hm = vnHourMinute(s.startsAt);
        out.push({
          id: s.id,
          dayIndex,
          band: timeToBand(hm),
          sortKey: s.startsAt,
          timeLabel: `${vnTimeOnly(s.startsAt)}–${vnTimeOnly(s.endsAt)}`,
          title: classCodeLabel(s.classOffering.code),
          subtitle: s.instructor ? accountLabel(s.instructor.fullName) : 'Chưa phân công GV',
          meta: s.room ? `Phòng ${s.room.code}` : 'Trực tuyến',
          badgeLabel: academicState(s.state),
          tone: STATE_TONE[s.state] ?? 'neutral',
          onClick: () => setSelectedSession(s),
        });
      }
    });
    return out;
  }, [weekDays, sessionsByDate]);

  const monthCells = useMemo(() => monthGridCells(monthKey), [monthKey]);
  const monthSessionCount = useMemo(
    () => filtered.filter((s) => vnDateKey(s.startsAt).startsWith(monthKey)).length,
    [filtered, monthKey],
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const currentPage = Math.min(page, totalPages);
  const pageRows = useMemo(() => {
    const start = (currentPage - 1) * perPage;
    return filtered.slice(start, start + perPage);
  }, [filtered, currentPage]);

  function resetFilters() {
    setQuery('');
    setClassId('ALL');
    setInstructorId('ALL');
    setRoomId('ALL');
    setStateFilter('ALL');
    setDateFrom('');
    setDateTo('');
    setPage(1);
  }

  function jumpToNearestFilteredWeek() {
    if (!filtered.length) return;
    const targetMonday = pickInitialWeekMonday(
      filtered.map((s) => vnDateKey(s.startsAt)),
      todayKey,
    );
    setWeekMonday(targetMonday);
    setMonthKey(targetMonday.slice(0, 7));
  }

  const weekEnd = weekDays[6] ?? shiftDateKey(weekMonday, 6);

  return (
    <div className="space-y-5">
      {/* Header */}
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-xs">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1.5">
            <span className="inline-flex items-center gap-1.5 rounded bg-[#e9f2e4] px-2.5 py-0.5 text-xs font-semibold text-[#2f5d1e]">
              <Calendar size={13} aria-hidden="true" />
              Lịch học &amp; Giảng dạy toàn trung tâm (GMT+7)
            </span>
            <h1 className="text-2xl font-bold text-[#e66f2b] sm:text-3xl">
              Lịch học &amp; Giảng dạy
            </h1>
            <p className="max-w-3xl text-sm text-slate-600">
              Theo dõi thời khóa biểu tuần và lịch tháng toàn trung tâm theo lớp học, giảng viên,
              phòng học và trạng thái phê duyệt. Bấm vào buổi học để xem chi tiết.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-center">
              <p className="text-[11px] font-semibold text-slate-500">Khớp bộ lọc</p>
              <p className="text-lg font-bold text-slate-900">
                {filtered.length}/{total}
              </p>
            </div>
            <div className="rounded border border-[#76a35e]/30 bg-[#e9f2e4]/70 px-3 py-2 text-center">
              <p className="text-[11px] font-semibold text-[#2f5d1e]">Đã duyệt</p>
              <p className="text-lg font-bold text-[#2f5d1e]">{summary.published}</p>
            </div>
            <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-center">
              <p className="text-[11px] font-semibold text-amber-800">Chờ duyệt</p>
              <p className="text-lg font-bold text-amber-900">{summary.pending}</p>
            </div>
            <div className="rounded border border-slate-200 bg-white px-3 py-2 text-center">
              <p className="text-[11px] font-semibold text-slate-500">Nháp</p>
              <p className="text-lg font-bold text-slate-700">{summary.draft}</p>
            </div>
            {summary.closed > 0 && (
              <div className="rounded border border-slate-200 bg-slate-100/70 px-3 py-2 text-center">
                <p className="text-[11px] font-semibold text-slate-500">Thay thế / Hủy</p>
                <p className="text-lg font-bold text-slate-700">{summary.closed}</p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Filter Bar */}
      <section aria-label="Bộ lọc lịch trung tâm" className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
            <Filter size={15} className="text-[#76a35e]" aria-hidden="true" />
            <span>Bộ lọc thời khóa biểu</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div
              role="group"
              aria-label="Chế độ xem lịch"
              className="inline-flex overflow-hidden rounded border border-slate-300 text-xs font-semibold"
            >
              <button
                type="button"
                aria-pressed={viewMode === 'week'}
                onClick={() => setViewMode('week')}
                className={`inline-flex items-center gap-1 px-2.5 py-1.5 ${
                  viewMode === 'week' ? 'bg-[#76a35e] text-white' : 'bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Calendar size={13} aria-hidden="true" />
                Lịch tuần
              </button>
              <button
                type="button"
                aria-pressed={viewMode === 'month'}
                onClick={() => setViewMode('month')}
                className={`inline-flex items-center gap-1 border-l border-slate-300 px-2.5 py-1.5 ${
                  viewMode === 'month' ? 'bg-[#76a35e] text-white' : 'bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <CalendarDays size={13} aria-hidden="true" />
                Lịch tháng
              </button>
              <button
                type="button"
                aria-pressed={viewMode === 'list'}
                onClick={() => setViewMode('list')}
                className={`inline-flex items-center gap-1 border-l border-slate-300 px-2.5 py-1.5 ${
                  viewMode === 'list' ? 'bg-[#76a35e] text-white' : 'bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <List size={13} aria-hidden="true" />
                Danh sách
              </button>
            </div>
            <button
              type="button"
              onClick={resetFilters}
              className="rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Đặt lại bộ lọc
            </button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <label className="grid gap-1 text-xs font-semibold text-slate-700 lg:col-span-2">
            Tìm nhanh (mã lớp, GV, phòng)
            <span className="relative flex items-center">
              <Search size={14} className="pointer-events-none absolute left-2.5 text-slate-400" />
              <input
                type="search"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
                placeholder="VD: TOEIC, SE-R301, Minh..."
                className="w-full rounded border border-slate-300 bg-white py-1.5 pl-8 pr-2.5 text-xs font-normal text-slate-900"
              />
            </span>
          </label>

          <label className="grid gap-1 text-xs font-semibold text-slate-700">
            Lớp học
            <select
              value={classId}
              onChange={(e) => {
                setClassId(e.target.value);
                setPage(1);
              }}
              className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-normal text-slate-900"
            >
              <option value="ALL">Tất cả lớp có lịch ({classOptions.length})</option>
              {classOptions.map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1 text-xs font-semibold text-slate-700">
            Giảng viên
            <select
              value={instructorId}
              onChange={(e) => {
                setInstructorId(e.target.value);
                setPage(1);
              }}
              className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-normal text-slate-900"
            >
              <option value="ALL">Tất cả giảng viên</option>
              <option value="__NONE__">Chưa phân công giảng viên</option>
              {instructorOptions.map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1 text-xs font-semibold text-slate-700">
            Phòng học
            <select
              value={roomId}
              onChange={(e) => {
                setRoomId(e.target.value);
                setPage(1);
              }}
              className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-normal text-slate-900"
            >
              <option value="ALL">Tất cả phòng / trực tuyến</option>
              <option value="__NONE__">Trực tuyến / Chưa gắn phòng</option>
              {roomOptions.map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1 text-xs font-semibold text-slate-700">
            Trạng thái buổi
            <select
              value={stateFilter}
              onChange={(e) => {
                setStateFilter(e.target.value);
                setPage(1);
              }}
              className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-normal text-slate-900"
            >
              <option value="ALL">Tất cả trạng thái</option>
              <option value="PUBLISHED">Đã duyệt</option>
              <option value="PENDING_APPROVAL">Chờ học vụ độc lập duyệt</option>
              <option value="DRAFT">Nháp</option>
              <option value="CANCELLED">Đã hủy</option>
            </select>
          </label>
        </div>

        <div className="mt-3 flex flex-wrap items-end gap-3 border-t border-slate-100 pt-3">
          <label className="grid gap-1 text-xs font-semibold text-slate-700">
            Từ ngày
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value);
                setPage(1);
              }}
              className="rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-normal text-slate-900"
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-slate-700">
            Đến ngày
            <input
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value);
                setPage(1);
              }}
              className="rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-normal text-slate-900"
            />
          </label>
          <button
            type="button"
            onClick={() => {
              setStateFilter('PUBLISHED');
              setPage(1);
            }}
            className="rounded border border-[#76a35e]/40 bg-[#e9f2e4] px-3 py-1.5 text-xs font-semibold text-[#2f5d1e] hover:bg-[#dcebd4]"
          >
            Chỉ xem buổi đã duyệt ({rows?.filter((s) => s.state === 'PUBLISHED').length ?? 0})
          </button>
        </div>
      </section>

      {error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {error}
        </p>
      )}
      {!rows && !error && (
        <p role="status" className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          Đang tải lịch…
        </p>
      )}
      {rows && filtered.length === 0 && (
        <p className="rounded-lg border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-600">
          Không có buổi học nào khớp bộ lọc hiện tại.
        </p>
      )}

      {/* Weekly Calendar View */}
      {rows && filtered.length > 0 && viewMode === 'week' && (
        <section className="space-y-3" aria-label="Thời khóa biểu tuần">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3">
            <div>
              <h2 className="text-base font-bold text-[#2f5d1e]">
                Tuần {formatVnDate(weekMonday)} – {formatVnDate(weekEnd)}
              </h2>
              <p className="text-xs text-slate-500">
                {weekItems.length} buổi học trong tuần này (hiển thị theo 3 khung ca Sáng / Chiều / Tối).
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {weekItems.length === 0 && (
                <button
                  type="button"
                  onClick={jumpToNearestFilteredWeek}
                  className="rounded border border-[#e66f2b]/40 bg-orange-50 px-3 py-1.5 text-xs font-semibold text-[#c25315] hover:bg-orange-100"
                >
                  Tới tuần gần nhất có lịch
                </button>
              )}
              <button
                type="button"
                onClick={() => setWeekMonday((m) => shiftDateKey(m, -7))}
                className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                <ChevronLeft size={14} aria-hidden="true" />
                Tuần trước
              </button>
              <button
                type="button"
                onClick={() => setWeekMonday(weekMondayKey(todayKey))}
                className="rounded border border-[#76a35e]/50 bg-[#e9f2e4] px-3 py-1.5 text-xs font-semibold text-[#2f5d1e] hover:bg-[#dcebd4]"
              >
                Tuần này
              </button>
              <button
                type="button"
                onClick={() => setWeekMonday((m) => shiftDateKey(m, 7))}
                className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Tuần sau
                <ChevronRight size={14} aria-hidden="true" />
              </button>
            </div>
          </div>

          <WeeklyTimetableGrid
            weekDates={weekDays}
            todayKey={todayKey}
            items={weekItems}
            ariaLabel="Thời khóa biểu tuần toàn trung tâm"
          />
        </section>
      )}

      {/* Monthly Calendar View */}
      {rows && filtered.length > 0 && viewMode === 'month' && (
        <section className="space-y-3" aria-label="Lịch tháng">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3">
            <div>
              <h2 className="text-base font-bold capitalize text-[#2f5d1e]">
                {formatVnMonthLabel(monthKey)}
              </h2>
              <p className="text-xs text-slate-500">
                {monthSessionCount} buổi học trong tháng này. Bấm vào một ngày để xem chi tiết từng buổi.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {monthSessionCount === 0 && (
                <button
                  type="button"
                  onClick={jumpToNearestFilteredWeek}
                  className="rounded border border-[#e66f2b]/40 bg-orange-50 px-3 py-1.5 text-xs font-semibold text-[#c25315] hover:bg-orange-100"
                >
                  Tới tháng gần nhất có lịch
                </button>
              )}
              <button
                type="button"
                onClick={() => setMonthKey((m) => shiftMonthKey(m, -1))}
                className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                <ChevronLeft size={14} aria-hidden="true" />
                Tháng trước
              </button>
              <button
                type="button"
                onClick={() => setMonthKey(todayKey.slice(0, 7))}
                className="rounded border border-[#76a35e]/50 bg-[#e9f2e4] px-3 py-1.5 text-xs font-semibold text-[#2f5d1e] hover:bg-[#dcebd4]"
              >
                Tháng này
              </button>
              <button
                type="button"
                onClick={() => setMonthKey((m) => shiftMonthKey(m, 1))}
                className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Tháng sau
                <ChevronRight size={14} aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <div role="table" aria-label={'Lịch tháng ' + monthKey} className="min-w-[760px]">
              <div role="row" className="grid grid-cols-7 border-b border-slate-200 bg-[#f7faf5]">
                {WEEKDAY_SHORT_MONDAY_FIRST.map((wd) => (
                  <div
                    role="columnheader"
                    key={wd}
                    className="border-r border-slate-200 py-2.5 text-center text-xs font-bold uppercase tracking-wide text-slate-700 last:border-r-0"
                  >
                    {wd}
                  </div>
                ))}
              </div>
              {Array.from({ length: monthCells.length / 7 }, (_, weekIdx) => (
                <div
                  role="row"
                  key={weekIdx}
                  className="grid grid-cols-7 border-b border-slate-200 last:border-b-0"
                >
                  {monthCells.slice(weekIdx * 7, weekIdx * 7 + 7).map((dayKey, cellIdx) => {
                    const daySessions = dayKey ? sessionsByDate.get(dayKey) ?? [] : [];
                    const isToday = dayKey === todayKey;
                    const visible = daySessions.slice(0, 3);
                    const overflow = daySessions.length - visible.length;

                    return (
                      <div
                        role="cell"
                        key={dayKey ?? `blank-${weekIdx}-${cellIdx}`}
                        onClick={() => {
                          if (dayKey && daySessions.length > 0) setSelectedDayKey(dayKey);
                        }}
                        className={`min-h-[112px] border-r border-slate-200 p-2 last:border-r-0 ${
                          !dayKey
                            ? 'bg-slate-50/50'
                            : isToday
                              ? 'bg-[#f4f9f1]'
                              : daySessions.length > 0
                                ? 'cursor-pointer bg-white hover:bg-slate-50/80'
                                : 'bg-white'
                        }`}
                      >
                        {dayKey && (
                          <>
                            <div className="mb-1.5 flex items-center justify-between">
                              <span
                                className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                                  isToday ? 'bg-[#2f5d1e] text-white' : 'text-slate-700'
                                }`}
                              >
                                {Number(dayKey.slice(8))}
                              </span>
                              {daySessions.length > 0 && (
                                <span className="text-[11px] font-semibold text-[#2f5d1e]">
                                  {daySessions.length} buổi
                                </span>
                              )}
                            </div>
                            <div className="space-y-1">
                              {visible.map((s) => (
                                <button
                                  key={s.id}
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedSession(s);
                                  }}
                                  className={`block w-full truncate rounded border px-1.5 py-0.5 text-left text-[11px] font-semibold ${
                                    STATE_BADGE[s.state] ?? 'border-slate-200 bg-slate-100 text-slate-700'
                                  }`}
                                >
                                  {vnTimeOnly(s.startsAt)} {classCodeLabel(s.classOffering.code)}
                                </button>
                              ))}
                              {overflow > 0 && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedDayKey(dayKey);
                                  }}
                                  className="w-full rounded bg-slate-100 px-1.5 py-0.5 text-left text-[11px] font-semibold text-slate-700 hover:bg-slate-200"
                                >
                                  +{overflow} buổi khác
                                </button>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Compact Table List View */}
      {rows && filtered.length > 0 && viewMode === 'list' && (
        <>
          <div className="data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Thời gian (GMT+7)</th>
                  <th>Lớp học</th>
                  <th>Giảng viên</th>
                  <th>Phòng / Hình thức</th>
                  <th>Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((s) => (
                  <tr key={s.id}>
                    <td className="whitespace-nowrap text-xs">
                      <div className="font-semibold text-slate-900">
                        {formatVnDate(vnDateKey(s.startsAt))}
                      </div>
                      <div className="text-slate-600">
                        {vnTimeOnly(s.startsAt)} – {vnTimeOnly(s.endsAt)}
                      </div>
                    </td>
                    <td>
                      <Link
                        to={classDetailHref(user?.role, s.classOfferingId ?? s.classOffering?.id)}
                        className="font-semibold text-slate-900 hover:text-[#e66f2b] hover:underline"
                      >
                        {classCodeLabel(s.classOffering.code)} · {classLabel(s.classOffering.name)}
                      </Link>
                    </td>
                    <td className="text-xs text-slate-700">
                      {s.instructor ? accountLabel(s.instructor.fullName) : 'Chưa phân công GV'}
                    </td>
                    <td className="text-xs text-slate-700">
                      {s.room ? `${s.room.code} · ${s.room.name}` : 'Trực tuyến / Chưa gắn phòng'}
                    </td>
                    <td>
                      <span
                        className={`rounded border px-2 py-0.5 text-xs font-semibold ${
                          STATE_BADGE[s.state] ?? 'border-slate-200 bg-slate-100 text-slate-700'
                        }`}
                      >
                        {academicState(s.state)}
                        {s.revision > 1 ? ` · Bản ${s.revision}` : ''}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <nav
            aria-label="Phân trang lịch"
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm"
          >
            <span className="text-slate-600">
              Hiển thị {pageRows.length} / {filtered.length} buổi (Trang {currentPage}/{totalPages})
            </span>
            <div className="flex gap-2">
              <button
                className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                disabled={currentPage <= 1}
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Trang trước
              </button>
              <button
                className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                disabled={currentPage >= totalPages}
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Trang sau
              </button>
            </div>
          </nav>
        </>
      )}

      {/* Day Agenda Modal (when clicking a month cell) */}
      {selectedDayKey && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`Lịch ngày ${formatVnDate(selectedDayKey)}`}
          onClick={() => setSelectedDayKey(null)}
        >
          <div
            className="max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-xl border border-slate-200 bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <p className="text-xs font-semibold text-[#2f5d1e]">Lịch trong ngày</p>
                <h3 className="text-lg font-bold capitalize text-slate-900">
                  {formatFullVnDate(selectedDayKey)}
                </h3>
              </div>
              <button
                type="button"
                aria-label="Đóng"
                onClick={() => setSelectedDayKey(null)}
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
              >
                <X size={18} />
              </button>
            </div>
            <ul className="mt-4 space-y-2.5">
              {(sessionsByDate.get(selectedDayKey) ?? []).map((s) => (
                <li
                  key={s.id}
                  className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 text-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1 font-bold text-slate-900">
                      <Clock size={14} className="text-[#76a35e]" aria-hidden="true" />
                      {vnTimeOnly(s.startsAt)} – {vnTimeOnly(s.endsAt)}
                    </span>
                    <span
                      className={`rounded border px-2 py-0.5 text-xs font-semibold ${
                        STATE_BADGE[s.state] ?? 'border-slate-200 bg-slate-100 text-slate-700'
                      }`}
                    >
                      {academicState(s.state)}
                    </span>
                  </div>
                  <Link
                    to={classDetailHref(user?.role, s.classOfferingId ?? s.classOffering?.id)}
                    className="mt-1.5 block font-bold text-[#2f5d1e] hover:text-[#e66f2b] hover:underline"
                  >
                    {classCodeLabel(s.classOffering.code)} · {classLabel(s.classOffering.name)}
                  </Link>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                    <span>
                      GV: {s.instructor ? accountLabel(s.instructor.fullName) : 'Chưa phân công GV'}
                    </span>
                    <span>
                      {s.room ? `${s.room.code} · ${s.room.name}` : 'Trực tuyến / Chưa gắn phòng'}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Session Detail Modal */}
      {selectedSession && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Chi tiết buổi học"
          onClick={() => setSelectedSession(null)}
        >
          <div
            className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-5 shadow-xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <span
                  className={`inline-block rounded border px-2 py-0.5 text-xs font-semibold ${
                    STATE_BADGE[selectedSession.state] ?? 'border-slate-200 bg-slate-100 text-slate-700'
                  }`}
                >
                  {academicState(selectedSession.state)}
                  {selectedSession.revision > 1 ? ` · Bản ${selectedSession.revision}` : ''}
                </span>
                <h3 className="mt-1.5 text-lg font-bold text-slate-900">
                  {classCodeLabel(selectedSession.classOffering.code)} ·{' '}
                  {classLabel(selectedSession.classOffering.name)}
                </h3>
              </div>
              <button
                type="button"
                aria-label="Đóng"
                onClick={() => setSelectedSession(null)}
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-2.5 text-sm text-slate-700">
              <p className="flex items-center gap-2">
                <Clock size={15} className="text-[#76a35e]" aria-hidden="true" />
                <span>
                  {schoolDate(selectedSession.startsAt)} — {vnTimeOnly(selectedSession.endsAt)}
                </span>
              </p>
              <p className="flex items-center gap-2">
                <UserRound size={15} className="text-slate-500" aria-hidden="true" />
                <span>
                  Giảng viên:{' '}
                  {selectedSession.instructor
                    ? accountLabel(selectedSession.instructor.fullName)
                    : 'Chưa phân công giảng viên'}
                </span>
              </p>
              <p className="flex items-center gap-2">
                <MapPin size={15} className="text-slate-500" aria-hidden="true" />
                <span>
                  Phòng học:{' '}
                  {selectedSession.room
                    ? `${selectedSession.room.code} · ${selectedSession.room.name} (${selectedSession.room.location})`
                    : 'Trực tuyến / Chưa gắn phòng'}
                </span>
              </p>
              <SourceRecord label="Mã buổi" value={selectedSession.id} />
            </div>

            <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-3">
              <button
                type="button"
                onClick={() => setSelectedSession(null)}
                className="rounded-lg border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Đóng
              </button>
              <Link
                to={classDetailHref(
                  user?.role,
                  selectedSession.classOfferingId ?? selectedSession.classOffering?.id,
                )}
                className="rounded-lg bg-[#76a35e] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#5e8a47]"
              >
                Mở chi tiết lớp học →
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
