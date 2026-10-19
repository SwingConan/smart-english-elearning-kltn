import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adminApi } from '@/features/admin/api';
import { studentAssessmentApi } from '@/features/assessments/api';
import { deferred, renderAssessmentRoute } from '@/features/assessments/assessment-test-utils';
import { enrollmentApi } from '@/features/enrollments/api';
import { ClassShellLayout } from '@/layouts/ClassShellLayout';
import { studyRecommendationApi } from './api';
import type { StudyRecommendationResponse } from './types';
import { AdminStudyRecommendationPolicyPage } from '@/pages/AdminStudyRecommendationPolicyPage';
import { StudyRecommendationsPage } from '@/pages/StudyRecommendationsPage';

const enrollmentId = '11111111-1111-4111-8111-111111111111';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('StudyRecommendationsPage', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('renders READY source, evidence, recommendations, pending truth, plan and frozen history', async () => {
    vi.spyOn(studyRecommendationApi, 'get').mockResolvedValue(readyResponse());
    renderLearner();

    expect(await screen.findByRole('heading', { name: 'Gợi ý dành cho bạn' })).toBeInTheDocument();
    expect(screen.getByText('GỢI Ý TỰ HỌC')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Dựa trên kết quả bài kiểm tra đã hoàn tất, hệ thống đề xuất nội dung nên ưu tiên tiếp theo.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/Nguồn: Midterm October/)).toBeInTheDocument();
    expect(screen.getByText(/điểm đang chờ không được tính là 0/i)).toBeInTheDocument();
    expect(screen.getByText('Điểm mạnh').closest('article')).toHaveTextContent('Listening84%');
    expect(screen.getByText('Điểm mạnh').closest('article')).toHaveTextContent(
      'Listening hiện cao hơn Reading trong kết quả nguồn.',
    );
    expect(screen.getByText('Cần cải thiện').closest('article')).toHaveTextContent('Reading · 42%');
    expect(screen.getByText('Cần cải thiện').closest('article')).toHaveTextContent(
      'Part 7 · Đọc hiểu · 35%',
    );
    expect(screen.getByText('Reading focus lesson')).toBeInTheDocument();
    expect(screen.getByText(/dưới ngưỡng ưu tiên 50%/i)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Xem kế hoạch 7 ngày'));
    expect(screen.getByText('Ôn Reading ngày 1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Làm practice ngày 3' })).toBeInTheDocument();
    expect(screen.getByText('Lịch sử gợi ý')).toBeInTheDocument();
    expect(screen.getByText('Trước đây')).toBeInTheDocument();
  });

  it('distinguishes absolute strengths from balanced relative evidence', async () => {
    const absolute = readyResponse();
    absolute.strengths[0].relative = false;
    vi.spyOn(studyRecommendationApi, 'get').mockResolvedValueOnce(absolute);
    const first = renderLearner();
    expect(await screen.findByText(/đạt ngưỡng kỹ năng mạnh 75%/i)).toBeInTheDocument();
    first.unmount();

    const balanced = readyResponse();
    balanced.strengths[0].normalizedScore = balanced.focus!.normalizedScore;
    vi.spyOn(studyRecommendationApi, 'get').mockResolvedValueOnce(balanced);
    renderLearner();
    expect(await screen.findAllByText('Kết quả khá cân bằng')).not.toHaveLength(0);
    expect(screen.getByText('Cần cải thiện').closest('article')).toHaveTextContent(
      'Part 7 · Đọc hiểu',
    );
  });

  it('renders frozen historical strength, focus and reasons from the supplied snapshot', async () => {
    vi.spyOn(studyRecommendationApi, 'get').mockResolvedValue(readyResponse());
    renderLearner();
    const details = (await screen.findByText('Periodic September')).closest('details');
    expect(details).not.toBeNull();
    fireEvent.click(within(details!).getByText('Periodic September'));
    expect(within(details!).getByText('Reading')).toBeInTheDocument();
    expect(within(details!).getByText('91%')).toBeInTheDocument();
    expect(within(details!).getByText(/Listening · 33%/)).toBeInTheDocument();
    expect(within(details!).getByText('Historical listening lesson')).toBeInTheDocument();
    expect(within(details!).getByText(/2\/4 điểm.*Part 2/i)).toBeInTheDocument();
    expect(within(details!).queryByText(/Listening84%/)).not.toBeInTheDocument();
  });

  it('starts or resumes an actionable practice and navigates with the returned attempt id', async () => {
    vi.spyOn(studyRecommendationApi, 'get').mockResolvedValue(readyResponse());
    const start = vi.spyOn(studentAssessmentApi, 'startOrResume').mockResolvedValue({
      id: 'attempt-returned',
      testId: 'practice-1',
      enrollmentId,
      attemptNumber: 1,
      status: 'IN_PROGRESS',
      startedAt: '2026-10-19T08:00:00.000Z',
    });
    renderLearner();
    fireEvent.click(await screen.findByRole('button', { name: 'Làm bài luyện' }));
    await waitFor(() => expect(start).toHaveBeenCalledWith(enrollmentId, 'practice-1'));
    expect(await screen.findByTestId('location')).toHaveTextContent(
      `/student/enrollments/${enrollmentId}/attempts/attempt-returned`,
    );
  });

  it('does not render a practice action when the backend projects no actionable practice', async () => {
    const response = readyResponse();
    response.recommendations[0].practice = null;
    vi.spyOn(studyRecommendationApi, 'get').mockResolvedValue(response);
    renderLearner();
    await screen.findByText('Reading focus lesson');
    expect(screen.queryByRole('button', { name: 'Làm bài luyện' })).not.toBeInTheDocument();
  });

  it.each([
    ['NO_ELIGIBLE_RESULT', 'Chưa đủ dữ liệu để tạo gợi ý tự học.'],
    ['PENDING_REVIEW', 'Kết quả mới nhất đang chờ hoàn tất chấm.'],
    ['NO_MATCHING_CONTENT', 'Đã có kết quả, nhưng hiện chưa có nội dung học phù hợp để đề xuất.'],
  ] as const)(
    'renders the %s state without fabricating recommendations',
    async (state, heading) => {
      const response = readyResponse();
      response.state = state;
      response.recommendations = [];
      response.schedule7Days = [];
      if (state !== 'NO_MATCHING_CONTENT') response.source = null;
      vi.spyOn(studyRecommendationApi, 'get').mockResolvedValue(response);
      renderLearner();
      expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument();
      expect(screen.queryByText('Reading focus lesson')).not.toBeInTheDocument();
      if (!response.source) {
        expect(
          screen.queryByRole('heading', { name: 'Gợi ý dành cho bạn' }),
        ).not.toBeInTheDocument();
        expect(
          screen.queryByText(/Dựa trên kết quả bài kiểm tra đã hoàn tất/),
        ).not.toBeInTheDocument();
      }
    },
  );

  it('shows a neutral reason fallback for malformed legacy reason data', async () => {
    const response = readyResponse();
    response.recommendations[0].reason = null;
    response.recommendations[0].reasonStatus = 'UNAVAILABLE';
    vi.spyOn(studyRecommendationApi, 'get').mockResolvedValue(response);
    renderLearner();
    fireEvent.click(await screen.findByText('Vì sao hệ thống gợi ý?'));
    expect(screen.getByText(/Chi tiết quy tắc.*không còn khả dụng/i)).toBeInTheDocument();
  });

  it('shows loading and a safe retry state', async () => {
    const pending = deferred<StudyRecommendationResponse>();
    const get = vi.spyOn(studyRecommendationApi, 'get').mockReturnValueOnce(pending.promise);
    renderLearner();
    expect(screen.getByRole('status', { name: 'Đang tải gợi ý tự học' })).toBeInTheDocument();
    pending.reject(new Error('raw internal failure'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Không thể tải gợi ý tự học');
    expect(screen.queryByText(/raw internal failure/i)).not.toBeInTheDocument();
    get.mockResolvedValueOnce(readyResponse());
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByText('Reading focus lesson')).toBeInTheDocument();
  });
});

