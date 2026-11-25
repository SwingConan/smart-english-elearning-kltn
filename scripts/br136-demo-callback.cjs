'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),cp=require('node:child_process'),crypto=require('node:crypto');
const ROOT=path.resolve(__dirname,'..'),STATE=path.join(ROOT,'.local-storage/br136-working-demo');
const old=path.join(ROOT,'.local-storage/v2-w07-sepay-fullstack-01');
const exe=path.join(old,'tools/cloudflared.exe'),expected='2493dbc168923bb3e59e5e7716f71deced92992eea9acd6e9d74f84ac7751343';
if(crypto.createHash('sha256').update(fs.readFileSync(exe)).digest('hex')!==expected)throw Error('VERIFIED_TUNNEL_BINARY_REQUIRED');
const ready=JSON.parse(fs.readFileSync(path.join(STATE,'BACKEND_READY.json'),'utf8'));
if(ready.oid!=='1313121'||ready.database!=='v2_wave01_dev_test_w04b_br136_demo_20261111_42db33')throw Error('INDEPENDENT_DEMO_REQUIRED');
const endpoint='/api/v2/payments/sepay/webhook';
const server=http.createServer((req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
 if(req.url!==endpoint){res.writeHead(404);res.end();return;}
 if(req.method!=='POST'){res.writeHead(405,{Allow:'POST'});res.end();return;}
 if(!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type']||'')){res.writeHead(415);res.end();return;}
 let size=0,oversize=false;const chunks=[];
 req.on('data',b=>{size+=b.length;if(size>65536){oversize=true;chunks.length=0;if(!res.headersSent){res.writeHead(413);res.end();}}else if(!oversize)chunks.push(b);});
 req.on('end',()=>{if(oversize)return;const body=Buffer.concat(chunks);
  const up=http.request({host:'127.0.0.1',port:3000,path:endpoint,method:'POST',timeout:25000,headers:{'content-type':'application/json','content-length':body.length,'x-sepay-timestamp':req.headers['x-sepay-timestamp']||'','x-sepay-signature':req.headers['x-sepay-signature']||''}},incoming=>{res.writeHead(incoming.statusCode||502,{'Content-Type':'application/json'});incoming.pipe(res);});
  up.on('timeout',()=>up.destroy());up.on('error',()=>{if(!res.headersSent)res.writeHead(503);res.end('{"success":false}');});up.end(body);
 });
});
server.listen({host:'127.0.0.1',port:3037,exclusive:true},()=>{
 const log=fs.openSync(path.join(STATE,'TUNNEL.private.log'),'a');
 const child=cp.spawn(exe,['tunnel','--no-autoupdate','--protocol','http2','--url','http://127.0.0.1:3037'],{windowsHide:true,stdio:['ignore','pipe','pipe']});let origin;
 const output=chunk=>{fs.writeSync(log,chunk);const m=chunk.toString().match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);if(m&&!origin){origin=m[0];const proof={origin,url:origin+endpoint,pid:process.pid,tunnelPid:child.pid,backendPid:ready.pid,databaseOid:'1313121',webhookOnly:true,expiresAfterMinutes:120};fs.writeFileSync(path.join(STATE,'HTTPS_CALLBACK.json'),JSON.stringify(proof,null,2));console.log(JSON.stringify(proof));}};
 child.stdout.on('data',output);child.stderr.on('data',output);let stopping=false;
 const stop=()=>{if(stopping)return;stopping=true;clearInterval(watcher);clearTimeout(expiry);server.close();child.kill('SIGTERM');setTimeout(()=>process.exit(0),500);};
 const watcher=setInterval(()=>{if(fs.existsSync(path.join(STATE,'STOP_REQUESTED')))stop();},1000),expiry=setTimeout(stop,120*60*1000);
 process.once('SIGINT',stop);process.once('SIGTERM',stop);child.once('exit',stop);
});
server.on('error',()=>{console.error('DEMO_CALLBACK_PORT_UNAVAILABLE');process.exitCode=1;});
