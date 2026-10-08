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
        setSelectedGroupId((current) =>
          (detail.questionGroups ?? []).some((group) => group.id === current)
            ? current
            : (detail.questionGroups?.[0]?.id ?? ''),
        );
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

  const refreshTestDetail = useCallback(async (id: string) => {
    const detail = await assessmentApi.tests.get(id);
    setTest(detail);
    setSelectedGroupId((current) =>
      (detail.questionGroups ?? []).some((group) => group.id === current)
        ? current
        : (detail.questionGroups?.[0]?.id ?? ''),
    );
    setPointDrafts(
      Object.fromEntries(detail.testQuestions.map((item) => [item.id, item.points])),
    );
    setGroupTitleDrafts(
      Object.fromEntries(
        (detail.questionGroups ?? []).map((group) => [group.id, group.title ?? '']),
      ),
    );
    return detail;
  }, []);

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
      await assessmentApi.testQuestions.addBatch(
        test.id,
        [...selectedQuestionIds],
        newQuestionPoints,
        selectedGroupId || undefined,
      );
      await refreshTestDetail(test.id);
      setSelectedQuestionIds(new Set());
      setPickerOpen(false);
    } catch (error) {
      await handleMutationError(
        error,
        'Không thể thêm các câu hỏi đã chọn.',
        'Có câu hỏi đã nằm trong đề hoặc cấu trúc đề đã bị khóa.',
      );
      await refreshTestDetail(test.id).catch(() => undefined);
    } finally {
      endMutation();
    }
  };

  const addQuestion = async () => {
    if (!test || !selectedQuestionId || !beginMutation('add-question')) return;
    try {
      await (selectedGroupId
        ? await assessmentApi.testQuestions.add(
            test.id,
            selectedQuestionId,
            newQuestionPoints,
            selectedGroupId,
          )
        : await assessmentApi.testQuestions.add(test.id, selectedQuestionId, newQuestionPoints));
      await refreshTestDetail(test.id);
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
        title: `Cụm câu hỏi ${(test.questionGroups ?? []).filter((item) => item.skill === skill).length + 1}`,
      });
      await refreshTestDetail(test.id);
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
      !window.confirm('Xóa cụm và các tài liệu đi kèm? Câu hỏi sẽ được đưa ra khỏi cụm.')
    )
      return;
    if (!beginMutation('remove-group')) return;
    try {
      await assessmentApi.groups.delete(test.id, groupId);
      await refreshTestDetail(test.id);
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
      void updated;
      await refreshTestDetail(test.id);
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
      await assessmentApi.groups.reorder(
        test.id,
        optimistic.map((item) => item.id),
      );
      await refreshTestDetail(test.id);
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
      await refreshTestDetail(test.id);
    } catch (error) {
      await handleMutationError(error, 'Không thể thêm tài liệu văn bản.');
    } finally {
      endMutation();
    }
  };

  const removeStimulus = async (groupId: string, stimulusId: string) => {
    if (!test || !beginMutation(`remove-stimulus-${stimulusId}`)) return;
    try {
      await assessmentApi.groups.deleteStimulus(test.id, groupId, stimulusId);
      await refreshTestDetail(test.id);
    } catch (error) {
      await handleMutationError(error, 'Không thể xóa tài liệu đi kèm câu hỏi.');
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
      await refreshTestDetail(test.id);
    } catch (error) {
      await handleMutationError(error, 'Không thể đổi thứ tự tài liệu đi kèm câu hỏi.');
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
      void updated;
      await refreshTestDetail(test.id);
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
      void updated;
      await refreshTestDetail(test.id);
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
      await refreshTestDetail(test.id);
    } catch (error) {
      await handleMutationError(error, 'Không thể gỡ câu hỏi khỏi bài kiểm tra.');
    } finally {
      endMutation();
    }
  };

  const moveQuestion = async (item: AssessmentTestQuestion, direction: -1 | 1) => {
    if (!test) return;
    const siblings = test.testQuestions.filter((question) => question.groupId === item.groupId);
    const siblingIndex = siblings.findIndex((question) => question.id === item.id);
    const siblingSwapIndex = siblingIndex + direction;
    if (siblingSwapIndex < 0 || siblingSwapIndex >= siblings.length) return;
    const index = test.testQuestions.findIndex((question) => question.id === item.id);
    const swapIndex = test.testQuestions.findIndex(
      (question) => question.id === siblings[siblingSwapIndex].id,
    );
    const previous = test.testQuestions;
    const reordered = [...previous];
    [reordered[index], reordered[swapIndex]] = [reordered[swapIndex], reordered[index]];
    const optimistic = reordered.map((item, orderIndex) => ({ ...item, orderIndex }));
    if (!beginMutation('reorder')) return;
    setTest({ ...test, testQuestions: optimistic });
    try {
      await assessmentApi.testQuestions.reorder(
        test.id,
        optimistic.map((item) => item.id),
      );
      await refreshTestDetail(test.id);
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
  const selectedGroupQuestions = selectedGroup
    ? test.testQuestions.filter((item) => item.groupId === selectedGroup.id)
    : [];
  const workingQuestions = selectedGroup
    ? selectedGroupQuestions
    : test.testQuestions.filter((item) => !item.groupId);
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
  const readiness = [
    { ok: (test.questionGroups?.length ?? 0) > 0, label: 'Có ít nhất một cụm câu hỏi' },
    { ok: test.testQuestions.length > 0, label: 'Có câu hỏi trong đề' },
    { ok: (test.questionGroups ?? []).every((group) => group.testQuestions.length > 0), label: 'Mỗi cụm có ít nhất một câu hỏi' },
    { ok: test.testQuestions.every((item) => Boolean(item.groupId)), label: 'Mọi câu hỏi đã được xếp vào cụm' },
  ];
  const publishReady = readiness.every((item) => item.ok);

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
              disabled={pendingAction !== null || !publishReady}
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
            'Cụm & câu hỏi',
            'Thiết lập',
            'Xem trước & xuất bản',
          ].map((label, index) => (
            <button
              aria-label={index === 2 ? '3. Nội dung phần thi — Cụm & câu hỏi' : undefined}
              className={`rounded-lg px-2 py-2 text-left ${step === index + 1 ? 'bg-indigo-50 text-indigo-700' : ''}`}
              key={label}
              onClick={() => setStep(index + 1)}
              type="button"
            >
              {index + 1}. {label}{index === 2 ? <span className="sr-only"> Nội dung phần thi</span> : null}
            </button>
          ))}
        </div>
      </div>
      {step === 1 ? (
        <IdentityForm
          key={`${test.id}-${test.updatedAt}`}
          lessons={lessons}
          pending={pendingAction !== null}
          test={test}
          onSave={saveMetadata}
        />
      ) : null}

      {step === 4 ? <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <SettingsForm key={`${test.id}-${test.updatedAt}-settings`} pending={pendingAction !== null} test={test} onSave={saveMetadata} />
        <aside className="rounded-2xl border bg-white p-5 shadow-sm"><h2 className="text-lg font-bold">Kiểm tra khả năng xuất bản</h2><p className="mt-1 text-sm text-slate-500">Rà soát cấu trúc và chính sách trước khi xem thử như học viên.</p><ul className="mt-4 space-y-2 text-sm">{readiness.map((item) => <li className={`rounded-lg p-3 ${item.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-900'}`} key={item.label}>{item.ok ? '✓' : '!'} {item.label}</li>)}</ul></aside>
      </section> : null}

      {step === 5 ? <section className="rounded-2xl border bg-white p-6 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm font-bold uppercase text-indigo-600">Bước cuối</p><h2 className="mt-1 text-2xl font-bold">Xem trước & xuất bản</h2><p className="mt-2 text-sm text-slate-600">Bản xem trước chỉ đọc mô phỏng hình thức trả lời của học viên và không hiển thị đáp án đúng.</p></div><button className="rounded border border-indigo-300 px-4 py-2 font-semibold text-indigo-700" onClick={() => setPreviewOpen(true)} type="button">Mở bản xem trước</button></div><div className="mt-5"><StudentLikePreview test={test} /></div><div className={`mt-5 rounded-xl p-4 text-sm ${publishReady ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-900'}`}>{publishReady ? 'Đề đã sẵn sàng để xuất bản.' : 'Đề chưa sẵn sàng. Quay lại các bước trước để hoàn thiện những mục còn thiếu.'}</div>{test.status === 'DRAFT' ? <button className="mt-4 rounded bg-green-600 px-5 py-2 font-semibold text-white disabled:opacity-50" disabled={!publishReady || pendingAction !== null} onClick={() => void publish()} type="button">Xuất bản đề</button> : null}</section> : null}

      <section className={`${step === 2 ? 'space-y-4' : 'hidden'} rounded-lg border bg-white p-5 shadow-sm`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 aria-label="Phần thi theo bốn kỹ năng — Cụm câu hỏi" className="text-lg font-semibold">Cụm câu hỏi theo bốn kỹ năng</h2>
            <p className="text-sm text-slate-500">
              Mỗi kỹ năng có thể có nhiều cụm; mỗi cụm có tài liệu đi kèm riêng.
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
                + Cụm {toeicSkillLabel[skill]}
              </button>
            ))}
          </div>
        </div>
        {(test.questionGroups ?? []).length === 0 ? (
          <p className="rounded bg-slate-50 p-4 text-sm text-slate-500">
            Chưa có cụm câu hỏi. Hãy tạo ít nhất một cụm trước khi xuất bản
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
                      {group.title || `Cụm câu hỏi ${group.orderIndex + 1}`}
                    </h3>
                    <p className="text-xs text-slate-500">
                      {group.testQuestions.length} câu · {group.stimuli.length} tài liệu
                      <span className="sr-only"> · {group.stimuli.length} ngữ liệu</span>
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
                      Lưu cụm
                    </button>
                  </div>
                  <button
                    aria-label={`Chọn để thêm câu hỏi vào phần thi ${groupIndex + 1}`}
                    className={`w-full rounded border px-3 py-2 text-sm ${selectedGroupId === group.id ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : ''}`}
                    onClick={() => setSelectedGroupId(group.id)}
                    type="button"
                  >
                    {selectedGroupId === group.id
                      ? <><span>Đang chọn cụm này</span><span className="sr-only">Đang chọn phần thi này</span></>
                      : 'Chọn để soạn ở bước 3'}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className={`${step === 3 ? 'space-y-4' : 'hidden'} rounded-lg border bg-white p-5 shadow-sm`}>
        <div>
          <h2 className="text-lg font-semibold">Soạn cụm câu hỏi</h2>
          <p className="text-sm text-slate-500">
            Chọn kỹ năng, rồi chọn một cụm để quản lý tài liệu và câu hỏi trong đúng phạm vi.
          </p>
        </div>
        <div className="grid min-w-0 gap-3 lg:grid-cols-4" aria-label="Dàn ý kỹ năng và cụm câu hỏi">
          {(['LISTENING', 'READING', 'SPEAKING', 'WRITING'] as const).map((skill) => {
            const groups = (test.questionGroups ?? []).filter((group) => group.skill === skill);
            return <section className="min-w-0 rounded-xl border bg-slate-50 p-3" key={skill}>
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-bold">Phần {toeicSkillLabel[skill]}</h3>
                <button className="rounded border bg-white px-2 py-1 text-xs" disabled={pendingAction !== null} onClick={() => void addGroup(skill)} type="button">+ Cụm</button>
              </div>
              <div className="mt-2 space-y-2">
                {groups.map((group, index) => <button className={`w-full rounded-lg border p-2 text-left text-sm ${selectedGroupId === group.id ? 'border-indigo-500 bg-indigo-50 text-indigo-800' : 'bg-white'}`} key={group.id} onClick={() => setSelectedGroupId(group.id)} type="button">
                  <strong className="block break-words">{group.title || `Cụm câu hỏi ${index + 1}`}</strong>
                  <span className="mt-1 block text-xs text-slate-500">{group.testQuestions.length} câu · {group.stimuli.length} tài liệu</span>
                </button>)}
                {!groups.length ? <p className="text-xs text-slate-500">Chưa có cụm câu hỏi.</p> : null}
              </div>
            </section>;
          })}
        </div>
        {!selectedGroup ? <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Hãy chọn một cụm câu hỏi để bắt đầu soạn.</p> : <div className="rounded-lg bg-indigo-50 p-3 text-sm text-indigo-800"><strong>Đang soạn:</strong> Phần {toeicSkillLabel[selectedGroup.skill]} · {selectedGroup.title || 'Cụm câu hỏi'}</div>}
        {selectedGroup ? <section className="rounded-xl border bg-slate-50 p-4">
          <h3 className="font-bold">Tài liệu đi kèm câu hỏi</h3>
          <p className="text-sm text-slate-500">Đoạn văn, hình ảnh hoặc âm thanh có thể dùng cho một câu hoặc dùng chung cho cả cụm câu hỏi này.</p>
          <p className="mt-2 rounded bg-white p-2 text-xs text-slate-600">Câu độc lập: không cần tài liệu · 1 tài liệu → 1 câu: tạo một cụm riêng · 1 tài liệu → nhiều câu: đặt các câu trong cùng cụm.</p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row"><textarea aria-label="Tài liệu văn bản của cụm đang chọn" className="min-h-20 min-w-0 flex-1 rounded border p-2 text-sm" onChange={(event) => setTextStimulusDrafts((current) => ({ ...current, [selectedGroup.id]: event.target.value }))} placeholder="Nhập đoạn văn đi kèm câu hỏi" value={textStimulusDrafts[selectedGroup.id] ?? ''} /><button className="rounded border bg-white px-4 py-2 text-sm" disabled={pendingAction !== null || !textStimulusDrafts[selectedGroup.id]?.trim()} onClick={() => void addTextStimulus(selectedGroup.id)} type="button">Thêm đoạn văn</button></div>
          <label className="mt-3 block text-sm font-medium">Tải hình ảnh hoặc âm thanh<input accept="image/jpeg,image/png,image/webp,audio/mpeg,audio/mp4,audio/ogg,audio/webm" className="mt-1 block w-full rounded border bg-white p-2" onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; void assessmentApi.groups.upload(test.id, selectedGroup.id, file).then(() => refreshTestDetail(test.id)).catch((error) => void handleMutationError(error, 'Không thể tải tài liệu đi kèm câu hỏi.')); }} type="file" /></label>
          <div className="mt-3 space-y-2">{selectedGroup.stimuli.map((stimulus, stimulusIndex) => <div className="rounded border bg-white p-3 text-sm" key={stimulus.id}><div className="flex min-w-0 items-start gap-2"><span className="min-w-0 flex-1 break-words"><strong>{stimulus.type === 'TEXT' ? 'Văn bản' : stimulus.type === 'IMAGE' ? 'Hình ảnh' : 'Âm thanh'}</strong> · {stimulus.textContent || stimulus.altText || stimulus.mimeType || 'Tệp được bảo vệ'}</span><button aria-label="Đưa tài liệu lên" disabled={stimulusIndex === 0 || pendingAction !== null} onClick={() => void moveStimulus(selectedGroup.id, stimulusIndex, -1)} type="button">↑</button><button aria-label="Đưa tài liệu xuống" disabled={stimulusIndex === selectedGroup.stimuli.length - 1 || pendingAction !== null} onClick={() => void moveStimulus(selectedGroup.id, stimulusIndex, 1)} type="button">↓</button><button className="text-red-700" disabled={pendingAction !== null} onClick={() => void removeStimulus(selectedGroup.id, stimulus.id)} type="button">Xóa</button></div><p className="mt-2 text-xs font-semibold text-indigo-700">{selectedGroupQuestions.length <= 1 ? `Dùng cho: Câu ${selectedGroupQuestions.length ? 1 : '—'}` : `Dùng chung cho: Câu 1–${selectedGroupQuestions.length}`}</p></div>)}{selectedGroup.stimuli.length === 0 ? <p className="text-sm text-slate-500">Cụm này không có tài liệu đi kèm; phù hợp với câu hỏi độc lập.</p> : null}</div>
        </section> : null}
        {workingQuestions.length === 0 ? (
          <p className="rounded bg-slate-50 p-4 text-sm text-slate-500">Cụm câu hỏi này chưa có câu nào.</p>
        ) : (
          <div className="space-y-3" aria-label={selectedGroup ? 'Câu hỏi của cụm đang chọn' : 'Câu hỏi chưa xếp cụm'}>
            {!selectedGroup ? <h3 className="font-bold text-amber-900">Câu hỏi chưa xếp cụm</h3> : null}
            {workingQuestions.map((item, index) => (
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
                      Cụm câu hỏi
                      <select
                        aria-label={`Cụm câu hỏi của câu ${index + 1}`}
                        className="ml-2 rounded border p-1.5"
                        disabled={pendingAction !== null}
                        onChange={(event) => void changeQuestionGroup(item, event.target.value)}
                        value={item.groupId ?? ''}
                      >
                        <option value="">Chưa gán cụm</option>
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
                      onClick={() => void moveQuestion(item, -1)}
                      type="button"
                    >
                      ↑
                    </button>
                    <button
                      aria-label={`Đưa câu ${index + 1} xuống`}
                      className="rounded border px-2 py-1"
                      disabled={pendingAction !== null || index === workingQuestions.length - 1}
                      onClick={() => void moveQuestion(item, 1)}
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

      <section className={`${step === 3 ? 'space-y-3' : 'hidden'} rounded-lg border bg-white p-5 shadow-sm`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Thêm từ ngân hàng câu hỏi</h2>
            <p className="text-sm text-slate-500">{selectedGroup ? `Thêm vào Phần ${toeicSkillLabel[selectedGroup.skill]} · ${selectedGroup.title || 'Cụm câu hỏi'}.` : 'Chọn một cụm câu hỏi trước khi mở ngân hàng.'}</p>
          </div>
          <button
            aria-label="Mở bộ chọn câu hỏi"
            className="rounded bg-indigo-600 px-4 py-2 font-semibold text-white disabled:opacity-40"
            disabled={!selectedGroupId}
            onClick={() => setPickerOpen(true)}
            type="button"
          >
            Thêm câu hỏi từ ngân hàng
          </button>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-48 text-sm font-medium">
            Cụm câu hỏi
            <select
              className="mt-1 w-full rounded border p-2"
              onChange={(event) => {
                setSelectedGroupId(event.target.value);
                setPickerPage(1);
              }}
              value={selectedGroupId}
            >
              <option value="">Chưa chọn cụm</option>
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
                      {questionTypeLabel[question.type]} · {difficultyLabel[question.difficulty]} · đã dùng {question.usageCount ?? 0} đề
                    </small>
                    <small className="mt-1 block text-slate-500">{question.toeicSkill === 'LISTENING' ? 'Kiểm tra tài liệu nghe trong cụm' : question.toeicSkill === 'READING' ? 'Kiểm tra đoạn đọc/ngữ cảnh trước khi chọn' : question.rubric ? `Rubric: ${question.rubric.name}` : 'Cần rubric chấm điểm'}</small>
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
            <div className="mt-5"><StudentLikePreview test={test} /></div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function IdentityForm({
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
  const [formError, setFormError] = useState<string | null>(null);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) {
      setFormError('Tiêu đề không được để trống.');
      return;
    }
    const effective: Partial<TestInput> = {
      type,
      title: title.trim(),
      description: description.trim() || null,
      lessonId: lockedInClass ? test.lessonId : type === 'QUIZ' ? lessonId || null : null,
    };
    const delta: Partial<TestInput> = {};
    if (!lockedInClass && effective.type !== test.type) delta.type = effective.type;
    if (effective.title !== test.title) delta.title = effective.title;
    if (effective.description !== test.description) delta.description = effective.description;
    if (effective.lessonId !== test.lessonId) delta.lessonId = effective.lessonId;

    setFormError(null);
    if (Object.keys(delta).length === 0) return;
    void onSave(delta);
  };

  return (
    <form className="space-y-4 rounded-lg border bg-white p-5 shadow-sm" onSubmit={submit}>
      <h2 className="text-lg font-semibold">Thông tin đề</h2>
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
      <p className="text-xs text-slate-500">
        Bước này chỉ xác định danh tính và ngữ cảnh của đề. Cấu trúc, nội dung và thiết lập được quản lý ở các bước tiếp theo.
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

function SettingsForm({
  test,
  pending,
  onSave,
}: {
  test: AssessmentTestDetail;
  pending: boolean;
  onSave: (input: Partial<TestInput>) => Promise<void>;
}) {
  const [maxAttempts, setMaxAttempts] = useState(test.maxAttempts);
  const [showResult, setShowResult] = useState(test.showResultAfterSubmit);
  const [formError, setFormError] = useState<string | null>(null);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
      setFormError('Số lượt làm phải là số nguyên lớn hơn hoặc bằng 1.');
      return;
    }
    const delta: Partial<TestInput> = {};
    if (maxAttempts !== test.maxAttempts) delta.maxAttempts = maxAttempts;
    if (showResult !== test.showResultAfterSubmit) delta.showResultAfterSubmit = showResult;
    setFormError(null);
    if (Object.keys(delta).length) void onSave(delta);
  };
  return (
    <form className="space-y-4 rounded-lg border bg-white p-5 shadow-sm" onSubmit={submit}>
      <div>
        <h2 className="text-lg font-semibold">Thiết lập bài kiểm tra</h2>
        <p className="text-sm text-slate-500">Cấu hình số lượt làm và chính sách hiển thị kết quả.</p>
      </div>
      {formError ? <p className="rounded bg-red-50 p-3 text-sm text-red-700">{formError}</p> : null}
      <label className="block text-sm font-medium">
        Số lượt làm
        <input className="mt-1 w-full rounded border p-2" disabled={pending} min={1} required type="number" value={maxAttempts} onChange={(event) => setMaxAttempts(Number(event.target.value))} />
      </label>
      <label className="flex items-center gap-2 text-sm font-medium">
        <input checked={showResult} disabled={pending} onChange={(event) => setShowResult(event.target.checked)} type="checkbox" />
        Cho học viên xem đáp án/kết quả sau khi nộp
      </label>
      <p className="text-xs text-slate-500">Sau khi đã có lượt làm, số lượt làm có thể bị khóa để bảo toàn lịch sử. Chính sách xem kết quả vẫn có thể cập nhật theo quyền hiện hành.</p>
      <div className="flex justify-end"><button className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50" disabled={pending} type="submit">{pending ? 'Đang lưu...' : 'Lưu thiết lập'}</button></div>
    </form>
  );
}

function StudentLikePreview({ test }: { test: AssessmentTestDetail }) {
  return (
    <div className="space-y-4" aria-label="Bản xem trước dành cho học viên">
      {(['LISTENING', 'READING', 'SPEAKING', 'WRITING'] as const).map((skill) => {
        const groups = (test.questionGroups ?? []).filter((group) => group.skill === skill);
        if (!groups.length) return null;
        return <section className="rounded-2xl border bg-slate-50 p-4" key={skill}>
          <p className="text-xs font-bold uppercase tracking-wide text-indigo-600">Phần {toeicSkillLabel[skill]}</p>
          <div className="mt-3 space-y-4">
            {groups.map((group, groupIndex) => <article className="rounded-xl border bg-white p-4" key={group.id}>
              <h3 className="font-bold">Cụm câu hỏi {groupIndex + 1} · {group.title || toeicSkillLabel[group.skill]}</h3>
              {group.instructions ? <p className="mt-2 text-sm text-slate-600">{group.instructions}</p> : null}
              {group.stimuli.length ? <div className="mt-3 space-y-2" aria-label="Tài liệu đi kèm câu hỏi">
                {group.stimuli.map((stimulus) => <PreviewStimulus key={stimulus.id} stimulus={stimulus} />)}
                <p className="text-xs font-semibold text-indigo-700">{group.testQuestions.length <= 1 ? 'Dùng cho: Câu 1' : `Dùng chung cho: Câu 1–${group.testQuestions.length}`}</p>
              </div> : null}
              <ol className="mt-3 space-y-3">
                {group.testQuestions.map((item, index) => <li className="rounded-lg border p-3 text-sm" key={item.id}><p><strong>Câu {index + 1}.</strong> {item.question.content}</p><ResponseShape item={item} /></li>)}
              </ol>
            </article>)}
          </div>
        </section>;
      })}
    </div>
  );
}

function PreviewStimulus({ stimulus }: { stimulus: NonNullable<AssessmentTestDetail['questionGroups']>[number]['stimuli'][number] }) {
  if (stimulus.type === 'TEXT') return <div className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm">{stimulus.textContent}</div>;
  if (stimulus.type === 'IMAGE') return stimulus.mediaUrl ? <img alt={stimulus.altText || 'Hình ảnh đi kèm câu hỏi'} className="max-h-96 max-w-full rounded-lg object-contain" src={stimulus.mediaUrl} /> : <p className="rounded-lg bg-slate-50 p-3 text-sm">Hình ảnh được bảo vệ không khả dụng trong bản xem trước.</p>;
  return stimulus.mediaUrl ? <audio aria-label={stimulus.altText || 'Âm thanh đi kèm câu hỏi'} className="w-full" controls preload="metadata" src={stimulus.mediaUrl} /> : <p className="rounded-lg bg-slate-50 p-3 text-sm">Âm thanh được bảo vệ không khả dụng trong bản xem trước.</p>;
}

function ResponseShape({ item }: { item: AssessmentTestQuestion }) {
  const type = item.question.type;
  if (type === 'TEXT_RESPONSE') return <textarea aria-label="Câu trả lời viết (xem trước)" className="mt-3 w-full rounded border p-2" disabled placeholder="Học viên nhập câu trả lời tại đây" />;
  if (type === 'AUDIO_RESPONSE') return <button className="mt-3 rounded border px-3 py-2 text-slate-500" disabled type="button">Ghi âm câu trả lời</button>;
  const inputType = type === 'MULTIPLE_CHOICE' ? 'checkbox' : 'radio';
  return <div className="mt-3 space-y-2">{item.question.options.map((option) => <label className="flex items-center gap-2 rounded border p-2" key={option.id}><input disabled name={`preview-${item.id}`} type={inputType} />{option.content}</label>)}</div>;
}
