import { useEffect, useRef, useState } from 'react';
import { BarChart3, BookOpen, ClipboardList, Home, Lightbulb, Menu, Trophy } from 'lucide-react';
import { Link, NavLink, Outlet, useMatch, useParams } from 'react-router';
import { OverlayDrawer } from '@/components/ui/OverlayDrawer';
import { enrollmentApi } from '@/features/enrollments/api';
import type { EnrollmentView } from '@/features/enrollments/types';
import { ApiError } from '@/lib/api-client';

export interface ClassShellContext {
  enrollment: EnrollmentView;
}

export function ClassShellLayout() {
  const { enrollmentId = '' } = useParams();
  const focusMode = Boolean(
    useMatch({
      path: '/student/enrollments/:enrollmentId/attempts/:attemptId',
      end: true,
    }),
  );
  const [enrollment, setEnrollment] = useState<EnrollmentView | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');
  const [drawer, setDrawer] = useState(false);
  const drawerTriggerRef = useRef<HTMLButtonElement>(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void enrollmentApi
      .detail(enrollmentId, controller.signal)
      .then((data) => {
        setEnrollment(data);
        setState('ready');
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setState(error instanceof ApiError && error.status === 404 ? 'missing' : 'error');
      });
    return () => controller.abort();
  }, [enrollmentId, reload]);
  if (state === 'loading' || (state === 'ready' && enrollment?.id !== enrollmentId))
    return (
      <div className="mx-auto max-w-7xl px-4 py-12" role="status">
        <div className="h-64 animate-pulse rounded-3xl bg-slate-200" />
      </div>
    );
  if (state !== 'ready' || !enrollment)
    return (
      <ShellMessage
        text={
          state === 'missing'
            ? 'Không tìm thấy lớp học thuộc tài khoản của bạn.'
            : 'Không thể tải không gian lớp học.'
        }
        retry={state === 'error' ? () => setReload((value) => value + 1) : undefined}
      />
    );
  if (enrollment.status !== 'ACTIVE')
    return (
      <section className="mx-auto max-w-3xl px-4 py-16">
        <div className="rounded-3xl border border-amber-200 bg-amber-50 p-8">
          <h1 className="text-2xl font-bold text-amber-950">Lớp chưa mở quyền học</h1>
          <p className="mt-3 leading-7 text-amber-900">
            Đăng ký của bạn chưa được xác nhận để truy cập nội dung lớp. Vui lòng quay lại sau khi
            trạng thái đăng ký được cập nhật.
          </p>
          <Link className="btn-secondary mt-6" to="/student/enrollments">
            Về Lớp học của tôi
          </Link>
        </div>
      </section>
    );
  const base = `/student/enrollments/${enrollmentId}`;
  const links = [
    [Home, base, 'Tổng quan', true],
    [BookOpen, `${base}/learn`, 'Nội dung học tập', false],
    [ClipboardList, `${base}/tests`, 'Bài kiểm tra', false],
    [Trophy, `${base}/results`, 'Kết quả', false],
    [Lightbulb, `${base}/recommendations`, 'Gợi ý tự học', false],
    [BarChart3, `${base}/progress`, 'Tiến độ', false],
  ] as const;
  const navigation = (
    <nav aria-label="Điều hướng lớp học" className="space-y-1">
      {links.map(([Icon, to, label, end]) => (
        <NavLink
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold ${isActive ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-indigo-50 hover:text-indigo-700'}`
          }
          end={end}
          key={to}
          onClick={() => setDrawer(false)}
          to={to}
        >
          <Icon size={18} />
          {label}
        </NavLink>
      ))}
    </nav>
  );
  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b bg-white">
        <div
          className={`mx-auto flex items-center justify-between gap-4 px-4 sm:px-6 lg:px-8 ${focusMode ? 'w-full max-w-[1920px] py-3' : 'max-w-7xl py-5'}`}
          data-class-shell-mode={focusMode ? 'focus' : 'standard'}
        >
          <div>
            <Link className="text-sm font-semibold text-indigo-700" to="/student/enrollments">
              ← Lớp học của tôi
            </Link>
            <h1 className={`${focusMode ? 'mt-1 text-lg' : 'mt-2 text-xl'} font-bold`}>
              {enrollment.classOffering.name}
            </h1>
            <p className="text-sm text-slate-500">
              {enrollment.classOffering.code} · {enrollment.classOffering.course.title}
            </p>
          </div>
          <div className="hidden min-w-52 sm:block">
            <div className="flex justify-between text-xs font-semibold">
              <span>Tiến độ</span>
              <span>{enrollment.progress.progressPercent}%</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-indigo-600"
                style={{ width: `${enrollment.progress.progressPercent}%` }}
              />
            </div>
          </div>
          <button
            aria-label="Mở không gian lớp"
            className={`items-center gap-2 rounded-lg border px-3 py-2 font-semibold text-slate-700 hover:bg-slate-50 ${focusMode ? 'flex' : 'flex lg:hidden'}`}
            onClick={() => setDrawer(true)}
            ref={drawerTriggerRef}
            type="button"
          >
            <Menu aria-hidden="true" size={20} />
            {focusMode ? <span className="hidden sm:inline">Không gian lớp</span> : null}
          </button>
        </div>
      </header>
      <div
        className={
          focusMode
            ? 'mx-auto w-full max-w-[1920px] px-4 py-4 sm:px-6 lg:px-8'
            : 'mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[250px_1fr] lg:px-8'
        }
        data-class-shell-workspace={focusMode ? 'focus' : 'standard'}
      >
        {!focusMode ? (
          <aside
            className="hidden self-start rounded-2xl border bg-white p-4 shadow-sm lg:sticky lg:top-24 lg:block"
            data-class-navigation="persistent"
          >
            {navigation}
          </aside>
        ) : null}
        <main className="min-w-0">
          <Outlet context={{ enrollment } satisfies ClassShellContext} />
        </main>
      </div>
      <OverlayDrawer
        onClose={() => setDrawer(false)}
        open={drawer}
        side="left"
        title="Không gian lớp"
        triggerRef={drawerTriggerRef}
      >
        {navigation}
      </OverlayDrawer>
    </div>
  );
}

function ShellMessage({ text, retry }: { text: string; retry?: () => void }) {
  return (
    <section className="mx-auto max-w-3xl px-4 py-16">
      <div className="state-error">
        <p>{text}</p>
        {retry ? (
          <button className="mt-3 font-semibold underline" onClick={retry} type="button">
            Thử lại
          </button>
        ) : null}
        <div>
          <Link className="mt-4 inline-block font-semibold underline" to="/student/enrollments">
            Về Lớp học của tôi
          </Link>
        </div>
      </div>
    </section>
  );
}
