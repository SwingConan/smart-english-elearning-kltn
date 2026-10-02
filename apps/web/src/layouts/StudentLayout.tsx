import { BookOpenCheck } from 'lucide-react';
import { Link, Outlet } from 'react-router';
import { AuthNavigation } from '@/features/auth/AuthNavigation';

export function StudentLayout() {
  return (
    <div className="min-h-screen bg-slate-100 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <Link className="flex items-center gap-3 font-bold" to="/">
            <span className="grid size-10 place-items-center rounded-xl bg-indigo-600 text-white">
              <BookOpenCheck aria-hidden="true" size={22} />
            </span>
            <span>
              Smart English
              <span className="block text-xs font-medium text-slate-500">Không gian học tập</span>
            </span>
          </Link>
          <div className="flex flex-wrap items-center justify-end gap-4 text-sm">
            <Link className="font-medium text-slate-600 hover:text-indigo-700" to="/">
              Trang chủ
            </Link>
            <AuthNavigation />
          </div>
        </div>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}
