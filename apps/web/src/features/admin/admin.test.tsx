import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useCallback, useState } from 'react';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '@/App';
import { authApi, type AuthUser, type UserRole } from '@/features/auth/api';
import { AuthProvider } from '@/features/auth/AuthContext';
import { AuthContext, type AuthContextValue } from '@/features/auth/auth-context';
import { ApiError } from '@/lib/api-client';
import { adminApi } from './api';
import { buildOfferingInput, initialOfferingValues } from './offering-form';
import type { AdminClassOffering, AdminCourse, Paginated } from './types';

const meta = { total: 1, page: 1, limit: 20, totalPages: 1 };
const course: AdminCourse = {
  id: '10000000-0000-4000-8000-000000000001',
  title: 'English Foundation',
  slug: 'english-foundation',
  description: 'Foundation course',
  level: 'BEGINNER',
  skillScope: 'LR',
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
  code: 'EF-EVE-01',
  name: 'Evening class',
  status: 'DRAFT',
  modality: 'ONLINE',
  pricingType: 'FREE',
  tuitionFeeVnd: 0,
  maxStudents: 20,
  totalSessions: 12,
  totalPeriods: 24,
  enrollmentStart: null,
  enrollmentEnd: null,
  classStart: null,
  classEnd: null,
  createdAt: '2026-09-19T00:00:00.000Z',
  updatedAt: '2026-09-19T00:00:00.000Z',
  course: { id: course.id, title: course.title, slug: course.slug },
  instructor: { id: '20000000-0000-4000-8000-000000000002', fullName: 'Instructor One' },
  scheduleSlots: [],
  registeredCount: 5,
  remainingSeats: 15,
  isFull: false,
  registrationState: 'AVAILABLE',
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('admin authorization and shell', () => {
  it('redirects guests, denies learner roles, and renders a focused admin shell', async () => {
    vi.spyOn(authApi, 'me').mockRejectedValueOnce(new ApiError(401, null));
    const guest = renderAuthApp('/admin/courses');
    expect(await screen.findByRole('heading', { name: 'Đăng nhập' })).toBeInTheDocument();
    guest.unmount();
    for (const role of ['STUDENT', 'INSTRUCTOR'] as UserRole[]) {
      vi.spyOn(authApi, 'me').mockResolvedValueOnce(user(role));
      const denied = renderAuthApp('/admin/courses');
      expect(await screen.findByText(/403/)).toBeInTheDocument();
      denied.unmount();
    }
    mockCourses([]);
    vi.spyOn(authApi, 'me').mockResolvedValueOnce(user('ADMIN_COORDINATOR'));
    renderAuthApp('/admin/courses');
    expect(await screen.findByRole('heading', { name: 'Khóa học TOEIC' })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Khóa học' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: 'Lớp học' }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('link', { name: /báo cáo/i })).not.toBeInTheDocument();
    const openDrawer = screen.getByRole('button', { name: 'Mở điều hướng quản trị' });
    fireEvent.click(openDrawer);
    expect(
      screen.getByRole('dialog', { name: 'Điều hướng quản trị trên thiết bị di động' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Đóng điều hướng quản trị' })).toHaveFocus();
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(openDrawer).toHaveFocus());
  });
});

describe('course administration', () => {
  it('announces the course loading state', () => {
    vi.spyOn(adminApi.courses, 'list').mockReturnValue(new Promise(() => undefined));
    renderAdminApp('/admin/courses');
    expect(screen.getByText('Đang tải khóa học...')).toHaveAttribute('role', 'status');
  });

  it('renders paginated data, submits filters, and shows empty/error states', async () => {
    const list = vi
      .spyOn(adminApi.courses, 'list')
      .mockResolvedValueOnce(page([course]))
      .mockResolvedValueOnce(page([], 0));
    renderAdminApp('/admin/courses');
    expect((await screen.findAllByText(course.title)).length).toBeGreaterThan(0);
    fireEvent.change(screen.getByPlaceholderText('Tên hoặc slug khóa học'), {
      target: { value: 'foundation' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Áp dụng' }));
    expect(await screen.findByText('Không có khóa học phù hợp')).toBeInTheDocument();
    expect(list).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: 'foundation', page: 1, limit: 20 }),
      expect.any(AbortSignal),
    );
  });

  it('retries a friendly list failure', async () => {
    vi.spyOn(adminApi.courses, 'list')
      .mockRejectedValueOnce(new Error('secret'))
      .mockResolvedValueOnce(page([]));
    renderAdminApp('/admin/courses');
    expect(await screen.findByRole('alert')).toHaveTextContent('Không thể tải danh sách khóa học');
    expect(screen.queryByText('secret')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByText('Chưa có khóa học nào')).toBeInTheDocument();
  });

  it('requests the next course page from pagination controls', async () => {
    const list = vi
      .spyOn(adminApi.courses, 'list')
      .mockResolvedValueOnce({
        data: [course],
        meta: { total: 21, page: 1, limit: 20, totalPages: 2 },
      })
      .mockResolvedValueOnce({
        data: [course],
        meta: { total: 21, page: 2, limit: 20, totalPages: 2 },
      });
    renderAdminApp('/admin/courses');
    fireEvent.click(await screen.findByRole('button', { name: 'Trang sau' }));
    await waitFor(() =>
      expect(list).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 2 }),
        expect.any(AbortSignal),
      ),
    );
  });

  it('preserves the false value for the draft publication filter', async () => {
    const list = vi.spyOn(adminApi.courses, 'list').mockResolvedValue(page([course]));
    renderAdminApp('/admin/courses');
    fireEvent.change(await screen.findByLabelText('Xuất bản'), { target: { value: 'false' } });
    await waitFor(() =>
      expect(list).toHaveBeenLastCalledWith(
        expect.objectContaining({ isPublished: false }),
        expect.any(AbortSignal),
      ),
    );
  });

  it('validates and creates a course without client-owned slug fields', async () => {
    mockCourses([]);
    const create = vi.spyOn(adminApi.courses, 'create').mockResolvedValue(course);
    renderAdminApp('/admin/courses/new');
    await screen.findByRole('heading', { name: 'Tạo khóa học' });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo khóa học' }));
    expect(screen.getByText('Vui lòng nhập tên khóa học.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Tên khóa học'), { target: { value: course.title } });
    fireEvent.change(screen.getByLabelText('Trình độ'), { target: { value: course.level } });
    fireEvent.change(screen.getByLabelText('Phạm vi kỹ năng'), { target: { value: 'READING' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo khóa học' }));
    await waitFor(() => expect(create).toHaveBeenCalledOnce());
    expect(create.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        title: course.title,
        level: course.level,
        skillScope: 'READING',
        isPublished: false,
      }),
    );
    expect(create.mock.calls[0][0]).not.toHaveProperty('slug');
  });

  it('associates course validation messages with invalid fields', async () => {
    renderAdminApp('/admin/courses/new');
    fireEvent.click(await screen.findByRole('button', { name: 'Tạo khóa học' }));
    expect(screen.getByLabelText('Tên khóa học')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Tên khóa học')).toHaveAttribute(
      'aria-describedby',
      'course-title-error',
    );
    expect(screen.getByLabelText('Trình độ')).toHaveAttribute('aria-invalid', 'true');
  });

  it('loads and updates a course on the dedicated edit route', async () => {
    vi.spyOn(adminApi.courses, 'get').mockResolvedValue(course);
    const update = vi
      .spyOn(adminApi.courses, 'update')
      .mockResolvedValue({ ...course, isPublished: true });
    renderAdminApp(`/admin/courses/${course.id}/edit`);
    expect(await screen.findByText(/Slug do hệ thống quản lý/)).toHaveTextContent(course.slug);
    fireEvent.click(screen.getByLabelText(/Xuất bản khóa học/));
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith(
        course.id,
        expect.objectContaining({ isPublished: true, skillScope: 'LR' }),
      ),
    );
  });
});

describe('class-offering administration', () => {
  it('announces the class loading state', () => {
    vi.spyOn(adminApi.offerings, 'list').mockReturnValue(new Promise(() => undefined));
    mockCourses([course]);
    renderAdminApp('/admin/class-offerings');
    expect(screen.getByText('Đang tải lớp học...')).toHaveAttribute('role', 'status');
  });

  it('renders operational projections and applies server filters', async () => {
    const list = vi
      .spyOn(adminApi.offerings, 'list')
      .mockResolvedValueOnce(page([offering]))
      .mockResolvedValueOnce(page([]));
    mockCourses([course]);
    renderAdminApp('/admin/class-offerings');
    expect((await screen.findAllByText(offering.name)).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Instructor One').length).toBeGreaterThan(0);
    expect(screen.getAllByText('5/20').length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText('Trạng thái'), { target: { value: 'OPEN' } });
    await waitFor(() =>
      expect(list).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: 'OPEN' }),
        expect.any(AbortSignal),
      ),
    );
  });

  it('creates a full offering payload without instructor assignment', async () => {
    mockCourses([course]);
    const create = vi.spyOn(adminApi.offerings, 'create').mockResolvedValue(offering);
    renderAdminApp('/admin/class-offerings/new');
    await screen.findByRole('heading', { name: 'Tạo lớp học' });
    fireEvent.change(screen.getByLabelText('Khóa học'), { target: { value: course.id } });
    fireEvent.change(screen.getByLabelText('Tên lớp'), { target: { value: offering.name } });
    fireEvent.change(screen.getByLabelText('Mã lớp'), { target: { value: offering.code } });
    fireEvent.change(screen.getByLabelText('Trạng thái'), { target: { value: 'OPEN' } });
    fireEvent.change(screen.getByLabelText('Hình thức'), { target: { value: 'HYBRID' } });
    fireEvent.change(screen.getByLabelText('Loại học phí'), { target: { value: 'PAID' } });
    fireEvent.change(screen.getByLabelText('Học phí (VND)'), { target: { value: '1500000' } });
    fireEvent.change(screen.getByLabelText('Sĩ số tối đa'), { target: { value: '20' } });
    fireEvent.change(screen.getByLabelText('Tổng số buổi'), { target: { value: '12' } });
    fireEvent.change(screen.getByLabelText('Tổng số tiết'), { target: { value: '24' } });
    fireEvent.change(screen.getByLabelText('Mở đăng ký'), {
      target: { value: '2026-10-01T08:00' },
    });
    fireEvent.change(screen.getByLabelText('Đóng đăng ký'), {
      target: { value: '2026-10-15T08:00' },
    });
    fireEvent.change(screen.getByLabelText('Bắt đầu lớp'), {
      target: { value: '2026-10-20T08:00' },
    });
    fireEvent.change(screen.getByLabelText('Kết thúc lớp'), {
      target: { value: '2026-12-20T08:00' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo lớp học' }));
    await waitFor(() => expect(create).toHaveBeenCalledOnce());
    expect(create.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        courseId: course.id,
        code: offering.code,
        status: 'OPEN',
        modality: 'HYBRID',
        totalSessions: 12,
        totalPeriods: 24,
        maxStudents: 20,
        pricingType: 'PAID',
        tuitionFeeVnd: 1_500_000,
        enrollmentStart: expect.any(String),
        enrollmentEnd: expect.any(String),
        classStart: expect.any(String),
        classEnd: expect.any(String),
      }),
    );
    expect(create.mock.calls[0][0]).not.toHaveProperty('instructorId');
  });

  it('supports class empty, failure, retry, and pagination states', async () => {
    vi.spyOn(adminApi.offerings, 'list')
      .mockRejectedValueOnce(new Error('internal'))
      .mockResolvedValueOnce({ data: [], meta: { total: 0, page: 1, limit: 20, totalPages: 0 } });
    mockCourses([course]);
    const view = renderAdminApp('/admin/class-offerings');
    expect(await screen.findByRole('alert')).toHaveTextContent('Không thể tải dữ liệu quản trị');
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByText('Chưa có lớp học nào')).toBeInTheDocument();
    view.unmount();
    vi.restoreAllMocks();

    const pageList = vi
      .spyOn(adminApi.offerings, 'list')
      .mockResolvedValueOnce({
        data: [offering],
        meta: { total: 21, page: 1, limit: 20, totalPages: 2 },
      })
      .mockResolvedValueOnce({
        data: [offering],
        meta: { total: 21, page: 2, limit: 20, totalPages: 2 },
      });
    mockCourses([course]);
    renderAdminApp('/admin/class-offerings');
    fireEvent.click(await screen.findByRole('button', { name: 'Trang sau' }));
    await waitFor(() =>
      expect(pageList).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 2 }),
        expect.any(AbortSignal),
      ),
    );
  });

  it('keeps instructor context read-only while editing status', async () => {
    vi.spyOn(adminApi.offerings, 'get').mockResolvedValue(offering);
    mockCourses([course]);
    const update = vi
      .spyOn(adminApi.offerings, 'update')
      .mockResolvedValue({ ...offering, status: 'OPEN' });
    renderAdminApp(`/admin/class-offerings/${offering.id}/edit`);
    expect(await screen.findByText(/Instructor One/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/giảng viên/i)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Trạng thái'), { target: { value: 'OPEN' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    await waitFor(() => expect(update).toHaveBeenCalledOnce());
    expect(update.mock.calls[0][1]).not.toHaveProperty('instructorId');
  });

  it('validates paid pricing, capacity, totals, and date ordering', () => {
    const base = { ...initialOfferingValues(null), courseId: course.id, name: 'Class' };
    expect(
      buildOfferingInput({ ...base, pricingType: 'PAID', tuitionFeeVnd: '0' }, false).errors
        .tuitionFeeVnd,
    ).toBeDefined();
    expect(
      buildOfferingInput({ ...base, maxStudents: '-1' }, false).errors.maxStudents,
    ).toBeDefined();
    expect(
      buildOfferingInput({ ...base, totalSessions: '1.5' }, false).errors.totalSessions,
    ).toBeDefined();
    expect(
      buildOfferingInput(
        { ...base, enrollmentStart: '2026-10-02T10:00', enrollmentEnd: '2026-10-01T10:00' },
        false,
      ).errors.enrollmentEnd,
    ).toBeDefined();
    expect(
      buildOfferingInput(
        { ...base, classStart: '2026-10-02T10:00', classEnd: '2026-10-02T10:00' },
        false,
      ).errors.classEnd,
    ).toBeDefined();
  });

  it('normalizes FREE tuition without inventing optional values', () => {
    const result = buildOfferingInput(
      { ...initialOfferingValues(null), courseId: course.id, name: 'Free class' },
      false,
    );
    expect(result.input).toEqual(
      expect.objectContaining({ pricingType: 'FREE', tuitionFeeVnd: 0 }),
    );
    expect(result.input).not.toHaveProperty('instructorId');
    expect(result.input).not.toHaveProperty('maxStudents');
  });
});

