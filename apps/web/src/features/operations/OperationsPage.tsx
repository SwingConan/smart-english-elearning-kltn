import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, Navigate, NavLink, useParams, useSearchParams } from 'react-router';
import {
  ArrowLeft,
  ArrowRight,
  FileText,
  LockKeyhole,
  ShieldCheck,
  SlidersHorizontal,
  Activity,
  Download,
  RefreshCw,
} from 'lucide-react';
import { PageSkeleton } from '@/components/ui/Feedback';
import { SafeMarkdown } from '@/components/ui/SafeMarkdown';
import { useAuth } from '@/features/auth/auth-context';
import { businessRoleLabels } from '@/features/auth/business-role';
import type {
  BusinessRole,
  CmsState,
  OperationsReader,
  OperationsReadRequest,
  OperationsSection,
  OperationsViewModel,
  OperationsWorkbenchPort,
} from './contracts';
import { OperationsPreflight } from './OperationsPreflight';
import type { CmsAction } from '../../../../api/src/modules/operations/operations.contracts';
import {
  centerToday,
  cmsStates,
  displayDay,
  requestKey,
  roleReportDescriptions,
  sectionsFor,
  sectionLabels,
  unavailableReader,
  unavailableWorkbench,
  viewModel,
} from './model';

const icons = { cms: FileText, settings: SlidersHorizontal, audit: ShieldCheck, reports: Activity };
const blockedReason =
  'Chưa xác minh endpoint, quyền hiện hành và bằng chứng phía server. Thao tác chưa khả dụng.';
const badgeStyle =
  'inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700';
function Badge({ children }: { children: ReactNode }) {
  return <span className={badgeStyle}>{children}</span>;
}
function BlockedButton({ children }: { children: ReactNode }) {
  return (
    <button
      type="button"
      disabled
      title={blockedReason}
      aria-describedby="w10-action-boundary"
      className="btn-secondary inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <LockKeyhole size={15} aria-hidden="true" />
      {children}
    </button>
  );
}
function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="state-empty text-sm" role="status">
      {children}
    </div>
  );
}
function Denied() {
  return (
    <section className="section-shell">
      <div className="card space-y-4" role="alert">
        <Badge>403 · Quyền truy cập</Badge>
        <h1 className="text-2xl font-bold">Bạn chưa có quyền xem không gian này</h1>
        <p className="text-slate-600">
          Vai trò hoặc phạm vi hiện tại chưa phù hợp. Không có dữ liệu W10 được tải.
        </p>
        <Link className="btn-secondary inline-flex" to="/workspace">
          Về không gian của bạn
        </Link>
      </div>
    </section>
  );
}
type LoadState =
  | { key: string; reader: OperationsReader; status: 'READY'; model: OperationsViewModel }
  | { key: string; reader: OperationsReader; status: 'ERROR' };
function useOperationsRead(
  reader: OperationsReader,
  request: OperationsReadRequest,
  generation: number,
) {
  const key = `${requestKey(request)}:${generation}`;
  const [state, setState] = useState<LoadState | null>(null);
  const validDay = displayDay(request.date).status === 'RESOLVED';
  useEffect(() => {
    if (!validDay) return;
    let current = true;
    // Promise boundary also catches a synchronous reader failure. Never render raw errors.
    void Promise.resolve()
      .then(() => reader.read(request))
      .then((raw) => {
        const model = viewModel(raw, request);
        if (current) setState({ key, reader, status: 'READY', model });
      })
      .catch(() => {
        if (current) setState({ key, reader, status: 'ERROR' });
      });
    return () => {
      current = false;
    };
  }, [reader, request, key, validDay]);
  return !validDay
    ? { status: 'INVALID_DATE' as const }
    : state?.key === key && state.reader === reader
      ? state
      : { status: 'LOADING' as const };
}

