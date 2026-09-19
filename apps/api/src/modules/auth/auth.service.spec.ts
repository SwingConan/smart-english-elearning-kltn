import { ConflictException, UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { UserRole, UserStatus } from '../../generated/prisma/client';
import { PublicUser, UserCredentials } from '../users/user.types';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  const publicUser: PublicUser = {
    id: 'user-id',
    email: 'student@example.com',
    fullName: 'Student User',
    role: UserRole.STUDENT,
    status: UserStatus.ACTIVE,
  };
  const usersService = {
    createStudent: jest.fn(),
    findByEmail: jest.fn(),
  };
  const service = new AuthService(usersService as unknown as UsersService);
  let passwordHash: string;

  beforeAll(async () => {
    passwordHash = await argon2.hash('password123', { type: argon2.argon2id });
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('registers with an explicit Argon2id hash and sanitized response', async () => {
    usersService.createStudent.mockResolvedValue(publicUser);

    const result = await service.register({
      email: ' Student@Example.COM ',
      password: 'password123',
      fullName: 'Student User',
    });

    const input = usersService.createStudent.mock.calls[0][0] as {
      passwordHash: string;
    };
    expect(input.passwordHash).toMatch(/^\$argon2id\$/);
    expect(result).not.toHaveProperty('passwordHash');
  });

  it('propagates duplicate registration as conflict', async () => {
    usersService.createStudent.mockRejectedValue(new ConflictException());

    await expect(
      service.register({
        email: 'student@example.com',
        password: 'password123',
        fullName: 'Student User',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('logs in with a valid Argon2id password and removes passwordHash', async () => {
    usersService.findByEmail.mockResolvedValue({
      ...publicUser,
      passwordHash,
    } satisfies UserCredentials);

    const result = await service.login({
      email: 'student@example.com',
      password: 'password123',
    });

    expect(result).toEqual(publicUser);
    expect(result).not.toHaveProperty('passwordHash');
  });

  it('uses the same generic error for wrong password and unknown email', async () => {
    usersService.findByEmail.mockResolvedValueOnce({
      ...publicUser,
      passwordHash,
    });
    const wrongPassword = service.login({
      email: 'student@example.com',
      password: 'wrong-password',
    });
    await expect(wrongPassword).rejects.toMatchObject({
      message: 'Invalid email or password',
    });

    usersService.findByEmail.mockResolvedValueOnce(null);
    const unknownEmail = service.login({
      email: 'unknown@example.com',
      password: 'wrong-password',
    });
    await expect(unknownEmail).rejects.toMatchObject({
      message: 'Invalid email or password',
    });
  });

  it.each([UserStatus.INACTIVE, UserStatus.LOCKED])(
    'rejects a %s user',
    async (status) => {
      usersService.findByEmail.mockResolvedValue({
        ...publicUser,
        status,
        passwordHash,
      });

      await expect(
        service.login({
          email: 'student@example.com',
          password: 'password123',
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    },
  );
});
