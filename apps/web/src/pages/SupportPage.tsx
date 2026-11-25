import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useAuth } from '@/features/auth/auth-context';
import { ApiError } from '@/lib/api-client';
import {
  supportGet,
  supportPost,
  supportUpload,
  type Referral,
  type SupportConfig,
  type TicketDetail,
  type TicketSummary,
  type Topic,
} from '@/features/support/support-api';
import {
  formatTicketStatusLabel,
  MAX_SUPPORT_FILES,
  SupportAttachmentDropzone,
  SupportAttachmentsSection,
  ticketStatusTone,
} from '@/features/support/SupportAttachments';
import { ConfirmDialog, CopyTextButton } from '@/components/ui/Feedback';
import { StudentSupportPage } from '@/features/learner/StudentSupportPage';
const input = 'input-field py-2 text-sm',
  button =
    'inline-flex items-center justify-center rounded bg-[#76a35e] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#658f50] disabled:cursor-not-allowed disabled:opacity-50';
const labels: Record<string, string> = {
  NEW: 'Chờ nhân viên tiếp nhận',
  TRIAGED: 'Đã phân loại',
  IN_PROGRESS: 'Đang xử lý',
  WAITING_CUSTOMER: 'Chờ người gửi',
  WAITING_SPECIALIST: 'Chờ chuyên môn / kỹ thuật',
  RESOLVED: 'Đã giải quyết',
  CLOSED: 'Đã đóng',
  REOPENED: 'Đã mở lại',
  OPEN: 'Chờ phản hồi',
  RESPONDED: 'Đã phản hồi',
};
const technicalCategoryLabels: Record<string, string> = {
  LMS_SUBMISSION_ERROR: 'Lỗi LMS / Nộp bài / Mở tài nguyên',
  PERMISSION_ACCESS: 'Lỗi phân quyền / Không vào được lớp',
  ACCOUNT_LOGIN: 'Lỗi tài khoản / Đăng nhập',
  PAYMENT_SYNC: 'Sai lệch đồng bộ thanh toán / hóa đơn',
  SYSTEM_TECHNICAL: 'Sự cố kỹ thuật hệ thống khác',
};
const technicalStatusLabels: Record<string, string> = {
  OPEN: 'Đang chờ kỹ thuật tiếp nhận',
  ASSIGNED: 'Đã phân công kỹ thuật viên',
  IN_PROGRESS: 'Đang kiểm tra kỹ thuật',
  RESOLVED: 'Đã khắc phục',
  CLOSED: 'Đã đóng',
};
const roleDisplayNames: Record<string, string> = {
  COUNSELOR: 'Tư vấn viên',
  ACADEMIC_MANAGER: 'Quản lý học vụ',
  CASHIER: 'Thu ngân',
  INSTRUCTOR: 'Giảng viên',
  SYSTEM_ADMIN: 'Quản trị hệ thống',
};

function formatSupportText(text?: string | null): string {
  if (!text) return '';
  if (text === 'Support intake consent acknowledged') {
    return 'Học viên đã xác nhận đồng ý tiếp nhận hỗ trợ';
  }
  return text.replace(
    /\[Chuyển sự cố kỹ thuật \(([A-Z_]+)\)\]/g,
    (_, code: string) => `[Chuyển sự cố kỹ thuật · ${technicalCategoryLabels[code] ?? code}]`,
  );
}

function shortTicketCode(reference: string) {
  return reference.length > 20 ? `${reference.slice(0, 14)}…` : reference;
}
const stamp = (s?: string | null) =>
  s
    ? new Intl.DateTimeFormat('vi-VN', {
        dateStyle: 'short',
        timeStyle: 'short',
        timeZone: 'Asia/Ho_Chi_Minh',
      }).format(new Date(s))
    : '—';
