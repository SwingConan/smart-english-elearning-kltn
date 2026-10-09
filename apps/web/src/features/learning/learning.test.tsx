import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LearningPage } from '@/pages/LearningPage';
import { LessonPage } from '@/pages/LessonPage';
import { learningApi } from './api';
import type { CourseContent, LessonDetail } from './types';

const enrollmentId = 'enrollment-1';
const lessonId = 'lesson-1';
const content: CourseContent = {
  course: { id: 'course-1', title: 'TOEIC Course', level: 'A1' },
  modules: [
    {
      id: 'module-1',
      title: 'Listening',
      description: null,
      orderIndex: 0,
      lessons: [
        {
          id: lessonId,
          title: 'Photographs',
          description: null,
          orderIndex: 0,
          progressStatus: 'IN_PROGRESS',
          resourceCount: 2,
        },
        {
          id: 'lesson-2',
          title: 'Questions',
          description: null,
          orderIndex: 1,
          progressStatus: 'NOT_STARTED',
          resourceCount: 0,
        },
      ],
    },
  ],
};
const detail = (status: 'IN_PROGRESS' | 'COMPLETED' = 'IN_PROGRESS'): LessonDetail => ({
  id: lessonId,
  title: 'Photographs',
  description: 'Lesson content',
  orderIndex: 0,
  module: { id: 'module-1', title: 'Listening' },
  progress: {
    status,
    lastAccessedAt: '2026-09-20T00:00:00Z',
    completedAt: status === 'COMPLETED' ? '2026-09-20T01:00:00Z' : null,
  },
  resources: [
    {
      id: 'download-1',
      title: 'Worksheet',
      type: 'DOCUMENT',
      url: null,
      originalFileName: 'worksheet.pdf',
      mimeType: 'application/pdf',
      updatedAt: '2026-09-20T00:00:00Z',
      orderIndex: 0,
      isDownloadable: true,
    },
    {
      id: 'link-1',
      title: 'Reference',
      type: 'LINK',
      url: 'https://example.test/reference',
      originalFileName: null,
      mimeType: null,
      updatedAt: '2026-09-20T00:00:00Z',
      orderIndex: 1,
      isDownloadable: false,
    },
  ],
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('class learning', () => {
  it('renders modules and lesson deep links without legacy core navigation', async () => {
    vi.spyOn(learningApi, 'getContent').mockResolvedValue(content);
    render(
      <MemoryRouter initialEntries={[`/student/enrollments/${enrollmentId}/learn`]}>
        <Routes>
          <Route path="/student/enrollments/:enrollmentId/learn" element={<LearningPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByText('Listening')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Photographs/i })).toHaveAttribute(
      'href',
      `/student/enrollments/${enrollmentId}/lessons/${lessonId}`,
    );
    expect(screen.queryByText(/mastery|adaptive/i)).not.toBeInTheDocument();
  });

  it('opens a deep-linked lesson, navigates next and completes once', async () => {
    vi.spyOn(learningApi, 'getContent').mockResolvedValue(content);
    vi.spyOn(learningApi, 'openLesson')
      .mockResolvedValueOnce(detail())
      .mockResolvedValueOnce(detail('COMPLETED'));
    let resolveComplete!: () => void;
    const complete = vi.spyOn(learningApi, 'completeLesson').mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveComplete = resolve;
      }),
    );
    renderLesson();
    expect(await screen.findByRole('heading', { name: 'Photographs' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Questions/i })).toHaveAttribute(
      'href',
      `/student/enrollments/${enrollmentId}/lessons/lesson-2`,
    );
    const button = screen.getByRole('button', { name: /Hoàn thành bài học/i });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(complete).toHaveBeenCalledOnce();
    resolveComplete();
    expect(await screen.findByText(/Đã hoàn thành bài học/i)).toBeInTheDocument();
  });

  it('starts a real browser download for the visible stored-file action and reports failure safely', async () => {
    vi.spyOn(learningApi, 'getContent').mockResolvedValue(content);
    vi.spyOn(learningApi, 'openLesson').mockResolvedValue(detail());
    const objectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:stored-resource');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    vi.spyOn(learningApi, 'downloadStoredResource').mockResolvedValueOnce({
      blob: new Blob(['document']),
      fileName: 'worksheet.pdf',
    });
    const page = renderLesson();
    fireEvent.click(await screen.findByRole('button', { name: /Tải xuống/i }));
    await waitFor(() => expect(click).toHaveBeenCalledOnce());
    expect(objectUrl).toHaveBeenCalledWith(expect.any(Blob));
    expect(revoke).toHaveBeenCalledWith('blob:stored-resource');
    page.unmount();
    vi.spyOn(learningApi, 'getContent').mockResolvedValue(content);
    vi.spyOn(learningApi, 'openLesson').mockResolvedValue(detail());
    vi.spyOn(learningApi, 'downloadStoredResource').mockRejectedValueOnce(
      new Error('private details'),
    );
    renderLesson();
    fireEvent.click(await screen.findByRole('button', { name: /Tải xuống/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Không thể tải worksheet.pdf/i);
    expect(screen.queryByText('private details')).not.toBeInTheDocument();
  });

  it('keeps YouTube resources compact and mounts the privacy-enhanced player only on demand', async () => {
    vi.spyOn(learningApi, 'getContent').mockResolvedValue(content);
    vi.spyOn(learningApi, 'openLesson').mockResolvedValue({
      ...detail(),
      resources: [
        ...detail().resources,
        {
          id: 'video-1', title: 'Video bài học', type: 'VIDEO',
          url: 'https://www.youtube.com/watch?v=abcDEF_1234', originalFileName: null,
          mimeType: null, updatedAt: '2026-09-20T00:00:00Z', orderIndex: 2,
          isDownloadable: false,
        },
      ],
    });
    renderLesson();
    await screen.findByText('Video bài học');
    expect(screen.queryByTitle('Video bài học')).not.toBeInTheDocument();
    const expand = screen.getByRole('button', { name: /Xem video trong bài học/i });
    expect(expand).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(expand);
    expect(screen.getByTitle('Video bài học')).toHaveAttribute(
      'src',
      'https://www.youtube-nocookie.com/embed/abcDEF_1234',
    );
    expect(screen.getByRole('button', { name: /Thu gọn video/i })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });
});

describe('learning API contract', () => {
  it('opens a lesson through the explicit side-effect route', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
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

function renderLesson() {
  return render(
    <MemoryRouter initialEntries={[`/student/enrollments/${enrollmentId}/lessons/${lessonId}`]}>
      <Routes>
        <Route
          path="/student/enrollments/:enrollmentId/lessons/:lessonId"
          element={<LessonPage />}
        />
      </Routes>
    </MemoryRouter>,
  );
}
