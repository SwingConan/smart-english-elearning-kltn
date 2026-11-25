import { Link } from 'react-router';
import { classCodeLabel } from '@/features/demo/presentation';
import type { UnifiedClassResults } from './lms-local-api';
import { schoolTimestamp } from './school-time';

function activityRoute(classId: string, activityId: string, localKind: string | null, baseType: string) {
  if (localKind === 'LOCAL_QUIZ' || localKind === 'LOCAL_ATTENDANCE') {
    return `/classroom/${classId}/activities/${activityId}`;
  }
  if (baseType === 'QUIZ') return `/classroom/${classId}/activities/${activityId}/quiz`;
  return `/classroom/${classId}/activities/${activityId}`;
}

export function UnifiedGradebookPanel({
  classId,
  unified,
  compactHeading,
}: {
  classId: string;
  unified: UnifiedClassResults;
  compactHeading?: string;
}) {
  if (!unified || !Array.isArray(unified.activityColumns) || !unified.summary) {
    return null;
  }
  const { summary, activityColumns, studentRows, formalAssessments, draftCoreQuizCount, editable } =
    unified;
  const quizCols = activityColumns.filter((c) => c.localKind === 'LOCAL_QUIZ');
  const assignCols = activityColumns.filter((c) => c.baseType === 'ASSIGNMENT' && !c.localKind);
  const attCols = activityColumns.filter((c) => c.localKind === 'LOCAL_ATTENDANCE');

  if (!editable) {
    const me = studentRows[0];
    return (
      <section className="space-y-5">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-[#2f7d32]">
                Sổ điểm & Tiến độ LMS thống nhất (Section → Activity)
              </p>
              <h2 className="mt-1 text-lg font-extrabold text-slate-900">
                {compactHeading || 'Tổng hợp kết quả Bài tập, Quiz/Kiểm tra & Điểm danh'}
              </h2>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
              {unified.class.code} · {unified.class.name}
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-xs text-slate-500">Hoạt động đã làm</p>
              <p className="mt-1 text-xl font-extrabold text-slate-900">
                {me?.stats.completedActivitiesCount ?? 0} / {summary.publishedActivities}
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-xs text-slate-500">Điểm Bài tập</p>
              <p className="mt-1 text-xl font-extrabold text-indigo-700">
                {me?.stats.publishedAssignmentGrades ?? 0} / {summary.assignmentsCount}
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-xs text-slate-500">Quiz / Kiểm tra công bố</p>
              <p className="mt-1 text-xl font-extrabold text-emerald-700">
                {me?.stats.publishedQuizGrades ?? 0} / {quizCols.length}
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-xs text-slate-500">Điểm danh buổi học</p>
              <p className="mt-1 text-xl font-extrabold text-amber-700">
                {(me?.stats.attendancePresentCount ?? 0) + (me?.stats.attendanceLateCount ?? 0)} /{' '}
                {attCols.length}
              </p>
            </div>
          </div>
        </div>

        {/* Quiz & Kiểm tra trong LMS */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
          <h3 className="text-base font-bold text-slate-900">
            Quiz & Bài kiểm tra trong lớp ({quizCols.length})
          </h3>
          {!quizCols.length ? (
            <p className="text-sm text-slate-500">Chưa có Quiz hoặc bài kiểm tra được công bố.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                    <th className="py-2 pr-3">Hoạt động</th>
                    <th className="py-2 pr-3">Phân loại</th>
                    <th className="py-2 pr-3">Trạng thái</th>
                    <th className="py-2 pr-3">Điểm số</th>
                    <th className="py-2 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {quizCols.map((col) => {
                    const cell = me?.quizzes[col.activityId];
                    const published = Boolean(cell?.gradePublished);
                    return (
                      <tr key={col.activityId}>
                        <td className="py-2.5 pr-3 font-semibold text-slate-900">{col.title}</td>
                        <td className="py-2.5 pr-3 text-xs font-semibold text-violet-800">
                          {col.kindLabel}
                        </td>
                        <td className="py-2.5 pr-3 text-xs">
                          {!cell || cell.attemptStatus === 'NOT_STARTED' ? (
                            <span className="rounded bg-slate-100 px-2 py-0.5 text-slate-700">
                              Chưa làm
                            </span>
                          ) : cell.attemptStatus === 'IN_PROGRESS' ? (
                            <span className="rounded bg-sky-100 px-2 py-0.5 text-sky-800">
                              Đang làm
                            </span>
                          ) : cell.gradingStatus === 'PENDING_MANUAL_GRADE' ? (
                            <span className="rounded bg-amber-100 px-2 py-0.5 text-amber-900">
                              Chờ GV chấm tự luận
                            </span>
                          ) : !published ? (
                            <span className="rounded bg-amber-100 px-2 py-0.5 text-amber-900">
                              Chờ GV công bố điểm
                            </span>
                          ) : (
                            <span className="rounded bg-emerald-100 px-2 py-0.5 text-emerald-900">
                              Đã công bố
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 pr-3 font-bold text-slate-900">
                          {published && cell?.score !== null && cell?.score !== undefined ? (
                            <span>
                              {cell.score} / {cell.maxScore ?? col.maxScore ?? '—'}
                              {cell.passed !== null && (
                                <span
                                  className={`ml-2 rounded px-1.5 py-0.5 text-[11px] ${
                                    cell.passed
                                      ? 'bg-emerald-50 text-emerald-700'
                                      : 'bg-rose-50 text-rose-700'
                                  }`}
                                >
                                  {cell.passed ? 'Đạt' : 'Chưa đạt'}
                                </span>
                              )}
                            </span>
                          ) : (
                            <span className="font-normal text-slate-500">—</span>
                          )}
                        </td>
                        <td className="py-2.5 text-right">
                          <Link
                            to={activityRoute(classId, col.activityId, col.localKind, col.baseType)}
                            className="text-xs font-semibold text-indigo-700 hover:underline"
                          >
                            Mở bài →
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

        {/* Bài tập trong Section */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
          <h3 className="text-base font-bold text-slate-900">
            Bài tập trong lớp ({assignCols.length})
          </h3>
          {!assignCols.length ? (
            <p className="text-sm text-slate-500">Chưa có bài tập nào được công bố.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                    <th className="py-2 pr-3">Bài tập</th>
                    <th className="py-2 pr-3">Trạng thái nộp</th>
                    <th className="py-2 pr-3">Điểm số</th>
                    <th className="py-2 pr-3">Nhận xét</th>
                    <th className="py-2 text-right">Chi tiết</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {assignCols.map((col) => {
                    const cell = me?.assignments[col.activityId];
                    return (
                      <tr key={col.activityId}>
                        <td className="py-2.5 pr-3 font-semibold text-slate-900">{col.title}</td>
                        <td className="py-2.5 pr-3 text-xs">
                          {cell?.submissionState === 'SUBMITTED' ? (
                            <span className="rounded bg-emerald-100 px-2 py-0.5 text-emerald-800">
                              Đã nộp
                            </span>
                          ) : cell?.submissionState === 'DRAFT' ? (
                            <span className="rounded bg-amber-100 px-2 py-0.5 text-amber-800">
                              Bản nháp
                            </span>
                          ) : (
                            <span className="rounded bg-slate-100 px-2 py-0.5 text-slate-600">
                              Chưa nộp
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 pr-3 font-bold text-slate-900">
                          {cell?.gradeState === 'PUBLISHED' && cell.score !== null ? (
                            <span>
                              {cell.score} / {cell.maxScore}
                            </span>
                          ) : (
                            <span className="text-xs font-normal text-slate-500">
                              {cell?.submissionState === 'SUBMITTED' ? 'Chờ chấm / công bố' : '—'}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 pr-3 text-xs text-slate-600">
                          {cell?.gradeState === 'PUBLISHED' && cell.feedback ? cell.feedback : '—'}
                        </td>
                        <td className="py-2.5 text-right">
                          <Link
                            to={activityRoute(classId, col.activityId, col.localKind, col.baseType)}
                            className="text-xs font-semibold text-indigo-700 hover:underline"
                          >
                            Xem bài →
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

        {/* Điểm danh buổi học */}
        {attCols.length > 0 && (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
            <h3 className="text-base font-bold text-slate-900">
              Điểm danh trong lớp ({attCols.length})
            </h3>
            <ul className="divide-y divide-slate-100 text-sm">
              {attCols.map((col) => {
                const rec = me?.attendance[col.activityId];
                return (
                  <li key={col.activityId} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <div>
                      <p className="font-semibold text-slate-900">{col.title}</p>
                      <p className="text-xs text-slate-500">
                        {rec?.checkedInAt ? `Check-in: ${schoolTimestamp(rec.checkedInAt)}` : 'Chưa ghi nhận check-in'}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                          rec?.status === 'PRESENT'
                            ? 'bg-emerald-100 text-emerald-800'
                            : rec?.status === 'LATE'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {rec?.status === 'PRESENT'
                          ? 'Có mặt'
                          : rec?.status === 'LATE'
                            ? 'Đi muộn'
                            : 'Chưa điểm danh'}
                      </span>
                      <Link
                        to={activityRoute(classId, col.activityId, col.localKind, col.baseType)}
                        className="text-xs font-semibold text-indigo-700 hover:underline"
                      >
                        Mở →
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {(formalAssessments.length > 0 || draftCoreQuizCount > 0) && (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-700 space-y-1.5">
            {formalAssessments.length > 0 && (
              <p>
                <strong>Bài đánh giá định kỳ chính thức ({formalAssessments.length}):</strong>{' '}
                {formalAssessments.filter((fa) => fa.isActive).map((fa) => fa.title).join(' · ') ||
                  'Chưa mở lịch'}
              </p>
            )}
            {draftCoreQuizCount > 0 && (
              <p className="text-slate-600">
                Hiện có {draftCoreQuizCount} đầu mục Quiz hệ thống ở trạng thái nháp chờ quy trình
                phê duyệt học vụ.
              </p>
            )}
          </div>
        )}
      </section>
    );
  }

  // INSTRUCTOR UNIFIED MATRIX
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-[#2f7d32]">
            Tổng hợp điểm & hoạt động lớp học
          </p>
          <h2 className="mt-1 text-xl font-extrabold text-slate-900">
            Tổng hợp chấm bài, Quiz / Kiểm tra & Điểm danh —{' '}
            {classCodeLabel(unified.class.code) || unified.class.code}
          </h2>
        </div>
        <Link
          to={`/classroom/${classId}`}
          className="rounded-lg border border-slate-300 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          ← Quản lý Section & Activity
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="text-xs text-slate-500">Học viên đang học</p>
          <p className="mt-1 text-2xl font-extrabold text-slate-900">{studentRows.length}</p>
        </div>
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="text-xs text-slate-500">Hoạt động LMS (BT / Quiz / ĐD)</p>
          <p className="mt-1 text-2xl font-extrabold text-indigo-700">
            {assignCols.length} / {quizCols.length} / {attCols.length}
          </p>
        </div>
        <div className="rounded-xl bg-amber-50 p-3">
          <p className="text-xs text-amber-800">Bài tập + Tự luận chờ chấm</p>
          <p className="mt-1 text-2xl font-extrabold text-amber-900">
            {summary.awaitingAssignmentGrades + summary.awaitingManualQuizGrades}
          </p>
        </div>
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="text-xs text-slate-500">Bài kiểm tra chính thức / Nháp</p>
          <p className="mt-1 text-2xl font-extrabold text-slate-800">
            {summary.formalAssessmentCount} / {summary.draftCoreQuizCount}
          </p>
        </div>
      </div>

      {assignCols.length + quizCols.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Mở nhanh từng hoạt động để chấm & công bố điểm
          </p>
          <div className="flex flex-wrap gap-2">
            {[...assignCols, ...quizCols, ...attCols].map((col) => (
              <Link
                key={col.activityId}
                to={activityRoute(classId, col.activityId, col.localKind, col.baseType)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-[#f8f9fa] px-3 py-1.5 text-xs font-semibold text-slate-800 hover:border-[#76a35e] hover:text-[#2f5d1e]"
              >
                <span className="rounded bg-white px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
                  {col.kindLabel}
                </span>
                {col.title}
                {col.state === 'DRAFT' && (
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-900">
                    Nháp
                  </span>
                )}
              </Link>
            ))}
          </div>
        </div>
      )}

      {studentRows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                <th className="py-2 pr-3">Học viên</th>
                <th className="py-2 pr-3">Bài tập (Nộp / Công bố)</th>
                <th className="py-2 pr-3">Quiz & KT (Nộp / Công bố)</th>
                <th className="py-2 pr-3">Điểm danh</th>
                <th className="py-2">Chi tiết điểm gần nhất</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {studentRows.map((row) => {
                const quizSummaries = quizCols
                  .map((col) => ({ col, cell: row.quizzes[col.activityId] }))
                  .filter((x) => x.cell && x.cell.attemptStatus === 'SUBMITTED');
                const assignSummaries = assignCols
                  .map((col) => ({ col, cell: row.assignments[col.activityId] }))
                  .filter((x) => x.cell && x.cell.submissionState === 'SUBMITTED');
                return (
                  <tr key={row.enrollmentId}>
                    <td className="py-2.5 pr-3">
                      <p className="font-semibold text-slate-900">{row.fullName}</p>
                      <p className="text-xs text-slate-500">{row.email}</p>
                    </td>
                    <td className="py-2.5 pr-3 text-xs font-semibold text-slate-800">
                      {row.stats.submittedAssignments} / {row.stats.publishedAssignmentGrades} công bố
                    </td>
                    <td className="py-2.5 pr-3 text-xs font-semibold text-slate-800">
                      {row.stats.submittedQuizzes} / {row.stats.publishedQuizGrades} công bố
                    </td>
                    <td className="py-2.5 pr-3 text-xs text-slate-700">
                      {row.stats.attendancePresentCount} có mặt · {row.stats.attendanceLateCount} muộn /{' '}
                      {row.stats.attendanceTotalCount}
                    </td>
                    <td className="py-2.5 text-xs text-slate-700">
                      <div className="flex flex-wrap gap-1.5">
                        {assignSummaries.map(({ col, cell }) => (
                          <Link
                            key={col.activityId}
                            to={activityRoute(classId, col.activityId, col.localKind, col.baseType)}
                            className="rounded bg-indigo-50 px-2 py-0.5 font-medium text-indigo-900 hover:underline"
                          >
                            {col.title}:{' '}
                            {cell.score !== null ? `${cell.score}/${cell.maxScore}` : 'Chờ chấm'}
                          </Link>
                        ))}
                        {quizSummaries.map(({ col, cell }) => (
                          <Link
                            key={col.activityId}
                            to={activityRoute(classId, col.activityId, col.localKind, col.baseType)}
                            className="rounded bg-violet-50 px-2 py-0.5 font-medium text-violet-900 hover:underline"
                          >
                            {col.title}:{' '}
                            {cell.gradingStatus === 'PENDING_MANUAL_GRADE'
                              ? 'Chờ chấm TL'
                              : cell.score !== null
                                ? `${cell.score}/${cell.maxScore}`
                                : 'Đã nộp'}
                          </Link>
                        ))}
                        {!assignSummaries.length && !quizSummaries.length && (
                          <span className="text-slate-400">Chưa có bài nộp LMS</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {unified.policyNotes.filter((n) => n !== 'CHƯA CHỐT #5').length > 0 && (
        <ul className="space-y-1 rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-950">
          {unified.policyNotes
            .filter((n) => n !== 'CHƯA CHỐT #5')
            .map((note) => (
              <li key={note}>
                •{' '}
                {note
                  .replace(/\s*\(?CHƯA CHỐT #5\)?/gi, '')
                  .replace(/\s*\bQ03\b/g, '')
                  .trim()}
              </li>
            ))}
        </ul>
      )}
    </section>
  );
}
