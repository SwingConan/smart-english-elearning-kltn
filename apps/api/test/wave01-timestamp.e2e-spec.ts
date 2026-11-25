import { seedWave01, startWave01App } from './wave01-postgres.fixture';
import { AuthorizationService } from '../src/modules/authorization/authorization.service';
import * as request from 'supertest';

(process.env.WAVE01_PG_URL ? describe : describe.skip)('Wave01 metadata UTC contract on real PostgreSQL', () => {
  let dev: Awaited<ReturnType<typeof startWave01App>>;
  let fixture: Awaited<ReturnType<typeof seedWave01>>;
  beforeAll(async () => {
    dev = await startWave01App();
    fixture = await seedWave01(dev.prisma);
  }, 30000);
  afterAll(async () => {
    if (dev) {
      // Synthetic fixture retirement, not business mutation or deletion. Keep all
      // rows/audit while preventing this suite's operators affecting last-admin tests.
      if (fixture) {
        await dev.prisma.user.updateMany({
          where: { id: { in: fixture.users.map((u) => u.id) } },
          data: { status: 'INACTIVE' },
        });
        await dev.prisma.domainAuditEvent.create({
          data: {
            actorId: fixture.admin.id,
            action: 'DEV_FIXTURE_RETIRED',
            objectType: 'FIXTURE',
            objectId: fixture.admin.id,
            decision: 'DEV_ONLY',
            reason: 'Retire isolated synthetic timezone fixture without deleting audit or users',
          },
        });
      }
      await dev.app.close();
    }
  });
  it.each(['UTC', 'Asia/Bangkok', 'America/New_York'])(
    'database defaults round trip as UTC in %s without rewriting history',
    async (zone) => {
      await dev.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT set_config('TimeZone', ${zone}, true)`;
        const [clock] = await tx.$queryRaw<
          { ms: number }[]
        >`SELECT (EXTRACT(EPOCH FROM CURRENT_TIMESTAMP)*1000)::double precision AS ms`;
        const grant = await tx.permissionGrant.create({
          data: {
            userId: fixture.counselor.id,
            capability: 'class.read',
            scopeType: 'GLOBAL',
            requestedBy: fixture.admin.id,
            effectiveAt: new Date(clock.ms),
            expiresAt: new Date(clock.ms + 60000),
            reason: 'Synthetic timezone metadata test',
          },
        });
        const role = await tx.accountRoleDecision.create({
          data: {
            userId: fixture.counselor.id,
            previousRole: 'COUNSELOR',
            nextRole: 'CASHIER',
            requestedBy: fixture.admin.id,
            reason: 'Synthetic timezone metadata test',
          },
        });
        const audit = await tx.domainAuditEvent.create({
          data: {
            actorId: fixture.admin.id,
            action: 'TIMEZONE_TEST',
            objectType: 'GRANT',
            objectId: grant.id,
            decision: 'DEV_ONLY',
            reason: 'Synthetic timezone metadata test',
          },
        });
        for (const row of [grant, role, audit])
          expect(Math.abs(row.createdAt.getTime() - clock.ms)).toBeLessThan(2);
        const reread = await tx.permissionGrant.findUniqueOrThrow({ where: { id: grant.id } });
        expect(reread.createdAt.toISOString()).toBe(grant.createdAt.toISOString());
        expect(reread.effectiveAt.getTime()).toBe(grant.effectiveAt.getTime());
      });
    },
  );
  it('HTTP creation/approval/revoke and audit use DB instants on the non-UTC DEV session', async () => {
    const before = Date.now(),
      maker = request.agent(dev.app.getHttpServer()),
      checker = request.agent(dev.app.getHttpServer());
    for (const [agent, user] of [
      [maker, fixture.admin],
      [checker, fixture.approver],
    ] as const)
      await agent
        .post('/api/auth/login')
        .send({ email: user.email, password: fixture.password })
        .expect(200);
    const grant = await maker
      .post('/api/authority/grants')
      .send({
        userId: fixture.counselor.id,
        capability: 'class.read',
        scopeType: 'CLASS',
        scopeId: fixture.classes[0].id,
        effectiveAt: new Date(before - 1000).toISOString(),
        expiresAt: new Date(before + 60000).toISOString(),
        reason: 'Synthetic timezone grant request and approval',
      })
      .expect(201);
    expect(Date.parse(grant.body.createdAt)).toBeGreaterThanOrEqual(before);
    expect(Date.parse(grant.body.createdAt)).toBeLessThanOrEqual(Date.now());
    const approved = await checker
      .post('/api/authority/grants/' + grant.body.id + '/approve')
      .send({})
      .expect(201);
    expect(Date.parse(approved.body.approvedAt)).toBeGreaterThanOrEqual(
      Date.parse(grant.body.createdAt),
    );
    const role = await maker
      .post('/api/authority/roles')
      .send({
        userId: fixture.counselor.id,
        nextRole: 'CASHIER',
        reason: 'Synthetic timezone role request and approval',
      })
      .expect(201);
    expect(Date.parse(role.body.createdAt)).toBeGreaterThanOrEqual(before);
    const mapped = await checker
      .post('/api/authority/roles/' + role.body.id + '/approve')
      .send({})
      .expect(201);
    expect(Date.parse(mapped.body.effectiveAt)).toBeGreaterThanOrEqual(
      Date.parse(role.body.createdAt),
    );
    await maker
      .post('/api/authority/grants/' + grant.body.id + '/revoke')
      .send({ reason: 'Synthetic explicit timezone revocation' })
      .expect(201);
    const audit = await dev.prisma.domainAuditEvent.findMany({
      where: { objectId: { in: [grant.body.id, role.body.id] } },
    });
    expect(audit.length).toBeGreaterThanOrEqual(5);
    for (const row of audit) {
      expect(row.createdAt.getTime()).toBeGreaterThanOrEqual(before);
      expect(row.createdAt.getTime()).toBeLessThanOrEqual(Date.now());
    }
    const authority = dev.app.get(AuthorizationService);
    expect(
      await authority.permits(fixture.counselor.id, 'class.read', {
        type: 'CLASS',
        id: fixture.classes[0].id,
      }),
    ).toBe(false);
  });
});
