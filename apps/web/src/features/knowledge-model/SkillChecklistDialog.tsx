import type { Skill } from './types';

export function SkillChecklistDialog({
  title,
  description,
  skills,
  selectedIds,
  pending,
  error,
  onToggle,
  onSave,
  onCancel,
}: {
  title: string;
  description: string;
  skills: Skill[];
  selectedIds: string[];
  pending: boolean;
  error: string | null;
  onToggle: (skillId: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
        <h2 className="text-xl font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-slate-600">{description}</p>
        {error ? <p className="mt-3 rounded bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</p> : null}
        <div className="mt-4 max-h-72 space-y-2 overflow-y-auto">
          {skills.length === 0 ? (
            <p className="text-sm text-slate-500">Không có Skill (KC) khả dụng.</p>
          ) : skills.map((skill) => (
            <label className="flex items-start gap-3 rounded border p-3" key={skill.id}>
              <input
                checked={selectedIds.includes(skill.id)}
                disabled={pending}
                onChange={() => onToggle(skill.id)}
                type="checkbox"
              />
              <span><strong>{skill.code}</strong> — {skill.name}</span>
            </label>
          ))}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button className="rounded border px-4 py-2" disabled={pending} onClick={onCancel} type="button">Hủy</button>
          <button className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50" disabled={pending} onClick={onSave} type="button">
            {pending ? 'Đang lưu...' : 'Lưu liên kết'}
          </button>
        </div>
      </div>
    </div>
  );
}
