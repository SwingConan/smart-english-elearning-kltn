import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import { LocalQuizPanel } from './LocalQuizPanel';
import { LocalAttendancePanel } from './LocalAttendancePanel';
import type { LocalAttendanceWorkspace, LocalQuizWorkspace } from './lms-local-api';

const mock = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock('@/lib/api-client', () => ({
  apiFetch: (...a: unknown[]) => mock.fetch(...a),
  apiUrl: (p: string) => '/api' + p,
}));

const classId = '11111111-1111-4111-8111-111111111111';
const activityId = '22222222-2222-4222-8222-222222222222';

function makeStudentQuizWorkspace(
  overrides: Partial<LocalQuizWorkspace> = {},
): LocalQuizWorkspace {
  return {
    editable: false,
    serverNow: '2026-11-13T12:00:00.000Z',
    activity: {
      id: activityId,
      sectionId: 'sec-1',
      sectionTitle: 'Lý thuyết',
      sectionPublished: true,
      title: 'Quiz giữa kỳ',
      introduction: 'Làm trắc nghiệm và tự luận',
      state: 'PUBLISHED',
      availableFrom: '2026-11-13T11:00:00.000Z',
      availableUntil: '2026-11-13T14:00:00.000Z',
      revisionNumber: 1,
    },
    config: {
      durationMinutes: 20,
      maxAttempts: 2,
      shuffleQuestions: false,
      autoReleaseObjective: true,
      passScore: 5,
    },
    summary: {
      questionCount: 2,
      mcqCount: 1,
      essayCount: 1,
      totalPoints: 10,
      objectivePoints: 4,
      essayPoints: 6,
    },
    questions: [],
    windowStatus: 'OPEN',
    canStartNew: true,
    activeAttempt: null,
    myAttempts: [],
    ...overrides,
  };
}

