import '@testing-library/jest-dom/vitest';
import { StrictMode } from 'react';
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
  durationMinutes: 25,
  startedAt: '2026-10-01T00:00:00Z',
  submittedAt: '2026-10-01T00:20:00Z',
  score: 4,
  maxScore: 8,
  skillScores: [
    { skill: 'LISTENING', rawScore: 1, maxRawScore: 4, normalizedScore: 25, estimatedToeicScore: null, status: 'FINAL', source: 'OBJECTIVE_AUTO' },
    { skill: 'READING', rawScore: 3, maxRawScore: 4, normalizedScore: 75.25, estimatedToeicScore: null, status: 'FINAL', source: 'OBJECTIVE_AUTO' },
  ],
  disclaimer: 'Kết quả này là đánh giá nội bộ phục vụ xếp lớp, không phải điểm TOEIC chính thức.',
  enhancement: { status: 'READY', error: null },
  evaluation: {
    status: 'FINAL', levelCode: 'FOUNDATION', levelLabel: 'Nền tảng',
    overallNormalizedScore: 50, strongestSkill: 'READING', weakestSkill: 'LISTENING',
    balanceState: 'IMBALANCED', summary: 'Reading đang nổi trội; nên ưu tiên củng cố Listening.',
    lrTotalScore: null, aiExplanation: null, evaluationPolicyId: 'policy-1',
  },
  recommendations: [{
    kind: 'PRIMARY',
    course: { id: 'course-1', slug: 'toeic-foundation', title: 'TOEIC Foundation', description: 'Xây dựng nền tảng Listening và Reading.', level: 'FOUNDATION', skillScope: 'LR', thumbnailUrl: null },
    reasonStatus: 'AVAILABLE',
    reason: { schemaVersion: 1, evaluationPolicyCode: 'policy', evaluationLevel: 'FOUNDATION', profile: { ruleMode: 'ALL', priority: 100 }, criteria: [{ skill: 'LISTENING', value: 25, min: 0, max: 65, matched: true }] },
    classOfferings: [],
  }],
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  sessionStorage.clear();
  localStorage.clear();
});

function expectNoDeveloperJargon() {
  expect(document.body).not.toHaveTextContent(/milestone|\bM03\b|\bM04\b|\bM05\b/i);
}

function abortFirstThenResolve<T>(value: T) {
  let callCount = 0;
  return (signal?: AbortSignal): Promise<T> => {
    callCount += 1;
    if (callCount > 1) return Promise.resolve(value);
    return new Promise((_resolve, reject) => {
      signal?.addEventListener(
        'abort',
        () => reject(new DOMException('The request was aborted.', 'AbortError')),
        { once: true },
      );
    });
  };
}

