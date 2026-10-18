import type { ReactNode } from 'react';
import authStudyImage from '@/assets/auth/auth-study.webp';

export function AuthShell({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="mx-auto grid min-h-[calc(100vh-14rem)] max-w-7xl items-stretch px-4 py-10 sm:px-6 lg:grid-cols-[.9fr_1.1fr] lg:px-8 lg:py-14">
      <div className="flex items-center rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10 lg:rounded-r-none lg:border-r-0">
        <div className="mx-auto w-full max-w-md">
          <p className="eyebrow">{eyebrow}</p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
          <p className="mt-3 leading-7 text-slate-600">{description}</p>
          {children}
        </div>
      </div>
      <div className="relative hidden min-h-[640px] overflow-hidden rounded-r-3xl bg-indigo-950 lg:block">
        <img
          alt="Người học chuẩn bị cho một buổi học tiếng Anh trực tuyến"
          className="absolute inset-0 size-full object-cover"
          decoding="async"
          src={authStudyImage}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-indigo-950/85 via-indigo-950/10 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-10 text-white">
          <p className="text-sm font-bold uppercase tracking-[.18em] text-sky-200">
            Học tập liền mạch
          </p>
          <p className="mt-3 max-w-md text-2xl font-bold leading-snug">
            Quay lại đúng lớp học, bài kiểm tra và tiến độ của bạn.
          </p>
        </div>
      </div>
    </section>
  );
}
