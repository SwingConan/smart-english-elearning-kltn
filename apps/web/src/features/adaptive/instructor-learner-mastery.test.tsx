import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '@/features/auth/auth-context';
import { instructorApi } from '@/features/instructor/api';
import type { TeachingEntry } from '@/features/instructor/types';
import { ApiError } from '@/lib/api-client';
import { InstructorLearnerMasteryPage } from '@/pages/InstructorLearnerMasteryPage';
import { InstructorTeachingPage } from '@/pages/InstructorTeachingPage';
import { instructorLearnerMasteryApi } from './api';
import type { InstructorLearnerMasteryResponse } from './types';

const courseId = '10000000-0000-4000-8000-000000000001';
const otherCourseId = '10000000-0000-4000-8000-000000000002';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('InstructorLearnerMasteryPage', () => {
  it('shows loading, performs the course GET and renders the response', async () => {
    let resolve!: (value: InstructorLearnerMasteryResponse) => void;
    const get = vi.spyOn(instructorLearnerMasteryApi, 'get').mockReturnValue(
      new Promise((resolvePromise) => { resolve = resolvePromise; }),
    );
    renderPage();

    expect(screen.getByRole('status')).toHaveTextContent('Đang tải Learner Mastery');
    resolve(response());

    expect(await screen.findByRole('heading', { name: 'Ma trận Learner Mastery' })).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith(courseId, expect.any(AbortSignal));
    expect(screen.getByText('Lan')).toBeInTheDocument();
    expect(screen.getByText('Lớp tối')).toBeInTheDocument();
  });

  it('renders DEFAULT policy percentages and the Skill legend in server order', async () => {
    vi.spyOn(instructorLearnerMasteryApi, 'get').mockResolvedValue(response());
    renderPage();

    expect(await screen.findByText('Chính sách mặc định')).toBeInTheDocument();
    expect(screen.getByText(/Dưới 40/)).toBeInTheDocument();
    expect(screen.getByText(/Từ 80/)).toBeInTheDocument();
    const legend = screen.getByRole('heading', { name: 'Danh mục Skill' }).parentElement!;
    expect(legend).toHaveTextContent('Z-SKILL — Listening');
    expect(legend).toHaveTextContent('A-SKILL — Grammar');
    expect(legend.textContent!.indexOf('Z-SKILL')).toBeLessThan(legend.textContent!.indexOf('A-SKILL'));
  });

  it('renders SAVED policy without offering an edit form', async () => {
    vi.spyOn(instructorLearnerMasteryApi, 'get').mockResolvedValue(
      response({ policy: { remedialThreshold: 0.3, progressionThreshold: 0.75, source: 'SAVED' } }),
    );
    renderPage();

    expect(await screen.findByText('Chính sách riêng của khóa học')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /lưu/i })).not.toBeInTheDocument();
  });

  it('preserves learner order and renders the same learner once per Enrollment', async () => {
    const base = response();
    vi.spyOn(instructorLearnerMasteryApi, 'get').mockResolvedValue({
      ...base,
      learners: [
        { ...base.learners[0], enrollmentId: 'enrollment-z', learnerName: 'Zed', classOffering: { id: 'offering-z', name: 'Lớp Z' } },
        { ...base.learners[0], enrollmentId: 'enrollment-a', learnerName: 'Amy', classOffering: { id: 'offering-a', name: 'Lớp A' } },
        { ...base.learners[0], enrollmentId: 'enrollment-2', classOffering: { id: 'offering-2', name: 'Lớp sáng' } },
      ],
    });
    renderPage();

    const rows = await screen.findAllByTestId('learner-row');
    expect(rows).toHaveLength(3);
    expect(rows.map((row) => within(row).getByRole('rowheader').textContent)).toEqual(['Zed', 'Amy', 'Lan']);
    expect(screen.getAllByText('Lan')).toHaveLength(1);
    expect(rows[2]).toHaveTextContent('Lớp sáng');
  });

  it('keeps a high PRIOR value unassessed and identifies it as baseline', async () => {
    const data = response();
    data.learners[0].skillStates[0] = {
      skillId: 'skill-z',
      state: 'PRIOR',
      masteryProbability: 0.95,
      masteryBand: 'UNASSESSED',
      observationCount: 0,
      lastObservedAt: null,
    };
    vi.spyOn(instructorLearnerMasteryApi, 'get').mockResolvedValue(data);
    renderPage();

    expect(await screen.findByText('Chưa đánh giá')).toBeInTheDocument();
    expect(screen.getByText(/Prior \/ baseline: 95/)).toBeInTheDocument();
    expect(screen.getByText('0 quan sát')).toBeInTheDocument();
    expect(screen.queryByText(/Sẵn sàng tiến tiếp/, { selector: 'td *' })).not.toBeInTheDocument();
  });

  it('renders every server-provided OBSERVED band and its metadata', async () => {
    const data = response();
    data.skills.push({ skillId: 'skill-r', code: 'R-SKILL', name: 'Reading' });
    data.learners[0].skillStates = [
      observed('skill-z', 'REMEDIAL', 0.2, 2),
      observed('skill-a', 'REINFORCEMENT', 0.625, 3),
      observed('skill-r', 'PROGRESSION_READY', 0.9, 4),
    ];
    vi.spyOn(instructorLearnerMasteryApi, 'get').mockResolvedValue(data);
    renderPage();

    expect(await screen.findByText(/REMEDIAL — Cần học lại nền tảng/)).toBeInTheDocument();
    expect(screen.getByText(/REINFORCEMENT — Cần củng cố/)).toBeInTheDocument();
    expect(screen.getByText(/PROGRESSION_READY — Sẵn sàng tiến tiếp/)).toBeInTheDocument();
    expect(screen.getByText(/62,5|62\.5/)).toBeInTheDocument();
    expect(screen.getByText('3 quan sát')).toBeInTheDocument();
    expect(
      screen.getAllByText((text) => text.startsWith('Lần quan sát cuối:') && !text.endsWith('—')),
    ).toHaveLength(3);
  });

  it('uses neutral fallbacks for unknown enums and malformed timestamps', async () => {
    const data = response({
      policy: { remedialThreshold: 0.4, progressionThreshold: 0.8, source: 'FUTURE' as 'SAVED' },
    });
    data.learners[0].skillStates[0] = {
      ...data.learners[0].skillStates[0],
      state: 'FUTURE' as 'OBSERVED',
      masteryBand: 'FUTURE' as 'REINFORCEMENT',
      lastObservedAt: 'not-a-date',
    };
    vi.spyOn(instructorLearnerMasteryApi, 'get').mockResolvedValue(data);
    renderPage();

    expect(await screen.findByText('Nguồn chính sách chưa xác định')).toBeInTheDocument();
    expect(screen.getByText('Trạng thái mastery không xác định')).toBeInTheDocument();
    expect(screen.getByText('Không xác định')).toBeInTheDocument();
    expect(screen.getByText('Lần quan sát cuối: —')).toBeInTheDocument();
  });

  it('shows a non-error empty learner state while retaining configured Skills', async () => {
    vi.spyOn(instructorLearnerMasteryApi, 'get').mockResolvedValue(response({ learners: [] }));
    renderPage();

    expect(await screen.findByText('Chưa có học viên đang hoạt động.')).toBeInTheDocument();
    expect(screen.getByText(/Z-SKILL/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows learner context when no Skills are configured', async () => {
    vi.spyOn(instructorLearnerMasteryApi, 'get').mockResolvedValue(response({ skills: [] }));
    renderPage();

    expect(await screen.findByText('Khóa học chưa được cấu hình Skill.')).toBeInTheDocument();
    const learner = screen.getByTestId('learner-row');
    expect(learner).toHaveTextContent('Lan');
    expect(learner).toHaveTextContent('Lớp tối');
  });

  it('shows meaningful setup states when learners and Skills are both empty', async () => {
    vi.spyOn(instructorLearnerMasteryApi, 'get').mockResolvedValue(response({ skills: [], learners: [] }));
    renderPage();

    expect(await screen.findByText('Khóa học chưa được cấu hình Skill.')).toBeInTheDocument();
    expect(screen.getByText('Chưa có học viên đang hoạt động.')).toBeInTheDocument();
  });

  it.each([
    [403, 'Bạn không có quyền xem Learner Mastery'],
    [404, 'Khóa học không khả dụng hoặc bạn chưa được phân công'],
  ])('shows a safe state for HTTP %s', async (status, message) => {
    vi.spyOn(instructorLearnerMasteryApi, 'get').mockRejectedValue(
      new ApiError(status, { stack: 'raw Prisma detail' }),
    );
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.queryByText(/raw Prisma detail/)).not.toBeInTheDocument();
  });

  it('shows a safe generic failure without exposing the error', async () => {
    vi.spyOn(instructorLearnerMasteryApi, 'get').mockRejectedValue(new Error('network internals'));
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent('Không thể tải Learner Mastery');
    expect(screen.queryByText(/network internals/)).not.toBeInTheDocument();
  });

  it('uses shared 401 session expiry handling', async () => {
    vi.spyOn(instructorLearnerMasteryApi, 'get').mockRejectedValue(new ApiError(401, null));
    const refreshUser = vi.fn().mockResolvedValue(undefined);
    renderPage(refreshUser, true);

    expect(await screen.findByText('Login destination')).toBeInTheDocument();
    expect(refreshUser).toHaveBeenCalledOnce();
    expect(screen.getByTestId('location')).toHaveTextContent(
      `/login?returnUrl=%2Finstructor%2Fcourses%2F${courseId}%2Flearner-mastery`,
    );
  });

  it('clears stale data and refetches when courseId changes', async () => {
    let resolveOther!: (value: InstructorLearnerMasteryResponse) => void;
    const get = vi.spyOn(instructorLearnerMasteryApi, 'get').mockImplementation((requestedId) => {
      if (requestedId === courseId) return Promise.resolve(response());
      return new Promise((resolvePromise) => { resolveOther = resolvePromise; });
    });
    renderPage(undefined, false, true);
    await screen.findByText('Lan');

    fireEvent.click(screen.getByRole('button', { name: 'Switch course' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Đang tải Learner Mastery');
    expect(screen.queryByText('Lan')).not.toBeInTheDocument();
    resolveOther(response({ courseId: otherCourseId, learners: [{ ...response().learners[0], learnerName: 'Minh' }] }));
    expect(await screen.findByText('Minh')).toBeInTheDocument();
    expect(get).toHaveBeenLastCalledWith(otherCourseId, expect.any(AbortSignal));
  });
});

describe('Instructor Learner Mastery navigation', () => {
  it('adds exactly one course navigation link', async () => {
    vi.spyOn(instructorApi.teaching, 'list').mockResolvedValue([teachingEntry()]);
    render(
      <MemoryRouter>
        <AuthContext.Provider value={authValue()}>
          <InstructorTeachingPage />
        </AuthContext.Provider>
      </MemoryRouter>,
    );

    const links = await screen.findAllByRole('link', { name: 'Learner Mastery' });
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute('href', `/instructor/courses/${courseId}/learner-mastery`);
  });
});

function renderPage(
  refreshUser = vi.fn().mockResolvedValue(undefined),
  includeLogin = false,
  includeSwitcher = false,
) {
  return render(
    <MemoryRouter initialEntries={[`/instructor/courses/${courseId}/learner-mastery`]}>
      <AuthContext.Provider value={authValue(refreshUser)}>
        <Routes>
          <Route
            path="/instructor/courses/:courseId/learner-mastery"
            element={<>{includeSwitcher ? <CourseSwitcher /> : null}<InstructorLearnerMasteryPage /></>}
          />
          {includeLogin ? <Route path="/login" element={<><p>Login destination</p><LocationProbe /></>} /> : null}
        </Routes>
      </AuthContext.Provider>
    </MemoryRouter>,
  );
}

function CourseSwitcher() {
  const navigate = useNavigate();
  return <button onClick={() => navigate(`/instructor/courses/${otherCourseId}/learner-mastery`)} type="button">Switch course</button>;
}

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}{location.search}</output>;
}

