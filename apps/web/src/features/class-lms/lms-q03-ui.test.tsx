import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { UnifiedGradebookPanel } from './UnifiedGradebookPanel';
import type { UnifiedClassResults } from './lms-local-api';

const baseUnified: UnifiedClassResults = {
  class: {
    id: 'class-1',
    code: 'W01-1',
    name: 'Lớp TOEIC Sáng',
    courseId: 'course-1',
    courseTitle: 'TOEIC 500+',
  },
  editable: false,
  activityColumns: [
    {
      activityId: 'act-q1',
      sectionId: 'sec-1',
      sectionTitle: 'Tuần 1',
      sectionOrder: 0,
      orderIndex: 0,
      title: 'Kiểm tra thường kỳ 1',
      baseType: 'LESSON',
      localKind: 'LOCAL_QUIZ',
      assessmentKind: 'REGULAR',
      kindLabel: 'Kiểm tra thường kỳ',
      state: 'PUBLISHED',
      availableFrom: null,
      availableUntil: null,
      maxScore: 10,
      passScore: 5,
      releaseMode: 'INSTRUCTOR_PUBLISH',
    },
    {
      activityId: 'act-a1',
      sectionId: 'sec-1',
      sectionTitle: 'Tuần 1',
      sectionOrder: 0,
      orderIndex: 1,
      title: 'Bài tập 1',
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
  ],
  studentRows: [
    {
      enrollmentId: 'enr-1',
      learnerId: 'stu-1',
      fullName: 'Nguyễn Văn A',
      email: 'student@gmail.com',
      assignments: {
        'act-a1': {
          activityId: 'act-a1',
          submissionId: 'sub-1',
          submissionState: 'SUBMITTED',
          submittedAt: '2026-11-14T08:00:00Z',
          score: 9,
          maxScore: 10,
          gradeState: 'PUBLISHED',
          gradeSource: 'LOCAL_DIRECT',
          feedback: 'Tốt',
          gradedAt: '2026-11-14T09:00:00Z',
        },
      },
      quizzes: {
        'act-q1': {
          activityId: 'act-q1',
          assessmentKind: 'REGULAR',
          attemptCount: 1,
          latestAttemptId: 'att-1',
          attemptStatus: 'SUBMITTED',
          submittedAt: '2026-11-14T09:10:00Z',
          gradingStatus: 'PENDING_MANUAL_GRADE',
          gradePublished: false,
          score: null,
          maxScore: 10,
          passScore: 5,
          passed: null,
          teacherFeedback: '',
          gradedAt: null,
        },
      },
      attendance: {},
      stats: {
        submittedAssignments: 1,
        publishedAssignmentGrades: 1,
        submittedQuizzes: 1,
        publishedQuizGrades: 0,
        attendancePresentCount: 0,
        attendanceLateCount: 0,
        attendanceTotalCount: 0,
        completedActivitiesCount: 2,
      },
    },
  ],
  formalAssessments: [],
  draftCoreQuizCount: 12,
  summary: {
    totalActivities: 2,
    publishedActivities: 2,
    assignmentsCount: 1,
    quizzesCount: 0,
    regularExamCount: 1,
    midtermCount: 0,
    finalCount: 0,
    attendanceCount: 0,
    awaitingAssignmentGrades: 0,
    awaitingManualQuizGrades: 1,
    formalAssessmentCount: 0,
    draftCoreQuizCount: 12,
  },
  policyNotes: ['CHƯA CHỐT #5'],
};

describe('UnifiedGradebookPanel', () => {
  it('shows published assignment score while holding back unpublished quiz essay grade', () => {
    render(
      <MemoryRouter>
        <UnifiedGradebookPanel classId="class-1" unified={baseUnified} />
      </MemoryRouter>,
    );

    expect(screen.getByText('Kiểm tra thường kỳ 1')).toBeInTheDocument();
    expect(screen.getByText('Chờ GV chấm tự luận')).toBeInTheDocument();
    expect(screen.getByText(/9\s*\/\s*10/)).toBeInTheDocument();
    expect(screen.getByText(/12 đầu mục Quiz hệ thống ở trạng thái nháp/i)).toBeInTheDocument();
  });
});
