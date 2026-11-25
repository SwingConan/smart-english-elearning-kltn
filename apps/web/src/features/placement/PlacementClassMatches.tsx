import { Link } from 'react-router';
import { modalityLabel } from '@/features/catalog/display';
import type { WorkflowDiagnostic } from './workflow-api';

const reasons: Record<string, string> = {
  APPROVED_CRITERIA_MISSING: 'Hiện chưa có cấu hình gợi ý lớp cho chế độ kiểm tra này.',
  PUBLISHED_ALL_REQUIRED_SKILLS_MISSING: 'Cần hoàn tất chấm đủ các kỹ năng trước khi gợi ý lớp.',
  MINIMUM_SAMPLE_OR_SKILL_MISSING: 'Chưa làm đủ số câu hoặc kỹ năng để xếp lớp phù hợp.',
  CRITERIA_INTEGRITY_REVIEW_REQUIRED: 'Điều kiện xếp lớp đang được Học vụ cập nhật lại.',
  NO_ELIGIBLE_ACTUAL_CLASS:
    'Hiện chưa có lớp đang nhận học viên với lịch khai giảng phù hợp.',
  APPROVED_INTERNAL_RULE_NOT_MET:
    'Kết quả chưa đáp ứng điều kiện đầu vào của lớp theo tiêu chí đã duyệt.',
  CLASS_FULL_OR_CAPACITY_UNVERIFIED: 'Lớp đã đủ sĩ số hoặc chưa xác minh sức chứa.',
  APPROVED_ACTUAL_SCHEDULE_INCOMPLETE:
    'Lịch học hoặc thông tin lớp đang được hoàn thiện.',
  PROGRAM_SKILL_SCOPE_MISMATCH: 'Chương trình của lớp chưa đúng nhóm kỹ năng của bài kiểm tra.',
};

function formatVnd(amount: number | null | undefined, pricingType?: string) {
  if (pricingType === 'FREE' || amount === 0) return 'Miễn phí';
  if (amount == null) return 'Theo biểu phí Học vụ';
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
}

