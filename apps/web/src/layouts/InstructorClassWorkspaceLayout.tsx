import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  BarChart3,
  BookOpen,
  ClipboardCheck,
  Home,
  Menu,
  Users,
  X,
} from 'lucide-react';
import { Link, NavLink, Outlet, useParams } from 'react-router';
import { instructorApi } from '@/features/instructor/api';
import type { InstructorClassOverview } from '@/features/instructor/types';
import { ApiError } from '@/lib/api-client';
import { classCodeLabel } from '@/features/demo/presentation';

export interface InstructorClassWorkspaceContext {
  overview: InstructorClassOverview;
}

export function InstructorClassWorkspaceLayout() {
  const { classOfferingId = '' } = useParams();
  const [overview, setOverview] = useState<InstructorClassOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void instructorApi.classes
      .overview(classOfferingId, controller.signal)
      .then((data) => {
        setOverview(data);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === 'AbortError') return;
        setError(
          cause instanceof ApiError && [403, 404].includes(cause.status)
            ? 'Bạn không có quyền truy cập lớp này.'
            : 'Không thể tải không gian lớp giảng dạy.',
        );
      });
    return () => controller.abort();
  }, [classOfferingId, reload]);

  if (error) {
    return (
      <div className="mx-auto max-w-3xl py-8">
        <div className="state-error">
          <p>{error}</p>
          <button className="mt-3 underline" onClick={() => setReload((v) => v + 1)}>
            Thử lại
          </button>
        </div>
      </div>
    );
  }
  if (!overview) {
    return (
      <div className="mx-auto max-w-7xl py-8" role="status">
        <div className="h-64 animate-pulse rounded border border-slate-200 bg-slate-100" />
      </div>
    );
  }

  const base = `/instructor/classes/${classOfferingId}`;
  const links = [
    [Home, base, 'Tổng quan & Sĩ số', true],
    [Users, `${base}/learners`, 'Danh sách học viên', false],
    [BookOpen, `${base}/content`, 'Giáo trình khóa học', false],
    [ClipboardCheck, `${base}/grading`, 'Chấm bài & Điểm số', false],
    [BarChart3, `${base}/results`, 'Kết quả lớp', false],
  ] as const;

  const nav = (
    <nav aria-label="Điều hướng quản lý lớp" className="space-y-1">
      <Link
        to={`/classroom/${classOfferingId}`}
        className="mb-3 flex items-center justify-center gap-1.5 rounded bg-[#76a35e] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#658f50]"
      >
        <ArrowLeft size={14} aria-hidden="true" />
        Về Học phần &amp; Hoạt động lớp
      </Link>
      {links.map(([Icon, to, label, end]) => (
        <NavLink
          className={({ isActive }) =>
            `flex items-center gap-2.5 rounded px-3 py-2 text-sm font-semibold transition ${
              isActive
                ? 'bg-[#e9f2e4] text-[#2f5d1e] border-l-4 border-[#76a35e]'
                : 'text-slate-700 hover:bg-slate-50 hover:text-[#e66f2b]'
            }`
          }
          end={end}
          key={to}
          onClick={() => setDrawer(false)}
          to={to}
        >
          <Icon size={16} aria-hidden="true" />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div className="space-y-5">
      <header className="rounded border border-slate-200 bg-white px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
              <Link className="text-[#e66f2b] hover:underline" to="/instructor/teaching">
                ← Lớp được phân công
              </Link>
              <span className="text-slate-300">/</span>
              <Link
                className="text-[#2f5d1e] hover:underline"
                to={`/classroom/${classOfferingId}`}
              >
                Không gian Học phần &amp; Hoạt động
              </Link>
            </div>
            <h1 className="mt-1.5 text-xl font-bold text-[#e66f2b] sm:text-2xl">
              {overview.classOffering.name}
            </h1>
            <p className="text-xs text-slate-500">
              {classCodeLabel(overview.classOffering.code)} · {overview.classOffering.course.title}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden rounded border border-slate-200 bg-[#f8f9fa] px-3.5 py-1.5 text-right sm:block">
              <p className="text-[11px] font-semibold uppercase text-slate-500">Học viên đang học</p>
              <p className="text-lg font-bold text-[#2f5d1e]">{overview.activeLearnerCount}</p>
            </div>
            <button
              aria-label="Mở điều hướng lớp"
              className="rounded border border-slate-300 p-2 lg:hidden"
              onClick={() => setDrawer(true)}
            >
              <Menu size={18} />
            </button>
          </div>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
        <aside className="hidden self-start rounded border border-slate-200 bg-white p-3.5 lg:sticky lg:top-20 lg:block">
          {nav}
        </aside>
        <main className="min-w-0">
          <Outlet context={{ overview } satisfies InstructorClassWorkspaceContext} />
        </main>
      </div>

      {drawer ? (
        <div
          className="fixed inset-0 z-50 bg-slate-950/50 lg:hidden"
          onClick={() => setDrawer(false)}
        >
          <aside className="h-full w-72 bg-white p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-5 flex items-center justify-between border-b border-slate-200 pb-3">
              <strong className="text-sm font-bold text-[#e66f2b]">Quản lý lớp học</strong>
              <button aria-label="Đóng điều hướng" onClick={() => setDrawer(false)}>
                <X size={18} />
              </button>
            </div>
            {nav}
          </aside>
        </div>
      ) : null}
    </div>
  );
}
