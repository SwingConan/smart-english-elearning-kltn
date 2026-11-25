import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import {
  BookOpen,
  Calendar,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Download,
  ExternalLink,
  FileSpreadsheet,
  GraduationCap,
  MapPin,
  Search,
  Users,
} from 'lucide-react';
import { academicApi, type AcademicClass } from '@/features/academic/api';
import { ClassRoadmapTable } from '@/features/catalog/ClassRoadmapTable';
import { classCodeLabel } from '@/features/demo/presentation';
import {
  isTechnicalQaRecord,
  accountLabel,
  classLabel,
} from '@/features/catalog/record-presentation';
import { classStatus } from '@/features/instructor/class-status';
import { weekdayLabel } from '@/features/classes/schedule';
import type {
  EnrollmentStatus,
  InstructorClassOverview,
  InstructorClassResults,
  InstructorRoster,
} from '@/features/instructor/types';
import type { ClassTree } from './api';
import { schoolTime } from './month';
import type {
  LocalActivityKind,
  UnifiedActivityColumn,
  UnifiedClassResults,
  UnifiedStudentRow,
} from './lms-local-api';

export type ClassroomTab = 'course' | 'info' | 'students' | 'grades' | 'progress';

type GradeColumnFilter = 'ALL' | 'ASSIGNMENT' | 'QUIZ_REGULAR' | 'EXAM' | 'ATTENDANCE';

interface FormalAssessmentRow {
  id: string;
  stage: string;
  openAt?: string | null;
  closeAt?: string | null;
  test: { id: string; title: string };
  learners: Array<{
    id: string;
    learnerId: string;
    enrollmentId?: string | null;
    learner: { fullName: string; email: string };
    skillScores: Array<{ skill: string; status: string; normalizedScore: number }>;
  }>;
}

const MODALITY_LABELS: Record<string, string> = {
  ONLINE: 'Trực tuyến (Google Meet)',
  OFFLINE: 'Trực tiếp tại lớp',
  HYBRID: 'Kết hợp (Hybrid)',
};

const ENROLLMENT_STATUS_BADGE: Record<
  EnrollmentStatus,
  { label: string; tone: string }
> = {
  ACTIVE: { label: 'Đang học', tone: 'bg-emerald-100 text-emerald-800' },
  COMPLETED: { label: 'Đã hoàn thành', tone: 'bg-sky-100 text-sky-800' },
  PENDING_PAYMENT: { label: 'Chờ thanh toán', tone: 'bg-amber-100 text-amber-800' },
  DROPPED: { label: 'Đã rút lớp', tone: 'bg-slate-200 text-slate-700' },
  CANCELLED: { label: 'Đã hủy', tone: 'bg-rose-100 text-rose-800' },
};

const FORMAL_STAGE_LABELS: Record<string, string> = {
  PERIODIC: 'Kiểm tra thường kỳ',
  MIDTERM: 'Kiểm tra giữa kỳ',
  FINAL: 'Kiểm tra cuối kỳ',
  PRACTICE: 'Luyện tập',
};

function formatShortDate(value?: string | null): string {
  if (!value) return 'Chưa cập nhật';
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return 'Chưa cập nhật';
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(d);
}

