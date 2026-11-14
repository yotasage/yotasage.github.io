// Drives /smith-chart/main in the installed Edge (or Chrome) and checks the frequency sweep on the chart (step M7.2a):
// the trace read back from the DOM (its `d`, whole numbers of Γ × TRACE_SCALE) equals sweep.ts's refined sweep of the linked
// circuit to the `d`'s rounding and 1e-9 for five circuits and bands (linear and log), and its frequencies equal it to the bit; markers are
// added by a click and a tap on the trace and by the panel's button, dragged along the trace, stepped by keys (to the
// next trace point above or below, ten with Shift, Home and End to the band's ends) and removed by Delete and by the
// panel, and come back from the link; during a handle's drag the trace is the coarse sweep of the live circuit (every
// point to 1e-9), after the release the full sweep of the committed one; no horizontal scroll at 320 and 390 px; the
// drag's cost with a 10,000-point band at 1× and 4× CPU (the trace's own script per frame, the main thread per frame)
// and the full sweep's cost after a release.
//   tsx ui-trace.mjs [- [base URL]]            (part of npm run ui; the first argument, a screenshot folder elsewhere, is not used)
//   SMITH_TRACE_AB=1 tsx ui-trace.mjs          (only the 4× drag of ui-drag.mjs with a 10,000-point band, 3 runs: the
//                                               A/B against a commit without the sweep, which ignores sw)

