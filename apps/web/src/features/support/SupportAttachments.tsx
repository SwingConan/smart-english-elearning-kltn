import { useEffect, useId, useMemo, useState, type DragEvent } from 'react';
import { Download, Eye, FileText, Image as ImageIcon, Paperclip, Trash2, UploadCloud, X } from 'lucide-react';
import { apiUrl } from '@/lib/api-client';
import { supportBase, type TicketAttachment } from './support-api';

export const MAX_SUPPORT_FILES = 5;
export const MAX_SUPPORT_FILE_BYTES = 10 * 1024 * 1024;
export const SUPPORT_FILE_ACCEPT =
  '.png,.jpg,.jpeg,.webp,.pdf,.docx,image/png,image/jpeg,image/webp,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const ALLOWED_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'pdf', 'docx']);
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export function formatTicketStatusLabel(
  state: string,
  assigned?: boolean,
  audience: 'STUDENT' | 'STAFF' = 'STUDENT',
): string {
  if (state === 'NEW') {
    if (assigned === false) {
      return audience === 'STUDENT'
        ? 'Đã gửi / Chờ nhân viên tiếp nhận'
        : 'Chờ nhân viên tiếp nhận';
    }
    return 'Đã tiếp nhận';
  }
  const map: Record<string, string> = {
    TRIAGED: 'Đã phân loại',
    IN_PROGRESS: 'Đang xử lý',
    WAITING_CUSTOMER: audience === 'STUDENT' ? 'Chờ bạn bổ sung' : 'Chờ người gửi',
    WAITING_SPECIALIST: 'Chờ phản hồi chuyên môn / kỹ thuật',
    RESOLVED: 'Đã giải quyết',
    CLOSED: 'Đã đóng',
    REOPENED: 'Đã mở lại',
  };
  return map[state] ?? 'Đang cập nhật';
}

export function ticketStatusTone(state: string, assigned?: boolean): string {
  if (state === 'NEW' && assigned === false) {
    return 'border-amber-200 bg-amber-50 text-amber-800';
  }
  if (state === 'IN_PROGRESS') {
    return 'border-sky-200 bg-sky-50 text-sky-800';
  }
  if (state === 'RESOLVED') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  }
  if (state === 'CLOSED') {
    return 'border-slate-200 bg-slate-100 text-slate-600';
  }
  return 'border-[#b9d4ab] bg-[#f4f8f1] text-[#2d581b]';
}

export function formatSupportFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function supportAttachmentUrl(
  ticketId: string,
  attachmentId: string,
  download = false,
): string {
  return (
    apiUrl(`${supportBase}/tickets/${ticketId}/attachments/${attachmentId}/file`) +
    (download ? '?download=1' : '')
  );
}

function isAllowedClientFile(file: File): boolean {
  const ext = (file.name.split('.').pop() ?? '').toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) return false;
  if (!file.type) return true;
  if (ext === 'png') return file.type === 'image/png';
  if (ext === 'jpg' || ext === 'jpeg') return file.type === 'image/jpeg' || file.type === 'image/jpg';
  if (ext === 'webp') return file.type === 'image/webp';
  if (ext === 'pdf') return file.type === 'application/pdf';
  if (ext === 'docx') {
    return (
      file.type === DOCX_MIME ||
      file.type === 'application/octet-stream' ||
      file.type === 'application/zip'
    );
  }
  return false;
}

export function validateClientSupportFiles(
  existing: File[],
  incoming: FileList | File[],
  maxFiles = MAX_SUPPORT_FILES,
): { files: File[]; error: string } {
  const merged = [...existing];
  const errors: string[] = [];

  for (const file of Array.from(incoming)) {
    const duplicate = merged.some(
      (f) => f.name === file.name && f.size === file.size && f.lastModified === file.lastModified,
    );
    if (duplicate) continue;

    if (!isAllowedClientFile(file)) {
      errors.push(`${file.name}: chỉ hỗ trợ PNG, JPG, WEBP, PDF hoặc DOCX.`);
      continue;
    }
    if (file.size < 1 || file.size > MAX_SUPPORT_FILE_BYTES) {
      errors.push(`${file.name}: dung lượng phải từ 1 byte đến tối đa 10 MB.`);
      continue;
    }
    if (merged.length >= maxFiles) {
      errors.push(`Tối đa ${maxFiles} tệp đính kèm cho mỗi phiếu.`);
      break;
    }
    merged.push(file);
  }

  return { files: merged, error: errors.join(' ') };
}

