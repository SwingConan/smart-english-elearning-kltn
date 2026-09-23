import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '@/features/auth/auth-context';
import type { UserRole } from '@/features/auth/api';
import { RoleRoute } from '@/features/auth/RoleRoute';
import { instructorApi } from '@/features/instructor/api';
import type { TeachingEntry } from '@/features/instructor/types';
import { ApiError } from '@/lib/api-client';
import { AdaptivePolicyPage } from '@/pages/AdaptivePolicyPage';
import { InstructorTeachingPage } from '@/pages/InstructorTeachingPage';
import { adaptivePolicyApi } from './api';
import type { AdaptivePolicy } from './types';

const courseId = '10000000-0000-4000-8000-000000000001';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('AdaptivePolicyPage', () => {
  it('loads a saved policy, populates both inputs and explains the bands', async () => {
    vi.spyOn(adaptivePolicyApi, 'get').mockResolvedValue(policy('SAVED', 0.35, 0.75));

    renderPage();

    expect(screen.getByText(/Đang tải Adaptive Policy/i)).toBeInTheDocument();
    expect(await screen.findByLabelText('Nguồn policy')).toHaveTextContent(/SAVED:.*đã được lưu/i);
    expect(remedialInput()).toHaveValue(0.35);
    expect(progressionInput()).toHaveValue(0.75);
    expect(screen.getByText(/Needs remediation/i)).toBeInTheDocument();
    expect(screen.getByText(/UNASSESSED/i)).toBeInTheDocument();
    expect(screen.getByText(/prerequisite chỉ được xem là đạt/i)).toBeInTheDocument();
  });

  it('loads DEFAULT values without implying that a course policy is saved', async () => {
    vi.spyOn(adaptivePolicyApi, 'get').mockResolvedValue(policy('DEFAULT'));

    renderPage();

    expect(await screen.findByLabelText('Nguồn policy')).toHaveTextContent(
      /DEFAULT:.*chưa có policy riêng được lưu/i,
    );
    expect(remedialInput()).toHaveValue(0.4);
    expect(progressionInput()).toHaveValue(0.8);
  });

  it('sends the exact replacement payload and changes DEFAULT to SAVED', async () => {
    vi.spyOn(adaptivePolicyApi, 'get').mockResolvedValue(policy('DEFAULT'));
    const update = vi.spyOn(adaptivePolicyApi, 'update').mockResolvedValue(policy('SAVED'));
    renderPage();
    await screen.findByText(/DEFAULT:/i);

    submitForm();

    await waitFor(() =>
      expect(update).toHaveBeenCalledWith(courseId, {
        remedialThreshold: 0.4,
        progressionThreshold: 0.8,
      }),
    );
    expect(await screen.findByText(/SAVED:/i)).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/Đã lưu Adaptive Policy/i);
  });

  it('accepts the valid 0 and 1 boundaries', async () => {
    vi.spyOn(adaptivePolicyApi, 'get').mockResolvedValue(policy('SAVED'));
    const update = vi.spyOn(adaptivePolicyApi, 'update').mockResolvedValue(policy('SAVED', 0, 1));
    renderPage();
    await screen.findByText(/SAVED:/i);

    setThresholds('0', '1');
    submitForm();

    await waitFor(() =>
      expect(update).toHaveBeenCalledWith(courseId, {
        remedialThreshold: 0,
        progressionThreshold: 1,
      }),
    );
  });

  it.each([
    ['equal thresholds', '0.5', '0.5'],
    ['inverted thresholds', '0.8', '0.4'],
  ])('blocks %s locally', async (_name, remedial, progression) => {
    vi.spyOn(adaptivePolicyApi, 'get').mockResolvedValue(policy('SAVED'));
    const update = vi.spyOn(adaptivePolicyApi, 'update');
    renderPage();
    await screen.findByText(/SAVED:/i);

    setThresholds(remedial, progression);
    submitForm();

    expect(await screen.findByText(/Remedial Threshold phải nhỏ hơn/i)).toBeInTheDocument();
    expect(update).not.toHaveBeenCalled();
  });

  it.each([
    ['negative remedial threshold', '-0.01', '0.8'],
    ['negative progression threshold', '0', '-0.01'],
    ['remedial threshold above one', '1.01', '1'],
    ['progression threshold above one', '0.4', '1.01'],
  ])('blocks %s locally', async (_name, remedial, progression) => {
    vi.spyOn(adaptivePolicyApi, 'get').mockResolvedValue(policy('SAVED'));
    const update = vi.spyOn(adaptivePolicyApi, 'update');
    renderPage();
    await screen.findByText(/SAVED:/i);

    setThresholds(remedial, progression);
    submitForm();

    expect(await screen.findByText(/khoảng từ 0 đến 1/i)).toBeInTheDocument();
    expect(update).not.toHaveBeenCalled();
  });

  it('blocks blank and non-number values locally', async () => {
    vi.spyOn(adaptivePolicyApi, 'get').mockResolvedValue(policy('SAVED'));
    const update = vi.spyOn(adaptivePolicyApi, 'update');
    renderPage();
    await screen.findByText(/SAVED:/i);

    setThresholds('', '0.8');
    submitForm();
    expect(await screen.findByText(/đều bắt buộc/i)).toBeInTheDocument();

    remedialInput().setAttribute('type', 'text');
    setThresholds('not-a-number', '0.8');
    submitForm();
    expect(await screen.findByText(/phải là số hữu hạn/i)).toBeInTheDocument();
    expect(update).not.toHaveBeenCalled();
  });

  it('shows a safe GET error without exposing raw internals', async () => {
    vi.spyOn(adaptivePolicyApi, 'get').mockRejectedValue(new Error('database stack raw'));

    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent(/Không thể tải Adaptive Policy/i);
    expect(screen.queryByText(/database stack raw/i)).not.toBeInTheDocument();
  });

  it('shows a safe PUT error and preserves the instructor values', async () => {
    vi.spyOn(adaptivePolicyApi, 'get').mockResolvedValue(policy('SAVED'));
    vi.spyOn(adaptivePolicyApi, 'update').mockRejectedValue(
      new ApiError(500, { stack: 'raw Prisma failure' }),
    );
    renderPage();
    await screen.findByText(/SAVED:/i);

    setThresholds('0.25', '0.9');
    submitForm();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /giá trị bạn nhập vẫn được giữ lại/i,
    );
    expect(remedialInput()).toHaveValue(0.25);
    expect(progressionInput()).toHaveValue(0.9);
    expect(screen.queryByText(/raw Prisma failure/i)).not.toBeInTheDocument();
  });

  it('disables Save and prevents duplicate PUT requests while one is pending', async () => {
    vi.spyOn(adaptivePolicyApi, 'get').mockResolvedValue(policy('SAVED'));
    let resolveUpdate!: (value: AdaptivePolicy) => void;
    const update = vi.spyOn(adaptivePolicyApi, 'update').mockReturnValue(
      new Promise((resolve) => {
        resolveUpdate = resolve;
      }),
    );
    renderPage();
    await screen.findByText(/SAVED:/i);

    submitForm();
    submitForm();

    expect(update).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: /Đang lưu/i })).toBeDisabled();
    resolveUpdate(policy('SAVED'));
    expect(await screen.findByRole('status')).toHaveTextContent(/Đã lưu/i);
  });

  it('uses shared expired-session handling without retrying PUT', async () => {
    vi.spyOn(adaptivePolicyApi, 'get').mockResolvedValue(policy('SAVED'));
    const update = vi
      .spyOn(adaptivePolicyApi, 'update')
      .mockRejectedValue(new ApiError(401, { message: 'expired' }));
    const refreshUser = vi.fn().mockResolvedValue(undefined);
    renderPage('INSTRUCTOR', refreshUser);
    await screen.findByText(/SAVED:/i);

    submitForm();

    expect(await screen.findByText('Login destination')).toBeInTheDocument();
    expect(refreshUser).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledOnce();
  });
});

