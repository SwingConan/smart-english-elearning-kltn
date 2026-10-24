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
import { PasswordResetService } from '../src/modules/auth/password-reset.service';

interface BlockedSend {
  started: Promise<void>;
  release: () => void;
}

interface SendBehavior {
  started: () => void;
  gate: Promise<void>;
  release: () => void;
  error?: Error;
}

class CaptureEmailSender extends EmailSender {
  messages: EmailMessage[] = [];
  private nextBehavior: SendBehavior | undefined;
  private readonly blockedBehaviors = new Set<SendBehavior>();

  async send(message: EmailMessage): Promise<void> {
    const behavior = this.nextBehavior;
    this.nextBehavior = undefined;
    if (behavior) {
      behavior.started();
      try {
        await behavior.gate;
        if (behavior.error) throw behavior.error;
      } finally {
        this.blockedBehaviors.delete(behavior);
      }
    }
    this.messages.push(message);
  }

  blockNextSend(error?: Error): BlockedSend {
    this.releaseBlockedSends();
    let markStarted!: () => void;
    let unblock!: () => void;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      unblock = resolve;
    });
    let released = false;
    const behavior: SendBehavior = {
      started: markStarted,
      gate,
      error,
      release: () => {
        if (released) return;
        released = true;
        unblock();
        this.blockedBehaviors.delete(behavior);
        if (this.nextBehavior === behavior) this.nextBehavior = undefined;
      },
    };
    this.nextBehavior = behavior;
    this.blockedBehaviors.add(behavior);
    return { started, release: behavior.release };
  }

  releaseBlockedSends(): void {
    for (const behavior of [...this.blockedBehaviors]) behavior.release();
  }
}

