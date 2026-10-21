import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useCallback, useState } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '@/features/auth/auth-context';
import type { AuthUser } from '@/features/auth/api';
import { ApiError } from '@/lib/api-client';
import { AdminClassOfferingOperationsPage } from '@/pages/AdminClassOfferingOperationsPage';
import { adminApi } from './api';
import type { AdminClassOffering, AdminRoster } from './types';

const classId = '20000000-0000-4000-8000-000000000001';
const instructorId = '20000000-0000-4000-8000-000000000002';
const secondInstructorId = '20000000-0000-4000-8000-000000000003';
const offering: AdminClassOffering = {
  id: classId,
  courseId: '10000000-0000-4000-8000-000000000001',
  instructorId,
  code: 'TOEIC-OPS-01',
  name: 'Lớp vận hành mẫu',
  status: 'DRAFT',
  modality: 'HYBRID',
  pricingType: 'FREE',
  tuitionFeeVnd: 0,
  maxStudents: 20,
  totalSessions: 12,
  totalPeriods: 24,
  enrollmentStart: null,
  enrollmentEnd: null,
  classStart: '2026-11-01T00:00:00.000Z',
  classEnd: '2026-12-01T00:00:00.000Z',
  createdAt: '2026-10-21T00:00:00.000Z',
  updatedAt: '2026-10-21T00:00:00.000Z',
  course: {
    id: 'course-id',
    title: 'TOEIC Foundation',
    slug: 'toeic-foundation',
    isPublished: true,
  },
  instructor: {
    id: instructorId,
    fullName: 'Trần Thu Hà',
    email: 'ha@example.com',
    role: 'INSTRUCTOR',
    status: 'ACTIVE',
  },
  scheduleSlots: [
    {
      id: '30000000-0000-4000-8000-000000000001',
      dayOfWeek: 7,
      startTime: '08:15',
      endTime: '10:00',
      locationText: 'Phòng 201',
      meetingUrl: null,
    },
  ],
  registeredCount: 1,
  remainingSeats: 19,
  isFull: false,
  registrationState: 'AVAILABLE',
  operationalReadiness: { isReady: true, missing: [] },
};
const roster: AdminRoster = {
  classOffering: offering,
  summary: {
    total: 5,
    active: 1,
    pendingPayment: 1,
    completed: 1,
    droppedOrCancelled: 2,
    maxStudents: 20,
  },
  data: [
    {
      id: '40000000-0000-4000-8000-000000000001',
      status: 'ACTIVE',
      enrolledAt: '2026-10-20T00:00:00.000Z',
      learner: { id: 'learner-1', fullName: 'Nguyễn Minh An', email: 'an@example.com' },
    },
    {
      id: '40000000-0000-4000-8000-000000000002',
      status: 'PENDING_PAYMENT',
      enrolledAt: '2026-10-20T00:00:00.000Z',
      learner: { id: 'learner-2', fullName: 'Lê Bình', email: 'binh@example.com' },
    },
    {
      id: '40000000-0000-4000-8000-000000000003',
      status: 'COMPLETED',
      enrolledAt: '2026-10-19T00:00:00.000Z',
      learner: { id: 'learner-3', fullName: 'Trần Chi', email: 'chi@example.com' },
    },
    {
      id: '40000000-0000-4000-8000-000000000004',
      status: 'DROPPED',
      enrolledAt: '2026-10-18T00:00:00.000Z',
      learner: { id: 'learner-4', fullName: 'Phạm Dũng', email: 'dung@example.com' },
    },
    {
      id: '40000000-0000-4000-8000-000000000005',
      status: 'CANCELLED',
      enrolledAt: '2026-10-17T00:00:00.000Z',
      learner: { id: 'learner-5', fullName: 'Vũ Em', email: 'em@example.com' },
    },
  ],
  meta: { total: 5, page: 1, limit: 20, totalPages: 1 },
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('AdminClassOfferingOperationsPage', () => {
  it('renders readiness, canonical Sunday schedule, roster, and responsive variants', async () => {
    mockApis();
    renderOperations();
    expect(await screen.findByRole('heading', { name: 'Lớp vận hành mẫu' })).toBeInTheDocument();
    expect(screen.getByText('Sẵn sàng vận hành')).toBeInTheDocument();
    expect(screen.getByText('CN · 08:15–10:00')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'CN · Chủ nhật' })).toHaveValue('7');
    expect((await screen.findAllByText('Nguyễn Minh An')).length).toBe(2);
    expect(document.querySelector('.md\\:hidden')).toBeInTheDocument();
    expect(screen.queryByText('DRAFT')).not.toBeInTheDocument();
    expect(screen.queryByText('PENDING_PAYMENT')).not.toBeInTheDocument();
    expect(screen.getByText('Rời lớp / Đã hủy')).toBeInTheDocument();
    expect(screen.queryByText('Đã thôi học')).not.toBeInTheDocument();
    const badgeExpectations = {
      ACTIVE: ['Đang học', 'bg-emerald-50'],
      PENDING_PAYMENT: ['Chờ thanh toán', 'bg-amber-50'],
      COMPLETED: ['Hoàn thành', 'bg-blue-50'],
      DROPPED: ['Đã rời lớp', 'bg-slate-100'],
      CANCELLED: ['Đã hủy', 'bg-rose-50'],
    } as const;
    for (const [status, [label, semanticClass]] of Object.entries(badgeExpectations)) {
      const badges = screen.getAllByTestId(`enrollment-status-${status}`);
      expect(badges).toHaveLength(2);
      for (const badge of badges) {
        expect(badge).toHaveTextContent(label);
        expect(badge).toHaveClass(semanticClass, 'rounded-full', 'font-semibold');
      }
    }
    expect(screen.queryByText(/Xác nhận thanh toán/i)).not.toBeInTheDocument();
  });

  it('opens a ready draft and assigns, changes, or removes only active instructors', async () => {
    mockApis();
    vi.stubGlobal(
      'confirm',
      vi.fn(() => true),
    );
    const update = vi
      .spyOn(adminApi.offerings, 'update')
      .mockResolvedValue({ ...offering, status: 'OPEN' });
    const assign = vi.spyOn(adminApi.offerings, 'assignInstructor').mockResolvedValue(offering);
    renderOperations();
    fireEvent.click(await screen.findByRole('button', { name: 'Mở lớp' }));
    await waitFor(() => expect(update).toHaveBeenCalledWith(classId, { status: 'OPEN' }));
    await waitFor(() => expect(adminApi.offerings.get).toHaveBeenCalledTimes(2));

    const selector = await screen.findByLabelText('Giảng viên đang hoạt động');
    fireEvent.change(selector, { target: { value: secondInstructorId } });
    fireEvent.click(screen.getByRole('button', { name: 'Thay đổi' }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith(classId, secondInstructorId));
    await waitFor(() => expect(adminApi.offerings.get).toHaveBeenCalledTimes(3));
    fireEvent.click(await screen.findByRole('button', { name: 'Gỡ phân công' }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith(classId, null));
    expect(screen.queryByText('M09B Inactive')).not.toBeInTheDocument();
  });

  it('creates, edits, and deletes weekly schedule slots using type=time values', async () => {
    mockApis();
    vi.stubGlobal(
      'confirm',
      vi.fn(() => true),
    );
    const create = vi
      .spyOn(adminApi.offerings, 'createScheduleSlot')
      .mockResolvedValue(offering.scheduleSlots[0]);
    const update = vi
      .spyOn(adminApi.offerings, 'updateScheduleSlot')
      .mockResolvedValue(offering.scheduleSlots[0]);
    const remove = vi
      .spyOn(adminApi.offerings, 'deleteScheduleSlot')
      .mockResolvedValue({ deleted: true, id: offering.scheduleSlots[0].id });
    renderOperations();
    await screen.findByRole('heading', { name: 'Lịch học' });
    const start = screen.getByLabelText('Giờ bắt đầu');
    const end = screen.getByLabelText('Giờ kết thúc');
    expect(start).toHaveAttribute('type', 'time');
    fireEvent.change(start, { target: { value: '13:30' } });
    fireEvent.change(end, { target: { value: '15:00' } });
    fireEvent.change(screen.getByLabelText('Phòng / địa điểm'), { target: { value: 'Phòng 305' } });
    fireEvent.click(screen.getByRole('button', { name: 'Thêm lịch' }));
    await waitFor(() =>
      expect(create).toHaveBeenCalledWith(
        classId,
        expect.objectContaining({ startTime: '13:30', endTime: '15:00' }),
      ),
    );
    await waitFor(() => expect(adminApi.offerings.get).toHaveBeenCalledTimes(2));

    fireEvent.click(await screen.findByRole('button', { name: 'Chỉnh sửa' }));
    fireEvent.change(screen.getByLabelText('Giờ kết thúc'), { target: { value: '10:15' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu lịch học' }));
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith(
        classId,
        offering.scheduleSlots[0].id,
        expect.objectContaining({ endTime: '10:15' }),
      ),
    );
    await waitFor(() => expect(adminApi.offerings.get).toHaveBeenCalledTimes(3));
    fireEvent.click(await screen.findByRole('button', { name: 'Xóa' }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith(classId, offering.scheduleSlots[0].id));
  });

  it('preserves schedule input and edit state when the API mutation fails', async () => {
    mockApis();
    vi.spyOn(adminApi.offerings, 'createScheduleSlot').mockRejectedValue(new ApiError(400, null));
    renderOperations();
    await screen.findByRole('heading', { name: 'Lịch học' });
    fireEvent.change(screen.getByLabelText('Giờ bắt đầu'), { target: { value: '13:30' } });
    fireEvent.change(screen.getByLabelText('Giờ kết thúc'), { target: { value: '15:00' } });
    fireEvent.change(screen.getByLabelText('Phòng / địa điểm'), {
      target: { value: 'Phòng cần sửa' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Thêm lịch' }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByLabelText('Giờ bắt đầu')).toHaveValue('13:30');
    expect(screen.getByLabelText('Giờ kết thúc')).toHaveValue('15:00');
    expect(screen.getByLabelText('Phòng / địa điểm')).toHaveValue('Phòng cần sửa');
  });

  it('filters roster and exposes only allowed status actions with confirmation', async () => {
    mockApis();
    vi.stubGlobal(
      'confirm',
      vi.fn(() => true),
    );
    const list = vi.spyOn(adminApi.offerings, 'roster').mockResolvedValue(roster);
    const update = vi.spyOn(adminApi.offerings, 'updateRosterStatus').mockResolvedValue({
      enrollment: { ...roster.data[0], status: 'DROPPED' },
      classOffering: offering,
    });
    renderOperations();
    await screen.findAllByText('Nguyễn Minh An');
    expect(screen.getAllByRole('button', { name: 'Cho thôi học' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Hủy ghi danh' })).toHaveLength(4);
    expect(screen.getAllByText('Không có thao tác')).toHaveLength(6);
    fireEvent.change(screen.getByLabelText('Tìm học viên'), { target: { value: 'Minh An' } });
    fireEvent.change(screen.getByLabelText('Trạng thái ghi danh'), { target: { value: 'ACTIVE' } });
    fireEvent.click(screen.getAllByRole('button', { name: /^Tìm$/ }).at(-1)!);
    await waitFor(() =>
      expect(list).toHaveBeenLastCalledWith(
        classId,
        expect.objectContaining({ search: 'Minh An', status: 'ACTIVE' }),
        expect.any(AbortSignal),
      ),
    );
    fireEvent.click(screen.getAllByRole('button', { name: 'Cho thôi học' })[0]);
    await waitFor(() => expect(update).toHaveBeenCalledWith(classId, roster.data[0].id, 'DROPPED'));
    expect(screen.queryByRole('button', { name: /Hoàn thành/i })).not.toBeInTheDocument();
  });

  it('shows controlled errors, empty states, retry, and redirects expired sessions', async () => {
    mockApis();
    vi.spyOn(adminApi.offerings, 'get').mockRejectedValueOnce(new Error('raw stack'));
    const failed = renderOperations();
    expect(await screen.findByRole('alert')).toHaveTextContent(/Không thể kết nối/);
    expect(screen.queryByText(/raw stack/)).not.toBeInTheDocument();
    failed.unmount();

    mockApis({
      roster: { ...roster, data: [], meta: { ...roster.meta, total: 0, totalPages: 0 } },
    });
    vi.spyOn(adminApi.offerings, 'get').mockRejectedValueOnce(new ApiError(401, null));
    const refresh = vi.fn().mockResolvedValue(undefined);
    renderOperations(refresh, true);
    expect(await screen.findByTestId('location')).toHaveTextContent(
      `/login?returnUrl=%2Fadmin%2Fclass-offerings%2F${classId}%2Foperations`,
    );
    expect(refresh).toHaveBeenCalledOnce();
  });

  it('redirects through the admin session-expiry flow when instructor options return 401', async () => {
    mockApis();
    vi.spyOn(adminApi.offerings, 'instructorOptions').mockRejectedValue(new ApiError(401, null));
    const refresh = vi.fn().mockResolvedValue(undefined);
    renderOperations(refresh, true);

    expect(await screen.findByTestId('location')).toHaveTextContent(
      `/login?returnUrl=%2Fadmin%2Fclass-offerings%2F${classId}%2Foperations`,
    );
    expect(refresh).toHaveBeenCalledOnce();
  });
});

function mockApis(options: { roster?: AdminRoster } = {}) {
  vi.spyOn(adminApi.offerings, 'get').mockResolvedValue(offering);
  vi.spyOn(adminApi.offerings, 'instructorOptions').mockResolvedValue({
    data: [
      { id: instructorId, fullName: 'Trần Thu Hà', email: 'ha@example.com' },
      { id: secondInstructorId, fullName: 'Nguyễn Văn Nam', email: 'nam@example.com' },
    ],
    meta: { total: 2, page: 1, limit: 50, totalPages: 1 },
  });
  vi.spyOn(adminApi.offerings, 'roster').mockResolvedValue(options.roster ?? roster);
}

function renderOperations(onRefresh = vi.fn().mockResolvedValue(undefined), includeLogin = false) {
  return render(
    <MemoryRouter initialEntries={[`/admin/class-offerings/${classId}/operations`]}>
      <TestAuthProvider onRefresh={onRefresh}>
        <Routes>
          <Route
            path="/admin/class-offerings/:classOfferingId/operations"
            element={<AdminClassOfferingOperationsPage />}
          />
          {includeLogin ? <Route path="/login" element={<LocationProbe />} /> : null}
        </Routes>
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
  const [user, setUser] = useState<AuthUser | null>({
    id: 'admin-id',
    email: 'admin@example.com',
    fullName: 'Admin',
    role: 'ADMIN_COORDINATOR',
    status: 'ACTIVE',
  });
  const refreshUser = useCallback(async () => {
    await onRefresh();
    setUser(null);
  }, [onRefresh]);
  const value: AuthContextValue = {
    user,
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
