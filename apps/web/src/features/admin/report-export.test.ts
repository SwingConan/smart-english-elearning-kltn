import { describe, expect, it } from 'vitest';
import { adminReportCsvFilename, serializeAdminReportCsv } from './report-export';
import type { AdminSystemReport } from './types';

const report: AdminSystemReport = {
  generatedAt: '2026-10-23T05:00:00.000Z',
  snapshot: {
    accounts: {
      total: 4,
      byRole: { STUDENT: 2, INSTRUCTOR: 1, ADMIN_COORDINATOR: 1 },
      byStatus: { ACTIVE: 2, INACTIVE: 1, LOCKED: 1 },
    },
    courses: { total: 2, published: 1, draft: 1 },
    classes: {
      total: 3,
      byStatus: { DRAFT: 1, OPEN: 1, IN_PROGRESS: 1, COMPLETED: 0, CANCELLED: 0 },
      draftReadiness: { ready: 0, notReady: 1 },
      openRegistration: { AVAILABLE: 1, FULL: 0, UPCOMING: 0, CLOSED: 0 },
    },
    enrollments: {
      total: 3,
      byStatus: { ACTIVE: 2, PENDING_PAYMENT: 1, COMPLETED: 0, DROPPED: 0, CANCELLED: 0 },
    },
  },
  attention: { draftNotReady: 1, openFull: 0, pendingPayment: 1 },
  activity: {
    period: { from: '2026-10-21', to: '2026-10-23', days: 3, timeZone: 'Asia/Ho_Chi_Minh' },
    totals: { newEnrollments: 1, submittedAssessments: 2, lessonCompletions: 3 },
    daily: [
      { date: '2026-10-21', newEnrollments: 0, submittedAssessments: 0, lessonCompletions: 0 },
      { date: '2026-10-22', newEnrollments: 1, submittedAssessments: 0, lessonCompletions: 1 },
      { date: '2026-10-23', newEnrollments: 0, submittedAssessments: 2, lessonCompletions: 2 },
    ],
  },
};

describe('admin report CSV export', () => {
  it('exports metadata, current snapshot, attention, and every daily activity row', () => {
    const csv = serializeAdminReportCsv(report);

    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('generatedAt,2026-10-23T05:00:00.000Z');
    expect(csv).toContain('from,2026-10-21');
    expect(csv).toContain('timezone,Asia/Ho_Chi_Minh');
    expect(csv).toContain('Tài khoản,Học viên,2');
    expect(csv).toContain('Vòng đời lớp học,DRAFT,1');
    expect(csv).toContain('Trạng thái ghi danh,PENDING_PAYMENT,1');
    expect(csv).toContain('Cần chú ý,DRAFT chưa sẵn sàng,1');
    expect(csv).toContain('2026-10-21,0,0,0');
    expect(csv).toContain('2026-10-22,1,0,1');
    expect(csv).toContain('2026-10-23,0,2,2');
  });

  it('uses a resolved-period filename and excludes sensitive or invented fields', () => {
    const csv = serializeAdminReportCsv(report);

    expect(adminReportCsvFilename(report)).toBe('system-report-2026-10-21-to-2026-10-23.csv');
    for (const forbidden of [
      'passwordHash',
      'meetingUrl',
      'storageKey',
      'session',
      'revenue',
      'paymentSuccess',
    ]) {
      expect(csv).not.toContain(forbidden);
    }
  });
});
