import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import { AuthContext, type AuthContextValue } from '@/features/auth/auth-context';
import type { UserRole } from '@/features/auth/api';
import { workspaceLanding } from '@/features/auth/business-role';
import { ToastProvider } from '@/components/ui/Feedback';
import { ActorWorkspaceLayout } from '@/layouts/ActorWorkspaceLayout';
import { RoleWorkspacePage } from '@/pages/RoleWorkspacePage';
import { instructorApi } from '@/features/instructor/api';
import { lmsLocalApi } from '@/features/class-lms/lms-local-api';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function renderShell(role: UserRole, fullName: string) {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
  const auth: AuthContextValue = {
    user: {
      id: `user-${role.toLowerCase()}`,
      fullName,
      email: `${role.toLowerCase()}@example.invalid`,
      role,
      status: 'ACTIVE',
    },
    isLoading: false,
    error: null,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    refreshUser: vi.fn(),
  };

  return render(
    <MemoryRouter initialEntries={['/workspace']}>
      <AuthContext.Provider value={auth}>
        <ToastProvider>
          <ActorWorkspaceLayout />
        </ToastProvider>
      </AuthContext.Provider>
    </MemoryRouter>,
  );
}

describe('Unified post-login overview & IUH navigation across all 6 actors', () => {
  it('routes every actor login landing to /workspace', () => {
    const roles: UserRole[] = [
      'STUDENT',
      'INSTRUCTOR',
      'ACADEMIC_MANAGER',
      'COUNSELOR',
      'CASHIER',
      'SYSTEM_ADMIN',
    ];
    for (const role of roles) {
      expect(workspaceLanding(role)).toBe('/workspace');
    }
  });

  it('gives STUDENT unified Trang chủ học tập (/workspace) -> Lớp đang theo học (/student/enrollments) without leaking staff links', () => {
    renderShell('STUDENT', 'Học viên Smart English');
    const nav = within(screen.getByRole('navigation', { name: 'Điều hướng chính học viên' }));
    expect(nav.getByRole('link', { name: /Trang chủ học tập/i })).toHaveAttribute('href', '/workspace');
    expect(nav.getByRole('link', { name: /Lớp đang theo học/i })).toHaveAttribute(
      'href',
      '/student/enrollments',
    );
    expect(nav.getByRole('link', { name: /Bảng điều khiển/i })).toHaveAttribute('href', '/my/calendar');
    // Top-right avatar navigates directly to /profile; dropdown header card also links to /profile
    expect(screen.getByRole('link', { name: 'Mở hồ sơ cá nhân' })).toHaveAttribute('href', '/profile');
    fireEvent.click(screen.getByRole('button', { name: 'Mở menu tài khoản' }));
    expect(screen.getByRole('link', { name: /Xem & chỉnh sửa hồ sơ/i })).toHaveAttribute(
      'href',
      '/profile',
    );
    for (const link of screen.getAllByRole('link')) {
      expect(link.getAttribute('href')).not.toMatch(
        /^\/(?:academic|admin)(?:\/|$)|^\/workspace\/(?:authority|operations|admissions|support|cms)/,
      );
    }
  });

  it('gives INSTRUCTOR unified Tổng quan giảng dạy (/workspace), Lớp được phân công (/instructor/teaching) and Bảng điều khiển (/my/calendar)', () => {
    renderShell('INSTRUCTOR', 'Giảng viên tiếng Anh');
    const nav = within(screen.getByRole('navigation', { name: 'Điều hướng chính giảng viên' }));
    expect(nav.getByRole('link', { name: /Tổng quan giảng dạy/i })).toHaveAttribute(
      'href',
      '/workspace',
    );
    expect(nav.getByRole('link', { name: /Lớp được phân công/i })).toHaveAttribute(
      'href',
      '/instructor/teaching',
    );
    expect(nav.getByRole('link', { name: /Bảng điều khiển/i })).toHaveAttribute(
      'href',
      '/my/calendar',
    );
    expect(nav.queryByRole('link', { name: /Lịch dạy & Ca học/i })).not.toBeInTheDocument();
  });

  it('renders dedicated real-data InstructorWorkspaceDashboard at /workspace instead of generic legacy cards', async () => {
    vi.spyOn(instructorApi.classes, 'list').mockResolvedValue([
      {
        id: 'cls-toeic-1',
        code: 'SE-PRACTICE-01',
        name: 'TOEIC nền tảng 450+ · Lớp Nghe-Đọc B',
        status: 'OPEN',
        activeLearnerCount: 12,
        course: { id: 'course-1', title: 'TOEIC 450+', level: 'A2' },
      },
    ]);
    vi.spyOn(instructorApi.classes, 'overview').mockResolvedValue({
      classOffering: {
        id: 'cls-toeic-1',
        code: 'SE-PRACTICE-01',
        name: 'TOEIC nền tảng 450+ · Lớp Nghe-Đọc B',
        status: 'OPEN',
        activeLearnerCount: 12,
        course: { id: 'course-1', title: 'TOEIC 450+', level: 'A2' },
      },
      activeLearnerCount: 12,
      lessonProgress: { completed: 3, total: 10, percentage: 30 },
      assessments: [],
      pendingGradingCount: 2,
      grading: {
        waiting: 2,
        partial: 0,
        final: 1,
        attempts: [
          {
            state: 'WAITING',
            attemptId: 'att-1',
            attemptNumber: 1,
            submittedAt: '2026-11-12T10:00:00.000Z',
            learnerId: 'u-1',
            learner: { fullName: 'Nguyễn Minh An', email: 'an@example.invalid' },
            assessmentId: 'ass-1',
            assessmentTitle: 'Quiz Reading Part 5',
          },
        ],
      },
      progressBuckets: [],
      upcomingDeadlines: [],
      followUps: [],
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/v2/my/calendar')) {
          return new Response(JSON.stringify({ data: [] }), { status: 200 });
        }
        if (url.includes('/v2/consultations/bookings')) {
          return new Response(JSON.stringify({ data: [] }), { status: 200 });
        }
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      }),
    );

    const auth: AuthContextValue = {
      user: {
        id: 'inst-1',
        fullName: 'Giảng viên tiếng Anh',
        email: 'teacher@example.invalid',
        role: 'INSTRUCTOR',
        status: 'ACTIVE',
      },
      isLoading: false,
      error: null,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
    };

    render(
      <MemoryRouter initialEntries={['/workspace']}>
        <AuthContext.Provider value={auth}>
          <ToastProvider>
            <RoleWorkspacePage />
          </ToastProvider>
        </AuthContext.Provider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('TOEIC nền tảng 450+ · Lớp Nghe-Đọc B')).toBeInTheDocument();
    });
    expect(screen.getByText('Quiz Reading Part 5')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Vào lớp/i })).toHaveAttribute(
      'href',
      '/classroom/cls-toeic-1',
    );
    expect(screen.queryByText(/Tình trạng nguồn vận hành/i)).not.toBeInTheDocument();
  });

  it('supports instructor class, grading queue, schedule timeframe, and consultation filters', async () => {
    const now = Date.now();
    const in2Hours = new Date(now + 2 * 3600_000).toISOString();
    const in3Hours = new Date(now + 3 * 3600_000).toISOString();
    const in15Days = new Date(now + 15 * 86_400_000).toISOString();
    const in15DaysEnd = new Date(now + 15 * 86_400_000 + 3600_000).toISOString();

    const clsOpen = {
      id: 'cls-open',
      code: 'SE-LIST-550',
      name: 'TOEIC Listening Focus 550+',
      status: 'OPEN',
      modality: 'ONLINE',
      activeLearnerCount: 14,
      course: { id: 'c1', title: 'TOEIC 550+', level: 'B1' },
    };
    const clsDone = {
      id: 'cls-done',
      code: 'SE-READ-K24',
      name: 'TOEIC Reading K24',
      status: 'COMPLETED',
      modality: 'OFFLINE',
      activeLearnerCount: 10,
      course: { id: 'c2', title: 'TOEIC Reading 550+', level: 'B1' },
    };

    vi.spyOn(instructorApi.classes, 'list').mockResolvedValue([clsOpen, clsDone]);
    vi.spyOn(instructorApi.classes, 'overview').mockImplementation(async (classId) => ({
      classOffering: classId === 'cls-open' ? clsOpen : clsDone,
      activeLearnerCount: classId === 'cls-open' ? 14 : 10,
      lessonProgress: { completed: 0, total: 0, percentage: 0 },
      assessments: [],
      pendingGradingCount: classId === 'cls-open' ? 1 : 0,
      grading: {
        waiting: classId === 'cls-open' ? 1 : 0,
        partial: 0,
        final: 0,
        attempts:
          classId === 'cls-open'
            ? [
                {
                  state: 'WAITING',
                  attemptId: 'att-formal',
                  attemptNumber: 1,
                  submittedAt: in2Hours,
                  learnerId: 'stu-1',
                  learner: { fullName: 'Nguyễn Minh An', email: 'an@example.invalid' },
                  assessmentId: 'ass-1',
                  assessmentTitle: 'Đánh giá giai đoạn 1',
                },
              ]
            : [],
      },
      progressBuckets: [],
      upcomingDeadlines: [],
      followUps: [],
    }));
    vi.spyOn(lmsLocalApi, 'getUnifiedClassResults').mockImplementation(async (classId) => ({
      class: {
        id: classId,
        code: classId === 'cls-open' ? 'SE-LIST-550' : 'SE-READ-K24',
        name: classId === 'cls-open' ? 'TOEIC Listening Focus 550+' : 'TOEIC Reading K24',
        courseId: 'c1',
      },
      editable: true,
      activityColumns:
        classId === 'cls-open'
          ? [
              {
                activityId: 'act-hw-1',
                sectionId: 'sec-1',
                sectionTitle: 'Tuần 1',
                sectionOrder: 1,
                orderIndex: 1,
                title: 'Bài tập Dictation Tuần 1',
                baseType: 'ASSIGNMENT',
                localKind: null,
                assessmentKind: null,
                kindLabel: 'Bài tập',
                state: 'PUBLISHED',
                availableFrom: null,
                availableUntil: null,
                maxScore: 10,
                passScore: 5,
                releaseMode: null,
              },
            ]
          : [],
      studentRows:
        classId === 'cls-open'
          ? [
              {
                enrollmentId: 'enr-1',
                learnerId: 'stu-1',
                fullName: 'Nguyễn Minh An',
                email: 'an@example.invalid',
                assignments: {
                  'act-hw-1': {
                    activityId: 'act-hw-1',
                    submissionId: 'sub-1',
                    submissionState: 'SUBMITTED',
                    submittedAt: in2Hours,
                    score: null,
                    maxScore: 10,
                    gradeState: 'NOT_GRADED',
                    gradeSource: 'LOCAL_DIRECT',
                    feedback: '',
                    gradedAt: null,
                  },
                },
                quizzes: {},
                attendance: {},
                stats: {
                  submittedAssignments: 1,
                  publishedAssignmentGrades: 0,
                  submittedQuizzes: 0,
                  publishedQuizGrades: 0,
                  presentCount: 0,
                  lateCount: 0,
                  openedAttendanceCount: 0,
                  averagePercent: null,
                },
              },
            ]
          : [],
      formalAssessments: [],
      draftCoreQuizCount: 0,
      summary: {
        totalActivities: classId === 'cls-open' ? 25 : 10,
        publishedActivities: classId === 'cls-open' ? 23 : 10,
        assignmentsCount: classId === 'cls-open' ? 8 : 2,
        quizzesCount: 1,
        regularExamCount: 2,
        midtermCount: 1,
        finalCount: 1,
        attendanceCount: 3,
        awaitingAssignmentGrades: classId === 'cls-open' ? 1 : 0,
        awaitingManualQuizGrades: 0,
        formalAssessmentCount: 0,
        draftCoreQuizCount: 0,
      },
      policyNotes: [],
    }));

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/v2/my/calendar')) {
          if (url.endsWith(new Date(now).toISOString().slice(0, 7))) {
            return new Response(
              JSON.stringify({
                data: [
                  {
                    id: 'sess-today',
                    source: 'TEACHING_SESSION',
                    startsAt: in2Hours,
                    endsAt: in3Hours,
                    timezone: 'Asia/Ho_Chi_Minh',
                    modality: 'ONLINE',
                    revision: 1,
                    meetUrl: null,
                    room: null,
                    instructor: null,
                    classOffering: clsOpen,
                  },
                  {
                    id: 'sess-15d',
                    source: 'TEACHING_SESSION',
                    startsAt: in15Days,
                    endsAt: in15DaysEnd,
                    timezone: 'Asia/Ho_Chi_Minh',
                    modality: 'OFFLINE',
                    revision: 1,
                    meetUrl: null,
                    room: { code: 'H2.1', name: 'Phòng H2.1', location: 'CS1' },
                    instructor: null,
                    classOffering: clsDone,
                  },
                ],
              }),
              { status: 200, headers: { 'content-type': 'application/json' } },
            );
          }
          return new Response(JSON.stringify({ data: [] }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (url.includes('/v2/consultations/bookings')) {
          return new Response(
            JSON.stringify({
              data: [
                {
                  id: 'bk-pending',
                  state: 'PENDING_GV',
                  startsAt: in2Hours,
                  endsAt: in3Hours,
                  topic: 'Tư vấn lộ trình Part 3–4',
                },
              ],
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          );
        }
        return new Response(JSON.stringify({ data: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }),
    );

    const auth: AuthContextValue = {
      user: {
        id: 'inst-2',
        fullName: 'Nguyễn Minh Anh',
        email: 'teacher@example.invalid',
        role: 'INSTRUCTOR',
        status: 'ACTIVE',
      },
      isLoading: false,
      error: null,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
    };

    render(
      <MemoryRouter initialEntries={['/workspace']}>
        <AuthContext.Provider value={auth}>
          <ToastProvider>
            <RoleWorkspacePage />
          </ToastProvider>
        </AuthContext.Provider>
      </MemoryRouter>,
    );

    // Shows unified LMS summary, formal & LMS grading items, and PENDING_GV consultation badge
    expect(await screen.findByText('23/25 hoạt động')).toBeInTheDocument();
    expect(screen.getByText('Bài tập Dictation Tuần 1')).toBeInTheDocument();
    expect(screen.getByText('Đánh giá giai đoạn 1')).toBeInTheDocument();
    expect(screen.getByText('Chờ GV xác nhận')).toBeInTheDocument();

    // Filter grading queue to Bài tập nộp only
    fireEvent.click(screen.getByRole('button', { name: 'Bài tập nộp' }));
    expect(screen.getByText('Bài tập Dictation Tuần 1')).toBeInTheDocument();
    expect(screen.queryByText('Đánh giá giai đoạn 1')).not.toBeInTheDocument();

    // Filter classes by Đã hoàn thành status
    fireEvent.click(screen.getByRole('button', { name: 'Đã hoàn thành' }));
    await waitFor(() => {
      expect(screen.queryByText('TOEIC Listening Focus 550+')).not.toBeInTheDocument();
      expect(screen.getByText('TOEIC Reading K24')).toBeInTheDocument();
    });

    // Filter by course selector & switch back
    const courseSelect = screen.getByLabelText('Lọc theo khóa học');
    fireEvent.change(courseSelect, { target: { value: 'c2' } });
    await waitFor(() => {
      expect(screen.queryByText('TOEIC Listening Focus 550+')).not.toBeInTheDocument();
      expect(screen.getByText('TOEIC Reading K24')).toBeInTheDocument();
    });
    fireEvent.change(courseSelect, { target: { value: 'ALL' } });

    // Switch back to Tất cả statuses & test schedule 7 ngày vs 30 ngày
    const globalFilterBar = screen.getByRole('region', { name: 'Bộ lọc không gian giảng dạy' });
    fireEvent.click(within(globalFilterBar).getByRole('button', { name: 'Tất cả' }));
    expect(screen.getByText('Online (chờ link Meet)')).toBeInTheDocument();
    expect(screen.queryByText('Phòng H2.1')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '30 ngày' }));
    expect(screen.getByText('Phòng H2.1')).toBeInTheDocument();
  });

  it('scopes ACADEMIC_MANAGER navigation strictly for TRAINING vs STUDENT_AFFAIRS tracks', () => {
    const renderTrack = (academicTrack: 'TRAINING' | 'STUDENT_AFFAIRS', fullName: string) => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
      const auth: AuthContextValue = {
        user: {
          id: `user-${academicTrack.toLowerCase()}`,
          fullName,
          email: `${academicTrack.toLowerCase()}@gmail.com`,
          role: 'ACADEMIC_MANAGER',
          status: 'ACTIVE',
          academicTrack,
        },
        isLoading: false,
        error: null,
        login: vi.fn(),
        register: vi.fn(),
        logout: vi.fn(),
        refreshUser: vi.fn(),
      };
      return render(
        <MemoryRouter initialEntries={['/workspace']}>
          <AuthContext.Provider value={auth}>
            <ToastProvider>
              <ActorWorkspaceLayout />
            </ToastProvider>
          </AuthContext.Provider>
        </MemoryRouter>,
      );
    };

    renderTrack('TRAINING', 'Quản lý Đào tạo');
    const trainingNav = within(
      screen.getByRole('navigation', { name: 'Điều hướng chính quản lý đào tạo' }),
    );
    expect(trainingNav.getByRole('link', { name: /Chương trình & Lớp/i })).toHaveAttribute(
      'href',
      '/academic',
    );
    expect(trainingNav.getByRole('link', { name: /TKB & Phòng học/i })).toHaveAttribute(
      'href',
      '/academic/planning',
    );
    expect(trainingNav.queryByRole('link', { name: /Chứng chỉ/i })).not.toBeInTheDocument();
    expect(trainingNav.queryByRole('link', { name: /Kiểm tra đầu vào/i })).not.toBeInTheDocument();

    cleanup();

    renderTrack('STUDENT_AFFAIRS', 'Quản lý Học vụ Học viên');
    const studentNav = within(
      screen.getByRole('navigation', { name: 'Điều hướng chính quản lý học vụ học viên' }),
    );
    expect(studentNav.getByRole('link', { name: /Kiểm tra đầu vào/i })).toHaveAttribute(
      'href',
      '/workspace/placement',
    );
    expect(studentNav.getByRole('link', { name: /Chứng chỉ & Hoàn thành/i })).toHaveAttribute(
      'href',
      '/workspace/certificates',
    );
    expect(studentNav.getByRole('link', { name: /Thư viện kiến thức TOEIC/i })).toHaveAttribute(
      'href',
      '/knowledge/workspace',
    );
    expect(studentNav.queryByRole('link', { name: /Chương trình & Lớp/i })).not.toBeInTheDocument();
    expect(studentNav.queryByRole('link', { name: /TKB & Phòng học/i })).not.toBeInTheDocument();
  });
});
