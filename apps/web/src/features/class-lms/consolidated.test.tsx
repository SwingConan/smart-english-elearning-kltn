import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MyDashboardPage } from '@/pages/MyDashboardPage';
import { ClassLearningPage } from '@/pages/ClassLearningPage';
const mock = vi.hoisted(() => ({ fetch: vi.fn(), role: 'INSTRUCTOR' }));
vi.mock('@/lib/api-client', () => ({
  apiFetch: (...a: unknown[]) => mock.fetch(...a),
  apiUrl: (s: string) => '/api' + s,
}));
vi.mock('@/features/auth/auth-context', () => ({
  useAuth: () => ({ user: { id: 'self', role: mock.role, fullName: 'Synthetic CF' } }),
}));
beforeEach(() => {
  mock.fetch.mockReset();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
describe('W03A CF01 metadata publication and calendar prominence', () => {
  it('teacher sees pending metadata warning and explicitly publishes exact Section CAS', async () => {
    mock.role = 'INSTRUCTOR';
    mock.fetch.mockResolvedValue({
      class: { id: 'c', code: 'CF', name: 'Class' },
      editable: true,
      sections: [
        {
          id: 's',
          title: 'Pending Section title',
          introduction: 'Pending introduction',
          lockVersion: 7,
          hasDraftChanges: true,
          publishedMetadata: {
            title: 'Old public title',
            introduction: 'Old public intro',
            number: 1,
          },
          activities: [],
        },
      ],
    });
    render(
      <MemoryRouter initialEntries={['/classroom/c?edit=1']}>
        <Routes>
          <Route path="/classroom/:classId" element={<ClassLearningPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByText(/Có thay đổi nháp; học viên vẫn thấy/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Công bố chủ đề' }));
    await waitFor(() =>
      expect(mock.fetch).toHaveBeenCalledWith('/v2/class-lms/classes/c/sections/s/publish', {
        method: 'POST',
        body: JSON.stringify({ expectedLockVersion: 7 }),
      }),
    );
  });
  it('empty learner Section projection renders no unpublished names or publication controls', async () => {
    mock.role = 'STUDENT';
    mock.fetch.mockResolvedValue({
      class: { id: 'c', code: 'CF', name: 'Class' },
      editable: false,
      sections: [],
    });
    render(
      <MemoryRouter initialEntries={['/classroom/c?edit=1']}>
        <Routes>
          <Route path="/classroom/:classId" element={<ClassLearningPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(
      await screen.findByText('Chưa có nội dung đã công bố, đang khả dụng cho bạn.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Pending Section title')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Công bố chủ đề' })).not.toBeInTheDocument();
  });
  it('calendar comes before recent cards and an unscoped manager cannot see New Event', async () => {
    mock.role = 'ACADEMIC_MANAGER';
    mock.fetch.mockImplementation((p: string) =>
      Promise.resolve(
        p.endsWith('/classes')
          ? { data: [], canProposeOfficialSession: false }
          : { data: [], truncated: false },
      ),
    );
    render(
      <MemoryRouter>
        <MyDashboardPage />
      </MemoryRouter>,
    );
    const calendar = await screen.findByRole('heading', { name: 'Lịch tháng' }),
      recent = screen.getByRole('heading', { name: 'Các lớp học được truy cập gần đây' });
    expect(
      calendar.compareDocumentPosition(recent) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.queryByRole('link', { name: /Sự kiện mới/ })).not.toBeInTheDocument();
  });
  it('manager shortcut fails closed after capability refresh error', async () => {
    mock.role = 'ACADEMIC_MANAGER';
    let calls = 0;
    mock.fetch.mockImplementation((p: string) =>
      p.endsWith('/classes')
        ? ++calls === 1
          ? Promise.resolve({ data: [], canProposeOfficialSession: true })
          : Promise.reject(Error('scope unavailable'))
        : Promise.reject(Error('calendar unavailable')),
    );
    render(
      <MemoryRouter>
        <MyDashboardPage />
      </MemoryRouter>,
    );
    expect(await screen.findByRole('link', { name: /Sự kiện mới/ })).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'Thử lại' }));
    await waitFor(() =>
      expect(screen.queryByRole('link', { name: /Sự kiện mới/ })).not.toBeInTheDocument(),
    );
  });
});
