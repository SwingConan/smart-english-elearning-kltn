import { randomUUID } from 'node:crypto';
import { startWave01App } from './wave01-postgres.fixture';
import { seedWave05A } from './wave05a.fixture';
import { grantAcademic } from './wave02b.fixture';
const support = '/api/v2/support/',
  base = '/api/v2/admissions-finance/',
  reason = 'W07 SYNTHETIC provenance test only';
describe('W07 optional verified W05A provenance, actual independent HTTP handoff', () => {
  let d: Awaited<ReturnType<typeof startWave01App>>,
    f: Awaited<ReturnType<typeof seedWave05A>>,
    ticket: string,
    referral: string,
    classId: string;
  const change = (v: number) => ({ idempotencyKey: randomUUID(), expectedLockVersion: v, reason }),
    command = () => ({ key: randomUUID(), reason });
  const api = (u: { id: string }) => f.agents.get(u.id)!;
  const version = async () =>
    (
      await api(f.learner)
        .get(support + 'tickets/' + ticket)
        .expect(200)
    ).body.lockVersion as number;
  const apply = (u = f.learner) =>
    api(u)
      .post(base + 'applications')
      .send({
        key: randomUUID(),
        classId,
        referralId: referral,
        consent: true,
        consentVersion: 'W07_SYNTHETIC_ADMISSION_V1',
      });
  beforeAll(async () => {
    process.env.W05A_ENABLED = 'DEV_SUPPORT';
    process.env.W07_ENABLED = 'DEV_DEC049';
    d = await startWave01App();
    f = await seedWave05A(d);
    const path = '/api/v2/academic/',
      owner = api(f.academic),
      checker = api(f.planningApprover);
    const v = (
      await owner
        .post(path + 'programs/' + f.published.id + '/versions')
        .send({
          title: 'W07 TEST referral paid vintage',
          description: 'Known synthetic paid course version',
          level: 'BASIC',
          skillScope: 'LR',
          standardPricingType: 'PAID',
          standardTuitionFeeVnd: 1000000,
          effectiveFrom: new Date(Date.now() - 1000).toISOString(),
          reason,
        })
        .expect(201)
    ).body;
    const pending = (
      await owner
        .post(path + 'versions/' + v.id + '/submit')
        .send({ expectedLockVersion: 0, reason })
        .expect(201)
    ).body;
    await checker
      .post(path + 'versions/' + v.id + '/approve')
      .send({ expectedLockVersion: pending.lockVersion, reason })
      .expect(201);
    const c = (
      await owner
        .post(path + 'versions/' + v.id + '/offers')
        .send({
          code: 'W07-REF-' + randomUUID().slice(0, 8),
          name: 'W07 TEST referral class',
          modality: 'ONLINE',
          maxStudents: 5,
          reason,
        })
        .expect(201)
    ).body;
    classId = c.id;
    await d.prisma.classOffering.update({ where: { id: classId }, data: { status: 'OPEN' } });
    await grantAcademic(
      d.prisma,
      f.planningApprover.id,
      f.approver.id,
      f.secondApprover.id,
      'academic.admission.approve',
      'CLASS',
      classId,
    );
    await checker
      .post(base + 'classes/' + classId + '/enable')
      .send(command())
      .expect(201);
    ticket = (
      await api(f.learner)
        .post(support + 'public/tickets')
        .send({
          idempotencyKey: randomUUID(),
          topicId: f.topics[0].id,
          description: 'Synthetic TOEIC course request, no personal or bank content',
          consent: true,
          consentVersion: 'DEV_SUPPORT_V1',
          contactMethod: 'IN_APP',
        })
        .expect(201)
    ).body.id;
    await api(f.counselor)
      .post(support + 'tickets/' + ticket + '/actions')
      .send({ ...change(0), action: 'ASSIGN', targetId: f.counselor.id })
      .expect(201);
    await api(f.learner)
      .post(support + 'tickets/' + ticket + '/consents')
      .send({ ...change(await version()), purpose: 'APPLICATION', granted: true })
      .expect(201);
    referral = (
      await api(f.counselor)
        .post(support + 'tickets/' + ticket + '/applications')
        .send({
          ...change(await version()),
          reviewerId: f.planningApprover.id,
          needs: 'Synthetic learner wants evening TOEIC learning',
          target: 'Improve TOEIC study',
        })
        .expect(201)
    ).body.id;
  }, 120000);
  afterAll(async () => {
    await d?.app.close();
  });
  it('draft or merely submitted counseling never constitutes verified admission provenance', async () => {
    await apply().expect(409);
    await api(f.counselor)
      .post(support + 'applications/' + referral + '/actions')
      .send({ ...change(0), action: 'SUBMIT' })
      .expect(201);
    await apply().expect(409);
    expect(await d.prisma.w07Application.count()).toBe(0);
  });
  it('independent assigned HVU ACK permits own snapshot but creates no fee/seat/LMS', async () => {
    await api(f.planningApprover)
      .post(support + 'applications/' + referral + '/actions')
      .send({ ...change(1), action: 'ACKNOWLEDGE' })
      .expect(201);
    const r = await apply().expect(201);
    const row = await d.prisma.w07Application.findUniqueOrThrow({ where: { id: r.body.id } });
    expect(row.referralId).toBe(referral);
    expect(row.referralNumber).toBe(1);
    expect(row.referralConsentId).not.toBeNull();
    expect(row.state).toBe('SUBMITTED');
    expect(await d.prisma.w07Obligation.count()).toBe(0);
    expect(await d.prisma.enrollment.count({ where: { classOfferingId: classId } })).toBe(0);
    const view = (
      await api(f.learner)
        .get(base + 'applications/' + row.id)
        .expect(200)
    ).body;
    expect(JSON.stringify(view)).not.toMatch(
      /claimedContact|passwordHash|internalNotes|Synthetic TOEIC course request/,
    );
  });
  it('foreign learner or withdrawn purpose consent cannot attach or list private provenance', async () => {
    const denied = await apply(f.otherLearner).expect(409);
    const absent = await api(f.otherLearner)
      .post(base + 'applications')
      .send({
        key: randomUUID(),
        classId,
        referralId: randomUUID(),
        consent: true,
        consentVersion: 'W07_SYNTHETIC_ADMISSION_V1',
      })
      .expect(409);
    expect(denied.body).toEqual(absent.body);
    expect(
      (
        await api(f.otherLearner)
          .get(base + 'referrals')
          .expect(200)
      ).body.data,
    ).toEqual([]);
    await api(f.learner)
      .post(support + 'tickets/' + ticket + '/consents')
      .send({ ...change(await version()), purpose: 'APPLICATION', granted: false })
      .expect(201);
    expect(
      (
        await api(f.learner)
          .get(base + 'referrals')
          .expect(200)
      ).body.data,
    ).toEqual([]);
    await apply().expect(409);
    expect(await d.prisma.enrollment.count({ where: { classOfferingId: classId } })).toBe(0);
  });
});
