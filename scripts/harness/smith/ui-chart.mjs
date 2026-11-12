// Drives /smith-chart/main in the installed Edge (or Chrome) and checks the chart's interaction (step M2.2): the
// readout at 20 points placed by the mouse, parsed back and compared with lib/smith/convert.ts to the digits shown;
// wheel zoom keeps the Γ under the pointer; drag pans by the pointer's delta; keyboard pan, zoom and fit with a focus
// ring; the Fit and Reset buttons; zoom limits; the mode switch keeps the view; touch by CDP Input.dispatchTouchEvent
// at 390 px (a pinch zooms the chart and not the page, one finger up the chart scrolls the page, a tap places the
// readout, one finger sideways pans); frame times while zooming continuously for 2 s at 1× and with the CPU 4×
// throttled; no horizontal scroll at 320 px. Uses the dev server on port 3020 if it runs, else starts one.
//   tsx ui-chart.mjs [screenshot folder] [base URL]      (the second half of npm run ui)

import { spawn, execSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright-core';

import * as importedConvert from '../../../lib/smith/convert.ts';

const cv = importedConvert.default ?? importedConvert;
const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../../..');
const shots = process.argv[2] && process.argv[2] !== '-' ? process.argv[2] : null;
const base = process.argv[3] ?? 'http://localhost:3020';

const up = async () => { try { return (await fetch(`${base}/smith-chart/main`)).ok; } catch { return false; } };
let server = null;
const agentsBefore = existsSync(join(repo, 'AGENTS.md'));
if (!(await up())) {
  server = spawn('npm', ['run', 'dev'], { cwd: repo, shell: true, stdio: 'ignore' });
  const until = Date.now() + 180000;
  while (!(await up())) {
    if (Date.now() > until) { console.error('The dev server did not start.'); process.exit(1); }
    await new Promise((r) => setTimeout(r, 1000));
  }
}
const stopServer = () => {
  if (server) {
    try { execSync(process.platform === 'win32' ? `taskkill /pid ${server.pid} /T /F` : `kill ${server.pid}`, { stdio: 'ignore' }); } catch { /* gone */ }
  }
  if (!agentsBefore && existsSync(join(repo, 'AGENTS.md'))) rmSync(join(repo, 'AGENTS.md'));
};

let browser;
for (const channel of ['msedge', 'chrome']) {
  try { browser = await chromium.launch({ channel }); break; } catch { /* Try the next browser. */ }
}
if (!browser) { console.error('Neither Edge nor Chrome could be started.'); stopServer(); process.exit(1); }

let passed = 0;
const failures = [];
let failed = 0;
const ok = (condition, what) => { if (condition) passed++; else if (failed++ < 60) failures.push(what); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const frame = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

async function open(context) {
  const page = await context.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') page.errors.push(m.text()); });
  await page.goto(`${base}/smith-chart/main`, { waitUntil: 'networkidle' });
  await page.waitForSelector('svg[data-level]');
  await frame(page);
  return page;
}

// The controller's view and the box's content origin in client px.
const state = (page) => page.evaluate(() => {
  const box = document.querySelector('[data-chart]'), v = box.smithChart, r = box.getBoundingClientRect();
  return { cx: v.cx, cy: v.cy, k: v.k, w: v.w, h: v.h, kFit: v.kFit, readX: v.readX, readY: v.readY, frames: v.frames,
    left: r.left + box.clientLeft, top: r.top + box.clientTop, scrollY: window.scrollY, scale: window.visualViewport.scale };
});
// Γ at client px (x, y) by the view, computed here.
const gammaAt = (s, x, y) => [s.cx + (x - s.left - s.w / 2) / s.k, s.cy - (y - s.top - s.h / 2) / s.k];
const clientOf = (s, gr, gi) => [s.left + s.w / 2 + (gr - s.cx) * s.k, s.top + s.h / 2 - (gi - s.cy) * s.k];
const setView = (page, cx, cy, zoom) => page.evaluate(([a, b, z]) => { const v = document.querySelector('[data-chart]').smithChart; v.setView(a, b, v.kFit * z); }, [cx, cy, zoom]).then(() => frame(page));
const texts = (page) => page.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-field]')].map((e) => [e.dataset.field, e.textContent])));

// ---------- parsing the readout back ----------

const PREFIX = { f: 1e-15, p: 1e-12, n: 1e-9, 'µ': 1e-6, m: 1e-3, '': 1, k: 1e3, M: 1e6, G: 1e9, T: 1e12 };
function amount(text, unit) {
  let t = text.trim(), scale = 1;
  if (unit) {
    if (!t.endsWith(unit)) return NaN;
    t = t.slice(0, -unit.length).trimEnd();
    if (unit !== 'dB' && t.length && t[t.length - 1] in PREFIX) { scale = PREFIX[t[t.length - 1]]; t = t.slice(0, -1).trimEnd(); }
  }
  const m = /^(−?)(∞|\d+(?:\.\d+)?(?:e[+-]?\d+)?)$/.exec(t);
  if (!m) return NaN;
  const v = m[2] === '∞' ? Infinity : Number(m[2]) * scale;
  return m[1] ? -v : v;
}
function complexOf(text, unit) {
  const m = /^(.*) ([+−]) j(.*)$/.exec(text);
  if (!m) return [amount(text, unit), 0];
  const im = amount(m[3], unit);
  return [amount(m[1], unit), m[2] === '−' ? -im : im];
}
// Shown with 4 significant digits: within half a unit of the fourth digit of the true value.
const near = (shown, truth) => (Math.abs(truth) === Infinity ? shown === truth
  : truth === 0 ? shown === 0 : Math.abs(shown - truth) <= 0.5 * 10 ** (Math.floor(Math.log10(Math.abs(truth))) - 3) * (1 + 1e-9));

const scratch = new Float64Array(2);
function expected(gr, gi) {
  const two = (f, ...a) => { f(scratch, 0, ...a); return [scratch[0], scratch[1]]; };
  const mag = cv.gammaMag(gr, gi);
  return { z: two(cv.zFromGamma, gr, gi), Z: two(cv.impedanceFromGamma, gr, gi, 50), y: two(cv.yFromGamma, gr, gi),
    Y: two(cv.admittanceFromGamma, gr, gi, 50), mag, deg: cv.toDegrees(cv.gammaAngle(gr, gi)), vswr: cv.vswr(mag), rl: cv.returnLoss(mag) };
}

// ---------- desktop: readout, wheel, pan, keyboard, buttons ----------

const light = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: 'light' });
const page = await open(light);
let s = await state(page);
ok(Math.abs(s.k - s.kFit) < 1e-12 && s.cx === 0 && s.cy === 0, `the page opens on the whole chart: ${JSON.stringify(s)}`);
ok((await texts(page)).z === '–', 'no readout before a point is read');

