// The budgets of engine.md §10 on a production build in the installed Edge, at 1× and 4× CPU throttle, in one table
// (step M9.2): the machine (CPU, Edge, GPU adapter); the first load (navigation to the first result, FCP, LCP) and
// every chunk with its trigger (first paint, scrolled near a section, opened view, run), none of three.js, the FDTD
// kernels or KaTeX in the first load; one 2D solve (microstrip with mask; coupled pair with mask and coplanar ground):
// the worker's own time and the round trip from Enter to the result shown; the inverse, a sweep of 100 and Monte Carlo
// 1000; the field map's first and full picture at 1440 px; the via model (worker time and round trip) after an edit of
// the via (a new drill) and after one of the trace (a new width: its feeds solved again, BL197); drags (trace,
// pair, trace with the field map, via antipad): the drag frame's own work p95, all main-thread work per frame (CDP
// TaskDuration), new results per frame, the coarse map's latency; the full-wave estimate against the real time on
// WebGPU (the first run of a worker calibrates); the theory, an equation and its derivation, and a figure saved.
// Every row is measured REPEATS times (EMSIM_PERF_REPEATS, default 5) and given as median and 95th percentile of
// the runs. Chromium's CPU throttle (CDP Emulation.setCPUThrottlingRate) slows the page's main thread only: a
// dedicated worker is not throttled and CDP refuses it there ("only supported for pages"), so the 4× column of
// worker-side budgets is the worker's 1× time × 4 (the work is one thread and CPU-bound) beside the measured round
// trip. Checked at 1×: every budget of §10; at 4×: the worker budgets by that model; the 4× drag rows are reported
// (BL99, BL101, BL115). The player's and 3D views' frame rates are checked by ui-player, ui-waves3d and ui-via3d.
//   tsx ui-perf.mjs [screenshot folder | -] [base URL]      (part of npm run ui)

import { cpus } from 'node:os';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

import { chromium } from 'playwright-core';

const here = dirname(fileURLToPath(import.meta.url));
const NEXT = resolve(here, '../../../.next');
const ARGS = ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-angle=d3d11', '--ignore-gpu-blocklist'];
const base = process.argv[3] ?? 'http://localhost:3022';
const URL0 = `${base}/em-sim/main`;
const REP = Math.max(3, Number(process.env.EMSIM_PERF_REPEATS ?? 5));
/** EMSIM_PERF_PARTS=load,solve,tools,map,drag,via,fw,info: only those parts (an A/B of one part). */
const PARTS = process.env.EMSIM_PERF_PARTS ? new Set(process.env.EMSIM_PERF_PARTS.split(',')) : null;
const want = (k) => !PARTS || PARTS.has(k);
/** engine.md §10 (ms unless named). */
const B = { solveMs: [20, 80], solvePair: [40, 150], drag: [8, 12], mapFollow: 100, inverse: 300, sweep100: 2000, mc1000: 20000, mapFirst: 50, mapFull: 300, via: 30, fwRatio: 2 };

let pass = 0;
const fails = [];
const check = (ok, what) => { if (ok) { pass++; console.log(`ok   ${what}`); } else { fails.push(what); console.log(`FAIL ${what}`); } };
const q = (xs, f) => { const s = xs.filter(Number.isFinite).sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(f * s.length))] : NaN; };
const med = (xs) => q(xs, 0.5);
const f1 = (x, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : '–');
const ROWS = []; // the budget table: { task, budget, r1, r4, verdict }
const row = (task, budget, r1, r4, verdict) => { ROWS.push({ task, budget, r1, r4, verdict }); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ channel: 'msedge', args: ARGS });
const errors = [];
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'light', acceptDownloads: true });
async function open(url = URL0, c = ctx) {
  const p = await c.newPage();
  p.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
  await p.goto(url);
  await p.waitForSelector('[data-ready="true"]', { timeout: 30000 });
  await solved(p);
  return p;
}
async function solved(p) {
  await p.waitForTimeout(30);
  await p.waitForSelector('[data-results]:not([data-stale="true"]):not([data-quick="true"])', { timeout: 30000 });
  await p.waitForSelector('[data-dragging="false"]', { timeout: 30000 });
}
const cdps = new WeakMap();
async function throttle(p, rate) {
  let c = cdps.get(p);
  if (!c) { c = await p.context().newCDPSession(p); await c.send('Performance.enable'); cdps.set(p, c); }
  await c.send('Emulation.setCPUThrottlingRate', { rate });
  return c;
}
const task = async (c) => (await c.send('Performance.getMetrics')).metrics.find((m) => m.name === 'TaskDuration').value;

