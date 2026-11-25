import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import {
  CheckCircle2,
  MessageSquare,
  Paperclip,
  RefreshCw,
  Search,
} from 'lucide-react';
import { ApiError } from '@/lib/api-client';
import {
  supportGet,
  supportPost,
  supportUpload,
  type TicketSummary,
  type Topic,
} from '@/features/support/support-api';
import {
  formatTicketStatusLabel,
  SupportAttachmentDropzone,
  ticketStatusTone,
} from '@/features/support/SupportAttachments';

type Availability = {
  canCreate: boolean;
  canReadOwnTickets: boolean;
  reason: string | null;
  processingState: 'READY' | 'STAFF_PERMISSION_EXPIRED' | 'STAFF_ASSIGNMENT_REQUIRED';
  consentVersion: string;
};

const QUICK_ISSUE_PRESETS = [
  {
    short: 'Hỏi lịch khai giảng',
    text: 'Em muốn hỏi lịch khai giảng lớp TOEIC phù hợp trình độ và thủ tục chuyển ca học buổi tối.',
  },
  {
    short: 'Lỗi nộp bài LMS',
    text: 'Em gặp lỗi không bấm được nút Nộp bài hoặc không tải được tài liệu trong lớp học LMS.',
  },
  {
    short: 'Kiểm tra học phí',
    text: 'Nhờ trung tâm kiểm tra giúp trạng thái ghi danh, học phí hoặc phiếu thu của tài khoản.',
  },
  {
    short: 'Tư vấn lộ trình',
    text: 'Em cần tư vấn tài liệu ôn tập và lộ trình cải thiện kỹ năng Listening – Reading theo mục tiêu.',
  },
];

function loadError(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 401)
      return 'Phiên đăng nhập không còn hợp lệ. Vui lòng đăng nhập lại để xem và gửi phiếu của bạn.';
    if (error.status === 403)
      return 'Tài khoản chưa được phép dùng chức năng này. Trung tâm cần kiểm tra quyền hiện hành cho đúng tài khoản và chủ đề hỗ trợ.';
    if (error.status === 409)
      return 'Kênh hỗ trợ chưa được cấu hình đúng cho môi trường hiện tại. Trung tâm cần kiểm tra cấu hình tiếp nhận.';
    if (error.status === 503 || error.status >= 500)
      return 'Máy chủ hỗ trợ đang gặp lỗi. Vui lòng tải lại; nội dung bạn nhập được giữ nguyên.';
  }
  return 'Không kết nối được kênh hỗ trợ. Kiểm tra kết nối và bấm Tải lại.';
}

