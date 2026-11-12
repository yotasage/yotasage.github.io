// Drives /smith-chart/main in the installed Edge (or Chrome) and checks the circuit's path on the chart (step M3.2):
// for the start circuit and 20 random circuits of every part kind (a line over 1.5 turns, values 0 and ∞, open and
// short loads) every arc is read back from the DOM (its `d` mapped to Γ through the world frame) and must start and
// end on the engine's nodes and have every arc midpoint and vertex on the part's locus to 1e-9 in Γ, on the side the
// part moves (lumped parts and stubs: the added r, x, g or b at the midpoint between 0 and the part's; lines: clockwise,
// the right number of half turns, the rest in the line's own chart); every arrow lies on its arc and points the way
// the engine moves the node when the value grows; the node markers sit on the nodes; the node table equals the
// engine's figures in the readout's texts and the goal line the input's |Γ|. Selection by mouse (strip, table, chart),
// keyboard and tap; hover; the path's frame time while zooming a 10-part circuit at 1× and 4× CPU; 320 and 390 px.
//   tsx ui-path.mjs [screenshot folder] [base URL]      (the last part of npm run ui)

import { spawn, execSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright-core';

import * as importedState from '../../../lib/smith/state.ts';
import * as importedNetwork from '../../../lib/smith/network.ts';
import * as importedGeometry from '../../../lib/smith/geometry.ts';
import * as importedParts from '../../../lib/smith/parts.ts';
import * as importedConvert from '../../../lib/smith/convert.ts';
import * as importedQuantity from '../../../lib/quantity.ts';
import * as importedReadout from '../../../components/Smith/readout.ts';

const S = importedState.default ?? importedState;
const N = importedNetwork.default ?? importedNetwork;
const G = importedGeometry.default ?? importedGeometry;
const P = importedParts.default ?? importedParts;
const C = importedConvert.default ?? importedConvert;
const Q = importedQuantity.default ?? importedQuantity;
const R = importedReadout.default ?? importedReadout;
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

let passed = 0, failed = 0;
const failures = [];
const ok = (condition, what) => { if (condition) passed++; else if (failed++ < 60) failures.push(what); };
const frame = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
const TOL = 1e-9;
const TAU = 2 * Math.PI;

async function open(context, query = '') {
  const page = await context.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') page.errors.push(m.text()); });
  await page.goto(`${base}/smith-chart/main${query}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-circuit]');
  await page.waitForFunction(() => window.location.search.includes('v=1'));
  await frame(page);
  return page;
}
const linked = async (page) => S.decodeCircuit(new URL(page.url()).search).circuit;

// ---------- the engine's side ----------

function engine(c) {
  const n = c.parts.length, parts = P.packParts(c.parts);
  const nodes = new Float64Array((n + 1) * N.NODE_STRIDE);
  N.evaluate(nodes, parts, n, c.loadR, c.loadX, c.z0, c.f0, c.f0);
  const gamma = [];
  const g = [0, 0];
  for (let k = 0; k <= n; k++) { N.nodeGamma(g, 0, nodes, k * N.NODE_STRIDE); gamma.push([g[0], g[1]]); }
  return { n, nodes, gamma };
}
// The locus a part's arc is drawn on: its own, but a λ/4 transformer's arc is its line of Zt from length 0.
function locusOf(c, p, s) {
  const loc = new Float64Array(G.LOCUS_STRIDE);
  if (p.kind === P.QUARTER) G.partLocus(loc, 0, P.LINE, p.value, s[0], s[1], c.z0, c.f0, c.f0);
  else G.partLocus(loc, 0, p.kind, p.zc ?? 0, s[0], s[1], c.z0, c.f0, c.f0);
  return loc;
}
const added = (c, p, v) => P.added(p.kind, v, p.zc ?? 0, c.f0, c.f0, c.z0);
const cdiv = (ar, ai, br, bi) => { const d = br * br + bi * bi; return [(ar * br + ai * bi) / d, (ai * br - ar * bi) / d]; };

// ---------- the page's side ----------

const readPath = (page) => page.evaluate(() => {
  const box = document.querySelector('[data-chart]'), v = box.smithChart;
  const attr = (sel, name) => [...document.querySelectorAll(sel)].map((e) => ({ i: Number(e.getAttribute(name)), t: e.style.transform, d: e.getAttribute('d'), on: !e.hidden, sel: e.hasAttribute('data-sel'), hot: e.hasAttribute('data-hot') }));
  return {
    fx: v.fx, fy: v.fy, fk: v.fk, cx: v.cx, cy: v.cy, k: v.k, w: v.w, h: v.h,
    arcs: attr('[data-arc]', 'data-arc'), arrows: attr('[data-arrow]', 'data-arrow'), nodes: attr('[data-node]', 'data-node'),
    halo: document.querySelector('[data-halo]').getAttribute('d'),
  };
});

/** A path's `d` as a list of commands with their end points in Γ and, for arcs, the midpoint of the drawn arc in Γ. */
function parseD(d, view) {
  const tok = d.match(/[MLA]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) ?? [];
  const toG = (u, w) => [u / view.fk + view.fx, view.fy - w / view.fk];
  const out = [];
  let i = 0, cmd = '', x = 0, y = 0;
  while (i < tok.length) {
    if (/[MLA]/i.test(tok[i])) cmd = tok[i++];
    if (cmd === 'M' || cmd === 'L') {
      x = Number(tok[i++]); y = Number(tok[i++]);
      out.push({ cmd, end: toG(x, y) });
    } else if (cmd === 'A') {
      let r = Number(tok[i++]); Number(tok[i++]); i++; const large = Number(tok[i++]), sweep = Number(tok[i++]);
      const x2 = Number(tok[i++]), y2 = Number(tok[i++]);
      // SVG 1.1 F.6.5 with rx = ry = r and no rotation, in world units (y down).
      const x1p = (x - x2) / 2, y1p = (y - y2) / 2, s2 = x1p * x1p + y1p * y1p;
      if (s2 > r * r) r = Math.sqrt(s2);
      const coef = (large !== sweep ? 1 : -1) * Math.sqrt(Math.max(0, (r * r - s2) / s2));
      const cxp = coef * y1p, cyp = -coef * x1p;
      const ccx = cxp + (x + x2) / 2, ccy = cyp + (y + y2) / 2;
      const t1 = Math.atan2((y1p - cyp) / r, (x1p - cxp) / r), t2 = Math.atan2((-y1p - cyp) / r, (-x1p - cxp) / r);
      let dt = t2 - t1;
      if (sweep === 0 && dt > 0) dt -= TAU;
      if (sweep === 1 && dt < 0) dt += TAU;
      const tm = t1 + dt / 2;
      out.push({ cmd, sweep, large, turn: dt, end: toG(x2, y2), mid: toG(ccx + r * Math.cos(tm), ccy + r * Math.sin(tm)) });
      x = x2; y = y2;
    } else break;
  }
  return out;
}
const screenToG = (view, x, y) => [view.cx + (x - view.w / 2) / view.k, view.cy - (y - view.h / 2) / view.k];
// The marks are HTML elements placed by a CSS transform, which the browser keeps to about 6 significant digits.
const parseT = (t) => { const m = /translate\(([-\d.e+]+)px,\s*([-\d.e+]+)px\)(?:\s*rotate\(([-\d.e+]+)deg\))?/.exec(t ?? ''); return m ? [Number(m[1]), Number(m[2]), Number(m[3] ?? 0)] : null; };
const PX_TOL = 0.01;

/** Every check of the path against the engine for the circuit in the page's link. */
async function checkPath(page, what) {
  await frame(page);
  const c = await linked(page);
  const e = engine(c), view = await readPath(page);
  ok(view.arcs.length === e.n && view.nodes.length === e.n + 1 && view.arrows.length === e.n, `${what}: ${view.arcs.length} arcs, ${view.nodes.length} markers for ${e.n} parts`);
  let arrows = 0;
  for (let i = 0; i < e.n; i++) {
    const p = c.parts[i], s = e.gamma[i], t = e.gamma[i + 1], name = `${what}, part ${i + 1} ${S.KIND_NAMES[p.kind]} ${p.value}`;
    const a = view.arcs.find((x) => x.i === i);
    if (!a) { ok(false, `${name}: no arc`); continue; }
    const cmds = parseD(a.d, view);
    if (!cmds.length) { ok(false, `${name}: empty path`); continue; }
    const first = cmds[0].end, last = cmds[cmds.length - 1].end;
    ok(Math.hypot(first[0] - s[0], first[1] - s[1]) <= TOL, `${name}: starts at node ${i} (${first} vs ${s})`);
    ok(Math.hypot(last[0] - t[0], last[1] - t[1]) <= TOL, `${name}: ends at node ${i + 1} (${last} vs ${t})`);
    const loc = locusOf(c, p, s), mode = loc[G.L_MODE];
    const arcsA = cmds.filter((x) => x.cmd === 'A'), lines = cmds.filter((x) => x.cmd === 'L');
    const res = (g) => Math.abs(G.circleResidual(loc, G.L_A, g[0], g[1]));
    if (mode === G.LOCUS_FIXED || Math.hypot(t[0] - s[0], t[1] - s[1]) === 0 && p.kind !== P.LINE && p.kind !== P.QUARTER) {
      ok(cmds.length <= 2 && !arcsA.length, `${name}: no movement, drawn as a point (${a.d.slice(0, 60)})`);
      continue;
    }
    for (const x of arcsA) ok(res(x.mid) <= TOL, `${name}: arc midpoint on the locus (residual ${res(x.mid)})`);
    if (lines.length > 1) for (const x of lines) ok(res(x.end) <= TOL, `${name}: polyline vertex on the locus (residual ${res(x.end)})`);
    if (lines.length === 1 && !arcsA.length) {
      const m = [(s[0] + t[0]) / 2, (s[1] + t[1]) / 2];
      ok(res(m) * view.fk <= 0.03, `${name}: drawn as its chord only where the arc is flat (${res(m) * view.fk} px)`);
    }
    // The side and the direction of travel.
    const probe = arcsA.length ? arcsA[arcsA.length - 1].mid : lines.length > 1 ? lines[lines.length >> 1].end : null;
    const aEnd = added(c, p, p.value);
    if (p.kind === P.LINE || p.kind === P.QUARTER) {
      const turns = 2 * (p.kind === P.LINE ? p.value : 0.25), whole = Math.floor(turns), rest = turns - whole;
      // Drawn clockwise (positive in SVG's downward y) through whole + rest turns about the circle: whole full turns.
      const drawn = arcsA.reduce((acc, x) => acc + x.turn, 0) / TAU;
      ok(arcsA.every((x) => x.sweep === 1), `${name}: every piece clockwise`);
      ok(rest > 0 ? Math.floor(drawn) === whole && drawn - whole > 1e-12 : Math.abs(drawn - whole) < 1e-9, `${name}: ${drawn} turns drawn for ${turns} turns of the line`);
      if (rest > 0 && probe) {
        const zn = (p.kind === P.LINE ? p.zc : p.value) / c.z0, B = (zn - 1) / (zn + 1);
        const own = (g) => { const o = cdiv(g[0] - B, g[1], 1 - B * g[0], -B * g[1]); return Math.atan2(o[1], o[0]); };
        let back = (own(s) - own(probe)) % TAU; if (back < 0) back += TAU;
        ok(back > 0 && back < TAU * rest, `${name}: the remaining arc runs clockwise in the line's own chart (${back} of ${TAU * rest})`);
      }
    } else if (probe) {
      const aMid = added(c, p, G.locusValue(loc, 0, probe[0], probe[1], P.isStub(p.kind) ? NaN : p.value));
      const sign = Math.abs(aEnd) === Infinity && P.isStub(p.kind) ? 1 : Math.sign(aEnd);
      ok(Math.sign(aMid) === sign && (Math.abs(aEnd) === Infinity || Math.abs(aMid) < Math.abs(aEnd) * (1 + 1e-9)),
        `${name}: the arc lies between no effect and the value (${P.ADDS[p.kind]} ${aMid} of ${aEnd})`);
    }
    // The arrow: on the arc, pointing the way the node moves as the value grows.
    const w = view.arrows.find((x) => x.i === i), at = w && w.on ? parseT(w.t) : null;
    if (!at) continue;
    arrows++;
    const g0 = screenToG(view, at[0], at[1]);
    ok(res(g0) * view.k <= PX_TOL, `${name}: arrow on the locus (${res(g0) * view.k} px)`);
    // The arrow's point is rounded by CSS to ~0.005 px: step from its value's exact point on the locus.
    const g1 = [0, 0], gp = [0, 0];
    if (mode === G.LOCUS_LINE) {
      const v0 = G.locusValue(loc, 0, g0[0], g0[1], NaN);
      G.locusPoint(gp, 0, loc, 0, v0);
      G.locusPoint(g1, 0, loc, 0, v0 + 1e-6);
    } else {
      const v0 = G.locusValue(loc, 0, g0[0], g0[1], P.isStub(p.kind) ? NaN : p.value), aP = added(c, p, v0);
      const sign = Math.abs(aEnd) === Infinity && P.isStub(p.kind) ? 1 : Math.sign(aEnd);
      G.locusPoint(gp, 0, loc, 0, v0);
      G.locusPoint(g1, 0, loc, 0, P.valueFor(p.kind, aP + sign * 1e-6 * (1 + Math.abs(aP)), p.zc ?? 0, c.f0, c.f0, c.z0));
    }
    const dx = g1[0] - gp[0], dy = -(g1[1] - gp[1]), th = (at[2] * Math.PI) / 180;
    const cos = (dx * Math.cos(th) + dy * Math.sin(th)) / Math.hypot(dx, dy);
    ok(cos > 0.999, `${name}: arrow along the direction of travel (cos ${cos})`);
  }
  for (let k = 0; k <= e.n; k++) {
    const m = view.nodes.find((x) => x.i === k), at = m && m.on ? parseT(m.t) : null;
    if (!at) continue;
    const g = screenToG(view, at[0], at[1]);
    ok(Math.hypot(g[0] - e.gamma[k][0], g[1] - e.gamma[k][1]) * view.k <= PX_TOL, `${what}: marker ${k} on its node`);
  }
  await checkTable(page, c, what);
  return { c, e, view, arrows };
}

