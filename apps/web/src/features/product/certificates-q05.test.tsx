import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuth } from '@/features/auth/auth-context';
import { apiFetch } from '@/lib/api-client';
import { CertificatesWorkspacePage } from '@/pages/CertificatesWorkspacePage';
import { CompletionPage } from './LearnerCompletionPage';
import { enrollmentApi } from '@/features/enrollments/api';

vi.mock('@/features/auth/auth-context', () => ({ useAuth: vi.fn() }));
vi.mock('@/features/enrollments/api', () => ({
  enrollmentApi: {
    listMine: vi.fn(),
  },
}));
vi.mock('@/lib/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api-client')>()),
  apiFetch: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe('Q05 Completion Criteria & Internal Certificates UI', () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockReturnValue({
      user: {
        id: 'hvu-1',
        role: 'ACADEMIC_MANAGER',
        status: 'ACTIVE',
        email: 'academic@gmail.com',
        fullName: 'HVU One',
      },
      isLoading: false,
      error: null,
      refreshUser: vi.fn(),
      login: vi.fn(),
      logout: vi.fn(),
      register: vi.fn(),
    });
  });

  it('does not pre-fill 70/80 thresholds and blocks submit when HVU leaves thresholds blank', async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      courses: [{ id: 'course-1', title: 'TOEIC 450', level: 'A2' }],
      classes: [{ id: 'cls-1', code: 'TOEIC-01', name: 'Lớp 1', courseId: 'course-1' }],
      policies: [],
      enrollments: [],
      certificates: [],
      reviews: [],
      events: [],
    });

    render(
      <MemoryRouter>
        <CertificatesWorkspacePage />
      </MemoryRouter>,
    );

    const codeInput = await screen.findByPlaceholderText(/POL-CLASS-Q05-V1/);
    fireEvent.change(codeInput, { target: { value: 'POL-CUSTOM-01' } });
    fireEvent.change(screen.getByPlaceholderText(/Chuẩn hoàn thành lớp/), {
      target: { value: 'Chính sách thử nghiệm' },
    });
    fireEvent.change(screen.getByPlaceholderText(/Mô tả điều kiện/), {
      target: { value: 'Mô tả hợp lệ tối thiểu 10 ký tự.' },
    });
    fireEvent.change(screen.getByPlaceholderText(/Tối thiểu 10 ký tự/), {
      target: { value: 'Lý do soạn thảo tối thiểu 10 ký tự.' },
    });

    const minGradeInput = screen.getByPlaceholderText(/Nhập ngưỡng \(VD: 65\)/) as HTMLInputElement;
    const minAttInput = screen.getByPlaceholderText(/Nhập ngưỡng chuyên cần/) as HTMLInputElement;
    expect(minGradeInput.value).toBe('');
    expect(minAttInput.value).toBe('');

    fireEvent.click(screen.getByRole('button', { name: /Tạo dự thảo chính sách/ }));
    expect(
      await screen.findByText(/Vui lòng nhập ngưỡng điểm đạt hợp lệ.*không tự đặt ngưỡng mặc định/),
    ).toBeInTheDocument();
  });

  it('renders TEST POLICY internal certificate clearly for learner without claiming TOEIC ETS', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: {
        id: 'stu-1',
        role: 'STUDENT',
        status: 'ACTIVE',
        email: 'student@gmail.com',
        fullName: 'Nguyễn Văn Minh',
      },
      isLoading: false,
      error: null,
      refreshUser: vi.fn(),
      login: vi.fn(),
      logout: vi.fn(),
      register: vi.fn(),
    });

    vi.mocked(enrollmentApi.listMine).mockResolvedValue([
      {
        id: 'enr-1',
        status: 'ACTIVE',
        classOffering: {
          id: 'cls-1',
          code: 'TOEIC-FOUNDATION-01',
          name: 'Lớp Foundation',
        },
        progress: { completedLessons: 3, totalLessons: 10, progressPercent: 30 },
      } as any,
    ]);

    vi.mocked(apiFetch).mockResolvedValue({
      assessment: 'ISSUED',
      issuanceAvailable: true,
      certificateRecordsVerified: true,
      certificates: [],
      enrollments: [
        {
          enrollmentId: 'enr-1',
          assessment: 'ISSUED',
          statusLabel: 'ĐÃ CẤP CHỨNG CHỈ',
          missingEvidence: [],
          policy: {
            id: 'pol-1',
            code: 'POL-Q05-TEST',
            version: 1,
            title: 'Chính sách Q05 Test',
            state: 'APPROVED',
            isTestPolicy: true,
          },
          evaluation: {
            overall: 'ELIGIBLE_FOR_REVIEW',
            criteria: [
              {
                criterionId: 'CRIT_W03_GRADE',
                domain: 'W03_GRADE',
                label: 'Điểm tổng hợp',
                scale: 'PERCENT_100',
                observedNumericValue: 82.5,
                minNumericValue: 65,
                required: true,
                status: 'SATISFIED',
                reasonCode: 'GRADE_MEETS_THRESHOLD',
              },
            ],
          },
          certificate: {
            id: 'cert-1',
            certificateCode: 'SE-CERT-TEST-2026-ABCDEF12',
            state: 'ISSUED',
            isTestPolicy: true,
            issuedAt: '2026-11-14T08:50:00Z',
            immutableSnapshot: {
              learner: { fullName: 'Nguyễn Văn Minh' },
              course: { title: 'TOEIC Foundation 450+' },
              classOffering: { code: 'TOEIC-FOUNDATION-01' },
            },
          },
        },
      ],
    });

    render(
      <MemoryRouter initialEntries={['/completion']}>
        <Routes>
          <Route path="/completion" element={<CompletionPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('ĐÃ CẤP CHỨNG CHỈ')).toBeInTheDocument();
    expect(screen.getByText('SE-CERT-TEST-2026-ABCDEF12')).toBeInTheDocument();
    expect(screen.getByText(/TEST POLICY · Minh chứng kiểm thử/)).toBeInTheDocument();
    expect(screen.getByText(/không phải chứng chỉ quốc tế TOEIC ETS/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /In \/ Lưu PDF chứng chỉ/ })).toBeInTheDocument();
  });

  it('renders official non-test certificate, 100% LMS progress, and direct classroom/progress/gradebook links on /my/progress', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: {
        id: 'stu-k24',
        role: 'STUDENT',
        status: 'ACTIVE',
        email: 'student@gmail.com',
        fullName: 'Học viên Smart English',
      },
      isLoading: false,
      error: null,
      refreshUser: vi.fn(),
      login: vi.fn(),
      logout: vi.fn(),
      register: vi.fn(),
    });

    vi.mocked(enrollmentApi.listMine).mockResolvedValue([
      {
        id: 'enr-k24',
        status: 'COMPLETED',
        classOffering: {
          id: 'cls-k24',
          code: 'SE-READ-550-K24',
          name: 'TOEIC Reading & Grammar 550+ — Khóa hoàn thành K24',
          course: { title: 'TOEIC Reading Strategies & Grammar 550+' },
        },
        progress: { completedLessons: 10, totalLessons: 10, progressPercent: 100 },
      } as any,
    ]);

    vi.mocked(apiFetch).mockResolvedValue({
      assessment: 'ISSUED',
      issuanceAvailable: true,
      certificateRecordsVerified: true,
      certificates: [],
      enrollments: [
        {
          enrollmentId: 'enr-k24',
          enrollmentStatus: 'COMPLETED',
          classOfferingId: 'cls-k24',
          classCode: 'SE-READ-550-K24',
          className: 'TOEIC Reading & Grammar 550+ — Khóa hoàn thành K24',
          courseTitle: 'TOEIC Reading Strategies & Grammar 550+',
          lmsProgress: {
            completedActivities: 10,
            totalActivities: 10,
            progressPercent: 100,
          },
          assessment: 'ISSUED',
          statusLabel: 'ĐÃ CẤP CHỨNG CHỈ',
          missingEvidence: [],
          policy: {
            id: 'pol-k24',
            code: 'POL-SE-READ-550-K24',
            version: 1,
            title: 'Chuẩn hoàn thành Khóa TOEIC Reading & Grammar 550+ (K24)',
            state: 'APPROVED',
            isTestPolicy: false,
          },
          evaluation: {
            overall: 'ELIGIBLE_FOR_REVIEW',
            criteria: [
              {
                criterionId: 'CRIT_W03_GRADE',
                domain: 'W03_GRADE',
                label: 'Trung bình các đầu điểm đã công bố (W03)',
                scale: 'PERCENT_100',
                observedNumericValue: 94.5,
                minNumericValue: 70,
                required: true,
                status: 'SATISFIED',
                reasonCode: 'GRADE_MEETS_THRESHOLD',
              },
              {
                criterionId: 'CRIT_W06_ATTENDANCE',
                domain: 'W06_ATTENDANCE',
                label: 'Tỷ lệ chuyên cần buổi học (W06/LMS)',
                scale: 'PERCENT_100',
                observedNumericValue: 100,
                minNumericValue: 80,
                required: true,
                status: 'SATISFIED',
                reasonCode: 'ATTENDANCE_MEETS_THRESHOLD',
              },
            ],
          },
          certificate: {
            id: 'cert-k24',
            certificateCode: 'SE-CERT-2026-5F1ACC08',
            state: 'ISSUED',
            isTestPolicy: false,
            issuedAt: '2026-11-14T19:17:57Z',
            immutableSnapshot: {
              learner: { fullName: 'Học viên Smart English' },
              course: { title: 'TOEIC Reading Strategies & Grammar 550+' },
              classOffering: {
                code: 'SE-READ-550-K24',
                name: 'TOEIC Reading & Grammar 550+ — Khóa hoàn thành K24',
              },
            },
          },
        },
      ],
    });

    render(
      <MemoryRouter initialEntries={['/my/progress']}>
        <Routes>
          <Route path="/my/progress" element={<CompletionPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('SE-CERT-2026-5F1ACC08')).toBeInTheDocument();
    expect(screen.getByText('10/10')).toBeInTheDocument();
    expect(screen.getByText(/Chứng chỉ chính thức/)).toBeInTheDocument();
    expect(screen.queryByText(/TEST POLICY · Minh chứng kiểm thử/)).not.toBeInTheDocument();

    const classroomLink = screen.getByRole('link', { name: /Vào không gian lớp/ });
    expect(classroomLink).toHaveAttribute('href', '/classroom/cls-k24');
    const progressLink = screen.getByRole('link', { name: /Xem tiến độ/ });
    expect(progressLink).toHaveAttribute('href', '/classroom/cls-k24/progress');
    expect(screen.queryByRole('link', { name: /Xem bảng điểm/ })).not.toBeInTheDocument();
    const lookupLink = screen.getByRole('link', { name: /Tra cứu & Xác minh/ });
    expect(lookupLink).toHaveAttribute(
      'href',
      '/certificates/lookup?code=SE-CERT-2026-5F1ACC08',
    );
  });
});
