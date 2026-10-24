import { BadRequestException, BeforeApplicationShutdown, Injectable, Logger } from '@nestjs/common';
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
export class PasswordResetService implements BeforeApplicationShutdown {
  private readonly logger = new Logger(PasswordResetService.name);
  private readonly pendingRequests = new Set<Promise<void>>();
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

  request(email: string): void {
    const task = new Promise<void>((resolve) => setImmediate(resolve))
      .then(() => this.processRequest(email))
      .catch(() => {
        this.logger.error('Password reset background processing failed');
      })
      .finally(() => {
        this.pendingRequests.delete(task);
      });
    this.pendingRequests.add(task);
  }

  async waitForPendingRequests(): Promise<void> {
    while (this.pendingRequests.size > 0) {
      await Promise.allSettled([...this.pendingRequests]);
    }
  }

  async beforeApplicationShutdown(): Promise<void> {
    await this.waitForPendingRequests();
  }

  private async processRequest(email: string): Promise<void> {
    await this.cleanupExpiredHistory();

    const user = await this.prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
      select: { id: true, email: true, status: true },
    });
    if (!user || user.status !== UserStatus.ACTIVE) return;

    const now = new Date();
    const cooldownStart = new Date(now.getTime() - COOLDOWN_MS);
    const expiresAt = new Date(now.getTime() + this.ttlMinutes * 60_000);

    const created = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${user.id}, 0))`;

      const currentUsers = await tx.$queryRaw<Array<{ email: string; status: UserStatus }>>(
        Prisma.sql`
          SELECT "email", "status"
          FROM "users"
          WHERE "id" = ${user.id}::uuid
          FOR UPDATE
        `,
      );
      const currentUser = currentUsers[0];
      if (!currentUser || currentUser.status !== UserStatus.ACTIVE) return null;

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

      const rawToken = randomBytes(32).toString('base64url');
      const tokenHash = this.hashToken(rawToken);
      const token = await tx.passwordResetToken.create({
        data: { userId: user.id, tokenHash, expiresAt },
        select: { id: true },
      });
      return { ...token, rawToken };
    });

    if (!created) return;

    try {
      const deliveryUser = await this.prisma.user.findUnique({
        where: { id: user.id },
        select: { email: true, status: true },
      });
      if (!deliveryUser || deliveryUser.status !== UserStatus.ACTIVE) {
        if (!(await this.revokeIssuedToken(created.id))) {
          this.logger.error('Password reset token revocation failed after status changed');
        }
        return;
      }

      const resetLink = `${this.webOrigin}/reset-password#token=${created.rawToken}`;
      await this.emailSender.send({
        to: deliveryUser.email,
        subject: RESET_SUBJECT,
        text: this.textEmail(resetLink),
        html: this.htmlEmail(resetLink),
      });
    } catch {
      if (await this.revokeIssuedToken(created.id)) {
        this.logger.error('Password reset email delivery failed; issued token revoked');
      } else {
        this.logger.error('Password reset email delivery and token revocation failed');
      }
    }
  }

  async confirm(rawToken: string, newPassword: string): Promise<void> {
    const tokenHash = this.hashToken(rawToken);
    const precheckTime = new Date();

    const candidate = await this.prisma.passwordResetToken.findFirst({
      where: {
        tokenHash,
        usedAt: null,
        revokedAt: null,
        expiresAt: { gt: precheckTime },
        user: { status: UserStatus.ACTIVE },
      },
      select: { id: true, userId: true },
    });
    if (!candidate) throw new BadRequestException(INVALID_RESET_MESSAGE);

    const passwordHash = await argon2.hash(newPassword, { type: argon2.argon2id });
    try {
      await this.prisma.$transaction(async (tx) => {
        const activeUsers = await tx.$queryRaw<Array<{ id: string }>>(
          Prisma.sql`
            SELECT "id"
            FROM "users"
            WHERE "id" = ${candidate.userId}::uuid
              AND "status" = ${UserStatus.ACTIVE}::"UserStatus"
            FOR UPDATE
          `,
        );
        if (activeUsers.length !== 1) throw new InvalidResetError();

        const lockedTokens = await tx.$queryRaw<Array<{ id: string }>>(
          Prisma.sql`
            SELECT token."id"
            FROM "password_reset_tokens" AS token
            WHERE token."id" = ${candidate.id}::uuid
              AND token."userId" = ${candidate.userId}::uuid
              AND token."tokenHash" = ${tokenHash}
              AND token."usedAt" IS NULL
              AND token."revokedAt" IS NULL
            FOR UPDATE
          `,
        );
        if (lockedTokens.length !== 1) throw new InvalidResetError();

        const claimed = await tx.$queryRaw<Array<{ userId: string; usedAt: Date }>>(
          Prisma.sql`
            UPDATE "password_reset_tokens" AS token
            SET "usedAt" = clock_timestamp() AT TIME ZONE 'UTC'
            WHERE token."id" = ${candidate.id}::uuid
              AND token."userId" = ${candidate.userId}::uuid
              AND token."tokenHash" = ${tokenHash}
              AND token."expiresAt" > clock_timestamp() AT TIME ZONE 'UTC'
              AND token."usedAt" IS NULL
              AND token."revokedAt" IS NULL
              AND EXISTS (
                SELECT 1
                FROM "users" AS owner
                WHERE owner."id" = token."userId"
                  AND owner."status" = ${UserStatus.ACTIVE}::"UserStatus"
              )
            RETURNING token."userId" AS "userId", token."usedAt" AS "usedAt"
          `,
        );
        const claim = claimed[0];
        if (!claim) throw new InvalidResetError();

        const updatedUser = await tx.user.updateMany({
          where: { id: candidate.userId, status: UserStatus.ACTIVE },
          data: { passwordHash },
        });
        if (updatedUser.count !== 1) throw new InvalidResetError();

        await tx.passwordResetToken.updateMany({
          where: {
            userId: candidate.userId,
            id: { not: candidate.id },
            usedAt: null,
            revokedAt: null,
          },
          data: { revokedAt: claim.usedAt },
        });

        await tx.$executeRaw(
          Prisma.sql`DELETE FROM "user_sessions" WHERE "sess" ->> 'userId' = ${candidate.userId}`,
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

  private async revokeIssuedToken(id: string): Promise<boolean> {
    try {
      await this.prisma.passwordResetToken.updateMany({
        where: { id, usedAt: null, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return true;
    } catch {
      return false;
    }
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
