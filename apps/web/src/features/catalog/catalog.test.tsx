import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '@/features/auth/AuthContext';
import { authApi } from '@/features/auth/api';
import { ApiError } from '@/lib/api-client';
import { CatalogPage } from '@/pages/CatalogPage';
import { CourseDetailPage } from '@/pages/CourseDetailPage';
import { catalogApi } from './api';
import { readCatalogUrlState, writeCatalogUrlState } from './catalog-query';
import { CourseCard } from './CourseCard';
import type { CatalogResponse, PublicCourse } from './types';

const course: PublicCourse = {
  id: 'course-1',
  title: 'English Grammar Basics',
  slug: 'english-grammar-basics',
  description: 'Nền tảng ngữ pháp tiếng Anh.',
  level: 'BEGINNER',
  thumbnailUrl: 'https://example.test/grammar.jpg',
  isPublished: true,
  classOfferings: [
    {
      id: 'offering-free',
      name: 'Lớp miễn phí buổi tối',
      status: 'OPEN',
      pricingType: 'FREE',
      tuitionFeeVnd: 0,
      maxStudents: 20,
      enrollmentStart: '2026-09-01T00:00:00.000Z',
      enrollmentEnd: '2026-09-30T00:00:00.000Z',
      classStart: '2026-10-01T00:00:00.000Z',
      classEnd: '2026-12-01T00:00:00.000Z',
      instructor: { id: 'instructor-1', fullName: 'Nguyễn Giảng Viên' },
    },
    {
      id: 'offering-paid',
      name: 'Lớp chuyên sâu',
      status: 'OPEN',
      pricingType: 'PAID',
      tuitionFeeVnd: 1_500_000,
      maxStudents: null,
      enrollmentStart: null,
      enrollmentEnd: null,
      classStart: null,
      classEnd: null,
      instructor: null,
    },
  ],
};

const response = (data: PublicCourse[], page = 1, totalPages = 1): CatalogResponse => ({
  data,
  meta: { total: data.length || totalPages, page, limit: 12, totalPages },
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('catalog query mapping', () => {
  it('maps valid query values and safely normalizes unknown values', () => {
    expect(readCatalogUrlState(new URLSearchParams('search=grammar&level=BEGINNER&page=2')))
      .toEqual({ search: 'grammar', level: 'BEGINNER', page: 2 });
    expect(readCatalogUrlState(new URLSearchParams('level=Custom%20Level&page=oops&unknown=value')))
      .toEqual({ search: '', level: 'Custom Level', page: 1 });
    expect(writeCatalogUrlState({ search: 'grammar & speaking', level: 'BEGINNER', page: 2 }).toString())
      .toBe('search=grammar+%26+speaking&level=BEGINNER&page=2');
  });
});

describe('CourseCard', () => {
  it('renders only real public course fields and links by slug', () => {
    render(<MemoryRouter><CourseCard course={course} /></MemoryRouter>);
    expect(screen.getByRole('heading', { name: course.title })).toBeInTheDocument();
    expect(screen.getByText(course.level)).toBeInTheDocument();
    expect(screen.getByRole('img')).toHaveAttribute('alt', `Ảnh khóa học ${course.title}`);
    expect(screen.getByRole('link', { name: 'Xem chi tiết' })).toHaveAttribute(
      'href',
      `/catalog/${course.slug}`,
    );
    expect(screen.queryByText(/₫|rating|học viên/i)).not.toBeInTheDocument();
  });
});

describe('CatalogPage', () => {
  it('shows loading and then renders courses', async () => {
    let resolveRequest!: (value: CatalogResponse) => void;
    vi.spyOn(catalogApi, 'list').mockReturnValueOnce(
      new Promise((resolve) => { resolveRequest = resolve; }),
    );
    render(<MemoryRouter><CatalogPage /></MemoryRouter>);
    expect(screen.getByRole('status')).toHaveTextContent('Đang tải');
    resolveRequest(response([course]));
    expect(await screen.findByRole('heading', { name: course.title })).toBeInTheDocument();
  });

  it('renders empty and friendly error states', async () => {
    vi.spyOn(catalogApi, 'list').mockResolvedValueOnce(response([]));
    const first = render(<MemoryRouter><CatalogPage /></MemoryRouter>);
    expect(await screen.findByText('Không tìm thấy khóa học phù hợp.')).toBeInTheDocument();
    first.unmount();

    vi.spyOn(catalogApi, 'list').mockRejectedValueOnce(new Error('internal details'));
    render(<MemoryRouter><CatalogPage /></MemoryRouter>);
    expect(await screen.findByRole('alert')).toHaveTextContent('Không thể tải danh sách khóa học');
    expect(screen.queryByText('internal details')).not.toBeInTheDocument();
  });

  it('syncs search and level to the URL and resets page to one', async () => {
    const list = vi.spyOn(catalogApi, 'list').mockResolvedValue(response([course]));
    render(
      <MemoryRouter initialEntries={['/catalog?page=3']}>
        <CatalogPage />
        <LocationProbe />
      </MemoryRouter>,
    );
    await waitFor(() => expect(list).toHaveBeenCalled());
    fireEvent.change(screen.getByLabelText('Tìm khóa học'), { target: { value: 'grammar & speaking' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tìm kiếm' }));
    expect(await screen.findByTestId('location')).toHaveTextContent('search=grammar+%26+speaking');
    expect(screen.getByTestId('location')).not.toHaveTextContent('page=3');

    fireEvent.change(screen.getByLabelText('Trình độ'), { target: { value: 'BEGINNER' } });
    expect(await screen.findByTestId('location')).toHaveTextContent('level=BEGINNER');
    await waitFor(() => expect(list).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: 'grammar & speaking', level: 'BEGINNER', page: 1, limit: 12 }),
      expect.any(AbortSignal),
    ));
  });

  it('changes page through pagination controls', async () => {
    const list = vi.spyOn(catalogApi, 'list').mockResolvedValue(response([course], 1, 2));
    render(<MemoryRouter><CatalogPage /><LocationProbe /></MemoryRouter>);
    await screen.findByRole('heading', { name: course.title });
    fireEvent.click(screen.getByRole('button', { name: 'Trang sau' }));
    expect(await screen.findByTestId('location')).toHaveTextContent('page=2');
    await waitFor(() => expect(list).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 2 }),
      expect.any(AbortSignal),
    ));
  });
});

