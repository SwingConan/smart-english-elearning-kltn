import { useCallback, useMemo, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router';
import { AlertTriangle, CheckCircle2, Clock3, Menu, ShieldCheck, X } from 'lucide-react';
import { AuthNavigation } from '@/features/auth/AuthNavigation';
import { MobileNavigationDrawer } from '@/components/ui/MobileNavigationDrawer';
import { useMobileNavigation } from '@/components/ui/use-mobile-navigation';
import {
  PlacementHeaderStatusContext,
  type PlacementHeaderStatus,
} from './placement-header-status';

export function PlacementExamLayout({ embedded = false }: { embedded?: boolean }) {
  const mobile = useMobileNavigation();
  const location = useLocation();
  const [headerState, setHeaderState] = useState<{
    pathname: string;
    status: PlacementHeaderStatus;
  }>({
    pathname: location.pathname,
    status: null,
  });

  const status = headerState.pathname === location.pathname ? headerState.status : null;
  const setStatus = useCallback(
    (next: PlacementHeaderStatus) => {
      setHeaderState({ pathname: location.pathname, status: next });
    },
    [location.pathname],
  );
  const contextValue = useMemo(() => ({ status, setStatus }), [status, setStatus]);
  const isResultContext =
    status === 'PUBLISHED' ||
    status === 'SUBMITTED_PENDING_REVIEW' ||
    location.pathname.endsWith('/result');

  if (embedded)
    return (
      <PlacementHeaderStatusContext.Provider value={contextValue}>
        <div className="workspace-page min-w-0">
          {status && (
            <p
              className="text-sm font-semibold text-slate-600"
              data-testid="placement-header-status-badge"
            >
              {
                (
                  {
                    IN_PROGRESS: 'Đang làm bài',
                    SUBMITTED_PENDING_REVIEW: 'Đã nộp — đang chờ chấm',
                    PUBLISHED: 'Kết quả đã công bố',
                    BLOCKED_REVIEW: 'Cần học vụ kiểm tra',
                  } as Record<string, string>
                )[status]
              }
            </p>
          )}
          <Outlet />
        </div>
      </PlacementHeaderStatusContext.Provider>
    );

  return (
    <PlacementHeaderStatusContext.Provider value={contextValue}>
      <div className="min-h-screen bg-slate-100/80 text-slate-900">
        <a
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-indigo-700 focus:px-4 focus:py-2 focus:text-white"
          href="#main-content"
        >
          Chuyển đến nội dung chính
        </a>

        <header className="sticky top-0 z-30 border-b border-slate-200/90 bg-white/95 backdrop-blur">
          <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
            <div className="flex min-w-0 flex-wrap items-center gap-2.5 sm:gap-3">
              <Link
                className="flex items-center gap-2.5 font-bold tracking-tight text-slate-950"
                to="/"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-indigo-600 text-sm font-extrabold text-white shadow-xs">
                  SE
                </span>
                <span className="leading-tight">
                  Smart English
                  <span className="block text-xs font-medium text-slate-500">
                    {status === 'PUBLISHED'
                      ? 'Kết quả đánh giá'
                      : status === 'SUBMITTED_PENDING_REVIEW'
                        ? 'Đã nộp — đang chờ chấm'
                        : status === 'IN_PROGRESS'
                          ? 'Đang làm bài'
                          : isResultContext
                            ? 'Kết quả đánh giá'
                            : 'Bài kiểm tra'}
                  </span>
                </span>
              </Link>
              {status === 'IN_PROGRESS' ? (
                <span
                  data-testid="placement-header-status-badge"
                  className="hidden items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-800 sm:inline-flex"
                >
                  <ShieldCheck size={13} aria-hidden="true" />
                  Đang làm bài
                </span>
              ) : status === 'SUBMITTED_PENDING_REVIEW' ? (
                <span
                  data-testid="placement-header-status-badge"
                  className="hidden items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-900 sm:inline-flex"
                >
                  <Clock3 size={13} aria-hidden="true" />
                  Đã nộp — đang chờ chấm
                </span>
              ) : status === 'PUBLISHED' ? (
                <span
                  data-testid="placement-header-status-badge"
                  className="hidden items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 sm:inline-flex"
                >
                  <CheckCircle2 size={13} aria-hidden="true" />
                  Kết quả đã công bố
                </span>
              ) : status === 'BLOCKED_REVIEW' ? (
                <span
                  data-testid="placement-header-status-badge"
                  className="hidden items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-800 sm:inline-flex"
                >
                  <AlertTriangle size={13} aria-hidden="true" />
                  Cần học vụ kiểm tra
                </span>
              ) : null}
            </div>

            <div className="hidden items-center gap-3 text-sm lg:flex">
              <AuthNavigation />
            </div>

            <button
              type="button"
              aria-label={mobile.open ? 'Đóng menu điều hướng' : 'Mở menu điều hướng'}
              aria-expanded={mobile.open}
              onClick={mobile.openMenu}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 lg:hidden"
            >
              {mobile.open ? (
                <X size={18} aria-hidden="true" />
              ) : (
                <Menu size={18} aria-hidden="true" />
              )}
              <span>Menu</span>
            </button>
          </div>

          <MobileNavigationDrawer
            open={mobile.open}
            onClose={mobile.closeMenu}
            title="Điều hướng kiểm tra năng lực"
            className="relative z-10 flex h-dvh w-76 max-w-[85vw] flex-col overflow-y-auto overscroll-contain bg-white p-4 shadow-2xl"
          >
            <div className="mb-4 flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <p className="font-bold text-slate-950">Smart English</p>
                <p className="text-xs text-slate-500">Điều hướng học viên</p>
              </div>
              <button
                type="button"
                data-drawer-close
                aria-label="Đóng menu điều hướng"
                onClick={mobile.closeMenu}
                className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-100"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <nav aria-label="Điều hướng kiểm tra năng lực" className="flex flex-col gap-1 text-sm">
              <Link
                className="rounded-lg px-3 py-2 font-medium text-slate-700 hover:bg-slate-50"
                to="/"
              >
                Trang chủ
              </Link>
              <Link
                className="rounded-lg px-3 py-2 font-medium text-slate-700 hover:bg-slate-50"
                to="/catalog"
              >
                Khóa học
              </Link>
              <Link
                className="rounded-lg px-3 py-2 font-medium text-slate-700 hover:bg-slate-50"
                to="/placement"
              >
                Kiểm tra đầu vào
              </Link>
              <div className="mt-2 border-t border-slate-200 pt-2">
                <AuthNavigation layout="stacked" />
              </div>
            </nav>
          </MobileNavigationDrawer>
        </header>

        <div id="main-content">
          <Outlet />
        </div>
      </div>
    </PlacementHeaderStatusContext.Provider>
  );
}
