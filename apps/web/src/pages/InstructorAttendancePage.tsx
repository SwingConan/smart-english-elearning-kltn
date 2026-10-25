import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { SectionHeader, StatusBadge } from '@/components/ui/ProductPrimitives';
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
  const [persisted, setPersisted] = useState<Set<string>>(new Set());
  const [cleared, setCleared] = useState<Set<string>>(new Set());
  const [form, setForm] = useState({
    sessionDate: new Date().toISOString().slice(0, 10),
    scheduleSlotId: '',
    title: '',
    note: '',
    opensAt: '',
    closesAt: '',
    selfCheckInEnabled: false,
    accessCode: '',
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
    void Promise.resolve().then(() => load());
  }, [load]);
  const open = async (id: string) => {
    const detail = await engagementApi.attendance.detail(classOfferingId, id);
    setSelected(detail);
    setPersisted(
      new Set(detail.roster?.filter((row) => row.attendance).map((row) => row.id) ?? []),
    );
    setCleared(new Set());
  };
  const create = async (event: FormEvent) => {
    event.preventDefault();
    setMessage('');
    try {
      await engagementApi.attendance.create(classOfferingId, {
        sessionDate: form.sessionDate,
        scheduleSlotId: form.scheduleSlotId || undefined,
        title: form.title.trim() || undefined,
        note: form.note.trim() || undefined,
        opensAt: form.opensAt ? new Date(form.opensAt).toISOString() : undefined,
        closesAt: form.closesAt ? new Date(form.closesAt).toISOString() : undefined,
        selfCheckInEnabled: form.selfCheckInEnabled,
        accessCode:
          form.selfCheckInEnabled && form.accessCode.trim() ? form.accessCode.trim() : undefined,
      });
      setMessage('Đã tạo buổi điểm danh.');
      await load();
    } catch {
      setMessage('Không thể tạo buổi điểm danh. Kiểm tra cửa sổ thời gian và dữ liệu trùng lịch.');
    }
  };
  const updateRoster = (id: string, status: string | null, note?: string) => {
    setCleared((current) => {
      const next = new Set(current);
      if (!status && persisted.has(id)) next.add(id);
      else next.delete(id);
      return next;
    });
    setSelected((current) =>
      current
        ? {
            ...current,
            roster: current.roster?.map((row) =>
              row.id === id
                ? {
                    ...row,
                    attendance: status
                      ? { ...row.attendance, status, note: note ?? row.attendance?.note ?? '' }
                      : null,
                  }
                : row,
            ),
          }
        : current,
    );
  };
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
        [...cleared],
      );
      await open(selected.id);
      setMessage('Đã lưu điểm danh và nguồn ghi nhận của giảng viên.');
    } catch {
      setMessage('Không thể lưu điểm danh. Vui lòng thử lại.');
    }
  };
  const close = async () => {
    if (!selected) return;
    await engagementApi.attendance.close(classOfferingId, selected.id);
    await Promise.all([open(selected.id), load()]);
    setMessage('Đã đóng phiên tự điểm danh.');
  };
  return (
    <section className="space-y-6">
      <SectionHeader
        title="Điểm danh"
        description="Mở cửa sổ tự điểm danh theo thời gian máy chủ, hoặc ghi nhận/chỉnh sửa thủ công với nguồn rõ ràng."
      />
      <form
        className="grid gap-4 rounded-3xl border bg-white p-5 shadow-sm sm:grid-cols-2"
        onSubmit={(event) => void create(event)}
      >
        <label className="font-semibold">
          Ngày
          <input
            className="input-field mt-1"
            onChange={(event) => setForm({ ...form, sessionDate: event.target.value })}
            required
            type="date"
            value={form.sessionDate}
          />
        </label>
        <label className="font-semibold">
          Ca học
          <select
            className="input-field mt-1"
            onChange={(event) => setForm({ ...form, scheduleSlotId: event.target.value })}
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
        <label className="font-semibold">
          Tiêu đề
          <input
            className="input-field mt-1"
            maxLength={200}
            onChange={(event) => setForm({ ...form, title: event.target.value })}
            value={form.title}
          />
        </label>
        <label className="font-semibold">
          Ghi chú
          <input
            className="input-field mt-1"
            maxLength={2000}
            onChange={(event) => setForm({ ...form, note: event.target.value })}
            value={form.note}
          />
        </label>
        <label className="font-semibold">
          Mở tự điểm danh lúc
          <input
            className="input-field mt-1"
            onChange={(event) => setForm({ ...form, opensAt: event.target.value })}
            type="datetime-local"
            value={form.opensAt}
          />
        </label>
        <label className="font-semibold">
          Đóng tự điểm danh lúc
          <input
            className="input-field mt-1"
            min={form.opensAt || undefined}
            onChange={(event) => setForm({ ...form, closesAt: event.target.value })}
            type="datetime-local"
            value={form.closesAt}
          />
        </label>
        <label className="flex items-center gap-2 font-semibold sm:col-span-2">
          <input
            checked={form.selfCheckInEnabled}
            onChange={(event) => setForm({ ...form, selfCheckInEnabled: event.target.checked })}
            type="checkbox"
          />
          Cho phép học viên tự điểm danh
        </label>
        {form.selfCheckInEnabled ? (
          <label className="font-semibold sm:col-span-2">
            Mã bảo vệ (không bắt buộc)
            <input
              className="input-field mt-1"
              minLength={4}
              onChange={(event) => setForm({ ...form, accessCode: event.target.value })}
              placeholder="Từ 4 ký tự; được băm trước khi lưu"
              value={form.accessCode}
            />
          </label>
        ) : null}
        <button className="btn-primary justify-self-start">Tạo buổi</button>
      </form>
      {message ? (
        <p className="rounded-xl bg-sky-50 p-3 font-semibold text-sky-800" role="status">
          {message}
        </p>
      ) : null}
      {state === 'error' ? (
        <div className="state-error">
          Không thể tải dữ liệu.{' '}
          <button className="underline" onClick={() => void load()}>
            Thử lại
          </button>
        </div>
      ) : null}
      {state === 'loading' ? (
        <div className="h-48 animate-pulse rounded-2xl bg-slate-200" />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
          <aside className="space-y-2">
            {items.length ? (
              items.map((item) => (
                <button
                  className={`w-full rounded-2xl border bg-white p-4 text-left shadow-sm ${selected?.id === item.id ? 'ring-2 ring-indigo-500' : ''}`}
                  key={item.id}
                  onClick={() => void open(item.id)}
                >
                  <strong>
                    {item.title || new Date(item.sessionDate).toLocaleDateString('vi-VN')}
                  </strong>
                  <p className="mt-1 text-sm text-slate-500">
                    {item.scheduleSlot ? slotLabel(item.scheduleSlot) : 'Không gắn ca'} ·{' '}
                    {item._count?.records ?? 0} bản ghi
                  </p>
                  <div className="mt-2">
                    <StatusBadge
                      tone={
                        item.closedAt ? 'neutral' : item.selfCheckInEnabled ? 'success' : 'warning'
                      }
                    >
                      {item.closedAt
                        ? 'Đã đóng'
                        : item.selfCheckInEnabled
                          ? 'Cho phép tự điểm danh'
                          : 'Thủ công'}
                    </StatusBadge>
                  </div>
                </button>
              ))
            ) : (
              <div className="state-empty">Chưa có buổi điểm danh.</div>
            )}
          </aside>
          <main>
            {selected ? (
              <div className="rounded-3xl border bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-xl font-bold">{selected.title || 'Buổi điểm danh'}</h3>
                    <p className="text-sm text-slate-500">{selected.note || 'Không có ghi chú'}</p>
                  </div>
                  <div className="flex gap-2">
                    <StatusBadge
                      tone={
                        selected.closedAt
                          ? 'neutral'
                          : selected.selfCheckInEnabled
                            ? 'success'
                            : 'warning'
                      }
                    >
                      {selected.closedAt
                        ? 'Đã đóng'
                        : selected.selfCheckInEnabled
                          ? 'Đang mở theo cửa sổ'
                          : 'Chỉ ghi thủ công'}
                    </StatusBadge>
                    {selected.accessCodeEnabled ? (
                      <StatusBadge tone="info">Có mã</StatusBadge>
                    ) : null}
                  </div>
                </div>
                <div className="mt-5 space-y-3">
                  {selected.roster?.map((row) => (
                    <div
                      className="grid gap-2 rounded-xl border p-3 sm:grid-cols-[1fr_180px_1fr]"
                      key={row.id}
                    >
                      <div>
                        <strong>{row.learner.fullName}</strong>
                        <p className="text-xs text-slate-500">
                          {row.learner.email}
                          {row.attendance?.source
                            ? ` · ${row.attendance.source === 'SELF_CHECK_IN' ? 'Tự điểm danh' : 'Giảng viên'}`
                            : ''}
                        </p>
                      </div>
                      <select
                        aria-label={`Trạng thái của ${row.learner.fullName}`}
                        className="input-field"
                        onChange={(event) => updateRoster(row.id, event.target.value || null)}
                        value={row.attendance?.status ?? ''}
                      >
                        {statuses.map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                      <input
                        aria-label={`Ghi chú cho ${row.learner.fullName}`}
                        className="input-field"
                        disabled={!row.attendance}
                        onChange={(event) =>
                          updateRoster(row.id, row.attendance?.status ?? null, event.target.value)
                        }
                        placeholder="Ghi chú"
                        value={row.attendance?.note ?? ''}
                      />
                    </div>
                  ))}
                </div>
                <div className="mt-5 flex flex-wrap gap-2">
                  <button className="btn-primary" onClick={() => void save()}>
                    Lưu điểm danh
                  </button>
                  {selected.selfCheckInEnabled && !selected.closedAt ? (
                    <button className="btn-secondary" onClick={() => void close()}>
                      Đóng phiên
                    </button>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="state-empty">Chọn một buổi để xem danh sách.</div>
            )}
          </main>
        </div>
      )}
    </section>
  );
}
