import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import {
  Award,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Compass,
  CreditCard,
  Filter,
  GraduationCap,
  Headphones,
  Layers,
  PlayCircle,
  RefreshCw,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import { useAuth } from '@/features/auth/auth-context';
import { accountLabel } from '@/features/catalog/record-presentation';
import { demoText } from '@/features/demo/presentation';
import { enrollmentApi } from '@/features/enrollments/api';
import type { EnrollmentView } from '@/features/enrollments/types';
import { learnerClassLabel, learnerCourseLabel } from '@/features/enrollments/presentation';
import { apiFetch } from '@/lib/api-client';
import {
  classLmsApi,
  type Activity,
  type CalendarEvent,
  type ClassTree,
} from '@/features/class-lms/api';
import { learningApi } from '@/features/learning/api';
import type { CourseContent, CourseProgress } from '@/features/learning/types';
import { calendarItems, type DayEvent } from '@/features/class-lms/calendar-events';
import { schoolDay, schoolMonth, schoolTime, shiftMonth } from '@/features/class-lms/month';
import { learnerFinance, type LearnerFinance } from './finance-api';
import type { UnifiedFinanceResponse } from './UnifiedStudentFinancePanel';
import { vnd } from '@/features/admissions/api';
import type { ClassProgress } from '@/features/product/api';

type ClassWork = {
  enrollment: EnrollmentView;
  tree?: ClassTree;
  content?: CourseContent;
  progress?: CourseProgress;
  activityProgress?: ClassProgress;
};

type TaskKindFilter = 'ALL' | 'ASSIGNMENT' | 'EXAM' | 'ATTENDANCE';
type TaskStatusFilter = 'PENDING' | 'OVERDUE' | 'DONE' | 'ALL';
type TaskSortMode = 'DUE_ASC' | 'CLASS';
type ScheduleRangeFilter = 'TODAY' | '7D' | '30D';
type ScheduleKindFilter = 'ALL' | 'SESSION' | 'DEADLINE';

type ResumeLessonItem = {
  id: string;
  classId: string;
  className: string;
  sectionTitle: string;
  title: string;
  kindLabel: string;
  status: 'IN_PROGRESS' | 'NOT_STARTED';
  to: string;
};

type DashboardTaskItem = {
  id: string;
  classId: string;
  className: string;
  sectionTitle: string;
  title: string;
  kind: Exclude<TaskKindFilter, 'ALL'>;
  kindLabel: string;
  statusLabel: string;
  isDone: boolean;
  isOverdue: boolean;
  isUpcomingWindow: boolean;
  availableFrom: string | null;
  due: string | null;
  scoreLabel: string | null;
  to: string;
};

type ScheduleEntry = DayEvent & {
  classId: string;
  effectiveAt: string;
  isDeadlineEvent: boolean;
};

type FinanceApiPayload = {
  data: LearnerFinance[];
  unified?: UnifiedFinanceResponse;
};

const DAY_MS = 86_400_000;

function cleanTitle(raw?: string | null): string {
  if (!raw) return '';
  return demoText(raw);
}

function isLeftoverQaTitle(raw?: string | null): boolean {
  if (!raw) return false;
  return /(?:E2E|Q04)-\d{6}/.test(raw);
}

function getProgressEntries(progress?: ClassProgress) {
  if (!progress) return [];
  if (Array.isArray(progress.entries)) return progress.entries;
  const nested = (progress.activityProgress as { entries?: ClassProgress['entries'] } | undefined)
    ?.entries;
  return Array.isArray(nested) ? nested : [];
}

function resolveClassSummary(w: ClassWork) {
  const s = w.activityProgress?.summary;
  const ap = w.activityProgress?.activityProgress;
  if (s && s.totalActivities > 0) {
    const percent = Math.min(
      100,
      Math.round((s.completedOrSubmittedCount / s.totalActivities) * 100),
    );
    return {
      completed: s.completedOrSubmittedCount,
      total: s.totalActivities,
      percent,
      publishedGradesCount: s.publishedGradesCount ?? 0,
      attendanceCheckedCount: s.attendanceCheckedCount ?? 0,
    };
  }
  if (ap && ap.openActivitiesCount > 0) {
    const percent =
      ap.completionRatioPercent ??
      Math.min(100, Math.round((ap.completedOrSubmittedCount / ap.openActivitiesCount) * 100));
    return {
      completed: ap.completedOrSubmittedCount,
      total: ap.openActivitiesCount,
      percent,
      publishedGradesCount: 0,
      attendanceCheckedCount: 0,
    };
  }
  const p = w.enrollment.progress;
  const completed = p?.completedLessons ?? 0;
  const total = p?.totalLessons ?? 0;
  const percent = p?.progressPercent ?? (total > 0 ? Math.round((completed / total) * 100) : 0);
  return {
    completed,
    total,
    percent: w.enrollment.status === 'COMPLETED' ? 100 : percent,
    publishedGradesCount: 0,
    attendanceCheckedCount: 0,
  };
}

function classifyActivityKind(
  act: Activity,
  entry?: ClassProgress['entries'][number],
): 'LESSON' | Exclude<TaskKindFilter, 'ALL'> {
  if (entry?.localKind === 'ATTENDANCE' || /^Điểm danh\b/i.test(act.title)) {
    return 'ATTENDANCE';
  }
  if (
    act.type === 'QUIZ' ||
    entry?.localKind === 'LOCAL_QUIZ' ||
    ['REGULAR', 'MIDTERM', 'FINAL'].includes(entry?.assessmentKind ?? '')
  ) {
    return 'EXAM';
  }
  if (act.type === 'ASSIGNMENT') {
    return 'ASSIGNMENT';
  }
  return 'LESSON';
}

function kindMeta(kind: Exclude<TaskKindFilter, 'ALL'>, entry?: ClassProgress['entries'][number]) {
  if (kind === 'ATTENDANCE') return 'Điểm danh';
  if (kind === 'ASSIGNMENT') return 'Bài tập';
  if (entry?.assessmentKind === 'MIDTERM') return 'Giữa kỳ';
  if (entry?.assessmentKind === 'FINAL') return 'Cuối kỳ';
  if (entry?.assessmentKind === 'REGULAR') return 'Thường kỳ';
  return 'Quiz / Kiểm tra';
}

function formatDueBadge(iso: string | null, nowMs: number, isDone: boolean) {
  if (!iso) return { text: 'Không giới hạn', tone: 'text-slate-500 bg-slate-100' };
  const targetMs = new Date(iso).getTime();
  if (!Number.isFinite(targetMs)) {
    return { text: 'Đang cập nhật', tone: 'text-slate-500 bg-slate-100' };
  }
  const dateText = `${schoolDay(iso).split('-').reverse().join('/')} · ${schoolTime(iso)}`;
  if (isDone) {
    return { text: `Hạn ${dateText}`, tone: 'text-slate-600 bg-slate-100' };
  }
  const diffDays = Math.ceil((targetMs - nowMs) / DAY_MS);
  if (targetMs < nowMs) {
    return { text: `Quá hạn (${dateText})`, tone: 'text-rose-800 bg-rose-50 border border-rose-200' };
  }
  if (diffDays <= 1) {
    return { text: `Hôm nay · ${schoolTime(iso)}`, tone: 'text-amber-900 bg-amber-50 border border-amber-200' };
  }
  if (diffDays <= 7) {
    return { text: `Còn ${diffDays} ngày · ${schoolDay(iso).slice(5).split('-').reverse().join('/')}`, tone: 'text-[#446b2f] bg-[#edf5e8] border border-[#c7dfba]' };
  }
  return { text: `Hạn ${dateText}`, tone: 'text-slate-600 bg-slate-100' };
}

function buildResumeLessons(work: ClassWork[]): ResumeLessonItem[] {
  const items: ResumeLessonItem[] = [];
  const seen = new Set<string>();

  for (const w of work) {
    if (w.enrollment.status === 'COMPLETED') continue;
    const classId = w.enrollment.classOffering.id;
    const className = learnerClassLabel(
      w.enrollment.classOffering.name,
      w.enrollment.classOffering.code,
      w.enrollment.classOffering.course.title,
    );
    const entryById = new Map(getProgressEntries(w.activityProgress).map((x) => [x.activityId, x]));

    for (const sec of w.tree?.sections ?? []) {
      const secTitle = cleanTitle(sec.title);
      for (const act of sec.activities ?? []) {
        if (isLeftoverQaTitle(act.title)) continue;
        const entry = entryById.get(act.id);
        if (classifyActivityKind(act, entry) !== 'LESSON') continue;
        if (act.progress === 'COMPLETED' || entry?.state === 'COMPLETED') continue;
        const dedupeKey = `act:${act.id}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        items.push({
          id: dedupeKey,
          classId,
          className,
          sectionTitle: secTitle || 'Nội dung khóa học',
          title: cleanTitle(act.title),
          kindLabel: act.type === 'RESOURCE' ? 'Tài liệu' : 'Bài học',
          status: act.progress === 'IN_PROGRESS' || entry?.state === 'IN_PROGRESS' ? 'IN_PROGRESS' : 'NOT_STARTED',
          to: `/classroom/${classId}/activities/${act.id}`,
        });
      }
    }

    for (const mod of w.content?.modules ?? []) {
      for (const lesson of mod.lessons ?? []) {
        if (isLeftoverQaTitle(lesson.title)) continue;
        if (lesson.progressStatus === 'COMPLETED') continue;
        const dedupeKey = `lesson:${w.enrollment.id}:${lesson.id}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        items.push({
          id: dedupeKey,
          classId,
          className,
          sectionTitle: cleanTitle(mod.title) || 'Học phần',
          title: cleanTitle(lesson.title),
          kindLabel: 'Bài học',
          status: lesson.progressStatus === 'IN_PROGRESS' ? 'IN_PROGRESS' : 'NOT_STARTED',
          to: `/learning/${w.enrollment.id}/lessons/${lesson.id}`,
        });
      }
    }
  }

  return items.sort((a, b) => {
    if (a.status !== b.status) return a.status === 'IN_PROGRESS' ? -1 : 1;
    return 0;
  });
}

function buildDashboardTasks(work: ClassWork[], nowMs: number): DashboardTaskItem[] {
  const tasks: DashboardTaskItem[] = [];
  const seenActivityIds = new Set<string>();

  for (const w of work) {
    const classId = w.enrollment.classOffering.id;
    const className = learnerClassLabel(
      w.enrollment.classOffering.name,
      w.enrollment.classOffering.code,
      w.enrollment.classOffering.course.title,
    );
    const entryById = new Map(getProgressEntries(w.activityProgress).map((x) => [x.activityId, x]));

    for (const sec of w.tree?.sections ?? []) {
      const secTitle = cleanTitle(sec.title);
      for (const act of sec.activities ?? []) {
        if (isLeftoverQaTitle(act.title)) continue;
        const entry = entryById.get(act.id);
        const kind = classifyActivityKind(act, entry);
        if (kind === 'LESSON') continue;

        seenActivityIds.add(act.id);
        const entryState = entry?.state;
        const isEntrySubmitted =
          entryState !== undefined && !['NOT_STARTED', 'IN_PROGRESS'].includes(entryState);
        const isQuizType = act.type === 'QUIZ' || kind === 'EXAM';
        const isDone =
          act.submissionState === 'SUBMITTED' ||
          act.progress === 'COMPLETED' ||
          entryState === 'COMPLETED' ||
          entryState === 'PENDING_RELEASE' ||
          entryState === 'PENDING_REVIEW' ||
          entryState === 'PUBLISHED' ||
          (isQuizType && isEntrySubmitted);

        const due = act.availableUntil ?? null;
        const dueMs = due ? new Date(due).getTime() : NaN;
        const isOverdue = !isDone && Number.isFinite(dueMs) && dueMs < nowMs;
        const isUpcomingWindow =
          !isDone &&
          Boolean(act.availableFrom) &&
          Number.isFinite(new Date(act.availableFrom!).getTime()) &&
          new Date(act.availableFrom!).getTime() > nowMs;

        const scoreLabel =
          entry?.score !== undefined &&
          entry?.score !== null &&
          entry?.maxScore !== undefined &&
          entry?.maxScore !== null
            ? `${entry.score}/${entry.maxScore} điểm`
            : null;

        let statusLabel = 'Chưa làm';
        if (isDone) {
          if (entryState === 'PENDING_REVIEW' || entryState === 'PENDING_RELEASE') {
            statusLabel = 'Đã nộp · Chờ công bố';
          } else if (scoreLabel) {
            statusLabel = `Đã hoàn thành (${scoreLabel})`;
          } else {
            statusLabel = 'Đã hoàn thành';
          }
        } else if (isUpcomingWindow && act.availableFrom) {
          statusLabel = `Mở ${schoolDay(act.availableFrom).slice(5).split('-').reverse().join('/')} · ${schoolTime(act.availableFrom)}`;
        } else if (entryState === 'IN_PROGRESS' || act.progress === 'IN_PROGRESS') {
          statusLabel = 'Đang làm dở';
        } else if (isOverdue) {
          statusLabel = 'Quá hạn';
        }

        tasks.push({
          id: `act:${act.id}`,
          classId,
          className,
          sectionTitle: secTitle || 'Hoạt động lớp học',
          title: cleanTitle(act.title),
          kind,
          kindLabel: kindMeta(kind, entry),
          statusLabel,
          isDone,
          isOverdue,
          isUpcomingWindow,
          availableFrom: act.availableFrom ?? null,
          due,
          scoreLabel,
          to: `/classroom/${classId}/activities/${act.id}`,
        });
      }
    }

    // Legacy / course-level assessments from /learning/enrollments/:id/progress or mocked class progress
    const rawLegacyAssessments = w.progress?.assessments ?? [];
    for (const a of rawLegacyAssessments) {
      const legacyItem = a as typeof a & { assessmentId?: string; attemptStatus?: string };
      const resolvedAssessmentId = legacyItem.assessmentId ?? a.id;
      if (seenActivityIds.has(resolvedAssessmentId) || isLeftoverQaTitle(a.title)) continue;
      seenActivityIds.add(resolvedAssessmentId);
      const isDone =
        legacyItem.attemptStatus === 'SUBMITTED' ||
        legacyItem.attemptStatus === 'GRADED' ||
        a.status === 'COMPLETED';
      const due = a.closeAt ?? null;
      const dueMs = due ? new Date(due).getTime() : NaN;
      const isOverdue = !isDone && Number.isFinite(dueMs) && dueMs < nowMs;
      tasks.push({
        id: `legacy-test:${w.enrollment.id}:${resolvedAssessmentId}`,
        classId,
        className,
        sectionTitle: 'Đánh giá học phần',
        title: cleanTitle(a.title),
        kind: 'EXAM',
        kindLabel: 'Bài kiểm tra',
        statusLabel: isDone ? 'Đã nộp' : isOverdue ? 'Quá hạn' : 'Chưa làm',
        isDone,
        isOverdue,
        isUpcomingWindow: false,
        availableFrom: null,
        due,
        scoreLabel: null,
        to: `/student/enrollments/${w.enrollment.id}/tests`,
      });
    }
  }

  return tasks;
}

export function StudentDashboard() {
  const { user } = useAuth();
  const [enrollments, setEnrollments] = useState<EnrollmentView[]>();
  const [work, setWork] = useState<ClassWork[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [finance, setFinance] = useState<LearnerFinance[]>([]);
  const [unifiedFinance, setUnifiedFinance] = useState<UnifiedFinanceResponse | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [tick, setTick] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [loading, setLoading] = useState(true);

  // Interactive workspace filters
  const [selectedClassId, setSelectedClassId] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [taskKindFilter, setTaskKindFilter] = useState<TaskKindFilter>('ALL');
  const [taskStatusFilter, setTaskStatusFilter] = useState<TaskStatusFilter>('PENDING');
  const [taskSort, setTaskSort] = useState<TaskSortMode>('DUE_ASC');
  const [scheduleRange, setScheduleRange] = useState<ScheduleRangeFilter>('7D');
  const [scheduleKind, setScheduleKind] = useState<ScheduleKindFilter>('ALL');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setErrors([]);

    void (async () => {
      const m = schoolMonth();
      const [er, calThis, calNext, fin] = await Promise.allSettled([
        enrollmentApi.listMine(),
        apiFetch<{ data?: CalendarEvent[] }>('/v2/my/calendar?month=' + m),
        apiFetch<{ data?: CalendarEvent[] }>('/v2/my/calendar?month=' + shiftMonth(m, 1)),
        learnerFinance() as unknown as Promise<FinanceApiPayload>,
      ]);

      if (!active) return;

      const nextErrors: string[] = [];
      if (er.status === 'rejected') nextErrors.push('Không tải được danh sách lớp học.');
      if (calThis.status === 'rejected' && calNext.status === 'rejected') {
        nextErrors.push('Không tải được lịch học.');
      }

      const enrolledList = er.status === 'fulfilled' ? er.value : [];
      setEnrollments(enrolledList);
      setEvents([
        ...(calThis.status === 'fulfilled' ? calThis.value.data ?? [] : []),
        ...(calNext.status === 'fulfilled' ? calNext.value.data ?? [] : []),
      ]);

      if (fin.status === 'fulfilled') {
        setFinance(fin.value.data ?? []);
        setUnifiedFinance(fin.value.unified ?? null);
      } else {
        setFinance([]);
        setUnifiedFinance(null);
      }

      // Only query owned ACTIVE or COMPLETED classes — never PENDING_PAYMENT
      const owned = enrolledList
        .filter((e) => e.status === 'ACTIVE' || e.status === 'COMPLETED')
        .sort((a, b) => (a.status === 'ACTIVE' ? 0 : 1) - (b.status === 'ACTIVE' ? 0 : 1));

      const details = await Promise.all(
        owned.map(async (enrollment): Promise<ClassWork> => {
          const isActiveEnrollment = enrollment.status === 'ACTIVE';
          const [tree, activityProgress, content, progress] = await Promise.allSettled([
            classLmsApi.get<ClassTree>(enrollment.classOffering.id),
            classLmsApi.get<ClassProgress>(enrollment.classOffering.id, 'progress'),
            isActiveEnrollment ? learningApi.getContent(enrollment.id) : Promise.resolve(undefined),
            isActiveEnrollment
              ? learningApi.getProgress(enrollment.id)
              : Promise.resolve(undefined),
          ]);
          if (
            isActiveEnrollment &&
            tree.status === 'rejected' &&
            content.status === 'rejected'
          ) {
            nextErrors.push(`Không tải được nội dung lớp ${enrollment.classOffering.name}.`);
          }
          return {
            enrollment,
            tree: tree.status === 'fulfilled' ? tree.value : undefined,
            activityProgress:
              activityProgress.status === 'fulfilled' ? activityProgress.value : undefined,
            content: content.status === 'fulfilled' ? content.value : undefined,
            progress: progress.status === 'fulfilled' ? progress.value : undefined,
          };
        }),
      );

      if (!active) return;
      setWork(details);
      setErrors(nextErrors);
      setNow(Date.now());
      setLoading(false);
    })();

    return () => {
      active = false;
    };
  }, [user?.id, tick]);

  const activeWork = useMemo(
    () => work.filter((w) => w.enrollment.status === 'ACTIVE'),
    [work],
  );
  const completedWork = useMemo(
    () => work.filter((w) => w.enrollment.status === 'COMPLETED'),
    [work],
  );
  const pendingEnrollments = useMemo(
    () => (enrollments ?? []).filter((e) => e.status === 'PENDING_PAYMENT'),
    [enrollments],
  );

  // If the previously selected class disappears on refresh/account change, reset cleanly
  const effectiveClassId = useMemo(() => {
    if (selectedClassId === 'ALL') return 'ALL';
    return work.some((w) => w.enrollment.classOffering.id === selectedClassId)
      ? selectedClassId
      : 'ALL';
  }, [selectedClassId, work]);

  const resumeLessonsAll = useMemo(() => buildResumeLessons(work), [work]);
  const allTasks = useMemo(() => buildDashboardTasks(work, now), [work, now]);

  const issuedCertCount = useMemo(
    () =>
      work.filter(
        (w) =>
          Boolean(
            w.activityProgress?.q05Completion?.certificateCode &&
              w.activityProgress?.q05Completion?.certificateState === 'ISSUED',
          ) ||
          w.activityProgress?.certificateIssued ||
          w.enrollment.status === 'COMPLETED',
      ).length,
    [work],
  );

  // Pending exercises/quizzes badge count (excludes attendance not yet opened)
  const pendingExerciseCount = useMemo(
    () =>
      allTasks.filter(
        (t) => !t.isDone && (t.kind === 'ASSIGNMENT' || t.kind === 'EXAM'),
      ).length,
    [allTasks],
  );
  const overdueTaskCount = useMemo(
    () => allTasks.filter((t) => !t.isDone && t.isOverdue).length,
    [allTasks],
  );

  // Overall progress across active + completed classes
  const overallProgressPercent = useMemo(() => {
    if (work.length === 0) return 0;
    let totalDone = 0;
    let totalItems = 0;
    for (const w of work) {
      const s = resolveClassSummary(w);
      totalDone += s.completed;
      totalItems += s.total;
    }
    if (totalItems === 0) return 0;
    return Math.min(100, Math.round((totalDone / totalItems) * 100));
  }, [work]);

  // Unified schedule entries mapped back to classId for class filter support
  const allScheduleEntries = useMemo<ScheduleEntry[]>(() => {
    const classByEventId = new Map<string, string>();
    const filteredRaw = events.filter((e) => !isLeftoverQaTitle(e.title));
    for (const e of filteredRaw) {
      if (e.classOffering?.id) classByEventId.set(e.id, e.classOffering.id);
    }
    return calendarItems(filteredRaw, [])
      .map((item) => {
        const effectiveAt = item.deadline ?? item.startsAt;
        const isDeadlineEvent = Boolean(item.deadline) || ['ASSIGNMENT', 'QUIZ', 'REGULAR', 'MIDTERM', 'FINAL', 'ASSESSMENT'].includes(item.source);
        return {
          ...item,
          title: cleanTitle(item.title),
          classId: classByEventId.get(item.id) ?? '',
          effectiveAt,
          isDeadlineEvent,
        };
      })
      .sort((a, b) => new Date(a.effectiveAt).getTime() - new Date(b.effectiveAt).getTime());
  }, [events]);

  const upcoming7dCount = useMemo(() => {
    const end = now + 7 * DAY_MS;
    const seen = new Set<string>();
    let count = 0;
    for (const item of allScheduleEntries) {
      const ms = new Date(item.effectiveAt).getTime();
      if (!Number.isFinite(ms) || ms < now - 3600_000 || ms > end) continue;
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      count++;
    }
    return count;
  }, [allScheduleEntries, now]);

  // Finance KPI summary
  const financeStatusSummary = useMemo(() => {
    if (unifiedFinance) {
      const { unpaidOrHeldCount, paidCount, exceptionCount } = unifiedFinance.summary;
      if (unpaidOrHeldCount > 0 || exceptionCount > 0) {
        return {
          headline: `${unpaidOrHeldCount + exceptionCount} khoản cần xử lý`,
          sub: paidCount > 0 ? `${paidCount} lớp đã hoàn tất học phí` : 'Xem hạn giữ chỗ & QR chuyển khoản',
          tone: 'amber' as const,
        };
      }
      if (paidCount > 0) {
        return {
          headline: `${paidCount} lớp đã đóng đủ`,
          sub: issuedCertCount > 0 ? `${issuedCertCount} chứng chỉ đã sẵn sàng` : 'Không còn công nợ học phí',
          tone: 'emerald' as const,
        };
      }
    }
    const pendingLegacy = finance.filter((f) => f.state === 'PENDING').length;
    const paidLegacy = finance.filter((f) => f.state === 'APPROVED').length;
    if (pendingLegacy > 0 || pendingEnrollments.length > 0) {
      return {
        headline: `${pendingLegacy + pendingEnrollments.length} khoản chờ thanh toán`,
        sub: 'Hoàn tất để mở toàn bộ quyền học lớp',
        tone: 'amber' as const,
      };
    }
    if (paidLegacy > 0) {
      return {
        headline: `${paidLegacy} hồ sơ đã xác nhận`,
        sub: issuedCertCount > 0 ? `${issuedCertCount} chứng chỉ đã đạt` : 'Học phí đã hoàn tất',
        tone: 'emerald' as const,
      };
    }
    return {
      headline: issuedCertCount > 0 ? `${issuedCertCount} chứng chỉ` : 'Không có công nợ',
      sub: issuedCertCount > 0 ? 'Xem tiến độ và tải chứng chỉ' : 'Xem chi tiết học phí & chứng chỉ',
      tone: 'slate' as const,
    };
  }, [unifiedFinance, finance, pendingEnrollments.length, issuedCertCount]);

  // Filtered views driven by the unified filter bar & section controls
  const q = searchQuery.trim().toLowerCase();

  const visibleWork = useMemo(
    () =>
      work.filter((w) => {
        if (effectiveClassId !== 'ALL' && w.enrollment.classOffering.id !== effectiveClassId) {
          return false;
        }
        if (!q) return true;
        const label = learnerClassLabel(
          w.enrollment.classOffering.name,
          w.enrollment.classOffering.code,
          w.enrollment.classOffering.course.title,
        );
        return (
          label.toLowerCase().includes(q) ||
          w.enrollment.classOffering.code.toLowerCase().includes(q)
        );
      }),
    [work, effectiveClassId, q],
  );

  const visibleResumeLessons = useMemo(
    () =>
      resumeLessonsAll.filter((item) => {
        if (effectiveClassId !== 'ALL' && item.classId !== effectiveClassId) return false;
        if (!q) return true;
        return (
          item.title.toLowerCase().includes(q) ||
          item.sectionTitle.toLowerCase().includes(q) ||
          item.className.toLowerCase().includes(q)
        );
      }),
    [resumeLessonsAll, effectiveClassId, q],
  );

  const scopedTasks = useMemo(
    () =>
      allTasks.filter((t) => {
        if (effectiveClassId !== 'ALL' && t.classId !== effectiveClassId) return false;
        if (
          q &&
          !t.title.toLowerCase().includes(q) &&
          !t.sectionTitle.toLowerCase().includes(q) &&
          !t.className.toLowerCase().includes(q)
        ) {
          return false;
        }
        return true;
      }),
    [allTasks, effectiveClassId, q],
  );

  const visibleTasks = useMemo(() => {
    const filtered = scopedTasks.filter((t) => {
      if (taskKindFilter !== 'ALL' && t.kind !== taskKindFilter) return false;
      if (taskStatusFilter === 'PENDING') return !t.isDone;
      if (taskStatusFilter === 'OVERDUE') return !t.isDone && t.isOverdue;
      if (taskStatusFilter === 'DONE') return t.isDone;
      return true;
    });
    return [...filtered].sort((a, b) => {
      if (taskSort === 'CLASS') {
        return a.className.localeCompare(b.className, 'vi');
      }
      const aDue = a.due ? new Date(a.due).getTime() : Number.MAX_SAFE_INTEGER;
      const bDue = b.due ? new Date(b.due).getTime() : Number.MAX_SAFE_INTEGER;
      if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1;
      if (aDue !== bDue) return aDue - bDue;
      return a.title.localeCompare(b.title, 'vi');
    });
  }, [scopedTasks, taskKindFilter, taskStatusFilter, taskSort]);

  const visibleSchedule = useMemo(() => {
    const todayIso = schoolDay(new Date(now).toISOString());
    const horizonDays = scheduleRange === 'TODAY' ? 1 : scheduleRange === '7D' ? 7 : 30;
    const endMs = now + horizonDays * DAY_MS;

    return allScheduleEntries
      .filter((item) => {
        if (effectiveClassId !== 'ALL' && item.classId !== effectiveClassId) return false;
        if (scheduleKind === 'SESSION' && item.source !== 'TEACHING_SESSION') return false;
        if (scheduleKind === 'DEADLINE' && item.source === 'TEACHING_SESSION') return false;
        const ms = new Date(item.effectiveAt).getTime();
        if (!Number.isFinite(ms)) return false;
        if (scheduleRange === 'TODAY') {
          return schoolDay(item.effectiveAt) === todayIso;
        }
        if (ms < now - 3600_000 || ms > endMs) return false;
        if (q && !item.title.toLowerCase().includes(q) && !(item.className ?? '').toLowerCase().includes(q)) {
          return false;
        }
        return true;
      })
      .slice(0, 8);
  }, [allScheduleEntries, effectiveClassId, scheduleKind, scheduleRange, now, q]);

  const primaryResumeAction =
    resumeLessonsAll[0]?.to ??
    (activeWork[0] ? `/classroom/${activeWork[0].enrollment.classOffering.id}` : '/student/enrollments');

  const hasAnyActiveFilter =
    effectiveClassId !== 'ALL' ||
    q.length > 0 ||
    taskKindFilter !== 'ALL' ||
    taskStatusFilter !== 'PENDING';

  const resetAllFilters = () => {
    setSelectedClassId('ALL');
    setSearchQuery('');
    setTaskKindFilter('ALL');
    setTaskStatusFilter('PENDING');
  };

  const displayName = user ? accountLabel(user.fullName) : 'Học viên';

  return (
    <div className="min-h-screen bg-[#f6f8f5] pb-12">
      <div className="mx-auto max-w-[1280px] space-y-6 px-4 pt-6 sm:px-6 lg:px-8">
        {/* Hero Overview Banner */}
        <section className="relative overflow-hidden rounded-2xl border border-[#dce8d5] bg-gradient-to-br from-white via-[#f9fcf7] to-[#eef5e9] p-6 shadow-sm">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-2 max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-[#cde0c2] bg-[#edf5e8] px-3 py-1 text-xs font-semibold text-[#446b2f]">
                <Sparkles className="size-3.5" aria-hidden="true" />
                Trang chủ học tập · Smart English LMS
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                Chào {displayName}, sẵn sàng cho mục tiêu TOEIC hôm nay
              </h1>
              <p className="text-sm text-slate-600">
                {loading
                  ? 'Đang tổng hợp tiến độ lớp học, bài tập và lịch trình mới nhất...'
                  : `${activeWork.length} lớp đang theo học · ${completedWork.length} lớp đã hoàn thành · ${pendingExerciseCount} bài tập & kiểm tra cần xử lý`}
              </p>

              {!loading && work.length > 0 && (
                <div className="pt-2 max-w-md">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-600 mb-1.5">
                    <span>Tiến độ học tập trung bình toàn khóa</span>
                    <span className="text-[#446b2f]">{overallProgressPercent}%</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-[#dce8d5]">
                    <div
                      className="h-full rounded-full bg-[#5e9141] transition-all duration-500"
                      style={{ width: `${overallProgressPercent}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <Link
                to={primaryResumeAction}
                className="inline-flex items-center gap-2 rounded-xl bg-[#5e9141] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#4d7735]"
              >
                <PlayCircle className="size-4" aria-hidden="true" />
                Tiếp tục học ngay
              </Link>
              <Link
                to="/student/enrollments"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                <BookOpen className="size-4 text-[#5e9141]" aria-hidden="true" />
                Danh sách lớp học
              </Link>
              <Link
                to="/my/calendar"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                <CalendarClock className="size-4 text-[#5e9141]" aria-hidden="true" />
                Bảng điều khiển lịch
              </Link>
              <button
                type="button"
                onClick={() => setTick((t) => t + 1)}
                aria-label="Làm mới bảng học tập"
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
              >
                <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
                Tải lại
              </button>
            </div>
          </div>
        </section>

        {errors.length > 0 && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
            {errors.join(' ')}
          </div>
        )}

        {/* 4 Actionable KPI Cards */}
        <section aria-label="Tổng quan nhanh" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Link
            to="/student/enrollments"
            className="group rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-[#b7d3a6]"
          >
            <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-500">
              <span>Lớp đang theo học</span>
              <span className="flex size-8 items-center justify-center rounded-lg bg-[#edf5e8] text-[#5e9141]">
                <GraduationCap className="size-4" aria-hidden="true" />
              </span>
            </div>
            <p className="mt-3 text-3xl font-bold text-slate-900">{activeWork.length}</p>
            <p className="mt-1 text-xs text-slate-600">
              {completedWork.length > 0
                ? `${completedWork.length} lớp đã hoàn thành 100%`
                : 'Mở lớp đang học hoặc xem tất cả'}
            </p>
          </Link>

          <a
            href="#assignments"
            className="group rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-amber-300"
          >
            <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-500">
              <span>Bài tập cần hoàn thành</span>
              <span className="flex size-8 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
                <ClipboardCheck className="size-4" aria-hidden="true" />
              </span>
            </div>
            <p className="mt-3 text-3xl font-bold text-slate-900">{pendingExerciseCount}</p>
            <p className="mt-1 text-xs text-slate-600">
              {overdueTaskCount > 0 ? (
                <span className="font-semibold text-rose-700">{overdueTaskCount} mục đã quá hạn</span>
              ) : pendingExerciseCount > 0 ? (
                'Nhấn để lọc và làm ngay'
              ) : (
                'Bạn đã hoàn thành toàn bộ bài được giao'
              )}
            </p>
          </a>

          <Link
            to="/my/calendar"
            className="group rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-sky-300"
          >
            <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-500">
              <span>Lịch & hạn 7 ngày tới</span>
              <span className="flex size-8 items-center justify-center rounded-lg bg-sky-50 text-sky-700">
                <CalendarClock className="size-4" aria-hidden="true" />
              </span>
            </div>
            <p className="mt-3 text-3xl font-bold text-slate-900">{upcoming7dCount}</p>
            <p className="mt-1 text-xs text-slate-600">
              Buổi học trực tiếp, lịch thi & hạn nộp gần nhất
            </p>
          </Link>

          <Link
            to={issuedCertCount > 0 && pendingEnrollments.length === 0 ? '/my/progress' : '/student/finance'}
            className="group rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-[#b7d3a6]"
          >
            <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-500">
              <span>Học phí & Chứng chỉ</span>
              <span
                className={`flex size-8 items-center justify-center rounded-lg ${
                  financeStatusSummary.tone === 'amber'
                    ? 'bg-amber-50 text-amber-700'
                    : 'bg-emerald-50 text-emerald-700'
                }`}
              >
                {issuedCertCount > 0 && financeStatusSummary.tone !== 'amber' ? (
                  <Award className="size-4" aria-hidden="true" />
                ) : (
                  <CreditCard className="size-4" aria-hidden="true" />
                )}
              </span>
            </div>
            <p className="mt-3 text-lg font-bold text-slate-900 leading-snug">
              {financeStatusSummary.headline}
            </p>
            <p className="mt-1 text-xs text-slate-600">{financeStatusSummary.sub}</p>
          </Link>
        </section>

        {/* Global Interactive Class + Search Filter Bar */}
        <section
          aria-label="Bộ lọc không gian học tập"
          className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm space-y-3"
        >
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <Filter className="size-4 text-[#5e9141]" aria-hidden="true" />
              <span>Lọc nhanh theo lớp học & nội dung</span>
              {hasAnyActiveFilter && (
                <button
                  type="button"
                  onClick={resetAllFilters}
                  className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700 hover:bg-slate-200"
                >
                  <X className="size-3" aria-hidden="true" />
                  Đặt lại bộ lọc
                </button>
              )}
            </div>

            <div className="relative w-full md:w-72">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm bài học, bài tập, kiểm tra..."
                aria-label="Tìm bài học, bài tập, kiểm tra"
                className="w-full rounded-xl border border-slate-200 bg-slate-50/70 py-2 pl-9 pr-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-[#5e9141] focus:bg-white focus:outline-none"
              />
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
              Tất cả lớp ({work.length})
            </button>
            {work.map((w) => {
              const cid = w.enrollment.classOffering.id;
              const sum = resolveClassSummary(w);
              const active = effectiveClassId === cid;
              return (
                <button
                  key={cid}
                  type="button"
                  onClick={() => setSelectedClassId(cid)}
                  className={`inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                    active
                      ? 'bg-[#5e9141] text-white shadow-sm'
                      : 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <span className="truncate max-w-[200px]">
                    {learnerClassLabel(
                      w.enrollment.classOffering.name,
                      w.enrollment.classOffering.code,
                      w.enrollment.classOffering.course.title,
                    )}
                  </span>
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[11px] ${
                      active ? 'bg-white/20 text-white' : 'bg-white text-slate-600'
                    }`}
                  >
                    {sum.percent}%
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Main 2-Column Workspace */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Left Column: Classes, Quick Resume, Filterable Tasks */}
          <div className="space-y-6 lg:col-span-8">
            {/* My Classes Progress Section */}
            <section className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Lớp học & Tiến độ</h2>
                  <p className="text-xs text-slate-500">
                    Theo dõi tỷ lệ hoàn thành hoạt động, điểm đã công bố và chứng chỉ
                  </p>
                </div>
                <Link
                  to="/student/enrollments"
                  className="text-xs font-semibold text-[#5e9141] hover:underline"
                >
                  Xem toàn bộ lớp →
                </Link>
              </div>

              {loading ? (
                <p className="text-sm text-slate-500">Đang tải tiến độ lớp học...</p>
              ) : visibleWork.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 p-6 text-center text-sm text-slate-600">
                  Không có lớp học phù hợp với từ khóa lọc hiện tại.{' '}
                  <Link to="/student/enrollments" className="font-semibold text-[#5e9141] underline">
                    Khám phá lớp đang mở
                  </Link>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
                  {visibleWork.map((w) => {
                    const c = w.enrollment.classOffering;
                    const sum = resolveClassSummary(w);
                    const q05 = w.activityProgress?.q05Completion;
                    const isCompleted = w.enrollment.status === 'COMPLETED';
                    const hasCert = Boolean(
                      q05?.certificateCode && q05.certificateState === 'ISSUED',
                    );
                    return (
                      <article
                        key={w.enrollment.id}
                        className="flex flex-col justify-between rounded-xl border border-slate-200 bg-[#fcfdfb] p-4 transition hover:border-[#b7d3a6]"
                      >
                        <div className="space-y-2.5">
                          <div className="flex items-start justify-between gap-2">
                            <span
                              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                                isCompleted
                                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                  : 'bg-[#edf5e8] text-[#446b2f] border border-[#cde0c2]'
                              }`}
                            >
                              {isCompleted ? 'Đã hoàn thành' : 'Đang học'}
                            </span>
                            <span className="text-xs font-medium text-slate-500">
                              {learnerCourseLabel(c.course.title)}
                            </span>
                          </div>

                          <div>
                            <h3 className="text-base font-bold text-slate-900 leading-snug">
                              {learnerClassLabel(c.name, c.code, c.course.title)}
                            </h3>
                            <p className="mt-1 text-xs text-slate-500">
                              Hoàn thành {sum.completed}/{sum.total || 0} hoạt động
                              {sum.publishedGradesCount > 0
                                ? ` · ${sum.publishedGradesCount} điểm đã công bố`
                                : ''}
                            </p>
                          </div>

                          <div>
                            <div className="flex items-center justify-between text-xs font-semibold text-slate-700 mb-1">
                              <span>Tiến độ lớp</span>
                              <span className="text-[#446b2f]">{sum.percent}%</span>
                            </div>
                            <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                              <div
                                className={`h-full rounded-full ${
                                  isCompleted ? 'bg-emerald-600' : 'bg-[#5e9141]'
                                }`}
                                style={{ width: `${sum.percent}%` }}
                              />
                            </div>
                          </div>

                          {hasCert && (
                            <div className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                              <Award className="size-3.5" aria-hidden="true" />
                              Chứng chỉ {q05?.certificateCode}
                            </div>
                          )}
                        </div>

                        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                          <Link
                            to={`/classroom/${c.id}`}
                            className="inline-flex items-center justify-center rounded-lg bg-[#5e9141] px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-[#4d7735]"
                          >
                            Vào lớp
                          </Link>
                          <Link
                            to={`/my/progress`}
                            className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            {hasCert ? 'Xem chứng chỉ' : 'Xem tiến độ'}
                          </Link>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Quick Resume Learning Section (Both ClassTree lessons/resources & legacy modules) */}
            <section className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Tiếp tục bài học gần nhất</h2>
                  <p className="text-xs text-slate-500">
                    Mở nhanh bài giảng & tài liệu chưa hoàn thành trong lớp đang học
                  </p>
                </div>
                <span className="rounded-full bg-[#edf5e8] px-2.5 py-1 text-xs font-semibold text-[#446b2f]">
                  {visibleResumeLessons.length} bài khả dụng
                </span>
              </div>

              {visibleResumeLessons.length === 0 ? (
                <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-4 text-sm text-slate-600">
                  {resumeLessonsAll.length === 0
                    ? 'Tất cả bài giảng hiện có đều đã được đánh dấu hoàn thành.'
                    : 'Không tìm thấy bài học phù hợp với bộ lọc hiện tại.'}
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {visibleResumeLessons.slice(0, 6).map((item) => (
                    <Link
                      key={item.id}
                      to={item.to}
                      className="group flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-[#fcfdfb] p-3.5 transition hover:border-[#9dc387] hover:bg-[#f6faf3]"
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-700">
                            {item.kindLabel}
                          </span>
                          <span className="truncate">{item.className}</span>
                        </div>
                        <p className="truncate text-sm font-semibold text-slate-900 group-hover:text-[#446b2f]">
                          {item.title}
                        </p>
                        <p className="truncate text-xs text-slate-500">{item.sectionTitle}</p>
                      </div>
                      <span
                        className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold ${
                          item.status === 'IN_PROGRESS'
                            ? 'bg-amber-50 text-amber-800 border border-amber-200'
                            : 'bg-[#edf5e8] text-[#446b2f]'
                        }`}
                      >
                        {item.status === 'IN_PROGRESS' ? 'Học tiếp' : 'Mở bài'}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </section>

            {/* Filterable Action Items & Quizzes Section */}
            <section
              id="assignments"
              className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm space-y-4"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">
                    Việc cần làm & Bài kiểm tra
                  </h2>
                  <p className="text-xs text-slate-500">
                    Hiển thị {visibleTasks.length} / {scopedTasks.length} hoạt động trong phạm vi lọc
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <label htmlFor="dashboard-task-sort" className="text-xs font-medium text-slate-500">
                    Sắp xếp:
                  </label>
                  <select
                    id="dashboard-task-sort"
                    value={taskSort}
                    onChange={(e) => setTaskSort(e.target.value as TaskSortMode)}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-700 focus:border-[#5e9141] focus:outline-none"
                  >
                    <option value="DUE_ASC">Hạn nộp sớm nhất</option>
                    <option value="CLASS">Theo từng lớp học</option>
                  </select>
                </div>
              </div>

              {/* Task Filter Pills */}
              <div className="flex flex-col gap-2.5 rounded-xl border border-slate-100 bg-slate-50/70 p-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Lọc theo loại hoạt động">
                  {(
                    [
                      ['ALL', 'Tất cả loại'],
                      ['ASSIGNMENT', 'Bài tập'],
                      ['EXAM', 'Quiz & Kiểm tra'],
                      ['ATTENDANCE', 'Điểm danh'],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setTaskKindFilter(value)}
                      className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                        taskKindFilter === value
                          ? 'bg-[#5e9141] text-white'
                          : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Lọc theo trạng thái hoàn thành">
                  {(
                    [
                      ['PENDING', 'Cần làm'],
                      ['OVERDUE', 'Quá hạn'],
                      ['DONE', 'Đã hoàn thành'],
                      ['ALL', 'Tất cả'],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setTaskStatusFilter(value)}
                      className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                        taskStatusFilter === value
                          ? 'bg-slate-900 text-white'
                          : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {visibleTasks.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-6 text-center text-sm text-slate-600">
                  {taskStatusFilter === 'PENDING'
                    ? 'Không có bài tập hay kiểm tra nào còn tồn đọng trong bộ lọc hiện tại.'
                    : 'Không tìm thấy hoạt động nào khớp với bộ lọc đã chọn.'}
                </div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {visibleTasks.slice(0, 12).map((t) => {
                    const dueInfo = formatDueBadge(t.due, now, t.isDone);
                    return (
                      <li key={t.id} className="py-3 first:pt-1 last:pb-1">
                        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span
                                className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                                  t.kind === 'ASSIGNMENT'
                                    ? 'bg-amber-50 text-amber-900 border border-amber-200'
                                    : t.kind === 'ATTENDANCE'
                                      ? 'bg-sky-50 text-sky-900 border border-sky-200'
                                      : 'bg-violet-50 text-violet-900 border border-violet-200'
                                }`}
                              >
                                {t.kindLabel}
                              </span>
                              <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700 truncate max-w-[220px]">
                                {t.className}
                              </span>
                              <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${dueInfo.tone}`}>
                                {dueInfo.text}
                              </span>
                            </div>

                            <Link
                              to={t.to}
                              className="block text-sm font-semibold text-slate-900 hover:text-[#446b2f] hover:underline"
                            >
                              {t.title}
                            </Link>
                            <p className="text-xs text-slate-500">
                              {t.sectionTitle} · {t.statusLabel}
                            </p>
                          </div>

                          <Link
                            to={t.to}
                            className={`inline-flex shrink-0 items-center justify-center rounded-lg px-3.5 py-1.5 text-xs font-semibold transition ${
                              t.isDone || t.isUpcomingWindow
                                ? 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                                : 'bg-[#edf5e8] text-[#446b2f] border border-[#cde0c2] hover:bg-[#dfeed5]'
                            }`}
                          >
                            {t.isDone
                              ? 'Xem lại'
                              : t.kind === 'ATTENDANCE'
                                ? 'Chi tiết'
                                : t.isUpcomingWindow
                                  ? 'Xem lịch mở'
                                  : 'Làm bài'}
                          </Link>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>

          {/* Right Column: Schedule Filters, Tuition Summary, Student Services */}
          <aside className="space-y-6 lg:col-span-4">
            {/* Filterable Upcoming Schedule & Deadlines */}
            <section className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm space-y-3.5">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h2 className="text-base font-bold text-slate-900">Lịch học & Hạn sắp tới</h2>
                  <p className="text-xs text-slate-500">Theo múi giờ Việt Nam (GMT+7)</p>
                </div>
                <Link to="/my/calendar" className="text-xs font-semibold text-[#5e9141] hover:underline">
                  Lịch đầy đủ →
                </Link>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
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

                <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
                  {(
                    [
                      ['ALL', 'Tất cả'],
                      ['SESSION', 'Buổi học'],
                      ['DEADLINE', 'Hạn nộp'],
                    ] as const
                  ).map(([val, lbl]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setScheduleKind(val)}
                      className={`rounded-md px-2 py-1 text-xs font-semibold transition ${
                        scheduleKind === val
                          ? 'bg-white text-slate-900 shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {lbl}
                    </button>
                  ))}
                </div>
              </div>

              {visibleSchedule.length === 0 ? (
                <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 p-4 text-xs text-slate-600">
                  Không có lịch học hoặc hạn nộp nào trong khoảng thời gian đã chọn.
                </p>
              ) : (
                <ul className="space-y-2">
                  {visibleSchedule.map((item) => {
                    const d = schoolDay(item.effectiveAt);
                    const [, mm, dd] = d.split('-');
                    return (
                      <li key={item.id}>
                        <Link
                          to={item.url}
                          className="flex items-start gap-3 rounded-xl border border-slate-200/80 bg-[#fcfdfb] p-3 transition hover:border-[#b7d3a6] hover:bg-[#f6faf3]"
                        >
                          <div className="flex w-11 shrink-0 flex-col items-center rounded-lg border border-[#dce8d5] bg-[#edf5e8] py-1 text-[#446b2f]">
                            <span className="text-[10px] font-semibold uppercase">Th.{Number(mm)}</span>
                            <span className="text-sm font-bold leading-tight">{dd}</span>
                          </div>
                          <div className="min-w-0 flex-1 space-y-0.5">
                            <p className="truncate text-xs font-bold text-slate-900">{item.title}</p>
                            <p className="truncate text-[11px] text-slate-500">
                              {item.className || 'Lịch học tập'}
                            </p>
                            <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-600 pt-0.5">
                              <span className="inline-flex items-center gap-1">
                                <Clock className="size-3 text-[#5e9141]" aria-hidden="true" />
                                {schoolTime(item.effectiveAt)}
                              </span>
                              <span>·</span>
                              <span>{item.isDeadlineEvent ? item.status : 'Buổi học'}</span>
                            </div>
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {/* Tuition & Enrollment Snapshot */}
            <section className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-slate-900">Học phí & Ghi danh</h2>
                <Link to="/student/finance" className="text-xs font-semibold text-[#5e9141] hover:underline">
                  Chi tiết →
                </Link>
              </div>

              {unifiedFinance && unifiedFinance.receivables.length > 0 ? (
                <div className="space-y-2">
                  {unifiedFinance.receivables.slice(0, 3).map((rec) => {
                    const paid = rec.status === 'PAID';
                    const expired = rec.status === 'EXPIRED' || rec.status === 'CANCELLED';
                    return (
                      <div
                        key={rec.id}
                        className="flex items-center justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2.5 text-xs"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-slate-900">
                            {learnerClassLabel(
                              rec.classOffering.name,
                              rec.classOffering.code,
                              rec.classOffering.course.title,
                            )}
                          </p>
                          <p className="text-slate-500">
                            {vnd(rec.amountVnd)}
                          </p>
                        </div>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                            paid
                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                              : expired
                                ? 'bg-slate-200 text-slate-700'
                                : 'bg-amber-50 text-amber-800 border border-amber-200'
                          }`}
                        >
                          {paid ? 'Đã hoàn tất' : expired ? 'Hết hạn giữ chỗ' : 'Chờ thanh toán'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : finance.length > 0 ? (
                <div className="space-y-2">
                  {finance.slice(0, 3).map((f) => (
                    <div
                      key={f.class.id}
                      className="flex items-center justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2.5 text-xs"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-slate-900">
                          {learnerClassLabel(f.class.name, f.class.code)}
                        </p>
                        <p className="text-slate-500">{vnd(f.amountVnd)}</p>
                      </div>
                      <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                        {f.state === 'APPROVED'
                          ? 'Đã xác nhận'
                          : f.state === 'PENDING'
                            ? 'Chờ xử lý'
                            : 'Đã lưu'}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500">
                  Hiện chưa có khoản công nợ học phí phát sinh mới.
                </p>
              )}

              <Link
                to="/student/finance"
                className="flex w-full items-center justify-center rounded-xl border border-[#cde0c2] bg-[#edf5e8] px-3 py-2 text-xs font-semibold text-[#446b2f] transition hover:bg-[#e1eed8]"
              >
                Mở trang Học phí & Thanh toán
              </Link>
            </section>

            {/* Student Services Grid */}
            <section className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm space-y-3">
              <h2 className="text-base font-bold text-slate-900">Dịch vụ học viên</h2>
              <div className="grid grid-cols-2 gap-2.5">
                <Link
                  to="/student/bookings"
                  className="rounded-xl border border-slate-200/80 bg-[#fcfdfb] p-3 text-left transition hover:border-[#b7d3a6] hover:bg-[#f6faf3]"
                >
                  <Headphones className="size-4 text-[#5e9141]" aria-hidden="true" />
                  <p className="mt-2 text-xs font-bold text-slate-900">Tư vấn 1:1</p>
                  <p className="mt-0.5 text-[11px] text-slate-500">Đặt lịch giảng viên</p>
                </Link>
                <Link
                  to="/student/support"
                  className="rounded-xl border border-slate-200/80 bg-[#fcfdfb] p-3 text-left transition hover:border-[#b7d3a6] hover:bg-[#f6faf3]"
                >
                  <CheckCircle2 className="size-4 text-[#5e9141]" aria-hidden="true" />
                  <p className="mt-2 text-xs font-bold text-slate-900">Hỗ trợ học viên</p>
                  <p className="mt-0.5 text-[11px] text-slate-500">Gửi phiếu yêu cầu</p>
                </Link>
                <Link
                  to="/my/progress"
                  className="rounded-xl border border-slate-200/80 bg-[#fcfdfb] p-3 text-left transition hover:border-[#b7d3a6] hover:bg-[#f6faf3]"
                >
                  <Layers className="size-4 text-[#5e9141]" aria-hidden="true" />
                  <p className="mt-2 text-xs font-bold text-slate-900">Tiến độ & Chứng chỉ</p>
                  <p className="mt-0.5 text-[11px] text-slate-500">Tổng hợp kết quả</p>
                </Link>
                <Link
                  to="/student/placement"
                  className="rounded-xl border border-slate-200/80 bg-[#fcfdfb] p-3 text-left transition hover:border-[#b7d3a6] hover:bg-[#f6faf3]"
                >
                  <Compass className="size-4 text-[#5e9141]" aria-hidden="true" />
                  <p className="mt-2 text-xs font-bold text-slate-900">Đánh giá đầu vào</p>
                  <p className="mt-0.5 text-[11px] text-slate-500">Kiểm tra trình độ</p>
                </Link>
              </div>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}
