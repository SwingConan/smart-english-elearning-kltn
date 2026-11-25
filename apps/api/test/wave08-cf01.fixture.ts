import { randomUUID, createHash, verify } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync, appendFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as request from 'supertest';
import type { Client, ClientConfig } from 'pg';
import type { PrismaService } from '../src/infrastructure/prisma/prisma.service';
import type { seedWave08 } from './wave08.fixture';
import type { startWave01App } from './wave01-postgres.fixture';
import { AuthorizationService } from '../src/modules/authorization/authorization.service';
type Bundle = Awaited<ReturnType<typeof seedWave08>>;
type Prepared = {
  bundle: Omit<Bundle, 'agents'>;
  ownFuture: Bundle['sessions'];
  raceSessions: string[];
  foreignId: string;
  backupInspector: Bundle['f']['inspector'];
  id: string;
};
type SeedManifest = {
  version: string;
  database: string;
  oid: string;
  dataSha256: string;
  snapshotSha256: string;
  publicKey: string;
  sessionIds: string[];
  assignmentIds: string[];
  grantIds: string[];
  userIds: string[];
  foreignSessionIds: string[];
  foreignAssignmentIds: string[];
};
const sha = (b: string | Buffer) => createHash('sha256').update(b).digest('hex');
export function stableSeedJSON(x: unknown): string {
  if (x === null || typeof x !== 'object') return JSON.stringify(x);
  if (Array.isArray(x)) return '[' + x.map(stableSeedJSON).join(',') + ']';
  const value = x as Record<string, unknown>;
  return '{' + Object.keys(value).sort().map((k) => JSON.stringify(k) + ':' + stableSeedJSON(value[k])).join(',') + '}';
}
export async function readSeedSnapshot(c: Client, m: Pick<SeedManifest, 'sessionIds' | 'assignmentIds' | 'grantIds' | 'userIds'>) {
  const result: Record<string, unknown> = {};
  for (const [name, table, column, ids] of [
    ['sessions', 'teaching_sessions', 'id', m.sessionIds],
    ['meets', 'w06_meet', 'sessionId', m.sessionIds],
    ['assignments', 'w08_assignment', 'id', m.assignmentIds],
    ['grants', 'permission_grants', 'id', m.grantIds],
  ] as const) {
    result[name] = (await c.query('SELECT to_jsonb(t) AS row FROM "' + table + '" t WHERE "' + column + '"=ANY($1::uuid[]) ORDER BY id', [ids])).rows.map((r: { row: unknown }) => r.row);
  }
  result.users = (await c.query('SELECT id,email,role,status FROM users WHERE id=ANY($1::uuid[]) ORDER BY id', [m.userIds])).rows;
  return result;
}
function reviveSeed(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(reviveSeed);
  const v = value as Record<string, unknown>;
  if (Object.keys(v).length === 1 && typeof v.$date === 'string') return new Date(v.$date);
  return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, reviveSeed(x)]));
}
export async function loadW08Preseed(d: Awaited<ReturnType<typeof startWave01App>>) {
  const file = process.env.W08_SEED_MANIFEST, dataFile = process.env.W08_SEED_DATA;
  if (!file || !dataFile || !process.env.W08_SEED_MANIFEST_SHA256 || !process.env.W08_SEED_PUBLICKEY_SHA256)
    throw Error('Explicit signed preseed receipt required');
  const bytes = readFileSync(file);
  if (sha(bytes) !== process.env.W08_SEED_MANIFEST_SHA256) throw Error('SEED_MANIFEST_CHANGED');
  const envelope = JSON.parse(bytes.toString()) as { payload: SeedManifest; signature: string };
  const m = envelope.payload;
  if (m.version !== 'DEC057_W08_SEED_V1' || sha(m.publicKey) !== process.env.W08_SEED_PUBLICKEY_SHA256 ||
      !verify(null, Buffer.from(stableSeedJSON(m)), m.publicKey, Buffer.from(envelope.signature, 'base64')))
    throw Error('SEED_SIGNATURE_INVALID');
  const dataBytes = readFileSync(dataFile);
  if (sha(dataBytes) !== m.dataSha256) throw Error('SEED_PRIVATE_DATA_CHANGED');
  const { a, b, pids } = await independentClients();
  try {
    const identity = (await a.query('SELECT current_database() AS database,oid::text AS oid FROM pg_database WHERE datname=current_database()')).rows[0];
    if (identity.database !== m.database || identity.oid !== m.oid) throw Error('SEED_PURPOSE_OID_MISMATCH');
    const snapshot = await readSeedSnapshot(a, m);
    if (sha(stableSeedJSON(snapshot)) !== m.snapshotSha256) throw Error('SEED_DATABASE_SNAPSHOT_CHANGED');
    if (new Set(m.foreignSessionIds).size !== 501 || new Set(m.foreignAssignmentIds).size !== 501)
      throw Error('SEED_501_REQUIRED');
    const counts = (await b.query('SELECT (SELECT count(*)::int FROM teaching_sessions WHERE id=ANY($1::uuid[]) AND state=\'PUBLISHED\') AS sessions,(SELECT count(*)::int FROM w08_assignment WHERE id=ANY($2::uuid[]) AND state=\'ACTIVE\') AS assignments', [m.foreignSessionIds, m.foreignAssignmentIds])).rows[0];
    if (counts.sessions !== 501 || counts.assignments !== 501) throw Error('SEED_COMMITTED_COUNT_MISMATCH');
    writeFileSync(join(process.env.W08_EVIDENCE_ROOT!, 'seed-beforeAll-independent-readback.json'), JSON.stringify({ identity, pids, counts, manifestSha256:sha(bytes), signatureVerified:true, snapshotSha256:m.snapshotSha256, bulkWrites:0 }, null, 2));
  } finally { await a.end(); await b.end(); }
  const prepared = reviveSeed(JSON.parse(dataBytes.toString())) as Prepared;
  const agents = new Map<string, ReturnType<typeof request.agent>>(), users = new Map<string, Bundle['f']['inspector']>();
  function collect(v: unknown) {
    if (!v || typeof v !== 'object') return;
    if (Array.isArray(v)) { v.forEach(collect); return; }
    const x = v as Record<string, unknown>;
    if (typeof x.id === 'string' && typeof x.email === 'string' && typeof x.passwordHash === 'string')
      users.set(x.id, x as Bundle['f']['inspector']);
    Object.values(x).forEach(collect);
  }
  collect(prepared.bundle); collect(prepared.backupInspector);
  for (const u of users.values()) {
    if (!u.email.endsWith('@example.invalid')) throw Error('NON_SYNTHETIC_SEED_USER');
    const agent = request.agent(d.app.getHttpServer());
    await agent.post('/api/auth/login').send({ email:u.email, password:prepared.bundle.f.password }).expect(200);
    agents.set(u.id, agent);
  }
  const method = d.app.get(AuthorizationService).requestGrant.toString();
  if (!['inspection.assign','inspection.hours.review','shift.review'].every((c) => method.includes(c)))
    throw Error('FINAL_CLASSIFIER_NOT_LOADED');
  writeFileSync(join(process.env.W08_EVIDENCE_ROOT!, 'loaded-classifier.json'), JSON.stringify({ pid:process.pid, functionSha256:sha(method), method, newNestInstance:true }, null, 2));
  return { ...prepared, bundle:{ ...prepared.bundle, agents } };
}
export async function actorSession(db: PrismaService, id: string) {
  return (
    await db.$queryRaw<
      { sid: string }[]
    >`SELECT sid FROM user_sessions WHERE sess->>'userId'=${id} AND expire>clock_timestamp() ORDER BY expire DESC LIMIT 1`
  )[0].sid;
}
export async function bulkOfficial(
  db: PrismaService,
  b: Bundle,
  x: Bundle['f'],
  count: number,
  base: Date,
) {
  const tag = 'W08-CF-BULK-' + randomUUID(),
    sid = await actorSession(db, x.teacher.id),
    reviewSid = await actorSession(db, x.planningApprover.id);
  const result: Bundle['sessions'] = [];
  // DEC056: real, bounded commits. Keep every original fixture row and guard.
  for (let offset = 0; offset < count; offset += 5) {
    if (process.env.W08_PRESEED_DEADLINE_NS && process.hrtime.bigint() >= BigInt(process.env.W08_PRESEED_DEADLINE_NS))
      throw Error('PRESEED_FINITE_BUDGET_EXHAUSTED');
    const size = Math.min(5, count - offset),
      instant = new Date(base.getTime() + offset * 60000).toISOString(),
      started = performance.now();
    const rows = await db.$transaction(
      async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(842030)`;
      const a = await tx.teachingSession.findUniqueOrThrow({
        where: { id: b.sessions[x === b.f ? 0 : 1].id },
      });
      await tx.$executeRaw`INSERT INTO teaching_sessions(id,"occurrenceId",revision,"classOfferingId","startsAt","endsAt",timezone,modality,"instructorId","assignmentId","requiredCapabilities",state,intent,"proposedBy",reason,"lockVersion","createdAt")
   SELECT gen_random_uuid(),gen_random_uuid(),1,${x.classroom.id}::uuid,${instant}::timestamptz+i*interval '60 seconds',${instant}::timestamptz+(i+1)*interval '60 seconds','Asia/Ho_Chi_Minh','ONLINE',${x.teacher.id}::uuid,${a.assignmentId}::uuid,ARRAY[]::"RoomCapability"[],'DRAFT','PUBLISH',${x.academic.id}::uuid,${tag},0,clock_timestamp() FROM generate_series(0,${size - 1})i`;
      await tx.$executeRaw`UPDATE teaching_sessions SET state='PENDING_APPROVAL',"lockVersion"=1 WHERE reason=${tag} AND state='DRAFT'`;
      await tx.$executeRaw`UPDATE teaching_sessions SET state='PUBLISHED',"approvedBy"=${x.planningApprover.id}::uuid,"approvedAt"=clock_timestamp(),"decisionReason"=${tag},"lockVersion"=2 WHERE reason=${tag} AND state='PENDING_APPROVAL'`;
      await tx.$queryRaw`SELECT set_config('app.w06_actor',${x.teacher.id},true),set_config('app.w06_session',${sid},true)`;
      await tx.$executeRaw`INSERT INTO w06_meet(id,"sessionId",number,url,"makerId",reason,key,state) SELECT gen_random_uuid(),id,1,'https://meet.google.com/abc-defg-hij',${x.teacher.id}::uuid,${tag},gen_random_uuid(),'PENDING_APPROVAL' FROM teaching_sessions s WHERE reason=${tag} AND NOT EXISTS(SELECT 1 FROM w06_meet m WHERE m."sessionId"=s.id)`;
      await tx.$queryRaw`SELECT set_config('app.w06_actor',${x.planningApprover.id},true),set_config('app.w06_session',${reviewSid},true)`;
      await tx.$executeRaw`UPDATE w06_meet SET state='APPROVED',"reviewerId"=${x.planningApprover.id}::uuid,"reviewReason"=${tag},"decisionKey"=gen_random_uuid() WHERE reason=${tag} AND state='PENDING_APPROVAL'`;
      return tx.teachingSession.findMany({ where: { reason: tag }, orderBy: { startsAt: 'asc' } });
      },
      { timeout: 30000 },
    );
    const all = rows;
    if (all.length !== offset + size || all[offset].startsAt.toISOString() !== instant)
      throw new Error('FINAL_FIXTURE_UTC_OR_COUNT_MISMATCH');
    appendFileSync(join(process.env.W08_EVIDENCE_ROOT!, 'fixture-binds.jsonl'), JSON.stringify({
      phase: 'bounded-official-commit', tag, classId: x.classroom.id, count, offset, size,
      sqlBindStart: instant, sqlBindEndBase: instant, committedRows: all.length,
      actualFirstStart: all[offset].startsAt.toISOString(),
      actualLastEnd: all.at(-1)!.endsAt.toISOString(), durationMs: performance.now() - started,
    }) + '\n');
    result.splice(0, result.length, ...all);
  }
  return result;
}

export async function bulkForeignAssignments(db: PrismaService, b: Bundle, sessions: { id: string }[]) {
  const sid = await actorSession(db, b.g.academic.id);
  for (let offset = 0; offset < sessions.length; offset += 5) {
    if (process.env.W08_PRESEED_DEADLINE_NS && process.hrtime.bigint() >= BigInt(process.env.W08_PRESEED_DEADLINE_NS))
      throw Error('PRESEED_FINITE_BUDGET_EXHAUSTED');
    const started = performance.now();
    const ids = sessions.slice(offset, offset + 5).map((s) => s.id);
    await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT set_config('app.w08_actor',${b.g.academic.id},true),set_config('app.w08_session',${sid},true)`;
      for (const id of ids)
        await tx.$executeRaw`INSERT INTO w08_assignment("sessionId","classId","teacherId","inspectorId","dispatcherId","meetId",revision,"startsAt","endsAt",state,version,reason)
        SELECT s.id,s."classOfferingId",s."instructorId",${b.g.inspector.id}::uuid,${b.g.academic.id}::uuid,m.id,s.revision,s."startsAt",s."endsAt",'ACTIVE',0,${b.reason} FROM teaching_sessions s JOIN w06_meet m ON m."sessionId"=s.id AND m.state='APPROVED' WHERE s.id=${id}::uuid`;
    }, { timeout: 30000 });
    appendFileSync(join(process.env.W08_EVIDENCE_ROOT!, 'fixture-binds.jsonl'), JSON.stringify({
      phase:'bounded-foreign-assignment-commit', offset, size:ids.length,
      committedSessionIds:ids, durationMs:performance.now()-started,
    }) + '\n');
  }
}
export async function independentClients() {
  if (!process.env.W08_TARGET_MODULE || !process.env.W07_RECEIPT_PATH)
    throw Error('Explicit verified W08 target required');
  const load = createRequire(__filename),
    safe = load(process.env.W08_TARGET_MODULE) as {
      stageA(env: NodeJS.ProcessEnv, r: unknown): { config: ClientConfig };
      stageB(db: Client, t: unknown, n: number): Promise<unknown>;
    };
  const target = safe.stageA(
    process.env,
    JSON.parse(readFileSync(process.env.W07_RECEIPT_PATH, 'utf8')),
  );
  const { Client } = load('pg') as typeof import('pg');
  const a = new Client(target.config),
    b = new Client(target.config);
  await Promise.all([a.connect(), b.connect()]);
  await safe.stageB(a, target, 32);
  await safe.stageB(b, target, 32);
  const pids = await Promise.all(
    [a, b].map(
      async (c) => (await c.query('SELECT pg_backend_pid() AS pid')).rows[0].pid as number,
    ),
  );
  if (pids[0] === pids[1]) throw Error('Independent backends required');
  return { a, b, pids };
}