try {
  // ---- 0: the machine ----
  const mp = await open();
  const gpu = await mp.evaluate(async () => {
    const a = navigator.gpu ? await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' }).catch(() => null) : null;
    const c = document.createElement('canvas').getContext('webgl2'), x = c?.getExtension('WEBGL_debug_renderer_info');
    return { webgpu: a ? `${a.info?.vendor ?? ''} ${a.info?.architecture ?? ''} ${a.info?.description ?? ''}`.trim() : 'none', webgl: x ? c.getParameter(x.UNMASKED_RENDERER_WEBGL) : '?' };
  });
  console.log(`machine: ${cpus()[0].model.trim()} (${cpus().length} threads), Edge ${browser.version()}, WebGPU adapter ${gpu.webgpu}, WebGL ${gpu.webgl}; ${REP} repeats`);
  await mp.close();

  // ---- 1: the first load and the chunks by trigger ----
  if (want('load')) {
  const loads = { 1: [], 4: [] };
  for (const rate of [1, 4]) {
    for (let i = 0; i < REP; i++) {
      const c = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'light' });
      const p = await c.newPage();
      await throttle(p, rate);
      await p.addInitScript(() => {
        window.__first = {};
        new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__first.lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
        const mo = new MutationObserver(() => {
          const r = document.querySelector('[data-results][data-state="done"]');
          if (r && !window.__first.result) { window.__first.result = performance.now(); mo.disconnect(); }
        });
        document.addEventListener('DOMContentLoaded', () => mo.observe(document.body, { attributes: true, subtree: true, childList: true }));
      });
      await p.goto(URL0);
      await p.waitForSelector('[data-results][data-state="done"]', { timeout: 60000 });
      await sleep(300);
      const t = await p.evaluate(() => ({ ...window.__first, fcp: performance.getEntriesByName('first-contentful-paint')[0]?.startTime, dcl: performance.getEntriesByType('navigation')[0]?.domContentLoadedEventEnd }));
      loads[rate].push(t);
      await c.close();
    }
  }
  const lrow = (k) => [loads[1].map((x) => x[k]), loads[4].map((x) => x[k])];
  for (const [k, name] of [['fcp', 'first contentful paint'], ['lcp', 'largest contentful paint'], ['result', 'first result shown (C39 Z0)']]) {
    const [a, b] = lrow(k);
    row(`first load: ${name}`, 'none (information)', `${f1(med(a), 0)} / ${f1(q(a, 0.95), 0)}`, `${f1(med(b), 0)} / ${f1(q(b, 0.95), 0)}`, 'info');
  }

  // Chunks by trigger: every script the page or its workers fetch, attributed to the step that fetched it.
  const gz = (url) => {
    const m = /\/_next\/(static\/.+\.js)/.exec(url);
    const f = m && join(NEXT, m[1]);
    if (!f || !existsSync(f)) return { raw: 0, gz: 0, text: '' };
    const b = readFileSync(f);
    return { raw: b.length, gz: gzipSync(b, { level: 9 }).length, text: b.toString('utf8') };
  };
  const cc = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'light', acceptDownloads: true });
  const seen = new Set();
  let step = 'first paint';
  const byStep = new Map();
  cc.on('response', (r) => {
    const u = r.url();
    if (!/\.js(\?|$)/.test(u) || seen.has(u)) return;
    seen.add(u);
    if (!byStep.has(step)) byStep.set(step, []);
    byStep.get(step).push(u);
  });
  const cp = await cc.newPage();
  cp.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
  await cp.goto(URL0);
  await cp.waitForSelector('[data-results][data-state="done"]', { timeout: 30000 });
  await sleep(1500);
  const firstUrls = [...(byStep.get('first paint') ?? [])];
  const marks = { three: 0, wgsl: 0, katex: 0 };
  for (const u of firstUrls) { const t = gz(u).text; if (t.includes('WebGLRenderer')) marks.three++; if (t.includes('@workgroup_size')) marks.wgsl++; if (t.includes('KaTeX parse error')) marks.katex++; }
  check(firstUrls.length > 0 && !marks.three && !marks.wgsl && !marks.katex, `the first load (${firstUrls.length} scripts) holds no three.js (${marks.three}), FDTD kernels (${marks.wgsl}) or KaTeX (${marks.katex})`);
  const near = async (id) => { step = `#${id} near`; await cp.evaluate((i) => document.getElementById(i)?.scrollIntoView(), id); await cp.waitForSelector(`#${id}[data-loaded="true"]`, { timeout: 30000 }); await sleep(800); };
  const act = async (name, fn) => { step = name; await fn(); await sleep(800); };
  await act('the JLCPCB list opened', async () => { await cp.evaluate(() => window.scrollTo(0, 0)); await cp.click('[data-jlc-open]'); await cp.waitForSelector('[data-jlc-picker][data-loaded="true"]', { timeout: 30000 }); await cp.keyboard.press('Escape'); });
  await act('the field map switched on', async () => { await cp.check('[data-field-on]'); await cp.waitForFunction(() => document.querySelector('[data-trace-view]')?.getAttribute('data-field-state') === 'done', null, { timeout: 30000 }); await cp.uncheck('[data-field-on]'); });
  await act('an equation opened', async () => { await cp.click('[data-results] [data-eq-open="z0"]'); await cp.waitForSelector('[data-eq-panel]', { timeout: 30000 }); });
  await act('its derivation opened', async () => { await cp.click('[data-eq-derive]'); await cp.waitForSelector('dialog[open]', { timeout: 30000 }); await cp.click('dialog[open] [data-derive-close]'); await cp.click('[data-eq-close]'); });
  await near('via');
  await cp.waitForSelector('[data-via-results][data-state="done"]', { timeout: 30000 });
  await act('the via 3D view opened', async () => { await cp.click('[data-via3d-open]'); await cp.waitForSelector('[data-via3d-ready="true"]', { timeout: 30000 }); await cp.click('[data-via3d-open]'); });
  await near('waves');
  await cp.waitForSelector('[data-waves-estimate="ready"]', { timeout: 60000 });
  await act('a full-wave run', async () => { await cp.click('[data-waves-run]'); await cp.waitForSelector('[data-waves-results][data-stale="false"] [data-waves-player]', { timeout: 300000 }); });
  await act('the waves 3D view opened', async () => { await cp.click('[data-waves3d-open]'); await cp.waitForSelector('[data-waves3d-ready="true"]', { timeout: 30000 }); await cp.click('[data-waves3d-open]'); });
  await near('export');
  await near('examples');
  await near('theory');
  await cp.waitForSelector('[data-theory]', { timeout: 30000 });
  await sleep(1000);
  // What a chunk holds, by a string only that part has.
  const TAGS = [['WebGLRenderer', 'three.js'], ['@workgroup_size', 'FDTD kernels'], ['KaTeX parse error', 'KaTeX'], ['Single via 0.6/0.3', 'Via section'], ['data-waves-run', 'Waves section'], ['data-player-play', 'player'],
    ['data-export-save', 'Export'], ['data-theory-contents', 'Theory'], ['data-example-link', 'Examples'], ['data-eq-derive', 'equation panel'], ['data-derive-next', 'derivation'], ['data-jlc-count', 'JLCPCB picker'], ['data-field-on', 'Trace section'],
    ['static.worker', 'starts the static worker'], ['fdtd.worker', 'starts the full-wave worker']];
  const what = (t) => { const k = TAGS.filter(([m]) => t.includes(m)).map(([, n]) => n); return k.length ? ` (${k.join(', ')})` : ''; };
  console.log('\n| trigger | scripts | raw kB | gzip kB | files |');
  console.log('|---|---|---|---|---|');
  let firstGz = 0;
  for (const [s, us] of byStep) {
    const sz = us.map((u) => ({ u: u.replace(/^.*\/_next\/static\/(chunks\/)?/, ''), ...gz(u) }));
    const raw = sz.reduce((a, x) => a + x.raw, 0), g = sz.reduce((a, x) => a + x.gz, 0);
    if (s === 'first paint') firstGz = g;
    console.log(`| ${s} | ${us.length} | ${f1(raw / 1024)} | ${f1(g / 1024)} | ${sz.map((x) => `${x.u} ${f1(x.gz / 1024)}${what(x.text)}`).join(', ')} |`);
  }
  console.log(`  first paint with its workers: ${f1(firstGz / 1024)} kB gzip (size.mjs counts the page's scripts against 200 kB)`);
  check(errors.length === 0, `no page errors while the chunks loaded (${errors.slice(0, 3).join(' | ')})`);
  await cc.close();
  }

  // ---- 2: 2D solves (typed widths, each new: no cache) ----
  // Each part on a fresh page with the tools closed: an open Tolerance tool re-runs its corners in the same worker
  // after every edit, which a budget's case does not include.
  const fresh = async (url) => {
    const p = await open(url);
    await p.evaluate(() => {
      window.__rt = []; let t0 = 0;
    // From the typed value's input event: the field applies it as it is typed, so its result can come before Enter.
    document.addEventListener('input', () => { t0 = performance.now(); }, true);
    // A result arriving always counts up data-solves (data-stale may go true and false in one commit and not change).
    new MutationObserver(() => { if (t0) { window.__rt.push(performance.now() - t0); t0 = 0; } }).observe(document.querySelector('[data-solves]'), { attributes: true, attributeFilter: ['data-solves'] });
    });
    return p;
  };
  let page = await fresh();
  let wi = 0;
  const typeW = async (p, sel = '[data-field="trace.w"] input') => {
    const w = (0.3 + 0.0013 * ++wi).toFixed(4);
    const f = p.locator(sel).first();
    await f.fill(w); await f.press('Enter');
    await p.waitForFunction(() => window.__rt.length > 0, null, { timeout: 10000 }).catch(() => {});
    await solved(p);
  };
  const solveRows = async (p, label, budget) => {
    const res = {};
    for (const rate of [1, 4]) {
      await throttle(p, rate);
      const ms = [], rt = [];
      for (let i = 0; i < 3 * REP; i++) {
        await p.evaluate(() => { window.__rt.length = 0; });
        await typeW(p);
        ms.push(Number(await p.getAttribute('[data-results]', 'data-ms')));
        rt.push(await p.evaluate(() => window.__rt[0]));
      }
      res[rate] = { ms, rt };
    }
    await throttle(p, 1);
    const w1 = q(res[1].ms, 0.95), w4 = q(res[4].ms, 0.95);
    row(`one 2D solve, ${label}: worker`, `≤ ${budget[0]} ms (≤ ${budget[1]} at 4×)`, `${f1(med(res[1].ms))} / ${f1(w1)}`, `× 4 → ${f1(4 * w1)} (measured unthrottled ${f1(w4)})`, w1 <= budget[0] && 4 * w1 <= budget[1] ? 'met' : 'MISSED');
    row(`one 2D solve, ${label}: typed value to result shown`, 'none (information)', `${f1(med(res[1].rt))} / ${f1(q(res[1].rt, 0.95))}`, `${f1(med(res[4].rt))} / ${f1(q(res[4].rt, 0.95))}`, 'info');
    check(w1 <= budget[0], `${label}: the worker's solve p95 ${f1(w1)} ms (budget ${budget[0]}; × 4 = ${f1(4 * w1)}, budget ${budget[1]})`);
  };
  if (want('solve')) {
  await solveRows(page, 'microstrip with mask (C39)', B.solveMs);
  await page.selectOption('[data-trace-kind]', 'pair-cpw');
  await solved(page);
  await solveRows(page, 'pair with mask and coplanar ground (pair-cpw)', B.solvePair);
  await page.selectOption('[data-trace-kind]', 'microstrip');
  await solved(page);
  }

  // ---- 3: inverse, sweep of 100, Monte Carlo 1000 ----
  const attr = (p, sel, a) => p.evaluate(([s, n]) => document.querySelector(s)?.getAttribute(n) ?? null, [sel, a]);
  const changed = (p, sel, a, old, timeout = 120000) => p.waitForFunction(([s, n, o]) => { const e = document.querySelector(s); return e && e.getAttribute(n) !== o && e.getAttribute('data-state') !== 'running'; }, [sel, a, old], { timeout });
  const tool = async (p, k) => { if ((await attr(p, `[data-tool-tab="${k}"]`, 'aria-pressed')) !== 'true') await p.click(`[data-tool-tab="${k}"]`); await p.waitForSelector(`[data-tool="${k}"]`, { state: 'visible', timeout: 30000 }); };
  if (want('tools')) {
  const tools = { inv: { 1: [], 4: [] }, sw: { 1: [], 4: [] }, mc: { 1: [], 4: [] } };
  for (const rate of [1, 4]) {
    await throttle(page, rate);
    await tool(page, 'target');
    for (let i = 0; i < REP; i++) {
      // The result's width and round trip together: two runs can take the same 0.1 ms (the wait then never ended).
      const key = () => page.evaluate(() => { const e = document.querySelector('[data-target-result]'); return e ? `${e.getAttribute('data-w')}|${e.getAttribute('data-total')}` : null; });
      const old = await key();
      await page.locator('[data-target-input]').fill(String(47 + i * 0.7 + (rate === 4 ? 0.3 : 0)));
      await page.locator('[data-target-input]').press('Enter');
      await page.waitForFunction((o) => { const e = document.querySelector('[data-target-result]'); return e && `${e.getAttribute('data-w')}|${e.getAttribute('data-total')}` !== o; }, old, { timeout: 60000 });
      tools.inv[rate].push(Number(await attr(page, '[data-target-result]', 'data-ms')));
    }
    await tool(page, 'sweep');
    await page.locator('[data-sweep-points]').fill('100');
    for (let i = 0; i < REP; i++) {
      await typeW(page);
      const old = await attr(page, '[data-sweep-result]', 'data-ms');
      await page.click('[data-sweep-run]');
      await changed(page, '[data-sweep-result]', 'data-ms', old, 60000);
      tools.sw[rate].push(Number(await attr(page, '[data-sweep-result]', 'data-ms')));
    }
    await tool(page, 'tolerance');
    for (let i = 0; i < 3; i++) {
      await typeW(page);
      await page.waitForSelector('[data-tol-corners]', { timeout: 60000 });
      const old = await attr(page, '[data-mc-result]', 'data-ms');
      await page.click('[data-mc-run]');
      await changed(page, '[data-mc-result]', 'data-ms', old, 120000);
      tools.mc[rate].push(Number(await attr(page, '[data-mc-result]', 'data-ms')));
    }
  }
  await throttle(page, 1);
  for (const [k, name, bud] of [['inv', 'inverse solve (width for a Z0 target)', B.inverse], ['sw', 'sweep of 100 points', B.sweep100], ['mc', 'Monte Carlo, 1,000 samples', B.mc1000]]) {
    const a = tools[k][1], b = tools[k][4];
    row(name, `≤ ${bud / 1000} s`, `${f1(med(a), 0)} / ${f1(q(a, 0.95), 0)} ms`, `${f1(med(b), 0)} / ${f1(q(b, 0.95), 0)} ms (worker unthrottled)`, q(a, 0.95) <= bud ? 'met' : 'MISSED');
    check(q(a, 0.95) <= bud, `${name} at 1×: p95 ${f1(q(a, 0.95), 0)} ms (budget ${bud})`);
  }

  // ---- 4: the field map at 1440 px: first and full picture of a new job (typed widths) ----
  }
  const mapped = (p) => p.waitForFunction(() => document.querySelector('[data-trace-view]')?.getAttribute('data-field-state') === 'done', null, { timeout: 30000 });
  if (want('map')) {
  await page.close(); page = await fresh();
  await page.check('[data-field-on]');
  await mapped(page);
  const maps = { 1: { first: [], full: [] }, 4: { first: [], full: [] } };
  const sends = []; // the map's jobs per typed width: one (BL198: the view's refit sent a second)
  for (const rate of [1, 4]) {
    await throttle(page, rate);
    for (let i = 0; i < REP + 1; i++) {
      const m0 = await page.evaluate(() => document.querySelector('[data-trace-view]').emsimField.paints.length);
      const r0 = await page.evaluate(() => document.querySelector('[data-trace-view]').emsimField.requests);
      await typeW(page);
      await page.waitForFunction((m) => document.querySelector('[data-trace-view]').emsimField.paints.slice(m).some((x) => x.kind === 'done' && !x.cached), m0, { timeout: 30000 });
      await mapped(page);
      const ps = await page.evaluate((m) => document.querySelector('[data-trace-view]').emsimField.paints.slice(m), m0);
      sends.push((await page.evaluate(() => document.querySelector('[data-trace-view]').emsimField.requests)) - r0);
      const first = ps.find((x) => x.kind === 'partial') ?? ps.find((x) => x.kind === 'done'), full = ps.find((x) => x.kind === 'done' && !x.cached);
      if (i > 0 && first && full) { maps[rate].first.push(first.ms); maps[rate].full.push(full.ms); }
    }
  }
  await throttle(page, 1);
  {
    const [a, b] = [maps[1], maps[4]];
    row('field map, 1440 px view: first picture', `≤ ${B.mapFirst} ms`, `${f1(med(a.first), 0)} / ${f1(q(a.first, 0.95), 0)}`, `${f1(med(b.first), 0)} / ${f1(q(b.first, 0.95), 0)}`, q(a.first, 0.95) <= B.mapFirst ? 'met' : 'MISSED');
    check(sends.every((x) => x === 1), `one field-map job per typed width (${sends.join(', ')}; BL198)`);
    row('field map, 1440 px view: full', `≤ ${B.mapFull} ms`, `${f1(med(a.full), 0)} / ${f1(q(a.full, 0.95), 0)}`, `${f1(med(b.full), 0)} / ${f1(q(b.full, 0.95), 0)}`, q(a.full, 0.95) <= B.mapFull ? 'met' : 'MISSED');
    check(a.full.length >= 3 && q(a.full, 0.95) <= B.mapFull && q(a.first, 0.95) <= B.mapFirst, `field map at 1×: full p95 ${f1(q(a.full, 0.95), 0)} ms (budget ${B.mapFull}), first p95 ${f1(q(a.first, 0.95), 0)} ms (budget ${B.mapFirst})`);
  }

  }

  // ---- 5: drags: synthetic pointer moves on a handle for 2 s, every 8 ms ----
  async function drag(p, o, rate) {
    const hs = `${o.handle} circle`;
    await p.locator(hs).first().evaluate((e) => e.scrollIntoView({ block: 'center' }));
    await sleep(100);
    const bb = await p.locator(hs).first().boundingBox();
    const hx = bb.x + bb.width / 2, hy = bb.y + bb.height / 2;
    const c = await throttle(p, rate);
    await sleep(300);
    const t0 = await task(c);
    const res = await p.evaluate(([o, hx, hy]) => new Promise((done) => {
      const box = document.querySelector(o.view), stat = box.emsimDrag, fs = box.emsimField;
      const area = document.querySelector(`[${o.solves}]`), hit = document.querySelector(`${o.handle} circle`);
      const ev = (el, type, x, y) => el.dispatchEvent(new PointerEvent(type, { pointerId: 7, pointerType: 'mouse', isPrimary: true, button: 0, buttons: 1, clientX: x, clientY: y, bubbles: true, cancelable: true }));
      const m0 = stat.ms.length, f0 = stat.frames, n0 = Number(area.getAttribute(o.solves)), p0 = fs ? fs.paints.length : 0;
      const stamps = [];
      let x = hx;
      ev(hit, 'pointerdown', hx, hy);
      const start = performance.now();
      const tick = (t) => {
        stamps.push(t);
        if (t - start < 2000) requestAnimationFrame(tick);
        else { ev(box, 'pointerup', x, hy); done({ stamps, ms: stat.ms.slice(m0), frames: stat.frames - f0, solves: Number(area.getAttribute(o.solves)) - n0, lat: fs ? fs.paints.slice(p0).filter((z) => z.drag && z.kind === 'done').map((z) => z.ms) : [] }); }
      };
      requestAnimationFrame(tick);
      const send = () => { const t = performance.now() - start; if (t >= 2000) return; x = hx + o.amp * Math.sin((t / 2000) * 4 * Math.PI); ev(box, 'pointermove', x, hy); setTimeout(send, 8); };
      send();
    }), [{ view: o.view, solves: o.solves, handle: o.handle, amp: o.amp }, hx, hy]);
    const t1 = await task(c);
    await throttle(p, 1);
    await o.settle(p);
    const iv = res.stamps.slice(1).map((t, i) => t - res.stamps[i]);
    return { p95: q(res.ms, 0.95), task: ((t1 - t0) * 1000) / res.stamps.length, perFrame: res.frames ? res.solves / res.frames : 0, frames: res.frames, lat: med(res.lat), dropped: iv.filter((x) => x > 25).length };
  }
  const dragRows = async (p, label, o) => {
    const r = {};
    for (const rate of [1, 4]) {
      r[rate] = [];
      for (let i = 0; i < REP; i++) { r[rate].push(await drag(p, o, rate)); if (await p.locator('[data-undo]').isEnabled()) { await p.click('[data-undo]'); await o.settle(p); } }
    }
    const s = (rate, k, f = 0.5) => q(r[rate].map((x) => x[k]), f);
    const txt = (rate) => `work p95 ${f1(s(rate, 'p95'), 2)}; task/frame ${f1(s(rate, 'task'), 2)} (p95 of runs ${f1(s(rate, 'task', 0.95), 2)}); ${f1(s(rate, 'perFrame'), 2)} results/frame${o.field ? `; map ${f1(s(rate, 'lat'), 0)} ms` : ''}`;
    const ok1 = s(1, 'p95') <= B.drag[0] && s(1, 'task') <= B.drag[0] && s(1, 'perFrame') >= 0.5 && (!o.field || s(1, 'lat') <= B.mapFollow);
    const ok4 = s(4, 'p95') <= B.drag[1] && s(4, 'task') <= B.drag[1] && (!o.field || s(4, 'lat') <= B.mapFollow);
    row(`drag: ${label}`, `≤ ${B.drag[0]} ms main thread per frame (≤ ${B.drag[1]} at 4×), a result every frame or second frame${o.field ? ', map within 100 ms' : ''}`, txt(1), txt(4), `${ok1 ? 'met' : 'MISSED'} at 1×, ${ok4 ? 'met' : 'missed'} at 4×`);
    check(ok1 && r[1].every((x) => x.frames > 20), `drag ${label} at 1×: ${txt(1)} (medians of ${REP} runs)`);
    if (!ok4) console.log(`NOTE drag ${label} at 4×: ${txt(4)}`);
  };
  if (want('drag')) {
  await page.close(); page = await fresh();
  const traceDrag = { view: '[data-trace-view]', solves: 'data-solves', handle: '[data-handle="w"]', amp: 30, settle: solved };
  await dragRows(page, 'trace width, microstrip', traceDrag);
  await page.close(); page = await fresh();
  await page.selectOption('[data-trace-kind]', 'pair-cpw'); await solved(page);
  await dragRows(page, 'trace width, pair-cpw', traceDrag);
  await page.close(); page = await fresh();
  await page.check('[data-field-on]'); await mapped(page);
  await dragRows(page, 'trace width, microstrip with the field map (|E|)', { ...traceDrag, field: true, settle: async (p) => { await solved(p); await mapped(p); } });
  await page.uncheck('[data-field-on]');
  await solved(page);

  }

  // ---- 6: the via model (typed drills and trace widths, each new) and the via drag ----
  if (want('via')) {
  await page.close(); page = await fresh(`${URL0}#via`);
  await page.evaluate(() => document.getElementById('via')?.scrollIntoView());
  await page.waitForSelector('#via[data-loaded="true"]', { timeout: 30000 });
  const viaSettled = async (p) => { await p.waitForTimeout(60); await p.waitForSelector('[data-via-solves][data-dragging="false"][data-quick="false"] [data-via-results][data-state="done"]:not([data-stale="true"])', { timeout: 60000 }); };
  await viaSettled(page);
  // Typed edits, each value new (no cache hit): the drill (the pads solved again) and the trace's width (its feeds).
  const viaRuns = async (sel, value) => {
    const out = { 1: { ms: [], rt: [] }, 4: { ms: [], rt: [] } };
    let k = 0;
    for (const rate of [1, 4]) {
      await throttle(page, rate);
      for (let i = 0; i < 3 * REP; i++) {
        const f = page.locator(sel).first();
        await f.fill(value(++k)); await f.press('Enter');
        await viaSettled(page);
        out[rate].ms.push(Number(await attr(page, '[data-via-results]', 'data-ms')));
        out[rate].rt.push(Number(await attr(page, '[data-via-results]', 'data-rt')));
      }
    }
    await throttle(page, 1);
    return out;
  };
  const viaDrill = await viaRuns('[data-field="via.drill"] input', (k) => (0.2 + 0.0021 * k).toFixed(4));
  const viaTrace = await viaRuns('[data-field="trace.w"] input', (k) => (0.1377 + 0.0013 * k).toFixed(4));
  { const f = page.locator('[data-field="trace.w"] input').first(); await f.fill('0.1377'); await f.press('Enter'); await viaSettled(page); }
  for (const [what, via] of [['a new drill', viaDrill], ['a new trace width (feeds solved again)', viaTrace]]) {
    const m1 = med(via[1].ms), w1 = q(via[1].ms, 0.95);
    const met = m1 <= B.via && w1 <= B.via;
    row(`via model (segments, pads, feeds, cascade, TDR), C44, after ${what}: worker`, `≤ ${B.via} ms`, `${f1(m1)} / ${f1(w1)}`, `× 4 → ${f1(4 * w1)} (measured unthrottled ${f1(med(via[4].ms))} / ${f1(q(via[4].ms, 0.95))})`, met ? 'met' : 'MISSED');
    row(`via model after ${what}: edit to result shown`, 'none (information)', `${f1(med(via[1].rt))} / ${f1(q(via[1].rt, 0.95))}`, `${f1(med(via[4].rt))} / ${f1(q(via[4].rt, 0.95))}`, 'info');
    check(met, `the via model after ${what}: ${f1(m1)} / ${f1(w1)} ms (median / p95) in the worker (budget ${B.via}; BL197, BL199)`);
  }
  const apKey = await page.locator('[data-via-handle^="ap:"]').first().getAttribute('data-via-handle');
  await dragRows(page, 'via side antipad (C44)', { view: '[data-via-view="side"]', solves: 'data-via-solves', handle: `[data-via-handle="${apKey}"]`, amp: 20, settle: viaSettled });

  }

  // ---- 7: the full-wave estimate against the real time on WebGPU (C44; the worker's first run calibrates) ----
  if (want('fw')) {
  await page.evaluate(() => document.getElementById('waves')?.scrollIntoView());
  await page.waitForSelector('#waves[data-loaded="true"]', { timeout: 30000 });
  await page.waitForSelector('[data-waves-estimate="ready"]', { timeout: 60000 });
  await sleep(300);
  const fw = [];
  for (let i = 0; i < 3; i++) {
    const before = Number(await attr(page, '[data-waves-estimate]', 'data-seconds'));
    await page.click('[data-waves-run]');
    await page.waitForSelector('[data-waves-results][data-stale="false"] [data-waves-player]', { timeout: 300000 });
    const g = async (a) => Number(await attr(page, '[data-waves-results]', a));
    fw.push({ before, el: await g('data-elapsed'), est: await g('data-estimate'), run: await g('data-run-s'), bk: await attr(page, '[data-waves-results]', 'data-backend') });
    await sleep(500);
  }
  console.log(`  full-wave C44: ${fw.map((r) => `${r.bk} ${f1(r.el, 2)} s (steps ${f1(r.run, 2)} s), estimate ${f1(r.est, 2)} s, shown before ${f1(r.before, 2)} s`).join('; ')}`);
  const ratio = fw.map((r) => Math.max(r.el / r.est, r.est / r.el));
  const ratioBefore = fw.map((r) => Math.max(r.el / r.before, r.before / r.el));
  row('full-wave run, via C44 on WebGPU: estimate against real time', `within ${B.fwRatio}×`, `${fw.map((r) => `${f1(r.el, 2)} s / est. ${f1(r.est, 2)}`).join(', ')} (before the first run: ${f1(fw[0].before, 2)} s)`, '– (GPU-bound; the 4× page adds nothing measurable)', Math.max(...ratio) <= B.fwRatio && ratioBefore[0] <= B.fwRatio ? 'met' : 'MISSED');
  check(fw.every((r) => r.bk === 'webgpu') && Math.max(...ratio) <= B.fwRatio && ratioBefore[0] <= B.fwRatio, `C44 runs within ${B.fwRatio}× of the calibrated estimate (${ratio.map((x) => f1(x, 2)).join(', ')}) and of the table's before the first (${f1(ratioBefore[0], 2)})`);

  }

  // ---- 8: theory, an equation and its derivation, a figure saved (information) ----
  if (want('info')) {
  await page.close(); page = await fresh();
  const timed = async (p, rate, fn) => { await throttle(p, rate); const t = Date.now(); await fn(); const ms = Date.now() - t; await throttle(p, 1); return ms; };
  const info = { eq: { 1: [], 4: [] }, der: { 1: [], 4: [] }, save: { 1: [], 4: [] }, theory: { 1: [], 4: [] } };
  for (const rate of [1, 4]) {
    for (let i = 0; i < REP; i++) {
      await page.evaluate(() => window.scrollTo(0, 0));
      info.eq[rate].push(await timed(page, rate, async () => { await page.click('[data-results] [data-eq-open="z0"]'); await page.waitForSelector('[data-eq-panel] [data-eq-derive]', { timeout: 30000 }); }));
      info.der[rate].push(await timed(page, rate, async () => { await page.click('[data-eq-derive]'); await page.waitForSelector('dialog[open] [data-derive-step]', { timeout: 30000 }); }));
      await page.click('dialog[open] [data-derive-close]');
      await page.click('[data-eq-close]');
      await page.evaluate(() => document.getElementById('export')?.scrollIntoView());
      await page.waitForSelector('#export[data-loaded="true"] [data-export-save]', { timeout: 30000 });
      info.save[rate].push(await timed(page, rate, async () => { await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.click('[data-export-save]')]); }));
    }
    for (let i = 0; i < 3; i++) {
      const tp = await open();
      info.theory[rate].push(await timed(tp, rate, async () => { await tp.click('nav[aria-label="Sections"] a[href="#theory"]'); await tp.waitForSelector('[data-theory]', { timeout: 30000 }); await tp.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))); }));
      await tp.close();
    }
  }
  for (const [k, name] of [['theory', 'theory: nav link to the topics drawn (cold chunk and KaTeX)'], ['eq', 'equation panel opened (Z0)'], ['der', 'derivation dialog opened'], ['save', 'figure saved (Export, SVG)']]) {
    const a = info[k][1], b = info[k][4];
    row(name, 'none (information; harness clock)', `${f1(med(a), 0)} / ${f1(q(a, 0.95), 0)} ms`, `${f1(med(b), 0)} / ${f1(q(b, 0.95), 0)} ms`, 'info');
  }
  }
  check(errors.length === 0, `no page errors (${errors.slice(0, 3).join(' | ')})`);
  await page.close();
} finally {
  await browser.close();
}

console.log('\n| task (engine.md §10) | budget | 1×: median / p95 | 4×: median / p95 | verdict |');
console.log('|---|---|---|---|---|');
for (const r of ROWS) console.log(`| ${r.task} | ${r.budget} | ${r.r1} | ${r.r4} | ${r.verdict} |`);
console.log(`\nui-perf: ${pass} passed, ${fails.length} failed`);
for (const f of fails) console.log(`FAIL ${f}`);
process.exit(fails.length ? 1 : 0);
