import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InstructorClassWorkspaceLayout } from '@/layouts/InstructorClassWorkspaceLayout';
import { InstructorClassOverviewPage } from '@/pages/InstructorClassOverviewPage';
import { InstructorRosterPage } from '@/pages/InstructorRosterPage';
import { InstructorClassResultsPage } from '@/pages/InstructorClassResultsPage';
import { InstructorLearnerDetailPage } from '@/pages/InstructorLearnerDetailPage';
import { instructorApi } from './api';
import type { InstructorClass, InstructorClassOverview, InstructorLearnerDetail } from './types';

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

  it('renders different learner tests as independent history without cross-test inference', async () => {
    const scoreSet = (offset: number) => (['LISTENING', 'READING', 'SPEAKING', 'WRITING'] as const).map((skill, index) => ({ skill, normalizedScore: 60 + index * 5 + offset }));
    const detail: InstructorLearnerDetail = {
      classOffering: classroom,
      enrollment: { id: 'enrollment-a', status: 'ACTIVE', enrolledAt: '2026-08-01', learner: { id: 'learner-a', fullName: 'Nguyễn Minh Anh', email: 'a@test.local' } },
      lessonProgress: [], attempts: [], latestFourSkillSnapshot: { assessmentTitle: 'Đợt 2', scores: scoreSet(5) },
      summary: { completedLessons: 0, totalLessons: 0, submittedAssessmentCount: 2, pendingGradingCount: 0, lastActivityAt: null },
      moduleProgress: [], recentActivity: [],
      skillTrend: [
        { attemptId: 'a-1', testId: 'test-a', assessmentTitle: 'Đợt 1', stage: 'PERIODIC', date: '2026-09-01', scores: scoreSet(0) },
        { attemptId: 'a-2', testId: 'test-b', assessmentTitle: 'Đợt 2', stage: 'MIDTERM', date: '2026-10-01', scores: scoreSet(5) },
      ],
    };
    vi.spyOn(instructorApi.classes, 'learner').mockResolvedValue(detail);
    render(<MemoryRouter initialEntries={['/instructor/classes/class-a/learners/enrollment-a']}><Routes><Route path="/instructor/classes/:classOfferingId/learners/:enrollmentId" element={<InstructorLearnerDetailPage />} /></Routes></MemoryRouter>);
    expect(await screen.findByText('Lịch sử kết quả theo bài kiểm tra')).toBeInTheDocument();
    expect(screen.getAllByTestId('learner-assessment-card')).toHaveLength(2);
    expect(screen.queryByTestId('two-point-skill-comparison')).not.toBeInTheDocument();
    expect(screen.queryByText(/Mức tăng lớn nhất|Điểm tăng/)).not.toBeInTheDocument();
    expect(screen.getByText(/không tự suy diễn chênh lệch/)).toBeInTheDocument();
  });

  it('allows a descriptive comparison only for repeated use of the same test', async () => {
    const scores = (value: number) => (['LISTENING', 'READING', 'SPEAKING', 'WRITING'] as const).map((skill) => ({ skill, normalizedScore: value }));
    vi.spyOn(instructorApi.classes, 'learner').mockResolvedValue({ classOffering: classroom, enrollment: { id: 'e', status: 'ACTIVE', enrolledAt: '2026-08-01', learner: { id: 'l', fullName: 'A', email: 'a@test' } }, lessonProgress: [], attempts: [], latestFourSkillSnapshot: null, summary: { completedLessons: 0, totalLessons: 0, submittedAssessmentCount: 2, pendingGradingCount: 0, lastActivityAt: null }, moduleProgress: [], recentActivity: [], skillTrend: [{ attemptId: 'a1', testId: 'same-test', assessmentTitle: 'Đề A', stage: 'PERIODIC', date: '2026-09-01', scores: scores(60) }, { attemptId: 'a2', testId: 'same-test', assessmentTitle: 'Đề A', stage: 'PERIODIC', date: '2026-10-01', scores: scores(65) }] });
    render(<MemoryRouter initialEntries={['/instructor/classes/class-a/learners/e']}><Routes><Route path="/instructor/classes/:classOfferingId/learners/:enrollmentId" element={<InstructorLearnerDetailPage />} /></Routes></MemoryRouter>);
    expect(await screen.findByText('So sánh các lần làm cùng đề')).toBeInTheDocument();
    expect(screen.getByTestId('two-point-skill-comparison')).toBeInTheDocument();
    expect(screen.getByText(/không phải bằng chứng về thay đổi năng lực/)).toBeInTheDocument();
  });

  it('shows truthful submitted, fully graded, pending and FINAL-only sample evidence', async () => {
    vi.spyOn(instructorApi.classes, 'results').mockResolvedValue({
      classOffering: classroom,
      assessments: [
        {
          id: 'assessment-a',
          stage: 'MIDTERM',
          test: { id: 'test-midterm', title: 'Kiểm tra giữa kỳ' },
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
                from70To84: [{ id: 'attempt-a', enrollmentId: 'enrollment-a', normalizedScore: 80, learner: { fullName: 'Nguyễn Minh Anh', email: 'a@test.local' } }],
                from85To100: [],
              },
            },
            { skill: 'READING', average: null, sampleCount: 0, excludedCount: 9, distribution: { below50: 0, from50To69: 0, from70To84: 0, from85To100: 0 } },
            { skill: 'SPEAKING', average: null, sampleCount: 0, excludedCount: 9, distribution: { below50: 0, from50To69: 0, from70To84: 0, from85To100: 0 } },
            { skill: 'WRITING', average: null, sampleCount: 0, excludedCount: 9, distribution: { below50: 0, from50To69: 0, from70To84: 0, from85To100: 0 } },
          ],
          learners: [
            {
              id: 'attempt-a',
              learnerId: 'learner-a', enrollmentId: 'enrollment-a', submittedAt: '2026-10-01',
              learner: { fullName: 'Nguyễn Minh Anh', email: 'a@test.local' },
              attemptNumber: 2,
              label: 'Lượt gần nhất',
              skillScores: [
                { skill: 'LISTENING', status: 'FINAL', normalizedScore: 80 },
                { skill: 'READING', status: 'PROVISIONAL', normalizedScore: 60 },
              ],
            },
          ],
          notSubmittedLearners: [{ enrollmentId: 'enrollment-b', learnerId: 'learner-b', learner: { fullName: 'Học viên B', email: 'b@test.local' } }],
        },
      ],
      assessmentHistory: [
        { assessmentId: 'periodic-a', testId: 'test-periodic', title: 'Kiểm tra thường kỳ', stage: 'PERIODIC', date: '2026-09-10T00:00:00Z', skills: [{ skill: 'LISTENING', average: 70, sampleCount: 8 }] },
        { assessmentId: 'assessment-a', testId: 'test-midterm', title: 'Kiểm tra giữa kỳ', stage: 'MIDTERM', date: '2026-10-01T00:00:00Z', skills: [{ skill: 'LISTENING', average: 75.2, sampleCount: 9 }] },
      ],
      sameTestComparisons: [],
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
    expect(await screen.findByText('Kết quả 4 kỹ năng')).toBeInTheDocument();
    expect(screen.getByText('Phân bố điểm')).toBeInTheDocument();
    const matrix = screen.getByTestId('learner-matrix');
    expect(matrix).toHaveTextContent('Nguyễn Minh Anh');
    for (const name of [/Đã chấm đủ/i, /Chờ chấm/i, /Chưa nộp/i]) { fireEvent.click(screen.getAllByRole('button', { name })[0]); expect(screen.getByRole('dialog')).toBeInTheDocument(); fireEvent.click(screen.getByRole('button', { name: 'Đóng' })); }
    fireEvent.click(screen.getByTestId('consolidated-skill-comparison').querySelector('button')!);
    expect(screen.getByRole('dialog')).toHaveTextContent('Có điểm cuối');
    expect(matrix).not.toHaveTextContent('Đang lọc:');
    fireEvent.click(screen.getByRole('button', { name: 'Đóng' }));
    fireEvent.click(screen.getByRole('button', { name: /Nghe 70–84/ }));
    expect(screen.getByRole('dialog')).toHaveTextContent('80%');
    fireEvent.click(screen.getByRole('button', { name: 'Lọc bảng theo nhóm này' }));
    expect(matrix).toHaveTextContent('Đang lọc: Nghe · 70–84');
    expect(screen.getAllByTestId('class-assessment-card')).toHaveLength(2);
    expect(screen.queryByText(/\+5\.2 điểm/)).not.toBeInTheDocument();
  });

  it('shows honest analytics empty states without fake distribution segments', async () => {
    const zeroAverage = (skill: string) => ({ skill, average: null, sampleCount: 0, excludedCount: 9, distribution: { below50: 0, from50To69: 0, from70To84: 0, from85To100: 0 } });
    vi.spyOn(instructorApi.classes, 'results').mockResolvedValue({
      classOffering: classroom,
      assessments: [{
        id: 'empty-assessment', stage: 'FINAL', test: { id: 'test-final', title: 'Kiểm tra cuối kỳ' },
        submittedCount: 0, latestAttemptCount: 0, fullyGradedCount: 0, pendingGradingCount: 0, notSubmittedCount: 9,
        completion: { fullyGraded: 0, pendingGrading: 0, notSubmitted: 9, total: 9 },
        skillAverages: ['LISTENING', 'READING', 'SPEAKING', 'WRITING'].map(zeroAverage), learners: [],
      }],
      assessmentHistory: [
        { assessmentId: 'old-a', testId: 'a', title: 'Đợt 1', stage: 'PERIODIC', date: '2026-08-01', skills: [{ skill: 'LISTENING', average: 60, sampleCount: 4 }] },
        { assessmentId: 'old-b', testId: 'b', title: 'Đợt 2', stage: 'MIDTERM', date: '2026-09-01', skills: [{ skill: 'LISTENING', average: 65, sampleCount: 5 }] },
      ],
      sameTestComparisons: [],
    });
    render(<MemoryRouter initialEntries={['/instructor/classes/class-a/results']}><Routes><Route path="/instructor/classes/:classOfferingId/results" element={<InstructorClassResultsPage />} /></Routes></MemoryRouter>);
    expect(await screen.findByText('Chưa có điểm cuối để tính điểm trung bình.')).toBeInTheDocument();
    expect(screen.getByText('Bài kiểm tra này chưa có điểm cuối để hiển thị phân bố.')).toBeInTheDocument();
    expect(screen.queryByLabelText(/Phân bố .*100 phần trăm/)).not.toBeInTheDocument();
    expect(screen.getByText(/không tự tính mức tăng\/giảm/i)).toBeInTheDocument();
    expect(screen.queryByTestId('two-point-skill-comparison')).not.toBeInTheDocument();
  });

  it('shows same-test class deltas only with a visible matched cohort', async () => {
    vi.spyOn(instructorApi.classes, 'results').mockResolvedValue({
      classOffering: classroom,
      assessments: [{ id: 'assessment-a', stage: 'PERIODIC', test: { id: 'same', title: 'Đề A' }, completion: { fullyGraded: 0, pendingGrading: 0, notSubmitted: 9, total: 9 }, skillAverages: ['LISTENING', 'READING', 'SPEAKING', 'WRITING'].map((skill) => ({ skill, average: null, sampleCount: 0, excludedCount: 9, distribution: { below50: 0, from50To69: 0, from70To84: 0, from85To100: 0 } })), learners: [] }],
      assessmentHistory: [],
      sameTestComparisons: [{ testId: 'same', title: 'Đề A', before: { assessmentId: 'a1', date: '2026-08-01' }, after: { assessmentId: 'a2', date: '2026-09-01' }, skills: [{ skill: 'LISTENING', beforeAverage: 60, afterAverage: 65, matchedLearnerCount: 3 }] }],
    });
    render(<MemoryRouter initialEntries={['/instructor/classes/class-a/results']}><Routes><Route path="/instructor/classes/:classOfferingId/results" element={<InstructorClassResultsPage />} /></Routes></MemoryRouter>);
    expect(await screen.findByText('So sánh các lần tổ chức cùng đề')).toBeInTheDocument();
    expect(screen.getByText('So sánh trên 3 học viên có điểm ở cả hai lần.')).toBeInTheDocument();
    expect(screen.getByText('+5 điểm')).toBeInTheDocument();
  });
});
