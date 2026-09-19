import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '@/App';
import { AuthProvider } from '@/features/auth/AuthContext';
import { authApi, type AuthUser, type UserRole } from '@/features/auth/api';
import { ApiError } from '@/lib/api-client';
import { MyEnrollmentsPage } from '@/pages/MyEnrollmentsPage';
import { enrollmentApi } from './api';
import { EnrollmentAction } from './EnrollmentAction';
import type { EnrollmentStatus, EnrollmentView } from './types';

const activeEnrollment = enrollment('ACTIVE', 'FREE', 0);
const pendingEnrollment = enrollment('PENDING_PAYMENT', 'PAID', 500_000);

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('enrollmentApi', () => {
  it('serializes only classOfferingId in the create request', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(activeEnrollment), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await enrollmentApi.create('offering-1');
    const request = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(request.body as string)).toEqual({ classOfferingId: 'offering-1' });
  });
});

describe('EnrollmentAction', () => {
  it('sends only classOfferingId, prevents double submit and handles ACTIVE success', async () => {
    vi.spyOn(authApi, 'me').mockResolvedValueOnce(user('STUDENT'));
    let resolveCreate!: (value: EnrollmentView) => void;
    const create = vi.spyOn(enrollmentApi, 'create').mockReturnValueOnce(
      new Promise((resolve) => { resolveCreate = resolve; }),
    );
    renderAction();

    const button = await enabledEnrollmentButton();
    fireEvent.click(button);
    fireEvent.click(button);
    expect(await screen.findByRole('button', { name: 'Đang xử lý...' })).toBeDisabled();
    expect(create).toHaveBeenCalledOnce();
    expect(create).toHaveBeenCalledWith('offering-1');
    resolveCreate(activeEnrollment);

    expect(await screen.findByText('Đăng ký khóa học thành công.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Xem khóa học của tôi' })).toHaveAttribute('href', '/student/enrollments');
  });

  it('keeps PENDING_PAYMENT semantics without claiming learning access', async () => {
    vi.spyOn(authApi, 'me').mockResolvedValueOnce(user('STUDENT'));
    vi.spyOn(enrollmentApi, 'create').mockResolvedValueOnce(pendingEnrollment);
    renderAction();
    fireEvent.click(await enabledEnrollmentButton());
    expect(await screen.findByText('Yêu cầu đăng ký đã được tạo và đang chờ thanh toán.')).toBeInTheDocument();
    expect(screen.queryByText(/bắt đầu học|học ngay|đã kích hoạt/i)).not.toBeInTheDocument();
  });

  it.each([
    [400, 'Hiện không thể đăng ký lớp học này'],
    [409, 'lớp học đã đầy hoặc bạn đã đăng ký trước đó'],
    [500, 'Không thể kết nối máy chủ'],
  ])('maps HTTP %s to a safe error', async (status, message) => {
    vi.spyOn(authApi, 'me').mockResolvedValueOnce(user('STUDENT'));
    vi.spyOn(enrollmentApi, 'create').mockRejectedValueOnce(new ApiError(status, { message: 'raw internal' }));
    renderAction();
    fireEvent.click(await enabledEnrollmentButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.queryByText('raw internal')).not.toBeInTheDocument();
  });

  it('clears an expired session and redirects to login without retrying POST', async () => {
    vi.spyOn(authApi, 'me')
      .mockResolvedValueOnce(user('STUDENT'))
      .mockRejectedValueOnce(new ApiError(401, null));
    const create = vi.spyOn(enrollmentApi, 'create').mockRejectedValueOnce(new ApiError(401, null));
    render(
      <MemoryRouter initialEntries={['/catalog/course-one']}>
        <AuthProvider>
          <Routes>
            <Route path="/catalog/:slug" element={<EnrollmentAction classOfferingId="offering-1" />} />
            <Route path="/login" element={<h1>Login destination</h1>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );
    fireEvent.click(await enabledEnrollmentButton());
    expect(await screen.findByRole('heading', { name: 'Login destination' })).toBeInTheDocument();
    expect(create).toHaveBeenCalledOnce();
  });

  it.each(['INSTRUCTOR', 'ADMIN_COORDINATOR'] as UserRole[])(
    'does not expose an active action to %s',
    async (role) => {
      vi.spyOn(authApi, 'me').mockResolvedValueOnce(user(role));
      const create = vi.spyOn(enrollmentApi, 'create');
      renderAction();
      expect(await screen.findByRole('button', { name: 'Đăng ký' })).toBeDisabled();
      expect(create).not.toHaveBeenCalled();
    },
  );
});

