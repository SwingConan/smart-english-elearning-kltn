import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
  instructor: {
    id: '20000000-0000-4000-8000-000000000002',
    fullName: 'Instructor One',
    email: 'instructor@example.com',
    role: 'INSTRUCTOR',
    status: 'ACTIVE',
  },
  scheduleSlots: [],
  registeredCount: 5,
  remainingSeats: 15,
  isFull: false,
  registrationState: 'AVAILABLE',
  operationalReadiness: {
    isReady: false,
    missing: ['SCHEDULE_MISSING', 'CLASS_DATES_MISSING'],
  },
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
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
    expect(screen.getAllByRole('link', { name: 'Tài khoản' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: /báo cáo/i }).length).toBeGreaterThan(0);
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

  it('shows known course levels in Vietnamese and filters with the stored backend value', async () => {
    const knownLevels = [
      { code: 'FOUNDATION', label: 'Nền tảng' },
      { code: 'BASIC', label: 'Cơ bản' },
      { code: 'INTERMEDIATE', label: 'Trung cấp' },
      { code: 'ADVANCING', label: 'Nâng cao' },
    ];
    const courses = knownLevels.map(({ code }, index) => ({
      ...course,
      id: `${course.id.slice(0, -1)}${index + 1}`,
      title: `${course.title} ${index + 1}`,
      level: code,
    }));
    const list = vi.spyOn(adminApi.courses, 'list').mockResolvedValue(page(courses));

    renderAdminApp('/admin/courses');

    await screen.findAllByText(courses[0].title);
    for (const { code, label } of knownLevels) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
      expect(screen.queryByText(code)).not.toBeInTheDocument();
    }

    fireEvent.change(screen.getByLabelText('Trình độ'), { target: { value: 'Nền tảng' } });
    fireEvent.click(screen.getByRole('button', { name: 'Áp dụng' }));
    await waitFor(() =>
      expect(list).toHaveBeenLastCalledWith(
        expect.objectContaining({ level: 'FOUNDATION', page: 1, limit: 20 }),
        expect.any(AbortSignal),
      ),
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
    expect(screen.getByRole('option', { name: 'Đọc' })).toHaveValue('READING');
    expect(screen.queryByRole('option', { name: 'READING' })).not.toBeInTheDocument();
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
    expect(create.mock.calls[0][0]).not.toHaveProperty('thumbnailUrl');
    expect(screen.queryByLabelText('URL ảnh đại diện')).not.toBeInTheDocument();
  });

  it('shows a fallback preview and validates selected thumbnail type and size', async () => {
    renderAdminApp('/admin/courses/new');
    await screen.findByRole('heading', { name: 'Tạo khóa học' });
    const chooser = screen.getByLabelText('Chọn ảnh');
    expect(chooser).toHaveAttribute('accept', 'image/jpeg,image/png,image/webp');
    expect(screen.getByAltText('Xem trước ảnh đại diện khóa học')).toHaveAttribute('src');
    expect(screen.getByText(/ảnh mặc định theo phạm vi kỹ năng/i)).toBeInTheDocument();

    fireEvent.change(chooser, {
      target: { files: [new File(['svg'], 'cover.svg', { type: 'image/svg+xml' })] },
    });
    expect(screen.getByRole('alert')).toHaveTextContent('JPEG, PNG hoặc WebP');
    fireEvent.change(chooser, {
      target: {
        files: [
          new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'large.png', { type: 'image/png' }),
        ],
      },
    });
    expect(screen.getByRole('alert')).toHaveTextContent('không được vượt quá 5 MB');
  });

  it('previews a valid image and creates before uploading it', async () => {
    mockObjectUrls();
    const created = { ...course, id: 'created-course-id' };
    const create = vi.spyOn(adminApi.courses, 'create').mockResolvedValue(created);
    const upload = vi.spyOn(adminApi.courses, 'uploadThumbnail').mockResolvedValue({
      ...created,
      thumbnailUrl: '/api/course-assets/thumbnail.png',
    });
    renderAdminApp('/admin/courses/new');
    await screen.findByRole('heading', { name: 'Tạo khóa học' });
    const file = new File(['png'], 'cover.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText('Chọn ảnh'), { target: { files: [file] } });
    expect(screen.getByAltText('Xem trước ảnh đại diện khóa học')).toHaveAttribute(
      'src',
      'blob:course-thumbnail-preview',
    );
    fireEvent.change(screen.getByLabelText('Tên khóa học'), { target: { value: course.title } });
    fireEvent.change(screen.getByLabelText('Trình độ'), { target: { value: course.level } });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo khóa học' }));

    await waitFor(() => expect(upload).toHaveBeenCalledWith(created.id, file));
    expect(create).toHaveBeenCalledOnce();
    expect(create.mock.invocationCallOrder[0]).toBeLessThan(upload.mock.invocationCallOrder[0]);
    expect(screen.getByTestId('location')).toHaveTextContent('/admin/courses');
  });

  it('moves a partially created course to recoverable edit state after upload failure', async () => {
    mockObjectUrls();
    const created = { ...course, id: '10000000-0000-4000-8000-000000000009' };
    const create = vi.spyOn(adminApi.courses, 'create').mockResolvedValue(created);
    vi.spyOn(adminApi.courses, 'uploadThumbnail').mockRejectedValue(new Error('network'));
    vi.spyOn(adminApi.courses, 'get').mockResolvedValue(created);
    renderAdminApp('/admin/courses/new');
    await screen.findByRole('heading', { name: 'Tạo khóa học' });
    fireEvent.change(screen.getByLabelText('Chọn ảnh'), {
      target: { files: [new File(['png'], 'cover.png', { type: 'image/png' })] },
    });
    fireEvent.change(screen.getByLabelText('Tên khóa học'), { target: { value: course.title } });
    fireEvent.change(screen.getByLabelText('Trình độ'), { target: { value: course.level } });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo khóa học' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Khóa học đã được tạo nhưng ảnh đại diện chưa tải lên',
    );
    expect(screen.getByTestId('location')).toHaveTextContent(`/admin/courses/${created.id}/edit`);
    expect(create).toHaveBeenCalledOnce();
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
    const foundationCourse = { ...course, level: 'FOUNDATION' };
    vi.spyOn(adminApi.courses, 'get').mockResolvedValue(foundationCourse);
    const update = vi
      .spyOn(adminApi.courses, 'update')
      .mockResolvedValue({ ...foundationCourse, isPublished: true });
    renderAdminApp(`/admin/courses/${course.id}/edit`);
    expect(await screen.findByText(/Slug do hệ thống quản lý/)).toHaveTextContent(course.slug);
    expect(screen.getByLabelText('Trình độ')).toHaveValue('Nền tảng');
    fireEvent.click(screen.getByLabelText(/Xuất bản khóa học/));
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith(
        course.id,
        expect.objectContaining({ level: 'FOUNDATION', isPublished: true, skillScope: 'LR' }),
      ),
    );
  });

  it('replaces and removes an existing thumbnail without discarding unsaved fields', async () => {
    const withThumbnail = { ...course, thumbnailUrl: 'https://images.example.com/current.jpg' };
    vi.spyOn(adminApi.courses, 'get').mockResolvedValue(withThumbnail);
    const upload = vi.spyOn(adminApi.courses, 'uploadThumbnail').mockResolvedValue({
      ...withThumbnail,
      thumbnailUrl: '/api/course-assets/replacement.webp',
    });
    const remove = vi
      .spyOn(adminApi.courses, 'removeThumbnail')
      .mockResolvedValue({ ...withThumbnail, thumbnailUrl: null });
    renderAdminApp(`/admin/courses/${course.id}/edit`);
    const title = await screen.findByLabelText('Tên khóa học');
    const preview = screen.getByAltText('Xem trước ảnh đại diện khóa học');
    expect(preview).toHaveAttribute('src', withThumbnail.thumbnailUrl);
    fireEvent.change(title, { target: { value: 'Unsaved title' } });

    const replacement = new File(['RIFF1234WEBP'], 'replacement.webp', { type: 'image/webp' });
    fireEvent.change(screen.getByLabelText('Thay ảnh'), { target: { files: [replacement] } });
    await waitFor(() => expect(upload).toHaveBeenCalledWith(course.id, replacement));
    expect(title).toHaveValue('Unsaved title');
    expect(preview).toHaveAttribute('src', '/api/course-assets/replacement.webp');

    fireEvent.click(screen.getByRole('button', { name: 'Xóa ảnh' }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith(course.id));
    expect(title).toHaveValue('Unsaved title');
    expect(preview).not.toHaveAttribute('src', '/api/course-assets/replacement.webp');
    expect(screen.getByText(/ảnh mặc định theo phạm vi kỹ năng/i)).toBeInTheDocument();
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

  it('shows readiness only for drafts and keeps desktop actions available', async () => {
    const openOffering: AdminClassOffering = {
      ...offering,
      id: '20000000-0000-4000-8000-000000000099',
      code: 'EF-OPEN-01',
      name: 'Open class',
      status: 'OPEN',
      operationalReadiness: { isReady: true, missing: [] },
    };
    vi.spyOn(adminApi.offerings, 'list').mockResolvedValue(page([offering, openOffering]));
    mockCourses([course]);
    renderAdminApp('/admin/class-offerings');

    const openRow = await screen.findByRole('row', { name: /Open class/ });
    expect(within(openRow).getAllByText('Đang mở')).toHaveLength(1);
    expect(within(openRow).queryByText(/Sẵn sàng vận hành|Cần hoàn thiện/)).not.toBeInTheDocument();
    const draftRow = screen.getByRole('row', { name: /Evening class/ });
    expect(within(draftRow).getByText('Cần hoàn thiện 2 mục')).toBeInTheDocument();
    expect(within(draftRow).getByRole('link', { name: 'Vận hành' })).toBeInTheDocument();
    expect(within(draftRow).getByRole('link', { name: 'Chỉnh sửa' })).toBeInTheDocument();
  });

  it('creates a full offering payload without instructor assignment', async () => {
    mockCourses([course]);
    const create = vi.spyOn(adminApi.offerings, 'create').mockResolvedValue(offering);
    renderAdminApp('/admin/class-offerings/new');
    await screen.findByRole('heading', { name: 'Tạo lớp học' });
    expect(
      screen.getByText(
        'Giảng viên: Chưa phân công. Việc phân công giảng viên và thiết lập lịch học sẽ được thực hiện ở bước vận hành lớp.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/ngoài phạm vi/i)).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Thời gian đăng ký' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Thời gian lớp học' })).toBeInTheDocument();
    for (const label of ['Mở đăng ký', 'Đóng đăng ký', 'Bắt đầu lớp', 'Kết thúc lớp']) {
      const group = screen.getByRole('group', { name: label });
      expect(within(group).getByLabelText('Ngày')).toHaveAttribute('type', 'date');
      expect(within(group).getByLabelText('Giờ')).toHaveAttribute('type', 'time');
    }
    expect(document.querySelector('input[type="datetime-local"]')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Khóa học'), { target: { value: course.id } });
    fireEvent.change(screen.getByLabelText('Tên lớp'), { target: { value: offering.name } });
    fireEvent.change(screen.getByLabelText('Mã lớp'), { target: { value: offering.code } });
    expect(screen.queryByRole('combobox', { name: 'Trạng thái' })).not.toBeInTheDocument();
    expect(screen.getByText('Bản nháp (trạng thái khởi tạo)')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Hình thức'), { target: { value: 'HYBRID' } });
    fireEvent.change(screen.getByLabelText('Loại học phí'), { target: { value: 'PAID' } });
    fireEvent.change(screen.getByLabelText('Học phí (VND)'), { target: { value: '1500000' } });
    fireEvent.change(screen.getByLabelText('Sĩ số tối đa'), { target: { value: '20' } });
    fireEvent.change(screen.getByLabelText('Tổng số buổi'), { target: { value: '12' } });
    fireEvent.change(screen.getByLabelText('Tổng số tiết'), { target: { value: '24' } });
    setDateTime('Mở đăng ký', '2026-10-01', '08:00');
    setDateTime('Đóng đăng ký', '2026-10-15', '08:00');
    setDateTime('Bắt đầu lớp', '2026-10-20', '08:00');
    setDateTime('Kết thúc lớp', '2026-12-20', '08:00');
    fireEvent.click(screen.getByRole('button', { name: 'Tạo lớp học' }));
    await waitFor(() => expect(create).toHaveBeenCalledOnce());
    expect(create.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        courseId: course.id,
        code: offering.code,
        modality: 'HYBRID',
        totalSessions: 12,
        totalPeriods: 24,
        maxStudents: 20,
        pricingType: 'PAID',
        tuitionFeeVnd: 1_500_000,
        enrollmentStart: new Date('2026-10-01T08:00').toISOString(),
        enrollmentEnd: new Date('2026-10-15T08:00').toISOString(),
        classStart: new Date('2026-10-20T08:00').toISOString(),
        classEnd: new Date('2026-12-20T08:00').toISOString(),
      }),
    );
    expect(create.mock.calls[0][0]).not.toHaveProperty('instructorId');
    expect(create.mock.calls[0][0]).not.toHaveProperty('status');
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
    expect(
      await screen.findByText(
        'Giảng viên: Instructor One. Việc phân công giảng viên và thiết lập lịch học sẽ được thực hiện ở bước vận hành lớp.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/ngoài phạm vi/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/giảng viên/i)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Trạng thái'), { target: { value: 'OPEN' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    await waitFor(() => expect(update).toHaveBeenCalledOnce());
    expect(update.mock.calls[0][1]).not.toHaveProperty('instructorId');
  });

  it('populates local date/time parts and round-trips unchanged edit instants', async () => {
    const timedOffering = {
      ...offering,
      enrollmentStart: '2026-11-01T11:00:00.000Z',
      enrollmentEnd: '2026-11-10T11:00:00.000Z',
      classStart: '2026-11-15T11:00:00.000Z',
      classEnd: '2026-12-15T11:00:00.000Z',
    };
    vi.spyOn(adminApi.offerings, 'get').mockResolvedValue(timedOffering);
    mockCourses([course]);
    const update = vi.spyOn(adminApi.offerings, 'update').mockResolvedValue(timedOffering);
    renderAdminApp(`/admin/class-offerings/${offering.id}/edit`);

    const expectedStart = localDateTimeParts(timedOffering.enrollmentStart);
    const registrationStart = await screen.findByRole('group', { name: 'Mở đăng ký' });
    expect(within(registrationStart).getByLabelText('Ngày')).toHaveValue(expectedStart.date);
    expect(within(registrationStart).getByLabelText('Giờ')).toHaveValue(expectedStart.time);
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

    await waitFor(() => expect(update).toHaveBeenCalledOnce());
    expect(update.mock.calls[0][1]).toEqual(
      expect.objectContaining({
        enrollmentStart: timedOffering.enrollmentStart,
        enrollmentEnd: timedOffering.enrollmentEnd,
        classStart: timedOffering.classStart,
        classEnd: timedOffering.classEnd,
      }),
    );
  });

  it('sends null when both local date/time parts are cleared in edit mode', async () => {
    const timedOffering = {
      ...offering,
      enrollmentStart: '2026-11-01T11:00:00.000Z',
    };
    vi.spyOn(adminApi.offerings, 'get').mockResolvedValue(timedOffering);
    mockCourses([course]);
    const update = vi.spyOn(adminApi.offerings, 'update').mockResolvedValue(timedOffering);
    renderAdminApp(`/admin/class-offerings/${offering.id}/edit`);
    const registrationStart = await screen.findByRole('group', { name: 'Mở đăng ký' });
    fireEvent.change(within(registrationStart).getByLabelText('Ngày'), { target: { value: '' } });
    fireEvent.change(within(registrationStart).getByLabelText('Giờ'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

    await waitFor(() => expect(update).toHaveBeenCalledOnce());
    expect(update.mock.calls[0][1]).toEqual(expect.objectContaining({ enrollmentStart: null }));
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
        {
          ...base,
          enrollmentStartDate: '2026-10-02',
          enrollmentStartTime: '10:00',
          enrollmentEndDate: '2026-10-01',
          enrollmentEndTime: '10:00',
        },
        false,
      ).errors.enrollmentEnd,
    ).toBeDefined();
    expect(
      buildOfferingInput(
        {
          ...base,
          classStartDate: '2026-10-02',
          classStartTime: '10:00',
          classEndDate: '2026-10-02',
          classEndTime: '10:00',
        },
        false,
      ).errors.classEnd,
    ).toBeDefined();
  });

  it('requires both date and time for each optional business datetime', () => {
    const base = { ...initialOfferingValues(null), courseId: course.id, name: 'Class' };
    expect(
      buildOfferingInput({ ...base, enrollmentStartDate: '2026-11-01' }, false).errors
        .enrollmentStart,
    ).toBe('Vui lòng nhập cả ngày và giờ.');
    expect(buildOfferingInput({ ...base, classEndTime: '18:00' }, false).errors.classEnd).toBe(
      'Vui lòng nhập cả ngày và giờ.',
    );
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
    expect(result.input).not.toHaveProperty('enrollmentStart');
    expect(result.input).not.toHaveProperty('enrollmentEnd');
    expect(result.input).not.toHaveProperty('classStart');
    expect(result.input).not.toHaveProperty('classEnd');
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
function setDateTime(label: string, date: string, time: string) {
  const group = screen.getByRole('group', { name: label });
  fireEvent.change(within(group).getByLabelText('Ngày'), { target: { value: date } });
  fireEvent.change(within(group).getByLabelText('Giờ'), { target: { value: time } });
}
function localDateTimeParts(value: string) {
  const date = new Date(value);
  const pad = (part: number) => String(part).padStart(2, '0');
  return {
    date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    time: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  };
}
function mockObjectUrls() {
  const NativeUrl = URL;
  class TestUrl extends NativeUrl {}
  TestUrl.createObjectURL = vi.fn(() => 'blob:course-thumbnail-preview');
  TestUrl.revokeObjectURL = vi.fn();
  vi.stubGlobal('URL', TestUrl);
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
