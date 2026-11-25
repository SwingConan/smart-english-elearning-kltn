import { Link } from 'react-router';
import {
  DAY_TIME_BANDS,
  WEEKDAY_NAMES_MONDAY_FIRST,
  formatShortVnDate,
} from './calendar-utils';

export type GridTone = 'green' | 'amber' | 'neutral' | 'rose' | 'orange';

export interface TimetableGridItem {
  id: string;
  /** 0 = Thứ 2, ..., 6 = Chủ nhật */
  dayIndex: number;
  band: 'morning' | 'afternoon' | 'evening';
  /** Sort key such as HH:mm or ISO string */
  sortKey: string;
  timeLabel: string;
  title: string;
  subtitle?: string;
  meta?: string;
  badgeLabel?: string;
  tone?: GridTone;
  selected?: boolean;
  onClick?: () => void;
  href?: string;
}

const TONE_CLASS: Record<GridTone, string> = {
  green: 'border-[#76a35e]/50 bg-[#f4f9f1] hover:border-[#2f5d1e] hover:bg-[#e9f2e4]',
  amber: 'border-amber-300 bg-amber-50/80 hover:border-amber-500 hover:bg-amber-50',
  neutral: 'border-slate-300 bg-slate-50 hover:border-slate-500 hover:bg-slate-100',
  rose: 'border-rose-200 bg-rose-50/70 hover:border-rose-400 hover:bg-rose-50',
  orange: 'border-[#e66f2b]/40 bg-orange-50/60 hover:border-[#e66f2b] hover:bg-orange-50',
};

const BADGE_CLASS: Record<GridTone, string> = {
  green: 'bg-[#e9f2e4] text-[#2f5d1e]',
  amber: 'bg-amber-100 text-amber-900',
  neutral: 'bg-slate-200 text-slate-700',
  rose: 'bg-rose-100 text-rose-800',
  orange: 'bg-orange-100 text-[#c25315]',
};

interface WeeklyTimetableGridProps {
  /** Optional 7 `YYYY-MM-DD` keys (Mon -> Sun). Omit for template-only weekly schedule. */
  weekDates?: string[];
  todayKey?: string;
  items: TimetableGridItem[];
  emptySlotLabel?: string;
  ariaLabel?: string;
}

/**
 * Responsive 7-day × 3-shift (Sáng / Chiều / Tối) weekly timetable matrix.
 * Renders dated weekly calendars when `weekDates` is provided, or recurring weekday
 * templates (e.g. room weekly schedules) when `weekDates` is omitted.
 */
export function WeeklyTimetableGrid({
  weekDates,
  todayKey,
  items,
  emptySlotLabel = 'Trống',
  ariaLabel = 'Thời khóa biểu tuần',
}: WeeklyTimetableGridProps) {
  const dayCounts = Array.from({ length: 7 }, (_, idx) =>
    items.filter((it) => it.dayIndex === idx).length,
  );

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table aria-label={ariaLabel} className="w-full min-w-[820px] border-collapse text-left">
        <thead>
          <tr className="border-b border-slate-200 bg-[#f7faf5]">
            <th
              scope="col"
              className="w-28 border-r border-slate-200 px-3 py-2.5 text-xs font-bold uppercase tracking-wide text-slate-600"
            >
              Khung ca
            </th>
            {WEEKDAY_NAMES_MONDAY_FIRST.map((dayName, idx) => {
              const dateKey = weekDates?.[idx];
              const isToday = Boolean(dateKey && todayKey && dateKey === todayKey);
              const count = dayCounts[idx];
              return (
                <th
                  key={dayName}
                  scope="col"
                  className={`border-r border-slate-200 px-2.5 py-2.5 text-center last:border-r-0 ${
                    isToday ? 'bg-[#e9f2e4]' : ''
                  }`}
                >
                  <div className="flex items-center justify-center gap-1.5">
                    <span
                      className={`text-xs font-bold ${
                        isToday ? 'text-[#2f5d1e]' : 'text-slate-800'
                      }`}
                    >
                      {dayName}
                    </span>
                    {isToday && (
                      <span className="rounded bg-[#2f5d1e] px-1.5 py-0.5 text-[10px] font-bold text-white">
                        Hôm nay
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 flex items-center justify-center gap-1.5 text-[11px] text-slate-500">
                    {dateKey && <span>{formatShortVnDate(dateKey)}</span>}
                    {count > 0 && (
                      <span className="rounded-full bg-white px-1.5 py-0.2 font-semibold text-[#2f5d1e] ring-1 ring-[#76a35e]/40">
                        {count}
                      </span>
                    )}
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {DAY_TIME_BANDS.map((band) => (
            <tr key={band.key} className="align-top">
              <th
                scope="row"
                className="border-r border-slate-200 bg-slate-50/70 px-3 py-3 text-left align-top"
              >
                <div className="text-xs font-bold text-slate-800">{band.label}</div>
                <div className="mt-0.5 text-[11px] font-normal text-slate-500">
                  {band.rangeLabel}
                </div>
              </th>
              {Array.from({ length: 7 }, (_, dayIdx) => {
                const cellItems = items
                  .filter((it) => it.dayIndex === dayIdx && it.band === band.key)
                  .sort((a, b) => a.sortKey.localeCompare(b.sortKey));
                const dateKey = weekDates?.[dayIdx];
                const isToday = Boolean(dateKey && todayKey && dateKey === todayKey);

                return (
                  <td
                    key={dayIdx}
                    className={`min-h-[84px] border-r border-slate-200 p-1.5 align-top last:border-r-0 ${
                      isToday ? 'bg-[#fafdf8]' : ''
                    }`}
                  >
                    {cellItems.length === 0 ? (
                      <div className="flex min-h-[60px] items-center justify-center text-[11px] text-slate-300 select-none">
                        {emptySlotLabel}
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        {cellItems.map((it) => {
                          const tone = it.tone ?? 'green';
                          const cardClass = `block w-full rounded-lg border p-2 text-left transition ${
                            TONE_CLASS[tone]
                          } ${it.selected ? 'ring-2 ring-[#e66f2b]' : ''}`;

                          const inner = (
                            <>
                              <div className="flex items-center justify-between gap-1">
                                <span className="text-[11px] font-bold text-slate-900">
                                  {it.timeLabel}
                                </span>
                                {it.badgeLabel && (
                                  <span
                                    className={`rounded px-1.5 py-0.5 text-[10px] font-semibold leading-none ${BADGE_CLASS[tone]}`}
                                  >
                                    {it.badgeLabel}
                                  </span>
                                )}
                              </div>
                              <p className="mt-1 line-clamp-2 text-xs font-bold text-slate-900">
                                {it.title}
                              </p>
                              {it.subtitle && (
                                <p className="mt-0.5 line-clamp-1 text-[11px] text-slate-600">
                                  {it.subtitle}
                                </p>
                              )}
                              {it.meta && (
                                <p className="mt-0.5 line-clamp-1 text-[10px] text-slate-500">
                                  {it.meta}
                                </p>
                              )}
                            </>
                          );

                          if (it.onClick) {
                            return (
                              <button
                                key={it.id}
                                type="button"
                                onClick={it.onClick}
                                className={cardClass}
                              >
                                {inner}
                              </button>
                            );
                          }

                          if (it.href) {
                            return (
                              <Link key={it.id} to={it.href} className={cardClass}>
                                {inner}
                              </Link>
                            );
                          }

                          return (
                            <div key={it.id} className={cardClass}>
                              {inner}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
