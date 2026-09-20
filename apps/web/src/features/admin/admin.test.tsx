import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useCallback, useState } from 'react';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '@/App';
import { AuthProvider } from '@/features/auth/AuthContext';
import { authApi, type AuthUser, type UserRole } from '@/features/auth/api';
import {
  AuthContext,
  type AuthContextValue,
} from '@/features/auth/auth-context';
import { ApiError } from '@/lib/api-client';
import { AdminClassOfferingsPage } from '@/pages/AdminClassOfferingsPage';
import { AdminCoursesPage } from '@/pages/AdminCoursesPage';
import { adminApi } from './api';
import { buildOfferingInput, initialOfferingValues } from './offering-form';
import type { AdminClassOffering, AdminCourse } from './types';

const course: AdminCourse = {
  id: '10000000-0000-4000-8000-000000000001',
  title: 'English Foundation',
  slug: 'english-foundation',
  description: 'Foundation course',
  level: 'BEGINNER',
  thumbnailUrl: null,
  isPublished: false,
  createdById: '10000000-0000-4000-8000-000000000002',
  createdAt: '2026-09-19T00:00:00.000Z',
  updatedAt: '2026-09-19T00:00:00.000Z',
  createdBy: { id: '10000000-0000-4000-8000-000000000002', fullName: 'Admin' },
  _count: { classOfferings: 1 },
};

