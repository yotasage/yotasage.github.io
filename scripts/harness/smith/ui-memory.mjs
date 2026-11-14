// A long scripted session on /smith-chart/main for memory (step M9.3): the 10-part circuit with a 2,000-point band and
// two unknowns, then for `minutes` minutes in turn: a 2 s circular drag of one handle (parts 2, 4, 6, 8 in turn,
// snapping off), a wheel zoom in and out, an undo (Ctrl+Z) every third round; every minute the heap after two forced
// collections, the DOM node count, event listeners and detached DOM nodes (CDP DOM.getDetachedDomNodes where the
// browser has it). Fails if the heap after GC grew by more than max(2 MB, 10 %) from the first sample to the last, or
// the nodes, listeners or detached nodes grew by more than a few.
// The first minute warms up and is not counted.
//   tsx ui-memory.mjs [minutes = 10] [base URL]      (not part of npm run ui; best on a production build, ui.mjs --prod)

import { chromium } from 'playwright-core';

import * as importedState from '../../../lib/smith/state.ts';
import * as importedNetwork from '../../../lib/smith/network.ts';
import * as importedParts from '../../../lib/smith/parts.ts';
import { buildOf } from './timing.mjs';

const S = importedState.default ?? importedState;
const N = importedNetwork.default ?? importedNetwork;
const P = importedParts.default ?? importedParts;
const minutes = Number(process.argv[2] ?? 10);
const base = process.argv[3] ?? 'http://localhost:3021';
const TEN = '?v=1&z0=50&f0=100e6&zl=25:25&p=cs:31.83e-12,lp:79.58e-9,tl:0.3:75,so:0.1:50,rs:10,ls:20n,cp:5p,ss:0.2:60,qw:35,rp:200&u=1,5&sw=20e6:180e6:2000';

let browser;
for (const channel of ['msedge', 'chrome']) {
  try { browser = await chromium.launch({ channel }); break; } catch { /* Try the next browser. */ }
}
if (!browser) { console.error('Neither Edge nor Chrome could be started.'); process.exit(1); }
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: 'light' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(`${base}/smith-chart/main${TEN}`, { waitUntil: 'networkidle' });
await page.waitForSelector('[data-circuit]');
if (await page.getAttribute('[data-snap-toggle]', 'aria-pressed') === 'true') await page.click('[data-snap-toggle]');
const build = await buildOf(page);
const cdp = await ctx.newCDPSession(page);
await cdp.send('Performance.enable');

/** Client point of the handle of part i (its end node) for the circuit in the page's link now. */
async function handle(i) {
  const c = S.decodeCircuit(new URL(page.url()).search).circuit, g = [0, 0];
  const nodes = new Float64Array((c.parts.length + 1) * N.NODE_STRIDE);
  N.evaluate(nodes, P.packParts(c.parts), c.parts.length, c.loadR, c.loadX, c.z0, c.f0, c.f0);
  N.nodeGamma(g, 0, nodes, (i + 1) * N.NODE_STRIDE);
  return page.evaluate(([gr, gi]) => {
    const box = document.querySelector('[data-chart]'), v = box.smithChart, r = box.getBoundingClientRect();
    return [r.left + box.clientLeft + v.w / 2 + (gr - v.cx) * v.k, r.top + box.clientTop + v.h / 2 - (gi - v.cy) * v.k];
  }, g);
}
const drag = ([hx, hy]) => page.evaluate(([hx, hy]) => new Promise((done) => {
  const box = document.querySelector('[data-chart]');
  const ev = (type, x, y) => box.dispatchEvent(new PointerEvent(type, { pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0, buttons: 1, clientX: x, clientY: y, bubbles: true, cancelable: true }));
  ev('pointerdown', hx, hy);
  const start = performance.now();
  let x = hx, y = hy;
  const send = () => {
    const t = performance.now() - start;
    if (t >= 2000) { ev('pointerup', x, y); setTimeout(done, 100); return; }
    const a = (t / 2000) * 2 * Math.PI;
    x = hx + 40 * Math.sin(a); y = hy + 40 * (1 - Math.cos(a));
    ev('pointermove', x, y);
    setTimeout(send, 8);
  };
  send();
}), [hx, hy]);
const zoom = () => page.evaluate(() => new Promise((done) => {
  const box = document.querySelector('[data-chart]'), r = box.getBoundingClientRect();
  const start = performance.now();
  const send = () => {
    const t = performance.now() - start;
    if (t >= 1000) { box.smithChart.setView(0, 0, 0); setTimeout(done, 100); return; }
    box.dispatchEvent(new WheelEvent('wheel', { deltaY: t < 500 ? -12 : 12, clientX: r.left + r.width * 0.6, clientY: r.top + r.height * 0.4, bubbles: true, cancelable: true }));
    setTimeout(send, 8);
  };
  send();
}));

