import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import {
  CheckCircle2,
  Clock,
  Database,
  Edit3,
  FileCheck2,
  HelpCircle,
  Layers,
  Plus,
  Search,
  Send,
  Trash2,
  XCircle,
} from 'lucide-react';
import { button, field } from './api';
import {
  ASSESSMENT_KIND_LABELS,
  datetimeLocalToIso,
  isoToDatetimeLocal,
  lmsLocalApi,
  type AssessmentKind,
  type LocalQuizAttempt,
  type LocalQuizQuestion,
  type LocalQuizWorkspace,
  type QuestionBankItem,
  type QuizMediaItem,
  type QuizReleaseMode,
} from './lms-local-api';
import {
  groupQuizItems,
  QuizMediaBlock,
  QuizMediaUploadButtons,
  QuizZoomModal,
} from './quiz-media';
import { schoolTimestamp } from './school-time';

const primaryBtn =
  'inline-flex items-center justify-center gap-1.5 rounded bg-[#76a35e] px-4 py-2 font-semibold text-white shadow-2xs transition hover:bg-[#658f50] disabled:cursor-not-allowed disabled:opacity-50';
const emeraldBtn =
  'inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white shadow-2xs transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50';

type EditableQuestion = {
  id: string;
  type: 'MCQ' | 'ESSAY';
  prompt: string;
  points: number;
  options: Array<{ id: string; text: string }>;
  correctOptionId: string;
  explanation: string;
  groupId?: string | null;
  groupTitle?: string;
  media?: QuizMediaItem[];
};

function makeEmptyMcq(group?: {
  groupId?: string | null;
  groupTitle?: string;
  media?: QuizMediaItem[];
}): EditableQuestion {
  const o1 = crypto.randomUUID();
  const o2 = crypto.randomUUID();
  const o3 = crypto.randomUUID();
  const o4 = crypto.randomUUID();
  return {
    id: crypto.randomUUID(),
    type: 'MCQ',
    prompt: '',
    points: 1,
    options: [
      { id: o1, text: '' },
      { id: o2, text: '' },
      { id: o3, text: '' },
      { id: o4, text: '' },
    ],
    correctOptionId: o1,
    explanation: '',
    groupId: group?.groupId ?? null,
    groupTitle: group?.groupTitle ?? '',
    media: group?.media ?? [],
  };
}

function makeEmptyEssay(group?: {
  groupId?: string | null;
  groupTitle?: string;
  media?: QuizMediaItem[];
}): EditableQuestion {
  return {
    id: crypto.randomUUID(),
    type: 'ESSAY',
    prompt: '',
    points: 2,
    options: [],
    correctOptionId: '',
    explanation: '',
    groupId: group?.groupId ?? null,
    groupTitle: group?.groupTitle ?? '',
    media: group?.media ?? [],
  };
}

function fromWorkspaceQuestion(q: LocalQuizQuestion): EditableQuestion {
  return {
    id: q.id,
    type: q.type,
    prompt: q.prompt,
    points: q.points,
    options:
      q.type === 'MCQ'
        ? q.options.length >= 2
          ? q.options
          : makeEmptyMcq().options
        : [],
    correctOptionId: q.correctOptionId ?? q.options[0]?.id ?? '',
    explanation: q.explanation ?? '',
    groupId: q.groupId ?? null,
    groupTitle: q.groupTitle ?? '',
    media: Array.isArray(q.media) ? q.media : [],
  };
}

