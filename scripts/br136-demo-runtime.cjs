'use strict';
// Independent demo only. The real dotenv is read privately by Node --env-file.
const fs=require('node:fs'),path=require('node:path');
const ROOT=path.resolve(__dirname,'..'),STATE=path.join(ROOT,'.local-storage/br136-working-demo');
const TARGET={database:'v2_wave01_dev_test_w04b_br136_demo_20261111_42db33',oid:'1313121',physical:'7702384118803149788'};
const managed=process.argv[2]==='--managed-launcher',managedRunId=managed?process.argv[3]:null;
if(managed&&!/^[a-f0-9-]{36}$/.test(managedRunId||''))throw Error('MANAGED_RUN_ID_REQUIRED');
const launcherConfig=require('./lib/br136-launcher-config.cjs');
fs.mkdirSync(STATE,{recursive:true});
(async()=>{
 let app;
 const envGeminiEnabled=(process.env.PLACEMENT_AI_ADVISORY_PROVIDER||'').trim().toUpperCase()==='GEMINI'&&process.env.PLACEMENT_AI_ADVISORY_STAGING_ENABLED==='true'&&Boolean((process.env.GEMINI_API_KEY||'').trim());
 const url='postgresql://wave01@127.0.0.1:55401/'+TARGET.database;
 Object.assign(process.env,{DATABASE_URL:url,E2E_DATABASE_URL:url,WAVE01_PG_URL:url,BATCH04_PG_URL:url,NODE_ENV:'development',WEB_ORIGIN:managed?launcherConfig.PUBLIC_ORIGIN:'http://127.0.0.1:5173',...(managed?{TRUST_PROXY:'loopback'}:{}),
  PLACEMENT_AI_ADVISORY_PROVIDER:envGeminiEnabled?'GEMINI':'NONE',
  PLACEMENT_AI_ADVISORY_STAGING_ENABLED:envGeminiEnabled?'true':'false',
  PLACEMENT_AI_ADVISORY_DAILY_BUDGET_CALLS:envGeminiEnabled?String(Math.max(1,Number(process.env.PLACEMENT_AI_ADVISORY_DAILY_BUDGET_CALLS)||200)):'0',
  PLACEMENT_AI_ADVISORY_LIVE_VERIFIED:envGeminiEnabled?(process.env.PLACEMENT_AI_ADVISORY_LIVE_VERIFIED||'false'):'false',
  GEMINI_ADVISORY_MODEL:(process.env.GEMINI_ADVISORY_MODEL||'gemini-3.5-flash-lite').trim(),
  PLACEMENT_AI_ADVISORY_TIMEOUT_MS:String(Math.max(1000,Number(process.env.PLACEMENT_AI_ADVISORY_TIMEOUT_MS)||30000)),
  W04B_ENABLED:'DEV_WORKFLOW',W05A_ENABLED:'DEV_SUPPORT',W05B_ENABLED:'DEV_DEC060',W06_ENABLED:'DEV_DEC047',W08_ENABLED:'DEV_DEC053',W09_ENABLED:'DEV_W09',REPORT_CENTER_TIME_ZONE:'Asia/Ho_Chi_Minh',
  W07_ENABLED:'DEV_DEC049',W07_RUN_INTENT:'DEC049_DISPOSABLE_ONLY',W07_EXPECTED_DATABASE:TARGET.database,W07_VERIFIED_OID:TARGET.oid,W07_WORKSPACE_ROOT:ROOT,
  PLACEMENT_INTERNAL_RELEASE:'PO_INTERNAL_20261113',
  ASSESSMENT_STIMULUS_AUTHORED_ROOT:path.join(ROOT,'.local-storage/v2-wave01/dev-media'),ASSESSMENT_STIMULUS_MEDIA_ROOT:path.join(ROOT,'.local-storage/v2-wave01/dev-media'),ASSESSMENT_RESPONSE_STORAGE_ROOT:path.join(ROOT,'.local-storage/v2-wave01/dev-responses'),
  SEPAY_CONFIG_FILE:path.join(ROOT,'.local-storage/v2-w07-sepay-fullstack-01/sepay-config.private.json')});
 for(const key of ['V2_UNIFIED_RUNTIME','SEPAY_CONTRACT_CHECKS'])process.env[key]='';
 for(const key of ['W06_RUN_INTENT','W07_CF_RUN_INTENT'])delete process.env[key];
 const nativeFetch=globalThis.fetch;
 const {windowsPrivateIdentity}=require('./lib/gemini-live-runtime.cjs');
 const identity=windowsPrivateIdentity();
 const {createBoundedGemini}=require('./lib/br136-bounded-gemini.cjs');
 const directory=path.join(identity.privateRoot,'bounded-web');
 const logGeminiEvent=entry=>{try{fs.mkdirSync(directory,{recursive:true});fs.appendFileSync(path.join(directory,'provider-events.jsonl'),JSON.stringify({...entry,rawBodySaved:false,headersSaved:false})+'\n');}catch{}};
 const directGeminiTransport=async(input,options)=>{
  const startedAt=new Date().toISOString();
  try{
   const response=await nativeFetch(input,options);
   logGeminiEvent({startedAt,finishedAt:new Date().toISOString(),httpStatus:response.status});
   return response;
  }catch(error){
   logGeminiEvent({startedAt,finishedAt:new Date().toISOString(),httpStatus:null,failure:options?.signal?.aborted?'ABORTED_OR_TIMEOUT':'NETWORK_ERROR'});
   throw error;
  }
 };
 const gate=createBoundedGemini({directory,machineBinding:identity.machineBinding,transport:directGeminiTransport});
 const bounded=gate.summary();
 if(!envGeminiEnabled&&bounded.enabled){
  Object.assign(process.env,{PLACEMENT_AI_ADVISORY_PROVIDER:'GEMINI',PLACEMENT_AI_ADVISORY_STAGING_ENABLED:'true',PLACEMENT_AI_ADVISORY_DAILY_BUDGET_CALLS:String(bounded.dailyBudgetCalls)});
 }
 const {assertSePayReadbackTarget}=require('./lib/br136-demo-network.cjs');
 globalThis.fetch=(input,options)=>{
  const address=input instanceof URL?input.href:typeof input==='string'?input:input.url;
  if(new URL(address).origin==='https://generativelanguage.googleapis.com'){
   return envGeminiEnabled?directGeminiTransport(input,options):gate.dispatch(input,options);
  }
  assertSePayReadbackTarget(input,options);
  return nativeFetch(input,options);
 };
 const {Client}=require('pg'),db=new Client({connectionString:url,connectionTimeoutMillis:3000});
 try{
  await db.connect();await db.query('BEGIN READ ONLY');
  const i=(await db.query("SELECT oid::text AS oid,(pg_control_system()).system_identifier::text AS physical FROM pg_database WHERE datname=current_database()")).rows[0];
  if(i.oid!==TARGET.oid||i.physical!==TARGET.physical)throw Error('DEMO_IDENTITY_REQUIRED');
  await db.query('SELECT br136_bank_check.assert_target()');await db.query('ROLLBACK');
 }finally{await db.end();}
 require('ts-node').register({transpileOnly:true,project:path.join(ROOT,'apps/api/tsconfig.json')});
 const {NestFactory}=require('@nestjs/core'),{ConfigService}=require('@nestjs/config');
 const {AppModule}=require('../apps/api/src/app.module.ts'),{configureHttpApplication}=require('../apps/api/src/app.setup.ts');
 const {GeminiAdvisoryAdapter}=require('../apps/api/src/modules/placement/gemini-advisory-provider.ts');
 const {PlacementWorkflowService}=require('../apps/api/src/modules/placement/workflow.service.ts');
 PlacementWorkflowService.configureSharedGeminiAdvisoryAdapter(
  envGeminiEnabled ? new GeminiAdvisoryAdapter() : new GeminiAdvisoryAdapter({operationGuard:()=>{gate.control();}}),
 );
 app=await NestFactory.create(AppModule,{logger:false,abortOnError:false,rawBody:true});
 // Optional, private one-email PO approval. Reuse the existing SMTP adapter;
 // never enable unrestricted email or put SMTP credentials into Web/.env/logs.
 const smtpDirectory=path.join(identity.privateRoot,'controlled-smtp');
 let controlledSmtp={configured:false,mode:'CONSOLE_NO_EXTERNAL_DELIVERY'};
 if((process.env.EMAIL_PROVIDER||'').trim().toLowerCase()==='smtp'){
  controlledSmtp={configured:true,mode:'DOTENV_SMTP'};
 }else if(fs.existsSync(path.join(smtpDirectory,'smtp.private.json'))){
  const {EmailSender}=require('../apps/api/src/infrastructure/email/email-sender.ts');
  const sender=app.get(EmailSender);
  try{
   const {loadPolicy,createControlledEmailSender}=require('./lib/br136-controlled-smtp.cjs');
   const policy=loadPolicy(smtpDirectory,identity.machineBinding);
   const {createEmailSender}=require('../apps/api/src/infrastructure/email/email.module.ts');
   const controlled=createControlledEmailSender({directory:smtpDirectory,machineBinding:identity.machineBinding,delegate:createEmailSender(new ConfigService(policy.config))});
   sender.send=message=>controlled.send(message);
   controlledSmtp={configured:true,mode:'ONE_PO_RECIPIENT_ONE_RESET_EMAIL',maximumMessages:1};
  }catch{
   sender.send=async()=>{throw Error('CONTROLLED_SMTP_DISABLED_OR_EXPIRED');};
   controlledSmtp={configured:true,mode:'BLOCKED_OR_EXPIRED_NO_EXTERNAL_DELIVERY'};
  }
 }
 app.use((req,res,next)=>{
  res.setHeader('X-Smart-English-Environment','demo');
  if(req.url==='/api/demo/environment'&&req.method==='GET')return res.json({mode:'demo',label:'Dữ liệu trình diễn'});
  if(req.url==='/api/v2/payments/sepay/webhook')res.once('finish',()=>{
   fs.appendFileSync(path.join(STATE,'WEBHOOK_DELIVERIES.jsonl'),JSON.stringify({at:new Date().toISOString(),httpStatus:res.statusCode,signaturePresent:typeof req.headers['x-sepay-signature']==='string'&&req.headers['x-sepay-signature'].length>0,timestampPresent:typeof req.headers['x-sepay-timestamp']==='string'&&req.headers['x-sepay-timestamp'].length>0,bodySaved:false,headerValuesSaved:false})+'\n');
  });
  next();
 });
 configureHttpApplication(app,app.get(ConfigService));await app.listen(3000,'127.0.0.1');
 const receipt={status:'DEMO_BACKEND_READY',pid:process.pid,...TARGET,apiOrigin:'http://127.0.0.1:3000',launcherRunId:managedRunId,webOrigin:process.env.WEB_ORIGIN,geminiProvider:(envGeminiEnabled||bounded.enabled)?'GEMINI':'NONE',aiMode:envGeminiEnabled?'DOTENV_GEMINI':(bounded.enabled?'BOUNDED_CONTROL':'NONE'),boundedAi:bounded,controlledSmtp,realBankChecksOnly:true,lifetime:'UNTIL_OPERATOR_STOP'};
 fs.writeFileSync(path.join(STATE,'BACKEND_READY.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt));
 let stopping=false;
 const stop=async()=>{if(stopping)return;stopping=true;clearInterval(watcher);try{await app.close();}finally{globalThis.fetch=nativeFetch;fs.writeFileSync(path.join(STATE,'BACKEND_STOPPED.json'),JSON.stringify({pid:process.pid,stoppedAt:new Date().toISOString()}));process.exit(0);}};
 const stopFile=managed?path.join(launcherConfig.STATE,'backend.stop.'+managedRunId):path.join(STATE,'STOP_REQUESTED');
 const watcher=setInterval(()=>{if(fs.existsSync(stopFile))void stop();},1000);
 process.once('SIGINT',()=>void stop());process.once('SIGTERM',()=>void stop());
})().catch(()=>{console.error('DEMO_BACKEND_BLOCKED_DETAILS_REDACTED');process.exitCode=1;});