function authValue(refreshUser = vi.fn().mockResolvedValue(undefined)): AuthContextValue {
  return {
    user: { id: 'instructor', email: 'instructor@example.test', fullName: 'Instructor', role: 'INSTRUCTOR', status: 'ACTIVE' },
    isLoading: false,
    error: null,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    refreshUser,
  };
}

function response(overrides: Partial<InstructorLearnerMasteryResponse> = {}): InstructorLearnerMasteryResponse {
  return {
    courseId,
    policy: { remedialThreshold: 0.4, progressionThreshold: 0.8, source: 'DEFAULT' },
    skills: [
      { skillId: 'skill-z', code: 'Z-SKILL', name: 'Listening' },
      { skillId: 'skill-a', code: 'A-SKILL', name: 'Grammar' },
    ],
    learners: [{
      enrollmentId: 'enrollment-1',
      learnerId: 'learner-1',
      learnerName: 'Lan',
      classOffering: { id: 'offering-1', name: 'Lớp tối' },
      skillStates: [
        observed('skill-z', 'REMEDIAL', 0.25, 2),
        observed('skill-a', 'REINFORCEMENT', 0.6, 3),
      ],
    }],
    ...overrides,
  };
}

function observed(
  skillId: string,
  masteryBand: 'REMEDIAL' | 'REINFORCEMENT' | 'PROGRESSION_READY',
  masteryProbability: number,
  observationCount: number,
) {
  return {
    skillId,
    state: 'OBSERVED' as const,
    masteryProbability,
    masteryBand,
    observationCount,
    lastObservedAt: '2026-01-01T12:30:00.000Z',
  };
}

function teachingEntry(): TeachingEntry {
  return {
    course: { id: courseId, title: 'English', slug: 'english', level: 'A1', isPublished: true, _count: { modules: 1 } },
    classOfferings: [{ id: 'offering-1', name: 'Lớp tối', status: 'OPEN' }],
  };
}
