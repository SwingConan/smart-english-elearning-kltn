import { CanActivate, ConflictException, ExecutionContext, Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { privatePlacementPreviewEnabled } from './placement-preview.guard';
@Injectable()
export class LegacyPlacementFixtureGuard implements CanActivate {
  constructor(private readonly db: PrismaService) {}
  async canActivate(context: ExecutionContext) {
    const u = context.switchToHttp().getRequest<{ user?: { id: string; email: string } }>().user;
    if (!u?.email?.endsWith('@example.invalid'))
      throw new ConflictException('LEGACY_PLACEMENT_SOURCE_UNVERIFIED');
    const enabled = await this.db.$transaction((tx) => privatePlacementPreviewEnabled(tx));
    if (!enabled) throw new ConflictException('LEGACY_PLACEMENT_SOURCE_UNVERIFIED');
    return true;
  }
}
