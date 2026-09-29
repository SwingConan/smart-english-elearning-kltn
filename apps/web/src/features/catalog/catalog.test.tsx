import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api-client';
import { CatalogPage } from '@/pages/CatalogPage';
import { CourseDetailPage } from '@/pages/CourseDetailPage';
import { catalogApi } from './api';
import { readCatalogUrlState, writeCatalogUrlState } from './catalog-query';
import { CourseCard } from './CourseCard';
import type { CatalogResponse, PublicCourse } from './types';

const course: PublicCourse = {
  id: 'course-1',
  title: 'TOEIC Foundation',
  slug: 'toeic-foundation',
  description: 'Nền tảng TOEIC.',
  level: 'BEGINNER',
  skillScope: 'LR',
  thumbnailUrl: null,
  isPublished: true,
  openOfferingCount: 1,
  modules: [
    {
      id: 'module-1',
      title: 'Listening basics',
      description: null,
      orderIndex: 0,
      lessons: [
        {
          id: 'lesson-1',
          title: 'Part 1',
          description: null,
          focusSkills: ['LISTENING'],
          orderIndex: 0,
          resourceCount: 2,
        },
      ],
    },
  ],
  classOfferings: [
    {
      id: 'offering-1',
      code: 'TOEIC-01',
      name: 'TOEIC tối',
      status: 'OPEN',
      modality: 'ONLINE',
      pricingType: 'FREE',
      tuitionFeeVnd: 0,
      maxStudents: 20,
      totalSessions: 18,
      totalPeriods: 36,
      enrollmentStart: null,
      enrollmentEnd: null,
      classStart: '2026-10-01T00:00:00.000Z',
      classEnd: '2026-12-01T00:00:00.000Z',
      scheduleSlots: [],
      registeredCount: 5,
      remainingSeats: 15,
      isFull: false,
      registrationState: 'AVAILABLE',
      instructor: { id: 'teacher-1', fullName: 'Nguyễn Giảng Viên' },
    },
  ],
};
const response = (data: PublicCourse[]): CatalogResponse => ({
  data,
  meta: { total: data.length, page: 1, limit: 12, totalPages: 1 },
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('catalog query mapping', () => {
  it('round-trips all M02 filters', () => {
    expect(
      readCatalogUrlState(
        new URLSearchParams('search=toeic&level=BEGINNER&skillScope=LR&availability=OPEN&page=2'),
      ),
    ).toEqual({
      search: 'toeic',
      level: 'BEGINNER',
      skillScope: 'LR',
      availability: 'OPEN',
      page: 2,
    });
    expect(
      writeCatalogUrlState({
        search: 'toeic',
        level: '',
        skillScope: 'LISTENING',
        availability: 'OPEN',
        page: 1,
      }).toString(),
    ).toBe('search=toeic&skillScope=LISTENING&availability=OPEN');
  });
});

describe('public catalog', () => {
  it('renders a product card linked by slug', () => {
    render(
      <MemoryRouter>
        <CourseCard course={course} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: course.title })).toBeInTheDocument();
    expect(screen.getByText('Listening & Reading')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Xem khóa học/i })).toHaveAttribute(
      'href',
      '/catalog/toeic-foundation',
    );
  });

  it('synchronizes skill and availability filters to the URL', async () => {
    const list = vi.spyOn(catalogApi, 'list').mockResolvedValue(response([course]));
    render(
      <MemoryRouter initialEntries={['/catalog?page=3']}>
        <CatalogPage />
        <LocationProbe />
      </MemoryRouter>,
    );
    await screen.findByRole('heading', { name: course.title });
    fireEvent.change(screen.getByLabelText('Kỹ năng'), { target: { value: 'LR' } });
    fireEvent.change(screen.getByLabelText('Lớp học'), { target: { value: 'OPEN' } });
    fireEvent.click(screen.getByRole('button', { name: 'Áp dụng' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('skillScope=LR'));
    expect(screen.getByTestId('location')).toHaveTextContent('availability=OPEN');
    expect(screen.getByTestId('location')).not.toHaveTextContent('page=3');
    await waitFor(() =>
      expect(list).toHaveBeenLastCalledWith(
        expect.objectContaining({ skillScope: 'LR', availability: 'OPEN', page: 1 }),
        expect.any(AbortSignal),
      ),
    );
  });

  it('uses friendly empty and failure states', async () => {
    vi.spyOn(catalogApi, 'list').mockResolvedValueOnce(response([]));
    const empty = render(
      <MemoryRouter>
        <CatalogPage />
      </MemoryRouter>,
    );
    expect(await screen.findByText(/Không tìm thấy khóa học phù hợp/i)).toBeInTheDocument();
    empty.unmount();
    vi.spyOn(catalogApi, 'list').mockRejectedValueOnce(new Error('database internals'));
    render(
      <MemoryRouter>
        <CatalogPage />
      </MemoryRouter>,
    );
    expect(await screen.findByText(/Không thể tải danh sách khóa học/i)).toBeInTheDocument();
    expect(screen.queryByText('database internals')).not.toBeInTheDocument();
  });
});

describe('course detail', () => {
  it('separates Course curriculum from ClassOffering enrollment', async () => {
    vi.spyOn(catalogApi, 'detail').mockResolvedValue(course);
    render(
      <MemoryRouter initialEntries={['/catalog/toeic-foundation']}>
        <Routes>
          <Route path="/catalog/:slug" element={<CourseDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByRole('heading', { name: course.title })).toBeInTheDocument();
    expect(screen.getByText(/Listening basics/)).toBeInTheDocument();
    expect(screen.getByText('Nguyễn Giảng Viên')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Xem chi tiết/i })).toHaveAttribute(
      'href',
      '/classes/offering-1',
    );
    expect(screen.queryByRole('button', { name: /Đăng ký/i })).not.toBeInTheDocument();
  });

  it('maps a missing unpublished Course to a safe 404 state', async () => {
    vi.spyOn(catalogApi, 'detail').mockRejectedValue(new ApiError(404, null));
    render(
      <MemoryRouter initialEntries={['/catalog/missing']}>
        <Routes>
          <Route path="/catalog/:slug" element={<CourseDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(
      await screen.findByRole('heading', { name: /Không tìm thấy khóa học/i }),
    ).toBeInTheDocument();
  });
});

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.search}</output>;
}
