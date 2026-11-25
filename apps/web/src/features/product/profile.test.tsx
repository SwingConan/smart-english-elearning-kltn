import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuth } from '@/features/auth/auth-context';
import { enrollmentApi } from '@/features/enrollments/api';
import { apiFetch } from '@/lib/api-client';
import { ProfilePage } from './ProfilePage';

vi.mock('@/features/auth/auth-context', () => ({ useAuth: vi.fn() }));
vi.mock('@/lib/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api-client')>()),
  apiFetch: vi.fn(),
}));
vi.mock('@/features/enrollments/api', () => ({
  enrollmentApi: {
    listMine: vi.fn(),
  },
}));

describe('Student ProfilePage (/profile)', () => {
  const refreshUser = vi.fn();

  beforeEach(() => {
    refreshUser.mockResolvedValue(undefined);
    vi.mocked(useAuth).mockReturnValue({
      user: {
        id: 'stu-1',
        role: 'STUDENT',
        status: 'ACTIVE',
        email: 'student@gmail.com',
        fullName: 'Học viên Smart English',
        avatarUrl: '',
      },
      isLoading: false,
      error: null,
      refreshUser,
      login: vi.fn(),
      logout: vi.fn(),
      register: vi.fn(),
    });

    vi.mocked(enrollmentApi.listMine).mockResolvedValue([
      {
        id: 'enr-1',
        status: 'ACTIVE',
      } as never,
      {
        id: 'enr-2',
        status: 'COMPLETED',
      } as never,
    ]);

    vi.mocked(apiFetch).mockImplementation(async (path, init) => {
      if (path === '/auth/profile' && (!init || !init.method || init.method === 'GET')) {
        return {
          id: 'stu-1',
          email: 'student@gmail.com',
          fullName: 'Học viên Smart English',
          role: 'STUDENT',
          status: 'ACTIVE',
          preferences: {
            phone: '0909123456',
            timezone: 'Asia/Ho_Chi_Minh',
            emailNotifications: true,
            studyGoalNote: 'Đạt TOEIC 650 trước kỳ xét tốt nghiệp',
            avatarUrl: '',
            dateOfBirth: '2003-08-15',
            gender: 'FEMALE',
            address: '12 Nguyễn Văn Bảo, Gò Vấp, TP.HCM',
            targetScore: '650+ Chuẩn đầu ra',
          },
          updatedAt: '2026-11-15T01:00:00.000Z',
        };
      }
      if (path === '/auth/profile' && init?.method === 'PATCH') {
        const body = JSON.parse(String(init.body ?? '{}')) as Record<string, unknown>;
        return {
          id: 'stu-1',
          email: 'student@gmail.com',
          fullName: String(body.fullName ?? 'Học viên Smart English'),
          role: 'STUDENT',
          status: 'ACTIVE',
          preferences: {
            phone: String(body.phone ?? ''),
            timezone: String(body.timezone ?? 'Asia/Ho_Chi_Minh'),
            emailNotifications: Boolean(body.emailNotifications ?? true),
            studyGoalNote: String(body.studyGoalNote ?? ''),
            avatarUrl: String(body.avatarUrl ?? ''),
            dateOfBirth: String(body.dateOfBirth ?? ''),
            gender: String(body.gender ?? ''),
            address: String(body.address ?? ''),
            targetScore: String(body.targetScore ?? ''),
          },
          updatedAt: '2026-11-15T02:00:00.000Z',
        };
      }
      throw new Error(`Unexpected apiFetch: ${path}`);
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('loads and displays full student profile details in read-only mode', async () => {
    render(
      <MemoryRouter initialEntries={['/profile']}>
        <Routes>
          <Route path="/profile" element={<ProfilePage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('0909123456')).toBeInTheDocument();
    expect(screen.getByText('15/08/2003')).toBeInTheDocument();
    expect(screen.getByText('Nữ')).toBeInTheDocument();
    expect(screen.getByText('12 Nguyễn Văn Bảo, Gò Vấp, TP.HCM')).toBeInTheDocument();
    expect(screen.getAllByText('650+ Chuẩn đầu ra').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Đạt TOEIC 650 trước kỳ xét tốt nghiệp')).toBeInTheDocument();
    expect(screen.getByLabelText('Tổng quan học tập cá nhân')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('lets the student change avatar (preset/custom) and personal info, saves via PATCH /auth/profile, and refreshes header user', async () => {
    render(
      <MemoryRouter initialEntries={['/profile']}>
        <Routes>
          <Route path="/profile" element={<ProfilePage />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByText('0909123456');

    // Open editor via "Đổi ảnh đại diện" button right on the avatar
    fireEvent.click(screen.getByRole('button', { name: 'Đổi ảnh đại diện' }));
    expect(
      await screen.findByRole('form', { name: 'Biểu mẫu cập nhật hồ sơ cá nhân' }),
    ).toBeInTheDocument();

    // Pick preset avatar & edit display name + phone + target score
    fireEvent.click(screen.getByRole('button', { name: 'Học viên Cử nhân Xanh' }));
    fireEvent.change(screen.getByLabelText('Họ và tên hiển thị'), {
      target: { value: 'Nguyễn Minh Anh' },
    });
    fireEvent.change(screen.getByLabelText('Số điện thoại liên hệ'), {
      target: { value: '0988777666' },
    });
    fireEvent.change(screen.getByLabelText('Mục tiêu điểm TOEIC'), {
      target: { value: '750+ Nâng cao' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Cập nhật hồ sơ' }));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        '/auth/profile',
        expect.objectContaining({
          method: 'PATCH',
          body: expect.stringContaining('/avatars/avatar-1.svg'),
        }),
      );
    });
    expect(refreshUser).toHaveBeenCalledTimes(1);
    expect(
      await screen.findByText('Đã cập nhật hồ sơ cá nhân và ảnh đại diện thành công.'),
    ).toBeInTheDocument();
    expect(screen.getByText('0988777666')).toBeInTheDocument();
    expect(screen.getAllByText('750+ Nâng cao').length).toBeGreaterThanOrEqual(1);
    const avatarImg = screen.getByRole('img', { name: 'Học viên Smart English' });
    expect(avatarImg).toHaveAttribute('src', '/avatars/avatar-1.svg');
  });
});
