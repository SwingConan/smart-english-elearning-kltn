import { describe, expect, it } from 'vitest';
import { adminReportCsvFilename, serializeAdminReportCsv } from './report-export';
import type { AdminSystemReport } from './types';

const report: AdminSystemReport = {
  generatedAt: '2026-10-23T05:00:00.000Z',
  period: { from: '2026-10-21', to: '2026-10-23', days: 3, timeZone: 'Asia/Ho_Chi_Minh' },
  actionQueues: { draftNotReady: 1, openFull: 1, pendingPayment: 1, gradingBacklog: 2 },
  accounts: {
    total: 4,
    byRole: { STUDENT: 2, INSTRUCTOR: 1, ADMIN_COORDINATOR: 1 },
    byStatus: { ACTIVE: 2, INACTIVE: 1, LOCKED: 1 },
  },
  courses: { total: 2, published: 1, draft: 1 },
  classes: {
    total: 3,
    byStatus: { DRAFT: 1, OPEN: 1, IN_PROGRESS: 1, COMPLETED: 0, CANCELLED: 0 },
    capacity: {
      totalOperationalClasses: 2,
      truncated: false,
      items: [
        {
          id: 'class-1',
          code: 'C1',
          name: 'Lớp 1',
          status: 'OPEN',
          course: { id: 'course-1', title: 'TOEIC nền tảng' },
          instructor: { id: 'instructor-1', fullName: 'Giảng viên A' },
          activeEnrollments: 10,
          maxStudents: 10,
          remainingSeats: 0,
          registrationState: 'FULL',
          operationalReadiness: { isReady: true, missing: [] },
          classStart: '2026-11-01T00:00:00.000Z',
        },
      ],
    },
  },
  enrollmentDemand: {
    totalNewEnrollments: 1,
    byClass: [
      {
        classOfferingId: 'class-1',
        classCode: 'C1',
        className: 'Lớp 1',
        courseId: 'course-1',
        courseTitle: 'TOEIC nền tảng',
        count: 1,
      },
    ],
    daily: [
      { date: '2026-10-21', count: 0 },
      { date: '2026-10-22', count: 1 },
      { date: '2026-10-23', count: 0 },
    ],
  },
};

describe('admin report CSV export', () => {
  it('exports the decision report contract and every enrollment-demand day', () => {
    const csv = serializeAdminReportCsv(report);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('Thời điểm tạo báo cáo,2026-10-23T05:00:00.000Z');
    expect(csv).toContain('Lớp nháp chưa sẵn sàng,1');
    expect(csv).toContain('Bài Speaking/Writing chờ giảng viên duyệt,2');
    expect(csv).toContain('Sĩ số đang học');
    expect(csv).not.toContain('Sĩ số ACTIVE');
    expect(csv).toContain('C1,Lớp 1,TOEIC nền tảng,Giảng viên A,Đang mở,10,10,0,Đã đủ sĩ số');
    expect(csv).toContain('NHU CẦU GHI DANH THEO NGÀY');
    expect(csv).toContain('2026-10-21,0');
    expect(csv).toContain('2026-10-22,1');
    expect(csv).toContain('2026-10-23,0');
  });

  it('uses the resolved-period filename and removes obsolete/private fields', () => {
    const csv = serializeAdminReportCsv(report);
    expect(adminReportCsvFilename(report)).toBe('system-report-2026-10-21-to-2026-10-23.csv');
    for (const forbidden of [
      'passwordHash',
      'meetingUrl',
      'audioStorageKey',
      'textResponse',
      'submittedAssessments',
      'lessonCompletions',
      'Bài đánh giá đã nộp',
      'Bài học hoàn tất',
      'Chi tiết theo ngày',
    ]) {
      expect(csv).not.toContain(forbidden);
    }
  });
});
