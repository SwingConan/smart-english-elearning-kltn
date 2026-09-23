import { type FormEvent, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { adaptivePolicyApi } from '@/features/adaptive/api';
import type { AdaptivePolicy, AdaptivePolicyInput } from '@/features/adaptive/types';
import { useSessionExpiry } from '@/features/auth/use-session-expiry';

export function AdaptivePolicyPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const redirectExpiredSession = useSessionExpiry();
  const saveInFlight = useRef(false);
  const [policy, setPolicy] = useState<AdaptivePolicy | null>(null);
  const [remedialValue, setRemedialValue] = useState('');
  const [progressionValue, setProgressionValue] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    async function loadPolicy() {
      if (!courseId) {
        setLoadError('Không thể xác định khóa học.');
        setLoading(false);
        return;
      }

      try {
        const loaded = await adaptivePolicyApi.get(courseId, controller.signal);
        setPolicy(loaded);
        setRemedialValue(String(loaded.remedialThreshold));
        setProgressionValue(String(loaded.progressionThreshold));
        setLoadError(null);
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return;
        if (await redirectExpiredSession(error)) return;
        setLoadError('Không thể tải Adaptive Policy. Vui lòng thử lại.');
      } finally {
        setLoading(false);
      }
    }

    void loadPolicy();
    return () => controller.abort();
  }, [courseId, redirectExpiredSession]);

  async function savePolicy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!courseId || saveInFlight.current) return;

    const validation = validatePolicy(remedialValue, progressionValue);
    if ('error' in validation) {
      setValidationError(validation.error);
      setSaveError(null);
      setMessage(null);
      return;
    }

    saveInFlight.current = true;
    setSaving(true);
    setValidationError(null);
    setSaveError(null);
    setMessage(null);

    try {
      const saved = await adaptivePolicyApi.update(courseId, validation.input);
      setPolicy(saved);
      setRemedialValue(String(saved.remedialThreshold));
      setProgressionValue(String(saved.progressionThreshold));
      setMessage('Đã lưu Adaptive Policy cho khóa học.');
    } catch (error) {
      if (await redirectExpiredSession(error)) return;
      setSaveError('Không thể lưu Adaptive Policy. Các giá trị bạn nhập vẫn được giữ lại.');
    } finally {
      saveInFlight.current = false;
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Adaptive Learning Policy</h1>
          <p className="mt-1 text-sm text-slate-600">
            Cấu hình ngưỡng xác suất mastery từ 0 đến 1 cho khóa học.
          </p>
        </div>
        <Link className="rounded border px-4 py-2 text-sm" to="/instructor/teaching">
          Quay lại
        </Link>
      </div>

      {loading ? <p className="py-10 text-center">Đang tải Adaptive Policy...</p> : null}
      {!loading && loadError ? (
        <p className="rounded bg-red-50 p-4 text-red-700" role="alert">
          {loadError}
        </p>
      ) : null}

      {!loading && policy ? (
        <>
          <section className="rounded-lg border bg-white p-5 shadow-sm" aria-label="Nguồn policy">
            {policy.source === 'DEFAULT' ? (
              <p className="rounded bg-amber-50 p-3 text-sm text-amber-800">
                <strong>DEFAULT:</strong> Đây là giá trị mặc định hiện tại; khóa học chưa có policy
                riêng được lưu.
              </p>
            ) : (
              <p className="rounded bg-green-50 p-3 text-sm text-green-800">
                <strong>SAVED:</strong> Policy riêng của khóa học đã được lưu.
              </p>
            )}

            <form className="mt-5 space-y-4" onSubmit={(event) => void savePolicy(event)}>
              <div>
                <label className="block text-sm font-medium" htmlFor="remedial-threshold">
                  Remedial Threshold
                </label>
                <input
                  className="mt-1 w-full rounded border px-3 py-2"
                  id="remedial-threshold"
                  max="1"
                  min="0"
                  onChange={(event) => setRemedialValue(event.target.value)}
                  required
                  step="0.01"
                  type="number"
                  value={remedialValue}
                />
                <p className="mt-1 text-xs text-slate-500">Ví dụ: 0.4 tương đương 40%.</p>
              </div>

              <div>
                <label className="block text-sm font-medium" htmlFor="progression-threshold">
                  Progression Threshold
                </label>
                <input
                  className="mt-1 w-full rounded border px-3 py-2"
                  id="progression-threshold"
                  max="1"
                  min="0"
                  onChange={(event) => setProgressionValue(event.target.value)}
                  required
                  step="0.01"
                  type="number"
                  value={progressionValue}
                />
                <p className="mt-1 text-xs text-slate-500">Ví dụ: 0.8 tương đương 80%.</p>
              </div>

              {validationError ? (
                <p className="rounded bg-red-50 p-3 text-sm text-red-700" role="alert">
                  {validationError}
                </p>
              ) : null}
              {saveError ? (
                <p className="rounded bg-red-50 p-3 text-sm text-red-700" role="alert">
                  {saveError}
                </p>
              ) : null}
              {message ? (
                <p className="rounded bg-green-50 p-3 text-sm text-green-700" role="status">
                  {message}
                </p>
              ) : null}

              <button
                className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
                disabled={saving}
                type="submit"
              >
                {saving ? 'Đang lưu...' : 'Lưu policy'}
              </button>
            </form>
          </section>

          <section className="rounded-lg border bg-white p-5 shadow-sm">
            <h2 className="font-semibold">Các mức observed mastery</h2>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-700">
              <li>Thấp hơn Remedial Threshold: Needs remediation.</li>
              <li>Từ Remedial Threshold đến dưới Progression Threshold: Needs reinforcement.</li>
              <li>Từ Progression Threshold trở lên: Progression ready.</li>
            </ul>
            <p className="mt-4 text-sm text-slate-700">
              Skill chưa được đánh giá giữ trạng thái UNASSESSED, không tự động được xem là cần
              remediation hoặc progression-ready.
            </p>
            <p className="mt-2 text-sm text-slate-700">
              Một prerequisite chỉ được xem là đạt khi có observed mastery bằng hoặc cao hơn
              Progression Threshold.
            </p>
          </section>
        </>
      ) : null}
    </div>
  );
}

function validatePolicy(
  remedialValue: string,
  progressionValue: string,
): { input: AdaptivePolicyInput } | { error: string } {
  if (!remedialValue.trim() || !progressionValue.trim()) {
    return { error: 'Cả hai ngưỡng đều bắt buộc.' };
  }

  const remedialThreshold = Number(remedialValue);
  const progressionThreshold = Number(progressionValue);
  if (!Number.isFinite(remedialThreshold) || !Number.isFinite(progressionThreshold)) {
    return { error: 'Các ngưỡng phải là số hữu hạn.' };
  }
  if (
    remedialThreshold < 0 ||
    remedialThreshold > 1 ||
    progressionThreshold < 0 ||
    progressionThreshold > 1
  ) {
    return { error: 'Các ngưỡng phải nằm trong khoảng từ 0 đến 1.' };
  }
  if (remedialThreshold >= progressionThreshold) {
    return { error: 'Remedial Threshold phải nhỏ hơn Progression Threshold.' };
  }

  return { input: { remedialThreshold, progressionThreshold } };
}
