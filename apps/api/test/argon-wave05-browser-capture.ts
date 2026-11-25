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

export interface Wave05BrowserCaptureContext {
  apiPort: number;
  password: string;
  actors: {
    cohortAEmail: string;
    cohortBEmail: string;
    cohortCEmail: string;
    cohortDEmail: string;
    cohortEEmail: string;
    cohortFEmail: string;
    cohortGEmail: string;
    primaryLearnerEmail: string;
    teacherEmail: string;
    hvuMakerEmail: string;
    hvuCheckerEmail: string;
  };
  ids: {
    cohortAAttemptId: string;
    cohortBAttemptId: string;
    cohortCAttemptId: string;
    cohortDAttemptId: string;
    cohortEAttemptId: string;
    cohortFAttemptId: string;
    cohortGAttemptId: string;
    classReadingOpenId: string;
    readingCourseSlug: string;
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

export async function runArgonWave05BrowserVerification(ctx: Wave05BrowserCaptureContext) {
  const distDir = resolve(__dirname, '../../web/dist');
  const outDir = resolve(__dirname, '../../../docs/v2/v2-road-to-99-argon-wave05r/EVIDENCE');
  const screenshotsDir = join(outDir, 'screenshots');
  await mkdir(screenshotsDir, { recursive: true });

  const webServer = await startStaticAndApiProxyServer(ctx.apiPort, distDir);
  const userDataDir = await mkdtemp(join(tmpdir(), 'argon-wave05-cdp-'));
  const cdpPort = 9640 + Math.floor(Math.random() * 250);
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { resolve: (v: Record<string, any>) => void; reject: (e: Error) => void }
    >();
    const networkStatuses: Array<{ url: string; status: number }> = [];
    const consoleErrors: string[] = [];

    socket.addEventListener('message', (event) => {
      const msg = JSON.parse(String(event.data));
      if (msg.method === 'Network.responseReceived') {
        const resp = msg.params?.response;
        if (resp?.url?.includes('/api/')) {
          networkStatuses.push({ url: resp.url, status: resp.status });
        }
      }
      if (msg.method === 'Runtime.exceptionThrown') {
        consoleErrors.push(
          msg.params?.exceptionDetails?.text ?? 'Unhandled runtime exception in browser',
        );
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return new Promise<any>((resolveCmd, rejectCmd) =>
        pending.set(id, { resolve: resolveCmd, reject: rejectCmd }),
      );
    };

    const evaluate = async <T = unknown>(expression: string): Promise<T> => {
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
    await delay(300);

    const browserLogout = async () => {
      await evaluate(`(async () => {
        await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
        return true;
      })()`);
    };

    const browserLogin = async (email: string) => {
      await cdp('Page.navigate', { url: `${webServer.origin}/login` });
      await delay(200);
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
      journey: string;
      uc: string;
      actorLabel: string;
      path: string;
      expectedMarkers: string[];
      forbiddenMarkers?: string[];
      width: number;
      height: number;
      afterNavigateJs?: string;
      scrollY?: number;
    }) => {
      await cdp('Emulation.setDeviceMetricsOverride', {
        width: opts.width,
        height: opts.height,
        deviceScaleFactor: 1,
        mobile: opts.width < 600,
      });
      await cdp('Page.navigate', { url: `${webServer.origin}${opts.path}` });

      let state: {
        text: string;
        pathname: string;
        scrollWidth: number;
        innerWidth: number;
        scrollHeight: number;
        headerHeightPx: number;
      } = {
        text: '',
        pathname: '',
        scrollWidth: 0,
        innerWidth: opts.width,
        scrollHeight: opts.height,
        headerHeightPx: 0,
      };

      for (let i = 0; i < 35; i++) {
        await delay(200);
        if (opts.afterNavigateJs) {
          await evaluate<boolean>(opts.afterNavigateJs).catch(() => false);
        }
        state = await evaluate(`(() => {
          const hdr = document.querySelector('header');
          return {
            text: document.body ? document.body.innerText : '',
            pathname: window.location.pathname,
            scrollWidth: document.documentElement.scrollWidth,
            innerWidth: window.innerWidth,
            scrollHeight: document.documentElement.scrollHeight,
            headerHeightPx: hdr ? Math.round(hdr.getBoundingClientRect().height) : 0
          };
        })()`);
        const lowerPoll = state.text.toLowerCase();
        const allPresent = opts.expectedMarkers.every((m) => lowerPoll.includes(m.toLowerCase()));
        if (allPresent && state.text.trim().length > 40) break;
      }

      if (opts.scrollY != null && opts.scrollY > 0) {
        await evaluate(`(() => {
          const classSec = document.querySelector('section[aria-label="Gợi ý lớp"]');
          if (${opts.scrollY} >= 1500 && classSec) {
            classSec.scrollIntoView({ behavior: 'instant', block: 'start' });
            window.scrollBy(0, -40);
          } else if (${opts.scrollY} === 1450) {
            const rubricHeading = Array.from(document.querySelectorAll('h4')).find(el => el.textContent && el.textContent.includes('Kỹ năng Sản sinh'));
            if (rubricHeading) {
              rubricHeading.scrollIntoView({ behavior: 'instant', block: 'start' });
              window.scrollBy(0, -40);
            } else {
              window.scrollTo(0, ${opts.scrollY});
            }
          } else {
            window.scrollTo(0, ${opts.scrollY});
          }
          return true;
        })()`);
        await delay(200);
      }

      const lowerText = state.text.toLowerCase();
      const missingMarkers = opts.expectedMarkers.filter((m) => !lowerText.includes(m.toLowerCase()));
      if (missingMarkers.length > 0) {
        throw new Error(
          `Browser capture [${opts.slug}] at ${opts.path} missing expected markers: ${missingMarkers.join(', ')}. Visible text: ${state.text.slice(0, 600)}`,
        );
      }

      const foundForbidden = (opts.forbiddenMarkers ?? []).filter((m) => state.text.includes(m));
      if (foundForbidden.length > 0) {
        throw new Error(
          `Browser capture [${opts.slug}] at ${opts.path} exposed forbidden markers: ${foundForbidden.join(', ')}`,
        );
      }

      const horizontalOverflowPx = Math.max(0, state.scrollWidth - state.innerWidth);
      if (horizontalOverflowPx > 0) {
        throw new Error(
          `Browser capture [${opts.slug}] at ${opts.path} (${opts.width}x${opts.height}) had horizontal overflow: ${horizontalOverflowPx}px`,
        );
      }

      const shot = await cdp('Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: false,
      });
      const fileName = `${opts.slug}.png`;
      const filePath = join(screenshotsDir, fileName);
      await writeFile(filePath, Buffer.from(shot.data, 'base64'));

      const record = {
        slug: opts.slug,
        fileName,
        journey: opts.journey,
        uc: opts.uc,
        actorLabel: opts.actorLabel,
        requestedPath: opts.path,
        finalPathname: state.pathname,
        viewport: `${opts.width}x${opts.height}`,
        horizontalOverflowPx,
        headerHeightPx: state.headerHeightPx,
        expectedMarkersVerified: opts.expectedMarkers,
        forbiddenMarkersChecked: opts.forbiddenMarkers ?? [],
        textSnippet: state.text.replace(/\s+/g, ' ').trim().slice(0, 360),
      };
      captures.push(record);
      return record;
    };

    const expandCourseEvaluationDetailsJs = `(() => {
      const d = document.querySelector('details');
      if (d) { d.open = true; return true; }
      return false;
    })()`;

    const openMobileNavDrawerJs = `(() => {
      const dialog = document.querySelector('[role="dialog"]');
      if (dialog) return true;
      const btn = document.querySelector('button[aria-label="Mở menu điều hướng"]');
      if (btn) { btn.click(); return true; }
      return false;
    })()`;

    const publishedResultForbidden = [
      'Kết quả Placement nội bộ DEV',
      'isCorrect',
      'selectedOptionIds',
      'Đang làm bài',
      'Mã hồ sơ:',
      'Kết quả chưa đáp ứng điều kiện đầu vào của lớp theo tiêu chí đã duyệt.',
    ];

    // 1. Public Catalog (/catalog) — Desktop, Tablet, Mobile
    await browserLogout();
    await captureView({
      slug: '01-w05-public-catalog-desktop',
      journey: 'Outcome D — Public Course Catalog Availability Polish',
      uc: 'UCV2-02, UCV2-07',
      actorLabel: 'GUEST',
      path: '/catalog',
      expectedMarkers: [
        'TOEIC Reading Strategies & Grammar 550+',
        'TOEIC Listening Focus & Reflex 550+',
        'TOEIC L&R Advancing 550+',
        '1 lớp còn chỗ',
        'Lớp đã đủ sĩ số',
        'Sắp mở lịch khai giảng mới',
      ],
      forbiddenMarkers: ['0 lớp để xem thông tin', 'Internal QA Fixture'],
      width: 1440,
      height: 900,
    });

    await captureView({
      slug: '02-w05-public-catalog-tablet',
      journey: 'Outcome D — Public Course Catalog Availability Polish (Tablet)',
      uc: 'UCV2-02, UCV2-07',
      actorLabel: 'GUEST',
      path: '/catalog',
      expectedMarkers: [
        'TOEIC Reading Strategies & Grammar 550+',
        '1 lớp còn chỗ',
      ],
      forbiddenMarkers: ['0 lớp để xem thông tin', 'Internal QA Fixture'],
      width: 820,
      height: 1180,
    });

    await captureView({
      slug: '03-w05-public-catalog-mobile',
      journey: 'Outcome D — Public Course Catalog Availability Polish (Mobile)',
      uc: 'UCV2-02, UCV2-07',
      actorLabel: 'GUEST',
      path: '/catalog',
      expectedMarkers: [
        'TOEIC Reading Strategies & Grammar 550+',
        '1 lớp còn chỗ',
      ],
      forbiddenMarkers: ['0 lớp để xem thông tin', 'Internal QA Fixture'],
      width: 390,
      height: 844,
    });

    // 2. Cohort A (110/200 LR — Strong Listening 78/100, Weak Reading 32/100) — Top Diagnosis, Recommendations & Mobile
    const cohortARef = ctx.ids.cohortAAttemptId.slice(0, 8).toUpperCase();
    const cohortBRef = ctx.ids.cohortBAttemptId.slice(0, 8).toUpperCase();
    const cohortCRef = ctx.ids.cohortCAttemptId.slice(0, 8).toUpperCase();
    const cohortDRef = ctx.ids.cohortDAttemptId.slice(0, 8).toUpperCase();
    const cohortGRef = ctx.ids.cohortGAttemptId.slice(0, 8).toUpperCase();

    await browserLogin(ctx.actors.cohortAEmail);
    await captureView({
      slug: '04-w05-cohort-a-lr110-reading-weak-top-desktop',
      journey: 'Outcome A+B+C — Cohort A (110/200: L=78, R=32) Evidence Diagnosis & AI Advisory',
      uc: 'UCV2-06, UCV2-07, UCV2-45',
      actorLabel: 'STUDENT (Nguyễn Minh Khoa — Cohort A)',
      path: `/placement/sittings/${ctx.ids.cohortAAttemptId}/result`,
      expectedMarkers: [
        'Kết quả đánh giá năng lực đầu vào',
        'Kết quả đã công bố',
        `Mã lượt làm bài: #${cohortARef}`,
        'Mã phiên bản đề: #',
        'Tổng câu đúng Nghe – Đọc: 110/200 câu (55%)',
        'Kỹ năng Nghe (78/100 — 78%) vượt trội hơn Kỹ năng Đọc (32/100 — 32%)',
        'Hệ thống phân tích / giải thích theo dữ liệu',
        'Điểm mạnh đã kiểm chứng & Trọng tâm cần cải thiện',
      ],
      forbiddenMarkers: publishedResultForbidden,
      width: 1440,
      height: 900,
    });

    await captureView({
      slug: '05-w05-cohort-a-lr110-reading-weak-classes-desktop',
      journey: 'Outcome B+C — Cohort A Self-Study Resources & Explainable Class Recommendation',
      uc: 'UCV2-07, UCV2-42, UCV2-45',
      actorLabel: 'STUDENT (Nguyễn Minh Khoa — Cohort A)',
      path: `/placement/sittings/${ctx.ids.cohortAAttemptId}/result`,
      expectedMarkers: [
        'Đã tìm thấy 1 lớp đang mở phù hợp',
        'TOEIC Reading & Grammar 550+ — Tối 2-4-6 (Ca 18:30)',
        'Hệ thống Từ loại, Thì động từ & Cấu trúc Mệnh đề TOEIC Part 5–6',
        'Chưa có tài liệu được xác thực cho chủ đề này',
        'Khớp tiêu chí năng lực & Có lớp đang mở',
      ],
      forbiddenMarkers: publishedResultForbidden,
      afterNavigateJs: expandCourseEvaluationDetailsJs,
      scrollY: 1650,
      width: 1440,
      height: 900,
    });

    await captureView({
      slug: '06-w05-cohort-a-lr110-reading-weak-tablet',
      journey: 'Outcome A+B+D — Cohort A Placement Result (Tablet)',
      uc: 'UCV2-06, UCV2-07',
      actorLabel: 'STUDENT (Nguyễn Minh Khoa — Cohort A)',
      path: `/placement/sittings/${ctx.ids.cohortAAttemptId}/result`,
      expectedMarkers: [
        'Kết quả đánh giá năng lực đầu vào',
        'Kết quả đã công bố',
        `Mã lượt làm bài: #${cohortARef}`,
        'Tổng câu đúng Nghe – Đọc: 110/200 câu (55%)',
      ],
      forbiddenMarkers: publishedResultForbidden,
      width: 820,
      height: 1180,
    });

    const mobileClosedRecord = await captureView({
      slug: '07-w05-cohort-a-lr110-reading-weak-mobile',
      journey: 'Outcome A+B+D — Cohort A Placement Result (Mobile — Compact Header Closed)',
      uc: 'UCV2-06, UCV2-07',
      actorLabel: 'STUDENT (Nguyễn Minh Khoa — Cohort A)',
      path: `/placement/sittings/${ctx.ids.cohortAAttemptId}/result`,
      expectedMarkers: [
        'Kết quả đánh giá năng lực đầu vào',
        'Kết quả đã công bố',
        `Mã lượt làm bài: #${cohortARef}`,
        'Menu',
        'Tổng câu đúng Nghe – Đọc: 110/200 câu (55%)',
      ],
      forbiddenMarkers: [
        ...publishedResultForbidden,
        'Học phí SePay',
        'Lịch tháng',
        'Khóa học của tôi',
      ],
      width: 390,
      height: 844,
    });
    if ((mobileClosedRecord.headerHeightPx as number) > 85) {
      throw new Error(
        `Mobile header on 07-w05-cohort-a-lr110-reading-weak-mobile wrapped into multiple rows: ${mobileClosedRecord.headerHeightPx}px`,
      );
    }

    await captureView({
      slug: '07b-w05r-cohort-a-lr110-reading-weak-mobile-drawer-open',
      journey: 'Outcome D — Cohort A Placement Result (Mobile — Navigation Drawer Open)',
      uc: 'UCV2-06, UCV2-07',
      actorLabel: 'STUDENT (Nguyễn Minh Khoa — Cohort A)',
      path: `/placement/sittings/${ctx.ids.cohortAAttemptId}/result`,
      expectedMarkers: [
        'Điều hướng học viên',
        'Trang chủ',
        'Khóa học',
        'Kiểm tra đầu vào',
        'Học phí SePay',
        'Lịch tháng',
        'Đăng xuất',
      ],
      forbiddenMarkers: publishedResultForbidden,
      afterNavigateJs: openMobileNavDrawerJs,
      width: 390,
      height: 844,
    });

    // Click-through from Cohort A self-study resource link to Knowledge Library Article
    await captureView({
      slug: '08-w05-cohort-a-vetted-knowledge-article-desktop',
      journey: 'Outcome C — Allowlisted Self-Study Knowledge Article Click-Through',
      uc: 'UCV2-31, UCV2-07',
      actorLabel: 'STUDENT (Nguyễn Minh Khoa — Cohort A)',
      path: '/knowledge/articles/toeic-part5-word-forms-and-clause-structure',
      expectedMarkers: [
        'Hệ thống Từ loại, Thì động từ & Cấu trúc Mệnh đề TOEIC Part 5–6',
      ],
      width: 1440,
      height: 900,
    });

    // 3. Cohort B (110/200 LR — Weak Listening 32/100, Strong Reading 78/100) — Contrasting Diagnosis & Class
    await browserLogin(ctx.actors.cohortBEmail);
    await captureView({
      slug: '09-w05-cohort-b-lr110-listening-weak-top-desktop',
      journey: 'Outcome A+B — Cohort B (110/200: L=32, R=78) Contrasting Diagnosis on Equal Total Score',
      uc: 'UCV2-06, UCV2-07, UCV2-45',
      actorLabel: 'STUDENT (Trần Ngọc Bảo Trân — Cohort B)',
      path: `/placement/sittings/${ctx.ids.cohortBAttemptId}/result`,
      expectedMarkers: [
        'Kết quả đánh giá năng lực đầu vào',
        'Kết quả đã công bố',
        `Mã lượt làm bài: #${cohortBRef}`,
        'Mã phiên bản đề: #',
        'Tổng câu đúng Nghe – Đọc: 110/200 câu (55%)',
        'Kỹ năng Đọc (78/100 — 78%) vượt trội hơn Kỹ năng Nghe (32/100 — 32%)',
        'Nghe phản hồi gián tiếp, đề xuất & câu hỏi đuôi (Part 2)',
      ],
      forbiddenMarkers: publishedResultForbidden,
      width: 1440,
      height: 900,
    });

    await captureView({
      slug: '10-w05-cohort-b-lr110-listening-weak-classes-desktop',
      journey: 'Outcome B — Cohort B Contrasting Class Match (TOEIC Listening Focus 550+)',
      uc: 'UCV2-07, UCV2-42',
      actorLabel: 'STUDENT (Trần Ngọc Bảo Trân — Cohort B)',
      path: `/placement/sittings/${ctx.ids.cohortBAttemptId}/result`,
      expectedMarkers: [
        'Đã tìm thấy 1 lớp đang mở phù hợp',
        'TOEIC Listening Focus 550+ — Tối 3-5-7 (Ca 18:30)',
        'Chiến thuật Nghe hiểu TOEIC Part 1–2: Bẫy đồng âm & Câu trả lời gián tiếp',
      ],
      forbiddenMarkers: publishedResultForbidden,
      afterNavigateJs: expandCourseEvaluationDetailsJs,
      scrollY: 1650,
      width: 1440,
      height: 900,
    });

    await captureView({
      slug: '11-w05-cohort-b-lr110-listening-weak-mobile',
      journey: 'Outcome A+B — Cohort B Contrasting Diagnosis (Mobile)',
      uc: 'UCV2-06, UCV2-07',
      actorLabel: 'STUDENT (Trần Ngọc Bảo Trân — Cohort B)',
      path: `/placement/sittings/${ctx.ids.cohortBAttemptId}/result`,
      expectedMarkers: [
        'Kết quả đã công bố',
        `Mã lượt làm bài: #${cohortBRef}`,
        'Tổng câu đúng Nghe – Đọc: 110/200 câu (55%)',
        'Kỹ năng Đọc (78/100 — 78%) vượt trội hơn Kỹ năng Nghe (32/100 — 32%)',
      ],
      forbiddenMarkers: [
        ...publishedResultForbidden,
        'Học phí SePay',
        'Lịch tháng',
      ],
      width: 390,
      height: 844,
    });

    // 4. Cohort C (110/200 LR — Balanced 55/100 L + 55/100 R) — Open Class + Full/Waitlist Class Separation
    await browserLogin(ctx.actors.cohortCEmail);
    await captureView({
      slug: '12-w05-cohort-c-lr110-balanced-classes-desktop',
      journey: 'Outcome B — Cohort C (110/200: L=55, R=55) Open vs Full/Waitlist Class Separation',
      uc: 'UCV2-07, UCV2-42',
      actorLabel: 'STUDENT (Lê Hoàng Gia Huy — Cohort C)',
      path: `/placement/sittings/${ctx.ids.cohortCAttemptId}/result`,
      expectedMarkers: [
        'Đã tìm thấy 1 lớp đang mở phù hợp',
        `Mã lượt làm bài: #${cohortCRef}`,
        'TOEIC L&R Advancing 550+ — Tối 2-4-6 (Ca 19:30)',
        'TOEIC L&R Advancing 550+ — Cuối tuần Thứ 7-CN',
        'Hết chỗ (Danh sách chờ)',
        'Lớp cùng chương trình phù hợp nhưng hiện hết chỗ / đóng nhận hồ sơ',
      ],
      forbiddenMarkers: publishedResultForbidden,
      afterNavigateJs: expandCourseEvaluationDetailsJs,
      scrollY: 1650,
      width: 1440,
      height: 900,
    });

    // 5. Cohort D (FOUR_SKILLS Pending S/W — LR_ONLY_PRELIMINARY)
    await browserLogin(ctx.actors.cohortDEmail);
    await captureView({
      slug: '13-w05-cohort-d-four-skills-pending-sw-desktop',
      journey: 'Outcome A+B — Cohort D FOUR_SKILLS Pending S/W Rubric Grading (No Fake Zero Score)',
      uc: 'UCV2-06, UCV2-07, UCV2-45',
      actorLabel: 'STUDENT (Phạm Khánh Linh — Cohort D)',
      path: `/placement/sittings/${ctx.ids.cohortDAttemptId}/result`,
      expectedMarkers: [
        'Đã nộp — đang chờ chấm',
        `Mã lượt làm bài: #${cohortDRef}`,
        'ĐANG CHẤM',
        'Chờ chấm Rubric',
        'Chưa có điểm được phép công bố — không tính là 0 điểm',
        'Đang chờ hoàn tất chấm Nói/Viết — Chưa đủ dữ liệu để gợi ý lớp.',
      ],
      forbiddenMarkers: ['Đang làm bài', 'Mã hồ sơ:'],
      width: 1440,
      height: 900,
    });

    await captureView({
      slug: '14-w05-cohort-d-four-skills-pending-sw-mobile',
      journey: 'Outcome A+B — Cohort D FOUR_SKILLS Pending S/W Rubric Grading (Mobile)',
      uc: 'UCV2-06, UCV2-07, UCV2-45',
      actorLabel: 'STUDENT (Phạm Khánh Linh — Cohort D)',
      path: `/placement/sittings/${ctx.ids.cohortDAttemptId}/result`,
      expectedMarkers: [
        'Đã nộp — đang chờ chấm',
        `Mã lượt làm bài: #${cohortDRef}`,
        'ĐANG CHẤM',
        'Chờ chấm Rubric',
      ],
      forbiddenMarkers: ['Đang làm bài', 'Mã hồ sơ:', 'Học phí SePay', 'Lịch tháng'],
      width: 390,
      height: 844,
    });

    // 6. Cohort E (FOUR_SKILLS Finalized S/W — Full 4-Skill Diagnosis & Class Match)
    await browserLogin(ctx.actors.cohortEEmail);
    await captureView({
      slug: '15-w05-cohort-e-four-skills-finalized-top-desktop',
      journey: 'Outcome A+B — Cohort E FOUR_SKILLS Finalized S/W Rubric Breakdown & 4-Skill Class Match',
      uc: 'UCV2-06, UCV2-07, UCV2-45',
      actorLabel: 'STUDENT (Đặng Quốc Anh — Cohort E)',
      path: `/placement/sittings/${ctx.ids.cohortEAttemptId}/result`,
      expectedMarkers: [
        'Kết quả đánh giá năng lực đầu vào',
        'Kết quả đã công bố',
        'Đã công bố',
        'SPEAKING',
        'WRITING',
      ],
      forbiddenMarkers: publishedResultForbidden,
      width: 1440,
      height: 900,
    });

    await captureView({
      slug: '16-w05-cohort-e-four-skills-finalized-rubric-classes-desktop',
      journey: 'Outcome A+B — Cohort E Speaking/Writing Rubric Detail & 4-Skill Class Recommendation',
      uc: 'UCV2-07, UCV2-45',
      actorLabel: 'STUDENT (Đặng Quốc Anh — Cohort E)',
      path: `/placement/sittings/${ctx.ids.cohortEAttemptId}/result`,
      expectedMarkers: [
        'Chi tiết đánh giá Kỹ năng Sản sinh (Speaking & Writing theo Rubric)',
        'TASK_FULFILLMENT',
        'TOEIC 4 Kỹ Năng 650+ — Tối 2-4-6 & Thứ 7',
      ],
      forbiddenMarkers: publishedResultForbidden,
      scrollY: 1450,
      width: 1440,
      height: 900,
    });

    // 7. Cohort F (ALL_LOW_EVIDENCE & MISSING_TAGS)
    await browserLogin(ctx.actors.cohortFEmail);
    await captureView({
      slug: '17-w05-cohort-f-low-sample-unclassified-desktop',
      journey: 'Outcome A — Cohort F Low-Sample (< 3 items) & Unclassified Tag Safeguard',
      uc: 'UCV2-06, UCV2-07',
      actorLabel: 'STUDENT (Vũ Thảo Nguyên — Cohort F)',
      path: `/placement/sittings/${ctx.ids.cohortFAttemptId}/result`,
      expectedMarkers: [
        'Kết quả đã công bố',
        'Chưa đủ dữ liệu kết luận (mẫu nhỏ',
        'Chưa phân loại kiến thức',
        'Lưu ý về cỡ mẫu & phân loại câu hỏi',
      ],
      forbiddenMarkers: publishedResultForbidden,
      scrollY: 750,
      width: 1440,
      height: 900,
    });

    // 8. Cohort G (NO_AVAILABLE_CLASS — Eligible Course with Only Full Class)
    await browserLogin(ctx.actors.cohortGEmail);
    await captureView({
      slug: '18-w05-cohort-g-eligible-no-open-class-desktop',
      journey: 'Outcome B — Cohort G Eligible Course With Only Full Class (No Fake Seat Guarantee)',
      uc: 'UCV2-07, UCV2-42',
      actorLabel: 'STUDENT (Hoàng Minh Tuấn — Cohort G)',
      path: `/placement/sittings/${ctx.ids.cohortGAttemptId}/result`,
      expectedMarkers: [
        `Mã lượt làm bài: #${cohortGRef}`,
        'Đủ điều kiện chương trình nhưng hiện chưa có lớp còn chỗ',
        '• Lớp đã đủ sĩ số hoặc chưa xác minh sức chứa.',
        'TOEIC Intensive 750+ — Tối 3-5-7 (Đã đủ sĩ số)',
        'Hết chỗ (Danh sách chờ)',
        'Đăng ký danh sách chờ / Tư vấn lịch khai giảng mới',
      ],
      forbiddenMarkers: publishedResultForbidden,
      afterNavigateJs: expandCourseEvaluationDetailsJs,
      scrollY: 1550,
      width: 1440,
      height: 900,
    });

    // 9. Enrolled Student Dashboard (/my) & Classroom (/classroom/:classId)
    await browserLogin(ctx.actors.primaryLearnerEmail);
    await captureView({
      slug: '19-w05-student-dashboard-polished-desktop',
      journey: 'Outcome D — Enrolled Student Dashboard With Realistic Class & Placement Result',
      uc: 'UCV2-19, UCV2-07',
      actorLabel: 'STUDENT (Bùi Thị Minh Châu)',
      path: '/my',
      expectedMarkers: [
        'TOEIC Reading & Grammar 550+ — Tối 2-4-6 (Ca 18:30)',
      ],
      width: 1440,
      height: 900,
    });

    await captureView({
      slug: '20-w05-student-classroom-lms-desktop',
      journey: 'Outcome D — Enrolled Student Classroom With Personalized Grammar Module',
      uc: 'UCV2-20, UCV2-29',
      actorLabel: 'STUDENT (Bùi Thị Minh Châu)',
      path: `/classroom/${ctx.ids.classReadingOpenId}`,
      expectedMarkers: [
        'Tuần 01 — Hệ thống Từ loại, Cấu trúc Mệnh đề & Chiến thuật Part 5–6',
        'Bài 01: Nhận diện nhanh vị trí Danh – Động – Tính – Trạng trong 15 giây',
      ],
      width: 1440,
      height: 900,
    });

    // 10. Instructor Rubric Grading Workspace (/workspace/placement/attempts/:id)
    await browserLogin(ctx.actors.teacherEmail);
    await captureView({
      slug: '21-w05-instructor-rubric-review-desktop',
      journey: 'Outcome A+D — Instructor Speaking/Writing Original Evidence & Rubric Grading Workspace',
      uc: 'UCV2-45',
      actorLabel: 'INSTRUCTOR (ThS. Nguyễn Thu Hà)',
      path: `/workspace/placement/attempts/${ctx.ids.cohortDAttemptId}`,
      expectedMarkers: [
        'Kiểm tra & chấm Placement',
        'Chấm thủ công theo rubric đã duyệt',
        'SPEAKING',
      ],
      width: 1440,
      height: 900,
    });

    // 11. Academic Manager Placement Readiness & Criteria Policy Governance (/workspace/placement)
    await browserLogin(ctx.actors.hvuMakerEmail);
    await captureView({
      slug: '22-w05-academic-criteria-readiness-desktop',
      journey: 'Outcome B+D — Academic Placement Readiness Gate & Criteria Policy Governance',
      uc: 'UCV2-42, UCV2-45',
      actorLabel: 'ACADEMIC_MANAGER (ThS. Trần Quốc Tuấn)',
      path: '/workspace/placement',
      expectedMarkers: [
        'Phiên bản chính sách',
        'Tiêu chí đối sánh lớp',
      ],
      width: 1440,
      height: 900,
    });

    const manifest = {
      generatedAt: new Date().toISOString(),
      totalCaptures: captures.length,
      zeroHorizontalOverflowAllCaptures: captures.every((c) => c.horizontalOverflowPx === 0),
      consoleErrorsCount: consoleErrors.length,
      consoleErrors,
      api5xxResponses: networkStatuses.filter((n) => n.status >= 500),
      captures,
    };

    await writeFile(
      join(outDir, 'BROWSER_VERIFICATION_WAVE05R.json'),
      JSON.stringify(manifest, null, 2),
    );
    return manifest;
  } finally {
    try {
      socket?.close();
    } catch {
      // ignore
    }
    if (proc && !proc.killed) {
      proc.kill('SIGKILL');
    }
    await webServer.close();
    await rm(userDataDir, { recursive: true, force: true }).catch(() => {});
  }
}
