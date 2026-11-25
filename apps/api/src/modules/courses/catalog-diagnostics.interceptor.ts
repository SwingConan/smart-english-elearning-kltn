import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  Logger,
  type NestInterceptor,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import { tap } from 'rxjs';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
// Bounded, process-local safe trace for incident correlation even when a test logger is disabled.
// No HTTP debug endpoint; no SQL, query text, cookies or identity fields.
const recentCatalogRecords: object[] = [];
export const catalogDiagnosticSnapshot = () => recentCatalogRecords.map((x) => ({ ...x }));
@Injectable()
export class CatalogDiagnosticsInterceptor implements NestInterceptor {
  private readonly logger = new Logger('CatalogDiagnostics');
  constructor(private readonly db: PrismaService) {}
  intercept(context: ExecutionContext, next: CallHandler) {
    const req = context.switchToHttp().getRequest<Request>(),
      res = context.switchToHttp().getResponse<Response>(),
      incoming = req.header('X-Request-Id');
    const requestId =
        incoming && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(incoming)
          ? incoming.toLowerCase()
          : randomUUID(),
      started = performance.now();
    res.setHeader('X-Request-Id', requestId);
    let failure: unknown;
    res.once('finish', () => {
      const e =
        failure && typeof failure === 'object'
          ? (failure as { code?: unknown; stack?: unknown; constructor?: { name?: string } })
          : null;
      const record = {
        event: 'catalog_http',
        requestId,
        route: '/api/courses',
        status: res.statusCode,
        elapsedMs: Math.round(performance.now() - started),
        pool: this.db.poolSnapshot(),
        ...(e
          ? {
              errorFamily: String(e.constructor?.name ?? 'Error')
                .replace(/[^A-Za-z0-9_]/g, '')
                .slice(0, 64),
              errorCode:
                typeof e.code === 'string' && /^[A-Z0-9_]{1,12}$/.test(e.code) ? e.code : null,
              httpErrorStatus: failure instanceof HttpException ? failure.getStatus() : 500,
              // Frames only: exclude error/SQL/query messages and absolute machine paths.
              stackFrames: typeof e.stack === 'string' ? e.stack.split('\n')
                .filter(line => /^\s*at [\w.$<>]+ .*:\d+:\d+\)?$/.test(line))
                .slice(0, 10).map(line => line.trim().replace(/\([^)]*[\\/]([^\\/():]+:\d+:\d+)\)/, '($1)').slice(0, 200)) : [],
            }
          : {}),
      };
      recentCatalogRecords.push(record);
      if (recentCatalogRecords.length > 256) recentCatalogRecords.shift();
      if (res.statusCode >= 500) this.logger.error(JSON.stringify(record));
      else if (process.env.CATALOG_DIAGNOSTICS === 'true') this.logger.log(JSON.stringify(record));
    });
    return next.handle().pipe(
      tap({
        error: (e) => {
          failure = e;
        },
      }),
    );
  }
}
