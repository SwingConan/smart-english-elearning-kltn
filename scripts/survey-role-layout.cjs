'use strict';
const path = require('node:path');
const fs = require('node:fs');
const ROOT = path.resolve(__dirname, '..');
const { chromium } = require(path.resolve('.local-storage/se-sw-01/consolidated-fix-01/browser-tools/node_modules/playwright-core'));

const SCREENSHOT_DIR = 'C:\\Users\\Admin\\.gemini\\antigravity\\brain\\3631eebd-02bd-461a-bd5a-daaff0f01125\\screenshots';
const BASE_URL = 'http://127.0.0.1:3040';

const file = path.join(process.env.LOCALAPPDATA, 'SmartEnglish/BR136/GeminiLiveOneShot/fixture-demo-accounts.json');
const accountsData = JSON.parse(fs.readFileSync(file, 'utf8')).accounts;

const fixtureFile = path.join(ROOT, '.local-storage/br136-working-demo/learning-fixture.private.json');
const fixture = fs.existsSync(fixtureFile) ? JSON.parse(fs.readFileSync(fixtureFile, 'utf8')) : {};

const ROLES_TO_SURVEY = [
  {
    role: 'STUDENT',
    email: 'w02-contender-fa36f73d-5bf4-45f4-8c0d-de767699162b-1@example.invalid',
    password: '7bd3hGoDY7fJ8Jge8-zrpPvIeMKhrUI-derqz40KqZrnLFFa',
    routes: [
      { name: 'student_dashboard', path: '/my' },
      { name: 'student_enrollments', path: '/student/enrollments' },
      { name: 'student_classroom', path: fixture.classId ? `/classroom/${fixture.classId}` : '/my' },
      { name: 'student_sepay', path: '/payments/sepay' },
      { name: 'student_completion', path: '/completion' },
    ]
  },
  {
    role: 'INSTRUCTOR',
    email: 'wave01-4f057faf-9d1d-46c2-8764-94a311a9d7a1-1@example.invalid',
    password: 'iR8noPsSWW3TX8VtpDa2TmWya2igBLKBo70d4fZhTRrdGuU2',
    routes: [
      { name: 'instructor_teaching', path: '/instructor/teaching' },
      { name: 'instructor_classroom', path: fixture.classId ? `/classroom/${fixture.classId}` : '/instructor/teaching' },
      { name: 'instructor_roster', path: fixture.classId ? `/instructor/classes/${fixture.classId}/roster` : '/instructor/teaching' },
    ]
  },
  {
    role: 'ACADEMIC_MANAGER',
    email: 'wave01-4f057faf-9d1d-46c2-8764-94a311a9d7a1-3@example.invalid',
    password: 'iGpzjJxnOSPnbcd0TKLFAs3pJOmiwNdv3ZHF_3PKEb31gZ8R',
    routes: [
      { name: 'academic_dashboard', path: '/academic/dashboard' },
      { name: 'academic_classes', path: '/academic/classes' },
      { name: 'academic_programs', path: '/academic/programs' },
      { name: 'academic_consultations', path: '/consultations' },
    ]
  },
  {
    role: 'CASHIER',
    email: 'wave01-4f057faf-9d1d-46c2-8764-94a311a9d7a1-4@example.invalid',
    password: 'bf5QgC2ZwYcY6nQQVgmwfksin04UVMlAGxr7ZzV3AkkZt86F',
    routes: [
      { name: 'cashier_admissions', path: '/workspace/admissions' },
      { name: 'cashier_sepay', path: '/payments/sepay' },
    ]
  },
  {
    role: 'TEACHING_INSPECTOR',
    email: 'wave01-4f057faf-9d1d-46c2-8764-94a311a9d7a1-5@example.invalid',
    password: 'lIOvAyawnwG0oMdbYFiHK9gQ3IYWXDrZQu3wP4C02n_-Ta0z',
    routes: [
      { name: 'inspector_workspace', path: '/workspace/inspection' },
    ]
  },
  {
    role: 'SYSTEM_ADMIN',
    email: 'wave01-4f057faf-9d1d-46c2-8764-94a311a9d7a1-6@example.invalid',
    password: 'a0Wb_61k_qL-u80iM_67yA==_REDACTED_OR_CHECK', // let's find password for -6
    routes: [
      { name: 'admin_authority', path: '/workspace/authority' },
      { name: 'admin_accounts', path: '/admin/accounts' },
      { name: 'admin_reports', path: '/admin/reports' },
    ]
  },
  {
    role: 'COUNSELOR',
    email: 'wave01-4f057faf-9d1d-46c2-8764-94a311a9d7a1-2@example.invalid',
    password: 'njtZpRAzjCW8nGGg6xJvsJhGUmleZy5XcvPgNiK7LAD22MSU',
    routes: [
      { name: 'counselor_support', path: '/workspace/support' },
    ]
  }
];

// Correct password for SYSTEM_ADMIN wave01-4f057faf-9d1d-46c2-8764-94a311a9d7a1-8:
const sysAdminAcc = accountsData.find(a => a.role === 'SYSTEM_ADMIN');
if (sysAdminAcc) {
  const target = ROLES_TO_SURVEY.find(r => r.role === 'SYSTEM_ADMIN');
  target.email = sysAdminAcc.email;
  target.password = sysAdminAcc.password;
}

