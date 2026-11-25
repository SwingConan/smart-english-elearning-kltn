import { AuthorizationService } from '../authorization/authorization.service';
import type { PrismaService } from '../../infrastructure/prisma/prisma.service';
describe('CF01 W08 grant request scope validation — pure unit, not native grant verification', () => {
  const actor = { id: '00000000-0000-4000-8000-000000000001', sessionId: 'synthetic-unit' },
    userId = '00000000-0000-4000-8000-000000000002',
    scopeId = '00000000-0000-4000-8000-000000000003',
    ms = 1793700000000;
  function setup() {
    const create = jest.fn().mockResolvedValue({ id: 'grant' }),
      tx = {
        user: {
          findUnique: jest
            .fn()
            .mockImplementation(async ({ where }: { where: { id: string } }) => ({
              id: where.id,
              role: where.id === actor.id ? 'SYSTEM_ADMIN' : 'ACADEMIC_MANAGER',
              status: 'ACTIVE',
            })),
        },
        classOffering: { findUnique: jest.fn().mockResolvedValue({ id: scopeId }) },
        $queryRaw: jest.fn().mockResolvedValue([{ sid: actor.sessionId, ms }]),
        permissionGrant: { create },
        domainAuditEvent: { create: jest.fn().mockResolvedValue({ id: 'audit' }) },
      },
      db = { ...tx, $transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx) };
    return { create, service: new AuthorizationService(db as unknown as PrismaService) };
  }
  it.each(['inspection.assign', 'inspection.hours.review', 'shift.review'])(
    '%s requires CLASS and can be requested through the actual authority service',
    async (capability) => {
      const { service, create } = setup();
      await expect(
        service.requestGrant(actor, {
          userId,
          capability,
          scopeType: 'CLASS',
          scopeId,
          effectiveAt: new Date(ms - 1000).toISOString(),
          expiresAt: new Date(ms + 3600000).toISOString(),
          reason: 'Synthetic scoped permission request unit only',
        }),
      ).resolves.toEqual({ id: 'grant' });
      expect(create).toHaveBeenCalledWith({
        data: expect.objectContaining({ capability, scopeType: 'CLASS', scopeId }),
      });
    },
  );
  it.each(['inspection.assign', 'inspection.hours.review', 'shift.review'])(
    '%s rejects GLOBAL instead of creating an implicit business grant',
    async (capability) => {
      const { service, create } = setup();
      await expect(
        service.requestGrant(actor, {
          userId,
          capability,
          scopeType: 'GLOBAL',
          effectiveAt: new Date(ms - 1000).toISOString(),
          expiresAt: new Date(ms + 3600000).toISOString(),
          reason: 'Synthetic invalid global scope unit only',
        }),
      ).rejects.toMatchObject({ status: 400 });
      expect(create).not.toHaveBeenCalled();
    },
  );
});
