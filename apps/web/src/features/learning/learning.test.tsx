import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useCallback, useState } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '@/features/auth/auth-context';
import type { AuthUser } from '@/features/auth/api';
import { enrollmentApi } from '@/features/enrollments/api';
import type { EnrollmentStatus, EnrollmentView } from '@/features/enrollments/types';
import { ApiError } from '@/lib/api-client';
import { LearningPage } from '@/pages/LearningPage';
import { MyEnrollmentsPage } from '@/pages/MyEnrollmentsPage';
import { learningApi } from './api';
import type { CourseContent, CourseProgress, LessonDetail } from './types';

const enrollmentId = '10000000-0000-4000-8000-000000000001';
const lessonId = '20000000-0000-4000-8000-000000000001';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('LearningPage', () => {
  it('renders real content/progress and reports initial load failure', async () => {
    mockInitial();
    const page = renderLearning();
    expect(await screen.findByText('Learning Course')).toBeInTheDocument();
    expect(screen.getByText('Lesson One')).toBeInTheDocument();
    expect(screen.getByText(/1 \/ 2/)).toBeInTheDocument();
    page.unmount();

    vi.spyOn(learningApi, 'getContent').mockRejectedValueOnce(new Error('raw database'));
    vi.spyOn(learningApi, 'getProgress').mockResolvedValueOnce(progress());
    renderLearning();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText('raw database')).not.toBeInTheDocument();
  });

  it('opens a lesson and enforces VIDEO/LINK/DOCUMENT download presentation', async () => {
    mockInitial();
    vi.spyOn(learningApi, 'openLesson').mockResolvedValueOnce(detail());
    renderLearning();
    fireEvent.click(await screen.findByRole('button', { name: /Lesson One/ }));
    expect(await screen.findByText('Lesson Detail')).toBeInTheDocument();
    expect(linkByHref('https://example.test/video')).toHaveAttribute('target', '_blank');
    expect(linkByHref('https://example.test/link')).toHaveAttribute('target', '_blank');
    expect(linkByHref('https://example.test/view')).not.toHaveAttribute('download');
    expect(linkByHref('https://example.test/downloadable', true)).toHaveAttribute('download');
    expect(screen.getAllByRole('link').filter((link) => link.hasAttribute('download'))).toHaveLength(1);
  });

  it('shows lesson-open errors without raw internals', async () => {
    mockInitial();
    vi.spyOn(learningApi, 'openLesson').mockRejectedValueOnce(new Error('raw open failure'));
    renderLearning();
    fireEvent.click(await screen.findByRole('button', { name: /Lesson One/ }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText('raw open failure')).not.toBeInTheDocument();
  });

  it('guards repeated completion and refreshes content, progress and lesson after success', async () => {
    mockInitial();
    vi.spyOn(learningApi, 'openLesson').mockResolvedValueOnce(detail()).mockResolvedValueOnce(detail('COMPLETED'));
    let resolveComplete!: () => void;
    const complete = vi.spyOn(learningApi, 'completeLesson').mockReturnValueOnce(new Promise<void>((resolve) => { resolveComplete = resolve; }));
    renderLearning();
    fireEvent.click(await screen.findByRole('button', { name: /Lesson One/ }));
    await screen.findByText('Lesson Detail');
    const button = completionButton();
    fireEvent.click(button);
    fireEvent.click(button);
    expect(complete).toHaveBeenCalledOnce();
    expect(completionButton()).toBeDisabled();
    resolveComplete();
    await waitForCompletionButtonToDisappear();
    expect(learningApi.getContent).toHaveBeenCalledTimes(2);
    expect(learningApi.getProgress).toHaveBeenCalledTimes(2);
    expect(learningApi.openLesson).toHaveBeenCalledTimes(2);
  });

  it('does not fake completion after failure and redirects expired sessions without retry', async () => {
    mockInitial();
    vi.spyOn(learningApi, 'openLesson').mockResolvedValueOnce(detail());
    const complete = vi.spyOn(learningApi, 'completeLesson').mockRejectedValueOnce(new Error('raw completion'));
    const failed = renderLearning();
    fireEvent.click(await screen.findByRole('button', { name: /Lesson One/ }));
    await screen.findByText('Lesson Detail');
    fireEvent.click(completionButton());
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(completionButton()).toBeEnabled();
    failed.unmount();

    mockInitial();
    vi.spyOn(learningApi, 'openLesson').mockResolvedValueOnce(detail());
    complete.mockReset().mockRejectedValueOnce(new ApiError(401, null));
    const refresh = vi.fn().mockResolvedValue(undefined);
    renderLearning(refresh, true);
    fireEvent.click(await screen.findByRole('button', { name: /Lesson One/ }));
    await screen.findByText('Lesson Detail');
    fireEvent.click(completionButton());
    expect(await screen.findByText('Login page')).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent(`/login?returnUrl=${encodeURIComponent(`/student/enrollments/${enrollmentId}/learn`)}`);
    expect(refresh).toHaveBeenCalledOnce();
    expect(complete).toHaveBeenCalledOnce();
  });
});

