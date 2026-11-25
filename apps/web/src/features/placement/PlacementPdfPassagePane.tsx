import { useState } from 'react';
import { Maximize2, X } from 'lucide-react';
import type { PlacementPdfPassageMatch } from './placement-pdf-passages';

export function PlacementPdfPassagePane({
  passage,
  fallbackText,
}: {
  passage: PlacementPdfPassageMatch;
  fallbackText?: string | null;
}) {
  const [zoomed, setZoomed] = useState<{ url: string; alt: string } | null>(null);

  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5 sm:p-4">
      <p className="text-xs font-bold text-slate-600">{passage.instruction}</p>

      <div className="space-y-3">
        {passage.imageUrls.map((url, idx) => {
          const alt = `${passage.instruction} — Tài liệu ${idx + 1}`;
          return (
            <div
              key={url}
              className="group relative overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 shadow-xs"
            >
              {passage.imageUrls.length > 1 && (
                <span className="mb-1.5 inline-block rounded bg-slate-800 px-2 py-0.5 text-[11px] font-bold text-white">
                  Tài liệu {idx + 1} / {passage.imageUrls.length}
                </span>
              )}
              <img src={url} alt={alt} className="w-full rounded-lg object-contain" />
              <button
                type="button"
                onClick={() => setZoomed({ url, alt })}
                className="absolute right-3 bottom-3 inline-flex items-center gap-1 rounded-lg bg-slate-900/75 px-2.5 py-1 text-xs font-semibold text-white opacity-90 hover:bg-slate-900"
              >
                <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
                Phóng to
              </button>
            </div>
          );
        })}
      </div>

      {fallbackText?.trim() && (
        <details className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">
          <summary className="cursor-pointer font-medium hover:text-slate-800">
            Xem văn bản thô (dự phòng)
          </summary>
          <p className="mt-2 whitespace-pre-line leading-6 text-slate-600">{fallbackText}</p>
        </details>
      )}

      {zoomed && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setZoomed(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-4"
        >
          <button
            type="button"
            aria-label="Đóng ảnh phóng to"
            onClick={() => setZoomed(null)}
            className="fixed top-4 right-4 rounded-full bg-white/15 p-2 text-white hover:bg-white/25"
          >
            <X className="h-6 w-6" />
          </button>
          <img
            src={zoomed.url}
            alt={zoomed.alt}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[92vh] max-w-[95vw] rounded-lg bg-white object-contain p-1 shadow-2xl"
          />
        </div>
      )}
    </div>
  );
}
