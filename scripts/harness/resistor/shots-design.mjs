// Screenshots of the Design section of /resistor/main (and of the opened Combinations result at phone width), each
// cropped to the section, for looking at a change.
//   node shots-design.mjs <folder outside the repo> [base URL]
// The dev server must be running (npm run dev in the repo root, port 3020).

import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { chromium } from 'playwright-core';

const folder = process.argv[2];
const base = process.argv[3] ?? 'http://localhost:3020';
if (!folder) {
  console.error('Usage: node shots-design.mjs <folder outside the repo> [base URL]');
  process.exit(1);
}
mkdirSync(folder, { recursive: true });

// name, width, colour scheme, query, the suggestion to open (0: none), what to crop to.
const cases = [
  ['divider-1440-light', 1440, 'light', '?dc=div&dv=5&dt=2.5&dp=2', 1, '#design'],
  ['divider-1440-dark', 1440, 'dark', '?dc=div&dv=5&dt=2.5&dp=2', 1, '#design'],
  ['single-390-light', 390, 'light', '?dd=2.1', 1, '#design'],
  ['ratio-1440-light', 1440, 'light', '?dc=fb&dp=1&dg=2&ds=e24', 0, '#design'],
  ['shunt-1440-light', 1440, 'light', '?dc=sh', 1, '#design'],
  ['combinations-390-light', 390, 'light', '?q=628.75&cs=e24&cv=12', 2, '#combinations ol > li:nth-child(2)'],
];

let browser;
for (const channel of ['msedge', 'chrome']) {
  try { browser = await chromium.launch({ channel }); break; } catch { /* Try the next browser. */ }
}
if (!browser) {
  console.error('Neither Edge nor Chrome could be started.');
  process.exit(1);
}

const problems = [];
for (const [name, width, colorScheme, query, open, crop] of cases) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: width < 600 ? 2 : 1, colorScheme });
  const page = await context.newPage();
  page.on('pageerror', (error) => problems.push(`${name}: ${error.message}`));
  page.on('console', (message) => { if (message.type() === 'error') problems.push(`${name}: ${message.text()}`); });
  await page.goto(`${base}/resistor/main${query}`, { waitUntil: 'networkidle' });
  const section = crop.startsWith('#design') ? '#design' : '#combinations';
  const status = section === '#design' ? 'design-status' : 'search-status';
  await page.waitForFunction(([s, t]) => document.querySelector(`${s} [data-testid=${t}]`)?.getAttribute('data-busy') === 'false', [section, status], { timeout: 20000 });
  if (open) await page.locator(`${section} ol > li`).nth(open - 1).getByRole('button', { name: /^Details/ }).click();
  // The bar at the top stays in view and would lie over the picture; so would the mark of the dev server.
  await page.addStyleTag({ content: 'header, nextjs-portal { visibility: hidden !important; }' });
  await page.waitForTimeout(250);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow > 0) problems.push(`${name}: the page is ${overflow} px wider than the window`);
  await page.locator(crop).first().screenshot({ path: join(folder, `${name}.png`) });
  await context.close();
}
await browser.close();
for (const problem of problems) console.log(`PROBLEM ${problem}`);
console.log(`${cases.length} screenshots in ${resolve(folder)}${problems.length ? `, ${problems.length} problems` : ''}`);
