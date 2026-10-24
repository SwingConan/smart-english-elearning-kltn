import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { AttendanceSession, engagementApi, ScheduleSlot } from '@/features/engagement/api';

const statuses = [
  ['', 'Chưa đánh dấu'],
  ['PRESENT', 'Có mặt'],
  ['ABSENT', 'Vắng mặt'],
  ['LATE', 'Đi muộn'],
  ['EXCUSED', 'Vắng có phép'],
];
const slotLabel = (slot: ScheduleSlot) =>
  `${slot.dayOfWeek === 7 ? 'Chủ nhật' : `Thứ ${slot.dayOfWeek + 1}`} · ${new Date(slot.startTime).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })}–${new Date(slot.endTime).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })}`;
export function InstructorAttendancePage() {
  const { classOfferingId = '' } = useParams();
  const [items, setItems] = useState<AttendanceSession[]>([]);
  const [slots, setSlots] = useState<ScheduleSlot[]>([]);
  const [selected, setSelected] = useState<AttendanceSession | null>(null);
  const [form, setForm] = useState({
    sessionDate: new Date().toISOString().slice(0, 10),
    scheduleSlotId: '',
    title: '',
    note: '',
  });
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const load = useCallback(async () => {
    try {
      const [sessions, scheduleSlots] = await Promise.all([
        engagementApi.attendance.list(classOfferingId),
        engagementApi.attendance.slots(classOfferingId),
      ]);
      setItems(sessions);
      setSlots(scheduleSlots);
      setState('ready');
    } catch {
      setState('error');
    }
  }, [classOfferingId]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  const open = async (id: string) =>
    setSelected(await engagementApi.attendance.detail(classOfferingId, id));
  const create = async (event: FormEvent) => {
    event.preventDefault();
    setMessage('');
    if (!form.sessionDate) {
      setMessage('Vui lòng chọn ngày điểm danh.');
      return;
    }
    try {
      await engagementApi.attendance.create(classOfferingId, {
        sessionDate: form.sessionDate,
        scheduleSlotId: form.scheduleSlotId || undefined,
        title: form.title.trim() || undefined,
        note: form.note.trim() || undefined,
      });
      setMessage('Đã tạo buổi điểm danh.');
      await load();
    } catch {
      setMessage('Không thể tạo buổi điểm danh. Kiểm tra dữ liệu hoặc buổi trùng lịch.');
    }
  };
  const updateRoster = (id: string, status: string | null, note?: string) =>
    setSelected((current) =>
      current
        ? {
            ...current,
            roster: current.roster?.map((row) =>
              row.id === id
                ? {
                    ...row,
                    attendance: status
                      ? { status, note: note ?? row.attendance?.note ?? '' }
                      : null,
                  }
                : row,
            ),
          }
        : current,
    );
  const save = async () => {
    if (!selected?.roster) return;
    try {
      await engagementApi.attendance.records(
        classOfferingId,
        selected.id,
        selected.roster
          .filter((row) => row.attendance)
          .map((row) => ({
            enrollmentId: row.id,
            status: row.attendance!.status,
            note: row.attendance!.note?.trim() || undefined,
          })),
      );
      await open(selected.id);
      setMessage('Đã lưu điểm danh.');
    } catch {
      setMessage('Không thể lưu điểm danh. Vui lòng thử lại.');
    }
  };
  return (
    <section className="space-y-5">
      <h2 className="text-2xl font-black">Điểm danh</h2>
      <form className="grid gap-3 rounded-2xl border bg-white p-4 sm:grid-cols-2" onSubmit={create}>
        <label>
          <span>Ngày</span>
          <input
            className="input-field mt-1"
            onChange={(e) => setForm({ ...form, sessionDate: e.target.value })}
            required
            type="date"
            value={form.sessionDate}
          />
        </label>
        <label>
          <span>Ca học (không bắt buộc)</span>
          <select
            className="input-field mt-1"
            onChange={(e) => setForm({ ...form, scheduleSlotId: e.target.value })}
            value={form.scheduleSlotId}
          >
            <option value="">Không gắn ca học</option>
            {slots.map((slot) => (
              <option key={slot.id} value={slot.id}>
                {slotLabel(slot)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Tiêu đề (không bắt buộc)</span>
          <input
            className="input-field mt-1"
            maxLength={200}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            value={form.title}
          />
        </label>
        <label>
          <span>Ghi chú buổi học (không bắt buộc)</span>
          <input
            className="input-field mt-1"
            maxLength={2000}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
            value={form.note}
          />
        </label>
        <button className="btn-primary justify-self-start">Tạo buổi</button>
      </form>
      {message ? <p role="status">{message}</p> : null}
      {state === 'loading' ? <p role="status">Đang tải dữ liệu điểm danh…</p> : null}
      {state === 'error' ? (
        <div className="state-error" role="alert">
          Không thể tải dữ liệu điểm danh.{' '}
          <button className="underline" onClick={() => void load()}>
            Thử lại
          </button>
        </div>
      ) : null}
      {state === 'ready' && items.length === 0 ? (
        <div className="state-empty">Chưa có buổi điểm danh.</div>
      ) : null}
      {state === 'ready' ? (
        <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
          <div className="space-y-2">
            {items.map((item) => (
              <button
                className="w-full rounded-xl border bg-white p-4 text-left"
                key={item.id}
                onClick={() => void open(item.id)}
              >
                <strong>
                  {item.title || new Date(item.sessionDate).toLocaleDateString('vi-VN')}
                </strong>
                <p className="text-sm text-slate-600">
                  {item.scheduleSlot ? slotLabel(item.scheduleSlot) : 'Không gắn ca học'} ·{' '}
                  {item._count?.records ?? 0} lượt đã ghi
                </p>
              </button>
            ))}
          </div>
          <div>
            {selected ? (
              <div className="rounded-2xl border bg-white p-5">
                <h3 className="text-lg font-bold">{selected.title || 'Buổi điểm danh'}</h3>
                {selected.note ? <p className="text-slate-600">{selected.note}</p> : null}
                <div className="mt-4 space-y-3">
                  {selected.roster?.map((row) => (
                    <div
                      className="grid gap-2 rounded-xl border p-3 sm:grid-cols-[1fr_180px_1fr]"
                      key={row.id}
                    >
                      <div>
                        <strong>{row.learner.fullName}</strong>
                        <p className="text-sm text-slate-500">{row.learner.email}</p>
                      </div>
                      <label>
                        <span className="sr-only">Trạng thái của {row.learner.fullName}</span>
                        <select
                          className="input-field"
                          onChange={(e) => updateRoster(row.id, e.target.value || null)}
                          value={row.attendance?.status ?? ''}
                        >
                          {statuses.map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span className="sr-only">Ghi chú cho {row.learner.fullName}</span>
                        <input
                          className="input-field"
                          disabled={!row.attendance}
                          onChange={(e) =>
                            updateRoster(row.id, row.attendance?.status ?? null, e.target.value)
                          }
                          placeholder="Ghi chú"
                          value={row.attendance?.note ?? ''}
                        />
                      </label>
                    </div>
                  ))}
                </div>
                <button className="btn-primary mt-4" onClick={() => void save()}>
                  Lưu điểm danh
                </button>
              </div>
            ) : (
              <div className="state-empty">Chọn một buổi để nhập điểm danh.</div>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
