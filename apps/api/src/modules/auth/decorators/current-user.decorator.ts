import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { PublicUser } from '../../users/user.types';

interface AuthenticatedRequest extends Request {
  user?: PublicUser;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): PublicUser | undefined => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    return request.user;
  },
);
