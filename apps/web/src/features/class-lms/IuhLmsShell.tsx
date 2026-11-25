import { useContext, useEffect, useId, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation, useMatch } from 'react-router';
import { AuthContext } from '@/features/auth/auth-context';
import {
  Activity,
  Award,
  Bell,
  BookOpen,
  Building2,
  Calendar,
  Check,
  CheckSquare,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  CreditCard,
  FileCheck2,
  FileSpreadsheet,
  FileText,
  FileUp,
  GraduationCap,
  HelpCircle,
  Home,
  LayoutDashboard,
  Library,
  Link2,
  List,
  LogOut,
  Menu,
  MessageSquare,
  ShieldCheck,
  SlidersHorizontal,
  UserCheck,
  UserRound,
  Users,
  Video,
  X,
} from 'lucide-react';
import { MobileNavigationDrawer } from '@/components/ui/MobileNavigationDrawer';

export function SmartEnglishEmblem({ size = 34 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 36 36"
      fill="none"
      aria-hidden="true"
      className="shrink-0"
    >
      <rect width="36" height="36" rx="8" fill="#76a35e" />
      <path d="M8 11.5L18 7L28 11.5L18 16L8 11.5Z" fill="#ffffff" />
      <path d="M11 14.5V22.5C11 24.4 14.1 26 18 26C21.9 26 25 24.4 25 22.5V14.5L18 17.7L11 14.5Z" fill="#ffffff" fillOpacity="0.92" />
      <circle cx="28" cy="25" r="4" fill="#e66f2b" />
    </svg>
  );
}

export type CourseIndexSection = {
  id: string;
  title: string;
  activities: Array<{
    id: string;
    title: string;
    type: string;
    visible?: boolean;
    completed?: boolean;
  }>;
};

export function activityTypeMicroLabel(type: string): string {
  switch (type) {
    case 'LESSON':
      return 'BÀI HỌC';
    case 'ASSIGNMENT':
      return 'BÀI TẬP';
    case 'LOCAL_QUIZ':
    case 'QUIZ':
      return 'QUIZ LUYỆN TẬP';
    case 'REGULAR':
      return 'KIỂM TRA THƯỜNG KỲ';
    case 'MIDTERM':
      return 'KIỂM TRA GIỮA KỲ';
    case 'FINAL':
      return 'KIỂM TRA CUỐI KỲ';
    case 'LOCAL_ATTENDANCE':
      return 'ĐIỂM DANH';
    case 'RESOURCE':
      return 'TÀI NGUYÊN';
    case 'MEETING':
      return 'BUỔI HỌC TRỰC TUYẾN';
    default:
      return type;
  }
}

