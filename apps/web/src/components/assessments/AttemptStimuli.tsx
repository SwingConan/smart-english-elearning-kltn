import { useEffect, useState } from 'react';
import { ReadingStimulusRenderer } from '@/components/assessments/ReadingStimulusRenderer';
import type { StudentAttemptStimulus, ToeicSkill } from '@/features/assessments/types';
import { isStructuredReadingTask } from '@/features/assessments/reading-stimulus';

export function AttemptStimuli({
  stimuli,
  stimulusText,
  skill,
  taskCode,
}: {
  stimuli: StudentAttemptStimulus[];
  stimulusText?: string | null;
  skill: ToeicSkill;
  taskCode: string | null;
}) {
  const structured = isStructuredReadingTask(skill, taskCode);
  const [zoomedImage, setZoomedImage] = useState<{ url: string; alt: string } | null>(null);

  useEffect(() => {
    if (!zoomedImage) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setZoomedImage(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [zoomedImage]);

  return (
    <div className="space-y-3">
      {stimulusText &&
        (structured ? (
          <ReadingStimulusRenderer text={stimulusText} />
        ) : (
          <div className="rounded-xl border bg-white p-4 text-sm leading-7">
            <GenericTextStimulus text={stimulusText} />
          </div>
        ))}
      {stimuli.map((stimulus) => (
        <div
          className={stimulus.type === 'TEXT' && structured ? '' : 'rounded-xl border bg-white p-3'}
          key={stimulus.id}
        >
          {stimulus.type === 'TEXT' ? (
            structured && stimulus.textContent ? (
              <ReadingStimulusRenderer text={stimulus.textContent} />
            ) : (
              <GenericTextStimulus text={stimulus.textContent ?? ''} />
            )
          ) : stimulus.type === 'IMAGE' ? (
            <div className="relative">
              <button
                type="button"
                onClick={() =>
                  setZoomedImage({
                    url: stimulus.mediaUrl ?? '',
                    alt: stimulus.altText ?? 'Nội dung câu hỏi',
                  })
                }
                className="absolute right-2 top-2 rounded-lg border border-slate-300 bg-white/95 px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
              >
                Phóng to
              </button>
              <img
                className="mx-auto max-h-[75vh] w-full rounded object-contain cursor-zoom-in"
                onClick={() =>
                  setZoomedImage({
                    url: stimulus.mediaUrl ?? '',
                    alt: stimulus.altText ?? 'Nội dung câu hỏi',
                  })
                }
                src={stimulus.mediaUrl ?? ''}
                alt={stimulus.altText ?? 'Nội dung câu hỏi'}
              />
            </div>
          ) : (
            <audio className="w-full" controls preload="metadata" src={stimulus.mediaUrl ?? ''}>
              Trình duyệt không hỗ trợ phát âm thanh.
            </audio>
          )}
        </div>
      ))}

      {zoomedImage && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={zoomedImage.alt}
          onClick={() => setZoomedImage(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative max-h-[92vh] max-w-5xl overflow-auto rounded-2xl bg-white p-3 shadow-2xl"
          >
            <div className="mb-2 flex items-center justify-between gap-4 border-b border-slate-100 pb-2">
              <span className="truncate text-xs font-semibold text-slate-600">{zoomedImage.alt}</span>
              <button
                type="button"
                onClick={() => setZoomedImage(null)}
                className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-bold text-slate-700 hover:bg-slate-100"
              >
                Đóng
              </button>
            </div>
            <img
              src={zoomedImage.url}
              alt={zoomedImage.alt}
              className="mx-auto max-h-[82vh] w-auto object-contain"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function GenericTextStimulus({ text }: { text: string }) {
  return <p className="whitespace-pre-wrap">{text}</p>;
}
