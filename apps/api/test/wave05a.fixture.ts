import * as request from 'supertest';
import { randomUUID } from 'node:crypto';
import { seedWave03A } from './wave03a.fixture';
import { grantAcademic } from './wave02b.fixture';
import { localMinute } from '../src/modules/academic/academic-time';
import type { startWave01App } from './wave01-postgres.fixture';
export async function seedWave05A(d: Awaited<ReturnType<typeof startWave01App>>) {
  const f = await seedWave03A(d),
    reason = 'Synthetic W05A independent authority only';
  const counselor2 = await d.prisma.user.create({
    data: {
      email: 'w05a-' + randomUUID() + '@example.invalid',
      fullName: 'Second synthetic counselor',
      passwordHash: f.counselor.passwordHash,
      role: 'COUNSELOR',
    },
  });
  async function login(u: { id: string; email: string }) {
    const a = request.agent(d.app.getHttpServer());
    await a.post('/api/auth/login').send({ email: u.email, password: f.password }).expect(200);
    f.agents.set(u.id, a);
    return a;
  }
  for (const u of [f.approver, f.secondApprover]) {
    await d.prisma.permissionGrant.create({
      data: {
        userId: u.id,
        requestedBy: f.admin.id,
        approvedBy: u.id === f.approver.id ? f.secondApprover.id : f.approver.id,
        capability: 'authority.approve',
        scopeType: 'GLOBAL',
        reason,
        effectiveAt: new Date(Date.now() - 10000),
        approvedAt: new Date(Date.now() - 10000),
        expiresAt: new Date(Date.now() + 86400000),
      },
    });
  }
  async function grant(u: { id: string; email: string }, capability: string, code?: string) {
    const r = await f.agents
      .get(f.approver.id)!
      .post('/api/authority/grants')
      .send({
        userId: u.id,
        capability,
        scopeType: code ? 'SUPPORT_TOPIC' : 'GLOBAL',
        ...(code ? { scopeId: code } : {}),
        reason,
        effectiveAt: new Date(Date.now() - 1000).toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      })
      .expect(201);
    await f.agents
      .get(f.secondApprover.id)!
      .post('/api/authority/grants/' + r.body.id + '/approve')
      .expect(201);
    await login(u);
    return r.body.id as string;
  }
  await grant(f.academic, 'support.taxonomy.author');
  await grant(f.planningApprover, 'support.taxonomy.approve');
  const topics = [];
  for (const code of ['GENERAL', 'OTHER_SCOPE']) {
    const t = await f.agents
      .get(f.academic.id)!
      .post('/api/v2/support/topics')
      .send({
        idempotencyKey: randomUUID(),
        code,
        title: code === 'GENERAL' ? 'CSKH chung' : 'Phạm vi khác',
        routes: ['ACADEMIC', 'FINANCE', 'LEARNING'],
        reason,
      })
      .expect(201);
    await f.agents
      .get(f.planningApprover.id)!
      .post('/api/v2/support/topics/' + t.body.id + '/approve')
      .send({ idempotencyKey: randomUUID(), expectedLockVersion: 0, reason })
      .expect(201);
    topics.push({ id: t.body.id as string, code });
  }
  const grants: Record<string, string> = {};
  for (const u of [f.counselor, counselor2])
    for (const cap of ['read', 'assign', 'reply', 'transfer', 'close'])
      grants[u.id + cap] = await grant(u, 'support.ticket.' + cap, 'GENERAL');
  for (const u of [f.counselor, counselor2])
    grants[u.id + 'app'] = await grant(u, 'support.application.write', 'GENERAL');
  for (const u of [f.planningApprover, f.cashier, f.teacher])
    grants[u.id + 'referral'] = await grant(u, 'support.referral.respond', 'GENERAL');
  grants[f.planningApprover.id + 'review'] = await grant(
    f.planningApprover,
    'support.application.review',
    'GENERAL',
  );
  const maker = f.agents.get(f.academic.id)!,
    checker = f.agents.get(f.planningApprover.id)!,
    academic = '/api/v2/academic/';
  async function approved(
    kind: string,
    row: { id: string; lockVersion: number },
    extra: object = {},
  ) {
    const pending = (
      await maker
        .post(academic + kind + '/' + row.id + '/submit')
        .send({ reason, expectedLockVersion: row.lockVersion })
        .expect(201)
    ).body;
    return (
      await checker
        .post(academic + kind + '/' + row.id + '/approve')
        .send({ reason, expectedLockVersion: pending.lockVersion, ...extra })
        .expect(201)
    ).body;
  }
  const cv = (
    await maker
      .post(academic + 'programs/' + f.published.id + '/versions')
      .send({
        title: 'Synthetic counseling curriculum',
        description: 'Approved DEV class interest terms',
        level: 'TOEIC study',
        skillScope: 'LR',
        standardPricingType: 'FREE',
        standardTuitionFeeVnd: 0,
        effectiveFrom: new Date(Date.now() - 1000).toISOString(),
        reason,
      })
      .expect(201)
  ).body;
  const supportVersion = await approved('versions', cv);
  const supportClass = (
    await maker
      .post(academic + 'versions/' + supportVersion.id + '/offers')
      .send({
        code: 'W05A-' + randomUUID().slice(0, 8),
        name: 'Synthetic eligible counseling class',
        modality: 'ONLINE',
        maxStudents: 10,
        reason,
      })
      .expect(201)
  ).body;
  await d.prisma.classOffering.update({ where: { id: supportClass.id }, data: { status: 'OPEN' } });
  await grantAcademic(
    d.prisma,
    f.planningApprover.id,
    f.approver.id,
    f.secondApprover.id,
    'academic.schedule.approve',
    'CLASS',
    supportClass.id,
  );
  const assignment = (
    await maker
      .post(academic + 'classes/' + supportClass.id + '/assignments')
      .send({
        instructorId: f.teacher.id,
        effectiveFrom: new Date(Date.now() + 1000).toISOString(),
        effectiveTo: new Date(Date.now() + 30 * 86400000).toISOString(),
        reason,
      })
      .expect(201)
  ).body;
  const approvedAssignment = await approved('assignments', assignment, {
    eligibilityConfirmed: true,
  });
  const start = new Date(Date.now() + 3 * 86400000),
    end = new Date(start.getTime() + 3600000);
  const session = (
    await maker
      .post(academic + 'classes/' + supportClass.id + '/sessions')
      .send({
        startLocal: localMinute(start, 'Asia/Ho_Chi_Minh'),
        endLocal: localMinute(end, 'Asia/Ho_Chi_Minh'),
        timezone: 'Asia/Ho_Chi_Minh',
        modality: 'ONLINE',
        assignmentId: approvedAssignment.id,
        requiredCapabilities: [],
        reason,
      })
      .expect(201)
  ).body;
  await approved('sessions', session);
  return {
    ...f,
    counselor2,
    topics,
    supportGrants: grants,
    login,
    grant,
    supportClass,
    supportVersion,
  };
}
