import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MyDashboardPage } from '@/pages/MyDashboardPage';
import {
  ActivityChooser,
  ClassLearningPage,
  ClassActivityEditorPage,
} from '@/pages/ClassLearningPage';
import { monthCells, schoolDay, shiftMonth } from './month';
const mocks = vi.hoisted(() => ({ fetch: vi.fn(), user: { id: 'learner', role: 'STUDENT' } }));
vi.mock('@/lib/api-client', () => ({
  apiFetch: (...args: unknown[]) => mocks.fetch(...args),
  apiUrl: (s: string) => '/api' + s,
}));
vi.mock('@/features/auth/auth-context', () => ({ useAuth: () => ({ user: mocks.user }) }));
const c = {
  id: 'c1',
  code: 'CLASS-A',
  name: 'English practice',
  course: { title: 'TOEIC standard', level: 'BASIC' },
  lastAccessedAt: null,
};
const event = {
  id: 'e1',
  source: 'TEACHING_SESSION',
  startsAt: '2026-12-31T17:15:00.000Z',
  endsAt: '2026-12-31T18:15:00.000Z',
  classOffering: { ...c },
  instructor: { fullName: 'Synthetic teacher' },
  room: null,
  modality: 'ONLINE',
  revision: 1,
};
const tree = {
  class: c,
  editable: true,
  sections: [
    { id: 's1', title: 'Week1', introduction: 'Practice', lockVersion: 0, activities: [] },
  ],
};
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
  vi.restoreAllMocks();
});
describe('W03A month dashboard and class learning UI', () => {
  it('saves explicit assignment dates in Vietnam time and publishes the saved revision', async () => {
    mocks.fetch.mockImplementation((path: string, init?: RequestInit) => {
      if (init) return Promise.resolve({ id: 'new-assignment', lockVersion: 2 });
      return Promise.resolve(path.endsWith('/sources') ? { lessons: [] } : tree);
    });
    render(
      <MemoryRouter initialEntries={['/classroom/c1/sections/s1/activities/new?type=ASSIGNMENT']}>
        <Routes>
          <Route
            path="/classroom/:classId/sections/:sectionId/activities/new"
            element={<ClassActivityEditorPage />}
          />
          <Route path="/classroom/:classId" element={<p>Đã lưu vào lớp</p>} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.change(await screen.findByLabelText('Tiêu đề'), {
      target: { value: 'Writing practice' },
    });
    fireEvent.change(screen.getByLabelText('Đề bài và hướng dẫn (Markdown)'), {
      target: { value: 'Write a paragraph.' },
    });
    fireEvent.change(screen.getByLabelText('Ngày mở bài (giờ Việt Nam)'), {
      target: { value: '2026-11-15T08:00' },
    });
    fireEvent.change(screen.getByLabelText('Hạn nộp (giờ Việt Nam)'), {
      target: { value: '2026-11-16T23:00' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu và xuất bản' }));
    await screen.findByText('Đã lưu vào lớp');
    const writes = mocks.fetch.mock.calls.filter((call) => call[1]);
    expect(JSON.parse(writes[0][1].body)).toMatchObject({
      type: 'ASSIGNMENT',
      availableFrom: '2026-11-15T01:00:00.000Z',
      availableUntil: '2026-11-16T16:00:00.000Z',
    });
    expect(writes[1][0]).toBe('/v2/class-lms/classes/c1/activities/new-assignment/publish');
    expect(JSON.parse(writes[1][1].body)).toEqual({ expectedLockVersion: 2 });
  });
  it('caps a mixed day at two items and opens all sorted events with real submission state and actions', async () => {
    const assignment = {
      ...event,
      id: 'assignment:a:DUE',
      source: 'ASSIGNMENT',
      title: 'Hạn: Writing',
      startsAt: '2027-01-01T02:00:00Z',
      endsAt: '2027-01-01T02:00:00Z',
      deadline: '2027-01-01T02:00:00Z',
      status: 'SUBMITTED',
      submittedAt: '2027-01-01T01:00:00Z',
      actionUrl: '/classroom/c1/activities/a',
      actionLabel: 'Xem bài đã nộp',
    };
    const quiz = {
      ...assignment,
      id: 'quiz:q:DUE',
      source: 'QUIZ',
      title: 'Hạn: Quiz',
      status: 'OVERDUE',
      actionUrl: '/classroom/c1/activities/q/quiz',
      actionLabel: 'Làm bài',
      submittedAt: null,
      startsAt: '2027-01-01T03:00:00Z',
      endsAt: '2027-01-01T03:00:00Z',
    };
    const booking = {
      id: 'b',
      teacherId: 't',
      displayName: 'Teacher',
      state: 'CONFIRMED',
      startsAt: '2027-01-01T04:00:00Z',
      endsAt: '2027-01-01T05:00:00Z',
      joinUrl: 'https://meet.google.com/abc-defg-hij',
    };
    mocks.fetch.mockImplementation((path: string) =>
      Promise.resolve(
        path.includes('/consultations/')
          ? { data: [booking] }
          : path.includes('/classes')
            ? { data: [c] }
            : {
                data: [quiz, assignment, event, { ...event, id: 'invalid', startsAt: 'invalid' }],
                undated: [
                  {
                    ...assignment,
                    id: 'undated',
                    title: 'Writing chưa đặt ngày',
                    startsAt: undefined,
                    endsAt: undefined,
                    deadline: null,
                  },
                ],
                truncated: false,
              },
      ),
    );
    const view = render(
      <MemoryRouter initialEntries={['/my/?month=2027-01']}>
        <MyDashboardPage />
      </MemoryRouter>,
    );
    const more = await screen.findByRole('button', { name: '+2 sự kiện khác' });
    const cell = view.container.querySelector('[data-day="2027-01-01"]')!;
    expect(within(cell as HTMLElement).queryByText('Hạn: Quiz')).not.toBeInTheDocument();
    expect(
      within(cell as HTMLElement).queryByText('Writing chưa đặt ngày'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Bài tập và bài kiểm tra chưa có lịch' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Writing chưa đặt ngày')).not.toBeInTheDocument();
    fireEvent.click(more);
    const modal = within(screen.getByRole('dialog'));
    expect(modal.getAllByRole('listitem')).toHaveLength(4);
    expect(modal.getAllByRole('listitem')[0]).toHaveTextContent('Buổi học');
    expect(modal.getByRole('link', { name: 'Xem bài đã nộp' }).closest('li')).toHaveTextContent(
      'Đã nộp',
    );
    expect(modal.getByRole('link', { name: 'Xem bài đã nộp' }).closest('li')).not.toHaveTextContent(
      'Chưa làm',
    );
    expect(modal.getByRole('link', { name: 'Làm bài' })).toHaveAttribute(
      'href',
      '/classroom/c1/activities/q/quiz',
    );
    expect(modal.getByRole('link', { name: 'Vào Meet' })).toHaveAttribute('href', booking.joinUrl);
    fireEvent.click(modal.getByRole('button', { name: 'Đóng chi tiết ngày' }));
    fireEvent.click(screen.getByRole('button', { name: 'Xem tất cả sự kiện ngày 2027-01-02' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Không có sự kiện trong ngày này.');
  });
  it('renders documented dashboard affordances with real projected month data, school day and no learner event creation', async () => {
    mocks.fetch.mockImplementation((path: string) =>
      Promise.resolve(
        path.includes('/classes')
          ? { data: [c], canProposeOfficialSession: false }
          : { data: [event], truncated: false },
      ),
    );
    render(
      <MemoryRouter initialEntries={['/my/?month=2027-01']}>
        <MyDashboardPage />
      </MemoryRouter>,
    );
    expect(
      await screen.findByRole('heading', { name: 'Lịch học và lớp của tôi' }),
    ).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: /00:15/ }));
    expect(
      within(screen.getByRole('dialog')).getByRole('link', { name: 'Vào lớp' }),
    ).toHaveAttribute('href', '/my/events/e1');
    fireEvent.click(screen.getByRole('button', { name: 'Đóng chi tiết ngày' }));
    expect(screen.getByRole('table', { name: 'Lịch tháng 2027-01' })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Các lớp học được truy cập gần đây' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Sự kiện mới/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Xem lịch đầy đủ' })).toHaveAttribute(
      'href',
      '/my/calendar?month=2027-01',
    );
    fireEvent.change(screen.getByLabelText('Khóa học / lớp'), { target: { value: 'c1' } });
    await waitFor(() =>
      expect(mocks.fetch).toHaveBeenCalledWith('/v2/my/calendar?month=2027-01&classId=c1'),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Tháng trước' }));
    await waitFor(() =>
      expect(mocks.fetch).toHaveBeenCalledWith('/v2/my/calendar?month=2026-12&classId=c1'),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Tháng sau' }));
    await waitFor(() =>
      expect(mocks.fetch).toHaveBeenLastCalledWith('/v2/my/calendar?month=2027-01&classId=c1'),
    );
  });
  it('renders empty state and permits only backend-authorized proposal navigation', async () => {
    mocks.user.role = 'ACADEMIC_MANAGER';
    mocks.fetch.mockImplementation((p: string) =>
      Promise.resolve(
        p.includes('/classes')
          ? { data: [], canProposeOfficialSession: true }
          : { data: [], truncated: false },
      ),
    );
    render(
      <MemoryRouter>
        <MyDashboardPage />
      </MemoryRouter>,
    );
    expect(await screen.findByText(/Bạn chưa có lớp/)).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Sự kiện mới · Đề xuất buổi' })).toHaveAttribute(
      'href',
      '/academic/planning',
    );
    expect(await screen.findByText(/Không có sự kiện có ngày hợp lệ/)).toBeInTheDocument();
  });
  it('chooser searches supported grid types and routes to actual editor, never enables fake quiz or assignment', async () => {
    render(
      <MemoryRouter>
        <Routes>
          <Route
            path="/"
            element={<ActivityChooser classId="c1" sectionId="s1" close={vi.fn()} />}
          />
          <Route
            path="/classroom/:c/sections/:s/activities/new"
            element={<p>Actual activity editor route</p>}
          />
        </Routes>
      </MemoryRouter>,
    );
    const dialog = screen.getByRole('dialog');
    fireEvent.change(screen.getByLabelText('Tìm loại hoạt động'), {
      target: { value: 'tài nguyên' },
    });
    expect(within(dialog).queryByRole('button', { name: /Bài học/ })).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: /Tài nguyên/ }));
    expect(await screen.findByText('Actual activity editor route')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Quiz|Bài nộp/ })).not.toBeInTheDocument();
  });
  it('teacher edit mode creates an actual section via API, while learner projection has no editing controls', async () => {
    mocks.fetch.mockResolvedValue(tree);
    render(
      <MemoryRouter initialEntries={['/classroom/c1']}>
        <Routes>
          <Route path="/classroom/:classId" element={<ClassLearningPage />} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Bật chế độ chỉnh sửa' }));
    fireEvent.change(screen.getByLabelText('Tên chủ đề'), { target: { value: 'Week2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo chủ đề' }));
    await waitFor(() =>
      expect(mocks.fetch).toHaveBeenCalledWith(
        '/v2/class-lms/classes/c1/sections',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ title: 'Week2', introduction: '' }),
        }),
      ),
    );
  });
  it('learner class view cannot enable editing through a forged edit-intent URL', async () => {
    mocks.fetch.mockResolvedValue({ ...tree, editable: false });
    render(
      <MemoryRouter initialEntries={['/classroom/c1?edit=1']}>
        <Routes>
          <Route path="/classroom/:classId" element={<ClassLearningPage />} />
        </Routes>
      </MemoryRouter>,
    );
    await screen.findByText('Week1');
    expect(
      screen.queryByRole('button', { name: /chỉnh sửa|Tạo chủ đề|Thêm hoạt động/ }),
    ).not.toBeInTheDocument();
    expect(mocks.fetch.mock.calls.every((r: unknown[]) => r.length === 1)).toBe(true);
  });
  it('editor retains input after CAS failure and sends no shared Course mutation', async () => {
    mocks.fetch.mockImplementation((p: string, init?: RequestInit) =>
      init
        ? Promise.reject(Error('409'))
        : Promise.resolve(p.endsWith('/sources') ? { lessons: [] } : tree),
    );
    render(
      <MemoryRouter initialEntries={['/classroom/c1/sections/s1/activities/new?type=LESSON']}>
        <Routes>
          <Route
            path="/classroom/:classId/sections/:sectionId/activities/new"
            element={<ClassActivityEditorPage />}
          />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.change(await screen.findByLabelText('Tiêu đề'), {
      target: { value: 'My local practice' },
    });
    fireEvent.change(screen.getByLabelText('Nội dung bài học (Markdown)'), {
      target: { value: 'My retained Markdown' },
    });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Lưu bản nháp' })));
    expect(await screen.findByRole('alert')).toHaveTextContent('dữ liệu đã đổi');
    expect(screen.getByLabelText('Nội dung bài học (Markdown)')).toHaveValue(
      'My retained Markdown',
    );
    expect(
      mocks.fetch.mock.calls
        .filter((r: unknown[]) => r.length > 1)
        .every((r: unknown[]) => String(r[0]).startsWith('/v2/class-lms/classes/c1/sections/')),
    ).toBe(true);
  });
  it('month geometry and school-zone date preserve leap/year boundaries independent of browser zone', () => {
    expect(shiftMonth('2027-01', -1)).toBe('2026-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(monthCells('2028-02').filter(Boolean)).toHaveLength(29);
    expect(schoolDay('2026-12-31T17:15:00Z')).toBe('2027-01-01');
    expect(monthCells('2027-01')[4]).toBe('2027-01-01');
  });
});
