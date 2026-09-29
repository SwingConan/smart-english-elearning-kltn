import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
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

describe('enrollment contract', () => {
  it('serializes only classOfferingId in the create request', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify(activeEnrollment), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);
    await enrollmentApi.create('offering-1');
    expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)).toEqual({
      classOfferingId: 'offering-1',
    });
  });

  it('creates ACTIVE for a free class without duplicate submission', async () => {
    vi.spyOn(authApi, 'me').mockResolvedValueOnce(user('STUDENT'));
    vi.spyOn(enrollmentApi, 'listMine').mockResolvedValueOnce([]);
    let resolveCreate!: (value: EnrollmentView) => void;
    const create = vi.spyOn(enrollmentApi, 'create').mockReturnValueOnce(
      new Promise((resolve) => {
        resolveCreate = resolve;
      }),
    );
    renderAction();
    const button = await enabledButton();
    fireEvent.click(button);
    fireEvent.click(button);
    expect(create).toHaveBeenCalledOnce();
    resolveCreate(activeEnrollment);
    expect(await screen.findByText(/đã đăng ký lớp này/i)).toBeInTheDocument();
  });

  it('keeps paid enrollment PENDING_PAYMENT and does not claim LMS access', async () => {
    vi.spyOn(authApi, 'me').mockResolvedValueOnce(user('STUDENT'));
    vi.spyOn(enrollmentApi, 'listMine').mockResolvedValueOnce([]);
    vi.spyOn(enrollmentApi, 'create').mockResolvedValueOnce(pendingEnrollment);
    renderAction();
    fireEvent.click(await enabledButton());
    expect(await screen.findByText(/đăng ký đang chờ thanh toán/i)).toBeInTheDocument();
    expect(screen.queryByText(/bắt đầu học|đã kích hoạt/i)).not.toBeInTheDocument();
  });

  it('shows existing enrollment instead of a second create action', async () => {
    vi.spyOn(authApi, 'me').mockResolvedValueOnce(user('STUDENT'));
    vi.spyOn(enrollmentApi, 'listMine').mockResolvedValueOnce([activeEnrollment]);
    renderAction('ACTIVE-offering');
    expect(await screen.findByRole('link', { name: /Vào lớp học/i })).toHaveAttribute(
      'href',
      '/student/enrollments/ACTIVE-enrollment',
    );
    expect(screen.queryByRole('button', { name: /Đăng ký/i })).not.toBeInTheDocument();
  });

  it('maps server failures to safe copy', async () => {
    vi.spyOn(authApi, 'me').mockResolvedValueOnce(user('STUDENT'));
    vi.spyOn(enrollmentApi, 'listMine').mockResolvedValueOnce([]);
    vi.spyOn(enrollmentApi, 'create').mockRejectedValueOnce(
      new ApiError(409, { message: 'raw internal' }),
    );
    renderAction();
    fireEvent.click(await enabledButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(/đã đầy|đã đăng ký/i);
    expect(screen.queryByText('raw internal')).not.toBeInTheDocument();
  });
});

describe('MyEnrollmentsPage', () => {
  it('renders ACTIVE progress and blocks PENDING_PAYMENT from LMS', async () => {
    vi.spyOn(authApi, 'me').mockResolvedValueOnce(user('STUDENT'));
    vi.spyOn(enrollmentApi, 'listMine').mockResolvedValueOnce([
      activeEnrollment,
      pendingEnrollment,
    ]);
    render(
      <MemoryRouter>
        <AuthProvider>
          <MyEnrollmentsPage />
        </AuthProvider>
      </MemoryRouter>,
    );
    expect(await screen.findByText('ACTIVE class')).toBeInTheDocument();
    expect(
      screen.getByText((_, node) => node?.textContent === '1/2 bài · 50%'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Vào lớp học/i })).toHaveAttribute(
      'href',
      '/student/enrollments/ACTIVE-enrollment',
    );
    expect(screen.getAllByText(/Chờ thanh toán/i).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: /Vào lớp học/i })).toHaveLength(1);
  });

  it('supports search/filter and a friendly API error', async () => {
    vi.spyOn(authApi, 'me').mockResolvedValueOnce(user('STUDENT'));
    vi.spyOn(enrollmentApi, 'listMine').mockResolvedValueOnce([activeEnrollment]);
    const page = render(
      <MemoryRouter>
        <AuthProvider>
          <MyEnrollmentsPage />
        </AuthProvider>
      </MemoryRouter>,
    );
    await screen.findByText('ACTIVE class');
    fireEvent.change(screen.getByLabelText('Tìm lớp học'), { target: { value: 'missing' } });
    expect(screen.getByText(/Chưa có lớp phù hợp/i)).toBeInTheDocument();
    page.unmount();
    vi.spyOn(authApi, 'me').mockResolvedValueOnce(user('STUDENT'));
    vi.spyOn(enrollmentApi, 'listMine').mockRejectedValueOnce(new Error('raw database'));
    render(
      <MemoryRouter>
        <AuthProvider>
          <MyEnrollmentsPage />
        </AuthProvider>
      </MemoryRouter>,
    );
    expect(await screen.findByText(/Không thể tải danh sách lớp/i)).toBeInTheDocument();
    expect(screen.queryByText('raw database')).not.toBeInTheDocument();
  });
});

function renderAction(classOfferingId = 'offering-1') {
  return render(
    <MemoryRouter initialEntries={['/catalog/course']}>
      <AuthProvider>
        <EnrollmentAction classOfferingId={classOfferingId} />
      </AuthProvider>
    </MemoryRouter>,
  );
}
async function enabledButton() {
  await waitFor(() => expect(screen.getByRole('button', { name: /Đăng ký lớp/i })).toBeEnabled());
  return screen.getByRole('button', { name: /Đăng ký lớp/i });
}
function user(role: UserRole): AuthUser {
  return {
    id: `${role}-id`,
    email: `${role.toLowerCase()}@example.test`,
    fullName: role,
    role,
    status: 'ACTIVE',
  };
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
      code: `${status}-CODE`,
      name: `${status} class`,
      status: 'IN_PROGRESS',
      modality: 'ONLINE',
      pricingType,
      tuitionFeeVnd,
      classStart: null,
      classEnd: null,
      instructor: null,
      scheduleSlots: [],
      course: {
        id: 'course-1',
        title: 'Course title',
        slug: 'course-title',
        level: 'BEGINNER',
        skillScope: 'LR',
        thumbnailUrl: null,
      },
    },
    progress: { totalLessons: 2, completedLessons: 1, progressPercent: 50 },
  };
}
