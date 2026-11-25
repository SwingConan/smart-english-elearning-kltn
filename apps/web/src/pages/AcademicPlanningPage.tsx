import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router';
import { Calendar, ChevronLeft, ChevronRight, List } from 'lucide-react';
import { academicApi, type AcademicClass } from '@/features/academic/api';
import { useAuth } from '@/features/auth/auth-context';
import { accountLabel, classLabel, isTechnicalQaRecord } from '@/features/catalog/record-presentation';
import { classCodeLabel } from '@/features/demo/presentation';
import {
  formatVnDate,
  pickInitialWeekMonday,
  shiftDateKey,
  timeToBand,
  vnDateKey,
  vnHourMinute,
  vnTimeOnly,
  vnTodayKey,
  weekDateKeys,
  weekMondayKey,
} from '@/features/academic/calendar-utils';
import {
  WeeklyTimetableGrid,
  type GridTone,
  type TimetableGridItem,
} from '@/features/academic/WeeklyTimetableGrid';
import {
  academicState,
  capabilities,
  capabilityLabel,
  control,
  planningApi,
  schoolDate,
  schoolInput,
  sourceTemplateWarning,
  type Room,
  type Assignment,
  type Session,
} from '@/features/academic/planning-api';
const ROOM_STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Sẵn sàng',
  MAINTENANCE: 'Bảo trì',
  UNAVAILABLE: 'Không khả dụng',
  ARCHIVED: 'Ngừng sử dụng',
};

const MODALITY_LABELS: Record<string, string> = {
  OFFLINE: 'Trực tiếp',
  ONLINE: 'Trực tuyến',
  HYBRID: 'Kết hợp',
};

