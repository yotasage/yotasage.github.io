// A contact sheet of the drawings of lib/resistor/draw.ts, for looking at a change without the page.
//   tsx samples.mjs <folder outside the repo>        (npm run samples -- <folder>)
// Writes sheet-light.png and sheet-dark.png: every style, a few band counts, body colours and chip sizes.

import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { chromium } from 'playwright-core';

import * as imported from '../../../lib/resistor/index.ts';

const { drawAxial, drawChip, encodeBands, AXIAL_BODIES, CHIP_SIZES, BODY_COATS } = imported.default ?? imported;

const folder = process.argv[2];
if (!folder) { console.error('Usage: tsx samples.mjs <folder outside the repo>'); process.exit(1); }
mkdirSync(folder, { recursive: true });

const bands = (ohms, count, tolerance, tcr) => encodeBands(ohms, count, tolerance, tcr).bands.map((b) => b.colour);
const cells = [];
let n = 0;
const add = (drawing, wide) => cells.push(`<div style="width:${wide}px">${drawing.svg}</div>`);
for (const style of ['realistic', 'flat']) {
  const o = () => ({ style, id: `s${n++}`, ink: 'currentColor' });
  add(drawAxial(bands(4700, 4, 5), AXIAL_BODIES[1], 'beige', { ...o(), caption: ['4.7 kΩ ±5 %', 'yellow · violet · red · gold', '1/4 W axial, 6.5 × 2.5 mm'] }), 460);
  add(drawAxial(bands(49900, 5, 1), AXIAL_BODIES[1], 'blue', o()), 460);
  add(drawAxial(bands(12300, 6, 0.1, 25), AXIAL_BODIES[2], 'green', o()), 460);
  add(drawAxial(bands(1, 4, 10), AXIAL_BODIES[3], 'grey', o()), 460);
  add(drawAxial(bands(680000, 3), AXIAL_BODIES[0], 'beige', o()), 300);
  add(drawAxial(['black'], AXIAL_BODIES[1], 'beige', o()), 300);
  add(drawAxial(['black', 'brown', 'red', 'orange', 'white'], AXIAL_BODIES[1], 'beige', o()), 300);
  add(drawChip(CHIP_SIZES[4], '472', { ...o(), caption: ['4.7 kΩ ±5 %', 'marking 472', '0805 (2012 metric), 2 × 1.25 mm'] }), 300);
  add(drawChip(CHIP_SIZES[3], '68X', o()), 240);
  add(drawChip(CHIP_SIZES[9], '4701', o()), 300);
  add(drawChip(CHIP_SIZES[6], 'R005', o()), 240);
  add(drawChip(CHIP_SIZES[0], null, o()), 200);
}

let browser;
for (const channel of ['msedge', 'chrome']) {
  try { browser = await chromium.launch({ channel }); break; } catch { /* Try the next browser. */ }
}
if (!browser) { console.error('Neither Edge nor Chrome could be started.'); process.exit(1); }
const page = await browser.newPage({ viewport: { width: 1500, height: 800 } });
for (const [name, bg, ink] of [['light', '#f6f4ee', '#55524b'], ['dark', '#141513', '#b7b4ab']]) {
  await page.setContent(`<body style="margin:0;padding:20px;background:${bg};color:${ink};display:flex;flex-wrap:wrap;gap:24px;align-items:center">${cells.join('')}</body>`);
  await page.screenshot({ path: join(folder, `sheet-${name}.png`), fullPage: true });
}
await browser.close();
console.log(`2 contact sheets of ${BODY_COATS.length} body colours and ${cells.length} drawings in ${resolve(folder)}`);
