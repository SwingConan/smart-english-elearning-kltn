import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { Link } from 'react-router';
import {
  Archive,
  CheckCircle2,
  Clock,
  Download,
  ExternalLink,
  FileText,
  Paperclip,
  Settings2,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import { button, field, type Activity } from './api';
import {
  formatFileSize,
  formatRemainingTime,
  lmsLocalApi,
  type AssignmentConfig,
  type AssignmentWorkspace,
  type StudentSubmission,
} from './lms-local-api';
import { schoolTimestamp } from './school-time';

export type Submission = StudentSubmission;

function toLocalDateTimeInput(iso: string | null): string {
  if (!iso) return '';
  const ms = new Date(iso).getTime();
  if (!Number.isFinite(ms)) return '';
  return new Date(ms + 7 * 3600 * 1000).toISOString().slice(0, 16);
}

export function AssignmentPanel({
  classId,
  activity,
  onActivityRefresh,
}: {
  classId: string;
  activity: Activity;
  onActivityRefresh?: () => void;
}) {
  // Strictly allow Assignment UI ONLY on ASSIGNMENT activities
  if (activity.type !== 'ASSIGNMENT') return null;

  const [workspace, setWorkspace] = useState<AssignmentWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Student inline drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [textDraft, setTextDraft] = useState('');
  const [stagedFiles, setStagedFiles] = useState<File[]>([]);
  const [removeFileIds, setRemoveFileIds] = useState<string[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Teacher settings panel state
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [cfgForm, setCfgForm] = useState({
    maxFiles: 20,
    maxFileSizeMb: 10,
    allowFile: true,
    allowText: true,
    allowAudio: false,
    allowLate: false,
    allowResubmit: true,
    acceptedExtensions: '',
    promptUrl: '',
    maxScore: 10,
    availableFrom: '',
    availableUntil: '',
  });
  const [cfgSaving, setCfgSaving] = useState(false);
  const [promptUploading, setPromptUploading] = useState(false);

  const loadWorkspace = useCallback(async () => {
    setLoading(true);
    try {
      const data = await lmsLocalApi.getWorkspace(classId, activity.id);
      setWorkspace(data);
      setTextDraft(data.mySubmission?.text ?? '');
      setCfgForm({
        maxFiles: data.config.maxFiles,
        maxFileSizeMb: data.config.maxFileSizeMb,
        allowFile: data.config.allowFile,
        allowText: data.config.allowText,
        allowAudio: data.config.allowAudio,
        allowLate: data.config.allowLate,
        allowResubmit: data.config.allowResubmit,
        acceptedExtensions: data.config.acceptedExtensions,
        promptUrl: data.config.promptUrl ?? '',
        maxScore: data.config.maxScore,
        availableFrom: toLocalDateTimeInput(data.activity.availableFrom),
        availableUntil: toLocalDateTimeInput(data.activity.availableUntil),
      });
      setError('');
    } catch (e: unknown) {
      setError(
        e instanceof Error && e.message
          ? e.message
          : 'Không thể tải thông tin bài tập lúc này. Vui lòng thử lại.',
      );
    } finally {
      setLoading(false);
    }
  }, [classId, activity.id]);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  const config = workspace?.config;
  const remaining = useMemo(
    () => formatRemainingTime(workspace?.activity?.availableUntil ?? activity.availableUntil),
    [workspace?.activity?.availableUntil, activity.availableUntil],
  );

  // Student staged validation
  const retainedExistingFiles = useMemo(() => {
    const existing = workspace?.mySubmission?.files ?? [];
    return existing.filter((f) => !removeFileIds.includes(f.id));
  }, [workspace?.mySubmission?.files, removeFileIds]);

  function addCandidateFiles(incoming: FileList | File[]) {
    if (!config) return;
    setError('');
    const list = Array.from(incoming);
    if (list.length === 0) return;

    const maxBytes = config.maxFileSizeMb * 1024 * 1024;
    const allowedSet = new Set(
      config.acceptedExtensions
        .split(/[\s,;]+/)
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
        .map((s) => (s.startsWith('.') ? s : `.${s}`)),
    );

    const errors: string[] = [];
    const accepted: File[] = [];
    let currentTotal = retainedExistingFiles.length + stagedFiles.length;

    for (const f of list) {
      if (currentTotal >= config.maxFiles) {
        errors.push(`Đã đạt giới hạn tối đa ${config.maxFiles} tệp đính kèm.`);
        break;
      }
      if (f.size <= 0) {
        errors.push(`Tệp "${f.name}" bị rỗng (0 B).`);
        continue;
      }
      if (f.size > maxBytes) {
        errors.push(
          `Tệp "${f.name}" (${formatFileSize(f.size)}) vượt quá giới hạn ${config.maxFileSizeMb} MB.`,
        );
        continue;
      }
      const dotIdx = f.name.lastIndexOf('.');
      const ext = dotIdx >= 0 ? f.name.slice(dotIdx).toLowerCase() : '';
      if (allowedSet.size > 0 && !allowedSet.has(ext)) {
        errors.push(`Tệp "${f.name}" có định dạng ${ext || '(không rõ)'} chưa được cho phép.`);
        continue;
      }
      const duplicate = stagedFiles.some(
        (existing) => existing.name === f.name && existing.size === f.size,
      );
      if (!duplicate) {
        accepted.push(f);
        currentTotal += 1;
      }
    }

    if (accepted.length > 0) {
      setStagedFiles((prev) => [...prev, ...accepted]);
    }
    if (errors.length > 0) {
      setError(errors.join(' '));
    }
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addCandidateFiles(e.dataTransfer.files);
    }
  }

  function openSubmissionDrawer() {
    setError('');
    setNotice('');
    setTextDraft(workspace?.mySubmission?.text ?? '');
    setStagedFiles([]);
    setRemoveFileIds([]);
    setDrawerOpen(true);
  }

  function cancelSubmissionDrawer() {
    setError('');
    setStagedFiles([]);
    setRemoveFileIds([]);
    setTextDraft(workspace?.mySubmission?.text ?? '');
    setDrawerOpen(false);
  }

  async function saveStudentSubmission() {
    if (!config) return;
    setError('');
    setNotice('');
    const totalFiles = retainedExistingFiles.length + stagedFiles.length;
    const trimmedText = textDraft.trim();

    if (totalFiles === 0 && !trimmedText) {
      setError('Vui lòng đính kèm ít nhất một tệp hoặc nhập nội dung văn bản trước khi lưu bài nộp.');
      return;
    }
    if (totalFiles > config.maxFiles) {
      setError(`Số tệp đính kèm không được vượt quá ${config.maxFiles}.`);
      return;
    }

    setSubmitting(true);
    try {
      const updated = await lmsLocalApi.saveSubmission(classId, activity.id, {
        text: config.allowText ? textDraft : undefined,
        mode: 'SUBMIT',
        removeFileIds,
        files: stagedFiles,
      });
      setWorkspace(updated);
      setStagedFiles([]);
      setRemoveFileIds([]);
      setDrawerOpen(false);
      setNotice('Đã lưu bài nộp thành công. Hệ thống đã ghi nhận biên nhận và tệp đính kèm của bạn.');
    } catch (e: unknown) {
      setError(
        e instanceof Error && e.message
          ? e.message
          : 'Không thể lưu bài nộp lúc này. Các tệp bạn đang chọn vẫn được giữ lại để thử lại.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function saveTeacherConfig() {
    if (cfgForm.availableFrom && cfgForm.availableUntil) {
      const fromMs = new Date(cfgForm.availableFrom + ':00+07:00').getTime();
      const untilMs = new Date(cfgForm.availableUntil + ':00+07:00').getTime();
      if (Number.isFinite(fromMs) && Number.isFinite(untilMs) && untilMs <= fromMs) {
        setError('Hạn nộp bài phải sau thời gian mở bài.');
        return;
      }
    }
    setCfgSaving(true);
    setError('');
    setNotice('');
    try {
      await lmsLocalApi.updateConfig(classId, activity.id, {
        maxFiles: cfgForm.maxFiles,
        maxFileSizeMb: cfgForm.maxFileSizeMb,
        allowFile: cfgForm.allowFile,
        allowText: cfgForm.allowText,
        allowAudio: cfgForm.allowAudio,
        allowLate: cfgForm.allowLate,
        allowResubmit: cfgForm.allowResubmit,
        acceptedExtensions: cfgForm.acceptedExtensions,
        promptUrl: cfgForm.promptUrl.trim() || null,
        maxScore: cfgForm.maxScore,
        availableFrom: cfgForm.availableFrom
          ? new Date(cfgForm.availableFrom + ':00+07:00').toISOString()
          : null,
        availableUntil: cfgForm.availableUntil
          ? new Date(cfgForm.availableUntil + ':00+07:00').toISOString()
          : null,
        syncPublishedDates: true,
      });
      await loadWorkspace();
      onActivityRefresh?.();
      setSettingsOpen(false);
      setNotice('Đã lưu cấu hình bài tập và đồng bộ thời hạn lên lịch học.');
    } catch (e: unknown) {
      setError(e instanceof Error && e.message ? e.message : 'Không thể lưu cấu hình bài tập.');
    } finally {
      setCfgSaving(false);
    }
  }

  async function handleUploadPromptFile(file: File | undefined) {
    if (!file) return;
    setPromptUploading(true);
    setError('');
    setNotice('');
    try {
      await lmsLocalApi.uploadPromptFile(classId, activity.id, file);
      await loadWorkspace();
      setNotice(`Đã đính kèm tệp đề bài "${file.name}".`);
    } catch (e: unknown) {
      setError(e instanceof Error && e.message ? e.message : 'Không thể tải tệp đề bài lên.');
    } finally {
      setPromptUploading(false);
    }
  }

  async function handleDeletePromptFile(fileId: string) {
    setError('');
    setNotice('');
    try {
      await lmsLocalApi.deletePromptFile(classId, activity.id, fileId);
      await loadWorkspace();
      setNotice('Đã xóa tệp đề bài đính kèm.');
    } catch (e: unknown) {
      setError(e instanceof Error && e.message ? e.message : 'Không thể xóa tệp đề bài.');
    }
  }

  if (loading && !workspace) {
    return (
      <section className="rounded-2xl border bg-white p-6" role="status">
        <p className="text-sm text-slate-500">Đang tải thông tin bài tập và bài nộp…</p>
      </section>
    );
  }

  const promptFiles = config?.promptFiles ?? [];
  const promptUrl = config?.promptUrl ?? null;

  return (
    <div className="space-y-6">
      {(promptFiles.length > 0 || promptUrl) && (
        <section
          aria-label="Tài liệu đề bài kèm theo"
          className="rounded border border-slate-200 bg-[#f8f9fa] p-4 space-y-2.5"
        >
          <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
            <Paperclip className="size-4 text-indigo-600" aria-hidden="true" />
            Tài liệu và tệp đề bài đính kèm
          </h2>
          <div className="flex flex-wrap gap-2.5">
            {promptUrl && (
              <a
                href={promptUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-[#e66f2b] hover:underline"
              >
                <ExternalLink className="size-4" aria-hidden="true" />
                Mở liên kết hướng dẫn
              </a>
            )}
            {promptFiles.map((pf) => (
              <div
                key={pf.id}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
              >
                <FileText className="size-4 text-slate-600 shrink-0" aria-hidden="true" />
                <a
                  href={lmsLocalApi.promptFileUrl(classId, activity.id, pf.id)}
                  className="font-semibold text-indigo-700 hover:underline"
                >
                  {pf.name}
                </a>
                <span className="text-xs text-slate-500">({formatFileSize(pf.bytes)})</span>
                {workspace?.editable && (
                  <button
                    type="button"
                    onClick={() => void handleDeletePromptFile(pf.id)}
                    className="ml-1 rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-700"
                    title="Xóa tệp đề bài"
                  >
                    <Trash2 className="size-3.5" aria-hidden="true" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {error && (
        <p
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-900"
        >
          {error}
        </p>
      )}

      {notice && (
        <p
          role="status"
          className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900"
        >
          {notice}
        </p>
      )}

      {workspace?.editable ? (
        /* ========================= INSTRUCTOR VIEW ========================= */
        <section
          aria-label="Quản lý bài tập và bài nộp"
          className="space-y-6 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-2xs"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-xl font-extrabold text-slate-900">
                Quản lý bài nộp của học viên
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                {workspace.activity.availableFrom
                  ? `Mở từ ${schoolTimestamp(workspace.activity.availableFrom)} · `
                  : ''}
                {workspace.activity.availableUntil
                  ? `Hạn nộp: ${schoolTimestamp(workspace.activity.availableUntil)}`
                  : 'Chưa đặt hạn nộp'}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={button + ' gap-1.5 text-sm'}
                onClick={() => setSettingsOpen((v) => !v)}
              >
                <Settings2 className="size-4" aria-hidden="true" />
                {settingsOpen ? 'Đóng cấu hình' : 'Cấu hình nộp bài'}
              </button>
              <Link
                className={button + ' text-sm'}
                to={`/classroom/${classId}/activities/${activity.id}/grading`}
              >
                Chấm theo Rubric
              </Link>
              {workspace.submissions && workspace.submissions.length > 0 ? (
                <a
                  href={lmsLocalApi.submissionsZipUrl(classId, activity.id)}
                  className="inline-flex items-center gap-2 rounded bg-[#76a35e] px-4 py-2 text-sm font-bold text-white shadow-xs transition hover:bg-[#658f50]"
                >
                  <Archive className="size-4" aria-hidden="true" />
                  Tải toàn bộ bài nộp (.ZIP)
                </a>
              ) : (
                <button
                  type="button"
                  disabled
                  className="inline-flex cursor-not-allowed items-center gap-2 rounded-xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-400"
                >
                  <Archive className="size-4" aria-hidden="true" />
                  Tải toàn bộ bài nộp (.ZIP)
                </button>
              )}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
              <p className="text-xs font-semibold text-slate-500">Học viên trong lớp</p>
              <p className="mt-1 text-2xl font-extrabold text-slate-900">
                {workspace.stats?.enrolledCount ?? 0}
              </p>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3.5">
              <p className="text-xs font-semibold text-emerald-700">Đã nộp bài</p>
              <p className="mt-1 text-2xl font-extrabold text-emerald-950">
                {workspace.stats?.submittedCount ?? 0}
              </p>
            </div>
            <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-3.5">
              <p className="text-xs font-semibold text-indigo-700">Đã công bố điểm</p>
              <p className="mt-1 text-2xl font-extrabold text-indigo-950">
                {workspace.stats?.gradedCount ?? 0}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
              <p className="text-xs font-semibold text-slate-500">Giới hạn đính kèm</p>
              <p className="mt-1 text-base font-bold text-slate-900">
                Tối đa {config?.maxFiles} tệp · {config?.maxFileSizeMb} MB/tệp
              </p>
            </div>
          </div>

          {settingsOpen && (
            <section
              aria-label="Thiết lập bài tập IUH"
              className="space-y-4 rounded border border-[#76a35e]/45 bg-[#f4f9f1] p-5"
            >
              <h3 className="text-base font-bold text-[#2f5d1e]">
                Thiết lập quy định nộp bài & tài liệu đề bài
              </h3>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <label className="block text-sm font-semibold text-slate-700">
                  Số tệp tối đa (1–50)
                  <input
                    type="number"
                    min={1}
                    max={50}
                    className={field + ' mt-1'}
                    value={cfgForm.maxFiles}
                    onChange={(e) =>
                      setCfgForm((prev) => ({ ...prev, maxFiles: Number(e.target.value) || 1 }))
                    }
                  />
                </label>
                <label className="block text-sm font-semibold text-slate-700">
                  Dung lượng tối đa mỗi tệp (MB)
                  <input
                    type="number"
                    min={1}
                    max={50}
                    className={field + ' mt-1'}
                    value={cfgForm.maxFileSizeMb}
                    onChange={(e) =>
                      setCfgForm((prev) => ({
                        ...prev,
                        maxFileSizeMb: Number(e.target.value) || 1,
                      }))
                    }
                  />
                </label>
                <label className="block text-sm font-semibold text-slate-700">
                  Thang điểm tối đa
                  <input
                    type="number"
                    min={1}
                    max={100}
                    className={field + ' mt-1'}
                    value={cfgForm.maxScore}
                    onChange={(e) =>
                      setCfgForm((prev) => ({ ...prev, maxScore: Number(e.target.value) || 10 }))
                    }
                  />
                </label>
                <label className="block text-sm font-semibold text-slate-700">
                  Ngày mở nộp bài (giờ Việt Nam)
                  <input
                    type="datetime-local"
                    className={field + ' mt-1'}
                    value={cfgForm.availableFrom}
                    onChange={(e) =>
                      setCfgForm((prev) => ({ ...prev, availableFrom: e.target.value }))
                    }
                  />
                </label>
                <label className="block text-sm font-semibold text-slate-700">
                  Hạn nộp (giờ Việt Nam)
                  <input
                    type="datetime-local"
                    className={field + ' mt-1'}
                    value={cfgForm.availableUntil}
                    onChange={(e) =>
                      setCfgForm((prev) => ({ ...prev, availableUntil: e.target.value }))
                    }
                  />
                </label>
                <label className="block text-sm font-semibold text-slate-700">
                  Liên kết tài liệu đề bài HTTPS
                  <input
                    type="url"
                    placeholder="https://..."
                    className={field + ' mt-1'}
                    value={cfgForm.promptUrl}
                    onChange={(e) => setCfgForm((prev) => ({ ...prev, promptUrl: e.target.value }))}
                  />
                </label>
              </div>

              <label className="block text-sm font-semibold text-slate-700">
                Định dạng tệp cho phép (ngăn cách bởi dấu phẩy)
                <input
                  type="text"
                  className={field + ' mt-1 font-mono text-xs'}
                  value={cfgForm.acceptedExtensions}
                  onChange={(e) =>
                    setCfgForm((prev) => ({ ...prev, acceptedExtensions: e.target.value }))
                  }
                />
              </label>

              <div className="flex flex-wrap gap-5 pt-1 text-sm font-medium text-slate-800">
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={cfgForm.allowFile}
                    onChange={(e) => setCfgForm((p) => ({ ...p, allowFile: e.target.checked }))}
                  />
                  Nộp tệp đính kèm
                </label>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={cfgForm.allowText}
                    onChange={(e) => setCfgForm((p) => ({ ...p, allowText: e.target.checked }))}
                  />
                  Văn bản trực tuyến
                </label>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={cfgForm.allowAudio}
                    onChange={(e) => setCfgForm((p) => ({ ...p, allowAudio: e.target.checked }))}
                  />
                  Ghi âm / Tệp Audio
                </label>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={cfgForm.allowResubmit}
                    onChange={(e) => setCfgForm((p) => ({ ...p, allowResubmit: e.target.checked }))}
                  />
                  Cho phép sửa / nộp lại trước hạn
                </label>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={cfgForm.allowLate}
                    onChange={(e) => setCfgForm((p) => ({ ...p, allowLate: e.target.checked }))}
                  />
                  Cho phép nộp muộn sau hạn
                </label>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-indigo-200/70 pt-3">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-indigo-300 bg-white px-3.5 py-2 text-sm font-semibold text-indigo-800 hover:bg-indigo-50">
                  <UploadCloud className="size-4" aria-hidden="true" />
                  {promptUploading ? 'Đang tải tệp đề bài…' : 'Đính kèm thêm tệp đề bài'}
                  <input
                    type="file"
                    className="sr-only"
                    disabled={promptUploading}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = '';
                      void handleUploadPromptFile(f);
                    }}
                  />
                </label>

                <div className="flex gap-2">
                  <button
                    type="button"
                    className={button}
                    onClick={() => setSettingsOpen(false)}
                    disabled={cfgSaving}
                  >
                    Đóng
                  </button>
                  <button
                    type="button"
                    disabled={cfgSaving}
                    onClick={() => void saveTeacherConfig()}
                    className="rounded bg-[#76a35e] px-5 py-2 text-sm font-bold text-white hover:bg-[#658f50] disabled:opacity-50"
                  >
                    {cfgSaving ? 'Đang lưu…' : 'Lưu cấu hình'}
                  </button>
                </div>
              </div>
            </section>
          )}

          {workspace.submissions && workspace.submissions.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/70 p-8 text-center">
              <p className="text-sm font-semibold text-slate-700">Chưa có bài nộp nào trong lớp.</p>
              <p className="mt-1 text-xs text-slate-500">
                Bài nháp chưa xác nhận của học viên không hiển thị cho đến khi học viên bấm &quot;Lưu bài nộp&quot;.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {workspace.submissions?.map((sub) => (
                <TeacherSubmissionCard
                  key={sub.id}
                  classId={classId}
                  activityId={activity.id}
                  submission={sub}
                  maxScore={config?.maxScore ?? 10}
                  onGraded={() => void loadWorkspace()}
                />
              ))}
            </div>
          )}
        </section>
      ) : (
        /* ========================= STUDENT IUH VIEW ========================= */
        <section
          aria-label="Bài nộp của bạn"
          className="space-y-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-semibold text-[#e66f2b]">Trạng thái bài nộp</h2>
            <Link
              className="text-sm font-medium text-[#e66f2b] hover:underline"
              to={`/classroom/${classId}/gradebook`}
            >
              Xem bảng điểm lớp →
            </Link>
          </div>

          <div className="overflow-hidden rounded border border-slate-200 bg-white">
            <table className="w-full border-collapse text-left text-sm bg-white">
              <tbody className="divide-y divide-slate-200">
                <tr>
                  <th className="w-56 border-r border-slate-200 bg-[#f8f9fa] px-4 py-2.5 font-semibold text-slate-800">
                    Trạng thái bài nộp
                  </th>
                  <td
                    className={`px-4 py-2.5 ${
                      workspace?.mySubmission?.state === 'SUBMITTED'
                        ? 'bg-[#dcfce7] font-medium text-emerald-950'
                        : 'text-slate-700'
                    }`}
                  >
                    {workspace?.mySubmission?.state === 'SUBMITTED' ? (
                      <span className="inline-flex items-center gap-1.5 font-medium text-emerald-950">
                        <CheckCircle2 className="size-4 text-emerald-700" aria-hidden="true" />
                        Đã nộp để chấm
                        {workspace.mySubmission.late ? ' (Nộp muộn)' : ''}
                      </span>
                    ) : workspace?.mySubmission?.state === 'DRAFT' ? (
                      <span className="inline-flex rounded bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-900">
                        Bản nháp chưa nộp
                      </span>
                    ) : (
                      <span className="text-slate-600">Chưa có bài nộp</span>
                    )}
                  </td>
                </tr>

                <tr>
                  <th className="w-56 border-r border-slate-200 bg-[#f8f9fa] px-4 py-2.5 font-semibold text-slate-800">
                    Trạng thái chấm điểm
                  </th>
                  <td
                    className={`px-4 py-2.5 ${
                      workspace?.mySubmission?.directGrade?.state === 'PUBLISHED' ||
                      workspace?.mySubmission?.rubricGradingState === 'PUBLISHED'
                        ? 'bg-[#dcfce7] font-medium text-emerald-950'
                        : 'text-slate-700'
                    }`}
                  >
                    {workspace?.mySubmission?.directGrade?.state === 'PUBLISHED' ? (
                      <span>Đã chấm và công bố điểm</span>
                    ) : workspace?.mySubmission?.rubricGradingState === 'PUBLISHED' ? (
                      <span>Đã công bố điểm Rubric</span>
                    ) : workspace?.mySubmission?.rubricGradingState === 'PENDING_PUBLICATION' ? (
                      <span>Đã chấm · Đang chờ công bố</span>
                    ) : (
                      <span>Chưa chấm điểm</span>
                    )}
                  </td>
                </tr>

                <tr>
                  <th className="w-56 border-r border-slate-200 bg-[#f8f9fa] px-4 py-2.5 font-semibold text-slate-800">
                    Thời gian nộp
                  </th>
                  <td className="px-4 py-2.5 text-slate-700">
                    {workspace?.activity.availableFrom ? (
                      <span className="mr-3">
                        Mở: <strong>{schoolTimestamp(workspace.activity.availableFrom)}</strong>
                      </span>
                    ) : null}
                    {workspace?.activity.availableUntil ? (
                      <span>
                        Hạn nộp: <strong>{schoolTimestamp(workspace.activity.availableUntil)}</strong>
                      </span>
                    ) : (
                      <span className="text-slate-500">Không đặt hạn nộp (luyện tập tự do)</span>
                    )}
                  </td>
                </tr>

                {remaining && (
                  <tr>
                    <th className="w-56 border-r border-slate-200 bg-[#f8f9fa] px-4 py-2.5 font-semibold text-slate-800">
                      Thời gian còn lại
                    </th>
                    <td className="px-4 py-2.5">
                      <span
                        className={`inline-flex items-center gap-1.5 font-medium ${
                          remaining.overdue ? 'text-rose-700' : 'text-emerald-700'
                        }`}
                      >
                        <Clock className="size-4" aria-hidden="true" />
                        {remaining.text}
                      </span>
                    </td>
                  </tr>
                )}

                <tr>
                  <th className="w-56 border-r border-slate-200 bg-[#f8f9fa] px-4 py-2.5 font-semibold text-slate-800">
                    Chỉnh sửa lần cuối
                  </th>
                  <td className="px-4 py-2.5 text-slate-700">
                    {workspace?.mySubmission?.submittedAt
                      ? schoolTimestamp(workspace.mySubmission.submittedAt)
                      : workspace?.mySubmission?.updatedAt
                        ? schoolTimestamp(workspace.mySubmission.updatedAt)
                        : '—'}
                  </td>
                </tr>

                <tr>
                  <th className="w-56 border-r border-slate-200 bg-[#f8f9fa] px-4 py-2.5 align-top font-semibold text-slate-800">
                    Nộp tập tin ({workspace?.mySubmission?.files.length ?? 0})
                  </th>
                  <td className="px-4 py-2.5">
                    {!workspace?.mySubmission?.files.length ? (
                      <span className="text-slate-500">Chưa có tệp nào được nộp.</span>
                    ) : (
                      <ul className="space-y-1.5">
                        {workspace.mySubmission.files.map((f) => (
                          <li
                            key={f.id}
                            className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-200 bg-[#f8f9fa] px-3 py-1.5"
                          >
                            <div className="flex min-w-0 items-center gap-2">
                              <FileText className="size-4 shrink-0 text-[#2b7de9]" aria-hidden="true" />
                              <a
                                href={f.downloadUrl}
                                className="truncate font-medium text-[#e66f2b] hover:underline"
                              >
                                {f.name}
                              </a>
                              <span className="text-xs text-slate-500">
                                ({formatFileSize(f.bytes)})
                              </span>
                            </div>
                            <a
                              href={f.downloadUrl}
                              className="inline-flex items-center gap-1 text-xs font-semibold text-[#e66f2b] hover:underline"
                            >
                              <Download className="size-3.5" aria-hidden="true" />
                              Tải xuống
                            </a>
                            {f.kind === 'AUDIO' && (
                              <audio
                                controls
                                preload="none"
                                src={f.downloadUrl}
                                className="mt-1 w-full max-w-sm"
                              />
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                </tr>

                {workspace?.mySubmission?.text && (
                  <tr>
                    <th className="w-56 border-r border-slate-200 bg-[#f8f9fa] px-4 py-2.5 align-top font-semibold text-slate-800">
                      Văn bản trực tuyến
                    </th>
                    <td className="px-4 py-2.5">
                      <p className="whitespace-pre-wrap rounded border border-slate-200 bg-[#f8f9fa] p-2.5 text-slate-800">
                        {workspace.mySubmission.text}
                      </p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {workspace?.mySubmission?.directGrade?.state === 'PUBLISHED' && (
            <section className="space-y-3 pt-2">
              <h2 className="text-xl font-semibold text-[#e66f2b]">Nhận xét</h2>
              <div className="overflow-hidden rounded border border-slate-200 bg-white">
                <table className="w-full border-collapse text-left text-sm">
                  <tbody className="divide-y divide-slate-200">
                    <tr>
                      <th className="w-56 border-r border-slate-200 bg-[#f8f9fa] px-4 py-2.5 font-semibold text-slate-800">
                        Điểm
                      </th>
                      <td className="px-4 py-2.5 font-bold text-slate-900">
                        {workspace.mySubmission.directGrade.score !== null
                          ? `${workspace.mySubmission.directGrade.score} / ${workspace.mySubmission.directGrade.maxScore}`
                          : '—'}
                      </td>
                    </tr>
                    {workspace.mySubmission.directGrade.publishedAt && (
                      <tr>
                        <th className="w-56 border-r border-slate-200 bg-[#f8f9fa] px-4 py-2.5 font-semibold text-slate-800">
                          Chấm điểm lúc
                        </th>
                        <td className="px-4 py-2.5 text-slate-700">
                          {schoolTimestamp(workspace.mySubmission.directGrade.publishedAt)}
                        </td>
                      </tr>
                    )}
                    {workspace.mySubmission.directGrade.feedback && (
                      <tr>
                        <th className="w-56 border-r border-slate-200 bg-[#f8f9fa] px-4 py-2.5 align-top font-semibold text-slate-800">
                          Nhận xét giảng viên
                        </th>
                        <td className="whitespace-pre-wrap px-4 py-2.5 text-slate-800">
                          {workspace.mySubmission.directGrade.feedback}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Action button OR locked notice */}
          {!drawerOpen && (
            <div className="pt-1">
              {workspace?.submissionWindow?.canEdit ? (
                <button
                  type="button"
                  onClick={openSubmissionDrawer}
                  className="inline-flex items-center gap-2 rounded bg-[#76a35e] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#658f50]"
                >
                  <UploadCloud className="size-4" aria-hidden="true" />
                  {workspace.mySubmission?.state === 'SUBMITTED'
                    ? 'Sửa bài nộp'
                    : 'Thêm bài nộp'}
                </button>
              ) : (
                <p className="rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-950">
                  {workspace?.submissionWindow?.lockReason ??
                    'Hiện không thể thực hiện thao tác nộp bài.'}
                </p>
              )}
            </div>
          )}

          {/* Inline IUH "Thêm bài nộp" panel (shown ONLY after clicking Thêm bài nộp / Sửa bài nộp) */}
          {drawerOpen && config && (
            <section
              aria-label="Khu vực tải lên bài nộp"
              className="space-y-5 rounded border border-slate-300 bg-[#f8f9fa] p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="text-lg font-extrabold text-slate-900">
                    {workspace?.mySubmission?.state === 'SUBMITTED'
                      ? 'Cập nhật bài nộp'
                      : 'Thêm bài nộp'}
                  </h3>
                  <p className="mt-1 text-sm text-slate-600">
                    Số tệp tối đa: <strong>{config.maxFiles}</strong>, dung lượng tối đa mỗi tệp:{' '}
                    <strong>{config.maxFileSizeMb} MB</strong>.
                  </p>
                  <p className="text-xs text-slate-500">
                    Định dạng hỗ trợ: {config.acceptedExtensions}
                  </p>
                </div>
                <span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-bold text-indigo-800">
                  Đang chọn {retainedExistingFiles.length + stagedFiles.length}/{config.maxFiles} tệp
                </span>
              </div>

              {workspace?.submissionWindow?.late && (
                <p className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs font-semibold text-amber-900">
                  Bài tập đã qua hạn chính thức; bài nộp này sẽ được đánh dấu là nộp muộn.
                </p>
              )}

              {config.allowFile && (
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragActive(true);
                  }}
                  onDragLeave={() => setDragActive(false)}
                  onDrop={handleDrop}
                  className={`rounded-2xl border-2 border-dashed p-6 text-center transition ${
                    dragActive
                      ? 'border-indigo-500 bg-indigo-50'
                      : 'border-slate-300 bg-white hover:border-indigo-400'
                  }`}
                >
                  <UploadCloud
                    className="mx-auto size-10 text-indigo-600"
                    aria-hidden="true"
                  />
                  <p className="mt-2 text-sm font-bold text-slate-900">
                    Kéo và thả nhiều tệp vào đây để đính kèm
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Hoặc chọn nhiều tệp từ thiết bị ({config.allowAudio ? 'tài liệu & audio' : 'PDF, Word, ảnh, ZIP...'})
                  </p>
                  <div className="mt-4">
                    <button
                      type="button"
                      className={button + ' text-sm'}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      Chọn tệp từ máy…
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      accept={config.acceptedExtensions}
                      className="sr-only"
                      aria-label="Chọn tệp bài nộp"
                      onChange={(e) => {
                        if (e.target.files) addCandidateFiles(e.target.files);
                        e.target.value = '';
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Existing files (on edit) */}
              {workspace?.mySubmission && workspace.mySubmission.files.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-600">
                    Tệp đã nộp trước đó
                  </p>
                  <ul className="space-y-1.5">
                    {workspace.mySubmission.files.map((f) => {
                      const markedRemove = removeFileIds.includes(f.id);
                      return (
                        <li
                          key={f.id}
                          className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm ${
                            markedRemove
                              ? 'border-rose-200 bg-rose-50/70 text-rose-800 line-through'
                              : 'border-slate-200 bg-white text-slate-800'
                          }`}
                        >
                          <span className="truncate">
                            {f.name}{' '}
                            <span className="text-xs text-slate-500">
                              ({formatFileSize(f.bytes)})
                            </span>
                          </span>
                          <button
                            type="button"
                            className="shrink-0 text-xs font-bold text-indigo-700 hover:underline"
                            onClick={() =>
                              setRemoveFileIds((prev) =>
                                markedRemove ? prev.filter((id) => id !== f.id) : [...prev, f.id],
                              )
                            }
                          >
                            {markedRemove ? 'Khôi phục' : 'Xóa'}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {/* Staged new files */}
              {stagedFiles.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-indigo-700">
                    Tệp vừa chọn (chờ lưu bài nộp)
                  </p>
                  <ul className="space-y-1.5">
                    {stagedFiles.map((file, idx) => (
                      <li
                        key={`${file.name}-${file.size}-${idx}`}
                        className="flex items-center justify-between gap-2 rounded-xl border border-indigo-200 bg-white px-3.5 py-2 text-sm"
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <FileText className="size-4 shrink-0 text-indigo-600" aria-hidden="true" />
                          <span className="truncate font-semibold text-slate-900">{file.name}</span>
                          <span className="shrink-0 text-xs text-slate-500">
                            {formatFileSize(file.size)}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setStagedFiles((prev) => prev.filter((_, i) => i !== idx))
                          }
                          className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold text-rose-700 hover:bg-rose-50"
                        >
                          <Trash2 className="size-3.5" aria-hidden="true" />
                          Xóa
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {config.allowText && (
                <label className="block text-sm font-semibold text-slate-700">
                  Nội dung văn bản trực tuyến (nếu có)
                  <textarea
                    rows={6}
                    maxLength={20000}
                    className={field + ' mt-1.5 bg-white'}
                    placeholder="Nhập câu trả lời hoặc ghi chú kèm theo bài nộp..."
                    value={textDraft}
                    onChange={(e) => setTextDraft(e.target.value)}
                  />
                </label>
              )}

              <p className="text-xs text-slate-600">
                Lưu ý: Việc chọn tệp chỉ đưa vào danh sách chờ. Hệ thống chỉ ghi nhận đã nộp sau khi
                bạn bấm <strong>&quot;Lưu bài nộp&quot;</strong>.
              </p>

              <div className="flex flex-wrap items-center gap-3 pt-1">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => void saveStudentSubmission()}
                  className="inline-flex items-center gap-2 rounded bg-[#76a35e] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#658f50] disabled:opacity-50"
                >
                  {submitting ? 'Đang tải tệp & lưu bài nộp…' : 'Lưu bài nộp'}
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={cancelSubmissionDrawer}
                  className="rounded border border-slate-300 bg-white px-5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                >
                  Hủy
                </button>
              </div>
            </section>
          )}
        </section>
      )}
    </div>
  );
}

function TeacherSubmissionCard({
  classId,
  activityId,
  submission,
  maxScore,
  onGraded,
}: {
  classId: string;
  activityId: string;
  submission: StudentSubmission;
  maxScore: number;
  onGraded: () => void;
}) {
  const [score, setScore] = useState(
    submission.directGrade?.score !== null && submission.directGrade?.score !== undefined
      ? String(submission.directGrade.score)
      : '',
  );
  const [feedback, setFeedback] = useState(submission.directGrade?.feedback ?? '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  async function submitGrade(publish: boolean) {
    setBusy(true);
    setMsg('');
    setErr('');
    try {
      await lmsLocalApi.gradeSubmission(classId, activityId, submission.id, {
        score: score.trim() === '' ? null : Number(score),
        feedback,
        publish,
      });
      setMsg(publish ? 'Đã lưu và công bố điểm cho học viên.' : 'Đã lưu nháp điểm & nhận xét.');
      onGraded();
    } catch (e: unknown) {
      setErr(e instanceof Error && e.message ? e.message : 'Không thể lưu điểm.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="rounded-2xl border border-slate-200 bg-slate-50/40 p-4 sm:p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-extrabold text-slate-900">
            {submission.learner?.fullName ?? 'Học viên'}
            {submission.learner?.email ? (
              <span className="ml-2 text-xs font-normal text-slate-500">
                ({submission.learner.email})
              </span>
            ) : null}
          </h3>
          <p className="mt-0.5 text-xs text-slate-600">
            Nộp lúc: {submission.submittedAt ? schoolTimestamp(submission.submittedAt) : '—'}
            {submission.late && (
              <span className="ml-2 rounded-full bg-rose-100 px-2 py-0.5 font-bold text-rose-800">
                Nộp muộn
              </span>
            )}
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-bold ${
            submission.directGrade?.state === 'PUBLISHED'
              ? 'bg-emerald-100 text-emerald-800'
              : submission.directGrade?.state === 'DRAFT'
                ? 'bg-amber-100 text-amber-800'
                : 'bg-slate-200 text-slate-700'
          }`}
        >
          {submission.directGrade?.state === 'PUBLISHED'
            ? `Đã công bố (${submission.directGrade.score ?? '—'}/${submission.directGrade.maxScore})`
            : submission.directGrade?.state === 'DRAFT'
              ? `Nháp điểm (${submission.directGrade.score ?? '—'}/${submission.directGrade.maxScore})`
              : 'Chưa chấm điểm'}
        </span>
      </div>

      {submission.text && (
        <div className="rounded-xl border border-slate-200 bg-white p-3.5 text-sm text-slate-800 whitespace-pre-wrap">
          {submission.text}
        </div>
      )}

      {submission.files.length > 0 && (
        <ul className="space-y-1.5">
          {submission.files.map((f) => (
            <li
              key={f.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm"
            >
              <div className="flex min-w-0 items-center gap-2">
                <FileText className="size-4 shrink-0 text-indigo-600" aria-hidden="true" />
                <span className="truncate font-semibold text-slate-900">{f.name}</span>
                <span className="text-xs text-slate-500">({formatFileSize(f.bytes)})</span>
              </div>
              <a
                href={f.downloadUrl}
                className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-800 hover:bg-indigo-100"
              >
                <Download className="size-3.5" aria-hidden="true" />
                Tải xuống
              </a>
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-3.5 sm:grid-cols-[140px_1fr]">
        <label className="block text-xs font-bold text-slate-700">
          Điểm (0–{maxScore})
          <input
            type="number"
            step="0.25"
            min={0}
            max={maxScore}
            className={field + ' mt-1 py-2 text-sm'}
            value={score}
            onChange={(e) => setScore(e.target.value)}
          />
        </label>
        <label className="block text-xs font-bold text-slate-700">
          Nhận xét gửi học viên
          <textarea
            rows={2}
            className={field + ' mt-1 py-2 text-sm'}
            placeholder="Nhập nhận xét chi tiết về bài làm..."
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
          />
        </label>
        <div className="sm:col-span-2 flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs">
            {err && <span className="font-semibold text-rose-700">{err}</span>}
            {msg && <span className="font-semibold text-emerald-700">{msg}</span>}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void submitGrade(false)}
              className="rounded-lg border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Lưu nháp điểm
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void submitGrade(true)}
              className="rounded bg-[#76a35e] px-3.5 py-1.5 text-xs font-bold text-white hover:bg-[#658f50] disabled:opacity-50"
            >
              {busy ? 'Đang lưu…' : 'Lưu & Công bố điểm'}
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}