const offering: AdminClassOffering = {
  id: '20000000-0000-4000-8000-000000000001',
  courseId: course.id,
  instructorId: '20000000-0000-4000-8000-000000000002',
  name: 'Evening class',
  status: 'DRAFT',
  pricingType: 'FREE',
  tuitionFeeVnd: 0,
  maxStudents: 20,
  enrollmentStart: null,
  enrollmentEnd: null,
  classStart: null,
  classEnd: null,
  createdAt: '2026-09-19T00:00:00.000Z',
  updatedAt: '2026-09-19T00:00:00.000Z',
  course: { id: course.id, title: course.title, slug: course.slug },
  instructor: { id: '20000000-0000-4000-8000-000000000002', fullName: 'Instructor One' },
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('admin route authorization', () => {
  it('redirects a guest and denies student/instructor while allowing admin', async () => {
    vi.spyOn(authApi, 'me').mockRejectedValueOnce(new ApiError(401, null));
    const guest = renderApp('/admin/courses');
    expect(await screen.findByRole('heading', { name: 'Đăng nhập' })).toBeInTheDocument();
    guest.unmount();

    for (const role of ['STUDENT', 'INSTRUCTOR'] as UserRole[]) {
      vi.spyOn(authApi, 'me').mockResolvedValueOnce(user(role));
      const denied = renderApp('/admin/courses');
      expect(await screen.findByText(/403/)).toBeInTheDocument();
      expect(screen.queryByText('Quản lý lớp học')).not.toBeInTheDocument();
      denied.unmount();
    }

    vi.spyOn(authApi, 'me').mockResolvedValueOnce(user('ADMIN_COORDINATOR'));
    vi.spyOn(adminApi.courses, 'list').mockResolvedValueOnce([]);
    renderApp('/admin/courses');
    expect(await screen.findByRole('heading', { name: 'Quản lý khóa học' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Quản lý khóa học' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Quản lý lớp học' })).toBeInTheDocument();
  });
});

describe('AdminCoursesPage', () => {
  it('renders courses, empty state and friendly load errors', async () => {
    vi.spyOn(adminApi.courses, 'list').mockResolvedValueOnce([course]);
    const list = renderAdminPage(<AdminCoursesPage />, '/admin/courses');
    expect(await screen.findByRole('heading', { name: course.title })).toBeInTheDocument();
    expect(screen.getByText('Bản nháp')).toBeInTheDocument();
    list.unmount();

    vi.spyOn(adminApi.courses, 'list').mockResolvedValueOnce([]);
    const empty = renderAdminPage(<AdminCoursesPage />, '/admin/courses');
    expect(await screen.findByText('Chưa có khóa học nào.')).toBeInTheDocument();
    empty.unmount();

    vi.spyOn(adminApi.courses, 'list').mockRejectedValueOnce(new Error('internal'));
    renderAdminPage(<AdminCoursesPage />, '/admin/courses');
    expect(await screen.findByRole('alert')).toHaveTextContent('Không thể tải danh sách khóa học');
    expect(screen.queryByText('internal')).not.toBeInTheDocument();
  });

  it('validates and creates without slug or ownership fields', async () => {
    vi.spyOn(adminApi.courses, 'list').mockResolvedValue([]);
    const create = vi.spyOn(adminApi.courses, 'create').mockResolvedValue(course);
    renderAdminPage(<AdminCoursesPage />, '/admin/courses');
    await screen.findByText('Chưa có khóa học nào.');

    fireEvent.click(screen.getByRole('button', { name: 'Tạo khóa học' }));
    expect(screen.getByText('Vui lòng nhập tên khóa học.')).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/^Tên khóa học/), { target: { value: course.title } });
    fireEvent.change(screen.getByLabelText(/^Trình độ/), { target: { value: course.level } });
    fireEvent.change(screen.getByLabelText('Mô tả'), { target: { value: course.description } });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo khóa học' }));
    await waitFor(() => expect(create).toHaveBeenCalledOnce());
    const payload = create.mock.calls[0][0];
    expect(payload).toEqual(expect.objectContaining({ title: course.title, level: course.level, isPublished: false }));
    expect(payload).not.toHaveProperty('slug');
    expect(payload).not.toHaveProperty('createdById');
    expect(payload).not.toHaveProperty('id');
  });

  it.each([
    { initial: false, expected: true, label: 'publishes' },
    { initial: true, expected: false, label: 'unpublishes' },
  ])('$label through PATCH without changing slug', async ({ initial, expected }) => {
    const current = { ...course, isPublished: initial };
    vi.spyOn(adminApi.courses, 'list').mockResolvedValue([current]);
    const update = vi.spyOn(adminApi.courses, 'update').mockResolvedValue({ ...current, isPublished: expected });
    renderAdminPage(<AdminCoursesPage />, '/admin/courses');
    await screen.findByRole('heading', { name: current.title });
    fireEvent.click(screen.getByRole('button', { name: 'Chỉnh sửa' }));
    fireEvent.change(screen.getByLabelText('Tên khóa học'), { target: { value: 'Renamed course' } });
    fireEvent.click(screen.getByLabelText('Đã xuất bản'));
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    await waitFor(() => expect(update).toHaveBeenCalledOnce());
    expect(update.mock.calls[0][1]).toEqual(expect.objectContaining({ title: 'Renamed course', isPublished: expected }));
    expect(update.mock.calls[0][1]).not.toHaveProperty('slug');
  });

  it('disables submit while saving', async () => {
    vi.spyOn(adminApi.courses, 'list').mockResolvedValue([]);
    let resolveCreate!: (value: AdminCourse) => void;
    vi.spyOn(adminApi.courses, 'create').mockReturnValueOnce(new Promise((resolve) => { resolveCreate = resolve; }));
    renderAdminPage(<AdminCoursesPage />, '/admin/courses');
    await screen.findByText('Chưa có khóa học nào.');
    fireEvent.change(screen.getByLabelText('Tên khóa học'), { target: { value: course.title } });
    fireEvent.change(screen.getByLabelText('Trình độ'), { target: { value: course.level } });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo khóa học' }));
    expect(await screen.findByRole('button', { name: 'Đang lưu...' })).toBeDisabled();
    resolveCreate(course);
    expect(await screen.findByText('Đã tạo khóa học.')).toBeInTheDocument();
  });
});

