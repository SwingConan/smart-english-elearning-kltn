import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma, UserRole, UserStatus } from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { PublicUser, publicUserSelect, UserCredentials, userCredentialsSelect } from './user.types';
import { USER_AVATAR_URL_PREFIX, UserAvatarStorage } from './user-avatar.storage';

interface CreateStudentInput {
  email: string;
  passwordHash: string;
  fullName: string;
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly avatarStorage: UserAvatarStorage,
  ) {}

  normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  findById(id: string): Promise<PublicUser | null> {
    return this.prisma.user.findUnique({
      where: { id },
      select: publicUserSelect,
    });
  }

  findByEmail(email: string): Promise<UserCredentials | null> {
    return this.prisma.user.findUnique({
      where: { email: this.normalizeEmail(email) },
      select: userCredentialsSelect,
    });
  }

  updateProfile(id: string, input: { fullName: string; phoneNumber?: string | null }) {
    return this.prisma.user.update({
      where: { id },
      data: {
        fullName: input.fullName.trim().replace(/\s+/g, ' '),
        phoneNumber: input.phoneNumber?.trim().replace(/\s+/g, ' ') || null,
      },
      select: publicUserSelect,
    });
  }

  async getProfile(id: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id },
      select: publicUserSelect,
    });
    const [activeClasses, completedClasses, certificates, teachingClasses] = await Promise.all([
      this.prisma.enrollment.count({ where: { learnerId: id, status: 'ACTIVE' } }),
      this.prisma.enrollment.count({ where: { learnerId: id, status: 'COMPLETED' } }),
      this.prisma.certificate.count({ where: { completion: { enrollment: { learnerId: id } } } }),
      this.prisma.classOffering.count({ where: { instructorId: id } }),
    ]);
    return {
      ...user,
      avatarUrl: user.avatarKey ? `${USER_AVATAR_URL_PREFIX}${user.avatarKey}` : null,
      summary: { activeClasses, completedClasses, certificates, teachingClasses },
    };
  }

  async uploadAvatar(
    id: string,
    file: { buffer: Buffer; mimetype: string; originalname: string; size: number },
  ) {
    const current = await this.prisma.user.findUniqueOrThrow({
      where: { id },
      select: { avatarKey: true },
    });
    const stored = await this.avatarStorage.put(file);
    try {
      await this.prisma.user.update({ where: { id }, data: { avatarKey: stored.key } });
      if (current.avatarKey)
        await this.avatarStorage.delete(current.avatarKey).catch(() => undefined);
      return this.getProfile(id);
    } catch (error) {
      await this.avatarStorage.delete(stored.key).catch(() => undefined);
      throw error;
    }
  }

  async removeAvatar(id: string) {
    const current = await this.prisma.user.findUniqueOrThrow({
      where: { id },
      select: { avatarKey: true },
    });
    await this.prisma.user.update({
      where: { id },
      data: { avatarKey: null },
    });
    if (current.avatarKey)
      await this.avatarStorage.delete(current.avatarKey).catch(() => undefined);
    return this.getProfile(id);
  }

  openAvatar(key: string) {
    return this.avatarStorage.open(key);
  }

  async createStudent(input: CreateStudentInput): Promise<PublicUser> {
    try {
      return await this.prisma.user.create({
        data: {
          email: this.normalizeEmail(input.email),
          passwordHash: input.passwordHash,
          fullName: input.fullName.trim(),
          role: UserRole.STUDENT,
          status: UserStatus.ACTIVE,
        },
        select: publicUserSelect,
      });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('An account with this email already exists');
      }

      throw error;
    }
  }
}
