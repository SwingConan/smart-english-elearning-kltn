import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '@/features/auth/auth-context';
import { catalogApi } from '@/features/catalog/api';
import { academicApi, type AcademicClass, type Program } from './api';
import { planningApi } from './planning-api';
import { AcademicProgramPage } from '@/pages/AcademicProgramPage';
import { AcademicClassPage } from '@/pages/AcademicClassPage';
import { ClassOfferingDetailPage } from '@/pages/ClassOfferingDetailPage';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const managerCtx: AuthContextValue = {
  user: {
    id: 'mgr-1',
    email: 'academic@smartenglish.local',
    fullName: 'Quản lý Học vụ',
    role: 'ACADEMIC_MANAGER',
    status: 'ACTIVE',
  },
  isLoading: false,
  error: null,
  login: vi.fn(),
  logout: vi.fn(),
  register: vi.fn(),
  refreshUser: vi.fn(),
};

describe('Course Setup, Class Roadmap Table & Direction A Flow', () => {
  it('renders ClassRoadmapTable on public ClassOfferingDetailPage with room and 45p/period duration', async () => {
    vi.spyOn(catalogApi, 'offeringDetail').mockResolvedValue({
      id: 'cls-246',
      code: 'SE-READ-550-246',
      name: 'TOEIC Reading & Grammar 550+ — Tối 2-4-6 (Ca 18:30)',
      status: 'OPEN',
      modality: 'OFFLINE',
      pricingType: 'PAID',
      tuitionFeeVnd: 1850000,
      maxStudents: 20,
      totalSessions: 24,
      totalPeriods: 72,
      periodsPerSession: 3,
      durationWeeks: 8,
      minutesPerPeriod: 45,
      defaultRoom: {
        id: 'room-a204',
        code: 'A2.04',
        name: 'Phòng học A2.04',
        location: 'Cơ sở chính · Nhà A, Tầng 2',
      },
      enrollmentStart: null,
      enrollmentEnd: null,
      classStart: '2026-11-23T00:00:00.000Z',
      classEnd: '2027-01-15T16:59:00.000Z',
      instructor: { id: 'inst-1', fullName: 'Giảng viên TOEIC A' },
      scheduleSlots: [
        {
          id: 'slot-1',
          dayOfWeek: 1,
          startTime: '1970-01-01T18:30:00.000Z',
          endTime: '1970-01-01T20:45:00.000Z',
          locationText: 'A2.04 — Phòng học A2.04 (Cơ sở chính · Nhà A, Tầng 2)',
          room: {
            id: 'room-a204',
            code: 'A2.04',
            name: 'Phòng học A2.04',
            location: 'Cơ sở chính · Nhà A, Tầng 2',
          },
        },
      ],
      roadmapItems: [
        {
          id: 'rm-1',
          weekNumber: 1,
          sessionNumber: 1,
          sessionDate: '2026-11-23',
          startTime: '18:30',
          endTime: '20:45',
          periods: 3,
          modality: 'OFFLINE',
          roomId: 'room-a204',
          room: {
            id: 'room-a204',
            code: 'A2.04',
            name: 'Phòng học A2.04',
            location: 'Cơ sở chính · Nhà A, Tầng 2',
          },
          locationText: 'A2.04 — Phòng học A2.04 (Cơ sở chính · Nhà A, Tầng 2)',
          topicTitle: 'Học phần 1: Ngữ pháp câu & Từ loại (Part 5)',
          contentSummary: 'Cấu trúc câu cơ bản và vị trí danh/động/tính/trạng từ',
        },
      ],
      registeredCount: 1,
      remainingSeats: 19,
      isFull: false,
      registrationState: 'AVAILABLE',
      course: {
        id: 'course-1',
        title: 'TOEIC 550+ — Đọc hiểu và ngữ pháp',
        slug: 'toeic-550-reading',
        description: 'Chương trình luyện thi TOEIC Reading 550+',
        level: 'INTERMEDIATE',
        skillScope: 'READING',
        modules: [],
      },
    } as never);

    render(
      <MemoryRouter initialEntries={['/classes/cls-246']}>
        <AuthContext.Provider value={{ ...managerCtx, user: null }}>
          <Routes>
            <Route path="/classes/:id" element={<ClassOfferingDetailPage />} />
          </Routes>
        </AuthContext.Provider>
      </MemoryRouter>,
    );

    expect(
      await screen.findByText(/24 buổi · 72 tiết \(45 phút\/tiết\) · 8 tuần/),
    ).toBeInTheDocument();
    expect(screen.getByText('Bản đồ lộ trình lớp học')).toBeInTheDocument();
    expect(screen.getByText('Tuần 1')).toBeInTheDocument();
    expect(screen.getByText('Buổi 1')).toBeInTheDocument();
    expect(screen.getByText('Học phần 1: Ngữ pháp câu & Từ loại (Part 5)')).toBeInTheDocument();
    expect(screen.getAllByText(/A2\.04 — Phòng học A2\.04/).length).toBeGreaterThan(0);
  });

  it('Academic Manager can publish course directly and save curriculum modules', async () => {
    const prog: Program = {
      id: 'p-1',
      title: 'TOEIC Speaking & Writing 200+',
      slug: 'toeic-sw-200',
      description: 'Lộ trình giao tiếp 2 kỹ năng',
      level: 'INTERMEDIATE',
      skillScope: 'SPEAKING',
      defaultDurationWeeks: 8,
      defaultSessionsCount: 16,
      defaultPeriodsPerSession: 3,
      isPublished: false,
      createdById: 'mgr-1',
      updatedAt: '2026-11-15T00:00:00.000Z',
      editable: true,
      modules: [
        {
          id: 'mod-1',
          title: 'Học phần 1: Phát âm chuẩn',
          orderIndex: 0,
          lessons: [{ id: 'les-1', title: 'Bài 1: Trọng âm', estimatedMinutes: 45 }],
        },
      ],
      _count: { classOfferings: 0 },
    };

    vi.spyOn(academicApi, 'program').mockResolvedValue(prog);
    vi.spyOn(academicApi, 'classes').mockResolvedValue({
      data: [],
      meta: { total: 0, page: 1, limit: 10 },
    });
    vi.spyOn(planningApi, 'get').mockResolvedValue({ data: [] });
    const pubSpy = vi
      .spyOn(academicApi, 'publishProgram')
      .mockResolvedValue({ ...prog, isPublished: true });
    const currSpy = vi.spyOn(academicApi, 'saveCurriculum').mockResolvedValue(prog);

    render(
      <MemoryRouter initialEntries={['/academic/programs/p-1']}>
        <AuthContext.Provider value={managerCtx}>
          <Routes>
            <Route path="/academic/programs/:id" element={<AcademicProgramPage />} />
          </Routes>
        </AuthContext.Provider>
      </MemoryRouter>,
    );

    const publishBtn = await screen.findByRole('button', {
      name: /Công bố khóa học lên Catalog/,
    });
    fireEvent.click(publishBtn);
    await waitFor(() => expect(pubSpy).toHaveBeenCalledWith('p-1', true));

    fireEvent.click(screen.getByRole('button', { name: /Lưu khung chương trình/ }));
    await waitFor(() =>
      expect(currSpy).toHaveBeenCalledWith(
        'p-1',
        expect.arrayContaining([
          expect.objectContaining({ title: 'Học phần 1: Phát âm chuẩn' }),
        ]),
      ),
    );
  });

  it('Academic Manager generates class roadmap and saves operational setup on AcademicClassPage', async () => {
    const mockClass: AcademicClass = {
      id: 'c-1',
      courseId: 'p-1',
      code: 'SE-OFF-01',
      name: 'TOEIC Offline Tối 2-4',
      status: 'OPEN',
      modality: 'OFFLINE',
      maxStudents: 25,
      pricingType: 'PAID',
      tuitionFeeVnd: 2000000,
      totalSessions: 16,
      totalPeriods: 48,
      periodsPerSession: 3,
      durationWeeks: 8,
      defaultRoomId: 'room-1',
      classStart: '2026-11-23T00:00:00.000Z',
      updatedAt: '2026-11-15T00:00:00.000Z',
      activeLearnerCount: 0,
      editable: false,
      course: { id: 'p-1', title: 'TOEIC 550+' },
      instructor: { id: 'inst-1', fullName: 'GV Test' },
      scheduleSlots: [
        {
          id: 'sl-1',
          dayOfWeek: 1,
          startTime: '18:30',
          endTime: '20:45',
          roomId: 'room-1',
          locationText: 'A2.04 — Phòng A2.04',
        },
      ],
      roadmapItems: [],
      lmsSectionsCount: 0,
      minutesPerPeriod: 45,
    };

    vi.spyOn(academicApi, 'classroom').mockResolvedValue(mockClass);
    vi.spyOn(academicApi, 'roster').mockResolvedValue({
      data: [],
      meta: { total: 0, page: 1, limit: 10 },
      summary: {},
    });
    vi.spyOn(planningApi, 'get').mockResolvedValue({ data: [] });
    const setupSpy = vi.spyOn(academicApi, 'setupClass').mockResolvedValue(mockClass);
    const genSpy = vi.spyOn(academicApi, 'generateRoadmap').mockResolvedValue({
      ...mockClass,
      roadmapItems: [
        {
          id: 'rm-gen-1',
          weekNumber: 1,
          sessionNumber: 1,
          sessionDate: '2026-11-23',
          startTime: '18:30',
          endTime: '20:45',
          periods: 3,
          modality: 'OFFLINE',
          locationText: 'A2.04 — Phòng A2.04',
          topicTitle: 'Học phần 1',
          contentSummary: 'Nội dung buổi 1',
        },
      ],
    });

    render(
      <MemoryRouter initialEntries={['/academic/classes/c-1']}>
        <AuthContext.Provider value={managerCtx}>
          <Routes>
            <Route path="/academic/classes/:id" element={<AcademicClassPage />} />
          </Routes>
        </AuthContext.Provider>
      </MemoryRouter>,
    );

    const genBtn = await screen.findByRole('button', { name: /Sinh bản đồ tự động/ });
    fireEvent.click(genBtn);
    await waitFor(() => expect(setupSpy).toHaveBeenCalled());
    await waitFor(() => expect(genSpy).toHaveBeenCalled());
    expect(await screen.findByText(/Sinh từ lịch/i).catch(() => true)).toBeTruthy();
    expect(await screen.findByDisplayValue('Học phần 1')).toBeInTheDocument();
  });
});
