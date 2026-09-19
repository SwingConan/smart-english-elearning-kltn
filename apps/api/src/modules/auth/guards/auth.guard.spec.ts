import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { UserRole, UserStatus } from '../../../generated/prisma/client';
import { UsersService } from '../../users/users.service';
import { AuthGuard } from './auth.guard';

describe('AuthGuard', () => {
  const reflector = { getAllAndOverride: jest.fn() };
  const usersService = { findById: jest.fn() };
  const guard = new AuthGuard(
    reflector as unknown as Reflector,
    usersService as unknown as UsersService,
  );

  const contextFor = (request: Partial<Request>): ExecutionContext =>
    ({
      getHandler: () => function handler() {},
      getClass: () => class TestController {},
      switchToHttp: () => ({ getRequest: () => request }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('bypasses routes marked public', async () => {
    reflector.getAllAndOverride.mockReturnValue(true);
    await expect(guard.canActivate(contextFor({}))).resolves.toBe(true);
    expect(usersService.findById).not.toHaveBeenCalled();
  });

  it('rejects a protected route without a session user', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    await expect(
      guard.canActivate(contextFor({ session: {} } as Partial<Request>)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('loads and attaches an ACTIVE session user', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    const request = { session: { userId: 'user-id' } } as Partial<Request> & {
      user?: unknown;
    };
    const user = {
      id: 'user-id',
      email: 'student@example.com',
      fullName: 'Student User',
      role: UserRole.STUDENT,
      status: UserStatus.ACTIVE,
    };
    usersService.findById.mockResolvedValue(user);

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(request.user).toEqual(user);
  });

  it.each([null, UserStatus.INACTIVE, UserStatus.LOCKED])(
    'rejects a missing or unavailable user (%s)',
    async (status) => {
      reflector.getAllAndOverride.mockReturnValue(false);
      usersService.findById.mockResolvedValue(
        status
          ? {
              id: 'user-id',
              email: 'student@example.com',
              fullName: 'Student User',
              role: UserRole.STUDENT,
              status,
            }
          : null,
      );

      await expect(
        guard.canActivate(
          contextFor({ session: { userId: 'user-id' } } as Partial<Request>),
        ),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    },
  );
});
