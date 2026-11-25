import { classCodeLabel } from '@/features/demo/presentation';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import { BookOpenCheck, CalendarDays, Plus, Sparkles, Trash2 } from 'lucide-react';
import { academicApi, type AcademicClass, type Roster } from '@/features/academic/api';
import { planningApi, type Room } from '@/features/academic/planning-api';
import { ClassRoadmapTable } from '@/features/catalog/ClassRoadmapTable';
import type { ClassModality, RoadmapItem } from '@/features/catalog/types';
import { useAuth } from '@/features/auth/auth-context';
const control = 'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm';
const weekdays = ['', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ nhật'];

function addMinutesToWallClock(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return hhmm;
  const total = Math.min(23 * 60 + 59, h * 60 + m + minutes);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}
const label = (s: string) =>
  ({
    ACTIVE: 'Đang học',
    PENDING_PAYMENT: 'Chờ thanh toán',
    DROPPED: 'Đã rút',
    CANCELLED: 'Đã hủy',
    COMPLETED: 'Hoàn thành',
  })[s] ?? s;

const CLASS_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Bản nháp',
  OPEN: 'Đang mở đăng ký',
  IN_PROGRESS: 'Đang diễn ra',
  COMPLETED: 'Đã kết thúc',
  CANCELLED: 'Đã hủy',
};

