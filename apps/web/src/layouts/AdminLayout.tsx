import { useEffect, useRef, useState } from 'react';
import {
  BookOpen,
  ExternalLink,
  GraduationCap,
  Lightbulb,
  LogOut,
  Menu,
  UserCog,
  X,
} from 'lucide-react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router';
import { useAuth } from '@/features/auth/auth-context';

const links = [
  [BookOpen, '/admin/courses', 'Khóa học'],
  [GraduationCap, '/admin/class-offerings', 'Lớp học'],
  [UserCog, '/admin/accounts', 'Tài khoản'],
  [Lightbulb, '/admin/criteria/evaluation', 'Tiêu chí & quy tắc'],
] as const;

export function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const closeButton = useRef<HTMLButtonElement>(null);
  const openButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!drawerOpen) return;
    closeButton.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setDrawerOpen(false);
        window.setTimeout(() => openButton.current?.focus(), 0);
      }
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [drawerOpen]);

  const closeDrawer = () => {
    setDrawerOpen(false);
    window.setTimeout(() => openButton.current?.focus(), 0);
  };

  const navigation = (
    <nav aria-label="Điều hướng quản trị" className="space-y-1">
      {links.map(([Icon, to, label]) => (
        <NavLink
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold transition ${isActive ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:bg-indigo-50 hover:text-indigo-700'}`
          }
          key={to}
          onClick={closeDrawer}
          to={to}
        >
          <Icon aria-hidden="true" size={18} />
          {label}
        </NavLink>
      ))}
    </nav>
  );

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-950">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <button
              aria-controls="admin-mobile-navigation"
              aria-expanded={drawerOpen}
              aria-label="Mở điều hướng quản trị"
              className="rounded-xl border border-slate-200 p-2 lg:hidden"
              onClick={() => setDrawerOpen(true)}
              ref={openButton}
              type="button"
            >
              <Menu />
            </button>
            <div>
              <Link
                className="text-lg font-black tracking-tight text-indigo-700"
                to="/admin/courses"
              >
                Smart English
              </Link>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Không gian quản trị
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold">{user?.fullName}</p>
              <p className="text-xs text-slate-500">Điều phối viên</p>
            </div>
            <Link
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              to="/"
            >
              <ExternalLink size={16} />
              <span className="hidden md:inline">Trang công khai</span>
            </Link>
            <button
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white"
              onClick={() => void handleLogout()}
              type="button"
            >
              <LogOut size={16} />
              <span className="hidden md:inline">Đăng xuất</span>
            </button>
          </div>
        </div>
      </header>
      <div className="mx-auto grid max-w-7xl gap-7 px-4 py-6 sm:px-6 lg:grid-cols-[240px_minmax(0,1fr)] lg:px-8">
        <aside className="sticky top-24 hidden self-start rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:block">
          {navigation}
        </aside>
        <main className="min-w-0">
          <Outlet />
        </main>
      </div>
      {drawerOpen ? (
        <div
          className="fixed inset-0 z-50 bg-slate-950/50 lg:hidden"
          onClick={closeDrawer}
          role="presentation"
        >
          <aside
            aria-label="Điều hướng quản trị trên thiết bị di động"
            aria-modal="true"
            className="h-full w-[min(20rem,88vw)] bg-white p-5 shadow-2xl"
            id="admin-mobile-navigation"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="mb-7 flex items-center justify-between">
              <div>
                <strong>Smart English</strong>
                <p className="text-sm text-slate-500">Không gian quản trị</p>
              </div>
              <button
                aria-label="Đóng điều hướng quản trị"
                className="rounded-lg border p-2"
                onClick={closeDrawer}
                ref={closeButton}
                type="button"
              >
                <X />
              </button>
            </div>
            {navigation}
          </aside>
        </div>
      ) : null}
    </div>
  );
}