describe('CourseDetailPage', () => {
  it('renders public fields, OPEN offerings, pricing, instructor and guest CTA', async () => {
    vi.spyOn(catalogApi, 'detail').mockResolvedValueOnce(course);
    vi.spyOn(authApi, 'me').mockRejectedValueOnce(new ApiError(401, null));
    renderDetail();

    expect(await screen.findByRole('heading', { name: course.title })).toBeInTheDocument();
    expect(screen.getByText('Miễn phí')).toBeInTheDocument();
    expect(screen.getByText(/1\.500\.000/)).toBeInTheDocument();
    expect(screen.getByText('Nguyễn Giảng Viên')).toBeInTheDocument();
    const links = await screen.findAllByRole('link', { name: 'Đăng ký' });
    expect(links[0]).toHaveAttribute(
      'href',
      `/login?returnUrl=${encodeURIComponent(`/catalog/${course.slug}`)}`,
    );
  });

  it('shows no-offering, 404 and generic error states without raw errors', async () => {
    vi.spyOn(authApi, 'me').mockRejectedValue(new ApiError(401, null));
    vi.spyOn(catalogApi, 'detail').mockResolvedValueOnce({ ...course, classOfferings: [] });
    const noOffering = renderDetail();
    expect(await screen.findByText('Hiện chưa có lớp đang mở đăng ký.')).toBeInTheDocument();
    noOffering.unmount();

    vi.spyOn(catalogApi, 'detail').mockRejectedValueOnce(new ApiError(404, null));
    const missing = renderDetail();
    expect(await screen.findByRole('heading', { name: 'Không tìm thấy khóa học' })).toBeInTheDocument();
    missing.unmount();

    vi.spyOn(catalogApi, 'detail').mockRejectedValueOnce(new Error('database internals'));
    renderDetail();
    expect(await screen.findByRole('alert')).toHaveTextContent('Không thể tải khóa học');
    expect(screen.queryByText('database internals')).not.toBeInTheDocument();
  });

  it('keeps enrollment disabled for a student and never sends an enrollment request', async () => {
    vi.spyOn(catalogApi, 'detail').mockResolvedValueOnce({ ...course, classOfferings: [course.classOfferings[0]] });
    vi.spyOn(authApi, 'me').mockResolvedValueOnce({
      id: 'student-1',
      email: 'student@example.test',
      fullName: 'Student',
      role: 'STUDENT',
      status: 'ACTIVE',
    });
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    renderDetail();

    const button = await screen.findByRole('button', { name: 'Đăng ký' });
    expect(button).toBeDisabled();
    expect(screen.getByText('Chức năng đăng ký sẽ được kết nối ở bước tiếp theo.')).toBeInTheDocument();
    fireEvent.click(button);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.search}</output>;
}

function renderDetail() {
  return render(
    <MemoryRouter initialEntries={[`/catalog/${course.slug}`]}>
      <AuthProvider>
        <Routes>
          <Route path="/catalog/:slug" element={<CourseDetailPage />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}
