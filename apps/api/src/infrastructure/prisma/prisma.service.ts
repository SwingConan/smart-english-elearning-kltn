import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { instantAwarePg, type PgPoolSnapshot } from './pg-instant-adapter';
import { PrismaClient } from '../../generated/prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnApplicationShutdown {
  readonly poolSnapshot: () => PgPoolSnapshot;
  constructor(config: ConfigService) {
    const connectionString = config.get<string>('DATABASE_URL');

    if (!connectionString) {
      throw new Error('DATABASE_URL is required. Copy apps/api/.env.example to apps/api/.env.');
    }

    const schema = new URL(connectionString).searchParams.get('schema') ?? undefined;
    const adapter = instantAwarePg({ connectionString }, schema);
    super({ adapter });
    this.poolSnapshot = adapter.diagnostics;
  }

  async onApplicationShutdown(): Promise<void> {
    await this.$disconnect();
  }
}