describe('Password recovery (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let passwordResetService: PasswordResetService;
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
    blockedProvider: `blocked-provider-${unique}@example.com`,
    providerFailure: `provider-failure-${unique}@example.com`,
    contention: `contention-${unique}@example.com`,
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
    await app.listen(0);
    prisma = app.get(PrismaService);
    passwordResetService = app.get(PasswordResetService);

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
        {
          email: emails.blockedProvider,
          passwordHash,
          fullName: 'Blocked Provider User',
          role: UserRole.STUDENT,
          status: UserStatus.ACTIVE,
        },
        {
          email: emails.providerFailure,
          passwordHash,
          fullName: 'Provider Failure User',
          role: UserRole.STUDENT,
          status: UserStatus.ACTIVE,
        },
        {
          email: emails.contention,
          passwordHash,
          fullName: 'Contention User',
          role: UserRole.STUDENT,
          status: UserStatus.ACTIVE,
        },
      ],
    });
  });

  afterEach(async () => {
    emailSender.releaseBlockedSends();
    if (passwordResetService) await passwordResetService.waitForPendingRequests();
  });

  afterAll(async () => {
    emailSender.releaseBlockedSends();
    if (passwordResetService) await passwordResetService.waitForPendingRequests();
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
    await app.close();
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
    await passwordResetService.waitForPendingRequests();
    expect(emailSender.messages).toHaveLength(1);
    expect(emailSender.messages[0]?.to).toBe(emails.active);
  });

  it('returns generic 202 while ACTIVE provider delivery is still blocked', async () => {
    emailSender.messages.length = 0;
    const blocked = emailSender.blockNextSend();
    const response = await resetRequest({ email: emails.blockedProvider }, '198.51.100.30').expect(
      202,
    );

    expect(response.text).toBe('');
    expect(response.body).not.toHaveProperty('token');
    await blocked.started;
    expect(emailSender.messages).toHaveLength(0);

    const user = await prisma.user.findUniqueOrThrow({ where: { email: emails.blockedProvider } });
    const issued = await prisma.passwordResetToken.findFirstOrThrow({
      where: { userId: user.id, usedAt: null, revokedAt: null },
    });
    expect(issued.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(issued)).not.toContain('#token=');

    blocked.release();
    await passwordResetService.waitForPendingRequests();
    expect(emailSender.messages).toHaveLength(1);
    expect(emailSender.messages[0]?.to).toBe(emails.blockedProvider);
  });

  it('revokes an issued token when provider failure occurs after public 202', async () => {
    emailSender.messages.length = 0;
    const blockedFailure = emailSender.blockNextSend(new Error('test provider failure'));
    await resetRequest({ email: emails.providerFailure }, '198.51.100.31').expect(202);
    await blockedFailure.started;
    blockedFailure.release();
    await passwordResetService.waitForPendingRequests();

    const user = await prisma.user.findUniqueOrThrow({ where: { email: emails.providerFailure } });
    await expect(
      prisma.passwordResetToken.findFirstOrThrow({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
      }),
    ).resolves.toMatchObject({ usedAt: null, revokedAt: expect.any(Date) });
    expect(emailSender.messages).toHaveLength(0);
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
    await passwordResetService.waitForPendingRequests();
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
    await passwordResetService.waitForPendingRequests();
    const oldRawToken = tokenFromMessage(emailSender.messages.at(-1));
    const oldHash = createHash('sha256').update(oldRawToken).digest('hex');
    await prisma.passwordResetToken.update({
      where: { tokenHash: oldHash },
      data: { createdAt: new Date(Date.now() - 61_000) },
    });
    await resetRequest({ email: emails.replacement }, '198.51.100.9').expect(202);
    await passwordResetService.waitForPendingRequests();
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
    await passwordResetService.waitForPendingRequests();
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

  it('rejects a token that expires while its authoritative DB claim is row-lock blocked', async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { email: emails.contention } });
    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/api/auth/login')
      .send({ email: emails.contention, password: oldPassword })
      .expect(200);
    expect(await sessionCount(user.id)).toBe(1);

    const rawToken = `contention-${unique}`;
    const expiresAt = new Date(Date.now() + 4_000);
    const token = await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: createHash('sha256').update(rawToken).digest('hex'),
        expiresAt,
      },
    });

    let releaseLock!: () => void;
    let markLocked!: () => void;
    const locked = new Promise<void>((resolve) => {
      markLocked = resolve;
    });
    const lockGate = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    const lockTransaction = prisma.$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "password_reset_tokens" WHERE "id" = ${token.id}::uuid FOR UPDATE`,
      );
      markLocked();
      await lockGate;
    });
    await locked;

    const confirmation = request(app.getHttpServer())
      .post('/api/auth/password-reset/confirm')
      .send({ token: rawToken, newPassword })
      .then((response) => response);
    await waitForBlockedClaim();
    await sleep(Math.max(0, expiresAt.getTime() - Date.now() + 150));
    releaseLock();
    await lockTransaction;

    const response = await confirmation;
    expect(response.status).toBe(400);
    expect(response.body.message).toBe('Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.');
    const unchanged = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    await expect(argon2.verify(unchanged.passwordHash, oldPassword)).resolves.toBe(true);
    await agent.get('/api/auth/me').expect(200);
    expect(await sessionCount(user.id)).toBe(1);
  }, 15_000);

  it('throttles the sixth request from one IP without consuming another IP quota', async () => {
    const exhaustedIp = '198.51.100.200';
    const independentIp = '198.51.100.201';
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await resetRequest({ email: `throttle-${unique}@example.com` }, exhaustedIp).expect(202);
    }
    await resetRequest({ email: `throttle-${unique}@example.com` }, exhaustedIp).expect(429);
    await resetRequest({ email: `throttle-${unique}@example.com` }, independentIp).expect(202);
    await passwordResetService.waitForPendingRequests();
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

  async function waitForBlockedClaim(): Promise<void> {
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
      const rows = await prisma.$queryRaw<Array<{ blocked: boolean }>>(Prisma.sql`
        SELECT EXISTS (
          SELECT 1
          FROM pg_stat_activity
          WHERE datname = current_database()
            AND pid <> pg_backend_pid()
            AND wait_event_type = 'Lock'
            AND query LIKE '%FROM "password_reset_tokens" AS token%'
            AND query LIKE '%FOR UPDATE%'
        ) AS blocked
      `);
      if (rows[0]?.blocked) return;
      await sleep(25);
    }
    throw new Error('Authoritative token claim did not reach the expected row-lock wait');
  }
});

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function tokenFromMessage(message: EmailMessage | undefined): string {
  const token = message?.text.match(/#token=([^\s]+)/)?.[1];
  if (!token) throw new Error('Expected captured reset token');
  return token;
}
