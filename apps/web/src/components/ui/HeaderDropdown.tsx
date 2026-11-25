import { useEffect, useRef, type ReactNode } from 'react';
import { useLocation } from 'react-router';

export function HeaderDropdown({ label, children, stacked = false, className = '' }: {
  label: ReactNode;
  children: ReactNode;
  stacked?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  const { key } = useLocation();

  useEffect(() => {
    ref.current?.removeAttribute('open');
  }, [key]);

  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Element && !event.target.closest('[role="dialog"]') && !ref.current?.contains(event.target)) {
        ref.current?.removeAttribute('open');
      }
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, []);

  return (
    <details ref={ref} className={`relative min-w-0 ${className}`} onKeyDown={(event) => {
      if (event.key === 'Escape' && ref.current?.contains(event.target as Node)) {
        ref.current.removeAttribute('open');
        ref.current.querySelector('summary')?.focus();
        event.stopPropagation();
      }
    }}>
      <summary className="flex cursor-pointer list-none items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 px-3 py-2 text-slate-700 transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-indigo-600 [&::-webkit-details-marker]:hidden">
        {label}
      </summary>
      <div className={stacked
        ? 'mt-2 flex min-w-0 flex-col gap-1 rounded-xl border border-slate-200 bg-white p-2'
        : 'absolute right-0 z-50 mt-2 flex w-60 max-w-[calc(100vw-2rem)] flex-col gap-1 whitespace-normal rounded-xl border border-slate-200 bg-white p-2 shadow-lg'}>
        {children}
      </div>
    </details>
  );
}
