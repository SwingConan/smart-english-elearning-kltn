import { Check, CheckCircle2, Clipboard, Info, X, XCircle } from 'lucide-react';
import { type ReactNode, useEffect, useId, useRef, useState } from 'react';

export function PageContainer({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8 ${className}`}>
      {children}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
          {title}
        </h1>
        {description ? (
          <p className="mt-3 max-w-3xl leading-7 text-slate-600">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </header>
  );
}

export function SectionHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h2 className="text-xl font-bold text-slate-950">{title}</h2>
        {description ? (
          <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
        ) : null}
      </div>
      {actions}
    </div>
  );
}

const tones = {
  success: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  warning: 'bg-amber-50 text-amber-900 ring-amber-200',
  danger: 'bg-rose-50 text-rose-800 ring-rose-200',
  info: 'bg-sky-50 text-sky-800 ring-sky-200',
  neutral: 'bg-slate-100 text-slate-700 ring-slate-200',
};
export function StatusBadge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: keyof typeof tones;
}) {
  const Icon = tone === 'success' ? CheckCircle2 : tone === 'danger' ? XCircle : Info;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ring-1 ring-inset ${tones[tone]}`}
    >
      <Icon aria-hidden="true" size={13} />
      {children}
    </span>
  );
}

export function Avatar({
  name,
  src,
  size = 'md',
}: {
  name: string;
  src?: string | null;
  size?: 'sm' | 'md' | 'lg';
}) {
  const classes =
    size === 'sm' ? 'size-8 text-xs' : size === 'lg' ? 'size-24 text-2xl' : 'size-11 text-sm';
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(-2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
  return src ? (
    <img
      alt={`Ảnh đại diện của ${name}`}
      className={`${classes} shrink-0 rounded-full object-cover ring-2 ring-white`}
      src={src}
    />
  ) : (
    <span
      aria-label={`Ảnh đại diện mặc định của ${name}`}
      className={`${classes} grid shrink-0 place-items-center rounded-full bg-gradient-to-br from-indigo-600 to-sky-500 font-black text-white ring-2 ring-white`}
    >
      {initials || '?'}
    </span>
  );
}

export function CopyButton({ value, label = 'Sao chép' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };
  return (
    <button
      aria-live="polite"
      className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-bold text-slate-700 transition hover:border-indigo-300 hover:text-indigo-700"
      onClick={() => void copy()}
      type="button"
    >
      {copied ? <Check size={14} /> : <Clipboard size={14} />}
      {copied ? 'Đã sao chép' : label}
    </button>
  );
}

export function Timeline({
  items,
}: {
  items: Array<{
    id: string;
    title: string;
    description?: ReactNode;
    meta?: ReactNode;
    tone?: 'success' | 'warning' | 'danger' | 'neutral';
  }>;
}) {
  return (
    <ol className="relative ml-2 border-l border-slate-200 pl-6">
      {items.map((item) => (
        <li className="relative pb-6 last:pb-0" key={item.id}>
          <span
            className={`absolute -left-[31px] top-1 size-3 rounded-full ring-4 ring-white ${item.tone === 'success' ? 'bg-emerald-500' : item.tone === 'danger' ? 'bg-rose-500' : item.tone === 'warning' ? 'bg-amber-500' : 'bg-slate-400'}`}
          />
          <div className="flex flex-wrap items-start justify-between gap-2">
            <strong>{item.title}</strong>
            {item.meta ? <span className="text-xs text-slate-500">{item.meta}</span> : null}
          </div>
          {item.description ? (
            <div className="mt-1 text-sm leading-6 text-slate-600">{item.description}</div>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

export function DetailDrawer({
  open,
  title,
  description,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previouslyFocused?.focus();
    };
  }, [onClose, open]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate-950/50 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <aside
        aria-describedby={description ? descriptionId : undefined}
        aria-labelledby={titleId}
        aria-modal="true"
        className="h-full w-full max-w-xl overflow-y-auto bg-white p-6 shadow-2xl sm:p-8"
        role="dialog"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-black text-slate-950" id={titleId}>
              {title}
            </h2>
            {description ? (
              <p className="mt-2 text-sm leading-6 text-slate-600" id={descriptionId}>
                {description}
              </p>
            ) : null}
          </div>
          <button
            aria-label="Đóng"
            className="rounded-xl border p-2 text-slate-600 hover:bg-slate-50"
            onClick={onClose}
            ref={closeRef}
            type="button"
          >
            <X size={20} />
          </button>
        </div>
        <div className="mt-7">{children}</div>
      </aside>
    </div>
  );
}
