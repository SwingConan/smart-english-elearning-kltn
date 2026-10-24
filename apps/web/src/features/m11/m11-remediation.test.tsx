import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { engagementApi } from '@/features/engagement/api';
import { paymentApi } from '@/features/payments/api';
import { reportApi } from '@/features/reports/api';
import { rubricApi } from '@/features/rubrics/api';
import { ApiError } from '@/lib/api-client';
import { AdminPaymentsPage } from '@/pages/AdminPaymentsPage';
import { InstructorConsultationsPage } from '@/pages/InstructorConsultationsPage';
import { InstructorRubricsPage } from '@/pages/InstructorRubricsPage';
import { LearningReportPage } from '@/pages/LearningReportPage';
import { StudentConsultationsPage } from '@/pages/StudentConsultationsPage';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('M11 Source Gate R1 Web remediation', () => {
  it('shows final, pending and missing skill data without coercing missing values to zero', async () => {
    vi.spyOn(reportApi, 'get').mockResolvedValue({
      enrollment: {
        id: 'e1',
        status: 'ACTIVE',
        classOffering: { id: 'c1', name: 'Lớp A', code: 'A1' },
        course: { id: 'course', title: 'TOEIC' },
      },
      modules: [
        {
          id: 'm1',
          title: 'Module 1',
          orderIndex: 0,
          lessons: [{ id: 'l1', title: 'Lesson 1', orderIndex: 0, status: 'COMPLETED' }],
        },
      ],
      assessments: [
        {
          id: 'a1',
          status: 'SUBMITTED',
          score: 82,
          maxScore: 100,
          startedAt: '2026-10-20T00:00:00Z',
          submittedAt: '2026-10-20T01:00:00Z',
          resultState: 'FINAL',
          test: { id: 't1', title: 'Bài cuối kỳ', purpose: 'IN_CLASS' },
          classAssessment: { id: 'ca1', stage: 'FINAL' },
          skillScores: [
            { skill: 'LISTENING', normalizedScore: 75, status: 'FINAL', source: 'OBJECTIVE_AUTO' },
          ],
        },
        {
          id: 'a2',
          status: 'SUBMITTED',
          startedAt: '2026-10-21T00:00:00Z',
          submittedAt: '2026-10-21T01:00:00Z',
          resultState: 'PENDING_REVIEW',
          test: { id: 't2', title: 'Bài nói', purpose: 'IN_CLASS' },
          classAssessment: { id: 'ca2', stage: 'PERIODIC' },
          skillScores: [
            {
              skill: 'SPEAKING',
              normalizedScore: null,
              status: 'PROVISIONAL',
              source: 'AI_ESTIMATE',
            },
          ],
        },
      ],
      skillTrend: [
        {
          attemptId: 'a1',
          submittedAt: '2026-10-20T01:00:00Z',
          skill: 'LISTENING',
          normalizedScore: 75,
          status: 'FINAL',
          source: 'OBJECTIVE_AUTO',
        },
        {
          attemptId: 'a2',
          submittedAt: '2026-10-21T01:00:00Z',
          skill: 'SPEAKING',
          normalizedScore: null,
          status: 'PROVISIONAL',
          source: 'AI_ESTIMATE',
        },
      ],
      attendance: {
        totalSessions: 2,
        markedSessions: 1,
        attendedSessions: 1,
        coverageComplete: false,
        percent: 100,
      },
      completion: {
        eligible: false,
        unmet: ['ATTENDANCE_UNMARKED', 'FINAL_ASSESSMENT_INCOMPLETE_OR_PENDING'],
        policy: {
          minLessonCompletionPercent: 100,
          minAttendancePercent: 80,
          requireFinalAssessment: true,
        },
        evidence: {
          lesson: { total: 1, completed: 1, percent: 100 },
          attendance: {
            totalSessions: 2,
            markedSessions: 1,
            attendedSessions: 1,
            coverageComplete: false,
            percent: 100,
          },
          finalAssessment: { activeCount: 1, satisfied: false },
        },
      },
      recommendations: [],
    } as never);
    render(
      <MemoryRouter initialEntries={['/student/enrollments/e1/report']}>
        <Routes>
          <Route
            path="/student/enrollments/:enrollmentId/report"
            element={<LearningReportPage />}
          />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByText('Điểm cuối cùng: 82/100')).toBeInTheDocument();
    expect(screen.getAllByText('Đang chờ duyệt').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Chưa có dữ liệu').length).toBeGreaterThan(0);
    expect(screen.queryByText(/^0%$/)).not.toBeInTheDocument();
    expect(screen.getByText('Vẫn còn buổi học chưa được điểm danh.')).toBeInTheDocument();
    expect(
      screen.getByText('Bài cuối khóa chưa hoàn tất hoặc đang chờ duyệt.'),
    ).toBeInTheDocument();
  });

  it('creates a custom multi-criterion rubric and presents assigned-edit recovery', async () => {
    const own = {
      id: 'r1',
      name: 'Rubric của tôi',
      description: '',
      isActive: true,
      createdById: 'i1',
      criteria: [{ code: 'A', name: 'A', maxScore: 10, weight: 1 }],
    };
    const legacy = { ...own, id: 'legacy', name: 'Rubric hệ thống', createdById: null };
    vi.spyOn(rubricApi, 'list').mockResolvedValue([own, legacy]);
    const create = vi.spyOn(rubricApi, 'create').mockResolvedValue(own);
    vi.spyOn(rubricApi, 'get').mockResolvedValue({ ...own, canEdit: true });
    vi.spyOn(rubricApi, 'update').mockRejectedValue(new ApiError(409, null));
    const deactivate = vi
      .spyOn(rubricApi, 'deactivate')
      .mockResolvedValue({ ...own, isActive: false });
    render(<InstructorRubricsPage />);
    await screen.findByText(/Rubric hệ thống, chỉ đọc/);
    fireEvent.change(screen.getByLabelText('Tên rubric'), {
      target: { value: 'Rubric hai tiêu chí' },
    });
    fireEvent.change(screen.getByLabelText('Mã tiêu chí 1'), { target: { value: 'CONTENT' } });
    fireEvent.change(screen.getByLabelText('Tên tiêu chí 1'), { target: { value: 'Nội dung' } });
    fireEvent.click(screen.getByRole('button', { name: 'Thêm tiêu chí' }));
    fireEvent.change(screen.getByLabelText('Mã tiêu chí 2'), { target: { value: 'CLARITY' } });
    fireEvent.change(screen.getByLabelText('Tên tiêu chí 2'), { target: { value: 'Rõ ràng' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Tạo rubric' }).closest('form')!);
    await waitFor(() => expect(create).toHaveBeenCalled());
    expect(create.mock.calls[0]![0].criteria).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Ngừng dùng' }));
    await waitFor(() => expect(deactivate).toHaveBeenCalledWith('r1'));
    fireEvent.click(screen.getByRole('button', { name: 'Chỉnh sửa' }));
    await screen.findByDisplayValue('Rubric của tôi');
    fireEvent.submit(screen.getByRole('button', { name: 'Lưu rubric' }).closest('form')!);
    expect(await screen.findByRole('alert')).toHaveTextContent('Hãy tạo rubric mới');
  });

  it('supports complete student and instructor consultation workflows without exposing private notes', async () => {
    const confirmed = {
      id: 'confirmed',
      topic: 'Lộ trình',
      status: 'CONFIRMED',
      requestedStartAt: '2026-11-01T03:00:00Z',
      confirmedStartAt: '2026-11-01T04:00:00Z',
      durationMinutes: 30,
      meetingUrl: 'https://meet.example.com/a',
      learnerNote: 'Cần tư vấn kỹ năng nói',
    };
    vi.spyOn(engagementApi.consultations, 'mine').mockResolvedValue([confirmed]);
    const create = vi.spyOn(engagementApi.consultations, 'create').mockResolvedValue(confirmed);
    const cancel = vi
      .spyOn(engagementApi.consultations, 'cancel')
      .mockResolvedValue({ ...confirmed, status: 'CANCELLED' });
    const student = render(
      <MemoryRouter initialEntries={['/student/enrollments/e1/consultations']}>
        <Routes>
          <Route
            path="/student/enrollments/:enrollmentId/consultations"
            element={<StudentConsultationsPage />}
          />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByRole('link', { name: 'Mở phòng tư vấn' })).toHaveAttribute(
      'href',
      confirmed.meetingUrl,
    );
    expect(student.container).not.toHaveTextContent('Ghi chú riêng');
    fireEvent.change(screen.getByLabelText('Chủ đề'), { target: { value: 'Kế hoạch mới' } });
    fireEvent.change(screen.getByLabelText('Thời gian mong muốn'), {
      target: { value: '2026-12-01T10:00' },
    });
    fireEvent.change(screen.getByLabelText('Thời lượng'), { target: { value: '45' } });
    fireEvent.change(screen.getByLabelText(/Ghi chú cho giảng viên/), {
      target: { value: 'Ghi chú học viên' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi yêu cầu' }));
    await waitFor(() =>
      expect(create).toHaveBeenCalledWith(
        'e1',
        expect.objectContaining({ durationMinutes: 45, learnerNote: 'Ghi chú học viên' }),
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Hủy yêu cầu' }));
    await waitFor(() => expect(cancel).toHaveBeenCalledWith('e1', 'confirmed'));
    student.unmount();

    const requested = {
      ...confirmed,
      id: 'requested',
      status: 'REQUESTED',
      confirmedStartAt: null,
      meetingUrl: null,
      instructorNote: 'Ghi chú riêng',
      enrollment: { learner: { fullName: 'Nguyễn An', email: 'a@example.com' } },
    };
    vi.spyOn(engagementApi.consultations, 'instructor').mockResolvedValue([
      requested,
      { ...confirmed, instructorNote: 'Ghi chú riêng', enrollment: requested.enrollment },
    ]);
    const update = vi.spyOn(engagementApi.consultations, 'update').mockResolvedValue(confirmed);
    render(
      <MemoryRouter initialEntries={['/instructor/classes/c1/consultations']}>
        <Routes>
          <Route
            path="/instructor/classes/:classOfferingId/consultations"
            element={<InstructorConsultationsPage />}
          />
        </Routes>
      </MemoryRouter>,
    );
    await screen.findByText('Yêu cầu mới');
    fireEvent.change(screen.getByLabelText('Lý do từ chối'), {
      target: { value: 'Không còn khung giờ phù hợp' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Từ chối' }));
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith(
        'c1',
        'requested',
        expect.objectContaining({
          status: 'DECLINED',
          declineReason: 'Không còn khung giờ phù hợp',
        }),
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Lưu lịch mới' }));
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith(
        'c1',
        'confirmed',
        expect.objectContaining({ status: 'CONFIRMED' }),
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Đánh dấu hoàn tất' }));
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith(
        'c1',
        'confirmed',
        expect.objectContaining({ status: 'COMPLETED' }),
      ),
    );
  });

  it('requires a real admin-entered payment rejection reason', async () => {
    const payment = {
      id: 'p1',
      status: 'SUBMITTED',
      amountVnd: 900000,
      referenceCode: 'SE-1',
      payerReference: 'VCB-1',
      createdAt: '2026-10-24T00:00:00Z',
      enrollment: { learner: { fullName: 'Nguyễn An', email: 'a@example.com' } },
    };
    vi.spyOn(paymentApi, 'admin').mockResolvedValue({ data: [payment] });
    const reject = vi
      .spyOn(paymentApi, 'reject')
      .mockResolvedValue({ ...payment, status: 'REJECTED', adminNote: 'Không tìm thấy giao dịch' });
    render(<AdminPaymentsPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Từ chối' }));
    expect(screen.getByRole('button', { name: 'Xác nhận từ chối' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Lý do từ chối'), {
      target: { value: 'Không tìm thấy giao dịch' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận từ chối' }));
    await waitFor(() => expect(reject).toHaveBeenCalledWith('p1', 'Không tìm thấy giao dịch'));
  });
});
