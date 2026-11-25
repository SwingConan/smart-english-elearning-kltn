import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';

type HealthResponse = {
  status: string;
  service: string;
  timestamp: string;
};

export function SystemStatusPage() {
  const [state, setState] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    apiFetch<HealthResponse>('/health')
      .then((data) => {
        if (!cancelled) setState(data);
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : 'Unknown error');
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const formattedTime = state?.timestamp
    ? new Intl.DateTimeFormat('vi-VN', {
        timeZone: 'Asia/Ho_Chi_Minh',
        dateStyle: 'short',
        timeStyle: 'medium',
      }).format(new Date(state.timestamp))
    : '';

  return (
    <section className="mx-auto max-w-3xl space-y-4 px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-bold text-slate-900">Trạng thái hệ thống</h1>
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Máy chủ tạm thời chưa phản hồi: {error}
        </div>
      ) : state ? (
        <div className="space-y-1.5 rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-950">
          <div>
            <strong>Tình trạng:</strong>{' '}
            {state.status === 'ok' ? 'Hoạt động bình thường' : state.status}
          </div>
          <div>
            <strong>Dịch vụ:</strong> Smart English Learning API
          </div>
          <div>
            <strong>Cập nhật lúc:</strong> {formattedTime} (GMT+7)
          </div>
        </div>
      ) : (
        <p className="text-sm text-slate-500">Đang kiểm tra kết nối hệ thống…</p>
      )}
    </section>
  );
}
