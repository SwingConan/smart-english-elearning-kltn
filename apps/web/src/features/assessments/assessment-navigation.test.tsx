import '@testing-library/jest-dom/vitest';
import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { instructorApi } from '@/features/instructor/api';
import { learningApi } from '@/features/learning/api';
import { InstructorTeachingPage } from '@/pages/InstructorTeachingPage';
import { LearningPage } from '@/pages/LearningPage';
import { renderAssessmentRoute } from './assessment-test-utils';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('assessment navigation', () => {
  it('keeps the dense teaching list focused on one class entry action', async () => {
    vi.spyOn(instructorApi.teaching, 'list').mockResolvedValue([
      {
        course: {
          id: 'course-a',
          title: 'Assigned Course',
          slug: 'assigned',
          level: 'A1',
          isPublished: true,
          _count: { modules: 1 },
        },
        classOfferings: [{ id: 'offering-a', name: 'Class A', status: 'OPEN' }],
      },
    ]);
    renderAssessmentRoute(
      <InstructorTeachingPage />,
      '/instructor/teaching',
      '/instructor/teaching',
      { role: 'INSTRUCTOR' },
    );
    expect((await screen.findAllByText('Assigned Course')).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: /Vào lớp/i })[0]).toHaveAttribute('href', '/instructor/classes/offering-a');
    expect(screen.queryByText('Công cụ')).not.toBeInTheDocument();
    expect(screen.getAllByText('Đang mở đăng ký').length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toMatch(/Adaptive Policy|Learner Mastery|Knowledge Model/);
  });

  it('renders the class curriculum with lesson deep links', async () => {
    vi.spyOn(learningApi, 'getContent').mockResolvedValue({
      course: { id: 'course-a', title: 'Student Course', level: 'A1' },
      modules: [
        {
          id: 'module-a',
          title: 'Module A',
          description: null,
          orderIndex: 0,
          lessons: [
            {
              id: 'lesson-a',
              title: 'Lesson A',
              description: null,
              orderIndex: 0,
              progressStatus: 'NOT_STARTED',
              resourceCount: 1,
            },
          ],
        },
      ],
    });
    renderAssessmentRoute(
      <LearningPage />,
      '/student/enrollments/enrollment-a/learn',
      '/student/enrollments/:enrollmentId/learn',
    );
    expect(await screen.findByRole('link', { name: /Lesson A/i })).toHaveAttribute(
      'href',
      '/student/enrollments/enrollment-a/lessons/lesson-a',
    );
    expect(screen.queryByRole('link', { name: /mastery|adaptive/i })).not.toBeInTheDocument();
  });
});
