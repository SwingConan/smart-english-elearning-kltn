import {
  type ButtonHTMLAttributes,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  LoaderCircle,
  X,
} from 'lucide-react';
import { ToastContext, useToast, type Notify, type ToastTone } from './feedback-context';

export type { Notify, ToastTone };

type Toast = { id: number; message: string; tone: ToastTone };

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);
  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);
  const notify = useCallback<Notify>(
    (message, tone = 'success') => {
      const id = ++nextId.current;
      setToasts((current) => [...current.slice(-2), { id, message, tone }]);
      window.setTimeout(() => dismiss(id), 4500);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={notify}>
      {children}
      <div
        aria-label="Thông báo"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-4 bottom-4 z-[70] flex flex-col items-end gap-3"
      >
        {toasts.map((toast) => (
          <div
            className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border bg-white p-4 shadow-xl ${toast.tone === 'success' ? 'border-emerald-200' : 'border-red-200'}`}
            key={toast.id}
            role={toast.tone === 'error' ? 'alert' : 'status'}
          >
            {toast.tone === 'success' ? (
              <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-600" size={20} />
            ) : (
              <AlertCircle className="mt-0.5 shrink-0 text-red-600" size={20} />
            )}
            <p className="flex-1 text-sm font-medium text-slate-800">{toast.message}</p>
            <button
              aria-label="Đóng thông báo"
              className="rounded-md p-1 text-slate-500 hover:bg-slate-100"
              onClick={() => dismiss(toast.id)}
              type="button"
            >
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function LoadingButton({
  isLoading,
  loadingLabel,
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  isLoading: boolean;
  loadingLabel: string;
}) {
  return (
    <button aria-busy={isLoading} disabled={disabled || isLoading} {...props}>
      {isLoading ? <LoaderCircle aria-hidden="true" className="animate-spin" size={18} /> : null}
      {isLoading ? loadingLabel : children}
    </button>
  );
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Xác nhận',
  cancelLabel = 'Ở lại',
  busyLabel = 'Đang xử lý…',
  isBusy,
  busy,
  tone = 'primary',
  children,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  busyLabel?: string;
  isBusy?: boolean;
  busy?: boolean;
  tone?: 'primary' | 'danger' | 'warning';
  children?: ReactNode;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const activeBusy = Boolean(isBusy ?? busy);
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !activeBusy) onCancel();
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), a[href]'),
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [activeBusy, onCancel, open]);

  if (!open) return null;

  const confirmBtnClass =
    tone === 'danger'
      ? 'inline-flex items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white shadow-xs transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50'
      : tone === 'warning'
        ? 'inline-flex items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white shadow-xs transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50'
        : 'btn-primary';

  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/55 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !activeBusy) onCancel();
      }}
    >
      <div
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl sm:p-7"
        ref={dialogRef}
        role="dialog"
      >
        <div
          className={`grid size-11 place-items-center rounded-2xl ${
            tone === 'danger'
              ? 'bg-rose-50 text-rose-600'
              : tone === 'warning'
                ? 'bg-amber-50 text-amber-600'
                : 'bg-indigo-50 text-indigo-700'
          }`}
        >
          {tone === 'primary' ? (
            <AlertCircle aria-hidden="true" size={22} />
          ) : (
            <AlertTriangle aria-hidden="true" size={22} />
          )}
        </div>
        <h2 className="mt-5 text-xl font-bold text-slate-950" id={titleId}>
          {title}
        </h2>
        <p className="mt-2 leading-7 text-slate-600" id={descriptionId}>
          {description}
        </p>
        {children && (
          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-3.5 text-xs leading-relaxed text-slate-700">
            {children}
          </div>
        )}
        <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            className="btn-secondary"
            disabled={activeBusy}
            onClick={onCancel}
            ref={cancelRef}
            type="button"
          >
            {cancelLabel}
          </button>
          <LoadingButton
            className={confirmBtnClass}
            isLoading={activeBusy}
            loadingLabel={busyLabel}
            onClick={onConfirm}
            type="button"
          >
            {confirmLabel}
          </LoadingButton>
        </div>
      </div>
    </div>
  );
}

export function CopyTextButton({
  text,
  label = 'Sao chép',
  copiedLabel = 'Đã sao chép',
  className = '',
}: {
  text: string;
  label?: string;
  copiedLabel?: string;
  className?: string;
}) {
  const notify = useToast();
  const [status, setStatus] = useState<'idle' | 'copied' | 'error'>('idle');

  async function handleCopy() {
    try {
      if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') {
        throw new Error('Clipboard API unavailable');
      }
      await navigator.clipboard.writeText(text);
      setStatus('copied');
      notify(`${copiedLabel}: ${text}`, 'success');
      window.setTimeout(() => setStatus('idle'), 2500);
    } catch {
      setStatus('error');
      notify('Không thể sao chép tự động — vui lòng bôi đen để sao chép thủ công.', 'error');
      window.setTimeout(() => setStatus('idle'), 3200);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void handleCopy()}
      className={
        className ||
        'inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-2xs transition hover:border-indigo-300 hover:bg-indigo-50/60 hover:text-indigo-700'
      }
    >
      {status === 'copied' ? (
        <>
          <Check size={13} className="text-emerald-600" aria-hidden="true" />
          <span className="text-emerald-700">{copiedLabel}</span>
        </>
      ) : status === 'error' ? (
        <span className="text-rose-700">Chưa sao chép được</span>
      ) : (
        <>
          <Copy size={13} className="text-indigo-600" aria-hidden="true" />
          <span>{label}</span>
        </>
      )}
    </button>
  );
}

export function PageSkeleton({ cards = 3 }: { cards?: number }) {
  return (
    <div
      aria-label="Đang tải nội dung"
      className="grid gap-6 md:grid-cols-2 lg:grid-cols-3"
      role="status"
    >
      {Array.from({ length: cards }, (_, index) => (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white" key={index}>
          <div className="aspect-[16/10] animate-pulse bg-slate-200" />
          <div className="space-y-3 p-5">
            <div className="h-4 w-24 animate-pulse rounded bg-slate-200" />
            <div className="h-6 w-4/5 animate-pulse rounded bg-slate-200" />
            <div className="h-4 w-full animate-pulse rounded bg-slate-100" />
          </div>
        </div>
      ))}
    </div>
  );
}
