import { ConflictException } from '@nestjs/common';
import { Prisma, UserRole, UserStatus } from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { publicUserSelect, userCredentialsSelect } from './user.types';
import { UsersService } from './users.service';
import { UserAvatarStorage } from './user-avatar.storage';

describe('UsersService', () => {
  const publicUser = {
    id: 'user-id',
    email: 'student@example.com',
    fullName: 'Student User',
    role: UserRole.STUDENT,
    status: UserStatus.ACTIVE,
  };
  const prisma = {
    user: {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    enrollment: { count: jest.fn() },
    certificate: { count: jest.fn() },
    classOffering: { count: jest.fn() },
  };
  const avatarStorage = { put: jest.fn(), open: jest.fn(), delete: jest.fn() };
  const service = new UsersService(
    prisma as unknown as PrismaService,
    avatarStorage as unknown as UserAvatarStorage,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    avatarStorage.delete.mockResolvedValue(undefined);
    prisma.enrollment.count.mockResolvedValue(0);
    prisma.certificate.count.mockResolvedValue(0);
    prisma.classOffering.count.mockResolvedValue(0);
  });

  it('normalizes email with trim and lowercase', () => {
    expect(service.normalizeEmail('  Student@Example.COM ')).toBe('student@example.com');
  });

  it('finds credentials using a normalized email', async () => {
    const credentials = { ...publicUser, passwordHash: 'hash' };
    prisma.user.findUnique.mockResolvedValue(credentials);

    await expect(service.findByEmail(' Student@Example.COM ')).resolves.toEqual(credentials);
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'student@example.com' },
      select: userCredentialsSelect,
    });
  });

  it('creates only an ACTIVE STUDENT and returns a sanitized user', async () => {
    prisma.user.create.mockResolvedValue(publicUser);

    const result = await service.createStudent({
      email: ' Student@Example.COM ',
      passwordHash: 'argon2-hash',
      fullName: ' Student User ',
    });

    expect(prisma.user.create).toHaveBeenCalledWith({
      data: {
        email: 'student@example.com',
        passwordHash: 'argon2-hash',
        fullName: 'Student User',
        role: UserRole.STUDENT,
        status: UserStatus.ACTIVE,
      },
      select: publicUserSelect,
    });
    expect(result).not.toHaveProperty('passwordHash');
  });

  it('maps a duplicate email constraint to ConflictException', async () => {
    prisma.user.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '7.10.0',
      }),
    );

    await expect(
      service.createStudent({
        email: 'student@example.com',
        passwordHash: 'argon2-hash',
        fullName: 'Student User',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('replaces only the authenticated user avatar and removes the superseded object', async () => {
    prisma.user.findUniqueOrThrow
      .mockResolvedValueOnce({ avatarKey: 'old-avatar.png' })
      .mockResolvedValueOnce({ ...publicUser, avatarKey: 'new-avatar.png' });
    prisma.user.update.mockResolvedValue({});
    avatarStorage.put.mockResolvedValue({ key: 'new-avatar.png' });

    await service.uploadAvatar('user-id', {
      buffer: Buffer.from([0xff, 0xd8, 0xff]),
      mimetype: 'image/jpeg',
      originalname: 'avatar.jpg',
      size: 3,
    });

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-id' },
      data: { avatarKey: 'new-avatar.png' },
    });
    expect(avatarStorage.delete).toHaveBeenCalledWith('old-avatar.png');
  });

  it('deletes a newly stored object when the owner update fails', async () => {
    prisma.user.findUniqueOrThrow.mockResolvedValue({ avatarKey: null });
    avatarStorage.put.mockResolvedValue({ key: 'orphan.png' });
    prisma.user.update.mockRejectedValue(new Error('database failure'));

    await expect(
      service.uploadAvatar('user-id', {
        buffer: Buffer.from([0xff, 0xd8, 0xff]),
        mimetype: 'image/jpeg',
        originalname: 'avatar.jpg',
        size: 3,
      }),
    ).rejects.toThrow('database failure');
    expect(avatarStorage.delete).toHaveBeenCalledWith('orphan.png');
  });

  it('removes only the authenticated user avatar reference and managed object', async () => {
    prisma.user.findUniqueOrThrow
      .mockResolvedValueOnce({ avatarKey: 'owned-avatar.webp' })
      .mockResolvedValueOnce({ ...publicUser, avatarKey: null });
    prisma.user.update.mockResolvedValue({});

    await service.removeAvatar('user-id');

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-id' },
      data: { avatarKey: null },
    });
    expect(avatarStorage.delete).toHaveBeenCalledWith('owned-avatar.webp');
  });
});
