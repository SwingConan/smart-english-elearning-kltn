import { ShieldCheck } from 'lucide-react';
import { Outlet } from 'react-router';

export function PlacementExamLayout() {
  return (
    <div className="min-h-screen bg-slate-100 text-slate-950">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <span className="font-bold">Smart English · Kiểm tra đầu vào</span>
          <span className="flex items-center gap-2 text-sm text-slate-600"><ShieldCheck size={17} /> Bài làm được bảo vệ</span>
        </div>
      </header>
      <main><Outlet /></main>
    </div>
  );
}
