import type { AdminSystemReport } from './types';

export interface ChartDatum {
  label: string;
  value: number;
  color: string;
  note?: string;
}

export function SegmentedBar({
  ariaLabel,
  data,
  legendColumns = 1,
}: {
  ariaLabel: string;
  data: ChartDatum[];
  legendColumns?: 1 | 2;
}) {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  let offset = 0;

  return (
    <div>
      <svg
        aria-label={ariaLabel}
        className="h-8 w-full overflow-visible"
        preserveAspectRatio="none"
        role="img"
        viewBox="0 0 100 20"
      >
        <title>{ariaLabel}</title>
        <rect fill="#e2e8f0" height="20" rx="6" width="100" />
        {total > 0
          ? data.map((item) => {
              const width = (item.value / total) * 100;
              const x = offset;
              offset += width;
              return width > 0 ? (
                <rect
                  data-chart-label={item.label}
                  data-chart-value={item.value}
                  fill={item.color}
                  height="20"
                  key={item.label}
                  width={width}
                  x={x}
                />
              ) : null;
            })
          : null}
      </svg>
      <ChartLegend columns={legendColumns} data={data} />
    </div>
  );
}

export function DonutChart({
  ariaLabel,
  data,
  centerLabel,
}: {
  ariaLabel: string;
  data: ChartDatum[];
  centerLabel: string;
}) {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="flex flex-col gap-5">
      <svg aria-label={ariaLabel} className="mx-auto h-44 w-44" role="img" viewBox="0 0 120 120">
        <title>{ariaLabel}</title>
        <circle cx="60" cy="60" fill="none" r={radius} stroke="#e2e8f0" strokeWidth="16" />
        {total > 0
          ? data.map((item) => {
              const length = (item.value / total) * circumference;
              const dashOffset = -offset;
              offset += length;
              return length > 0 ? (
                <circle
                  cx="60"
                  cy="60"
                  data-chart-label={item.label}
                  data-chart-value={item.value}
                  fill="none"
                  key={item.label}
                  r={radius}
                  stroke={item.color}
                  strokeDasharray={`${length} ${circumference - length}`}
                  strokeDashoffset={dashOffset}
                  strokeWidth="16"
                  transform="rotate(-90 60 60)"
                />
              ) : null;
            })
          : null}
        <text className="fill-slate-950 text-xl font-black" textAnchor="middle" x="60" y="58">
          {total}
        </text>
        <text className="fill-slate-500 text-[8px]" textAnchor="middle" x="60" y="72">
          {centerLabel}
        </text>
      </svg>
      <ChartLegend data={data} />
    </div>
  );
}

export function AccountCompositionChart({ report }: { report: AdminSystemReport }) {
  const roles: ChartDatum[] = [
    { label: 'Học viên', value: report.snapshot.accounts.byRole.STUDENT, color: '#4f46e5' },
    { label: 'Giảng viên', value: report.snapshot.accounts.byRole.INSTRUCTOR, color: '#0284c7' },
    {
      label: 'Điều phối/Admin',
      value: report.snapshot.accounts.byRole.ADMIN_COORDINATOR,
      color: '#7c3aed',
    },
  ];
  const statuses: ChartDatum[] = [
    { label: 'Đang hoạt động', value: report.snapshot.accounts.byStatus.ACTIVE, color: '#059669' },
    {
      label: 'Tạm ngưng',
      value: report.snapshot.accounts.byStatus.INACTIVE,
      color: '#64748b',
    },
    { label: 'Đã khóa', value: report.snapshot.accounts.byStatus.LOCKED, color: '#dc2626' },
  ];

  return (
    <div className="space-y-5">
      <div>
        <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">
          Theo vai trò
        </p>
        <SegmentedBar ariaLabel="Tài khoản theo vai trò" data={roles} legendColumns={2} />
      </div>
      <div>
        <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">
          Theo trạng thái
        </p>
        <SegmentedBar ariaLabel="Tài khoản theo trạng thái" data={statuses} legendColumns={2} />
      </div>
      <p className="rounded-xl bg-slate-50 p-3 text-sm leading-5 text-slate-600">
        Trạng thái “Đang hoạt động” cho biết tài khoản đang được phép sử dụng hệ thống; đây không
        phải số người dùng truy cập gần đây.
      </p>
    </div>
  );
}

