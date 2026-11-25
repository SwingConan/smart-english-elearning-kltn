import * as request from 'supertest';
import { createS10ServerFixture } from './s10-server.fixture';
import type { S10Command } from '../src/modules/placement/s10-ledger.prototype';

describe('S10 server contract over real HTTP, fixture session/DB/storage (not production)', () => {
  let f: Awaited<ReturnType<typeof createS10ServerFixture>>,
    owner: ReturnType<typeof request.agent>,
    other: ReturnType<typeof request.agent>,
    teacher: ReturnType<typeof request.agent>;
  let now = 1000,
    serial = 0,
    epoch = '',
    revision = 0,
    token = '',
    tabId = 'tab-owner';
  const cmd = (action: S10Command['action'], extra: Partial<S10Command> = {}) => ({
    action,
    key: `http-event-${++serial}`,
    epoch,
    revision,
    tabId,
    leaseToken: token,
    ...extra,
  });
  const send = async (command: S10Command) => {
    const response = await owner.post(f.base + '/events').send(command);
    if (response.status === 201) revision = response.body.state.revision;
    return response;
  };
  beforeAll(async () => {
    f = await createS10ServerFixture(Buffer.from('synthetic contract-only bytes'), 10, {
      now: () => now,
    });
    owner = request.agent(f.app.getHttpServer());
    other = request.agent(f.app.getHttpServer());
    teacher = request.agent(f.app.getHttpServer());
    await owner.get('/__fixture/session/owner');
    await other.get('/__fixture/session/other');
    await teacher.get('/__fixture/session/teacher');
    epoch = (await owner.get(f.base + '/state')).body.epoch;
  });
  afterAll(async () => {
    await f.app.close();
  });
  it('auth guards and owned attempt checks apply to the contract', async () => {
    await request(f.app.getHttpServer())
      .get(f.base + '/state')
      .expect(401);
    await other.get(f.base + '/state').expect(404);
    await teacher.get(f.base + '/state').expect(403);
  });
  it('two concurrent tabs produce one lease, and only identical idempotent retry recovers it', async () => {
    const a = cmd('CLAIM'),
      b = cmd('CLAIM', { key: 'other-tab-request', tabId: 'other-tab' });
    const responses = await Promise.all([
      owner.post(f.base + '/events').send(a),
      owner.post(f.base + '/events').send(b),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
    const winner = responses.find((r) => r.status === 201)!;
    // Ordering is intentionally not assumed; use the winning tab identity below.
    const winning = responses[0].status === 201 ? a : b;
    token = winner.body.leaseToken;
    revision = winner.body.state.revision;
    tabId = winning.tabId;
    const retry = await owner
      .post(f.base + '/events')
      .send(winning)
      .expect(201);
    expect(retry.body.leaseToken).toBe(token);
    expect(retry.body.duplicate).toBe(true);
    await owner
      .post(f.base + '/events')
      .send({ ...winning, tabId: 'spoofed-tab' })
      .expect(409);
  });
  it('rejects old revisions, unknown nonce, refresh claimant and early completion', async () => {
    await owner.post(f.base+'/events').send({...cmd('START_PLAY'),protocolVersion:2}).expect(400);
    await owner
      .post(f.base + '/events')
      .send(cmd('UPLOAD_BEGIN', { digest: 'a'.repeat(64) }))
      .expect(400);
    await owner
      .post(f.base + '/events')
      .send(cmd('START_PLAY', { revision: 0 }))
      .expect(409);
    const start = await send(cmd('START_PLAY'));
    const nonce = start.body.nonce;
    await owner
      .post(f.base + '/events')
      .send(cmd('CLAIM', { tabId: 'refresh-tab' }))
      .expect(423);
    await owner
      .get(f.base + '/media')
      .set({ 'x-s10-tab': tabId, 'x-s10-lease': token, 'x-s10-nonce': 'invalid' })
      .expect(409);
    const media = await owner
      .get(f.base + '/media')
      .set({ 'x-s10-tab': tabId, 'x-s10-lease': token, 'x-s10-nonce': nonce })
      .expect(200);
    expect(media.headers['cache-control']).toBe('private, no-store');
    await owner
      .get(f.base + '/media')
      .set({ 'x-s10-tab': tabId, 'x-s10-lease': token, 'x-s10-nonce': nonce, Range: 'bytes=0-10' })
      .expect(409);
    await owner
      .post(f.base + '/events')
      .send(cmd('COMPLETE_PLAY', { nonce }))
      .expect(409);
    now += 10;
    await send(cmd('COMPLETE_PLAY', { nonce }));
  });
  it('gesture continuation consumes no extra ordinal and server establishes a single deadline', async () => {
    const start = await send(cmd('START_PLAY')),
      nonce = start.body.nonce;
    await send(cmd('AUTOPLAY_DENIED', { nonce }));
    await send(cmd('RESUME_PLAY', { nonce }));
    await owner
      .get(f.base + '/media')
      .set({ 'x-s10-tab': tabId, 'x-s10-lease': token, 'x-s10-nonce': nonce })
      .expect(200);
    now += 10;
    const complete = cmd('COMPLETE_PLAY', { nonce });
    const result = await send(complete);
    expect(result.body.state.recordingDeadline).toBe(now + 30000);
    const deadline = result.body.state.recordingDeadline;
    const duplicate = await owner
      .post(f.base + '/events')
      .send(complete)
      .expect(201);
    expect(duplicate.body.state.recordingDeadline).toBe(deadline);
    await owner
      .post(f.base + '/events')
      .send(cmd('START_PLAY'))
      .expect(409);
    await send(cmd('BEGIN_RECORDING'));
    expect((await owner.get(f.base + '/state')).body.playStartedCount).toBe(2);
  });
  it('upload failure/retry is idempotent and SAVED comes from server after client state loss', async () => {
    now += 30000;
    await owner.get('/__fixture/upload-fails-once');
    const command = cmd('UPLOAD_BEGIN');
    const upload = () =>
      owner
        .post(f.base + '/answer')
        .field('command', JSON.stringify(command))
        .attach('file', Buffer.from('synthetic-recording'), {
          filename: 'response.webm',
          contentType: 'audio/webm',
        });
    await upload().expect(503);
    const response = await upload().expect(201);
    expect(response.body.state.phase).toBe('SAVED');
    await upload().expect(201);
    expect(f.attempt.answers).toHaveLength(1);
    const state = (await owner.get(f.base + '/state')).body;
    expect(state.phase).toBe('SAVED');
    expect(JSON.stringify(state)).not.toMatch(/leaseToken|storageKey|rubric|expectedFacts|nonce/);
  });
  it('logout invalidates the session even if the client retains a token', async () => {
    await owner.get('/__fixture/logout');
    await owner
      .post(f.base + '/events')
      .send(cmd('START_PLAY'))
      .expect(401);
  });
});
