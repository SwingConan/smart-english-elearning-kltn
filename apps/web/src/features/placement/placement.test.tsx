import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '@/features/auth/AuthContext';
import { authApi } from '@/features/auth/api';
import { ApiError } from '@/lib/api-client';
import { PlacementExamPage } from '@/pages/PlacementExamPage';
import { PlacementPage } from '@/pages/PlacementPage';
import { PlacementResultPage } from '@/pages/PlacementResultPage';
import { placementApi } from './api';
import { PLACEMENT_DRAFT_KEY, readPlacementDraft } from './draft';
import { startPlacementInNewTab } from './handoff';
import { placementTimerWarning } from './timer';
import type { PlacementConfig, PlacementExamResponse, PlacementResult } from './types';

const config: PlacementConfig = {
  modes: [
    { code: 'LR', label: 'Listening & Reading', enabled: true },
    { code: 'FOUR_SKILLS', label: '4 kỹ năng', enabled: false, note: 'Sắp có' },
  ],
  goalPresets: [450, 550, 650, 750],
  customGoalRange: { min: 10, max: 990 },
  selfLevels: [
    { code: 'UNKNOWN', label: 'Tôi chưa biết trình độ', durationMinutes: 25 },
    { code: 'BEGINNER', label: 'Mới bắt đầu', durationMinutes: 20 },
    { code: 'BASIC', label: 'Cơ bản', durationMinutes: 20 },
    { code: 'INTERMEDIATE', label: 'Trung bình', durationMinutes: 25 },
    { code: 'GOOD', label: 'Khá', durationMinutes: 30 },
  ],
  instructions: [],
  disclaimer: 'Kết quả nội bộ, không phải điểm TOEIC chính thức.',
};

const exam: PlacementExamResponse = {
  state: 'IN_PROGRESS',
  attempt: {
    id: 'attempt-1',
    startedAt: '2026-10-01T00:00:00Z',
    expiresAt: '2099-10-01T00:25:00Z',
    goalScore: 550,
    selfLevel: 'UNKNOWN',
  },
  test: { title: 'Placement L&R', description: null, mode: 'LR', durationMinutes: 25 },
  groups: [
    {
      id: 'listening-group',
      skill: 'LISTENING',
      orderIndex: 0,
      title: 'Thông báo',
      instructions: 'Nghe và trả lời.',
      stimulusText: null,
      audioUrl: 'tts:Private listening transcript',
      questions: [
        {
          testQuestionId: 'tq-1',
          orderIndex: 0,
          content: 'Where should visitors go?',
          responseType: 'SINGLE_CHOICE',
          toeicSkill: 'LISTENING',
          options: [
            { id: 'o-1', content: 'Reception', orderIndex: 0 },
            { id: 'o-2', content: 'Cafeteria', orderIndex: 1 },
          ],
          selectedOptionIds: [],
        },
      ],
    },
    {
      id: 'reading-group',
      skill: 'READING',
      orderIndex: 1,
      title: 'Email',
      instructions: 'Đọc và trả lời.',
      stimulusText: 'The meeting is in Conference Room B.',
      audioUrl: null,
      questions: [
        {
          testQuestionId: 'tq-2',
          orderIndex: 1,
          content: 'Where is the meeting?',
          responseType: 'SINGLE_CHOICE',
          toeicSkill: 'READING',
          options: [{ id: 'o-3', content: 'Conference Room B', orderIndex: 0 }],
          selectedOptionIds: [],
        },
      ],
    },
  ],
};

const result: PlacementResult = {
  attemptId: 'attempt-1',
  status: 'SUBMITTED',
  title: 'Placement L&R',
  mode: 'LR',
  goalScore: 550,
  selfLevel: 'UNKNOWN',
  startedAt: '2026-10-01T00:00:00Z',
  submittedAt: '2026-10-01T00:20:00Z',
  score: 6,
  maxScore: 8,
  skillScores: [
    { skill: 'LISTENING', rawScore: 3, maxRawScore: 4, normalizedScore: 75, estimatedToeicScore: null, status: 'FINAL', source: 'OBJECTIVE_AUTO' },
    { skill: 'READING', rawScore: 3, maxRawScore: 4, normalizedScore: 75, estimatedToeicScore: null, status: 'FINAL', source: 'OBJECTIVE_AUTO' },
  ],
  disclaimer: 'Kết quả này là đánh giá nội bộ phục vụ xếp lớp, không phải điểm TOEIC chính thức.',
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  sessionStorage.clear();
  localStorage.clear();
});