async function run() {
  const browser = await chromium.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true,
    args: ['--no-first-run', '--disable-background-networking']
  });

  for (const roleDef of ROLES_TO_SURVEY) {
    console.log(`\n=== SURVEYING ROLE: ${roleDef.role} (${roleDef.email}) ===`);
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();

    // Login
    try {
      await page.goto(BASE_URL + '/login', { waitUntil: 'networkidle' });
      await page.locator('input[type=email]').fill(roleDef.email);
      await page.locator('#login-password').fill(roleDef.password);
      await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
      await page.waitForURL(u => !u.pathname.endsWith('/login'), { timeout: 10000 });
      console.log(`  Login success! Landed on: ${page.url()}`);
    } catch (err) {
      console.error(`  Login failed for ${roleDef.role}: ${err.message}`);
      await context.close();
      continue;
    }

    // Now visit routes for this role
    for (const route of roleDef.routes) {
      try {
        await page.goto(BASE_URL + route.path, { waitUntil: 'networkidle' });
        const shotPath = path.join(SCREENSHOT_DIR, `${route.name}_desktop_1440.png`);
        await page.screenshot({ path: shotPath, fullPage: true });

        // Evaluate layout metrics: amber elements, button/text overlap, table widths
        const metrics = await page.evaluate(() => {
          const amber = [];
          for (const el of document.querySelectorAll('*')) {
            const style = window.getComputedStyle(el);
            const bg = style.backgroundColor;
            const rect = el.getBoundingClientRect();
            const m = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
            if (m) {
              const [, r, g, b] = m.map(Number);
              const isAmber = (r > 200 && g > 100 && g < 220 && b < 100) ||
                              (r > 230 && g > 150 && g < 230 && b < 180) ||
                              (r > 240 && g > 200 && b < 150);
              if (isAmber && rect.width > 200 && rect.height > 60) {
                amber.push({
                  tag: el.tagName,
                  text: (el.textContent || '').trim().slice(0, 100),
                  width: Math.round(rect.width),
                  height: Math.round(rect.height),
                  className: el.className
                });
              }
            }
          }

          // Check for button or component overlapping text
          const overlaps = [];
          const buttons = Array.from(document.querySelectorAll('button, a.btn-primary, a.btn-secondary'));
          const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, p, span, th, td'));
          for (const btn of buttons) {
            const bRect = btn.getBoundingClientRect();
            if (bRect.width === 0 || bRect.height === 0) continue;
            for (const h of headings) {
              if (btn.contains(h) || h.contains(btn)) continue;
              const hRect = h.getBoundingClientRect();
              if (hRect.width === 0 || hRect.height === 0) continue;
              // Check intersection
              const xOverlap = Math.max(0, Math.min(bRect.right, hRect.right) - Math.max(bRect.left, hRect.left));
              const yOverlap = Math.max(0, Math.min(bRect.bottom, hRect.bottom) - Math.max(bRect.top, hRect.top));
              if (xOverlap > 10 && yOverlap > 10) {
                overlaps.push({
                  buttonText: (btn.textContent || '').trim().slice(0, 40),
                  targetText: (h.textContent || '').trim().slice(0, 40),
                  overlapArea: Math.round(xOverlap * yOverlap)
                });
              }
            }
          }

          // Check tables
          const tables = Array.from(document.querySelectorAll('table')).map(t => {
            const rect = t.getBoundingClientRect();
            const parent = t.parentElement;
            const pRect = parent.getBoundingClientRect();
            return {
              tableWidth: Math.round(rect.width),
              containerWidth: Math.round(pRect.width),
              hasContainerOverflow: t.scrollWidth > parent.clientWidth,
              thCount: t.querySelectorAll('th').length,
              rowCount: t.querySelectorAll('tr').length,
            };
          });

          return { amber, overlaps: overlaps.slice(0, 5), tables };
        });

        if (metrics.amber.length) {
          console.log(`  [AMBER AREAS in ${route.name}]:`);
          metrics.amber.forEach(a => console.log(`    - <${a.tag}> ${a.width}x${a.height}: "${a.text}"`));
        }
        if (metrics.overlaps.length) {
          console.log(`  [OVERLAPS in ${route.name}]:`);
          metrics.overlaps.forEach(o => console.log(`    - Button "${o.buttonText}" overlaps "${o.targetText}" (area: ${o.overlapArea}px)`));
        }
        if (metrics.tables.length) {
          console.log(`  [TABLES in ${route.name}]: count: ${metrics.tables.length}`);
          metrics.tables.forEach(t => console.log(`    - width: ${t.tableWidth}px, container: ${t.containerWidth}px, overflowScroll: ${t.hasContainerOverflow}, cols: ${t.thCount}, rows: ${t.rowCount}`));
        }

        // Also mobile snapshot
        await page.setViewportSize({ width: 390, height: 844 });
        const shotPathMobile = path.join(SCREENSHOT_DIR, `${route.name}_mobile_390.png`);
        await page.screenshot({ path: shotPathMobile, fullPage: true });

        // Restore viewport
        await page.setViewportSize({ width: 1440, height: 900 });

      } catch (err) {
        console.error(`  Error on ${route.name}: ${err.message}`);
      }
    }

    await context.close();
  }

  await browser.close();
  console.log('\n=== ALL ROLE SURVEYS COMPLETED ===');
}

run().catch(console.error);
