import { useState } from 'react';
import { Menu, X } from 'lucide-react';
import { MobileNavigationDrawer } from '@/components/ui/MobileNavigationDrawer';
import { useMobileNavigation } from '@/components/ui/use-mobile-navigation';
import { Link, NavLink, Outlet, useNavigate } from 'react-router';
import { ConfirmDialog } from '@/components/ui/Feedback';
import { useToast } from '@/components/ui/feedback-context';
import { useAuth } from '@/features/auth/auth-context';
import { businessRoleLabels } from '@/features/auth/business-role';
import { OperationsNavigationLink } from '@/features/operations/OperationsNavigationLink';

const navItems = [
  { to: '/admin/courses', label: 'Khóa học' },
  { to: '/admin/classes', label: 'Lớp học' },
  { to: '/admin/enrollments', label: 'Đăng ký' },
  { to: '/admin/learners', label: 'Học viên' },
  { to: '/admin/accounts', label: 'Tài khoản' },
  { to: '/admin/criteria', label: 'Tiêu chí & quy tắc' },
  { to: '/admin/reports', label: 'Báo cáo' },
];

export function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const notify = useToast();
  const mobile = useMobileNavigation();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logout();
      setConfirmOpen(false);
      notify('Đã đăng xuất an toàn.', 'success');
      navigate('/login');
    } finally {
      setIsLoggingOut(false);
    }
  };

  const sidebar = (
    <>
      <div className="flex items-center justify-between lg:block">
        <div>
          <p className="text-xs font-semibold tracking-wider text-indigo-300 uppercase">
            Smart English
          </p>
          <h1 className="mt-1 text-xl font-bold text-white">Quản trị đào tạo</h1>
        </div>
        <Link
          to="/"
          className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white lg:mt-4 lg:inline-block"
        >
          Về cổng học viên
        </Link>
      </div>

      <nav aria-label="Điều hướng quản trị" className="mt-6 grid gap-2">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `rounded-xl px-3.5 py-2.5 text-sm font-semibold transition ${
                isActive
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-300 hover:bg-slate-900 hover:text-white'
              }`
            }
          >
            {item.label}
          </NavLink>
        ))}
        <OperationsNavigationLink />
      </nav>

      {user && (
        <div className="mt-8 rounded-2xl border border-slate-800 bg-slate-900 p-4 text-xs text-slate-300">
          <p className="font-semibold text-white">{user.fullName}</p>
          <p className="mt-1 break-all text-slate-400">{user.email}</p>
          <p className="mt-2 inline-flex rounded-full bg-indigo-950 px-2.5 py-1 font-semibold text-indigo-200">
            {businessRoleLabels[user.role]}
          </p>
          <button
            type="button"
            disabled={isLoggingOut}
            onClick={() => {
              mobile.closeMenu();
              setConfirmOpen(true);
            }}
            className="mt-4 w-full rounded-lg border border-slate-700 px-3 py-2 font-semibold text-slate-100 transition hover:border-slate-500 disabled:opacity-50"
          >
            {isLoggingOut ? 'Đang đăng xuất…' : 'Đăng xuất'}
          </button>
        </div>
      )}
    </>
  );

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <div className="mx-auto grid min-h-screen max-w-7xl lg:grid-cols-[17rem_minmax(0,1fr)]">
        <aside className="hidden border-b border-slate-200 bg-slate-950 p-6 text-slate-100 lg:block lg:border-r lg:border-b-0">
          {sidebar}
        </aside>

        <div className="min-w-0 p-4 sm:p-6 lg:p-8">
          <div className="mb-4 flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3 lg:hidden">
            <p className="font-bold text-slate-950">Quản trị đào tạo</p>
            <button
              type="button"
              aria-label="Mở điều hướng quản trị"
              aria-expanded={mobile.open}
              onClick={mobile.openMenu}
              className="rounded-lg border border-slate-200 p-2 text-slate-700"
            >
              <Menu size={20} aria-hidden="true" />
            </button>
          </div>
          <Outlet />
        </div>
      </div>

      <MobileNavigationDrawer
        open={mobile.open}
        onClose={mobile.closeMenu}
        title="Điều hướng quản trị trên thiết bị di động"
        className="relative z-10 h-dvh w-76 max-w-[85vw] overflow-y-auto overscroll-contain bg-slate-950 p-6 text-slate-100 shadow-2xl"
      >
        <div className="mb-3 flex justify-end">
          <button
            type="button"
            data-drawer-close
            aria-label="Đóng điều hướng quản trị"
            onClick={mobile.closeMenu}
            className="rounded-lg border border-slate-700 p-2 text-slate-100"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        {sidebar}
      </MobileNavigationDrawer>

      <ConfirmDialog
        open={confirmOpen}
        title="Kết thúc phiên đăng nhập?"
        description="Bạn sắp đăng xuất khỏi không gian quản trị. Mọi dữ liệu nháp chưa lưu trên biểu mẫu sẽ bị đóng."
        confirmLabel="Đăng xuất"
        cancelLabel="Ở lại"
        busy={isLoggingOut}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => void handleLogout()}
      />
    </div>
  );
}
