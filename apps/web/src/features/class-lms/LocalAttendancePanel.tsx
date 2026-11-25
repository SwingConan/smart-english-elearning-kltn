import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { CheckCircle2, Clock, Edit3, KeyRound, UserCheck, Users } from 'lucide-react';
import { button, field } from './api';
import {
  datetimeLocalToIso,
  isoToDatetimeLocal,
  lmsLocalApi,
  type LocalAttendanceWorkspace,
} from './lms-local-api';
import { schoolTimestamp } from './school-time';

const primaryBtn =
  'inline-flex items-center justify-center gap-2 rounded bg-[#76a35e] px-4 py-2 font-semibold text-white shadow-2xs transition hover:bg-[#658f50] disabled:cursor-not-allowed disabled:opacity-50';

function defaultStartLocal(): string {
  return isoToDatetimeLocal(new Date(Date.now() - 5 * 60_000).toISOString());
}

function defaultEndLocal(): string {
  return isoToDatetimeLocal(new Date(Date.now() + 2 * 60 * 60_000).toISOString());
}

export function LocalAttendanceAuthorForm({
  classId,
  sectionId,
  initialWorkspace,
  onSaved,
  onCancel,
}: {
  classId: string;
  sectionId?: string;
  initialWorkspace?: LocalAttendanceWorkspace;
  onSaved: (activityId: string) => void;
  onCancel?: () => void;
}) {
  const [title, setTitle] = useState(initialWorkspace?.activity.title ?? '');
  const [sessionTitle, setSessionTitle] = useState(initialWorkspace?.config.sessionTitle ?? '');
  const [introduction, setIntroduction] = useState(initialWorkspace?.activity.introduction ?? '');
  const [startAt, setStartAt] = useState(
    () => isoToDatetimeLocal(initialWorkspace?.config.checkInStartAt) || defaultStartLocal(),
  );
  const [endAt, setEndAt] = useState(
    () => isoToDatetimeLocal(initialWorkspace?.config.checkInEndAt) || defaultEndLocal(),
  );
  const [lateAfterMinutes, setLateAfterMinutes] = useState(
    initialWorkspace?.config.lateAfterMinutes ?? 15,
  );
  const [requireCode, setRequireCode] = useState(initialWorkspace?.config.requireCode ?? true);
  const [checkInCode, setCheckInCode] = useState(initialWorkspace?.config.checkInCode ?? 'DIEMDANH');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function generateCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let out = '';
    for (let i = 0; i < 6; i += 1) {
      out += chars[Math.floor(Math.random() * chars.length)];
    }
    setCheckInCode(out);
  }

  async function handleSave(publish: boolean) {
    setError('');
    setBusy(true);
    try {
      const startIso = datetimeLocalToIso(startAt);
      const endIso = datetimeLocalToIso(endAt);
      if (!startIso || !endIso) {
        throw new Error('Vui lòng chọn đầy đủ thời gian mở và đóng điểm danh.');
      }
      if (new Date(endIso).getTime() <= new Date(startIso).getTime()) {
        throw new Error('Thời gian đóng điểm danh phải sau thời gian mở.');
      }
      if (requireCode && checkInCode.trim().length < 3) {
        throw new Error('Vui lòng nhập mã điểm danh tối thiểu 3 ký tự.');
      }
      const payload = {
        title,
        introduction,
        sessionTitle: sessionTitle || title,
        checkInStartAt: startIso,
        checkInEndAt: endIso,
        lateAfterMinutes: Number(lateAfterMinutes) || 0,
        requireCode,
        checkInCode: requireCode ? checkInCode : '',
        publish,
      };
      const res = initialWorkspace
        ? await lmsLocalApi.updateLocalAttendance(classId, initialWorkspace.activity.id, payload)
        : await lmsLocalApi.createLocalAttendance(classId, sectionId!, payload);

      onSaved(res.activityId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không thể lưu phiên điểm danh.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      {error && (
        <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          {error}
        </p>
      )}

      <section className="workspace-card space-y-4">
        <h2 className="text-lg font-extrabold text-slate-900">Thiết lập phiên điểm danh</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-semibold text-slate-700 sm:col-span-2">
            Tên hoạt động điểm danh trong chủ đề
            <input
              required
              className={field}
              placeholder="Ví dụ: Điểm danh Buổi 1 - Nghe hiểu Part 1 & Part 2"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label className="block text-sm font-semibold text-slate-700 sm:col-span-2">
            Tên buổi học (tùy chọn)
            <input
              className={field}
              placeholder="Ví dụ: Buổi tối Thứ Tư - Phòng Online / Cơ sở 1"
              value={sessionTitle}
              onChange={(e) => setSessionTitle(e.target.value)}
            />
          </label>
          <label className="block text-sm font-semibold text-slate-700 sm:col-span-2">
            Ghi chú hướng dẫn
            <textarea
              rows={2}
              className={field}
              placeholder="Hướng dẫn học viên check-in đúng giờ..."
              value={introduction}
              onChange={(e) => setIntroduction(e.target.value)}
            />
          </label>
          <label className="block text-sm font-semibold text-slate-700">
            Mở điểm danh từ (đồng bộ Lịch tháng)
            <input
              type="datetime-local"
              required
              className={field}
              value={startAt}
              onChange={(e) => setStartAt(e.target.value)}
            />
          </label>
          <label className="block text-sm font-semibold text-slate-700">
            Đóng điểm danh lúc
            <input
              type="datetime-local"
              required
              className={field}
              value={endAt}
              onChange={(e) => setEndAt(e.target.value)}
            />
          </label>
          <label className="block text-sm font-semibold text-slate-700">
            Tính đi muộn sau (phút kể từ giờ mở)
            <input
              type="number"
              min={0}
              max={180}
              className={field}
              value={lateAfterMinutes}
              onChange={(e) => setLateAfterMinutes(Number(e.target.value))}
            />
          </label>
          <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <input
                type="checkbox"
                checked={requireCode}
                onChange={(e) => setRequireCode(e.target.checked)}
              />
              Yêu cầu mã điểm danh khi học viên check-in
            </label>
            {requireCode && (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  className={field + ' mt-0 font-mono uppercase'}
                  placeholder="VD: TOEIC01"
                  value={checkInCode}
                  onChange={(e) => setCheckInCode(e.target.value.toUpperCase())}
                />
                <button
                  type="button"
                  className={button + ' shrink-0 text-xs'}
                  onClick={generateCode}
                >
                  Đổi mã
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={busy || !title.trim()}
          className={primaryBtn}
          onClick={() => void handleSave(true)}
        >
          {busy ? 'Đang lưu…' : 'Lưu và công bố điểm danh'}
        </button>
        <button
          type="button"
          disabled={busy || !title.trim()}
          className={button}
          onClick={() => void handleSave(false)}
        >
          Lưu bản nháp
        </button>
        {onCancel && (
          <button type="button" className={button} onClick={onCancel}>
            Hủy
          </button>
        )}
      </div>
    </div>
  );
}

export function LocalAttendanceCreatePage() {
  const { classId = '', sectionId = '' } = useParams();
  const navigate = useNavigate();

  return (
    <main className="workspace-page max-w-4xl space-y-6">
      <Link
        to={`/classroom/${classId}`}
        className="text-sm font-semibold text-indigo-700 hover:underline"
      >
        ← Quay lại nội dung lớp
      </Link>
      <header className="workspace-header">
        <p className="text-xs font-extrabold uppercase tracking-wider text-amber-700">
          Hoạt động điểm danh trong chủ đề
        </p>
        <h1 className="mt-1 text-2xl font-extrabold text-slate-900">
          Tạo hoạt động điểm danh buổi học
        </h1>
      </header>
      <LocalAttendanceAuthorForm
        classId={classId}
        sectionId={sectionId}
        onSaved={(activityId) => navigate(`/classroom/${classId}/activities/${activityId}`)}
        onCancel={() => navigate(`/classroom/${classId}`)}
      />
    </main>
  );
}

const statusBadges = {
  PRESENT: 'bg-emerald-100 text-emerald-900 border-emerald-200',
  LATE: 'bg-amber-100 text-amber-900 border-amber-200',
  NOT_RECORDED: 'bg-slate-100 text-slate-700 border-slate-200',
} as const;

const statusText = {
  PRESENT: 'Có mặt',
  LATE: 'Đi muộn',
  NOT_RECORDED: 'Chưa điểm danh',
} as const;

type RosterFilter = 'ALL' | 'ATTENDED' | 'PRESENT' | 'LATE' | 'ABSENT';

export function LocalAttendancePanel({
  classId,
  activityId,
  onActivityRefresh,
}: {
  classId: string;
  activityId: string;
  onActivityRefresh?: () => void;
}) {
  const [ws, setWs] = useState<LocalAttendanceWorkspace | null>(null);
  const [error, setError] = useState('');
  const [statusMsg, setStatusMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [code, setCode] = useState('');
  const [note, setNote] = useState('');
  const [rosterFilter, setRosterFilter] = useState<RosterFilter>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  async function load() {
    try {
      const data = await lmsLocalApi.getAttendanceWorkspace(classId, activityId);
      setWs(data);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không tải được phiên điểm danh.');
    }
  }

  useEffect(() => {
    void load();
  }, [classId, activityId]);

  async function handleCheckIn() {
    setBusy(true);
    setError('');
    try {
      const updated = await lmsLocalApi.checkInAttendance(classId, activityId, {
        code: ws?.config.requireCode ? code : undefined,
        note,
      });
      setWs(updated);
      setStatusMsg('Đã ghi nhận điểm danh thành công.');
      onActivityRefresh?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không thể check-in điểm danh.');
    } finally {
      setBusy(false);
    }
  }

  async function handleManualMark(
    enrollmentId: string,
    fullName: string,
    status: 'PRESENT' | 'LATE' | 'NOT_RECORDED',
  ) {
    setBusy(true);
    setError('');
    try {
      const updated = await lmsLocalApi.markAttendance(classId, activityId, {
        enrollmentId,
        status,
      });
      setWs(updated);
      const label =
        status === 'PRESENT' ? 'Có mặt' : status === 'LATE' ? 'Đi muộn' : 'Chưa điểm danh';
      setStatusMsg(`Đã cập nhật trạng thái "${label}" cho ${fullName}.`);
      onActivityRefresh?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không thể cập nhật trạng thái điểm danh.');
    } finally {
      setBusy(false);
    }
  }

  if (error && !ws) {
    return (
      <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
        {error}
      </p>
    );
  }
  if (!ws) {
    return <p role="status">Đang tải thông tin điểm danh…</p>;
  }

  // TEACHER VIEW
  if (ws.editable) {
    const absentLabel = ws.windowStatus === 'CLOSED' ? 'Vắng mặt' : 'Chưa điểm danh';
    const normalizedSearch = searchQuery.trim().toLowerCase();
    const filteredRoster = (ws.roster ?? []).filter((row) => {
      if (rosterFilter === 'ATTENDED' && row.status !== 'PRESENT' && row.status !== 'LATE') {
        return false;
      }
      if (rosterFilter === 'PRESENT' && row.status !== 'PRESENT') return false;
      if (rosterFilter === 'LATE' && row.status !== 'LATE') return false;
      if (rosterFilter === 'ABSENT' && row.status !== 'NOT_RECORDED') return false;
      if (normalizedSearch) {
        const matchName = row.fullName.toLowerCase().includes(normalizedSearch);
        const matchEmail = row.email.toLowerCase().includes(normalizedSearch);
        if (!matchName && !matchEmail) return false;
      }
      return true;
    });
    const filterTabs: Array<{ id: RosterFilter; label: string; count: number }> = [
      { id: 'ALL', label: 'Tất cả', count: ws.summary?.totalEnrolled ?? 0 },
      {
        id: 'ATTENDED',
        label: 'Đã điểm danh',
        count: (ws.summary?.presentCount ?? 0) + (ws.summary?.lateCount ?? 0),
      },
      { id: 'PRESENT', label: 'Có mặt', count: ws.summary?.presentCount ?? 0 },
      { id: 'LATE', label: 'Đi muộn', count: ws.summary?.lateCount ?? 0 },
      { id: 'ABSENT', label: absentLabel, count: ws.summary?.notRecordedCount ?? 0 },
    ];

    return (
      <div className="space-y-6">
        {error && (
          <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
            {error}
          </p>
        )}
        {statusMsg && (
          <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900">
            {statusMsg}
          </p>
        )}

        <section className="workspace-card space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-900">
                  <UserCheck className="size-3.5" aria-hidden="true" />
                  {ws.config.sessionTitle}
                </span>
                <span
                  className={`rounded-md px-2.5 py-0.5 text-xs font-bold ${
                    ws.windowStatus === 'OPEN'
                      ? 'bg-emerald-100 text-emerald-900'
                      : ws.windowStatus === 'UPCOMING'
                        ? 'bg-amber-100 text-amber-900'
                        : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  {ws.windowStatus === 'OPEN'
                    ? 'Đang mở điểm danh'
                    : ws.windowStatus === 'UPCOMING'
                      ? 'Chưa mở điểm danh'
                      : 'Đã đóng điểm danh'}
                </span>
                {ws.config.requireCode && ws.config.checkInCode && (
                  <span className="inline-flex items-center gap-1 rounded-md border border-indigo-200 bg-indigo-50 px-2.5 py-0.5 font-mono text-xs font-bold text-indigo-900">
                    <KeyRound className="size-3.5" aria-hidden="true" />
                    Mã: {ws.config.checkInCode}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-600">
                Mở: {schoolTimestamp(ws.config.checkInStartAt)} · Đóng:{' '}
                {schoolTimestamp(ws.config.checkInEndAt)} · Đi muộn sau {ws.config.lateAfterMinutes} phút
              </p>
            </div>
            <button
              type="button"
              className={button + ' inline-flex items-center gap-1.5 text-xs font-semibold'}
              onClick={() => setEditing((v) => !v)}
            >
              <Edit3 className="size-3.5" aria-hidden="true" />
              {editing ? 'Đóng cấu hình' : 'Sửa khung giờ / mã'}
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs text-slate-500">Sĩ số đang học</p>
              <p className="mt-1 text-xl font-extrabold text-slate-900">
                {ws.summary?.totalEnrolled ?? 0}
              </p>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3">
              <p className="text-xs text-emerald-800">Có mặt</p>
              <p className="mt-1 text-xl font-extrabold text-emerald-900">
                {ws.summary?.presentCount ?? 0}
              </p>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3">
              <p className="text-xs text-amber-800">Đi muộn</p>
              <p className="mt-1 text-xl font-extrabold text-amber-900">
                {ws.summary?.lateCount ?? 0}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <p className="text-xs text-slate-600">
                {ws.windowStatus === 'CLOSED' ? 'Vắng mặt' : 'Chưa điểm danh'}
              </p>
              <p className="mt-1 text-xl font-extrabold text-slate-800">
                {ws.summary?.notRecordedCount ?? 0}
              </p>
            </div>
          </div>
        </section>

        {editing ? (
          <LocalAttendanceAuthorForm
            classId={classId}
            initialWorkspace={ws}
            onSaved={() => {
              setEditing(false);
              setStatusMsg('Đã cập nhật cấu hình phiên điểm danh.');
              void load();
              onActivityRefresh?.();
            }}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <section className="workspace-card space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="inline-flex items-center gap-2 text-lg font-extrabold text-slate-900">
                <Users className="size-5 text-indigo-600" aria-hidden="true" />
                Bảng thành viên & trạng thái điểm danh lớp
              </h2>
              <button
                type="button"
                className={button + ' text-xs'}
                onClick={() => void load()}
              >
                Làm mới
              </button>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Lọc trạng thái điểm danh">
                {filterTabs.map((tab) => {
                  const active = rosterFilter === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setRosterFilter(tab.id)}
                      className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                        active
                          ? 'border-[#76a35e] bg-[#76a35e] text-white'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {tab.label} ({tab.count})
                    </button>
                  );
                })}
              </div>
              <input
                type="search"
                aria-label="Tìm học viên trong danh sách điểm danh"
                placeholder="Tìm tên hoặc email học viên..."
                className="w-full rounded border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-800 sm:w-64"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                    <th className="py-2 pr-3">Học viên</th>
                    <th className="py-2 pr-3">Trạng thái</th>
                    <th className="py-2 pr-3">Thời gian check-in</th>
                    <th className="py-2 pr-3">Ghi chú</th>
                    <th className="py-2 text-right">Điểm danh thủ công</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRoster.map((row) => (
                    <tr key={row.enrollmentId} className="border-b border-slate-100">
                      <td className="py-2.5 pr-3">
                        <p className="font-semibold text-slate-900">{row.fullName}</p>
                        <p className="text-xs text-slate-500">{row.email}</p>
                      </td>
                      <td className="py-2.5 pr-3">
                        <span
                          className={`inline-flex rounded-md border px-2.5 py-0.5 text-xs font-bold ${statusBadges[row.status]}`}
                        >
                          {row.status === 'NOT_RECORDED' ? absentLabel : statusText[row.status]}
                        </span>
                      </td>
                      <td className="py-2.5 pr-3 text-xs text-slate-700">
                        {row.checkedInAt ? schoolTimestamp(row.checkedInAt) : '—'}
                      </td>
                      <td className="py-2.5 pr-3 text-xs text-slate-600">{row.note || '—'}</td>
                      <td className="py-2.5 text-right">
                        <div className="inline-flex flex-wrap justify-end gap-1.5">
                          <button
                            type="button"
                            disabled={busy || row.status === 'PRESENT'}
                            onClick={() => void handleManualMark(row.enrollmentId, row.fullName, 'PRESENT')}
                            className={`rounded-md border px-2 py-1 text-xs font-semibold transition ${
                              row.status === 'PRESENT'
                                ? 'border-emerald-300 bg-emerald-100 text-emerald-900 opacity-70'
                                : 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                            }`}
                          >
                            Có mặt
                          </button>
                          <button
                            type="button"
                            disabled={busy || row.status === 'LATE'}
                            onClick={() => void handleManualMark(row.enrollmentId, row.fullName, 'LATE')}
                            className={`rounded-md border px-2 py-1 text-xs font-semibold transition ${
                              row.status === 'LATE'
                                ? 'border-amber-300 bg-amber-100 text-amber-900 opacity-70'
                                : 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100'
                            }`}
                          >
                            Đi muộn
                          </button>
                          {row.status !== 'NOT_RECORDED' && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                void handleManualMark(row.enrollmentId, row.fullName, 'NOT_RECORDED')
                              }
                              className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                            >
                              Xóa
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!filteredRoster.length && (
                    <tr>
                      <td colSpan={5} className="py-4 text-center text-sm text-slate-500">
                        {ws.roster?.length
                          ? 'Không có học viên nào khớp bộ lọc hiện tại.'
                          : 'Lớp chưa có học viên đang theo học.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    );
  }

  // STUDENT VIEW
  return (
    <div className="space-y-5">
      {error && (
        <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          {error}
        </p>
      )}
      {statusMsg && (
        <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900">
          {statusMsg}
        </p>
      )}

      <section className="space-y-4">
        <div className="overflow-hidden rounded border border-slate-200 bg-white">
          <table className="w-full border-collapse text-left text-sm">
            <tbody className="divide-y divide-slate-200">
              <tr>
                <th className="w-56 border-r border-slate-200 bg-[#f8f9fa] px-4 py-2.5 font-semibold text-slate-800">
                  Buổi điểm danh
                </th>
                <td className="px-4 py-2.5 font-medium text-slate-900">{ws.config.sessionTitle}</td>
              </tr>
              <tr>
                <th className="w-56 border-r border-slate-200 bg-[#f8f9fa] px-4 py-2.5 font-semibold text-slate-800">
                  Thời gian hợp lệ
                </th>
                <td className="px-4 py-2.5 text-slate-700">
                  {schoolTimestamp(ws.config.checkInStartAt)} →{' '}
                  {schoolTimestamp(ws.config.checkInEndAt)}
                </td>
              </tr>
              <tr>
                <th className="w-56 border-r border-slate-200 bg-[#f8f9fa] px-4 py-2.5 font-semibold text-slate-800">
                  Trạng thái mở
                </th>
                <td className="px-4 py-2.5">
                  <span
                    className={`inline-flex rounded px-2.5 py-0.5 text-xs font-semibold ${
                      ws.windowStatus === 'OPEN'
                        ? 'bg-[#dcfce7] text-emerald-950'
                        : ws.windowStatus === 'UPCOMING'
                          ? 'bg-amber-100 text-amber-900'
                          : 'bg-rose-100 text-rose-900'
                    }`}
                  >
                    {ws.windowStatus === 'OPEN'
                      ? 'Đang mở check-in'
                      : ws.windowStatus === 'UPCOMING'
                        ? 'Chưa mở điểm danh'
                        : 'Đã đóng điểm danh'}
                  </span>
                </td>
              </tr>
              {ws.myRecord && (
                <tr>
                  <th className="w-56 border-r border-slate-200 bg-[#f8f9fa] px-4 py-2.5 font-semibold text-slate-800">
                    Kết quả điểm danh
                  </th>
                  <td className="bg-[#dcfce7] px-4 py-2.5 text-emerald-950">
                    <p className="inline-flex items-center gap-2 font-semibold">
                      <CheckCircle2 className="size-4 text-emerald-700" aria-hidden="true" />
                      Trạng thái điểm danh của bạn: {statusText[ws.myRecord.status]}
                    </p>
                    <p className="mt-0.5 text-xs text-emerald-900">
                      Ghi nhận lúc: {schoolTimestamp(ws.myRecord.checkedInAt)}
                      {ws.myRecord.note ? ` · Ghi chú: ${ws.myRecord.note}` : ''}
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {!ws.myRecord && (
          <div
            className={`space-y-3 rounded border p-4 ${
              ws.windowStatus === 'OPEN'
                ? 'border-[#76a35e] bg-[#f4f9f1]'
                : 'border-slate-200 bg-[#f8f9fa]'
            }`}
          >
            {ws.windowStatus !== 'OPEN' && (
              <div className="flex items-center gap-2 text-sm text-slate-700">
                <Clock className="size-4 shrink-0 text-amber-600" aria-hidden="true" />
                {ws.windowStatus === 'UPCOMING'
                  ? `Chưa đến thời gian mở điểm danh. Nút điểm danh sẽ tự sáng vào lúc ${schoolTimestamp(ws.config.checkInStartAt)}.`
                  : `Phiên điểm danh đã đóng lúc ${schoolTimestamp(ws.config.checkInEndAt)}; không thể check-in ngoài giờ quy định.`}
              </div>
            )}
            {ws.config.requireCode && (
              <label className="block text-sm font-semibold text-slate-700">
                Nhập mã điểm danh từ giảng viên
                <input
                  type="text"
                  disabled={ws.windowStatus !== 'OPEN'}
                  className={
                    field +
                    ' font-mono uppercase disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400'
                  }
                  placeholder={
                    ws.windowStatus === 'OPEN'
                      ? 'Nhập mã điểm danh...'
                      : 'Sẽ mở nhập mã khi tới giờ học...'
                  }
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                />
              </label>
            )}
            {ws.windowStatus === 'OPEN' && (
              <label className="block text-sm font-semibold text-slate-700">
                Ghi chú (tùy chọn)
                <input
                  type="text"
                  className={field}
                  placeholder="Ví dụ: Có mặt đúng giờ..."
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </label>
            )}
            <button
              type="button"
              disabled={
                busy ||
                ws.windowStatus !== 'OPEN' ||
                (ws.config.requireCode && !code.trim())
              }
              className={
                ws.windowStatus === 'OPEN'
                  ? 'inline-flex items-center justify-center gap-2 rounded bg-[#76a35e] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#658f50] disabled:cursor-not-allowed disabled:opacity-50'
                  : 'inline-flex cursor-not-allowed items-center justify-center gap-2 rounded border border-slate-300 bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-500'
              }
              onClick={() => void handleCheckIn()}
            >
              <UserCheck className="size-4" aria-hidden="true" />
              {ws.windowStatus === 'OPEN'
                ? busy
                  ? 'Đang gửi điểm danh…'
                  : 'Check-in điểm danh'
                : ws.windowStatus === 'UPCOMING'
                  ? 'Chưa tới giờ điểm danh'
                  : 'Đã đóng điểm danh'}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
