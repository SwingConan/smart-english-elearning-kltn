import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  CheckSquare,
  ClipboardCheck,
  Clock,
  Filter,
  GraduationCap,
  HelpCircle,
  MessageSquare,
  RefreshCw,
  Search,
  Sparkles,
  Users,
  Video,
  X,
} from 'lucide-react';
import { useAuth } from '@/features/auth/auth-context';
import { accountLabel } from '@/features/catalog/record-presentation';
import { classCodeLabel, demoText } from '@/features/demo/presentation';
import { learnerClassLabel, learnerCourseLabel } from '@/features/enrollments/presentation';
import { weekdayLabel } from '@/features/classes/schedule';
import { apiFetch } from '@/lib/api-client';
import { instructorApi } from '@/features/instructor/api';
import { classStatus } from '@/features/instructor/class-status';
import type { InstructorClass, InstructorClassOverview } from '@/features/instructor/types';
import type { CalendarEvent } from '@/features/class-lms/api';
import { calendarItems } from '@/features/class-lms/calendar-events';
import { schoolDay, schoolMonth, schoolTime, shiftMonth } from '@/features/class-lms/month';
import { lmsLocalApi, type UnifiedClassResults } from '@/features/class-lms/lms-local-api';
import type { ConsultationBooking } from '@/pages/ConsultationsPage';

type ClassSnapshot = {
  cls: InstructorClass;
  overview?: InstructorClassOverview;
  unified?: UnifiedClassResults;
};

type ClassStatusFilter = 'ALL' | 'ACTIVE_OPEN' | 'COMPLETED';
type GradingKindFilter = 'ALL' | 'TEST' | 'ASSIGNMENT' | 'LOCAL_QUIZ';
type ScheduleRangeFilter = 'TODAY' | '7D' | '30D';
type BookingScopeFilter = 'ACTIVE' | 'ALL';

type GradingQueueItem = {
  key: string;
  kind: Exclude<GradingKindFilter, 'ALL'>;
  kindLabel: string;
  classId: string;
  classCode: string;
  className: string;
  title: string;
  learnerName: string;
  stateLabel: string;
  submittedAt: string | null;
  metaText: string;
  to: string;
};

const DAY_MS = 86_400_000;

const gradingStateLabel: Record<string, string> = {
  WAITING: 'Chờ chấm',
  PARTIAL: 'Đang chấm dở',
  NOT_GRADED: 'Chờ chấm',
  DRAFT: 'Bản chấm nháp',
  PENDING_MANUAL_GRADE: 'Chờ chấm tự luận',
};

const consultationStateInfo: Record<string, { label: string; cls: string }> = {
  PENDING_GV: {
    label: 'Chờ GV xác nhận',
    cls: 'border-amber-200 bg-amber-50 text-amber-900',
  },
  PENDING_CONFIRMATION: {
    label: 'Chờ xác nhận',
    cls: 'border-amber-200 bg-amber-50 text-amber-900',
  },
  RESCHEDULE_REQUESTED: {
    label: 'Yêu cầu đổi lịch',
    cls: 'border-sky-200 bg-sky-50 text-sky-900',
  },
  CANCEL_REQUESTED: {
    label: 'Yêu cầu hủy',
    cls: 'border-rose-200 bg-rose-50 text-rose-800',
  },
  CONFIRMED: {
    label: 'Đã xác nhận',
    cls: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  },
  COMPLETED: {
    label: 'Đã hoàn thành',
    cls: 'border-slate-200 bg-slate-100 text-slate-700',
  },
  REJECTED: {
    label: 'Đã từ chối',
    cls: 'border-slate-200 bg-slate-100 text-slate-600',
  },
};

function isUnifiedResults(value: unknown): value is UnifiedClassResults {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<UnifiedClassResults>;
  return Boolean(
    candidate.summary &&
      typeof candidate.summary.publishedActivities === 'number' &&
      Array.isArray(candidate.activityColumns) &&
      Array.isArray(candidate.studentRows),
  );
}

function isLeftoverQaTitle(raw?: string | null): boolean {
  if (!raw) return false;
  return /(?:E2E|Q04)-\d{6}/.test(raw);
}

function formatDateVi(iso: string): string {
  return schoolDay(iso).split('-').reverse().join('/');
}

function formatScheduleSlots(cls: InstructorClass): string | null {
  const slots = cls.scheduleSlots ?? [];
  if (slots.length === 0) return null;
  const days = Array.from(new Set(slots.map((s) => weekdayLabel(s.dayOfWeek)))).join(', ');
  const first = slots[0];
  const timeRange =
    first?.startTime && first?.endTime ? `${first.startTime}–${first.endTime}` : first?.startTime;
  return timeRange ? `${days} · ${timeRange}` : days;
}

