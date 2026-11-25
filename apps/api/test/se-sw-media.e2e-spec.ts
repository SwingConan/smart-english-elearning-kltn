import * as request from 'supertest';
import { createMediaPilotFixture, fixtureIds as ids } from './se-sw-media.fixture';

describe('SE-SW HTTP boundaries (real Nest/guards/service, in-memory DB/session fixture)', () => {
  it('checks foreign upload ownership before any blob write', async () => {
    const put = jest.spyOn(fixture.responseStorage, 'put');
    await other
      .post(`${base}/answers/${ids.question}/audio`)
      .attach('file', Buffer.from('test bytes'), {
        filename: 'response.webm',
        contentType: 'audio/webm',
      })
      .expect(404);
    expect(put).not.toHaveBeenCalled();
    put.mockRestore();
  });
  let fixture: Awaited<ReturnType<typeof createMediaPilotFixture>>;
  let owner: ReturnType<typeof request.agent>,
    other: ReturnType<typeof request.agent>,
    teacher: ReturnType<typeof request.agent>;
  const base = `/api/placement/attempts/${ids.attempt}`;
  beforeAll(async () => {
    fixture = await createMediaPilotFixture();
    owner = request.agent(fixture.app.getHttpServer());
    other = request.agent(fixture.app.getHttpServer());
    teacher = request.agent(fixture.app.getHttpServer());
    await owner.get('/__fixture/session/owner');
    await other.get('/__fixture/session/other');
    await teacher.get('/__fixture/session/teacher');
  });
  afterAll(async () => {
    await fixture.app?.close();
  });
  it('denies anonymous, foreign learner and teacher role over HTTP', async () => {
    await request(fixture.app.getHttpServer())
      .get(`${base}/stimuli/${ids.audio}/media`)
      .expect(401);
    await other.get(`${base}/stimuli/${ids.audio}/media`).expect(404);
    await teacher.get(`${base}/stimuli/${ids.audio}/media`).expect(403);
  });
  it('projects injected private table keys out of actual JSON response', async () => {
    const response = await owner.get(`${base}/exam`).expect(200);
    const text = JSON.stringify(response.body);
    for (const hidden of [
      'PRIVATE_',
      'storageKey',
      'expectedFacts',
      'sourceBrief',
      'rubric',
      'explanation',
    ])
      expect(text).not.toContain(hidden);
    const sheet = JSON.parse(response.body.groups[0].stimuli[0].textContent);
    expect(Object.keys(sheet)).toEqual(['kind', 'version', 'caption', 'columns', 'rows']);
    // Generic media fixture is not S10. S10 permits/policy are covered against PostgreSQL.
    expect(response.body.groups[0].playbackPolicy).toBeNull();
  });
  it('serves authorized same bytes without reusable cache; Range does not bypass auth', async () => {
    const response = await owner
      .get(`${base}/stimuli/${ids.audio}/media`)
      .set('Range', 'bytes=0-10')
      .expect(200);
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.headers['vary']).toContain('Cookie');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.body).toEqual(fixture.bytes);
    await other.get(`${base}/stimuli/${ids.audio}/media`).set('Range', 'bytes=0-10').expect(404);
  });
  it('protected/missing stimulus and unavailable storage fail safely', async () => {
    await owner.get(`${base}/stimuli/${ids.protected}/media`).expect(404);
    await owner.get(`${base}/stimuli/${ids.missing}/media`).expect(404);
    fixture.setMediaFailure('audio');
    const response = await owner.get(`${base}/stimuli/${ids.audio}/media`).expect(503);
    expect(JSON.stringify(response.body)).not.toContain('PRIVATE_STORAGE');
    expect(response.headers['cache-control']).toBe('private, no-store');
    fixture.setMediaFailure('');
  });
  it('does not leak malformed table internals or emit an explicitly retired item', async () => {
    const group = fixture.attempt.test.questionGroups[0],
      original = group.stimuli[0].textContent;
    group.stimuli[0].textContent = '{"kind":"assessment-table","expectedFacts":"PRIVATE"';
    const bad = await owner.get(`${base}/exam`).expect(503);
    expect(JSON.stringify(bad.body)).not.toContain('PRIVATE');
    group.stimuli[0].textContent = original;
    group.taskCode = 'SE_SW_01_W5_V01';
    await owner.get(`${base}/exam`).expect(503);
    group.taskCode = 'SE_SW_01_S10_V01';
  });
  it('revokes an old media URL after session logout', async () => {
    await owner.get('/__fixture/logout').expect(200);
    await owner.get(`${base}/stimuli/${ids.audio}/media`).expect(401);
  });
});