const MODALITY_LABELS: Record<string, string> = {
  OFFLINE: 'Trực tiếp tại cơ sở',
  ONLINE: 'Trực tuyến',
  HYBRID: 'Kết hợp',
};
export function AcademicClassPage() {
  const { id } = useParams();
  return <ClassDetails key={id} id={id!} />;
}
function ClassDetails({ id }: { id: string }) {
  const { user } = useAuth();
  const [c, setC] = useState<AcademicClass>(),
    [roster, setRoster] = useState<Roster>(),
    [rooms, setRooms] = useState<Room[]>([]),
    [instructors, setInstructors] = useState<{ id: string; fullName: string }[]>([]),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false),
    [page, setPage] = useState(1);
  const [setupState, setSetupState] = useState({
    status: 'OPEN',
    modality: 'OFFLINE',
    instructorId: '',
    defaultRoomId: '',
    classStart: '',
    totalSessions: 24,
    periodsPerSession: 3,
    durationWeeks: 12,
    syncLmsSections: true,
    slots: [] as Array<{
      dayOfWeek: number;
      startTime: string;
      endTime: string;
      roomId: string;
      locationText: string;
      meetingUrl: string;
    }>,
  });
  const [roadmapDraft, setRoadmapDraft] = useState<RoadmapItem[]>([]);
  const [editingRoadmap, setEditingRoadmap] = useState(false);
  const [weekFilter, setWeekFilter] = useState<'ALL' | number>('ALL');
  const [form, setForm] = useState({
    name: '',
    code: '',
    modality: 'ONLINE',
    maxStudents: 20,
    pricingType: 'FREE',
    tuitionFeeVnd: 0,
    reason: '',
  });
  const [slot, setSlot] = useState({
      dayOfWeek: 1,
      startTime: '18:00',
      endTime: '19:30',
      locationText: '',
      reason: '',
    }),
    [slotId, setSlotId] = useState<string>();
  const hydrateClass = (cls: AcademicClass) => {
    setC(cls);
    setForm((f) => ({
      ...f,
      name: cls.name,
      code: cls.code,
      modality: cls.modality,
      maxStudents: cls.maxStudents ?? 20,
      pricingType: cls.pricingType,
      tuitionFeeVnd: cls.tuitionFeeVnd ?? 0,
    }));
    const startYmd = cls.classStart
      ? new Date(new Date(cls.classStart).getTime() + 7 * 3600 * 1000).toISOString().slice(0, 10)
      : '';
    setSetupState({
      status: cls.status,
      modality: cls.modality,
      instructorId: cls.instructor?.id ?? '',
      defaultRoomId: cls.defaultRoomId ?? '',
      classStart: startYmd,
      totalSessions: cls.totalSessions ?? 24,
      periodsPerSession: cls.periodsPerSession ?? 3,
      durationWeeks: cls.durationWeeks ?? 12,
      syncLmsSections: true,
      slots: (cls.scheduleSlots ?? []).map((s) => ({
        dayOfWeek: s.dayOfWeek,
        startTime: s.startTime,
        endTime: s.endTime,
        roomId: s.roomId ?? '',
        locationText: s.locationText ?? '',
        meetingUrl: s.meetingUrl ?? '',
      })),
    });
    setRoadmapDraft(cls.roadmapItems ?? []);
  };
  const refresh = async () => {
    const [cls, rows] = await Promise.all([
      academicApi.classroom(id),
      academicApi.roster(id, '?page=' + page + '&limit=10'),
    ]);
    hydrateClass(cls);
    setRoster(rows);
  };
  useEffect(() => {
    let live = true;
    void Promise.all([
      academicApi.classroom(id),
      academicApi.roster(id, '?page=' + page + '&limit=10'),
      user?.role === 'ACADEMIC_MANAGER'
        ? planningApi.get<{ data: Room[] }>('rooms?limit=100').catch(() => ({ data: [] as Room[] }))
        : Promise.resolve({ data: [] as Room[] }),
      user?.role === 'ACADEMIC_MANAGER'
        ? planningApi.get<{ id: string; fullName: string }[]>('instructors').catch(() => [])
        : Promise.resolve([]),
    ])
      .then(([cls, rows, r, inst]) => {
        if (live) {
          hydrateClass(cls);
          setRoster(rows);
          setRooms((r.data ?? []).filter((room) => room.status === 'ACTIVE'));
          setInstructors(Array.isArray(inst) ? inst : []);
        }
      })
      .catch(() => {
        if (live) setError('Không tìm thấy lớp hoặc bạn không có quyền xem.');
      });
    return () => {
      live = false;
    };
  }, [id, page, user?.role]);
  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await work();
      await refresh();
    } catch {
      setError(
        'Không thể lưu thông tin. Dữ liệu có thể đã thay đổi hoặc lịch học bị trùng, vui lòng kiểm tra lại.',
      );
    } finally {
      setBusy(false);
    }
  };
  const save = (e: FormEvent) => {
    e.preventDefault();
    if (c)
      void run(() =>
        academicApi.write(
          '/classes/' + id,
          { ...form, courseId: c.courseId, expectedUpdatedAt: c.updatedAt },
          'PATCH',
        ),
      );
  };
  const saveDirectSetup = async (e: FormEvent) => {
    e.preventDefault();
    if (!c) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const updated = await academicApi.setupClass(id, {
        status: setupState.status,
        modality: setupState.modality,
        instructorId: setupState.instructorId || null,
        defaultRoomId: setupState.defaultRoomId || null,
        classStart: setupState.classStart
          ? new Date(`${setupState.classStart}T00:00:00+07:00`).toISOString()
          : null,
        totalSessions: setupState.totalSessions,
        periodsPerSession: setupState.periodsPerSession,
        durationWeeks: setupState.durationWeeks,
        syncLmsSections: setupState.syncLmsSections,
        slots: setupState.slots.map((s) => ({
          dayOfWeek: s.dayOfWeek,
          startTime: s.startTime,
          endTime: s.endTime,
          roomId: s.roomId || null,
          locationText: s.locationText || null,
          meetingUrl: s.meetingUrl || null,
        })),
      });
      hydrateClass(updated);
      setNotice('Đã lưu cấu hình vận hành, phòng học và lịch tuần cố định.');
    } catch {
      setError('Không thể lưu thiết lập lớp. Vui lòng kiểm tra giờ học không bị trùng lặp.');
    } finally {
      setBusy(false);
    }
  };

  const generateRoadmap = async () => {
    if (!c) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      // Save weekly setup first if there are unsaved slots/dates so generation uses latest inputs
      await academicApi.setupClass(id, {
        status: setupState.status,
        modality: setupState.modality,
        instructorId: setupState.instructorId || null,
        defaultRoomId: setupState.defaultRoomId || null,
        classStart: setupState.classStart
          ? new Date(`${setupState.classStart}T00:00:00+07:00`).toISOString()
          : null,
        totalSessions: setupState.totalSessions,
        periodsPerSession: setupState.periodsPerSession,
        durationWeeks: setupState.durationWeeks,
        syncLmsSections: setupState.syncLmsSections,
        slots: setupState.slots.map((s) => ({
          dayOfWeek: s.dayOfWeek,
          startTime: s.startTime,
          endTime: s.endTime,
          roomId: s.roomId || null,
          locationText: s.locationText || null,
          meetingUrl: s.meetingUrl || null,
        })),
      });
      const updated = await academicApi.generateRoadmap(id, {
        ...(setupState.classStart
          ? { classStart: new Date(`${setupState.classStart}T00:00:00+07:00`).toISOString() }
          : {}),
        totalSessions: setupState.totalSessions,
        periodsPerSession: setupState.periodsPerSession,
        defaultRoomId: setupState.defaultRoomId || null,
        syncTeachingSessions: true,
        syncLmsSections: setupState.syncLmsSections,
      });
      hydrateClass(updated);
      setEditingRoadmap(true);
      setWeekFilter('ALL');
      setNotice(
        `Đã sinh tự động ${updated.roadmapItems?.length ?? 0} buổi trên Bản đồ lộ trình lớp học và đồng bộ lịch giảng dạy.`,
      );
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : 'Cần chọn Ngày khai giảng và ít nhất 1 lịch học trong tuần trước khi sinh bản đồ.',
      );
    } finally {
      setBusy(false);
    }
  };

  const saveRoadmapItems = async () => {
    if (!c) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const updated = await academicApi.saveRoadmap(
        id,
        roadmapDraft.map((item, idx) => ({
          ...item,
          orderIndex: idx,
        })),
        true,
      );
      hydrateClass(updated);
      setNotice('Đã lưu Bản đồ lộ trình lớp học và đồng bộ sang lịch buổi học chính thức.');
    } catch {
      setError('Không thể lưu bản đồ lớp học. Vui lòng kiểm tra ngày giờ hợp lệ cho từng buổi.');
    } finally {
      setBusy(false);
    }
  };

  const triggerSyncLms = async () => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const res = await academicApi.syncLmsSections(id);
      await refresh();
      setNotice(
        res.createdCount > 0
          ? `Đã khởi tạo ${res.createdCount} học phần LMS mới (tổng ${res.totalSections} học phần) cho giảng viên.`
          : `Lớp đã có đủ ${res.totalSections} học phần LMS theo khung chương trình.`,
      );
    } catch {
      setError('Không thể đồng bộ học phần LMS lúc này.');
    } finally {
      setBusy(false);
    }
  };

  const saveSlot = (e: FormEvent) => {
    e.preventDefault();
    if (c)
      void run(async () => {
        await academicApi.write(
          '/classes/' + id + '/weekly-templates' + (slotId ? '/' + slotId : ''),
          { ...slot, expectedUpdatedAt: c.updatedAt },
          slotId ? 'PATCH' : 'POST',
        );
        setSlotId(undefined);
        setSlot((s) => ({ ...s, reason: '' }));
      });
  };
  return (
    <main className="space-y-6">
      <div>
        <Link className="text-sm font-semibold text-[#2f5d1e] hover:text-[#e66f2b] hover:underline" to="/academic">
          ← Chương trình và lớp
        </Link>
      </div>
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      {notice && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</p>}
      {!c && !error && <p role="status" className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">Đang tải lớp…</p>}
      {c && (
        <>
          <header className="workspace-header flex flex-wrap items-start justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5">
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl sm:text-3xl font-bold text-[#e66f2b]">
                  {classCodeLabel(c.code)} · {c.name}
                </h1>
                <span
                  className={`badge ${
                    c.status === 'OPEN' || c.status === 'IN_PROGRESS'
                      ? 'badge-success'
                      : c.status === 'DRAFT'
                        ? 'badge-warning'
                        : 'badge-neutral'
                  }`}
                >
                  {CLASS_STATUS_LABELS[c.status] ?? c.status}
                </span>
              </div>
              <p className="text-sm text-slate-600">
                {c.course.title} · {MODALITY_LABELS[c.modality] ?? c.modality} · Giảng viên:{' '}
                <strong className="text-slate-900">{c.instructor?.fullName ?? 'Chưa phân công'}</strong>
              </p>
              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
                <span>
                  <strong>
                    {c.activeLearnerCount}/{c.maxStudents ?? '—'} học viên đang học
                  </strong>{' '}
                  (chưa bao gồm học viên chờ thanh toán)
                </span>
                {c.totalSessions && (
                  <span>
                    · {c.totalSessions} buổi ({c.totalPeriods ?? c.totalSessions * (c.periodsPerSession ?? 3)} tiết · 45p/tiết)
                  </span>
                )}
              </div>
              {!c.editable && (
                <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1 inline-block">
                  Thông tin gốc lớp nháp đã khóa chỉnh sửa. Thay đổi lịch buổi lẻ thực hiện tại trang Quản lý lịch giảng dạy hoặc bên dưới.
                </p>
              )}
            </div>
            <button
              className={control + ' font-semibold'}
              disabled={busy}
              onClick={() => void run(async () => undefined)}
            >
              Tải lại dữ liệu
            </button>
          </header>

          <details
            open={c.editable}
            className="rounded-xl border border-slate-200 bg-white p-5 space-y-4"
          >
            <summary className="cursor-pointer select-none text-sm font-bold text-slate-800">
              Thông tin mở lớp &amp; Mẫu tuần dự kiến{' '}
              <span className="ml-2 font-normal text-xs text-slate-500">
                ({c.editable ? 'Đang mở chỉnh sửa bản nháp' : 'Chỉ đọc — nhấn để mở/thu gọn'})
              </span>
            </summary>
            <form
              className="mt-4 grid gap-4 md:grid-cols-2"
              onSubmit={save}
            >
              <label>
                Tên lớp
                <input
                  className={control + ' block w-full'}
                  required
                  disabled={!c.editable || busy}
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </label>
              <label>
                Mã lớp
                <input
                  className={control + ' block w-full'}
                  required
                  pattern="[A-Za-z0-9_\-]{2,60}"
                  disabled={!c.editable || busy}
                  value={form.code}
                  onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                />
              </label>
              <label>
                Sĩ số tối đa
                <input
                  className={control + ' block w-full'}
                  type="number"
                  min={1}
                  max={1000}
                  required
                  disabled={!c.editable || busy}
                  value={form.maxStudents}
                  onChange={(e) => setForm((f) => ({ ...f, maxStudents: Number(e.target.value) }))}
                />
              </label>
              <label>
                Hình thức
                <select
                  className={control + ' block w-full'}
                  disabled={!c.editable || busy}
                  value={form.modality}
                  onChange={(e) => setForm((f) => ({ ...f, modality: e.target.value }))}
                >
                  {['ONLINE', 'OFFLINE', 'HYBRID'].map((s) => (
                    <option key={s} value={s}>
                      {MODALITY_LABELS[s] ?? s}
                    </option>
                  ))}
                </select>
              </label>
            <label>
              Loại học phí nháp
              <select
                className={control + ' block w-full'}
                disabled={!c.editable || busy}
                value={form.pricingType}
                onChange={(e) =>
                  setForm((f) => ({ ...f, pricingType: e.target.value, tuitionFeeVnd: 0 }))
                }
              >
                <option value="FREE">Miễn phí</option>
                <option value="PAID">Có học phí</option>
              </select>
            </label>
            <label>
              Học phí nháp (VND)
              <input
                className={control + ' block w-full'}
                type="number"
                min={form.pricingType === 'FREE' ? 0 : 1}
                max={1000000000}
                disabled={!c.editable || busy || form.pricingType === 'FREE'}
                value={form.tuitionFeeVnd}
                onChange={(e) => setForm((f) => ({ ...f, tuitionFeeVnd: Number(e.target.value) }))}
              />
            </label>
            {c.editable && (
              <>
                <label>
                  Lý do thay đổi
                  <textarea
                    className={control + ' block w-full'}
                    required
                    minLength={10}
                    maxLength={500}
                    value={form.reason}
                    onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                  />
                </label>
                <button className={control} disabled={busy}>
                  Lưu lớp nháp
                </button>
              </>
            )}
          </form>
          <section className="space-y-3 rounded-xl border bg-white p-5">
            <h2 className="text-xl font-bold">Lịch tuần dự kiến</h2>
            <p>
              Giờ địa phương Asia/Ho_Chi_Minh. Đây là mẫu tuần, chưa phải lịch buổi học chính thức
              hoặc xác nhận phòng/giảng viên.
            </p>
            <ul className="divide-y">
              {c.scheduleSlots.map((s) => (
                <li className="flex flex-wrap items-center gap-3 py-3" key={s.id}>
                  {weekdays[s.dayOfWeek]} · {s.startTime}–{s.endTime} ·{' '}
                  {s.locationText ?? 'Chưa có địa điểm'}
                  {c.editable && (
                    <>
                      <button
                        className={control}
                        disabled={busy}
                        onClick={() => {
                          setSlotId(s.id);
                          setSlot({
                            dayOfWeek: s.dayOfWeek,
                            startTime: s.startTime,
                            endTime: s.endTime,
                            locationText: s.locationText ?? '',
                            reason: '',
                          });
                        }}
                      >
                        Sửa khung giờ
                      </button>
                      <button
                        className={control}
                        disabled={busy || slot.reason.trim().length < 10}
                        onClick={() =>
                          void run(() =>
                            academicApi.write(
                              '/classes/' + id + '/weekly-templates/' + s.id,
                              { expectedUpdatedAt: c.updatedAt, reason: slot.reason },
                              'DELETE',
                            ),
                          )
                        }
                      >
                        Xóa khung giờ
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
            {!c.scheduleSlots.length && <p>Chưa có mẫu tuần.</p>}
            {c.editable && (
              <form className="grid gap-3 md:grid-cols-3" onSubmit={saveSlot}>
                <label>
                  Ngày trong tuần
                  <select
                    className={control + ' block w-full'}
                    value={slot.dayOfWeek}
                    onChange={(e) => setSlot((s) => ({ ...s, dayOfWeek: Number(e.target.value) }))}
                  >
                    {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                      <option value={d} key={d}>
                        {weekdays[d]}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Bắt đầu
                  <input
                    className={control + ' block w-full'}
                    type="time"
                    required
                    value={slot.startTime}
                    onChange={(e) => setSlot((s) => ({ ...s, startTime: e.target.value }))}
                  />
                </label>
                <label>
                  Kết thúc
                  <input
                    className={control + ' block w-full'}
                    type="time"
                    required
                    value={slot.endTime}
                    onChange={(e) => setSlot((s) => ({ ...s, endTime: e.target.value }))}
                  />
                </label>
                <label>
                  Địa điểm dự kiến
                  <input
                    className={control + ' block w-full'}
                    maxLength={300}
                    value={slot.locationText}
                    onChange={(e) => setSlot((s) => ({ ...s, locationText: e.target.value }))}
                  />
                </label>
                <label>
                  Lý do sửa lịch tuần
                  <textarea
                    className={control + ' block w-full'}
                    required
                    minLength={10}
                    maxLength={500}
                    value={slot.reason}
                    onChange={(e) => setSlot((s) => ({ ...s, reason: e.target.value }))}
                  />
                </label>
                <button className={control} disabled={busy}>
                  {slotId ? 'Lưu khung giờ' : 'Thêm khung giờ'}
                </button>
              </form>
            )}
          </section>
          </details>

          {user?.role === 'ACADEMIC_MANAGER' && (
            <>
              <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
                <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 pb-3">
                  <div>
                    <h2 className="flex items-center gap-2 text-xl font-bold text-slate-900">
                      <CalendarDays className="h-5 w-5 text-[#5e9141]" aria-hidden="true" />
                      Thiết lập vận hành, Phòng học &amp; Lịch tuần cố định
                    </h2>
                    <p className="mt-1 text-xs text-slate-600">
                      Quy ước chuẩn: 1 tiết = {c.minutesPerPeriod ?? 45} phút. Lưu cấu hình ở đây sẽ cập nhật trực tiếp trạng thái mở lớp, phòng học, giảng viên và thời lượng hiển thị ra Danh mục khóa học.
                    </p>
                  </div>
                  <span className="rounded-full bg-[#e9f2e4] px-3 py-1 text-xs font-semibold text-[#2f5d1e]">
                    LMS: {c.lmsSectionsCount ?? 0} học phần đã tạo
                  </span>
                </div>

                <form className="space-y-4" onSubmit={(e) => void saveDirectSetup(e)}>
                  <div className="grid gap-3 md:grid-cols-3">
                    <label className="text-xs font-semibold text-slate-700">
                      Trạng thái lớp trên Danh mục
                      <select
                        className={control + ' mt-1 block w-full font-normal'}
                        value={setupState.status}
                        onChange={(e) => setSetupState((s) => ({ ...s, status: e.target.value }))}
                      >
                        <option value="DRAFT">Bản nháp — Tạm ẩn trên Danh mục</option>
                        <option value="OPEN">Đang mở đăng ký — Hiển thị trên Danh mục</option>
                        <option value="IN_PROGRESS">Đang diễn ra (đang học)</option>
                        <option value="COMPLETED">Đã kết thúc</option>
                      </select>
                    </label>
                    <label className="text-xs font-semibold text-slate-700">
                      Hình thức giảng dạy
                      <select
                        className={control + ' mt-1 block w-full font-normal'}
                        value={setupState.modality}
                        onChange={(e) => setSetupState((s) => ({ ...s, modality: e.target.value }))}
                      >
                        <option value="OFFLINE">Trực tiếp tại cơ sở</option>
                        <option value="ONLINE">Trực tuyến</option>
                        <option value="HYBRID">Kết hợp trực tiếp &amp; trực tuyến</option>
                      </select>
                    </label>
                    <label className="text-xs font-semibold text-slate-700">
                      Giảng viên phụ trách
                      <select
                        className={control + ' mt-1 block w-full font-normal'}
                        value={setupState.instructorId}
                        onChange={(e) => setSetupState((s) => ({ ...s, instructorId: e.target.value }))}
                      >
                        <option value="">-- Chưa phân công --</option>
                        {instructors.map((inst) => (
                          <option key={inst.id} value={inst.id}>
                            {inst.fullName}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-xs font-semibold text-slate-700">
                      Phòng học mặc định
                      <select
                        className={control + ' mt-1 block w-full font-normal'}
                        value={setupState.defaultRoomId}
                        onChange={(e) => setSetupState((s) => ({ ...s, defaultRoomId: e.target.value }))}
                      >
                        <option value="">-- Chưa chọn phòng / Online --</option>
                        {rooms.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.code} — {r.name} ({r.capacity} chỗ · {r.location})
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-xs font-semibold text-slate-700">
                      Ngày khai giảng
                      <input
                        type="date"
                        className={control + ' mt-1 block w-full font-normal'}
                        value={setupState.classStart}
                        onChange={(e) => setSetupState((s) => ({ ...s, classStart: e.target.value }))}
                      />
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      <label className="text-xs font-semibold text-slate-700">
                        Số buổi
                        <input
                          type="number"
                          min={1}
                          max={500}
                          className={control + ' mt-1 block w-full font-normal'}
                          value={setupState.totalSessions}
                          onChange={(e) =>
                            setSetupState((s) => ({ ...s, totalSessions: Number(e.target.value) || 1 }))
                          }
                        />
                      </label>
                      <label className="text-xs font-semibold text-slate-700">
                        Tiết/buổi
                        <input
                          type="number"
                          min={1}
                          max={12}
                          className={control + ' mt-1 block w-full font-normal'}
                          value={setupState.periodsPerSession}
                          onChange={(e) => {
                            const periods = Number(e.target.value) || 3;
                            setSetupState((s) => ({
                              ...s,
                              periodsPerSession: periods,
                              slots: s.slots.map((sl) => ({
                                ...sl,
                                endTime: addMinutesToWallClock(sl.startTime, periods * 45),
                              })),
                            }));
                          }}
                        />
                      </label>
                      <label className="text-xs font-semibold text-slate-700">
                        Tổng tiết
                        <input
                          readOnly
                          className={control + ' mt-1 block w-full bg-slate-50 font-semibold'}
                          value={setupState.totalSessions * setupState.periodsPerSession}
                        />
                      </label>
                    </div>
                  </div>

                  <div className="space-y-2 rounded-lg border border-slate-200 bg-[#f8f9fa] p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-bold uppercase tracking-wide text-slate-700">
                        Các ca học cố định trong tuần ({setupState.slots.length} ca · tự tính{' '}
                        {setupState.periodsPerSession * 45} phút/ca)
                      </span>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        onClick={() =>
                          setSetupState((s) => ({
                            ...s,
                            slots: [
                              ...s.slots,
                              {
                                dayOfWeek: 1,
                                startTime: '18:30',
                                endTime: addMinutesToWallClock('18:30', s.periodsPerSession * 45),
                                roomId: s.defaultRoomId,
                                locationText: '',
                                meetingUrl: '',
                              },
                            ],
                          }))
                        }
                      >
                        <Plus size={13} aria-hidden="true" />
                        Thêm ca học
                      </button>
                    </div>

                    {setupState.slots.length === 0 ? (
                      <p className="text-xs text-slate-500">
                        Chưa có ca học cố định. Hãy bấm "Thêm ca học" (VD: Thứ 2 &amp; Thứ 4, 18:30–20:45 tại phòng học).
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {setupState.slots.map((sl, idx) => (
                          <div
                            key={idx}
                            className="grid gap-2 rounded-lg border border-slate-200 bg-white p-2.5 sm:grid-cols-[130px_100px_100px_1fr_1fr_auto]"
                          >
                            <select
                              className={control + ' text-xs'}
                              value={sl.dayOfWeek}
                              onChange={(e) =>
                                setSetupState((s) => ({
                                  ...s,
                                  slots: s.slots.map((it, i) =>
                                    i === idx ? { ...it, dayOfWeek: Number(e.target.value) } : it,
                                  ),
                                }))
                              }
                            >
                              {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                                <option key={d} value={d}>
                                  {weekdays[d]}
                                </option>
                              ))}
                            </select>
                            <input
                              type="time"
                              className={control + ' text-xs'}
                              value={sl.startTime}
                              onChange={(e) => {
                                const val = e.target.value;
                                setSetupState((s) => ({
                                  ...s,
                                  slots: s.slots.map((it, i) =>
                                    i === idx
                                      ? {
                                          ...it,
                                          startTime: val,
                                          endTime: addMinutesToWallClock(val, s.periodsPerSession * 45),
                                        }
                                      : it,
                                  ),
                                }));
                              }}
                            />
                            <input
                              type="time"
                              className={control + ' text-xs'}
                              value={sl.endTime}
                              onChange={(e) =>
                                setSetupState((s) => ({
                                  ...s,
                                  slots: s.slots.map((it, i) =>
                                    i === idx ? { ...it, endTime: e.target.value } : it,
                                  ),
                                }))
                              }
                            />
                            <select
                              className={control + ' text-xs'}
                              value={sl.roomId}
                              onChange={(e) =>
                                setSetupState((s) => ({
                                  ...s,
                                  slots: s.slots.map((it, i) =>
                                    i === idx ? { ...it, roomId: e.target.value } : it,
                                  ),
                                }))
                              }
                            >
                              <option value="">-- Dùng phòng mặc định / Online --</option>
                              {rooms.map((r) => (
                                <option key={r.id} value={r.id}>
                                  {r.code} · {r.name}
                                </option>
                              ))}
                            </select>
                            <input
                              type="text"
                              className={control + ' text-xs'}
                              placeholder="Ghi chú địa điểm hoặc Link Meet..."
                              value={setupState.modality === 'ONLINE' ? sl.meetingUrl : sl.locationText}
                              onChange={(e) =>
                                setSetupState((s) => ({
                                  ...s,
                                  slots: s.slots.map((it, i) =>
                                    i === idx
                                      ? s.modality === 'ONLINE'
                                        ? { ...it, meetingUrl: e.target.value }
                                        : { ...it, locationText: e.target.value }
                                      : it,
                                  ),
                                }))
                              }
                            />
                            <button
                              type="button"
                              aria-label="Xóa ca học"
                              className="rounded border border-rose-200 px-2 py-1 text-xs text-rose-600 hover:bg-rose-50"
                              onClick={() =>
                                setSetupState((s) => ({
                                  ...s,
                                  slots: s.slots.filter((_, i) => i !== idx),
                                }))
                              }
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <label className="flex items-center gap-2 text-xs text-slate-700">
                      <input
                        type="checkbox"
                        checked={setupState.syncLmsSections}
                        onChange={(e) =>
                          setSetupState((s) => ({ ...s, syncLmsSections: e.target.checked }))
                        }
                      />
                      Tự động tạo Học phần LMS còn thiếu từ khung chương trình khóa học
                    </label>
                    <button
                      type="submit"
                      disabled={busy}
                      className="rounded-lg bg-[#76a35e] px-4 py-2 text-sm font-semibold text-white hover:bg-[#658f4f] disabled:opacity-60"
                    >
                      Lưu cấu hình vận hành &amp; Lịch tuần
                    </button>
                  </div>
                </form>
              </section>

              {/* Bản đồ lộ trình lớp học */}
              <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                  <div>
                    <h2 className="text-xl font-bold text-slate-900">
                      Bản đồ lộ trình lớp học (Tuần · Ngày · Nội dung · Hình thức · Phòng học)
                    </h2>
                    <p className="mt-0.5 text-xs text-slate-600">
                      Sinh tự động từng buổi dựa theo Ngày khai giảng, Lịch tuần cố định và Khung chương trình chuẩn, hoặc chuyển riêng một buổi sang Online / đổi ngày nghỉ lễ.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void triggerSyncLms()}
                      className={control + ' inline-flex items-center gap-1.5 font-semibold text-[#2f5d1e]'}
                    >
                      <BookOpenCheck size={14} aria-hidden="true" />
                      Khởi tạo Học phần LMS
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void generateRoadmap()}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[#e66f2b] px-3.5 py-2 text-sm font-semibold text-white hover:bg-[#cf5e1d] disabled:opacity-60"
                    >
                      <Sparkles size={15} aria-hidden="true" />
                      Sinh bản đồ tự động
                    </button>
                  </div>
                </div>

                {roadmapDraft.length === 0 ? (
                  <p className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">
                    Chưa có dòng nào trong Bản đồ lớp học. Hãy thiết lập Ngày khai giảng + Ca học ở trên rồi nhấn "Sinh bản đồ tự động".
                  </p>
                ) : !editingRoadmap ? (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5">
                      <span className="text-xs font-semibold text-slate-700">
                        Lớp đang có <strong>{roadmapDraft.length}</strong> buổi trong Bản đồ lộ trình (đang hiển thị chế độ xem gọn).
                      </span>
                      <button
                        type="button"
                        onClick={() => setEditingRoadmap(true)}
                        className="rounded-lg border border-[#76a35e] bg-white px-3 py-1.5 text-xs font-semibold text-[#2f5d1e] hover:bg-[#f2f8ef]"
                      >
                        Chỉnh sửa chi tiết từng buổi ({roadmapDraft.length})
                      </button>
                    </div>
                    <ClassRoadmapTable
                      title={`Bản đồ lộ trình lớp học (${roadmapDraft.length} buổi)`}
                      items={c.roadmapItems && c.roadmapItems.length > 0 ? c.roadmapItems : roadmapDraft}
                      classStart={c.classStart}
                      classEnd={c.classEnd}
                      defaultRoom={c.defaultRoom}
                      minutesPerPeriod={c.minutesPerPeriod ?? 45}
                      showMeetingUrl
                    />
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-semibold text-slate-700">Lọc theo tuần:</span>
                        <select
                          aria-label="Lọc lộ trình theo tuần"
                          value={weekFilter}
                          onChange={(e) =>
                            setWeekFilter(e.target.value === 'ALL' ? 'ALL' : Number(e.target.value))
                          }
                          className="rounded border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-900"
                        >
                          <option value="ALL">Tất cả ({roadmapDraft.length} buổi)</option>
                          {Array.from(new Set(roadmapDraft.map((r) => r.weekNumber)))
                            .sort((a, b) => a - b)
                            .map((w) => (
                              <option key={w} value={w}>
                                Tuần {w}
                              </option>
                            ))}
                        </select>
                      </div>
                      <button
                        type="button"
                        onClick={() => setEditingRoadmap(false)}
                        className="rounded border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                      >
                        Thu gọn về chế độ xem
                      </button>
                    </div>
                    <div className="overflow-x-auto rounded-lg border border-slate-200">
                      <table className="min-w-[960px] w-full divide-y divide-slate-200 text-left text-xs">
                        <thead className="bg-[#f8f9fa] font-semibold uppercase text-slate-600">
                          <tr>
                            <th className="px-2.5 py-2.5 w-16">Tuần</th>
                            <th className="px-2.5 py-2.5 w-16">Buổi</th>
                            <th className="px-2.5 py-2.5 w-36">Ngày học</th>
                            <th className="px-2.5 py-2.5 w-44">Giờ &amp; Số tiết</th>
                            <th className="px-2.5 py-2.5">Nội dung bài học</th>
                            <th className="px-2.5 py-2.5 w-32">Hình thức</th>
                            <th className="px-2.5 py-2.5 w-56">Phòng học / Link Online</th>
                            <th className="px-2 py-2.5 w-10"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white">
                          {roadmapDraft
                            .map((row, idx) => ({ row, idx }))
                            .filter(({ row }) => weekFilter === 'ALL' || row.weekNumber === weekFilter)
                            .map(({ row, idx }) => (
                              <tr key={row.id ?? `rm-${idx}`} className="align-top">
                                <td className="px-2 py-2">
                                  <input
                                    type="number"
                                    min={1}
                                    className={control + ' w-14 px-2 py-1 text-xs'}
                                    value={row.weekNumber}
                                    onChange={(e) =>
                                      setRoadmapDraft((prev) =>
                                        prev.map((it, i) =>
                                          i === idx ? { ...it, weekNumber: Number(e.target.value) || 1 } : it,
                                        ),
                                      )
                                    }
                                  />
                                </td>
                                <td className="px-2 py-2">
                                  <input
                                    type="number"
                                    min={1}
                                    className={control + ' w-14 px-2 py-1 text-xs font-bold'}
                                    value={row.sessionNumber}
                                    onChange={(e) =>
                                      setRoadmapDraft((prev) =>
                                        prev.map((it, i) =>
                                          i === idx ? { ...it, sessionNumber: Number(e.target.value) || 1 } : it,
                                        ),
                                      )
                                    }
                                  />
                                </td>
                                <td className="px-2 py-2">
                                  <input
                                    type="date"
                                    className={control + ' w-full px-2 py-1 text-xs'}
                                    value={row.sessionDate.slice(0, 10)}
                                    onChange={(e) =>
                                      setRoadmapDraft((prev) =>
                                        prev.map((it, i) =>
                                          i === idx ? { ...it, sessionDate: e.target.value } : it,
                                        ),
                                      )
                                    }
                                  />
                                </td>
                                <td className="px-2 py-2 space-y-1">
                                  <div className="flex items-center gap-1">
                                    <input
                                      type="time"
                                      className={control + ' px-1.5 py-1 text-xs'}
                                      value={row.startTime}
                                      onChange={(e) =>
                                        setRoadmapDraft((prev) =>
                                          prev.map((it, i) =>
                                            i === idx ? { ...it, startTime: e.target.value } : it,
                                          ),
                                        )
                                      }
                                    />
                                    <span>–</span>
                                    <input
                                      type="time"
                                      className={control + ' px-1.5 py-1 text-xs'}
                                      value={row.endTime}
                                      onChange={(e) =>
                                        setRoadmapDraft((prev) =>
                                          prev.map((it, i) =>
                                            i === idx ? { ...it, endTime: e.target.value } : it,
                                          ),
                                        )
                                      }
                                    />
                                  </div>
                                  <div className="flex items-center gap-1 text-[11px] text-slate-500">
                                    <input
                                      type="number"
                                      min={1}
                                      max={12}
                                      className="w-12 rounded border border-slate-300 px-1.5 py-0.5 text-xs"
                                      value={row.periods}
                                      onChange={(e) =>
                                        setRoadmapDraft((prev) =>
                                          prev.map((it, i) =>
                                            i === idx ? { ...it, periods: Number(e.target.value) || 1 } : it,
                                          ),
                                        )
                                      }
                                    />
                                    <span>tiết ({row.periods * 45}p)</span>
                                  </div>
                                </td>
                                <td className="px-2 py-2 space-y-1">
                                  <input
                                    type="text"
                                    className={control + ' w-full px-2 py-1 text-xs font-semibold'}
                                    value={row.topicTitle}
                                    onChange={(e) =>
                                      setRoadmapDraft((prev) =>
                                        prev.map((it, i) =>
                                          i === idx ? { ...it, topicTitle: e.target.value } : it,
                                        ),
                                      )
                                    }
                                  />
                                  <input
                                    type="text"
                                    className={control + ' w-full px-2 py-1 text-xs text-slate-600'}
                                    placeholder="Mô tả nội dung buổi học..."
                                    value={row.contentSummary ?? ''}
                                    onChange={(e) =>
                                      setRoadmapDraft((prev) =>
                                        prev.map((it, i) =>
                                          i === idx ? { ...it, contentSummary: e.target.value } : it,
                                        ),
                                      )
                                    }
                                  />
                                </td>
                                <td className="px-2 py-2">
                                  <select
                                    className={control + ' w-full px-2 py-1 text-xs'}
                                    value={row.modality}
                                    onChange={(e) =>
                                      setRoadmapDraft((prev) =>
                                        prev.map((it, i) =>
                                          i === idx
                                            ? { ...it, modality: e.target.value as ClassModality }
                                            : it,
                                        ),
                                      )
                                    }
                                  >
                                    <option value="OFFLINE">Trực tiếp</option>
                                    <option value="ONLINE">Trực tuyến</option>
                                    <option value="HYBRID">Kết hợp</option>
                                  </select>
                                </td>
                                <td className="px-2 py-2 space-y-1">
                                  {row.modality !== 'ONLINE' && (
                                    <select
                                      className={control + ' w-full px-2 py-1 text-xs'}
                                      value={row.roomId ?? ''}
                                      onChange={(e) =>
                                        setRoadmapDraft((prev) =>
                                          prev.map((it, i) =>
                                            i === idx ? { ...it, roomId: e.target.value || null } : it,
                                          ),
                                        )
                                      }
                                    >
                                      <option value="">-- Phòng theo ghi chú --</option>
                                      {rooms.map((r) => (
                                        <option key={r.id} value={r.id}>
                                          {r.code} · {r.name}
                                        </option>
                                      ))}
                                    </select>
                                  )}
                                  <input
                                    type="text"
                                    className={control + ' w-full px-2 py-1 text-xs'}
                                    placeholder={
                                      row.modality === 'ONLINE' ? 'Link Google Meet...' : 'Địa chỉ phòng học...'
                                    }
                                    value={row.modality === 'ONLINE' ? (row.meetingUrl ?? '') : (row.locationText ?? '')}
                                    onChange={(e) =>
                                      setRoadmapDraft((prev) =>
                                        prev.map((it, i) =>
                                          i === idx
                                            ? row.modality === 'ONLINE'
                                              ? { ...it, meetingUrl: e.target.value }
                                              : { ...it, locationText: e.target.value }
                                            : it,
                                        ),
                                      )
                                    }
                                  />
                                </td>
                                <td className="px-2 py-2">
                                  <button
                                    type="button"
                                    aria-label="Xóa buổi"
                                    className="rounded border border-rose-200 p-1 text-rose-600 hover:bg-rose-50"
                                    onClick={() =>
                                      setRoadmapDraft((prev) => prev.filter((_, i) => i !== idx))
                                    }
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    className={control + ' inline-flex items-center gap-1 text-xs font-semibold'}
                    onClick={() => {
                      setEditingRoadmap(true);
                      setRoadmapDraft((prev) => {
                        const last = prev[prev.length - 1];
                        const nextSession = (last?.sessionNumber ?? 0) + 1;
                        return [
                          ...prev,
                          {
                            weekNumber: last ? last.weekNumber : 1,
                            sessionNumber: nextSession,
                            sessionDate: last ? last.sessionDate.slice(0, 10) : setupState.classStart || new Date().toISOString().slice(0, 10),
                            startTime: last?.startTime ?? '18:30',
                            endTime: last?.endTime ?? '20:45',
                            periods: setupState.periodsPerSession || 3,
                            modality: (setupState.modality as ClassModality) || 'OFFLINE',
                            roomId: setupState.defaultRoomId || null,
                            locationText: '',
                            meetingUrl: '',
                            topicTitle: `Buổi ${nextSession}`,
                            contentSummary: '',
                          },
                        ];
                      });
                    }}
                  >
                    <Plus size={13} aria-hidden="true" />
                    Thêm buổi thủ công
                  </button>
                  {roadmapDraft.length > 0 && editingRoadmap && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void saveRoadmapItems()}
                      className="rounded-lg bg-[#76a35e] px-4 py-2 text-sm font-semibold text-white hover:bg-[#658f4f] disabled:opacity-60"
                    >
                      Lưu bản đồ &amp; Đồng bộ buổi học chính thức
                    </button>
                  )}
                </div>
              </section>
            </>
          )}
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs">
            <h2 className="text-lg font-bold text-slate-900">Danh sách ghi danh trong phạm vi</h2>
            <p className="mt-1 text-xs text-slate-500">
              {Object.entries(roster?.summary ?? {})
                .map(([s, n]) => label(s) + ': ' + n)
                .join(' · ')}
            </p>
            <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="bg-slate-50 font-semibold text-slate-700">
                  <tr>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-600">Học viên</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-600">Trạng thái</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-600">Ngày ghi danh</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {(roster?.meta.page === page ? roster.data : []).map((r) => (
                    <tr key={r.id} className="transition-colors hover:bg-slate-50/60">
                      <td className="px-4 py-3 font-medium text-slate-900">
                        <div>{r.learner?.fullName ?? 'Ghi danh của bạn'}</div>
                        {(r.learner as { email?: string } | undefined)?.email &&
                          !(r.learner as { email?: string }).email!.endsWith('@example.invalid') && (
                            <div className="text-xs font-normal text-slate-500">
                              {(r.learner as { email?: string }).email}
                            </div>
                          )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          r.status === 'ACTIVE'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : r.status === 'PENDING'
                              ? 'bg-amber-50 text-amber-700 border border-amber-200'
                              : 'bg-slate-50 text-slate-700 border border-slate-200'
                        }`}>
                          {label(r.status)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {new Intl.DateTimeFormat('vi-VN', {
                          timeZone: 'Asia/Ho_Chi_Minh',
                          dateStyle: 'medium',
                        }).format(new Date(r.enrolledAt))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {roster?.meta.page !== page && <p role="status">Đang tải ghi danh…</p>}
            {roster?.meta.page === page && !roster.data.length && (
              <p>Chưa có ghi danh trong phạm vi này.</p>
            )}
            <div className="mt-4 flex gap-3">
              <button
                className={control}
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Trang trước
              </button>
              <button
                className={control}
                disabled={!roster || page * roster.meta.limit >= roster.meta.total}
                onClick={() => setPage((p) => p + 1)}
              >
                Trang sau
              </button>
            </div>
          </section>
        </>
      )}
    </main>
  );
}
