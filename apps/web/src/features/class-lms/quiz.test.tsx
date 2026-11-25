import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  QuizExamPage,
  QuizGradebook,
  QuizCheckerPage,
  QuizLaunchPage,
} from '@/pages/ClassQuizPage';
import { ActivityChooser } from '@/pages/ClassLearningPage';
import { AuthorityPage } from '@/pages/AuthorityPage';
import { remainingSeconds, quizQuestionState, type QuizAttempt } from './quiz-api';
const mock = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock('@/features/auth/auth-context', () => ({
  useAuth: () => ({ user: { id: 'synthetic-admin', role: 'SYSTEM_ADMIN' } }),
}));
vi.mock('@/lib/api-client', () => ({
  apiFetch: (...args: unknown[]) => mock.fetch(...args),
  apiUrl: (p: string) => '/api' + p,
}));
const initial = (): QuizAttempt => ({
  id: 'attempt',
  activityId: 'activity',
  source: {
    id: 'source',
    title: 'Synthetic Quiz',
    version: 1,
    state: 'APPROVED',
    lockVersion: 1,
    approvedAt: '2026-10-31T00:00:00Z',
    openAt: '2026-10-31T00:00:00Z',
    closeAt: '2026-10-31T02:00:00Z',
    durationMinutes: 5,
    questions: [
      {
        id: 'q1',
        content: 'First prompt',
        points: 3,
        options: [
          { id: 'o1', content: 'First option' },
          { id: 'o2', content: 'Other option' },
        ],
      },
      {
        id: 'q2',
        content: 'Second prompt',
        points: 7,
        options: [
          { id: 'o3', content: 'Second option' },
          { id: 'o4', content: 'Another option' },
        ],
      },
    ],
  },
  state: 'IN_PROGRESS',
  lockVersion: 0,
  startedAt: '2026-10-31T01:00:00Z',
  deadline: '2026-10-31T01:05:00Z',
  serverNow: '2026-10-31T01:00:00Z',
  marked: [],
  answers: [],
  receipt: null,
  submittedAt: null,
  gradeState: null,
  result: null,
});
function exam() {
  render(
    <MemoryRouter initialEntries={['/classroom/c/quiz-attempts/attempt']}>
      <Routes>
        <Route path="/classroom/:classId/quiz-attempts/:attemptId" element={<QuizExamPage />} />
      </Routes>
    </MemoryRouter>,
  );
}
beforeEach(() => {
  mock.fetch.mockReset();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
describe('W03B-C exam and release contracts', () => {
  it('authority UI constrains both Quiz delegations to CLASS without issuing a grant', async () => {
    mock.fetch.mockImplementation(async (p: string) =>
      p === '/workspace'
        ? { capabilities: { authorityApprove: false } }
        : p === '/authority'
          ? { grants: [], roles: [], audit: [] }
          : { data: [] },
    );
    render(
      <MemoryRouter>
        <AuthorityPage />
      </MemoryRouter>,
    );
    const capability = screen.getByLabelText('Quyền bổ sung');
    for (const cap of ['academic.quiz.approve', 'academic.quiz.grade.publish']) {
      fireEvent.change(capability, { target: { value: 'authority.approve' } });
      expect(screen.getByLabelText('Phạm vi quyền')).toHaveValue('GLOBAL');
      fireEvent.change(capability, { target: { value: cap } });
      expect(screen.getByLabelText('Phạm vi quyền')).toHaveValue('CLASS');
      expect(screen.getByLabelText('Mã định danh lớp')).toBeRequired();
      expect(
        screen.queryByRole('option', { name: 'Toàn bộ phạm vi của quyền này' }),
      ).not.toBeInTheDocument();
    }
    await waitFor(() => expect(mock.fetch).toHaveBeenCalledTimes(3));
    expect(mock.fetch.mock.calls.every((c) => c.length === 1)).toBe(true);
  });
  it('calculates display only from server UTC and monotonic elapsed, independent of browser Date.now', () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2099-01-01T00:00:00Z'));
    expect(remainingSeconds(initial().deadline, initial().serverNow, 120000)).toBe(180);
    expect(remainingSeconds(initial().deadline, initial().serverNow, 999999)).toBe(0);
  });
  it('keeps marking separate from answered and missing state', () => {
    expect(quizQuestionState('q1', [], ['q1'])).toEqual({ marked: true, answered: false });
    expect(quizQuestionState('q1', [{ questionId: 'q1', optionId: 'o1' }], [])).toEqual({
      marked: false,
      answered: true,
    });
  });
  it('routes the real Quiz Chooser to the class-local authoring editor', async () => {
    render(
      <MemoryRouter>
        <Routes>
          <Route
            path="/"
            element={<ActivityChooser classId="c" sectionId="s" close={() => {}} />}
          />
          <Route
            path="/classroom/:classId/sections/:sectionId/quizzes/new"
            element={<p>Real Quiz author route</p>}
          />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Quiz trắc nghiệm/ }));
    expect(await screen.findByText('Real Quiz author route')).toBeInTheDocument();
  });
  it('preserves selection across navigation, marks an unanswered question and saves CAS state', async () => {
    let saved = initial();
    mock.fetch.mockImplementation(async (_p: string, o?: { body: string }) => {
      if (o) {
        const b = JSON.parse(o.body);
        saved = { ...saved, lockVersion: 1, answers: b.answers, marked: b.marked };
      }
      return saved;
    });
    exam();
    await screen.findByText('First prompt');
    fireEvent.click(screen.getByRole('radio', { name: /First option/ }));
    await waitFor(() => expect(screen.getByTestId('quiz-save-state')).toHaveTextContent('Đã lưu'));
    await waitFor(() => expect(mock.fetch).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole('button', { name: 'Câu tiếp' }));
    expect(screen.getByText('Second prompt')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Đánh dấu câu' }));
    await waitFor(() => expect(mock.fetch).toHaveBeenCalledTimes(3));
    const body = JSON.parse(mock.fetch.mock.calls[2][1].body);
    expect(body.marked).toEqual(['q2']);
    expect(body.answers[0]).toEqual({ questionId: 'q1', optionId: 'o1' });
    expect(body.expectedLockVersion).toBe(1);
    fireEvent.click(screen.getByRole('button', { name: 'Câu trước' }));
    expect(screen.getByRole('radio', { name: /First option/ })).toBeChecked();
  });
  it('lost autosave ACK keeps answer and retries identical UUID/body without enabling submit', async () => {
    let count = 0;
    mock.fetch.mockImplementation(async (_p: string, o?: { body: string }) => {
      if (!o) return initial();
      count++;
      if (count === 1) throw Error('response lost');
      const b = JSON.parse(o.body);
      return { ...initial(), lockVersion: 1, answers: b.answers, marked: b.marked };
    });
    exam();
    await screen.findByText('First prompt');
    fireEvent.click(screen.getByRole('radio', { name: /First option/ }));
    await screen.findByRole('alert');
    expect(screen.getByRole('radio', { name: /First option/ })).toBeChecked();
    expect(screen.getByRole('button', { name: 'Nộp Quiz' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Thử lưu lại' }));
    await waitFor(() => expect(screen.getByTestId('quiz-save-state')).toHaveTextContent('Đã lưu'));
    expect(mock.fetch.mock.calls[1][1].body).toBe(mock.fetch.mock.calls[2][1].body);
  });
  it('explicit missing-question confirmation submits no unsaved answer payload and pending never displays zero', async () => {
    mock.fetch.mockImplementation(async (p: string) =>
      p.endsWith('/submit')
        ? {
            ...initial(),
            state: 'SUBMITTED',
            lockVersion: 1,
            receipt: 'durable-receipt',
            submittedAt: '2026-10-31T01:01:00Z',
            gradeState: 'PENDING_RELEASE',
          }
        : initial(),
    );
    exam();
    await screen.findByText('First prompt');
    fireEvent.click(screen.getByRole('button', { name: 'Nộp Quiz' }));
    expect(
      within(screen.getByRole('alertdialog')).getByText(/Còn 2 câu chưa trả lời/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận nộp các đáp án đã lưu' }));
    await screen.findByText('durable-receipt');
    expect(screen.getByRole('timer')).toHaveTextContent('Đã kết thúc');
    const b = JSON.parse(mock.fetch.mock.calls[1][1].body);
    expect(Object.keys(b).sort()).toEqual(['expectedLockVersion', 'idempotencyKey']);
    expect(
      screen.getByText('Chờ học vụ công bố điểm. Chưa công bố không phải 0.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('0/10')).not.toBeInTheDocument();
  });
  it('gradebook separates unpublished null from independently published real zero', async () => {
    mock.fetch.mockResolvedValue({
      entries: [
        {
          id: 'a',
          title: 'Pending Quiz',
          version: 1,
          state: 'PENDING_RELEASE',
          submittedAt: null,
          result: null,
        },
        {
          id: 'b',
          title: 'Published zero',
          version: 2,
          state: 'PUBLISHED',
          submittedAt: '2026-10-31T01:00:00Z',
          result: { earned: 0, max: 10, percentage: 0, publishedAt: '2026-10-31T01:01:00Z' },
        },
      ],
    });
    render(
      <MemoryRouter>
        <QuizGradebook classId="c" />
      </MemoryRouter>,
    );
    await screen.findByText('Pending Quiz · Phiên bản 1');
    expect(screen.getAllByText(/0\/10 · 0%/)).toHaveLength(1);
    expect(screen.getByText('Chờ học vụ công bố; chưa có điểm hiển thị')).toBeInTheDocument();
  });
  it('checker source and grade actions are independently gated by their server projections', async () => {
    mock.fetch.mockResolvedValue({
      sources: [{ ...initial().source, classId: 'c', activityId: 'a', canApprove: false }],
      attempts: [
        {
          id: 'x',
          classId: 'c',
          title: 'Quiz',
          learnerName: 'Synthetic learner',
          version: 1,
          lockVersion: 1,
          earned: 0,
          max: 10,
          submittedAt: '2026-10-31T01:00:00Z',
          canPublish: true,
        },
      ],
    });
    render(
      <MemoryRouter>
        <QuizCheckerPage />
      </MemoryRouter>,
    );
    await screen.findByText('Synthetic Quiz');
    expect(screen.getByRole('button', { name: 'Duyệt và đóng băng nguồn Quiz' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Duyệt và công bố điểm Quiz' })).toBeEnabled();
  });
  it('launch requires explicit start and displays center timezone rather than host timezone', async () => {
    mock.fetch.mockResolvedValue({
      source: { ...initial().source, questions: [], questionCount: 2 },
      attempt: null,
    });
    render(
      <MemoryRouter initialEntries={['/classroom/c/activities/a/quiz']}>
        <Routes>
          <Route
            path="/classroom/:classId/activities/:activityId/quiz"
            element={<QuizLaunchPage />}
          />
        </Routes>
      </MemoryRouter>,
    );
    await screen.findByText('Synthetic Quiz');
    expect(screen.getByRole('button', { name: 'Bắt đầu Quiz' })).toBeEnabled();
    expect(mock.fetch).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/07:00:00/)).toBeInTheDocument();
    expect(screen.getByText(/2 câu/)).toBeInTheDocument();
  });
});
