import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate, useLocation } from 'react-router';
import {
  BookOpen,
  Building2,
  Calendar,
  CheckSquare,
  ClipboardCheck,
  Compass,
  CreditCard,
  FileSpreadsheet,
  FolderKanban,
  GraduationCap,
  HeadphonesIcon,
  Home,
  LayoutDashboard,
  Library,
  LogOut,
  Menu,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  UserCheck,
  UserRound,
  X,
  type LucideIcon,
} from 'lucide-react';
import { ConfirmDialog } from '@/components/ui/Feedback';
import { MobileNavigationDrawer } from '@/components/ui/MobileNavigationDrawer';
import { useMobileNavigation } from '@/components/ui/use-mobile-navigation';
import { useToast } from '@/components/ui/feedback-context';
import { useAuth } from '@/features/auth/auth-context';
import {
  IuhAcademicShell,
  IuhAdminShell,
  IuhCashierShell,
  IuhCounselorShell,
  IuhInspectorShell,
  IuhInstructorShell,
  IuhStudentShell,
} from '../features/class-lms/IuhLmsShell';
import type { UserRole } from '@/features/auth/api';
import { roleNames, workspaceTitles } from '@/features/presentation/labels';
import { accountLabel } from '@/features/catalog/record-presentation';
import { PublicLayout } from './PublicLayout';
import { LearnerBreadcrumbs } from './LearnerBreadcrumbs';

type NavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
};

type NavGroup = {
  title: string;
  items: NavItem[];
};

const ROLE_BADGE_TONE: Record<UserRole, string> = {
  STUDENT: 'border-sky-200 bg-sky-50 text-sky-800',
  INSTRUCTOR: 'border-indigo-200 bg-indigo-50 text-indigo-800',
  COUNSELOR: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  ACADEMIC_MANAGER: 'border-violet-200 bg-violet-50 text-violet-800',
  CASHIER: 'border-amber-200 bg-amber-50 text-amber-800',
  TEACHING_INSPECTOR: 'border-teal-200 bg-teal-50 text-teal-800',
  SYSTEM_ADMIN: 'border-slate-300 bg-slate-100 text-slate-800',
  ADMIN_COORDINATOR: 'border-rose-200 bg-rose-50 text-rose-800',
};

