import { createHmac, randomBytes } from 'node:crypto';
import { SePayBankCheckService } from './sepay-bank-check.service';
import { sepayTransferHash, type SePayTransfer } from './sepay.policy';

describe('BR136 independent bank check (offline only)', () => {
  const original = { ...process.env };
  let service: SePayBankCheckService;
  let provider: jest.Mock;
  let query: jest.Mock;
  let insert: jest.Mock;
  let existing: { semantic_hash: string; order_id: string } | undefined;
  let config: any;
  let order: any;
  let payload: SePayTransfer;
  beforeEach(() => {
    process.env = { ...original, NODE_ENV: 'test', DATABASE_URL: 'postgresql://wave01@127.0.0.1:55401/v2_wave01_dev_test_w04b_br136_demo_20261111_42db33' };
    existing = undefined;
    config = { bankAccountId: '20000000-0000-4000-8000-000000000001', accountNumber: 'OFFLINE_TEST_ACCOUNT', gateway: 'OFFLINE_TEST_BANK', subAccount: '', webhookSecret: randomBytes(32).toString('hex') };
    order = { id: '20000000-0000-4000-8000-000000000002', learner_id: '5c0adc3b-c075-4f03-8832-563140c983e9', payment_code: 'SEV2' + 'A'.repeat(20), amount_vnd: 10000, bank_account_id: config.bankAccountId, account_number: config.accountNumber, gateway: config.gateway, sub_account: '', receiver_fingerprint: 'offline-fingerprint', created_at: new Date('2026-11-11T00:00:00Z') };
    payload = { id: 2001, gateway: config.gateway, transactionDate: '2026-11-11 08:00:00', accountNumber: config.accountNumber, subAccount: '', code: order.payment_code, content: order.payment_code, transferType: 'in', transferAmount: 10000, referenceCode: 'OFFLINE_TEST_REFERENCE', description: '' };
    provider = jest.fn().mockResolvedValue({ transactionUuid: '20000000-0000-4000-8000-000000000003', responseHash: 'b'.repeat(64) });
    query = jest.fn(async (parts: TemplateStringsArray) => {
      const sql = parts.join('?');
      if (sql.includes('FROM br136_bank_check.receipts')) return existing ? [existing] : [];
      if (sql.includes('FROM br136_bank_check.orders')) return [order];
      return [{ ok: 1 }];
    });
    insert = jest.fn(async () => { existing = { semantic_hash: sepayTransferHash(payload), order_id: order.id }; return 1; });
    const tx = { $queryRaw: query, $executeRaw: insert };
    service = new SePayBankCheckService(
      { $transaction: (work: any) => work(tx) } as any,
      { context: jest.fn().mockResolvedValue({ id: order.learner_id, role: 'STUDENT' }) } as any,
      { load: () => config, fingerprint: () => 'offline-fingerprint', verifyTransfer: provider } as any,
    );
  });
  afterEach(() => { process.env = original; });
  function signed() {
    const raw = Buffer.from(JSON.stringify(payload));
    const time = String(Math.floor(Date.now() / 1000));
    const signature = 'sha256=' + createHmac('sha256', config.webhookSecret).update(time + '.').update(raw).digest('hex');
    return [raw, time, signature] as const;
  }
  it('accepts exact signed incoming funds only after independent provider readback', async () => {
    await expect(service.webhook(...signed())).resolves.toEqual({ success: true });
    expect(provider).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0].join('')).toContain('br136_bank_check.assert_target()');
  });
  it('never settles when real provider readback is unavailable', async () => {
    provider.mockRejectedValue(new Error('offline provider unavailable'));
    await expect(service.webhook(...signed())).rejects.toThrow();
    expect(insert).not.toHaveBeenCalled();
  });
  it('resolves one complete bank-content code but verifies the original null-code provider payload', async () => {
    payload.code = null;
    await service.webhook(...signed());
    expect(provider).toHaveBeenCalledWith(config, expect.objectContaining({ code: null, content: order.payment_code }));
    expect(insert).toHaveBeenCalledTimes(1);
  });
  it.each(['missing', 'ambiguous', 'truncated'])('does not infer a code from %s bank content', async mode => {
    payload.code = null;
    payload.content = mode === 'missing' ? 'NO_ORDER_REFERENCE' : mode === 'ambiguous' ? order.payment_code + ' ' + order.payment_code : order.payment_code.slice(0,-1);
    await service.webhook(...signed());
    expect(provider).not.toHaveBeenCalled(); expect(insert).not.toHaveBeenCalled();
  });
  it.each(['amount', 'receiver', 'outgoing', 'unknown-code'])('does not settle %s', async mode => {
    if (mode === 'amount') payload.transferAmount = 999;
    if (mode === 'receiver') payload.accountNumber = 'OTHER_OFFLINE_ACCOUNT';
    if (mode === 'outgoing') payload.transferType = 'out';
    if (mode === 'unknown-code') payload.code = 'OTHER_CODE';
    await expect(service.webhook(...signed())).resolves.toEqual({ success: true });
    expect(provider).not.toHaveBeenCalled(); expect(insert).not.toHaveBeenCalled();
  });
  it('rejects unsigned notifications without calling provider or database', async () => {
    const [raw] = signed();
    await expect(service.webhook(raw, undefined, undefined)).rejects.toThrow();
    expect(provider).not.toHaveBeenCalled(); expect(query).not.toHaveBeenCalled();
  });
  it('acknowledges identical duplicate without another provider call or receipt', async () => {
    await service.webhook(...signed());
    await service.webhook(...signed());
    expect(provider).toHaveBeenCalledTimes(1); expect(insert).toHaveBeenCalledTimes(1);
  });
  it('rejects conflicting duplicate without another receipt', async () => {
    await service.webhook(...signed()); payload.transferAmount = 2000;
    await expect(service.webhook(...signed())).rejects.toThrow('BANK_CHECK_DUPLICATE_CONFLICT');
    expect(provider).toHaveBeenCalledTimes(1); expect(insert).toHaveBeenCalledTimes(1);
  });
  it.each(['v2_wave01_dev_test_w04b_unified_runtime01_20261107', 'other_database'])('rejects target %s before SQL', async database => {
    process.env.DATABASE_URL = 'postgresql://wave01@127.0.0.1:55401/' + database;
    await expect(service.webhook(...signed())).rejects.toThrow('BR136_BANK_CHECK_TARGET_REQUIRED');
    expect(query).not.toHaveBeenCalled(); expect(provider).not.toHaveBeenCalled();
  });
});
