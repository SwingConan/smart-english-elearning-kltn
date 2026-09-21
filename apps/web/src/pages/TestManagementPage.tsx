import { FormEvent, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { assessmentApi } from '@/features/assessments/api';
import { loadCourseLessons, type LessonChoice } from '@/features/assessments/curriculum';
import { testStatusLabel, testTypeLabel } from '@/features/assessments/display';
import { assessmentErrorMessage } from '@/features/assessments/errors';
import type { AssessmentTestDetail, TestInput, TestType } from '@/features/assessments/types';
import { useSessionExpiry } from '@/features/auth/use-session-expiry';

export function TestManagementPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const redirectExpiredSession = useSessionExpiry();
  const mutationInFlight = useRef(false);
  const [tests, setTests] = useState<AssessmentTestDetail[]>([]);
  const [lessons, setLessons] = useState<LessonChoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    async function fetchPage() {
      if (!courseId) return;
      try {
        const [summaries, lessonChoices] = await Promise.all([
          assessmentApi.tests.list(courseId, controller.signal),
          loadCourseLessons(courseId, controller.signal),
        ]);
        const details = await Promise.all(
          summaries.map((test) => assessmentApi.tests.get(test.id, controller.signal)),
        );
        setTests(details);
        setLessons(lessonChoices);
        setLoadError(null);
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return;
        if (await redirectExpiredSession(error)) return;
        setLoadError(assessmentErrorMessage(error, 'Không thể tải danh sách bài kiểm tra.'));
      } finally {
        setLoading(false);
      }
    }
    void fetchPage();
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

  const replaceTest = (updated: AssessmentTestDetail) => {
    setTests((current) => current.map((test) => test.id === updated.id ? updated : test));
  };

  const createTest = async (input: TestInput) => {
    if (!courseId || !beginMutation('create')) return;
    try {
      const created = await assessmentApi.tests.create(courseId, input);
      setTests((current) => [...current, created]);
      setCreateOpen(false);
    } catch (error) {
      if (await redirectExpiredSession(error)) return;
      setActionError(assessmentErrorMessage(error, 'Không thể tạo bài kiểm tra.'));
    } finally {
      endMutation();
    }
  };

  const publish = async (test: AssessmentTestDetail) => {
    if (!window.confirm(`Xuất bản “${test.title}”?`)) return;
    if (!beginMutation(`publish-${test.id}`)) return;
    try {
      replaceTest(await assessmentApi.tests.publish(test.id));
    } catch (error) {
      if (await redirectExpiredSession(error)) return;
      setActionError(assessmentErrorMessage(error, 'Không thể xuất bản bài kiểm tra.'));
    } finally {
      endMutation();
    }
  };

  const unpublish = async (test: AssessmentTestDetail) => {
    if (!window.confirm(`Chuyển “${test.title}” về bản nháp?`)) return;
    if (!beginMutation(`unpublish-${test.id}`)) return;
    try {
      replaceTest(await assessmentApi.tests.unpublish(test.id));
    } catch (error) {
      if (await redirectExpiredSession(error)) return;
      setActionError(assessmentErrorMessage(
        error,
        'Không thể chuyển bài kiểm tra về bản nháp.',
        'Không thể chuyển bài kiểm tra về bản nháp vì đã có học viên bắt đầu làm bài.',
      ));
    } finally {
      endMutation();
    }
  };

  const deleteTest = async (test: AssessmentTestDetail) => {
    if (!window.confirm(`Xóa bài kiểm tra “${test.title}”?`)) return;
    if (!beginMutation(`delete-${test.id}`)) return;
    try {
      await assessmentApi.tests.delete(test.id);
      setTests((current) => current.filter((item) => item.id !== test.id));
    } catch (error) {
      if (await redirectExpiredSession(error)) return;
      setActionError(assessmentErrorMessage(
        error,
        'Không thể xóa bài kiểm tra.',
        'Không thể xóa bài kiểm tra vì đã có lịch sử làm bài hoặc dữ liệu vừa thay đổi.',
      ));
    } finally {
      endMutation();
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Quản lý bài kiểm tra</h1>
          <p className="mt-1 text-sm text-slate-600">Tạo, biên soạn và xuất bản bài kiểm tra của khóa học.</p>
        </div>
        <div className="flex gap-2">
          {courseId && <Link className="rounded border px-4 py-2 text-sm" to={`/instructor/courses/${courseId}/question-bank`}>Ngân hàng câu hỏi</Link>}
          <button className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50" disabled={pendingAction !== null} onClick={() => { setCreateOpen(true); setActionError(null); }} type="button">Tạo bài kiểm tra</button>
        </div>
      </div>

      {actionError && <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{actionError}</div>}
      {createOpen && <TestForm lessons={lessons} pending={pendingAction === 'create'} onCancel={() => setCreateOpen(false)} onSave={createTest} />}

      {loading ? (
        <p className="py-10 text-center text-slate-500">Đang tải bài kiểm tra...</p>
      ) : loadError ? (
        <div className="rounded border border-red-200 bg-red-50 p-4 text-red-700">
          <p>{loadError}</p>
          <button className="mt-3 rounded border px-3 py-1 text-sm" onClick={() => { setLoading(true); setLoadError(null); setReloadKey((current) => current + 1); }} type="button">Thử lại</button>
        </div>
      ) : tests.length === 0 ? (
        <div className="rounded border bg-white p-8 text-center text-slate-500">Chưa có bài kiểm tra nào.</div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {tests.map((test) => (
            <article className="rounded-lg border bg-white p-5 shadow-sm" key={test.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="mb-2 flex gap-2 text-xs">
                    <span className="rounded bg-indigo-100 px-2 py-1 text-indigo-800">{testTypeLabel[test.type]}</span>
                    <span className={`rounded px-2 py-1 ${test.status === 'PUBLISHED' ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-700'}`}>{testStatusLabel[test.status]}</span>
                  </div>
                  <h2 className="text-lg font-semibold">{test.title}</h2>
                </div>
                <Link className="rounded border px-3 py-1.5 text-sm" to={`/instructor/tests/${test.id}/edit`}>Chỉnh sửa</Link>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
                <div><dt className="text-slate-500">Bài học</dt><dd>{test.lessonId ? lessons.find((lesson) => lesson.id === test.lessonId)?.label ?? 'Bài học thuộc khóa' : 'Không gắn'}</dd></div>
                <div><dt className="text-slate-500">Số câu hỏi</dt><dd>{test.testQuestions.length}</dd></div>
                <div><dt className="text-slate-500">Số lượt làm</dt><dd>{test.maxAttempts}</dd></div>
                <div><dt className="text-slate-500">Hiện kết quả</dt><dd>{test.showResultAfterSubmit ? 'Có' : 'Không'}</dd></div>
              </dl>
              <div className="mt-5 flex flex-wrap gap-2">
                {test.status === 'DRAFT' ? (
                  <button className="rounded bg-green-600 px-3 py-1.5 text-sm text-white disabled:opacity-50" disabled={pendingAction !== null} onClick={() => void publish(test)} type="button">{pendingAction === `publish-${test.id}` ? 'Đang xuất bản...' : 'Xuất bản'}</button>
                ) : (
                  <button className="rounded border px-3 py-1.5 text-sm disabled:opacity-50" disabled={pendingAction !== null} onClick={() => void unpublish(test)} type="button">{pendingAction === `unpublish-${test.id}` ? 'Đang xử lý...' : 'Về bản nháp'}</button>
                )}
                <button className="rounded border border-red-300 px-3 py-1.5 text-sm text-red-700 disabled:opacity-50" disabled={pendingAction !== null} onClick={() => void deleteTest(test)} type="button">{pendingAction === `delete-${test.id}` ? 'Đang xóa...' : 'Xóa'}</button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function TestForm({ lessons, pending, onCancel, onSave }: {
  lessons: LessonChoice[];
  pending: boolean;
  onCancel: () => void;
  onSave: (input: TestInput) => Promise<void>;
}) {
  const [type, setType] = useState<TestType>('PLACEMENT');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [lessonId, setLessonId] = useState('');
  const [maxAttempts, setMaxAttempts] = useState(1);
  const [showResult, setShowResult] = useState(true);
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
    setFormError(null);
    void onSave({
      type,
      title: title.trim(),
      description: description.trim() || null,
      lessonId: type === 'QUIZ' ? lessonId || null : null,
      maxAttempts,
      showResultAfterSubmit: showResult,
    });
  };

  return (
    <form className="space-y-4 rounded-lg border bg-white p-5 shadow-sm" onSubmit={submit}>
      <h2 className="text-lg font-semibold">Tạo bài kiểm tra bản nháp</h2>
      {formError && <p className="rounded bg-red-50 p-3 text-sm text-red-700">{formError}</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium">Loại
          <select className="mt-1 w-full rounded border p-2" disabled={pending} value={type} onChange={(event) => { const next = event.target.value as TestType; setType(next); if (next === 'PLACEMENT') setLessonId(''); }}>
            {Object.entries(testTypeLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium">Số lượt làm
          <input className="mt-1 w-full rounded border p-2" disabled={pending} min={1} required type="number" value={maxAttempts} onChange={(event) => setMaxAttempts(Number(event.target.value))} />
        </label>
      </div>
      <label className="block text-sm font-medium">Tiêu đề
        <input className="mt-1 w-full rounded border p-2" disabled={pending} maxLength={300} required value={title} onChange={(event) => setTitle(event.target.value)} />
      </label>
      <label className="block text-sm font-medium">Mô tả (không bắt buộc)
        <textarea className="mt-1 w-full rounded border p-2" disabled={pending} maxLength={5000} value={description} onChange={(event) => setDescription(event.target.value)} />
      </label>
      {type === 'QUIZ' && (
        <label className="block text-sm font-medium">Bài học
          <select className="mt-1 w-full rounded border p-2" disabled={pending} value={lessonId} onChange={(event) => setLessonId(event.target.value)}>
            <option value="">Chưa chọn — bắt buộc trước khi xuất bản</option>
            {lessons.map((lesson) => <option key={lesson.id} value={lesson.id}>{lesson.label}</option>)}
          </select>
        </label>
      )}
      <label className="flex items-center gap-2 text-sm font-medium">
        <input checked={showResult} disabled={pending} onChange={(event) => setShowResult(event.target.checked)} type="checkbox" />
        Cho học viên xem đáp án/kết quả sau khi nộp
      </label>
      <div className="flex justify-end gap-2">
        <button className="rounded border px-4 py-2" disabled={pending} onClick={onCancel} type="button">Hủy</button>
        <button className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50" disabled={pending} type="submit">{pending ? 'Đang tạo...' : 'Tạo bản nháp'}</button>
      </div>
    </form>
  );
}
