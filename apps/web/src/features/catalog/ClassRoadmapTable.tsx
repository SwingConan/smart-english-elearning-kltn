import { CalendarDays, Clock3, MapPin, Monitor, Video } from 'lucide-react';
import { modalityLabel } from '@/features/catalog/display';
import type { RoadmapItem, RoomSummary } from '@/features/catalog/types';

interface ClassRoadmapTableProps {
  items: RoadmapItem[];
  classStart?: string | null;
  classEnd?: string | null;
  defaultRoom?: RoomSummary | null;
  minutesPerPeriod?: number;
  showMeetingUrl?: boolean;
  title?: string;
}

const vnDate = new Intl.DateTimeFormat('vi-VN', {
  weekday: 'short',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'Asia/Ho_Chi_Minh',
});

const vnShortDate = new Intl.DateTimeFormat('vi-VN', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'Asia/Ho_Chi_Minh',
});

function formatSessionDate(ymd: string): string {
  const normalized = ymd.length > 10 ? ymd.slice(0, 10) : ymd;
  const parsed = new Date(`${normalized}T12:00:00+07:00`);
  return Number.isNaN(parsed.getTime()) ? normalized : vnDate.format(parsed);
}

function formatSummaryDate(value?: string | null): string {
  if (!value) return 'Đang cập nhật';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 'Đang cập nhật' : vnShortDate.format(parsed);
}

export function ClassRoadmapTable({
  items,
  classStart,
  classEnd,
  defaultRoom,
  minutesPerPeriod = 45,
  showMeetingUrl = false,
  title = 'Bản đồ lộ trình lớp học',
}: ClassRoadmapTableProps) {
  if (!items || items.length === 0) return null;

  const totalPeriods = items.reduce((sum, item) => sum + (item.periods || 0), 0);
  const maxWeek = Math.max(...items.map((item) => item.weekNumber || 1));

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
            <CalendarDays className="h-5 w-5 text-[#5e9141]" aria-hidden="true" />
            {title}
          </h2>
          <p className="mt-1 text-xs text-slate-600">
            Thời lượng chuẩn: {items.length} buổi · {totalPeriods} tiết ({minutesPerPeriod} phút/tiết) ·{' '}
            {maxWeek} tuần
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-700">
            Khai giảng: {formatSummaryDate(classStart ?? items[0]?.sessionDate)}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-700">
            Kết thúc: {formatSummaryDate(classEnd ?? items[items.length - 1]?.sessionDate)}
          </span>
          {defaultRoom && (
            <span className="inline-flex items-center gap-1 rounded-full bg-[#e9f2e4] px-3 py-1 font-semibold text-[#2f5d1e]">
              <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
              {defaultRoom.code} · {defaultRoom.name} ({defaultRoom.location})
            </span>
          )}
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="min-w-[820px] w-full divide-y divide-slate-200 text-left text-sm">
          <thead className="bg-[#f8f9fa] text-xs font-semibold uppercase tracking-wide text-slate-600">
            <tr>
              <th className="px-3 py-3">Tuần</th>
              <th className="px-3 py-3">Buổi</th>
              <th className="px-3 py-3">Ngày &amp; Giờ học</th>
              <th className="px-3 py-3">Nội dung học</th>
              <th className="px-3 py-3">Hình thức</th>
              <th className="px-3 py-3">Phòng học / Địa điểm</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {items.map((item) => {
              const roomLabel = item.room
                ? `${item.room.code} — ${item.room.name} (${item.room.location})`
                : item.locationText || (item.modality === 'ONLINE' ? 'Lớp học trực tuyến' : 'Phòng học trung tâm');
              return (
                <tr key={item.id ?? `${item.sessionNumber}-${item.sessionDate}`} className="hover:bg-slate-50/70">
                  <td className="whitespace-nowrap px-3 py-3 font-semibold text-slate-700">
                    Tuần {item.weekNumber}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 font-bold text-[#2f5d1e]">
                    Buổi {item.sessionNumber}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3">
                    <div className="font-medium text-slate-900">{formatSessionDate(item.sessionDate)}</div>
                    <div className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
                      <Clock3 className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                      {item.startTime} – {item.endTime} · {item.periods} tiết ({item.periods * minutesPerPeriod} phút)
                    </div>
                  </td>
                  <td className="min-w-[260px] max-w-md px-3 py-3 align-top">
                    <div className="font-semibold text-slate-900">{item.topicTitle}</div>
                    {item.contentSummary && (
                      item.contentSummary.includes(' • ') ? (
                        <ul className="mt-1 space-y-0.5 text-xs text-slate-600 list-disc pl-4">
                          {item.contentSummary.split(' • ').map((part, pIdx) => (
                            <li key={pIdx}>{part}</li>
                          ))}
                        </ul>
                      ) : (
                        <div className="mt-0.5 text-xs text-slate-600">{item.contentSummary}</div>
                      )
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        item.modality === 'ONLINE'
                          ? 'bg-amber-50 text-amber-800 border border-amber-200'
                          : item.modality === 'HYBRID'
                            ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                            : 'bg-[#e9f2e4] text-[#2f5d1e] border border-[#cde0c2]'
                      }`}
                    >
                      {item.modality === 'ONLINE' ? (
                        <Video className="h-3 w-3" aria-hidden="true" />
                      ) : (
                        <Monitor className="h-3 w-3" aria-hidden="true" />
                      )}
                      {modalityLabel(item.modality)}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-xs text-slate-700">
                    <div className="flex items-start gap-1.5">
                      <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
                      <div>
                        <p className="font-medium text-slate-800">{roomLabel}</p>
                        {showMeetingUrl && item.meetingUrl && (
                          <a
                            href={item.meetingUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-0.5 inline-block font-semibold text-[#e66f2b] hover:underline"
                          >
                            Link học trực tuyến →
                          </a>
                        )}
                      </div>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
