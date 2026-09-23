import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '@/features/auth/auth-context';
import { RoleRoute } from '@/features/auth/RoleRoute';
import { ApiError } from '@/lib/api-client';
import { StudentAdaptivePathPage } from '@/pages/StudentAdaptivePathPage';
import { adaptivePathApi } from './api';
import type {
  AdaptiveBlockedLesson,
  AdaptiveLessonCategory,
  AdaptiveLessonReason,
  AdaptivePathLesson,
  AdaptiveReasonCode,
  AdaptiveSkillClassification,
  StudentAdaptivePath,
} from './types';

const enrollmentId = '10000000-0000-4000-8000-000000000001';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('StudentAdaptivePathPage', () => {
  it('shows loading then renders DEFAULT policy and backend Skill classifications', async () => {
    let resolvePath!: (value: StudentAdaptivePath) => void;
    vi.spyOn(adaptivePathApi, 'get').mockReturnValue(
      new Promise((resolve) => {
        resolvePath = resolve;
      }),
    );
    renderPage();

    expect(screen.getByRole('status')).toHaveTextContent(/Đang tải lộ trình/i);
    resolvePath(
      response({
        skillClassifications: [
          skill('prior', 'PRIOR', 0.456, 'UNASSESSED', 'BLOCKED'),
          skill('observed', 'OBSERVED', 0.82, 'PROGRESSION_READY', 'READY'),
        ],
      }),
    );

    expect(await screen.findByText('Using default policy')).toBeInTheDocument();
    expect(screen.getByText(/45,6/)).toBeInTheDocument();
    expect(screen.getByText(/PRIOR — Chưa có quan sát đánh giá/i)).toBeInTheDocument();
    expect(screen.getByText(/UNASSESSED — Chưa đánh giá/i)).toBeInTheDocument();
    expect(screen.getAllByText(/^OBSERVED$/i)).not.toHaveLength(0);
    expect(screen.getByText(/PROGRESSION_READY — Sẵn sàng tiến tiếp/i)).toBeInTheDocument();
    expect(screen.queryByText(/Mastered/i)).not.toBeInTheDocument();
  });

  it('renders the SAVED course-specific policy context', async () => {
    vi.spyOn(adaptivePathApi, 'get').mockResolvedValue(
      response({
        policy: { remedialThreshold: 0.35, progressionThreshold: 0.75, source: 'SAVED' },
      }),
    );
    renderPage();

    expect(await screen.findByText('Course-specific policy')).toBeInTheDocument();
    expect(screen.getByText(/< 35/)).toBeInTheDocument();
    expect(screen.getByText(/35.*< 75/)).toBeInTheDocument();
    expect(screen.getByText(/≥ 75/)).toBeInTheDocument();
  });

  it('preserves server path order and localizes all actionable reason codes', async () => {
    const serverPath = [
      pathLesson(
        'progression',
        'Progression lesson',
        'PROGRESSION',
        reason('PROGRESSION_PREREQUISITES_READY', 'New Skill', 0.5, null),
      ),
      pathLesson(
        'remedial',
        'Remedial lesson',
        'REMEDIAL',
        reason('REMEDIAL_LOW_MASTERY', 'Foundation Skill', 0.2, 0.4),
        true,
      ),
      pathLesson(
        'reinforcement',
        'Reinforcement lesson',
        'REINFORCEMENT',
        reason('REINFORCEMENT_BUILDING', 'Grammar Skill', 0.6, 0.8),
      ),
    ];
    vi.spyOn(adaptivePathApi, 'get').mockResolvedValue(response({ path: serverPath }));
    renderPage();

    const section = await actionableSection();
    expect(
      within(section)
        .getAllByRole('heading', { level: 3 })
        .map((item) => item.textContent),
    ).toEqual(['Progression lesson', 'Remedial lesson', 'Reinforcement lesson']);
    expect(within(section).getByText(/PROGRESSION — Học nội dung tiếp theo/i)).toBeInTheDocument();
    expect(within(section).getByText(/REMEDIAL — Ôn lại nền tảng/i)).toBeInTheDocument();
    expect(within(section).getByText(/REINFORCEMENT — Củng cố/i)).toBeInTheDocument();
    expect(
      within(section).getByText(/điều kiện tiên quyết đã đạt.*New Skill/i),
    ).toBeInTheDocument();
    expect(within(section).getByText(/Foundation Skill.*20.*40/i)).toBeInTheDocument();
    expect(within(section).getByText(/Grammar Skill.*60.*80/i)).toBeInTheDocument();
    expect(within(section).getAllByText(/Mastery hiện tại:/i)).toHaveLength(3);
    expect(within(section).getByText(/Đã học — đề xuất ôn lại/i)).toBeInTheDocument();
  });

  it('keeps blocked Lessons outside the primary path and explains prerequisites without access denial', async () => {
    const prerequisite = {
      skillId: 'foundation',
      code: 'FOUNDATION',
      name: 'Foundation Skill',
      state: 'PRIOR' as const,
      masteryProbability: 0.3,
    };
    const blocked: AdaptiveBlockedLesson = {
      ...metadata('blocked', 'Blocked lesson'),
      reason: {
        ...reason('LOCKED_PREREQUISITE', 'Advanced Skill', 0.5, 0.8),
        unsatisfiedPrerequisites: [prerequisite],
      },
    };
    vi.spyOn(adaptivePathApi, 'get').mockResolvedValue(response({ blockedLessons: [blocked] }));
    renderPage();

    const primary = await actionableSection();
    const blockedSection = screen
      .getByRole('heading', { name: 'Bài học chưa được ưu tiên' })
      .closest('section')!;
    expect(within(primary).queryByText('Blocked lesson')).not.toBeInTheDocument();
    expect(within(blockedSection).getByText('Blocked lesson')).toBeInTheDocument();
    expect(
      within(blockedSection).getByText(/Foundation Skill.*Advanced Skill/i),
    ).toBeInTheDocument();
    expect(
      within(blockedSection).getByText(/FOUNDATION.*Foundation Skill.*30/i),
    ).toBeInTheDocument();
    expect(
      within(blockedSection).getByText(/chưa được ưu tiên trong lộ trình/i),
    ).toBeInTheDocument();
    expect(within(blockedSection).queryByText(/không được phép truy cập/i)).not.toBeInTheDocument();
  });

  it('shows a partial-mapping warning and keeps unmapped Lessons separate', async () => {
    vi.spyOn(adaptivePathApi, 'get').mockResolvedValue(
      response({
        configurationStatus: 'PARTIALLY_MAPPED',
        path: [
          pathLesson(
            'mapped',
            'Mapped lesson',
            'PROGRESSION',
            reason('PROGRESSION_PREREQUISITES_READY', 'Skill', 0.5, null),
          ),
        ],
        unmappedLessons: [metadata('unmapped', 'Unmapped lesson')],
      }),
    );
    renderPage();

    expect(await screen.findByText(/chỉ bao phủ một phần/i)).toBeInTheDocument();
    const primary = await actionableSection();
    const unmapped = screen
      .getByRole('heading', { name: 'Bài học chưa liên kết Skill/KC' })
      .closest('section')!;
    expect(within(primary).getByText('Mapped lesson')).toBeInTheDocument();
    expect(within(primary).queryByText('Unmapped lesson')).not.toBeInTheDocument();
    expect(within(unmapped).getByText('Unmapped lesson')).toBeInTheDocument();
    expect(within(unmapped).getByText(/adaptive engine chưa dùng/i)).toBeInTheDocument();
  });

  it('shows the NO_MAPPED_LESSONS state without fabricating recommendations', async () => {
    vi.spyOn(adaptivePathApi, 'get').mockResolvedValue(
      response({
        configurationStatus: 'NO_MAPPED_LESSONS',
        unmappedLessons: [metadata('unmapped', 'Course lesson')],
      }),
    );
    renderPage();

    expect(await screen.findByText(/chưa có liên kết Lesson → Skill\/KC/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Chưa thể tạo adaptive recommendation/i)).toHaveLength(2);
    expect(screen.queryByText(/Hiện không có bài học nào cần ưu tiên/i)).not.toBeInTheDocument();
  });

  it('shows a meaningful empty path for READY configuration', async () => {
    vi.spyOn(adaptivePathApi, 'get').mockResolvedValue(response());
    renderPage();

    expect(await screen.findByText(/không có bài học nào cần ưu tiên/i)).toBeInTheDocument();
    expect(screen.queryByText(/chưa có liên kết Lesson → Skill\/KC/i)).not.toBeInTheDocument();
  });

  it.each([
    [new Error('raw database stack'), /Không thể tải Personalized Learning Path/i],
    [new ApiError(404, { message: 'raw not found' }), /Không tìm thấy lộ trình/i],
    [new ApiError(403, { message: 'raw forbidden' }), /không có quyền xem lộ trình/i],
  ])('shows a safe GET error for %p', async (error, expected) => {
    vi.spyOn(adaptivePathApi, 'get').mockRejectedValue(error);
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent(expected);
    expect(
      screen.queryByText(/raw database stack|raw not found|raw forbidden/i),
    ).not.toBeInTheDocument();
  });

  it('uses shared expired-session handling for 401', async () => {
    vi.spyOn(adaptivePathApi, 'get').mockRejectedValue(new ApiError(401, null));
    const refreshUser = vi.fn().mockResolvedValue(undefined);
    renderPage(refreshUser);

    expect(await screen.findByText('Login destination')).toBeInTheDocument();
    expect(refreshUser).toHaveBeenCalledOnce();
    expect(adaptivePathApi.get).toHaveBeenCalledOnce();
  });

  it('calls only the encoded adaptive-path GET endpoint', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(response()), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await adaptivePathApi.get('enrollment/with space');

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/learning/enrollments/enrollment%2Fwith%20space/adaptive-path',
      expect.objectContaining({ credentials: 'include' }),
    );
  });
});

