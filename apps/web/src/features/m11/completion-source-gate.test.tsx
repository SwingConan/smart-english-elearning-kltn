import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { certificateApi, type Readiness } from '@/features/certificates/api';
import { EnrollmentCertificatePage } from '@/pages/CertificatesPage';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('UC25 authoritative achievement flow', () => {
  it('shows real criteria, evaluating state, no early CTA, and success only after issuance', async () => {
    const initial: Readiness = {
      eligible: false,
      unmet: ['ATTENDANCE_UNMARKED', 'FINAL_ASSESSMENT_INCOMPLETE_OR_PENDING'],
      evidence: {
        lesson: { completed: 10, total: 10, percent: 100 },
        attendance: { percent: 90, coverageComplete: false },
        finalAssessment: { satisfied: false },
      },
      policy: {
        minLessonCompletionPercent: 80,
        minAttendancePercent: 80,
        requireFinalAssessment: true,
      },
      completion: null,
    };
    const issued: Readiness = {
      ...initial,
      eligible: true,
      unmet: [],
      evidence: {
        ...initial.evidence,
        attendance: { percent: 90, coverageComplete: true },
        finalAssessment: { satisfied: true },
      },
      completion: {
        certificate: {
          id: 'certificate-1',
          certificateNumber: 'CERT-2026-001',
          learnerNameSnapshot: 'Nguyễn An',
          courseTitleSnapshot: 'TOEIC',
          classNameSnapshot: 'Lớp A',
          classCodeSnapshot: 'A1',
          issuedAt: '2026-10-25T00:00:00Z',
        },
      },
    };
    let resolveEvaluation!: (value: Readiness) => void;
    const evaluation = new Promise<Readiness>((resolve) => {
      resolveEvaluation = resolve;
    });
    vi.spyOn(certificateApi, 'readiness').mockResolvedValue(initial);
    vi.spyOn(certificateApi, 'evaluate').mockReturnValue(evaluation);

    const view = render(
      <MemoryRouter initialEntries={['/student/enrollments/e1/certificate']}>
        <Routes>
          <Route
            path="/student/enrollments/:enrollmentId/certificate"
            element={<EnrollmentCertificatePage />}
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('Bài học')).toBeInTheDocument();
    expect(view.container.querySelectorAll('[data-state="PASS"]')).toHaveLength(1);
    expect(view.container.querySelectorAll('[data-state="PENDING"]')).toHaveLength(2);
    expect(screen.getByText('Vẫn còn buổi học chưa được điểm danh.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'In / tải chứng chỉ' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Kiểm tra điều kiện hoàn thành' }));
    expect(
      screen.getByRole('button', { name: 'Hệ thống đang kiểm tra tiêu chí thực tế…' }),
    ).toBeDisabled();
    expect(screen.queryByRole('link', { name: 'In / tải chứng chỉ' })).not.toBeInTheDocument();

    await act(async () => resolveEvaluation(issued));
    expect(await screen.findByText('Bạn đã hoàn thành khóa học')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'In / tải chứng chỉ' })).toHaveAttribute(
      'href',
      expect.stringContaining('/certificates/certificate-1/download'),
    );
    expect(view.container.querySelectorAll('[data-state="PASS"]')).toHaveLength(3);
  });
});