export function PlacementClassMatches({
  matching,
  recommendation,
  aiClassFitAdvisory,
  diagnosis,
  goals,
  aiLiveActive,
}: {
  matching: WorkflowDiagnostic['matching'];
  recommendation?: WorkflowDiagnostic['recommendation'];
  aiClassFitAdvisory?: string;
  diagnosis?: WorkflowDiagnostic['diagnosis'];
  goals?: Record<string, number | null>;
  aiLiveActive?: boolean;
}) {
  const ov = diagnosis?.overallSummary;
  const weakParts = (diagnosis?.partBreakdown ?? []).filter(
    (p) => p.answered > 0 && (p.answeredAccuracyPct ?? p.accuracyPct ?? 0) < 70,
  );
  const weakAreasSummary = [
    weakParts.length > 0 ? weakParts.map((p) => `${p.part} (${p.answeredAccuracyPct ?? p.accuracyPct}%)`).join(', ') : '',
    diagnosis?.improvements?.length
      ? diagnosis.improvements
          .slice(0, 2)
          .map((i) => i.titleVi)
          .join('; ')
      : '',
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <section
      className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
      aria-label="Gợi ý lớp"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-indigo-700">
            Ứng dụng AI (2/2) · Phân tích nhận xét đầu vào để gợi ý lớp{' '}
            {aiLiveActive ? '· Gemini AI' : ''}
          </p>
          <h2 className="mt-1 text-xl font-bold text-slate-900">
            3. Khóa học &amp; Lớp phù hợp với trình độ và nhận xét bài đầu vào
          </h2>
        </div>
        {recommendation?.overallStatusLabelVi ? (
          <span
            className={`rounded-full px-3.5 py-1.5 text-xs font-semibold ${
              recommendation.overallStatus === 'MATCHED_OPEN_CLASS'
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                : recommendation.overallStatus === 'LR_ONLY_PRELIMINARY' ||
                    recommendation.overallStatus === 'ELIGIBLE_COURSE_NO_OPEN_CLASS'
                  ? 'bg-amber-50 text-amber-800 border border-amber-200'
                  : 'bg-slate-100 text-slate-700 border border-slate-200'
            }`}
          >
            {recommendation.overallStatusLabelVi}
          </span>
        ) : null}
      </div>

      {diagnosis ? (
        <div className="rounded-xl border border-indigo-100 bg-indigo-50/30 p-4 space-y-2.5">
          <p className="text-xs font-bold uppercase tracking-wider text-indigo-800">
            Cơ sở dữ liệu hệ thống &amp; AI dùng để đề xuất lớp học
          </p>
          <div className="grid gap-3 md:grid-cols-3 text-xs">
            <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-1">
              <p className="font-bold text-slate-900">1. Trình độ &amp; Mục tiêu của bạn</p>
              <p className="text-slate-700 leading-5">
                {ov?.listeningCorrect != null && ov?.readingCorrect != null
                  ? `Nghe: ${ov.listeningCorrect}/${ov.listeningSamples} câu (${ov.listeningAccuracyPct}%) · Đọc: ${ov.readingCorrect}/${ov.readingSamples} câu (${ov.readingAccuracyPct}%)`
                  : 'Đang chờ công bố đủ điểm Nghe – Đọc.'}
              </p>
              {diagnosis.productiveSkills.length > 0 ? (
                <p className="text-slate-700 leading-5">
                  {diagnosis.productiveSkills
                    .map((ps) =>
                      ps.status === 'PUBLISHED' && ps.totalScore !== null
                        ? `${ps.skill === 'SPEAKING' ? 'Nói' : 'Viết'}: ${ps.totalScore} điểm rubric`
                        : `${ps.skill === 'SPEAKING' ? 'Nói' : 'Viết'}: Đang chờ chấm`,
                    )
                    .join(' · ')}
                </p>
              ) : null}
              {goals?.goalLR || goals?.goalSpeaking || goals?.goalWriting ? (
                <p className="font-medium text-indigo-800">
                  Mục tiêu đầu ra:{' '}
                  {[
                    goals?.goalLR ? `LR ${goals.goalLR}` : '',
                    goals?.goalSpeaking ? `Nói ${goals.goalSpeaking}` : '',
                    goals?.goalWriting ? `Viết ${goals.goalWriting}` : '',
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              ) : null}
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-1">
              <p className="font-bold text-slate-900">2. Kết quả nhận xét ở Mục 2</p>
              <p className="text-slate-700 leading-5">
                {weakAreasSummary
                  ? `Phần cần cải thiện: ${weakAreasSummary}`
                  : 'Các phần đã làm đạt nền tảng ổn định, chưa có lỗi tập trung lớn.'}
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-1">
              <p className="font-bold text-slate-900">3. Đối chiếu thông tin lớp mở</p>
              <p className="text-slate-700 leading-5">
                So khớp trình độ khóa học, nội dung đào tạo từng Part, điều kiện điểm đầu vào và
                sĩ số còn chỗ thực tế.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-700">
        <p role="status" className="font-semibold text-slate-900">
          {recommendation?.overallStatus === 'MATCHED_OPEN_CLASS'
            ? `Đã tìm thấy ${recommendation.availableClasses.length} lớp đang mở phù hợp.`
            : recommendation?.overallStatus === 'ELIGIBLE_COURSE_NO_OPEN_CLASS'
              ? 'Đủ điều kiện chương trình nhưng hiện chưa có lớp còn chỗ.'
              : recommendation?.overallStatus === 'LR_ONLY_PRELIMINARY' ||
                  recommendation?.overallStatus === 'AWAITING_FINAL_SCORING'
                ? 'Đang chờ hoàn tất chấm Nói/Viết — Chưa đủ dữ liệu để gợi ý lớp.'
                : recommendation?.overallStatus === 'INSUFFICIENT_EVIDENCE'
                  ? 'Chưa đủ dữ liệu để kết luận — Chưa đủ dữ liệu để gợi ý lớp.'
                  : recommendation?.overallStatus === 'NO_MATCHING_COURSE'
                    ? 'Chưa tìm được chương trình đáp ứng tất cả tiêu chí hiện tại.'
                    : matching.classes.length
                      ? 'Các lớp đáp ứng điều kiện tại thời điểm kiểm tra.'
                      : matching.status === 'NO_ELIGIBLE_CLASS'
                        ? 'Hiện chưa có lớp phù hợp.'
                        : 'Chưa đủ dữ liệu để gợi ý lớp.'}
        </p>
        {recommendation?.overallSummaryVi ? (
          <p className="mt-1.5 leading-6 text-slate-600">{recommendation.overallSummaryVi}</p>
        ) : null}
        {aiClassFitAdvisory && aiClassFitAdvisory.trim() !== recommendation?.overallSummaryVi?.trim() ? (
          <div className="mt-3 rounded-lg border border-indigo-200 bg-indigo-50/60 px-3.5 py-2.5 text-xs leading-5 text-indigo-950 space-y-1.5">
            <p className="font-bold text-indigo-800">Nhận định ghép lớp theo kết quả:</p>
            <ul className="space-y-1">
              {aiClassFitAdvisory
                .split(/(?<=\.)\s+(?=[A-ZÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚĂĐĨŨƠƯẠ-Ỹ0-9])/)
                .map((line) => line.trim())
                .filter(Boolean)
                .map((line, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-500" />
                    <span>{line}</span>
                  </li>
                ))}
            </ul>
          </div>
        ) : null}
        {(recommendation?.overallStatus === 'MATCHED_OPEN_CLASS' || matching.classes.length > 0
          ? []
          : recommendation?.overallStatus === 'ELIGIBLE_COURSE_NO_OPEN_CLASS'
            ? matching.reasons.filter((r) => r !== 'APPROVED_INTERNAL_RULE_NOT_MET')
            : matching.reasons
        ).map((reason) => (
          <p key={reason} className="mt-1 text-amber-900">
            • {reasons[reason] ?? 'Học vụ đang kiểm tra thêm thông tin lớp học.'}
          </p>
        ))}
        {matching.asOf && (
          <p className="mt-2 text-xs text-slate-500">
            Cập nhật lúc{' '}
            {new Intl.DateTimeFormat('vi-VN', {
              timeZone: 'Asia/Ho_Chi_Minh',
              dateStyle: 'short',
              timeStyle: 'short',
            }).format(new Date(matching.asOf))}
            .
          </p>
        )}
      </div>

      {recommendation && recommendation.availableClasses.length > 0 ? (
        <div className="space-y-4">
          <h3 className="text-base font-bold text-slate-900">
            Các lớp đang mở phù hợp với kết quả của bạn ({recommendation.availableClasses.length})
          </h3>
          <div className="grid gap-4 lg:grid-cols-2">
            {recommendation.availableClasses.map((c) => (
              <article
                className="flex flex-col justify-between space-y-3 rounded-2xl border-2 border-emerald-200 bg-emerald-50/30 p-5"
                key={c.classId}
              >
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-900">
                      {c.availabilityBadgeVi}
                    </span>
                    <span className="text-xs font-semibold text-slate-500">Mã lớp: {c.classCode}</span>
                  </div>
                  <h4 className="text-lg font-bold text-slate-900">{c.className}</h4>
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium text-indigo-900">
                        Chương trình: {c.courseTitle}
                      </p>
                      {c.courseLevel ? (
                        <span className="rounded-md bg-indigo-100 px-2 py-0.5 text-xs font-bold text-indigo-900">
                          Trình độ {c.courseLevel}
                        </span>
                      ) : null}
                    </div>
                    {c.courseDescription ? (
                      <p className="text-xs leading-5 text-slate-600">
                        Trọng tâm lớp học: {c.courseDescription}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-3 text-xs text-slate-600">
                    <span>Hình thức: {modalityLabel(c.modality)}</span>
                    <span>
                      Sĩ số: {c.enrolledCount}/{c.maxStudents ?? '—'} (Còn {c.availableSeats} chỗ)
                    </span>
                    <span>Học phí: {formatVnd(c.tuitionFeeVnd, c.pricingType)}</span>
                  </div>
                  {c.scheduleSummaryVi.length > 0 && (
                    <div className="rounded-lg bg-white p-3 text-xs text-slate-700 border border-slate-200">
                      <p className="font-semibold text-slate-900">Lịch học đã phê duyệt:</p>
                      {c.scheduleSummaryVi.slice(0, 3).map((slot) => (
                        <p key={slot} className="mt-0.5">
                          • {slot}
                        </p>
                      ))}
                    </div>
                  )}
                  {c.matchedDiagnosisPointsVi && c.matchedDiagnosisPointsVi.length > 0 ? (
                    <div className="rounded-lg bg-indigo-50/70 p-3 text-xs text-indigo-950 border border-indigo-200 space-y-1">
                      <p className="font-semibold text-indigo-950">
                        Khớp với nhận xét bài đầu vào &amp; trình độ của bạn:
                      </p>
                      {c.matchedDiagnosisPointsVi.map((pt) => (
                        <p key={pt} className="leading-5">
                          • {pt}
                        </p>
                      ))}
                    </div>
                  ) : null}
                  <div className="rounded-lg bg-white p-3 text-xs text-slate-700 border border-emerald-200">
                    <p className="font-semibold text-emerald-950">
                      Điều kiện điểm đầu vào của lớp đã đạt:
                    </p>
                    {c.fitReasonsVi.map((reason) => (
                      <p key={reason} className="mt-1 leading-5">
                        ✓ {reason}
                      </p>
                    ))}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3 pt-2">
                  <Link
                    className="inline-flex items-center rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-800"
                    to={'/classes/' + encodeURIComponent(c.classId) + '?from=placement'}
                  >
                    Chọn lớp & giữ chỗ 15 phút
                  </Link>
                  <Link
                    className="text-sm font-semibold text-indigo-800 underline"
                    to={'/catalog/' + encodeURIComponent(c.courseSlug)}
                  >
                    Xem khung chương trình
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </div>
      ) : (
        matching.classes.map((c) => (
          <article className="space-y-2 rounded-xl border p-4" key={c.id}>
            <h3 className="font-bold">{c.name}</h3>
            <p>Còn {c.availableSeats} chỗ tại thời điểm kiểm tra; chọn lớp để giữ chỗ 15 phút và thanh toán qua SePay.</p>
            {c.rationale.map((reason) => (
              <p key={reason}>{reason}</p>
            ))}
            {c.schedule?.map((slot) => (
              <p key={slot.startsAt}>
                {new Intl.DateTimeFormat('vi-VN', {
                  timeZone: 'Asia/Ho_Chi_Minh',
                  dateStyle: 'short',
                  timeStyle: 'short',
                }).format(new Date(slot.startsAt))}{' '}
                · {slot.modality}
              </p>
            ))}
            <Link className="text-indigo-800 underline" to={'/classes/' + encodeURIComponent(c.id)}>
              Xem lớp và điều kiện đăng ký
            </Link>
          </article>
        ))
      )}

      {recommendation && recommendation.unavailableClasses.length > 0 ? (
        <div className="space-y-3 border-t border-slate-200 pt-4">
          <h3 className="text-base font-bold text-slate-900">
            Lớp cùng chương trình phù hợp nhưng hiện hết chỗ / đóng nhận hồ sơ (
            {recommendation.unavailableClasses.length})
          </h3>
          <div className="grid gap-3 md:grid-cols-2">
            {recommendation.unavailableClasses.map((u) => (
              <article
                key={u.classId}
                className="space-y-2 rounded-xl border border-amber-200 bg-amber-50/40 p-4 text-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-900">
                    {u.availabilityBadgeVi}
                  </span>
                  <span className="text-xs text-slate-500">Mã lớp: {u.classCode}</span>
                </div>
                <h4 className="font-bold text-slate-900">{u.className}</h4>
                <p className="text-xs font-medium text-slate-700">Chương trình: {u.courseTitle}</p>
                {u.unavailabilityReasonVi ? (
                  <p className="text-xs leading-5 text-amber-950">{u.unavailabilityReasonVi}</p>
                ) : null}
                <div className="flex flex-wrap gap-3 pt-1 text-xs font-semibold">
                  <Link className="text-indigo-800 underline" to="/support">
                    Đăng ký danh sách chờ / Tư vấn lịch khai giảng mới
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </div>
      ) : null}

      {recommendation && recommendation.courseEvaluations.length > 0 ? (
        <details className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
          <summary className="cursor-pointer text-sm font-bold text-slate-900">
            Xem chi tiết mức độ phù hợp với từng khóa học ({recommendation.courseEvaluations.length} khóa)
          </summary>
          <div className="mt-4 space-y-3">
            {recommendation.courseEvaluations.map((ce) => (
              <div
                key={ce.courseVersionId}
                className="rounded-xl border border-slate-200 bg-white p-4 text-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="font-bold text-slate-900">{ce.courseTitle}</h4>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      ce.status === 'RECOMMENDED_PRIORITY' || ce.status === 'ELIGIBLE_ALTERNATIVE'
                        ? 'bg-emerald-100 text-emerald-900'
                        : ce.status === 'ELIGIBLE_NO_OPEN_CLASS'
                          ? 'bg-amber-100 text-amber-900'
                          : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {ce.statusBadgeVi}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-600">{ce.fitSummaryVi}</p>
                <ul className="mt-2 space-y-1 text-xs text-slate-700">
                  {ce.ruleTraces.map((rt, idx) => (
                    <li key={idx} className={rt.matched ? 'text-emerald-900' : 'text-slate-600'}>
                      {rt.matched ? '✓' : '✕'} {rt.traceTextVi}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </details>
      ) : null}

      {matching.classes.length === 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-indigo-100 bg-indigo-50/60 p-4 text-sm">
          <div>
            <p className="font-semibold text-indigo-950">
              Chưa mở lớp phù hợp hoặc cần tư vấn lộ trình cá nhân hóa?
            </p>
            <p className="text-xs text-indigo-900">
              Cố vấn học tập và Giảng viên 1:1 miễn phí sẽ hỗ trợ xếp lớp hoặc thiết kế lộ trình ôn tập theo kết quả chẩn đoán của bạn.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              className="rounded-lg bg-indigo-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-indigo-800"
              to="/support"
            >
              Gửi yêu cầu tư vấn xếp lớp
            </Link>
            <Link
              className="rounded-lg border border-indigo-300 bg-white px-3.5 py-2 text-xs font-semibold text-indigo-900 hover:bg-indigo-50"
              to="/consultations"
            >
              Đặt lịch tư vấn 1:1
            </Link>
            <Link
              className="rounded-lg border border-indigo-300 bg-white px-3.5 py-2 text-xs font-semibold text-indigo-900 hover:bg-indigo-50"
              to="/catalog"
            >
              Xem danh mục khóa học
            </Link>
          </div>
        </div>
      )}
    </section>
  );
}
