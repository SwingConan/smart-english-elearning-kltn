import { useEffect, useRef, useState } from 'react';
import { BookOpenCheck, ChevronDown, Menu, X } from 'lucide-react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { AuthNavigation } from '@/features/auth/AuthNavigation';

const publicLinks = [
  ['/', 'Trang chủ'],
  ['/catalog', 'Khóa học'],
  ['/placement', 'Kiểm tra đầu vào'],
  ['/guide', 'Hướng dẫn học'],
  ['/news-events', 'Tin tức & Sự kiện'],
  ['/about', 'Về chúng tôi'],
] as const;
const primaryLinks = publicLinks.slice(0, 4);
const secondaryLinks = publicLinks.slice(4);

export function PublicLayout() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    const trigger = triggerRef.current;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', closeOnEscape);
      trigger?.focus();
    };
  }, [open]);
  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-5 px-4 py-4 sm:px-6 lg:px-8">
          <Link className="flex shrink-0 items-center gap-3 font-bold text-slate-950" to="/">
            <span className="grid size-10 place-items-center rounded-xl bg-indigo-600 text-white">
              <BookOpenCheck aria-hidden="true" size={22} />
            </span>
            <span className="leading-tight">
              Smart English
              <span className="block text-xs font-medium text-slate-500">
                TOEIC Learning Platform
              </span>
            </span>
          </Link>
          <div
            className="hidden min-w-0 items-center gap-4 text-sm 2xl:flex"
            data-testid="wide-desktop-navigation"
          >
            <DesktopPrimaryNav label="Điều hướng chính đầy đủ" links={publicLinks} />
            <AuthNavigation />
          </div>
          <div
            className="hidden min-w-0 items-center gap-2 text-sm xl:flex 2xl:hidden"
            data-testid="compact-desktop-navigation"
          >
            <DesktopPrimaryNav label="Điều hướng chính thu gọn" links={primaryLinks} />
            <MoreMenu />
            <AuthNavigation />
          </div>
          <button
            aria-expanded={open}
            aria-label={open ? 'Đóng menu' : 'Mở menu'}
            className="rounded-lg border p-2 xl:hidden"
            onClick={() => setOpen((value) => !value)}
            ref={triggerRef}
            type="button"
          >
            {open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
          </button>
        </div>
        {open ? (
          <>
            <button
              aria-label="Đóng điều hướng"
              className="fixed inset-0 z-50 bg-slate-950/45 xl:hidden"
              onClick={() => setOpen(false)}
              type="button"
            />
            <aside
              aria-label="Điều hướng di động"
              aria-modal="true"
              className="fixed inset-y-0 right-0 z-[60] w-[min(360px,92vw)] overflow-y-auto bg-white p-5 shadow-2xl xl:hidden"
              data-testid="mobile-navigation-drawer"
              role="dialog"
            >
              <div className="flex items-center justify-between gap-4 border-b pb-4">
                <strong>Menu</strong>
                <button
                  aria-label="Đóng menu"
                  className="rounded-lg border p-2"
                  onClick={() => setOpen(false)}
                  ref={closeRef}
                  type="button"
                >
                  <X aria-hidden="true" />
                </button>
              </div>
              <nav className="mt-4 flex flex-col gap-1">
                {publicLinks.map(([to, label]) => (
                  <NavLink
                    className={({ isActive }) =>
                      `rounded-xl px-3 py-2.5 font-medium transition ${isActive ? 'bg-indigo-50 text-indigo-700' : 'hover:bg-slate-50'}`
                    }
                    key={to}
                    onClick={() => setOpen(false)}
                    end={to === '/'}
                    to={to}
                  >
                    {label}
                  </NavLink>
                ))}
              </nav>
              <div className="mt-4 border-t pt-4 text-sm">
                <AuthNavigation />
              </div>
            </aside>
          </>
        ) : null}
      </header>
      <main>
        <Outlet />
      </main>
      <footer className="mt-20 bg-slate-950 text-slate-300">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-3 lg:px-8">
          <div>
            <h2 className="font-semibold text-white">Smart English E-Learning</h2>
            <p className="mt-3 max-w-sm text-sm leading-6">
              Nền tảng học TOEIC theo lớp, kết nối nội dung, bài kiểm tra và tiến độ trong một hành
              trình rõ ràng.
            </p>
          </div>
          <div>
            <h2 className="font-semibold text-white">Khám phá</h2>
            <div className="mt-3 flex flex-col gap-2 text-sm">
              <Link to="/catalog">Khóa học</Link>
              <Link to="/placement">Kiểm tra đầu vào</Link>
              <Link to="/guide">Hướng dẫn học</Link>
              <Link to="/news-events">Tin tức & Sự kiện</Link>
            </div>
          </div>
          <div>
            <h2 className="font-semibold text-white">Hỗ trợ</h2>
            <div className="mt-3 flex flex-col gap-2 text-sm">
              <Link to="/guide">Hướng dẫn học</Link>
              <Link to="/news-events">Tin tức & Sự kiện</Link>
              <Link to="/status">Trạng thái hệ thống</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

function DesktopPrimaryNav({
  label,
  links,
}: {
  label: string;
  links: typeof publicLinks | typeof primaryLinks;
}) {
  return (
    <nav aria-label={label} className="flex items-center gap-3 font-medium 2xl:gap-5">
      {links.map(([to, label]) => (
        <NavLink
          className={({ isActive }) =>
            isActive
              ? 'relative whitespace-nowrap py-2 text-indigo-700 after:absolute after:inset-x-0 after:-bottom-2 after:h-0.5 after:rounded-full after:bg-indigo-600'
              : 'whitespace-nowrap py-2 text-slate-600 transition hover:text-indigo-700'
          }
          end={to === '/'}
          key={to}
          to={to}
        >
          {label}
        </NavLink>
      ))}
    </nav>
  );
}

function MoreMenu() {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const containsActiveRoute = secondaryLinks.some(([to]) => location.pathname.startsWith(to));

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener('mousedown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  return (
    <div className="relative" ref={rootRef}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        className={`inline-flex items-center gap-1 whitespace-nowrap rounded-xl px-2.5 py-2 font-semibold transition hover:bg-indigo-50 hover:text-indigo-700 ${containsActiveRoute ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600'}`}
        onClick={() => setOpen((value) => !value)}
        ref={triggerRef}
        type="button"
      >
        Thêm
        <ChevronDown className={`transition ${open ? 'rotate-180' : ''}`} size={15} />
      </button>
      {open ? (
        <div
          className="absolute left-0 top-full z-50 mt-2 min-w-52 rounded-2xl border bg-white p-2 shadow-xl"
          role="menu"
        >
          {secondaryLinks.map(([to, label]) => (
            <NavLink
              className={({ isActive }) =>
                `block whitespace-nowrap rounded-xl px-3 py-2.5 font-semibold ${isActive ? 'bg-indigo-50 text-indigo-700' : 'text-slate-700 hover:bg-slate-50'}`
              }
              end={false}
              key={to}
              onClick={() => setOpen(false)}
              role="menuitem"
              to={to}
            >
              {label}
            </NavLink>
          ))}
        </div>
      ) : null}
    </div>
  );
}
