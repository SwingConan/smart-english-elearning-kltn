import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, UserRole, UserStatus } from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import {
  PublicUser,
  publicUserSelect,
  UserCredentials,
  userCredentialsSelect,
} from './user.types';

interface CreateStudentInput {
  email: string;
  passwordHash: string;
  fullName: string;
  termsAccepted?: boolean;
}

export interface UserProfilePreferences {
  phone: string;
  timezone: string;
  emailNotifications: boolean;
  studyGoalNote: string;
  avatarUrl: string;
  dateOfBirth: string;
  gender: string;
  address: string;
  targetScore: string;
}

export interface UserProfileDetails extends PublicUser {
  preferences: UserProfilePreferences;
  updatedAt: string | null;
}

const DEFAULT_PREFERENCES: UserProfilePreferences = {
  phone: '',
  timezone: 'Asia/Ho_Chi_Minh',
  emailNotifications: true,
  studyGoalNote: '',
  avatarUrl: '',
  dateOfBirth: '',
  gender: '',
  address: '',
  targetScore: '',
};

const SAFE_DATA_IMAGE_RE =
  /^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/i;
const SAFE_HTTP_IMAGE_RE = /^https?:\/\/.+/i;
const SAFE_RELATIVE_PATH_RE = /^\/[^/].*$/;

