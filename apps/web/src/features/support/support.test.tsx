import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SupportHomePage, SupportTicketPage, SupportWorkspacePage } from '@/pages/SupportPage';
import { ApiError } from '@/lib/api-client';
const state = vi.hoisted(() => ({ user: null as null | { id: string; role: string } }));
const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), upload: vi.fn() }));
vi.mock('@/features/auth/auth-context', () => ({ useAuth: () => state }));
vi.mock('./support-api', () => ({
  supportBase: '/v2/support',
  supportGet: api.get,
  supportPost: api.post,
  supportUpload: api.upload,
}));
const topic = { id: 'topic', code: 'GENERAL', title: 'CSKH chung', version: 1 },
  detail = {
    id: 't',
    reference: 'SE-opaque',
    state: 'NEW',
    lockVersion: 0,
    topic: { ...topic, routes: [] },
    description: '<script>plain authored text</script>',
    messages: [],
    events: [],
    consents: [],
    referrals: [],
    applications: [],
  };
function page(path: string, element: React.ReactNode) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/support" element={element} />
        <Route path="/support/tickets/:ticketId" element={element} />
        <Route path="/workspace/support" element={element} />
      </Routes>
    </MemoryRouter>,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  state.user = null;
  api.get.mockImplementation((p: string) =>
    Promise.resolve(
      p === '/public/topics'
        ? { topics: [topic] }
        : p === '/availability'
          ? { canCreate: true, canReadOwnTickets: true, processingState: 'READY', consentVersion: 'DEV_SUPPORT_V1' }
        : p.startsWith('/tickets/')
          ? detail
          : { items: [] },
    ),
  );
});
afterEach(cleanup);
async function guestForm() {
  await screen.findByRole('option', { name: 'CSKH chung' });
  fireEvent.change(screen.getByLabelText('Tên liên hệ'), { target: { value: 'Synthetic Guest' } });
  fireEvent.change(screen.getByLabelText('Email liên hệ'), {
    target: { value: 'guest@example.invalid' },
  });
  fireEvent.change(screen.getByLabelText('Nội dung yêu cầu'), {
    target: { value: 'Need English course information' },
  });
  fireEvent.click(screen.getByRole('checkbox'));
}
describe('W05A real contract UI', () => {
  it('lost transfer ACK keeps a 404 private and gives bounded guidance without claiming success', async () => {
    state.user = { id: 'tv', role: 'COUNSELOR' };
    api.get.mockImplementation((p: string) =>
      Promise.resolve(
        p.endsWith('/assignable')
          ? { people: [{ id: 'next', fullName: 'Recipient', role: 'COUNSELOR' }] }
          : p.endsWith('/interests')
            ? { classes: [] }
            : p.startsWith('/tickets/')
              ? detail
              : { topics: [{ ...topic, caps: ['support.ticket.transfer'] }], items: [] },
      ),
    );
    api.post
      .mockRejectedValueOnce(new Error('Lost ACK'))
      .mockRejectedValueOnce(new ApiError(404, {}));
    page('/support/tickets/t', <SupportTicketPage />);
    await screen.findByLabelText('Người xử lý');
    fireEvent.change(screen.getByLabelText('Lý do thao tác'), {
      target: { value: 'Synthetic transfer reason' },
    });
    fireEvent.change(screen.getByLabelText('Người xử lý'), { target: { value: 'next' } });
    fireEvent.click(screen.getByRole('button', { name: 'Chuyển tư vấn viên' }));
    await screen.findByRole('button', { name: 'Thử lại đúng yêu cầu' });
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại đúng yêu cầu' }));
    await screen.findByText(/Lần chuyển trước có thể đã được lưu/);
    expect(api.post.mock.calls[1]).toEqual(api.post.mock.calls[0]);
    expect(screen.queryByRole('button', { name: 'Thử lại đúng yêu cầu' })).not.toBeInTheDocument();
    expect(api.get.mock.calls.filter(([p]) => p === '/tickets/t')).toHaveLength(1);
  });
  it('guest receipt has no private tracking link or claimed verification/delivery', async () => {
    api.post.mockResolvedValue({ reference: 'SE-opaque-guest' });
    page('/support', <SupportHomePage />);
    await guestForm();
    fireEvent.click(screen.getByRole('button', { name: 'Gửi phiếu CSKH' }));
    await screen.findByText('Đã nhận phiếu');
    expect(screen.queryByRole('link', { name: 'Xem phiếu của tôi' })).not.toBeInTheDocument();
    expect(screen.getByText(/Liên hệ chưa được xác minh/)).toBeVisible();
    expect(api.post.mock.calls[0][1]).not.toHaveProperty('userId');
  });
  it('lost ACK retries identical intake UUID/body and locks original fields', async () => {
    api.post
      .mockRejectedValueOnce(new TypeError('network failure'))
      .mockResolvedValue({ reference: 'SE-replayed' });
    page('/support', <SupportHomePage />);
    await guestForm();
    fireEvent.click(screen.getByRole('button', { name: 'Gửi phiếu CSKH' }));
    await screen.findByRole('button', { name: 'Thử lại đúng yêu cầu' });
    expect(screen.getByLabelText('Nội dung yêu cầu')).toBeDisabled();
    const original = api.post.mock.calls[0][1];
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại đúng yêu cầu' }));
    await screen.findByText('Đã nhận phiếu');
    expect(api.post.mock.calls[1][1]).toEqual(original);
  });
  it('signed-in learner payload relies on session and never sends spoof contact/user ID', async () => {
    state.user = { id: 'actual', role: 'STUDENT' };
    api.post.mockResolvedValue({ reference: 'SE-owned', id: 't' });
    page('/support', <SupportHomePage />);
    await screen.findByRole('option', { name: 'CSKH chung' });
    expect(screen.queryByLabelText('Email liên hệ')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Nội dung yêu cầu'), {
      target: { value: 'Need account access help' },
    });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Gửi yêu cầu' }));
    await screen.findByRole('link', { name: 'Xem phiếu và phản hồi' });
    expect(api.post.mock.calls[0][1]).toMatchObject({ contactMethod: 'IN_APP' });
    expect(api.post.mock.calls[0][1]).not.toHaveProperty('userId');
  });
  it('staff cannot use learner intake UI to impersonate an applicant', async () => {
    state.user = { id: 'tv', role: 'COUNSELOR' };
    page('/support', <SupportHomePage />);
    expect(await screen.findByRole('link', { name: 'Mở không gian quản lý CSKH' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Gửi phiếu CSKH' })).not.toBeInTheDocument();
  });
  it('owner ticket renders HTML as text; no internal note chooser, staff identity or Enrollment action', async () => {
    state.user = { id: 'hv', role: 'STUDENT' };
    page('/support/tickets/t', <SupportTicketPage />);
    await screen.findByText('<script>plain authored text</script>');
    expect(document.querySelector('script')).toBeNull();
    expect(screen.queryByLabelText('Phạm vi nội dung')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Đồng ý lập hồ sơ' })).not.toBeInTheDocument();
    expect(screen.queryByText('Gửi bản hồ sơ đã chốt đến học vụ')).not.toBeInTheDocument();
    expect(screen.queryByText('Hồ sơ tư vấn tuyển sinh')).not.toBeInTheDocument();
  });
  it('foreign ticket error reveals no cached private detail', async () => {
    state.user = { id: 'foreign', role: 'STUDENT' };
    api.get.mockRejectedValue(new ApiError(404, {}));
    page('/support/tickets/t', <SupportTicketPage />);
    await screen.findByRole('alert');
    expect(screen.queryByText(detail.description)).not.toBeInTheDocument();
  });
  it('counselor workspace sidebar uses DB summaries/filters and no fabricated unread count', async () => {
    state.user = { id: 'tv', role: 'COUNSELOR' };
    api.get.mockImplementation((p: string) =>
      Promise.resolve(
        p === '/config'
          ? {
              role: 'COUNSELOR',
              topics: [topic],
              taxonomy: [],
              taxonomyAuthor: false,
              taxonomyApprove: false,
            }
          : { items: [] },
      ),
    );
    page('/workspace/support', <SupportWorkspacePage />);
    await screen.findByRole('heading', { name: 'Hộp phiếu CSKH' });
    expect(screen.getByRole('heading', { name: 'Hàng đợi xử lý phiếu hỗ trợ học viên' })).toBeVisible();
    expect(screen.getByLabelText('Lọc trạng thái')).toBeVisible();
    expect(screen.getByText('Chưa có phiếu trong phạm vi được phép.')).toBeVisible();
    expect(screen.queryByText(/chưa đọc/i)).not.toBeInTheDocument();
  });
  it('409 keeps authored reply and requires explicit reload without silently replaying a stale command', async () => {
    state.user = { id: 'hv', role: 'STUDENT' };
    api.post.mockRejectedValue(new ApiError(409, {}));
    page('/support/tickets/t', <SupportTicketPage />);
    await screen.findByLabelText('Nội dung phản hồi');
    fireEvent.change(screen.getByLabelText('Lý do thao tác'), {
      target: { value: 'Reason for original reply' },
    });
    fireEvent.change(screen.getByLabelText('Nội dung phản hồi'), {
      target: { value: 'Unsaved learner response' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu phản hồi' }));
    await screen.findByRole('alert');
    expect(screen.getByLabelText('Nội dung phản hồi')).toHaveValue('Unsaved learner response');
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Tải lại trạng thái' })).toBeEnabled();
  });
  it('distinguishes waiting-acceptance from accepted and allows selecting/removing attachments before submit', async () => {
    state.user = { id: 'actual', role: 'STUDENT' };
    api.get.mockImplementation((p: string) =>
      Promise.resolve(
        p === '/public/topics'
          ? { topics: [topic] }
          : p === '/availability'
            ? { canCreate: true, canReadOwnTickets: true, processingState: 'READY', consentVersion: 'DEV_SUPPORT_V1' }
            : {
                items: [
                  { id: 't1', reference: 'SE-1', state: 'NEW', assigned: false, lockVersion: 0, topic: { title: 'CSKH chung' } },
                  { id: 't2', reference: 'SE-2', state: 'NEW', assigned: true, lockVersion: 1, topic: { title: 'CSKH chung' } },
                  { id: 't3', reference: 'SE-3', state: 'IN_PROGRESS', assigned: true, lockVersion: 2, topic: { title: 'CSKH chung' } },
                ],
              },
      ),
    );
    api.post.mockResolvedValue({ reference: 'SE-with-file', id: 't-new' });
    api.upload.mockResolvedValue({ attachments: [{ id: 'att-1' }] });
    page('/support', <SupportHomePage />);
    await screen.findByText('Đã gửi / Chờ nhân viên tiếp nhận');
    expect(screen.getByText('Đã tiếp nhận')).toBeVisible();
    expect(screen.getByText('Đang xử lý')).toBeVisible();

    const fileInput = screen.getByLabelText('Chọn tệp đính kèm phiếu tư vấn');
    const pngFile = new File([new Uint8Array([137, 80, 78, 71])], 'screen.png', { type: 'image/png' });
    const pdfFile = new File([new Uint8Array([37, 80, 68, 70, 45])], 'doc.pdf', { type: 'application/pdf' });
    fireEvent.change(fileInput, { target: { files: [pngFile, pdfFile] } });
    await screen.findByText('screen.png');
    fireEvent.click(screen.getByRole('button', { name: 'Xóa tệp screen.png' }));
    expect(screen.queryByText('screen.png')).not.toBeInTheDocument();
    expect(screen.getByText('doc.pdf')).toBeVisible();

    fireEvent.change(screen.getByLabelText('Nội dung yêu cầu'), {
      target: { value: 'Yêu cầu hỗ trợ có tệp đính kèm PDF' },
    });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Gửi yêu cầu' }));
    await screen.findByText(/Đã lưu kèm 1 tệp đính kèm/);
    expect(api.upload).toHaveBeenCalledWith('/tickets/t-new/attachments', [pdfFile]);
  });
  it('Q06 counselor sees technical escalation panel, submits technical escalation, and never sees enrollment application UI', async () => {
    state.user = { id: 'tv', role: 'COUNSELOR' };
    api.get.mockImplementation((p: string) =>
      Promise.resolve(
        p === '/tickets/t1'
          ? {
              ...detail,
              id: 't1',
              state: 'IN_PROGRESS',
              assigned: true,
              topic: { id: 'top1', code: 'LMS_TECHNICAL_SUPPORT', title: 'Hỗ trợ LMS', routes: ['LEARNING'] },
              identity: { learnerId: 'u1', learnerEmail: 'student@gmail.com', guestName: null, claimedContact: null, contactVerified: true, contactBasis: 'SESSION' },
              technicalEscalations: [],
            }
          : p === '/config'
            ? {
                role: 'COUNSELOR',
                topics: [
                  {
                    id: 'top1',
                    code: 'LMS_TECHNICAL_SUPPORT',
                    title: 'Hỗ trợ LMS',
                    routes: ['LEARNING'],
                    caps: ['support.ticket.read', 'support.ticket.reply', 'support.ticket.transfer', 'support.ticket.close'],
                  },
                ],
                taxonomy: [],
                taxonomyAuthor: false,
                taxonomyApprove: false,
              }
            : { people: [], admins: [{ id: 'adm1', fullName: 'Quản trị viên', role: 'SYSTEM_ADMIN', email: 'admin@gmail.com' }] },
      ),
    );
    api.post.mockResolvedValue({ id: 'esc1', ticketId: 't1', state: 'WAITING_SPECIALIST', lockVersion: 2 });
    page('/support/tickets/t1', <SupportTicketPage />);
    await screen.findByText('Chuyển sự cố kỹ thuật cho Quản trị hệ thống');
    expect(screen.queryByText('Hồ sơ tư vấn tuyển sinh')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Lý do thao tác'), {
      target: { value: 'Lý do chuyển sự cố kỹ thuật cho QT kiểm tra' },
    });
    fireEvent.change(screen.getByLabelText('Đường dẫn gặp lỗi'), {
      target: { value: '/learn/classes/cls-1' },
    });
    fireEvent.change(screen.getByLabelText('Mô tả kỹ thuật gửi Quản trị hệ thống'), {
      target: { value: 'Học viên gặp lỗi HTTP 500 khi bấm nộp bài tập LMS' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Chuyển Quản trị hệ thống kiểm tra kỹ thuật' }));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        '/tickets/t1/technical-escalations',
        expect.objectContaining({
          incidentCategory: 'LMS_SUBMISSION_ERROR',
          affectedRoute: '/learn/classes/cls-1',
          affectedAccountEmail: 'student@gmail.com',
          summary: 'Học viên gặp lỗi HTTP 500 khi bấm nộp bài tập LMS',
        }),
      ),
    );
  });
});
