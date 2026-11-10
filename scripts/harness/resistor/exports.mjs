// Saves sample drawings with the page's own export buttons, for looking at what a visitor gets.
//   node exports.mjs <folder outside the repo> [base URL]        (npm run exports -- <folder>)
// The dev server must be running (port 3020). Four files: an axial resistor (realistic PNG, flat SVG) and a 0603 chip
// (realistic PNG, flat SVG), 1200 px wide.

import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { chromium } from 'playwright-core';

const folder = process.argv[2];
const base = process.argv[3] ?? 'http://localhost:3020';
if (!folder) { console.error('Usage: node exports.mjs <folder outside the repo> [base URL]'); process.exit(1); }
mkdirSync(folder, { recursive: true });

let browser;
for (const channel of ['msedge', 'chrome']) {
  try { browser = await chromium.launch({ channel }); break; } catch { /* Try the next browser. */ }
}
if (!browser) { console.error('Neither Edge nor Chrome could be started.'); process.exit(1); }

// query, style, format, background
const samples = [
  ['q=4k7', 'Realistic', 'PNG', 'None'],
  ['q=49k9&tol=1&coat=blue', 'Flat', 'SVG', 'White'],
  ['q=49k9&tol=1&part=chip&size=0603', 'Realistic', 'PNG', 'White'],
  ['q=4k7&part=chip&size=1206', 'Flat', 'SVG', 'None'],
];
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
const page = await context.newPage();
const names = [];
for (const [query, style, format, background] of samples) {
  await page.goto(`${base}/resistor/main?${query}`, { waitUntil: 'networkidle' });
  await page.getByRole('radiogroup', { name: 'Style of the drawing' }).first().getByRole('radio', { name: style }).click();
  await page.getByRole('radiogroup', { name: 'Background' }).getByRole('radio', { name: background }).click();
  await page.getByRole('spinbutton', { name: 'Width in pixels' }).fill('1200');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: format, exact: true }).first().click()]);
  const name = download.suggestedFilename().replace(/\.(\w+)$/, `-${style.toLowerCase()}.$1`);
  await download.saveAs(join(folder, name));
  names.push(name);
}
await page.evaluate(() => localStorage.removeItem('resistor.style'));
await browser.close();
console.log(`${names.length} exports in ${resolve(folder)}: ${names.join(', ')}`);
