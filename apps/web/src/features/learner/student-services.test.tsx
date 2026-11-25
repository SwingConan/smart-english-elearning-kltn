import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { StudentSupportPage } from './StudentSupportPage';
import { StudentConsultationsPage } from './StudentConsultationsPage';
import { PlacementIntegrationPage } from '@/pages/PlacementIntegrationPage';
const mock = vi.hoisted(() => ({ fetch: vi.fn(), post: vi.fn(), get: vi.fn() }));
vi.mock('@/lib/api-client', async (original) => ({
  ...(await original<typeof import('@/lib/api-client')>()),
  apiFetch: mock.fetch,
}));
vi.mock('@/features/support/support-api', () => ({ supportGet: mock.get, supportPost: mock.post }));
vi.mock('@/features/auth/auth-context', () => ({
  useAuth: () => ({ user: { id: 'student', role: 'STUDENT' } }),
}));
function show(element: React.ReactNode) {
  return render(<MemoryRouter>{element}</MemoryRouter>);
}
beforeEach(() => {
  vi.resetAllMocks();
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});
afterEach(cleanup);
it('lets an authenticated learner send in-app without spoofed identity despite expired staff handling authority', async () => {
  mock.get.mockImplementation((p: string) =>
    Promise.resolve(
      p === '/public/topics'
        ? { topics: [{ id: 'topic', title: 'Học tập' }] }
        : p === '/availability'
          ? {
              canCreate: true,
              canReadOwnTickets: true,
              processingState: 'STAFF_PERMISSION_EXPIRED',
              consentVersion: 'DEV_SUPPORT_V1',
            }
          : { items: [] },
    ),
  );
  mock.post.mockResolvedValue({ id: 'owned-ticket', reference: 'SE-owned' });
  show(<StudentSupportPage />);
  fireEvent.change(await screen.findByLabelText('Nội dung yêu cầu'), {
    target: { value: 'Tôi cần hướng dẫn mở tài liệu của lớp.' },
  });
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: 'Gửi yêu cầu' }));
  await screen.findByText('Đã tiếp nhận yêu cầu của bạn');
  expect(mock.post).toHaveBeenCalledWith(
    '/public/tickets',
    expect.objectContaining({
      topicId: 'topic',
      contactMethod: 'IN_APP',
      description: 'Tôi cần hướng dẫn mở tài liệu của lớp.',
    }),
  );
  expect(mock.post.mock.calls[0][1]).not.toHaveProperty('learnerId');
  expect(mock.post.mock.calls[0][1]).not.toHaveProperty('contact');
});
it('does not hide owned tickets when no topic has approval', async () => {
  mock.get.mockImplementation((p: string) =>
    Promise.resolve(
      p === '/public/topics'
        ? { topics: [] }
        : p === '/availability'
          ? {
              canCreate: false,
              reason: 'NO_APPROVED_TOPIC',
              processingState: 'STAFF_ASSIGNMENT_REQUIRED',
            }
          : {
              items: [
                {
                  id: 'mine',
                  reference: 'SE-owned',
                  state: 'NEW',
                  topic: { title: 'Phiếu đã gửi' },
                },
              ],
            },
    ),
  );
  show(<StudentSupportPage />);
  expect(await screen.findByText('Chưa có chủ đề hỗ trợ được mở')).toBeVisible();
  expect(await screen.findByText('Phiếu đã gửi')).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Gửi yêu cầu' })).not.toBeInTheDocument();
});
it('keeps consultation reasons in a modal and hides absence until authorised by server', async () => {
  mock.fetch.mockImplementation((p: string) =>
    Promise.resolve(
      p.endsWith('/profiles')
        ? []
        : {
            serverTime: '2026-11-13T10:00:00Z',
            data: [
              {
                id: 'booking',
                teacherId: 'teacher',
                displayName: 'Giảng viên',
                state: 'CONFIRMED',
                startsAt: '2026-11-15T03:00:00Z',
                endsAt: '2026-11-15T03:30:00Z',
                version: 2,
                actions: {
                  cancel: true,
                  reschedule: true,
                  reportAbsence: false,
                  disputableReportIds: [],
                },
              },
            ],
          },
    ),
  );
  show(<StudentConsultationsPage />);
  const cancel = await screen.findByRole('button', { name: 'Hủy lịch' });
  expect(screen.queryByLabelText('Lý do')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Báo vắng' })).not.toBeInTheDocument();
  fireEvent.click(cancel);
  expect(within(screen.getByRole('dialog')).getByLabelText('Lý do')).toBeVisible();
  expect(
    within(screen.getByRole('dialog')).getByRole('button', { name: 'Xác nhận hủy' }),
  ).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Quay lại' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(mock.fetch.mock.calls.some((c) => c[0].endsWith('/commands'))).toBe(false);
});
it('keeps class tests out of placement and keeps the official unapproved assessment closed', async () => {
  mock.fetch.mockImplementation((p: string) =>
    Promise.resolve(
      p === '/v2/placement/config'
        ? { fullExamEnabled: false, workflowEnabled: false, previewEnabled: false, sources: [] }
        : p === '/v2/placement/history'
          ? []
          : [],
    ),
  );
  show(<PlacementIntegrationPage />);
  expect(
    await screen.findByText(/Bài kiểm tra đầu vào chính thức hiện chưa mở/),
  ).toBeVisible();
  expect(
    screen.getByRole('button', { name: 'Bài kiểm tra chính thức chưa mở' }),
  ).toBeDisabled();
  expect(mock.fetch).not.toHaveBeenCalledWith('/enrollments/my', expect.anything());
  expect(mock.fetch).not.toHaveBeenCalledWith(
    '/learning/enrollments/unpaid/tests',
    expect.anything(),
  );
  expect(screen.queryByText('W04B')).not.toBeInTheDocument();
  expect(mock.fetch.mock.calls.every((c) => !c[0].includes('/start'))).toBe(true);
});

it('lets learner pick mentor card, day/time slot pill, topic chip, and submit consultation booking', async () => {
  mock.fetch.mockImplementation((p: string) => {
    if (p.endsWith('/profiles')) {
      return Promise.resolve([
        {
          id: 'p1',
          teacherId: 'teacher-1',
          displayName: 'ThS. Nguyễn Thu Hà',
          specialties: 'TOEIC 550–750+ · Reading Part 5–7',
          bio: 'Giảng viên phụ trách lớp TOEIC.',
        },
      ]);
    }
    if (p.includes('/slots?teacherId=teacher-1')) {
      return Promise.resolve([
        { startsAt: '2026-11-20T02:00:00.000Z', endsAt: '2026-11-20T02:30:00.000Z' },
        { startsAt: '2026-11-20T07:30:00.000Z', endsAt: '2026-11-20T08:00:00.000Z' },
      ]);
    }
    if (p.endsWith('/commands')) {
      return Promise.resolve({ id: 'booking-new' });
    }
    return Promise.resolve({
      serverTime: '2026-11-15T02:00:00.000Z',
      data: [
        {
          id: 'live-b',
          teacherId: 'teacher-1',
          displayName: 'ThS. Nguyễn Thu Hà',
          state: 'CONFIRMED',
          startsAt: '2026-11-15T01:45:00.000Z',
          endsAt: '2026-11-15T02:15:00.000Z',
          joinUrl: 'https://meet.google.com/stu-vxyz-klm',
          version: 2,
          actions: { cancel: false, reschedule: false, reportAbsence: false, disputableReportIds: [] },
        },
        {
          id: 'old-b',
          teacherId: 'teacher-1',
          displayName: 'Giảng viên cũ',
          state: 'CANCELLED',
          startsAt: '2026-11-10T02:00:00.000Z',
          endsAt: '2026-11-10T02:30:00.000Z',
          version: 1,
          actions: { cancel: false, reschedule: false, reportAbsence: false, disputableReportIds: [] },
        },
      ],
    });
  });

  show(<StudentConsultationsPage />);
  expect(await screen.findByRole('link', { name: 'Vào Meet' })).toHaveAttribute(
    'href',
    'https://meet.google.com/stu-vxyz-klm',
  );

  fireEvent.click(screen.getByRole('button', { name: /ThS\. Nguyễn Thu Hà/i }));
  const slotBtn = await screen.findByRole('button', { name: '09:00' });
  fireEvent.click(slotBtn);
  expect(screen.getByLabelText('Thời gian tư vấn')).toHaveValue('2026-11-20T02:00:00.000Z');

  fireEvent.click(
    screen.getByRole('button', {
      name: /Tư vấn lộ trình tăng điểm Listening Part 1–4/i,
    }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Gửi yêu cầu đặt lịch' }));

  await waitFor(() =>
    expect(mock.fetch).toHaveBeenCalledWith(
      '/v2/consultations/commands',
      expect.objectContaining({ method: 'POST' }),
    ),
  );
  expect(await screen.findByText(/Đã lưu thao tác/)).toBeVisible();

  fireEvent.click(screen.getByRole('button', { name: /Lịch sử \(1\)/ }));
  expect(await screen.findByText('Giảng viên cũ')).toBeVisible();
});
