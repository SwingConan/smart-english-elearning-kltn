import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '@/App';
import { newsEvents } from '@/content/news-events';
import { AuthProvider } from '@/features/auth/AuthContext';
import { authApi } from '@/features/auth/api';
import { catalogApi } from '@/features/catalog/api';
import { enrollmentApi } from '@/features/enrollments/api';
import type { EnrollmentView } from '@/features/enrollments/types';
import { learningApi } from '@/features/learning/api';
import type { CourseProgress } from '@/features/learning/types';
import { ApiError } from '@/lib/api-client';
import { ClassShellLayout } from '@/layouts/ClassShellLayout';
import { PublicLayout } from '@/layouts/PublicLayout';
import { ClassOfferingDetailPage } from '@/pages/ClassOfferingDetailPage';
import { AboutPage } from '@/pages/AboutPage';
import { HomePage } from '@/pages/HomePage';
import { GuidePage } from '@/pages/GuidePage';
import { NewsEventDetailPage } from '@/pages/NewsEventDetailPage';
import { NewsEventsPage } from '@/pages/NewsEventsPage';
import { ProgressPage } from '@/pages/ProgressPage';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('M02 public product surface', () => {
  it('provides desktop and mobile public navigation with a safe Placement destination', async () => {
    vi.spyOn(authApi, 'me').mockRejectedValue(new ApiError(401, null));
    render(
      <MemoryRouter>
        <AuthProvider>
          <Routes>
            <Route element={<PublicLayout />}>
              <Route index element={<p>Page body</p>} />
            </Route>
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );
    expect(screen.getAllByRole('link', { name: 'Khóa học' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: 'Kiểm tra đầu vào' })[0]).toHaveAttribute(
      'href',
      '/placement',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Mở menu' }));
    expect(screen.getByRole('navigation', { name: 'Điều hướng di động' })).toBeInTheDocument();
    expect(screen.getByText('Page body')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Trạng thái hệ thống' })).toHaveAttribute(
      'href',
      '/status',
    );
    expect(screen.queryByText(/Kênh liên hệ của nhóm dự án/i)).not.toBeInTheDocument();
  });

  it('renders every required homepage section from real/static sources', async () => {
    vi.spyOn(catalogApi, 'list').mockResolvedValue({
      data: [],
      meta: { total: 0, page: 1, limit: 3, totalPages: 0 },
    });
    const view = render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Bạn muốn bắt đầu từ đâu/i })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /Trải nghiệm học tại Smart English/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Tin tức & Sự kiện/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Bắt đầu kiểm tra đầu vào' })).toHaveAttribute(
      'href',
      '/placement',
    );
    expect(await screen.findByText(/Chưa có khóa học được công bố/i)).toBeInTheDocument();
    expect(view.container).not.toHaveTextContent(
      /milestone|M02|M03|M04|M05|ClassOffering|LessonProgress/i,
    );
  });

  it('renders typed news list, detail and not-found state', () => {
    expect(newsEvents).toHaveLength(8);
    const list = render(
      <MemoryRouter>
        <NewsEventsPage />
      </MemoryRouter>,
    );
    expect(screen.getAllByRole('heading', { name: newsEvents[0].title })).toHaveLength(2);
    list.unmount();
    const detail = render(
      <MemoryRouter initialEntries={[`/news-events/${newsEvents[0].slug}`]}>
        <Routes>
          <Route path="/news-events/:slug" element={<NewsEventDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: newsEvents[0].title })).toBeInTheDocument();
    expect(screen.getByText(/Placement nội bộ trước Enrollment/i)).toBeInTheDocument();
    detail.unmount();
    render(
      <MemoryRouter initialEntries={['/news-events/missing']}>
        <Routes>
          <Route path="/news-events/:slug" element={<NewsEventDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: /Không tìm thấy bài viết/i })).toBeInTheDocument();
  });

  it('filters and searches the editorial library', () => {
    render(
      <MemoryRouter>
        <NewsEventsPage />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Workshop' }));
    expect(screen.getByText('1 bài viết phù hợp')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Workshop Listening/i })).toBeInTheDocument();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Tìm bài viết' }), {
      target: { value: 'không tồn tại' },
    });
    expect(
      screen.getByRole('heading', { name: /Chưa tìm thấy bài viết phù hợp/i }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Xóa bộ lọc/i }));
    expect(screen.getByText('8 bài viết phù hợp')).toBeInTheDocument();
  });

  it('presents the complete ten-step guide and accessible FAQ', () => {
    render(
      <MemoryRouter>
        <GuidePage />
      </MemoryRouter>,
    );
    expect(screen.getByText('BƯỚC 10')).toBeInTheDocument();
    expect(
      screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent),
    ).toEqual([
      'Tạo tài khoản và đăng nhập',
      'Khám phá chương trình và xác định mục tiêu',
      'Làm Placement trước Enrollment',
      'Đọc Evaluation theo kỹ năng',
      'Xem gợi ý khóa học và lớp',
      'Chọn lớp phù hợp',
      'Enrollment và trạng thái đăng ký',
      'Học trong Student LMS',
      'Thực hiện In-class Assessment',
      'Đọc kết quả, tiến độ và bước tiếp theo',
    ]);
    expect(screen.getByRole('link', { name: 'Xem khóa học' })).toHaveAttribute('href', '/catalog');
    expect(screen.getByRole('heading', { name: 'Thuật ngữ cần biết' })).toBeInTheDocument();
    expect(screen.getByText('Tôi nên chọn khóa học hay lớp học trước?')).toBeInTheDocument();
  });

  it('shows Placement and Evaluation before Enrollment in the About journey', () => {
    render(
      <MemoryRouter>
        <AboutPage />
      </MemoryRouter>,
    );
    expect(screen.getByText('Placement')).toBeInTheDocument();
    expect(screen.getByText('Evaluation & gợi ý')).toBeInTheDocument();
    expect(screen.getByText('Enrollment')).toBeInTheDocument();
    expect(screen.getByText('LMS & Assessment')).toBeInTheDocument();
    expect(screen.getByText('Kết quả & bước tiếp theo')).toBeInTheDocument();
  });

  it('shows ClassOffering details and guest auth CTA without private fields', async () => {
    vi.spyOn(authApi, 'me').mockRejectedValue(new ApiError(401, null));
    vi.spyOn(catalogApi, 'offeringDetail').mockResolvedValue({
      id: 'offering-1',
      code: 'TOEIC-01',
      name: 'TOEIC Evening',
      status: 'OPEN',
      modality: 'ONLINE',
      pricingType: 'FREE',
      tuitionFeeVnd: 0,
      maxStudents: 20,
      totalSessions: 18,
      totalPeriods: 36,
      enrollmentStart: null,
      enrollmentEnd: null,
      classStart: null,
      classEnd: null,
      scheduleSlots: [],
      registeredCount: 5,
      remainingSeats: 15,
      isFull: false,
      registrationState: 'AVAILABLE',
      instructor: { id: 'teacher-1', fullName: 'Teacher' },
      course: {
        id: 'course-1',
        title: 'TOEIC',
        slug: 'toeic',
        description: 'Course summary',
        level: 'A1',
        skillScope: 'LR',
      },
    } as never);
    render(
      <MemoryRouter initialEntries={['/classes/offering-1']}>
        <AuthProvider>
          <Routes>
            <Route path="/classes/:id" element={<ClassOfferingDetailPage />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );
    expect(await screen.findByRole('heading', { name: 'TOEIC Evening' })).toBeInTheDocument();
    expect(screen.getByText('Teacher')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Đăng nhập để đăng ký/i })).toHaveAttribute(
      'href',
      expect.stringContaining('/login?'),
    );
    expect(screen.queryByText(/email|password/i)).not.toBeInTheDocument();
  });

  it('keeps the student workspace outside the public marketing layout', async () => {
    vi.spyOn(authApi, 'me').mockResolvedValue({
      id: 'student-1',
      email: 'student@example.com',
      fullName: 'Người học',
      role: 'STUDENT',
      status: 'ACTIVE',
    });
    vi.spyOn(enrollmentApi, 'listMine').mockResolvedValue([]);
    const view = render(
      <MemoryRouter initialEntries={['/student/enrollments']}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </MemoryRouter>,
    );
    expect(await screen.findByRole('heading', { name: /Lớp học của tôi/i })).toBeInTheDocument();
    expect(screen.getAllByText('Không gian học tập')).toHaveLength(2);
    expect(
      screen.getByRole('link', { name: /Smart English\s*Không gian học tập/i }),
    ).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Trang chủ' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Khóa học của tôi' })).toHaveAttribute(
      'href',
      '/student/enrollments',
    );
    expect(screen.queryByRole('link', { name: /Tin tức & Sự kiện/i })).not.toBeInTheDocument();
    expect(view.container).not.toHaveTextContent(
      /milestone|M02|M03|M04|M05|ClassOffering|LessonProgress/i,
    );
  });
});

