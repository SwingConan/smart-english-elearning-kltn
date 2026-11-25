import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '@/App';
import { AuthContext, type AuthContextValue } from '@/features/auth/auth-context';
import type { UserRole } from '@/features/auth/api';
import { academicApi, type Program, type AcademicClass } from './api';
const program: Program = {
  id: 'program',
  title: 'TOEIC draft',
  slug: 'toeic-draft',
  description: 'Draft standards',
  level: 'BASIC',
  skillScope: 'LR',
  isPublished: false,
  createdById: 'self',
  updatedAt: '2026-10-30T10:00:00.000Z',
  editable: true,
  modules: [],
  _count: { classOfferings: 0 },
};
const cls: AcademicClass = {
  id: 'class',
  courseId: 'program',
  code: 'DEV-01',
  name: 'DEV evening',
  status: 'DRAFT',
  modality: 'ONLINE',
  maxStudents: 20,
  pricingType: 'FREE',
  tuitionFeeVnd: 0,
  updatedAt: program.updatedAt,
  activeLearnerCount: 0,
  editable: true,
  course: { id: 'program', title: program.title, createdById: 'self' },
  instructor: null,
  scheduleSlots: [],
};
function app(role: UserRole, path = '/academic') {
  const context: AuthContextValue = {
    user: {
      id: 'self',
      email: 'dev@example.invalid',
      fullName: 'Synthetic academic',
      role,
      status: 'ACTIVE',
    },
    isLoading: false,
    error: null,
    login: vi.fn(),
    logout: vi.fn(),
    register: vi.fn(),
    refreshUser: vi.fn(),
  };
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthContext.Provider value={context}>
        <App />
      </AuthContext.Provider>
    </MemoryRouter>,
  );
}
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
describe('W02A real routes and forms', () => {
  it.each([
    'STUDENT',
    'INSTRUCTOR',
    'COUNSELOR',
    'CASHIER',
    'TEACHING_INSPECTOR',
    'SYSTEM_ADMIN',
    'ADMIN_COORDINATOR',
  ] as UserRole[])('%s cannot force the HVU management UI', async (role) => {
    const list = vi.spyOn(academicApi, 'programs');
    app(role);
    expect(await screen.findByText(/403/)).toBeInTheDocument();
    expect(list).not.toHaveBeenCalled();
  });
  it('HVU creates a real draft request with reason; navigation uses V2 domain endpoints', async () => {
    vi.spyOn(academicApi, 'programs').mockResolvedValue({
      data: [],
      meta: { total: 0, page: 1, limit: 10 },
    });
    vi.spyOn(academicApi, 'program').mockResolvedValue(program);
    vi.spyOn(academicApi, 'classes').mockResolvedValue({
      data: [],
      meta: { total: 0, page: 1, limit: 10 },
    });
    const write = vi.spyOn(academicApi, 'write').mockResolvedValue(program);
    app('ACADEMIC_MANAGER');
    await screen.findByText('Chưa có dữ liệu trong phạm vi này.');
    fireEvent.change(screen.getByLabelText('Tên chương trình'), {
      target: { value: 'TOEIC draft' },
    });
    fireEvent.change(screen.getByLabelText('Lý do tạo'), {
      target: { value: 'Create synthetic draft for review' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo bản nháp' }));
    await waitFor(() =>
      expect(write).toHaveBeenCalledWith(
        '/programs',
        expect.objectContaining({
          title: 'TOEIC draft',
          reason: 'Create synthetic draft for review',
        }),
      ),
    );
    expect(await screen.findByRole('heading', { name: 'TOEIC draft' })).toBeInTheDocument();
  });
  it('operational class/tuition remains read-only; active and pending counts remain distinct', async () => {
    vi.spyOn(academicApi, 'classroom').mockResolvedValue({
      ...cls,
      status: 'OPEN',
      editable: false,
      activeLearnerCount: 1,
    });
    vi.spyOn(academicApi, 'roster').mockResolvedValue({
      data: [
        {
          id: 'own',
          status: 'ACTIVE',
          enrolledAt: program.updatedAt,
          learner: { id: 'learner', fullName: 'DEV learner' },
        },
      ],
      meta: { total: 1, page: 1, limit: 10 },
      summary: { ACTIVE: 1, PENDING_PAYMENT: 2 },
    });
    app('ACADEMIC_MANAGER', '/academic/classes/class');
    await screen.findByRole('heading', { name: 'DEV-01 · DEV evening' });
    expect(screen.getByLabelText('Sĩ số tối đa')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Lưu lớp nháp' })).not.toBeInTheDocument();
    expect(screen.getByText(/Đang học: 1 · Chờ thanh toán: 2/)).toBeInTheDocument();
    expect(screen.getByText(/chưa phải lịch buổi học chính thức/)).toBeInTheDocument();
  });
  it('stale edit displays error and retains unsaved input; sends the server version token', async () => {
    vi.spyOn(academicApi, 'classroom').mockResolvedValue(cls);
    vi.spyOn(academicApi, 'roster').mockResolvedValue({
      data: [],
      meta: { total: 0, page: 1, limit: 10 },
      summary: {},
    });
    const write = vi.spyOn(academicApi, 'write').mockRejectedValue(new Error('409 stale'));
    app('ACADEMIC_MANAGER', '/academic/classes/class');
    await screen.findByRole('heading', { name: 'DEV-01 · DEV evening' });
    fireEvent.change(screen.getByLabelText('Tên lớp'), { target: { value: 'Unsaved newer name' } });
    fireEvent.change(screen.getByLabelText('Lý do thay đổi'), {
      target: { value: 'Synthetic version test reason' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu lớp nháp' }));
    await screen.findByRole('alert');
    expect(write).toHaveBeenCalledWith(
      '/classes/class',
      expect.objectContaining({ expectedUpdatedAt: program.updatedAt, name: 'Unsaved newer name' }),
      'PATCH',
    );
    expect(screen.getByLabelText('Tên lớp')).toHaveValue('Unsaved newer name');
  });
  it('foreign student resource fails without rendering another roster', async () => {
    vi.spyOn(academicApi, 'classroom').mockRejectedValue(new Error('404'));
    vi.spyOn(academicApi, 'roster').mockRejectedValue(new Error('404'));
    app('STUDENT', '/academic/classes/foreign');
    expect(await screen.findByRole('alert')).toHaveTextContent('Không tìm thấy lớp');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});
