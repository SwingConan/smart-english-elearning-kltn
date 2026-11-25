import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { BookOpen, ClipboardCheck, HelpCircle, TrendingUp } from 'lucide-react';
import { instructorApi } from '@/features/instructor/api';
import type { InstructorClass } from '@/features/instructor/types';
import { IuhCourseCardBanner } from '@/features/class-lms/IuhLmsShell';
import { classCodeLabel } from '@/features/demo/presentation';
import { learnerClassLabel } from '@/features/enrollments/presentation';

function isOngoingClass(status: string) {
  return status === 'OPEN' || status === 'IN_PROGRESS' || status === 'ACTIVE';
}

const CLASS_STATUS_META: Record<string, { label: string; cls: string }> = {
  OPEN: { label: 'Đang mở lớp', cls: 'bg-emerald-100 text-emerald-800' },
  IN_PROGRESS: { label: 'Đang dạy', cls: 'bg-emerald-100 text-emerald-800' },
  ACTIVE: { label: 'Đang dạy', cls: 'bg-emerald-100 text-emerald-800' },
  COMPLETED: { label: 'Đã hoàn thành', cls: 'bg-slate-200 text-slate-600' },
  CANCELLED: { label: 'Đã hủy', cls: 'bg-rose-100 text-rose-800' },
  DRAFT: { label: 'Nháp', cls: 'bg-amber-100 text-amber-800' },
};

