/** Shared print-only administrative header and signature block for all Smart English reports. */
export function formatPrintTimestampVn(isoOrDate: Date | string = new Date()): string {
  const date = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    dateStyle: 'short',
    timeStyle: 'short',
    hour12: false,
  }).format(date);
}

function getVietnamDateParts(date: Date = new Date()): { day: string; month: string; year: string } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).formatToParts(date);
  const pick = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return { day: pick('day'), month: pick('month'), year: pick('year') };
}

export function PrintableReportHeader({
  department = 'Hệ thống Quản trị Đào tạo & Học vụ TOEIC',
  documentCode,
  title,
  subtitle,
  metaRows,
}: {
  department?: string;
  documentCode?: string;
  title?: string;
  subtitle?: string;
  metaRows: Array<{ label: string; value: string }>;
}) {
  return (
    <section
      aria-label="Tiêu đề bản in báo cáo"
      className="hidden print:block space-y-3 border-b-2 border-slate-900 pb-3 text-slate-900"
    >
      <div className="flex items-start justify-between gap-4 border-b border-slate-300 pb-2 text-[11px]">
        <div>
          <p className="font-bold uppercase tracking-wide text-[#2f5d1e]">
            TRUNG TÂM ANH NGỮ SMART ENGLISH
          </p>
          <p className="text-slate-600">{department}</p>
          {documentCode && (
            <p className="mt-0.5 font-mono text-[10px] text-slate-500">Biểu mẫu: {documentCode}</p>
          )}
        </div>
        <div className="text-right">
          <p className="font-bold uppercase tracking-wide text-slate-900">
            CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM
          </p>
          <p className="font-semibold text-slate-700">Độc lập - Tự do - Hạnh phúc</p>
          <div className="ml-auto mt-1 h-[1px] w-32 bg-slate-500" />
        </div>
      </div>

      {title && (
        <div className="text-center">
          <h2 className="text-lg font-bold uppercase tracking-wide text-slate-950">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-slate-600">{subtitle}</p>}
        </div>
      )}

      {metaRows.length > 0 && (
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 rounded border border-slate-300 bg-slate-50/70 px-3 py-2 text-[11px]">
          {metaRows.map((row) => (
            <div key={row.label} className="flex gap-1.5">
              <dt className="shrink-0 font-semibold text-slate-700">{row.label}:</dt>
              <dd className="text-slate-900">{row.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

export function PrintableReportFooter({
  leftTitle = 'Người lập báo cáo',
  leftName,
  middleTitle,
  rightTitle = 'Xác nhận của Ban quản lý',
  rightNote = '(Ký và ghi rõ họ tên)',
  locationLabel = 'TP. Hồ Chí Minh',
}: {
  leftTitle?: string;
  leftName?: string;
  middleTitle?: string;
  rightTitle?: string;
  rightNote?: string;
  locationLabel?: string;
}) {
  const { day, month, year } = getVietnamDateParts();
  return (
    <section
      aria-label="Chữ ký xác nhận bản in báo cáo"
      className="hidden print:block report-print-keep mt-6 border-t border-slate-300 pt-4 text-xs text-slate-900"
    >
      <p className="mb-3 text-right italic text-slate-600">
        {locationLabel}, ngày {day} tháng {month} năm {year}
      </p>
      <div
        className={`grid gap-6 text-center ${middleTitle ? 'grid-cols-3' : 'grid-cols-2'}`}
      >
        <div>
          <p className="font-bold uppercase">{leftTitle}</p>
          <p className="mt-0.5 text-[11px] italic text-slate-500">(Ký và ghi rõ họ tên)</p>
          <p className="mt-14 font-semibold text-slate-900">{leftName ?? ''}</p>
        </div>
        {middleTitle && (
          <div>
            <p className="font-bold uppercase">{middleTitle}</p>
            <p className="mt-0.5 text-[11px] italic text-slate-500">(Ký và ghi rõ họ tên)</p>
          </div>
        )}
        <div>
          <p className="font-bold uppercase">{rightTitle}</p>
          <p className="mt-0.5 text-[11px] italic text-slate-500">{rightNote}</p>
        </div>
      </div>
    </section>
  );
}