describe('Placement wizard', () => {
  it('renders three locked steps, validates custom goal and keeps FOUR_SKILLS disabled', async () => {
    vi.spyOn(authApi, 'me').mockRejectedValue(new ApiError(401, null));
    vi.spyOn(placementApi, 'config').mockResolvedValue(config);
    render(<MemoryRouter><AuthProvider><PlacementPage /></AuthProvider></MemoryRouter>);

    expect(await screen.findByRole('heading', { name: 'Mục tiêu của bạn' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Mục tiêu khác'), { target: { value: '1000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Áp dụng' }));
    expect(await screen.findByRole('status')).toHaveTextContent('từ 10 đến 990');
    fireEvent.click(screen.getByRole('button', { name: /^550/ }));
    fireEvent.click(screen.getByRole('button', { name: /Tiếp tục/ }));
    expect(screen.getByRole('heading', { name: 'Trình độ hiện tại' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Tôi chưa biết trình độ/ }));
    fireEvent.click(screen.getByRole('button', { name: /Tiếp tục/ }));
    expect(screen.getByRole('heading', { name: 'Xác nhận và hướng dẫn' })).toBeInTheDocument();
    expect(screen.getByText('Placement 4 kỹ năng')).toBeInTheDocument();
    expect(screen.getByText('Sắp có')).toBeInTheDocument();
    const start = screen.getByRole('button', { name: 'Đăng nhập để bắt đầu' });
    expect(start).toBeDisabled();
    fireEvent.click(screen.getByLabelText('Tôi đã đọc hướng dẫn và sẵn sàng bắt đầu.'));
    expect(start).toBeEnabled();
  });

  it('sanitizes a tampered session draft while restoring valid state', () => {
    sessionStorage.setItem(
      PLACEMENT_DRAFT_KEY,
      JSON.stringify({ version: 1, mode: 'LR', goalScore: 1000, selfLevel: 'HACKED', step: 3 }),
    );
    expect(readPlacementDraft(sessionStorage)).toEqual({
      version: 1,
      mode: 'LR',
      goalScore: null,
      selfLevel: null,
      step: 3,
    });
  });
});

describe('Placement exam and result', () => {
  it('renders grouped Listening/Reading without a Listening transcript and autosaves answers', async () => {
    vi.spyOn(placementApi, 'exam').mockResolvedValue(exam);
    const save = vi.spyOn(placementApi, 'saveAnswer').mockResolvedValue({
      state: 'SAVED',
      savedAt: '2026-10-01T00:01:00Z',
    });
    render(
      <MemoryRouter initialEntries={['/placement/attempts/attempt-1/exam']}>
        <Routes><Route path="/placement/attempts/:attemptId/exam" element={<PlacementExamPage />} /></Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByRole('heading', { name: 'Thông báo' })).toBeInTheDocument();
    expect(screen.getByText('The meeting is in Conference Room B.')).toBeInTheDocument();
    expect(screen.queryByText('Private listening transcript')).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Reception'));
    await waitFor(() => expect(save).toHaveBeenCalledWith('attempt-1', 'tq-1', ['o-1']));
    expect(await screen.findByText('Đã lưu')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Đánh dấu xem lại' })[1]);
    fireEvent.click(screen.getByRole('button', { name: 'Nộp bài' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/1 câu chưa trả lời và 1 câu đánh dấu/)).toBeInTheDocument();
  });

  it('renders only the M03 objective result boundary', async () => {
    vi.spyOn(placementApi, 'result').mockResolvedValue(result);
    render(
      <MemoryRouter initialEntries={['/placement/attempts/attempt-1/result']}>
        <Routes><Route path="/placement/attempts/:attemptId/result" element={<PlacementResultPage />} /></Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByRole('heading', { name: 'Kết quả Placement L&R' })).toBeInTheDocument();
    expect(screen.getByText(/không phải điểm TOEIC chính thức/)).toBeInTheDocument();
    expect(screen.queryByText(/mạnh nhất|yếu nhất|khuyến nghị|đề xuất khóa học/i)).not.toBeInTheDocument();
  });
});

describe('Placement helpers', () => {
  it('opens a blank tab synchronously before awaiting start', async () => {
    let resolved = false;
    vi.spyOn(placementApi, 'start').mockImplementation(async () => {
      expect(resolved).toBe(false);
      resolved = true;
      return {
        attemptId: 'attempt-1', resumed: false,
        test: { title: 'Placement', mode: 'LR', durationMinutes: 25 },
        goalScore: 550, selfLevel: 'UNKNOWN',
        startedAt: '2026-10-01T00:00:00Z', expiresAt: '2026-10-01T00:25:00Z',
      };
    });
    const assign = vi.fn();
    const fakeWindow = { document: { title: '' }, location: { assign }, close: vi.fn() } as unknown as Window;
    await startPlacementInNewTab({ mode: 'LR', selfLevel: 'UNKNOWN', goalScore: 550 }, () => fakeWindow);
    expect(resolved).toBe(true);
    expect(assign).toHaveBeenCalledWith('/placement/attempts/attempt-1/exam');
  });

  it('emits each 5-minute and 1-minute warning only when eligible', () => {
    expect(placementTimerWarning(300, false, false)).toBe('FIVE_MINUTES');
    expect(placementTimerWarning(299, true, false)).toBeNull();
    expect(placementTimerWarning(60, true, false)).toBe('ONE_MINUTE');
    expect(placementTimerWarning(30, true, true)).toBeNull();
  });
});
