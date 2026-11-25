import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { resolve } from 'node:path';
import { AuthorizationService } from '../authorization/authorization.service';
import { ClassLmsService } from '../class-lms/class-lms.service';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { OperationsRuntimeService } from '../operations/operations-runtime.service';
import { SupportService } from './support.service';

const DEMO_DB = 'v2_wave01_dev_test_w04b_br136_demo_20261111_42db33';

function createQueryRawMock(overrides: { hasEsc?: boolean; hasOpenEsc?: boolean } = {}) {
  return jest.fn().mockImplementation((strings: TemplateStringsArray) => {
    const sql = strings.join(' ');
    if (sql.includes('current_database()')) {
      return Promise.resolve([
        {
          db: DEMO_DB,
          usr: 'wave01',
          schema: 'public',
          dir: resolve('.local-storage/v2-wave01/postgres'),
          host: '127.0.0.1',
          port: 55401,
          marker: 'SMART_ENGLISH_DISPOSABLE_E2E_V1',
        },
      ]);
    }
    if (sql.includes('user_sessions')) {
      return Promise.resolve([{ sid: 'sess-1' }]);
    }
    if (sql.includes('to_regclass')) {
      return Promise.resolve([{ tbl: 'support_technical_escalations' }]);
    }
    if (sql.includes("status IN ('OPEN', 'IN_REVIEW')")) {
      return Promise.resolve(overrides.hasOpenEsc ? [{ id: 'esc-1' }] : []);
    }
    if (sql.includes('FROM support_technical_escalations WHERE ticket_id')) {
      return Promise.resolve(overrides.hasEsc ? [{ id: 'esc-1' }] : []);
    }
    return Promise.resolve([]);
  });
}