function getRoleNavGroups(role: UserRole): NavGroup[] {
  switch (role) {
    case 'ACADEMIC_MANAGER':
      return [
        {
          title: 'Điều hành học vụ',
          items: [
            { to: '/academic', label: 'Chương trình & Lớp học', icon: FolderKanban, end: true },
            { to: '/academic/planning', label: 'Phòng học & Xếp lịch', icon: Building2 },
            { to: '/academic/approvals', label: 'Yêu cầu chờ duyệt', icon: CheckSquare },
            {
              to: '/academic/session-engagement',
              label: 'Buổi học & Điểm danh',
              icon: UserCheck,
            },
          ],
        },
        {
          title: 'Bàn làm việc & Lịch',
          items: [
            { to: '/my/', label: 'Lịch tháng', icon: Calendar },
            { to: '/workspace', label: 'Tổng quan học vụ', icon: LayoutDashboard, end: true },
            { to: '/calendar', label: 'Lịch trung tâm theo ngày', icon: Calendar },
          ],
        },
        {
          title: 'Nghiệp vụ liên thông',
          items: [
            { to: '/workspace/admissions', label: 'Hồ sơ tuyển sinh', icon: ClipboardCheck },
            { to: '/workspace/inspection', label: 'Điều phối thanh tra', icon: ShieldCheck },
            { to: '/workspace/placement', label: 'Điều phối đầu vào', icon: Compass },
            { to: '/consultations', label: 'Duyệt tư vấn 1:1', icon: MessageSquare },
            { to: '/workspace/support', label: 'Chuyển tuyến CSKH', icon: HeadphonesIcon },
            { to: '/knowledge/workspace', label: 'Biên soạn kiến thức TOEIC', icon: Library },
            { to: '/workspace/reports', label: 'Báo cáo tổng hợp', icon: FileSpreadsheet },
          ],
        },
      ];
    case 'INSTRUCTOR':
      return [
        {
          title: 'Không gian giảng dạy',
          items: [
            { to: '/my/calendar', label: 'Lịch dạy & Lớp của tôi', icon: Calendar },
            { to: '/workspace', label: 'Tổng quan giảng viên', icon: LayoutDashboard, end: true },
            { to: '/calendar', label: 'Lịch buổi chính thức', icon: Calendar },
          ],
        },
        {
          title: 'Chuyên môn & Đánh giá',
          items: [
            { to: '/consultations', label: 'Lịch hẹn tư vấn 1:1', icon: MessageSquare },
            { to: '/workspace/placement', label: 'Đề thi & Chấm đầu vào', icon: Compass },
            { to: '/workspace/inspection', label: 'Giờ giảng & Xác nhận ca', icon: ShieldCheck },
            { to: '/workspace/reports', label: 'Báo cáo giảng dạy', icon: FileSpreadsheet },
          ],
        },
      ];
    case 'COUNSELOR':
      return [
        {
          title: 'Tư vấn & Chăm sóc',
          items: [
            { to: '/workspace', label: 'Tổng quan tư vấn', icon: LayoutDashboard, end: true },
            { to: '/workspace/support', label: 'Hàng đợi phiếu hỗ trợ', icon: HeadphonesIcon },
          ],
        },
      ];
    case 'CASHIER':
      return [
        {
          title: 'Thu ngân & Học phí',
          items: [
            { to: '/workspace', label: 'Tổng quan thu ngân', icon: LayoutDashboard, end: true },
            { to: '/payments/sepay', label: 'Đối soát cổng SePay', icon: CreditCard },
            { to: '/workspace/admissions', label: 'Hồ sơ & Biên nhận thu', icon: ClipboardCheck },
            { to: '/workspace/reports', label: 'Báo cáo thu ngân', icon: FileSpreadsheet },
          ],
        },
      ];
    case 'TEACHING_INSPECTOR':
      return [
        {
          title: 'Thanh tra giảng dạy',
          items: [
            { to: '/workspace', label: 'Tổng quan thanh tra', icon: LayoutDashboard, end: true },
            { to: '/workspace/inspection', label: 'Ca trực & Chấm công', icon: ShieldCheck },
            { to: '/workspace/reports', label: 'Báo cáo thanh tra', icon: FileSpreadsheet },
          ],
        },
      ];
    case 'SYSTEM_ADMIN':
      return [
        {
          title: 'Quản trị hệ thống',
          items: [
            { to: '/workspace', label: 'Tổng quan quản trị', icon: LayoutDashboard, end: true },
            {
              to: '/workspace/authority',
              label: 'Quản lý tài khoản',
              icon: ShieldAlert,
            },
            {
              to: '/workspace/operations',
              label: 'Nhật ký & Tình trạng hệ thống',
              icon: SlidersHorizontal,
            },
            { to: '/workspace/reports', label: 'Báo cáo hệ thống', icon: FileSpreadsheet },
          ],
        },
      ];
    case 'STUDENT':
      return [
        {
          title: 'Học tập của tôi',
          items: [
            { to: '/my/', label: 'Lịch tháng', icon: Calendar },
            { to: '/student/enrollments', label: 'Lớp đang theo học', icon: GraduationCap },
            { to: '/workspace', label: 'Trang học tập', icon: LayoutDashboard, end: true },
            { to: '/completion', label: 'Hoàn thành & Chứng chỉ', icon: CheckSquare },
          ],
        },
        {
          title: 'Dịch vụ & Hỗ trợ',
          items: [
            { to: '/admissions', label: 'Học phí & Ghi danh', icon: ClipboardCheck },
            { to: '/consultations', label: 'Đặt lịch tư vấn 1:1', icon: MessageSquare },
            { to: '/support', label: 'Hỗ trợ học viên', icon: HeadphonesIcon },
          ],
        },
      ];
    default:
      return [
        {
          title: 'Không gian hạn chế',
          items: [{ to: '/workspace', label: 'Tổng quan tài khoản', icon: LayoutDashboard }],
        },
      ];
  }
}

