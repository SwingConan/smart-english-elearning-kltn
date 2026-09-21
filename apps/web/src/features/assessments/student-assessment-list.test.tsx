import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api-client';
import { StudentAssessmentListPage } from '@/pages/StudentAssessmentListPage';
import { studentAssessmentApi } from './api';
import { deferred, renderAssessmentRoute } from './assessment-test-utils';
import type { StudentAttemptStart, StudentTestListItem } from './types';

const enrollmentId = 'enrollment-a';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('StudentAssessmentListPage', () => {
  it('renders Placement/Quiz summaries, Start/Resume/limit UX without pre-attempt secrets', async () => {
    vi.spyOn(studentAssessmentApi, 'listTests').mockResolvedValue([
      listItem('placement', 'PLACEMENT', { questionCount: 3 }),
      listItem('quiz', 'QUIZ', { attemptsUsed: 1, hasInProgressAttempt: true, inProgressAttemptId: 'attempt-active' }),
      listItem('exhausted', 'QUIZ', { attemptsUsed: 2, maxAttempts: 2 }),
    ]);
    renderList();

    await screen.findByText('Test placement');
    expect(screen.getByText('Test quiz')).toBeInTheDocument();
    expect(screen.getByText('Test exhausted')).toBeInTheDocument();
    expect(screen.getByText(/3 câu hỏi/i)).toBeInTheDocument();
    expect(screen.getByText(/Đã dùng 1\/2 lượt/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Bắt đầu làm bài/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /Tiếp tục làm bài/i })).toBeEnabled();
    expect(screen.getByText(/sử dụng hết số lượt/i)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /làm bài/i })).toHaveLength(2);
    expect(document.body.textContent).not.toMatch(/Correct option|Secret explanation|isCorrect|pointsAwarded/i);
  });

  it('starts and resumes through the same API, navigates by returned attemptId and guards double click', async () => {
    const fresh = listItem('fresh', 'PLACEMENT');
    const active = listItem('active', 'QUIZ', { hasInProgressAttempt: true, inProgressAttemptId: 'old-attempt' });
    vi.spyOn(studentAssessmentApi, 'listTests').mockResolvedValue([fresh, active]);
    const pending = deferred<StudentAttemptStart>();
    const start = vi.spyOn(studentAssessmentApi, 'startOrResume').mockReturnValueOnce(pending.promise);
    renderList();
    await screen.findByText(fresh.title);
    const startButton = screen.getByRole('button', { name: /Bắt đầu làm bài/i });
    fireEvent.click(startButton);
    fireEvent.click(startButton);
    expect(start).toHaveBeenCalledOnce();
    expect(start).toHaveBeenCalledWith(enrollmentId, fresh.id);
    expect(screen.getByRole('button', { name: /Đang mở/i })).toBeDisabled();
    pending.resolve(attempt('returned-fresh', fresh.id));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(`/student/enrollments/${enrollmentId}/attempts/returned-fresh`));

    cleanup();
    vi.restoreAllMocks();
    vi.spyOn(studentAssessmentApi, 'listTests').mockResolvedValue([active]);
    const resume = vi.spyOn(studentAssessmentApi, 'startOrResume').mockResolvedValue(attempt('returned-resume', active.id));
    renderList();
    fireEvent.click(await screen.findByRole('button', { name: /Tiếp tục làm bài/i }));
    await waitFor(() => expect(resume).toHaveBeenCalledWith(enrollmentId, active.id));
    expect(await screen.findByTestId('location')).toHaveTextContent(`/student/enrollments/${enrollmentId}/attempts/returned-resume`);
  });

  it('shows loading, empty, safe 404/failure UX and shared 401 session expiry', async () => {
    const pending = deferred<StudentTestListItem[]>();
    vi.spyOn(studentAssessmentApi, 'listTests').mockReturnValueOnce(pending.promise);
    const loading = renderList();
    expect(screen.getByRole('status')).toBeInTheDocument();
    pending.resolve([]);
    expect(await screen.findByText(/chưa có bài kiểm tra đã xuất bản/i)).toBeInTheDocument();
    loading.unmount();

    vi.spyOn(studentAssessmentApi, 'listTests').mockRejectedValueOnce(new ApiError(404, { message: 'raw learner id' }));
    renderList();
    expect(await screen.findByRole('alert')).toHaveTextContent(/không tồn tại|không thuộc tài khoản/i);
    expect(screen.queryByText(/raw learner id/i)).not.toBeInTheDocument();
    cleanup();

    vi.restoreAllMocks();
    vi.spyOn(studentAssessmentApi, 'listTests').mockRejectedValueOnce(new ApiError(401, null));
    const refresh = vi.fn().mockResolvedValue(undefined);
    renderAssessmentRoute(
      <StudentAssessmentListPage />, `/student/enrollments/${enrollmentId}/tests`,
      '/student/enrollments/:enrollmentId/tests',
      { includeLogin: true, refreshUser: refresh },
    );
    expect(await screen.findByText('Login page')).toBeInTheDocument();
    expect(refresh).toHaveBeenCalledOnce();
    expect(screen.getByTestId('location')).toHaveTextContent(`/login?returnUrl=${encodeURIComponent(`/student/enrollments/${enrollmentId}/tests`)}`);
  });

  it('shows safe 409 action feedback without raw backend detail', async () => {
    const test = listItem('limited', 'PLACEMENT');
    vi.spyOn(studentAssessmentApi, 'listTests').mockResolvedValue([test]);
    vi.spyOn(studentAssessmentApi, 'startOrResume').mockRejectedValueOnce(new ApiError(409, { message: 'P2034 raw database' }));
    renderList();
    const card = (await screen.findByText(test.title)).closest('article')!;
    fireEvent.click(within(card).getByRole('button'));
    expect(await screen.findByRole('alert')).toHaveTextContent(/giới hạn lượt làm|trạng thái/i);
    expect(screen.queryByText(/P2034|database/i)).not.toBeInTheDocument();
  });
});

function renderList() {
  return renderAssessmentRoute(
    <StudentAssessmentListPage />, `/student/enrollments/${enrollmentId}/tests`,
    '/student/enrollments/:enrollmentId/tests',
  );
}

function listItem(
  id: string,
  type: StudentTestListItem['type'],
  overrides: Partial<StudentTestListItem> = {},
): StudentTestListItem {
  return {
    id, type, title: `Test ${id}`, description: `${type} description`, lessonId: type === 'QUIZ' ? 'lesson-a' : null,
    maxAttempts: 2, showResultAfterSubmit: true, questionCount: 2, attemptsUsed: 0,
    hasInProgressAttempt: false, inProgressAttemptId: null, latestSubmittedAttemptId: null,
    ...overrides,
  };
}

function attempt(id: string, testId: string): StudentAttemptStart {
  return { id, testId, enrollmentId, attemptNumber: 1, status: 'IN_PROGRESS', startedAt: '2026-09-22T00:00:00Z' };
}
