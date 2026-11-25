import fs from 'node:fs';
import process from 'node:process';
import console from 'node:console';
import { Buffer } from 'node:buffer';
import { setTimeout, clearTimeout } from 'node:timers';
import path from 'node:path';
import crypto from 'node:crypto';
import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath, URL } from 'node:url';
import {
  assessGate,
  processIdentity,
  recordThenAssert,
  checkedNative,
  snapshotArgs,
  allowQaRequest,
  executionOptions,
  withLogHandles,
} from './guard-core.mjs';
import { validateHarness } from './validate.mjs';
import { createInterface } from 'node:readline';
export async function executeReviewedSession(args) {
  const options = executionOptions(args, process.cwd());
  validateHarness(); // Parse/check must succeed before any session mutation.
  const esbuild = await import('esbuild');
  const { compile } = await import('@tailwindcss/node');
  const { Scanner } = await import('@tailwindcss/oxide');

  // S5B ONLY: fixed ports, no application launcher/proxy/provider/DB import.
  const root = process.cwd(),
    base = options.base;
  const source = path.resolve('apps/web/src/features/operations/visual-qa');
  const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  const origin = 'http://127.0.0.1:55831',
    cdpOrigin = 'http://127.0.0.1:55832';
  const expectedChrome = '46461accbdc87dc88a5bdd6d611be095dd6147db009863d794f742ca90662efa';
  const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
  const nonce = crypto.randomBytes(24).toString('hex');
  if (
    root !== 'D:\\KLTN_Project\\smart-english-elearning-kltn' ||
    !base.startsWith(root + path.sep)
  )
    throw Error('QA_ROOT_MISMATCH');
  if (!fs.existsSync(base + '/baseline.json') || fs.existsSync(base + '/session.json'))
    throw Error('QA_FRESH_SESSION_REQUIRED');
  const baseline = JSON.parse(fs.readFileSync(base + '/baseline.json', 'utf8'));
  const requiredPins = [
    'run.mjs',
    'guard-core.mjs',
    'os-snapshot.ps1',
    'validate.mjs',
    'fixtures.ts',
    'entry.tsx',
  ];
  for (const name of requiredPins) {
    const file = path.join(source, name);
    if (!baseline.sourcePins?.[name] || sha(fs.readFileSync(file)) !== baseline.sourcePins[name])
      throw Error('REVIEWED_SOURCE_PIN_REQUIRED');
  }
  if (fs.readdirSync(base).some((n) => n !== 'baseline.json')) throw Error('QA_TARGET_NOT_UNUSED');
  for (let p = base; ; p = path.dirname(p)) {
    if (fs.lstatSync(p).isSymbolicLink()) throw Error('QA_PATH_REPARSE_UNVERIFIED');
    if (p === root) break;
    if (path.dirname(p) === p) throw Error('QA_PATH_OUTSIDE_ROOT');
  }
  fs.writeFileSync(
    base + '/session-claim.json',
    JSON.stringify({ claimedAt: new Date().toISOString(), nodePid: process.pid }),
    { flag: 'wx' },
  );
  if (sha(fs.readFileSync(chrome)) !== expectedChrome || baseline.chrome.sha256 !== expectedChrome)
    throw Error('CHROME_BINARY_CHANGED');
  const profile = base + '/chrome-profile';
  if (fs.existsSync(profile)) throw Error('QA_PROFILE_ALREADY_EXISTS');
  fs.mkdirSync(base + '/static', { recursive: true });
  fs.mkdirSync(base + '/screenshots', { recursive: true });
  fs.mkdirSync(base + '/tmp', { recursive: true });
  const receipt = {
    startedAt: new Date().toISOString(),
    nodePid: process.pid,
    chromePid: null,
    context: 'non-elevated operator via approved tool context',
    ports: { http: 55831, cdp: 55832 },
    transport: 'installed Node WebSocket/CDP; installed runner has no pipe transport',
    network: [],
    browserErrors: [],
    captures: [],
    rounds: [],
    cleanup: null,
    fatal: null,
  };
  const write = (name, data) => fs.writeFileSync(base + '/' + name, JSON.stringify(data, null, 2));
  let server = null,
    browser = null,
    socket = null,
    shuttingDown = false,
    seq = 0;
  const pending = new Map();
  let cases = [];
  let bundlePin = null;
  let loadWaiter = null;
  const sanitize = (u) => {
    try {
      const x = new URL(u);
      return x.origin === origin ? x.href : x.protocol + '//' + x.host + x.pathname;
    } catch {
      return '[invalid URL]';
    }
  };
  let nodeExpected = {
    kind: 'node',
    pid: process.pid,
    parentPid: process.ppid,
    executable: process.execPath,
    argv: [process.execPath, ...process.argv.slice(1)],
    cwd: root,
    createdAt: new Date(Date.now() - process.uptime() * 1000).toISOString(),
    toleranceMs: 2000,
  };
  let chromeExpected = null;
  function osSnapshot() {
    const file = path.join(source, 'os-snapshot.ps1'),
      startedAt = new Date().toISOString();
    const nativeArgs = snapshotArgs(file, process.pid, browser?.pid ?? 0, profile);
    try {
      const powershell = path.join(
        process.env.SystemRoot,
        'System32',
        'WindowsPowerShell',
        'v1.0',
        'powershell.exe',
      );
      const r = checkedNative(spawnSync, powershell, nativeArgs, {
        encoding: 'utf8',
        windowsHide: true,
        maxBuffer: 4 * 1024 * 1024,
        timeout: 15000,
      });
      const snapshot = JSON.parse(r.stdout);
      return {
        snapshot,
        collector: {
          kind: 'collector',
          pid: r.pid,
          parentPid: process.pid,
          executable: path.join(
            process.env.SystemRoot,
            'System32',
            'WindowsPowerShell',
            'v1.0',
            'powershell.exe',
          ),
          argv: [
            path.join(
              process.env.SystemRoot,
              'System32',
              'WindowsPowerShell',
              'v1.0',
              'powershell.exe',
            ),
            ...nativeArgs,
          ],
          cwd: root,
          createdAt: startedAt,
          toleranceMs: 2000,
        },
      };
    } catch (e) {
      return {
        snapshot: {
          SchemaVersion: 2,
          CollectorErrors: ['COLLECTOR_NATIVE_OR_JSON_FAILED'],
          failure: e.receipt ?? { reason: e.message },
        },
        collector: null,
      };
    }
  }
  function attest(name, phase) {
    const collected = osSnapshot();
    const evidence = {
      at: new Date().toISOString(),
      phase,
      expected: { node: nodeExpected, chrome: chromeExpected, collector: collected.collector },
      server: {
        pid: process.pid,
        listening: server?.listening === true,
        address: server?.address() ?? null,
      },
      snapshot: collected.snapshot,
    };
    // Raw OS, bind tuple, generation and collector failure saved before the gate.
    return recordThenAssert(
      evidence,
      (value) => write(name, value),
      (value) => {
        const verdict = assessGate(value.snapshot, {
          phase,
          node: nodeExpected,
          chrome: chromeExpected,
          collector: collected.collector,
          server: value.server,
        });
        write(name.replace('.json', '-verdict.json'), verdict);
        if (verdict.ok) {
          const pin = value.snapshot.Processes.find((p) => p.PID === process.pid);
          nodeExpected = { ...nodeExpected, createdAt: pin.CreatedAt, toleranceMs: 0 };
          if (chromeExpected) {
            const p = value.snapshot.Processes.find((p) => p.PID === chromeExpected.pid);
            chromeExpected = { ...chromeExpected, createdAt: p.CreatedAt, toleranceMs: 0 };
          }
        }
        return verdict;
      },
    );
  }
  async function build(round) {
    const fixtureText = fs.readFileSync(source + '/fixtures.ts', 'utf8');
    const transformed = await esbuild.transform(fixtureText, { loader: 'ts', format: 'esm' });
    const fixture = await import(
      'data:text/javascript;base64,' + Buffer.from(transformed.code).toString('base64')
    );
    cases = fixture.scenarios;
    const result = await esbuild.build({
      absWorkingDir: root,
      entryPoints: [source + '/entry.tsx'],
      outfile: base + '/static/qa.js',
      bundle: true,
      platform: 'browser',
      format: 'iife',
      target: 'chrome120',
      tsconfig: 'apps/web/tsconfig.app.json',
      jsx: 'automatic',
      define: { __W10_QA_ONLY__: 'true', 'process.env.NODE_ENV': '"production"' },
      metafile: true,
      logLevel: 'silent',
    });
    for (const name of Object.keys(result.metafile.inputs))
      if (
        /generated[\\/]prisma|modules[\\/](?!operations).*service|node_modules[\\/](pg|@nestjs|@prisma)[\\/]/.test(
          name,
        )
      )
        throw Error('FORBIDDEN_QA_BUNDLE_IMPORT');
    const compiler = await compile(fs.readFileSync('apps/web/src/index.css', 'utf8'), {
      base: path.resolve('apps/web/src'),
      from: path.resolve('apps/web/src/index.css'),
      onDependency: () => {},
    });
    const scanner = new Scanner({
      sources: [{ base: path.resolve('apps/web/src'), pattern: '**/*.{ts,tsx}', negated: false }],
    });
    fs.writeFileSync(
      base + '/static/qa.css',
      compiler.build(scanner.scan()) +
        '\n/* QA watermark offset only; actual shared layout/styles unchanged. */\n#qa-root header.sticky{top:36px}',
    );
    const inputs = Object.keys(result.metafile.inputs)
      .sort()
      .map((p) => ({ path: p, sha256: sha(fs.readFileSync(p)) }));
    bundlePin = {
      round,
      fixtureSha256: sha(fixtureText),
      bundleSha256: sha(fs.readFileSync(base + '/static/qa.js')),
      cssSha256: sha(fs.readFileSync(base + '/static/qa.css')),
      componentSha256: sha(fs.readFileSync('apps/web/src/features/operations/OperationsPage.tsx')),
      inputDigest: sha(JSON.stringify(inputs)),
    };
    write('build-' + round + '.json', { ...bundlePin, inputs, esbuild: esbuild.version });
    write('fixtures-' + round + '.json', {
      watermark: fixture.watermark,
      date: fixture.fixtureDate,
      scenarios: cases,
      zeroSemantics: 'Declared zero remains UNVERIFIED/null through actual W10 projection',
    });
    esbuild.stop();
    return bundlePin;
  }
  function command(method, params = {}) {
    const id = ++seq;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(Error('CDP_TIMEOUT_' + method));
      }, 10000);
      pending.set(id, {
        resolve: (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async function evaluate(expression) {
    const r = await command('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (r.exceptionDetails)
      throw Error('BROWSER_EVALUATION_FAILED ' + (r.exceptionDetails.text ?? ''));
    return r.result.value;
  }
  async function waitFor(expression) {
    return evaluate(
      `new Promise((resolve,reject)=>{const done=()=>{if(${expression}){observer.disconnect();clearTimeout(timer);resolve(true)}};const observer=new MutationObserver(done);observer.observe(document,{subtree:true,childList:true,attributes:true});const timer=setTimeout(()=>{observer.disconnect();reject(Error('QA_DOM_NOT_READY'))},4000);done();})`,
    );
  }
  function safeQaUrl(u) {
    return allowQaRequest(u);
  }
  const browserAudit = `(()=>{
 const visible=e=>e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0&&getComputedStyle(e).visibility!=='hidden';
 const main=document.querySelector('main');const rows=[...(main?.querySelectorAll('input,select,textarea,button,a')??[])].filter(visible);
 const unnamed=rows.filter(e=>!e.disabled&&!((e.getAttribute('aria-label')||e.getAttribute('aria-labelledby')||e.textContent||e.labels?.[0]?.textContent||e.title||'').trim())).map(e=>e.tagName+':'+e.type);
 const overflow=[...document.querySelectorAll('body *')].filter(e=>{const r=e.getBoundingClientRect();if(r.right<=innerWidth+1&&r.left>=-1)return false;for(let p=e.parentElement;p;p=p.parentElement){if(['auto','scroll','hidden'].includes(getComputedStyle(p).overflowX))return false;}return visible(e)}).slice(0,16).map(e=>({tag:e.tagName,className:String(e.className).slice(0,100),text:e.textContent?.slice(0,100),right:Math.round(e.getBoundingClientRect().right)}));
 const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const ctx=canvas.getContext('2d',{willReadFrequently:true});
 const rgba=color=>{ctx.clearRect(0,0,1,1);ctx.fillStyle=color;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data]};
 const lum=a=>a.slice(0,3).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
 const low=[];for(const e of main?.querySelectorAll('p,label,h1,h2,h3,th,td,button,a')??[]){if(!visible(e)||e.disabled||!e.textContent.trim()||!e.firstChild||e.children.length>0)continue;const cs=getComputedStyle(e);if(Number(cs.opacity)<1||Number(getComputedStyle(e.parentElement).opacity)<1)continue;const fg=rgba(cs.color);let p=e,bg;while(p){bg=rgba(getComputedStyle(p).backgroundColor);if(bg[3]===255)break;p=p.parentElement;}if(!p)bg=[248,250,252,255];if(fg[3]!==255)continue;const l1=lum(fg),l2=lum(bg),ratio=(Math.max(l1,l2)+.05)/(Math.min(l1,l2)+.05);const large=parseFloat(cs.fontSize)>=24||(parseFloat(cs.fontSize)>=18.66&&parseInt(cs.fontWeight)>=700);if(ratio<(large?3:4.5))low.push({text:e.textContent.slice(0,90),ratio:Math.round(ratio*100)/100,color:cs.color,background:getComputedStyle(p??document.body).backgroundColor,fontSize:cs.fontSize});}
 return {actualComponent:!!document.querySelector('main'),watermark:document.querySelector('[data-qa-watermark]')?.textContent,scenario:document.documentElement.dataset.qaMounted,viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},documentWidth:document.documentElement.scrollWidth,pageOverflow:document.documentElement.scrollWidth>innerWidth+1,overflow,unnamedControls:unnamed,contrastSampleFailures:low.slice(0,20),tableRows:main?.querySelectorAll('tbody tr').length??0,disabledActions:[...main?.querySelectorAll('button:disabled')??[]].map(e=>e.textContent.trim()),redactionTripwireVisible:document.body.innerText.includes('SYNTHETIC_REDACTION_TRIPWIRE'),focus:{tag:document.activeElement.tagName,text:document.activeElement.textContent?.slice(0,80)},text:main?.innerText.slice(0,1200)};
})()`;
  async function screenshot(round, scenario, viewport, suffix = '') {
    const metrics = await command('Page.getLayoutMetrics');
    const height = Math.min(
      6500,
      Math.max(viewport.height, Math.ceil(metrics.cssContentSize.height)),
    );
    const file =
      'screenshots/' +
      round +
      '/' +
      scenario.id +
      '-' +
      viewport.width +
      (suffix ? '-' + suffix : '') +
      '.png';
    fs.mkdirSync(path.dirname(base + '/' + file), { recursive: true });
    const image = await command('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
      clip: { x: 0, y: 0, width: viewport.width, height, scale: 1 },
    });
    fs.writeFileSync(base + '/' + file, Buffer.from(image.data, 'base64'));
    const audit = await evaluate(browserAudit);
    const record = {
      round,
      scenario: scenario.id,
      role: scenario.role,
      section: scenario.section,
      state: scenario.state,
      url: origin + '/?scenario=' + scenario.id,
      viewport,
      captureHeight: height,
      fullPageTruncated: metrics.cssContentSize.height > 6500,
      file,
      sha256: sha(fs.readFileSync(base + '/' + file)),
      provenance: bundlePin,
      audit,
    };
    receipt.captures.push(record);
    write('qa-results.json', receipt.captures);
    return record;
  }
  async function captureRound(round) {
    const viewports = [
      { width: 1440, height: 900 },
      { width: 390, height: 844 },
      { width: 768, height: 1024 },
    ];
    for (const s of cases) {
      for (const v of viewports) {
        if (v.width === 768 && s.state !== 'normal') continue;
        await command('Emulation.setDeviceMetricsOverride', {
          ...v,
          deviceScaleFactor: 1,
          mobile: v.width < 600,
        });
        const loaded = new Promise((resolve) => {
          loadWaiter = resolve;
        });
        await command('Page.navigate', { url: origin + '/?scenario=' + s.id });
        await Promise.race([
          loaded,
          new Promise((_, reject) => setTimeout(() => reject(Error('QA_PAGE_LOAD_TIMEOUT')), 6000)),
        ]);
        loadWaiter = null;
        await waitFor(
          `document.documentElement.dataset.qaMounted===${JSON.stringify(s.id)}&&document.querySelector('h1')`,
        );
        if (s.state !== 'loading')
          await waitFor(`!document.querySelector('[aria-label="Đang tải dữ liệu W10"]')`);
        await evaluate(
          `document.fonts.ready.then(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))))`,
        );
        const baseRecord = await screenshot(round, s, v);
        if (
          baseRecord.audit.watermark !== 'SYNTHETIC DATA — VISUAL QA ONLY' ||
          !baseRecord.audit.actualComponent ||
          baseRecord.audit.redactionTripwireVisible
        )
          throw Error('QA_COMPONENT_OR_PRIVACY_ASSERTION_FAILED');
        if (s.id === 'cms-tv') {
          await evaluate(
            `(()=>{const set=(el,value)=>{const setter=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el),'value').set;setter.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));};set(document.querySelector('input[maxlength="200"]'),'Bản soạn synthetic — chưa lưu');set(document.querySelector('textarea[maxlength="20000"]'),'# Xem trước synthetic\\nNội dung minh họa kiểm tra giao diện, không công bố.');[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Xem trước bản soạn')).click();})()`,
          );
          await waitFor(`document.querySelector('[aria-label="Xem trước bản soạn"]')`);
          await screenshot(round, s, v, 'preview');
        }
        if (s.id === 'cms-hvu') {
          await evaluate(
            `[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Chương trình TOEIC synthetic')).click()`,
          );
          await waitFor(`document.getElementById('w10-cms-version-detail')`);
          await screenshot(round, s, v, 'revision');
        }
        if (s.id === 'audit-qt') {
          await evaluate(
            `(()=>{const el=[...document.querySelectorAll('select')].find(s=>s.closest('label').textContent.includes('Loại sự kiện'));el.value='GRANT_REVOKED';el.dispatchEvent(new Event('change',{bubbles:true}));})()`,
          );
          await screenshot(round, s, v, 'filtered');
        }
        if (s.id === 'report-student') {
          await evaluate(
            `(()=>{const el=[...document.querySelectorAll('select')].find(s=>s.closest('label').textContent.includes('Trạng thái bằng chứng'));el.value='PENDING';el.dispatchEvent(new Event('change',{bubbles:true}));})()`,
          );
          await screenshot(round, s, v, 'pending-filter');
          await evaluate(
            `document.querySelector('[aria-label="Bảng báo cáo có thể cuộn ngang"]')?.focus()`,
          );
          await command('Input.dispatchKeyEvent', {
            type: 'keyDown',
            key: 'Tab',
            code: 'Tab',
            windowsVirtualKeyCode: 9,
          });
          await command('Input.dispatchKeyEvent', {
            type: 'keyUp',
            key: 'Tab',
            code: 'Tab',
            windowsVirtualKeyCode: 9,
          });
          receipt.rounds.push({
            round,
            scenario: s.id,
            viewport: v,
            keyboard: await evaluate(
              `(()=>{const e=document.activeElement,c=getComputedStyle(e),r=e.getBoundingClientRect();return{tag:e.tagName,text:e.textContent?.slice(0,100),outline:c.outlineStyle,outlineWidth:c.outlineWidth,visible:r.width>0&&r.height>0}})()`,
            ),
          });
        }
        console.log('CAPTURE ' + round + ' ' + s.id + ' ' + v.width);
      }
    }
    attest('ports-' + round + '.json', 'active');
    write('session.json', receipt);
    console.log('ROUND_COMPLETE ' + round + ' ' + receipt.captures.length);
  }
  async function cleanup() {
    if (shuttingDown) return;
    shuttingDown = true;
    try {
      if (socket?.readyState === globalThis.WebSocket.OPEN) await command('Browser.close').catch(() => {});
    } catch {
      /* verified process/port teardown below still records failure */
    }
    socket?.close();
    if (browser && browser.exitCode === null) {
      await Promise.race([
        new Promise((r) => browser.once('exit', r)),
        new Promise((r) => setTimeout(r, 3500)),
      ]);
    }
    if (browser && browser.exitCode === null) {
      const collected = osSnapshot();
      write('cleanup-process-check.json', collected);
      const p = collected.snapshot.Processes?.find((p) => p.PID === browser.pid);
      if (chromeExpected && processIdentity(p, chromeExpected, collected.snapshot.At).ok)
        browser.kill();
      else receipt.fatal ??= 'CLEANUP_BROWSER_GENERATION_UNKNOWN_NO_KILL';
    }
    if (server) {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(() => resolve()));
    }
    try {
      // If an actual Chrome process remains, teardown must not be labelled closed.
      const collected = osSnapshot();
      const remaining = collected.snapshot.Processes?.some(
        (p) => p.PID === browser?.pid || p.ParentPID === browser?.pid,
      );
      if (!remaining && browser?.exitCode !== null) chromeExpected = null;
      const evidence = {
        phase: 'teardown',
        snapshot: collected.snapshot,
        collector: collected.collector,
        expected: { node: nodeExpected, chrome: chromeExpected },
      };
      write('ports-after.json', evidence);
      const verdict = assessGate(collected.snapshot, {
        phase: 'teardown',
        node: nodeExpected,
        chrome: chromeExpected,
        collector: collected.collector,
      });
      receipt.cleanup = { at: new Date().toISOString(), portsClosed: verdict.ok, verdict };
    } catch (e) {
      receipt.cleanup = { error: String(e), portsClosed: false };
    }
    write('network.json', receipt.network);
    write('session.json', receipt);
    console.log(
      'QA_CLEANUP ' +
        JSON.stringify({ portsClosed: receipt.cleanup?.portsClosed, fatal: receipt.fatal }),
    );
  }
  const deadline = setTimeout(
    () => {
      receipt.fatal = 'QA_SESSION_DEADLINE';
      void cleanup().then(() => process.exit(1));
    },
    20 * 60 * 1000,
  );
  try {
    attest('ports-before.json', 'preflight');
    await build('before');
    server = http.createServer((req, res) => {
      const raw = req.url ?? '',
        url = new URL(raw, origin);
      const allowed = allowQaRequest(url.href, req.method, req.headers.host);
      receipt.network.push({
        time: new Date().toISOString(),
        layer: 'qa-server',
        method: req.method,
        url: sanitize(url.href),
        allowed,
      });
      if (!allowed) {
        res.writeHead(403);
        res.end('QA_DENIED');
        return;
      }
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader(
        'Content-Security-Policy',
        `default-src 'none'; script-src 'self'; style-src 'self' 'nonce-${nonce}'; style-src-attr 'unsafe-inline'; img-src 'self' data:; connect-src ${origin}; font-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'`,
      );
      if (url.pathname === '/') {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(
          `<!doctype html><html lang="vi" data-w10-qa="S5B"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>W10 SYNTHETIC VISUAL QA</title><link rel="stylesheet" href="/qa.css"></head><body><div id="qa-root"></div><script src="/qa.js"></script></body></html>`,
        );
      } else if (url.pathname === '/favicon.ico') {
        res.writeHead(204);
        res.end();
      } else {
        res.setHeader(
          'Content-Type',
          url.pathname.endsWith('.js')
            ? 'text/javascript; charset=utf-8'
            : 'text/css; charset=utf-8',
        );
        res.end(fs.readFileSync(base + '/static' + url.pathname));
      }
    });
    server.on('connect', (req, s) => {
      receipt.network.push({
        time: new Date().toISOString(),
        layer: 'deny-proxy-connect',
        url: req.url,
        allowed: false,
      });
      s.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
    });
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen({ host: '127.0.0.1', port: 55831, exclusive: true }, resolve);
    });
    attest('ports-http.json', 'http');
    fs.mkdirSync(profile);

    const args = [
      '--headless=new',
      '--remote-debugging-address=127.0.0.1',
      '--remote-debugging-port=55832',
      '--remote-allow-origins=' + origin,
      '--user-data-dir=' + profile,
      '--proxy-server=' + origin,
      '--proxy-bypass-list=<-loopback>',
      '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1',
      '--disable-background-networking',
      '--disable-component-update',
      '--disable-sync',
      '--disable-quic',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--metrics-recording-only',
      '--disable-features=MediaRouter,OptimizationHints,AutofillServerCommunication,DnsOverHttps',
      '--window-size=1440,900',
      'about:blank',
    ];
    receipt.chromeCommand = { executable: chrome, args };
    const chromeStartedAt = new Date().toISOString();
    withLogHandles(
      (name) => fs.openSync(base + '/chrome.' + name + '.log', 'w'),
      (h) => fs.closeSync(h),
      ([stdout, stderr]) => {
        browser = spawn(chrome, args, {
          windowsHide: true,
          env: {
            SystemRoot: process.env.SystemRoot,
            WINDIR: process.env.WINDIR,
            PATH: process.env.PATH,
            TEMP: base + '/tmp',
            TMP: base + '/tmp',
          },
          stdio: ['ignore', stdout, stderr],
        });
        chromeExpected = {
          kind: 'chrome',
          pid: browser.pid,
          parentPid: process.pid,
          executable: chrome,
          argv: [chrome, ...args],
          cwd: root,
          createdAt: chromeStartedAt,
          toleranceMs: 2000,
        };
        return browser;
      },
    );
    receipt.chromePid = browser.pid;
    browser.on('error', (e) => {
      receipt.fatal = 'CHROME_SPAWN_FAILED ' + e.code;
    });
    // Fixed finite readiness window, no startup retries or alternate port.
    await new Promise((r) => setTimeout(r, 6000));
    if (!browser.pid || browser.exitCode !== null) throw Error('CHROME_START_FAILED');
    attest('ports-started.json', 'chrome');
    const targets = await globalThis.fetch(cdpOrigin + '/json/list').then((r) => r.json());
    const target = targets.find((t) => t.type === 'page' && t.url === 'about:blank');
    if (!target) throw Error('OWNED_BLANK_TARGET_MISSING');
    const ws = new URL(target.webSocketDebuggerUrl);
    if (ws.hostname !== '127.0.0.1' || ws.port !== '55832' || ws.protocol !== 'ws:')
      throw Error('CDP_TARGET_MISMATCH');
    socket = new globalThis.WebSocket(ws);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('CDP_CONNECT_TIMEOUT')), 5000);
      socket.addEventListener(
        'open',
        () => {
          clearTimeout(timer);
          resolve();
        },
        { once: true },
      );
      socket.addEventListener(
        'error',
        (e) => {
          clearTimeout(timer);
          reject(e);
        },
        { once: true },
      );
    });
    socket.addEventListener('close', () => {
      for (const p of pending.values()) p.reject(Error('CDP_CLOSED'));
      pending.clear();
    });
    socket.addEventListener('message', (event) => {
      const m = JSON.parse(event.data);
      if (m.id) {
        const p = pending.get(m.id);
        pending.delete(m.id);
        if (p) {
          if (m.error) p.reject(Error(m.error.message));
          else p.resolve(m.result);
        }
      }
      if (m.method === 'Fetch.requestPaused') {
        const allowed = safeQaUrl(m.params.request.url) && m.params.request.method === 'GET';
        receipt.network.push({
          time: new Date().toISOString(),
          layer: 'CDP_FETCH',
          url: sanitize(m.params.request.url),
          allowed,
        });
        void command(allowed ? 'Fetch.continueRequest' : 'Fetch.failRequest', {
          requestId: m.params.requestId,
          ...(allowed ? {} : { errorReason: 'AccessDenied' }),
        }).catch((e) => receipt.browserErrors.push(String(e)));
      }
      if (m.method === 'Runtime.exceptionThrown')
        receipt.browserErrors.push(m.params.exceptionDetails.text);
      if (m.method === 'Page.loadEventFired') loadWaiter?.();
    });
    await command('Page.enable');
    await command('Runtime.enable');
    await command('Network.enable');
    await command('Network.setCacheDisabled', { cacheDisabled: true });
    await command('Network.setBypassServiceWorker', { bypass: true });
    await command('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] });
    await command('Browser.setDownloadBehavior', { behavior: 'deny' });
    receipt.browserVersion = await command('Browser.getVersion');
    write('session.json', receipt);
    await captureRound('before');
    console.log('READY_FOR_ONE_POLISH_COMMAND: polish or finish');
    const input = createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false,
    });
    const line = await new Promise((resolve) => input.once('line', resolve));
    input.close();
    if (String(line).trim() === 'polish') {
      await build('final');
      await captureRound('final');
    } else if (String(line).trim() !== 'finish') throw Error('QA_CONTROL_COMMAND_INVALID');
  } catch (e) {
    receipt.fatal = String(e);
    console.error('QA_FATAL ' + String(e));
    process.exitCode = 1;
  } finally {
    clearTimeout(deadline);
    await cleanup();
    if (!receipt.cleanup?.portsClosed) process.exitCode = 1;
  }
} // executeReviewedSession: never invoked by import or the old bare command.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length < 4) {
    console.error('NEW_PO_EXECUTION_AUTHORITY_REQUIRED');
    process.exitCode = 2;
  } else {
    try {
      await executeReviewedSession(process.argv.slice(2));
    } catch (e) {
      console.error(e.receipt ?? e.message);
      process.exitCode = 1;
    }
  }
}
