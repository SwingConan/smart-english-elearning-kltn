import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import {
  createServer,
  request as httpRequest,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wav': 'audio/wav',
};

export interface Wave03BrowserCaptureContext {
  apiPort: number;
  password: string;
  actors: {
    learnerEmail: string;
    counselorEmail: string;
    hvuMakerEmail: string;
    hvuCheckerEmail: string;
    cashierEmail: string;
    adminEmail: string;
  };
  ids: {
    courseId: string;
    classOfferingId: string;
    supportTicketId: string;
    admissionApplicationId: string;
  };
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function startStaticAndApiProxyServer(apiPort: number, distDir: string) {
  const indexHtml = await readFile(join(distDir, 'index.html'));
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    try {
      const urlObj = new URL(req.url ?? '/', 'http://127.0.0.1');
      if (urlObj.pathname.startsWith('/api/') || urlObj.pathname === '/api') {
        const proxyReq = httpRequest(
          {
            hostname: '127.0.0.1',
            port: apiPort,
            path: urlObj.pathname + urlObj.search,
            method: req.method,
            headers: {
              ...req.headers,
              host: `127.0.0.1:${apiPort}`,
            },
          },
          (proxyRes) => {
            res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
            proxyRes.pipe(res);
          },
        );
        proxyReq.on('error', (err) => {
          if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'text/plain' });
          res.end(String(err));
        });
        req.pipe(proxyReq);
        return;
      }

      const safeRel = urlObj.pathname.replace(/^\/+/, '');
      if (safeRel && !safeRel.includes('..')) {
        const candidate = join(distDir, safeRel);
        try {
          const st = await stat(candidate);
          if (st.isFile()) {
            const ext = extname(candidate).toLowerCase();
            res.writeHead(200, {
              'Content-Type': MIME_TYPES[ext] ?? 'application/octet-stream',
              'Cache-Control': 'no-cache',
            });
            res.end(await readFile(candidate));
            return;
          }
        } catch {
          // Fall through to SPA index.html
        }
      }

      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache',
      });
      res.end(indexHtml);
    } catch (err) {
      if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end(String(err));
    }
  });

  await new Promise<void>((resolveListen) => server.listen(0, '127.0.0.1', () => resolveListen()));
  const port = (server.address() as AddressInfo).port;
  return {
    origin: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolveClose) => server.close(() => resolveClose())),
  };
}

function findBrowserExecutable(): string {
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  throw new Error('No local Chrome or Edge executable found for CDP browser verification');
}

