import { AdmissionsFinanceService } from './admissions-finance.service';

describe('W07 lost upload ACK receipt read', () => {
  function setup() {
    const tx = {
      w07Obligation: {
        findUnique: jest.fn().mockResolvedValue({ id: 'fee', applicationId: 'app' }),
      },
      w07Evidence: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'proof',
          obligationId: 'fee',
          sha256: 'digest',
          bytes: 10,
          amountVnd: 5,
          sourceRef: 'TEST-ONLY',
          createdAt: new Date(),
          fileKey: 'PRIVATE_KEY',
        }),
      },
    };
    // The existing run fence is retained verbatim; this unit exercises only its new read callback.
    const service = Object.create(AdmissionsFinanceService.prototype) as AdmissionsFinanceService;
    const access = jest.fn().mockResolvedValue({});
    const storage = { read: jest.fn().mockResolvedValue(Buffer.from('synthetic')) };
    Object.assign(service, {
      run: jest.fn(async (_a: unknown, fn: (t: unknown, u: unknown) => unknown) =>
        fn(tx, { id: 'owner' }),
      ),
      access,
      storage,
    });
    return { tx, service, access, storage };
  }
  it('uses same owner fence and exact key, omits private file key, never confirms payment', async () => {
    const e = setup(),
      r = await e.service.paymentReceipt({ id: 'owner', sessionId: 's' }, 'fee', 'key');
    expect(e.access).toHaveBeenCalledWith(e.tx, { id: 'owner' }, 'app', 'own');
    expect(e.tx.w07Evidence.findUnique).toHaveBeenCalledWith({
      where: { learnerId_key: { learnerId: 'owner', key: 'key' } },
    });
    expect(r.id).toBe('proof');
    expect(r.paymentConfirmed).toBe(false);
    expect(r.synthetic).toBe(true);
    expect(e.storage.read).toHaveBeenCalledWith('PRIVATE_KEY', 'digest', 10);
    expect(JSON.stringify(r)).not.toContain('PRIVATE_KEY');
  });
  it('does not acknowledge a missing or altered original file', async () => {
    const e = setup();
    e.storage.read.mockRejectedValue(new Error('INTEGRITY'));
    await expect(
      e.service.paymentReceipt({ id: 'owner', sessionId: 's' }, 'fee', 'key'),
    ).rejects.toThrow('INTEGRITY');
  });
  it('denies a key belonging to another obligation', async () => {
    const e = setup();
    e.tx.w07Evidence.findUnique.mockResolvedValue({ obligationId: 'foreign' });
    await expect(
      e.service.paymentReceipt({ id: 'owner', sessionId: 's' }, 'fee', 'key'),
    ).rejects.toThrow();
  });
  it('does not inspect the proof after owner/consent denial', async () => {
    const e = setup();
    e.access.mockRejectedValue(new Error('DENIED'));
    await expect(
      e.service.paymentReceipt({ id: 'foreign', sessionId: 's' }, 'fee', 'key'),
    ).rejects.toThrow('DENIED');
    expect(e.tx.w07Evidence.findUnique).not.toHaveBeenCalled();
  });
});
