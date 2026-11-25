import { useId, useLayoutEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export function MobileNavigationDrawer({
  open,
  onClose,
  title,
  className,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  className: string;
  children: ReactNode;
}) {
  const titleId = useId();
  const overlayRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open || !overlayRef.current || !panelRef.current) return;
    const panel = panelRef.current;
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    const background = [...document.body.children]
      .filter((el): el is HTMLElement => el instanceof HTMLElement && el !== overlayRef.current)
      .map((el) => ({ el, inert: el.inert === true }));
    background.forEach(({ el }) => {
      el.inert = true;
    });
    document.body.style.overflow = 'hidden';

    const focusable = () =>
      [...panel.querySelectorAll<HTMLElement>('*')].filter(
        (el) =>
          el.matches(
            'a[href], summary, button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
          ) &&
          !el.hidden &&
          (!el.closest('details:not([open])') || el.matches('summary')) &&
          !el.closest('[inert]') &&
          getComputedStyle(el).display !== 'none' &&
          getComputedStyle(el).visibility !== 'hidden',
      );
    (panel.querySelector<HTMLElement>('[data-drawer-close]') ?? focusable()[0] ?? panel).focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.target instanceof Element && event.target.closest('[role="dialog"]') !== panel)
        return;
      // A confirmation opened inside the drawer owns its keyboard interaction.
      const dialogs = document.querySelectorAll('[role="dialog"][aria-modal="true"]');
      if (dialogs[dialogs.length - 1] !== panel) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
      if (event.key !== 'Tab') return;
      const controls = focusable();
      const first = controls[0],
        last = controls[controls.length - 1];
      if (!first || !last) {
        event.preventDefault();
        panel.focus();
        return;
      }
      if (!panel.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    const onResize = () => {
      if (window.innerWidth >= 1024) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onResize);
      background.forEach(({ el, inert }) => {
        el.inert = inert;
      });
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected && getComputedStyle(previousFocus).display !== 'none') {
        previousFocus.focus({ preventScroll: true });
      } else {
        const activeLink = [
          ...document.querySelectorAll<HTMLElement>('a[aria-current="page"]'),
        ].find((el) => el.getClientRects().length > 0);
        activeLink?.focus({ preventScroll: true });
      }
    };
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex lg:hidden" ref={overlayRef}>
      <div
        className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs"
        data-drawer-backdrop
        onClick={onClose}
      />
      <div
        aria-labelledby={titleId}
        aria-modal="true"
        className={className}
        onClick={(event) => {
          if (event.target instanceof Element && event.target.closest('a[href]')) onClose();
        }}
        ref={panelRef}
        role="dialog"
        tabIndex={-1}
      >
        <h2 className="sr-only" id={titleId}>
          {title}
        </h2>
        {children}
      </div>
    </div>,
    document.body,
  );
}
