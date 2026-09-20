import { Injectable, NestMiddleware, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NextFunction, Request, RequestHandler, Response } from 'express';
import * as session from 'express-session';
import * as connectPgSimple from 'connect-pg-simple';
import { Pool } from 'pg';

const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class SessionMiddleware implements NestMiddleware, OnModuleDestroy {
  private readonly pool: Pool;
  private readonly store: connectPgSimple.PGStore;
  private readonly handler: RequestHandler;

  constructor(config: ConfigService) {
    const connectionString = config.getOrThrow<string>('DATABASE_URL');
    const secret = config.getOrThrow<string>('SESSION_SECRET');
    const isProduction = config.get<string>('NODE_ENV') === 'production';
    const PgStore = connectPgSimple(session);

    this.pool = new Pool({ connectionString });
    this.store = new PgStore({
      pool: this.pool,
      tableName: 'user_sessions',
      createTableIfMissing: false,
    });
    this.handler = session({
      name: 'sel.sid',
      secret,
      store: this.store,
      resave: false,
      saveUninitialized: false,
      rolling: true,
      cookie: {
        httpOnly: true,
        secure: isProduction,
        sameSite: 'lax',
        maxAge: SESSION_MAX_AGE_MS,
      },
    });
  }

  use(request: Request, response: Response, next: NextFunction): void {
    this.handler(request, response, next);
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.resolve(this.store.close());
    await this.pool.end();
  }
}