export function AcademicPlanningPage() {
  const { user } = useAuth(),
    [params] = useSearchParams();
  const [classId, setClassId] = useState(params.get('classId') ?? ''),
    [tab, setTab] = useState<'rooms' | 'schedule'>(() =>
      params.get('tab') === 'rooms' ? 'rooms' : 'schedule',
    ),
    [allSessions, setAllSessions] = useState<Session[]>([]),
    [roomStatusFilter, setRoomStatusFilter] = useState('ALL'),
    [roomSearch, setRoomSearch] = useState(''),
    [showRoomForm, setShowRoomForm] = useState(false),
    [deleteRoomTarget, setDeleteRoomTarget] = useState<Room | null>(null),
    [deleteRoomReason, setDeleteRoomReason] = useState(''),
    [sessionStateFilter, setSessionStateFilter] = useState('ALL'),
    [cancelSessionId, setCancelSessionId] = useState(''),
    [cancelSessionReason, setCancelSessionReason] = useState('');
  const [classes, setClasses] = useState<AcademicClass[]>([]),
    [rooms, setRooms] = useState<Room[]>([]),
    [instructors, setInstructors] = useState<{ id: string; fullName: string }[]>([]),
    [assignmentData, setAssignments] = useState<Assignment[]>([]),
    [sessionData, setSessions] = useState<Session[]>([]),
    [loadedClass, setLoadedClass] = useState(''),
    [detail, setDetail] = useState<Session>(),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false),
    [tick, setTick] = useState(0);
  const [roomId, setRoomId] = useState(''),
    [roomSchedule, setRoomSchedule] = useState<{
      room: Room;
      weeklySlots: Array<{
        id: string;
        dayOfWeek: number;
        startTime: string;
        endTime: string;
        locationText: string | null;
        classOffering: { id: string; code: string; name: string; status: string; instructor?: { fullName: string } | null };
      }>;
      upcomingSessions: Array<{
        id: string;
        startsAt: string;
        endsAt: string;
        classOffering: { id: string; code: string; name: string };
        instructor?: { fullName: string } | null;
      }>;
    } | null>(null),
    [roomForm, setRoomForm] = useState({
      code: '',
      name: '',
      location: '',
      capacity: 20,
      capabilities: [] as string[],
      status: 'ACTIVE',
      reason: '',
      expectedLockVersion: 0,
    });
  const [initialNow] = useState(() => Date.now());
  const tomorrow = schoolInput(new Date(initialNow + 86400000).toISOString());
  const assignments = loadedClass === classId ? assignmentData : [];
  const sessions = loadedClass === classId ? sessionData : [];
  const [assignment, setAssignment] = useState({
    instructorId: '',
    effectiveFrom: tomorrow,
    effectiveTo: schoolInput(new Date(initialNow + 30 * 86400000).toISOString()),
    replacesId: '',
    reason: '',
  });
  const [session, setSession] = useState({
    startLocal: tomorrow,
    endLocal: tomorrow.slice(0, 11) + '20:00',
    timezone: 'Asia/Ho_Chi_Minh',
    startOffset: '',
    endOffset: '',
    modality: 'ONLINE',
    roomId: '',
    assignmentId: '',
    requiredCapabilities: [] as string[],
    reason: '',
  });
  const todayKey = useMemo(() => vnTodayKey(), []);
  const [editId, setEditId] = useState(''),
    [editVersion, setEditVersion] = useState(0),
    [revisionOf, setRevisionOf] = useState(''),
    [showAllSessions, setShowAllSessions] = useState(false),
    [sessionViewMode, setSessionViewMode] = useState<'week' | 'table'>('week'),
    [sessionWeekMonday, setSessionWeekMonday] = useState(() => weekMondayKey(vnTodayKey())),
    [selectedWeekSessionId, setSelectedWeekSessionId] = useState(''),
    [roomWeekMonday, setRoomWeekMonday] = useState(() => weekMondayKey(vnTodayKey()));
  const [generation, setGeneration] = useState({
    from: tomorrow.slice(0, 10),
    through: tomorrow.slice(0, 10),
    excludeDates: '',
    exceptionsReviewed: false,
    reason: '',
  });
  useEffect(() => {
    let live = true;
    void Promise.all([
      academicApi.classes('?limit=50'),
      planningApi.get<{ data: Room[] }>('rooms?limit=100'),
      planningApi.get<{ id: string; fullName: string }[]>('instructors'),
      planningApi
        .get<{ data: Session[]; meta?: { total: number; page: number; limit: number } }>(
          'calendar?page=1&limit=100',
        )
        .then(async (first) => {
          const rows = [...(first.data ?? [])];
          const total = first.meta?.total ?? rows.length;
          const totalPages = Math.min(5, Math.ceil(total / 100));
          if (totalPages > 1) {
            const extra = await Promise.all(
              Array.from({ length: totalPages - 1 }, (_, i) =>
                planningApi
                  .get<{ data: Session[] }>(`calendar?page=${i + 2}&limit=100`)
                  .catch(() => ({ data: [] as Session[] })),
              ),
            );
            for (const pageRes of extra) {
              rows.push(...(pageRes.data ?? []));
            }
          }
          return { data: rows };
        })
        .catch(() => ({ data: [] as Session[] })),
    ])
      .then(([c, r, i, cal]) => {
        if (live) {
          setClasses(c.data.filter((c) => c.course.createdById === user?.id));
          setRooms(r.data);
          setInstructors(i);
          setAllSessions(cal.data ?? []);
        }
      })
      .catch(() => {
        if (live) setError('Không tải được dữ liệu học vụ.');
      });
    return () => {
      live = false;
    };
  }, [user?.id, tick]);
  useEffect(() => {
    let live = true;
    if (classId)
      void Promise.all([
        planningApi.get<Assignment[]>('classes/' + classId + '/assignments'),
        planningApi.get<{ data: Session[] }>('calendar?classId=' + classId + '&limit=100'),
      ])
        .then(([a, s]) => {
          if (live) {
            setAssignments(a);
            setSessions(s.data);
            setLoadedClass(classId);
            setSessionWeekMonday(
              pickInitialWeekMonday(
                s.data.map((x) => vnDateKey(x.startsAt)),
                todayKey,
              ),
            );
            setSelectedWeekSessionId('');
          }
        })
        .catch(() => {
          if (live) setError('Không tải được lịch/phân công trong phạm vi lớp.');
        });
    return () => {
      live = false;
    };
  }, [classId, tick]);
  async function action(work: () => Promise<void>) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await work();
      setTick((x) => x + 1);
    } catch {
      setError(
        'Không thể hoàn tất thao tác. Vui lòng kiểm tra lại quyền truy cập hoặc xung đột lịch phòng học và thử lại.',
      );
    } finally {
      setBusy(false);
    }
  }
  const submit = (kind: string, row: Assignment | Session) =>
    action(async () => {
      await planningApi.write(kind + '/' + row.id + '/submit', {
        expectedLockVersion: row.lockVersion,
        reason: row.reason,
      });
      setMessage('Đã gửi yêu cầu phê duyệt thành công.');
    });
  const saveRoom = (e: FormEvent) => {
    e.preventDefault();
    void action(async () => {
      const body = roomId ? roomForm : { ...roomForm, expectedLockVersion: undefined };
      await planningApi.write(
        'rooms' + (roomId ? '/' + roomId : ''),
        body,
        roomId ? 'PATCH' : 'POST',
      );
      setRoomId('');
      setRoomForm({ ...roomForm, code: '', name: '', reason: '', expectedLockVersion: 0 });
      setMessage(
        'Đã lưu thông tin phòng học thành công.',
      );
    });
  };
  const sessionBody = () => ({
    ...session,
    roomId: session.roomId || undefined,
    assignmentId: session.assignmentId || undefined,
    startOffset: session.startOffset || undefined,
    endOffset: session.endOffset || undefined,
  });
  const saveSession = (e: FormEvent) => {
    e.preventDefault();
    void action(async () => {
      await planningApi.write(
        revisionOf
          ? 'sessions/' + revisionOf + '/reschedule'
          : editId
            ? 'sessions/' + editId
            : 'classes/' + classId + '/sessions',
        { ...sessionBody(), ...(editId ? { expectedLockVersion: editVersion } : {}) },
        editId ? 'PATCH' : 'POST',
      );
      setEditId('');
      setRevisionOf('');
      setMessage('Đã lưu bản nháp buổi học thành công.');
    });
  };
  const generate = (e: FormEvent) => {
    e.preventDefault();
    void action(async () => {
      const r = await planningApi.write<{
        created: number;
        existing: number;
        staleExisting?: number;
      }>('classes/' + classId + '/generate-sessions', {
        ...generation,
        excludeDates: generation.excludeDates.split(/[\s,]+/).filter(Boolean),
        timezone: session.timezone,
        roomId: session.roomId || undefined,
        assignmentId: session.assignmentId || undefined,
        requiredCapabilities: session.requiredCapabilities,
      });
      setMessage(
        `Đã tạo ${r.created} buổi học nháp (${r.existing} buổi đã tồn tại${
          r.staleExisting ? `, ${r.staleExisting} buổi có mẫu nguồn cũ` : ''
        }). Chưa công bố lịch, vui lòng kiểm tra và gửi phê duyệt.`,
      );
    });
  };
  const chooseSession = (s: Session, revision = false) => {
    setSession({
      startLocal: schoolInput(s.startsAt),
      endLocal: schoolInput(s.endsAt),
      timezone: 'Asia/Ho_Chi_Minh',
      startOffset: '',
      endOffset: '',
      modality: s.modality,
      roomId: s.roomId ?? '',
      assignmentId: s.assignmentId ?? '',
      requiredCapabilities: s.requiredCapabilities,
      reason: '',
    });
    setEditId(revision ? '' : s.id);
    setRevisionOf(revision ? s.id : '');
    setEditVersion(s.lockVersion);
  };

  const roomUsageCount = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of allSessions) {
      if (s.roomId && !['CANCELLED', 'SUPERSEDED'].includes(s.state)) {
        counts.set(s.roomId, (counts.get(s.roomId) ?? 0) + 1);
      }
    }
    return counts;
  }, [allSessions]);

  const conflictWarnings = useMemo(() => {
    const warnings: string[] = [];
    if (!session.startLocal || !session.endLocal) return warnings;
    const startMs = new Date(session.startLocal + ':00+07:00').getTime();
    const endMs = new Date(session.endLocal + ':00+07:00').getTime();
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
      return warnings;
    }

    const selectedAssign = assignments.find((a) => a.id === session.assignmentId);
    const targetInstructorId = selectedAssign?.instructorId;

    for (const other of allSessions) {
      if (other.id === editId || other.id === revisionOf) continue;
      if (['CANCELLED', 'SUPERSEDED'].includes(other.state)) continue;
      const oStart = new Date(other.startsAt).getTime();
      const oEnd = new Date(other.endsAt).getTime();
      if (!(startMs < oEnd && endMs > oStart)) continue;

      if (session.roomId && other.roomId === session.roomId) {
        warnings.push(
          `Trùng phòng học với lớp ${other.classOffering.code} (${schoolDate(other.startsAt)})`,
        );
      }
      if (targetInstructorId && other.instructor?.id === targetInstructorId) {
        warnings.push(
          `Trùng lịch giảng viên ${other.instructor.fullName} ở lớp ${other.classOffering.code} (${schoolDate(other.startsAt)})`,
        );
      }
      if (classId && other.classOfferingId === classId) {
        warnings.push(`Trùng khung giờ của chính lớp này (${schoolDate(other.startsAt)})`);
      }
    }
    return warnings;
  }, [allSessions, session.startLocal, session.endLocal, session.roomId, session.assignmentId, assignments, editId, revisionOf, classId]);

  const filteredRooms = useMemo(() => {
    const q = roomSearch.trim().toLowerCase();
    return rooms.filter((r) => {
      if (roomStatusFilter !== 'ALL' && r.status !== roomStatusFilter) return false;
      if (!q) return true;
      return `${r.code} ${r.name} ${r.location}`.toLowerCase().includes(q);
    });
  }, [rooms, roomStatusFilter, roomSearch]);

  const visibleSessions = useMemo(
    () =>
      sessionStateFilter === 'ALL'
        ? sessions
        : sessions.filter((s) => s.state === sessionStateFilter),
    [sessions, sessionStateFilter],
  );

  const roomTemplateItems: TimetableGridItem[] = useMemo(() => {
    if (!roomSchedule) return [];
    const tones: GridTone[] = ['green', 'orange', 'amber', 'neutral'];
    const classToneMap = new Map<string, GridTone>();
    roomSchedule.weeklySlots.forEach((s) => {
      if (!classToneMap.has(s.classOffering.id)) {
        classToneMap.set(s.classOffering.id, tones[classToneMap.size % tones.length]);
      }
    });
    return roomSchedule.weeklySlots.map((s) => ({
      id: s.id,
      dayIndex: Math.max(0, Math.min(6, s.dayOfWeek - 1)),
      band: timeToBand(s.startTime),
      sortKey: s.startTime,
      timeLabel: `${s.startTime}–${s.endTime}`,
      title: classCodeLabel(s.classOffering.code),
      subtitle: classLabel(s.classOffering.name),
      meta: s.classOffering.instructor?.fullName
        ? `GV: ${accountLabel(s.classOffering.instructor.fullName)}`
        : 'Chưa gắn GV',
      tone: classToneMap.get(s.classOffering.id) ?? 'green',
      href: '/academic/classes/' + s.classOffering.id,
    }));
  }, [roomSchedule]);

  const roomUpcomingWeekDays = useMemo(() => weekDateKeys(roomWeekMonday), [roomWeekMonday]);
  const roomUpcomingItems: TimetableGridItem[] = useMemo(() => {
    if (!roomSchedule) return [];
    const out: TimetableGridItem[] = [];
    for (const u of roomSchedule.upcomingSessions) {
      const dk = vnDateKey(u.startsAt);
      const dayIdx = roomUpcomingWeekDays.indexOf(dk);
      if (dayIdx === -1) continue;
      out.push({
        id: u.id,
        dayIndex: dayIdx,
        band: timeToBand(vnHourMinute(u.startsAt)),
        sortKey: u.startsAt,
        timeLabel: `${vnTimeOnly(u.startsAt)}–${vnTimeOnly(u.endsAt)}`,
        title: classCodeLabel(u.classOffering.code),
        subtitle: classLabel(u.classOffering.name),
        meta: u.instructor?.fullName ? `GV: ${accountLabel(u.instructor.fullName)}` : undefined,
        tone: 'green',
        href: '/academic/classes/' + u.classOffering.id,
      });
    }
    return out;
  }, [roomSchedule, roomUpcomingWeekDays]);

  const classWeekDays = useMemo(() => weekDateKeys(sessionWeekMonday), [sessionWeekMonday]);
  const classWeekItems: TimetableGridItem[] = useMemo(() => {
    const toneByState: Record<string, GridTone> = {
      PUBLISHED: 'green',
      PENDING_APPROVAL: 'amber',
      DRAFT: 'neutral',
      CANCELLED: 'rose',
      SUPERSEDED: 'neutral',
    };
    const out: TimetableGridItem[] = [];
    for (const s of visibleSessions) {
      const dk = vnDateKey(s.startsAt);
      const dayIdx = classWeekDays.indexOf(dk);
      if (dayIdx === -1) continue;
      out.push({
        id: s.id,
        dayIndex: dayIdx,
        band: timeToBand(vnHourMinute(s.startsAt)),
        sortKey: s.startsAt,
        timeLabel: `${vnTimeOnly(s.startsAt)}–${vnTimeOnly(s.endsAt)}`,
        title: `${MODALITY_LABELS[s.modality] ?? s.modality}${s.room?.code ? ` · ${s.room.code}` : ''}`,
        subtitle: s.instructor?.fullName ? accountLabel(s.instructor.fullName) : 'Chưa phân công GV',
        meta: `Phiên bản ${s.revision}`,
        badgeLabel: academicState(s.state),
        tone: toneByState[s.state] ?? 'neutral',
        selected: selectedWeekSessionId === s.id,
        onClick: () => setSelectedWeekSessionId(s.id),
      });
    }
    return out;
  }, [visibleSessions, classWeekDays, selectedWeekSessionId]);

  const selectedWeekSession = useMemo(
    () => visibleSessions.find((s) => s.id === selectedWeekSessionId) ?? null,
    [visibleSessions, selectedWeekSessionId],
  );

  return (
    <main className="workspace-page space-y-6">
      <header className="workspace-header flex flex-wrap items-center justify-between gap-4 rounded-lg border border-slate-200 bg-white p-5">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-[#2f5d1e]">
            Kế hoạch Học vụ · Phòng học & Lịch giảng dạy
          </p>
          <h1 className="mt-1 text-2xl font-bold text-[#e66f2b] sm:text-3xl">
            Quản lý phòng học & Lịch giảng dạy
          </h1>
        </div>
        <nav className="flex flex-wrap items-center gap-2.5 text-sm">
          <button
            className={
              tab === 'rooms'
                ? 'rounded border border-[#76a35e] bg-[#76a35e] px-4 py-2 font-bold text-white shadow-xs'
                : control
            }
            onClick={() => setTab('rooms')}
          >
            Quản lý phòng
          </button>
          <button
            className={
              tab === 'schedule'
                ? 'rounded border border-[#76a35e] bg-[#76a35e] px-4 py-2 font-bold text-white shadow-xs'
                : control
            }
            onClick={() => setTab('schedule')}
          >
            Lịch và phân công
          </button>
          <button className={control} onClick={() => setTick((x) => x + 1)}>
            Tải lại
          </button>
        </nav>
      </header>
      {error && (
        <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {message}
        </p>
      )}
      {tab === 'rooms' ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm">
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-bold text-slate-900">
                Danh sách phòng học ({filteredRooms.length}/{rooms.length})
              </span>
              <input
                type="search"
                value={roomSearch}
                onChange={(e) => setRoomSearch(e.target.value)}
                placeholder="Tìm mã phòng, tên, vị trí..."
                aria-label="Tìm kiếm phòng học"
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 min-w-[200px]"
              />
              <select
                aria-label="Lọc trạng thái phòng"
                value={roomStatusFilter}
                onChange={(e) => setRoomStatusFilter(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900"
              >
                <option value="ALL">Tất cả trạng thái</option>
                <option value="ACTIVE">Sẵn sàng</option>
                <option value="MAINTENANCE">Bảo trì</option>
                <option value="UNAVAILABLE">Không khả dụng</option>
                <option value="ARCHIVED">Ngừng sử dụng</option>
              </select>
            </div>
            <button
              type="button"
              className="rounded-lg bg-[#76a35e] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#658f4f]"
              onClick={() => {
                if (showRoomForm && !roomId) {
                  setShowRoomForm(false);
                } else {
                  setRoomId('');
                  setRoomForm({
                    code: '',
                    name: '',
                    location: '',
                    capacity: 20,
                    capabilities: [],
                    status: 'ACTIVE',
                    reason: '',
                    expectedLockVersion: 0,
                  });
                  setShowRoomForm(true);
                }
              }}
            >
              {showRoomForm && !roomId ? 'Đóng biểu mẫu' : '+ Thêm phòng học'}
            </button>
          </div>

          {(showRoomForm || roomId) && (
            <form
              onSubmit={(e) => {
                saveRoom(e);
              }}
              className="workspace-card grid gap-4 md:grid-cols-2 border-[#cde0c2]"
            >
              <div className="flex items-center justify-between md:col-span-2">
                <h2 className="text-lg font-bold text-slate-900">
                  {roomId ? `Chỉnh sửa phòng học` : 'Tạo phòng học mới'}
                </h2>
                <button
                  type="button"
                  className={control + ' text-xs'}
                  onClick={() => {
                    setShowRoomForm(false);
                    setRoomId('');
                  }}
                >
                  Đóng
                </button>
              </div>
              {(['code', 'name', 'location'] as const).map((k, i) => (
                <label key={k}>
                  {['Mã phòng', 'Tên phòng', 'Vị trí'][i]}
                  <input
                    className={control + ' block w-full'}
                    required
                    value={roomForm[k]}
                    onChange={(e) => setRoomForm((f) => ({ ...f, [k]: e.target.value }))}
                  />
                </label>
              ))}
              <label>
                Sức chứa
                <input
                  type="number"
                  className={control + ' block w-full'}
                  min={1}
                  max={1000}
                  required
                  value={roomForm.capacity}
                  onChange={(e) => setRoomForm((f) => ({ ...f, capacity: Number(e.target.value) }))}
                />
              </label>
              <label>
                Trạng thái phòng
                <select
                  className={control + ' block w-full'}
                  value={roomForm.status}
                  onChange={(e) => setRoomForm((f) => ({ ...f, status: e.target.value }))}
                >
                  <option value="ACTIVE">Khả dụng (Sẵn sàng)</option>
                  <option value="MAINTENANCE">Bảo trì</option>
                  <option value="UNAVAILABLE">Không khả dụng</option>
                </select>
              </label>
              <fieldset>
                <legend className="text-sm font-medium text-slate-700">Tiện ích phòng</legend>
                {capabilities.map((cap) => (
                  <label className="mr-3 inline-flex items-center gap-1 text-xs mt-1" key={cap}>
                    <input
                      type="checkbox"
                      checked={roomForm.capabilities.includes(cap)}
                      onChange={(e) =>
                        setRoomForm((f) => ({
                          ...f,
                          capabilities: e.target.checked
                            ? [...f.capabilities, cap]
                            : f.capabilities.filter((c) => c !== cap),
                        }))
                      }
                    />
                    {capabilityLabel(cap)}
                  </label>
                ))}
              </fieldset>
              <label className="md:col-span-2">
                Lý do thay đổi phòng (tối thiểu 10 ký tự)
                <textarea
                  className={control + ' block w-full'}
                  required
                  minLength={10}
                  value={roomForm.reason}
                  onChange={(e) => setRoomForm((f) => ({ ...f, reason: e.target.value }))}
                />
              </label>
              <div className="md:col-span-2 flex gap-2">
                <button className="rounded-lg bg-[#76a35e] px-4 py-2 text-sm font-semibold text-white hover:bg-[#658f4f]" disabled={busy}>
                  {roomId ? 'Lưu thông tin phòng' : 'Tạo phòng'}
                </button>
              </div>
            </form>
          )}

          {deleteRoomTarget && (
            <div className="rounded-xl border border-rose-300 bg-rose-50 p-4 space-y-2 text-sm">
              <div className="font-bold text-rose-900">
                Xác nhận xóa phòng {deleteRoomTarget.code} — {deleteRoomTarget.name}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={deleteRoomReason}
                  onChange={(e) => setDeleteRoomReason(e.target.value)}
                  placeholder="Nhập lý do xóa phòng (tối thiểu 10 ký tự)..."
                  className={control + ' flex-1 min-w-[240px]'}
                />
                <button
                  type="button"
                  disabled={busy || deleteRoomReason.trim().length < 10}
                  className="rounded-lg bg-rose-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                  onClick={() =>
                    void action(async () => {
                      await planningApi.write(
                        'rooms/' + deleteRoomTarget.id,
                        { expectedLockVersion: deleteRoomTarget.lockVersion, reason: deleteRoomReason.trim() },
                        'DELETE',
                      );
                      setDeleteRoomTarget(null);
                      setDeleteRoomReason('');
                      setMessage('Đã xóa phòng học thành công.');
                    })
                  }
                >
                  Xác nhận xóa
                </button>
                <button
                  type="button"
                  className={control + ' text-xs'}
                  onClick={() => {
                    setDeleteRoomTarget(null);
                    setDeleteRoomReason('');
                  }}
                >
                  Hủy
                </button>
              </div>
            </div>
          )}

          <div className="data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Mã &amp; Tên phòng</th>
                  <th>Vị trí</th>
                  <th>Sức chứa</th>
                  <th>Tiện ích</th>
                  <th>Đang gắn</th>
                  <th>Trạng thái</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {filteredRooms.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <span className="font-bold text-slate-900">{r.code}</span>
                      <div className="text-xs text-slate-600">{r.name}</div>
                    </td>
                    <td className="text-xs text-slate-600">{r.location}</td>
                    <td>{r.capacity} chỗ</td>
                    <td className="text-xs">{r.capabilities.map(capabilityLabel).join(', ') || 'Cơ bản'}</td>
                    <td className="text-xs font-semibold">{roomUsageCount.get(r.id) ?? 0} buổi</td>
                    <td>
                      <span
                        className={`badge ${
                          r.status === 'ACTIVE'
                            ? 'badge-success'
                            : r.status === 'MAINTENANCE'
                              ? 'badge-warning'
                              : 'badge-neutral'
                        }`}
                      >
                        {ROOM_STATUS_LABELS[r.status] ?? r.status}
                      </span>
                    </td>
                    <td>
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          className="rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                          onClick={() => {
                            void planningApi
                              .get<NonNullable<typeof roomSchedule>>('rooms/' + r.id + '/schedule')
                              .then((data) => setRoomSchedule(data))
                              .catch(() => setError('Không thể tải lịch sử dụng phòng.'));
                          }}
                        >
                          Xem lịch phòng
                        </button>
                        {r.createdBy === user?.id && (
                          <>
                            <button
                              type="button"
                              className="rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                              onClick={() => {
                                setRoomId(r.id);
                                setShowRoomForm(true);
                                setRoomForm({
                                  code: r.code,
                                  name: r.name,
                                  location: r.location,
                                  capacity: r.capacity,
                                  capabilities: r.capabilities,
                                  status: r.status,
                                  reason: '',
                                  expectedLockVersion: r.lockVersion,
                                });
                              }}
                            >
                              Sửa
                            </button>
                            <button
                              type="button"
                              className="rounded border border-rose-200 bg-white px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                              onClick={() => {
                                setDeleteRoomTarget(r);
                                setDeleteRoomReason('');
                              }}
                            >
                              Xóa
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {!filteredRooms.length && (
                  <tr>
                    <td colSpan={7} className="text-center text-sm text-slate-500 py-6">
                      Không có phòng học nào khớp bộ lọc.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {roomSchedule && (
            <section className="rounded-xl border border-[#cde0c2] bg-white p-5 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                <div>
                  <h3 className="text-lg font-bold text-[#2f5d1e]">
                    Lịch sử dụng phòng: {roomSchedule.room.code} — {roomSchedule.room.name}
                  </h3>
                  <p className="text-xs text-slate-600">
                    Vị trí: {roomSchedule.room.location} · Sức chứa: {roomSchedule.room.capacity} chỗ ·{' '}
                    {roomSchedule.weeklySlots.length} ca cố định/tuần ·{' '}
                    {roomSchedule.upcomingSessions.length} buổi chính thức sắp tới
                  </p>
                </div>
                <button
                  type="button"
                  className={control + ' text-xs'}
                  onClick={() => setRoomSchedule(null)}
                >
                  Đóng lịch phòng
                </button>
              </div>

              <div className="space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-sm font-bold text-slate-800">
                    Thời khóa biểu cố định hàng tuần ({roomSchedule.weeklySlots.length} ca)
                  </h4>
                  <span className="text-xs text-slate-500">Bấm vào từng ô để mở lớp học tương ứng</span>
                </div>
                {roomSchedule.weeklySlots.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-xs text-slate-500">
                    Chưa có lớp gắn lịch cố định tại phòng này.
                  </p>
                ) : (
                  <WeeklyTimetableGrid
                    items={roomTemplateItems}
                    emptySlotLabel="Trống"
                    ariaLabel={`Lịch cố định hàng tuần phòng ${roomSchedule.room.code}`}
                  />
                )}
              </div>

              <div className="space-y-2.5 border-t border-slate-100 pt-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h4 className="text-sm font-bold text-slate-800">
                      Buổi học chính thức sắp tới ({roomSchedule.upcomingSessions.length})
                    </h4>
                    <p className="text-xs text-slate-500">
                      Tuần {formatVnDate(roomWeekMonday)} – {formatVnDate(shiftDateKey(roomWeekMonday, 6))}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {roomSchedule.upcomingSessions.length > 0 && roomUpcomingItems.length === 0 && (
                      <button
                        type="button"
                        onClick={() =>
                          setRoomWeekMonday(
                            pickInitialWeekMonday(
                              roomSchedule.upcomingSessions.map((u) => vnDateKey(u.startsAt)),
                              todayKey,
                            ),
                          )
                        }
                        className="rounded border border-[#e66f2b]/40 bg-orange-50 px-2.5 py-1 text-xs font-semibold text-[#c25315] hover:bg-orange-100"
                      >
                        Tới tuần có buổi học
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setRoomWeekMonday((m) => shiftDateKey(m, -7))}
                      className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <ChevronLeft size={13} aria-hidden="true" />
                      Tuần trước
                    </button>
                    <button
                      type="button"
                      onClick={() => setRoomWeekMonday(weekMondayKey(todayKey))}
                      className="rounded border border-[#76a35e]/50 bg-[#e9f2e4] px-2.5 py-1 text-xs font-semibold text-[#2f5d1e] hover:bg-[#dcebd4]"
                    >
                      Tuần này
                    </button>
                    <button
                      type="button"
                      onClick={() => setRoomWeekMonday((m) => shiftDateKey(m, 7))}
                      className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Tuần sau
                      <ChevronRight size={13} aria-hidden="true" />
                    </button>
                  </div>
                </div>

                {roomSchedule.upcomingSessions.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-xs text-slate-500">
                    Chưa có buổi học chính thức sắp tới tại phòng này.
                  </p>
                ) : (
                  <WeeklyTimetableGrid
                    weekDates={roomUpcomingWeekDays}
                    todayKey={todayKey}
                    items={roomUpcomingItems}
                    emptySlotLabel="Trống"
                    ariaLabel={`Buổi học sắp tới phòng ${roomSchedule.room.code}`}
                  />
                )}
              </div>
            </section>
          )}
        </>
      ) : (
        <>
          <div className="rounded-xl border border-slate-200 bg-white p-4 flex flex-wrap items-center justify-between gap-3">
            <label className="flex flex-wrap items-center gap-3 text-sm font-semibold text-slate-800">
              <span>Lớp quản lý</span>
              <select
                aria-label="Lớp quản lý"
                className={control + ' min-w-[280px] max-w-full font-normal'}
                value={classId}
                onChange={(e) => {
                  setClassId(e.target.value);
                  setDetail(undefined);
                  setEditId('');
                  setRevisionOf('');
                  setCancelSessionId('');
                  setError('');
                  setSession((f) => ({ ...f, assignmentId: '' }));
                }}
              >
                <option value="">Chọn lớp thuộc phạm vi của bạn</option>
                {classes.map((c, i) => (
                  <option key={c.id} value={c.id}>
                    {isTechnicalQaRecord(c.name, c.code, c.course.title)
                      ? `${classLabel(c.name, c.code, c.course.title)} · ${i + 1}`
                      : `${classCodeLabel(c.code)} · ${c.name}`}
                  </option>
                ))}
              </select>
            </label>
            {classId && (
              <span className="text-xs text-slate-500">
                {sessions.length} buổi · {assignments.length} phân công giảng viên
              </span>
            )}
          </div>
          {!classId ? (
            <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-600">
              Hãy chọn một lớp học ở trên để xem bảng lịch buổi học, phân công giảng viên và tạo/điều chỉnh lịch.
            </p>
          ) : (
            <>
              <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-xl font-bold text-[#e66f2b]">Danh sách buổi học của lớp ({visibleSessions.length}/{sessions.length})</h2>
                    <p className="text-xs text-slate-600">
                      Thời gian học tính theo múi giờ Việt Nam (GMT+7). Bấm vào buổi học trên lịch để xem chi tiết hoặc chỉnh sửa.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div
                      role="group"
                      aria-label="Chế độ xem buổi học"
                      className="inline-flex overflow-hidden rounded-lg border border-slate-300 text-xs font-semibold"
                    >
                      <button
                        type="button"
                        aria-pressed={sessionViewMode === 'week'}
                        onClick={() => setSessionViewMode('week')}
                        className={`inline-flex items-center gap-1 px-2.5 py-1.5 ${
                          sessionViewMode === 'week'
                            ? 'bg-[#76a35e] text-white'
                            : 'bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <Calendar size={13} aria-hidden="true" />
                        Lịch tuần
                      </button>
                      <button
                        type="button"
                        aria-pressed={sessionViewMode === 'table'}
                        onClick={() => setSessionViewMode('table')}
                        className={`inline-flex items-center gap-1 border-l border-slate-300 px-2.5 py-1.5 ${
                          sessionViewMode === 'table'
                            ? 'bg-[#76a35e] text-white'
                            : 'bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <List size={13} aria-hidden="true" />
                        Bảng
                      </button>
                    </div>
                    <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                      Lọc trạng thái
                      <select
                        value={sessionStateFilter}
                        onChange={(e) => setSessionStateFilter(e.target.value)}
                        className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-normal text-slate-900"
                      >
                        <option value="ALL">Tất cả ({sessions.length})</option>
                        <option value="PUBLISHED">Đã duyệt</option>
                        <option value="PENDING_APPROVAL">Chờ duyệt</option>
                        <option value="DRAFT">Nháp</option>
                      </select>
                    </label>
                  </div>
                </div>

                {visibleSessions.some((s) => Boolean(sourceTemplateWarning(s))) && (
                  <p role="note" className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2 text-xs text-amber-900">
                    Lưu ý: Một số buổi được tạo từ mẫu tuần cũ nhưng vẫn giữ đúng khung giờ hiện tại; nếu cần đổi lịch đồng loạt, hãy cập nhật lại buổi tương ứng.
                  </p>
                )}

                {!visibleSessions.length ? (
                  <p className="text-sm text-slate-500">Chưa có buổi trong khoảng lịch hiện tại.</p>
                ) : sessionViewMode === 'week' ? (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50/70 px-3.5 py-2">
                      <span className="text-xs font-bold text-[#2f5d1e]">
                        Tuần {formatVnDate(sessionWeekMonday)} – {formatVnDate(shiftDateKey(sessionWeekMonday, 6))} ·{' '}
                        {classWeekItems.length} buổi trong tuần
                      </span>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {classWeekItems.length === 0 && (
                          <button
                            type="button"
                            onClick={() =>
                              setSessionWeekMonday(
                                pickInitialWeekMonday(
                                  visibleSessions.map((x) => vnDateKey(x.startsAt)),
                                  todayKey,
                                ),
                              )
                            }
                            className="rounded border border-[#e66f2b]/40 bg-orange-50 px-2.5 py-1 text-xs font-semibold text-[#c25315] hover:bg-orange-100"
                          >
                            Tới tuần có lịch
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setSessionWeekMonday((m) => shiftDateKey(m, -7))}
                          className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          <ChevronLeft size={13} aria-hidden="true" />
                          Tuần trước
                        </button>
                        <button
                          type="button"
                          onClick={() => setSessionWeekMonday(weekMondayKey(todayKey))}
                          className="rounded border border-[#76a35e]/50 bg-[#e9f2e4] px-2.5 py-1 text-xs font-semibold text-[#2f5d1e] hover:bg-[#dcebd4]"
                        >
                          Tuần này
                        </button>
                        <button
                          type="button"
                          onClick={() => setSessionWeekMonday((m) => shiftDateKey(m, 7))}
                          className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          Tuần sau
                          <ChevronRight size={13} aria-hidden="true" />
                        </button>
                      </div>
                    </div>

                    <WeeklyTimetableGrid
                      weekDates={classWeekDays}
                      todayKey={todayKey}
                      items={classWeekItems}
                      emptySlotLabel="Không có buổi"
                      ariaLabel="Lịch tuần các buổi học của lớp"
                    />

                    {selectedWeekSession && (
                      <div className="rounded-xl border border-[#cde0c2] bg-[#f7faf5] p-4 space-y-2.5">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className="text-xs font-bold text-[#2f5d1e]">
                              Buổi học đang chọn · Phiên bản {selectedWeekSession.revision} ({academicState(selectedWeekSession.state)})
                            </p>
                            <p className="text-sm font-bold text-slate-900">
                              {schoolDate(selectedWeekSession.startsAt)} – {vnTimeOnly(selectedWeekSession.endsAt)} ·{' '}
                              {MODALITY_LABELS[selectedWeekSession.modality] ?? selectedWeekSession.modality}
                              {selectedWeekSession.room?.code ? ` · Phòng ${selectedWeekSession.room.code}` : ''}
                            </p>
                            <p className="text-xs text-slate-600">
                              Giảng viên: {selectedWeekSession.instructor?.fullName ?? 'Chưa phân công'}
                            </p>
                          </div>
                          <button
                            type="button"
                            className="text-xs font-semibold text-slate-500 hover:underline"
                            onClick={() => setSelectedWeekSessionId('')}
                          >
                            Bỏ chọn
                          </button>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            className="rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                            onClick={() =>
                              void action(async () => {
                                setDetail(await planningApi.get<Session>('sessions/' + selectedWeekSession.id));
                              })
                            }
                          >
                            Xem lịch sử buổi
                          </button>
                          {selectedWeekSession.state === 'DRAFT' && selectedWeekSession.proposedBy === user?.id && (
                            <>
                              <button
                                type="button"
                                className="rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                                onClick={() => chooseSession(selectedWeekSession)}
                              >
                                Sửa nháp
                              </button>
                              <button
                                type="button"
                                className="rounded bg-[#76a35e] px-2.5 py-1 text-xs font-semibold text-white hover:bg-[#658f4f]"
                                disabled={busy}
                                onClick={() => void submit('sessions', selectedWeekSession)}
                              >
                                Gửi duyệt buổi
                              </button>
                            </>
                          )}
                          {selectedWeekSession.state === 'PUBLISHED' && (
                            <>
                              <button
                                type="button"
                                className="rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                                onClick={() => chooseSession(selectedWeekSession, true)}
                              >
                                Đề xuất đổi buổi
                              </button>
                              <button
                                type="button"
                                className="rounded border border-rose-200 bg-white px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                                onClick={() => {
                                  setCancelSessionId(
                                    cancelSessionId === selectedWeekSession.id ? '' : selectedWeekSession.id,
                                  );
                                  setCancelSessionReason('');
                                }}
                              >
                                Đề xuất hủy
                              </button>
                            </>
                          )}
                        </div>

                        {cancelSessionId === selectedWeekSession.id && (
                          <div className="flex flex-wrap items-center gap-1.5 rounded border border-rose-200 bg-rose-50 p-2">
                            <input
                              type="text"
                              value={cancelSessionReason}
                              onChange={(e) => setCancelSessionReason(e.target.value)}
                              placeholder="Lý do hủy buổi (≥ 10 ký tự)..."
                              className="min-w-[200px] flex-1 rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                            />
                            <button
                              type="button"
                              disabled={busy || cancelSessionReason.trim().length < 10}
                              className="rounded bg-rose-600 px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-50"
                              onClick={() =>
                                void action(async () => {
                                  await planningApi.write('sessions/' + selectedWeekSession.id + '/cancel', {
                                    reason: cancelSessionReason.trim(),
                                  });
                                  setCancelSessionId('');
                                  setCancelSessionReason('');
                                  setMessage(
                                    'Đã gửi yêu cầu hủy buổi học. Buổi học vẫn duy trì đến khi được phê duyệt.',
                                  );
                                })
                              }
                            >
                              Xác nhận hủy
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="data-table-container">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Thời gian học</th>
                          <th>Hình thức &amp; Phòng</th>
                          <th>Giảng viên</th>
                          <th>Trạng thái</th>
                          <th>Thao tác</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(showAllSessions ? visibleSessions : visibleSessions.slice(0, 10)).map((s) => (
                          <tr key={s.id}>
                            <td>
                              <div className="font-semibold text-slate-900">{schoolDate(s.startsAt)}</div>
                              <div className="text-xs text-slate-500">
                                đến {schoolDate(s.endsAt)} · Phiên bản {s.revision}
                              </div>
                              {sourceTemplateWarning(s) && (
                                <span className="mt-1 inline-block rounded bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
                                  Từ mẫu tuần trước đó
                                </span>
                              )}
                            </td>
                            <td className="text-xs">
                              <div>{MODALITY_LABELS[s.modality] ?? s.modality}</div>
                              <div className="text-slate-500">{s.room?.code ?? 'Online / chưa chọn phòng'}</div>
                            </td>
                            <td className="text-xs">{s.instructor?.fullName ?? 'Chưa phân công'}</td>
                            <td>
                              <span
                                className={`badge ${
                                  s.state === 'PUBLISHED'
                                    ? 'badge-success'
                                    : s.state === 'PENDING_APPROVAL'
                                      ? 'badge-warning'
                                      : 'badge-neutral'
                                }`}
                              >
                                {academicState(s.state)}
                              </span>
                            </td>
                            <td>
                              <div className="flex flex-wrap gap-1.5">
                                <button
                                  type="button"
                                  className="rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                                  onClick={() =>
                                    void action(async () => {
                                      setDetail(await planningApi.get<Session>('sessions/' + s.id));
                                    })
                                  }
                                >
                                  Xem lịch sử buổi
                                </button>
                                {s.state === 'DRAFT' && s.proposedBy === user?.id && (
                                  <>
                                    <button
                                      type="button"
                                      className="rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                                      onClick={() => chooseSession(s)}
                                    >
                                      Sửa nháp
                                    </button>
                                    <button
                                      type="button"
                                      className="rounded bg-[#76a35e] px-2.5 py-1 text-xs font-semibold text-white hover:bg-[#658f4f]"
                                      disabled={busy}
                                      onClick={() => void submit('sessions', s)}
                                    >
                                      Gửi duyệt buổi
                                    </button>
                                  </>
                                )}
                                {s.state === 'PUBLISHED' && (
                                  <>
                                    <button
                                      type="button"
                                      className="rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                                      onClick={() => chooseSession(s, true)}
                                    >
                                      Đề xuất đổi buổi
                                    </button>
                                    <button
                                      type="button"
                                      className="rounded border border-rose-200 bg-white px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                                      onClick={() => {
                                        setCancelSessionId(cancelSessionId === s.id ? '' : s.id);
                                        setCancelSessionReason('');
                                      }}
                                    >
                                      Đề xuất hủy
                                    </button>
                                  </>
                                )}
                              </div>
                              {cancelSessionId === s.id && (
                                <div className="mt-2 flex flex-wrap items-center gap-1.5 rounded border border-rose-200 bg-rose-50 p-2">
                                  <input
                                    type="text"
                                    value={cancelSessionReason}
                                    onChange={(e) => setCancelSessionReason(e.target.value)}
                                    placeholder="Lý do hủy buổi (≥ 10 ký tự)..."
                                    className="rounded border border-slate-300 bg-white px-2 py-1 text-xs flex-1 min-w-[180px]"
                                  />
                                  <button
                                    type="button"
                                    disabled={busy || cancelSessionReason.trim().length < 10}
                                    className="rounded bg-rose-600 px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-50"
                                    onClick={() =>
                                      void action(async () => {
                                        await planningApi.write('sessions/' + s.id + '/cancel', {
                                          reason: cancelSessionReason.trim(),
                                        });
                                        setCancelSessionId('');
                                        setCancelSessionReason('');
                                        setMessage(
                                          'Đã gửi yêu cầu hủy buổi học. Buổi học vẫn duy trì đến khi được phê duyệt.',
                                        );
                                      })
                                    }
                                  >
                                    Xác nhận hủy
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {visibleSessions.length > 10 && (
                      <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-2 text-right">
                        <button
                          type="button"
                          className="rounded border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                          onClick={() => setShowAllSessions((v) => !v)}
                        >
                          {showAllSessions
                            ? 'Thu gọn danh sách (10 buổi đầu)'
                            : `Xem tất cả ${visibleSessions.length} buổi`}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {detail && (
                  <div className="mt-3 rounded-xl border border-[#cde0c2] bg-slate-50 p-4 text-sm space-y-2">
                    <div className="flex items-center justify-between">
                      <h3 className="font-bold text-slate-900">Lịch sử và cảnh báo buổi học</h3>
                      <button
                        type="button"
                        className="text-xs text-slate-600 hover:underline"
                        onClick={() => setDetail(undefined)}
                      >
                        Đóng
                      </button>
                    </div>
                    {sourceTemplateWarning(detail) && (
                      <p role="note" className="text-xs text-amber-800">{sourceTemplateWarning(detail)}</p>
                    )}
                    <p className="text-xs text-slate-700">{detail.warnings?.join(', ') || 'Không có cảnh báo tại thời điểm đọc.'}</p>
                    <ol className="list-disc pl-5 text-xs space-y-1 text-slate-700">
                      {detail.history?.map((h) => (
                        <li key={h.id}>
                          Phiên bản {h.revision}: {academicState(h.state)} · {schoolDate(h.startsAt)} · {h.reason}
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </section>

              <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">Phân công giảng viên ({assignments.length})</h2>
                  <p className="text-xs text-slate-600">
                    Thiết lập thời gian phân công giảng dạy cho lớp học. Khi thay đổi phân công, cần cập nhật các buổi học tương ứng.
                  </p>
                </div>

                {assignments.length > 0 && (
                  <div className="data-table-container">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Giảng viên</th>
                          <th>Thời gian hiệu lực</th>
                          <th>Trạng thái</th>
                          <th>Thao tác</th>
                        </tr>
                      </thead>
                      <tbody>
                        {assignments.map((a) => (
                          <tr key={a.id}>
                            <td className="font-semibold text-slate-900">{a.instructor?.fullName ?? '—'}</td>
                            <td className="text-xs text-slate-600">
                              {schoolDate(a.effectiveFrom)} — {schoolDate(a.reservedUntil ?? a.effectiveTo)}
                            </td>
                            <td>
                              <span
                                className={`badge ${
                                  a.state === 'PUBLISHED'
                                    ? 'badge-success'
                                    : a.state === 'PENDING_APPROVAL'
                                      ? 'badge-warning'
                                      : 'badge-neutral'
                                }`}
                              >
                                {academicState(a.state)}
                              </span>
                            </td>
                            <td>
                              {a.state === 'DRAFT' && a.proposedBy === user?.id && (
                                <button
                                  type="button"
                                  className="rounded bg-[#76a35e] px-2.5 py-1 text-xs font-semibold text-white hover:bg-[#658f4f]"
                                  disabled={busy}
                                  onClick={() => void submit('assignments', a)}
                                >
                                  Gửi duyệt phân công
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <details className="rounded-lg border border-slate-200 bg-slate-50/60 p-4">
                  <summary className="cursor-pointer select-none text-sm font-bold text-[#2f5d1e]">
                    + Tạo đề xuất phân công giảng viên mới
                  </summary>
                  <form
                    className="mt-4 grid gap-3 md:grid-cols-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void action(async () => {
                        await planningApi.write('classes/' + classId + '/assignments', {
                          ...assignment,
                          replacesId: assignment.replacesId || undefined,
                          effectiveFrom: assignment.effectiveFrom + ':00+07:00',
                          effectiveTo: assignment.effectiveTo + ':00+07:00',
                        });
                        setMessage('Đã tạo đề xuất phân công nháp.');
                      });
                    }}
                  >
                    <label>
                      Giảng viên đề xuất
                      <select
                        className={control + ' block w-full'}
                        required
                        value={assignment.instructorId}
                        onChange={(e) =>
                          setAssignment((f) => ({ ...f, instructorId: e.target.value }))
                        }
                      >
                        <option value="">Chọn giảng viên</option>
                        {instructors.map((i) => (
                          <option key={i.id} value={i.id}>
                            {i.fullName}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Thay phân công
                      <select
                        className={control + ' block w-full'}
                        value={assignment.replacesId}
                        onChange={(e) => setAssignment((f) => ({ ...f, replacesId: e.target.value }))}
                      >
                        <option value="">Khoảng phân công mới</option>
                        {assignments
                          .filter((a) => a.state === 'PUBLISHED')
                          .map((a) => (
                            <option value={a.id} key={a.id}>
                              {a.instructor?.fullName} · {schoolDate(a.effectiveFrom)}
                            </option>
                          ))}
                      </select>
                    </label>
                    <label>
                      Hiệu lực từ
                      <input
                        className={control + ' block w-full'}
                        type="datetime-local"
                        required
                        value={assignment.effectiveFrom}
                        onChange={(e) =>
                          setAssignment((f) => ({ ...f, effectiveFrom: e.target.value }))
                        }
                      />
                    </label>
                    <label>
                      Hiệu lực đến
                      <input
                        className={control + ' block w-full'}
                        type="datetime-local"
                        required
                        value={assignment.effectiveTo}
                        onChange={(e) =>
                          setAssignment((f) => ({ ...f, effectiveTo: e.target.value }))
                        }
                      />
                    </label>
                    <label className="md:col-span-2">
                      Lý do phân công
                      <textarea
                        className={control + ' block w-full'}
                        required
                        minLength={10}
                        value={assignment.reason}
                        onChange={(e) => setAssignment((f) => ({ ...f, reason: e.target.value }))}
                      />
                    </label>
                    <div>
                      <button className="rounded-lg bg-[#76a35e] px-4 py-2 text-sm font-semibold text-white hover:bg-[#658f4f]" disabled={busy}>
                        Tạo đề xuất phân công
                      </button>
                    </div>
                  </form>
                </details>
              </section>

              <div className="grid gap-6 lg:grid-cols-2 items-start">
                <details
                  open={Boolean(editId || revisionOf)}
                  className="rounded-xl border border-slate-200 bg-white p-5"
                >
                  <summary className="cursor-pointer select-none text-lg font-bold text-slate-900">
                    {revisionOf
                      ? 'Đề xuất đổi buổi chính thức'
                      : editId
                        ? 'Sửa buổi nháp'
                        : '+ Tạo buổi nháp lẻ theo ngày'}
                  </summary>
                  <form
                    onSubmit={saveSession}
                    className="mt-4 grid gap-3 md:grid-cols-2"
                  >
                    <label>
                      Bắt đầu buổi
                      <input
                        className={control + ' block w-full'}
                        required
                        type="datetime-local"
                        value={session.startLocal}
                        onChange={(e) => setSession((f) => ({ ...f, startLocal: e.target.value }))}
                      />
                    </label>
                    <label>
                      Kết thúc buổi
                      <input
                        className={control + ' block w-full'}
                        required
                        type="datetime-local"
                        value={session.endLocal}
                        onChange={(e) => setSession((f) => ({ ...f, endLocal: e.target.value }))}
                      />
                    </label>
                    <label>
                      Múi giờ buổi
                      <input
                        className={control + ' block w-full'}
                        required
                        value={session.timezone}
                        onChange={(e) => setSession((f) => ({ ...f, timezone: e.target.value }))}
                      />
                    </label>
                    <label>
                      Hình thức buổi
                      <select
                        className={control + ' block w-full'}
                        value={session.modality}
                        onChange={(e) =>
                          setSession((f) => ({
                            ...f,
                            modality: e.target.value,
                            roomId: e.target.value === 'ONLINE' ? '' : f.roomId,
                          }))
                        }
                      >
                        {['ONLINE', 'OFFLINE', 'HYBRID'].map((x) => (
                          <option key={x} value={x}>
                            {MODALITY_LABELS[x] ?? x}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Phòng cho buổi
                      <select
                        className={control + ' block w-full'}
                        disabled={session.modality === 'ONLINE'}
                        value={session.roomId}
                        onChange={(e) => setSession((f) => ({ ...f, roomId: e.target.value }))}
                      >
                        <option value="">Không chọn phòng</option>
                        {rooms.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.code} · {r.capacity} chỗ · {ROOM_STATUS_LABELS[r.status] ?? r.status}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Phân công của buổi
                      <select
                        className={control + ' block w-full'}
                        value={session.assignmentId}
                        onChange={(e) => setSession((f) => ({ ...f, assignmentId: e.target.value }))}
                      >
                        <option value="">Chưa chọn phân công</option>
                        {assignments
                          .filter(
                            (a) =>
                              ['PUBLISHED', 'SUPERSEDED'].includes(a.state) &&
                              new Date(a.reservedUntil ?? a.effectiveTo).getTime() > initialNow,
                          )
                          .map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.instructor?.fullName} · {schoolDate(a.effectiveFrom)} —{' '}
                              {schoolDate(a.reservedUntil ?? a.effectiveTo)}
                            </option>
                          ))}
                      </select>
                    </label>
                    <fieldset className="md:col-span-2">
                      <legend className="text-sm font-medium text-slate-700">Tiện ích buổi cần</legend>
                      {capabilities.map((cap) => (
                        <label className="mr-3 inline-flex items-center gap-1 text-xs mt-1" key={cap}>
                          <input
                            type="checkbox"
                            checked={session.requiredCapabilities.includes(cap)}
                            onChange={(e) =>
                              setSession((f) => ({
                                ...f,
                                requiredCapabilities: e.target.checked
                                  ? [...f.requiredCapabilities, cap]
                                  : f.requiredCapabilities.filter((c) => c !== cap),
                              }))
                            }
                          />
                          {capabilityLabel(cap)}
                        </label>
                      ))}
                    </fieldset>
                    <details className="rounded border border-slate-200 bg-slate-50/70 px-3 py-2 text-xs md:col-span-2">
                      <summary className="cursor-pointer font-semibold text-slate-700">
                        Tùy chọn múi giờ nâng cao (chỉ dùng khi giờ DST thay đổi)
                      </summary>
                      <div className="mt-2 grid gap-3 sm:grid-cols-2">
                        <label>
                          Offset bắt đầu
                          <input
                            className={control + ' block w-full'}
                            placeholder="+07:00"
                            value={session.startOffset}
                            onChange={(e) => setSession((f) => ({ ...f, startOffset: e.target.value }))}
                          />
                        </label>
                        <label>
                          Offset kết thúc
                          <input
                            className={control + ' block w-full'}
                            placeholder="+07:00"
                            value={session.endOffset}
                            onChange={(e) => setSession((f) => ({ ...f, endOffset: e.target.value }))}
                          />
                        </label>
                      </div>
                    </details>
                    <label className="md:col-span-2">
                      Lý do tạo/đổi buổi
                      <textarea
                        className={control + ' block w-full'}
                        required
                        minLength={10}
                        value={session.reason}
                        onChange={(e) => setSession((f) => ({ ...f, reason: e.target.value }))}
                      />
                    </label>
                    {conflictWarnings.length > 0 && (
                      <div
                        role="alert"
                        className="rounded-lg border border-amber-300 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-900 md:col-span-2"
                      >
                        <p className="font-bold">Cảnh báo xung đột lịch dự kiến:</p>
                        <ul className="mt-1 list-disc pl-4">
                          {conflictWarnings.map((w) => (
                            <li key={w}>{w}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <div className="md:col-span-2 flex flex-wrap gap-2">
                      <button className="rounded-lg bg-[#76a35e] px-4 py-2 text-sm font-semibold text-white hover:bg-[#658f4f]" disabled={busy}>
                        Lưu buổi nháp
                      </button>
                      {(editId || revisionOf) && (
                        <button
                          className={control}
                          type="button"
                          onClick={() => {
                            setEditId('');
                            setRevisionOf('');
                          }}
                        >
                          Dừng sửa
                        </button>
                      )}
                    </div>
                  </form>
                </details>

                <form
                  onSubmit={generate}
                  className="grid gap-3 rounded-xl border border-slate-200 bg-white p-5 md:grid-cols-2"
                >
                  <div className="md:col-span-2">
                    <h2 className="text-lg font-bold text-slate-900">Sinh bản nháp từ lịch tuần</h2>
                    <p className="text-xs text-slate-600 mt-1">
                      Tạo các buổi học nháp dựa trên thời khóa biểu tuần và phòng học đã chọn.
                    </p>
                  </div>
                  <label>
                    Từ ngày
                    <input
                      type="date"
                      className={control + ' block w-full'}
                      required
                      value={generation.from}
                      onChange={(e) => setGeneration((f) => ({ ...f, from: e.target.value }))}
                    />
                  </label>
                  <label>
                    Đến ngày
                    <input
                      type="date"
                      className={control + ' block w-full'}
                      required
                      value={generation.through}
                      onChange={(e) => setGeneration((f) => ({ ...f, through: e.target.value }))}
                    />
                  </label>
                  <label className="md:col-span-2">
                    Ngày loại trừ (YYYY-MM-DD, cách bằng dấu phẩy)
                    <textarea
                      className={control + ' block w-full'}
                      rows={2}
                      value={generation.excludeDates}
                      onChange={(e) => setGeneration((f) => ({ ...f, excludeDates: e.target.value }))}
                    />
                  </label>
                  <label className="md:col-span-2">
                    Lý do sinh lịch
                    <textarea
                      className={control + ' block w-full'}
                      required
                      minLength={10}
                      rows={2}
                      value={generation.reason}
                      onChange={(e) => setGeneration((f) => ({ ...f, reason: e.target.value }))}
                    />
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {[
                        'Sinh lịch buổi học theo khung giờ cố định của lớp',
                        'Bổ sung lịch giảng dạy kỳ mới cho lớp đang mở',
                      ].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setGeneration((f) => ({ ...f, reason: preset }))}
                          className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] text-slate-700 hover:bg-[#e9f2e4]"
                        >
                          + {preset}
                        </button>
                      ))}
                    </div>
                  </label>
                  <label className="md:col-span-2 flex items-center gap-2 text-xs text-slate-700">
                    <input
                      type="checkbox"
                      required
                      checked={generation.exceptionsReviewed}
                      onChange={(e) =>
                        setGeneration((f) => ({ ...f, exceptionsReviewed: e.target.checked }))
                      }
                    />
                    Đã kiểm tra ngày nghỉ/ngoại lệ của khoảng này
                  </label>
                  <div className="md:col-span-2">
                    <button className="rounded-lg bg-[#e66f2b] px-4 py-2 text-sm font-semibold text-white hover:bg-[#cf5e1d]" disabled={busy}>
                      Sinh lịch nháp
                    </button>
                  </div>
                </form>
              </div>
            </>
          )}
        </>
      )}
    </main>
  );
}
