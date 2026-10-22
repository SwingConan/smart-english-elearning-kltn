import { FormEvent, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { ConfirmDialog } from '@/components/ui/Feedback';
import { adminApi } from '@/features/admin/api';
import { adminErrorMessage } from '@/features/admin/errors';
import type { PlacementEvaluationCriteria } from '@/features/admin/types';
import { useAdminSessionExpiry } from '@/features/admin/use-admin-session-expiry';

export function AdminEvaluationCriteriaPage() {
  const redirectExpiredSession = useAdminSessionExpiry();
  const [data, setData] = useState<PlacementEvaluationCriteria | null>(null);
  const [foundation, setFoundation] = useState('');
  const [advancing, setAdvancing] = useState('');
  const [loadingError, setLoadingError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void adminApi.criteria.placement
      .get(controller.signal)
      .then((response) => {
        setData(response);
        setFoundation(String(response.bands.find((band) => band.code === 'FOUNDATION')!.maxValue));
        setAdvancing(String(response.bands.find((band) => band.code === 'ADVANCING')!.minValue));
      })
      .catch(async (error: unknown) => {
        if (error instanceof Error && error.name === 'AbortError') return;
        if (await redirectExpiredSession(error)) return;
        setLoadingError(true);
      });
    return () => controller.abort();
  }, [redirectExpiredSession, reloadKey]);

  const validation = useMemo(
    () => validateBoundaries(foundation, advancing),
    [advancing, foundation],
  );

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setSuccess(null);
    setSaveError(null);
    if (validation.error) return;
    setConfirmOpen(true);
  };

  const save = async () => {
    if (validation.foundation === null || validation.advancing === null) return;
    setSaving(true);
    try {
      const saved = await adminApi.criteria.placement.update({
        foundationUpperBoundary: validation.foundation,
        advancingLowerBoundary: validation.advancing,
      });
      setData(saved);
      setFoundation(String(saved.bands.find((band) => band.code === 'FOUNDATION')!.maxValue));
      setAdvancing(String(saved.bands.find((band) => band.code === 'ADVANCING')!.minValue));
      setConfirmOpen(false);
      setSuccess('Đã cập nhật tiêu chí đánh giá. Kết quả đã có được giữ nguyên.');
    } catch (error: unknown) {
      if (await redirectExpiredSession(error)) return;
      setConfirmOpen(false);
      setSaveError(adminErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  if (!data) {
    if (loadingError) {
      return (
        <section className="state-error" role="alert">
          <h1 className="text-xl font-bold">Không thể tải tiêu chí đánh giá đầu vào</h1>
          <p className="mt-2">Cấu hình có thể đang thiếu hoặc không hợp lệ.</p>
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
    }
    return (
      <div
        aria-label="Đang tải tiêu chí đánh giá"
        className="h-80 animate-pulse rounded-2xl bg-slate-200"
        role="status"
      />
    );
  }

  const previewFoundation = validation.foundation ?? 0;
  const previewAdvancing = validation.advancing ?? 100;

  return (
    <section className="mx-auto max-w-5xl">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-600">
        Quản trị học vụ
      </p>
      <h1 className="mt-2 text-3xl font-bold">Tiêu chí đánh giá đầu vào</h1>
      <p className="mt-2 leading-7 text-slate-600">
        Điều chỉnh các ngưỡng phần trăm dùng để phân mức kết quả Placement L&amp;R trong tương lai.
      </p>

      <div className="mt-6 flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-950">
        <AlertTriangle className="mt-0.5 shrink-0" size={20} />
        <p>
          Các ngưỡng này là tỷ lệ nội bộ 0–100, không phải thang điểm TOEIC chính thức. Kết quả đã
          tạo trước đây không bị tính lại.
        </p>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <aside className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm text-slate-500">Tên chính sách</p>
              <h2 className="mt-1 font-bold">{data.policy.name}</h2>
            </div>
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">
              Đang áp dụng
            </span>
          </div>
          <dl className="mt-5 space-y-4 text-sm">
            <div>
              <dt className="text-slate-500">Mã chính sách</dt>
              <dd className="mt-1 break-all font-mono text-xs">{data.policy.code}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Phạm vi</dt>
              <dd className="mt-1 font-medium">Placement Listening &amp; Reading</dd>
            </div>
            <div>
              <dt className="text-slate-500">Cập nhật gần nhất</dt>
              <dd className="mt-1 font-medium">{formatDate(data.policy.updatedAt)}</dd>
            </div>
          </dl>
        </aside>

        <form
          className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
          onSubmit={submit}
        >
          <h2 className="text-lg font-bold">Ngưỡng dùng chung</h2>
          <p className="mt-1 text-sm text-slate-500">
            Khoảng giữa được tự động suy ra, không tạo khe hở hoặc chồng lấn.
          </p>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <BoundaryInput
              label="Ngưỡng kết thúc Nền tảng"
              onChange={(value) => {
                setFoundation(value);
                setSuccess(null);
              }}
              value={foundation}
            />
            <BoundaryInput
              label="Ngưỡng bắt đầu Nâng cao"
              onChange={(value) => {
                setAdvancing(value);
                setSuccess(null);
              }}
              value={advancing}
            />
          </div>
          {validation.error ? (
            <p className="mt-4 text-sm font-medium text-red-700" role="alert">
              {validation.error}
            </p>
          ) : null}
          <div className="mt-6 rounded-2xl bg-slate-50 p-5">
            <h3 className="font-bold">Xem trước khoảng phân mức</h3>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <BandPreview
                label="Nền tảng"
                range={`0 ≤ điểm < ${formatNumber(previewFoundation)}`}
              />
              <BandPreview
                label="Đang phát triển"
                range={`${formatNumber(previewFoundation)} ≤ điểm < ${formatNumber(previewAdvancing)}`}
              />
              <BandPreview
                label="Nâng cao"
                range={`${formatNumber(previewAdvancing)} ≤ điểm ≤ 100`}
              />
            </div>
          </div>
          {saveError ? (
            <p className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-700" role="alert">
              {saveError}
            </p>
          ) : null}
          {success ? (
            <p
              className="mt-5 flex gap-2 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800"
              role="status"
            >
              <CheckCircle2 className="shrink-0" size={18} /> {success}
            </p>
          ) : null}
          <button className="btn-primary mt-6" disabled={Boolean(validation.error)} type="submit">
            Lưu tiêu chí đánh giá
          </button>
        </form>
      </div>
      <ConfirmDialog
        busyLabel="Đang lưu…"
        confirmLabel="Lưu ngưỡng mới"
        description="Thay đổi chỉ áp dụng cho kết quả Placement được tạo sau thời điểm lưu."
        isBusy={saving}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => void save()}
        open={confirmOpen}
        title="Lưu ngưỡng đánh giá mới?"
      />
    </section>
  );
}

function BoundaryInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      <span className="text-sm font-semibold">{label}</span>
      <div className="mt-2 flex items-center rounded-xl border border-slate-300 bg-white focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-100">
        <input
          className="min-w-0 flex-1 rounded-xl px-3 py-2.5 outline-none"
          max="99.99"
          min="0.01"
          onChange={(event) => onChange(event.target.value)}
          step="0.01"
          type="number"
          value={value}
        />
        <span className="pr-3 text-sm text-slate-500">%</span>
      </div>
    </label>
  );
}

function BandPreview({ label, range }: { label: string; range: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <p className="font-semibold">{label}</p>
      <p className="mt-1 text-xs text-slate-600">{range}</p>
    </div>
  );
}

function validateBoundaries(foundationInput: string, advancingInput: string) {
  const foundation = foundationInput.trim() === '' ? null : Number(foundationInput);
  const advancing = advancingInput.trim() === '' ? null : Number(advancingInput);
  if (foundation === null || advancing === null)
    return { foundation, advancing, error: 'Vui lòng nhập đủ hai ngưỡng.' };
  if (!validNumber(foundation) || !validNumber(advancing))
    return {
      foundation,
      advancing,
      error: 'Mỗi ngưỡng phải là số hữu hạn có tối đa hai chữ số thập phân.',
    };
  if (foundation <= 0 || foundation >= advancing || advancing >= 100)
    return {
      foundation,
      advancing,
      error: 'Cần thỏa mãn 0 < ngưỡng Nền tảng < ngưỡng Nâng cao < 100.',
    };
  return { foundation, advancing, error: null };
}

function validNumber(value: number) {
  return Number.isFinite(value) && Number(value.toFixed(2)) === value;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(value);
}
function formatDate(value: string) {
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  );
}
