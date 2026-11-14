// Drives /smith-chart/main in the installed Edge (or Chrome) and checks the sweep's plot, band figures and marker table
// (step M7.2b): the plot's points read back from the DOM (its `d`, whole numbers of plot.ts's frame) equal the engine's
// return loss or VSWR at every point of the refined sweep for five circuits; the band figures on the page equal
// sweep.ts bandFigures of the same trace at the link's limit; pointing at the plot (mouse, touch, keys) puts the
// chart's cursor on the trace at that frequency and pointing at the trace puts the plot's cursor there; markers added,
// dragged and stepped on either view agree on both and in the link; the marker table equals markerAt in the page's
// digits; during a handle's drag the plot is the coarse sweep of the live circuit (each frame) and after the release the
// refined one; its script per drag frame at 4× CPU; no horizontal scroll at 320 and 390 px.
//   tsx ui-plot.mjs [- [base URL]]   (part of npm run ui; the first argument is not used)

import { spawn, execSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright-core';

import * as importedState from '../../../lib/smith/state.ts';
import * as importedSweep from '../../../lib/smith/sweep.ts';
import * as importedPlot from '../../../lib/smith/plot.ts';
import * as importedNetwork from '../../../lib/smith/network.ts';
import * as importedParts from '../../../lib/smith/parts.ts';
import * as importedConvert from '../../../lib/smith/convert.ts';
import * as importedQuantity from '../../../lib/quantity.ts';
import * as importedReadout from '../../../components/Smith/readout.ts';

const S = importedState.default ?? importedState;
const SW = importedSweep.default ?? importedSweep;
const PL = importedPlot.default ?? importedPlot;
const N = importedNetwork.default ?? importedNetwork;
const P = importedParts.default ?? importedParts;
const C = importedConvert.default ?? importedConvert;
const Q = importedQuantity.default ?? importedQuantity;
const R = importedReadout.default ?? importedReadout;
const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../../..');
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

let passed = 0, failed = 0;
const failures = [];
const ok = (condition, what) => { if (condition) passed++; else if (failed++ < 60) failures.push(typeof what === 'function' ? what() : what); };
const frame = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
/** Plot values: x within 5e-7 of the band, y within the frame's rounding (0.5 / PLOT_Y); Node and the browser may differ by an ulp. */
const TOL = 1e-6;
const rel = (a, b, t = 1e-9) => Object.is(a, b) || Math.abs(a - b) <= t * Math.max(Math.abs(a), Math.abs(b), 1e-300);

const TEN = '?v=1&z0=50&f0=100e6&zl=25:25&p=cs:31.83e-12,lp:79.58e-9,tl:0.3:75,so:0.1:50,rs:10,ls:20n,cp:5p,ss:0.2:60,qw:35,rp:200&u=1,5';
const START = `?${S.encodeCircuit(S.defaultCircuit())}`;

function refined(c, band) {
  const sc = SW.sweepCircuit(c), tr = new SW.Trace();
  SW.runSweep(tr, band, sc);
  return { sc, tr };
}
/** The engine's plot points (x: place in the band, y: return loss or VSWR) of a trace. */
function plotPoints(freqs, gamma, n, band, vswr) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(PL.bandPos(freqs[i], band.start, band.stop, band.log), PL.plotValue(Math.hypot(gamma[2 * i], gamma[2 * i + 1]), vswr));
  return out;
}
function parseD(d) {
  const out = [];
  for (const sub of d.split('M')) {
    if (!sub.trim()) continue;
    const v = sub.trim().split(/\s+/).map(Number);
    for (let i = 0; i + 1 < v.length; i += 2) out.push(v[i] / PL.PLOT_X, v[i + 1] / PL.PLOT_Y);
  }
  return out;
}
function compare(got, want) {
  let worst = 0;
  if (got.length !== want.length) return { same: false, worst: Infinity, n: got.length / 2 };
  for (let i = 0; i < got.length; i++) worst = Math.max(worst, Math.abs(got[i] - want[i]) / (i % 2 ? Math.max(1, Math.abs(want[i])) : 1) - (i % 2 ? 0.5 / PL.PLOT_Y : 0));
  return { same: worst <= TOL, worst, n: got.length / 2 };
}
/** Differences between two BandFigures (empty when equal to `t` relative). */
function figDiff(a, b, t = 1e-9) {
  const bad = [];
  const same = (x, y, what) => { if (!rel(x, y, t)) bad.push(`${what} ${x} ≠ ${y}`); };
  for (const k of ['worstRL', 'bestRL', 'maxVswr', 'threshold', 'fractional']) if (!(Number.isNaN(a[k]) && Number.isNaN(b[k]))) same(a[k], b[k], k);
  same(a.worst.f, b.worst.f, 'worst.f'); same(a.best.f, b.best.f, 'best.f');
  if (a.intervals.length !== b.intervals.length) bad.push(`${a.intervals.length} intervals ≠ ${b.intervals.length}`);
  else a.intervals.forEach((iv, i) => { same(iv.lo, b.intervals[i].lo, `interval ${i} lo`); same(iv.hi, b.intervals[i].hi, `interval ${i} hi`); if (iv.openLo !== b.intervals[i].openLo || iv.openHi !== b.intervals[i].openHi) bad.push(`interval ${i} ends`); });
  if (!a.atF0 !== !b.atF0) bad.push('atF0'); else if (a.atF0) { same(a.atF0.lo, b.atF0.lo, 'atF0.lo'); same(a.atF0.hi, b.atF0.hi, 'atF0.hi'); }
  if (!a.q !== !b.q) bad.push('q'); else if (a.q) { same(a.q.q, b.q.q, 'q'); same(a.q.f, b.q.f, 'q.f'); }
  return bad;
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
/** Waits for the refined trace, its figures and the plot drawn from them. */
const full = async (page) => {
  await page.waitForFunction(() => document.querySelector('[data-sweep-results]')?.getAttribute('data-state') === 'full' && !!document.querySelector('[data-figures]'), null, { timeout: 10000 });
  await frame(page);
};
const linkOf = (page) => S.decodeCircuit(new URL(page.url()).search);
const plotD = (page) => page.getAttribute('[data-plot-trace]', 'd');
/** The plot's geometry: the svg's client rect and the plot area, the axis and the band. */
const plotState = (page) => page.evaluate(() => {
  const box = document.querySelector('[data-plot]'), p = box.smithPlot, r = box.querySelector('svg').getBoundingClientRect();
  return { left: r.left, top: r.top, L: p.L, T: p.T, W: p.W, H: p.H, axis: p.axis, start: p.start, stop: p.stop, log: p.log, f0: p.f0, vswr: p.isVswr };
});
const chartState = (page) => page.evaluate(() => {
  const box = document.querySelector('[data-chart]'), v = box.smithChart, r = box.getBoundingClientRect();
  return { cx: v.cx, cy: v.cy, k: v.k, w: v.w, h: v.h, left: r.left + box.clientLeft, top: r.top + box.clientTop };
});
const client = (vs, gr, gi) => [vs.left + vs.w / 2 + (gr - vs.cx) * vs.k, vs.top + vs.h / 2 - (gi - vs.cy) * vs.k];
/** The page's fAt: the frequency at svg-local x. */
const fAt = (ps, x) => { const u = (x - ps.L) / ps.W; return PL.bandFreq(u < 0 ? 0 : u > 1 ? 1 : u, ps.start, ps.stop, ps.log); };
/** svg-local y of a value, clamped to the plot area as the page draws markers. */
const yOf = (ps, v) => Math.min(ps.T + ps.H, Math.max(ps.T, ps.T + ((v - ps.axis.top) / (ps.axis.bottom - ps.axis.top)) * ps.H));
const cursors = (page) => page.evaluate(() => {
  const ce = document.querySelector('[data-sweep-cursor]'), pc = document.querySelector('[data-plot-cursor]');
  const m = /translate\(([-\d.e]+)px,\s*([-\d.e]+)px\)/.exec(ce.style.transform);
  return { chartF: Number(ce.getAttribute('data-f')), chartShown: !ce.hidden, cx: m ? Number(m[1]) : NaN, cy: m ? Number(m[2]) : NaN,
    plotF: Number(pc.getAttribute('data-f')), plotShown: pc.getAttribute('display') !== 'none', from: document.querySelector('[data-chart]').smithTrace.cursorFrom,
    lineX: Number(pc.querySelector('line').getAttribute('x1')) };
});
const marks = (page) => page.evaluate(() => ({
  chart: [...document.querySelectorAll('[data-sweep-marker]')].map((e) => Number(e.getAttribute('data-f'))),
  plot: [...document.querySelectorAll('[data-plot-marker]')].map((e) => Number(e.getAttribute('data-f'))),
}));
/** A trace point clear of the circuit's path, its handles and the markers (ui-trace.mjs's freePoint). */
const freePoint = (page, from, margin = 40) => page.evaluate(([from, margin]) => {
  const box = document.querySelector('[data-chart]'), v = box.smithChart, t = box.smithTrace, path = box.smithPath, tr = t.shown;
  const step = Math.max(1, Math.floor(tr.n / 400));
  for (let i = from; i < tr.n - 1; i += step) {
    const px = v.screenX(tr.gamma[2 * i]), py = v.screenY(tr.gamma[2 * i + 1]);
    if (px < margin || py < margin || px > v.w - margin || py > v.h - margin) continue;
    if (path.pick(px, py)[0] !== 0 || path.handleAt(px, py) >= 0 || t.markerHit(px, py) >= 0) continue;
    let clear = true;
    for (let dx = -16; dx <= 16 && clear; dx += 8) for (let dy = -16; dy <= 16; dy += 8) if (path.pick(px + dx, py + dy)[0] !== 0) { clear = false; break; }
    if (!clear) continue;
    return { i, f: tr.freqs[i], lo: tr.freqs[i - 1] ?? tr.freqs[i], hi: tr.freqs[i + 1], gr: tr.gamma[2 * i], gi: tr.gamma[2 * i + 1] };
  }
  return null;
}, [from, margin]);
/** The marker table's texts in Node: the page's MarkerTable.tsx markerTexts. */
function tableTexts(c, markers, d) {
  const sc = SW.sweepCircuit(c);
  return markers.map((f) => {
    const p = SW.markerAt(sc, f);
    return [Q.formatAmount(p.f, 'Hz', d, true), R.complexText(p.zr, p.zi, 'Ω', d, Q.ROUNDING_FLOOR * c.z0),
      R.gammaPolarText(p.mag, C.toDegrees(C.gammaAngle(p.gr, p.gi)), d), Q.formatAmount(p.vswr, '', d, true), Q.formatReturnLoss(p.rl, d)];
  });
}
const pageTable = (page) => page.$$eval('[data-marker-row]', (rows) => rows.map((r) => [...r.querySelectorAll('td')].map((td) => td.textContent)));
const noSideScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

try {
  const desk = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: 'light' });

  // ---------- the plot and the band figures equal the engine, five circuits ----------
  const cases = [
    ['start circuit, linear, return loss', START, '&sw=50e6:150e6:401'],
    ['10 parts, log, VSWR, limit 6 dB', TEN, '&sw=1e6:1e9:1001:log&sl=6&sp=vswr'],
    ['open stub and line, from 0 Hz', '?v=1&z0=50&f0=1e9&zl=100:-50&p=tl:0.2:50,so:0.15:50', '&sw=0:3e9:301'],
    ['λ/4 transformer, 10,000 points, limit 20 dB', '?v=1&z0=50&f0=1e9&zl=200:0&p=qw:100', '&sw=0.2e9:1.8e9:10000&sl=20'],
    ['series RLC, narrow log, VSWR', '?v=1&z0=50&f0=100e6&zl=25:0&p=ls:400n,cs:6.333e-12', '&sw=90e6:110e6:51:log&sp=vswr'],
  ];
  const pc = await open(desk, cases[0][1] + cases[0][2]);
  for (const [name, link, sw] of cases) {
    await load(pc, link + sw);
    await full(pc);
    const d = linkOf(pc), band = d.sweep.band, vswr = !!d.sweep.vswr, limit = d.sweep.limit ?? S.SWEEP_LIMIT_DB;
    ok(d.issues.length === 0, `${name}: the link reads without issues (${d.issues})`);
    const { sc, tr } = refined(d.circuit, band);
    const cmp = compare(parseD(await plotD(pc)), plotPoints(tr.freqs, tr.gamma, tr.n, band, vswr));
    ok(cmp.same && cmp.n === tr.n, () => `${name}: the plot's points equal the engine's ${vswr ? 'VSWR' : 'return loss'} (${cmp.n} of ${tr.n}, worst ${cmp.worst})`);
    const want = SW.bandFigures(tr, sc, C.magFromReturnLoss(limit));
    const got = await pc.evaluate(() => document.querySelector('[data-chart]').smithTrace.figures);
    const bad = figDiff(got, want);
    ok(bad.length === 0, () => `${name}: the page's band figures equal bandFigures (${bad.slice(0, 4).join('; ')})`);
    const texts = await pc.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-fig]')].map((e) => [e.getAttribute('data-fig'), e.querySelector('dd').textContent])));
    const dg = 4;
    ok(texts.worst?.startsWith(`${Q.formatReturnLoss(want.worstRL, dg)} at ${Q.formatAmount(want.worst.f, 'Hz', dg, true)}`), () => `${name}: worst return loss shown (${texts.worst})`);
    ok(texts.best?.startsWith(`${Q.formatReturnLoss(want.bestRL, dg)} at ${Q.formatAmount(want.best.f, 'Hz', dg, true)}`), () => `${name}: best return loss shown (${texts.best})`);
    ok(texts.vswr === Q.formatAmount(want.maxVswr, '', dg, true), () => `${name}: largest VSWR shown (${texts.vswr})`);
    const shown = await pc.$$eval('[data-fig="intervals"] [data-lo]', (es) => es.map((e) => [Number(e.getAttribute('data-lo')), Number(e.getAttribute('data-hi'))]));
    const shades = await pc.$$eval('[data-plot-shade] rect', (es) => es.length);
    ok(shown.length === want.intervals.length && shown.every(([lo, hi], i) => rel(lo, want.intervals[i].lo) && rel(hi, want.intervals[i].hi)) && shades === want.intervals.length,
      () => `${name}: the intervals below the limit listed and shaded (${shown.length}, ${shades} shaded, want ${want.intervals.length})`);
    if (want.atF0) ok(texts.f0?.includes(Q.formatAmount(100 * want.fractional, '%', dg, true)), () => `${name}: the fractional bandwidth shown (${texts.f0})`);
    if (want.q) ok(texts.q?.includes(Q.formatAmount(want.q.q, '', dg, true)), () => `${name}: the loaded Q shown (${texts.q})`);
    // The limit line at the limit, the f0 line at f0.
    const ps = await plotState(pc);
    const lim = await pc.evaluate(() => Number(document.querySelector('[data-plot-limit]').getAttribute('data-value')));
    ok(rel(lim, PL.plotValue(C.magFromReturnLoss(limit), vswr), 1e-12), `${name}: the limit line at ${lim}`);
    const f0x = await pc.evaluate(() => { const l = document.querySelector('[data-plot-f0]'); return l.getAttribute('display') === 'none' ? NaN : Number(l.getAttribute('x1')); });
    const in0 = d.circuit.f0 >= band.start && d.circuit.f0 <= band.stop;
    ok(in0 ? Math.abs(f0x - (ps.L + PL.bandPos(d.circuit.f0, band.start, band.stop, band.log) * ps.W)) < 1e-6 : f0x !== f0x, `${name}: the f0 line (${f0x})`);
  }
  ok(pc.errors.length === 0, () => `plots: no errors (${pc.errors.join(' | ')})`);

  // ---------- switch and limit on the page ----------
  await load(pc, START + '&sw=50e6:150e6:401');
  await full(pc);
  await pc.click('[data-plot-kind="vswr"]');
  await full(pc);
  let L = linkOf(pc), t0 = refined(L.circuit, L.sweep.band);
  let cmp = compare(parseD(await plotD(pc)), plotPoints(t0.tr.freqs, t0.tr.gamma, t0.tr.n, L.sweep.band, true));
  ok(L.sweep.vswr === true && cmp.same, () => `the VSWR switch: in the link (${new URL(pc.url()).search}) and the plot is the VSWR (worst ${cmp.worst})`);
  await pc.fill('#smith-f-sweep-limit', '-15 dB');
  await frame(pc);
  await pc.waitForFunction(() => document.querySelector('[data-chart]').smithTrace.figures?.threshold < 0.2);
  L = linkOf(pc);
  const f15 = await pc.evaluate(() => document.querySelector('[data-chart]').smithTrace.figures);
  const bad15 = figDiff(f15, SW.bandFigures(t0.tr, t0.sc, C.magFromReturnLoss(15)));
  ok(L.sweep.limit === 15 && bad15.length === 0, () => `a typed limit of −15 dB: sl=15 in the link (${L.sweep.limit}) and the figures at 15 dB (${bad15.slice(0, 3)})`);
  await pc.close();

  // ---------- pointing both ways and markers on both, by mouse and keys ----------
  const pm = await open(desk, START + '&sw=50e6:150e6:401');
  await full(pm);
  // The chart and the plot both in view (the plot's bottom at the window's).
  await pm.$eval('[data-plot]', (e) => e.scrollIntoView({ block: 'end' }));
  await frame(pm);
  let ps = await plotState(pm), vs = await chartState(pm);
  const sc0 = SW.sweepCircuit(linkOf(pm).circuit);
  // The plot → the chart.
  let cx = Math.round(ps.left + ps.L + 0.37 * ps.W), cy = Math.round(ps.top + ps.T + ps.H / 2);
  await pm.mouse.move(cx, cy);
  await frame(pm);
  let cu = await cursors(pm), fWant = fAt(ps, cx - ps.left), g = SW.markerAt(sc0, fWant);
  ok(cu.chartShown && cu.plotShown && rel(cu.chartF, fWant, 1e-12) && rel(cu.plotF, fWant, 1e-12), () => `hovering the plot at ${fWant} Hz: the cursor at that frequency on both (${cu.chartF}, ${cu.plotF})`);
  ok(Math.abs(cu.cx - (vs.w / 2 + (g.gr - vs.cx) * vs.k)) < 1e-3 && Math.abs(cu.cy - (vs.h / 2 - (g.gi - vs.cy) * vs.k)) < 1e-3, () => `…and on the chart at Γ(f) (${cu.cx}, ${cu.cy})`);
  await pm.mouse.move(cx, ps.top - 40);
  await frame(pm);
  cu = await cursors(pm);
  ok(!cu.chartShown && !cu.plotShown, 'leaving the plot hides the cursor on both');
  // The chart → the plot.
  const p1 = await freePoint(pm, 30);
  ok(p1 !== null, 'a trace point clear of the path');
  await pm.mouse.move(...client(vs, p1.gr, p1.gi).map(Math.round));
  await frame(pm);
  cu = await cursors(pm);
  ok(cu.plotShown && cu.plotF === cu.chartF && cu.plotF >= p1.lo && cu.plotF <= p1.hi && Math.abs(cu.lineX - (ps.L + PL.bandPos(cu.plotF, ps.start, ps.stop, ps.log) * ps.W)) < 1e-6,
    () => `hovering the trace: the plot's cursor at the same frequency (${cu.plotF} in ${p1.lo}…${p1.hi}, line at ${cu.lineX})`);
  // A click on the plot's curve adds a marker there, on both.
  const fx = Math.round(ps.left + ps.L + 0.62 * ps.W), ff = fAt(ps, fx - ps.left);
  const fy = Math.round(ps.top + yOf(ps, PL.plotValue(SW.markerAt(sc0, ff).mag, false)));
  await pm.mouse.click(fx, fy);
  await frame(pm);
  let mk = await marks(pm);
  ok(mk.chart.length === 1 && mk.plot.length === 1 && rel(mk.chart[0], ff, 1e-12) && mk.plot[0] === mk.chart[0] && linkOf(pm).sweep.markers[0] === mk.chart[0],
    () => `a click on the plot's curve adds a marker at ${ff} on both and in the link (${mk.chart}, ${mk.plot})`);
  // Dragging it on the plot moves it on both.
  ps = await plotState(pm);
  const mx = await pm.evaluate(() => document.querySelector('[data-plot]').smithPlot.mx[0]);
  const my = await pm.evaluate(() => { const p = document.querySelector('[data-plot]').smithPlot; return Number(/translate\(([-\d.e]+) ([-\d.e]+)\)/.exec(document.querySelector('[data-plot-marker="0"]').getAttribute('transform'))[2]); });
  const dx0 = Math.round(ps.left + mx), dy0 = Math.round(ps.top + my), dx1 = dx0 - Math.round(0.2 * ps.W);
  await pm.mouse.move(dx0, dy0);
  await pm.mouse.down();
  for (let j = 1; j <= 5; j++) { await pm.mouse.move(dx0 + ((dx1 - dx0) * j) / 5, dy0 + 3 * j); await frame(pm); }
  const midF = (await marks(pm)).chart[0];
  await pm.mouse.up();
  await frame(pm);
  mk = await marks(pm);
  const off = (dx0 - ps.left) - mx, fDrag = fAt(ps, (dx1 - ps.left) - off);
  ok(rel(mk.chart[0], fDrag, 1e-12) && mk.plot[0] === mk.chart[0] && linkOf(pm).sweep.markers[0] === mk.chart[0] && midF !== ff,
    () => `dragging the marker on the plot moves it on both and in the link (${mk.chart[0]} want ${fDrag}, ${mk.plot[0]})`);
  // A key on the chart's marker moves it on the plot.
  await pm.focus('[data-sweep-marker="0"]');
  await pm.keyboard.press('ArrowRight');
  await frame(pm);
  const mk2 = await marks(pm);
  ok(mk2.chart[0] > mk.chart[0] && mk2.plot[0] === mk2.chart[0], () => `a key on the chart's marker moves it on the plot (${mk2.chart[0]}, ${mk2.plot[0]})`);
  // The plot's keys: the cursor at f0, then to the next trace point, Enter adds a marker, End, Escape.
  await pm.mouse.move(5, 5);
  await frame(pm);
  await pm.focus('[data-plot]');
  await pm.keyboard.press('ArrowRight');
  await frame(pm);
  cu = await cursors(pm);
  const f0 = linkOf(pm).circuit.f0;
  ok(cu.chartF === f0 && cu.plotF === f0, () => `the plot's first arrow key puts the cursor at f0 (${cu.chartF})`);
  await pm.keyboard.press('ArrowRight');
  await frame(pm);
  cu = await cursors(pm);
  const next = await pm.evaluate((f0) => { const t = document.querySelector('[data-chart]').smithTrace.shown; for (let i = 0; i < t.n; i++) if (t.freqs[i] > f0) return t.freqs[i]; return NaN; }, f0);
  ok(cu.chartF === next && cu.plotF === next, () => `→ moves it to the next trace point (${cu.chartF}, want ${next})`);
  await pm.keyboard.press('Enter');
  await frame(pm);
  mk = await marks(pm);
  ok(mk.chart.length === 2 && mk.chart[1] === next && mk.plot[1] === next, () => `Enter adds a marker at the cursor (${mk.chart})`);
  await pm.keyboard.press('End');
  await frame(pm);
  cu = await cursors(pm);
  ok(cu.chartF === 150e6, `End: the cursor at the band's stop (${cu.chartF})`);
  await pm.keyboard.press('Escape');
  await frame(pm);
  cu = await cursors(pm);
  ok(!cu.chartShown && !cu.plotShown, 'Escape hides the cursor');
  // The marker table equals markerAt, at 4 and 6 digits.
  for (const dg of [4, 6]) {
    if (dg !== 4) { await pm.selectOption('[data-digits]', String(dg)); await frame(pm); }
    const want = tableTexts(linkOf(pm).circuit, linkOf(pm).sweep.markers, dg), got = await pageTable(pm);
    ok(JSON.stringify(got) === JSON.stringify(want), () => `the marker table at ${dg} digits equals markerAt (${JSON.stringify(got[0])} want ${JSON.stringify(want[0])})`);
  }
  await pm.selectOption('[data-digits]', '4');
  ok(pm.errors.length === 0, () => `pointing: no errors (${pm.errors.join(' | ')})`);
  await pm.close();

  // ---------- the plot follows a handle's drag, exact after the release; its script per frame ----------
  const pd = await open(desk, TEN + '&sw=20e6:180e6:10000');
  await full(pd);
  if ((await pd.getAttribute('[data-snap-toggle]', 'aria-pressed')) === 'true') { await pd.click('[data-snap-toggle]'); await frame(pd); }
  const c10 = linkOf(pd).circuit, band = linkOf(pd).sweep.band;
  const nodes = new Float64Array((c10.parts.length + 1) * N.NODE_STRIDE), gg = [0, 0];
  N.evaluate(nodes, P.packParts(c10.parts), c10.parts.length, c10.loadR, c10.loadX, c10.z0, c10.f0, c10.f0);
  N.nodeGamma(gg, 0, nodes, 3 * N.NODE_STRIDE);
  vs = await chartState(pd);
  const h = client(vs, gg[0], gg[1]);
  await pd.mouse.move(...h);
  await pd.mouse.down();
  let good = 0, worst = 0, states = new Set();
  for (let j = 1; j <= 8; j++) {
    await pd.mouse.move(h[0] + 6 * j, h[1] - 4 * j);
    await frame(pd);
    const st = await pd.evaluate(() => {
      const box = document.querySelector('[data-chart]'), t = box.smithTrace, live = box.smithPath.liveCircuit;
      return { live: live && JSON.parse(JSON.stringify(live)), n: t.coarseN, d: document.querySelector('[data-plot-trace]').getAttribute('d'), state: document.querySelector('[data-sweep-results]').getAttribute('data-state') };
    });
    states.add(st.state);
    if (!st.live) continue;
    const sc = SW.sweepCircuit(st.live), tr = new SW.Trace();
    SW.sweepBand(tr, { ...band, points: st.n }, sc);
    const c = compare(parseD(st.d), plotPoints(tr.freqs, tr.gamma, tr.n, band, false));
    worst = Math.max(worst, c.worst);
    if (c.same) good++;
  }
  ok(good === 8 && states.size === 1 && states.has('coarse'), () => `during the drag every frame's plot is the coarse sweep of the live circuit (${good} of 8, worst ${worst}, ${[...states]})`);
  await pd.mouse.up();
  await full(pd);
  const after = linkOf(pd).circuit, ta = refined(after, band);
  cmp = compare(parseD(await plotD(pd)), plotPoints(ta.tr.freqs, ta.tr.gamma, ta.tr.n, band, false));
  ok(after.parts[2].value !== c10.parts[2].value && cmp.same && cmp.n === 10000, () => `after the release the plot is the refined sweep of the committed circuit (${cmp.n} points, worst ${cmp.worst})`);
  const figA = await pd.evaluate(() => document.querySelector('[data-chart]').smithTrace.figures);
  const badA = figDiff(figA, SW.bandFigures(ta.tr, ta.sc, C.magFromReturnLoss(S.SWEEP_LIMIT_DB)));
  ok(badA.length === 0, () => `after the release the figures are the committed circuit's (${badA.slice(0, 3)})`);
  // ui-drag.mjs's drag (a 2 s circle on part 3's handle) at 1× and 4×: the plot's own script per drag frame.
  for (const rate of [1, 4]) {
    await load(pd, TEN + '&sw=20e6:180e6:10000');
    await full(pd);
    const cdp = await pd.context().newCDPSession(pd);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate });
    const res = await pd.evaluate(([hx, hy]) => new Promise((done) => {
      const box = document.querySelector('[data-chart]'), tl = box.smithTrace, pv = document.querySelector('[data-plot]').smithPlot;
      const ev = (type, x, y) => box.dispatchEvent(new PointerEvent(type, { pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0, buttons: 1, clientX: x, clientY: y, bubbles: true, cancelable: true }));
      const plots = [], ns = [];
      let tseen = tl.frames, pseen = pv.frames, traces = 0, x = hx, y = hy;
      ev('pointerdown', hx, hy);
      const start = performance.now();
      const tick = (t) => {
        if (tl.frames !== tseen) { traces++; tseen = tl.frames; }
        if (pv.frames !== pseen) { plots.push(pv.lastMs); ns.push(pv.lastN); pseen = pv.frames; }
        if (t - start < 2000) requestAnimationFrame(tick); else { ev('pointerup', x, y); done({ plots, ns, traces }); }
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
    }), h);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    await cdp.detach();
    const q = (xs, f) => { const s = xs.slice().sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(f * s.length))] : NaN; };
    const p50 = q(res.plots, 0.5), p95 = q(res.plots, 0.95);
    console.log(`plot at ${rate}×: ${res.plots.length} frames of ${res.traces} trace frames, script p50 ${p50.toFixed(3)} / p95 ${p95.toFixed(3)} ms at ${q(res.ns, 0.5)} points`);
    ok(res.plots.length >= 0.8 * res.traces && res.plots.length > 10, `${rate}×: the plot drawn with the trace (${res.plots.length} of ${res.traces} frames)`);
    ok(p50 <= 0.3 && p95 <= 0.6, `${rate}×: the plot's script per drag frame p50 ${p50.toFixed(3)} ≤ 0.3 ms, p95 ${p95.toFixed(3)} ≤ 0.6 ms`);
  }
  ok(pd.errors.length === 0, () => `drag: no errors (${pd.errors.join(' | ')})`);
  await pd.close();
  await desk.close();

  // ---------- touch at 390 and 320 px ----------
  for (const [width, scheme] of [[390, 'light'], [320, 'dark']]) {
    const phone = await browser.newContext({ viewport: { width, height: 800 }, hasTouch: true, isMobile: true, colorScheme: scheme });
    const pt = await open(phone, START + '&sw=50e6:150e6:401&mk=80e6,120e6');
    await full(pt);
    await pt.$eval('[data-plot]', (e) => e.scrollIntoView({ block: 'center' }));
    await frame(pt);
    ps = await plotState(pt);
    const sc = SW.sweepCircuit(linkOf(pt).circuit);
    // A tap off the curve: the cursor on both at that frequency, no marker.
    let tx = Math.round(ps.left + ps.L + 0.42 * ps.W), tf = fAt(ps, tx - ps.left);
    const vOff = PL.plotValue(SW.markerAt(sc, tf).mag, false);
    const tyOff = Math.round(ps.top + (yOf(ps, vOff) > ps.T + ps.H / 2 ? ps.T + 6 : ps.T + ps.H - 6));
    await pt.touchscreen.tap(tx, tyOff);
    await frame(pt);
    cu = await cursors(pt);
    ok(rel(cu.chartF, tf, 1e-12) && cu.plotF === cu.chartF && (await marks(pt)).chart.length === 2, () => `${width} px: a tap on the plot puts the cursor at ${tf} on both (${cu.chartF}, ${cu.plotF})`);
    // A tap on the curve adds a marker on both.
    tx = Math.round(ps.left + ps.L + 0.55 * ps.W); tf = fAt(ps, tx - ps.left);
    await pt.touchscreen.tap(tx, Math.round(ps.top + yOf(ps, PL.plotValue(SW.markerAt(sc, tf).mag, false))));
    await frame(pt);
    mk = await marks(pt);
    ok(mk.chart.length === 3 && rel(mk.chart[2], tf, 1e-12) && mk.plot[2] === mk.chart[2], () => `${width} px: a tap on the curve adds a marker on both (${mk.chart}, ${mk.plot})`);
    // A tap on the chart's trace: a marker there and the plot's cursor at it.
    await pt.$eval('[data-chart]', (e) => e.scrollIntoView({ block: 'center' }));
    await frame(pt);
    const p2 = await freePoint(pt, 40, 30);
    if (p2) {
      vs = await chartState(pt);
      await pt.touchscreen.tap(...client(vs, p2.gr, p2.gi).map(Math.round));
      await frame(pt);
      mk = await marks(pt);
      cu = await cursors(pt);
      ok(mk.chart.length === 4 && mk.plot[3] === mk.chart[3] && cu.plotF === mk.chart[3] && cu.plotShown, () => `${width} px: a tap on the chart's trace adds a marker and puts the plot's cursor there (${mk.chart}, cursor ${cu.plotF})`);
    } else ok(false, `${width} px: a free trace point to tap`);
    const want = tableTexts(linkOf(pt).circuit, linkOf(pt).sweep.markers, 4), got = await pageTable(pt);
    ok(JSON.stringify(got) === JSON.stringify(want), () => `${width} px: the marker table equals markerAt (${got.length} rows)`);
    ok(await noSideScroll(pt), `${width} px: no horizontal scroll with the plot, figures and table`);
    const fits = await pt.evaluate(() => { const r = document.querySelector('[data-sweep-results]').getBoundingClientRect(); return r.left >= 0 && r.right <= document.documentElement.clientWidth + 0.5; });
    ok(fits, `${width} px: the results fit the width`);
    // M7.3: no cell of the marker table outside the box that clips it, unless that box scrolls and takes the focus.
    const cut = await pt.evaluate(() => {
      const bad = [];
      for (const td of document.querySelectorAll('[data-marker-table] td')) {
        const r = td.getBoundingClientRect();
        if (r.right > document.documentElement.clientWidth + 0.5 || r.left < -0.5) bad.push(`${td.textContent} past the screen`);
        for (let a = td.parentElement; a && a !== document.body; a = a.parentElement) {
          if (getComputedStyle(a).overflowX === 'visible') continue;
          const b = a.getBoundingClientRect();
          if ((r.left < b.left - 0.5 || r.right > b.right + 0.5) && !(a.scrollWidth > a.clientWidth && a.tabIndex >= 0)) bad.push(`${td.textContent} cut by ${a.tagName}`);
          break;
        }
      }
      return bad;
    });
    ok(cut.length === 0, () => `${width} px: no marker table cell cut (${cut.slice(0, 4).join(' | ')})`);
    ok(pt.errors.length === 0, () => `${width} px: no errors (${pt.errors.join(' | ')})`);
    await phone.close();
  }
} catch (e) {
  failed++;
  failures.push(`threw: ${e.stack ?? e}`);
} finally {
  await browser.close();
  stopServer();
}

console.log(`ui-plot: ${passed} passed, ${failed} failed`);
for (const f of failures) console.log(`FAIL ${f}`);
process.exit(failed ? 1 : 0);
