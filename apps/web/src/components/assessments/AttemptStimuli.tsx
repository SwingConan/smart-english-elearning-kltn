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
            <img
              className="mx-auto max-h-96 rounded object-contain"
              src={stimulus.mediaUrl ?? ''}
              alt={stimulus.altText ?? 'Nội dung câu hỏi'}
            />
          ) : (
            <audio className="w-full" controls preload="metadata" src={stimulus.mediaUrl ?? ''}>
              Trình duyệt không hỗ trợ phát âm thanh.
            </audio>
          )}
        </div>
      ))}
    </div>
  );
}

function GenericTextStimulus({ text }: { text: string }) {
  return <p className="whitespace-pre-wrap">{text}</p>;
}
