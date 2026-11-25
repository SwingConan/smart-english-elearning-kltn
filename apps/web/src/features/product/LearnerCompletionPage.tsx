import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useProductRead, type CompletionReadiness } from './api';
import { enrollmentApi } from '@/features/enrollments/api';
import type { EnrollmentView } from '@/features/enrollments/types';
import { learnerClassLabel, learnerCourseLabel } from '@/features/enrollments/presentation';
import { isTechnicalQaRecord } from '@/features/catalog/record-presentation';
import { classCodeLabel } from '@/features/demo/presentation';
import { useAuth } from '@/features/auth/auth-context';
import { PrintableCertificateSheet, type PrintableCertificateProps } from './PrintableCertificateSheet';

const CRITERION_DOMAIN_LABELS: Record<string, string> = {
  GRADEBOOK: 'Kết quả học tập & điểm số',
  W03_GRADE: 'Kết quả học tập & điểm số',
  ATTENDANCE: 'Chuyên cần & điểm danh',
  W06_ATTENDANCE: 'Chuyên cần & điểm danh',
  LMS: 'Tiến độ hoàn thành bài học',
  W07_LMS_COMPLETION: 'Tiến độ hoàn thành bài học',
};

function formatCriterionLabel(rawLabel: string | undefined, domain: string) {
  if (rawLabel) {
    return rawLabel.replace(/\s*\((W0\d|W06\/LMS)\)/gi, '').trim();
  }
  return CRITERION_DOMAIN_LABELS[domain] || domain;
}

type ProgressFilter = 'ALL' | 'CERTIFIED' | 'ACTIVE';