export async function runArgonWave03BrowserVerification(ctx: Wave03BrowserCaptureContext) {
  const distDir = resolve(__dirname, '../../web/dist');
  const outDir = resolve(__dirname, '../../../docs/v2/v2-road-to-99-argon-wave03/EVIDENCE');
  const screenshotsDir = join(outDir, 'screenshots');
  await mkdir(screenshotsDir, { recursive: true });

  const webServer = await startStaticAndApiProxyServer(ctx.apiPort, distDir);
  const userDataDir = await mkdtemp(join(tmpdir(), 'argon-wave03-cdp-'));
  const cdpPort = 9440 + Math.floor(Math.random() * 400);
  const chromeBin = findBrowserExecutable();

  let proc: ChildProcess | undefined;
  let socket: WebSocket | undefined;

  try {
    proc = spawn(
      chromeBin,
      [
        '--headless=new',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-background-networking',
        '--disable-sync',
        `--remote-debugging-port=${cdpPort}`,
        `--user-data-dir=${userDataDir}`,
        `${webServer.origin}/login`,
      ],
      { stdio: 'ignore' },
    );

    let wsUrl = '';
    for (let i = 0; i < 40; i++) {
      try {
        const list = (await fetch(`http://127.0.0.1:${cdpPort}/json/list`).then((r) =>
          r.json(),
        )) as Array<{ type: string; url: string; webSocketDebuggerUrl?: string }>;
        const pageTarget = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
        if (pageTarget?.webSocketDebuggerUrl) {
          wsUrl = pageTarget.webSocketDebuggerUrl;
          break;
        }
      } catch {
        // wait for CDP port
      }
      await delay(250);
    }
    if (!wsUrl) throw new Error('Timed out waiting for headless Chrome CDP target');

    socket = new WebSocket(wsUrl);
    await new Promise<void>((res, rej) => {
      socket!.addEventListener('open', () => res(), { once: true });
      socket!.addEventListener('error', (e) => rej(e), { once: true });
    });

    let nextId = 0;
    const pending = new Map<
      number,
      { resolve: (v: any) => void; reject: (e: Error) => void }
    >();
    const networkStatuses: Array<{ url: string; status: number }> = [];

    socket.addEventListener('message', (event) => {
      const msg = JSON.parse(String(event.data));
      if (msg.method === 'Network.responseReceived') {
        const resp = msg.params?.response;
        if (resp?.url?.includes('/api/')) {
          networkStatuses.push({ url: resp.url, status: resp.status });
        }
      }
      if (!msg.id) return;
      const entry = pending.get(msg.id);
      if (!entry) return;
      pending.delete(msg.id);
      if (msg.error) entry.reject(new Error(msg.error.message));
      else entry.resolve(msg.result);
    });

    const cdp = (method: string, params: Record<string, unknown> = {}) => {
      const id = ++nextId;
      socket!.send(JSON.stringify({ id, method, params }));
      return new Promise<any>((resolveCmd, rejectCmd) =>
        pending.set(id, { resolve: resolveCmd, reject: rejectCmd }),
      );
    };

    const evaluate = async <T = any>(expression: string): Promise<T> => {
      const res = await cdp('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true,
      });
      if (res.exceptionDetails) {
        throw new Error(
          res.exceptionDetails.exception?.description ?? res.exceptionDetails.text ?? 'Eval error',
        );
      }
      return res.result.value as T;
    };

    await cdp('Page.enable');
    await cdp('Runtime.enable');
    await cdp('Network.enable');

    await cdp('Page.navigate', { url: `${webServer.origin}/login` });
    await delay(400);

    const browserLogout = async () => {
      await evaluate(`(async () => {
        await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
        return true;
      })()`);
    };

    const browserLogin = async (email: string) => {
      await cdp('Page.navigate', { url: `${webServer.origin}/login` });
      await delay(250);
      await evaluate(`(async () => {
        await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
        const r = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ email: ${JSON.stringify(email)}, password: ${JSON.stringify(ctx.password)} })
        });
        if (!r.ok) throw new Error('Browser login failed for ' + ${JSON.stringify(email)} + ': ' + r.status);
        const me = await fetch('/api/auth/me', { credentials: 'include' });
        if (!me.ok) throw new Error('Browser session check failed for ' + ${JSON.stringify(email)} + ': ' + me.status);
        return r.status;
      })()`);
    };

    const captures: Array<Record<string, unknown>> = [];

    const captureView = async (opts: {
      slug: string;
      pillar: string;
      uc: string;
      actorLabel: string;
      path: string;
      expectedMarkers: string[];
      width: number;
      height: number;
      afterNavigateJs?: string;
    }) => {
      await cdp('Emulation.setDeviceMetricsOverride', {
        width: opts.width,
        height: opts.height,
        deviceScaleFactor: 1,
        mobile: opts.width < 600,
      });
      await cdp('Page.navigate', { url: `${webServer.origin}${opts.path}` });

      if (opts.afterNavigateJs) {
        for (let attempt = 0; attempt < 25; attempt++) {
          await delay(250);
          const didRun = await evaluate<boolean>(opts.afterNavigateJs).catch(() => false);
          if (didRun) break;
        }
      }

      let state: {
        text: string;
        path: string;
        scrollWidth: number;
        clientWidth: number;
        overflow: boolean;
      } | null = null;

      for (let attempt = 0; attempt < 35; attempt++) {
        await delay(250);
        state = await evaluate(`(() => {
          const text = document.body?.innerText ?? '';
          const scrollWidth = document.documentElement.scrollWidth;
          const clientWidth = document.documentElement.clientWidth;
          return {
            text,
            path: location.pathname,
            scrollWidth,
            clientWidth,
            overflow: scrollWidth > clientWidth + 2,
          };
        })()`);
        if (state && opts.expectedMarkers.every((m) => state!.text.includes(m))) {
          break;
        }
      }

      if (!state || !opts.expectedMarkers.every((m) => state!.text.includes(m))) {
        throw new Error(
          `Browser verification failed at ${opts.path} (${opts.slug}). Missing markers: ${opts.expectedMarkers.join(' | ')}. Rendered tail: ${(state?.text ?? '').slice(-1000)}`,
        );
      }
      if (state.overflow) {
        throw new Error(
          `Horizontal overflow detected on ${opts.path} (${opts.slug}) at ${opts.width}x${opts.height}: scrollWidth=${state.scrollWidth} > clientWidth=${state.clientWidth}`,
        );
      }

      const shot = await cdp('Page.captureScreenshot', { format: 'png' });
      const fileName = `${opts.slug}.png`;
      await writeFile(join(screenshotsDir, fileName), Buffer.from(shot.data, 'base64'));

      captures.push({
        slug: opts.slug,
        fileName,
        pillar: opts.pillar,
        uc: opts.uc,
        actor: opts.actorLabel,
        route: opts.path,
        viewport: `${opts.width}x${opts.height}`,
        overflow: state.overflow,
        scrollWidth: state.scrollWidth,
        clientWidth: state.clientWidth,
        verifiedMarkers: opts.expectedMarkers,
      });
    };

    // Group A — Guest Registration (Desktop + Mobile), Recovery, Catalog, Profile
    await browserLogout();
    await captureView({
      slug: '01-register-consent-desktop',
      pillar: 'Group A',
      uc: 'UCV2-01',
      actorLabel: 'Khách (K)',
      path: '/register',
      expectedMarkers: ['Đăng ký', 'Họ và tên', 'Tôi đồng ý với điều khoản sử dụng'],
      width: 1440,
      height: 900,
    });
    await captureView({
      slug: '02-register-mobile',
      pillar: 'Group A',
      uc: 'UCV2-01',
      actorLabel: 'Khách (K · Mobile)',
      path: '/register',
      expectedMarkers: ['Đăng ký', 'Họ và tên', 'Tôi đồng ý với điều khoản sử dụng'],
      width: 390,
      height: 844,
    });
    await captureView({
      slug: '03-forgot-password-recovery',
      pillar: 'Group A',
      uc: 'UCV2-03',
      actorLabel: 'Khách (K)',
      path: '/forgot-password',
      expectedMarkers: ['Quên mật khẩu', 'Gửi hướng dẫn'],
      width: 1440,
      height: 900,
    });
    await captureView({
      slug: '04-public-catalog-desktop',
      pillar: 'Group A',
      uc: 'UCV2-05',
      actorLabel: 'Khách (K)',
      path: '/catalog',
      expectedMarkers: ['Chọn chương trình phù hợp', 'TOEIC'],
      width: 1440,
      height: 900,
    });

    await browserLogin(ctx.actors.learnerEmail);
    await captureView({
      slug: '05-profile-preferences-edit',
      pillar: 'Group A',
      uc: 'UCV2-02, UCV2-04',
      actorLabel: 'Học viên (HV)',
      path: '/profile',
      expectedMarkers: [
        'Hồ sơ và phiên truy cập',
        'Cập nhật thông tin và thiết lập cá nhân',
        'Múi giờ hiển thị',
      ],
      width: 1440,
      height: 900,
      afterNavigateJs: `(() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Chỉnh sửa hồ sơ cá nhân'));
        if (btn) { btn.click(); return true; }
        return false;
      })()`,
    });

    // Group B — Support Intake & TV Triage/Application
    await captureView({
      slug: '06-support-public-intake',
      pillar: 'Group B',
      uc: 'UCV2-09',
      actorLabel: 'Học viên (HV)',
      path: '/support',
      expectedMarkers: ['Tư vấn / Chăm sóc khách hàng'],
      width: 1440,
      height: 900,
    });

    await browserLogin(ctx.actors.counselorEmail);
    await captureView({
      slug: '07-tv-support-workspace',
      pillar: 'Group B',
      uc: 'UCV2-10, UCV2-11',
      actorLabel: 'Tư vấn viên (TV)',
      path: `/workspace/support/tickets/${ctx.ids.supportTicketId}`,
      expectedMarkers: ['Phiếu SE-'],
      width: 1440,
      height: 900,
    });

    // Group B & C — Learner Admissions & Obligation Detail
    await browserLogin(ctx.actors.learnerEmail);
    await captureView({
      slug: '08-hv-admissions-obligation',
      pillar: 'Group B & C',
      uc: 'UCV2-12, UCV2-14',
      actorLabel: 'Học viên (HV)',
      path: `/admissions/${ctx.ids.admissionApplicationId}`,
      expectedMarkers: ['Hồ sơ nhập học / học phí'],
      width: 1440,
      height: 900,
    });

    // Group C — Cashier Finance Reconciliation Workspace
    await browserLogin(ctx.actors.cashierEmail);
    await captureView({
      slug: '09-tn-admissions-finance-workspace',
      pillar: 'Group C',
      uc: 'UCV2-15, UCV2-16, UCV2-17',
      actorLabel: 'Thu ngân (TN)',
      path: '/workspace/admissions',
      expectedMarkers: ['Đối soát học phí & biên nhận'],
      width: 1440,
      height: 900,
    });

    // Group D — HVU Program Versions & Rooms Planning
    await browserLogin(ctx.actors.hvuMakerEmail);
    await captureView({
      slug: '10-hvu-curriculum-versions-rooms',
      pillar: 'Group D',
      uc: 'UCV2-38, UCV2-40',
      actorLabel: 'Học vụ (HVU)',
      path: `/academic/programs/${ctx.ids.courseId}/versions`,
      expectedMarkers: ['Phiên bản và điều khoản chương trình'],
      width: 1440,
      height: 900,
    });

    // Group D — QT Authority, Masked Service Config & Audit Explorer
    await browserLogin(ctx.actors.adminEmail);
    await captureView({
      slug: '11-qt-authority-config-audit',
      pillar: 'Group D',
      uc: 'UCV2-53, UCV2-54, UCV2-55',
      actorLabel: 'Quản trị hệ thống (QT)',
      path: '/workspace/authority',
      expectedMarkers: [
        'Tài khoản và phân quyền',
        'Cấu hình dịch vụ và tình trạng vận hành hệ thống',
        'SEPAY_WEBHOOK_SECRET',
        '••••••••',
      ],
      width: 1440,
      height: 900,
      afterNavigateJs: `(() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Kiểm tra cấu hình & sức khỏe dịch vụ'));
        if (btn && !document.body.innerText.includes('SEPAY_WEBHOOK_SECRET')) { btn.click(); return true; }
        return document.body.innerText.includes('SEPAY_WEBHOOK_SECRET');
      })()`,
    });

    // Group D — 7-Role Daily Activity Report & CSV Export
    await captureView({
      slug: '12-daily-role-reports-csv',
      pillar: 'Group D',
      uc: 'UCV2-56',
      actorLabel: 'Quản trị hệ thống (QT)',
      path: '/workspace/reports',
      expectedMarkers: [
        'Báo cáo hoạt động trong ngày',
        'Tổng hợp KPI hoạt động trong ngày theo vai trò',
        'Tải xuống CSV báo cáo ngày',
      ],
      width: 1440,
      height: 900,
    });

    const serverErrors = networkStatuses.filter((n) => n.status >= 500);
    if (serverErrors.length > 0) {
      throw new Error(`Unexpected 5xx responses during browser capture: ${JSON.stringify(serverErrors)}`);
    }

    const report = {
      executedAtUtc: new Date().toISOString(),
      browserExecutable: chromeBin,
      totalScreenshots: captures.length,
      zero5xxResponses: serverErrors.length === 0,
      zeroHorizontalOverflow: captures.every((c) => c.overflow === false),
      captures,
    };

    await writeFile(
      join(outDir, 'ARGON_WAVE03_BROWSER_VERIFICATION.json'),
      JSON.stringify(report, null, 2),
      'utf8',
    );
    return report;
  } finally {
    try {
      socket?.close();
    } catch {
      // ignore
    }
    try {
      proc?.kill('SIGKILL');
    } catch {
      // ignore
    }
    await webServer.close().catch(() => {});
    await rm(userDataDir, { recursive: true, force: true }).catch(() => {});
  }
}
