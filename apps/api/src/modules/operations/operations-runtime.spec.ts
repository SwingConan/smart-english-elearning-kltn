import { OperationsRuntimeService } from './operations-runtime.service';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { ClassLmsService } from '../class-lms/class-lms.service';

describe('Operations API integration boundary', () => {
  function setup(role: string) {
    const tx = { $queryRaw: jest.fn().mockResolvedValue([]) };
    const db = {
      $transaction: jest.fn().mockImplementation((fn: (t: unknown) => unknown) => fn(tx)),
    };
    const lms = { context: jest.fn().mockResolvedValue({ id: 'server-owner', role }) };
    return {
      lms,
      service: new OperationsRuntimeService(
        db as unknown as PrismaService,
        lms as unknown as ClassLmsService,
      ),
    };
  }
  it.each([
    'STUDENT',
    'INSTRUCTOR',
    'COUNSELOR',
    'ACADEMIC_MANAGER',
    'CASHIER',
    'TEACHING_INSPECTOR',
    'SYSTEM_ADMIN',
  ])('reports actual integration gaps for %s without granting authority', async (role) => {
    const e = setup(role),
      result = await e.service.readiness({ id: 'server-owner', sessionId: 's' });
    expect(result.viewerId).toBe('server-owner');
    expect(result.role).toBe(role);
    expect(result.runtimeAuthorized).toBe(false);
    expect(result.health).toBe('UNKNOWN');
    expect(result.exportAvailable).toBe(false);
    expect(result.publicationAvailable).toBe(false);
    expect(result.missingCapabilities).toContain('report.view');
    expect(result.sources.find((s) => s.domain === 'W05B_CONSULTATION')?.state).toBe('UNVERIFIED');
    expect(result.sources.find((s) => s.domain === 'W09_CERTIFICATE')?.state).toBe('UNAVAILABLE');
  });
  it('denies legacy coordinator and never maps accounts.manage to export', async () => {
    await expect(
      setup('ADMIN_COORDINATOR').service.readiness({ id: 'x', sessionId: 's' }),
    ).rejects.toThrow();
    await expect(
      setup('SYSTEM_ADMIN').service.unavailableAction({ id: 'x', sessionId: 's' }),
    ).rejects.toThrow('Approved capability scopes');
  });
  it('denies revoked sessions without returning a cached source view', async () => {
    const e = setup('STUDENT');
    e.lms.context.mockRejectedValue(new Error('SESSION_REVOKED'));
    await expect(e.service.readiness({ id: 'x', sessionId: 's' })).rejects.toThrow(
      'SESSION_REVOKED',
    );
  });
});