let detachedApi = true;
async function sample(t) {
  await cdp.send('HeapProfiler.collectGarbage');
  await cdp.send('HeapProfiler.collectGarbage');
  const heap = (await cdp.send('Runtime.getHeapUsage')).usedSize;
  const m = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value]));
  let detached = NaN;
  if (detachedApi) {
    try { detached = (await cdp.send('DOM.getDetachedDomNodes')).detachedNodes.length; } catch { detachedApi = false; }
  }
  const s = { t, heap, nodes: m.Nodes, listeners: m.JSEventListeners, documents: m.Documents, detached };
  console.log(`${(t / 60000).toFixed(1)} min: heap after GC ${(heap / 1048576).toFixed(2)} MB, ${s.nodes} DOM nodes, ${s.listeners} listeners, ${s.documents} documents, ${Number.isNaN(detached) ? 'detached nodes n/a' : `${detached} detached nodes`}`);
  return s;
}

// A minute of rounds first, not counted: in M9.3 the heap after GC grew by 1.76 MB in it (compiled code, the worker's
// buffers, caches, the first undo steps) and then by 0.47 MB in nine minutes (notes-M9.3.md).
const parts = [2, 4, 6, 8];
const warm = Date.now();
let rounds = 0;
const w0 = await sample(0);
while (Date.now() - warm < 60000) { await drag(await handle(parts[rounds++ % parts.length])); await zoom(); }
console.log('warm-up minute done; the samples below count');
const t0 = Date.now(), samples = [await sample(0)];
let nextSample = 60000;
while (Date.now() - t0 < minutes * 60000) {
  await drag(await handle(parts[rounds % parts.length]));
  await zoom();
  if (rounds % 3 === 2) { await page.keyboard.press('Control+z'); await page.waitForTimeout(100); }
  rounds++;
  if (Date.now() - t0 >= nextSample) { samples.push(await sample(Date.now() - t0)); nextSample += 60000; }
}
samples.push(await sample(Date.now() - t0));
await browser.close();

const a = samples[0], b = samples[samples.length - 1], fails = [];
const growth = b.heap - a.heap;
if (growth > Math.max(2 * 1048576, 0.1 * a.heap)) fails.push(`the heap after GC grew by ${(growth / 1048576).toFixed(2)} MB`);
if (b.nodes - a.nodes > 50) fails.push(`DOM nodes grew from ${a.nodes} to ${b.nodes}`);
if (b.listeners - a.listeners > 20) fails.push(`event listeners grew from ${a.listeners} to ${b.listeners}`);
if (b.detached - a.detached > 10) fails.push(`detached DOM nodes grew from ${a.detached} to ${b.detached}`);
if (errors.length) fails.push(`errors: ${errors.slice(0, 5).join(' | ')}`);
for (const f of fails) console.log(`FAIL ${f}`);
console.log(`memory: warm-up ${((samples[0].heap - w0.heap) / 1048576).toFixed(2)} MB; ${rounds} rounds in ${((Date.now() - t0) / 60000).toFixed(1)} min on a ${build} build; heap after GC ${(a.heap / 1048576).toFixed(2)} → ${(b.heap / 1048576).toFixed(2)} MB `
  + `(${growth >= 0 ? '+' : ''}${(growth / 1024).toFixed(0)} kB), nodes ${a.nodes} → ${b.nodes}, listeners ${a.listeners} → ${b.listeners}, detached ${a.detached} → ${b.detached}; ${fails.length ? 'FAILED' : 'passed'}`);
process.exitCode = fails.length ? 1 : 0;