describe('M02 class shell and progress', () => {
  it('keeps class context and only the five core navigation entries', async () => {
    vi.spyOn(enrollmentApi, 'detail').mockResolvedValue(activeEnrollment);
    render(
      <MemoryRouter initialEntries={['/student/enrollments/enrollment-1']}>
        <Routes>
          <Route path="/student/enrollments/:enrollmentId" element={<ClassShellLayout />}>
            <Route index element={<p>Overview content</p>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByText('TOEIC Evening')).toBeInTheDocument();
    const navigation = screen.getByRole('navigation', { name: 'Điều hướng lớp học' });
    expect(navigation).toHaveTextContent('Tổng quan');
    expect(navigation).toHaveTextContent('Nội dung học tập');
    expect(navigation).toHaveTextContent('Bài kiểm tra');
    expect(navigation).toHaveTextContent('Kết quả');
    expect(navigation).toHaveTextContent('Tiến độ');
    expect(navigation).not.toHaveTextContent(/mastery|adaptive/i);
  });

  it('blocks PENDING_PAYMENT before rendering LMS content', async () => {
    vi.spyOn(enrollmentApi, 'detail').mockResolvedValue({
      ...activeEnrollment,
      status: 'PENDING_PAYMENT',
    });
    render(
      <MemoryRouter initialEntries={['/student/enrollments/enrollment-1']}>
        <Routes>
          <Route path="/student/enrollments/:enrollmentId" element={<ClassShellLayout />}>
            <Route index element={<p>Protected content</p>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    expect(
      await screen.findByRole('heading', { name: /Lớp chưa mở quyền học/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument();
  });

  it('renders module, lesson and assessment progress without BKT mastery', async () => {
    vi.spyOn(learningApi, 'getProgress').mockResolvedValue(progress);
    render(
      <MemoryRouter initialEntries={['/student/enrollments/enrollment-1/progress']}>
        <Routes>
          <Route path="/student/enrollments/:enrollmentId/progress" element={<ProgressPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect((await screen.findAllByText('50%')).length).toBeGreaterThan(0);
    expect(screen.getByText('Listening')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Photographs' })).toHaveAttribute(
      'href',
      '/student/enrollments/enrollment-1/lessons/lesson-1',
    );
    expect(screen.getByText('Practice Test')).toBeInTheDocument();
    expect(screen.getByText('Luyện tập / Thi thử')).toBeInTheDocument();
    expect(screen.queryByText('Kiểm tra thường kỳ')).not.toBeInTheDocument();
    expect(screen.queryByText(/mastery|BKT/i)).not.toBeInTheDocument();
  });
});

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
const progress: CourseProgress = {
  enrollmentId: 'enrollment-1',
  courseTitle: 'TOEIC',
  totalLessons: 2,
  completedLessons: 1,
  progressPercent: 50,
  modules: [
    {
      id: 'module-1',
      title: 'Listening',
      orderIndex: 0,
      totalLessons: 2,
      completedLessons: 1,
      progressPercent: 50,
      lessons: [
        {
          id: 'lesson-1',
          title: 'Photographs',
          orderIndex: 0,
          status: 'COMPLETED',
          completedAt: '2026-09-20T00:00:00Z',
        },
        {
          id: 'lesson-2',
          title: 'Questions',
          orderIndex: 1,
          status: 'NOT_STARTED',
          completedAt: null,
        },
      ],
    },
  ],
  assessments: [
    {
      id: 'assessment-1',
      testId: 'test-1',
      title: 'Practice Test',
      purpose: 'PRACTICE_MOCK',
      stage: 'PERIODIC',
      openAt: null,
      closeAt: null,
      maxAttempts: 1,
      status: 'NOT_STARTED',
      currentAttempt: null,
      submittedAttempts: [],
    },
  ],
};
