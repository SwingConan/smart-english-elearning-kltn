import { CalendarPlus, MessageCircle, Send } from 'lucide-react';
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router';
import { Avatar, SectionHeader, StatusBadge, Timeline } from '@/components/ui/ProductPrimitives';
import { engagementApi, type StudentConsultationThread } from '@/features/engagement/api';
import { apiUrl } from '@/lib/api-client';

const appointmentLabel: Record<string, string> = {
  REQUESTED: 'Chờ xác nhận',
  CONFIRMED: 'Đã xác nhận',
  DECLINED: 'Đã từ chối',
  CANCELLED: 'Đã hủy',
  COMPLETED: 'Đã hoàn tất',
};

export function StudentConsultationsPage() {
  const { enrollmentId = '' } = useParams();
  const [thread, setThread] = useState<StudentConsultationThread | null>(null);
  const [body, setBody] = useState('');
  const [appointmentOpen, setAppointmentOpen] = useState(false);
  const [form, setForm] = useState({ topic: '', start: '', durationMinutes: 30, learnerNote: '' });
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const endRef = useRef<HTMLDivElement>(null);
  const load = useCallback(
    async (quiet = false) => {
      try {
        const data = await engagementApi.consultations.studentThread(enrollmentId);
        setThread(data);
        setState('ready');
        if (data.unreadCount) await engagementApi.consultations.markStudentRead(enrollmentId);
      } catch {
        try {
          const appointments = await engagementApi.consultations.mine(enrollmentId);
          setThread({
            id: 'legacy',
            unreadCount: 0,
            messages: [],
            appointments,
            enrollment: {
              id: enrollmentId,
              status: 'ACTIVE',
              classOffering: { id: '', name: '', code: '' },
            },
          });
          setAppointmentOpen(true);
          setState('ready');
        } catch {
          if (!quiet) setState('error');
        }
      }
    },
    [enrollmentId],
  );
  useEffect(() => {
    void Promise.resolve().then(() => load());
    const refresh = () => {
      if (document.visibilityState === 'visible') void load(true);
    };
    const timer = window.setInterval(refresh, 15000);
    window.addEventListener('focus', refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
    };
  }, [load]);
  useEffect(() => {
    if (typeof endRef.current?.scrollIntoView === 'function')
      endRef.current.scrollIntoView({ block: 'nearest' });
  }, [thread?.messages.length]);
  const send = async (event: FormEvent) => {
    event.preventDefault();
    const value = body.trim();
    if (!value) return;
    await engagementApi.consultations.sendStudentMessage(enrollmentId, value);
    setBody('');
    await load(true);
  };
  const create = async (event: FormEvent) => {
    event.preventDefault();
    await engagementApi.consultations.create(enrollmentId, {
      topic: form.topic,
      requestedStartAt: new Date(form.start).toISOString(),
      durationMinutes: form.durationMinutes,
      learnerNote: form.learnerNote || undefined,
    });
    setForm({ topic: '', start: '', durationMinutes: 30, learnerNote: '' });
    setAppointmentOpen(false);
    await load(true);
  };
  if (state === 'loading')
    return <div className="h-96 animate-pulse rounded-3xl bg-slate-200" role="status" />;
  if (state === 'error' || !thread)
    return (
      <div className="state-error" role="alert">
        Không thể tải trung tâm tư vấn.{' '}
        <button className="underline" onClick={() => void load()}>
          Thử lại
        </button>
      </div>
    );
  const instructor = thread.enrollment.classOffering.instructor;
  return (
    <section className="space-y-6">
      <SectionHeader
        title="Trung tâm tư vấn"
        description={`Trao đổi riêng với giảng viên của lớp ${thread.enrollment.classOffering.code}. Tin nhắn được lưu theo lớp.`}
        actions={
          <button className="btn-secondary" onClick={() => setAppointmentOpen((value) => !value)}>
            <CalendarPlus size={17} /> Đặt lịch tư vấn
          </button>
        }
      />
      {appointmentOpen ? (
        <form
          className="grid gap-4 rounded-2xl border bg-white p-5 sm:grid-cols-2"
          onSubmit={(event) => void create(event)}
        >
          <label className="font-semibold">
            Chủ đề
            <input
              className="input-field mt-1"
              minLength={3}
              onChange={(event) => setForm({ ...form, topic: event.target.value })}
              required
              value={form.topic}
            />
          </label>
          <label className="font-semibold">
            Thời gian mong muốn
            <input
              className="input-field mt-1"
              min={new Date().toISOString().slice(0, 16)}
              onChange={(event) => setForm({ ...form, start: event.target.value })}
              required
              type="datetime-local"
              value={form.start}
            />
          </label>
          <label className="font-semibold">
            Thời lượng
            <select
              className="input-field mt-1"
              onChange={(event) =>
                setForm({ ...form, durationMinutes: Number(event.target.value) })
              }
              value={form.durationMinutes}
            >
              {[15, 30, 45, 60].map((value) => (
                <option key={value} value={value}>
                  {value} phút
                </option>
              ))}
            </select>
          </label>
          <label className="font-semibold">
            Ghi chú cho giảng viên (không bắt buộc)
            <textarea
              className="input-field mt-1"
              onChange={(event) => setForm({ ...form, learnerNote: event.target.value })}
              value={form.learnerNote}
            />
          </label>
          <button className="btn-primary sm:col-span-2">Gửi yêu cầu</button>
        </form>
      ) : null}
      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <div className="flex min-h-[560px] flex-col overflow-hidden rounded-3xl border bg-white shadow-sm">
          <header className="flex items-center gap-3 border-b p-4">
            <Avatar
              name={instructor?.fullName ?? 'Giảng viên'}
              src={
                instructor?.avatarKey
                  ? apiUrl(`/user-assets/avatars/${instructor.avatarKey}`)
                  : null
              }
            />
            <div>
              <h3 className="font-bold">{instructor?.fullName ?? 'Giảng viên phụ trách'}</h3>
              <p className="text-xs text-slate-500">
                Phản hồi khi có thời gian · tự động làm mới mỗi 15 giây
              </p>
            </div>
          </header>
          <div className="flex-1 space-y-4 overflow-y-auto bg-slate-50 p-4" aria-live="polite">
            {thread.messages.length ? (
              thread.messages.map((message) => {
                const mine = message.sender.role === 'STUDENT';
                return (
                  <div
                    className={`flex ${mine ? 'justify-end' : 'justify-start'}`}
                    key={message.id}
                  >
                    <div
                      className={`max-w-[82%] rounded-2xl px-4 py-3 ${mine ? 'bg-indigo-600 text-white' : 'border bg-white text-slate-800'}`}
                    >
                      <p className="whitespace-pre-wrap leading-6">{message.body}</p>
                      <p className={`mt-1 text-xs ${mine ? 'text-indigo-100' : 'text-slate-400'}`}>
                        {new Date(message.createdAt).toLocaleString('vi-VN')}
                      </p>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="grid h-full place-items-center text-center text-slate-500">
                <div>
                  <MessageCircle className="mx-auto mb-2" />
                  <p>Chưa có tin nhắn. Hãy bắt đầu bằng câu hỏi của bạn.</p>
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>
          <form className="flex gap-2 border-t p-3" onSubmit={(event) => void send(event)}>
            <textarea
              aria-label="Tin nhắn"
              className="input-field min-h-12 flex-1 resize-none"
              maxLength={4000}
              onChange={(event) => setBody(event.target.value)}
              placeholder="Nhập tin nhắn…"
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
        </div>
        <aside className="rounded-3xl border bg-white p-5 shadow-sm">
          <SectionHeader title="Lịch hẹn" description="Yêu cầu và các mốc đã xác nhận." />
          <div className="mt-5">
            {thread.appointments.length ? (
              <Timeline
                items={thread.appointments
                  .slice()
                  .reverse()
                  .map((item) => ({
                    id: item.id,
                    title: item.topic,
                    description: (
                      <>
                        <span>
                          {new Date(item.confirmedStartAt ?? item.requestedStartAt).toLocaleString(
                            'vi-VN',
                          )}{' '}
                          · {item.durationMinutes} phút
                        </span>
                        {item.status === 'CONFIRMED' && item.meetingUrl ? (
                          <a
                            className="mt-2 block font-bold text-indigo-700 underline"
                            href={item.meetingUrl}
                            rel="noreferrer"
                            target="_blank"
                          >
                            Mở phòng tư vấn
                          </a>
                        ) : null}
                        {['REQUESTED', 'CONFIRMED'].includes(item.status) ? (
                          <button
                            className="mt-2 block text-sm font-bold text-rose-700"
                            onClick={() =>
                              void engagementApi.consultations
                                .cancel(enrollmentId, item.id)
                                .then(() => load(true))
                            }
                          >
                            Hủy yêu cầu
                          </button>
                        ) : null}
                      </>
                    ),
                    meta: (
                      <StatusBadge
                        tone={
                          item.status === 'CONFIRMED' || item.status === 'COMPLETED'
                            ? 'success'
                            : item.status === 'DECLINED'
                              ? 'danger'
                              : 'warning'
                        }
                      >
                        {appointmentLabel[item.status] ?? item.status}
                      </StatusBadge>
                    ),
                    tone:
                      item.status === 'COMPLETED'
                        ? 'success'
                        : item.status === 'DECLINED'
                          ? 'danger'
                          : 'warning',
                  }))}
              />
            ) : (
              <p className="text-sm text-slate-500">Chưa có lịch hẹn.</p>
            )}
          </div>
        </aside>
      </div>
    </section>
  );
}