function useRequest(onSuccess: () => Promise<void>) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [pending, setPending] = useState(false),
    request = useRef<{ path: string; body: unknown } | null>(null),
    success = useRef(onSuccess);
  useEffect(() => {
    success.current = onSuccess;
  }, [onSuccess]);
  const execute = async (path?: string, body?: unknown) => {
    if (busy) return;
    if (!request.current && path) request.current = { path, body };
    if (!request.current) return;
    setBusy(true);
    setError('');
    setPending(true);
    try {
      await supportPost(request.current.path, request.current.body);
      request.current = null;
      setPending(false);
      try {
        await success.current();
      } catch {
        setError(
          'Đã lưu yêu cầu. Không tải lại được quyền hoặc trạng thái; không gửi yêu cầu mới.',
        );
      }
      return true;
    } catch (e) {
      if (e instanceof ApiError && e.status < 500) {
        const transfer =
          (request.current?.body as { action?: string } | undefined)?.action === 'ASSIGN';
        request.current = null;
        setPending(false);
        setError(
          transfer && e.status === 404
            ? 'Không còn quyền truy cập phiếu. Lần chuyển trước có thể đã được lưu; nhờ người nhận kiểm tra hộp thư. Không tạo phiếu hoặc yêu cầu chuyển mới để thay thế.'
            : e.status === 409
              ? 'Dữ liệu đã đổi. Giữ nội dung đang nhập và tải lại trạng thái trước khi gửi.'
              : e.status === 429
                ? 'Bạn gửi quá nhanh. Vui lòng thử lại sau.'
                : e.status === 401
                  ? 'Phiên đã hết hạn. Vui lòng đăng nhập lại.'
                  : 'Không thể thực hiện: kiểm tra quyền, trạng thái, nội dung và sự đồng ý.',
        );
      } else
        setError(
          'Chưa nhận được xác nhận. Giữ yêu cầu gốc và chọn thử lại; không gửi yêu cầu mới.',
        );
      return false;
    } finally {
      setBusy(false);
    }
  };
  return {
    busy,
    pending,
    error,
    execute,
    notice: (
      <>
        {error && (
          <p role="alert" className="rounded-lg bg-amber-50 p-3 text-amber-900">
            {error}
          </p>
        )}
        {pending && !busy && (
          <button className={button} onClick={() => void execute()}>
            Thử lại đúng yêu cầu
          </button>
        )}
      </>
    ),
  };
}
function Shell({ children, staff = false }: { children: ReactNode; staff?: boolean }) {
  const { user } = useAuth();
  if (!staff && user?.role === 'STUDENT')
    return <main className="workspace-page min-w-0 space-y-5">{children}</main>;
  if (staff) {
    return (
      <div className="mx-auto max-w-[1280px] space-y-5 px-4 py-6 sm:px-6 lg:px-8">
        <div className="min-w-0 space-y-5">{children}</div>
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-[1280px] space-y-5 px-4 py-6 sm:px-6 lg:px-8">
      <nav
        aria-label="Hỗ trợ trực tuyến"
        className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs shadow-sm"
      >
        <span className="mr-2 font-bold tracking-wider text-[#4d7439] uppercase">
          Hỗ trợ của bạn
        </span>
        <Link
          className="rounded-lg bg-[#f4f9f1] px-3 py-1.5 font-semibold text-[#2d581b] transition hover:bg-[#e4f1dc]"
          to="/support"
        >
          Gửi và xem phiếu
        </Link>
        <Link
          to="/workspace"
          className="rounded-lg px-3 py-1.5 font-medium text-slate-700 transition hover:bg-slate-100 hover:text-[#2d581b]"
        >
          Tổng quan
        </Link>
      </nav>
      <div className="min-w-0 space-y-5">{children}</div>
    </div>
  );
}
export function SupportHomePage() {
  const {user}=useAuth();
  return user?.role==='STUDENT'?<StudentSupportPage key={user.id} />:<PublicSupportHomePage />;
}
function PublicSupportHomePage() {
  const { user } = useAuth(),
    [topics, setTopics] = useState<Topic[]>([]),
    [receipt, setReceipt] = useState<{ reference: string; id?: string }>(),
    [error, setError] = useState(''),
    [unavailable, setUnavailable] = useState(false),
    [items, setItems] = useState<TicketSummary[]>([]),
    [topic, setTopic] = useState(''),
    [description, setDescription] = useState(''),
    [name, setName] = useState(''),
    [contact, setContact] = useState(''),
    [consent, setConsent] = useState(false),
    [trap, setTrap] = useState('');
  const load = useCallback(async () => {
    const t = await supportGet<{ topics: Topic[] }>('/public/topics');
    setTopics(t.topics);
    setTopic((v) => v || t.topics[0]?.id || '');
    if (user?.role === 'STUDENT') {
      try {
        setItems((await supportGet<{ items: TicketSummary[] }>('/tickets')).items);
        setUnavailable(false);
      } catch {
        setUnavailable(true);
      }
    }
  }, [user?.role]);
  useEffect(() => {
    let active = true;
    void Promise.resolve()
      .then(load)
      .catch(() => {
        if (active) setError('Kênh CSKH hiện chưa sẵn sàng. Không có thông báo nào được gửi.');
      });
    return () => {
      active = false;
    };
  }, [load]);
  const [busy, setBusy] = useState(false),
    pending = useRef<unknown>(null),
    [retry, setRetry] = useState(false);
  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    pending.current ??= {
      idempotencyKey: crypto.randomUUID(),
      topicId: topic,
      description,
      consent,
      consentVersion: 'DEV_SUPPORT_V1',
      contactMethod: user ? 'IN_APP' : 'EMAIL',
      ...(!user ? { guestName: name, contact } : {}),
      website: trap,
    };
    try {
      setReceipt(await supportPost('/public/tickets', pending.current));
      pending.current = null;
      setRetry(false);
      setDescription('');
      setConsent(false);
      await load();
    } catch (e) {
      if (e instanceof ApiError && e.status < 500) {
        pending.current = null;
        setRetry(false);
        setError(
          e.status === 429
            ? 'Bạn gửi quá nhanh. Vui lòng thử lại sau.'
            : 'Chưa nhận phiếu. Kiểm tra phiên, chủ đề, sự đồng ý và nội dung; không gửi thông tin nhạy cảm.',
        );
      } else {
        setRetry(true);
        setError('Chưa nhận xác nhận. Thử lại cùng yêu cầu, không tạo phiếu mới.');
      }
    } finally {
      setBusy(false);
    }
  };
  return (
    <Shell>
      <h1 className="text-3xl font-bold">Trung tâm hỗ trợ & Tư vấn học tập</h1>
      <p>
        Tiếp nhận và giải đáp các thắc mắc về khóa học, thời khóa biểu, tài khoản và kỹ thuật học
        tập trực tuyến. Vui lòng không chia sẻ mật khẩu hoặc thông tin thẻ thanh toán.
      </p>
      {error && <p role="alert">{error}</p>}
      {unavailable && (
        <section className="workspace-card space-y-3" role="status">
          <h2 className="text-lg font-bold">Gửi yêu cầu trực tuyến chưa khả dụng</h2>
          <p className="text-sm text-slate-600">
            Trung tâm chưa mở kênh gửi phiếu trực tuyến cho tài khoản này. Bạn có thể đặt lịch tư
            vấn để được hỗ trợ về học tập, ghi danh và học phí.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link className="btn-primary text-sm" to="/consultations">
              Đặt lịch tư vấn
            </Link>
            <button type="button" className="btn-secondary text-sm" onClick={() => void load()}>
              Kiểm tra lại
            </button>
          </div>
        </section>
      )}
      {receipt && (
        <section
          role="status"
          className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 space-y-2"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-bold text-emerald-950">Đã nhận phiếu</h2>
            <CopyTextButton
              text={receipt.reference}
              label="Sao chép mã tham chiếu"
              copiedLabel="Đã chép mã phiếu"
            />
          </div>
          <p className="break-all text-sm font-semibold text-emerald-900">
            Mã tham chiếu: {receipt.reference}
          </p>
          {receipt.id ? (
            <Link
              className="inline-flex text-sm font-semibold text-indigo-700 underline"
              to={'/support/tickets/' + receipt.id}
            >
              Xem phiếu của tôi
            </Link>
          ) : (
            <p className="text-xs text-emerald-900">
              Mã chỉ xác nhận đã tiếp nhận, không cho phép tra cứu nội dung. Liên hệ chưa được xác
              minh; chưa gửi email/SMS. Tư vấn viên sẽ xử lý nội bộ.
            </p>
          )}
        </section>
      )}
      {!unavailable && (!user || user.role === 'STUDENT') ? (
        <form
          className="space-y-4 rounded-xl border p-5"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <fieldset disabled={busy || retry} className="space-y-4">
            <label className="block">
              Chủ đề
              <select
                required
                aria-label="Chủ đề"
                className={input}
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
            {!user && (
              <>
                <label className="block">
                  Tên liên hệ
                  <input
                    aria-label="Tên liên hệ"
                    required
                    minLength={2}
                    maxLength={100}
                    className={input}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
                <label className="block">
                  Email liên hệ
                  <input
                    aria-label="Email liên hệ"
                    required
                    type="email"
                    maxLength={160}
                    className={input}
                    value={contact}
                    onChange={(e) => setContact(e.target.value)}
                  />
                </label>
                <p>Liên hệ tự khai không đồng nghĩa đã xác minh quyền sở hữu.</p>
              </>
            )}
            <label className="block">
              Nội dung
              <textarea
                aria-label="Nội dung yêu cầu"
                required
                minLength={10}
                maxLength={2000}
                rows={5}
                className={input}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>
            <div aria-hidden="true" className="hidden">
              <label>
                Website
                <input
                  tabIndex={-1}
                  autoComplete="off"
                  value={trap}
                  onChange={(e) => setTrap(e.target.value)}
                />
              </label>
            </div>
            <label className="flex gap-2">
              <input
                required
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
              />
              Tôi đồng ý lưu và xử lý thông tin tối thiểu để hỗ trợ yêu cầu này.
            </label>
            <button className={button} disabled={!topic || !consent || busy} type="submit">
              Gửi phiếu CSKH
            </button>
          </fieldset>
          {retry && (
            <button type="button" className={button} onClick={() => void submit()}>
              Thử lại đúng yêu cầu
            </button>
          )}
        </form>
      ) : user && user.role !== 'STUDENT' ? (
        <section className="workspace-card space-y-3">
          <h2 className="text-lg font-bold text-slate-950">
            Khu vực xử lý phiếu hỗ trợ dành cho nhân sự
          </h2>
          <p className="text-sm text-slate-600">
            Cổng tiếp nhận phiếu trực tuyến chỉ dành cho học viên và khách vãng lai. Giảng viên và
            nhân sự nghiệp vụ theo dõi, phản hồi phiếu chuyển chuyên môn trong không gian làm việc.
          </p>
          <div>
            <Link
              to="/workspace/support"
              className="btn-primary inline-flex items-center px-4 py-2 text-sm"
            >
              Mở không gian quản lý CSKH
            </Link>
          </div>
        </section>
      ) : null}
      {user?.role === 'STUDENT' && !unavailable && (
        <section>
          <h2 className="text-xl font-bold">Phiếu của tôi</h2>
          <TicketList items={items} staff={false} />
        </section>
      )}
    </Shell>
  );
}
function TicketList({
  items,
  staff,
  onAssign,
}: {
  items: TicketSummary[];
  staff: boolean;
  onAssign?: (t: TicketSummary) => void;
}) {
  return (
    <div className="space-y-3">
      {!items.length && (
        <p className="rounded border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          Chưa có phiếu trong phạm vi được phép.
        </p>
      )}
      {items.map((t) => (
        <article
          key={t.id}
          className="flex flex-col gap-3 rounded-md border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="break-all font-mono text-sm font-bold text-slate-900" title={t.reference}>
                {shortTicketCode(t.reference)}
              </h3>
              <span
                className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${ticketStatusTone(t.state, t.assigned)}`}
              >
                {formatTicketStatusLabel(t.state, t.assigned, staff ? 'STAFF' : 'STUDENT')}
              </span>
              {(t.attachmentCount ?? 0) > 0 && (
                <span className="inline-flex rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                  {t.attachmentCount} tệp đính kèm
                </span>
              )}
            </div>
            {t.title && <p className="text-sm font-medium text-slate-800">{t.title}</p>}
            <p className="text-xs text-slate-600">
              {t.topic.title} · Tạo lúc {stamp(t.createdAt)} ·{' '}
              {t.assigned ? 'Đã phân công cho bạn' : 'Chưa có người nhận'}
            </p>
          </div>
          {staff && !t.assigned ? (
            <button className={button} onClick={() => onAssign?.(t)}>
              Nhận phiếu
            </button>
          ) : (
            <Link
              className="inline-flex shrink-0 items-center rounded border border-[#76a35e] bg-[#f4f9f1] px-3 py-1.5 text-xs font-semibold text-[#2d581b] transition hover:bg-[#76a35e] hover:text-white"
              to={(staff ? '/workspace/support/tickets/' : '/support/tickets/') + t.id}
            >
              Mở phiếu
            </Link>
          )}
        </article>
      ))}
    </div>
  );
}

const capLabelMap: Record<string, string> = {
  'support.ticket.read': 'Đọc phiếu',
  'support.ticket.assign': 'Nhận / phân công phiếu',
  'support.ticket.reply': 'Phản hồi phiếu',
  'support.ticket.transfer': 'Chuyển phiếu / chuyên môn / kỹ thuật',
  'support.ticket.close': 'Đổi trạng thái / đóng phiếu',
};

const referralCategoryLabels: Record<string, string> = {
  LEARNING: 'Học tập & Chuyên môn',
  ACADEMIC: 'Học vụ & Lịch học',
  FINANCE: 'Học phí & Biên nhận',
  TECHNICAL: 'Kỹ thuật hệ thống',
};

export function SupportWorkspacePage() {
  const { user } = useAuth(),
    [config, setConfig] = useState<SupportConfig>(),
    [items, setItems] = useState<TicketSummary[]>([]),
    [refs, setRefs] = useState<Referral[]>([]),
    [filter, setFilter] = useState(''),
    [ownerFilter, setOwnerFilter] = useState<'ALL' | 'MINE' | 'UNASSIGNED'>('ALL'),
    [searchQuery, setSearchQuery] = useState(''),
    [reason, setReason] = useState(''),
    [claimTarget, setClaimTarget] = useState<{ ticket: TicketSummary; note: string } | null>(null),
    [refReasons, setRefReasons] = useState<Record<string, string>>({}),
    [replies, setReplies] = useState<Record<string, string>>({}),
    [code, setCode] = useState(''),
    [title, setTitle] = useState(''),
    [route, setRoute] = useState('LEARNING'),
    [error, setError] = useState('');
  const load = useCallback(async () => {
    const c = await supportGet<SupportConfig>('/config');
    setConfig(c);
    if (c.role === 'COUNSELOR') {
      const tRes = await supportGet<{ items: TicketSummary[] }>(
        '/tickets' + (filter ? '?state=' + filter : ''),
      ).catch(() => ({ items: [] as TicketSummary[] }));
      setItems(tRes.items);
    } else {
      setRefs((await supportGet<{ items: Referral[] }>('/referrals')).items);
    }
  }, [filter]);
  useEffect(() => {
    void Promise.resolve()
      .then(load)
      .catch(() => setError('Không tải được phạm vi xử lý. Vui lòng kiểm tra phiên và quyền.'));
  }, [load]);
  const req = useRequest(load),
    cmd = (v: number, customReason?: string) => ({
      idempotencyKey: crypto.randomUUID(),
      expectedLockVersion: v,
      reason: customReason ?? reason,
    }),
    disabled = req.busy || req.pending;
  const isCounselor = config?.role === 'COUNSELOR';
  const showSharedReasonBox =
    Boolean(config?.taxonomyAuthor) ||
    Boolean(config?.taxonomyApprove && config.taxonomy.some((t) => !t.approvedById && t.authorId !== user?.id));
  const mineCount = items.filter((t) => t.assigned).length;
  const unassignedCount = items.filter((t) => !t.assigned).length;
  const qLower = searchQuery.trim().toLowerCase();
  const visibleItems = items.filter((t) => {
    if (ownerFilter === 'MINE' && !t.assigned) return false;
    if (ownerFilter === 'UNASSIGNED' && t.assigned) return false;
    if (!qLower) return true;
    return (
      t.reference.toLowerCase().includes(qLower) ||
      (t.title ?? '').toLowerCase().includes(qLower) ||
      t.topic.title.toLowerCase().includes(qLower)
    );
  });

  if (!config && !error) {
    return (
      <Shell staff>
        <div className="workspace-card p-6 text-sm text-slate-600">
          Đang tải hàng đợi phiếu hỗ trợ…
        </div>
      </Shell>
    );
  }

  return (
    <Shell staff>
      <header className="workspace-header flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <span className="badge-info">
            {isCounselor ? 'Bộ phận Tư vấn & CSKH' : 'Phối hợp chuyên môn hỗ trợ'}
          </span>
          <h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
            {isCounselor
              ? 'Hàng đợi xử lý phiếu hỗ trợ học viên'
              : 'Phiếu hỗ trợ được chuyển chuyên môn'}
          </h1>
          <p className="max-w-3xl text-sm text-slate-600">
            {isCounselor
              ? 'Tiếp nhận, phản hồi, chuyển chuyên môn hoặc báo sự cố kỹ thuật trong phạm vi chủ đề được phân quyền.'
              : 'Xem và phản hồi ý kiến chuyên môn cho các phiếu hỗ trợ học viên mà Tư vấn viên đã chuyển sang bạn.'}
          </p>
        </div>
        <button
          className="btn-secondary px-3.5 py-2 text-sm"
          disabled={disabled}
          onClick={() => void load().catch(() => setError('Không tải lại được dữ liệu'))}
        >
          Tải lại dữ liệu
        </button>
      </header>
      {error && (
        <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
          {error}
        </p>
      )}
      {req.notice}
      {isCounselor && config && (
        <section
          aria-label="Quyền xử lý theo chủ đề"
          className={`rounded-xl border p-4 text-xs ${
            config.topics.length
              ? 'border-[#b9d4ab] bg-[#f4f9f1] text-slate-800'
              : 'border-amber-300 bg-amber-50 text-amber-950'
          }`}
        >
          {config.topics.length ? (
            <div className="space-y-2">
              <p className="font-bold">Chủ đề được cấp quyền còn hiệu lực ({config.topics.length})</p>
              <ul className="space-y-1.5">
                {config.topics.map((tp) => (
                  <li key={tp.id} className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-[#2d581b]">{tp.title}</span>
                    {(tp.caps ?? []).map((cap) => (
                      <span
                        key={cap}
                        className="rounded border border-[#b9d4ab] bg-white px-2 py-0.5 text-[11px] font-medium text-slate-700"
                      >
                        {capLabelMap[cap] ?? cap}
                      </span>
                    ))}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="space-y-1">
              <p className="font-bold">Chưa có quyền xử lý theo chủ đề còn hiệu lực</p>
              <p>
                Hiện tài khoản Tư vấn viên chưa được cấp quyền xử lý chủ đề hỗ trợ còn hạn. Vui
                lòng liên hệ Quản trị hệ thống kích hoạt quyền theo chủ đề.
              </p>
            </div>
          )}
        </section>
      )}
      {showSharedReasonBox && (
        <div className="workspace-card space-y-1.5">
          <label className="block text-xs font-bold text-slate-700">
            {config?.taxonomyAuthor || config?.taxonomyApprove
              ? 'Lý do thao tác (tối thiểu 10 ký tự — dùng khi nhận phiếu hoặc phê duyệt danh mục)'
              : 'Lý do tiếp nhận phiếu (tối thiểu 10 ký tự)'}
            <input
              aria-label="Lý do thao tác"
              minLength={10}
              maxLength={500}
              className={`${input} mt-1`}
              placeholder="Ví dụ: Tiếp nhận phiếu tư vấn khóa TOEIC 650+ theo yêu cầu học viên"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
        </div>
      )}
      {isCounselor && (
        <section className="workspace-card space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-xl font-bold text-slate-950">Hộp phiếu CSKH</h2>
              <div className="inline-flex overflow-hidden rounded-lg border border-slate-300 text-xs font-semibold">
                {(
                  [
                    ['ALL', `Tất cả (${items.length})`],
                    ['MINE', `Của tôi (${mineCount})`],
                    ['UNASSIGNED', `Chờ tiếp nhận (${unassignedCount})`],
                  ] as const
                ).map(([key, label], idx) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setOwnerFilter(key)}
                    className={`px-3 py-1.5 ${idx > 0 ? 'border-l border-slate-300' : ''} ${
                      ownerFilter === key
                        ? 'bg-[#76a35e] text-white'
                        : 'bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="search"
                aria-label="Tìm kiếm phiếu hỗ trợ"
                placeholder="Tìm mã phiếu, nội dung, chủ đề..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs min-w-[240px]"
              />
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                Lọc trạng thái
                <select
                  aria-label="Lọc trạng thái"
                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-normal"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                >
                  <option value="">Tất cả trong phạm vi</option>
                  {[
                    'NEW',
                    'IN_PROGRESS',
                    'WAITING_CUSTOMER',
                    'WAITING_SPECIALIST',
                    'RESOLVED',
                    'CLOSED',
                    'REOPENED',
                  ].map((s) => (
                    <option key={s} value={s}>
                      {s === 'WAITING_SPECIALIST' ? 'Chờ phản hồi chuyên môn / kỹ thuật' : labels[s]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
          <TicketList
            items={visibleItems}
            staff
            onAssign={(t) => {
              if (reason.trim().length >= 10) {
                void req.execute('/tickets/' + t.id + '/actions', {
                  ...cmd(t.lockVersion),
                  action: 'ASSIGN',
                  targetId: user!.id,
                });
                return;
              }
              setClaimTarget({
                ticket: t,
                note: `Tiếp nhận phiếu ${shortTicketCode(t.reference)} để hỗ trợ học viên.`,
              });
            }}
          />
        </section>
      )}
      {claimTarget && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Xác nhận nhận phiếu hỗ trợ"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
        >
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl space-y-3 text-xs">
            <h3 className="text-base font-bold text-[#2f5d1e]">
              Nhận xử lý phiếu {shortTicketCode(claimTarget.ticket.reference)}
            </h3>
            <p className="text-slate-600">
              Chủ đề: <strong>{claimTarget.ticket.topic.title}</strong>
            </p>
            {claimTarget.ticket.title && (
              <p className="rounded border border-slate-200 bg-slate-50 p-2.5 text-slate-700">
                {claimTarget.ticket.title}
              </p>
            )}
            <label className="block space-y-1 font-semibold text-slate-700">
              <span>Lý do / Ghi chú tiếp nhận (tối thiểu 10 ký tự)</span>
              <input
                type="text"
                minLength={10}
                maxLength={500}
                className={input}
                value={claimTarget.note}
                onChange={(e) =>
                  setClaimTarget((prev) => (prev ? { ...prev, note: e.target.value } : null))
                }
              />
            </label>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setClaimTarget(null)}
                className="rounded border border-slate-300 px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-50"
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={disabled || claimTarget.note.trim().length < 10}
                onClick={() => {
                  const target = claimTarget;
                  setClaimTarget(null);
                  void req.execute('/tickets/' + target.ticket.id + '/actions', {
                    ...cmd(target.ticket.lockVersion, target.note.trim()),
                    action: 'ASSIGN',
                    targetId: user!.id,
                  });
                }}
                className={button}
              >
                Xác nhận nhận phiếu
              </button>
            </div>
          </div>
        </div>
      )}
      {!isCounselor && (
        <section id="referrals" className="workspace-card space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-lg font-bold text-slate-950">
              Phiếu hỗ trợ chuyển chuyên môn ({refs.length})
            </h2>
            <p className="text-xs text-slate-500">
              Các yêu cầu từ học viên có câu hỏi chuyên sâu được Tư vấn viên chuyển sang để bạn cho
              ý kiến chuyên môn
            </p>
          </div>
        </div>
        {!refs.length && (
          <div className="workspace-subcard space-y-1 bg-slate-50/70 text-sm text-slate-600">
            <p className="font-semibold text-slate-800">
              Hiện chưa có phiếu hỗ trợ nào được chuyển cho bạn.
            </p>
            <p className="text-xs">
              Khi bộ phận CSKH gặp câu hỏi cần xác nhận về học tập, lịch học hoặc nội dung lớp từ
              học viên, phiếu sẽ xuất hiện ngay tại đây để bạn phản hồi trực tiếp.
            </p>
          </div>
        )}
        {refs.map((r) => {
          const itemReason = (refReasons[r.id] ?? '').trim();
          const replyText = (replies[r.id] ?? '').trim();
          return (
            <article key={r.id} className="workspace-subcard space-y-3 bg-white">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="badge-info">
                  {referralCategoryLabels[r.category] ?? r.category}
                </span>
                <span className="badge-pending">{labels[r.state] ?? r.state}</span>
              </div>
              <p className="whitespace-pre-wrap text-sm text-slate-800">{r.summary}</p>
              {r.response ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 text-sm text-emerald-950">
                  <span className="block text-xs font-semibold">Ý kiến đã gửi</span>
                  <p className="mt-1">{r.response}</p>
                </div>
              ) : (
                <div className="space-y-2.5 border-t border-slate-100 pt-3">
                  <label className="block space-y-1 text-xs font-semibold text-slate-700">
                    <span>Ý kiến chuyên môn gửi lại tư vấn viên</span>
                    <textarea
                      aria-label={'Ý kiến ' + r.id}
                      className={input}
                      rows={2}
                      maxLength={1500}
                      placeholder="Nhập giải đáp chuyên môn để CSKH phản hồi lại học viên..."
                      value={replies[r.id] ?? ''}
                      onChange={(e) => setReplies((v) => ({ ...v, [r.id]: e.target.value }))}
                    />
                  </label>
                  <label className="block space-y-1 text-xs font-semibold text-slate-700">
                    <span>Ghi chú xác nhận phản hồi (tối thiểu 10 ký tự)</span>
                    <input
                      className={input}
                      minLength={10}
                      maxLength={500}
                      placeholder="Ví dụ: Đã kiểm tra chương trình lớp và xác nhận hướng giải đáp"
                      value={refReasons[r.id] ?? ''}
                      onChange={(e) => setRefReasons((v) => ({ ...v, [r.id]: e.target.value }))}
                    />
                  </label>
                  <button
                    className={button}
                    disabled={disabled || !replyText || itemReason.length < 10}
                    onClick={() =>
                      void req.execute('/referrals/' + r.id + '/respond', {
                        ...cmd(r.lockVersion, itemReason),
                        response: replyText,
                      })
                    }
                  >
                    Gửi ý kiến cho tư vấn viên
                  </button>
                </div>
              )}
            </article>
          );
        })}
        </section>
      )}
      {(config?.taxonomyAuthor || config?.taxonomyApprove) && (
        <section className="workspace-card space-y-4">
          <h2 className="text-lg font-bold text-slate-950">Danh mục chủ đề hỗ trợ có phiên bản</h2>
          {config.taxonomyAuthor && (
            <form
              className="grid gap-3 md:grid-cols-3"
              onSubmit={(e) => {
                e.preventDefault();
                void req.execute('/topics', {
                  idempotencyKey: crypto.randomUUID(),
                  code,
                  title,
                  routes: [route],
                  reason,
                });
              }}
            >
              <label className="block space-y-1 text-xs font-semibold text-slate-700">
                <span>Mã chủ đề</span>
                <input
                  aria-label="Mã chủ đề"
                  className={input}
                  required
                  pattern="[A-Z][A-Z0-9_]{2,39}"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
              </label>
              <label className="block space-y-1 text-xs font-semibold text-slate-700">
                <span>Tên chủ đề</span>
                <input
                  aria-label="Tên chủ đề"
                  className={input}
                  minLength={3}
                  maxLength={120}
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </label>
              <label className="block space-y-1 text-xs font-semibold text-slate-700">
                <span>Tuyến chuyên môn</span>
                <select
                  aria-label="Tuyến chuyên môn"
                  className={input}
                  value={route}
                  onChange={(e) => setRoute(e.target.value)}
                >
                  <option value="LEARNING">Giảng viên · học tập</option>
                  <option value="ACADEMIC">Học vụ · lớp/lịch</option>
                  <option value="FINANCE">Thu ngân · vấn đề biên nhận</option>
                </select>
              </label>
              <div className="md:col-span-3">
                <button className={button} disabled={disabled || reason.trim().length < 10}>
                  Lưu chủ đề nháp
                </button>
              </div>
            </form>
          )}
          {config.taxonomy.map((t) => (
            <article className="workspace-subcard flex flex-wrap items-center justify-between gap-2 bg-white" key={t.id}>
              <p className="text-sm font-medium text-slate-800">
                {t.title} v{t.version} · {t.approvedById ? 'Đã duyệt' : 'Chờ duyệt'}
              </p>
              {!t.approvedById && config.taxonomyApprove && t.authorId !== user?.id && (
                <button
                  className={button}
                  disabled={disabled || reason.trim().length < 10}
                  onClick={() => void req.execute('/topics/' + t.id + '/approve', cmd(0))}
                >
                  Duyệt chủ đề độc lập
                </button>
              )}
            </article>
          ))}
        </section>
      )}
    </Shell>
  );
}
export function SupportTicketPage() {
  const { ticketId = '' } = useParams(),
    { user } = useAuth(),
    navigate = useNavigate(),
    [t, setT] = useState<TicketDetail>(),
    [cfg, setCfg] = useState<SupportConfig>(),
    [people, setPeople] = useState<
      {
        id: string;
        fullName: string;
        role: string;
        canReferral: boolean;
      }[]
    >([]),
    [admins, setAdmins] = useState<
      { id: string; fullName: string; role: string; email?: string }[]
    >([]),
    [error, setError] = useState(''),
    [reason, setReason] = useState(''),
    [body, setBody] = useState(''),
    [visibility, setVisibility] = useState('PUBLIC'),
    [target, setTarget] = useState(''),
    [specialist, setSpecialist] = useState(''),
    [category, setCategory] = useState('LEARNING'),
    [summary, setSummary] = useState(''),
    [incidentCategory, setIncidentCategory] = useState('LMS_SUBMISSION_ERROR'),
    [escSummary, setEscSummary] = useState(''),
    [escRoute, setEscRoute] = useState(''),
    [escAccountEmail, setEscAccountEmail] = useState(''),
    [escAdminId, setEscAdminId] = useState(''),
    [extraFiles, setExtraFiles] = useState<File[]>([]),
    [extraUploadBusy, setExtraUploadBusy] = useState(false),
    [extraUploadError, setExtraUploadError] = useState(''),
    [confirmCloseOpen, setConfirmCloseOpen] = useState(false);
  const learner = user?.role === 'STUDENT',
    load = useCallback(async () => {
      const detail = await supportGet<TicketDetail>('/tickets/' + ticketId).catch((e) => {
        if (e instanceof ApiError && [401, 403, 404].includes(e.status)) setT(undefined);
        throw e;
      });
      setT(detail);
      if (detail.topic.routes?.length) {
        setCategory((prev) =>
          detail.topic.routes.includes(prev) ? prev : detail.topic.routes[0],
        );
      }
      setError('');
      if (!learner) {
        setEscAccountEmail((prev) => prev || detail.identity?.learnerEmail || '');
        if (user?.role !== 'SYSTEM_ADMIN') {
          setCfg(await supportGet<SupportConfig>('/config'));
          const p = await supportGet<{
            people: typeof people;
            admins?: typeof admins;
          }>('/tickets/' + ticketId + '/assignable').catch(() => ({ people: [], admins: [] }));
          setPeople(p.people);
          setAdmins(p.admins ?? []);
        }
      }
    }, [ticketId, learner, user?.role]);
  useEffect(() => {
    void Promise.resolve()
      .then(load)
      .catch(() => {
        setT(undefined);
        setError(
          'Phiếu không có trong phạm vi hoặc phiên đã hết hạn. Nội dung riêng tư không được hiển thị.',
        );
      });
  }, [load]);
  const req = useRequest(load),
    disabled = req.busy || req.pending,
    cmd = (v = t?.lockVersion ?? 0) => ({
      idempotencyKey: crypto.randomUUID(),
      expectedLockVersion: v,
      reason,
    }),
    caps = cfg?.topics.find((x) => x.code === t?.topic.code)?.caps ?? [];
  if (!t)
    return (
      <Shell staff={!learner}>
        <h1 className="text-2xl font-bold text-[#e66f2b]">Phiếu CSKH</h1>
        <p role={error ? 'alert' : 'status'}>{error || 'Đang tải phiếu…'}</p>
      </Shell>
    );
  const act = (state: string, overrideReason?: string) =>
    void req.execute('/tickets/' + ticketId + '/actions', {
      ...cmd(),
      reason: overrideReason ?? reason,
      action: 'TRANSITION',
      state,
    });
  if (learner) {
    const learnerTransitions =
      t.state === 'RESOLVED' ? ['CLOSED', 'REOPENED'] : t.state === 'CLOSED' ? ['REOPENED'] : [];
    const effectiveActionReason = (state: string) =>
      reason.trim().length >= 10
        ? reason.trim()
        : state === 'CLOSED'
          ? 'Học viên xác nhận đóng phiếu sau khi đã được hỗ trợ.'
          : 'Học viên yêu cầu mở lại phiếu để được hỗ trợ thêm.';
    return (
      <Shell staff={false}>
        <div className="space-y-4">
          <Link
            to="/student/support"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#4d7439] hover:underline"
          >
            ← Quay lại Hỗ trợ học viên
          </Link>

          <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-4">
            <div className="min-w-0 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
                  {t.topic.title}
                </h1>
                <span
                  className={`inline-flex shrink-0 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium ${ticketStatusTone(t.state, t.assigned)}`}
                >
                  {formatTicketStatusLabel(t.state, t.assigned, 'STUDENT')}
                </span>
              </div>
              <p className="font-mono text-xs text-slate-500" title={t.reference}>
                Mã phiếu: {shortTicketCode(t.reference)}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <CopyTextButton
                text={t.reference}
                label="Sao chép mã"
                copiedLabel="Đã chép"
              />
              <button
                type="button"
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                disabled={disabled}
                onClick={() => void load().catch(() => setError('Không tải lại được dữ liệu.'))}
              >
                Tải lại trạng thái
              </button>
            </div>
          </header>

          {error && (
            <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
              {error}
            </p>
          )}
          {req.notice}

          <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1.45fr)_330px]">
            <div className="min-w-0 space-y-5">
              <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-5">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                  Nội dung yêu cầu
                </h2>
                <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-800">
                  {t.description}
                </p>
                <SupportAttachmentsSection ticketId={t.id} attachments={t.attachments ?? []} />
              </section>

              <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
                <h2 className="text-base font-bold text-slate-900">Trao đổi</h2>
                {t.messages.length === 0 ? (
                  <p className="rounded-lg bg-slate-50 px-3.5 py-2.5 text-xs text-slate-500">
                    Chưa có phản hồi mới. Bạn có thể gửi thêm thông tin hoặc ảnh minh họa bên dưới.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {t.messages.map((m) => {
                      const fromLearner = m.from === 'LEARNER';
                      return (
                        <article
                          key={m.id}
                          className={`rounded-2xl border p-3.5 text-sm ${
                            fromLearner
                              ? 'ml-auto max-w-[92%] border-[#cde0c0] bg-[#f4f9f1]'
                              : 'mr-auto max-w-[92%] border-slate-200 bg-slate-50/70'
                          }`}
                        >
                          <p className="text-xs font-semibold text-slate-600">
                            {fromLearner ? 'Bạn' : 'Nhân viên hỗ trợ'} · {stamp(m.createdAt)}
                          </p>
                          <p className="mt-1 whitespace-pre-wrap break-words leading-relaxed text-slate-800">
                            {m.body}
                          </p>
                        </article>
                      );
                    })}
                  </div>
                )}

                {t.state !== 'CLOSED' ? (
                  <form
                    className="space-y-3 border-t border-slate-100 pt-4"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const trimmed = body.trim();
                      const effectiveReason =
                        reason.trim().length >= 10
                          ? reason.trim()
                          : trimmed.length >= 10
                            ? trimmed.slice(0, 500)
                            : `Học viên phản hồi: ${trimmed}`.padEnd(10, '.');
                      void req.execute('/tickets/' + ticketId + '/messages', {
                        ...cmd(),
                        reason: effectiveReason,
                        body,
                        visibility: 'PUBLIC',
                      });
                    }}
                  >
                    <label className="block text-sm font-semibold text-slate-800">
                      Nội dung phản hồi
                      <textarea
                        aria-label="Nội dung phản hồi"
                        className={input + ' mt-1.5 text-sm'}
                        required
                        maxLength={2000}
                        rows={3}
                        placeholder="Nhập nội dung bạn muốn trao đổi thêm với bộ phận hỗ trợ…"
                        value={body}
                        onChange={(e) => setBody(e.target.value)}
                      />
                    </label>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs text-slate-400">
                        Phản hồi được lưu trực tiếp trong lịch sử phiếu.
                      </span>
                      <button
                        className="rounded-lg bg-[#5f8b48] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#4d7439] disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={disabled || body.trim().length === 0}
                      >
                        Lưu phản hồi
                      </button>
                    </div>
                  </form>
                ) : (
                  <p className="rounded-lg bg-slate-50 px-3.5 py-2.5 text-xs text-slate-500">
                    Phiếu đã đóng. Nếu vấn đề phát sinh lại, bạn có thể bấm “Mở lại” ở cột bên phải.
                  </p>
                )}

                {t.state !== 'CLOSED' && (t.attachments?.length ?? 0) < MAX_SUPPORT_FILES && (
                  <div className="space-y-2 border-t border-slate-100 pt-3">
                    <SupportAttachmentDropzone
                      compact
                      files={extraFiles}
                      maxFiles={Math.max(1, MAX_SUPPORT_FILES - (t.attachments?.length ?? 0))}
                      disabled={disabled || extraUploadBusy}
                      externalError={extraUploadError}
                      onChange={(next) => {
                        setExtraUploadError('');
                        setExtraFiles(next);
                      }}
                    />
                    {extraFiles.length > 0 && (
                      <button
                        type="button"
                        className="rounded-lg border border-[#76a35e] bg-[#f4f9f1] px-3 py-1.5 text-xs font-semibold text-[#2f581c] hover:bg-[#eef6e8] disabled:opacity-50"
                        disabled={disabled || extraUploadBusy}
                        onClick={() => {
                          setExtraUploadBusy(true);
                          setExtraUploadError('');
                          void supportUpload(`/tickets/${t.id}/attachments`, extraFiles)
                            .then(async () => {
                              setExtraFiles([]);
                              await load();
                            })
                            .catch((err) => {
                              setExtraUploadError(
                                err instanceof ApiError &&
                                  typeof (err.body as { message?: string } | undefined)?.message === 'string'
                                  ? (err.body as { message: string }).message
                                  : 'Không tải lên được tệp đính kèm. Kiểm tra định dạng PNG/JPG/WEBP/PDF/DOCX và dung lượng <= 10 MB.',
                              );
                            })
                            .finally(() => setExtraUploadBusy(false));
                        }}
                      >
                        {extraUploadBusy ? 'Đang tải tệp…' : `Tải lên ${extraFiles.length} tệp đính kèm`}
                      </button>
                    )}
                  </div>
                )}
              </section>
            </div>

            <aside className="min-w-0 space-y-4">
              {(t.technicalEscalations?.length ?? 0) > 0 && (
                <section
                  aria-label="Trạng thái chuyển sự cố kỹ thuật"
                  className="space-y-2.5 rounded-xl border border-sky-200 bg-sky-50/40 p-4"
                >
                  <h2 className="text-sm font-bold text-slate-900">Theo dõi xử lý kỹ thuật</h2>
                  <div className="space-y-2">
                    {t.technicalEscalations!.map((esc) => (
                      <article
                        key={esc.id}
                        className="space-y-1.5 rounded-lg border border-sky-200 bg-white p-3 text-xs"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-1.5">
                          <span className="font-semibold text-slate-900">
                            {technicalCategoryLabels[esc.incidentCategory] ?? esc.incidentCategory}
                          </span>
                          <span className="shrink-0 whitespace-nowrap rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-900">
                            {technicalStatusLabels[esc.status] ?? esc.status}
                          </span>
                        </div>
                        <p className="leading-relaxed text-slate-700">{esc.summary}</p>
                        {esc.resolutionNote && (
                          <p className="rounded bg-emerald-50 px-2.5 py-1.5 text-emerald-950">
                            <strong>Phản hồi ({esc.resolvedByName ?? esc.assignedAdminName ?? 'Kỹ thuật'}):</strong>{' '}
                            {esc.resolutionNote}
                          </p>
                        )}
                      </article>
                    ))}
                  </div>
                </section>
              )}

              <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
                <h2 className="text-sm font-bold text-slate-900">Trạng thái và lịch sử</h2>

                {learnerTransitions.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {learnerTransitions.map((s) => (
                      <button
                        key={s}
                        type="button"
                        className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-100 disabled:opacity-50"
                        disabled={disabled}
                        onClick={() =>
                          s === 'CLOSED'
                            ? setConfirmCloseOpen(true)
                            : act(s, effectiveActionReason(s))
                        }
                      >
                        {labels[s]}
                      </button>
                    ))}
                  </div>
                )}

                <details className="rounded-lg border border-slate-100 bg-slate-50/70 px-3 py-2 text-xs text-slate-600">
                  <summary className="cursor-pointer font-medium text-slate-700">
                    Ghi chú lý do đóng / mở lại phiếu (tùy chọn)
                  </summary>
                  <label className="mt-2 block text-xs text-slate-700">
                    Tóm tắt / lý do thao tác
                    <input
                      aria-label="Lý do thao tác"
                      className={input + ' mt-1 text-xs'}
                      minLength={10}
                      maxLength={500}
                      placeholder="Nhập lý do chi tiết nếu muốn đóng hoặc mở lại phiếu…"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                    />
                  </label>
                </details>

                <ol className="space-y-2.5 border-l-2 border-slate-100 pl-3 text-xs">
                  {t.events.map((e) => (
                    <li key={e.id} className="relative space-y-0.5">
                      <span
                        aria-hidden="true"
                        className="absolute -left-[17px] top-1.5 h-2 w-2 rounded-full bg-[#5f8b48]"
                      />
                      <p className="font-semibold text-slate-800">{e.label}</p>
                      <p className="text-[11px] text-slate-500">{stamp(e.createdAt)}</p>
                      {e.reason && (
                        <p className="text-[11px] italic text-slate-600">{e.reason}</p>
                      )}
                    </li>
                  ))}
                </ol>
              </section>
            </aside>
          </div>

          <ConfirmDialog
            open={confirmCloseOpen}
            title="Đóng phiếu hỗ trợ?"
            description="Phiếu sẽ chuyển sang trạng thái Đã đóng và có thể mở lại nếu bạn cần hỗ trợ thêm."
            confirmLabel="Xác nhận đóng phiếu"
            cancelLabel="Ở lại"
            tone="warning"
            busy={disabled}
            onCancel={() => setConfirmCloseOpen(false)}
            onConfirm={() => {
              setConfirmCloseOpen(false);
              act('CLOSED', effectiveActionReason('CLOSED'));
            }}
          >
            <p className="text-xs text-slate-600">
              Mã phiếu: <strong>{shortTicketCode(t.reference)}</strong>
            </p>
          </ConfirmDialog>
        </div>
      </Shell>
    );
  }
  return (
    <Shell staff={!learner}>
      <div>
        <Link
          to={
            user?.role === 'SYSTEM_ADMIN'
              ? '/workspace/operations#technical-escalations'
              : user?.role === 'COUNSELOR'
                ? '/workspace/support'
                : '/workspace'
          }
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#4d7439] hover:underline"
        >
          {user?.role === 'SYSTEM_ADMIN'
            ? '← Quay lại Hàng đợi sự cố kỹ thuật'
            : '← Quay lại Hàng đợi phiếu hỗ trợ'}
        </Link>
      </div>
      <header className="rounded-md border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="break-all text-2xl font-bold text-[#e66f2b]" title={t.reference}>
              Phiếu {shortTicketCode(t.reference)}
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              {t.topic.title} ·{' '}
              <span
                className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${ticketStatusTone(t.state, t.assigned)}`}
              >
                {formatTicketStatusLabel(t.state, t.assigned, learner ? 'STUDENT' : 'STAFF')}
              </span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <CopyTextButton
              text={t.reference}
              label="Sao chép mã phiếu"
              copiedLabel="Đã chép mã phiếu"
            />
            <button
              type="button"
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              disabled={disabled}
              onClick={() => void load().catch(() => setError('Không tải lại được dữ liệu.'))}
            >
              Tải lại trạng thái
            </button>
          </div>
        </div>
        {!learner && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-3 text-[11px]">
            {user?.role === 'SYSTEM_ADMIN' ? (
              <>
                <span className="rounded border border-sky-200 bg-sky-50 px-2 py-0.5 font-semibold text-sky-900">
                  Quản trị hệ thống · Chế độ đọc sự cố kỹ thuật
                </span>
                <Link
                  to="/workspace/operations#technical-escalations"
                  className="font-bold text-[#2d581b] hover:underline"
                >
                  Xử lý tại Trung tâm Vận hành →
                </Link>
              </>
            ) : (
              <>
                <span className="font-semibold text-slate-600">Quyền xử lý:</span>
                {caps.length ? (
                  caps.map((cap) => (
                    <span
                      key={cap}
                      className="rounded border border-[#b9d4ab] bg-[#f4f9f1] px-2 py-0.5 font-medium text-[#2d581b]"
                    >
                      {capLabelMap[cap] ?? cap}
                    </span>
                  ))
                ) : (
                  <span className="text-amber-700">Chưa có quyền xử lý bổ sung</span>
                )}
              </>
            )}
          </div>
        )}
      </header>
      {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
      {req.notice}

      {(() => {
        const hasOpenSpecialistWork =
          t.referrals.some((r) => r.state === 'OPEN') ||
          (t.technicalEscalations ?? []).some((x) =>
            ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'IN_REVIEW'].includes(x.status),
          );
        const effectiveReplyReason = () => {
          if (reason.trim().length >= 10) return reason.trim();
          const trimmed = body.trim();
          return trimmed.length >= 10
            ? trimmed.slice(0, 500)
            : `Tư vấn viên phản hồi hỗ trợ: ${trimmed}`.padEnd(10, '.');
        };
        const effectiveStatusReason = (nextState: string) =>
          reason.trim().length >= 10
            ? reason.trim()
            : `Cập nhật trạng thái phiếu sang "${labels[nextState] ?? nextState}".`;
        const referralSpecialists = people.filter(
          (p) =>
            p.canReferral &&
            p.role ===
              (
                {
                  ACADEMIC: 'ACADEMIC_MANAGER',
                  FINANCE: 'CASHIER',
                  LEARNING: 'INSTRUCTOR',
                } as Record<string, string>
              )[category],
        );
        const availableTransitions = learner
          ? t.state === 'RESOLVED'
            ? ['CLOSED', 'REOPENED']
            : t.state === 'CLOSED'
              ? ['REOPENED']
              : []
          : caps.includes('support.ticket.close')
            ? ((
                {
                  NEW: ['TRIAGED', 'IN_PROGRESS'],
                  TRIAGED: ['IN_PROGRESS'],
                  IN_PROGRESS: ['WAITING_CUSTOMER', 'WAITING_SPECIALIST', 'RESOLVED'],
                  WAITING_CUSTOMER: ['IN_PROGRESS', 'RESOLVED'],
                  WAITING_SPECIALIST: ['IN_PROGRESS', 'RESOLVED'],
                  RESOLVED: ['CLOSED', 'REOPENED'],
                  CLOSED: ['REOPENED'],
                  REOPENED: ['IN_PROGRESS'],
                } as Record<string, string[]>
              )[t.state] ?? [])
            : [];

        return (
          <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1.45fr)_370px]">
            <div className="min-w-0 space-y-5">
              <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-5">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Nội dung yêu cầu của học viên
                </h2>
                <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-900">
                  {t.description}
                </p>
                <SupportAttachmentsSection ticketId={t.id} attachments={t.attachments ?? []} />
              </section>

              <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
                <h2 className="text-base font-bold text-slate-900">Trao đổi &amp; Xử lý</h2>
                {t.messages.length === 0 ? (
                  <p className="rounded-lg bg-slate-50 px-3.5 py-2.5 text-xs text-slate-500">
                    Chưa có trao đổi nào trên phiếu này.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {t.messages.map((m) => (
                      <article
                        key={m.id}
                        className={`rounded-xl border p-3.5 text-sm ${
                          m.visibility === 'INTERNAL'
                            ? 'border-amber-200 bg-amber-50/70'
                            : m.from === 'LEARNER'
                              ? 'border-slate-200 bg-slate-50/70'
                              : 'border-[#cde0c0] bg-[#f4f9f1]'
                        }`}
                      >
                        <p className="text-xs font-semibold text-slate-600">
                          {m.from === 'LEARNER'
                            ? 'Học viên'
                            : m.visibility === 'INTERNAL'
                              ? 'Ghi chú nội bộ'
                              : 'Nhân viên hỗ trợ'}{' '}
                          · {stamp(m.createdAt)}
                        </p>
                        <p className="mt-1 whitespace-pre-wrap break-words leading-relaxed text-slate-800">
                          {formatSupportText(m.body)}
                        </p>
                      </article>
                    ))}
                  </div>
                )}

                {(learner || caps.includes('support.ticket.reply')) && (
                  <form
                    className="space-y-3 border-t border-slate-100 pt-4"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void req.execute('/tickets/' + ticketId + '/messages', {
                        ...cmd(),
                        reason: effectiveReplyReason(),
                        body,
                        visibility: learner ? 'PUBLIC' : visibility,
                      });
                    }}
                  >
                    {!learner && (
                      <label className="block space-y-1 text-xs font-semibold text-slate-700">
                        <span>Phạm vi nội dung</span>
                        <select
                          aria-label="Phạm vi nội dung"
                          className={input}
                          value={visibility}
                          onChange={(e) => setVisibility(e.target.value)}
                        >
                          <option value="PUBLIC">Phản hồi học viên (hiển thị cho người gửi)</option>
                          <option value="INTERNAL">Ghi chú nội bộ (chỉ nhân sự thấy)</option>
                        </select>
                      </label>
                    )}
                    <label className="block space-y-1 text-xs font-semibold text-slate-700">
                      <span>Nội dung phản hồi</span>
                      <textarea
                        aria-label="Nội dung phản hồi"
                        className={input}
                        required
                        maxLength={2000}
                        rows={4}
                        placeholder="Nhập nội dung phản hồi cho học viên hoặc ghi chú phối hợp nội bộ…"
                        value={body}
                        onChange={(e) => setBody(e.target.value)}
                      />
                    </label>
                    <button
                      className={button}
                      disabled={disabled || t.state === 'CLOSED' || body.trim().length === 0}
                    >
                      Lưu phản hồi
                    </button>
                  </form>
                )}
              </section>

              {!learner && caps.includes('support.ticket.transfer') && (
                <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
                  <h2 className="text-base font-bold text-slate-900">
                    Phân công và chuyển chuyên môn
                  </h2>
                  <div className="space-y-2.5 rounded-lg border border-slate-100 bg-slate-50/70 p-3.5">
                    <label className="block space-y-1 text-xs font-semibold text-slate-700">
                      <span>Chuyển phiếu cho Tư vấn viên khác</span>
                      <select
                        aria-label="Người xử lý"
                        className={input}
                        value={target}
                        onChange={(e) => setTarget(e.target.value)}
                      >
                        <option value="">Chọn tư vấn viên đang có quyền xử lý</option>
                        {people
                          .filter((p) => p.role === 'COUNSELOR')
                          .map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.fullName} · {roleDisplayNames[p.role] ?? p.role}
                            </option>
                          ))}
                      </select>
                    </label>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      {reason.trim().length < 10 && (
                        <span className="text-[11px] text-slate-500">
                          Nhập “Lý do thao tác” (≥ 10 ký tự) ở cột phải để chuyển người xử lý.
                        </span>
                      )}
                      <button
                        type="button"
                        className={button}
                        disabled={disabled || !target || reason.trim().length < 10}
                        onClick={() =>
                          void req
                            .execute('/tickets/' + ticketId + '/actions', {
                              ...cmd(),
                              action: 'ASSIGN',
                              targetId: target,
                            })
                            .then((ok) => {
                              if (ok) navigate('/workspace/support');
                            })
                        }
                      >
                        Chuyển tư vấn viên
                      </button>
                    </div>
                  </div>

                  <div className="space-y-3 rounded-lg border border-slate-100 bg-slate-50/70 p-3.5">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block space-y-1 text-xs font-semibold text-slate-700">
                        <span>Nhóm chuyên môn</span>
                        <select
                          aria-label="Nhóm chuyên môn"
                          className={input}
                          value={category}
                          onChange={(e) => {
                            setCategory(e.target.value);
                            setSpecialist('');
                          }}
                        >
                          {t.topic.routes.map((r) => (
                            <option key={r} value={r}>
                              {referralCategoryLabels[r] ?? r}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block space-y-1 text-xs font-semibold text-slate-700">
                        <span>Chuyên viên tiếp nhận</span>
                        <select
                          aria-label="Chuyên viên nhận referral"
                          className={input}
                          value={specialist}
                          onChange={(e) => setSpecialist(e.target.value)}
                        >
                          <option value="">
                            {referralSpecialists.length > 0
                              ? 'Chọn chuyên viên đúng tuyến'
                              : 'Chưa có chuyên viên nào được phân quyền nhóm này'}
                          </option>
                          {referralSpecialists.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.fullName}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <label className="block space-y-1 text-xs font-semibold text-slate-700">
                      <span>Nội dung tóm tắt gửi chuyên môn (tối thiểu 10 ký tự)</span>
                      <textarea
                        aria-label="Nội dung tối thiểu gửi chuyên môn"
                        required
                        minLength={10}
                        maxLength={1000}
                        className={input}
                        value={summary}
                        onChange={(e) => setSummary(e.target.value)}
                      />
                    </label>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs text-slate-500">
                        Tư vấn viên vẫn giữ quyền phụ trách phiếu cho tới khi đóng phiếu.
                      </p>
                      <button
                        type="button"
                        className={button}
                        disabled={
                          disabled || !specialist || summary.length < 10 || reason.trim().length < 10
                        }
                        onClick={() =>
                          void req.execute('/tickets/' + ticketId + '/referrals', {
                            ...cmd(),
                            category,
                            specialistId: specialist,
                            summary,
                          })
                        }
                      >
                        Gửi yêu cầu chuyên môn
                      </button>
                    </div>
                  </div>

                  {t.referrals.map((r) => (
                    <p key={r.id} className="rounded bg-slate-50 px-3 py-2 text-xs text-slate-700">
                      <strong>{referralCategoryLabels[r.category] ?? r.category}:</strong>{' '}
                      {labels[r.state] ?? r.state} {r.response ? `· ${r.response}` : ''}
                    </p>
                  ))}
                </section>
              )}

              {!learner &&
                caps.includes('support.ticket.transfer') &&
                t.assigned &&
                !['RESOLVED', 'CLOSED'].includes(t.state) && (
                  <section
                    aria-label="Chuyển sự cố kỹ thuật cho Quản trị hệ thống"
                    className="space-y-4 rounded-xl border border-slate-200 bg-white p-5"
                  >
                    <div>
                      <h2 className="text-base font-bold text-[#e66f2b]">
                        Chuyển sự cố kỹ thuật cho Quản trị hệ thống
                      </h2>
                      <p className="mt-1 text-xs text-slate-600">
                        Dùng khi phiếu phản ánh lỗi hệ thống, không truy cập được bài học/LMS hoặc
                        cần kiểm tra nhật ký kỹ thuật.
                      </p>
                    </div>
                    {(t.technicalEscalations ?? []).some((x) =>
                      ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'IN_REVIEW'].includes(x.status),
                    ) && (
                      <p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
                        Phiếu này đã có yêu cầu kỹ thuật đang chờ Quản trị hệ thống xử lý (xem ở cột
                        bên phải).
                      </p>
                    )}
                    <form
                      className="space-y-3"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void req.execute('/tickets/' + ticketId + '/technical-escalations', {
                          ...cmd(),
                          incidentCategory,
                          summary: escSummary,
                          ...(escAdminId ? { assignedAdminId: escAdminId } : {}),
                          ...(escRoute.trim() ? { affectedRoute: escRoute.trim() } : {}),
                          ...(escAccountEmail.trim()
                            ? { affectedAccountEmail: escAccountEmail.trim() }
                            : {}),
                        });
                      }}
                    >
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="block space-y-1 text-xs font-semibold text-slate-700">
                          <span>Nhóm sự cố kỹ thuật</span>
                          <select
                            aria-label="Nhóm sự cố kỹ thuật"
                            className={input}
                            value={incidentCategory}
                            onChange={(e) => setIncidentCategory(e.target.value)}
                          >
                            <option value="LMS_SUBMISSION_ERROR">Lỗi LMS / Nộp bài / Mở tài nguyên</option>
                            <option value="PERMISSION_ACCESS">Lỗi phân quyền / Không vào được lớp</option>
                            <option value="ACCOUNT_LOGIN">Lỗi tài khoản / Đăng nhập</option>
                            <option value="PAYMENT_SYNC">Sai lệch đồng bộ thanh toán / hóa đơn</option>
                            <option value="SYSTEM_TECHNICAL">Sự cố kỹ thuật hệ thống khác</option>
                          </select>
                        </label>
                        <label className="block space-y-1 text-xs font-semibold text-slate-700">
                          <span>Quản trị viên tiếp nhận (tùy chọn)</span>
                          <select
                            aria-label="Quản trị viên tiếp nhận"
                            className={input}
                            value={escAdminId}
                            onChange={(e) => setEscAdminId(e.target.value)}
                          >
                            <option value="">Đưa vào hàng đợi chung Quản trị hệ thống</option>
                            {admins.map((ad) => (
                              <option key={ad.id} value={ad.id}>
                                {ad.fullName} {ad.email ? `(${ad.email})` : ''}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="block space-y-1 text-xs font-semibold text-slate-700">
                          <span>Đường dẫn / Màn hình gặp lỗi (tùy chọn)</span>
                          <input
                            aria-label="Đường dẫn gặp lỗi"
                            className={input}
                            maxLength={300}
                            placeholder="Ví dụ: /learn/classes/..."
                            value={escRoute}
                            onChange={(e) => setEscRoute(e.target.value)}
                          />
                        </label>
                        <label className="block space-y-1 text-xs font-semibold text-slate-700">
                          <span>Email tài khoản liên quan (tùy chọn)</span>
                          <input
                            aria-label="Email tài khoản liên quan"
                            className={input}
                            maxLength={200}
                            placeholder="Ví dụ: student@gmail.com"
                            value={escAccountEmail}
                            onChange={(e) => setEscAccountEmail(e.target.value)}
                          />
                        </label>
                      </div>
                      <label className="block space-y-1 text-xs font-semibold text-slate-700">
                        <span>Mô tả kỹ thuật gửi Quản trị hệ thống (tối thiểu 10 ký tự)</span>
                        <textarea
                          aria-label="Mô tả kỹ thuật gửi Quản trị hệ thống"
                          required
                          minLength={10}
                          maxLength={1000}
                          className={input}
                          placeholder="Mô tả bước tái hiện, ảnh đính kèm của học viên và nội dung cần kiểm tra..."
                          value={escSummary}
                          onChange={(e) => setEscSummary(e.target.value)}
                        />
                      </label>
                      <button
                        className={button}
                        disabled={
                          disabled ||
                          escSummary.trim().length < 10 ||
                          reason.trim().length < 10 ||
                          (t.technicalEscalations ?? []).some((x) =>
                            ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'IN_REVIEW'].includes(x.status),
                          )
                        }
                      >
                        Chuyển Quản trị hệ thống kiểm tra kỹ thuật
                      </button>
                    </form>
                  </section>
                )}
            </div>

            <aside className="min-w-0 space-y-4">
              {t.identity && (
                <section className="space-y-1.5 rounded-xl border border-slate-200 bg-white p-4 text-xs">
                  <h2 className="text-sm font-bold text-slate-900">Thông tin người gửi</h2>
                  <p className="font-semibold text-slate-900">
                    {t.identity.learnerName || t.identity.guestName || 'Học viên Smart English'}
                  </p>
                  {(t.identity.learnerEmail || t.identity.claimedContact) && (
                    <p className="break-all text-slate-600">
                      {t.identity.learnerEmail ?? t.identity.claimedContact}
                    </p>
                  )}
                  <p className="pt-1 text-[11px] text-[#2f5d1e]">
                    {t.identity.contactBasis === 'AUTHENTICATED_ACCOUNT'
                      ? '✓ Tài khoản học viên có phiên đăng nhập hợp lệ'
                      : 'Liên hệ tự khai, chưa xác minh chủ sở hữu'}
                  </p>
                </section>
              )}

              <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
                <h2 className="text-sm font-bold text-slate-900">Trạng thái và lịch sử</h2>
                {availableTransitions.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {availableTransitions.map((s) => {
                      const blockedByOpenWork =
                        ['RESOLVED', 'CLOSED'].includes(s) && hasOpenSpecialistWork;
                      return (
                        <button
                          key={s}
                          type="button"
                          className={button}
                          disabled={disabled || blockedByOpenWork}
                          title={
                            blockedByOpenWork
                              ? 'Cần bộ phận kỹ thuật / chuyên môn hoàn tất trước'
                              : undefined
                          }
                          onClick={() =>
                            s === 'CLOSED'
                              ? setConfirmCloseOpen(true)
                              : act(s, effectiveStatusReason(s))
                          }
                        >
                          {labels[s]}
                        </button>
                      );
                    })}
                  </div>
                )}
                {hasOpenSpecialistWork && (
                  <p className="rounded-lg bg-amber-50 px-2.5 py-2 text-[11px] text-amber-900">
                    Đang chờ bộ phận kỹ thuật/chuyên môn phản hồi nên chưa thể đóng hoặc đánh dấu
                    Đã giải quyết.
                  </p>
                )}

                <ol className="space-y-2.5 border-l-2 border-slate-200 pl-3.5 text-xs">
                  {t.events.map((e) => (
                    <li key={e.id} className="relative space-y-0.5">
                      <span
                        aria-hidden="true"
                        className="absolute -left-[19px] top-1.5 h-2 w-2 rounded-full bg-[#5f8b48]"
                      />
                      <p className="font-semibold text-slate-800">
                        {e.label} ·{' '}
                        <span className="font-normal text-slate-500">{stamp(e.createdAt)}</span>
                      </p>
                      {e.reason && (
                        <p className="italic text-slate-600">{formatSupportText(e.reason)}</p>
                      )}
                    </li>
                  ))}
                </ol>
              </section>

              {(t.technicalEscalations?.length ?? 0) > 0 && (
                <section
                  aria-label="Trạng thái chuyển sự cố kỹ thuật"
                  className="space-y-2.5 rounded-xl border border-sky-200 bg-sky-50/40 p-4"
                >
                  <h2 className="text-sm font-bold text-slate-900">
                    Theo dõi xử lý kỹ thuật ({t.technicalEscalations!.length})
                  </h2>
                  <div className="space-y-2">
                    {t.technicalEscalations!.map((esc) => (
                      <article
                        key={esc.id}
                        className="space-y-1.5 rounded-lg border border-sky-200 bg-white p-3 text-xs"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-1.5">
                          <span className="font-bold text-slate-900">
                            {technicalCategoryLabels[esc.incidentCategory] ?? esc.incidentCategory}
                          </span>
                          <span className="shrink-0 whitespace-nowrap rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-900">
                            {technicalStatusLabels[esc.status] ?? esc.status}
                          </span>
                        </div>
                        <p className="text-slate-700">{esc.summary}</p>
                        {!learner && esc.affectedRoute && (
                          <p className="font-mono text-[11px] text-slate-500">
                            Màn hình: {esc.affectedRoute}
                          </p>
                        )}
                        {!learner && esc.affectedAccountEmail && (
                          <p className="font-mono text-[11px] text-slate-500">
                            Tài khoản: {esc.affectedAccountEmail}
                          </p>
                        )}
                        {esc.resolutionNote && (
                          <p className="rounded border border-emerald-200 bg-emerald-50/70 px-2.5 py-1.5 text-[11px] text-emerald-950">
                            <strong>
                              Phản hồi ({esc.resolvedByName ?? esc.assignedAdminName ?? 'Kỹ thuật'}):
                            </strong>{' '}
                            {esc.resolutionNote}
                          </p>
                        )}
                      </article>
                    ))}
                  </div>
                </section>
              )}

              {user?.role !== 'SYSTEM_ADMIN' && (
                <section className="space-y-1.5 rounded-xl border border-slate-200 bg-white p-4">
                  <label className="block space-y-1 text-xs font-bold text-slate-700">
                    <span>Lý do thao tác (bắt buộc khi chuyển phiếu / báo kỹ thuật)</span>
                    <input
                      aria-label="Lý do thao tác"
                      className={input}
                      minLength={10}
                      maxLength={500}
                      placeholder="Ví dụ: Chuyển kỹ thuật kiểm tra lỗi nộp bài của học viên…"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                    />
                  </label>
                </section>
              )}

              <ConfirmDialog
                open={confirmCloseOpen}
                title="Đóng phiếu CSKH?"
                description="Phiếu sẽ chuyển sang trạng thái Đã đóng và không nhận thêm phản hồi mới trừ khi được mở lại có lý do."
                confirmLabel="Xác nhận đóng phiếu"
                cancelLabel="Ở lại"
                tone="warning"
                busy={disabled}
                onCancel={() => setConfirmCloseOpen(false)}
                onConfirm={() => {
                  setConfirmCloseOpen(false);
                  act('CLOSED', effectiveStatusReason('CLOSED'));
                }}
              >
                <p>
                  Mã phiếu: <strong>{shortTicketCode(t.reference)}</strong> · Lý do:{' '}
                  {effectiveStatusReason('CLOSED')}
                </p>
              </ConfirmDialog>
            </aside>
          </div>
        );
      })()}
    </Shell>
  );
}
