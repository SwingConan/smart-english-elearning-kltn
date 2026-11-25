import * as request from 'supertest';
import { randomUUID, createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { startWave01App } from './wave01-postgres.fixture';
import { seedWave02 } from './wave02.fixture';
import { Client } from 'pg';
(process.env.WAVE01_PG_URL ? describe : describe.skip)(
  'CF-W03BC-01 bounded serial/load replay with correlation/pool/locks',
  () => {
    let dev: Awaited<ReturnType<typeof startWave01App>>, f: Awaited<ReturnType<typeof seedWave02>>;
    const records: object[] = [],
      logs: string[] = [],
      pgSamples: object[] = [];
    beforeAll(async () => {
      process.env.CATALOG_DIAGNOSTICS = 'true';
      dev = await startWave01App();
      f = await seedWave02(dev.prisma, 'CF-W03BD');
      dev.app.useLogger({
        log: (s: unknown) => {
          if (typeof s === 'string' && s.includes('catalog_http')) logs.push(s);
        },
        error: (s: unknown) => {
          if (typeof s === 'string' && s.includes('catalog_http')) logs.push(s);
        },
        warn: () => {},
        debug: () => {},
        verbose: () => {},
      });
    }, 60000);
    afterAll(async () => {
      delete process.env.CATALOG_DIAGNOSTICS;
      await writeFile(
        (process.env.W04A_EVIDENCE_ROOT ?? '.local-storage/v2-wave03bd')+'/catalog-replay-evidence.json',
        JSON.stringify(
          {
            finding: 'CF-W03BC-01',
            rootCause: 'UNKNOWN — clean bounded replay does not close finding',
            records,
            logs: logs.map((s) => JSON.parse(s)),
            pgSamples,
            stopTheLine: records.some((x: { status?: number }) => (x.status ?? 0) >= 500),
          },
          null,
          2,
        ),
      );
      if (dev) {
        if (f) {
          await dev.prisma.user.updateMany({
            where: {
              id: {
                in: [
                  ...f.users.map((x) => x.id),
                  f.otherAcademic.id,
                  ...f.contenders.map((x) => x.id),
                ],
              },
            },
            data: { status: 'INACTIVE' },
          });
          await dev.prisma.course.update({
            where: { id: f.published.id },
            data: { isPublished: false },
          });
        }
        await dev.app.close();
      }
    });
    async function one(label: string) {
      const id = randomUUID(),
        start = performance.now(),
        res = await request(dev.app.getHttpServer())
          .get('/api/courses?search=CF-W03BD%20TOEIC&limit=1&page=1')
          .set('X-Request-Id', id);
      records.push({
        phase: label,
        requestId: id,
        status: res.status,
        elapsedMs: Math.round(performance.now() - start),
        correlation: res.headers['x-request-id'],
        pool: dev.prisma.poolSnapshot(),
      });
      expect(res.headers['x-request-id']).toBe(id);
      if (res.status >= 500) throw Error('STOP_THE_LINE_CF_W03BC_01_REPRODUCED ' + id);
      expect(res.status).toBe(200);
      expect(res.body.meta.total).toBe(1);
      expect(res.body.data[0].id).toBe(f.published.id);
      expect(JSON.stringify(res.body)).not.toMatch(
        /PRIVATE_MEET|meetingUrl|passwordHash|learnerId|isCorrect|explanation/,
      );
    }
    it('64 serial public GETs preserve exact results/privacy, correlate logs and do not mutate rows', async () => {
      const before = await dev.prisma.course.findUniqueOrThrow({ where: { id: f.published.id } });
      for (let i = 0; i < 64; i++) await one('serial');
      const after = await dev.prisma.course.findUniqueOrThrow({ where: { id: f.published.id } });
      expect(createHash('sha256').update(JSON.stringify(after)).digest('hex')).toBe(
        createHash('sha256').update(JSON.stringify(before)).digest('hex'),
      );
      expect(logs.length).toBeGreaterThanOrEqual(64);
    });
    it('128 GETs with concurrency4, bounded pool/lock observation and no 500 are evidence, not a root-cause fix', async () => {
      const c = new Client({ connectionString: process.env.E2E_DATABASE_URL });
      await c.connect();
      let busy = false;
      const sample = async () => {
        if (busy) return;
        busy = true;
        try {
          pgSamples.push(
            (
              await c.query(
                "SELECT count(*) FILTER(WHERE state='active')::int AS active,count(*) FILTER(WHERE wait_event_type='Lock')::int AS lock_waits,count(*) FILTER(WHERE state='idle in transaction')::int AS idle_transactions FROM pg_stat_activity WHERE datname=current_database()",
              )
            ).rows[0],
          );
        } finally {
          busy = false;
        }
      };
      const interval = setInterval(() => void sample(), 250);
      try {
        for (let b = 0; b < 32; b++) {
          await Promise.all([0, 1, 2, 3].map(() => one('bounded4')));
          await sample();
        }
      } finally {
        clearInterval(interval);
        while (busy) await new Promise((r) => setTimeout(r, 10));
        await c.end();
      }
      expect(records).toHaveLength(192);
      expect(logs).toHaveLength(192);
      expect(pgSamples.length).toBeGreaterThan(0);
      expect(logs.join('')).not.toMatch(/password|cookie|PRIVATE_MEET|CF-W03BD TOEIC|SELECT|WHERE/);
      expect(dev.prisma.poolSnapshot().waiting).toBe(0);
    });
  },
);
