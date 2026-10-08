import { FormEvent, useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { assessmentApi } from '@/features/assessments/api';
import {
  difficultyLabel,
  questionTypeLabel,
  toeicSkillLabel,
} from '@/features/assessments/display';
import { assessmentErrorMessage } from '@/features/assessments/errors';
import type {
  AssessmentQuestion,
  QuestionDifficulty,
  QuestionInput,
  QuestionType,
  ToeicSkill,
  RubricSummary,
  QuestionImportPreview,
} from '@/features/assessments/types';
import { useSessionExpiry } from '@/features/auth/use-session-expiry';
import { knowledgeModelApi } from '@/features/knowledge-model/api';
import { SkillChecklistDialog } from '@/features/knowledge-model/SkillChecklistDialog';
import type { Skill } from '@/features/knowledge-model/types';
import { instructorApi } from '@/features/instructor/api';

type EditableOption = { content: string; isCorrect: boolean };

const emptyOptions = (): EditableOption[] => [
  { content: '', isCorrect: true },
  { content: '', isCorrect: false },
];

export function QuestionBankPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const [searchParams] = useSearchParams();
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
  const [rubrics, setRubrics] = useState<RubricSummary[]>([]);
  const [skillFilter, setSkillFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [difficultyFilter, setDifficultyFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [usageFilter, setUsageFilter] = useState<'ALL' | 'USED' | 'UNUSED'>('ALL');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [importPreview, setImportPreview] = useState<QuestionImportPreview | null>(null);
  const [importConfirmOpen, setImportConfirmOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [courseSkills, setCourseSkills] = useState<Skill[] | null>(null);
  const [mappingQuestion, setMappingQuestion] = useState<AssessmentQuestion | null>(null);
  const [mappedSkillIds, setMappedSkillIds] = useState<string[]>([]);
  const [mappingError, setMappingError] = useState<string | null>(null);
  const [mappingLoading, setMappingLoading] = useState(false);
  const [courseTitle, setCourseTitle] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    if (!courseId) return () => controller.abort();
    void instructorApi.teaching
      .list(controller.signal)
      .then((entries) => {
        setCourseTitle(entries.find((entry) => entry.course.id === courseId)?.course.title ?? '');
      })
      .catch((error: unknown) => {
        if (!(error instanceof Error && error.name === 'AbortError')) setCourseTitle('');
      });
    return () => controller.abort();
  }, [courseId]);

  useEffect(() => {
    const controller = new AbortController();
    async function fetchQuestions() {
      if (!courseId) return;
      try {
        const data = await assessmentApi.questions.page(
          courseId,
          {
            page,
            pageSize,
            search: search.trim() || undefined,
            skill: skillFilter === 'ALL' ? undefined : (skillFilter as ToeicSkill),
            responseType: typeFilter === 'ALL' ? undefined : (typeFilter as QuestionType),
            difficulty:
              difficultyFilter === 'ALL' ? undefined : (difficultyFilter as QuestionDifficulty),
            usage: usageFilter,
          },
          controller.signal,
        );
        const rubricData = await assessmentApi.rubrics.list(controller.signal).catch(() => []);
        setQuestions(data.items);
        setTotal(data.total);
        setTotalPages(data.totalPages);
        setRubrics(rubricData);
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
  }, [
    courseId,
    redirectExpiredSession,
    reloadKey,
    page,
    pageSize,
    search,
    skillFilter,
    typeFilter,
    difficultyFilter,
    usageFilter,
  ]);

  const returnTo = searchParams.get('returnTo');
  const safeReturnTo = returnTo?.startsWith('/instructor/') ? returnTo : '/instructor/teaching';

  const previewImport = async (file?: File) => {
    if (!courseId || !file) return;
    setImporting(true);
    setActionError(null);
    try {
      setImportPreview(await assessmentApi.questions.previewImport(courseId, file));
    } catch (error) {
      setActionError(assessmentErrorMessage(error, 'Không thể kiểm tra tệp XLSX.'));
    } finally {
      setImporting(false);
    }
  };

  const confirmImport = async () => {
    if (!courseId || !importPreview?.canConfirm) return;
    setImporting(true);
    try {
      const rows = importPreview.rows.flatMap((row) => (row.input ? [row.input] : []));
      const result = await assessmentApi.questions.confirmImport(courseId, rows);
      setActionMessage(`Đã nhập ${result.importedCount} câu hỏi.`);
      setImportPreview(null);
      setImportConfirmOpen(false);
      setPage(1);
      setReloadKey((value) => value + 1);
    } catch (error) {
      setActionError(
        assessmentErrorMessage(
          error,
          'Không thể xác nhận nhập câu hỏi. Không có dữ liệu nào được ghi.',
        ),
      );
    } finally {
      setImporting(false);
    }
  };

  const deleteSelected = async () => {
    if (
      selectedIds.size === 0 ||
      !window.confirm(`Xóa ${selectedIds.size} câu hỏi chưa được sử dụng?`)
    )
      return;
    setActionError(null);
    for (const questionId of selectedIds) {
      try {
        await assessmentApi.questions.delete(questionId);
      } catch (error) {
        setActionError(
          assessmentErrorMessage(
            error,
            'Không thể xóa toàn bộ câu hỏi đã chọn. Các câu đang được dùng trong đề được giữ nguyên.',
          ),
        );
        break;
      }
    }
    setSelectedIds(new Set());
    setReloadKey((value) => value + 1);
  };

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
      setQuestions((current) =>
        editingQuestion ? current.map((item) => (item.id === saved.id ? saved : item)) : current,
      );
      if (!editingQuestion) setReloadKey((value) => value + 1);
      setFormOpen(false);
      setEditingQuestion(null);
    } catch (error) {
      if (await redirectExpiredSession(error)) return;
      setActionError(
        assessmentErrorMessage(
          error,
          'Không thể lưu câu hỏi. Vui lòng thử lại.',
          'Câu hỏi đã được sử dụng trong bài kiểm tra có lượt làm nên không thể chỉnh sửa.',
        ),
      );
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
      setActionError(
        assessmentErrorMessage(
          error,
          'Không thể xóa câu hỏi. Vui lòng thử lại.',
          'Câu hỏi đang được sử dụng trong bài kiểm tra. Hãy gỡ câu hỏi khỏi bài kiểm tra trước.',
        ),
      );
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
      const mapped = await knowledgeModelApi.questionSkills.replace(mappingQuestion.id, [
        ...new Set(mappedSkillIds),
      ]);
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
          <p className="mt-1 text-sm text-slate-600">Quản lý câu hỏi bốn kỹ năng của khóa học.</p>
        </div>
        <div className="flex gap-2">
          <Link className="rounded border px-4 py-2 text-sm" to={safeReturnTo}>
            Quay lại
          </Link>
          {courseId && (
            <Link
              className="rounded border px-4 py-2 text-sm"
              to={`/instructor/courses/${courseId}/tests?returnTo=${encodeURIComponent(safeReturnTo)}`}
            >
              Đề kiểm tra
            </Link>
          )}
          <button
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            disabled={pendingAction !== null}
            onClick={() => {
              setEditingQuestion(null);
              setFormOpen(true);
              setActionError(null);
            }}
            type="button"
          >
            Tạo câu hỏi
          </button>
          {courseId ? (
            <button
              className="rounded border border-indigo-300 px-4 py-2 text-sm font-medium text-indigo-700"
              onClick={() => void assessmentApi.questions.downloadTemplate(courseId)}
              type="button"
            >
              Tải mẫu XLSX
            </button>
          ) : null}
          <label className="cursor-pointer rounded border border-indigo-300 px-4 py-2 text-sm font-medium text-indigo-700">
            {importing ? 'Đang kiểm tra...' : 'Nhập XLSX'}
            <input
              accept=".xlsx"
              className="sr-only"
              disabled={importing}
              onChange={(event) => void previewImport(event.target.files?.[0])}
              type="file"
            />
          </label>
        </div>
      </div>

      {actionError && (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {actionError}
        </div>
      )}
      {actionMessage && (
        <div
          className="rounded border border-green-200 bg-green-50 p-3 text-sm text-green-700"
          role="status"
        >
          {actionMessage}
        </div>
      )}

      {formOpen && (
        <QuestionForm
          key={editingQuestion?.id ?? 'new-question'}
          initial={editingQuestion}
          rubrics={rubrics}
          pending={pendingAction === 'save-question'}
          onCancel={() => {
            setFormOpen(false);
            setEditingQuestion(null);
          }}
          onSave={saveQuestion}
        />
      )}

      {importPreview ? (
        <section
          className="rounded-xl border border-indigo-200 bg-indigo-50 p-4"
          aria-label="Xem trước nhập câu hỏi"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-bold">Xem trước dữ liệu XLSX</h2>
              <p className="text-sm text-slate-700">
                {importPreview.summary.valid}/{importPreview.summary.total} dòng hợp lệ ·{' '}
                {importPreview.summary.invalid} dòng cần sửa · {importPreview.summary.warnings} cảnh
                báo
              </p>
            </div>
            <div className="flex gap-2">
              <button
                className="rounded border bg-white px-3 py-2 text-sm"
                onClick={() => setImportPreview(null)}
                type="button"
              >
                Hủy
              </button>
              <button
                className="rounded bg-indigo-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                disabled={!importPreview.canConfirm || importing}
                onClick={() => setImportConfirmOpen(true)}
                type="button"
              >
                Xác nhận nhập
              </button>
            </div>
          </div>
          {importPreview.summary.invalid > 0 ? (
            <ul className="mt-3 max-h-40 list-disc overflow-auto pl-5 text-sm text-red-700">
              {importPreview.rows
                .filter((row) => row.errors.length)
                .map((row) => (
                  <li key={row.rowNumber}>
                    Dòng {row.rowNumber}: {row.errors.join(' ')}
                  </li>
                ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-emerald-700">
              Tệp hợp lệ. Chưa có dữ liệu nào được ghi cho đến khi bạn xác nhận.
            </p>
          )}
          {importPreview.summary.warnings > 0 ? (
            <ul
              className="mt-3 max-h-40 list-disc overflow-auto pl-5 text-sm text-amber-800"
              aria-label="Cảnh báo dữ liệu XLSX"
            >
              {importPreview.rows
                .filter((row) => row.warnings.length)
                .map((row) => (
                  <li key={row.rowNumber}>
                    Dòng {row.rowNumber}: {row.warnings.join(' ')}
                  </li>
                ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      {importConfirmOpen && importPreview ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" role="dialog" aria-modal="true" aria-label="Xác nhận nhập câu hỏi">
          <section className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="text-xl font-bold">Xác nhận nhập câu hỏi</h2>
            <p className="mt-2 text-sm text-slate-600">Dữ liệu chỉ được ghi sau bước xác nhận này. Máy chủ sẽ kiểm tra lại toàn bộ lô và ghi theo một giao dịch.</p>
            <dl className="mt-4 space-y-2 rounded-xl bg-slate-50 p-4 text-sm">
              <div className="flex justify-between"><dt>Câu hợp lệ</dt><dd className="font-bold">{importPreview.summary.valid}</dd></div>
              <div className="flex justify-between"><dt>Cảnh báo</dt><dd className="font-bold text-amber-700">{importPreview.summary.warnings}</dd></div>
              <div className="flex justify-between gap-4"><dt>Khóa học đích</dt><dd className="text-right font-semibold">{courseTitle || 'Khóa học đang chọn'}</dd></div>
            </dl>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button className="rounded border px-4 py-2" disabled={importing} onClick={() => setImportConfirmOpen(false)} type="button">Quay lại xem trước</button>
              <button className="rounded bg-indigo-600 px-4 py-2 font-semibold text-white disabled:opacity-50" disabled={importing} onClick={() => void confirmImport()} type="button">{importing ? 'Đang nhập...' : `Nhập ${importPreview.summary.valid} câu`}</button>
            </div>
          </section>
        </div>
      ) : null}

      <div className="grid gap-3 rounded-xl border bg-white p-4 sm:grid-cols-2 lg:grid-cols-6">
        <input
          aria-label="Tìm câu hỏi"
          className="rounded border p-2"
          onChange={(event) => {
            setPage(1);
            setSearch(event.target.value);
          }}
          placeholder="Tìm nội dung"
        />
        <select
          aria-label="Lọc kỹ năng"
          className="rounded border p-2"
          onChange={(event) => {
            setPage(1);
            setSkillFilter(event.target.value);
          }}
        >
          <option value="ALL">Tất cả kỹ năng</option>
          {(['LISTENING', 'READING', 'SPEAKING', 'WRITING'] as ToeicSkill[]).map((value) => (
            <option key={value} value={value}>
              {toeicSkillLabel[value]}
            </option>
          ))}
        </select>
        <select
          aria-label="Lọc loại trả lời"
          className="rounded border p-2"
          onChange={(event) => {
            setPage(1);
            setTypeFilter(event.target.value);
          }}
        >
          <option value="ALL">Tất cả loại trả lời</option>
          {Object.entries(questionTypeLabel).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select
          aria-label="Lọc độ khó"
          className="rounded border p-2"
          onChange={(event) => {
            setPage(1);
            setDifficultyFilter(event.target.value);
          }}
        >
          <option value="ALL">Tất cả độ khó</option>
          {Object.entries(difficultyLabel).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select
          aria-label="Lọc trạng thái sử dụng"
          className="rounded border p-2"
          onChange={(event) => {
            setPage(1);
            setUsageFilter(event.target.value as 'ALL' | 'USED' | 'UNUSED');
          }}
        >
          <option value="ALL">Tất cả trạng thái</option>
          <option value="USED">Đã dùng trong kho đề</option>
          <option value="UNUSED">Chưa sử dụng</option>
        </select>
        <select
          aria-label="Số câu hỏi mỗi trang"
          className="rounded border p-2"
          value={pageSize}
          onChange={(event) => {
            setPage(1);
            setPageSize(Number(event.target.value));
          }}
        >
          <option value="20">20 câu / trang</option>
          <option value="50">50 câu / trang</option>
          <option value="100">100 câu / trang</option>
        </select>
      </div>

      <aside
        className="grid gap-4 rounded-2xl border border-indigo-200 bg-indigo-50 p-5 md:grid-cols-[1fr_auto]"
        aria-label="Cách tổ chức ngữ liệu"
      >
        <div>
          <h2 className="font-bold text-indigo-950">Câu hỏi và ngữ liệu được tổ chức thế nào?</h2>
          <p className="mt-2 text-sm leading-6 text-slate-700">
            Ngân hàng câu hỏi lưu nội dung câu hỏi, đáp án và rubric. Hình ảnh, âm thanh và đoạn đọc
            được thêm khi tạo Đề kiểm tra, vì một ngữ liệu có thể dùng cho nhiều câu hỏi.
          </p>
        </div>
        <pre
          className="rounded-xl bg-white px-5 py-3 text-sm leading-6 text-slate-700"
          aria-label="Một ngữ liệu dùng cho nhiều câu hỏi"
        >
          Ngữ liệu{`\n`}├ Câu 1{`\n`}├ Câu 2{`\n`}└ Câu 3
        </pre>
      </aside>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white px-4 py-3">
        <p className="text-sm text-slate-600">Đã chọn {selectedIds.size} câu</p>
        <button
          className="rounded border border-red-300 px-3 py-2 text-sm font-semibold text-red-700 disabled:opacity-40"
          disabled={selectedIds.size === 0 || pendingAction !== null}
          onClick={() => void deleteSelected()}
          type="button"
        >
          Xóa câu đã chọn
        </button>
      </div>

      {loading ? (
        <p className="py-10 text-center text-slate-500">Đang tải câu hỏi...</p>
      ) : loadError ? (
        <div className="rounded border border-red-200 bg-red-50 p-4 text-red-700">
          <p>{loadError}</p>
          <button
            className="mt-3 rounded border px-3 py-1 text-sm"
            onClick={() => {
              setLoading(true);
              setLoadError(null);
              setReloadKey((current) => current + 1);
            }}
            type="button"
          >
            Thử lại
          </button>
        </div>
      ) : questions.length === 0 ? (
        <div className="rounded border bg-white p-8 text-center text-slate-500">
          Chưa có câu hỏi nào.
        </div>
      ) : (
        <div className="space-y-3">
          {questions.map((question) => (
            <article className="rounded-lg border bg-white p-5 shadow-sm" key={question.id}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <input
                  aria-label={`Chọn câu hỏi ${question.content}`}
                  checked={selectedIds.has(question.id)}
                  onChange={() =>
                    setSelectedIds((current) => {
                      const next = new Set(current);
                      if (next.has(question.id)) next.delete(question.id);
                      else next.add(question.id);
                      return next;
                    })
                  }
                  type="checkbox"
                />
                <div className="min-w-0 flex-1">
                  <div className="mb-2 flex flex-wrap gap-2 text-xs">
                    <span className="rounded bg-blue-100 px-2 py-1 text-blue-800">
                      {questionTypeLabel[question.type]}
                    </span>
                    <span className="rounded bg-indigo-100 px-2 py-1 text-indigo-800">
                      {question.toeicSkill
                        ? toeicSkillLabel[question.toeicSkill]
                        : 'Chưa phân loại'}
                    </span>
                    <span className="rounded bg-amber-100 px-2 py-1 text-amber-800">
                      {difficultyLabel[question.difficulty]}
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap font-medium text-slate-900">
                    {question.content}
                  </p>
                  <p className="mt-2 text-xs text-slate-500">
                    Đã dùng trong {question.usageCount ?? 0} đề
                  </p>
                  <div className="mt-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
                    <p><strong>Loại trả lời:</strong> {questionTypeLabel[question.type]}</p>
                    <p><strong>Ngữ liệu khi biên soạn:</strong> {question.toeicSkill === 'LISTENING' ? 'Cần đoạn nghe hoặc hướng dẫn nghe trong phần thi.' : question.toeicSkill === 'READING' ? 'Có thể gắn đoạn đọc trong phần thi; câu demo M07-VG đã có ngữ cảnh độc lập.' : 'Câu hỏi đã nêu bối cảnh độc lập; có thể bổ sung ngữ liệu nếu đề yêu cầu.'}</p>
                    {question.rubric ? <p><strong>Rubric:</strong> {question.rubric.name}</p> : null}
                  </div>
                  <ol className="mt-3 list-inside list-[upper-alpha] space-y-1 text-sm text-slate-600">
                    {question.options.map((option) => (
                      <li
                        className={option.isCorrect ? 'font-medium text-green-700' : ''}
                        key={option.id}
                      >
                        {option.content}
                        {option.isCorrect ? ' ✓' : ''}
                      </li>
                    ))}
                  </ol>
                </div>
                <div className="flex gap-2">
                  <button
                    className="rounded border px-3 py-1.5 text-sm disabled:opacity-50"
                    disabled={pendingAction !== null}
                    onClick={() => {
                      setEditingQuestion(question);
                      setFormOpen(true);
                      setActionError(null);
                    }}
                    type="button"
                  >
                    Sửa
                  </button>
                  <details className="text-xs text-slate-500">
                    <summary className="cursor-pointer">Công cụ nghiên cứu cũ</summary>
                    <button
                      aria-label="Edit Skills"
                      className="mt-2 rounded border border-emerald-300 px-3 py-1.5 text-sm text-emerald-700"
                      disabled={pendingAction !== null}
                      onClick={() => void openSkillMapping(question)}
                      type="button"
                    >
                      Legacy: Edit Skills
                    </button>
                  </details>
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
      {!loading && !loadError ? (
        <nav
          className="flex items-center justify-between rounded-xl border bg-white px-4 py-3"
          aria-label="Phân trang câu hỏi"
        >
          <p className="text-sm text-slate-600">
            {total} câu hỏi · Trang {page}/{totalPages}
          </p>
          <div className="flex gap-2">
            <button
              className="rounded border px-3 py-1.5 text-sm disabled:opacity-40"
              disabled={page <= 1}
              onClick={() => setPage((value) => value - 1)}
              type="button"
            >
              Trang trước
            </button>
            <button
              className="rounded border px-3 py-1.5 text-sm disabled:opacity-40"
              disabled={page >= totalPages}
              onClick={() => setPage((value) => value + 1)}
              type="button"
            >
              Trang sau
            </button>
          </div>
        </nav>
      ) : null}
      {mappingQuestion ? (
        <SkillChecklistDialog
          title="Skill (KC) của câu hỏi"
          description="Một câu hỏi có thể cung cấp cùng quan sát đúng/sai cho nhiều Skill."
          skills={courseSkills ?? []}
          selectedIds={mappedSkillIds}
          pending={mappingLoading || pendingAction === `map-${mappingQuestion.id}`}
          error={mappingError}
          onToggle={(id) =>
            setMappedSkillIds((current) =>
              current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
            )
          }
          onSave={() => void saveSkillMapping()}
          onCancel={() => setMappingQuestion(null)}
        />
      ) : null}
    </div>
  );
}

function QuestionForm({
  initial,
  rubrics,
  pending,
  onCancel,
  onSave,
}: {
  initial: AssessmentQuestion | null;
  rubrics: RubricSummary[];
  pending: boolean;
  onCancel: () => void;
  onSave: (input: QuestionInput) => Promise<void>;
}) {
  const [type, setType] = useState<QuestionType>(initial?.type ?? 'SINGLE_CHOICE');
  const [toeicSkill, setToeicSkill] = useState<ToeicSkill>(initial?.toeicSkill ?? 'READING');
  const [rubricId, setRubricId] = useState(initial?.rubricId ?? '');
  const [difficulty, setDifficulty] = useState<QuestionDifficulty>(initial?.difficulty ?? 'MEDIUM');
  const [content, setContent] = useState(initial?.content ?? '');
  const [explanation, setExplanation] = useState(initial?.explanation ?? '');
  const [options, setOptions] = useState<EditableOption[]>(
    initial
      ? [...initial.options]
          .sort((a, b) => a.orderIndex - b.orderIndex)
          .map(({ content: text, isCorrect }) => ({ content: text, isCorrect }))
      : emptyOptions(),
  );
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
      const correctIndex = Math.max(
        0,
        normalized.findIndex((option) => option.isCorrect),
      );
      setOptions(
        normalized.map((option, index) => ({ ...option, isCorrect: index === correctIndex })),
      );
    } else {
      setOptions(
        normalized.some((option) => option.isCorrect)
          ? normalized
          : normalized.map((option, index) => ({ ...option, isCorrect: index === 0 })),
      );
    }
  };

  const updateOption = (index: number, update: Partial<EditableOption>) => {
    setOptions((current) =>
      current.map((option, optionIndex) =>
        optionIndex === index ? { ...option, ...update } : option,
      ),
    );
  };

  const setCorrect = (index: number, checked: boolean) => {
    if (type === 'MULTIPLE_CHOICE') {
      updateOption(index, { isCorrect: checked });
    } else {
      setOptions((current) =>
        current.map((option, optionIndex) => ({ ...option, isCorrect: optionIndex === index })),
      );
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
    const normalizedOptions = options.map((option) => ({
      ...option,
      content: option.content.trim(),
    }));
    const correctCount = normalizedOptions.filter((option) => option.isCorrect).length;
    const normalizedTexts = normalizedOptions.map((option) =>
      option.content.toLocaleLowerCase('vi'),
    );
    const productive = toeicSkill === 'SPEAKING' || toeicSkill === 'WRITING';

    if (!trimmedContent || (!productive && normalizedOptions.some((option) => !option.content))) {
      setFormError('Nội dung câu hỏi và đáp án không được để trống.');
      return;
    }
    if (
      !productive &&
      (normalizedOptions.length < 2 || (type === 'TRUE_FALSE' && normalizedOptions.length !== 2))
    ) {
      setFormError(
        type === 'TRUE_FALSE'
          ? 'Câu Đúng/Sai phải có đúng 2 đáp án.'
          : 'Câu hỏi phải có ít nhất 2 đáp án.',
      );
      return;
    }
    if (
      !productive &&
      ((type === 'MULTIPLE_CHOICE' && correctCount < 1) ||
        (type !== 'MULTIPLE_CHOICE' && correctCount !== 1))
    ) {
      setFormError(
        type === 'MULTIPLE_CHOICE'
          ? 'Cần chọn ít nhất một đáp án đúng.'
          : 'Cần chọn đúng một đáp án đúng.',
      );
      return;
    }
    if (!productive && new Set(normalizedTexts).size !== normalizedTexts.length) {
      setFormError('Nội dung các đáp án không được trùng nhau.');
      return;
    }
    if (productive && !rubricId) {
      setFormError('Câu Speaking/Writing cần chọn rubric chấm điểm.');
      return;
    }

    setFormError(null);
    void onSave({
      type,
      toeicSkill,
      difficulty,
      content: trimmedContent,
      explanation: explanation.trim() || null,
      rubricId: productive ? rubricId : null,
      options: productive ? [] : normalizedOptions,
    });
  };

  return (
    <form className="space-y-4 rounded-lg border bg-white p-5 shadow-sm" onSubmit={submit}>
      <h2 className="text-lg font-semibold">{initial ? 'Chỉnh sửa câu hỏi' : 'Tạo câu hỏi'}</h2>
      {formError && <p className="rounded bg-red-50 p-3 text-sm text-red-700">{formError}</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium">
          Loại câu hỏi
          <select
            className="mt-1 w-full rounded border p-2"
            disabled={pending || toeicSkill === 'SPEAKING' || toeicSkill === 'WRITING'}
            value={type}
            onChange={(event) => changeType(event.target.value as QuestionType)}
          >
            {Object.entries(questionTypeLabel)
              .filter(([value]) =>
                toeicSkill === 'SPEAKING'
                  ? value === 'AUDIO_RESPONSE'
                  : toeicSkill === 'WRITING'
                    ? value === 'TEXT_RESPONSE'
                    : !['AUDIO_RESPONSE', 'TEXT_RESPONSE'].includes(value),
              )
              .map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
          </select>
        </label>
        <label className="text-sm font-medium">
          Độ khó
          <select
            className="mt-1 w-full rounded border p-2"
            disabled={pending}
            value={difficulty}
            onChange={(event) => setDifficulty(event.target.value as QuestionDifficulty)}
          >
            {Object.entries(difficultyLabel).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="block text-sm font-medium">
        Kỹ năng TOEIC
        <select
          className="mt-1 w-full rounded border p-2"
          disabled={pending}
          value={toeicSkill}
          onChange={(event) => {
            const skill = event.target.value as ToeicSkill;
            setToeicSkill(skill);
            if (skill === 'SPEAKING') setType('AUDIO_RESPONSE');
            else if (skill === 'WRITING') setType('TEXT_RESPONSE');
            else if (type === 'AUDIO_RESPONSE' || type === 'TEXT_RESPONSE')
              changeType('SINGLE_CHOICE');
          }}
        >
          {(['LISTENING', 'READING', 'SPEAKING', 'WRITING'] as ToeicSkill[]).map((value) => (
            <option key={value} value={value}>
              {toeicSkillLabel[value]}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm font-medium">
        Nội dung
        <textarea
          className="mt-1 min-h-24 w-full rounded border p-2"
          disabled={pending}
          maxLength={5000}
          required
          value={content}
          onChange={(event) => setContent(event.target.value)}
        />
      </label>
      <label className="block text-sm font-medium">
        Giải thích (không bắt buộc)
        <textarea
          className="mt-1 min-h-20 w-full rounded border p-2"
          disabled={pending}
          maxLength={5000}
          value={explanation}
          onChange={(event) => setExplanation(event.target.value)}
        />
      </label>
      {toeicSkill === 'SPEAKING' || toeicSkill === 'WRITING' ? (
        <label className="block text-sm font-medium">
          Rubric chấm điểm
          <select
            className="mt-1 w-full rounded border p-2"
            required
            value={rubricId}
            onChange={(event) => setRubricId(event.target.value)}
          >
            <option value="">Chọn rubric</option>
            {rubrics.map((rubric) => (
              <option key={rubric.id} value={rubric.id}>
                {rubric.name}
              </option>
            ))}
          </select>
          {rubrics.find((rubric) => rubric.id === rubricId) ? (
            <div className="mt-2 rounded-lg bg-indigo-50 p-3 text-xs text-indigo-900">
              <strong>{rubrics.find((rubric) => rubric.id === rubricId)?.name}</strong>
              <ul className="mt-1 list-disc pl-5">
                {rubrics
                  .find((rubric) => rubric.id === rubricId)
                  ?.criteria.map((criterion) => (
                    <li key={criterion.id}>
                      {criterion.name} · tối đa {String(criterion.maxScore)}
                    </li>
                  ))}
              </ul>
            </div>
          ) : null}
        </label>
      ) : (
        <fieldset className="space-y-2" disabled={pending}>
          <legend className="text-sm font-medium">Đáp án</legend>
          {options.map((option, index) => (
            <div className="flex items-center gap-2" key={index}>
              <input
                aria-label={`Đáp án đúng ${index + 1}`}
                checked={option.isCorrect}
                onChange={(event) => setCorrect(index, event.target.checked)}
                type={type === 'MULTIPLE_CHOICE' ? 'checkbox' : 'radio'}
                name={type === 'MULTIPLE_CHOICE' ? undefined : 'correct-option'}
              />
              <input
                aria-label={`Nội dung đáp án ${index + 1}`}
                className="min-w-0 flex-1 rounded border p-2"
                maxLength={1000}
                required
                value={option.content}
                onChange={(event) => updateOption(index, { content: event.target.value })}
              />
              <button
                aria-label={`Đưa đáp án ${index + 1} lên`}
                className="rounded border px-2 py-1"
                disabled={index === 0}
                onClick={() => moveOption(index, -1)}
                type="button"
              >
                ↑
              </button>
              <button
                aria-label={`Đưa đáp án ${index + 1} xuống`}
                className="rounded border px-2 py-1"
                disabled={index === options.length - 1}
                onClick={() => moveOption(index, 1)}
                type="button"
              >
                ↓
              </button>
              {type !== 'TRUE_FALSE' && options.length > 2 && (
                <button
                  aria-label={`Xóa đáp án ${index + 1}`}
                  className="rounded border border-red-300 px-2 py-1 text-red-700"
                  onClick={() =>
                    setOptions((current) =>
                      current.filter((_, optionIndex) => optionIndex !== index),
                    )
                  }
                  type="button"
                >
                  ×
                </button>
              )}
            </div>
          ))}
          {type !== 'TRUE_FALSE' && (
            <button
              className="rounded border px-3 py-1.5 text-sm"
              onClick={() =>
                setOptions((current) => [...current, { content: '', isCorrect: false }])
              }
              type="button"
            >
              Thêm đáp án
            </button>
          )}
        </fieldset>
      )}
      <div className="flex justify-end gap-2">
        <button
          className="rounded border px-4 py-2"
          disabled={pending}
          onClick={onCancel}
          type="button"
        >
          Hủy
        </button>
        <button
          className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
          disabled={pending}
          type="submit"
        >
          {pending ? 'Đang lưu...' : 'Lưu câu hỏi'}
        </button>
      </div>
    </form>
  );
}