function buildGradingQueue(snapshots: ClassSnapshot[]): GradingQueueItem[] {
  const items: GradingQueueItem[] = [];
  const seen = new Set<string>();

  for (const snap of snapshots) {
    const classId = snap.cls.id;
    const classCode = classCodeLabel(snap.cls.code);
    const className = learnerClassLabel(snap.cls.name, snap.cls.code, snap.cls.course?.title);

    for (const attempt of snap.overview?.grading?.attempts ?? []) {
      if (attempt.state === 'FINAL' || isLeftoverQaTitle(attempt.assessmentTitle)) continue;
      const key = `test:${attempt.attemptId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({
        key,
        kind: 'TEST',
        kindLabel: 'Bài kiểm tra',
        classId,
        classCode,
        className,
        title: demoText(attempt.assessmentTitle),
        learnerName: accountLabel(attempt.learner.fullName),
        stateLabel: gradingStateLabel[attempt.state] ?? attempt.state,
        submittedAt: attempt.submittedAt,
        metaText: `Lần làm #${attempt.attemptNumber}`,
        to: `/instructor/classes/${classId}/grading`,
      });
    }

    const colMap = new Map(
      (snap.unified?.activityColumns ?? []).map((col) => [col.activityId, col]),
    );

    for (const row of snap.unified?.studentRows ?? []) {
      for (const [actId, cell] of Object.entries(row.assignments ?? {})) {
        if (
          cell.submissionState !== 'SUBMITTED' ||
          !['NOT_GRADED', 'DRAFT'].includes(cell.gradeState)
        ) {
          continue;
        }
        const col = colMap.get(actId);
        if (!col || col.state === 'HIDDEN' || isLeftoverQaTitle(col.title)) continue;
        const key = `assign:${actId}:${row.learnerId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        items.push({
          key,
          kind: 'ASSIGNMENT',
          kindLabel: 'Bài tập nộp',
          classId,
          classCode,
          className,
          title: demoText(col.title),
          learnerName: accountLabel(row.fullName),
          stateLabel: gradingStateLabel[cell.gradeState] ?? 'Chờ chấm',
          submittedAt: cell.submittedAt,
          metaText: demoText(col.sectionTitle),
          to: `/classroom/${classId}/activities/${actId}`,
        });
      }

      for (const [actId, cell] of Object.entries(row.quizzes ?? {})) {
        if (cell.attemptStatus !== 'SUBMITTED' || cell.gradingStatus !== 'PENDING_MANUAL_GRADE') {
          continue;
        }
        const col = colMap.get(actId);
        if (!col || col.state === 'HIDDEN' || isLeftoverQaTitle(col.title)) continue;
        const key = `quiz:${actId}:${row.learnerId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        items.push({
          key,
          kind: 'LOCAL_QUIZ',
          kindLabel: 'Quiz tự luận',
          classId,
          classCode,
          className,
          title: demoText(col.title),
          learnerName: accountLabel(row.fullName),
          stateLabel: gradingStateLabel[cell.gradingStatus],
          submittedAt: cell.submittedAt,
          metaText: demoText(col.sectionTitle),
          to: `/classroom/${classId}/activities/${actId}`,
        });
      }
    }
  }

  return items.sort((a, b) => {
    const aMs = a.submittedAt ? new Date(a.submittedAt).getTime() : 0;
    const bMs = b.submittedAt ? new Date(b.submittedAt).getTime() : 0;
    return bMs - aMs;
  });
}