/** Role gates only shape navigation. No authenticated runtime permission is inferred here. */
export function OperationsPage({
  reader = unavailableReader,
  preflightPort = unavailableWorkbench,
}: {
  reader?: OperationsReader;
  preflightPort?: OperationsWorkbenchPort;
}) {
  const { user, isLoading } = useAuth();
  const { section } = useParams();
  if (isLoading)
    return (
      <div className="section-shell" aria-label="Đang xác minh phiên">
        <PageSkeleton cards={3} />
      </div>
    );
  if (!user || user.status !== 'ACTIVE') return <Denied />;
  const sections = sectionsFor(user.role);
  if (!sections.length) return <Denied />;
  if (!section) return <Navigate replace to={`/workspace/operations/${sections[0]}`} />;
  if (!sections.includes(section as OperationsSection)) return <Denied />;
  return (
    <OperationsWorkspace
      key={`${user.id}:${user.role}:${section}`}
      viewerId={user.id}
      role={user.role as BusinessRole}
      section={section as OperationsSection}
      reader={reader}
      preflightPort={preflightPort}
    />
  );
}

function OperationsWorkspace({
  viewerId,
  role,
  section,
  reader,
  preflightPort,
}: {
  viewerId: string;
  role: BusinessRole;
  section: OperationsSection;
  reader: OperationsReader;
  preflightPort: OperationsWorkbenchPort;
}) {
  const [params, setParams] = useSearchParams();
  const date = params.get('date') ?? centerToday();
  const scopeId = params.get('scope') ?? (role === 'STUDENT' ? viewerId : '');
  const request = useMemo(
    () => ({ viewerId, role, section, date, scopeId }),
    [viewerId, role, section, date, scopeId],
  );
  const [generation, setGeneration] = useState(0);
  const loaded = useOperationsRead(reader, request, generation);
  const model = loaded.status === 'READY' ? loaded.model : null;
  const update = (name: string, value: string) =>
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      next.set(name, value);
      return next;
    });
  const day = displayDay(date);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, [section]);
  return (
    <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      <Link
        to="/workspace"
        className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-indigo-700"
      >
        <ArrowLeft size={16} aria-hidden="true" />
        Không gian của bạn
      </Link>
      <header className="mb-8 flex flex-col gap-5 border-b border-slate-200 pb-8 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-2xl space-y-3">
          <p className="eyebrow">SMART ENGLISH · VẬN HÀNH</p>
          <h1
            ref={heading}
            tabIndex={-1}
            className="text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl"
          >
            {sectionLabels[section]}
          </h1>
          <p className="leading-relaxed text-slate-600">
            {section === 'reports'
              ? roleReportDescriptions[role]
              : 'Nội dung rõ ràng, quyết định có bằng chứng và lịch sử được bảo toàn.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 sm:max-w-64 sm:justify-end">
          <Badge>{businessRoleLabels[role]}</Badge>
          <Badge>Runtime: UNVERIFIED</Badge>
        </div>
      </header>
      <div className="grid min-w-0 gap-6 lg:grid-cols-[14rem_minmax(0,1fr)]">
        <aside>
          <nav
            aria-label="Chức năng vận hành"
            className="flex gap-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2 lg:sticky lg:top-6 lg:flex-col"
          >
            {sectionsFor(role).map((key) => {
              const Icon = icons[key];
              return (
                <NavLink
                  key={key}
                  to={`/workspace/operations/${key}`}
                  className={({ isActive }) =>
                    `flex shrink-0 items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold ${isActive ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'}`
                  }
                >
                  <Icon size={18} aria-hidden="true" />
                  {sectionLabels[key]}
                </NavLink>
              );
            })}
          </nav>
          <div className="mt-4 hidden rounded-2xl bg-slate-100 p-4 text-xs leading-relaxed text-slate-600 lg:block">
            <LockKeyhole className="mb-2" size={18} aria-hidden="true" />
            Mỗi thao tác cần quyền và phạm vi được server xác minh độc lập.
          </div>
        </aside>
        <div className="min-w-0 space-y-6">
          <div
            id="w10-action-boundary"
            className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-relaxed text-amber-950"
          >
            <LockKeyhole size={19} className="mt-0.5 shrink-0" aria-hidden="true" />
            <div>
              <strong>Chưa kết nối dữ liệu vận hành</strong>
              <p>
                {blockedReason} Bản soạn và bộ lọc chỉ hoạt động trong giao diện; không lưu hoặc
                công bố dữ liệu.
              </p>
            </div>
          </div>
          <div className="card grid gap-4 sm:grid-cols-2">
            <label className="space-y-2 text-sm font-semibold">
              Ngày báo cáo · UTC+7
              <input
                className="input-field w-full"
                type="date"
                value={date}
                onChange={(event) => update('date', event.target.value)}
              />
            </label>
            <label className="space-y-2 text-sm font-semibold">
              Phạm vi
              <select
                className="input-field w-full"
                value={scopeId}
                disabled={!model?.scopes.length}
                onChange={(event) => update('scope', event.target.value)}
              >
                <option value={scopeId}>
                  {model?.scopes.find((s) => s.id === scopeId)?.label ??
                    'Chưa có phạm vi đã xác minh'}
                </option>
                {model?.scopes
                  .filter((s) => s.id !== scopeId)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
              </select>
            </label>
            {section === 'reports' && day.status === 'RESOLVED' && (
              <p className="break-words text-xs text-slate-500 sm:col-span-2">
                Ngày địa phương: [{date} 00:00, ngày kế tiếp 00:00) · Asia/Ho_Chi_Minh. Bộ lọc không
                tạo quyền truy cập.
              </p>
            )}
          </div>
          <div aria-live="polite" aria-atomic="true">
            {loaded.status === 'LOADING' && (
              <div aria-label="Đang tải dữ liệu W10">
                <PageSkeleton cards={2} />
                <p className="sr-only">Đang tải dữ liệu W10</p>
              </div>
            )}
            {loaded.status === 'INVALID_DATE' && (
              <div className="state-error" role="alert">
                Ngày không hợp lệ. Chọn một ngày đầy đủ để tiếp tục.
              </div>
            )}
            {loaded.status === 'ERROR' && (
              <div className="state-error space-y-3" role="alert">
                <p>Không thể đọc dữ liệu. Chưa có thay đổi nào được gửi.</p>
                <button
                  type="button"
                  className="btn-secondary inline-flex items-center gap-2"
                  onClick={() => setGeneration((g) => g + 1)}
                >
                  <RefreshCw size={16} aria-hidden="true" />
                  Thử đọc lại
                </button>
              </div>
            )}
            {model?.status === 'DENIED' && (
              <div className="state-error" role="alert">
                Không thể xác minh phạm vi hoặc nguồn dữ liệu. Nội dung đã được ẩn.
              </div>
            )}
            {model?.status === 'UNAVAILABLE' && (
              <Empty>
                Chưa khả dụng · Chưa có nguồn máy chủ được xác minh. Không có dữ liệu vận hành để hiển
                thị.
              </Empty>
            )}
            {model?.status === 'OFFLINE_TEST_ONLY' && (
              <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-sm font-semibold text-indigo-900">
                Dữ liệu kiểm thử — không phải dữ liệu vận hành. Không xác nhận quyền hoặc số liệu
                thực.
              </div>
            )}
          </div>
          {loaded.status !== 'LOADING' &&
            loaded.status !== 'INVALID_DATE' &&
            model?.status !== 'DENIED' && (
              <>
                {section === 'cms' && (
                  <CmsPanel key={scopeId} model={model} role={role} port={preflightPort} />
                )}
                {section === 'settings' && <SettingsPanel model={model} port={preflightPort} />}
                {section === 'audit' && (
                  <AuditPanel model={model} port={preflightPort} scopeId={scopeId} />
                )}
                {section === 'reports' && (
                  <ReportsPanel model={model} port={preflightPort} scopeId={scopeId} date={date} />
                )}
              </>
            )}
        </div>
      </div>
    </section>
  );
}

function CmsPanel({
  model,
  role,
  port,
}: {
  model: OperationsViewModel | null;
  role: BusinessRole;
  port: OperationsWorkbenchPort;
}) {
  const [filter, setFilter] = useState('ALL');
  const [selected, setSelected] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [preview, setPreview] = useState(false);
  const [reason, setReason] = useState('');
  const [action, setAction] = useState<CmsAction>(role === 'COUNSELOR' ? 'EDIT_DRAFT' : 'PUBLISH');
  const items = (model?.cms ?? []).filter((item) => filter === 'ALL' || item.state === filter);
  const revisionKey = (item: NonNullable<typeof model>['cms'][number]) =>
    JSON.stringify([item.id, item.revision.id, item.revision.revision]);
  const current = items.find((item) => revisionKey(item) === selected);
  const detail = useRef<HTMLElement>(null);
  useEffect(() => {
    if (current) detail.current?.focus({ preventScroll: true });
  }, [selected, current]);
  return (
    <div className="space-y-6">
      {role === 'COUNSELOR' && (
        <article className="card space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="eyebrow">TV · SOẠN NỘI DUNG</p>
              <h2 className="mt-1 text-xl font-bold">Từ ý tưởng đến bản nháp</h2>
            </div>
            <Badge>Chưa lưu · trong phiên</Badge>
          </div>
          <p className="text-sm text-slate-600">
            Bản soạn sẽ mất khi rời màn hình. Chưa có dữ liệu được gửi để học vụ duyệt.
          </p>
          <label className="block space-y-2 text-sm font-semibold">
            Tiêu đề
            <input
              className="input-field w-full"
              maxLength={200}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Nhập tiêu đề nội dung"
            />
          </label>
          <label className="block space-y-2 text-sm font-semibold">
            Nội dung · Markdown
            <textarea
              className="input-field min-h-48 w-full"
              maxLength={20000}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Soạn nội dung tại đây…"
            />
          </label>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setPreview((p) => !p)}
              aria-expanded={preview}
            >
              {preview ? 'Đóng xem trước' : 'Xem trước bản soạn'}
            </button>
            <BlockedButton>Lưu bản nháp</BlockedButton>
            <BlockedButton>Gửi học vụ duyệt</BlockedButton>
          </div>
          {preview && (
            <section
              aria-label="Xem trước bản soạn"
              className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-5 [overflow-wrap:anywhere]"
            >
              <h3 className="text-lg font-bold">{title || 'Chưa có tiêu đề'}</h3>
              {body ? (
                <SafeMarkdown markdown={body} />
              ) : (
                <p className="text-sm text-slate-500">Chưa có nội dung.</p>
              )}
            </section>
          )}
        </article>
      )}
      <article className="card space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow">
              {role === 'ACADEMIC_MANAGER' ? 'HVU · DUYỆT ĐỘC LẬP' : 'NỘI DUNG CỦA PHẠM VI'}
            </p>
            <h2 className="mt-1 text-xl font-bold">Nội dung & phiên bản</h2>
          </div>
          <label className="text-sm font-semibold">
            Trạng thái nội dung
            <select
              className="input-field mt-2 block w-full"
              value={filter}
              onChange={(e) => {
                setFilter(e.target.value);
                setSelected('');
              }}
            >
              <option value="ALL">Tất cả trạng thái</option>
              {Object.entries(cmsStates).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        {!items.length ? (
          <Empty>Chưa có nội dung phù hợp trong phạm vi được đọc.</Empty>
        ) : (
          <ul className="divide-y divide-slate-100">
            {items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => {
                    setSelected(revisionKey(item));
                    setReason('');
                  }}
                  aria-pressed={selected === revisionKey(item)}
                  aria-expanded={selected === revisionKey(item)}
                  aria-controls="w10-cms-version-detail"
                  className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-4 text-left hover:bg-slate-50"
                >
                  <span className="min-w-0">
                    <span className="block break-words font-semibold">{item.title}</span>
                    <span className="text-xs text-slate-500">
                      Phiên bản {item.revision.revision}
                    </span>
                  </span>
                  <span className="shrink-0">
                    <Badge>{cmsStates[item.state]}</Badge>
                  </span>
                  <ArrowRight size={16} aria-hidden="true" className="shrink-0" />
                </button>
              </li>
            ))}
          </ul>
        )}
        {current && (
          <section
            id="w10-cms-version-detail"
            ref={detail}
            tabIndex={-1}
            aria-label="Chi tiết phiên bản"
            className="space-y-4 border-t border-slate-200 pt-5"
          >
            <h3 className="text-lg font-bold">{current.title}</h3>
            <div className="[overflow-wrap:anywhere]">
              <SafeMarkdown markdown={current.body} />
            </div>
            <h4 className="font-semibold">Lịch sử phiên bản</h4>
            <ol className="space-y-2">
              {current.history.map((h, i) => (
                <li
                  key={`${h.revision.id}:${h.revision.revision}:${i}`}
                  className="flex flex-wrap gap-2 text-sm"
                >
                  <span>v{h.revision.revision}</span>
                  <Badge>{cmsStates[h.state as CmsState]}</Badge>
                </li>
              ))}
            </ol>
            <label className="block space-y-2 text-sm font-semibold">
              Điều kiện thao tác trên revision
              <select
                className="input-field block w-full"
                value={action}
                onChange={(e) => setAction(e.target.value as CmsAction)}
              >
                {(role === 'COUNSELOR'
                  ? ['EDIT_DRAFT', 'SUBMIT_REVIEW']
                  : ['PUBLISH', 'REJECT', 'WITHDRAW']
                ).map((a) => (
                  <option key={a} value={a}>
                    {
                      (
                        {
                          EDIT_DRAFT: 'Sửa bản nháp',
                          SUBMIT_REVIEW: 'Gửi duyệt',
                          PUBLISH: 'Công bố',
                          REJECT: 'Từ chối',
                          WITHDRAW: 'Thu hồi',
                        } as Record<string, string>
                      )[a]
                    }
                  </option>
                ))}
              </select>
            </label>
            <OperationsPreflight
              port={port}
              selection={{
                kind: 'CMS',
                scopeId: current.scopeId,
                request: { action, expectedRevision: current.revision },
              }}
            />
            {role === 'ACADEMIC_MANAGER' ? (
              <>
                <label className="block space-y-2 text-sm font-semibold">
                  Lý do quyết định
                  <textarea
                    className="input-field min-h-24 w-full"
                    value={reason}
                    maxLength={2000}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </label>
                <p className="text-sm text-slate-600">
                  Người soạn phải khác người duyệt. Danh tính, quyền, revision và approval cần được
                  server xác minh lại trước quyết định.
                </p>
                <div className="flex flex-wrap gap-3">
                  <BlockedButton>Duyệt & công bố</BlockedButton>
                  <BlockedButton>Từ chối</BlockedButton>
                  <BlockedButton>Thu hồi</BlockedButton>
                </div>
              </>
            ) : (
              <BlockedButton>Chỉnh sửa phiên bản</BlockedButton>
            )}
          </section>
        )}
      </article>
    </div>
  );
}

