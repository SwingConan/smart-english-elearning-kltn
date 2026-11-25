import { ChevronDown, Menu, X } from 'lucide-react';
import { Link, NavLink, Outlet } from 'react-router';
import { SmartEnglishEmblem } from '@/features/class-lms/IuhLmsShell';
import { AuthNavigation } from '@/features/auth/AuthNavigation';
import { MobileNavigationDrawer } from '@/components/ui/MobileNavigationDrawer';
import { useMobileNavigation } from '@/components/ui/use-mobile-navigation';
import { HeaderDropdown } from '@/components/ui/HeaderDropdown';

const publicLinks = [
  ['/', 'Trang chủ'],
  ['/catalog', 'Khóa học'],
  ['/placement', 'Kiểm tra đầu vào'],
  ['/practice-tests', 'Luyện đề TOEIC'],
  ['/guide', 'Hướng dẫn học'],
  ['/news-events', 'Tin tức & Sự kiện'],
  ['/about', 'Về chúng tôi'],
] as const;

export function PublicLayout() {
  const mobile = useMobileNavigation();
  const open = mobile.open;
  return (
    <div className="flex min-h-screen flex-1 flex-col bg-slate-50 text-slate-950">
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-20 max-w-7xl flex-nowrap items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <Link className="flex shrink-0 items-center gap-3 whitespace-nowrap font-bold text-slate-950" to="/">
            <SmartEnglishEmblem size={40} />
            <span className="leading-tight">
              Smart English
              <span className="block text-xs font-medium text-slate-500">
                Trung tâm Luyện thi TOEIC
              </span>
            </span>
          </Link>
          <nav
            aria-label="Điều hướng chính"
            className="hidden shrink-0 items-center gap-3 whitespace-nowrap text-sm font-medium lg:flex xl:gap-4"
          >
            {publicLinks.map(([to, label], index) => (
              <NavLink
                className={({ isActive }) =>
                  `${index > 3 ? 'hidden xl:block ' : ''}${isActive && !to.includes('#')
                    ? 'relative py-2 text-[#4d7439] after:absolute after:inset-x-0 after:-bottom-2 after:h-0.5 after:rounded-full after:bg-[#76a35e]'
                    : 'py-2 text-slate-600 transition hover:text-[#4d7439]'}`
                }
                key={to}
                to={to}
              >
                {label}
              </NavLink>
            ))}
            <HeaderDropdown className="xl:hidden" label={<>Thêm <ChevronDown aria-hidden="true" size={14} /></>}>
              {publicLinks.slice(4).map(([to, label]) => (
                <NavLink key={to} to={to} className={({ isActive }) => `rounded-lg px-3 py-2 ${isActive ? 'bg-[#f4f8f1] text-[#3f642c]' : 'text-slate-600 hover:bg-slate-50'}`}>
                  {label}
                </NavLink>
              ))}
            </HeaderDropdown>
          </nav>
          <div className="hidden shrink-0 text-sm lg:block">
            <AuthNavigation surface="public" />
          </div>
          <button
            aria-expanded={open}
            aria-label={open ? 'Đóng menu' : 'Mở menu'}
            className="shrink-0 rounded-lg border p-2 lg:hidden"
            onClick={mobile.openMenu}
            type="button"
          >
            {open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
          </button>
        </div>
        <MobileNavigationDrawer
          open={open}
          onClose={mobile.closeMenu}
          title="Điều hướng di động"
          className="relative z-10 mt-20 max-h-[calc(100dvh-5rem)] w-full self-start overflow-y-auto overscroll-contain border-t bg-white px-4 py-4"
        >
          <div className="mx-auto mb-2 flex max-w-7xl justify-end">
            <button
              type="button"
              data-drawer-close
              aria-label="Đóng menu"
              onClick={mobile.closeMenu}
              className="rounded-lg border p-2"
            >
              <X aria-hidden="true" />
            </button>
          </div>
          <nav aria-label="Điều hướng di động" className="mx-auto flex max-w-7xl flex-col gap-1">
            {publicLinks.map(([to, label]) => (
              <NavLink
                className={({ isActive }) =>
                  `rounded-lg px-3 py-2 font-medium transition ${isActive ? 'bg-[#f4f8f1] text-[#3f642c]' : 'hover:bg-slate-50'}`
                }
                key={to}
                to={to}
              >
                {label}
              </NavLink>
            ))}
            <div className="mt-3 border-t pt-3 text-sm">
              <AuthNavigation surface="public" layout="stacked" />
            </div>
          </nav>
        </MobileNavigationDrawer>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
      <footer className="mt-auto bg-[#333333] text-slate-300">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-3 lg:px-8">
          <div>
            <Link to="/" className="inline-flex items-center gap-2.5 transition hover:opacity-90">
              <SmartEnglishEmblem size={28} />
              <h2 className="font-semibold text-white">Smart English E-Learning</h2>
            </Link>
            <p className="mt-3 max-w-sm text-sm leading-6">
              Nền tảng học và luyện thi TOEIC trực tuyến, kết hợp lớp học cùng giảng viên, bài tập thực hành 4 kỹ năng và theo dõi tiến độ học tập.
            </p>
          </div>
          <div>
            <h2 className="font-semibold text-white">Chương trình học</h2>
            <div className="mt-3 flex flex-col gap-2 text-sm">
              <Link to="/catalog" className="hover:text-white transition">Khóa học TOEIC</Link>
              <Link to="/placement" className="hover:text-white transition">Kiểm tra trình độ đầu vào</Link>
              <Link to="/practice-tests" className="hover:text-white transition">Luyện đề TOEIC chuẩn ETS</Link>
              <Link to="/guide" className="hover:text-white transition">Phương pháp & Hướng dẫn học</Link>
              <Link to="/news-events" className="hover:text-white transition">Tin tức & Sự kiện</Link>
            </div>
          </div>
          <div>
            <h2 className="font-semibold text-white">Hỗ trợ & Liên hệ</h2>
            <div className="mt-3 flex flex-col gap-2 text-sm">
              <Link to="/about" className="hover:text-white transition">Giới thiệu trung tâm</Link>
              <Link to="/contact" className="hover:text-white transition">Liên hệ tư vấn khóa học</Link>
              <Link to="/status" className="hover:text-white transition">Trạng thái hệ thống</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
