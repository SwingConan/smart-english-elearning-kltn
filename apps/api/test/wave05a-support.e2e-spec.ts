import * as request from 'supertest';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { startWave01App } from './wave01-postgres.fixture';
import { seedWave05A } from './wave05a.fixture';
const base = '/api/v2/support',
  reason = 'Synthetic W05A reasoned action and immutable audit',
  key = () => randomUUID();
describe('W05A actual AppModule HTTP/PostgreSQL27', () => {
  let d: Awaited<ReturnType<typeof startWave01App>>,
    f: Awaited<ReturnType<typeof seedWave05A>>,
    ticket: string,
    guestTicket: string,
    referral: string,
    app: string;
  const evidence: unknown[] = [];
  const ag = (u: { id: string }) => f.agents.get(u.id)!;
  const hv = () => ag(f.learner),
    tv = () => ag(f.counselor),
    tv2 = () => ag(f.counselor2),
    hvu = () => ag(f.planningApprover);
  const change = (v: number) => ({ idempotencyKey: key(), expectedLockVersion: v, reason });
  async function detail() {
    return (
      await tv2()
        .get(base + '/tickets/' + ticket)
        .expect(200)
    ).body;
  }
  async function version() {
    return (await detail()).lockVersion as number;
  }
  beforeAll(async () => {
    process.env.W05A_ENABLED = 'DEV_SUPPORT';
    d = await startWave01App();
    f = await seedWave05A(d);
  }, 120000);
  afterAll(async () => {
    const evidenceRoot =
      process.env.S10_DEC045_EVIDENCE === '1'
        ? '.local-storage/v2-s10-dec045'
        : process.env.W05A_CF_EVIDENCE === '1'
          ? '.local-storage/v2-wave05a-cf01'
          : '.local-storage/v2-wave05a';
    await mkdir(evidenceRoot, { recursive: true });
    await writeFile(evidenceRoot + '/http-evidence.json', JSON.stringify(evidence, null, 2));
    await d?.app.close();
  });
  it('public approved topics only; no private guest tracking or fake verification/delivery', async () => {
    const r = await request(d.app.getHttpServer())
      .get(base + '/public/topics')
      .expect(200);
    expect(r.body.guestPrivateRead).toBe(false);
    expect(r.body.verificationProvider).toBe(false);
    expect(JSON.stringify(r.body)).not.toContain('authorId');
    await request(d.app.getHttpServer())
      .get(base + '/tickets/' + key())
      .expect(401);
  });
  it('intake rejects identity spoof, stale/forged cookie, sensitive content, missing consent and attachments', async () => {
    const b = {
      idempotencyKey: key(),
      topicId: f.topics[0].id,
      description: 'Synthetic legitimate request',
      consent: true,
      consentVersion: 'DEV_SUPPORT_V1',
      contactMethod: 'IN_APP',
    };
    await hv()
      .post(base + '/public/tickets')
      .send({ ...b, userId: f.otherLearner.id })
      .expect(400);
    await request(d.app.getHttpServer())
      .post(base + '/public/tickets')
      .set('Cookie', 'sel.sid=forged')
      .send(b)
      .expect(401);
    await hv()
      .post(base + '/public/tickets')
      .send({ ...b, consent: false })
      .expect(400);
    await hv()
      .post(base + '/public/tickets')
      .send({ ...b, description: 'password: secret' })
      .expect(400);
    await hv()
      .post(base + '/public/tickets')
      .send({ ...b, attachment: 'fake' })
      .expect(400);
    await hv()
      .post(base + '/public/tickets')
      .send({ ...b, contact: 'other@example.invalid' })
      .expect(400);
  });
  it('session-owned HV intake canonical retry creates one receipt; owner-only private access', async () => {
    const b = {
      idempotencyKey: key(),
      topicId: f.topics[0].id,
      description: 'Need English course and schedule advice, <script>text only</script>',
      consent: true,
      consentVersion: 'DEV_SUPPORT_V1',
      contactMethod: 'IN_APP',
    };
    const r = await hv()
      .post(base + '/public/tickets')
      .send(b)
      .expect(201);
    ticket = r.body.id;
    expect(r.body.reference).toMatch(/^SE-[a-f0-9]{36}$/);
    const replay = await hv()
      .post(base + '/public/tickets')
      .send(b)
      .expect(201);
    expect(replay.body).toEqual(r.body);
    await hv()
      .post(base + '/public/tickets')
      .send({ ...b, description: 'changed body same key' })
      .expect(409);
    await ag(f.otherLearner)
      .get(base + '/tickets/' + ticket)
      .expect(404);
    const t = await hv()
      .get(base + '/tickets/' + ticket)
      .expect(200);
    expect(t.body.identity).toBeUndefined();
    evidence.push({ sessionOwner: true, canonicalRetry: true, referenceNotAuthorization: true });
  });
  it('guest receipt is opaque, unverified and not linked by matching account contact', async () => {
    const r = await request(d.app.getHttpServer())
      .post(base + '/public/tickets')
      .send({
        idempotencyKey: key(),
        topicId: f.topics[0].id,
        description: 'Guest needs general course information',
        guestName: 'Synthetic Guest',
        contact: f.learner.email,
        contactMethod: 'EMAIL',
        consent: true,
        consentVersion: 'DEV_SUPPORT_V1',
      })
      .expect(201);
    expect(r.body.id).toBeUndefined();
    expect(r.body.contactVerified).toBe(false);
    expect(r.body.delivery).toBe('NOT_SENT');
    guestTicket = (
      await d.prisma.supportTicket.findUniqueOrThrow({ where: { reference: r.body.reference } })
    ).id;
    expect(
      (await d.prisma.supportTicket.findUniqueOrThrow({ where: { id: guestTicket } })).learnerId,
    ).toBeNull();
    await request(d.app.getHttpServer())
      .get(base + '/public/tickets/' + r.body.reference)
      .expect(404);
    await hv()
      .get(base + '/tickets/' + guestTicket)
      .expect(404);
  });
  it('role-only and wrong topic grants cannot expose inbox PII; unassigned summary has no body/contact', async () => {
    for (const u of [f.admin, f.teacher, f.academic, f.legacy])
      await ag(u)
        .get(base + '/tickets')
        .expect(403);
    const box = await tv()
      .get(base + '/tickets')
      .expect(200);
    expect(box.body.items.length).toBe(2);
    expect(JSON.stringify(box.body)).not.toContain('claimedContact');
    expect(JSON.stringify(box.body)).not.toContain('description');
    await tv()
      .get(base + '/tickets/' + ticket)
      .expect(404);
    await tv()
      .post(base + '/public/tickets')
      .send({
        idempotencyKey: key(),
        topicId: f.topics[0].id,
        description: 'Staff cannot impersonate learner',
        consent: true,
        consentVersion: 'DEV_SUPPORT_V1',
        contactMethod: 'IN_APP',
      })
      .expect(403);
  });
  it('topic-independent maker/checker and scoped grant validation are enforced', async () => {
    await tv()
      .post(base + '/topics')
      .send({ idempotencyKey: key(), code: 'DENIED', title: 'Denied topic', routes: [], reason })
      .expect(403);
    await ag(f.approver)
      .post('/api/authority/grants')
      .send({
        userId: f.counselor.id,
        capability: 'support.ticket.read',
        scopeType: 'GLOBAL',
        reason,
        effectiveAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60000).toISOString(),
      })
      .expect(400);
    const p = await ag(f.academic)
      .post(base + '/topics')
      .send({
        idempotencyKey: key(),
        code: 'PENDING_TOPIC',
        title: 'Private pending topic',
        routes: [],
        reason,
      })
      .expect(201);
    await ag(f.academic)
      .post(base + '/topics/' + p.body.id + '/approve')
      .send(change(0))
      .expect(403);
    const list = await request(d.app.getHttpServer())
      .get(base + '/public/topics')
      .expect(200);
    expect(JSON.stringify(list.body)).not.toContain(p.body.id);
  });
  it('authorized assignment, duplicate acknowledgment and wrong counselor private read', async () => {
    const b = { ...change(0), action: 'ASSIGN', targetId: f.counselor.id };
    await tv()
      .post(base + '/tickets/' + ticket + '/actions')
      .send(b)
      .expect(201);
    await tv()
      .post(base + '/tickets/' + ticket + '/actions')
      .send(b)
      .expect(201);
    await tv()
      .get(base + '/tickets/' + ticket)
      .expect(200);
    await tv2()
      .get(base + '/tickets/' + ticket)
      .expect(404);
    await tv()
      .post(base + '/tickets/' + guestTicket + '/actions')
      .send({ ...change(0), action: 'ASSIGN', targetId: f.counselor.id })
      .expect(201);
  });
  it('public reply and internal note are immutable/idempotent; learner never receives internal body/reason/event', async () => {
    let t = (await tv().get(base + '/tickets/' + ticket)).body;
    const b = {
      ...change(t.lockVersion),
      visibility: 'PUBLIC',
      body: 'Original visible counselor response',
    };
    const r = await tv()
      .post(base + '/tickets/' + ticket + '/messages')
      .send(b)
      .expect(201);
    expect(
      (
        await tv()
          .post(base + '/tickets/' + ticket + '/messages')
          .send(b)
          .expect(201)
      ).body,
    ).toEqual(r.body);
    t = (await tv().get(base + '/tickets/' + ticket)).body;
    await tv()
      .post(base + '/tickets/' + ticket + '/messages')
      .send({
        ...change(t.lockVersion),
        reason: 'Private note reason should never leak',
        visibility: 'INTERNAL',
        body: 'Private staff-only discussion',
      })
      .expect(201);
    const learner = (
      await hv()
        .get(base + '/tickets/' + ticket)
        .expect(200)
    ).body;
    expect(learner.messages).toHaveLength(1);
    expect(JSON.stringify(learner)).not.toMatch(
      /Private staff|Private note|INTERNAL_NOTE|staff-only/,
    );
    await hv()
      .post(base + '/tickets/' + ticket + '/messages')
      .send({ ...change(learner.lockVersion), visibility: 'INTERNAL', body: 'forbidden' })
      .expect(403);
    await expect(
      d.prisma.supportMessage.update({ where: { id: r.body.id }, data: { body: 'tamper' } }),
    ).rejects.toThrow();
  });
  it('real concurrent replies use CAS, one commit and one409 with original retained', async () => {
    const t = (await tv().get(base + '/tickets/' + ticket)).body,
      b = { ...change(t.lockVersion), visibility: 'PUBLIC', body: 'Concurrent original reply' };
    const rr = await Promise.all([
      tv()
        .post(base + '/tickets/' + ticket + '/messages')
        .send(b),
      tv()
        .post(base + '/tickets/' + ticket + '/messages')
        .send({ ...b, idempotencyKey: key(), body: 'Concurrent stale reply' }),
    ]);
    expect(rr.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(
      await d.prisma.supportMessage.count({
        where: { ticketId: ticket, body: { startsWith: 'Concurrent' } },
      }),
    ).toBe(1);
  });
  it('reassignment removes old counselor access; new owner keeps accountability and scopes', async () => {
    const t = (await tv().get(base + '/tickets/' + ticket)).body;
    await tv()
      .post(base + '/tickets/' + ticket + '/actions')
      .send({ ...change(t.lockVersion), action: 'ASSIGN', targetId: f.counselor2.id })
      .expect(201);
    await tv()
      .get(base + '/tickets/' + ticket)
      .expect(404);
    await tv2()
      .get(base + '/tickets/' + ticket)
      .expect(200);
    await tv()
      .post(base + '/tickets/' + ticket + '/messages')
      .send({ ...change(0), visibility: 'PUBLIC', body: 'stale owner blocked' })
      .expect(404);
  });
  it('unverified guest cannot become an application, even with TV and a matching email', async () => {
    const t = (await tv().get(base + '/tickets/' + guestTicket)).body;
    await tv()
      .post(base + '/tickets/' + guestTicket + '/applications')
      .send({
        ...change(t.lockVersion),
        reviewerId: f.planningApprover.id,
        needs: 'Guest counseling request needs',
        target: 'TOEIC course',
      })
      .expect(400);
  });
  it('assigned specialist gets only minimal referral, not ticket/contact/internal notes or class/payment authority', async () => {
    let v = await version();
    await tv2()
      .post(base + '/tickets/' + ticket + '/actions')
      .send({ ...change(v), action: 'TRANSITION', state: 'IN_PROGRESS' })
      .expect(201);
    v = await version();
    const b = {
      ...change(v),
      category: 'LEARNING',
      specialistId: f.teacher.id,
      summary: 'Please advise on study activities, no contact data',
    };
    const r = await tv2()
      .post(base + '/tickets/' + ticket + '/referrals')
      .send(b)
      .expect(201);
    referral = r.body.id;
    expect(
      (
        await tv2()
          .post(base + '/tickets/' + ticket + '/referrals')
          .send(b)
          .expect(201)
      ).body,
    ).toEqual(r.body);
    await tv2()
      .post(base + '/tickets/' + ticket + '/referrals')
      .send({ ...b, ...change(await version()) })
      .expect(409);
    const list = (
      await ag(f.teacher)
        .get(base + '/referrals')
        .expect(200)
    ).body;
    expect(list.items).toHaveLength(1);
    expect(JSON.stringify(list)).not.toMatch(
      /learnerId|claimedContact|description|ticketId|reason|actorId|Private staff/,
    );
    await ag(f.teacher)
      .get(base + '/tickets/' + ticket)
      .expect(404);
    await ag(f.cashier)
      .post(base + '/referrals/' + referral + '/respond')
      .send({ ...change(0), response: 'Wrong specialist' })
      .expect(404);
  });
  it('referral response one-time CAS retry; completed referral remains protected', async () => {
    const b = { ...change(0), response: 'Original learning advice for the counselor' };
    const rr = await ag(f.teacher)
      .post(base + '/referrals/' + referral + '/respond')
      .send(b)
      .expect(201);
    expect(
      (
        await ag(f.teacher)
          .post(base + '/referrals/' + referral + '/respond')
          .send(b)
          .expect(201)
      ).body,
    ).toEqual(rr.body);
    await ag(f.teacher)
      .post(base + '/referrals/' + referral + '/respond')
      .send({ ...change(1), response: 'overwrite denied' })
      .expect(409);
  });
  it('concurrent resolve, closed reply rejection, learner reasoned reopen and immutable events', async () => {
    const v = await version(),
      b = { ...change(v), action: 'TRANSITION', state: 'RESOLVED' };
    const rr = await Promise.all([
      tv2()
        .post(base + '/tickets/' + ticket + '/actions')
        .send(b),
      tv2()
        .post(base + '/tickets/' + ticket + '/actions')
        .send({ ...b, idempotencyKey: key() }),
    ]);
    expect(rr.map((x) => x.status).sort()).toEqual([201, 409]);
    await hv()
      .post(base + '/tickets/' + ticket + '/actions')
      .send({ ...change(await version()), action: 'TRANSITION', state: 'CLOSED' })
      .expect(201);
    await hv()
      .post(base + '/tickets/' + ticket + '/messages')
      .send({ ...change(await version()), visibility: 'PUBLIC', body: 'must reopen' })
      .expect(409);
    await hv()
      .post(base + '/tickets/' + ticket + '/actions')
      .send({ ...change(await version()), action: 'TRANSITION', state: 'REOPENED' })
      .expect(201);
    await tv2()
      .post(base + '/tickets/' + ticket + '/actions')
      .send({ ...change(await version()), action: 'TRANSITION', state: 'IN_PROGRESS' })
      .expect(201);
    await expect(
      d.prisma.supportEvent.deleteMany({ where: { ticketId: ticket } }),
    ).rejects.toThrow();
  });
  it('purpose consent is only actual owner, append-only and required before TV draft', async () => {
    const b = {
      ...change(await version()),
      reviewerId: f.planningApprover.id,
      needs: 'Actual synthetic learner asks for evening English',
      target: 'Improve TOEIC study',
      goalLR: 650,
    };
    await tv2()
      .post(base + '/tickets/' + ticket + '/applications')
      .send(b)
      .expect(403);
    await tv2()
      .post(base + '/tickets/' + ticket + '/consents')
      .send({ ...change(await version()), purpose: 'APPLICATION', granted: true })
      .expect(404);
    await hv()
      .post(base + '/tickets/' + ticket + '/consents')
      .send({ ...change(await version()), purpose: 'APPLICATION', granted: true })
      .expect(201);
    const r = await tv2()
      .post(base + '/tickets/' + ticket + '/applications')
      .send({ ...b, ...change(await version()) })
      .expect(201);
    app = r.body.id;
    const row = await d.prisma.counselingApplication.findUniqueOrThrow({ where: { id: app } });
    expect(row.goalLR).toBe(650);
    expect((row.provenance as { declaredGoalsNotMeasured: boolean }).declaredGoalsNotMeasured).toBe(
      true,
    );
    expect(row.placementAttemptId).toBeNull();
  });
  it('immutable submission, assigned HVU-only review and correction creates new version', async () => {
    const b = { ...change(0), action: 'SUBMIT' };
    const submit = await tv2()
      .post(base + '/applications/' + app + '/actions')
      .send(b)
      .expect(201);
    expect(
      (
        await tv2()
          .post(base + '/applications/' + app + '/actions')
          .send(b)
          .expect(201)
      ).body,
    ).toEqual(submit.body);
    const original = (
      await d.prisma.counselingApplication.findUniqueOrThrow({ where: { id: app } })
    ).snapshot;
    await ag(f.academic)
      .get(base + '/applications')
      .expect(200)
      .then((r) => expect(r.body.items).toHaveLength(0));
    await ag(f.academic)
      .post(base + '/applications/' + app + '/actions')
      .send({ ...change(1), action: 'REQUEST_CORRECTION' })
      .expect(404);
    await hvu()
      .post(base + '/applications/' + app + '/actions')
      .send({ ...change(1), action: 'REQUEST_CORRECTION' })
      .expect(201);
    await expect(
      d.prisma.counselingApplication.update({
        where: { id: app },
        data: { needs: 'rewrite published snapshot' },
      }),
    ).rejects.toThrow();
    const r = await tv2()
      .post(base + '/tickets/' + ticket + '/applications')
      .send({
        ...change(await version()),
        reviewerId: f.planningApprover.id,
        needs: 'Corrected needs and original learner requirements',
        target: 'Evening learning support',
        goalSpeaking: 0,
      })
      .expect(201);
    expect(r.body.number).toBe(2);
    expect(
      (await d.prisma.counselingApplication.findUniqueOrThrow({ where: { id: app } })).snapshot,
    ).toEqual(original);
    app = r.body.id;
  });
  it('revoked consent prevents submission; restoration is new consent, not rewritten history', async () => {
    await hv()
      .post(base + '/tickets/' + ticket + '/consents')
      .send({ ...change(await version()), purpose: 'APPLICATION', granted: false })
      .expect(201);
    await tv2()
      .post(base + '/applications/' + app + '/actions')
      .send({ ...change(0), action: 'SUBMIT' })
      .expect(403);
    await hv()
      .post(base + '/tickets/' + ticket + '/consents')
      .send({ ...change(await version()), purpose: 'APPLICATION', granted: true })
      .expect(201);
    await tv2()
      .post(base + '/applications/' + app + '/actions')
      .send({ ...change(0), action: 'SUBMIT' })
      .expect(201);
    await hvu()
      .post(base + '/applications/' + app + '/actions')
      .send({ ...change(1), action: 'REQUEST_CORRECTION' })
      .expect(201);
  });
  it('synthetic Placement and cross-learner attempts cannot be counseling measured evidence', async () => {
    const source = await d.prisma.test.create({
        data: {
          title: 'Synthetic unversioned Placement is not evidence',
          purpose: 'PLACEMENT',
          placementMode: 'LR',
          status: 'DRAFT',
        },
      }),
      attempt = await d.prisma.testAttempt.create({
        data: {
          testId: source.id,
          attemptNumber: 1,
          learnerId: f.learner.id,
          status: 'IN_PROGRESS',
        },
      });
    await ag(f.otherLearner)
      .post(base + '/tickets/' + ticket + '/consents')
      .send({
        ...change(await version()),
        purpose: 'PLACEMENT',
        attemptId: attempt.id,
        granted: true,
      })
      .expect(404);
    await hv()
      .post(base + '/tickets/' + ticket + '/consents')
      .send({
        ...change(await version()),
        purpose: 'PLACEMENT',
        attemptId: attempt.id,
        granted: true,
      })
      .expect(201);
    await tv2()
      .post(base + '/tickets/' + ticket + '/applications')
      .send({
        ...change(await version()),
        reviewerId: f.planningApprover.id,
        needs: 'Keep measured level unknown without genuine publication',
        target: 'Future English course',
        placementAttemptId: attempt.id,
      })
      .expect(400);
  });
  it('approved actual CourseVersion/class appears as interest; drafting never reserves a seat or changes tuition', async () => {
    const options = (
      await tv2()
        .get(base + '/tickets/' + ticket + '/interests')
        .expect(200)
    ).body;
    expect(options.classes.some((c: { id: string }) => c.id === f.supportClass.id)).toBe(true);
    const before = await d.prisma.classOffering.findUniqueOrThrow({
        where: { id: f.supportClass.id },
      }),
      enrolled = await d.prisma.enrollment.count({ where: { classOfferingId: f.supportClass.id } });
    await tv2()
      .post(base + '/tickets/' + ticket + '/applications')
      .send({
        ...change(await version()),
        reviewerId: f.planningApprover.id,
        needs: 'Actual class interest with approved curriculum',
        target: 'LR English learning',
        classId: f.supportClass.id,
        courseVersionId: f.supportVersion.id,
      })
      .expect(201);
    expect(
      await d.prisma.classOffering.findUniqueOrThrow({ where: { id: f.supportClass.id } }),
    ).toEqual(before);
    expect(await d.prisma.enrollment.count({ where: { classOfferingId: f.supportClass.id } })).toBe(
      enrolled,
    );
  });
  it('direct SQL lacks actor authority; topic/message/event/application histories cannot be silently overwritten', async () => {
    await expect(
      d.prisma.supportMessage.create({
        data: {
          ticketId: ticket,
          actorId: f.learner.id,
          visibility: 'PUBLIC',
          body: 'Unauthenticated SQL INSERT must be denied',
        },
      }),
    ).rejects.toThrow();
    await expect(
      d.prisma.supportTicket.update({
        where: { id: ticket },
        data: { ownerId: f.counselor.id, lockVersion: { increment: 1 } },
      }),
    ).rejects.toThrow();
    await expect(
      d.prisma.supportReferral.update({
        where: { id: referral },
        data: { summary: 'tamper private referral' },
      }),
    ).rejects.toThrow();
    await expect(d.prisma.$executeRawUnsafe('TRUNCATE support_requests')).rejects.toThrow();
  });
  it('revocation invalidates session and current scoped authority after relogin', async () => {
    await ag(f.approver)
      .post('/api/authority/grants/' + f.supportGrants[f.counselor2.id + 'read'] + '/revoke')
      .send({ reason })
      .expect(201);
    await tv2()
      .get(base + '/tickets/' + ticket)
      .expect(401);
    await f.login(f.counselor2);
    await tv2()
      .get(base + '/tickets/' + ticket)
      .expect(403);
    await ag(f.approver)
      .post('/api/authority/grants/' + f.supportGrants[f.teacher.id + 'referral'] + '/revoke')
      .send({ reason })
      .expect(201);
    await ag(f.teacher)
      .get(base + '/referrals')
      .expect(401);
    await f.login(f.teacher);
    expect(
      (
        await ag(f.teacher)
          .get(base + '/referrals')
          .expect(200)
      ).body.items,
    ).toHaveLength(0);
  });
  it('Guest quota survives concurrent requests/restart and cannot be evaded by forwarded contact/IP claims', async () => {
    const payload = {
      topicId: f.topics[0].id,
      description: 'Bounded synthetic anti spam probe only',
      guestName: 'Synthetic quota probe',
      contactMethod: 'EMAIL',
      consent: true,
      consentVersion: 'DEV_SUPPORT_V1',
    };
    const rr = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        request(d.app.getHttpServer())
          .post(base + '/public/tickets')
          .set('X-Forwarded-For', '198.51.100.' + (i + 1))
          .send({ ...payload, idempotencyKey: key(), contact: 'quota' + i + '@example.invalid' }),
      ),
    );
    expect(rr.filter((x) => x.status === 201).length).toBeLessThanOrEqual(4);
    expect(rr.some((x) => x.status === 429)).toBe(true);
    expect(rr.every((x) => [201, 429].includes(x.status))).toBe(true);
    evidence.push({ spamStatuses: rr.map((x) => x.status), forwardedForNotTrusted: true });
  });
  it('application restart retains ticket/messages/snapshots and creates no enrollment/payment/LMS changes', async () => {
    const before = {
      tickets: await d.prisma.supportTicket.count(),
      messages: await d.prisma.supportMessage.count(),
      apps: await d.prisma.counselingApplication.count(),
      enrollments: await d.prisma.enrollment.count(),
    };
    await d.app.close();
    d = await startWave01App();
    expect(await d.prisma.supportTicket.count()).toBe(before.tickets);
    expect(await d.prisma.supportMessage.count()).toBe(before.messages);
    expect(await d.prisma.counselingApplication.count()).toBe(before.apps);
    expect(await d.prisma.enrollment.count()).toBe(before.enrollments);
    evidence.push({
      restart: true,
      before,
      noEnrollmentCommands: true,
      noPaymentCommands: true,
      providerSends: 0,
    });
  });
  it('persists UTF-8 event labels in PostgreSQL and projects unchanged Unicode over private HTTP', async () => {
    const events = await d.prisma.supportEvent.findMany({ where: { ticketId: ticket } });
    expect(events.length).toBeGreaterThan(5);
    const labels = events.map((e) => e.publicLabel);
    expect(labels).toContain('Đã nhận phiếu');
    expect(labels).toContain('Có phản hồi mới');
    expect(labels).toContain('Lựa chọn đồng ý đã được lưu');
    expect(labels).toContain('Phiếu đang được hỗ trợ chuyên môn');
    expect(labels).toContain('Hồ sơ tư vấn đã được cập nhật');
    expect(labels.every((label) => !/Ã|Ä|áº|á»/.test(label))).toBe(true);
    const session = request.agent(d.app.getHttpServer());
    await session
      .post('/api/auth/login')
      .send({ email: f.learner.email, password: f.password })
      .expect(200);
    const result = await session.get(base + '/tickets/' + ticket).expect(200);
    expect(result.body.events.map((e: { label: string }) => e.label)).toContain('Đã nhận phiếu');
    expect(JSON.stringify(result.body.events)).not.toContain('Thông tin xử lý nội bộ');
    evidence.push({
      unicode: true,
      databaseEvents: events.length,
      labels,
      internalAudienceUnchanged: true,
    });
  });
});
