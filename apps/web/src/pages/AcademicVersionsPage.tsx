import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import {
  Building2,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  FileCheck2,
  FileEdit,
  History,
  Layers,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '@/features/auth/auth-context';
import { isTechnicalQaRecord } from '@/features/catalog/record-presentation';
import { ConfirmDialog } from '@/components/ui/Feedback';
import {
  academicState,
  control,
  planningApi,
  schoolDate,
  schoolInput,
  type Version,
} from '@/features/academic/planning-api';

type ApprovedClass = {
  id: string;
  code: string;
  name: string;
  status: string;
  modality: string;
  maxStudents: number | null;
  pricingType: string;
  tuitionFeeVnd: number | null;
  versionId: string;
  approvedTuitionFeeVnd: number | null;
  activeRightCount: number;
};

type VersionContext = {
  course: {
    id: string;
    title: string;
    slug: string;
    level: string;
    skillScope: string;
    isPublished: boolean;
  };
  approvedClasses: ApprovedClass[];
};

const VERSION_BADGE_STYLE: Record<string, string> = {
  PUBLISHED: 'badge-published',
  PENDING_APPROVAL: 'badge-pending',
  DRAFT: 'badge-draft',
  REJECTED: 'badge-rejected',
  SUPERSEDED: 'badge-info',
};

export function AcademicVersionsPage() {
  const { id } = useParams();
  return <Versions key={id} courseId={id!} />;
}

function Versions({ courseId }: { courseId: string }) {
  const { user } = useAuth();
  const [rows, setRows] = useState<Version[]>([]),
    [context, setContext] = useState<VersionContext>(),
    [detail, setDetail] = useState<Version>(),
    [edit, setEdit] = useState<Version>(),
    [pendingSubmit, setPendingSubmit] = useState<Version>(),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false),
    [tick, setTick] = useState(0);
  const [initialNow] = useState(() => Date.now());
  const [form, setForm] = useState({
    title: '',
    description: '',
    standardPricingType: '',
    standardTuitionFeeVnd: '',
    effectiveFrom: schoolInput(new Date(initialNow + 86400000).toISOString()),
    reason: '',
  });
  const [classForm, setClassForm] = useState({
    versionId: '',
    code: '',
    name: '',
    modality: 'ONLINE',
    maxStudents: 25,
    enrollmentStart: '',
    enrollmentEnd: '',
    classStart: '',
    classEnd: '',
    reason: '',
  });

  useEffect(() => {
    let live = true;
    void Promise.all([
      planningApi.get<Version[]>('programs/' + courseId + '/versions'),
      planningApi
        .get<VersionContext>('programs/' + courseId + '/version-context')
        .catch(() => undefined),
    ])
      .then(([r, ctx]) => {
        if (live && Array.isArray(r)) {
          setRows(r);
          if (ctx && typeof ctx === 'object' && 'course' in ctx && ctx.course) {
            setContext(ctx);
          } else {
            setContext(undefined);
          }
          const published = r.find((v) => v.state === 'PUBLISHED');
          if (published)
            setClassForm((f) => ({
              ...f,
              versionId: f.versionId || published.id,
              name:
                f.name ||
                (isTechnicalQaRecord(published.title)
                  ? 'Lớp học vụ chuẩn'
                  : `${published.title} - Lớp học vụ`),
            }));
        }
      })
      .catch(() => {
        if (live) setError('Không tải được phiên bản chương trình.');
      });
    return () => {
      live = false;
    };
  }, [courseId, tick]);

  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await work();
      setTick((x) => x + 1);
    } catch {
      setError('Không thể lưu phiên bản. Vui lòng kiểm tra lại quyền truy cập và mức học phí chuẩn.');
    } finally {
      setBusy(false);
    }
  }

  const save = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await planningApi.write(
        edit ? 'versions/' + edit.id : 'programs/' + courseId + '/versions',
        {
          title: form.title,
          description: form.description,
          standardPricingType: form.standardPricingType || undefined,
          standardTuitionFeeVnd:
            form.standardPricingType === 'FREE'
              ? 0
              : form.standardPricingType === 'PAID'
                ? Number(form.standardTuitionFeeVnd)
                : undefined,
          effectiveFrom: form.effectiveFrom + ':00+07:00',
          reason: form.reason,
          ...(edit ? { expectedLockVersion: edit.lockVersion } : {}),
        },
        edit ? 'PATCH' : 'POST',
      );
      setEdit(undefined);
      setMessage('Đã lưu phiên bản nháp thành công.');
    });
  };

  const publishedVersions = rows.filter(
    (v) => v.state === 'PUBLISHED' && v.standardTuitionFeeVnd !== null,
  );
  const selectedPublished = publishedVersions.find((v) => v.id === classForm.versionId);

  const createApprovedClass = (e: FormEvent) => {
    e.preventDefault();
    if (!selectedPublished) return;
    void run(async () => {
      const created = await planningApi.write<{ code: string }>(
        'versions/' + selectedPublished.id + '/classes',
        {
          code: classForm.code,
          name: classForm.name,
          modality: classForm.modality,
          maxStudents: Number(classForm.maxStudents),
          enrollmentStart: classForm.enrollmentStart
            ? classForm.enrollmentStart + ':00+07:00'
            : undefined,
          enrollmentEnd: classForm.enrollmentEnd
            ? classForm.enrollmentEnd + ':00+07:00'
            : undefined,
          classStart: classForm.classStart ? classForm.classStart + ':00+07:00' : undefined,
          classEnd: classForm.classEnd ? classForm.classEnd + ':00+07:00' : undefined,
          reason: classForm.reason,
        },
      );
      setClassForm((f) => ({ ...f, code: '', reason: '' }));
      setMessage(
        `Đã tạo lớp ${created.code} theo phiên bản v${selectedPublished.number} thành công.`,
      );
    });
  };

  return (
    <main className="workspace-page">
      {/* Top Breadcrumb & Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-sm">
          <Link
            to="/academic"
            className=" font-medium text-slate-500 transition hover:text-indigo-700"
          >
            Học vụ
          </Link>
          <span className="text-slate-300">/</span>
          <Link
            to={'/academic/programs/' + courseId}
            className="inline-flex items-center gap-1.5 font-semibold text-indigo-700 hover:underline"
          >
            Chương trình
          </Link>
          <span className="text-slate-300">/</span>
          <span className="font-semibold text-slate-800">Phiên bản & Điều khoản</span>
        </nav>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            className={control + ' inline-flex items-center gap-1.5 text-sm font-semibold'}
            onClick={() => setTick((x) => x + 1)}
          >
            <RefreshCw size={15} aria-hidden="true" />
            Tải lại
          </button>
        </div>
      </div>

      {/* Page Header Card */}
      <header className="workspace-header">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="badge-info">
              <Layers size={13} aria-hidden="true" />
              Quản trị phiên bản học vụ
            </span>
            {publishedVersions.length > 0 && (
              <span className="badge-published">
                <CheckCircle2 size={13} aria-hidden="true" />
                {publishedVersions.length} phiên bản đã duyệt giá
              </span>
            )}
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
            Phiên bản và điều khoản chương trình
          </h1>
          <p className="max-w-3xl text-sm leading-relaxed text-slate-600">
            Mỗi lần điều chỉnh chuẩn chương trình hoặc mức học phí cần tạo một phiên bản mới và gửi phê duyệt theo quy trình học vụ.
          </p>
        </div>
      </header>

      {/* Course Context Summary Banner */}
      {context?.course && (
        <section className="workspace-card border-l-4 border-l-indigo-600">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-1.5">
              <p className="text-xs font-bold tracking-wider text-indigo-700 uppercase">
                Chương trình đang cấu hình
              </p>
              <h2 className="text-xl font-bold text-slate-950">
                {isTechnicalQaRecord(context.course.title)
                  ? 'Thông tin chương trình QA'
                  : context.course.title}
              </h2>
              <div className="flex flex-wrap items-center gap-2 pt-1 text-sm text-slate-600">
                <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                  Trình độ: {context.course.level}
                </span>
                <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                  Kỹ năng:{' '}
                  {({
                    LR: 'Nghe & Đọc',
                    FOUR_SKILLS: '4 kỹ năng',
                    LISTENING: 'Kỹ năng Nghe',
                    READING: 'Kỹ năng Đọc',
                    SPEAKING: 'Kỹ năng Nói',
                    WRITING: 'Kỹ năng Viết',
                  } as Record<string, string>)[context.course.skillScope] ??
                    context.course.skillScope}
                </span>
                <span
                  className={
                    context.course.isPublished ? 'badge-published' : 'badge-draft'
                  }
                >
                  {context.course.isPublished ? 'Đã công khai Danh mục' : 'Chưa mở danh mục'}
                </span>
              </div>
            </div>
          </div>
          {isTechnicalQaRecord(context.course.title) && (
            <details className="audit-disclosure">
              <summary>Nguồn gốc và phạm vi quản lý</summary>
              <p className="mt-1.5">Tên gốc: {context.course.title}</p>
              <p>Bản ghi dữ liệu đối chiếu nội bộ hệ thống.</p>
            </details>
          )}
        </section>
      )}

      {error && (
        <p role="alert" className="state-error text-sm font-medium">
          {error}
        </p>
      )}
      {message && (
        <p
          role="status"
          className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-900"
        >
          {message}
        </p>
      )}

      {/* Main 2-Column Workspace Grid */}
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        {/* Left Column: Existing Versions List & Audit Timeline */}
        <section className="space-y-4" aria-label="Danh sách phiên bản chương trình">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900">
              Danh sách phiên bản ({rows.length})
            </h2>
            <span className="text-xs font-medium text-slate-500">
              Phiên bản đã phê duyệt được áp dụng chính thức
            </span>
          </div>

          {rows.length === 0 ? (
            <div className="workspace-card text-center text-sm text-slate-600">
              Chưa có phiên bản điều khoản nào được khởi tạo cho chương trình này.
            </div>
          ) : (
            <ul className="space-y-4">
              {rows.map((v) => {
                const badgeClass = VERSION_BADGE_STYLE[v.state] ?? 'badge-draft';
                const formattedTuition =
                  v.standardTuitionFeeVnd === null
                    ? 'Chưa xác định chuẩn học phí'
                    : new Intl.NumberFormat('vi-VN').format(v.standardTuitionFeeVnd) + ' VND';

                return (
                  <li key={v.id} className="workspace-card space-y-4">
                    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-3.5">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2.5">
                          <span className="inline-flex items-center rounded-lg bg-indigo-600 px-2.5 py-0.5 text-xs font-extrabold text-white">
                            v{v.number}
                          </span>
                          <h3 className="text-lg font-bold text-slate-950">
                            v{v.number} ·{' '}
                            {isTechnicalQaRecord(v.title) ? 'Điều khoản QA' : v.title}
                          </h3>
                        </div>
                        <p className="text-sm text-slate-600">{v.description}</p>
                      </div>
                      <span className={badgeClass}>{academicState(v.state)}</span>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="workspace-subcard">
                        <p className="text-xs font-semibold text-slate-500">Chuẩn học phí</p>
                        <p className="mt-1 text-base font-bold text-indigo-950">
                          {formattedTuition}
                        </p>
                      </div>
                      <div className="workspace-subcard">
                        <p className="text-xs font-semibold text-slate-500">Thời điểm hiệu lực</p>
                        <p className="mt-1 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-800">
                          <CalendarClock size={15} className="text-indigo-600" aria-hidden="true" />
                          Hiệu lực {schoolDate(v.effectiveFrom)}
                        </p>
                      </div>
                    </div>

                    {isTechnicalQaRecord(v.title) && (
                      <details className="audit-disclosure">
                        <summary>Điều khoản gốc và thông tin đối chiếu</summary>
                        <p className="mt-1.5">Tên đã công bố: {v.title}</p>
                        <p>
                          Học phí chuẩn {formattedTuition} · hiệu lực {schoolDate(v.effectiveFrom)}
                        </p>
                      </details>
                    )}

                    {/* Action Toolbar: Separated Maker vs History Controls */}
                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
                      <button
                        type="button"
                        className={control + ' inline-flex items-center gap-1.5 text-xs font-semibold'}
                        onClick={() =>
                          void run(async () => {
                            setDetail(await planningApi.get<Version>('versions/' + v.id));
                          })
                        }
                      >
                        <History size={14} aria-hidden="true" />
                        Xem lịch sử
                      </button>

                      <div className="flex flex-wrap items-center gap-2">
                        {v.state === 'DRAFT' && v.proposedBy === user?.id && (
                          <>
                            <button
                              type="button"
                              className={
                                control + ' inline-flex items-center gap-1.5 text-xs font-semibold'
                              }
                              onClick={() => {
                                setEdit(v);
                                setForm({
                                  title: v.title,
                                  description: v.description,
                                  standardPricingType: v.standardPricingType ?? '',
                                  standardTuitionFeeVnd: String(v.standardTuitionFeeVnd ?? ''),
                                  effectiveFrom: schoolInput(v.effectiveFrom),
                                  reason: '',
                                });
                              }}
                            >
                              <FileEdit size={14} aria-hidden="true" />
                              Sửa phiên bản nháp
                            </button>
                            <button
                              type="button"
                              className="btn-primary px-3.5 py-2 text-xs"
                              disabled={busy}
                              onClick={() => setPendingSubmit(v)}
                            >
                              Gửi duyệt phiên bản
                            </button>
                          </>
                        )}
                        {v.state === 'PENDING_APPROVAL' && v.proposedBy === user?.id && (
                          <button
                            type="button"
                            className={control + ' text-xs font-semibold'}
                            disabled={busy}
                            onClick={() =>
                              void run(async () => {
                                await planningApi.write('versions/' + v.id + '/return-to-draft', {
                                  expectedLockVersion: v.lockVersion,
                                  reason: form.reason || v.reason,
                                });
                                setMessage('Đã rút phiên bản về trạng thái nháp để chỉnh sửa.');
                              })
                            }
                          >
                            Rút về nháp để sửa
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {detail && (
            <div className="workspace-card border-indigo-200 bg-indigo-50/40 space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-indigo-950">
                  Lịch sử cập nhật phiên bản v{detail.number}
                </h3>
                <button
                  type="button"
                  onClick={() => setDetail(undefined)}
                  className="text-xs font-semibold text-slate-500 hover:text-slate-800"
                >
                  Đóng
                </button>
              </div>
              <ol className="list-inside list-decimal space-y-1.5 text-sm text-slate-700">
                {(
                  (detail as Version & {
                    history?: { id: string; nextState: string; reason: string }[];
                  }).history ?? []
                ).map((h) => (
                  <li key={h.id}>
                    <span className="font-semibold">{h.nextState}</span> · {h.reason}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </section>

        {/* Right Column: Maker Form & Post-Approval Class Offering Creation */}
        <div className="space-y-6">
          {/* Card 1: Maker Proposal / Draft Editor */}
          <form onSubmit={save} className="workspace-card space-y-4">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <span className="badge-draft">Biên soạn phiên bản</span>
                <h2 className="mt-1.5 text-lg font-bold text-slate-950">
                  {edit ? 'Sửa phiên bản nháp v' + edit.number : 'Đề xuất phiên bản mới'}
                </h2>
              </div>
              {edit && (
                <button
                  type="button"
                  onClick={() => setEdit(undefined)}
                  className="text-xs font-semibold text-indigo-700 hover:underline"
                >
                  Hủy chế độ sửa
                </button>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block space-y-1 text-sm font-semibold text-slate-700 sm:col-span-2">
                Tên chuẩn phiên bản
                <input
                  className={control + ' block w-full'}
                  required
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="Ví dụ: Chuẩn đầu ra & học phí học kỳ mới"
                />
              </label>

              <label className="block space-y-1 text-sm font-semibold text-slate-700 sm:col-span-2">
                Mô tả và điều khoản học vụ
                <textarea
                  className={control + ' block w-full'}
                  rows={2}
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                />
              </label>

              <label className="block space-y-1 text-sm font-semibold text-slate-700">
                Trạng thái chuẩn học phí
                <select
                  className={control + ' block w-full'}
                  value={form.standardPricingType}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      standardPricingType: e.target.value,
                      standardTuitionFeeVnd: '',
                    }))
                  }
                >
                  <option value="">Chưa xác định</option>
                  <option value="FREE">Miễn phí (0 VND đã xác nhận)</option>
                  <option value="PAID">Có học phí</option>
                </select>
              </label>

              <label className="block space-y-1 text-sm font-semibold text-slate-700">
                Học phí chuẩn (VND)
                <input
                  type="number"
                  className={control + ' block w-full disabled:bg-slate-100 disabled:text-slate-400'}
                  min={1}
                  max={1000000000}
                  disabled={form.standardPricingType !== 'PAID'}
                  required={form.standardPricingType === 'PAID'}
                  value={form.standardTuitionFeeVnd}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, standardTuitionFeeVnd: e.target.value }))
                  }
                />
              </label>

              <label className="block space-y-1 text-sm font-semibold text-slate-700 sm:col-span-2">
                Hiệu lực từ
                <input
                  type="datetime-local"
                  className={control + ' block w-full'}
                  required
                  value={form.effectiveFrom}
                  onChange={(e) => setForm((f) => ({ ...f, effectiveFrom: e.target.value }))}
                />
              </label>

              <label className="block space-y-1 text-sm font-semibold text-slate-700 sm:col-span-2">
                Lý do phiên bản
                <textarea
                  className={control + ' block w-full'}
                  rows={2}
                  required
                  minLength={10}
                  value={form.reason}
                  onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                  placeholder="Tối thiểu 10 ký tự nêu rõ căn cứ tạo hoặc điều chỉnh phiên bản"
                />
              </label>
            </div>

            <div className="flex items-center justify-end border-t border-slate-100 pt-3">
              <button type="submit" className="btn-primary text-sm" disabled={busy}>
                <Sparkles size={16} aria-hidden="true" />
                Lưu phiên bản nháp
              </button>
            </div>
          </form>

          {/* Card 2: Create Class Offering from Approved Version */}
          {publishedVersions.length > 0 && (
            <form
              onSubmit={createApprovedClass}
              className="workspace-card space-y-4 border-emerald-200/80"
            >
              <div className="border-b border-slate-100 pb-3">
                <span className="badge-published">
                  <FileCheck2 size={13} aria-hidden="true" />
                  Khai thác chuẩn đã duyệt
                </span>
                <h2 className="mt-1.5 text-lg font-bold text-slate-950">
                  Tạo lớp từ phiên bản đã phê duyệt
                </h2>
                <p className="mt-1 text-xs leading-relaxed text-slate-600">
                  Lớp học tạo theo phiên bản này sẽ áp dụng mức học phí và chương trình học đã được phê duyệt chính thức.
                </p>
              </div>

              <div className="grid gap-3.5 sm:grid-cols-2">
                <label className="block space-y-1 text-sm font-semibold text-slate-700 sm:col-span-2">
                  Phiên bản đã duyệt
                  <select
                    className={control + ' block w-full'}
                    required
                    value={classForm.versionId}
                    onChange={(e) => setClassForm((f) => ({ ...f, versionId: e.target.value }))}
                  >
                    <option value="">Chọn phiên bản đã công bố</option>
                    {publishedVersions.map((v) => (
                      <option key={v.id} value={v.id}>
                        v{v.number} · {isTechnicalQaRecord(v.title) ? 'Điều khoản QA' : v.title} ·{' '}
                        {new Intl.NumberFormat('vi-VN').format(v.standardTuitionFeeVnd!)} VND
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block space-y-1 text-sm font-semibold text-slate-700">
                  Mã lớp chuẩn
                  <input
                    className={control + ' block w-full'}
                    required
                    pattern="[A-Za-z0-9_\-]{2,60}"
                    value={classForm.code}
                    onChange={(e) => setClassForm((f) => ({ ...f, code: e.target.value }))}
                  />
                </label>

                <label className="block space-y-1 text-sm font-semibold text-slate-700">
                  Tên lớp chuẩn
                  <input
                    className={control + ' block w-full'}
                    required
                    value={classForm.name}
                    onChange={(e) => setClassForm((f) => ({ ...f, name: e.target.value }))}
                  />
                </label>

                <label className="block space-y-1 text-sm font-semibold text-slate-700">
                  Hình thức lớp
                  <select
                    className={control + ' block w-full'}
                    value={classForm.modality}
                    onChange={(e) => setClassForm((f) => ({ ...f, modality: e.target.value }))}
                  >
                    <option value="ONLINE">Trực tuyến (Online)</option>
                    <option value="OFFLINE">Trực tiếp tại cơ sở (Offline)</option>
                    <option value="HYBRID">Kết hợp (Hybrid)</option>
                  </select>
                </label>

                <label className="block space-y-1 text-sm font-semibold text-slate-700">
                  Sĩ số tối đa
                  <input
                    type="number"
                    className={control + ' block w-full'}
                    min={1}
                    max={1000}
                    required
                    value={classForm.maxStudents}
                    onChange={(e) =>
                      setClassForm((f) => ({ ...f, maxStudents: Number(e.target.value) }))
                    }
                  />
                </label>

                <label className="block space-y-1 text-sm font-semibold text-slate-700">
                  Mở tuyển sinh từ
                  <input
                    type="datetime-local"
                    className={control + ' block w-full'}
                    value={classForm.enrollmentStart}
                    onChange={(e) =>
                      setClassForm((f) => ({ ...f, enrollmentStart: e.target.value }))
                    }
                  />
                </label>

                <label className="block space-y-1 text-sm font-semibold text-slate-700">
                  Đóng tuyển sinh lúc
                  <input
                    type="datetime-local"
                    className={control + ' block w-full'}
                    value={classForm.enrollmentEnd}
                    onChange={(e) => setClassForm((f) => ({ ...f, enrollmentEnd: e.target.value }))}
                  />
                </label>

                <label className="block space-y-1 text-sm font-semibold text-slate-700">
                  Khai giảng dự kiến
                  <input
                    type="datetime-local"
                    className={control + ' block w-full'}
                    value={classForm.classStart}
                    onChange={(e) => setClassForm((f) => ({ ...f, classStart: e.target.value }))}
                  />
                </label>

                <label className="block space-y-1 text-sm font-semibold text-slate-700">
                  Kết thúc dự kiến
                  <input
                    type="datetime-local"
                    className={control + ' block w-full'}
                    value={classForm.classEnd}
                    onChange={(e) => setClassForm((f) => ({ ...f, classEnd: e.target.value }))}
                  />
                </label>

                <label className="block space-y-1 text-sm font-semibold text-slate-700 sm:col-span-2">
                  Lý do mở lớp từ phiên bản đã duyệt
                  <textarea
                    className={control + ' block w-full'}
                    rows={2}
                    required
                    minLength={10}
                    value={classForm.reason}
                    onChange={(e) => setClassForm((f) => ({ ...f, reason: e.target.value }))}
                  />
                </label>
              </div>

              <div className="flex justify-end border-t border-slate-100 pt-3">
                <button
                  type="submit"
                  className="btn-secondary text-sm"
                  disabled={busy || !selectedPublished}
                >
                  <Building2 size={16} aria-hidden="true" />
                  Tạo lớp học
                </button>
              </div>
            </form>
          )}

          {/* Card 3: Approved Classes Bound to Version */}
          {!!context?.approvedClasses?.length && (
            <section className="workspace-card space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h2 className="text-lg font-bold text-slate-950">
                  Các lớp áp dụng phiên bản này
                </h2>
                <span className="badge-published">{context.approvedClasses.length} lớp</span>
              </div>
              <ul className="space-y-3">
                {context.approvedClasses.map((c) => (
                  <li key={c.id} className="workspace-subcard space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-bold text-slate-900">
                        {isTechnicalQaRecord(c.code + ' ' + c.name)
                          ? 'Lớp QA đã duyệt · Đang tuyển sinh'
                          : `${c.code} · ${c.name}`}
                      </p>
                      <span className="badge-info">{c.modality}</span>
                    </div>
                    <p className="text-sm text-slate-700">
                      Học phí cố định:{' '}
                      <strong className="text-indigo-950">
                        {new Intl.NumberFormat('vi-VN').format(c.approvedTuitionFeeVnd ?? 0)} VND
                      </strong>{' '}
                      · quyền học ACTIVE: <strong>{c.activeRightCount}</strong>
                    </p>
                    <div className="flex flex-wrap gap-3 pt-1 text-sm font-semibold">
                      <Link
                        className="inline-flex items-center gap-1 text-indigo-700 hover:underline"
                        to={'/classes/' + c.id}
                      >
                        <ClipboardCheck size={14} aria-hidden="true" />
                        Mở lớp đã duyệt
                      </Link>
                      <Link
                        className="inline-flex items-center gap-1 text-slate-700 hover:text-indigo-700 hover:underline"
                        to={'/academic/classes/' + c.id}
                      >
                        Quản lý lớp học vụ
                      </Link>
                    </div>
                    {isTechnicalQaRecord(c.code + ' ' + c.name) && (
                      <details className="audit-disclosure">
                        <summary>Thông tin lớp gốc</summary>
                        <p className="mt-1">
                          {c.code} · {c.name} · trạng thái {c.status}
                        </p>
                      </details>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(pendingSubmit)}
        title="Gửi duyệt phiên bản điều khoản?"
        description="Sau khi gửi duyệt, phiên bản sẽ chuyển sang trạng thái chờ phê duyệt. Bạn có chắc chắn muốn gửi không?"
        confirmLabel="Xác nhận gửi duyệt"
        cancelLabel="Ở lại"
        busy={busy}
        onCancel={() => setPendingSubmit(undefined)}
        onConfirm={() => {
          if (!pendingSubmit) return;
          const targetVersion = pendingSubmit;
          void run(async () => {
            await planningApi.write('versions/' + targetVersion.id + '/submit', {
              expectedLockVersion: targetVersion.lockVersion,
              reason: targetVersion.reason,
            });
            setPendingSubmit(undefined);
            setMessage('Đã gửi yêu cầu phê duyệt phiên bản thành công.');
          });
        }}
      >
        {pendingSubmit && (
          <div className="space-y-1">
            <p className="font-bold text-slate-900">
              v{pendingSubmit.number} ·{' '}
              {isTechnicalQaRecord(pendingSubmit.title) ? 'Điều khoản QA' : pendingSubmit.title}
            </p>
            <p>
              Chuẩn học phí:{' '}
              <strong>
                {pendingSubmit.standardTuitionFeeVnd === null
                  ? 'Chưa xác định chuẩn học phí'
                  : new Intl.NumberFormat('vi-VN').format(pendingSubmit.standardTuitionFeeVnd) +
                    ' VND'}
              </strong>
            </p>
          </div>
        )}
      </ConfirmDialog>
    </main>
  );
}
