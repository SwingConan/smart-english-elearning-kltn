import type { Prisma } from '../../generated/prisma/client';
import { privatePlacementPreviewEnabled } from './placement-preview.guard';
import {
  INTERNAL_RELEASE,
  internalPlacementEnabled,
  internalPlacementRelease,
} from './internal-release';

jest.mock('./placement-preview.guard', () => ({ privatePlacementPreviewEnabled: jest.fn() }));

describe('PO internal Placement release scope', () => {
  const original = { ...process.env };
  const query = jest.fn();
  const tx = { $queryRaw: query } as unknown as Prisma.TransactionClient;
  beforeEach(() => {
    process.env.PLACEMENT_INTERNAL_RELEASE = INTERNAL_RELEASE;
    process.env.WEB_ORIGIN = 'http://127.0.0.1:5173';
    jest.mocked(privatePlacementPreviewEnabled).mockResolvedValue(true);
    query.mockReset().mockResolvedValue([{ present: true }]);
  });
  afterEach(() => {
    process.env = { ...original };
  });

  it.each(['https://example.com', 'http://127.0.0.1:3000', 'http://localhost:5173'])(
    'does not release the bank at another origin: %s',
    async (origin) => {
      process.env.WEB_ORIGIN = origin;
      expect(await internalPlacementEnabled(tx)).toBe(false);
      expect(query).not.toHaveBeenCalled();
    },
  );
  it.each([
    'http://127.0.0.1:5173',
    'http://127.0.0.1:3040',
    'https://oink-crazed-frosting.ngrok-free.dev',
  ])('allows approved demo gateway origin: %s', async (origin) => {
    process.env.WEB_ORIGIN = origin;
    expect(await internalPlacementEnabled(tx)).toBe(true);
    expect(query).toHaveBeenCalledTimes(2);
  });
  it('requires the explicit release flag and verified local database', async () => {
    delete process.env.PLACEMENT_INTERNAL_RELEASE;
    expect(await internalPlacementEnabled(tx)).toBe(false);
    process.env.PLACEMENT_INTERNAL_RELEASE = INTERNAL_RELEASE;
    jest.mocked(privatePlacementPreviewEnabled).mockResolvedValue(false);
    expect(await internalPlacementEnabled(tx)).toBe(false);
    expect(query).not.toHaveBeenCalled();
  });
  it('enables the verified local release without asserting historical staff review', async () => {
    expect(await internalPlacementEnabled(tx)).toBe(true);
    expect(query).toHaveBeenCalledTimes(2);
  });
  it('requires the recorded PO authority and local scope on the individual source', async () => {
    const release = {
      sourceId: 'source',
      sourceHash: 'hash',
      policyId: 'policy',
      timing: {},
      decision: {
        authority: 'PO_USER_CONFIRMATION',
        scope: 'SMART_ENGLISH_INTERNAL_LOCALHOST',
        statement: 'User authorization',
      },
    };
    for (const decision of [
      release.decision,
      { ...release.decision, authority: 'STAFF_APPROVAL' },
      { ...release.decision, scope: 'OFFICIAL_EXAM' },
    ]) {
      query
        .mockReset()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ present: true }])
        .mockResolvedValueOnce([{ ...release, decision }]);
      expect(Boolean(await internalPlacementRelease(tx, 'source'))).toBe(
        decision === release.decision,
      );
    }
  });
});