describe('Instructor adaptive policy navigation', () => {
  it('links to Adaptive Policy from the existing teaching flow', async () => {
    vi.spyOn(instructorApi.teaching, 'list').mockResolvedValue([teachingEntry()]);

    render(
      <MemoryRouter>
        <AuthContext.Provider value={authValue()}>
          <InstructorTeachingPage />
        </AuthContext.Provider>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('link', { name: /Adaptive Policy/i })).toHaveAttribute(
      'href',
      `/instructor/courses/${courseId}/adaptive-policy`,
    );
  });
});

function renderPage(
  role: UserRole = 'INSTRUCTOR',
  refreshUser = vi.fn().mockResolvedValue(undefined),
) {
  const value = authValue(role, refreshUser);

  return render(
    <MemoryRouter initialEntries={[`/instructor/courses/${courseId}/adaptive-policy`]}>
      <AuthContext.Provider value={value}>
        <Routes>
          <Route
            path="/instructor/courses/:courseId/adaptive-policy"
            element={
              <RoleRoute allowedRoles={['INSTRUCTOR']}>
                <AdaptivePolicyPage />
              </RoleRoute>
            }
          />
          <Route path="/login" element={<p>Login destination</p>} />
        </Routes>
      </AuthContext.Provider>
    </MemoryRouter>,
  );
}

function authValue(
  role: UserRole = 'INSTRUCTOR',
  refreshUser = vi.fn().mockResolvedValue(undefined),
): AuthContextValue {
  return {
    user: {
      id: 'user',
      email: 'instructor@example.test',
      fullName: 'Instructor',
      role,
      status: 'ACTIVE',
    },
    isLoading: false,
    error: null,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    refreshUser,
  };
}

function teachingEntry(): TeachingEntry {
  return {
    course: {
      id: courseId,
      title: 'Assigned English',
      slug: 'assigned-english',
      level: 'A1',
      isPublished: true,
      _count: { modules: 1 },
    },
    classOfferings: [{ id: 'offering-id', name: 'Evening class', status: 'OPEN' }],
  };
}

function policy(
  source: AdaptivePolicy['source'],
  remedialThreshold = 0.4,
  progressionThreshold = 0.8,
): AdaptivePolicy {
  return { courseId, remedialThreshold, progressionThreshold, source };
}

function remedialInput() {
  return screen.getByLabelText('Remedial Threshold') as HTMLInputElement;
}

function progressionInput() {
  return screen.getByLabelText('Progression Threshold') as HTMLInputElement;
}

function setThresholds(remedial: string, progression: string) {
  fireEvent.change(remedialInput(), { target: { value: remedial } });
  fireEvent.change(progressionInput(), { target: { value: progression } });
}

function submitForm() {
  fireEvent.submit(screen.getByRole('button', { name: /Lưu policy|Đang lưu/i }).closest('form')!);
}
