import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { CertificatesWorkspaceService } from './certificates-workspace.service';
import type { PrismaService } from '../../infrastructure/prisma/prisma.service';

describe('Q05 CertificatesWorkspaceService governance & unified evidence', () => {
  const prevW09 = process.env.W09_ENABLED;
  const prevNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    process.env.W09_ENABLED = 'DEV_W09';
    process.env.NODE_ENV = 'test';
  });

  afterEach(() => {
    if (prevW09 === undefined) delete process.env.W09_ENABLED;
    else process.env.W09_ENABLED = prevW09;
    process.env.NODE_ENV = prevNodeEnv;
  });

  function makePrismaMock() {
    const queryRaw = jest.fn();
    const executeRaw = jest.fn().mockResolvedValue(1);
    const prisma = {
      user: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'hvu-1',
          role: 'ACADEMIC_MANAGER',
          fullName: 'HVU One',
          email: 'hvu1@example.invalid',
        }),
      },
      enrollment: {
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      assignmentGrade: { findMany: jest.fn().mockResolvedValue([]) },
      testAttempt: { findMany: jest.fn().mockResolvedValue([]) },
      teachingSession: { findMany: jest.fn().mockResolvedValue([]) },
      $queryRaw: queryRaw,
      $executeRaw: executeRaw,
    };
    return {
      prisma: prisma as unknown as PrismaService,
      raw: prisma,
      queryRaw,
      executeRaw,
    };
  }

  it('rejects policy creation without explicit thresholds instead of silently defaulting to 50/80', async () => {
    const { prisma, queryRaw } = makePrismaMock();
    queryRaw.mockResolvedValueOnce([{ id: 'grant-1' }]); // scoped HVU grant
    const service = new CertificatesWorkspaceService(prisma);

    await expect(
      service.createPolicy('hvu-1', {
        courseId: '11111111-1111-4111-8111-111111111111',
        code: 'POL-NO-DEFAULT',
        title: 'Chính sách thiếu ngưỡng',
        description: 'Kiểm tra hệ thống không tự gán ngưỡng 50 hoặc 80 mặc định.',
        isTestPolicy: true,
        reason: 'Kiểm tra validation Q05 không cho phép bỏ trống ngưỡng.',
        criteria: [
          {
            criterionId: 'CRIT_W03_GRADE',
            domain: 'W03_GRADE',
            label: 'Điểm tổng hợp',
            required: true,
          },
        ],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects weighted policy when weights do not sum to 100 and SCORE_10 > 10', async () => {
    const { prisma, queryRaw } = makePrismaMock();
    queryRaw.mockResolvedValue([{ id: 'grant-1' }]);
    const service = new CertificatesWorkspaceService(prisma);

    await expect(
      service.createPolicy('hvu-1', {
        courseId: '11111111-1111-4111-8111-111111111111',
        code: 'POL-BAD-WEIGHT',
        title: 'Sai tổng tỷ trọng',
        description: 'Tổng tỷ trọng các thành phần phải bằng 100%.',
        isTestPolicy: true,
        reason: 'Kiểm tra ràng buộc tổng tỷ trọng thành phần.',
        criteria: [
          {
            criterionId: 'CRIT_WEIGHT',
            domain: 'W03_GRADE',
            label: 'Điểm tổng kết',
            required: true,
            component: 'WEIGHTED_TOTAL',
            scale: 'PERCENT_100',
            minNumericValue: 65,
            weightedComponents: [
              { component: 'REGULAR', weightPercent: 30 },
              { component: 'FINAL', weightPercent: 40 },
            ],
          },
        ],
      }),
    ).rejects.toThrow(BadRequestException);

    await expect(
      service.createPolicy('hvu-1', {
        courseId: '11111111-1111-4111-8111-111111111111',
        code: 'POL-BAD-SCALE',
        title: 'Sai thang điểm 10',
        description: 'Thang 10 không thể vượt quá 10.',
        isTestPolicy: true,
        reason: 'Kiểm tra ràng buộc thang điểm 10.',
        criteria: [
          {
            criterionId: 'CRIT_10',
            domain: 'W03_GRADE',
            label: 'Thường kỳ',
            required: true,
            component: 'REGULAR',
            scale: 'SCORE_10',
            minNumericValue: 12,
          },
        ],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('blocks updating an already APPROVED policy with RETROACTIVE_POLICY_CHANGE_BLOCKED', async () => {
    const { prisma, queryRaw } = makePrismaMock();
    queryRaw
      .mockResolvedValueOnce([
        {
          id: 'pol-1',
          courseId: 'course-1',
          classOfferingId: null,
          code: 'POL-APPROVED',
          state: 'APPROVED',
          makerId: 'hvu-1',
          isTestPolicy: false,
        },
      ])
      .mockResolvedValueOnce([{ id: 'grant-1' }]);
    const service = new CertificatesWorkspaceService(prisma);

    await expect(
      service.updateDraftPolicy('hvu-1', 'pol-1', {
        reason: 'Cố gắng sửa hồi tố chính sách đã duyệt.',
        criteria: [
          {
            criterionId: 'CRIT_W07',
            domain: 'W07_ENTITLEMENT',
            label: 'Ghi danh',
            required: true,
          },
        ],
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('allows HVU Student Affairs owner to approve their own DRAFT policy directly', async () => {
    const { prisma, queryRaw } = makePrismaMock();
    queryRaw
      .mockResolvedValueOnce([
        {
          id: 'pol-draft',
          courseId: 'course-1',
          classOfferingId: null,
          state: 'DRAFT',
          makerId: 'hvu-1',
          isTestPolicy: true,
        },
      ])
      .mockResolvedValueOnce([{ id: 'grant-1' }])
      .mockResolvedValueOnce([
        {
          id: 'pol-draft',
          state: 'APPROVED',
          makerId: 'hvu-1',
          reviewerId: 'hvu-1',
        },
      ]);
    const service = new CertificatesWorkspaceService(prisma);

    const updated = await service.reviewPolicy('hvu-1', 'pol-draft', {
      decision: 'APPROVED',
      reason: 'Quản lý Học vụ Học viên phê duyệt chính sách mình vừa soạn.',
    });
    expect(updated.state).toBe('APPROVED');
    expect(updated.reviewerId).toBe('hvu-1');
  });

  it('evaluates real unified lms_local_* data and returns CHƯA ĐỦ DỮ LIỆU when MIDTERM is missing without treating it as 0', async () => {
    const { prisma, raw, queryRaw } = makePrismaMock();
    raw.enrollment.findUnique.mockResolvedValue({
      id: 'enr-1',
      learnerId: 'stu-1',
      classOfferingId: 'cls-1',
      status: 'ACTIVE',
      learner: { id: 'stu-1', fullName: 'Nguyễn Minh', email: 'student@gmail.com' },
      classOffering: {
        id: 'cls-1',
        code: 'TOEIC-01',
        name: 'Lớp 1',
        courseId: 'course-1',
        versionId: 'cv-1',
        course: { id: 'course-1', title: 'TOEIC 450', level: 'A2', slug: 'toeic' },
      },
    });

    // Order of $queryRaw calls in evaluateEnrollmentInternal:
    // 1. policies, 2. existingCert, 3. localAssignGrades, 4. localQuizAttempts,
    // 5. pendingAssignSubmissions, 6. pendingLocalQuizzes, 7. localOpenAttActivities, 8. localAttRecords, 9. w07Apps
    queryRaw
      .mockResolvedValueOnce([
        {
          id: 'pol-midterm',
          code: 'POL-MIDTERM-TEST',
          version: 1,
          title: 'Yêu cầu Giữa kỳ',
          description: 'Test missing midterm',
          state: 'APPROVED',
          isTestPolicy: true,
          makerId: 'hvu-1',
          reviewerId: 'hvu-2',
          reviewedAt: new Date('2026-11-14T08:00:00Z'),
          criteria: [
            {
              criterionId: 'CRIT_MIDTERM',
              domain: 'W03_GRADE',
              label: 'Kiểm tra giữa kỳ (MIDTERM)',
              component: 'MIDTERM',
              scale: 'PERCENT_100',
              required: true,
              minNumericValue: 60,
            },
            {
              criterionId: 'CRIT_ATT',
              domain: 'W06_ATTENDANCE',
              label: 'Chuyên cần',
              scale: 'PERCENT_100',
              required: true,
              minNumericValue: 70,
            },
            {
              criterionId: 'CRIT_W07',
              domain: 'W07_ENTITLEMENT',
              label: 'Ghi danh hợp lệ',
              required: true,
            },
          ],
        },
      ])
      .mockResolvedValueOnce([]) // w09_certificates
      .mockResolvedValueOnce([
        {
          submissionId: 'sub-1',
          activityId: 'act-a1',
          title: 'Assignment 1',
          score: '9',
          maxScore: '10',
          publishedAt: new Date('2026-11-14T07:45:00Z'),
        },
      ]) // lms_local_assignment_grades
      .mockResolvedValueOnce([
        {
          id: 'qa-1',
          activityId: 'act-q1',
          title: 'Regular 1',
          assessmentKind: 'REGULAR',
          totalScore: '4',
          autoScore: '4',
          manualScore: '0',
          maxScore: '4',
          publishedAt: new Date('2026-11-14T07:50:00Z'),
        },
      ]) // lms_local_quiz_attempts (only REGULAR, no MIDTERM!)
      .mockResolvedValueOnce([{ cnt: 0 }]) // pendingAssignSubmissions
      .mockResolvedValueOnce([]) // pendingLocalQuizzes
      .mockResolvedValueOnce([{ activityId: 'att-1' }, { activityId: 'att-2' }]) // localOpenAttActivities
      .mockResolvedValueOnce([
        { id: 'ar-1', activityId: 'att-1', status: 'PRESENT' },
        { id: 'ar-2', activityId: 'att-2', status: 'PRESENT' },
      ]) // localAttRecords (2/2 = 100%)
      .mockResolvedValueOnce([{ id: 'app-1', state: 'ENROLLED' }]); // w07_applications

    const service = new CertificatesWorkspaceService(prisma);
    const result = await service.evaluateEnrollmentInternal('enr-1');

    expect(result.status).toBe('PENDING_EVIDENCE');
    expect(result.statusLabel).toBe('CHƯA ĐỦ DỮ LIỆU');
    expect(result.evidenceSummary?.w06.attendanceRatePercent).toBe(100);
    expect(result.evidenceSummary?.w03.componentAverages.ASSIGNMENT).toBe(90);
    expect(result.evidenceSummary?.w03.componentAverages.REGULAR).toBe(100);
    expect(result.evidenceSummary?.w03.componentAverages.MIDTERM).toBeNull();
    expect(result.missingEvidence.join(' ')).toContain('MIDTERM');
    const midtermCrit = result.evaluation?.criteria.find((c: any) => c.criterionId === 'CRIT_MIDTERM');
    expect(midtermCrit?.status).toBe('PENDING');
    expect(midtermCrit?.observedNumericValue).toBeNull();
    const attCrit = result.evaluation?.criteria.find((c: any) => c.criterionId === 'CRIT_ATT');
    expect(attCrit?.status).toBe('SATISFIED');
    expect(attCrit?.observedNumericValue).toBe(100);
  });
});