function renderPage(refreshUser = vi.fn().mockResolvedValue(undefined)) {
  const value: AuthContextValue = {
    user: {
      id: 'student',
      email: 'student@example.test',
      fullName: 'Student',
      role: 'STUDENT',
      status: 'ACTIVE',
    },
    isLoading: false,
    error: null,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    refreshUser,
  };
  return render(
    <MemoryRouter initialEntries={[`/student/enrollments/${enrollmentId}/path`]}>
      <AuthContext.Provider value={value}>
        <Routes>
          <Route
            path="/student/enrollments/:enrollmentId/path"
            element={
              <RoleRoute allowedRoles={['STUDENT']}>
                <StudentAdaptivePathPage />
              </RoleRoute>
            }
          />
          <Route path="/login" element={<p>Login destination</p>} />
        </Routes>
      </AuthContext.Provider>
    </MemoryRouter>,
  );
}

async function actionableSection() {
  return (await screen.findByRole('heading', { name: 'Bài học được ưu tiên' })).closest('section')!;
}

function response(overrides: Partial<StudentAdaptivePath> = {}): StudentAdaptivePath {
  return {
    enrollmentId,
    courseId: 'course-id',
    policy: { remedialThreshold: 0.4, progressionThreshold: 0.8, source: 'DEFAULT' },
    configurationStatus: 'READY',
    skillClassifications: [],
    path: [],
    blockedLessons: [],
    unmappedLessons: [],
    ...overrides,
  };
}

