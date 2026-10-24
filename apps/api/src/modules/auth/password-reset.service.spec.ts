import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { createHash } from 'crypto';
import { UserStatus } from '../../generated/prisma/client';
import { EmailMessage, EmailSender } from '../../infrastructure/email/email-sender';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { PasswordResetService } from './password-reset.service';

describe('PasswordResetService', () => {
  const user = {
    id: '10000000-0000-4000-8000-000000000001',
    email: 'user@example.com',
    status: UserStatus.ACTIVE,
  };
  const emailSender = { send: jest.fn() };
  const tx = {
    $executeRaw: jest.fn(),
    passwordResetToken: {
      findFirst: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
      findUnique: jest.fn(),
    },
    user: { updateMany: jest.fn() },
  };
  const prisma = {
    user: { findUnique: jest.fn() },
    passwordResetToken: { deleteMany: jest.fn(), updateMany: jest.fn() },
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

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.passwordResetToken.deleteMany.mockResolvedValue({ count: 0 });
    prisma.user.findUnique.mockResolvedValue(user);
    tx.$executeRaw.mockResolvedValue(1);
    tx.passwordResetToken.findFirst.mockResolvedValue(null);
    tx.passwordResetToken.updateMany.mockResolvedValue({ count: 1 });
    tx.passwordResetToken.create.mockResolvedValue({ id: 'reset-id' });
    tx.user.updateMany.mockResolvedValue({ count: 1 });
    prisma.passwordResetToken.updateMany.mockResolvedValue({ count: 1 });
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
    await makeService('45').request(' User@Example.com ');

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
    await makeService().request(' User@Example.com ');
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
    tx.passwordResetToken.findFirst.mockResolvedValue({ id: 'recent' });
    await makeService().request(user.email);
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
      await makeService().request(user.email);
      expect(emailSender.send).not.toHaveBeenCalled();
      expect(tx.passwordResetToken.create).not.toHaveBeenCalled();
    },
  );

  it('revokes the newly created token when delivery fails without rejecting the public request', async () => {
    emailSender.send.mockRejectedValue(new Error('provider details must stay private'));
    await expect(makeService().request(user.email)).resolves.toBeUndefined();
    expect(prisma.passwordResetToken.updateMany).toHaveBeenCalledWith({
      where: { id: 'reset-id', usedAt: null, revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it('treats retention cleanup as best effort', async () => {
    prisma.passwordResetToken.deleteMany.mockRejectedValue(new Error('cleanup failure'));
    await expect(makeService().request(user.email)).resolves.toBeUndefined();
    expect(emailSender.send).toHaveBeenCalledTimes(1);
  });

  it('atomically consumes a valid token, hashes with Argon2id, revokes siblings, and deletes every user session', async () => {
    tx.passwordResetToken.findUnique.mockResolvedValue({ id: 'token-id', userId: user.id });
    await makeService().confirm('raw-reset-token', 'new-password-2026');

    expect(tx.passwordResetToken.updateMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'token-id',
          usedAt: null,
          revokedAt: null,
          expiresAt: { gt: expect.any(Date) },
          user: { status: UserStatus.ACTIVE },
        }),
        data: { usedAt: expect.any(Date) },
      }),
    );
    const passwordHash = tx.user.updateMany.mock.calls[0][0].data.passwordHash as string;
    expect(passwordHash).toMatch(/^\$argon2id\$/);
    await expect(argon2.verify(passwordHash, 'new-password-2026')).resolves.toBe(true);
    expect(tx.passwordResetToken.updateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({ userId: user.id, id: { not: 'token-id' } }),
      }),
    );
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('returns one generic 400 for unknown, expired, used, revoked, status-invalid, and already-claimed tokens', async () => {
    tx.passwordResetToken.findUnique.mockResolvedValueOnce(null);
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
      tx.passwordResetToken.findUnique.mockResolvedValueOnce({ id: reason, userId: user.id });
      tx.passwordResetToken.updateMany.mockResolvedValueOnce({ count: 0 });
      await expect(makeService().confirm(reason, 'new-password-2026')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    }
  });
});
