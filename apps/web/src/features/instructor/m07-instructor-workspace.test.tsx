import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InstructorClassWorkspaceLayout } from '@/layouts/InstructorClassWorkspaceLayout';
import { InstructorClassOverviewPage } from '@/pages/InstructorClassOverviewPage';
import { InstructorRosterPage } from '@/pages/InstructorRosterPage';
import { InstructorClassResultsPage } from '@/pages/InstructorClassResultsPage';
import { instructorApi } from './api';
import type { InstructorClass, InstructorClassOverview } from './types';

const classroom: InstructorClass = {
  id: 'class-a',
  code: 'A01',
  name: 'Lớp TOEIC tối',
  status: 'IN_PROGRESS',
  activeLearnerCount: 9,
  course: { id: 'course-a', title: 'TOEIC Workplace', level: 'FOUNDATION' },
  scheduleSlots: [],
};
const overview: InstructorClassOverview = {
  classOffering: classroom,
  activeLearnerCount: 9,
  lessonProgress: { completed: 18, total: 27, percentage: 67 },
  pendingGradingCount: 2,
  grading: { waiting: 1, partial: 1, final: 2 },
  progressBuckets: [
    { label: '0–24%', count: 1, learners: [{ enrollmentId: 'enrollment-low', learnerId: 'learner-low', learner: { fullName: 'Học viên cần hỗ trợ', email: 'low@test.local' }, completedLessons: 0, totalLessons: 3, percentage: 0, lastActivityAt: '2026-09-01T00:00:00Z' }] },
    { label: '25–49%', count: 2 },
    { label: '50–74%', count: 3 },
    { label: '75–99%', count: 2 },
    { label: '100%', count: 1 },
  ],
  upcomingDeadlines: [{ assessmentId: 'assessment-a', kind: 'OPEN', at: '2026-10-11T18:30:00Z', title: 'Kiểm tra thường kỳ — Tiêu đề rất dài cần xuống dòng tự nhiên trên màn hình nhỏ' }],
  followUps: [{ kind: 'GRADING', count: 2, label: 'Bài nộp đang chờ chấm' }],
  assessments: [
    {
      id: 'assessment-a',
      stage: 'MIDTERM',
      openAt: null,
      closeAt: null,
      availability: 'OPEN',
      submittedLearnerCount: 5,
      inProgressLearnerCount: 2,
      notSubmittedLearnerCount: 2,
      activeLearnerCount: 9,
      test: { id: 'test-a', title: 'Kiểm tra giữa kỳ' },
    },
  ],
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('M07 Instructor class workspace', () => {
  it('renders all six class-centric tabs, selected state and the mobile drawer', async () => {
    vi.spyOn(instructorApi.classes, 'overview').mockResolvedValue(overview);
    render(
      <MemoryRouter initialEntries={['/instructor/classes/class-a']}>
        <Routes>
          <Route
            path="/instructor/classes/:classOfferingId"
            element={<InstructorClassWorkspaceLayout />}
          >
            <Route index element={<InstructorClassOverviewPage />} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByText('Lớp TOEIC tối')).toBeInTheDocument();
    const nav = screen.getAllByRole('navigation', { name: 'Điều hướng lớp giảng dạy' })[0];
    for (const label of [
      'Tổng quan',
      'Học viên',
      'Nội dung',
      'Bài kiểm tra',
      'Chấm bài',
      'Kết quả',
    ])
      expect(nav).toHaveTextContent(label);
    expect(screen.getAllByRole('link', { name: 'Tổng quan' })[0]).toHaveClass('bg-indigo-600');
    expect(screen.getByText('Mở')).toHaveClass('rounded-full');
    expect(screen.getByText('Kiểm tra thường kỳ')).toHaveClass('break-words');
    expect(screen.getByText(/Tiêu đề rất dài/)).toHaveClass('break-words');
    fireEvent.click(screen.getByRole('button', { name: /0–24%/i }));
    expect(screen.getByRole('dialog', { name: /Tiến độ 0–24%/i })).toHaveTextContent('Học viên cần hỗ trợ');
    fireEvent.click(screen.getByRole('button', { name: 'Đóng' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mở điều hướng lớp' }));
    expect(screen.getAllByRole('navigation', { name: 'Điều hướng lớp giảng dạy' })).toHaveLength(2);
  });

  it('filters the read-only roster without exposing membership mutation controls', async () => {
    vi.spyOn(instructorApi.classes, 'learners').mockResolvedValue({
      classOffering: classroom,
      learners: [
        {
          id: 'enrollment-a',
          status: 'ACTIVE',
          enrolledAt: '',
          learner: { id: 'learner-a', fullName: 'Nguyễn Minh Anh', email: 'minh.anh@test.local' },
          completedLessons: 2,
          totalLessons: 3,
          progressPercentage: 67,
          submittedAssessmentCount: 2,
          pendingGradingCount: 1,
          latestGradedAssessmentAt: null,
        },
        {
          id: 'enrollment-b',
          status: 'ACTIVE',
          enrolledAt: '',
          learner: { id: 'learner-b', fullName: 'Trần Gia Bảo', email: 'gia.bao@test.local' },
          completedLessons: 1,
          totalLessons: 3,
          progressPercentage: 33,
          submittedAssessmentCount: 1,
          pendingGradingCount: 0,
          latestGradedAssessmentAt: null,
        },
      ],
    });
    render(
      <MemoryRouter initialEntries={['/instructor/classes/class-a/learners']}>
        <Routes>
          <Route
            path="/instructor/classes/:classOfferingId/learners"
            element={<InstructorRosterPage />}
          />
        </Routes>
      </MemoryRouter>,
    );
    expect((await screen.findAllByText('Nguyễn Minh Anh')).length).toBeGreaterThan(0);
    fireEvent.change(screen.getByRole('textbox', { name: 'Tìm học viên' }), {
      target: { value: 'bảo' },
    });
    expect(screen.queryByText('Nguyễn Minh Anh')).not.toBeInTheDocument();
    expect(screen.getAllByText('Trần Gia Bảo').length).toBeGreaterThan(0);
    expect(screen.getByTestId('mobile-roster-cards')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /xóa|thêm học viên/i })).not.toBeInTheDocument();
  });

  it('shows truthful submitted, fully graded, pending and FINAL-only sample evidence', async () => {
    vi.spyOn(instructorApi.classes, 'results').mockResolvedValue({
      classOffering: classroom,
      assessments: [
        {
          id: 'assessment-a',
          stage: 'MIDTERM',
          test: { title: 'Kiểm tra giữa kỳ' },
          submittedCount: 3,
          latestAttemptCount: 2,
          fullyGradedCount: 1,
          pendingGradingCount: 1,
          notSubmittedCount: 7,
          completion: { fullyGraded: 1, pendingGrading: 1, notSubmitted: 7, total: 9 },
          skillAverages: [
            {
              skill: 'LISTENING',
              average: 75,
              sampleCount: 2,
              excludedCount: 7,
              distribution: { below50: 0, from50To69: 0, from70To84: 2, from85To100: 0 },
              distributionLearners: {
                below50: [],
                from50To69: [],
                from70To84: [{ id: 'attempt-a', learner: { fullName: 'Nguyễn Minh Anh', email: 'a@test.local' } }],
                from85To100: [],
              },
            },
            { skill: 'READING', average: null, sampleCount: 0, excludedCount: 9, distribution: { below50: 0, from50To69: 0, from70To84: 0, from85To100: 0 } },
          ],
          learners: [
            {
              id: 'attempt-a',
              learner: { fullName: 'Nguyễn Minh Anh', email: 'a@test.local' },
              attemptNumber: 2,
              label: 'Lượt gần nhất',
              skillScores: [
                { skill: 'LISTENING', status: 'FINAL', normalizedScore: 80 },
                { skill: 'READING', status: 'PROVISIONAL', normalizedScore: 60 },
              ],
            },
          ],
        },
      ],
      trend: [
        { assessmentId: 'periodic-a', title: 'Kiểm tra thường kỳ', stage: 'PERIODIC', date: '2026-09-10T00:00:00Z', skills: [{ skill: 'LISTENING', average: 70, sampleCount: 8 }] },
        { assessmentId: 'assessment-a', title: 'Kiểm tra giữa kỳ', stage: 'MIDTERM', date: '2026-10-01T00:00:00Z', skills: [{ skill: 'LISTENING', average: 75.200000000000003, sampleCount: 9 }] },
      ],
    });
    render(
      <MemoryRouter initialEntries={['/instructor/classes/class-a/results']}>
        <Routes>
          <Route
            path="/instructor/classes/:classOfferingId/results"
            element={<InstructorClassResultsPage />}
          />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByText('1 đã chấm đủ')).toBeInTheDocument();
    expect(screen.getByText('1 chờ chấm')).toBeInTheDocument();
    expect(screen.getByText('2/9 học viên đã có điểm cuối')).toBeInTheDocument();
    expect(screen.getAllByText('9 chưa đủ dữ liệu').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Đang chờ').length).toBeGreaterThan(0);
    expect(screen.getByText('Phân bố điểm')).toBeInTheDocument();
    expect(screen.getByTestId('consolidated-skill-comparison')).toBeInTheDocument();
    const distribution = screen.getByTestId('results-distribution');
    const trend = screen.getByTestId('results-trend');
    expect(distribution.compareDocumentPosition(trend) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByTestId('two-point-skill-slope')).toBeInTheDocument();
    expect(screen.getByText('+5.2 điểm')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/000000000000/);
    expect(screen.getByText('n=9')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: /70–84/ })[0]);
    expect(screen.getByText(/Nghe · 70–84/)).toBeInTheDocument();
    expect(screen.getAllByText('Nguyễn Minh Anh').length).toBeGreaterThan(0);
  });
});
