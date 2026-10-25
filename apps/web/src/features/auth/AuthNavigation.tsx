import { ChevronDown, GraduationCap, LayoutDashboard, LogOut, UserRound } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ConfirmDialog } from '@/components/ui/Feedback';
import { Avatar } from '@/components/ui/ProductPrimitives';
import { useToast } from '@/components/ui/feedback-context';
import { apiUrl } from '@/lib/api-client';
import { useAuth } from './auth-context';

export function AuthNavigation() {
  const { user, isLoading, logout } = useAuth();
  const navigate = useNavigate();
  const notify = useToast();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', escape);
    };
  }, [menuOpen]);

  if (isLoading) return <span className="text-sm text-slate-500">Đang tải...</span>;
  if (!user)
    return (
      <div className="flex items-center gap-2">
        <Link className="px-3 py-2 font-semibold text-slate-700" to="/login">
          Đăng nhập
        </Link>
        <Link
          className="rounded-xl bg-indigo-600 px-4 py-2 font-semibold text-white"
          to="/register"
        >
          Đăng ký
        </Link>
      </div>
    );

  const workspace =
    user.role === 'ADMIN_COORDINATOR'
      ? ['/admin/courses', 'Không gian quản trị']
      : user.role === 'INSTRUCTOR'
        ? ['/instructor/teaching', 'Lớp giảng dạy']
        : ['/student/enrollments', 'Khóa học của tôi'];
  const avatarUrl = user.avatarKey ? apiUrl(`/user-assets/avatars/${user.avatarKey}`) : null;
  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logout();
      setConfirmOpen(false);
      navigate('/');
      notify('Phiên đăng nhập đã kết thúc an toàn.');
    } catch {
      notify('Không thể đăng xuất. Vui lòng thử lại.', 'error');
    } finally {
      setIsLoggingOut(false);
    }
  };

  return (
    <div className="flex w-full min-w-0 flex-col gap-2 md:w-auto md:flex-row md:items-center">
      <Link
        className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-3 py-2 font-semibold text-slate-700 transition hover:bg-indigo-50 hover:text-indigo-700"
        to={workspace[0]}
      >
        {user.role === 'STUDENT' ? <GraduationCap size={17} /> : <LayoutDashboard size={17} />}
        {workspace[1]}
      </Link>
      <div className="relative" ref={menuRef}>
        <button
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          className="flex w-full min-w-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-left shadow-sm transition hover:border-indigo-300 hover:shadow md:w-auto md:max-w-48"
          onClick={() => setMenuOpen((value) => !value)}
          type="button"
        >
          <Avatar name={user.fullName} size="sm" src={avatarUrl} />
          <span className="min-w-0 flex-1 md:max-w-32">
            <span className="block truncate text-sm font-bold text-slate-900" title={user.fullName}>
              {user.fullName}
            </span>
            <span className="block text-xs text-slate-500 md:hidden 2xl:block">Tài khoản</span>
          </span>
          <ChevronDown
            className={`shrink-0 transition ${menuOpen ? 'rotate-180' : ''}`}
            size={16}
          />
        </button>
        {menuOpen ? (
          <div
            className="right-0 z-50 mt-2 w-full min-w-56 overflow-hidden rounded-2xl border bg-white p-2 shadow-xl md:absolute md:w-auto"
            role="menu"
          >
            <Link
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 font-semibold text-slate-700 hover:bg-slate-50"
              onClick={() => setMenuOpen(false)}
              role="menuitem"
              to="/profile"
            >
              <UserRound size={18} />
              Hồ sơ cá nhân
            </Link>
            <button
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 font-semibold text-rose-700 hover:bg-rose-50"
              onClick={() => {
                setMenuOpen(false);
                setConfirmOpen(true);
              }}
              role="menuitem"
              type="button"
            >
              <LogOut size={18} />
              Đăng xuất
            </button>
          </div>
        ) : null}
      </div>
      <ConfirmDialog
        busyLabel="Đang đăng xuất…"
        confirmLabel="Đăng xuất"
        description="Bạn sẽ cần đăng nhập lại để tiếp tục học hoặc quản lý lớp."
        isBusy={isLoggingOut}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => void handleLogout()}
        open={confirmOpen}
        title="Kết thúc phiên đăng nhập?"
      />
    </div>
  );
}
