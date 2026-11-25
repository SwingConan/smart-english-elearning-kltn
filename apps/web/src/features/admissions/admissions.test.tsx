import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdmissionDetailPage, AdmissionsPage } from '@/pages/AdmissionsFinancePage';
import { EnrollmentAction } from '@/features/enrollments/EnrollmentAction';
const m = vi.hoisted(() => ({ fetch: vi.fn(), role: 'STUDENT' }));
vi.mock('@/lib/api-client', () => ({
  apiFetch: (...args: unknown[]) => m.fetch(...args),
  apiUrl: (p: string) => '/api' + p,
  ApiError: class extends Error {
    status = 409;
  },
}));
vi.mock('@/features/auth/auth-context', () => ({
  useAuth: () => ({ user: { id: 'self', role: m.role }, isLoading: false, refreshUser: vi.fn() }),
}));
const view = {
  synthetic: true,
  application: {
    id: 'a',
    state: 'APPROVED',
    number: 1,
    lockVersion: 1,
    amountVnd: 1000000,
    termsTitle: 'Known approved terms',
    versionNumber: 1,
  },
  class: { id: 'c', code: 'W07-C', name: 'Synthetic paid class' },
  learner: { fullName: 'Synthetic learner' },
  permissions: {
    own: true,
    academic: false,
    finance: false,
    verify: false,
    proposeAdjustment: false,
    checkAdjustment: false,
  },
  obligation: {
    id: 'fee',
    dueVnd: 1000000,
    paidVnd: 400000,
    remainingVnd: 600000,
    creditPendingVnd: '0',
    state: 'PARTIAL_TEST',
    dueAt: null,
  },
  evidence: [],
  events: [],
  adjustments: [],
  entitlements: [],
  cases: [],
  decisions: [],
};
beforeEach(() => {
  m.fetch.mockReset();
  m.role = 'STUDENT';
});
afterEach(cleanup);
const detail = () =>
  render(
    <MemoryRouter initialEntries={['/admissions/a']}>
      <Routes>
        <Route path="/admissions/:id" element={<AdmissionDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
describe('W07 real-backend UI contracts', () => {
  it('PARTIAL TEST shows pending balance, no class access or fake bank confirmation', async () => {
    m.fetch.mockImplementation((p: string) =>
      Promise.resolve(p.endsWith('/offers') ? { data: [] } : view),
    );
    detail();
    expect(await screen.findByTestId('finance-state')).toHaveTextContent('một phần');
    expect(
      screen.queryByRole('link', { name: 'Vào lớp đã được cấp quyền' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/Không có giao dịch ngân hàng thật/)).toBeInTheDocument();
    expect(screen.getByText(/Chưa có hạn được duyệt/)).toBeInTheDocument();
  });
  it('lost response retains same command key and original UI does not fake ACTIVE', async () => {
    m.fetch.mockImplementation((p: string, init?: RequestInit) =>
      init
        ? Promise.reject(new Error('lost ACK'))
        : Promise.resolve(p.endsWith('/offers') ? { data: [] } : view),
    );
    detail();
    fireEvent.click(await screen.findByRole('button', { name: 'Kiểm tra và cấp quyền học' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Không lưu được');
    fireEvent.click(screen.getByRole('button', { name: 'Kiểm tra và cấp quyền học' }));
    await waitFor(() => expect(m.fetch.mock.calls.filter((x) => x[1]).length).toBe(2));
    const writes = m.fetch.mock.calls.filter((x) => x[1]);
    expect(writes[0][1].body).toBe(writes[1][1].body);
    expect(
      screen.queryByRole('link', { name: 'Vào lớp đã được cấp quyền' }),
    ).not.toBeInTheDocument();
  });
  it('ACTIVE link appears only after a durable server receipt', async () => {
    m.fetch.mockImplementation((p: string) =>
      Promise.resolve(
        p.endsWith('/offers')
          ? { data: [] }
          : {
              ...view,
              entitlements: [
                {
                  id: 'r',
                  outcome: 'ACTIVE',
                  reasonCode: 'ACADEMIC_AND_VERIFIED_TEST_FEE',
                  enrollmentId: 'en',
                },
              ],
            },
      ),
    );
    detail();
    expect(await screen.findByRole('link', { name: 'Vào lớp đã được cấp quyền' })).toHaveAttribute(
      'href',
      '/classroom/c',
    );
  });
  it('scoped academic view has no bank proof upload/download or finance verify controls', async () => {
    m.role = 'ACADEMIC_MANAGER';
    m.fetch.mockResolvedValue({
      ...view,
      permissions: { ...view.permissions, own: false, academic: true },
      evidence: [{ id: 'p', amountVnd: 400000, status: 'PENDING_REVIEW', downloadable: false }],
    });
    detail();
    await screen.findByTestId('admission-state');
    expect(screen.queryByLabelText(/Tệp bằng chứng/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Lưu đối soát TEST' })).not.toBeInTheDocument();
    expect(screen.queryByText('Tải bằng chứng TEST riêng tư')).not.toBeInTheDocument();
  });
  it('unknown price remains unknown, no implied zero/free waiver', async () => {
    m.fetch.mockImplementation((p: string) =>
      Promise.resolve(
        p.endsWith('/offers')
          ? {
              data: [
                {
                  id: 'c',
                  code: 'UNKNOWN',
                  name: 'Legacy',
                  course: 'Course',
                  amountVnd: null,
                  ready: false,
                  remainingSeats: 1,
                },
              ],
            }
          : { data: [] },
      ),
    );
    render(
      <MemoryRouter>
        <AdmissionsPage />
      </MemoryRouter>,
    );
    expect(await screen.findByText(/Học phí áp dụng cho lớp: Chưa xác định/)).toBeInTheDocument();
    expect(screen.getByText(/Thiếu chính sách\/nguồn giá/)).toBeInTheDocument();
  });
  it('managed catalog goes to admission rather than calling legacy create enrollment', async () => {
    m.fetch.mockResolvedValue([]);
    render(
      <MemoryRouter>
        <EnrollmentAction classOfferingId="c" w07Managed />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'Yêu cầu nhập học' })).toHaveAttribute(
      'href',
      '/admissions?classId=c',
    );
    expect(m.fetch.mock.calls.every((x) => !x[1] || x[1].method !== 'POST')).toBe(true);
  });
});