const num = (v, unit = '') => Q.formatAmount(v, unit, 4, true);
async function checkTable(page, c, what) {
  const { metrics } = N.evaluateCircuit(c);
  const rows = await page.evaluate(() => [...document.querySelectorAll('[data-node-row]')].map((r) => Object.fromEntries([...r.querySelectorAll('[data-v]')].map((e) => [e.dataset.v, e.textContent]))));
  let same = rows.length === c.parts.length + 1, bad = '';
  for (let k = 0; k <= c.parts.length && same; k++) {
    const m = k * N.METRIC_STRIDE;
    const want = { z: R.complexText(metrics[m + N.M_ZR], metrics[m + N.M_ZI], ''), gamma: `${num(metrics[m + N.M_MAG])} ∠ ${num(C.toDegrees(metrics[m + N.M_ANGLE]))}°`, vswr: num(metrics[m + N.M_VSWR]), rl: num(metrics[m + N.M_RL], 'dB') };
    for (const key of Object.keys(want)) if (rows[k][key] !== want[key]) { same = false; bad = `node ${k} ${key}: ${rows[k][key]} vs ${want[key]}`; }
  }
  ok(same, `${what}: node table equals the engine (${bad || rows.length})`);
  const dist = await page.textContent('[data-goal-distance]');
  ok(dist === num(metrics[c.parts.length * N.METRIC_STRIDE + N.M_MAG]), `${what}: distance to the goal ${dist}`);
}