export function InstructorAssessmentsHubPage() {
  const [classes, setClasses] = useState<InstructorClass[]>([]);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'COMPLETED'>('ALL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        let loaded: InstructorClass[];
        try {
          loaded = await instructorApi.classes.list(controller.signal);
        } catch (cause) {
          if (cause instanceof Error && cause.name === 'AbortError') return;
          const entries = await instructorApi.teaching.list(controller.signal);
          loaded = entries.flatMap(({ course, classOfferings }) =>
            classOfferings.map((offering) => ({
              ...offering,
              code: offering.code ?? '—',
              activeLearnerCount: offering.activeLearnerCount ?? 0,
              course: { id: course.id, title: course.title, level: course.level },
            })),
          );
        }
        setClasses(loaded);
        setError('');
      } catch (cause) {
        if (!(cause instanceof Error && cause.name === 'AbortError')) {
          setError('Không thể tải danh sách khóa học phụ trách.');
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, []);

  const filteredClasses = useMemo(
    () =>
      classes.filter((c) => {
        if (statusFilter === 'ACTIVE') return isOngoingClass(c.status);
        if (statusFilter === 'COMPLETED') return c.status === 'COMPLETED';
        return true;
      }),
    [classes, statusFilter],
  );

  const courseGroups = useMemo(() => {
    const map = new Map<
      string,
      { course: InstructorClass['course']; classes: InstructorClass[] }
    >();
    for (const c of filteredClasses) {
      const existing = map.get(c.course.id);
      if (existing) existing.classes.push(c);
      else map.set(c.course.id, { course: c.course, classes: [c] });
    }
    return [...map.values()];
  }, [filteredClasses]);

  const activeTotal = classes.filter((c) => isOngoingClass(c.status)).length;
  const completedTotal = classes.filter((c) => c.status === 'COMPLETED').length;
  const hubReturn = encodeURIComponent('/instructor/assessments-hub');

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-[#76a35e]">
            Học liệu & Kiểm tra
          </p>
          <h1 className="mt-1 text-2xl font-bold text-[#e66f2b] sm:text-[26px]">
            Ngân hàng câu hỏi &amp; Chấm điểm lớp
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Biên soạn câu hỏi ngân hàng theo từng khóa học và mở nhanh hoạt động kiểm tra, chấm bài,
            kết quả theo từng lớp phụ trách.
          </p>
        </div>
        <Link
          to="/instructor/teaching"
          className="rounded border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          ← Lớp được phân công
        </Link>
      </header>

      {!loading && classes.length > 0 && (
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Lọc trạng thái lớp">
          {(
            [
              ['ALL', `Tất cả (${classes.length})`],
              ['ACTIVE', `Đang dạy (${activeTotal})`],
              ['COMPLETED', `Đã hoàn thành (${completedTotal})`],
            ] as const
          ).map(([key, labelText]) => (
            <button
              key={key}
              type="button"
              onClick={() => setStatusFilter(key)}
              className={
                statusFilter === key
                  ? 'rounded-lg bg-[#2d581b] px-3 py-1.5 text-xs font-semibold text-white'
                  : 'rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50'
              }
            >
              {labelText}
            </button>
          ))}
        </div>
      )}

      {error && (
        <p role="alert" className="rounded border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          {error}
        </p>
      )}

      {loading ? (
        <div className="rounded border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          Đang tải danh sách khóa học…
        </div>
      ) : courseGroups.length === 0 ? (
        <div className="rounded border border-dashed border-slate-300 bg-[#f8f9fa] p-8 text-center text-sm text-slate-600">
          {classes.length === 0
            ? 'Bạn chưa được phân công khóa học hoặc lớp nào trong kỳ hiện tại.'
            : 'Không có khóa học nào có lớp phù hợp bộ lọc đang chọn.'}
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {courseGroups.map(({ course, classes: rows }, idx) => {
            const activeInCourse = rows.filter((r) => isOngoingClass(r.status)).length;
            return (
              <article
                key={course.id}
                className="flex flex-col overflow-hidden rounded border border-slate-200 bg-white"
              >
                <IuhCourseCardBanner variantIndex={idx + 2} />
                <div className="flex flex-1 flex-col justify-between p-4 space-y-4">
                  <div>
                    <span className="inline-block rounded bg-[#f8f9fa] px-2 py-0.5 text-[11px] font-semibold text-slate-600 border border-slate-200">
                      {({ FOUNDATION: 'Nền tảng', INTERMEDIATE: 'Trung cấp', ADVANCED: 'Nâng cao', ADVANCING: 'Trung cao cấp' }[course.level] ?? course.level)} ·{' '}
                      {activeInCourse === rows.length
                        ? `${activeInCourse} lớp đang dạy`
                        : `${activeInCourse}/${rows.length} lớp đang dạy`}
                    </span>
                    <h2 className="mt-2 text-base font-bold text-slate-900">{course.title}</h2>
                    <div className="mt-3 space-y-2">
                      {rows.map((cls) => {
                        const codeText = classCodeLabel(cls.code) || cls.code;
                        const nameText = learnerClassLabel(cls.name, cls.code);
                        const statusMeta = CLASS_STATUS_META[cls.status] ?? {
                          label: cls.status,
                          cls: 'bg-slate-200 text-slate-600',
                        };
                        return (
                          <div
                            key={cls.id}
                            className="rounded-lg border border-slate-100 bg-slate-50/70 p-2.5 text-xs space-y-1.5"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-1">
                              <Link
                                to={`/classroom/${cls.id}`}
                                className="inline-flex items-center gap-1 font-semibold text-[#e66f2b] hover:underline"
                              >
                                <BookOpen size={12} aria-hidden="true" />
                                {codeText} · {nameText}
                              </Link>
                              <span
                                className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${statusMeta.cls}`}
                              >
                                {statusMeta.label}
                              </span>
                            </div>
                            <div className="flex flex-wrap gap-2 text-[11px] font-medium text-slate-700">
                              <Link
                                to={`/classroom/${cls.id}`}
                                className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-0.5 hover:border-[#76a35e] hover:text-[#2d581b]"
                              >
                                <BookOpen size={11} aria-hidden="true" />
                                Học phần &amp; KT
                              </Link>
                              <Link
                                to={`/instructor/classes/${cls.id}/grading`}
                                className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-0.5 hover:border-[#76a35e] hover:text-[#2d581b]"
                              >
                                <ClipboardCheck size={11} aria-hidden="true" />
                                Chấm bài
                              </Link>
                              <Link
                                to={`/instructor/classes/${cls.id}/results`}
                                className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-0.5 hover:border-[#76a35e] hover:text-[#2d581b]"
                              >
                                <TrendingUp size={11} aria-hidden="true" />
                                Kết quả
                              </Link>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="border-t border-slate-100 pt-3">
                    <Link
                      to={`/instructor/courses/${course.id}/question-bank?returnTo=${hubReturn}`}
                      className="inline-flex w-full items-center justify-center gap-1.5 rounded bg-[#76a35e] px-3 py-2 text-xs font-semibold text-white hover:bg-[#658f50]"
                    >
                      <HelpCircle size={14} aria-hidden="true" />
                      Ngân hàng câu hỏi
                    </Link>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
