import { FormEvent, useEffect, useState } from 'react';
import { adminApi } from '@/features/admin/api';
import { adminErrorMessage } from '@/features/admin/errors';
import type { StudyRecommendationPolicy } from '@/features/admin/types';
import { useAdminSessionExpiry } from '@/features/admin/use-admin-session-expiry';

type PolicyForm = {
  weakThreshold: string;
  strongThreshold: string;
  minimumTaskQuestions: string;
  maxRecommendations: string;
};

export function AdminStudyRecommendationPolicyPage() {
  const redirectExpiredSession = useAdminSessionExpiry();
  const [policy, setPolicy] = useState<StudyRecommendationPolicy | null>(null);
  const [form, setForm] = useState<PolicyForm | null>(null);
  const [loadingError, setLoadingError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [errors, setErrors] = useState<Partial<Record<keyof PolicyForm, string>>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void adminApi.studyRecommendationPolicy
      .get(controller.signal)
      .then((data) => {
        setPolicy(data);
        setForm(toForm(data));
      })
      .catch(async (error: unknown) => {
        if (error instanceof Error && error.name === 'AbortError') return;
        if (await redirectExpiredSession(error)) return;
        setLoadingError(true);
      });
    return () => controller.abort();
  }, [redirectExpiredSession, reloadKey]);

  const update = (field: keyof PolicyForm, value: string) => {
    setForm((current) => (current ? { ...current, [field]: value } : current));
    setErrors((current) => ({ ...current, [field]: undefined }));
    setSuccess(null);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form) return;
    const parsed = {
      weakThreshold: Number(form.weakThreshold),
      strongThreshold: Number(form.strongThreshold),
      minimumTaskQuestions: Number(form.minimumTaskQuestions),
      maxRecommendations: Number(form.maxRecommendations),
    };
    const nextErrors: typeof errors = {};
    if (
      !Number.isFinite(parsed.weakThreshold) ||
      parsed.weakThreshold < 0 ||
      parsed.weakThreshold > 100
    )
      nextErrors.weakThreshold = 'Nhập giá trị từ 0 đến 100.';
    if (
      !Number.isFinite(parsed.strongThreshold) ||
      parsed.strongThreshold < 0 ||
      parsed.strongThreshold > 100
    )
      nextErrors.strongThreshold = 'Nhập giá trị từ 0 đến 100.';
    if (
      Number.isFinite(parsed.weakThreshold) &&
      Number.isFinite(parsed.strongThreshold) &&
      parsed.weakThreshold >= parsed.strongThreshold
    )
      nextErrors.strongThreshold = 'Ngưỡng mạnh phải lớn hơn ngưỡng yếu.';
    if (
      !Number.isInteger(parsed.minimumTaskQuestions) ||
      parsed.minimumTaskQuestions < 1 ||
      parsed.minimumTaskQuestions > 20
    )
      nextErrors.minimumTaskQuestions = 'Nhập số nguyên từ 1 đến 20.';
    if (
      !Number.isInteger(parsed.maxRecommendations) ||
      parsed.maxRecommendations < 1 ||
      parsed.maxRecommendations > 5
    )
      nextErrors.maxRecommendations = 'Nhập số nguyên từ 1 đến 5.';
    setErrors(nextErrors);
    setSaveError(null);
    if (Object.keys(nextErrors).length) return;
    setSaving(true);
    try {
      const saved = await adminApi.studyRecommendationPolicy.update(parsed);
      setPolicy(saved);
      setForm(toForm(saved));
      setSuccess('Đã cập nhật tiêu chí gợi ý tự học.');
    } catch (error: unknown) {
      if (await redirectExpiredSession(error)) return;
      setSaveError(adminErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  if (!form || !policy) {
    if (loadingError)
      return (
        <section className="state-error" role="alert">
          <h1 className="text-xl font-bold">Không thể tải tiêu chí gợi ý tự học</h1>
          <p className="mt-2">Vui lòng thử lại.</p>
          <button
            className="btn-secondary mt-4"
            onClick={() => {
              setLoadingError(false);
              setReloadKey((key) => key + 1);
            }}
            type="button"
          >
            Thử lại
          </button>
        </section>
      );
    return (
      <div
        className="h-72 animate-pulse rounded-2xl bg-slate-200"
        role="status"
        aria-label="Đang tải tiêu chí gợi ý tự học"
      />
    );
  }

  return (
    <section className="mx-auto max-w-4xl">
      <h1 className="text-3xl font-bold">Tiêu chí gợi ý tự học</h1>
      <p className="mt-2 leading-7 text-slate-600">
        Điều chỉnh quy tắc xác định dùng cho các gợi ý được tạo trong tương lai.
      </p>
      <div className="mt-6 rounded-2xl border border-indigo-200 bg-indigo-50 p-5">
        <p className="font-semibold text-indigo-950">{policy.name}</p>
        <p className="mt-1 text-sm text-indigo-800">
          Mã chính sách: <code>{policy.code}</code>
        </p>
        <p className="mt-3 text-sm leading-6 text-indigo-900">
          Hệ thống dùng quy tắc xác định, không dùng AI để thay đổi kết quả. Lịch sử đã tạo giữ
          nguyên snapshot chính sách cũ và không bị tính lại khi lưu.
        </p>
      </div>
      <form
        className="mt-6 rounded-2xl border bg-white p-5 shadow-sm sm:p-7"
        onSubmit={(event) => void submit(event)}
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <NumberField
            error={errors.weakThreshold}
            label="Ngưỡng kỹ năng yếu (%)"
            max="100"
            min="0"
            onChange={(value) => update('weakThreshold', value)}
            step="0.01"
            value={form.weakThreshold}
          />
          <NumberField
            error={errors.strongThreshold}
            label="Ngưỡng kỹ năng mạnh (%)"
            max="100"
            min="0"
            onChange={(value) => update('strongThreshold', value)}
            step="0.01"
            value={form.strongThreshold}
          />
          <NumberField
            error={errors.minimumTaskQuestions}
            label="Số câu tối thiểu cho bằng chứng Part"
            max="20"
            min="1"
            onChange={(value) => update('minimumTaskQuestions', value)}
            step="1"
            value={form.minimumTaskQuestions}
          />
          <NumberField
            error={errors.maxRecommendations}
            label="Số gợi ý tối đa"
            max="5"
            min="1"
            onChange={(value) => update('maxRecommendations', value)}
            step="1"
            value={form.maxRecommendations}
          />
        </div>
        {saveError ? (
          <p className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-700" role="alert">
            {saveError}
          </p>
        ) : null}
        {success ? (
          <p className="mt-5 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800" role="status">
            {success}
          </p>
        ) : null}
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            className="btn-primary disabled:cursor-not-allowed disabled:opacity-60"
            disabled={saving}
            type="submit"
          >
            {saving ? 'Đang lưu...' : 'Lưu tiêu chí'}
          </button>
          <p className="text-sm text-slate-500">
            Áp dụng cho lần tạo gợi ý tiếp theo; không sửa lịch sử.
          </p>
        </div>
      </form>
    </section>
  );
}

function NumberField({
  error,
  label,
  ...input
}: {
  error?: string;
  label: string;
  value: string;
  min: string;
  max: string;
  step: string;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      <span className="text-sm font-semibold">{label}</span>
      <input
        aria-invalid={Boolean(error)}
        className="mt-2 w-full rounded-lg border px-3 py-2 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
        max={input.max}
        min={input.min}
        onChange={(event) => input.onChange(event.target.value)}
        step={input.step}
        type="number"
        value={input.value}
      />
      {error ? <span className="mt-1 block text-sm text-red-700">{error}</span> : null}
    </label>
  );
}

function toForm(policy: StudyRecommendationPolicy): PolicyForm {
  return {
    weakThreshold: String(policy.weakThreshold),
    strongThreshold: String(policy.strongThreshold),
    minimumTaskQuestions: String(policy.minimumTaskQuestions),
    maxRecommendations: String(policy.maxRecommendations),
  };
}
