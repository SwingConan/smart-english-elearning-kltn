import { useEffect, useId, useRef, useState } from 'react';
import { LockKeyhole, ShieldCheck } from 'lucide-react';
import type { OperationsWorkbenchPort, OperationsWorkbenchSelection } from './contracts';
import type { OperationsWorkbenchResult } from '../../../../api/src/modules/operations/operations-workbench.contracts';

import { unavailableWorkbench } from './model';
function safeOutcome(r: OperationsWorkbenchResult): { state: string; reason: string } {
  if (
    !r ||
    r.runtimeAuthorized !== false ||
    r.mutationPerformed !== false ||
    r.exportPerformed !== false ||
    r.auditPersisted !== false ||
    r.guard?.runtimeAuthorized !== false ||
    r.guard.assurance !== 'OFFLINE_CONSISTENCY_ONLY' ||
    r.guard.requiresServerVerification !== true ||
    !['CONDITIONS_MET_OFFLINE', 'DENIED', 'BLOCKED'].includes(r.guard.decision) ||
    !/^[A-Z][A-Z0-9_]{0,95}$/.test(r.guard.reason)
  )
    return { state: 'BLOCKED', reason: 'UNVERIFIED_PREFLIGHT_RESULT' };
  return { state: r.guard.decision, reason: r.guard.reason };
}
type State = {
  key: string;
  port: OperationsWorkbenchPort;
  pending: boolean;
  outcome: ReturnType<typeof safeOutcome> | null;
};

/** Checking conditions is never saving/publishing/exporting. In-memory DI is for
 * offline verification only; it cannot establish runtime grants or connectivity.
 */
export function OperationsPreflight({
  port = unavailableWorkbench,
  selection,
  label = 'Kiểm tra điều kiện offline',
}: {
  port?: OperationsWorkbenchPort;
  selection: OperationsWorkbenchSelection | null;
  label?: string;
}) {
  const description = useId();
  const key = JSON.stringify(selection);
  const [state, setState] = useState<State | null>(null);
  const sequence = useRef(0);
  const inFlight = useRef(false);
  useEffect(
    () => () => {
      sequence.current++;
      inFlight.current = false;
    },
    [key, port],
  );
  const current = state?.key === key && state.port === port ? state : null;
  const pending = current?.pending === true;
  const unavailable = port.mode !== 'IN_MEMORY_ONLY' || !selection;
  async function check() {
    if (unavailable || inFlight.current || !selection) return;
    const generation = ++sequence.current;
    inFlight.current = true;
    setState({ key, port, pending: true, outcome: null });
    try {
      const outcome = safeOutcome(await port.check(selection));
      if (generation === sequence.current) setState({ key, port, pending: false, outcome });
    } catch {
      if (generation === sequence.current)
        setState({
          key,
          port,
          pending: false,
          outcome: { state: 'BLOCKED', reason: 'PREFLIGHT_UNAVAILABLE' },
        });
    } finally {
      if (generation === sequence.current) inFlight.current = false;
    }
  }
  return (
    <section
      aria-label={label}
      className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4"
    >
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
        <ShieldCheck size={17} aria-hidden="true" />
        {label}
      </div>
      <p id={description} className="text-xs leading-relaxed text-slate-600">
        Chỉ đối chiếu contract, quyền và revision bằng bộ kiểm tra offline. Không lưu, duyệt, công
        bố, đổi cấu hình hoặc xuất file. Quyền server vẫn chưa xác minh.
      </p>
      {unavailable && (
        <p className="text-xs text-slate-600">
          Chưa khả dụng · Chưa có cấu hình kiểm tra phù hợp với lựa chọn hiện tại.
        </p>
      )}
      <button
        type="button"
        onClick={() => void check()}
        disabled={unavailable || pending}
        aria-busy={pending}
        aria-describedby={description}
        className="btn-secondary inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <LockKeyhole size={15} aria-hidden="true" />
        {pending ? 'Đang kiểm tra điều kiện…' : label}
      </button>
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="space-y-1 text-sm [overflow-wrap:anywhere]"
      >
        {current?.outcome && (
          <>
            <p className="font-semibold">
              {current.outcome.state === 'CONDITIONS_MET_OFFLINE'
                ? 'Điều kiện nhất quán offline — chưa được phép thực thi'
                : current.outcome.state === 'DENIED'
                  ? 'Bị từ chối — kiểm tra quyền và phạm vi hiện hành'
                  : 'Bị chặn — chưa đủ bằng chứng hoặc binding'}
            </p>
            <p className="font-mono text-xs text-slate-600">{current.outcome.reason}</p>
          </>
        )}
      </div>
    </section>
  );
}