function SettingsPanel({
  model,
  port,
}: {
  model: OperationsViewModel | null;
  port: OperationsWorkbenchPort;
}) {
  const [code, setCode] = useState('');
  const selected = model?.settings.find((s) => s.code === code) ?? model?.settings[0];
  return (
    <article className="card space-y-5">
      <div>
        <p className="eyebrow">QT · CẤU HÌNH ĐƯỢC PHÉP</p>
        <h2 className="mt-1 text-xl font-bold">Cấu hình kỹ thuật</h2>
        <p className="mt-2 text-sm text-slate-600">
          Chỉ thông tin cấu hình được máy chủ cho phép mới được hiển thị. Giá trị bí mật luôn được ẩn.
        </p>
      </div>
      {!model?.settings.length ? (
        <Empty>Chưa có danh mục cấu hình được xác minh.</Empty>
      ) : (
        <ul className="divide-y divide-slate-100">
          {model.settings.map((item) => (
            <li key={item.code} className="flex flex-wrap items-center justify-between gap-4 py-4">
              <div>
                <p className="break-all font-semibold">{item.code}</p>
                <p className="mt-1 text-sm text-slate-500">
                  Giá trị: •••••••• · {item.sensitivity}
                </p>
              </div>
              <Badge>{item.configured === false ? 'UNCONFIGURED' : 'UNVERIFIED'}</Badge>
            </li>
          ))}
        </ul>
      )}
      <div className="rounded-xl bg-slate-50 p-4 text-sm leading-relaxed text-slate-600">
        Thay đổi nhạy cảm cần approval độc lập đúng request và revision. Chưa xác minh approval;
        không gửi thay đổi hoặc kiểm tra provider thật.
      </div>
      <BlockedButton>Đề nghị thay đổi cấu hình</BlockedButton>
      <label className="block space-y-2 text-sm font-semibold">
        Cấu hình cần đối chiếu
        <select
          className="input-field block w-full"
          value={selected?.code ?? ''}
          disabled={!model?.settings.length}
          onChange={(e) => setCode(e.target.value)}
        >
          <option value="" disabled>
            Chưa có cấu hình thuộc phạm vi
          </option>
          {model?.settings.map((s) => (
            <option key={s.code} value={s.code}>
              Đối chiếu · {s.code}
            </option>
          ))}
        </select>
      </label>
      <OperationsPreflight
        port={port}
        selection={
          selected
            ? { kind: 'CONFIGURATION', scopeId: selected.scopeId, settingCode: selected.code }
            : null
        }
      />
    </article>
  );
}

