import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuth } from '@/features/auth/auth-context';
import { apiFetch, ApiError } from '@/lib/api-client';
import { ProfilePage } from './ProfilePage';
import { ClassProgressPage } from './ClassProgressPage';
import { CompletionPage } from './CompletionPage';
import { OperationsLivePage } from './OperationsLivePage';
import { ClassLearningPage } from '@/pages/ClassLearningPage';
vi.mock('@/features/auth/auth-context', () => ({ useAuth: vi.fn() }));
vi.mock('@/lib/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api-client')>()),
  apiFetch: vi.fn(),
}));
const user = {
  id: 'owner',
  role: 'STUDENT' as const,
  status: 'ACTIVE' as const,
  email: 'synthetic@example.invalid',
  fullName: 'Synthetic learner',
};
beforeEach(() =>
  vi.mocked(useAuth).mockReturnValue({
    user,
    isLoading: false,
    error: null,
    refreshUser: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    register: vi.fn(),
  }),
);
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
function show(element: React.ReactNode, path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={element} />
        <Route path="/classroom/:classId/progress" element={element} />
      </Routes>
    </MemoryRouter>,
  );
}
describe('Final ship actual React screens (offline API doubles only)', () => {
  it('shows current profile read-only, without a fake save or privileged role editor', () => {
    show(<ProfilePage />);
    expect(screen.getByText('Synthetic learner')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Lưu/ })).not.toBeInTheDocument();
  });
  it('renders current publication progress and pending grades without a fabricated percent/zero', async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      class: { id: 'class-a', code: 'A', name: 'Class A' },
      completion: 'POLICY_NOT_EVALUATED',
      percentage: null,
      entries: [
        {
          activityId: 'a',
          revisionId: 'r',
          revisionNumber: 2,
          title: 'Published assignment',
          type: 'ASSIGNMENT',
          state: 'PENDING_REVIEW',
        },
      ],
    });
    show(<ClassProgressPage />, '/classroom/class-a/progress');
    await screen.findByText('Published assignment');
    expect(screen.getByText('Chờ chấm bài')).toBeInTheDocument();
    expect(screen.queryByText('0%')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Mở hoạt động' })).toHaveAttribute(
      'href',
      '/classroom/class-a/activities/a',
    );
  });
  it('renders owner completion as policy-blocked, not issued or zero certificates', async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      assessment: 'PENDING_POLICY',
      certificates: null,
      issuanceAvailable: false,
      enrollments: [],
    });
    show(<CompletionPage />);
    await screen.findByText('Chờ chính sách và xác minh học vụ');
    expect(screen.getByRole('button', { name: /Tải chứng chỉ/ })).toBeDisabled();
    expect(screen.queryByText('0 chứng chỉ')).not.toBeInTheDocument();
  });
  it('renders denied without continuing to show academic or financial data', async () => {
    vi.mocked(apiFetch).mockRejectedValue(new ApiError(403, null));
    show(<ClassProgressPage />, '/classroom/class-a/progress');
    expect(await screen.findByRole('alert')).toHaveTextContent('không có quyền');
    expect(screen.queryByRole('link', { name: 'Mở hoạt động' })).not.toBeInTheDocument();
  });
  it('reports UNKNOWN/UNVERIFIED and blocks export on genuine-source integration gaps', async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      viewerId: 'owner',
      role: 'STUDENT',
      mode: 'INTEGRATION_BLOCKED',
      health: 'UNKNOWN',
      runtimeAuthorized: false,
      sources: [
        {
          domain: 'W05B_CONSULTATION',
          state: 'UNVERIFIED',
          reason: 'REAL_CLOCK_ACCEPTANCE_DEFERRED',
        },
      ],
    });
    show(<OperationsLivePage />);
    await screen.findByText('W05B_CONSULTATION');
    expect(screen.getByText('UNKNOWN')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Xuất CSV/ })).toBeDisabled();
  });
  it('rejects a response bound to another principal', async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      viewerId: 'foreign',
      role: 'STUDENT',
      sources: [{ domain: 'PRIVATE' }],
    });
    show(<OperationsLivePage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('không phù hợp');
    expect(screen.queryByText('PRIVATE')).not.toBeInTheDocument();
  });
  it('removes teacher-only cached class content immediately when the principal changes', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { ...user, role: 'INSTRUCTOR' },
      isLoading: false,
      error: null,
      refreshUser: vi.fn(),
      login: vi.fn(),
      logout: vi.fn(),
      register: vi.fn(),
    });
    vi.mocked(apiFetch).mockResolvedValueOnce({
      class: { id: 'class-a', code: 'A', name: 'Class A' },
      editable: true,
      sections: [
        {
          id: 's',
          title: 'PRIVATE TEACHER DRAFT',
          introduction: '',
          lockVersion: 0,
          activities: [],
        },
      ],
    });
    const view = show(<ClassLearningPage />, '/classroom/class-a/progress');
    await screen.findByText('PRIVATE TEACHER DRAFT');
    vi.mocked(useAuth).mockReturnValue({
      user: { ...user, id: 'foreign' },
      isLoading: false,
      error: null,
      refreshUser: vi.fn(),
      login: vi.fn(),
      logout: vi.fn(),
      register: vi.fn(),
    });
    vi.mocked(apiFetch).mockReturnValue(new Promise(() => {}));
    view.rerender(
      <MemoryRouter initialEntries={['/classroom/class-a/progress']}>
        <Routes>
          <Route path="/classroom/:classId/progress" element={<ClassLearningPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.queryByText('PRIVATE TEACHER DRAFT')).not.toBeInTheDocument();
  });
});
