import { LearnerFinanceService } from './learner-finance.service';
import type { PrismaService } from '../../infrastructure/prisma/prisma.service';
describe('Learner finance owner reads', () => {
  function setup() {
    const tx = {
      $executeRaw: jest.fn(),
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'owner' }]),
      w07Application: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            {
              id: 'app',
              state: 'APPROVED',
              class: { id: 'c', name: 'Class', code: 'C' },
              amountVnd: 100,
              consentVersion: 'approved',
              createdAt: new Date(),
              w07ObligationApplication: [
                {
                  amountVnd: 100,
                  dueAt: null,
                  w07AllocationObligation: [],
                  w07PaymentEventObligation: [],
                  w07EvidenceObligation: [],
                },
              ],
            },
          ]),
      },
    };
    const db = { $transaction: jest.fn().mockImplementation((fn) => fn(tx)) };
    return { tx, service: new LearnerFinanceService(db as unknown as PrismaService) };
  }
  it('queries only the current owner and retains unpaid amounts without writes', async () => {
    const { tx, service } = setup();
    const result = await service.read({ id: 'owner', sessionId: 'session' });
    expect(tx.w07Application.findMany.mock.calls[0][0].where).toEqual({ learnerId: 'owner' });
    expect(result.data[0].obligation).toMatchObject({
      dueVnd: 100,
      paidVnd: 0,
      remainingVnd: 100,
      state: 'UNPAID',
    });
    expect(tx.$executeRaw.mock.calls[0][0][0]).toBe('SET TRANSACTION READ ONLY');
  });
  it('requires a current active student session', async () => {
    const { tx, service } = setup();
    tx.$queryRaw.mockResolvedValue([]);
    await expect(service.read({ id: 'owner', sessionId: 'expired' })).rejects.toThrow(
      'Current learner session required',
    );
    expect(tx.w07Application.findMany).not.toHaveBeenCalled();
  });
  it('makes foreign or nonexistent IDs unavailable without broadening ownership', async () => {
    const { tx, service } = setup();
    tx.w07Application.findMany.mockResolvedValue([]);
    await expect(service.read({ id: 'owner', sessionId: 'session' }, 'foreign')).rejects.toThrow(
      'Application not available',
    );
    expect(tx.w07Application.findMany.mock.calls[0][0].where).toEqual({
      id: 'foreign',
      learnerId: 'owner',
    });
  });
});
