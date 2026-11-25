import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { PublicUser } from '../users/user.types';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { IS_PUBLIC_KEY } from '../auth/decorators/public.decorator';
import { AuthorizationService } from './authorization.service';
import { PERMISSION_KEY } from './permission.decorator';

@Injectable()
export class AuthorizationGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authority: AuthorizationService,
  ) {}
  async canActivate(context: ExecutionContext) {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;
    const request = context.switchToHttp().getRequest<Request & { user?: PublicUser }>();
    const capability = this.reflector.getAllAndOverride<string>(PERMISSION_KEY, targets);
    const roles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, targets);
    // No legacy coordinator has any privileged allowlist in Wave01.
    const legacy = roles?.includes('ADMIN_COORDINATOR');
    if (!capability && !legacy) return true;
    if (capability && request.user && (await this.authority.permits(request.user.id, capability)))
      return true;
    if (request.user)
      await this.authority.audit(
        // Public audit method uses Prisma by default through deny().
        this.authorityClient(),
        request.user.id,
        'HTTP_DENIED',
        'ENDPOINT',
        context.getClass().name + '.' + context.getHandler().name,
        'No effective allowlisted capability',
        'DENY',
      );
    throw new ForbiddenException({
      code: 'CAPABILITY_REQUIRED',
      message: 'This action is not authorized in Wave01',
    });
  }
  private authorityClient() {
    return this.authority.client;
  }
}