let seed = 7;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const targets = [[0, 0], [0.5, 0.3], [-0.5, -0.4], [0.9, 0], [-0.9, 0.1], [0, 0.95], [0.3, -0.8], [1.05, 0.2]];
while (targets.length < 20) { const r = Math.sqrt(rnd()) * 0.99, a = rnd() * 2 * Math.PI; targets.push([r * Math.cos(a), r * Math.sin(a)]); }
let readChecks = 0;
for (const [tr, ti] of targets) {
  const [fx, fy] = clientOf(s, tr, ti), x = Math.round(fx), y = Math.round(fy);
  await page.mouse.move(x, y);
  await frame(page);
  const st = await state(page), [gr, gi] = gammaAt(st, x, y), t = await texts(page), e = expected(gr, gi);
  const what = `readout at Γ = ${gr.toFixed(4)} ${gi.toFixed(4)}`;
  ok(Math.abs(st.readX - gr) < 1e-9 && Math.abs(st.readY - gi) < 1e-9, `${what}: the read point is under the pointer (${st.readX}, ${st.readY})`);
  const pairs = [['z', '', e.z], ['Z', 'Ω', e.Z], ['y', '', e.y], ['Y', 'S', e.Y], ['gammaRect', '', [gr, gi]]];
  for (const [field, unit, [re, im]] of pairs) {
    const [a, b] = complexOf(t[field], unit);
    ok(near(a, re) && near(b, im), `${what}: ${field} "${t[field]}" vs ${re} ${im}`);
  }
  const pol = /^(.*) ∠ (.*)°$/.exec(t.gamma);
  ok(pol && near(amount(pol[1], ''), e.mag) && near(amount(pol[2], ''), e.deg), `${what}: Γ "${t.gamma}" vs ${e.mag} ∠ ${e.deg}`);
  ok(near(amount(t.vswr, ''), e.vswr), `${what}: VSWR "${t.vswr}" vs ${e.vswr}`);
  ok(near(amount(t.rl, 'dB'), e.rl), `${what}: return loss "${t.rl}" vs ${e.rl}`);
  ok(Object.values(t).every((v) => !/NaN|undefined|Infinity/.test(v)), `${what}: no NaN in ${JSON.stringify(t)}`);
  ok(e.mag > 1 ? /outside the chart/.test(t.note) : t.note === '', `${what}: note "${t.note}"`);
  const marker = await page.locator('[data-part=read]').boundingBox();
  ok(marker && Math.abs(marker.x + marker.width / 2 - x) < 0.6 && Math.abs(marker.y + marker.height / 2 - y) < 0.6, `${what}: the marker sits on the point`);
  readChecks++;
}

