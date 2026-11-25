import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useAuth } from '@/features/auth/auth-context';
import { apiFetch } from '@/lib/api-client';
import { academicApi, type AcademicClass, type Program } from '@/features/academic/api';
import { classLabel } from '@/features/catalog/record-presentation';
import { classCodeLabel } from '@/features/demo/presentation';
import { button, field } from '@/features/class-lms/api';
import { PrintableCertificateSheet } from '@/features/product/PrintableCertificateSheet';

const base = '/v2/certificates';

type GradeComponent =
  | 'OVERALL_PUBLISHED'
  | 'ASSIGNMENT'
  | 'QUIZ'
  | 'REGULAR'
  | 'MIDTERM'
  | 'FINAL'
  | 'WEIGHTED_TOTAL';

type ScoreScale = 'PERCENT_100' | 'SCORE_10';

const COMPONENT_LABELS: Record<GradeComponent, string> = {
  OVERALL_PUBLISHED: 'Trung bình các điểm đã công bố',
  ASSIGNMENT: 'Bài tập Assignment đã công bố',
  QUIZ: 'Quiz luyện tập đã công bố',
  REGULAR: 'Kiểm tra thường kỳ',
  MIDTERM: 'Kiểm tra giữa kỳ',
  FINAL: 'Kiểm tra cuối kỳ',
  WEIGHTED_TOTAL: 'Điểm tổng kết theo tỷ trọng (%)',
};

function formatMetric(value: number | null | undefined, scale?: string, domain?: string) {
  if (value === null || value === undefined) return 'Chưa có dữ liệu';
  if (domain === 'W06_ATTENDANCE' || scale !== 'SCORE_10') return `${value}%`;
  return `${value} / 10`;
}

function criterionBadge(status: string) {
  if (status === 'SATISFIED') return { text: 'Đã đạt', cls: 'bg-emerald-100 text-emerald-900' };
  if (status === 'NOT_MET') return { text: 'Chưa đạt', cls: 'bg-rose-100 text-rose-900' };
  return { text: 'Chưa đủ dữ liệu', cls: 'bg-amber-100 text-amber-900' };
}

const POLICY_STATE_LABELS: Record<string, string> = {
  APPROVED: 'Đã phê duyệt',
  DRAFT: 'Dự thảo',
  REJECTED: 'Từ chối',
};

const CERT_EVENT_LABELS: Record<string, string> = {
  POLICY_CREATED: 'Tạo chính sách',
  POLICY_DRAFT_CREATED: 'Tạo dự thảo chính sách',
  POLICY_UPDATED: 'Cập nhật chính sách',
  POLICY_DRAFT_UPDATED: 'Cập nhật dự thảo chính sách',
  POLICY_SUBMITTED: 'Gửi duyệt chính sách',
  POLICY_APPROVED: 'Phê duyệt chính sách',
  POLICY_REJECTED: 'Từ chối chính sách',
  ENROLLMENT_REVIEWED: 'Xét duyệt hoàn thành',
  CERTIFICATE_REVIEW_RECORDED: 'Ghi nhận xét duyệt điều kiện',
  CERTIFICATE_ISSUED: 'Phát hành chứng chỉ',
  CERTIFICATE_REVOKED: 'Thu hồi chứng chỉ',
};

function cleanPolicyLabel(text?: string | null) {
  return String(text ?? '')
    .replace(/\s*\(W0\d+(?:\/LMS)?\)/gi, '')
    .replace(/\s*\(TEST_DISPOSABLE\)/gi, '')
    .replace(/\bQ03\/Q04\b/gi, 'điểm và chuyên cần')
    .trim();
}

function formatLearnerSub(email?: string | null) {
  const e = String(email ?? '').trim();
  if (!e) return '';
  if (e.endsWith('@example.invalid')) return 'Học viên kiểm thử';
  return e;
}

function summarizeCriteriaCompact(criteria?: any[]) {
  if (!criteria?.length) return null;
  const satisfied = criteria.filter((c) => c.status === 'SATISFIED').length;
  const notMet = criteria.filter((c) => c.status === 'NOT_MET').length;
  const numericParts = criteria
    .filter((c) => c.minNumericValue !== null && c.minNumericValue !== undefined)
    .map((c) => {
      const prefix = c.domain === 'W06_ATTENDANCE' ? 'Chuyên cần' : 'Điểm';
      const val =
        c.observedNumericValue !== null && c.observedNumericValue !== undefined
          ? formatMetric(c.observedNumericValue, c.scale, c.domain)
          : '—';
      return `${prefix} ${val}`;
    });
  const badge =
    satisfied === criteria.length
      ? { text: `Đạt ${satisfied}/${criteria.length}`, cls: 'bg-emerald-100 text-emerald-900' }
      : notMet > 0
        ? { text: `Chưa đạt (${satisfied}/${criteria.length})`, cls: 'bg-rose-100 text-rose-900' }
        : { text: `Thiếu dữ liệu (${satisfied}/${criteria.length})`, cls: 'bg-amber-100 text-amber-900' };
  return { badge, metrics: numericParts.join(' · ') };
}

