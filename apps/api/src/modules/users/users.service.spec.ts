import { ConflictException } from '@nestjs/common';
import { Prisma, UserRole, UserStatus } from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { publicUserSelect, userCredentialsSelect } from './user.types';
import { UsersService } from './users.service';

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
      create: jest.fn(),
    },
  };
  const service = new UsersService(prisma as unknown as PrismaService);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('normalizes email with trim and lowercase', () => {
    expect(service.normalizeEmail('  Student@Example.COM ')).toBe(
      'student@example.com',
    );
  });

  it('finds credentials using a normalized email', async () => {
    const credentials = { ...publicUser, passwordHash: 'hash' };
    prisma.user.findUnique.mockResolvedValue(credentials);

    await expect(service.findByEmail(' Student@Example.COM ')).resolves.toEqual(
      credentials,
    );
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
});
