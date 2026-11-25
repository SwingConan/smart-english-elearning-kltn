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

export interface Wave02BrowserCaptureContext {
  apiPort: number;
  password: string;
  actors: {
    teacherEmail: string;
    learnerEmail: string;
    inspectorEmail: string;
    hvuMakerEmail: string;
    hvuCheckerEmail: string;
  };
  ids: {
    classOfferingId: string;
    sessionId: string;
    inspectionAssignmentId: string;
    enrollmentId: string;
    policyId: string;
    certificateId: string;
    certificateCode: string;
    revokedCertificateCode: string;
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

export async function runArgonWave02BrowserVerification(ctx: Wave02BrowserCaptureContext) {
  const distDir = resolve(__dirname, '../../web/dist');
  const outDir = resolve(__dirname, '../../../docs/v2/v2-road-to-99-argon-wave02/EVIDENCE');
  const screenshotsDir = join(outDir, 'screenshots');
  await mkdir(screenshotsDir, { recursive: true });

  const webServer = await startStaticAndApiProxyServer(ctx.apiPort, distDir);
  const userDataDir = await mkdtemp(join(tmpdir(), 'argon-wave02-cdp-'));
  const cdpPort = 9340 + Math.floor(Math.random() * 400);
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

    const browserLogin = async (email: string) => {
      await evaluate(`(async () => {
        await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
        const r = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ email: ${JSON.stringify(email)}, password: ${JSON.stringify(ctx.password)} })
        });
        if (!r.ok) throw new Error('Browser login failed for ' + ${JSON.stringify(email)} + ': ' + r.status);
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
      check8020Selector?: string;
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
        gridColumns?: { leftWidth: number; rightWidth: number; sideBySide: boolean } | null;
      } | null = null;

      for (let attempt = 0; attempt < 35; attempt++) {
        await delay(250);
        state = await evaluate(`(() => {
          const text = document.body?.innerText ?? '';
          const scrollWidth = document.documentElement.scrollWidth;
          const clientWidth = document.documentElement.clientWidth;
          let gridColumns = null;
          const sel = ${JSON.stringify(opts.check8020Selector ?? '')};
          if (sel) {
            const grid = document.querySelector(sel);
            if (grid && grid.children.length >= 2) {
              const r0 = grid.children[0].getBoundingClientRect();
              const r1 = grid.children[1].getBoundingClientRect();
              gridColumns = {
                leftWidth: Math.round(r0.width),
                rightWidth: Math.round(r1.width),
                sideBySide: r1.left >= r0.right - 4 && r0.width > r1.width * 2,
              };
            }
          }
          return {
            text,
            path: location.pathname,
            scrollWidth,
            clientWidth,
            overflow: scrollWidth > clientWidth + 2,
            gridColumns,
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
      if (opts.check8020Selector && opts.width >= 1024) {
        if (!state.gridColumns?.sideBySide) {
          throw new Error(
            `Expected 80/20 side-by-side layout on ${opts.path} (${opts.slug}) at ${opts.width}x${opts.height}, got ${JSON.stringify(state.gridColumns)}`,
          );
        }
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
        grid8020: state.gridColumns ?? undefined,
      });
    };

    const openActivityChooserJs = `(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const editBtn = buttons.find((b) => (b.textContent || '').includes('Bật chế độ chỉnh sửa'));
      if (editBtn) editBtn.click();
      const updatedButtons = Array.from(document.querySelectorAll('button'));
      const addBtn = updatedButtons.find((b) => (b.textContent || '').includes('Thêm hoạt động hoặc tài nguyên'));
      if (addBtn) {
        addBtn.click();
        return true;
      }
      return false;
    })()`;

    // --- 1. GV (Instructor): Classroom with Official TeachingSessions + Sections + 6-Type Activity Chooser ---
    await browserLogin(ctx.actors.teacherEmail);

    await captureView({
      slug: '01-gv-classroom-sessions-and-sections-1440',
      pillar: 'Pillar A — GV Classroom & Official Sessions',
      uc: 'UCV2-29..37, UCV2-25',
      actorLabel: 'GV (Instructor)',
      path: `/classroom/${ctx.ids.classOfferingId}`,
      expectedMarkers: [
        'Buổi học đã công bố',
        'Bật chế độ chỉnh sửa',
        'Điều hành Điểm danh & Google Meet',
      ],
      width: 1440,
      height: 900,
    });

    await captureView({
      slug: '02-gv-activity-chooser-6-types-1440',
      pillar: 'Pillar A — IUH LMS 6-Type Activity Chooser (Desktop)',
      uc: 'UCV2-29..37',
      actorLabel: 'GV (Instructor)',
      path: `/classroom/${ctx.ids.classOfferingId}`,
      afterNavigateJs: openActivityChooserJs,
      expectedMarkers: [
        'Thêm hoạt động hoặc tài nguyên',
        'Điểm danh',
        'Buổi học online / Đề nghị Meet',
        'Quiz trắc nghiệm',
        'Bài tập',
        'Bài học',
        'Tài nguyên',
      ],
      width: 1440,
      height: 900,
    });

    await captureView({
      slug: '03-gv-activity-chooser-6-types-390',
      pillar: 'Pillar A — IUH LMS 6-Type Activity Chooser (Mobile)',
      uc: 'UCV2-29..37',
      actorLabel: 'GV (Instructor)',
      path: `/classroom/${ctx.ids.classOfferingId}`,
      afterNavigateJs: openActivityChooserJs,
      expectedMarkers: [
        'Thêm hoạt động hoặc tài nguyên',
        'Điểm danh',
        'Buổi học online / Đề nghị Meet',
        'Quiz trắc nghiệm',
        'Bài tập',
        'Bài học',
        'Tài nguyên',
      ],
      width: 390,
      height: 844,
    });

    // --- 2. GV (Instructor): Session Engagement (Google Meet Proposal, Attendance Window, 20-hex Code Rotation & Roster) ---
    await captureView({
      slug: '04-gv-session-engagement-meet-attendance-1440',
      pillar: 'Pillar B — Official Session Meet & Attendance',
      uc: 'UCV2-35, UCV2-36, UCV2-37',
      actorLabel: 'GV (Instructor)',
      path: `/classroom/${ctx.ids.classOfferingId}/attendance?mode=meet`,
      expectedMarkers: [
        'Điểm danh theo buổi chính thức',
        'Đang điều hành buổi này',
      ],
      width: 1440,
      height: 900,
    });

    // --- 3. HVU (Academic Manager): Session Engagement Review & Schedule/Meet Governance ---
    await browserLogin(ctx.actors.hvuCheckerEmail);

    await captureView({
      slug: '05-hvu-session-engagement-review-1440',
      pillar: 'Pillar B — HVU Meet & Attendance Review',
      uc: 'UCV2-42, UCV2-43, UCV2-44',
      actorLabel: 'HVU (Academic Manager Checker)',
      path: '/academic/session-engagement',
      expectedMarkers: ['Duyệt Meet / điểm danh / đề nghị lịch'],
      width: 1440,
      height: 900,
    });

    // --- 4. TT / HVU: Teaching Inspection & Hours Verification Workspace (W08) ---
    await browserLogin(ctx.actors.inspectorEmail);

    await captureView({
      slug: '06-tt-inspection-workspace-1440',
      pillar: 'Pillar C — W08 Teaching Inspection & Hours Verification',
      uc: 'UCV2-48, UCV2-49, UCV2-50, UCV2-51, UCV2-52',
      actorLabel: 'TT (Teaching Inspector)',
      path: '/workspace/inspection',
      expectedMarkers: ['Lịch điều phối tuần', 'Lịch ca và bằng chứng'],
      width: 1440,
      height: 900,
    });

    // --- 5. HVU (Academic Manager): W09 Completion Policies & Governed Certificates Workspace ---
    await browserLogin(ctx.actors.hvuCheckerEmail);

    await captureView({
      slug: '07-hvu-certificates-workspace-1440',
      pillar: 'Pillar D — W09 Completion Policies & Certificates Governance',
      uc: 'UCV2-46, UCV2-47',
      actorLabel: 'HVU (Academic Manager Checker)',
      path: '/workspace/certificates',
      expectedMarkers: [
        'Danh sách Chính sách & Phê duyệt độc lập',
        'Xét điều kiện hoàn thành & Cấp / Thu hồi chứng chỉ',
        ctx.ids.certificateCode,
      ],
      width: 1440,
      height: 900,
    });

    // --- 6. HV (Enrolled Learner): Completion Readiness & Issued Certificate View + Lookup ---
    await browserLogin(ctx.actors.learnerEmail);

    await captureView({
      slug: '08-hv-completion-issued-certificate-1440',
      pillar: 'Pillar D — Learner Completion & Issued Certificate',
      uc: 'UCV2-28',
      actorLabel: 'HV (Enrolled Learner)',
      path: '/completion',
      expectedMarkers: [
        'Điều kiện hoàn thành & chứng chỉ',
        'Mã chứng chỉ:',
        ctx.ids.certificateCode,
      ],
      width: 1440,
      height: 900,
    });

    await captureView({
      slug: '09-certificate-lookup-verified-1440',
      pillar: 'Pillar D — Certificate Code Lookup & Verification',
      uc: 'UCV2-28, UCV2-47',
      actorLabel: 'HV / Public Verifier',
      path: `/certificates/lookup?code=${encodeURIComponent(ctx.ids.certificateCode)}`,
      expectedMarkers: [
        'Tra cứu chứng chỉ hoàn thành khóa học',
        ctx.ids.certificateCode,
        'ISSUED',
      ],
      width: 1440,
      height: 900,
    });

    await captureView({
      slug: '10-certificate-lookup-revoked-390',
      pillar: 'Pillar D — Revoked Certificate Lookup (Mobile)',
      uc: 'UCV2-47',
      actorLabel: 'HV / Public Verifier',
      path: `/certificates/lookup?code=${encodeURIComponent(ctx.ids.revokedCertificateCode)}`,
      expectedMarkers: [
        'Tra cứu chứng chỉ hoàn thành khóa học',
        ctx.ids.revokedCertificateCode,
        'REVOKED',
      ],
      width: 390,
      height: 844,
    });

    const summary = {
      executedAtUtc: new Date().toISOString(),
      browserExecutable: chromeBin,
      totalScreenshots: captures.length,
      zeroOverflowAllCaptures: captures.every((c) => c.overflow === false),
      captures,
      apiNetworkSampleCount: networkStatuses.length,
    };

    await writeFile(
      join(outDir, 'ARGON_WAVE02_BROWSER_E2E_PROOFS.json'),
      JSON.stringify(summary, null, 2),
      'utf-8',
    );

    return summary;
  } finally {
    try {
      socket?.close();
    } catch {
      // ignore
    }
    try {
      proc?.kill();
    } catch {
      // ignore
    }
    await webServer.close().catch(() => {});
    await rm(userDataDir, { recursive: true, force: true }).catch(() => {});
  }
}
