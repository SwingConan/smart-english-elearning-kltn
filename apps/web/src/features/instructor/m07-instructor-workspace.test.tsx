import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InstructorClassWorkspaceLayout } from '@/layouts/InstructorClassWorkspaceLayout';
import { InstructorClassOverviewPage } from '@/pages/InstructorClassOverviewPage';
import { InstructorRosterPage } from '@/pages/InstructorRosterPage';
import { InstructorClassResultsPage } from '@/pages/InstructorClassResultsPage';
import { instructorApi } from './api';
import type { InstructorClass, InstructorClassOverview } from './types';

const classroom: InstructorClass = {
  id: 'class-a', code: 'A01', name: 'Lớp TOEIC tối', status: 'IN_PROGRESS', activeLearnerCount: 9,
  course: { id: 'course-a', title: 'TOEIC Workplace', level: 'FOUNDATION' }, scheduleSlots: [],
};
const overview: InstructorClassOverview = {
  classOffering: classroom, activeLearnerCount: 9,
  lessonProgress: { completed: 18, total: 27, percentage: 67 }, pendingGradingCount: 2,
  assessments: [{ id: 'assessment-a', stage: 'MIDTERM', openAt: null, closeAt: null, availability: 'OPEN', test: { id: 'test-a', title: 'Kiểm tra giữa kỳ' } }],
};

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('M07 Instructor class workspace', () => {
  it('renders all six class-centric tabs, selected state and the mobile drawer', async () => {
    vi.spyOn(instructorApi.classes, 'overview').mockResolvedValue(overview);
    render(<MemoryRouter initialEntries={['/instructor/classes/class-a']}><Routes><Route path="/instructor/classes/:classOfferingId" element={<InstructorClassWorkspaceLayout />}><Route index element={<InstructorClassOverviewPage />} /></Route></Routes></MemoryRouter>);
    expect(await screen.findByText('Lớp TOEIC tối')).toBeInTheDocument();
    const nav = screen.getAllByRole('navigation', { name: 'Điều hướng lớp giảng dạy' })[0];
    for (const label of ['Tổng quan', 'Học viên', 'Nội dung', 'Bài kiểm tra', 'Chấm bài', 'Kết quả']) expect(nav).toHaveTextContent(label);
    expect(screen.getAllByRole('link', { name: 'Tổng quan' })[0]).toHaveClass('bg-indigo-600');
    fireEvent.click(screen.getByRole('button', { name: 'Mở điều hướng lớp' }));
    expect(screen.getAllByRole('navigation', { name: 'Điều hướng lớp giảng dạy' })).toHaveLength(2);
  });

  it('filters the read-only roster without exposing membership mutation controls', async () => {
    vi.spyOn(instructorApi.classes, 'learners').mockResolvedValue({ classOffering: classroom, learners: [
      { id: 'enrollment-a', status: 'ACTIVE', enrolledAt: '', learner: { id: 'learner-a', fullName: 'Nguyễn Minh Anh', email: 'minh.anh@test.local' }, completedLessons: 2, totalLessons: 3, progressPercentage: 67, submittedAssessmentCount: 2, pendingGradingCount: 1, latestGradedAssessmentAt: null },
      { id: 'enrollment-b', status: 'ACTIVE', enrolledAt: '', learner: { id: 'learner-b', fullName: 'Trần Gia Bảo', email: 'gia.bao@test.local' }, completedLessons: 1, totalLessons: 3, progressPercentage: 33, submittedAssessmentCount: 1, pendingGradingCount: 0, latestGradedAssessmentAt: null },
    ] });
    render(<MemoryRouter initialEntries={['/instructor/classes/class-a/learners']}><Routes><Route path="/instructor/classes/:classOfferingId/learners" element={<InstructorRosterPage />} /></Routes></MemoryRouter>);
    expect(await screen.findByText('Nguyễn Minh Anh')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: 'Tìm học viên' }), { target: { value: 'bảo' } });
    expect(screen.queryByText('Nguyễn Minh Anh')).not.toBeInTheDocument();
    expect(screen.getByText('Trần Gia Bảo')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /xóa|thêm học viên/i })).not.toBeInTheDocument();
  });

  it('shows truthful submitted, fully graded, pending and FINAL-only sample evidence', async () => {
    vi.spyOn(instructorApi.classes, 'results').mockResolvedValue({ classOffering: classroom, assessments: [{
      id: 'assessment-a', stage: 'MIDTERM', test: { title: 'Kiểm tra giữa kỳ' }, submittedCount: 3, latestAttemptCount: 2,
      fullyGradedCount: 1, pendingGradingCount: 1,
      skillAverages: [{ skill: 'LISTENING', average: 75, sampleCount: 2, excludedCount: 0 }, { skill: 'READING', average: null, sampleCount: 0, excludedCount: 2 }],
      learners: [{ id: 'attempt-a', learner: { fullName: 'Nguyễn Minh Anh', email: 'a@test.local' }, attemptNumber: 2, label: 'Lượt gần nhất', skillScores: [{ skill: 'LISTENING', status: 'FINAL', normalizedScore: 80 }, { skill: 'READING', status: 'PROVISIONAL', normalizedScore: 60 }] }],
    }] });
    render(<MemoryRouter initialEntries={['/instructor/classes/class-a/results']}><Routes><Route path="/instructor/classes/:classOfferingId/results" element={<InstructorClassResultsPage />} /></Routes></MemoryRouter>);
    const summary = await screen.findByText((_content, element) => element?.tagName === 'SECTION' && element.textContent?.includes('3 lượt đã nộp') === true);
    expect(summary).toHaveTextContent('1 học viên đã chấm đủ');
    expect(summary).toHaveTextContent('1 học viên đang chờ chấm');
    expect(screen.getByText((_content, element) => element?.tagName === 'P' && element.textContent === 'Mẫu 0 · loại trừ 2')).toBeInTheDocument();
    expect(screen.getByText('Đang chờ')).toBeInTheDocument();
  });
});
