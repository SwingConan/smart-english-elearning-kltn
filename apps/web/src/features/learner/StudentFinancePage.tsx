import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { ArrowRight, ChevronDown, Clock, CreditCard } from 'lucide-react';
import {
  UnifiedStudentFinancePanel,
  type UnifiedFinanceResponse,
} from './UnifiedStudentFinancePanel';
import { learnerFinance, type LearnerFinance } from './finance-api';
import { enrollmentApi } from '@/features/enrollments/api';
import type { EnrollmentView } from '@/features/enrollments/types';
import { learnerClassLabel, learnerCourseLabel } from '@/features/enrollments/presentation';
import { admissionLabel, vnd } from '@/features/admissions/api';
import { schoolDay } from '@/features/class-lms/month';
import { ApiError } from '@/lib/api-client';
import { useAuth } from '@/features/auth/auth-context';

export function StudentFinancePage({ id }: { id?: string }) {
  const { user } = useAuth();
  return <FinanceContent key={`${user?.id}:${id ?? 'list'}`} id={id} />;
}

function FinanceContent({ id }: { id?: string }) {
  const [rows, setRows] = useState<LearnerFinance[]>();
  const [enrollments, setEnrollments] = useState<EnrollmentView[]>([]);
  const [unified, setUnified] = useState<UnifiedFinanceResponse | null>(null);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [busyEnrollmentId, setBusyEnrollmentId] = useState<string | null>(null);
  const [panelRefreshKey, setPanelRefreshKey] = useState(0);
  const [tick, setTick] = useState(0);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let live = true;
    void learnerFinance(id)
      .then((r) => {
        if (live) {
          setRows(r.data);
          setError('');
          setMissing(false);
        }
      })
      .catch((e) => {
        if (live) {
          setMissing(e instanceof ApiError && e.status === 404);
          setError('Không thể tải hồ sơ học phí lúc này.');
        }
      });
    void enrollmentApi
      .listMine()
      .then((r) => {
        if (live) setEnrollments(r);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [id, tick]);

  const unifiedEnrollmentIds = useMemo(
    () => new Set((unified?.receivables ?? []).map((r) => r.enrollmentId)),
    [unified],
  );
  const unifiedClassIds = useMemo(
    () => new Set((unified?.receivables ?? []).map((r) => r.classOffering.id)),
    [unified],
  );

  // Deduplicate pending enrollments so items already managed in the unified tuition ledger are never shown twice.
  const otherPending = useMemo(
    () =>
      enrollments.filter(
        (e) => e.status === 'PENDING_PAYMENT' && !unifiedEnrollmentIds.has(e.id),
      ),
    [enrollments, unifiedEnrollmentIds],
  );

  const otherPendingVnd = useMemo(
    () =>
      otherPending.reduce(
        (sum, e) =>
          sum +
          (typeof e.classOffering.tuitionFeeVnd === 'number' && e.classOffering.tuitionFeeVnd > 0
            ? e.classOffering.tuitionFeeVnd
            : 0),
        0,
      ),
    [otherPending],
  );

  const otherLegacyRows = useMemo(
    () => (rows ?? []).filter((r) => !unifiedClassIds.has(r.class.id)),
    [rows, unifiedClassIds],
  );

  const handleStartPaymentForPending = async (enrollmentId: string) => {
    setBusyEnrollmentId(enrollmentId);
    setActionError('');
    try {
      await enrollmentApi.retryHold(enrollmentId);
      setPanelRefreshKey((k) => k + 1);
      setTick((t) => t + 1);
    } catch (e) {
      setActionError(
        e instanceof ApiError
          ? e.message
          : 'Không thể khởi tạo lệnh giữ chỗ thanh toán cho lớp này lúc này.',
      );
    } finally {
      setBusyEnrollmentId(null);
    }
  };

  if (id) {
    return (
      <main className="workspace-page min-w-0 space-y-6">
        <header className="workspace-header">
          <div className="space-y-2">
            <p className="text-sm font-semibold text-[#4d7439]">Hồ sơ học phí</p>
            <h1 className="text-2xl font-extrabold text-slate-900 sm:text-3xl">
              Chi tiết khoản học phí
            </h1>
          </div>
          <Link className="btn-secondary text-sm" to="/student/finance">
            ← Tất cả học phí
          </Link>
        </header>

        {missing ? (
          <section className="workspace-card space-y-3">
            <h2 className="text-lg font-bold">Không có hồ sơ để hiển thị</h2>
            <p className="text-sm text-slate-600">
              Hồ sơ này không tồn tại hoặc không thuộc tài khoản của bạn.
            </p>
            <Link className="btn-secondary text-sm" to="/student/finance">
              Quay lại Học phí &amp; Thanh toán
            </Link>
          </section>
        ) : error ? (
          <section className="workspace-card space-y-3" role="alert">
            <h2 className="font-bold">Thông tin học phí chưa tải được</h2>
            <p className="text-sm text-slate-600">{error}</p>
            <button
              type="button"
              className="btn-secondary text-sm"
              onClick={() => setTick((t) => t + 1)}
            >
              Thử lại
            </button>
          </section>
        ) : !rows ? (
          <p className="workspace-card text-sm text-slate-600" role="status">
            Đang tải hồ sơ của bạn…
          </p>
        ) : (
          <section
            className="grid items-start gap-4 lg:grid-cols-2"
            aria-label="Hồ sơ học phí của tôi"
          >
            {rows.map((row) => (
              <FinanceRecordCard key={row.id} row={row} detailView />
            ))}
          </section>
        )}
      </main>
    );
  }

  return (
    <main className="workspace-page min-w-0 space-y-6">
      <UnifiedStudentFinancePanel
        key={panelRefreshKey}
        onChanged={() => setTick((t) => t + 1)}
        onLoaded={setUnified}
        pendingEnrollmentCount={otherPending.length}
        pendingEnrollmentVnd={otherPendingVnd}
      />

      {actionError && (
        <div
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900"
        >
          {actionError}
        </div>
      )}

      {otherPending.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Đăng ký lớp khác đang chờ hoàn tất ({otherPending.length})
              </h2>
              <p className="mt-0.5 text-xs text-slate-600">
                Các lớp bạn đã đăng ký trước đó nhưng chưa hoàn tất thanh toán. Bạn có thể tạo mã
                QR thanh toán hoặc xem thông tin lớp.
              </p>
            </div>
          </div>

          <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {otherPending.map((e) => {
              const hasFee = typeof e.classOffering.tuitionFeeVnd === 'number' && e.classOffering.tuitionFeeVnd > 0;
              return (
                <div
                  key={e.id}
                  className="flex flex-wrap items-center justify-between gap-4 px-4 py-3.5"
                >
                  <div className="min-w-0 space-y-0.5">
                    <p className="font-semibold text-slate-900">
                      {learnerClassLabel(
                        e.classOffering.name,
                        e.classOffering.code,
                        e.classOffering.course.title,
                      )}
                    </p>
                    <p className="text-xs text-slate-500">
                      {learnerCourseLabel(e.classOffering.course.title)} ·{' '}
                      <span className="inline-flex items-center gap-1 text-amber-700 font-medium">
                        <Clock size={11} aria-hidden="true" />
                        Chờ hoàn tất học phí
                      </span>
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-sm font-bold text-slate-900">
                      {hasFee ? vnd(e.classOffering.tuitionFeeVnd!) : 'Cập nhật khi tư vấn'}
                    </span>
                    {hasFee ? (
                      <button
                        type="button"
                        disabled={busyEnrollmentId === e.id}
                        onClick={() => void handleStartPaymentForPending(e.id)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                      >
                        <CreditCard size={13} aria-hidden="true" />
                        {busyEnrollmentId === e.id ? 'Đang tạo mã…' : 'Giữ chỗ & Thanh toán'}
                      </button>
                    ) : (
                      <Link
                        to={`/classes/${encodeURIComponent(e.classOffering.id)}`}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        Xem thông tin lớp
                        <ArrowRight size={12} aria-hidden="true" />
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {!error && rows && otherLegacyRows.length > 0 && (
        <details className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs">
          <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold text-slate-700 hover:text-slate-900">
            <span>Hồ sơ tư vấn &amp; học phí bổ sung ({otherLegacyRows.length})</span>
            <ChevronDown size={15} className="text-slate-400" aria-hidden="true" />
          </summary>
          <div className="mt-4 grid items-start gap-4 border-t border-slate-100 pt-4 lg:grid-cols-2">
            {otherLegacyRows.map((row) => (
              <FinanceRecordCard key={row.id} row={row} />
            ))}
          </div>
        </details>
      )}
    </main>
  );
}

function FinanceRecordCard({
  row,
  detailView = false,
}: {
  row: LearnerFinance;
  detailView?: boolean;
}) {
  return (
    <article className="workspace-card min-w-0 space-y-4">
      <div>
        <h2 className="break-words text-lg font-bold text-slate-900">
          {learnerClassLabel(row.class.name, row.class.code)}
        </h2>
        <p className="mt-1 text-sm text-slate-600">{admissionLabel(row.state)}</p>
      </div>
      {row.obligation ? (
        <>
          <dl className="grid gap-3 sm:grid-cols-3">
            <Amount title="Học phí" value={row.obligation.dueVnd} />
            <Amount title="Đã ghi nhận" value={row.obligation.paidVnd} />
            <Amount title="Còn phải thanh toán" value={row.obligation.remainingVnd} />
          </dl>
          <p className="rounded-lg bg-slate-50 p-3 text-sm font-semibold text-slate-700">
            {(
              {
                UNPAID: 'Chưa thanh toán',
                PARTIAL: 'Đã ghi nhận một phần học phí',
                SETTLED: 'Không còn dư nợ theo hồ sơ',
                CREDIT_PENDING: 'Có khoản thừa đang chờ đối soát',
              } as Record<string, string>
            )[row.obligation.state] ?? 'Chờ xác nhận học phí'}
            {row.obligation.dueAt ? ' · Hạn thanh toán: ' + schoolDay(row.obligation.dueAt) : ''}
          </p>
        </>
      ) : (
        <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
          Trung tâm đang cập nhật công nợ cho hồ sơ này.{' '}
          {row.amountVnd !== null && <>Học phí trong hồ sơ: {vnd(row.amountVnd)}.</>}
        </p>
      )}
      {!!row.evidence.length && (
        <div className="space-y-2">
          <h3 className="text-sm font-bold">Chứng từ đã gửi</h3>
          {row.evidence.map((e, i) => (
            <p key={e.id} className="text-sm text-slate-600">
              Chứng từ {i + 1}: {vnd(e.amountVnd)} ·{' '}
              {e.state === 'VERIFY'
                ? 'Đã xác minh'
                : e.state === 'REJECT'
                  ? 'Chưa được chấp nhận'
                  : 'Chờ đối soát'}
            </p>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {!detailView && (
          <Link className="btn-secondary text-sm" to={'/admissions/' + row.id}>
            Xem hồ sơ
          </Link>
        )}
        <Link className="btn-secondary text-sm" to="/student/support">
          Hỗ trợ học phí
        </Link>
      </div>
    </article>
  );
}

function Amount({ title, value }: { title: string; value: number }) {
  return (
    <div className="min-w-0 rounded-lg bg-slate-50 p-3">
      <dt className="text-xs text-slate-500">{title}</dt>
      <dd className="mt-1 break-words text-sm font-bold">{vnd(value)}</dd>
    </div>
  );
}