export function SupportAttachmentDropzone({
  files,
  onChange,
  disabled = false,
  maxFiles = MAX_SUPPORT_FILES,
  externalError = '',
  compact = false,
}: {
  files: File[];
  onChange: (next: File[]) => void;
  disabled?: boolean;
  maxFiles?: number;
  externalError?: string;
  compact?: boolean;
}) {
  const inputId = useId();
  const [dragging, setDragging] = useState(false);
  const [localError, setLocalError] = useState('');

  const previews = useMemo(
    () =>
      files.map((file) => ({
        key: `${file.name}-${file.size}-${file.lastModified}`,
        file,
        isImage:
          file.type.startsWith('image/') ||
          /\.(png|jpe?g|webp)$/i.test(file.name),
        url:
          (file.type.startsWith('image/') || /\.(png|jpe?g|webp)$/i.test(file.name)) &&
          typeof URL.createObjectURL === 'function'
            ? URL.createObjectURL(file)
            : null,
      })),
    [files],
  );

  useEffect(() => {
    return () => {
      for (const p of previews) {
        if (p.url && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(p.url);
      }
    };
  }, [previews]);

  const applyIncoming = (incoming: FileList | null) => {
    if (!incoming || !incoming.length || disabled) return;
    const res = validateClientSupportFiles(files, incoming, maxFiles);
    setLocalError(res.error);
    onChange(res.files);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    applyIncoming(e.dataTransfer.files);
  };

  const shownError = externalError || localError;

  return (
    <div className="space-y-2">
      {!compact && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="font-semibold text-slate-800">
            Tệp đính kèm minh họa (tùy chọn)
          </span>
          <span className="text-xs text-slate-500">
            {files.length}/{maxFiles} tệp · PNG, JPG, WEBP, PDF, DOCX · tối đa 10 MB/tệp
          </span>
        </div>
      )}

      {compact ? (
        <div
          onDragEnter={(e) => {
            e.preventDefault();
            if (!disabled) setDragging(true);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            if (!disabled) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border border-dashed px-3 py-2 text-xs transition-colors ${
            dragging
              ? 'border-[#4d7439] bg-[#f4f8f1]'
              : 'border-slate-300 bg-slate-50/70 hover:border-[#7da069]'
          } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
        >
          <input
            id={inputId}
            type="file"
            multiple
            accept={SUPPORT_FILE_ACCEPT}
            disabled={disabled || files.length >= maxFiles}
            aria-label="Chọn tệp đính kèm phiếu tư vấn"
            className="sr-only"
            onChange={(e) => {
              applyIncoming(e.target.files);
              e.target.value = '';
            }}
          />
          <label
            htmlFor={inputId}
            className={`inline-flex items-center gap-1.5 font-semibold text-[#3f642c] underline-offset-2 hover:underline ${
              disabled || files.length >= maxFiles ? 'pointer-events-none opacity-50' : 'cursor-pointer'
            }`}
          >
            <Paperclip size={13} aria-hidden="true" />
            <span>Đính kèm ảnh / PDF / DOCX</span>
          </label>
          <span className="text-slate-500">
            {files.length}/{maxFiles} tệp · tối đa 10 MB/tệp
          </span>
        </div>
      ) : (
        <div
          onDragEnter={(e) => {
            e.preventDefault();
            if (!disabled) setDragging(true);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            if (!disabled) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className={`rounded-xl border-2 border-dashed p-4 text-center transition-colors ${
            dragging
              ? 'border-[#4d7439] bg-[#f4f8f1]'
              : 'border-slate-300 bg-slate-50/70 hover:border-[#7da069]'
          } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
        >
          <input
            id={inputId}
            type="file"
            multiple
            accept={SUPPORT_FILE_ACCEPT}
            disabled={disabled || files.length >= maxFiles}
            aria-label="Chọn tệp đính kèm phiếu tư vấn"
            className="sr-only"
            onChange={(e) => {
              applyIncoming(e.target.files);
              e.target.value = '';
            }}
          />
          <UploadCloud size={22} className="mx-auto text-[#4d7439]" aria-hidden="true" />
          <p className="mt-1.5 text-sm text-slate-700">
            Kéo thả ảnh hoặc tài liệu vào đây, hoặc{' '}
            <label
              htmlFor={inputId}
              className={`font-semibold text-[#4d7439] underline-offset-2 hover:underline ${
                disabled || files.length >= maxFiles ? 'pointer-events-none opacity-50' : 'cursor-pointer'
              }`}
            >
              chọn tệp từ máy
            </label>
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Ảnh chụp màn hình lỗi, biên lai hoặc tài liệu DOCX/PDF liên quan đến yêu cầu tư vấn.
          </p>
        </div>
      )}

      {shownError && (
        <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
          {shownError}
        </p>
      )}

      {previews.length > 0 && (
        <ul className="space-y-2" aria-label="Danh sách tệp chờ gửi">
          {previews.map((item, idx) => (
            <li
              key={item.key}
              className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              <div className="flex min-w-0 items-center gap-3">
                {item.isImage && item.url ? (
                  <img
                    src={item.url}
                    alt={item.file.name}
                    className="h-10 w-10 shrink-0 rounded border border-slate-200 object-cover"
                  />
                ) : (
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded border border-slate-200 bg-slate-50 text-slate-600">
                    {item.isImage ? <ImageIcon size={18} /> : <FileText size={18} />}
                  </span>
                )}
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-900">{item.file.name}</p>
                  <p className="text-xs text-slate-500">{formatSupportFileSize(item.file.size)}</p>
                </div>
              </div>
              <button
                type="button"
                disabled={disabled}
                onClick={() => {
                  setLocalError('');
                  onChange(files.filter((_, index) => index !== idx));
                }}
                aria-label={`Xóa tệp ${item.file.name}`}
                className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50"
              >
                <Trash2 size={13} aria-hidden="true" />
                Xóa
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function SupportAttachmentsSection({
  ticketId,
  attachments,
}: {
  ticketId: string;
  attachments: TicketAttachment[];
}) {
  const [previewItem, setPreviewItem] = useState<TicketAttachment | null>(null);

  if (!attachments.length) return null;

  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
          <Paperclip size={16} className="text-[#4d7439]" aria-hidden="true" />
          Tệp đính kèm ({attachments.length})
        </h2>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {attachments.map((att) => {
          const isImage = att.mimeType.startsWith('image/');
          const viewHref = supportAttachmentUrl(ticketId, att.id, false);
          const downloadHref = supportAttachmentUrl(ticketId, att.id, true);
          return (
            <article
              key={att.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3"
            >
              <div className="flex min-w-0 items-center gap-3">
                {isImage ? (
                  <button
                    type="button"
                    onClick={() => setPreviewItem(att)}
                    className="group relative shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-white"
                    aria-label={`Xem ảnh ${att.originalName}`}
                  >
                    <img
                      src={viewHref}
                      alt={att.originalName}
                      className="h-16 w-20 object-contain bg-slate-100 transition-transform group-hover:scale-105"
                    />
                  </button>
                ) : (
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-[#4d7439]">
                    <FileText size={20} aria-hidden="true" />
                  </span>
                )}
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900" title={att.originalName}>
                    {att.originalName}
                  </p>
                  <p className="text-xs text-slate-500">
                    {isImage
                      ? 'Ảnh đính kèm'
                      : att.mimeType === 'application/pdf'
                        ? 'Tài liệu PDF'
                        : 'Tài liệu DOCX'}{' '}
                    · {formatSupportFileSize(att.byteSize)}
                  </p>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2 text-xs">
                {isImage && (
                  <button
                    type="button"
                    onClick={() => setPreviewItem(att)}
                    className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 font-semibold text-slate-700 hover:bg-slate-100"
                  >
                    <Eye size={12} aria-hidden="true" />
                    Xem ảnh
                  </button>
                )}
                <a
                  href={downloadHref}
                  download={att.originalName}
                  className="inline-flex items-center gap-1 rounded border border-[#b9d4ab] bg-[#f4f8f1] px-2.5 py-1 font-semibold text-[#2d581b] hover:bg-[#e8f1e2]"
                >
                  <Download size={12} aria-hidden="true" />
                  Tải xuống
                </a>
              </div>
            </article>
          );
        })}
      </div>

      {previewItem && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Xem trước ${previewItem.originalName}`}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4"
          onClick={() => setPreviewItem(null)}
        >
          <div
            className="max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <p className="truncate text-sm font-semibold text-slate-900">
                {previewItem.originalName}
              </p>
              <div className="flex items-center gap-2">
                <a
                  href={supportAttachmentUrl(ticketId, previewItem.id, true)}
                  download={previewItem.originalName}
                  className="inline-flex items-center gap-1 rounded border border-[#b9d4ab] bg-[#f4f8f1] px-2.5 py-1 text-xs font-semibold text-[#2d581b]"
                >
                  <Download size={12} aria-hidden="true" />
                  Tải xuống
                </a>
                <button
                  type="button"
                  onClick={() => setPreviewItem(null)}
                  aria-label="Đóng xem trước"
                  className="rounded-lg p-1 text-slate-600 hover:bg-slate-100"
                >
                  <X size={18} />
                </button>
              </div>
            </div>
            <div className="flex max-h-[78vh] items-center justify-center bg-slate-100 p-4">
              <img
                src={supportAttachmentUrl(ticketId, previewItem.id, false)}
                alt={previewItem.originalName}
                className="max-h-[72vh] max-w-full rounded object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