export function CompletionPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { phase, data, reload } = useProductRead<CompletionReadiness>('/v2/certificates/readiness');
  const [enrollments, setEnrollments] = useState<EnrollmentView[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [filter, setFilter] = useState<ProgressFilter>('ALL');
  const [lookupCode, setLookupCode] = useState('');
  const [printingEnrollmentId, setPrintingEnrollmentId] = useState<string | null>(null);
  const [previewCert, setPreviewCert] = useState<{
    enrollmentId: string;
    props: PrintableCertificateProps;
  } | null>(null);

  useEffect(() => {
    let live = true;
    void enrollmentApi
      .listMine()
      .then((rows) => {
        if (live) {
          setEnrollments(Array.isArray(rows) ? rows : []);
          setLoadError(false);
        }
      })
      .catch(() => {
        if (live) {
          setEnrollments([]);
          setLoadError(true);
        }
      });
    return () => {
      live = false;
    };
  }, []);

  const readinessMap = useMemo(() => {
    const map = new Map<string, CompletionReadiness['enrollments'][number]>();
    for (const r of data?.enrollments ?? []) {
      map.set(r.enrollmentId, r);
    }
    return map;
  }, [data]);

  const activeRows = useMemo(() => {
    const safeList = Array.isArray(enrollments) ? enrollments : [];
    const allowTechnical = Boolean(user?.email?.toLowerCase().includes('test'));
    const base = safeList.filter((e) => {
      if (!['ACTIVE', 'COMPLETED'].includes(e.status)) return false;
      const clsCode = e.classOffering?.code ?? '';
      const clsName = e.classOffering?.name ?? '';
      const crsTitle = e.classOffering?.course?.title ?? '';
      if (
        !allowTechnical &&
        (isTechnicalQaRecord(clsCode, clsName) || (crsTitle && isTechnicalQaRecord(crsTitle)))
      ) {
        return false;
      }
      return true;
    });

    return [...base].sort((a, b) => {
      const ra = readinessMap.get(a.id);
      const rb = readinessMap.get(b.id);
      const certA = ra?.certificate?.state === 'ISSUED' ? 1 : 0;
      const certB = rb?.certificate?.state === 'ISSUED' ? 1 : 0;
      if (certA !== certB) return certB - certA;
      const timeA = a.enrolledAt ? new Date(a.enrolledAt).getTime() : 0;
      const timeB = b.enrolledAt ? new Date(b.enrolledAt).getTime() : 0;
      return timeB - timeA;
    });
  }, [enrollments, readinessMap, user?.email]);

  const filterCounts = useMemo(() => {
    let certified = 0;
    let inProgress = 0;
    for (const e of activeRows) {
      const r = readinessMap.get(e.id);
      if (r?.certificate?.state === 'ISSUED') {
        certified += 1;
      } else {
        inProgress += 1;
      }
    }
    return { all: activeRows.length, certified, inProgress };
  }, [activeRows, readinessMap]);

  const filteredRows = useMemo(() => {
    if (filter === 'CERTIFIED') {
      return activeRows.filter((e) => readinessMap.get(e.id)?.certificate?.state === 'ISSUED');
    }
    if (filter === 'ACTIVE') {
      return activeRows.filter((e) => readinessMap.get(e.id)?.certificate?.state !== 'ISSUED');
    }
    return activeRows;
  }, [activeRows, filter, readinessMap]);

  const metrics = useMemo(() => {
    let totalDoneActivities = 0;
    let totalActivities = 0;
    let eligibleWaitingCount = 0;

    for (const e of activeRows) {
      const r = readinessMap.get(e.id);
      if (r?.assessment === 'ELIGIBLE_FOR_REVIEW' && r?.certificate?.state !== 'ISSUED') {
        eligibleWaitingCount += 1;
      }
      const done = r?.lmsProgress?.completedActivities ?? e.progress?.completedLessons ?? 0;
      const total = r?.lmsProgress?.totalActivities ?? e.progress?.totalLessons ?? 0;
      totalDoneActivities += done;
      totalActivities += total;
    }

    const overallPercent =
      totalActivities > 0 ? Math.min(100, Math.round((totalDoneActivities / totalActivities) * 100)) : 0;

    return {
      totalDoneActivities,
      totalActivities,
      overallPercent,
      eligibleWaitingCount,
    };
  }, [activeRows, readinessMap]);

  useEffect(() => {
    const onBeforePrint = () => {
      setPrintingEnrollmentId((current) => {
        if (current) return current;
        const firstIssued = activeRows.find(
          (row) => readinessMap.get(row.id)?.certificate?.state === 'ISSUED',
        );
        return firstIssued ? firstIssued.id : null;
      });
    };
    const onAfterPrint = () => setPrintingEnrollmentId(null);
    window.addEventListener('beforeprint', onBeforePrint);
    window.addEventListener('afterprint', onAfterPrint);
    return () => {
      window.removeEventListener('beforeprint', onBeforePrint);
      window.removeEventListener('afterprint', onAfterPrint);
    };
  }, [activeRows, readinessMap]);

  const handlePrintCertificate = (enrollmentId: string) => {
    setPrintingEnrollmentId(enrollmentId);
    window.setTimeout(() => {
      window.requestAnimationFrame(() => {
        window.print();
      });
    }, 50);
  };

  return (
    <main className="workspace-page mx-auto max-w-5xl space-y-6 py-6">
      <header className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs sm:flex-row sm:items-center sm:justify-between print:hidden">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-[#4d7439]">
            Hồ sơ học tập &amp; Xác nhận hoàn thành
          </p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900">
            Tiến độ học tập &amp; Chứng chỉ
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Theo dõi tỷ lệ hoàn thành từng lớp học, điều kiện xét duyệt và chứng chỉ đã cấp.
          </p>
        </div>
        <button
          type="button"
          className="btn-secondary shrink-0 text-xs"
          onClick={() => {
            reload();
          }}
        >
          Làm mới
        </button>
      </header>

      {/* Top KPI Summary Strip */}
      {enrollments && activeRows.length > 0 && (
        <section
          aria-label="Tổng quan tiến độ và chứng chỉ"
          className="grid gap-3 sm:grid-cols-3 print:hidden"
        >
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Lớp đang theo học &amp; hoàn thành
            </p>
            <p className="mt-2 text-2xl font-extrabold text-slate-900">{filterCounts.all}</p>
            <p className="mt-0.5 text-xs text-slate-500">
              {filterCounts.inProgress} đang học · {filterCounts.certified} đã cấp chứng chỉ
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Hoạt động đã hoàn thành
            </p>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-extrabold text-slate-900">
                {metrics.totalDoneActivities}/{metrics.totalActivities} hoạt động
              </span>
              <span className="text-sm font-bold text-[#4d7439]">{metrics.overallPercent}%</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-[#4d7439] transition-all"
                style={{ width: `${metrics.overallPercent}%` }}
              />
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Chứng chỉ đã cấp
            </p>
            <p className="mt-2 text-2xl font-extrabold text-emerald-700">{filterCounts.certified}</p>
            <p className="mt-0.5 text-xs text-slate-500">
              {metrics.eligibleWaitingCount > 0
                ? `${metrics.eligibleWaitingCount} lớp đã đạt điều kiện, chờ Học vụ duyệt cấp`
                : 'Chứng chỉ có thể in PDF hoặc tra cứu trực tuyến'}
            </p>
          </div>
        </section>
      )}

      {(phase === 'LOADING' || (!enrollments && !loadError)) && (
        <p role="status" className="workspace-card text-sm text-slate-600 print:hidden">
          Đang tải tiến độ hoàn thành…
        </p>
      )}

      {(loadError || phase === 'ERROR' || phase === 'DENIED') && (
        <section className="workspace-card space-y-2 border-amber-200 bg-amber-50/40 print:hidden">
          <h2 className="font-bold text-slate-900">Chưa tải đủ thông tin hoàn thành</h2>
          <p className="text-sm text-slate-600">
            Bạn có thể làm mới lại trang hoặc liên hệ bộ phận hỗ trợ nếu dữ liệu chưa hiển thị.
          </p>
          <Link className="inline-block text-sm font-semibold text-[#4d7439] hover:underline" to="/student/support">
            Nhờ trung tâm hỗ trợ →
          </Link>
        </section>
      )}

      {enrollments && activeRows.length === 0 && !loadError && (
        <section className="workspace-card space-y-3 print:hidden">
          <h2 className="font-bold text-slate-900">Bạn chưa có lớp học đang hoạt động</h2>
          <p className="text-sm text-slate-600">
            Sau khi ghi danh vào lớp học và học tập, tiến độ và chứng chỉ hoàn thành sẽ hiển thị tại đây.
          </p>
          <Link className="btn-secondary inline-flex text-sm" to="/student/enrollments">
            Xem danh sách lớp đăng ký
          </Link>
        </section>
      )}

      {/* Filter Bar */}
      {activeRows.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 print:hidden" role="tablist" aria-label="Lọc theo trạng thái lớp học">
          <button
            type="button"
            role="tab"
            aria-selected={filter === 'ALL'}
            onClick={() => setFilter('ALL')}
            className={
              'rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ' +
              (filter === 'ALL'
                ? 'bg-[#4d7439] text-white'
                : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50')
            }
          >
            Tất cả ({filterCounts.all})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filter === 'CERTIFIED'}
            onClick={() => setFilter('CERTIFIED')}
            className={
              'rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ' +
              (filter === 'CERTIFIED'
                ? 'bg-emerald-700 text-white'
                : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50')
            }
          >
            Đã cấp chứng chỉ ({filterCounts.certified})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filter === 'ACTIVE'}
            onClick={() => setFilter('ACTIVE')}
            className={
              'rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ' +
              (filter === 'ACTIVE'
                ? 'bg-slate-900 text-white'
                : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50')
            }
          >
            Đang học ({filterCounts.inProgress})
          </button>
        </div>
      )}

      {/* Class Progress & Certificate Cards (Single-column, spacious layout) */}
      <div className="space-y-5">
        {filteredRows.map((e) => {
          const readiness = readinessMap.get(e.id);
          const certificate = readiness?.certificate;
          const issued = certificate?.state === 'ISSUED';
          const revoked = certificate?.state === 'REVOKED';
          const isTestCert = Boolean(certificate?.isTestPolicy ?? readiness?.policy?.isTestPolicy);
          const snap = certificate?.immutableSnapshot;
          const missingEvidence = readiness?.missingEvidence ?? [];

          const completedCount =
            readiness?.lmsProgress?.completedActivities ?? e.progress?.completedLessons ?? 0;
          const totalCount =
            readiness?.lmsProgress?.totalActivities ?? e.progress?.totalLessons ?? 0;
          const progressPercent =
            readiness?.lmsProgress?.progressPercent ?? e.progress?.progressPercent ?? 0;

          const w03 = readiness?.evidenceSummary?.w03 ?? snap?.evidenceSummary?.w03;
          const w06 = readiness?.evidenceSummary?.w06 ?? snap?.evidenceSummary?.w06;

          const courseDisplayTitle = e.classOffering.course?.title
            ? learnerCourseLabel(e.classOffering.course.title)
            : (snap?.course?.title ?? classCodeLabel(e.classOffering.code ?? ''));
          const classDisplayLabel = e.classOffering.code
            ? `${classCodeLabel(e.classOffering.code)}${
                e.classOffering.name
                  ? ` · ${learnerClassLabel(
                      e.classOffering.name,
                      e.classOffering.code,
                      e.classOffering.course?.title ?? '',
                    )}`
                  : ''
              }`
            : undefined;
          const certSheetProps: PrintableCertificateProps | null =
            issued && certificate
              ? {
                  learnerName: snap?.learner?.fullName ?? user?.fullName ?? 'Học viên Smart English',
                  certificateCode: certificate.certificateCode,
                  courseTitle: courseDisplayTitle,
                  classLabel: classDisplayLabel,
                  issuedAt: certificate.issuedAt,
                  isTestPolicy: isTestCert,
                  metrics: {
                    progressPercent,
                    gradePercent: w03?.observedPercent ?? null,
                    attendancePercent: w06?.observedPercent ?? null,
                  },
                }
              : null;

          const hideOnPrint =
            printingEnrollmentId !== null ? printingEnrollmentId !== e.id : !issued;

          let topStatusBadge = {
            text: e.status === 'COMPLETED' ? 'Đã hoàn thành' : 'Đang theo học',
            className: 'bg-slate-100 text-slate-700 border-slate-200',
          };
          if (issued) {
            topStatusBadge = {
              text: 'ĐÃ CẤP CHỨNG CHỈ',
              className: 'bg-emerald-100 text-emerald-900 border-emerald-300',
            };
          } else if (revoked) {
            topStatusBadge = {
              text: 'CHỨNG CHỈ ĐÃ THU HỒI',
              className: 'bg-rose-100 text-rose-900 border-rose-200',
            };
          } else if (readiness?.assessment === 'ELIGIBLE_FOR_REVIEW') {
            topStatusBadge = {
              text: 'Đạt điều kiện · Chờ duyệt cấp',
              className: 'bg-sky-100 text-sky-900 border-sky-200',
            };
          }

          return (
            <article
              key={e.id}
              className={
                'rounded-2xl border bg-white p-5 shadow-2xs transition-all ' +
                (issued ? 'border-emerald-200 ' : 'border-slate-200 ') +
                (hideOnPrint ? 'print:hidden' : 'print:border-none print:shadow-none print:p-0')
              }
            >
              {/* Card Header */}
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4 print:hidden">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs font-semibold text-slate-700">
                      {classCodeLabel(e.classOffering.code ?? '')}
                    </span>
                    {e.classOffering.course?.title && (
                      <span className="text-xs text-slate-500">
                        {learnerCourseLabel(e.classOffering.course.title)}
                      </span>
                    )}
                  </div>
                  <h2 className="text-lg font-bold text-slate-900">
                    {learnerClassLabel(
                      e.classOffering.name ?? '',
                      e.classOffering.code ?? '',
                      e.classOffering.course?.title ?? '',
                    )}
                  </h2>
                </div>

                <span
                  className={
                    'shrink-0 rounded-full border px-3 py-1 text-xs font-bold ' +
                    topStatusBadge.className
                  }
                >
                  {topStatusBadge.text}
                </span>
              </div>

              {/* Balanced Two-Column Card Body */}
              <div className="mt-4 grid gap-5 lg:grid-cols-12 print:mt-0 print:block">
                {/* Left Column: Class Progress, Criteria & Focused Links */}
                <div className="flex flex-col justify-between gap-4 lg:col-span-6 print:hidden">
                  <div className="space-y-4">
                    {/* Activity Progress */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs font-semibold">
                        <span className="text-slate-600">Tiến độ nội dung lớp học</span>
                        <span className="text-slate-900">
                          <span>
                            {completedCount}/{totalCount}
                          </span>{' '}
                          <span className="text-slate-500">({progressPercent}%)</span>
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className={
                            'h-full rounded-full transition-all ' +
                            (issued ? 'bg-emerald-600' : 'bg-[#4d7439]')
                          }
                          style={{ width: `${Math.min(100, progressPercent)}%` }}
                        />
                      </div>
                    </div>

                    {/* Key Metrics */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5">
                        <p className="text-[11px] font-semibold text-slate-500">Điểm TB công bố</p>
                        <p className="mt-1 text-sm font-bold text-slate-900">
                          {w03?.avgGradePercent !== null && w03?.avgGradePercent !== undefined
                            ? `${w03.avgGradePercent}%`
                            : 'Chưa có'}
                        </p>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5">
                        <p className="text-[11px] font-semibold text-slate-500">Chuyên cần điểm danh</p>
                        <p className="mt-1 text-sm font-bold text-slate-900">
                          {w06 && w06.totalOpenedSessions > 0
                            ? `${w06.attendedSessions}/${w06.totalOpenedSessions} buổi (${w06.attendanceRatePercent ?? 0}%)`
                            : 'Chưa mở điểm danh'}
                        </p>
                      </div>
                    </div>

                    {/* Criteria List (clean domain names, no dev codes) */}
                    {readiness?.evaluation?.criteria && readiness.evaluation.criteria.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-xs font-bold text-slate-700">Tiêu chí hoàn thành khóa học</p>
                        <ul className="space-y-1.5">
                          {readiness.evaluation.criteria.map((c) => {
                            const passed = c.status === 'SATISFIED' || c.status === 'MET';
                            return (
                              <li
                                key={c.criterionId}
                                className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50/50 px-3 py-2 text-xs"
                              >
                                <span className="font-medium text-slate-800">
                                  {formatCriterionLabel(c.label, c.domain)}
                                </span>
                                <span
                                  className={
                                    'shrink-0 font-bold ' +
                                    (passed ? 'text-emerald-700' : 'text-amber-700')
                                  }
                                >
                                  {c.observedNumericValue !== null &&
                                  c.observedNumericValue !== undefined &&
                                  c.minNumericValue !== null &&
                                  c.minNumericValue !== undefined
                                    ? `${c.observedNumericValue} / ${c.minNumericValue} · `
                                    : ''}
                                  {passed ? 'Đạt' : 'Chưa đủ'}
                                </span>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    )}

                    {/* Missing Evidence Notice (when not issued yet) */}
                    {missingEvidence.length > 0 && !issued && (
                      <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-3.5 py-2.5 text-xs text-amber-950 space-y-1">
                        <p className="font-bold">Cần hoàn thành thêm:</p>
                        <ul className="list-disc pl-4 space-y-0.5">
                          {missingEvidence.map((item, idx) => (
                            <li key={idx}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  {/* Focused Learning Actions (only 2 meaningful links) */}
                  <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
                    <Link
                      to={`/classroom/${e.classOffering.id}/progress`}
                      className="btn-primary text-xs"
                    >
                      Xem tiến độ
                    </Link>
                    <Link
                      to={`/classroom/${e.classOffering.id}`}
                      className="btn-secondary text-xs"
                    >
                      Vào không gian lớp
                    </Link>
                  </div>
                </div>

                {/* Right Column: Issued Certificate OR Readiness Box */}
                <div className="lg:col-span-6 print:w-full">
                  {issued && certificate && certSheetProps ? (
                    <>
                      <section className="flex h-full flex-col justify-between gap-4 rounded-2xl border-2 border-emerald-300 bg-gradient-to-br from-emerald-50/70 via-white to-emerald-50/30 p-5 print:hidden">
                        <div className="space-y-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-800">
                              Chứng nhận hoàn thành khóa học
                            </span>
                            <span
                              className={
                                'rounded-md px-2.5 py-0.5 text-[11px] font-bold ' +
                                (isTestCert
                                  ? 'bg-amber-100 text-amber-900'
                                  : 'bg-emerald-100 text-emerald-900')
                              }
                            >
                              {isTestCert ? 'TEST POLICY · Minh chứng kiểm thử' : 'Chứng chỉ chính thức'}
                            </span>
                          </div>

                          <div>
                            <p className="text-xs text-slate-500">Mã xác minh chứng chỉ</p>
                            <p className="mt-0.5 font-mono text-base font-extrabold tracking-wide text-slate-900 break-all sm:break-normal">
                              {certificate.certificateCode}
                            </p>
                          </div>

                          <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl border border-emerald-100 bg-white/80 p-3 text-xs">
                            <div>
                              <span className="text-slate-500">Học viên:</span>
                              <p className="font-bold text-slate-900">
                                {snap?.learner?.fullName ?? user?.fullName}
                              </p>
                            </div>
                            <div>
                              <span className="text-slate-500">Ngày cấp:</span>
                              <p className="font-bold text-slate-900">
                                {new Date(certificate.issuedAt).toLocaleDateString('vi-VN')}
                              </p>
                            </div>
                            <div className="col-span-2">
                              <span className="text-slate-500">Chương trình:</span>
                              <p className="font-semibold text-slate-900">
                                {e.classOffering.course?.title
                                  ? `${learnerCourseLabel(e.classOffering.course.title)} (${classCodeLabel(e.classOffering.code ?? '')})`
                                  : (snap?.course?.title ?? classCodeLabel(e.classOffering.code ?? ''))}
                              </p>
                            </div>
                          </div>

                          <p className="text-[11px] leading-relaxed text-slate-600">
                            Đây là chứng chỉ hoàn thành khóa học nội bộ của Smart English Center (không
                            phải chứng chỉ quốc tế TOEIC ETS).
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-emerald-100">
                          <button
                            type="button"
                            onClick={() => handlePrintCertificate(e.id)}
                            className="rounded-lg bg-emerald-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-800"
                          >
                            In / Lưu PDF chứng chỉ
                          </button>
                          <button
                            type="button"
                            onClick={() => setPreviewCert({ enrollmentId: e.id, props: certSheetProps })}
                            className="rounded-lg border border-emerald-300 bg-white px-3.5 py-2 text-xs font-semibold text-emerald-900 hover:bg-emerald-50"
                          >
                            Xem mẫu bằng
                          </button>
                          <Link
                            to={`/certificates/lookup?code=${encodeURIComponent(certificate.certificateCode)}`}
                            className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            Tra cứu &amp; Xác minh
                          </Link>
                        </div>
                      </section>
                      {printingEnrollmentId === e.id && (
                        <div className="hidden print:block">
                          <PrintableCertificateSheet {...certSheetProps} />
                        </div>
                      )}
                    </>
                  ) : revoked && certificate ? (
                    <section className="flex h-full flex-col justify-center gap-2 rounded-2xl border border-rose-200 bg-rose-50/70 p-5">
                      <h3 className="text-sm font-bold text-rose-900">
                        Chứng chỉ {certificate.certificateCode} đã bị thu hồi
                      </h3>
                      <p className="text-xs text-rose-800">
                        Lý do: {certificate.revokeReason || 'Theo quyết định hậu kiểm của Học vụ.'}
                      </p>
                      <Link
                        to={`/certificates/lookup?code=${encodeURIComponent(certificate.certificateCode)}`}
                        className="mt-1 inline-block text-xs font-semibold text-rose-900 underline"
                      >
                        Kiểm tra lịch sử xác minh →
                      </Link>
                    </section>
                  ) : (
                    <section className="flex h-full flex-col justify-center gap-2 rounded-2xl border border-slate-200 bg-slate-50/70 p-5">
                      <h3 className="text-sm font-bold text-slate-900">
                        {readiness?.assessment === 'NOT_EVALUATED' || !readiness?.policy
                          ? 'Chưa có tiêu chuẩn xét chứng chỉ cho lớp này'
                          : readiness?.assessment === 'ELIGIBLE_FOR_REVIEW'
                            ? 'Đã đủ điều kiện — Đang chờ Học vụ duyệt cấp chứng chỉ'
                            : 'Chưa đủ điều kiện cấp chứng chỉ'}
                      </h3>
                      <p className="text-xs leading-relaxed text-slate-600">
                        {readiness?.assessment === 'NOT_EVALUATED' || !readiness?.policy
                          ? 'Bạn vẫn học tập và xem tiến độ chi tiết từng bài học bình thường. Khi Học vụ gắn tiêu chuẩn hoàn thành cho lớp, hệ thống sẽ cập nhật tại đây.'
                          : 'Hệ thống tự động tổng hợp điểm đã công bố, tỷ lệ hoàn thành bài học và chuyên cần để xét duyệt.'}
                      </p>
                    </section>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {/* Compact Certificate Lookup Bar */}
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-2xs print:hidden">
        <div className="space-y-0.5">
          <h2 className="text-sm font-bold text-slate-900">Tra cứu &amp; Xác minh chứng chỉ</h2>
          <p className="text-xs text-slate-500">
            Nhập mã chứng chỉ để kiểm tra tính hợp lệ và lịch sử phát hành.
          </p>
        </div>
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(ev) => {
            ev.preventDefault();
            if (!lookupCode.trim()) return;
            navigate(`/certificates/lookup?code=${encodeURIComponent(lookupCode.trim())}`);
          }}
        >
          <input
            type="text"
            value={lookupCode}
            onChange={(ev) => setLookupCode(ev.target.value)}
            placeholder="Nhập mã (VD: SE-CERT-2026-...)"
            className="w-60 rounded-lg border border-slate-300 px-3 py-1.5 text-xs focus:border-[#4d7439] focus:outline-none"
          />
          <button type="submit" className="btn-secondary text-xs">
            Xác minh mã
          </button>
        </form>
      </section>

      {previewCert && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Xem trước mẫu chứng chỉ"
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/60 p-4 print:hidden"
        >
          <div className="w-full max-w-5xl space-y-3 rounded-2xl bg-slate-100 p-4 shadow-2xl">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-bold text-slate-900">
                Xem trước mẫu bản in Chứng nhận hoàn thành khóa học
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handlePrintCertificate(previewCert.enrollmentId)}
                  className="rounded-lg bg-emerald-700 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800"
                >
                  In / Lưu PDF ngay
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewCert(null)}
                  className="rounded-lg border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Đóng
                </button>
              </div>
            </div>
            <PrintableCertificateSheet {...previewCert.props} />
          </div>
        </div>
      )}
    </main>
  );
}
