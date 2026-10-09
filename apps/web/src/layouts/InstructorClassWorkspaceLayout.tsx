import { useEffect, useState } from 'react';
import { BarChart3, BookOpen, ClipboardCheck, ClipboardList, Home, Menu, Users, X } from 'lucide-react';
import { Link, NavLink, Outlet, useParams } from 'react-router';
import { instructorApi } from '@/features/instructor/api';
import type { InstructorClassOverview } from '@/features/instructor/types';
import { ApiError } from '@/lib/api-client';

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
    void instructorApi.classes.overview(classOfferingId, controller.signal)
      .then((data) => { setOverview(data); setError(null); })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === 'AbortError') return;
        setError(cause instanceof ApiError && [403, 404].includes(cause.status)
          ? 'Bạn không có quyền truy cập lớp này.'
          : 'Không thể tải không gian lớp giảng dạy.');
      });
    return () => controller.abort();
  }, [classOfferingId, reload]);
  if (error) return <div className="mx-auto max-w-3xl p-8"><div className="state-error"><p>{error}</p><button className="mt-3 underline" onClick={() => setReload((v) => v + 1)}>Thử lại</button></div></div>;
  if (!overview) return <div className="mx-auto max-w-7xl p-8" role="status"><div className="h-64 animate-pulse rounded-3xl bg-slate-200" /></div>;
  const base = `/instructor/classes/${classOfferingId}`;
  const links = [
    [Home, base, 'Tổng quan', true],
    [Users, `${base}/learners`, 'Học viên', false],
    [BookOpen, `${base}/content`, 'Nội dung', false],
    [ClipboardList, `${base}/assessments`, 'Bài kiểm tra', false],
    [ClipboardCheck, `${base}/grading`, 'Chấm bài', false],
    [BarChart3, `${base}/results`, 'Kết quả', false],
  ] as const;
  const nav = <nav aria-label="Điều hướng lớp giảng dạy" className="space-y-1">{links.map(([Icon, to, label, end]) => <NavLink className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold ${isActive ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-indigo-50 hover:text-indigo-700'}`} end={end} key={to} onClick={() => setDrawer(false)} to={to}><Icon size={18} />{label}</NavLink>)}</nav>;
  return <div className="min-h-screen bg-slate-100">
    <header className="border-b bg-white"><div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-5 sm:px-6 lg:px-8"><div><Link className="text-sm font-semibold text-indigo-700" to="/instructor/teaching">← Lớp giảng dạy của tôi</Link><h1 className="mt-2 text-xl font-bold">{overview.classOffering.name}</h1><p className="text-sm text-slate-500">{overview.classOffering.code} · {overview.classOffering.course.title}</p></div><div className="hidden text-right sm:block"><p className="text-xs font-semibold uppercase text-slate-500">Học viên đang học</p><p className="text-2xl font-bold text-indigo-700">{overview.activeLearnerCount}</p></div><button aria-label="Mở điều hướng lớp" className="rounded-lg border p-2 lg:hidden" onClick={() => setDrawer(true)}><Menu /></button></div></header>
    <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[240px_1fr] lg:px-8"><aside className="hidden self-start rounded-2xl border bg-white p-4 shadow-sm lg:sticky lg:top-24 lg:block">{nav}</aside><main className="min-w-0"><Outlet context={{ overview } satisfies InstructorClassWorkspaceContext} /></main></div>
    {drawer ? <div className="fixed inset-0 z-50 bg-slate-950/50 lg:hidden" onClick={() => setDrawer(false)}><aside className="h-full w-72 bg-white p-5" onClick={(e) => e.stopPropagation()}><div className="mb-6 flex justify-between"><strong>Không gian lớp</strong><button aria-label="Đóng điều hướng" onClick={() => setDrawer(false)}><X /></button></div>{nav}</aside></div> : null}
  </div>;
}