describe('Placement wizard', () => {
  it('describes placement history scores as correct answers', async () => {
    vi.spyOn(authApi, 'me').mockResolvedValue({
      id: 'student-1',
      email: 'student@example.com',
      fullName: 'Người học',
      role: 'STUDENT',
      status: 'ACTIVE',
    });
    vi.spyOn(placementApi, 'config').mockResolvedValue(config);
    vi.spyOn(placementApi, 'history').mockResolvedValue([
      {
        attemptId: result.attemptId,
        title: result.title,
        mode: result.mode,
        goalScore: result.goalScore,
        startedAt: result.startedAt,
        submittedAt: result.submittedAt,
        score: result.score,
        maxScore: result.maxScore,
        skillScores: result.skillScores,
        resultPath: `/placement/attempts/${result.attemptId}/result`,
      },
    ]);

    render(<MemoryRouter><AuthProvider><PlacementPage /></AuthProvider></MemoryRouter>);

    expect(await screen.findByText('4/8 câu đúng', { exact: false })).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent('điểm thô');
  });

  it('ignores the first aborted config request under StrictMode when the next request succeeds', async () => {
    vi.spyOn(authApi, 'me').mockRejectedValue(new ApiError(401, null));
    vi.spyOn(placementApi, 'config').mockImplementation(abortFirstThenResolve(config));

    render(
      <StrictMode>
        <MemoryRouter><AuthProvider><PlacementPage /></AuthProvider></MemoryRouter>
      </StrictMode>,
    );

    expect(await screen.findByRole('heading', { name: 'Mục tiêu của bạn' })).toBeInTheDocument();
    expect(screen.queryByText('Chưa thể tải cấu hình kiểm tra đầu vào. Vui lòng thử lại.')).not.toBeInTheDocument();
  });

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
    expect(screen.getByText('Kiểm tra đầu vào 4 kỹ năng')).toBeInTheDocument();
    expect(
      screen.getByText('Speaking và Writing sẽ được mở khi quy trình đánh giá 4 kỹ năng được hoàn thiện.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Sắp có')).toBeInTheDocument();
    expectNoDeveloperJargon();
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
  it('ignores an aborted exam request under StrictMode and renders the successful payload', async () => {
    const request = abortFirstThenResolve(exam);
    vi.spyOn(placementApi, 'exam').mockImplementation((_attemptId, signal) => request(signal));

    render(
      <StrictMode>
        <MemoryRouter initialEntries={['/placement/attempts/attempt-1/exam']}>
          <Routes><Route path="/placement/attempts/:attemptId/exam" element={<PlacementExamPage />} /></Routes>
        </MemoryRouter>
      </StrictMode>,
    );

    expect(await screen.findByRole('heading', { name: 'Thông báo' })).toBeInTheDocument();
    expect(screen.queryByText('Không thể tải bài kiểm tra hoặc bạn không có quyền truy cập.')).not.toBeInTheDocument();
  });

  it('ignores an aborted result request under StrictMode and renders the successful result', async () => {
    const request = abortFirstThenResolve(result);
    vi.spyOn(placementApi, 'result').mockImplementation((_attemptId, signal) => request(signal));

    render(
      <StrictMode>
        <MemoryRouter initialEntries={['/placement/attempts/attempt-1/result']}>
          <Routes><Route path="/placement/attempts/:attemptId/result" element={<PlacementResultPage />} /></Routes>
        </MemoryRouter>
      </StrictMode>,
    );

    expect(await screen.findByRole('heading', { name: 'Kết quả kiểm tra đầu vào L&R' })).toBeInTheDocument();
    expect(screen.queryByText('Không thể tải kết quả hoặc bài kiểm tra chưa được nộp.')).not.toBeInTheDocument();
  });

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
    expectNoDeveloperJargon();
    fireEvent.click(screen.getByLabelText('Reception'));
    await waitFor(() => expect(save).toHaveBeenCalledWith('attempt-1', 'tq-1', ['o-1']));
    expect(await screen.findByText('Đã lưu')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Đánh dấu xem lại' })[1]);
    fireEvent.click(screen.getByRole('button', { name: 'Nộp bài' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/1 câu chưa trả lời và 1 câu đánh dấu/)).toBeInTheDocument();
  });

  it('renders the objective result, internal evaluation and deterministic recommendation', async () => {
    vi.spyOn(placementApi, 'result').mockResolvedValue(result);
    render(
      <MemoryRouter initialEntries={['/placement/attempts/attempt-1/result']}>
        <Routes><Route path="/placement/attempts/:attemptId/result" element={<PlacementResultPage />} /></Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByRole('heading', { name: 'Kết quả kiểm tra đầu vào L&R' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '1/4 câu đúng' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '3/4 câu đúng' })).toBeInTheDocument();
    expect(screen.getByText('Tỷ lệ đúng: 25%')).toBeInTheDocument();
    expect(screen.getByText('Tỷ lệ đúng: 75,3%')).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent('điểm thô');
    expect(document.body).not.toHaveTextContent('Điểm chuẩn hóa nội bộ');
    expect(screen.getByText(/không phải điểm TOEIC chính thức/)).toBeInTheDocument();
    expect(screen.getByText('Nền tảng')).toBeInTheDocument();
    expect(screen.getByText('Kỹ năng nổi trội')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'TOEIC Foundation' })).toBeInTheDocument();
    expect(screen.getByText('Khóa học phù hợp chính')).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent('Khóa học phù hợp nhất');
    expect(screen.getByText('Nền tảng · Listening & Reading')).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent('FOUNDATION · LR');
    expect(screen.getByText('Vì sao khóa học này phù hợp?')).toBeInTheDocument();
    expect(screen.getByText(/Listening 25%.*0–65%/)).toBeInTheDocument();
    expectNoDeveloperJargon();
  });

  it('keeps the objective result visible when enrichment fails and offers retry', async () => {
    vi.spyOn(placementApi, 'result').mockResolvedValue({
      ...result,
      enhancement: { status: 'ERROR', error: { code: 'EVALUATION_POLICY_NOT_CONFIGURED', message: 'unavailable' } },
      evaluation: null,
      recommendations: [],
    });
    render(
      <MemoryRouter initialEntries={['/placement/attempts/attempt-1/result']}>
        <Routes><Route path="/placement/attempts/:attemptId/result" element={<PlacementResultPage />} /></Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByRole('heading', { name: '1/4 câu đúng' })).toBeInTheDocument();
    expect(screen.getByText(/phần đánh giá và gợi ý khóa học tạm thời chưa khả dụng/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Thử tải lại gợi ý/ })).toBeInTheDocument();
  });

  it('configures English speech playback at a natural rate', async () => {
    class FakeUtterance {
      lang = '';
      rate = 1;
      onerror: (() => void) | null = null;
      constructor(readonly text: string) {}
    }
    const speak = vi.fn();
    vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
    vi.stubGlobal('speechSynthesis', { cancel: vi.fn(), speak });
    vi.spyOn(placementApi, 'exam').mockResolvedValue(exam);
    render(
      <MemoryRouter initialEntries={['/placement/attempts/attempt-1/exam']}>
        <Routes><Route path="/placement/attempts/:attemptId/exam" element={<PlacementExamPage />} /></Routes>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Phát audio' }));

    const utterance = speak.mock.calls[0][0] as FakeUtterance;
    expect(utterance.text).toBe('Private listening transcript');
    expect(utterance.lang).toBe('en-US');
    expect(utterance.rate).toBe(0.95);
  });

  it('shows a truthful message when browser speech playback is unavailable', async () => {
    vi.stubGlobal('SpeechSynthesisUtterance', undefined);
    vi.stubGlobal('speechSynthesis', undefined);
    vi.spyOn(placementApi, 'exam').mockResolvedValue(exam);
    render(
      <MemoryRouter initialEntries={['/placement/attempts/attempt-1/exam']}>
        <Routes><Route path="/placement/attempts/:attemptId/exam" element={<PlacementExamPage />} /></Routes>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Phát audio' }));

    expect(screen.getByRole('alert')).toHaveTextContent('không hỗ trợ phát audio');
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
