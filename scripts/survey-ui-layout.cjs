'use strict';
const path = require('node:path');
const fs = require('node:fs');
const ROOT = path.resolve(__dirname, '..');
const { chromium } = require(path.resolve('.local-storage/se-sw-01/consolidated-fix-01/browser-tools/node_modules/playwright-core'));

const SCREENSHOT_DIR = 'C:\\Users\\Admin\\.gemini\\antigravity\\brain\\3631eebd-02bd-461a-bd5a-daaff0f01125\\screenshots';
const BASE_URL = 'http://127.0.0.1:3040';

async function run() {
  const browser = await chromium.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true,
    args: ['--no-first-run', '--disable-background-networking']
  });

  const publicRoutes = [
    { name: 'home', path: '/' },
    { name: 'catalog', path: '/catalog' },
    { name: 'placement', path: '/placement' },
    { name: 'guide', path: '/guide' },
    { name: 'about', path: '/about' },
    { name: 'contact', path: '/contact' },
    { name: 'login', path: '/login' },
  ];

  console.log('=== 1. SURVEYING PUBLIC ROUTES ===');
  for (const route of publicRoutes) {
    // Desktop 1440
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await page.goto(BASE_URL + route.path, { waitUntil: 'networkidle' });
    const shotPathDesktop = path.join(SCREENSHOT_DIR, `${route.name}_desktop_1440.png`);
    await page.screenshot({ path: shotPathDesktop, fullPage: true });

    // Check amber / orange elements
    const amberElements = await page.evaluate(() => {
      const all = Array.from(document.querySelectorAll('*'));
      return all
        .filter(el => {
          const style = window.getComputedStyle(el);
          const bg = style.backgroundColor;
          const rect = el.getBoundingClientRect();
          // Check for amber / orange (rgb with high red, medium green, low blue)
          const m = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
          if (m) {
            const [, r, g, b] = m.map(Number);
            const isOrangeAmber = (r > 200 && g > 100 && g < 220 && b < 100) ||
                                  (r > 230 && g > 150 && g < 230 && b < 180) ||
                                  (r > 240 && g > 200 && b < 150); // amber-50 / orange-50
            if (isOrangeAmber && rect.width > 200 && rect.height > 60) {
              return true;
            }
          }
          return false;
        })
        .map(el => {
          const rect = el.getBoundingClientRect();
          return {
            tag: el.tagName,
            className: el.className,
            textSnippet: (el.textContent || '').trim().slice(0, 100),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            area: Math.round(rect.width * rect.height),
          };
        });
    });

    if (amberElements.length) {
      console.log(`[ORANGE/AMBER DETECTED] ${route.name} (${amberElements.length} elements):`);
      amberElements.forEach(e => console.log(`  - <${e.tag}> ${e.width}x${e.height} (area: ${e.area}): "${e.textSnippet}" [${e.className.slice(0, 60)}]`));
    }

    // Check horizontal scroll / overflow
    const hasHScroll = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    if (hasHScroll) console.log(`[H-OVERFLOW] Desktop ${route.name} has horizontal overflow!`);

    await context.close();

    // Mobile 390
    const mContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const mPage = await mContext.newPage();
    await mPage.goto(BASE_URL + route.path, { waitUntil: 'networkidle' });
    const shotPathMobile = path.join(SCREENSHOT_DIR, `${route.name}_mobile_390.png`);
    await mPage.screenshot({ path: shotPathMobile, fullPage: true });
    const mHasHScroll = await mPage.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    if (mHasHScroll) console.log(`[H-OVERFLOW] Mobile ${route.name} has horizontal overflow!`);
    await mContext.close();
  }

  await browser.close();
  console.log('Public route survey completed.');
}

run().catch(console.error);
