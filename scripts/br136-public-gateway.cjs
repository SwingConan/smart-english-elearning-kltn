'use strict';
const fs=require('node:fs'),path=require('node:path'),C=require('./lib/br136-launcher-config.cjs');
(async()=>{const {Client}=require('pg'),db=new Client({connectionString:'postgresql://wave01@127.0.0.1:55401/'+C.DATABASE,connectionTimeoutMillis:3000});try{await db.connect();await db.query('BEGIN READ ONLY');await db.query('SELECT br136_bank_check.assert_target()');await db.query('ROLLBACK');}finally{await db.end();}
 const {privateRoot}=require('./lib/gemini-live-runtime.cjs').windowsPrivateIdentity(),credential=JSON.parse(fs.readFileSync(path.join(privateRoot,'public-demo/access.private.json'),'utf8'));
 const runId=process.argv[2];if(!/^[a-f0-9-]{36}$/.test(runId||''))throw Error('LAUNCHER_RUN_ID_REQUIRED');
 const server=require('./lib/br136-public-gateway.cjs').createGateway({credential,runId});server.listen(3040,'127.0.0.1',()=>console.log(JSON.stringify({status:'PUBLIC_GATEWAY_READY',port:3040,runId,publicOrigin:C.PUBLIC_ORIGIN,staticBuildOnly:true,privateGate:true})));
 const timer=setInterval(()=>{if(fs.existsSync(path.join(C.STATE,'gateway.stop.'+runId))){clearInterval(timer);server.close(()=>process.exit(0));server.closeIdleConnections();setTimeout(()=>{server.closeAllConnections();},3000).unref();}},500);timer.unref();
})().catch(()=>{console.error('PUBLIC_GATEWAY_BLOCKED_REDACTED');process.exitCode=1;});