function formatCountdown(deadlineIso: string): string {
  const ms = new Date(deadlineIso).getTime() - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return '00:00';
  const totalSec = Math.floor(ms / 1000);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function normalizeInitialKind(raw: string | null | undefined): AssessmentKind {
  if (raw === 'REGULAR' || raw === 'MIDTERM' || raw === 'FINAL') return raw;
  return 'QUIZ';
}

export function LocalQuizAuthorForm({
  classId,
  sectionId,
  initialWorkspace,
  initialKind,
  onKindChange,
  onSaved,
  onCancel,
}: {
  classId: string;
  sectionId?: string;
  initialWorkspace?: LocalQuizWorkspace;
  initialKind?: AssessmentKind;
  onKindChange?: (kind: AssessmentKind) => void;
  onSaved: (activityId: string) => void;
  onCancel?: () => void;
}) {
  const [title, setTitle] = useState(initialWorkspace?.activity.title ?? '');
  const [introduction, setIntroduction] = useState(initialWorkspace?.activity.introduction ?? '');
  const [assessmentKind, setAssessmentKind] = useState<AssessmentKind>(
    initialWorkspace?.config.assessmentKind ?? initialKind ?? 'QUIZ',
  );
  const [releaseMode, setReleaseMode] = useState<QuizReleaseMode>(
    initialWorkspace?.config.releaseMode === 'ACADEMIC_APPROVAL_REQUIRED'
      ? 'INSTRUCTOR_PUBLISH'
      : (initialWorkspace?.config.releaseMode ?? 'AUTO_ON_SUBMIT'),
  );
  const [openAt, setOpenAt] = useState(() =>
    isoToDatetimeLocal(initialWorkspace?.activity.availableFrom),
  );
  const [closeAt, setCloseAt] = useState(() =>
    isoToDatetimeLocal(initialWorkspace?.activity.availableUntil),
  );
  const [durationMinutes, setDurationMinutes] = useState(
    initialWorkspace?.config.durationMinutes ?? 15,
  );
  const [maxAttempts, setMaxAttempts] = useState(initialWorkspace?.config.maxAttempts ?? 1);
  const [questions, setQuestions] = useState<EditableQuestion[]>(() =>
    initialWorkspace?.questions.length
      ? initialWorkspace.questions.map(fromWorkspaceQuestion)
      : [makeEmptyMcq()],
  );
  const totalPoints = useMemo(
    () => Math.round(questions.reduce((s, q) => s + (Number(q.points) || 0), 0) * 100) / 100,
    [questions],
  );
  const [passScoreTouched, setPassScoreTouched] = useState(Boolean(initialWorkspace));
  const [passScore, setPassScore] = useState<number>(
    initialWorkspace?.config.passScore ?? 0.5,
  );

  useEffect(() => {
    if (!passScoreTouched) {
      const half = Math.round(totalPoints * 0.5 * 2) / 2;
      setPassScore(Math.min(totalPoints, Math.max(totalPoints > 0 ? 0.5 : 0, half)));
    }
  }, [totalPoints, passScoreTouched]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [zoomedImage, setZoomedImage] = useState<QuizMediaItem | null>(null);

  // Question Bank Picker state
  const [bankOpen, setBankOpen] = useState(false);
  const [bankLoading, setBankLoading] = useState(false);
  const [bankError, setBankError] = useState('');
  const [bankSearch, setBankSearch] = useState('');
  const [bankTypeFilter, setBankTypeFilter] = useState<'ALL' | 'MCQ' | 'ESSAY'>('ALL');
  const [bankItems, setBankItems] = useState<QuestionBankItem[]>([]);
  const [bankTotalCourse, setBankTotalCourse] = useState(0);
  const [selectedBankIds, setSelectedBankIds] = useState<Record<string, boolean>>({});

  async function loadQuestionBank(searchValue = bankSearch, typeValue = bankTypeFilter) {
    setBankLoading(true);
    setBankError('');
    try {
      const res = await lmsLocalApi.getQuestionBank(classId, {
        search: searchValue.trim() || undefined,
        type: typeValue,
        limit: 40,
      });
      setBankItems(res.items);
      setBankTotalCourse(res.totalCourseQuestions);
    } catch (e) {
      setBankError(e instanceof Error ? e.message : 'Không tải được ngân hàng câu hỏi.');
    } finally {
      setBankLoading(false);
    }
  }

  function openQuestionBank() {
    setBankOpen(true);
    setSelectedBankIds({});
    void loadQuestionBank(bankSearch, bankTypeFilter);
  }

  function appendSelectedBankQuestions() {
    const picked = bankItems.filter((item) => selectedBankIds[item.id]);
    if (!picked.length) return;
    const mapped: EditableQuestion[] = picked.map((item) => {
      if (item.type === 'ESSAY') {
        return {
          id: crypto.randomUUID(),
          type: 'ESSAY',
          prompt: item.prompt,
          points: Number(item.points) || 2,
          options: [],
          correctOptionId: '',
          explanation: item.explanation || '',
        };
      }
      const opts = item.options.length
        ? item.options.map((o, idx) => ({ id: o.id || `opt_${idx + 1}`, text: o.text }))
        : [
            { id: crypto.randomUUID(), text: '' },
            { id: crypto.randomUUID(), text: '' },
          ];
      const matchedCorrect = opts.find((o) => o.id === item.correctOptionId)?.id ?? opts[0]?.id ?? '';
      return {
        id: crypto.randomUUID(),
        type: 'MCQ',
        prompt: item.prompt,
        points: Number(item.points) || 1,
        options: opts,
        correctOptionId: matchedCorrect,
        explanation: item.explanation || '',
      };
    });
    setQuestions((prev) => {
      const cleaned =
        prev.length === 1 && !prev[0].prompt.trim() && prev[0].options.every((o) => !o.text.trim())
          ? []
          : prev;
      return [...cleaned, ...mapped];
    });
    setBankOpen(false);
    setSelectedBankIds({});
  }

  function updateQuestion(index: number, patch: Partial<EditableQuestion>) {
    setQuestions((prev) => prev.map((q, i) => (i === index ? { ...q, ...patch } : q)));
  }

  function updateGroup(
    groupId: string,
    updater: (current: { groupTitle: string; media: QuizMediaItem[] }) => {
      groupTitle?: string;
      media?: QuizMediaItem[];
    },
  ) {
    setQuestions((prev) => {
      const sample = prev.find((q) => q.groupId === groupId);
      const next = updater({
        groupTitle: sample?.groupTitle ?? '',
        media: sample?.media ?? [],
      });
      return prev.map((q) =>
        q.groupId === groupId
          ? {
              ...q,
              ...(next.groupTitle !== undefined ? { groupTitle: next.groupTitle } : {}),
              ...(next.media !== undefined ? { media: next.media } : {}),
            }
          : q,
      );
    });
  }

  function addSharedGroup() {
    const groupId = crypto.randomUUID();
    setQuestions((prev) => {
      const cleaned =
        prev.length === 1 &&
        !prev[0].prompt.trim() &&
        !prev[0].groupId &&
        !(prev[0].media?.length) &&
        prev[0].options.every((o) => !o.text.trim())
          ? []
          : prev;
      return [...cleaned, makeEmptyMcq({ groupId, groupTitle: '', media: [] })];
    });
  }

  function addQuestionToGroup(groupId: string, type: 'MCQ' | 'ESSAY') {
    setQuestions((prev) => {
      const sample = prev.find((q) => q.groupId === groupId);
      const groupMeta = {
        groupId,
        groupTitle: sample?.groupTitle ?? '',
        media: sample?.media ?? [],
      };
      const newQ = type === 'ESSAY' ? makeEmptyEssay(groupMeta) : makeEmptyMcq(groupMeta);
      let lastIdx = -1;
      for (let i = 0; i < prev.length; i += 1) {
        if (prev[i].groupId === groupId) lastIdx = i;
      }
      if (lastIdx === -1) return [...prev, newQ];
      return [...prev.slice(0, lastIdx + 1), newQ, ...prev.slice(lastIdx + 1)];
    });
  }

  function removeGroup(groupId: string) {
    setQuestions((prev) => {
      const remaining = prev.filter((q) => q.groupId !== groupId);
      return remaining.length > 0 ? remaining : prev;
    });
  }

  function updateOption(qIndex: number, optIndex: number, text: string) {
    setQuestions((prev) =>
      prev.map((q, i) =>
        i === qIndex
          ? {
              ...q,
              options: q.options.map((o, oi) => (oi === optIndex ? { ...o, text } : o)),
            }
          : q,
      ),
    );
  }

  async function handleSave(publish: boolean) {
    setError('');
    setBusy(true);
    try {
      const openIso = datetimeLocalToIso(openAt);
      const closeIso = datetimeLocalToIso(closeAt);
      if (openIso && closeIso && new Date(closeIso).getTime() <= new Date(openIso).getTime()) {
        throw new Error('Thời gian đóng bài kiểm tra phải sau thời gian mở.');
      }
      if (!questions.length) {
        throw new Error('Vui lòng thêm ít nhất 1 câu hỏi vào đề.');
      }
      for (let i = 0; i < questions.length; i += 1) {
        const q = questions[i];
        if (!q.prompt.trim()) {
          throw new Error(`Câu ${i + 1}: Vui lòng nhập nội dung câu hỏi.`);
        }
        if (q.type === 'MCQ') {
          const filledOpts = q.options.filter((o) => o.text.trim().length > 0);
          if (filledOpts.length < 2) {
            throw new Error(`Câu ${i + 1}: Câu trắc nghiệm cần ít nhất 2 phương án có nội dung.`);
          }
          const pickedCorrect = q.options.find((o) => o.id === q.correctOptionId);
          if (!pickedCorrect || !pickedCorrect.text.trim()) {
            throw new Error(`Câu ${i + 1}: Vui lòng chọn đáp án đúng cho phương án có nội dung.`);
          }
        }
      }

      const payload = {
        title,
        introduction,
        assessmentKind,
        releaseMode,
        autoReleaseObjective: releaseMode === 'AUTO_ON_SUBMIT',
        passScore: Math.min(totalPoints, Math.max(0, Number(passScore) || 0)),
        openAt: openIso,
        closeAt: closeIso,
        durationMinutes: Number(durationMinutes) || 15,
        maxAttempts: Number(maxAttempts) || 1,
        publish,
        questions: questions.map((q) => ({
          id: q.id,
          type: q.type,
          prompt: q.prompt,
          points: Number(q.points) || 1,
          options: q.type === 'MCQ' ? q.options : [],
          correctOptionId: q.type === 'MCQ' ? q.correctOptionId : null,
          explanation: q.explanation,
          groupId: q.groupId ?? null,
          groupTitle: q.groupTitle ?? '',
          media: q.media ?? [],
        })),
      };

      const res = initialWorkspace
        ? await lmsLocalApi.updateLocalQuiz(classId, initialWorkspace.activity.id, payload)
        : await lmsLocalApi.createLocalQuiz(classId, sectionId!, payload);

      onSaved(res.activityId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không thể lưu cấu hình Quiz.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {error && (
        <p
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-900"
        >
          {error}
        </p>
      )}

      <section className="workspace-card space-y-4">
        <h2 className="text-lg font-extrabold text-slate-900">Thông tin, phân loại & thời gian mở</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-semibold text-slate-700 sm:col-span-2">
            Tiêu đề bài kiểm tra
            <input
              required
              className={field}
              placeholder="Ví dụ: Kiểm tra thường kỳ 1 - Ngữ pháp & Viết câu"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label className="block text-sm font-semibold text-slate-700">
            Phân loại kiểm tra / đánh giá
            <select
              className={field}
              value={assessmentKind}
              onChange={(e) => {
                const next = normalizeInitialKind(e.target.value);
                setAssessmentKind(next);
                onKindChange?.(next);
              }}
            >
              <option value="QUIZ">Quiz luyện tập</option>
              <option value="REGULAR">Kiểm tra thường kỳ (REGULAR)</option>
              <option value="MIDTERM">Kiểm tra giữa kỳ (MIDTERM)</option>
              <option value="FINAL">Kiểm tra cuối kỳ (FINAL)</option>
            </select>
          </label>
          <label className="block text-sm font-semibold text-slate-700">
            Chế độ công bố điểm
            <select
              className={field}
              value={releaseMode}
              onChange={(e) => setReleaseMode(e.target.value as QuizReleaseMode)}
            >
              <option value="AUTO_ON_SUBMIT">Công bố điểm trắc nghiệm ngay khi nộp</option>
              <option value="INSTRUCTOR_PUBLISH">Giảng viên xem & công bố điểm thủ công</option>
            </select>
          </label>
          <label className="block text-sm font-semibold text-slate-700 sm:col-span-2">
            Hướng dẫn làm bài
            <textarea
              rows={2}
              className={field}
              placeholder="Ghi chú nội quy, phạm vi kiến thức..."
              value={introduction}
              onChange={(e) => setIntroduction(e.target.value)}
            />
          </label>
          <label className="block text-sm font-semibold text-slate-700">
            Thời gian mở (đồng bộ Lịch tháng)
            <input
              type="datetime-local"
              className={field}
              value={openAt}
              onChange={(e) => setOpenAt(e.target.value)}
            />
          </label>
          <label className="block text-sm font-semibold text-slate-700">
            Thời gian đóng / hạn nộp
            <input
              type="datetime-local"
              className={field}
              value={closeAt}
              onChange={(e) => setCloseAt(e.target.value)}
            />
          </label>
          <label className="block text-sm font-semibold text-slate-700">
            Thời lượng làm bài (phút)
            <input
              type="number"
              min={1}
              max={240}
              className={field}
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(Number(e.target.value))}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm font-semibold text-slate-700">
              Số lượt làm tối đa
              <input
                type="number"
                min={1}
                max={20}
                className={field}
                value={maxAttempts}
                onChange={(e) => setMaxAttempts(Number(e.target.value))}
              />
            </label>
            <label className="block text-sm font-semibold text-slate-700">
              Điểm đạt (tối đa {totalPoints})
              <input
                type="number"
                min={0}
                step="0.5"
                max={totalPoints}
                className={field}
                value={passScore}
                onChange={(e) => {
                  setPassScoreTouched(true);
                  setPassScore(Number(e.target.value));
                }}
              />
            </label>
          </div>
        </div>
      </section>

      <section className="workspace-card space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-extrabold text-slate-900">
              Danh sách câu hỏi trong đề ({questions.length} câu · Tổng {totalPoints} điểm)
            </h2>
            <p className="text-xs text-slate-600">
              Câu trắc nghiệm được chấm điểm tự động ngay khi nộp; câu tự luận giữ trạng thái chờ
              giảng viên chấm.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={button + ' inline-flex items-center gap-1.5 border-[#76a35e] text-xs font-semibold text-[#2f5d1e]'}
              onClick={openQuestionBank}
            >
              <Database className="size-3.5" aria-hidden="true" />
              Chọn từ Ngân hàng câu hỏi
            </button>
            <button
              type="button"
              className={button + ' inline-flex items-center gap-1.5 text-xs font-semibold'}
              onClick={() => setQuestions((prev) => [...prev, makeEmptyMcq()])}
            >
              <Plus className="size-3.5" aria-hidden="true" />
              Thêm câu trắc nghiệm
            </button>
            <button
              type="button"
              className={button + ' inline-flex items-center gap-1.5 text-xs font-semibold'}
              onClick={() => setQuestions((prev) => [...prev, makeEmptyEssay()])}
            >
              <Plus className="size-3.5" aria-hidden="true" />
              Thêm câu tự luận
            </button>
            <button
              type="button"
              className={button + ' inline-flex items-center gap-1.5 border-indigo-300 bg-indigo-50/70 text-xs font-semibold text-indigo-900 hover:bg-indigo-100/70'}
              onClick={addSharedGroup}
            >
              <Layers className="size-3.5" aria-hidden="true" />
              + Thêm cụm câu chung tài liệu (Part 3–4 / Part 6–7)
            </button>
          </div>
        </div>

        {bankOpen && (
          <div
            role="dialog"
            aria-label="Ngân hàng câu hỏi khóa học"
            className="rounded-2xl border-2 border-[#76a35e]/50 bg-[#f8fbf6] p-4 space-y-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-extrabold text-slate-900">
                  Ngân hàng câu hỏi khóa học ({bankTotalCourse} câu hệ thống ·{' '}
                  {bankItems.filter((item) => item.source === 'CLASS_QUIZ').length} câu trong lớp)
                </h3>
                <p className="text-xs text-slate-600">
                  Chọn câu hỏi từ khóa học hoặc tái sử dụng từ các bài kiểm tra trong lớp.
                </p>
              </div>
              <button
                type="button"
                className={button + ' text-xs'}
                onClick={() => setBankOpen(false)}
              >
                Đóng
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-slate-400" />
                <input
                  type="text"
                  className={field + ' pl-9'}
                  placeholder="Tìm nội dung câu hỏi..."
                  value={bankSearch}
                  onChange={(e) => setBankSearch(e.target.value)}
                />
              </div>
              <select
                className={field + ' w-auto'}
                value={bankTypeFilter}
                onChange={(e) => {
                  const next = e.target.value as 'ALL' | 'MCQ' | 'ESSAY';
                  setBankTypeFilter(next);
                  void loadQuestionBank(bankSearch, next);
                }}
              >
                <option value="ALL">Tất cả loại câu</option>
                <option value="MCQ">Trắc nghiệm (MCQ)</option>
                <option value="ESSAY">Tự luận (ESSAY)</option>
              </select>
              <button
                type="button"
                className={button + ' text-xs font-semibold'}
                onClick={() => void loadQuestionBank(bankSearch, bankTypeFilter)}
              >
                Lọc ngân hàng
              </button>
            </div>

            {bankError && (
              <p role="alert" className="text-xs font-semibold text-rose-700">
                {bankError}
              </p>
            )}
            {bankLoading ? (
              <p className="text-xs text-slate-600">Đang tải ngân hàng câu hỏi…</p>
            ) : !bankItems.length ? (
              <p className="text-xs text-slate-600">Không tìm thấy câu hỏi phù hợp trong ngân hàng.</p>
            ) : (
              <div className="max-h-72 overflow-y-auto space-y-2 rounded-xl border border-slate-200 bg-white p-2.5">
                {bankItems.map((item) => {
                  const checked = Boolean(selectedBankIds[item.id]);
                  return (
                    <label
                      key={item.id}
                      className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-slate-100 p-2.5 hover:bg-slate-50"
                    >
                      <input
                        type="checkbox"
                        className="mt-1 size-4 accent-[#76a35e]"
                        checked={checked}
                        onChange={(e) =>
                          setSelectedBankIds((prev) => ({ ...prev, [item.id]: e.target.checked }))
                        }
                      />
                      <div className="min-w-0 flex-1 text-xs">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="rounded bg-violet-100 px-1.5 py-0.5 font-bold text-violet-900">
                            {item.type}
                          </span>
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-700">
                            {item.toeicSkill}
                          </span>
                          <span className="text-slate-500">{item.sourceLabel}</span>
                        </div>
                        <p className="mt-1 font-medium text-slate-900">{item.prompt}</p>
                        {item.options.length > 0 && (
                          <p className="mt-0.5 text-[11px] text-slate-500">
                            {item.options.length} phương án
                          </p>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                disabled={!Object.values(selectedBankIds).some(Boolean)}
                className={primaryBtn + ' text-xs'}
                onClick={appendSelectedBankQuestions}
              >
                Thêm câu hỏi đã chọn ({Object.values(selectedBankIds).filter(Boolean).length})
              </button>
            </div>
          </div>
        )}

        <div className="space-y-4">
          {groupQuizItems(questions).map((block) => {
            const renderAuthorQuestionCard = (
              q: EditableQuestion,
              qi: number,
              showMediaControls: boolean,
            ) => (
              <div
                key={q.id}
                className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="rounded-md bg-violet-100 px-2 py-0.5 text-xs font-bold text-violet-800">
                      Câu {qi + 1} · {q.type === 'MCQ' ? 'Trắc nghiệm (tự động chấm)' : 'Tự luận (GV chấm)'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                      Điểm:
                      <input
                        type="number"
                        step="0.5"
                        min="0.5"
                        max="100"
                        className="w-20 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-semibold"
                        value={q.points}
                        onChange={(e) => updateQuestion(qi, { points: Number(e.target.value) })}
                      />
                    </label>
                    {questions.length > 1 && (
                      <button
                        type="button"
                        aria-label={`Xóa câu ${qi + 1}`}
                        className="rounded-lg border border-rose-200 bg-white p-1.5 text-rose-700 hover:bg-rose-50"
                        onClick={() =>
                          setQuestions((prev) => prev.filter((_, idx) => idx !== qi))
                        }
                      >
                        <Trash2 className="size-3.5" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </div>

                {showMediaControls && (
                  <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-600">
                        Hình ảnh / Âm thanh cho câu {qi + 1} (tùy chọn · vd Part 1–2)
                      </span>
                      <QuizMediaUploadButtons
                        classId={classId}
                        compact
                        disabled={busy}
                        onUploaded={(items) =>
                          updateQuestion(qi, { media: [...(q.media ?? []), ...items] })
                        }
                        onError={setError}
                      />
                    </div>
                    <QuizMediaBlock
                      media={q.media}
                      compact
                      onZoomImage={setZoomedImage}
                      onRemoveMedia={(mediaId) =>
                        updateQuestion(qi, {
                          media: (q.media ?? []).filter((m) => m.id !== mediaId),
                        })
                      }
                    />
                  </div>
                )}

                <label className="block text-sm font-semibold text-slate-800">
                  Nội dung câu hỏi
                  <textarea
                    rows={2}
                    className={field}
                    placeholder={
                      q.type === 'MCQ'
                        ? 'Nhập câu hỏi trắc nghiệm...'
                        : 'Nhập yêu cầu bài tự luận...'
                    }
                    value={q.prompt}
                    onChange={(e) => updateQuestion(qi, { prompt: e.target.value })}
                  />
                </label>

                {q.type === 'MCQ' && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-slate-600">
                      Các lựa chọn (chọn 1 đáp án đúng):
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {q.options.map((opt, oi) => (
                        <label
                          key={opt.id}
                          className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2"
                        >
                          <input
                            type="radio"
                            name={`correct-${q.id}`}
                            checked={q.correctOptionId === opt.id}
                            onChange={() => updateQuestion(qi, { correctOptionId: opt.id })}
                            aria-label={`Đáp án đúng câu ${qi + 1} lựa chọn ${oi + 1}`}
                          />
                          <input
                            type="text"
                            className="w-full text-sm text-slate-900 focus:outline-none"
                            placeholder={`Phương án ${String.fromCharCode(65 + oi)}`}
                            value={opt.text}
                            onChange={(e) => updateOption(qi, oi, e.target.value)}
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                <label className="block text-xs font-semibold text-slate-600">
                  {q.type === 'MCQ' ? 'Giải thích đáp án (tùy chọn)' : 'Gợi ý / Tiêu chí chấm tự luận'}
                  <input
                    type="text"
                    className={field}
                    placeholder="Ghi chú sau khi học viên nộp bài..."
                    value={q.explanation}
                    onChange={(e) => updateQuestion(qi, { explanation: e.target.value })}
                  />
                </label>
              </div>
            );

            if (block.kind === 'single') {
              return renderAuthorQuestionCard(block.item, block.globalIndex, true);
            }

            const firstIdx = block.items[0]?.globalIndex ?? 0;
            const lastIdx = block.items[block.items.length - 1]?.globalIndex ?? firstIdx;
            return (
              <div
                key={block.groupId}
                className="rounded-2xl border-2 border-indigo-200 bg-indigo-50/30 p-4 space-y-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-indigo-100 pb-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-md bg-indigo-100 px-2.5 py-0.5 text-xs font-bold text-indigo-900">
                      <Layers className="size-3.5" aria-hidden="true" />
                      Cụm câu chung tài liệu · Câu {firstIdx + 1}–{lastIdx + 1}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className={button + ' text-xs font-semibold'}
                      onClick={() => addQuestionToGroup(block.groupId, 'MCQ')}
                    >
                      + Thêm câu TN vào cụm
                    </button>
                    <button
                      type="button"
                      className={button + ' text-xs font-semibold'}
                      onClick={() => addQuestionToGroup(block.groupId, 'ESSAY')}
                    >
                      + Thêm câu tự luận vào cụm
                    </button>
                    {questions.length > block.items.length && (
                      <button
                        type="button"
                        onClick={() => removeGroup(block.groupId)}
                        className="rounded-lg border border-rose-200 bg-white px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                      >
                        Xóa cụm
                      </button>
                    )}
                  </div>
                </div>

                <label className="block text-xs font-semibold text-slate-700">
                  Tiêu đề cụm / Chỉ dẫn chung (tùy chọn)
                  <input
                    type="text"
                    className={field}
                    placeholder="Ví dụ: Part 6 · Đoạn văn 131–134 (hoặc Part 3 · Hội thoại 32–34)"
                    value={block.groupTitle}
                    onChange={(e) =>
                      updateGroup(block.groupId, () => ({ groupTitle: e.target.value }))
                    }
                  />
                </label>

                <div className="rounded-xl border border-indigo-200 bg-white p-3.5 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-800">
                      Tài liệu chung của cụm (Ảnh chụp đoạn văn PDF / Bảng biểu / Audio nghe)
                    </span>
                    <QuizMediaUploadButtons
                      classId={classId}
                      disabled={busy}
                      onUploaded={(items) =>
                        updateGroup(block.groupId, (cur) => ({
                          media: [...cur.media, ...items],
                        }))
                      }
                      onError={setError}
                    />
                  </div>
                  <QuizMediaBlock
                    media={block.media}
                    compact
                    onZoomImage={setZoomedImage}
                    onRemoveMedia={(mediaId) =>
                      updateGroup(block.groupId, (cur) => ({
                        media: cur.media.filter((m) => m.id !== mediaId),
                      }))
                    }
                  />
                </div>

                <div className="space-y-3">
                  {block.items.map(({ item, globalIndex }) =>
                    renderAuthorQuestionCard(item, globalIndex, false),
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <QuizZoomModal image={zoomedImage} onClose={() => setZoomedImage(null)} />

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={busy || !title.trim()}
          className={primaryBtn}
          onClick={() => void handleSave(true)}
        >
          {busy ? 'Đang lưu…' : 'Lưu và công bố Quiz'}
        </button>
        <button
          type="button"
          disabled={busy || !title.trim()}
          className={button}
          onClick={() => void handleSave(false)}
        >
          Lưu bản nháp (chưa công bố)
        </button>
        {onCancel && (
          <button type="button" className={button} onClick={onCancel}>
            Hủy
          </button>
        )}
      </div>
    </div>
  );
}

export function LocalQuizCreatePage() {
  const { classId = '', sectionId = '' } = useParams();
  const [searchParams] = useSearchParams();
  const initialKind = normalizeInitialKind(searchParams.get('kind'));
  const [currentKind, setCurrentKind] = useState<AssessmentKind>(initialKind);
  const navigate = useNavigate();

  return (
    <main className="workspace-page max-w-4xl space-y-6">
      <Link
        to={`/classroom/${classId}?edit=1`}
        className="text-sm font-semibold text-indigo-700 hover:underline"
      >
        ← Quay lại nội dung lớp
      </Link>
      <header className="workspace-header">
        <p className="text-xs font-extrabold uppercase tracking-wider text-violet-700">
          Hoạt động kiểm tra kiến thức trong chủ đề
        </p>
        <h1 className="mt-1 text-2xl font-extrabold text-slate-900">
          Soạn {ASSESSMENT_KIND_LABELS[currentKind]} (Trắc nghiệm & Tự luận)
        </h1>
      </header>
      <LocalQuizAuthorForm
        classId={classId}
        sectionId={sectionId}
        initialKind={initialKind}
        onKindChange={setCurrentKind}
        onSaved={(activityId) => navigate(`/classroom/${classId}/activities/${activityId}`)}
        onCancel={() => navigate(`/classroom/${classId}?edit=1`)}
      />
    </main>
  );
}

function AttemptResultCard({ attempt, passScore }: { attempt: LocalQuizAttempt; passScore?: number }) {
  const [zoomedImage, setZoomedImage] = useState<QuizMediaItem | null>(null);
  const scoreVisible =
    attempt.scoreVisible !== false &&
    attempt.gradePublished !== false &&
    attempt.gradingStatus !== 'PENDING_MANUAL_GRADE';
  const passed = scoreVisible && passScore !== undefined ? attempt.totalScore >= passScore : null;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Lượt làm #{attempt.attemptNumber} · Nộp lúc{' '}
            {attempt.submittedAt ? schoolTimestamp(attempt.submittedAt) : '—'}
          </p>
          <p className="mt-1 text-xl font-extrabold text-slate-900">
            {!scoreVisible ? (
              <span className="text-amber-800">
                Bài làm đã ghi nhận — Điểm đang chờ giảng viên chấm / công bố
              </span>
            ) : (
              <>
                Tổng điểm:{' '}
                <span className="text-emerald-700">
                  {attempt.totalScore} / {attempt.maxScore}
                </span>{' '}
                điểm
                {passed !== null && (
                  <span
                    className={`ml-2 inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${
                      passed
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-rose-100 text-rose-800'
                    }`}
                  >
                    {passed ? 'Đạt chuẩn' : 'Chưa đạt'} (mức đạt {passScore})
                  </span>
                )}
              </>
            )}
          </p>
        </div>

        <div>
          {attempt.gradingStatus === 'PENDING_MANUAL_GRADE' && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-bold text-amber-900">
              <Clock className="size-3.5" aria-hidden="true" />
              Đang chờ giảng viên chấm tự luận
            </span>
          )}
          {attempt.gradingStatus !== 'PENDING_MANUAL_GRADE' && !scoreVisible && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-bold text-amber-900">
              <Clock className="size-3.5" aria-hidden="true" />
              Chờ giảng viên công bố điểm
            </span>
          )}
          {attempt.gradingStatus === 'AUTO_GRADED' && scoreVisible && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-900">
              <CheckCircle2 className="size-3.5" aria-hidden="true" />
              Đã chấm tự động & công bố
            </span>
          )}
          {attempt.gradingStatus === 'GRADED' && scoreVisible && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-300 bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-900">
              <FileCheck2 className="size-3.5" aria-hidden="true" />
              Đã chấm đủ (Trắc nghiệm {attempt.autoScore} + Tự luận {attempt.manualScore})
            </span>
          )}
        </div>
      </div>

      {scoreVisible && attempt.teacherFeedback && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-3 text-sm text-indigo-950">
          <span className="font-bold">Nhận xét giảng viên:</span> {attempt.teacherFeedback}
        </div>
      )}

      <div className="space-y-3">
        {groupQuizItems(attempt.answers).map((block) => {
          const renderAnswerRow = (ans: LocalQuizAttempt['answers'][number], idx: number, showMedia: boolean) => {
            const manual = attempt.manualGrades?.[ans.questionId];
            return (
              <div
                key={ans.questionId}
                className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3.5 text-sm space-y-2"
              >
                {showMedia && ans.media && ans.media.length > 0 && (
                  <QuizMediaBlock media={ans.media} compact onZoomImage={setZoomedImage} />
                )}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-bold text-slate-900">
                    Câu {idx + 1}: {ans.prompt}
                  </p>
                  {!scoreVisible ? (
                    <span className="rounded-md bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-700">
                      Chờ công bố kết quả ({ans.points} điểm)
                    </span>
                  ) : ans.type === 'MCQ' ? (
                    ans.isCorrect ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">
                        <CheckCircle2 className="size-3.5" aria-hidden="true" />+{ans.autoEarned} /{' '}
                        {ans.points} điểm
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-md bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-800">
                        <XCircle className="size-3.5" aria-hidden="true" />0 / {ans.points} điểm
                      </span>
                    )
                  ) : attempt.gradingStatus === 'GRADED' && manual ? (
                    <span className="rounded-md bg-indigo-100 px-2 py-0.5 text-xs font-bold text-indigo-800">
                      Tự luận: {manual.score} / {ans.points} điểm
                    </span>
                  ) : (
                    <span className="rounded-md bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">
                      Chờ chấm ({ans.points} điểm)
                    </span>
                  )}
                </div>

                {ans.type === 'MCQ' ? (
                  <div className="text-xs text-slate-700 space-y-0.5">
                    <p>
                      Bạn chọn: <strong>{ans.selectedOptionText || '(Bỏ trống)'}</strong>
                    </p>
                    {scoreVisible && !ans.isCorrect && ans.correctOptionText && (
                      <p className="text-emerald-800">
                        Đáp án đúng: <strong>{ans.correctOptionText}</strong>
                      </p>
                    )}
                    {scoreVisible && ans.explanation && (
                      <p className="text-slate-500">Giải thích: {ans.explanation}</p>
                    )}
                  </div>
                ) : (
                  <div className="text-xs text-slate-700 space-y-1">
                    <p className="whitespace-pre-wrap rounded-lg border border-slate-200 bg-white p-2.5 text-slate-800">
                      {ans.textAnswer || '(Không có nội dung trả lời)'}
                    </p>
                    {scoreVisible && manual?.comment && (
                      <p className="text-indigo-800">
                        Ghi chú GV: <strong>{manual.comment}</strong>
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          };

          if (block.kind === 'single') {
            return renderAnswerRow(block.item, block.globalIndex, true);
          }

          return (
            <div
              key={block.groupId}
              className="rounded-xl border border-indigo-200 bg-indigo-50/20 p-3.5 space-y-3"
            >
              {block.groupTitle && (
                <p className="text-xs font-extrabold uppercase tracking-wide text-indigo-900">
                  {block.groupTitle}
                </p>
              )}
              {block.media.length > 0 && (
                <QuizMediaBlock media={block.media} compact onZoomImage={setZoomedImage} />
              )}
              <div className="space-y-2.5">
                {block.items.map(({ item, globalIndex }) =>
                  renderAnswerRow(item, globalIndex, false),
                )}
              </div>
            </div>
          );
        })}
      </div>
      <QuizZoomModal image={zoomedImage} onClose={() => setZoomedImage(null)} />
    </div>
  );
}

function TeacherEssayGradingRow({
  attempt,
  onGrade,
  busy,
}: {
  attempt: LocalQuizAttempt;
  onGrade: (
    attemptId: string,
    scores: Record<string, { score: number; comment?: string }>,
    feedback: string,
    publishGrade: boolean,
  ) => Promise<void>;
  busy: boolean;
}) {
  const [open, setOpen] = useState(attempt.gradingStatus === 'PENDING_MANUAL_GRADE');
  const essayAnswers = attempt.answers.filter((a) => a.type === 'ESSAY');
  const [scores, setScores] = useState<Record<string, { score: string; comment: string }>>(() => {
    const init: Record<string, { score: string; comment: string }> = {};
    for (const eq of essayAnswers) {
      const existing = attempt.manualGrades?.[eq.questionId];
      init[eq.questionId] = {
        score: existing ? String(existing.score) : '',
        comment: existing?.comment ?? '',
      };
    }
    return init;
  });
  const [feedback, setFeedback] = useState(attempt.teacherFeedback ?? '');

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-bold text-slate-900">
            {attempt.learner?.fullName ?? 'Học viên'} · Lượt #{attempt.attemptNumber}
          </p>
          <p className="text-xs text-slate-600">
            {attempt.learner?.email} · Nộp:{' '}
            {attempt.submittedAt ? schoolTimestamp(attempt.submittedAt) : 'Đang làm'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-800">
            Trắc nghiệm: {attempt.autoScore}/{attempt.objectiveMax}
          </span>
          {attempt.hasEssay && (
            <span className="rounded-md bg-indigo-50 px-2.5 py-1 text-xs font-bold text-indigo-800">
              Tự luận: {attempt.gradingStatus === 'GRADED' ? attempt.manualScore : '?'} /{' '}
              {attempt.essayMax}
            </span>
          )}
          <span className="rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-extrabold text-emerald-900">
            Tổng: {attempt.totalScore}/{attempt.maxScore}
          </span>
          <span
            className={`rounded-md px-2.5 py-1 text-xs font-bold ${
              attempt.gradePublished !== false && attempt.gradingStatus !== 'PENDING_MANUAL_GRADE'
                ? 'bg-emerald-100 text-emerald-900'
                : 'bg-amber-100 text-amber-900'
            }`}
          >
            {attempt.gradePublished !== false && attempt.gradingStatus !== 'PENDING_MANUAL_GRADE'
              ? 'Đã công bố'
              : 'Chưa công bố'}
          </span>
          {attempt.status === 'SUBMITTED' && !attempt.hasEssay && attempt.gradePublished === false && (
            <button
              type="button"
              disabled={busy}
              className={emeraldBtn + ' px-3 py-1 text-xs'}
              onClick={() => void onGrade(attempt.id, {}, feedback, true)}
            >
              Công bố điểm
            </button>
          )}
          {attempt.hasEssay && attempt.status === 'SUBMITTED' && (
            <button
              type="button"
              className={button + ' text-xs font-semibold'}
              onClick={() => setOpen((o) => !o)}
            >
              {open ? 'Thu gọn' : 'Chấm tự luận'}
            </button>
          )}
        </div>
      </div>

      {open && essayAnswers.length > 0 && (
        <div className="space-y-3 border-t border-slate-100 pt-3">
          {essayAnswers.map((eq, idx) => (
            <div key={eq.questionId} className="rounded-lg bg-slate-50 p-3 space-y-2">
              <p className="text-sm font-bold text-slate-900">
                Tự luận #{idx + 1} (Tối đa {eq.points} điểm): {eq.prompt}
              </p>
              <p className="whitespace-pre-wrap rounded-lg border border-slate-200 bg-white p-2.5 text-sm text-slate-800">
                {eq.textAnswer || '(Học viên bỏ trống)'}
              </p>
              <div className="grid gap-2 sm:grid-cols-3">
                <label className="text-xs font-semibold text-slate-700">
                  Điểm (0 - {eq.points})
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    max={eq.points}
                    className={field}
                    value={scores[eq.questionId]?.score ?? ''}
                    onChange={(e) =>
                      setScores((prev) => ({
                        ...prev,
                        [eq.questionId]: {
                          ...prev[eq.questionId],
                          score: e.target.value,
                        },
                      }))
                    }
                  />
                </label>
                <label className="text-xs font-semibold text-slate-700 sm:col-span-2">
                  Nhận xét câu trả lời
                  <input
                    type="text"
                    className={field}
                    placeholder="Góp ý riêng cho câu tự luận..."
                    value={scores[eq.questionId]?.comment ?? ''}
                    onChange={(e) =>
                      setScores((prev) => ({
                        ...prev,
                        [eq.questionId]: {
                          ...prev[eq.questionId],
                          comment: e.target.value,
                        },
                      }))
                    }
                  />
                </label>
              </div>
            </div>
          ))}
          <label className="block text-xs font-semibold text-slate-700">
            Nhận xét chung cho lượt làm bài
            <input
              type="text"
              className={field}
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              className={emeraldBtn}
              onClick={() => {
                const mapped: Record<string, { score: number; comment?: string }> = {};
                for (const eq of essayAnswers) {
                  mapped[eq.questionId] = {
                    score: Number(scores[eq.questionId]?.score || 0),
                    comment: scores[eq.questionId]?.comment ?? '',
                  };
                }
                void onGrade(attempt.id, mapped, feedback, true);
              }}
            >
              {busy ? 'Đang lưu điểm…' : 'Chấm & công bố điểm'}
            </button>
            <button
              type="button"
              disabled={busy}
              className={button}
              onClick={() => {
                const mapped: Record<string, { score: number; comment?: string }> = {};
                for (const eq of essayAnswers) {
                  mapped[eq.questionId] = {
                    score: Number(scores[eq.questionId]?.score || 0),
                    comment: scores[eq.questionId]?.comment ?? '',
                  };
                }
                void onGrade(attempt.id, mapped, feedback, false);
              }}
            >
              Lưu điểm nháp (chưa công bố)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function LocalQuizPanel({
  classId,
  activityId,
  onActivityRefresh,
}: {
  classId: string;
  activityId: string;
  onActivityRefresh?: () => void;
}) {
  const [ws, setWs] = useState<LocalQuizWorkspace | null>(null);
  const [error, setError] = useState('');
  const [statusMsg, setStatusMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftAnswers, setDraftAnswers] = useState<
    Record<string, { selectedOptionId?: string | null; textAnswer?: string }>
  >({});
  const [tick, setTick] = useState(0);
  const [zoomedImage, setZoomedImage] = useState<QuizMediaItem | null>(null);

  async function load() {
    try {
      const data = await lmsLocalApi.getQuizWorkspace(classId, activityId);
      setWs(data);
      setError('');
      if (data.activeAttempt?.answers) {
        const mapped: Record<string, { selectedOptionId?: string | null; textAnswer?: string }> = {};
        for (const a of data.activeAttempt.answers) {
          mapped[a.questionId] = {
            selectedOptionId: a.selectedOptionId ?? null,
            textAnswer: a.textAnswer ?? '',
          };
        }
        setDraftAnswers(mapped);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không tải được dữ liệu Quiz.');
    }
  }

  useEffect(() => {
    void load();
  }, [classId, activityId]);

  useEffect(() => {
    if (!ws?.activeAttempt) return;
    const timer = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(timer);
  }, [ws?.activeAttempt?.id]);

  async function handleStart() {
    setBusy(true);
    setError('');
    try {
      const updated = await lmsLocalApi.startQuizAttempt(classId, activityId);
      setWs(updated);
      setStatusMsg('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không thể bắt đầu làm bài.');
    } finally {
      setBusy(false);
    }
  }

  async function handleAttemptAction(submit: boolean) {
    if (!ws?.activeAttempt) return;
    setBusy(true);
    setError('');
    try {
      const answersPayload = ws.questions.map((q) => ({
        questionId: q.id,
        selectedOptionId: draftAnswers[q.id]?.selectedOptionId ?? null,
        textAnswer: draftAnswers[q.id]?.textAnswer ?? '',
      }));
      const updated = await lmsLocalApi.submitQuizAttempt(
        classId,
        activityId,
        ws.activeAttempt.id,
        { answers: answersPayload, submit },
      );
      setWs(updated);
      setStatusMsg(
        submit
          ? 'Đã nộp bài kiểm tra. Kết quả trắc nghiệm được cập nhật ngay bên dưới.'
          : 'Đã lưu nháp câu trả lời.',
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không thể lưu bài làm.');
    } finally {
      setBusy(false);
    }
  }

  async function handleGradeEssay(
    attemptId: string,
    scoresByQuestionId: Record<string, { score: number; comment?: string }>,
    teacherFeedback: string,
    publishGrade = true,
  ) {
    setBusy(true);
    setError('');
    try {
      const updated = await lmsLocalApi.gradeQuizEssay(classId, activityId, attemptId, {
        scoresByQuestionId,
        teacherFeedback,
        publishGrade,
      });
      setWs(updated);
      setStatusMsg(
        publishGrade
          ? 'Đã lưu điểm và công bố kết quả cho học viên.'
          : 'Đã lưu điểm nháp (chưa công bố cho học viên).',
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không lưu được điểm tự luận.');
    } finally {
      setBusy(false);
    }
  }

  if (error && !ws) {
    return (
      <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
        {error}
      </p>
    );
  }
  if (!ws) {
    return <p role="status">Đang tải không gian Quiz…</p>;
  }

  // TEACHER VIEW
  if (ws.editable) {
    return (
      <div className="space-y-6">
        {error && (
          <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
            {error}
          </p>
        )}
        {statusMsg && (
          <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900">
            {statusMsg}
          </p>
        )}

        <section className="workspace-card space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-md bg-violet-100 px-2.5 py-0.5 text-xs font-bold text-violet-900">
                  <HelpCircle className="size-3.5" aria-hidden="true" />
                  {ASSESSMENT_KIND_LABELS[ws.config.assessmentKind ?? 'QUIZ']} ·{' '}
                  {ws.summary.questionCount} câu ({ws.summary.mcqCount} trắc nghiệm ·{' '}
                  {ws.summary.essayCount} tự luận)
                </span>
                <span className="rounded-md bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-800">
                  {ws.config.durationMinutes} phút · Tối đa {ws.config.maxAttempts} lượt ·{' '}
                  {ws.summary.totalPoints} điểm (đạt từ {ws.config.passScore})
                </span>
              </div>
              <p className="text-xs text-slate-600">
                Đã nộp: <strong>{ws.stats?.submittedCount ?? 0}</strong>/{ws.stats?.enrolledCount ?? 0}{' '}
                học viên · Chờ chấm tự luận: <strong>{ws.stats?.pendingEssayCount ?? 0}</strong>
              </p>
            </div>

            <button
              type="button"
              className={button + ' inline-flex items-center gap-1.5 text-xs font-semibold'}
              onClick={() => setEditing((v) => !v)}
            >
              <Edit3 className="size-3.5" aria-hidden="true" />
              {editing ? 'Đóng trình sửa đề' : 'Chỉnh sửa đề, ngày mở/đóng & công bố'}
            </button>
          </div>
        </section>

        {editing ? (
          <LocalQuizAuthorForm
            classId={classId}
            initialWorkspace={ws}
            onSaved={() => {
              setEditing(false);
              setStatusMsg('Đã cập nhật đề và cấu hình Quiz.');
              void load();
              onActivityRefresh?.();
            }}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <section className="space-y-3">
            <h2 className="text-lg font-extrabold text-slate-900">
              Bài làm của học viên & chấm câu tự luận ({ws.attempts?.length ?? 0})
            </h2>
            {!ws.attempts?.length ? (
              <p className="workspace-card text-sm text-slate-600">
                Chưa có học viên nào bắt đầu làm bài kiểm tra này.
              </p>
            ) : (
              ws.attempts.map((att) => (
                <TeacherEssayGradingRow
                  key={att.id}
                  attempt={att}
                  onGrade={handleGradeEssay}
                  busy={busy}
                />
              ))
            )}
          </section>
        )}
      </div>
    );
  }

  // STUDENT VIEW
  const active = ws.activeAttempt;
  const countdown = active ? formatCountdown(active.deadlineAt) : null;
  void tick;

  return (
    <div className="space-y-6">
      {error && (
        <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          {error}
        </p>
      )}
      {statusMsg && (
        <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900">
          {statusMsg}
        </p>
      )}

      <section className="rounded border border-slate-200 bg-[#f8f9fa] p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-700">
              <span className="rounded border border-slate-200 bg-white px-2.5 py-1 font-semibold">
                {ws.summary.questionCount} câu ({ws.summary.mcqCount} trắc nghiệm ·{' '}
                {ws.summary.essayCount} tự luận)
              </span>
              <span className="rounded border border-slate-200 bg-white px-2.5 py-1 font-semibold">
                Thời gian: {ws.config.durationMinutes} phút · Tối đa {ws.config.maxAttempts} lượt ·{' '}
                Tổng {ws.summary.totalPoints} điểm
              </span>
              <span
                className={`rounded px-2.5 py-1 font-semibold ${
                  ws.windowStatus === 'OPEN'
                    ? 'bg-[#dcfce7] text-emerald-900'
                    : ws.windowStatus === 'UPCOMING'
                      ? 'bg-amber-100 text-amber-900'
                      : 'bg-rose-100 text-rose-900'
                }`}
              >
                {ws.windowStatus === 'OPEN'
                  ? 'Đang mở làm bài'
                  : ws.windowStatus === 'UPCOMING'
                    ? 'Chưa tới giờ mở'
                    : 'Đã đóng hạn'}
              </span>
            </div>
          </div>

          {!active && ws.canStartNew && (
            <button
              type="button"
              disabled={busy}
              className="inline-flex items-center justify-center gap-1.5 rounded bg-[#76a35e] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#658f50] disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => void handleStart()}
            >
              <Send className="size-4" aria-hidden="true" />
              {busy ? 'Đang mở bài…' : 'Bắt đầu làm bài Quiz'}
            </button>
          )}
        </div>
      </section>

      {active && (
        <section className="rounded border border-slate-300 bg-white p-5 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-lg font-extrabold text-slate-900">
                Đang làm lượt #{active.attemptNumber}
              </h2>
              <p className="text-xs text-slate-600">
                Chọn đáp án cho câu trắc nghiệm và viết câu trả lời tự luận bên dưới.
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-xl bg-amber-100 px-3 py-1.5 text-sm font-extrabold text-amber-950">
              <Clock className="size-4" aria-hidden="true" />
              Còn lại: {countdown}
            </span>
          </div>

          <div className="space-y-5">
            {groupQuizItems(ws.questions).map((block) => {
              const renderStudentQuestionCard = (
                q: LocalQuizQuestion,
                qi: number,
                showMedia: boolean,
              ) => (
                <div
                  key={q.id}
                  className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-3"
                >
                  {showMedia && q.media && q.media.length > 0 && (
                    <QuizMediaBlock media={q.media} onZoomImage={setZoomedImage} />
                  )}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-bold text-slate-900">
                      Câu {qi + 1}. {q.prompt}
                    </p>
                    <span className="rounded-md bg-white px-2 py-0.5 text-xs font-bold text-slate-700 border border-slate-200">
                      {q.type === 'MCQ' ? 'Trắc nghiệm' : 'Tự luận'} · {q.points} điểm
                    </span>
                  </div>

                  {q.type === 'MCQ' ? (
                    <div className="space-y-2">
                      {q.options.map((opt) => (
                        <label
                          key={opt.id}
                          className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm hover:border-indigo-400"
                        >
                          <input
                            type="radio"
                            name={`ans-${q.id}`}
                            checked={draftAnswers[q.id]?.selectedOptionId === opt.id}
                            onChange={() =>
                              setDraftAnswers((prev) => ({
                                ...prev,
                                [q.id]: { ...prev[q.id], selectedOptionId: opt.id },
                              }))
                            }
                          />
                          <span className="text-slate-900">{opt.text}</span>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <textarea
                      rows={4}
                      className={field}
                      placeholder="Nhập câu trả lời tự luận của bạn..."
                      value={draftAnswers[q.id]?.textAnswer ?? ''}
                      onChange={(e) =>
                        setDraftAnswers((prev) => ({
                          ...prev,
                          [q.id]: { ...prev[q.id], textAnswer: e.target.value },
                        }))
                      }
                    />
                  )}
                </div>
              );

              if (block.kind === 'single') {
                return renderStudentQuestionCard(block.item, block.globalIndex, true);
              }

              const hasImages = block.media.some((m) => m.kind === 'IMAGE');
              const firstIdx = block.items[0]?.globalIndex ?? 0;
              const lastIdx = block.items[block.items.length - 1]?.globalIndex ?? firstIdx;

              return (
                <div
                  key={block.groupId}
                  className="rounded-2xl border-2 border-indigo-200 bg-white p-4 space-y-4 shadow-2xs"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1 rounded-md bg-indigo-100 px-2.5 py-0.5 text-xs font-bold text-indigo-900">
                        <Layers className="size-3.5" aria-hidden="true" />
                        Câu {firstIdx + 1}–{lastIdx + 1}
                      </span>
                      {block.groupTitle && (
                        <h3 className="text-sm font-bold text-slate-900">{block.groupTitle}</h3>
                      )}
                    </div>
                  </div>

                  {hasImages ? (
                    <div className="grid gap-5 lg:grid-cols-12 lg:items-start">
                      <div className="space-y-3 lg:col-span-6 lg:sticky lg:top-4 lg:max-h-[75vh] lg:overflow-y-auto lg:pr-1">
                        <QuizMediaBlock media={block.media} onZoomImage={setZoomedImage} />
                      </div>
                      <div className="space-y-4 lg:col-span-6">
                        {block.items.map(({ item, globalIndex }) =>
                          renderStudentQuestionCard(item, globalIndex, false),
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {block.media.length > 0 && (
                        <QuizMediaBlock media={block.media} onZoomImage={setZoomedImage} />
                      )}
                      {block.items.map(({ item, globalIndex }) =>
                        renderStudentQuestionCard(item, globalIndex, false),
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={busy}
              className="inline-flex items-center justify-center gap-1.5 rounded bg-[#76a35e] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#658f50] disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => void handleAttemptAction(true)}
            >
              {busy ? 'Đang nộp bài…' : 'Nộp bài Quiz'}
            </button>
            <button
              type="button"
              disabled={busy}
              className={button}
              onClick={() => void handleAttemptAction(false)}
            >
              Lưu tạm câu trả lời
            </button>
          </div>
        </section>
      )}

      {(ws.myAttempts ?? []).filter((a) => a.status === 'SUBMITTED').length > 0 && (
        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-[#e66f2b]">Kết quả & lịch sử làm bài</h2>
          {(ws.myAttempts ?? [])
            .filter((a) => a.status === 'SUBMITTED')
            .map((att) => (
              <AttemptResultCard key={att.id} attempt={att} passScore={ws.config.passScore} />
            ))}
        </section>
      )}

      <QuizZoomModal image={zoomedImage} onClose={() => setZoomedImage(null)} />
    </div>
  );
}
