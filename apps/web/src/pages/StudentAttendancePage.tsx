import { CalendarCheck, CheckCircle2, Clock3, KeyRound } from 'lucide-react';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { SectionHeader, Timeline } from '@/components/ui/ProductPrimitives';
import { engagementApi, type AttendanceSession } from '@/features/engagement/api';

const statusLabel: Record<string, string> = {
  PRESENT: 'Có mặt',
  ABSENT: 'Vắng mặt',
  LATE: 'Đi muộn',
  EXCUSED: 'Vắng có phép',
};

export function StudentAttendancePage() {
  const { enrollmentId = '' } = useParams();
  const [open, setOpen] = useState<AttendanceSession | null>(null);
  const [history, setHistory] = useState<AttendanceSession[]>([]);
  const [code, setCode] = useState('');
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const load = useCallback(async () => {
    try {
      const [current, rows] = await Promise.all([
        engagementApi.attendance.openSession(enrollmentId),
        engagementApi.attendance.studentHistory(enrollmentId),
      ]);
      setOpen(current);
      setHistory(rows);
      setState('ready');
    } catch {
      setState('error');
    }
  }, [enrollmentId]);
  useEffect(() => {
    void Promise.resolve().then(() => load());
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, 15000);
    return () => window.clearInterval(timer);
  }, [load]);
  const checkIn = async (event: FormEvent) => {
    event.preventDefault();
    if (!open) return;
    setMessage('');
    try {
      const result = await engagementApi.attendance.checkIn(enrollmentId, open.id, code);
      setMessage(
        result.idempotent
          ? 'Bạn đã điểm danh trước đó.'
          : 'Điểm danh thành công. Chúc bạn có buổi học hiệu quả!',
      );
      setCode('');
      await load();
    } catch {
      setMessage('Không thể điểm danh. Hãy kiểm tra mã và thời gian mở của phiên.');
    }
  };
  if (state === 'loading')
    return <div className="h-56 animate-pulse rounded-3xl bg-slate-200" role="status" />;
  if (state === 'error')
    return (
      <div className="state-error" role="alert">
        Không thể tải dữ liệu điểm danh.{' '}
        <button className="underline" onClick={() => void load()}>
          Thử lại
        </button>
      </div>
    );
  return (
    <section className="space-y-6">
      <SectionHeader
        title="Điểm danh"
        description="Thời gian do máy chủ xác định. Bạn chỉ có thể điểm danh cho chính ghi danh đang hoạt động của mình."
      />
      {open ? (
        <form
          className="overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-700 to-sky-600 p-6 text-white shadow-lg"
          onSubmit={(event) => void checkIn(event)}
        >
          <div className="flex items-center gap-3">
            <CalendarCheck size={30} />
            <div>
              <p className="text-sm font-bold text-indigo-100">PHIÊN ĐANG MỞ</p>
              <h3 className="text-2xl font-black">{open.title || 'Buổi học hôm nay'}</h3>
            </div>
          </div>
          <p className="mt-3 text-indigo-100">
            <Clock3 className="mr-2 inline" size={16} />
            Đóng lúc{' '}
            {open.closesAt ? new Date(open.closesAt).toLocaleString('vi-VN') : 'theo giảng viên'}
          </p>
          {open.record ? (
            <div className="mt-5 rounded-2xl bg-white/15 p-4 font-bold">
              <CheckCircle2 className="mr-2 inline" />
              Bạn đã điểm danh: {statusLabel[open.record.status] ?? open.record.status}
            </div>
          ) : (
            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              {open.accessCodeEnabled ? (
                <label className="flex-1">
                  <span className="sr-only">Mã điểm danh</span>
                  <div className="relative">
                    <KeyRound className="absolute left-3 top-3.5 text-slate-400" size={18} />
                    <input
                      className="w-full rounded-xl border-0 py-3 pl-10 pr-3 text-slate-950"
                      maxLength={64}
                      onChange={(event) => setCode(event.target.value)}
                      placeholder="Nhập mã điểm danh"
                      required
                      value={code}
                    />
                  </div>
                </label>
              ) : null}
              <button
                className="rounded-xl bg-white px-5 py-3 font-black text-indigo-700 shadow"
                type="submit"
              >
                Xác nhận có mặt
              </button>
            </div>
          )}
          {message ? (
            <p className="mt-4 font-semibold" role="status">
              {message}
            </p>
          ) : null}
        </form>
      ) : (
        <div className="state-empty">Hiện không có phiên tự điểm danh đang mở.</div>
      )}
      <div className="rounded-3xl border bg-white p-6 shadow-sm">
        <SectionHeader
          title="Lịch sử của bạn"
          description="Chưa có bản ghi không đồng nghĩa với vắng mặt cho tới khi giảng viên hoặc chính sách kết luận."
        />
        <div className="mt-6">
          {history.length ? (
            <Timeline
              items={history.map((item) => ({
                id: item.id,
                title: item.title || new Date(item.sessionDate).toLocaleDateString('vi-VN'),
                description: item.record
                  ? `${statusLabel[item.record.status] ?? item.record.status}${item.record.note ? ` · ${item.record.note}` : ''}`
                  : 'Chưa có kết luận điểm danh',
                meta: item.record?.checkedInAt
                  ? new Date(item.record.checkedInAt).toLocaleTimeString('vi-VN')
                  : undefined,
                tone:
                  item.record?.status === 'PRESENT'
                    ? 'success'
                    : item.record?.status === 'ABSENT'
                      ? 'danger'
                      : item.record
                        ? 'warning'
                        : 'neutral',
              }))}
            />
          ) : (
            <p className="text-slate-500">Chưa có buổi điểm danh.</p>
          )}
        </div>
      </div>
    </section>
  );
}
