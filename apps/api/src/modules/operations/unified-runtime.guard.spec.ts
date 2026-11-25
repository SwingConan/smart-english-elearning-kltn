import { ServiceUnavailableException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import { verifyUnifiedTarget } from './unified-runtime.guard';

describe('Integrated QA identity boundary', () => {
  const original = { ...process.env };
  const database = 'v2_wave01_dev_test_w04b_unified_runtime01_test';
  const binding = {
    oid: '953322',
    physical: '7702384118803149788',
    datasetSha256: 'a'.repeat(64),
    database,
    schema: 'public',
    checkedAt: new Date(),
  };
  let query: jest.Mock;
  let tx: Prisma.TransactionClient;

  beforeEach(() => {
    process.env = {
      ...original,
      NODE_ENV: 'test',
      V2_UNIFIED_RUNTIME: 'DEV_UNIFIED_01',
      DATABASE_URL: `postgresql://wave01@127.0.0.1:55401/${database}`,
      E2E_DATABASE_URL: `postgresql://wave01@127.0.0.1:55401/${database}`,
      V2_UNIFIED_DATABASE: database,
      V2_UNIFIED_OID: binding.oid,
      V2_UNIFIED_PHYSICAL: binding.physical,
      V2_UNIFIED_DATASET_SHA256: binding.datasetSha256,
    };
    query = jest
      .fn()
      .mockResolvedValueOnce([{ ok: 1 }])
      .mockResolvedValueOnce([binding]);
    tx = { $queryRaw: query } as unknown as Prisma.TransactionClient;
  });
  afterEach(() => {
    process.env = original;
  });

  it('requires the SQL guard before returning the verified binding', async () => {
    await expect(verifyUnifiedTarget(tx)).resolves.toEqual(binding);
    expect(query.mock.calls[0][0].join('')).toContain('runtime_v2.assert_target()');
    expect(query).toHaveBeenCalledTimes(2);
  });
  it.each(['production', 'disabled', 'different-client'])(
    'rejects %s before querying',
    async (mode) => {
      if (mode === 'production') process.env.NODE_ENV = 'production';
      if (mode === 'disabled') delete process.env.V2_UNIFIED_RUNTIME;
      if (mode === 'different-client') process.env.DATABASE_URL += '_other';
      await expect(verifyUnifiedTarget(tx)).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(query).not.toHaveBeenCalled();
    },
  );
  it.each(['20986', '952995'])('rejects a different database OID %s', async (oid) => {
    process.env.V2_UNIFIED_OID = oid;
    await expect(verifyUnifiedTarget(tx)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
  it('rejects a mismatched source checksum', async () => {
    process.env.V2_UNIFIED_DATASET_SHA256 = 'b'.repeat(64);
    await expect(verifyUnifiedTarget(tx)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
  it.each(['55459', '5432'])('rejects an unapproved port %s', async (port) => {
    process.env.DATABASE_URL =
      process.env.E2E_DATABASE_URL = `postgresql://wave01@127.0.0.1:${port}/${database}`;
    await expect(verifyUnifiedTarget(tx)).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(query).not.toHaveBeenCalled();
  });
  it('does not fall back when the SQL guard denies the target', async () => {
    const denial = new Error('SQL target identity denied');
    query.mockReset().mockRejectedValue(denial);
    await expect(verifyUnifiedTarget(tx)).rejects.toBe(denial);
    expect(query).toHaveBeenCalledTimes(1);
  });
});