// wheel zoom about the pointer
await setView(page, 0.2, -0.1, 1.5);
s = await state(page);
const wx = Math.round(s.left + s.w / 2 + 130), wy = Math.round(s.top + s.h / 2 - 90);
await page.mouse.move(wx, wy);
await frame(page);
for (const dy of [-100, -100, -250, 120, -40]) {
  const before = await state(page), g0 = gammaAt(before, wx, wy);
  await page.mouse.wheel(0, dy);
  await frame(page);
  const after = await state(page), g1 = gammaAt(after, wx, wy);
  ok(Math.abs(g1[0] - g0[0]) < 1e-6 && Math.abs(g1[1] - g0[1]) < 1e-6, `wheel ${dy}: the Γ under the pointer stays (${g0} → ${g1})`);
  ok(Math.abs(after.k / before.k - Math.exp(-dy * 0.002)) < 1e-9, `wheel ${dy}: zoom factor ${after.k / before.k}`);
  ok(after.scrollY === before.scrollY, `wheel ${dy}: the page does not scroll`);
}
for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, -2000); await frame(page); }
s = await state(page);
ok(Math.abs(s.k / s.kFit - 1024) < 1e-9, `zoom stops at 1024×: ${s.k / s.kFit}`);
for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, 2000); await frame(page); }
s = await state(page);
ok(Math.abs(s.k / s.kFit - 1) < 1e-12, `zoom stops at 1×: ${s.k / s.kFit}`);

// drag to pan
await setView(page, 0.1, 0.1, 3);
for (const [dx, dy] of [[120, -45], [-200, 80], [7, 3]]) {
  const before = await state(page);
  const x0 = Math.round(before.left + before.w / 2 - 20), y0 = Math.round(before.top + before.h / 2 + 10);
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  await page.mouse.move(x0 + dx, y0 + dy, { steps: 6 });
  await page.mouse.up();
  await frame(page);
  const after = await state(page);
  ok(Math.abs(after.cx - (before.cx - dx / before.k)) < 1e-9 && Math.abs(after.cy - (before.cy + dy / before.k)) < 1e-9 && after.k === before.k,
    `drag ${dx}, ${dy}: pans by the pointer delta (${after.cx - before.cx}, ${after.cy - before.cy})`);
}

