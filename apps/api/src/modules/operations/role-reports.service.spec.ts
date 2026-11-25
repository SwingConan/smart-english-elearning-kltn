import { RoleReportAdapters } from './role-report-adapters.service';
import { RoleReportsService } from './role-reports.service';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { ClassLmsService } from '../class-lms/class-lms.service';
import { AuthorizationService } from '../authorization/authorization.service';
describe('source-only role report boundary', () => {
  const originalZone = process.env.REPORT_CENTER_TIME_ZONE;
  beforeEach(() => {
    process.env.REPORT_CENTER_TIME_ZONE = 'Asia/Ho_Chi_Minh';
  });
  afterEach(() => {
    if (originalZone === undefined) delete process.env.REPORT_CENTER_TIME_ZONE;
    else process.env.REPORT_CENTER_TIME_ZONE = originalZone;
  });
  function setup(role = 'CASHIER') {
    const tx = { $queryRaw: jest.fn(), user: { findMany: jest.fn() } };
    const db = { $transaction: jest.fn(async (work: (t: unknown) => unknown) => work(tx)) };
    const lms = {
      context: jest.fn().mockResolvedValue({ id: 'owner', role }),
      now: jest.fn().mockResolvedValue(new Date('2026-11-07T09:00:00Z')),
    };
    const authority = { permits: jest.fn().mockResolvedValue(false) };
    return {
      tx,
      db,
      lms,
      authority,
      service: new RoleReportsService(
        db as unknown as PrismaService,
        lms as unknown as ClassLmsService,
        authority as unknown as AuthorizationService,
        { read: jest.fn().mockResolvedValue([]) } as unknown as RoleReportAdapters,
      ),
    };
  }
  it('uses configured center midnight across a year boundary, without inventing metrics for missing finance', async () => {
    const e = setup();
    const r = await e.service.view({ id: 'owner', sessionId: 's' }, { date: '2026-01-01' });
    expect(r.window.startAt).toBe('2025-12-31T17:00:00.000Z');
    expect(r.window.endExclusive).toBe('2026-01-01T17:00:00.000Z');
    expect(r.sources[0].records).toBeNull();
    expect(r.metrics.value).toBeNull();
    expect(r.formalReportAuthorized).toBe(false);
    expect(r.csv.available).toBe(false);
  });
  it('rejects nonexistent calendar dates before any database access', async () => {
    const e = setup();
    expect(() => e.service.view({ id: 'owner', sessionId: 's' }, { date: '2026-02-30' })).toThrow();
    expect(e.db.$transaction).not.toHaveBeenCalled();
  });
  it('requires explicit center timezone rather than the host timezone', () => {
    delete process.env.REPORT_CENTER_TIME_ZONE;
    const e = setup();
    expect(() => e.service.view({ id: 'owner', sessionId: 's' }, { date: '2026-11-07' })).toThrow();
    expect(e.db.$transaction).not.toHaveBeenCalled();
  });
  it('denies foreign role sources before reading source rows', async () => {
    const e = setup();
    await expect(
      e.service.view({ id: 'owner', sessionId: 's' }, { date: '2026-11-07', source: 'ACCOUNTS' }),
    ).rejects.toThrow('Source outside current role projection');
    expect(e.tx.user.findMany).not.toHaveBeenCalled();
  });
  it('does not read account rows when current source authority is absent', async () => {
    const e = setup('SYSTEM_ADMIN');
    const r = await e.service.view({ id: 'owner', sessionId: 's' }, { date: '2026-11-07' });
    expect(r.sources.find((s) => s.code === 'ACCOUNTS')?.records).toBeNull();
    expect(e.tx.user.findMany).not.toHaveBeenCalled();
  });
  it('rechecks the same filters at export and cannot upgrade source authority to CSV', async () => {
    const e = setup(),
      query = { date: '2026-11-07', source: 'FINANCE' as const };
    const view = jest.spyOn(e.service, 'view');
    await expect(e.service.export({ id: 'owner', sessionId: 's' }, query)).rejects.toThrow(
      'CSV chưa có quyền',
    );
    expect(view).toHaveBeenCalledWith({ id: 'owner', sessionId: 's' }, query);
  });
  it('does not return cached rows after current session revocation', async () => {
    const e = setup();
    e.lms.context.mockRejectedValue(new Error('SESSION_REVOKED'));
    await expect(
      e.service.view({ id: 'owner', sessionId: 's' }, { date: '2026-11-07' }),
    ).rejects.toThrow('SESSION_REVOKED');
    expect(e.tx.user.findMany).not.toHaveBeenCalled();
  });
});