export function StudentSupportPage() {
  const [topics, setTopics] = useState<Topic[]>(),
    [availability, setAvailability] = useState<Availability>(),
    [tickets, setTickets] = useState<TicketSummary[]>();
  const [errors, setErrors] = useState<Record<string, string>>({}),
    [topic, setTopic] = useState(''),
    [description, setDescription] = useState(''),
    [consent, setConsent] = useState(false),
    [statusFilter, setStatusFilter] = useState<'ALL' | 'OPEN' | 'CLOSED'>('ALL'),
    [searchQuery, setSearchQuery] = useState('');
  const [receipt, setReceipt] = useState<{
      id?: string;
      reference: string;
      attachedCount?: number;
    }>(),
    [selectedFiles, setSelectedFiles] = useState<File[]>([]),
    [attachmentError, setAttachmentError] = useState(''),
    [pendingUploadTicket, setPendingUploadTicket] = useState<{
      id: string;
      reference: string;
    } | null>(null),
    [busy, setBusy] = useState(false),
    [uncertain, setUncertain] = useState(false);
  const pending = useRef<Record<string, unknown> | null>(null),
    inFlight = useRef(false);

  const load = useCallback(async () => {
    const [t, a, h] = await Promise.allSettled([
      supportGet<{ topics: Topic[] }>('/public/topics'),
      supportGet<Availability>('/availability'),
      supportGet<{ items: TicketSummary[] }>('/tickets'),
    ]);
    if (t.status === 'fulfilled') {
      setTopics(t.value.topics);
      setTopic((current) =>
        t.value.topics.some((item) => item.id === current) ? current : (t.value.topics[0]?.id ?? ''),
      );
      setErrors((e) => ({ ...e, topics: '' }));
    } else setErrors((e) => ({ ...e, topics: loadError(t.reason) }));
    if (a.status === 'fulfilled') {
      setAvailability(a.value);
      setErrors((e) => ({ ...e, availability: '' }));
    } else {
      setAvailability(undefined);
      setErrors((e) => ({ ...e, availability: loadError(a.reason) }));
    }
    if (h.status === 'fulfilled') {
      setTickets(h.value.items);
      setErrors((e) => ({ ...e, tickets: '' }));
    } else {
      setTickets(undefined);
      setErrors((e) => ({ ...e, tickets: loadError(h.reason) }));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function uploadTicketFiles(ticketId: string, reference: string, files: File[]) {
    if (!files.length) return 0;
    try {
      const uploaded = await supportUpload<{ attachments?: unknown[] }>(
        `/tickets/${ticketId}/attachments`,
        files,
      );
      setAttachmentError('');
      setPendingUploadTicket(null);
      setSelectedFiles([]);
      const count = uploaded?.attachments?.length ?? files.length;
      setReceipt({ id: ticketId, reference, attachedCount: count });
      return count;
    } catch (err) {
      setPendingUploadTicket({ id: ticketId, reference });
      const msg =
        err instanceof ApiError &&
        typeof (err.body as { message?: string } | undefined)?.message === 'string'
          ? (err.body as { message: string }).message
          : 'Phiếu đã được lưu nhưng tải tệp đính kèm chưa thành công. Bạn có thể bấm “Thử tải lại tệp”.';
      setAttachmentError(msg);
      return -1;
    }
  }

  async function retryAttachmentUpload() {
    if (!pendingUploadTicket || !selectedFiles.length || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const count = await uploadTicketFiles(
        pendingUploadTicket.id,
        pendingUploadTicket.reference,
        selectedFiles,
      );
      if (count >= 0) await load();
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  async function submit() {
    if (inFlight.current || !availability?.canCreate) return;
    inFlight.current = true;
    setBusy(true);
    setErrors((e) => ({ ...e, submit: '' }));
    setAttachmentError('');
    pending.current ??= {
      idempotencyKey: crypto.randomUUID(),
      topicId: topic,
      description: description.trim(),
      consent,
      consentVersion: availability.consentVersion,
      contactMethod: 'IN_APP',
      website: '',
    };
    const filesToUpload = [...selectedFiles];
    try {
      const result = await supportPost<{ id?: string; reference: string }>(
        '/public/tickets',
        pending.current,
      );
      pending.current = null;
      setUncertain(false);
      setDescription('');
      setConsent(false);
      if (result.id && filesToUpload.length > 0) {
        await uploadTicketFiles(result.id, result.reference, filesToUpload);
      } else {
        setReceipt({ ...result });
      }
      await load();
    } catch (e) {
      if (e instanceof ApiError && e.status < 500) {
        pending.current = null;
        setUncertain(false);
        setErrors((old) => ({
          ...old,
          submit:
            e.status === 429
              ? 'Bạn gửi yêu cầu quá nhanh. Vui lòng chờ một lúc rồi thử lại.'
              : e.status === 400
                ? 'Phiếu chưa được nhận. Chọn chủ đề hiện hành, nhập ít nhất 10 ký tự và xác nhận đồng ý xử lý thông tin. Không gửi mật khẩu hoặc thông tin thẻ.'
                : loadError(e),
        }));
      } else {
        setUncertain(true);
        setErrors((old) => ({
          ...old,
          submit:
            'Chưa nhận được xác nhận lưu. Nội dung được giữ nguyên; chọn “Thử lại yêu cầu” để kiểm tra cùng phiếu, tránh gửi trùng.',
        }));
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  const canSend = availability?.canCreate && !!topics?.length;

  const stats = useMemo(() => {
    const list = tickets ?? [];
    const closedCount = list.filter((t) => ['CLOSED', 'RESOLVED'].includes(t.state)).length;
    const waitingNew = list.filter((t) => t.state === 'NEW').length;
    const activeProcessing = list.length - closedCount - waitingNew;
    return {
      total: list.length,
      waitingNew,
      activeProcessing,
      closedCount,
    };
  }, [tickets]);

  const filteredTickets = useMemo(() => {
    const list = tickets ?? [];
    const q = searchQuery.trim().toLowerCase();
    return list.filter((t) => {
      const isClosed = ['CLOSED', 'RESOLVED'].includes(t.state);
      if (statusFilter === 'CLOSED' && !isClosed) return false;
      if (statusFilter === 'OPEN' && isClosed) return false;
      if (!q) return true;
      return (
        t.topic.title.toLowerCase().includes(q) || t.reference.toLowerCase().includes(q)
      );
    });
  }, [tickets, statusFilter, searchQuery]);

  return (
    <main className="mx-auto min-w-0 max-w-6xl space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Hỗ trợ học viên</h1>
          <p className="mt-1 text-sm text-slate-600">
            Gửi yêu cầu học vụ hoặc kỹ thuật LMS, đính kèm ảnh chụp lỗi và theo dõi phản hồi trực tuyến.
          </p>
        </div>
        <button
          type="button"
          className="btn-secondary gap-1.5 text-sm"
          disabled={busy}
          onClick={() => void load()}
        >
          <RefreshCw size={15} aria-hidden="true" />
          Tải lại
        </button>
      </header>

      {receipt && (
        <div
          role="status"
          className="min-w-0 rounded-2xl border border-[#cde0c0] bg-[#eef6e8] p-4 text-sm text-[#234414]"
        >
          <p className="flex items-center gap-2 font-semibold">
            <CheckCircle2 size={17} className="shrink-0 text-[#4d7439]" aria-hidden="true" />
            <span>
              {pendingUploadTicket
                ? 'Đã gửi phiếu nhưng tệp đính kèm cần tải lại'
                : 'Đã tiếp nhận yêu cầu của bạn'}
            </span>
          </p>
          <p className="mt-1 break-all text-xs text-[#3f642c]">
            Mã phiếu: <strong>{receipt.reference}</strong> · Trạng thái: Chờ nhân viên tiếp nhận
          </p>
          {typeof receipt.attachedCount === 'number' && receipt.attachedCount > 0 && (
            <p className="mt-1 text-xs font-medium text-[#3f642c]">
              Đã lưu kèm {receipt.attachedCount} tệp đính kèm.
            </p>
          )}
          {receipt.id && (
            <Link
              className="mt-2 inline-block font-semibold text-[#2f581c] underline"
              to={'/student/support/tickets/' + receipt.id}
            >
              Xem phiếu và phản hồi
            </Link>
          )}
        </div>
      )}

      <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <section
          className="min-w-0 space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs"
          aria-labelledby="new-support-request"
        >
          <div className="border-b border-slate-100 pb-3">
            <h2 id="new-support-request" className="text-lg font-bold text-slate-900">
              Gửi yêu cầu mới
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Chọn đúng chủ đề để yêu cầu được chuyển đến bộ phận phụ trách nhanh nhất.
            </p>
          </div>

          {errors.availability || errors.topics ? (
            <div
              role="alert"
              className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"
            >
              {errors.availability || errors.topics}
            </div>
          ) : !availability || !topics ? (
            <p role="status" className="text-sm text-slate-500">
              Đang kiểm tra kênh tiếp nhận…
            </p>
          ) : !canSend ? (
            <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-950" role="status">
              <h3 className="font-semibold">Chưa có chủ đề hỗ trợ được mở</h3>
              <p className="mt-1">
                Trung tâm cần phê duyệt ít nhất một chủ đề trước khi nhận phiếu mới. Bạn vẫn có thể
                xem các phiếu đã gửi bên cạnh.
              </p>
            </div>
          ) : (
            <>
              {availability.processingState !== 'READY' && (
                <p
                  role="status"
                  className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"
                >
                  {availability.processingState === 'STAFF_PERMISSION_EXPIRED'
                    ? 'Quyền xử lý của nhân sự hỗ trợ đã hết hạn; trung tâm cần gia hạn cho đúng chủ đề.'
                    : 'Trung tâm chưa phân công nhân sự có quyền xử lý chủ đề này.'}{' '}
                  Bạn vẫn có thể gửi phiếu; phiếu được lưu và chờ xử lý.
                </p>
              )}
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  void submit();
                }}
              >
                <fieldset className="min-w-0 space-y-4" disabled={busy || uncertain}>
                  <label className="block text-sm font-semibold text-slate-800">
                    Chủ đề
                    <select
                      className="input-field mt-1.5 text-sm"
                      required
                      value={topic}
                      onChange={(e) => setTopic(e.target.value)}
                    >
                      {topics.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.title}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <label htmlFor="support-description" className="text-sm font-semibold text-slate-800">
                        Nội dung yêu cầu
                      </label>
                      <span className="text-xs text-slate-500">
                        {description.trim().length}/10+ ký tự
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {QUICK_ISSUE_PRESETS.map((preset) => (
                        <button
                          key={preset.short}
                          type="button"
                          aria-label={preset.text}
                          onClick={() => setDescription(preset.text)}
                          className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-700 transition hover:border-[#76a35e] hover:bg-[#eef6e8] hover:text-[#2f581c]"
                        >
                          {preset.short}
                        </button>
                      ))}
                    </div>
                    <textarea
                      id="support-description"
                      className="input-field text-sm"
                      required
                      minLength={10}
                      maxLength={2000}
                      rows={4}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Mô tả chi tiết vấn đề, thao tác đã thực hiện (10–2.000 ký tự, không gửi mật khẩu)..."
                    />
                  </div>

                  <SupportAttachmentDropzone
                    compact
                    files={selectedFiles}
                    onChange={(next) => {
                      setAttachmentError('');
                      setSelectedFiles(next);
                    }}
                    disabled={busy || uncertain}
                    externalError={attachmentError}
                  />

                  <label className="flex items-start gap-2.5 pt-1 text-xs text-slate-600">
                    <input
                      className="mt-0.5 shrink-0 accent-[#5f8b48]"
                      required
                      type="checkbox"
                      checked={consent}
                      onChange={(e) => setConsent(e.target.checked)}
                    />
                    <span>
                      Tôi đồng ý lưu và xử lý thông tin cần thiết để giải quyết yêu cầu này.
                    </span>
                  </label>

                  <button
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#5f8b48] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#4d7439] disabled:cursor-not-allowed disabled:opacity-50"
                    type="submit"
                    disabled={!topic || description.trim().length < 10 || !consent || busy}
                  >
                    {busy ? 'Đang gửi…' : 'Gửi yêu cầu'}
                  </button>
                </fieldset>

                {errors.submit && (
                  <p role="alert" className="text-sm text-rose-700">
                    {errors.submit}
                  </p>
                )}
                {uncertain && (
                  <button
                    type="button"
                    className="btn-secondary text-sm"
                    disabled={busy}
                    onClick={() => void submit()}
                  >
                    Thử lại yêu cầu
                  </button>
                )}
                {pendingUploadTicket && selectedFiles.length > 0 && (
                  <button
                    type="button"
                    className="btn-secondary text-sm"
                    disabled={busy}
                    onClick={() => void retryAttachmentUpload()}
                  >
                    Thử tải lại tệp đính kèm
                  </button>
                )}
              </form>
            </>
          )}
        </section>

        <section
          className="min-w-0 space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs"
          aria-labelledby="my-support-tickets"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div>
              <h2 id="my-support-tickets" className="flex items-center gap-2 text-lg font-bold text-slate-900">
                <MessageSquare size={20} className="text-[#5f8b48]" aria-hidden="true" />
                Phiếu của tôi
              </h2>
              <p className="text-xs text-slate-500">
                Nhấn vào từng phiếu để xem lịch sử trao đổi và đính kèm bổ sung
              </p>
            </div>
            {tickets && (
              <div className="flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
                {(
                  [
                    ['ALL', `Tất cả (${stats.total})`],
                    ['OPEN', `Đang mở (${stats.waitingNew + stats.activeProcessing})`],
                    ['CLOSED', `Đã đóng (${stats.closedCount})`],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setStatusFilter(key)}
                    className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                      statusFilter === key
                        ? 'bg-[#5f8b48] text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {tickets && tickets.length > 0 && (
            <label className="relative block">
              <Search
                size={15}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm theo chủ đề hoặc mã phiếu (SE-...)…"
                className="input-field py-2 pl-9 text-sm"
              />
            </label>
          )}

          {errors.tickets ? (
            <p role="alert" className="text-sm text-rose-700">
              {errors.tickets}
            </p>
          ) : !tickets ? (
            <p role="status" className="text-sm text-slate-500">
              Đang tải phiếu của bạn…
            </p>
          ) : !tickets.length ? (
            <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
              <p className="font-medium">Bạn chưa gửi phiếu hỗ trợ nào.</p>
              <p className="mt-1">Phiếu mới và phản hồi của trung tâm sẽ xuất hiện tại đây.</p>
            </div>
          ) : !filteredTickets.length ? (
            <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
              Không tìm thấy phiếu phù hợp với bộ lọc hiện tại.
            </div>
          ) : (
            <ul className="space-y-2.5">
              {filteredTickets.map((t) => (
                <li
                  key={t.id}
                  className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 transition hover:border-[#9dc088]"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h3 className="font-semibold text-slate-900">{t.topic.title}</h3>
                    <span
                      className={`shrink-0 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium ${ticketStatusTone(t.state, t.assigned)}`}
                    >
                      {formatTicketStatusLabel(t.state, t.assigned, 'STUDENT')}
                    </span>
                  </div>
                  <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      {t.createdAt && (
                        <span>
                          {new Intl.DateTimeFormat('vi-VN', {
                            timeZone: 'Asia/Ho_Chi_Minh',
                            dateStyle: 'short',
                            timeStyle: 'short',
                          }).format(new Date(t.createdAt))}
                        </span>
                      )}
                      {(t.attachmentCount ?? 0) > 0 && (
                        <span className="inline-flex items-center gap-1 text-slate-600">
                          <Paperclip size={12} aria-hidden="true" />
                          {t.attachmentCount} tệp
                        </span>
                      )}
                      <span className="font-mono text-[11px] text-slate-400" title={t.reference}>
                        {t.reference.length > 20 ? `${t.reference.slice(0, 14)}…` : t.reference}
                      </span>
                    </div>
                    <Link
                      className="inline-flex items-center gap-1 font-semibold text-[#3f642c] hover:underline"
                      to={'/student/support/tickets/' + t.id}
                    >
                      Xem chi tiết →
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
