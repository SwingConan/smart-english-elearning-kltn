import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '@/features/auth/auth-context';
import { ToastProvider } from '@/components/ui/Feedback';
import { PracticeTestsPage } from '@/pages/PracticeTestsPage';
import { PracticeTestResultPage } from '@/pages/PracticeTestResultPage';

function renderWithStudent(ui: React.ReactNode, route = '/practice-tests') {
  const auth: AuthContextValue = {
    user: {
      id: 'student-1',
      fullName: 'Nguyễn Minh Anh',
      email: 'anh@example.test',
      role: 'STUDENT',
      status: 'ACTIVE',
    },
    isLoading: false,
    error: null,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    refreshUser: vi.fn(),
  };

  return render(
    <MemoryRouter initialEntries={[route]}>
      <AuthContext.Provider value={auth}>
        <ToastProvider>
          <Routes>
            <Route path="/practice-tests" element={ui} />
            <Route path="/practice-tests/:testId/history" element={ui} />
          </Routes>
        </ToastProvider>
      </AuthContext.Provider>
    </MemoryRouter>,
  );
}

describe('PracticeTests feature UI', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('shows Lịch sử làm Đề 1 on cards that have a submitted history', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            tests: [
              {
                id: '91000000-0000-4000-8000-000000000001',
                testNumber: 1,
                title: 'TOEIC Practice Test 1 — Full 200 câu L&R',
                description: 'Bộ đề số 1',
                timeLimitMinutes: 120,
                totalQuestions: 200,
                listeningQuestions: 100,
                readingQuestions: 100,
                latestHistory: {
                  attemptId: 'att-1',
                  submittedAt: '2026-11-17T06:00:00.000Z',
                  score: 145,
                  maxScore: 200,
                  listeningScore: 375,
                  readingScore: 345,
                  totalToeicScore: 720,
                },
                inProgressAttempt: null,
              },
              {
                id: '91000000-0000-4000-8000-000000000002',
                testNumber: 2,
                title: 'TOEIC Practice Test 2 — Full 200 câu L&R',
                description: 'Bộ đề số 2',
                timeLimitMinutes: 120,
                totalQuestions: 200,
                listeningQuestions: 100,
                readingQuestions: 100,
                latestHistory: null,
                inProgressAttempt: null,
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );

    renderWithStudent(<PracticeTestsPage />);

    expect(await screen.findByText(/TOEIC Practice Test 1/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Lịch sử làm Đề 1/i })).toHaveAttribute(
      'href',
      '/practice-tests/91000000-0000-4000-8000-000000000001/history',
    );
    expect(screen.getByText('720 / 990')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Làm Đề 2 ngay/i })).toBeInTheDocument();
  });

  it('displays cropped passage images and opens wrong-answer explanation from Part 5 onward', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            attemptId: 'att-1',
            testId: '91000000-0000-4000-8000-000000000001',
            title: 'TOEIC Practice Test 1 — Full 200 câu L&R',
            startedAt: '2026-11-17T05:00:00.000Z',
            submittedAt: '2026-11-17T06:00:00.000Z',
            summary: {
              correctCount: 1,
              totalQuestions: 2,
              listeningRaw: 1,
              listeningTotal: 1,
              listeningScore: 495,
              readingRaw: 0,
              readingTotal: 1,
              readingScore: 5,
              totalScore: 500,
              partBreakdown: [
                { part: 1, label: 'Part 1', skill: 'LISTENING', correctCount: 1, totalCount: 1 },
                { part: 7, label: 'Part 7', skill: 'READING', correctCount: 0, totalCount: 1 },
              ],
            },
            groups: [
              {
                id: 'g-1',
                groupIndex: 0,
                part: 1,
                skill: 'LISTENING',
                title: 'Part 1 · Câu 1',
                instructions: 'Listen',
                audioUrl: '/api/v2/practice-tests/media/test-1/audio/g001.mp3',
                images: [],
                questions: [
                  {
                    testQuestionId: 'tq-1',
                    questionNumber: 1,
                    part: 1,
                    skill: 'LISTENING',
                    content: 'Question 1',
                    selectedOptionId: 'o-1a',
                    correctOptionId: 'o-1a',
                    isCorrect: true,
                    isSkipped: false,
                    explanation: null,
                    options: [
                      { id: 'o-1a', label: 'A', content: '(A)', isCorrect: true, wasSelected: true },
                      { id: 'o-1b', label: 'B', content: '(B)', isCorrect: false, wasSelected: false },
                    ],
                  },
                ],
              },
              {
                id: 'g-7',
                groupIndex: 90,
                part: 7,
                skill: 'READING',
                title: 'Part 7 · Câu 149–150',
                instructions: 'Questions 149-150 refer to the following text message chain.',
                audioUrl: null,
                images: [
                  {
                    id: 'img-7',
                    url: '/api/v2/practice-tests/media/test-1/images/p7.webp',
                    altText: 'Part 7 passage',
                  },
                ],
                questions: [
                  {
                    testQuestionId: 'tq-149',
                    questionNumber: 149,
                    part: 7,
                    skill: 'READING',
                    content: 'What does Ms. Kalama mean?',
                    selectedOptionId: 'o-149a',
                    correctOptionId: 'o-149b',
                    isCorrect: false,
                    isSkipped: false,
                    explanation:
                      'Đáp án đúng là (B) vì cô ấy sẵn sàng hỗ trợ đồng nghiệp tìm tài liệu.',
                    options: [
                      {
                        id: 'o-149a',
                        label: 'A',
                        content: 'Happy',
                        isCorrect: false,
                        wasSelected: true,
                      },
                      {
                        id: 'o-149b',
                        label: 'B',
                        content: 'Willing to assist',
                        isCorrect: true,
                        wasSelected: false,
                      },
                    ],
                  },
                ],
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );

    renderWithStudent(
      <PracticeTestResultPage byTestHistory />,
      '/practice-tests/91000000-0000-4000-8000-000000000001/history',
    );

    expect(await screen.findByText(/Lịch sử làm bài gần nhất/i)).toBeInTheDocument();
    // Default filter is WRONG_OR_SKIPPED -> shows Q149 + passage image + Vietnamese explanation!
    expect(screen.getByAltText('Part 7 passage')).toBeInTheDocument();
    expect(
      screen.getByText(/Giải thích tại sao sai & hướng dẫn đáp án đúng/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/sẵn sàng hỗ trợ đồng nghiệp/i)).toBeInTheDocument();

    // Switching to ALL shows Q1 too
    fireEvent.click(screen.getByRole('button', { name: /Tất cả câu/i }));
    await waitFor(() => expect(screen.getByText('Question 1')).toBeInTheDocument());
  });
});
