import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router';
import { AuthContext } from '@/features/auth/auth-context';
import { enrollmentApi } from '@/features/enrollments/api';
import type { EnrollmentView } from '@/features/enrollments/types';
import { ClassShellLayout } from '@/layouts/ClassShellLayout';
import { StudentTestAttemptPage } from '@/pages/StudentTestAttemptPage';
import { renderAssessmentRoute } from './assessment-test-utils';
import { studentAssessmentApi } from './api';
import type { StudentAttemptContent, StudentAttemptGroup } from './types';

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
  document.body.style.overflow = '';
});

describe('assessment focus ClassShell', () => {
  it('activates only on the exact active attempt route and opens the class navigation as a left drawer', async () => {
    vi.spyOn(enrollmentApi, 'detail').mockResolvedValue(activeEnrollment);
    const view = renderClassShell('/student/enrollments/enrollment-1/attempts/attempt-1');

    expect(await screen.findByText('Attempt content')).toBeInTheDocument();
    expect(view.container.querySelector('[data-class-shell-mode="focus"]')).toBeInTheDocument();
    expect(
      view.container.querySelector('[data-class-navigation="persistent"]'),
    ).not.toBeInTheDocument();
    expect(view.container.querySelector('[data-class-shell-workspace="focus"]')).toHaveClass(
      'max-w-[1920px]',
    );

    const trigger = screen.getByRole('button', { name: 'Mở không gian lớp' });
    fireEvent.click(trigger);
    const dialog = screen.getByRole('dialog', { name: 'Không gian lớp' });
    expect(dialog.closest('[data-drawer-side]')).toHaveAttribute('data-drawer-side', 'left');
    expect(dialog).toHaveAttribute('aria-modal', 'true');

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Không gian lớp' })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it.each([
    '/student/enrollments/enrollment-1/learn',
    '/student/enrollments/enrollment-1/lessons/lesson-1',
    '/student/enrollments/enrollment-1/tests',
    '/student/enrollments/enrollment-1/results',
    '/student/enrollments/enrollment-1/progress',
    '/student/enrollments/enrollment-1/attempts/attempt-1/result',
  ])('keeps the standard ClassShell on %s', async (path) => {
    vi.spyOn(enrollmentApi, 'detail').mockResolvedValue(activeEnrollment);
    const view = renderClassShell(path);

    expect(await screen.findByText('Standard content')).toBeInTheDocument();
    expect(view.container.querySelector('[data-class-shell-mode="standard"]')).toBeInTheDocument();
    expect(
      view.container.querySelector('[data-class-navigation="persistent"]'),
    ).toBeInTheDocument();
    expect(view.container.querySelector('[data-class-shell-workspace="standard"]')).toHaveClass(
      'lg:grid-cols-[250px_1fr]',
    );
  });

  it('closes the class drawer after navigation without duplicating class navigation markup', async () => {
    vi.spyOn(enrollmentApi, 'detail').mockResolvedValue(activeEnrollment);
    renderClassShell('/student/enrollments/enrollment-1/attempts/attempt-1');
    await screen.findByText('Attempt content');

    fireEvent.click(screen.getByRole('button', { name: 'Mở không gian lớp' }));
    const dialog = screen.getByRole('dialog', { name: 'Không gian lớp' });
    expect(within(dialog).getAllByRole('navigation')).toHaveLength(1);
    fireEvent.click(within(dialog).getByRole('link', { name: 'Bài kiểm tra' }));

    expect(await screen.findByText('Standard content')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Không gian lớp' })).not.toBeInTheDocument();
  });

  it.each([390, 820, 1440])(
    'keeps the integrated attempt in drawer-based focus mode at %ipx',
    async (width) => {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
      vi.spyOn(enrollmentApi, 'detail').mockResolvedValue(activeEnrollment);
      vi.spyOn(studentAssessmentApi, 'getAttempt').mockResolvedValue(attemptContent());
      const view = render(
        <AuthContext.Provider
          value={{
            user: {
              id: 'student-1',
              email: 'student@example.test',
              fullName: 'Student',
              role: 'STUDENT',
              status: 'ACTIVE',
            },
            isLoading: false,
            error: null,
            login: vi.fn(),
            register: vi.fn(),
            logout: vi.fn().mockResolvedValue(undefined),
            refreshUser: vi.fn().mockResolvedValue(undefined),
          }}
        >
          <MemoryRouter initialEntries={['/student/enrollments/enrollment-1/attempts/a1']}>
            <Routes>
              <Route path="/student/enrollments/:enrollmentId" element={<ClassShellLayout />}>
                <Route path="attempts/:attemptId" element={<StudentTestAttemptPage />} />
              </Route>
            </Routes>
          </MemoryRouter>
        </AuthContext.Provider>,
      );

      expect(await screen.findByText('First group')).toBeInTheDocument();
      expect(view.container.querySelector('[data-class-shell-mode="focus"]')).toBeInTheDocument();
      expect(view.container.querySelector('[data-assessment-focus-workspace]')).toHaveClass(
        'w-full',
      );
      expect(view.container.querySelector('[data-class-navigation="persistent"]')).toBeNull();
      expect(screen.getByTestId('reading-workspace')).toHaveClass(
        'xl:grid-cols-[minmax(0,56fr)_minmax(24rem,44fr)]',
      );
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.queryByRole('img')).not.toBeInTheDocument();
    },
  );
});

