// The Smith chart's frame budgets (engine.md §9) measured on their own, for the record and for A/B runs (step M9.3):
// a handle drag with 10 parts (no sweep, and with a 2,000-point band), a continuous wheel zoom, at 1× and 4× CPU, each
// on a fresh page, one warm-up run and then `runs` runs; the median run counts. Before every scenario the machine's
// CPU load is sampled for a second with nothing running in the page (os.cpus()), so a busy machine shows in the output.
// The page's build is read from the page (`__NEXT_DATA__.buildId` is 'development' under `next dev`): the budgets of
// timing.mjs apply as they are on a production build and with DEV_FACTOR on a dev server (notes-M9.3.md).
//   tsx ui-perf.mjs [runs] [base URL]        (not part of npm run ui; ui.mjs --prod gives a production server)
// SMITH_PERF_HIDE=<CSS selectors> hides those elements after each load (to find what a frame's cost comes from).
// SMITH_PERF_CSS=<style sheet> adds those rules after each load (to try a style before changing the page).
// SMITH_PERF_EXPORT=1 scrolls to the Export section after each load (its preview is built) and back.
// SMITH_PERF_ONLY=<regular expression> keeps the scenarios whose name matches, SMITH_PERF_RATES=4 (or 1,4) the rates.
// Exit code 1 if a budget is over in the median run.

import { cpus } from 'node:os';

import { chromium } from 'playwright-core';

import * as importedState from '../../../lib/smith/state.ts';
import * as importedNetwork from '../../../lib/smith/network.ts';
import * as importedParts from '../../../lib/smith/parts.ts';
import { BUDGET, budgetFor, buildOf, machineLoad } from './timing.mjs';

const S = importedState.default ?? importedState;
const N = importedNetwork.default ?? importedNetwork;
const P = importedParts.default ?? importedParts;
const runs = Math.max(1, Number(process.argv[2] ?? 5) | 0);
const base = process.argv[3] ?? 'http://localhost:3020';

const TEN = '?v=1&z0=50&f0=100e6&zl=25:25&p=cs:31.83e-12,lp:79.58e-9,tl:0.3:75,so:0.1:50,rs:10,ls:20n,cp:5p,ss:0.2:60,qw:35,rp:200&u=1,5';
const BAND = '&sw=20e6:180e6:2000';

let browser;
for (const channel of ['msedge', 'chrome']) {
  try { browser = await chromium.launch({ channel }); break; } catch { /* Try the next browser. */ }
}
if (!browser) { console.error('Neither Edge nor Chrome could be started.'); process.exit(1); }

const frame = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
const q = (xs, f) => { const s = xs.slice().sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(f * s.length))] : NaN; };
const lostOf = (stamps) => stamps.slice(1).reduce((a, t, i) => a + Math.max(0, Math.round((t - stamps[i]) / (1000 / 60)) - 1), 0);

