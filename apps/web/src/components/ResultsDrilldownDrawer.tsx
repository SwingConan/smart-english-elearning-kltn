import { useEffect } from 'react';
import { Link } from 'react-router';

export type ResultsDrilldownDetail = {
  title: string;
  caption: string;
  rows: Array<{ key: string; primary: string; secondary: string; status?: string; href?: string; cta?: string }>;
  filter?: { label: string; attemptIds: string[]; notSubmitted?: boolean };
};

export function ResultsDrilldownDrawer({ detail, onClose, onFilter }: { detail: ResultsDrilldownDetail; onClose: () => void; onFilter: (filter: NonNullable<ResultsDrilldownDetail['filter']>) => void }) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);
  return <div aria-label={detail.title} aria-modal="true" className="fixed inset-0 z-50 flex justify-end bg-slate-950/40" data-testid="results-drilldown" role="dialog">
    <button aria-label="Đóng bảng chi tiết" className="absolute inset-0 cursor-default" onClick={onClose} type="button" />
    <section className="relative h-full w-full overflow-y-auto bg-white p-5 shadow-2xl sm:max-w-lg sm:p-6">
      <div className="flex items-start justify-between gap-4"><div><h2 className="text-xl font-bold">{detail.title}</h2><p className="text-sm text-slate-500">{detail.caption}</p></div><button className="rounded-lg border px-3 py-2" onClick={onClose} type="button">Đóng</button></div>
      <div className="mt-5 space-y-3">{detail.rows.map((row) => <article className="rounded-xl border p-4" key={row.key}><div className="flex flex-wrap items-start justify-between gap-2"><strong>{row.primary}</strong>{row.status ? <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold">{row.status}</span> : null}</div><p className="mt-1 text-sm text-slate-500">{row.secondary}</p>{row.href ? <Link className="mt-2 inline-block font-semibold text-indigo-700" to={row.href}>{row.cta ?? 'Mở hồ sơ'} →</Link> : null}</article>)}{detail.rows.length === 0 ? <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">Không có học viên trong nhóm này.</p> : null}</div>
      {detail.filter ? <button className="mt-5 w-full rounded-lg border border-indigo-600 px-4 py-2 font-semibold text-indigo-700" onClick={() => { onFilter(detail.filter!); onClose(); }} type="button">Lọc bảng theo nhóm này</button> : null}
    </section>
  </div>;
}
