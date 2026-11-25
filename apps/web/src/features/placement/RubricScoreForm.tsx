import { useState } from 'react';
import type { WorkflowReview } from './workflow-api';

export type CriterionScore = { code: string; score: number; evidence: string; feedback: string };
export type RubricScores = Record<string, CriterionScore[]>;
type RubricTask = {
  groupId: string;
  criteria: { code: string; descriptor: string; max: number }[];
};

// Every field is derived from the pinned, independently approved rubric. The server
// still validates bounds, original evidence receipts, assignment and publication.
export function RubricScoreForm({
  review,
  rubricId,
  skill,
  busy,
  onSubmit,
}: {
  review: WorkflowReview;
  rubricId: string;
  skill: string;
  busy: boolean;
  onSubmit: (scores: RubricScores, reason: string) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState<
    Record<string, { score: string; evidence: string; feedback: string }>
  >({});
  const [reason, setReason] = useState('');
  const [attest, setAttest] = useState(false);
  const rubric = review.rubrics.find((r) => r.id === rubricId);
  const tasks =
    (rubric?.body?.tasks as RubricTask[] | undefined)?.filter((t) =>
      review.tasks.some((q) => q.groupId === t.groupId && q.skill === skill),
    ) ?? [];
  const entries = tasks.flatMap((t) =>
    t.criteria.map((c) => ({ ...c, groupId: t.groupId, key: `${t.groupId}:${c.code}` })),
  );
  const valid =
    entries.length > 0 &&
    entries.every((c) => {
      const d = draft[c.key];
      return (
        d &&
        d.score.trim() !== '' &&
        Number.isFinite(Number(d.score)) &&
        Number(d.score) >= 0 &&
        Number(d.score) <= c.max &&
        d.evidence.trim().length >= 10 &&
        d.feedback.trim().length >= 10
      );
    });
  const update = (key: string, field: 'score' | 'evidence' | 'feedback', value: string) => {
    setDraft((old) => ({
      ...old,
      [key]: { ...(old[key] ?? { score: '', evidence: '', feedback: '' }), [field]: value },
    }));
    setAttest(false);
  };
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!valid || !attest || busy || reason.trim().length < 10) return;
        const scores: RubricScores = Object.fromEntries(
          tasks.map((t) => [
            t.groupId,
            t.criteria.map((c) => {
              const d = draft[`${t.groupId}:${c.code}`];
              return {
                code: c.code,
                score: Number(d.score),
                evidence: d.evidence.trim(),
                feedback: d.feedback.trim(),
              };
            }),
          ]),
        );
        void onSubmit(scores, reason.trim()).then((saved) => {
          if (saved) setAttest(false);
        });
      }}
    >
      {!tasks.length && <p role="status">Chọn rubric đã duyệt có tiêu chí cho kỹ năng này.</p>}
      {tasks.map((task, index) => (
        <fieldset key={task.groupId} disabled={busy} className="space-y-3 rounded-lg border p-4">
          <legend>
            {skill} · Bài {index + 1}
          </legend>
          <p>{review.tasks.find((q) => q.groupId === task.groupId)?.prompt}</p>
          {task.criteria.map((c) => {
            const key = `${task.groupId}:${c.code}`,
              d = draft[key];
            return (
              <div key={c.code} className="space-y-2 border-t pt-3">
                <h3 className="font-semibold">
                  {c.code} · {c.descriptor}
                </h3>
                <label className="block">
                  Điểm {c.code} · Bài {index + 1} (0–{c.max})
                  <input
                    className="w-full rounded-lg border p-3"
                    type="number"
                    min={0}
                    max={c.max}
                    step="any"
                    required
                    value={d?.score ?? ''}
                    onChange={(e) => update(key, 'score', e.target.value)}
                  />
                </label>
                <label className="block">
                  Chứng cứ {c.code} · Bài {index + 1}
                  <textarea
                    className="w-full rounded-lg border p-3"
                    required
                    minLength={10}
                    value={d?.evidence ?? ''}
                    onChange={(e) => update(key, 'evidence', e.target.value)}
                  />
                </label>
                <label className="block">
                  Phản hồi {c.code} · Bài {index + 1}
                  <textarea
                    className="w-full rounded-lg border p-3"
                    required
                    minLength={10}
                    value={d?.feedback ?? ''}
                    onChange={(e) => update(key, 'feedback', e.target.value)}
                  />
                </label>
              </div>
            );
          })}
        </fieldset>
      ))}
      <label className="block">
        Lý do xác nhận/sửa bản chấm
        <input
          className="w-full rounded-lg border p-3"
          required
          minLength={10}
          disabled={busy}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      <label className="flex gap-3">
        <input
          type="checkbox"
          disabled={busy || !valid}
          checked={attest}
          onChange={(e) => setAttest(e.target.checked)}
        />
        Tôi đã nghe bản thu/đọc bài làm gốc và tự chấm từng tiêu chí; không dùng điểm AI làm kết quả chính thức.
      </label>
      <button
        className="rounded-lg border border-indigo-300 px-4 py-2 disabled:opacity-50"
        disabled={busy || !valid || !attest || reason.trim().length < 10}
      >
        Xác nhận điểm chấm cuối (chưa công bố)
      </button>
    </form>
  );
}
