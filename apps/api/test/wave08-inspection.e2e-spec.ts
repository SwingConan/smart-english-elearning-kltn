import * as request from 'supertest';
import {randomUUID}from 'node:crypto';
import {writeFile}from 'node:fs/promises';
import {join}from 'node:path';
import {startWave01App}from './wave01-postgres.fixture';
import {seedWave08}from './wave08.fixture';
describe('W08 DEC052/053 real HTTP/PostgreSQL inspection',()=>{
 let d:Awaited<ReturnType<typeof startWave01App>>,f:Awaited<ReturnType<typeof seedWave08>>,id:string,otherId:string,chosen:typeof f.f;
 const traces:object[]=[];const api=(u:{id:string})=>f.agents.get(u.id)!;
 const view=async(u:{id:string},k=id)=>(await api(u).get('/api/v2/inspection/assignments/'+k).expect(200)).body;
 const post=(u:{id:string},b:object,k=id)=>api(u).post('/api/v2/inspection/assignments/'+k+'/commands').send(b);
 const cmd=async(u:{id:string},action:string,extra:object={},k=id)=>{const v=await view(u,k);return post(u,{action,version:v.assignment.version,key:randomUUID(),reason:f.reason,...extra},k);};
 beforeAll(async()=>{d=await startWave01App();f=await seedWave08(d);},60000);
 afterAll(async()=>{await writeFile(join(process.env.W08_EVIDENCE_ROOT!,'http-traces.json'),JSON.stringify(traces,null,2));await d?.app.close();});
 it('all seven roles and guest have server role/resource boundaries',async()=>{
  for(const u of [f.f.learner,f.f.counselor,f.f.cashier,f.f.admin])await api(u).get('/api/v2/inspection').expect(403);
  await request(d.app.getHttpServer()).get('/api/v2/inspection').expect(401);
  for(const u of [f.f.teacher,f.f.inspector,f.f.academic])await api(u).get('/api/v2/inspection').expect(200);
  for(const u of [f.f.teacher,f.f.inspector,f.f.ungrantedAcademic])await api(u).post('/api/v2/inspection/assignments').send({sessionId:f.sessions[0].id,inspectorId:f.f.inspector.id,key:randomUUID(),reason:f.reason}).expect(404);
  traces.push({case:'sevenRolesAndGuest',pass:true});
 });
 it('two HTTP transactions atomically reject overlapping TT assignments across two classes',async()=>{
  const results=await Promise.all(f.sessions.map(s=>api(f.f.academic).post('/api/v2/inspection/assignments').send({sessionId:s.id,inspectorId:f.f.inspector.id,key:randomUUID(),reason:f.reason})));
  expect(results.map(r=>r.status).sort()).toEqual([201,409]);const index=results.findIndex(r=>r.status===201);id=results[index].body.id;chosen=index===0?f.f:f.g;
  const other=await api(f.f.academic).post('/api/v2/inspection/assignments').send({sessionId:f.sessions[1-index].id,inspectorId:f.g.inspector.id,key:randomUUID(),reason:f.reason}).expect(201);otherId=other.body.id;
  traces.push({case:'HTTP-overlap',statuses:results.map(r=>r.status),id,otherId});
 });
 it('only assigned TT has approved link; GV and foreign TT cannot obtain it or personnel clocks',async()=>{
  expect((await view(f.f.inspector)).meetUrl).toMatch(/^https:\/\/meet.google.com\//);
  const v=await view(chosen.teacher);expect(v.meetUrl).toBeNull();expect(v.clocks).toEqual([]);expect(v.approvedSeconds).toBeNull();expect(v.observedSeconds).toBeNull();expect(v.hoursState).toBe('UNCONFIRMED');
  await api(f.g.inspector).get('/api/v2/inspection/assignments/'+id).expect(404);
  await api(f.f.ungrantedAcademic).get('/api/v2/inspection/assignments/'+id).expect(404);
 });
 it('missing report cannot create zero or scheduled approved hours; client timestamps rejected',async()=>{
  expect((await cmd(f.f.academic,'REVIEW',{disposition:'APPROVE',approvedSeconds:0})).status).toBe(409);
  expect((await cmd(f.f.inspector,'START',{startedAt:'2000-01-01'})).status).toBe(400);
  expect((await view(chosen.teacher)).approvedSeconds).toBeNull();
 });
 it('same command key returns one durable shift receipt and duplicate clocks do not count twice',async()=>{
  const v=await view(f.f.inspector),b={key:randomUUID(),reason:f.reason,action:'IN',version:v.assignment.version};
  const r=await post(f.f.inspector,b).expect(201),retry=await post(f.f.inspector,b).expect(201);expect(retry.body).toEqual(r.body);
  expect((await cmd(f.f.inspector,'IN')).status).toBe(409);expect((await view(chosen.teacher)).approvedSeconds).toBeNull();
  expect(await d.prisma.w08Receipt.count({where:{actorId:f.f.inspector.id,key:b.key}})).toBe(1);
 });
 it('concurrent observation start has one open segment, server clocks and actual human interval',async()=>{
  const v=await view(f.f.inspector),b={action:'START',version:v.assignment.version,reason:f.reason};
  const r=await Promise.all([post(f.f.inspector,{...b,key:randomUUID()}),post(f.f.inspector,{...b,key:randomUUID()})]);expect(r.map(x=>x.status).sort()).toEqual([201,409]);
  await new Promise(r=>setTimeout(r,1100));expect((await cmd(f.f.inspector,'STOP')).status).toBe(201);
  const observed=await view(f.f.inspector);expect(observed.observedSeconds).toBeGreaterThanOrEqual(1);expect(observed.approvedSeconds).toBeNull();traces.push({case:'native-server-observation',segments:observed.segments,observedSeconds:observed.observedSeconds});
 });
 it('multiple real segments have union seconds and report remains TT-REPORTED without approval',async()=>{
  expect((await cmd(f.f.inspector,'START')).status).toBe(201);await new Promise(r=>setTimeout(r,1050));expect((await cmd(f.f.inspector,'STOP')).status).toBe(201);
  expect((await cmd(f.f.inspector,'REPORT',{presence:'LATE',conditions:'Human-attested synthetic teacher observation; no media'})).status).toBe(201);
  const v=await view(chosen.teacher);expect(v.segments).toHaveLength(2);expect(v.reports[0].attestation).toBe('TT-REPORTED');expect(v.observedSeconds).toBeGreaterThanOrEqual(2);expect(v.approvedSeconds).toBeNull();
 });
 it('TT/GV/QT cannot approve, overrun is blocked and two HVU reviewers use CAS',async()=>{
  expect((await cmd(f.f.inspector,'REVIEW',{disposition:'APPROVE',approvedSeconds:1})).status).toBe(404);
  expect((await cmd(chosen.teacher,'REVIEW',{disposition:'APPROVE',approvedSeconds:1})).status).toBe(404);
  const v=await view(f.f.academic);expect((await post(f.f.admin,{action:'REVIEW',version:v.assignment.version,key:randomUUID(),reason:f.reason,disposition:'APPROVE',approvedSeconds:1})).status).toBe(403);
  expect((await cmd(f.f.academic,'REVIEW',{disposition:'APPROVE',approvedSeconds:99999})).status).toBe(409);
  const r=await Promise.all([f.f.academic,f.f.planningApprover].map(u=>post(u,{action:'REVIEW',version:v.assignment.version,key:randomUUID(),reason:f.reason,disposition:'PARTIAL',approvedSeconds:1})));
  expect(r.map(x=>x.status).sort()).toEqual([201,409]);expect((await view(chosen.teacher)).approvedSeconds).toBe(1);traces.push({case:'dualHVU-review',statuses:r.map(x=>x.status)});
 });
 it('GV dispute and compensating review preserve old decisions; class outsiders denied',async()=>{
  expect((await cmd(chosen.teacher,'DISPUTE')).status).toBe(201);const before=await d.prisma.w08Decision.findMany({where:{assignmentId:id}});
  expect((await cmd(f.f.academic,'REVIEW',{disposition:'APPROVE',approvedSeconds:2})).status).toBe(201);const v=await view(chosen.teacher);expect(v.decisions).toHaveLength(2);expect(v.disputes).toHaveLength(1);
  expect(await d.prisma.w08Decision.findUnique({where:{id:before[0].id}})).toEqual(before[0]);
  const foreign=chosen===f.f?f.g.teacher:f.f.teacher;await api(foreign).get('/api/v2/inspection/assignments/'+id).expect(404);
 });
 it('personnel OUT is separate, corrections are reasoned and independently reviewed with history',async()=>{
  expect((await cmd(f.f.inspector,'OUT')).status).toBe(201);
  expect((await cmd(f.f.inspector,'CORRECTION',{kind:'WRONG_DEVICE',evidence:'Synthetic authenticated manual clock review'})).status).toBe(201);
  const v=await view(f.f.inspector),c=v.corrections[0];expect(v.clocks.map((x:{kind:string})=>x.kind)).toEqual(['IN','OUT']);
  expect((await cmd(f.f.inspector,'CORRECTION_REVIEW',{correctionId:c.id,disposition:'ACCEPT'})).status).toBe(404);
  expect((await cmd(f.f.academic,'CORRECTION_REVIEW',{correctionId:c.id,disposition:'ACCEPT'})).status).toBe(201);
  expect((await view(f.f.inspector)).corrections[0].decision.disposition).toBe('ACCEPT');expect((await view(chosen.teacher)).clocks).toEqual([]);
 });
 it('missed checkout uses typed request, does not forge OUT or GV hours',async()=>{
  expect((await cmd(f.g.inspector,'IN',{},otherId)).status).toBe(201);expect((await cmd(f.g.inspector,'CORRECTION',{kind:'MISSING_CHECKOUT',evidence:'Synthetic missed checkout; no invented timestamp'},otherId)).status).toBe(201);
  const v=await view(f.g.inspector,otherId);expect(v.clocks).toHaveLength(1);expect(v.corrections[0].decision).toBeNull();expect(v.approvedSeconds).toBeNull();
 });
 it('approved Meet revision invalidates stale assignment, link, approved projection and emits history/outbox',async()=>{
  await api(chosen.teacher).post('/api/v2/session-engagement/sessions/'+(await view(chosen.teacher)).assignment.sessionId+'/meet').send({url:'https://meet.google.com/xyz-abcd-efg',key:randomUUID(),reason:f.reason}).expect(201);
  const v=await view(f.f.inspector);expect(v.assignment.state).toBe('INVALIDATED');expect(v.valid).toBe(false);expect(v.meetUrl).toBeNull();expect(v.approvedSeconds).toBeNull();expect((await cmd(f.f.inspector,'START')).status).toBe(409);
  expect(await d.prisma.w08Revision.count({where:{assignmentId:id}})).toBeGreaterThan(0);expect(await d.prisma.w08Notification.count({where:{assignmentId:id,kind:'OFFICIAL_REVISION_INVALIDATED'}})).toBeGreaterThan(0);
 });
});
