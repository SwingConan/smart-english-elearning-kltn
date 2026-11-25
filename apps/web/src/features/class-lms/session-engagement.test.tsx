import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionEngagementPanel, SessionEngagementReviewPage } from '@/pages/SessionEngagementPage';
const m = vi.hoisted(() => ({ fetch: vi.fn(), role: 'STUDENT' }));
vi.mock('@/lib/api-client', () => ({
  apiFetch: (...a: unknown[]) => m.fetch(...a),
  ApiError: class extends Error {
    status = 403;
  },
}));
vi.mock('@/features/auth/auth-context', () => ({
  useAuth: () => ({ user: { id: 'self', role: m.role } }),
}));
const view = {
  session: { id: 'session', classId: 'class', revision: 1 },
  permissions: {
    teacher: false,
    learner: true,
    meeting: false,
    attendance: false,
    schedule: false,
    inspector: false,
  },
  meetUrl: null,
  meetState: 'PENDING_APPROVAL',
  attendance: {
    configured: true,
    state: 'OPEN',
    serverTime: '2026-11-03T01:00:00Z',
    result: { status: 'NOT_RECORDED', version: 0, raw: null },
  },
};
beforeEach(() => {
  m.fetch.mockReset();
  m.role = 'STUDENT';
});
afterEach(cleanup);
describe('W06 real-backend contract UI', () => {
  it('future Meet preparer sees the proposal form but no teaching or attendance mutations', async () => {
    m.role = 'INSTRUCTOR';
    m.fetch.mockResolvedValue({...view, permissions:{...view.permissions,learner:false,meetPreparer:true},attendance:{...view.attendance,configured:false,state:'CLOSED'}});
    render(<MemoryRouter><SessionEngagementPanel sessionId="session" /></MemoryRouter>);
    expect(await screen.findByLabelText('Link Meet thủ công')).toBeInTheDocument();
    expect(screen.getByText(/Bạn được chuẩn bị link/)).toBeInTheDocument();
    expect(screen.queryByRole('button',{name:'Bật hoạt động điểm danh định kỳ'})).not.toBeInTheDocument();
    expect(screen.queryByRole('button',{name:'Tạo / xoay mã phiên'})).not.toBeInTheDocument();
    expect(m.fetch.mock.calls.every(call=>!call[1])).toBe(true);
  });
  it('Meet proposal validation rejects a foreign host even when form submission bypasses browser validation', async () => {
    m.role='INSTRUCTOR';
    m.fetch.mockResolvedValue({...view,permissions:{...view.permissions,learner:false,meetPreparer:true}});
    render(<MemoryRouter><SessionEngagementPanel sessionId="session" /></MemoryRouter>);
    const input=await screen.findByLabelText('Link Meet thủ công');
    fireEvent.change(input,{target:{value:'https://evil.invalid/abc-defg-hij'}});
    fireEvent.submit(input.closest('form')!);
    expect(await screen.findByRole('alert')).toHaveTextContent('Nhập link phòng dạng');
    expect(m.fetch.mock.calls.every(call=>!call[1])).toBe(true);
  });
  it('scoped reviewer sees the class and learner before deciding a correction', async () => {
    m.fetch.mockImplementation((p: string) =>
      Promise.resolve(
        p.endsWith('/reviews')
          ? {
              data: [
                {
                  sessionId: 's',
                  startsAt: '2026-11-03T01:00:00Z',
                  classOffering: { code: 'W06-CLASS', name: 'Synthetic class' },
                  meets: [],
                  corrections: [{ id: 'c' }],
                  exceptions: [],
                },
              ],
            }
          : {
              id: 'c',
              learner: { fullName: 'Synthetic learner' },
              reason: 'Evidence review',
              evidence: 'Private evidence',
              requestedStatus: 'LATE',
              beforeStatus: 'PRESENT',
              state: 'PENDING_APPROVAL',
            },
      ),
    );
    render(
      <MemoryRouter>
        <SessionEngagementReviewPage />
      </MemoryRouter>,
    );
    const open = await screen.findByRole('button', { name: 'Xem yêu cầu sửa điểm danh' });
    expect(screen.getByText(/W06-CLASS/)).toBeInTheDocument();
    fireEvent.click(open);
    expect(await screen.findByText('Học viên: Synthetic learner')).toBeInTheDocument();
  });
  it('open never sends check-in; pending URL absent, learner only own action', async () => {
    m.fetch.mockImplementation((p: string) =>
      Promise.resolve(p.endsWith('/history') ? { data: [] } : view),
    );
    render(
      <MemoryRouter>
        <SessionEngagementPanel sessionId="session" />
      </MemoryRouter>,
    );
    expect(await screen.findByText(/Kết quả: Chưa ghi nhận/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Vào Meet đã duyệt' })).not.toBeInTheDocument();
    expect(m.fetch.mock.calls.every((x) => !x[1])).toBe(true);
    expect(screen.queryByText('Đề xuất link Meet')).not.toBeInTheDocument();
  });
  it('retry retains exact key after lost response and never displays fake success', async () => {
    m.fetch.mockImplementation((p: string, init?: RequestInit) =>
      init
        ? Promise.reject(new Error('offline'))
        : Promise.resolve(p.endsWith('/history') ? { data: [] } : view),
    );
    render(
      <MemoryRouter>
        <SessionEngagementPanel sessionId="session" />
      </MemoryRouter>,
    );
    fireEvent.change(await screen.findByLabelText('Mã phiên của giảng viên'), {
      target: { value: 'ABCDEF1234567890ABCD' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi điểm danh' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Không lưu được');
    fireEvent.click(screen.getByRole('button', { name: 'Gửi điểm danh' }));
    await waitFor(() => expect(m.fetch.mock.calls.filter((x) => x[1]).length).toBe(2));
    const calls = m.fetch.mock.calls.filter((x) => x[1]);
    expect(calls[0][1].body).toBe(calls[1][1].body);
    expect(screen.queryByText('Server đã lưu biên nhận.')).not.toBeInTheDocument();
  });
  it('approved link is a safe external link and inspector has no mutation controls', async () => {
    m.role = 'TEACHING_INSPECTOR';
    m.fetch.mockResolvedValue({
      ...view,
      permissions: { teacher: false, learner: false, inspector: true },
      meetState: 'APPROVED',
      meetUrl: 'https://meet.google.com/abc-defg-hij',
    });
    render(
      <MemoryRouter>
        <SessionEngagementPanel sessionId="session" />
      </MemoryRouter>,
    );
    const a = await screen.findByRole('link', { name: 'Vào Meet đã duyệt' });
    expect(a).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.queryByRole('button', { name: 'Gửi điểm danh' })).not.toBeInTheDocument();
  });
  it('review list has no private link until scoped detail fetched', async () => {
    m.fetch.mockImplementation((p: string) =>
      Promise.resolve(
        p.endsWith('/reviews')
          ? {
              data: [
                {
                  sessionId: 's',
                  startsAt: '2026-11-03T01:00:00Z',
                  meets: [{ id: 'm' }],
                  corrections: [],
                  exceptions: [],
                },
              ],
            }
          : {
              id: 'm',
              reason: 'Synthetic reason',
              url: 'https://meet.google.com/abc-defg-hij',
              state: 'PENDING_APPROVAL',
            },
      ),
    );
    render(
      <MemoryRouter>
        <SessionEngagementReviewPage />
      </MemoryRouter>,
    );
    const open = await screen.findByRole('button', { name: 'Xem đề xuất Meet' });
    expect(screen.queryByText(/Link cần duyệt/)).not.toBeInTheDocument();
    fireEvent.click(open);
    expect(await screen.findByText(/Link cần duyệt/)).toBeInTheDocument();
    expect(m.fetch).toHaveBeenCalledWith('/v2/session-engagement/reviews/meet/m');
  });
});