describe('learning API contract', () => {
  it('opens a lesson with POST on the explicit side-effect route', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(detail()), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await learningApi.openLesson(enrollmentId, lessonId);

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/learning/enrollments/${enrollmentId}/lessons/${lessonId}/open`,
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    );
  });
});

describe('MyEnrollmentsPage', () => {
  it('shows Continue Learning only for ACTIVE enrollments', async () => {
    vi.spyOn(enrollmentApi, 'listMine').mockResolvedValue([
      enrollment('ACTIVE'), enrollment('PENDING_PAYMENT'), enrollment('COMPLETED'), enrollment('DROPPED'), enrollment('CANCELLED'),
    ]);
    render(<MemoryRouter><TestAuthProvider><MyEnrollmentsPage /></TestAuthProvider></MemoryRouter>);
    await screen.findByText('ACTIVE course');
    const links = screen.getAllByRole('link').filter((link) => link.getAttribute('href')?.endsWith('/learn'));
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute('href', '/student/enrollments/ACTIVE-id/learn');
  });
});

function renderLearning(onRefresh = vi.fn().mockResolvedValue(undefined), includeLogin = false) {
  return render(
    <MemoryRouter initialEntries={[`/student/enrollments/${enrollmentId}/learn`]}>
      <TestAuthProvider onRefresh={onRefresh}>
        <Routes>
          <Route path="/student/enrollments/:enrollmentId/learn" element={<LearningPage />} />
          {includeLogin ? <Route path="/login" element={<><span>Login page</span><LocationProbe /></>} /> : null}
        </Routes>
      </TestAuthProvider>
    </MemoryRouter>,
  );
}
function TestAuthProvider({ children, onRefresh = vi.fn().mockResolvedValue(undefined) }: { children: React.ReactNode; onRefresh?: () => Promise<void> }) {
  const [user, setUser] = useState<AuthUser | null>({ id: 'student-id', email: 'student@example.test', fullName: 'Student', role: 'STUDENT', status: 'ACTIVE' });
  const refreshUser = useCallback(async () => { await onRefresh(); setUser(null); }, [onRefresh]);
  const value: AuthContextValue = { user, isLoading: false, error: null, login: vi.fn(), register: vi.fn(), logout: vi.fn(), refreshUser };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
function LocationProbe() { const location = useLocation(); return <output data-testid="location">{location.pathname}{location.search}</output>; }
function mockInitial() {
  vi.spyOn(learningApi, 'getContent').mockResolvedValue(content());
  vi.spyOn(learningApi, 'getProgress').mockResolvedValue(progress());
}
function content(): CourseContent { return { course: { id: 'course-id', title: 'Learning Course', level: 'A1' }, modules: [{ id: 'module-id', title: 'Module One', description: null, orderIndex: 0, lessons: [{ id: lessonId, title: 'Lesson One', description: null, orderIndex: 0, progressStatus: 'IN_PROGRESS', resourceCount: 4 }] }] }; }
function progress(): CourseProgress { return { enrollmentId, courseTitle: 'Learning Course', totalLessons: 2, completedLessons: 1, progressPercent: 50 }; }
function detail(status: 'IN_PROGRESS' | 'COMPLETED' = 'IN_PROGRESS'): LessonDetail { return { id: lessonId, title: 'Lesson Detail', description: 'Real content', orderIndex: 0, module: { id: 'module-id', title: 'Module One' }, progress: { status, lastAccessedAt: '2026-09-20T00:00:00Z', completedAt: status === 'COMPLETED' ? '2026-09-20T01:00:00Z' : null }, resources: [
  { id: 'video', title: 'Video', type: 'VIDEO', url: 'https://example.test/video', orderIndex: 0, isDownloadable: false },
  { id: 'link', title: 'Link', type: 'LINK', url: 'https://example.test/link', orderIndex: 1, isDownloadable: false },
  { id: 'doc-view', title: 'View document', type: 'DOCUMENT', url: 'https://example.test/view', orderIndex: 2, isDownloadable: false },
  { id: 'doc-download', title: 'Download document', type: 'DOCUMENT', url: 'https://example.test/downloadable', orderIndex: 3, isDownloadable: true },
] }; }
function enrollment(status: EnrollmentStatus): EnrollmentView { return { id: `${status}-id`, status, enrolledAt: '2026-09-20T00:00:00Z', classOffering: { id: `${status}-offering`, name: `${status} class`, status: 'OPEN', pricingType: 'FREE', tuitionFeeVnd: 0, course: { id: 'course-id', title: `${status} course`, slug: `${status.toLowerCase()}-course`, level: 'A1' } } }; }
function completionButton(): HTMLElement { return screen.getAllByRole('button').at(-1) as HTMLElement; }
async function waitForCompletionButtonToDisappear(): Promise<void> {
  await waitFor(() => expect(screen.getAllByRole('button')).toHaveLength(1));
}
function linkByHref(href: string, downloadable = false): HTMLElement {
  const match = screen.getAllByRole('link').find((link) =>
    link.getAttribute('href') === href && link.hasAttribute('download') === downloadable,
  );
  if (!match) throw new Error(`Missing link ${href}`);
  return match;
}
