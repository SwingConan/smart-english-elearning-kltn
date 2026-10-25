import { CalendarClock, Send, Users } from 'lucide-react';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { Avatar, SectionHeader, StatusBadge } from '@/components/ui/ProductPrimitives';
import {
  engagementApi,
  type ConsultationInboxItem,
  type InstructorConsultationThread,
} from '@/features/engagement/api';
import { apiUrl } from '@/lib/api-client';
import { fromDateTimeLocalValue, toDateTimeLocalValue } from '@/lib/datetime-local';

const appointmentLabel: Record<string, string> = {
  REQUESTED: 'Chờ xác nhận',
  CONFIRMED: 'Đã xác nhận',
  DECLINED: 'Đã từ chối',
  CANCELLED: 'Đã hủy',
  COMPLETED: 'Đã hoàn tất',
};

export function InstructorConsultationsPage() {
  const { classOfferingId = '' } = useParams();
  const [inbox, setInbox] = useState<ConsultationInboxItem[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [thread, setThread] = useState<InstructorConsultationThread | null>(null);
  const [body, setBody] = useState('');
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const loadInbox = useCallback(
    async (quiet = false) => {
      try {
        const rows = await engagementApi.consultations.inbox(classOfferingId);
        setInbox(rows);
        setSelectedId((current) => current || rows[0]?.enrollmentId || '');
        setState('ready');
      } catch {
        if (!quiet) setState('error');
      }
    },
    [classOfferingId],
  );
  const loadThread = useCallback(
    async (quiet = false) => {
      if (!selectedId) {
        setThread(null);
        return;
      }
      try {
        const data = await engagementApi.consultations.instructorThread(
          classOfferingId,
          selectedId,
        );
        setThread(data);
        await engagementApi.consultations.markInstructorRead(classOfferingId, selectedId);
      } catch {
        if (!quiet) setState('error');
      }
    },
    [classOfferingId, selectedId],
  );
  useEffect(() => {
    void Promise.resolve().then(() => loadInbox());
  }, [loadInbox]);
  useEffect(() => {
    void Promise.resolve().then(() => loadThread());
  }, [loadThread]);
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') {
        void loadInbox(true);
        void loadThread(true);
      }
    };
    const timer = window.setInterval(refresh, 15000);
    window.addEventListener('focus', refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
    };
  }, [loadInbox, loadThread]);
  const send = async (event: FormEvent) => {
    event.preventDefault();
    const value = body.trim();
    if (!value || !selectedId) return;
    await engagementApi.consultations.sendInstructorMessage(classOfferingId, selectedId, value);
    setBody('');
    await loadThread(true);
    await loadInbox(true);
  };
  const updateAppointment = async (
    id: string,
    status: string,
    values: Record<string, unknown> = {},
  ) => {
    await engagementApi.consultations.update(classOfferingId, id, { status, ...values });
    await loadThread(true);
    await loadInbox(true);
  };
  if (state === 'loading')
    return <div className="h-96 animate-pulse rounded-3xl bg-slate-200" role="status" />;
  if (state === 'error')
    return (
      <div className="state-error" role="alert">
        Không thể tải hộp thư tư vấn.{' '}
        <button className="underline" onClick={() => void loadInbox()}>
          Thử lại
        </button>
      </div>
    );
  return (
    <section className="space-y-6">
      <SectionHeader
        title="Trung tâm tư vấn"
        description="Mỗi học viên có một cuộc trò chuyện riêng theo lớp. Ghi chú nội bộ của lịch hẹn không xuất hiện trong cuộc trò chuyện."
      />
      <div className="grid min-h-[650px] overflow-hidden rounded-3xl border bg-white shadow-sm lg:grid-cols-[300px_1fr_330px]">
        <aside className="border-b lg:border-b-0 lg:border-r">
          <div className="flex items-center gap-2 border-b p-4 font-bold">
            <Users size={19} /> Học viên{' '}
            <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-xs">
              {inbox.length}
            </span>
          </div>
          <div className="max-h-[600px] overflow-y-auto">
            {inbox.map((item) => (
              <button
                className={`flex w-full items-center gap-3 border-b p-4 text-left transition ${selectedId === item.enrollmentId ? 'bg-indigo-50' : 'hover:bg-slate-50'}`}
                key={item.enrollmentId}
                onClick={() => setSelectedId(item.enrollmentId)}
              >
                <Avatar
                  name={item.learner.fullName}
                  size="sm"
                  src={
                    item.learner.avatarKey
                      ? apiUrl(`/user-assets/avatars/${item.learner.avatarKey}`)
                      : null
                  }
                />
                <span className="min-w-0 flex-1">
                  <strong className="block truncate">{item.learner.fullName}</strong>
                  <span className="block truncate text-xs text-slate-500">
                    {item.lastMessage?.body ?? 'Chưa có tin nhắn'}
                  </span>
                </span>
                {item.unreadCount ? (
                  <span className="grid size-6 place-items-center rounded-full bg-indigo-600 text-xs font-bold text-white">
                    {item.unreadCount}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        </aside>
        <main className="flex min-h-[560px] flex-col border-b lg:border-b-0 lg:border-r">
          {thread ? (
            <>
              <header className="border-b p-4">
                <h3 className="font-bold">{thread.enrollment.learner.fullName}</h3>
                <p className="text-xs text-slate-500">{thread.enrollment.learner.email}</p>
              </header>
              <div className="flex-1 space-y-4 overflow-y-auto bg-slate-50 p-4">
                {thread.messages.length ? (
                  thread.messages.map((message) => {
                    const mine = message.sender.role === 'INSTRUCTOR';
                    return (
                      <div
                        className={`flex ${mine ? 'justify-end' : 'justify-start'}`}
                        key={message.id}
                      >
                        <div
                          className={`max-w-[82%] rounded-2xl px-4 py-3 ${mine ? 'bg-indigo-600 text-white' : 'border bg-white'}`}
                        >
                          <p className="whitespace-pre-wrap">{message.body}</p>
                          <p
                            className={`mt-1 text-xs ${mine ? 'text-indigo-100' : 'text-slate-400'}`}
                          >
                            {new Date(message.createdAt).toLocaleString('vi-VN')}
                          </p>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="grid h-full place-items-center text-slate-500">
                    Chưa có tin nhắn.
                  </div>
                )}
              </div>
              <form className="flex gap-2 border-t p-3" onSubmit={(event) => void send(event)}>
                <textarea
                  aria-label="Tin nhắn"
                  className="input-field min-h-12 flex-1 resize-none"
                  maxLength={4000}
                  onChange={(event) => setBody(event.target.value)}
                  placeholder="Nhập phản hồi…"
                  value={body}
                />
                <button
                  aria-label="Gửi tin nhắn"
                  className="btn-primary self-end"
                  disabled={!body.trim()}
                >
                  <Send size={18} />
                </button>
              </form>
            </>
          ) : (
            <div className="grid h-full place-items-center text-slate-500">
              Chọn một học viên để trao đổi.
            </div>
          )}
        </main>
        <aside className="p-4">
          <div className="flex items-center gap-2">
            <CalendarClock size={19} />
            <h3 className="font-bold">Lịch hẹn</h3>
          </div>
          {thread?.appointments.length ? (
            <div className="mt-4 space-y-3">
              {thread.appointments
                .slice()
                .reverse()
                .map((item) => (
                  <AppointmentCard
                    item={item}
                    key={`${item.id}:${item.status}:${item.confirmedStartAt ?? item.requestedStartAt}:${item.meetingUrl ?? ''}`}
                    onUpdate={updateAppointment}
                  />
                ))}
            </div>
          ) : (
            <p className="mt-4 text-sm text-slate-500">Chưa có yêu cầu lịch hẹn.</p>
          )}
        </aside>
      </div>
    </section>
  );
}

function AppointmentCard({
  item,
  onUpdate,
}: {
  item: InstructorConsultationThread['appointments'][number];
  onUpdate: (id: string, status: string, values?: Record<string, unknown>) => Promise<void>;
}) {
  const appointmentStart = item.confirmedStartAt ?? item.requestedStartAt;
  const [start, setStart] = useState(toDateTimeLocalValue(appointmentStart));
  const [meetingUrl, setMeetingUrl] = useState(item.meetingUrl ?? '');
  const [reason, setReason] = useState('');
  return (
    <article className="rounded-2xl border p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <span className="text-xs font-bold text-indigo-700">
            {item.status === 'REQUESTED'
              ? 'Yêu cầu mới'
              : item.status === 'CONFIRMED'
                ? 'Sắp diễn ra'
                : 'Lịch sử'}
          </span>
          <strong className="block">{item.topic}</strong>
        </div>
        <StatusBadge
          tone={
            item.status === 'CONFIRMED' || item.status === 'COMPLETED'
              ? 'success'
              : item.status === 'DECLINED'
                ? 'danger'
                : 'warning'
          }
        >
          {appointmentLabel[item.status] ?? 'Không xác định'}
        </StatusBadge>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        Đề xuất: {new Date(item.requestedStartAt).toLocaleString('vi-VN')} · {item.durationMinutes}{' '}
        phút
      </p>
      {['REQUESTED', 'CONFIRMED'].includes(item.status) ? (
        <div className="mt-3 space-y-2">
          <input
            aria-label="Thời gian xác nhận"
            className="input-field"
            onChange={(event) => setStart(event.target.value)}
            type="datetime-local"
            value={start}
          />
          <input
            aria-label="Liên kết phòng"
            className="input-field"
            onChange={(event) => setMeetingUrl(event.target.value)}
            placeholder="https://…"
            type="url"
            value={meetingUrl}
          />
          {item.status === 'REQUESTED' ? (
            <input
              aria-label="Lý do từ chối"
              className="input-field"
              onChange={(event) => setReason(event.target.value)}
              placeholder="Lý do nếu từ chối"
              value={reason}
            />
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button
              className="btn-primary"
              onClick={() =>
                void onUpdate(item.id, 'CONFIRMED', {
                  confirmedStartAt: fromDateTimeLocalValue(start),
                  durationMinutes: item.durationMinutes,
                  meetingUrl: meetingUrl || undefined,
                })
              }
            >
              {item.status === 'REQUESTED' ? 'Xác nhận' : 'Lưu lịch mới'}
            </button>
            {item.status === 'REQUESTED' ? (
              <button
                className="btn-secondary"
                disabled={!reason.trim()}
                onClick={() => void onUpdate(item.id, 'DECLINED', { declineReason: reason })}
              >
                Từ chối
              </button>
            ) : (
              <button className="btn-secondary" onClick={() => void onUpdate(item.id, 'COMPLETED')}>
                Đánh dấu hoàn tất
              </button>
            )}
          </div>
        </div>
      ) : null}
    </article>
  );
}