async function load(page, search) {
  await page.goto(`${base}/smith-chart/main${search}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-circuit]');
  await page.waitForFunction(() => window.location.search.includes('v=1'));
  if (process.env.SMITH_PERF_HIDE) await page.addStyleTag({ content: `${process.env.SMITH_PERF_HIDE} { display: none !important; }` });
  if (process.env.SMITH_PERF_CSS) await page.addStyleTag({ content: process.env.SMITH_PERF_CSS });
  if (process.env.SMITH_PERF_EXPORT) {
    await page.evaluate(() => document.querySelector('#export').scrollIntoView());
    await page.waitForFunction(() => document.querySelector('[data-export]').smithExport?.builds > 0);
    await page.evaluate(() => window.scrollTo(0, 0));
  }
  await frame(page);
}

/** One 2 s run at `rate` of `act` ('drag' or 'zoom') on the loaded page; main thread per frame from CDP TaskDuration. */
async function run(page, rate, act, search, traced = false) {
  await load(page, search);
  let hx = 0, hy = 0;
  if (act === 'drag') {
    if (await page.getAttribute('[data-snap-toggle]', 'aria-pressed') === 'true') { await page.click('[data-snap-toggle]'); await frame(page); }
    if (search.includes('&sw=')) await page.waitForFunction(() => document.querySelector('[data-sweep-trace]')?.getAttribute('data-state') === 'full', null, { timeout: 10000 });
    const c = S.decodeCircuit(search).circuit, nodes = new Float64Array((c.parts.length + 1) * N.NODE_STRIDE), g = [0, 0];
    N.evaluate(nodes, P.packParts(c.parts), c.parts.length, c.loadR, c.loadX, c.z0, c.f0, c.f0);
    N.nodeGamma(g, 0, nodes, 3 * N.NODE_STRIDE);
    [hx, hy] = await page.evaluate(([gr, gi]) => {
      const box = document.querySelector('[data-chart]'), v = box.smithChart, r = box.getBoundingClientRect();
      return [r.left + box.clientLeft + v.w / 2 + (gr - v.cx) * v.k, r.top + box.clientTop + v.h / 2 - (gi - v.cy) * v.k];
    }, g);
  } else await page.evaluate(() => document.querySelector('[data-chart]').smithChart.setView(0.2, 0.1, 0));
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  await cdp.send('Emulation.setCPUThrottlingRate', { rate });
  await frame(page);
  const task = async () => (await cdp.send('Performance.getMetrics')).metrics.find((m) => m.name === 'TaskDuration').value;
  const t0 = await task();
  const chunks = [];
  if (traced) {
    cdp.on('Tracing.dataCollected', (e) => chunks.push(...e.value));
    await cdp.send('Tracing.start', { categories: `devtools.timeline,disabled-by-default-devtools.timeline,v8${process.env.SMITH_PERF_PAINT ? ',disabled-by-default-devtools.timeline.invalidationTracking' : ''}`, transferMode: 'ReportEvents' });
  }
  const res = await page.evaluate(([act, hx, hy]) => new Promise((done) => {
    const box = document.querySelector('[data-chart]'), v = box.smithChart, layer = box.smithPath, tl = box.smithTrace ?? null;
    const rect = box.getBoundingClientRect(), zx = rect.left + rect.width * 0.62, zy = rect.top + rect.height * 0.4;
    const ev = (type, x, y) => box.dispatchEvent(new PointerEvent(type, { pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0, buttons: 1, clientX: x, clientY: y, bubbles: true, cancelable: true }));
    const stamps = [], works = [], traces = [], b0 = v.grid.builds;
    let seen = act === 'drag' ? layer.frames : v.frames, tseen = tl ? tl.frames : 0, x = hx, y = hy;
    if (act === 'drag') ev('pointerdown', hx, hy);
    const start = performance.now();
    const tick = (t) => {
      stamps.push(t);
      if (act === 'drag') { if (layer.frames !== seen) { works.push(layer.lastMs); seen = layer.frames; } }
      else if (v.frames !== seen) { works.push(v.lastWorkMs); seen = v.frames; }
      if (tl && tl.frames !== tseen) { traces.push(tl.lastMs); tseen = tl.frames; }
      if (t - start < 2000) requestAnimationFrame(tick);
      else { if (act === 'drag') ev('pointerup', x, y); done({ stamps, works, traces, builds: v.grid.builds - b0 }); }
    };
    requestAnimationFrame(tick);
    const send = () => {
      const t = performance.now() - start;
      if (t >= 2000) return;
      if (act === 'drag') {
        const a = (t / 2000) * 2 * Math.PI;
        x = hx + 70 * Math.sin(a); y = hy + 70 * (1 - Math.cos(a));
        ev('pointermove', x, y);
      } else box.dispatchEvent(new WheelEvent('wheel', { deltaY: t < 1000 ? -12 : 12, clientX: zx, clientY: zy, bubbles: true, cancelable: true }));
      setTimeout(send, 8);
    };
    send();
  }), [act, hx, hy]);
  const t1 = await task();
  let split = null;
  if (traced) {
    const finished = new Promise((r) => cdp.once('Tracing.tracingComplete', r));
    await cdp.send('Tracing.end');
    await finished;
    split = splitOf(chunks, res.stamps.length);
    if (process.env.SMITH_PERF_PAINT) split += `
     style and layout invalidations per frame: ${await invalidations(cdp, chunks, res.stamps.length)}`;
  }
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await cdp.detach();
  return { main: ((t1 - t0) * 1000) / res.stamps.length, ticks: res.stamps.length, lost: lostOf(res.stamps), builds: res.builds,
    p95: q(res.works, 0.95), p50: q(res.works, 0.5), works: res.works, tp95: q(res.traces, 0.95), split };
}

// SMITH_PERF_TRACE=1: one more traced run per scenario at 4×, its renderer main thread split by kind of work in ms per
// frame (inclusive times of the top-level kinds; a forced layout inside script counts under both).
const tracing = !!process.env.SMITH_PERF_TRACE;
const KINDS = { RunTask: 'tasks', 'ThreadControllerImpl::RunTask': 'tasks', FunctionCall: 'script', EventDispatch: 'event', TimerFire: 'timer', FireAnimationFrame: 'rAF',
  RunMicrotasks: 'microtasks', UpdateLayoutTree: 'style', Layout: 'layout', PrePaint: 'prepaint', Paint: 'paint', Layerize: 'layerize',
  Commit: 'commit', MinorGC: 'gc', MajorGC: 'gc', 'V8.GC_SCAVENGER': 'gc', 'V8.GC_MARK_COMPACTOR': 'gc', ParseHTML: 'html' };
// SMITH_PERF_PAINT=1 (with SMITH_PERF_TRACE): the elements whose style or layout was invalidated, counted per frame, the most first.
async function invalidations(cdp, events, frames) {
  const n = new Map();
  if (process.env.SMITH_PERF_PAINT === 'names') return [...new Set(events.map((e) => e.name).filter((x) => /nvalidat/.test(x)))].join(', ');
  for (const e of events) {
    if (!/^(Layout|StyleRecalc|ScheduleStyle)InvalidationTracking$/.test(e.name) || !e.args?.data) continue;
    const d = e.args.data, k = d.nodeId ?? d.nodeName;
    if (k == null) continue;
    n.set(k, (n.get(k) ?? 0) + 1);
  }
  const top = [...n.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25), out = [];
  await cdp.send('DOM.getDocument', { depth: 0 });
  for (const [id, c] of top) {
    let what = String(id);
    try {
      const { node } = await cdp.send('DOM.describeNode', { backendNodeId: id });
      const at = node.attributes ?? [], a = {};
      for (let i = 0; i < at.length; i += 2) a[at[i]] = at[i + 1];
      what = `${node.localName}${a.id ? '#' + a.id : ''}${a.class ? '.' + a.class.split(' ')[0] : ''}${Object.keys(a).filter((x) => x.startsWith('data-')).map((x) => `[${x}]`).join('')}`;
    } catch { /* gone */ }
    out.push(`${what} ${(c / frames).toFixed(2)}`);
  }
  return out.join(', ');
}
function splitOf(events, frames) {
  const main = events.find((e) => e.name === 'thread_name' && e.args?.name === 'CrRendererMain');
  const sum = {};
  for (const e of events) {
    if (!main || e.pid !== main.pid || e.tid !== main.tid || e.ph !== 'X' || !(e.name in KINDS)) continue;
    const k = KINDS[e.name];
    sum[k] = (sum[k] ?? 0) + (e.dur ?? 0) / 1000;
  }
  return Object.entries(sum).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${(v / frames).toFixed(2)}`).join(', ');
}

