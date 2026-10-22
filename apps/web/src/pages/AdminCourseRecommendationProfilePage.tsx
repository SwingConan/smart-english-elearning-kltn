import { FormEvent, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { ConfirmDialog } from '@/components/ui/Feedback';
import { adminApi } from '@/features/admin/api';
import { adminErrorMessage } from '@/features/admin/errors';
import { courseSkillScopeLabel } from '@/features/admin/labels';
import type {
  CourseRecommendationProfileInput,
  CourseRecommendationRow,
  CriterionRuleMode,
  RecommendationSkill,
} from '@/features/admin/types';
import { useAdminSessionExpiry } from '@/features/admin/use-admin-session-expiry';
import { courseLevelLabel } from '@/features/catalog/display';

type CriterionForm = { enabled: boolean; min: string; max: string };
type ProfileForm = {
  isActive: boolean;
  ruleMode: CriterionRuleMode;
  priority: string;
  LISTENING: CriterionForm;
  READING: CriterionForm;
};

export function AdminCourseRecommendationProfilePage() {
  const { courseId = '' } = useParams();
  const redirectExpiredSession = useAdminSessionExpiry();
  const [data, setData] = useState<CourseRecommendationRow | null>(null);
  const [form, setForm] = useState<ProfileForm | null>(null);
  const [loadingError, setLoadingError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void adminApi.criteria.courseRecommendations
      .get(courseId, controller.signal)
      .then((response) => {
        setData(response);
        setForm(toForm(response));
      })
      .catch(async (error: unknown) => {
        if (error instanceof Error && error.name === 'AbortError') return;
        if (await redirectExpiredSession(error)) return;
        setLoadingError(true);
      });
    return () => controller.abort();
  }, [courseId, redirectExpiredSession, reloadKey]);

  const parsed = useMemo(() => (form ? parseForm(form) : { input: null, errors: {} }), [form]);

  const update = <K extends keyof ProfileForm>(key: K, value: ProfileForm[K]) => {
    setForm((current) => (current ? { ...current, [key]: value } : current));
    setSuccess(null);
  };
  const updateCriterion = (skill: RecommendationSkill, value: Partial<CriterionForm>) => {
    setForm((current) =>
      current ? { ...current, [skill]: { ...current[skill], ...value } } : current,
    );
    setSuccess(null);
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setSaveError(null);
    setSuccess(null);
    if (!parsed.input || Object.keys(parsed.errors).length) return;
    setConfirmOpen(true);
  };
  const save = async () => {
    if (!parsed.input) return;
    setSaving(true);
    try {
      const saved = await adminApi.criteria.courseRecommendations.update(courseId, parsed.input);
      setData(saved);
      setForm(toForm(saved));
      setConfirmOpen(false);
      setSuccess('Đã cập nhật tiêu chí gợi ý khóa học.');
    } catch (error: unknown) {
      if (await redirectExpiredSession(error)) return;
      setConfirmOpen(false);
      setSaveError(adminErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  if (!data || !form) {
    if (loadingError)
      return (
        <section className="state-error" role="alert">
          <h1 className="text-xl font-bold">Không thể tải hồ sơ gợi ý khóa học</h1>
          <p className="mt-2">Khóa học có thể không còn tồn tại.</p>
          <button
            className="btn-secondary mt-4"
            onClick={() => {
              setLoadingError(false);
              setReloadKey((key) => key + 1);
            }}
          >
            Thử lại
          </button>
        </section>
      );
    return (
      <div
        aria-label="Đang tải hồ sơ gợi ý khóa học"
        className="h-96 animate-pulse rounded-2xl bg-slate-200"
        role="status"
      />
    );
  }

  return (
    <section className="mx-auto max-w-5xl">
      <Link
        className="inline-flex items-center gap-2 text-sm font-semibold text-indigo-700"
        to="/admin/criteria/course-recommendations"
      >
        <ArrowLeft size={17} /> Danh sách khóa học
      </Link>
      <div className="mt-5 flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-600">
            Tiêu chí gợi ý khóa học
          </p>
          <h1 className="mt-2 text-3xl font-bold">{data.course.title}</h1>
          <p className="mt-2 text-slate-600">
            {courseLevelLabel(data.course.level)} · {courseSkillScopeLabel(data.course.skillScope)}
          </p>
        </div>
        <span
          className={`inline-flex self-start rounded-full px-3 py-1 text-xs font-bold ${data.course.isPublished ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}
        >
          {data.course.isPublished ? 'Đã công bố' : 'Bản nháp'}
        </span>
      </div>
      {!data.course.isPublished ? (
        <div className="mt-5 flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <AlertTriangle className="shrink-0" size={19} />
          <p>
            Hồ sơ vẫn có thể được cấu hình, nhưng khóa học chưa công bố nên không xuất hiện trong
            gợi ý cho học viên.
          </p>
        </div>
      ) : null}

      <form className="mt-6 space-y-6" onSubmit={submit}>
        <section className="rounded-2xl border bg-white p-5 shadow-sm sm:p-7">
          <div className="flex items-start justify-between gap-5">
            <div>
              <h2 className="text-lg font-bold">Tham gia gợi ý</h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                Khi tắt, hệ thống bỏ qua hồ sơ này trong các lần tạo gợi ý tương lai nhưng vẫn giữ
                lịch sử.
              </p>
            </div>
            <label className="inline-flex cursor-pointer items-center gap-2">
              <input
                checked={form.isActive}
                className="size-5 accent-indigo-600"
                onChange={(event) => update('isActive', event.target.checked)}
                type="checkbox"
              />
              <span className="text-sm font-semibold">Cho phép gợi ý</span>
            </label>
          </div>
          {!form.isActive ? (
            <p className="mt-4 rounded-xl bg-slate-100 p-3 text-sm text-slate-700">
              Hồ sơ đang tạm tắt. Tiêu chí đã lưu vẫn được giữ lại.
            </p>
          ) : null}
        </section>

        <section className="grid gap-6 rounded-2xl border bg-white p-5 shadow-sm sm:grid-cols-2 sm:p-7">
          <div>
            <h2 className="text-lg font-bold">Cách kết hợp điều kiện</h2>
            <div className="mt-4 space-y-3">
              <RuleOption
                checked={form.ruleMode === 'ALL'}
                description="Phù hợp khi mọi kỹ năng đã chọn đều nằm trong khoảng cấu hình."
                label="Tất cả điều kiện phải đúng"
                onChange={() => update('ruleMode', 'ALL')}
              />
              <RuleOption
                checked={form.ruleMode === 'ANY'}
                description="Phù hợp khi ít nhất một kỹ năng đã chọn nằm trong khoảng cấu hình."
                label="Chỉ cần một điều kiện đúng"
                onChange={() => update('ruleMode', 'ANY')}
              />
            </div>
          </div>
          <label>
            <span className="text-lg font-bold">Độ ưu tiên</span>
            <span className="mt-1 block text-sm leading-6 text-slate-600">
              Số nhỏ hơn được ưu tiên trước khi nhiều khóa học cùng phù hợp.
            </span>
            <input
              aria-invalid={Boolean(parsed.errors.priority)}
              className="mt-4 w-full rounded-xl border px-3 py-2.5"
              max="10000"
              min="0"
              onChange={(event) => update('priority', event.target.value)}
              step="1"
              type="number"
              value={form.priority}
            />
            {parsed.errors.priority ? (
              <span className="mt-1 block text-sm text-red-700">{parsed.errors.priority}</span>
            ) : null}
          </label>
        </section>

        <section className="rounded-2xl border bg-white p-5 shadow-sm sm:p-7">
          <h2 className="text-lg font-bold">Điều kiện kỹ năng</h2>
          <p className="mt-1 text-sm text-slate-600">
            Chỉ các kỹ năng được bật mới được gửi vào cấu hình. Có thể để trống một đầu khoảng.
          </p>
          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            <CriterionEditor
              error={parsed.errors.LISTENING}
              form={form.LISTENING}
              label="Listening"
              onChange={(value) => updateCriterion('LISTENING', value)}
            />
            <CriterionEditor
              error={parsed.errors.READING}
              form={form.READING}
              label="Reading"
              onChange={(value) => updateCriterion('READING', value)}
            />
          </div>
          {parsed.errors.criteria ? (
            <p className="mt-4 text-sm font-medium text-red-700" role="alert">
              {parsed.errors.criteria}
            </p>
          ) : null}
        </section>

        <section className="rounded-2xl border border-indigo-200 bg-indigo-50 p-5">
          <h2 className="font-bold text-indigo-950">Xem trước quy tắc xác định</h2>
          <p className="mt-3 whitespace-pre-line text-sm leading-7 text-indigo-900">
            {preview(form, parsed.input)}
          </p>
        </section>
        {saveError ? (
          <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700" role="alert">
            {saveError}
          </p>
        ) : null}
        {success ? (
          <p
            className="flex gap-2 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800"
            role="status"
          >
            <CheckCircle2 className="shrink-0" size={18} /> {success}
          </p>
        ) : null}
        <button
          className="btn-primary"
          disabled={!parsed.input || Object.keys(parsed.errors).length > 0}
          type="submit"
        >
          Lưu tiêu chí gợi ý
        </button>
      </form>

      <ConfirmDialog
        busyLabel="Đang lưu…"
        confirmLabel="Lưu tiêu chí"
        description="Thay đổi chỉ ảnh hưởng các gợi ý được tạo trong tương lai."
        isBusy={saving}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => void save()}
        open={confirmOpen}
        title="Lưu tiêu chí gợi ý khóa học?"
      />
    </section>
  );
}

function RuleOption({
  checked,
  label,
  description,
  onChange,
}: {
  checked: boolean;
  label: string;
  description: string;
  onChange: () => void;
}) {
  return (
    <label
      className={`block cursor-pointer rounded-xl border p-4 ${checked ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200'}`}
    >
      <span className="flex items-center gap-2 font-semibold">
        <input checked={checked} name="ruleMode" onChange={onChange} type="radio" />
        {label}
      </span>
      <span className="mt-1 block pl-6 text-sm leading-6 text-slate-600">{description}</span>
    </label>
  );
}
function CriterionEditor({
  label,
  form,
  error,
  onChange,
}: {
  label: string;
  form: CriterionForm;
  error?: string;
  onChange: (value: Partial<CriterionForm>) => void;
}) {
  return (
    <fieldset
      className={`rounded-2xl border p-5 ${form.enabled ? 'border-indigo-300 bg-indigo-50/40' : 'border-slate-200 bg-slate-50'}`}
    >
      <label className="flex items-center gap-2 font-bold">
        <input
          checked={form.enabled}
          className="size-5 accent-indigo-600"
          onChange={(event) => onChange({ enabled: event.target.checked })}
          type="checkbox"
        />
        Dùng điều kiện {label}
      </label>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <label>
          <span className="text-xs font-semibold text-slate-600">Điểm nội bộ tối thiểu</span>
          <input
            className="mt-1 w-full rounded-xl border bg-white px-3 py-2.5 disabled:bg-slate-100"
            disabled={!form.enabled}
            max="100"
            min="0"
            onChange={(event) => onChange({ min: event.target.value })}
            placeholder="Không giới hạn"
            step="0.01"
            type="number"
            value={form.min}
          />
        </label>
        <label>
          <span className="text-xs font-semibold text-slate-600">Điểm nội bộ tối đa</span>
          <input
            className="mt-1 w-full rounded-xl border bg-white px-3 py-2.5 disabled:bg-slate-100"
            disabled={!form.enabled}
            max="100"
            min="0"
            onChange={(event) => onChange({ max: event.target.value })}
            placeholder="Không giới hạn"
            step="0.01"
            type="number"
            value={form.max}
          />
        </label>
      </div>
      {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
    </fieldset>
  );
}

function toForm(row: CourseRecommendationRow): ProfileForm {
  const criterion = (skill: RecommendationSkill): CriterionForm => {
    const saved = row.profile?.criteria.find((item) => item.skill === skill);
    return {
      enabled: Boolean(saved),
      min: saved?.minNormalizedScore == null ? '' : String(saved.minNormalizedScore),
      max: saved?.maxNormalizedScore == null ? '' : String(saved.maxNormalizedScore),
    };
  };
  return {
    isActive: row.profile?.isActive ?? false,
    ruleMode: row.profile?.ruleMode ?? 'ALL',
    priority: String(row.profile?.priority ?? 100),
    LISTENING: criterion('LISTENING'),
    READING: criterion('READING'),
  };
}

function parseForm(form: ProfileForm): {
  input: CourseRecommendationProfileInput | null;
  errors: Record<string, string>;
} {
  const errors: Record<string, string> = {};
  const priority = Number(form.priority);
  if (
    form.priority.trim() === '' ||
    !Number.isInteger(priority) ||
    priority < 0 ||
    priority > 10000
  )
    errors.priority = 'Nhập số nguyên từ 0 đến 10.000.';
  const criteria: CourseRecommendationProfileInput['criteria'] = [];
  (['LISTENING', 'READING'] as const).forEach((skill) => {
    const field = form[skill];
    if (!field.enabled) return;
    const min = field.min.trim() === '' ? null : Number(field.min);
    const max = field.max.trim() === '' ? null : Number(field.max);
    if (min === null && max === null) errors[skill] = 'Nhập ít nhất một ngưỡng.';
    else if ((min !== null && !validScore(min)) || (max !== null && !validScore(max)))
      errors[skill] = 'Điểm phải từ 0 đến 100, tối đa hai chữ số thập phân.';
    else if (min !== null && max !== null && min > max)
      errors[skill] = 'Điểm tối thiểu không được lớn hơn điểm tối đa.';
    else criteria.push({ skill, minNormalizedScore: min, maxNormalizedScore: max });
  });
  if (form.isActive && !form.LISTENING.enabled && !form.READING.enabled)
    errors.criteria = 'Cần ít nhất một điều kiện kỹ năng khi bật gợi ý cho khóa học.';
  return {
    input: Object.keys(errors).length
      ? null
      : { isActive: form.isActive, ruleMode: form.ruleMode, priority, criteria },
    errors,
  };
}
function validScore(value: number) {
  return Number.isFinite(value) && value >= 0 && value <= 100 && Number(value.toFixed(2)) === value;
}
function preview(form: ProfileForm, input: CourseRecommendationProfileInput | null) {
  if (!form.isActive) return 'Hồ sơ đang tạm tắt; hệ thống không dùng quy tắc này cho gợi ý mới.';
  if (!input?.criteria.length) return 'Bật ít nhất một điều kiện hợp lệ để xem trước.';
  const heading = input.ruleMode === 'ALL' ? 'Tất cả điều kiện:' : 'Chỉ cần một điều kiện:';
  const joiner = input.ruleMode === 'ALL' ? '\nvà ' : '\nhoặc ';
  const lines = input.criteria.map(
    (criterion) =>
      `${criterion.skill === 'LISTENING' ? 'Listening' : 'Reading'} từ ${criterion.minNormalizedScore ?? 'không giới hạn'} đến ${criterion.maxNormalizedScore ?? 'không giới hạn'}`,
  );
  return `${heading}\n${lines.join(joiner)}`;
}
