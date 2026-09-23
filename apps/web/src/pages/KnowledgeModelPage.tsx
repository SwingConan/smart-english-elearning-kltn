import { FormEvent, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useSessionExpiry } from '@/features/auth/use-session-expiry';
import { knowledgeModelApi } from '@/features/knowledge-model/api';
import { SkillChecklistDialog } from '@/features/knowledge-model/SkillChecklistDialog';
import type { Skill, SkillInput, SkillUpdate } from '@/features/knowledge-model/types';
import { ApiError } from '@/lib/api-client';

const DEFAULT_SKILL: SkillInput = {
  code: '', name: '', description: null, pInit: 0.5, pLearn: 0.1, pGuess: 0.2, pSlip: 0.1,
};

export function KnowledgeModelPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const redirectExpiredSession = useSessionExpiry();
  const mutationInFlight = useRef(false);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [formSkill, setFormSkill] = useState<Skill | null | undefined>(undefined);
  const [prerequisiteSkill, setPrerequisiteSkill] = useState<Skill | null>(null);
  const [selectedPrerequisites, setSelectedPrerequisites] = useState<string[]>([]);
  const [prerequisiteError, setPrerequisiteError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      if (!courseId) return;
      try {
        setSkills(await knowledgeModelApi.skills.list(courseId, controller.signal));
        setLoadError(null);
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return;
        if (await redirectExpiredSession(error)) return;
        setLoadError('Không thể tải Knowledge Model. Vui lòng thử lại.');
      } finally {
        setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [courseId, redirectExpiredSession]);

  const beginMutation = () => {
    if (mutationInFlight.current) return false;
    mutationInFlight.current = true;
    setPending(true);
    setActionError(null);
    setMessage(null);
    return true;
  };
  const endMutation = () => { mutationInFlight.current = false; setPending(false); };

  const saveSkill = async (input: SkillInput) => {
    if (!courseId || !beginMutation()) return;
    try {
      if (formSkill) {
        const delta = skillDelta(formSkill, input);
        if (Object.keys(delta).length === 0) {
          setMessage('Không có thay đổi để lưu.');
          setFormSkill(undefined);
          return;
        }
        const updated = await knowledgeModelApi.skills.update(formSkill.id, delta);
        setSkills((current) => current.map((skill) => skill.id === updated.id ? updated : skill));
      } else {
        const created = await knowledgeModelApi.skills.create(courseId, input);
        setSkills((current) => [...current, created].sort(compareSkill));
      }
      setFormSkill(undefined);
      setMessage('Đã lưu Skill (KC).');
    } catch (error) {
      if (await redirectExpiredSession(error)) return;
      setActionError(skillError(error, 'Không thể lưu Skill (KC).'));
    } finally {
      endMutation();
    }
  };

  const deleteSkill = async (skill: Skill) => {
    if (!window.confirm(`Xóa Skill ${skill.code}?`) || !beginMutation()) return;
    try {
      await knowledgeModelApi.skills.delete(skill.id);
      setSkills((current) => current.filter(({ id }) => id !== skill.id));
      setMessage('Đã xóa Skill (KC).');
    } catch (error) {
      if (await redirectExpiredSession(error)) return;
      setActionError(skillError(error, 'Không thể xóa Skill (KC).', true));
    } finally {
      endMutation();
    }
  };

  const openPrerequisites = async (skill: Skill) => {
    setPrerequisiteSkill(skill);
    setPrerequisiteError(null);
    try {
      const mapped = await knowledgeModelApi.prerequisites.list(skill.id);
      setSelectedPrerequisites(mapped.map(({ id }) => id));
    } catch (error) {
      if (await redirectExpiredSession(error)) return;
      setPrerequisiteError('Không thể tải danh sách tiên quyết.');
    }
  };

  const savePrerequisites = async () => {
    if (!prerequisiteSkill || !beginMutation()) return;
    try {
      await knowledgeModelApi.prerequisites.replace(
        prerequisiteSkill.id,
        [...new Set(selectedPrerequisites)],
      );
      setPrerequisiteSkill(null);
      setMessage('Đã cập nhật Skill tiên quyết.');
    } catch (error) {
      if (await redirectExpiredSession(error)) return;
      setPrerequisiteError(error instanceof ApiError && error.status === 400
        ? 'Liên kết tiên quyết không hợp lệ hoặc sẽ tạo chu trình.'
        : 'Không thể cập nhật Skill tiên quyết.');
    } finally {
      endMutation();
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Knowledge Model — Skill (KC)</h1>
          <p className="mt-1 text-sm text-slate-600">Quản lý thành phần kiến thức và tham số Bayesian Knowledge Tracing.</p>
        </div>
        <div className="flex gap-2">
          <Link className="rounded border px-4 py-2 text-sm" to="/instructor/teaching">Quay lại</Link>
          <button className="rounded bg-blue-600 px-4 py-2 text-sm text-white" disabled={pending} onClick={() => setFormSkill(null)} type="button">Tạo Skill</button>
        </div>
      </div>
      {message ? <p className="rounded bg-green-50 p-3 text-sm text-green-700" role="status">{message}</p> : null}
      {actionError ? <p className="rounded bg-red-50 p-3 text-sm text-red-700" role="alert">{actionError}</p> : null}
      {formSkill !== undefined ? <SkillForm initial={formSkill} pending={pending} onCancel={() => setFormSkill(undefined)} onSave={saveSkill} /> : null}
      {loading ? <p className="py-10 text-center">Đang tải Knowledge Model...</p>
        : loadError ? <p className="rounded bg-red-50 p-4 text-red-700">{loadError}</p>
          : skills.length === 0 ? <p className="rounded border bg-white p-8 text-center text-slate-600">Chưa có Skill (KC). Hãy định nghĩa kiến thức mà khóa học đo lường.</p>
            : <div className="grid gap-4 md:grid-cols-2">{skills.map((skill) => (
              <article className="rounded-lg border bg-white p-5 shadow-sm" key={skill.id}>
                <div className="flex justify-between gap-3"><div><h2 className="font-semibold">{skill.code} — {skill.name}</h2><p className="mt-1 text-sm text-slate-600">{skill.description || 'Không có mô tả.'}</p></div></div>
                <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
                  <div><dt className="font-medium">pInit</dt><dd>{skill.pInit}</dd></div>
                  <div><dt className="font-medium">pLearn</dt><dd>{skill.pLearn}</dd></div>
                  <div><dt className="font-medium">pGuess</dt><dd>{skill.pGuess}</dd></div>
                  <div><dt className="font-medium">pSlip</dt><dd>{skill.pSlip}</dd></div>
                </dl>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button className="rounded border px-3 py-1.5 text-sm" disabled={pending} onClick={() => setFormSkill(skill)} type="button">Sửa</button>
                  <button className="rounded border px-3 py-1.5 text-sm" disabled={pending} onClick={() => void openPrerequisites(skill)} type="button">Cấu hình tiên quyết</button>
                  <button className="rounded border border-red-300 px-3 py-1.5 text-sm text-red-700" disabled={pending} onClick={() => void deleteSkill(skill)} type="button">Xóa</button>
                </div>
              </article>
            ))}</div>}
      {prerequisiteSkill ? <SkillChecklistDialog
        title={`Tiên quyết cho ${prerequisiteSkill.code}`}
        description="Chọn các Skill (KC) cần hoàn thành trước. Backend kiểm tra chu trình."
        skills={skills.filter(({ id }) => id !== prerequisiteSkill.id)}
        selectedIds={selectedPrerequisites}
        pending={pending}
        error={prerequisiteError}
        onToggle={(id) => setSelectedPrerequisites((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])}
        onSave={() => void savePrerequisites()}
        onCancel={() => setPrerequisiteSkill(null)}
      /> : null}
    </div>
  );
}

function SkillForm({ initial, pending, onCancel, onSave }: { initial: Skill | null; pending: boolean; onCancel: () => void; onSave: (input: SkillInput) => Promise<void> }) {
  const source = initial ?? DEFAULT_SKILL;
  const [error, setError] = useState<string | null>(null);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const input: SkillInput = {
      code: String(data.get('code')).trim(), name: String(data.get('name')).trim(),
      description: String(data.get('description')).trim() || null,
      pInit: Number(data.get('pInit')), pLearn: Number(data.get('pLearn')),
      pGuess: Number(data.get('pGuess')), pSlip: Number(data.get('pSlip')),
    };
    if (!input.code || !input.name) { setError('Code và tên không được để trống.'); return; }
    const values = [input.pInit, input.pLearn, input.pGuess, input.pSlip];
    if (values.some((value) => !Number.isFinite(value) || value < 0 || value > 1)) { setError('Mỗi tham số BKT phải nằm trong [0, 1].'); return; }
    if (input.pGuess + input.pSlip >= 1) { setError('pGuess + pSlip phải nhỏ hơn 1.'); return; }
    setError(null); void onSave(input);
  };
  return <form className="space-y-4 rounded-lg border bg-white p-5" onSubmit={submit}>
    <h2 className="text-lg font-semibold">{initial ? 'Sửa Skill (KC)' : 'Tạo Skill (KC)'}</h2>
    {error ? <p className="rounded bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</p> : null}
    <div className="grid gap-4 sm:grid-cols-2"><label>Code<input className="mt-1 w-full rounded border p-2" defaultValue={source.code} disabled={pending} name="code" /></label><label>Tên<input className="mt-1 w-full rounded border p-2" defaultValue={source.name} disabled={pending} name="name" /></label></div>
    <label className="block">Mô tả<textarea className="mt-1 w-full rounded border p-2" defaultValue={source.description ?? ''} disabled={pending} name="description" /></label>
    <p className="text-sm text-slate-600">pInit: mastery ban đầu · pLearn: xác suất học · pGuess: đoán đúng · pSlip: sai sót.</p>
    <div className="grid gap-3 sm:grid-cols-4">{(['pInit', 'pLearn', 'pGuess', 'pSlip'] as const).map((field) => <label key={field}>{field}<input aria-label={field} className="mt-1 w-full rounded border p-2" defaultValue={source[field]} disabled={pending} name={field} step="any" type="number" /></label>)}</div>
    <div className="flex justify-end gap-2"><button className="rounded border px-4 py-2" disabled={pending} onClick={onCancel} type="button">Hủy</button><button className="rounded bg-blue-600 px-4 py-2 text-white" disabled={pending} type="submit">{pending ? 'Đang lưu...' : 'Lưu Skill'}</button></div>
  </form>;
}

function skillDelta(original: Skill, input: SkillInput): SkillUpdate {
  const delta: SkillUpdate = {};
  for (const key of ['code', 'name', 'description', 'pInit', 'pLearn', 'pGuess', 'pSlip'] as const) {
    if (original[key] !== input[key]) delta[key] = input[key] as never;
  }
  return delta;
}
function compareSkill(left: Skill, right: Skill) { return left.code.localeCompare(right.code) || left.id.localeCompare(right.id); }
function skillError(error: unknown, fallback: string, deleting = false) {
  if (error instanceof ApiError && error.status === 409) return deleting
    ? 'Không thể xóa Skill vì đang được câu hỏi, bài học, tiên quyết hoặc lịch sử sử dụng.'
    : 'Không thể thay đổi tham số BKT sau khi Skill đã có lịch sử mastery.';
  if (error instanceof ApiError && error.status === 400) return 'Dữ liệu Skill chưa hợp lệ.';
  return fallback;
}
