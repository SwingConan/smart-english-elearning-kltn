import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '@/features/auth/auth-context';
import type { UserRole } from '@/features/auth/api';
import { RoleRoute } from '@/features/auth/RoleRoute';
import { ApiError } from '@/lib/api-client';
import { StudentMasteryPage } from '@/pages/StudentMasteryPage';
import { learningApi } from './api';
import type {
  MasteryHistoryResponse,
  MasteryOverview,
  MasterySkill,
} from './types';

const enrollmentId = '10000000-0000-4000-8000-000000000001';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('StudentMasteryPage overview', () => {
  it('renders loading then mixed PRIOR/OBSERVED Skills from the backend', async () => {
    let resolveOverview!: (value: MasteryOverview) => void;
    vi.spyOn(learningApi, 'getMastery').mockReturnValue(new Promise((resolve) => { resolveOverview = resolve; }));
    renderMastery();
    expect(screen.getByRole('status')).toHaveTextContent('Đang tải tiến độ kỹ năng');

    resolveOverview(overview([priorSkill(), observedSkill()]));
    expect(await screen.findByText('Grammar Basic')).toBeInTheDocument();
    const prior = screen.getByText('Grammar Basic').closest('article')!;
    expect(within(prior).getByText('PRIOR')).toBeInTheDocument();
    expect(within(prior).getByText(/50,0/)).toBeInTheDocument();
    expect(within(prior).getByText(/Giá trị khởi tạo/)).toBeInTheDocument();
    expect(within(prior).getByText('Không có prerequisite.')).toBeInTheDocument();

    const observed = screen.getByText('Sentence Construction').closest('article')!;
    expect(within(observed).getByText('OBSERVED')).toBeInTheDocument();
    expect(within(observed).getByText(/73,4/)).toBeInTheDocument();
    expect(within(observed).getByText('3')).toBeInTheDocument();
    expect(within(observed).getByText(/GRAMMAR_BASIC.*Grammar Basic/)).toBeInTheDocument();
    expect(within(observed).getByText(/Đã cập nhật từ kết quả/)).toBeInTheDocument();
    expect(within(observed).queryByText(/mastered|weak|strong|passed/i)).not.toBeInTheDocument();
  });

  it('handles null lastObservedAt and a zero-Skill response', async () => {
    vi.spyOn(learningApi, 'getMastery').mockResolvedValueOnce(overview([priorSkill()]));
    const page = renderMastery();
    expect(await screen.findByText('Chưa có observation')).toBeInTheDocument();
    page.unmount();

    vi.spyOn(learningApi, 'getMastery').mockResolvedValueOnce(overview([]));
    renderMastery();
    expect(await screen.findByText(/chưa được cấu hình Skill/)).toBeInTheDocument();
  });

  it('shows a safe unavailable state without raw backend details', async () => {
    vi.spyOn(learningApi, 'getMastery').mockRejectedValueOnce(
      new ApiError(404, { message: 'foreign enrollment internal detail' }),
    );
    renderMastery();
    expect(await screen.findByRole('alert')).toHaveTextContent('Không thể tải tiến độ kỹ năng');
    expect(screen.queryByText(/foreign enrollment internal detail/i)).not.toBeInTheDocument();
  });

  it('allows Students and preserves non-Student route protection', async () => {
    const getMastery = vi.spyOn(learningApi, 'getMastery').mockResolvedValue(overview([]));
    const student = renderMastery('STUDENT');
    expect(await screen.findByRole('heading', { name: 'Tiến độ kỹ năng' })).toBeInTheDocument();
    student.unmount();

    renderMastery('INSTRUCTOR');
    expect(await screen.findByRole('heading', { name: /403/ })).toBeInTheDocument();
    expect(getMastery).toHaveBeenCalledTimes(1);
  });
});