describe('recommendation navigation', () => {
  it('places Gợi ý tự học in the standard class navigation and routes to it', async () => {
    vi.spyOn(enrollmentApi, 'detail').mockResolvedValue({
      id: enrollmentId,
      status: 'ACTIVE',
      progress: { progressPercent: 50 },
      classOffering: { name: 'TOEIC LR', code: 'LR-01', course: { title: 'TOEIC LR' } },
    } as never);
    render(
      <MemoryRouter initialEntries={[`/student/enrollments/${enrollmentId}/results`]}>
        <Routes>
          <Route path="/student/enrollments/:enrollmentId" element={<ClassShellLayout />}>
            <Route path="results" element={<p>Results page</p>} />
            <Route path="recommendations" element={<p>Recommendations route</p>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole('link', { name: 'Gợi ý tự học' }));
    expect(await screen.findByText('Recommendations route')).toBeInTheDocument();
  });
});

describe('AdminStudyRecommendationPolicyPage', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('loads and updates the deterministic future-only policy', async () => {
    const policy = policyResponse();
    vi.spyOn(adminApi.studyRecommendationPolicy, 'get').mockResolvedValue(policy);
    const update = vi
      .spyOn(adminApi.studyRecommendationPolicy, 'update')
      .mockResolvedValue({ ...policy, weakThreshold: 45 });
    renderAdmin();
    expect(await screen.findByText('M08 deterministic policy')).toBeInTheDocument();
    expect(screen.getByText(/không dùng AI/i)).toBeInTheDocument();
    expect(screen.getByText(/không bị tính lại khi lưu/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Ngưỡng kỹ năng yếu (%)'), { target: { value: '45' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Lưu tiêu chí' }).closest('form')!);
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith({
        weakThreshold: 45,
        strongThreshold: 80,
        minimumTaskQuestions: 3,
        maxRecommendations: 3,
      }),
    );
    expect(await screen.findByRole('status')).toHaveTextContent('Đã cập nhật');
  });

  it('validates threshold ordering and integer bounds before PUT', async () => {
    vi.spyOn(adminApi.studyRecommendationPolicy, 'get').mockResolvedValue(policyResponse());
    const update = vi.spyOn(adminApi.studyRecommendationPolicy, 'update');
    renderAdmin();
    await screen.findByText('M08 deterministic policy');
    fireEvent.change(screen.getByLabelText('Ngưỡng kỹ năng yếu (%)'), { target: { value: '90' } });
    fireEvent.change(screen.getByLabelText('Số gợi ý tối đa'), { target: { value: '6' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Lưu tiêu chí' }).closest('form')!);
    expect(screen.getByText('Ngưỡng mạnh phải lớn hơn ngưỡng yếu.')).toBeInTheDocument();
    expect(screen.getByText('Nhập số nguyên từ 1 đến 5.')).toBeInTheDocument();
    expect(update).not.toHaveBeenCalled();
  });

  it.each([
    ['Ngưỡng kỹ năng yếu (%)', 'Vui lòng nhập ngưỡng kỹ năng yếu.'],
    ['Ngưỡng kỹ năng mạnh (%)', 'Vui lòng nhập ngưỡng kỹ năng mạnh.'],
  ])('rejects a blank %s without sending PUT', async (label, message) => {
    vi.spyOn(adminApi.studyRecommendationPolicy, 'get').mockResolvedValue(policyResponse());
    const update = vi.spyOn(adminApi.studyRecommendationPolicy, 'update');
    renderAdmin();
    await screen.findByText('M08 deterministic policy');
    fireEvent.change(screen.getByLabelText(label), { target: { value: '' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Lưu tiêu chí' }).closest('form')!);
    expect(screen.getByText(message)).toBeInTheDocument();
    expect(update).not.toHaveBeenCalled();
  });

  it('does not leak a raw server error', async () => {
    vi.spyOn(adminApi.studyRecommendationPolicy, 'get').mockResolvedValue(policyResponse());
    vi.spyOn(adminApi.studyRecommendationPolicy, 'update').mockRejectedValue(
      new Error('database secret'),
    );
    renderAdmin();
    await screen.findByText('M08 deterministic policy');
    fireEvent.click(screen.getByRole('button', { name: 'Lưu tiêu chí' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Không thể kết nối máy chủ/i);
    expect(screen.queryByText(/database secret/i)).not.toBeInTheDocument();
  });
});

function renderLearner() {
  return renderAssessmentRoute(
    <StudyRecommendationsPage />,
    `/student/enrollments/${enrollmentId}/recommendations`,
    '/student/enrollments/:enrollmentId/recommendations',
  );
}

function renderAdmin() {
  return renderAssessmentRoute(
    <AdminStudyRecommendationPolicyPage />,
    '/admin/study-recommendations',
    '/admin/study-recommendations',
    { role: 'ADMIN_COORDINATOR' },
  );
}

function policyResponse() {
  return {
    id: 'policy-1',
    code: 'M08_STUDY_REC_V1',
    name: 'M08 deterministic policy',
    weakThreshold: 40,
    strongThreshold: 80,
    minimumTaskQuestions: 3,
    maxRecommendations: 3,
    isActive: true,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
  };
}

function readyResponse(): StudyRecommendationResponse {
  const recommendation = {
    id: 'rec-1',
    priority: 1,
    skill: 'READING' as const,
    targetType: 'LESSON' as const,
    title: 'Ưu tiên Reading',
    actionText: 'Củng cố kỹ năng đọc theo bằng chứng hiện tại.',
    lesson: {
      id: 'lesson-1',
      title: 'Reading focus lesson',
      estimatedMinutes: 25,
      moduleTitle: 'Reading Core',
      path: `/student/enrollments/${enrollmentId}/lessons/lesson-1`,
    },
    resources: [],
    practice: {
      assessmentId: 'assignment-1',
      testId: 'practice-1',
      title: 'Part 7 practice',
      maxAttempts: 2,
      availability: 'AVAILABLE' as const,
      actionable: true as const,
      startPath: '/api/ignore-this-path',
    },
    reason: {
      schemaVersion: 1 as const,
      policy: {
        code: 'M08_STUDY_REC_V1',
        weakThreshold: 50,
        strongThreshold: 75,
        minimumTaskQuestions: 3,
        maxRecommendations: 3,
      },
      skillEvidence: {
        skill: 'READING' as const,
        rawScore: 21,
        maxRawScore: 50,
        normalizedScore: 42,
      },
      taskEvidence: {
        taskCode: 'R7_READING_COMPREHENSION',
        questionCount: 18,
        awardedPoints: 6,
        maxPoints: 18,
        normalizedScore: 35,
      },
      selection: {
        basis: 'TASK_WEAKNESS' as const,
        targetLessonTitle: 'Reading focus lesson',
        targetPracticeAvailableAtGeneration: true,
        rank: 1,
      },
    },
    reasonStatus: 'AVAILABLE' as const,
    aiExplanation: null,
  };
  const historicalRecommendation = {
    ...recommendation,
    id: 'old-rec',
    skill: 'LISTENING' as const,
    lesson: {
      ...recommendation.lesson,
      id: 'historical-lesson',
      title: 'Historical listening lesson',
      path: `/student/enrollments/${enrollmentId}/lessons/historical-lesson`,
    },
    practice: null,
    reason: {
      ...recommendation.reason,
      policy: { ...recommendation.reason.policy, weakThreshold: 60, strongThreshold: 85 },
      skillEvidence: {
        skill: 'LISTENING' as const,
        rawScore: 16,
        maxRawScore: 50,
        normalizedScore: 33,
      },
      taskEvidence: {
        taskCode: 'L2_QUESTION_RESPONSE',
        questionCount: 4,
        awardedPoints: 2,
        maxPoints: 4,
        normalizedScore: 50,
      },
      selection: {
        basis: 'TASK_WEAKNESS' as const,
        targetLessonTitle: 'Historical listening lesson',
        targetPracticeAvailableAtGeneration: false,
        rank: 1,
      },
    },
  };
  return {
    state: 'READY',
    source: {
      attemptId: 'source-1',
      testId: 'test-1',
      testTitle: 'Midterm October',
      stage: 'MIDTERM',
      submittedAt: '2026-10-04T08:00:00.000Z',
      resultPath: `/student/enrollments/${enrollmentId}/attempts/source-1/result`,
    },
    pendingNewerAttempt: {
      attemptId: 'pending-1',
      title: 'New assessment',
      submittedAt: '2026-10-05T08:00:00.000Z',
      pendingSkills: ['SPEAKING'],
      resultPath: `/student/enrollments/${enrollmentId}/attempts/pending-1/result`,
    },
    strengths: [
      {
        skill: 'LISTENING',
        rawScore: 42,
        maxRawScore: 50,
        normalizedScore: 84,
        relative: true,
      },
    ],
    focus: {
      skill: 'READING',
      normalizedScore: 42,
      taskCode: 'R7_READING_COMPREHENSION',
      taskQuestionCount: 18,
      taskNormalizedScore: 35,
    },
    recommendations: [recommendation],
    schedule7Days: [
      { day: 1, title: 'Ôn Reading ngày 1', path: recommendation.lesson.path },
      { day: 2, title: 'Tự kiểm tra', path: null },
      { day: 3, title: 'Làm practice ngày 3', path: recommendation.practice.startPath },
    ],
    history: [
      {
        sourceAttemptId: 'old-source',
        sourceTitle: 'Periodic September',
        sourceSubmittedAt: '2026-09-20T08:00:00.000Z',
        current: false,
        mainFocus: 'LISTENING',
        itemCount: 1,
        strengths: [
          {
            skill: 'READING',
            rawScore: 45,
            maxRawScore: 50,
            normalizedScore: 91,
            relative: false,
          },
        ],
        focus: {
          skill: 'LISTENING',
          normalizedScore: 33,
          taskCode: 'L2_QUESTION_RESPONSE',
          taskQuestionCount: 4,
          taskNormalizedScore: 50,
        },
        sourceResultPath: `/student/enrollments/${enrollmentId}/attempts/old-source/result`,
        recommendations: [historicalRecommendation],
      },
    ],
  };
}
