import { useMemo, useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { ConfirmDialog, LoadingButton } from '@/components/ui/Feedback';
import { SafeMarkdown } from '@/components/ui/SafeMarkdown';
import { useUnsavedChanges } from '@/components/ui/use-unsaved-changes';
import {
  LESSON_TASK_CODES,
  lessonCurriculumError,
  SKILL_LABELS,
  TASK_CODE_LABELS,
  TOEIC_SKILLS,
  type LessonTaskCode,
  type ToeicSkill,
} from '@/features/learning/curriculum';
import type { Lesson, LessonInput } from './types';

interface LessonDraft {
  title: string;
  description: string;
  estimatedMinutes: string;
  focusSkills: ToeicSkill[];
  focusTaskCodes: LessonTaskCode[];
  learningObjectives: string[];
  contentMarkdown: string;
}

function createLessonDraft(lesson: Partial<Lesson> | null): LessonDraft {
  return {
    title: lesson?.title ?? '',
    description: lesson?.description ?? '',
    estimatedMinutes: lesson?.estimatedMinutes ? String(lesson.estimatedMinutes) : '',
    focusSkills: lesson?.focusSkills ?? [],
    focusTaskCodes: lesson?.focusTaskCodes ?? [],
    learningObjectives: lesson?.learningObjectives?.length
      ? lesson.learningObjectives
      : [''],
    contentMarkdown: lesson?.contentMarkdown ?? '',
  };
}

export function LessonEditorDialog({
  lesson,
  isSaving,
  serverError,
  onCancel,
  onSave,
}: {
  lesson: Partial<Lesson> | null;
  isSaving: boolean;
  serverError: string | null;
  onCancel: () => void;
  onSave: (input: LessonInput) => Promise<boolean>;
}) {
  const [initialDraft] = useState<LessonDraft>(() => createLessonDraft(lesson));
  const [draft, setDraft] = useState<LessonDraft>(() => createLessonDraft(lesson));
  const [showPreview, setShowPreview] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);

  const normalizedObjectives = draft.learningObjectives
    .map((item) => item.trim())
    .filter(Boolean);
  const estimatedMinutes = draft.estimatedMinutes
    ? Number(draft.estimatedMinutes)
    : null;
  const validationError = useMemo(
    () =>
      !draft.title.trim()
        ? 'Tiêu đề bài học là bắt buộc.'
        : lessonCurriculumError({
            learningObjectives: normalizedObjectives,
            contentMarkdown: draft.contentMarkdown,
            estimatedMinutes,
            focusSkills: draft.focusSkills,
            focusTaskCodes: draft.focusTaskCodes,
          }),
    [draft, estimatedMinutes, normalizedObjectives],
  );
  const isDirty = JSON.stringify(draft) !== JSON.stringify(initialDraft);
  useUnsavedChanges(isDirty);

  const requestClose = () => {
    if (isSaving) return;
    if (isDirty) setConfirmClose(true);
    else onCancel();
  };
  const toggle = <T extends string>(values: T[], value: T): T[] =>
    values.includes(value) ? values.filter((item) => item !== value) : [...values, value];

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/60 p-3 backdrop-blur-sm sm:p-6">
      <section
        aria-label={lesson?.id ? 'Chỉnh sửa bài học' : 'Tạo bài học'}
        aria-modal="true"
        className="mx-auto min-h-full w-full max-w-6xl rounded-3xl bg-white shadow-2xl"
        role="dialog"
      >
        <header className="sticky top-0 z-10 flex items-start justify-between gap-4 rounded-t-3xl border-b bg-white/95 px-5 py-4 backdrop-blur sm:px-8">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-indigo-600">Curriculum authoring</p>
            <h2 className="mt-1 text-2xl font-bold">{lesson?.id ? 'Chỉnh sửa bài học' : 'Tạo bài học'}</h2>
            <p className="mt-1 text-sm text-slate-500">Biên soạn mục tiêu, trọng tâm TOEIC và nội dung học tập trong một workspace đầy đủ.</p>
          </div>
          <button aria-label="Đóng trình biên soạn" className="rounded-full p-2 hover:bg-slate-100" onClick={requestClose} type="button"><X /></button>
        </header>

        <form
          className="grid gap-8 p-5 sm:p-8 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,0.8fr)]"
          onSubmit={(event) => {
            event.preventDefault();
            if (validationError || isSaving) return;
            void onSave({
              title: draft.title.trim(),
              description: draft.description.trim(),
              estimatedMinutes,
              focusSkills: draft.focusSkills,
              focusTaskCodes: draft.focusTaskCodes,
              learningObjectives: normalizedObjectives,
              contentMarkdown: draft.contentMarkdown.trim() || null,
            });
          }}
        >
          <div className="space-y-7">
            <fieldset className="space-y-4" disabled={isSaving}>
              <legend className="text-lg font-bold">Thông tin bài học</legend>
              <label className="block text-sm font-semibold">Tiêu đề
                <input className="mt-1 w-full rounded-xl border px-4 py-3" maxLength={300} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} required value={draft.title} />
              </label>
              <label className="block text-sm font-semibold">Mô tả ngắn
                <textarea className="mt-1 w-full rounded-xl border px-4 py-3" maxLength={5000} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} rows={3} value={draft.description} />
              </label>
              <label className="block max-w-xs text-sm font-semibold">Thời lượng tự học ước tính
                <span className="mt-1 flex items-center gap-2"><input className="w-32 rounded-xl border px-4 py-3" max={180} min={5} onChange={(event) => setDraft((current) => ({ ...current, estimatedMinutes: event.target.value }))} type="number" value={draft.estimatedMinutes} /><span className="text-slate-500">phút</span></span>
              </label>
            </fieldset>

            <fieldset disabled={isSaving}>
              <legend className="text-lg font-bold">Kỹ năng trọng tâm</legend>
              <p className="mt-1 text-sm text-slate-500">Broad-skill mapping cốt lõi của bài học.</p>
              <div className="mt-3 flex flex-wrap gap-2">{TOEIC_SKILLS.map((skill) => <button aria-pressed={draft.focusSkills.includes(skill)} className={`rounded-full border px-4 py-2 text-sm font-semibold ${draft.focusSkills.includes(skill) ? 'border-indigo-600 bg-indigo-600 text-white' : 'bg-white text-slate-700'}`} key={skill} onClick={() => setDraft((current) => ({ ...current, focusSkills: toggle(current.focusSkills, skill) }))} type="button">{SKILL_LABELS[skill]}</button>)}</div>
            </fieldset>

            <fieldset disabled={isSaving}>
              <legend className="text-lg font-bold">TOEIC task focus</legend>
              <p className="mt-1 text-sm text-slate-500">Có thể để trống cho bài định hướng hoặc ôn tập.</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">{LESSON_TASK_CODES.map((code) => <label className="flex cursor-pointer items-start gap-3 rounded-xl border p-3" key={code}><input checked={draft.focusTaskCodes.includes(code)} className="mt-1" onChange={() => setDraft((current) => ({ ...current, focusTaskCodes: toggle(current.focusTaskCodes, code) }))} type="checkbox" /><span><strong className="block text-sm">{TASK_CODE_LABELS[code]}</strong><span className="text-xs text-slate-500">{code}</span></span></label>)}</div>
            </fieldset>

            <fieldset disabled={isSaving}>
              <div className="flex items-center justify-between gap-3"><legend className="text-lg font-bold">Mục tiêu bài học</legend><button className="btn-secondary px-3 py-2 text-sm" disabled={draft.learningObjectives.length >= 8} onClick={() => setDraft((current) => ({ ...current, learningObjectives: [...current.learningObjectives, ''] }))} type="button"><Plus size={16} />Thêm mục tiêu</button></div>
              <div className="mt-3 space-y-3">{draft.learningObjectives.map((objective, index) => <div className="flex items-start gap-2" key={index}><span className="mt-3 w-6 text-sm font-bold text-indigo-600">{index + 1}</span><textarea aria-label={`Mục tiêu ${index + 1}`} className="min-h-12 flex-1 rounded-xl border px-3 py-2" maxLength={300} onChange={(event) => setDraft((current) => ({ ...current, learningObjectives: current.learningObjectives.map((item, itemIndex) => itemIndex === index ? event.target.value : item) }))} value={objective} /><button aria-label={`Xóa mục tiêu ${index + 1}`} className="mt-2 rounded-lg p-2 text-red-600 hover:bg-red-50" onClick={() => setDraft((current) => ({ ...current, learningObjectives: current.learningObjectives.filter((_item, itemIndex) => itemIndex !== index) }))} type="button"><Trash2 size={18} /></button></div>)}</div>
            </fieldset>

            <fieldset disabled={isSaving}>
              <div className="flex items-center justify-between gap-3"><legend className="text-lg font-bold">Nội dung Markdown</legend><button aria-pressed={showPreview} className="btn-secondary px-3 py-2 text-sm lg:hidden" onClick={() => setShowPreview((value) => !value)} type="button">{showPreview ? 'Tiếp tục viết' : 'Xem trước'}</button></div>
              <textarea aria-label="Nội dung Markdown" className={`${showPreview ? 'hidden' : 'block'} mt-3 min-h-[30rem] w-full rounded-2xl border p-4 font-mono text-sm leading-6 lg:block`} maxLength={30_000} onChange={(event) => setDraft((current) => ({ ...current, contentMarkdown: event.target.value }))} placeholder={'## Nội dung chính\n\n- Ý quan trọng\n- Ví dụ thực hành'} value={draft.contentMarkdown} />
              <p className="mt-2 text-right text-xs text-slate-500">{draft.contentMarkdown.length.toLocaleString('vi-VN')} / 30.000 ký tự</p>
            </fieldset>
          </div>

          <aside className={`${showPreview ? 'block' : 'hidden'} lg:block`}>
            <div className="sticky top-28 rounded-2xl border bg-slate-50 p-5">
              <p className="text-xs font-bold uppercase tracking-widest text-indigo-600">Markdown preview</p>
              <h3 className="mt-2 text-xl font-bold">{draft.title || 'Bài học chưa có tiêu đề'}</h3>
              <div className="mt-5 max-h-[65vh] overflow-y-auto rounded-xl bg-white p-5">
                {draft.contentMarkdown.trim() ? <SafeMarkdown markdown={draft.contentMarkdown} /> : <p className="text-sm text-slate-500">Nhập nội dung Markdown để xem trước.</p>}
              </div>
            </div>
          </aside>

          <footer className="border-t pt-5 lg:col-span-2">
            {validationError || serverError ? <p className="state-error mb-4" role="alert">{validationError ?? serverError}</p> : null}
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
              <button className="btn-secondary" disabled={isSaving} onClick={requestClose} type="button">Hủy</button>
              <LoadingButton className="btn-primary" disabled={Boolean(validationError) || !isDirty} isLoading={isSaving} loadingLabel="Đang lưu…" type="submit">Lưu bài học</LoadingButton>
            </div>
          </footer>
        </form>
      </section>
      <ConfirmDialog busyLabel="Đang đóng…" confirmLabel="Bỏ thay đổi" description="Các thay đổi chưa lưu trong bài học sẽ bị mất." isBusy={false} onCancel={() => setConfirmClose(false)} onConfirm={onCancel} open={confirmClose} title="Bỏ thay đổi chưa lưu?" />
    </div>
  );
}
