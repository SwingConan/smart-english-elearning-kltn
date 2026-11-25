import {
  BookOpenCheck,
  CalendarDays,
  Compass,
  CreditCard,
  FileCheck2,
  FolderKanban,
  GraduationCap,
  Headphones,
  LayoutDashboard,
  UserCircle,
  Menu,
  X,
} from 'lucide-react';
import { Link, NavLink, Outlet } from 'react-router';
import { AuthNavigation } from '@/features/auth/AuthNavigation';
import { MobileNavigationDrawer } from '@/components/ui/MobileNavigationDrawer';
import { useMobileNavigation } from '@/components/ui/use-mobile-navigation';

const STUDENT_SIDEBAR_LINKS = [
  { to: '/my/', label: 'Lịch học & Tổng quan', icon: CalendarDays },
  { to: '/student/enrollments', label: 'Lớp học của tôi', icon: GraduationCap },
  { to: '/workspace', label: 'Bàn làm việc học viên', icon: LayoutDashboard },
  { to: '/admissions', label: 'Hồ sơ ghi danh', icon: FolderKanban },
  { to: '/payments/sepay', label: 'Thanh toán học phí', icon: CreditCard },
  { to: '/consultations', label: 'Đặt lịch tư vấn 1:1', icon: Compass },
  { to: '/support', label: 'Hỗ trợ học viên', icon: Headphones },
  { to: '/completion', label: 'Hoàn thành & Chứng chỉ', icon: FileCheck2 },
  { to: '/practice-tests', label: 'Luyện đề TOEIC', icon: BookOpenCheck },
  { to: '/profile', label: 'Hồ sơ cá nhân', icon: UserCircle },
];

export function StudentLayout() {
  const mobile = useMobileNavigation();
  const navigation = (
    <nav className="space-y-1" aria-label="Điều hướng học tập">
      {STUDENT_SIDEBAR_LINKS.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              'flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-semibold transition ' +
              (isActive
                ? 'bg-indigo-50 text-indigo-700'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900')
            }
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{item.label}</span>
          </NavLink>
        );
      })}
    </nav>
  );
  return (
    <div className="min-h-screen bg-slate-100/80 text-slate-950" data-workspace-shell="student">
      <header className="sticky top-0 z-30 border-b border-slate-200/90 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1680px] flex-wrap items-center justify-between gap-4 px-4 py-3.5 sm:px-6 lg:px-8">
          <Link className="flex items-center gap-3 font-bold" to="/">
            <span className="grid size-10 place-items-center rounded-xl bg-indigo-600 text-white shadow-xs">
              <BookOpenCheck aria-hidden="true" size={22} />
            </span>
            <span>
              Smart English
              <span className="block text-xs font-medium text-slate-500">Không gian học tập</span>
            </span>
          </Link>
          <div className="flex flex-wrap items-center justify-end gap-4 text-sm">
            <button
              type="button"
              aria-label="Mở điều hướng học tập"
              aria-expanded={mobile.open}
              onClick={mobile.openMenu}
              className="rounded-lg border border-slate-200 p-2 text-slate-700 lg:hidden"
            >
              <Menu aria-hidden="true" size={20} />
            </button>
            <div className="hidden items-center gap-4 lg:flex">
              <Link className="font-medium text-slate-600 hover:text-indigo-700" to="/">
                Trang chủ
              </Link>
              <AuthNavigation />
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1680px] gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[260px_minmax(0,1fr)] lg:px-8">
        <aside
          aria-label="Điều hướng học viên"
          className="hidden self-start rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-xs lg:sticky lg:top-20 lg:block"
        >
          <p className="px-3 pb-2 text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
            Khu vực học viên
          </p>
          {navigation}
        </aside>

        <main className="min-w-0">
          <Outlet />
        </main>
      </div>
      <MobileNavigationDrawer
        open={mobile.open}
        onClose={mobile.closeMenu}
        title="Điều hướng học tập trên thiết bị di động"
        className="relative z-10 flex h-dvh w-76 max-w-[85vw] flex-col overflow-y-auto overscroll-contain bg-white p-4 shadow-2xl"
      >
        <div className="mb-4 flex items-center justify-between border-b border-slate-200 pb-3">
          <p className="font-bold text-slate-950">Học tập của tôi</p>
          <button
            type="button"
            data-drawer-close
            aria-label="Đóng điều hướng học tập"
            onClick={mobile.closeMenu}
            className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        {navigation}
        <div className="mt-4 border-t border-slate-200 pt-3 text-sm">
          <AuthNavigation layout="stacked" />
        </div>
      </MobileNavigationDrawer>
    </div>
  );
}
