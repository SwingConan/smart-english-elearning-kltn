import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import {
  progressLabels,
  useProductRead,
  type ClassProgress,
  type ClassProgressAssessmentBucket,
} from './api';
import { learnerClassLabel } from '@/features/enrollments/presentation';

const ACTIVITY_TYPE_LABELS: Record<string, string> = {
  LESSON: 'Bài học',
  RESOURCE: 'Tài liệu',
  ASSIGNMENT: 'Bài tập',
  QUIZ: 'Bài kiểm tra',
  LOCAL_QUIZ: 'Quiz luyện tập',
  LOCAL_ATTENDANCE: 'Điểm danh',
};

const SKILL_STATUS_BADGE: Record<string, { label: string; className: string }> = {
  STRONG: { label: 'Vững', className: 'bg-emerald-100 text-emerald-900 border-emerald-200' },
  MODERATE: { label: 'Trung bình khá', className: 'bg-sky-100 text-sky-900 border-sky-200' },
  NEEDS_IMPROVEMENT: { label: 'Cần củng cố', className: 'bg-amber-100 text-amber-950 border-amber-200' },
};

const ATTENDANCE_STATUS_LABEL: Record<string, string> = {
  PRESENT: 'Có mặt',
  LATE: 'Đi muộn',
  EXCUSED: 'Có phép',
  ABSENT: 'Vắng',
};

const TREND_LABEL: Record<string, string> = {
  IMPROVING: 'Đang tiến bộ',
  DECLINING: 'Cần ôn tập lại',
  STABLE: 'Ổn định',
};

function renderScoreBadge(score: number | null, maxScore: number | null) {
  if (score === null) return null;
  if (maxScore && maxScore > 0) {
    const pct = Math.round((score / maxScore) * 100);
    return `${score}/${maxScore} (${pct}%)`;
  }
  return String(score);
}

