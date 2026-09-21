import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api-client';
import { StudentTestAttemptPage } from '@/pages/StudentTestAttemptPage';
import { StudentTestResultPage } from '@/pages/StudentTestResultPage';
import { studentAssessmentApi } from './api';
import { deferred, renderAssessmentRoute } from './assessment-test-utils';
import type { StudentAnswerSelection, StudentAttemptContent, StudentAttemptResult, StudentSubmission } from './types';

const enrollmentId = 'enrollment-a';
const attemptId = 'attempt-a';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('StudentTestAttemptPage', () => {
  it('renders SC/TF radios and MC checkboxes with saved selections and no pre-submit secrets', async () => {
    vi.spyOn(studentAssessmentApi, 'getAttempt').mockResolvedValue(attemptContent());
    renderAttempt();
    await screen.findByText('SC question');

    expect(screen.getAllByRole('radio')).toHaveLength(4);
    expect(screen.getAllByRole('checkbox')).toHaveLength(3);
    expect(screen.getByLabelText('SC A')).toBeChecked();
    expect(screen.getByLabelText('TF B')).toBeChecked();
    expect(screen.getByLabelText('MC A')).toBeChecked();
    expect(screen.getByLabelText('MC B')).toBeChecked();
    expect(document.body.textContent).not.toMatch(/Correct answer|Incorrect|Secret explanation|pointsAwarded|maxScore|Score:/i);
    expect(document.querySelector('[data-is-correct]')).not.toBeInTheDocument();
  });

  it('debounces autosave without real sleeps and immediately updates local selection', async () => {
    vi.spyOn(studentAssessmentApi, 'getAttempt').mockResolvedValue(attemptContent());
    const save = vi.spyOn(studentAssessmentApi, 'saveAnswers').mockResolvedValue({ attemptId, answers: [] });
    renderAttempt();
    await screen.findByText('SC question');
    vi.useFakeTimers();

    fireEvent.click(screen.getByLabelText('SC B'));
    expect(screen.getByLabelText('SC B')).toBeChecked();
    expect(screen.getByText(/Chờ tự động lưu/i)).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
    await act(async () => { vi.advanceTimersByTime(499); });
    expect(save).not.toHaveBeenCalled();
    await act(async () => { vi.advanceTimersByTime(1); });
    expect(save).toHaveBeenCalledOnce();
    expect(save.mock.calls[0]).toEqual([enrollmentId, attemptId, expectedAnswers({ sc: ['sc-b'] })]);
    await act(async () => undefined);
    expect(screen.getByText(/^Đã lưu$/i)).toBeInTheDocument();
  });

  it('prevents an older autosave completion from rolling a rapid newer selection backward', async () => {
    vi.spyOn(studentAssessmentApi, 'getAttempt').mockResolvedValue(attemptContent());
    const older = deferred<{ attemptId: string; answers: StudentAnswerSelection[] }>();
    const newer = deferred<{ attemptId: string; answers: StudentAnswerSelection[] }>();
    const save = vi.spyOn(studentAssessmentApi, 'saveAnswers')
      .mockReturnValueOnce(older.promise)
      .mockReturnValueOnce(newer.promise);
    renderAttempt();
    await screen.findByText('SC question');
    vi.useFakeTimers();

    fireEvent.click(screen.getByLabelText('SC B'));
    await act(async () => { vi.advanceTimersByTime(500); });
    expect(save).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByLabelText('SC A'));
    await act(async () => { vi.advanceTimersByTime(500); });
    expect(save).toHaveBeenCalledTimes(2);
    newer.resolve({ attemptId, answers: expectedAnswers({ sc: ['sc-a'] }) });
    await act(async () => undefined);
    older.resolve({ attemptId, answers: expectedAnswers({ sc: ['sc-b'] }) });
    await act(async () => undefined);

    expect(screen.getByLabelText('SC A')).toBeChecked();
    expect(screen.getByLabelText('SC B')).not.toBeChecked();
    expect(screen.getByText(/^Đã lưu$/i)).toBeInTheDocument();
  });

  it('keeps current answers and exposes safe status when autosave fails', async () => {
    vi.spyOn(studentAssessmentApi, 'getAttempt').mockResolvedValue(attemptContent());
    vi.spyOn(studentAssessmentApi, 'saveAnswers').mockRejectedValue(new ApiError(500, { stack: 'raw internal' }));
    renderAttempt();
    await screen.findByText('SC question');
    vi.useFakeTimers();
    fireEvent.click(screen.getByLabelText('SC B'));
    await act(async () => { vi.advanceTimersByTime(500); });
    await act(async () => undefined);
    expect(screen.getByLabelText('SC B')).toBeChecked();
    expect(screen.getByText(/Lưu chưa thành công/i)).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/Không thể tự động lưu/i);
    expect(screen.queryByText(/raw internal/i)).not.toBeInTheDocument();
  });

  it('submits current local state before pending debounce with a complete secret-free payload', async () => {
    vi.spyOn(studentAssessmentApi, 'getAttempt').mockResolvedValue(attemptContent());
    const save = vi.spyOn(studentAssessmentApi, 'saveAnswers').mockResolvedValue({ attemptId, answers: [] });
    const submitPending = deferred<StudentSubmission>();
    const submit = vi.spyOn(studentAssessmentApi, 'submit').mockReturnValueOnce(submitPending.promise);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderAttempt();
    await screen.findByText('SC question');
    vi.useFakeTimers();

    fireEvent.click(screen.getByLabelText('SC B'));
    fireEvent.click(screen.getByLabelText('TF A'));
    fireEvent.click(screen.getByLabelText('MC A'));
    fireEvent.click(screen.getByRole('button', { name: /^Nộp bài$/i }));
    fireEvent.click(screen.getByRole('button', { name: /Đang nộp bài/i }));
    expect(submit).toHaveBeenCalledOnce();
    const payload = submit.mock.calls[0][2];
    expect(payload).toEqual(expectedAnswers({ sc: ['sc-b'], tf: ['tf-a'], mc: ['mc-b'] }));
    expect(JSON.stringify(payload)).not.toMatch(/score|maxScore|isCorrect|pointsAwarded|percentage/i);
    expect(screen.getByRole('button', { name: /Đang nộp bài/i })).toBeDisabled();
    expect(screen.getAllByRole('radio')[0]).toBeDisabled();
    await act(async () => { vi.advanceTimersByTime(1000); });
    expect(save).not.toHaveBeenCalled();
    submitPending.resolve(submission());
    await act(async () => undefined);
    expect(screen.getByTestId('location')).toHaveTextContent(`/student/enrollments/${enrollmentId}/attempts/${attemptId}/result`);
  });

  it('supports confirmation cancellation and unanswered submission without client grading', async () => {
    vi.spyOn(studentAssessmentApi, 'getAttempt').mockResolvedValue(attemptContent({ empty: true }));
    const submit = vi.spyOn(studentAssessmentApi, 'submit').mockResolvedValue(submission());
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    renderAttempt();
    await screen.findByText('SC question');
    fireEvent.click(screen.getByRole('button', { name: /^Nộp bài$/i }));
    expect(submit).not.toHaveBeenCalled();
    expect(confirm.mock.calls[0][0]).toMatch(/3 câu chưa trả lời/i);
    fireEvent.click(screen.getByRole('button', { name: /^Nộp bài$/i }));
    await waitFor(() => expect(submit).toHaveBeenCalledWith(enrollmentId, attemptId, expectedAnswers({ sc: [], tf: [], mc: [] })));
  });

  it('preserves answers and re-enables controls after safe submit failure', async () => {
    vi.spyOn(studentAssessmentApi, 'getAttempt').mockResolvedValue(attemptContent());
    vi.spyOn(studentAssessmentApi, 'submit').mockRejectedValueOnce(new ApiError(500, { stack: 'raw submit stack' }));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderAttempt();
    await screen.findByText('SC question');
    fireEvent.click(screen.getByLabelText('SC B'));
    fireEvent.click(screen.getByRole('button', { name: /^Nộp bài$/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Câu trả lời.*vẫn được giữ/i);
    expect(screen.queryByText(/raw submit stack/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText('SC B')).toBeChecked();
    expect(screen.getByLabelText('SC B')).toBeEnabled();
    expect(screen.getByRole('button', { name: /^Nộp bài$/i })).toBeEnabled();
  });

  it('redirects a submitted Attempt without rendering editable controls', async () => {
    vi.spyOn(studentAssessmentApi, 'getAttempt').mockResolvedValue({
      ...attemptContent(), questions: undefined,
      attempt: { ...attemptContent().attempt, status: 'SUBMITTED', submittedAt: '2026-09-22T01:00:00Z' },
    });
    renderAttempt();
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(`/student/enrollments/${enrollmentId}/attempts/${attemptId}/result`));
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('verifies a submit 409 and redirects when the server confirms it is already submitted', async () => {
    vi.spyOn(studentAssessmentApi, 'getAttempt')
      .mockResolvedValueOnce(attemptContent())
      .mockResolvedValueOnce({
        ...attemptContent(), questions: undefined,
        attempt: { ...attemptContent().attempt, status: 'SUBMITTED', submittedAt: '2026-09-22T01:00:00Z' },
      });
    vi.spyOn(studentAssessmentApi, 'submit').mockRejectedValueOnce(new ApiError(409, null));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderAttempt();
    await screen.findByText('SC question');
    fireEvent.click(screen.getByRole('button', { name: /^Nộp bài$/i }));
    expect(await screen.findByTestId('location')).toHaveTextContent(`/student/enrollments/${enrollmentId}/attempts/${attemptId}/result`);
    expect(studentAssessmentApi.submit).toHaveBeenCalledOnce();
  });

  it('shows loading and safe inaccessible Attempt errors', async () => {
    const pending = deferred<StudentAttemptContent>();
    vi.spyOn(studentAssessmentApi, 'getAttempt').mockReturnValueOnce(pending.promise);
    const loading = renderAttempt();
    expect(screen.getByRole('status')).toBeInTheDocument();
    pending.reject(new ApiError(404, { message: 'raw foreign attempt' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/không tồn tại|không thuộc tài khoản/i);
    expect(screen.queryByText(/raw foreign attempt/i)).not.toBeInTheDocument();
    loading.unmount();
  });
});

describe('StudentTestResultPage', () => {
  it('renders allowed post-submit score, metadata, correctness, selections and explanation', async () => {
    vi.spyOn(studentAssessmentApi, 'getResult').mockResolvedValue(result());
    renderResult();
    await screen.findByText(/Result Test/i);
    expect(screen.getByText('7/10')).toBeInTheDocument();
    expect(screen.getByText('70%')).toBeInTheDocument();
    expect(screen.getByText('Result question')).toBeInTheDocument();
    expect(screen.getByText(/Đáp án đúng/i)).toBeInTheDocument();
    expect(screen.getByText(/Bạn đã chọn/i)).toBeInTheDocument();
    expect(screen.getByText(/7\/10 điểm/i)).toBeInTheDocument();
    expect(screen.getByText(/Result explanation/i)).toBeInTheDocument();
  });

  it('distinguishes publication-policy 403 from session expiry and hides result details', async () => {
    vi.spyOn(studentAssessmentApi, 'getResult').mockRejectedValueOnce(new ApiError(403, { message: 'raw policy' }));
    const refresh = vi.fn().mockResolvedValue(undefined);
    renderResult({ includeLogin: true, refreshUser: refresh });
    expect(await screen.findByRole('alert')).toHaveTextContent(/chưa được công bố/i);
    expect(refresh).not.toHaveBeenCalled();
    expect(screen.queryByText('Login page')).not.toBeInTheDocument();
    expect(screen.queryByText('Result explanation')).not.toBeInTheDocument();
    expect(screen.queryByText(/raw policy/i)).not.toBeInTheDocument();
  });

  it('shows safe IN_PROGRESS/404 state instead of a fabricated zero score', async () => {
    vi.spyOn(studentAssessmentApi, 'getResult').mockRejectedValueOnce(new ApiError(404, null));
    renderResult();
    expect(await screen.findByRole('alert')).toHaveTextContent(/vẫn đang được thực hiện/i);
    expect(screen.getByRole('link', { name: /Quay lại lượt làm/i })).toHaveAttribute('href', `/student/enrollments/${enrollmentId}/attempts/${attemptId}`);
    expect(screen.queryByText(/0\/0|0%/)).not.toBeInTheDocument();
  });

  it('removes previously visible result details on a fresh fetch when policy becomes hidden', async () => {
    const getResult = vi.spyOn(studentAssessmentApi, 'getResult').mockResolvedValueOnce(result());
    const visible = renderResult();
    expect(await screen.findByText('Result explanation')).toBeInTheDocument();
    visible.unmount();
    getResult.mockRejectedValueOnce(new ApiError(403, null));
    renderResult();
    expect(await screen.findByRole('alert')).toHaveTextContent(/chưa được công bố/i);
    expect(screen.queryByText('Result explanation')).not.toBeInTheDocument();
    expect(screen.queryByText('7/10')).not.toBeInTheDocument();
  });

  it('shows loading and safe generic failure UX', async () => {
    const pending = deferred<StudentAttemptResult>();
    vi.spyOn(studentAssessmentApi, 'getResult').mockReturnValueOnce(pending.promise);
    renderResult();
    expect(screen.getByRole('status')).toBeInTheDocument();
    pending.reject(new ApiError(500, { stack: 'raw result stack' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Không thể tải kết quả/i);
    expect(screen.queryByText(/raw result stack/i)).not.toBeInTheDocument();
  });
});

function renderAttempt() {
  return renderAssessmentRoute(
    <StudentTestAttemptPage />, `/student/enrollments/${enrollmentId}/attempts/${attemptId}`,
    '/student/enrollments/:enrollmentId/attempts/:attemptId',
  );
}

function renderResult(options: { includeLogin?: boolean; refreshUser?: () => Promise<void> } = {}) {
  return renderAssessmentRoute(
    <StudentTestResultPage />, `/student/enrollments/${enrollmentId}/attempts/${attemptId}/result`,
    '/student/enrollments/:enrollmentId/attempts/:attemptId/result', options,
  );
}

function attemptContent(options: { empty?: boolean } = {}): StudentAttemptContent {
  return {
    attempt: { id: attemptId, attemptNumber: 1, status: 'IN_PROGRESS', startedAt: '2026-09-22T00:00:00Z', submittedAt: null },
    test: { id: 'test-a', title: 'Attempt Test', type: 'QUIZ' },
    questions: [
      attemptQuestion('tq-sc', 'sc', 'SINGLE_CHOICE', 'SC question', ['SC A', 'SC B'], options.empty ? [] : ['sc-a']),
      attemptQuestion('tq-tf', 'tf', 'TRUE_FALSE', 'TF question', ['TF A', 'TF B'], options.empty ? [] : ['tf-b']),
      attemptQuestion('tq-mc', 'mc', 'MULTIPLE_CHOICE', 'MC question', ['MC A', 'MC B', 'MC C'], options.empty ? [] : ['mc-a', 'mc-b']),
    ],
  };
}

function attemptQuestion(
  testQuestionId: string,
  prefix: string,
  type: 'SINGLE_CHOICE' | 'TRUE_FALSE' | 'MULTIPLE_CHOICE',
  content: string,
  labels: string[],
  selectedOptionIds: string[],
) {
  return {
    testQuestionId, points: 2, selectedOptionIds,
    question: {
      id: `q-${prefix}`, type, difficulty: 'MEDIUM' as const, content,
      options: labels.map((label, orderIndex) => ({ id: `${prefix}-${String.fromCharCode(97 + orderIndex)}`, content: label, orderIndex })),
    },
  };
}

function expectedAnswers(overrides: { sc: string[]; tf?: string[]; mc?: string[] }): StudentAnswerSelection[] {
  return [
    { testQuestionId: 'tq-sc', selectedOptionIds: overrides.sc },
    { testQuestionId: 'tq-tf', selectedOptionIds: overrides.tf ?? ['tf-b'] },
    { testQuestionId: 'tq-mc', selectedOptionIds: overrides.mc ?? ['mc-a', 'mc-b'] },
  ];
}

function submission(): StudentSubmission {
  return {
    attempt: { id: attemptId, attemptNumber: 1, status: 'SUBMITTED', startedAt: '2026-09-22T00:00:00Z', submittedAt: '2026-09-22T01:00:00Z' },
    test: { id: 'test-a', title: 'Attempt Test', type: 'QUIZ' }, resultAvailable: true,
  };
}

function result(): StudentAttemptResult {
  return {
    attempt: {
      id: attemptId, attemptNumber: 1, status: 'SUBMITTED', score: 7, maxScore: 10, percentage: 70,
      startedAt: '2026-09-22T00:00:00Z', submittedAt: '2026-09-22T01:00:00Z',
    },
    test: { id: 'test-a', title: 'Result Test', type: 'QUIZ' },
    questions: [{
      testQuestionId: 'tq-result', points: 10,
      question: {
        id: 'q-result', type: 'SINGLE_CHOICE', difficulty: 'HARD', content: 'Result question', explanation: 'Result explanation',
        options: [
          { id: 'result-a', content: 'Result A', orderIndex: 0, isCorrect: true, wasSelected: true },
          { id: 'result-b', content: 'Result B', orderIndex: 1, isCorrect: false, wasSelected: false },
        ],
      },
      answer: { selectedOptionIds: ['result-a'], isCorrect: true, pointsAwarded: 7 },
    }],
  };
}