export function ActorWorkspaceLayout() {
  const { user, logout } = useAuth();
  const notify = useToast();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const mobile = useMobileNavigation();
  const [confirmLogoutOpen, setConfirmLogoutOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  if (!user) {
    return <PublicLayout />;
  }

  const mobileOpen = mobile.open;
  const navGroups = getRoleNavGroups(user.role);
  const roleLabel = roleNames[user.role];
  const displayUserName = accountLabel(user.fullName);
  const learnerItemActive = (to: string, isActive: boolean) => {
    if (user.role !== 'STUDENT') return isActive;
    if (to === '/student/enrollments')
      return pathname.startsWith('/student/enrollments') || pathname.startsWith('/classroom/');
    if (to === '/my/') return pathname === '/my' || pathname.startsWith('/my/');
    return isActive;
  };

  async function confirmLogout() {
    setIsLoggingOut(true);
    try {
      await logout();
      setConfirmLogoutOpen(false);
      navigate('/');
      notify('Phiên đăng nhập đã kết thúc an toàn.');
    } catch {
      notify('Không thể đăng xuất. Vui lòng thử lại.', 'error');
    } finally {
      setIsLoggingOut(false);
    }
  }

  if (
    user.role === 'STUDENT' ||
    user.role === 'INSTRUCTOR' ||
    user.role === 'ACADEMIC_MANAGER' ||
    user.role === 'COUNSELOR' ||
    user.role === 'CASHIER' ||
    user.role === 'TEACHING_INSPECTOR' ||
    user.role === 'SYSTEM_ADMIN'
  ) {
    const Shell =
      user.role === 'INSTRUCTOR'
        ? IuhInstructorShell
        : user.role === 'ACADEMIC_MANAGER'
          ? IuhAcademicShell
          : user.role === 'COUNSELOR'
            ? IuhCounselorShell
            : user.role === 'CASHIER'
              ? IuhCashierShell
              : user.role === 'TEACHING_INSPECTOR'
                ? IuhInspectorShell
                : user.role === 'SYSTEM_ADMIN'
                  ? IuhAdminShell
                  : IuhStudentShell;
    return (
      <>
        <Shell
          displayUserName={displayUserName}
          avatarUrl={user.avatarUrl}
          onLogoutRequest={() => setConfirmLogoutOpen(true)}
        >
          <Outlet />
        </Shell>
        <ConfirmDialog
          busyLabel="Đang đăng xuất..."
          confirmLabel="Đăng xuất"
          description="Bạn có thể đăng nhập lại bất kỳ lúc nào để tiếp tục công việc và xem dữ liệu đã lưu."
          isBusy={isLoggingOut}
          onCancel={() => {
            if (!isLoggingOut) setConfirmLogoutOpen(false);
          }}
          onConfirm={() => void confirmLogout()}
          open={confirmLogoutOpen}
          title="Kết thúc phiên đăng nhập?"
        />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50/90 text-slate-900" data-workspace-shell="actor">
      <a
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-indigo-700 focus:px-4 focus:py-2 focus:text-white"
        href="#main-content"
      >
        Chuyển đến nội dung chính
      </a>

      <div className="flex min-h-screen">
        {/* Desktop Left Workspace Sidebar */}
        <aside
          aria-label="Thanh điều hướng không gian làm việc"
          className={`admin-shell-sidebar hidden shrink-0 flex-col border-r border-slate-200/90 bg-white transition-all duration-200 lg:sticky lg:top-0 lg:flex lg:h-screen ${
            collapsed ? 'w-20' : 'w-68'
          }`}
        >
          <div className="flex h-16 items-center justify-between border-b border-slate-200/80 px-4">
            <Link
              to="/"
              className="flex min-w-0 items-center gap-3 font-bold tracking-tight text-slate-950"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-indigo-600 text-sm font-extrabold text-white shadow-sm shadow-indigo-600/20">
                SE
              </span>
              {!collapsed && (
                <span className="truncate">
                  Smart English
                  <span className="block text-[11px] font-medium text-slate-500">
                    {workspaceTitles[user.role]}
                  </span>
                </span>
              )}
            </Link>
            <button
              type="button"
              onClick={() => setCollapsed((v) => !v)}
              aria-label={collapsed ? 'Mở rộng thanh bên' : 'Thu gọn thanh bên'}
              className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
            >
              {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
            </button>
          </div>

          <div className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
            {navGroups.map((group) => (
              <div key={group.title} className="space-y-1">
                {!collapsed && (
                  <p className="px-3 text-[11px] font-bold tracking-wider text-slate-400 uppercase">
                    {group.title}
                  </p>
                )}
                <nav aria-label={group.title} className="space-y-1">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    return (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        end={item.end}
                        aria-current={learnerItemActive(item.to, false) ? 'page' : undefined}
                        title={collapsed ? item.label : undefined}
                        className={({ isActive }) =>
                          `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                            learnerItemActive(item.to, isActive)
                              ? 'bg-indigo-600 text-white shadow-xs'
                              : 'text-slate-700 hover:bg-slate-100 hover:text-indigo-700'
                          } ${collapsed ? 'justify-center' : ''}`
                        }
                      >
                        <Icon size={18} className="shrink-0" aria-hidden="true" />
                        {!collapsed && <span className="truncate">{item.label}</span>}
                      </NavLink>
                    );
                  })}
                </nav>
              </div>
            ))}
          </div>

          <div className="border-t border-slate-200/80 p-3">
            <div
              className={`flex items-center gap-3 rounded-xl bg-slate-50 p-2.5 ${
                collapsed ? 'justify-center' : ''
              }`}
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-800">
                <UserRound size={16} aria-hidden="true" />
              </span>
              {!collapsed && (
                <div className="min-w-0 flex-1">
                  <Link
                    to="/profile"
                    className="block truncate text-sm font-bold text-slate-900 hover:text-indigo-700"
                  >
                    {displayUserName}
                  </Link>
                  <span
                    className={`mt-0.5 inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${ROLE_BADGE_TONE[user.role]}`}
                  >
                    {roleLabel}
                  </span>
                </div>
              )}
            </div>
          </div>
        </aside>

        {/* Main Workspace Column */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Compact Top Utility Header */}
          <header className="admin-shell-header sticky top-0 z-30 border-b border-slate-200/80 bg-white/95 backdrop-blur">
            <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
              <div className="flex min-w-0 items-center gap-3">
                <button
                  type="button"
                  aria-label="Mở menu điều hướng"
                  aria-expanded={mobileOpen}
                  onClick={mobile.openMenu}
                  className="inline-flex size-10 items-center justify-center rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-100 lg:hidden"
                >
                  {mobileOpen ? <X size={19} /> : <Menu size={19} />}
                </button>
                <div className="flex min-w-0 items-center gap-2.5">
                  <span
                    className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${ROLE_BADGE_TONE[user.role]}`}
                  >
                    {roleLabel}
                  </span>
                  <span className="hidden truncate text-sm font-medium text-slate-600 sm:inline">
                    {workspaceTitles[user.role]} · Smart English
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 sm:gap-3">
                <Link
                  to="/"
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-indigo-200 hover:bg-indigo-50/60 hover:text-indigo-700 sm:text-sm"
                >
                  <Home size={15} aria-hidden="true" />
                  <span className="hidden sm:inline">Trang công khai</span>
                </Link>
                <Link
                  to="/profile"
                  className="hidden items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-semibold text-slate-800 transition hover:border-indigo-200 hover:bg-indigo-50/50 md:inline-flex"
                >
                  <UserRound size={15} className="text-indigo-600" aria-hidden="true" />
                  <span className="max-w-40 truncate">{displayUserName}</span>
                </Link>
                <button
                  type="button"
                  onClick={() => setConfirmLogoutOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 sm:text-sm"
                >
                  <LogOut size={15} aria-hidden="true" />
                  <span>Đăng xuất</span>
                </button>
              </div>
            </div>
          </header>

          {/* Mobile Slide-Over Workspace Drawer */}
          <MobileNavigationDrawer
            open={mobileOpen}
            onClose={mobile.closeMenu}
            title="Điều hướng không gian di động"
            className="relative z-10 flex h-dvh w-76 max-w-[85vw] flex-col overflow-y-auto overscroll-contain bg-white shadow-2xl"
          >
            <div className="flex h-16 items-center justify-between border-b border-slate-200 px-4">
              <div className="flex items-center gap-2.5">
                <span className="grid size-8 place-items-center rounded-lg bg-indigo-600 text-xs font-bold text-white">
                  SE
                </span>
                <div>
                  <p className="text-sm font-bold text-slate-950">Smart English</p>
                  <p className="text-xs text-slate-500">{roleLabel}</p>
                </div>
              </div>
              <button
                type="button"
                data-drawer-close
                aria-label="Đóng menu điều hướng"
                onClick={mobile.closeMenu}
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 space-y-5 overflow-y-auto p-4">
              {navGroups.map((group) => (
                <div key={group.title} className="space-y-1.5">
                  <p className="px-2 text-[11px] font-bold tracking-wider text-slate-400 uppercase">
                    {group.title}
                  </p>
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    return (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        end={item.end}
                        aria-current={learnerItemActive(item.to, false) ? 'page' : undefined}
                        className={({ isActive }) =>
                          `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold ${
                            learnerItemActive(item.to, isActive)
                              ? 'bg-indigo-600 text-white'
                              : 'text-slate-700 hover:bg-slate-100'
                          }`
                        }
                      >
                        <Icon size={18} aria-hidden="true" />
                        <span>{item.label}</span>
                      </NavLink>
                    );
                  })}
                </div>
              ))}
            </div>
          </MobileNavigationDrawer>

          {/* Workspace Main Content */}
          <div id="main-content" className="admin-shell-content flex-1">
            {user.role === 'STUDENT' && <LearnerBreadcrumbs />}
            <Outlet />
          </div>
        </div>
      </div>

      <ConfirmDialog
        busyLabel="Đang đăng xuất..."
        confirmLabel="Đăng xuất"
        description="Bạn có thể đăng nhập lại bất kỳ lúc nào để tiếp tục công việc và xem dữ liệu đã lưu."
        isBusy={isLoggingOut}
        onCancel={() => {
          if (!isLoggingOut) setConfirmLogoutOpen(false);
        }}
        onConfirm={() => void confirmLogout()}
        open={confirmLogoutOpen}
        title="Kết thúc phiên đăng nhập?"
      />
    </div>
  );
}
