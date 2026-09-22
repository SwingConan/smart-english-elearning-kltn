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
  it('links an assigned Instructor course to Question Bank and Test management without results dashboard', async () => {
    vi.spyOn(instructorApi.teaching, 'list').mockResolvedValue([{
      course: { id: 'course-a', title: 'Assigned Course', slug: 'assigned', level: 'A1', isPublished: true, _count: { modules: 1 } },
      classOfferings: [{ id: 'offering-a', name: 'Class A', status: 'OPEN' }],
    }]);
    renderAssessmentRoute(<InstructorTeachingPage />, '/instructor/teaching', '/instructor/teaching', { role: 'INSTRUCTOR' });
    await screen.findByText('Assigned Course');
    expect(screen.getByRole('link', { name: /Ngân hàng câu hỏi/i })).toHaveAttribute('href', '/instructor/courses/course-a/question-bank');
    expect(screen.getByRole('link', { name: /Quản lý bài kiểm tra/i })).toHaveAttribute('href', '/instructor/courses/course-a/tests');
    expect(screen.queryByRole('link', { name: /kết quả/i })).not.toBeInTheDocument();
  });

  it('links Student Learning to the published Test list', async () => {
    vi.spyOn(learningApi, 'getContent').mockResolvedValue({
      course: { id: 'course-a', title: 'Student Course', level: 'A1' }, modules: [],
    });
    vi.spyOn(learningApi, 'getProgress').mockResolvedValue({
      enrollmentId: 'enrollment-a', courseTitle: 'Student Course', totalLessons: 0, completedLessons: 0, progressPercent: 0,
    });
    renderAssessmentRoute(
      <LearningPage />, '/student/enrollments/enrollment-a/learn',
      '/student/enrollments/:enrollmentId/learn',
    );
    await screen.findByText('Student Course');
    expect(screen.getByRole('link', { name: /Bài kiểm tra/i })).toHaveAttribute('href', '/student/enrollments/enrollment-a/tests');
  });
});
