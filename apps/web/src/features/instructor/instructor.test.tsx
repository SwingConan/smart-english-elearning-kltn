import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useCallback, useState } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '@/features/auth/auth-context';
import type { AuthUser } from '@/features/auth/api';
import { ApiError } from '@/lib/api-client';
import { CourseContentManagementPage } from '@/pages/CourseContentManagementPage';
import { InstructorTeachingPage } from '@/pages/InstructorTeachingPage';
import { instructorApi } from './api';
import type { LearningResource, Lesson, Module, TeachingEntry } from './types';

const courseId = '10000000-0000-4000-8000-000000000001';
const moduleA = moduleView('module-a', 'Alpha module', 0);
const moduleB = moduleView('module-b', 'Beta module', 1);
const lesson = lessonView('lesson-a', moduleA.id, 'Alpha lesson', 0);
const resource = resourceView('resource-a', lesson.id, 'Alpha resource', 0);

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('InstructorTeachingPage', () => {
  it('shows loading, assigned courses, empty state and friendly errors', async () => {
    let resolveList!: (value: TeachingEntry[]) => void;
    vi.spyOn(instructorApi.teaching, 'list').mockReturnValueOnce(new Promise((resolve) => { resolveList = resolve; }));
    const loading = renderInstructor(<InstructorTeachingPage />);
    expect(document.querySelector('.p-8.text-center.text-gray-500')).toBeInTheDocument();
    resolveList([teachingEntry()]);
    expect(await screen.findByText('Assigned English')).toBeInTheDocument();
    expect(screen.getByText('Evening class')).toBeInTheDocument();
    loading.unmount();

    vi.spyOn(instructorApi.teaching, 'list').mockResolvedValueOnce([]);
    const empty = renderInstructor(<InstructorTeachingPage />);
    await waitFor(() => expect(instructorApi.teaching.list).toHaveBeenCalled());
    expect(screen.queryByText('Assigned English')).not.toBeInTheDocument();
    empty.unmount();

    vi.spyOn(instructorApi.teaching, 'list').mockRejectedValueOnce(new Error('raw internal'));
    renderInstructor(<InstructorTeachingPage />);
    await waitFor(() => expect(document.querySelector('.text-red-600')).toBeInTheDocument());
    expect(screen.queryByText('raw internal')).not.toBeInTheDocument();
  });
});

describe('CourseContentManagementPage', () => {
  it('renders the module, lesson and resource hierarchy from APIs', async () => {
    mockContent([moduleA], [lesson], [resource]);
    renderContent();
    expect(await screen.findByRole('heading', { name: /Alpha module/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('heading', { name: /Alpha module/ }));
    expect(await screen.findByText(/Alpha lesson/)).toBeInTheDocument();
    fireEvent.click(screen.getByText(/Alpha lesson/));
    expect(await screen.findByRole('link', { name: 'Alpha resource' })).toHaveAttribute('href', resource.url);
  });

  it('prevents duplicate create submissions and disables controls while pending', async () => {
    mockContent([], [], []);
    let resolveCreate!: (value: Module) => void;
    const create = vi.spyOn(instructorApi.modules, 'create').mockReturnValueOnce(new Promise((resolve) => { resolveCreate = resolve; }));
    renderContent();
    await screen.findByRole('heading', { level: 1 });
    fireEvent.click(screen.getByRole('button', { name: /Module$/ }));
    fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: 'New module' } });
    const save = screen.getByRole('button', { name: /^Lưu$/ });
    fireEvent.click(save);
    fireEvent.click(save);
    expect(create).toHaveBeenCalledOnce();
    expect(await screen.findByRole('status')).toHaveTextContent(/module/i);
    expect(screen.getByRole('button', { name: /^Lưu$/ })).toBeDisabled();
    resolveCreate(moduleView('new-module', 'New module', 0));
    expect(await screen.findByRole('heading', { name: /New module/ })).toBeInTheDocument();
  });

  it('shows friendly 409 and generic 5xx errors without internal payloads', async () => {
    mockContent([moduleA], [], []);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.spyOn(instructorApi.modules, 'delete').mockRejectedValueOnce(new ApiError(409, { message: 'P2003 raw' }));
    renderContent();
    const heading = await screen.findByRole('heading', { name: /Alpha module/ });
    const card = heading.closest('.bg-white') as HTMLElement;
    fireEvent.click(card.querySelector('button.text-red-600') as HTMLElement);
    expect(await screen.findByRole('alert')).toHaveTextContent(/học viên/i);
    expect(screen.queryByText(/P2003 raw/)).not.toBeInTheDocument();

    vi.spyOn(instructorApi.modules, 'delete').mockRejectedValueOnce(new ApiError(500, { stack: 'internal' }));
    fireEvent.click(card.querySelector('button.text-red-600') as HTMLElement);
    expect(await screen.findByRole('alert')).toHaveTextContent(/module/i);
    expect(screen.queryByText(/internal/)).not.toBeInTheDocument();
  });

  it('keeps successful reorder and restores the previous snapshot on failure', async () => {
    mockContent([moduleA, moduleB], [], []);
    const reorder = vi.spyOn(instructorApi.modules, 'reorder').mockResolvedValueOnce();
    renderContent();
    await screen.findByRole('heading', { name: /Alpha module/ });
    fireEvent.click(enabledDownButton());
    await waitFor(() => expect(reorder).toHaveBeenCalledWith(courseId, [moduleB.id, moduleA.id]));
    expect(moduleHeadings()).toEqual(['Module 1: Beta module', 'Module 2: Alpha module']);

    reorder.mockRejectedValueOnce(new Error('network'));
    fireEvent.click(enabledDownButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(/khôi phục/i);
    expect(moduleHeadings()).toEqual(['Module 1: Beta module', 'Module 2: Alpha module']);
  });

  it('refreshes auth and redirects safely on 401 without retrying the mutation', async () => {
    mockContent([], [], []);
    const refresh = vi.fn().mockResolvedValue(undefined);
    const create = vi.spyOn(instructorApi.modules, 'create').mockRejectedValueOnce(new ApiError(401, null));
    renderContent(refresh, true);
    await screen.findByRole('heading', { level: 1 });
    fireEvent.click(screen.getByRole('button', { name: /Module$/ }));
    fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: 'Expired' } });
    fireEvent.click(screen.getByRole('button', { name: /^Lưu$/ }));
    expect(await screen.findByText('Login page')).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent(`/login?returnUrl=${encodeURIComponent(`/instructor/courses/${courseId}/content`)}`);
    expect(refresh).toHaveBeenCalledOnce();
    expect(create).toHaveBeenCalledOnce();
  });
});