export function InstructorWorkspaceDashboard() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [snapshots, setSnapshots] = useState<ClassSnapshot[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [bookings, setBookings] = useState<ConsultationBooking[]>([]);
  const [issues, setIssues] = useState<string[]>([]);
  const [now, setNow] = useState(() => Date.now());

  // Interactive workspace filters
  const [selectedCourseKey, setSelectedCourseKey] = useState<string>('ALL');
  const [selectedClassId, setSelectedClassId] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<ClassStatusFilter>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [gradingFilter, setGradingFilter] = useState<GradingKindFilter>('ALL');
  const [scheduleRange, setScheduleRange] = useState<ScheduleRangeFilter>('7D');
  const [bookingScope, setBookingScope] = useState<BookingScopeFilter>('ACTIVE');

  const load = useCallback(async () => {
    setLoading(true);
    const nextIssues: string[] = [];
    const month = schoolMonth();

    const [classRes, calendarRes, consultationRes] = await Promise.allSettled([
      instructorApi.classes.list(),
      Promise.all([
        apiFetch<{ data: CalendarEvent[] }>(`/v2/my/calendar?month=${month}`),
        apiFetch<{ data: CalendarEvent[] }>(`/v2/my/calendar?month=${shiftMonth(month, 1)}`),
      ]),
      apiFetch<{ data: ConsultationBooking[] }>('/v2/consultations/bookings'),
    ]);

    if (calendarRes.status === 'fulfilled') {
      setEvents(calendarRes.value.flatMap((res) => res.data ?? []));
    } else {
      nextIssues.push('Chưa tải được lịch dạy từ máy chủ.');
    }

    if (consultationRes.status === 'fulfilled') {
      setBookings(consultationRes.value.data ?? []);
    } else {
      nextIssues.push('Chưa tải được danh sách lịch tư vấn 1:1.');
    }

    if (classRes.status === 'fulfilled') {
      const classes = classRes.value ?? [];
      const [overviews, unifiedList] = await Promise.all([
        Promise.allSettled(classes.map((cls) => instructorApi.classes.overview(cls.id))),
        Promise.allSettled(classes.map((cls) => lmsLocalApi.getUnifiedClassResults(cls.id))),
      ]);

      setSnapshots(
        classes.map((cls, idx) => {
          const ov = overviews[idx];
          const uni = unifiedList[idx];
          return {
            cls,
            overview: ov?.status === 'fulfilled' ? ov.value : undefined,
            unified:
              uni?.status === 'fulfilled' && isUnifiedResults(uni.value) ? uni.value : undefined,
          };
        }),
      );
      if (overviews.some((r) => r.status === 'rejected')) {
        nextIssues.push('Một phần số liệu tổng quan theo lớp chưa tải được.');
      }
    } else {
      setSnapshots([]);
      nextIssues.push('Chưa tải được danh sách lớp được phân công.');
    }

    setIssues(nextIssues);
    setNow(Date.now());
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const courseOptions = useMemo(() => {
    const map = new Map<string, { key: string; title: string; count: number }>();
    for (const { cls } of snapshots) {
      const title = (cls.course?.title ?? '').trim() || 'Khóa học khác';
      const key = cls.course?.id || title;
      const existing = map.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        map.set(key, { key, title, count: 1 });
      }
    }
    return [...map.values()];
  }, [snapshots]);

  const effectiveCourseKey = useMemo(() => {
    if (selectedCourseKey === 'ALL') return 'ALL';
    return courseOptions.some((c) => c.key === selectedCourseKey) ? selectedCourseKey : 'ALL';
  }, [selectedCourseKey, courseOptions]);

  const courseSnapshots = useMemo(() => {
    if (effectiveCourseKey === 'ALL') return snapshots;
    return snapshots.filter(({ cls }) => {
      const title = (cls.course?.title ?? '').trim() || 'Khóa học khác';
      const key = cls.course?.id || title;
      return key === effectiveCourseKey;
    });
  }, [snapshots, effectiveCourseKey]);

  const effectiveClassId = useMemo(() => {
    if (selectedClassId === 'ALL') return 'ALL';
    return courseSnapshots.some((s) => s.cls.id === selectedClassId) ? selectedClassId : 'ALL';
  }, [selectedClassId, courseSnapshots]);

  const totalLearners = useMemo(
    () => snapshots.reduce((sum, s) => sum + (s.cls.activeLearnerCount ?? 0), 0),
    [snapshots],
  );

  const activeClassCount = useMemo(
    () => snapshots.filter((s) => s.cls.status !== 'COMPLETED' && s.cls.status !== 'CANCELLED').length,
    [snapshots],
  );

  const gradingQueueAll = useMemo(() => buildGradingQueue(snapshots), [snapshots]);

  const pendingCountByClass = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of gradingQueueAll) {
      counts.set(item.classId, (counts.get(item.classId) ?? 0) + 1);
    }
    return counts;
  }, [gradingQueueAll]);

  const totalPendingGrading = gradingQueueAll.length;

  const scheduleEventsAll = useMemo(() => {
    const classIdByEventId = new Map<string, string>();
    const metaByEventId = new Map<
      string,
      { modality: string; meetUrl?: string | null; roomCode?: string }
    >();

    for (const ev of events) {
      if (ev.classOffering?.id) classIdByEventId.set(ev.id, ev.classOffering.id);
      metaByEventId.set(ev.id, {
        modality: ev.modality,
        meetUrl: ev.meetUrl,
        roomCode: ev.room?.code,
      });
    }

    return calendarItems(events, [])
      .map((item) => {
        const meta = metaByEventId.get(item.id);
        return {
          ...item,
          title: demoText(item.title),
          classId: classIdByEventId.get(item.id) ?? '',
          modality: meta?.modality ?? 'ONLINE',
          meetUrl: meta?.meetUrl ?? item.meetUrl ?? null,
          roomCode: meta?.roomCode ?? null,
        };
      })
      .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
  }, [events]);

  const upcoming7dCount = useMemo(() => {
    const end = now + 7 * DAY_MS;
    return scheduleEventsAll.filter((ev) => {
      const ms = new Date(ev.startsAt).getTime();
      return Number.isFinite(ms) && ms >= now - 3600_000 && ms <= end;
    }).length;
  }, [scheduleEventsAll, now]);

  const activeConsultationsCount = useMemo(
    () =>
      bookings.filter(
        (b) =>
          [
            'PENDING_GV',
            'PENDING_CONFIRMATION',
            'RESCHEDULE_REQUESTED',
            'CANCEL_REQUESTED',
            'CONFIRMED',
          ].includes(b.state) && new Date(b.startsAt).getTime() >= now - 3600_000,
      ).length,
    [bookings, now],
  );

  const pendingActionBookingsCount = useMemo(
    () =>
      bookings.filter((b) =>
        ['PENDING_GV', 'PENDING_CONFIRMATION', 'RESCHEDULE_REQUESTED', 'CANCEL_REQUESTED'].includes(
          b.state,
        ),
      ).length,
    [bookings],
  );

  const q = searchQuery.trim().toLowerCase();

  // Filtered classes
  const visibleSnapshots = useMemo(() => {
    return courseSnapshots.filter(({ cls }) => {
      if (effectiveClassId !== 'ALL' && cls.id !== effectiveClassId) return false;
      if (statusFilter === 'ACTIVE_OPEN' && cls.status === 'COMPLETED') return false;
      if (statusFilter === 'COMPLETED' && cls.status !== 'COMPLETED') return false;
      if (!q) return true;
      const label = learnerClassLabel(cls.name, cls.code, cls.course?.title).toLowerCase();
      return (
        label.includes(q) ||
        cls.name.toLowerCase().includes(q) ||
        classCodeLabel(cls.code).toLowerCase().includes(q) ||
        (cls.course?.title ?? '').toLowerCase().includes(q)
      );
    });
  }, [courseSnapshots, effectiveClassId, statusFilter, q]);

  const statusMatchingClassIds = useMemo(() => {
    if (statusFilter === 'ALL' && effectiveCourseKey === 'ALL') return null;
    const ids = new Set<string>();
    for (const { cls } of courseSnapshots) {
      if (statusFilter === 'ACTIVE_OPEN' && cls.status === 'COMPLETED') continue;
      if (statusFilter === 'COMPLETED' && cls.status !== 'COMPLETED') continue;
      ids.add(cls.id);
    }
    return ids;
  }, [courseSnapshots, statusFilter, effectiveCourseKey]);

  // Filtered grading queue
  const scopedGradingQueue = useMemo(() => {
    return gradingQueueAll.filter((item) => {
      if (effectiveClassId !== 'ALL' && item.classId !== effectiveClassId) return false;
      if (statusMatchingClassIds && !statusMatchingClassIds.has(item.classId)) return false;
      if (
        q &&
        !item.title.toLowerCase().includes(q) &&
        !item.learnerName.toLowerCase().includes(q) &&
        !item.className.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [gradingQueueAll, effectiveClassId, statusMatchingClassIds, q]);

  const visibleGradingQueue = useMemo(() => {
    if (gradingFilter === 'ALL') return scopedGradingQueue;
    return scopedGradingQueue.filter((item) => item.kind === gradingFilter);
  }, [scopedGradingQueue, gradingFilter]);

  // Filtered teaching schedule
  const visibleSchedule = useMemo(() => {
    const todayIso = schoolDay(new Date(now).toISOString());
    const endMs = now + (scheduleRange === 'TODAY' ? 1 : scheduleRange === '7D' ? 7 : 30) * DAY_MS;

    return scheduleEventsAll
      .filter((ev) => {
        if (effectiveClassId !== 'ALL' && ev.classId !== effectiveClassId) return false;
        if (statusMatchingClassIds && !statusMatchingClassIds.has(ev.classId)) return false;
        const ms = new Date(ev.startsAt).getTime();
        if (!Number.isFinite(ms)) return false;
        if (scheduleRange === 'TODAY') {
          if (schoolDay(ev.startsAt) !== todayIso) return false;
        } else if (ms < now - 3600_000 || ms > endMs) {
          return false;
        }
        if (q && !(ev.className ?? '').toLowerCase().includes(q) && !ev.title.toLowerCase().includes(q)) {
          return false;
        }
        return true;
      })
      .slice(0, 7);
  }, [scheduleEventsAll, effectiveClassId, statusMatchingClassIds, scheduleRange, now, q]);

  // Deduplicated assessment milestones with clear OPEN / CLOSE tags and submission ratios
  const visibleDeadlines = useMemo(() => {
    return snapshots
      .filter((s) => {
        if (effectiveClassId !== 'ALL' && s.cls.id !== effectiveClassId) return false;
        if (statusMatchingClassIds && !statusMatchingClassIds.has(s.cls.id)) return false;
        return true;
      })
      .flatMap((snap) => {
        const assessMap = new Map(
          (snap.overview?.assessments ?? []).map((a) => [a.id, a]),
        );
        return (snap.overview?.upcomingDeadlines ?? [])
          .filter((d) => !isLeftoverQaTitle(d.title))
          .map((d) => {
            const detail = assessMap.get(d.assessmentId);
            return {
              key: `${snap.cls.id}:${d.assessmentId}:${d.kind}:${d.at}`,
              classId: snap.cls.id,
              className: learnerClassLabel(snap.cls.name, snap.cls.code, snap.cls.course?.title),
              assessmentId: d.assessmentId,
              kind: d.kind,
              at: d.at,
              title: demoText(d.title),
              submissionSummary: detail
                ? `${detail.submittedLearnerCount}/${detail.activeLearnerCount} đã nộp`
                : null,
            };
          });
      })
      .filter((d) => {
        if (!q) return true;
        return d.title.toLowerCase().includes(q) || d.className.toLowerCase().includes(q);
      })
      .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
      .slice(0, 6);
  }, [snapshots, effectiveClassId, statusMatchingClassIds, q]);

  // Filtered consultation bookings (prioritizing pending teacher confirmations)
  const visibleBookings = useMemo(() => {
    const filtered = bookings.filter((b) => {
      if (bookingScope === 'ACTIVE') {
        const isPendingDecision = [
          'PENDING_GV',
          'PENDING_CONFIRMATION',
          'RESCHEDULE_REQUESTED',
          'CANCEL_REQUESTED',
        ].includes(b.state);
        const isUpcomingConfirmed =
          b.state === 'CONFIRMED' && new Date(b.startsAt).getTime() >= now - 3600_000;
        if (!isPendingDecision && !isUpcomingConfirmed) return false;
      }
      if (q && !(b.topic ?? '').toLowerCase().includes(q)) return false;
      return true;
    });

    return [...filtered]
      .sort((a, b) => {
        const aPending = a.state === 'PENDING_GV' || a.state === 'PENDING_CONFIRMATION' ? 0 : 1;
        const bPending = b.state === 'PENDING_GV' || b.state === 'PENDING_CONFIRMATION' ? 0 : 1;
        if (aPending !== bPending) return aPending - bPending;
        return new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime();
      })
      .slice(0, 5);
  }, [bookings, bookingScope, q]);

  const hasActiveFilter =
    effectiveCourseKey !== 'ALL' ||
    effectiveClassId !== 'ALL' ||
    statusFilter !== 'ALL' ||
    gradingFilter !== 'ALL' ||
    q.length > 0;

  const resetFilters = () => {
    setSelectedCourseKey('ALL');
    setSelectedClassId('ALL');
    setStatusFilter('ALL');
    setGradingFilter('ALL');
    setSearchQuery('');
  };

  return (
    <main className="min-h-screen bg-[#f6f8f5] pb-12" id="main-content">
      <div className="mx-auto max-w-[1280px] space-y-6 px-4 pt-6 sm:px-6 lg:px-8">
        {/* Hero Header */}
        <section className="rounded-2xl border border-[#dce8d5] bg-gradient-to-br from-white via-[#f9fcf7] to-[#eef5e9] p-6 shadow-sm">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-2 max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-[#cde0c2] bg-[#edf5e8] px-3 py-1 text-xs font-semibold text-[#446b2f]">
                <Sparkles className="size-3.5" aria-hidden="true" />
                Không gian Giảng viên · {user ? accountLabel(user.fullName) : 'Giảng viên'}
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                Tổng quan giảng dạy
              </h1>
              <p className="text-sm text-slate-600">
                {loading
                  ? 'Đang tổng hợp lớp phụ trách, bài chờ chấm, lịch dạy và yêu cầu tư vấn...'
                  : `Đang phụ trách ${snapshots.length} lớp học (${activeClassCount} đang dạy/mở) · ${totalLearners} học viên · ${totalPendingGrading} bài chờ chấm điểm`}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <Link
                to="/instructor/teaching"
                className="inline-flex items-center gap-2 rounded-xl bg-[#5e9141] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#4d7735]"
              >
                <GraduationCap className="size-4" aria-hidden="true" />
                Mở lớp giảng dạy
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
              <Link
                to="/instructor/assessments-hub"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                <HelpCircle className="size-4 text-[#5e9141]" aria-hidden="true" />
                Ngân hàng câu hỏi
              </Link>
              <Link
                to="/my/calendar"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                <CalendarClock className="size-4 text-[#5e9141]" aria-hidden="true" />
                Bảng điều khiển
              </Link>
              <button
                type="button"
                onClick={() => void load()}
                disabled={loading}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
              >
                <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
                Làm mới
              </button>
            </div>
          </div>
        </section>

        {issues.length > 0 && (
          <div
            role="status"
            className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
          >
            <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-700" aria-hidden="true" />
            <div className="space-y-1">
              {issues.map((issue) => (
                <p key={issue}>{issue}</p>
              ))}
            </div>
          </div>
        )}

        {/* 4 Actionable KPI Cards */}
        <section aria-label="Tổng hợp công việc giảng dạy" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Link
            to="/instructor/teaching"
            className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-[#b7d3a6]"
          >
            <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-500">
              <span>Lớp phụ trách</span>
              <span className="flex size-8 items-center justify-center rounded-lg bg-[#edf5e8] text-[#5e9141]">
                <BookOpen className="size-4" aria-hidden="true" />
              </span>
            </div>
            <p className="mt-3 text-3xl font-bold text-slate-900">
              {loading ? '...' : snapshots.length}
            </p>
            <p className="mt-1 text-xs text-slate-600">
              {activeClassCount} lớp đang vận hành · {totalLearners} học viên
            </p>
          </Link>

          <a
            href="#grading-queue"
            className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-amber-300"
          >
            <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-500">
              <span>Bài nộp chờ chấm</span>
              <span className="flex size-8 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
                <CheckSquare className="size-4" aria-hidden="true" />
              </span>
            </div>
            <p className="mt-3 text-3xl font-bold text-[#d9621e]">
              {loading ? '...' : totalPendingGrading}
            </p>
            <p className="mt-1 text-xs text-slate-600">
              Gồm bài kiểm tra, bài tập nộp &amp; quiz tự luận
            </p>
          </a>

          <Link
            to="/my/calendar"
            className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-sky-300"
          >
            <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-500">
              <span>Lịch dạy 7 ngày tới</span>
              <span className="flex size-8 items-center justify-center rounded-lg bg-sky-50 text-sky-700">
                <CalendarDays className="size-4" aria-hidden="true" />
              </span>
            </div>
            <p className="mt-3 text-3xl font-bold text-slate-900">
              {loading ? '...' : upcoming7dCount}
            </p>
            <p className="mt-1 text-xs text-slate-600">
              Buổi lên lớp &amp; lịch kiểm tra trong tuần này
            </p>
          </Link>

          <Link
            to="/consultations"
            className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-[#b7d3a6]"
          >
            <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-500">
              <span>Lịch tư vấn 1:1</span>
              <span className="flex size-8 items-center justify-center rounded-lg bg-teal-50 text-teal-700">
                <MessageSquare className="size-4" aria-hidden="true" />
              </span>
            </div>
            <p className="mt-3 text-3xl font-bold text-slate-900">
              {loading ? '...' : activeConsultationsCount}
            </p>
            <p className="mt-1 text-xs text-slate-600">
              {pendingActionBookingsCount > 0 ? (
                <span className="font-semibold text-amber-800">
                  {pendingActionBookingsCount} yêu cầu chờ xác nhận
                </span>
              ) : (
                'Đã xác nhận & đang mở lịch nhận tư vấn'
              )}
            </p>
          </Link>
        </section>

        {/* Global Interactive Class, Status & Search Filter Bar */}
        <section
          aria-label="Bộ lọc không gian giảng dạy"
          className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm space-y-3"
        >
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-800">
              <Filter className="size-4 text-[#5e9141]" aria-hidden="true" />
              <span>Lọc nhanh theo lớp phụ trách</span>
              {hasActiveFilter && (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700 hover:bg-slate-200"
                >
                  <X className="size-3" aria-hidden="true" />
                  Đặt lại
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {courseOptions.length > 0 && (
                <select
                  aria-label="Lọc theo khóa học"
                  value={effectiveCourseKey}
                  onChange={(e) => {
                    setSelectedCourseKey(e.target.value);
                    setSelectedClassId('ALL');
                  }}
                  className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-1.5 text-xs font-semibold text-slate-700 focus:border-[#5e9141] focus:bg-white focus:outline-none"
                >
                  <option value="ALL">Tất cả khóa học ({courseOptions.length})</option>
                  {courseOptions.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.title} ({c.count} lớp)
                    </option>
                  ))}
                </select>
              )}

              <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-0.5">
                {(
                  [
                    ['ALL', 'Tất cả'],
                    ['ACTIVE_OPEN', 'Đang dạy & Mở'],
                    ['COMPLETED', 'Đã hoàn thành'],
                  ] as const
                ).map(([val, lbl]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setStatusFilter(val)}
                    className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                      statusFilter === val
                        ? 'bg-white text-[#446b2f] shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {lbl}
                  </button>
                ))}
              </div>

              <div className="relative w-full sm:w-64">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Tìm lớp, bài tập, học viên..."
                  aria-label="Tìm lớp, bài tập, học viên"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/70 py-1.5 pl-9 pr-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-[#5e9141] focus:bg-white focus:outline-none"
                />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedClassId('ALL')}
              className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                effectiveClassId === 'ALL'
                  ? 'bg-[#5e9141] text-white shadow-sm'
                  : 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
              }`}
            >
              Tất cả lớp ({courseSnapshots.length})
            </button>
            {courseSnapshots.map((snap) => {
              const pending = pendingCountByClass.get(snap.cls.id) ?? 0;
              const active = effectiveClassId === snap.cls.id;
              return (
                <button
                  key={snap.cls.id}
                  type="button"
                  onClick={() => setSelectedClassId(snap.cls.id)}
                  className={`inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                    active
                      ? 'bg-[#5e9141] text-white shadow-sm'
                      : 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <span>
                    {learnerClassLabel(snap.cls.name, snap.cls.code, snap.cls.course?.title)} (
                    {classCodeLabel(snap.cls.code)})
                  </span>
                  {pending > 0 && (
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[11px] font-bold ${
                        active ? 'bg-white/25 text-white' : 'bg-amber-100 text-amber-900'
                      }`}
                    >
                      {pending} chờ chấm
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        {/* Main 2-Column Teaching Workspace */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Left Column: Assigned Classes + Unified Grading Queue */}
          <div className="space-y-6 lg:col-span-8">
            <section
              id="assigned-classes"
              className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm space-y-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
                    <GraduationCap size={20} className="text-[#5e9141]" aria-hidden="true" />
                    Lớp phụ trách giảng dạy
                  </h2>
                  <p className="text-xs text-slate-500">
                    Quản lý nội dung học phần, theo dõi hoạt động xuất bản và chấm bài theo từng lớp
                  </p>
                </div>
                <Link
                  to="/instructor/teaching"
                  className="text-xs font-semibold text-[#5e9141] hover:underline"
                >
                  Xem tất cả lớp →
                </Link>
              </div>

              {!loading && visibleSnapshots.length === 0 && (
                <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50/70 p-5 text-center text-sm text-slate-600">
                  {snapshots.length === 0
                    ? 'Hiện bạn chưa được phân công lớp học nào trong kỳ này.'
                    : 'Không tìm thấy lớp học phù hợp với bộ lọc đang chọn.'}
                </p>
              )}

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {visibleSnapshots.map((snap) => {
                  const { cls, overview, unified } = snap;
                  const st = classStatus(cls.status);
                  const pendingCount = pendingCountByClass.get(cls.id) ?? 0;
                  const slotText = formatScheduleSlots(cls);
                  const uSum = unified?.summary;
                  const quizExamTotal = uSum
                    ? uSum.quizzesCount +
                      uSum.regularExamCount +
                      uSum.midtermCount +
                      uSum.finalCount
                    : 0;
                  const publishedRatio =
                    uSum && uSum.totalActivities > 0
                      ? Math.round((uSum.publishedActivities / uSum.totalActivities) * 100)
                      : null;

                  return (
                    <article
                      key={cls.id}
                      className="flex flex-col justify-between rounded-xl border border-slate-200 bg-[#fcfdfb] p-4 transition hover:border-[#b7d3a6]"
                    >
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="rounded-md bg-[#edf5e8] px-2 py-0.5 text-[11px] font-bold tracking-wide text-[#446b2f]">
                              {classCodeLabel(cls.code)}
                            </span>
                            <span
                              className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${st.className}`}
                            >
                              {st.label}
                            </span>
                          </div>
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-600">
                            <Users className="size-3.5 text-slate-400" aria-hidden="true" />
                            {cls.activeLearnerCount} học viên
                          </span>
                        </div>

                        <div>
                          <h3 className="text-base font-bold text-slate-900 leading-snug">
                            {learnerClassLabel(cls.name, cls.code, cls.course?.title)}
                          </h3>
                          <p className="mt-0.5 text-xs text-slate-500">
                            {learnerCourseLabel(cls.course?.title ?? '')}
                            {slotText ? ` · ${slotText}` : ''}
                          </p>
                        </div>

                        {/* Meaningful LMS Activity & Grading Summary */}
                        <div className="rounded-xl border border-slate-100 bg-white p-3 space-y-2">
                          {uSum ? (
                            <>
                              <div className="flex items-center justify-between text-xs">
                                <span className="font-medium text-slate-600">
                                  Nội dung đã xuất bản
                                </span>
                                <span className="font-bold text-slate-900">
                                  {uSum.publishedActivities}/{uSum.totalActivities} hoạt động
                                </span>
                              </div>
                              {publishedRatio !== null && (
                                <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                                  <div
                                    className="h-full rounded-full bg-[#5e9141]"
                                    style={{ width: `${Math.min(100, publishedRatio)}%` }}
                                  />
                                </div>
                              )}
                              <div className="flex flex-wrap gap-1.5 pt-0.5 text-[11px] text-slate-600">
                                <span className="rounded bg-slate-100 px-2 py-0.5">
                                  {uSum.assignmentsCount} bài tập
                                </span>
                                <span className="rounded bg-slate-100 px-2 py-0.5">
                                  {quizExamTotal} quiz/kiểm tra
                                </span>
                                <span className="rounded bg-slate-100 px-2 py-0.5">
                                  {uSum.attendanceCount} điểm danh
                                </span>
                              </div>
                            </>
                          ) : overview ? (
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-slate-600">
                                Hình thức: {cls.modality === 'OFFLINE' ? 'Tại trung tâm' : 'Trực tuyến'}
                              </span>
                              <span className="font-semibold text-slate-800">
                                {overview.assessments?.length ?? 0} bài kiểm tra mở
                              </span>
                            </div>
                          ) : null}

                          {pendingCount > 0 && (
                            <p className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900">
                              <CheckSquare className="size-3.5" aria-hidden="true" />
                              {pendingCount} bài nộp đang chờ chấm
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-3">
                        <Link
                          to={`/classroom/${cls.id}`}
                          aria-label={`Vào lớp · ${learnerClassLabel(cls.name, cls.code, cls.course?.title)}`}
                          className="inline-flex items-center justify-center whitespace-nowrap rounded-lg bg-[#5e9141] px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-[#4d7735]"
                        >
                          Vào lớp học
                        </Link>
                        <Link
                          to={`/instructor/classes/${cls.id}`}
                          className="inline-flex items-center justify-center whitespace-nowrap rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          Chấm bài
                        </Link>
                        <Link
                          to={`/classroom/${cls.id}/gradebook`}
                          className="inline-flex items-center justify-center whitespace-nowrap rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          Sổ điểm
                        </Link>
                        <Link
                          to={`/instructor/classes/${cls.id}/question-bank`}
                          className="inline-flex items-center justify-center whitespace-nowrap rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                        >
                          Câu hỏi
                        </Link>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>

            {/* Unified Grading Queue (Formal Assessments + LMS Assignments + Local Quizzes) */}
            <section
              id="grading-queue"
              className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm space-y-4"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
                    <CheckSquare size={20} className="text-[#d9621e]" aria-hidden="true" />
                    Hàng đợi bài nộp chờ chấm
                  </h2>
                  <p className="text-xs text-slate-500">
                    Hiển thị {visibleGradingQueue.length} / {scopedGradingQueue.length} bài nộp cần giảng viên xem xét
                  </p>
                </div>

                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Lọc loại bài chờ chấm">
                  {(
                    [
                      ['ALL', 'Tất cả'],
                      ['TEST', 'Bài kiểm tra'],
                      ['ASSIGNMENT', 'Bài tập nộp'],
                      ['LOCAL_QUIZ', 'Quiz tự luận'],
                    ] as const
                  ).map(([val, lbl]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setGradingFilter(val)}
                      className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                        gradingFilter === val
                          ? 'bg-slate-900 text-white'
                          : 'border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {lbl}
                    </button>
                  ))}
                </div>
              </div>

              {!loading && visibleGradingQueue.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 p-6 text-center text-sm text-slate-600">
                  {scopedGradingQueue.length === 0
                    ? 'Hiện không còn bài tập hoặc bài kiểm tra nào chờ chấm điểm trong phạm vi lọc.'
                    : 'Không có bài chờ chấm thuộc loại hoạt động đã chọn.'}
                </div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {visibleGradingQueue.slice(0, 10).map((item) => (
                    <li key={item.key} className="py-3 first:pt-1 last:pb-1">
                      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
                              {item.kindLabel}
                            </span>
                            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700 truncate max-w-[260px]">
                              {item.classCode} · {item.className}
                            </span>
                            <span className="rounded-md border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-800">
                              {item.stateLabel}
                            </span>
                          </div>
                          <h3 className="text-sm font-bold text-slate-900">{item.title}</h3>
                          <p className="text-xs text-slate-500">
                            Học viên: <span className="font-semibold text-slate-700">{item.learnerName}</span>
                            {' · '}
                            {item.metaText}
                            {item.submittedAt ? ` · Nộp ${formatDateVi(item.submittedAt)}` : ''}
                          </p>
                        </div>

                        <Link
                          to={item.to}
                          className="inline-flex shrink-0 items-center justify-center rounded-lg bg-[#edf5e8] border border-[#cde0c2] px-3.5 py-1.5 text-xs font-semibold text-[#446b2f] transition hover:bg-[#e0edd7]"
                        >
                          Chấm bài →
                        </Link>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          {/* Right Column: Schedule Filter, Deadlines, Consultations & Quick Workflows */}
          <aside className="space-y-6 lg:col-span-4">
            {/* Teaching Schedule with Timeframe Filter */}
            <section className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm space-y-3.5">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
                    <CalendarDays size={18} className="text-[#5e9141]" aria-hidden="true" />
                    Lịch dạy sắp tới
                  </h2>
                  <p className="text-xs text-slate-500">Theo múi giờ GMT+7</p>
                </div>
                <Link to="/my/calendar" className="text-xs font-semibold text-[#5e9141] hover:underline">
                  Mở lịch →
                </Link>
              </div>

              <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
                {(
                  [
                    ['TODAY', 'Hôm nay'],
                    ['7D', '7 ngày'],
                    ['30D', '30 ngày'],
                  ] as const
                ).map(([val, lbl]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setScheduleRange(val)}
                    className={`rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                      scheduleRange === val
                        ? 'bg-white text-[#446b2f] shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {lbl}
                  </button>
                ))}
              </div>

              {!loading && visibleSchedule.length === 0 ? (
                <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 p-4 text-xs text-slate-600">
                  Không có buổi dạy nào trong khoảng thời gian đã chọn.
                </p>
              ) : (
                <ul className="space-y-2">
                  {visibleSchedule.map((ev) => {
                    const d = schoolDay(ev.startsAt);
                    const [, mm, dd] = d.split('-');
                    const isOnline = ev.modality !== 'OFFLINE';
                    return (
                      <li key={ev.id}>
                        <Link
                          to={ev.url}
                          className="flex items-start gap-3 rounded-xl border border-slate-200/80 bg-[#fcfdfb] p-3 transition hover:border-[#b7d3a6] hover:bg-[#f6faf3]"
                        >
                          <div className="flex w-11 shrink-0 flex-col items-center rounded-lg border border-[#dce8d5] bg-[#edf5e8] py-1 text-[#446b2f]">
                            <span className="text-[10px] font-semibold uppercase">Th.{Number(mm)}</span>
                            <span className="text-sm font-bold leading-tight">{dd}</span>
                          </div>
                          <div className="min-w-0 flex-1 space-y-0.5">
                            <p className="truncate text-xs font-bold text-slate-900">
                              {ev.className || ev.title}
                            </p>
                            <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-600">
                              <span className="inline-flex items-center gap-1 font-semibold text-slate-800">
                                <Clock className="size-3 text-[#5e9141]" aria-hidden="true" />
                                {schoolTime(ev.startsAt)}–{schoolTime(ev.endsAt)}
                              </span>
                              <span>·</span>
                              <span
                                className={
                                  isOnline && !ev.meetUrl
                                    ? 'text-amber-700 font-medium'
                                    : 'text-emerald-700 font-medium'
                                }
                              >
                                {isOnline
                                  ? ev.meetUrl
                                    ? 'Google Meet sẵn sàng'
                                    : 'Online (chờ link Meet)'
                                  : `Phòng ${ev.roomCode ?? 'tại lớp'}`}
                              </span>
                            </div>
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {/* Clear OPEN/CLOSE Assessment Milestones */}
            {visibleDeadlines.length > 0 && (
              <section className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm space-y-3">
                <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
                  <ClipboardCheck size={18} className="text-amber-600" aria-hidden="true" />
                  Lịch mở &amp; đóng bài kiểm tra
                </h2>
                <ul className="space-y-2">
                  {visibleDeadlines.map((d) => {
                    const isOpenMilestone = d.kind === 'OPEN';
                    return (
                      <li
                        key={d.key}
                        className="rounded-xl border border-slate-200/80 bg-[#fcfdfb] p-3 space-y-1"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-1.5">
                          <span
                            className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase ${
                              isOpenMilestone
                                ? 'bg-sky-50 text-sky-800 border border-sky-200'
                                : 'bg-amber-50 text-amber-900 border border-amber-200'
                            }`}
                          >
                            {isOpenMilestone ? 'Mở làm bài' : 'Hạn đóng đề'}
                          </span>
                          {d.submissionSummary && (
                            <span className="text-[11px] font-medium text-slate-500">
                              {d.submissionSummary}
                            </span>
                          )}
                        </div>
                        <p className="text-xs font-bold text-slate-900 leading-snug">{d.title}</p>
                        <p className="text-[11px] text-slate-500 truncate">{d.className}</p>
                        <div className="flex items-center justify-between pt-1">
                          <span className="text-[11px] font-semibold text-slate-700">
                            {formatDateVi(d.at)} · {schoolTime(d.at)}
                          </span>
                          <Link
                            to={`/instructor/classes/${d.classId}`}
                            className="text-xs font-semibold text-[#5e9141] hover:underline"
                          >
                            Kiểm tra →
                          </Link>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            {/* Consultations & Teaching Operations Shortcuts */}
            <section className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm space-y-3.5">
              <div className="flex items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
                  <MessageSquare size={18} className="text-[#5e9141]" aria-hidden="true" />
                  Tư vấn 1:1 &amp; Nghiệp vụ
                </h2>
                <Link to="/consultations" className="text-xs font-semibold text-[#5e9141] hover:underline">
                  Quản lý →
                </Link>
              </div>

              <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
                {(
                  [
                    ['ACTIVE', 'Cần xử lý / Sắp tới'],
                    ['ALL', 'Tất cả'],
                  ] as const
                ).map(([val, lbl]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setBookingScope(val)}
                    className={`rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                      bookingScope === val
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {lbl}
                  </button>
                ))}
              </div>

              {visibleBookings.length > 0 ? (
                <ul className="space-y-2">
                  {visibleBookings.map((b) => {
                    const info = consultationStateInfo[b.state] ?? {
                      label: b.state,
                      cls: 'border-slate-200 bg-slate-100 text-slate-700',
                    };
                    return (
                      <li
                        key={b.id}
                        className="rounded-xl border border-slate-200/80 bg-[#fcfdfb] p-3 space-y-1"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-semibold text-[#446b2f]">
                            {formatDateVi(b.startsAt)} · {schoolTime(b.startsAt)}
                          </span>
                          <span
                            className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${info.cls}`}
                          >
                            {info.label}
                          </span>
                        </div>
                        <p className="text-xs font-semibold text-slate-900 leading-snug">
                          {demoText(b.topic || 'Buổi tư vấn TOEIC 1:1')}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 p-3.5 text-xs text-slate-600">
                  Chưa có lịch hẹn tư vấn 1:1 nào trong mục đã chọn.
                </p>
              )}

              <div className="grid grid-cols-2 gap-2 pt-1">
                <Link
                  to="/instructor/requests"
                  className="rounded-xl border border-slate-200/80 bg-[#fcfdfb] p-3 transition hover:border-[#b7d3a6] hover:bg-[#f6faf3]"
                >
                  <Video className="size-4 text-[#5e9141]" aria-hidden="true" />
                  <p className="mt-2 text-xs font-bold text-slate-900">Duyệt link Meet</p>
                  <p className="mt-0.5 text-[11px] text-slate-500">Đề nghị phòng trực tuyến</p>
                </Link>
                <Link
                  to="/instructor/requests?tab=schedule"
                  className="rounded-xl border border-slate-200/80 bg-[#fcfdfb] p-3 transition hover:border-[#b7d3a6] hover:bg-[#f6faf3]"
                >
                  <CalendarDays className="size-4 text-[#d9621e]" aria-hidden="true" />
                  <p className="mt-2 text-xs font-bold text-slate-900">Đổi lịch / Dạy bù</p>
                  <p className="mt-0.5 text-[11px] text-slate-500">Nghỉ dạy &amp; điều chỉnh ca</p>
                </Link>
                <Link
                  to="/instructor/assessments-hub"
                  className="rounded-xl border border-slate-200/80 bg-[#fcfdfb] p-3 transition hover:border-[#b7d3a6] hover:bg-[#f6faf3]"
                >
                  <HelpCircle className="size-4 text-[#5e9141]" aria-hidden="true" />
                  <p className="mt-2 text-xs font-bold text-slate-900">Ngân hàng câu hỏi</p>
                  <p className="mt-0.5 text-[11px] text-slate-500">Soạn &amp; chọn câu hỏi</p>
                </Link>
                <Link
                  to="/consultations"
                  className="rounded-xl border border-slate-200/80 bg-[#fcfdfb] p-3 transition hover:border-[#b7d3a6] hover:bg-[#f6faf3]"
                >
                  <CheckCircle2 className="size-4 text-[#5e9141]" aria-hidden="true" />
                  <p className="mt-2 text-xs font-bold text-slate-900">Lịch nhận tư vấn</p>
                  <p className="mt-0.5 text-[11px] text-slate-500">Mở khung giờ 1:1</p>
                </Link>
              </div>
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}
