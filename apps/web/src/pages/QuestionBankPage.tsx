import { FormEvent, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { assessmentApi } from '@/features/assessments/api';
import { difficultyLabel, questionTypeLabel } from '@/features/assessments/display';
import { assessmentErrorMessage } from '@/features/assessments/errors';
import type {
  AssessmentQuestion,
  QuestionDifficulty,
  QuestionInput,
  QuestionType,
} from '@/features/assessments/types';
import { useSessionExpiry } from '@/features/auth/use-session-expiry';
import { knowledgeModelApi } from '@/features/knowledge-model/api';
import { SkillChecklistDialog } from '@/features/knowledge-model/SkillChecklistDialog';
import type { Skill } from '@/features/knowledge-model/types';

type EditableOption = { content: string; isCorrect: boolean };

const emptyOptions = (): EditableOption[] => [
  { content: '', isCorrect: true },
  { content: '', isCorrect: false },
];

export function QuestionBankPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const redirectExpiredSession = useSessionExpiry();
  const mutationInFlight = useRef(false);
  const [questions, setQuestions] = useState<AssessmentQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [editingQuestion, setEditingQuestion] = useState<AssessmentQuestion | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [courseSkills, setCourseSkills] = useState<Skill[] | null>(null);
  const [mappingQuestion, setMappingQuestion] = useState<AssessmentQuestion | null>(null);
  const [mappedSkillIds, setMappedSkillIds] = useState<string[]>([]);
  const [mappingError, setMappingError] = useState<string | null>(null);
  const [mappingLoading, setMappingLoading] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    async function fetchQuestions() {
      if (!courseId) return;
      try {
        const data = await assessmentApi.questions.list(courseId, controller.signal);
        setQuestions(data);
        setLoadError(null);
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return;
        if (await redirectExpiredSession(error)) return;
        setLoadError(assessmentErrorMessage(error, 'Không thể tải ngân hàng câu hỏi.'));
      } finally {
        setLoading(false);
      }
    }
    void fetchQuestions();
    return () => controller.abort();
  }, [courseId, redirectExpiredSession, reloadKey]);

  const beginMutation = (action: string) => {
    if (mutationInFlight.current) return false;
    mutationInFlight.current = true;
    setPendingAction(action);
    setActionError(null);
    return true;
  };

  const endMutation = () => {
    mutationInFlight.current = false;
    setPendingAction(null);
  };

  const saveQuestion = async (input: QuestionInput) => {
    if (!courseId || !beginMutation('save-question')) return;
    try {
      const saved = editingQuestion
        ? await assessmentApi.questions.update(editingQuestion.id, input)
        : await assessmentApi.questions.create(courseId, input);
      setQuestions((current) => editingQuestion
        ? current.map((item) => item.id === saved.id ? saved : item)
        : [...current, saved]);
      setFormOpen(false);
      setEditingQuestion(null);
    } catch (error) {
      if (await redirectExpiredSession(error)) return;
      setActionError(assessmentErrorMessage(
        error,
        'Không thể lưu câu hỏi. Vui lòng thử lại.',
        'Câu hỏi đã được sử dụng trong bài kiểm tra có lượt làm nên không thể chỉnh sửa.',
      ));
    } finally {
      endMutation();
    }
  };

  const deleteQuestion = async (question: AssessmentQuestion) => {
    if (!window.confirm('Bạn có chắc muốn xóa câu hỏi này?')) return;
    if (!beginMutation(`delete-${question.id}`)) return;
    try {
      await assessmentApi.questions.delete(question.id);
      setQuestions((current) => current.filter((item) => item.id !== question.id));
    } catch (error) {
      if (await redirectExpiredSession(error)) return;
      setActionError(assessmentErrorMessage(
        error,
        'Không thể xóa câu hỏi. Vui lòng thử lại.',
        'Câu hỏi đang được sử dụng trong bài kiểm tra. Hãy gỡ câu hỏi khỏi bài kiểm tra trước.',
      ));
    } finally {
      endMutation();
    }
  };

  const openSkillMapping = async (question: AssessmentQuestion) => {
    if (!courseId) return;
    setMappingQuestion(question);
    setActionMessage(null);
    setMappingLoading(true);
    setMappingError(null);
    try {
      const [available, mapped] = await Promise.all([
        courseSkills ?? knowledgeModelApi.skills.list(courseId),
        knowledgeModelApi.questionSkills.list(question.id),
      ]);
      setCourseSkills(available);
      setMappedSkillIds(mapped.map(({ id }) => id));
    } catch (error) {
      if (await redirectExpiredSession(error)) return;
      setMappingError('Không thể tải liên kết Skill cho câu hỏi.');
    } finally {
      setMappingLoading(false);
    }
  };

  const saveSkillMapping = async () => {
    if (!mappingQuestion || !beginMutation(`map-${mappingQuestion.id}`)) return;
    try {
      const mapped = await knowledgeModelApi.questionSkills.replace(
        mappingQuestion.id,
        [...new Set(mappedSkillIds)],
      );
      setMappedSkillIds(mapped.map(({ id }) => id));
      setMappingQuestion(null);
      setActionMessage('Đã cập nhật Skill cho câu hỏi.');
    } catch (error) {
      if (await redirectExpiredSession(error)) return;
      setMappingError('Không thể cập nhật liên kết Skill cho câu hỏi.');
    } finally {
      endMutation();
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Ngân hàng câu hỏi</h1>
          <p className="mt-1 text-sm text-slate-600">Quản lý câu hỏi khách quan của khóa học.</p>
        </div>
        <div className="flex gap-2">
          <Link className="rounded border px-4 py-2 text-sm" to="/instructor/teaching">
            Quay lại
          </Link>
          {courseId && (
            <Link className="rounded border px-4 py-2 text-sm" to={`/instructor/courses/${courseId}/tests`}>
              Quản lý bài kiểm tra
            </Link>
          )}
          <button
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            disabled={pendingAction !== null}
            onClick={() => { setEditingQuestion(null); setFormOpen(true); setActionError(null); }}
            type="button"
          >
            Tạo câu hỏi
          </button>
        </div>
      </div>

      {actionError && <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{actionError}</div>}
      {actionMessage && <div className="rounded border border-green-200 bg-green-50 p-3 text-sm text-green-700" role="status">{actionMessage}</div>}

      {formOpen && (
        <QuestionForm
          key={editingQuestion?.id ?? 'new-question'}
          initial={editingQuestion}
          pending={pendingAction === 'save-question'}
          onCancel={() => { setFormOpen(false); setEditingQuestion(null); }}
          onSave={saveQuestion}
        />
      )}

      {loading ? (
        <p className="py-10 text-center text-slate-500">Đang tải câu hỏi...</p>
      ) : loadError ? (
        <div className="rounded border border-red-200 bg-red-50 p-4 text-red-700">
          <p>{loadError}</p>
          <button className="mt-3 rounded border px-3 py-1 text-sm" onClick={() => { setLoading(true); setLoadError(null); setReloadKey((current) => current + 1); }} type="button">Thử lại</button>
        </div>
      ) : questions.length === 0 ? (
        <div className="rounded border bg-white p-8 text-center text-slate-500">Chưa có câu hỏi nào.</div>
      ) : (
        <div className="space-y-3">
          {questions.map((question) => (
            <article className="rounded-lg border bg-white p-5 shadow-sm" key={question.id}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="mb-2 flex flex-wrap gap-2 text-xs">
                    <span className="rounded bg-blue-100 px-2 py-1 text-blue-800">{questionTypeLabel[question.type]}</span>
                    <span className="rounded bg-amber-100 px-2 py-1 text-amber-800">{difficultyLabel[question.difficulty]}</span>
                  </div>
                  <p className="whitespace-pre-wrap font-medium text-slate-900">{question.content}</p>
                  <ol className="mt-3 list-inside list-[upper-alpha] space-y-1 text-sm text-slate-600">
                    {question.options.map((option) => (
                      <li className={option.isCorrect ? 'font-medium text-green-700' : ''} key={option.id}>
                        {option.content}{option.isCorrect ? ' ✓' : ''}
                      </li>
                    ))}
                  </ol>
                </div>
                <div className="flex gap-2">
                  <button
                    className="rounded border border-emerald-300 px-3 py-1.5 text-sm text-emerald-700 disabled:opacity-50"
                    disabled={pendingAction !== null}
                    onClick={() => void openSkillMapping(question)}
                    type="button"
                  >
                    Edit Skills
                  </button>
                  <button
                    className="rounded border px-3 py-1.5 text-sm disabled:opacity-50"
                    disabled={pendingAction !== null}
                    onClick={() => { setEditingQuestion(question); setFormOpen(true); setActionError(null); }}
                    type="button"
                  >
                    Sửa
                  </button>
                  <button
                    className="rounded border border-red-300 px-3 py-1.5 text-sm text-red-700 disabled:opacity-50"
                    disabled={pendingAction !== null}
                    onClick={() => void deleteQuestion(question)}
                    type="button"
                  >
                    {pendingAction === `delete-${question.id}` ? 'Đang xóa...' : 'Xóa'}
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
      {mappingQuestion ? <SkillChecklistDialog
        title="Skill (KC) của câu hỏi"
        description="Một câu hỏi có thể cung cấp cùng quan sát đúng/sai cho nhiều Skill."
        skills={courseSkills ?? []}
        selectedIds={mappedSkillIds}
        pending={mappingLoading || pendingAction === `map-${mappingQuestion.id}`}
        error={mappingError}
        onToggle={(id) => setMappedSkillIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])}
        onSave={() => void saveSkillMapping()}
        onCancel={() => setMappingQuestion(null)}
      /> : null}
    </div>
  );
}

function QuestionForm({
  initial,
  pending,
  onCancel,
  onSave,
}: {
  initial: AssessmentQuestion | null;
  pending: boolean;
  onCancel: () => void;
  onSave: (input: QuestionInput) => Promise<void>;
}) {
  const [type, setType] = useState<QuestionType>(initial?.type ?? 'SINGLE_CHOICE');
  const [difficulty, setDifficulty] = useState<QuestionDifficulty>(initial?.difficulty ?? 'MEDIUM');
  const [content, setContent] = useState(initial?.content ?? '');
  const [explanation, setExplanation] = useState(initial?.explanation ?? '');
  const [options, setOptions] = useState<EditableOption[]>(initial
    ? [...initial.options].sort((a, b) => a.orderIndex - b.orderIndex).map(({ content: text, isCorrect }) => ({ content: text, isCorrect }))
    : emptyOptions());
  const [formError, setFormError] = useState<string | null>(null);

  const changeType = (nextType: QuestionType) => {
    setType(nextType);
    if (nextType === 'TRUE_FALSE') {
      setOptions([
        { content: options[0]?.content || 'Đúng', isCorrect: true },
        { content: options[1]?.content || 'Sai', isCorrect: false },
      ]);
      return;
    }
    const normalized = options.length >= 2 ? options : emptyOptions();
    if (nextType === 'SINGLE_CHOICE') {
      const correctIndex = Math.max(0, normalized.findIndex((option) => option.isCorrect));
      setOptions(normalized.map((option, index) => ({ ...option, isCorrect: index === correctIndex })));
    } else {
      setOptions(normalized.some((option) => option.isCorrect)
        ? normalized
        : normalized.map((option, index) => ({ ...option, isCorrect: index === 0 })));
    }
  };

  const updateOption = (index: number, update: Partial<EditableOption>) => {
    setOptions((current) => current.map((option, optionIndex) => optionIndex === index ? { ...option, ...update } : option));
  };

  const setCorrect = (index: number, checked: boolean) => {
    if (type === 'MULTIPLE_CHOICE') {
      updateOption(index, { isCorrect: checked });
    } else {
      setOptions((current) => current.map((option, optionIndex) => ({ ...option, isCorrect: optionIndex === index })));
    }
  };

  const moveOption = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= options.length) return;
    const reordered = [...options];
    [reordered[index], reordered[nextIndex]] = [reordered[nextIndex], reordered[index]];
    setOptions(reordered);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const trimmedContent = content.trim();
    const normalizedOptions = options.map((option) => ({ ...option, content: option.content.trim() }));
    const correctCount = normalizedOptions.filter((option) => option.isCorrect).length;
    const normalizedTexts = normalizedOptions.map((option) => option.content.toLocaleLowerCase('vi'));

    if (!trimmedContent || normalizedOptions.some((option) => !option.content)) {
      setFormError('Nội dung câu hỏi và đáp án không được để trống.');
      return;
    }
    if (normalizedOptions.length < 2 || (type === 'TRUE_FALSE' && normalizedOptions.length !== 2)) {
      setFormError(type === 'TRUE_FALSE' ? 'Câu Đúng/Sai phải có đúng 2 đáp án.' : 'Câu hỏi phải có ít nhất 2 đáp án.');
      return;
    }
    if ((type === 'MULTIPLE_CHOICE' && correctCount < 1) || (type !== 'MULTIPLE_CHOICE' && correctCount !== 1)) {
      setFormError(type === 'MULTIPLE_CHOICE' ? 'Cần chọn ít nhất một đáp án đúng.' : 'Cần chọn đúng một đáp án đúng.');
      return;
    }
    if (new Set(normalizedTexts).size !== normalizedTexts.length) {
      setFormError('Nội dung các đáp án không được trùng nhau.');
      return;
    }

    setFormError(null);
    void onSave({
      type,
      difficulty,
      content: trimmedContent,
      explanation: explanation.trim() || null,
      options: normalizedOptions,
    });
  };

  return (
    <form className="space-y-4 rounded-lg border bg-white p-5 shadow-sm" onSubmit={submit}>
      <h2 className="text-lg font-semibold">{initial ? 'Chỉnh sửa câu hỏi' : 'Tạo câu hỏi'}</h2>
      {formError && <p className="rounded bg-red-50 p-3 text-sm text-red-700">{formError}</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium">Loại câu hỏi
          <select className="mt-1 w-full rounded border p-2" disabled={pending} value={type} onChange={(event) => changeType(event.target.value as QuestionType)}>
            {Object.entries(questionTypeLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium">Độ khó
          <select className="mt-1 w-full rounded border p-2" disabled={pending} value={difficulty} onChange={(event) => setDifficulty(event.target.value as QuestionDifficulty)}>
            {Object.entries(difficultyLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
      </div>
      <label className="block text-sm font-medium">Nội dung
        <textarea className="mt-1 min-h-24 w-full rounded border p-2" disabled={pending} maxLength={5000} required value={content} onChange={(event) => setContent(event.target.value)} />
      </label>
      <label className="block text-sm font-medium">Giải thích (không bắt buộc)
        <textarea className="mt-1 min-h-20 w-full rounded border p-2" disabled={pending} maxLength={5000} value={explanation} onChange={(event) => setExplanation(event.target.value)} />
      </label>
      <fieldset className="space-y-2" disabled={pending}>
        <legend className="text-sm font-medium">Đáp án</legend>
        {options.map((option, index) => (
          <div className="flex items-center gap-2" key={index}>
            <input aria-label={`Đáp án đúng ${index + 1}`} checked={option.isCorrect} onChange={(event) => setCorrect(index, event.target.checked)} type={type === 'MULTIPLE_CHOICE' ? 'checkbox' : 'radio'} name={type === 'MULTIPLE_CHOICE' ? undefined : 'correct-option'} />
            <input aria-label={`Nội dung đáp án ${index + 1}`} className="min-w-0 flex-1 rounded border p-2" maxLength={1000} required value={option.content} onChange={(event) => updateOption(index, { content: event.target.value })} />
            <button aria-label={`Đưa đáp án ${index + 1} lên`} className="rounded border px-2 py-1" disabled={index === 0} onClick={() => moveOption(index, -1)} type="button">↑</button>
            <button aria-label={`Đưa đáp án ${index + 1} xuống`} className="rounded border px-2 py-1" disabled={index === options.length - 1} onClick={() => moveOption(index, 1)} type="button">↓</button>
            {type !== 'TRUE_FALSE' && options.length > 2 && (
              <button aria-label={`Xóa đáp án ${index + 1}`} className="rounded border border-red-300 px-2 py-1 text-red-700" onClick={() => setOptions((current) => current.filter((_, optionIndex) => optionIndex !== index))} type="button">×</button>
            )}
          </div>
        ))}
        {type !== 'TRUE_FALSE' && (
          <button className="rounded border px-3 py-1.5 text-sm" onClick={() => setOptions((current) => [...current, { content: '', isCorrect: false }])} type="button">Thêm đáp án</button>
        )}
      </fieldset>
      <div className="flex justify-end gap-2">
        <button className="rounded border px-4 py-2" disabled={pending} onClick={onCancel} type="button">Hủy</button>
        <button className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50" disabled={pending} type="submit">{pending ? 'Đang lưu...' : 'Lưu câu hỏi'}</button>
      </div>
    </form>
  );
}
