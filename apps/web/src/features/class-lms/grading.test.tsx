import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AssignmentCheckerPage,
  AssignmentGradebookPage,
  AssignmentGradingPage,
} from '@/pages/AssignmentGradingPage';
import { schoolTimestamp } from './school-time';
import type { AssignmentRubric, Grade, SubmittedWork } from './grading-api';
const mock = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock('@/lib/api-client', () => ({
  apiFetch: (p: string, ...a: unknown[]) =>
    p.startsWith('/v2/knowledge/')
      ? Promise.resolve({
          state: 'INSUFFICIENT_DATA',
          message: 'Chưa đủ dữ liệu',
          recommendations: [],
        })
      : p.startsWith('/v2/class-quiz/')
        ? Promise.resolve({ entries: [] })
        : mock.fetch(p, ...a),
  apiUrl: (p: string) => '/api' + p,
}));
beforeEach(() => {
  mock.fetch.mockReset();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const rubric: AssignmentRubric = {
  id: 'r',
  name: 'Published criteria',
  description: 'Rubric',
  version: 1,
  state: 'PUBLISHED',
  lockVersion: 1,
  approvedAt: '2026-10-31T00:00:00Z',
  criteria: [
    { id: 'c1', name: 'Task', description: 'Details', maxScore: '10.00' },
    { id: 'c2', name: 'Clarity', description: 'Clear communication', maxScore: '10.00' },
  ],
};
const grade: Grade = {
  id: 'g',
  submissionId: 's',
  number: 1,
  state: 'DRAFT',
  lockVersion: 2,
  reason: '',
  feedback: 'Teacher feedback',
  confirmedAt: null,
  publishedAt: null,
  rubric,
  scores: [
    { criterionId: 'c1', score: '0.00', feedback: 'Explicit zero' },
    { criterionId: 'c2', score: '10.00', feedback: '' },
  ],
  earned: '10.00',
  max: '20.00',
  percent: '50',
};
const submission: SubmittedWork = {
  id: 's',
  learnerName: 'Synthetic learner',
  text: 'Original answer',
  submittedAt: '2026-12-31T17:30:00Z',
  source: {
    id: 'source',
    title: 'Frozen assignment',
    introduction: '',
    contentMarkdown: 'Original prompt',
    version: 1,
  },
  file: null,
  grades: [],
};
function book() {
  return render(
    <MemoryRouter initialEntries={['/classroom/c/gradebook']}>
      <Routes>
        <Route path="/classroom/:classId/gradebook" element={<AssignmentGradebookPage />} />
      </Routes>
    </MemoryRouter>,
  );
}
function teacher() {
  return render(
    <MemoryRouter initialEntries={['/classroom/c/activities/a/grading']}>
      <Routes>
        <Route
          path="/classroom/:classId/activities/:activityId/grading"
          element={<AssignmentGradingPage />}
        />
      </Routes>
    </MemoryRouter>,
  );
}
describe('W03B-B real workflow UI boundaries', () => {
  it('pending publication displays status with no grade, zero, feedback or grade controls', async () => {
    mock.fetch.mockResolvedValue({
      entries: [
        {
          submissionId: 's',
          title: 'Frozen assignment',
          status: 'PENDING_PUBLICATION',
          result: null,
          history: [],
        },
      ],
    });
    book();
    await screen.findByText('Đang chờ học vụ công bố');
    expect(screen.queryByText('Teacher feedback')).not.toBeInTheDocument();
    expect(screen.queryByText('0.00 / 20.00')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /FINAL/ })).not.toBeInTheDocument();
  });
  it('published explicit zero is displayed, published history is separate and feedback is escaped', async () => {
    const published = {
      ...grade,
      state: 'PUBLISHED',
      number: 2,
      earned: '0.00',
      percent: '0',
      feedback: '<script>bad()</script>',
      reason: 'Corrected evidence',
      publishedAt: '2026-12-31T17:30:00Z',
    };
    mock.fetch.mockResolvedValue({
      entries: [
        {
          submissionId: 's',
          title: 'Frozen assignment',
          status: 'PUBLISHED',
          result: published,
          history: [
            published,
            { ...grade, state: 'PUBLISHED', number: 1, publishedAt: '2026-10-31T00:00:00Z' },
          ],
        },
      ],
    });
    const { container } = book();
    await screen.findByText('0.00 / 20.00 · 0%');
    expect(screen.getByText('<script>bad()</script>')).toBeInTheDocument();
    expect(container.querySelector('script')).toBeNull();
    expect(screen.getByText('Lịch sử điểm đã công bố')).toBeInTheDocument();
    expect(screen.getByText(/Lý do sửa: Corrected evidence/)).toBeInTheDocument();
  });
  it('gradebook clears formerly visible results when membership refresh fails', async () => {
    mock.fetch
      .mockResolvedValueOnce({
        entries: [
          {
            submissionId: 's',
            title: 'Frozen assignment',
            status: 'PUBLISHED',
            result: { ...grade, state: 'PUBLISHED' },
            history: [],
          },
        ],
      })
      .mockRejectedValueOnce(Error('403'));
    book();
    await screen.findByText('10.00 / 20.00 · 50%');
    fireEvent.click(screen.getByRole('button', { name: 'Tải lại bảng điểm' }));
    await screen.findByRole('alert');
    expect(screen.queryByText('10.00 / 20.00 · 50%')).not.toBeInTheDocument();
  });
  it('rubric draft uses actual editor; unpublished rubric never enables grade entry', async () => {
    mock.fetch.mockResolvedValue({ rubrics: [], submissions: [submission] });
    teacher();
    await screen.findByText('Soạn phiên bản rubric mới');
    expect(screen.getByLabelText('Tên tiêu chí 1')).toBeInTheDocument();
    expect(screen.getByText(/Chưa có rubric được học vụ phát hành/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Lưu bản chấm nháp' })).not.toBeInTheDocument();
  });
  it('blank criterion inputs are saved as missing, never inferred zero', async () => {
    mock.fetch
      .mockResolvedValueOnce({ rubrics: [rubric], submissions: [submission] })
      .mockRejectedValueOnce(Error('disk'));
    teacher();
    await screen.findByLabelText('Điểm Task');
    fireEvent.click(screen.getByRole('button', { name: 'Lưu bản chấm nháp' }));
    await screen.findByRole('alert');
    const b = JSON.parse(mock.fetch.mock.calls[1][1].body);
    expect(b.scores).toEqual([]);
    expect(b.rubricId).toBe('r');
    expect(b.idempotencyKey).toBeTruthy();
  });
  it('FINAL requires saved grade and evidence checkbox; failed CAS retains inputs and idempotent retry body', async () => {
    mock.fetch
      .mockResolvedValueOnce({
        rubrics: [rubric],
        submissions: [{ ...submission, grades: [grade] }],
      })
      .mockRejectedValue(Error('409'));
    teacher();
    await screen.findByLabelText('Điểm Task');
    const final = screen.getByRole('button', { name: 'Xác nhận REVIEWED_FINAL' });
    expect(final).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox'));
    expect(final).toBeEnabled();
    fireEvent.change(screen.getByLabelText('Điểm Task'), { target: { value: '3' } });
    expect(final).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Lưu bản chấm nháp' }));
    await screen.findByRole('alert');
    expect(screen.getByLabelText('Điểm Task')).toHaveValue(3);
    fireEvent.click(screen.getByRole('button', { name: 'Lưu bản chấm nháp' }));
    await waitFor(() => expect(mock.fetch).toHaveBeenCalledTimes(3));
    expect(mock.fetch.mock.calls[1][1].body).toBe(mock.fetch.mock.calls[2][1].body);
  });
  it('checker sees a real empty scope rather than publish controls', async () => {
    mock.fetch.mockResolvedValue({ classes: [], rubrics: [], grades: [], truncated: false });
    render(
      <MemoryRouter>
        <AssignmentCheckerPage />
      </MemoryRouter>,
    );
    await screen.findByText('Không có rubric chờ duyệt trong phạm vi.');
    expect(screen.queryByRole('button', { name: 'Duyệt và công bố điểm' })).not.toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Học vụ chấm bài' })).toBeInTheDocument();
  });
  it('maker checker button stays disabled even after confirmation checkbox', async () => {
    mock.fetch.mockResolvedValue({
      classes: [{ id: 'c', code: 'C', name: 'Class' }],
      rubrics: [
        { classId: 'c', activityId: 'a', canPublish: false, rubric: { ...rubric, state: 'DRAFT' } },
      ],
      grades: [],
      truncated: false,
    });
    render(
      <MemoryRouter>
        <AssignmentCheckerPage />
      </MemoryRouter>,
    );
    await screen.findByText('Không thể tự duyệt nội dung mình đã soạn hoặc chấm.');
    fireEvent.click(screen.getByRole('checkbox'));
    expect(screen.getByRole('button', { name: 'Duyệt và phát hành rubric' })).toBeDisabled();
  });
  it('receipt and grade timestamps use school timezone across UTC year boundary', () => {
    const s = schoolTimestamp('2026-12-31T17:30:00Z');
    expect(s).toContain('00:30:00');
    expect(s).toMatch(/1\/1\/27|01\/01\/2027/);
    expect(s).toContain('(giờ trung tâm)');
    expect(schoolTimestamp(null)).toBe('Chưa ghi nhận');
  });
});
