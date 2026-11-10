// Screenshots of /resistor/main from the installed Edge (or Chrome), for looking at a change.
//   node shots.mjs <folder> [base URL]        (npm run shots -- <folder>)
// The dev server must be running (npm run dev in the repo root, port 3020). Pictures are written to the folder given,
// which must be outside the repo: 390 px and 1440 px wide, light and dark, at most about 1,000 px wide.

import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { chromium } from 'playwright-core';

const folder = process.argv[2];
const base = process.argv[3] ?? 'http://localhost:3020';
if (!folder) {
  console.error('Usage: node shots.mjs <folder outside the repo> [base URL]');
  process.exit(1);
}
mkdirSync(folder, { recursive: true });

// name, query string. More cases can be given as extra arguments: name=query.
const cases = [['empty', ''], ['4k7', '?q=4k7'], ['101', '?q=101']];
for (const extra of process.argv.slice(4)) {
  const at = extra.indexOf('=');
  cases.push([extra.slice(0, at), `?${extra.slice(at + 1)}`]);
}
const widths = [[390, 844, 2], [1440, 900, 1000 / 1440]];

let browser;
for (const channel of ['msedge', 'chrome']) {
  try { browser = await chromium.launch({ channel }); break; } catch { /* Try the next browser. */ }
}
if (!browser) {
  console.error('Neither Edge nor Chrome could be started.');
  process.exit(1);
}

const problems = [];
let count = 0;
for (const [width, height, deviceScaleFactor] of widths) {
  for (const colorScheme of ['light', 'dark']) {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor, colorScheme });
    const page = await context.newPage();
    page.on('pageerror', (error) => problems.push(`${width} ${colorScheme}: ${error.message}`));
    page.on('console', (message) => { if (message.type() === 'error') problems.push(`${width} ${colorScheme}: ${message.text()}`); });
    for (const [name, query] of cases) {
      await page.goto(`${base}/resistor/main${query}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(250);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (overflow > 0) problems.push(`${width} ${colorScheme} ${name}: the page is ${overflow} px wider than the window`);
      await page.screenshot({ path: join(folder, `${name}-${width}-${colorScheme}.png`), fullPage: true });
      count++;
    }
    await context.close();
  }
}
await browser.close();
for (const problem of problems) console.log(`PROBLEM ${problem}`);
console.log(`${count} screenshots in ${resolve(folder)}${problems.length ? `, ${problems.length} problems` : ''}`);