// keyboard: focus by Tab, the ring, arrows, + −, 0
let focused = false;
await page.mouse.move(5, 5);
// Tab from the top of the page (from M3.1 the side panel after the chart has many fields, so no wrap-around).
await page.evaluate(() => { document.querySelector('header a')?.focus(); });
for (let i = 0; i < 12 && !focused; i++) {
  await page.keyboard.press('Tab');
  focused = await page.evaluate(() => document.activeElement?.hasAttribute('data-chart'));
}
ok(focused, 'the chart is reached with Tab');
ok(/inset/.test(await page.evaluate(() => getComputedStyle(document.activeElement).boxShadow)), 'a visible focus ring on the chart');
await setView(page, 0, 0, 2);
const key = async (k, check, what) => {
  const before = await state(page);
  await page.keyboard.press(k);
  await frame(page);
  const after = await state(page);
  ok(check(before, after), `key ${k}: ${what} ${JSON.stringify([before.cx, before.cy, before.k, after.cx, after.cy, after.k])}`);
  ok(after.readX === after.cx && after.readY === after.cy, `key ${k}: the readout shows the centre`);
};
const step = (st) => 0.1 * Math.min(st.w, st.h) / st.k;
await key('ArrowRight', (a, b) => Math.abs(b.cx - a.cx - step(a)) < 1e-12 && b.cy === a.cy, 'pans right');
await key('ArrowUp', (a, b) => Math.abs(b.cy - a.cy - step(a)) < 1e-12 && b.cx === a.cx, 'pans up');
await key('ArrowLeft', (a, b) => Math.abs(a.cx - b.cx - step(a)) < 1e-12, 'pans left');
await key('ArrowDown', (a, b) => Math.abs(a.cy - b.cy - step(a)) < 1e-12, 'pans down');
await key('+', (a, b) => Math.abs(b.k / a.k - Math.SQRT2) < 1e-12 && Math.abs(b.cx - a.cx) < 1e-12, 'zooms in about the centre');
await key('-', (a, b) => Math.abs(a.k / b.k - Math.SQRT2) < 1e-12, 'zooms out');
await key('0', (a, b) => b.k === b.kFit && b.cx === 0 && b.cy === 0, 'fits');
await key('+', (a, b) => b.k > a.k, 'zooms in');
await key('Home', (a, b) => b.k === b.kFit && b.cx === 0, 'fits');

// buttons, the mode switch
await setView(page, 0.3, 0.2, 4);
await page.getByRole('radio', { name: 'Y', exact: true }).check();
await frame(page);
s = await state(page);
ok(s.cx === 0.3 && s.cy === 0.2 && Math.abs(s.k / s.kFit - 4) < 1e-12, 'the mode switch keeps the view');
await page.getByRole('radio', { name: 'Z', exact: true }).check();
await page.getByRole('button', { name: 'Fit' }).click();
await frame(page);
s = await state(page);
ok(s.k === s.kFit && s.cx === 0 && s.cy === 0, 'Fit shows the whole chart');
await setView(page, 0.3, 0.2, 4);
await page.getByRole('button', { name: 'Reset' }).click();
await frame(page);
s = await state(page);
const tReset = await texts(page);
ok(s.k === s.kFit && Number.isNaN(s.readX) && tReset.z === '–' && tReset.note === '', 'Reset: the whole chart and no readout');
ok(await page.locator('[data-part=read]').getAttribute('display') === 'none', 'Reset hides the marker');
ok(page.errors.length === 0, `no errors in the console: ${page.errors.join(' | ')}`);

// ---------- frame time while zooming continuously ----------

