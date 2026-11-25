import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer, request as httpRequest, type IncomingMessage, type ServerResponse } from 'node:http';
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

export interface BrowserCaptureContext {
  apiPort: number;
  password: string;
  actors: {
    unenrolledLearnerEmail: string;
    secondUnenrolledLearnerEmail: string;
    activeSittingLearnerEmail: string;
    enrolledLearnerEmail: string;
    teacherEmail: string;
    hvuCheckerEmail: string;
  };
  ids: {
    activeLrAttemptId: string;
    lrAttemptId: string;
    fourAttemptId: string;
    enrolledClassId: string;
    lessonActId: string;
    assignActId: string;
    quizActId: string;
    quizAttemptId: string;
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

export async function runArgonWave01BrowserVerification(ctx: BrowserCaptureContext) {
  const distDir = resolve(__dirname, '../../web/dist');
  const outDir = resolve(__dirname, '../../../docs/v2/v2-road-to-99-argon-wave01/EVIDENCE');
  const screenshotsDir = join(outDir, 'screenshots');
  await mkdir(screenshotsDir, { recursive: true });

  const webServer = await startStaticAndApiProxyServer(ctx.apiPort, distDir);
  const userDataDir = await mkdtemp(join(tmpdir(), 'argon-wave01-cdp-'));
  const cdpPort = 9240 + Math.floor(Math.random() * 400);
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

    // --- 1. Unenrolled Learner (HV chưa ghi danh): W05B Consultations + Calendar + LR 200 Diagnostic & Matched Class ---
    await browserLogin(ctx.actors.unenrolledLearnerEmail);
    await captureView({
      slug: '01_w05b_learner_consultations_desktop',
      pillar: 'W05B',
      uc: 'UCV2-27',
      actorLabel: 'HV (Unenrolled Learner)',
      path: '/consultations',
      expectedMarkers: ['Chọn giảng viên và lịch trống', 'Lịch hẹn của bạn', 'Đã xác nhận'],
      width: 1440,
      height: 900,
    });
    await captureView({
      slug: '02_w05b_learner_consultations_mobile',
      pillar: 'W05B',
      uc: 'UCV2-27',
      actorLabel: 'HV (Unenrolled Learner)',
      path: '/consultations',
      expectedMarkers: ['Chọn giảng viên và lịch trống', 'Lịch hẹn của bạn', 'Đã xác nhận'],
      width: 390,
      height: 844,
    });
    await captureView({
      slug: '03_placement_lr200_result_matched_class_desktop',
      pillar: 'W04/M05',
      uc: 'UCV2-07',
      actorLabel: 'HV (Unenrolled Learner)',
      path: `/placement/sittings/${ctx.ids.lrAttemptId}/result`,
      expectedMarkers: ['Kết quả Placement nội bộ DEV', 'LISTENING', 'READING', '100 mẫu'],
      width: 1440,
      height: 900,
    });
    await captureView({
      slug: '04_placement_lr200_result_matched_class_mobile',
      pillar: 'W04/M05',
      uc: 'UCV2-07',
      actorLabel: 'HV (Unenrolled Learner)',
      path: `/placement/sittings/${ctx.ids.lrAttemptId}/result`,
      expectedMarkers: ['Kết quả Placement nội bộ DEV', 'LISTENING', 'READING'],
      width: 390,
      height: 844,
    });

    // --- 2. Second Unenrolled Learner: 219-Task FOUR_SKILLS Diagnostic Result ---
    await browserLogin(ctx.actors.secondUnenrolledLearnerEmail);
    await captureView({
      slug: '05_placement_fourskills219_result_desktop',
      pillar: 'W04/M05',
      uc: 'UCV2-07',
      actorLabel: 'HV (Four-Skills Candidate)',
      path: `/placement/sittings/${ctx.ids.fourAttemptId}/result`,
      expectedMarkers: ['Kết quả Placement nội bộ DEV', 'SPEAKING', 'WRITING', '66', '56'],
      width: 1440,
      height: 900,
    });

    // --- 3. Instructor (GV): W05B Consultation Workspace + Placement S/W Human Grading Workspace ---
    await browserLogin(ctx.actors.teacherEmail);
    await captureView({
      slug: '06_w05b_teacher_workspace_desktop',
      pillar: 'W05B',
      uc: 'UCV2-57',
      actorLabel: 'GV (Instructor)',
      path: '/consultations',
      expectedMarkers: ['Hồ sơ tư vấn công khai', 'Lịch trống tuần và ngày nghỉ', 'Lịch hẹn của bạn'],
      width: 1440,
      height: 900,
    });
    await captureView({
      slug: '07_placement_teacher_sw_review_desktop',
      pillar: 'W04/M05',
      uc: 'UCV2-06, UCV2-45',
      actorLabel: 'GV (Assigned Grader)',
      path: `/workspace/placement/attempts/${ctx.ids.fourAttemptId}`,
      expectedMarkers: ['Kiểm tra & chấm Placement', 'SPEAKING · Nội dung gốc', 'WRITING · Nội dung gốc', 'PUBLISHED'],
      width: 1440,
      height: 900,
    });

    // --- 4. Academic Manager Checker (HVU): W05B Independent Governance + Placement Readiness ---
    await browserLogin(ctx.actors.hvuCheckerEmail);
    await captureView({
      slug: '08_w05b_hvu_governance_desktop',
      pillar: 'W05B',
      uc: 'UCV2-27, UCV2-57',
      actorLabel: 'HVU (Independent Checker)',
      path: '/consultations',
      expectedMarkers: ['Hàng đợi duyệt và đối chiếu tư vấn', 'ThS. Nguyễn Thu Hà', 'Ngừng đặt mới'],
      width: 1440,
      height: 900,
    });
    await captureView({
      slug: '09_placement_hvu_readiness_policies_desktop',
      pillar: 'W04/M05',
      uc: 'UCV2-45',
      actorLabel: 'HVU (Policy & Result Publisher)',
      path: '/workspace/placement',
      expectedMarkers: ['Placement — kiểm chứng DEV riêng tư', 'Phiên bản chính sách', 'SOURCE_TIMING', 'CRITERIA'],
      width: 1440,
      height: 900,
    });

    // --- 5A. Active Sitting Candidate: Active 200-Item Placement Sitting (80/20) ---
    await browserLogin(ctx.actors.activeSittingLearnerEmail);
    await captureView({
      slug: '10_placement_active_sitting_80_20_desktop',
      pillar: 'W04/M05',
      uc: 'UCV2-06',
      actorLabel: 'HV (Active Sitting)',
      path: `/placement/sittings/${ctx.ids.activeLrAttemptId}`,
      expectedMarkers: ['Thời gian còn lại', 'LISTENING · Câu 1', 'Điều hướng phần đang mở', '2 ★'],
      width: 1440,
      height: 900,
      check8020Selector: 'main div.grid',
    });
    await captureView({
      slug: '11_placement_active_sitting_mobile',
      pillar: 'W04/M05',
      uc: 'UCV2-06',
      actorLabel: 'HV (Active Sitting)',
      path: `/placement/sittings/${ctx.ids.activeLrAttemptId}`,
      expectedMarkers: ['Thời gian còn lại', 'LISTENING · Câu 1', 'Điều hướng phần đang mở'],
      width: 390,
      height: 844,
    });

    // --- 5B. Enrolled Learner (HV đã ghi danh): Full LMS Continuation (UCV2-18..24, 28) ---
    await browserLogin(ctx.actors.enrolledLearnerEmail);
    await captureView({
      slug: '12_lms_my_dashboard_calendar_desktop',
      pillar: 'LMS Learner Continuation',
      uc: 'UCV2-18',
      actorLabel: 'HV (Enrolled Learner)',
      path: '/my?month=2026-11',
      expectedMarkers: [
        'Các lớp học được truy cập gần đây',
        'Có hoạt động học đã ghi nhận',
        'Giờ Việt Nam (Asia/Ho_Chi_Minh)',
      ],
      width: 1440,
      height: 900,
    });
    await captureView({
      slug: '13_lms_classroom_sections_activities_desktop',
      pillar: 'LMS Learner Continuation',
      uc: 'UCV2-19',
      actorLabel: 'HV (Enrolled Learner)',
      path: `/classroom/${ctx.ids.enrolledClassId}`,
      expectedMarkers: [
        'Unit 1: Workplace Communication & TOEIC Part 5 Foundations',
        'Lesson 1.1: Word Families & Adverb Placement in Workplace Notices',
        'Assignment 1.2: Professional Email Reply to Workshop Inquiry',
        'Quiz 1.3: Part 5 Word Families Check (4 Items)',
      ],
      width: 1440,
      height: 900,
    });
    await captureView({
      slug: '14_lms_assignment_submitted_graded_desktop',
      pillar: 'LMS Learner Continuation',
      uc: 'UCV2-20',
      actorLabel: 'HV (Enrolled Learner)',
      path: `/classroom/${ctx.ids.enrolledClassId}/activities/${ctx.ids.assignActId}`,
      expectedMarkers: ['Assignment 1.2: Professional Email Reply to Workshop Inquiry', 'Dear Ms. Kent'],
      width: 1440,
      height: 900,
    });
    await captureView({
      slug: '15_lms_quiz_attempt_80_20_navigator_desktop',
      pillar: 'LMS Learner Continuation',
      uc: 'UCV2-21',
      actorLabel: 'HV (Enrolled Learner)',
      path: `/classroom/${ctx.ids.enrolledClassId}/quiz-attempts/${ctx.ids.quizAttemptId}`,
      expectedMarkers: [
        'Quiz 1.3: Part 5 Word Families Check (4 Items)',
        'Câu 1 / 4',
        '4/4 đã trả lời · 1 đánh dấu',
        '2 ★',
      ],
      width: 1440,
      height: 900,
      check8020Selector: '[data-testid="quiz-exam-grid"]',
    });
    await captureView({
      slug: '16_lms_quiz_attempt_mobile',
      pillar: 'LMS Learner Continuation',
      uc: 'UCV2-21',
      actorLabel: 'HV (Enrolled Learner)',
      path: `/classroom/${ctx.ids.enrolledClassId}/quiz-attempts/${ctx.ids.quizAttemptId}`,
      expectedMarkers: [
        'Quiz 1.3: Part 5 Word Families Check (4 Items)',
        'Câu 1 / 4',
        'Mở danh sách câu hỏi',
      ],
      width: 390,
      height: 844,
    });
    await captureView({
      slug: '17_lms_gradebook_published_scores_desktop',
      pillar: 'LMS Learner Continuation',
      uc: 'UCV2-22',
      actorLabel: 'HV (Enrolled Learner)',
      path: `/classroom/${ctx.ids.enrolledClassId}/gradebook`,
      expectedMarkers: [
        'Assignment 1.2: Professional Email Reply to Workshop Inquiry',
        '9.00',
        '10.00',
        'Word Forms: 1/4 câu đúng — nên ôn kiến thức này',
      ],
      width: 1440,
      height: 900,
    });
    await captureView({
      slug: '18_lms_class_progress_desktop',
      pillar: 'LMS Learner Continuation',
      uc: 'UCV2-23',
      actorLabel: 'HV (Enrolled Learner)',
      path: `/classroom/${ctx.ids.enrolledClassId}/progress`,
      expectedMarkers: [
        'Hoạt động và kết quả của tôi',
        'Lesson 1.1: Word Families & Adverb Placement in Workplace Notices',
        'Assignment 1.2: Professional Email Reply to Workshop Inquiry',
        'Quiz 1.3: Part 5 Word Families Check (4 Items)',
      ],
      width: 1440,
      height: 900,
    });
    await captureView({
      slug: '19_lms_knowledge_recommendations_desktop',
      pillar: 'LMS Learner Continuation',
      uc: 'UCV2-24',
      actorLabel: 'HV (Enrolled Learner)',
      path: '/knowledge',
      expectedMarkers: [
        'Thư viện kiến thức TOEIC',
        'Word Forms',
        'Phiên bản 1 · Word Forms / Part 5',
        'Identify the missing word class',
      ],
      width: 1440,
      height: 900,
    });
    await captureView({
      slug: '20_lms_completion_readiness_desktop',
      pillar: 'LMS Learner Continuation',
      uc: 'UCV2-28',
      actorLabel: 'HV (Enrolled Learner)',
      path: '/completion',
      expectedMarkers: [
        'Điều kiện và chứng chỉ',
        'Chờ chính sách và xác minh học vụ',
        'Tải chứng chỉ — chưa khả dụng',
      ],
      width: 1440,
      height: 900,
    });

    const summary = {
      executedAtUtc: new Date().toISOString(),
      browserBinary: chromeBin,
      totalCaptures: captures.length,
      allZeroOverflow: captures.every((c) => c.overflow === false),
      apiResponsesObserved: networkStatuses.length,
      api5xxObserved: networkStatuses.filter((n) => n.status >= 500).length,
      captures,
    };

    await writeFile(
      join(outDir, 'ARGON_WAVE01_BROWSER_E2E_PROOFS.json'),
      JSON.stringify(summary, null, 2),
      'utf8',
    );
    return summary;
  } finally {
    try {
      socket?.close();
    } catch {
      // ignore
    }
    if (proc && !proc.killed) {
      try {
        proc.kill('SIGKILL');
      } catch {
        // ignore
      }
    }
    await webServer.close().catch(() => {});
    await delay(300);
    await rm(userDataDir, { recursive: true, force: true }).catch(() => {});
  }
}