describe('assessment question navigator drawer', () => {
  it('preserves active/completed/marked states, closes on selection, and focuses the group', async () => {
    vi.spyOn(studentAssessmentApi, 'getAttempt').mockResolvedValue(attemptContent());
    renderAttempt();

    expect(await screen.findByText('First group')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Đánh dấu xem lại' }));
    const trigger = screen.getByRole('button', { name: /Điều hướng · 0\/2/ });
    fireEvent.click(trigger);

    const dialog = screen.getByRole('dialog', { name: 'Điều hướng câu hỏi' });
    expect(dialog.closest('[data-drawer-side]')).toHaveAttribute('data-drawer-side', 'right');
    expect(within(dialog).getByRole('button', { name: /Câu 1.*Đã đánh dấu/ })).toHaveAttribute(
      'aria-current',
      'step',
    );
    fireEvent.click(within(dialog).getByRole('button', { name: /Câu 2/ }));

    expect(await screen.findByText('Second group')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Điều hướng câu hỏi' })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Second group').closest('section')).toHaveFocus());

    fireEvent.click(trigger);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(trigger).toHaveFocus();
  });

  it('does not force a Reading split for a non-Reading attempt group', async () => {
    const content = attemptContent();
    content.groups = [
      {
        ...content.groups![0],
        skill: 'LISTENING',
        taskCode: 'L4_TALK',
        stimuli: [],
        stimulusText: 'Listen to the talk.',
      },
    ];
    vi.spyOn(studentAssessmentApi, 'getAttempt').mockResolvedValue(content);
    const view = renderAttempt();

    await screen.findByText('First group');
    expect(view.container.querySelector('[data-attempt-layout="standard-column"]')).toHaveClass(
      'max-w-[68rem]',
    );
    expect(screen.queryByTestId('reading-workspace')).not.toBeInTheDocument();
  });
});

function renderClassShell(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/student/enrollments/:enrollmentId" element={<ClassShellLayout />}>
          <Route path="attempts/:attemptId" element={<p>Attempt content</p>} />
          <Route path="attempts/:attemptId/result" element={<p>Standard content</p>} />
          <Route path="learn" element={<p>Standard content</p>} />
          <Route path="lessons/:lessonId" element={<p>Standard content</p>} />
          <Route path="tests" element={<p>Standard content</p>} />
          <Route path="results" element={<p>Standard content</p>} />
          <Route path="progress" element={<p>Standard content</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

function renderAttempt() {
  return renderAssessmentRoute(
    <StudentTestAttemptPage />,
    '/student/enrollments/e1/attempts/a1',
    '/student/enrollments/:enrollmentId/attempts/:attemptId',
  );
}

function attemptContent(): StudentAttemptContent {
  return {
    attempt: {
      id: 'a1',
      attemptNumber: 1,
      status: 'IN_PROGRESS',
      startedAt: '2026-10-19T00:00:00Z',
      submittedAt: null,
    },
    test: {
      id: 'test-1',
      title: 'Reading practice',
      type: 'QUIZ',
      purpose: 'PRACTICE_MOCK',
      lessonId: 'lesson-1',
      stage: null,
      timeLimitMinutes: null,
    },
    groups: [readingGroup('group-1', 'First group', 0), readingGroup('group-2', 'Second group', 1)],
  };
}

function readingGroup(id: string, title: string, orderIndex: number): StudentAttemptGroup {
  return {
    id,
    skill: 'READING',
    orderIndex,
    title,
    instructions: null,
    taskCode: 'R7_READING_COMPREHENSION',
    preparationSeconds: null,
    responseSeconds: null,
    recommendedSeconds: null,
    maxRecordingSeconds: null,
    stimulusText:
      'From: reader@example.test\nTo: learner@example.test\nSubject: Practice\n\nRead this document.',
    stimuli: [],
    questions: [
      {
        testQuestionId: `test-question-${id}`,
        points: 1,
        selectedOptionIds: [],
        question: {
          id: `question-${id}`,
          type: 'SINGLE_CHOICE',
          responseType: 'SINGLE_CHOICE',
          toeicSkill: 'READING',
          difficulty: 'MEDIUM',
          content: `Question for ${title}`,
          options: [
            { id: `option-${id}-a`, content: 'Choice A', orderIndex: 0 },
            { id: `option-${id}-b`, content: 'Choice B', orderIndex: 1 },
          ],
        },
      },
    ],
  };
}

const activeEnrollment: EnrollmentView = {
  id: 'enrollment-1',
  status: 'ACTIVE',
  enrolledAt: '2026-09-01T00:00:00Z',
  classOffering: {
    id: 'offering-1',
    code: 'TOEIC-01',
    name: 'TOEIC Evening',
    status: 'IN_PROGRESS',
    modality: 'ONLINE',
    pricingType: 'FREE',
    tuitionFeeVnd: 0,
    classStart: null,
    classEnd: null,
    instructor: { id: 'teacher-1', fullName: 'Teacher' },
    scheduleSlots: [],
    course: {
      id: 'course-1',
      title: 'TOEIC',
      slug: 'toeic',
      level: 'A1',
      skillScope: 'LR',
      thumbnailUrl: null,
    },
  },
  progress: { totalLessons: 2, completedLessons: 1, progressPercent: 50 },
};