// ---------- random circuits ----------

let seed = 0x5eed32;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const logU = (lo, hi) => lo * Math.exp(rnd() * Math.log(hi / lo));
function randomPart(kind, c) {
  const zc = 20 + rnd() * 100;
  switch (kind) {
    case P.LINE: return { kind, value: rnd() * 1.2, zc };
    case P.STUB_OPEN: case P.STUB_SHORT: return { kind, value: rnd() * 0.5, zc };
    case P.QUARTER: return { kind, value: 20 + rnd() * 130, zc: 0 };
    default: {
      const sign = P.REACH_HI[kind] > 0 ? 1 : -1;
      return { kind, value: P.valueFor(kind, sign * logU(0.05, 20), 0, c.f0, c.f0, c.z0), zc: 0 };
    }
  }
}
function randomCircuit(i) {
  const c = { z0: [50, 75, 100][i % 3], f0: logU(1e6, 1e10), loadR: logU(2, 500), loadX: (rnd() - 0.5) * 400, parts: [] };
  if (i === 3) { c.loadR = Infinity; c.loadX = 0; }
  if (i === 4) { c.loadR = 0; c.loadX = 0; }
  if (i === 5) c.loadR = 0;
  const kinds = [i % 10, (i + 3) % 10, (i + 7) % 10];
  const extra = 1 + Math.floor(rnd() * 4);
  for (let j = 0; j < extra; j++) kinds.push(Math.floor(rnd() * 10));
  for (const kind of kinds) c.parts.push(randomPart(kind, c));
  if (i === 0) c.parts.splice(1, 0, { kind: P.LINE, value: 0.8, zc: 70 }); // 1.6 turns
  if (i === 1) c.parts.push({ kind: P.SERIES_L, value: 0, zc: 0 }, { kind: P.SERIES_C, value: Infinity, zc: 0 }, { kind: P.SHUNT_C, value: 0, zc: 0 }, { kind: P.SHUNT_L, value: Infinity, zc: 0 });
  if (i === 2) c.parts.push({ kind: P.SERIES_R, value: Infinity, zc: 0 }, { kind: P.SHUNT_R, value: 0, zc: 0 }, { kind: P.LINE, value: 0, zc: 50 });
  if (i === 6) c.parts.push({ kind: P.SERIES_C, value: 0, zc: 0 }, { kind: P.SHUNT_L, value: 0, zc: 0 });
  if (i === 7) c.parts.push({ kind: P.STUB_SHORT, value: 0, zc: 60 }, { kind: P.STUB_OPEN, value: 0.25, zc: 40 }, { kind: P.LINE, value: 0.5, zc: 35 });
  return c;
}

