import { useEffect, useRef, useState } from 'react';
import { Image as ImageIcon, Loader2, Maximize2, Trash2, Volume2 } from 'lucide-react';
import { apiUrl } from '@/lib/api-client';
import { lmsLocalApi, type QuizMediaItem } from './lms-local-api';

export function resolveQuizMediaUrl(url: string): string {
  if (!url) return '';
  if (/^https?:\/\//i.test(url) || url.startsWith('blob:') || url.startsWith('data:')) {
    return url;
  }
  if (url.startsWith('/api/')) {
    return apiUrl(url.slice(4));
  }
  return apiUrl(url.startsWith('/') ? url : `/${url}`);
}

export type GroupedQuizBlock<T> =
  | {
      kind: 'group';
      groupId: string;
      groupTitle: string;
      media: QuizMediaItem[];
      items: Array<{ item: T; globalIndex: number }>;
    }
  | {
      kind: 'single';
      item: T;
      globalIndex: number;
    };

export function groupQuizItems<
  T extends { groupId?: string | null; groupTitle?: string; media?: QuizMediaItem[] },
>(items: T[]): Array<GroupedQuizBlock<T>> {
  const blocks: Array<GroupedQuizBlock<T>> = [];
  for (let idx = 0; idx < items.length; idx += 1) {
    const item = items[idx];
    const gid = item.groupId ? String(item.groupId).trim() : '';
    if (!gid) {
      blocks.push({ kind: 'single', item, globalIndex: idx });
      continue;
    }
    const last = blocks[blocks.length - 1];
    if (last && last.kind === 'group' && last.groupId === gid) {
      last.items.push({ item, globalIndex: idx });
      if (!last.groupTitle && item.groupTitle) {
        last.groupTitle = item.groupTitle;
      }
      if (last.media.length === 0 && Array.isArray(item.media) && item.media.length > 0) {
        last.media = item.media;
      }
    } else {
      blocks.push({
        kind: 'group',
        groupId: gid,
        groupTitle: item.groupTitle ?? '',
        media: Array.isArray(item.media) ? item.media : [],
        items: [{ item, globalIndex: idx }],
      });
    }
  }
  return blocks;
}

export function QuizMediaUploadButtons({
  classId,
  disabled,
  compact,
  onUploaded,
  onError,
}: {
  classId: string;
  disabled?: boolean;
  compact?: boolean;
  onUploaded: (items: QuizMediaItem[]) => void;
  onError?: (msg: string) => void;
}) {
  const imageInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setUploading(true);
    try {
      const uploaded: QuizMediaItem[] = [];
      for (const file of Array.from(fileList)) {
        const res = await lmsLocalApi.uploadQuizMedia(classId, file);
        uploaded.push(res);
      }
      if (uploaded.length > 0) {
        onUploaded(uploaded);
      }
    } catch (e) {
      onError?.(e instanceof Error ? e.message : 'Không tải được tệp hình ảnh hoặc âm thanh.');
    } finally {
      setUploading(false);
      if (imageInputRef.current) imageInputRef.current.value = '';
      if (audioInputRef.current) audioInputRef.current.value = '';
    }
  }

  const btnCls = compact
    ? 'inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50'
    : 'inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50';

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        ref={imageInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,.jpg,.jpeg,.png,.webp"
        multiple
        className="hidden"
        onChange={(e) => void handleFiles(e.target.files)}
      />
      <input
        ref={audioInputRef}
        type="file"
        accept="audio/mpeg,audio/mp4,audio/wav,audio/ogg,audio/webm,.mp3,.m4a,.wav,.ogg,.webm"
        multiple
        className="hidden"
        onChange={(e) => void handleFiles(e.target.files)}
      />
      <button
        type="button"
        disabled={disabled || uploading}
        className={btnCls}
        onClick={() => imageInputRef.current?.click()}
      >
        {uploading ? (
          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <ImageIcon className="size-3.5 text-indigo-600" aria-hidden="true" />
        )}
        + Thêm ảnh
      </button>
      <button
        type="button"
        disabled={disabled || uploading}
        className={btnCls}
        onClick={() => audioInputRef.current?.click()}
      >
        {uploading ? (
          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <Volume2 className="size-3.5 text-emerald-600" aria-hidden="true" />
        )}
        + Thêm audio
      </button>
      {uploading && <span className="text-xs font-medium text-slate-500">Đang tải lên…</span>}
    </div>
  );
}