export function ActivityTrendChart({ report }: { report: AdminSystemReport }) {
  const rows = report.activity.daily;
  const width = 840;
  const height = 360;
  const margin = { top: 24, right: 28, bottom: 54, left: 44 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const maxValue = Math.max(
    1,
    ...rows.flatMap((row) => [row.newEnrollments, row.submittedAssessments, row.lessonCompletions]),
  );
  const x = (index: number) =>
    margin.left + (rows.length <= 1 ? plotWidth / 2 : (index / (rows.length - 1)) * plotWidth);
  const y = (value: number) => margin.top + plotHeight - (value / maxValue) * plotHeight;
  const series = [
    {
      key: 'newEnrollments' as const,
      label: 'Ghi danh mới',
      color: '#4f46e5',
      total: report.activity.totals.newEnrollments,
    },
    {
      key: 'submittedAssessments' as const,
      label: 'Bài đánh giá đã nộp',
      color: '#0284c7',
      total: report.activity.totals.submittedAssessments,
    },
    {
      key: 'lessonCompletions' as const,
      label: 'Bài học hoàn tất',
      color: '#059669',
      total: report.activity.totals.lessonCompletions,
    },
  ];
  const labelIndexes = Array.from(
    new Set([0, Math.floor((rows.length - 1) / 2), rows.length - 1]),
  ).filter((index) => index >= 0);
  const gridValues = [0, Math.ceil(maxValue / 2), maxValue];

  return (
    <div>
      <div className="overflow-x-auto">
        <svg
          aria-label={`Biểu đồ hoạt động từ ${report.activity.period.from} đến ${report.activity.period.to}, gồm đầy đủ ${rows.length} ngày`}
          className="h-auto min-w-[560px] w-full"
          role="img"
          viewBox={`0 0 ${width} ${height}`}
        >
          <title>Hoạt động theo ngày: ghi danh mới, bài đánh giá đã nộp và bài học hoàn tất</title>
          {gridValues.map((value) => (
            <g key={value}>
              <line
                stroke="#e2e8f0"
                strokeDasharray="4 5"
                x1={margin.left}
                x2={width - margin.right}
                y1={y(value)}
                y2={y(value)}
              />
              <text
                fill="#64748b"
                fontSize="12"
                textAnchor="end"
                x={margin.left - 10}
                y={y(value) + 4}
              >
                {value}
              </text>
            </g>
          ))}
          {series.map((item) => (
            <g key={item.key}>
              <polyline
                fill="none"
                points={rows.map((row, index) => `${x(index)},${y(row[item.key])}`).join(' ')}
                stroke={item.color}
                strokeLinejoin="round"
                strokeWidth="3"
              />
              {rows.map((row, index) => (
                <circle
                  cx={x(index)}
                  cy={y(row[item.key])}
                  data-date={row.date}
                  data-series={item.key}
                  data-value={row[item.key]}
                  fill="white"
                  key={`${item.key}-${row.date}`}
                  r="3"
                  stroke={item.color}
                  strokeWidth="2"
                />
              ))}
            </g>
          ))}
          {labelIndexes.map((index) => (
            <text
              fill="#64748b"
              fontSize="12"
              key={rows[index]?.date}
              textAnchor={index === 0 ? 'start' : index === rows.length - 1 ? 'end' : 'middle'}
              x={x(index)}
              y={height - 20}
            >
              {rows[index]?.date}
            </text>
          ))}
        </svg>
      </div>
      <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm" aria-label="Chú giải hoạt động">
        {series.map((item) => (
          <li className="flex items-center gap-2" key={item.key}>
            <span
              aria-hidden="true"
              className="h-2.5 w-6 rounded-full"
              style={{ backgroundColor: item.color }}
            />
            <span>{item.label}</span>
            <strong>{item.total}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ChartLegend({ data, columns = 1 }: { data: ChartDatum[]; columns?: 1 | 2 }) {
  return (
    <ul
      className={`mt-3 grid gap-2 text-sm ${columns === 2 ? 'sm:grid-cols-2' : ''}`}
      aria-label="Chú giải biểu đồ"
    >
      {data.map((item) => (
        <li className="flex items-start justify-between gap-3" key={item.label}>
          <span className="flex min-w-0 items-start gap-2">
            <span
              aria-hidden="true"
              className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: item.color }}
            />
            <span>
              {item.label}
              {item.note ? (
                <small className="mt-0.5 block text-sm leading-5 text-slate-500">{item.note}</small>
              ) : null}
            </span>
          </span>
          <strong>{item.value}</strong>
        </li>
      ))}
    </ul>
  );
}