export function ClassProgressPage() {
  const { classId } = useParams();
  const { phase, data, reload } = useProductRead<ClassProgress>(`/v2/class-lms/classes/${classId}/progress`);
  const [expandedMap, setExpandedMap] = useState<Record<string, boolean>>({});
  const [allExpandedOverride, setAllExpandedOverride] = useState<boolean | null>(null);

  const sections = data?.sections ?? [];

  const defaultOpenIds = useMemo(() => {
    const ids = new Set<string>();
    if (sections.length <= 2) {
      for (const s of sections) ids.add(s.sectionId);
      return ids;
    }
    const activeOnes = sections.filter(
      (s) =>
        s.publishedGradesCount > 0 ||
        (s.completedOrSubmittedCount > 0 && s.completedOrSubmittedCount < s.openActivitiesCount) ||
        s.notStartedOpenCount > 0,
    );
    for (const s of activeOnes.slice(0, 2)) ids.add(s.sectionId);
    if (ids.size === 0 && sections[0]) ids.add(sections[0].sectionId);
    return ids;
  }, [sections]);

  if (phase === 'DENIED') {
    return (
      <main className="workspace-page mx-auto max-w-4xl space-y-4 py-6">
        <div role="alert" className="workspace-card border-rose-200 bg-rose-50/70 text-rose-900">
          Bạn không có quyền xem tiến độ học tập của lớp học này.
        </div>
        <Link to="/completion" className="inline-block text-sm font-semibold text-emerald-700 hover:underline">
          ← Quay lại Tiến độ &amp; Chứng chỉ
        </Link>
      </main>
    );
  }

  if (phase === 'ERROR') {
    return (
      <main className="workspace-page mx-auto max-w-4xl space-y-4 py-6">
        <div role="alert" className="workspace-card space-y-3 border-amber-200 bg-amber-50/60">
          <p className="text-sm font-semibold text-slate-900">Không tải được dữ liệu tiến độ lớp học.</p>
          <button type="button" className="btn-secondary text-xs" onClick={reload}>
            Thử lại
          </button>
        </div>
      </main>
    );
  }

  if (phase === 'LOADING' || !data) {
    return (
      <main className="workspace-page mx-auto max-w-5xl py-6">
        <p role="status" className="workspace-card text-sm text-slate-600">
          Đang tải báo cáo tiến độ lớp học…
        </p>
      </main>
    );
  }

  const ap = data.activityProgress;
  const assess = data.assessmentSummary;
  const ca = data.competencyAnalysis;
  const recommendations = data.recommendations ?? [];
  const q05 = data.q05Completion;

  const nonEmptyBuckets: Array<{ key: string; bucket: ClassProgressAssessmentBucket }> = assess
    ? [
        { key: 'assignments', bucket: assess.assignments },
        { key: 'quizzes', bucket: assess.quizzes },
        { key: 'regularExams', bucket: assess.regularExams },
        { key: 'midtermExams', bucket: assess.midtermExams },
        { key: 'finalExams', bucket: assess.finalExams },
      ].filter((item) => item.bucket.totalOpen > 0 || item.bucket.items.length > 0)
    : [];

  const hasLessons = Boolean(assess && assess.lessonsAndResources.totalOpen > 0);
  const hasAttendance = Boolean(
    assess && (assess.attendance.totalOpen > 0 || assess.attendance.items.length > 0),
  );

  const attendanceChecked =
    assess?.attendance.checkedCount ?? data.summary?.attendanceCheckedCount ?? 0;
  const attendanceTotal = assess?.attendance.totalOpen ?? 0;

  const isSectionOpen = (sectionId: string) => {
    if (sectionId in expandedMap) return expandedMap[sectionId];
    if (allExpandedOverride !== null) return allExpandedOverride;
    return defaultOpenIds.has(sectionId);
  };

  const toggleAllSections = () => {
    const currentlyAllOpen = sections.every((s) => isSectionOpen(s.sectionId));
    const next = !currentlyAllOpen;
    setExpandedMap({});
    setAllExpandedOverride(next);
  };

  return (
    <main className="workspace-page mx-auto max-w-5xl space-y-6 py-6">
      {/* Header & Navigation */}
      <header className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1.5">
          <Link
            to="/completion"
            className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:underline"
          >
            ← Quay lại Tiến độ &amp; Chứng chỉ
          </Link>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">
            Tiến độ học tập · {learnerClassLabel(data.class.name ?? '', data.class.code ?? '')}
          </h1>
          <p className="text-xs text-slate-500">
            Mã lớp: <span className="font-mono font-semibold text-slate-700">{data.class.code}</span>
            {data.observedAt && (
              <> · Cập nhật lúc {new Date(data.observedAt).toLocaleString('vi-VN')}</>
            )}
          </p>
        </div>

        <nav aria-label="Điều hướng lớp học" className="flex flex-wrap items-center gap-2">
          <Link className="btn-primary text-xs" to={`/classroom/${classId}`}>
            Vào lớp học
          </Link>
          <Link className="btn-secondary text-xs" to={`/classroom/${classId}/gradebook`}>
            Bảng điểm
          </Link>
          <Link className="btn-secondary text-xs" to="/student/bookings">
            Đặt lịch tư vấn 1:1
          </Link>
          <button type="button" className="btn-secondary text-xs" onClick={reload}>
            Tải lại
          </button>
        </nav>
      </header>

      {/* Top Overview Cards */}
      <section aria-label="Tổng quan tiến độ" className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Hoàn thành nội dung mở
          </p>
          <p className="mt-2 text-2xl font-extrabold text-slate-900">
            {ap
              ? ap.completionRatioPercent !== null
                ? `${ap.completionRatioPercent}% (${ap.completedOrSubmittedCount}/${ap.openActivitiesCount})`
                : `${ap.completedOrSubmittedCount}/${ap.openActivitiesCount} hoạt động`
              : `${data.summary?.completedOrSubmittedCount ?? 0}/${data.summary?.totalActivities ?? data.entries.length}`}
          </p>
          {ap && (
            <p className="mt-1 text-xs text-slate-600">
              {ap.completedCount} hoàn thành · {ap.notStartedOpenCount} chưa bắt đầu
              {ap.pendingGradingOrReleaseCount > 0 && ` · ${ap.pendingGradingOrReleaseCount} chờ chấm`}
              {ap.upcomingActivitiesCount > 0 && ` · ${ap.upcomingActivitiesCount} sắp mở`}
            </p>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Điểm danh &amp; Kết quả
          </p>
          <p className="mt-2 text-2xl font-extrabold text-slate-900">
            {attendanceTotal > 0
              ? `${attendanceChecked}/${attendanceTotal} buổi`
              : `${data.summary?.publishedGradesCount ?? 0} bài có điểm`}
          </p>
          <p className="mt-1 text-xs text-slate-600">
            {attendanceTotal > 0
              ? `${data.summary?.publishedGradesCount ?? 0} bài kiểm tra / bài tập đã công bố điểm`
              : 'Chưa phát sinh buổi điểm danh được mở'}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Tình trạng chứng chỉ
          </p>
          <p className="mt-2 text-base font-bold text-slate-900">
            {q05?.statusLabel || (data.certificateIssued ? 'Đã cấp chứng chỉ' : 'Đang theo dõi tiến độ')}
          </p>
          <p className="mt-1 text-xs text-slate-600">
            {q05?.certificateCode ? (
              <>
                Mã: <span className="font-mono font-semibold text-emerald-800">{q05.certificateCode}</span>
              </>
            ) : (
              'Hoàn thành đủ bài tập và chuyên cần để đủ điều kiện xét duyệt.'
            )}
          </p>
        </div>
      </section>

      {/* Assessment & Learning Summary */}
      {(hasLessons || nonEmptyBuckets.length > 0 || hasAttendance) && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-bold text-slate-900">Tổng hợp theo loại hoạt động</h2>
            {data.analysisMeta?.thresholdsNote && (
              <span className="text-xs text-slate-500">{data.analysisMeta.thresholdsNote}</span>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {hasLessons && assess && (
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
                <p className="text-xs font-bold text-slate-800">{assess.lessonsAndResources.label}</p>
                <p className="mt-1.5 text-lg font-extrabold text-slate-900">
                  {assess.lessonsAndResources.completed}/{assess.lessonsAndResources.totalOpen}
                </p>
                <p className="text-xs text-slate-500">
                  Đã xem/học · {assess.lessonsAndResources.notStarted} chưa mở
                </p>
              </div>
            )}

            {nonEmptyBuckets.map(({ key, bucket }) => (
              <div key={key} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-bold text-slate-800">{bucket.label}</p>
                  {bucket.averagePercent !== null && (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-900">
                      TB {bucket.averagePercent}%
                    </span>
                  )}
                </div>
                <p className="mt-1.5 text-lg font-extrabold text-slate-900">
                  {bucket.totalOpen > 0
                    ? `${bucket.completedOrSubmitted}/${bucket.totalOpen}`
                    : `${bucket.items.length} bài sắp mở`}
                </p>
                <p className="text-xs text-slate-500">
                  {bucket.totalOpen > 0 ? (
                    <>
                      {bucket.publishedCount} đã công bố điểm
                      {bucket.pendingCount > 0 ? ` · ${bucket.pendingCount} chờ chấm` : ''}
                    </>
                  ) : (
                    'Chưa tới lịch mở làm bài theo kế hoạch lớp'
                  )}
                </p>
              </div>
            ))}

            {hasAttendance && assess && (
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
                <p className="text-xs font-bold text-slate-800">{assess.attendance.label}</p>
                <p className="mt-1.5 text-lg font-extrabold text-slate-900">
                  {assess.attendance.checkedCount}/{assess.attendance.totalOpen}
                </p>
                <p className="text-xs text-slate-500">
                  {assess.attendance.presentCount} có mặt
                  {assess.attendance.lateCount > 0 ? ` · ${assess.attendance.lateCount} đi muộn` : ''}
                </p>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Competency & Weakness Analysis */}
      {ca && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-bold text-slate-900">Đánh giá năng lực &amp; Lỗi cần ôn lại</h2>
            {ca.hasEnoughData && ca.trendAnalysis.status !== 'INSUFFICIENT_DATA' && (
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
                Xu hướng: {TREND_LABEL[ca.trendAnalysis.status] ?? ca.trendAnalysis.status}
              </span>
            )}
          </div>

          {!ca.hasEnoughData ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
              {ca.insufficientDataReason ||
                'Chưa có bài kiểm tra hoặc bài tập nào được công bố điểm trong lớp để phân tích kỹ năng.'}
            </div>
          ) : (
            <div className="space-y-4">
              {/* Evaluated Skills Only */}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {ca.skillBreakdown
                  .filter((s) => s.status !== 'INSUFFICIENT_DATA')
                  .map((skill) => {
                    const badge = SKILL_STATUS_BADGE[skill.status];
                    return (
                      <div key={skill.skill} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-slate-800">{skill.label}</span>
                          {badge && (
                            <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${badge.className}`}>
                              {badge.label}
                            </span>
                          )}
                        </div>
                        <p className="mt-2 text-xl font-extrabold text-slate-900">
                          {skill.percentage !== null ? `${skill.percentage}%` : '—'}
                        </p>
                        <p className="text-xs text-slate-500">
                          {skill.earnedPoints}/{skill.maxPoints} điểm ({skill.correctItems}/{skill.totalItems} mục)
                        </p>
                      </div>
                    );
                  })}
              </div>

              {/* Strengths & Weaknesses */}
              {(ca.strengths.length > 0 || ca.weaknesses.length > 0) && (
                <div className="grid gap-3 md:grid-cols-2">
                  {ca.strengths.length > 0 && (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-3.5 space-y-1.5">
                      <p className="text-xs font-bold text-emerald-900">Điểm mạnh nổi bật</p>
                      <ul className="space-y-1 text-xs text-slate-700">
                        {ca.strengths.map((s) => (
                          <li key={s.skill}>
                            <strong>{s.label} ({s.percentage}%):</strong> {s.evidenceSummary}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {ca.weaknesses.length > 0 && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3.5 space-y-1.5">
                      <p className="text-xs font-bold text-amber-950">Kỹ năng cần củng cố</p>
                      <ul className="space-y-1 text-xs text-slate-700">
                        {ca.weaknesses.map((w) => (
                          <li key={w.skill}>
                            <strong>{w.label} ({w.percentage}%):</strong> {w.evidenceSummary}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* Trend Summary if available */}
              {ca.trendAnalysis.message && (
                <p className="text-xs text-slate-600">{ca.trendAnalysis.message}</p>
              )}

              {/* Specific Weakness Evidence */}
              {ca.weaknessEvidence.length > 0 && (
                <div className="space-y-2.5 pt-2 border-t border-slate-100">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-600">
                    Câu hỏi / tiêu chí chưa đạt trọn điểm ({ca.weaknessEvidence.length})
                  </p>
                  <div className="space-y-2">
                    {ca.weaknessEvidence.map((w) => (
                      <div key={w.id} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 text-xs space-y-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-bold text-slate-900">
                            {w.activityTitle} · {w.skillLabel}
                          </span>
                          <span className="font-semibold text-rose-700">
                            {w.earnedPoints}/{w.maxPoints} điểm
                          </span>
                        </div>
                        <p className="font-medium text-slate-800">{w.prompt}</p>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-slate-600">
                          <span>Bạn đã chọn/nộp: {w.learnerAnswer}</span>
                          {w.correctAnswer && (
                            <span className="font-semibold text-emerald-800">Đáp án đúng: {w.correctAnswer}</span>
                          )}
                        </div>
                        {w.explanation && <p className="text-slate-600">{w.explanation}</p>}
                        {w.activityId && (
                          <Link
                            to={`/classroom/${classId}/activities/${w.activityId}`}
                            className="inline-block font-semibold text-emerald-700 hover:underline"
                          >
                            Xem lại bài làm →
                          </Link>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* Next Step Recommendations */}
      {recommendations.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs space-y-3">
          <h2 className="text-base font-bold text-slate-900">Gợi ý bước học tiếp theo</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {recommendations.map((rec) => (
              <div
                key={rec.id}
                className="flex flex-col justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4"
              >
                <div className="space-y-1">
                  <p className="text-sm font-bold text-slate-900">{rec.title}</p>
                  <p className="text-xs text-slate-500">{rec.subtitle}</p>
                  <p className="text-xs text-slate-700">{rec.reason}</p>
                </div>
                <div>
                  <Link
                    to={rec.href}
                    className="inline-flex items-center rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-900 hover:bg-emerald-100"
                  >
                    Mở nội dung ôn tập
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Detailed Sections (Collapsible Accordions) */}
      {sections.length > 0 ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-bold text-slate-900">Chi tiết tiến độ theo học phần</h2>
              <p className="text-xs text-slate-500">{sections.length} học phần đã xuất bản</p>
            </div>
            {sections.length > 1 && (
              <button type="button" className="btn-secondary text-xs" onClick={toggleAllSections}>
                {sections.every((s) => isSectionOpen(s.sectionId)) ? 'Thu gọn tất cả' : 'Mở rộng tất cả'}
              </button>
            )}
          </div>

          <div className="space-y-2.5">
            {sections.map((sec) => {
              const open = isSectionOpen(sec.sectionId);
              return (
                <div key={sec.sectionId} className="overflow-hidden rounded-xl border border-slate-200">
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() =>
                      setExpandedMap((prev) => ({
                        ...prev,
                        [sec.sectionId]: !open,
                      }))
                    }
                    className="flex w-full items-center justify-between gap-3 bg-slate-50/90 px-4 py-3 text-left hover:bg-slate-100/80"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-slate-900">{sec.title}</p>
                      <p className="text-xs text-slate-500">
                        {sec.completedOrSubmittedCount}/{sec.openActivitiesCount} hoạt động đã hoàn thành
                        {sec.upcomingActivitiesCount > 0 ? ` · ${sec.upcomingActivitiesCount} sắp mở` : ''}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2.5">
                      {sec.completionRatioPercent !== null && (
                        <span
                          className={
                            'rounded-full px-2.5 py-0.5 text-xs font-bold ' +
                            (sec.completionRatioPercent >= 100
                              ? 'bg-emerald-100 text-emerald-900'
                              : 'bg-white text-slate-700 border border-slate-200')
                          }
                        >
                          {sec.completionRatioPercent}%
                        </span>
                      )}
                      <span className="text-xs font-semibold text-slate-500">{open ? '▲' : '▼'}</span>
                    </div>
                  </button>

                  {open && (
                    <div className="divide-y divide-slate-100 bg-white">
                      {sec.activities.map((a) => {
                        const kindKey = a.localKind || a.type;
                        const kindLabel = ACTIVITY_TYPE_LABELS[kindKey] || a.type;
                        const statusText = a.isUpcoming
                          ? 'Sắp mở'
                          : a.attendanceStatus
                            ? `Điểm danh: ${ATTENDANCE_STATUS_LABEL[a.attendanceStatus] ?? a.attendanceStatus}`
                            : progressLabels[a.state] ?? a.state;
                        const scoreBadge = renderScoreBadge(a.score, a.maxScore);
                        const isDone = a.state === 'COMPLETED' || a.state === 'PUBLISHED';

                        return (
                          <div
                            key={a.activityId}
                            className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm"
                          >
                            <div className="min-w-0 flex-1 space-y-0.5">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-semibold text-slate-900">{a.title}</span>
                                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">
                                  {kindLabel}
                                </span>
                              </div>
                              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                                <span className={isDone ? 'font-medium text-emerald-700' : 'text-slate-600'}>
                                  {statusText}
                                </span>
                                {scoreBadge && (
                                  <span className="font-bold text-slate-800">· Điểm: {scoreBadge}</span>
                                )}
                                {a.feedback && <span>· Nhận xét: {a.feedback}</span>}
                              </div>
                            </div>
                            <Link
                              to={`/classroom/${classId}/activities/${a.activityId}`}
                              className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                            >
                              Mở hoạt động
                            </Link>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ) : (
        /* Legacy fallback for payloads without sections array */
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs space-y-2.5">
          <h2 className="text-base font-bold text-slate-900">Danh sách hoạt động</h2>
          <div className="divide-y divide-slate-100">
            {data.entries.map((e) => (
              <div key={e.activityId} className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-sm">
                <div>
                  <p className="font-semibold text-slate-900">{e.title}</p>
                  <p className="text-xs text-slate-500">{progressLabels[e.state] ?? e.state}</p>
                </div>
                <Link
                  to={`/classroom/${classId}/activities/${e.activityId}`}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Mở hoạt động
                </Link>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Compact Placement Reference Footer (only when learner has taken Placement) */}
      {data.placementReference?.hasPlacementAttempt && data.placementReference.latestAttempt && (
        <section className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-xs text-slate-600 flex flex-wrap items-center justify-between gap-2">
          <span>
            <strong>Tham chiếu Kiểm tra đầu vào:</strong> {data.placementReference.latestAttempt.title}{' '}
            {data.placementReference.latestAttempt.score !== null &&
              `(${data.placementReference.latestAttempt.score}/${data.placementReference.latestAttempt.maxScore ?? '—'})`}
          </span>
          {data.placementReference.separationNotice && (
            <span className="text-slate-500">{data.placementReference.separationNotice}</span>
          )}
        </section>
      )}
    </main>
  );
}
