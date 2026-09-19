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

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">System Status</h1>
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
          API unavailable: {error}
        </div>
      ) : state ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
          <div>Status: {state.status}</div>
          <div>Service: {state.service}</div>
          <div>Timestamp: {state.timestamp}</div>
        </div>
      ) : (
        <p className="text-slate-500">Checking API...</p>
      )}
    </section>
  );
}