import { spawn, execSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright-core';

import * as importedState from '../../../lib/smith/state.ts';
import * as importedSweep from '../../../lib/smith/sweep.ts';
import * as importedNetwork from '../../../lib/smith/network.ts';
import * as importedParts from '../../../lib/smith/parts.ts';

const S = importedState.default ?? importedState;
const SW = importedSweep.default ?? importedSweep;
const N = importedNetwork.default ?? importedNetwork;
const P = importedParts.default ?? importedParts;
const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../../..');
const base = process.argv[3] ?? 'http://localhost:3020';
const AB = !!process.env.SMITH_TRACE_AB;

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

let passed = 0, failed = 0;
const failures = [];
const ok = (condition, what) => { if (condition) passed++; else if (failed++ < 60) failures.push(typeof what === 'function' ? what() : what); };
const frame = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TOL = 1e-9;

const TEN = '?v=1&z0=50&f0=100e6&zl=25:25&p=cs:31.83e-12,lp:79.58e-9,tl:0.3:75,so:0.1:50,rs:10,ls:20n,cp:5p,ss:0.2:60,qw:35,rp:200&u=1,5';
const BIG = '&sw=20e6:180e6:10000';

/** sweep.ts's refined trace of a circuit and band (what the page must show). */
function expected(c, band) {
  const sc = SW.sweepCircuit(c), tr = new SW.Trace();
  SW.runSweep(tr, band, sc);
  return { n: tr.n, freqs: tr.freqs.slice(0, tr.n), gamma: tr.gamma.slice(0, 2 * tr.n) };
}
/** The coarse trace of a drag frame: the band at n even points, not refined. */
function expectedCoarse(c, band, n) {
  const sc = SW.sweepCircuit(c), tr = new SW.Trace();
  SW.sweepBand(tr, { ...band, points: n }, sc);
  return { n: tr.n, gamma: tr.gamma.slice(0, 2 * tr.n) };
}
/** The points of a `d` written by traceLayer.ts: "M x y x y …" in Γ × TRACE_SCALE, subpaths where a point was not finite. */
function parseD(d) {
  const out = [];
  for (const sub of d.split('M')) {
    if (!sub.trim()) continue;
    const v = sub.trim().split(/\s+/).map(Number);
    for (let i = 0; i + 1 < v.length; i += 2) out.push(v[i] / SCALE, v[i + 1] / SCALE);
  }
  return out;
}
const SCALE = SW.TRACE_SCALE;
function compare(got, want) {
  let worst = 0;
  if (got.length !== want.length) return { same: false, worst: Infinity, n: got.length / 2 };
  for (let i = 0; i < got.length; i++) worst = Math.max(worst, Math.abs(got[i] - want[i]));
  return { same: worst <= 0.5 / SCALE + TOL, worst, n: got.length / 2 };
}

async function open(context, search) {
  const page = await context.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') page.errors.push(m.text()); });
  await load(page, search);
  return page;
}
async function load(page, search) {
  await page.goto(`${base}/smith-chart/main${search}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-circuit]');
  await page.waitForFunction(() => window.location.search.includes('v=1'));
  await frame(page);
}
const full = (page) => page.waitForFunction(() => document.querySelector('[data-sweep-trace]')?.getAttribute('data-state') === 'full', null, { timeout: 10000 });
const linkOf = (page) => S.decodeCircuit(new URL(page.url()).search);
const traceD = (page) => page.getAttribute('[data-sweep-trace]', 'd');
const marks = (page) => page.$$eval('[data-sweep-marker]', (els) => els.map((e) => Number(e.getAttribute('data-f'))));
const viewState = (page) => page.evaluate(() => {
  const box = document.querySelector('[data-chart]'), v = box.smithChart, r = box.getBoundingClientRect();
  return { cx: v.cx, cy: v.cy, k: v.k, w: v.w, h: v.h, left: r.left + box.clientLeft, top: r.top + box.clientTop };
});
const client = (vs, gr, gi) => [vs.left + vs.w / 2 + (gr - vs.cx) * vs.k, vs.top + vs.h / 2 - (gi - vs.cy) * vs.k];
/** A trace point clear of the circuit's path, its handles and the markers, from index `from` on (page's own trace). */
const freePoint = (page, from, margin = 40) => page.evaluate(([from, margin]) => {
  const box = document.querySelector('[data-chart]'), v = box.smithChart, t = box.smithTrace, path = box.smithPath, tr = t.shown;
  const step = Math.max(1, Math.floor(tr.n / 400));
  for (let i = from; i < tr.n - 1; i += step) {
    const px = v.screenX(tr.gamma[2 * i]), py = v.screenY(tr.gamma[2 * i + 1]);
    if (px < margin || py < margin || px > v.w - margin || py > v.h - margin) continue;
    if (path.pick(px, py)[0] !== 0 || path.handleAt(px, py) >= 0 || t.markerHit(px, py) >= 0) continue;
    // Clear of the arcs by more than their pick distance, so the click is the trace's.
    let clear = true;
    for (let dx = -16; dx <= 16 && clear; dx += 8) for (let dy = -16; dy <= 16; dy += 8) if (path.pick(px + dx, py + dy)[0] !== 0) { clear = false; break; }
    if (!clear) continue;
    return { i, f: tr.freqs[i], lo: tr.freqs[i - 1] ?? tr.freqs[i], hi: tr.freqs[i + 1], gr: tr.gamma[2 * i], gi: tr.gamma[2 * i + 1] };
  }
  return null;
}, [from, margin]);

// ui-drag.mjs's 4× drag (10 parts, snapping off, a 2 s circle of synthetic pointer moves every 8 ms on the handle of
// part 3), with the trace's own frames recorded when the page has it.
async function timing(pt, rate, search) {
  await load(pt, search);
  if (await pt.$('[data-sweep-trace]')) await full(pt);
  const pressed = await pt.getAttribute('[data-snap-toggle]', 'aria-pressed');
  if (pressed === 'true') { await pt.click('[data-snap-toggle]'); await frame(pt); }
  const c = linkOf(pt).circuit, nodes = new Float64Array((c.parts.length + 1) * N.NODE_STRIDE), g = [0, 0];
  N.evaluate(nodes, P.packParts(c.parts), c.parts.length, c.loadR, c.loadX, c.z0, c.f0, c.f0);
  N.nodeGamma(g, 0, nodes, 3 * N.NODE_STRIDE);
  const vs = await viewState(pt), [hx, hy] = client(vs, g[0], g[1]);
  const cdp = await pt.context().newCDPSession(pt);
  await cdp.send('Performance.enable');
  await cdp.send('Emulation.setCPUThrottlingRate', { rate });
  await frame(pt);
  const task = async () => (await cdp.send('Performance.getMetrics')).metrics.find((m) => m.name === 'TaskDuration').value;
  const t0 = await task();
  const res = await pt.evaluate(([hx, hy]) => new Promise((done) => {
    const box = document.querySelector('[data-chart]'), layer = box.smithPath, tl = box.smithTrace ?? null;
    const ev = (type, x, y) => box.dispatchEvent(new PointerEvent(type, { pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0, buttons: 1, clientX: x, clientY: y, bubbles: true, cancelable: true }));
    const stamps = [], works = [], traces = [], ns = [];
    let seen = layer.frames, tseen = tl ? tl.frames : 0, x = hx, y = hy;
    ev('pointerdown', hx, hy);
    const start = performance.now();
    const tick = (t) => {
      stamps.push(t);
      if (layer.frames !== seen) { works.push(layer.lastMs); seen = layer.frames; }
      if (tl && tl.frames !== tseen) { traces.push(tl.lastMs); ns.push(tl.coarseN); tseen = tl.frames; }
      if (t - start < 2000) requestAnimationFrame(tick);
      else {
        // As ui-drag.mjs: the measured window ends with the release.
        ev('pointerup', x, y);
        done({ stamps, works, traces, ns });
      }
    };
    requestAnimationFrame(tick);
    const send = () => {
      const t = performance.now() - start;
      if (t >= 2000) return;
      const a = (t / 2000) * 2 * Math.PI;
      x = hx + 70 * Math.sin(a); y = hy + 70 * (1 - Math.cos(a));
      ev('pointermove', x, y);
      setTimeout(send, 8);
    };
    send();
  }), [hx, hy]);
  const t1 = await task();
  // The refined trace after the release: the worker's sweep, the main thread's taking of it, asking to drawn.
  const fin = await pt.evaluate(() => new Promise((done) => {
    const tl = document.querySelector('[data-chart]').smithTrace;
    if (!tl) { done({ fullMs: NaN, workerMs: NaN, applyMs: NaN }); return; }
    const until = performance.now() + 3000;
    const wait = () => (tl.stateName === 'full' || performance.now() > until ? done({ fullMs: tl.fullMs, workerMs: tl.workerMs, applyMs: tl.applyMs }) : setTimeout(wait, 10));
    wait();
  }));
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await cdp.detach();
  const q = (xs, f) => { const s = xs.slice().sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(f * s.length))] : NaN; };
  const iv = res.stamps.slice(1).map((t, i) => t - res.stamps[i]);
  return {
    rate, ticks: res.stamps.length, layerFrames: res.works.length, traceFrames: res.traces.length,
    lost: iv.reduce((a, t) => a + Math.max(0, Math.round(t / (1000 / 60)) - 1), 0),
    p95: q(res.works, 0.95), tp50: q(res.traces, 0.5), tp95: q(res.traces, 0.95), n50: q(res.ns, 0.5),
    main: ((t1 - t0) * 1000) / res.stamps.length, ...fin,
  };
}

const timesOut = [];
try {
  if (AB) {
    const desk = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: 'light' });
    const pt = await desk.newPage();
    const runs = [];
    for (let i = 0; i < 3; i++) runs.push(await timing(pt, 4, TEN + BIG));
    runs.sort((a, b) => a.main - b.main);
    console.log(`A/B 4×: main thread per frame ${runs.map((r) => r.main.toFixed(2)).join(', ')} ms (median ${runs[1].main.toFixed(2)}); trace ${await pt.$('[data-sweep-trace]') ? `p50 ${runs[1].tp50.toFixed(3)} ms, ${runs[1].n50} points` : 'not on this page'}`);
    await desk.close();
  } else {
    // ---------- the trace equals the engine's sweep, five circuits ----------
    const desk = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: 'light' });
    const cases = [
      ['start circuit, linear', `?${S.encodeCircuit(S.defaultCircuit())}`, '&sw=50e6:150e6:401'],
      ['10 parts, log', TEN, '&sw=1e6:1e9:1001:log'],
      ['open stub and line, from 0 Hz', '?v=1&z0=50&f0=1e9&zl=100:-50&p=tl:0.2:50,so:0.15:50', '&sw=0:3e9:301'],
      ['λ/4 transformer, 10,000 points', '?v=1&z0=50&f0=1e9&zl=200:0&p=qw:100', '&sw=0.2e9:1.8e9:10000'],
      ['series RLC, narrow log', '?v=1&z0=50&f0=100e6&zl=25:0&p=ls:400n,cs:6.333e-12', '&sw=90e6:110e6:51:log'],
    ];
    const pc = await open(desk, cases[0][1] + cases[0][2]);
    for (const [name, link, sw] of cases) {
      await load(pc, link + sw);
      await full(pc);
      await frame(pc);
      const d = linkOf(pc), want = expected(d.circuit, d.sweep.band);
      const got = parseD(await traceD(pc));
      const cmp = compare(got, Array.from(want.gamma));
      ok(cmp.same, () => `${name}: the DOM trace equals the sweep (${cmp.n} of ${want.n} points, worst ${cmp.worst})`);
      const fr = await pc.evaluate(() => Array.from(document.querySelector('[data-chart]').smithTrace.shown.freqs.subarray(0, document.querySelector('[data-chart]').smithTrace.shown.n)));
      // Linear bands to the bit; a log band's Math.exp and Math.log may differ by an ulp between Node and the browser.
      const tolF = d.sweep.band.log ? 1e-15 : 0;
      ok(fr.length === want.n && fr.every((f, i) => Math.abs(f - want.freqs[i]) <= tolF * f), `${name}: the trace's frequencies are the sweep's (${fr.length}${tolF ? ', to 1e-15' : ', to the bit'})`);
      ok(d.issues.length === 0, `${name}: the link reads without issues (${d.issues})`);
    }
    ok(pc.errors.length === 0, () => `traces: no errors (${pc.errors.join(' | ')})`);
    await pc.close();

    // ---------- markers by mouse and keys, the panel and the link ----------
    const pm = await open(desk, `?${S.encodeCircuit(S.defaultCircuit())}&sw=50e6:150e6:401`);
    await full(pm);
    let want = expected(linkOf(pm).circuit, linkOf(pm).sweep.band);
    const p1 = await freePoint(pm, 20);
    ok(p1 !== null, 'a trace point clear of the path to click');
    let vs = await viewState(pm);
    await pm.mouse.click(...client(vs, p1.gr, p1.gi));
    await frame(pm);
    let m = await marks(pm), L = linkOf(pm);
    ok(m.length === 1 && m[0] >= p1.lo && m[0] <= p1.hi, () => `a click on the trace adds a marker there: ${m} in ${p1.lo}…${p1.hi}`);
    ok(L.sweep.markers.length === 1 && L.sweep.markers[0] === m[0], () => `the marker is in the link: ${new URL(pm.url()).search}`);
    ok(await pm.$eval('[data-sweep-chip="0"] [data-raw]', (e) => Number(e.getAttribute('data-raw'))) === m[0], 'the panel lists the marker');
    // Its point is the engine's at its frequency.
    const sc0 = SW.sweepCircuit(L.circuit), mk0 = SW.markerAt(sc0, m[0]);
    const at0 = await pm.evaluate(() => { const t = document.querySelector('[data-chart]').smithTrace; return [t.mg[0], t.mg[1]]; });
    ok(at0[0] === mk0.gr && at0[1] === mk0.gi, `the marker's point is markerAt's: ${at0} vs ${mk0.gr}, ${mk0.gi}`);
    // Drag it along the trace to another point.
    const p2 = await freePoint(pm, p1.i + Math.floor(want.n / 4));
    const from = client(vs, mk0.gr, mk0.gi), to = client(vs, p2.gr, p2.gi);
    await pm.mouse.move(...from);
    await pm.mouse.down();
    for (let j = 1; j <= 12; j++) { await pm.mouse.move(from[0] + ((to[0] - from[0]) * j) / 12, from[1] + ((to[1] - from[1]) * j) / 12); await frame(pm); }
    await pm.mouse.up();
    await frame(pm);
    m = await marks(pm); L = linkOf(pm);
    ok(m.length === 1 && m[0] >= p2.lo && m[0] <= p2.hi && L.sweep.markers[0] === m[0], () => `a mouse drag moves it along the trace: ${m} in ${p2.lo}…${p2.hi}, link ${L.sweep.markers}`);
    ok(L.circuit.parts.every((p, i) => p.value === S.defaultCircuit().parts[i].value), 'the drag moved no part');
    // Keys on the focused marker.
    await pm.focus('[data-sweep-marker="0"]');
    const fr = Array.from(want.freqs);
    const above = (f, k) => { const j = fr.findIndex((x) => x > f); return fr[Math.min(fr.length - 1, j + k - 1)]; };
    const below = (f, k) => { let j = -1; for (let i = 0; i < fr.length; i++) if (fr[i] < f) j = i; return fr[Math.max(0, j - k + 1)]; };
    let f = m[0];
    for (const [key, next] of [['ArrowRight', above(f, 1)], ['ArrowUp', null], ['Shift+ArrowRight', null], ['ArrowLeft', null], ['PageDown', null], ['Home', 50e6], ['ArrowLeft', 50e6], ['End', 150e6], ['ArrowRight', 150e6]]) {
      const exp = next ?? (key === 'ArrowUp' ? above(f, 1) : key === 'Shift+ArrowRight' ? above(f, 10) : key === 'ArrowLeft' ? below(f, 1) : below(f, 10));
      await pm.keyboard.press(key);
      await frame(pm);
      const got = (await marks(pm))[0];
      ok(got === exp && linkOf(pm).sweep.markers[0] === got, () => `${key}: the marker steps to ${exp} (${got})`);
      f = got;
    }
    ok(await pm.evaluate(() => document.activeElement?.getAttribute('data-sweep-marker')) === '0', 'the marker keeps the focus');
    // A second marker by the panel's button (at f0), then Delete on the first and the panel's Remove on the other.
    await pm.click('[data-sweep-add]');
    await frame(pm);
    m = await marks(pm);
    ok(m.length === 2 && m[1] === 100e6 && linkOf(pm).sweep.markers.join() === m.join(), () => `Add marker puts one at f0: ${m}`);
    const linkNow = new URL(pm.url()).search;
    await pm.focus('[data-sweep-marker="0"]');
    await pm.keyboard.press('Delete');
    await frame(pm);
    m = await marks(pm);
    ok(m.length === 1 && m[0] === 100e6 && linkOf(pm).sweep.markers.join() === '100000000', () => `Delete removes the focused marker: ${m}`);
    ok(await pm.evaluate(() => document.activeElement?.getAttribute('data-sweep-marker')) === '0', 'the focus goes to the next marker');
    await pm.click('[data-sweep-remove="0"]');
    await frame(pm);
    ok((await marks(pm)).length === 0 && linkOf(pm).sweep.markers.length === 0 && !new URL(pm.url()).search.includes('mk='), 'Remove in the panel removes it');
    // The link with two markers comes back.
    await load(pm, linkNow);
    await full(pm);
    await frame(pm);
    const back = S.decodeCircuit(linkNow).sweep.markers;
    m = await marks(pm);
    ok(m.length === 2 && m.every((x, i) => x === back[i]), () => `markers from the link: ${m} (${back})`);
    ok(await pm.$$eval('[data-sweep-marker]', (els) => els.every((e) => !e.hidden)), 'both are shown');
    // The band's fields: a log band from the panel, the stop typed, the markers outside left out.
    await pm.click('[data-sweep-log="log"]');
    await pm.fill('#smith-f-sweep-stop', '120 MHz');
    await frame(pm);
    L = linkOf(pm);
    ok(L.sweep.band.log && L.sweep.band.stop === 120e6 && L.sweep.markers.every((x) => x <= 120e6), () => `log and a typed stop reach the link: ${new URL(pm.url()).search}`);
    await full(pm);
    want = expected(L.circuit, L.sweep.band);
    let cmp = compare(parseD(await traceD(pm)), Array.from(want.gamma));
    ok(cmp.same, () => `the new band's trace equals the sweep (worst ${cmp.worst})`);
    await pm.uncheck('[data-sweep-on]');
    await frame(pm);
    ok(!new URL(pm.url()).search.includes('sw=') && await pm.$eval('[data-layer="sweep"]', (g) => g.getAttribute('display') === 'none'), 'turned off: no trace and no sw in the link');
    await pm.check('[data-sweep-on]');
    await full(pm);
    ok(linkOf(pm).sweep?.band.stop === 120e6, 'turned on again: the band before');
    ok(pm.errors.length === 0, () => `markers: no errors (${pm.errors.join(' | ')})`);
    await pm.close();

    // ---------- the trace follows a handle's drag ----------
    const pd = await open(desk, TEN + BIG);
    await full(pd);
    const pressed = await pd.getAttribute('[data-snap-toggle]', 'aria-pressed');
    if (pressed === 'true') { await pd.click('[data-snap-toggle]'); await frame(pd); }
    const c10 = linkOf(pd).circuit, band = linkOf(pd).sweep.band;
    const nodes = new Float64Array((c10.parts.length + 1) * N.NODE_STRIDE), g = [0, 0];
    N.evaluate(nodes, P.packParts(c10.parts), c10.parts.length, c10.loadR, c10.loadX, c10.z0, c10.f0, c10.f0);
    N.nodeGamma(g, 0, nodes, 3 * N.NODE_STRIDE);
    vs = await viewState(pd);
    const h = client(vs, g[0], g[1]);
    await pd.mouse.move(...h);
    await pd.mouse.down();
    let coarseOk = 0, coarseN = 0, worst = 0, states = new Set();
    for (let j = 1; j <= 8; j++) {
      await pd.mouse.move(h[0] + 6 * j, h[1] - 4 * j);
      await frame(pd);
      const st = await pd.evaluate(() => {
        const box = document.querySelector('[data-chart]'), t = box.smithTrace, live = box.smithPath.liveCircuit;
        return { live: live && JSON.parse(JSON.stringify(live)), n: t.coarseN, d: document.querySelector('[data-sweep-trace]').getAttribute('d'), state: t.stateName };
      });
      states.add(st.state);
      if (!st.live) continue;
      const e = expectedCoarse(st.live, band, st.n), c = compare(parseD(st.d), Array.from(e.gamma));
      worst = Math.max(worst, c.worst);
      if (c.same) coarseOk++;
      coarseN = st.n;
    }
    ok(coarseOk === 8 && states.size === 1 && states.has('coarse'), () => `during the drag every frame's trace is the coarse sweep of the live circuit (${coarseOk} of 8, ${coarseN} points, worst ${worst}, ${[...states]})`);
    ok(coarseN >= SW.MIN_POINTS && coarseN < 10000, `the drag's trace is coarse: ${coarseN} points`);
    await pd.mouse.up();
    await full(pd);
    await frame(pd);
    const after = linkOf(pd).circuit;
    ok(after.parts[2].value !== c10.parts[2].value, 'the drag committed a new value');
    want = expected(after, band);
    cmp = compare(parseD(await traceD(pd)), Array.from(want.gamma));
    ok(cmp.same && cmp.n === 10000, () => `after the release the trace is the full sweep of the committed circuit (${cmp.n} points, worst ${cmp.worst})`);
    ok(pd.errors.length === 0, () => `drag: no errors (${pd.errors.join(' | ')})`);
    await pd.close();

    // ---------- timing: the 4× drag of ui-drag.mjs with a 10,000-point band ----------
    const pt = await desk.newPage();
    pt.errors = [];
    pt.on('pageerror', (e) => pt.errors.push(e.message));
    for (const rate of [1, 4]) {
      const runs = [];
      for (let i = 0; i < 3; i++) runs.push(await timing(pt, rate, TEN + BIG));
      runs.sort((a, b) => a.main - b.main);
      const t = runs[1];
      t.runs = runs.map((r) => r.main.toFixed(2)).join(', ');
      timesOut.push(t);
      ok(t.traceFrames > 0.8 * t.layerFrames, `CPU ${rate}×: the trace was drawn in ${t.traceFrames} of the path's ${t.layerFrames} drag frames`);
      ok(t.tp95 <= 1, `CPU ${rate}×: the trace's script per drag frame p95 ${t.tp95.toFixed(3)} ms (budget ${0.3} ms)`);
    }
    ok(pt.errors.length === 0, () => `timing: no errors (${pt.errors.join(' | ')})`);
    await pt.close();
    await desk.close();

    // ---------- touch and phone widths ----------
    for (const width of [390, 320]) {
      const ctx = await browser.newContext({ viewport: { width, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' });
      const p = await open(ctx, `?${S.encodeCircuit(S.defaultCircuit())}&sw=50e6:150e6:401&mk=60e6`);
      await full(p);
      await p.locator('[data-chart]').scrollIntoViewIfNeeded();
      await frame(p);
      const q = await freePoint(p, 60, 30);
      const vt = await viewState(p);
      const cdp = await ctx.newCDPSession(p);
      const at = client(vt, q.gr, q.gi);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: at[0], y: at[1], id: 0 }] });
      await sleep(40);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await sleep(60);
      await frame(p);
      const tm = await marks(p);
      ok(tm.length === 2 && tm[1] >= q.lo && tm[1] <= q.hi && linkOf(p).sweep.markers.length === 2, () => `${width} px: a tap on the trace adds a marker (${tm}; ${q.lo}…${q.hi})`);
      const sw = await p.evaluate(() => ({ s: document.documentElement.scrollWidth, c: document.documentElement.clientWidth }));
      ok(sw.s <= sw.c, `${width} px: no horizontal scroll (${sw.s} > ${sw.c})`);
      const panel = await p.$eval('[data-sweep]', (e) => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, vw: document.documentElement.clientWidth }; });
      ok(panel.l >= 0 && panel.r <= panel.vw, `${width} px: the Sweep panel fits (${JSON.stringify(panel)})`);
      ok(p.errors.length === 0, () => `${width} px: no errors (${p.errors.join(' | ')})`);
      await ctx.close();
    }
  }
} catch (e) {
  ok(false, `the run stopped: ${e.stack ?? e}`);
}

await browser.close();
stopServer();
for (const failure of failures) console.log(`FAIL ${failure}`);
for (const t of timesOut) {
  console.log(`trace: drag 2 s with 10 parts and a 10,000-point band at CPU ${t.rate}× (headless): ${t.ticks} frames, path drawn in ${t.layerFrames}, trace in ${t.traceFrames}, ${t.lost} lost; `
    + `trace script p50 ${t.tp50.toFixed(3)} / p95 ${t.tp95.toFixed(3)} ms at ${t.n50} points; path p95 ${t.p95.toFixed(3)} ms; main thread ${t.main.toFixed(2)} ms per frame (runs ${t.runs}); after the release the refined trace in ${t.fullMs.toFixed(1)} ms (worker ${t.workerMs.toFixed(1)} ms, main thread ${t.applyMs.toFixed(2)} ms)`);
}
if (!AB) console.log(`trace: ${passed} of ${passed + failed} checks passed`);
process.exitCode = failed ? 1 : 0;
