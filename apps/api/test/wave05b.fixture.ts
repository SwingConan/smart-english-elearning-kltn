import { randomUUID } from 'node:crypto';
import * as request from 'supertest';
import { startWave01App, seedWave01 } from './wave01-postgres.fixture';
export async function setupW05B() {
  const d = await startWave01App(),
    f = await seedWave01(d.prisma),
    server = d.app.getHttpServer();
  try {
    const passwordHash = (await d.prisma.user.findUniqueOrThrow({ where: { id: f.learner.id } }))
      .passwordHash;
    const free = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        d.prisma.user.create({
          data: {
            email: 'w05b-' + randomUUID() + '@example.invalid',
            fullName: 'W05B Free synthetic ' + i,
            role: 'STUDENT',
            passwordHash,
          },
        }),
      ),
    );
    const login = async (u: { email: string }) => {
      const agent = request.agent(server);
      await agent
        .post('/api/auth/login')
        .send({ email: u.email, password: f.password })
        .expect(200);
      return agent;
    };
    const [hv, other, third, fourth, fifth, gv, , qt, tv, tn, tt, checker] = await Promise.all(
      [
        ...free,
        f.teacher,
        f.academic,
        f.admin,
        f.counselor,
        f.cashier,
        f.inspector,
        f.approver,
      ].map(login),
    );
    const command = async (
      agent: ReturnType<typeof request.agent>,
      op: string,
      body: Record<string, unknown> = {},
      status = 201,
    ) => {
      const response = await agent
        .post('/api/v2/consultations/commands')
        .send({ key: randomUUID(), op, ...body });
      if (response.status !== status)
        throw Error(
          'W05B ' +
            op +
            ' expected ' +
            status +
            ' got ' +
            response.status +
            ' ' +
            JSON.stringify(response.body),
        );
      return response.body;
    };
    const grant = async (capability: string) => {
      const { body: g } = await qt
        .post('/api/authority/grants')
        .send({
          userId: f.academic.id,
          capability,
          scopeType: 'TEACHER',
          scopeId: f.teacher.id,
          effectiveAt: new Date(Date.now() - 1000).toISOString(),
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
          reason: 'Synthetic scoped consultation DEV review',
        })
        .expect(201);
      await checker
        .post('/api/authority/grants/' + g.id + '/approve')
        .send()
        .expect(201);
      return g.id as string;
    };
    const grants: Record<string, string> = {};
    for (const c of [
      'consultation.profile.approve',
      'consultation.link.approve',
      'consultation.booking.review',
    ])
      grants[c] = await grant(c);
    // Approval revokes HVU sessions. Log in after all fixture grants.
    const reviewer = await login(f.academic);
    return {
      d,
      f,
      free,
      hv,
      other,
      third,
      fourth,
      fifth,
      gv,
      hvu: reviewer,
      qt,
      tv,
      tn,
      tt,
      checker,
      command,
      grants,
      login,
    };
  } catch (e) {
    await d.app.close();
    throw e;
  }
}