function escapeCsvCell(value: string | number | null | undefined): string {
  const str = String(value ?? '');
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function downloadCsv(filename: string, headers: string[], rows: Array<Array<string | number>>) {
  const lines = [
    headers.map(escapeCsvCell).join(','),
    ...rows.map((r) => r.map(escapeCsvCell).join(',')),
  ];
  const blob = new Blob(['\uFEFF' + lines.join('\r\n')], {
    type: 'text/csv;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function formatScoreValue(score: number): string {
  return Number.isInteger(score) ? String(score) : score.toFixed(1).replace(/\.0$/, '');
}

function mergeStudentsList(
  unified: UnifiedClassResults | null,
  roster: InstructorRoster | null,
) {
  const byEnrollment = new Map<
    string,
    {
      enrollmentId: string;
      learnerId: string;
      fullName: string;
      email: string;
      status: EnrollmentStatus;
      enrolledAt: string | null;
      row: UnifiedStudentRow | null;
    }
  >();

  for (const l of roster?.learners ?? []) {
    byEnrollment.set(l.id, {
      enrollmentId: l.id,
      learnerId: l.learner.id,
      fullName: accountLabel(l.learner.fullName),
      email: l.learner.email,
      status: l.status,
      enrolledAt: l.enrolledAt,
      row: null,
    });
  }

  for (const r of unified?.studentRows ?? []) {
    const existing = byEnrollment.get(r.enrollmentId);
    if (existing) {
      existing.row = r;
    } else {
      byEnrollment.set(r.enrollmentId, {
        enrollmentId: r.enrollmentId,
        learnerId: r.learnerId,
        fullName: accountLabel(r.fullName),
        email: r.email,
        status: 'ACTIVE',
        enrolledAt: null,
        row: r,
      });
    }
  }

  return [...byEnrollment.values()].sort((a, b) =>
    a.fullName.localeCompare(b.fullName, 'vi'),
  );
}

/**
 * Tab "Thông tin lớp học" cho Giảng viên — hiển thị đầy đủ siêu dữ liệu lớp,
 * lịch học định kỳ, thống kê nội dung LMS, sĩ số, buổi học chính thức & liên kết nhanh.
 */
export function InstructorClassInfoTab({
  classId,
  tree,
  overview,
  unified,
  rosterCount,
  onSelectTab,
}: {
  classId: string;
  tree: ClassTree;
  overview: InstructorClassOverview | null;
  unified: UnifiedClassResults | null;
  rosterCount: number | null;
  onSelectTab: (tab: ClassroomTab) => void;
}) {
  const [academicDetail, setAcademicDetail] = useState<AcademicClass | null>(null);
  useEffect(() => {
    let live = true;
    void academicApi
      .classroom(classId)
      .then((detail) => {
        if (live) setAcademicDetail(detail);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [classId]);

  const cls = overview?.classOffering;
  const codeDisplay = classCodeLabel(cls?.code ?? tree.class.code);
  const nameDisplay = isTechnicalQaRecord(tree.class.name, tree.class.code)
    ? classLabel(tree.class.name, tree.class.code)
    : tree.class.name;
  const statusInfo = cls ? classStatus(cls.status) : null;
  const learnerTotal =
    rosterCount ??
    overview?.activeLearnerCount ??
    cls?.activeLearnerCount ??
    unified?.studentRows.length ??
    0;

  const roadmapItems = academicDetail?.roadmapItems ?? [];
  const defaultRoom = academicDetail?.defaultRoom;
  const totalSessions = academicDetail?.totalSessions ?? roadmapItems.length;
  const totalPeriods = academicDetail?.totalPeriods ?? null;
  const minutesPerPeriod = academicDetail?.minutesPerPeriod ?? 45;

  const summary = unified?.summary;
  const quizExamTotal = summary
    ? summary.quizzesCount + summary.regularExamCount + summary.midtermCount + summary.finalCount
    : 0;

  return (
    <section className="space-y-5" aria-label="Thông tin chi tiết lớp học">
      {/* KPI summary cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>Học viên trong lớp</span>
            <Users className="size-4 text-[#5e9141]" aria-hidden="true" />
          </div>
          <p className="mt-1.5 text-2xl font-extrabold text-slate-900">{learnerTotal}</p>
          <button
            type="button"
            onClick={() => onSelectTab('students')}
            className="mt-1 text-xs font-semibold text-[#2f5d1e] hover:underline"
          >
            Xem danh sách học sinh →
          </button>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>Học phần &amp; Hoạt động</span>
            <BookOpen className="size-4 text-[#5e9141]" aria-hidden="true" />
          </div>
          <p className="mt-1.5 text-2xl font-extrabold text-slate-900">
            {summary ? `${summary.publishedActivities}/${summary.totalActivities}` : `${tree.sections.length} phần`}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {tree.sections.length} học phần · {summary?.assignmentsCount ?? 0} bài tập · {quizExamTotal} quiz/KT
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>Bài nộp chờ chấm</span>
            <FileSpreadsheet className="size-4 text-amber-600" aria-hidden="true" />
          </div>
          <p className="mt-1.5 text-2xl font-extrabold text-amber-700">
            {summary
              ? summary.awaitingAssignmentGrades + summary.awaitingManualQuizGrades
              : overview?.pendingGradingCount ?? 0}
          </p>
          <button
            type="button"
            onClick={() => onSelectTab('grades')}
            className="mt-1 text-xs font-semibold text-[#e66f2b] hover:underline"
          >
            Mở bảng điểm lớp →
          </button>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>Lịch buổi học</span>
            <Calendar className="size-4 text-[#5e9141]" aria-hidden="true" />
          </div>
          <p className="mt-1.5 text-2xl font-extrabold text-slate-900">
            {Math.max(tree.officialSessions?.length ?? 0, totalSessions ?? 0)} buổi
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {(tree.officialSessions?.length ?? 0) > 0
              ? `${tree.officialSessions!.length} buổi đã công bố · ${summary?.attendanceCount ?? 0} điểm danh`
              : `${roadmapItems.length} buổi theo lộ trình · ${summary?.attendanceCount ?? 0} điểm danh`}
          </p>
        </div>
      </div>

      {/* Main metadata table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 bg-[#f8f9fa] px-4 py-3">
          <h2 className="text-sm font-bold text-slate-900">Hồ sơ lớp học</h2>
        </div>
        <table className="w-full border-collapse text-left text-sm">
          <tbody className="divide-y divide-slate-200">
            <tr>
              <th className="w-48 border-r border-slate-200 bg-[#f8f9fa] px-4 py-3 font-semibold text-slate-700">
                Mã lớp
              </th>
              <td className="px-4 py-3 font-semibold text-slate-900">{codeDisplay}</td>
            </tr>
            <tr>
              <th className="border-r border-slate-200 bg-[#f8f9fa] px-4 py-3 font-semibold text-slate-700">
                Tên lớp học
              </th>
              <td className="px-4 py-3 text-slate-900">{nameDisplay}</td>
            </tr>
            <tr>
              <th className="border-r border-slate-200 bg-[#f8f9fa] px-4 py-3 font-semibold text-slate-700">
                Khóa học &amp; Trình độ
              </th>
              <td className="px-4 py-3 text-slate-800">
                <span className="font-medium">
                  {cls?.course?.title ?? unified?.class.courseTitle ?? 'Đang cập nhật'}
                </span>
                {cls?.course?.level && (
                  <span className="ml-2 rounded-full bg-[#edf5e8] px-2 py-0.5 text-xs font-semibold text-[#2f5d1e]">
                    Trình độ {cls.course.level}
                  </span>
                )}
              </td>
            </tr>
            <tr>
              <th className="border-r border-slate-200 bg-[#f8f9fa] px-4 py-3 font-semibold text-slate-700">
                Trạng thái &amp; Hình thức
              </th>
              <td className="flex flex-wrap items-center gap-2 px-4 py-3">
                {statusInfo && (
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusInfo.className}`}>
                    {statusInfo.label}
                  </span>
                )}
                {cls?.modality && (
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                    {MODALITY_LABELS[cls.modality] ?? cls.modality}
                  </span>
                )}
              </td>
            </tr>
            <tr>
              <th className="border-r border-slate-200 bg-[#f8f9fa] px-4 py-3 font-semibold text-slate-700">
                Thời gian khóa học
              </th>
              <td className="px-4 py-3 text-slate-800">
                {cls?.classStart || cls?.classEnd || academicDetail?.classStart
                  ? `${formatShortDate(cls?.classStart ?? academicDetail?.classStart)} – ${formatShortDate(cls?.classEnd ?? academicDetail?.classEnd)}`
                  : 'Lịch đang cập nhật theo từng buổi công bố'}
              </td>
            </tr>
            <tr>
              <th className="border-r border-slate-200 bg-[#f8f9fa] px-4 py-3 font-semibold text-slate-700">
                Thời lượng &amp; Phòng học
              </th>
              <td className="px-4 py-3 text-slate-800">
                <div className="flex flex-wrap items-center gap-3">
                  <span>
                    {totalSessions ? `${totalSessions} buổi` : 'Đang cập nhật'}
                    {totalPeriods ? ` · ${totalPeriods} tiết (${minutesPerPeriod} phút/tiết)` : ''}
                    {academicDetail?.durationWeeks ? ` · ${academicDetail.durationWeeks} tuần` : ''}
                  </span>
                  {defaultRoom && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#edf5e8] px-2.5 py-0.5 text-xs font-semibold text-[#2f5d1e]">
                      <MapPin className="size-3.5" aria-hidden="true" />
                      {defaultRoom.code} — {defaultRoom.name} ({defaultRoom.location})
                    </span>
                  )}
                </div>
              </td>
            </tr>
            <tr>
              <th className="border-r border-slate-200 bg-[#f8f9fa] px-4 py-3 font-semibold text-slate-700">
                Lịch học cố định
              </th>
              <td className="px-4 py-3 text-slate-800">
                {cls?.scheduleSlots && cls.scheduleSlots.length > 0 ? (
                  <ul className="space-y-1">
                    {cls.scheduleSlots.map((slot, idx) => (
                      <li key={idx} className="flex flex-wrap items-center gap-2 text-xs sm:text-sm">
                        <span className="inline-flex items-center gap-1 font-semibold text-slate-900">
                          <Clock className="size-3.5 text-[#5e9141]" aria-hidden="true" />
                          {weekdayLabel(slot.dayOfWeek)} · {slot.startTime}–{slot.endTime}
                        </span>
                        {slot.locationText && (
                          <span className="inline-flex items-center gap-1 text-slate-600">
                            <MapPin className="size-3.5 text-slate-400" aria-hidden="true" />
                            {slot.locationText}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span className="text-slate-500">Chưa cấu hình khung giờ cố định</span>
                )}
              </td>
            </tr>
            <tr>
              <th className="border-r border-slate-200 bg-[#f8f9fa] px-4 py-3 font-semibold text-slate-700">
                Cấu trúc đánh giá lớp
              </th>
              <td className="px-4 py-3 text-slate-700 text-xs sm:text-sm">
                <div className="flex flex-wrap gap-2">
                  <span className="rounded bg-indigo-50 px-2 py-1 font-medium text-indigo-800">
                    Bài tập nộp: {summary?.assignmentsCount ?? 0}
                  </span>
                  <span className="rounded bg-violet-50 px-2 py-1 font-medium text-violet-800">
                    Quiz &amp; Thường kỳ: {(summary?.quizzesCount ?? 0) + (summary?.regularExamCount ?? 0)}
                  </span>
                  <span className="rounded bg-amber-50 px-2 py-1 font-medium text-amber-800">
                    Giữa kỳ: {summary?.midtermCount ?? 0}
                  </span>
                  <span className="rounded bg-rose-50 px-2 py-1 font-medium text-rose-800">
                    Cuối kỳ: {summary?.finalCount ?? 0}
                  </span>
                  <span className="rounded bg-emerald-50 px-2 py-1 font-medium text-emerald-800">
                    Điểm danh: {summary?.attendanceCount ?? 0}
                  </span>
                </div>
              </td>
            </tr>
            <tr>
              <th className="border-r border-slate-200 bg-[#f8f9fa] px-4 py-3 font-semibold text-slate-700">
                Điều hướng nhanh
              </th>
              <td className="flex flex-wrap gap-3 px-4 py-3 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => onSelectTab('students')}
                  className="text-[#2f5d1e] hover:underline"
                >
                  Danh sách học sinh ({learnerTotal}) →
                </button>
                <button
                  type="button"
                  onClick={() => onSelectTab('grades')}
                  className="text-[#e66f2b] hover:underline"
                >
                  Bảng điểm lớp học →
                </button>
                <button
                  type="button"
                  onClick={() => onSelectTab('progress')}
                  className="text-indigo-700 hover:underline"
                >
                  Tiến độ học tập →
                </button>
                <Link to="/my/calendar" className="text-slate-700 hover:underline">
                  Bảng điều khiển lịch dạy →
                </Link>
                <Link
                  to={`/instructor/requests?classId=${classId}`}
                  className="text-[#e66f2b] hover:underline"
                >
                  Đề nghị Meet &amp; Nghỉ/Đổi lịch →
                </Link>
                <button
                  type="button"
                  onClick={() => onSelectTab('grades')}
                  className="text-indigo-700 hover:underline"
                >
                  Bảng điểm &amp; Kiểm tra (
                  {(unified?.formalAssessments.length ?? 0) +
                    (summary ? summary.regularExamCount + summary.midtermCount + summary.finalCount : 0)}
                  ) →
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Official published sessions */}
      {tree.officialSessions && tree.officialSessions.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-[#f8f9fa] p-4 space-y-3">
          <h2 className="flex items-center gap-2 text-base font-semibold text-[#e66f2b]">
            <Calendar className="h-4 w-4" aria-hidden="true" />
            Buổi học đã công bố ({tree.officialSessions.length} buổi)
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {tree.officialSessions.map((ts, idx) => (
              <div
                key={ts.id}
                className="rounded-lg border border-slate-200 bg-white p-3.5 text-xs space-y-1.5"
              >
                <p className="font-semibold text-slate-900">
                  Buổi #{idx + 1} · {formatShortDate(ts.startsAt)}
                </p>
                <p className="text-slate-600">
                  {schoolTime(ts.startsAt)} – {schoolTime(ts.endsAt)}
                  {ts.room ? ` · Phòng ${ts.room.code}` : ''}
                </p>
                <div className="flex flex-wrap gap-3 pt-1">
                  {ts.approvedMeetUrl && (
                    <a
                      href={ts.approvedMeetUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 font-semibold text-[#e66f2b] hover:underline"
                    >
                      Vào Google Meet
                      <ExternalLink className="size-3" aria-hidden="true" />
                    </a>
                  )}
                  {tree.sessionEngagementEnabled && (
                    <Link
                      className="font-semibold text-[#2f7d32] hover:underline"
                      to={`/classroom/${classId}/attendance?sessionId=${ts.id}&mode=attendance`}
                    >
                      Mở điểm danh buổi #{idx + 1} →
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {roadmapItems.length > 0 && (
        <ClassRoadmapTable
          items={roadmapItems}
          classStart={cls?.classStart ?? academicDetail?.classStart}
          classEnd={cls?.classEnd ?? academicDetail?.classEnd}
          defaultRoom={defaultRoom}
          minutesPerPeriod={minutesPerPeriod}
          showMeetingUrl
        />
      )}
    </section>
  );
}

/**
 * Tab "Danh sách học sinh" — hiển thị toàn bộ thành viên lớp, trạng thái ghi danh,
 * bài nộp, điểm danh, tiến độ hoạt động LMS & xuất CSV danh sách.
 */
export function InstructorClassStudentsTab({
  classId,
  classCode,
  unified,
  roster,
}: {
  classId: string;
  classCode: string;
  unified: UnifiedClassResults | null;
  roster: InstructorRoster | null;
}) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | EnrollmentStatus>('ALL');

  const merged = useMemo(() => mergeStudentsList(unified, roster), [unified, roster]);
  const publishedTotal = unified?.summary.publishedActivities ?? 0;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return merged.filter((m) => {
      if (statusFilter !== 'ALL' && m.status !== statusFilter) return false;
      if (!q) return true;
      return m.fullName.toLowerCase().includes(q) || m.email.toLowerCase().includes(q);
    });
  }, [merged, search, statusFilter]);

  function exportStudentsCsv() {
    const headers = [
      'STT',
      'Họ và tên',
      'Email',
      'Trạng thái',
      'Ngày tham gia',
      'Bài tập đã nộp',
      'Quiz & KT đã làm',
      'Điểm danh',
      'Hoàn thành hoạt động LMS',
    ];
    const rows = filtered.map((m, idx) => {
      const s = m.row?.stats;
      const pct =
        publishedTotal > 0 && s
          ? Math.round((s.completedActivitiesCount / publishedTotal) * 100)
          : 0;
      return [
        idx + 1,
        m.fullName,
        m.email,
        ENROLLMENT_STATUS_BADGE[m.status]?.label ?? m.status,
        formatShortDate(m.enrolledAt),
        s ? `${s.submittedAssignments}/${unified?.summary.assignmentsCount ?? 0}` : '0/0',
        s ? `${s.submittedQuizzes}` : '0',
        s ? `${s.attendancePresentCount + s.attendanceLateCount}/${s.attendanceTotalCount}` : '0/0',
        s ? `${s.completedActivitiesCount}/${publishedTotal} (${pct}%)` : `0/${publishedTotal}`,
      ];
    });
    downloadCsv(`danh-sach-hoc-sinh-${classCodeLabel(classCode)}.csv`, headers, rows);
  }

  return (
    <section className="space-y-4" aria-label="Danh sách học sinh trong lớp">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">
            Danh sách học sinh ({merged.length} thành viên)
          </h2>
          <p className="text-xs text-slate-500">
            Theo dõi thông tin thành viên ghi danh, mức độ tham gia học tập và truy cập hồ sơ từng học viên.
          </p>
        </div>
        <button
          type="button"
          onClick={exportStudentsCsv}
          disabled={filtered.length === 0}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <Download className="size-3.5 text-[#5e9141]" aria-hidden="true" />
          Tải danh sách (.csv)
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full sm:w-72">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm theo họ tên hoặc email..."
            aria-label="Tìm học sinh theo tên hoặc email"
            className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-800 focus:border-[#76a35e] focus:outline-none"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              ['ALL', 'Tất cả'],
              ['ACTIVE', 'Đang học'],
              ['COMPLETED', 'Đã hoàn thành'],
              ['PENDING_PAYMENT', 'Chờ thanh toán'],
            ] as const
          ).map(([val, lbl]) => (
            <button
              key={val}
              type="button"
              onClick={() => setStatusFilter(val)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                statusFilter === val
                  ? 'bg-[#76a35e] text-white'
                  : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {lbl}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          Không có học sinh nào khớp với bộ lọc hiện tại.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[760px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-[#f8f9fa] text-xs font-bold uppercase text-slate-600">
                <th className="w-12 px-3 py-3 text-center">STT</th>
                <th className="px-3 py-3">Họ và tên</th>
                <th className="px-3 py-3">Trạng thái</th>
                <th className="px-3 py-3">Ngày ghi danh</th>
                <th className="px-3 py-3 text-center">Bài tập</th>
                <th className="px-3 py-3 text-center">Quiz &amp; KT</th>
                <th className="px-3 py-3 text-center">Điểm danh</th>
                <th className="px-3 py-3">Hoàn thành LMS</th>
                <th className="px-3 py-3 text-right">Hồ sơ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((m, idx) => {
                const badge = ENROLLMENT_STATUS_BADGE[m.status] ?? {
                  label: m.status,
                  tone: 'bg-slate-100 text-slate-700',
                };
                const s = m.row?.stats;
                const pct =
                  publishedTotal > 0 && s
                    ? Math.round((s.completedActivitiesCount / publishedTotal) * 100)
                    : 0;
                return (
                  <tr key={m.enrollmentId} className="hover:bg-slate-50/70">
                    <td className="px-3 py-3 text-center font-semibold text-slate-500">
                      {idx + 1}
                    </td>
                    <td className="px-3 py-3">
                      <p className="font-semibold text-slate-900">{m.fullName}</p>
                      <p className="text-xs text-slate-500">{m.email}</p>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge.tone}`}>
                        {badge.label}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-xs text-slate-600">
                      {formatShortDate(m.enrolledAt)}
                    </td>
                    <td className="px-3 py-3 text-center text-xs font-semibold text-slate-800">
                      {s ? `${s.submittedAssignments}/${unified?.summary.assignmentsCount ?? 0}` : '—'}
                    </td>
                    <td className="px-3 py-3 text-center text-xs font-semibold text-slate-800">
                      {s ? s.submittedQuizzes : '—'}
                    </td>
                    <td className="px-3 py-3 text-center text-xs text-slate-700">
                      {s
                        ? `${s.attendancePresentCount + s.attendanceLateCount}/${s.attendanceTotalCount}`
                        : '—'}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-20 overflow-hidden rounded-full bg-slate-200">
                          <div
                            className="h-full rounded-full bg-[#76a35e]"
                            style={{ width: `${Math.min(100, pct)}%` }}
                          />
                        </div>
                        <span className="text-xs font-semibold text-slate-700">
                          {pct}%
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <Link
                        to={`/instructor/classes/${classId}/learners/${m.enrollmentId}`}
                        className="text-xs font-semibold text-[#e66f2b] hover:underline"
                      >
                        Chi tiết →
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/**
 * Tab "Điểm số" cho Giảng viên — Ma trận sổ điểm đầy đủ:
 * STT | Họ và tên | ...Cột điểm động tự cập nhật theo mọi Bài tập, Quiz, Thường kỳ, Giữa kỳ, Cuối kỳ... | ĐTB (%)
 * Kèm nút Tải bảng điểm (.csv).
 */
export function InstructorClassGradebookTab({
  classId,
  classCode,
  unified,
  roster,
  results,
}: {
  classId: string;
  classCode: string;
  unified: UnifiedClassResults | null;
  roster: InstructorRoster | null;
  results: InstructorClassResults | null;
}) {
  const [search, setSearch] = useState('');
  const [colFilter, setColFilter] = useState<GradeColumnFilter>('ALL');
  const [includeDrafts, setIncludeDrafts] = useState(true);

  const students = useMemo(() => mergeStudentsList(unified, roster), [unified, roster]);

  // All gradable LMS activities & attendance sessions automatically sync whenever added to any Section
  const allGradableColumns = useMemo(() => {
    const cols = unified?.activityColumns ?? [];
    return cols.filter((col) => {
      const isAssignment = col.baseType === 'ASSIGNMENT' && !col.localKind;
      const isLocalQuiz = col.localKind === 'LOCAL_QUIZ';
      const isLocalAttendance = col.localKind === 'LOCAL_ATTENDANCE';
      if (!isAssignment && !isLocalQuiz && !isLocalAttendance) return false;
      if (!includeDrafts && col.state !== 'PUBLISHED') return false;
      if (col.state === 'HIDDEN') return false;
      return true;
    });
  }, [unified, includeDrafts]);

  // Also include non-synthetic Core formal assessments if any exist in class results
  const formalColumns = useMemo(() => {
    const list = ((results?.assessments ?? []) as unknown as FormalAssessmentRow[]).filter(
      (a) => a.test?.title && !isTechnicalQaRecord(a.test.title),
    );
    return list;
  }, [results]);

  const filteredLmsColumns = useMemo(() => {
    return allGradableColumns.filter((col) => {
      if (colFilter === 'ASSIGNMENT') {
        return col.baseType === 'ASSIGNMENT' && !col.localKind;
      }
      if (colFilter === 'QUIZ_REGULAR') {
        return col.localKind === 'LOCAL_QUIZ' && (col.assessmentKind === 'QUIZ' || col.assessmentKind === 'REGULAR');
      }
      if (colFilter === 'EXAM') {
        return col.localKind === 'LOCAL_QUIZ' && (col.assessmentKind === 'MIDTERM' || col.assessmentKind === 'FINAL');
      }
      if (colFilter === 'ATTENDANCE') {
        return col.localKind === 'LOCAL_ATTENDANCE';
      }
      return true;
    });
  }, [allGradableColumns, colFilter]);

  const filteredFormalColumns = useMemo(() => {
    if (colFilter === 'ASSIGNMENT' || colFilter === 'ATTENDANCE') return [];
    if (colFilter === 'QUIZ_REGULAR') {
      return formalColumns.filter((a) => a.stage === 'PERIODIC' || a.stage === 'PRACTICE');
    }
    if (colFilter === 'EXAM') {
      return formalColumns.filter((a) => a.stage === 'MIDTERM' || a.stage === 'FINAL');
    }
    return formalColumns;
  }, [formalColumns, colFilter]);

  const filteredStudents = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return students;
    return students.filter(
      (s) => s.fullName.toLowerCase().includes(q) || s.email.toLowerCase().includes(q),
    );
  }, [students, search]);

  function getLmsCellSummary(
    student: (typeof students)[number],
    col: UnifiedActivityColumn,
  ): {
    display: string;
    csvText: string;
    pct: number | null;
    tone: string;
    pendingAction: boolean;
  } {
    const row = student.row;
    if (!row) {
      return { display: '—', csvText: '', pct: null, tone: 'text-slate-400', pendingAction: false };
    }
    if (col.baseType === 'ASSIGNMENT' && !col.localKind) {
      const cell = row.assignments[col.activityId];
      if (!cell || cell.submissionState === 'NOT_SUBMITTED') {
        return { display: '—', csvText: '', pct: null, tone: 'text-slate-400', pendingAction: false };
      }
      if (cell.submissionState === 'DRAFT') {
        return {
          display: 'Bản nháp',
          csvText: 'Bản nháp',
          pct: null,
          tone: 'text-slate-500 text-[11px]',
          pendingAction: false,
        };
      }
      if (cell.score !== null) {
        const max = cell.maxScore || col.maxScore || 10;
        const pct = max > 0 ? (cell.score / max) * 100 : null;
        const formatted = `${formatScoreValue(cell.score)}/${formatScoreValue(max)}`;
        const isPublished = cell.gradeState === 'PUBLISHED';
        return {
          display: formatted,
          csvText: formatted,
          pct,
          tone: isPublished ? 'font-bold text-slate-900' : 'font-semibold text-amber-800',
          pendingAction: !isPublished,
        };
      }
      return {
        display: 'Chờ chấm',
        csvText: 'Chờ chấm',
        pct: null,
        tone: 'font-semibold text-amber-700',
        pendingAction: true,
      };
    }

    if (col.localKind === 'LOCAL_ATTENDANCE') {
      const acell = row.attendance?.[col.activityId];
      if (!acell || acell.status === 'NOT_RECORDED') {
        return {
          display: 'Chưa điểm danh',
          csvText: 'Chưa điểm danh',
          pct: null,
          tone: 'text-slate-400',
          pendingAction: true,
        };
      }
      if (acell.status === 'LATE') {
        return {
          display: 'Đi muộn',
          csvText: 'Đi muộn',
          pct: null,
          tone: 'font-semibold text-amber-700',
          pendingAction: false,
        };
      }
      return {
        display: 'Có mặt',
        csvText: 'Có mặt',
        pct: null,
        tone: 'font-semibold text-emerald-700',
        pendingAction: false,
      };
    }

    const qcell = row.quizzes[col.activityId];
    if (!qcell || qcell.attemptStatus === 'NOT_STARTED') {
      return { display: '—', csvText: '', pct: null, tone: 'text-slate-400', pendingAction: false };
    }
    if (qcell.attemptStatus === 'IN_PROGRESS') {
      return {
        display: 'Đang làm',
        csvText: 'Đang làm',
        pct: null,
        tone: 'text-sky-700 text-[11px]',
        pendingAction: false,
      };
    }
    if (qcell.gradingStatus === 'PENDING_MANUAL_GRADE') {
      return {
        display: 'Chờ chấm TL',
        csvText: 'Chờ chấm tự luận',
        pct: null,
        tone: 'font-semibold text-amber-700',
        pendingAction: true,
      };
    }
    if (qcell.score !== null) {
      const max = qcell.maxScore || col.maxScore || 10;
      const pct = max > 0 ? (qcell.score / max) * 100 : null;
      const formatted = `${formatScoreValue(qcell.score)}/${formatScoreValue(max)}`;
      return {
        display: formatted,
        csvText: formatted,
        pct,
        tone: qcell.gradePublished ? 'font-bold text-emerald-800' : 'font-semibold text-amber-800',
        pendingAction: !qcell.gradePublished,
      };
    }
    return {
      display: 'Đã nộp',
      csvText: 'Đã nộp',
      pct: null,
      tone: 'text-slate-700',
      pendingAction: false,
    };
  }

  function getFormalCellSummary(
    student: (typeof students)[number],
    assessment: FormalAssessmentRow,
  ): { display: string; csvText: string; pct: number | null; tone: string } {
    const match = assessment.learners.find(
      (l) => l.learnerId === student.learnerId || l.enrollmentId === student.enrollmentId,
    );
    if (!match) {
      return { display: '—', csvText: '', pct: null, tone: 'text-slate-400' };
    }
    const finals = match.skillScores.filter((s) => s.status === 'FINAL');
    if (finals.length > 0) {
      const avg = finals.reduce((sum, s) => sum + s.normalizedScore, 0) / finals.length;
      const text = `${Math.round(avg)}%`;
      return { display: text, csvText: text, pct: avg, tone: 'font-bold text-indigo-800' };
    }
    if (match.skillScores.length > 0) {
      return {
        display: 'Chờ chấm',
        csvText: 'Chờ chấm',
        pct: null,
        tone: 'font-semibold text-amber-700',
      };
    }
    return { display: 'Đã nộp', csvText: 'Đã nộp', pct: null, tone: 'text-slate-700' };
  }

  function computeStudentAverage(student: (typeof students)[number]) {
    const pcts: number[] = [];
    for (const col of filteredLmsColumns) {
      if (col.localKind === 'LOCAL_ATTENDANCE') continue;
      const res = getLmsCellSummary(student, col);
      if (res.pct !== null) pcts.push(res.pct);
    }
    for (const fa of filteredFormalColumns) {
      const res = getFormalCellSummary(student, fa);
      if (res.pct !== null) pcts.push(res.pct);
    }
    const avgPct = pcts.length > 0 ? pcts.reduce((a, b) => a + b, 0) / pcts.length : null;
    return { gradedCount: pcts.length, avgPct };
  }

  const scoredColumnsCount =
    filteredLmsColumns.filter((c) => c.localKind !== 'LOCAL_ATTENDANCE').length +
    filteredFormalColumns.length;

  function handleDownloadGrades() {
    const headers = [
      'STT',
      'Họ và tên',
      'Email',
      ...filteredLmsColumns.map((c) => `${c.title} (${c.kindLabel})`),
      ...filteredFormalColumns.map(
        (fa) => `${fa.test.title} (${FORMAL_STAGE_LABELS[fa.stage] ?? fa.stage})`,
      ),
      'Số bài đã có điểm',
      'Điểm TB quy đổi (%)',
    ];
    const rows = filteredStudents.map((s, idx) => {
      const lmsCells = filteredLmsColumns.map((col) => getLmsCellSummary(s, col).csvText);
      const formalCells = filteredFormalColumns.map((fa) => getFormalCellSummary(s, fa).csvText);
      const avg = computeStudentAverage(s);
      return [
        idx + 1,
        s.fullName,
        s.email,
        ...lmsCells,
        ...formalCells,
        `${avg.gradedCount}/${scoredColumnsCount}`,
        avg.avgPct !== null ? `${Math.round(avg.avgPct)}%` : '—',
      ];
    });
    downloadCsv(`bang-diem-${classCodeLabel(classCode)}.csv`, headers, rows);
  }

  const totalColumnsCount = filteredLmsColumns.length + filteredFormalColumns.length;
  const awaitingTotal =
    (unified?.summary.awaitingAssignmentGrades ?? 0) +
    (unified?.summary.awaitingManualQuizGrades ?? 0);

  return (
    <section className="space-y-4" aria-label="Bảng điểm lớp học">
      {/* Header & Download */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">
            Bảng điểm lớp học ({students.length} học viên · {totalColumnsCount} cột điểm)
          </h2>
          <p className="text-xs text-slate-500">
            Mỗi Bài tập, Quiz, Kiểm tra thường kỳ, Giữa kỳ hoặc Cuối kỳ khi thêm vào học phần sẽ tự động xuất hiện thành một cột điểm mới tại đây.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {awaitingTotal > 0 && (
            <span className="rounded-full bg-amber-100 px-3 py-1.5 text-xs font-bold text-amber-900">
              {awaitingTotal} bài đang chờ chấm
            </span>
          )}
          <button
            type="button"
            onClick={handleDownloadGrades}
            disabled={filteredStudents.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#76a35e] px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-[#5e8b48] disabled:opacity-50"
          >
            <Download className="size-3.5" aria-hidden="true" />
            Tải bảng điểm (.csv)
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-64">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm học viên..."
              aria-label="Tìm học viên trong bảng điểm"
              className="w-full rounded-lg border border-slate-300 bg-white py-1.5 pl-9 pr-3 text-sm text-slate-800 focus:border-[#76a35e] focus:outline-none"
            />
          </div>
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700">
            <input
              type="checkbox"
              checked={includeDrafts}
              onChange={(e) => setIncludeDrafts(e.target.checked)}
              className="accent-[#76a35e]"
            />
            Hiện cả hoạt động nháp
          </label>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {(
            [
              ['ALL', 'Tất cả cột điểm'],
              ['ASSIGNMENT', 'Bài tập'],
              ['QUIZ_REGULAR', 'Quiz & Thường kỳ'],
              ['EXAM', 'Giữa kỳ & Cuối kỳ'],
              ['ATTENDANCE', 'Điểm danh'],
            ] as const
          ).map(([val, lbl]) => (
            <button
              key={val}
              type="button"
              onClick={() => setColFilter(val)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                colFilter === val
                  ? 'bg-[#76a35e] text-white'
                  : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {lbl}
            </button>
          ))}
        </div>
      </div>

      {/* Dynamic Matrix Table */}
      {filteredStudents.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          Chưa có học sinh nào khớp với bộ lọc hiện tại.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[760px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-[#f8f9fa] text-xs text-slate-700">
                <th className="sticky left-0 z-10 w-12 border-r border-slate-200 bg-[#f8f9fa] px-3 py-3 text-center font-bold uppercase">
                  STT
                </th>
                <th className="sticky left-12 z-10 min-w-[200px] border-r border-slate-200 bg-[#f8f9fa] px-3 py-3 font-bold uppercase">
                  Họ và tên
                </th>
                {filteredLmsColumns.map((col) => (
                  <th
                    key={col.activityId}
                    className="min-w-[155px] max-w-[210px] border-r border-slate-200 px-3 py-2.5 align-top"
                  >
                    <div className="space-y-1">
                      <span className="inline-flex items-center gap-1 rounded bg-white px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#2f5d1e] ring-1 ring-slate-200">
                        {col.kindLabel}
                      </span>
                      {col.state === 'DRAFT' && (
                        <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900">
                          Nháp
                        </span>
                      )}
                      <div>
                        <Link
                          to={`/classroom/${classId}/activities/${col.activityId}`}
                          className="line-clamp-2 text-xs font-bold text-slate-900 hover:text-[#e66f2b] hover:underline"
                          title={col.title}
                        >
                          {col.title}
                        </Link>
                      </div>
                      {col.maxScore !== null && (
                        <p className="text-[11px] font-normal text-slate-500">
                          Thang {formatScoreValue(col.maxScore)}đ
                        </p>
                      )}
                    </div>
                  </th>
                ))}
                {filteredFormalColumns.map((fa) => (
                  <th
                    key={`formal-${fa.id}`}
                    className="min-w-[155px] max-w-[210px] border-r border-slate-200 px-3 py-2.5 align-top"
                  >
                    <div className="space-y-1">
                      <span className="inline-flex items-center rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-bold uppercase text-indigo-800">
                        {FORMAL_STAGE_LABELS[fa.stage] ?? fa.stage}
                      </span>
                      <div>
                        <Link
                          to={`/instructor/classes/${classId}/assessments/${fa.id}/grading`}
                          className="line-clamp-2 text-xs font-bold text-slate-900 hover:text-[#e66f2b] hover:underline"
                          title={fa.test.title}
                        >
                          {fa.test.title}
                        </Link>
                      </div>
                      <p className="text-[11px] font-normal text-slate-500">Quy đổi 100%</p>
                    </div>
                  </th>
                ))}
                <th className="min-w-[120px] bg-[#f4f8f1] px-3 py-3 text-center font-bold uppercase text-[#2f5d1e]">
                  Điểm TB
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredStudents.map((student, idx) => {
                const avg = computeStudentAverage(student);
                return (
                  <tr key={student.enrollmentId} className="hover:bg-slate-50/70">
                    <td className="sticky left-0 z-10 border-r border-slate-200 bg-white px-3 py-3 text-center font-semibold text-slate-500">
                      {idx + 1}
                    </td>
                    <td className="sticky left-12 z-10 border-r border-slate-200 bg-white px-3 py-3">
                      <Link
                        to={`/instructor/classes/${classId}/learners/${student.enrollmentId}`}
                        className="font-semibold text-slate-900 hover:text-[#e66f2b] hover:underline"
                      >
                        {student.fullName}
                      </Link>
                      <p className="text-xs text-slate-500">{student.email}</p>
                    </td>
                    {filteredLmsColumns.map((col) => {
                      const res = getLmsCellSummary(student, col);
                      return (
                        <td
                          key={col.activityId}
                          className="border-r border-slate-100 px-3 py-3 text-center text-xs"
                        >
                          {res.pendingAction ? (
                            <Link
                              to={`/classroom/${classId}/activities/${col.activityId}`}
                              className={`inline-block rounded bg-amber-50 px-2 py-0.5 hover:underline ${res.tone}`}
                              title="Bấm để mở trang chấm điểm hoạt động này"
                            >
                              {res.display}
                            </Link>
                          ) : (
                            <span className={res.tone}>{res.display}</span>
                          )}
                        </td>
                      );
                    })}
                    {filteredFormalColumns.map((fa) => {
                      const res = getFormalCellSummary(student, fa);
                      return (
                        <td
                          key={`formal-${fa.id}`}
                          className="border-r border-slate-100 px-3 py-3 text-center text-xs"
                        >
                          <span className={res.tone}>{res.display}</span>
                        </td>
                      );
                    })}
                    <td className="bg-[#f9fcf7] px-3 py-3 text-center">
                      {avg.avgPct !== null ? (
                        <div>
                          <p className="text-xs font-extrabold text-[#2f5d1e]">
                            {Math.round(avg.avgPct)}%
                          </p>
                          <p className="text-[11px] text-slate-500">
                            ({avg.gradedCount}/{scoredColumnsCount} bài)
                          </p>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">Chưa có</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {totalColumnsCount === 0 && (
        <p className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
          Lớp chưa có hoạt động chấm điểm nào (Bài tập, Quiz, Kiểm tra). Bấm{' '}
          <strong>Bật chế độ chỉnh sửa</strong> ở tab <strong>Khóa học</strong> để thêm hoạt động vào học phần; cột điểm mới sẽ tự động hiển thị tại đây.
        </p>
      )}
    </section>
  );
}

/**
 * Tab "Tiến độ học tập" cho Giảng viên — tổng hợp mức độ hoàn thành của từng học viên
 * và phân bố hoạt động theo từng Học phần (Section).
 */
export function InstructorClassProgressTab({
  classId,
  tree,
  unified,
  roster,
  localKinds,
}: {
  classId: string;
  tree: ClassTree;
  unified: UnifiedClassResults | null;
  roster: InstructorRoster | null;
  localKinds: Record<string, { kind: LocalActivityKind; meta: Record<string, unknown> }>;
}) {
  const students = useMemo(() => mergeStudentsList(unified, roster), [unified, roster]);
  const publishedTotal = unified?.summary.publishedActivities ?? 0;

  const avgCompletionPct = useMemo(() => {
    if (students.length === 0 || publishedTotal === 0) return 0;
    const sum = students.reduce((acc, s) => {
      const done = s.row?.stats.completedActivitiesCount ?? 0;
      return acc + Math.round((done / publishedTotal) * 100);
    }, 0);
    return Math.round(sum / students.length);
  }, [students, publishedTotal]);

  const highProgressCount = useMemo(() => {
    if (publishedTotal === 0) return 0;
    return students.filter((s) => {
      const done = s.row?.stats.completedActivitiesCount ?? 0;
      return (done / publishedTotal) * 100 >= 80;
    }).length;
  }, [students, publishedTotal]);

  const avgAttendancePct = useMemo(() => {
    const withAtt = students.filter((s) => (s.row?.stats.attendanceTotalCount ?? 0) > 0);
    if (withAtt.length === 0) return null;
    const sum = withAtt.reduce((acc, s) => {
      const st = s.row!.stats;
      return (
        acc +
        ((st.attendancePresentCount + st.attendanceLateCount) / st.attendanceTotalCount) * 100
      );
    }, 0);
    return Math.round(sum / withAtt.length);
  }, [students]);

  return (
    <section className="space-y-5" aria-label="Tiến độ học tập của lớp">
      {/* KPI cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>Hoàn thành trung bình</span>
            <GraduationCap className="size-4 text-[#5e9141]" aria-hidden="true" />
          </div>
          <p className="mt-1.5 text-2xl font-extrabold text-[#2f5d1e]">{avgCompletionPct}%</p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-[#76a35e]"
              style={{ width: `${Math.min(100, avgCompletionPct)}%` }}
            />
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>Hoạt động đã công bố</span>
            <BookOpen className="size-4 text-[#5e9141]" aria-hidden="true" />
          </div>
          <p className="mt-1.5 text-2xl font-extrabold text-slate-900">
            {publishedTotal} / {unified?.summary.totalActivities ?? 0}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Trên tổng {tree.sections.length} học phần
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>Học viên đạt từ 80%</span>
            <CheckCircle2 className="size-4 text-emerald-600" aria-hidden="true" />
          </div>
          <p className="mt-1.5 text-2xl font-extrabold text-emerald-700">
            {highProgressCount} / {students.length}
          </p>
          <p className="mt-1 text-xs text-slate-500">Mức hoàn thành nội dung tốt</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>Chuyên cần trung bình</span>
            <ClipboardCheck className="size-4 text-[#5e9141]" aria-hidden="true" />
          </div>
          <p className="mt-1.5 text-2xl font-extrabold text-slate-900">
            {avgAttendancePct !== null ? `${avgAttendancePct}%` : 'Chưa có'}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {unified?.summary.attendanceCount ?? 0} buổi điểm danh
          </p>
        </div>
      </div>

      {/* Per-student completion table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 bg-[#f8f9fa] px-4 py-3">
          <h2 className="text-sm font-bold text-slate-900">
            Tiến độ từng học sinh ({students.length})
          </h2>
        </div>
        {students.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-500">
            Lớp hiện chưa có học viên nào ghi danh.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[740px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-bold uppercase text-slate-600">
                  <th className="w-12 px-3 py-2.5 text-center">STT</th>
                  <th className="px-3 py-2.5">Học viên</th>
                  <th className="px-3 py-2.5">Hoạt động hoàn thành</th>
                  <th className="px-3 py-2.5 text-center">Bài tập nộp</th>
                  <th className="px-3 py-2.5 text-center">Quiz &amp; KT</th>
                  <th className="px-3 py-2.5 text-center">Điểm danh</th>
                  <th className="px-3 py-2.5">Đánh giá tiến độ</th>
                  <th className="px-3 py-2.5 text-right">Hồ sơ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {students.map((s, idx) => {
                  const st = s.row?.stats;
                  const done = st?.completedActivitiesCount ?? 0;
                  const pct = publishedTotal > 0 ? Math.round((done / publishedTotal) * 100) : 0;
                  const level =
                    pct >= 80
                      ? { label: 'Hoàn thành tốt', tone: 'bg-emerald-100 text-emerald-800' }
                      : pct >= 35
                        ? { label: 'Đang theo kịp', tone: 'bg-sky-100 text-sky-800' }
                        : pct > 0
                          ? { label: 'Cần nhắc nhở', tone: 'bg-amber-100 text-amber-900' }
                          : { label: 'Chưa bắt đầu', tone: 'bg-slate-100 text-slate-600' };
                  return (
                    <tr key={s.enrollmentId} className="hover:bg-slate-50/70">
                      <td className="px-3 py-3 text-center font-semibold text-slate-500">
                        {idx + 1}
                      </td>
                      <td className="px-3 py-3">
                        <p className="font-semibold text-slate-900">{s.fullName}</p>
                        <p className="text-xs text-slate-500">{s.email}</p>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="h-2.5 w-28 overflow-hidden rounded-full bg-slate-200">
                            <div
                              className="h-full rounded-full bg-[#76a35e]"
                              style={{ width: `${Math.min(100, pct)}%` }}
                            />
                          </div>
                          <span className="text-xs font-bold text-slate-800">
                            {done}/{publishedTotal} ({pct}%)
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-center text-xs font-semibold text-slate-800">
                        {st
                          ? `${st.submittedAssignments}/${unified?.summary.assignmentsCount ?? 0}`
                          : '0'}
                      </td>
                      <td className="px-3 py-3 text-center text-xs font-semibold text-slate-800">
                        {st ? st.submittedQuizzes : '0'}
                      </td>
                      <td className="px-3 py-3 text-center text-xs text-slate-700">
                        {st
                          ? `${st.attendancePresentCount + st.attendanceLateCount}/${st.attendanceTotalCount}`
                          : '0/0'}
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${level.tone}`}
                        >
                          {level.label}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right">
                        <Link
                          to={`/instructor/classes/${classId}/learners/${s.enrollmentId}`}
                          className="text-xs font-semibold text-[#e66f2b] hover:underline"
                        >
                          Xem chi tiết →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Section breakdown */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
        <h2 className="text-sm font-bold text-slate-900">
          Phân bổ hoạt động theo Học phần ({tree.sections.length} học phần)
        </h2>
        <div className="grid gap-3 md:grid-cols-2">
          {tree.sections.map((sec, idx) => {
            const publishedCount = sec.activities.filter((a) => a.state === 'PUBLISHED').length;
            const assignCount = sec.activities.filter(
              (a) => a.type === 'ASSIGNMENT' && !localKinds[a.id],
            ).length;
            const quizCount = sec.activities.filter(
              (a) => localKinds[a.id]?.kind === 'LOCAL_QUIZ' || a.type === 'QUIZ',
            ).length;
            const attCount = sec.activities.filter(
              (a) => localKinds[a.id]?.kind === 'LOCAL_ATTENDANCE',
            ).length;
            return (
              <div
                key={sec.id}
                className="rounded-lg border border-slate-200 bg-[#fcfdfb] p-3.5 space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-bold text-slate-900">
                    {idx + 1}. {sec.title}
                  </p>
                  <span className="shrink-0 rounded-full bg-[#edf5e8] px-2 py-0.5 text-[11px] font-semibold text-[#2f5d1e]">
                    {publishedCount}/{sec.activities.length} công bố
                  </span>
                </div>
                <div className="flex flex-wrap gap-2 text-[11px] text-slate-600">
                  <span>Bài học &amp; Tài liệu: {sec.activities.length - assignCount - quizCount - attCount}</span>
                  {assignCount > 0 && <span>· Bài tập: {assignCount}</span>}
                  {quizCount > 0 && <span>· Quiz/KT: {quizCount}</span>}
                  {attCount > 0 && <span>· Điểm danh: {attCount}</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
