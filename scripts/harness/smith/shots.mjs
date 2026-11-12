// Screenshots of /smith-chart/main at 390, 768 and 1440 px in both themes, downscaled to at most 1000 px wide, for
// looking at a page step (never written to the repo). Usage: tsx shots.mjs <folder> [zoom] [Γr,Γi] [widths]
// e.g. `tsx shots.mjs %TEMP%\shots` or `tsx shots.mjs out 3 0.3,0.25 390`. Needs the dev server on port 3020.

import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { chromium } from 'playwright-core';

const out = resolve(process.argv[2] ?? 'shots');
const zoom = Number(process.argv[3] ?? 1);
const [cx, cy] = (process.argv[4] ?? '0,0').split(',').map(Number);
const widths = (process.argv[5] ?? '390,768,1440').split(',').map(Number);
const base = process.env.SMITH_URL ?? 'http://localhost:3020';
mkdirSync(out, { recursive: true });

let browser;
for (const channel of ['msedge', 'chrome']) {
  try { browser = await chromium.launch({ channel }); break; } catch { /* Try the next browser. */ }
}
if (!browser) throw new Error('No Edge or Chrome found');

for (const width of widths) {
  for (const scheme of ['light', 'dark']) {
    const context = await browser.newContext({
      viewport: { width, height: width < 600 ? 844 : width < 1000 ? 1024 : 900 },
      deviceScaleFactor: Math.min(1, 1000 / width), colorScheme: scheme, hasTouch: width < 600, isMobile: width < 600,
    });
    const page = await context.newPage();
    await page.goto(`${base}/smith-chart/main`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.querySelector('[data-chart]')?.smithChart);
    await page.evaluate(([z, x, y]) => {
      const v = document.querySelector('[data-chart]').smithChart;
      v.setView(x, y, v.kFit * z);
      v.setRead(x + 0.11 / z, y + 0.07 / z);
    }, [zoom, cx, cy]);
    await page.waitForTimeout(300);
    const name = `${width}-${scheme}${zoom !== 1 ? `-z${zoom}` : ''}.png`;
    await page.screenshot({ path: join(out, name), fullPage: true });
    console.log(join(out, name));
    await context.close();
  }
}
await browser.close();
