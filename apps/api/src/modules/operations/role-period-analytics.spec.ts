import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuthorizationService } from '../authorization/authorization.service';
import { ClassLmsService } from '../class-lms/class-lms.service';
import { RolePeriodAnalyticsService } from './role-period-analytics.service';

describe('RolePeriodAnalyticsService', () => {
  const originalZone = process.env.REPORT_CENTER_TIME_ZONE;

  beforeEach(() => {
    process.env.REPORT_CENTER_TIME_ZONE = 'Asia/Ho_Chi_Minh';
  });

  afterEach(() => {
    if (originalZone === undefined) delete process.env.REPORT_CENTER_TIME_ZONE;
    else process.env.REPORT_CENTER_TIME_ZONE = originalZone;
  });

  function createHarness(role: string, permitsImpl?: (userId: string, cap: string, scope: { type: string; id?: string }) => boolean) {
    const tx: Record<string, any> = {
      $queryRaw: jest.fn().mockResolvedValue([{ tbl: null }]),
      user: { findMany: jest.fn().mockResolvedValue([]) },
      supportTopic: { findMany: jest.fn().mockResolvedValue([]) },
      supportTicket: { findMany: jest.fn().mockResolvedValue([]) },
      w05BBooking: { findMany: jest.fn().mockResolvedValue([]) },
      classOffering: { findMany: jest.fn().mockResolvedValue([]) },
      enrollment: { findMany: jest.fn().mockResolvedValue([]) },
      teachingSession: { findMany: jest.fn().mockResolvedValue([]) },
      placementHumanEvaluation: { findMany: jest.fn().mockResolvedValue([]) },
      placementResultRelease: { findMany: jest.fn().mockResolvedValue([]) },
      testAttempt: { findMany: jest.fn().mockResolvedValue([]) },
      lessonProgress: { findMany: jest.fn().mockResolvedValue([]) },
      w08Assignment: { findMany: jest.fn().mockResolvedValue([]) },
      w08Segment: { findMany: jest.fn().mockResolvedValue([]) },
      w08Report: { findMany: jest.fn().mockResolvedValue([]) },
      w08Decision: { findMany: jest.fn().mockResolvedValue([]) },
      w08Clock: { findMany: jest.fn().mockResolvedValue([]) },
      w08Correction: { findMany: jest.fn().mockResolvedValue([]) },
      w08CorrectionDecision: { findMany: jest.fn().mockResolvedValue([]) },
      domainAuditEvent: { findMany: jest.fn().mockResolvedValue([]) },
      accountRoleDecision: { findMany: jest.fn().mockResolvedValue([]) },
      permissionGrant: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const db = {
      $transaction: jest.fn(async (work: (t: unknown) => unknown) => work(tx)),
    };
    const lms = {
      context: jest.fn().mockResolvedValue({ id: 'actor-1', fullName: 'Demo User', role }),
      now: jest.fn().mockResolvedValue(new Date('2026-11-16T09:00:00.000Z')),
    };
    const authority = {
      permits: jest.fn(async (u: string, c: string, s: { type: string; id?: string }) =>
        permitsImpl ? permitsImpl(u, c, s) : true,
      ),
    };
    const service = new RolePeriodAnalyticsService(
      db as unknown as PrismaService,
      lms as unknown as ClassLmsService,
      authority as unknown as AuthorizationService,
    );
    return { tx, db, lms, authority, service };
  }

  it('rejects unsupported roles and invalid calendar dates before DB queries', async () => {
    const h = createHarness('CASHIER');
    await expect(h.service.getPeriodReport({ id: 'actor-1' }, { from: '2026-02-30' })).rejects.toThrow(
      BadRequestException,
    );
    expect(h.db.$transaction).not.toHaveBeenCalled();

    await expect(h.service.getPeriodReport({ id: 'actor-1' }, { preset: 'THIS_MONTH' })).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('builds COUNSELOR period report strictly from authorized topics and excludes raw contact PII', async () => {
    const h = createHarness('COUNSELOR', (_u, _c, s) => s.id === 'TUITION');
    h.tx.supportTopic.findMany.mockResolvedValue([
      { id: 't-tuition', code: 'TUITION', title: 'Học phí & Thanh toán' },
      { id: 't-other', code: 'TECH', title: 'Kỹ thuật hệ thống' },
    ]);
    h.tx.supportTicket.findMany.mockResolvedValue([
      {
        id: 'tk-1',
        reference: 'CSKH-001',
        topicId: 't-tuition',
        learnerId: 'u-stu',
        guestName: null,
        description: 'Hỏi về học phí khóa TOEIC 550',
        ownerId: 'u-coun',
        state: 'RESOLVED',
        createdAt: new Date('2026-11-10T02:00:00.000Z'),
        topic: { id: 't-tuition', code: 'TUITION', title: 'Học phí & Thanh toán' },
        messages: [
          { actorId: 'u-coun', visibility: 'PUBLIC', createdAt: new Date('2026-11-10T04:00:00.000Z') },
        ],
        referrals: [{ id: 'ref-1', state: 'RESPONDED', category: 'FINANCE', createdAt: new Date(), respondedAt: new Date() }],
      },
      {
        id: 'tk-2',
        reference: 'CSKH-002',
        topicId: 't-tuition',
        learnerId: null,
        guestName: 'Khách Mai',
        description: 'Cần tư vấn lịch học buổi tối',
        ownerId: null,
        state: 'NEW',
        createdAt: new Date('2026-11-14T03:00:00.000Z'),
        topic: { id: 't-tuition', code: 'TUITION', title: 'Học phí & Thanh toán' },
        messages: [],
        referrals: [],
      },
    ]);
    h.tx.w05BBooking.findMany.mockResolvedValue([
      { id: 'b-1', state: 'CONFIRMED', startsAt: new Date('2026-11-12T10:00:00.000Z'), createdAt: new Date('2026-11-11T05:00:00.000Z'), topic: 'Tư vấn lộ trình', teacherId: 'gv-1' },
    ]);
    h.tx.user.findMany.mockResolvedValue([
      { id: 'u-stu', fullName: 'Nguyễn Minh Khoa' },
      { id: 'u-coun', fullName: 'Võ Hoàng Yến' },
    ]);

    const report = await h.service.getPeriodReport({ id: 'actor-1' }, { preset: 'THIS_MONTH' });

    expect(report.role).toBe('COUNSELOR');
    expect(report.filters.scopeOptions).toEqual([{ id: 't-tuition', label: 'TUITION — Học phí & Thanh toán' }]);
    expect(report.kpis[0].value).toBe(2);
    expect(report.kpis[1].value).toBe('50%');
    expect(report.kpis[2].value).toBe('2h');
    expect(report.breakdown.totals.total).toBe(2);
    expect(report.ledger.rows[0].href).toContain('/workspace/support/tickets/');

    await expect(
      h.service.getPeriodReport({ id: 'actor-1' }, { preset: 'THIS_MONTH', scopeId: 't-other' }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('builds ACADEMIC_MANAGER report requiring class.read global permission and computes metrics accurately', async () => {
    const denied = createHarness('ACADEMIC_MANAGER', () => false);
    await expect(denied.service.getPeriodReport({ id: 'actor-1' }, { preset: 'THIS_MONTH' })).rejects.toThrow(
      ForbiddenException,
    );

    const h = createHarness('ACADEMIC_MANAGER', () => true);
    h.tx.classOffering.findMany.mockResolvedValue([
      {
        id: 'cls-1',
        code: 'SE-550',
        name: 'TOEIC 550 Tối 2-4-6',
        status: 'IN_PROGRESS',
        maxStudents: 20,
        modality: 'ONLINE',
        instructorId: 'gv-1',
      },
    ]);
    h.tx.enrollment.findMany.mockResolvedValue([
      { id: 'enr-1', classOfferingId: 'cls-1', status: 'ACTIVE', enrolledAt: new Date('2026-11-05T03:00:00.000Z') },
    ]);
    h.tx.teachingSession.findMany.mockResolvedValue([
      {
        id: 'ses-1',
        classOfferingId: 'cls-1',
        startsAt: new Date('2026-11-10T12:00:00.000Z'),
        endsAt: new Date('2026-11-10T13:30:00.000Z'),
        state: 'PUBLISHED',
        instructorId: 'gv-1',
      },
    ]);
    h.tx.user.findMany.mockResolvedValue([{ id: 'gv-1', fullName: 'Trần Thu Hà' }]);

    const report = await h.service.getPeriodReport({ id: 'actor-1' }, { preset: 'THIS_MONTH' });
    expect(report.role).toBe('ACADEMIC_MANAGER');
    expect(report.kpis[0].value).toBe('1 lớp');
    expect(report.kpis[1].value).toBe(1);
    expect(report.breakdown.rows[0].seatsSummary).toBe('1/20');
  });

  it('builds INSTRUCTOR and STUDENT scoped reports cleanly without failing when optional local tables are absent', async () => {
    const inst = createHarness('INSTRUCTOR');
    inst.tx.classOffering.findMany.mockResolvedValue([
      { id: 'cls-gv', code: 'GV-101', name: 'TOEIC Speaking', status: 'IN_PROGRESS', maxStudents: 15, modality: 'ONLINE' },
    ]);
    inst.tx.enrollment.findMany.mockResolvedValue([
      { id: 'e-1', classOfferingId: 'cls-gv', status: 'ACTIVE' },
    ]);
    inst.tx.teachingSession.findMany.mockResolvedValue([
      {
        id: 's-1',
        classOfferingId: 'cls-gv',
        startsAt: new Date('2026-11-12T12:00:00.000Z'),
        endsAt: new Date('2026-11-12T14:00:00.000Z'),
        state: 'PUBLISHED',
        modality: 'ONLINE',
      },
    ]);
    const instReport = await inst.service.getPeriodReport({ id: 'actor-1' }, { preset: 'THIS_MONTH' });
    expect(instReport.role).toBe('INSTRUCTOR');
    expect(instReport.kpis[0].value).toBe('1 buổi');
    expect(instReport.breakdown.totals.hours).toBe(2);

    const stu = createHarness('STUDENT');
    stu.tx.enrollment.findMany.mockResolvedValue([
      {
        id: 'enr-stu',
        classOfferingId: 'cls-stu',
        status: 'ACTIVE',
        classOffering: { id: 'cls-stu', code: 'HV-101', name: 'TOEIC 450+', status: 'OPEN', modality: 'ONLINE' },
      },
    ]);
    stu.tx.lessonProgress.findMany.mockResolvedValue([
      { id: 'lp-1', enrollmentId: 'enr-stu', status: 'COMPLETED', updatedAt: new Date('2026-11-13T04:00:00.000Z'), completedAt: new Date() },
    ]);
    const stuReport = await stu.service.getPeriodReport({ id: 'actor-1' }, { preset: 'THIS_MONTH' });
    expect(stuReport.role).toBe('STUDENT');
    expect(stuReport.kpis[0].value).toBe(1);
    expect(stuReport.kpis[3].value).toBe('1 bài học');
  });

  it('builds TEACHING_INSPECTOR period report strictly from own W08 shifts, segments, reports and clocks', async () => {
    const h = createHarness('TEACHING_INSPECTOR');
    h.tx.w08Assignment.findMany
      .mockResolvedValueOnce([{ classId: 'cls-insp' }])
      .mockResolvedValueOnce([
        {
          id: 'a-1',
          classId: 'cls-insp',
          state: 'ACKNOWLEDGED',
          startsAt: new Date('2026-11-14T06:00:00.000Z'),
          endsAt: new Date('2026-11-14T08:00:00.000Z'),
        },
        {
          id: 'a-2',
          classId: 'cls-insp',
          state: 'INVALIDATED',
          startsAt: new Date('2026-11-15T06:00:00.000Z'),
          endsAt: new Date('2026-11-15T08:00:00.000Z'),
        },
      ]);
    h.tx.classOffering.findMany.mockResolvedValue([
      { id: 'cls-insp', code: 'SE-550', name: 'TOEIC 550 Buổi tối' },
    ]);
    h.tx.w08Segment.findMany.mockResolvedValue([
      {
        assignmentId: 'a-1',
        startedAt: new Date('2026-11-14T06:10:00.000Z'),
        stoppedAt: new Date('2026-11-14T07:10:00.000Z'),
      },
    ]);
    h.tx.w08Report.findMany.mockResolvedValue([
      { assignmentId: 'a-1', presence: 'PRESENT', createdAt: new Date('2026-11-14T07:12:00.000Z') },
    ]);
    h.tx.w08Decision.findMany.mockResolvedValue([
      { assignmentId: 'a-1', disposition: 'APPROVE', approvedSeconds: 3600 },
    ]);
    h.tx.w08Clock.findMany.mockResolvedValue([
      { assignmentId: 'a-1', kind: 'IN', createdAt: new Date('2026-11-14T06:09:00.000Z') },
      { assignmentId: 'a-1', kind: 'OUT', createdAt: new Date('2026-11-14T07:11:00.000Z') },
    ]);

    const rep = await h.service.getPeriodReport({ id: 'actor-1' }, { preset: 'THIS_MONTH' });
    expect(rep.role).toBe('TEACHING_INSPECTOR');
    expect(rep.kpis[0].value).toBe(1);
    expect(rep.kpis[1].value).toBe('1/1');
    expect(rep.kpis[2].value).toBe('1 giờ');
    expect(rep.kpis[3].value).toBe('2 lượt');
    expect(rep.breakdown.totals.invalidatedCount).toBe(1);
    expect(rep.ledger.rows[0].href).toBe('/workspace/inspection?assignment=a-1&date=2026-11-14');
  });

  it('builds SYSTEM_ADMIN period report with redacted audit reasons, RBAC summary and zero secret leaks', async () => {
    const h = createHarness('SYSTEM_ADMIN');
    h.tx.user.findMany
      .mockResolvedValueOnce([{ id: 'actor-1', fullName: 'Quản trị Smart English' }])
      .mockResolvedValueOnce([
        { id: 'u-1', role: 'SYSTEM_ADMIN', status: 'ACTIVE', createdAt: new Date('2026-11-10T01:00:00.000Z') },
        { id: 'u-2', role: 'STUDENT', status: 'LOCKED', createdAt: new Date('2026-11-14T02:00:00.000Z') },
      ])
      .mockResolvedValueOnce([{ id: 'u-1', fullName: 'Quản trị Smart English' }]);
    h.tx.domainAuditEvent.findMany.mockResolvedValue([
      {
        id: 'ev-1',
        actorId: 'u-1',
        action: 'ACCOUNT_STATUS',
        objectType: 'USER',
        objectId: 'u-2',
        decision: 'ALLOW',
        reason: 'Kiểm tra token=supersecret123 không được lộ ra báo cáo',
        createdAt: new Date('2026-11-14T04:00:00.000Z'),
      },
      {
        id: 'ev-2',
        actorId: 'u-1',
        action: 'CONFIG_CHANGE_PROPOSED',
        objectType: 'SYSTEM_CONFIG',
        objectId: 'EMAIL_PROVIDER',
        decision: 'PENDING_OPERATOR_REVIEW',
        reason: 'Đề nghị bật SMTP chính thức',
        createdAt: new Date('2026-11-15T04:00:00.000Z'),
      },
    ]);
    h.tx.permissionGrant.findMany.mockResolvedValue([
      {
        id: 'g-1',
        userId: 'u-1',
        capability: 'authority.approve',
        scopeType: 'GLOBAL',
        approvedBy: 'u-other',
        revokedAt: null,
        expiresAt: new Date('2027-01-01T00:00:00.000Z'),
        createdAt: new Date('2026-11-10T01:00:00.000Z'),
      },
    ]);

    const rep = await h.service.getPeriodReport({ id: 'u-1' }, { preset: 'THIS_MONTH' });
    expect(rep.role).toBe('SYSTEM_ADMIN');
    expect(rep.kpis[0].value).toBe(2);
    expect(rep.kpis[1].value).toBe('1/2');
    expect(JSON.stringify(rep)).not.toContain('supersecret123');
    expect(rep.ledger.rows[0].summary).toContain('***ĐÃ CHE***');
  });
});