function skill(
  id: string,
  state: AdaptiveSkillClassification['state'],
  masteryProbability: number,
  masteryBand: AdaptiveSkillClassification['masteryBand'],
  prerequisiteStatus: AdaptiveSkillClassification['prerequisiteStatus'],
): AdaptiveSkillClassification {
  return {
    skillId: id,
    code: id.toUpperCase(),
    name: `${id} Skill`,
    state,
    masteryProbability,
    masteryBand,
    prerequisiteStatus,
    unsatisfiedPrerequisites: [],
  };
}

function metadata(lessonId: string, title: string) {
  return {
    lessonId,
    title,
    moduleId: 'module-id',
    moduleTitle: 'Module One',
    moduleOrderIndex: 0,
    lessonOrderIndex: 0,
    isCompleted: false,
  };
}

function pathLesson(
  lessonId: string,
  title: string,
  category: AdaptiveLessonCategory,
  lessonReason: AdaptiveLessonReason,
  isReview = false,
): AdaptivePathLesson {
  return {
    ...metadata(lessonId, title),
    category,
    isCompleted: isReview,
    isReview,
    reason: lessonReason,
  };
}

function reason(
  reasonCode: AdaptiveReasonCode,
  focusSkillName: string,
  masteryProbability: number,
  threshold: number | null,
): AdaptiveLessonReason {
  return {
    reasonCode,
    focusSkillId: 'focus-id',
    focusSkillCode: 'FOCUS',
    focusSkillName,
    masteryProbability,
    threshold,
    state: 'OBSERVED',
    unsatisfiedPrerequisites: [],
  };
}