describe('Q06 Support & Technical Escalation boundaries', () => {
  const prevUrl = process.env.DATABASE_URL;
  const prevE2eUrl = process.env.E2E_DATABASE_URL;
  const prevW05a = process.env.W05A_ENABLED;
  beforeEach(() => {
    const url = `postgres://wave01:pass@127.0.0.1:55401/${DEMO_DB}`;
    process.env.DATABASE_URL = url;
    process.env.E2E_DATABASE_URL = url;
    process.env.W05A_ENABLED = 'DEV_SUPPORT';
  });
  afterAll(() => {
    process.env.DATABASE_URL = prevUrl;
    process.env.E2E_DATABASE_URL = prevE2eUrl;
    process.env.W05A_ENABLED = prevW05a;
  });

  it('blocks SYSTEM_ADMIN from reading non-escalated ticket detail', async () => {
    const tx = {
      user: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'adm-1',
          role: 'SYSTEM_ADMIN',
          status: 'ACTIVE',
          fullName: 'Quản trị',
          email: 'admin@gmail.com',
        }),
      },
      supportTicket: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'tkt-1',
          reference: 'SE-100',
          title: 'Hỏi lịch học',
          description: 'Mô tả',
          state: 'NEW',
          lockVersion: 1,
          learnerId: 'stu-1',
          ownerId: null,
          topic: { id: 'top-1', code: 'COURSE_CONSULTATION', title: 'Tư vấn', routes: ['ACADEMIC'] },
          learner: { id: 'stu-1', fullName: 'Học viên', email: 'student@gmail.com' },
          guestName: null,
          claimedContact: null,
          contactVerified: true,
          contactBasis: 'SESSION',
          messages: [],
          events: [],
          consents: [],
          referrals: [],
          applications: [],
          attachments: [],
        }),
      },
      $executeRaw: jest.fn().mockResolvedValue(0),
      $queryRaw: createQueryRawMock({ hasEsc: false }),
    };

    const db = {
      $transaction: jest.fn().mockImplementation((fn: (t: unknown) => Promise<unknown>) => fn(tx)),
    };
    const authority = {
      permits: jest.fn().mockResolvedValue(false),
    };
    const svc = new SupportService(
      db as unknown as PrismaService,
      authority as unknown as AuthorizationService,
    );

    await expect(
      svc.detail({ id: 'adm-1', sessionId: 'sess-1' }, 'tkt-1'),
    ).rejects.toThrow(NotFoundException);
  });

  it('prevents closing ticket while technical escalation is OPEN', async () => {
    const tx = {
      user: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'tv-1',
          role: 'COUNSELOR',
          status: 'ACTIVE',
          fullName: 'Tư vấn',
          email: 'counselor@gmail.com',
        }),
      },
      supportTicket: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'tkt-1',
          reference: 'SE-101',
          state: 'WAITING_SPECIALIST',
          lockVersion: 3,
          learnerId: 'stu-1',
          ownerId: 'tv-1',
          topic: { id: 'top-1', code: 'LMS_TECHNICAL_SUPPORT', title: 'Hỗ trợ LMS', routes: ['LEARNING'] },
        }),
      },
      supportRequest: { findUnique: jest.fn().mockResolvedValue(null) },
      supportReferral: { count: jest.fn().mockResolvedValue(0) },
      $executeRaw: jest.fn().mockResolvedValue(0),
      $queryRaw: createQueryRawMock({ hasEsc: true, hasOpenEsc: true }),
    };
    const db = {
      $transaction: jest.fn().mockImplementation((fn: (t: unknown) => Promise<unknown>) => fn(tx)),
    };
    const authority = {
      permits: jest.fn().mockResolvedValue(true),
    };
    const svc = new SupportService(
      db as unknown as PrismaService,
      authority as unknown as AuthorizationService,
    );

    await expect(
      svc.action({ id: 'tv-1', sessionId: 'sess-1' }, 'tkt-1', {
        idempotencyKey: 'k-1',
        expectedLockVersion: 3,
        reason: 'Đóng phiếu khi sự cố kỹ thuật chưa xong',
        action: 'TRANSITION',
        state: 'RESOLVED',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('enforces SYSTEM_ADMIN role on technical escalation queue and returns ticket to IN_PROGRESS upon resolution', async () => {
    const nonAdminLms = { context: jest.fn().mockResolvedValue({ id: 'tv-1', role: 'COUNSELOR' }) };
    const nonAdminDb = {
      $transaction: jest.fn().mockImplementation((fn: (t: unknown) => Promise<unknown>) =>
        fn({ $queryRaw: jest.fn().mockResolvedValue([]) }),
      ),
    };
    const nonAdminOps = new OperationsRuntimeService(
      nonAdminDb as unknown as PrismaService,
      nonAdminLms as unknown as ClassLmsService,
    );
    await expect(
      nonAdminOps.listTechnicalEscalations({ id: 'tv-1', sessionId: 's' }, {}),
    ).rejects.toThrow(ForbiddenException);

    const tx = {
      $queryRaw: jest
        .fn()
        .mockResolvedValue([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: 'esc-1', ticketId: 'tkt-1', status: 'OPEN' }])
        .mockResolvedValueOnce([{ set_config: 'adm-1' }])
        .mockResolvedValueOnce([]),
      $executeRaw: jest.fn().mockResolvedValue(1),
      supportTicket: {
        findUnique: jest.fn().mockResolvedValue({ id: 'tkt-1', state: 'WAITING_SPECIALIST' }),
        update: jest.fn().mockResolvedValue({ id: 'tkt-1', state: 'IN_PROGRESS' }),
      },
      supportReferral: { count: jest.fn().mockResolvedValue(0) },
      supportMessage: { create: jest.fn().mockResolvedValue({ id: 'msg-1' }) },
      supportEvent: { create: jest.fn().mockResolvedValue({ id: 'ev-1' }) },
      domainAuditEvent: { create: jest.fn().mockResolvedValue({ id: 'aud-1' }) },
    };
    const adminDb = {
      $transaction: jest.fn().mockImplementation((fn: (t: unknown) => Promise<unknown>) => fn(tx)),
    };
    const adminLms = { context: jest.fn().mockResolvedValue({ id: 'adm-1', role: 'SYSTEM_ADMIN' }) };
    const adminOps = new OperationsRuntimeService(
      adminDb as unknown as PrismaService,
      adminLms as unknown as ClassLmsService,
    );

    const res = await adminOps.respondTechnicalEscalation(
      { id: 'adm-1', sessionId: 's' },
      '00000000-0000-4000-8000-000000000001',
      {
        status: 'RESOLVED',
        resolutionNote: 'Đã khôi phục quyền truy cập bài tập LMS cho học viên',
        replyToLearner: true,
      },
    );
    expect(res.status).toBe('RESOLVED');
    expect(res.ticketState).toBe('IN_PROGRESS');
    expect(tx.supportTicket.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ state: 'IN_PROGRESS' }),
      }),
    );
    expect(tx.domainAuditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'SUPPORT_TECHNICAL_ESCALATION_RESOLVED',
          objectId: 'tkt-1',
        }),
      }),
    );
  });

  it('rejects COUNSELOR actions on ungranted or expired SUPPORT_TOPIC and rejects STUDENT staff transitions', async () => {
    const expiredGrantTx = {
      $executeRaw: jest.fn().mockResolvedValue(0),
      $queryRaw: createQueryRawMock({ hasEsc: false }),
      supportTicket: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'tkt-2',
          reference: 'SE-200',
          title: 'Hỗ trợ chủ đề khác',
          description: 'Mô tả',
          learnerId: 'hv-1',
          topicId: 'top-expired',
          topic: { id: 'top-expired', code: 'COURSE_CONSULTATION', title: 'Tư vấn', routes: ['ACADEMIC'] },
          learner: { id: 'hv-1', fullName: 'Học viên', email: 'student@gmail.com' },
          state: 'NEW',
          lockVersion: 0,
          ownerId: null,
          messages: [],
          events: [],
          consents: [],
          referrals: [],
          applications: [],
          attachments: [],
        }),
      },
      user: {
        findFirst: jest.fn().mockResolvedValue({ id: 'tv-1', role: 'COUNSELOR', status: 'ACTIVE', fullName: 'TV', email: 'counselor@gmail.com' }),
      },
      supportReferral: { findFirst: jest.fn().mockResolvedValue(null) },
      domainAuditEvent: { create: jest.fn().mockResolvedValue({ id: 'aud-deny' }) },
    };
    const expiredDb = {
      $transaction: jest.fn().mockImplementation((fn: (t: unknown) => Promise<unknown>) => fn(expiredGrantTx)),
    };
    const deniedAuth = { permits: jest.fn().mockResolvedValue(false) };
    const svc = new SupportService(
      expiredDb as unknown as PrismaService,
      deniedAuth as unknown as AuthorizationService,
    );
    await expect(svc.detail({ id: 'tv-1', sessionId: 'sess-1' }, 'tkt-2')).rejects.toThrow(
      NotFoundException,
    );

    const studentTx = {
      $executeRaw: jest.fn().mockResolvedValue(0),
      $queryRaw: createQueryRawMock({ hasEsc: false }),
      supportTicket: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'tkt-2',
          reference: 'SE-202',
          learnerId: 'hv-1',
          ownerId: null,
          topicId: 'top-1',
          topic: { id: 'top-1', code: 'COURSE_CONSULTATION', title: 'Tư vấn', routes: ['ACADEMIC'] },
          state: 'NEW',
          lockVersion: 0,
        }),
      },
      supportRequest: { findUnique: jest.fn().mockResolvedValue(null) },
      user: {
        findFirst: jest.fn().mockResolvedValue({ id: 'hv-1', role: 'STUDENT', status: 'ACTIVE', fullName: 'HV', email: 'student@gmail.com' }),
      },
      domainAuditEvent: { create: jest.fn().mockResolvedValue({ id: 'aud-deny-2' }) },
    };
    const studentDb = {
      $transaction: jest.fn().mockImplementation((fn: (t: unknown) => Promise<unknown>) => fn(studentTx)),
    };
    const studentSvc = new SupportService(
      studentDb as unknown as PrismaService,
      deniedAuth as unknown as AuthorizationService,
    );
    await expect(
      studentSvc.action({ id: 'hv-1', sessionId: 'sess-1' }, 'tkt-2', {
        idempotencyKey: '00000000-0000-4000-8000-000000000002',
        expectedLockVersion: 0,
        reason: 'Học viên tự chuyển trạng thái nhân viên',
        action: 'TRANSITION',
        state: 'IN_PROGRESS',
      }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      studentSvc.action({ id: 'hv-1', sessionId: 'sess-1' }, 'tkt-2', {
        idempotencyKey: '00000000-0000-4000-8000-000000000003',
        expectedLockVersion: 0,
        reason: 'Học viên tự phân công như nhân viên',
        action: 'ASSIGN',
        targetId: 'tv-1',
      }),
    ).rejects.toThrow(ForbiddenException);
  });
});