export function IuhActivityBadge({
  type,
  size = 'md',
}: {
  type: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const dim =
    size === 'lg' ? 'size-11 rounded-md' : size === 'sm' ? 'size-6 rounded' : 'size-10 rounded-md';
  const iconSize = size === 'lg' ? 22 : size === 'sm' ? 13 : 20;

  let bg = 'bg-[#6f5ce6] text-white';
  let Icon = BookOpen;

  if (type === 'ASSIGNMENT') {
    bg = 'bg-[#ea4c89] text-white';
    Icon = FileUp;
  } else if (type === 'LOCAL_QUIZ' || type === 'QUIZ') {
    bg = 'bg-[#d63384] text-white';
    Icon = FileCheck2;
  } else if (type === 'REGULAR') {
    bg = 'bg-[#0d9488] text-white';
    Icon = FileCheck2;
  } else if (type === 'MIDTERM') {
    bg = 'bg-[#7c3aed] text-white';
    Icon = FileCheck2;
  } else if (type === 'FINAL') {
    bg = 'bg-[#be123c] text-white';
    Icon = FileCheck2;
  } else if (type === 'LOCAL_ATTENDANCE') {
    bg = 'bg-[#e67e22] text-white';
    Icon = UserCheck;
  } else if (type === 'RESOURCE') {
    bg = 'bg-[#2b7de9] text-white';
    Icon = Link2;
  } else if (type === 'MEETING') {
    bg = 'bg-[#0ea5e9] text-white';
    Icon = Video;
  }

  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center shadow-2xs ${dim} ${bg}`}
    >
      <Icon size={iconSize} strokeWidth={2.1} />
    </span>
  );
}

const BANNER_PALETTES = [
  { bg: '#14b8a6', c1: '#0d9488', c2: '#2dd4bf', c3: '#0f766e', mode: 'squares' as const },
  { bg: '#a5b4fc', c1: '#818cf8', c2: '#c7d2fe', c3: '#6366f1', mode: 'diamonds' as const },
  { bg: '#0284c7', c1: '#0369a1', c2: '#38bdf8', c3: '#0ea5e9', mode: 'hex' as const },
  { bg: '#f43f5e', c1: '#e11d48', c2: '#fb7185', c3: '#be123c', mode: 'triangles' as const },
  { bg: '#94a3b8', c1: '#64748b', c2: '#cbd5e1', c3: '#475569', mode: 'circles' as const },
  { bg: '#2563eb', c1: '#1d4ed8', c2: '#60a5fa', c3: '#1e40af', mode: 'waves' as const },
];

export function IuhCourseCardBanner({
  variantIndex = 0,
  locked = false,
}: {
  variantIndex?: number;
  locked?: boolean;
}) {
  const uid = useId().replace(/:/g, '');
  const palette = BANNER_PALETTES[Math.abs(variantIndex) % BANNER_PALETTES.length];
  const patId = `iuh-pat-${uid}-${variantIndex}`;

  return (
    <div className="relative h-24 w-full overflow-hidden border-b border-slate-200/70">
      <svg
        viewBox="0 0 360 96"
        preserveAspectRatio="xMidYMid slice"
        className={`h-full w-full ${locked ? 'grayscale-[40%] opacity-85' : ''}`}
        aria-hidden="true"
      >
        <defs>
          {palette.mode === 'squares' && (
            <pattern id={patId} width="32" height="32" patternUnits="userSpaceOnUse">
              <rect width="32" height="32" fill={palette.bg} />
              <rect x="0" y="0" width="16" height="16" fill={palette.c1} opacity="0.55" />
              <rect x="16" y="16" width="16" height="16" fill={palette.c2} opacity="0.45" />
              <rect x="8" y="8" width="16" height="16" fill={palette.c3} opacity="0.2" />
            </pattern>
          )}
          {palette.mode === 'diamonds' && (
            <pattern id={patId} width="40" height="40" patternUnits="userSpaceOnUse">
              <rect width="40" height="40" fill={palette.bg} />
              <polygon points="20,0 40,20 20,40 0,20" fill={palette.c1} opacity="0.45" />
              <polygon points="20,8 32,20 20,32 8,20" fill={palette.c2} opacity="0.55" />
            </pattern>
          )}
          {palette.mode === 'hex' && (
            <pattern id={patId} width="44" height="38" patternUnits="userSpaceOnUse">
              <rect width="44" height="38" fill={palette.bg} />
              <polygon points="11,0 33,0 44,19 33,38 11,38 0,19" fill={palette.c1} opacity="0.42" />
              <polygon points="22,6 38,15 38,31 22,38 6,31 6,15" fill={palette.c2} opacity="0.28" />
            </pattern>
          )}
          {palette.mode === 'triangles' && (
            <pattern id={patId} width="44" height="38" patternUnits="userSpaceOnUse">
              <rect width="44" height="38" fill={palette.bg} />
              <polygon points="0,0 44,19 0,38" fill={palette.c1} opacity="0.5" />
              <polygon points="44,0 44,38 18,19" fill={palette.c2} opacity="0.45" />
            </pattern>
          )}
          {palette.mode === 'circles' && (
            <pattern id={patId} width="48" height="48" patternUnits="userSpaceOnUse">
              <rect width="48" height="48" fill={palette.bg} />
              <circle cx="24" cy="24" r="22" fill="none" stroke={palette.c1} strokeWidth="6" opacity="0.45" />
              <circle cx="0" cy="0" r="18" fill={palette.c2} opacity="0.35" />
              <circle cx="48" cy="48" r="18" fill={palette.c3} opacity="0.25" />
            </pattern>
          )}
          {palette.mode === 'waves' && (
            <pattern id={patId} width="64" height="48" patternUnits="userSpaceOnUse">
              <rect width="64" height="48" fill={palette.bg} />
              <path
                d="M0 16 Q16 0 32 16 T64 16 V48 H0 Z"
                fill={palette.c1}
                opacity="0.45"
              />
              <path
                d="M0 32 Q16 18 32 32 T64 32 V48 H0 Z"
                fill={palette.c2}
                opacity="0.3"
              />
            </pattern>
          )}
        </defs>
        <rect width="360" height="96" fill={`url(#${patId})`} />
      </svg>
    </div>
  );
}

export function IuhBreadcrumb({
  items,
}: {
  items: Array<{ label: string; to?: string; active?: boolean }>;
}) {
  return (
    <nav aria-label="Điều hướng hoạt động" className="mb-4 flex flex-wrap items-center gap-1.5 text-xs">
      {items.map((item, idx) => {
        const cls = item.active
          ? 'inline-flex items-center bg-[#76a35e] px-3.5 py-1.5 font-semibold text-white'
          : 'inline-flex items-center bg-[#e9ecef] px-3.5 py-1.5 font-medium text-slate-700 hover:bg-slate-300';
        const style =
          idx === 0
            ? { clipPath: 'polygon(0 0, calc(100% - 8px) 0, 100% 50%, calc(100% - 8px) 100%, 0 100%)' }
            : {
                clipPath:
                  'polygon(0 0, calc(100% - 8px) 0, 100% 50%, calc(100% - 8px) 100%, 0 100%, 8px 50%)',
                paddingLeft: '18px',
              };
        return item.to && !item.active ? (
          <Link key={`${item.label}-${idx}`} to={item.to} className={cls} style={style}>
            <span className="truncate max-w-[260px]">{item.label}</span>
          </Link>
        ) : (
          <span key={`${item.label}-${idx}`} className={cls} style={style}>
            <span className="truncate max-w-[360px]">{item.label}</span>
          </span>
        );
      })}
    </nav>
  );
}

export function IuhCourseIndexLayout({
  classId,
  classCode,
  sections,
  currentActivityId,
  children,
}: {
  classId: string;
  classCode?: string;
  sections: CourseIndexSection[];
  currentActivityId?: string;
  children: ReactNode;
}) {
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});

  function isSectionExpanded(sec: CourseIndexSection) {
    if (expandedSections[sec.id] !== undefined) return expandedSections[sec.id];
    return true;
  }

  return (
    <div className="relative flex min-h-[calc(100vh-14rem)] w-full bg-white">
      {/* Desktop collapsible Course Index drawer matching IUH left sidebar */}
      <aside
        aria-label="Mục lục lớp học"
        className={`hidden shrink-0 border-r border-slate-200 bg-[#f8f9fa] transition-all duration-200 lg:block ${
          drawerOpen ? 'w-64' : 'w-0 overflow-hidden border-r-0'
        }`}
      >
        {drawerOpen && (
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2.5">
              <button
                type="button"
                aria-label="Thu gọn mục lục lớp học"
                onClick={() => setDrawerOpen(false)}
                className="inline-flex size-7 items-center justify-center rounded bg-[#76a35e] text-white transition hover:bg-[#658f50]"
              >
                <X size={15} strokeWidth={2.5} aria-hidden="true" />
              </button>
              <Link
                to={`/classroom/${classId}`}
                className="ml-2 flex-1 truncate text-xs font-bold text-slate-700 hover:text-[#e66f2b]"
              >
                {classCode || 'Mục lục lớp học'}
              </Link>
            </div>

            <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-1.5 text-[13px]">
              {sections.map((sec, sIdx) => {
                const open = isSectionExpanded(sec);
                return (
                  <div key={sec.id}>
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedSections((prev) => ({ ...prev, [sec.id]: !open }))
                      }
                      className="flex w-full items-start gap-1.5 rounded px-2 py-1.5 text-left font-semibold text-slate-800 hover:bg-slate-200/70"
                    >
                      {open ? (
                        <ChevronDown size={14} className="mt-0.5 shrink-0 text-slate-500" />
                      ) : (
                        <ChevronRight size={14} className="mt-0.5 shrink-0 text-slate-500" />
                      )}
                      <span className="line-clamp-2 leading-snug">
                        {/^\d+[.)]\s/.test(sec.title.trim())
                          ? sec.title
                          : `${sIdx + 1}. ${sec.title}`}
                      </span>
                    </button>
                    {open && sec.activities.length > 0 && (
                      <ul className="mt-0.5 ml-4 space-y-0.5 border-l border-slate-200 pl-2">
                        {sec.activities.map((act) => {
                          const isCurrent = act.id === currentActivityId;
                          const isDone = Boolean(act.completed);
                          return (
                            <li key={act.id}>
                              <Link
                                to={`/classroom/${classId}/activities/${act.id}`}
                                className={`flex items-center gap-2 rounded px-2 py-1 text-xs transition ${
                                  isCurrent && isDone
                                    ? 'bg-[#d9efd3] font-bold text-[#19471f] ring-1 ring-[#76a35e]'
                                    : isCurrent
                                      ? 'bg-[#e6f0e0] font-semibold text-[#2d581b]'
                                      : isDone
                                        ? 'bg-[#eef7ea] font-medium text-[#1f5c2e] hover:bg-[#e1f1da]'
                                        : 'text-slate-600 hover:bg-slate-200/60 hover:text-slate-900'
                                }`}
                                title={act.title}
                              >
                                <span
                                  aria-hidden="true"
                                  className={`grid size-3.5 shrink-0 place-items-center rounded-full ${
                                    isDone
                                      ? 'bg-[#2f7d32] text-white'
                                      : 'border border-slate-400 bg-white'
                                  }`}
                                >
                                  {isDone && <Check size={9} strokeWidth={3} />}
                                </span>
                                <span className="truncate">{act.title}</span>
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                );
              })}
            </nav>
          </div>
        )}
      </aside>

      {/* Main content area */}
      <div className="min-w-0 flex-1 bg-white">
        {/* Toggle strip when collapsed or mobile */}
        {!drawerOpen && (
          <div className="hidden lg:block px-3 pt-3">
            <button
              type="button"
              aria-label="Mở mục lục lớp học"
              onClick={() => setDrawerOpen(true)}
              className="inline-flex size-8 items-center justify-center rounded bg-[#76a35e] text-white shadow-xs transition hover:bg-[#658f50]"
            >
              <List size={16} strokeWidth={2.3} aria-hidden="true" />
            </button>
          </div>
        )}
        <div className="mx-auto w-full max-w-[1140px] px-4 py-6 sm:px-8">{children}</div>
      </div>
    </div>
  );
}

function userInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'HV';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ''}${parts[parts.length - 1][0] ?? ''}`.toUpperCase();
}

type PortalPrimaryLink = {
  to: string;
  label: string;
  active: boolean;
  mobileIcon?: typeof Home;
};

type PortalExtraLink = {
  to: string;
  label: string;
  icon: typeof Award;
};

type PortalConfig = {
  portalSubtitle: string;
  logoHomeTo: string;
  logoAriaSubtitle: string;
  roleCaption: string;
  bellTo: string;
  bellLabel: string;
  navAriaLabel: string;
  mobileDrawerTitle: string;
  moreMenuLabel: string;
  primaryLinks: PortalPrimaryLink[];
  extraLinks: PortalExtraLink[];
  footerDescription: string;
  footerCol1Title: string;
  footerCol1Links: Array<{ to: string; label: string }>;
  footerCol2Title: string;
  footerCol2Links: Array<{ to: string; label: string }>;
};

function UserAvatarCircle({
  avatarUrl,
  displayUserName,
  sizeClass = 'size-7',
  textClass = 'text-[11px]',
}: {
  avatarUrl?: string;
  displayUserName: string;
  sizeClass?: string;
  textClass?: string;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showImage = Boolean(avatarUrl && failedSrc !== avatarUrl);
  return (
    <span
      className={`grid shrink-0 place-items-center overflow-hidden rounded-full border border-white/80 bg-[#5b8546] font-bold text-white ${sizeClass} ${textClass}`}
    >
      {showImage ? (
        <img
          src={avatarUrl}
          alt={displayUserName}
          className="size-full object-cover"
          onError={() => setFailedSrc(avatarUrl ?? null)}
        />
      ) : (
        userInitials(displayUserName)
      )}
    </span>
  );
}

function IuhPortalShell({
  displayUserName,
  avatarUrl,
  onLogoutRequest,
  config,
  children,
}: {
  displayUserName: string;
  avatarUrl?: string;
  onLogoutRequest: () => void;
  config: PortalConfig;
  children: ReactNode;
}) {
  const location = useLocation();
  const inClassroom = Boolean(useMatch('/classroom/*'));
  const [mobileOpen, setMobileOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
    setMoreOpen(false);
    setUserMenuOpen(false);
  }, [location.pathname, location.search]);

  return (
    <div className="flex min-h-screen flex-col bg-white text-slate-900">
      {/* Top Green Utility Strip matching IUH LMS header */}
      <div className="bg-[#76a35e] text-white print:hidden">
        <div className="mx-auto flex h-10 max-w-[1440px] items-center justify-between gap-2 px-3 text-xs sm:px-6">
          <div className="min-w-0 truncate">
            <span className="font-medium sm:hidden">Smart English LMS</span>
            <span className="hidden font-medium sm:inline">{config.portalSubtitle}</span>
          </div>
          <div className="relative flex shrink-0 items-center gap-2 sm:gap-3">
            <Link
              to={config.bellTo}
              aria-label={config.bellLabel}
              className="rounded-full p-1 text-white/90 hover:bg-white/15 hover:text-white"
            >
              <Bell size={15} aria-hidden="true" />
            </Link>
            <div className="inline-flex shrink-0 items-center gap-1 rounded-full py-0.5 pl-0.5 pr-1 text-xs font-semibold text-white">
              <Link
                to="/profile"
                aria-label="Mở hồ sơ cá nhân"
                title="Mở trang hồ sơ cá nhân"
                className="rounded-full transition hover:ring-2 hover:ring-white/70"
              >
                <UserAvatarCircle avatarUrl={avatarUrl} displayUserName={displayUserName} />
              </Link>
              <button
                type="button"
                onClick={() => {
                  setMoreOpen(false);
                  setUserMenuOpen((v) => !v);
                }}
                aria-expanded={userMenuOpen}
                aria-label="Mở menu tài khoản"
                className="inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-xs font-semibold text-white hover:bg-white/15"
              >
                <span className="hidden max-w-[240px] truncate sm:inline">{displayUserName}</span>
                <ChevronDown size={13} aria-hidden="true" />
              </button>
            </div>
            <button
              type="button"
              onClick={onLogoutRequest}
              className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded border border-white/35 bg-white/10 px-2 py-1 text-[11px] font-semibold text-white transition hover:bg-white/20"
            >
              <LogOut size={12} aria-hidden="true" />
              <span>Đăng xuất</span>
            </button>

            {userMenuOpen && (
              <div className="absolute right-0 top-full z-50 mt-1 w-64 rounded border border-slate-200 bg-white py-1.5 text-slate-800 shadow-lg">
                <Link
                  to="/profile"
                  className="flex items-center gap-2.5 border-b border-slate-100 px-3.5 py-2.5 transition hover:bg-[#f4f9f1]"
                >
                  <UserAvatarCircle
                    avatarUrl={avatarUrl}
                    displayUserName={displayUserName}
                    sizeClass="size-9"
                    textClass="text-xs"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-bold text-slate-900">{displayUserName}</p>
                    <p className="text-[11px] text-slate-500">{config.roleCaption}</p>
                    <p className="mt-0.5 text-[11px] font-semibold text-[#4e7c38]">
                      Xem &amp; chỉnh sửa hồ sơ →
                    </p>
                  </div>
                </Link>
                {config.extraLinks.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      className="flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-[#e66f2b]"
                    >
                      <Icon size={14} aria-hidden="true" />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
                <button
                  type="button"
                  onClick={onLogoutRequest}
                  className="mt-1 flex w-full items-center gap-2 border-t border-slate-100 px-3.5 py-2 text-left text-xs font-semibold text-rose-700 hover:bg-rose-50"
                >
                  <LogOut size={14} aria-hidden="true" />
                  <span>Đăng xuất</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main White Horizontal Navbar */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white print:hidden">
        <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label="Mở menu điều hướng"
              aria-expanded={mobileOpen}
              onClick={() => setMobileOpen((v) => !v)}
              className="inline-flex size-9 items-center justify-center rounded border border-slate-200 text-slate-700 hover:bg-slate-100 md:hidden"
            >
              {mobileOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
            <Link to={config.logoHomeTo} className="flex items-center gap-2.5">
              <SmartEnglishEmblem size={34} />
              <div className="leading-tight">
                <p className="text-base font-extrabold tracking-tight text-slate-900">
                  Smart English
                </p>
                <p className="text-[11px] font-medium text-slate-500">
                  {config.logoAriaSubtitle}
                </p>
              </div>
            </Link>
          </div>

          <nav aria-label={config.navAriaLabel} className="hidden h-full items-center gap-1 md:flex">
            {config.primaryLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className={`inline-flex h-full items-center border-b-[3px] px-3 text-sm transition ${
                  link.active
                    ? 'border-[#76a35e] font-semibold text-slate-900'
                    : 'border-transparent font-medium text-slate-600 hover:text-[#e66f2b]'
                }`}
              >
                {link.label}
              </Link>
            ))}

            <div className="relative flex h-full items-center">
              <button
                type="button"
                onClick={() => {
                  setUserMenuOpen(false);
                  setMoreOpen((v) => !v);
                }}
                aria-expanded={moreOpen}
                className={`inline-flex h-full items-center gap-1 border-b-[3px] px-3 text-sm transition ${
                  config.extraLinks.some((e) => {
                    const base = e.to.split('?')[0];
                    return base === '/' ? location.pathname === '/' : location.pathname.startsWith(base);
                  })
                    ? 'border-[#76a35e] font-semibold text-slate-900'
                    : 'border-transparent font-medium text-slate-600 hover:text-[#e66f2b]'
                }`}
              >
                <span>{config.moreMenuLabel}</span>
                <ChevronDown size={14} aria-hidden="true" />
              </button>
              {moreOpen && (
                <div className="absolute right-0 top-full z-50 w-64 rounded-b border border-slate-200 bg-white py-1.5 shadow-lg">
                  {config.extraLinks.map((item) => {
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.to}
                        to={item.to}
                        className="flex items-center gap-2.5 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-[#e66f2b]"
                      >
                        <Icon size={15} className="text-slate-500" aria-hidden="true" />
                        <span>{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          </nav>
        </div>
      </header>

      {/* Mobile Drawer */}
      <MobileNavigationDrawer
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        title={config.mobileDrawerTitle}
        className="relative z-10 flex h-dvh w-76 max-w-[85vw] flex-col overflow-y-auto bg-white shadow-2xl"
      >
        <div className="flex h-14 items-center justify-between border-b border-slate-200 bg-[#76a35e] px-4 text-white">
          <span className="text-sm font-bold">Smart English LMS</span>
          <button
            type="button"
            data-drawer-close
            aria-label="Đóng menu điều hướng"
            onClick={() => setMobileOpen(false)}
            className="rounded p-1 hover:bg-white/15"
          >
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 space-y-1 p-3">
          {config.primaryLinks.map((link) => {
            const Icon = link.mobileIcon ?? GraduationCap;
            return (
              <NavLink
                key={link.to}
                to={link.to}
                className={`flex items-center gap-2.5 rounded px-3 py-2 text-sm font-semibold ${
                  link.active
                    ? 'bg-[#e9f2e4] text-[#2f5d1e]'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                <Icon size={16} />
                <span>{link.label}</span>
              </NavLink>
            );
          })}
          <div className="my-2 border-t border-slate-200 pt-2">
            {config.extraLinks.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className="flex items-center gap-2.5 rounded px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
                >
                  <Icon size={16} />
                  <span>{item.label}</span>
                </NavLink>
              );
            })}
          </div>
        </div>
      </MobileNavigationDrawer>

      {/* Main Content Body */}
      <main id="main-content" className="flex-1 bg-white">
        {inClassroom ? (
          children
        ) : (
          <div className="mx-auto w-full max-w-[1380px] px-4 py-6 sm:px-8 print:max-w-none print:p-0">
            {children}
          </div>
        )}
      </main>

      {/* Dark Charcoal Footer matching IUH LMS 3-column footer */}
      <footer className="mt-auto bg-[#333333] text-slate-200 print:hidden">
        <div className="mx-auto grid max-w-[1380px] gap-8 px-4 py-10 sm:grid-cols-3 sm:px-8">
          <div className="space-y-3">
            <Link to="/" className="inline-flex items-center gap-2.5 transition hover:opacity-90">
              <SmartEnglishEmblem size={30} />
              <span className="text-base font-bold text-white">Smart English</span>
            </Link>
            <p className="text-xs leading-relaxed text-slate-300">{config.footerDescription}</p>
          </div>

          <div>
            <h2 className="mb-3 text-base font-bold text-[#e66f2b]">{config.footerCol1Title}</h2>
            <ul className="space-y-1.5 text-xs text-slate-300">
              {config.footerCol1Links.map((lnk) => (
                <li key={lnk.to}>
                  <Link to={lnk.to} className="underline-offset-2 hover:text-white hover:underline">
                    {lnk.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h2 className="mb-3 text-base font-bold text-[#e66f2b]">{config.footerCol2Title}</h2>
            <ul className="space-y-1.5 text-xs text-slate-300">
              {config.footerCol2Links.map((lnk) => (
                <li key={lnk.to}>
                  <Link to={lnk.to} className="underline-offset-2 hover:text-white hover:underline">
                    {lnk.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="bg-[#222222] px-4 py-3 text-center text-xs text-slate-400">
          Smart English LMS · Nền tảng quản lý lớp học và luyện thi TOEIC
        </div>
      </footer>
    </div>
  );
}

export function IuhStudentShell({
  displayUserName,
  avatarUrl,
  onLogoutRequest,
  children,
}: {
  displayUserName: string;
  avatarUrl?: string;
  onLogoutRequest: () => void;
  children: ReactNode;
}) {
  const location = useLocation();
  const config: PortalConfig = {
    portalSubtitle: 'Smart English LMS · Không gian Học viên TOEIC',
    logoHomeTo: '/',
    logoAriaSubtitle: 'Hệ thống Quản lý Học tập TOEIC',
    roleCaption: 'Học viên Smart English',
    bellTo: '/my/calendar',
    bellLabel: 'Bảng điều khiển lịch học và nhắc hạn',
    navAriaLabel: 'Điều hướng chính học viên',
    mobileDrawerTitle: 'Điều hướng học viên',
    moreMenuLabel: 'Dịch vụ học viên',
    primaryLinks: [
      {
        to: '/workspace',
        label: 'Trang chủ học tập',
        active:
          location.pathname === '/workspace' ||
          location.pathname === '/workspace/' ||
          location.pathname === '/my' ||
          location.pathname === '/my/',
        mobileIcon: LayoutDashboard,
      },
      {
        to: '/student/enrollments',
        label: 'Lớp đang theo học',
        active:
          location.pathname.startsWith('/student/enrollments') ||
          location.pathname.startsWith('/classroom/'),
        mobileIcon: GraduationCap,
      },
      {
        to: '/my/calendar',
        label: 'Bảng điều khiển',
        active:
          location.pathname.startsWith('/my/calendar') ||
          location.pathname.startsWith('/my/events') ||
          location.pathname.startsWith('/calendar'),
        mobileIcon: Calendar,
      },
      {
        to: '/my/progress',
        label: 'Tiến độ & Chứng chỉ',
        active:
          location.pathname.startsWith('/my/progress') ||
          location.pathname.startsWith('/completion'),
        mobileIcon: Award,
      },
      {
        to: '/practice-tests',
        label: 'Luyện đề TOEIC',
        active: location.pathname.startsWith('/practice-tests'),
        mobileIcon: FileCheck2,
      },
    ],
    extraLinks: [
      { to: '/student/finance', label: 'Học phí & Thanh toán', icon: CreditCard },
      { to: '/student/bookings', label: 'Đặt lịch tư vấn 1:1', icon: MessageSquare },
      { to: '/student/support', label: 'Hỗ trợ học viên', icon: HelpCircle },
      { to: '/workspace/reports', label: 'Báo cáo kết quả học tập', icon: FileSpreadsheet },
      { to: '/profile', label: 'Hồ sơ cá nhân', icon: UserRound },
      { to: '/', label: 'Trang giới thiệu công khai', icon: Home },
    ],
    footerDescription:
      'Hệ thống học tập trực tuyến Smart English — hỗ trợ học viên theo dõi lớp học theo học phần, nộp bài tập, làm bài kiểm tra Quiz và kiểm tra điểm danh theo buổi học.',
    footerCol1Title: 'Liên kết học tập',
    footerCol1Links: [
      { to: '/workspace', label: 'Trang chủ học tập' },
      { to: '/student/enrollments', label: 'Lớp đang theo học' },
      { to: '/my/calendar', label: 'Bảng điều khiển' },
      { to: '/my/progress', label: 'Hoàn thành & Chứng chỉ' },
      { to: '/workspace/reports', label: 'Báo cáo kết quả học tập' },
    ],
    footerCol2Title: 'Hỗ trợ & Tài khoản',
    footerCol2Links: [
      { to: '/student/finance', label: 'Học phí & Thanh toán' },
      { to: '/student/bookings', label: 'Đặt lịch tư vấn 1:1' },
      { to: '/student/support', label: 'Hỗ trợ học viên' },
      { to: '/profile', label: 'Hồ sơ cá nhân' },
    ],
  };

  return (
    <IuhPortalShell
      displayUserName={displayUserName}
      avatarUrl={avatarUrl}
      onLogoutRequest={onLogoutRequest}
      config={config}
    >
      {children}
    </IuhPortalShell>
  );
}

export function IuhInstructorShell({
  displayUserName,
  avatarUrl,
  onLogoutRequest,
  children,
}: {
  displayUserName: string;
  avatarUrl?: string;
  onLogoutRequest: () => void;
  children: ReactNode;
}) {
  const location = useLocation();
  const config: PortalConfig = {
    portalSubtitle: 'Smart English LMS · Không gian Giảng viên TOEIC',
    logoHomeTo: '/',
    logoAriaSubtitle: 'Cổng Giảng dạy & Quản lý Lớp TOEIC',
    roleCaption: 'Giảng viên Smart English',
    bellTo: '/my/calendar',
    bellLabel: 'Bảng điều khiển lịch dạy và thông báo buổi học',
    navAriaLabel: 'Điều hướng chính giảng viên',
    mobileDrawerTitle: 'Điều hướng giảng viên',
    moreMenuLabel: 'Nghiệp vụ & Yêu cầu',
    primaryLinks: [
      {
        to: '/workspace',
        label: 'Tổng quan giảng dạy',
        active: location.pathname === '/workspace' || location.pathname === '/workspace/',
        mobileIcon: LayoutDashboard,
      },
      {
        to: '/instructor/teaching',
        label: 'Lớp được phân công',
        active:
          location.pathname.startsWith('/instructor/teaching') ||
          location.pathname.startsWith('/classroom/') ||
          location.pathname.startsWith('/instructor/classes/'),
        mobileIcon: GraduationCap,
      },
      {
        to: '/my/calendar',
        label: 'Bảng điều khiển lịch dạy',
        active:
          location.pathname === '/my' ||
          location.pathname === '/my/' ||
          location.pathname.startsWith('/my/calendar') ||
          location.pathname.startsWith('/my/events') ||
          location.pathname.startsWith('/calendar'),
        mobileIcon: Calendar,
      },
      {
        to: '/instructor/assessments-hub',
        label: 'Ngân hàng câu hỏi',
        active:
          location.pathname.startsWith('/instructor/assessments-hub') ||
          location.pathname.includes('/question-bank') ||
          location.pathname.endsWith('/tests') ||
          location.pathname.startsWith('/instructor/tests/'),
        mobileIcon: HelpCircle,
      },
      {
        to: '/consultations',
        label: 'Tư vấn 1:1',
        active: location.pathname.startsWith('/consultations'),
        mobileIcon: MessageSquare,
      },
    ],
    extraLinks: [
      { to: '/instructor/requests', label: 'Duyệt Meet & Đổi lịch / Nghỉ dạy', icon: Video },
      { to: '/workspace/placement', label: 'Đề thi & Chấm đầu vào', icon: FileCheck2 },
      { to: '/workspace/support#referrals', label: 'Phiếu chuyển chuyên môn CSKH', icon: MessageSquare },
      { to: '/workspace/inspection', label: 'Giờ giảng & Xác nhận ca', icon: UserCheck },
      { to: '/workspace/reports', label: 'Báo cáo giảng dạy', icon: FileSpreadsheet },
      { to: '/profile', label: 'Hồ sơ cá nhân', icon: UserRound },
      { to: '/', label: 'Trang giới thiệu công khai', icon: Home },
    ],
    footerDescription:
      'Hệ thống quản lý giảng dạy Smart English — giúp giảng viên tổ chức học phần và hoạt động từng lớp, chấm bài tập & kiểm tra, quản lý điểm danh, ngân hàng câu hỏi, tư vấn 1:1 và đề xuất lịch giảng dạy.',
    footerCol1Title: 'Giảng dạy & Lớp học',
    footerCol1Links: [
      { to: '/workspace', label: 'Tổng quan giảng dạy' },
      { to: '/instructor/teaching', label: 'Lớp được phân công' },
      { to: '/instructor/assessments-hub', label: 'Ngân hàng câu hỏi' },
      { to: '/my/calendar', label: 'Bảng điều khiển lịch dạy' },
      { to: '/consultations', label: 'Lịch nhận tư vấn 1:1' },
    ],
    footerCol2Title: 'Nghiệp vụ học vụ',
    footerCol2Links: [
      { to: '/instructor/requests', label: 'Đề nghị duyệt Google Meet' },
      { to: '/instructor/requests?tab=schedule', label: 'Đề nghị nghỉ dạy, đổi lịch, dạy bù' },
      { to: '/workspace/placement', label: 'Chấm bài & Đánh giá đầu vào' },
      { to: '/workspace/inspection', label: 'Giờ giảng & Xác nhận ca' },
    ],
  };

  return (
    <IuhPortalShell
      displayUserName={displayUserName}
      avatarUrl={avatarUrl}
      onLogoutRequest={onLogoutRequest}
      config={config}
    >
      {children}
    </IuhPortalShell>
  );
}

export function IuhAcademicShell({
  displayUserName,
  avatarUrl,
  onLogoutRequest,
  children,
}: {
  displayUserName: string;
  avatarUrl?: string;
  onLogoutRequest: () => void;
  children: ReactNode;
}) {
  const location = useLocation();
  const auth = useContext(AuthContext);
  const track = auth?.user?.academicTrack ?? null;
  const canViewAdmissions = Boolean(auth?.user?.email?.endsWith('@example.invalid'));

  const overviewLink = {
    to: '/workspace',
    label: 'Tổng quan',
    active: location.pathname === '/workspace' || location.pathname === '/workspace/',
    mobileIcon: LayoutDashboard,
  };
  const calendarLink = {
    to: '/calendar',
    label: 'Lịch trung tâm',
    active: location.pathname.startsWith('/calendar') || location.pathname.startsWith('/my'),
    mobileIcon: Calendar,
  };

  const trainingPrimaryLinks = [
    overviewLink,
    {
      to: '/academic',
      label: 'Chương trình & Lớp',
      active:
        location.pathname === '/academic' ||
        location.pathname.startsWith('/academic/programs') ||
        location.pathname.startsWith('/academic/classes'),
      mobileIcon: GraduationCap,
    },
    {
      to: '/academic/planning',
      label: 'TKB & Phòng học',
      active: location.pathname.startsWith('/academic/planning'),
      mobileIcon: Building2,
    },
    {
      to: '/academic/approvals',
      label: 'Phê duyệt',
      active:
        location.pathname.startsWith('/academic/approvals') ||
        location.pathname.startsWith('/academic/session-engagement'),
      mobileIcon: CheckSquare,
    },
    calendarLink,
  ];

  const studentAffairsPrimaryLinks = [
    overviewLink,
    {
      to: '/workspace/placement',
      label: 'Kiểm tra đầu vào',
      active: location.pathname.startsWith('/workspace/placement'),
      mobileIcon: UserCheck,
    },
    {
      to: '/workspace/certificates',
      label: 'Chứng chỉ & Hoàn thành',
      active: location.pathname.startsWith('/workspace/certificates'),
      mobileIcon: Award,
    },
    {
      to: '/knowledge/workspace',
      label: 'Thư viện kiến thức TOEIC',
      active: location.pathname.startsWith('/knowledge'),
      mobileIcon: Library,
    },
    calendarLink,
  ];

  const trainingExtraLinks = [
    { to: '/academic/session-engagement', label: 'Duyệt Meet, Đổi lịch & Điểm danh', icon: Video },
    { to: '/workspace/inspection', label: 'Ca thanh tra & Giờ giảng', icon: ClipboardCheck },
    { to: '/consultations', label: 'Duyệt tư vấn 1:1', icon: MessageSquare },
    { to: '/workspace/reports', label: 'Báo cáo đào tạo', icon: FileSpreadsheet },
    { to: '/my/', label: 'Lịch tháng trung tâm', icon: Calendar },
  ];

  const studentAffairsExtraLinks = [
    { to: '/workspace/support#referrals', label: 'Phiếu chuyển chuyên môn CSKH', icon: MessageSquare },
    { to: '/workspace/reports', label: 'Báo cáo học vụ học viên', icon: FileSpreadsheet },
    { to: '/my/', label: 'Lịch tháng trung tâm', icon: Calendar },
    ...(canViewAdmissions
      ? [{ to: '/workspace/admissions', label: 'Xét duyệt hồ sơ nhập học', icon: ShieldCheck }]
      : []),
  ];

  const config: PortalConfig =
    track === 'TRAINING'
      ? {
          portalSubtitle: 'Smart English LMS · Không gian Quản lý Đào tạo TOEIC',
          logoHomeTo: '/',
          logoAriaSubtitle: 'Hệ thống Quản lý Đào tạo',
          roleCaption: 'Quản lý Đào tạo Smart English',
          bellTo: '/academic/approvals',
          bellLabel: 'Hàng đợi phê duyệt đào tạo',
          navAriaLabel: 'Điều hướng chính quản lý đào tạo',
          mobileDrawerTitle: 'Điều hướng Quản lý Đào tạo',
          moreMenuLabel: 'Điều phối & Thanh tra',
          primaryLinks: trainingPrimaryLinks,
          extraLinks: trainingExtraLinks,
          footerDescription:
            'Hệ thống Quản lý Đào tạo Smart English — điều phối chương trình, thời khóa biểu, phòng học, phân công giảng viên, thanh tra ca dạy, duyệt Google Meet và đổi lịch/dạy bù.',
          footerCol1Title: 'Điều phối đào tạo',
          footerCol1Links: [
            { to: '/workspace', label: 'Tổng quan & Chờ xử lý' },
            { to: '/academic', label: 'Chương trình & Lớp học' },
            { to: '/academic/planning', label: 'Thời khóa biểu & Phòng học' },
            { to: '/calendar', label: 'Lịch toàn trung tâm' },
            { to: '/workspace/reports', label: 'Báo cáo đào tạo' },
          ],
          footerCol2Title: 'Phê duyệt & Giờ giảng',
          footerCol2Links: [
            { to: '/academic/approvals', label: 'Duyệt học vụ & Phân công GV' },
            { to: '/academic/session-engagement', label: 'Duyệt Meet & Nghỉ/Đổi lịch' },
            { to: '/workspace/inspection', label: 'Điều phối thanh tra giảng dạy' },
            { to: '/consultations', label: 'Điều phối tư vấn 1:1' },
          ],
        }
      : track === 'STUDENT_AFFAIRS'
        ? {
            portalSubtitle: 'Smart English LMS · Không gian Quản lý Học vụ Học viên',
            logoHomeTo: '/',
            logoAriaSubtitle: 'Hệ thống Quản lý Học vụ Học viên',
            roleCaption: 'Quản lý Học vụ Học viên Smart English',
            bellTo: '/workspace/certificates',
            bellLabel: 'Hàng đợi chứng chỉ và đầu vào',
            navAriaLabel: 'Điều hướng chính quản lý học vụ học viên',
            mobileDrawerTitle: 'Điều hướng Học vụ Học viên',
            moreMenuLabel: 'Hỗ trợ & Hồ sơ',
            primaryLinks: studentAffairsPrimaryLinks,
            extraLinks: studentAffairsExtraLinks,
            footerDescription:
              'Hệ thống Quản lý Học vụ Học viên Smart English — điều phối kiểm tra đầu vào TOEIC, điều kiện hoàn thành, cấp chứng chỉ, thư viện kiến thức và hỗ trợ học viên.',
            footerCol1Title: 'Nghiệp vụ học viên',
            footerCol1Links: [
              { to: '/workspace', label: 'Tổng quan học vụ học viên' },
              { to: '/workspace/placement', label: 'Kiểm tra đầu vào TOEIC' },
              { to: '/workspace/certificates', label: 'Chứng chỉ & Điều kiện hoàn thành' },
              { to: '/knowledge/workspace', label: 'Thư viện kiến thức TOEIC' },
              { to: '/workspace/reports', label: 'Báo cáo học vụ học viên' },
            ],
            footerCol2Title: 'Hỗ trợ & Lịch trung tâm',
            footerCol2Links: [
              { to: '/workspace/support#referrals', label: 'Phiếu chuyển chuyên môn CSKH' },
              { to: '/calendar', label: 'Lịch toàn trung tâm' },
              { to: '/my/', label: 'Lịch tháng trung tâm' },
              ...(canViewAdmissions
                ? [{ to: '/workspace/admissions', label: 'Xét duyệt hồ sơ nhập học' }]
                : []),
            ],
          }
        : {
            portalSubtitle: 'Smart English LMS · Không gian Quản lý Học vụ TOEIC',
            logoHomeTo: '/',
            logoAriaSubtitle: 'Hệ thống Quản trị Đào tạo & Học vụ',
            roleCaption: 'Quản lý học vụ Smart English',
            bellTo: '/academic/approvals',
            bellLabel: 'Hàng đợi phê duyệt học vụ',
            navAriaLabel: 'Điều hướng chính quản lý học vụ',
            mobileDrawerTitle: 'Điều hướng học vụ',
            moreMenuLabel: 'Nghiệp vụ & Kiểm tra',
            primaryLinks: trainingPrimaryLinks,
            extraLinks: [
              { to: '/academic/session-engagement', label: 'Duyệt Meet, Đổi lịch & Điểm danh', icon: Video },
              { to: '/workspace/inspection', label: 'Ca thanh tra & Giờ giảng', icon: ClipboardCheck },
              { to: '/consultations', label: 'Duyệt tư vấn 1:1', icon: MessageSquare },
              { to: '/workspace/certificates', label: 'Chứng chỉ & Hoàn thành', icon: Award },
              { to: '/workspace/placement', label: 'Kiểm tra đầu vào', icon: UserCheck },
              { to: '/knowledge/workspace', label: 'Thư viện kiến thức TOEIC', icon: Library },
              { to: '/workspace/support#referrals', label: 'Phiếu chuyển chuyên môn CSKH', icon: MessageSquare },
              { to: '/workspace/reports', label: 'Báo cáo đào tạo & học vụ', icon: FileSpreadsheet },
              { to: '/my/', label: 'Lịch tháng trung tâm', icon: Calendar },
              ...(canViewAdmissions
                ? [{ to: '/workspace/admissions', label: 'Xét duyệt hồ sơ nhập học', icon: ShieldCheck }]
                : []),
            ],
            footerDescription:
              'Hệ thống quản lý học vụ Smart English — điều phối thời khóa biểu, phòng học, phân công giảng viên, thanh tra ca dạy, duyệt Google Meet, đổi lịch/dạy bù, chứng chỉ và kiểm tra đầu vào.',
            footerCol1Title: 'Điều phối đào tạo',
            footerCol1Links: [
              { to: '/workspace', label: 'Tổng quan & Chờ xử lý' },
              { to: '/academic', label: 'Chương trình & Lớp học' },
              { to: '/academic/planning', label: 'Thời khóa biểu & Phòng học' },
              { to: '/calendar', label: 'Lịch toàn trung tâm' },
              { to: '/workspace/reports', label: 'Báo cáo đào tạo & học vụ' },
            ],
            footerCol2Title: 'Phê duyệt & Giám sát',
            footerCol2Links: [
              { to: '/academic/approvals', label: 'Duyệt học vụ & Phân công GV' },
              { to: '/academic/session-engagement', label: 'Duyệt Meet & Nghỉ/Đổi lịch' },
              { to: '/workspace/inspection', label: 'Điều phối thanh tra giảng dạy' },
              { to: '/workspace/certificates', label: 'Chứng chỉ & Điều kiện hoàn thành' },
              { to: '/consultations', label: 'Điều phối tư vấn 1:1' },
              { to: '/knowledge/workspace', label: 'Thư viện kiến thức TOEIC' },
              { to: '/workspace/support#referrals', label: 'Phiếu chuyển chuyên môn CSKH' },
            ],
          };

  return (
    <IuhPortalShell
      displayUserName={displayUserName}
      avatarUrl={avatarUrl}
      onLogoutRequest={onLogoutRequest}
      config={config}
    >
      {children}
    </IuhPortalShell>
  );
}

export function IuhCounselorShell({
  displayUserName,
  avatarUrl,
  onLogoutRequest,
  children,
}: {
  displayUserName: string;
  avatarUrl?: string;
  onLogoutRequest: () => void;
  children: ReactNode;
}) {
  const location = useLocation();
  const config: PortalConfig = {
    portalSubtitle: 'Smart English LMS · Không gian Nhân viên Tư vấn & Hỗ trợ học viên',
    logoHomeTo: '/',
    logoAriaSubtitle: 'Hệ thống Tiếp nhận & Xử lý Phiếu Hỗ trợ Học viên',
    roleCaption: 'Nhân viên tư vấn Smart English',
    bellTo: '/workspace/support',
    bellLabel: 'Hàng đợi phiếu hỗ trợ chờ tiếp nhận',
    navAriaLabel: 'Điều hướng chính nhân viên tư vấn',
    mobileDrawerTitle: 'Điều hướng tư vấn',
    moreMenuLabel: 'Tài khoản',
    primaryLinks: [
      {
        to: '/workspace',
        label: 'Tổng quan tư vấn',
        active: location.pathname === '/workspace' || location.pathname === '/workspace/',
        mobileIcon: LayoutDashboard,
      },
      {
        to: '/workspace/support',
        label: 'Hàng đợi phiếu hỗ trợ',
        active: location.pathname.startsWith('/workspace/support'),
        mobileIcon: MessageSquare,
      },
      {
        to: '/workspace/reports',
        label: 'Báo cáo CSKH & tư vấn',
        active: location.pathname.startsWith('/workspace/reports'),
        mobileIcon: FileSpreadsheet,
      },
    ],
    extraLinks: [{ to: '/profile', label: 'Hồ sơ cá nhân', icon: UserRound }],
    footerDescription:
      'Không gian Nhân viên Tư vấn Smart English — tiếp nhận phiếu hỗ trợ học viên, phản hồi giải đáp, phối hợp chuyên môn và chuyển sự cố kỹ thuật cho bộ phận quản trị hệ thống.',
    footerCol1Title: 'Hỗ trợ & Tư vấn',
    footerCol1Links: [
      { to: '/workspace', label: 'Tổng quan tư vấn' },
      { to: '/workspace/support', label: 'Hàng đợi phiếu hỗ trợ' },
      { to: '/workspace/reports', label: 'Báo cáo CSKH & tư vấn' },
    ],
    footerCol2Title: 'Tài khoản',
    footerCol2Links: [{ to: '/profile', label: 'Hồ sơ cá nhân' }],
  };

  return (
    <IuhPortalShell
      displayUserName={displayUserName}
      avatarUrl={avatarUrl}
      onLogoutRequest={onLogoutRequest}
      config={config}
    >
      {children}
    </IuhPortalShell>
  );
}

export function IuhCashierShell({
  displayUserName,
  avatarUrl,
  onLogoutRequest,
  children,
}: {
  displayUserName: string;
  avatarUrl?: string;
  onLogoutRequest: () => void;
  children: ReactNode;
}) {
  const location = useLocation();
  const isAdmissionsRoute =
    location.pathname.startsWith('/workspace/admissions') ||
    location.pathname.startsWith('/admissions/');

  const config: PortalConfig = {
    portalSubtitle: 'Smart English LMS · Không gian Thu ngân & Đối soát học phí',
    logoHomeTo: '/',
    logoAriaSubtitle: 'Hệ thống Quản lý Khoản phải thu, Phiếu thu & Đối soát SePay',
    roleCaption: 'Thu ngân Smart English',
    bellTo: '/payments/sepay',
    bellLabel: 'Giao dịch & trường hợp cần đối soát',
    navAriaLabel: 'Điều hướng chính thu ngân',
    mobileDrawerTitle: 'Điều hướng thu ngân',
    moreMenuLabel: 'Xử lý & Báo cáo',
    primaryLinks: [
      {
        to: '/workspace',
        label: 'Tổng quan thu ngân',
        active: location.pathname === '/workspace' || location.pathname === '/workspace/',
        mobileIcon: LayoutDashboard,
      },
      {
        to: '/workspace/admissions',
        label: 'Khoản phải thu & Công nợ',
        active:
          isAdmissionsRoute &&
          location.hash !== '#receipts' &&
          location.hash !== '#cases',
        mobileIcon: ClipboardCheck,
      },
      {
        to: '/workspace/admissions#receipts',
        label: 'Phiếu thu & Chứng từ',
        active: isAdmissionsRoute && location.hash === '#receipts',
        mobileIcon: FileCheck2,
      },
      {
        to: '/payments/sepay',
        label: 'Đối soát SePay',
        active: location.pathname.startsWith('/payments/sepay'),
        mobileIcon: CreditCard,
      },
    ],
    extraLinks: [
      {
        to: '/workspace/admissions#cases',
        label: 'Trường hợp cần xử lý',
        icon: ShieldCheck,
      },
      {
        to: '/workspace/support#referrals',
        label: 'Phiếu chuyển chuyên môn CSKH',
        icon: MessageSquare,
      },
      {
        to: '/workspace/reports',
        label: 'Báo cáo tài chính & thu chi',
        icon: FileSpreadsheet,
      },
      { to: '/profile', label: 'Hồ sơ cá nhân', icon: UserRound },
    ],
    footerDescription:
      'Không gian Thu ngân Smart English — theo dõi khoản phải thu, công nợ học viên, xác minh chứng từ biên nhận và đối soát giao dịch SePay theo đúng quyền hạn và dấu vết kiểm toán.',
    footerCol1Title: 'Nghiệp vụ Thu ngân',
    footerCol1Links: [
      { to: '/workspace', label: 'Tổng quan thu ngân' },
      { to: '/workspace/admissions', label: 'Khoản phải thu & Công nợ học viên' },
      { to: '/workspace/admissions#receipts', label: 'Phiếu thu & Chứng từ đã ghi nhận' },
      { to: '/workspace/admissions#cases', label: 'Trường hợp cần xử lý & Điều chỉnh' },
    ],
    footerCol2Title: 'Đối soát & Báo cáo',
    footerCol2Links: [
      { to: '/payments/sepay', label: 'Đối soát & xác nhận giao dịch SePay' },
      { to: '/workspace/support#referrals', label: 'Phiếu chuyển chuyên môn CSKH' },
      { to: '/workspace/reports', label: 'Báo cáo tài chính & thu chi' },
      { to: '/profile', label: 'Hồ sơ cá nhân' },
    ],
  };

  return (
    <IuhPortalShell
      displayUserName={displayUserName}
      avatarUrl={avatarUrl}
      onLogoutRequest={onLogoutRequest}
      config={config}
    >
      {children}
    </IuhPortalShell>
  );
}

export function IuhInspectorShell({
  displayUserName,
  avatarUrl,
  onLogoutRequest,
  children,
}: {
  displayUserName: string;
  avatarUrl?: string;
  onLogoutRequest: () => void;
  children: ReactNode;
}) {
  const location = useLocation();
  const isInspection = location.pathname.startsWith('/workspace/inspection');
  const isCalendar = location.pathname.startsWith('/calendar');
  const isReports = location.pathname.startsWith('/workspace/reports');

  const config: PortalConfig = {
    portalSubtitle: 'Smart English LMS · Thanh tra Đào tạo',
    logoHomeTo: '/',
    logoAriaSubtitle: 'Cổng Thanh tra Giảng dạy, Giám sát Ca dạy & Đối chiếu Giờ',
    roleCaption: 'Thanh tra đào tạo Smart English',
    bellTo: '/workspace/inspection#notifications',
    bellLabel: 'Thông báo thay đổi lịch thanh tra',
    navAriaLabel: 'Điều hướng chính thanh tra đào tạo',
    mobileDrawerTitle: 'Điều hướng thanh tra',
    moreMenuLabel: 'Mở rộng',
    primaryLinks: [
      {
        to: '/workspace',
        label: 'Tổng quan thanh tra',
        active: location.pathname === '/workspace' || location.pathname === '/workspace/',
        mobileIcon: LayoutDashboard,
      },
      {
        to: '/workspace/inspection',
        label: 'Ca trực & Chấm công',
        active: isInspection,
        mobileIcon: ShieldCheck,
      },
      {
        to: '/calendar',
        label: 'Lịch trung tâm',
        active: isCalendar,
        mobileIcon: Calendar,
      },
      {
        to: '/workspace/reports',
        label: 'Báo cáo thanh tra',
        active: isReports,
        mobileIcon: FileSpreadsheet,
      },
    ],
    extraLinks: [
      { to: '/profile', label: 'Hồ sơ cá nhân', icon: UserRound },
      { to: '/', label: 'Trang giới thiệu công khai', icon: Home },
    ],
    footerDescription:
      'Không gian Thanh tra Đào tạo Smart English — tiếp nhận ca giám sát buổi học trực tuyến, lập biên bản hiện diện giảng viên, chấm công vào/ra ca và đối chiếu giờ dạy cùng Học vụ.',
    footerCol1Title: 'Nghiệp vụ Thanh tra',
    footerCol1Links: [
      { to: '/workspace', label: 'Tổng quan thanh tra' },
      { to: '/workspace/inspection', label: 'Ca trực & Chấm công' },
    ],
    footerCol2Title: 'Lịch & Báo cáo',
    footerCol2Links: [
      { to: '/calendar', label: 'Lịch học & Giảng dạy trung tâm' },
      { to: '/workspace/reports', label: 'Báo cáo thanh tra đa kỳ' },
      { to: '/profile', label: 'Hồ sơ cá nhân' },
    ],
  };

  return (
    <IuhPortalShell
      displayUserName={displayUserName}
      avatarUrl={avatarUrl}
      onLogoutRequest={onLogoutRequest}
      config={config}
    >
      {children}
    </IuhPortalShell>
  );
}

export function IuhAdminShell({
  displayUserName,
  avatarUrl,
  onLogoutRequest,
  children,
}: {
  displayUserName: string;
  avatarUrl?: string;
  onLogoutRequest: () => void;
  children: ReactNode;
}) {
  const location = useLocation();
  const isAuthorityRoute = location.pathname.startsWith('/workspace/authority');
  const isOperationsRoute = location.pathname.startsWith('/workspace/operations');
  const isReportsRoute = location.pathname.startsWith('/workspace/reports');

  const config: PortalConfig = {
    portalSubtitle: 'Smart English LMS · Không gian Quản trị Hệ thống',
    logoHomeTo: '/',
    logoAriaSubtitle: 'Hệ thống Quản trị Tài khoản, Phân quyền & Giám sát Vận hành',
    roleCaption: 'Quản trị hệ thống Smart English',
    bellTo: '/workspace/operations?tab=escalations',
    bellLabel: 'Sự cố kỹ thuật & tình trạng vận hành hệ thống',
    navAriaLabel: 'Điều hướng chính quản trị hệ thống',
    mobileDrawerTitle: 'Điều hướng quản trị',
    moreMenuLabel: 'Mở rộng',
    primaryLinks: [
      {
        to: '/workspace',
        label: 'Tổng quan quản trị',
        active: location.pathname === '/workspace' || location.pathname === '/workspace/',
        mobileIcon: LayoutDashboard,
      },
      {
        to: '/workspace/authority',
        label: 'Tài khoản & Phân quyền',
        active: isAuthorityRoute,
        mobileIcon: Users,
      },
      {
        to: '/workspace/operations',
        label: 'Nhật ký, Sự cố & Tình trạng',
        active: isOperationsRoute,
        mobileIcon: Activity,
      },
      {
        to: '/workspace/reports',
        label: 'Báo cáo hệ thống',
        active: isReportsRoute,
        mobileIcon: FileSpreadsheet,
      },
    ],
    extraLinks: [
      { to: '/profile', label: 'Hồ sơ cá nhân', icon: UserRound },
      { to: '/', label: 'Trang giới thiệu công khai', icon: Home },
    ],
    footerDescription:
      'Không gian Quản trị Hệ thống Smart English — quản lý danh bạ tài khoản, phân quyền RBAC theo cơ chế phê duyệt độc lập, và theo dõi nhật ký hoạt động cùng tình trạng vận hành các dịch vụ thực tế.',
    footerCol1Title: 'Nghiệp vụ Quản trị',
    footerCol1Links: [
      { to: '/workspace', label: 'Tổng quan quản trị hệ thống' },
      { to: '/workspace/authority', label: 'Tài khoản & Phân quyền' },
      { to: '/workspace/authority?tab=rbac', label: 'Hàng đợi duyệt vai trò & quyền' },
    ],
    footerCol2Title: 'Giám sát & Báo cáo',
    footerCol2Links: [
      { to: '/workspace/operations', label: 'Nhật ký & Tình trạng dịch vụ' },
      { to: '/workspace/operations?tab=escalations', label: 'Hàng đợi sự cố kỹ thuật' },
      { to: '/workspace/operations?tab=config', label: 'Cấu hình tích hợp (che bí mật)' },
      { to: '/workspace/reports', label: 'Báo cáo hệ thống & kiểm toán' },
      { to: '/profile', label: 'Hồ sơ cá nhân' },
    ],
  };

  return (
    <IuhPortalShell
      displayUserName={displayUserName}
      avatarUrl={avatarUrl}
      onLogoutRequest={onLogoutRequest}
      config={config}
    >
      {children}
    </IuhPortalShell>
  );
}

export { ChevronLeft };
