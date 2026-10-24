import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'crypto';
import { Prisma, UserStatus } from '../../generated/prisma/client';
import { EmailSender } from '../../infrastructure/email/email-sender';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

const RESET_SUBJECT = 'Đặt lại mật khẩu Smart English';
const INVALID_RESET_MESSAGE = 'Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.';
const COOLDOWN_MS = 60_000;
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);
  private readonly ttlMinutes: number;
  private readonly webOrigin: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailSender: EmailSender,
    config: ConfigService,
  ) {
    const ttlText = config.get<string>('PASSWORD_RESET_TTL_MINUTES', '30');
    this.ttlMinutes = Number(ttlText);
    if (!Number.isInteger(this.ttlMinutes) || this.ttlMinutes < 1 || this.ttlMinutes > 1440) {
      throw new Error('PASSWORD_RESET_TTL_MINUTES must be an integer between 1 and 1440');
    }

    const configuredOrigin = config.get<string>('WEB_ORIGIN');
    if (!configuredOrigin && config.get<string>('NODE_ENV') === 'production') {
      throw new Error('WEB_ORIGIN is required in production');
    }
    const origin = new URL(configuredOrigin ?? 'http://localhost:5173');
    if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password) {
      throw new Error('WEB_ORIGIN must be an HTTP(S) origin without credentials');
    }
    if (origin.pathname !== '/' || origin.search || origin.hash) {
      throw new Error('WEB_ORIGIN must not contain a path, query, or fragment');
    }
    this.webOrigin = origin.origin;
  }

  async request(email: string): Promise<void> {
    await this.cleanupExpiredHistory();

    const user = await this.prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
      select: { id: true, email: true, status: true },
    });
    if (!user || user.status !== UserStatus.ACTIVE) return;

    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = this.hashToken(rawToken);
    const now = new Date();
    const cooldownStart = new Date(now.getTime() - COOLDOWN_MS);
    const expiresAt = new Date(now.getTime() + this.ttlMinutes * 60_000);

    const created = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${user.id}, 0))`;

      const recent = await tx.passwordResetToken.findFirst({
        where: {
          userId: user.id,
          createdAt: { gte: cooldownStart },
          expiresAt: { gt: now },
          usedAt: null,
          revokedAt: null,
        },
        select: { id: true },
      });
      if (recent) return null;

      await tx.passwordResetToken.updateMany({
        where: {
          userId: user.id,
          expiresAt: { gt: now },
          usedAt: null,
          revokedAt: null,
        },
        data: { revokedAt: now },
      });

      return tx.passwordResetToken.create({
        data: { userId: user.id, tokenHash, expiresAt },
        select: { id: true },
      });
    });

    if (!created) return;

    const resetLink = `${this.webOrigin}/reset-password#token=${rawToken}`;
    try {
      await this.emailSender.send({
        to: user.email,
        subject: RESET_SUBJECT,
        text: this.textEmail(resetLink),
        html: this.htmlEmail(resetLink),
      });
    } catch {
      try {
        await this.prisma.passwordResetToken.updateMany({
          where: { id: created.id, usedAt: null, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        this.logger.error('Password reset email delivery failed; issued token revoked');
      } catch {
        this.logger.error('Password reset email delivery and token revocation failed');
      }
    }
  }

  async confirm(rawToken: string, newPassword: string): Promise<void> {
    const tokenHash = this.hashToken(rawToken);
    const passwordHash = await argon2.hash(newPassword, { type: argon2.argon2id });
    const now = new Date();

    try {
      await this.prisma.$transaction(async (tx) => {
        const token = await tx.passwordResetToken.findUnique({
          where: { tokenHash },
          select: { id: true, userId: true },
        });
        if (!token) throw new InvalidResetError();

        const claimed = await tx.passwordResetToken.updateMany({
          where: {
            id: token.id,
            tokenHash,
            usedAt: null,
            revokedAt: null,
            expiresAt: { gt: now },
            user: { status: UserStatus.ACTIVE },
          },
          data: { usedAt: now },
        });
        if (claimed.count !== 1) throw new InvalidResetError();

        const updatedUser = await tx.user.updateMany({
          where: { id: token.userId, status: UserStatus.ACTIVE },
          data: { passwordHash },
        });
        if (updatedUser.count !== 1) throw new InvalidResetError();

        await tx.passwordResetToken.updateMany({
          where: {
            userId: token.userId,
            id: { not: token.id },
            usedAt: null,
            revokedAt: null,
          },
          data: { revokedAt: now },
        });

        await tx.$executeRaw(
          Prisma.sql`DELETE FROM "user_sessions" WHERE "sess" ->> 'userId' = ${token.userId}`,
        );
      });
    } catch (error: unknown) {
      if (error instanceof InvalidResetError) {
        throw new BadRequestException(INVALID_RESET_MESSAGE);
      }
      throw error;
    }
  }

  private hashToken(rawToken: string): string {
    return createHash('sha256').update(rawToken).digest('hex');
  }

  private async cleanupExpiredHistory(): Promise<void> {
    try {
      await this.prisma.passwordResetToken.deleteMany({
        where: { createdAt: { lt: new Date(Date.now() - RETENTION_MS) } },
      });
    } catch {
      this.logger.warn('Password reset token retention cleanup failed');
    }
  }

  private textEmail(resetLink: string): string {
    return [
      'Bạn đã yêu cầu đặt lại mật khẩu Smart English.',
      '',
      resetLink,
      '',
      `Liên kết này sẽ hết hạn sau ${this.ttlMinutes} phút.`,
      'Nếu bạn không yêu cầu đặt lại mật khẩu, bạn có thể bỏ qua email này.',
    ].join('\n');
  }

  private htmlEmail(resetLink: string): string {
    return [
      '<p>Bạn đã yêu cầu đặt lại mật khẩu Smart English.</p>',
      `<p><a href="${resetLink}">Đặt lại mật khẩu</a></p>`,
      `<p>Liên kết này sẽ hết hạn sau ${this.ttlMinutes} phút.</p>`,
      '<p>Nếu bạn không yêu cầu đặt lại mật khẩu, bạn có thể bỏ qua email này.</p>',
    ].join('');
  }
}

class InvalidResetError extends Error {}
