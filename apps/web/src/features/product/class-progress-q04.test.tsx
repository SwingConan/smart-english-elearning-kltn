import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter, Route, Routes } from 'react-router';
import { apiFetch } from '@/lib/api-client';
import { ClassProgressPage } from './ClassProgressPage';

vi.mock('@/lib/api-client', async (actual) => {
  const real = await actual<typeof import('@/lib/api-client')>();
  return { ...real, apiFetch: vi.fn() };
});

vi.mock('@/features/auth/auth-context', () => ({
  useAuth: () => ({
    user: {
      id: 'student-1',
      email: 'student@example.com',
      fullName: 'Học viên',
      role: 'STUDENT',
    },
  }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Q04 ClassProgressPage analytics and remediation links', () => {
  it('renders Q04 progress ratio, skill breakdown, weakness evidence, remediation links, placement separation, and AI disabled notice', async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      class: { id: 'c1', code: 'TOEIC-C1', name: 'TOEIC C1' },
      enrollmentId: 'e1',
      courseVersionId: null,
      observedAt: '2026-11-14T08:00:00Z',
      completion: 'POLICY_NOT_EVALUATED',
      percentage: null,
      certificateIssued: false,
      activityProgress: {
        totalPublishedActivities: 3,
        openActivitiesCount: 2,
        upcomingActivitiesCount: 1,
        completedOrSubmittedCount: 2,
        completedCount: 2,
        pendingGradingOrReleaseCount: 0,
        inProgressCount: 0,
        notStartedOpenCount: 0,
        completionRatioPercent: 100,
        formulaLabel: 'Hoạt động đã hoàn thành hoặc nộp / Tổng hoạt động đang mở',
        policyStatus: 'CHUA_CHOT_TRONG_SO_VA_DIEU_KIEN_DAT',
        policyNote: 'Chưa chốt trọng số và ngưỡng đạt cuối khóa (CHƯA CHỐT #4).',
      },
      sections: [
        {
          sectionId: 's1',
          title: 'Học phần 1 · Grammar',
          orderIndex: 1,
          totalPublishedActivities: 2,
          openActivitiesCount: 2,
          upcomingActivitiesCount: 0,
          completedOrSubmittedCount: 2,
          publishedGradesCount: 1,
          notStartedOpenCount: 0,
          completionRatioPercent: 100,
          activities: [
            {
              activityId: 'act-lesson',
              title: 'Bài học Từ loại Part 5',
              type: 'LESSON',
              localKind: null,
              assessmentKind: null,
              state: 'COMPLETED',
              isUpcoming: false,
              availableFrom: null,
              availableUntil: null,
              score: null,
              maxScore: null,
              passScore: null,
              passed: null,
              attendanceStatus: null,
              submittedAt: null,
              gradedAt: null,
              feedback: '',
            },
            {
              activityId: 'act-quiz',
              title: 'Kiểm tra thường kỳ Grammar',
              type: 'QUIZ',
              localKind: 'LOCAL_QUIZ',
              assessmentKind: 'REGULAR',
              state: 'PUBLISHED',
              isUpcoming: false,
              availableFrom: null,
              availableUntil: null,
              score: 2,
              maxScore: 4,
              passScore: 3,
              passed: false,
              attendanceStatus: null,
              submittedAt: '2026-11-14T07:50:00Z',
              gradedAt: '2026-11-14T07:55:00Z',
              feedback: 'Ôn lại thì quá khứ đơn.',
            },
          ],
        },
      ],
      competencyAnalysis: {
        evaluatedAssessmentsCount: 1,
        pendingResultsCount: 0,
        hasEnoughData: true,
        insufficientDataReason: null,
        skillBreakdown: [
          {
            skill: 'READING',
            label: 'Đọc hiểu & Ngữ pháp (Reading)',
            status: 'NEEDS_IMPROVEMENT',
            percentage: 50,
            earnedPoints: 2,
            maxPoints: 4,
            correctItems: 1,
            totalItems: 2,
          },
        ],
        strengths: [],
        weaknesses: [
          {
            skill: 'READING',
            label: 'Đọc hiểu & Ngữ pháp (Reading)',
            percentage: 50,
            status: 'NEEDS_IMPROVEMENT',
            evidenceCount: 1,
            evidenceSummary: 'Đạt 2/4 điểm (50%) — dưới ngưỡng 60%, cần ôn tập lại kiến thức nền.',
          },
        ],
        weaknessEvidence: [
          {
            id: 'ev-1',
            sourceType: 'LOCAL_QUIZ',
            activityId: 'act-quiz',
            activityTitle: 'Kiểm tra thường kỳ Grammar',
            assessmentKind: 'REGULAR',
            gradedAt: '2026-11-14T07:55:00Z',
            skill: 'READING',
            skillLabel: 'Đọc hiểu & Ngữ pháp (Reading)',
            topicTag: 'Từ loại, Thì động từ & Cấu trúc câu (TOEIC Part 5–6)',
            prompt: 'The manager ___ the report yesterday.',
            learnerAnswer: 'signs',
            correctAnswer: 'signed',
            earnedPoints: 0,
            maxPoints: 2,
            explanation: 'Yesterday marks past simple.',
          },
        ],
        trendAnalysis: {
          status: 'INSUFFICIENT_DATA',
          sampleCount: 1,
          deltaPercent: null,
          message: 'Chưa đủ dữ liệu tối thiểu 2 bài đánh giá đã công bố.',
          samples: [],
        },
      },
      recommendations: [
        {
          id: 'rec-lesson',
          kind: 'CLASS_LESSON',
          title: 'Bài học Từ loại Part 5',
          subtitle: 'Học phần 1 · Hoạt động trong lớp',
          targetSkill: 'READING',
          reason: 'Ôn tập lại phần ngữ pháp.',
          href: '/classroom/c1/activities/act-lesson',
          accessible: true,
        },
        {
          id: 'rec-kb',
          kind: 'KNOWLEDGE_ARTICLE',
          title: 'Hệ thống Từ loại, Thì động từ TOEIC Part 5–6',
          subtitle: 'Thư viện kiến thức chính thức (Đã xuất bản)',
          targetSkill: 'READING',
          reason: 'Củng cố lý thuyết Part 5.',
          href: '/knowledge/articles/toeic-part5-word-forms-and-clause-structure',
          accessible: true,
        },
      ],
      placementReference: {
        hasPlacementAttempt: true,
        blendedIntoClassMetrics: false,
        separationNotice: 'Tách biệt hoàn toàn với điểm lớp.',
        latestAttempt: {
          attemptId: 'p1',
          title: 'Placement LR',
          submittedAt: '2026-11-10T05:00:00Z',
          score: 70,
          maxScore: 100,
        },
      },
      analysisMeta: {
        mode: 'RULE_BASED',
        generatedFrom: ['Q03_UNIFIED_LMS_ACTIVITIES'],
        thresholdsNote: 'Rule-based',
      },
      aiAdvisory: {
        status: 'DISABLED',
        provider: 'NONE',
        reason: 'AI đang tắt (PLACEMENT_AI_ADVISORY_PROVIDER=NONE).',
      },
      entries: [],
    });

    render(
      <MemoryRouter initialEntries={['/classroom/c1/progress']}>
        <Routes>
          <Route path="/classroom/:classId/progress" element={<ClassProgressPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('100% (2/2)')).toBeInTheDocument();
    expect(screen.getByText('The manager ___ the report yesterday.')).toBeInTheDocument();
    expect(screen.getByText('Bạn đã chọn/nộp: signs')).toBeInTheDocument();
    expect(screen.getByText('Đáp án đúng: signed')).toBeInTheDocument();
    expect(screen.getByText('Tách biệt hoàn toàn với điểm lớp.')).toBeInTheDocument();

    const links = screen.getAllByRole('link', { name: 'Mở nội dung ôn tập' });
    expect(links.map((l) => l.getAttribute('href'))).toEqual([
      '/classroom/c1/activities/act-lesson',
      '/knowledge/articles/toeic-part5-word-forms-and-clause-structure',
    ]);
    const actLinks = screen.getAllByRole('link', { name: 'Mở hoạt động' });
    expect(actLinks[1]).toHaveAttribute('href', '/classroom/c1/activities/act-quiz');
  });
});
