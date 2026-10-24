import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import * as argon2 from 'argon2';
import { createHash } from 'crypto';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureHttpApplication } from '../src/app.setup';
import { Prisma, UserRole, UserStatus } from '../src/generated/prisma/client';
import { EmailMessage, EmailSender } from '../src/infrastructure/email/email-sender';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';

class CaptureEmailSender extends EmailSender {
  messages: EmailMessage[] = [];

  async send(message: EmailMessage): Promise<void> {
    this.messages.push(message);
  }
}

describe('Password recovery (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const previousTrustProxy = process.env.TRUST_PROXY;
  const emailSender = new CaptureEmailSender();
  const unique = `${Date.now()}-${process.pid}`;
  const emails = {
    reset: `reset-${unique}@example.com`,
    active: `active-${unique}@example.com`,
    inactive: `inactive-${unique}@example.com`,
    locked: `locked-${unique}@example.com`,
    replacement: `replacement-${unique}@example.com`,
    statusChange: `status-change-${unique}@example.com`,
  };
  const oldPassword = 'Old-password-2026';
  const newPassword = 'New-password-2026';

  beforeAll(async () => {
    process.env.TRUST_PROXY = 'loopback';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EmailSender)
      .useValue(emailSender)
      .compile();

    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureHttpApplication(app, app.get(ConfigService));
    expect(app.getHttpAdapter().getInstance().get('trust proxy')).toEqual(['loopback']);
    await app.init();
    prisma = app.get(PrismaService);

    await prisma.user.deleteMany({ where: { email: { in: Object.values(emails) } } });
    const passwordHash = await argon2.hash(oldPassword, { type: argon2.argon2id });
    await prisma.user.createMany({
      data: [
        {
          email: emails.reset,
          passwordHash,
          fullName: 'Reset User',
          role: UserRole.STUDENT,
          status: UserStatus.ACTIVE,
        },
        {
          email: emails.active,
          passwordHash,
          fullName: 'Active User',
          role: UserRole.STUDENT,
          status: UserStatus.ACTIVE,
        },
        {
          email: emails.inactive,
          passwordHash,
          fullName: 'Inactive User',
          role: UserRole.STUDENT,
          status: UserStatus.INACTIVE,
        },
        {
          email: emails.locked,
          passwordHash,
          fullName: 'Locked User',
          role: UserRole.STUDENT,
          status: UserStatus.LOCKED,
        },
        {
          email: emails.replacement,
          passwordHash,
          fullName: 'Replacement User',
          role: UserRole.STUDENT,
          status: UserStatus.ACTIVE,
        },
        {
          email: emails.statusChange,
          passwordHash,
          fullName: 'Status User',
          role: UserRole.STUDENT,
          status: UserStatus.ACTIVE,
        },
      ],
    });
  });

  afterAll(async () => {
    if (prisma) {
      const users = await prisma.user.findMany({
        where: { email: { in: Object.values(emails) } },
        select: { id: true },
      });
      for (const user of users) {
        await prisma.$executeRaw(
          Prisma.sql`DELETE FROM "user_sessions" WHERE "sess" ->> 'userId' = ${user.id}`,
        );
      }
      await prisma.user.deleteMany({ where: { email: { in: Object.values(emails) } } });
    }
    if (app) await app.close();
    if (previousTrustProxy === undefined) delete process.env.TRUST_PROXY;
    else process.env.TRUST_PROXY = previousTrustProxy;
  });

  it('rejects malformed and extra request fields', async () => {
    await resetRequest({ email: 'not-an-email' }, '198.51.100.1').expect(400);
    await resetRequest({ email: emails.active, extra: true }, '198.51.100.2').expect(400);
  });

  it('makes ACTIVE, unknown, INACTIVE, and LOCKED public responses indistinguishable', async () => {
    emailSender.messages.length = 0;
    const responses = await Promise.all([
      resetRequest({ email: emails.active }, '198.51.100.3'),
      resetRequest({ email: `unknown-${unique}@example.com` }, '198.51.100.4'),
      resetRequest({ email: emails.inactive }, '198.51.100.5'),
      resetRequest({ email: emails.locked }, '198.51.100.6'),
    ]);

    for (const response of responses) {
      expect(response.status).toBe(202);
      expect(response.text).toBe(responses[0].text);
      expect(response.body).not.toHaveProperty('token');
    }
    expect(emailSender.messages).toHaveLength(1);
    expect(emailSender.messages[0]?.to).toBe(emails.active);
  });

  it('stores only a SHA-256 token hash and performs one-time reset with all-session invalidation', async () => {
    emailSender.messages.length = 0;
    const resetUser = await prisma.user.findUniqueOrThrow({ where: { email: emails.reset } });
    const agentOne = request.agent(app.getHttpServer());
    const agentTwo = request.agent(app.getHttpServer());
    await agentOne
      .post('/api/auth/login')
      .send({ email: emails.reset, password: oldPassword })
      .expect(200);
    await agentTwo
      .post('/api/auth/login')
      .send({ email: emails.reset, password: oldPassword })
      .expect(200);
    expect(await sessionCount(resetUser.id)).toBe(2);

    const publicResponse = await resetRequest(
      { email: `  ${emails.reset.toUpperCase()}  ` },
      '198.51.100.7',
    ).expect(202);
    const rawToken = tokenFromMessage(emailSender.messages.at(-1));
    expect(publicResponse.text).not.toContain(rawToken);
    const persisted = await prisma.passwordResetToken.findFirstOrThrow({
      where: { userId: resetUser.id },
      orderBy: { createdAt: 'desc' },
    });
    expect(persisted.tokenHash).toBe(createHash('sha256').update(rawToken).digest('hex'));
    expect(JSON.stringify(persisted)).not.toContain(rawToken);

    await request(app.getHttpServer())
      .post('/api/auth/password-reset/confirm')
      .send({ token: rawToken, newPassword })
      .expect(204);
    await agentOne.get('/api/auth/me').expect(401);
    await agentTwo.get('/api/auth/me').expect(401);
    expect(await sessionCount(resetUser.id)).toBe(0);
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: emails.reset, password: oldPassword })
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: emails.reset, password: newPassword })
      .expect(200);
    await request(app.getHttpServer())
      .post('/api/auth/password-reset/confirm')
      .send({ token: rawToken, newPassword: 'Another-password-2026' })
      .expect(400);
  });

  it('rejects expired tokens generically', async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { email: emails.active } });
    const rawToken = `expired-${unique}`;
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: createHash('sha256').update(rawToken).digest('hex'),
        expiresAt: new Date(Date.now() - 1000),
      },
    });
    const response = await request(app.getHttpServer())
      .post('/api/auth/password-reset/confirm')
      .send({ token: rawToken, newPassword })
      .expect(400);
    expect(response.body.message).toBe('Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.');
  });

  it('revokes an old token when a newer eligible request is issued', async () => {
    emailSender.messages.length = 0;
    const user = await prisma.user.findUniqueOrThrow({ where: { email: emails.replacement } });
    await resetRequest({ email: emails.replacement }, '198.51.100.8').expect(202);
    const oldRawToken = tokenFromMessage(emailSender.messages.at(-1));
    const oldHash = createHash('sha256').update(oldRawToken).digest('hex');
    await prisma.passwordResetToken.update({
      where: { tokenHash: oldHash },
      data: { createdAt: new Date(Date.now() - 61_000) },
    });
    await resetRequest({ email: emails.replacement }, '198.51.100.9').expect(202);
    const newRawToken = tokenFromMessage(emailSender.messages.at(-1));
    expect(newRawToken).not.toBe(oldRawToken);
    await expect(
      prisma.passwordResetToken.findUniqueOrThrow({ where: { tokenHash: oldHash } }),
    ).resolves.toMatchObject({ userId: user.id, revokedAt: expect.any(Date) });
    await request(app.getHttpServer())
      .post('/api/auth/password-reset/confirm')
      .send({ token: oldRawToken, newPassword })
      .expect(400);
  });

  it('rejects confirmation if the account becomes LOCKED after issuance', async () => {
    emailSender.messages.length = 0;
    await resetRequest({ email: emails.statusChange }, '198.51.100.10').expect(202);
    const rawToken = tokenFromMessage(emailSender.messages.at(-1));
    await prisma.user.update({
      where: { email: emails.statusChange },
      data: { status: UserStatus.LOCKED },
    });
    await request(app.getHttpServer())
      .post('/api/auth/password-reset/confirm')
      .send({ token: rawToken, newPassword })
      .expect(400);
  });

  it('throttles the sixth request from one IP without consuming another IP quota', async () => {
    const exhaustedIp = '198.51.100.200';
    const independentIp = '198.51.100.201';
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await resetRequest({ email: `throttle-${unique}@example.com` }, exhaustedIp).expect(202);
    }
    await resetRequest({ email: `throttle-${unique}@example.com` }, exhaustedIp).expect(429);
    await resetRequest({ email: `throttle-${unique}@example.com` }, independentIp).expect(202);
  });

  function resetRequest(body: object, ip: string): request.Test {
    return request(app.getHttpServer())
      .post('/api/auth/password-reset/request')
      .set('X-Forwarded-For', ip)
      .send(body);
  }

  async function sessionCount(userId: string): Promise<number> {
    const rows = await prisma.$queryRaw<Array<{ count: bigint }>>(
      Prisma.sql`SELECT COUNT(*)::bigint AS count FROM "user_sessions" WHERE "sess" ->> 'userId' = ${userId}`,
    );
    return Number(rows[0]?.count ?? 0);
  }
});

function tokenFromMessage(message: EmailMessage | undefined): string {
  const token = message?.text.match(/#token=([^\s]+)/)?.[1];
  if (!token) throw new Error('Expected captured reset token');
  return token;
}