function renderInstructor(element: React.ReactNode) {
  return render(<MemoryRouter><TestAuthProvider>{element}</TestAuthProvider></MemoryRouter>);
}
function renderContent(onRefresh = vi.fn().mockResolvedValue(undefined), includeLogin = false) {
  return render(
    <MemoryRouter initialEntries={[`/instructor/courses/${courseId}/content`]}>
      <TestAuthProvider onRefresh={onRefresh}>
        <Routes>
          <Route path="/instructor/courses/:courseId/content" element={<CourseContentManagementPage />} />
          {includeLogin ? <Route path="/login" element={<><span>Login page</span><LocationProbe /></>} /> : null}
        </Routes>
      </TestAuthProvider>
    </MemoryRouter>,
  );
}
function TestAuthProvider({ children, onRefresh = vi.fn().mockResolvedValue(undefined) }: { children: React.ReactNode; onRefresh?: () => Promise<void> }) {
  const [user, setUser] = useState<AuthUser | null>({ id: 'instructor-id', email: 'instructor@example.test', fullName: 'Instructor', role: 'INSTRUCTOR', status: 'ACTIVE' });
  const refreshUser = useCallback(async () => { await onRefresh(); setUser(null); }, [onRefresh]);
  const value: AuthContextValue = { user, isLoading: false, error: null, login: vi.fn(), register: vi.fn(), logout: vi.fn(), refreshUser };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
function LocationProbe() { const location = useLocation(); return <output data-testid="location">{location.pathname}{location.search}</output>; }
function mockContent(modules: Module[], lessons: Lesson[], resources: LearningResource[]) {
  vi.spyOn(instructorApi.modules, 'list').mockResolvedValue(modules);
  vi.spyOn(instructorApi.lessons, 'list').mockResolvedValue(lessons);
  vi.spyOn(instructorApi.resources, 'list').mockResolvedValue(resources);
}
function moduleHeadings() { return screen.getAllByRole('heading', { level: 2 }).map((item) => item.textContent); }
function enabledDownButton() { return screen.getAllByRole('button').find((button) => button.textContent === '▼' && !button.hasAttribute('disabled')) as HTMLElement; }
function moduleView(id: string, title: string, orderIndex: number): Module { return { id, courseId, title, description: null, orderIndex, createdAt: '', updatedAt: '' }; }
function lessonView(id: string, moduleId: string, title: string, orderIndex: number): Lesson { return { id, moduleId, title, description: null, orderIndex, createdAt: '', updatedAt: '' }; }
function resourceView(id: string, lessonId: string, title: string, orderIndex: number): LearningResource { return { id, lessonId, title, type: 'DOCUMENT', url: 'https://example.test/document', orderIndex, isDownloadable: true, createdAt: '', updatedAt: '' }; }
function teachingEntry(): TeachingEntry { return { course: { id: courseId, title: 'Assigned English', slug: 'assigned-english', level: 'A1', isPublished: true, _count: { modules: 1 } }, classOfferings: [{ id: 'offering-id', name: 'Evening class', status: 'OPEN' }] }; }
