import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole, UserStatus } from '../../../generated/prisma/client';
import { RolesGuard } from './roles.guard';

describe('RolesGuard', () => {
  const reflector = { getAllAndOverride: jest.fn() };
  const guard = new RolesGuard(reflector as unknown as Reflector);
  const user = {
    id: 'user-id',
    email: 'student@example.com',
    fullName: 'Student User',
    role: UserRole.STUDENT,
    status: UserStatus.ACTIVE,
  };
  const contextFor = (request: object): ExecutionContext =>
    ({
      getHandler: () => function handler() {},
      getClass: () => class TestController {},
      switchToHttp: () => ({ getRequest: () => request }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('passes routes without role metadata', () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    expect(guard.canActivate(contextFor({}))).toBe(true);
  });

  it('passes when the authenticated user has an allowed role', () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.STUDENT]);
    expect(guard.canActivate(contextFor({ user }))).toBe(true);
  });

  it('rejects an authenticated user with the wrong role', () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.ADMIN_COORDINATOR]);
    expect(() => guard.canActivate(contextFor({ user }))).toThrow(
      ForbiddenException,
    );
  });
});
