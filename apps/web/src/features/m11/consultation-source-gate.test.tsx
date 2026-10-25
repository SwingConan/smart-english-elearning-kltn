import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { engagementApi } from '@/features/engagement/api';
import { InstructorConsultationsPage } from '@/pages/InstructorConsultationsPage';
import { StudentConsultationsPage } from '@/pages/StudentConsultationsPage';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('consultation source-gate fixes', () => {
  it('shows a truthful student error and never calls the legacy appointment fallback', async () => {
    vi.spyOn(engagementApi.consultations, 'studentThread').mockRejectedValue(new Error('offline'));
    const legacy = vi.spyOn(engagementApi.consultations, 'mine');

    render(
      <MemoryRouter initialEntries={['/student/enrollments/e1/consultations']}>
        <Routes>
          <Route
            path="/student/enrollments/:enrollmentId/consultations"
            element={<StudentConsultationsPage />}
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('Không thể tải trung tâm tư vấn');
    expect(legacy).not.toHaveBeenCalled();
    expect(document.body).not.toHaveTextContent('legacy');
  });

  it('shows a truthful instructor error and never builds a pseudo inbox', async () => {
    vi.spyOn(engagementApi.consultations, 'inbox').mockRejectedValue(new Error('offline'));
    const legacy = vi.spyOn(engagementApi.consultations, 'instructor');

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

    expect(await screen.findByRole('alert')).toHaveTextContent('Không thể tải hộp thư tư vấn');
    expect(legacy).not.toHaveBeenCalled();
    expect(document.body).not.toHaveTextContent('legacy');
  });

  it('renders every appointment status in natural Vietnamese without exposing raw enums', async () => {
    const statuses = ['REQUESTED', 'CONFIRMED', 'DECLINED', 'CANCELLED', 'COMPLETED'];
    vi.spyOn(engagementApi.consultations, 'inbox').mockResolvedValue([
      {
        enrollmentId: 'e1',
        status: 'ACTIVE',
        unreadCount: 0,
        learner: { id: 's1', fullName: 'Nguyễn An', email: 'an@example.com' },
        lastMessage: null,
        appointment: null,
      },
    ]);
    vi.spyOn(engagementApi.consultations, 'instructorThread').mockResolvedValue({
      id: 'thread-1',
      messages: [],
      appointments: statuses.map((status, index) => ({
        id: `appointment-${index}`,
        topic: `Lịch ${index + 1}`,
        status,
        requestedStartAt: `2026-11-0${index + 1}T03:00:00.000Z`,
        confirmedStartAt: status === 'CONFIRMED' ? `2026-11-0${index + 1}T04:00:00.000Z` : null,
        durationMinutes: 30,
        meetingUrl: null,
      })),
      enrollment: {
        id: 'e1',
        status: 'ACTIVE',
        learner: { id: 's1', fullName: 'Nguyễn An', email: 'an@example.com' },
      },
    });
    vi.spyOn(engagementApi.consultations, 'markInstructorRead').mockResolvedValue({ read: true });

    const view = render(
      <MemoryRouter initialEntries={['/instructor/classes/c1/consultations']}>
        <Routes>
          <Route
            path="/instructor/classes/:classOfferingId/consultations"
            element={<InstructorConsultationsPage />}
          />
        </Routes>
      </MemoryRouter>,
    );

    for (const label of ['Chờ xác nhận', 'Đã xác nhận', 'Đã từ chối', 'Đã hủy', 'Đã hoàn tất']) {
      expect(await screen.findByText(label)).toBeInTheDocument();
    }
    for (const status of statuses) expect(view.container).not.toHaveTextContent(status);
  });
});