describe('StudentMasteryPage history', () => {
  it('loads observed history in returned order and explains each BKT transition', async () => {
    vi.spyOn(learningApi, 'getMastery').mockResolvedValue(overview([observedSkill()]));
    let resolveHistory!: (value: MasteryHistoryResponse) => void;
    vi.spyOn(learningApi, 'getMasteryHistory').mockReturnValue(new Promise((resolve) => { resolveHistory = resolve; }));
    renderMastery();
    fireEvent.click(await screen.findByRole('button', { name: /Xem lịch sử OBSERVED_SKILL/ }));
    expect(screen.getByRole('status')).toHaveTextContent('Đang tải lịch sử mastery');
    resolveHistory(observedHistory());

    const panel = await screen.findByRole('region', { name: /Lịch sử mastery/ });
    expect(within(panel).getAllByText(/73,4/)).toHaveLength(2);
    expect(within(panel).getByText('OBSERVED')).toBeInTheDocument();
    expect(within(panel).getByText('Observation 1')).toBeInTheDocument();
    expect(within(panel).getByText('Observation 2')).toBeInTheDocument();
    expect(within(panel).getByText('Đúng')).toBeInTheDocument();
    expect(within(panel).getByText('Sai')).toBeInTheDocument();
    expect(within(panel).getByLabelText('BKT transition 1')).toHaveTextContent(/50,0.*80,0.*82,0/);
    expect(within(panel).getByLabelText('BKT transition 2')).toHaveTextContent(/82,0.*70,0.*73,4/);
    expect(within(panel).getAllByRole('listitem')[0]).toHaveTextContent('Đúng');
    expect(within(panel).getAllByRole('listitem')[1]).toHaveTextContent('Sai');
  });

  it('renders PRIOR current state and treats empty history as valid', async () => {
    vi.spyOn(learningApi, 'getMastery').mockResolvedValue(overview([priorSkill()]));
    vi.spyOn(learningApi, 'getMasteryHistory').mockResolvedValue(priorHistory());
    renderMastery();
    fireEvent.click(await screen.findByRole('button', { name: /Xem lịch sử GRAMMAR_BASIC/ }));
    const empty = await screen.findByText('Chưa có observation cho Skill này.');
    const panel = empty.closest('section')!;
    expect(within(panel).getByText('PRIOR')).toBeInTheDocument();
    expect(within(panel).getByText(/50,0/)).toBeInTheDocument();
  });

  it('surfaces history errors safely', async () => {
    vi.spyOn(learningApi, 'getMastery').mockResolvedValue(overview([observedSkill()]));
    vi.spyOn(learningApi, 'getMasteryHistory').mockRejectedValue(new Error('raw database history'));
    renderMastery();
    fireEvent.click(await screen.findByRole('button', { name: /Xem lịch sử OBSERVED_SKILL/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Không thể tải lịch sử mastery');
    expect(screen.queryByText(/raw database history/)).not.toBeInTheDocument();
  });

  it('does not render assessment answers, explanations or hidden result details', async () => {
    vi.spyOn(learningApi, 'getMastery').mockResolvedValue(overview([observedSkill()]));
    const payload = {
      ...observedHistory(),
      correctOptionIds: ['secret-option'],
      explanation: 'secret explanation',
      selectedOptionIds: ['hidden-selection'],
    } as MasteryHistoryResponse;
    vi.spyOn(learningApi, 'getMasteryHistory').mockResolvedValue(payload);
    renderMastery();
    fireEvent.click(await screen.findByRole('button', { name: /Xem lịch sử OBSERVED_SKILL/ }));
    await screen.findByText('Observation 1');
    expect(screen.queryByText(/secret-option|secret explanation|hidden-selection/)).not.toBeInTheDocument();
  });
});

describe('mastery API contract', () => {
  it('uses only the two read-only mastery endpoints and never requests assessment result', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse(overview([])))
      .mockResolvedValueOnce(jsonResponse(priorHistory()));

    await learningApi.getMastery(enrollmentId);
    await learningApi.getMasteryHistory(enrollmentId, 'skill-id');

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      `/api/learning/enrollments/${enrollmentId}/mastery`,
      expect.objectContaining({ credentials: 'include' }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      `/api/learning/enrollments/${enrollmentId}/mastery/skill-id/history`,
      expect.objectContaining({ credentials: 'include' }),
    );
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/result'))).toBe(false);
    expect(fetchMock.mock.calls.every(([, init]) => !init?.method || init.method === 'GET')).toBe(true);
  });
});

function renderMastery(role: UserRole = 'STUDENT') {
  const value: AuthContextValue = {
    user: { id: 'user-id', email: 'user@example.test', fullName: 'User', role, status: 'ACTIVE' },
    isLoading: false,
    error: null,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    refreshUser: vi.fn().mockResolvedValue(undefined),
  };
  return render(
    <MemoryRouter initialEntries={[`/student/enrollments/${enrollmentId}/mastery`]}>
      <AuthContext.Provider value={value}>
        <Routes>
          <Route
            path="/student/enrollments/:enrollmentId/mastery"
            element={<RoleRoute allowedRoles={['STUDENT']}><StudentMasteryPage /></RoleRoute>}
          />
        </Routes>
      </AuthContext.Provider>
    </MemoryRouter>,
  );
}

function overview(skills: MasterySkill[]): MasteryOverview {
  return { enrollmentId, courseId: 'course-id', skills };
}

function priorSkill(): MasterySkill {
  return {
    id: 'prior-skill',
    code: 'GRAMMAR_BASIC',
    name: 'Grammar Basic',
    description: 'Grammar foundation',
    masteryProbability: 0.5,
    observationCount: 0,
    lastObservedAt: null,
    state: 'PRIOR',
    prerequisites: [],
  };
}

function observedSkill(): MasterySkill {
  return {
    id: 'observed-skill',
    code: 'OBSERVED_SKILL',
    name: 'Sentence Construction',
    description: null,
    masteryProbability: 0.73421,
    observationCount: 3,
    lastObservedAt: '2026-09-22T03:00:00.000Z',
    state: 'OBSERVED',
    prerequisites: [{ id: 'prior-skill', code: 'GRAMMAR_BASIC', name: 'Grammar Basic' }],
  };
}

function priorHistory(): MasteryHistoryResponse {
  return {
    enrollmentId,
    skill: { id: 'prior-skill', code: 'GRAMMAR_BASIC', name: 'Grammar Basic', description: null },
    current: { masteryProbability: 0.5, observationCount: 0, lastObservedAt: null, state: 'PRIOR' },
    history: [],
  };
}

function observedHistory(): MasteryHistoryResponse {
  return {
    enrollmentId,
    skill: { id: 'observed-skill', code: 'OBSERVED_SKILL', name: 'Sentence Construction', description: null },
    current: { masteryProbability: 0.73421, observationCount: 2, lastObservedAt: '2026-09-22T03:00:00.000Z', state: 'OBSERVED' },
    history: [
      { id: 'first', testAttemptId: 'attempt', testAnswerId: 'answer-1', isCorrect: true, priorMastery: 0.5, evidencePosterior: 0.8, posteriorMastery: 0.82, createdAt: '2026-09-22T02:00:00.000Z' },
      { id: 'second', testAttemptId: 'attempt', testAnswerId: 'answer-2', isCorrect: false, priorMastery: 0.82, evidencePosterior: 0.7, posteriorMastery: 0.73421, createdAt: '2026-09-22T03:00:00.000Z' },
    ],
  };
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
}