function AuditPanel({
  model,
  port,
  scopeId,
}: {
  model: OperationsViewModel | null;
  port: OperationsWorkbenchPort;
  scopeId: string;
}) {
  const [event, setEvent] = useState('ALL');
  const rows = (model?.audit ?? []).filter((r) => event === 'ALL' || r.eventCode === event);
  return (
    <div className="space-y-6">
      <article className="card space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-bold">Sức khỏe hệ thống</h2>
          <Badge>UNKNOWN</Badge>
        </div>
        <p className="text-sm leading-relaxed text-slate-600">
          Chưa có quan sát provider được xác thực và còn hiệu lực. Thiếu bằng chứng không có nghĩa
          là HEALTHY.
        </p>
        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          <div className="rounded-xl bg-slate-50 p-4">
            <dt className="text-slate-500">Kết nối tích hợp</dt>
            <dd className="mt-1 font-semibold">UNVERIFIED</dd>
          </div>
          <div className="rounded-xl bg-slate-50 p-4">
            <dt className="text-slate-500">Bằng chứng quan sát</dt>
            <dd className="mt-1 font-semibold">Chưa khả dụng</dd>
          </div>
        </dl>
      </article>
      <article className="card space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow">READ-ONLY · THEO PHẠM VI</p>
            <h2 className="mt-1 text-xl font-bold">Nhật ký vận hành</h2>
          </div>
          <label className="text-sm font-semibold">
            Loại sự kiện
            <select
              className="input-field mt-2 block"
              value={event}
              onChange={(e) => setEvent(e.target.value)}
            >
              <option value="ALL">Tất cả sự kiện</option>
              {[...new Set((model?.audit ?? []).map((r) => r.eventCode))].map((code) => (
                <option key={code}>{code}</option>
              ))}
            </select>
          </label>
        </div>
        <p className="text-sm text-slate-600">
          Không hiển thị payload gốc, danh tính cá nhân hoặc credential.
        </p>
        <OperationsPreflight
          port={port}
          selection={model?.status === 'OFFLINE_TEST_ONLY' ? { kind: 'AUDIT', scopeId } : null}
        />
        {!rows.length ? (
          <Empty>Chưa có sự kiện phù hợp được phép hiển thị.</Empty>
        ) : (
          <ol className="divide-y divide-slate-100">
            {rows.map((r) => (
              <li key={`${r.ref.id}:${r.ref.revision}`} className="space-y-2 py-4">
                <p className="break-all text-sm font-semibold">{r.eventCode}</p>
                <p className="break-words text-xs text-slate-500">
                  {r.occurredAt} · revision {r.ref.revision}
                </p>
              </li>
            ))}
          </ol>
        )}
      </article>
    </div>
  );
}

