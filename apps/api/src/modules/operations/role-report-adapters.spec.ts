import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { RoleReportAdapters } from './role-report-adapters.service';
import { SupportService } from '../support/support.service';
import { AdmissionsFinanceService } from '../admissions-finance/admissions-finance.service';
import { InspectionService } from '../inspection/inspection.service';
import { AuthorizationService } from '../authorization/authorization.service';
import { Prisma } from '../../generated/prisma/client';
describe('guarded role report source integration', () => {
  const actor = { id: 'current-user', sessionId: 'current-session' },
    from = new Date('2026-11-06T17:00:00Z'),
    to = new Date('2026-11-07T17:00:00Z');
  function setup() {
    const support = { reportActivity: jest.fn() },
      finance = { reportActivity: jest.fn() },
      inspection = { reportActivity: jest.fn() },
      authority = { permits: jest.fn().mockResolvedValue(true) };
    const tx = {
      $queryRaw: jest.fn(),
      domainAuditEvent: { findMany: jest.fn().mockResolvedValue([]) },
      teachingSession: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const adapter = new RoleReportAdapters(
      support as unknown as SupportService,
      finance as unknown as AdmissionsFinanceService,
      inspection as unknown as InspectionService,
      authority as unknown as AuthorizationService,
    );
    return {
      support,
      finance,
      inspection,
      authority,
      tx,
      adapter,
      readTx: tx as unknown as Prisma.TransactionClient,
    };
  }
  it('keeps a failed W05A target fence unavailable and never substitutes a direct SQL reader', async () => {
    const e = setup();
    e.support.reportActivity.mockRejectedValue(new ConflictException('SUPPORT_PRIVATE_DEV_ONLY'));
    const rows = await e.adapter.read(e.readTx, actor, 'COUNSELOR', from, to, 'SUPPORT');
    expect(rows[0].state).toBe('UNAVAILABLE');
    expect(rows[0].records).toBeNull();
    expect(e.tx.$queryRaw).not.toHaveBeenCalled();
  });
  it('does not turn expired finance scope into a verified empty balance', async () => {
    const e = setup();
    e.finance.reportActivity.mockResolvedValue(null);
    const rows = await e.adapter.read(e.readTx, actor, 'CASHIER', from, to, 'FINANCE');
    expect(rows[0].reason).toBe('NO_CURRENT_FINANCE_CLASS_SCOPE');
    expect(rows[0].records).toBeNull();
  });
  it('propagates revoked source sessions rather than hiding them as missing content', async () => {
    const e = setup();
    e.inspection.reportActivity.mockRejectedValue(new UnauthorizedException());
    await expect(
      e.adapter.read(e.readTx, actor, 'TEACHING_INSPECTOR', from, to, 'STAFF_SHIFT'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
  it('minimizes W01 audit columns and limits the read to the existing account and grant source', async () => {
    const e = setup();
    await e.adapter.read(e.readTx, actor, 'SYSTEM_ADMIN', from, to, 'AUTHORITY_EVENTS');
    const q = e.tx.domainAuditEvent.findMany.mock.calls[0][0];
    expect(q.where.objectType.in).toEqual(['USER', 'GRANT', 'ROLE_DECISION']);
    expect(q.select).not.toHaveProperty('reason');
    expect(q.select).not.toHaveProperty('actorId');
    expect(q.where.createdAt).toEqual({ gte: from, lt: to });
  });
  it('does not read W01 audit when its existing source authority is absent', async () => {
    const e = setup();
    e.authority.permits.mockResolvedValue(false);
    const rows = await e.adapter.read(
      e.readTx,
      actor,
      'SYSTEM_ADMIN',
      from,
      to,
      'AUTHORITY_EVENTS',
    );
    expect(rows[0].records).toBeNull();
    expect(e.tx.domainAuditEvent.findMany).not.toHaveBeenCalled();
  });
  it('keeps a current database probe out of a historical date window', async () => {
    const e = setup();
    e.tx.$queryRaw.mockResolvedValue([{ at: new Date('2026-11-08T10:00:00Z'), value: 1 }]);
    const rows = await e.adapter.read(e.readTx, actor, 'SYSTEM_ADMIN', from, to, 'RUNTIME_PROBE');
    expect(rows[0].records).toEqual([]);
  });
  it('bounds the instructor calendar query to owned published nonsuperseded metadata', async () => {
    const e = setup();
    await e.adapter.read(e.readTx, actor, 'INSTRUCTOR', from, to, 'TEACHING_CALENDAR');
    expect(e.tx.teachingSession.findMany.mock.calls[0][0].where).toEqual({
      instructorId: actor.id,
      state: 'PUBLISHED',
      intent: 'PUBLISH',
      startsAt: { gte: from, lt: to },
      replacements: { none: { state: 'PUBLISHED' } },
    });
  });
});
