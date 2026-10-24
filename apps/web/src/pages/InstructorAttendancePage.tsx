import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { AttendanceSession, engagementApi } from '@/features/engagement/api';
export function InstructorAttendancePage() {
  const { classOfferingId = '' } = useParams();
  const [items, setItems] = useState<AttendanceSession[]>([]);
  const [selected, setSelected] = useState<AttendanceSession | null>(null);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const load = useCallback(
    () => engagementApi.attendance.list(classOfferingId).then(setItems),
    [classOfferingId],
  );
  useEffect(() => {
    void load();
  }, [load]);
  const open = async (id: string) =>
    setSelected(await engagementApi.attendance.detail(classOfferingId, id));
  const save = async () => {
    if (!selected?.roster) return;
    await engagementApi.attendance.records(
      classOfferingId,
      selected.id,
      selected.roster
        .filter((r) => r.attendance)
        .map((r) => ({ enrollmentId: r.id, status: r.attendance!.status })),
    );
    await open(selected.id);
  };
  return (
    <section className="space-y-5">
      <h2 className="text-2xl font-black">Điểm danh</h2>
      <div className="flex gap-3">
        <input
          className="rounded-xl border p-3"
          onChange={(e) => setDate(e.target.value)}
          type="date"
          value={date}
        />
        <button
          className="btn-primary"
          onClick={() =>
            void engagementApi.attendance.create(classOfferingId, { sessionDate: date }).then(load)
          }
        >
          Tạo buổi
        </button>
      </div>
      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <div className="space-y-2">
          {items.map((item) => (
            <button
              className="w-full rounded-xl border bg-white p-4 text-left"
              key={item.id}
              onClick={() => void open(item.id)}
            >
              {new Date(item.sessionDate).toLocaleDateString('vi-VN')} · {item._count?.records ?? 0}{' '}
              bản ghi
            </button>
          ))}
        </div>
        {selected ? (
          <div className="rounded-2xl border bg-white p-5">
            <div className="space-y-3">
              {selected.roster?.map((row) => (
                <label className="flex items-center justify-between gap-3" key={row.id}>
                  <span>{row.learner.fullName}</span>
                  <select
                    className="rounded-lg border p-2"
                    onChange={(e) =>
                      setSelected({
                        ...selected,
                        roster: selected.roster!.map((r) =>
                          r.id === row.id
                            ? {
                                ...r,
                                attendance: e.target.value ? { status: e.target.value } : null,
                              }
                            : r,
                        ),
                      })
                    }
                    value={row.attendance?.status ?? ''}
                  >
                    <option value="">Chưa ghi nhận</option>
                    <option value="PRESENT">Có mặt</option>
                    <option value="LATE">Đi muộn</option>
                    <option value="EXCUSED">Có phép</option>
                    <option value="ABSENT">Vắng</option>
                  </select>
                </label>
              ))}
            </div>
            <button className="btn-primary mt-5" onClick={() => void save()}>
              Lưu điểm danh
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
