'use strict';
const http = require('node:http'), fs = require('node:fs'), path = require('node:path');
const { randomBytes, timingSafeEqual } = require('node:crypto');
const { isIP } = require('node:net');
const C = require('./br136-launcher-config.cjs');
const hop = new Set(['connection','keep-alive','transfer-encoding','upgrade','te','trailer','proxy-authorization','proxy-authenticate']);
function escapeHtml(s) { return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function same(a,b) { const x=Buffer.from(String(a)),y=Buffer.from(String(b)); return x.length===y.length&&timingSafeEqual(x,y); }
function createGateway({ credential, dist=C.DIST, apiPort=3000, webhookPort=3037, runId='standalone' }) {
  if(!credential?.password || credential.password.length<32)throw Error('PRIVATE_GATE_CREDENTIAL_REQUIRED');
  const sessions=new Map(),tickets=new Map(),attempts=new Map();
  function publicRequest(req) { return req.headers.host===new URL(C.PUBLIC_ORIGIN).host || req.headers.host===new URL(C.PUBLIC_ORIGIN).host+':443'; }
  function localRequest(req) { return ['127.0.0.1:3040','localhost:3040'].includes(req.headers.host)&&['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)&&!req.headers['x-forwarded-for']&&!req.headers['x-forwarded-host']&&!req.headers['x-forwarded-proto']; }
  function allowedOrigin(req) { return [C.PUBLIC_ORIGIN,C.LOCAL_ORIGIN,'http://localhost:3040','http://127.0.0.1:5173'].includes(req.headers.origin); }
  function authenticated(req) { const sid=/(?:^|;\s*)se_demo_access=([A-Za-z0-9_-]{43})(?:;|$)/.exec(req.headers.cookie||'')?.[1]; const expiry=sid&&sessions.get(sid); return !!expiry&&expiry>Date.now(); }
  function safeNext(v) { return typeof v==='string'&&v.startsWith('/')&&!v.startsWith('//')&&!v.startsWith('/__')&&!/[\r\n\0]/.test(v)?v:'/'; }
  function authorize(res,nextPath='/') { const sid=randomBytes(32).toString('base64url'); sessions.set(sid,Date.now()+12*3600000); res.setHeader('Set-Cookie','se_demo_access='+sid+'; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=43200'); res.writeHead(303,{Location:safeNext(nextPath)});res.end(); }
  function html(res,body,status=200) {
    res.writeHead(status,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self' "+C.PUBLIC_ORIGIN+"; frame-ancestors 'none'; base-uri 'none'"});
    res.end('<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Smart English · Cổng quyền truy cập</title><style>*{box-sizing:border-box}body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px 16px;background:linear-gradient(135deg,#f3f7ef 0%,#f8fafc 55%,#ebf3e5 100%);color:#0f172a;font:15px/1.6 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}main{width:100%;max-width:460px;padding:32px 28px;background:#fff;border:1px solid #dce7d5;border-radius:20px;box-shadow:0 16px 40px -18px rgba(34,64,18,.18)}.brand{display:flex;align-items:center;gap:12px;margin-bottom:20px}.logo{width:42px;height:42px;border-radius:12px;background:#5e9141;color:#fff;display:grid;place-items:center;flex:none;box-shadow:0 6px 14px -6px rgba(94,145,65,.6)}.brand-name{font-weight:800;font-size:17px;line-height:1.2;color:#1e293b}.brand-sub{font-size:12px;font-weight:600;color:#4d7a34;letter-spacing:.02em}h1{margin:0 0 8px;font-size:22px;line-height:1.3;color:#0f172a}p{margin:0 0 16px;color:#475569;font-size:14px}.note{margin:0 0 18px;padding:10px 12px;border-radius:10px;background:#f4f8f1;border:1px solid #d9e8cf;color:#2f5d1e;font-size:13px;line-height:1.5}label{display:block;font-size:13px;font-weight:600;color:#334155;margin-bottom:14px}input{width:100%;margin-top:6px;padding:11px 13px;border:1px solid #cbd5e1;border-radius:10px;font:inherit;color:#0f172a;background:#f8fafc;transition:border-color .15s,box-shadow .15s,background .15s}input:focus{outline:none;border-color:#5e9141;background:#fff;box-shadow:0 0 0 3px rgba(94,145,65,.18)}button,.btn{display:block;width:100%;padding:12px 16px;margin-top:6px;border:0;border-radius:10px;background:#5e9141;color:#fff;font:600 15px/1.4 inherit;text-align:center;text-decoration:none;cursor:pointer;transition:background .15s}button:hover,.btn:hover{background:#4d7934}.err-badge{display:inline-block;padding:4px 10px;border-radius:999px;background:#fef2f2;color:#b91c1c;font-size:12px;font-weight:700;margin-bottom:10px}</style><main><div class="brand"><div class="logo" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg></div><div><div class="brand-name">Smart English</div><div class="brand-sub">CỔNG BẢO VỆ TRUY CẬP TỪ XA</div></div></div>'+body+'</main></html>');
  }
  async function smallBody(req) { let size=0,chunks=[];for await(const chunk of req){size+=chunk.length;if(size>4096)throw Error('BODY_TOO_LARGE');chunks.push(chunk);}return new URLSearchParams(Buffer.concat(chunks).toString('utf8')); }
  function proxy(req,res,port,pub) {
    const headers=Object.fromEntries(Object.entries(req.headers).filter(([k])=>!hop.has(k)&&!k.startsWith('x-forwarded-')&&k!=='host'));
    headers.host='127.0.0.1:'+port;headers['x-forwarded-proto']=pub?'https':'http';headers['x-forwarded-host']=pub?new URL(C.PUBLIC_ORIGIN).host:'127.0.0.1:3040';
    const ip=String(req.headers['x-forwarded-for']||'').split(',').at(-1).trim();headers['x-forwarded-for']=pub&&isIP(ip)?ip:'127.0.0.1';
    const up=http.request({hostname:'127.0.0.1',port,path:req.url,method:req.method,headers,timeout:45000},incoming=>{
      const responseHeaders=Object.fromEntries(Object.entries(incoming.headers).filter(([k])=>!hop.has(k)));
      if(pub&&responseHeaders['set-cookie'])responseHeaders['set-cookie']=responseHeaders['set-cookie'].map(v=>/;\s*Secure(?:;|$)/i.test(v)?v:v+'; Secure');
      res.writeHead(incoming.statusCode||502,responseHeaders);incoming.pipe(res);
    });
    up.on('timeout',()=>up.destroy());up.on('error',()=>{if(!res.headersSent)res.writeHead(503,{'Content-Type':'application/json'});res.end('{"message":"Dịch vụ đang khởi động hoặc đã dừng. Vui lòng thử lại."}');});
    req.on('aborted',()=>up.destroy());res.on('close',()=>{if(!res.writableEnded)up.destroy();});req.pipe(up);
  }
  const server=http.createServer(async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');res.setHeader('X-Frame-Options','DENY');
    const pub=publicRequest(req),local=localRequest(req);
    if(!pub&&!local){res.writeHead(421);res.end();return;}
    if(!req.url?.startsWith('/')||req.url.startsWith('//')){res.writeHead(400);res.end();return;}
    let pathname;try{pathname=decodeURIComponent(new URL(req.url,C.LOCAL_ORIGIN).pathname);}catch{res.writeHead(400);res.end();return;}
    // Preserve the existing webhook transport and all its authentication/DB gates.
    if(req.url===C.WEBHOOK){proxy(req,res,webhookPort,pub);return;}
    if(pathname==='/__health'&&req.method==='GET'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({service:'smart-english-public-gateway',status:'ready',runId,staticBuild:fs.existsSync(path.join(dist,'index.html'))}));return;}
    if(pathname==='/__local/open'&&local&&req.method==='GET'){
      const ticket=randomBytes(32).toString('base64url');tickets.set(ticket,Date.now()+60000);
      const nonce=randomBytes(18).toString('base64');
      // Chromium sends Origin:null on a cross-site form when the document uses
      // Referrer-Policy:same-origin. This local-only handoff must send its exact
      // origin so the public endpoint can enforce the existing allowlist.
      res.setHeader('Referrer-Policy','origin');
      res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','text/html; charset=utf-8');res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'nonce-"+nonce+"'; form-action "+C.PUBLIC_ORIGIN+"; frame-ancestors 'none'; base-uri 'none'");
      res.end('<!doctype html><html lang="vi"><meta charset="utf-8"><title>Mở Smart English</title><p>Đang mở website Smart English qua HTTPS…</p><form method="post" action="'+C.PUBLIC_ORIGIN+'/__demo/access"><input type="hidden" name="ticket" value="'+ticket+'"></form><script nonce="'+nonce+'">document.forms[0].submit()</script></html>');return;
    }
    if(pathname.startsWith('/__local/')){res.writeHead(404);res.end();return;}
    if(pathname==='/__demo/access'&&pub&&req.method==='POST'){
      if(!allowedOrigin(req)){res.writeHead(403);res.end();return;}
      try{
        const body=await smallBody(req),ticket=body.get('ticket'),until=ticket&&tickets.get(ticket);
        if(ticket){tickets.delete(ticket);if(until&&until>Date.now()){authorize(res);return;}}
        const ip=String(req.headers['x-forwarded-for']||req.socket.remoteAddress).slice(-100),prior=attempts.get(ip);
        const bucket=prior&&prior.until>Date.now()?prior:{count:0,until:Date.now()+15*60000};bucket.count++;attempts.set(ip,bucket);
        if(bucket.count>8){html(res,'<span class="err-badge">Tạm khóa 15 phút</span><h1>Vui lòng thử lại sau</h1><p>Bạn đã nhập sai mã truy cập quá số lần cho phép. Vui lòng chờ một lát rồi thử lại.</p><a class="btn" href="/">Thử lại</a>',429);return;}
        const nextPath=safeNext(body.get('next'));
        if(same(body.get('username')||'',credential.username)&&same(body.get('password')||'',credential.password)){attempts.delete(ip);authorize(res,nextPath);return;}
        html(res,'<span class="err-badge">Sai thông tin cổng</span><h1>Chưa xác nhận quyền truy cập</h1><p>Tên truy cập hoặc mã truy cập cổng chưa đúng. Lưu ý không nhập email học viên/giảng viên ở bước này; hãy lấy đúng mã từ <strong>ACCESS_SMART_ENGLISH.bat</strong>.</p><a class="btn" href="'+escapeHtml(nextPath)+'">Quay lại nhập lại</a>',401);return;
      }catch{res.writeHead(400);res.end();return;}
    }
    if(pub&&!authenticated(req)){
      if(pathname.startsWith('/api/')){res.writeHead(401,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end('{"code":"DEMO_ACCESS_REQUIRED"}');return;}
      const reqUrl=new URL(req.url,C.LOCAL_ORIGIN);
      const nextTarget=safeNext(reqUrl.pathname+reqUrl.search);
      html(res,'<h1>Xác nhận quyền truy cập</h1><p>Đây là lớp bảo vệ tên miền truy cập từ xa. Sau khi qua bước này, bạn sẽ đăng nhập bằng tài khoản học viên hoặc giảng viên của mình.</p><div class="note"><strong>Lưu ý:</strong> Không nhập email cá nhân (Gmail) ở đây. Tên truy cập mặc định là <strong>demo</strong>; mã truy cập lấy từ file <strong>ACCESS_SMART_ENGLISH.bat</strong> (hoặc mở qua <code>http://127.0.0.1:3040/__local/open</code> trên máy chủ).</div><form method="post" action="/__demo/access" autocomplete="off"><input type="hidden" name="next" value="'+escapeHtml(nextTarget)+'"><label>Tên truy cập cổng<input name="username" placeholder="demo" autocomplete="off" autocapitalize="none" spellcheck="false" required></label><label>Mã truy cập riêng<input name="password" type="password" placeholder="Nhập mã truy cập từ ACCESS_SMART_ENGLISH.bat" autocomplete="new-password" required></label><button>Tiếp tục vào Smart English</button></form>');return;
    }
    if(!['GET','HEAD','OPTIONS'].includes(req.method)&&!allowedOrigin(req)){res.writeHead(403);res.end();return;}
    if(pathname.startsWith('/api/')){proxy(req,res,apiPort,pub);return;}
    if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
    if(pathname.includes('\\')||pathname.includes('\0')||pathname.split('/').some(x=>x.startsWith('.'))||/^\/(?:src|node_modules|@vite|@fs|@id)(?:\/|$)/.test(pathname)||/\.(?:map|env|ts|tsx|cjs|ps1|bat)$/i.test(pathname)){res.writeHead(404);res.end();return;}
    const root=path.resolve(dist),file=path.resolve(root,'.'+pathname);
    if(file!==root&&!file.startsWith(root+path.sep)){res.writeHead(404);res.end();return;}
    let target=file;if(!fs.existsSync(target)||!fs.statSync(target).isFile()){if(path.extname(pathname)){res.writeHead(404);res.end();return;}target=path.join(root,'index.html');}
    if(!fs.existsSync(target)){res.writeHead(503);res.end('Frontend chưa được build.');return;}
    const real=fs.realpathSync(target);if(!real.startsWith(fs.realpathSync(root)+path.sep)){res.writeHead(404);res.end();return;}
    const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.ico':'image/x-icon','.woff2':'font/woff2','.json':'application/json'}[path.extname(target)]||'application/octet-stream';
    res.writeHead(200,{'Content-Type':mime,'Content-Length':fs.statSync(target).size,'Cache-Control':target.endsWith('index.html')?'no-store':'public, max-age=3600'});if(req.method==='HEAD')res.end();else fs.createReadStream(target).pipe(res);
  });
  server.requestTimeout=60000;server.headersTimeout=15000;
  const sweep=setInterval(()=>{const now=Date.now();for(const [k,v]of sessions)if(v<=now)sessions.delete(k);for(const[k,v]of tickets)if(v<=now)tickets.delete(k);for(const[k,v]of attempts)if(v.until<=now)attempts.delete(k);},60000);sweep.unref();server.once('close',()=>clearInterval(sweep));
  return server;
}
module.exports={createGateway};