export function CertificatesWorkspacePage() {
  const { user } = useAuth();
  const [data, setData] = useState<any>();
  const [fallbackPrograms, setFallbackPrograms] = useState<Program[]>([]);
  const [fallbackClasses, setFallbackClasses] = useState<AcademicClass[]>([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  // Policy authoring & draft editing state (no silent 70/80 defaults)
  const [editingPolicyId, setEditingPolicyId] = useState<string | null>(null);
  const [courseId, setCourseId] = useState('');
  const [classOfferingId, setClassOfferingId] = useState('');
  const [code, setCode] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isTestPolicy, setIsTestPolicy] = useState(false);
  const [reason, setReason] = useState('');

  const [includeGrade, setIncludeGrade] = useState(true);
  const [gradeComponent, setGradeComponent] = useState<GradeComponent>('OVERALL_PUBLISHED');
  const [gradeScale, setGradeScale] = useState<ScoreScale>('PERCENT_100');
  const [minGradeValue, setMinGradeValue] = useState('');
  const [weightRegular, setWeightRegular] = useState('');
  const [weightMidterm, setWeightMidterm] = useState('');
  const [weightFinal, setWeightFinal] = useState('');

  const [includeAttendance, setIncludeAttendance] = useState(true);
  const [minAttendanceValue, setMinAttendanceValue] = useState('');

  const [previewData, setPreviewData] = useState<any>();
  const [selectedEnrollment, setSelectedEnrollment] = useState<any>();
  const [printableCert, setPrintableCert] = useState<any>();
  const [revokeReasons, setRevokeReasons] = useState<Record<string, string>>({});
  const [classFilter, setClassFilter] = useState('ALL');
  const [certTab, setCertTab] = useState<'enrollments' | 'policies' | 'audit' | null>(null);
  const [showPolicyForm, setShowPolicyForm] = useState(false);
  const [certSearch, setCertSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [lookupCode, setLookupCode] = useState('');
  const [lookupResult, setLookupResult] = useState<any>();

  const load = useCallback(() => {
    void apiFetch<any>(`${base}/workspace`)
      .then((res) => {
        setData(res);
        setError('');
        setCourseId((prev) => prev || res.courses?.[0]?.id || '');
      })
      .catch(() => {
        setData(undefined);
        setError('Không thể tải không gian quản trị Chuẩn hoàn thành & Chứng chỉ.');
        void Promise.all([
          academicApi.programs('?limit=20').catch(() => ({ data: [] as Program[] })),
          academicApi.classes('?limit=20').catch(() => ({ data: [] as AcademicClass[] })),
        ]).then(([p, c]) => {
          setFallbackPrograms(p.data ?? []);
          setFallbackClasses(c.data ?? []);
        });
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function resetForm() {
    setEditingPolicyId(null);
    setCode('');
    setTitle('');
    setDescription('');
    setReason('');
    setIsTestPolicy(false);
    setIncludeGrade(true);
    setGradeComponent('OVERALL_PUBLISHED');
    setGradeScale('PERCENT_100');
    setMinGradeValue('');
    setWeightRegular('');
    setWeightMidterm('');
    setWeightFinal('');
    setIncludeAttendance(true);
    setMinAttendanceValue('');
    setShowPolicyForm(false);
  }

  function startEditDraft(p: any) {
    setShowPolicyForm(true);
    setEditingPolicyId(p.id);
    setCourseId(p.courseId);
    setClassOfferingId(p.classOfferingId ?? '');
    setCode(p.code);
    setTitle(p.title);
    setDescription(p.description);
    setIsTestPolicy(Boolean(p.isTestPolicy));
    setReason(p.reason ?? '');

    const criteria = (p.criteria ?? []) as any[];
    const gradeCrit = criteria.find((c) => c.domain === 'W03_GRADE');
    if (gradeCrit) {
      setIncludeGrade(true);
      setGradeComponent((gradeCrit.component as GradeComponent) ?? 'OVERALL_PUBLISHED');
      setGradeScale((gradeCrit.scale as ScoreScale) ?? 'PERCENT_100');
      setMinGradeValue(
        gradeCrit.minNumericValue !== undefined && gradeCrit.minNumericValue !== null
          ? String(gradeCrit.minNumericValue)
          : '',
      );
      if (Array.isArray(gradeCrit.weightedComponents)) {
        const reg = gradeCrit.weightedComponents.find((w: any) => w.component === 'REGULAR');
        const mid = gradeCrit.weightedComponents.find((w: any) => w.component === 'MIDTERM');
        const fin = gradeCrit.weightedComponents.find((w: any) => w.component === 'FINAL');
        setWeightRegular(reg ? String(reg.weightPercent) : '');
        setWeightMidterm(mid ? String(mid.weightPercent) : '');
        setWeightFinal(fin ? String(fin.weightPercent) : '');
      }
    } else {
      setIncludeGrade(false);
      setMinGradeValue('');
    }

    const attCrit = criteria.find((c) => c.domain === 'W06_ATTENDANCE');
    if (attCrit) {
      setIncludeAttendance(true);
      setMinAttendanceValue(
        attCrit.minNumericValue !== undefined && attCrit.minNumericValue !== null
          ? String(attCrit.minNumericValue)
          : '',
      );
    } else {
      setIncludeAttendance(false);
      setMinAttendanceValue('');
    }

    setError('');
    setMessage(`Đang chỉnh sửa bản nháp chính sách ${p.code}.`);
  }

  async function runAction(work: () => Promise<unknown>, successText: string) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await work();
      setMessage(successText);
      load();
    } catch (e: any) {
      setError(e?.message || 'Thao tác không thành công; kiểm tra quyền độc lập hoặc điều kiện.');
    } finally {
      setBusy(false);
    }
  }

  function buildCriteriaPayload() {
    const criteria: any[] = [];
    if (includeGrade) {
      const parsedGrade = minGradeValue.trim() === '' ? NaN : Number(minGradeValue);
      const maxScale = gradeScale === 'SCORE_10' ? 10 : 100;
      if (!Number.isFinite(parsedGrade) || parsedGrade < 0 || parsedGrade > maxScale) {
        throw new Error(
          `Vui lòng nhập ngưỡng điểm đạt hợp lệ (0 - ${maxScale} theo thang ${gradeScale === 'SCORE_10' ? 'điểm 10' : '%'}). Hệ thống không tự đặt ngưỡng mặc định.`,
        );
      }

      let weightedComponents: Array<{ component: string; weightPercent: number }> | undefined;
      if (gradeComponent === 'WEIGHTED_TOTAL') {
        const wRows = [
          { component: 'REGULAR', weightPercent: Number(weightRegular || 0) },
          { component: 'MIDTERM', weightPercent: Number(weightMidterm || 0) },
          { component: 'FINAL', weightPercent: Number(weightFinal || 0) },
        ].filter((w) => w.weightPercent > 0);
        const total = wRows.reduce((s, w) => s + w.weightPercent, 0);
        if (wRows.length === 0 || Math.abs(total - 100) > 0.01) {
          throw new Error(
            `Tổng tỷ trọng điểm tổng kết phải bằng đúng 100% (hiện tại: ${total}%).`,
          );
        }
        weightedComponents = wRows;
      }

      criteria.push({
        criterionId: 'CRIT_W03_GRADE',
        domain: 'W03_GRADE',
        label: COMPONENT_LABELS[gradeComponent],
        required: true,
        component: gradeComponent,
        scale: gradeScale,
        minNumericValue: parsedGrade,
        ...(weightedComponents ? { weightedComponents } : {}),
      });
    }

    if (includeAttendance) {
      const parsedAtt = minAttendanceValue.trim() === '' ? NaN : Number(minAttendanceValue);
      if (!Number.isFinite(parsedAtt) || parsedAtt < 0 || parsedAtt > 100) {
        throw new Error(
          'Vui lòng nhập ngưỡng chuyên cần hợp lệ (0 - 100%). Hệ thống không tự đặt ngưỡng mặc định.',
        );
      }
      criteria.push({
        criterionId: 'CRIT_W06_ATTENDANCE',
        domain: 'W06_ATTENDANCE',
        label: 'Tỷ lệ chuyên cần buổi học',
        required: true,
        scale: 'PERCENT_100',
        minNumericValue: parsedAtt,
      });
    }

    criteria.push({
      criterionId: 'CRIT_W07_ENTITLEMENT',
      domain: 'W07_ENTITLEMENT',
      label: 'Hồ sơ ghi danh & học phí hợp lệ',
      required: true,
    });
    return criteria;
  }

  function handleSavePolicy(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    let criteria: any[];
    try {
      criteria = buildCriteriaPayload();
    } catch (err: any) {
      setError(err?.message || 'Cấu hình tiêu chí chưa hợp lệ.');
      return;
    }

    if (editingPolicyId) {
      void runAction(async () => {
        await apiFetch(`${base}/policies/${editingPolicyId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            title: title.trim(),
            description: description.trim(),
            isTestPolicy,
            reason: reason.trim(),
            criteria,
          }),
        });
        resetForm();
      }, 'Đã cập nhật bản nháp chính sách (DRAFT). Cần Học vụ độc lập phê duyệt.');
      return;
    }

    void runAction(async () => {
      await apiFetch(`${base}/policies`, {
        method: 'POST',
        body: JSON.stringify({
          courseId,
          classOfferingId: classOfferingId || null,
          code: code.trim(),
          title: title.trim(),
          description: description.trim(),
          isTestPolicy,
          reason: reason.trim(),
          criteria,
        }),
      });
      resetForm();
    }, 'Đã tạo dự thảo chính sách hoàn thành khóa/lớp (DRAFT). Cần Học vụ độc lập phê duyệt.');
  }

  const filteredEnrollments = (data?.enrollments ?? []).filter((row: any) => {
    if (classFilter !== 'ALL' && row.classOffering?.id !== classFilter) return false;
    const cert = row.certificate;
    const ev = row.evaluation;
    const derivedStatus = cert
      ? cert.state === 'ISSUED'
        ? 'ISSUED'
        : 'REVOKED'
      : ev?.status ?? 'NO_POLICY';
    if (statusFilter !== 'ALL' && derivedStatus !== statusFilter) return false;
    const q = certSearch.trim().toLowerCase();
    if (!q) return true;
    const text = `${row.learner?.fullName ?? ''} ${row.learner?.email ?? ''} ${classCodeLabel(row.classOffering?.code ?? '')} ${row.classOffering?.name ?? ''} ${ev?.policy?.code ?? ''}`.toLowerCase();
    return text.includes(q);
  });
  const activeTab = certTab ?? ((data?.enrollments?.length ?? 0) > 0 ? 'enrollments' : 'policies');

  return (
    <main className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4 rounded-lg border border-slate-200 bg-white p-5 print:hidden">
        <div>
          <p className="inline-flex items-center rounded bg-[#e9f2e4] px-2.5 py-0.5 text-xs font-semibold text-[#2f5d1e]">
            Thiết lập tiêu chí hoàn thành &amp; Cấp chứng chỉ nội bộ
          </p>
          <h1 className="mt-1.5 text-2xl font-bold text-[#e66f2b] sm:text-3xl">
            Chuẩn hoàn thành &amp; Cấp chứng chỉ có quản trị
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Cấu hình tiêu chí đạt khóa, xét duyệt hồ sơ và phát hành hoặc thu hồi chứng chỉ học viên.
          </p>
          <details className="mt-2 text-xs text-slate-500">
            <summary className="cursor-pointer font-semibold text-[#2f5d1e] hover:underline">
              Quy trình xử lý chứng chỉ (Quản lý Học vụ Học viên)
            </summary>
            <p className="mt-1 rounded border border-slate-200 bg-slate-50 px-3 py-2 text-slate-600">
              1. Soạn và phê duyệt chính sách hoàn thành → 2. Xét đạt điều kiện cho học viên đủ ngưỡng → 3. Phát hành chứng chỉ nội bộ với snapshot kết quả bất biến.
            </p>
          </details>
        </div>
        <Link
          className="rounded border border-[#76a35e] bg-[#76a35e] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#5e8a47]"
          to="/certificates/lookup"
        >
          Cổng tra cứu mã chứng chỉ
        </Link>
      </header>

      {error && (
        <div className="space-y-4 print:hidden">
          <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
            {error}
          </p>
          {!data && (
            <section className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 space-y-2">
              <h2 className="font-bold">Tính năng chứng chỉ &amp; điều kiện hoàn thành chưa sẵn sàng</h2>
              <p className="text-xs leading-relaxed">
                Tài khoản hiện chưa được cấp quyền hoặc phân hệ xét hoàn thành chưa được bật trong phiên này.
              </p>
            </section>
          )}
          {!data && (fallbackPrograms.length > 0 || fallbackClasses.length > 0) && (
            <section className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
              <h2 className="text-base font-bold text-[#e66f2b]">
                Chương trình &amp; lớp học hiện có ({fallbackPrograms.length} chương trình · {fallbackClasses.length} lớp)
              </h2>
              <div className="grid gap-3 md:grid-cols-2 text-xs">
                <ul className="space-y-1.5 rounded border border-slate-200 p-3">
                  <li className="font-bold text-slate-800">Chương trình đào tạo</li>
                  {fallbackPrograms.slice(0, 6).map((p) => (
                    <li key={p.id} className="text-slate-700">
                      {p.title} · {p.level}
                    </li>
                  ))}
                </ul>
                <ul className="space-y-1.5 rounded border border-slate-200 p-3">
                  <li className="font-bold text-slate-800">Lớp học áp dụng</li>
                  {fallbackClasses.slice(0, 6).map((cl) => (
                    <li key={cl.id} className="text-slate-700">
                      {cl.code} · {cl.name}
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          )}
        </div>
      )}
      {message && (
        <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 print:hidden">
          {message}
        </p>
      )}

      {printableCert && (
        <div
          aria-label="Bản in chứng chỉ nội bộ Smart English"
          className="space-y-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-2.5 print:hidden">
            <span className="text-xs font-bold text-emerald-900">
              Bản xem trước chứng chỉ · Mã {printableCert.certificateCode}
            </span>
            <div className="flex items-center gap-2">
              <button type="button" className={button} onClick={() => window.print()}>
                In / Lưu PDF
              </button>
              <button
                type="button"
                className="rounded border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
                onClick={() => setPrintableCert(undefined)}
              >
                Đóng bản xem
              </button>
            </div>
          </div>
          <PrintableCertificateSheet
            learnerName={printableCert.immutableSnapshot?.learner?.fullName ?? 'Học viên Smart English'}
            certificateCode={printableCert.certificateCode}
            courseTitle={printableCert.immutableSnapshot?.course?.title ?? 'Khóa học Smart English'}
            classLabel={
              printableCert.immutableSnapshot?.classOffering?.code
                ? `${classCodeLabel(printableCert.immutableSnapshot.classOffering.code)}${
                    printableCert.immutableSnapshot.classOffering.name
                      ? ` · ${printableCert.immutableSnapshot.classOffering.name}`
                      : ''
                  }`
                : printableCert.immutableSnapshot?.classOffering?.name
            }
            issuedAt={printableCert.issuedAt ?? ''}
            isTestPolicy={Boolean(printableCert.isTestPolicy)}
            reviewerName={printableCert.reviewerName}
            issuerName={printableCert.issuerName}
          />
        </div>
      )}

      {data && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 print:hidden">
            <div className="flex flex-wrap gap-2" role="tablist" aria-label="Phân khu chứng chỉ">
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'enrollments'}
                onClick={() => setCertTab('enrollments')}
                className={`rounded-lg border px-3.5 py-2 text-xs font-semibold transition ${
                  activeTab === 'enrollments'
                    ? 'border-[#5f8b48] bg-[#5f8b48] text-white'
                    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                Xét duyệt &amp; Cấp chứng chỉ ({data.enrollments?.length ?? 0})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'policies'}
                onClick={() => setCertTab('policies')}
                className={`rounded-lg border px-3.5 py-2 text-xs font-semibold transition ${
                  activeTab === 'policies'
                    ? 'border-[#5f8b48] bg-[#5f8b48] text-white'
                    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                Chính sách hoàn thành ({data.policies?.length ?? 0})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'audit'}
                onClick={() => setCertTab('audit')}
                className={`rounded-lg border px-3.5 py-2 text-xs font-semibold transition ${
                  activeTab === 'audit'
                    ? 'border-[#5f8b48] bg-[#5f8b48] text-white'
                    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                Tra cứu &amp; Nhật ký ({data.events?.length ?? 0})
              </button>
            </div>
            <div className="flex flex-wrap gap-2 text-xs text-slate-600">
              <span>
                Đủ điều kiện:{' '}
                <strong className="text-emerald-700">
                  {(data.enrollments ?? []).filter((r: any) => r.evaluation?.status === 'ELIGIBLE_FOR_REVIEW' && !r.certificate).length}
                </strong>
              </span>
              <span>·</span>
              <span>
                Đã cấp:{' '}
                <strong className="text-[#2f5d1e]">
                  {(data.enrollments ?? []).filter((r: any) => r.certificate?.state === 'ISSUED').length}
                </strong>
              </span>
            </div>
          </div>

          {activeTab === 'policies' && (() => {
            const isPolicyFormOpen =
              showPolicyForm || Boolean(editingPolicyId) || (data.policies?.length ?? 0) === 0;
            return (
          <div className="space-y-5 print:hidden">
            {isPolicyFormOpen && (
            <form onSubmit={handleSavePolicy} className="workspace-card space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-bold text-slate-900">
                  {editingPolicyId
                    ? 'Chỉnh sửa dự thảo chính sách'
                    : 'Soạn chính sách hoàn thành khóa/lớp'}
                </h2>
                {((data.policies?.length ?? 0) > 0 || editingPolicyId) && (
                  <button
                    type="button"
                    className="rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    onClick={resetForm}
                  >
                    {editingPolicyId ? 'Hủy sửa bản nháp' : 'Đóng biểu mẫu'}
                  </button>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <label className="block text-xs font-semibold text-slate-700">
                  Chương trình
                  <select
                    name="courseId"
                    value={courseId}
                    disabled={Boolean(editingPolicyId)}
                    onChange={(e) => setCourseId(e.target.value)}
                    required
                    className={field}
                  >
                    {data.courses.map((c: any) => (
                      <option key={c.id} value={c.id}>
                        {c.title} ({c.level})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs font-semibold text-slate-700">
                  Áp dụng lớp (tùy chọn)
                  <select
                    name="classOfferingId"
                    value={classOfferingId}
                    disabled={Boolean(editingPolicyId)}
                    onChange={(e) => setClassOfferingId(e.target.value)}
                    className={field}
                  >
                    <option value="">Toàn chương trình</option>
                    {data.classes.map((cl: any) => (
                      <option key={cl.id} value={cl.id}>
                        {classCodeLabel(cl.code)} · {classLabel(cl.name, cl.code)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs font-semibold text-slate-700">
                  Mã chính sách
                  <input
                    name="code"
                    required
                    disabled={Boolean(editingPolicyId)}
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="VD: POL-CLASS-Q05-V1"
                    className={field}
                  />
                </label>
                <label className="block text-xs font-semibold text-slate-700">
                  Tên chính sách
                  <input
                    name="title"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="VD: Chuẩn hoàn thành lớp TOEIC A2"
                    className={field}
                  />
                </label>
              </div>

              <div className="grid gap-3 lg:grid-cols-2">
              <fieldset className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 space-y-2">
                <legend className="px-1 text-xs font-bold text-slate-800">
                  Tiêu chí điểm học tập
                </legend>
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-800">
                  <input
                    type="checkbox"
                    checked={includeGrade}
                    onChange={(e) => setIncludeGrade(e.target.checked)}
                  />
                  Áp dụng tiêu chí điểm
                </label>
                {includeGrade && (
                  <div className="grid gap-2.5 sm:grid-cols-3">
                    <label className="block text-xs font-semibold text-slate-700 sm:col-span-2">
                      Thành phần điểm
                      <select
                        name="gradeComponent"
                        value={gradeComponent}
                        onChange={(e) => setGradeComponent(e.target.value as GradeComponent)}
                        className={field}
                      >
                        {Object.entries(COMPONENT_LABELS).map(([k, lbl]) => (
                          <option key={k} value={k}>
                            {lbl}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-xs font-semibold text-slate-700">
                      Thang điểm
                      <select
                        name="gradeScale"
                        value={gradeScale}
                        onChange={(e) => setGradeScale(e.target.value as ScoreScale)}
                        className={field}
                      >
                        <option value="PERCENT_100">Phần trăm (0–100%)</option>
                        <option value="SCORE_10">Thang 10 (0–10)</option>
                      </select>
                    </label>
                    <label className="block text-xs font-semibold text-slate-700 sm:col-span-3">
                      Ngưỡng điểm đạt ({gradeScale === 'SCORE_10' ? '0 - 10' : '0 - 100%'})
                      <input
                        name="minGrade"
                        type="number"
                        step="0.1"
                        min={0}
                        max={gradeScale === 'SCORE_10' ? 10 : 100}
                        value={minGradeValue}
                        onChange={(e) => setMinGradeValue(e.target.value)}
                        placeholder={
                          gradeScale === 'SCORE_10' ? 'Nhập ngưỡng (VD: 6.5)' : 'Nhập ngưỡng (VD: 65)'
                        }
                        className={field}
                      />
                    </label>
                    {gradeComponent === 'WEIGHTED_TOTAL' && (
                      <div className="sm:col-span-3 grid gap-2 sm:grid-cols-3 rounded-lg border border-indigo-200 bg-indigo-50/50 p-2.5">
                        <label className="block text-xs font-semibold text-slate-700">
                          Thường kỳ (%)
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={weightRegular}
                            onChange={(e) => setWeightRegular(e.target.value)}
                            placeholder="VD: 30"
                            className={field}
                          />
                        </label>
                        <label className="block text-xs font-semibold text-slate-700">
                          Giữa kỳ (%)
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={weightMidterm}
                            onChange={(e) => setWeightMidterm(e.target.value)}
                            placeholder="VD: 30"
                            className={field}
                          />
                        </label>
                        <label className="block text-xs font-semibold text-slate-700">
                          Cuối kỳ (%)
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={weightFinal}
                            onChange={(e) => setWeightFinal(e.target.value)}
                            placeholder="VD: 40"
                            className={field}
                          />
                        </label>
                      </div>
                    )}
                  </div>
                )}
              </fieldset>

              <fieldset className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 space-y-2">
                <legend className="px-1 text-xs font-bold text-slate-800">
                  Tiêu chí chuyên cần
                </legend>
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-800">
                  <input
                    type="checkbox"
                    checked={includeAttendance}
                    onChange={(e) => setIncludeAttendance(e.target.checked)}
                  />
                  Áp dụng tỷ lệ chuyên cần tối thiểu (%)
                </label>
                {includeAttendance && (
                  <label className="block text-xs font-semibold text-slate-700">
                    Chuyên cần tối thiểu (0 - 100%)
                    <input
                      name="minAttendance"
                      type="number"
                      step="0.1"
                      min={0}
                      max={100}
                      value={minAttendanceValue}
                      onChange={(e) => setMinAttendanceValue(e.target.value)}
                      placeholder="Nhập ngưỡng chuyên cần (VD: 70)"
                      className={field}
                    />
                  </label>
                )}
              </fieldset>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs font-semibold text-slate-700">
                Mô tả ngắn điều kiện
                <input
                  name="description"
                  required
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Mô tả điều kiện hoàn thành khóa học (điểm, chuyên cần và ghi danh hợp lệ)."
                  className={field}
                />
              </label>

              <label className="block text-xs font-semibold text-slate-700">
                Lý do ban hành / cập nhật
                <input
                  name="reason"
                  required
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Tối thiểu 10 ký tự (VD: Thiết lập chuẩn hoàn thành theo điểm và chuyên cần)"
                  className={field}
                />
              </label>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <label className="flex items-center gap-2 text-xs font-semibold text-amber-900">
                <input
                  name="isTestPolicy"
                  type="checkbox"
                  checked={isTestPolicy}
                  onChange={(e) => setIsTestPolicy(e.target.checked)}
                />
                Chính sách thử nghiệm nội bộ (gắn nhãn thử nghiệm khi cấp chứng chỉ mẫu)
              </label>
              <button disabled={busy} className={button}>
                {editingPolicyId ? 'Lưu cập nhật dự thảo' : 'Tạo dự thảo chính sách'}
              </button>
              </div>
            </form>
            )}

            <section className="workspace-card space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">
                    Chính sách điều kiện hoàn thành ({data.policies.length})
                  </h2>
                  <p className="text-xs text-slate-600">
                    Bấm &ldquo;Xem thử&rdquo; để đối chiếu nhanh trên danh sách học viên hoặc &ldquo;+ Tạo chính sách mới&rdquo; để soạn chuẩn mới.
                  </p>
                </div>
                {!isPolicyFormOpen && (
                  <button
                    type="button"
                    onClick={() => setShowPolicyForm(true)}
                    className={button}
                  >
                    + Tạo chính sách mới
                  </button>
                )}
              </div>

              {data.policies.length === 0 ? (
                <p className="text-sm text-slate-500">Chưa có chính sách hoàn thành nào.</p>
              ) : (
                <div className="data-table-container">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Chính sách</th>
                        <th>Phạm vi áp dụng</th>
                        <th>Ngưỡng yêu cầu</th>
                        <th>Trạng thái</th>
                        <th className="text-right">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                      {data.policies.map((p: any) => (
                        <tr key={p.id} className="align-top hover:bg-slate-50/70">
                          <td className="px-4 py-3">
                            <p className="font-semibold text-slate-900">
                              {cleanPolicyLabel(p.title)}
                            </p>
                            <p className="mt-0.5 text-[11px] text-slate-500">
                              {p.code} · v{p.version}
                              {p.isTestPolicy ? ' · Chính sách thử nghiệm' : ''}
                            </p>
                          </td>
                          <td className="px-4 py-3">
                            <p className="font-medium text-slate-800">{p.courseTitle}</p>
                            <p className="text-[11px] text-slate-500">
                              {p.classCode ? classCodeLabel(p.classCode) : 'Toàn chương trình'}
                            </p>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1">
                              {(p.criteria ?? []).map((c: any) => (
                                <span
                                  key={c.criterionId}
                                  className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700"
                                >
                                  {c.domain === 'W07_ENTITLEMENT'
                                    ? 'Ghi danh & Học phí'
                                    : `${c.domain === 'W06_ATTENDANCE' ? 'Chuyên cần' : 'Điểm'} ≥ ${formatMetric(c.minNumericValue, c.scale, c.domain)}`}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">
                            <span
                              className={
                                p.state === 'APPROVED'
                                  ? 'badge-published'
                                  : p.state === 'REJECTED'
                                    ? 'badge-rejected'
                                    : 'badge-pending'
                              }
                            >
                              {POLICY_STATE_LABELS[p.state] ?? p.state}
                            </span>
                            <p className="mt-1 text-[11px] text-slate-500">
                              {p.reviewerName ? `Duyệt: ${p.reviewerName}` : `Tạo: ${p.makerName}`}
                            </p>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex flex-wrap justify-end gap-1.5">
                              <button
                                type="button"
                                disabled={busy}
                                className="rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                                onClick={() =>
                                  void apiFetch<any>(`${base}/policies/${p.id}/preview`)
                                    .then((res) => {
                                      setPreviewData(res);
                                      setError('');
                                    })
                                    .catch((err: any) =>
                                      setError(err?.message || 'Không thể tải bản xem trước chính sách.'),
                                    )
                                }
                              >
                                Xem thử
                              </button>
                              {p.state === 'DRAFT' && (
                                <button
                                  type="button"
                                  disabled={busy}
                                  className="rounded border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-800 hover:bg-indigo-100"
                                  onClick={() => startEditDraft(p)}
                                >
                                  Sửa
                                </button>
                              )}
                              {p.state === 'DRAFT' && (
                                <>
                                  <button
                                    type="button"
                                    disabled={busy}
                                    className="rounded border border-[#5f8b48] bg-[#5f8b48] px-2.5 py-1 text-xs font-semibold text-white hover:bg-[#4c7238]"
                                    onClick={() =>
                                      void runAction(
                                        () =>
                                          apiFetch(`${base}/policies/${p.id}/review`, {
                                            method: 'POST',
                                            body: JSON.stringify({
                                              decision: 'APPROVED',
                                              reason:
                                                'Quản lý Học vụ Học viên phê duyệt chính sách hoàn thành sau khi đối chiếu tiêu chí thực tế.',
                                            }),
                                          }),
                                        `Đã phê duyệt chính sách ${p.code}.`,
                                      )
                                    }
                                  >
                                    Phê duyệt
                                  </button>
                                  <button
                                    type="button"
                                    disabled={busy}
                                    className="rounded border border-rose-300 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-800 hover:bg-rose-100"
                                    onClick={() =>
                                      void runAction(
                                        () =>
                                          apiFetch(`${base}/policies/${p.id}/review`, {
                                            method: 'POST',
                                            body: JSON.stringify({
                                              decision: 'REJECTED',
                                              reason:
                                                'Từ chối dự thảo chính sách do cần điều chỉnh lại tiêu chí hoặc tỷ trọng.',
                                            }),
                                          }),
                                        `Đã từ chối dự thảo ${p.code}.`,
                                      )
                                    }
                                  >
                                    Từ chối
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
            );
          })()}

          {activeTab === 'policies' && previewData && (
            <section className="workspace-card border-indigo-200 bg-indigo-50/40 space-y-3 print:hidden">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Xem thử áp dụng: {previewData.policy.code} ({POLICY_STATE_LABELS[previewData.policy.state] ?? previewData.policy.state})
                  </h3>
                  <p className="text-xs text-slate-600">
                    Đối chiếu trên {previewData.sampleCount} học viên:
                    {' '}Đạt điều kiện: <strong>{previewData.summaryCounts?.ELIGIBLE_FOR_REVIEW ?? 0}</strong> ·
                    {' '}Chưa đủ dữ liệu: <strong>{previewData.summaryCounts?.PENDING_EVIDENCE ?? 0}</strong> ·
                    {' '}Chưa đạt: <strong>{previewData.summaryCounts?.NOT_ELIGIBLE ?? 0}</strong>
                  </p>
                </div>
                <button
                  type="button"
                  className="rounded border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700"
                  onClick={() => setPreviewData(undefined)}
                >
                  Đóng xem thử
                </button>
              </div>
              <ul className="grid gap-2 md:grid-cols-2 text-xs">
                {previewData.enrollments.map((pe: any) => (
                  <li key={pe.enrollmentId} className="rounded-xl border border-slate-200 bg-white p-3 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <strong>
                        {pe.learner.fullName} ({classCodeLabel(pe.classOffering.code)})
                      </strong>
                      <span className="rounded bg-slate-100 px-2 py-0.5 font-bold text-slate-800">
                        {pe.statusLabel}
                      </span>
                    </div>
                    {pe.missingEvidence?.length > 0 && (
                      <p className="text-amber-800">{pe.missingEvidence.join(' ')}</p>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {activeTab === 'enrollments' && (
          <section className="workspace-card space-y-4 print:hidden">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  Xét điều kiện hoàn thành &amp; Cấp / Thu hồi chứng chỉ ({filteredEnrollments.length}/{data.enrollments.length})
                </h2>
                <p className="text-xs text-slate-600">
                  Tìm kiếm học viên, lọc theo lớp hoặc trạng thái để kiểm tra điểm, chuyên cần và cấp chứng chỉ nhanh.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="search"
                  placeholder="Tìm tên, email hoặc lớp…"
                  value={certSearch}
                  onChange={(e) => setCertSearch(e.target.value)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs focus:border-[#5f8b48] focus:outline-none"
                />
                <select
                  aria-label="Lọc theo lớp"
                  value={classFilter}
                  onChange={(e) => setClassFilter(e.target.value)}
                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                >
                  <option value="ALL">Tất cả hồ sơ ({data.enrollments.length})</option>
                  {data.classes.map((cl: any) => (
                    <option key={cl.id} value={cl.id}>
                      {classCodeLabel(cl.code)} · {classLabel(cl.name, cl.code)}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Lọc theo trạng thái"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                >
                  <option value="ALL">Mọi trạng thái</option>
                  <option value="ELIGIBLE_FOR_REVIEW">Đủ điều kiện xét duyệt</option>
                  <option value="PENDING_EVIDENCE">Chưa đủ dữ liệu</option>
                  <option value="NOT_ELIGIBLE">Chưa đạt điều kiện</option>
                  <option value="ISSUED">Đã cấp chứng chỉ</option>
                  <option value="REVOKED">Đã thu hồi</option>
                  <option value="NO_POLICY">Chưa gắn chính sách</option>
                </select>
              </div>
            </div>

            {filteredEnrollments.length === 0 ? (
              <p className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                Không có hồ sơ học viên nào khớp bộ lọc hiện tại.
              </p>
            ) : (
              <div className="data-table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Học viên</th>
                      <th>Lớp học</th>
                      <th>Tiêu chí &amp; Thực tế</th>
                      <th>Trạng thái</th>
                      <th className="text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredEnrollments.map((row: any) => {
                      const ev = row.evaluation;
                      const cert = row.certificate;
                      const rev = row.latestReview;
                      const compact = summarizeCriteriaCompact(ev?.evaluation?.criteria);
                      const statusText = cert
                        ? cert.state === 'ISSUED'
                          ? 'Đã cấp chứng chỉ'
                          : 'Đã thu hồi'
                        : ev?.statusLabel ?? 'Chưa có chính sách';
                      const badgeCls =
                        cert?.state === 'ISSUED'
                          ? 'badge-published'
                          : cert?.state === 'REVOKED'
                            ? 'badge-rejected'
                            : ev?.status === 'ELIGIBLE_FOR_REVIEW'
                              ? 'badge-info'
                              : ev?.status === 'NOT_ELIGIBLE'
                                ? 'badge-rejected'
                                : 'badge-pending';

                      return (
                        <tr key={row.enrollmentId} className="align-middle hover:bg-slate-50/70">
                          <td className="px-4 py-3">
                            <p className="font-semibold text-slate-900">{row.learner.fullName}</p>
                            <p className="text-xs text-slate-500">{formatLearnerSub(row.learner.email)}</p>
                          </td>
                          <td className="px-4 py-3 text-xs">
                            <p className="font-semibold text-slate-800">
                              {classCodeLabel(row.classOffering.code)}
                            </p>
                            <p className="max-w-[240px] truncate text-slate-500" title={classLabel(row.classOffering.name, row.classOffering.code)}>
                              {classLabel(row.classOffering.name, row.classOffering.code)}
                            </p>
                          </td>
                          <td className="px-4 py-3 text-xs">
                            {compact ? (
                              <div className="space-y-0.5">
                                {cert?.state === 'ISSUED' && compact.badge.text.startsWith('Thiếu dữ liệu') ? (
                                  <span className="inline-block rounded bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-800">
                                    Đã kiểm tra khi cấp
                                  </span>
                                ) : (
                                  <span className={`inline-block rounded px-2 py-0.5 text-[11px] font-bold ${compact.badge.cls}`}>
                                    {compact.badge.text}
                                  </span>
                                )}
                                {compact.metrics && (
                                  <p className="text-[11px] text-slate-500">{compact.metrics}</p>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-400">Chưa gắn chính sách</span>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">
                            <span className={badgeCls}>{statusText}</span>
                            {cert && (
                              <p className="mt-1 font-mono text-[11px] text-slate-500">
                                {cert.certificateCode}
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex flex-wrap justify-end gap-1.5">
                              <button
                                type="button"
                                className="rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                                onClick={() => setSelectedEnrollment(row)}
                              >
                                Chi tiết
                              </button>
                              {ev?.policy?.id && ev?.status === 'ELIGIBLE_FOR_REVIEW' && !rev && (
                                <button
                                  type="button"
                                  disabled={busy}
                                  className="rounded border border-[#5f8b48] bg-[#5f8b48] px-2.5 py-1 text-xs font-semibold text-white hover:bg-[#4c7238]"
                                  onClick={() =>
                                    void runAction(
                                      () =>
                                        apiFetch(`${base}/reviews`, {
                                          method: 'POST',
                                          body: JSON.stringify({
                                            enrollmentId: row.enrollmentId,
                                            policyId: ev.policy.id,
                                            decision: 'ELIGIBLE',
                                            reason:
                                              'Học vụ xét duyệt học viên đủ toàn bộ điều kiện điểm, chuyên cần và ghi danh.',
                                          }),
                                        }),
                                      `Đã ghi nhận đủ điều kiện cấp chứng chỉ cho ${row.learner.fullName}.`,
                                    )
                                  }
                                >
                                  Xác nhận đạt
                                </button>
                              )}
                              {rev?.decision === 'ELIGIBLE' && !cert && (
                                <button
                                  type="button"
                                  disabled={busy}
                                  className="rounded border border-emerald-600 bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700"
                                  onClick={() =>
                                    void runAction(
                                      () =>
                                        apiFetch(`${base}/issue`, {
                                          method: 'POST',
                                          body: JSON.stringify({
                                            enrollmentId: row.enrollmentId,
                                            reviewId: rev.id,
                                            idempotencyKey: `issue-${row.enrollmentId}-${rev.id}`,
                                            reason:
                                              'Quản lý Học vụ Học viên phát hành chứng chỉ nội bộ với snapshot kết quả bất biến.',
                                          }),
                                        }),
                                      `Đã cấp chứng chỉ cho ${row.learner.fullName}.`,
                                    )
                                  }
                                >
                                  Cấp chứng chỉ
                                </button>
                              )}
                              {cert?.state === 'ISSUED' && (
                                <button
                                  type="button"
                                  className="rounded border border-emerald-600 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-900 hover:bg-emerald-100"
                                  onClick={() => setPrintableCert(cert)}
                                >
                                  Xem &amp; In
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          )}

          {activeTab === 'enrollments' && selectedEnrollment && (
            <div
              role="dialog"
              aria-modal="true"
              aria-label={`Hồ sơ hoàn thành: ${selectedEnrollment.learner.fullName}`}
              className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 print:hidden"
              onClick={() => setSelectedEnrollment(undefined)}
            >
              <section
                className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-xl space-y-4 text-sm"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">
                      Hồ sơ hoàn thành: {selectedEnrollment.learner.fullName}
                    </h3>
                    <p className="text-xs text-slate-600">
                      {classCodeLabel(selectedEnrollment.classOffering?.code ?? '')} ·{' '}
                      {selectedEnrollment.course?.title}
                      {selectedEnrollment.evaluation?.policy
                        ? ` · Chính sách: ${selectedEnrollment.evaluation.policy.code}`
                        : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    onClick={() => setSelectedEnrollment(undefined)}
                  >
                    Đóng
                  </button>
                </div>
                {selectedEnrollment.evaluation?.missingEvidence?.length > 0 && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950 space-y-1">
                    <p className="font-bold">Thông tin còn thiếu / chưa đạt:</p>
                    {selectedEnrollment.evaluation.missingEvidence.map((m: string, idx: number) => (
                      <p key={idx}>• {m}</p>
                    ))}
                  </div>
                )}
                {(selectedEnrollment.evaluation?.evaluation?.criteria ?? []).length > 0 ? (
                  <div className="grid gap-3 sm:grid-cols-3 text-xs">
                    {(selectedEnrollment.evaluation?.evaluation?.criteria ?? []).map((c: any) => {
                      const b = criterionBadge(c.status);
                      return (
                        <div key={c.criterionId} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <strong className="text-slate-900">{cleanPolicyLabel(c.label ?? c.criterionId)}</strong>
                            <span className={`rounded px-1.5 py-0.5 font-semibold ${b.cls}`}>
                              {b.text}
                            </span>
                          </div>
                          {c.minNumericValue !== null && c.minNumericValue !== undefined && (
                            <p className="text-slate-600">
                              Thực tế:{' '}
                              <strong>{formatMetric(c.observedNumericValue, c.scale, c.domain)}</strong> · Ngưỡng:{' '}
                              <strong>{formatMetric(c.minNumericValue, c.scale, c.domain)}</strong>
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                    Lớp học này chưa được gắn chính sách điều kiện hoàn thành. Hãy chuyển sang tab &ldquo;Chính sách hoàn thành&rdquo; để thiết lập.
                  </p>
                )}
                {selectedEnrollment.certificate?.state === 'ISSUED' && (
                  <div className="flex flex-wrap items-center gap-2 rounded-xl border border-rose-200 bg-rose-50/40 p-3">
                    <input
                      type="text"
                      placeholder="Nhập lý do thu hồi chứng chỉ (>= 10 ký tự)"
                      value={revokeReasons[selectedEnrollment.certificate.id] ?? ''}
                      onChange={(e) =>
                        setRevokeReasons((prev) => ({
                          ...prev,
                          [selectedEnrollment.certificate.id]: e.target.value,
                        }))
                      }
                      className="min-w-[240px] flex-1 rounded border border-rose-200 bg-white px-3 py-1.5 text-xs"
                    />
                    <button
                      type="button"
                      disabled={busy}
                      className="rounded border border-rose-600 bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700"
                      onClick={() =>
                        void runAction(
                          () =>
                            apiFetch(`${base}/${selectedEnrollment.certificate.id}/revoke`, {
                              method: 'POST',
                              body: JSON.stringify({
                                reason:
                                  (revokeReasons[selectedEnrollment.certificate.id] ?? '').trim() ||
                                  'Thu hồi chứng chỉ theo quy trình hậu kiểm học vụ có lưu vết kiểm toán.',
                              }),
                            }),
                          `Đã thu hồi chứng chỉ ${selectedEnrollment.certificate.certificateCode}.`,
                        )
                      }
                    >
                      Thu hồi chứng chỉ
                    </button>
                  </div>
                )}
              </section>
            </div>
          )}

          {activeTab === 'audit' && data.events?.length > 0 && (
            <section className="workspace-card space-y-3 print:hidden">
              <h2 className="text-lg font-bold text-slate-900">
                Nhật ký hoạt động chính sách &amp; chứng chỉ ({data.events.length})
              </h2>
              <div className="data-table-container max-h-96 overflow-y-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Loại sự kiện</th>
                      <th>Người thực hiện</th>
                      <th>Nội dung / Lý do</th>
                      <th>Thời gian</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {data.events.slice(0, 30).map((ev: any) => (
                      <tr key={ev.id}>
                        <td className="whitespace-nowrap px-4 py-2 font-semibold text-slate-900">
                          {CERT_EVENT_LABELS[ev.kind] ?? ev.kind}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2 text-slate-700">
                          {ev.actorName ?? 'Hệ thống'}
                        </td>
                        <td className="px-4 py-2 text-slate-600">{ev.reason}</td>
                        <td className="whitespace-nowrap px-4 py-2 text-slate-500">
                          {ev.createdAt ? new Date(ev.createdAt).toLocaleString('vi-VN') : ''}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}

      {(!data || activeTab === 'audit') && (
      <section className="workspace-card space-y-3 print:hidden">
        <h2 className="text-lg font-bold text-slate-900">
          Tra cứu &amp; Xác minh mã chứng chỉ
        </h2>
        <form
          className="flex flex-wrap gap-2.5"
          onSubmit={(e) => {
            e.preventDefault();
            if (!lookupCode.trim()) return;
            void apiFetch<any>(`${base}/lookup/${encodeURIComponent(lookupCode.trim())}`)
              .then((res) => {
                setLookupResult(res);
                setError('');
              })
              .catch(() => {
                setLookupResult(undefined);
                setError('Không tìm thấy mã chứng chỉ tương ứng.');
              });
          }}
        >
          <input
            aria-label="Mã chứng chỉ cần tra cứu"
            placeholder="Nhập mã chứng chỉ (VD: SE-CERT-TEST-2026-...)"
            value={lookupCode}
            onChange={(e) => setLookupCode(e.target.value)}
            className={field + ' max-w-md'}
          />
          <button className={button}>Tra cứu chứng chỉ</button>
        </form>
        {lookupResult && (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm space-y-1.5">
            <p className="font-bold text-slate-900">
              Mã chứng chỉ: {lookupResult.certificateCode} · Trạng thái:{' '}
              {lookupResult.state === 'ISSUED'
                ? 'Đã phát hành'
                : lookupResult.state === 'REVOKED'
                  ? 'Đã thu hồi'
                  : lookupResult.state}
              {lookupResult.isTestPolicy ? ' · Chứng chỉ thử nghiệm' : ''}
            </p>
            <p className="text-xs text-slate-600">
              Học viên: {lookupResult.immutableSnapshot?.learner?.fullName} · Lớp:{' '}
              {lookupResult.immutableSnapshot?.classOffering?.code} · Chương trình:{' '}
              {lookupResult.immutableSnapshot?.course?.title}
            </p>
            {lookupResult.revokeReason && (
              <p className="text-xs font-semibold text-rose-800">
                Lý do thu hồi: {lookupResult.revokeReason}
              </p>
            )}
          </div>
        )}
      </section>
      )}
    </main>
  );
}

export function CertificateLookupPage() {
  const [params] = useSearchParams();
  const [code, setCode] = useState(params.get('code') ?? '');
  const [result, setResult] = useState<any>();
  const [error, setError] = useState('');

  useEffect(() => {
    const initial = params.get('code');
    if (initial) {
      void apiFetch<any>(`${base}/lookup/${encodeURIComponent(initial)}`)
        .then((r) => {
          setResult(r);
          setError('');
        })
        .catch(() => {
          setResult(undefined);
          setError('Không tìm thấy chứng chỉ với mã đã cung cấp.');
        });
    }
  }, [params]);

  return (
    <main className="workspace-page space-y-5 py-6">
      <header className="workspace-header">
        <div>
          <Link
            to="/completion"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:text-emerald-900"
          >
            ← Quay lại Tiến độ &amp; Chứng chỉ
          </Link>
          <p className="mt-2 text-xs font-bold uppercase tracking-wider text-indigo-700">
            Xác minh Chứng chỉ Nội bộ · Smart English Center
          </p>
          <h1 className="mt-1 text-2xl font-extrabold text-slate-900">
            Tra cứu chứng chỉ hoàn thành khóa học
          </h1>
        </div>
      </header>

      <form
        className="workspace-card flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!code.trim()) return;
          void apiFetch<any>(`${base}/lookup/${encodeURIComponent(code.trim())}`)
            .then((r) => {
              setResult(r);
              setError('');
            })
            .catch(() => {
              setResult(undefined);
              setError('Không tìm thấy chứng chỉ với mã đã cung cấp.');
            });
        }}
      >
        <label className="block flex-1 text-sm font-semibold text-slate-700">
          Mã chứng chỉ
          <input
            required
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="SE-CERT-2026-... hoặc SE-CERT-TEST-2026-..."
            className={field}
          />
        </label>
        <button className={button}>Kiểm tra</button>
      </form>

      {error && (
        <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          {error}
        </p>
      )}

      {result && (
        <section className="workspace-card space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xl font-extrabold text-slate-900">{result.certificateCode}</h2>
            <div className="flex items-center gap-2">
              {result.isTestPolicy && (
                <span className="rounded-md bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-900">
                  Minh chứng kiểm thử
                </span>
              )}
              <span
                className={
                  'rounded-md px-2.5 py-1 text-xs font-bold ' +
                  (result.state === 'ISSUED'
                    ? 'bg-emerald-100 text-emerald-900'
                    : 'bg-rose-100 text-rose-900')
                }
              >
                {result.state === 'ISSUED' ? 'Hợp lệ' : 'Đã thu hồi'}
              </span>
            </div>
          </div>
          <p className="text-sm text-slate-700">
            Học viên: <strong>{result.immutableSnapshot?.learner?.fullName}</strong> · Khóa học:{' '}
            <strong>{result.immutableSnapshot?.course?.title}</strong> · Lớp:{' '}
            <strong>{result.immutableSnapshot?.classOffering?.code}</strong>
          </p>
          <p className="text-xs text-slate-500">
            Người xét điều kiện: {result.reviewerName} · Người phát hành: {result.issuerName} · Thời
            điểm cấp: {result.issuedAt ? new Date(result.issuedAt).toLocaleString('vi-VN') : ''}
          </p>
          <p className="text-xs text-slate-600">
            Đây là chứng chỉ hoàn thành khóa học nội bộ của Smart English Center (không phải chứng
            chỉ quốc tế TOEIC ETS).
          </p>
          {result.state === 'REVOKED' && (
            <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-900">
              Chứng chỉ đã bị thu hồi ({result.revokedAt ? new Date(result.revokedAt).toLocaleString('vi-VN') : ''}) bởi {result.revokedByName}. Lý do:{' '}
              {result.revokeReason}
            </p>
          )}
          {result.events?.length > 0 && (
            <div className="pt-2 border-t border-slate-100 space-y-1">
              <p className="text-xs font-bold text-slate-800">Lịch sử trạng thái &amp; kiểm toán:</p>
              <ul className="space-y-1 text-xs text-slate-600">
                {result.events.map((ev: any) => {
                  const eventLabel =
                    ev.kind === 'CERTIFICATE_ISSUED'
                      ? 'Phát hành chứng chỉ'
                      : ev.kind === 'CERTIFICATE_REVOKED'
                        ? 'Thu hồi chứng chỉ'
                        : ev.kind;
                  return (
                    <li key={ev.id}>
                      <strong>{eventLabel}</strong> · {new Date(ev.createdAt).toLocaleString('vi-VN')}
                      {ev.reason ? ` — ${ev.reason}` : ''}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