export function QuizMediaBlock({
  media,
  onZoomImage,
  onRemoveMedia,
  compact,
}: {
  media?: QuizMediaItem[];
  onZoomImage?: (item: QuizMediaItem) => void;
  onRemoveMedia?: (mediaId: string) => void;
  compact?: boolean;
}) {
  if (!media || media.length === 0) return null;
  const audios = media.filter((m) => m.kind === 'AUDIO');
  const images = media.filter((m) => m.kind === 'IMAGE');

  return (
    <div className="space-y-3">
      {audios.map((audio) => (
        <div
          key={audio.id}
          className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 space-y-1.5"
        >
          <div className="flex items-center justify-between gap-2 text-xs font-semibold text-emerald-950">
            <span className="inline-flex items-center gap-1.5 truncate">
              <Volume2 className="size-3.5 shrink-0 text-emerald-700" aria-hidden="true" />
              {audio.name}
            </span>
            {onRemoveMedia && (
              <button
                type="button"
                aria-label={`Xóa ${audio.name}`}
                onClick={() => onRemoveMedia(audio.id)}
                className="rounded border border-rose-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-rose-700 hover:bg-rose-50"
              >
                <Trash2 className="size-3 inline mr-1" aria-hidden="true" />
                Xóa
              </button>
            )}
          </div>
          <audio
            controls
            preload="metadata"
            src={resolveQuizMediaUrl(audio.url)}
            className="w-full"
          >
            Trình duyệt không hỗ trợ phát âm thanh.
          </audio>
        </div>
      ))}

      {images.map((img) => (
        <div key={img.id} className="relative rounded-xl border border-slate-200 bg-white p-2.5">
          <div className="mb-1.5 flex items-center justify-between gap-2 text-xs text-slate-600">
            <span className="truncate font-medium">{img.name}</span>
            <div className="flex items-center gap-1.5">
              {onZoomImage && (
                <button
                  type="button"
                  onClick={() => onZoomImage(img)}
                  className="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
                >
                  <Maximize2 className="size-3" aria-hidden="true" />
                  Phóng to
                </button>
              )}
              {onRemoveMedia && (
                <button
                  type="button"
                  aria-label={`Xóa ${img.name}`}
                  onClick={() => onRemoveMedia(img.id)}
                  className="rounded border border-rose-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-rose-700 hover:bg-rose-50"
                >
                  <Trash2 className="size-3 inline mr-1" aria-hidden="true" />
                  Xóa
                </button>
              )}
            </div>
          </div>
          <img
            src={resolveQuizMediaUrl(img.url)}
            alt={img.name}
            onClick={() => onZoomImage?.(img)}
            className={`mx-auto w-full rounded object-contain ${
              compact ? 'max-h-60' : 'max-h-[72vh]'
            } ${onZoomImage ? 'cursor-zoom-in' : ''}`}
          />
        </div>
      ))}
    </div>
  );
}

export function QuizZoomModal({
  image,
  onClose,
}: {
  image: QuizMediaItem | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!image) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [image, onClose]);

  if (!image) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={image.name}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative max-h-[92vh] max-w-5xl overflow-auto rounded-2xl bg-white p-3 shadow-2xl"
      >
        <div className="mb-2 flex items-center justify-between gap-4 border-b border-slate-100 pb-2">
          <span className="truncate text-xs font-semibold text-slate-600">{image.name}</span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-bold text-slate-700 hover:bg-slate-100"
          >
            Đóng
          </button>
        </div>
        <img
          src={resolveQuizMediaUrl(image.url)}
          alt={image.name}
          className="mx-auto max-h-[82vh] w-auto object-contain"
        />
      </div>
    </div>
  );
}
