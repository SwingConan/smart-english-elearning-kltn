import { CompletionReadinessService } from './completion-readiness.service';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { ClassLmsService } from '../class-lms/class-lms.service';

describe('Completion owner readiness boundary', () => {
  function setup(role = 'STUDENT') {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      enrollment: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'e',
            classOffering: { id: 'c', code: 'A', name: 'Class', versionId: null },
          },
        ]),
      },
    };
    const db = {
      $transaction: jest.fn().mockImplementation((fn: (t: unknown) => unknown) => fn(tx)),
    };
    const lms = { context: jest.fn().mockResolvedValue({ id: 'owner', role }) };
    return {
      tx,
      lms,
      service: new CompletionReadinessService(
        db as unknown as PrismaService,
        lms as unknown as ClassLmsService,
      ),
    };
  }
  it('returns only owned ACTIVE class bindings, never an inferred certificate or zero', async () => {
    const e = setup(),
      result = await e.service.read({ id: 'owner', sessionId: 's' });
    expect(e.tx.enrollment.findMany.mock.calls[0][0].where).toEqual({
      learnerId: 'owner',
      status: 'ACTIVE',
    });
    expect(result.assessment).toBe('PENDING_POLICY');
    expect(result.certificates).toBeNull();
    expect(result.issuanceAvailable).toBe(false);
    expect(result.certificateRecordsVerified).toBe(false);
    expect(result.enrollments[0].assessment).toBe('NOT_EVALUATED');
  });
  it.each([
    'INSTRUCTOR',
    'ACADEMIC_MANAGER',
    'SYSTEM_ADMIN',
    'COUNSELOR',
    'CASHIER',
    'TEACHING_INSPECTOR',
    'ADMIN_COORDINATOR',
  ])('does not inherit owner certificate access for %s', async (role) => {
    const e = setup(role);
    await expect(e.service.read({ id: 'staff', sessionId: 's' })).rejects.toThrow();
    expect(e.tx.enrollment.findMany).not.toHaveBeenCalled();
  });
  it('propagates invalid/revoked session denial before source access', async () => {
    const e = setup();
    e.lms.context.mockRejectedValue(new Error('DENIED'));
    await expect(e.service.read({ id: 'owner', sessionId: 'revoked' })).rejects.toThrow('DENIED');
    expect(e.tx.enrollment.findMany).not.toHaveBeenCalled();
  });
});
