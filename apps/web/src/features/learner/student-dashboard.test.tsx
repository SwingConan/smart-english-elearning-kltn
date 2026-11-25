import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, it, expect, vi } from 'vitest';
import { RoleWorkspacePage } from '@/pages/RoleWorkspacePage';
import { PlacementIntegrationPage } from '@/pages/PlacementIntegrationPage';
import { CompletionPage } from '@/features/product/CompletionPage';
const mock = vi.hoisted(() => ({
  fetch: vi.fn(),
  user: { id: 'owner', role: 'STUDENT', fullName: 'Learner' },
}));
vi.mock('@/features/auth/auth-context', () => ({ useAuth: () => ({ user: mock.user }) }));
vi.mock('@/lib/api-client', () => ({
  apiFetch: (...args: unknown[]) => mock.fetch(...args),
  apiUrl: (p: string) => '/api' + p,
}));
afterEach(cleanup);
beforeEach(() => {
  mock.fetch.mockReset();
});
it('does not present a demonstration certificate as an official certificate', async () => {
  mock.fetch.mockImplementation((p: string) =>
    Promise.resolve(
      p === '/enrollments/my'
        ? [
            {
              id: 'e',
              status: 'ACTIVE',
              classOffering: { id: 'c', name: 'Foreign synthetic class', code: 'W01-internal' },
              progress: { completedLessons: 0, totalLessons: 1, progressPercent: 0 },
            },
          ]
        : {
            assessment: 'ISSUED',
            certificateRecordsVerified: true,
            enrollments: [
              {
                enrollmentId: 'e',
                assessment: 'ISSUED',
                certificate: {
                  state: 'ISSUED',
                  isTestPolicy: true,
                  certificateCode: 'INTERNAL-TEST',
                },
              },
            ],
          },
    ),
  );
  render(
    <MemoryRouter>
      <CompletionPage />
    </MemoryRouter>,
  );
  expect(
    await screen.findByRole('heading', { name: 'Chưa có chứng chỉ chính thức' }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole('link', { name: /Tra cứu chứng chỉ|Tải chứng chỉ/ }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByText(/Foreign synthetic class|W01-internal|INTERNAL-TEST/),
  ).not.toBeInTheDocument();
});
it('uses only owned active enrollments and does not count submitted assignments or quizzes as pending', async () => {
  const c = {
    id: 'c',
    name: 'My English class',
    code: 'C',
    course: { title: 'English' },
    status: 'IN_PROGRESS',
  };
  mock.fetch.mockImplementation((p: string) => {
    if (p === '/enrollments/my')
      return Promise.resolve([
        {
          id: 'e',
          status: 'ACTIVE',
          classOffering: c,
          progress: { completedLessons: 2, totalLessons: 5, progressPercent: 40 },
        },
        {
          id: 'p',
          status: 'PENDING_PAYMENT',
          classOffering: { ...c, id: 'pending' },
          progress: { completedLessons: 0, totalLessons: 5, progressPercent: 0 },
        },
      ]);
    if (p.startsWith('/v2/my/calendar')) return Promise.resolve({ data: [] });
    if (p === '/v2/my/finance') return Promise.resolve({ data: [] });
    if (p === '/v2/class-lms/classes/c')
      return Promise.resolve({
        sections: [
          {
            activities: [
              { id: 'a', type: 'ASSIGNMENT', title: 'Pending writing', progress: 'NOT_STARTED' },
              {
                id: 'b',
                type: 'ASSIGNMENT',
                title: 'Submitted writing',
                submissionState: 'SUBMITTED',
              },
              { id: 'q', type: 'QUIZ', title: 'Submitted quiz', progress: 'NOT_STARTED' },
            ],
          },
        ],
      });
    if (p === '/v2/class-lms/classes/c/progress')
      return Promise.resolve({ entries: [{ activityId: 'q', state: 'PENDING_RELEASE' }] });
    if (p === '/learning/enrollments/e/content')
      return Promise.resolve({
        modules: [
          { lessons: [{ id: 'lesson', title: 'Next lesson', progressStatus: 'NOT_STARTED' }] },
        ],
      });
    if (p === '/learning/enrollments/e/progress') return Promise.resolve({ assessments: [] });
    return Promise.reject(Error('Unexpected endpoint: ' + p));
  });
  render(
    <MemoryRouter>
      <RoleWorkspacePage />
    </MemoryRouter>,
  );
  expect(await screen.findByText('Pending writing')).toBeInTheDocument();
  expect(screen.queryByText('Submitted writing')).not.toBeInTheDocument();
  expect(screen.queryByText('Submitted quiz')).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Vào lớp' })).toHaveAttribute('href', '/classroom/c');
  expect(screen.getByRole('link', { name: /Bài tập cần hoàn thành/ })).toHaveTextContent('1');
  expect(
    mock.fetch.mock.calls.some(
      ([p]) =>
        p === '/workspace' || p === '/workspace/classes' || String(p).includes('/classes/pending'),
    ),
  ).toBe(false);
  expect(
    screen.queryByText(/Tình trạng nguồn vận hành|W01_AUTHORITY|quyền CMS/),
  ).not.toBeInTheDocument();
});
it('does not turn private development availability into an official assessment launch', async () => {
  mock.fetch.mockImplementation((p: string) =>
    Promise.resolve(
      p.endsWith('/config')
        ? { fullExamEnabled: false, workflowEnabled: false, sources: [], message: 'W04B DEV scope' }
        : [],
    ),
  );
  render(
    <MemoryRouter>
      <PlacementIntegrationPage />
    </MemoryRouter>,
  );
  expect(
    await screen.findByText(/Bài kiểm tra đầu vào chính thức hiện chưa mở/),
  ).toBeInTheDocument();
  expect(screen.queryByText(/W04B|DEV|scope/)).not.toBeInTheDocument();
  expect(mock.fetch.mock.calls.every((call) => !call[1]?.method || call[1].method === 'GET')).toBe(
    true,
  );
});

it('supports class filter pills, LMS section resume, task filters, and schedule timeframe filters', async () => {
  const now = Date.now();
  const in2Hours = new Date(now + 2 * 3600_000).toISOString();
  const in12Days = new Date(now + 12 * 86_400_000).toISOString();

  const classActive = {
    id: 'c-list',
    name: 'TOEIC Listening Focus 550+',
    code: 'SE-LIST-550',
    course: { title: 'TOEIC 550+' },
    status: 'OPEN',
  };
  const classDone = {
    id: 'c-done',
    name: 'TOEIC Reading K24',
    code: 'SE-READ-K24',
    course: { title: 'TOEIC 550+' },
    status: 'COMPLETED',
  };

  mock.fetch.mockImplementation((p: string) => {
    if (p === '/enrollments/my') {
      return Promise.resolve([
        {
          id: 'e-active',
          status: 'ACTIVE',
          classOffering: classActive,
          progress: { completedLessons: 0, totalLessons: 10, progressPercent: 0 },
        },
        {
          id: 'e-done',
          status: 'COMPLETED',
          classOffering: classDone,
          progress: { completedLessons: 5, totalLessons: 5, progressPercent: 100 },
        },
      ]);
    }
    if (p.startsWith('/v2/my/calendar')) {
      if (p.endsWith(new Date(now).toISOString().slice(0, 7))) {
        return Promise.resolve({
          data: [
            {
              id: 'ev-today',
              source: 'TEACHING_SESSION',
              title: 'Buổi học phản xạ hôm nay',
              startsAt: in2Hours,
              endsAt: new Date(now + 3 * 3600_000).toISOString(),
              timezone: 'Asia/Ho_Chi_Minh',
              modality: 'ONLINE',
              revision: 1,
              classOffering: classActive,
              room: null,
              instructor: null,
            },
            {
              id: 'ev-12d',
              source: 'ASSIGNMENT',
              title: 'Hạn nộp dài hạn 12 ngày',
              startsAt: in2Hours,
              endsAt: in12Days,
              deadline: in12Days,
              status: 'NOT_STARTED',
              timezone: 'Asia/Ho_Chi_Minh',
              modality: 'ONLINE',
              revision: 1,
              classOffering: classDone,
              room: null,
              instructor: null,
              actionUrl: '/classroom/c-done/activities/done-hw',
            },
          ],
        });
      }
      return Promise.resolve({ data: [] });
    }
    if (p === '/v2/my/finance') {
      return Promise.resolve({
        data: [],
        unified: {
          serverTime: new Date(now).toISOString(),
          sepay: {
            configured: true,
            bankCode: 'MB',
            gateway: 'MB',
            accountNumberMasked: '****1234',
            accountNumber: '1234',
            accountHolder: 'SMART ENGLISH',
            callbackPath: '/callback',
          },
          summary: {
            totalReceivables: 1,
            unpaidOrHeldCount: 0,
            paidCount: 1,
            exceptionCount: 0,
            expiredCount: 0,
          },
          receivables: [
            {
              id: 'rec-1',
              receivableCode: 'SE-PAY-1',
              enrollmentId: 'e-active',
              enrollmentStatus: 'ACTIVE',
              reservedUntil: null,
              seatReleasedAt: null,
              releaseReason: null,
              entrySource: null,
              placementAttemptId: null,
              classOffering: {
                id: 'c-list',
                code: 'SE-LIST-550',
                name: 'TOEIC Listening Focus 550+',
                status: 'OPEN',
                maxStudents: 30,
                course: { id: 'course-1', title: 'TOEIC 550+', slug: 'toeic-550', level: '550' },
              },
              amountVnd: 500000,
              paidAmountVnd: 500000,
              status: 'PAID',
              activeOrder: null,
              latestPayment: null,
              reconciliation: null,
            },
          ],
        },
      });
    }
    if (p === '/v2/class-lms/classes/c-list') {
      return Promise.resolve({
        sections: [
          {
            id: 'sec-1',
            title: 'Học phần 1 · Dictation',
            activities: [
              {
                id: 'l-1',
                type: 'LESSON',
                title: 'Bài giảng Dictation Part 1',
                progress: 'IN_PROGRESS',
              },
              {
                id: 'hw-1',
                type: 'ASSIGNMENT',
                title: 'Bài tập chép chính tả tuần 1',
                progress: 'NOT_STARTED',
                availableUntil: in12Days,
              },
              {
                id: 'hw-done',
                type: 'ASSIGNMENT',
                title: 'Bài tập đã hoàn thành tuần 0',
                progress: 'COMPLETED',
                submissionState: 'SUBMITTED',
              },
              {
                id: 'qz-1',
                type: 'LESSON',
                title: 'Quiz phản xạ nhanh Part 1',
                progress: 'NOT_STARTED',
              },
            ],
          },
        ],
      });
    }
    if (p === '/v2/class-lms/classes/c-list/progress') {
      return Promise.resolve({
        summary: {
          totalActivities: 10,
          completedOrSubmittedCount: 3,
          publishedGradesCount: 1,
          attendanceCheckedCount: 0,
        },
        entries: [
          {
            activityId: 'qz-1',
            title: 'Quiz phản xạ nhanh Part 1',
            type: 'LESSON',
            localKind: 'LOCAL_QUIZ',
            state: 'IN_PROGRESS',
          },
        ],
      });
    }
    if (p === '/v2/class-lms/classes/c-done') {
      return Promise.resolve({
        sections: [
          {
            id: 'sec-done',
            title: 'Tổng kết',
            activities: [
              {
                id: 'done-hw',
                type: 'ASSIGNMENT',
                title: 'Đề tổng hợp Reading K24',
                progress: 'COMPLETED',
                submissionState: 'SUBMITTED',
              },
            ],
          },
        ],
      });
    }
    if (p === '/v2/class-lms/classes/c-done/progress') {
      return Promise.resolve({
        summary: {
          totalActivities: 5,
          completedOrSubmittedCount: 5,
          publishedGradesCount: 2,
          attendanceCheckedCount: 0,
        },
        q05Completion: {
          enabled: true,
          hasPolicy: true,
          certificateIssued: true,
          certificateCode: 'SE-CERT-2026-5F1ACC08',
          statusLabel: 'Đã cấp chứng chỉ',
        },
        entries: [],
      });
    }
    if (p.startsWith('/learning/enrollments/') && p.endsWith('/content')) {
      return Promise.resolve({ modules: [] });
    }
    if (p.startsWith('/learning/enrollments/') && p.endsWith('/progress')) {
      return Promise.resolve({ assessments: [] });
    }
    return Promise.reject(Error('Unexpected endpoint: ' + p));
  });

  render(
    <MemoryRouter>
      <RoleWorkspacePage />
    </MemoryRouter>,
  );

  // Unified class progress, resume lesson from class_sections, finance & certificate badge
  expect(await screen.findByText('Bài giảng Dictation Part 1')).toBeInTheDocument();
  expect(screen.getByText(/Hoàn thành 3\/10 hoạt động/)).toBeInTheDocument();
  expect(screen.getByText(/Chứng chỉ SE-CERT-2026-5F1ACC08/)).toBeInTheDocument();
  expect(screen.getByText('1 lớp đã đóng đủ')).toBeInTheDocument();

  // Default pending tasks show both ASSIGNMENT and LOCAL_QUIZ, excluding already-completed assignment
  expect(screen.getByText('Bài tập chép chính tả tuần 1')).toBeInTheDocument();
  expect(screen.getByText('Quiz phản xạ nhanh Part 1')).toBeInTheDocument();
  expect(screen.queryByText('Bài tập đã hoàn thành tuần 0')).not.toBeInTheDocument();

  // Filter tasks by kind: Quiz & Kiểm tra
  fireEvent.click(screen.getByRole('button', { name: 'Quiz & Kiểm tra' }));
  expect(screen.getByText('Quiz phản xạ nhanh Part 1')).toBeInTheDocument();
  expect(screen.queryByText('Bài tập chép chính tả tuần 1')).not.toBeInTheDocument();

  // Reset kind filter & filter by status: Đã hoàn thành
  fireEvent.click(screen.getByRole('button', { name: 'Tất cả loại' }));
  fireEvent.click(screen.getByRole('button', { name: 'Đã hoàn thành' }));
  expect(screen.getByText('Bài tập đã hoàn thành tuần 0')).toBeInTheDocument();
  expect(screen.getByText('Đề tổng hợp Reading K24')).toBeInTheDocument();

  // Class filter pill scopes down to completed class K24
  fireEvent.click(screen.getByRole('button', { name: /TOEIC Reading K24/ }));
  await waitFor(() => {
    expect(screen.queryByText('Bài tập đã hoàn thành tuần 0')).not.toBeInTheDocument();
    expect(screen.getByText('Đề tổng hợp Reading K24')).toBeInTheDocument();
  });

  // Switch back to all classes & test schedule timeframe filter (7 ngày vs 30 ngày)
  fireEvent.click(screen.getByRole('button', { name: /Tất cả lớp/ }));
  expect(screen.getByText('Buổi học phản xạ hôm nay')).toBeInTheDocument();
  expect(screen.queryByText('Hạn nộp dài hạn 12 ngày')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '30 ngày' }));
  expect(screen.getByText('Hạn nộp dài hạn 12 ngày')).toBeInTheDocument();
});
