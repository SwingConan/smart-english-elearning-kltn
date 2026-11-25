import { randomUUID, createHash } from 'node:crypto';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { startWave01App } from './wave01-postgres.fixture';
import { seedWave07 } from './wave07.fixture';
import { W07ProofStorage } from '../src/modules/admissions-finance/admissions-finance.storage';
const base = '/api/v2/admissions-finance/',
  reason = 'CF01 SYNTHETIC TEST only',
  pre = process.env.W07_CF_REPRO === '1';
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7z8AAAAASUVORK5CYII=',
  'base64',
);
function proof(tag: string) {
  const body = Buffer.from('TEST\0' + tag),
    type = Buffer.from('tEXt'),
    input = Buffer.concat([type, body]);
  let crc = 0xffffffff;
  for (const byte of input) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  const head = Buffer.alloc(4),
    tail = Buffer.alloc(4);
  head.writeUInt32BE(body.length);
  tail.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([png.subarray(0, -12), head, type, body, tail, png.subarray(-12)]);
}
describe('CF01 focused real HTTP/PostgreSQL F01/F02', () => {
  let d: Awaited<ReturnType<typeof startWave01App>>,
    f: Awaited<ReturnType<typeof seedWave07>>,
    feeId: string,
    historicA: string;
  const evidence: object[] = [],
    key = () => ({ key: randomUUID(), reason }),
    api = (u: { id: string }) => f.agents.get(u.id)!;
  function upload(k: string, tag: string, bytes = proof(tag)) {
    return api(f.learner)
      .post(base + 'obligations/' + feeId + '/evidence')
      .field('key', k)
      .field('amountVnd', '100000')
      .field('sourceRef', 'TEST-CF01-' + tag)
      .field('synthetic', 'true')
      .attach('file', bytes, { filename: 'SYNTHETIC_TEST.png', contentType: 'image/png' });
  }
  beforeAll(async () => {
    process.env.W07_ENABLED = 'DEV_DEC049';
    d = await startWave01App();
    f = await seedWave07(d);
    await d.prisma.classOffering.update({
      where: { id: f.freeClass.id },
      data: { maxStudents: 10 },
    });
    historicA = (
      await d.prisma.enrollment.create({
        data: {
          learnerId: f.otherLearner.id,
          classOfferingId: f.classes.normal.id,
          status: 'PENDING_PAYMENT',
        },
      })
    ).id;
    await api(f.academic)
      .post(base + 'classes/' + f.classes.normal.id + '/enable')
      .send(key())
      .expect(201);
    const a = await api(f.learner)
      .post(base + 'applications')
      .send({
        key: randomUUID(),
        classId: f.classes.normal.id,
        consent: true,
        consentVersion: 'W07_SYNTHETIC_ADMISSION_V1',
      })
      .expect(201);
    await api(f.planningApprover)
      .post(base + 'applications/' + a.body.id + '/academic-decisions')
      .send({ ...key(), decision: 'APPROVE', expectedVersion: 0 })
      .expect(201);
    feeId = (
      await d.prisma.w07Obligation.findUniqueOrThrow({ where: { applicationId: a.body.id } })
    ).id;
  }, 60000);
  afterEach(() => {
    process.env.W07_ENABLED = 'DEV_DEC049';
    jest.restoreAllMocks();
  });
  afterAll(async () => {
    await writeFile(
      resolve(
        process.env.W07_EVIDENCE_ROOT!,
        pre ? 'reproduction-original.json' : 'focused-evidence.json',
      ),
      JSON.stringify(evidence, null, 2),
    );
    await d?.app.close();
  });
  it('F01 ClassA controlled vs unrelated paid/free ClassB; feature ON and OFF', async () => {
    for (const [i, flag] of ['DEV_DEC049', 'OFF'].entries()) {
      process.env.W07_ENABLED = flag;
      const learner = f.contenders[i];
      await api(learner)
        .post('/api/enrollments')
        .send({ classOfferingId: f.classes.normal.id })
        .expect(409);
      for (const c of [f.freeClass, f.classroom]) {
        const r = await api(learner).post('/api/enrollments').send({ classOfferingId: c.id });
        expect(r.status).toBe(pre ? 409 : 201);
        if (!pre)
          expect(r.body.status).toBe(c.pricingType === 'FREE' ? 'ACTIVE' : 'PENDING_PAYMENT');
        evidence.push({
          finding: 'F01',
          flag,
          classScope: 'UNMANAGED',
          pricing: c.pricingType,
          http: r.status,
          expectedFixed: 201,
        });
      }
      const historic = await d.prisma.enrollment.findFirstOrThrow({
        where: { classOfferingId: f.classroom.id, learnerId: f.otherLearner.id },
      });
      if (pre)
        await expect(
          d.prisma.enrollment.update({ where: { id: historic.id }, data: { status: 'CANCELLED' } }),
        ).rejects.toThrow();
      else {
        await d.prisma.enrollment.update({
          where: { id: historic.id },
          data: { status: i === 0 ? 'CANCELLED' : 'PENDING_PAYMENT' },
        });
      }
      await expect(
        d.prisma.enrollment.update({ where: { id: historicA }, data: { status: 'ACTIVE' } }),
      ).rejects.toThrow();
      await expect(
        d.prisma.enrollment.update({
          where: { id: historic.id },
          data: { classOfferingId: f.classes.normal.id, status: 'ACTIVE' },
        }),
      ).rejects.toThrow();
    }
    process.env.W07_ENABLED = 'DEV_DEC049';
  });
  it('F02 durable COMMIT then driver ACK failure preserves same original proof and receipt', async () => {
    const k = randomUUID(),
      tag = 'COMMIT',
      bytes = proof(tag),
      original = d.prisma.$transaction.bind(d.prisma);
    const spy = jest.spyOn(d.prisma, '$transaction');
    spy.mockImplementationOnce((async (...args: Parameters<typeof original>) => {
      await original(...args);
      throw Error('CF01_INJECTED_ACK_LOSS_AFTER_REAL_COMMIT');
    }) as unknown as typeof original);
    await upload(k, tag, bytes).expect(500);
    spy.mockRestore();
    const row = await d.prisma.w07Evidence.findUniqueOrThrow({
      where: { learnerId_key: { learnerId: f.learner.id, key: k } },
    });
    let present = true;
    try {
      expect(await readFile(resolve(process.env.W07_PROOF_ROOT!, row.fileKey))).toEqual(bytes);
    } catch {
      present = false;
    }
    evidence.push({
      finding: 'F02',
      injection: 'POST_COMMIT_DRIVER_ACK_LOSS',
      rowDurable: true,
      filePresent: present,
      sha256: row.sha256,
      bytes: bytes.length,
      historicalLossClaim: false,
    });
    expect(present).toBe(!pre);
    if (pre) return;
    for (let i = 0; i < 2; i++) {
      const retry = await upload(k, tag, bytes).expect(201);
      expect(retry.body.id).toBe(row.id);
      expect(retry.body.sha256).toBe(row.sha256);
    }
    const download = await api(f.learner)
      .get(base + 'evidence/' + row.id + '/file')
      .expect(200);
    expect(createHash('sha256').update(download.body).digest('hex')).toBe(row.sha256);
    await api(f.otherLearner)
      .get(base + 'evidence/' + row.id + '/file')
      .expect(404);
    await api(f.planningApprover)
      .get(base + 'evidence/' + row.id + '/file')
      .expect(404);
    await api(f.cashier)
      .get(base + 'evidence/' + row.id + '/file')
      .expect(200);
    expect(await d.prisma.w07PaymentEvent.count({ where: { evidenceId: row.id } })).toBe(0);
    const review = await Promise.all([
      api(f.cashier)
        .post(base + 'evidence/' + row.id + '/review')
        .send({ ...key(), decision: 'VERIFY' }),
      api(f.cashier2)
        .post(base + 'evidence/' + row.id + '/review')
        .send({ ...key(), decision: 'VERIFY' }),
    ]);
    expect(review.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await d.prisma.w07PaymentEvent.count({ where: { evidenceId: row.id } })).toBe(1);
    expect(await d.prisma.w07Allocation.count({ where: { event: { evidenceId: row.id } } })).toBe(
      1,
    );
  });
  (pre ? it.skip : it)(
    'F02 confirmed rollback after INSERT removes only fenced unreferenced file; exact-key retry commits once',
    async () => {
      const k = randomUUID(),
        tag = 'ROLLBACK',
        original = d.prisma.$transaction.bind(d.prisma),
        storage = d.app.get(W07ProofStorage),
        put = jest.spyOn(storage, 'put');
      const spy = jest.spyOn(d.prisma, '$transaction');
      spy.mockImplementationOnce((async (work: (tx: unknown) => Promise<unknown>, opts: unknown) =>
        original(async (tx) => {
          await work(tx);
          throw Error('CF01_INJECTED_BEFORE_COMMIT');
        }, opts as never)) as unknown as typeof original);
      await upload(k, tag).expect(500);
      spy.mockRestore();
      const file = (await put.mock.results[0].value) as string;
      put.mockRestore();
      expect(await d.prisma.w07Evidence.count({ where: { learnerId: f.learner.id, key: k } })).toBe(
        0,
      );
      await expect(readFile(resolve(process.env.W07_PROOF_ROOT!, file))).rejects.toThrow();
      const retry = await upload(k, tag).expect(201);
      expect(await d.prisma.w07Evidence.count({ where: { learnerId: f.learner.id, key: k } })).toBe(
        1,
      );
      evidence.push({
        finding: 'F02',
        injection: 'DEFINITE_ROLLBACK',
        absentRow: true,
        fencedCleanup: true,
        retryId: retry.body.id,
      });
    },
  );
  (pre ? it.skip : it)(
    'F02 UNKNOWN commit/reconciliation unavailable retains binary; retry and concurrent upload are idempotent',
    async () => {
      const k = randomUUID(),
        tag = 'UNKNOWN',
        original = d.prisma.$transaction.bind(d.prisma),
        spy = jest.spyOn(d.prisma, '$transaction');
      spy.mockImplementationOnce((async (...args: Parameters<typeof original>) => {
        await original(...args);
        throw Error('CF01_UNKNOWN_ACK');
      }) as unknown as typeof original);
      spy.mockRejectedValueOnce(Error('CF01_RECONCILIATION_UNAVAILABLE'));
      await upload(k, tag).expect(500);
      spy.mockRestore();
      const row = await d.prisma.w07Evidence.findUniqueOrThrow({
        where: { learnerId_key: { learnerId: f.learner.id, key: k } },
      });
      expect(await readFile(resolve(process.env.W07_PROOF_ROOT!, row.fileKey))).toEqual(proof(tag));
      const out = await Promise.all([upload(k, tag), upload(k, tag)]);
      expect(out.map((r) => r.status)).toEqual([201, 201]);
      expect(out[0].body.id).toBe(row.id);
      expect(out[1].body.id).toBe(row.id);
      await upload(k, tag, proof('CHANGED')).expect(409);
      expect(await d.prisma.w07Evidence.count({ where: { learnerId: f.learner.id, key: k } })).toBe(
        1,
      );
      evidence.push({
        finding: 'F02',
        injection: 'UNKNOWN_AND_READ_UNAVAILABLE',
        privateFileRetained: true,
        sameKeyReceipts: out.map((r) => r.body.id),
      });
    },
  );
  (pre ? it.skip : it)(
    'F02 storage failure after write but before row leaves private unreferenced quarantine, never a paid receipt',
    async () => {
      const storage = d.app.get(W07ProofStorage),
        original = storage.put.bind(storage),
        before = await readdir(process.env.W07_PROOF_ROOT!),
        k = randomUUID(),
        tag = 'STORAGE';
      const spy = jest.spyOn(storage, 'put').mockImplementationOnce(async (...args) => {
        await original(...args);
        throw Error('CF01_STORAGE_CRASH_AFTER_WRITE');
      });
      await upload(k, tag).expect(500);
      spy.mockRestore();
      expect(await d.prisma.w07Evidence.count({ where: { learnerId: f.learner.id, key: k } })).toBe(
        0,
      );
      const after = await readdir(process.env.W07_PROOF_ROOT!);
      expect(after.length).toBe(before.length + 1);
      await upload(k, tag).expect(201);
      expect(await d.prisma.w07Evidence.count({ where: { learnerId: f.learner.id, key: k } })).toBe(
        1,
      );
      evidence.push({
        finding: 'F02',
        injection: 'STORAGE_WRITE_UNACKNOWLEDGED',
        unreferencedPrivateFilesRetained: 1,
        noAutomaticGc: true,
      });
    },
  );
});