let timesOut = [];
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: 'light' });
  let page = await open(context);
  // ---------- the start circuit, at the whole chart and zoomed in ----------
  let r = await checkPath(page, 'start');
  ok(r.arrows === 2, `start: both arrows shown (${r.arrows})`);
  ok(r.view.arcs.every((a) => a.d.includes('A') && !a.d.includes('L')), 'start: both arcs are circle arcs');
  await page.evaluate(() => { const v = document.querySelector('[data-chart]').smithChart; v.setView(-0.15, 0.3, v.kFit * 6); });
  r = await checkPath(page, 'start at 6×');
  await page.evaluate(() => { const v = document.querySelector('[data-chart]').smithChart; v.setView(0.2, -0.1, v.kFit * 300); });
  await checkPath(page, 'start at 300×');
  await page.evaluate(() => document.querySelector('[data-chart]').smithChart.fit());

  // ---------- 20 random circuits ----------
  const seen = new Set();
  for (let i = 0; i < 20; i++) {
    const c = randomCircuit(i);
    for (const p of c.parts) seen.add(p.kind);
    ok(!S.circuitProblem(c), `random ${i}: usable (${S.circuitProblem(c)})`);
    await page.goto(`${base}/smith-chart/main?${S.encodeCircuit(c)}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-arc]', { state: 'attached' });
    const res = await checkPath(page, `random ${i}`);
    ok(S.sameCircuit(res.c, c), `random ${i}: the link holds the circuit`);
  }
  ok(seen.size === 10, `every part kind drawn (${seen.size})`);
  ok(page.errors.length === 0, `no errors: ${page.errors.join(' | ')}`);

  // ---------- selection: mouse ----------
  page = await open(context);
  const sel = () => page.evaluate(() => ({
    arcs: [...document.querySelectorAll('[data-arc][data-sel]')].map((e) => e.dataset.arc),
    nodes: [...document.querySelectorAll('[data-node][data-sel]')].map((e) => e.dataset.node),
    hotArcs: [...document.querySelectorAll('[data-arc][data-hot]')].map((e) => e.dataset.arc),
    hotNodes: [...document.querySelectorAll('[data-node][data-hot]')].map((e) => e.dataset.node),
    tile: document.querySelector('[data-tile][aria-pressed="true"]')?.dataset.tile ?? null,
    row: document.querySelector('[data-node-row][aria-pressed="true"]')?.dataset.nodeRow ?? null,
    halo: document.querySelector('[data-halo]').getAttribute('d'),
    pick: document.querySelector('[data-chart]').hasAttribute('data-pick'),
  }));
  const arcD = (i) => page.evaluate((j) => document.querySelector(`[data-arc="${j}"]`).getAttribute('d'), i);
  let s = await sel();
  ok(s.arcs.join() === '1' && s.tile === '1' && s.halo === await arcD(1), `start: the last part is selected on the chart and in the strip (${JSON.stringify(s)})`);
  await page.click('[data-tile="0"]'); await frame(page);
  s = await sel();
  ok(s.arcs.join() === '0' && s.tile === '0' && s.halo === await arcD(0) && !s.nodes.length, `mouse: tile 1 selects arc 1 (${JSON.stringify(s)})`);
  await page.click('[data-node-row="1"]'); await frame(page);
  s = await sel();
  ok(s.nodes.join() === '1' && s.row === '1' && !s.arcs.length && s.halo === '', `mouse: table row selects marker 1 (${JSON.stringify(s)})`);
  await page.click('[data-node-row="1"]'); await frame(page);
  s = await sel();
  ok(!s.nodes.length && s.row === null && s.arcs.join() === '0', `mouse: the row again clears the node (${JSON.stringify(s)})`);
  // On the chart: the box's px of an arrow (the arc's midpoint) and of a marker.
  const where = (selector) => page.evaluate((q) => {
    const box = document.querySelector('[data-chart]').getBoundingClientRect(), m = /translate\(([-\d.e+]+)px,\s*([-\d.e+]+)px/.exec(document.querySelector(q).style.transform);
    return [box.left + Number(m[1]), box.top + Number(m[2])];
  }, selector);
  let [x, y] = await where('[data-arrow="1"]');
  await page.mouse.move(x, y); await frame(page);
  s = await sel();
  ok(s.hotArcs.join() === '1' && s.pick, `mouse: hover on arc 2 highlights it (${JSON.stringify(s)})`);
  await page.mouse.click(x, y); await frame(page);
  s = await sel();
  ok(s.arcs.join() === '1' && s.tile === '1', `mouse: a click on arc 2 selects part 2 (${JSON.stringify(s)})`);
  [x, y] = await where('[data-node="0"]');
  await page.mouse.click(x, y); await frame(page);
  s = await sel();
  ok(s.nodes.join() === '0' && s.row === '0', `mouse: a click on the load's marker selects it in the table (${JSON.stringify(s)})`);
  await page.mouse.move(5, 5); await frame(page);
  s = await sel();
  ok(!s.hotArcs.length && !s.hotNodes.length && !s.pick, `mouse: leaving clears the hover (${JSON.stringify(s)})`);
  await page.hover('[data-node-row="2"]'); await frame(page);
  s = await sel();
  ok(s.hotNodes.join() === '2', `mouse: hover on a table row highlights its marker (${JSON.stringify(s)})`);
  await page.hover('[data-tile="0"]'); await frame(page);
  s = await sel();
  ok(s.hotArcs.join() === '0', `mouse: hover on a tile highlights its arc (${JSON.stringify(s)})`);

  // ---------- selection: keyboard ----------
  const active = () => page.evaluate(() => document.activeElement?.dataset.nodeRow ?? document.activeElement?.tagName);
  await page.mouse.move(5, 5);
  await page.focus('[data-node-row="1"]');
  await page.keyboard.press('Enter'); await frame(page);
  s = await sel();
  ok(s.nodes.join() === '1' && s.row === '1', `keys: Enter on a row selects the node (${JSON.stringify(s)})`);
  await page.keyboard.press('Shift+Tab'); await frame(page);
  s = await sel();
  ok(s.hotNodes.join() === '0', `keys: focus on the row before highlights its marker (${JSON.stringify(s)}, focus ${await active()})`);
  await page.keyboard.press(' '); await frame(page);
  s = await sel();
  ok(s.nodes.join() === '0' && s.row === '0', `keys: Space selects it (${JSON.stringify(s)})`);
  await page.focus('[data-tile="1"]');
  await page.keyboard.press('ArrowRight'); await frame(page);
  s = await sel();
  ok(s.arcs.join() === '0' && s.tile === '0' && !s.nodes.length, `keys: an arrow in the strip moves the arc's highlight (${JSON.stringify(s)})`);
  ok(page.errors.length === 0, `no errors in the selection: ${page.errors.join(' | ')}`);
  await context.close();

  // ---------- selection: tap; narrow screens ----------
  for (const width of [320, 390]) {
    const scheme = width === 390 ? 'dark' : 'light';
    const ctx = await browser.newContext({ viewport: { width, height: 844 }, colorScheme: scheme, hasTouch: true, isMobile: true });
    const p = await open(ctx, '?v=1&z0=50&f0=100e6&zl=25:25&p=cs:31.83e-12,lp:79.58e-9,tl:0.3:75,so:0.1:50,rs:10,ls:20n,cp:5p,ss:0.2:60,qw:35,rp:200');
    const sw = await p.evaluate(() => ({ s: document.documentElement.scrollWidth, c: document.documentElement.clientWidth }));
    ok(sw.s <= sw.c, `no horizontal scroll at ${width} px (${sw.s} > ${sw.c})`);
    const closed = await p.evaluate(() => !document.querySelector('[data-nodes] details').open);
    ok(closed, `${width} px: the node table starts closed`);
    await p.click('[data-nodes] summary');
    const sw2 = await p.evaluate(() => ({ s: document.documentElement.scrollWidth, c: document.documentElement.clientWidth }));
    ok(sw2.s <= sw2.c, `no horizontal scroll at ${width} px with the table open (${sw2.s} > ${sw2.c})`);
    await p.evaluate(() => window.scrollTo(0, 0)); await frame(p);
    const target = await p.evaluate(() => {
      const box = document.querySelector('[data-chart]').getBoundingClientRect();
      const at = (e) => { const m = /translate\(([-\d.e+]+)px,\s*([-\d.e+]+)px/.exec(e.style.transform); return [Number(m[1]), Number(m[2])]; };
      const shown = (q) => [...document.querySelectorAll(q)].filter((e) => !e.hidden);
      const marks = shown('[data-node]').map(at);
      // The arrow farthest from every marker and from the other arcs' arrows (not the last part's: it starts selected).
      let best = null, bestD = -1;
      for (const e of shown('[data-arrow]')) {
        if (e.dataset.arrow === '9') continue;
        const [x, y] = at(e), dd = Math.min(...marks.map(([u, v]) => Math.hypot(u - x, v - y)));
        if (dd > bestD) { bestD = dd; best = { i: e.dataset.arrow, x: box.left + x, y: box.top + y, clear: dd }; }
      }
      return best;
    });
    await p.touchscreen.tap(target.x, target.y); await frame(p);
    const t = await p.evaluate(() => ({ arc: document.querySelector('[data-arc][data-sel]')?.dataset.arc, tile: document.querySelector('[data-tile][aria-pressed="true"]')?.dataset.tile }));
    ok(t.arc === target.i && t.tile === target.i, `${width} px: a tap on arc ${Number(target.i) + 1} selects it (${JSON.stringify(t)})`);
    ok(p.errors.length === 0, `${width} px: no errors: ${p.errors.join(' | ')}`);
    if (shots && width === 390) {
      mkdirSync(shots, { recursive: true });
      const ps = await open(ctx);
      await ps.screenshot({ path: join(shots, 'path-390-dark.png') });
    }
    await ctx.close();
  }

  // ---------- frame time while zooming a 10-part circuit ----------
  const timeCtx = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: 'light' });
  const TEN = '?v=1&z0=50&f0=100e6&zl=25:25&p=cs:31.83e-12,lp:79.58e-9,tl:0.3:75,so:0.1:50,rs:10,ls:20n,cp:5p,ss:0.2:60,qw:35,rp:200';
  let pt = await open(timeCtx, TEN);
  async function timing(rate) {
    const cdp = await pt.context().newCDPSession(pt);
    await cdp.send('Performance.enable');
    await cdp.send('Emulation.setCPUThrottlingRate', { rate });
    await pt.evaluate(() => document.querySelector('[data-chart]').smithChart.setView(0.1, 0.1, 0));
    await frame(pt);
    const task = async () => (await cdp.send('Performance.getMetrics')).metrics.find((m) => m.name === 'TaskDuration').value;
    const t0 = await task();
    const res = await pt.evaluate(() => new Promise((done) => {
      const box = document.querySelector('[data-chart]'), v = box.smithChart, layer = box.smithPath, rect = box.getBoundingClientRect();
      const x = rect.left + rect.width * 0.55, y = rect.top + rect.height * 0.45;
      const stamps = [], works = [], f0 = v.frames, b0 = v.grid.builds;
      let seen = layer.frames, events = 0;
      const start = performance.now();
      const tick = (t) => {
        stamps.push(t);
        if (layer.frames !== seen) { works.push(layer.lastMs); seen = layer.frames; }
        if (t - start < 2000) requestAnimationFrame(tick);
        else done({ stamps, works, frames: v.frames - f0, builds: v.grid.builds - b0, events });
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
    const iv = res.stamps.slice(1).map((t, i) => t - res.stamps[i]).sort((a, b) => a - b);
    const ws = res.works.slice().sort((a, b) => a - b);
    const q = (xs, f) => xs[Math.min(xs.length - 1, Math.floor(f * xs.length))];
    return { rate, ticks: res.stamps.length, frames: res.frames, builds: res.builds, pathFrames: res.works.length, intervalP95: q(iv, 0.95), lost: iv.reduce((a, t) => a + Math.max(0, Math.round(t / (1000 / 60)) - 1), 0), pathP50: q(ws, 0.5), pathP95: q(ws, 0.95), mainPerFrame: ((t1 - t0) * 1000) / res.stamps.length };
  }
  // The main thread per frame in dev mode drifts by ±0.5 ms between runs on this machine, so at 4× the path's own
  // share is measured as the difference to the same page with the path hidden, on fresh pages taken in turn.
  const median = (xs) => xs.slice().sort((a, b) => a - b)[xs.length >> 1];
  for (const rate of [1, 4]) {
    const runs = [], bare = [];
    for (let i = 0; i < 3; i++) {
      if (rate === 4) {
        await pt.close(); pt = await open(timeCtx, TEN);
        await pt.addStyleTag({ content: '[data-layer="path"], [data-layer="path-marks"] { display: none; }' });
        await timing(rate);
        bare.push(await timing(rate));
        await pt.close(); pt = await open(timeCtx, TEN);
        await timing(rate);
      }
      runs.push(await timing(rate));
    }
    runs.sort((a, b) => a.mainPerFrame - b.mainPerFrame);
    const t = runs[1];
    t.bare = rate === 4 ? median(bare.map((b) => b.mainPerFrame)) : NaN;
    t.bareP95 = rate === 4 ? median(bare.map((b) => b.intervalP95)) : NaN;
    t.bareLost = rate === 4 ? median(bare.map((b) => b.lost)) : NaN;
    timesOut.push(t);
    ok(t.pathFrames > 0.5 * t.ticks, `CPU ${rate}×: the path was placed in ${t.pathFrames} of ${t.ticks} frames`);
    // At 1× no frame may be dropped. At 4× each grid rebuild loses about one frame (BL52), so the frames lost are
    // counted against the rebuilds (a p95 of the interval lands on 17 or 33 ms by chance).
    if (rate === 1) ok(t.intervalP95 <= 17.5, `CPU ${rate}×: frame interval p95 ${t.intervalP95.toFixed(1)} ms`);
    else ok(t.lost <= t.builds + 1, `CPU ${rate}×: ${t.lost} frames lost with ${t.builds} grid rebuilds (${t.bareLost} with the path hidden)`);
    ok(t.pathP95 <= (rate === 1 ? 1 : 4), `CPU ${rate}×: path script p95 ${t.pathP95.toFixed(2)} ms`);
    ok(rate === 1 || t.mainPerFrame - t.bare <= 1.5, `CPU ${rate}×: the path adds ${(t.mainPerFrame - t.bare).toFixed(2)} ms of main thread per frame (${t.mainPerFrame.toFixed(2)} vs ${t.bare.toFixed(2)} hidden)`);
  }
  await checkPath(pt, '10 parts after zooming');
  ok(pt.errors.length === 0, `no errors while zooming: ${pt.errors.join(' | ')}`);
  await timeCtx.close();

  if (shots) {
    const wide = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light', deviceScaleFactor: 1000 / 1440 });
    const p = await open(wide);
    await p.screenshot({ path: join(shots, 'path-1440-light.png') });
    await wide.close();
  }
} catch (e) {
  ok(false, `the run stopped: ${e.stack ?? e}`);
}

await browser.close();
stopServer();
for (const failure of failures) console.log(`FAIL ${failure}`);
for (const t of timesOut) {
  console.log(`zoom 2 s with 10 parts at CPU ${t.rate}× (headless): ${t.ticks} frames, ${t.frames} chart updates, path placed in ${t.pathFrames}; interval p95 ${t.intervalP95.toFixed(1)} ms, ${t.lost} frames lost, ${t.builds} grid rebuilds; `
    + `path script p50 ${t.pathP50.toFixed(3)} / p95 ${t.pathP95.toFixed(3)} ms; main thread ${t.mainPerFrame.toFixed(2)} ms per frame`
    + (t.bare === t.bare ? ` (${t.bare.toFixed(2)} ms and interval p95 ${t.bareP95.toFixed(1)} ms with the path hidden)` : ''));
}
console.log(`circuit path: ${passed} of ${passed + failed} checks passed`);
process.exitCode = failed ? 1 : 0;
