import { ExecutionContext, Logger } from '@nestjs/common';
import { firstValueFrom, of, throwError } from 'rxjs';
import { CatalogDiagnosticsInterceptor } from './catalog-diagnostics.interceptor';
import type { PrismaService } from '../../infrastructure/prisma/prisma.service';
describe('CF-W03BC-01 safe correlation diagnostics', () => {
  afterEach(() => {
    delete process.env.CATALOG_DIAGNOSTICS;
    jest.restoreAllMocks();
  });
  function fixture(header: string, status: number) {
    let finish = () => {};
    const headers: Record<string, string> = {},
      ctx = {
        switchToHttp: () => ({
          getRequest: () => ({
            header: () => header,
            query: { search: 'PRIVATE_SEARCH' },
            headers: { cookie: 'PRIVATE_COOKIE' },
          }),
          getResponse: () => ({
            statusCode: status,
            setHeader: (k: string, v: string) => {
              headers[k] = v;
            },
            once: (_n: string, f: () => void) => {
              finish = f;
            },
          }),
        }),
      } as unknown as ExecutionContext,
      interceptor = new CatalogDiagnosticsInterceptor({
        poolSnapshot: () => ({ total: 2, idle: 1, waiting: 0 }),
      } as PrismaService);
    return { ctx, interceptor, headers, finish: () => finish() };
  }
  it('propagates the original failure and logs only correlated error code/pool, never SQL/search/cookie', async () => {
    const spy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {}),
      f = fixture('a0a0a0a0-1111-4444-8888-010101010101', 500),
      error = Object.assign(new Error('PRIVATE_SQL_PRIVATE_PARAMETER'), { code: 'P2028' });
    await expect(
      firstValueFrom(f.interceptor.intercept(f.ctx, { handle: () => throwError(() => error) })),
    ).rejects.toBe(error);
    f.finish();
    const text = String(spy.mock.calls[0][0]);
    expect(text).toContain('P2028');
    expect(text).toContain(f.headers['X-Request-Id']);
    expect(text).not.toMatch(/PRIVATE_|cookie|SELECT|password/);
  });
  it('rejects a log-injection header and keeps success logging opt-in', async () => {
    const spy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {}),
      f = fixture('malicious\nPRIVATE_COOKIE', 200);
    await firstValueFrom(f.interceptor.intercept(f.ctx, { handle: () => of({ ok: true }) }));
    f.finish();
    expect(f.headers['X-Request-Id']).toMatch(/^[a-f0-9-]{36}$/);
    expect(spy).not.toHaveBeenCalled();
  });
});
