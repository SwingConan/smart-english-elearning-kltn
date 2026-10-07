import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { assessmentApi } from '@/features/assessments/api';
import { loadCourseLessons, type LessonChoice } from '@/features/assessments/curriculum';
import {
  difficultyLabel,
  questionTypeLabel,
  testStatusLabel,
  testTypeLabel,
  toeicSkillLabel,
} from '@/features/assessments/display';
import { assessmentErrorMessage } from '@/features/assessments/errors';
import type {
  AssessmentQuestion,
  AssessmentTestDetail,
  AssessmentTestQuestion,
  QuestionDifficulty,
  QuestionType,
  TestInput,
  TestType,
  ToeicSkill,
} from '@/features/assessments/types';
import { useSessionExpiry } from '@/features/auth/use-session-expiry';

const structureConflict =
  'Không thể thay đổi cấu trúc bài kiểm tra vì đã có học viên bắt đầu làm bài.';

export function TestEditorPage() {
  const { testId } = useParams<{ testId: string }>();
  const [searchParams] = useSearchParams();
  const redirectExpiredSession = useSessionExpiry();
  const mutationInFlight = useRef(false);
  const [test, setTest] = useState<AssessmentTestDetail | null>(null);
  const [questions, setQuestions] = useState<AssessmentQuestion[]>([]);
  const [lessons, setLessons] = useState<LessonChoice[]>([]);
  const [pointDrafts, setPointDrafts] = useState<Record<string, number>>({});
  const [selectedQuestionId, setSelectedQuestionId] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [groupTitleDrafts, setGroupTitleDrafts] = useState<Record<string, string>>({});
  const [textStimulusDrafts, setTextStimulusDrafts] = useState<Record<string, string>>({});
  const [newQuestionPoints, setNewQuestionPoints] = useState(1);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(1);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');
  const [pickerType, setPickerType] = useState<'ALL' | QuestionType>('ALL');
  const [pickerDifficulty, setPickerDifficulty] = useState<'ALL' | QuestionDifficulty>('ALL');
  const [pickerUsage, setPickerUsage] = useState<'ALL' | 'USED' | 'UNUSED'>('ALL');
  const [pickerPage, setPickerPage] = useState(1);
  const [pickerTotalPages, setPickerTotalPages] = useState(1);
  const [pickerTotal, setPickerTotal] = useState(0);
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<Set<string>>(new Set());
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    async function fetchEditor() {
      if (!testId) return;
      try {
        const detail = await assessmentApi.tests.get(testId, controller.signal);
        const [questionPage, lessonChoices] = await Promise.all([
          assessmentApi.questions.page(detail.courseId, { pageSize: 20 }, controller.signal),
          loadCourseLessons(detail.courseId, controller.signal),
        ]);
        setTest(detail);
        setGroupTitleDrafts(
          Object.fromEntries(
            (detail.questionGroups ?? []).map((group) => [group.id, group.title ?? '']),
          ),
        );
        setQuestions(questionPage.items);
        setLessons(lessonChoices);
        setPointDrafts(
          Object.fromEntries(detail.testQuestions.map((item) => [item.id, item.points])),
        );
        setLoadError(null);
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return;
        if (await redirectExpiredSession(error)) return;
        setLoadError(assessmentErrorMessage(error, 'Không thể tải trình biên soạn bài kiểm tra.'));
      } finally {
        setLoading(false);
      }
    }
    void fetchEditor();
    return () => controller.abort();
  }, [redirectExpiredSession, reloadKey, testId]);

  useEffect(() => {
    if (!test || !pickerOpen) return;
    const controller = new AbortController();
    const group = (test.questionGroups ?? []).find((item) => item.id === selectedGroupId);
    void assessmentApi.questions
      .page(
        test.courseId,
        {
          page: pickerPage,
          pageSize: 20,
          search: pickerSearch.trim() || undefined,
          skill: group?.skill as ToeicSkill | undefined,
          responseType: pickerType === 'ALL' ? undefined : pickerType,
          difficulty: pickerDifficulty === 'ALL' ? undefined : pickerDifficulty,
          usage: pickerUsage,
        },
        controller.signal,
      )
      .then((result) => {
        setQuestions(result.items);
        setPickerTotal(result.total);
        setPickerTotalPages(result.totalPages);
      })
      .catch((error) => {
        if (!(error instanceof Error && error.name === 'AbortError'))
          setActionError('Không thể tải trang câu hỏi.');
      });
    return () => controller.abort();
  }, [
    pickerDifficulty,
    pickerOpen,
    pickerPage,
    pickerSearch,
    pickerType,
    pickerUsage,
    selectedGroupId,
    test,
  ]);

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

  const handleMutationError = useCallback(
    async (error: unknown, fallback: string, conflict = structureConflict) => {
      if (await redirectExpiredSession(error)) return;
      setActionError(assessmentErrorMessage(error, fallback, conflict));
    },
    [redirectExpiredSession],
  );

  const saveMetadata = async (input: Partial<TestInput>) => {
    if (!test || !beginMutation('metadata')) return;
    try {
      const updated = await assessmentApi.tests.update(test.id, input);
      setTest(updated);
      setPointDrafts(
        Object.fromEntries(updated.testQuestions.map((item) => [item.id, item.points])),
      );
    } catch (error) {
      await handleMutationError(error, 'Không thể lưu thông tin bài kiểm tra.');
    } finally {
      endMutation();
    }
  };

  const addSelectedQuestions = async () => {
    if (!test || selectedQuestionIds.size === 0 || !beginMutation('add-question-batch')) return;
    try {
      const added: AssessmentTestQuestion[] = [];
      for (const questionId of selectedQuestionIds) {
        added.push(
          selectedGroupId
            ? await assessmentApi.testQuestions.add(
                test.id,
                questionId,
                newQuestionPoints,
                selectedGroupId,
              )
            : await assessmentApi.testQuestions.add(test.id, questionId, newQuestionPoints),
        );
      }
      setTest({ ...test, testQuestions: [...test.testQuestions, ...added] });
      setPointDrafts((current) => ({
        ...current,
        ...Object.fromEntries(added.map((item) => [item.id, item.points])),
      }));
      setSelectedQuestionIds(new Set());
      setPickerOpen(false);
    } catch (error) {
      await handleMutationError(
        error,
        'Không thể thêm các câu hỏi đã chọn.',
        'Có câu hỏi đã nằm trong đề hoặc cấu trúc đề đã bị khóa.',
      );
      setReloadKey((value) => value + 1);
    } finally {
      endMutation();
    }
  };

  const addQuestion = async () => {
    if (!test || !selectedQuestionId || !beginMutation('add-question')) return;
    try {
      const added = selectedGroupId
        ? await assessmentApi.testQuestions.add(
            test.id,
            selectedQuestionId,
            newQuestionPoints,
            selectedGroupId,
          )
        : await assessmentApi.testQuestions.add(test.id, selectedQuestionId, newQuestionPoints);
      setTest({ ...test, testQuestions: [...test.testQuestions, added] });
      setPointDrafts((current) => ({ ...current, [added.id]: added.points }));
      setSelectedQuestionId('');
    } catch (error) {
      await handleMutationError(
        error,
        'Không thể thêm câu hỏi vào bài kiểm tra.',
        'Câu hỏi đã có trong bài kiểm tra hoặc cấu trúc đã bị khóa bởi lịch sử làm bài.',
      );
    } finally {
      endMutation();
    }
  };

  const addGroup = async (skill: 'LISTENING' | 'READING' | 'SPEAKING' | 'WRITING') => {
    if (!test || !beginMutation('add-group')) return;
    try {
      const group = await assessmentApi.groups.create(test.id, {
        skill,
        title: `Phần ${toeicSkillLabel[skill]}`,
      });
      setTest({ ...test, questionGroups: [...(test.questionGroups ?? []), group] });
      setSelectedGroupId(group.id);
    } catch (error) {
      await handleMutationError(error, 'Không thể thêm phần thi.');
    } finally {
      endMutation();
    }
  };

  const removeGroup = async (groupId: string) => {
    if (
      !test ||
      !window.confirm('Xóa phần thi và các ngữ liệu? Câu hỏi sẽ được đưa ra khỏi phần thi.')
    )
      return;
    if (!beginMutation('remove-group')) return;
    try {
      await assessmentApi.groups.delete(test.id, groupId);
      setTest({
        ...test,
        questionGroups: (test.questionGroups ?? []).filter((group) => group.id !== groupId),
        testQuestions: test.testQuestions.map((item) =>
          item.groupId === groupId ? { ...item, groupId: null } : item,
        ),
      });
      if (selectedGroupId === groupId) setSelectedGroupId('');
    } catch (error) {
      await handleMutationError(error, 'Không thể xóa phần thi.');
    } finally {
      endMutation();
    }
  };

  const saveGroup = async (groupId: string) => {
    if (!test || !beginMutation(`save-group-${groupId}`)) return;
    const group = (test.questionGroups ?? []).find((item) => item.id === groupId);
    if (!group) {
      endMutation();
      return;
    }
    try {
      const updated = await assessmentApi.groups.update(test.id, groupId, {
        skill: group.skill,
        title: groupTitleDrafts[groupId]?.trim() || null,
        instructions: group.instructions,
        preparationSeconds: group.preparationSeconds,
        responseSeconds: group.responseSeconds,
        recommendedSeconds: group.recommendedSeconds,
        maxRecordingSeconds: group.maxRecordingSeconds,
      });
      setTest({
        ...test,
        questionGroups: (test.questionGroups ?? []).map((item) =>
          item.id === groupId ? updated : item,
        ),
      });
    } catch (error) {
      await handleMutationError(error, 'Không thể cập nhật phần thi.');
    } finally {
      endMutation();
    }
  };

  const moveGroup = async (index: number, direction: -1 | 1) => {
    if (!test) return;
    const groups = test.questionGroups ?? [];
    const swapIndex = index + direction;
    if (swapIndex < 0 || swapIndex >= groups.length || !beginMutation('reorder-groups')) return;
    const previous = groups;
    const reordered = [...groups];
    [reordered[index], reordered[swapIndex]] = [reordered[swapIndex], reordered[index]];
    const optimistic = reordered.map((item, orderIndex) => ({ ...item, orderIndex }));
    setTest({ ...test, questionGroups: optimistic });
    try {
      const saved = await assessmentApi.groups.reorder(
        test.id,
        optimistic.map((item) => item.id),
      );
      setTest((current) => (current ? { ...current, questionGroups: saved } : current));
    } catch (error) {
      setTest((current) => (current ? { ...current, questionGroups: previous } : current));
      await handleMutationError(error, 'Không thể đổi thứ tự phần thi.');
    } finally {
      endMutation();
    }
  };

  const addTextStimulus = async (groupId: string) => {
    if (!test || !textStimulusDrafts[groupId]?.trim() || !beginMutation(`text-stimulus-${groupId}`))
      return;
    try {
      await assessmentApi.groups.addText(test.id, groupId, textStimulusDrafts[groupId].trim());
      setTextStimulusDrafts((current) => ({ ...current, [groupId]: '' }));
      setReloadKey((value) => value + 1);
    } catch (error) {
      await handleMutationError(error, 'Không thể thêm ngữ liệu văn bản.');
    } finally {
      endMutation();
    }
  };

  const removeStimulus = async (groupId: string, stimulusId: string) => {
    if (!test || !beginMutation(`remove-stimulus-${stimulusId}`)) return;
    try {
      await assessmentApi.groups.deleteStimulus(test.id, groupId, stimulusId);
      setReloadKey((value) => value + 1);
    } catch (error) {
      await handleMutationError(error, 'Không thể xóa ngữ liệu.');
    } finally {
      endMutation();
    }
  };

  const moveStimulus = async (groupId: string, index: number, direction: -1 | 1) => {
    if (!test) return;
    const group = (test.questionGroups ?? []).find((item) => item.id === groupId);
    if (!group) return;
    const swapIndex = index + direction;
    if (swapIndex < 0 || swapIndex >= group.stimuli.length || !beginMutation('reorder-stimuli'))
      return;
    const reordered = [...group.stimuli];
    [reordered[index], reordered[swapIndex]] = [reordered[swapIndex], reordered[index]];
    try {
      await assessmentApi.groups.reorderStimuli(
        test.id,
        groupId,
        reordered.map((item) => item.id),
      );
      setReloadKey((value) => value + 1);
    } catch (error) {
      await handleMutationError(error, 'Không thể đổi thứ tự ngữ liệu.');
    } finally {
      endMutation();
    }
  };

  const changeQuestionGroup = async (item: AssessmentTestQuestion, groupId: string) => {
    if (!test || !beginMutation(`move-question-${item.id}`)) return;
    try {
      const updated = await assessmentApi.testQuestions.moveGroup(
        test.id,
        item.id,
        groupId || null,
      );
      setTest({
        ...test,
        testQuestions: test.testQuestions.map((current) =>
          current.id === item.id ? updated : current,
        ),
      });
    } catch (error) {
      await handleMutationError(error, 'Không thể chuyển phần thi cho câu hỏi.');
    } finally {
      endMutation();
    }
  };

  const savePoints = async (item: AssessmentTestQuestion) => {
    if (!test) return;
    const points = pointDrafts[item.id];
    if (!Number.isInteger(points) || points < 1) {
      setActionError('Điểm câu hỏi phải là số nguyên lớn hơn hoặc bằng 1.');
      return;
    }
    if (points === item.points) return;
    if (!beginMutation(`points-${item.id}`)) return;
    try {
      const updated = await assessmentApi.testQuestions.update(test.id, item.id, points);
      setTest({
        ...test,
        testQuestions: test.testQuestions.map((current) =>
          current.id === updated.id ? updated : current,
        ),
      });
    } catch (error) {
      setPointDrafts((current) => ({ ...current, [item.id]: item.points }));
      await handleMutationError(error, 'Không thể cập nhật điểm câu hỏi.');
    } finally {
      endMutation();
    }
  };

  const removeQuestion = async (item: AssessmentTestQuestion) => {
    if (!test || !window.confirm('Gỡ câu hỏi này khỏi bài kiểm tra?')) return;
    if (!beginMutation(`remove-${item.id}`)) return;
    try {
      await assessmentApi.testQuestions.delete(test.id, item.id);
      const remaining = test.testQuestions
        .filter((current) => current.id !== item.id)
        .map((current, orderIndex) => ({ ...current, orderIndex }));
      setTest({ ...test, testQuestions: remaining });
      setPointDrafts((current) => {
        const next = { ...current };
        delete next[item.id];
        return next;
      });
    } catch (error) {
      await handleMutationError(error, 'Không thể gỡ câu hỏi khỏi bài kiểm tra.');
    } finally {
      endMutation();
    }
  };

  const moveQuestion = async (index: number, direction: -1 | 1) => {
    if (!test) return;
    const swapIndex = index + direction;
    if (swapIndex < 0 || swapIndex >= test.testQuestions.length) return;
    const previous = test.testQuestions;
    const reordered = [...previous];
    [reordered[index], reordered[swapIndex]] = [reordered[swapIndex], reordered[index]];
    const optimistic = reordered.map((item, orderIndex) => ({ ...item, orderIndex }));
    if (!beginMutation('reorder')) return;
    setTest({ ...test, testQuestions: optimistic });
    try {
      const saved = await assessmentApi.testQuestions.reorder(
        test.id,
        optimistic.map((item) => item.id),
      );
      setTest((current) => (current ? { ...current, testQuestions: saved } : current));
    } catch (error) {
      setTest((current) => (current ? { ...current, testQuestions: previous } : current));
      await handleMutationError(error, 'Không thể đổi thứ tự câu hỏi.');
    } finally {
      endMutation();
    }
  };

  const publish = async () => {
    if (!test || !window.confirm(`Xuất bản “${test.title}”?`) || !beginMutation('publish')) return;
    try {
      setTest(await assessmentApi.tests.publish(test.id));
    } catch (error) {
      await handleMutationError(error, 'Không thể xuất bản bài kiểm tra.');
    } finally {
      endMutation();
    }
  };

  const unpublish = async () => {
    if (
      !test ||
      !window.confirm(`Chuyển “${test.title}” về bản nháp?`) ||
      !beginMutation('unpublish')
    )
      return;
    try {
      setTest(await assessmentApi.tests.unpublish(test.id));
    } catch (error) {
      await handleMutationError(
        error,
        'Không thể chuyển bài kiểm tra về bản nháp.',
        'Không thể chuyển bài kiểm tra về bản nháp vì đã có học viên bắt đầu làm bài.',
      );
    } finally {
      endMutation();
    }
  };

  if (loading)
    return <p className="py-10 text-center text-slate-500">Đang tải trình biên soạn...</p>;
  if (loadError || !test) {
    return (
      <div className="rounded border border-red-200 bg-red-50 p-4 text-red-700">
        <p>{loadError ?? 'Không tìm thấy bài kiểm tra.'}</p>
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
    );
  }

  const usedQuestionIds = new Set(test.testQuestions.map((item) => item.questionId));
  const selectedGroup = (test.questionGroups ?? []).find((group) => group.id === selectedGroupId);
  const availableQuestions = questions.filter(
    (question) =>
      !usedQuestionIds.has(question.id) &&
      (!selectedGroup || question.toeicSkill === selectedGroup.skill),
  );
  const returnTo = searchParams.get('returnTo');
  const safeReturnTo = returnTo?.startsWith('/instructor/classes/')
    ? returnTo
    : `/instructor/courses/${test.courseId}/tests`;
  const builderReturnTo = `/instructor/tests/${test.id}/edit${returnTo?.startsWith('/instructor/classes/') ? `?returnTo=${encodeURIComponent(returnTo)}` : ''}`;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <h1 className="text-2xl font-bold">Biên soạn đề kiểm tra</h1>
            <span
              className={`rounded px-2 py-1 text-xs ${test.status === 'PUBLISHED' ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-700'}`}
            >
              {testStatusLabel[test.status]}
            </span>
          </div>
          <p className="text-sm text-slate-600">{test.title}</p>
        </div>
        <div className="flex gap-2">
          <Link className="rounded border px-4 py-2 text-sm" to={safeReturnTo}>
            Quay lại
          </Link>
          <button
            className="rounded border border-indigo-300 px-4 py-2 text-sm font-semibold text-indigo-700"
            onClick={() => setPreviewOpen(true)}
            type="button"
          >
            Xem trước đề
          </button>
          {test.status === 'DRAFT' ? (
            <button
              className="rounded bg-green-600 px-4 py-2 text-sm text-white disabled:opacity-50"
              disabled={pendingAction !== null}
              onClick={() => void publish()}
              type="button"
            >
              {pendingAction === 'publish' ? 'Đang xuất bản...' : 'Xuất bản'}
            </button>
          ) : (
            <button
              className="rounded border px-4 py-2 text-sm disabled:opacity-50"
              disabled={pendingAction !== null}
              onClick={() => void unpublish()}
              type="button"
            >
              {pendingAction === 'unpublish' ? 'Đang xử lý...' : 'Về bản nháp'}
            </button>
          )}
        </div>
      </div>

      {actionError && (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {actionError}
        </div>
      )}

      <div className="rounded-2xl border bg-white p-4">
        <p className="mb-3 text-sm font-bold text-indigo-700">Bước {step} / 5</p>
        <div className="grid gap-2 text-sm font-semibold text-slate-600 sm:grid-cols-5">
          {[
            'Thông tin đề',
            'Cấu trúc đề',
            'Nội dung phần thi',
            'Thiết lập',
            'Xem trước & xuất bản',
          ].map((label, index) => (
            <button
              className={`rounded-lg px-2 py-2 text-left ${step === index + 1 ? 'bg-indigo-50 text-indigo-700' : ''}`}
              key={label}
              onClick={() => setStep(index + 1)}
              type="button"
            >
              {index + 1}. {label}
            </button>
          ))}
        </div>
      </div>
      <div
        className={`${step === 1 || step === 4 || step === 5 ? 'grid' : 'hidden'} gap-5 xl:grid-cols-[220px_minmax(0,1fr)_240px]`}
      >
        <aside className="rounded-2xl border bg-white p-4">
          <h2 className="font-bold">Cấu trúc đề</h2>
          <ol className="mt-3 space-y-2 text-sm">
            {(test.questionGroups ?? []).map((group, index) => (
              <li key={group.id}>
                <button
                  className={`w-full rounded-lg px-3 py-2 text-left ${selectedGroupId === group.id ? 'bg-indigo-50 font-semibold text-indigo-700' : 'bg-slate-50'}`}
                  onClick={() => setSelectedGroupId(group.id)}
                  type="button"
                >
                  {index + 1}. {group.title || `Phần ${toeicSkillLabel[group.skill]}`}
                  <small className="block text-slate-500">
                    {group.testQuestions.length} câu · {group.stimuli.length} ngữ liệu
                  </small>
                </button>
              </li>
            ))}
          </ol>
        </aside>
        <MetadataForm
          key={`${test.id}-${test.updatedAt}`}
          lessons={lessons}
          pending={pendingAction !== null}
          test={test}
          onSave={saveMetadata}
        />
        <aside className="rounded-2xl border bg-white p-4">
          <h2 className="font-bold">Kiểm tra đề</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt>Phần thi</dt>
              <dd className="font-semibold">{test.questionGroups?.length ?? 0}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Câu hỏi</dt>
              <dd className="font-semibold">{test.testQuestions.length}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Trạng thái</dt>
              <dd className="font-semibold">{testStatusLabel[test.status]}</dd>
            </div>
          </dl>
          <button
            className="mt-4 w-full rounded border border-indigo-300 px-3 py-2 text-sm font-semibold text-indigo-700"
            onClick={() => setPreviewOpen(true)}
            type="button"
          >
            Xem trước như học viên
          </button>
        </aside>
      </div>

      <section
        className={`${step === 2 || step === 3 ? 'space-y-4' : 'hidden'} rounded-lg border bg-white p-5 shadow-sm`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Phần thi theo bốn kỹ năng</h2>
            <p className="text-sm text-slate-500">
              Mỗi phần thi có thể chứa ngữ liệu văn bản, hình ảnh hoặc âm thanh.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {(['LISTENING', 'READING', 'SPEAKING', 'WRITING'] as const).map((skill) => (
              <button
                className="rounded border px-3 py-1.5 text-sm"
                disabled={pendingAction !== null}
                key={skill}
                onClick={() => void addGroup(skill)}
                type="button"
              >
                + Phần {toeicSkillLabel[skill]}
              </button>
            ))}
          </div>
        </div>
        {(test.questionGroups ?? []).length === 0 ? (
          <p className="rounded bg-slate-50 p-4 text-sm text-slate-500">
            Chưa có phần thi. Bản nháp có thể chưa hoàn chỉnh; hãy tạo phần thi trước khi xuất bản
            đề bốn kỹ năng.
          </p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {(test.questionGroups ?? []).map((group, groupIndex, groups) => (
              <article className="rounded-xl border p-4" key={group.id}>
                <div className="flex justify-between gap-3">
                  <div>
                    <span className="rounded bg-indigo-50 px-2 py-1 text-xs font-bold text-indigo-700">
                      {toeicSkillLabel[group.skill]}
                    </span>
                    <h3 className="mt-2 font-bold">
                      {group.title || `Phần thi ${group.orderIndex + 1}`}
                    </h3>
                    <p className="text-xs text-slate-500">
                      {group.testQuestions.length} câu · {group.stimuli.length} ngữ liệu
                    </p>
                  </div>
                  <div className="flex items-start gap-1">
                    <button
                      aria-label={`Đưa phần thi ${groupIndex + 1} lên`}
                      className="rounded border px-2"
                      disabled={groupIndex === 0 || pendingAction !== null}
                      onClick={() => void moveGroup(groupIndex, -1)}
                      type="button"
                    >
                      ↑
                    </button>
                    <button
                      aria-label={`Đưa phần thi ${groupIndex + 1} xuống`}
                      className="rounded border px-2"
                      disabled={groupIndex === groups.length - 1 || pendingAction !== null}
                      onClick={() => void moveGroup(groupIndex, 1)}
                      type="button"
                    >
                      ↓
                    </button>
                    <button
                      className="px-2 text-sm text-red-700"
                      onClick={() => void removeGroup(group.id)}
                      type="button"
                    >
                      Xóa
                    </button>
                  </div>
                </div>
                <div className="mt-3 space-y-3">
                  <div className="flex gap-2">
                    <input
                      aria-label={`Tiêu đề phần thi ${groupIndex + 1}`}
                      className="min-w-0 flex-1 rounded border p-2 text-sm"
                      onChange={(event) =>
                        setGroupTitleDrafts((current) => ({
                          ...current,
                          [group.id]: event.target.value,
                        }))
                      }
                      value={groupTitleDrafts[group.id] ?? ''}
                    />
                    <button
                      className="rounded border px-3 text-sm"
                      disabled={
                        pendingAction !== null ||
                        (groupTitleDrafts[group.id] ?? '') === (group.title ?? '')
                      }
                      onClick={() => void saveGroup(group.id)}
                      type="button"
                    >
                      Lưu phần thi
                    </button>
                  </div>
                  <button
                    className={`w-full rounded border px-3 py-2 text-sm ${selectedGroupId === group.id ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : ''}`}
                    onClick={() => setSelectedGroupId(group.id)}
                    type="button"
                  >
                    {selectedGroupId === group.id
                      ? 'Đang chọn phần thi này'
                      : 'Chọn để thêm câu hỏi'}
                  </button>
                  <div className="flex gap-2">
                    <textarea
                      aria-label={`Ngữ liệu văn bản phần thi ${groupIndex + 1}`}
                      className="min-h-16 min-w-0 flex-1 rounded border p-2 text-sm"
                      onChange={(event) =>
                        setTextStimulusDrafts((current) => ({
                          ...current,
                          [group.id]: event.target.value,
                        }))
                      }
                      placeholder="Nhập đoạn đọc hoặc hướng dẫn nghe"
                      value={textStimulusDrafts[group.id] ?? ''}
                    />
                    <button
                      className="rounded border px-3 text-sm"
                      disabled={pendingAction !== null || !textStimulusDrafts[group.id]?.trim()}
                      onClick={() => void addTextStimulus(group.id)}
                      type="button"
                    >
                      Thêm văn bản
                    </button>
                  </div>
                  <label className="block text-xs font-medium">
                    Tải ngữ liệu ảnh/âm thanh
                    <input
                      accept="image/jpeg,image/png,image/webp,audio/mpeg,audio/mp4,audio/ogg,audio/webm"
                      className="mt-1 block w-full rounded border p-2"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (!file) return;
                        void assessmentApi.groups
                          .upload(test.id, group.id, file)
                          .then(() => setReloadKey((value) => value + 1))
                          .catch(
                            (error) => void handleMutationError(error, 'Không thể tải ngữ liệu.'),
                          );
                      }}
                      type="file"
                    />
                  </label>
                  {group.stimuli.map((stimulus, stimulusIndex) => (
                    <div
                      className="flex items-center gap-2 rounded bg-slate-50 p-2 text-xs"
                      key={stimulus.id}
                    >
                      <span className="min-w-0 flex-1 truncate">
                        {stimulus.type}:{' '}
                        {stimulus.textContent ||
                          stimulus.altText ||
                          stimulus.mimeType ||
                          'Tệp bảo vệ'}
                      </span>
                      <button
                        aria-label="Đưa ngữ liệu lên"
                        disabled={stimulusIndex === 0 || pendingAction !== null}
                        onClick={() => void moveStimulus(group.id, stimulusIndex, -1)}
                        type="button"
                      >
                        ↑
                      </button>
                      <button
                        aria-label="Đưa ngữ liệu xuống"
                        disabled={
                          stimulusIndex === group.stimuli.length - 1 || pendingAction !== null
                        }
                        onClick={() => void moveStimulus(group.id, stimulusIndex, 1)}
                        type="button"
                      >
                        ↓
                      </button>
                      <button
                        className="text-red-700"
                        disabled={pendingAction !== null}
                        onClick={() => void removeStimulus(group.id, stimulus.id)}
                        type="button"
                      >
                        Xóa
                      </button>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section
        className={`${step === 3 ? 'space-y-4' : 'hidden'} rounded-lg border bg-white p-5 shadow-sm`}
      >
        <div>
          <h2 className="text-lg font-semibold">Câu hỏi trong bài kiểm tra</h2>
          <p className="text-sm text-slate-500">
            Dùng mũi tên để đổi thứ tự; luôn gửi toàn bộ danh sách lên máy chủ.
          </p>
        </div>
        {test.testQuestions.length === 0 ? (
          <p className="rounded bg-slate-50 p-4 text-sm text-slate-500">
            Chưa có câu hỏi. Bài kiểm tra chưa thể xuất bản.
          </p>
        ) : (
          <div className="space-y-3">
            {test.testQuestions.map((item, index) => (
              <article className="rounded border p-4" key={item.id}>
                <div className="flex flex-wrap items-start gap-3">
                  <span className="rounded bg-slate-100 px-2 py-1 text-sm font-semibold">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{item.question.content}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {questionTypeLabel[item.question.type]} ·{' '}
                      {difficultyLabel[item.question.difficulty]}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="text-sm">
                      Phần thi
                      <select
                        aria-label={`Phần thi của câu ${index + 1}`}
                        className="ml-2 rounded border p-1.5"
                        disabled={pendingAction !== null}
                        onChange={(event) => void changeQuestionGroup(item, event.target.value)}
                        value={item.groupId ?? ''}
                      >
                        <option value="">Chưa gán phần thi</option>
                        {(test.questionGroups ?? [])
                          .filter((group) => group.skill === item.question.toeicSkill)
                          .map((group) => (
                            <option key={group.id} value={group.id}>
                              {group.title || toeicSkillLabel[group.skill]}
                            </option>
                          ))}
                      </select>
                    </label>
                    <label className="text-sm">
                      Điểm
                      <input
                        className="ml-2 w-20 rounded border p-1.5"
                        disabled={pendingAction !== null}
                        min={1}
                        type="number"
                        value={pointDrafts[item.id] ?? item.points}
                        onChange={(event) =>
                          setPointDrafts((current) => ({
                            ...current,
                            [item.id]: Number(event.target.value),
                          }))
                        }
                      />
                    </label>
                    <button
                      className="rounded border px-2 py-1 text-sm"
                      disabled={pendingAction !== null || pointDrafts[item.id] === item.points}
                      onClick={() => void savePoints(item)}
                      type="button"
                    >
                      Lưu điểm
                    </button>
                    <button
                      aria-label={`Đưa câu ${index + 1} lên`}
                      className="rounded border px-2 py-1"
                      disabled={pendingAction !== null || index === 0}
                      onClick={() => void moveQuestion(index, -1)}
                      type="button"
                    >
                      ↑
                    </button>
                    <button
                      aria-label={`Đưa câu ${index + 1} xuống`}
                      className="rounded border px-2 py-1"
                      disabled={pendingAction !== null || index === test.testQuestions.length - 1}
                      onClick={() => void moveQuestion(index, 1)}
                      type="button"
                    >
                      ↓
                    </button>
                    <button
                      className="rounded border border-red-300 px-2 py-1 text-sm text-red-700"
                      disabled={pendingAction !== null}
                      onClick={() => void removeQuestion(item)}
                      type="button"
                    >
                      Gỡ
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section
        className={`${step === 3 ? 'space-y-3' : 'hidden'} rounded-lg border bg-white p-5 shadow-sm`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Thêm từ ngân hàng câu hỏi</h2>
            <p className="text-sm text-slate-500">
              Chọn nhiều câu qua nhiều trang; lựa chọn được giữ lại cho đến khi thêm vào đề.
            </p>
          </div>
          <button
            className="rounded bg-indigo-600 px-4 py-2 font-semibold text-white"
            onClick={() => setPickerOpen(true)}
            type="button"
          >
            Mở bộ chọn câu hỏi
          </button>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-48 text-sm font-medium">
            Phần thi
            <select
              className="mt-1 w-full rounded border p-2"
              onChange={(event) => {
                setSelectedGroupId(event.target.value);
                setPickerPage(1);
              }}
              value={selectedGroupId}
            >
              <option value="">Chưa xếp phần</option>
              {(test.questionGroups ?? []).map((group) => (
                <option key={group.id} value={group.id}>
                  {toeicSkillLabel[group.skill]} · {group.title || `Phần ${group.orderIndex + 1}`}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium">
            Điểm mỗi câu
            <input
              className="mt-1 block w-28 rounded border p-2"
              min={1}
              type="number"
              value={newQuestionPoints}
              onChange={(event) => setNewQuestionPoints(Number(event.target.value))}
            />
          </label>
        </div>
        <Link
          className="inline-block text-sm text-blue-700 underline"
          to={`/instructor/courses/${test.courseId}/question-bank?returnTo=${encodeURIComponent(builderReturnTo)}`}
        >
          + Tạo câu hỏi mới
        </Link>
        <div className="sr-only">
          <label>
            Câu hỏi
            <select
              value={selectedQuestionId}
              onChange={(event) => setSelectedQuestionId(event.target.value)}
            >
              <option value="">Chọn câu hỏi</option>
              {availableQuestions.map((question) => (
                <option key={question.id} value={question.id}>
                  {question.content}
                </option>
              ))}
            </select>
          </label>
          <button
            disabled={pendingAction !== null || !selectedQuestionId}
            onClick={() => void addQuestion()}
            type="button"
          >
            {pendingAction === 'add-question' ? 'Đang thêm...' : 'Thêm câu hỏi'}
          </button>
        </div>
      </section>
      <nav
        className="sticky bottom-3 z-20 flex items-center justify-between rounded-2xl border bg-white/95 p-3 shadow-lg backdrop-blur"
        aria-label="Điều hướng biên soạn đề"
      >
        <button
          className="rounded border px-4 py-2 font-semibold disabled:opacity-40"
          disabled={step === 1}
          onClick={() => setStep((value) => Math.max(1, value - 1))}
          type="button"
        >
          ← Quay lại
        </button>
        <span className="text-sm font-bold text-indigo-700">Bước {step} / 5 · Đã lưu nháp</span>
        <button
          className="rounded bg-indigo-600 px-4 py-2 font-semibold text-white disabled:opacity-40"
          disabled={step === 5}
          onClick={() => setStep((value) => Math.min(5, value + 1))}
          type="button"
        >
          Tiếp tục →
        </button>
      </nav>
      {pickerOpen ? (
        <div
          className="fixed inset-0 z-40 flex justify-end bg-slate-950/40"
          role="dialog"
          aria-modal="true"
          aria-label="Bộ chọn câu hỏi"
        >
          <aside className="flex h-full w-full max-w-2xl flex-col bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold">Chọn câu hỏi</h2>
                <p className="text-sm text-slate-500">
                  {pickerTotal} câu phù hợp · Đã chọn {selectedQuestionIds.size} câu
                </p>
              </div>
              <button
                className="rounded border px-3 py-2"
                onClick={() => setPickerOpen(false)}
                type="button"
              >
                Đóng
              </button>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <input
                aria-label="Tìm trong bộ chọn câu hỏi"
                className="rounded border p-2 sm:col-span-2"
                placeholder="Tìm nội dung câu hỏi"
                value={pickerSearch}
                onChange={(event) => {
                  setPickerSearch(event.target.value);
                  setPickerPage(1);
                }}
              />
              <select
                aria-label="Lọc loại câu hỏi trong bộ chọn"
                className="rounded border p-2"
                value={pickerType}
                onChange={(event) => {
                  setPickerType(event.target.value as 'ALL' | QuestionType);
                  setPickerPage(1);
                }}
              >
                <option value="ALL">Tất cả loại câu</option>
                {(
                  [
                    'SINGLE_CHOICE',
                    'TRUE_FALSE',
                    'MULTIPLE_CHOICE',
                    'TEXT_RESPONSE',
                    'AUDIO_RESPONSE',
                  ] as const
                ).map((type) => (
                  <option key={type} value={type}>
                    {questionTypeLabel[type]}
                  </option>
                ))}
              </select>
              <select
                aria-label="Lọc độ khó trong bộ chọn"
                className="rounded border p-2"
                value={pickerDifficulty}
                onChange={(event) => {
                  setPickerDifficulty(event.target.value as 'ALL' | QuestionDifficulty);
                  setPickerPage(1);
                }}
              >
                <option value="ALL">Tất cả độ khó</option>
                {(['EASY', 'MEDIUM', 'HARD'] as const).map((difficulty) => (
                  <option key={difficulty} value={difficulty}>
                    {difficultyLabel[difficulty]}
                  </option>
                ))}
              </select>
              <select
                aria-label="Lọc mức sử dụng trong bộ chọn"
                className="rounded border p-2 sm:col-span-2"
                value={pickerUsage}
                onChange={(event) => {
                  setPickerUsage(event.target.value as 'ALL' | 'USED' | 'UNUSED');
                  setPickerPage(1);
                }}
              >
                <option value="ALL">Tất cả mức sử dụng</option>
                <option value="UNUSED">Chưa dùng trong đề</option>
                <option value="USED">Đã dùng trong đề</option>
              </select>
            </div>
            <div className="mt-4 flex-1 space-y-2 overflow-auto">
              {availableQuestions.map((question) => (
                <label
                  className="flex cursor-pointer gap-3 rounded-xl border p-3"
                  key={question.id}
                >
                  <input
                    checked={selectedQuestionIds.has(question.id)}
                    onChange={() =>
                      setSelectedQuestionIds((current) => {
                        const next = new Set(current);
                        if (next.has(question.id)) next.delete(question.id);
                        else next.add(question.id);
                        return next;
                      })
                    }
                    type="checkbox"
                  />
                  <span>
                    <strong className="text-sm">{question.content}</strong>
                    <small className="mt-1 block text-slate-500">
                      {toeicSkillLabel[question.toeicSkill ?? 'READING']} ·{' '}
                      {difficultyLabel[question.difficulty]} · đã dùng {question.usageCount ?? 0} đề
                    </small>
                  </span>
                </label>
              ))}
              {availableQuestions.length === 0 ? (
                <p className="py-8 text-center text-slate-500">
                  Không có câu hỏi phù hợp trên trang này.
                </p>
              ) : null}
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
              <div className="flex gap-2">
                <button
                  className="rounded border px-3 py-2 disabled:opacity-40"
                  disabled={pickerPage <= 1}
                  onClick={() => setPickerPage((value) => value - 1)}
                  type="button"
                >
                  Trang trước
                </button>
                <span className="px-2 py-2 text-sm">
                  {pickerPage}/{pickerTotalPages}
                </span>
                <button
                  className="rounded border px-3 py-2 disabled:opacity-40"
                  disabled={pickerPage >= pickerTotalPages}
                  onClick={() => setPickerPage((value) => value + 1)}
                  type="button"
                >
                  Trang sau
                </button>
              </div>
              <button
                className="rounded bg-indigo-600 px-4 py-2 font-semibold text-white disabled:opacity-40"
                disabled={selectedQuestionIds.size === 0 || pendingAction !== null}
                onClick={() => void addSelectedQuestions()}
                type="button"
              >
                Thêm {selectedQuestionIds.size} câu vào Phần{' '}
                {selectedGroup ? toeicSkillLabel[selectedGroup.skill] : 'đã chọn'}
              </button>
            </div>
          </aside>
        </div>
      ) : null}
      {previewOpen ? (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Xem trước đề"
        >
          <div className="max-h-[85vh] w-full max-w-3xl overflow-auto rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase text-indigo-600">Xem trước đề</p>
                <h2 className="text-xl font-bold">{test.title}</h2>
              </div>
              <button
                className="rounded border px-3 py-2"
                onClick={() => setPreviewOpen(false)}
                type="button"
              >
                Đóng
              </button>
            </div>
            <div className="mt-5 space-y-4">
              {(test.questionGroups ?? []).map((group) => (
                <section className="rounded-xl border p-4" key={group.id}>
                  <h3 className="font-bold">
                    {group.title || `Phần ${toeicSkillLabel[group.skill]}`}
                  </h3>
                  <p className="text-sm text-slate-500">
                    {group.testQuestions.length} câu · {group.stimuli.length} ngữ liệu
                  </p>
                </section>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MetadataForm({
  test,
  lessons,
  pending,
  onSave,
}: {
  test: AssessmentTestDetail;
  lessons: LessonChoice[];
  pending: boolean;
  onSave: (input: Partial<TestInput>) => Promise<void>;
}) {
  const lockedInClass = test.purpose === 'IN_CLASS';
  const initialType: TestType = test.type === 'PLACEMENT' ? 'PLACEMENT' : 'QUIZ';
  const [type, setType] = useState<TestType>(initialType);
  const [title, setTitle] = useState(test.title);
  const [description, setDescription] = useState(test.description ?? '');
  const [lessonId, setLessonId] = useState(test.lessonId ?? '');
  const [maxAttempts, setMaxAttempts] = useState(test.maxAttempts);
  const [showResult, setShowResult] = useState(test.showResultAfterSubmit);
  const [formError, setFormError] = useState<string | null>(null);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) {
      setFormError('Tiêu đề không được để trống.');
      return;
    }
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
      setFormError('Số lượt làm phải là số nguyên lớn hơn hoặc bằng 1.');
      return;
    }
    const effective: TestInput = {
      type,
      title: title.trim(),
      description: description.trim() || null,
      lessonId: lockedInClass ? test.lessonId : type === 'QUIZ' ? lessonId || null : null,
      maxAttempts,
      showResultAfterSubmit: showResult,
    };
    const delta: Partial<TestInput> = {};
    if (!lockedInClass && effective.type !== test.type) delta.type = effective.type;
    if (effective.title !== test.title) delta.title = effective.title;
    if (effective.description !== test.description) delta.description = effective.description;
    if (effective.lessonId !== test.lessonId) delta.lessonId = effective.lessonId;
    if (effective.maxAttempts !== test.maxAttempts) delta.maxAttempts = effective.maxAttempts;
    if (effective.showResultAfterSubmit !== test.showResultAfterSubmit) {
      delta.showResultAfterSubmit = effective.showResultAfterSubmit;
    }

    setFormError(null);
    if (Object.keys(delta).length === 0) return;
    void onSave(delta);
  };

  return (
    <form className="space-y-4 rounded-lg border bg-white p-5 shadow-sm" onSubmit={submit}>
      <h2 className="text-lg font-semibold">Thông tin bài kiểm tra</h2>
      {formError && <p className="rounded bg-red-50 p-3 text-sm text-red-700">{formError}</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        {lockedInClass ? (
          <div className="text-sm font-medium">
            Mục đích
            <div className="mt-1 rounded border bg-slate-50 p-2 font-normal">
              Bài kiểm tra trên lớp
            </div>
          </div>
        ) : (
          <label className="text-sm font-medium">
            Loại
            <select
              className="mt-1 w-full rounded border p-2"
              disabled={pending}
              value={type}
              onChange={(event) => {
                const next = event.target.value as TestType;
                setType(next);
                if (next === 'PLACEMENT') setLessonId('');
              }}
            >
              {Object.entries(testTypeLabel).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="text-sm font-medium">
          Số lượt làm
          <input
            className="mt-1 w-full rounded border p-2"
            disabled={pending}
            min={1}
            required
            type="number"
            value={maxAttempts}
            onChange={(event) => setMaxAttempts(Number(event.target.value))}
          />
        </label>
      </div>
      <label className="block text-sm font-medium">
        Tiêu đề
        <input
          className="mt-1 w-full rounded border p-2"
          disabled={pending}
          maxLength={300}
          required
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
      </label>
      <label className="block text-sm font-medium">
        Mô tả
        <textarea
          className="mt-1 w-full rounded border p-2"
          disabled={pending}
          maxLength={5000}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </label>
      {!lockedInClass && type === 'QUIZ' && (
        <label className="block text-sm font-medium">
          Bài học
          <select
            className="mt-1 w-full rounded border p-2"
            disabled={pending}
            value={lessonId}
            onChange={(event) => setLessonId(event.target.value)}
          >
            <option value="">Chưa chọn — bắt buộc trước khi xuất bản</option>
            {lessons.map((lesson) => (
              <option key={lesson.id} value={lesson.id}>
                {lesson.label}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="flex items-center gap-2 text-sm font-medium">
        <input
          checked={showResult}
          disabled={pending}
          onChange={(event) => setShowResult(event.target.checked)}
          type="checkbox"
        />
        Cho học viên xem đáp án/kết quả sau khi nộp
      </label>
      <p className="text-xs text-slate-500">
        Sau khi có lượt làm, loại, bài học, số lượt làm và cấu trúc câu hỏi bị khóa; tiêu đề, mô tả
        và chính sách xem kết quả vẫn chỉnh sửa được.
      </p>
      <div className="flex justify-end">
        <button
          className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
          disabled={pending}
          type="submit"
        >
          {pending ? 'Đang lưu...' : 'Lưu thông tin'}
        </button>
      </div>
    </form>
  );
}
