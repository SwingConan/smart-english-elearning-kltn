import { FormEvent, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { classAssessmentApi } from '@/features/assessments/api';
import type {
  AssessmentStage,
  ClassAssessmentSummary,
  ClassAssessmentWorkspace,
} from '@/features/assessments/types';
import { useSessionExpiry } from '@/features/auth/use-session-expiry';

const stageLabels: Record<AssessmentStage, string> = {
  PERIODIC: 'Thường kỳ',
  MIDTERM: 'Giữa kỳ',
  FINAL: 'Cuối kỳ',
};
type ScheduleForm = {
  stage: AssessmentStage;
  openAt: string;
  closeAt: string;
  maxAttempts: string;
};

function FlowStep({
  number,
  title,
  description,
  to,
  cta,
}: {
  number: string;
  title: string;
  description: string;
  to: string;
  cta: string;
}) {
  return (
    <article className="rounded-xl border bg-white p-4">
      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-indigo-600 text-sm font-bold text-white">
        {number}
      </span>
      <h2 className="mt-3 font-bold">{title}</h2>
      <p className="mt-1 min-h-10 text-sm text-slate-500">{description}</p>
      <Link className="mt-3 inline-block font-semibold text-indigo-700" to={to}>
        {cta} →
      </Link>
    </article>
  );
}

export function ClassAssessmentManagementPage() {
  const { classOfferingId } = useParams<{ classOfferingId: string }>();
  const redirectExpiredSession = useSessionExpiry();
  const [workspace, setWorkspace] = useState<ClassAssessmentWorkspace | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<ScheduleForm | null>(null);
  const [form, setForm] = useState({
    testId: '',
    stage: 'PERIODIC' as AssessmentStage,
    openAt: '',
    closeAt: '',
    maxAttempts: '1',
  });

  useEffect(() => {
    const controller = new AbortController();
    if (!classOfferingId) return;
    void classAssessmentApi
      .list(classOfferingId, controller.signal)
      .then((data) => {
        setWorkspace(data);
        setForm((current) => ({
          ...current,
          testId: current.testId || data.availableTests[0]?.id || '',
        }));
        setLoadState('ready');
      })
      .catch(async (requestError) => {
        if (requestError instanceof Error && requestError.name === 'AbortError') return;
        if (await redirectExpiredSession(requestError)) return;
        setError('Không thể tải lịch bài kiểm tra của lớp.');
        setLoadState('error');
      });
    return () => controller.abort();
  }, [classOfferingId, redirectExpiredSession, version]);

  const create = async (event: FormEvent) => {
    event.preventDefault();
    if (!classOfferingId || !form.testId) return;
    setBusy(true);
    setError(null);
    try {
      await classAssessmentApi.create(classOfferingId, {
        testId: form.testId,
        stage: form.stage,
        openAt: isoOrNull(form.openAt),
        closeAt: isoOrNull(form.closeAt),
        maxAttemptsOverride: Number(form.maxAttempts),
        isActive: true,
      });
      setVersion((value) => value + 1);
    } catch {
      setError('Không thể giao bài. Hãy kiểm tra thời gian mở/đóng và bài kiểm tra đã chọn.');
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (assessment: ClassAssessmentSummary) => {
    if (!classOfferingId) return;
    setBusy(true);
    setError(null);
    try {
      await classAssessmentApi.update(classOfferingId, assessment.id, {
        isActive: !assessment.isActive,
      });
      setVersion((value) => value + 1);
    } catch {
      setError('Không thể cập nhật trạng thái bài kiểm tra.');
    } finally {
      setBusy(false);
    }
  };

  const beginEdit = (assessment: ClassAssessmentSummary) => {
    setEditingId(assessment.id);
    setEditForm({
      stage: assessment.stage,
      openAt: localDateTime(assessment.openAt),
      closeAt: localDateTime(assessment.closeAt),
      maxAttempts: String(assessment.maxAttemptsOverride ?? assessment.test.maxAttempts),
    });
  };

  const saveEdit = async (assessmentId: string) => {
    if (!classOfferingId || !editForm) return;
    setBusy(true);
    setError(null);
    try {
      await classAssessmentApi.update(classOfferingId, assessmentId, {
        stage: editForm.stage,
        openAt: isoOrNull(editForm.openAt),
        closeAt: isoOrNull(editForm.closeAt),
        maxAttemptsOverride: Number(editForm.maxAttempts),
      });
      setEditingId(null);
      setEditForm(null);
      setVersion((value) => value + 1);
    } catch {
      setError('Không thể lưu lịch. Lịch chỉ được chỉnh sửa trước khi có lượt làm bài.');
    } finally {
      setBusy(false);
    }
  };

  if (loadState === 'loading')
    return (
      <p className="p-8 text-center text-slate-500" role="status">
        Đang tải lịch bài kiểm tra...
      </p>
    );
  if (loadState === 'error' || !workspace)
    return (
      <div
        className="mx-auto max-w-2xl rounded-xl border border-red-200 bg-red-50 p-6 text-red-700"
        role="alert"
      >
        {error}
        <button
          className="ml-3 font-semibold underline"
          onClick={() => {
            setLoadState('loading');
            setError(null);
            setVersion((value) => value + 1);
          }}
          type="button"
        >
          Thử lại
        </button>
      </div>
    );

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <div>
        <h1 className="text-2xl font-bold">
          Lịch kiểm tra của lớp · {workspace.classOffering.name}
        </h1>
        <p className="text-sm text-slate-600">
          {workspace.classOffering.code} · {workspace.classOffering.course.title}
        </p>
        <span className="mt-2 inline-block rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-700">
          Áp dụng cho lớp này
        </span>
      </div>
      <section className="grid gap-3 md:grid-cols-3">
        <FlowStep
          number="1"
          title="Chuẩn bị câu hỏi"
          description="Tạo câu hỏi, đáp án và rubric dùng lại."
          to={`/instructor/courses/${workspace.classOffering.course.id}/question-bank?returnTo=/instructor/classes/${classOfferingId}/assessments`}
        cta="Ngân hàng câu hỏi"
        />
        <FlowStep
          number="2"
          title="Tạo đề kiểm tra"
          description="Sắp xếp phần thi, ngữ liệu và câu hỏi."
          to={`/instructor/courses/${workspace.classOffering.course.id}/tests?returnTo=/instructor/classes/${classOfferingId}/assessments`}
        cta="Đề kiểm tra"
        />
        <FlowStep
          number="3"
          title="Giao đề cho lớp"
          description="Chọn giai đoạn, thời gian và số lượt làm."
          to="#assign-assessment"
          cta="Thiết lập lịch"
        />
      </section>
      {error && (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-red-700" role="alert">
          {error}
        </div>
      )}
      <form
        className="grid gap-4 rounded-2xl border bg-white p-5 shadow-sm md:grid-cols-2"
        id="assign-assessment"
        onSubmit={(event) => void create(event)}
      >
        <div className="md:col-span-2">
          <p className="text-xs font-bold uppercase tracking-wide text-indigo-600">
            1 Chọn đề đã xuất bản · 2 Chọn giai đoạn · 3 Đặt thời gian · 4 Số lượt · 5 Giao cho lớp
          </p>
          <h2 className="mt-2 text-lg font-bold">Giao đề cho lớp</h2>
        </div>
        <label className="text-sm font-medium">
          Đề kiểm tra
          <select
            className="mt-1 w-full rounded border p-2"
            value={form.testId}
            onChange={(event) => setForm({ ...form, testId: event.target.value })}
          >
            {workspace.availableTests.map((test) => (
              <option key={test.id} value={test.id}>
                {test.title} · {test.timeLimitMinutes ?? '—'} phút
              </option>
            ))}
          </select>
        </label>
        <StageField value={form.stage} onChange={(stage) => setForm({ ...form, stage })} />
        <DateField
          label="Mở từ"
          value={form.openAt}
          onChange={(openAt) => setForm({ ...form, openAt })}
        />
        <DateField
          label="Đóng lúc"
          value={form.closeAt}
          onChange={(closeAt) => setForm({ ...form, closeAt })}
        />
        <AttemptsField
          value={form.maxAttempts}
          onChange={(maxAttempts) => setForm({ ...form, maxAttempts })}
        />
        <div className="flex items-end">
          <button
            className="rounded bg-blue-600 px-5 py-2 font-semibold text-white disabled:opacity-50"
            disabled={busy || !form.testId}
          >
            {busy ? 'Đang lưu...' : 'Giao cho lớp'}
          </button>
        </div>
      </form>
      <section>
        <h2 className="mb-3 text-lg font-bold">Lịch kiểm tra của lớp</h2>
        {workspace.assessments.length === 0 ? (
          <div className="rounded-xl border bg-white p-8 text-center text-slate-500">
            Lớp chưa có bài kiểm tra.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {workspace.assessments.map((assessment) => (
              <article className="rounded-xl border bg-white p-5 shadow-sm" key={assessment.id}>
                {editingId === assessment.id && editForm ? (
                  <div className="space-y-3">
                    <h3 className="font-bold">Chỉnh sửa lịch · {assessment.test.title}</h3>
                    <StageField
                      value={editForm.stage}
                      onChange={(stage) => setEditForm({ ...editForm, stage })}
                    />
                    <DateField
                      label="Mở từ"
                      value={editForm.openAt}
                      onChange={(openAt) => setEditForm({ ...editForm, openAt })}
                    />
                    <DateField
                      label="Đóng lúc"
                      value={editForm.closeAt}
                      onChange={(closeAt) => setEditForm({ ...editForm, closeAt })}
                    />
                    <AttemptsField
                      value={editForm.maxAttempts}
                      onChange={(maxAttempts) => setEditForm({ ...editForm, maxAttempts })}
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        className="rounded border px-3 py-2 text-sm"
                        onClick={() => {
                          setEditingId(null);
                          setEditForm(null);
                        }}
                        type="button"
                      >
                        Hủy
                      </button>
                      <button
                        className="rounded bg-blue-600 px-3 py-2 text-sm font-semibold text-white"
                        disabled={busy}
                        onClick={() => void saveEdit(assessment.id)}
                        type="button"
                      >
                        Lưu lịch
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <span className="rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-bold text-indigo-800">
                          {stageLabels[assessment.stage]}
                        </span>
                        <h3 className="mt-2 font-bold">{assessment.test.title}</h3>
                      </div>
                      <span
                        className={`text-xs font-semibold ${assessment.isActive ? 'text-emerald-700' : 'text-slate-500'}`}
                      >
                        {assessment.isActive ? 'Đang hoạt động' : 'Đã tắt'}
                      </span>
                    </div>
                    <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <dt className="text-slate-500">Bài đã nộp</dt>
                        <dd className="font-semibold">{assessment.submissionCount}</dd>
                      </div>
                      <div>
                        <dt className="text-slate-500">Chờ chấm</dt>
                        <dd className="font-semibold text-amber-700">
                          {assessment.pendingGradingCount}
                        </dd>
                      </div>
                    </dl>
                    <p className="mt-3 text-xs text-slate-500">
                      {formatWindow(assessment.openAt, assessment.closeAt)} · tối đa{' '}
                      {assessment.maxAttemptsOverride ?? assessment.test.maxAttempts} lượt
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Link
                        className="rounded bg-indigo-600 px-3 py-2 text-sm font-medium text-white"
                        to={`/instructor/classes/${classOfferingId}/assessments/${assessment.id}/grading`}
                      >
                        Chấm bài
                      </Link>
                      {assessment.attemptCount === 0 && (
                        <button
                          className="rounded border px-3 py-2 text-sm"
                          disabled={busy}
                          onClick={() => beginEdit(assessment)}
                          type="button"
                        >
                          Chỉnh sửa lịch
                        </button>
                      )}
                      <button
                        className="rounded border px-3 py-2 text-sm"
                        disabled={busy}
                        onClick={() => void toggleActive(assessment)}
                        type="button"
                      >
                        {assessment.isActive ? 'Tắt bài' : 'Bật lại'}
                      </button>
                    </div>
                  </>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function StageField({
  value,
  onChange,
}: {
  value: AssessmentStage;
  onChange: (value: AssessmentStage) => void;
}) {
  return (
    <label className="text-sm font-medium">
      Loại đánh giá
      <select
        className="mt-1 w-full rounded border p-2"
        value={value}
        onChange={(event) => onChange(event.target.value as AssessmentStage)}
      >
        {Object.entries(stageLabels).map(([stage, label]) => (
          <option key={stage} value={stage}>
            {label}
          </option>
        ))}
      </select>
    </label>
  );
}
function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="text-sm font-medium">
      {label}
      <input
        className="mt-1 w-full rounded border p-2"
        type="datetime-local"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
function AttemptsField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <label className="text-sm font-medium">
      Số lượt tối đa
      <input
        className="mt-1 w-full rounded border p-2"
        min="1"
        type="number"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
function isoOrNull(value: string) {
  return value ? new Date(value).toISOString() : null;
}
function localDateTime(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}
function formatWindow(openAt: string | null, closeAt: string | null) {
  return `${openAt ? new Date(openAt).toLocaleString('vi-VN') : 'Mở ngay'} → ${closeAt ? new Date(closeAt).toLocaleString('vi-VN') : 'Không giới hạn'}`;
}
