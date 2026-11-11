// Pictures of the Theory and References sections of /resistor/main, from the installed Edge (or Chrome). The dev
// server must be running (port 3020).
//   node shots-theory.mjs <folder> [base URL]
// Writes theory-1440-light.png (the top part), theory-1440-dark.png (the technologies table to the derating chart),
// theory-390-light.png, references-1440-light.png and page-1440-light.png, about 1,000 px wide at most.

import { mkdirSync } from 'node:fs';
import path from 'node:path';

import { chromium } from 'playwright-core';

const out = process.argv[2];
const base = process.argv[3] ?? 'http://localhost:3020';
if (!out) { console.error('Usage: node shots-theory.mjs <folder> [base URL]'); process.exit(1); }
mkdirSync(out, { recursive: true });

let browser;
for (const channel of ['msedge', 'chrome']) {
  try { browser = await chromium.launch({ channel }); break; } catch { /* Try the next browser. */ }
}
if (!browser) { console.error('Neither Edge nor Chrome could be started.'); process.exit(1); }

async function shots(width, colorScheme, scale, link, take) {
  const context = await browser.newContext({ viewport: { width, height: 1000 }, colorScheme, deviceScaleFactor: scale });
  const page = await context.newPage();
  await page.goto(`${base}/resistor/main${link}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  await take(page);
  await context.close();
}

// The part of the page from the top of one element to the bottom of another (or a height below the first).
async function span(page, from, to, file, height) {
  const a = await page.locator(from).boundingBox();
  const b = to ? await page.locator(to).boundingBox() : null;
  const scroll = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY, w: document.documentElement.clientWidth }));
  const top = a.y + scroll.y - 12;
  await page.screenshot({ path: path.join(out, file), fullPage: true, clip: { x: 0, y: top, width: scroll.w, height: (b ? b.y + b.height + scroll.y + 12 - top : height) } });
}

await shots(1440, 'light', 0.69, '?q=4k7&tol=1&part=chip&size=0603', async (page) => {
  await span(page, '#theory', null, 'theory-1440-light.png', 1750);
  await span(page, '#references', '#references', 'references-1440-light.png');
  await page.screenshot({ path: path.join(out, 'page-1440-light.png'), fullPage: true });
});
await shots(1440, 'dark', 0.69, '?q=4k7&tol=1&part=chip&size=0603', (page) => span(page, '#theory-technologies', '#theory-power', 'theory-1440-dark.png'));
await shots(390, 'light', 2, '?q=4k7&tol=1&part=chip&size=0603', async (page) => {
  for (const id of ['ohm', 'series', 'power']) await page.locator(`#theory-${id} > summary`).click();
  await page.waitForTimeout(200);
  await span(page, '#theory', '#theory', 'theory-390-light.png');
});
await browser.close();
console.log(`5 pictures in ${out}`);