describe('MyEnrollmentsPage', () => {
  it('shows loading then renders actual enrollment status, pricing and course links', async () => {
    let resolveList!: (value: EnrollmentView[]) => void;
    vi.spyOn(enrollmentApi, 'listMine').mockReturnValueOnce(
      new Promise((resolve) => { resolveList = resolve; }),
    );
    render(<MemoryRouter><AuthProviderForPage><MyEnrollmentsPage /></AuthProviderForPage></MemoryRouter>);
    expect(screen.getByRole('status')).toHaveTextContent('Đang tải');
    resolveList([activeEnrollment, pendingEnrollment]);

    expect(await screen.findByText('Đang hoạt động')).toBeInTheDocument();
    expect(screen.getByText('Chờ thanh toán')).toBeInTheDocument();
    expect(screen.getByText('Miễn phí')).toBeInTheDocument();
    expect(screen.getByText(/500\.000/)).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Course title' })[0]).toHaveAttribute('href', '/catalog/course-title');
    expect(screen.queryByText(/tiến độ|progress|phần trăm/i)).not.toBeInTheDocument();
  });

  it('renders empty and friendly API error states', async () => {
    vi.spyOn(enrollmentApi, 'listMine').mockResolvedValueOnce([]);
    const empty = render(<MemoryRouter><AuthProviderForPage><MyEnrollmentsPage /></AuthProviderForPage></MemoryRouter>);
    expect(await screen.findByText('Bạn chưa đăng ký lớp học nào.')).toBeInTheDocument();
    empty.unmount();

    vi.spyOn(enrollmentApi, 'listMine').mockRejectedValueOnce(new Error('raw database error'));
    render(<MemoryRouter><AuthProviderForPage><MyEnrollmentsPage /></AuthProviderForPage></MemoryRouter>);
    expect(await screen.findByRole('alert')).toHaveTextContent('Không thể tải danh sách đăng ký');
    expect(screen.queryByText('raw database error')).not.toBeInTheDocument();
  });
});

describe('student enrollment route authorization', () => {
  it('redirects guest, denies non-students and allows a student', async () => {
    vi.spyOn(authApi, 'me').mockRejectedValueOnce(new ApiError(401, null));
    const guest = renderApp();
    expect(await screen.findByRole('heading', { name: 'Đăng nhập' })).toBeInTheDocument();
    guest.unmount();

    for (const role of ['INSTRUCTOR', 'ADMIN_COORDINATOR'] as UserRole[]) {
      vi.spyOn(authApi, 'me').mockResolvedValueOnce(user(role));
      const denied = renderApp();
      expect(await screen.findByText(/403/)).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Khóa học của tôi' })).not.toBeInTheDocument();
      denied.unmount();
    }

    vi.spyOn(authApi, 'me').mockResolvedValueOnce(user('STUDENT'));
    vi.spyOn(enrollmentApi, 'listMine').mockResolvedValueOnce([]);
    renderApp();
    expect(await screen.findByRole('heading', { name: 'Khóa học của tôi' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Khóa học của tôi' })).toBeInTheDocument();
  });
});

function renderAction() {
  return render(
    <MemoryRouter initialEntries={['/catalog/course-title']}>
      <AuthProvider><EnrollmentAction classOfferingId="offering-1" /></AuthProvider>
    </MemoryRouter>,
  );
}

async function enabledEnrollmentButton(): Promise<HTMLElement> {
  await waitFor(() => expect(screen.getByRole('button', { name: 'Đăng ký' })).toBeEnabled());
  return screen.getByRole('button', { name: 'Đăng ký' });
}

function renderApp() {
  return render(
    <MemoryRouter initialEntries={['/student/enrollments']}>
      <AuthProvider><App /></AuthProvider>
    </MemoryRouter>,
  );
}

function AuthProviderForPage({ children }: { children: React.ReactNode }) {
  vi.spyOn(authApi, 'me').mockResolvedValueOnce(user('STUDENT'));
  return <AuthProvider>{children}</AuthProvider>;
}

function user(role: UserRole): AuthUser {
  return { id: `${role}-id`, email: `${role.toLowerCase()}@example.test`, fullName: role, role, status: 'ACTIVE' };
}

function enrollment(
  status: EnrollmentStatus,
  pricingType: 'FREE' | 'PAID',
  tuitionFeeVnd: number,
): EnrollmentView {
  return {
    id: `${status}-enrollment`,
    status,
    enrolledAt: '2026-09-19T10:00:00.000Z',
    classOffering: {
      id: `${status}-offering`,
      name: `${status} class`,
      status: 'OPEN',
      pricingType,
      tuitionFeeVnd,
      course: { id: 'course-1', title: 'Course title', slug: 'course-title', level: 'BEGINNER' },
    },
  };
}
