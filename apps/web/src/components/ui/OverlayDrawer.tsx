import {
  useEffect,
  useId,
  useRef,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { X } from 'lucide-react';

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function OverlayDrawer({
  children,
  open,
  onClose,
  side,
  title,
  triggerRef,
}: {
  children: ReactNode;
  open: boolean;
  onClose: () => void;
  side: 'left' | 'right';
  title: string;
  triggerRef: RefObject<HTMLButtonElement | null>;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) {
      if (wasOpen.current) triggerRef.current?.focus();
      wasOpen.current = false;
      return;
    }

    wasOpen.current = true;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('keydown', closeOnEscape);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, triggerRef]);

  const keepFocusInside = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Tab') return;
    const focusable = [
      ...(panelRef.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? []),
    ];
    if (!focusable.length) return;
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

  return (
    <div
      aria-hidden={!open}
      className={`fixed inset-0 z-50 ${open ? 'pointer-events-auto' : 'pointer-events-none'}`}
      data-drawer-side={side}
    >
      <div
        aria-hidden="true"
        className={`absolute inset-0 bg-slate-950/50 transition-opacity duration-[225ms] ease-out motion-reduce:duration-0 ${open ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
      />
      <aside
        aria-labelledby={titleId}
        aria-modal="true"
        className={`absolute inset-y-0 ${side === 'left' ? 'left-0' : 'right-0'} w-[min(24rem,calc(100vw-2rem))] overflow-y-auto bg-white p-5 shadow-2xl transition-transform duration-[225ms] ease-out motion-reduce:duration-0 ${open ? 'translate-x-0' : side === 'left' ? '-translate-x-full' : 'translate-x-full'}`}
        inert={!open ? true : undefined}
        onKeyDown={keepFocusInside}
        ref={panelRef}
        role="dialog"
      >
        <div className="mb-6 flex items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <h2 className="text-lg font-bold text-slate-950" id={titleId}>
            {title}
          </h2>
          <button
            aria-label={`Đóng ${title.toLocaleLowerCase('vi')}`}
            className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 hover:text-slate-950"
            onClick={onClose}
            ref={closeRef}
            type="button"
          >
            <X aria-hidden="true" size={20} />
          </button>
        </div>
        {children}
      </aside>
    </div>
  );
}
