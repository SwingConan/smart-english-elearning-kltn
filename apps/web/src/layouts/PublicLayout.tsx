import { useEffect, useState } from 'react';
import { BookOpenCheck, Menu, X } from 'lucide-react';
import { Link, NavLink, Outlet } from 'react-router';
import { AuthNavigation } from '@/features/auth/AuthNavigation';

const publicLinks = [
  ['/', 'Trang chủ'],
  ['/catalog', 'Khóa học'],
  ['/placement', 'Kiểm tra đầu vào'],
  ['/guide', 'Hướng dẫn học'],
  ['/news-events', 'Tin tức & Sự kiện'],
  ['/about', 'Về chúng tôi'],
] as const;

export function PublicLayout() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [open]);
  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-5 px-4 py-4 sm:px-6 lg:px-8">
          <Link className="flex items-center gap-3 font-bold text-slate-950" to="/">
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
          <nav
            aria-label="Điều hướng chính"
            className="hidden items-center gap-5 text-sm font-medium lg:flex"
          >
            {publicLinks.map(([to, label]) => (
              <NavLink
                className={({ isActive }) =>
                  isActive && !to.includes('#')
                    ? 'relative py-2 text-indigo-700 after:absolute after:inset-x-0 after:-bottom-2 after:h-0.5 after:rounded-full after:bg-indigo-600'
                    : 'py-2 text-slate-600 transition hover:text-indigo-700'
                }
                key={to}
                to={to}
              >
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="hidden text-sm lg:block">
            <AuthNavigation />
          </div>
          <button
            aria-expanded={open}
            aria-label={open ? 'Đóng menu' : 'Mở menu'}
            className="rounded-lg border p-2 lg:hidden"
            onClick={() => setOpen((value) => !value)}
            type="button"
          >
            {open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
          </button>
        </div>
        {open ? (
          <div className="border-t bg-white px-4 py-4 lg:hidden">
            <nav aria-label="Điều hướng di động" className="mx-auto flex max-w-7xl flex-col gap-1">
              {publicLinks.map(([to, label]) => (
                <NavLink
                  className={({ isActive }) =>
                    `rounded-lg px-3 py-2 font-medium transition ${isActive ? 'bg-indigo-50 text-indigo-700' : 'hover:bg-slate-50'}`
                  }
                  key={to}
                  onClick={() => setOpen(false)}
                  to={to}
                >
                  {label}
                </NavLink>
              ))}
              <div className="mt-3 border-t pt-3 text-sm">
                <AuthNavigation />
              </div>
            </nav>
          </div>
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
              <Link to="/contact">Liên hệ</Link>
              <span>Kênh liên hệ của nhóm dự án sẽ được cập nhật.</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