function ReportsPanel({
  model,
  port,
  scopeId,
  date,
}: {
  model: OperationsViewModel | null;
  port: OperationsWorkbenchPort;
  scopeId: string;
  date: string;
}) {
  const [source, setSource] = useState('ALL');
  const [state, setState] = useState('ALL');
  const metrics = (model?.metrics ?? []).filter(
    (m) => (source === 'ALL' || m.sourceWave === source) && (state === 'ALL' || m.state === state),
  );
  return (
    <article className="card space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow">BÁO CÁO RIÊNG TƯ</p>
          <h2 className="mt-1 text-xl font-bold">Tổng quan trong ngày</h2>
          <p className="mt-2 text-sm text-slate-600">
            Chỉ tổng hợp khi nguồn, quyền và thời điểm được xác minh.
          </p>
        </div>
        <BlockedButton>
          <Download size={16} aria-hidden="true" />
          Xuất CSV riêng tư
        </BlockedButton>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ['Độ đầy đủ', 'UNKNOWN'],
          ['Nguồn vận hành', 'UNVERIFIED'],
          ['Quyền xuất hiện hành', 'Chưa xác minh'],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-slate-200 p-4">
            <p className="text-xs text-slate-500">{label}</p>
            <p className="mt-2 text-base font-bold text-slate-800">{value}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-semibold">
          Nguồn báo cáo
          <select
            className="input-field mt-2 block w-full"
            value={source}
            onChange={(e) => setSource(e.target.value)}
          >
            <option value="ALL">Tất cả nguồn</option>
            {[...new Set((model?.metrics ?? []).map((m) => m.sourceWave))].map((w) => (
              <option key={w}>{w}</option>
            ))}
          </select>
        </label>
        <label className="text-sm font-semibold">
          Trạng thái bằng chứng
          <select
            className="input-field mt-2 block w-full"
            value={state}
            onChange={(e) => setState(e.target.value)}
          >
            <option value="ALL">Tất cả trạng thái</option>
            {['PENDING', 'UNVERIFIED', 'UNAVAILABLE', 'UNKNOWN'].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
      </div>
      {!metrics.length ? (
        <Empty>Chưa có chỉ số phù hợp được xác minh. Đây không phải kết quả bằng 0.</Empty>
      ) : (
        <div
          role="region"
          aria-label="Bảng báo cáo có thể cuộn ngang"
          tabIndex={0}
          className="overflow-x-auto rounded-xl border border-slate-200"
        >
          <table className="w-full min-w-[30rem] text-left text-sm">
            <caption className="sr-only">
              Chỉ số theo nguồn và trạng thái bằng chứng; không có giá trị được xác nhận từ dữ liệu
              kiểm thử
            </caption>
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                {['Chỉ số', 'Nguồn', 'Bằng chứng', 'Giá trị'].map((t) => (
                  <th key={t} scope="col" className="px-4 py-3 font-semibold">
                    {t}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {metrics.map((m, i) => (
                <tr key={`${m.code}:${i}`}>
                  <th scope="row" className="break-all px-4 py-4 font-semibold">
                    {m.code}
                  </th>
                  <td className="px-4 py-4">{m.sourceWave}</td>
                  <td className="px-4 py-4">
                    <Badge>{m.state}</Badge>
                  </td>
                  <td className="px-4 py-4">
                    <span aria-label="Chưa xác minh giá trị">—</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="rounded-xl bg-slate-50 p-4 text-xs leading-relaxed text-slate-600">
        Dữ liệu đang chờ, chưa xác định hoặc chưa khả dụng không có nghĩa là bằng 0. Nguồn tư vấn
        và chứng chỉ chưa được xác minh sẽ không tạo số liệu đã xác nhận. Xuất CSV cần đủ quyền,
        đúng phạm vi và nguồn đã kiểm tra; hiện chưa có tệp được tạo hoặc tải xuống.
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <OperationsPreflight
          port={port}
          label="Kiểm tra quyền xem (offline)"
          selection={
            model?.status === 'OFFLINE_TEST_ONLY' ? { kind: 'DAILY', scopeId, date } : null
          }
        />
        <OperationsPreflight
          port={port}
          label="Kiểm tra CSV (offline)"
          selection={
            model?.status === 'OFFLINE_TEST_ONLY'
              ? { kind: 'EXPORT', scopeId, date, filters: { source, state } }
              : null
          }
        />
      </div>
    </article>
  );
}