async function timing(pg, rate) {
  const cdp = await pg.context().newCDPSession(pg);
  await cdp.send('Performance.enable');
  await cdp.send('Emulation.setCPUThrottlingRate', { rate });
  await pg.evaluate(() => document.querySelector('[data-chart]').smithChart.setView(0.2, 0.1, 0));
  await frame(pg);
  const task = async () => (await cdp.send('Performance.getMetrics')).metrics.find((m) => m.name === 'TaskDuration').value;
  const t0 = await task();
  const r = await pg.evaluate(() => new Promise((done) => {
    const box = document.querySelector('[data-chart]'), v = box.smithChart, rect = box.getBoundingClientRect();
    const x = rect.left + rect.width * 0.62, y = rect.top + rect.height * 0.4;
    const stamps = [], works = [], f0 = v.frames, b0 = v.grid.builds, w0 = v.workMs;
    let seen = v.frames, events = 0;
    const start = performance.now();
    const tick = (t) => {
      stamps.push(t);
      if (v.frames !== seen) { works.push(v.lastWorkMs); seen = v.frames; }
      if (t - start < 2000) requestAnimationFrame(tick);
      else done({ stamps, works, frames: v.frames - f0, builds: v.grid.builds - b0, work: v.workMs - w0, events, zoom: v.zoom });
    };
    requestAnimationFrame(tick);
    const send = () => {
      const t = performance.now() - start;
      if (t >= 2000) return;
      box.dispatchEvent(new WheelEvent('wheel', { deltaY: t < 1000 ? -12 : 12, clientX: x, clientY: y, bubbles: true, cancelable: true }));
      events++;
      setTimeout(send, 8);
    };
    send();
  }));
  const t1 = await task();
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  const iv = r.stamps.slice(1).map((t, i) => t - r.stamps[i]).sort((a, b) => a - b);
  const ws = r.works.slice().sort((a, b) => a - b);
  const q = (xs, p) => xs[Math.min(xs.length - 1, Math.floor(p * xs.length))];
  return { rate, ticks: r.stamps.length, frames: r.frames, events: r.events, builds: r.builds, intervalP50: q(iv, 0.5), intervalP95: q(iv, 0.95),
    workP50: q(ws, 0.5), workP95: q(ws, 0.95), mainPerFrame: ((t1 - t0) * 1000) / r.stamps.length };
}
// On a fresh page (the one above has run 300 checks in dev mode), three runs at each rate; the median run counts.
const pt = await open(light);
const times = [];
for (const rate of [1, 4]) {
  const runs = [];
  for (let i = 0; i < 3; i++) runs.push(await timing(pt, rate));
  runs.sort((a, b) => a.mainPerFrame - b.mainPerFrame);
  const t = runs[1];
  t.runs = runs.map((r) => r.mainPerFrame.toFixed(2)).join(', ');
  times.push(t);
  ok(t.frames <= t.ticks + 1 && t.frames > 0.5 * t.ticks, `CPU ${rate}×: one chart update per frame (${t.frames} updates, ${t.ticks} frames, ${t.events} wheel events)`);
  ok(t.builds > 2, `CPU ${rate}×: the grid rebuilt while zooming (${t.builds})`);
  ok(t.intervalP95 <= 17.5, `CPU ${rate}×: frame interval p95 ${t.intervalP95.toFixed(1)} ms`);
  // engine.md §9 splits the 4× frame as chart ≤ 6 ms (3.7–4.3 here with the start circuit since the fix of BL51:
  // notes-M3.2.md, "Fix after M3.2"); dropped frames are checked above.
  ok(rate === 1 || t.mainPerFrame <= 6, `CPU ${rate}×: main thread ${t.mainPerFrame.toFixed(2)} ms per frame`);
}
ok(pt.errors.length === 0, `no errors while zooming: ${pt.errors.join(' | ')}`);

// ---------- touch at 390 px (CDP touch events, as M0.3 d) ----------

const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' });
const pp = await open(phone);
await pp.evaluate(() => { document.body.style.paddingBottom = '1500px'; window.scrollTo(0, 0); });
await frame(pp);
const cdp = await phone.newCDPSession(pp);
const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) });
async function gesture(from, to) {
  await touch('touchStart', from);
  for (let i = 1; i <= 13; i++) {
    await sleep(16);
    await touch('touchMove', from.map(([x, y], j) => [x + ((to[j][0] - x) * i) / 13, y + ((to[j][1] - y) * i) / 13]));
  }
  await sleep(16);
  await touch('touchEnd', []);
  await sleep(250);
  await frame(pp);
}
s = await state(pp);
const mx = Math.round(s.left + s.w / 2), my = Math.round(s.top + s.h / 2);
const gMid = gammaAt(s, mx, my);
await gesture([[mx - 40, my], [mx + 40, my]], [[mx - 120, my], [mx + 120, my]]);
let t = await state(pp);
const gMid1 = gammaAt(t, mx, my);
ok(Math.abs(t.k / s.k - 3) < 0.02, `pinch zooms the chart 3×: ${t.k / s.k}`);
ok(Math.abs(gMid1[0] - gMid[0]) < 1e-6 && Math.abs(gMid1[1] - gMid[1]) < 1e-6, `pinch keeps the Γ between the fingers (${gMid} → ${gMid1})`);
ok(t.scale === 1 && t.scrollY === 0, `pinch does not zoom or scroll the page: scale ${t.scale}, scroll ${t.scrollY}`);
s = t;
await gesture([[mx - 60, my - 30], [mx + 60, my - 30]], [[mx - 20, my + 30], [mx + 100, my + 30]]);
t = await state(pp);
ok(Math.abs(t.k - s.k) / s.k < 1e-9 && Math.abs((s.cx - t.cx) * s.k - 40) < 0.5 && Math.abs((t.cy - s.cy) * s.k - 60) < 0.5 && t.scrollY === 0,
  `two fingers pan the chart: ${(s.cx - t.cx) * s.k}, ${(t.cy - s.cy) * s.k} px`);
