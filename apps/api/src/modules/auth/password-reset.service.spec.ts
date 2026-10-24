import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { createHash } from 'crypto';
import { Prisma, UserStatus } from '../../generated/prisma/client';
import { EmailMessage, EmailSender } from '../../infrastructure/email/email-sender';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { PasswordResetService } from './password-reset.service';

jest.mock('argon2', () => {
  const actual = jest.requireActual<typeof import('argon2')>('argon2');
  return { ...actual, hash: jest.fn(actual.hash) };
});

describe('PasswordResetService', () => {
  const user = {
    id: '10000000-0000-4000-8000-000000000001',
    email: 'user@example.com',
    status: UserStatus.ACTIVE,
  };
  const emailSender = { send: jest.fn() };
  const tx = {
    $executeRaw: jest.fn(),
    $queryRaw: jest.fn(),
    passwordResetToken: {
      findFirst: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
    },
    user: { updateMany: jest.fn() },
  };
  const prisma = {
    user: { findUnique: jest.fn() },
    passwordResetToken: {
      deleteMany: jest.fn(),
      updateMany: jest.fn(),
      findFirst: jest.fn(),
    },
    $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
  };

  const makeService = (ttl = '30') =>
    new PasswordResetService(
      prisma as unknown as PrismaService,
      emailSender as unknown as EmailSender,
      new ConfigService({
        PASSWORD_RESET_TTL_MINUTES: ttl,
        WEB_ORIGIN: 'https://learn.example.com',
      }),
    );

  const requestAndDrain = async (service: PasswordResetService, email = user.email) => {
    service.request(email);
    await service.waitForPendingRequests();
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.passwordResetToken.deleteMany.mockResolvedValue({ count: 0 });
    prisma.user.findUnique.mockResolvedValue(user);
    tx.$executeRaw.mockResolvedValue(1);
    tx.$queryRaw.mockImplementation(async (query: Prisma.Sql) => {
      const sql = query.strings.join(' ');
      if (sql.includes('SELECT "email", "status"')) {
        return [{ email: user.email, status: UserStatus.ACTIVE }];
      }
      if (sql.includes('UPDATE "password_reset_tokens"')) {
        return [{ userId: user.id, usedAt: new Date() }];
      }
      if (sql.includes('FROM "password_reset_tokens" AS token')) return [{ id: 'token-id' }];
      return [{ id: user.id }];
    });
    tx.passwordResetToken.findFirst.mockResolvedValue(null);
    tx.passwordResetToken.updateMany.mockResolvedValue({ count: 1 });
    tx.passwordResetToken.create.mockResolvedValue({ id: 'reset-id' });
    tx.user.updateMany.mockResolvedValue({ count: 1 });
    prisma.passwordResetToken.updateMany.mockResolvedValue({ count: 1 });
    prisma.passwordResetToken.findFirst.mockResolvedValue({ id: 'token-id', userId: user.id });
    emailSender.send.mockResolvedValue(undefined);
  });

  it('requires an explicit WEB_ORIGIN in production', () => {
    expect(
      () =>
        new PasswordResetService(
          prisma as unknown as PrismaService,
          emailSender as unknown as EmailSender,
          new ConfigService({ NODE_ENV: 'production' }),
        ),
    ).toThrow('WEB_ORIGIN is required in production');
  });

  it('stores only a SHA-256 hash of a cryptographically generated token with configured TTL', async () => {
    const before = Date.now();
    await requestAndDrain(makeService('45'), ' User@Example.com ');

    const message = emailSender.send.mock.calls[0][0] as EmailMessage;
    const rawToken = message.text.match(/#token=([^\s]+)/)?.[1];
    expect(rawToken).toBeDefined();
    expect(message.text).toContain('45 phút');
    expect(message.text).toContain('https://learn.example.com/reset-password#token=');
    expect(message.text).not.toContain('?token=');

    const createInput = tx.passwordResetToken.create.mock.calls[0][0].data as {
      tokenHash: string;
      expiresAt: Date;
    };
    expect(createInput.tokenHash).toBe(createHash('sha256').update(rawToken!).digest('hex'));
    expect(createInput.tokenHash).not.toBe(rawToken);
    expect(createInput).not.toEqual(expect.objectContaining({ token: expect.anything() }));
    expect(createInput.expiresAt.getTime()).toBeGreaterThanOrEqual(before + 45 * 60_000);
    expect(createInput.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 45 * 60_000);
  });

  it('normalizes email, revokes prior active tokens, and enforces the 60-second cooldown', async () => {
    await requestAndDrain(makeService(), ' User@Example.com ');
    expect(prisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: 'user@example.com' } }),
    );
    expect(tx.passwordResetToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: user.id, usedAt: null, revokedAt: null }),
      }),
    );

    jest.clearAllMocks();
    prisma.passwordResetToken.deleteMany.mockResolvedValue({ count: 0 });
    prisma.user.findUnique.mockResolvedValue(user);
    tx.$executeRaw.mockResolvedValue(1);
    tx.$queryRaw.mockResolvedValue([{ email: user.email, status: UserStatus.ACTIVE }]);
    tx.passwordResetToken.findFirst.mockResolvedValue({ id: 'recent' });
    await requestAndDrain(makeService());
    expect(tx.passwordResetToken.findFirst.mock.calls[0][0].where.createdAt.gte).toBeInstanceOf(
      Date,
    );
    expect(tx.passwordResetToken.create).not.toHaveBeenCalled();
    expect(emailSender.send).not.toHaveBeenCalled();
  });

  it.each([null, UserStatus.INACTIVE, UserStatus.LOCKED])(
    'does not send mail for a missing or non-ACTIVE account (%s)',
    async (status) => {
      prisma.user.findUnique.mockResolvedValue(status ? { ...user, status } : null);
      await requestAndDrain(makeService());
      expect(emailSender.send).not.toHaveBeenCalled();
      expect(tx.passwordResetToken.create).not.toHaveBeenCalled();
    },
  );

  it('revokes the newly created token when delivery fails without rejecting the public request', async () => {
    emailSender.send.mockRejectedValue(new Error('provider details must stay private'));
    const service = makeService();
    service.request(user.email);
    await expect(service.waitForPendingRequests()).resolves.toBeUndefined();
    expect(prisma.passwordResetToken.updateMany).toHaveBeenCalledWith({
      where: { id: 'reset-id', usedAt: null, revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it('treats retention cleanup as best effort', async () => {
    prisma.passwordResetToken.deleteMany.mockRejectedValue(new Error('cleanup failure'));
    const service = makeService();
    service.request(user.email);
    await expect(service.waitForPendingRequests()).resolves.toBeUndefined();
    expect(emailSender.send).toHaveBeenCalledTimes(1);
  });

  it('returns from dispatch before a blocked provider resolves and tracks the task to completion', async () => {
    let release!: () => void;
    const providerBlocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    let sendStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      sendStarted = resolve;
    });
    emailSender.send.mockImplementationOnce(async () => {
      sendStarted();
      await providerBlocked;
    });
    const service = makeService();

    expect(service.request(user.email)).toBeUndefined();
    await started;
    let drained = false;
    const draining = service.waitForPendingRequests().then(() => {
      drained = true;
    });
    await Promise.resolve();
    expect(drained).toBe(false);

    release();
    await draining;
    expect(emailSender.send).toHaveBeenCalledTimes(1);
  });

  it('rechecks ACTIVE status under the issuance lock and immediately before delivery', async () => {
    tx.$queryRaw.mockResolvedValueOnce([{ email: user.email, status: UserStatus.LOCKED }]);
    await requestAndDrain(makeService());
    expect(tx.passwordResetToken.create).not.toHaveBeenCalled();
    expect(emailSender.send).not.toHaveBeenCalled();

    jest.clearAllMocks();
    prisma.passwordResetToken.deleteMany.mockResolvedValue({ count: 0 });
    prisma.user.findUnique
      .mockResolvedValueOnce(user)
      .mockResolvedValueOnce({ email: user.email, status: UserStatus.LOCKED });
    tx.$executeRaw.mockResolvedValue(1);
    tx.$queryRaw.mockResolvedValue([{ email: user.email, status: UserStatus.ACTIVE }]);
    tx.passwordResetToken.findFirst.mockResolvedValue(null);
    tx.passwordResetToken.updateMany.mockResolvedValue({ count: 1 });
    tx.passwordResetToken.create.mockResolvedValue({ id: 'reset-id' });
    prisma.passwordResetToken.updateMany.mockResolvedValue({ count: 1 });

    await requestAndDrain(makeService());
    expect(prisma.passwordResetToken.updateMany).toHaveBeenCalledWith({
      where: { id: 'reset-id', usedAt: null, revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(emailSender.send).not.toHaveBeenCalled();
  });

  it('atomically consumes a valid token, hashes with Argon2id, revokes siblings, and deletes every user session', async () => {
    await makeService().confirm('raw-reset-token', 'new-password-2026');

    const lockSql = tx.$queryRaw.mock.calls[1][0] as Prisma.Sql;
    expect(lockSql.strings.join(' ')).toContain('FOR UPDATE');
    const claimSql = tx.$queryRaw.mock.calls[2][0] as Prisma.Sql;
    expect(claimSql.strings.join(' ')).toContain('clock_timestamp()');
    const passwordHash = tx.user.updateMany.mock.calls[0][0].data.passwordHash as string;
    expect(passwordHash).toMatch(/^\$argon2id\$/);
    await expect(argon2.verify(passwordHash, 'new-password-2026')).resolves.toBe(true);
    expect(tx.passwordResetToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: user.id, id: { not: 'token-id' } }),
      }),
    );
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('returns one generic 400 for unknown, expired, used, revoked, status-invalid, and already-claimed tokens', async () => {
    prisma.passwordResetToken.findFirst.mockResolvedValueOnce(null);
    await expect(makeService().confirm('unknown', 'new-password-2026')).rejects.toMatchObject({
      status: 400,
      message: 'Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.',
    });

    for (const reason of [
      'expired',
      'used',
      'revoked',
      'locked-after-issuance',
      'concurrent-second-consumer',
    ]) {
      tx.$queryRaw
        .mockResolvedValueOnce([{ id: user.id }])
        .mockResolvedValueOnce([{ id: 'token-id' }])
        .mockResolvedValueOnce([]);
      await expect(makeService().confirm(reason, 'new-password-2026')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    }
  });

  it('does not run Argon2 for a random or otherwise invalid token', async () => {
    prisma.passwordResetToken.findFirst.mockResolvedValue(null);

    await expect(
      makeService().confirm('random-invalid-token', 'new-password-2026'),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(argon2.hash).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('uses a DB wall-clock conditional claim after locking the token', async () => {
    prisma.passwordResetToken.findFirst.mockResolvedValueOnce(null);
    const genericFailure: unknown = await makeService()
      .confirm('unknown-token', 'new-password-2026')
      .catch((error: unknown) => error);
    expect(genericFailure).toBeInstanceOf(BadRequestException);

    prisma.passwordResetToken.findFirst.mockResolvedValueOnce({ id: 'token-id', userId: user.id });
    tx.$queryRaw
      .mockResolvedValueOnce([{ id: user.id }])
      .mockResolvedValueOnce([{ id: 'token-id' }])
      .mockResolvedValueOnce([]);
    const expiryRaceFailure: unknown = await makeService()
      .confirm('expires-before-db-claim', 'new-password-2026')
      .catch((error: unknown) => error);

    expect(expiryRaceFailure).toBeInstanceOf(BadRequestException);
    expect(expiryRaceFailure).toMatchObject({
      status: 400,
      message: (genericFailure as BadRequestException).message,
    });
    expect(tx.user.updateMany).not.toHaveBeenCalled();
    expect(tx.$executeRaw).not.toHaveBeenCalled();

    const lockSql = tx.$queryRaw.mock.calls[1][0] as Prisma.Sql;
    expect(lockSql.strings.join(' ')).toContain('FOR UPDATE');
    const claimSql = tx.$queryRaw.mock.calls[2][0] as Prisma.Sql;
    const statement = claimSql.strings.join(' ');
    expect(statement).toContain('token."expiresAt" > clock_timestamp()');
    expect(statement).toContain('SET "usedAt" = clock_timestamp()');
  });
});
