import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useCallback, useState } from 'react';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '@/App';
import type { AuthUser } from '@/features/auth/api';
import { AuthContext, type AuthContextValue } from '@/features/auth/auth-context';
import { ApiError } from '@/lib/api-client';
import { adminApi } from './api';
import type {
  CourseRecommendationRow,
  PlacementEvaluationCriteria,
  StudyRecommendationPolicy,
} from './types';

const courseId = '10000000-0000-4000-8000-000000000001';
const placement: PlacementEvaluationCriteria = {
  policy: {
    id: 'policy-id',
    code: 'M04_PLACEMENT_LR_NORMALIZED_V1',
    name: 'Placement L&R normalized',
    placementMode: 'LR',
    isActive: true,
    updatedAt: '2026-10-22T00:00:00.000Z',
  },
  bands: [
    { id: '1', code: 'FOUNDATION', label: 'Nền tảng', orderIndex: 0, minValue: 0, maxValue: 45 },
    {
      id: '2',
      code: 'DEVELOPING',
      label: 'Đang phát triển',
      orderIndex: 1,
      minValue: 45,
      maxValue: 70,
    },
    { id: '3', code: 'ADVANCING', label: 'Nâng cao', orderIndex: 2, minValue: 70, maxValue: 100 },
  ],
  intervalConvention: 'MIN_INCLUSIVE_MAX_EXCLUSIVE_TERMINAL_INCLUSIVE',
};
const recommendation: CourseRecommendationRow = {
  course: {
    id: courseId,
    title: 'TOEIC Foundation',
    slug: 'toeic-foundation',
    level: 'FOUNDATION',
    skillScope: 'LR',
    isPublished: false,
  },
  profile: {
    id: 'profile-id',
    isActive: true,
    ruleMode: 'ALL',
    priority: 100,
    updatedAt: '2026-10-22T00:00:00.000Z',
    criteria: [
      { skill: 'LISTENING', minNormalizedScore: 0, maxNormalizedScore: 65 },
      { skill: 'READING', minNormalizedScore: 0, maxNormalizedScore: 65 },
    ],
  },
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('M09-D deterministic criteria administration', () => {
  it('renders one sidebar entry and the three criteria sub-navigation tabs', async () => {
    vi.spyOn(adminApi.criteria.placement, 'get').mockResolvedValue(placement);
    renderAdmin('/admin/criteria/evaluation');
    expect(
      await screen.findByRole('heading', { name: 'Tiêu chí đánh giá đầu vào' }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Tiêu chí & quy tắc' }).length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: 'Đánh giá đầu vào' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Gợi ý khóa học' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Gợi ý tự học' })).toBeInTheDocument();
    expect(
      screen.getByText(/Lịch sử học viên đã ghi nhận sẽ không bị tính lại/),
    ).toBeInTheDocument();
  });

  it('loads, validates, confirms, and saves shared placement boundaries', async () => {
    vi.spyOn(adminApi.criteria.placement, 'get').mockResolvedValue(placement);
    const savedUpdatedAt = '2026-10-23T12:34:56.000Z';
    const update = vi.spyOn(adminApi.criteria.placement, 'update').mockResolvedValue({
      ...placement,
      policy: { ...placement.policy, updatedAt: savedUpdatedAt },
      bands: placement.bands.map((band) =>
        band.code === 'FOUNDATION'
          ? { ...band, maxValue: 42.5 }
          : band.code === 'DEVELOPING'
            ? { ...band, minValue: 42.5, maxValue: 72.25 }
            : { ...band, minValue: 72.25 },
      ),
    });
    renderAdmin('/admin/criteria/evaluation');
    await screen.findByText('Placement L&R normalized');
    expect(screen.getByText(formatDate(placement.policy.updatedAt))).toBeInTheDocument();
    expect(screen.getByText(/không phải thang điểm TOEIC chính thức/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Ngưỡng kết thúc Nền tảng/), {
      target: { value: '80' },
    });
    fireEvent.change(screen.getByLabelText(/Ngưỡng bắt đầu Nâng cao/), { target: { value: '70' } });
    expect(screen.getByRole('button', { name: 'Lưu tiêu chí đánh giá' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Ngưỡng kết thúc Nền tảng/), {
      target: { value: '42.5' },
    });
    fireEvent.change(screen.getByLabelText(/Ngưỡng bắt đầu Nâng cao/), {
      target: { value: '72.25' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu tiêu chí đánh giá' }));
    const dialog = screen.getByRole('dialog', { name: 'Lưu ngưỡng đánh giá mới?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Lưu ngưỡng mới' }));
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith({
        foundationUpperBoundary: 42.5,
        advancingLowerBoundary: 72.25,
      }),
    );
    expect(await screen.findByText(/Kết quả đã có được giữ nguyên/)).toBeInTheDocument();
    expect(screen.getByText(formatDate(savedUpdatedAt))).toBeInTheDocument();
    expect(screen.queryByText(formatDate(placement.policy.updatedAt))).not.toBeInTheDocument();
  });

  it('shows configured/unconfigured directory states, filters, and truthful unpublished messaging', async () => {
    const list = vi.spyOn(adminApi.criteria.courseRecommendations, 'list').mockResolvedValue({
      data: [
        recommendation,
        {
          ...recommendation,
          course: {
            ...recommendation.course,
            id: `${courseId.slice(0, -1)}2`,
            title: 'Unconfigured',
          },
          profile: null,
        },
      ],
      meta: { total: 2, page: 1, limit: 20, totalPages: 1 },
    });
    renderAdmin('/admin/criteria/course-recommendations');
    expect((await screen.findAllByText('TOEIC Foundation')).length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: 'Tiêu chí & quy tắc' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getAllByText('Đang áp dụng').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Chưa cấu hình').length).toBeGreaterThan(0);
    expect(
      screen.getAllByText(/chưa công bố nên không xuất hiện trong gợi ý/i).length,
    ).toBeGreaterThan(0);
    fireEvent.change(screen.getByPlaceholderText('Tìm tên khóa học'), {
      target: { value: 'foundation' },
    });
    fireEvent.change(screen.getByLabelText('Trạng thái công bố'), { target: { value: 'false' } });
    fireEvent.change(screen.getByLabelText('Trạng thái hồ sơ'), { target: { value: 'ACTIVE' } });
    fireEvent.click(screen.getByRole('button', { name: /Lọc/ }));
    await waitFor(() =>
      expect(list).toHaveBeenLastCalledWith(
        expect.objectContaining({
          search: 'foundation',
          isPublished: false,
          profileState: 'ACTIVE',
        }),
        expect.any(AbortSignal),
      ),
    );
  });

  it('previews ALL/ANY rules and sends null for blank permitted bounds without NaN', async () => {
    vi.spyOn(adminApi.criteria.courseRecommendations, 'get').mockResolvedValue(recommendation);
    const update = vi
      .spyOn(adminApi.criteria.courseRecommendations, 'update')
      .mockResolvedValue(recommendation);
    renderAdmin(`/admin/criteria/course-recommendations/${courseId}`);
    expect(await screen.findByText('Tất cả điều kiện:', { exact: false })).toBeInTheDocument();
    expect(screen.getByText(/khóa học chưa công bố nên không xuất hiện/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: /Chỉ cần một điều kiện đúng/ }));
    expect(screen.getByText('Chỉ cần một điều kiện:', { exact: false })).toBeInTheDocument();
    const minimums = screen.getAllByLabelText('Điểm nội bộ tối thiểu');
    fireEvent.change(minimums[0], { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu tiêu chí gợi ý' }));
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Lưu tiêu chí' }),
    );
    await waitFor(() => expect(update).toHaveBeenCalled());
    expect(update.mock.calls[0][1]).toMatchObject({
      ruleMode: 'ANY',
      criteria: [
        { skill: 'LISTENING', minNormalizedScore: null, maxNormalizedScore: 65 },
        { skill: 'READING', minNormalizedScore: 0, maxNormalizedScore: 65 },
      ],
    });
    expect(JSON.stringify(update.mock.calls[0][1])).not.toContain('NaN');
  });

  it('keeps the self-study policy available in the criteria workspace', async () => {
    const policy: StudyRecommendationPolicy = {
      id: 'study-id',
      code: 'M08_STUDY_REC_V1',
      name: 'Deterministic study policy',
      weakThreshold: 40,
      strongThreshold: 80,
      minimumTaskQuestions: 3,
      maxRecommendations: 3,
      isActive: true,
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
    };
    vi.spyOn(adminApi.studyRecommendationPolicy, 'get').mockResolvedValue(policy);
    renderAdmin('/admin/criteria/study-recommendations');
    expect(
      await screen.findByRole('heading', { name: 'Tiêu chí gợi ý tự học' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Gợi ý tự học' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'Tiêu chí & quy tắc' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('uses established session-expiry behavior when a criteria mutation returns 401', async () => {
    vi.spyOn(adminApi.criteria.placement, 'get').mockResolvedValue(placement);
    vi.spyOn(adminApi.criteria.placement, 'update').mockRejectedValue(
      new ApiError(401, { message: 'raw criteria mutation detail' }),
    );
    const refresh = vi.fn().mockResolvedValue(undefined);
    renderAdmin('/admin/criteria/evaluation', refresh);
    await screen.findByText('Placement L&R normalized');

    fireEvent.click(screen.getByRole('button', { name: 'Lưu tiêu chí đánh giá' }));
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Lưu ngưỡng mới' }),
    );

    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent(
        '/login?returnUrl=%2Fadmin%2Fcriteria%2Fevaluation',
      ),
    );
    expect(refresh).toHaveBeenCalledOnce();
    expect(screen.queryByText(/raw criteria mutation detail/)).not.toBeInTheDocument();
  });

  it('uses established session-expiry behavior on criteria reads', async () => {
    vi.spyOn(adminApi.criteria.placement, 'get').mockRejectedValue(new ApiError(401, null));
    const refresh = vi.fn().mockResolvedValue(undefined);
    renderAdmin('/admin/criteria/evaluation', refresh);
    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent(
        '/login?returnUrl=%2Fadmin%2Fcriteria%2Fevaluation',
      ),
    );
    expect(refresh).toHaveBeenCalledOnce();
  });
});

function renderAdmin(path: string, onRefresh = vi.fn().mockResolvedValue(undefined)) {
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

function formatDate(value: string) {
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  );
}