s = t;
await gesture([[mx, my + 120]], [[mx, my - 120]]);
t = await state(pp);
ok(t.scrollY >= 60, `one finger up the chart scrolls the page: ${t.scrollY}`);
ok(t.cx === s.cx && t.cy === s.cy && t.k === s.k, `one finger up leaves the view: ${t.cx - s.cx}, ${t.cy - s.cy}`);
await pp.evaluate(() => window.scrollTo(0, 0));
await frame(pp);
s = await state(pp);
await gesture([[mx + 60, my + 40]], [[mx - 60, my + 44]]);
t = await state(pp);
ok(Math.abs((t.cx - s.cx) * s.k - 120) < 20 && t.scrollY === 0, `one finger sideways pans the chart: ${(t.cx - s.cx) * s.k} px`);
s = t;
const tx = mx + 37, ty = my - 51;
await touch('touchStart', [[tx, ty]]);
await sleep(60);
await touch('touchEnd', []);
await sleep(100);
await frame(pp);
t = await state(pp);
const gTap = gammaAt(t, tx, ty);
ok(Math.abs(t.readX - gTap[0]) < 1e-9 && Math.abs(t.readY - gTap[1]) < 1e-9, `a tap places the readout (${t.readX}, ${t.readY} vs ${gTap})`);
ok((await texts(pp)).z !== '–', 'a tap fills the readout');
const sc = await pp.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
ok(sc.sw <= sc.cw, `no horizontal scroll at 390 px: ${sc.sw} > ${sc.cw}`);
ok(pp.errors.length === 0, `no errors on the phone: ${pp.errors.join(' | ')}`);

if (shots) {
  mkdirSync(shots, { recursive: true });
  await pp.evaluate(() => { document.body.style.paddingBottom = ''; });
  await setView(pp, 0.3, 0.15, 3);
  t = await state(pp);
  const [sx, sy] = clientOf(t, 0.42, 0.28);
  await touch('touchStart', [[sx, sy]]);
  await touch('touchEnd', []);
  await frame(pp);
  await pp.screenshot({ path: join(shots, 'chart-390-dark.png'), fullPage: true });
}

// ---------- 320 px ----------

const narrow = await browser.newContext({ viewport: { width: 320, height: 640 }, colorScheme: 'light' });
const pn = await open(narrow);
await pn.evaluate(() => document.querySelector('[data-chart]').smithChart.setRead(-0.31, -0.77));
await frame(pn);
const fit = await pn.evaluate(() => ({
  sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth,
  rows: [...document.querySelectorAll('dl > div')].filter((r) => r.scrollWidth > r.clientWidth || r.getBoundingClientRect().right > document.documentElement.clientWidth).length,
  buttons: [...document.querySelectorAll('button')].every((b) => b.getBoundingClientRect().right <= document.documentElement.clientWidth),
}));
ok(fit.sw <= fit.cw && fit.rows === 0 && fit.buttons, `usable at 320 px: ${JSON.stringify(fit)}`);
ok(pn.errors.length === 0, `no errors at 320 px: ${pn.errors.join(' | ')}`);

await browser.close();
stopServer();
for (const failure of failures) console.log(`FAIL ${failure}`);
const f = (x) => x.toFixed(2);
for (const r of times) {
  console.log(`zoom 2 s at CPU ${r.rate}× (headless): ${r.events} wheel events, ${r.ticks} frames, ${r.frames} chart updates, ${r.builds} grid rebuilds; `
    + `frame interval p50 ${f(r.intervalP50)} / p95 ${f(r.intervalP95)} ms; chart script p50 ${f(r.workP50)} / p95 ${f(r.workP95)} ms; main thread ${f(r.mainPerFrame)} ms per frame (runs ${r.runs})`);
}
console.log(`chart interaction: readout at ${readChecks} points; ${passed} of ${passed + failed} checks passed`);
process.exit(failed ? 1 : 0);
