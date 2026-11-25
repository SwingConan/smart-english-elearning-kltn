import * as request from 'supertest';
import { randomUUID } from 'node:crypto';
import { seedWave02B, grantAcademic } from './wave02b.fixture';
import type { startWave01App } from './wave01-postgres.fixture';
export async function seedWave07(d: Awaited<ReturnType<typeof startWave01App>>) {
  const f = await seedWave02B(d.prisma),
    cashier2 = await d.prisma.user.create({
      data: {
        email: 'w07-checker-' + randomUUID() + '@example.invalid',
        fullName: 'W07 TEST Finance Checker',
        role: 'CASHIER',
        passwordHash: f.cashier.passwordHash,
      },
    }),
    ungrantedCashier = await d.prisma.user.create({
      data: {
        email: 'w07-no-grant-' + randomUUID() + '@example.invalid',
        fullName: 'W07 TEST Ungranted Cashier',
        role: 'CASHIER',
        passwordHash: f.cashier.passwordHash,
      },
    }),
    agents = new Map<string, ReturnType<typeof request.agent>>();
  for (const u of [
    ...f.users,
    f.otherAcademic,
    f.ungrantedAcademic,
    ...f.contenders,
    cashier2,
    ungrantedCashier,
  ]) {
    const agent = request.agent(d.app.getHttpServer());
    await agent.post('/api/auth/login').send({ email: u.email, password: f.password }).expect(200);
    agents.set(u.id, agent);
  }
  const owner = agents.get(f.academic.id)!,
    checker = agents.get(f.planningApprover.id)!,
    reason = 'W07 SYNTHETIC TEST fixture — no real money';
  const [clock] = await d.prisma.$queryRaw<
    { ms: number }[]
  >`SELECT extract(epoch FROM clock_timestamp())::double precision*1000 AS ms`;
  async function version(amount: number, type: 'PAID' | 'FREE' = 'PAID') {
    const v = await owner
      .post('/api/v2/academic/programs/' + f.published.id + '/versions')
      .send({
        title: 'W07 TEST approved program ' + amount,
        description: 'Synthetic class admission price vintage',
        level: 'BASIC',
        skillScope: 'LR',
        standardPricingType: type,
        standardTuitionFeeVnd: amount,
        effectiveFrom: new Date(clock.ms - 1000).toISOString(),
        reason,
      })
      .expect(201);
    const s = await owner
      .post('/api/v2/academic/versions/' + v.body.id + '/submit')
      .send({ expectedLockVersion: 0, reason })
      .expect(201);
    await checker
      .post('/api/v2/academic/versions/' + v.body.id + '/approve')
      .send({ expectedLockVersion: s.body.lockVersion, reason })
      .expect(201);
    return v.body.id as string;
  }
  const paidVersion = await version(1000000),
    freeVersion = await version(0, 'FREE');
  async function offering(name: string, capacity: number, v = paidVersion) {
    const c = await owner
      .post('/api/v2/academic/versions/' + v + '/offers')
      .send({
        code: 'W07-' + name + '-' + randomUUID().slice(0, 8),
        name: 'W07 TEST ' + name,
        modality: 'ONLINE',
        maxStudents: capacity,
        reason,
      })
      .expect(201);
    // New synthetic fixture only: explicit published operational class, immutable approved terms unchanged.
    return d.prisma.classOffering.update({
      where: { id: c.body.id },
      data: { status: 'OPEN', instructorId: f.teacher.id },
    });
  }
  const normal = await offering('normal', 10),
    raceHttp = await offering('race-http', 1),
    racePg = await offering('race-pg', 1),
    overpay = await offering('overpay', 5),
    reverse = await offering('reverse', 5),
    cancel = await offering('cancel', 5),
    free = await offering('free-policy', 5, freeVersion),
    unknown = f.classroom;
  const classes = { normal, raceHttp, racePg, overpay, reverse, cancel, free, unknown };
  const grants = [];
  for (const c of Object.values(classes)) {
    for (const u of [f.academic, f.planningApprover])
      grants.push(
        await grantAcademic(
          d.prisma,
          u.id,
          f.approver.id,
          f.secondApprover.id,
          'academic.admission.approve',
          'CLASS',
          c.id,
        ),
      );
    for (const u of [f.cashier, cashier2])
      for (const cap of ['finance.verify', 'finance.adjust.propose', 'finance.adjust.approve'])
        grants.push(
          await grantAcademic(
            d.prisma,
            u.id,
            f.approver.id,
            f.secondApprover.id,
            cap,
            'CLASS',
            c.id,
          ),
        );
  }
  const lesson = await agents
    .get(f.teacher.id)!
    .post('/api/v2/class-lms/classes/' + normal.id + '/sections')
    .send({
      title: 'W07 TEST learning section',
      introduction: 'Visible only after canonical ACTIVE entitlement',
    })
    .expect(201);
  await agents
    .get(f.teacher.id)!
    .post('/api/v2/class-lms/classes/' + normal.id + '/sections/' + lesson.body.id + '/publish')
    .send({ expectedLockVersion: 0 })
    .expect(201);
  return {
    ...f,
    cashier2,
    ungrantedCashier,
    agents,
    classes,
    paidVersion,
    freeVersion,
    version,
    offering,
    grants,
  };
}
