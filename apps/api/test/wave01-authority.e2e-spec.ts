import * as request from 'supertest';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { startWave01App, seedWave01 } from './wave01-postgres.fixture';
import { ModulesContainer } from '@nestjs/core';
import { RequestMethod } from '@nestjs/common';
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { seedS10DevTask } from './s10-postgres.fixture';

const enabled = !!process.env.WAVE01_PG_URL;
(enabled ? describe : describe.skip)('Wave01 actual PostgreSQL / AppModule HTTP authority', () => {
  let dev: Awaited<ReturnType<typeof startWave01App>>;
  let fixture: Awaited<ReturnType<typeof seedWave01>>;
  const agents = new Map<string, ReturnType<typeof request.agent>>();
  const evidence: object[] = [];
  const reason = 'Synthetic Wave01 independent decision for DEV test';
  beforeAll(async () => {
    dev = await startWave01App();
    fixture = await seedWave01(dev.prisma);
    for (const user of fixture.users) {
      const agent = request.agent(dev.app.getHttpServer());
      await agent
        .post('/api/auth/login')
        .send({ email: user.email, password: fixture.password })
        .expect(200);
      agents.set(user.id, agent);
    }
  }, 60000);
  afterAll(async () => {
    if (dev) {
      await writeFile(
        resolve(
          process.env.WAVE01_EVIDENCE_ROOT ?? '.local-storage/v2-wave01',
          'http-evidence.json',
        ),
        JSON.stringify(evidence, null, 2),
      );
      await dev.app.close();
    }
  });
  function agent(id: string) {
    return agents.get(id)!;
  }
  async function login(id: string) {
    const user = await dev.prisma.user.findUniqueOrThrow({ where: { id } });
    await agent(id)
      .post('/api/auth/login')
      .send({ email: user.email, password: fixture.password })
      .expect(200);
  }
  const grantBody = (userId: string, capability = 'class.read', scopeId?: string) => ({
    userId,
    capability,
    scopeType: scopeId ? 'CLASS' : 'GLOBAL',
    ...(scopeId ? { scopeId } : {}),
    effectiveAt: new Date(Date.now() - 1000).toISOString(),
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
    reason,
  });

  it('register cannot supply role; ordinary public registration creates only HV', async () => {
    const registration = {
      email: randomUUID() + '@example.invalid',
      fullName: 'Synthetic learner',
      password: fixture.password,
      termsAccepted: true,
    };
    await request(dev.app.getHttpServer())
      .post('/api/auth/register')
      .send({ ...registration, role: 'SYSTEM_ADMIN' })
      .expect(400);
    const res = await request(dev.app.getHttpServer())
      .post('/api/auth/register')
      .send(registration)
      .expect(201);
    expect(res.body.role).toBe('STUDENT');
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash/);
  });
  it('seven roles plus unmapped legacy deny every inventoried legacy admin endpoint, except QT account allowlist', async () => {
    const endpoints: { method: string; path: string }[] = JSON.parse(
      await (
        await import('node:fs/promises')
      ).readFile(resolve(__dirname, 'wave01-admin-endpoints.json'), 'utf8'),
    );
    const actual: string[] = [];
    for (const module of dev.app.get(ModulesContainer).values()) {
      for (const controller of module.controllers.values()) {
        const ctor = controller.metatype;
        if (!ctor) continue;
        const prefix = Reflect.getMetadata(PATH_METADATA, ctor) as string;
        if (typeof prefix !== 'string' || !prefix.startsWith('admin/')) continue;
        const prototype = ctor.prototype as Record<string, unknown>;
        for (const name of Object.getOwnPropertyNames(prototype)) {
          const handler = prototype[name];
          if (typeof handler !== 'function') continue;
          const method = Reflect.getMetadata(METHOD_METADATA, handler) as number | undefined;
          const path = Reflect.getMetadata(PATH_METADATA, handler) as string;
          if (method !== undefined)
            actual.push(
              RequestMethod[method] +
                ' /' +
                ['api', prefix, path].join('/').split('/').filter(Boolean).join('/'),
            );
        }
      }
    }
    expect(actual.sort()).toEqual(endpoints.map((e) => e.method + ' ' + e.path).sort());
    expect(endpoints.length).toBeGreaterThan(20);
    for (const user of fixture.users.slice(0, 8)) {
      for (const endpoint of endpoints) {
        const path = endpoint.path.replace(/:[A-Za-z0-9_]+/g, randomUUID());
        const isAccount = path.startsWith('/api/admin/accounts');
        const expected = user.role === 'SYSTEM_ADMIN' && isAccount ? undefined : 403;
        const method = endpoint.method.toLowerCase();
        const res = await agent(user.id)[method as 'get'](path).send({});
        if (expected)
          expect({ role: user.role, path, method, status: res.status }).toMatchObject({
            status: expected,
          });
        else expect([200, 400, 404, 409]).toContain(res.status);
        evidence.push({
          role: user.role,
          path: endpoint.path,
          method,
          status: res.status,
          expected: expected ?? 'QT account allowlist; input validation still applies',
        });
      }
    }
    await agent(fixture.admin.id).get('/api/admin/accounts').expect(200);
  }, 60000);
  it('all seven workspace identities are real; own/assigned/academic scopes enforced at HTTP', async () => {
    for (const user of fixture.users.slice(0, 8)) {
      const res = await agent(user.id).get('/api/workspace').expect(200);
      expect(res.body.role).toBe(user.role);
    }
    for (const user of [fixture.learner, fixture.teacher]) {
      const list = await agent(user.id).get('/api/workspace/classes').expect(200);
      expect(list.body.data.map((row: { id: string }) => row.id)).toEqual([fixture.classes[0].id]);
      await agent(user.id)
        .get('/api/workspace/classes/' + fixture.classes[1].id)
        .expect(404);
    }
    const learner = await agent(fixture.learner.id)
      .get('/api/workspace/classes/' + fixture.classes[0].id)
      .expect(200);
    expect(learner.body.enrollments).toHaveLength(1);
    expect(learner.body.enrollments[0].learner).toBeUndefined();
    const academic = await agent(fixture.academic.id)
      .get('/api/workspace/classes/' + fixture.classes[0].id)
      .expect(200);
    expect(academic.body.enrollments[0].learner.id).toBe(fixture.learner.id);
    await agent(fixture.admin.id).get('/api/workspace/classes').expect(403);
    await agent(fixture.cashier.id).get('/api/workspace/classes').expect(403);
  });
  it('QT creates only non-privileged staff, handles duplicate email, audits status and blocks direct role mutation', async () => {
    const input = {
      fullName: 'Synthetic counselor created through HTTP',
      email: randomUUID() + '@example.invalid',
      password: fixture.password,
      role: 'COUNSELOR',
    };
    const created = await agent(fixture.admin.id)
      .post('/api/admin/accounts')
      .send(input)
      .expect(201);
    expect(created.body.role).toBe('COUNSELOR');
    expect(created.body.passwordHash).toBeUndefined();
    await agent(fixture.admin.id).post('/api/admin/accounts').send(input).expect(409);
    await agent(fixture.admin.id)
      .post('/api/admin/accounts')
      .send({ ...input, email: randomUUID() + '@example.invalid', role: 'SYSTEM_ADMIN' })
      .expect(400);
    await agent(fixture.admin.id)
      .patch('/api/admin/accounts/' + created.body.id + '/role')
      .send({ role: 'ADMIN_COORDINATOR' })
      .expect(409);
    await agent(fixture.admin.id)
      .patch('/api/admin/accounts/' + created.body.id + '/status')
      .send({ status: 'LOCKED', reason })
      .expect(200);
    await request(dev.app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: input.email, password: fixture.password })
      .expect(401);
    expect(
      await dev.prisma.domainAuditEvent.count({
        where: { objectId: created.body.id, action: { in: ['ACCOUNT_CREATE', 'ACCOUNT_STATUS'] } },
      }),
    ).toBe(2);
  });
  it('seven roles and legacy cannot bypass new authority or S10 endpoints', async () => {
    const unknown = randomUUID();
    const routes = [
      ['get', '/api/authority'],
      ['get', '/api/authority/me'],
      ['post', '/api/authority/grants'],
      ['post', '/api/authority/grants/' + unknown + '/approve'],
      ['post', '/api/authority/grants/' + unknown + '/revoke'],
      ['post', '/api/authority/roles'],
      ['post', '/api/authority/roles/' + unknown + '/approve'],
      ['post', '/api/authority/recovery-permissions/' + unknown + '/revoke'],
    ];
    for (const user of fixture.users.slice(0, 8)) {
      for (const [method, path] of routes) {
        const res = await agent(user.id)[method as 'get'](path).send({});
        const approval = path.endsWith('/approve');
        if (user.role !== 'SYSTEM_ADMIN' || approval) expect(res.status).toBe(403);
        else expect([200, 400]).toContain(res.status);
        evidence.push({ role: user.role, path, method, status: res.status });
      }
      const path = '/api/placement/attempts/' + unknown + '/tasks/' + unknown + '/s10/recovery';
      for (const method of ['get', 'post'] as const) {
        const res = await agent(user.id)[method](path).send({});
        expect(res.status).toBe(
          user.role === 'ACADEMIC_MANAGER' ? (method === 'get' ? 404 : 400) : 403,
        );
        evidence.push({
          role: user.role,
          path: '/api/placement/attempts/:a/tasks/:q/s10/recovery',
          method,
          status: res.status,
        });
      }
    }
  });
  it('pending scoped grant cannot read; maker/recipient cannot approve; independent approval revokes session; foreign class stays denied', async () => {
    const proposed = await agent(fixture.admin.id)
      .post('/api/authority/grants')
      .send(grantBody(fixture.counselor.id, 'class.read', fixture.classes[0].id));
    expect({ status: proposed.status, body: proposed.body }).toMatchObject({
      status: 201,
      body: { id: expect.any(String) },
    });
    const id = proposed.body.id;
    await agent(fixture.counselor.id)
      .get('/api/workspace/classes/' + fixture.classes[0].id)
      .expect(404);
    await agent(fixture.admin.id)
      .post('/api/authority/grants/' + id + '/approve')
      .send({})
      .expect(403);
    await agent(fixture.counselor.id)
      .post('/api/authority/grants/' + id + '/approve')
      .send({})
      .expect(403);
    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        agent(fixture.approver.id)
          .post('/api/authority/grants/' + id + '/approve')
          .send({}),
      ),
    );
    expect(results.map((r) => r.status)).toEqual(Array(6).fill(201));
    expect(
      await dev.prisma.domainAuditEvent.count({ where: { objectId: id, action: 'GRANT_APPROVE' } }),
    ).toBe(1);
    await agent(fixture.counselor.id).get('/api/workspace').expect(401);
    await login(fixture.counselor.id);
    await agent(fixture.counselor.id)
      .get('/api/workspace/classes/' + fixture.classes[0].id)
      .expect(200);
    await agent(fixture.counselor.id)
      .get('/api/workspace/classes/' + fixture.classes[1].id)
      .expect(404);
    const scoped = await agent(fixture.counselor.id)
      .get('/api/workspace/classes/' + fixture.classes[0].id)
      .expect(200);
    expect(scoped.body.enrollments).toBeUndefined();
    await agent(fixture.admin.id)
      .post('/api/authority/grants/' + id + '/revoke')
      .send({ reason })
      .expect(201);
    await agent(fixture.counselor.id).get('/api/workspace').expect(401);
    await login(fixture.counselor.id);
    await agent(fixture.counselor.id)
      .get('/api/workspace/classes/' + fixture.classes[0].id)
      .expect(404);
  });
  it('rejects cross-domain grants, self requests, unknown scope and expiry; DB time handles effective/expired grants', async () => {
    await agent(fixture.admin.id)
      .post('/api/authority/grants')
      .send(grantBody(fixture.admin.id, 'authority.approve'))
      .expect(403);
    await agent(fixture.admin.id)
      .post('/api/authority/grants')
      .send(grantBody(fixture.admin.id, 'assessment.recovery.approve'))
      .expect(403);
    await agent(fixture.admin.id)
      .post('/api/authority/grants')
      .send(grantBody(fixture.cashier.id, 'assessment.recovery.approve'))
      .expect(403);
    await agent(fixture.admin.id)
      .post('/api/authority/grants')
      .send({ ...grantBody(fixture.inspector.id), capability: 'arbitrary.root' })
      .expect(400);
    await agent(fixture.admin.id)
      .post('/api/authority/grants')
      .send({ ...grantBody(fixture.inspector.id), scopeType: 'CLASS' })
      .expect(400);
    await agent(fixture.admin.id)
      .post('/api/authority/grants')
      .send({ ...grantBody(fixture.inspector.id), expiresAt: new Date(0).toISOString() })
      .expect(400);
    const grant = await dev.prisma.permissionGrant.create({
      data: {
        userId: fixture.inspector.id,
        capability: 'class.read',
        scopeType: 'GLOBAL',
        requestedBy: fixture.admin.id,
        approvedBy: fixture.approver.id,
        approvedAt: new Date(Date.now() - 1000),
        effectiveAt: new Date(Date.now() + 100000),
        expiresAt: new Date(Date.now() + 200000),
        reason,
      },
    });
    await agent(fixture.inspector.id)
      .get('/api/workspace/classes/' + fixture.classes[0].id)
      .expect(404);
    await dev.prisma.permissionGrant.update({
      where: { id: grant.id },
      data: {
        effectiveAt: new Date(Date.now() - 200000),
        expiresAt: new Date(Date.now() - 100000),
      },
    });
    await agent(fixture.inspector.id)
      .get('/api/workspace/classes/' + fixture.classes[0].id)
      .expect(404);
  });
  it('an explicitly authorized approver still cannot approve own request or own grant', async () => {
    const proposed = await agent(fixture.approver.id)
      .post('/api/authority/grants')
      .send(grantBody(fixture.academic.id, 'assessment.recovery.approve'))
      .expect(201);
    await agent(fixture.approver.id)
      .post('/api/authority/grants/' + proposed.body.id + '/approve')
      .send({})
      .expect(403);
    await agent(fixture.secondApprover.id)
      .post('/api/authority/grants/' + proposed.body.id + '/approve')
      .send({})
      .expect(201);
    const recipient = await agent(fixture.admin.id)
      .post('/api/authority/grants')
      .send(grantBody(fixture.approver.id, 'authority.approve'))
      .expect(201);
    await agent(fixture.approver.id)
      .post('/api/authority/grants/' + recipient.body.id + '/approve')
      .send({})
      .expect(403);
  });
  it('new independent recovery grant integrates with real S10; QT stays denied; revoke removes authority without changing legacy provenance', async () => {
    process.env.BATCH04_PG_URL = process.env.WAVE01_PG_URL;
    const task = await seedS10DevTask(dev.prisma);
    const owner = request.agent(dev.app.getHttpServer()),
      academic = request.agent(dev.app.getHttpServer());
    await owner
      .post('/api/auth/login')
      .send({ email: task.owner.email, password: task.password })
      .expect(200);
    await academic
      .post('/api/auth/login')
      .send({ email: task.ungranted.email, password: task.password })
      .expect(200);
    const base =
      '/api/placement/attempts/' + task.attempt.id + '/tasks/' + task.question.id + '/s10';
    const command = {
      action: 'CLAIM',
      key: randomUUID(),
      epoch: null,
      revision: 0,
      token: randomUUID(),
      tabId: randomUUID(),
    };
    const claimed = await owner
      .post(base + '/commands')
      .send(command)
      .expect(201);
    await owner
      .post(base + '/commands')
      .send({
        ...command,
        action: 'INTERRUPT',
        key: randomUUID(),
        epoch: claimed.body.epoch,
        revision: claimed.body.revision,
      })
      .expect(201);
    const provenance = await dev.prisma.examRecoveryPermission.findUniqueOrThrow({
      where: { userId: task.coordinator.id },
    });
    await academic.get(base + '/recovery').expect(403);
    const grant = await agent(fixture.admin.id)
      .post('/api/authority/grants')
      .send(grantBody(task.ungranted.id, 'assessment.recovery.approve'))
      .expect(201);
    await agent(fixture.approver.id)
      .post('/api/authority/grants/' + grant.body.id + '/approve')
      .send({})
      .expect(201);
    await academic.get(base + '/recovery').expect(401);
    await academic
      .post('/api/auth/login')
      .send({ email: task.ungranted.email, password: task.password })
      .expect(200);
    await academic.get(base + '/recovery').expect(200);
    const reset = { key: randomUUID(), epoch: claimed.body.epoch, reason };
    await agent(fixture.admin.id)
      .post(base + '/recovery')
      .send(reset)
      .expect(403);
    const next = await academic
      .post(base + '/recovery')
      .send(reset)
      .expect(201);
    expect(next.body.resetCount).toBe(1);
    const epochs = await dev.prisma.examTaskProgress.findMany({
      where: { attemptId: task.attempt.id },
      orderBy: { resetCount: 'asc' },
    });
    expect(epochs[0].mediaSha256).toBe(epochs[1].mediaSha256);
    expect(epochs[0].contentVersion).toBe(epochs[1].contentVersion);
    await agent(fixture.admin.id)
      .post('/api/authority/recovery-permissions/' + task.ungranted.id + '/revoke')
      .send({ reason })
      .expect(201);
    await academic.get(base + '/recovery').expect(401);
    await academic
      .post('/api/auth/login')
      .send({ email: task.ungranted.email, password: task.password })
      .expect(200);
    await academic.get(base + '/recovery').expect(403);
    expect(
      await dev.prisma.examRecoveryPermission.findUniqueOrThrow({
        where: { userId: task.coordinator.id },
      }),
    ).toEqual(provenance);
  });
  it('legacy mapping is explicit/independent; preserves recovery provenance and revokes stale sessions; stale role proposals conflict', async () => {
    const before = await dev.prisma.examRecoveryPermission.findUniqueOrThrow({
      where: { userId: fixture.legacy.id },
    });
    expect(
      (await agent(fixture.legacy.id).get('/api/workspace').expect(200)).body.capabilities
        .recoveryApprove,
    ).toBe(false);
    const requestRole = await agent(fixture.admin.id)
      .post('/api/authority/roles')
      .send({ userId: fixture.legacy.id, nextRole: 'ACADEMIC_MANAGER', reason })
      .expect(201);
    await agent(fixture.admin.id)
      .post('/api/authority/roles/' + requestRole.body.id + '/approve')
      .send({})
      .expect(403);
    await agent(fixture.approver.id)
      .post('/api/authority/roles/' + requestRole.body.id + '/approve')
      .send({})
      .expect(201);
    await agent(fixture.legacy.id).get('/api/workspace').expect(401);
    await login(fixture.legacy.id);
    expect(
      (await agent(fixture.legacy.id).get('/api/workspace').expect(200)).body.capabilities
        .recoveryApprove,
    ).toBe(true);
    expect(
      await dev.prisma.examRecoveryPermission.findUniqueOrThrow({
        where: { userId: fixture.legacy.id },
      }),
    ).toEqual(before);
    const a = await agent(fixture.admin.id)
      .post('/api/authority/roles')
      .send({ userId: fixture.legacy.id, nextRole: 'COUNSELOR', reason })
      .expect(201);
    const b = await agent(fixture.admin.id)
      .post('/api/authority/roles')
      .send({ userId: fixture.legacy.id, nextRole: 'CASHIER', reason })
      .expect(201);
    await agent(fixture.approver.id)
      .post('/api/authority/roles/' + a.body.id + '/approve')
      .send({})
      .expect(201);
    await agent(fixture.approver.id)
      .post('/api/authority/roles/' + b.body.id + '/approve')
      .send({})
      .expect(409);
  });
  it('last authorized approver is protected; authority changes serialize under concurrency', async () => {
    const grants = await dev.prisma.permissionGrant.findMany({
      where: {
        userId: { in: [fixture.approver.id, fixture.secondApprover.id] },
        capability: 'authority.approve',
        approvedBy: { not: null },
      },
    });
    const res = await Promise.all(
      grants.map((g) =>
        agent(fixture.admin.id)
          .post('/api/authority/grants/' + g.id + '/revoke')
          .send({ reason }),
      ),
    );
    expect(res.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(
      await dev.prisma.permissionGrant.count({
        where: { id: { in: grants.map((g) => g.id) }, revokedAt: null },
      }),
    ).toBe(1);
    evidence.push({
      scenario: 'concurrent final approver revocation',
      statuses: res.map((r) => r.status),
    });
  });
  it('last active QT cannot be locked; self status forbidden; logout/locked account/expired session deny', async () => {
    // The surviving explicit approver must also be protected against account locking.
    const live = await dev.prisma.permissionGrant.findFirstOrThrow({
      where: {
        userId: { in: [fixture.approver.id, fixture.secondApprover.id] },
        capability: 'authority.approve',
        revokedAt: null,
      },
    });
    await agent(fixture.admin.id)
      .patch('/api/admin/accounts/' + live.userId + '/status')
      .send({ status: 'LOCKED', reason })
      .expect(409);
    const session = request.agent(dev.app.getHttpServer());
    await session
      .post('/api/auth/login')
      .send({ email: fixture.admin.email, password: fixture.password })
      .expect(200);
    await session
      .patch('/api/admin/accounts/' + fixture.admin.id + '/status')
      .send({ status: 'LOCKED', reason })
      .expect(403);
    // Service protection is checked under lock using a distinct real caller in a temporary fixture account.
    const other = await dev.prisma.user.create({
      data: {
        email: randomUUID() + '@example.invalid',
        fullName: 'Synthetic last-admin checker',
        passwordHash: 'disabled',
        role: 'SYSTEM_ADMIN',
        status: 'LOCKED',
      },
    });
    expect(other.status).toBe('LOCKED');
    const { AuthorizationService } =
      await import('../src/modules/authorization/authorization.service');
    await expect(
      dev.prisma.$transaction(async (tx) => {
        await tx.user.updateMany({
          where: { role: 'SYSTEM_ADMIN', id: { not: fixture.admin.id } },
          data: { status: 'LOCKED' },
        });
        await dev.app
          .get(AuthorizationService)
          .protectAdmin(tx, fixture.admin.id, 'COUNSELOR', 'ACTIVE');
      }),
    ).rejects.toMatchObject({ status: 409 }); // temporary updates rolled back
    await agent(fixture.cashier.id).post('/api/auth/logout').send({}).expect(204);
    await agent(fixture.cashier.id).get('/api/workspace').expect(401);
    await dev.prisma.userSession.updateMany({
      where: { sess: { path: ['userId'], equals: fixture.learner.id } },
      data: { expire: new Date(0) },
    });
    await agent(fixture.learner.id).get('/api/workspace').expect(401);
    await agent(fixture.approver.id).get('/api/workspace').expect(401);
  });
  it('domain audit rejects UPDATE, DELETE and TRUNCATE in PostgreSQL; no secret payloads', async () => {
    await expect(
      dev.prisma.$executeRaw`UPDATE domain_audit_events SET reason='tamper'`,
    ).rejects.toThrow(/V2_AUDIT_IMMUTABLE/);
    await expect(dev.prisma.$executeRaw`DELETE FROM domain_audit_events`).rejects.toThrow(
      /V2_AUDIT_IMMUTABLE/,
    );
    await expect(dev.prisma.$executeRaw`TRUNCATE domain_audit_events`).rejects.toThrow(
      /V2_AUDIT_IMMUTABLE/,
    );
    const audit = await agent(fixture.admin.id).get('/api/authority').expect(200);
    expect(JSON.stringify(audit.body)).not.toMatch(
      // A capability name such as academic.rubric.approve is legitimate audit metadata.
      // Private rubric/content/feedback payload fields remain forbidden.
      /passwordHash|leaseTokenHash|mediaStorageKey|"rubric"\s*:|"criteria"\s*:|"contentMarkdown"\s*:|"feedback"\s*:/,
    );
  });
});