const scenarios = [
  ['drag, 10 parts', 'drag', TEN],
  ['drag, 10 parts, 2,000-point trace', 'drag', TEN + BAND],
  ['zoom, start circuit', 'zoom', '?v=1'],
].filter(([name]) => !process.env.SMITH_PERF_ONLY || new RegExp(process.env.SMITH_PERF_ONLY).test(name));
const rates = process.env.SMITH_PERF_RATES ? process.env.SMITH_PERF_RATES.split(',').map(Number) : [1, 4];
const out = [];
let over = 0, build = null;
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: 'light' });
for (const [name, act, search] of scenarios) {
  for (const rate of rates) {
    const load1 = await machineLoad(1000);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await load(page, search);
    build ??= await buildOf(page);
    await run(page, rate, act, search);
    const rs = [];
    for (let i = 0; i < runs; i++) rs.push(await run(page, rate, act, search));
    const split = tracing && rate === 4 ? (await run(page, rate, act, search, true)).split : null;
    await page.close();
    rs.sort((a, b) => a.main - b.main);
    const m = rs[rs.length >> 1];
    const lim = budgetFor(build, act, rate);
    const checks = [];
    if (lim.main) checks.push([m.main <= lim.main, `main ${m.main.toFixed(2)} ≤ ${lim.main.toFixed(2)} ms`]);
    const sq = q(m.works, lim.scriptAt);
    checks.push([sq <= lim.script, `script p${lim.scriptAt * 100} ${sq.toFixed(3)} ≤ ${lim.script} ms`]);
    checks.push([m.lost <= m.builds + lim.lost, `lost ${m.lost} ≤ ${m.builds} rebuilds + ${lim.lost}`]);
    const bad = checks.filter(([c]) => !c);
    over += bad.length + errors.length;
    out.push(`${bad.length || errors.length ? 'OVER' : 'ok  '} ${name} at ${rate}×: main thread ${m.main.toFixed(2)} ms per frame (runs ${rs.map((r) => r.main.toFixed(2)).join(', ')}), `
      + `${m.lost} lost / ${m.ticks} frames, ${m.builds} grid rebuilds, script p50 ${m.p50.toFixed(3)} / p95 ${m.p95.toFixed(3)} ms${Number.isNaN(m.tp95) ? '' : `, trace p95 ${m.tp95.toFixed(3)} ms`}; `
      + `machine load before ${load1.toFixed(0)} %${bad.length ? `; over: ${bad.map(([, t]) => t).join('; ')}` : ''}${errors.length ? `; errors: ${errors.join(' | ')}` : ''}`);
    console.log(out[out.length - 1]);
    if (split) console.log(`     traced run, ms per frame: ${split}`);
  }
}
await browser.close();
console.log(`${base}: ${build} build (budgets ×${build === 'development' ? BUDGET.devFactor : 1}), ${runs} runs each, ${cpus()[0].model.trim()}`);
process.exitCode = over ? 1 : 0;
