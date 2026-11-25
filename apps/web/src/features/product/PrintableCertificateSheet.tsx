export interface PrintableCertificateProps {
  learnerName: string;
  certificateCode: string;
  courseTitle: string;
  classLabel?: string;
  issuedAt: string;
  isTestPolicy?: boolean;
  reviewerName?: string | null;
  issuerName?: string | null;
  metrics?: {
    progressPercent?: number | null;
    gradePercent?: number | null;
    attendancePercent?: number | null;
  };
}

function CornerFiligree({ className }: { className: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      aria-hidden="true"
      className={`pointer-events-none absolute size-12 text-[#b45309]/70 ${className}`}
      fill="none"
    >
      <path d="M4 56V12C4 7.58 7.58 4 12 4H56" stroke="currentColor" strokeWidth="2.5" />
      <path d="M12 46V16C12 13.79 13.79 12 16 12H46" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="12" cy="12" r="3" fill="currentColor" />
    </svg>
  );
}

export function PrintableCertificateSheet({
  learnerName,
  certificateCode,
  courseTitle,
  classLabel,
  issuedAt,
  isTestPolicy = false,
  reviewerName,
  issuerName,
  metrics,
}: PrintableCertificateProps) {
  const formattedDate = issuedAt
    ? new Date(issuedAt).toLocaleDateString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })
    : '—';

  const metricChips = [
    metrics?.progressPercent != null
      ? { label: 'Tiến độ bài học', value: `${Math.round(metrics.progressPercent)}%` }
      : null,
    metrics?.gradePercent != null
      ? { label: 'Điểm tổng hợp', value: `${Math.round(metrics.gradePercent * 10) / 10}%` }
      : null,
    metrics?.attendancePercent != null
      ? { label: 'Chuyên cần', value: `${Math.round(metrics.attendancePercent)}%` }
      : null,
  ].filter(Boolean) as Array<{ label: string; value: string }>;

  return (
    <section
      aria-label="Mẫu chứng nhận hoàn thành khóa học Smart English"
      className="certificate-print-page relative mx-auto w-full max-w-[960px] overflow-hidden rounded-xl border-[5px] border-[#14532d] bg-gradient-to-br from-[#fffdf7] via-white to-[#f2faf4] p-3 text-slate-900 shadow-lg print:max-w-none print:rounded-none print:shadow-none"
    >
      <div className="relative flex flex-col justify-between border-2 border-[#b45309]/65 px-7 py-6 sm:px-12 sm:py-9 print:min-h-[178mm] print:px-12 print:py-8">
        <CornerFiligree className="top-2 left-2" />
        <CornerFiligree className="top-2 right-2 rotate-90" />
        <CornerFiligree className="bottom-2 right-2 rotate-180" />
        <CornerFiligree className="bottom-2 left-2 -rotate-90" />

        {/* Subtle Watermark */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-[0.04]"
        >
          <svg viewBox="0 0 200 200" className="size-80 text-[#14532d]" fill="currentColor">
            <path d="M100 12L176 50V105C176 149 143 183 100 194C57 183 24 149 24 105V50L100 12Z" />
          </svg>
        </div>

        {/* Top Institution Crest & Header */}
        <div className="relative text-center">
          <div className="mx-auto flex items-center justify-center gap-3">
            <svg viewBox="0 0 48 48" aria-hidden="true" className="size-11 text-[#14532d]">
              <circle cx="24" cy="24" r="22" fill="#e9f2e4" stroke="currentColor" strokeWidth="2" />
              <path
                d="M24 10L38 17L24 24L10 17L24 10Z"
                fill="currentColor"
              />
              <path
                d="M15 21V29C15 32.5 19 35 24 35C29 35 33 32.5 33 29V21"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
              />
            </svg>
            <div className="text-left">
              <p className="text-[11px] font-extrabold uppercase tracking-[0.22em] text-[#14532d]">
                Trung tâm Anh ngữ Smart English
              </p>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#b45309]">
                Smart English E-Learning &amp; TOEIC Center
              </p>
            </div>
          </div>

          <h2 className="mt-5 font-serif text-2xl font-extrabold uppercase tracking-[0.08em] text-[#14532d] sm:text-3xl">
            Giấy Chứng Nhận Hoàn Thành Khóa Học
          </h2>
          <p className="mt-1 text-xs font-bold uppercase tracking-[0.26em] text-[#b45309]">
            Certificate of Completion
          </p>
          <div className="mx-auto mt-3 h-0.5 w-32 bg-gradient-to-r from-transparent via-[#b45309] to-transparent" />
        </div>

        {/* Recipient & Course Block */}
        <div className="relative my-6 space-y-4 text-center">
          <p className="text-xs font-medium italic text-slate-600 sm:text-sm">
            Trân trọng chứng nhận học viên · This certificate is proudly presented to
          </p>

          <div className="mx-auto max-w-xl border-b-2 border-[#b45309]/50 pb-2">
            <p className="font-serif text-3xl font-bold tracking-wide text-slate-950 sm:text-4xl">
              {learnerName}
            </p>
          </div>

          <p className="mx-auto max-w-2xl text-xs leading-relaxed text-slate-700 sm:text-sm">
            Đã hoàn thành đầy đủ chương trình đào tạo và đáp ứng các tiêu chuẩn đánh giá của khóa học:
          </p>

          <div className="mx-auto max-w-2xl rounded-xl border border-[#14532d]/20 bg-white/90 px-5 py-3.5 shadow-2xs">
            <p className="text-base font-extrabold text-[#14532d] sm:text-lg">{courseTitle}</p>
            {classLabel && (
              <p className="mt-1 text-xs font-semibold text-slate-600">Lớp: {classLabel}</p>
            )}
          </div>

          {metricChips.length > 0 && (
            <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
              {metricChips.map((chip) => (
                <div
                  key={chip.label}
                  className="rounded-full border border-emerald-200 bg-emerald-50/80 px-3.5 py-1 text-xs font-semibold text-emerald-950"
                >
                  <span className="text-emerald-800">{chip.label}:</span>{' '}
                  <span className="font-extrabold">{chip.value}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer: Verification Code, Official Seal & Signatures */}
        <div className="relative space-y-4">
          <div className="grid grid-cols-1 items-end gap-5 border-t border-slate-200/80 pt-5 sm:grid-cols-3 print:grid-cols-3">
            {/* Verification Metadata */}
            <div className="space-y-1.5 text-left text-xs">
              <span
                className={
                  'inline-block rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ' +
                  (isTestPolicy
                    ? 'border border-amber-300 bg-amber-100 text-amber-900'
                    : 'border border-emerald-300 bg-emerald-100 text-emerald-900')
                }
              >
                {isTestPolicy ? 'TEST POLICY · Minh chứng kiểm thử' : 'Chứng chỉ chính thức'}
              </span>
              <p className="text-[11px] text-slate-500">
                Mã xác minh:{' '}
                <strong className="font-mono text-xs text-slate-900">{certificateCode}</strong>
              </p>
              <p className="text-[11px] text-slate-500">
                Ngày cấp: <strong className="text-slate-900">{formattedDate}</strong>
              </p>
              {reviewerName && (
                <p className="text-[11px] text-slate-500">
                  Xét duyệt: <strong className="text-slate-800">{reviewerName}</strong>
                </p>
              )}
            </div>

            {/* Official Vector Seal */}
            <div className="flex justify-center">
              <div className="flex flex-col items-center">
                <svg viewBox="0 0 110 110" aria-hidden="true" className="size-24 text-[#b91c1c]">
                  <circle
                    cx="55"
                    cy="55"
                    r="48"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeDasharray="4 2"
                  />
                  <circle cx="55" cy="55" r="41" fill="none" stroke="currentColor" strokeWidth="1.5" />
                  <circle cx="55" cy="55" r="27" fill="none" stroke="currentColor" strokeWidth="1" />
                  <text
                    x="55"
                    y="27"
                    textAnchor="middle"
                    fontSize="7.5"
                    fontWeight="bold"
                    fill="currentColor"
                    letterSpacing="1"
                  >
                    SMART ENGLISH
                  </text>
                  <text
                    x="55"
                    y="53"
                    textAnchor="middle"
                    fontSize="8.5"
                    fontWeight="bold"
                    fill="currentColor"
                  >
                    ĐÃ XÁC THỰC
                  </text>
                  <text
                    x="55"
                    y="64"
                    textAnchor="middle"
                    fontSize="6.5"
                    fontWeight="bold"
                    fill="currentColor"
                  >
                    ★ NỘI BỘ ★
                  </text>
                  <text
                    x="55"
                    y="90"
                    textAnchor="middle"
                    fontSize="7"
                    fontWeight="bold"
                    fill="currentColor"
                    letterSpacing="1"
                  >
                    TOEIC CENTER
                  </text>
                </svg>
              </div>
            </div>

            {/* Academic Director Signature */}
            <div className="text-center text-xs sm:text-right print:text-right">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                Đại diện Học vụ
              </p>
              <div className="my-1 flex justify-center sm:justify-end print:justify-end">
                <svg viewBox="0 0 180 46" aria-hidden="true" className="h-10 w-36 text-[#14532d]">
                  <path
                    d="M14 34C28 14 42 12 48 28C54 42 70 10 86 24C98 34 114 14 126 26C134 34 152 20 166 22"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                  />
                </svg>
              </div>
              <p className="font-bold text-slate-900">
                {issuerName || 'Hội đồng Học vụ Smart English'}
              </p>
              <p className="text-[11px] text-slate-500">Smart English Center</p>
            </div>
          </div>

          <p className="border-t border-slate-100 pt-2.5 text-center text-[10px] text-slate-500">
            Đây là chứng chỉ hoàn thành khóa học nội bộ của Smart English Center (không phải chứng
            chỉ quốc tế TOEIC ETS). Tra cứu xác thực tại cổng <code>/certificates/lookup</code>.
          </p>
        </div>
      </div>
    </section>
  );
}