describe('LocalQuizPanel & LocalAttendancePanel', () => {
  beforeEach(() => {
    mock.fetch.mockReset();
  });
  afterEach(() => {
    cleanup();
  });

  it('auto-grades MCQ on submit while keeping Essay in PENDING_MANUAL_GRADE', async () => {
    const started = makeStudentQuizWorkspace({
      canStartNew: false,
      questions: [
        {
          id: 'q-mcq',
          type: 'MCQ',
          prompt: 'Which word is a noun?',
          points: 4,
          options: [
            { id: 'opt-a', text: 'Department' },
            { id: 'opt-b', text: 'Quickly' },
          ],
        },
        {
          id: 'q-essay',
          type: 'ESSAY',
          prompt: 'Write one polite request sentence.',
          points: 6,
          options: [],
        },
      ],
      activeAttempt: {
        id: 'att-1',
        attemptNumber: 1,
        status: 'IN_PROGRESS',
        startedAt: '2026-11-13T12:00:00.000Z',
        deadlineAt: '2026-11-13T12:20:00.000Z',
        submittedAt: null,
        autoScore: 0,
        manualScore: 0,
        totalScore: 0,
        maxScore: 10,
        objectiveMax: 4,
        essayMax: 6,
        hasEssay: true,
        gradingStatus: 'PENDING_MANUAL_GRADE',
        answers: [],
        manualGrades: {},
        teacherFeedback: '',
        gradedAt: null,
      },
    });

    const submitted = makeStudentQuizWorkspace({
      canStartNew: false,
      myAttempts: [
        {
          id: 'att-1',
          attemptNumber: 1,
          status: 'SUBMITTED',
          startedAt: '2026-11-13T12:00:00.000Z',
          deadlineAt: '2026-11-13T12:20:00.000Z',
          submittedAt: '2026-11-13T12:05:00.000Z',
          autoScore: 4,
          manualScore: 0,
          totalScore: 4,
          maxScore: 10,
          objectiveMax: 4,
          essayMax: 6,
          hasEssay: true,
          gradingStatus: 'PENDING_MANUAL_GRADE',
          answers: [
            {
              questionId: 'q-mcq',
              type: 'MCQ',
              prompt: 'Which word is a noun?',
              points: 4,
              selectedOptionId: 'opt-a',
              selectedOptionText: 'Department',
              isCorrect: true,
              autoEarned: 4,
            },
            {
              questionId: 'q-essay',
              type: 'ESSAY',
              prompt: 'Write one polite request sentence.',
              points: 6,
              textAnswer: 'Could you please send me the report by Friday?',
            },
          ],
          manualGrades: {},
          teacherFeedback: '',
          gradedAt: null,
        },
      ],
    });

    mock.fetch
      .mockResolvedValueOnce(makeStudentQuizWorkspace())
      .mockResolvedValueOnce(started)
      .mockResolvedValueOnce(submitted);

    render(
      <MemoryRouter>
        <LocalQuizPanel classId={classId} activityId={activityId} />
      </MemoryRouter>,
    );

    const startBtn = await screen.findByRole('button', { name: /Bắt đầu làm bài Quiz/i });
    fireEvent.click(startBtn);

    const opt = await screen.findByLabelText('Department');
    fireEvent.click(opt);
    fireEvent.change(screen.getByPlaceholderText(/Nhập câu trả lời tự luận/i), {
      target: { value: 'Could you please send me the report by Friday?' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Nộp bài Quiz/i }));

    await waitFor(() => {
      expect(screen.getByText(/Điểm trắc nghiệm \(tự động\):/i)).toBeInTheDocument();
      expect(
        screen.getByText(/Phần tự luận \(6 điểm\) đang chờ giảng viên chấm/i),
      ).toBeInTheDocument();
    });
  });

  it('allows student check-in with code and renders real teacher roster without fake check-ins', async () => {
    const studentOpen: LocalAttendanceWorkspace = {
      editable: false,
      serverNow: '2026-11-13T12:10:00.000Z',
      windowStatus: 'OPEN',
      activity: {
        id: activityId,
        sectionId: 'sec-1',
        sectionTitle: 'Lý thuyết',
        sectionPublished: true,
        title: 'Điểm danh Buổi 1',
        introduction: 'Check-in đầu giờ',
        state: 'PUBLISHED',
        availableFrom: '2026-11-13T12:00:00.000Z',
        availableUntil: '2026-11-13T14:00:00.000Z',
        revisionNumber: 1,
      },
      config: {
        sessionTitle: 'Buổi 1 Nghe hiểu',
        sessionDateLabel: '',
        checkInStartAt: '2026-11-13T12:00:00.000Z',
        checkInEndAt: '2026-11-13T14:00:00.000Z',
        lateAfterMinutes: 15,
        requireCode: true,
      },
      myRecord: null,
    };

    const studentCheckedIn: LocalAttendanceWorkspace = {
      ...studentOpen,
      myRecord: {
        status: 'PRESENT',
        checkedInAt: '2026-11-13T12:11:00.000Z',
        note: 'Đúng giờ',
      },
    };

    mock.fetch.mockResolvedValueOnce(studentOpen).mockResolvedValueOnce(studentCheckedIn);

    const { unmount } = render(
      <MemoryRouter>
        <LocalAttendancePanel classId={classId} activityId={activityId} />
      </MemoryRouter>,
    );

    const codeInput = await screen.findByPlaceholderText(/Nhập mã điểm danh/i);
    fireEvent.change(codeInput, { target: { value: 'TOEIC01' } });
    fireEvent.click(screen.getByRole('button', { name: /Check-in điểm danh/i }));

    await waitFor(() => {
      expect(screen.getByText(/Trạng thái điểm danh của bạn: Có mặt/i)).toBeInTheDocument();
    });
    unmount();

    const teacherView: LocalAttendanceWorkspace = {
      ...studentOpen,
      editable: true,
      config: { ...studentOpen.config, checkInCode: 'TOEIC01' },
      summary: {
        totalEnrolled: 2,
        presentCount: 1,
        lateCount: 0,
        notRecordedCount: 1,
      },
      roster: [
        {
          enrollmentId: 'e1',
          learnerId: 'u1',
          fullName: 'Bùi Thị Minh Châu',
          email: 'chau@example.com',
          status: 'PRESENT',
          checkedInAt: '2026-11-13T12:11:00.000Z',
          note: '',
        },
        {
          enrollmentId: 'e2',
          learnerId: 'u2',
          fullName: 'Trần Văn Nam',
          email: 'nam@example.com',
          status: 'NOT_RECORDED',
          checkedInAt: null,
          note: '',
        },
      ],
    };
    mock.fetch.mockResolvedValueOnce(teacherView);

    render(
      <MemoryRouter>
        <LocalAttendancePanel classId={classId} activityId={activityId} />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Bùi Thị Minh Châu')).toBeInTheDocument();
    expect(screen.getByText('Trần Văn Nam')).toBeInTheDocument();
    expect(screen.getAllByText('Có mặt').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('Chưa điểm danh').length).toBeGreaterThanOrEqual(2);
  });
});
