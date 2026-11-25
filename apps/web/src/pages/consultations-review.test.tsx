import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ConsultationReview, ConsultationsPage } from './ConsultationsPage';
import { MemoryRouter } from 'react-router';
const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock('@/features/auth/auth-context', () => ({
  useAuth: () => ({ user: { id: 'teacher', role: 'INSTRUCTOR', fullName: 'Synthetic teacher' } }),
}));
vi.mock('@/lib/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api-client')>()),
  apiFetch: mocks.fetch,
}));
afterEach(cleanup);
describe('CF01 independent review reason and decisions', () => {
  it('requires a meaningful per-request reason before an actual approval/rejection', () => {
    const send = vi.fn();
    render(
      <ConsultationReview
        kind="hồ sơ"
        version={2}
        id="r2"
        approve="PROFILE_APPROVE"
        reject="PROFILE_REJECT"
        busy={false}
        send={send}
      />,
    );
    const approve = screen.getByRole('button', { name: 'Phê duyệt hồ sơ' }),
      reject = screen.getByRole('button', { name: 'Từ chối hồ sơ' });
    expect(approve).toBeDisabled();
    expect(reject).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Lý do duyệt hoặc từ chối hồ sơ'), {
      target: { value: '  Căn cứ hồ sơ phiên bản hai đã được kiểm tra  ' },
    });
    fireEvent.click(approve);
    expect(send).toHaveBeenCalledWith('PROFILE_APPROVE', {
      id: 'r2',
      reason: 'Căn cứ hồ sơ phiên bản hai đã được kiểm tra',
    });
    fireEvent.click(reject);
    expect(send).toHaveBeenLastCalledWith('PROFILE_REJECT', {
      id: 'r2',
      reason: 'Căn cứ hồ sơ phiên bản hai đã được kiểm tra',
    });
  });
  it('blocks repeated decisions while the request is in flight', () => {
    render(
      <ConsultationReview
        kind="link tư vấn"
        id="l1"
        approve="LINK_APPROVE"
        reject="LINK_REJECT"
        busy
        send={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText('Lý do duyệt hoặc từ chối link tư vấn'), {
      target: { value: 'Independent link decision' },
    });
    expect(screen.getByRole('button', { name: 'Phê duyệt link tư vấn' })).toBeDisabled();
  });
});
describe('CF01 link review projection UI', () => {
  function screenFor(link: Record<string, unknown>) {
    mocks.fetch.mockImplementation((path: string) =>
      Promise.resolve(
        path.endsWith('/workspace')
          ? { profiles: [], availability: [], changes: [], links: [link] }
          : path.endsWith('/bookings')
            ? { data: [] }
            : [],
      ),
    );
    render(
      <MemoryRouter>
        <ConsultationsPage />
      </MemoryRouter>,
    );
  }
  it('shows the independent decision reason to the permitted author', async () => {
    screenFor({
      id: 'l1',
      bookingId: 'b1',
      state: 'REJECTED',
      url: 'https://meet.google.com/abc-defg-hij',
      linkClear: true,
      canReview: false,
      reviewReason: 'Cần kiểm tra nguồn link riêng.',
    });
    expect(
      await screen.findByText('Lý do quyết định: Cần kiểm tra nguồn link riêng.'),
    ).toBeInTheDocument();
  });
  it('shows a blocked status and no review action for a quarantined class collision', async () => {
    screenFor({
      id: 'l1',
      bookingId: 'b1',
      state: 'APPROVED',
      url: null,
      linkClear: false,
      canReview: false,
      reviewReason: null,
    });
    expect(
      await screen.findByText(
        'Link trùng tài nguyên lớp, đã chặn. Giảng viên cần đề xuất link riêng mới.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Phê duyệt link tư vấn' })).not.toBeInTheDocument();
  });
});