function sanitizeAvatarUrl(raw?: string | null): string | null {
  if (typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (trimmed.length > 200_000) return null;
  if (
    SAFE_DATA_IMAGE_RE.test(trimmed) ||
    SAFE_HTTP_IMAGE_RE.test(trimmed) ||
    SAFE_RELATIVE_PATH_RE.test(trimmed)
  ) {
    return trimmed;
  }
  return null;
}

function parsePreferences(raw?: string | null): UserProfilePreferences {
  if (!raw) return { ...DEFAULT_PREFERENCES };
  try {
    const parsed = JSON.parse(raw) as Partial<UserProfilePreferences>;
    const sanitizedAvatar = sanitizeAvatarUrl(parsed.avatarUrl);
    return {
      phone: typeof parsed.phone === 'string' ? parsed.phone : '',
      timezone: typeof parsed.timezone === 'string' && parsed.timezone ? parsed.timezone : 'Asia/Ho_Chi_Minh',
      emailNotifications: typeof parsed.emailNotifications === 'boolean' ? parsed.emailNotifications : true,
      studyGoalNote: typeof parsed.studyGoalNote === 'string' ? parsed.studyGoalNote : '',
      avatarUrl: sanitizedAvatar ?? '',
      dateOfBirth: typeof parsed.dateOfBirth === 'string' ? parsed.dateOfBirth : '',
      gender: typeof parsed.gender === 'string' ? parsed.gender : '',
      address: typeof parsed.address === 'string' ? parsed.address : '',
      targetScore: typeof parsed.targetScore === 'string' ? parsed.targetScore : '',
    };
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  findById(id: string): Promise<PublicUser | null> {
    return this.prisma.user.findUnique({
      where: { id },
      select: publicUserSelect,
    });
  }

  findCredentialsById(id: string): Promise<UserCredentials | null> {
    return this.prisma.user.findUnique({
      where: { id },
      select: userCredentialsSelect,
    });
  }

  findByEmail(email: string): Promise<UserCredentials | null> {
    return this.prisma.user.findUnique({
      where: { email: this.normalizeEmail(email) },
      select: userCredentialsSelect,
    });
  }

  async getProfileDetails(userId: string): Promise<UserProfileDetails> {
    const user = await this.findById(userId);
    if (!user) throw new NotFoundException('Không tìm thấy tài khoản.');
    const latestEvent = await this.prisma.domainAuditEvent.findFirst({
      where: {
        objectType: 'USER_PROFILE',
        objectId: userId,
        action: 'PROFILE_UPDATE',
        decision: 'APPLIED',
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { reason: true, createdAt: true },
    });
    return {
      ...user,
      preferences: parsePreferences(latestEvent?.reason),
      updatedAt: latestEvent?.createdAt ? latestEvent.createdAt.toISOString() : null,
    };
  }

  async updateOwnProfile(
    userId: string,
    input: {
      fullName?: string;
      phone?: string;
      timezone?: string;
      emailNotifications?: boolean;
      studyGoalNote?: string;
      avatarUrl?: string;
      dateOfBirth?: string;
      gender?: string;
      address?: string;
      targetScore?: string;
    },
  ): Promise<UserProfileDetails> {
    const current = await this.getProfileDetails(userId);
    let nextAvatarUrl = current.preferences.avatarUrl;
    if (input.avatarUrl !== undefined) {
      const sanitized = sanitizeAvatarUrl(input.avatarUrl);
      if (sanitized === null) {
        throw new BadRequestException(
          'Ảnh đại diện phải là tệp ảnh hợp lệ (PNG, JPG, WebP, GIF) dưới 200KB hoặc liên kết http(s).',
        );
      }
      nextAvatarUrl = sanitized;
    }
    const nextPreferences: UserProfilePreferences = {
      phone: input.phone !== undefined ? input.phone : current.preferences.phone,
      timezone: input.timezone !== undefined && input.timezone ? input.timezone : current.preferences.timezone,
      emailNotifications:
        input.emailNotifications !== undefined
          ? input.emailNotifications
          : current.preferences.emailNotifications,
      studyGoalNote:
        input.studyGoalNote !== undefined ? input.studyGoalNote : current.preferences.studyGoalNote,
      avatarUrl: nextAvatarUrl,
      dateOfBirth:
        input.dateOfBirth !== undefined ? input.dateOfBirth : current.preferences.dateOfBirth,
      gender: input.gender !== undefined ? input.gender : current.preferences.gender,
      address: input.address !== undefined ? input.address : current.preferences.address,
      targetScore:
        input.targetScore !== undefined ? input.targetScore : current.preferences.targetScore,
    };
    const nextFullName = input.fullName !== undefined ? input.fullName.trim() : current.fullName;

    return this.prisma.$transaction(async (tx) => {
      const updatedUser = await tx.user.update({
        where: { id: userId },
        data: { fullName: nextFullName },
        select: publicUserSelect,
      });
      const event = await tx.domainAuditEvent.create({
        data: {
          actorId: userId,
          action: 'PROFILE_UPDATE',
          objectType: 'USER_PROFILE',
          objectId: userId,
          decision: 'APPLIED',
          reason: JSON.stringify(nextPreferences),
        },
        select: { createdAt: true },
      });
      return {
        ...updatedUser,
        preferences: nextPreferences,
        updatedAt: event.createdAt.toISOString(),
      };
    });
  }

  async updateOwnPassword(
    userId: string,
    passwordHash: string,
    currentSessionId?: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { passwordHash },
      });
      if (currentSessionId) {
        await tx.$executeRaw(
          Prisma.sql`DELETE FROM "user_sessions" WHERE "sess" ->> 'userId' = ${userId} AND "sid" <> ${currentSessionId}`,
        );
      } else {
        await tx.$executeRaw(
          Prisma.sql`DELETE FROM "user_sessions" WHERE "sess" ->> 'userId' = ${userId}`,
        );
      }
      await tx.domainAuditEvent.create({
        data: {
          actorId: userId,
          action: 'PASSWORD_CHANGE',
          objectType: 'USER_PROFILE',
          objectId: userId,
          decision: 'APPLIED',
          reason: 'Cập nhật mật khẩu cá nhân và thu hồi các phiên khác',
        },
      });
    });
  }

  async createStudent(input: CreateStudentInput): Promise<PublicUser> {
    try {
      const created = await this.prisma.user.create({
        data: {
          email: this.normalizeEmail(input.email),
          passwordHash: input.passwordHash,
          fullName: input.fullName.trim(),
          role: UserRole.STUDENT,
          status: UserStatus.ACTIVE,
        },
        select: publicUserSelect,
      });
      if (this.prisma.domainAuditEvent?.create) {
        await this.prisma.domainAuditEvent.create({
          data: {
            actorId: created.id,
            action: 'REGISTER_CONSENT_ACCEPTED',
            objectType: 'USER_PROFILE',
            objectId: created.id,
            decision: 'APPLIED',
            reason: JSON.stringify({
              termsAccepted: input.termsAccepted === true,
              consentVersion: 'SE_TERMS_PRIVACY_V2',
              acceptedAt: new Date().toISOString(),
            }),
          },
        });
      }
      return created;
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('An account with this email already exists');
      }

      throw error;
    }
  }
}
