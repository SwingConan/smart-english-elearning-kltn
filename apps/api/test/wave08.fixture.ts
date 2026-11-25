import * as request from 'supertest';
import { randomUUID } from 'node:crypto';
import { startWave01App } from './wave01-postgres.fixture';
import { seedWave06 } from './wave06.fixture';
import { grantAcademic } from './wave02b.fixture';
export async function seedWave08(d:Awaited<ReturnType<typeof startWave01App>>){
 process.env.W06_ENABLED='DEV_DEC047';process.env.W08_ENABLED='DEV_DEC053';
 const f=await seedWave06(d.prisma),g=await seedWave06(d.prisma),agents=new Map<string,ReturnType<typeof request.agent>>();
 for(const u of [...f.users,f.otherAcademic,f.ungrantedAcademic,...g.users,g.otherAcademic])if(!agents.has(u.id)){
  const a=request.agent(d.app.getHttpServer());await a.post('/api/auth/login').send({email:u.email,password:f.password}).expect(200);agents.set(u.id,a);
 }
 for(const cls of [f.classroom,g.classroom])for(const u of [f.academic,f.planningApprover])for(const cap of ['inspection.assign','inspection.hours.review','shift.review'])await grantAcademic(d.prisma,u.id,f.approver.id,f.secondApprover.id,cap,'CLASS',cls.id);
 const post=async(u:{id:string},p:string,b:object)=>(await agents.get(u.id)!.post('/api'+p).send(b).expect(201)).body as {id:string;lockVersion:number};
 const now=async()=>(await d.prisma.$queryRaw<{ms:number}[]>`SELECT extract(epoch FROM clock_timestamp())::double precision*1000 AS ms`)[0].ms;
 const reason='Synthetic W08 human evidence; no real staff';const assignments=[];
 for(const x of [f,g]){
  const n=await now();const a=await post(x.academic,'/v2/academic/classes/'+x.classroom.id+'/assignments',{instructorId:x.teacher.id,effectiveFrom:new Date(n+2000).toISOString(),effectiveTo:new Date(n+86400000).toISOString(),reason});
  const pending=await post(x.academic,'/v2/academic/assignments/'+a.id+'/submit',{expectedLockVersion:0,reason});await post(x.planningApprover,'/v2/academic/assignments/'+a.id+'/approve',{expectedLockVersion:pending.lockVersion,eligibilityConfirmed:true,reason});assignments.push(a);
 }
 await new Promise(r=>setTimeout(r,2200));const n=await now(),sessions=[];
 for(const [i,x]of [f,g].entries()){
  const draft=await d.prisma.teachingSession.create({data:{classOfferingId:x.classroom.id,startsAt:new Date(n+5000),endsAt:new Date(n+3600000),timezone:'Asia/Ho_Chi_Minh',modality:'ONLINE',assignmentId:assignments[i].id,instructorId:x.teacher.id,requiredCapabilities:[],proposedBy:x.academic.id,reason}});
  const p=await post(x.academic,'/v2/academic/sessions/'+draft.id+'/submit',{expectedLockVersion:0,reason});await post(x.planningApprover,'/v2/academic/sessions/'+draft.id+'/approve',{expectedLockVersion:p.lockVersion,reason});
  const meet=await post(x.teacher,'/v2/session-engagement/sessions/'+draft.id+'/meet',{url:'https://meet.google.com/abc-defg-hij',key:randomUUID(),reason});
  await post(x.planningApprover,'/v2/session-engagement/reviews/meet/'+meet.id,{decision:'APPROVED',key:randomUUID(),reason});sessions.push(draft);
 }
 while(await now()<n+5000)await new Promise(r=>setTimeout(r,40));
 return {f,g,agents,sessions,reason};
}