describe('AdminClassOfferingsPage', () => {
  it('lists offerings, uses real courses and exposes instructor read-only', async () => {
    mockOfferingLists([offering], [course]);
    renderAdminPage(
      <AdminClassOfferingsPage />,
      '/admin/class-offerings',
    );
    expect(await screen.findByRole('heading', { name: offering.name })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: course.title })).toHaveValue(course.id);
    expect(screen.getByText(/Instructor One/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/instructor/i)).not.toBeInTheDocument();
  });

  it('creates an unassigned FREE DRAFT offering without empty optional dates', async () => {
    mockOfferingLists([], [course]);
    const create = vi.spyOn(adminApi.offerings, 'create').mockResolvedValue(offering);
    renderAdminPage(
      <AdminClassOfferingsPage />,
      '/admin/class-offerings',
    );
    await screen.findByText('Chưa có lớp học nào.');
    fireEvent.change(screen.getByLabelText('Khóa học'), { target: { value: course.id } });
    fireEvent.change(screen.getByLabelText('Tên lớp'), { target: { value: offering.name } });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo lớp học' }));
    await waitFor(() => expect(create).toHaveBeenCalledOnce());
    expect(create.mock.calls[0][0]).toEqual({
      courseId: course.id,
      name: offering.name,
      status: 'DRAFT',
      pricingType: 'FREE',
      tuitionFeeVnd: 0,
    });
    expect(create.mock.calls[0][0]).not.toHaveProperty('instructorId');
  });

  it('creates a PAID offering with a positive fee', async () => {
    mockOfferingLists([], [course]);
    const create = vi.spyOn(adminApi.offerings, 'create').mockResolvedValue(offering);
    renderAdminPage(
      <AdminClassOfferingsPage />,
      '/admin/class-offerings',
    );
    await screen.findByText('Chưa có lớp học nào.');
    fireEvent.change(screen.getByLabelText('Khóa học'), { target: { value: course.id } });
    fireEvent.change(screen.getByLabelText('Tên lớp'), { target: { value: offering.name } });
    fireEvent.change(screen.getByLabelText('Loại học phí'), { target: { value: 'PAID' } });
    fireEvent.change(screen.getByLabelText('Học phí (VND)'), { target: { value: '1500000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo lớp học' }));
    await waitFor(() => expect(create).toHaveBeenCalledWith(expect.objectContaining({ pricingType: 'PAID', tuitionFeeVnd: 1_500_000 })));
  });

  it('changes DRAFT to OPEN without clearing an assigned instructor', async () => {
    mockOfferingLists([offering], [course]);
    const update = vi.spyOn(adminApi.offerings, 'update').mockResolvedValue({ ...offering, status: 'OPEN' });
    renderAdminPage(
      <AdminClassOfferingsPage />,
      '/admin/class-offerings',
    );
    await screen.findByRole('heading', { name: offering.name });
    fireEvent.click(screen.getByRole('button', { name: 'Chỉnh sửa' }));
    fireEvent.change(screen.getByLabelText('Trạng thái'), { target: { value: 'OPEN' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    await waitFor(() => expect(update).toHaveBeenCalledOnce());
    expect(update.mock.calls[0][1]).toEqual(expect.objectContaining({ status: 'OPEN' }));
    expect(update.mock.calls[0][1]).not.toHaveProperty('instructorId');
  });

  it('shows friendly API failure and validates pricing, capacity and dates', async () => {
    vi.spyOn(adminApi.offerings, 'list').mockRejectedValueOnce(new Error('raw internal'));
    vi.spyOn(adminApi.courses, 'list').mockResolvedValueOnce([course]);
    const failed = renderAdminPage(
      <AdminClassOfferingsPage />,
      '/admin/class-offerings',
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('Không thể tải dữ liệu quản trị');
    expect(screen.queryByText('raw internal')).not.toBeInTheDocument();
    failed.unmount();

    const base = initialOfferingValues(null);
    expect(buildOfferingInput({ ...base, courseId: course.id, name: 'Paid', pricingType: 'PAID', tuitionFeeVnd: '0' }, false).errors.tuitionFeeVnd).toBeDefined();
    expect(buildOfferingInput({ ...base, courseId: course.id, name: 'Capacity', maxStudents: '-1' }, false).errors.maxStudents).toBeDefined();
    expect(buildOfferingInput({ ...base, courseId: course.id, name: 'Dates', enrollmentStart: '2026-10-02T10:00', enrollmentEnd: '2026-10-01T10:00' }, false).errors.enrollmentEnd).toBeDefined();
    expect(buildOfferingInput({ ...base, courseId: course.id, name: 'Dates', classStart: '2026-10-02T10:00', classEnd: '2026-10-02T10:00' }, false).errors.classEnd).toBeDefined();
  });
});

describe('expired admin sessions', () => {
  it.each([
    { path: '/admin/courses', area: 'courses' as const },
    { path: '/admin/class-offerings', area: 'offerings' as const },
  ])('redirects an expired $area load to login with a safe returnUrl', async ({ path, area }) => {
    const refreshUser = vi.fn().mockResolvedValue(undefined);
    if (area === 'courses') {
      vi.spyOn(adminApi.courses, 'list').mockRejectedValueOnce(
        new ApiError(401, null),
      );
    } else {
      vi.spyOn(adminApi.offerings, 'list').mockRejectedValueOnce(
        new ApiError(401, null),
      );
      vi.spyOn(adminApi.courses, 'list').mockResolvedValueOnce([]);
    }

    renderAdminPage(<App />, path, refreshUser);

    expect(await screen.findByRole('heading', { name: 'Đăng nhập' })).toBeInTheDocument();
    expect(screen.getByTestId('test-location')).toHaveTextContent(
      `/login?returnUrl=${encodeURIComponent(path)}`,
    );
    expect(refreshUser).toHaveBeenCalledOnce();
  });

  it('does not retry a course mutation after an expired-session 401', async () => {
    const refreshUser = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(adminApi.courses, 'list').mockResolvedValueOnce([]);
    const create = vi
      .spyOn(adminApi.courses, 'create')
      .mockRejectedValueOnce(new ApiError(401, null));
    renderAdminPage(<App />, '/admin/courses', refreshUser);
    await screen.findByText('Chưa có khóa học nào.');

    fireEvent.change(screen.getByLabelText('Tên khóa học'), {
      target: { value: 'Expired session course' },
    });
    fireEvent.change(screen.getByLabelText('Trình độ'), {
      target: { value: 'BEGINNER' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo khóa học' }));

    expect(await screen.findByRole('heading', { name: 'Đăng nhập' })).toBeInTheDocument();
    expect(create).toHaveBeenCalledOnce();
    expect(refreshUser).toHaveBeenCalledOnce();
  });
});

function renderApp(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><AuthProvider><App /></AuthProvider></MemoryRouter>);
}

function renderAdminPage(
  element: React.ReactNode,
  path: string,
  onRefresh = vi.fn().mockResolvedValue(undefined),
) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <TestAdminAuthProvider onRefresh={onRefresh}>
        {element}
        <LocationProbe />
      </TestAdminAuthProvider>
    </MemoryRouter>,
  );
}

function TestAdminAuthProvider({
  children,
  onRefresh,
}: {
  children: React.ReactNode;
  onRefresh: () => Promise<void>;
}) {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(() =>
    user('ADMIN_COORDINATOR'),
  );
  const refreshUser = useCallback(async () => {
    await onRefresh();
    setCurrentUser(null);
  }, [onRefresh]);
  const context: AuthContextValue = {
    user: currentUser,
    isLoading: false,
    error: null,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    refreshUser,
  };

  return <AuthContext.Provider value={context}>{children}</AuthContext.Provider>;
}

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="test-location">{location.pathname}{location.search}</output>;
}

function user(role: UserRole): AuthUser {
  return { id: `${role}-id`, email: `${role.toLowerCase()}@example.test`, fullName: role, role, status: 'ACTIVE' };
}

function mockOfferingLists(offerings: AdminClassOffering[], courses: AdminCourse[]) {
  vi.spyOn(adminApi.offerings, 'list').mockResolvedValue(offerings);
  vi.spyOn(adminApi.courses, 'list').mockResolvedValue(courses);
}
