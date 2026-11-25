import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClassActivityPage, ClassLearningPage } from '@/pages/ClassLearningPage';
import { MyDashboardPage } from '@/pages/MyDashboardPage';
import { LocalAttendancePanel } from './LocalAttendancePanel';
import type { LocalAttendanceWorkspace } from './lms-local-api';

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), user: { id: 'stu-1', role: 'STUDENT' } }));
vi.mock('@/lib/api-client', () => ({
  apiFetch: (...args: unknown[]) => mocks.fetch(...args),
  apiUrl: (s: string) => '/api' + s,
}));
vi.mock('@/features/auth/auth-context', () => ({ useAuth: () => ({ user: mocks.user }) }));

const classId = '11111111-1111-4111-8111-111111111111';
const activityId = '22222222-2222-4222-8222-222222222222';

beforeEach(() => {
  mocks.fetch.mockReset();
  mocks.user.role = 'STUDENT';
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});

afterEach(() => {
  cleanup();
});

describe('Class LMS completion, Opened/Due dates, and attendance filter UX', () => {
  it('removes Start Study button, renders Opened/Due dates, marks complete in 1 click, and lights up Course Index', async () => {
    let currentProgress: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' = 'NOT_STARTED';
    const baseActivity = {
      id: activityId,
      sectionId: 'sec-1',
      type: 'LESSON',
      title: 'Bài 01 — Phân tích tranh Part 1',
      introduction: 'Chiến thuật 3 giây trước audio.',
      contentMarkdown: '## Nội dung bài 01',
      resourceUrl: null,
      file: null,
      availableFrom: '2026-11-14T00:00:00.000Z',
      availableUntil: '2026-12-15T16:59:00.000Z',
      state: 'PUBLISHED',
      revisionNumber: 1,
      editable: false,
    };

    mocks.fetch.mockImplementation((path: string, init?: RequestInit) => {
      if (path.endsWith('/open') && init?.method === 'POST') {
        currentProgress = 'IN_PROGRESS';
        return Promise.resolve({ status: 'IN_PROGRESS' });
      }
      if (path.endsWith('/complete') && init?.method === 'POST') {
        currentProgress = 'COMPLETED';
        return Promise.resolve({ status: 'COMPLETED' });
      }
      if (path.includes('/activity-kinds')) {
        return Promise.resolve({ kinds: {} });
      }
      if (path.endsWith('/activities/' + activityId)) {
        return Promise.resolve({ ...baseActivity, progress: currentProgress });
      }
      if (path.endsWith('/classes/' + classId)) {
        return Promise.resolve({
          class: { id: classId, code: 'SE-LIST-550-500K', name: 'TOEIC Listening Focus 550+' },
          editable: false,
          sections: [
            {
              id: 'sec-1',
              title: 'Lý thuyết',
              introduction: '',
              activities: [
                {
                  id: activityId,
                  type: 'LESSON',
                  title: 'Bài 01 — Phân tích tranh Part 1',
                  introduction: '',
                  resourceUrl: null,
                  file: null,
                  availableFrom: '2026-11-14T00:00:00.000Z',
                  availableUntil: '2026-12-15T16:59:00.000Z',
                  state: 'PUBLISHED',
                  revisionNumber: 1,
                  progress: currentProgress,
                },
              ],
            },
          ],
        });
      }
      return Promise.resolve({});
    });

    render(
      <MemoryRouter initialEntries={[`/classroom/${classId}/activities/${activityId}`]}>
        <Routes>
          <Route path="/classroom/:classId/activities/:activityId" element={<ClassActivityPage />} />
        </Routes>
      </MemoryRouter>,
    );

    const markBtn = await screen.findByRole('button', { name: 'Đánh dấu hoàn thành' });
    expect(screen.queryByRole('button', { name: 'Bắt đầu học' })).not.toBeInTheDocument();
    expect(screen.getByText(/Mở từ \(Opened\):/i)).toBeInTheDocument();
    expect(screen.getByText(/Hạn nộp \/ Đóng \(Due\):/i)).toBeInTheDocument();

    fireEvent.click(markBtn);

    await waitFor(() => {
      expect(screen.getByText('Đã hoàn thành')).toBeInTheDocument();
    });

    const sidebarLink = screen.getByRole('link', { name: 'Bài 01 — Phân tích tranh Part 1' });
    expect(sidebarLink.className).toContain('bg-[#d9efd3]');
  });

  it('dims and disables check-in button when attendance windowStatus is UPCOMING', async () => {
    const upcomingWs: LocalAttendanceWorkspace = {
      editable: false,
      serverNow: '2026-11-15T01:40:00.000Z',
      windowStatus: 'UPCOMING',
      activity: {
        id: activityId,
        sectionId: 'sec-1',
        sectionTitle: 'Chung',
        sectionPublished: true,
        title: 'Điểm danh Buổi 01 — Khai giảng',
        introduction: 'Điểm danh đầu giờ học.',
        state: 'PUBLISHED',
        availableFrom: '2026-11-26T11:30:00.000Z',
        availableUntil: '2026-11-26T13:15:00.000Z',
        revisionNumber: 1,
      },
      config: {
        sessionTitle: 'Buổi 01 · Khai giảng',
        sessionDateLabel: 'Thứ 5 · 26/11/2026 · 18:30–20:00',
        checkInStartAt: '2026-11-26T11:30:00.000Z',
        checkInEndAt: '2026-11-26T13:15:00.000Z',
        lateAfterMinutes: 15,
        requireCode: true,
      },
      myRecord: null,
    };

    mocks.fetch.mockResolvedValueOnce(upcomingWs);

    render(
      <MemoryRouter>
        <LocalAttendancePanel classId={classId} activityId={activityId} />
      </MemoryRouter>,
    );

    const btn = await screen.findByRole('button', { name: 'Chưa tới giờ điểm danh' });
    expect(btn).toBeDisabled();
    const codeInput = screen.getByPlaceholderText(/Sẽ mở nhập mã khi tới giờ học/i);
    expect(codeInput).toBeDisabled();
  });

  it('provides status filter pills and search box on teacher attendance roster table', async () => {
    const teacherClosedWs: LocalAttendanceWorkspace = {
      editable: true,
      serverNow: '2026-11-27T01:00:00.000Z',
      windowStatus: 'CLOSED',
      activity: {
        id: activityId,
        sectionId: 'sec-1',
        sectionTitle: 'Chung',
        sectionPublished: true,
        title: 'Điểm danh Buổi 01',
        introduction: '',
        state: 'PUBLISHED',
        availableFrom: '2026-11-26T11:30:00.000Z',
        availableUntil: '2026-11-26T13:15:00.000Z',
        revisionNumber: 1,
      },
      config: {
        sessionTitle: 'Buổi 01 · Khai giảng',
        sessionDateLabel: '26/11/2026',
        checkInStartAt: '2026-11-26T11:30:00.000Z',
        checkInEndAt: '2026-11-26T13:15:00.000Z',
        lateAfterMinutes: 15,
        requireCode: true,
        checkInCode: 'TOEIC01',
      },
      summary: { totalEnrolled: 3, presentCount: 1, lateCount: 1, notRecordedCount: 1 },
      roster: [
        {
          enrollmentId: 'e1',
          learnerId: 'u1',
          fullName: 'Nguyễn Minh An',
          email: 'an@example.com',
          status: 'PRESENT',
          checkedInAt: '2026-11-26T11:32:00.000Z',
          note: '',
        },
        {
          enrollmentId: 'e2',
          learnerId: 'u2',
          fullName: 'Lê Thu Hà',
          email: 'ha@example.com',
          status: 'LATE',
          checkedInAt: '2026-11-26T11:52:00.000Z',
          note: 'Kẹt xe',
        },
        {
          enrollmentId: 'e3',
          learnerId: 'u3',
          fullName: 'Trần Quốc Bảo',
          email: 'bao@example.com',
          status: 'NOT_RECORDED',
          checkedInAt: null,
          note: '',
        },
      ],
    };

    mocks.fetch.mockResolvedValueOnce(teacherClosedWs);

    render(
      <MemoryRouter>
        <LocalAttendancePanel classId={classId} activityId={activityId} />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Nguyễn Minh An')).toBeInTheDocument();
    expect(screen.getByText('Lê Thu Hà')).toBeInTheDocument();
    expect(screen.getByText('Trần Quốc Bảo')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Vắng mặt \(1\)/i }));
    expect(screen.queryByText('Nguyễn Minh An')).not.toBeInTheDocument();
    expect(screen.queryByText('Lê Thu Hà')).not.toBeInTheDocument();
    expect(screen.getByText('Trần Quốc Bảo')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Đã điểm danh \(2\)/i }));
    expect(screen.getByText('Nguyễn Minh An')).toBeInTheDocument();
    expect(screen.getByText('Lê Thu Hà')).toBeInTheDocument();
    expect(screen.queryByText('Trần Quốc Bảo')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Tìm học viên trong danh sách điểm danh'), {
      target: { value: 'Minh An' },
    });
    expect(screen.getByText('Nguyễn Minh An')).toBeInTheDocument();
    expect(screen.queryByText('Lê Thu Hà')).not.toBeInTheDocument();
  });

  it('renders Bảng điều khiển heading and opens day detail modal with smooth zoom origin on cell click', async () => {
    mocks.fetch.mockImplementation((path: string) => {
      if (path.startsWith('/v2/my/classes')) {
        return Promise.resolve({ data: [], canProposeOfficialSession: false });
      }
      if (path.startsWith('/v2/consultations/bookings')) {
        return Promise.resolve({ data: [] });
      }
      return Promise.resolve({ data: [], truncated: false });
    });

    const view = render(
      <MemoryRouter initialEntries={['/my/calendar?month=2026-11']}>
        <MyDashboardPage full />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole('heading', { name: 'Bảng điều khiển' }),
    ).toBeInTheDocument();

    const dayCell = view.container.querySelector('[data-day="2026-11-26"]') as HTMLElement;
    expect(dayCell).toBeTruthy();
    expect(dayCell.className).toContain('hover:scale-[1.025]');

    dayCell.getBoundingClientRect = () =>
      ({
        left: 820,
        top: 500,
        width: 140,
        height: 120,
        right: 960,
        bottom: 620,
        x: 820,
        y: 500,
        toJSON: () => ({}),
      }) as DOMRect;

    fireEvent.click(dayCell);

    const dialog = screen.getByRole('dialog');
    expect(dialog.className).toContain('calendar-day-modal-zoom');
    expect(dialog.style.getPropertyValue('--zoom-dx')).not.toBe('');
    expect(dialog.style.getPropertyValue('--zoom-dy')).not.toBe('');
    expect(dayCell.className).toContain('ring-2');
  });

  it('filters calendar events and class options by Khóa học on Bảng điều khiển', async () => {
    mocks.fetch.mockImplementation((path: string) => {
      if (path.startsWith('/v2/my/classes')) {
        return Promise.resolve({
          data: [
            {
              id: 'cls-listen',
              code: 'SE-LIST-550',
              name: 'Lớp Listening 550',
              course: { title: 'TOEIC Listening 550+', level: 'B1' },
              lastAccessedAt: null,
            },
            {
              id: 'cls-read',
              code: 'SE-READ-550',
              name: 'Lớp Reading 550',
              course: { title: 'TOEIC Reading 550+', level: 'B1' },
              lastAccessedAt: null,
            },
          ],
          canProposeOfficialSession: false,
        });
      }
      if (path.startsWith('/v2/consultations/bookings')) {
        return Promise.resolve({ data: [] });
      }
      return Promise.resolve({
        data: [
          {
            id: 'ev-listen',
            source: 'TEACHING_SESSION',
            title: 'Buổi học Listening',
            startsAt: '2026-11-18T11:30:00.000Z',
            endsAt: '2026-11-18T13:00:00.000Z',
            timezone: 'Asia/Ho_Chi_Minh',
            modality: 'ONLINE',
            revision: 1,
            classOffering: {
              id: 'cls-listen',
              code: 'SE-LIST-550',
              name: 'Lớp Listening 550',
              course: { title: 'TOEIC Listening 550+' },
            },
            room: null,
            instructor: { fullName: 'Nguyễn Minh Anh' },
          },
          {
            id: 'ev-read',
            source: 'TEACHING_SESSION',
            title: 'Buổi học Reading',
            startsAt: '2026-11-19T11:30:00.000Z',
            endsAt: '2026-11-19T13:00:00.000Z',
            timezone: 'Asia/Ho_Chi_Minh',
            modality: 'OFFLINE',
            revision: 1,
            classOffering: {
              id: 'cls-read',
              code: 'SE-READ-550',
              name: 'Lớp Reading 550',
              course: { title: 'TOEIC Reading 550+' },
            },
            room: { code: 'H2.1', name: 'Phòng H2.1', location: 'CS1' },
            instructor: { fullName: 'Nguyễn Minh Anh' },
          },
        ],
        truncated: false,
      });
    });

    render(
      <MemoryRouter initialEntries={['/my/calendar?month=2026-11']}>
        <MyDashboardPage full />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Buổi học Listening')).toBeInTheDocument();
    expect(screen.getByText('Buổi học Reading')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Khóa học'), {
      target: { value: 'TOEIC Reading 550+' },
    });

    await waitFor(() => {
      const cell18 = document.querySelector('[data-day="2026-11-18"]');
      const cell19 = document.querySelector('[data-day="2026-11-19"]');
      expect(cell18).not.toHaveTextContent('Buổi học Listening');
      expect(cell19).toHaveTextContent('Buổi học Reading');
    });

    const classSelect = screen.getByLabelText('Khóa học / lớp') as HTMLSelectElement;
    expect(Array.from(classSelect.options).map((o) => o.textContent)).not.toContain(
      'Lớp Listening 550',
    );
  });

  it('renders full Instructor Thông tin lớp học, Danh sách học sinh, dynamic Điểm số matrix with CSV export, and Tiến độ học tập tabs', async () => {
    mocks.user.role = 'INSTRUCTOR';
    mocks.fetch.mockImplementation((path: string) => {
      if (path === `/v2/class-lms/classes/${classId}`) {
        return Promise.resolve({
          class: {
            id: classId,
            code: 'W01-4f057faf-9d1d-46c2-8764-94a311a9d7a1-1',
            name: 'TOEIC nền tảng · Lớp trực tuyến buổi tối',
          },
          editable: true,
          sessionEngagementEnabled: true,
          officialSessions: [],
          sections: [
            {
              id: 'sec-1',
              title: 'Học phần 1 — Ngữ pháp & Nghe',
              introduction: 'Khởi động tuần 1',
              lockVersion: 1,
              activities: [
                {
                  id: 'act-assign-1',
                  type: 'ASSIGNMENT',
                  title: 'Bài tập X — Dictation Part 1',
                  introduction: '',
                  resourceUrl: null,
                  file: null,
                  state: 'PUBLISHED',
                  revisionId: 'rev-1',
                  revisionNumber: 1,
                  progress: 'NOT_STARTED',
                  availableFrom: null,
                  availableUntil: null,
                },
                {
                  id: 'act-reg-1',
                  type: 'LESSON',
                  title: 'Thường kỳ B — Từ vựng công sở',
                  introduction: '',
                  resourceUrl: null,
                  file: null,
                  state: 'PUBLISHED',
                  revisionId: null,
                  revisionNumber: 1,
                  progress: 'NOT_STARTED',
                  availableFrom: null,
                  availableUntil: null,
                },
                {
                  id: 'act-mid-1',
                  type: 'LESSON',
                  title: 'Giữa kỳ C — Đánh giá tổng hợp',
                  introduction: '',
                  resourceUrl: null,
                  file: null,
                  state: 'PUBLISHED',
                  revisionId: null,
                  revisionNumber: 1,
                  progress: 'NOT_STARTED',
                  availableFrom: null,
                  availableUntil: null,
                },
              ],
            },
          ],
        });
      }
      if (path.startsWith(`/v2/lms-local/classes/${classId}/kinds`)) {
        return Promise.resolve({
          kinds: {
            'act-reg-1': { kind: 'LOCAL_QUIZ', meta: { assessmentKind: 'REGULAR' } },
            'act-mid-1': { kind: 'LOCAL_QUIZ', meta: { assessmentKind: 'MIDTERM' } },
          },
        });
      }
      if (path.startsWith(`/v2/lms-local/classes/${classId}/unified-results`)) {
        return Promise.resolve({
          class: {
            id: classId,
            code: 'W01-4f057faf-9d1d-46c2-8764-94a311a9d7a1-1',
            name: 'TOEIC nền tảng · Lớp trực tuyến buổi tối',
            courseId: 'c1',
            courseTitle: 'TOEIC nền tảng 450+',
          },
          editable: true,
          activityColumns: [
            {
              activityId: 'act-assign-1',
              sectionId: 'sec-1',
              sectionTitle: 'Học phần 1 — Ngữ pháp & Nghe',
              sectionOrder: 0,
              orderIndex: 0,
              title: 'Bài tập X — Dictation Part 1',
              baseType: 'ASSIGNMENT',
              localKind: null,
              assessmentKind: null,
              kindLabel: 'Bài tập',
              state: 'PUBLISHED',
              availableFrom: null,
              availableUntil: null,
              maxScore: 10,
              passScore: null,
              releaseMode: null,
            },
            {
              activityId: 'act-reg-1',
              sectionId: 'sec-1',
              sectionTitle: 'Học phần 1 — Ngữ pháp & Nghe',
              sectionOrder: 0,
              orderIndex: 1,
              title: 'Thường kỳ B — Từ vựng công sở',
              baseType: 'LESSON',
              localKind: 'LOCAL_QUIZ',
              assessmentKind: 'REGULAR',
              kindLabel: 'Kiểm tra thường kỳ',
              state: 'PUBLISHED',
              availableFrom: null,
              availableUntil: null,
              maxScore: 10,
              passScore: 5,
              releaseMode: 'AFTER_SUBMIT',
            },
            {
              activityId: 'act-mid-1',
              sectionId: 'sec-1',
              sectionTitle: 'Học phần 1 — Ngữ pháp & Nghe',
              sectionOrder: 0,
              orderIndex: 2,
              title: 'Giữa kỳ C — Đánh giá tổng hợp',
              baseType: 'LESSON',
              localKind: 'LOCAL_QUIZ',
              assessmentKind: 'MIDTERM',
              kindLabel: 'Kiểm tra giữa kỳ',
              state: 'PUBLISHED',
              availableFrom: null,
              availableUntil: null,
              maxScore: 100,
              passScore: 60,
              releaseMode: 'AFTER_SUBMIT',
            },
          ],
          studentRows: [
            {
              enrollmentId: 'enr-1',
              learnerId: 'stu-1',
              fullName: 'Nguyễn Minh An',
              email: 'an@example.invalid',
              assignments: {
                'act-assign-1': {
                  activityId: 'act-assign-1',
                  submissionId: 'sub-1',
                  submissionState: 'SUBMITTED',
                  submittedAt: '2026-11-12T10:00:00.000Z',
                  score: 8.5,
                  maxScore: 10,
                  gradeState: 'PUBLISHED',
                  gradeSource: 'LOCAL_DIRECT',
                  feedback: 'Tốt',
                  gradedAt: '2026-11-12T11:00:00.000Z',
                },
              },
              quizzes: {
                'act-reg-1': {
                  activityId: 'act-reg-1',
                  assessmentKind: 'REGULAR',
                  attemptCount: 1,
                  latestAttemptId: 'qa-1',
                  attemptStatus: 'SUBMITTED',
                  submittedAt: '2026-11-13T10:00:00.000Z',
                  gradingStatus: 'GRADED',
                  gradePublished: true,
                  score: 9,
                  maxScore: 10,
                  passScore: 5,
                  passed: true,
                  teacherFeedback: '',
                  gradedAt: '2026-11-13T10:05:00.000Z',
                },
                'act-mid-1': {
                  activityId: 'act-mid-1',
                  assessmentKind: 'MIDTERM',
                  attemptCount: 1,
                  latestAttemptId: 'qa-2',
                  attemptStatus: 'SUBMITTED',
                  submittedAt: '2026-11-14T10:00:00.000Z',
                  gradingStatus: 'PENDING_MANUAL_GRADE',
                  gradePublished: false,
                  score: null,
                  maxScore: 100,
                  passScore: 60,
                  passed: null,
                  teacherFeedback: '',
                  gradedAt: null,
                },
              },
              attendance: {},
              stats: {
                submittedAssignments: 1,
                publishedAssignmentGrades: 1,
                submittedQuizzes: 2,
                publishedQuizGrades: 1,
                attendancePresentCount: 0,
                attendanceLateCount: 0,
                attendanceTotalCount: 0,
                completedActivitiesCount: 3,
              },
            },
          ],
          formalAssessments: [],
          draftCoreQuizCount: 0,
          summary: {
            totalActivities: 3,
            publishedActivities: 3,
            assignmentsCount: 1,
            quizzesCount: 0,
            regularExamCount: 1,
            midtermCount: 1,
            finalCount: 0,
            attendanceCount: 0,
            awaitingAssignmentGrades: 0,
            awaitingManualQuizGrades: 1,
            formalAssessmentCount: 0,
            draftCoreQuizCount: 0,
          },
          policyNotes: [],
        });
      }
      if (path === `/instructor/classes/${classId}/overview`) {
        return Promise.resolve({
          classOffering: {
            id: classId,
            code: 'W01-4f057faf-9d1d-46c2-8764-94a311a9d7a1-1',
            name: 'TOEIC nền tảng · Lớp trực tuyến buổi tối',
            status: 'IN_PROGRESS',
            modality: 'ONLINE',
            activeLearnerCount: 1,
            classStart: '2026-11-01T00:00:00.000Z',
            classEnd: '2027-01-30T00:00:00.000Z',
            course: { id: 'c1', title: 'TOEIC nền tảng 450+', level: 'A2' },
            scheduleSlots: [
              {
                dayOfWeek: 2,
                startTime: '18:30',
                endTime: '20:00',
                locationText: 'Phòng Zoom / Google Meet',
              },
            ],
          },
          activeLearnerCount: 1,
          lessonProgress: { completed: 3, total: 3, percentage: 100 },
          assessments: [],
          pendingGradingCount: 1,
          grading: { waiting: 1, partial: 0, final: 0, attempts: [] },
          progressBuckets: [],
          upcomingDeadlines: [],
          followUps: [],
        });
      }
      if (path === `/instructor/classes/${classId}/learners`) {
        return Promise.resolve({
          classOffering: {
            id: classId,
            code: 'W01-4f057faf-9d1d-46c2-8764-94a311a9d7a1-1',
            name: 'TOEIC nền tảng · Lớp trực tuyến buổi tối',
            status: 'IN_PROGRESS',
            activeLearnerCount: 1,
            course: { id: 'c1', title: 'TOEIC nền tảng 450+', level: 'A2' },
          },
          learners: [
            {
              id: 'enr-1',
              status: 'ACTIVE',
              enrolledAt: '2026-10-25T00:00:00.000Z',
              learner: { id: 'stu-1', fullName: 'Nguyễn Minh An', email: 'an@example.invalid' },
              completedLessons: 3,
              totalLessons: 3,
              progressPercentage: 100,
              submittedAssessmentCount: 2,
              pendingGradingCount: 1,
              latestGradedAssessmentAt: null,
            },
          ],
        });
      }
      if (path === `/instructor/classes/${classId}/results`) {
        return Promise.resolve({ assessments: [], assessmentHistory: [], sameTestComparisons: [] });
      }
      return Promise.resolve({});
    });

    const origCreateObjectURL = URL.createObjectURL;
    const origRevokeObjectURL = URL.revokeObjectURL;
    const createObjSpy = vi.fn(() => 'blob:mock-csv');
    const revokeObjSpy = vi.fn();
    URL.createObjectURL = createObjSpy;
    URL.revokeObjectURL = revokeObjSpy;

    try {

    render(
      <MemoryRouter initialEntries={[`/classroom/${classId}`]}>
        <Routes>
          <Route path="/classroom/:classId" element={<ClassLearningPage />} />
        </Routes>
      </MemoryRouter>,
    );

    // 5 tabs & clean drawer label
    expect(await screen.findByRole('button', { name: 'Danh sách học sinh' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Điểm số' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tiến độ học tập' })).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /SE-FOUNDATION-01|W01-4f057faf/ }),
    ).toBeInTheDocument();

    // 1) Thông tin lớp học shows rich metadata
    fireEvent.click(screen.getByRole('button', { name: 'Thông tin lớp học' }));
    expect(await screen.findByText('TOEIC nền tảng 450+')).toBeInTheDocument();
    expect(screen.getByText(/18:30–20:00/)).toBeInTheDocument();

    // 2) Danh sách học sinh shows roster table
    fireEvent.click(screen.getByRole('button', { name: 'Danh sách học sinh' }));
    expect(await screen.findByText('Nguyễn Minh An')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tải danh sách (.csv)' })).toBeInTheDocument();

    // 3) Điểm số renders in-page matrix (STT, Họ và tên, Bài tập X, Thường kỳ B, Giữa kỳ C) + CSV download
    fireEvent.click(screen.getByRole('button', { name: 'Điểm số' }));
    const gradebook = within(await screen.findByRole('region', { name: 'Bảng điểm lớp học' }));
    expect(gradebook.getByText('Bài tập X — Dictation Part 1')).toBeInTheDocument();
    expect(gradebook.getByText('Thường kỳ B — Từ vựng công sở')).toBeInTheDocument();
    expect(gradebook.getByText('Giữa kỳ C — Đánh giá tổng hợp')).toBeInTheDocument();
    expect(gradebook.getByText('8.5/10')).toBeInTheDocument();
    expect(gradebook.getByText('9/10')).toBeInTheDocument();
    expect(gradebook.getByText('Chờ chấm TL')).toBeInTheDocument();

    fireEvent.click(gradebook.getByRole('button', { name: 'Giữa kỳ & Cuối kỳ' }));
    expect(gradebook.queryByText('Bài tập X — Dictation Part 1')).not.toBeInTheDocument();
    expect(gradebook.getByText('Giữa kỳ C — Đánh giá tổng hợp')).toBeInTheDocument();

    fireEvent.click(gradebook.getByRole('button', { name: 'Tất cả cột điểm' }));
    fireEvent.click(gradebook.getByRole('button', { name: 'Tải bảng điểm (.csv)' }));
    expect(createObjSpy).toHaveBeenCalledTimes(1);

    // 4) Tiến độ học tập shows completion KPIs & student progress
    fireEvent.click(screen.getByRole('button', { name: 'Tiến độ học tập' }));
    expect(await screen.findByText('Hoàn thành trung bình')).toBeInTheDocument();
    expect(screen.getByText('3/3 (100%)')).toBeInTheDocument();
    } finally {
      URL.createObjectURL = origCreateObjectURL;
      URL.revokeObjectURL = origRevokeObjectURL;
    }
  });
});