describe('expired admin sessions', () => {
  it('redirects an expired list load without leaking raw failures', async () => {
    vi.spyOn(adminApi.courses, 'list').mockRejectedValueOnce(new ApiError(401, null));
    const refresh = vi.fn().mockResolvedValue(undefined);
    renderAdminApp('/admin/courses', refresh);
    expect(await screen.findByRole('heading', { name: 'Đăng nhập' })).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent(
      `/login?returnUrl=${encodeURIComponent('/admin/courses')}`,
    );
    expect(refresh).toHaveBeenCalledOnce();
  });
});

function page<T>(data: T[], total = data.length): Paginated<T> {
  return { data, meta: { ...meta, total } };
}
function mockCourses(data: AdminCourse[]) {
  vi.spyOn(adminApi.courses, 'list').mockResolvedValue(page(data));
}
function renderAuthApp(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>,
  );
}
function renderAdminApp(path: string, onRefresh = vi.fn().mockResolvedValue(undefined)) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <TestAuthProvider onRefresh={onRefresh}>
        <App />
        <LocationProbe />
      </TestAuthProvider>
    </MemoryRouter>,
  );
}
function TestAuthProvider({
  children,
  onRefresh,
}: {
  children: React.ReactNode;
  onRefresh: () => Promise<void>;
}) {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(() => user('ADMIN_COORDINATOR'));
  const refreshUser = useCallback(async () => {
    await onRefresh();
    setCurrentUser(null);
  }, [onRefresh]);
  const value: AuthContextValue = {
    user: currentUser,
    isLoading: false,
    error: null,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    refreshUser,
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
function LocationProbe() {
  const location = useLocation();
  return (
    <output data-testid="location">
      {location.pathname}
      {location.search}
    </output>
  );
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
