import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Calendar, Video } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { instructorApi } from '@/features/instructor/api';
import type { InstructorClass } from '@/features/instructor/types';
import { classCodeLabel } from '@/features/demo/presentation';
import { learnerClassLabel } from '@/features/enrollments/presentation';
import { schoolDay, schoolTime } from '@/features/class-lms/month';
import { SessionEngagementPanel, W06Notifications } from './SessionEngagementPage';

type SessionEntry = {
  id: string;
  startsAt: string;
  endsAt: string;
  revision: number;
  modality?: 'ONLINE' | 'OFFLINE' | 'HYBRID';
};

const MODALITY_TAG: Record<string, string> = {
  ONLINE: 'Online',
  OFFLINE: 'Trực tiếp',
  HYBRID: 'Kết hợp',
};

export function InstructorRequestsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlClassId = searchParams.get('classId') ?? '';
  const tab = searchParams.get('tab') === 'schedule' ? 'schedule' : 'meet';

  const [classes, setClasses] = useState<InstructorClass[]>([]);
  const [selectedClassId, setSelectedClassId] = useState(urlClassId);
  const [sessions, setSessions] = useState<SessionEntry[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [loadingClasses, setLoadingClasses] = useState(true);
  const [loadingSessions, setLoadingSessions] = useState(false);

  useEffect(() => {
    if (urlClassId && urlClassId !== selectedClassId) {
      setSelectedClassId(urlClassId);
    }
  }, [urlClassId, selectedClassId]);

  useEffect(() => {
    const controller = new AbortController();
    instructorApi.classes
      .list(controller.signal)
      .then((list) => {
        setClasses(list);
        if (!urlClassId && list.length > 0) {
          const preferred =
            list.find(
              (c) =>
                c.status === 'ACTIVE' &&
                ((c as { upcomingSessionCount?: number }).upcomingSessionCount ?? 0) > 0,
            ) ??
            list.find((c) => c.status === 'ACTIVE') ??
            list[0];
          setSelectedClassId(preferred.id);
        }
      })
      .catch(() => {
        setClasses([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingClasses(false);
      });
    return () => controller.abort();
  }, [urlClassId]);

  useEffect(() => {
    if (!selectedClassId) {
      setSessions([]);
      setSelectedSessionId('');
      return;
    }
    let active = true;
    setLoadingSessions(true);
    apiFetch<{ data: SessionEntry[] }>(`/v2/session-engagement/classes/${selectedClassId}`)
      .then((res) => {
        if (!active) return;
        const rows = res.data ?? [];
        setSessions(rows);
        setSelectedSessionId(rows[0]?.id ?? '');
      })
      .catch(() => {
        if (!active) return;
        setSessions([]);
        setSelectedSessionId('');
      })
      .finally(() => {
        if (active) setLoadingSessions(false);
      });
    return () => {
      active = false;
    };
  }, [selectedClassId]);

  const currentClass = classes.find((c) => c.id === selectedClassId);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-[#e66f2b] sm:text-[26px]">
            {tab === 'schedule'
              ? 'Đề nghị nghỉ dạy, đổi lịch & dạy bù'
              : 'Đề nghị duyệt Google Meet & Điểm danh buổi'}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Chọn lớp và buổi học để gửi link Google Meet, mở điểm danh hoặc xin đổi lịch.
          </p>
        </div>
        {currentClass && (
          <Link
            to={`/classroom/${currentClass.id}`}
            className="btn-secondary px-3.5 py-2 text-xs"
          >
            Vào lớp học →
          </Link>
        )}
      </header>

      {/* Mode & Class Toolbar */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="inline-flex rounded-lg bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setSearchParams(selectedClassId ? { classId: selectedClassId } : {})}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                tab === 'meet'
                  ? 'bg-[#76a35e] text-white shadow-xs'
                  : 'text-slate-700 hover:text-slate-900'
              }`}
            >
              <Video size={14} aria-hidden="true" />
              Google Meet & Điểm danh
            </button>
            <button
              type="button"
              onClick={() =>
                setSearchParams(
                  selectedClassId
                    ? { tab: 'schedule', classId: selectedClassId }
                    : { tab: 'schedule' },
                )
              }
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                tab === 'schedule'
                  ? 'bg-[#76a35e] text-white shadow-xs'
                  : 'text-slate-700 hover:text-slate-900'
              }`}
            >
              <Calendar size={14} aria-hidden="true" />
              Nghỉ dạy, đổi lịch & dạy bù
            </button>
          </div>

          <label className="flex min-w-0 w-full flex-col gap-1 text-xs font-semibold text-slate-700 sm:w-auto sm:flex-row sm:items-center sm:gap-2">
            <span className="shrink-0">Lớp học:</span>
            <select
              aria-label="Chọn lớp phụ trách"
              disabled={loadingClasses || classes.length === 0}
              value={selectedClassId}
              onChange={(e) => {
                const nextId = e.target.value;
                setSelectedClassId(nextId);
                setSearchParams(
                  tab === 'schedule'
                    ? nextId
                      ? { tab: 'schedule', classId: nextId }
                      : { tab: 'schedule' }
                    : nextId
                      ? { classId: nextId }
                      : {},
                );
              }}
              className="w-full min-w-0 max-w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-normal text-slate-800 focus:border-[#76a35e] focus:outline-none sm:w-auto"
            >
              {classes.map((cls) => (
                <option key={cls.id} value={cls.id}>
                  {(classCodeLabel(cls.code) || cls.code) +
                    ' · ' +
                    learnerClassLabel(cls.name, cls.code)}
                </option>
              ))}
            </select>
          </label>
        </div>

        {loadingSessions ? (
          <p className="text-sm text-slate-500" role="status">
            Đang tải danh sách buổi học chính thức…
          </p>
        ) : sessions.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/70 p-4 text-sm text-slate-700 space-y-2">
            <p className="font-semibold text-slate-900">
              Lớp này chưa có buổi học chính thức được công bố.
            </p>
            <p className="text-xs text-slate-600">
              Khi Học vụ công bố lịch buổi học, bạn có thể gửi link Google Meet hoặc đề nghị đổi
              lịch ngay tại đây. Nếu cần tạo hoạt động điểm danh trong lớp ngay bây giờ, hãy mở
              trang lớp học.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="max-h-52 overflow-y-auto pr-1 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {sessions.map((s, idx) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSelectedSessionId(s.id)}
                  className={`rounded-xl border p-3 text-left transition ${
                    selectedSessionId === s.id
                      ? 'border-[#76a35e] bg-[#f4f9f1]'
                      : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-bold text-[#2d581b]">Buổi #{idx + 1}</p>
                    {s.modality && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                        {MODALITY_TAG[s.modality] ?? s.modality}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-sm font-semibold text-slate-900">
                    {schoolDay(s.startsAt)}
                  </p>
                  <p className="text-xs text-slate-600">
                    {schoolTime(s.startsAt)} – {schoolTime(s.endsAt)}
                  </p>
                </button>
              ))}
            </div>

            {selectedSessionId && (
              <SessionEngagementPanel
                key={`${selectedSessionId}-${tab}`}
                sessionId={selectedSessionId}
                focus={tab}
              />
            )}
          </div>
        )}
      </section>

      <W06Notifications />
    </div>
  );
}
